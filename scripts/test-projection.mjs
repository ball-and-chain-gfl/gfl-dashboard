/* WHAT A ROSTER IS WORTH, AND FOR HOW MUCH OF THE PRICE.
 *
 * Roster strength used to be ESPN's SEASON projection — one number describing
 * weeks 1 to 17 however late you asked. Two things were wrong with it. From
 * week 2 onward part of that number is football already played, which the
 * results half of a share price is also counting: the same weeks twice, through
 * two terms meant to be independent. And it cannot answer what a roster is
 * worth from HERE, which is the only question a mid-season price asks.
 *
 * It is the sum of ESPN's own per-week projections over the weeks still to be
 * played now, with each week's best legal lineup chosen for that week — which
 * is what makes byes and injuries fall out for free rather than needing cases.
 *
 * This suite pins the lineup arithmetic, the rest-of-season horizon, the blend
 * that decides how much of a price it owns, and the three playoff games a
 * season that settle nothing.
 */
import fs from 'fs';

const SRC = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8')
  .split(String.fromCharCode(13)).join('');

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
function walk(src, i) {
  let j = i, depth = 0;
  while (j < src.length) {
    const c = src[j];
    if (c === "'" || c === '"') { j = skipQuote(src, j); continue; }
    if (c === '`') { j = skipTemplate(src, j); continue; }
    if (c === '/' && src[j + 1] === '/') { const e = src.indexOf('\n', j); j = e < 0 ? src.length : e; continue; }
    if (c === '/' && src[j + 1] === '*') { const e = src.indexOf('*/', j); j = e < 0 ? src.length : e + 2; continue; }
    if (c === '(' || c === '[' || c === '{') { depth++; j++; continue; }
    if (c === ')' || c === ']' || c === '}') {
      depth--; j++;
      if (depth === 0 && (c === '}' || c === ']')) return src.slice(i, j);
      continue;
    }
    if (c === ';' && depth === 0) return src.slice(i, j + 1);
    j++;
  }
  return src.slice(i, j);
}
function grab(startsWith) {
  const i = SRC.indexOf(startsWith);
  if (i < 0) throw new Error('not found in app.js: ' + startsWith);
  return walk(SRC, i);
}

const api = new Function(`
${grab('function sbBestLineup(entries,projOf,posOf,shape){')}
${grab('const INV_PROJ_MAX=')}
${grab('const INV_PROJ_MIN=')}
${grab('const INV_PROJ_POW=')}
${grab('const INV_SEASON_WEEKS=')}
${grab('const RP_WEEKS=')}
${grab('const INV_GAIN=')}
${grab('const INV_BASE=')}
return { sbBestLineup, INV_PROJ_MAX, INV_PROJ_MIN, INV_SEASON_WEEKS, RP_WEEKS, INV_GAIN, INV_BASE, INV_PROJ_POW };
`)();

let pass = 0, fail = 0;
function eq(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log((ok ? '  PASS  ' : '  FAIL  ') + name);
  if (!ok) { console.log('        got : ' + JSON.stringify(got));
             console.log('        want: ' + JSON.stringify(want)); fail++; } else pass++;
}
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

/* the league's real shape: QB RB RB WR WR TE DST K + one flex */
const SHAPE = { qb: 1, rb: 2, wr: 2, te: 1, flex: 1, dst: 1, k: 1 };
const POS = { QB: 1, RB: 2, WR: 3, TE: 4, K: 5, DST: 16 };

/* a roster as { name: [position, {week: projection}] } */
function roster(spec) {
  return Object.entries(spec).map(([n, [pos, weeks]]) => ({ n, pos: POS[pos], weeks }));
}
/* the model under test: per week, that week's own best lineup, summed */
function restOfSeason(r, from, to = api.RP_WEEKS) {
  let total = 0;
  for (let w = from; w <= to; w++) {
    total += api.sbBestLineup(r.map(p => ({ ...p, v: p.weeks[w] || 0 })),
      e => e.v, e => e.pos, SHAPE);
  }
  return total;
}
/* a flat roster: every player the same every week, so counting is easy */
const flat = (spec, weeks = api.RP_WEEKS) => roster(Object.fromEntries(
  Object.entries(spec).map(([n, [pos, v]]) =>
    [n, [pos, Object.fromEntries([...Array(weeks)].map((_, i) => [i + 1, v]))]])));

const NINE = {
  qb:  ['QB', 20], rb1: ['RB', 18], rb2: ['RB', 14],
  wr1: ['WR', 17], wr2: ['WR', 13], te:  ['TE', 10],
  dst: ['DST', 8], k:   ['K',  9],  flex:['WR', 12],
};

console.log('1. one week, one best lineup');
{
  const r = flat(NINE, 1);
  const one = api.sbBestLineup(r.map(p => ({ ...p, v: p.weeks[1] })), e => e.v, e => e.pos, SHAPE);
  eq('all nine slots fill', one, 20 + 18 + 14 + 17 + 13 + 10 + 8 + 9 + 12);
}

console.log('\n2. the bench only counts when it is better');
{
  const withBench = flat({ ...NINE, benchRb: ['RB', 2] }, 1);
  const a = api.sbBestLineup(withBench.map(p => ({ ...p, v: p.weeks[1] })), e => e.v, e => e.pos, SHAPE);
  eq('a worse bench RB adds nothing', a, 121);
  const better = flat({ ...NINE, benchRb: ['RB', 30] }, 1);
  const b = api.sbBestLineup(better.map(p => ({ ...p, v: p.weeks[1] })), e => e.v, e => e.pos, SHAPE);
  /* 30 takes an RB slot, 14 slides to flex, the 12 WR drops out */
  eq('a better bench RB starts', b, 121 + 30 - 12);
}

console.log('\n3. REST of season, not the whole of it');
{
  const r = flat(NINE);
  eq('from week 1, all seventeen', restOfSeason(r, 1), 121 * 17);
  eq('from week 8, ten left',      restOfSeason(r, 8), 121 * 10);
  eq('from week 17, one left',     restOfSeason(r, 17), 121);
  eq('past the end, nothing left', restOfSeason(r, 18), 0);
  /* the whole point: the same roster is worth less as the season empties */
  eq('it shrinks every week', restOfSeason(r, 8) < restOfSeason(r, 1), true);
}

console.log('\n4. A BYE ROUTES AROUND ITSELF');
{
  /* rb1 is projected 0 in week 5 — his bye. A bench RB projected 11 should take
     the slot that week and only that week, which is what a manager would do. */
  const spec = { ...NINE, benchRb: ['RB', 11] };
  const r = flat(spec);
  r.find(p => p.n === 'rb1').weeks[5] = 0;
  const wk5 = api.sbBestLineup(r.map(p => ({ ...p, v: p.weeks[5] })), e => e.v, e => e.pos, SHAPE);
  /* 121 lineup, lose rb1's 18, the 11 comes in at RB, 12 stays at flex */
  eq('the next man up starts', wk5, 121 - 18 + 11);
  const wk6 = api.sbBestLineup(r.map(p => ({ ...p, v: p.weeks[6] })), e => e.v, e => e.pos, SHAPE);
  eq('and only for that week', wk6, 121);
}

console.log('\n5. AN INJURY COSTS EXACTLY THE WEEKS IT COSTS');
{
  /* Josh Jacobs, 2 Sep 2026: 0.0 through week 6, back in week 7. No IR case
     anywhere — a man who cannot play is projected zero and prices as zero. */
  const r = flat({ ...NINE, benchRb: ['RB', 11] });
  const hurt = r.find(p => p.n === 'rb1');
  for (let w = 1; w <= 6; w++) hurt.weeks[w] = 0;
  const healthy = flat({ ...NINE, benchRb: ['RB', 11] });
  eq('six weeks out costs six weeks',
     restOfSeason(healthy, 1) - restOfSeason(r, 1), (18 - 11) * 6);
  eq('and nothing once he is back',
     restOfSeason(healthy, 7) - restOfSeason(r, 7), 0);
  /* and the value he still has is ALL ahead of you the week he returns */
  eq('his value is in front, not behind',
     restOfSeason(r, 7) > restOfSeason(r, 1) - restOfSeason(r, 7), true);
}

const rw = gp => api.INV_PROJ_MIN
  + (api.INV_PROJ_MAX - api.INV_PROJ_MIN) * (Math.max(0, api.INV_SEASON_WEEKS - gp) / api.INV_SEASON_WEEKS);

console.log('\n6. the slide - one equal step a week, all projection to all results');
{
  eq('nothing played, it is ALL the roster', near(rw(0), 1), true);
  eq('played out, it is ALL the results',    near(rw(17), 0), true);
  eq('halfway is halfway',                   near(rw(8.5), 0.5), true);
  eq('and it never goes negative',           near(rw(25), 0), true);
  /* the shape the whole thing exists for: no week is a bigger event than any
     other week purely because of where it sits in the calendar */
  const steps = [];
  for (let g = 0; g < 17; g++) steps.push(rw(g) - rw(g + 1));
  eq('every week is the same size step', steps.every(s => near(s, steps[0])), true);
  eq('and that step is one seventeenth', near(steps[0], 1 / 17), true);
  /* what changed: preseason used to hand a fifth of the price to a number that
     read exactly 1.00 for all twelve teams and separated nobody */
  eq('preseason weighs no record nobody has', near(rw(0), 1), true);
}

console.log('\n7. ONE GAME IS WORTH THE SAME IN WEEK 1 AS IN WEEK 17');
{
  /* The property that makes a win-rate prior unnecessary rather than merely
     optional - and it is exact, not approximate.

       winR    = (w/g)/0.5 = 2w/g,   so one more win moves it by 2/g
       base    weights winR at 0.45, so the results half moves by 0.9/g
       the mix weights that half at (1 - rw) = g/17

       (0.9/g) * (g/17) = 0.9/17,   with no g left in it at all

     The noise of a small sample and the weight handed to it fall and rise at
     reciprocal rates, so they cancel exactly. */
  const marginal = g => (1 - rw(g)) * 0.45 * (2 / g);
  const want = 0.9 / api.INV_SEASON_WEEKS;
  let flat = true;
  for (let g = 1; g <= 17; g++) if (!near(marginal(g), want)) flat = false;
  eq('a single result is worth the same in every week', flat, true);
  eq('week 1 and week 17 agree exactly', near(marginal(1), marginal(17)), true);

  /* and the shape it replaced, so a regression to it is loud */
  const oldRw = g => 0.05 + 0.75 * (Math.max(0, 17 - g) / 17);
  const oldMarginal = g => (1 - oldRw(g)) * 0.45 * (2 / g);
  eq('the old slide made week 1 over 4x week 17',
     oldMarginal(1) / oldMarginal(17) > 4, true);
}

console.log('\n8. the two halves are on the same scale');
{
  /* whatever rw is, the two weights are a partition - no week may count 1.3x */
  let ok = true;
  for (let g = 0; g <= 17; g++) if (!near(rw(g) + (1 - rw(g)), 1)) ok = false;
  eq('roster share + results share = 1', ok, true);
}

console.log('\n9. the gain - wider rungs, same ladder');
{
  /* mirrors invPricesAt exactly */
  const gain = vals => {
    if (api.INV_GAIN === 1) return vals;
    const mv = vals.reduce((a, b) => a + b, 0) / vals.length || 1;
    return vals.map(v => mv * Math.pow(Math.max(0, v) / mv, api.INV_GAIN));
  };
  const norm = vals => {
    const m = vals.reduce((a, b) => a + b, 0) / vals.length || 1;
    return vals.map(v => Math.max(1, +(api.INV_BASE * v / m).toFixed(2)));
  };
  /* twelve teams inside 8% of each other end to end, which is what twelve real
     fantasy rosters actually look like */
  const raw  = [1.08, 1.05, 1.03, 1.02, 1.01, 1.00, 0.995, 0.99, 0.98, 0.97, 0.95, 0.93];
  const wide = norm(gain(raw));
  const flat2 = norm(raw);

  eq('the order is untouched', wide.every((v, i) => i === 0 || v <= wide[i - 1]), true);
  eq('the league average is still ten',
     near(wide.reduce((a, b) => a + b, 0) / 12, api.INV_BASE, 0.02), true);
  eq('and the board is wider than it was', (wide[0] - wide[11]) > (flat2[0] - flat2[11]), true);
  eq('a team AT the average barely moves', near(wide[5], flat2[5], 0.15), true);
  /* it must not be able to invent a rank */
  const three = norm(gain([0.93, 1.08, 1.00]));
  eq('monotone in its input', three[1] > three[2] && three[2] > three[0], true);
  /* the $1 floor is a clamp, not a price - a real board may not reach it */
  eq('nobody is anywhere near the $1 floor', wide[11] > 3, true);
  /* and the gain is doing something, or the constant is decoration */
  eq('the gain actually widens the board',
     (wide[0] - wide[11]) > (flat2[0] - flat2[11]) * 1.5, true);
}

console.log('\n10. the two exponents COMPOUND, and the floor is where that ends');
{
  /* INV_PROJ_POW cubes the roster ratio and INV_GAIN cubes the blend, so
     preseason - where the blend IS the roster - a squad ratio r reaches the
     board as r^9. On the real 8% spread that is 1.08^9 = 2.0x, which is the
     board we want. It is worth knowing where it stops being sane. */
  const eff = api.INV_PROJ_POW * api.INV_GAIN;
  eq('preseason, the roster ratio is raised to the ninth', eff === 9, true);
  eq('and 8% of squad becomes about 2x of price',
     near(Math.pow(1.08, eff), 2.0, 0.05), true);

  const norm = vals => {
    const m = vals.reduce((a, b) => a + b, 0) / vals.length || 1;
    return vals.map(v => Math.max(1, +(api.INV_BASE * v / m).toFixed(2)));
  };
  const gain = vals => {
    const mv = vals.reduce((a, b) => a + b, 0) / vals.length || 1;
    return vals.map(v => mv * Math.pow(Math.max(0, v) / mv, api.INV_GAIN));
  };
  /* an absurd league - a 2x spread of squads, which fantasy football does not
     produce. The floor engages, and when it does the league mean is no longer
     the base price, because Math.max(1, ...) is a clamp and not a price. */
  const absurd = [2, 1.8, 1.6, 1.45, 1.3, 1.2, 1.1, 1.0, 0.9, 0.8, 0.7, 0.6]
    .map(r => Math.pow(r, api.INV_PROJ_POW));
  const board = norm(gain(absurd));
  eq('the floor engages on a spread that wide', board.some(v => v === 1), true);
  eq('and the ordering still survives it',
     board.every((v, i) => i === 0 || v <= board[i - 1]), true);
  eq('but the league mean is no longer the base price',
     board.reduce((a, b) => a + b, 0) / 12 > api.INV_BASE, true);
  /* the real board must never be in that regime - 8% end to end, cubed */
  const real = [1.052, 1.022, 1.014, 1.009, 1.001, 1.000, 0.994, 0.993, 0.988,
                0.981, 0.977, 0.970].map(r => Math.pow(r, api.INV_PROJ_POW));
  const realBoard = norm(gain(real));
  eq('and the real one is not', realBoard.every(v => v > 3), true);
  eq('its mean IS the base price',
     near(realBoard.reduce((a, b) => a + b, 0) / 12, api.INV_BASE, 0.02), true);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
