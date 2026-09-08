/* LIFTING A DECLARATION OUT OF app.js.
 *
 * app.js is one file with no exports, so every script that wants to test or
 * reuse a function in it cuts that function out of the source by walking
 * brackets. That walker had been copy-pasted into five scripts and got the same
 * thing wrong three separate times, always in the same shape: a `${` inside a
 * template literal reads as an opening brace, its `}` reads as the end of the
 * declaration, and half a function comes back -- which then fails to parse with
 * "Unexpected end of input" a long way from the cause.
 *
 * So it lives here once. It counts all three kinds of bracket AND steps over
 * strings, template literals, and both kinds of comment.
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

function skipTemplate(src, i) {
  let j = i + 1;
  while (j < src.length) {
    if (src[j] === BS) { j += 2; continue; }
    if (src[j] === TICK) return j + 1;
    if (src[j] === '$' && src[j + 1] === '{') {
      let depth = 1; j += 2;
      while (j < src.length && depth > 0) {
        const c = src[j];
        if (c === BS) { j += 2; continue; }
        if (c === "'" || c === '"') { j = skipQuote(src, j); continue; }
        if (c === TICK) { j = skipTemplate(src, j); continue; }
        if (c === '{') depth++; else if (c === '}') depth--;
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
    let j = i, depth = 0, opened = false;
    while (j < src.length) {
      const c = src[j];
      if (c === "'" || c === '"') { j = skipQuote(src, j); continue; }
      if (c === TICK) { j = skipTemplate(src, j); continue; }
      if (c === '/' && src[j + 1] === '/') { const e = src.indexOf(NL, j); j = e < 0 ? src.length : e; continue; }
      if (c === '/' && src[j + 1] === '*') { const e = src.indexOf('*/', j); j = e < 0 ? src.length : e + 2; continue; }
      if (c === '(' || c === '[' || c === '{') { depth++; if (c === '{') opened = true; j++; continue; }
      if (c === ')' || c === ']' || c === '}') {
        depth--; j++;
        /* a function body is done the moment its own brace closes */
        if (isBlock && opened && depth === 0 && c === '}') return src.slice(i, j);
        continue;
      }
      /* everything else runs to its statement terminator */
      if (!isBlock && c === ';' && depth === 0) return src.slice(i, j + 1);
      j++;
    }
    return src.slice(i, j);
  };
}

/* Builds a callable module out of lifted declarations. `names` are passed to
   grab in order; `exports` is the list of identifiers to hand back. */
export function assemble(grab, names, exports, prelude = '') {
  const body = names.map(n => grab(n)).join(NL);
  return new Function(prelude + NL + body + NL + 'return { ' + exports.join(', ') + ' };')();
}
