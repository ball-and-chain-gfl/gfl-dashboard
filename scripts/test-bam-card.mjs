/* BUILD A MANAGER: THE LINK PREVIEW (api/bam.js).
 *
 *   ONE CODE, TWO FILES  api/bam.js reads the same code app.js writes, in the
 *                        same trait order, with the same 0-99 points per grade
 *   A REAL PNG           1200x630, every chunk's checksum right, and it inflates
 *                        to exactly the rows it claims
 *   THE TAGS             title, the nine grades, an absolute picture address;
 *                        names escaped; whoever opens the link gets the
 *                        picture and nothing else, no script and no way on
 *   THE ANSWERS          a bad code goes home; the picture and the page are both
 *                        kept at the edge, the page being the same for everyone
 *
 * Run: node scripts/test-bam-card.mjs
 */
import zlib from 'node:zlib';
import fs from 'node:fs';
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
const A = assemble(grab, ['const BAM_ATTRS=', 'const BAM_PTS=', 'function bamRating(', 'function bamDecode(', 'const BAM_G='],
  ['BAM_ATTRS', 'BAM_PTS', 'bamRating', 'bamDecode', 'BAM_G'], '');

const CODE = '1ab46497413b7ac57b43';
const teams = { 10: { abbrev: 'BFT', name: 'The Bryan Football Team' }, 11: { abbrev: 'KW', name: 'Whittingham Sports' } };

console.log(NL + 'one code, two files');
ok('the traits in the same order, under the same names', B.ATTRS.map(([k, l]) => k + ':' + l), A.BAM_ATTRS.map(([k, l]) => k + ':' + l));
ok('and, like the game, no colour of their own', B.ATTRS.every(a => a.length === 2), true);
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
const page = B.page(B.decode(CODE), teams, 'https://gfl-dashboard.vercel.app');
const tag = p => (page.match(new RegExp(`property="${p}" content="([^"]*)"`)) || [])[1];
ok('who built it and what it rates', tag('og:title'), 'The Bryan Football Team built a 79-rated manager');
ok('the picture, at an address a crawler can fetch', tag('og:image'), `https://gfl-dashboard.vercel.app/b/${CODE}/card.png`);
ok('drawn at the size it says', [tag('og:image:width'), tag('og:image:height')], ['1200', '630']);
ok('the nine grades, each with whose it was', tag('og:description').split(' · ').length, 9);
ok('a large card where the app has one', /name="twitter:card" content="summary_large_image"/.test(page), true);
ok('whoever opens it sees the picture', page.includes(`<img src="https://gfl-dashboard.vercel.app/b/${CODE}/card.png"`), true);
ok('and nothing sends them on to the site', [page.includes('<script'), page.includes('?bam='), /<a /.test(page)], [false, false, false]);
const nasty = B.page(B.decode(CODE), { 10: { abbrev: '<b>', name: 'Team "<script>alert(1)</script>"' } }, 'https://x');
ok('a team name cannot break out of the page', [nasty.includes('<script>alert'), nasty.includes('&lt;script&gt;')], [false, true]);
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
ok('the page is HTML, the same for a crawler and a person, so kept at the edge',
  [html.code, html.head['content-type'], /^public.*s-maxage=/.test(html.head['cache-control'])], [200, 'text/html; charset=utf-8', true]);
ok('and its addresses are https on the live host', html.body.includes(`https://gfl-dashboard.vercel.app/b/${CODE}/card.png`), true);

console.log(NL + 'a season on the card');
{
  const two = '2' + CODE.slice(1) + '3' + '1' + 'b' + '3' + '1';
  const v = B.decode(two), app = A.bamDecode(two);
  ok('a season code reads the same in both files', v.season, app.season);
  ok('the team, where it finished, the record and the seed', v.season, { team: 3, place: 1, w: 11, l: 3, seed: 1 });
  ok('and the title says how it ended', /· Champion with /.test(B.page(v, teams, 'https://x')), true);
  ok('the card still draws', B.card(v, teams).length > 1000, true);
}

console.log(NL + 'cheap to draw');
const API = fs.readFileSync(new URL('../api/bam.js', import.meta.url), 'utf8');
ok('compressed at level 6: level 9 was 133 of 155 ms of CPU a card, for 15% fewer bytes', [API.includes('zlib.deflateSync(raw, { level: 6 })'), API.includes('level: 9')], [true, false]);
ok('and the glowing ground is worked out once, then copied', [API.includes('let _ground = null;'), API.includes('d: Buffer.from(ground())')], [true, true]);
ok('a season card draws its overall, team and finish at one size', API.includes('text(img, clean(value), 60, top + 28, 5, rgb)'), true);

console.log(NL + 'the type');
ok('the game is set in the same type as the card', JSON.stringify(A.BAM_G), JSON.stringify(B.G));

console.log(NL + `${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
