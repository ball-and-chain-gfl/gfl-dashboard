/* DOES app.js ACTUALLY RUN?
 *
 * Every other suite in here lifts functions out of app.js by string match and
 * runs them in a harness. That proves the functions work. It does not prove the
 * FILE works, and those are different things — a harness declares its stubs in
 * whatever order it likes, so it will happily run a function whose real
 * neighbours are in the wrong order on disk.
 *
 * That gap shipped once. schedWkSd started life as
 *
 *     const SCHED_WK_SD = SB_WK_SD * Math.SQRT2;
 *
 * about fifteen hundred lines above the `const SB_WK_SD` it reads. A top-level
 * const initialiser runs at load, hit the temporal dead zone, and threw before
 * app.js had finished evaluating — so nothing after it was ever defined and the
 * entire site was blank. It parsed cleanly. Every unit suite passed, because
 * every harness happened to declare SB_WK_SD first.
 *
 * So this one does the only thing that catches that class of bug: it EXECUTES
 * the file, top to bottom, against a browser-shaped stub, and asserts it
 * reaches the end. It does not test behaviour and should not grow assertions
 * about behaviour — the other suites do that. It answers one question: if this
 * were served to a browser right now, would it come up?
 *
 *   node scripts/test-loads.mjs
 */
import fs from 'fs';

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? '\n       ' + extra : '')); }
};

const FILES = ['public/app.js', 'public/config.js', 'public/sw.js'];

/* A browser, near enough.

   Not a list of globals - a `with` scope backed by a Proxy. The list approach
   was tried first and is wrong: it fails on the first browser global nobody
   thought of (it was a bare addEventListener), and each failure looks like a
   real bug for as long as it takes to notice it is not. The proxy claims a name
   only when the real environment does NOT have one, so Math, JSON, Object and
   Promise stay genuinely themselves while document, localStorage and friends
   come back as stubs. Anything the file touches while evaluating therefore
   exists, and nothing that matters is quietly replaced.

   None of these stubs need to DO anything. The point is to reach the last line,
   not to run the app. */
function makeStub(name) {
  const fn = function () { return makeStub(name + '()'); };
  return new Proxy(fn, {
    get(t, k) {
      if (k === Symbol.toPrimitive) return () => 0;
      if (k === Symbol.iterator) return function* () {};
      if (k === Symbol.toStringTag) return 'GflStub';
      if (k === 'then') return undefined;              // never look thenable
      if (k === 'length' || k === 'size') return 0;
      return makeStub(name + '.' + String(k));
    },
    set() { return true; },
    has() { return true; },
    deleteProperty() { return true; },
    apply() { return makeStub(name + '()'); },
    construct() { return makeStub('new ' + name); },
  });
}
const ENV = new Proxy({}, {
  /* claim an identifier only if the real environment has no such global, so
     builtins resolve to the genuine article */
  has(t, k) { return !(k in globalThis); },
  get(t, k) {
    /* `with` asks for Symbol.unscopables first and honours anything truthy it
       finds on it. A stub answers truthily to everything, so every identifier
       came back unscopable and the whole scope was skipped — three files, three
       ReferenceErrors, and a harness that looked like it was working. */
    if (k === Symbol.unscopables) return undefined;
    return makeStub(String(k));
  },
  set() { return true; },
});

console.log('\n1. every shipped script evaluates to the end');
for (const rel of FILES) {
  let src = null;
  try { src = fs.readFileSync(new URL('../' + rel, import.meta.url), 'utf8'); }
  catch (e) { ok(rel + ' is readable', false, e.message); continue; }

  /* Parse first, so a syntax error is reported as a syntax error rather than
     as a mysterious runtime failure. */
  let parsed = true;
  try { new Function(src); }
  catch (e) { parsed = false; ok(rel + ' parses', false, e.message); }
  if (!parsed) continue;

  /* A sentinel after the last line: if evaluation stops early - a throw at top
     level - this never runs, which is exactly the failure being hunted.
     `with` needs sloppy mode, which a Function body is unless the source opts
     in; none of these files do. */
  let err = null, reached = false;
  try {
    reached = new Function('__env', 'with(__env){' + src + '\n;return true;}')(ENV) === true;
  } catch (e) { err = e; }

  ok(rel + ' evaluates without throwing', !err,
    err ? `${err.name}: ${err.message}` : null);
  if (!err) ok(rel + ' reaches its last line', reached);
  /* A ReferenceError here is almost always the temporal dead zone: something
     near the top reading a const or let declared further down. Name it, because
     the message alone ("Cannot access 'X' before initialization") does not say
     which of the two lines is in the wrong place. */
  if (err && err.name === 'ReferenceError' && /before initialization/.test(err.message)) {
    const who = (err.message.match(/'([^']+)'/) || [])[1] || '?';
    console.log(`       ^ ${who} is read at load time but declared later in ${rel}.`);
    console.log('         Move the declaration up, or defer the read behind a function.');
  }
}

/* ── NO TWO TOP-LEVEL FUNCTIONS MAY SHARE A NAME ────────────────────────────
   app.js is one sixteen-thousand-line script, so every top-level `function f()`
   lands in the same scope. Declare a second one and JavaScript does not
   complain: the later declaration silently wins the name, and every call meant
   for the earlier one lands in the later one instead.

   That is not hypothetical. A modalLock() was written for the coaching-metric
   modal without noticing an existing modalLock(on) further down the file. The
   calls resolved to the old one, arrived with `on` undefined, took its `else`
   branch and ran window.scrollTo — so opening the modal scrolled the page,
   which was the exact bug the new function had been written to fix.

   Nothing catches this: it parses, it loads, and it runs. Only a scan does. */
console.log('\n2. no top-level function name is declared twice');
for (const rel of FILES) {
  let src = null;
  try { src = fs.readFileSync(new URL('../' + rel, import.meta.url), 'utf8'); } catch { continue; }
  const seen = new Map();
  const dupes = [];
  // column zero only: anything indented is nested inside another function
  const re = /^function\s+([A-Za-z_$][\w$]*)\s*\(/gm;
  let m;
  while ((m = re.exec(src)) !== null) {
    const name = m[1];
    const line = src.slice(0, m.index).split('\n').length;
    if (seen.has(name)) dupes.push(`${name} (lines ${seen.get(name)} and ${line})`);
    else seen.set(name, line);
  }
  ok(`${rel} declares ${seen.size} top-level functions, none twice`, dupes.length === 0,
    dupes.join('; '));
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
