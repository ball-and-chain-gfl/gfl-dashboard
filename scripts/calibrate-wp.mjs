/* IS THE WIN PROBABILITY CURVE CALIBRATED?
 *
 * The model says a lead of L points with a fraction of the week still to play
 * is worth Phi(L / (sigma * sqrt(left))). Nothing in the app had ever checked
 * that against what happened, and a curve nobody has measured is an opinion
 * with a percentage sign on it.
 *
 * THE SOURCE. public/data/lineups-YYYY.json holds every starter's real points
 * for every week of four seasons, shaped weeks[week][teamId] = [[pid, pts]...].
 * It is validated against ESPN's own recorded matchup totals below before
 * anything is measured off it -- an earlier version of this script summed the
 * wrong field off the live API and produced a confident, badly wrong answer, so
 * the check is not optional and the script refuses to continue without it.
 *
 * THE METHOD. A finished matchup can be replayed: treat k starters a side as
 * already played, read the partial margin, and look at who actually won. Do
 * that across every matchup, every k, and many random orderings, and the
 * model's prediction can be put beside the observed rate.
 *
 * WHICH k PLAY FIRST IS DRAWN AT RANDOM. In a real week the NFL schedule
 * decides, and an archive cannot reconstruct that. A random draw is a fair
 * stand-in -- there is no reason a Thursday starter is systematically better
 * than a Sunday one -- but it is a stand-in, and it is the one place a
 * systematic effect could hide from this.
 *
 *   node scripts/calibrate-wp.mjs
 */
import fs from 'fs';

const SEASONS = (process.env.SEASONS || '2022,2023,2024,2025').split(',');
const DRAWS = Number(process.env.DRAWS || 60);
const SIGMA = 34.5;                        // wpSd() — what the app uses live
const DIR = new URL('../public/data/', import.meta.url);

const read = f => { try { return JSON.parse(fs.readFileSync(new URL(f, DIR), 'utf8')); } catch { return null; } };

/* deterministic, so a re-run gives the same answer */
let _s = 20260910;
const rnd = () => { _s = (_s * 1103515245 + 12345) & 0x7fffffff; return _s / 0x7fffffff; };
const pick = (n, k) => {
  const i = Array.from({ length: n }, (_, x) => x);
  for (let x = n - 1; x > 0; x--) { const j = Math.floor(rnd() * (x + 1)); const t = i[x]; i[x] = i[j]; i[j] = t; }
  return i.slice(0, k);
};
const erf = x => {
  const s = x < 0 ? -1 : 1; x = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * x);
  return s * (1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x));
};
const cdf = z => 0.5 * (1 + erf(z / Math.SQRT2));
const sum = v => v.reduce((a, b) => a + b, 0);
const mean = v => sum(v) / v.length;
const sd = v => v.length < 2 ? 0 : Math.sqrt(v.reduce((s, x) => s + (x - mean(v)) ** 2, 0) / (v.length - 1));

/* ── harvest, and check it against ESPN's own totals ───────────────────────── */
const games = [];
let checked = 0, agreed = 0, worst = 0;
for (const y of SEASONS) {
  const season = read(`season-${y}.json`);
  const lineups = read(`lineups-${y}.json`);
  if (!season || !lineups) { console.log(`  ${y}: missing archive`); continue; }
  const mpc = season.settings?.scheduleSettings?.matchupPeriodCount;
  const regEnd = (mpc >= 8 && mpc <= 18) ? mpc : 14;
  let n = 0;
  (season.schedule || []).forEach(m => {
    const w = Number(m.matchupPeriodId) || 0;
    if (!w || w > regEnd || !m.home || !m.away) return;
    const wk = (lineups.weeks || {})[String(w)];
    if (!wk) return;
    const A = (wk[String(m.home.teamId)] || []).map(p => Number(p[1]) || 0);
    const B = (wk[String(m.away.teamId)] || []).map(p => Number(p[1]) || 0);
    if (A.length < 7 || B.length < 7) return;
    /* THE VALIDATION. Each side's starters must reproduce the matchup total
       ESPN recorded, or the harvest is reading the wrong players. */
    [[A, m.home.totalPoints], [B, m.away.totalPoints]].forEach(([arr, tot]) => {
      if (!(tot > 0)) return;
      checked++;
      const d = Math.abs(sum(arr) - tot);
      if (d > worst) worst = d;
      if (d < 0.05) agreed++;
    });
    if (sum(A) <= 0 || sum(B) <= 0) return;
    games.push({ a: A, b: B, y, ha: m.home.teamId, aw: m.away.teamId }); n++;
  });
  console.log(`  ${y}: ${n} matchups`);
}
console.log(`\nVALIDATION  ${agreed} of ${checked} sides reproduce ESPN's recorded total exactly`
  + `  (worst disagreement ${worst.toFixed(2)} pts)`);
if (!checked || agreed / checked < 0.98) {
  console.log('\nHARVEST DOES NOT MATCH THE ARCHIVE — refusing to measure anything off it.');
  process.exit(1);
}
console.log(`${games.length} matchups, ${DRAWS} random orderings each\n`);

/* ── every starter score each team put up, for the prospective draw in 6 ──── */
const pools = {};
games.forEach(g => {
  (pools[g.y + ':' + g.ha] || (pools[g.y + ':' + g.ha] = [])).push(...g.a);
  (pools[g.y + ':' + g.aw] || (pools[g.y + ':' + g.aw] = [])).push(...g.b);
});

/* ── replay ───────────────────────────────────────────────────────────────── */
const rows = [];
games.forEach(g => {
  const nA = g.a.length, nB = g.b.length;
  const fin = sum(g.a) - sum(g.b);
  if (fin === 0) return;
  for (let k = 1; k <= Math.min(nA, nB) - 1; k++) {
    const left = 1 - (k / ((nA + nB) / 2));
    for (let d = 0; d < DRAWS; d++) {
      const partial = sum(pick(nA, k).map(i => g.a[i])) - sum(pick(nB, k).map(i => g.b[i]));
      rows.push({ k, left, partial, rest: fin - partial, won: fin > 0,
        pred: cdf(partial / Math.max(0.6, SIGMA * Math.sqrt(left))) });
    }
  }
});

/* ── 1. the spread of what is still to come ───────────────────────────────── */
console.log('1. THE SPREAD OF WHAT IS LEFT TO COME');
console.log('   k = starters played per side\n');
console.log('     k   left   measured sd   model sd   ratio');
const ratios = [];
for (let k = 1; k <= 8; k++) {
  const r = rows.filter(x => x.k === k);
  if (r.length < 200) continue;
  const meas = sd(r.map(x => x.rest)), mod = SIGMA * Math.sqrt(r[0].left);
  ratios.push(meas / Math.sqrt(r[0].left));
  console.log('   ' + String(k).padStart(3) + '   ' + r[0].left.toFixed(3)
    + '   ' + meas.toFixed(1).padStart(9) + '   ' + mod.toFixed(1).padStart(8)
    + '   ' + (meas / mod).toFixed(2).padStart(5));
}
console.log('\n   implied full-week sigma: ' + mean(ratios).toFixed(1)
  + '    the app uses ' + SIGMA);

/* ── 2. what the model said against what happened ─────────────────────────── */
console.log('\n2. WHAT THE MODEL SAID AGAINST WHAT HAPPENED');
console.log('   every replay bucketed by the model\'s own prediction\n');
console.log('   model says      n     model avg   actually won    error');
[[0.50, 0.55], [0.55, 0.60], [0.60, 0.65], [0.65, 0.70], [0.70, 0.75],
 [0.75, 0.80], [0.80, 0.85], [0.85, 0.90], [0.90, 0.95], [0.95, 1.01]].forEach(([lo, hi]) => {
  const r = rows.filter(x => x.pred >= lo && x.pred < hi);
  if (r.length < 100) return;
  const won = r.filter(x => x.won).length / r.length, avg = mean(r.map(x => x.pred));
  const gap = (won - avg) * 100;
  console.log('   ' + ((lo * 100).toFixed(0) + '-' + (hi * 100).toFixed(0) + '%').padEnd(9)
    + String(r.length).padStart(8) + '      ' + (avg * 100).toFixed(1).padStart(5) + '%'
    + '        ' + (won * 100).toFixed(1).padStart(5) + '%'
    + '   ' + ((gap >= 0 ? '+' : '') + gap.toFixed(1)).padStart(6));
});

/* ── 3. the case that started all this ────────────────────────────────────── */
console.log('\n3. ONE STARTER EACH, LEADER UP 10 TO 25');
{
  const r = rows.filter(x => x.k === 1 && Math.abs(x.partial) >= 10 && Math.abs(x.partial) <= 25)
    .map(x => ({ won: x.partial > 0 ? x.won : !x.won, pred: x.partial > 0 ? x.pred : 1 - x.pred }));
  console.log('   ' + r.length + ' replays');
  console.log('   the model said     ' + (mean(r.map(x => x.pred)) * 100).toFixed(1) + '%');
  console.log('   they actually won  ' + (r.filter(x => x.won).length / r.length * 100).toFixed(1) + '%');
  console.log('   ESPN, on that shape of position, said 58%');
}

/* ── 4. is it the spread, or is it the shape? ─────────────────────────────── */
console.log('\n4. NORMAL, OR NOT');
{
  const s = mean(ratios);
  const re = rows.filter(x => x.k >= 2 && x.k <= 7);
  const z = re.map(x => x.rest / (s * Math.sqrt(x.left)));
  const m = mean(z), q = sd(z);
  const skew = mean(z.map(v => ((v - m) / q) ** 3));
  const kurt = mean(z.map(v => ((v - m) / q) ** 4)) - 3;
  console.log('   remaining margin, standardised by the MEASURED sigma');
  console.log('     skew              ' + skew.toFixed(3) + '   (0 is symmetric)');
  console.log('     excess kurtosis   ' + kurt.toFixed(3) + '   (0 is normal, + is fat tails)');
  const beyond = t => (z.filter(v => Math.abs(v) > t).length / z.length * 100).toFixed(2);
  console.log('     beyond 1 sd       ' + beyond(1) + '%   (normal 31.73%)');
  console.log('     beyond 2 sd       ' + beyond(2) + '%   (normal  4.55%)');
}

/* ── 5. the sigma the archive actually asks for ───────────────────────────── */
console.log('\n5. THE SIGMA THAT FITS BEST');
{
  const all = rows.filter(x => x.k >= 1 && x.k <= 8);
  let best = null;
  for (let S = 26; S <= 70; S += 0.25) {
    const brier = all.reduce((acc, x) =>
      acc + ((x.won ? 1 : 0) - cdf(x.partial / Math.max(0.6, S * Math.sqrt(x.left)))) ** 2, 0) / all.length;
    if (!best || brier < best[1]) best = [S, brier];
  }
  const at = S => all.reduce((acc, x) =>
    acc + ((x.won ? 1 : 0) - cdf(x.partial / Math.max(0.6, S * Math.sqrt(x.left)))) ** 2, 0) / all.length;
  console.log('   Brier score, lower is better (0.25 = always saying 50%)\n');
  console.log('     sigma 34.5 (the app)   ' + at(34.5).toFixed(5));
  console.log('     sigma ' + best[0].toFixed(2) + ' (best fit)    ' + best[1].toFixed(5));
  console.log('     always 50%             ' + (0.25).toFixed(5));
}

/* ── 6. THE SAME QUESTION, WITHOUT THE ARTEFACT ───────────────────────────────
   The replay above samples k players out of a total that has ALREADY HAPPENED,
   so partial and remainder are welded together: a big partial mechanically
   forces a smaller remainder, because the two must add up to a result that is
   already on the books. A real week has no such constraint -- the rest of your
   roster is genuinely still to be played, and a big Thursday takes nothing away
   from it.

   That constraint pushes observed win rates toward the middle and is the most
   likely explanation for the 4-to-7 points of apparent overconfidence in 2.

   So: draw instead. Each team keeps its OWN pool of starter scores -- every
   score it actually put up across the season, so a good team stays a good team
   -- and a matchup is built by drawing k for the partial and the rest
   independently from those pools. The distribution is real, the team quality is
   real, and nothing is welded to a predetermined total.

   If the drift survives this, it is real and sigma should move. If it collapses,
   the model is calibrated and the drift was the measurement's own shadow. */
console.log('\n6. PROSPECTIVE DRAW — NO FIXED TOTALS');
{
  const keys = Object.keys(pools).filter(k => pools[k].length >= 60);
  const pairs = games.filter(g => pools[g.y + ':' + g.ha] && pools[g.y + ':' + g.aw]
    && pools[g.y + ':' + g.ha].length >= 60 && pools[g.y + ':' + g.aw].length >= 60);
  console.log('   ' + keys.length + ' team-seasons pooled, '
    + pairs.length + ' real pairings redrawn ' + DRAWS + ' times each\n');

  const draw = (pool, n) => {
    let t = 0;
    for (let i = 0; i < n; i++) t += pool[Math.floor(rnd() * pool.length)];
    return t;
  };
  const pro = [];
  pairs.forEach(g => {
    const PA = pools[g.y + ':' + g.ha], PB = pools[g.y + ':' + g.aw];
    const nA = g.a.length, nB = g.b.length;
    for (let k = 1; k <= Math.min(nA, nB) - 1; k++) {
      const left = 1 - (k / ((nA + nB) / 2));
      for (let d = 0; d < DRAWS; d++) {
        const partial = draw(PA, k) - draw(PB, k);
        const rest = draw(PA, nA - k) - draw(PB, nB - k);
        pro.push({ k, left, partial, rest, won: (partial + rest) > 0,
          pred: cdf(partial / Math.max(0.6, SIGMA * Math.sqrt(left))) });
      }
    }
  });

  console.log('   model says      n     model avg   actually won    error');
  [[0.50, 0.55], [0.55, 0.60], [0.60, 0.65], [0.65, 0.70], [0.70, 0.75],
   [0.75, 0.80], [0.80, 0.85], [0.85, 0.90], [0.90, 0.95], [0.95, 1.01]].forEach(([lo, hi]) => {
    const r = pro.filter(x => x.pred >= lo && x.pred < hi);
    if (r.length < 100) return;
    const won = r.filter(x => x.won).length / r.length, avg = mean(r.map(x => x.pred));
    const gap = (won - avg) * 100;
    console.log('   ' + ((lo * 100).toFixed(0) + '-' + (hi * 100).toFixed(0) + '%').padEnd(9)
      + String(r.length).padStart(8) + '      ' + (avg * 100).toFixed(1).padStart(5) + '%'
      + '        ' + (won * 100).toFixed(1).padStart(5) + '%'
      + '   ' + ((gap >= 0 ? '+' : '') + gap.toFixed(1)).padStart(6));
  });

  const err = pro.reduce((a, x) => a + ((x.won ? 1 : 0) - x.pred), 0) / pro.length * 100;
  console.log('\n   mean error across every draw: ' + (err >= 0 ? '+' : '') + err.toFixed(2)
    + ' points   (the fixed-total replay: -5.3)');

  let best = null;
  for (let S2 = 26; S2 <= 70; S2 += 0.25) {
    const b = pro.reduce((a, x) =>
      a + ((x.won ? 1 : 0) - cdf(x.partial / Math.max(0.6, S2 * Math.sqrt(x.left)))) ** 2, 0) / pro.length;
    if (!best || b < best[1]) best = [S2, b];
  }
  console.log('   sigma that fits this best: ' + best[0].toFixed(2) + '    the app uses ' + SIGMA);

  const spread = [];
  for (let k = 1; k <= 8; k++) {
    const r = pro.filter(x => x.k === k);
    if (r.length < 200) continue;
    spread.push(sd(r.map(x => x.rest)) / Math.sqrt(r[0].left));
  }
  console.log('   implied full-week sigma from the draw: ' + mean(spread).toFixed(1));
}
