/* THE DATA BUDGET -- what the ESPN passthrough sends out, and how often.
 *
 * On 3 Nov 2026 Vercel paused the site for a month: the Hobby plan's Fast
 * Origin Transfer -- everything api/espn.js sends back out -- had run out.
 * LIVE DATA BUDGET in api/espn.js has the story. The site has to keep
 * fitting the free plan even while the team pays for Pro, so this holds:
 *
 *   1. slimLive keeps every number the live callers read. The real
 *      liveSideScore, liveWithScores and livePlayerLeft are lifted out of
 *      app.js and run on a reply before and after, alongside the stat-row
 *      lookups the roster readers do, and nothing may move.
 *   2. slimEspn, on every other reply, keeps every number its readers take,
 *      and drops nothing that anything in the repo reads (it greps).
 *   3. Replies built to ESPN's shape come out under their size budgets.
 *   4. The cache rules: how long the edge keeps each kind of reply, and the
 *      browser's and the poller's rates against them.
 *   5. A free-plan month priced from those rules and the reply sizes
 *      measured on the live site fits well inside Hobby's 10 GB.
 *
 * Run: node scripts/test-data-budget.mjs
 */
import fs from 'fs';
import { lifter, assemble } from './lib/lift.mjs';

const read = p => fs.readFileSync(new URL(p, import.meta.url), 'utf8').split(String.fromCharCode(13)).join('');
const API = read('../api/espn.js');
const APP = read('../public/app.js');
const POLL = read('../scripts/poll-live.mjs');

const S = assemble(lifter(new URL('../api/espn.js', import.meta.url)), [
  'const LIVE_CACHE =', 'const CURRENT_CACHE =', 'const SEASON_CACHE =', 'const FUTURE_CACHE =', 'const PAST_CACHE =',
  'const ESPN_TEAM_DROP =', 'const ESPN_ENTRY_DROP =', 'const ESPN_POOL_DROP =', 'const ESPN_PLAYER_DROP =',
  'const ESPN_ROW_DROP =', 'const MATCHUP_ROSTER_VIEWS =',
  'function passthroughCache(', 'function slimEspn(', 'function slimLive(',
], ['slimLive', 'slimEspn', 'passthroughCache', 'LIVE_CACHE', 'CURRENT_CACHE', 'SEASON_CACHE', 'FUTURE_CACHE',
  'PAST_CACHE', 'ESPN_TEAM_DROP', 'ESPN_ENTRY_DROP', 'ESPN_POOL_DROP', 'ESPN_PLAYER_DROP', 'ESPN_ROW_DROP']);
const M = assemble(lifter(new URL('../public/app.js', import.meta.url)), [
  'const BENCH_SLOTS=', 'const LIVE_VOLUME=', 'const LIVE_USAGE_R=', 'const LIVE_EFF_R=',
  'const LIVE_EFF_SKIP=', 'const liveEffW=', 'const liveUsageW=',
  'function liveScoreLine(line,rules){', 'function livePlayerLeft(entry,f,rules){',
  'function liveSideScore(side){', 'function liveWithScores(m){',
], ['liveScoreLine', 'livePlayerLeft', 'liveSideScore', 'liveWithScores']);

let pass = 0, fail = 0;
const ok = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; return; }
  fail++;
  console.log('  FAIL  ' + name + '\n          got  ' + g + '\n          want ' + w);
};
const head = t => console.log('\n' + t);
const bytes = o => Buffer.byteLength(JSON.stringify(o));
const clone = o => JSON.parse(JSON.stringify(o));

/* ── A REPLY BUILT TO ESPN'S SHAPE ────────────────────────────────────────── */
let seed = 7;
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const r2 = x => Math.round(x * 100) / 100;

const WEEK = 8, SEASON = 2026;
/* the league's real scoring, the bits livePlayerLeft touches (as test-fclive) */
const RULES = { 3: 0.04, 4: 4, 20: -2, 24: 0.1, 25: 6, 42: 0.1, 43: 6, 53: 1 };
const LIVE_IDS = [0, 3, 4, 20, 23, 24, 25, 58, 53, 42, 43];
const statLine = n => {
  const line = {};
  LIVE_IDS.forEach(id => { line[id] = r2(rnd() * 12); });
  for (let id = 100; Object.keys(line).length < n; id += 1 + Math.floor(rnd() * 3)) line[id] = r2(rnd() * 40);
  return line;
};
const appliedLine = line => {
  const out = {};
  Object.keys(line).slice(0, 25).forEach(id => { out[id] = r2(line[id] * 0.1); });
  return out;
};
/* A player carries several rows -- "this week at split 1, last week at split
   1, the season at split 0 and at split 2" (app.js, at the projection
   readers). Half the players list the season first, half the week first, so
   "the first row of a source" is a season row on some and the week's on
   others. Each row's appliedTotal is what its own line scores. */
const statRows = (pro, seasonFirst) => {
  const row = (src, split, period, n) => {
    const stats = statLine(n);
    const r = { id: `${src}${split}${SEASON}${period}`, externalId: `${SEASON}${period}`, proTeamId: pro,
      scoringPeriodId: period, seasonId: SEASON, statSourceId: src, statSplitTypeId: split,
      appliedTotal: r2(M.liveScoreLine(stats, RULES)), stats, appliedStats: appliedLine(stats) };
    /* ESPN's projections also carry a ceiling and a per-stat variance */
    if (src === 1) { r.appliedTotalCeiling = r2(r.appliedTotal * 1.6); r.variance = appliedLine(stats); }
    return r;
  };
  const season = [row(0, 0, 0, 70), row(1, 0, 0, 70)];
  const week = [row(0, 1, WEEK, 40), row(1, 1, WEEK, 55)];
  const last = [row(0, 1, WEEK - 1, 40), row(1, 1, WEEK - 1, 55)];
  const s2 = [row(1, 2, 0, 70)];
  return seasonFirst ? [...season, ...last, ...week, ...s2] : [...week, ...last, ...season, ...s2];
};
const SLOTS = [0, 2, 2, 4, 4, 6, 23, 16, 17, 20, 20, 20, 20, 20, 20, 21];
const roster = team => {
  const entries = SLOTS.map((slot, i) => {
    const id = 3000000 + team * 100 + i, pro = 1 + ((team + i) % 32);
    const stats = statRows(pro, i % 2 === 0);
    const wk = stats.find(s => s.statSourceId === 0 && s.scoringPeriodId === WEEK);
    return {
      playerId: id, lineupSlotId: slot, injuryStatus: 'NORMAL', status: 'ONTEAM',
      acquisitionDate: 1790000000000, acquisitionType: 'DRAFT', pendingTransactionIds: null,
      playerPoolEntry: {
        appliedStatTotal: wk.appliedTotal, id, onTeamId: team, keeperValue: 0, keeperValueFuture: 0,
        lineupLocked: false, rosterLocked: false, tradeLocked: false, status: 'ONTEAM',
        player: {
          id, fullName: `Player ${team}-${i}`, firstName: 'Player', lastName: `${team}-${i}`,
          defaultPositionId: 1 + (i % 5), proTeamId: pro, injuryStatus: 'ACTIVE', injured: false,
          active: true, droppable: true, universeId: 2, jersey: String(i + 10), lastNewsDate: 1790000000000,
          lastVideoDate: 1790000000000,
          eligibleSlots: [2, 3, 23, 7, 20, 21],
          seasonOutlook: 'A workhorse back on a run-first offense with a clear path to touches. '.repeat(7),
          /* a written paragraph for every week: ~4.9 KB a player on the real reads */
          outlooks: { outlooksByWeek: Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(w =>
            [w, 'Expect a full workload against a soft run defense; a safe floor with touchdown upside. '.repeat(4)])) },
          draftRanksByRankType: {
            STANDARD: { auctionValue: 12, published: false, rank: 40 + i, rankSourceId: 0, rankType: 'STANDARD', slotId: 2 },
            PPR: { auctionValue: 14, published: false, rank: 38 + i, rankSourceId: 0, rankType: 'PPR', slotId: 2 },
          },
          rankings: { [WEEK]: [0, 1, 2, 3].map(k => ({ auctionValue: 0, averageRank: 20.5, published: true, rank: 10 + k,
            rankSourceId: k, rankType: 'PPR', slotId: 2 })) },
          ownership: { activityLevel: null, auctionValueAverage: 8.2, auctionValueAverageChange: 0.1,
            averageDraftPosition: 60.1, averageDraftPositionPercentChange: 0.2, date: 1790000000000,
            leagueType: 0, percentChange: 0.3, percentOwned: 88.1, percentStarted: 61.4 },
          stats,
        },
      },
    };
  });
  return { appliedStatTotal: r2(entries.reduce((t, e) => t + e.playerPoolEntry.appliedStatTotal, 0)), entries };
};
const scoreByStat = () => {
  const out = {};
  for (let id = 0; id < 60; id++) out[id] = { ineligible: false, rank: 0, result: null, score: r2(rnd() * 300) };
  return out;
};
const side = (team, week) => {
  const cur = week === WEEK;
  const s = {
    teamId: team, gamesPlayed: 0, totalPoints: cur ? 0 : r2(90 + rnd() * 70),
    pointsByScoringPeriod: { [week]: r2(90 + rnd() * 70) },
    cumulativeScore: { wins: 0, losses: 0, ties: 0, scoreByStat: scoreByStat(), statBySlot: null },
  };
  if (cur) {
    s.rosterForCurrentScoringPeriod = roster(team);
    s.totalPointsLive = r2(s.rosterForCurrentScoringPeriod.appliedStatTotal);
    s.totalProjectedPointsLive = r2(s.totalPointsLive + 40);
    s.winProbability = r2(rnd());
  }
  return s;
};
const team = i => ({ id: i, abbrev: `T${i}`, name: `Team ${i}`, logo: `https://example.test/${i}.png`, divisionId: i % 2,
  primaryOwner: `{OWNER-${i}}`, owners: [`{OWNER-${i}}`], playoffSeed: i, rankCalculatedFinal: 0,
  record: { overall: { wins: 5, losses: 3 } }, points: 900 + i,
  valuesByStat: Object.fromEntries(Array.from({ length: 60 }, (_, k) => [k, r2(rnd() * 900)])),
  draftStrategy: { keeperPlayerIds: [], futureKeeperPlayerIds: [] }, tradeBlock: {},
  roster: roster(i) });
/* ESPN hangs every team's whole roster off an mMatchup reply as well: on the
   week-8 read that was 780 KB the live matchup callers never look at. The
   reply's own scoringPeriodId only echoes the week asked for; the league's
   current week is status.latestScoringPeriod. */
const reply = () => {
  const schedule = [];
  for (let w = 1; w <= 14; w++) for (let k = 0; k < 6; k++) {
    schedule.push({ id: schedule.length + 1, matchupPeriodId: w, playoffTierType: 'NONE',
      winner: w < WEEK ? 'HOME' : 'UNDECIDED', home: side(2 * k + 1, w), away: side(2 * k + 2, w) });
  }
  const teams = Array.from({ length: 12 }, (_, i) => team(i + 1));
  return { gameId: 1, id: 1327340807, scoringPeriodId: WEEK, seasonId: SEASON, segmentId: 0,
    status: { currentMatchupPeriod: WEEK, latestScoringPeriod: WEEK, finalScoringPeriod: 17 }, schedule, teams };
};
const MATCHUP_VIEWS = ['mMatchup', 'mMatchupScore'];

/* the lookups the roster readers make, written as they are in app.js */
const lookups = e => {
  const pl = e.playerPoolEntry.player, st = pl.stats;
  const wkAct = st.find(s => s.statSourceId === 0 && s.scoringPeriodId === WEEK);
  const wkProj = st.find(s => s.statSourceId === 1 && s.scoringPeriodId === WEEK);
  const wkRows = st.filter(x => x && x.statSourceId === 1 && x.statSplitTypeId === 1);
  const val = src => st.find(x => x.statSourceId === src && x.statSplitTypeId === 1
    && Number(x.scoringPeriodId) === WEEK);
  return [wkAct && wkAct.appliedTotal, wkProj && wkProj.appliedTotal,
    wkRows.map(r => [r.scoringPeriodId, r.appliedTotal]), val(0) && val(0).appliedTotal,
    val(1) && val(1).appliedTotal, st.map(s => [s.statSourceId, s.statSplitTypeId, s.scoringPeriodId]),
    pl.id, pl.fullName, pl.lastName, pl.proTeamId, pl.defaultPositionId, pl.injuryStatus, pl.jersey, pl.active,
    e.playerId, e.lineupSlotId, e.injuryStatus, e.status, e.playerPoolEntry.appliedStatTotal, e.playerPoolEntry.status];
};

/* ── 1. A LIVE READ: NOTHING THE APP READS MOVES ──────────────────────────── */
head('slimLive keeps every number the live callers read');
const before = reply();
const after = S.slimLive(clone(before), String(WEEK), MATCHUP_VIEWS);

const weekOf = r => r.schedule.filter(m => (m.matchupPeriodId || 0) === WEEK && m.home && m.away);
ok('the week is all that is left of the schedule', after.schedule.map(m => m.matchupPeriodId),
  weekOf(before).map(() => WEEK));
ok('every fixture of the week is still there', after.schedule.map(m => m.id), weekOf(before).map(m => m.id));

const pairs = weekOf(before).map((m, i) => [m, after.schedule[i]]);
const sides = pairs.flatMap(([a, b]) => [[a.home, b.home], [a.away, b.away]]);
ok('liveWithScores gives the same totals',
  pairs.map(([a]) => [M.liveWithScores(a).home.totalPoints, M.liveWithScores(a).away.totalPoints]),
  pairs.map(([, b]) => [M.liveWithScores(b).home.totalPoints, M.liveWithScores(b).away.totalPoints]));
ok('liveSideScore gives the same sums',
  sides.map(([a]) => M.liveSideScore(a)), sides.map(([, b]) => M.liveSideScore(b)));
ok('the live total, projection and win probability ride along',
  sides.map(([a]) => [a.totalPointsLive, a.totalProjectedPointsLive, a.winProbability, a.cumulativeScore.wins]),
  sides.map(([, b]) => [b.totalPointsLive, b.totalProjectedPointsLive, b.winProbability, b.cumulativeScore.wins]));

const entries = sides.flatMap(([a, b]) => a.rosterForCurrentScoringPeriod.entries
  .map((e, i) => [e, b.rosterForCurrentScoringPeriod.entries[i]]));
ok('every starter and bench man is still in his slot',
  entries.map(([a]) => [a.playerId, a.lineupSlotId]), entries.map(([, b]) => [b.playerId, b.lineupSlotId]));
for (const f of [0.1, 0.5, 0.9]) {
  ok(`livePlayerLeft is unchanged at f=${f}`,
    entries.map(([a]) => M.livePlayerLeft(a, f, RULES)), entries.map(([, b]) => M.livePlayerLeft(b, f, RULES)));
}
const detailed = entries.filter(([a]) => {
  const pr = a.playerPoolEntry.player.stats.find(s => s.statSourceId === 1);
  return M.livePlayerLeft(a, 0.5, RULES) !== pr.appliedTotal * 0.5;
}).length;
ok('and the stat-line path, not just the flat one, was exercised', detailed > entries.length / 2, true);
ok('every stat-row lookup lands on the same row and number',
  entries.map(([a]) => lookups(a)), entries.map(([, b]) => lookups(b)));

head('and drops what nothing reads');
ok('a matchup read loses the teams ESPN hangs off it', 'teams' in after, false);
const anyEntry = after.schedule[0].home.rosterForCurrentScoringPeriod.entries[0];
const anyPlayer = anyEntry.playerPoolEntry.player;
ok('no outlooks, ranks, ownership, slots, news dates or unread name fields',
  S.ESPN_PLAYER_DROP.filter(k => k in anyPlayer), []);
ok('no unread entry or pool-entry fields',
  [...S.ESPN_ENTRY_DROP.filter(k => k in anyEntry), ...S.ESPN_POOL_DROP.filter(k => k in anyEntry.playerPoolEntry)], []);
ok('no appliedStats, variance, ceiling or externalId on any row', entries.some(([, b]) => b.playerPoolEntry.player.stats
  .some(s => S.ESPN_ROW_DROP.some(k => k in s))), false);
ok('raw lines only on the first row of each source',
  entries.every(([, b]) => {
    const seen = {};
    return b.playerPoolEntry.player.stats.every(s => {
      const first = !seen[s.statSourceId]; seen[s.statSourceId] = true;
      return ('stats' in s) === first;
    });
  }), true);
ok('no per-stat breakdown on any side',
  after.schedule.some(m => m.home.cumulativeScore.scoreByStat || m.away.cumulativeScore.scoreByStat), false);
const dup = { schedule: [{ matchupPeriodId: WEEK, home: { teamId: 1, rosterForMatchupPeriod: { entries: [] },
  rosterForMatchupPeriodDelayed: { entries: [] }, rosterForCurrentScoringPeriod: { entries: [] } }, away: { teamId: 2 } }] };
ok('rosterForMatchupPeriod copies go, the current roster stays',
  Object.keys(S.slimLive(dup, WEEK, MATCHUP_VIEWS).schedule[0].home).sort(), ['rosterForCurrentScoringPeriod', 'teamId']);

/* ── 2. EVERY OTHER REPLY ─────────────────────────────────────────────────── */
head('slimEspn keeps what every other reader takes');
const season = S.slimEspn(clone(before), ['mMatchup', 'mTeam', 'mSettings']);
ok('a season read keeps the whole schedule', season.schedule.length, before.schedule.length);
ok('and every team, with what fetchSeasonData takes from it',
  season.teams.map(t => [t.id, t.primaryOwner, t.owners, t.name, t.abbrev, t.logo, t.divisionId, t.playoffSeed,
    t.rankCalculatedFinal, t.record, t.points]),
  before.teams.map(t => [t.id, t.primaryOwner, t.owners, t.name, t.abbrev, t.logo, t.divisionId, t.playoffSeed,
    t.rankCalculatedFinal, t.record, t.points]));
ok('without the team fields nothing reads', season.teams.some(t => S.ESPN_TEAM_DROP.some(k => k in t)), false);
ok('every week\'s totals, winners and records', season.schedule.map(m => [m.id, m.winner, m.home.totalPoints,
  m.away.totalPoints, m.home.pointsByScoringPeriod, m.home.cumulativeScore.wins]),
  before.schedule.map(m => [m.id, m.winner, m.home.totalPoints, m.away.totalPoints, m.home.pointsByScoringPeriod,
    m.home.cumulativeScore.wins]));
const seasonSides = weekOf(before).flatMap((m, i) => {
  const n = season.schedule.find(x => x.id === m.id);
  return [[m.home, n.home], [m.away, n.away]];
});
ok('the week\'s matchup rosters still feed the live board until its own read lands',
  seasonSides.map(([a]) => [M.liveSideScore(a), ...a.rosterForCurrentScoringPeriod.entries.map(e => M.livePlayerLeft(e, 0.5, RULES))]),
  seasonSides.map(([, b]) => [M.liveSideScore(b), ...b.rosterForCurrentScoringPeriod.entries.map(e => M.livePlayerLeft(e, 0.5, RULES))]));
const teamPairs = before.teams.flatMap((t, i) => t.roster.entries.map((e, k) => [e, season.teams[i].roster.entries[k]]));
ok('team rosters give the roster readers the same rows and numbers',
  teamPairs.map(([a]) => lookups(a)), teamPairs.map(([, b]) => lookups(b)));
ok('but carry no raw stat lines: livePlayerLeft never reads a team roster',
  teamPairs.some(([, b]) => b.playerPoolEntry.player.stats.some(s => 'stats' in s)), false);
ok('livePlayerLeft is only ever handed a matchup roster',
  APP.split('livePlayerLeft(').length - 1 === 3 /* the declaration and its two callers */
  && APP.includes("const es=((side&&side.rosterForCurrentScoringPeriod)||{}).entries||[];"), true);

const scores = S.slimEspn(clone(before), ['mMatchupScore']);
ok('a score-only read loses the matchup rosters ESPN hangs off it',
  scores.schedule.some(m => m.home.rosterForCurrentScoringPeriod || m.away.rosterForCurrentScoringPeriod), false);
ok('and keeps the win probabilities espnWinProbs takes', weekOf(scores).map(m => [m.home.teamId, m.home.winProbability,
  m.away.teamId, m.away.winProbability]), weekOf(before).map(m => [m.home.teamId, m.home.winProbability,
  m.away.teamId, m.away.winProbability]));
ok('espnWinProbs reads winProbability and nothing else off that reply',
  /fetch\(`\$\{BASE\}\?view=mMatchupScore&seasonId=\$\{season\}&scoringPeriodId=\$\{wk\}`\)/.test(APP), true);
ok('an mMatchup read keeps them', 'rosterForCurrentScoringPeriod' in S.slimEspn(clone(before), ['mMatchup']).schedule
  .find(m => m.matchupPeriodId === WEEK).home, true);
ok('so does an mRoster read', 'rosterForCurrentScoringPeriod' in S.slimEspn(clone(before), ['MROSTER']).schedule
  .find(m => m.matchupPeriodId === WEEK).home, true);
ok('and a caller that passes no view list', 'rosterForCurrentScoringPeriod' in S.slimEspn(clone(before)).schedule
  .find(m => m.matchupPeriodId === WEEK).home, true);
ok('the passthrough hands slimEspn and slimLive the views it was asked for',
  API.includes('return res.status(200).json(live ? slimLive(data, scoringPeriodId, asked) : slimEspn(data, asked));'), true);

/* Nothing dropped may be read anywhere. A field name turning up as a
   property read in app.js or a script means somebody started using it: keep
   it in slimEspn first, then let this pass. */
head('nothing in the repo reads a dropped field');
const SOURCES = { 'public/app.js': APP };
fs.readdirSync(new URL('./', import.meta.url)).filter(f => f.endsWith('.mjs') && f !== 'test-data-budget.mjs')
  .forEach(f => { SOURCES['scripts/' + f] = read('./' + f); });
const DROPPED = [...S.ESPN_TEAM_DROP, ...S.ESPN_ENTRY_DROP, ...S.ESPN_POOL_DROP, ...S.ESPN_PLAYER_DROP, ...S.ESPN_ROW_DROP,
  'scoreByStat', 'statBySlot', 'rosterForMatchupPeriod'];
const readers = DROPPED.flatMap(k => Object.entries(SOURCES)
  .filter(([, src]) => new RegExp(`\\.${k}\\b|\\[['"]${k}['"]\\]|\\b${k}\\s*:`).test(src)).map(([f]) => `${k} in ${f}`));
ok('no property read of any dropped field', readers, []);

head('it fails open');
const odd = { schedule: [{ matchupPeriodId: 3, home: { teamId: 1 }, away: { teamId: 2 } }] };
ok('a week with no fixtures keeps the whole schedule', S.slimLive(clone(odd), 9, MATCHUP_VIEWS).schedule.length, 1);
ok('no week named keeps the whole schedule', S.slimLive(clone(before), undefined, MATCHUP_VIEWS).schedule.length, before.schedule.length);
ok('an error reply passes through untouched', S.slimLive({ error: 'x' }, 8), { error: 'x' });
ok('and through slimEspn', S.slimEspn({ error: 'x' }, ['mRoster']), { error: 'x' });
const rosterReply = () => ({ teams: [{ id: 1, roster: clone(before.teams[0].roster) }] });
ok('an mRoster read keeps its teams', S.slimLive(rosterReply(), WEEK, ['mRoster']).teams.length, 1);
ok('so does an mTeam read, whatever the case', S.slimLive(rosterReply(), WEEK, ['MTEAM', 'mMatchup']).teams.length, 1);
ok('and a read that names no view (the passthrough\'s mTeam default)', S.slimLive(rosterReply(), WEEK, []).teams.length, 1);
ok('a caller that passes no view list keeps teams too', S.slimLive(rosterReply(), WEEK).teams.length, 1);

/* ── 3. SIZES ─────────────────────────────────────────────────────────────── */
head('replies fit their budgets');
/* Measured on these replies when the budgets were set: a live week 6362 KB
   in, 482 KB out (7.6%); a season read 739 KB out (11.6%); one team's
   roster 237 KB in, 19 KB out (8%); a score-only read 0.9%. Their players
   carry seven stat rows apiece and the real live reads two, so the real
   reads come out smaller still: on 4 Nov 2026 the week-8 live read went
   5.8 MB -> 202 KB, a season read 3.3 MB -> 174 KB, a roster 3.6 MB ->
   ~260 KB, a score read 240 KB -> 38 KB. The ceilings leave room for ESPN
   adding a field or two, and none for a trim being bypassed or a dropped
   field coming back. Moving one up is a decision about the Vercel bill,
   not a fix for a red test. */
const pct = (a, b) => `${(a / 1024).toFixed(0)} KB in, ${(b / 1024).toFixed(0)} KB out (${(100 * b / a).toFixed(1)}%)`;
const b0 = bytes(before), b1 = bytes(after);
console.log(`  a live week:        ${pct(b0, b1)}`);
ok('a live week under 600 KB', b1 <= 600 * 1024, true);
ok('and at most 10% of what ESPN sent', b1 <= b0 * 0.10, true);
const bs = bytes(season);
console.log(`  a season read:      ${pct(b0, bs)}`);
ok('a season read at most 15% of what ESPN sent', bs <= b0 * 0.15, true);
const br = bytes(S.slimEspn(rosterReply(), ['mRoster'])), brIn = bytes(rosterReply());
console.log(`  one team's roster:  ${pct(brIn, br)}`);
ok('a team roster at most 12% of what ESPN sent', br <= brIn * 0.12, true);
const scoreReply = () => { const r = clone(before); delete r.teams; return r; };
const bq = bytes(S.slimEspn(scoreReply(), ['mMatchupScore'])), bqIn = bytes(scoreReply());
console.log(`  a score-only read:  ${pct(bqIn, bq)}`);
ok('a score-only read at most 5% of what ESPN sent', bq <= bqIn * 0.05, true);

/* ── 4. THE CACHE RULES ───────────────────────────────────────────────────── */
head('how long the edge keeps a reply');
const ttl = c => Number((/s-maxage=(\d+)/.exec(c) || [])[1]);
const swr = c => Number((/stale-while-revalidate=(\d+)/.exec(c) || [0, 0])[1]);
const echo = (asked, latest) => ({ scoringPeriodId: asked, status: { latestScoringPeriod: latest } });
ok('a finished week is kept an hour', S.passthroughCache(false, 7, echo(7, 9)), S.PAST_CACHE);
ok('even when it was asked for live', S.passthroughCache(true, 8, echo(8, 9)), S.PAST_CACHE);
ok('a week to come is kept half an hour', S.passthroughCache(true, 12, echo(12, 9)), S.FUTURE_CACHE);
ok('this week, live, gets the live cache', S.passthroughCache(true, 9, echo(9, 9)), S.LIVE_CACHE);
ok('this week otherwise keeps its minute', S.passthroughCache(false, 9, echo(9, 9)), S.CURRENT_CACHE);
ok('a whole-season read is kept ten minutes', S.passthroughCache(false, undefined, echo(9, 9)), S.SEASON_CACHE);
ok('the echoed scoringPeriodId is not taken for the current week',
  S.passthroughCache(true, 12, { scoringPeriodId: 12, status: { latestScoringPeriod: 9 } }), S.FUTURE_CACHE);
ok('a reply with no status falls back to the live rule', S.passthroughCache(true, 12, { error: 'x' }), S.LIVE_CACHE);
ok('the passthrough sets its header from passthroughCache',
  API.includes("res.setHeader('Cache-Control', passthroughCache(live, scoringPeriodId, data));"), true);
ok('the edge keeps a live read at least 20 seconds', ttl(S.LIVE_CACHE) >= 20, true);
ok('and never serves one more than 30 seconds old', ttl(S.LIVE_CACHE) + swr(S.LIVE_CACHE) <= 30, true);
ok('finished weeks at least an hour, weeks to come at least half an hour',
  ttl(S.PAST_CACHE) >= 3600 && ttl(S.FUTURE_CACHE) >= 1800, true);
ok('season reads at least ten minutes', ttl(S.SEASON_CACHE) >= 600, true);

/* A branch with no Cache-Control is kept by nobody: Vercel's default for a
   function response is not to cache it, so every request runs the function.
   playerscores went out that way, nine calls a homepage load, each parsing a
   3.6 MB roster. raw and txdump are diagnostics and an archiver feed that
   must always be fresh; everything the app calls has to say how long. */
const branches = [];
API.split(String.fromCharCode(10)).forEach((l, i) => { const m = /^  if \(type === '(\w+)'\)/.exec(l); if (m) branches.push([m[1], i]); });
const apiLines = API.split(String.fromCharCode(10));
const uncached = branches.filter(([t, i], k) => {
  if (t === 'raw' || t === 'txdump') return false;
  if (!new RegExp(`type=${t}\\b`).test(APP)) return false;
  const end = k + 1 < branches.length ? branches[k + 1][1] : apiLines.length;
  return !apiLines.slice(i, end).join(String.fromCharCode(10)).includes('Cache-Control');
}).map(([t]) => t);
ok('every endpoint the app calls says how long the edge may keep it', uncached, []);
ok('playerscores is kept by its week', API.includes("res.setHeader('Cache-Control', passthroughCache(false, week, data));"), true);

head('how often anything asks');
const beat = Number((/const NFL_LIVE_MS=(\d+);/.exec(APP) || [])[1]);
ok('the browser\'s live beat is no faster than the edge copy', beat >= ttl(S.LIVE_CACHE) * 1000, true);
ok('a hidden tab still does not poll', APP.includes("if(document.visibilityState==='visible') await liveTick();"), true);
const liveUrls = [...APP.matchAll(/`\$\{BASE\}\?([^`]*live=1)`/g), ...POLL.matchAll(/get\(`([^`]*live=1)`/g)].map(m => m[1]);
const pollFresh = POLL.match(/`view=mMatchup&view=mMatchupScore`\s*\+\s*`([^`]*live=1)`/);
if (pollFresh) liveUrls.push(pollFresh[1]);
ok('there are live reads to check', liveUrls.length >= 6, true);
ok('every live read names its week', liveUrls.filter(u => !u.includes('scoringPeriodId=')), []);
const metaTtl = Number(eval((/const META_TTL = ([^;]+);/.exec(POLL) || [])[1] || '0'));
ok('the poller asks for the league at most every ten minutes', metaTtl >= 10 * 60 * 1000, true);
ok('once() goes through leagueMeta', POLL.includes('const meta = await leagueMeta(season);'), true);
ok('and the full-season read appears in one place only',
  POLL.split('view=mMatchup&view=mTeam&view=mSettings').length - 1, 1);

/* ── 5. A FREE-PLAN MONTH ─────────────────────────────────────────────────── */
/* Hobby allows about 10 GB of Fast Origin Transfer a month. This prices one
   from the cache rules above and the reply sizes the live site sent on
   4 Nov 2026, after slimEspn, on usage generous for a twelve-team league:
   100 page loads a day across 16 waking hours, somebody watching live scores
   through every minute of 16 hours of football a week, and four deploys a
   day (each starts the edge cache empty). A reply kept T seconds, asked for
   at a rate of l a second, is fetched again l/(1+lT) times a second. */
head('a month on the free plan');
const KB = 1024;
const SIZE = { season: (174 + 130 + 39) * KB, liveMatchup: 202 * KB, roster: 260 * KB, scores: 38 * KB, meta: 174 * KB,
  playerScores: 15 * KB };
const LOADS_A_DAY = 100, WAKING_S = 16 * 3600, LIVE_HOURS_A_WEEK = 16, DEPLOYS_A_DAY = 4, DAYS = 30, WEEKS = 30 / 7;
const lambda = LOADS_A_DAY / WAKING_S;
const refills = cache => LOADS_A_DAY / (1 + lambda * ttl(cache));
const perDay = {
  'season reads': refills(S.SEASON_CACHE) * SIZE.season,
  'this week\'s roster and scores': refills(S.LIVE_CACHE) * SIZE.roster + refills(S.CURRENT_CACHE) * SIZE.scores,
  'rosters and scores, weeks to come (5)': refills(S.FUTURE_CACHE) * 5 * (SIZE.roster + SIZE.scores),
  'last week\'s roster and scores': refills(S.PAST_CACHE) * (SIZE.roster + SIZE.scores),
  'player scores, a week at a time (9)': (refills(S.PAST_CACHE) * 8 + refills(S.CURRENT_CACHE)) * SIZE.playerScores,
  'deploys emptying the cache': DEPLOYS_A_DAY * (SIZE.season + 6 * (SIZE.roster + SIZE.scores)),
};
const month = {};
Object.entries(perDay).forEach(([k, v]) => { month[k] = v * DAYS; });
month['live scores while watched'] = (3600 / ttl(S.LIVE_CACHE)) * LIVE_HOURS_A_WEEK * WEEKS * SIZE.liveMatchup;
month['the poller\'s league read'] = (3600000 / metaTtl) * LIVE_HOURS_A_WEEK * WEEKS * SIZE.meta;
const GB = 1024 ** 3;
const total = Object.values(month).reduce((a, b) => a + b, 0);
Object.entries(month).forEach(([k, v]) => console.log(`  ${k.padEnd(40)} ${(v / GB).toFixed(2)} GB`));
console.log(`  ${'a month'.padEnd(40)} ${(total / GB).toFixed(2)} GB of Hobby's ~10 GB`);
ok('a generous month uses at most 60% of the free plan', total <= 6 * GB, true);

console.log('\n' + (fail ? 'FAILED  ' : 'ok  ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
