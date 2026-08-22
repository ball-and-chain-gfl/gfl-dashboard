/* College and draft year for the players Ball Knowledge might ask about.
   Neither ever changes, so this runs once and the result is committed —
   nothing calls ESPN for a bio at render time. */
import fs from 'fs';
const SEASON = process.argv[2] || '2025';
const TOP = Number(process.argv[3] || 220);
const OUT = 'C:/dev/gfl-dashboard/public/data/bios.json';
const BASE = 'http://localhost:3000/api/espn';

const sleep = ms => new Promise(r => setTimeout(r, ms));

const poolRes = await fetch(`${BASE}?type=pool&seasonId=${SEASON}&limit=700`);
const pool = await poolRes.json();
const players = (pool.players || [])
  .filter(p => p.total > 0 && p.pos >= 1 && p.pos <= 5)   // skip D/ST: no bio
  .sort((a, b) => b.total - a.total)
  .slice(0, TOP);

console.log(`fetching ${players.length} bios…`);
let have = {};
try { have = JSON.parse(fs.readFileSync(OUT, 'utf8')).players || {}; } catch (e) {}

let got = 0, miss = 0;
for (const p of players) {
  if (have[p.id] && have[p.id].college && have[p.id].draftYear) { got++; continue; }
  try {
    const r = await fetch(`${BASE}?type=athlete&playerId=${p.id}`);
    if (r.ok) {
      const b = await r.json();
      if (b.college || b.draftYear) {
        have[p.id] = { name: b.name || p.name, college: b.college, draftYear: b.draftYear, pos: b.pos };
        got++;
      } else miss++;
    } else miss++;
  } catch (e) { miss++; }
  if ((got + miss) % 25 === 0) console.log(`  ${got + miss}/${players.length}  (${got} with a bio)`);
  await sleep(120);                       // ESPN's public API, so be polite
}
fs.writeFileSync(OUT, JSON.stringify({
  note: 'College and draft year. Neither changes, so this is committed rather than fetched.',
  captured: new Date().toISOString().slice(0, 10),
  players: have,
}, null, 1));
console.log(`done: ${got} bios, ${miss} without one, ${fs.statSync(OUT).size} bytes`);
