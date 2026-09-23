/* THE NUMBER THE CARD PRINTS HAS TO BE A NUMBER YOU CAN SELL.
 *
 * Share counts are fractional and quantised to two places. Both ends of the
 * sell path round: invShFmt rounds to print the holding on the card, invRound
 * rounds to read the request back. Both round HALF UP, so a holding whose third
 * decimal is a five or better becomes a number LARGER than the holding --
 * 3.058163 prints as 3.06 and reads back as 3.06.
 *
 * The check was once written with a 1e-6 tolerance, orders tighter than the
 * rounding that produced the number, so the card refused the exact figure it
 * had just told you that you held: "You only hold 3.06."
 *
 * And the other direction: a holding carries whatever precision the arithmetic
 * gave it. Selling 3.06 out of 3.058163 is fine, but selling 5.41 out of
 * 5.4115850000000005 would leave 0.00158 of a share that no later request can
 * ever name, because every request rounds to the hundredth. A request within a
 * quantum of the whole holding takes the whole holding.
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

/* every holding in the league, read off the live profiles */
const REAL = [
  5.4115850000000005, 0.011853999999999587, 3.9999969999999996, 5.341676,
  1.380264, 3.058163, 0.25067100000000053, 1.6561920000000008, 5.038776,
  1.380265, 1.019388, 2.740844, 14.152429000000001, 3,
];

head('two places, and no more');
ok('the quantum is a hundredth', M.INV_Q, 1e-2);
ok('a long value rounds to two', M.invRound(14.152429000000001), 14.15);
ok('and prints as two', M.invShFmt(14.152429000000001), '14.15');
ok('nothing prints more than two decimals',
  REAL.filter(h => { const t = M.invShFmt(h).split('.')[1]; return t && t.length > 2; }), []);
ok('a whole number stays whole', M.invShFmt(3), '3');
ok('and a hair under whole reads whole', M.invShFmt(3.9999969999999996), '4');

head('the rounding can still land above the holding');
ok('3.058163 rounds up', M.invRound(3.058163) > 3.058163, true);
ok('and that is what the card prints', M.invShFmt(3.058163), '3.06');
ok('several of the real holdings do it',
  REAL.filter(h => Number(M.invShFmt(h)) > h).length > 0, true);

head('but never by more than one quantum');
ok('invRound stays inside it',
  REAL.filter(h => M.invRound(h) > h + M.INV_Q), []);
ok('and so does the printed figure',
  REAL.filter(h => Number(M.invShFmt(h)) > h + M.INV_Q), []);

head('so the printed figure is always sellable');
ok('nothing the card shows is refused',
  REAL.filter(h => Number(M.invShFmt(h)) > h + M.INV_Q), []);
const oldRule = REAL.filter(h => Number(M.invShFmt(h)) > h + 1e-6);
ok('under the old 1e-6 tolerance several were', oldRule.length > 0, true);
ok('3.058163 among them', oldRule.includes(3.058163), true);

head('and selling the printed figure sells all of it');
/* the clamp, then the absorb: whatever is asked for, what is written can never
   exceed the holding, and what is left can never be less than a quantum */
const sold = h => { const n = Math.min(M.invRound(Number(M.invShFmt(h))), h); return (h - n < M.INV_Q) ? h : n; };
ok('no holding is left with dust', REAL.filter(h => sold(h) !== h), []);
ok('5.4115850000000005 goes entirely', sold(5.4115850000000005), 5.4115850000000005);
ok('and so does 14.152429000000001', sold(14.152429000000001), 14.152429000000001);

head('a part sale is still a part sale');
ok('asking for two out of five leaves three',
  Math.min(M.invRound(2), 5.341676), 2);

head('the stepper cannot climb over the cap it was given');
M.invSetQty('t', 99, 3.058163);
ok('clamped to the holding, not to the rounding of it', M.qty('t') <= 3.058163, true);
M.invSetQty('t', 3.06, 3.058163);
ok('typing the printed figure clamps too', M.qty('t') <= 3.058163, true);
M.invSetQty('t', 2, 3.058163);
ok('a number under the cap is left alone', M.qty('t'), 2);
M.invSetQty('t', -5, 3.058163);
ok('negatives floor at nothing', M.qty('t'), 0);

head('no cap means no clamp');
M.invSetQty('u', 12.34567, null);
ok('just the rounding', M.qty('u'), 12.35);

/* ── the rules in the source ───────────────────────────────────────────────── */
head('the sell path carries both halves');
ok('the check compares against INV_Q', SRC.includes('if(n>have+INV_Q)'), true);
ok('the sale is clamped to the holding', SRC.includes('n=Math.min(n,have);'), true);
ok('and a near-whole request absorbs the remainder',
  SRC.includes('if(have-n<INV_Q) n=have;'), true);

console.log(NL + (fail ? 'FAILED  ' : 'ok  ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
