/* AN ACTION IN THE FORECAST CARD HAS TO REPAINT THE FORECAST CARD.
 *
 * Sending a message stopped working on the homepage, and the reason is the
 * shape of bug this suite exists to catch. ttSend repainted by calling
 * renderWeek, because the card used to live on the Schedule tab and renderWeek
 * drew it. When the card moved to the homepage, renderWeek became
 * renderSchedule -- and ttSend went on calling it, repainting a tab nobody was
 * looking at. The message sent every time. The box just never said so, which
 * from the outside is indistinguishable from it not sending.
 *
 * So the rule under test is: every step of ttSend repaints through fcRepaint,
 * which names the CARD rather than a tab, and renderWeek is never involved.
 *
 * Run: node scripts/test-ttsend.mjs
 */
import fs from 'fs';
import { lifter, assemble } from './lib/lift.mjs';

const grab = lifter(new URL('../public/app.js', import.meta.url));

const PRELUDE = [
  'let _me={k1:"mine"};',
  'let _ttOutBusy=false,_ttErr="",_ttPending=false;',
  'let paints=0, weekPaints=0, sent=[], nextResult={ok:true};',
  'const keySlug=s=>String(s).toLowerCase().replace(/[^a-z0-9]+/g,"-");',
  'const fcRepaint=()=>{paints++;};',
  'const renderWeek=()=>{weekPaints++;};',
  'const gflPatchProfile=async(k,f)=>{sent.push({k,f});return nextResult;};',
  'let boxValue="";',
  'const document={getElementById:id=>id==="tt-text"?{value:boxValue}:null};',
  'const reset=v=>{paints=0;weekPaints=0;sent=[];_ttErr="";_ttOutBusy=false;'
    + '_ttPending=false;boxValue=v==null?"":v;nextResult={ok:true};};',
  'const state=()=>({paints,weekPaints,sent,err:_ttErr,busy:_ttOutBusy,pending:_ttPending});',
  'const failWith=e=>{nextResult={ok:false,error:e};};',
].join(String.fromCharCode(10));

const M = assemble(grab, ['const ttField=', 'async function ttSend(oppK1){'],
  ['ttSend', 'ttField', 'reset', 'state', 'failWith'], PRELUDE);

let pass = 0, fail = 0;
const ok = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; return; }
  fail++;
  console.log('  FAIL  ' + name + '\n          got  ' + g + '\n          want ' + w);
};
const head = t => console.log('\n' + t);

head('a good message');
M.reset('Enjoy the bye week');
await M.ttSend('theirs');
let s = M.state();
ok('it sends exactly once', s.sent.length, 1);
ok('to the right manager', s.sent[0].k, 'theirs');
ok('under the sender\'s own field', Object.keys(s.sent[0].f), [M.ttField('mine')]);
ok('carrying the text', JSON.parse(s.sent[0].f[M.ttField('mine')]).t, 'Enjoy the bye week');
ok('and it repaints the CARD, twice — the busy state and the result',
  s.paints, 2);
ok('never through renderWeek', s.weekPaints, 0);
ok('the box is left knowing a message is waiting', s.pending, true);
ok('and not stuck busy', s.busy, false);
ok('with no error', s.err, '');

head('an empty message');
M.reset('   ');
await M.ttSend('theirs');
s = M.state();
ok('nothing is sent', s.sent.length, 0);
ok('it says so', s.err, 'Write something first.');
ok('and repaints so the words appear', s.paints, 1);
ok('never through renderWeek', s.weekPaints, 0);

head('the send fails');
M.reset('You are going down');
M.failWith('boom');
await M.ttSend('theirs');
s = M.state();
ok('it tried', s.sent.length, 1);
ok('it says it could not', s.err, 'Could not send that.');
ok('nothing is marked as waiting', s.pending, false);
ok('and it repainted both times', s.paints, 2);

head('over quota is its own message');
M.reset('One more thing');
M.failWith('quota');
await M.ttSend('theirs');
ok('the reason is named', M.state().err.indexOf('quota') >= 0, true);

head('a second tap while one is in flight');
M.reset('Twice');
const a = M.ttSend('theirs');
const b = M.ttSend('theirs');
await a; await b;
ok('sends once, not twice', M.state().sent.length, 1);

head('the text is trimmed and capped');
M.reset('  ' + 'x'.repeat(300) + '  ');
await M.ttSend('theirs');
ok('240 characters, no more',
  JSON.parse(M.state().sent[0].f[M.ttField('mine')]).t.length, 240);

/* ── the rule, at the source ──────────────────────────────────────────────── */
head('nothing in the card repaints by naming a tab');
const src = grab('async function ttSend(oppK1){') + grab('async function ttCheck(oppK1){');
ok('ttSend and ttCheck never call renderWeek', /renderWeek\s*\(/.test(src), false);
ok('they call fcRepaint', /fcRepaint\s*\(/.test(src), true);

head('every "it landed" callback reaches both screens');
/* The same bug in four other places: async data arriving repainted the Schedule
   tab and nothing else, so the card showed whatever it had when the page
   opened. They all go through repaintLive now. */
const live = grab('function repaintLive(){');
ok('repaintLive knows about the Schedule tab', /renderWeek/.test(live), true);
ok('and about the forecast card', /fcRepaint/.test(live), true);
const whole = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const strays = whole.split(String.fromCharCode(10))
  .map((l, i) => ({ l: l.trim(), n: i + 1 }))
  .filter(x => /_activeTab\s*===\s*'week'/.test(x.l) && /renderWeek\s*\(/.test(x.l))
  .filter(x => !/^if\(_activeTab==='week'\)\{ try\{ renderWeek/.test(x.l));
ok('no callback still repaints the week tab on its own',
  strays.map(x => x.n + ': ' + x.l), []);

console.log('\n' + (fail ? 'FAILED  ' : 'ok  ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
