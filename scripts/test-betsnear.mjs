/* THE HOMEPAGE'S BETS: TWO WEEKS OUT OF THE LEAGUE'S STORE, AND ONLY WHEN
 * SOMEBODY DOES SOMETHING.
 *
 *   THE STORE           every ticket of the season, kept on the device: read
 *                       whole the first time and once a week, otherwise only
 *                       what was placed or settled since the last sync, plus
 *                       offers and challenges by id
 *   THE TWO WEEKS       this bucks week and the one before, out of the store
 *   DRAWING             asks only when there is nothing in hand, never because
 *                       a copy has aged: a game repaints the homepage every few
 *                       seconds, and that is what ran a Thursday's quota out
 *   ARRIVING            opening the homepage or the book, or coming back to the
 *                       app, refreshes a copy ten minutes old -- and not sooner
 *   A WRITE             of our own goes straight through, past the throttle
 *   A FAILURE           is not retried inside a minute; a quota block not at all
 *   WHICH COPY          the season's, when a Leaderboards visit left one in hand
 *
 * Run: node scripts/test-betsnear.mjs
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

/* Thursday 8 October 2026, nine at night, in whatever zone this runs in --
   the bucks week is local time, the same as on a phone */
const T0 = new Date(2026, 9, 8, 21, 0).getTime();
const MIN = 60000, HR = 60 * MIN, DAY = 24 * HR;
const M = assemble(grab, [
  'const bucksTestMs=', 'function realWeekStart(', 'function tueWeekStart(', 'function bucksWeekKey(',
  'const BETS_ALL_TTL=', 'let _lg=', 'const lgKey=', 'function lgLoad(', 'function lgSave(', 'const lgSince=',
  'async function lgSync(', 'function betsAllDrop(){', 'function betsAllAt(',
  'const BETS_NEAR_TTL=', 'let _betsNear=', 'function betsNearKeys(', 'function lgNear(',
  'function betsNearWarm(){', 'async function betNear(){', 'function betsNear(){', 'function betsNearAge(){',
  'function betsNearGo(){', 'function betsNearWant(){', 'function betsNearFresh(){',
], ['betsNearKeys', 'betsNearWant', 'betsNearFresh', 'betsNear', 'betsAllDrop', 'betNear',
  'clock', 'reads', 'wheres', 'answer', 'failNext', 'setQuota', 'setAll', 'store', 'setTest', 'reset', 'gets'], [
  /* the clock, ALL of it: a Date with no arguments is the fake clock too */
  `let _now=${T0}; const clock=ms=>{ _now+=ms; }; globalThis.Date.now=()=>_now;`,
  'const Date=(()=>{ const D=globalThis.Date; return class extends D{ constructor(...a){ if(a.length) super(...a); else super(_now); } static now(){ return _now; } }; })();',
  'let _bkScope=0, _test=0; const isTestProfile=()=>_test>0; let _CFG={bucksTestMinutes:0};',
  'const setTest=m=>{ _test=m; _CFG.bucksTestMinutes=m; };',
  /* localStorage, as a map: the store lives on the device, so a reopened app has it */
  'const _ss=new Map(); const localStorage={getItem:k=>_ss.has(k)?_ss.get(k):null,',
  '  setItem:(k,v)=>{_ss.set(k,String(v));}, removeItem:k=>{_ss.delete(k);}, key:i=>[..._ss.keys()][i]??null, get length(){ return _ss.size; }};',
  'const store=(k,v)=>{ if(v===undefined) return _ss.get(k); _ss.set(k,v); };',
  /* the queries, answered when the test says so */
  'let _reads=0, _wheres=[], _pending=[], _failNext=false, _betErr=null;',
  'const reads=()=>_reads; const wheres=()=>_wheres;',
  'const betQuery=where=>{ _reads++; _wheres.push(where);',
  '  if(_failNext){ _failNext=false; _betErr="fetch"; return Promise.resolve(null); }',
  '  return new Promise(r=>_pending.push(r)); };',
  'const answer=rows=>{ const p=_pending; _pending=[]; p.forEach(r=>r(rows)); };',
  'let _gets=[]; const gets=()=>_gets;',
  'const betGet=async ids=>{ _gets.push(ids); return ids.map(id=>({id,season:"2026",wk:"2026-10-06",status:"open"})); };',
  'const failNext=()=>{ _failNext=true; };',
  'const settle=()=>new Promise(r=>setTimeout(r,0));',
  'let _fsQuota=false; const setQuota=v=>{_fsQuota=v;};',
  'const sbSeason=()=>2026; const fsEq=(f,v)=>({fieldFilter:{field:{fieldPath:f},op:"EQUAL",value:{stringValue:String(v)}}});',
  'let _betsAll=null; const setAll=rows=>{ _betsAll=rows; };',
  'let _painted=0; const betsNearPaint=()=>{ _painted++; };',
  /* a fresh device: nothing in hand, nothing stored */
  'const reset=()=>{ _betsNear=null; _betsNearAt=0; _betsNearBusy=false; _betsNearTry=0; _betsNearStale=false;',
  '  _ss.clear(); _reads=0; _wheres=[]; _gets=[]; _pending=[]; _failNext=false; _betErr=null; _fsQuota=false; _betsAll=null;',
  '  _lg=null; _lgBusy=null; _lgStale=false; _now=' + T0 + '; };',
  'const settle2=()=>settle();',
].join(NL));
const tick = async () => { for (let i = 0; i < 4; i++) await new Promise(r => setTimeout(r, 0)); };
/* a ticket of the season, stamped with a bucks week */
const t = (id, wk = '2026-10-06', status = 'open') => ({ id, season: '2026', wk, status });
const what = w => w.fieldFilter.field.fieldPath + ' ' + w.fieldFilter.op;
/* a sync after the first is two range queries in turn: placed, then settled */
const sync = async (placed = [], settled = []) => { M.answer(placed); await tick(); M.answer(settled); await tick(); };
const ids = () => (M.betsNear() || []).map(b => b.id).sort();

head('which weeks');
ok('a Thursday: this bucks week and last', M.betsNearKeys(new Date(T0)), ['2026-10-06', '2026-09-29']);
ok('five on a Tuesday morning is still last week', M.betsNearKeys(new Date(2026, 9, 6, 5, 0)), ['2026-09-29', '2026-09-22']);
ok('and six is the new one', M.betsNearKeys(new Date(2026, 9, 6, 6, 0)), ['2026-10-06', '2026-09-29']);
M.setTest(30);
const tk = M.betsNearKeys(new Date(2026, 9, 8, 21, 10));
ok('on the short test cycle, two neighbouring buckets', [tk.length, tk.every(k => /^2026-10-08T\d{4}$/.test(k)), tk[0] > tk[1]], [2, true, true]);
M.setTest(0);

head('the first read fills the store');
M.reset();
M.betsNearWant();
ok('one read, the whole season, since the device has nothing kept', [M.reads(), what(M.wheres()[0]), M.wheres()[0].fieldFilter.value.stringValue],
  [1, 'season EQUAL', '2026']);
M.betsNearWant(); M.betsNearFresh();
ok('nothing more while it is in the air', M.reads(), 1);
M.answer([t('a'), t('b', '2026-09-29'), t('old', '2026-09-15')]); await tick();
ok('the homepage draws this week and last out of it', ids(), ['a', 'b']);
ok('and the whole season is kept on the device', JSON.parse(M.store('gfl:league:2026')).rows.length, 3);

head('drawing never refreshes');
/* a three-hour game: the homepage repainted every ten seconds */
for (let i = 0; i < 3 * 360; i++) { M.clock(10000); M.betsNearWant(); }
await tick();
ok('three hours of repaints during a game: no further read', M.reads(), 1);

head('arriving does, past ten minutes, and asks only for what changed');
M.reset();
M.betsNearFresh(); M.answer([t('a'), t('s1', '2026-10-06', 'open')]); await tick();
const synced = Date.now();
M.clock(9 * MIN); M.betsNearFresh();
ok('back inside ten minutes: the copy in hand', M.reads(), 1);
M.clock(2 * MIN); M.betsNearFresh();
await sync([t('c')], [t('s1', '2026-10-06', 'won')]);
ok('past ten: what was placed since and what was settled since, never the season again',
  [M.reads(), M.wheres().slice(1).map(what)], [3, ['ts GREATER_THAN', 'settledTs GREATER_THAN']]);
ok('since the last sync, less two hours for a clock running behind', M.wheres()[1].fieldFilter.value.stringValue, String(synced - 2 * HR));
ok('the new ticket is drawn, and the settled one replaces its open copy',
  [ids(), M.betsNear().find(b => b.id === 's1').status], [['a', 'c', 's1'], 'won']);

head('offers and challenges are looked at by id');
M.reset();
M.betsNearFresh(); M.answer([t('a'), t('o1', '2026-10-06', 'offer'), t('ch1', '2026-10-06', 'challenge'), t('w1', '2026-10-06', 'won')]); await tick();
M.clock(11 * MIN); M.betsNearFresh();
await sync([], []);
ok('the settle job can open one without a stamp, so those two are read again -- nothing else is', M.gets(), [['o1', 'ch1']]);

head('a write of our own');
M.clock(20000);
M.betsAllDrop();
ok('the store stays on the device, the copy on screen stays', [!!M.store('gfl:league:2026'), M.betsNear().length], [true, 4]);
const before = M.reads();
M.betsNearWant();
ok('and the next draw asks, inside the minute and inside the ten', M.reads(), before + 1);
await sync([t('mine')], []);
M.betsNearWant();
ok('once, and it is on screen', [M.reads(), ids().includes('mine')], [before + 2, true]);

head('failures');
M.reset();
M.failNext(); M.betsNearWant(); await tick();
ok('a failed first read leaves nothing in hand', [M.reads(), M.betsNear()], [1, null]);
M.clock(30000); M.betsNearWant(); M.betsNearFresh();
ok('and is not tried again inside a minute', M.reads(), 1);
M.clock(31000); M.betsNearWant();
ok('after one, it is', M.reads(), 2);
M.reset(); M.setQuota(true);
M.betsNearWant(); M.betsNearFresh();
ok('over quota: nothing asked at all', M.reads(), 0);
M.reset();
M.betsNearFresh(); M.answer([t('a')]); await tick();
M.clock(11 * MIN); M.failNext(); M.betsNearFresh(); await tick();
ok('a short query that fails for any reason but the quota falls back to the whole season',
  [M.reads(), what(M.wheres()[2])], [3, 'season EQUAL']);

head('a reopen');
M.reset();
M.store('gfl:league:2026', JSON.stringify({ t: Date.now() - 4 * MIN, full: Date.now() - DAY, rows: [t('kept'), t('older', '2026-09-01')] }));
M.betsNearWant();
ok('inside ten minutes: painted from the store, nothing read', [M.reads(), ids()], [0, ['kept']]);
M.reset();
M.store('gfl:league:2026', JSON.stringify({ t: Date.now() - 11 * MIN, full: Date.now() - DAY, rows: [t('old')] }));
M.betsNearWant();
ok('older than that: one short query, not the season', [M.reads(), what(M.wheres()[0])], [1, 'ts GREATER_THAN']);

head('the whole season once a week');
M.reset();
M.store('gfl:league:2026', JSON.stringify({ t: Date.now() - 11 * MIN, full: Date.now() - 8 * DAY, rows: [t('old')] }));
M.betsNearFresh();
ok('a store whose full read is a week old is read whole again', what(M.wheres()[0]), 'season EQUAL');

head('kept on the device');
M.reset();
M.store('gfl:betsNear:2026-10-06', JSON.stringify({ t: Date.now(), rows: [] }));
M.store('gfl:betsAll:2026', JSON.stringify({ t: Date.now(), rows: [] }));
M.store('gfl:league:2025', JSON.stringify({ t: Date.now(), rows: [] }));
M.betsNearWant(); M.answer([t('fresh')]); await tick();
ok('one store per season, and the separate copies it replaced are cleared away',
  [!!M.store('gfl:league:2026'), M.store('gfl:betsNear:2026-10-06'), M.store('gfl:betsAll:2026'), M.store('gfl:league:2025')],
  [true, undefined, undefined, undefined]);

head('which copy');
M.reset();
M.betsNearWant(); M.answer([t('near')]); await tick();
M.setAll([t('near'), t('season2', '2026-09-08')]);
ok('the season copy, from the same store, answers when it is in hand', M.betsNear().length, 2);

console.log(NL + (fail ? 'FAILED  ' : 'ok  ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
