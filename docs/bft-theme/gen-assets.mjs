/* THE BFT THEME'S ASSETS, MADE BY NUMBERS.
 *
 * Two files, both tiny, both ours:
 *   dots.svg    one cell of a dot grid. Used as a CSS mask over a solid colour,
 *               so one file gives a dot background in any colour.
 *   grain.png   a seamless tile of film grain, repeated over the page.
 *
 * Change a number below and run it again:  node gen-assets.mjs
 */
import fs from 'node:fs';
import zlib from 'node:zlib';

const OUT = new URL('../../public/theme/bft/', import.meta.url);
fs.mkdirSync(OUT, { recursive: true });

/* ── the dot grid ────────────────────────────────────────────────────────── */
const DOT = { cell: 6, size: 1 };          // one dot every 6px, each 1px square
const off = (DOT.cell - DOT.size) / 2;
const dots = `<svg xmlns="http://www.w3.org/2000/svg" width="${DOT.cell}" height="${DOT.cell}" viewBox="0 0 ${DOT.cell} ${DOT.cell}" shape-rendering="crispEdges"><rect x="${off}" y="${off}" width="${DOT.size}" height="${DOT.size}" fill="#fff"/></svg>`;
fs.writeFileSync(new URL('dots.svg', OUT), dots);

/* ── the grain ───────────────────────────────────────────────────────────── */
const GRAIN = { px: 128, levels: 6, max: 11 };   // tile size, alpha steps, strongest alpha (of 255)
let seed = 20261116;
const rnd = () => { seed ^= seed << 13; seed >>>= 0; seed ^= seed >>> 17; seed ^= seed << 5; seed >>>= 0; return seed / 4294967296; };
const N = GRAIN.px, raw = Buffer.alloc(N * (1 + N * 2));
for (let y = 0; y < N; y++) {
  raw[y * (1 + N * 2)] = 0;                                   // filter: none
  for (let x = 0; x < N; x++) {
    const light = rnd() < 0.5;                                 // a light speck or a dark one
    const a = Math.round(Math.floor(rnd() * GRAIN.levels) / (GRAIN.levels - 1) * GRAIN.max);
    const i = y * (1 + N * 2) + 1 + x * 2;
    raw[i] = light ? 255 : 0; raw[i + 1] = a;
  }
}
const crcT = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc = b => { let c = 0xffffffff; for (const v of b) c = crcT[(c ^ v) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]), c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(N, 0); ihdr.writeUInt32BE(N, 4); ihdr[8] = 8; ihdr[9] = 4;   // 8-bit grey + alpha
const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
fs.writeFileSync(new URL('grain.png', OUT), png);

console.log('dots.svg', dots.length, 'bytes   grain.png', png.length, 'bytes');

/* two fixed tints of the same cell, for where a stencil cannot be used: the
   bands between sections (a background) and the word at the foot (clipped to text) */
const tint=fill=>dots.replace("#fff",fill);
fs.writeFileSync(new URL("dots-dim.svg", OUT), tint("#3b3b3b"));
fs.writeFileSync(new URL("dots-word.svg", OUT), tint("#c9cac8"));
