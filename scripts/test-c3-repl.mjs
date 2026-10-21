/* WAIVER ROI FROM 2026: EVERY START AGAINST A REPLACEMENT AT HIS POSITION.
 *
 *   THE LINE      each week, the Nth-best score at the position across the NFL:
 *                 QB18, RB24, WR36, TE18, K12, D/ST12 -- the server ranks them
 *   EITHER WAY    a started week counts his points minus that line, so a
 *                 defence that puts up 1 is a minus, not a small plus
 *   ONLY STARTS   a benched week counts nothing; a week not yet final has no
 *                 line and counts nothing yet
 *   THE MONEY     every dollar over the next-highest bid ($1 minimum) costs what
 *                 the league's FAAB buys -- lineup points over dollars bid,
 *                 the same rate FAAB in a trade is worth
 *   FALLBACK      no lines, and 2026 is the share rule; before 2026, the ratio
 *
 * A two-team league, worked by hand. Lines: K 9, D/ST 7, RB 11 in weeks 2-3;
 * week 4 is not final.
 *   team 1  kicker, $1 uncontested: started wk 2 (12) and wk 3 (3), wk 4 (20)
 *           not final                           vs line +3 −6 = −3
 *           defence, $1 uncontested: started wk 2 for 1, benched wk 3 (15)
 *                                               vs line −6
 *   team 2  running back, $100 against team 1's $40: never started
 *                                               vs line 0, margin $60
 *   rate    lineup points 12+3+20 (K) + 1 (D/ST) = 36 over bids 1+1+100 = 102
 *
 * Run: node scripts/test-c3-repl.mjs
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
const r2 = v => Math.round(v * 1000) / 1000;
const grab = lifter(new URL('../public/app.js', import.meta.url));
const M = assemble(grab, [
  'function nflWeekKickoffMs(season,w){', 'const nflSeasonOfMs=', 'const C3_SHARE_FROM=',
  'const C3_REPL_FROM=', 'const C3_POS=', 'let _c3Lines=', 'function c3LinesFor(season){', 'function c3Score(', 'function c3ScoreRepl(',
  'const FAAB_VALUE_FROM=', 'function faabRateFrom(pool){', 'function c2ScoreFaab(', 'const C2_TRADES_FROM=', 'function c2Txns(season,transactions){',
  'const C2_WEIGHT_FROM=', 'function c2WeighTrades(season,teams,c2,detail){', 'async function computeCoaching(teams, transactions, weeklyData, season){',
], ['computeCoaching', 'setLines'], 'const TOTAL_WEEKS=17;' + NL + 'const setLines=(s,d)=>{ _c3Lines[s]=d; };');

const K = 901, DST = -16001, RB = 902;
const TEAMS = [1, 2].map(id => ({ id, pf: 1000 }));
const DAY = Date.UTC(2026, 8, 16);
const claim = (id, team, pid, bid, status = 'EXECUTED') => ({
  id, type: 'WAIVER', teamId: team, bidAmount: bid, status, scoringPeriodId: 2, processDate: DAY,
  items: [{ type: 'ADD', playerId: pid, toTeamId: team }] });
const TX = [claim('a', 1, K, 1), claim('b', 1, DST, 1), claim('c', 2, RB, 100), claim('d', 1, RB, 40, 'FAILED_INVALIDPLAYERSOURCE')];
const e = (team, pos, pts, started) => ({ team, pos, pts, started, slot: started ? 0 : 20 });
const WK = {
  2: { [K]: e(1, 5, 12, true), [DST]: e(1, 16, 1, true), [RB]: e(2, 2, 25, false) },
  3: { [K]: e(1, 5, 3, true), [DST]: e(1, 16, 15, false), [RB]: e(2, 2, 30, false) },
  4: { [K]: e(1, 5, 20, true), [DST]: e(1, 16, 0, false), [RB]: e(2, 2, 0, false) },
};
const LINE = { QB: 15, RB: 11, WR: 10, TE: 9, K: 9, DST: 7 };
M.setLines('2026', { weeks: { 2: LINE, 3: LINE } });
const { breakdown: B } = await M.computeCoaching(TEAMS, TX, WK, 2026);
const pk = (t, pid) => B[t].detail.waiverPickups.find(p => p.pid === pid);
const RATE = 36 / 102;

head('every start against the line, either way');
ok('the kicker: +3 in week 2, −6 in week 3', [pk(1, K).vs, pk(1, K).starts, pk(1, K).byWeek.map(x => x.pts - x.line)], [-3, 2, [3, -6]]);
ok('the defence that put up 1 is a minus, not a small plus', pk(1, DST).vs, -6);
ok('a benched week counts nothing, however big', pk(1, DST).starts, 1);
ok('week 4 is not final: his 20 is not scored yet', pk(1, K).byWeek.some(x => x.w === 4), false);
ok('each pickup knows its position', [pk(1, K).pos, pk(1, DST).pos, pk(2, RB).pos], ['K', 'DST', 'RB']);

head('the money at what the league\'s FAAB buys');
ok('the rate is lineup points over dollars bid, the FAAB-in-a-trade rate', r2(B[1].detail.c3League.rate), r2(RATE));
ok('never started, $60 over the next bid: all cost', [pk(2, RB).vs, r2(pk(2, RB).cost), r2(pk(2, RB).c3)], [0, r2(60 * RATE), r2(-60 * RATE / 10)]);
ok('a $1 claim still costs its dollar', r2(pk(1, K).cost), r2(RATE));
ok('team 1: (−3 − 6 − $2 × rate) ÷ 10', r2(B[1].c3), r2((-9 - 2 * RATE) / 10));
ok('team 2: (0 − $60 × rate) ÷ 10', r2(B[2].c3), r2(-60 * RATE / 10));
ok('scored by the replacement rule', [B[1].detail.c3Mode, B[2].detail.c3Mode], ['repl', 'repl']);

head('without lines, and before 2026');
M.setLines('2026', undefined);
const S = (await M.computeCoaching(TEAMS, TX, WK, 2026)).breakdown;
ok('2026 with no lines falls back to the share rule', S[1].detail.c3Mode, 'share');
M.setLines('2025', { weeks: { 2: LINE, 3: LINE } });
const O = (await M.computeCoaching(TEAMS, TX, WK, 2025)).breakdown;
ok('2025 is the ratio, lines or no lines', O[1].detail.c3Mode, 'ratio');

head('the table');
const APP = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
ok('a repl season draws its own table, its weeks under each name',
  /if\(d\.c3Mode==='repl'\)\{ renderC3Repl\(/.test(APP) && APP.includes('class="c3w"') && APP.includes("'never started'"), true);
ok('boot loads the lines alongside the trade list', APP.includes('Promise.all([c2TradesNow(season),c3LinesLoad(season)])'), true);

head('the server: the Nth-best at the position, finished weeks only');
const API = fs.readFileSync(new URL('../api/espn.js', import.meta.url), 'utf8');
const L = assemble(lifter(new URL('../api/espn.js', import.meta.url)), ['function replLinesFrom('], ['replLinesFrom']);
const pl = (pos, weeks, season = 2026) => ({ player: { defaultPositionId: pos,
  stats: Object.entries(weeks).map(([w, pts]) => ({ statSourceId: 0, statSplitTypeId: 1, seasonId: season, scoringPeriodId: Number(w), appliedTotal: pts })) } });
const kickers = [pl(5, { 1: 15, 2: 4 }), pl(5, { 1: 9, 2: 8 }), pl(5, { 1: 7 }), pl(5, { 1: 22 }, 2025), pl(1, { 1: 30, 2: 30 })];
ok('the 2nd-best kicker each week; a bye is not a zero, another season and a QB do not count',
  L.replLinesFrom(kickers, 5, 2, 2026), { 1: 9, 2: 4 });
ok('fewer than N played: no line', L.replLinesFrom(kickers, 5, 3, 2026)[2], null);
ok('the league\'s ranks', /const RANKS = \{ QB: 18, RB: 24, WR: 36, TE: 18, K: 12, DST: 12 \};/.test(API), true);
ok('only weeks before the current scoring period, and only whole weeks',
  /if \(Number\(w\) < current\)/.test(API) && /Object\.keys\(RANKS\)\.some\(k => weeks\[w\]\[k\] == null\)/.test(API), true);

console.log(NL + (fail ? 'FAILED  ' : 'ok  ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
