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
const filled = M.tradesFillTx(log, [riceAdams(), today()]);
const added = filled.filter(t => t._from === 'trades');
ok('the trade the log left empty is added', added.length, 1);
ok('as the accept it should have been: both moves, the week, the time',
  [added[0].items.map(i => `${i.playerId}:${i.fromTeamId}>${i.toTeamId}`), added[0].scoringPeriodId, added[0].processDate, added[0].status],
  [['4428331:9>2', '16800:2>9'], 4, 1790797396529, 'EXECUTED']);
ok('a trade the log already has is not added twice', filled.length, 2);
ok('nothing new returns the same list', M.tradesFillTx(filled, [riceAdams(), today()]) === filled, true);
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

console.log(NL + (fail ? 'FAILED  ' : 'ok  ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
