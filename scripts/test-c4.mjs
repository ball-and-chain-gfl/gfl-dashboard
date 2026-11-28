/* LINEUP IQ'S 2026 RULES, AND C4 IN THE COACHING METRIC.
 *
 *   AVAILABLE   projected above 0 that week -- projected 0 is out -- and not on IR
 *   A CALL      a starting spot a bench player could have filled; no bench
 *               option, no call
 *   EMPTY       an empty starting spot with a bench option is a wrong call
 *   A TIE       always a right call: the best lineup prefers the man started
 *   WEEKS       finished only
 *   C4          half calls, half points, both against the league, ÷ 10:
 *               calls above the league's hit rate at what a wrong call costs the
 *               league; points left on the bench against the league's average
 *
 * Run: node scripts/test-c4.mjs
 */
import fs from 'fs';
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
const r3 = v => Math.round(v * 1000) / 1000;

/* ── the server's week ── */
const S = assemble(lifter(new URL('../api/espn.js', import.meta.url)), ['function liqWeek('], ['liqWeek']);
const W = 3;
let id = 0;
const e = (pos, slot, pts, proj) => ({ playerId: ++id, lineupSlotId: slot, playerPoolEntry: { player: { defaultPositionId: pos,
  stats: [...(pts == null ? [] : [{ statSourceId: 0, scoringPeriodId: W, appliedTotal: pts }]), { statSourceId: 1, scoringPeriodId: W, appliedTotal: proj }] } } });
const QB = 1, RB = 2, WR = 3, TE = 4, K = 5, DST = 16, BN = 20, IR = 21;
const LEAGUE = [0, 2, 2, 4, 4, 6, 23, 16, 17];

head('a full week');
/* starters: QB 20, RB 10 and 8, WR 12 and 9, TE 6, FLEX WR 7, D/ST 5, K 8 = 85.
   bench: RB 10 (a tie with the starter), WR 15, an RB projected 0, a WR on IR.
   best: QB 20, RB 10 + 10, WR 15 + 12, TE 6, FLEX 9, D/ST 5, K 8 = 95. */
const full = [e(QB, 0, 20, 18), e(RB, 2, 10, 9), e(RB, 2, 8, 9), e(WR, 4, 12, 9), e(WR, 4, 9, 9), e(TE, 6, 6, 6), e(WR, 23, 7, 8),
  e(DST, 16, 5, 6), e(K, 17, 8, 8), e(RB, BN, 10, 9), e(WR, BN, 15, 10), e(RB, BN, 0, 0), e(WR, IR, 20, 12)];
const F = S.liqWeek(full, W, LEAGUE);
ok('best lineup 95, the one set 85, 10 left on the bench', [F.opt, F.act, F.missed], [95, 85, 10]);
ok('five calls -- QB, TE, D/ST and K had nobody behind them -- three right', [F.decisions, F.correct], [5, 3]);
ok('each call carries how close its best bench option was projected, and whether it was right', F.gaps.length, 5);
ok('and the week what starting the projections would have left on the bench', typeof F.projMissed, 'number');

head('the rules one at a time');
ok('a tie goes to the man started: a right call', S.liqWeek([e(RB, 2, 10, 9), e(RB, BN, 10, 9)], W, [2]), { decisions: 1, correct: 1, opt: 10, act: 10, missed: 0, projMissed: 0, gaps: [[0, 1]] });
ok('no bench option at the spot: not a call at all', S.liqWeek([e(RB, 2, 10, 9), e(RB, 2, 8, 9), e(WR, BN, 30, 9)], W, [2, 2]).decisions, 0);
ok('a man projected 0 on the bench is not an option', S.liqWeek([e(DST, 16, 5, 6), e(DST, BN, 0, 0)], W, [16]).decisions, 0);
ok('starting a man projected 0 is a wrong call when the bench had one',
  S.liqWeek([e(DST, 16, 0, 0), e(DST, BN, 4, 6)], W, [16]), { decisions: 1, correct: 0, opt: 4, act: 0, missed: 4, projMissed: 0, gaps: [[6, 0]] });
ok('a man on IR is not an option, whatever he scored', S.liqWeek([e(WR, 4, 9, 9), e(WR, IR, 25, 12)], W, [4]).decisions, 0);
ok('an empty spot with a bench option: a wrong call, and its points are missed',
  S.liqWeek([e(QB, 0, 20, 18), e(K, BN, 9, 7)], W, [0, 17]), { decisions: 1, correct: 0, opt: 29, act: 20, missed: 9, projMissed: 0, gaps: [[7, 0]] });

head('finished weeks only, 2026 on');
const API = fs.readFileSync(new URL('../api/espn.js', import.meta.url), 'utf8');
ok('the last week read is the one before ESPN\'s current week', /const lastWeek = rules26 \? Math\.min\(regEnd, current - 1\) : regEnd;/.test(API), true);
ok('2026 on uses the new week; before it, the old rules', /const rules26 = Number\(season\) >= 2026;/.test(API) && /if \(rules26\) \{\s+const r = liqWeek\(entries, wr\.week, template\);/.test(API), true);
ok('the lineup is the league\'s own', /rosterSettings\?\.lineupSlotCounts/.test(API), true);

/* ── C4 in the metric ── */
const grab = lifter(new URL('../public/app.js', import.meta.url));
const M = assemble(grab, [
  'function nflWeekKickoffMs(season,w){', 'const nflSeasonOfMs=', 'const C3_SHARE_FROM=',
  'const C4_FROM=', 'function liqFor(season){', 'function c4Score(', 'let _liq=',
  'const C3_REPL_FROM=', 'const C3_POS=', 'let _c3Lines=', 'function c3LinesFor(season){', 'function c3Score(', 'function c3ScoreRepl(',
  'const FAAB_VALUE_FROM=', 'function faabRateFrom(pool){', 'function c2ScoreFaab(', 'const C2_TRADES_FROM=', 'function c2Txns(season,transactions){',
  'const C2_WEIGHT_FROM=', 'function c2WeighTrades(season,teams,c2,detail){', 'async function computeCoaching(teams, transactions, weeklyData, season){',
], ['computeCoaching', 'setLiq'], 'const TOTAL_WEEKS=17;' + NL + 'const setLiq=(s,d)=>{ _liq[s]=d; };');
const TEAMS = [1, 2, 3].map(i => ({ id: i, pf: 100 }));
/* 30 calls, 21 right: a 70% league, 90 missed over 9 wrong calls = 10 a call, 30 a team */
M.setLiq('2026', { 1: { decisions: 10, correct: 9, missed: 10 }, 2: { decisions: 10, correct: 7, missed: 30 }, 3: { decisions: 10, correct: 5, missed: 50 } });
const B = (await M.computeCoaching(TEAMS, [], {}, 2026)).breakdown;

head('C4: half calls, half points');
ok('the league: 70% of calls right, 10 points a wrong call, 30 left on the bench a team',
  [r3(B[1].detail.c4League.hit), r3(B[1].detail.c4League.cost), B[1].detail.c4League.avgMissed], [0.7, 10, 30]);
ok('two calls over the rate (+2) and 20 points under the average (+2): C4 +2', [r3(B[1].detail.c4Detail.calls), r3(B[1].detail.c4Detail.pts), r3(B[1].c4)], [2, 2, 2]);
ok('exactly average both ways: 0', r3(B[2].c4), 0);
ok('the league sums to zero', r3(B[1].c4 + B[2].c4 + B[3].c4), 0);
ok('and C4 is in the sum the final is standardised from', [r3(B[1].raw), r3(B[3].raw)], [0.919, -0.919]);

head('2026: each part standardised, then weighed -- C1 at half, C4 at three quarters');
/* C4 2, 0, -2: its own z-score is +-1.2247, at 3/4 weight +-0.919. C1 to C3 have no spread here: 0 */
ok('the weights', B[1].weights, { c1: 0.5, c2: 1, c3: 1, c4: 0.75 });
ok('a part with no spread adds nothing; C4 adds three quarters of its standing', [B[1].w.c1, B[1].w.c2, B[1].w.c3, r3(B[1].w.c4)], [0, 0, 0, 0.919]);
const PF = [1, 2, 3].map(i => ({ id: i, pf: [130, 100, 70][i - 1] }));
const P = (await M.computeCoaching(PF, [], {}, 2026)).breakdown;
ok('C1 and C4 the same shape: C4 adds one and a half times what C1 does', [r3(P[1].w.c1), r3(P[1].w.c4), r3(P[1].w.c4 / P[1].w.c1)], [0.612, 0.919, 1.5]);
ok('the final is the weighted sum, standardised', [r3(P[1].final), r3(P[2].final), r3(P[3].final)], [1.225, 0, -1.225]);
const P25 = (await M.computeCoaching(PF, [], {}, 2025)).breakdown;
ok('2025 keeps the plain sum and carries no weights', [r3(P25[1].raw), P25[1].w], [3, undefined]);

head('C4 against depth: calls against their difficulty, points against the projections');
/* projections: starter 10, bench 9 -> 1 below; starter 10, bench 12 -> 2 above */
const g1 = S.liqWeek([e(RB, 2, 10, 10), e(RB, BN, 4, 9)], W, [2]);
ok('a call\'s difficulty is the best bench projection minus the starter\'s', g1.gaps, [[-1, 1]]);
const g2 = S.liqWeek([e(RB, 2, 10, 10), e(RB, BN, 15, 12), e(RB, BN, 2, 3)], W, [2]);
ok('the best bench option is the highest PROJECTED one, and starting it would have missed nothing', [g2.gaps, g2.projMissed, g2.missed], [[[2, 0]], 0, 5]);
/* ten easy calls (bench 6 below) and ten hard ones (bench 1 above):
   teams 1 and 2 get every easy one right and half the hard ones; team 3 only had easy ones */
const easy = (n, right) => Array.from({ length: n }, (_, i) => [-6, i < right ? 1 : 0]);
const hard = (n, right) => Array.from({ length: n }, (_, i) => [1, i < right ? 1 : 0]);
M.setLiq('2026', {
  1: { decisions: 20, correct: 15, missed: 60, projMissed: 80, gaps: [...easy(10, 10), ...hard(10, 5)] },
  2: { decisions: 20, correct: 15, missed: 30, projMissed: 30, gaps: [...easy(10, 10), ...hard(10, 5)] },
  3: { decisions: 10, correct: 10, missed: 10, projMissed: 10, gaps: easy(10, 10) },
});
const X = (await M.computeCoaching(TEAMS, [], {}, 2026)).breakdown;
const xl = X[1].detail.c4League;
ok('the depth rule is the one used', xl.depth, true);
ok('expected right calls come from the league\'s rate on calls that close', [r3(X[1].detail.c4Detail.expected), r3(X[3].detail.c4Detail.expected)], [15, 10]);
ok('right exactly as often as expected: the calls half is 0, whatever the raw hit rate', [r3(X[1].detail.c4Detail.calls), r3(X[3].detail.c4Detail.calls)], [0, 0]);
ok('points gained over the projections: 20, 0, 0, against the league\'s 6.667', [X[1].detail.c4Detail.gain, X[2].detail.c4Detail.gain, r3(xl.avgGain)], [20, 0, 6.667]);
ok('the deep bench that beat its projections leads, despite missing the most', [r3(X[1].c4), r3(X[2].c4), r3(X[3].c4)], [0.667, -0.333, -0.333]);
ok('and the league still sums to zero', r3(X[1].c4 + X[2].c4 + X[3].c4), 0);

head('without it');
M.setLiq('2025', { 1: { decisions: 10, correct: 9, missed: 10 }, 2: { decisions: 10, correct: 5, missed: 50 } });
const O = (await M.computeCoaching(TEAMS, [], {}, 2025)).breakdown;
ok('2025 has no C4 and its score is what it was', [O[1].c4, O[1].detail.c4League], [0, undefined]);
M.setLiq('2026', {});
const E = (await M.computeCoaching(TEAMS, [], {}, 2026)).breakdown;
ok('no Lineup IQ loaded: C4 is 0, nothing invented', [E[1].c4, E[3].c4], [0, 0]);

head('the page');
const APP = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
ok('Lineup IQ reads the new rules\' numbers, with the depth fields (v=3)', APP.includes('type=lineupiq&seasonId=${season}&v=3'), true);
ok('boot waits for Lineup IQ before scoring', APP.includes('loadLineupIQ(String(season)).catch(()=>null):null]);'), true);
ok('the score breakdown shows C4, the Lineup IQ list carries it',
  APP.includes('>C4</span><span style="color:var(--text2);flex:1">Lineup IQ</span>') && APP.includes('class="right liq-c4v"'), true);

ok('2026 rows read as abbreviations, every number on the league\'s A+-to-F scale (fewer missed points the good end)',
  APP.includes('sbTeamAb(_ownerMap[t.id],t.name)') && APP.includes('grade(missVals,r.d.missed,false)')
  && APP.includes('grade(c4Vals,c4Of(r.t),true)') && APP.includes('c4lg?grade(pctVals,r.pct,true):liqColor(r.pct)'), true);

console.log(NL + (fail ? 'FAILED  ' : 'ok  ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
