/* THE CEILING ON WHAT ONE DEVICE CAN SPEND OF THE LEAGUE'S FIRESTORE.
 *
 *   COUNTED BY DOCUMENT  a query that comes back with 223 bets is 223 reads; a
 *                        document is one, missing or not; a refusal is none
 *   THE LOOP GUARD       one query asked 10 times in an hour for 1,500+
 *                        documents stops, alone, for the hour (503) -- the rest
 *                        of the page keeps working
 *   THE CEILINGS         5,000 reads an hour in a tab, 15,000 a day on the
 *                        device across reloads; past one, everything answers
 *                        429 and the page says the device paused itself
 *   THURSDAY             the season's bets every two minutes through a game is
 *                        stopped twenty minutes in
 *
 * Run: node scripts/test-fsguard.mjs
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

/* Thursday 8 October 2026, 8pm Eastern = 00:00 UTC Friday */
const T0 = Date.UTC(2026, 9, 9, 0, 0);
const NAMES = ['const FS_CEIL=', 'const FS_LOOP=', 'let _fsBudget=', 'const _fsHour=', 'function fsPtDay(',
  'function fsPtMidnight(', 'const fsDayKey=', 'function fsDaySpent(', 'function fsHourSpent(', 'function fsTally(',
  'function fsCeiling(', 'function fsLooping(', 'function fsKind(', 'function fsWhat(', 'function fsDocsIn(',
  'function fsSpentBy(', 'const fsAnswer=', 'function fsGovern(', 'function fsLimitText(){'];
const PRELUDE = [
  'const clock=ms=>{ globalThis.__now+=ms; }; Date.now=()=>globalThis.__now;',
  /* localStorage as a map that outlives a 'reload' (a fresh assemble) */
  'const localStorage=globalThis.__ls;',
  'let _errs=0; const console={error:()=>{ _errs++; }}; const errs=()=>_errs;',
  /* the network: Firestore answers whatever the test queues */
  'let _sent=0; const sent=()=>_sent;',
  'const win={ fetch:async(u,o)=>{ _sent++; return globalThis.__answer(String(u),o); } };',
  'const budget=()=>_fsBudget;',
].join(NL);
const EXPORTS = ['win', 'sent', 'clock', 'errs', 'budget', 'fsGovern', 'fsKind', 'fsWhat', 'fsDocsIn', 'fsPtDay',
  'fsPtMidnight', 'fsLimitText'];
const fresh = () => { const M = assemble(grab, NAMES, EXPORTS, PRELUDE); M.fsGovern(M.win); return M; };
const store = new Map();
globalThis.__now = T0;
globalThis.__ls = { getItem: k => store.has(k) ? store.get(k) : null, setItem: (k, v) => store.set(k, String(v)) };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const docs = n => Array.from({ length: n }, (_, i) => ({ document: { name: 'x/bets/' + i, fields: {} } }));
globalThis.__answer = (u, o) => {
  if (!/firestore/.test(u)) return json({ ok: true });
  if (/runQuery/.test(u)) { const b = JSON.parse(o.body); return json(b.__n ? docs(b.__n) : [{ readTime: 'x' }]); }
  if (/missing/.test(u)) return json({}, 404);
  if (/refused/.test(u)) return json({}, 429);
  if (o && o.method && o.method !== 'GET') return json({});
  if (/\/profiles\?/.test(u)) return json({ documents: docs(15).map(d => d.document) });
  return json({ name: 'x', fields: {} });
};
const FS = 'https://firestore.googleapis.com/v1/projects/p/databases/(default)/documents';
const season = n => [FS + ':runQuery?key=k', { method: 'POST', body: JSON.stringify({ __n: n, structuredQuery: {
  from: [{ collectionId: 'bets' }], where: { fieldFilter: { field: { fieldPath: 'season' }, op: 'EQUAL', value: { stringValue: '2026' } } } } }) }];
const near = n => [FS + ':runQuery?key=k', { method: 'POST', body: JSON.stringify({ __n: n, structuredQuery: {
  from: [{ collectionId: 'bets' }], where: { fieldFilter: { field: { fieldPath: 'wk' }, op: 'IN', value: { arrayValue: { values: [] } } } } } }) }];
const settle = () => new Promise(r => setTimeout(r, 0));
const ask = async (M, [u, o]) => { const r = await M.win.fetch(u, o); await settle(); await settle(); return r.status; };

head('what a request is');
let M = fresh();
ok('queries and GETs read; the rest write', [M.fsKind(FS + ':runQuery', 'POST'), M.fsKind(FS + '/profiles/bft', 'GET'),
  M.fsKind(FS + '/profiles/bft', 'PATCH'), M.fsKind(FS + '/bets', 'POST')], ['r', 'r', 'w', 'w']);
ok('named by collection and filter, never by key or document id', [M.fsWhat(...season(1)), M.fsWhat(FS + '/profiles/bft?key=k'),
  M.fsWhat(FS + '/profiles?pageSize=300&key=k')], ['query bets season EQUAL 2026', 'doc profiles', 'list profiles']);
ok('documents in a query, a list, a document', [M.fsDocsIn(docs(223)), M.fsDocsIn([{ readTime: 'x' }]),
  M.fsDocsIn({ documents: [1, 2, 3] }), M.fsDocsIn({ name: 'x' })], [223, 1, 3, 1]);
ok('the Pacific day, and when it turns', [M.fsPtDay(T0), new Date(M.fsPtMidnight(T0)).toISOString()],
  ['2026-10-08', '2026-10-09T07:00:00.000Z']);

head('counting');
await ask(M, ['https://gfl-dashboard.vercel.app/api/espn?type=nflstate', {}]);
ok('anything that is not Firestore goes straight through, uncounted', store.size, 0);
await ask(M, season(223));
ok('a query is charged the documents it returned', Number(store.get('gfl:fsr:2026-10-08')), 223);
await ask(M, [FS + '/profiles/missing?key=k', {}]);
await ask(M, [FS + '/profiles/refused?key=k', {}]);
ok('a missing document still costs its read; a refusal costs nothing', Number(store.get('gfl:fsr:2026-10-08')), 224);
await ask(M, [FS + '/profiles/bft?key=k', { method: 'PATCH', body: '{}' }]);
ok('a write is a write', Number(store.get('gfl:fsw:2026-10-08')), 1);

head('Thursday');
store.clear(); M = fresh();
const statuses = [];
for (let i = 0; i < 30; i++) { statuses.push(await ask(M, season(223))); M.clock(120000); }
const stopped = statuses.indexOf(503);
ok('the season every two minutes is stopped at the eleventh ask -- twenty minutes in', [stopped, stopped * 2], [10, 20]);
ok('and stays stopped for the hour, costing nothing more', [statuses.slice(stopped).every(s => s === 503), Number(store.get('gfl:fsr:2026-10-08'))],
  [true, 2230]);
ok('while everything else carries on', [await ask(M, near(80)), await ask(M, [FS + '/profiles/bft?key=k', {}])], [200, 200]);
ok('and the console was told once', M.errs(), 1);
M.clock(3600000);
ok('an hour later it may ask again', await ask(M, season(223)), 200);

head('ordinary use never meets it');
store.clear(); M = fresh();
const day = [];
/* a heavy Sunday: the app opened twenty times, the Leaderboards five, the live
   series flushed every three minutes for ten hours, a bet placed an hour */
for (let h = 0; h < 10; h++) {
  for (let o = 0; o < 2; o++) { day.push(await ask(M, [FS + '/profiles?pageSize=300&key=k', {}]), await ask(M, near(90))); }
  if (h % 2 === 0) day.push(await ask(M, season(700)));
  for (let f = 0; f < 20; f++) { day.push(await ask(M, [FS + '/live/2026-w6?key=k', {}])); M.clock(180000); }
}
ok('every request answered', day.every(s => s === 200), true);
ok('about six thousand documents, well under the ceiling', Number(store.get('gfl:fsr:2026-10-08')) < 15000, true);

head('the ceilings');
globalThis.__now = T0;
store.clear(); M = fresh();
let st = [];
for (let i = 0; i < 6; i++) st.push(await ask(M, [FS + ':runQuery?key=k', { method: 'POST', body: JSON.stringify({ __n: 1000,
  structuredQuery: { from: [{ collectionId: 'c' + i }] } }) }]));
ok('5,000 documents in a tab inside an hour: the sixth query is refused', st, [200, 200, 200, 200, 200, 429]);
ok('the page says the device paused itself, and until when', [M.budget().scope, M.fsLimitText().head],
  ['hour', 'This device has paused its own league reads']);
store.clear(); store.set('gfl:fsr:2026-10-08', '15000');
M = fresh();
ok('15,000 on the device today, across a reload: refused', await ask(M, near(10)), 429);
ok('until Pacific midnight', new Date(M.budget().until).toISOString(), '2026-10-09T07:00:00.000Z');
M.clock(7 * 3600000);
M = fresh();
ok('and the new day starts clean', await ask(M, near(10)), 200);
store.clear(); M = fresh();
ok('with nothing tripped, the page blames the league limit', M.fsLimitText().head, 'The league database has hit its daily free-tier limit');

head('and the pause lifts');
{
  const L = assemble(grab, ['let _fsBudget=', 'function fsPtDay(', 'function fsPtMidnight(', 'let _fsLiftT=', 'function fsLiftArm(', 'function fsLift('],
    ['fsLiftArm', 'fsLift', 'due', 'reloads', 'show', 'pause'], [
    'let _timers=[]; const setTimeout=(f,ms)=>{ _timers.push([f,ms]); return _timers.length; };',
    'let _vis="visible"; const document={get visibilityState(){ return _vis; }}; const show=v=>{ _vis=v; };',
    'let _reloads=0; const location={reload:()=>{ _reloads++; }}; const reloads=()=>_reloads;',
    'const due=()=>_fsLiftDue; const pause=u=>{ _fsBudget={until:u}; };',
  ].join(NL));
  /* 9pm Central on 6 November is 03:00 UTC on the 7th; midnight Pacific is 08:00 UTC */
  globalThis.__now = Date.UTC(2026, 10, 7, 3, 0);
  L.fsLiftArm();
  ok('refused at 9pm Central: the page will reload a quarter past midnight Pacific', L.due(), Date.UTC(2026, 10, 7, 8, 15));
  L.fsLift();
  ok('and not before', L.reloads(), 0);
  globalThis.__now = Date.UTC(2026, 10, 7, 8, 16); L.show('hidden'); L.fsLift();
  ok('hidden at that moment, it waits to be on screen', L.reloads(), 0);
  L.show('visible'); L.fsLift();
  ok('then reloads, once it is', L.reloads(), 1);
  const E = assemble(grab, ['let _fsBudget=', 'function fsPtDay(', 'function fsPtMidnight(', 'let _fsLiftT=', 'function fsLiftArm(', 'function fsLift('], ['fsLiftArm', 'due', 'pause'], [
    'const setTimeout=()=>1; const due=()=>_fsLiftDue; const pause=u=>{ _fsBudget={until:u}; };'].join(NL));
  globalThis.__now = Date.UTC(2026, 10, 7, 8, 5);
  E.fsLiftArm();
  ok('refused just after midnight, before the reset has landed: it looks again in fifteen minutes', E.due(), Date.UTC(2026, 10, 7, 8, 20));
  const P = assemble(grab, ['let _fsBudget=', 'function fsPtDay(', 'function fsPtMidnight(', 'let _fsLiftT=', 'function fsLiftArm(', 'function fsLift('], ['fsLiftArm', 'due', 'pause'], [
    'const setTimeout=()=>1; const due=()=>_fsLiftDue; const pause=u=>{ _fsBudget={until:u}; };'].join(NL));
  globalThis.__now = Date.UTC(2026, 10, 7, 3, 0); P.pause(Date.UTC(2026, 10, 7, 4, 0)); P.fsLiftArm();
  ok('paused by its own ceiling, it lifts when that pause ends', P.due(), Date.UTC(2026, 10, 7, 4, 0));
  globalThis.__now = T0;
}

head('one read of a profile for a burst of asks');
{
  const S = assemble(grab, ['const PROF_SHARE_MS=', 'const _profShare=', 'function gflFetchProfileShared(', 'async function gflPatchProfile('],
    ['gflFetchProfileShared', 'gflPatchProfile', 'fetched', 'failNext'], [
    'let _fetched=0, _fail=false; const fetched=()=>_fetched; const failNext=()=>{ _fail=true; };',
    'const gflFetchProfile=async id=>{ _fetched++; if(_fail){ _fail=false; return {error:"offline"}; } return {data:{id}}; };',
    'const gflPatchProfileRaw=async ()=>({ok:true});',
  ].join(NL));
  globalThis.__now = T0;
  const asks = await Promise.all(Array.from({ length: 16 }, () => S.gflFetchProfileShared('bft')));
  ok('sixteen asks for your profile as an open settles are one read', [S.fetched(), asks.every(a => a.data.id === 'bft')], [1, true]);
  globalThis.__now += 21000; await S.gflFetchProfileShared('bft');
  ok('twenty seconds on, it is read again', S.fetched(), 2);
  await S.gflPatchProfile('bft', { x: '1' }); await S.gflFetchProfileShared('bft');
  ok('and a write of ours drops the shared copy at once', S.fetched(), 3);
  S.failNext(); await S.gflFetchProfileShared('kunk'); await S.gflFetchProfileShared('kunk');
  ok('a failed read is not shared: the next ask tries again', S.fetched(), 5);
  globalThis.__now = T0;
  const src = (await import('node:fs')).readFileSync(new URL('../public/app.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const fn = n => { const i = src.indexOf('async function ' + n + '('); return src.slice(i, src.indexOf('\n}\n', i)); };
  ok('the syncs that only read share; anything that writes back from what it read asks fresh',
    [['plantSync', 'eggSync', 'bkSync', 'pkSync', 'ntSync', 'ttSync', 'ttCheck'].every(n => fn(n).includes('gflFetchProfileShared(')),
      fn('eggSave').includes('await gflFetchProfile(_me.k1)'), fn('bamPaySave').includes('gflFetchProfile(acct)'),
      fn('invSync').includes('(fresh?gflFetchProfile:gflFetchProfileShared)'), src.includes('try{ await invSync(true); }catch(e){}')],
    [true, true, true, true, true]);
  ok('and the trash-talk box checks the opponent once, not once a redraw', [fn('ttCheck').includes('||_ttChecking) return;'), fn('ttCheck').includes('_ttChecking=false;')], [true, true]);
}

console.log(NL + (fail ? 'FAILED  ' : 'ok  ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
