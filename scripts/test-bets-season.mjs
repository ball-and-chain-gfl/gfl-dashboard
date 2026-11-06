/* THE SEASON'S BETS: EVERY ONE OF THEM, NOT THE FIRST 300.
 *
 *   THE BOARDS          betLeague (Leaderboards, Team Data) asks for the season
 *                       with no limit, and gets 328 when there are 328 -- it
 *                       asked for 300 until week 9 and silently drew from those
 *   EVERYTHING ELSE     the owner read and the rest keep their 300 and their
 *                       order: nothing there is near it, and the owner read's
 *                       ordering is what its composite index exists for
 *   THE FREEZER         archive-charts reads the season with a runQuery and no
 *                       limit -- its list call took one page of 300 and never
 *                       followed the token, and week 8 froze two managers'
 *                       betting results from the wrong subset
 *
 * The Firestore stub below answers the way the real one does: a runQuery
 * returns at most `limit` documents when there is a limit, all of them when
 * there is not, and a lone readTime entry when nothing matches.
 *
 * Run: node scripts/test-bets-season.mjs
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
  'const fsIn=', 'const betDocRow=', 'const fsRunQueryUrl=', 'async function betQuery(', 'const fsEq=',
  'const BETS_ALL_TTL=', 'const betsAllKey=', 'function betsAllCached(){', 'function betsAllStore(rows){',
  'let _betsAll=null,_betsAllBusy=false;', 'async function betLeague(){',
], ['betQuery', 'betLeague', 'fsEq', 'seed', 'sent', 'reset', 'stored', 'failWith', 'err'], [
  'const GFL_DB={project:"p",key:"k"}; const msgKey=()=>"key=k";',
  'const fsNoteResponse=r=>r; const sbSeason=()=>2026;',
  'let _bets=null,_betErr=null,_betBusy=false; const err=()=>_betErr;',
  'const _ss=new Map(); const sessionStorage={getItem:k=>_ss.has(k)?_ss.get(k):null,',
  '  setItem:(k,v)=>{_ss.set(k,String(v));}, removeItem:k=>{_ss.delete(k);}};',
  'const stored=()=>{ const v=_ss.get("gfl:betsAll:2026"); return v?JSON.parse(v).rows.length:null; };',
  /* the collection, and every structured query sent to it */
  'let _docs=[], _sent=[], _status=200;',
  'const seed=(n,owner)=>{ _docs=Array.from({length:n},(_,i)=>({',
  '  name:"projects/p/databases/(default)/documents/bets/b"+String(i).padStart(4,"0"),',
  '  fields:{owner:{stringValue:owner||("m"+(i%12))},season:{stringValue:"2026"},',
  '    ts:{stringValue:String(1e12+i)},stake:{stringValue:"10"}}})); };',
  'const sent=()=>_sent; const failWith=s=>{ _status=s; };',
  'const reset=()=>{ _ss.clear(); _sent=[]; _betsAll=null; _betsAllBusy=false; _betErr=null; _status=200; };',
  'const fetch=async (url,opt)=>{',
  '  const q=JSON.parse(opt.body).structuredQuery; _sent.push(q);',
  '  if(_status!==200) return {ok:false,status:_status,json:async()=>({})};',
  '  const f=q.where.fieldFilter, want=f.value.stringValue;',
  '  let hit=_docs.filter(d=>(d.fields[f.field.fieldPath]||{}).stringValue===want);',
  '  if(q.limit) hit=hit.slice(0,q.limit);',
  '  const body=hit.length?hit.map(d=>({document:d,readTime:"t"})):[{readTime:"t"}];',
  '  return {ok:true,status:200,json:async()=>body}; };',
].join(NL));

head('the boards read the whole season');
for (const n of [0, 1, 299, 300, 301, 328, 650]) {
  M.reset(); M.seed(n);
  const rows = await M.betLeague();
  ok(`${n} bets in the season: ${n} on the boards`, rows.length, n);
}
M.reset(); M.seed(328);
await M.betLeague();
const q = M.sent()[0];
ok('one query, on the season, with no limit and no ordering', [M.sent().length, q.where.fieldFilter.field.fieldPath,
  q.where.fieldFilter.value.stringValue, 'limit' in q, 'orderBy' in q], [1, 'season', '2026', false, false]);
ok('and every one of them is kept for the next page in this tab', M.stored(), 328);
await M.betLeague();
ok('a second visit is drawn from that copy, not read again', M.sent().length, 1);

head('a failed read');
M.reset(); M.seed(328); M.failWith(429);
const failed = await M.betLeague();
ok('a quota answer draws an empty board and says why', [failed.length, M.err()], [0, 'quota']);
ok('and nothing is kept, so the next visit asks again', M.stored(), null);

head('everything else keeps its limit');
M.reset(); M.seed(320, 'bft');
const mine = await M.betQuery(M.fsEq('owner', 'bft'), true);
const oq = M.sent()[0];
ok('the owner read still asks for 300, newest first', [oq.limit, oq.orderBy[0].field.fieldPath, oq.orderBy[0].direction, mine.length],
  [300, 'ts', 'DESCENDING', 300]);
M.reset(); M.seed(40);
await M.betQuery(M.fsEq('wk', '2026-11-03'));
ok('an unordered read without a say keeps 300 too', [M.sent()[0].limit, 'orderBy' in M.sent()[0]], [300, false]);

head('the price freezer');
const charts = lifter(new URL('./archive-charts.mjs', import.meta.url));
const sq = new Function('const SEASON = "2026";' + NL + charts('const seasonQuery =') + NL + 'return seasonQuery;')();
ok('reads the season in one runQuery with no limit', [sq.structuredQuery.from[0].collectionId,
  sq.structuredQuery.where.fieldFilter.field.fieldPath, sq.structuredQuery.where.fieldFilter.value.stringValue,
  'limit' in sq.structuredQuery], ['bets', 'season', '2026', false]);
const csrc = (await import('node:fs')).readFileSync(new URL('./archive-charts.mjs', import.meta.url), 'utf8');
ok('and no longer lists the collection a page at a time', /documents\/bets\?key=/.test(csrc), false);

console.log(NL + `${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
