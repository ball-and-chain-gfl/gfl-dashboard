/* TEAM LOGOS, FROM A CACHE THAT OUTLIVES EVERY DEPLOY.
 *
 *   FIRST TIME          from the network, and kept
 *   EVERY TIME AFTER    from the cache, no network at all -- until it is a
 *                       week old, when it is still served from the cache and
 *                       refreshed behind the scenes
 *   ONLY REAL IMAGES    a 502 or a page of HTML is passed on, never kept
 *   OFFLINE             a miss with no network is an error, which the page
 *                       answers with the team's initials
 *   HELD TO A SIZE      headshots come through the same proxy, so only the
 *                       newest LOGO_MAX are kept
 *   AND THE PAGE        crests drawn eagerly; headshots still lazy
 *
 * Run: node scripts/test-logocache.mjs
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
const grab = lifter(new URL('../public/sw.js', import.meta.url));

const DAY = 86400000, T0 = Date.UTC(2026, 9, 9, 6);
const M = assemble(grab, ['const LOGO_CACHE =', 'const LOGO_FRESH_MS =', 'const LOGO_MAX =', 'async function logoRespond('],
  ['logoRespond', 'LOGO_CACHE', 'LOGO_MAX', 'clock', 'net', 'reply', 'stored'], [
  `let _now=${T0}; const clock=ms=>{ _now+=ms; }; Date.now=()=>_now;`,
  /* Cache Storage, as a map that keeps insertion order like the real one */
  'const _store=new Map(); const stored=()=>[..._store.keys()];',
  'const caches={ open: async()=>({',
  '  match: async r=>{ const v=_store.get(r.url||r); return v?v.clone():undefined; },',
  '  put: async(r,res)=>{ _store.delete(r.url||r); _store.set(r.url||r,res); },',
  '  keys: async()=>[..._store.keys()],',
  '  delete: async k=>_store.delete(k) }) };',
  /* the network */
  'let _net=0, _reply=null; const net=()=>_net; const reply=f=>{ _reply=f; };',
  'const fetch=async r=>{ _net++; return _reply(r); };',
].join(NL));
const img = (body = 'png', date = new Date(Date.now()).toUTCString()) =>
  new Response(body, { status: 200, headers: { 'Content-Type': 'image/png', Date: date } });
const req = u => ({ url: 'https://gfl-dashboard.vercel.app/api/espn?type=logo&url=' + u });
const ev = () => { const w = []; return { waitUntil: p => w.push(p), done: () => Promise.all(w) }; };

head('first time and every time after');
let now = T0;
M.reply(() => img('crest-v1', new Date(now).toUTCString()));
let e = ev();
let r = await M.logoRespond(e, req('a'));
ok('a miss comes from the network and is kept', [M.net(), await r.text(), M.stored().length], [1, 'crest-v1', 1]);
for (let i = 0; i < 5; i++) { M.clock(DAY); r = await M.logoRespond(ev(), req('a')); }
ok('five days of opening the app: from the cache, no network', [M.net(), await r.text()], [1, 'crest-v1']);

head('a week old');
M.clock(3 * DAY);
M.reply(() => img('crest-v2', new Date(T0 + 8 * DAY).toUTCString()));
e = ev();
r = await M.logoRespond(e, req('a'));
ok('still served at once from the cache', await r.text(), 'crest-v1');
await e.done();
ok('and refreshed behind the scenes', [M.net(), await (await M.logoRespond(ev(), req('a'))).text()], [2, 'crest-v2']);

head('only real images are kept');
M.reply(() => new Response('{"error":"upstream 502"}', { status: 502, headers: { 'Content-Type': 'application/json' } }));
r = await M.logoRespond(ev(), req('down'));
ok('a 502 is passed on to the page', r.status, 502);
ok('and not kept', M.stored().includes(req('down').url), false);
M.reply(() => new Response('<html>', { status: 200, headers: { 'Content-Type': 'text/html' } }));
await M.logoRespond(ev(), req('html'));
ok('nor is a page that is not an image', M.stored().includes(req('html').url), false);

head('offline');
M.reply(() => { throw new TypeError('Failed to fetch'); });
r = await M.logoRespond(ev(), req('never-seen'));
ok('a miss with no network is an error -- the initials show', r.type, 'error');
ok('a crest already kept still shows', await (await M.logoRespond(ev(), req('a'))).text(), 'crest-v2');

head('held to a size');
M.reply(() => img());
for (let i = 0; i < M.LOGO_MAX + 5; i++) await M.logoRespond(ev(), req('h' + i));
const kept = M.stored();
ok('only the newest LOGO_MAX are kept', [kept.length, kept.includes(req('a').url), kept.includes(req('h' + (M.LOGO_MAX + 4)).url)],
  [M.LOGO_MAX, false, true]);
ok('in a cache of its own, not the versioned one', M.LOGO_CACHE, 'gfl-logo-v1');

head('the worker routes logos to it, and keeps it through a deploy');
const sw = fs.readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
const route = sw.indexOf("url.searchParams.get('type') === 'logo'"), apiOut = sw.indexOf("if (url.pathname.startsWith('/api/')) return;");
ok('the logo branch comes before the rule that sends /api/ to the network', route > 0 && route < apiOut, true);
ok('activate deletes every old cache but this one', /k !== LOGO_CACHE/.test(sw), true);

head('the page');
const app = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const pgrab = lifter(new URL('../public/app.js', import.meta.url));
ok('crests are drawn eagerly', /loading="lazy"/.test(pgrab('function avatarCore(name,id,url,size,radius){')), false);
ok('headshots stay lazy', /loading="lazy"/.test(app.slice(app.indexOf('proxyLogo(headshotURL(pid,size))'), app.indexOf('proxyLogo(headshotURL(pid,size))') + 1500)), true);
const W = assemble(pgrab, ['const _logoWarm=', 'function logoWarm('], ['logoWarm', 'made'], [
  'const made=[]; class Image{ set src(u){ made.push(u); } }',
].join(NL));
W.logoWarm(['/a', '/b', null, '/a']); W.logoWarm(['/b', '/c']);
ok('every crest is fetched ahead, once', W.made, ['/a', '/b', '/c']);

console.log(NL + (fail ? 'FAILED  ' : 'ok  ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
