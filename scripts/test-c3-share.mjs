/* C3: WAIVER PICKUPS SCORED AGAINST THE LEAGUE.
 *
 *   THE LEAGUE'S RATE   every pickup's lineup points over every pickup's margin
 *                       (bid − next-highest bid, $1 floor) -- this season's
 *                       league, nobody's chosen exchange rate
 *   PAR                 a pickup's margin at that rate; it scores what it beat
 *                       par by, ÷ 10, and a team's C3 is the sum
 *   RELATIVE            the league sums to zero, average is exactly 0, and it is
 *                       the same number as share of points minus share of margin
 *   WHAT WAS BROKEN     a cheap claim no longer outscores everything on a tiny
 *                       denominator, and a bust costs its par instead of nothing
 *
 * A three-team league, worked by hand:
 *   team 1  Goff-like   $3 uncontested, 30 lineup points        margin $3
 *           free agent  $0, 5 lineup points                     margin $1 (floor)
 *   team 2  bidding war $100 against team 3's $40, 60 points    margin $60
 *   team 3  bust        $50 uncontested, never started          margin $50
 *   league  95 points over $114 of margin = 0.8333 points per $1
 *
 * Run: node scripts/test-c3-share.mjs
 */
import { lifter, assemble } from './lib/lift.mjs';

const NL = String.fromCharCode(10);
let pass = 0, fail = 0;
const near = (a, b) => Math.abs(a - b) < 1e-9;
const ok = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; console.log('  PASS  ' + name); return; }
  fail++;
  console.log('  FAIL  ' + name + NL + '          got  ' + g + NL + '          want ' + w);
};
const head = t => console.log(NL + t);
const grab = lifter(new URL('../public/app.js', import.meta.url));
const M = assemble(grab, [
  'function nflWeekKickoffMs(season,w){', 'const nflSeasonOfMs=', 'const C3_SHARE_FROM=',
  'async function computeCoaching(teams, transactions, weeklyData, season){',
], ['computeCoaching'], 'const TOTAL_WEEKS=17;');

const TEAMS = [1, 2, 3, 4].map(id => ({ id, pf: 1000 }));     // team 4 never claims anybody
const DAY = Date.UTC(2026, 8, 16);
const claim = (id, team, pid, bid, status = 'EXECUTED') => ({
  id, type: bid ? 'WAIVER' : 'FREEAGENT', teamId: team, bidAmount: bid, status,
  scoringPeriodId: 2, processDate: DAY, items: [{ type: 'ADD', playerId: pid, toTeamId: team }],
});
const TX = [
  claim('a', 1, 901, 3),
  claim('b', 1, 904, 0),
  claim('c', 2, 902, 100),
  claim('d', 3, 902, 40, 'FAILED_INVALIDPLAYERSOURCE'),        // lost on price: the next bid
  claim('e', 3, 903, 50),
];
/* weeks 2-4: who is on which roster, started or not, and what they scored */
const row = (team, pts, started = true) => ({ team, pts, started, slot: started ? 2 : 20 });
const WK = {};
[2, 3, 4].forEach(w => {
  WK[w] = {
    901: row(1, 10), 904: row(1, w === 2 ? 5 : 0, w === 2),
    902: row(2, 20), 903: row(3, 15, false),                    // the bust sits on the bench
  };
});

const { breakdown: B } = await M.computeCoaching(TEAMS, TX, WK);
const c3 = id => B[id].c3, picks = id => B[id].detail.waiverPickups;
const RATE = 95 / 114;

head("the league's rate");
const lg = B[1].detail.c3League;
ok('every pickup in the league, points and margin', [lg.pts, lg.margin], [95, 114]);
ok('the rate is one over the other', near(lg.rate, RATE), true);
ok('and every team reads the same one', [2, 3, 4].every(t => B[t].detail.c3League.rate === lg.rate), true);

head('margin is what it always was');
ok('a bidding war is the bid less the next bid, not the bid', picks(2)[0].margin, 60);
ok('uncontested is the whole bid', picks(3)[0].margin, 50);
ok('a free agent is the $1 floor', picks(1).find(p => p.pid === 904).margin, 1);
ok('only lineup points count -- the bust scored 45 on the bench and has 0', picks(3)[0].pts, 0);

head('par, and what beat it');
const goff = picks(1).find(p => p.pid === 901);
ok("a pickup's par is its margin at the league's rate", near(goff.par, 3 * RATE), true);
ok('and it scores what it beat par by, ÷ 10', near(goff.c3, (30 - 3 * RATE) / 10), true);
ok('a bust scores minus its par', near(picks(3)[0].c3, -50 * RATE / 10), true);
ok('a team is the sum of its pickups', near(c3(1), picks(1).reduce((s, p) => s + p.c3, 0)), true);

head('the scores, worked by hand');
ok('team 1: (35 − $4 × 0.8333) ÷ 10', near(c3(1), (35 - 4 * RATE) / 10), true);
ok('team 2: (60 − $60 × 0.8333) ÷ 10 = +1.0', near(c3(2), 1), true);
ok('team 3: (0 − $50 × 0.8333) ÷ 10', near(c3(3), -50 * RATE / 10), true);
ok('a team that never claimed anybody is the league average', c3(4), 0);

head('relative');
ok('the league sums to zero', near([1, 2, 3, 4].reduce((s, t) => s + c3(t), 0), 0), true);
ok('and it is share of the points minus share of the margin, back in points ÷ 10',
  [1, 2, 3].every(t => {
    const P = picks(t).reduce((s, p) => s + p.pts, 0), W = picks(t).reduce((s, p) => s + p.margin, 0);
    return near(c3(t), (P / 95 - W / 114) * 95 / 10);
  }), true);

head('what was broken');
/* the old rule: Σ points ÷ margin ÷ 10 -- team 1's two cheap claims read 10.5,
   the bidding war 0.1, and the bust exactly the same 0 as claiming nobody */
ok('cheap claims no longer outscore a good buy by a hundred times', c3(1) / c3(2) < 4, true);
ok('a bust is now below a team that did nothing', c3(3) < c3(4), true);

head('this season and on, and only this season and on');
const old = (await M.computeCoaching(TEAMS, TX, WK, 2025)).breakdown;
/* 2025 is the ratio, pickup by pickup: team 1 30/3 + 5/1 = 15, team 2 60/60 = 1,
   team 3 0/50 = 0, each ÷ 10 */
ok('a season before 2026 keeps the ratio it was scored with',
  [1, 2, 3, 4].map(t => +old[t].c3.toFixed(9)), [1.5, 0.1, 0, 0]);
ok('and says so, with no league rate or par on it',
  [old[1].detail.c3Mode, old[1].detail.c3League, old[1].detail.waiverPickups[0].par], ['ratio', undefined, undefined]);
const now = (await M.computeCoaching(TEAMS, TX, WK, 2026)).breakdown;
const later = (await M.computeCoaching(TEAMS, TX, WK, '2027')).breakdown;
ok('2026 and every season after it are scored against the league',
  [now[1].detail.c3Mode, later[1].detail.c3Mode, near(now[2].c3, 1), near(later[2].c3, 1)], ['share', 'share', true, true]);

head('a league with no pickups');
const { breakdown: E } = await M.computeCoaching(TEAMS, [], WK);
ok('everybody is 0, and nothing divides by zero',
  [[1, 2, 3, 4].every(t => E[t].c3 === 0), E[1].detail.c3League.rate], [true, 0]);

console.log(NL + (fail ? 'FAILED  ' : 'ok  ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
