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

/* Reads the file once and returns a grab(startsWith) bound to it. The returned
   slice runs from the match to the close of its first bracket group, or to the
   first top-level semicolon for a plain `const x = ...;`. */
export function lifter(fileUrlOrPath) {
  const src = fs.readFileSync(fileUrlOrPath, 'utf8').split(String.fromCharCode(13)).join('');
  return function grab(startsWith) {
    const i = src.indexOf(startsWith);
    if (i < 0) throw new Error('lift: not found in source: ' + startsWith);
    let j = i, depth = 0;
    while (j < src.length) {
      const c = src[j];
      if (c === "'" || c === '"') { j = skipQuote(src, j); continue; }
      if (c === TICK) { j = skipTemplate(src, j); continue; }
      if (c === '/' && src[j + 1] === '/') { const e = src.indexOf(NL, j); j = e < 0 ? src.length : e; continue; }
      if (c === '/' && src[j + 1] === '*') { const e = src.indexOf('*/', j); j = e < 0 ? src.length : e + 2; continue; }
      if (c === '(' || c === '[' || c === '{') { depth++; j++; continue; }
      if (c === ')' || c === ']' || c === '}') {
        depth--; j++;
        if (depth === 0 && (c === '}' || c === ']')) return src.slice(i, j);
        continue;
      }
      if (c === ';' && depth === 0) return src.slice(i, j + 1);
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
