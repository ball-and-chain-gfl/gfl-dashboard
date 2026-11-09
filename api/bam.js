/* BUILD A MANAGER — THE LINK PREVIEW.
 *
 * A shared build is /b/<code> (vercel.json rewrites it here). Message apps build
 * a preview from a page's tags without running the page, so this answers with
 * those tags -- a title, the nine grades in a line, and a picture of the build
 * drawn here as a PNG at /b/<code>/card.png.
 *
 * AND ANYONE WHO TAPS IT GETS THE PICTURE, on its own, with no way on to the
 * site. A link from a message opens the browser, never the home-screen app
 * where people are signed in, so sending them to the game landed them signed
 * out; the recap is what they came for. (/?bam=<code> still opens a build in
 * the game, for links shared before 6 November.)
 *
 * NOTHING TO INSTALL. The picture is drawn pixel by pixel in a 5x7 type, the
 * same pixel-art spirit as the locker room, and compressed with Node's own
 * zlib. No canvas library and no fonts to fetch. The only thing on the network
 * is ESPN, for the team names, and a fixed list stands in when it says no.
 *
 * The code is the one app.js makes (bamCode): a version, the builder's team id,
 * then each slot's team id and grade, one base-36 character each. The grades
 * ride inside it, so the picture shows the build as it was made. The order of
 * the traits, the letters, how a code writes them and the 0-99 points for each
 * are app.js's own (BAM_ATTRS, BAM_SCALE, BAM_CODE, BAM_PTS);
 * scripts/test-bam-card.mjs holds the two files to each other.
 */
import zlib from 'node:zlib';

export const ATTRS = [
  ['draft', 'Drafting'], ['trade', 'Trading'], ['fin', 'Finances'],
  ['coach', 'Coaching'], ['bk', 'Ball Knowledge'], ['luck', 'Luck'],
  ['eng', 'Engagement'], ['pun', 'Punishment'], ['legacy', 'Legacy'],
];
/* F to A+ with an F+ under D- and an S above A+; a code writes each as its
   place in CODE, where S and F+ sit on the end so older links read as before */
export const SCALE = ['F', 'F+', 'D-', 'D', 'D+', 'C-', 'C', 'C+', 'B-', 'B', 'B+', 'A-', 'A', 'A+', 'S'];
export const PTS = [55, 59, 62, 65, 68, 72, 75, 78, 82, 85, 88, 90, 93, 96, 99];
export const CODE = ['F', 'D-', 'D', 'D+', 'C-', 'C', 'C+', 'B-', 'B', 'B+', 'A-', 'A', 'A+', 'S', 'F+'];

/* Version 1 is the build alone. Version 2 adds the season it played, five
   characters more: the team, where it finished, its wins, its losses, its seed. */
export function decode(code) {
  const s = String(code || '').trim().toLowerCase();
  const v1 = /^1[0-9a-z](?:[1-9a-z][0-9a-e]){9}$/, v2 = /^2[0-9a-z](?:[1-9a-z][0-9a-e]){9}[1-9a-z][1-9a-c][0-9a-z]{2}[1-9a-c]$/;
  if (!v1.test(s) && !v2.test(s)) return null;
  const v = { code: s, by: parseInt(s[1], 36) || null, slots: {}, grades: {}, season: null };
  ATTRS.forEach(([k], i) => { v.slots[k] = parseInt(s[2 + 2 * i], 36); v.grades[k] = SCALE.indexOf(CODE[parseInt(s[3 + 2 * i], 36)]); });
  if (s[0] === '2') v.season = { team: parseInt(s[20], 36), place: parseInt(s[21], 36), w: parseInt(s[22], 36), l: parseInt(s[23], 36), seed: parseInt(s[24], 36) };
  return v;
}
/* where a season ended, in a word or two, and in which colour: the same calls
   as bamFinish in app.js */
const ordinal = n => n + (n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th');
export function finish(place) {
  const big = place === 1 ? 'Champion' : place === 2 ? 'Runner-up' : place === 12 ? 'Last place' : `${ordinal(place)} place`;
  const tone = place === 1 ? 'A' : place <= 3 ? 'B' : place <= 6 ? 'C' : place <= 10 ? 'D' : 'F';
  return { big, tone };
}
/* the overall on 0-99: the mean of what each grade is worth */
export function rating(v) {
  const g = ATTRS.map(([k]) => PTS[v.grades[k]]);
  return Math.round(g.reduce((a, x) => a + x, 0) / g.length);
}
const TONES = { F: '#E84146', D: '#F2704A', C: '#E8BC56', B: '#9BD35A', A: '#3fd07a', S: '#4DA3FF' };
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
/* Seth and the Chimp: no teams, slivers of the game's wheel with an S in
   everything and an F in everything (config.js buildManager.seth and .chimp).
   ESPN has never heard of either. */
export const GUESTS = { 35: ['SETH', 'Seth'], 34: ['CHIMP', 'Chimp'] };
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
const abbrOf = (teams, id) => (GUESTS[id] || [])[0] || (teams[id] && teams[id].abbrev) || (FALLBACK[id] || [])[0] || ('T' + id);
const nameOf = (teams, id) => (GUESTS[id] || [])[1] || (teams[id] && teams[id].name) || (FALLBACK[id] || [])[1] || '';

/* ── THE TYPE ────────────────────────────────────────────────────────────────
   5x7, capitals, figures and the few marks the league's names use. Anything
   else draws as a space. The game in app.js is drawn in this same type
   (BAM_G there); scripts/test-bam-card.mjs holds the two tables together. */
export const G = {
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
  ':': '.....|.##..|.##..|.....|.##..|.##..|.....', '/': '....#|....#|...#.|..#..|.#...|#....|#....',
  '·': '.....|.....|.....|.##..|.##..|.....|.....', '?': '.###.|#...#|....#|...#.|..#..|.....|..#..',
  '(': '...#.|..#..|.#...|.#...|.#...|..#..|...#.', ')': '.#...|..#..|...#.|...#.|...#.|..#..|.#...',
  '$': '..#..|.####|#.#..|.###.|..#.#|####.|..#..',
  ' ': '.....|.....|.....|.....|.....|.....|.....',
};
const GLYPH = Object.fromEntries(Object.entries(G).map(([c, s]) => [c, s.split('|')]));
const clean = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[–—]/g, '-').toUpperCase()
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
  /* Level 6, not 9. Measured on 6 November: 9 spent 133 of a card's 155 ms of
     CPU to save about 15% of its bytes, and Active CPU (4 hours a month) is the
     free plan's tightest limit, while the bytes are a rounding error against
     its 10 GB of transfer. */
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 6 })), chunk('IEND', Buffer.alloc(0))]);
}

/* ── THE CARD ────────────────────────────────────────────────────────────────
   1200x630, the size every preview is cut from. The title across the top, who
   built it and the overall down the left, the nine slots in a 3x3 on the right:
   each one its grade's colour, the whole tile, with the grade and whose it was.
   A trait has no colour of its own, the same as in the game. */
export const CARD_W = 1200, CARD_H = 630;
/* the near-black ground with its violet glow is the same on every card, so it
   is worked out once a warm instance and copied after that */
let _ground = null;
function ground() {
  if (_ground) return _ground;
  const g = canvas(CARD_W, CARD_H), base = [11, 9, 16], glow = [166, 108, 255];
  for (let y = 0; y < CARD_H; y++) for (let x = 0; x < CARD_W; x++) {
    const t = Math.max(0, 1 - Math.hypot(x - 170, y - 110) / 950) ** 2 * 0.24;
    const i = (y * CARD_W + x) * 3;
    g.d[i] = base[0] + (glow[0] - base[0]) * t; g.d[i + 1] = base[1] + (glow[1] - base[1]) * t; g.d[i + 2] = base[2] + (glow[2] - base[2]) * t;
  }
  return (_ground = g.d);
}
export function card(v, teams) {
  const img = { w: CARD_W, h: CARD_H, d: Buffer.from(ground()) };
  const grey = hex('#8C879A'), white = hex('#F2F0F7'), dim = hex('#6E6880');
  text(img, 'BUILD A MANAGER', 60, 44, 6, hex('#B98BFF'));
  let y = 128;
  if (v.by) {
    text(img, 'BUILT BY', 60, y, 3, grey); y += 30;
    for (const line of wrap(nameOf(teams, v.by), 4, 316).slice(0, v.season ? 2 : 3)) { text(img, line, 60, y, 4, white); y += 36; }
  }
  const n = rating(v);
  if (v.season) {
    /* A played season: three lines the same size, by request -- the overall,
       the team and its record, and how the season ended -- each under its own
       small label. The seed rides on the team's label. */
    const f = finish(v.season.place);
    const line = (label, value, rgb, top) => { text(img, clean(label), 60, top, 3, grey); text(img, clean(value), 60, top + 28, 5, rgb); };
    line('OVR', String(n), hex(toneOfRating(n)), 258);
    line(`Team · ${ordinal(v.season.seed)} seed`, `${abbrOf(teams, v.season.team)} ${v.season.w}-${v.season.l}`, white, 337);
    line('Finish', f.big, hex(TONES[f.tone]), 416);
  } else {
    text(img, 'OVR', 60, 300, 5, grey);
    text(img, String(n), 60, 350, 22, hex(toneOfRating(n)));
  }
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
   The tags a preview is read from, and for whoever opens it, the picture and
   nothing else: no script, no redirect, no link on to the site. The same page
   for a crawler and a person, so the edge can keep it. */
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function page(v, teams, origin) {
  const n = rating(v), by = v.by ? nameOf(teams, v.by) : '';
  const s = v.season, f = s ? finish(s.place) : null, team = s ? nameOf(teams, s.team) : '';
  const title = (by ? `${by} built a ${n}-rated manager` : `A ${n}-rated manager`) + (s ? ` · ${f.big} with ${team}` : '');
  const desc = (s ? `${f.big} · ${team} · ${s.w}-${s.l} · ${ordinal(s.seed)} seed. ` : '')
    + ATTRS.map(([k, label]) => `${label} ${SCALE[v.grades[k]]} (${abbrOf(teams, v.slots[k])})`).join(' · ');
  const url = `${origin}/b/${v.code}`, img = `${url}/card.png`;
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
<meta name="theme-color" content="#0b0910">
<style>html,body{margin:0;background:#0b0910}
main{min-height:100vh;box-sizing:border-box;padding:16px;display:grid;place-items:center}
img{display:block;width:100%;max-width:1200px;height:auto;border-radius:10px}</style>
</head><body><main><img src="${esc(img)}" width="${CARD_W}" height="${CARD_H}" alt="${esc(`Build a Manager: overall ${n}. ${desc}`)}"></main></body></html>`;
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
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=86400, stale-while-revalidate=604800');
  return res.status(200).send(page(v, teams, `${proto}://${host}`));
}
