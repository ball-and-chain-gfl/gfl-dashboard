/* THE WAIVER RULES EXIST TWICE AND MUST NOT DISAGREE.
 *
 * public/app.js scores the Coaching Metric's C3 in the browser.
 * scripts/archive-transactions.mjs writes the same pickups into the repo.
 * Neither reads the other, and both had the same three bugs in the same shape:
 *
 *   - an EXACT status match, so "FAILED_PLAYERALREADYDROPPED" was not a
 *     failure and a claim that never processed was scored as a pickup;
 *   - a bid pool keyed by WEEK rather than by waiver run, so claims days apart
 *     were treated as bidding against each other;
 *   - (the archiver only) your own other claims counted as rivals.
 *
 * Fixing one and not the other is how the app and the archive end up telling
 * the league two different stories about the same $25. This holds them level.
 *
 * Run: node scripts/test-waiver-rules.mjs
 */
import fs from 'fs';
import path from 'path';
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

/* the archiver's copy */
const arch = fs.readFileSync(path.resolve('scripts/archive-transactions.mjs'), 'utf8');
const cut = (a, b) => { const i = arch.indexOf(a); const j = arch.indexOf(b, i); return arch.slice(i, j); };
const A = new Function(
  cut('const DEAD =', 'const WITHDRAWN') + cut('const WITHDRAWN =', 'const dayOf')
  + cut('const dayOf =', '\nconst get')
  + 'return { isDead, isWithdrawn, neverRan, dayOf };')();

/* the app's copy, lifted out of computeCoaching */
const grab = lifter(new URL('../public/app.js', import.meta.url));
const src = grab('async function computeCoaching(teams, transactions, weeklyData){');
const pick = (start, end) => {
  const i = src.indexOf(start); const j = src.indexOf(end, i);
  return src.slice(i, j);
};
const B = new Function(
  pick('const TX_DEAD=', '  function executed')
  + pick('  function executed', '  /* A WITHDRAWN')
  + pick('  const TX_WITHDRAWN=', '  /* THE WAIVER RUN')
  + pick('  const txDay=', '\n  // C2')
  + 'return { executed, txWithdrawn, txNeverRan, txDay };')();

const STATUSES = [
  ['EXECUTED', false], ['PENDING', true], ['FAILED', true],
  ['FAILED_PLAYERALREADYDROPPED', true], ['FAILED_INVALIDPLAYERSOURCE', true],
  ['CANCELED', true], ['CANCELLED', true], ['DECLINED', true],
  ['REVERSED', true], ['VOID', true], ['INVALID', true],
  ['', false],
];

head('both files agree on what did not happen');
for (const [s, dead] of STATUSES) {
  const a = A.isDead(s);
  const b = !B.executed({ status: s });
  ok((s || '(blank)') + ' is ' + (dead ? 'dead' : 'live'), [a, b], [dead, dead]);
}

head('both agree on what was withdrawn rather than beaten');
for (const [s, w] of [['CANCELED', true], ['VOID', true], ['INVALID', true],
                      ['FAILED', false], ['FAILED_PLAYERALREADYDROPPED', false],
                      ['EXECUTED', false], ['PENDING', false]]) {
  ok((s) + ' withdrawn=' + w, [A.isWithdrawn(s), B.txWithdrawn({ status: s })], [w, w]);
}

head('both bucket a claim into the same waiver run');
const ms = Date.parse('2026-09-02T08:00:00Z');
ok('the same day', [A.dayOf({ processDate: ms }), B.txDay({ processDate: ms })],
  ['2026-09-02', '2026-09-02']);
const ms2 = Date.parse('2026-09-10T08:00:00Z');
ok('a different run is a different key',
  A.dayOf({ processDate: ms2 }) !== A.dayOf({ processDate: ms }), true);
ok('and the app says the same', B.txDay({ processDate: ms2 }), '2026-09-10');
ok('proposedDate stands in when there is no processDate',
  [A.dayOf({ proposedDate: ms }), B.txDay({ proposedDate: ms })], ['2026-09-02', '2026-09-02']);

head('the real Juwan Johnson pair lands in two different runs');
const sep2 = { processDate: Date.parse('2026-09-02T08:00:00Z'), status: 'EXECUTED' };
const sep10 = { processDate: Date.parse('2026-09-10T08:00:00Z'), status: 'FAILED_PLAYERALREADYDROPPED' };
ok('different buckets', A.dayOf(sep2) === A.dayOf(sep10), false);
ok('and the later one is not a pickup in either file',
  [A.isDead(sep10.status), !B.executed(sep10)], [true, true]);
ok('while the earlier one is, in both',
  [A.isDead(sep2.status), !B.executed(sep2)], [false, false]);

/* ── which failures ever actually competed ───────────────────────────────────
   FAILED is not one thing, and the two kinds pull in opposite directions. A
   claim that lost on PRICE is the runner-up and has to count; a claim voided
   because the claimant's own roster move was invalid never reached the price
   and must not. Bismuth won the Bears defence at $25 in a run holding a $29
   that was thrown out -- counting it clamped the margin down to the $1 floor
   and Waiver ROI paid as though the thing had been won by a dollar.

   Two separate implementations, so they are asked the same question side by
   side rather than trusted to have been edited together. */
head('a claim thrown out before price is not a rival');
const NEVER = [
  ['FAILED_PLAYERALREADYDROPPED', true],
  ['FAILED_ROSTERLIMIT', true],
  ['FAILED_INVALIDPLAYERSOURCE', false],   // lost on price: it counts
  ['FAILED', false],                       // unqualified: assume nothing
  ['EXECUTED', false],
  ['CANCELED', false],                     // withdrawn is a separate question
  ['', false],
];
NEVER.forEach(([st, want]) => {
  ok('archiver: ' + (st || '(blank)'), A.neverRan(st), want);
  ok('app:      ' + (st || '(blank)'), B.txNeverRan({ status: st }), want);
});

head('and the two copies cannot drift apart on it');
ok('every status gets the same answer from both',
  NEVER.map(([st]) => A.neverRan(st) === B.txNeverRan({ status: st })),
  NEVER.map(() => true));
/* withdrawn and never-ran are different reasons; neither implies the other */
ok('withdrawn is not the same question',
  [A.isWithdrawn('FAILED_PLAYERALREADYDROPPED'), A.neverRan('CANCELED')], [false, false]);

/* ── the archive on disk ──────────────────────────────────────────────────── */
head('the archive matches the rule');
const data = JSON.parse(fs.readFileSync(path.resolve('public/data/transactions-2026.json'), 'utf8'));
const wv = data.waivers || [];
ok('there are pickups to check', wv.length > 0, true);
ok('none of them is contested by a bid at or above its own',
  wv.filter(w => w.nextBid > w.bid).map(w => w.playerId), []);
ok('an uncontested pickup carries no phantom rival',
  wv.filter(w => w.contested === 0 && w.nextBid !== 0).map(w => w.playerId), []);

console.log(NL + (fail ? 'FAILED  ' : 'ok  ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
