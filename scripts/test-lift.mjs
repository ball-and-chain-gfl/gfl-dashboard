/* THE BRACKET WALKER ITSELF.
 *
 * Every other suite in here builds its subject by cutting declarations out of
 * app.js with lift.mjs, so a walker that loses its place does not fail as a
 * walker bug -- it fails as "Unexpected end of input" inside whichever harness
 * happened to ask for the bad lift. This suite tests the walker directly, on
 * fixtures small enough to reason about, so that the next way it goes wrong
 * says so here first.
 *
 * The five ways it has gone wrong so far, each of which has a test below:
 *
 *   1. a `${` inside a template literal read as an opening brace
 *   2. a `const x = ...;` stopped at the first bracket closing at depth zero
 *      instead of at its semicolon (the liveMKey bug)
 *   3. a regex literal read as a line comment, because the pattern carried an
 *      escaped `//` -- this is proxyLogo, and it ran off the end of the file
 *   4. ...and every one of those failed SILENTLY, by returning the rest of the
 *      file rather than by saying it had lost its place
 *
 * Fixtures are written to real files because that is what lifter() reads.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { lifter } from './lib/lift.mjs';

let pass = 0, fail = 0;
const nl = String.fromCharCode(10);
const BS = String.fromCharCode(92);      // a literal backslash
const TICK = String.fromCharCode(96);    // a literal backtick

function ok(name, cond, detail) {
  console.log((cond ? '  PASS  ' : '  FAIL  ') + name);
  if (!cond) { if (detail !== undefined) console.log('        ' + detail); fail++; } else pass++;
}

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'gfl-lift-'));
let seq = 0;
/* a grab() bound to a throwaway source file */
function on(lines) {
  const f = path.join(DIR, 'fixture' + (++seq) + '.js');
  fs.writeFileSync(f, lines.join(nl));
  return lifter(f);
}
/* the message if it threw, null if it did not */
function threw(fn) {
  try { fn(); return null; } catch (e) { return e.message; }
}

console.log('1. THE RUNAWAY THAT STARTED THIS: proxyLogo OUT OF THE REAL app.js');
{
  const grab = lifter(new URL('../public/app.js', import.meta.url));
  const src = grab('function proxyLogo(url){');

  /* the bug returned ~999,684 characters -- the whole rest of the file */
  ok('it comes back as a function rather than as the rest of app.js',
     src.length < 400, src.length + ' characters');
  ok('it ends at its own closing brace', src.slice(-1) === '}');
  ok('it kept the scheme test whose escaped slashes caused the runaway',
     src.indexOf('.test(url)') > 0);

  /* length alone would pass on half a function, so build it and run it */
  const fn = new Function('const BASE="/api/espn";' + nl + src + nl + 'return proxyLogo;')();
  ok('the lifted function builds and is callable', typeof fn === 'function');
  ok('it still rejects something that is not a url', fn('nonsense') === null);
  ok('it still routes an https url through the proxy',
     String(fn('https://x.test/a.png')).indexOf('/api/espn?type=logo') === 0);
  ok('it still upgrades http to https before proxying',
     decodeURIComponent(String(fn('http://x.test/a.png'))).indexOf('https://x.test/a.png') > 0);
}

console.log(nl + '2. A REGEX LITERAL IS NOT A COMMENT');
{
  /* the proxyLogo shape: an escaped // in the middle of the pattern. Read as a
     line comment it swallows the closing brace and everything after it. */
  const grab = on([
    'function f(x){',
    '  return /^https?:' + BS + '/' + BS + '//i.test(x);',
    '}',
    'const after=1;',
  ]);
  const src = grab('function f(x){');
  ok('an escaped // inside a pattern does not start a comment', src.slice(-1) === '}');
  ok('and the lift stops before the next declaration', src.indexOf('after') < 0, src);
}
{
  /* a regex on the far side of a `return`, which is expression position even
     though the character before it is a word character */
  const grab = on(['function f(s){', '  return /a' + BS + '/b/.test(s);', '}', 'const after=1;']);
  ok('a regex directly after `return` is recognised',
     grab('function f(s){').indexOf('after') < 0);
}

console.log(nl + '3. A `/` INSIDE A CHARACTER CLASS DOES NOT CLOSE THE REGEX');
{
  /* [{] is the discriminating case: if the walker does not know this is a
     regex, that brace goes on the depth count and the function never balances */
  const grab = on(['function f(s){', '  if(/[{]/.test(s)) return 1;', '  return 0;', '}', 'const after=1;']);
  const src = grab('function f(s){');
  ok('an unmatched brace inside a character class is not counted', src.slice(-1) === '}');
  ok('the whole body came back', src.indexOf('return 0') > 0, src);
}
{
  const grab = on(['function f(s){', '  return /[/]/.test(s);', '}', 'const after=1;']);
  ok('a slash inside a character class does not end the pattern',
     grab('function f(s){').indexOf('after') < 0);
}

console.log(nl + '4. DIVISION IS STILL DIVISION');
{
  /* the other half of the job: reading `a/b` as a regex would swallow whatever
     lies between the two slashes, braces included */
  const grab = on(['function f(a,b,c){', '  const n = a/b/c;', '  const o = {x:1};', '  return n + o.x;', '}', 'const after=1;']);
  const src = grab('function f(a,b,c){');
  ok('a chain of divisions is not read as a regex', src.indexOf('return n + o.x') > 0, src);
  ok('and the function still ends at its own brace', src.slice(-1) === '}');
  ok('it builds and divides', new Function(src + nl + 'return f;')()(12, 2, 3) === 3);
}
{
  const grab = on(['function f(a){', '  return (a)/2;', '}', 'const after=1;']);
  ok('a divide directly after a `)` is not a regex',
     grab('function f(a){').indexOf('after') < 0);
}

console.log(nl + '5. A REGEX INSIDE A TEMPLATE SUBSTITUTION');
{
  /* proxyLogo carries exactly this: a .replace(/.../) inside a ${} */
  const grab = on([
    'function f(s){',
    '  return ' + TICK + '${s.replace(/a' + BS + '/b/g,' + "'-'" + ')}' + TICK + ';',
    '}',
    'const after=1;',
  ]);
  const src = grab('function f(s){');
  ok('a regex inside ${} does not start a comment', src.indexOf('after') < 0, src);
  ok('it builds and substitutes', new Function(src + nl + 'return f;')()('xa/by') === 'x-y');
}

console.log(nl + '6. THE EARLIER BUGS STAY FIXED');
{
  /* bug 1: a `${` read as an opening brace, its `}` as the end of the lift */
  const grab = on([
    'function f(x){',
    '  return ' + TICK + '${x?' + "'{'" + ':' + "''" + '}' + TICK + ';',
    '}',
    'const after=1;',
  ]);
  const src = grab('function f(x){');
  ok('a ${} in a template does not end the declaration', src.slice(-1) === '}', src);
  ok('nor does a brace inside a string inside it',
     new Function(src + nl + 'return f;')()(true) === '{');
}
{
  /* bug 2: liveMKey. The `]` after [a,b] closes at depth zero, but the
     statement is not over until its semicolon. */
  const grab = on(["const k=(a,b)=>[a,b].sort().join('~');", 'const after=1;']);
  const src = grab('const k=');
  ok('a const runs to its semicolon, not to the first balanced bracket',
     src.slice(-1) === ';', src);
  ok('so it is still a function that makes a key',
     new Function(src + nl + 'return k;')()('b', 'a') === 'a~b');
}

console.log(nl + '7. A LIFT THAT LOSES ITS PLACE SAYS SO');
{
  /* it used to return the tail of the file, which fails later and elsewhere */
  const grab = on(['function broken(){', '  if(x){', '    return 1;']);
  const msg = threw(() => grab('function broken(){'));
  ok('an unbalanced declaration throws rather than returning the tail', msg !== null);
  ok('the message says it ran out of source', String(msg).indexOf('end of the source') > 0, msg);
  ok('and it names the marker that was being lifted',
     String(msg).indexOf('function broken(){') > 0, msg);
}
{
  /* far more source after the marker than any real declaration holds */
  const grab = on(['function big(){', 'x'.repeat(30000), '}']);
  const msg = threw(() => grab('function big(){'));
  ok('a walk longer than any real declaration stops at the cap', msg !== null);
  ok('the message says how far it got', String(msg).indexOf('20000') > 0, msg);
  ok('and it names the marker', String(msg).indexOf('function big(){') > 0, msg);
}
{
  const grab = on(['const x = 1;']);
  ok('a marker that is not there still says so plainly',
     String(threw(() => grab('const nope='))).indexOf('not found') > 0);
}

console.log(nl + '8. THE REGEX-BEARING FUNCTIONS THE OTHER SUITES ALREADY LIFT');
{
  /* these come out of the real app.js and are lifted by test-weeks and
     test-bank-egg today; none of their patterns carries a //, which is why
     nothing was broken before the fix, and they must stay whole after it */
  const grab = lifter(new URL('../public/app.js', import.meta.url));
  for (const m of ['function motwChosen(){', 'function bucksEpoch(){']) {
    const src = grab(m);
    ok(m + ' still ends at its own brace', src.slice(-1) === '}');
    ok(m + ' is a plausible size', src.length > 20 && src.length < 4000, src.length + ' characters');
  }
}

fs.rmSync(DIR, { recursive: true, force: true });

console.log(nl + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
