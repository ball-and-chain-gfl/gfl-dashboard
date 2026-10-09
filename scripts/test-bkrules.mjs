/* BALL KNOWLEDGE AND THE COACHES' POLL: THE OCTOBER 2026 RULES.
 *
 *   TWO A CALL          a right answer or pick +2, a wrong one -2, the Matchup
 *                       of the Week double (4); the one-off make-good stays 1
 *   MINUS ONE A SKIP    a week of picks never sent is -1 a matchup (six), back
 *                       to week 1, once that week has locked; a trivia set never
 *                       sent stays -5
 *   THE POLL CLOSES     at the first Sunday kickoff, judged in Eastern time --
 *                       9:30 on a London week, 1pm otherwise, a Sunday night game
 *                       counting as Sunday although it is Monday in UTC -- and
 *                       the moment any Sunday game is under way
 *
 * Run: node scripts/test-bkrules.mjs
 */
import { lifter, assemble } from './lib/lift.mjs';

const NL = String.fromCharCode(10);
let pass = 0, fail = 0;
const ok = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; console.log('  PASS  ' + name); return; }
  fail++;
  console.log('  FAIL  ' + name + NL + '          got  ' + g + NL + '          want ' + w);
};
const head = t => console.log(NL + t);
const grab = lifter(new URL('../public/app.js', import.meta.url));

/* ── Ball Knowledge ───────────────────────────────────────────────────────── */
const sched = [];
for (let w = 1; w <= 14; w++) for (let g = 0; g < 6; g++)
  sched.push({ matchupPeriodId: w, home: { teamId: g * 2 + 1 }, away: { teamId: g * 2 + 2 } });
const B = assemble(grab, [
  'const bkIQCfg=', 'const BK_WEEK_QS=', 'const bkAnsKeyFor=', 'const bkScoreKey=', 'function bkUnsealed(p){',
  'function weeksOf(', 'const BK_PT=', 'function bkPicksMissed(p){', 'function bkIQFor(teamId){',
], ['bkIQFor', 'bkPicksMissed', 'setRows', 'setStarted', 'setPicks'], [
  "const _CFG={ballKnowledge:{iq:{step:1,min:70,max:230}}};",
  "const bkLeagueSeason=()=>'2026'; const bkWeek=()=>5;",
  "const bkSubKey=()=>'bk_2026_w5_sub';",
  "let _liveInfo={week:5,season:'2026'}; const liveWeekInfo=()=>_liveInfo;",
  `const _seasonMeta={2026:{schedule:${JSON.stringify(sched)}}};`,
  "let _started=false; const weekHasStarted=()=>_started; const setStarted=v=>{_started=v;};",
  /* the graders are their own suites' business: here they are numbers in ones */
  "let _picks=0; const bkPickScore=()=>_picks; const setPicks=v=>{_picks=v;};",
  "const bkLiveTrivia=()=>0;",
  "let _bkProfiles=[]; const setRows=r=>{_bkProfiles=r;};",
].join(NL));
const bkAns = w => `bk_2026_w${w}`;
/* a profile with every trivia week sent and the picks weeks given */
const prof = (teamId, pickWeeks, extra = {}) => {
  const p = { id: 't' + teamId, teamId: String(teamId), ...extra };
  [1, 2, 3, 4].forEach(w => { p[bkAns(w) + '_sub'] = '1'; });
  pickWeeks.forEach(w => { p[`pk_2026_w${w}`] = '{"1-2":"1"}'; });
  return p;
};

head('two a call');
B.setRows([prof(1, [1, 2, 3, 4], { bkt_2026_w1: 3 })]);
B.setPicks(2);
ok('3 net right on trivia and 2 net right on picks is 10, not 5', B.bkIQFor(1), 160);
B.setPicks(-3);
ok('and wrong costs two as well', B.bkIQFor(1), 150);
B.setRows([prof(1, [1, 2, 3, 4], { bkt_2026_w1: 0, bkt_fix1: 1 })]); B.setPicks(0);
ok('the one-off make-good is still the one point it was given', B.bkIQFor(1), 151);

head('minus one a skip');
B.setRows([prof(2, [1, 4])]);
ok('two weeks of picks never sent is minus twelve', B.bkIQFor(2), 138);
ok('six a week, one a matchup', B.bkPicksMissed(_p(2, [1, 4])), -12);
function _p(t, w) { return prof(t, w); }
ok('the week on the board is not charged while it is still open', B.bkPicksMissed(prof(2, [1, 2, 3, 4])), 0);
B.setStarted(true);
ok('and is, from its first kickoff', B.bkPicksMissed(prof(2, [1, 2, 3, 4])), -6);
B.setStarted(false);
ok('a week with only its submitted flag counts as sent',
  B.bkPicksMissed({ ...prof(2, [1, 2, 3]), pk_2026_w4_sub: '1' }), 0);
ok('a key from another season does not count for this one',
  B.bkPicksMissed({ ...prof(2, [1, 2, 3]), pk_2025_w4: '{"1-2":"1"}' }), -6);
const noTrivia = prof(3, [1, 2, 3, 4]); delete noTrivia[bkAns(2) + '_sub'];
B.setRows([noTrivia]);
ok('a trivia set never sent is still minus five, not ten', B.bkIQFor(3), 145);
B.setRows([prof(4, [])]);
ok('a season of nothing hits the floor rather than going through it', B.bkIQFor(4) >= 70, true);

/* ── when the poll closes ─────────────────────────────────────────────────── */
let NOW = 0, GAMES = null;
const C = assemble(grab, [
  'function nflWeekKickoffMs(season,w){', 'const CP_ET_DAY=', 'const CP_ET_HOUR=',
  'function cpLockInfo(){', 'const cpLockAt=', 'function cpLocked(){',
], ['cpLockAt', 'cpLocked', 'set'], [
  "let _liveInfo={week:5,season:'2026'}; const liveWeekInfo=()=>_liveInfo;",
  "let _games=null, _now=0; const nflWeekGames=()=>_games;",
  "Date.now=()=>_now;",
  "const set=(g,n,wk)=>{ if(g!==undefined) _games=g; if(n!==undefined) _now=n; if(wk) _liveInfo={week:wk,season:'2026'}; };",
].join(NL));
const U = (d, h, m = 0) => Date.UTC(2026, 9, d, h, m);        // October 2026, UTC
const game = (k, s = 'pre') => ({ k, s });
const WEEK5 = { games: [
  game(U(9, 0, 15), 'post'),          // Thursday 8:15pm Eastern -- Friday in UTC
  game(U(11, 13, 30)),                // Sunday 9:30am Eastern, London
  game(U(11, 17)), game(U(11, 17)),   // Sunday 1pm
  game(U(12, 0, 20)),                 // Sunday 8:20pm Eastern -- Monday in UTC
  game(U(13, 0, 15)),                 // Monday night
] };

head('the poll closes when Sunday kicks off');
C.set(WEEK5, U(10, 12));
ok('Thursday night is not the deadline', C.cpLocked(), false);
ok('the first Sunday kickoff is, London included', C.cpLockAt(), U(11, 13, 30));
C.set({ games: WEEK5.games.filter((g, i) => i !== 1) });
ok('1pm on a week with no London game', C.cpLockAt(), U(11, 17));
C.set({ games: [game(U(9, 0, 15), 'post'), game(U(12, 0, 20))] });
ok('a Sunday night game is Sunday, though it is Monday in UTC', C.cpLockAt(), U(12, 0, 20));
C.set(WEEK5, U(11, 13, 29));
ok('a minute before, still open', C.cpLocked(), false);
C.set(undefined, U(11, 13, 30));
ok('at kickoff, closed', C.cpLocked(), true);
C.set({ games: WEEK5.games.map((g, i) => i === 1 ? { ...g, s: 'in' } : g) }, U(11, 12));
ok('and once a Sunday game is under way, closed whatever the clock says', C.cpLocked(), true);

head('before the scoreboard is in hand');
C.set(null, U(10, 12), 5);
ok('1pm Eastern off the calendar: 17:00 UTC in October', C.cpLockAt(), U(11, 17));
C.set(null, U(10, 12), 10);
ok('and 18:00 UTC once the clocks have gone back', C.cpLockAt(), Date.UTC(2026, 10, 15, 18));
C.set({ games: [{ s: 'pre' }] }, U(10, 12), 5);
ok('a digest from before it carried kickoffs falls back the same way', C.cpLockAt(), U(11, 17));

console.log(NL + (fail ? 'FAILED  ' : 'ok  ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
