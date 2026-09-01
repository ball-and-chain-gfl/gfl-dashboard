/* Freeze a finished week's Coaches' Poll into the repo.
 *
 * The ballots live on the profile documents, one per manager, under `cp_<season>`
 * — a season-long ballot that anybody can revise at any time. That is the right
 * shape for voting and the wrong shape for history: revise it in week 9 and the
 * week 1 standings are gone, and there is nowhere they could have been read from
 * anyway short of a full profiles read every time somebody opens the page.
 *
 * So once a week is over its standings are snapshotted here into
 * `public/data/polls-<season>.json`, served from the edge and cached by the
 * service worker with the rest of /data/. The dashboard reads that file and
 * never asks the database for poll history at all.
 *
 * Writing nothing and exiting 0 is a normal outcome: no week has finished, or
 * the week is already on file, or nobody has voted. Most days are one of those.
 *
 *   node scripts/archive-poll.mjs             # newest finished week, this year
 *   node scripts/archive-poll.mjs 2026 3      # one specific week
 *   node scripts/archive-poll.mjs 2026 3 --force   # overwrite one already there
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, '..', 'public', 'data');

/* The same project and web key the dashboard ships. profiles is world-readable
   by design, so there is no secret to configure. */
const PROJECT = process.env.GFL_FB_PROJECT || 'ball-and-chain-dashboard';
const KEY = process.env.GFL_FB_KEY || 'AIzaSyCOfZYqsD3VZmym7AW0DDX_JQnBYCZhJDA';
const API = process.env.GFL_API_BASE || 'https://gfl-dashboard.vercel.app/api/espn';

const args = process.argv.slice(2).filter(a => a !== '--force');
const FORCE = process.argv.includes('--force');
const SEASON = String(args[0] || new Date().getFullYear());
const WEEK_ARG = args[1] ? Number(args[1]) : null;

/* Firestore REST is typed values all the way down; these documents are strings. */
function fsIn(doc) {
  const out = {};
  for (const [k, v] of Object.entries((doc && doc.fields) || {})) {
    out[k] = v.stringValue !== undefined ? v.stringValue : null;
  }
  return out;
}

async function loadProfiles() {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT}`
    + `/databases/(default)/documents/profiles?key=${KEY}&pageSize=300`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Firestore ${r.status} listing profiles`);
  const j = await r.json();
  return (j.documents || []).map(d => ({
    id: decodeURIComponent((d.name || '').split('/').pop() || ''), ...fsIn(d),
  }));
}

async function espn(q) {
  const r = await fetch(`${API}?${q}`);
  if (!r.ok) throw new Error(`ESPN proxy ${r.status} for ${q}`);
  return r.json();
}

/* -- WHEN A WEEK IS OVER -----------------------------------------------------
 * ESPN's own word for it. `winner` reads "UNDECIDED" on every fixture until the
 * scoring period closes, and HOME/AWAY/TIE from then on. NOT "every fixture
 * holds a point": that is true from about ten past one on the Sunday, with the
 * late window, Sunday night and Monday night all still to come, and a third of
 * a week frozen into the repo is not something a later run undoes.
 * The release valve -- all scored AND a later week scoring -- is football
 * having moved on, which is proof enough if the flag never lands.
 * Mirrors weekOver in app.js. scripts/test-weeks.mjs holds the copies level. */
const wkDecided = m => ['HOME', 'AWAY', 'TIE'].includes(String((m && m.winner) || '').toUpperCase());
const wkScored = m => ((m.home && m.home.totalPoints) || 0) > 0 || ((m.away && m.away.totalPoints) || 0) > 0;
function weekOver(byWeek, w) {
  const g = byWeek[w];
  if (!g || !g.length) return false;
  if (g.every(wkDecided)) return true;
  if (!g.every(wkScored)) return false;
  return Object.keys(byWeek).some(k => Number(k) > Number(w) && byWeek[k].some(wkScored));
}

/* Which week just finished. The calendar does not decide that and neither does
   a Sunday afternoon scoreboard — ESPN closing the period does. */
async function latestFinishedWeek(season) {
  const d = await espn(`view=mMatchup&view=mSettings&seasonId=${season}`);
  const mpc = d?.settings?.scheduleSettings?.matchupPeriodCount;
  const regEnd = (mpc >= 8 && mpc <= 18) ? mpc : 14;
  const byWeek = {};
  for (const m of (d.schedule || [])) {
    if (!m.home || !m.away) continue;
    const w = Number(m.matchupPeriodId) || 0;
    if (!w || w > regEnd) continue;
    (byWeek[w] || (byWeek[w] = [])).push(m);
  }
  let last = 0;
  for (let w = 1; w <= regEnd; w++) {
    if (!weekOver(byWeek, w)) break;
    last = w;
  }
  return last;
}

async function teamIds(season) {
  const d = await espn(`view=mTeam&seasonId=${season}`);
  return (d.teams || []).map(t => t.id).filter(id => id != null);
}

const week = WEEK_ARG != null ? WEEK_ARG : await latestFinishedWeek(SEASON);
if (!week) { console.log(`${SEASON} – no finished week yet, nothing to archive`); process.exit(0); }

const OUT = path.join(OUT_DIR, `polls-${SEASON}.json`);
let file = { season: Number(SEASON), weeks: {} };
try { file = JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch {}
file.weeks = file.weeks || {};
/* THE NEWEST FINISHED WEEK IS REWRITTEN, OLDER ONES ARE LEFT ALONE.
 *
 * A ballot can be revised right up until the week ends, so the snapshot worth
 * keeping is the last one — and this runs twice, Tuesday and Wednesday, exactly
 * so the second pass can catch a ballot that landed late. Refusing to overwrite
 * would freeze whichever run happened to go first.
 *
 * Weeks behind that one are history and are never touched. Naming a week
 * explicitly needs --force, so a manual run cannot quietly rewrite one. */
const auto = WEEK_ARG == null;
if (file.weeks[week] && !auto && !FORCE) {
  console.log(`${SEASON} week ${week} – already archived, pass --force to replace it`);
  process.exit(0);
}

const ids = await teamIds(SEASON);
if (ids.length < 2) { console.log(`${SEASON} – no teams, skipped`); process.exit(0); }
const known = new Set(ids.map(Number));

const profiles = await loadProfiles();
/* A ballot counts when it ranks every team exactly once. That check alone drops
   the leftover profile documents from when sign-in minted one for any name,
   without this script needing to know which accounts are real. */
const ballots = [];
for (const p of profiles) {
  let b = null;
  try { b = JSON.parse(p[`cp_${SEASON}`] || 'null'); } catch { b = null; }
  if (!Array.isArray(b) || b.length !== ids.length) continue;
  const asNum = b.map(Number);
  if (asNum.some(x => !known.has(x))) continue;
  if (new Set(asNum).size !== asNum.length) continue;
  ballots.push(asNum);
}
if (!ballots.length) { console.log(`${SEASON} week ${week} – no complete ballots, nothing to archive`); process.exit(0); }

/* Average placing, lowest first — the same arithmetic cpTally() runs in the app,
   so the archived standings and the live ones can never disagree. */
const sum = {};
ids.forEach(id => { sum[id] = 0; });
ballots.forEach(b => b.forEach((id, i) => { sum[id] += i + 1; }));
const rank = ids.map(id => ({ teamId: Number(id), avg: +(sum[id] / ballots.length).toFixed(3) }))
  .sort((a, b) => a.avg - b.avg)
  .map((r, i) => ({ rank: i + 1, ...r }));

/* Nothing written when nothing changed, or the twice-weekly run would produce a
   commit every Tuesday and Wednesday whose only difference was the timestamp. */
const entry = { ballots: ballots.length, rank };
if (JSON.stringify(file.weeks[week]) === JSON.stringify(entry)) {
  console.log(`${SEASON} week ${week} – unchanged (${ballots.length} ballots), not rewriting`);
  process.exit(0);
}
file.season = Number(SEASON);
file.savedAt = new Date().toISOString();
file.weeks[week] = entry;
fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(file, null, 1));
console.log(`${SEASON} week ${week} – archived ${ballots.length} ballots, `
  + `${rank.length} teams (${Math.round(fs.statSync(OUT).size / 1024)} KB total)`);
console.log('  ' + rank.slice(0, 3).map(r => `#${r.rank} team ${r.teamId} (${r.avg})`).join('  '));
