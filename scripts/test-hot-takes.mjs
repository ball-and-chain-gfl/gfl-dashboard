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

const M = assemble(lifter(new URL('../public/app.js', import.meta.url)), [
  'const TAKES_ADMIN=', 'const TAKES_TZ=', 'function takesWeekKey(', 'const takesDocId=', 'const takesIsAdmin=',
  'const takesEsc=',
], ['takesWeekKey', 'takesDocId', 'takesIsAdmin', 'takesEsc', 'setMe'], 'let _me=null; const setMe=v=>{_me=v;};');

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

console.log('\n' + (fail ? 'FAILED  ' : 'ok  ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
