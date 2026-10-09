/* THE HOMEPAGE'S BETS: TWO WEEKS, AND ONLY WHEN SOMEBODY DOES SOMETHING.
 *
 *   THE QUERY           bets stamped with this bucks week or the one before --
 *                       an IN on wk, not the whole season
 *   DRAWING             asks only when there is nothing in hand, never because
 *                       a copy has aged: a game repaints the homepage every few
 *                       seconds, and that is what ran Thursday's quota out
 *   ARRIVING            opening the homepage or the book, or coming back to the
 *                       app, refreshes a copy ten minutes old -- and not sooner
 *   A WRITE             of our own goes straight through, past the throttle
 *   A FAILURE           is not retried inside a minute; a quota block not at all
 *   WHICH COPY          the season's, when a Leaderboards visit left a newer one
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
const MIN = 60000;
const M = assemble(grab, [
  'const bucksTestMs=', 'function realWeekStart(', 'function tueWeekStart(', 'function bucksWeekKey(',
  'function betsAllDrop(){',
  'const BETS_NEAR_TTL=', 'let _betsNear=', 'function betsNearKeys(', 'const betsNearStoreKey=',
  'function betsNearWarm(){', 'async function betNear(){', 'function betsNear(){', 'function betsNearAge(){',
  'function betsNearGo(){', 'function betsNearWant(){', 'function betsNearFresh(){',
], ['betsNearKeys', 'betsNearWant', 'betsNearFresh', 'betsNear', 'betsAllDrop', 'betNear',
  'clock', 'reads', 'lastWhere', 'answer', 'failNext', 'setQuota', 'setAll', 'store', 'setTest', 'reset', 'settle'], [
  `let _now=${T0}; const clock=ms=>{ _now+=ms; }; Date.now=()=>_now;`,
  'let _bkScope=0, _test=0; const isTestProfile=()=>_test>0; let _CFG={bucksTestMinutes:0};',
  'const setTest=m=>{ _test=m; _CFG.bucksTestMinutes=m; };',
  /* sessionStorage, as a map */
  'const _ss=new Map(); const sessionStorage={getItem:k=>_ss.has(k)?_ss.get(k):null,',
  '  setItem:(k,v)=>{_ss.set(k,String(v));}, removeItem:k=>{_ss.delete(k);}};',
  'const store=(k,v)=>{ if(v===undefined) return _ss.get(k); _ss.set(k,v); };',
  /* the one Firestore read, answered when the test says so */
  'let _reads=0, _where=null, _pending=[], _failNext=false;',
  'const reads=()=>_reads; const lastWhere=()=>_where;',
  'const betQuery=where=>{ _reads++; _where=where;',
  '  if(_failNext){ _failNext=false; return Promise.resolve(null); }',
  '  return new Promise(r=>_pending.push(r)); };',
  'const answer=rows=>{ const p=_pending; _pending=[]; p.forEach(r=>r(rows)); };',
  'const failNext=()=>{ _failNext=true; };',
  'const settle=()=>new Promise(r=>setTimeout(r,0));',
  'let _fsQuota=false; const setQuota=v=>{_fsQuota=v;};',
  'let _betsAll=null, _allAt=0; const betsAllAt=()=>_allAt; const betsAllKey=()=>"gfl:betsAll:2026";',
  'const setAll=(rows,at)=>{ _betsAll=rows; _allAt=at; };',
  'let _painted=0; const betsNearPaint=()=>{ _painted++; };',
  /* a fresh tab: nothing in hand, nothing stored */
  'const reset=()=>{ _betsNear=null; _betsNearAt=0; _betsNearBusy=false; _betsNearTry=0; _betsNearStale=false;',
  '  _ss.clear(); _reads=0; _pending=[]; _failNext=false; _fsQuota=false; _betsAll=null; _allAt=0; };',
].join(NL));
const tick = async () => { await M.settle(); await M.settle(); };

head('which weeks');
ok('a Thursday: this bucks week and last', M.betsNearKeys(new Date(T0)), ['2026-10-06', '2026-09-29']);
ok('five on a Tuesday morning is still last week', M.betsNearKeys(new Date(2026, 9, 6, 5, 0)), ['2026-09-29', '2026-09-22']);
ok('and six is the new one', M.betsNearKeys(new Date(2026, 9, 6, 6, 0)), ['2026-10-06', '2026-09-29']);
M.setTest(30);
const tk = M.betsNearKeys(new Date(2026, 9, 8, 21, 10));
ok('on the short test cycle, two neighbouring buckets', [tk.length, tk.every(k => /^2026-10-08T\d{4}$/.test(k)), tk[0] > tk[1]], [2, true, true]);
M.setTest(0);

head('the query');
M.reset();
M.betsNearWant();
const w = M.lastWhere();
ok('one read, an IN on wk with both weeks', [M.reads(), w.fieldFilter.field.fieldPath, w.fieldFilter.op,
  w.fieldFilter.value.arrayValue.values.map(v => v.stringValue)], [1, 'wk', 'IN', ['2026-10-06', '2026-09-29']]);
M.betsNearWant(); M.betsNearFresh();
ok('nothing more while it is in the air', M.reads(), 1);
M.answer([{ id: 'a' }, { id: 'b' }]); await tick();
ok('what landed is what is drawn, and kept for a reload', [M.betsNear().length, JSON.parse(M.store('gfl:betsNear:2026-10-06')).rows.length], [2, 2]);

head('drawing never refreshes');
/* a three-hour game: the homepage repainted every ten seconds */
for (let i = 0; i < 3 * 360; i++) { M.clock(10000); M.betsNearWant(); }
await tick();
ok('three hours of repaints during a game: no further read', M.reads(), 1);

head('arriving does, past ten minutes');
M.reset();
M.betsNearFresh(); M.answer([{ id: 'a' }]); await tick();
M.clock(9 * MIN); M.betsNearFresh();
ok('back inside ten minutes: the copy in hand', M.reads(), 1);
M.clock(2 * MIN); M.betsNearFresh();
ok('past ten: asked again', M.reads(), 2);
M.answer([{ id: 'a' }, { id: 'c' }]); await tick();
ok('and the new copy is the one drawn', M.betsNear().map(b => b.id), ['a', 'c']);

head('a write of our own');
M.clock(20000);
M.betsAllDrop();
ok('the stored copy goes, the one on screen stays', [M.store('gfl:betsNear:2026-10-06'), M.betsNear().length], [undefined, 2]);
M.betsNearWant();
ok('and the next draw asks, inside the minute', M.reads(), 3);
M.answer([{ id: 'a' }, { id: 'c' }, { id: 'mine' }]); await tick();
M.betsNearWant();
ok('once', M.reads(), 3);

head('failures');
M.reset();
M.failNext(); M.betsNearWant(); await tick();
ok('a failed read leaves nothing in hand', [M.reads(), M.betsNear()], [1, null]);
M.clock(30000); M.betsNearWant(); M.betsNearFresh();
ok('and is not tried again inside a minute', M.reads(), 1);
M.clock(31000); M.betsNearWant();
ok('after one, it is', M.reads(), 2);
M.reset(); M.setQuota(true);
M.betsNearWant(); M.betsNearFresh();
ok('over quota: nothing asked at all', M.reads(), 0);

head('a reload');
M.reset();
M.store('gfl:betsNear:2026-10-06', JSON.stringify({ t: Date.now() - 4 * MIN, rows: [{ id: 'kept' }] }));
M.betsNearWant();
ok('inside ten minutes: painted from the stored copy, nothing read', [M.reads(), M.betsNear().map(b => b.id)], [0, ['kept']]);
M.reset();
M.store('gfl:betsNear:2026-10-06', JSON.stringify({ t: Date.now() - 11 * MIN, rows: [{ id: 'old' }] }));
M.betsNearWant();
ok('older than that: read again', M.reads(), 1);

head('which copy');
M.reset();
M.betsNearWant(); M.answer([{ id: 'near' }]); await tick();
M.setAll([{ id: 'season1' }, { id: 'season2' }], Date.now() + 1000);
ok('a newer season copy answers', M.betsNear().length, 2);
M.setAll([{ id: 'season1' }], Date.now() - 5 * MIN);
ok('an older one does not', M.betsNear().map(b => b.id), ['near']);

console.log(NL + (fail ? 'FAILED  ' : 'ok  ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
