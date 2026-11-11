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
  'const BETS_ALL_TTL=', 'let _lg=', 'const lgKey=', 'function lgLoad(', 'function lgSave(', 'const lgSince=', 'async function lgSync(',
  'let _betsAll=null,_betsAllBusy=false;', 'async function betLeague(){',
], ['betQuery', 'betLeague', 'fsEq', 'seed', 'sent', 'reset', 'stored', 'failWith', 'err', 'age', 'newPage'], [
  'const GFL_DB={project:"p",key:"k"}; const msgKey=()=>"key=k";',
  'const fsNoteResponse=r=>r; const sbSeason=()=>2026; let _fsQuota=false; const betGet=async ids=>[];',
  'let _bets=null,_betErr=null,_betBusy=false; const err=()=>_betErr;',
  'const _ss=new Map(); const localStorage={getItem:k=>_ss.has(k)?_ss.get(k):null,',
  '  setItem:(k,v)=>{_ss.set(k,String(v));}, removeItem:k=>{_ss.delete(k);}, key:i=>[..._ss.keys()][i]??null, get length(){ return _ss.size; }};',
  'const stored=()=>{ const v=_ss.get("gfl:league:2026"); return v?JSON.parse(v).rows.length:null; };',
  /* the store as a later page finds it, its last sync `ms` ago */
  'const age=ms=>{ const j=JSON.parse(_ss.get("gfl:league:2026")); j.t-=ms; _ss.set("gfl:league:2026",JSON.stringify(j)); _lg=null; };',
  'const newPage=()=>{ _betsAll=null; _sent=[]; };',
  /* the collection, and every structured query sent to it */
  'let _docs=[], _sent=[], _status=200;',
  'const seed=(n,owner)=>{ _docs=Array.from({length:n},(_,i)=>({',
  '  name:"projects/p/databases/(default)/documents/bets/b"+String(i).padStart(4,"0"),',
  '  fields:{owner:{stringValue:owner||("m"+(i%12))},season:{stringValue:"2026"},',
  '    ts:{stringValue:String(1e12+i)},stake:{stringValue:"10"}}})); };',
  'const sent=()=>_sent; const failWith=s=>{ _status=s; };',
  'const reset=()=>{ _ss.clear(); _sent=[]; _betsAll=null; _betsAllBusy=false; _betErr=null; _status=200; _lg=null; _lgStale=false; _lgBusy=null; };',
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
ok('and every one of them is kept in the store on the device', M.stored(), 328);
await M.betLeague();
ok('a second visit is drawn from that copy, not read again', M.sent().length, 1);
M.newPage(); await M.betLeague();
ok('nor is a new page inside ten minutes', M.sent().length, 0);
M.newPage(); M.age(11 * 60000);
const later = await M.betLeague();
ok('past ten minutes it asks only for what was placed or settled since, never the season again',
  [M.sent().map(x => x.where.fieldFilter.field.fieldPath + ' ' + x.where.fieldFilter.op), later.length],
  [['ts GREATER_THAN', 'settledTs GREATER_THAN'], 328]);

head('two pages asking at once');
/* Team Data and the Leaderboards both ask, and each redraws only when its own
   ask comes back with the tickets. The second used to be answered null while
   the first was still reading, so it never redrew: the Leaderboard stuck on
   "Reading the book..." with no profit. Both must get the tickets, off one read. */
M.reset(); M.seed(328);
const [first, second] = await Promise.all([M.betLeague(), M.betLeague()]);
ok('the second ask gets the tickets too, not null', [first && first.length, second && second.length], [328, 328]);
ok('and it is still one read of the season', M.sent().length, 1);

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

head('your own tickets, kept between opens');
{
  const O = assemble(grab, [
    'const BETS_MINE_TTL=', 'let _betsAt=', 'let _betsFullAt=', 'const betsMineKey=', 'function betsMineStored(', 'async function betRefresh(', 'function betsMineSave(',
    'function betsMineCheck(', 'async function initBets(',
  ], ['initBets', 'betRefresh', 'betsMineCheck', 'betsMineStored', 'state', 'setMe', 'setQuota', 'clock', 'keep', 'kept', 'reads', 'answer', 'reset', 'BETS_MINE_TTL'], [
    'let _now=globalThis.Date.UTC(2026,10,6,21); const clock=ms=>{ _now+=ms; };',
    'const Date=(()=>{ const D=globalThis.Date; return class extends D{ constructor(...a){ if(a.length) super(...a); else super(_now); } static now(){ return _now; } }; })();',
    'let _me={k1:"bft"}, _bets=null, _betsInit=false, _fsQuota=false;',
    'const setMe=m=>{ _me=m; }; const setQuota=v=>{ _fsQuota=v; };',
    'const _ls=new Map(); const localStorage={getItem:k=>_ls.has(k)?_ls.get(k):null, setItem:(k,v)=>{_ls.set(k,String(v));}, removeItem:k=>{_ls.delete(k);}};',
    'const keep=(k,v)=>{ _ls.set(k,JSON.stringify(v)); }; const kept=k=>{ const v=_ls.get(k); return v?JSON.parse(v):null; };',
    'let _reads=0, _pend=[]; const reads=()=>_reads;',
    'const betList=()=>{ _reads++; return new Promise(r=>_pend.push(r)); };',
    'const answer=rows=>{ const p=_pend; _pend=[]; p.forEach(r=>r(rows)); return new Promise(r=>setTimeout(r,0)); };',
    'const betsAllDrop=()=>{}; const renderMyBets=()=>{}; const betSettleAll=()=>{};',
    'const state=()=>({bets:_bets, at:_betsAt, init:_betsInit});',
    'const reset=()=>{ _ls.clear(); _reads=0; _pend=[]; _bets=null; _betsInit=false; _betsAt=0; _fsQuota=false; _me={k1:"bft"}; };',
  ].join(NL));
  const MIN = 60000, now = () => Date.now();
  O.reset();
  O.keep('gfl:bets:bft', { t: Date.UTC(2026, 10, 6, 21) - 5 * MIN, rows: [{ id: 'mine' }] });
  await O.initBets();
  ok('a boot inside ten minutes of the last read paints from the device and reads nothing', [O.reads(), O.state().bets.map(b => b.id)], [0, ['mine']]);
  O.reset();
  O.keep('gfl:bets:bft', { t: Date.UTC(2026, 10, 6, 21) - 11 * MIN, rows: [{ id: 'old' }] });
  const boot = O.initBets(); await O.answer([{ id: 'new' }]); await boot;
  ok('an older copy is read again, and the new one kept for the next boot',
    [O.reads(), O.state().bets.map(b => b.id), O.kept('gfl:bets:bft').rows.map(b => b.id)], [1, ['new'], ['new']]);
  O.clock(1 * MIN); O.betsMineCheck();
  ok('the Sportsbook leaves a copy a minute old alone', O.reads(), 1);
  O.clock(2 * MIN); O.betsMineCheck(); await O.answer([{ id: 'newer' }]);
  ok('and asks again once it is two minutes old', [O.reads(), O.state().bets.map(b => b.id)], [2, ['newer']]);
  O.clock(5 * MIN); O.setQuota(true); O.betsMineCheck();
  ok('but never while the database is refusing', O.reads(), 2);
  O.reset();
  O.keep('gfl:bets:bft', { t: Date.UTC(2026, 10, 6, 21), rows: [{ id: 'bfts' }] });
  O.setMe({ k1: 'kunk' });
  ok('another account never paints from your copy', O.betsMineStored(), null);
  O.reset();
  const out = O.betRefresh(); O.setMe({ k1: 'kunk' }); await O.answer([{ id: 'bfts' }]); await out;
  ok('and an account switched mid-read keeps nothing', [O.state().bets, O.kept('gfl:bets:bft'), O.kept('gfl:bets:kunk')], [null, null, null]);
  const src = (await import('node:fs')).readFileSync(new URL('../public/app.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const place = src.slice(src.indexOf('async function sbPlaceBet('), src.indexOf('async function sbPlaceBet(') + 4000);
  ok('a stake is checked against tickets read in the last minute, or refused',
    [place.indexOf('if(Date.now()-_betsAt>BETS_MINE_STAKE_MS){') > 0,
      place.indexOf('await betRefresh()') > 0 && place.indexOf('await betRefresh()') < place.indexOf("_betErr='funds'")], [true, true]);
  ok('and the Sportsbook checks its copy every time it is opened', src.includes("if(name==='book'){ renderBook(); initBets(); try{ betsMineCheck(); }catch(e){}"), true);
}

head('your tickets, each read once');
{
  const G = assemble(grab, [
    'const fsIn=', 'const betDocRow=', 'const fsEq=', 'const BET_FINAL=', 'const BET_FULL_MS=', 'let _betsFullAt=', 'function betsLedger(',
    'async function betGet(', 'async function betMine(',
  ], ['betMine', 'betsLedger', 'BET_FINAL', 'keep', 'queries', 'gets', 'answerQ', 'answerGet', 'setErrOn', 'err', 'fullAt', 'reset'], [
    'let _now=globalThis.Date.UTC(2026,10,7,3); const Date=(()=>{ const D=globalThis.Date; return class extends D{ constructor(...a){ if(a.length) super(...a); else super(_now); } static now(){ return _now; } }; })();',
    'const GFL_DB={project:"p",key:"k"}; const msgKey=()=>"key=k"; const fsNoteResponse=r=>r;',
    'let _betErr=null; const err=()=>_betErr; const fullAt=()=>_betsFullAt;',
    'const _ls=new Map(); const localStorage={getItem:k=>_ls.has(k)?_ls.get(k):null, setItem:(k,v)=>{_ls.set(k,String(v));}};',
    'const keep=(acct,v)=>{ _ls.set("gfl:bets:"+acct,JSON.stringify(v)); };',
    /* queries and batch fetches, answered from queues the test fills */
    'let _q=[], _qA=[], _errOn=null, _g=[], _gA=[];',
    'const queries=()=>_q; const gets=()=>_g; const answerQ=(...a)=>{ _qA.push(...a); }; const answerGet=(...a)=>{ _gA.push(...a); };',
    'const setErrOn=e=>{ _errOn=e; };',
    'const betQuery=async (where,ordered,limit)=>{ _q.push({where,ordered,limit});',
    '  if(_errOn&&_q.length===1){ _betErr=_errOn; return null; } return _qA.shift()||[]; };',
    'const fetch=async (url,opt)=>{ const ids=JSON.parse(opt.body).documents.map(n=>n.split("/").pop()); _g.push(ids);',
    '  const by=_gA.shift()||{}; return {ok:true,status:200,json:async()=>ids.map(id=>by[id]?{found:{name:"x/bets/"+id,fields:by[id]}}:{missing:"x/bets/"+id})}; };',
    'const reset=()=>{ _ls.clear(); _q=[]; _qA=[]; _g=[]; _gA=[]; _errOn=null; _betErr=null; _betsFullAt=0; _now=globalThis.Date.UTC(2026,10,7,3); };',
  ].join(NL));
  const NOW = Date.UTC(2026, 10, 7, 3), HR = 3600e3;
  const row = (id, status, ts, owner = 'bft') => ({ id, owner, status, ts, stake: 10, ret: status === 'won' ? 20 : 0 });
  const f = (status, ts) => ({ owner: { stringValue: 'bft' }, status: { stringValue: status }, ts: { stringValue: String(ts) }, stake: { stringValue: '10' } });

  G.reset();
  G.answerQ([row('a', 'won', NOW - 50 * HR)]);
  const first = await G.betMine('bft');
  ok('a device with nothing kept reads every ticket, with no limit, and notes when',
    [G.queries().length, JSON.stringify(G.queries()[0].where).includes('"op":"EQUAL"'), G.queries()[0].limit, first.map(b => b.id), G.fullAt()], [1, true, 0, ['a'], NOW]);

  G.reset();
  G.keep('bft', { t: NOW - 3 * HR, full: NOW - 5 * HR, rows: [row('won1', 'won', NOW - 40 * HR), row('lost1', 'lost', NOW - 30 * HR),
    row('open1', 'open', NOW - 20 * HR), row('offer1', 'offer', NOW - 10 * HR), row('seat', 'invite', NOW - 9 * HR, 'kunk')] });
  G.answerQ([row('new1', 'open', NOW - HR)]);
  G.answerGet({ open1: f('won', NOW - 20 * HR), offer1: f('offer', NOW - 10 * HR) });
  const inc = await G.betMine('bft');
  const q = G.queries()[0], since = JSON.stringify(q.where);
  ok('with a copy from today: one query for what is newer than the last sync, less two hours',
    [G.queries().length, since.includes('"op":"GREATER_THAN"'), since.includes('"stringValue":"' + String(NOW - 5 * HR) + '"'), q.ordered, q.limit], [1, true, true, true, 0]);
  ok('and the ones still in play by id -- never a settled one, never somebody else\'s', G.gets(), [['open1', 'offer1']]);
  const by = Object.fromEntries(inc.map(b => [b.id, b.status]));
  ok('settled tickets come from the device untouched, the rest as they are now, plus anything new',
    by, { won1: 'won', lost1: 'lost', open1: 'won', offer1: 'offer', new1: 'open' });
  ok('and the day\'s full read is still the one on record', G.fullAt(), NOW - 5 * HR);

  G.reset();
  G.keep('bft', { t: NOW - HR, full: NOW - 25 * HR, rows: [row('won1', 'won', NOW - 40 * HR)] });
  G.answerQ([row('won1', 'won', NOW - 40 * HR), row('x', 'lost', NOW - 30 * HR)]);
  await G.betMine('bft');
  ok('a copy whose full read is a day old is read again from scratch', [G.queries().length, JSON.stringify(G.queries()[0].where).includes('GREATER_THAN'), G.fullAt()], [1, false, NOW]);

  G.reset();
  G.keep('bft', { t: NOW - HR, full: NOW - 2 * HR, rows: [row('won1', 'won', NOW - 40 * HR)] });
  G.setErrOn('fetch'); G.answerQ([row('won1', 'won', NOW - 40 * HR)]);
  const back = await G.betMine('bft');
  ok('if the short query fails it falls back to reading everything', [G.queries().length, back.map(b => b.id)], [2, ['won1']]);
  G.reset();
  G.keep('bft', { t: NOW - HR, full: NOW - 2 * HR, rows: [row('won1', 'won', NOW - 40 * HR)] });
  G.setErrOn('quota');
  ok('but not while the database is refusing', [await G.betMine('bft'), G.queries().length], [null, 1]);

  G.reset();
  G.keep('bft', { t: NOW - HR, rows: [row('won1', 'won', NOW - 40 * HR), row('seat', 'open', NOW - 9 * HR, 'kunk')] });
  ok('a copy saved before today counts its read as a full one, and keeps only your tickets',
    [G.betsLedger('bft').full, G.betsLedger('bft').rows.map(b => b.id)], [NOW - HR, ['won1']]);
  ok('every final status is final, and nothing in play is', [['won', 'lost', 'push', 'void', 'cashed', 'declined'].every(s => G.BET_FINAL.has(s)),
    ['open', 'offer', 'invite', 'challenge'].some(s => G.BET_FINAL.has(s))], [true, false]);
  const src = (await import('node:fs')).readFileSync(new URL('../public/app.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const clear = src.slice(src.indexOf('async function sbClearSettled('), src.indexOf('async function sbClearSettled(') + 1200);
  ok('clearing settled tickets saves the device\'s copy, since they are never read again', clear.includes('betsMineSave();'), true);
}

console.log(NL + `${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
