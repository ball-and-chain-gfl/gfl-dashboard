/* THE WEEK'S LAST READING IS THE RESULT.
 *
 * Week 4, BFT against Florida Man. At 10:25 on the Monday night BFT led
 * 129.24 to 128.58 with a fifth of a point left between them. At 10:30 a
 * reading went in that said 122.86 to 127.28 with nothing left -- the scores
 * from 9:50, word for word, ESPN's 96% included, laid over a scoreboard that
 * was by then final -- and the curve finished with BFT on nought in a game BFT
 * won. Every matchup's last reading that night was the same stale copy.
 *
 * Three things hold that shut:
 *
 *   FRESH ONLY  neither recorder writes a reading from anything but a live
 *               response that came back that poll, and the proxy never hands
 *               a live request an old copy
 *   THE SEAL    once the week's last game is final, one more reading is taken
 *               from fresh scores -- nothing left, the result as 1 or 0 -- and
 *               nothing is written to the week after it
 *   OFFICIAL    when ESPN closes the week, the archiver ends every matchup on
 *               the official totals, stat corrections included
 *
 * The rows below are the real week 4 rows, first owner Florida Man.
 *
 * Run: node scripts/test-livefinal.mjs
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
const M = assemble(grab, [
  'const SCHED_SD=', 'const liveMKey=',
  'function schedNormCdf(z){', 'const wpSd=',
  'function wpAt(a,b,projA,projB,f,mu0,lA,lB){',
  'function wpSlateProgress(series,projByOwner){',
  'function liveFinalRow(t,a,b){', 'const liveRowFinal=', 'function liveSeal(arr,row){',
  'const liveSlateOver=',
  'function wpCurve(series,projByOwner,ownerA,ownerB,mu0,projFull,decided){',
], ['wpCurve', 'liveMKey', 'liveFinalRow', 'liveRowFinal', 'liveSeal', 'liveSlateOver']);

const FMAN = '{A-FMAN}', BFT = '{B-BFT}';   // ids that sort the way the real two do
const K = M.liveMKey(FMAN, BFT);
const first = [FMAN, BFT].sort()[0];
ok('the fixture keys Florida Man first, the way the real document does', first, FMAN);
/* the last six real readings: [minute, FMAN, BFT, ESPN p(FMAN), left FMAN, left BFT, old FMAN, old BFT] */
const real = () => [
  [29854265, 128.58, 123.4, 0.99, 3.14, 2.92, 3.03, 2.63],
  [29854270, 128.58, 123.4, 0.99, 2.48, 2.3, 2.45, 2.13],
  [29854275, 128.58, 123.56, 0.99, 1.07, 1.03, 1.11, 0.97],
  [29854280, 128.58, 124.92, 0.99, 0.67, 0.7, 0.72, 0.62],
  [29854285, 128.58, 129.24, 0.01, 0.21, 0.22, 0.23, 0.2],
  [29854290, 127.28, 122.86, 0.96, 0, 0, 0, 0],          // 9:50's scores, stamped 10:30
];
const PROJ = { [FMAN]: 126, [BFT]: 135 };
const lastP = (series, owner, decided) => {
  const pts = M.wpCurve(series, PROJ, owner, owner === BFT ? FMAN : BFT, null, null, decided);
  return pts[pts.length - 1].p;
};

head('what the stale reading did');
ok('read as it was stored, the week ends with BFT beaten', lastP({ [K]: real() }, BFT, true), 0);

head('the result row');
ok('a win for the side listed first', M.liveFinalRow(9, 128.58, 129.24), [9, 128.58, 129.24, 0, 0, 0, 0, 0]);
ok('a win for the other side', M.liveFinalRow(9, 130, 120)[3], 1);
ok('a tie is an even half', M.liveFinalRow(9, 120, 120)[3], 0.5);

head('a sealed row cannot be mistaken for a reading');
ok('the result is recognised', M.liveRowFinal(M.liveFinalRow(9, 1, 2)), true);
/* liveWpOf stores a finished game's probability as null, never 0 or 1 */
ok('an ordinary last reading with nothing left is not', M.liveRowFinal([9, 128, 129, null, 0, 0, 0, 0]), false);
ok('nor is one ESPN priced at 0.99', M.liveRowFinal([9, 128, 129, 0.99, 0, 0, 0, 0]), false);
ok('nor one with points still to come', M.liveRowFinal([9, 128, 129, 1, 0.2, 0, 0, 0]), false);
ok('nor an old three-number reading', M.liveRowFinal([9, 128, 129]), false);

head('sealing week 4 with the real final scores');
{
  const arr = real();
  M.liveSeal(arr, M.liveFinalRow(29854290, 128.58, 129.24));
  ok('the stale 10:30 reading is replaced, not followed', arr.length, 6);
  ok('by the result', arr[5], [29854290, 128.58, 129.24, 0, 0, 0, 0, 0]);
  ok('everything before it is untouched', arr[4], real()[4]);
  ok('BFT ends on 100%', lastP({ [K]: arr }, BFT, true), 1);
  ok('Florida Man on 0%', lastP({ [K]: arr }, FMAN, true), 0);
  /* the curve lands on a seal even where this browser has no scoreboard
     digest to say the week is over */
  ok('and it lands there without being told the week is over', lastP({ [K]: arr }, BFT, false), 1);
  ok('an unsealed curve still waits to be told', lastP({ [K]: real().slice(0, 5) }, BFT, false) < 1, true);
}

head('a seal taken in a later bucket drops nothing that came before it');
{
  const arr = real().slice(0, 5);
  M.liveSeal(arr, M.liveFinalRow(29854295, 128.58, 129.24));
  ok('it goes on the end', [arr.length, arr[5][0]], [6, 29854295]);
}
head('and anything recorded after the seal\'s minute is gone');
{
  const arr = real();
  M.liveSeal(arr, M.liveFinalRow(29854285, 128.58, 129.24));
  ok('the 10:30 row cannot outlive a 10:25 result', [arr.length, arr[arr.length - 1][0]], [5, 29854285]);
}

head('when the slate is over');
ok('every game post', M.liveSlateOver({ games: [{ s: 'post' }, { s: 'post' }] }), true);
ok('Monday night still on', M.liveSlateOver({ games: [{ s: 'post' }, { s: 'in' }] }), false);
ok('Monday night still to come', M.liveSlateOver({ games: [{ s: 'post' }, { s: 'pre' }] }), false);
ok('no digest is not over', M.liveSlateOver(null), false);
ok('an empty digest is not over', M.liveSlateOver({ games: [] }), false);

head('a tab does not forget the seal it just took');
{
  /* liveFlush reads the document back just before it writes. Week 4 was
     sealed at 10:55 by a tab that then read "no seal" off a document it had
     not written to yet, forgot its own, and saved the result without the
     marker -- so it would have sealed the week afresh on every poll after. */
  const L = assemble(grab, ['async function liveLoadSeries(key){'], ['liveLoadSeries', 'finalOf', 'setDoc'], [
    'let _liveFinalOf={}, _liveProj={}, _doc={};',
    'const finalOf=k=>_liveFinalOf[k]; const setDoc=d=>{_doc=d;};',
    'const liveDocUrl=k=>k; const fsIn=j=>j;',
    'const fetch=async()=>({status:200, ok:true, json:async()=>_doc});',
  ].join(NL));
  const k = '2026-w4';
  L.setDoc({ series: '{}' });                       // the document, not sealed yet
  await L.liveLoadSeries(k);
  ok('nothing sealed anywhere: nothing sealed', L.finalOf(k) || 0, 0);
  /* this tab seals at 10:55 ... */
  const before = 29854315;
  /* (the poll sets it directly; the lifted copy shares nothing else) */
  const L2 = assemble(grab, ['async function liveLoadSeries(key){'], ['liveLoadSeries', 'finalOf', 'seal', 'setDoc'], [
    'let _liveFinalOf={}, _liveProj={}, _doc={};',
    'const finalOf=k=>_liveFinalOf[k]; const seal=(k,t)=>{_liveFinalOf[k]=t;}; const setDoc=d=>{_doc=d;};',
    'const liveDocUrl=k=>k; const fsIn=j=>j;',
    'const fetch=async()=>({status:200, ok:true, json:async()=>_doc});',
  ].join(NL));
  L2.seal(k, before);
  L2.setDoc({ series: '{}' });                      // ... and reads back a document with no marker
  await L2.liveLoadSeries(k);
  ok('its own seal survives reading back an unsealed document', L2.finalOf(k), before);
  L2.setDoc({ series: '{}', final: '29854290' });   // somebody else sealed it first
  await L2.liveLoadSeries(k);
  ok('a seal already on the document wins', L2.finalOf(k), 29854290);
}

head('the writers');
{
  const APP = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  const POLL = fs.readFileSync(new URL('./poll-live.mjs', import.meta.url), 'utf8');
  const API = fs.readFileSync(new URL('../api/espn.js', import.meta.url), 'utf8');
  const ARCH = fs.readFileSync(new URL('./archive-week.mjs', import.meta.url), 'utf8');
  ok('the browser marks a live read that actually came back',
    APP.includes('if(fresh.length){ games=fresh; gotLive=true; }'), true);
  ok('and records nothing without one',
    APP.includes('if(gotLive&&!over&&!sealed) games.forEach(m=>{'), true);
  ok('it seals from fresh scores once the week is over',
    APP.includes('if(gotLive&&over&&!sealed){'), true);
  ok('and sends the result at once rather than on the three minute throttle',
    APP.includes('_liveSaved=0;'), true);
  ok('a tab that missed the seal cannot write past it',
    APP.includes('while(a.length&&a[a.length-1][0]>sealedAt) a.pop();'), true);
  ok('the poller no longer falls back to a different, cached request',
    !POLL.includes('(fresh && fresh.schedule) || meta.schedule'), true);
  ok('it skips the minute instead', POLL.includes("live scores unavailable — skipping"), true);
  ok('it seals the week on the first look after the last whistle',
    POLL.includes('app.liveSeal(series[k] || (series[k] = []), app.liveFinalRow(t, a, b));'), true);
  ok('and writes nothing to a sealed week', POLL.includes("is sealed — nothing to record"), true);
  ok('a live request is never served old by the proxy',
    API.includes("'s-maxage=10, stale-while-revalidate=20'"), true);
  ok('everything else keeps its cache', API.includes(": 's-maxage=60, stale-while-revalidate');"), true);
  ok('the archive ends on ESPN\'s official result',
    ARCH.includes('live.liveSeal(arr, live.liveFinalRow(t, ab[0], ab[1]));'), true);
}

console.log(NL + (fail ? 'FAILED  ' : 'ok  ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
