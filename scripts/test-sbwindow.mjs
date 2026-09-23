/* WHEN THE BOOK IS OPEN, AND WHY.
 *
 * Two rules, and they answer different complaints.
 *
 * 1. A fixture market reopens in the GAP between slates. Thursday night is
 *    played, both rosters have points banked and starters still to come, and
 *    sbTeamWeek already prices exactly that. Only the three markets written on
 *    one game -- everything written across the whole slate stays shut, because
 *    by Friday morning you can read half of them off the scoreboard.
 *
 * 2. A week does not open until the week BEHIND it has settled. The ratings
 *    move every time one more fixture stops reading 0-0, so the board used to
 *    reopen on the last whistle and let its own numbers walk all Tuesday --
 *    whoever got up early bet into a line the house knew was about to move.
 *
 * Run: node scripts/test-sbwindow.mjs
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

const M = assemble(lifter(new URL('../public/app.js', import.meta.url)), [
  'const SB_EXCLUSIVE=',
  'const nflWeekBegun=',
  'const nflWeekDone=',
  'const nflWeekGap=',
  'function sbPriorSettled(wk,season){',
  'function sbWeekLocked(wk,mk){',
], ['sbWeekLocked', 'sbPriorSettled', 'nflWeekGap', 'setDigest', 'setSched', 'setStarted'],
  ['let _seasonMeta={};',
   'let _digest={};',
   'let _started=false;',
   'const sbBoardSeason=()=>2026;',
   'const weekHasStarted=()=>_started;',
   'const betWeekStarted=(s,w)=>_started;',
   'const nflWeekGames=(w,s)=>_digest[Number(w)]||null;',
   // a week of 16 games, each given a status
   'const setDigest=(w,statuses)=>{_digest[w]={games:statuses.map((st,i)=>({id:i,s:st}))};};',
   'const setSched=(w,pts)=>{const m=(_seasonMeta["2026"]||(_seasonMeta["2026"]={schedule:[]}));' +
     'm.schedule=m.schedule.filter(x=>Number(x.matchupPeriodId)!==w).concat(' +
     'pts.map(p=>({matchupPeriodId:w,home:{totalPoints:p[0]},away:{totalPoints:p[1]}})));};',
   'const setStarted=v=>{_started=v;};'].join(NL));

const ALL = st => Array.from({ length: 16 }, () => st);
const ML = 'wk3-1-4-ml', SP = 'wk3-1-4-sp', TOT = 'wk3-1-4-tot';
const TOPSCORE = 'wk3-high', DONUT = 'wk3-donut', PLAYER = 'wk3-player';

/* week 2 finished and settled throughout, so rule 2 is satisfied and every
   case below is really about rule 1 */
const settlePrior = () => {
  M.setDigest(2, ALL('post'));
  M.setSched(2, [[120, 100], [110, 99], [130, 88], [101, 100], [95, 94], [140, 77]]);
};

head('the gap itself');
settlePrior();
M.setDigest(3, ALL('pre'));
ok('before a ball is kicked there is football to come', M.nflWeekGap(3, 2026), true);
M.setDigest(3, ['in', ...ALL('pre').slice(1)]);
ok('somebody on the field is not a gap', M.nflWeekGap(3, 2026), false);
M.setDigest(3, ['post', ...ALL('pre').slice(1)]);
ok('Thursday done and Sunday to come IS a gap', M.nflWeekGap(3, 2026), true);
M.setDigest(3, ALL('post'));
ok('a finished week is not a gap', M.nflWeekGap(3, 2026), false);
/* the Monday-afternoon gap, which is the one this must NOT open. Fifteen games
   played, one to come: the whole of Sunday is known and a price struck now is
   a payout rather than a market. It is what killed this carve-out last time. */
M.setDigest(3, [...ALL('post').slice(1), 'pre']);
ok('one game left after a full Sunday is not a gap', M.nflWeekGap(3, 2026), false);
M.setDigest(3, ['post', 'post', ...ALL('pre').slice(2)]);
ok('but a December Friday with the slate to come is', M.nflWeekGap(3, 2026), true);
M.setDigest(3, [...ALL('post').slice(0, 8), ...ALL('pre').slice(0, 8)]);
ok('an even split is not enough', M.nflWeekGap(3, 2026), false);
M.setDigest(3, []);
ok('no digest is an unknown, not a gap', M.nflWeekGap(3, 2026), null);

head('a fixture market reopens between slates');
settlePrior();
M.setStarted(true);                       // points are on the board from Thursday
M.setDigest(3, ['post', ...ALL('pre').slice(1)]);
ok('moneyline is open', M.sbWeekLocked(3, ML), false);
ok('so is the spread', M.sbWeekLocked(3, SP), false);
ok('and the total', M.sbWeekLocked(3, TOT), false);

head('and the slate-wide markets do not');
ok('top score stays shut', M.sbWeekLocked(3, TOPSCORE), true);
ok('the donut stays shut', M.sbWeekLocked(3, DONUT), true);
ok('top player stays shut', M.sbWeekLocked(3, PLAYER), true);

head('football on the field shuts everything again');
M.setDigest(3, ['post', 'in', ...ALL('pre').slice(2)]);
ok('moneyline closed', M.sbWeekLocked(3, ML), true);
ok('spread closed', M.sbWeekLocked(3, SP), true);
ok('and the slate markets were never open', M.sbWeekLocked(3, TOPSCORE), true);

head('a finished week closes for good');
M.setDigest(3, ALL('post'));
ok('no gap left to reopen into', M.sbWeekLocked(3, ML), true);

head('before the week starts the board is open as it always was');
settlePrior();
M.setStarted(false);
M.setDigest(3, ALL('pre'));
ok('fixture market open', M.sbWeekLocked(3, ML), false);
ok('slate market open too', M.sbWeekLocked(3, TOPSCORE), false);

/* ── rule 2 ───────────────────────────────────────────────────────────────── */
head('a week does not open until the one behind it has settled');
M.setDigest(3, ALL('pre'));
M.setStarted(false);
M.setDigest(2, ALL('post'));
M.setSched(2, [[120, 100], [110, 99], [0, 0], [101, 100], [95, 94], [140, 77]]);
ok('one fixture still reading 0-0 holds it shut', M.sbPriorSettled(3, 2026), false);
ok('so the fixture market is locked', M.sbWeekLocked(3, ML), true);
ok('and so is everything else that week', M.sbWeekLocked(3, TOPSCORE), true);

head('the last fixture settling is what opens it');
M.setSched(2, [[120, 100], [110, 99], [88, 130], [101, 100], [95, 94], [140, 77]]);
ok('the prior week has settled', M.sbPriorSettled(3, 2026), true);
ok('and the board opens', M.sbWeekLocked(3, ML), false);

head('a week still being PLAYED is not settled either');
M.setDigest(2, ['in', ...ALL('post').slice(1)]);
ok('a game still running holds the next week shut', M.sbPriorSettled(3, 2026), false);
ok('whatever the points say', M.sbWeekLocked(3, ML), true);

head('week one has nothing behind it');
M.setDigest(1, ALL('pre'));
ok('and opens on its own', M.sbPriorSettled(1, 2026), true);

head('an unknown reads as settled rather than holding the board shut');
/* the same call the lock below makes: a board up for a second costs one bet at
   a stale price; a board held shut costs every manager the week */
M.setDigest(9, ALL('pre'));
ok('no digest for the week behind', M.sbPriorSettled(9, 2026), true);

head('a season future never comes through here');
M.setStarted(true);
ok('no week named falls back to the blunt test', M.sbWeekLocked(null, 'champ'), true);
M.setStarted(false);
ok('and answers the other way when nothing has started', M.sbWeekLocked(null, 'champ'), false);

console.log(NL + (fail ? 'FAILED  ' : 'ok  ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
