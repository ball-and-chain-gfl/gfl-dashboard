/* Freeze a finished week's win-probability record into the repo.
 *
 * The live poller writes a minute-by-minute score series into Firestore while
 * games are being played: `live/{season}-w{week}`, one entry per matchup, each
 * a list of [minute, scoreA, scoreB]. That document is working memory. It is
 * what the win-probability curve is drawn from while the week is live, and it
 * is the only record of how a game actually unfolded rather than how it ended.
 *
 * Once the week is over that record stops changing forever, and at that point
 * Firestore is the wrong home for it: every reader pays a round trip for
 * something that will never differ from the last time they asked. So it gets
 * committed here as `public/data/live-{season}-w{week}.json`, served from the
 * edge, cached by the service worker along with the rest of /data/, and no
 * longer dependent on a database nobody is watching any more.
 *
 * The dashboard reads the flat file first and only falls back to Firestore for
 * weeks not archived yet — in practice, the one being played right now.
 *
 * Writing nothing and exiting 0 is a normal outcome. It means there was
 * nothing new to freeze, which is what most days are.
 *
 *   node scripts/archive-week.mjs              # newest finished week, this year
 *   node scripts/archive-week.mjs 2026 3       # one specific week
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, '..', 'public', 'data');

/* Same project and web key the dashboard itself ships — this collection is
   world-readable by design, so there is no secret to configure. */
const PROJECT = process.env.GFL_FB_PROJECT || 'ball-and-chain-dashboard';
const KEY = process.env.GFL_FB_KEY || 'AIzaSyCOfZYqsD3VZmym7AW0DDX_JQnBYCZhJDA';
const API = process.env.GFL_API_BASE || 'https://gfl-dashboard.vercel.app/api/espn';

const docUrl = (k) =>
  `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/live/${encodeURIComponent(k)}?key=${KEY}`;

/* Firestore REST is typed values all the way down. These documents carry two
   string fields, so unwrapping one level is the whole job. */
function fsIn(doc) {
  const out = {};
  for (const [k, v] of Object.entries((doc && doc.fields) || {})) {
    out[k] = v.stringValue !== undefined ? v.stringValue : null;
  }
  return out;
}

async function loadSeries(key) {
  const r = await fetch(docUrl(key));
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`Firestore ${r.status} for ${key}`);
  try { return JSON.parse(fsIn(await r.json()).series || '{}'); } catch { return null; }
}

/* Which week just finished. ESPN decides that, not the calendar: a week is
   done when every game on it has points on it. */
async function latestFinishedWeek(season) {
  const r = await fetch(`${API}?view=mMatchup&seasonId=${season}`);
  if (!r.ok) throw new Error(`ESPN ${r.status}`);
  const j = await r.json();
  const byWeek = {};
  for (const m of j.schedule || []) {
    if (!m.home || !m.away) continue;
    const w = m.matchupPeriodId || 0;
    if (!w) continue;
    (byWeek[w] || (byWeek[w] = [])).push(m);
  }
  const done = Object.keys(byWeek).map(Number).filter((w) =>
    byWeek[w].every((m) => (m.home.totalPoints || 0) > 0 || (m.away.totalPoints || 0) > 0));
  return done.length ? Math.max(...done) : null;
}

/* Returns rather than exits: process.exit while a fetch is still unwinding
   trips an assertion in libuv on Windows, and none of these paths is worth
   exiting hard for — every "nothing to do" here is a success. */
async function main() {
  const season = Number(process.argv[2]) || new Date().getFullYear();
  let week = Number(process.argv[3]) || 0;
  if (!week) {
    week = await latestFinishedWeek(season);
    if (!week) return console.log(`No finished week in ${season} yet.`);
  }

  const key = `${season}-w${week}`;
  const file = path.join(OUT_DIR, `live-${key}.json`);
  if (fs.existsSync(file)) return console.log(`${key} is already archived — nothing to do.`);

  const series = await loadSeries(key);
  if (!series || !Object.keys(series).length)
    return console.log(`No series recorded for ${key} — nothing to archive.`);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(series) + '\n');
  const samples = Object.values(series).reduce((a, v) => a + v.length, 0);
  console.log(`Archived ${key}: ${Object.keys(series).length} matchups, ${samples} samples.`);
}

main().catch((e) => { console.error(e.message || e); process.exitCode = 1; });
