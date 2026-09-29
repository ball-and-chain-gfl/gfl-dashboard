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
${grab('function sbBestLineup(entries,projOf,posOf,shape,repl){')}
${grab('const INV_PROJ_MAX=')}
${grab('const INV_PROJ_MIN=')}
${grab('const INV_PROJ_POW=')}
${grab('const INV_SEASON_WEEKS=')}
${grab('const RP_WEEKS=')}
${grab('const INV_GAIN=')}
${grab('const INV_RAMP_POW=')}
${grab('const INV_WIN_W=')}
${grab('const INV_SHRINK=')}
${grab('const INV_FORM_MAX=')}
${grab('const INV_FORM_FROM=')}
${grab('const INV_FORM_FULL=')}
${grab('const INV_BASE=')}
return { sbBestLineup, INV_PROJ_MAX, INV_PROJ_MIN, INV_SEASON_WEEKS, RP_WEEKS, INV_GAIN, INV_BASE,
  INV_PROJ_POW, INV_RAMP_POW, INV_WIN_W, INV_SHRINK, INV_FORM_MAX,
  INV_FORM_FROM, INV_FORM_FULL };
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

/* THE SHIPPED RAMP, CURVE AND ALL. This was a straight-line copy and the app
   grew an exponent, so the suite went on proving a slide nothing used -- every
   case below passed against a model that was no longer there. */
const rw = gp => api.INV_PROJ_MIN
  + (api.INV_PROJ_MAX - api.INV_PROJ_MIN)
    * Math.pow(Math.max(0, api.INV_SEASON_WEEKS - gp) / api.INV_SEASON_WEEKS, api.INV_RAMP_POW);

console.log('\n6. the slide - both ends fixed, the middle deliberately bent');
{
  /* THE ENDS ARE THE CONTRACT. Everything else about this curve is taste; that
     it starts at all-roster and finishes at all-results is not. */
  eq('nothing played, it is ALL the roster', near(rw(0), 1), true);
  eq('played out, it is ALL the results',    near(rw(17), 0), true);
  eq('and it never goes negative',           near(rw(25), 0), true);
  eq('it only ever falls', (() => {
    for (let g = 0; g < 17; g++) if (rw(g + 1) > rw(g) + 1e-12) return false;
    return true; })(), true);

  /* AND THE MIDDLE IS NOT HALFWAY ANY MORE, ON PURPOSE. Straight, the roster
     was 82% of a price three games in and the board could not see a 3-0 start.
     The exponent bends the early half down without moving either end. */
  eq('halfway through is past halfway', rw(8.5) < 0.5, true);
  eq('results have a quarter of it by game 3', (1 - rw(3)) > 0.24, true);
  eq('and it was under a fifth straight', (1 - (1 - 3 / 17)) < 0.18, true);

  /* the weeks are no longer equal steps, which is the trade being made */
  const steps = [];
  for (let g = 0; g < 17; g++) steps.push(rw(g) - rw(g + 1));
  eq('the early weeks move it more than the late ones', steps[0] > steps[16], true);
  eq('preseason weighs no record nobody has', near(rw(0), 1), true);
}

console.log('\n7. THE FLAT SWING WAS TRADED AWAY, AND HERE IS WHAT FOR');
{
  /* IT USED TO BE EXACT, AND IT WAS A GOOD PROPERTY.

       winR    = (w/g)/0.5 = 2w/g,   so one more win moves it by 2/g
       base    weighted winR at 0.45, so the results half moved by 0.9/g
       the mix weighted that half at (1 - rw) = g/17

       (0.9/g) * (g/17) = 0.9/17,   with no g left in it at all

     Small-sample noise and the weight handed to it fell and rose at reciprocal
     rates and cancelled, so one game was worth the same money in every week.

     IT WAS TRADED FOR A BOARD THAT CAN SEE A 3-0 START. Straight, the roster
     was 82% of a price three games in; the dearest share in the league belonged
     to a 1-2 team while two 3-0 teams sat below it. Bending the ramp fixes that
     and costs the cancellation -- an early game now moves a price more than a
     late one.

     WHAT PAYS FOR IT is INV_SHRINK. The old model believed a win rate whole;
     this one believes 60% of it, which is nearer the 0.4 that four seasons of
     this league's own scoring actually support. More weight on a number that
     is trusted less. */
  const marginal = g => (1 - rw(g)) * api.INV_WIN_W * api.INV_SHRINK * (2 / g);
  eq('an early game moves a price more than a late one',
     marginal(1) > marginal(17), true);
  eq('but not by the four times the old pre-2026 slide did',
     marginal(1) / marginal(17) < 4, true);
  eq('and every week still moves it', (() => {
    for (let g = 1; g <= 17; g++) if (!(marginal(g) > 0)) return false;
    return true; })(), true);
  /* the straight ramp is still exactly flat, which is what was given up */
  const straight = g => (Math.max(0, 17 - g) / 17);
  const flatMarg = g => (1 - straight(g)) * api.INV_WIN_W * api.INV_SHRINK * (2 / g);
  eq('a straight ramp would still have cancelled exactly',
     near(flatMarg(1), flatMarg(17)), true);

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

  /* THE SWING THAT REACHES THE BOARD, not the one inside the blend.
     Section 7 proves the results half moves by a constant. The gain then
     multiplies whatever the blend produced, so the delivered figure is larger
     - but a monotone transform applied to all twelve alike cannot make one
     week's game matter more than another's, and this says so in dollars
     rather than in algebra. */
  const swingAt = g => {
    const rwv = rw(g);
    /* twelve identical squads, so the ONLY thing moving is one team's record.
       Scoring is held at the league average, so this isolates the win term. */
    const mk = w => {
      const v = [];
      for (let i = 0; i < 12; i++) {
        const wins = (i === 5) ? w : g / 2;
        const winR = (wins / g) / 0.5;
        const raw = api.INV_WIN_W * winR + (1 - api.INV_WIN_W) * 1;
        v.push((1 - rwv) * (1 + api.INV_SHRINK * (raw - 1)) + rwv * 1);
      }
      return v;
    };
    return norm(gain(mk(g / 2 + 0.5)))[5] - norm(gain(mk(g / 2 - 0.5)))[5];
  };
  /* THE FLAT SWING IS GONE, AND THAT IS THE TRADE. A straight ramp cancelled
     win-rate noise exactly -- it falls as 1/g and the results weight rose as
     g/17 -- so one game was worth the same money in every week of the season.
     Bending the ramp buys an early board that can see a 3-0 start, and pays
     for it by making an early game worth more than a late one. The shrink is
     what keeps that from being reckless: a result is only believed 60% now.

     What must still hold is that a game is always worth SOMETHING, always the
     same direction, and never an absurd amount. */
  const swings = [];
  for (let g = 1; g <= 17; g++) swings.push(swingAt(g));
  eq('a win always moves the price up', swings.every(s => s > 0), true);
  eq('an early game is worth more than a late one', swings[0] > swings[16], true);
  eq('and no single game is worth more than four dollars',
     swings.every(s => s < 4), true);
  eq('nor less than a dime', swings.every(s => s > 0.1), true);
}

console.log('\n10. THE TWO EXPONENTS MUST NOT COMPOUND');
{
  /* They did. INV_PROJ_POW cubed the roster ratio and INV_GAIN cubed the blend
     containing it, so preseason -- where the blend IS the roster -- a squad
     ratio reached the board as r^9. Seventeen per cent of roster came out as
     four and a half times of price, and the dearest share in the league
     belonged to a 1-2 team. The roster is stretched ONCE now, at the end,
     with everything else. */
  const eff = api.INV_PROJ_POW * api.INV_GAIN;
  eq('the roster ratio is not pre-stretched', api.INV_PROJ_POW === 1, true);
  eq('so it reaches the board at the gain and no more', eff === api.INV_GAIN, true);
  eq('and 8% of squad is a sane multiple of price',
     Math.pow(1.08, eff) < 1.5, true);

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

/* ── A STARTING SLOT IS NEVER WORTH NOTHING ──────────────────────────────────
   A slot with nobody in it scored zero, and so did one filled by a player ESPN
   projects at zero — an injury, a bye, a man who is not going to play. The
   Tinglers hold one quarterback, Jayden Daniels at 0.0 in week 3 and no backup,
   so the board priced them as a team fielding nobody there: 107.65 against
   Motor City's 115.82, an eight point spread on a hole in the roster.

   Nobody fields nobody. A zero slot is worth what the wire is worth at that
   position, which sbReplLevel puts at the top five free agents averaged. */
console.log('\n8. a hole in the lineup is priced off the waiver wire');
{
  const REPL = { 1: 15.4, 2: 7.1, 3: 8.2, 4: 8.15, 5: 7.7, 16: 5.6 };
  const one = (spec, repl) => api.sbBestLineup(
    roster(Object.fromEntries(Object.entries(spec).map(([n, [p, v]]) => [n, [p, { 1: v }]])))
      .map(p => ({ ...p, v: p.weeks[1] })),
    e => e.v, e => e.pos, SHAPE, repl);

  const FULL = 20 + 18 + 14 + 17 + 13 + 10 + 8 + 9 + 12;

  /* the control: a complete roster is untouched by any of this */
  eq('a full lineup is worth exactly what it holds',
    one(NINE, REPL), FULL);
  eq('and the same with no replacement table at all',
    one(NINE, undefined), FULL);

  /* the Tinglers: a quarterback on the roster, projected nothing */
  const hurt = { ...NINE, qb: ['QB', 0] };
  eq('a zero at quarterback used to cost the whole slot',
    one(hurt, undefined), FULL - 20);
  eq('now it is worth the wire', one(hurt, REPL), FULL - 20 + 15.4);

  /* and no quarterback at all is the same situation */
  const none = { ...NINE }; delete none.qb;
  eq('no quarterback on the roster reads the same',
    one(none, REPL), FULL - 20 + 15.4);

  /* it is not quarterback-specific */
  eq('a zero kicker takes the kicker wire',
    one({ ...NINE, k: ['K', 0] }, REPL), FULL - 9 + 7.7);
  eq('a zero defence takes the defence wire',
    one({ ...NINE, dst: ['DST', 0] }, REPL), FULL - 8 + 5.6);

  /* the flex is allowed three positions, so it takes the best of the three */
  const noFlex = { ...NINE }; delete noFlex.flex;
  eq('an unfillable flex takes the best of RB, WR and TE',
    one(noFlex, REPL), FULL - 12 + 8.2);

  /* a real starter below replacement is LEFT ALONE. Whether a manager would
     upgrade him is a different question from whether they have anybody at all,
     and answering it here would lift every thin roster in the league. */
  eq('a poor but real starter is not topped up',
    one({ ...NINE, te: ['TE', 2] }, REPL), FULL - 10 + 2);

  /* a bench player covers the hole before the wire does */
  eq('a backup on the bench is used first',
    one({ ...NINE, qb: ['QB', 0], qb2: ['QB', 11] }, REPL), FULL - 20 + 11);
  eq('even a bad one, if he is better than nothing',
    one({ ...NINE, qb: ['QB', 0], qb2: ['QB', 3] }, REPL), FULL - 20 + 3);

  /* a position missing from the table is still worth nothing rather than NaN */
  eq('no entry for the position falls back to zero',
    one({ ...NINE, qb: ['QB', 0] }, { 2: 7.1 }), FULL - 20);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
