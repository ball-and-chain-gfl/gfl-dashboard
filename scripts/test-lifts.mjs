/* NOTHING MAY LIFT A FUNCTION AND LEAVE BEHIND WHAT IT READS.
 *
 * Four scripts rebuild parts of public/app.js by cutting declarations out of the
 * source: poll-live, settle-bets, archive-charts, gen-draft-curve. Each supplies
 * the surrounding world itself -- stubs, fixtures, caches -- in a prelude it
 * keeps by hand. Nothing links that prelude to app.js, so adding a bare
 * top-level there that an already-lifted function reaches for breaks the script
 * and nothing says so until it runs.
 *
 * It is a quiet break twice over. The bundle still ASSEMBLES, because the name
 * is only a reference; and the reference is usually on a path that needs real
 * football to reach, so the script runs green for weeks and throws the first
 * time it has actual work to do.
 *
 * Both of these were live in the repo on 2026-09-14, found in the same hour:
 *
 *   poll-live      LIVE_EFF_SKIP, liveEffW -- livePlayerLeft only touches them
 *                  once a game is in progress. Every run of week 1's Sunday
 *                  slate died inside a minute; the quiet runs either side
 *                  passed, so the history looked healthy.
 *
 *   archive-charts _poDeadCache -- poDeadGames only runs when there is a
 *                  finished week to price, so it had never been reached. Worse,
 *                  test-charts.mjs declared the name in ITS OWN prelude, so the
 *                  pre-flight the workflow runs first passed green over a script
 *                  that threw ReferenceError. A test that supplies what the
 *                  thing it guards does not is worse than no test.
 *
 * So: for every lifting script, assemble what it lifts, and fail if the bundle
 * reaches for any top-level name that neither the bundle nor that script's own
 * prelude defines.
 *
 * Run: node scripts/test-lifts.mjs
 */
import fs from 'fs';
import { lifter } from './lib/lift.mjs';

const NL = String.fromCharCode(10);
let pass = 0, fail = 0;
const ok = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; return; }
  fail++;
  console.log('  FAIL  ' + name + NL + '          got  ' + g + NL + '          want ' + w);
};

const APP = new URL('../public/app.js', import.meta.url);
const appSrc = fs.readFileSync(APP, 'utf8');
const grab = lifter(APP);

/* Comments and plain strings go; TEMPLATE LITERALS STAY when asked to stay.
   These scripts build their prelude as one big template string -- the stubs and
   caches the lifted code needs are written inside the backticks -- so a scan
   that blanks templates sees a script providing nothing and reports every stub
   as an orphan. That is how the first run of this check produced thirteen false
   alarms against code that was fine. */
const strip = (s, keepTemplates) => {
  let out = s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
  if (!keepTemplates) out = out.replace(/`(?:[^`\\]|\\.)*`/g, ' "" ');
  return out.replace(/'(?:[^'\\]|\\.)*'/g, ' "" ').replace(/"(?:[^"\\]|\\.)*"/g, ' "" ');
};

const LANG = new Set(('Math Number String Object Array JSON Date Boolean isNaN parseInt parseFloat '
  + 'console Set Map WeakMap Symbol BigInt undefined null true false NaN Infinity globalThis '
  + 'window document navigator localStorage fetch Promise RegExp Error TypeError encodeURIComponent '
  + 'decodeURIComponent setTimeout clearTimeout structuredClone process Buffer URL '
  + 'this return typeof new of in if else for while function const let var try catch throw finally '
  + 'break continue switch case default do delete void instanceof class extends async await yield')
  .split(' '));

/* Every name a chunk of source DECLARES, including the comma forms a naive
   per-name grep misses -- `let _seasonMeta={}, _lineups={}, _finalsCache={};`
   declares three, and reading it as one is how this check first reported two
   false alarms against settle-bets. */
function declaredIn(src, keepTemplates) {
  const out = new Set();
  const clean = strip(src, keepTemplates);
  for (const m of clean.matchAll(/\b(?:function|class)\s+([A-Za-z_$][\w$]*)/g)) out.add(m[1]);
  /* a const/let/var statement, then every identifier bound at its top level */
  for (const m of clean.matchAll(/\b(?:const|let|var)\s+([^;\n]+)/g)) {
    let depth = 0, cur = '';
    for (const ch of m[1]) {
      if ('([{'.includes(ch)) depth++;
      else if (')]}'.includes(ch)) depth--;
      if (ch === ',' && depth <= 0) { cur += ' ,SPLIT, '; continue; }
      cur += ch;
    }
    cur.split(',SPLIT,').forEach(part => {
      const t = part.trim().split('=')[0].trim();
      if (/^[A-Za-z_$][\w$]*$/.test(t)) out.add(t);
      else for (const d of t.matchAll(/([A-Za-z_$][\w$]*)/g)) out.add(d[1]);   // destructuring
    });
  }
  for (const m of clean.matchAll(/\bfunction\s*[A-Za-z_$]*\s*\(([^)]*)\)/g))
    m[1].split(',').forEach(p => { const t = p.trim().split(/[=:\s]/)[0].replace(/[{}\[\].]/g, ''); if (t) out.add(t); });
  for (const m of clean.matchAll(/([A-Za-z_$][\w$]*)\s*=>/g)) out.add(m[1]);
  for (const m of clean.matchAll(/\(([^()]*)\)\s*=>/g))
    m[1].split(',').forEach(p => { const t = p.trim().split(/[=:\s]/)[0].replace(/[{}\[\].]/g, ''); if (t) out.add(t); });
  for (const m of clean.matchAll(/catch\s*\(\s*([A-Za-z_$][\w$]*)/g)) out.add(m[1]);
  for (const m of clean.matchAll(/\bimport\s+\{([^}]*)\}/g))
    m[1].split(',').forEach(p => { const t = p.trim().split(/\s+as\s+/).pop().trim(); if (t) out.add(t); });
  for (const m of clean.matchAll(/\bimport\s+([A-Za-z_$][\w$]*)\s+from/g)) out.add(m[1]);
  return out;
}

/* A top-level in app.js is a thing the lift COULD have carried. Anything else
   free is a local this crude scan did not see, and not our business. */
const isAppTopLevel = n =>
  new RegExp('^(?:const|let|var|function|async function)\\s+' + n.replace(/\$/g, '\\$') + '\\b', 'm').test(appSrc);

const SCRIPTS = ['poll-live', 'settle-bets', 'archive-charts', 'gen-draft-curve'];

console.log('checking ' + SCRIPTS.length + ' scripts that lift out of app.js');
for (const file of SCRIPTS) {
  const src = fs.readFileSync(new URL('./' + file + '.mjs', import.meta.url), 'utf8');

  const names = [...src.matchAll(/grab\(\s*'((?:[^'\\]|\\.)*)'\s*\)/g)].map(m => m[1]);
  const asm = src.indexOf('assemble(grab, [');
  if (asm >= 0) {
    const block = src.slice(asm, src.indexOf('], [', asm));
    for (const m of block.matchAll(/^\s*'([^']+)',?\s*$/gm)) names.push(m[1]);
  }
  const uniq = [...new Set(names)];

  console.log(NL + '── ' + file + '  (' + uniq.length + ' declarations lifted)');
  ok(file + ': it lifts something', uniq.length > 0, true);

  const gone = uniq.filter(n => { try { return !grab(n); } catch (e) { return true; } });
  ok(file + ': every name it asks for is still in app.js', gone, []);
  if (gone.length) continue;

  const bundle = uniq.map(n => grab(n)).join(NL);
  const provided = declaredIn(bundle, false);   // what the lifted code declares itself

  const used = new Set();
  for (const m of strip(bundle, false).matchAll(/(?<![.\w$])([A-Za-z_$][\w$]*)/g)) used.add(m[1]);

  /* The script's own prelude is built inside a template literal, and reading
     declarations out of one reliably needs a parser rather than a regex -- the
     first attempt here blanked the template and reported all thirteen stubs as
     missing. So the question asked of the script is the weaker, sturdier one:
     DOES THIS NAME APPEAR IN IT AT ALL? That is exactly the mistake being
     hunted -- a name the author never knew they had to supply -- and it cannot
     produce a false alarm against a script that does supply it, however the
     prelude happens to be written. It will not catch a stub that is present but
     misspelled or out of scope; running the thing catches those, which is what
     test-poller-lift.mjs does for the one script whose maths can be exercised
     without a live game. */
  const mentions = n => new RegExp('(?<![.\\w$])' + n.replace(/\$/g, '\\$') + '(?![\\w$])').test(src);

  const orphans = [...used]
    .filter(n => !provided.has(n) && !LANG.has(n))
    .filter(isAppTopLevel)
    .filter(n => !mentions(n))
    .sort();
  ok(file + ': nothing is reached for that the script never heard of', orphans, []);
}

/* The pre-flight tests must not be more generous than the scripts they guard.
   archive-charts.yml runs test-charts.mjs before freezing anything; if that test
   declares a name the script does not, it passes over a script that throws. */
console.log(NL + '── the pre-flight tests supply no more than their scripts do');
for (const [test, script] of [['test-charts', 'archive-charts'], ['test-season', 'settle-bets']]) {
  const tSrc = fs.readFileSync(new URL('./' + test + '.mjs', import.meta.url), 'utf8');
  const sSrc = fs.readFileSync(new URL('./' + script + '.mjs', import.meta.url), 'utf8');
  /* Same containment question, the other way round: a name that is an app.js
     top-level, that the TEST mentions and the SCRIPT does not, is a stub the
     test supplies over a script that will throw without it. _poDeadCache was
     exactly this, and it turned the pre-flight into a green light for a run
     that could not work. */
  /* Raw source, deliberately: these preludes live inside template literals and
     carry URLs, and a `//` in one of those makes a comment-stripper eat the
     rest of the line -- which is what silently swallowed settle-bets' whole
     prelude the first two times this check was written. A name appearing even
     in a comment still means the author knew they had to supply it. */
  const named = s => new Set([...s
    .matchAll(/(?<![.\w$])([A-Za-z_$][\w$]*)(?![\w$])/g)].map(m => m[1]));
  const inTest = named(tSrc), inScript = named(sSrc);
  const extra = [...inTest].filter(n => !inScript.has(n) && isAppTopLevel(n)
    && /^_/.test(n)).sort();          // module state, which is what gets forgotten
  ok(test + ' supplies no app.js state that ' + script + ' lacks', extra, []);
}

console.log(NL + (fail ? 'FAILED  ' : 'ok  ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
