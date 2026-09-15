/* A WEEK'S TRIVIA SCORE OUTLIVES ITS QUESTIONS.
 *
 * bkIQFor used to grade bkQuestions() and nothing else — the CURRENT week's set
 * — because the generators read live data and a past week cannot be rebuilt. So
 * a manager who went five from five in week 1 lost every point of it the moment
 * the week turned over: Ball Knowledge was a rolling weekly number wearing the
 * clothes of a season total.
 *
 * A week is SEALED when its slate locks: one integer on the manager's own
 * profile, bkt_<season>_w<week>, written once and never recomputed. Past weeks
 * are summed from those, the current week is still graded live so the bar moves
 * as answers go in, and the two never both count the same week.
 *
 * Run: node scripts/test-bktrivia.mjs
 */
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

const grab = lifter(new URL('../public/app.js', import.meta.url));
const M = assemble(grab, [
  'const bkScoreKey=', 'function bkLiveTrivia(p){',
  'const BK_WEEK_QS=', 'const bkAnsKeyFor=', 'function bkUnsealed(p){',
], ['bkScoreKey', 'bkLiveTrivia', 'bkUnsealed', 'bkAnsKeyFor',
    'setQs', 'setLocked', 'setReveal', 'setWeek'],
  ['let _QS=[], _LOCKED=false, _REVEAL=true;',
   'const _CFG={get ballKnowledge(){return {reveal:_REVEAL};}};',
   'const bkLeagueSeason=()=>2026;',
   'const bkWeek=()=>_WK; let _WK=1;',
   'const bkKey=()=>`bk_2026_w${_WK}`;',
   'const bkQuestions=()=>_QS;',
   'const pkLocked=()=>_LOCKED;',
   'const setQs=q=>{_QS=q;};',
   'const setLocked=v=>{_LOCKED=v;};',
   'const setReveal=v=>{_REVEAL=v;};',
   'const setWeek=w=>{_WK=w;};'].join(NL));

const QS = [{ correct: 'a' }, { correct: 'b' }, { correct: 'c' }, { correct: 'd' }, { correct: 'e' }];
const row = ans => ({ 'bk_2026_w1': JSON.stringify(ans) });

head('the key names the week');
ok('week 1', M.bkScoreKey(1), 'bkt_2026_w1');
ok('week 9', M.bkScoreKey(9), 'bkt_2026_w9');

head('while the slate is open, blanks cost nothing');
M.setQs(QS); M.setLocked(false);
ok('three right, two unanswered', M.bkLiveTrivia(row({ 0: 'a', 1: 'b', 2: 'c' })), 3);
ok('two right one wrong, two unanswered', M.bkLiveTrivia(row({ 0: 'a', 1: 'b', 2: 'x' })), 1);
ok('nothing answered at all', M.bkLiveTrivia(row({})), 0);

head('once it locks, a blank is worth minus one');
M.setLocked(true);
ok('three right, two blank', M.bkLiveTrivia(row({ 0: 'a', 1: 'b', 2: 'c' })), 1);
ok('a perfect five', M.bkLiveTrivia(row({ 0: 'a', 1: 'b', 2: 'c', 3: 'd', 4: 'e' })), 5);
ok('five wrong', M.bkLiveTrivia(row({ 0: 'x', 1: 'x', 2: 'x', 3: 'x', 4: 'x' })), -5);
ok('answered nothing all week', M.bkLiveTrivia(row({})), -5);

head('a negative week really is negative — it subtracts');
ok('one right, four wrong', M.bkLiveTrivia(row({ 0: 'a', 1: 'x', 2: 'x', 3: 'x', 4: 'x' })), -3);

head('with the reveal off, trivia is worth nothing either way');
M.setReveal(false);
ok('a perfect five scores 0', M.bkLiveTrivia(row({ 0: 'a', 1: 'b', 2: 'c', 3: 'd', 4: 'e' })), 0);
M.setReveal(true);

head('no questions in hand means no score rather than minus five');
M.setQs([]);
ok('the set has not generated yet', M.bkLiveTrivia(row({})), 0);
M.setQs(QS);

/* ── how bkIQFor puts it together ─────────────────────────────────────────── */
head('sealed weeks are summed, and the live week is not double counted');
const src = grab('function bkIQFor(teamId){');
ok('it sums every sealed week', /\/\^bkt_\/\.test\(k\)/.test(src), true);
ok('and grades the current week only while it is unsealed',
  /p\[bkScoreKey\(bkWeek\(\)\)\]==null/.test(src), true);
ok('the old current-week-only grading is gone',
  /qs\.forEach\(\(q,i\)=>\{[\s\S]{0,120}score\+=/.test(src), false);

head('the sealer only ever writes its own row, once, and only when locked');
const seal = grab('async function bkSealWeek(){');
ok('it requires a signed-in manager', /if\(!_me/.test(seal), true);
ok('it requires the slate to be locked', /pkLocked\(\)/.test(seal), true);
ok('it refuses to write twice', /row\[key\]!=null/.test(seal), true);
ok('it refuses to grade against a SHORT set', /qs\.length<BK_WEEK_QS/.test(seal), true);
ok('it patches only _me', /gflPatchProfile\(_me\.k1/.test(seal), true);
ok('and rolls back the local seal if the write fails', /delete row\[key\]/.test(seal), true);

head('a past week nobody answered costs the whole set');
M.setWeek(4);
ok('three unplayed weeks', M.bkUnsealed({}), -15);
ok('one sealed, two unplayed', M.bkUnsealed({ 'bkt_2026_w1': '5' }), -10);
ok('a sealed week is never charged twice',
  M.bkUnsealed({ 'bkt_2026_w1': '-5', 'bkt_2026_w2': '3', 'bkt_2026_w3': '0' }), 0);

head('every question left blank is minus one, counted one at a time');
ok('answered one of five, four blanks',
  M.bkUnsealed({ 'bk_2026_w1': JSON.stringify({ 0: 'a' }), 'bkt_2026_w2': '0', 'bkt_2026_w3': '0' }), -4);
ok('answered two of five, three blanks',
  M.bkUnsealed({ 'bk_2026_w1': JSON.stringify({ 0: 'a', 1: 'b' }), 'bkt_2026_w2': '0', 'bkt_2026_w3': '0' }), -3);
ok('answered all five, nothing to charge',
  M.bkUnsealed({ 'bk_2026_w1': JSON.stringify({ 0: 'a', 1: 'b', 2: 'c', 3: 'd', 4: 'e' }),
    'bkt_2026_w2': '0', 'bkt_2026_w3': '0' }), 0);
ok('answering one does not buy immunity for the other four',
  M.bkUnsealed({ 'bk_2026_w1': JSON.stringify({ 0: 'a' }), 'bkt_2026_w2': '0', 'bkt_2026_w3': '0' })
    !== M.bkUnsealed({ 'bkt_2026_w2': '0', 'bkt_2026_w3': '0', 'bk_2026_w1': '{}' }), true);
ok('an empty answer object still counts as absent',
  M.bkUnsealed({ 'bk_2026_w1': '{}', 'bkt_2026_w2': '0', 'bkt_2026_w3': '0' }), -5);
ok('unparseable answers count as absent',
  M.bkUnsealed({ 'bk_2026_w1': 'junk', 'bkt_2026_w2': '0', 'bkt_2026_w3': '0' }), -5);

head('the current week is never charged as unplayed — it is graded live');
M.setWeek(1);
ok('week 1, nothing before it', M.bkUnsealed({}), 0);
M.setWeek(2);
ok('only week 1 is past', M.bkUnsealed({}), -5);

head('and bkIQFor adds the unsealed weeks in');
const iq = grab('function bkIQFor(teamId){');
ok('it charges past weeks nobody played', /score\+=bkUnsealed\(p\)/.test(iq), true);

console.log(NL + (fail ? 'FAILED  ' : 'ok  ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
