/* THE FORECAST CURVE, AND THE LIVE SERIES BEHIND IT.
 *
 * wpAt - the probability at a single instant - was already covered by
 * test-schedule. Everything BETWEEN the live scoreboard and the drawn line was
 * not: the key a matchup is stored under, the slate-progress fraction that
 * decides how much football is left, the curve that turns a series of minutes
 * into points, and the SVG itself. That is the whole of what a manager watches
 * on a Sunday and none of it had a test.
 *
 * The series here is shaped exactly as livePoll writes it: [minute, a, b]
 * with a and b ordered by the sorted owner key, not by home and away.
 */
import { lifter, assemble } from './lib/lift.mjs';

const grab = lifter(new URL('../public/app.js', import.meta.url));

const M = assemble(grab, [
  'const SCHED_SD=',
  'const wpSd=',
  'function schedNormCdf(',
  'function wpAt(',
  'function wpSlateProgress(',
  'function wpCurve(',
  'function wpGraphSVG(',
  'const liveMKey=',
], ['liveMKey', 'wpAt', 'wpSd', 'wpCurve', 'wpSlateProgress', 'wpGraphSVG', 'schedNormCdf'], `
const sbZ=x=>x;
`);

let pass = 0, fail = 0;
const nl = String.fromCharCode(10);
function ok(name, cond, detail) {
  console.log((cond ? '  PASS  ' : '  FAIL  ') + name);
  if (!cond) { if (detail !== undefined) console.log('        ' + detail); fail++; } else pass++;
}
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

/* a real-shaped league: twelve owners, six games, everyone projected ~112 */
const OWNERS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l'];
const PROJ = {}; OWNERS.forEach((o, i) => { PROJ[o] = 105 + i; });
const ME = 'a', OPP = 'b';

console.log('1. THE KEY A MATCHUP IS STORED UNDER');
{
  ok('is the same whichever side asks', M.liveMKey('a', 'b') === M.liveMKey('b', 'a'));
  ok('and it is sorted, not home-first', M.liveMKey('z', 'a') === 'a~z');
  ok('two different games are two different keys',
     M.liveMKey('a', 'b') !== M.liveMKey('a', 'c'));
  /* the curve reads a and b back out by sorting the pair the same way; if these
     two ever disagreed the graph would show the opponent's line as yours */
  ok('splitting the key gives the pair back', M.liveMKey('a', 'b').split('~').join(',') === 'a,b');
}

console.log(nl + '2. A SUNDAY, MINUTE BY MINUTE');
{
  /* my game climbs from level to a comfortable win; the other five run alongside
     so the slate fraction advances like a real one */
  const series = {};
  const t0 = 28000000;
  const mine = [];
  const script = [[0, 0, 0], [30, 12, 9], [60, 34, 28], [120, 61, 55],
                  [180, 88, 70], [240, 104, 83], [300, 121, 96]];
  script.forEach(([dt, a, b]) => { if (a || b) mine.push([t0 + dt, a, b]); });
  series[M.liveMKey(ME, OPP)] = mine;
  for (let g = 1; g < 6; g++) {
    const x = OWNERS[g * 2], y = OWNERS[g * 2 + 1];
    series[M.liveMKey(x, y)] = script.filter(s => s[1] || s[2])
      .map(([dt, a, b]) => [t0 + dt, a - 3, b + 2]);
  }
  const mu0 = 0;
  const pts = M.wpCurve(series, PROJ, ME, OPP, mu0);

  ok('a point for kickoff plus one per reading', pts.length === mine.length + 1,
     pts.length + ' vs ' + (mine.length + 1));
  ok('it opens before the first reading', pts[0].t < mine[0][0]);
  ok('and opens at even-ish, since the two are evenly projected',
     Math.abs(pts[0].p - 0.5) < 0.05, pts[0].p);
  ok('the score it carries is the score that was on the board',
     pts[pts.length - 1].a === 121 && pts[pts.length - 1].b === 96);
  ok('a lead raises the probability', pts[pts.length - 1].p > pts[1].p);
  ok('and by the end it is nearly settled', pts[pts.length - 1].p > 0.9,
     pts[pts.length - 1].p);
  /* monotone here only because this script never gives the lead back */
  let climbs = true;
  for (let i = 2; i < pts.length; i++) if (pts[i].p < pts[i - 1].p - 1e-9) climbs = false;
  ok('a lead that never shrinks never dips the line', climbs);

  console.log(nl + '3. THE SAME GAME FROM THE OTHER BENCH');
  const opp = M.wpCurve(series, PROJ, OPP, ME, mu0);
  ok('reads the same scores, the other way round',
     opp[opp.length - 1].a === 96 && opp[opp.length - 1].b === 121);
  /* THE ONE THAT MATTERS. The series is keyed on a SORTED pair, so which of the
     two columns is "mine" flips depending on who is asking. Get it wrong and a
     manager watches their opponent's win probability all afternoon. */
  ok('and the two probabilities are complements',
     near(pts[pts.length - 1].p + opp[opp.length - 1].p, 1, 1e-9),
     pts[pts.length - 1].p + ' + ' + opp[opp.length - 1].p);
  /* 1e-6, not 1e-9: schedNormCdf is a rational approximation to the normal
     CDF, so the two sides agree to about a billionth rather than exactly. */
  let allComplement = true;
  for (let i = 0; i < pts.length; i++)
    if (!near(pts[i].p + opp[i].p, 1, 1e-6)) allComplement = false;
  ok('at every minute of the afternoon, not just the end', allComplement);
}

console.log(nl + '4. BEFORE A BALL IS KICKED');
{
  ok('an empty series still draws a line', (() => {
    const pts = M.wpCurve({}, PROJ, ME, OPP, 0);
    return pts.length === 1 && pts[0].a === 0 && pts[0].b === 0;
  })());
  ok('and the SVG renders from that single point', (() => {
    const pts = M.wpCurve({}, PROJ, ME, OPP, 0);
    const svg = M.wpGraphSVG(pts, 'AAA', 'BBB');
    return svg.indexOf('<svg') >= 0 && svg.indexOf('NaN') < 0;
  })());
  ok('a matchup nobody has scored in yet is the same as no series', (() => {
    const s = {}; s[M.liveMKey(ME, OPP)] = [];
    const a = M.wpCurve(s, PROJ, ME, OPP, 0), b = M.wpCurve({}, PROJ, ME, OPP, 0);
    return a.length === 1 && b.length === 1 && near(a[0].p, b[0].p);
  })());
  ok('an owner with no projection does not produce NaN', (() => {
    const pts = M.wpCurve({}, {}, ME, OPP, 0);
    return pts.every(q => Number.isFinite(q.p));
  })());
}

console.log(nl + '5. HOW MUCH FOOTBALL IS LEFT');
{
  const total = OWNERS.reduce((a, o) => a + PROJ[o], 0);
  const t0 = 28000000;
  const series = {};
  series[M.liveMKey(ME, OPP)] = [[t0, 50, 40]];
  const prog = M.wpSlateProgress(series, PROJ);
  ok('one game part-played is a small fraction of the slate',
     prog.length === 1 && near(prog[0][1], 90 / total, 1e-9), JSON.stringify(prog));
  /* every owner at their full projection is a finished slate */
  const full = {};
  for (let g = 0; g < 6; g++) {
    const x = OWNERS[g * 2], y = OWNERS[g * 2 + 1];
    full[M.liveMKey(x, y)] = [[t0, PROJ[[x, y].sort()[0]], PROJ[[x, y].sort()[1]]]];
  }
  const donep = M.wpSlateProgress(full, PROJ);
  ok('everyone at their projection reads as a full slate',
     near(donep[donep.length - 1][1], 1, 1e-9), JSON.stringify(donep));
  ok('and it is capped at one, however big the scores', (() => {
    const huge = {}; huge[M.liveMKey(ME, OPP)] = [[t0, 9999, 9999]];
    const p = M.wpSlateProgress(huge, PROJ);
    return p[p.length - 1][1] === 1;
  })());
  ok('the fraction never goes backwards as the day runs', (() => {
    const s = {}; s[M.liveMKey(ME, OPP)] = [[t0, 10, 8], [t0 + 60, 40, 33], [t0 + 120, 77, 70]];
    const p = M.wpSlateProgress(s, PROJ);
    return p.every((q, i) => i === 0 || q[1] >= p[i - 1][1]);
  })());
  ok('no games at all is no progress', M.wpSlateProgress({}, PROJ).length === 0);
}

console.log(nl + '6. THE DRAWN LINE');
{
  const t0 = 28000000;
  const s = {}; s[M.liveMKey(ME, OPP)] = [[t0, 20, 30], [t0 + 60, 55, 70], [t0 + 120, 90, 118]];
  const pts = M.wpCurve(s, PROJ, ME, OPP, 0);
  const svg = M.wpGraphSVG(pts, 'ME', 'OPP');
  ok('it is an svg', svg.indexOf('<svg') >= 0 && svg.indexOf('</svg>') >= 0);
  ok('with no NaN anywhere in the path', svg.indexOf('NaN') < 0, svg.slice(0, 200));
  ok('it names both sides for a screen reader',
     svg.indexOf('aria-label') >= 0 && svg.indexOf('ME win probability') >= 0);
  ok('the headline percentage matches the last point',
     svg.indexOf(Math.round(pts[pts.length - 1].p * 100) + ' percent') >= 0);
  /* two graphs on one page must not share a clip-path id, or one clips the
     other and half a line disappears */
  ok('two graphs get different clip ids', (() => {
    const a = M.wpGraphSVG(pts, 'ME', 'OPP'), b = M.wpGraphSVG(pts, 'ME', 'OPP');
    const idOf = x => (x.match(/clipPath id="([^"]+)"/) || [])[1];
    return idOf(a) && idOf(b) && idOf(a) !== idOf(b);
  })());
  ok('every coordinate it draws is finite', (() => {
    const nums = svg.match(/-?\d+\.?\d*/g) || [];
    return nums.every(n => Number.isFinite(Number(n)));
  })());
  ok('a losing line still draws', (() => {
    const bad = M.wpGraphSVG(M.wpCurve(s, PROJ, OPP, ME, 0), 'OPP', 'ME');
    return bad.indexOf('<svg') >= 0 && bad.indexOf('NaN') < 0;
  })());
  ok('and an empty list draws nothing rather than a broken tag',
     M.wpGraphSVG([], 'A', 'B') === '');
}

console.log(nl + '7. IT SAYS WHOSE LINE IT IS');
{
  /* A curve between two abbreviations is not a label: it does not say whose
     chance it is, what the middle means, or which end is kickoff. Green and
     red only say "above or below the line" to somebody who already knows which
     line it is. */
  const t0 = 28000000;
  const s2 = {}; s2[M.liveMKey(ME, OPP)] = [[t0, 20, 30], [t0 + 60, 55, 70]];
  const live = M.wpGraphSVG(M.wpCurve(s2, PROJ, ME, OPP, 0), 'MINE', 'THEIRS');
  ok('it names the side it is drawn for', live.indexOf('MINE win chance') >= 0);
  ok('and not the other side', live.indexOf('THEIRS win chance') < 0);
  ok('the halfway line is called 50%', live.indexOf('>50%<') >= 0);
  ok('the ends are called what they are',
     live.indexOf('kickoff') >= 0 && live.indexOf('>now<') >= 0);

  /* THE LABELS ARE NOT INSIDE THE SVG. It is drawn preserveAspectRatio="none"
     so the curve fills the panel, and that stretch smears any text in the
     viewBox horizontally by however wide the container is. */
  const svgOnly = live.slice(live.indexOf('<svg'), live.indexOf('</svg>'));
  ok('no text element inside the stretched viewBox', svgOnly.indexOf('<text') < 0,
     svgOnly.slice(0, 160));
  ok('the labels sit outside it instead',
     live.indexOf('</svg>') < live.indexOf('MINE win chance'));

  /* before kickoff there is no "now" and no elapsed time to point at */
  const pre = M.wpGraphSVG(M.wpCurve({}, PROJ, ME, OPP, 0), 'MINE', 'THEIRS');
  ok('a pre-kickoff panel says so', pre.indexOf('before kickoff') >= 0);
  ok('and does not claim a kickoff has happened', pre.indexOf('>kickoff<') < 0);
  ok('it still names the side', pre.indexOf('MINE win chance') >= 0);

  /* the same labels have to be right in the Schedule drawer, which draws the
     same function shorter */
  const short = M.wpGraphSVG(M.wpCurve(s2, PROJ, ME, OPP, 0), 'MINE', 'THEIRS', { h: 84 });
  ok('a shorter panel is labelled identically',
     short.indexOf('MINE win chance') >= 0 && short.indexOf('>50%<') >= 0);
  ok('and the aria-label still carries the percentage',
     /aria-label="MINE win probability, \d+ percent"/.test(short), short.slice(0, 200));
}

console.log(nl + '8. THE MINUTE STAMPS COME BACK IN ORDER');
{
  /* liveFlush merges another watcher's minutes in and re-sorts. A curve built
     from an unsorted series would zigzag across the panel. */
  const t0 = 28000000;
  const s = {};
  s[M.liveMKey(ME, OPP)] = [[t0, 10, 8], [t0 + 120, 90, 70], [t0 + 60, 50, 44]].sort((x, y) => x[0] - y[0]);
  const pts = M.wpCurve(s, PROJ, ME, OPP, 0);
  ok('the points run forward in time', pts.every((q, i) => i === 0 || q.t >= pts[i - 1].t),
     JSON.stringify(pts.map(q => q.t)));
  ok('and the scores run with them', pts[pts.length - 1].a === 90);
}

console.log(nl + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
