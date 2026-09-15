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

const grab = lifter(new URL('../public/app.js', import.meta.url));
const require_src = () => fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const M = assemble(grab, [
  'const bkScoreKey=', 'function bkLiveTrivia(p){',
  'const BK_WEEK_QS=', 'const bkAnsKeyFor=', 'function bkUnsealed(p){',
], ['bkScoreKey', 'bkLiveTrivia', 'bkUnsealed', 'bkAnsKeyFor',
    'setQs', 'setLocked', 'setReveal', 'setWeek', 'setKey'],
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
   /* the published key, which grading now prefers over the set in hand */
   'let _KEY=null;',
   'const bkCorrect=()=>_KEY;',
   'const setKey=k=>{_KEY=k;};',
   'const setWeek=w=>{_WK=w;};'].join(NL));

const QS = [{ correct: 'a' }, { correct: 'b' }, { correct: 'c' }, { correct: 'd' }, { correct: 'e' }];
const KEY = ['a', 'b', 'c', 'd', 'e'];
const row = ans => ({ 'bk_2026_w1': JSON.stringify(ans) });

head('the key names the week');
ok('week 1', M.bkScoreKey(1), 'bkt_2026_w1');
ok('week 9', M.bkScoreKey(9), 'bkt_2026_w9');

head('while the slate is open, blanks cost nothing');
M.setQs(QS); M.setKey(KEY); M.setLocked(false);
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

head('the published key grades without the questions being on screen');
/* This used to need the questions in hand, which is why grading could happen
   against a substituted set. The key is the authority now: the answers are on
   file and the marking scheme is published, so the questions are only needed to
   DRAW the card. */
M.setQs([]);
ok('five blanks after the whistle still cost five', M.bkLiveTrivia(row({})), -5);
ok('and a right answer still counts',
  M.bkLiveTrivia(row({ 0: 'a', 1: 'b', 2: 'c', 3: 'd', 4: 'e' })), 5);
M.setQs(QS);

head('with no key published yet, nothing is graded at all');
M.setKey(undefined);
ok('it declines rather than guessing', M.bkLiveTrivia(row({ 0: 'a', 1: 'b' })), 0);
M.setKey(KEY);

/* ── how bkIQFor puts it together ─────────────────────────────────────────── */
head('sealed weeks are summed, and the live week is not double counted');
const src = grab('function bkIQFor(teamId){');
ok('it sums every sealed week', /\/\^bkt_\/\.test\(k\)/.test(src), true);
/* live grading is back, and correct, now that bkBuildWeek emits in the seeded
   order -- but only for a week that was SUBMITTED and not yet sealed */
ok('it grades a submitted, unsealed week live',
  /p\[bkScoreKey\(bkWeek\(\)\)\]==null&&p\[bkSubKey\(\)\]/.test(src), true);
ok('the old current-week-only grading is gone',
  /qs\.forEach\(\(q,i\)=>\{[\s\S]{0,120}score\+=/.test(src), false);

head('submit is what seals a week');
const app = require_src();
ok('bkSubmit writes the score itself', /\[bkScoreKey\(bkWeek\(\)\)\]:sealed/.test(app), true);
ok('and it grades against the published key', /key5\.reduce/.test(app), true);

head('the answer key is published and graded against');
ok('the cross-profile sealer is gone', /bkSealLeague\s*\(/.test(app), false);
ok('a full set publishes the key', /bkPublishCorrect\(qs\)/.test(app), true);
ok('it never overwrites one already published', /if\(_bkCorrect\[k\]\) return;/.test(app), true);
ok('grading prefers the published key', /const correct=key\|\|qs\.map/.test(app), true);
ok('and grades nothing while the key is still unknown',
  /if\(key===undefined\) return 0;/.test(app), true);
ok('submit seals against the published key too', /key5\.reduce/.test(app), true);

head('a past week nobody submitted is a flat minus five');
M.setWeek(4);
ok('three weeks never submitted', M.bkUnsealed({}), -15);
ok('one sealed, two missed', M.bkUnsealed({ 'bkt_2026_w1': '5' }), -10);
ok('a sealed week is never charged twice',
  M.bkUnsealed({ 'bkt_2026_w1': '-5', 'bkt_2026_w2': '3', 'bkt_2026_w3': '0' }), 0);

head('the set is graded as a GROUP — a draft is not a partial attempt');
ok('four of five answered but never submitted is still minus five',
  M.bkUnsealed({ 'bk_2026_w1': JSON.stringify({ 0: 'a', 1: 'b', 2: 'c', 3: 'd' }),
    'bkt_2026_w2': '0', 'bkt_2026_w3': '0' }), -5);
ok('submitted but not yet sealed is left at nothing, not charged',
  M.bkUnsealed({ 'bk_2026_w1_sub': '1', 'bkt_2026_w2': '0', 'bkt_2026_w3': '0' }), 0);
ok('answering one without submitting buys no immunity',
  M.bkUnsealed({ 'bk_2026_w1': JSON.stringify({ 0: 'a' }),
    'bkt_2026_w2': '0', 'bkt_2026_w3': '0' }), -5);

head('the current week is never charged as missed — it is still open');
M.setWeek(1);
ok('week 1, nothing before it', M.bkUnsealed({}), 0);
M.setWeek(2);
ok('only week 1 is past', M.bkUnsealed({}), -5);

head('and bkIQFor adds the unsealed weeks in');
const iq = grab('function bkIQFor(teamId){');
ok('it charges past weeks nobody played', /score\+=bkUnsealed\(p\)/.test(iq), true);

console.log(NL + (fail ? 'FAILED  ' : 'ok  ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
