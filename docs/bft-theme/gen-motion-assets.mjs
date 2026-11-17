/* MORE OF THE BFT THEME'S ASSETS: the fine dots the bar charts are made of,
 * and three sparse "spark" tiles that fade in and out over the dot grid to
 * make it twinkle. All sit on the same 6px grid as dots.svg, so a spark always
 * lands exactly on a dot.
 *
 *   node gen-motion-assets.mjs
 */
import fs from 'node:fs';
const OUT = new URL('../../public/theme/site/', import.meta.url);
fs.mkdirSync(OUT, { recursive: true });
const svg = (w, h, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges">${body}</svg>`;

/* the bar charts: a denser grid of bigger dots, so a bar reads as solid */
const FINE = { cell: 4, size: 2 };
fs.writeFileSync(new URL('dots-fine.svg', OUT), svg(FINE.cell, FINE.cell, `<rect x="1" y="1" width="${FINE.size}" height="${FINE.size}" fill="#fff"/>`));

/* the sparks: a 96px tile (16 x 16 cells of the 6px grid) with a few dots lit */
const CELL = 6, DOT = 1, TILE = 96, PER = 9;
let seed = 844;
const rnd = () => { seed ^= seed << 13; seed >>>= 0; seed ^= seed >>> 17; seed ^= seed << 5; seed >>>= 0; return seed / 4294967296; };
const used = new Set();
['a', 'b', 'c'].forEach(name => {
  let body = '';
  for (let n = 0; n < PER;) {
    const cx = Math.floor(rnd() * (TILE / CELL)), cy = Math.floor(rnd() * (TILE / CELL)), k = cx + ':' + cy;
    if (used.has(k)) continue;                       // no dot in two tiles: each twinkles on its own
    used.add(k); n++;
    body += `<rect x="${cx * CELL + (CELL - DOT) / 2}" y="${cy * CELL + (CELL - DOT) / 2}" width="${DOT}" height="${DOT}" fill="#fff"/>`;
  }
  fs.writeFileSync(new URL(`sparks-${name}.svg`, OUT), svg(TILE, TILE, body));
});
for (const f of fs.readdirSync(OUT)) console.log(f.padEnd(16), fs.statSync(new URL(f, OUT)).size, 'bytes');
