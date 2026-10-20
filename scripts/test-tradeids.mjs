/* A TRADE KEEPS ITS VOTES, ITS MONEY, AND ITS PLACE IN TRADE ROI.
 *
 *   VOTES FOLLOW IT     a trade voted on in its review window is dated by the
 *                       accept; processed, it comes back dated by the
 *                       processing. With no votes under its own id it takes the
 *                       id of votes on the same teams within four days -- never
 *                       one another trade already answers to
 *   THE MONEY           the notification lists FAAB as dollars, never as a
 *                       player called #0
 *   TRADE ROI           any movement the trades page knows and the log does not
 *                       is added as the accept the log should have carried
 *
 * Run: node scripts/test-tradeids.mjs
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
const grab = lifter(new URL('../public/app.js', import.meta.url));

const M = assemble(grab, ['function ntTradeVoteId(', 'const TRADE_VOTE_DRIFT=', 'function tradeAdoptVotes(',
  'function tradesFillTx('], ['ntTradeVoteId', 'tradeAdoptVotes', 'tradesFillTx']);
const field = (tr) => 'tv_' + M.ntTradeVoteId('2026', tr).replace(/[^a-zA-Z0-9_]/g, '_');
const H = 3600000;

/* the real ones, 13 October 2026 */
const ACCEPT = 1791737959164, PROCESSED = 1791897184579;
const riceAdams = () => ({ week: 4, date: 1790797396529, teams: [{ teamId: 2, players: [{ pid: 4428331 }] }, { teamId: 9, players: [{ pid: 16800 }] }] });
const today = () => ({ week: 6, date: PROCESSED, teams: [{ teamId: 8, players: [{ pid: 4686658 }] }, { teamId: 10, players: [{ pid: 4635008 }] }],
  faab: [{ from: 8, to: 10, amount: 125 }] });
const FIELDS = new Set(['tv_td_2026_2_9_1790797396529', 'tv_td_2026_10_8_1791737959164', 'tv_td_2026_2_3_1788102664091']);

head('votes follow a trade whose date moved');
let list = [riceAdams(), today()];
ok('one trade moved', M.tradeAdoptVotes('2026', list, FIELDS), 1);
ok('the processed trade answers to the votes cast during review', field(list[1]), 'tv_td_2026_10_8_1791737959164');
ok('its date is left alone -- that is what puts it in this week', list[1].date, PROCESSED);
ok('a trade already answering to its own votes is not touched', [list[0].id, field(list[0])], [undefined, 'tv_td_2026_2_9_1790797396529']);
ok('and running it again changes nothing', M.tradeAdoptVotes('2026', list, FIELDS), 0);

head('but only the same teams, nearby, and nobody else\'s');
list = [{ ...today(), teams: [{ teamId: 8, players: [] }, { teamId: 11, players: [] }] }];
ok('other teams: no', [M.tradeAdoptVotes('2026', list, FIELDS), list[0].id], [0, undefined]);
list = [{ ...today(), date: ACCEPT + 5 * 24 * H }];
ok('more than four days apart: no', [M.tradeAdoptVotes('2026', list, FIELDS), list[0].id], [0, undefined]);
/* the earlier trade between the pair is in the list and holds its own field */
const tenEight = () => ({ ...today(), teams: [today().teams[1], today().teams[0]] });
list = [{ ...tenEight(), date: ACCEPT }, { ...today(), date: ACCEPT + 2 * H }];
ok('a field another trade answers to is never taken', [M.tradeAdoptVotes('2026', list, FIELDS), list[1].id], [0, undefined]);
ok('and nothing to adopt is nothing done', M.tradeAdoptVotes('2026', [today()], new Set()), 0);

head('Trade ROI reads every trade the trades page does');
const log = [{ type: 'TRADE_ACCEPT', status: 'EXECUTED', teamId: 8, scoringPeriodId: 6,
  items: [{ type: 'TRADE', playerId: 4635008, fromTeamId: 8, toTeamId: 10 }, { type: 'TRADE', playerId: 4686658, fromTeamId: 10, toTeamId: 8 }] }];
const scored = () => ({ ...today(), week: 5, teams: [{ teamId: 8, players: [{ pid: 4686658, pts: 6, from: 6 }] }, { teamId: 10, players: [{ pid: 4635008, pts: 15.9, from: 6 }] }] });
const filled = M.tradesFillTx(log, [riceAdams(), scored()]);
const added = filled.filter(t => t._from === 'trades');
ok('every trade on the list goes in, the one the log has as well as the one it lost', added.length, 2);
ok('the log itself is left as it was', filled.filter(t => !t._from), log);
ok('as the accept it should have been: both moves, the week, the time',
  [added[0].items.map(i => `${i.playerId}:${i.fromTeamId}>${i.toTeamId}`), added[0].scoringPeriodId, added[0].processDate, added[0].status],
  [['4428331:9>2', '16800:2>9'], 4, 1790797396529, 'EXECUTED']);
ok('carrying the trade\'s own week, each player\'s first week and his points',
  [added[1].scoringPeriodId, added[1].items.filter(i => i.type === 'TRADE').map(i => [i.playerId, i.from, i.pts])],
  [5, [[4686658, 6, 6], [4635008, 6, 15.9]]]);
const again = M.tradesFillTx(filled, [riceAdams(), { ...scored(), teams: [scored().teams[0], { teamId: 10, players: [{ pid: 4635008, pts: 31.2, from: 6 }] }] }]);
ok('filled again, it replaces -- points grow every week, rows do not', [again.filter(t => t._from === 'trades').length,
  again.flatMap(t => t.items).filter(i => i.playerId === 4635008 && i.pts != null).map(i => i.pts)], [2, [31.2]]);
ok('a player id of 0 is nobody', M.tradesFillTx([], [{ week: 1, date: 1, teams: [{ teamId: 1, players: [{ pid: 0 }] }, { teamId: 2, players: [] }] }]).length, 0);

head('the vote name the archive holds survives the merge');
const MR = assemble(grab, ['function tradeMergeRow('], ['tradeMergeRow']);
const mergedRow = MR.tradeMergeRow(today(), { ...today(), id: '10-8:1791737959164', votes: { bft: '10' } });
ok('a vote cast on the page lands where the archiver reads', field(mergedRow), 'tv_td_2026_10_8_1791737959164');
head('the notification says the money');
const N = assemble(grab, ['function ntTradeVoteId(', 'const TRADE_VOTE_DRIFT=', 'function tradeAdoptVotes(', 'function tradesAdopt(', 'function ntTrades(out){'],
  ['ntTrades', 'setCache'], [
  "let _tradeCache={}, _tradeVotes={}, _cpRows=[], _me=null, _ntTradeSeason=null, _activeTab='home';",
  "const setCache=c=>{ _tradeCache=c; };",
  "const sbBoardSeason=()=>'2026'; const ntSeason=()=>'2026'; const tradeVoteOpen=()=>true;",
  "let _teams=[{id:8,name:'Team Eight'},{id:10,name:'Team Ten'}]; const _ownerMap={8:'{e}',10:'{t}'};",
  "const ntDayOf=t=>t; const ntWeekOf=()=>6;",
  "const ntSwap=(a,b)=>JSON.stringify([a.got,b.got]);",
].join(NL));
N.setCache({ 2026: { trades: [{ ...today(), teams: [{ teamId: 8, players: [{ pid: 4686658, n: 'Mike Washington Jr.' }] },
  { teamId: 10, players: [{ pid: 4635008, n: 'Keon Coleman' }, { pid: 0, n: '#0' }] }] }] } });
const cards = []; N.ntTrades(cards);
ok('dollars where the #0 was', JSON.parse(cards[0].art), [['Mike Washington Jr.'], ['Keon Coleman', '$125 FAAB']]);

head('FAAB is never dropped on the way');
/* a player sold for money: one side gets a player, the other only dollars */
N.setCache({ 2026: { trades: [{ week: 6, date: PROCESSED, teams: [{ teamId: 8, players: [{ pid: 4686658, n: 'Mike Washington Jr.' }] },
  { teamId: 10, players: [] }], faab: [{ from: 8, to: 10, amount: 50 }] }] } });
let c2 = []; N.ntTrades(c2);
ok('a side that got only money says the money', JSON.parse(c2[0].art), [['Mike Washington Jr.'], ['$50 FAAB']]);
/* the log saw a budget item, the feed never gave the amount */
N.setCache({ 2026: { trades: [{ ...today(), faab: undefined, faabSeen: [{ from: 8, to: 10 }] }] } });
c2 = []; N.ntTrades(c2);
ok('money we know moved but cannot price is said, not skipped', JSON.parse(c2[0].art)[1].includes('FAAB (amount not reported yet)'), true);
const kept = MR.tradeMergeRow({ ...today(), faab: undefined }, { ...today(), faab: [{ from: 8, to: 10, amount: 125 }] });
ok('a live row that lost the amount does not erase the archived one', kept.faab, [{ from: 8, to: 10, amount: 125 }]);
const seenKept = MR.tradeMergeRow({ ...today(), faab: undefined }, { ...today(), faab: undefined, faabSeen: [{ from: 8, to: 10 }] });
ok('nor does it forget that there was money at all', seenKept.faabSeen, [{ from: 8, to: 10 }]);
ok('and an amount, once known, retires the unknown', MR.tradeMergeRow({ ...today(), faabSeen: [{ from: 8, to: 10 }] }, null).faabSeen === undefined
  || MR.tradeMergeRow({ ...today(), faabSeen: [{ from: 8, to: 10 }] }, { ...today() }).faabSeen === undefined, true);

head('and the server and the archive are built to keep it');
const API = fs.readFileSync(new URL('../api/espn.js', import.meta.url), 'utf8');
const ARC = fs.readFileSync(new URL('./archive-trades.mjs', import.meta.url), 'utf8');
ok('the log is read with its proposals, where a trade\'s contents live', /filterType:\{ value:\['TRADE_ACCEPT','TRADE_PROPOSAL'\] \}/.test(API), true);
ok('a budget item is remembered as money seen', /seen\.push\(\{ from: Number\(it\.fromTeamId\), to: Number\(it\.toTeamId\) \}\)/.test(API), true);
ok('a trade with money and no amount is written to the function log', /with no amount in the feed/.test(API), true);
ok('the stamped telling keeps the money it replaces', /if \(at >= 0 && trades\[at\]\.faab && !row\.faab\) row\.faab = trades\[at\]\.faab;/.test(API), true);
ok('the archive never lets an amount go', /if \(!\(t\.faab && t\.faab\.length\) && was && was\.faab && was\.faab\.length\)/.test(ARC), true);
ok('and warns on the run when one is missing', /::warning::/.test(ARC), true);

console.log(NL + (fail ? 'FAILED  ' : 'ok  ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
