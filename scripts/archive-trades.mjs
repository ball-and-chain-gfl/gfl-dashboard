/* Freeze a finished season's trades into /data so the app never asks ESPN for
 * them again.
 *
 *   node scripts/archive-trades.mjs            # every season that has finished
 *   node scripts/archive-trades.mjs 2026       # one season
 *   node scripts/archive-trades.mjs 2026 force # overwrite one already on file
 *
 * WHY THIS HAS TO EXIST. /data/trades-2022..2025.json were made by hand. The
 * app reads the archive first and only falls back to the API, so a season with
 * no file goes to ESPN on every page load for ever — and ESPN deletes the
 * detailed trade log when a season ends, so the answer degrades from the real
 * log to a reconstruction the moment nobody is looking.
 *
 * ── THE THING THAT WILL BITE ────────────────────────────────────────────────
 * A trade's VOTE lives on each manager's profile under a field named after the
 * trade, built by ntTradeVoteId in app.js:
 *
 *     td:<season>:<teamIds joined by ->:<date>      ->  tv_td_2026_2_3_178810…
 *
 * The date is part of the name. The 2026 payload carries one; the hand-made
 * 2022-2025 files do not, which is why their vote ids end in a bare colon. So
 * an archiver that "tidied" the payload — dropped `date`, reordered `teams`,
 * renumbered anything — would rename every vote field and silently orphan every
 * vote already cast. There are seven on one 2026 trade already.
 *
 * Hence: the payload is written VERBATIM, and before overwriting anything the
 * vote ids are computed both ways and compared. If a single one would move, the
 * write is refused. Nothing here is worth losing a league vote over.
 */
import fs from 'fs';
import path from 'path';

const BASE = 'https://gfl-dashboard.vercel.app/api/espn';
const OUT = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', 'public', 'data');

const argv = process.argv.slice(2);
const only = argv.find(a => /^\d{4}$/.test(a)) || null;
const force = argv.includes('force') || argv.includes('--force');

const get = async q => {
  for (let a = 0; a < 3; a++) {
    try {
      const r = await fetch(`${BASE}?${q}`);
      if (r.ok) return await r.json();
      if (r.status >= 500) { await new Promise(s => setTimeout(s, 1500)); continue; }
      return null;
    } catch { await new Promise(s => setTimeout(s, 1500)); }
  }
  return null;
};

/* The same string app.js builds. Kept deliberately literal rather than tidied:
   this is the one function here that must not drift from the app, because it
   names the field a vote is stored in. */
const voteId = (season, tr) => {
  const teams = tr.teams || [];
  return `td:${season}:${tr.id || teams.map(t => t.teamId).join('-') + ':' + (tr.date || '')}`;
};

/* ── HAS THE SEASON FINISHED? ────────────────────────────────────────────────
   Every scheduled game carries points. The same test archive-season.mjs makes,
   and for the same reason: a season still being played must keep going to the
   API, because more trades are coming.

   It asks ESPN when there is no season file, and that is not a fallback — it is
   the path that matters. season-YYYY.json is only ever READ in this repo;
   nothing writes one, so 2022-2025 were made by hand and 2026 has none. Gating
   on a file nobody creates would mean this script skipped the only season it
   was written to catch, quietly, for ever. */
async function seasonFinished(season) {
  const sf = path.join(OUT, `season-${season}.json`);
  let sched = null;
  if (fs.existsSync(sf)) {
    try { sched = (JSON.parse(fs.readFileSync(sf, 'utf8')).schedule) || []; } catch {}
  }
  if (!sched) {
    const live = await get(`view=mMatchup&view=mTeam&view=mSettings&seasonId=${season}`);
    if (!live) return { done: false, why: 'could not read the schedule' };
    sched = live.schedule || [];
  }
  sched = sched.filter(m => m && m.home && m.away && (m.matchupPeriodId || 0) > 0);
  if (!sched.length) return { done: false, why: 'no schedule to check' };
  const unplayed = sched.filter(m => !((m.home.totalPoints || 0) > 0 || (m.away.totalPoints || 0) > 0));
  return unplayed.length
    ? { done: false, why: `${unplayed.length} of ${sched.length} games unplayed` }
    : { done: true };
}

/* The NFL season a date belongs to — a year runs March to March, so January
   still belongs to the season that started the previous autumn. Matches
   nflSeasonYear() in app.js; a January run must look at last year, which is
   precisely the run that catches a season the moment it ends. */
function nflSeasonYear(d = new Date()) {
  return d.getMonth() >= 2 ? d.getFullYear() : d.getFullYear() - 1;
}

const seasons = only ? [only] : (() => {
  const out = new Set();
  for (const f of fs.readdirSync(OUT)) {
    const m = /^season-(\d{4})\.json$/.exec(f);
    if (m) out.add(m[1]);
  }
  /* the season being played has no season file and would otherwise never be
     looked at — which is the whole point of running this */
  out.add(String(nflSeasonYear()));
  return [...out].sort();
})();

let wrote = 0;
for (const season of seasons) {
  const file = path.join(OUT, `trades-${season}.json`);
  const have = fs.existsSync(file);

  if (have && !force) { console.log(`${season} – already archived`); continue; }

  const fin = await seasonFinished(season);
  if (!fin.done && !force) { console.log(`${season} – still live (${fin.why}), skipped`); continue; }

  const d = await get(`type=seasontrades&seasonId=${season}&v=3`);
  if (!d || !Array.isArray(d.trades)) { console.log(`${season} – no trades payload, skipped`); continue; }
  if (d.source === 'error') { console.log(`${season} – API reported an error, skipped`); continue; }

  /* An empty list is a legitimate answer — a season can have no trades — but it
     is also exactly what a broken fetch looks like, and writing it would freeze
     "no trades ever happened" in place for good. Only a deliberate force does
     that. */
  if (!d.trades.length && !force) {
    console.log(`${season} – payload has no trades; refusing to freeze an empty season without force`);
    continue;
  }

  /* ── NO VOTE MAY BE ORPHANED ─────────────────────────────────────────────
     Recomputing the ids off the file already on disk and off what is about to
     replace it. Any difference renames a field on twelve profiles and loses
     whatever was voted into it. */
  if (have) {
    let old = null;
    try { old = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
    const before = new Set(((old && old.trades) || []).map(t => voteId(season, t)));
    const after = new Set(d.trades.map(t => voteId(season, t)));
    const lost = [...before].filter(v => !after.has(v));
    if (lost.length) {
      console.log(`${season} – REFUSED: ${lost.length} vote id(s) would be orphaned:`);
      lost.forEach(v => console.log(`    ${v}`));
      continue;
    }
  }

  /* Verbatim. Whatever the API sent is what the app read while the season was
     live, and the vote ids are built out of it. */
  fs.writeFileSync(file, JSON.stringify(d));
  wrote++;
  const ids = d.trades.map(t => voteId(season, t));
  const dupes = ids.filter((v, i) => ids.indexOf(v) !== i);
  console.log(`${season} – trades-${season}.json written (${d.trades.length} trades, source: ${d.source})`);
  if (dupes.length) {
    console.log(`    note: ${new Set(dupes).size} vote id(s) are shared by more than one trade —`);
    console.log('    two trades between the same pair in the same week collapse onto one tally.');
  }
}
console.log(wrote ? `done — ${wrote} file(s) written` : 'done — nothing to write');
