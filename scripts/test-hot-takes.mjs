/* HOT TAKES: which week a take is filed under, the order its id sorts in, and
 * who may delete one.
 *
 * The week is Tuesday 06:00 Central, whatever clock the phone is on, so the
 * page and scripts/wipe-takes.mjs agree about when last week's takes go. It is
 * checked here either side of the turn, and across both changes of the clocks.
 *
 * Run: node scripts/test-hot-takes.mjs
 */
import fs from 'fs';
import { lifter, assemble } from './lib/lift.mjs';

const read = p => fs.readFileSync(new URL(p, import.meta.url), 'utf8').split(String.fromCharCode(13)).join('');
const APP = read('../public/app.js');
const WIPE = read('./wipe-takes.mjs');
const ROLL = read('../.github/workflows/rollover.yml');

const grab = lifter(new URL('../public/app.js', import.meta.url));
/* A fetch that holds every request until the test answers it, so a save can be
 * caught in the air and taps made while it is out. */
const M = assemble(grab, [
  'const TAKES_ADMIN=', 'const TAKES_TZ=', 'function takesWeekKey(', 'const takesDocId=', 'const takesIsAdmin=',
  'const takesEsc=', 'const takesDocsUrl=', 'const msgKey=', 'const fsOut=',
  'const TAKES_ID_RE=', 'const TAKES_RX=', 'const TAKES_RX_KEYS=', 'const takesRxField=', 'function takesRxOf(',
  'function takesRxCounts(', 'function takesRxName(', 'function takesRxHTML(', 'function takesCardPaint(',
  'function takesReact(', 'async function takesRxSend(',
], ['takesWeekKey', 'takesDocId', 'takesIsAdmin', 'takesEsc', 'setMe',
  'TAKES_ID_RE', 'TAKES_RX', 'takesRxField', 'takesRxOf', 'takesRxCounts', 'takesRxHTML', 'takesReact',
  'calls', 'answer', 'set', 'get'], [
  'let _me=null; const setMe=v=>{_me=v;};',
  "const GFL_DB={project:'p',key:'k'}; const TEST_PROFILE='test';",
  "let _teams=[], _takes=[], _activeTab='', _takesErr='', _repaints=0;",
  'let _takesRxOpen=null; const _takesRxPending=new Map(), _takesRxFlight=new Set();',
  "const accountIds=()=>new Set(['bft','kunk','mcm','big-dogs','test']);",
  'const teamAcctId=t=>t.acct;',
  "const teamInitials=n=>String(n||'').split(' ').map(w=>w[0]||'').join('').toUpperCase();",
  'const document={getElementById:()=>null};',
  'const renderTakes=()=>{ _repaints++; };',
  'const calls=[], answers=[];',
  'const fetch=(url,init)=>{ calls.push({url,method:init.method,body:JSON.parse(init.body)}); return new Promise(res=>answers.push(res)); };',
  'const answer=status=>{ answers.shift()({ok:status>=200&&status<300,status}); return new Promise(r=>setTimeout(r,0)); };',
  "const set=o=>{ if('takes' in o) _takes=o.takes; if('teams' in o) _teams=o.teams; if('tab' in o) _activeTab=o.tab;",
  "  if('err' in o) _takesErr=o.err; if('open' in o) _takesRxOpen=o.open; };",
  'const get=()=>({takes:_takes, err:_takesErr, pending:[..._takesRxPending], flight:[..._takesRxFlight], repaints:_repaints});',
].join(String.fromCharCode(10)));

let pass = 0, fail = 0;
const ok = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; return; }
  fail++;
  console.log('  FAIL  ' + name + '\n          got  ' + g + '\n          want ' + w);
};
const head = t => console.log('\n' + t);
const at = iso => M.takesWeekKey(new Date(iso));

head('the week turns at Tuesday 06:00 Central');
ok('Tuesday 05:59 CST is still last week', at('2026-11-10T11:59:00Z'), '2026-11-03');
ok('Tuesday 06:00 CST is the new week', at('2026-11-10T12:00:00Z'), '2026-11-10');
ok('Monday night is last week', at('2026-11-10T04:30:00Z'), '2026-11-03');
ok('Wednesday is the week that opened Tuesday', at('2026-11-11T18:00:00Z'), '2026-11-10');
ok('Sunday afternoon too', at('2026-11-15T20:00:00Z'), '2026-11-10');
ok('and the week runs right up to the next turn', at('2026-11-17T11:59:00Z'), '2026-11-10');

head('across the clock changes');
ok('the Tuesday after clocks go back, 05:30 CST', at('2026-11-03T11:30:00Z'), '2026-10-27');
ok('and 06:00 CST', at('2026-11-03T12:00:00Z'), '2026-11-03');
ok('the Tuesday after clocks go forward, 05:59 CDT', at('2026-03-10T10:59:00Z'), '2026-03-03');
ok('and 06:00 CDT', at('2026-03-10T11:00:00Z'), '2026-03-10');
ok('a turn of the year', at('2026-12-31T12:00:00Z'), '2026-12-29');

head('the newest take sorts first');
const a = M.takesDocId(1793000000000), b = M.takesDocId(1793000060000);
ok('a later take has the smaller id', b < a, true);
ok('every id is the same length', [a.length, b.length], [22, 22]);
ok('ids are plain characters', /^[a-z0-9]+$/.test(a + b), true);

head('only the admin deletes');
M.setMe(null); ok('signed out', M.takesIsAdmin(), false);
M.setMe({ k1: 'bft', teamId: '10' }); ok('bft', M.takesIsAdmin(), true);
M.setMe({ k1: 'kunk', teamId: '7' }); ok('any other manager', M.takesIsAdmin(), false);
M.setMe({ k1: 'test', teamId: '' }); ok('the test account', M.takesIsAdmin(), false);
ok('the delete refuses anyone but the admin', APP.includes('async function takesDel(id){\n  if(!takesIsAdmin()) return;'), true);
ok('and the page only draws the button for the admin', APP.includes('const del=takesIsAdmin()'), true);

head('what a take carries');
ok('an anonymous take stores no account and no team',
  APP.includes("const doc={wk:takesWeekKey(new Date(ts)),ts,text,anon:_takesAnon?'1':'0'};")
  && APP.includes("if(!_takesAnon){ doc.owner=_me.k1; doc.teamId=String(_me.teamId||''); }"), true);
ok('the words are escaped on the way to the page', M.takesEsc('<img src=x onerror=alert(1)>"&'),
  '&lt;img src=x onerror=alert(1)&gt;&quot;&amp;');
ok('the feed asks for this week only, capped, with no ordering to index',
  APP.includes("where:fsEq('wk',wk),limit:TAKES_LIMIT}"), true);

head('the Tuesday wipe');
ok('it lifts the page\'s own week rule', WIPE.includes("'function takesWeekKey('"), true);
ok('it leaves this week\'s and anything without a week alone', WIPE.includes('if (!wk || wk === thisWeek) continue;'), true);
ok('the rollover runs it, and a failure there does not stop the rollover',
  /- name: Wipe last week's Hot Takes\s+continue-on-error: true\s+run: node scripts\/wipe-takes\.mjs/.test(ROLL), true);

head('only the page\'s own takes are shown');
ok('an id the page makes passes', M.TAKES_ID_RE.test(M.takesDocId(1793000000000)), true);
ok('one written by hand with a quote in it, to break out of an onclick, does not',
  M.TAKES_ID_RE.test("tk1');alert(1);('"), false);
ok('and the feed drops anything that fails it', APP.includes('.filter(t=>t.text&&TAKES_ID_RE.test(t.id))'), true);

head('reactions: the faces');
ok('the five asked for, then five more', M.TAKES_RX.map(r => r[0]),
  ['up', 'down', 'haha', 'fire', 'poop', 'cap', 'clown', 'dead', 'salty', 'goat']);
ok('each one a single emoji', M.TAKES_RX.every(r => /^\p{Extended_Pictographic}$/u.test(r[1])), true);
ok('and each with a name to read out', M.TAKES_RX.every(r => r[2] && r[2].length > 1), true);

head('reactions: what counts');
const T = [{ id: 10, abbrev: 'BFT', acct: 'bft' }, { id: 7, abbrev: 'KUNK', acct: 'kunk' },
  { id: 2, abbrev: 'MCM', acct: 'mcm' }, { id: 3, name: 'Big Dogs', acct: 'big-dogs' }];
M.set({ teams: T });
ok('an account with a hyphen makes a field name and comes back the same',
  [M.takesRxField('big-dogs'), M.takesRxOf({ rx_big_dogs: 'fire' })], ['rx_big_dogs', { 'big-dogs': 'fire' }]);
ok('only the palette\'s own keys are read, so an odd value draws nothing',
  M.takesRxOf({ id: 'tk1', rx_bft: 'fire', rx_kunk: '<img src=x>', rx_mcm: '', fire: 'fire' }), { bft: 'fire' });
M.setMe(null);
const crowd = { id: 'tk9', rx_kunk: 'fire', rx_bft: 'fire', rx_test: 'poop', rx_zz9: 'fire', rx_mcm: 'haha' };
ok('league accounts count; the test account and a stranger in the database do not',
  M.takesRxCounts(crowd), { fire: ['kunk', 'bft'], haha: ['mcm'] });
M.setMe({ k1: 'test', teamId: '' });
ok('the test account sees its own, and nobody else does', M.takesRxCounts(crowd).poop, ['test']);

head('reactions: the chips and the picker');
M.setMe({ k1: 'bft', teamId: '10' }); M.set({ open: null });
let h = M.takesRxHTML(crowd);
ok('a chip for each face in use, in the picker\'s order', (h.match(/class="ht-rx-chip[^"]*"/g) || []).length, 2);
ok('haha before fire, as the picker has them', h.indexOf('Haha') < h.indexOf('Fire'), true);
ok('yours is lit, with how many and who', [/class="ht-rx-chip on"[^>]*title="KUNK, BFT"/.test(h), h.includes('aria-label="Fire 2: KUNK, BFT"')], [true, true]);
ok('a chip is a button that sets or takes back that face', h.includes("onclick=\"takesReact('tk9','fire')\""), true);
ok('no picker until it is asked for', h.includes('ht-rx-pal'), false);
M.set({ open: 'tk9' }); h = M.takesRxHTML(crowd);
ok('then all ten, yours marked', [(h.match(/class="ht-rx-pick/g) || []).length, (h.match(/ht-rx-pick on/g) || []).length], [10, 1]);
M.setMe(null); M.set({ open: 'tk9' }); h = M.takesRxHTML(crowd);
ok('signed out: the counts show, nothing to tap, no picker', [/<button/.test(h), (h.match(/<span class="ht-rx-chip"/g) || []).length, h.includes('ht-rx-pal')], [false, 2, false]);

head('reactions: saving');
M.setMe({ k1: 'bft', teamId: '10' }); M.set({ open: null, tab: 'takes', err: '' });
const take = { id: 'tk1', text: 'a', rx_kunk: 'fire' };
M.set({ takes: [take] });
M.takesReact('tk1', 'fire');
ok('a tap shows at once, before the save lands', M.takesRxOf(M.get().takes[0]).bft, 'fire');
let c = M.calls[M.calls.length - 1];
ok('one patch, of your own field only, on a take that must still exist',
  [c.method, c.url.split('?')[0].endsWith('/documents/messages/tk1'),
    c.url.includes('currentDocument.exists=true'), c.url.includes('updateMask.fieldPaths=rx_bft'), c.body],
  ['PATCH', true, true, true, { fields: { rx_bft: { stringValue: 'fire' } } }]);
await M.answer(200);
ok('saved: on the take, nothing left waiting', [take.rx_bft, M.get().pending, M.get().flight], ['fire', [], []]);
M.takesReact('tk1', 'fire');
c = M.calls[M.calls.length - 1];
ok('the same face again takes it back: the field named, with nothing in it',
  [c.url.includes('updateMask.fieldPaths=rx_bft'), c.body], [true, { fields: {} }]);
await M.answer(200);
ok('and it is gone from the take', 'rx_bft' in take, false);
const before = M.calls.length;
M.takesReact('tk1', 'haha'); M.takesReact('tk1', 'poop'); M.takesReact('tk1', 'dead');
ok('taps while a save is out wait for it', M.calls.length - before, 1);
await M.answer(200);
ok('then only the last goes, as one more save', [M.calls.length - before, M.calls[M.calls.length - 1].body],
  [2, { fields: { rx_bft: { stringValue: 'dead' } } }]);
await M.answer(200);
ok('and the take ends on the last face tapped', [take.rx_bft, M.get().pending], ['dead', []]);
const gone = { id: 'tk2', text: 'b' };
M.set({ takes: [take, gone] });
M.takesReact('tk2', 'up'); await M.answer(404);
ok('a take the admin deleted leaves the feed and says so, and nothing is created',
  [M.get().takes.map(t => t.id), M.get().err], [['tk1'], 'That take has been deleted.']);
M.takesReact('tk1', 'goat'); await M.answer(500);
ok('a save that fails puts your face back and says so', [M.takesRxOf(take).bft, M.get().err],
  ['dead', 'That reaction did not save. Try again.']);
const quiet = M.calls.length;
M.takesReact('tk1', '<script>');
M.setMe(null); M.takesReact('tk1', 'fire');
ok('a face not on the palette, or nobody signed in, sends nothing', M.calls.length - quiet, 0);
ok('a reaction never reloads the feed: one write a tap and no reads',
  grab('function takesReact(').includes('takesLoad') || grab('async function takesRxSend(').includes('takesLoad'), false);

console.log('\n' + (fail ? 'FAILED  ' : 'ok  ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
