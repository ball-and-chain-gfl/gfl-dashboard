/* THE POLLER LIFTS ITS MATHS OUT OF app.js, AND app.js DOES NOT KNOW IT.
 *
 * scripts/poll-live.mjs rebuilds a dozen functions out of public/app.js by
 * cutting them from the source. Nothing links the two: add a constant in app.js
 * that an already-lifted function reaches for, and the poller keeps assembling
 * cleanly and throws ReferenceError the first time that line runs.
 *
 * Which is exactly what happened. LIVE_EFF_SKIP and liveEffW arrived with
 * "Sigma rides the lineups" and the lift list was not told. livePlayerLeft only
 * touches them once a game is genuinely in progress -- so the poller ran all
 * week without complaint, and then died inside a minute on every run of week
 * 1's Sunday slate, taking the whole week's win-probability graph with it. The
 * runs before and after the games passed, so the workflow history looked
 * healthy at a glance.
 *
 * Two rules, because the first alone would not have caught it:
 *   1. nothing the bundle reaches for may be missing from the lift list;
 *   2. the bundle is actually RUN, against a side mid-game, because a symbol
 *      only used on the live path is invisible to any check that does not
 *      reach that path.
 *
 * Run: node scripts/test-poller-lift.mjs
 */
import fs from 'fs';
import { lifter, assemble } from './lib/lift.mjs';

const NL = String.fromCharCode(10);
let pass = 0, fail = 0;
const ok = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; return; }
  fail++;
  console.log('  FAIL  ' + name + NL + '          got  ' + g + NL + '          want ' + w);
};
const head = t => console.log(NL + t);

const APP = new URL('../public/app.js', import.meta.url);
const grab = lifter(APP);
const pollSrc = fs.readFileSync(new URL('./poll-live.mjs', import.meta.url), 'utf8');

/* The list under test is the one the poller really uses, read out of its own
   source -- not a copy kept here, which would drift the same way. */
const call = pollSrc.slice(pollSrc.indexOf('const app = assemble(grab, ['));
const listBlock = call.slice(call.indexOf('['), call.indexOf('], ['));
const NAMES = [...listBlock.matchAll(/^\s*'([^']+)',?\s*$/gm)].map(m => m[1]);
const exportBlock = call.slice(call.indexOf('], [') + 3, call.indexOf(']);') + 1);
const EXPORTS = [...exportBlock.matchAll(/'([^']+)'/g)].map(m => m[1]);

head('the lift list was read');
ok('it found the declarations', NAMES.length > 20, true);
ok('and the exports', EXPORTS.length > 10, true);
ok('every one of them is still in app.js',
  NAMES.filter(n => { try { return !grab(n); } catch (e) { return true; } }), []);

/* ── rule 1: nothing is reached for that is not carried ───────────────────── */
head('the bundle defines everything it mentions');
const bundle = NAMES.map(n => grab(n)).join(NL);
const strip = s => s
  .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ')
  .replace(/`(?:[^`\\]|\\.)*`/g, ' "" ')
  .replace(/'(?:[^'\\]|\\.)*'/g, ' "" ')
  .replace(/"(?:[^"\\]|\\.)*"/g, ' "" ');
const clean = strip(bundle);

const declared = new Set();
for (const m of clean.matchAll(/\b(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/g)) declared.add(m[1]);
for (const m of clean.matchAll(/\bfunction\s*[A-Za-z_$]*\s*\(([^)]*)\)/g))
  m[1].split(',').forEach(p => { const t = p.trim().split(/[=:\s]/)[0].replace(/[{}\[\].]/g, ''); if (t) declared.add(t); });
for (const m of clean.matchAll(/([A-Za-z_$][\w$]*)\s*=>/g)) declared.add(m[1]);
for (const m of clean.matchAll(/\(([^()]*)\)\s*=>/g))
  m[1].split(',').forEach(p => { const t = p.trim().split(/[=:\s]/)[0].replace(/[{}\[\].]/g, ''); if (t) declared.add(t); });
for (const m of clean.matchAll(/catch\s*\(\s*([A-Za-z_$][\w$]*)/g)) declared.add(m[1]);

const LANG = new Set(('Math Number String Object Array JSON Date Boolean isNaN parseInt parseFloat '
  + 'console Set Map undefined null true false NaN Infinity window document fetch Promise RegExp '
  + 'Error this return typeof new of in if else for while function const let var try catch throw '
  + 'break continue switch case default do delete void instanceof class extends async await yield').split(' '));

const used = new Set();
for (const m of clean.matchAll(/(?<![.\w$])([A-Za-z_$][\w$]*)/g)) used.add(m[1]);
const appSrc = fs.readFileSync(APP, 'utf8');
/* A free name only matters when app.js declares it at the top level: that is a
   thing the lift COULD have carried and did not. Anything else is a local the
   crude scan failed to see. */
const orphans = [...used]
  .filter(n => !declared.has(n) && !LANG.has(n))
  .filter(n => new RegExp('^(?:const|let|var|function)\\s+' + n.replace(/\$/g, '\\$') + '\\b', 'm').test(appSrc))
  .sort();
ok('no top-level name is reached for but not lifted', orphans, []);

/* ── rule 2: run it, mid-game, which is the only path that breaks ─────────── */
head('the assembled bundle runs on a side in the middle of a game');
const app = assemble(grab, NAMES, EXPORTS);
ok('it assembled', typeof app.liveSideLeft, 'function');

/* PPR-ish rules over the stat ids LIVE_VOLUME actually splits on. */
const rules = { 0: 0, 3: 0.04, 4: 4, 20: -2, 23: 0, 24: 0.1, 25: 6, 42: 0.1, 43: 6, 53: 1, 58: 0 };
/* A receiver projected for 8 targets / 6 receptions / 80 yards / 0.5 TD.
   liveScoreLine over that line must reproduce appliedTotal or livePlayerLeft
   discards the model and falls back to flat -- which would hide a throw. */
const projLine = { 58: 8, 53: 6, 42: 80, 43: 0.5 };
const projTotal = 6 * 1 + 80 * 0.1 + 0.5 * 6;        // 6 + 8 + 3 = 17
const starter = (actual) => ({
  playerId: 1, lineupSlotId: 2,
  playerPoolEntry: { appliedStatTotal: 0, player: {
    id: 1, proTeamId: 1, defaultPositionId: 3,
    stats: [
      { statSourceId: 1, statSplitTypeId: 1, appliedTotal: projTotal, stats: projLine },
      { statSourceId: 0, statSplitTypeId: 1, appliedTotal: 0, stats: actual },
    ] } },
});
const side = { rosterForCurrentScoringPeriod: { entries: [starter({ 58: 4, 53: 3, 42: 41, 43: 0 })] } };

/* This is the call that threw ReferenceError all Sunday. */
let threw = null, left = null;
try { left = app.liveSideLeft(side, { ATL: 0.5 }, rules); } catch (e) { threw = e.message; }
ok('it does not throw', threw, null);
ok('and it returns a number', typeof left, 'number');
ok('a half-played receiver has points still to come', left > 0, true);
ok('but not more than his whole projection', left < projTotal, true);

head('the clock still moves the answer');
const at = f => { try { return app.liveSideLeft(side, { ATL: f }, rules); } catch (e) { return null; } };
const early = at(0.25), late = at(0.85);
ok('early in the game there is more left than late', early > late, true);
ok('neither throws', [early, late].every(v => typeof v === 'number'), true);

head('a whole-game fraction leaves nothing');
const done = at(1);
ok('nothing left at the whistle', done === 0 || done < 0.5, true);

console.log(NL + (fail ? 'FAILED  ' : 'ok  ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
