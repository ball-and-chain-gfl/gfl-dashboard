/* THE FALLBACK THAT LOOKED HEALTHY WHILE DOING NOTHING.
 *
 * A video went up and the homepage kept showing the one before it. Three
 * separate faults, each of which alone would have hidden the others:
 *
 *   1. YouTube retired gridVideoRenderer for lockupViewModel. The channel-page
 *      parse matched nothing and returned null -- which to its caller is
 *      indistinguishable from YouTube refusing the request. So when the RSS
 *      feed 404'd, as it does from Vercel and increasingly from GitHub, there
 *      was no working route left and /api/espn?type=youtube quietly served the
 *      committed snapshot, three weeks old, reporting success the whole time.
 *
 *   2. Boot read ytFetch's RETURN value, which is the cached list, and assigned
 *      it over the top of the fresher list the background refresh had already
 *      applied. The carousel updated and then reverted.
 *
 *   3. The refresh went through the browser's HTTP cache, where the API's own
 *      max-age=120 answered it -- so a reload within two minutes of the last
 *      one never left the machine.
 *
 * Run: node scripts/test-ytparse.mjs
 */
import fs from 'fs';
import { lifter, assemble } from './lib/lift.mjs';
import { parsePage } from './refresh-videos.mjs';

const NL = String.fromCharCode(10);
let pass = 0, fail = 0;
const ok = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; return; }
  fail++;
  console.log('  FAIL  ' + name + NL + '          got  ' + g + NL + '          want ' + w);
};
const head = t => console.log(NL + t);

const dec = s => String(s || '')
  .replace(/\\u0026/g, '&').replace(/\\"/g, '"').replace(/\\n/g, ' ')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&#39;/g, "'").replace(/&quot;/g, '"');
const thumb = id => 'https://i.ytimg.com/vi/' + id + '/hqdefault.jpg';

/* ── the shape YouTube actually serves today ──────────────────────────────── */
head('the current channel grid (real capture, 2026-09-12)');
const live = fs.readFileSync(new URL('./fixtures/yt-channel-lockup.json', import.meta.url), 'utf8');
const got = parsePage(live, dec, thumb);
ok('it finds every entry', got && got.length, 3);
ok('newest first, in the order the page lists them',
  got.map(v => v.videoId), ['crtPN_w8UyQ', '00nmMKlYgoA', 'Ls83Pg0VEmA']);
ok('the title comes back whole', got[0].title, 'Ball & Chain 1 2026');
ok('with its entities decoded, not left as \\u0026',
  /\\u0026|&amp;/.test(got[0].title), false);
ok('the age is the "ago" row, not the view count', got[0].ageText, '1 hour ago');
ok('and not "10 views"', /view/.test(String(got[0].ageText)), false);
ok('every thumb is derived from its own id',
  got.every(v => v.thumb.indexOf('/' + v.videoId + '/') > 0), true);

/* A title belongs to its OWN entry. The parse bounds each chunk by the start of
   the next lockup for exactly this reason -- a window of fixed length would run
   past the end of a short entry and take the following title. */
head('titles do not bleed between entries');
ok('each entry keeps its own title',
  got.map(v => v.title),
  ['Ball & Chain 1 2026', 'GFL SEASON 5', 'GFL Season 5 Punishments']);

/* ── the shape it used to serve ───────────────────────────────────────────── */
head('the legacy grid still parses');
const legacy = '{"gridVideoRenderer":{"videoId":"aaaaaaaaaaa","title":{"runs":[{"text":"Older One"}]},'
  + '"publishedTimeText":{"simpleText":"3 days ago"}}},'
  + '{"gridVideoRenderer":{"videoId":"bbbbbbbbbbb","title":{"simpleText":"Older Two"},'
  + '"publishedTimeText":{"simpleText":"4 days ago"}}}';
const old = parsePage(legacy, dec, thumb);
ok('both entries', old && old.length, 2);
ok('runs titles', old[0].title, 'Older One');
ok('simpleText titles', old[1].title, 'Older Two');
ok('and their ages', old.map(v => v.ageText), ['3 days ago', '4 days ago']);

head('nothing parseable means nothing, not an empty list');
ok('a page with no videos', parsePage('{"contents":{}}', dec, thumb), null);
ok('an ID with no title is not a video',
  parsePage('"lockupViewModel":{"url":"/vi/ccccccccccc/x.jpg"}', dec, thumb), null);

/* ── the two copies must not drift ────────────────────────────────────────── */
head('api/espn.js parses with the same rules');
const apiSrc = fs.readFileSync(new URL('../api/espn.js', import.meta.url), 'utf8');
const scriptSrc = fs.readFileSync(new URL('./refresh-videos.mjs', import.meta.url), 'utf8');
const body = (src, start) => {
  const i = src.indexOf(start);
  return i < 0 ? '' : src.slice(i, src.indexOf(NL + '  };', i) + 1 || src.indexOf(NL + '}', i) + 1);
};
/* The regexes ARE the parser; the names around them differ by file. If these
   two lists ever diverge, one surface is reading a shape the other is not. */
const rx = s => (s.match(/\/(?:[^/\\\n[]|\\.|\[(?:[^\]\\]|\\.)*\])+\/[gimsuy]*/g) || [])
  .filter(r => r.length > 6);
const apiBody = body(apiSrc, 'const ytParsePage = (html) => {');
const scriptBody = body(scriptSrc, 'export function parsePage(html, dec, thumb) {');
ok('both parsers were found', [apiBody.length > 400, scriptBody.length > 400], [true, true]);
ok('and they match on every regex', rx(apiBody), rx(scriptBody));
ok('both bound entries by the next lockup, not a fixed window',
  [apiBody, scriptBody].map(s => s.indexOf('split(\'"lockupViewModel":{\')') > 0), [true, true]);

/* ── the boot race ────────────────────────────────────────────────────────── */
head('what the network said outranks what the cache said');
const grab = lifter(new URL('../public/app.js', import.meta.url));
const M = assemble(grab, ['function ytBest(ytData){'], ['ytBest', 'setFresh'],
  ['let _ytFresh=null;', 'const setFresh=v=>{_ytFresh=v;};'].join(NL));

M.setFresh(null);
ok('with nothing from the network, the returned list is used',
  M.ytBest({ videos: [{ videoId: 'cached' }] }).map(v => v.videoId), ['cached']);

M.setFresh({ videos: [{ videoId: 'brandnew' }] });
ok('once the refresh has landed, IT wins',
  M.ytBest({ videos: [{ videoId: 'cached' }] }).map(v => v.videoId), ['brandnew']);
ok('an empty network answer never blanks the list',
  M.ytBest({ videos: [{ videoId: 'cached' }] }).length > 0, true);

M.setFresh({ videos: [] });
ok('nor does an answer with no videos in it',
  M.ytBest({ videos: [{ videoId: 'cached' }] }).map(v => v.videoId), ['cached']);
ok('and with neither, an empty list rather than a throw', M.ytBest(null), []);

/* ── the rules, at the source ─────────────────────────────────────────────── */
head('boot never assigns the cached list directly');
const app = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
ok('_videos is set through ytBest', /_videos\s*=\s*ytBest\(/.test(app), true);
ok('and never straight from the fetch result',
  /_videos\s*=\s*ytData\.videos/.test(app), false);

head('an app load actually asks the network');
const ytFetchSrc = grab('async function ytFetch(){');
ok('the refresh bypasses the browser HTTP cache',
  /cache\s*:\s*'no-store'/.test(ytFetchSrc), true);
ok('and it still records what came back', /_ytFresh\s*=/.test(ytFetchSrc), true);

console.log(NL + (fail ? 'FAILED  ' : 'ok  ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
