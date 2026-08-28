/* SETTLE EVERY BET IN THE LEAGUE, WHETHER OR NOT ANYONE OPENS THE SPORTSBOOK.
 *
 * Settlement in the browser is lazy and personal: betSettleAll runs when a
 * manager opens the book, over the bets betList fetched — which is a query by
 * owner, so it is that manager's bets and nobody else's. A manager who does not
 * look for three weeks has stakes sitting out of their balance, Ball Knowledge
 * missing the won and lost points, and no way for anyone else to settle for
 * them. "Settled every week" was really "settled when you next look".
 *
 * This closes that. It grades every open bet in the season and writes the result
 * back, so a week is settled whether the league visited or not.
 *
 * THE GRADING IS NOT REIMPLEMENTED HERE. betGrade, betLegResult, betWeekResult
 * and sbFinals are lifted out of public/app.js by string match and run as-is,
 * the same way the test suite does it. Two graders that agree today would drift
 * apart, and the one nobody watches would be the one that quietly starts paying
 * the wrong bets. The cost of that choice is the usual one: rename a function it
 * grabs and this breaks loudly, which is the intended failure.
 *
 * Everything it reads comes through the deployed proxy, so no ESPN credentials
 * are needed here — they live in Vercel. Firestore is the public web key, the
 * same one the browser uses, and the rules already allow the update.
 *
 *   node scripts/settle-bets.mjs            # the current season
 *   node scripts/settle-bets.mjs 2026       # a specific one
 *   DRY_RUN=1 node scripts/settle-bets.mjs  # grade and report, write nothing
 */
import fs from 'fs';

const BASE = process.env.GFL_BASE || 'https://gfl-dashboard.vercel.app/api/espn';
const DRY  = !!process.env.DRY_RUN;

const SRC = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8')
  .split(String.fromCharCode(13)).join('');
const CFG = fs.readFileSync(new URL('../public/config.js', import.meta.url), 'utf8');

function grab(startsWith) {
  const i = SRC.indexOf(startsWith);
  if (i < 0) throw new Error('settle-bets: cannot find "' + startsWith + '" in app.js');
  let j = i, depth = 0, started = false;
  for (; j < SRC.length; j++) {
    const c = SRC[j];
    if (c === '{') { depth++; started = true; }
    else if (c === '}') { depth--; if (started && depth === 0) { j++; break; } }
    else if (c === ';' && !started && depth === 0) { j++; break; }
  }
  return SRC.slice(i, j);
}

const parts = [
  grab('const GFL_DB='),
  grab('const fsOut='),
  grab('const fsIn='),
  grab('const betDocRow='),
  grab('const REGULAR_SEASON_END='),
  grab('function regEndOf(season){'),
  grab('function betLegWeek('),
  grab('function betWeekResult(leg,season,wk){'),
  grab('function betLegResult(leg,season){'),
  grab('function sbFinals(season){'),
  grab('function betGrade(bet){'),
];

const api = new Function(`
let _seasonMeta={}, _lineups={}, _finalsCache={};
const loadLineups=()=>{};                 /* already in hand; nothing to fetch */
${parts.join('\n')}
return {
  setData(meta,lineups){ _seasonMeta=meta; _lineups=lineups; _finalsCache={}; },
  betGrade, betDocRow, fsOut, GFL_DB,
};`)();

const cfgNum = k => {
  const i = CFG.indexOf(k + ':');
  if (i < 0) return 0;
  const v = parseFloat(CFG.slice(i + k.length + 1));
  return isFinite(v) ? v : 0;
};
const RESET_BEFORE = cfgNum('betsResetBefore');

const nflSeasonYear = () => {
  const d = new Date();
  return d.getUTCMonth() >= 2 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
};
const season = String(process.argv[2] || nflSeasonYear());

const get = async (q) => {
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

/* The same shape fetchSeasonData builds in the browser, and only the fields the
   graders actually read: owners keyed by team id, the teams map for final rank
   and division, the schedule, and where the regular season ends. */
function seasonMeta(d) {
  const owners = {}, teams = {}, divisions = {};
  (d.settings?.scheduleSettings?.divisions || []).forEach(dv => { divisions[dv.id] = dv.name; });
  (d.teams || []).forEach(t => {
    owners[t.id] = t.primaryOwner || (t.owners && t.owners[0]) || `team:${t.id}`;
    teams[t.id] = { rank: t.rankCalculatedFinal || 0, div: t.divisionId ?? 0, seed: t.playoffSeed || 0 };
  });
  const regEnd = d.settings?.scheduleSettings?.matchupPeriodCount || 14;
  return {
    owners, teams, divisions, schedule: d.schedule || [], regEnd,
    playoffTeamCount: d.settings?.scheduleSettings?.playoffTeamCount || 6,
  };
}

const KEY = () => `key=${api.GFL_DB.key}`;
const DOCS = () => `https://firestore.googleapis.com/v1/projects/${api.GFL_DB.project}`
  + `/databases/(default)/documents`;

/* Every bet in this season. No limit clause: the browser caps at 300 because it
   is drawing a page, and a season of twelve managers runs past that. */
async function seasonBets() {
  const r = await fetch(`${DOCS()}:runQuery?${KEY()}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ structuredQuery: {
      from: [{ collectionId: 'bets' }],
      where: { fieldFilter: { field: { fieldPath: 'season' },
                              op: 'EQUAL', value: { stringValue: season } } },
    } }),
  });
  if (!r.ok) throw new Error(`bets query failed: ${r.status} ${await r.text()}`);
  const j = await r.json();
  return (Array.isArray(j) ? j : []).filter(x => x && x.document).map(x => api.betDocRow(x.document));
}

async function writeResult(bet, g) {
  const mask = ['status', 'ret', 'settledTs'].map(f => `updateMask.fieldPaths=${f}`).join('&');
  const r = await fetch(`${DOCS()}/bets/${encodeURIComponent(bet.id)}?${KEY()}&${mask}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(api.fsOut({ status: g.status, ret: String(g.ret), settledTs: String(Date.now()) })),
  });
  if (!r.ok) throw new Error(`patch ${bet.id} failed: ${r.status} ${await r.text()}`);
}

(async () => {
  console.log(`\nsettle-bets — season ${season}${DRY ? '  (DRY RUN, nothing will be written)' : ''}`);

  const raw = await get(`view=mMatchup&view=mTeam&view=mSettings&seasonId=${season}`);
  if (!raw || !raw.teams) { console.error('could not load the season from the proxy'); process.exit(1); }
  const lineups = await get(`type=lineups&seasonId=${season}&v=1`);
  api.setData({ [season]: seasonMeta(raw) }, lineups && lineups.weeks ? { [season]: lineups } : {});
  console.log(`  season loaded: ${(raw.schedule || []).length} fixtures, `
    + `lineups ${lineups && lineups.weeks ? 'in hand' : 'UNAVAILABLE — player markets will stay open'}`);

  const bets = await seasonBets();
  /* The pre-season test bets are excluded from every money figure in the app by
     betsResetBefore. Grading them would write history nobody is counting. */
  const live = bets.filter(b => b.ts >= RESET_BEFORE);
  const open = live.filter(b => b.status === 'open');
  console.log(`  ${bets.length} bets in ${season}, ${live.length} after the reset, ${open.length} open\n`);

  let settled = 0, stillOpen = 0, failed = 0;
  const tally = {};
  for (const b of open) {
    let g = null;
    try { g = api.betGrade(b); }
    catch (e) { failed++; console.log(`  !! ${b.id} (${b.owner}) threw: ${e.message}`); continue; }
    if (!g) { stillOpen++; continue; }
    tally[g.status] = (tally[g.status] || 0) + 1;
    const legs = b.legs.length > 1 ? `${b.legs.length}-leg parlay` : (b.legs[0]?.mk || 'single');
    console.log(`  ${g.status.toUpperCase().padEnd(5)} ${b.owner.padEnd(6)} `
      + `$${String(b.stake).padStart(4)} -> $${String(g.ret).padStart(4)}   ${legs}`);
    if (!DRY) {
      try { await writeResult(b, g); } catch (e) { failed++; console.log(`  !! ${e.message}`); continue; }
    }
    settled++;
  }

  console.log(`\n  settled ${settled}`
    + (Object.keys(tally).length ? ` (${Object.entries(tally).map(([k, v]) => `${v} ${k}`).join(', ')})` : '')
    + `, ${stillOpen} still waiting on a result, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})();
