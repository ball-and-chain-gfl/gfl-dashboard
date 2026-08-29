/* College and draft year for the players Ball Knowledge might ask about.
   Neither ever changes, so this runs once and the result is committed —
   nothing calls ESPN for a bio at render time.

   Re-run it after a draft. The quiz asks about the top of a season's pool, so
   the season that has just been drafted brings in a year of rookies the file
   has never seen, and a bio it does not hold is a question it cannot ask.

   Merging, not replacing: whatever is already in bios.json is kept, and only
   the players missing from it are fetched. Running it twice costs nothing.

     node scripts/fetch-bios.mjs            # the current league season
     node scripts/fetch-bios.mjs 2025 260   # a named season, deeper

   THE POOL COMES THROUGH THE PROXY because it is league-scoped and needs the
   ESPN cookies; that is one request, and `vercel dev` has to be up for it. The
   bios themselves do NOT — they come from ESPN's public athlete API, the same
   endpoint api/espn.js reads, so the two hundred slow calls go straight out and
   a dev server that falls over half way through cannot take them with it. */
import fs from 'fs';
const SEASON = process.argv[2] || String(new Date().getFullYear());
const TOP = Number(process.argv[3] || 220);
const OUT = 'C:/dev/gfl-dashboard/public/data/bios.json';
const BASE = process.env.GFL_BASE || 'http://localhost:3000/api/espn';
const ATHLETE = 'https://site.web.api.espn.com/apis/common/v3/sports/football/nfl/athletes';

const sleep = ms => new Promise(r => setTimeout(r, ms));

const poolRes = await fetch(`${BASE}?type=pool&seasonId=${SEASON}&limit=700`);
if (!poolRes.ok) {
  console.error(`pool: ESPN ${poolRes.status} via ${BASE} — is \`vercel dev\` running?`);
  process.exit(1);
}
const pool = await poolRes.json();
const skill = (pool.players || []).filter(p => p.pos >= 1 && p.pos <= 5);  // skip D/ST: no bio

/* RANK ON POINTS, OR ON PROJECTIONS WHEN THERE ARE NO POINTS YET.
   A season that has been drafted but not played is all zeroes, and sorting it
   by total would take the first 220 rows in whatever order they arrived. The
   projection is the only ordering that exists in August, and it is the right
   one: it is ESPN's own read on who matters this year, which is the same
   question the quiz is asking. */
const played = skill.some(p => (p.total || 0) > 0);
const rank = p => (played ? (p.total || 0) : (p.proj || 0));
const players = skill.filter(p => rank(p) > 0).sort((a, b) => rank(b) - rank(a)).slice(0, TOP);

let have = {};
try { have = JSON.parse(fs.readFileSync(OUT, 'utf8')).players || {}; } catch (e) {}
const already = players.filter(p => have[p.id] && have[p.id].college && have[p.id].draftYear).length;
console.log(`${SEASON}: ranking ${players.length} by ${played ? 'points scored' : 'projection'}`);
console.log(`  ${already} already on file, ${players.length - already} to fetch`);

let got = 0, miss = 0, added = 0;
for (const p of players) {
  if (have[p.id] && have[p.id].college && have[p.id].draftYear) { got++; continue; }
  try {
    const r = await fetch(`${ATHLETE}/${p.id}`, { headers: { Accept: 'application/json' } });
    if (r.ok) {
      const j = await r.json();
      const a = j.athlete || j;
      // "2021: Rd 1, Pk 5 (CIN)" — the year is all that is wanted from it
      const dm = /^(\d{4})/.exec(a.displayDraft || '');
      const college = (a.college && (a.college.name || a.college.shortName)) || null;
      const draftYear = dm ? Number(dm[1]) : null;
      if (college || draftYear) {
        have[p.id] = {
          name: a.displayName || p.name,
          college,
          draftYear,
          pos: (a.position && a.position.abbreviation) || null,
        };
        got++; added++;
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
console.log(`done: ${added} newly fetched, ${got} with a bio, ${miss} without one, ` +
  `${Object.keys(have).length} on file, ${fs.statSync(OUT).size} bytes`);
