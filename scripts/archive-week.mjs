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
import { lifter, assemble } from './lib/lift.mjs';

/* What a sealed result looks like, and how one goes last, from app.js -- the
   recorders and this have to agree on it or the curve will not land. */
const live = assemble(lifter(new URL('../public/app.js', import.meta.url)), [
  'const LIVE_BUCKET_MIN=', 'function liveFinalRow(t,a,b){', 'const liveRowFinal=',
  'function liveSeal(arr,row){',
], ['LIVE_BUCKET_MIN', 'liveFinalRow', 'liveRowFinal', 'liveSeal']);

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
  const done = Object.keys(byWeek).map(Number).filter((w) => weekOver(byWeek, w));
  return done.length ? Math.max(...done) : null;
}

/* ESPN's closed scores for one week, keyed the way the series is: the two
   owners sorted and joined, the first owner's score first. Only fixtures ESPN
   has actually decided -- an UNDECIDED one has no result to write. */
async function officialResults(season, week) {
  const r = await fetch(`${API}?view=mMatchup&view=mTeam&seasonId=${season}`);
  if (!r.ok) throw new Error(`ESPN ${r.status}`);
  const j = await r.json();
  const ownerOf = t => t?.primaryOwner || (t?.owners && t.owners[0]) || `team:${t?.id}`;
  const owner = {};
  for (const t of j.teams || []) owner[t.id] = ownerOf(t);
  const out = {};
  for (const m of j.schedule || []) {
    if (!m.home || !m.away || (m.matchupPeriodId || 0) !== Number(week) || !wkDecided(m)) continue;
    const ho = owner[m.home.teamId], ao = owner[m.away.teamId];
    if (!ho || !ao) continue;
    const homeFirst = [ho, ao].sort()[0] === ho;
    const hp = Number(m.home.totalPoints) || 0, ap = Number(m.away.totalPoints) || 0;
    out[[ho, ao].sort().join('~')] = homeFirst ? [hp, ap] : [ap, hp];
  }
  return out;
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

  /* ── THE RECORD ENDS ON THE OFFICIAL RESULT ──────────────────────────────
     The recorders seal a week with the scores as they stood at the last
     whistle. ESPN closes the scoring period a day or so later, with the stat
     corrections in, and that is the result that stands -- in a week BFT won
     by 0.66 a correction can change who won. This only runs once ESPN has
     closed the week, so these are the final numbers, and they go in as the
     last reading: in place of the sealed one where there is a seal, and one
     bucket after the last reading where the recorders never got to seal it. */
  const official = await officialResults(season, week);
  let sealed = 0;
  for (const [k, ab] of Object.entries(official)) {
    const arr = series[k];
    if (!arr || !arr.length) continue;           // never recorded: nothing to end
    const last = arr[arr.length - 1];
    const t = live.liveRowFinal(last) ? last[0] : last[0] + live.LIVE_BUCKET_MIN;
    live.liveSeal(arr, live.liveFinalRow(t, ab[0], ab[1]));
    sealed++;
  }
  if (sealed) console.log(`${key}: ${sealed} matchups end on ESPN's official result.`);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(series) + '\n');
  const samples = Object.values(series).reduce((a, v) => a + v.length, 0);
  console.log(`Archived ${key}: ${Object.keys(series).length} matchups, ${samples} samples.`);
}

main().catch((e) => { console.error(e.message || e); process.exitCode = 1; });
