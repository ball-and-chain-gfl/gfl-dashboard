/* THE LIVE SCOREBOARD, POLLED BY SOMETHING THAT IS ALWAYS AWAKE.
 *
 * The win-probability curve on Your Forecast is built from _liveSeries: a list
 * of [minute, a, b] readings per matchup, written to one Firestore document per
 * week. Until now the only thing that ever wrote it was a BROWSER — livePoll,
 * running on a timer in whoever happened to have the site open. Which means the
 * curve had a hole in it for every stretch of Sunday afternoon when nobody was
 * looking, and the shape of a game depended on who was watching it.
 *
 * This does the same job from a cron. It writes into the same document, in the
 * same shape, keyed the same way, and MERGES rather than overwrites — so a
 * browser and this can both be running and neither loses the other's minutes.
 *
 *   node scripts/poll-live.mjs           # poll once and exit
 *   LOOP=21600 node scripts/poll-live.mjs   # poll every 60s for six hours
 *
 * IT DOES NOTHING WHEN NO FOOTBALL IS BEING PLAYED. The first thing it asks is
 * whether any NFL game is live; if not it exits without touching ESPN's matchup
 * feed or Firestore at all. That is not just politeness about quota -- a
 * reading taken when nothing is moving is a point on the graph at a moment
 * nothing happened, and enough of those turn the shape of an afternoon into a
 * staircase of flat steps.
 *
 * Even when it does run, a reading is only appended if a score actually CHANGED
 * since the last one, which is the same rule livePoll uses.
 */
import fs from 'fs';
import { lifter, assemble } from './lib/lift.mjs';

const BASE = process.env.GFL_BASE || 'https://gfl-dashboard.vercel.app/api/espn';
const LOOP = Number(process.env.LOOP || 0);          // seconds to keep going; 0 = once
const EVERY = Number(process.env.EVERY || 60) * 1000;
const DRY = !!process.env.DRY_RUN;
/* Only for checking the thing works before a real kickoff -- it skips the
   is-anything-live gate. Never set in the workflow. */
const FORCE = !!process.env.FORCE;

const APP = new URL('../public/app.js', import.meta.url);
const SRC = fs.readFileSync(APP, 'utf8');
const GFL_DB = new Function(SRC.match(/const GFL_DB=\{[^}]*\}/)[0] + '; return GFL_DB;')();

/* The week rules come out of app.js rather than being restated here. Which week
   is live, and whether a week is over, must be the same answer in both places
   or the poller writes into a document the browser is not reading. */
const grab = lifter(APP);
const app = assemble(grab, [
  'const weekDecided=',
  'const weekScored=',
  'function weeksOf(schedule){',
  'function weekOver(byWeek,w){',
  'const liveMKey=',
], ['weekScored', 'weekOver', 'weeksOf', 'liveMKey']);

const DOC = k => `https://firestore.googleapis.com/v1/projects/${GFL_DB.project}`
  + `/databases/(default)/documents/live/${encodeURIComponent(k)}?key=${GFL_DB.key}`;
const COLL = k => `https://firestore.googleapis.com/v1/projects/${GFL_DB.project}`
  + `/databases/(default)/documents/live?documentId=${encodeURIComponent(k)}&key=${GFL_DB.key}`;

const get = async q => {
  try {
    const r = await fetch(`${BASE}?${q}`, { cache: 'no-store' });
    return r.ok ? await r.json() : null;
  } catch { return null; }
};

const ownerOf = t => t?.primaryOwner || (t?.owners && t.owners[0]) || `team:${t?.id}`;

async function loadSeries(key) {
  try {
    const r = await fetch(DOC(key), { cache: 'no-store' });
    if (r.status === 404) return {};
    if (!r.ok) return null;
    const f = (await r.json()).fields || {};
    try { return JSON.parse((f.series || {}).stringValue || '{}') || {}; } catch { return {}; }
  } catch { return null; }
}

async function saveSeries(key, series) {
  const body = JSON.stringify({ fields: {
    series: { stringValue: JSON.stringify(series) },
    updated: { stringValue: String(Date.now()) },
  } });
  const hdr = { 'Content-Type': 'application/json' };
  const mask = '&updateMask.fieldPaths=series&updateMask.fieldPaths=updated';
  const r = await fetch(DOC(key) + mask, { method: 'PATCH', headers: hdr, body });
  if (r.ok) return true;
  const c = await fetch(COLL(key), { method: 'POST', headers: hdr, body });
  return c.ok;
}

/* the first week that is not finished, exactly as liveWeekInfo picks it */
function liveWeek(schedule, regEnd) {
  const byWeek = {};
  (schedule || []).forEach(m => {
    if (!m.home || !m.away) return;
    const w = m.matchupPeriodId || 0;
    if (!w || w > (regEnd || 14) + 3) return;
    (byWeek[w] || (byWeek[w] = [])).push(m);
  });
  const weeks = Object.keys(byWeek).map(Number).sort((a, b) => a - b);
  let live = null, last = null;
  weeks.forEach(w => {
    if (byWeek[w].some(app.weekScored)) last = w;
    if (live == null && !app.weekOver(byWeek, w)) live = w;
  });
  return live || last || weeks[0] || null;
}

async function once() {
  const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');

  /* ── nothing is being played, so there is nothing to record ─────────────── */
  const state = await get('type=nflstate');
  if (!state) { console.log(`${stamp}  nfl state unavailable — skipping`); return 'skip'; }
  if (!state.anyLive && !FORCE) {
    console.log(`${stamp}  no NFL game live (week ${state.week}) — nothing to poll`);
    return 'idle';
  }
  if (!state.anyLive) console.log(`${stamp}  FORCE: running with nothing live`);

  const season = String(state.season || new Date().getFullYear());
  const meta = await get(`view=mMatchup&view=mTeam&view=mSettings&seasonId=${season}`);
  if (!meta) { console.log(`${stamp}  league data unavailable — skipping`); return 'skip'; }

  const owners = {};
  (meta.teams || []).forEach(t => { owners[t.id] = ownerOf(t); });
  const mpc = meta.settings?.scheduleSettings?.matchupPeriodCount;
  const regEnd = (mpc >= 8 && mpc <= 18) ? mpc : 14;
  const week = liveWeek(meta.schedule, regEnd);
  if (!week) { console.log(`${stamp}  no live week — skipping`); return 'skip'; }

  /* the current minute's scores, from the same feed livePoll reads */
  const fresh = await get(`view=mMatchup&seasonId=${season}&scoringPeriodId=${week}&live=1`);
  const games = ((fresh && fresh.schedule) || meta.schedule || [])
    .filter(m => (m.matchupPeriodId || 0) === week && m.home && m.away);
  if (!games.length) { console.log(`${stamp}  week ${week} has no fixtures — skipping`); return 'skip'; }

  const key = `${season}-w${week}`;
  const series = await loadSeries(key);
  if (series == null) { console.log(`${stamp}  could not read ${key} — skipping`); return 'skip'; }

  const t = Math.round(Date.now() / 60000);        // minute resolution, as livePoll writes it
  let changed = 0;
  games.forEach(m => {
    const ao = owners[m.home.teamId], bo = owners[m.away.teamId];
    if (!ao || !bo) return;
    const k = app.liveMKey(ao, bo);
    const aFirst = [ao, bo].sort()[0] === ao;
    const a = aFirst ? (m.home.totalPoints || 0) : (m.away.totalPoints || 0);
    const b = aFirst ? (m.away.totalPoints || 0) : (m.home.totalPoints || 0);
    if (a === 0 && b === 0) return;                // nothing has happened in that game yet
    const arr = series[k] || (series[k] = []);
    const prev = arr[arr.length - 1];
    if (!prev || prev[1] !== a || prev[2] !== b) { arr.push([t, a, b]); changed++; }
  });

  if (!changed) { console.log(`${stamp}  week ${week} live, no score moved`); return 'nochange'; }
  /* a merge writer has to leave the order it found: a browser's minutes and
     these can interleave, and the curve is drawn in array order */
  Object.keys(series).forEach(k => series[k].sort((x, y) => x[0] - y[0]));
  if (DRY) { console.log(`${stamp}  week ${week}: ${changed} moved (DRY RUN)`); return 'dry'; }
  const ok = await saveSeries(key, series);
  console.log(`${stamp}  week ${week}: ${changed} matchup${changed === 1 ? '' : 's'} moved`
    + `, ${Object.keys(series).length} tracked — ${ok ? 'written' : 'WRITE FAILED'}`);
  return ok ? 'wrote' : 'failed';
}

if (!LOOP) {
  const r = await once();
  process.exit(r === 'failed' ? 1 : 0);
} else {
  /* one job that stays awake, rather than a fresh one every five minutes. The
     cron cannot go finer than five, and GitHub delivers it late under load;
     this gives a steady cadence for as long as the job is allowed to live. */
  const until = Date.now() + LOOP * 1000;
  console.log(`looping every ${EVERY / 1000}s until ${new Date(until).toISOString().slice(11, 16)}Z`);
  let idle = 0;
  while (Date.now() < until) {
    const r = await once();
    /* if the football has finished, stop early rather than burning the window */
    idle = (r === 'idle') ? idle + 1 : 0;
    if (idle >= 20) { console.log('nothing live for 20 checks — ending the window'); break; }
    const left = until - Date.now();
    if (left <= 0) break;
    await new Promise(res => setTimeout(res, Math.min(EVERY, left)));
  }
  console.log('window closed');
}
