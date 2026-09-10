/* WHAT A TEAM IS PRICED ON.
 *
 * The sportsbook rates a team on the best legal lineup it could field, not on
 * the lineup it actually set. That distinction is the whole point: anything read
 * off the lineup as set is gameable. Sit the whole starting eleven, lose by
 * ninety, and next week's price has you as a long underdog — then put everybody
 * back and collect. What a manager holds cannot be faked without genuinely
 * giving the players away.
 *
 * These cases run the real sbBestLineup and sbSlotShape out of public/app.js.
 */
import fs from 'fs';
const SRC = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8')
  .split(String.fromCharCode(13)).join('');

function grab(startsWith) {
  const i = SRC.indexOf(startsWith);
  if (i < 0) throw new Error('not found: ' + startsWith);
  let j = i, depth = 0, started = false;
  for (; j < SRC.length; j++) {
    const c = SRC[j];
    if (c === '{') { depth++; started = true; }
    else if (c === '}') { depth--; if (started && depth === 0) { j++; break; } }
    else if (c === ';' && !started && depth === 0) { j++; break; }
  }
  return SRC.slice(i, j);
}

const api = new Function(`
/* handed in, so the cases decide what the rosters and the scoreboard say */
let _ROST=null, _NFL=null, _SEASON='2026', _STARTED=false, _seasonMeta={};
const sbRosters=()=>_ROST;
const nflWeekGames=()=>_NFL;
const sbBoardSeason=()=>_SEASON;
const weekHasStarted=()=>_STARTED;
const BASE='', _activeTab='book';
/* the week the share market is asked about — invWeekNow reads liveWeekInfo in
   the app, which is a whole other chain of season metadata */
let _INVWK=1;
const invWeekNow=()=>_INVWK;
${grab('const NFL_TEAMS={')}
${grab('const SB_WK_SD=')}
${grab('const SB_WK_MIN_LEFT=')}
${grab('const SB_BENCH_SLOTS=')}
${grab('const LINEUP_SHAPE_FALLBACK=')}
${grab('function sbSlotShape(meta){')}
${grab('function sbBestLineup(entries,projOf,posOf,shape){')}
${grab('function nflTeamState(proTeamId,week,season){')}
${grab('const nflWeekLive=')}
${grab('const nflWeekBegun=')}
${grab('function sbTeamWeek(tid,week,season,meta,banked,started){')}
${grab('function sbErf(x){')}
${grab('const sbNormCdf=')}
${grab('const sbWkSd=')}
${grab('const betAnyPlayed=')}
${grab('const betWeekStarted=')}
${grab('function sbWeekLocked(wk,mk){')}
${grab('function betLegWeek(mk){')}
${grab('function invLocked(){')}
return { LINEUP_SHAPE_FALLBACK, sbSlotShape, sbBestLineup,
  nflTeamState, nflWeekLive, sbTeamWeek, sbNormCdf, sbWkSd, sbWeekLocked,
  betLegWeek, invLocked, SB_WK_SD,
  set(o){ if('rosters' in o) _ROST=o.rosters; if('nfl' in o) _NFL=o.nfl;
           if('meta' in o) _seasonMeta=o.meta; if('invWeek' in o) _INVWK=o.invWeek; } };`)();

let pass = 0, fail = 0;
const eq = (n, g, w) => {
  const a = JSON.stringify(g), b = JSON.stringify(w);
  if (a === b) { pass++; console.log('  ok   ' + n); }
  else { fail++; console.log('  FAIL ' + n + '\n         got  ' + a + '\n         want ' + b); }
};

/* ESPN slot ids: 0 QB, 2 RB, 4 WR, 6 TE, 16 D/ST, 17 K, 20 bench, 21 IR, 23 FLEX.
   These are this league's real counts, read off mSettings. */
const REAL_SLOTS = { 0:1, 2:2, 4:2, 6:1, 16:1, 17:1, 20:5, 21:1, 23:1 };
const SHAPE = { qb:1, rb:2, wr:2, te:1, flex:1, dst:1, k:1 };

console.log('\n1. the lineup shape comes from the league, not from a guess');
{
  eq('this league starts nine', api.sbSlotShape({ slots: REAL_SLOTS }), SHAPE);
  eq('no settings falls back', api.sbSlotShape(null), api.LINEUP_SHAPE_FALLBACK);
  eq('no slots key falls back', api.sbSlotShape({}), api.LINEUP_SHAPE_FALLBACK);
  /* some past seasons come back with the counts stripped out entirely */
  eq('a blob naming no starters falls back',
     api.sbSlotShape({ slots: { 0:0, 2:0, 4:0, 6:0, 16:0, 17:0, 23:0 } }),
     api.LINEUP_SHAPE_FALLBACK);
  eq('a two-flex league is respected',
     api.sbSlotShape({ slots: { ...REAL_SLOTS, 23:2 } }), { ...SHAPE, flex:2 });
}

/* positions are ESPN's defaultPositionId: 1 QB, 2 RB, 3 WR, 4 TE, 5 K, 16 D/ST */
const P = { QB:1, RB:2, WR:3, TE:4, K:5, DST:16 };
const roster = (...players) => players.map(([pos, proj], i) => ({ pid: 100 + i, pos, proj }));
const best = (r, shape) => api.sbBestLineup(r, e => e.proj, e => e.pos, shape || SHAPE);

console.log('\n2. the best legal lineup, not the best nine numbers');
{
  /* a plain roster: one of each named slot plus a flex, and a bench that does
     not count towards anything */
  const r = roster(
    [P.QB, 300], [P.RB, 200], [P.RB, 180], [P.WR, 160], [P.WR, 150],
    [P.TE, 120], [P.DST, 110], [P.K, 100],
    [P.WR, 140],                                  // the flex
    [P.RB, 40], [P.WR, 30], [P.TE, 20],           // bench, ignored
  );
  eq('nine starters, best available',
     best(r), 300 + 200 + 180 + 160 + 150 + 120 + 110 + 100 + 140);

  /* THE HOARDING CASE. Three quarterbacks project higher than anything else on
     the board, and only one of them can start. Summing the top nine projections
     regardless of position — which is what this used to do — paid for all three. */
  const qbs = roster(
    [P.QB, 300], [P.QB, 290], [P.QB, 280],
    [P.RB, 200], [P.RB, 180], [P.WR, 160], [P.WR, 150], [P.TE, 120],
    [P.DST, 110], [P.K, 100], [P.WR, 140],
  );
  eq('only one quarterback is paid for',
     best(qbs), 300 + 200 + 180 + 160 + 150 + 120 + 110 + 100 + 140);
  const topNine = qbs.map(e => e.proj).sort((a, b) => b - a).slice(0, 9).reduce((a, b) => a + b, 0);
  eq('and that is less than the top nine would have said', best(qbs) < topNine, true);
}

console.log('\n3. the flex takes the best of what is left');
{
  const withSpareRB = roster(
    [P.QB, 300], [P.RB, 200], [P.RB, 180], [P.RB, 175],
    [P.WR, 160], [P.WR, 150], [P.TE, 120], [P.DST, 110], [P.K, 100],
  );
  eq('a third running back flexes in',
     best(withSpareRB), 300 + 200 + 180 + 160 + 150 + 120 + 110 + 100 + 175);

  const withSpareTE = roster(
    [P.QB, 300], [P.RB, 200], [P.RB, 180], [P.WR, 160], [P.WR, 150],
    [P.TE, 120], [P.TE, 190], [P.DST, 110], [P.K, 100],
  );
  eq('a second tight end flexes in when it is the best left',
     best(withSpareTE), 300 + 200 + 180 + 160 + 150 + 190 + 120 + 110 + 100);

  eq('a quarterback never flexes',
     best(roster([P.QB, 300], [P.QB, 290], [P.RB, 100], [P.WR, 90])),
     300 + 100 + 90);
}

console.log('\n4. it cannot be moved by who was actually started');
{
  /* The exploit this exists to close. The same roster, described twice: once
     with everybody "in the lineup" and once with the whole starting eleven sat
     on the bench. sbBestLineup is handed the roster, so the two are the same
     number — there is nothing here for a benched lineup to move. */
  const players = [
    [P.QB, 300], [P.RB, 200], [P.RB, 180], [P.WR, 160], [P.WR, 150],
    [P.TE, 120], [P.DST, 110], [P.K, 100], [P.WR, 140],
  ];
  const started = players.map(([pos, proj], i) => ({ pid: 100 + i, pos, proj, slot: 'start' }));
  const benched = players.map(([pos, proj], i) => ({ pid: 100 + i, pos, proj, slot: 'bench' }));
  eq('a sat lineup rates exactly the same', best(benched), best(started));
  eq('and that is the full nine', best(benched), 1460);
}

console.log('\n5. missing and broken data');
{
  eq('an empty roster is zero', best([]), 0);
  eq('a null roster is zero', best(null), 0);
  /* a player the pool did not return has position 0 and no projection */
  eq('unknown positions are skipped',
     best(roster([0, 999], [P.QB, 300], [P.RB, 100])), 400);
  eq('a negative projection never subtracts',
     best(roster([P.QB, -50], [P.RB, 100])), 100);
  eq('a short roster takes what it has',
     best(roster([P.QB, 300], [P.K, 100])), 400);
}

/* ── PART TWO: A WEEK IN PROGRESS ────────────────────────────────────────────
   The board reprices the week being played rather than rolling past it, so it
   needs to know what is banked and what is still to come. */
const near = (n, g, w, tol) => {
  if (Math.abs(g - w) <= (tol == null ? 0.01 : tol)) { pass++; console.log('  ok   ' + n); }
  else { fail++; console.log('  FAIL ' + n + '\n         got  ' + g + '\n         want ~' + w); }
};

console.log('\n6. the normal curve behind the price');
{
  near('an even game is a coin flip', api.sbNormCdf(0), 0.5);
  near('two standard deviations up',  api.sbNormCdf(1.96), 0.975, 0.002);
  near('two down',                    api.sbNormCdf(-1.96), 0.025, 0.002);
  eq('and it only ever goes one way',
     api.sbNormCdf(0.4) > api.sbNormCdf(0.2) && api.sbNormCdf(0.2) > api.sbNormCdf(0), true);
}

console.log('\n7. uncertainty drains out of a week as it is played');
{
  near('a full lineup still to come is a full week',
       api.sbWkSd({ left: 120, full: 120 }), api.SB_WK_SD);
  near('half of it left is narrower',
       api.sbWkSd({ left: 60, full: 120 }), api.SB_WK_SD * Math.SQRT1_2, 0.2);
  near('nothing left is settled', api.sbWkSd({ left: 0, full: 120 }), 0);
}

/* one roster: a legal starting nine plus a bench. proTeam ids are ESPN's —
   6 DAL, 9 GB, 17 NE. pos: 1 QB, 2 RB, 3 WR, 4 TE, 5 K, 16 D/ST. */
const SLOT = { QB:0, RB:2, WR:4, TE:6, DST:16, K:17, FLEX:23, BENCH:20 };
const ent = (pos, slot, wkProj, proTeam) => ({ pid: 1000 + wkProj, pos, slot, wkProj, proTeam });
const TEAM = [
  ent(1, SLOT.QB, 22, 6), ent(2, SLOT.RB, 16, 6), ent(2, SLOT.RB, 14, 9),
  ent(3, SLOT.WR, 13, 9), ent(3, SLOT.WR, 12, 17), ent(4, SLOT.TE, 9, 17),
  ent(16, SLOT.DST, 7, 6), ent(5, SLOT.K, 8, 9), ent(3, SLOT.FLEX, 11, 17),
  ent(2, SLOT.BENCH, 30, 6),          // a monster on the bench
];
const STARTERS = 22 + 16 + 14 + 13 + 12 + 9 + 7 + 8 + 11;   // 112

console.log('\n8. before the week starts, the best lineup it COULD field');
{
  api.set({ rosters: { 7: TEAM }, nfl: { anyLive:false, games:[] }, meta: {} });
  const t = api.sbTeamWeek(7, 1, '2026', {}, 0, false);
  /* The 30-point bench player is legal at running back, so the best available
     lineup takes him. He does not simply replace the 14 — he takes a running
     back slot, the 14 drops into the flex, and the 11-point receiver who was
     flexed comes out. That chain is the point of pricing what a roster could
     put out rather than what it happened to have set. */
  eq('the bench is considered', t.full, 22+30+16 + 13+12 + 9 + 7 + 8 + 14);
  eq('which is more than the lineup as set', t.full > STARTERS, true);
  eq('nothing is banked yet', t.exp, t.full);
  eq('and all of it is still to come', t.left, t.full);
}

console.log('\n9. once it starts, the locked lineup and what is left of it');
{
  /* DAL and GB have finished, NE has not kicked off */
  api.set({ rosters: { 7: TEAM }, nfl: { anyLive: false, games: [
    { ht:'DAL', at:'NYG', s:'post' }, { ht:'GB', at:'CHI', s:'post' },
    { ht:'NE', at:'SEA', s:'pre' },
  ] } });
  const t = api.sbTeamWeek(7, 1, '2026', {}, 71.4, true);
  /* only the three New England starters are left: 12 + 9 + 11 */
  eq('what is still to come', t.left, 12 + 9 + 11);
  eq('the locked lineup ignores the bench', t.full, STARTERS);
  near('expected final is banked plus what is left', t.exp, 71.4 + 32);

  /* a scoreboard we do not have is not an answer */
  api.set({ nfl: null });
  eq('no digest, no number', api.sbTeamWeek(7, 1, '2026', {}, 71.4, true), null);

  /* a bye is nothing still to come, not an unknown */
  api.set({ nfl: { anyLive:false, games:[
    { ht:'DAL', at:'NYG', s:'post' }, { ht:'GB', at:'CHI', s:'post' },
  ] } });
  const bye = api.sbTeamWeek(7, 1, '2026', {}, 71.4, true);
  eq('a player with no game has nothing left', bye.left, 0);

  /* no projections at all means ESPN has not published the week */
  api.set({ rosters: { 7: TEAM.map(e => ({ ...e, wkProj: 0 })) },
            nfl: { anyLive:false, games:[] } });
  eq('an unpublished week falls back', api.sbTeamWeek(7, 1, '2026', {}, 0, false), null);
}

console.log('\n10. what the board closes, and when');
{
  const meta = wk => ({ 2026: { schedule: [
    { matchupPeriodId: wk, home: { teamId:1, totalPoints: 60 }, away: { teamId:2, totalPoints: 55 } },
    { matchupPeriodId: 9,  home: { teamId:3, totalPoints: 0 },  away: { teamId:4, totalPoints: 0 } },
  ] } });

  /* NOT STARTED — open, unless a game has actually kicked off */
  api.set({ meta: meta(5), nfl: { anyLive:false, games:[{ht:'DAL',at:'NYG',s:'pre'}] } });
  eq('an unplayed week is open',            api.sbWeekLocked(9, 'wk9-1-2-ml'), false);
  eq('its top-score market is open too',    api.sbWeekLocked(9, 'wk9-high'), false);
  api.set({ nfl: { anyLive:true, games:[{ht:'DAL',at:'NYG',s:'in'}] } });
  eq('a kickoff closes it before any score', api.sbWeekLocked(9, 'wk9-1-2-ml'), true);

  /* UNDER WAY — AND IT STAYS SHUT, INCLUDING BETWEEN SLATES. This used to carve
     out the three markets written on a single fixture and let them reprice in
     the gaps, which is the worst moment to be open rather than the safest: on a
     Monday afternoon the whole of Sunday is known and only one game is left to
     happen. Nothing about that is a market. */
  api.set({ nfl: { anyLive:false, games:[{ht:'DAL',at:'NYG',s:'post'}] } });
  eq('a fixture moneyline does NOT reopen between slates', api.sbWeekLocked(5, 'wk5-1-2-ml'), true);
  eq('nor does the spread',                                api.sbWeekLocked(5, 'wk5-1-2-sp'), true);
  eq('nor the total',                                      api.sbWeekLocked(5, 'wk5-1-2-tot'), true);
  eq('top score stays shut',                       api.sbWeekLocked(5, 'wk5-high'), true);
  eq('the donut stays shut',                       api.sbWeekLocked(5, 'wk5-donut'), true);
  eq('top player stays shut',                      api.sbWeekLocked(5, 'wk5-player'), true);
  eq("By Team's top scorer stays shut",            api.sbWeekLocked(5, 'ttbft-5'), true);

  /* AND IT HAS TO SURVIVE A REAL OWNER ID. This passed for weeks on 'ttbft-5'
     while the market sat open all Sunday in production, because the fixture
     used a made-up slug and a real owner is an ESPN GUID with braces in it —
     which the character class in betLegWeek did not match. The key came back
     as a season leg, and a season leg never locks. */
  const GUID = 'tt{2158CFCE-FA71-4064-916C-722D91F98966}-5';
  eq('a GUID-keyed By Team market knows its week', api.betLegWeek(GUID), 5);
  eq('...and therefore shuts with the rest',       api.sbWeekLocked(api.betLegWeek(GUID), GUID), true);
  eq('a slug owner still works',                   api.betLegWeek('ttbft-5'), 5);
  eq('an owner with digits in it takes the LAST segment as the week',
     api.betLegWeek('ttteam-12-7'), 7);
  eq('the weekly board keys are untouched',        api.betLegWeek('wk5-high'), 5);
  eq('so is a FAAB line',                          api.betLegWeek('fa4242-5'), 5);
  eq('and a season future is still season-long',   api.betLegWeek('champ'), null);

  api.set({ nfl: { anyLive:true, games:[{ht:'DAL',at:'NYG',s:'in'}] } });
  eq('everything shuts while a game is live', api.sbWeekLocked(5, 'wk5-1-2-ml'), true);

  /* THE WEEK AHEAD IS STILL OPEN, which is the whole reason this takes a week
     rather than asking "has any football started at all". */
  api.set({ meta: meta(5), nfl: { anyLive:false, games:[{ht:'GB',at:'CHI',s:'pre'}] } });
  eq('a week nobody has kicked off yet is open', api.sbWeekLocked(9, 'wk9-1-2-ml'), false);
  eq('and its derived markets too',              api.sbWeekLocked(9, 'wk9-high'), false);

  /* A FINISHED GAME LATCHES IT. ESPN's matchup totals do not move during a
     game, so "has this week scored" can read false with a game already over --
     which is exactly what happened on the week 1 opener. The scoreboard knows. */
  api.set({ meta: { 2026: { schedule: [
    { matchupPeriodId: 9, home: { teamId:3, totalPoints: 0 }, away: { teamId:4, totalPoints: 0 } }] } },
    nfl: { anyLive:false, games:[{ht:'GB',at:'CHI',s:'post'}] } });
  eq('a week with a finished game is shut even with nothing scored',
     api.sbWeekLocked(9, 'wk9-1-2-ml'), true);
}

console.log('');
console.log('THE SHARE MARKET SHUTS WHILE THE WEEK IS PLAYED');
{
  /* A price is built out of rest-of-season projections, and those move as a
     week is played. Trading through a Sunday means buying the team having a
     big one at a price that has not caught up, and selling the one whose
     starter has just gone off. Every other market closes for that reason. */
  const meta = wk => ({ 2026: { schedule: [
    { matchupPeriodId: wk, home: { teamId:1, totalPoints: 60 }, away: { teamId:2, totalPoints: 55 } },
    { matchupPeriodId: 9,  home: { teamId:3, totalPoints: 0 },  away: { teamId:4, totalPoints: 0 } },
  ] } });

  /* week 9 has no points and nothing has kicked off: the market is open */
  api.set({ meta: meta(5), invWeek: 9, nfl: { anyLive:false, games:[{ht:'DAL',at:'NYG',s:'pre'}] } });
  eq('open before a ball is kicked', api.invLocked(), false);

  /* the first kickoff shuts it, before any fantasy point has landed */
  api.set({ nfl: { anyLive:true, games:[{ht:'DAL',at:'NYG',s:'in'}] } });
  eq('the first kickoff shuts it', api.invLocked(), true);

  /* a week under way stays shut in the gap between the Sunday afternoon and
     evening slates, and so does everything else on the board -- the fixture
     moneyline used to reprice in that gap and no longer does */
  api.set({ invWeek: 5, nfl: { anyLive:false, games:[{ht:'DAL',at:'NYG',s:'post'}] } });
  eq('a week under way stays shut between slates', api.invLocked(), true);
  eq('and the board agrees, gaps included', api.sbWeekLocked(5, 'wk5-1-2-ml'), true);

  /* and it opens again once the week is behind us and the board has rolled on
     -- week 9, whose football has not started */
  api.set({ invWeek: 9, nfl: { anyLive:false, games:[{ht:'GB',at:'CHI',s:'pre'}] } });
  eq('the next week is open again', api.invLocked(), false);

  /* No scoreboard digest is not an all-clear. Both sides fail SHUT: the whole
     point is that nothing is priced when we cannot see whether football is
     being played. */
  api.set({ invWeek: 5, nfl: null });
  eq('a bet shuts when the scoreboard is unavailable', api.sbWeekLocked(5, 'wk5-1-2-ml'), true);
  eq('and so does the market',                        api.invLocked(), true);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
