/* BUILD A MANAGER — THE LINK PREVIEW.
 *
 * A shared build is /b/<code> (vercel.json rewrites it here). Message apps build
 * a preview from a page's tags without running the page, so this answers with
 * those tags -- a title, the nine grades in a line, and a picture of the build
 * drawn here as a PNG at /b/<code>/card.png -- and sends anybody in a real
 * browser straight on to the game at /?bam=<code>.
 *
 * NOTHING TO INSTALL. The picture is drawn pixel by pixel in a 5x7 type, the
 * same pixel-art spirit as the locker room, and compressed with Node's own
 * zlib. No canvas library and no fonts to fetch. The only thing on the network
 * is ESPN, for the team names, and a fixed list stands in when it says no.
 *
 * The code is the one app.js makes (bamCode): a version, the builder's team id,
 * then each slot's team id and grade, one base-36 character each. The grades
 * ride inside it, so the picture shows the build as it was made. The order of
 * the traits and the 0-99 points for each grade are app.js's own (BAM_ATTRS,
 * BAM_PTS); scripts/test-bam-card.mjs holds the two files to each other.
 */
import zlib from 'node:zlib';

export const ATTRS = [
  ['draft', 'Drafting'], ['trade', 'Trading'], ['fin', 'Finances'],
  ['coach', 'Coaching'], ['bk', 'Ball Knowledge'], ['luck', 'Luck'],
  ['eng', 'Engagement'], ['pun', 'Punishment'], ['legacy', 'Legacy'],
];
export const SCALE = ['F', 'D-', 'D', 'D+', 'C-', 'C', 'C+', 'B-', 'B', 'B+', 'A-', 'A', 'A+'];
export const PTS = [55, 62, 65, 68, 72, 75, 78, 82, 85, 88, 91, 95, 99];

export function decode(code) {
  const s = String(code || '').trim().toLowerCase();
  if (!/^1[0-9a-z](?:[1-9a-z][0-9a-c]){9}$/.test(s)) return null;
  const v = { code: s, by: parseInt(s[1], 36) || null, slots: {}, grades: {} };
  ATTRS.forEach(([k], i) => { v.slots[k] = parseInt(s[2 + 2 * i], 36); v.grades[k] = parseInt(s[3 + 2 * i], 36); });
  return v;
}
/* the overall on 0-99: the mean of what each grade is worth */
export function rating(v) {
  const g = ATTRS.map(([k]) => PTS[v.grades[k]]);
  return Math.round(g.reduce((a, x) => a + x, 0) / g.length);
}
const TONES = { F: '#E84146', D: '#F2704A', C: '#E8BC56', B: '#9BD35A', A: '#3fd07a' };
const toneOfGrade = i => TONES[SCALE[i][0]];
const toneOfRating = n => n >= 90 ? TONES.A : n >= 80 ? TONES.B : n >= 70 ? TONES.C : n >= 63 ? TONES.D : TONES.F;

/* ── THE TEAMS ──────────────────────────────────────────────────────────────
   Names and abbreviations from ESPN, kept an hour in a warm instance. The list
   below is the league on 6 November 2026, and only stands in when ESPN will
   not answer, so a preview is never a row of question marks. */
const FALLBACK = {
  1: ['MM', 'Marathon Men'], 2: ['MCM', 'Motor City Mulligans'], 3: ['GOOB', 'Bikini Bottom Goobers'],
  4: ['Bi', 'Bismuth'], 5: ['FMAN', 'Florida Man'], 6: ['SW', 'Silly Willys'], 7: ['KUNK', "Lebron's 3rd Leg"],
  8: ['TING', 'Tuckasegee Tinglers'], 9: ['MWM', 'Midwest Miners'], 10: ['BFT', 'The Bryan Football Team'],
  11: ['KW', 'Whittingham Sports'], 12: ['WGLR', 'West Coast Wigglers'],
};
const fallbackTeams = () => Object.fromEntries(Object.entries(FALLBACK).map(([id, [abbrev, name]]) => [id, { abbrev, name }]));
let _teams = null, _teamsAt = 0;
async function teamsNow() {
  if (_teams && Date.now() - _teamsAt < 3600e3) return _teams;
  const s2 = process.env.ESPN_S2, swid = process.env.ESPN_SWID, out = {};
  if (s2 && swid) {
    const y = new Date().getFullYear();
    for (const season of [y, y - 1]) {
      try {
        const r = await fetch(`https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${season}/segments/0/leagues/1327340807?view=mTeam`,
          { headers: { Cookie: `espn_s2=${s2}; SWID=${swid}`, Accept: 'application/json' }, signal: AbortSignal.timeout(4000) });
        if (!r.ok) continue;
        const j = await r.json();
        (j.teams || []).forEach(t => {
          const name = String(t.name || [t.location, t.nickname].filter(Boolean).join(' ')).replace(/\s+/g, ' ').trim();
          out[t.id] = { abbrev: String(t.abbrev || '').trim(), name };
        });
        if (Object.keys(out).length) break;
      } catch (e) { /* the next season, or the fallback */ }
    }
  }
  if (!Object.keys(out).length) return fallbackTeams();
  _teams = out; _teamsAt = Date.now();
  return out;
}
const abbrOf = (teams, id) => (teams[id] && teams[id].abbrev) || (FALLBACK[id] || [])[0] || ('T' + id);
const nameOf = (teams, id) => (teams[id] && teams[id].name) || (FALLBACK[id] || [])[1] || '';

/* ── THE TYPE ────────────────────────────────────────────────────────────────
   5x7, capitals, figures and the few marks the league's names use. Anything
   else draws as a space. */
const G = {
  A: '.###.|#...#|#...#|#####|#...#|#...#|#...#', B: '####.|#...#|#...#|####.|#...#|#...#|####.',
  C: '.###.|#...#|#....|#....|#....|#...#|.###.', D: '###..|#..#.|#...#|#...#|#...#|#..#.|###..',
  E: '#####|#....|#....|####.|#....|#....|#####', F: '#####|#....|#....|####.|#....|#....|#....',
  G: '.###.|#...#|#....|#.###|#...#|#...#|.####', H: '#...#|#...#|#...#|#####|#...#|#...#|#...#',
  I: '.###.|..#..|..#..|..#..|..#..|..#..|.###.', J: '..###|...#.|...#.|...#.|...#.|#..#.|.##..',
  K: '#...#|#..#.|#.#..|##...|#.#..|#..#.|#...#', L: '#....|#....|#....|#....|#....|#....|#####',
  M: '#...#|##.##|#.#.#|#.#.#|#...#|#...#|#...#', N: '#...#|#...#|##..#|#.#.#|#..##|#...#|#...#',
  O: '.###.|#...#|#...#|#...#|#...#|#...#|.###.', P: '####.|#...#|#...#|####.|#....|#....|#....',
  Q: '.###.|#...#|#...#|#...#|#.#.#|#..#.|.##.#', R: '####.|#...#|#...#|####.|#.#..|#..#.|#...#',
  S: '.####|#....|#....|.###.|....#|....#|####.', T: '#####|..#..|..#..|..#..|..#..|..#..|..#..',
  U: '#...#|#...#|#...#|#...#|#...#|#...#|.###.', V: '#...#|#...#|#...#|#...#|#...#|.#.#.|..#..',
  W: '#...#|#...#|#...#|#.#.#|#.#.#|#.#.#|.#.#.', X: '#...#|#...#|.#.#.|..#..|.#.#.|#...#|#...#',
  Y: '#...#|#...#|#...#|.#.#.|..#..|..#..|..#..', Z: '#####|....#|...#.|..#..|.#...|#....|#####',
  0: '.###.|#...#|#..##|#.#.#|##..#|#...#|.###.', 1: '..#..|.##..|..#..|..#..|..#..|..#..|.###.',
  2: '.###.|#...#|....#|...#.|..#..|.#...|#####', 3: '#####|...#.|..#..|...#.|....#|#...#|.###.',
  4: '...#.|..##.|.#.#.|#..#.|#####|...#.|...#.', 5: '#####|#....|####.|....#|....#|#...#|.###.',
  6: '..##.|.#...|#....|####.|#...#|#...#|.###.', 7: '#####|....#|...#.|..#..|.#...|.#...|.#...',
  8: '.###.|#...#|#...#|.###.|#...#|#...#|.###.', 9: '.###.|#...#|#...#|.####|....#|...#.|.##..',
  '+': '.....|..#..|..#..|#####|..#..|..#..|.....', '-': '.....|.....|.....|#####|.....|.....|.....',
  '.': '.....|.....|.....|.....|.....|.##..|.##..', "'": '.##..|..#..|.#...|.....|.....|.....|.....',
  '&': '.##..|#..#.|#.#..|.#...|#.#.#|#..#.|.##.#', '!': '..#..|..#..|..#..|..#..|..#..|.....|..#..',
  ' ': '.....|.....|.....|.....|.....|.....|.....',
};
const GLYPH = Object.fromEntries(Object.entries(G).map(([c, s]) => [c, s.split('|')]));
const clean = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
  .split('').map(c => (GLYPH[c] ? c : ' ')).join('').replace(/\s+/g, ' ').trim();
const textW = (s, px) => (s.length ? s.length * 6 * px - px : 0);
/* words onto lines no wider than `max`, a long word left whole on its own line */
function wrap(s, px, max) {
  const lines = []; let cur = '';
  for (const w of clean(s).split(' ').filter(Boolean)) {
    const next = cur ? cur + ' ' + w : w;
    if (cur && textW(next, px) > max) { lines.push(cur); cur = w; } else cur = next;
  }
  if (cur) lines.push(cur);
  return lines;
}

/* ── THE CANVAS ────────────────────────────────────────────────────────────── */
const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
function canvas(w, h) { return { w, h, d: Buffer.alloc(w * h * 3) }; }
function blend(img, x, y, rgb, a) {
  if (x < 0 || y < 0 || x >= img.w || y >= img.h || a <= 0) return;
  const i = (y * img.w + x) * 3, k = Math.min(1, a);
  img.d[i] = img.d[i] + (rgb[0] - img.d[i]) * k;
  img.d[i + 1] = img.d[i + 1] + (rgb[1] - img.d[i + 1]) * k;
  img.d[i + 2] = img.d[i + 2] + (rgb[2] - img.d[i + 2]) * k;
}
function rect(img, x, y, w, h, rgb, a = 1, r = 0) {
  for (let yy = Math.floor(y); yy < y + h; yy++) for (let xx = Math.floor(x); xx < x + w; xx++) {
    let cover = 1;
    if (r > 0) {
      const cx = xx < x + r ? x + r : xx > x + w - r - 1 ? x + w - r - 1 : xx;
      const cy = yy < y + r ? y + r : yy > y + h - r - 1 ? y + h - r - 1 : yy;
      const dist = Math.hypot(xx - cx, yy - cy);
      cover = Math.max(0, Math.min(1, r - dist + 0.5));
    }
    blend(img, xx, yy, rgb, a * cover);
  }
}
function text(img, s, x, y, px, rgb) {
  let cx = x;
  for (const ch of s) {
    const g = GLYPH[ch] || GLYPH[' '];
    for (let r = 0; r < 7; r++) for (let c = 0; c < 5; c++) if (g[r][c] === '#') rect(img, cx + c * px, y + r * px, px, px, rgb);
    cx += 6 * px;
  }
}

/* ── PNG ───────────────────────────────────────────────────────────────────
   Truecolour, eight bits, every row filtered Up -- the background is a soft
   glow, and Up is what keeps a gradient small. */
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(buf) { let c = 0xFFFFFFFF; for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
export function png(img) {
  const { w, h, d } = img, row = w * 3, raw = Buffer.alloc((row + 1) * h);
  for (let y = 0; y < h; y++) {
    const o = y * (row + 1); raw[o] = 2;
    for (let i = 0; i < row; i++) raw[o + 1 + i] = (d[y * row + i] - (y ? d[(y - 1) * row + i] : 0)) & 255;
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

/* ── THE CARD ────────────────────────────────────────────────────────────────
   1200x630, the size every preview is cut from. The title across the top, who
   built it and the overall down the left, the nine slots in a 3x3 on the right:
   each one its grade's colour, the whole tile, with the grade and whose it was.
   A trait has no colour of its own, the same as in the game. */
export const CARD_W = 1200, CARD_H = 630;
export function card(v, teams) {
  const img = canvas(CARD_W, CARD_H);
  const base = [11, 9, 16], glow = [166, 108, 255];
  for (let y = 0; y < CARD_H; y++) for (let x = 0; x < CARD_W; x++) {
    const t = Math.max(0, 1 - Math.hypot(x - 170, y - 110) / 950) ** 2 * 0.24;
    const i = (y * CARD_W + x) * 3;
    img.d[i] = base[0] + (glow[0] - base[0]) * t; img.d[i + 1] = base[1] + (glow[1] - base[1]) * t; img.d[i + 2] = base[2] + (glow[2] - base[2]) * t;
  }
  const grey = hex('#8C879A'), white = hex('#F2F0F7'), dim = hex('#6E6880');
  text(img, 'BUILD A MANAGER', 60, 44, 6, hex('#B98BFF'));
  let y = 128;
  if (v.by) {
    text(img, 'BUILT BY', 60, y, 3, grey); y += 30;
    for (const line of wrap(nameOf(teams, v.by), 4, 316).slice(0, 3)) { text(img, line, 60, y, 4, white); y += 36; }
  }
  const n = rating(v);
  text(img, 'OVR', 60, 300, 5, grey);
  text(img, String(n), 60, 350, 22, hex(toneOfRating(n)));
  text(img, 'BALL & CHAIN GFL', 60, 566, 3, dim);
  const gx = 400, gy = 120, gw = 740, gh = 470, gap = 14, tw = (gw - 2 * gap) / 3, th = (gh - 2 * gap) / 3;
  ATTRS.forEach(([k, label], i) => {
    const x = Math.round(gx + (i % 3) * (tw + gap)), yy = Math.round(gy + Math.floor(i / 3) * (th + gap));
    const w = Math.round(tw), h = Math.round(th), gi = v.grades[k], c = hex(toneOfGrade(gi));
    rect(img, x, yy, w, h, c, 0.14, 16);
    rect(img, x, yy, w, 4, c, 0.95, 2);
    let ly = yy + 16;
    for (const line of wrap(label, 3, w - 32)) { text(img, line, x + 16, ly, 3, white); ly += 26; }
    text(img, SCALE[gi], x + 16, yy + h - 16 - 56, 8, c);
    const ab = clean(abbrOf(teams, v.slots[k]));
    text(img, ab, x + w - 16 - textW(ab, 3), yy + h - 16 - 21, 3, white);
  });
  return png(img);
}

/* ── THE PAGE ────────────────────────────────────────────────────────────────
   The tags a preview is read from, then a nudge on to the game. A crawler gets
   no script at all -- some run one, and would follow it off the tags. */
const BOT = /bot|crawl|spider|slurp|facebookexternalhit|facebot|twitterbot|slackbot|discord|whatsapp|telegram|linkedin|embedly|skype|vkshare|pinterest|preview|iframely|google-inspectiontool|bingpreview|snapchat/i;
export const isBot = ua => BOT.test(String(ua || ''));
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function page(v, teams, origin, bot) {
  const n = rating(v), by = v.by ? nameOf(teams, v.by) : '';
  const title = by ? `${by} built a ${n}-rated manager` : `A ${n}-rated manager`;
  const desc = ATTRS.map(([k, label]) => `${label} ${SCALE[v.grades[k]]} (${abbrOf(teams, v.slots[k])})`).join(' · ');
  const url = `${origin}/b/${v.code}`, img = `${url}/card.png`, game = `/?bam=${v.code}`;
  const meta = (p, c, attr = 'property') => `<meta ${attr}="${p}" content="${esc(c)}">`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} · Build a Manager</title>
${meta('og:type', 'website')}
${meta('og:site_name', 'Ball & Chain GFL')}
${meta('og:title', title)}
${meta('og:description', desc)}
${meta('og:url', url)}
${meta('og:image', img)}
${meta('og:image:type', 'image/png')}
${meta('og:image:width', String(CARD_W))}
${meta('og:image:height', String(CARD_H))}
${meta('og:image:alt', `Build a Manager: overall ${n}. ${desc}`)}
${meta('twitter:card', 'summary_large_image', 'name')}
${meta('twitter:title', title, 'name')}
${meta('twitter:description', desc, 'name')}
${meta('twitter:image', img, 'name')}
<meta name="theme-color" content="#A66CFF">
${bot ? '' : `<script>location.replace(${JSON.stringify(game)})</script>`}
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b0910;font-family:system-ui,sans-serif}
a{color:#c9a6ff;font-weight:700;text-decoration:none}</style>
</head><body><a href="${esc(game)}">Open the build</a></body></html>`;
}

export default async function handler(req, res) {
  const v = decode(req.query && req.query.c);
  if (!v) { res.setHeader('Location', '/'); return res.status(302).end(); }
  const teams = await teamsNow();
  if (req.query.img) {
    res.setHeader('Content-Type', 'image/png');
    /* the code carries the grades, so a picture only changes if a team renames */
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000');
    return res.status(200).send(card(v, teams));
  }
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || 'gfl-dashboard.vercel.app').split(',')[0].trim();
  const proto = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host) ? 'http' : 'https';
  const bot = isBot(req.headers['user-agent']);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  /* not kept at the edge: the same address answers a crawler and a person differently */
  res.setHeader('Cache-Control', 'private, no-store');
  return res.status(200).send(page(v, teams, `${proto}://${host}`, bot));
}
