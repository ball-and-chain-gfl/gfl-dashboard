/* PLAYER DATA: THE SEASON BEING PLAYED STAYS CURRENT.
 *
 *   ONE CAREER          every season's roster weeks, starts and points folded
 *                       into one record per player
 *   ASKED FOR AGAIN     the current season is fetched again, past its five
 *                       minutes, when the tab is opened -- not once a page load
 *                       and kept for as long as the app stays open
 *   ONLY THAT SEASON    archived seasons are never asked for twice, and a failed
 *                       refresh keeps the copy it had
 *   FIFTY               the table is the top fifty, with no Show all under it
 *
 * Run: node scripts/test-tenure-live.mjs
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
  'const TENURE_LIVE_TTL=', 'let _tenureOwner=', 'let _tenureBySeason=', 'const tenureLiveSeason=',
  'async function tenureRefreshLive(', 'function tenureBuild(){',
], ['tenureBuild', 'tenureRefreshLive', 'set', 'get'], [
  "const ALL_SEASONS=[2025,2026]; const BASE='/api/espn';",
  "const _seasonMeta={2025:{owners:{1:'bft'}},2026:{owners:{1:'bft'}}};",
  "let _tenure=null, _tenurePoGP={}, _activeTab='tenure', _now=0, _reply=null, _asked=[], _painted=0;",
  "Date.now=()=>_now;",
  "const fetch=async(u,o)=>{ _asked.push([u,o&&o.cache]); if(_reply instanceof Error) throw _reply;",
  "  return {ok:!!_reply, json:async()=>_reply}; };",
  "const renderTenureTable=()=>{ _painted++; };",
  "const set=(k,v)=>{ if(k==='now') _now=v; if(k==='reply') _reply=v; if(k==='season') _tenureBySeason[v.s]=v.d;",
  "  if(k==='at') _tenureLiveAt=v; if(k==='tab') _activeTab=v; };",
  "const get=()=>({tenure:_tenure, asked:_asked.slice(), painted:_painted});",
].join(NL));

const season = (w, s) => ({ teams: { 1: { 900: { n: 'Trey McBride', pos: 4, w, s, p: w * 12, sp: s * 12, pw: 0, pg: 0 } } }, poGP: {} });

head('one career');
M.set('season', { s: 2025, d: season(17, 16) });
M.set('season', { s: 2026, d: season(4, 4) });
M.tenureBuild();
const mc = () => M.get().tenure.bft[900];
ok('every season added into one record', [mc().wAll, mc().sAll], [21, 20]);
ok('and each season kept on it', Object.keys(mc().seasons), ['2025', '2026']);

head('asked for again');
M.set('at', 0); M.set('now', 60 * 1000);
await M.tenureRefreshLive();
ok('inside five minutes, nothing is asked for', M.get().asked.length, 0);
M.set('now', 6 * 60 * 1000); M.set('reply', season(5, 5));
await M.tenureRefreshLive();
const a = M.get().asked;
ok('past five, the current season is asked for again, past the browser cache',
  [a.length, a[0][0].includes('seasonId=2026'), a[0][1]], [1, true, 'no-store']);
ok('and the new week is in the career', [mc().wAll, mc().seasons['2026'].w], [22, 5]);
ok('and the table repainted', M.get().painted, 1);
await M.tenureRefreshLive();
ok('and not asked for again straight after', M.get().asked.length, 1);

head('only that season');
ok('the archived season was never asked for', M.get().asked.every(([u]) => !u.includes('seasonId=2025')), true);
M.set('now', 20 * 60 * 1000); M.set('reply', new Error('offline'));
await M.tenureRefreshLive();
ok('a failed refresh keeps the copy it had', mc().seasons['2026'].w, 5);
M.set('now', 40 * 60 * 1000); M.set('reply', { teams: {} });
await M.tenureRefreshLive();
ok('and so does an empty one', mc().seasons['2026'].w, 5);

head('fifty');
const SRC = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
ok('no Show all, and nothing left to call it', [/tenureShowAll/.test(SRC), /_tenureAll/.test(SRC)], [false, false]);
ok('the table is the top fifty', /const shown=players\.slice\(0,50\);/.test(SRC), true);

console.log(NL + (fail ? 'FAILED  ' : 'ok  ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
