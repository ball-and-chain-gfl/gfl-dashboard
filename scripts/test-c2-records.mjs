/* TRADE ROI IS SCORED OFF THE LOCKED TRADE LIST, 2026 ON.
 *
 *   THE LIST          each trade's own week, each player's first counting week
 *                     and his points: the row the Trades page draws
 *   NOT THE LOG       ESPN's log stamps the week a trade was PROCESSED in, files
 *                     a trade the moment it is accepted (before the league
 *                     upholds or vetoes it), and lists a man dropped to make
 *                     room among the players sent -- none of which C2 reads
 *                     once the list is in
 *   BEFORE IT LANDS   the log, exactly as before; and every season before 2026
 *                     is the log, always
 *   BY ITS SIZE       each trade counts by every point it moved, both sides,
 *                     FAAB included, over the season's biggest trade
 *   DROPPED PLAYERS   still score for the trade: the server fills the weeks no
 *                     roster holds a man from ESPN's player card
 *
 * The real case: Keon Coleman and $125 went to BFT for Mike Washington Jr. in
 * a deal upheld the Tuesday after week 5. BFT let Coleman go, he scored 15.9
 * in week 6 on waivers, and the card said 0.0 while Trade ROI said "wk 7+".
 *
 * Run: node scripts/test-c2-records.mjs
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
const r1 = v => Math.round(v * 100) / 100;
const grab = lifter(new URL('../public/app.js', import.meta.url));
const M = assemble(grab, [
  'function nflWeekKickoffMs(season,w){', 'const nflSeasonOfMs=', 'const C3_SHARE_FROM=', 'const C4_FROM=', 'function liqFor(season){', 'function c4Score(', 'let _liq=', 'const C3_REPL_FROM=', 'const C3_POS=', 'let _c3Lines=', 'function c3LinesFor(season){', 'function c3Score(', 'function c3ScoreRepl(',
  'const FAAB_VALUE_FROM=', 'function faabRateFrom(pool){', 'function c2ScoreFaab(',
  'const C2_TRADES_FROM=', 'const C2_WEIGHT_FROM=', 'function c2WeighTrades(season,teams,c2,detail){', 'function tradesFillTx(txns,trades){', 'function c2Txns(season,transactions){',
  'async function computeCoaching(teams, transactions, weeklyData, season){',
], ['computeCoaching', 'tradesFillTx', 'c2Txns'], 'const TOTAL_WEEKS=17;');

const COLE = 4635008, WASH = 4686658, HOCK = 4036133, PATS = -16017, ZAY = 4697815, PICK = 901;
const TEAMS = [3, 8, 9, 10, 12].map(id => ({ id, pf: 600 }));
const UPHELD = Date.UTC(2026, 9, 13, 13, 13);
/* ESPN's log, as the app is handed it */
const LOG = [
  /* the deal itself, stamped the period it was processed in */
  { type: 'TRADE_ACCEPT', status: 'EXECUTED', teamId: 8, scoringPeriodId: 6, processDate: UPHELD,
    items: [{ type: 'TRADE', playerId: COLE, fromTeamId: 8, toTeamId: 10 }, { type: 'TRADE', playerId: WASH, fromTeamId: 10, toTeamId: 8 }] },
  /* accepted this morning, not upheld */
  { type: 'TRADE_ACCEPT', status: 'EXECUTED', teamId: 12, scoringPeriodId: 0,
    items: [{ type: 'TRADE', playerId: PATS, fromTeamId: 12, toTeamId: 8 }, { type: 'TRADE', playerId: ZAY, fromTeamId: 8, toTeamId: 12 },
      { type: 'FAAB', amount: 86, fromTeamId: 12, toTeamId: 8 }] },
  /* a man dropped to make room in an older trade, filed as sent */
  { type: 'TRADE_ACCEPT', status: 'EXECUTED', teamId: 9, scoringPeriodId: 0, items: [{ type: 'TRADE', playerId: HOCK, fromTeamId: 9, toTeamId: 0 }] },
  /* one pickup, so the season has a FAAB rate: 20 lineup points for $10 */
  { type: 'WAIVER', status: 'EXECUTED', teamId: 3, bidAmount: 10, scoringPeriodId: 5, processDate: UPHELD,
    items: [{ type: 'ADD', playerId: PICK, toTeamId: 3 }] },
];
/* the weekly rosters, with slot, position (2 RB, 3 WR) and ESPN's projection (pj).
   GOT   what a man traded for scored in the new team's starting lineup until he leaves it:
         Coleman starts for BFT in week 6 (15.9), sits in week 7, is with team 3 in week 8 -- 15.9.
         Washington starts for the Tinglers in week 6 (6) and then leaves -- 6.
   GAVE  what a man traded away would have scored in the sender's lineup, to the end of the season:
         Coleman (WR) against the Tinglers' WR starter Zay: week 6 projected 12 over 9, starts (15.9);
         week 7 9 under 11, sits; week 8, with team 3 now, 14 over 10, starts (12) -- 27.9.
         Washington (RB) against BFT's RB starter #601: week 6 projected 10 over 8 (6); gone after -- 6. */
const WK = {
  5: { [COLE]: { team: 8, pts: 7.7, started: false, slot: 20, pos: 3, pj: 6 }, [WASH]: { team: 10, pts: 2, started: false, slot: 20, pos: 2, pj: 5 },
       [PICK]: { team: 3, pts: 20, started: true, slot: 2, pos: 2, pj: 9 },
       [PATS]: { team: 12, pts: 6, started: true, slot: 16, pos: 16, pj: 6 }, [ZAY]: { team: 8, pts: 9, started: true, slot: 4, pos: 3, pj: 9 },
       [HOCK]: { team: 8, pts: 1.7, started: true, slot: 6, pos: 4, pj: 4 } },
  6: { [COLE]: { team: 10, pts: 15.9, started: true, slot: 4, pos: 3, pj: 12 }, [WASH]: { team: 8, pts: 6, started: true, slot: 2, pos: 2, pj: 10 },
       601: { team: 10, pts: 4, started: true, slot: 2, pos: 2, pj: 8 },
       [PATS]: { team: 12, pts: 5, started: true, slot: 16, pos: 16, pj: 6 }, [ZAY]: { team: 8, pts: 11, started: true, slot: 4, pos: 3, pj: 9 } },
  7: { [COLE]: { team: 10, pts: 9, started: false, slot: 20, pos: 3, pj: 9 }, [ZAY]: { team: 8, pts: 7, started: true, slot: 4, pos: 3, pj: 11 } },
  8: { [COLE]: { team: 3, pts: 12, started: true, slot: 4, pos: 3, pj: 14 }, [ZAY]: { team: 8, pts: 5, started: true, slot: 4, pos: 3, pj: 10 } },
};
/* the locked list: week 5, both counting from 6, Coleman's waiver week in */
const LIST = [{ week: 5, date: UPHELD, upheldAt: UPHELD, faab: [{ from: 8, to: 10, amount: 5 }],
  teams: [{ teamId: 8, players: [{ pid: WASH, n: 'Mike Washington Jr.', pts: 6, from: 6 }] },
          { teamId: 10, players: [{ pid: COLE, n: 'Keon Coleman', pts: 15.9, from: 6 }] }] }];

const { breakdown: B } = await M.computeCoaching(TEAMS, M.tradesFillTx(LOG, LIST), WK, 2026);
const c2 = id => r1(B[id].c2);

head('2026: the list, and only the list');
ok('Coleman counts his week 6 start: 15.9 -- not the week 7 bench, not week 8 after he left', B[10].detail.tradesReceived.filter(r => r.pid === COLE)
  .map(r => [r.week, r.from, r.pts, !!r.rec]), [[5, 6, 15.9, true]]);
ok('the Tinglers pay what Coleman would have scored for THEM: weeks 6 and 8 -- not 7, and week 8 with another team still counts',
  B[8].detail.tradesSent.filter(r => r.pid === COLE).map(r => [r.pts, r.cfw]), [[27.9, [6, 8]]]);
ok('BFT pay what Washington would have scored for them: week 6 only', B[10].detail.tradesSent.filter(r => r.pid === WASH).map(r => [r.pts, r.cfw]), [[6, [6]]]);
ok('the breakdown says it is lineup points', B[10].detail.c2Lineup, true);
ok('dated by the trade\'s own week, not the period ESPN processed it in', B[8].detail.tradesSent.filter(r => r.pid).map(r => r.week), [5]);
ok('BFT: (15.9 − 6) ÷ 10, plus $5 at 2 points a dollar', c2(10), r1((15.9 - 6) / 10 + 1));
ok('the Tinglers: Washington\'s 6 in, Coleman\'s 27.9 out, and the $5', c2(8), r1((6 - 27.9) / 10 - 1));
ok('a trade accepted but not upheld counts for nobody -- players or money', [c2(12), B[12].detail.tradesReceived.length + B[12].detail.tradesSent.length], [0, 0]);
ok('a man dropped to make room is not a player sent', [c2(9), B[9].detail.tradesSent.length], [0, 0]);
ok('waivers are untouched by any of it', B[3].detail.waiverPickups.length, 1);

head('2026 is a plain sum: no trade is weighed by its size');
const BIG = { week: 1, date: 1, espnId: 'big', teams: [{ teamId: 9, players: [{ pid: 501, pts: 100, from: 1 }] },
  { teamId: 3, players: [{ pid: 502, pts: 80, from: 1 }] }] };
const { breakdown: BW } = await M.computeCoaching(TEAMS, M.tradesFillTx(LOG, [BIG, ...LIST]), WK, 2026);
ok('a bigger trade elsewhere changes nothing about BFT\'s', [r1(BW[10].c2), BW[10].detail.c2Weigh], [1.99, undefined]);
const lone = (await M.computeCoaching(TEAMS, M.tradesFillTx([], [BIG, ...LIST]), WK, 2025)).breakdown;
ok('2025 keeps its own rule: every point, both ways, unweighted', [r1(lone[10].c2), lone[10].detail.c2Weigh], [0.99, undefined]);

head('a starter who came in the same trade does not count against the man sent');
/* team 1 sends X (WR, projected 10) to team 2 for Y (WR). That week team 1 starts Y (projected 15) and Z (12),
   with W (WR, 9) on the bench. Without Y, W would have started: X beats 9, so X would have started. */
const ST = [{ week: 4, date: 2, espnId: 'st', upheldAt: 2, teams: [{ teamId: 1, players: [{ pid: 702, pts: 0, from: 4 }] },
  { teamId: 2, players: [{ pid: 701, pts: 0, from: 4 }] }] }];
const SW = { 4: { 701: { team: 2, pts: 20, started: true, slot: 4, pos: 3, pj: 10 }, 702: { team: 1, pts: 15, started: true, slot: 4, pos: 3, pj: 15 },
  703: { team: 1, pts: 12, started: true, slot: 4, pos: 3, pj: 12 }, 704: { team: 1, pts: 9, started: false, slot: 20, pos: 3, pj: 9 } } };
const two = [1, 2].map(id => ({ id, pf: 100 }));
const SB = (await M.computeCoaching(two, M.tradesFillTx([], ST), SW, 2026)).breakdown;
ok('X is charged his 20: he beats the bench man who would have played in Y\'s place', SB[1].detail.tradesSent.map(r => [r.pid, r.pts]), [[701, 20]]);

head('two men sent in one trade share the spots: a tie goes to the narrower spot, so the flex stays open');
/* team 1 sends a WR (projected 15) and an RB (12) to team 2. Team 1 that week starts a WR at 10 and a FLEX
   at 10, and two RBs at 20 and 18. The WR must take the WR spot, not the flex, or the RB has nowhere to go. */
const TT = [{ week: 3, date: 3, espnId: 'tt', upheldAt: 3, teams: [{ teamId: 1, players: [] },
  { teamId: 2, players: [{ pid: 801, pts: 0, from: 3 }, { pid: 802, pts: 0, from: 3 }] }] }];
const TW = { 3: { 801: { team: 2, pts: 9, started: true, slot: 4, pos: 3, pj: 15 }, 802: { team: 2, pts: 7, started: true, slot: 2, pos: 2, pj: 12 },
  803: { team: 1, pts: 5, started: true, slot: 23, pos: 3, pj: 10 }, 804: { team: 1, pts: 5, started: true, slot: 4, pos: 3, pj: 10 },
  805: { team: 1, pts: 5, started: true, slot: 2, pos: 2, pj: 20 }, 806: { team: 1, pts: 5, started: true, slot: 2, pos: 2, pj: 18 } } };
const TB = (await M.computeCoaching(two, M.tradesFillTx([], TT), TW, 2026)).breakdown;
ok('both would have started: the WR in the WR spot, the RB in the flex', TB[1].detail.tradesSent.map(r => [r.pid, r.pts]).sort((x, y) => x[0] - y[0]), [[801, 9], [802, 7]]);

head('before the list lands, and before 2026');
const early = (await M.computeCoaching(TEAMS, LOG, WK, 2026)).breakdown;
ok('2026 with no list yet: the log, as it always was', early[12].detail.tradesReceived.length > 0, true);
ok('...and nothing is weighed', early[12].detail.c2Weigh, undefined);
const mixed = M.tradesFillTx(LOG, LIST);
ok('2025 reads the log whatever else is in the list', M.c2Txns('2025', mixed), mixed);
ok('2026 drops the log\'s trades once the list is in, and keeps everything else',
  M.c2Txns('2026', mixed).map(t => t._from || t.type), ['WAIVER', 'trades']);

head('the Trade ROI table says the trade\'s week');
const APP = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
ok('a row off the list reads "wk 5 trade"; an older season keeps "wk N+"',
  /r\.rec\?`wk \$\{r\.week\} trade`:`wk \$\{r\.from\?\?\(r\.week\+1\)\}\+`/.test(APP), true);
ok('the card shows each trade: its size of the biggest, the share it counts, and what it adds',
  APP.includes('pts moved · counts ${Math.round(x.w*100)}%') && APP.includes('(${sum}) ÷ 10 = '), true);
ok('boot scores C2 with the list, and re-scores when the live list says something different',
  APP.includes('const [c2Trades]=await Promise.all([c2TradesNow(season),') && /if\(sig===_c2Sig\[season\]\) return;/.test(APP), true);

head('the server: a dropped player\'s weeks come off his player card');
const API = fs.readFileSync(new URL('../api/espn.js', import.meta.url), 'utf8').split(String.fromCharCode(13)).join('');
const line = API.split(NL).find(l => l.trim().startsWith('const ptsSince = (pid, from) =>'));
const weeks = [5, 6, 7];
const wk = { 5: { [COLE]: { team: 8, pts: 7.7 } }, 6: { [WASH]: { team: 8, pts: 6 } }, 7: {} };
const card = { [COLE]: { 5: 7.7, 6: 15.9 }, [WASH]: { 5: 2, 6: 99 } };
const ptsSince = new Function('weeks', 'wk', 'card', line.trim() + NL + 'return ptsSince;')(weeks, wk, card);
ok('a week no roster holds him: the card', ptsSince(COLE, 6), 15.9);
ok('a rostered week: the roster, whatever else says otherwise', ptsSince(WASH, 6), 6);
ok('a week nobody has played yet is nothing', ptsSince(COLE, 7), 0);
const branch = API.slice(API.indexOf('if (!isHistory) {', API.indexOf("type === 'seasontrades'")), API.indexOf("source: 'espn-feed' });"));
ok('one player-card call for every player in every trade, and the card is what scores them',
  /kona_playercard/.test(branch) && /filterIds: \{ value: tradedIds \}/.test(branch) && /pts: \+ptsSince\(m\.pid, from\)/.test(branch), true);

console.log(NL + (fail ? 'FAILED  ' : 'ok  ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
