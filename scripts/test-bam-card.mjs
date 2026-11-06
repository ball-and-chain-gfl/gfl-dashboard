/* BUILD A MANAGER: THE LINK PREVIEW (api/bam.js).
 *
 *   ONE CODE, TWO FILES  api/bam.js reads the same code app.js writes, in the
 *                        same trait order, with the same 0-99 points per grade
 *   A REAL PNG           1200x630, every chunk's checksum right, and it inflates
 *                        to exactly the rows it claims
 *   THE TAGS             title, the nine grades, an absolute picture address;
 *                        names escaped; a crawler gets no script to follow
 *   THE ANSWERS          a bad code goes home, the picture is cached, the page
 *                        is not
 *
 * Run: node scripts/test-bam-card.mjs
 */
import zlib from 'node:zlib';
import { lifter, assemble } from './lib/lift.mjs';
import * as B from '../api/bam.js';

const NL = String.fromCharCode(10);
let pass = 0, fail = 0;
const ok = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; console.log('  PASS  ' + name); return; }
  fail++;
  console.log('  FAIL  ' + name + NL + '          got  ' + g + NL + '          want ' + w);
};
const grab = lifter(new URL('../public/app.js', import.meta.url));
const A = assemble(grab, ['const BAM_ATTRS=', 'const BAM_PTS=', 'function bamRating(', 'function bamDecode('],
  ['BAM_ATTRS', 'BAM_PTS', 'bamRating', 'bamDecode'], '');

const CODE = '1ab46497413b7ac57b43';
const teams = { 10: { abbrev: 'BFT', name: 'The Bryan Football Team' }, 11: { abbrev: 'KW', name: 'Whittingham Sports' } };

console.log(NL + 'one code, two files');
ok('the traits in the same order, in the same colours', B.ATTRS.map(([k, , c]) => k + c), A.BAM_ATTRS.map(([k, , , c]) => k + c));
ok('the same points for each grade', B.PTS, A.BAM_PTS);
for (const c of [CODE, '10' + '3c'.repeat(9), '1' + 'c' + 'c0'.repeat(9)]) {
  const mine = B.decode(c), theirs = A.bamDecode(c);
  ok(`${c} reads the same in both`, [mine.by, mine.slots, mine.grades], [theirs.by, theirs.slots, theirs.grades]);
  ok(`and rates the same`, B.rating(mine), A.bamRating(A.BAM_ATTRS.map(([k]) => theirs.grades[k])));
}
ok('a code app.js would not accept, this will not either', ['', 'nope', CODE.slice(1), '2' + CODE.slice(1)].map(B.decode), [null, null, null, null]);

console.log(NL + 'a real png');
const png = B.card(B.decode(CODE), teams);
ok('it starts like a PNG', [...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
const chunks = [];
for (let o = 8; o < png.length;) {
  const len = png.readUInt32BE(o), type = png.toString('ascii', o + 4, o + 8);
  chunks.push({ type, data: png.subarray(o + 8, o + 8 + len), crc: png.readUInt32BE(o + 8 + len), body: png.subarray(o + 4, o + 8 + len) });
  o += 12 + len;
}
ok('IHDR, IDAT, IEND', chunks.map(c => c.type), ['IHDR', 'IDAT', 'IEND']);
ok('1200 by 630, eight-bit truecolour', [chunks[0].data.readUInt32BE(0), chunks[0].data.readUInt32BE(4), chunks[0].data[8], chunks[0].data[9]], [1200, 630, 8, 2]);
ok('every checksum holds', chunks.every(c => (zlib.crc32 ? zlib.crc32(c.body) : c.crc) === c.crc), true);
const raw = zlib.inflateSync(chunks[1].data);
ok('and it inflates to exactly 630 filtered rows', raw.length, (1200 * 3 + 1) * 630);
ok('each one filtered Up', Array.from({ length: 630 }, (_, y) => raw[y * 3601]).every(f => f === 2), true);
ok('small enough to travel', png.length < 250000, true);
ok('a build whose builder nobody knows still draws', B.card(B.decode('10' + CODE.slice(2)), {}).length > 1000, true);

console.log(NL + 'the tags');
const page = B.page(B.decode(CODE), teams, 'https://gfl-dashboard.vercel.app', false);
const tag = p => (page.match(new RegExp(`property="${p}" content="([^"]*)"`)) || [])[1];
ok('who built it and what it rates', tag('og:title'), 'The Bryan Football Team built a 79-rated manager');
ok('the picture, at an address a crawler can fetch', tag('og:image'), `https://gfl-dashboard.vercel.app/b/${CODE}/card.png`);
ok('drawn at the size it says', [tag('og:image:width'), tag('og:image:height')], ['1200', '630']);
ok('the nine grades, each with whose it was', tag('og:description').split(' · ').length, 9);
ok('a large card where the app has one', /name="twitter:card" content="summary_large_image"/.test(page), true);
ok('a person is sent on to the game', page.includes(`location.replace("/?bam=${CODE}")`), true);
ok('a crawler is not', B.page(B.decode(CODE), teams, 'https://x', true).includes('<script'), false);
const nasty = B.page(B.decode(CODE), { 10: { abbrev: '<b>', name: 'Team "<script>alert(1)</script>"' } }, 'https://x', false);
ok('a team name cannot break out of the page', [nasty.includes('<script>alert'), nasty.includes('&lt;script&gt;')], [false, true]);
ok('iMessage, Slack, Discord and X count as crawlers', [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_1) AppleWebKit/601.2.4 (KHTML, like Gecko) Version/9.0.1 Safari/601.2.4 facebookexternalhit/1.1 Facebot Twitterbot/1.0',
  'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)', 'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)', 'Twitterbot/1.0',
].map(B.isBot), [true, true, true, true]);
ok('a phone does not', B.isBot('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'), false);

console.log(NL + 'the answers');
const call = async (query, ua) => {
  const out = { code: 200, head: {}, body: null,
    setHeader(k, v) { this.head[k.toLowerCase()] = v; }, status(c) { this.code = c; return this; },
    send(b) { this.body = b; return this; }, end() { return this; } };
  await B.default({ query, headers: { host: 'gfl-dashboard.vercel.app', 'user-agent': ua || '' } }, out);
  return out;
};
const bad = await call({ c: 'nope' });
ok('a bad code goes home', [bad.code, bad.head.location], [302, '/']);
const pic = await call({ c: CODE, img: '1' });
ok('the picture is a PNG, kept a week at the edge', [pic.code, pic.head['content-type'], /s-maxage=604800/.test(pic.head['cache-control'])], [200, 'image/png', true]);
const html = await call({ c: CODE }, 'Mozilla/5.0 (iPhone)');
ok('the page is HTML and never kept, since a crawler and a person get different ones',
  [html.code, html.head['content-type'], html.head['cache-control']], [200, 'text/html; charset=utf-8', 'private, no-store']);
ok('and its addresses are https on the live host', html.body.includes(`https://gfl-dashboard.vercel.app/b/${CODE}/card.png`), true);

console.log(NL + `${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
