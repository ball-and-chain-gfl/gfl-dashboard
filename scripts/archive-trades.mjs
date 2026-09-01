/* Freeze a finished season's trades into /data so the app never asks ESPN for
 * them again.
 *
 *   node scripts/archive-trades.mjs            # the live season, plus any finished one
 *   node scripts/archive-trades.mjs 2026       # one season
 *   node scripts/archive-trades.mjs 2026 force # overwrite one already on file
 *
 * It runs WEEKLY, not once at the end, and it takes the votes with it. A trade
 * and the league's verdict on it are the same record; leaving the verdict in
 * twelve profile fields keyed by a name nobody can reconstruct is how it gets
 * lost. Frozen beside the trade it survives a profile reset, a rename, and any
 * future change to how vote ids are built.
 *
 * ARCHIVING A SEASON THAT IS STILL BEING PLAYED CHANGES HOW THE APP READS IT.
 * histJSON returns the file and stops asking, so a file alone would hide every
 * trade agreed since the last run, and freeze the points totals — which keep
 * growing all season, because a trade is scored on what the players did AFTER
 * it. fetchSeasonTrades therefore reads both for the live season and merges:
 * ESPN for the trade and its running totals, the archive for the votes. See the
 * comment there; the two have to stay in step.
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
/* what Firestore calls the field, once the punctuation is gone */
const voteField = v => 'tv_' + String(v).replace(/[^a-zA-Z0-9_]/g, '_');

/* ── THE VOTES, OFF THE PROFILES ─────────────────────────────────────────────
   Lifted from app.js rather than written out again: a second copy of the
   project id or the key is a second thing to keep in step, and this one is
   already public — it ships in app.js and the profiles collection is
   world-readable. Nothing here writes. */
function dbConfig() {
  const src = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  const m = /const GFL_DB\s*=\s*\{[^}]*project\s*:\s*'([^']+)'[^}]*key\s*:\s*'([^']+)'/.exec(src);
  return m ? { project: m[1], key: m[2] } : null;
}
async function readProfiles() {
  const db = dbConfig();
  if (!db) { console.log('  ! could not read GFL_DB out of app.js — votes will not be archived'); return null; }
  const url = `https://firestore.googleapis.com/v1/projects/${db.project}/databases/(default)`
    + `/documents/profiles?key=${db.key}&pageSize=300`;
  for (let a = 0; a < 3; a++) {
    try {
      const r = await fetch(url);
      if (r.ok) {
        const j = await r.json();
        return (j.documents || []).map(d => ({
          id: decodeURIComponent((d.name || '').split('/').pop() || ''),
          fields: d.fields || {},
        }));
      }
      if (r.status >= 500) { await new Promise(s => setTimeout(s, 1500)); continue; }
      return null;
    } catch { await new Promise(s => setTimeout(s, 1500)); }
  }
  return null;
}
/* {voterId: side} for one trade. Stored by voter rather than as a tally so the
   app can UNION it with whatever the live profiles say without counting anybody
   twice — a vote cannot be changed once cast, so the two can only agree. */
function votesFor(profiles, season, tr) {
  const field = voteField(voteId(season, tr));
  const out = {};
  (profiles || []).forEach(p => {
    const v = p.fields[field];
    const side = v && (v.stringValue ?? v.integerValue ?? v.doubleValue);
    if (side != null && String(side).trim()) out[p.id] = String(side).trim();
  });
  return out;
}

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
  if (!sched.length) return { done: false, why: 'no schedule to check', played: 0 };
  const scored = m => (m.home.totalPoints || 0) > 0 || (m.away.totalPoints || 0) > 0;
  const unplayed = sched.filter(m => !scored(m));

  /* How many fantasy weeks are FINISHED — every fixture in them scored. Counted
     from week 1 and stopped by the first hole, the same way bucksWeeksPlayed
     does it in the app, so a half-scored week never counts as played. */
  const byWeek = {};
  sched.forEach(m => { const w = m.matchupPeriodId; (byWeek[w] || (byWeek[w] = [])).push(m); });
  let played = 0;
  for (let w = 1; byWeek[w]; w++) {
    if (!byWeek[w].every(scored)) break;
    played = w;
  }

  return unplayed.length
    ? { done: false, why: `${unplayed.length} of ${sched.length} games unplayed`, played }
    : { done: true, played };
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
const profiles = await readProfiles();
console.log(profiles ? `profiles read: ${profiles.length}` : 'profiles unavailable — votes not archived');

for (const season of seasons) {
  const file = path.join(OUT, `trades-${season}.json`);
  const have = fs.existsSync(file);
  const fin = await seasonFinished(season);

  /* ── A FINISHED SEASON IS WRITTEN ONCE. THE LIVE ONE IS WRITTEN WEEKLY ────
     A season that has ended cannot gain a trade or a vote, so re-fetching it
     every week is noise — and re-writing it is a chance to break something
     that was already right. It is skipped once it is on file.

     The season being played is the opposite: it gains a trade whenever one is
     agreed and a vote whenever somebody taps, and the whole point of running
     weekly is to catch those while ESPN still serves the log. So it is written
     every time, and the app merges it with the live feed rather than treating
     it as the final word. */
  if (have && fin.done && !force) { console.log(`${season} – finished and already archived`); continue; }

  /* ── NOTHING IS FROZEN BEFORE THERE IS ANYTHING TO FREEZE ─────────────────
     A season with no completed week has no settled trade in it: the points on
     every trade are zero, because they are what the players scored AFTER it and
     nothing has been scored. Snapshotting that writes a file full of noughts,
     and puts a second source in front of a season the app could simply have
     read live.

     So the live season waits for week 1 to be final. From then on it is
     snapshotted weekly, which is the point — the votes and the trades want
     keeping while ESPN still serves them. */
  if (!fin.done && !force && !(fin.played > 0)) {
    console.log(`${season} – no completed week yet, nothing worth freezing`);
    continue;
  }
  if (!fin.done && !have) console.log(`${season} – live season, first snapshot (week ${fin.played} final)`);

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

  /* ── THE TRADE VERBATIM, THE VOTES UNIONED ───────────────────────────────
     The trade is written exactly as the API sent it, because the vote id is
     built out of its fields and any tidying renames it.

     The votes are merged rather than replaced. Firestore is the live record and
     normally has everything, but a read that half-failed, a profile deleted, or
     a manager whose account was renamed would otherwise quietly delete verdicts
     that were already safely on file. A vote cannot be changed once cast, so a
     union can only ever be right: what is on disk stays, and anything new is
     added on top. */
  let prior = {};
  if (have) {
    try {
      const old = JSON.parse(fs.readFileSync(file, 'utf8'));
      ((old && old.trades) || []).forEach(t => { prior[voteId(season, t)] = t.votes || {}; });
    } catch {}
  }
  let added = 0, kept = 0;
  d.trades.forEach(t => {
    const id = voteId(season, t);
    const was = prior[id] || {};
    const now = profiles ? votesFor(profiles, season, t) : {};
    const merged = { ...was, ...now };
    Object.keys(was).forEach(k => { if (!(k in now)) kept++; });
    Object.keys(now).forEach(k => { if (!(k in was)) added++; });
    if (Object.keys(merged).length) t.votes = merged;
  });

  /* whose crest goes under which side. A manager's team does not change within
     a season, so one map for the file rather than a teamId on every vote — and
     it is what lets the trades tab draw the crests without the profiles
     collection being loaded at all. */
  if (profiles) {
    const voters = {};
    profiles.forEach(p => {
      const t = p.fields.teamId;
      const v = t && (t.integerValue ?? t.stringValue ?? t.doubleValue);
      if (v != null && String(v).trim()) voters[p.id] = Number(v) || 0;
    });
    if (Object.keys(voters).length) d.voters = { ...(d.voters || {}), ...voters };
  }

  fs.writeFileSync(file, JSON.stringify(d));
  wrote++;
  const totalVotes = d.trades.reduce((n, t) => n + Object.keys(t.votes || {}).length, 0);
  console.log(`    votes: ${totalVotes} on file (${added} new`
    + (kept ? `, ${kept} kept that Firestore no longer had` : '') + ')');
  const ids = d.trades.map(t => voteId(season, t));
  const dupes = ids.filter((v, i) => ids.indexOf(v) !== i);
  console.log(`${season} – trades-${season}.json written (${d.trades.length} trades, source: ${d.source})`);
  if (dupes.length) {
    console.log(`    note: ${new Set(dupes).size} vote id(s) are shared by more than one trade —`);
    console.log('    two trades between the same pair in the same week collapse onto one tally.');
  }
}
console.log(wrote ? `done — ${wrote} file(s) written` : 'done — nothing to write');
