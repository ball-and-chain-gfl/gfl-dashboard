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
  'function nflWeekKickoffMs(season,w){', 'const nflSeasonOfMs=', 'const C3_SHARE_FROM=', 'const C3_REPL_FROM=', 'const C3_POS=', 'let _c3Lines=', 'function c3LinesFor(season){', 'function c3Score(', 'function c3ScoreRepl(',
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
/* the weekly rosters: Coleman is on nobody's after week 5 */
const WK = {
  5: { [COLE]: { team: 8, pts: 7.7, started: false }, [WASH]: { team: 10, pts: 2, started: false }, [PICK]: { team: 3, pts: 20, started: true },
       [PATS]: { team: 12, pts: 6, started: true }, [ZAY]: { team: 8, pts: 9, started: true }, [HOCK]: { team: 8, pts: 1.7, started: true } },
  6: { [WASH]: { team: 8, pts: 6, started: false }, [PATS]: { team: 12, pts: 5, started: true }, [ZAY]: { team: 8, pts: 11, started: true } },
};
/* the locked list: week 5, both counting from 6, Coleman's waiver week in */
const LIST = [{ week: 5, date: UPHELD, upheldAt: UPHELD, faab: [{ from: 8, to: 10, amount: 5 }],
  teams: [{ teamId: 8, players: [{ pid: WASH, n: 'Mike Washington Jr.', pts: 6, from: 6 }] },
          { teamId: 10, players: [{ pid: COLE, n: 'Keon Coleman', pts: 15.9, from: 6 }] }] }];

const { breakdown: B } = await M.computeCoaching(TEAMS, M.tradesFillTx(LOG, LIST), WK, 2026);
const c2 = id => r1(B[id].c2);

head('2026: the list, and only the list');
ok('Coleman is scored from the list: 15.9 from week 6, his waiver week in', B[10].detail.tradesReceived.filter(r => r.pid === COLE)
  .map(r => [r.week, r.from, r.pts, !!r.rec]), [[5, 6, 15.9, true]]);
ok('dated by the trade\'s own week, not the period ESPN processed it in', B[8].detail.tradesSent.filter(r => r.pid).map(r => r.week), [5]);
ok('BFT: (15.9 − 6) ÷ 10, plus $5 at 2 points a dollar', c2(10), r1((15.9 - 6) / 10 + 1));
ok('the Tinglers: the mirror of it', c2(8), r1((6 - 15.9) / 10 - 1));
ok('a trade accepted but not upheld counts for nobody -- players or money', [c2(12), B[12].detail.tradesReceived.length + B[12].detail.tradesSent.length], [0, 0]);
ok('a man dropped to make room is not a player sent', [c2(9), B[9].detail.tradesSent.length], [0, 0]);
ok('waivers are untouched by any of it', B[3].detail.waiverPickups.length, 1);

head('each trade counts by its size against the season\'s biggest');
/* add a blockbuster: 100 to the Miners, 80 to team 3 -- 180 points moved.
   The Coleman deal moved 6 + 15.9 + $5 at 2 a dollar = 31.9. */
const BIG = { week: 1, date: 1, espnId: 'big', teams: [{ teamId: 9, players: [{ pid: 501, pts: 100, from: 1 }] },
  { teamId: 3, players: [{ pid: 502, pts: 80, from: 1 }] }] };
const { breakdown: BW } = await M.computeCoaching(TEAMS, M.tradesFillTx(LOG, [BIG, ...LIST]), WK, 2026);
const w5 = 31.9 / 180;
ok('the biggest trade counts in full: the Miners +20 ÷ 10', r1(BW[9].c2), 2);
ok('the Coleman deal counts 31.9 of 180: BFT\'s +19.9 at that share', r1(BW[10].c2), r1(19.9 * w5 / 10));
ok('and the Tinglers lose the same share, no more', r1(BW[8].c2), r1(-19.9 * w5 / 10));
ok('the money is weighed with the trade it came in', BW[10].detail.tradesReceived.filter(r => r.faab != null).map(r => +r.w.toFixed(4)), [+w5.toFixed(4)]);
ok('the card is told the yardstick: the biggest, and each trade\'s size and week',
  [BW[10].detail.c2Weigh.max, r1(BW[10].detail.c2Weigh.size[M.tradesFillTx([], LIST)[0]._k]), BW[10].detail.c2Weigh.week.big], [180, 31.9, 1]);
const lone = (await M.computeCoaching(TEAMS, M.tradesFillTx([], [BIG, ...LIST]), WK, 2025)).breakdown;
ok('2025 is not weighed at all: BFT keeps the whole of (15.9 − 6) ÷ 10', [r1(lone[10].c2), lone[10].detail.c2Weigh], [0.99, undefined]);

head('before the list lands, and before 2026');
const early = (await M.computeCoaching(TEAMS, LOG, WK, 2026)).breakdown;
ok('2026 with no list yet: the log, as it always was', early[12].detail.tradesReceived.length > 0, true);
ok('...and nothing off the log is weighed', early[12].detail.c2Weigh, undefined);
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
