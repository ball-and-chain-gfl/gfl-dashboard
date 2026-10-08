/* TUESDAY'S LAST CARD: YOUR MATCHUP GRAPH.
 *
 *   YOUR GAME           one card for the manager signed in, about their own
 *                       game in the week just finished, naming the opponent;
 *                       nobody signed out, and nobody on a bye, gets one
 *   WITH THE RESULTS    dated to the Tuesday that week was read out on, and
 *                       gone when the rest of that week's results are
 *   LAST IN THE STACK   under the standings, the Matchup of the Week, and even
 *                       a card from later in the week
 *   SOMEWHERE TO GO     its button names the Schedule's graph and carries the
 *                       week and opponent whose drawer it opens
 *
 * Run: node scripts/test-ntgraph.mjs
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

const M = assemble(grab, [
  'const NT_KINDS=', 'function ntWeekResultsDay(season,week){', 'function ntGraph(out){',
  'function ntLive(){', 'const NT_GO=',
], ['NT_KINDS', 'NT_GO', 'ntGraph', 'ntLive', 'ntWeekResultsDay', 'setMe', 'setFresh', 'setCards'], [
  'let _me=null; const setMe=m=>{_me=m;};',
  'let _fresh=true; const setFresh=f=>{_fresh=f;}; const ntResultsFresh=()=>_fresh;',
  'let _cards=[]; const setCards=c=>{_cards=c;}; const ntAll=()=>_cards;',
  "const ntSeason=()=>'2026';",
  /* week 4: team 10 (bft) beat team 5 (fman); team 3 had the bye */
  'const OWN={10:"bft",5:"fman",7:"kunk",2:"mcm"};',
  'const ntLastWeek=s=>({week:4,meta:{owners:OWN},games:[',
  '  {home:{teamId:10,totalPoints:129.24},away:{teamId:5,totalPoints:128.58}},',
  '  {home:{teamId:2,totalPoints:101.1},away:{teamId:7,totalPoints:140.2}}]});',
  'const ntName=(s,o)=>o.toUpperCase()+" FC";',
  'const ntScore=(a,b,note,wk)=>`[${a.owner} ${a.pts} > ${b.owner} ${b.pts} wk${wk}]`;',
  'const ntToday=()=>ntWeekResultsDay("2026",4)+3*86400000;',
  'const isTestProfile=()=>false; const _CFG={};',
  'const ntMyVote=()=>""; const ntSeen=()=>new Set();',
].join(NL));

head('your game');
M.setMe(null);
let out = []; M.ntGraph(out);
ok('signed out, no card', out.length, 0);
M.setMe({ k1: 'bft', teamId: 10 });
out = []; M.ntGraph(out);
ok('signed in, one card', out.length, 1);
const c = out[0];
ok('of its own kind, with an icon', [c.kind, !!M.NT_KINDS.graph], ['graph', true]);
ok('one per manager per week', c.id, 'wg:2026:4');
ok('about their own game, winner first', c.art, '[bft 129.24 > fman 128.58 wk4]');
ok('naming who they played', c.body.includes('week 4') && c.body.includes('FMAN FC'), true);
M.setMe({ k1: 'fman', teamId: '5' });
out = []; M.ntGraph(out);
ok('the other side sees the same game, from their end', [out[0].goOpp, out[0].art],
  ['bft', '[bft 129.24 > fman 128.58 wk4]']);
M.setMe({ k1: 'bye', teamId: 3 });
out = []; M.ntGraph(out);
ok('a bye has no game and no card', out.length, 0);

head('with the results');
M.setMe({ k1: 'bft', teamId: 10 });
out = []; M.ntGraph(out);
ok('dated to the Tuesday week 4 was read out on', out[0].day, M.ntWeekResultsDay('2026', 4));
M.setFresh(false);
out = []; M.ntGraph(out);
ok('and gone when the week stops being news', out.length, 0);
M.setFresh(true);

head('last in the stack');
const T = M.ntWeekResultsDay('2026', 4), D = 86400000;
M.setCards([
  { kind: 'graph', id: 'wg:2026:4', day: T, pin: -1 },
  { kind: 'blowout', id: 'bl', day: T },
  { kind: 'standings', id: 'st', day: T, pin: 1 },
  { kind: 'trade', id: 'tr', day: T + 2 * D },
  { kind: 'motw', id: 'mw', day: T, pin: 2 },
  { kind: 'wire', id: 'nw', day: T },
]);
ok('under every other card, even one from later in the week',
  M.ntLive().map(n => n.id), ['mw', 'st', 'tr', 'bl', 'nw', 'wg:2026:4']);

head('somewhere to go');
ok('its button says where', M.NT_GO.graph, 'See the graph');
ok('the bets cards still say theirs', M.NT_GO.bets, 'Open My Bets');
ok('and it carries the drawer to open', [c.go, c.goWeek, c.goOpp], ['graph', 4, 'fman']);

console.log(NL + (fail ? 'FAILED  ' : 'ok  ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
