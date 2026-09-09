/* LIFTING A DECLARATION OUT OF app.js.
 *
 * app.js is one file with no exports, so every script that wants to test or
 * reuse a function in it cuts that function out of the source by walking
 * brackets. That walker had been copy-pasted into fifteen scripts and got the
 * same thing wrong three separate times, always in the same shape: a `${`
 * inside a template literal reads as an opening brace, its `}` reads as the end
 * of the declaration, and half a function comes back -- which then fails to
 * parse with "Unexpected end of input" a long way from the cause.
 *
 * So it lives here once. It counts all three kinds of bracket AND steps over
 * strings, template literals, regex literals, and both kinds of comment.
 *
 *   import { lifter } from './lib/lift.mjs';
 *   const grab = lifter(new URL('../public/app.js', import.meta.url));
 *   const src = grab('function draftReplacement(stats){');
 *
 * Existing scripts still carry their own copies; this is where new ones should
 * come from, and where the old ones should migrate as they are touched.
 */
import fs from 'fs';

const BS = String.fromCharCode(92);      // a literal backslash
const TICK = String.fromCharCode(96);    // a literal backtick
const NL = String.fromCharCode(10);
const SLASH = String.fromCharCode(47);   // a literal forward slash

/* No single declaration in app.js comes close to this. A walk that passes it
 * has lost its place rather than found a long function, so it stops and says so
 * instead of handing back the rest of the file. */
const RUNAWAY = 20000;

const WORD = /[A-Za-z0-9_$]/;
const SPACE = /\s/;

/* WHEN IS A `/` A REGEX AND WHEN IS IT DIVISION? Only the preceding token can
 * say. After a value -- an identifier, a number, a `)`, a `]` -- it divides. In
 * expression position it opens a regex. These are the characters and the
 * keywords that leave us in expression position. */
const OPENERS = '(,=:[!&|?{;+-*%^~<>' + NL;
const KEYWORDS = new Set(['return', 'typeof', 'instanceof', 'in', 'of', 'new',
  'delete', 'void', 'case', 'do', 'else', 'yield', 'await', 'throw']);

function regexAllowed(src, prev) {
  if (prev < 0) return true;                       // start of input
  const c = src[prev];
  if (OPENERS.indexOf(c) >= 0) return true;
  if (WORD.test(c)) {
    let k = prev;
    while (k >= 0 && WORD.test(src[k])) k--;
    return KEYWORDS.has(src.slice(k + 1, prev + 1));
  }
  return false;
}

function skipQuote(src, i) {
  const q = src[i];
  let j = i + 1;
  while (j < src.length) {
    if (src[j] === BS) { j += 2; continue; }
    if (src[j] === q) return j + 1;
    j++;
  }
  return j;
}

/* A REGEX LITERAL IS NOT A COMMENT, and reading one as a comment is the fifth
 * distinct way this walker has been wrong. proxyLogo opens with a pattern that
 * matches an http(s) scheme, so it carries an escaped `//` in the middle of it.
 * That used to read as the start of a line comment: the walker skipped to
 * end-of-line, never saw the brace that closes the function, and never
 * rebalanced -- it returned the ~999,684 characters left in the file.
 *
 * A character class is the trap inside the trap: a `/` inside `[...]` does not
 * close the pattern. And a regex literal cannot span a newline, so a run that
 * reaches one was reading a division after all -- we say so by returning -1 and
 * let the caller treat the slash as an ordinary character. */
function skipRegex(src, i) {
  let j = i + 1, inClass = false;
  while (j < src.length) {
    const c = src[j];
    if (c === BS) { j += 2; continue; }
    if (c === NL) return -1;                       // not a regex after all
    if (inClass) { if (c === ']') inClass = false; j++; continue; }
    if (c === '[') { inClass = true; j++; continue; }
    if (c === SLASH) { j++; break; }
    j++;
  }
  while (j < src.length && WORD.test(src[j])) j++;         // flags
  return j;
}

function skipTemplate(src, i) {
  let j = i + 1;
  while (j < src.length) {
    if (src[j] === BS) { j += 2; continue; }
    if (src[j] === TICK) return j + 1;
    if (src[j] === '$' && src[j + 1] === '{') {
      let depth = 1, prev = -1;
      j += 2;
      while (j < src.length && depth > 0) {
        const c = src[j];
        if (c === BS) { j += 2; continue; }
        if (c === "'" || c === '"') { prev = j; j = skipQuote(src, j); continue; }
        if (c === TICK) { prev = j; j = skipTemplate(src, j); continue; }
        if (c === SLASH && regexAllowed(src, prev)) {
          const e = skipRegex(src, j);
          if (e >= 0) { prev = j; j = e; continue; }
        }
        if (c === '{') depth++; else if (c === '}') depth--;
        if (!SPACE.test(c)) prev = j;
        j++;
      }
      continue;
    }
    j++;
  }
  return j;
}

/* Reads the file once and returns a grab(startsWith) bound to it.
 *
 * WHERE A DECLARATION ENDS DEPENDS ON WHAT KIND IT IS, and conflating the two
 * is the fourth distinct way this walker has been wrong.
 *
 * A `function f(){...}` ends at the brace that closes its body.
 *
 * A `const x = ...;` ends at its SEMICOLON, and only at its semicolon. Stopping
 * at the first bracket group that closes at depth zero looks right for
 * `const FOO=[...]` and is silently wrong for anything whose value merely
 * CONTAINS a balanced group before the statement is over:
 *
 *     const liveMKey=(a,b)=>[a,b].sort().join('~');
 *
 * The `]` after `[a,b]` closes at depth zero, so the old rule handed back
 * `const liveMKey=(a,b)=>[a,b]` — a function that returns an array instead of a
 * key. It parses, it runs, and every matchup key it produces is wrong.
 */
export function lifter(fileUrlOrPath) {
  const src = fs.readFileSync(fileUrlOrPath, 'utf8').split(String.fromCharCode(13)).join('');
  return function grab(startsWith) {
    const i = src.indexOf(startsWith);
    if (i < 0) throw new Error('lift: not found in source: ' + startsWith);
    const isBlock = /^\s*(export\s+)?(async\s+)?(function|class)\b/.test(startsWith);
    let j = i, depth = 0, opened = false, prev = -1;
    while (j < src.length) {
      if (j - i > RUNAWAY) throw runaway(startsWith, j - i, false);
      const c = src[j];
      if (c === "'" || c === '"') { prev = j; j = skipQuote(src, j); continue; }
      if (c === TICK) { prev = j; j = skipTemplate(src, j); continue; }
      if (c === SLASH && src[j + 1] === SLASH) { const e = src.indexOf(NL, j); j = e < 0 ? src.length : e; continue; }
      if (c === SLASH && src[j + 1] === '*') { const e = src.indexOf('*/', j); j = e < 0 ? src.length : e + 2; continue; }
      if (c === SLASH && regexAllowed(src, prev)) {
        const e = skipRegex(src, j);
        if (e >= 0) { prev = j; j = e; continue; }
      }
      if (c === '(' || c === '[' || c === '{') { depth++; if (c === '{') opened = true; prev = j; j++; continue; }
      if (c === ')' || c === ']' || c === '}') {
        depth--; prev = j; j++;
        /* a function body is done the moment its own brace closes */
        if (isBlock && opened && depth === 0 && c === '}') return src.slice(i, j);
        continue;
      }
      /* everything else runs to its statement terminator */
      if (!isBlock && c === ';' && depth === 0) return src.slice(i, j + 1);
      if (!SPACE.test(c)) prev = j;
      j++;
    }
    throw runaway(startsWith, j - i, true);
  };
}

/* A LIFT THAT LOSES ITS PLACE HAS TO SAY SO. It used to return the tail of the
 * file instead, which fails later and somewhere else: the proxyLogo runaway
 * came back as 999,684 characters that then died on "Unexpected end of input"
 * inside the assembled harness. Naming the marker here is the difference
 * between a five-minute fix and an afternoon. */
function runaway(startsWith, len, eof) {
  return new Error('lift: ' + (eof ? 'reached the end of the source' : 'ran past ' + RUNAWAY + ' characters')
    + ' without closing the declaration that starts "' + startsWith + '"'
    + ' (consumed ' + len + ' characters). The walker has lost its place:'
    + ' something in this declaration reads to it as a bracket, quote, comment'
    + ' or regex that it is not.');
}

/* Builds a callable module out of lifted declarations. `names` are passed to
   grab in order; `exports` is the list of identifiers to hand back. */
export function assemble(grab, names, exports, prelude = '') {
  const body = names.map(n => grab(n)).join(NL);
  return new Function(prelude + NL + body + NL + 'return { ' + exports.join(', ') + ' };')();
}
