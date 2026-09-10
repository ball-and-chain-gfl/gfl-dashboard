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
 * WHAT IT RECORDS, it records on a clock rather than on events: one reading per
 * five minute bucket for as long as a matchup has somebody in its starting
 * lineup on the field, whether or not the score moved. A stretch of two evenly
 * matched teams trading nothing is a real part of the story of a matchup and
 * has to take up its real share of the panel. The rule, the bucket size and
 * the on-the-field test are all lifted out of app.js below rather than
 * restated, so the browser and this cannot disagree about them -- see WHEN A
 * READING IS WORTH TAKING over there.
 */
import fs from 'fs';
import { lifter, assemble } from './lib/lift.mjs';

const BASE = process.env.GFL_BASE || 'https://gfl-dashboard.vercel.app/api/espn';
const LOOP = Number(process.env.LOOP || 0);          // seconds to keep going; 0 = once
const EVERY = Number(process.env.EVERY || 60) * 1000;        // while football is on
/* Five minutes while nothing is being played. A run starts before kickoff on
   purpose (see the workflow), and sixty second polling through two hours of
   pregame is a hundred and twenty requests to learn nothing. */
const IDLE_EVERY = Number(process.env.IDLE_EVERY || 300) * 1000;
/* How long a watch waits before giving up. Two and a half hours if it has
   never seen a game -- enough to start well before kickoff and absorb a
   scheduler that runs late -- and forty five minutes after the last live
   check, which is the football being over rather than a lull. */
const NO_GAME_MS = Number(process.env.NO_GAME_MIN || 150) * 60000;
const AFTER_GAME_MS = Number(process.env.AFTER_GAME_MIN || 45) * 60000;
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
  /* the recording rule, so it is the same rule in both places */
  'const BENCH_SLOTS=',
  'const NFL_TEAMS=',
  'const LIVE_BUCKET_MIN=',
  'const liveBucket=',
  'const liveProTeams=',
  'const liveSideOn=',
  'const liveMatchupOn=',
  'function liveSideScore(side){',
  'function liveWithScores(m){',
  'const liveProProgress=',
  'const LIVE_VOLUME=',
  'const LIVE_USAGE_R=',
  'const liveUsageW=',
  'function liveScoreLine(line,rules){',
  'function livePlayerLeft(entry,f,rules){',
  'function liveSideLeft(side,prog,rules){',
  'function liveWpOf(m,aFirst){',
  'function liveNote(arr,t,a,b,p,la,lb){',
], ['weekScored', 'weekOver', 'weeksOf', 'liveMKey',
    'liveBucket', 'liveProTeams', 'liveMatchupOn', 'liveNote', 'liveWpOf',
    'liveSideScore', 'liveWithScores', 'liveProProgress', 'liveSideLeft']);

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
  /* mMatchupScore rides along: it carries winProbability, and a reading
     without one is a point the graph has to guess at later. */
  const fresh = await get(`view=mMatchup&view=mMatchupScore`
    + `&seasonId=${season}&scoringPeriodId=${week}&live=1`);
  const games = ((fresh && fresh.schedule) || meta.schedule || [])
    .filter(m => (m.matchupPeriodId || 0) === week && m.home && m.away)
    /* ESPN's matchup total does not move during a game; the starters do. */
    .map(app.liveWithScores);
  if (!games.length) { console.log(`${stamp}  week ${week} has no fixtures — skipping`); return 'skip'; }

  const key = `${season}-w${week}`;
  const series = await loadSeries(key);
  if (series == null) { console.log(`${stamp}  could not read ${key} — skipping`); return 'skip'; }

  /* the pro teams with a game in progress this minute, straight off the digest
     that got us past the gate above -- no second request for it */
  const onField = app.liveProTeams(state);
  const proProg = app.liveProProgress(state);
  /* the league's own statId -> points, so a re-projected stat line is scored
     exactly the way ESPN scores it */
  const rules = {};
  ((meta.settings?.scoringSettings?.scoringItems) || []).forEach(it => {
    const p = (it && it.points != null) ? Number(it.points) : 0;
    if (it && it.statId != null && isFinite(p) && p !== 0) rules[it.statId] = p;
  });
  const t = app.liveBucket(Date.now());
  let changed = 0, on = 0;
  games.forEach(m => {
    const ao = owners[m.home.teamId], bo = owners[m.away.teamId];
    if (!ao || !bo) return;
    const k = app.liveMKey(ao, bo);
    const aFirst = [ao, bo].sort()[0] === ao;
    const a = aFirst ? (m.home.totalPoints || 0) : (m.away.totalPoints || 0);
    const b = aFirst ? (m.away.totalPoints || 0) : (m.home.totalPoints || 0);
    const arr = series[k];
    const live = app.liveMatchupOn(m, onField);
    if (live) on++;
    /* a moved score is the second way in: the stat correction that lands after
       the last whistle, and the minutes when nobody looks live but is */
    const moved = !!arr && arr.length
      && (arr[arr.length - 1][1] !== a || arr[arr.length - 1][2] !== b);
    if (!live && !moved) return;
    const sA = aFirst ? m.home : m.away, sB = aFirst ? m.away : m.home;
    if (app.liveNote(arr || (series[k] = []), t, a, b, app.liveWpOf(m, aFirst),
      app.liveSideLeft(sA, proProg, rules), app.liveSideLeft(sB, proProg, rules))) changed++;
  });

  if (!changed) {
    console.log(`${stamp}  week ${week}: ${on} matchup${on === 1 ? '' : 's'} on the field`
      + `, nothing new to record`);
    return 'nochange';
  }
  /* a merge writer has to leave the order it found: a browser's minutes and
     these can interleave, and the curve is drawn in array order */
  Object.keys(series).forEach(k => series[k].sort((x, y) => x[0] - y[0]));
  if (DRY) { console.log(`${stamp}  week ${week}: ${changed} moved (DRY RUN)`); return 'dry'; }
  const ok = await saveSeries(key, series);
  console.log(`${stamp}  week ${week}: ${on} on the field, ${changed} recorded`
    + `, ${Object.keys(series).length} tracked — ${ok ? 'written' : 'WRITE FAILED'}`);
  return ok ? 'wrote' : 'failed';
}

if (!LOOP) {
  const r = await once();
  process.exit(r === 'failed' ? 1 : 0);
} else {
  /* ── A WATCH, NOT A TICK ──────────────────────────────────────────────────
     This was built as a five minute tick and that was the wrong shape for the
     thing running it. GitHub's scheduler is best effort, and in this repo it
     is late by HOURS, not minutes -- on one ordinary Wednesday
     archive-transactions fired 3h25m after its cron, settle-bets 4h21m, the
     price freezer 4h14m, and the trade archive ran on the wrong DAY. The night
     this was written the poller's own window opened at 00:00 UTC and had not
     fired once by 00:24. Nothing built on a punctual cron survives that, and
     adding more cron entries does not help: they are all late together.

     So a run is not a tick, it is a WATCH. Whichever of a window's crons lands
     first -- on time, or three hours late -- stays awake for the rest of the
     night and keeps its own clock, which is a clock GitHub cannot be late for.
     The concurrency group in the workflow keeps the later ones queued behind
     it rather than piling up, and they find the football over and leave in
     minutes.

     Two ways it gives up, and they are different questions. Having never seen
     a game it waits NO_GAME_MS -- long enough to have started before kickoff
     and still be there when it comes. Having seen one it waits AFTER_GAME_MS
     from the last live check, which is long enough that a gap between the
     afternoon and evening windows does not read as the day being over. */
  const until = Date.now() + LOOP * 1000;
  console.log(`watching until ${new Date(until).toISOString().slice(11, 16)}Z`
    + ` — ${EVERY / 1000}s while live, ${IDLE_EVERY / 1000}s while not`);
  const started = Date.now();
  let sawLive = false, lastLive = 0, r = null;
  while (Date.now() < until) {
    r = await once();
    /* 'skip' is ESPN being unreachable, which is not an answer either way: it
       neither proves a game is on nor that one is over, so it moves nothing. */
    if (r !== 'idle' && r !== 'skip') { sawLive = true; lastLive = Date.now(); }
    const quiet = Date.now() - (sawLive ? lastLive : started);
    const grace = sawLive ? AFTER_GAME_MS : NO_GAME_MS;
    if (quiet >= grace) {
      console.log(sawLive
        ? `no football for ${Math.round(quiet / 60000)} minutes — the night is over`
        : `nothing has kicked off in ${Math.round(quiet / 60000)} minutes — standing down`);
      break;
    }
    const left = until - Date.now();
    if (left <= 0) break;
    await new Promise(res => setTimeout(res, Math.min(r === 'idle' ? IDLE_EVERY : EVERY, left)));
  }
  console.log('watch closed');
}
