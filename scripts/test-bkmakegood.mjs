/* THE ONE-OFF BALL KNOWLEDGE MAKE-GOOD.
 *
 * One card, once, for every manager: a button that puts a point on their Ball
 * Knowledge and then takes the card with it, for good.
 *
 * Three things have to hold or it is either worthless or an exploit:
 *
 *   IT HAS TO PAY. The field is a bkt_ key, and bkIQFor sums every field on a
 *   profile matching /^bkt_/ into the total — so the point arrives with no
 *   scoring code of its own, through the same line that counts a sealed week.
 *
 *   IT MUST NOT PAY TWICE. It SETS a value rather than adding one, so a double
 *   tap, a retry after a failed write, or two devices racing all land on the
 *   same 1 and the total does not move.
 *
 *   IT MUST NOT COME BACK. Undo and Start Over both restore out of ntSeen, so
 *   anything that hides a card by marking it seen can be undone. This is gated
 *   in the GENERATOR instead: once the field is on the profile the card is never
 *   built, and neither control can restore a card ntLive never produced. That is
 *   the same mechanism that makes an answered vote card final.
 *
 * Run: node scripts/test-bkmakegood.mjs
 */
import { lifter, assemble } from './lib/lift.mjs';

const grab = lifter(new URL('../public/app.js', import.meta.url));

const PRELUDE = [
  'let _me={k1:"fman",teamId:"5"};',
  'let _bkFixClaimed=null;',
  'const ntDayOf=t=>{const d=new Date(t); d.setHours(0,0,0,0); return d.getTime();};',
  'const setMe=v=>{_me=v;};',
  'const setClaimed=v=>{_bkFixClaimed=v;};',
].join(String.fromCharCode(10));

const M = assemble(grab,
  ['const BK_MAKEGOOD=', 'function ntBkMakeGood(out){'],
  ['ntBkMakeGood', 'BK_MAKEGOOD', 'setMe', 'setClaimed'], PRELUDE);

let pass = 0, fail = 0;
const ok = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; return; }
  fail++;
  console.log('  FAIL  ' + name + '\n          got  ' + g + '\n          want ' + w);
};
const head = t => console.log('\n' + t);

const cards = () => { const out = []; M.ntBkMakeGood(out); return out; };

head('who is offered the card');
M.setMe({ k1: 'fman', teamId: '5' });
M.setClaimed(false);
ok('a manager who has not claimed gets exactly one', cards().length, 1);
M.setClaimed(true);
ok('a manager who has claimed gets none, ever', cards().length, 0);
M.setClaimed(null);
ok('and nobody is offered it before the profile has answered', cards().length, 0);
/* null rather than false is the point: on a cold load the read is still in the
   air, and defaulting to "not claimed" would flash the card at someone who
   already took it */
M.setMe(null); M.setClaimed(false);
ok('a signed-out visitor gets none', cards().length, 0);

head('what the card carries');
M.setMe({ k1: 'fman', teamId: '5' }); M.setClaimed(false);
const c = cards()[0];
ok('its own kind', c.kind, 'bkfix');
ok('a stable id', c.id, M.BK_MAKEGOOD.id);
ok('pinned above the weekly cards', c.pin, 3);
ok('the claim rides on the card', !!c.claim, true);
ok('and the words are the ones asked for',
  [c.title, c.body], ['Ball Knowledge reimbursement', 'We are sorry for the inconvenience.']);

head('the point arrives through the trivia sum');
/* bkIQFor sums every /^bkt_/ field. That is the whole payment mechanism. */
ok('the field is a bkt_ key', /^bkt_/.test(M.BK_MAKEGOOD.field), true);
ok('it is worth exactly one', M.BK_MAKEGOOD.points, 1);
const sum = p => { let s = 0; Object.keys(p).forEach(k => { if (/^bkt_/.test(k)) s += Number(p[k]) || 0; }); return s; };
ok('an unclaimed profile scores its weeks only',
  sum({ bkt_2026_w1: '1', bkt_2026_w2: '1' }), 2);
ok('a claimed one scores a point more',
  sum({ bkt_2026_w1: '1', bkt_2026_w2: '1', [M.BK_MAKEGOOD.field]: '1' }), 3);

head('claiming twice pays once');
const claimed = { bkt_2026_w1: '1' };
claimed[M.BK_MAKEGOOD.field] = String(M.BK_MAKEGOOD.points);
const before = sum(claimed);
claimed[M.BK_MAKEGOOD.field] = String(M.BK_MAKEGOOD.points);   // the second write
ok('the second write changes nothing', sum(claimed), before);
ok('because it sets rather than adds',
  /\[BK_MAKEGOOD\.field\]:String\(BK_MAKEGOOD\.points\)/.test(grab('async function ntClaimBk(){')), true);

head('it is not mistaken for a week');
/* bkUnsealed walks w=1..now looking for bkt_<season>_w<n>. A field that is not
   shaped like a week key cannot be read as a missing or a sealed one. */
ok('the field does not match the week-key shape',
  /^bkt_\d+_w\d+$/.test(M.BK_MAKEGOOD.field), false);

/* ── the rule, at the source ─────────────────────────────────────────────── */
head('undo and start over cannot bring it back');
const gen = grab('function ntBkMakeGood(out){');
ok('the generator itself refuses once claimed',
  /if\(_bkFixClaimed!==false\) return;/.test(gen), true);
const claim = grab('async function ntClaimBk(){');
ok('the flag is only set after the write lands',
  claim.indexOf('_bkFixClaimed=true') > claim.indexOf('if(!r||r.error)'), true);
ok('a failed write leaves the card up', /renderNotifications\(\); return;/.test(claim), true);
ok('and it is taken off the undo stack as it is claimed',
  /_ntUndo=_ntUndo\.filter\(id=>id!==BK_MAKEGOOD\.id\)/.test(claim), true);

const sync = grab('async function ntSync(){');
ok('the claim is read from the profile, not from local storage',
  /_bkFixClaimed=!!\(res&&res\.data&&res\.data\[BK_MAKEGOOD\.field\]/.test(sync), true);

console.log('\n' + (fail ? 'FAILED  ' : 'ok  ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
