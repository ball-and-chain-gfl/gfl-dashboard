/* FREEZE A FINISHED WEEK'S SHARE PRICES AND BETTING RESULT.
 *
 * WHY THIS EXISTS. The portfolio chart replays the share ledger against prices
 * that are RECOMPUTED every time somebody opens it. That is fine while the
 * formula never changes and wrong the moment it does: change how a team is
 * priced — as happened when the roster projection went in — and every point in
 * the chart's history moves with it, including weeks that were settled months
 * ago. A finished week cannot change, so its prices should not either.
 *
 * So once a week is over its price board is written here, into
 * public/data/charts-<season>.json, and the dashboard prices that week off the
 * file from then on. Weeks not yet frozen are still computed live, which is the
 * only way an in-progress week can work.
 *
 * The week's betting result goes in beside it: what each manager won or lost on
 * bets settled in that week. That one is already stable — a settled bet does not
 * re-grade and Firestore refuses to delete one — so it is a record rather than a
 * repair, and it is what lets the bankroll line be read without the database.
 *
 * THE PRICING IS NOT REIMPLEMENTED HERE. invPricesAt and everything under it are
 * lifted out of public/app.js by string match and run as-is, the same way
 * settle-bets.mjs and the test suites do it. Two pricers that agree today would
 * drift apart, and the one nobody watches would be the one quietly freezing the
 * wrong numbers. Rename something it grabs and this breaks loudly, which is the
 * intended failure.
 *
 *   node scripts/archive-charts.mjs             # newest finished week, this year
 *   node scripts/archive-charts.mjs 2026 3      # one specific week
 *   node scripts/archive-charts.mjs 2026 3 --force
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, '..', 'public', 'data');
const BASE = process.env.GFL_BASE || 'https://gfl-dashboard.vercel.app/api/espn';
const PROJECT = process.env.GFL_FB_PROJECT || 'ball-and-chain-dashboard';
const KEY = process.env.GFL_FB_KEY || 'AIzaSyCOfZYqsD3VZmym7AW0DDX_JQnBYCZhJDA';

const args = process.argv.slice(2).filter(a => a !== '--force');
const FORCE = process.argv.includes('--force');
const SEASON = String(args[0] || new Date().getFullYear());
const WEEK_ARG = args[1] ? Number(args[1]) : null;

const SRC = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8')
  .split(String.fromCharCode(13)).join('');
const CFG = fs.readFileSync(new URL('../public/config.js', import.meta.url), 'utf8');

/* Like the grab() in settle-bets, but it counts SQUARE brackets too. That one
   tracks braces alone, which is right for a function and wrong for an array of
   objects: INV_FUNDS opens with `[`, and a brace-only walk stops at the close of
   its first entry and hands back half a declaration. */
function grab(startsWith) {
  const i = SRC.indexOf(startsWith);
  if (i < 0) throw new Error('archive-charts: cannot find "' + startsWith + '" in app.js');
  let j = i, depth = 0, started = false;
  for (; j < SRC.length; j++) {
    const c = SRC[j];
    if (c === '{' || c === '[') { depth++; started = true; }
    else if (c === '}' || c === ']') { depth--; if (started && depth === 0) { j++; break; } }
    else if (c === ';' && !started && depth === 0) { j++; break; }
  }
  return SRC.slice(i, j);
}

const get = async q => {
  for (let a = 0; a < 3; a++) {
    try {
      const r = await fetch(`${BASE}?${q}`);
      if (r.ok) return await r.json();
      if (r.status < 500) return null;
    } catch {}
    await new Promise(s => setTimeout(s, 1500));
  }
  return null;
};

// ── the league, as the browser would have it ────────────────────────────────
const seasonData = await get(`view=mMatchup&view=mTeam&view=mSettings&seasonId=${SEASON}`);
if (!seasonData) { console.error(`${SEASON} – season data unavailable`); process.exit(1); }
const ownerOf = t => t?.primaryOwner || (t?.owners && t.owners[0]) || `team:${t?.id}`;
const owners = {}, teamsMeta = {}, divisions = seasonData.settings?.scheduleSettings?.divisions || {};
(seasonData.teams || []).forEach(t => {
  const o = ownerOf(t);
  owners[t.id] = o;
  teamsMeta[t.id] = { name: (t.name || '').trim(), owner: o, div: t.divisionId ?? 0 };
});
const franchises = (seasonData.teams || []).map(t => ({ owner: ownerOf(t), name: (t.name || '').trim(), teamId: t.id }));
const mpc = seasonData.settings?.scheduleSettings?.matchupPeriodCount;
const REG_END = (mpc >= 8 && mpc <= 18) ? mpc : 14;

function latestFinishedWeek() {
  const byWeek = {};
  (seasonData.schedule || []).forEach(m => {
    if (!m.home || !m.away) return;
    const w = Number(m.matchupPeriodId) || 0;
    if (!w || w > REG_END) return;
    (byWeek[w] || (byWeek[w] = [])).push(m);
  });
  let last = 0;
  for (let w = 1; w <= REG_END; w++) {
    const g = byWeek[w];
    if (!g || !g.length) break;
    if (!g.every(m => (m.home.totalPoints || 0) > 0 || (m.away.totalPoints || 0) > 0)) break;
    last = w;
  }
  return last;
}
const week = WEEK_ARG != null ? WEEK_ARG : latestFinishedWeek();
if (!week) { console.log(`${SEASON} – no finished week yet, nothing to freeze`); process.exit(0); }

const OUT = path.join(OUT_DIR, `charts-${SEASON}.json`);
let file = { season: Number(SEASON), weeks: {} };
try { file = JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch {}
file.weeks = file.weeks || {};
const auto = WEEK_ARG == null;
if (file.weeks[week] && !auto && !FORCE) {
  console.log(`${SEASON} week ${week} – already frozen, pass --force to replace it`);
  process.exit(0);
}

// ── the roster feed and player pool the pricer reads ────────────────────────
const rosterRaw = await get(`view=mRoster&seasonId=${SEASON}&scoringPeriodId=${week}&live=1`);
const pool = await get(`type=pool&seasonId=${SEASON}&limit=700`);
const BENCH = [20, 21, 24];
const rosters = {};
((rosterRaw && rosterRaw.teams) || []).forEach(t => {
  rosters[t.id] = ((t.roster && t.roster.entries) || []).map(e => {
    const pl = (e.playerPoolEntry && e.playerPoolEntry.player) || {};
    return { pid: e.playerId, n: pl.fullName || null, slot: e.lineupSlotId,
      pos: pl.defaultPositionId || 0, wkProj: null, wkAct: null };
  });
});

// ── run the real pricer ─────────────────────────────────────────────────────
const harness = `
${CFG}
const _CFG = window.GFL_CONFIG || {};
const _seasonMeta = ${JSON.stringify({ [SEASON]: {
  owners, teams: teamsMeta, divisions,
  schedule: seasonData.schedule || [],
  slots: seasonData.settings?.rosterSettings?.lineupSlotCounts || null,
} })};
const _franchises = ${JSON.stringify(franchises)};
const _bkPools = ${JSON.stringify({ [String(SEASON)]: (pool && pool.players) || [] })};
const _sbRosters = ${JSON.stringify({ [SEASON + ':' + week]: rosters })};
const BENCH_SLOTS = ${JSON.stringify(BENCH)};
function sbBoardSeason(){ return ${JSON.stringify(String(SEASON))}; }
function sbRosters(season,wk){ return _sbRosters[String(season)+':'+wk] || _sbRosters[${JSON.stringify(String(SEASON) + ':' + week)}] || null; }
function bkLoadPool(){}
/* invPricesAt short-circuits to a frozen board when one exists. THE FREEZER MUST
   NEVER TAKE THAT PATH: reading its own output would re-freeze a frozen number
   and the first mistake would be permanent. It always computes. */
function frozenPrices(){ return null; }
${grab('const LINEUP_SHAPE_FALLBACK=')}
${grab('function sbSlotShape(')}
${grab('function sbBestLineup(')}
${grab('function rosterProjByOwner(')}
${grab('const INV_BASE=')}
${grab('const INV_FORM_WEEKS=')}
${grab('const INV_PROJ_MAX=')}
${grab('const INV_PROJ_MIN=')}
${grab('const INV_PROJ_FULL=')}
${grab('const INV_PROJ_POW=')}
${grab('const INV_FUNDS=')}
${grab('function invFundMembers(')}
${grab('function invStats(')}
${grab('function invPricesAt(')}
module.exports = { invPricesAt, rosterProjByOwner, invStats };
`;
const window = { GFL_CONFIG: null };
const mod = { exports: {} };
new Function('module', 'window', harness)(mod, window);
if (process.env.GFL_DEBUG) {
  const pj = mod.exports.rosterProjByOwner(String(SEASON), week);
  console.log('projections:', Object.entries(pj).sort((a, b) => b[1] - a[1])
    .map(([o, v]) => `${(franchises.find(f => f.owner === o) || {}).name || o}=${Math.round(v)}`).join('  '));
}
const prices = mod.exports.invPricesAt(String(SEASON), week);
if (!prices || !Object.keys(prices).length) {
  console.error(`${SEASON} week ${week} – pricer returned nothing`); process.exit(1);
}

// ── what the league's bets did in that week ─────────────────────────────────
const listUrl = `https://firestore.googleapis.com/v1/projects/${PROJECT}`
  + `/databases/(default)/documents/bets?key=${KEY}&pageSize=1000`;
function fsIn(doc) {
  const out = {};
  for (const [k, v] of Object.entries((doc && doc.fields) || {})) {
    out[k] = v.stringValue !== undefined ? v.stringValue
      : v.integerValue !== undefined ? Number(v.integerValue)
      : v.doubleValue !== undefined ? Number(v.doubleValue) : null;
  }
  return out;
}
const bets = {};
try {
  const r = await fetch(listUrl);
  if (r.ok) {
    const j = await r.json();
    const cut = Number((window.GFL_CONFIG || {}).betsResetBefore) || 0;
    (j.documents || []).map(d => fsIn(d)).forEach(b => {
      if (String(b.season || '') !== String(SEASON)) return;
      if ((Number(b.ts) || 0) < cut) return;
      const st = String(b.status || '');
      if (st === 'open' || st === 'invite' || st === 'declined' || st === 'void') return;
      const o = String(b.owner || ''); if (!o) return;
      bets[o] = +((bets[o] || 0) + ((Number(b.ret) || 0) - (Number(b.stake) || 0))).toFixed(2);
    });
  }
} catch {}

const entry = { prices, bets };
if (JSON.stringify(file.weeks[week]) === JSON.stringify(entry)) {
  console.log(`${SEASON} week ${week} – unchanged, not rewriting`);
  process.exit(0);
}
file.season = Number(SEASON);
file.savedAt = new Date().toISOString();
file.weeks[week] = entry;
fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(file, null, 1));
const top = Object.entries(prices).filter(([k]) => !/^ETF_/.test(k))
  .sort((a, b) => b[1] - a[1]).slice(0, 3)
  .map(([o, p]) => `${(franchises.find(f => f.owner === o) || {}).name || o} $${p}`);
console.log(`${SEASON} week ${week} – froze ${Object.keys(prices).length} prices `
  + `and ${Object.keys(bets).length} betting results (${Math.round(fs.statSync(OUT).size / 1024)} KB)`);
console.log('  ' + top.join('  ·  '));
