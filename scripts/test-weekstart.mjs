/* HAS THE WEEK STARTED, AND WHOSE PICK IS IT?
 *
 * Two bugs that showed up together on the homepage on the Thursday of week 1,
 * with the same cause underneath: a piece of derived state that more than one
 * part of the app worked out for itself, differently.
 *
 * 1. THE LOCK. weekHasStarted decided a week was under way by asking whether
 *    any fantasy fixture carried a totalPoints. That is not a start signal, it
 *    is a SETTLEMENT signal -- ESPN leaves totalPoints at 0.00 for the whole
 *    week and fills it when the week is graded. So on the Thursday, with
 *    Wednesday night's game finished and 26.2 points on the board, all six
 *    fixtures read 0.00, weekHasStarted said false, and the weekly picks panel
 *    offered a Reopen button after kickoff.
 *
 *    It now asks nflWeekBegun, which reads the public NFL scoreboard for THIS
 *    fantasy week -- 'in' or 'post' on any game and the week has begun, and
 *    neither state ever goes back to 'pre', so it latches.
 *
 * 2. THE SLATE. Picks were filed under a game's INDEX in pkGames(), and there
 *    are two differently ordered copies of a week's fixtures in the app: the
 *    season schedule with the league's drawn order applied, and ESPN's own
 *    order which livePoll refetches and which never sees the drawn override.
 *    A slate picked against one and read against the other came back pointing
 *    at the wrong games. They are now keyed by the fixture itself.
 *
 * Run: node scripts/test-weekstart.mjs
 */
import { lifter, assemble } from './lib/lift.mjs';

const grab = lifter(new URL('../public/app.js', import.meta.url));

let pass = 0, fail = 0;
const ok = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; return; }
  fail++;
  console.log('  FAIL  ' + name + '\n          got  ' + g + '\n          want ' + w);
};
const head = t => console.log('\n' + t);

/* ── 1. weekHasStarted ─────────────────────────────────────────────────────
   Lifted with nflWeekBegun and liveWeekInfo stubbed, because the real ones
   reach for the network. The stubs are the two answers the real ones give. */
const W = assemble(grab, ['function weekHasStarted(){'], ['weekHasStarted'],
  'let _liveInfo=null, _begun=null;\n'
  + 'const nflWeekBegun=()=>_begun;\n'
  + 'const liveWeekInfo=()=>null;\n'
  + 'const setInfo=v=>{_liveInfo=v;};\n'
  + 'const setBegun=v=>{_begun=v;};\n');

/* re-lift with the setters exported so the test can drive it */
const WS = assemble(grab, ['function weekHasStarted(){'],
  ['weekHasStarted', 'setInfo', 'setBegun'],
  'let _liveInfo=null, _begun=null;\n'
  + 'const nflWeekBegun=()=>_begun;\n'
  + 'const liveWeekInfo=()=>null;\n'
  + 'const setInfo=v=>{_liveInfo=v;};\n'
  + 'const setBegun=v=>{_begun=v;};\n');

/* The exact shape of the live regression: six fixtures, real football played,
   every totalPoints still 0.00 because ESPN has not graded the week. */
const DEAD_TOTALS = {
  season: 2026, week: 1,
  games: [
    { home: { teamId: 1, totalPoints: 0, totalPointsLive: 7.8 },  away: { teamId: 2, totalPoints: 0, totalPointsLive: 26.2 } },
    { home: { teamId: 3, totalPoints: 0, totalPointsLive: 14 },   away: { teamId: 4, totalPoints: 0, totalPointsLive: 0 } },
    { home: { teamId: 5, totalPoints: 0, totalPointsLive: 9.82 }, away: { teamId: 6, totalPoints: 0, totalPointsLive: 0 } },
  ],
};
const GRADED = {
  season: 2026, week: 1,
  games: [{ home: { teamId: 1, totalPoints: 118.4 }, away: { teamId: 2, totalPoints: 96.2 } }],
};

head('weekHasStarted — the Thursday of week 1');
WS.setInfo(DEAD_TOTALS);
WS.setBegun(true);
ok('a finished NFL game with every totalPoints at 0.00 still counts as started',
  WS.weekHasStarted(), true);

WS.setBegun(false);
ok('nothing kicked off yet: not started', WS.weekHasStarted(), false);

head('weekHasStarted — before the scoreboard digest lands');
WS.setBegun(null);
WS.setInfo(DEAD_TOTALS);
ok('digest unknown and no fantasy totals: not started', WS.weekHasStarted(), false);
WS.setInfo(GRADED);
ok('digest unknown but the week is graded: started', WS.weekHasStarted(), true);

head('weekHasStarted — the scoreboard beats the totals both ways');
WS.setInfo(GRADED); WS.setBegun(false);
ok('scoreboard says no despite graded totals', WS.weekHasStarted(), false);
WS.setInfo(DEAD_TOTALS); WS.setBegun(true);
ok('scoreboard says yes despite dead totals', WS.weekHasStarted(), true);

head('weekHasStarted — nothing to go on');
WS.setInfo(null); WS.setBegun(true);
ok('no week info at all: not started', WS.weekHasStarted(), false);
WS.setInfo({ season: 2026, week: 1 }); WS.setBegun(null);
ok('week info with no games and no digest: not started', WS.weekHasStarted(), false);

/* ── 2. the slate ──────────────────────────────────────────────────────────── */
const P = assemble(grab, ['const pkFixKey=', 'function pkNormalise(p,games){'],
  ['pkFixKey', 'pkNormalise']);

/* The real week 1. ESPN's order and the league's drawn order hold the same six
   pairings in different positions, with home and away flipped. */
const ESPN = [
  { home: { teamId: 1 }, away: { teamId: 2 } },   // KUNK / BFT
  { home: { teamId: 3 }, away: { teamId: 4 } },   // MWM  / MM
  { home: { teamId: 5 }, away: { teamId: 6 } },   // DORM / MCM
  { home: { teamId: 7 }, away: { teamId: 8 } },   // GOOB / Bi
  { home: { teamId: 9 }, away: { teamId: 10 } },  // WGLR / TING
  { home: { teamId: 11 }, away: { teamId: 12 } }, // FMAN / KW
];
const DRAWN = [
  { home: { teamId: 2 }, away: { teamId: 1 } },   // BFT  @ KUNK  (flipped)
  { home: { teamId: 4 }, away: { teamId: 3 } },   // MM   @ MWM   (flipped)
  { home: { teamId: 6 }, away: { teamId: 5 } },   // MCM  @ DORM  (flipped)
  { home: { teamId: 10 }, away: { teamId: 9 } },  // TING @ WGLR  (moved 4 -> 3)
  { home: { teamId: 12 }, away: { teamId: 11 } }, // KW   @ FMAN  (moved 5 -> 4)
  { home: { teamId: 8 }, away: { teamId: 7 } },   // Bi   @ GOOB  (moved 3 -> 5)
];

head('pkFixKey — the same fixture whichever way round it is written');
ok('home/away flip gives the same key',
  P.pkFixKey(ESPN[3]) === P.pkFixKey(DRAWN[5]), true);
ok('the key is the two teams, low first', P.pkFixKey(ESPN[3]), '7-8');
ok('two fixtures never share a key',
  new Set(ESPN.map(P.pkFixKey)).size, 6);

head('pkNormalise — a slate survives the two orderings (the reported bug)');
/* Six picks tapped against the DRAWN order, filed by position, exactly as the
   old code wrote them. */
const OLD_SLATE = { 0: '1', 1: '3', 2: '5', 3: '9', 4: '11', 5: '7' };
const readBack = P.pkNormalise(OLD_SLATE, ESPN);
ok('all six picks come back', Object.keys(readBack).length, 6);
ok('every pick lands on the fixture its team actually plays in',
  ESPN.every(g => {
    const t = readBack[P.pkFixKey(g)];
    return t != null && (String(g.home.teamId) === t || String(g.away.teamId) === t);
  }), true);
ok('the picked teams are unchanged',
  Object.values(readBack).sort(), ['1', '11', '3', '5', '7', '9']);

/* the same slate read against the order it was written in — must agree */
ok('reading it against the drawn order gives the same answer',
  JSON.stringify(P.pkNormalise(OLD_SLATE, DRAWN)) === JSON.stringify(readBack), true);

head('pkNormalise — what the old code did, for contrast');
/* index keying: the pick at position 3 is team 9, and ESPN's position 3 is
   teams 7 and 8. Nothing highlights. */
const stale = ESPN.filter((g, i) =>
  String(g.home.teamId) === OLD_SLATE[i] || String(g.away.teamId) === OLD_SLATE[i]).length;
ok('only three of six positions still matched by index', stale, 3);
ok('all six match once keyed by fixture',
  ESPN.filter(g => readBack[P.pkFixKey(g)] != null).length, 6);

head('pkNormalise — idempotent, and honest about strays');
ok('normalising a normalised slate changes nothing',
  P.pkNormalise(readBack, ESPN), readBack);
ok('a pick for a team not on this slate is dropped',
  P.pkNormalise({ 0: '1', 1: '99' }, ESPN), { '1-2': '1' });
ok('an empty pick is dropped',
  P.pkNormalise({ 0: '', 1: null, 2: '5' }, ESPN), { '5-6': '5' });
ok('no slate in hand yet: the store is handed back untouched',
  P.pkNormalise({ 0: '1' }, []), { 0: '1' });
ok('a junk store normalises to nothing', P.pkNormalise(null, ESPN), {});

head('pkNormalise — a pick follows its team, not its position');
/* Somebody picks GOOB (7). Whatever position that fixture ends up in, and
   whichever side of it GOOB is on, the pick is still for GOOB. */
[ESPN, DRAWN].forEach((order, i) => {
  const r = P.pkNormalise({ 3: '7' }, order);
  ok('order ' + (i ? 'drawn' : 'espn') + ': the pick is on the 7-8 fixture',
    r, { '7-8': '7' });
});

/* ── 3. the graders ────────────────────────────────────────────────────────
   Three things read a stored slate, and two of them used to read the KEY as a
   position in _seasonMeta's fixture list -- a different order again from either
   of the two the grid is painted from. So a slate could be graded against games
   it was never picked against, and a fixture-keyed slate would have graded as
   nothing at all (Number('7-8') is NaN). Both now resolve the fixture from the
   picked team, which grades either shape and is right for both. */
const GRADER_PRELUDE = [
  'let _seasonMeta={}, _motw=-1;',
  'const getSeason=()=>2026;',
  'const pkMotwIndex=()=>_motw;',
  'const setMeta=v=>{_seasonMeta=v;};',
  'const setMotw=v=>{_motw=v;};',
].join(String.fromCharCode(10));
const G2 = assemble(grab,
  ['function ldPickRecord(prof){', 'function bkPickScore(p){'],
  ['ldPickRecord', 'bkPickScore', 'setMeta', 'setMotw'], GRADER_PRELUDE);

/* A finished week. Home wins three, away wins three. */
const RESULT = [
  { matchupPeriodId: 1, home: { teamId: 1, totalPoints: 120 }, away: { teamId: 2, totalPoints: 99 } },
  { matchupPeriodId: 1, home: { teamId: 3, totalPoints: 88 },  away: { teamId: 4, totalPoints: 104 } },
  { matchupPeriodId: 1, home: { teamId: 5, totalPoints: 131 }, away: { teamId: 6, totalPoints: 90 } },
  { matchupPeriodId: 1, home: { teamId: 7, totalPoints: 77 },  away: { teamId: 8, totalPoints: 111 } },
  { matchupPeriodId: 1, home: { teamId: 9, totalPoints: 115 }, away: { teamId: 10, totalPoints: 101 } },
  { matchupPeriodId: 1, home: { teamId: 11, totalPoints: 84 }, away: { teamId: 12, totalPoints: 95 } },
];
const WINNERS = ['1', '4', '5', '8', '9', '12'];
G2.setMeta({ 2026: { schedule: RESULT } });

/* the same slate written three ways: old positions, and fixture keys */
const byPosition = {};
WINNERS.forEach((t, i) => { byPosition[i] = t; });
const byFixture = P.pkNormalise(byPosition, RESULT);

head('the graders read a slate however it is keyed');
G2.setMotw(-1);
ok('a perfect slate keyed by position scores +6',
  G2.bkPickScore({ pk_2026_w1: JSON.stringify(byPosition) }), 6);
ok('a perfect slate keyed by fixture scores the same',
  G2.bkPickScore({ pk_2026_w1: JSON.stringify(byFixture) }), 6);
ok('the pick record agrees, keyed by position',
  G2.ldPickRecord([{ pk_2026_w1: JSON.stringify(byPosition) }]).w, 6);
ok('the pick record agrees, keyed by fixture',
  G2.ldPickRecord([{ pk_2026_w1: JSON.stringify(byFixture) }]).w, 6);

head('the graders are not fooled by the order of the list');
/* the very bug: picks filed against one order, graded against another */
const shuffled = [RESULT[3], RESULT[5], RESULT[0], RESULT[4], RESULT[2], RESULT[1]];
G2.setMeta({ 2026: { schedule: shuffled } });
ok('a perfect slate is still perfect when the fixture list is reordered',
  G2.bkPickScore({ pk_2026_w1: JSON.stringify(byPosition) }), 6);
ok('and the record still reads 6-0',
  [G2.ldPickRecord([{ pk_2026_w1: JSON.stringify(byPosition) }]).w,
   G2.ldPickRecord([{ pk_2026_w1: JSON.stringify(byPosition) }]).l], [6, 0]);
G2.setMeta({ 2026: { schedule: RESULT } });

head('every call is still graded, right and wrong');
const allWrong = {};
['2', '3', '6', '7', '10', '11'].forEach((t, i) => { allWrong[i] = t; });
ok('a slate of six losers scores -6', G2.bkPickScore({ pk_2026_w1: JSON.stringify(allWrong) }), -6);
ok('and reads 0-6', [G2.ldPickRecord([{ pk_2026_w1: JSON.stringify(allWrong) }]).w,
  G2.ldPickRecord([{ pk_2026_w1: JSON.stringify(allWrong) }]).l], [0, 6]);

head('the Matchup of the Week still counts double, on the right game');
G2.setMotw(2);                                  // teams 5 and 6
ok('calling the featured game right is worth two',
  G2.bkPickScore({ pk_2026_w1: JSON.stringify(byFixture) }), 7);
ok('calling it wrong is worth minus two',
  G2.bkPickScore({ pk_2026_w1: JSON.stringify({ ...byFixture, '5-6': '6' }) }), 3);
G2.setMotw(-1);

head('an unplayed week is pending, not lost');
G2.setMeta({ 2026: { schedule: RESULT.map(g => ({ ...g,
  home: { ...g.home, totalPoints: 0 }, away: { ...g.away, totalPoints: 0 } })) } });
const pend = G2.ldPickRecord([{ pk_2026_w1: JSON.stringify(byFixture) }]);
ok('six pending, none graded', [pend.w, pend.l, pend.pending], [0, 0, 6]);
ok('and it scores nothing', G2.bkPickScore({ pk_2026_w1: JSON.stringify(byFixture) }), 0);
G2.setMeta({ 2026: { schedule: RESULT } });

/* ── report ───────────────────────────────────────────────────────────────── */
console.log('\n' + (fail ? 'FAILED  ' : 'ok  ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
