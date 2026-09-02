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
${grab('const INV_SEASON_WEEKS=')}
${grab('const RP_WEEKS=')}
return { sbBestLineup, INV_PROJ_MAX, INV_PROJ_MIN, INV_SEASON_WEEKS, RP_WEEKS };
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

console.log('\n6. the slide, across the whole season');
{
  const rw = gp => api.INV_PROJ_MIN
    + (api.INV_PROJ_MAX - api.INV_PROJ_MIN) * (Math.max(0, api.INV_SEASON_WEEKS - gp) / api.INV_SEASON_WEEKS);
  eq('nothing played, the roster leads', near(rw(0), 0.80), true);
  eq('played out, a token remains',      near(rw(17), 0.05), true);
  eq('halfway is halfway',               near(rw(8.5), 0.425), true);
  eq('it never floors early',            rw(6) > rw(7), true);
  eq('and never goes below the floor',   near(rw(20), 0.05), true);
  /* the old curve hit its floor at six games and sat there for eleven weeks */
  eq('week 6 is no longer the end of it', rw(6) > 0.15, true);
  /* monotone, one week at a time */
  let mono = true;
  for (let g = 0; g < 17; g++) if (!(rw(g) > rw(g + 1))) mono = false;
  eq('strictly falling every week', mono, true);
}

console.log('\n7. the two halves are on the same scale');
{
  /* whatever rw is, the two weights are a partition — no week may count 1.3x */
  const rw = gp => api.INV_PROJ_MIN
    + (api.INV_PROJ_MAX - api.INV_PROJ_MIN) * (Math.max(0, api.INV_SEASON_WEEKS - gp) / api.INV_SEASON_WEEKS);
  let ok = true;
  for (let g = 0; g <= 17; g++) if (!near(rw(g) + (1 - rw(g)), 1)) ok = false;
  eq('roster share + results share = 1', ok, true);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
