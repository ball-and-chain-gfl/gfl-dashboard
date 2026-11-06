/* THE NEW VIDEO BAR: UP FOR THE WEEK A VIDEO IS NEWS, DOWN FROM THE RESET.
 *
 *   A VIDEO POSTED THIS WEEK    shows, and the newest one wins
 *   AT THE TUESDAY RESET        06:00 Central, it comes down until the next one
 *   THE WEEK IT WENT IN         2026-11-03 shows the newest whenever it was posted
 *   THE CAROUSEL                is off the homepage; the bar lives in the nav
 *
 * Run: node scripts/test-newvideo.mjs
 */
import fs from 'node:fs';
import { lifter, assemble } from './lib/lift.mjs';

const NL = String.fromCharCode(10);
let pass = 0, fail = 0;
const ok = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; console.log('  PASS  ' + name); return; }
  fail++;
  console.log('  FAIL  ' + name + NL + '          got  ' + g + NL + '          want ' + w);
};
const appUrl = new URL('../public/app.js', import.meta.url);
const grab = lifter(appUrl);
const M = assemble(grab, [
  'const TAKES_TZ=', 'function takesWeekKey(', 'const BK_TZ=', 'function bkChiParts(', 'function bkChiMs(',
  'const NV_ALWAYS_WEEK=', 'function nvVideo(',
], ['nvVideo', 'bkChiMs', 'set'], [
  'let _videos=[]; const set=v=>{ _videos=v; };',
].join(NL));

const CT = (y, m, d, h, mi = 0) => M.bkChiMs(y, m, d, h) + mi * 60000;
const vid = (id, title, iso) => ({ videoId: id, title, published: iso });
const v8 = vid('a', 'Ball and Chain 8 2026', '2026-11-01T02:02:56+00:00');
const v9 = vid('b', 'Ball and Chain 9 2026', '2026-11-08T03:00:00+00:00');
const v10 = vid('c', 'Ball and Chain 10 2026', '2026-11-14T03:00:00+00:00');

console.log(NL + 'the week the bar went in');
M.set([v8]);
ok('week 9: last week\'s video shows, so there is something in it', (M.nvVideo(CT(2026, 11, 5, 20)) || {}).title, 'Ball and Chain 8 2026');
M.set([v8, v9]);
ok('and a new one that week takes its place', (M.nvVideo(CT(2026, 11, 8, 12)) || {}).title, 'Ball and Chain 9 2026');
M.set([v9, v8]);
ok('newest by its date, whatever order the list is in', (M.nvVideo(CT(2026, 11, 8, 12)) || {}).title, 'Ball and Chain 9 2026');

console.log(NL + 'the reset');
ok('Monday night it is still up', (M.nvVideo(CT(2026, 11, 10, 5, 59)) || {}).title, 'Ball and Chain 9 2026');
ok('Tuesday at six it comes down', M.nvVideo(CT(2026, 11, 10, 6)), null);
ok('and stays down until the next one', M.nvVideo(CT(2026, 11, 12, 20)), null);
M.set([v10, v9, v8]);
ok('the next one is posted: up again with its title', (M.nvVideo(CT(2026, 11, 14, 9)) || {}).title, 'Ball and Chain 10 2026');
ok('nothing to show with no videos at all', (M.set([]), M.nvVideo(CT(2026, 11, 14, 9))), null);

console.log(NL + 'where it lives');
const src = fs.readFileSync(appUrl, 'utf8');
const html = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
ok('the carousel is off the homepage', /<div class="home-vid-col">/.test(src), false);
ok('the bar is inside the nav, so it moves with it',
  /<header id="floatnav">[\s\S]*?<div id="nv-bar" class="nv-bar" hidden><\/div>[\s\S]*?<\/header>/.test(html), true);
ok('and is drawn from the tab switch, the load and a new video',
  [/try\{ renderNewVideoBar\(\); \}catch\(e\)\{\}\s+\/\/ homepage only/.test(src),
   /_videos=list;\s+try\{ renderNewVideoBar\(\); \}catch\(e\)\{\}/.test(src)], [true, true]);

console.log(NL + `${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
