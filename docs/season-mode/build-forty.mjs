/* Each rated player's NFL Combine 40-yard dash, for the Speed attribute.
 *   node docs/season-mode/build-forty.mjs <combine.csv>   -> forty.json { "<espn id>": { forty, draft } }
 * The CSV is nflverse's public combine file (github.com/nflverse/nflverse-data, release "combine"), every combine
 * since 2000. Matched by name and position; a player who never ran at the combine is left out, and build-attrs.mjs
 * falls back to his stats for him. */
import fs from 'node:fs';
const D = new URL('./', import.meta.url);
const lines = fs.readFileSync(process.argv[2], 'utf8').trim().split(/\r?\n/), H = lines.shift().split(',');
const parse = l => { const o = []; let cur = '', q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === ',' && !q) { o.push(cur); cur = ''; } else cur += ch; } o.push(cur); const r = {}; H.forEach((h, i) => r[h] = o[i]); return r; };
const norm = n => String(n).toLowerCase().replace(/\b(jr|sr|ii|iii|iv|v)\b\.?/g, '').replace(/[^a-z]/g, '');
const FAM = { QB: ['QB'], RB: ['RB', 'FB'], WR: ['WR'], TE: ['TE'] };
const by = {}; lines.map(parse).forEach(r => { (by[norm(r.player_name)] = by[norm(r.player_name)] || []).push(r); });
const rated = JSON.parse(fs.readFileSync(new URL('rated.json', D), 'utf8'));
const out = {};
for (const p of rated) { if (out[p.id]) continue;
  const c = (by[norm(p.n)] || []).filter(r => FAM[p.pos].includes(r.pos) && r.forty);
  if (c.length) out[p.id] = { forty: +c[0].forty, draft: +c[0].draft_year || +c[0].season }; }
fs.writeFileSync(new URL('forty.json', D), JSON.stringify(out));
console.log('players with a 40:', Object.keys(out).length, 'of', new Set(rated.map(p => p.id)).size);
