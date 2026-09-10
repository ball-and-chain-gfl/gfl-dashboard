/* IS THE WIN PROBABILITY CURVE CALIBRATED?
 *
 * The model says a lead of L with a fraction of the week still to play is
 * worth Phi(L / (sigma * sqrt(left))). Nothing in the app has ever checked
 * that against what actually happened, and a curve nobody has measured is an
 * opinion with a percentage sign on it.
 *
 * This measures it. Four seasons of archived rosters carry every starter's
 * real points for every week, so a finished matchup can be replayed: take k
 * starters a side as "already played", read the partial margin, and look at
 * who actually won. Do that across every matchup and every k and the model's
 * prediction can be put beside the observed rate.
 *
 * WHICH k PLAY FIRST IS DRAWN AT RANDOM. In a real week it is the NFL
 * schedule that decides, and this cannot reconstruct that from an archive. A
 * random draw is a fair stand-in -- there is no reason a Thursday starter is
 * systematically better or worse than a Sunday one -- but it is a stand-in,
 * and a systematic difference would not show up here.
 *
 *   node scripts/calibrate-wp.mjs
 */
const BASE = process.env.GFL_BASE || 'https://gfl-dashboard.vercel.app/api/espn';
const SEASONS = (process.env.SEASONS || '2022,2023,2024,2025').split(',');
const DRAWS = Number(process.env.DRAWS || 40);   // random orderings per matchup
const BENCH = [20, 21, 24];

const get = async q => {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(`${BASE}?${q}`);
      if (r.ok) return await r.json();
    } catch { /* retry */ }
    await new Promise(res => setTimeout(res, 400));
  }
  return null;
};

/* a deterministic shuffle, so a re-run gives the same answer */
let _seed = 20260910;
const rnd = () => { _seed = (_seed * 1103515245 + 12345) & 0x7fffffff; return _seed / 0x7fffffff; };
const pick = (n, k) => {
  const idx = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = idx[i]; idx[i] = idx[j]; idx[j] = t; }
  return idx.slice(0, k);
};

const erf = x => {
  const s = x < 0 ? -1 : 1; x = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return s * y;
};
const cdf = z => 0.5 * (1 + erf(z / Math.SQRT2));
const sd = v => {
  if (v.length < 2) return 0;
  const m = v.reduce((a, b) => a + b, 0) / v.length;
  return Math.sqrt(v.reduce((s, x) => s + (x - m) * (x - m), 0) / (v.length - 1));
};

/* ── harvest ──────────────────────────────────────────────────────────────── */
const games = [];        // {a:[pts...], b:[pts...]}
for (const season of SEASONS) {
  const meta = await get(`view=mMatchup&view=mSettings&seasonId=${season}`);
  if (!meta) { console.log(`  ${season}: no schedule`); continue; }
  const mpc = meta.settings?.scheduleSettings?.matchupPeriodCount;
  const regEnd = (mpc >= 8 && mpc <= 18) ? mpc : 14;
  const byWeek = {};
  (meta.schedule || []).forEach(m => {
    const w = Number(m.matchupPeriodId) || 0;
    if (!w || w > regEnd || !m.home || !m.away) return;
    if (!((m.home.totalPoints || 0) > 0 && (m.away.totalPoints || 0) > 0)) return;
    (byWeek[w] || (byWeek[w] = [])).push([m.home.teamId, m.away.teamId]);
  });
  let n = 0;
  for (const w of Object.keys(byWeek).map(Number).sort((x, y) => x - y)) {
    const r = await get(`view=mRoster&seasonId=${season}&scoringPeriodId=${w}`);
    if (!r) continue;
    const starters = {};
    (r.teams || []).forEach(t => {
      /* NOT playerPoolEntry.appliedStatTotal. On an archived roster that is a
         season figure, not this week's -- it read 284.4 against a recorded
         matchup total of 122.4. The week's own points are the stat line for
         this scoring period from the real source (statSourceId 0). */
      starters[t.id] = (((t.roster || {}).entries) || [])
        .filter(e => !BENCH.includes(e.lineupSlotId))
        .map(e => {
          const st = ((((e.playerPoolEntry || {}).player) || {}).stats) || [];
          const wk = st.find(x => x && Number(x.scoringPeriodId) === w
            && Number(x.statSourceId) === 0 && Number(x.statSplitTypeId) === 1);
          return Number(wk && wk.appliedTotal) || 0;
        });
    });
    byWeek[w].forEach(([h, a]) => {
      const A = starters[h], B = starters[a];
      if (!A || !B || A.length < 7 || B.length < 7) return;
      if (A.reduce((x, y) => x + y, 0) <= 0 || B.reduce((x, y) => x + y, 0) <= 0) return;
      games.push({ a: A, b: B }); n++;
    });
  }
  console.log(`  ${season}: ${n} matchups`);
}
console.log(`\n${games.length} matchups harvested, ${DRAWS} random orderings each\n`);
if (!games.length) process.exit(1);

/* ── replay ───────────────────────────────────────────────────────────────── */
const SIGMA = 34.5;                       // what the app uses for a live week
const rows = [];                          // {k, left, partial, rest, won, pred}
games.forEach(g => {
  const nA = g.a.length, nB = g.b.length;
  const fin = g.a.reduce((x, y) => x + y, 0) - g.b.reduce((x, y) => x + y, 0);
  if (fin === 0) return;
  for (let k = 1; k <= Math.min(nA, nB) - 1; k++) {
    for (let d = 0; d < DRAWS; d++) {
      const ia = pick(nA, k), ib = pick(nB, k);
      const pa = ia.reduce((s, i) => s + g.a[i], 0);
      const pb = ib.reduce((s, i) => s + g.b[i], 0);
      const partial = pa - pb;
      const left = 1 - (k / ((nA + nB) / 2));
      rows.push({ k, left, partial, rest: fin - partial, won: fin > 0,
        pred: cdf(partial / Math.max(0.6, SIGMA * Math.sqrt(left))) });
    }
  }
});

/* ── 1. is the spread right? ──────────────────────────────────────────────── */
console.log('1. THE SPREAD OF WHAT IS LEFT TO COME');
console.log('   k = starters played per side.  "model" is SIGMA*sqrt(left).\n');
console.log('    k   left   measured sd   model sd   ratio');
for (let k = 1; k <= 8; k++) {
  const r = rows.filter(x => x.k === k);
  if (r.length < 200) continue;
  const meas = sd(r.map(x => x.rest));
  const left = r[0].left;
  const mod = SIGMA * Math.sqrt(left);
  console.log('  ' + String(k).padStart(3) + '  ' + left.toFixed(3)
    + '   ' + meas.toFixed(1).padStart(9) + '   ' + mod.toFixed(1).padStart(8)
    + '   ' + (meas / mod).toFixed(3).padStart(5));
}

/* ── 2. does the number mean what it says? ────────────────────────────────── */
console.log('\n2. WHAT THE MODEL SAYS AGAINST WHAT HAPPENED');
console.log('   every replay bucketed by the model\'s own prediction\n');
console.log('   model says     n      actually won');
const buckets = [[0.50, 0.55], [0.55, 0.60], [0.60, 0.65], [0.65, 0.70], [0.70, 0.75],
                 [0.75, 0.80], [0.80, 0.85], [0.85, 0.90], [0.90, 0.95], [0.95, 1.01]];
buckets.forEach(([lo, hi]) => {
  const r = rows.filter(x => x.pred >= lo && x.pred < hi);
  if (r.length < 100) return;
  const won = r.filter(x => x.won).length / r.length;
  const mid = r.reduce((s, x) => s + x.pred, 0) / r.length;
  const gap = (won - mid) * 100;
  console.log('   ' + (lo * 100).toFixed(0) + '-' + (hi * 100).toFixed(0) + '%'
    + String(r.length).padStart(9) + '      ' + (won * 100).toFixed(1).padStart(5) + '%'
    + '   (' + (gap >= 0 ? '+' : '') + gap.toFixed(1) + ')');
});

/* ── 3. the case that started this ────────────────────────────────────────── */
console.log('\n3. ONE STARTER EACH, LEADER UP 10 TO 25');
{
  const r = rows.filter(x => x.k === 1 && Math.abs(x.partial) >= 10 && Math.abs(x.partial) <= 25);
  const led = r.map(x => ({ won: x.partial > 0 ? x.won : !x.won, pred: x.partial > 0 ? x.pred : 1 - x.pred }));
  const won = led.filter(x => x.won).length / led.length;
  const pred = led.reduce((s, x) => s + x.pred, 0) / led.length;
  console.log('   ' + led.length + ' replays');
  console.log('   the model said   ' + (pred * 100).toFixed(1) + '%');
  console.log('   they actually won ' + (won * 100).toFixed(1) + '%');
  console.log('   ESPN, on the same shape of position, said 58%');
}

/* ── 4. what sigma would have been right ──────────────────────────────────── */
console.log('\n4. THE SIGMA THE ARCHIVE ASKS FOR');
{
  const all = rows.filter(x => x.k >= 1 && x.k <= 8);
  const byK = [];
  for (let k = 1; k <= 8; k++) {
    const r = all.filter(x => x.k === k);
    if (r.length < 200) continue;
    byK.push(sd(r.map(x => x.rest)) / Math.sqrt(r[0].left));
  }
  const impl = byK.reduce((a, b) => a + b, 0) / byK.length;
  console.log('   implied full-week sigma: ' + impl.toFixed(1) + '   (the app uses ' + SIGMA + ')');
}
