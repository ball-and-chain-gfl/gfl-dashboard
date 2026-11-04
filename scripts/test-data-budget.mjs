/* THE LIVE DATA BUDGET.
 *
 * On 3 Nov 2026 Vercel paused the site for a month: the Hobby plan's Fast
 * Origin Transfer -- everything api/espn.js sends back out -- had run out, and
 * the live read was most of it. LIVE DATA BUDGET in api/espn.js has the story.
 * This holds the fix in place, in three parts:
 *
 *   1. slimLive keeps every number the app reads off a live reply. The real
 *      liveSideScore, liveWithScores and livePlayerLeft are lifted out of
 *      app.js and run on a reply before and after it, alongside the stat-row
 *      lookups the roster readers do, and nothing may move.
 *   2. A live week built to ESPN's shape -- 12 teams, a 14-week schedule,
 *      16-man rosters carrying the stat rows the app's own comments describe --
 *      comes out of slimLive under LIVE_WEEK_BUDGET.
 *   3. The rates. The edge keeps a live read at least 20s and never serves one
 *      older than 30s; the browser's live beat is no faster than that copy; the
 *      poller asks for the whole league at most every ten minutes; every live
 *      request names its week, or slimLive cannot cut the schedule.
 *
 * Run: node scripts/test-data-budget.mjs
 */
import fs from 'fs';
import { lifter, assemble } from './lib/lift.mjs';

const read = p => fs.readFileSync(new URL(p, import.meta.url), 'utf8').split(String.fromCharCode(13)).join('');
const API = read('../api/espn.js');
const APP = read('../public/app.js');
const POLL = read('../scripts/poll-live.mjs');

const S = assemble(lifter(new URL('../api/espn.js', import.meta.url)),
  ['const LIVE_CACHE =', 'const LIVE_PLAYER_DROP =', 'const LIVE_ROW_DROP =', 'function slimLive('],
  ['slimLive', 'LIVE_CACHE']);
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

/* ── A LIVE REPLY, BUILT TO ESPN'S SHAPE ──────────────────────────────────── */
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
        lineupLocked: false, rosterLocked: false, tradeLocked: false,
        player: {
          id, fullName: `Player ${team}-${i}`, firstName: 'Player', lastName: `${team}-${i}`,
          defaultPositionId: 1 + (i % 5), proTeamId: pro, injuryStatus: 'ACTIVE', injured: false,
          active: true, droppable: true, universeId: 2, jersey: String(i + 10), lastNewsDate: 1790000000000,
          lastVideoDate: 1790000000000,
          eligibleSlots: [2, 3, 23, 7, 20, 21],
          seasonOutlook: 'A workhorse back on a run-first offense with a clear path to touches. '.repeat(7),
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
/* ESPN hangs every team's whole roster off an mMatchup reply as well: on the
   week-8 read that was 780 KB the live matchup callers never look at */
const reply = () => {
  const schedule = [];
  for (let w = 1; w <= 14; w++) for (let k = 0; k < 6; k++) {
    schedule.push({ id: schedule.length + 1, matchupPeriodId: w, playoffTierType: 'NONE',
      winner: w < WEEK ? 'HOME' : 'UNDECIDED', home: side(2 * k + 1, w), away: side(2 * k + 2, w) });
  }
  const teams = Array.from({ length: 12 }, (_, i) => ({ id: i + 1, roster: roster(i + 1) }));
  return { gameId: 1, id: 1327340807, scoringPeriodId: WEEK, seasonId: SEASON, segmentId: 0, schedule, teams };
};
const MATCHUP_VIEWS = ['mMatchup', 'mMatchupScore'];

/* ── 1. NOTHING THE APP READS MOVES ───────────────────────────────────────── */
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
    pl.id, pl.fullName, pl.proTeamId, pl.defaultPositionId, pl.injuryStatus, e.playerPoolEntry.appliedStatTotal];
};
ok('every stat-row lookup lands on the same row and number',
  entries.map(([a]) => lookups(a)), entries.map(([, b]) => lookups(b)));

head('and drops what nothing reads');
ok('a matchup read loses the teams ESPN hangs off it', 'teams' in after, false);
const anyPlayer = after.schedule[0].home.rosterForCurrentScoringPeriod.entries[0].playerPoolEntry.player;
ok('no season outlook, ranks, ownership, eligible slots or news dates',
  ['seasonOutlook', 'draftRanksByRankType', 'rankings', 'ownership', 'eligibleSlots', 'lastNewsDate', 'lastVideoDate']
    .filter(k => k in anyPlayer), []);
ok('no appliedStats, variance or ceiling on any row', entries.some(([, b]) => b.playerPoolEntry.player.stats
  .some(s => 'appliedStats' in s || 'variance' in s || 'appliedTotalCeiling' in s)), false);
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
  Object.keys(S.slimLive(dup, WEEK).schedule[0].home).sort(), ['rosterForCurrentScoringPeriod', 'teamId']);

head('it fails open');
const odd = { schedule: [{ matchupPeriodId: 3, home: { teamId: 1 }, away: { teamId: 2 } }] };
ok('a week with no fixtures keeps the whole schedule', S.slimLive(clone(odd), 9).schedule.length, 1);
ok('no week named keeps the whole schedule', S.slimLive(clone(before), undefined).schedule.length, before.schedule.length);
ok('an error reply passes through untouched', S.slimLive({ error: 'x' }, 8), { error: 'x' });
const rosterReply = () => ({ teams: [{ id: 1, roster: clone(before.teams[0].roster) }] });
ok('an mRoster read keeps its teams', S.slimLive(rosterReply(), WEEK, ['mRoster']).teams.length, 1);
ok('and has its players cut the same way',
  'seasonOutlook' in S.slimLive(rosterReply(), WEEK, ['mRoster']).teams[0].roster.entries[0].playerPoolEntry.player, false);
ok('so does an mTeam read, whatever the case', S.slimLive(rosterReply(), WEEK, ['MTEAM', 'mMatchup']).teams.length, 1);
ok('and a read that names no view (the passthrough\'s mTeam default)', S.slimLive(rosterReply(), WEEK, []).teams.length, 1);
ok('a caller that passes no view list keeps teams too', S.slimLive(rosterReply(), WEEK).teams.length, 1);
ok('the passthrough hands slimLive the views it was asked for',
  API.includes('slimLive(data, scoringPeriodId, asked)'), true);

/* ── 2. THE SIZE OF A LIVE WEEK ───────────────────────────────────────────── */
head('a live week fits the budget');
/* Measured on this reply when the budget was set: 4732 KB in, 557 KB out.
   (The real week-8 matchup read was 5.9 MB from ESPN -- this reply's
   players are heavier than ESPN's, its teams lighter.) The ceiling leaves
   room for ESPN adding a field or two, and none for slimLive being
   bypassed or a dropped field coming back. Moving it up is a decision
   about the Vercel bill, not a fix for a red test. */
const LIVE_WEEK_BUDGET = 640 * 1024;
const b0 = bytes(before), b1 = bytes(after);
console.log(`  a live week, ESPN's shape: ${(b0 / 1024).toFixed(0)} KB in, ${(b1 / 1024).toFixed(0)} KB out (${Math.round(100 * (1 - b1 / b0))}% less)`);
ok(`under ${LIVE_WEEK_BUDGET / 1024} KB`, b1 <= LIVE_WEEK_BUDGET, true);
ok('and at most 15% of what ESPN sent', b1 <= b0 * 0.15, true);

/* ── 3. THE RATES ─────────────────────────────────────────────────────────── */
head('how often a live read leaves the proxy');
const maxage = Number((/s-maxage=(\d+)/.exec(S.LIVE_CACHE) || [])[1]);
const swr = Number((/stale-while-revalidate=(\d+)/.exec(S.LIVE_CACHE) || [0, 0])[1]);
ok('the edge keeps a live read at least 20 seconds', maxage >= 20, true);
ok('and never serves one more than 30 seconds old', maxage + swr <= 30, true);
ok('the passthrough sends live reads through slimLive and with LIVE_CACHE',
  API.includes('return res.status(200).json(live ? slimLive(data, scoringPeriodId, asked) : data);')
  && API.includes('? LIVE_CACHE'), true);
const beat = Number((/const NFL_LIVE_MS=(\d+);/.exec(APP) || [])[1]);
ok('the browser\'s live beat is no faster than the edge copy', beat >= maxage * 1000, true);
ok('a hidden tab still does not poll', APP.includes("if(document.visibilityState==='visible') await liveTick();"), true);

const liveUrls = [...APP.matchAll(/`\$\{BASE\}\?([^`]*live=1)`/g), ...POLL.matchAll(/get\(`([^`]*live=1)`/g)].map(m => m[1]);
const pollFresh = POLL.match(/`view=mMatchup&view=mMatchupScore`\s*\+\s*`([^`]*live=1)`/);
if (pollFresh) liveUrls.push(pollFresh[1]);
ok('there are live reads to check', liveUrls.length >= 6, true);
ok('every live read names its week', liveUrls.filter(u => !u.includes('scoringPeriodId=')), []);

const ttl = Number(eval((/const META_TTL = ([^;]+);/.exec(POLL) || [])[1] || '0'));
ok('the poller asks for the league at most every ten minutes', ttl >= 10 * 60 * 1000, true);
ok('once() goes through leagueMeta', POLL.includes('const meta = await leagueMeta(season);'), true);
ok('and the full-season read appears in one place only',
  POLL.split('view=mMatchup&view=mTeam&view=mSettings').length - 1, 1);

console.log('\n' + (fail ? 'FAILED  ' : 'ok  ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
