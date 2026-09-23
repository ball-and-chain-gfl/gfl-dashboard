/* THE NUMBER THE CARD PRINTS HAS TO BE A NUMBER YOU CAN SELL.
 *
 * Share counts are fractional and quantised to four places. Both ends of the
 * sell path round: invShFmt rounds to print the holding on the card, invRound
 * rounds to read the request back. Both round HALF UP, so a holding whose fifth
 * decimal is a five or better becomes a number LARGER than the holding --
 * 5.4115850000000005 prints as 5.4116 and reads back as 5.4116.
 *
 * The check was written with a 1e-6 tolerance, a hundred times tighter than the
 * rounding that produced the number, so the card refused the exact figure it
 * had just told you that you held: "You only hold 5.4116." Thirteen of the
 * thirty holdings in the league were sitting in that state.
 *
 * Run: node scripts/test-invsell.mjs
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

const SRC = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const M = assemble(lifter(new URL('../public/app.js', import.meta.url)), [
  'const INV_Q=',
  'const invRound=',
  'const invShFmt=',
  'function invSetQty(o,v,cap){',
], ['INV_Q', 'invRound', 'invShFmt', 'invSetQty', 'qty'],
  ['const _invQty={};',
   'const renderBook=()=>{};',
   'let _invErr="";',
   'const qty=o=>_invQty[o];'].join(NL));

/* every holding in the league that rounds UP, read off the live profiles */
const REAL = [
  5.4115850000000005, 0.011853999999999587, 3.9999969999999996, 5.341676,
  1.380264, 3.058163, 0.25067100000000053, 1.6561920000000008, 5.038776,
  1.380265, 1.019388, 2.740844, 14.152429000000001, 3,
];

head('the two ends of the path round the same way');
ok('a holding can round ABOVE itself', M.invRound(5.4115850000000005) > 5.4115850000000005, true);
ok('and that is the number the card prints', M.invShFmt(5.4115850000000005), '5.4116');

head('but never by more than one quantum');
/* this is the invariant the sell check leans on: whatever the rounding does to
   a holding, it cannot land further than INV_Q above it */
ok('invRound stays inside the quantum',
  REAL.filter(h => M.invRound(h) > h + M.INV_Q), []);
ok('and so does the printed figure',
  REAL.filter(h => Number(M.invShFmt(h)) > h + M.INV_Q), []);

head('so the printed figure is always sellable');
/* exactly the comparison invTrade makes */
const refused = REAL.filter(h => Number(M.invShFmt(h)) > h + M.INV_Q);
ok('nothing the card shows is refused', refused, []);
/* and under the old tolerance it very much was */
const wouldHaveFailed = REAL.filter(h => Number(M.invShFmt(h)) > h + 1e-6);
ok('under the old 1e-6 tolerance most of them were', wouldHaveFailed.length > 0, true);
ok('5.4115850000000005 among them', wouldHaveFailed.includes(5.4115850000000005), true);

head('a whole number that is a hair short still reads as whole');
ok('3.9999969999999996 prints as 4', M.invShFmt(3.9999969999999996), '4');
ok('and selling 4 is inside the quantum', 4 <= 3.9999969999999996 + M.INV_Q, true);

head('the stepper cannot climb over the cap it was given');
M.invSetQty('t', 99, 5.4115850000000005);
ok('clamped to the holding, not to the rounding of it',
  M.qty('t') <= 5.4115850000000005, true);
M.invSetQty('t', 5.4116, 5.4115850000000005);
ok('typing the printed figure clamps too', M.qty('t') <= 5.4115850000000005, true);
M.invSetQty('t', 2, 5.4115850000000005);
ok('and a number under the cap is left alone', M.qty('t'), 2);
M.invSetQty('t', -5, 5.4115850000000005);
ok('negatives floor at nothing', M.qty('t'), 0);

head('no cap means no clamp');
M.invSetQty('u', 12.34567, null);
ok('just the rounding', M.qty('u'), 12.3457);

/* ── the rule in the source ────────────────────────────────────────────────── */
head('the sell check carries the quantum and not a tighter number');
ok('it compares against INV_Q', SRC.includes('if(n>have+INV_Q)'), true);
ok('the old tolerance is gone from it', SRC.includes("if(n>have+1e-6){ _invErr='You only hold"), false);
/* the clamp is what makes a generous tolerance safe: whatever was typed, the
   lot written can never be more than is actually held */
ok('and the sale is still clamped to the holding',
  SRC.includes('n=Math.min(n,have);'), true);

console.log(NL + (fail ? 'FAILED  ' : 'ok  ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
