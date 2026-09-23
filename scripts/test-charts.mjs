/* Does the price freezer still hold?
 *
 * archive-charts.mjs lifts invPricesAt and everything under it out of app.js by
 * string match, so that the frozen numbers and the numbers on the site can
 * never be two different implementations. The cost of that is a hard dependency
 * on names: rename invStats, or turn INV_FUNDS into something a bracket walk
 * cannot follow, and the freezer breaks.
 *
 * This is the check that it breaks LOUDLY, before a workflow writes a season's
 * prices out of a harness that half-loaded. It grabs the same declarations,
 * runs the real pricer over a made-up twelve-team league, and asserts the
 * things that must be true of any price board it produces.
 *
 *   node scripts/test-charts.mjs
 */
import fs from 'fs';

const SRC = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8')
  .split(String.fromCharCode(13)).join('');
const CFG = fs.readFileSync(new URL('../public/config.js', import.meta.url), 'utf8');

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? '  → ' + extra : '')); }
};

/* ── LIFTING A DECLARATION OUT OF app.js ─────────────────────────────────────
   Counts all three kinds of bracket AND steps over strings, template literals
   and comments, because a walker that does not has now been wrong three
   separate times in this repo. The failure is always the same shape: a `${` in
   a template literal reads as an opening brace, its `}` reads as the end of the
   declaration, and half a function comes back — which then fails to parse with
   "Unexpected end of input" a long way from the cause. */
function skipQuote(src, i) {
  const q = src[i];
  let j = i + 1;
  while (j < src.length) {
    if (src[j] === '\\') { j += 2; continue; }
    if (src[j] === q) return j + 1;
    j++;
  }
  return j;
}
function skipTemplate(src, i) {
  let j = i + 1;
  while (j < src.length) {
    if (src[j] === '\\') { j += 2; continue; }
    if (src[j] === '`') return j + 1;
    if (src[j] === '$' && src[j + 1] === '{') {
      let d = 1; j += 2;
      while (j < src.length && d > 0) {
        const c = src[j];
        if (c === '\\') { j += 2; continue; }
        if (c === "'" || c === '"') { j = skipQuote(src, j); continue; }
        if (c === '`') { j = skipTemplate(src, j); continue; }
        if (c === '{') d++; else if (c === '}') d--;
        j++;
      }
      continue;
    }
    j++;
  }
  return j;
}
function grab(startsWith) {
  const i = SRC.indexOf(startsWith);
  if (i < 0) throw new Error('cannot find "' + startsWith + '" in app.js');
  let j = i, depth = 0;
  while (j < SRC.length) {
    const c = SRC[j];
    if (c === "'" || c === '"') { j = skipQuote(SRC, j); continue; }
    if (c === '`') { j = skipTemplate(SRC, j); continue; }
    if (c === '/' && SRC[j + 1] === '/') { const e = SRC.indexOf('\n', j); j = e < 0 ? SRC.length : e; continue; }
    if (c === '/' && SRC[j + 1] === '*') { const e = SRC.indexOf('*/', j); j = e < 0 ? SRC.length : e + 2; continue; }
    if (c === '(' || c === '[' || c === '{') { depth++; j++; continue; }
    if (c === ')' || c === ']' || c === '}') {
      depth--; j++;
      if (depth === 0 && (c === '}' || c === ']')) return SRC.slice(i, j);
      continue;
    }
    if (c === ';' && depth === 0) return SRC.slice(i, j + 1);
    j++;
  }
  return SRC.slice(i, j);
}

console.log('\n1. every declaration the freezer lifts is still there');
const NEEDED = ['const LINEUP_SHAPE_FALLBACK=', 'function sbSlotShape(', 'function sbBestLineup(',
  'function rosterProjByOwner(', 'const INV_BASE=', 'const INV_FORM_WEEKS=', 'const INV_PROJ_MAX=',
  'const INV_PROJ_MIN=', 'const INV_SEASON_WEEKS=', 'const INV_PROJ_POW=', 'const INV_GAIN=',
  'const RP_WEEKS=',
  'const INV_FUNDS=', 'function invFundMembers(',
  'const weekDecided=', 'const weekScored=', 'function weeksOf(schedule){',
  'function weekOver(byWeek,w){', 'function weeksOverCount(schedule){',
  'const REGULAR_SEASON_END=', 'function regEndOf(season){', 'function buildBracket(season){',
  'function poDeadGames(season){', 'const poDeadId=',
  'function invStats(',
  /* the coins ride on the same price map, so a freeze without them writes a
     week that has teams and funds on it and no coins */
  'const INV_COINS=', 'const INV_COIN_CUT=', 'const INV_COIN_TOP=',
  'const INV_COIN_P=', 'const INV_COIN_FLOOR=', 'const invCoinKey=',
  'function invCoinPrices(){',
  'function invPricesAt('];
const parts = {};
for (const n of NEEDED) {
  let got = null;
  try { got = grab(n); } catch (e) {}
  ok(n, !!got && got.length > n.length, got ? null : 'not found');
  parts[n] = got || '';
}
ok('INV_FUNDS survives the bracket walk whole', /\]\s*;?$/.test(parts['const INV_FUNDS='].trim()),
  parts['const INV_FUNDS='].slice(-40));

/* ── a made-up league, priced ─────────────────────────────────────────────── */
const N = 12;
/* the shipped coin ids, read from the source rather than retyped */
const COIN_PIDS = [...SRC.matchAll(/pid:(\d+)/g)].map(m => Number(m[1]));
const owners = {}, teamsMeta = {}, franchises = [], rosters = {}, poolPlayers = [];
for (let t = 1; t <= N; t++) {
  const o = 'own' + t;
  owners[t] = o;
  teamsMeta[t] = { name: 'Team ' + t, owner: o, div: t <= 6 ? 0 : 1 };
  franchises.push({ owner: o, name: 'Team ' + t, teamId: t });
  /* Every team gets the same shape of roster and a projection that climbs with
     the team number, so the ONLY thing separating them is squad strength.

     The step is small on purpose. It used to be t*10 - a 2x spread between the
     best and worst squad - which made the ordering obvious but put the fixture
     in a regime the real league is nowhere near: twelve genuine fantasy rosters
     sit inside about 8% of each other end to end. That mattered once INV_GAIN
     arrived, because INV_PROJ_POW and INV_GAIN COMPOUND - a cube of a cube is a
     NINTH power on the roster ratio - and 2^9 drove the bottom half of the
     fixture onto the $1 clamp, which broke the league-mean invariant below.
     Real spread, real regime; the clamp itself is pinned in test-projection. */
  rosters[t] = [];
  const shape = [[1, 1], [2, 2], [3, 2], [4, 1], [5, 1], [16, 1]];
  let pid = t * 1000;
  shape.forEach(([pos, n]) => {
    for (let i = 0; i < n; i++) {
      pid++;
      rosters[t].push({ pid, n: 'P' + pid, slot: pos === 1 ? 0 : pos === 16 ? 16 : pos === 5 ? 17 : pos, pos });
      poolPlayers.push({ id: pid, name: 'P' + pid, pos, proj: 100 + t * 2, total: 0 });
    }
  });
}
/* THE COIN PLAYERS HAVE TO BE IN THE FIXTURE POOL. It is twelve invented
   rosters and holds none of them, and a pool without a coin prices no coin --
   which would let the frozen-week case below pass for the wrong reason. Each
   gets a projection and a crowd of rivals beneath him at his own position, so
   he lands inside his cutoff and comes out with a real price. */
COIN_PIDS.forEach((pid, i) => {
  const pos = [1, 2, 3, 4][i % 4];
  poolPlayers.push({ id: pid, name: 'Coin' + pid, pos, proj: 300 - i, total: 0 });
});
[1, 2, 3, 4].forEach(pos => {
  for (let i = 0; i < 90; i++)
    poolPlayers.push({ id: 5000000 + pos * 1000 + i, name: 'x', pos, proj: 120 - i, total: 0 });
});
const harness = `
${CFG}
const _CFG = window.GFL_CONFIG || {};
const _seasonMeta = ${JSON.stringify({ 2099: {
  owners, teams: teamsMeta, divisions: { 0: 'East', 1: 'West' }, schedule: [],
  slots: { 0: 1, 2: 2, 4: 2, 6: 1, 16: 1, 17: 1, 23: 1, 20: 5 },
} })};
const _franchises = ${JSON.stringify(franchises)};
const _bkPools = ${JSON.stringify({ 2099: poolPlayers })};
const _bkPool = ${JSON.stringify(poolPlayers)};
const _sbRosters = ${JSON.stringify({ '2099:1': rosters })};
const BENCH_SLOTS = [20,21,24];
function sbBoardSeason(){ return '2099'; }
function sbRosters(s,w){ return _sbRosters[String(s)+':'+w] || null; }
function bkLoadPool(){}
/* invPricesAt short-circuits to a frozen board when one exists. Out here there
   is none, and the freezer itself must never read its own output — so both
   harnesses stub this to null and always compute. */
let _FROZEN = null;
function frozenPrices(){ return _FROZEN; }
function setFrozen(f){ _FROZEN = f; }
/* the freezer supplies these; the fixture has no weekly feed, which is exactly
   the case that must still price rather than return nothing */
function rosterProjWeekly(){ return null; }
let _rpMemo = {};
let _poDeadCache = {};
${NEEDED.map(n => parts[n]).join('\n')}
module.exports = { invPricesAt, rosterProjByOwner, INV_BASE, setFrozen, INV_COINS, invCoinKey };
`;
const mod = { exports: {} };
const window = { GFL_CONFIG: null };
let built = true;
try { new Function('module', 'window', harness)(mod, window); }
catch (e) { built = false; console.log('  FAIL harness does not build → ' + e.message); fail++; }

if (built) {
  console.log('\n2. the lifted pricer produces a coherent board');
  const proj = mod.exports.rosterProjByOwner('2099', 1);
  ok('every team gets a projection', Object.keys(proj).length === N, Object.keys(proj).length);
  ok('a better squad projects higher', (proj['own12'] || 0) > (proj['own1'] || 0),
    `${proj['own1']} vs ${proj['own12']}`);

  const prices = mod.exports.invPricesAt('2099', 1);
  /* The map holds three kinds of key now — teams, funds and coins — so
     "every team" has to mean the teams. A coin counted as a team put the
     average share at $15.20 and the count at 23. */
  const notTeam = k => /^ETF_/.test(k) || /^COIN_/.test(k);
  const teamPrices = Object.entries(prices).filter(([k]) => !notTeam(k)).map(([, v]) => v);
  ok('a price for every team', teamPrices.length === N, teamPrices.length);
  ok('every price is a positive number', teamPrices.every(v => typeof v === 'number' && v > 0));
  const mean = teamPrices.reduce((a, b) => a + b, 0) / teamPrices.length;
  /* the whole point of dividing by the league mean: the average share is always
     worth the base price, so one team climbing means another slips */
  ok('the average share is worth the base price',
    Math.abs(mean - mod.exports.INV_BASE) < 0.15, 'mean ' + mean.toFixed(3));
  ok('the best squad is the dearest share',
    prices['own12'] === Math.max(...teamPrices), `own12 ${prices['own12']} vs max ${Math.max(...teamPrices)}`);
  ok('the worst squad is the cheapest',
    prices['own1'] === Math.min(...teamPrices), `own1 ${prices['own1']} vs min ${Math.min(...teamPrices)}`);
  ok('prices are ordered by squad strength', franchises.every((f, i) =>
    i === 0 || prices[f.owner] >= prices[franchises[i - 1].owner] - 0.001));
  ok('both conference funds are priced',
    prices.ETF_EAST > 0 && prices.ETF_WEST > 0, `${prices.ETF_EAST} / ${prices.ETF_WEST}`);
  /* six weak teams in one conference and six strong in the other: the funds are
     the mean of their holdings, so they must straddle the base price */
  ok('the funds straddle the base price',
    Math.min(prices.ETF_EAST, prices.ETF_WEST) < mod.exports.INV_BASE &&
    Math.max(prices.ETF_EAST, prices.ETF_WEST) > mod.exports.INV_BASE,
    `${prices.ETF_EAST} / ${prices.ETF_WEST}`);

  console.log('\n3. a season nobody has played still prices');
  const flat = mod.exports.invPricesAt('2099', null);
  ok('no through-week is still a full board',
    Object.keys(flat).filter(k => !/^ETF_/.test(k) && !/^COIN_/.test(k)).length === N);
}

if (built) {
  /* ── A FROZEN WEEK MUST NOT HIDE THE COINS ──────────────────────────
     This shipped broken, in the worst shape of broken: no error, no empty
     list, just a tab that said "Loading the coins…" for good. The board prices
     at the last COMPLETED week, a completed week is served out of
     charts-<season>.json, and every week sealed before the coins existed
     carries twelve teams, two funds and nothing else -- so invPricesAt handed
     back a map with no coin in it and no amount of waiting could add one.

     The frozen board is laid OVER a live coin board now. A week sealed WITH
     coins keeps its own, because a settled week has to read the same in
     December as it did in September. */
  console.log('\n4. a frozen week cannot hide the coins');
  const coinKeys = mod.exports.INV_COINS.map(c => mod.exports.invCoinKey(c.pid));

  /* sealed before coins existed: teams and funds only */
  const sealedOld = { A: 11.1, B: 9.2, ETF_EAST: 10.4, ETF_WEST: 9.6 };
  mod.exports.setFrozen(sealedOld);
  const filled = mod.exports.invPricesAt('2099', 1);
  ok('the frozen teams are served untouched',
    filled.A === 11.1 && filled.ETF_EAST === 10.4);
  ok('and the coins are filled in rather than missing',
    coinKeys.length > 0 && coinKeys.every(k => typeof filled[k] === 'number'));

  /* sealed WITH coins: those numbers win, or a settled week would move */
  const sealedNew = Object.assign({}, sealedOld);
  coinKeys.forEach((k, i) => { sealedNew[k] = 3 + i; });
  mod.exports.setFrozen(sealedNew);
  const kept = mod.exports.invPricesAt('2099', 1);
  ok('a week sealed with coins keeps its own prices',
    coinKeys.every((k, i) => kept[k] === 3 + i));

  mod.exports.setFrozen(null);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
