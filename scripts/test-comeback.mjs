/* BIG COMEBACK: A LOSER WHO WAS 90% TO WIN.
 *
 *   WHO GETS ONE        every game in the week just finished whose loser was at
 *                       90% or better at some point, the line inclusive; the
 *                       opening number counts, the final reading (the result,
 *                       not a chance) does not; a tie is nobody's comeback
 *   WHAT IT SAYS        the loser's peak, when it was, and the winner down to
 *                       the other side of it and winning anyway
 *   WHERE IT GOES       the winner's schedule, that week's drawer, the graph
 *   WHAT IT COSTS       the series asked for at most every five minutes, the
 *                       six curves worked out once per series
 *
 * Run: node scripts/test-comeback.mjs
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

const NOW = Date.UTC(2026, 9, 8, 15);
const M = assemble(grab, ['const NT_COMEBACK_AT=', 'let _ntCbTry=', 'function ntComebacks(out){'],
  ['ntComebacks', 'set', 'calls', 'asked', 'NT_COMEBACK_AT'], [
  `Date.now=()=>${NOW};`,
  "const ntSeason=()=>'2026';",
  "let _fresh=true; const ntResultsFresh=()=>_fresh;",
  /* week 4: six games, winners first; team ids 1..12, owners o1..o12 */
  "const OWN={}; for(let i=1;i<=12;i++) OWN[i]='o'+i;",
  "const G=(h,hp,a,ap)=>({home:{teamId:h,totalPoints:hp},away:{teamId:a,totalPoints:ap}});",
  "const ntLastWeek=()=>({week:4,meta:{owners:OWN},games:[",
  "  G(1,130,2,120), G(3,110,4,100), G(5,140,6,90), G(7,101,8,99), G(9,100,10,100), G(11,120,12,119)]});",
  /* the curve each loser's chance makes; an opening point, three readings, the result */
  "const CURVE={",
  "  o2:[0.40,0.70,0.95,0.80,0],",       //   peaks mid-game at 95%
  "  o4:[0.45,0.60,0.89,0.50,0],",       //   89%: short of the line
  "  o6:[0.30,0.40,0.60,0.20,0.99],",    //   a high last point is the result, not a peak
  "  o8:[0.92,0.70,0.50,0.40,0],",       //   the opening number is the peak
  "  o10:[0.50,0.95,0.97,0.50,0.5],",    //   a tie: nobody lost
  "  o12:[0.40,0.90,0.70,0.60,0]};",     //   exactly 90%
  "let _calls=0; const calls=()=>_calls;",
  "const T0=29850000;",
  "const wpCurve=(series,proj,lose)=>{ _calls++; return (CURVE[lose]||[]).map((p,i,a)=>",
  "  ({t:T0+i*60,p,done:i===a.length-1})); };",
  "let _series={'o1~o2':[[1]]}; let _asked=0; const asked=()=>_asked;",
  "const wpSeriesFor=()=>_series;",
  "const wpEnsureSeries=()=>{ _asked++; return new Promise(()=>{}); };",
  "const sbBuild=()=>({rows:[]}); const schedOpenMu=()=>0;",
  "const _liveSeries=null, _liveProj=null;",
  "const ntWeekResultsDay=(s,w)=>Date.UTC(2026,9,6);",
  "const ntName=(s,o)=>o.toUpperCase()+' FC';",
  "const ntStat=(o,n,v,l)=>`[${o}|${n}|${v}|${l}]`;",
  "let _activeTab='home'; const renderNotifications=()=>{}; const orderHomeTodo=()=>{};",
  "const set=(k,v)=>{ if(k==='series') _series=v; if(k==='fresh') _fresh=v; };",
].join(NL));

head('who gets one');
let out = []; M.ntComebacks(out);
const losers = out.map(c => c.goOpp);
ok('a loser who was 95% to win', losers.includes('o2'), true);
ok('not one who topped out at 89%', losers.includes('o4'), false);
ok('the final reading is the result and is no peak', losers.includes('o6'), false);
ok('the opening number counts', losers.includes('o8'), true);
ok('a tie is nobody\'s comeback', losers.includes('o10'), false);
ok('90% exactly is enough', losers.includes('o12'), true);
ok('and that is all of them', losers.sort(), ['o12', 'o2', 'o8']);

head('what it says');
const c2 = out.find(c => c.goOpp === 'o2');
ok('a comeback card of its own, once per loser per week', [c2.kind, c2.id, c2.title], ['comeback', 'cb:2026:4:o2', 'Big comeback']);
ok('leading with the loser\'s peak', c2.art, '[o2|O2 FC|95.0%|peak chance]');
ok('the winner, down to the other side of it and winning anyway',
  c2.body.startsWith('<b>O1 FC</b> were down to 5.0% on ') && c2.body.endsWith(' and won 130.0–120.0.'), true);
ok('a peak before the first reading is before kickoff', out.find(c => c.goOpp === 'o8').body.includes('8.0% before kickoff'), true);
ok('dated with the rest of that Tuesday', c2.day, Date.UTC(2026, 9, 6));

head('where it goes');
ok('the winner\'s schedule, that week, the loser\'s row', [c2.go, c2.goTeam, c2.goWeek, c2.goOpp], ['graph', 1, 4, 'o2']);

head('what it costs');
const before = M.calls();
M.ntComebacks([]); M.ntComebacks([]);
ok('the curves are worked out once per series, not per render', M.calls(), before);
M.set('series', null);
out = []; M.ntComebacks(out);
ok('no series in hand: no cards, and it is asked for', [out.length, M.asked()], [0, 1]);
M.ntComebacks([]);
ok('but not again inside five minutes', M.asked(), 1);
M.set('series', { 'o1~o2': [[1]] }); M.set('fresh', false);
out = []; M.ntComebacks(out);
ok('and nothing once the week has stopped being news', out.length, 0);

console.log(NL + (fail ? 'FAILED  ' : 'ok  ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
