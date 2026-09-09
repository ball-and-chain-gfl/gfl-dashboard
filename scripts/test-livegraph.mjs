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
  'const BENCH_SLOTS=',
  'const NFL_TEAMS=',
  'const LIVE_BUCKET_MIN=',
  'const liveBucket=',
  'const liveProTeams=',
  'const liveSideOn=',
  'const liveMatchupOn=',
  'function liveNote(arr,t,a,b){',
], ['liveMKey', 'wpAt', 'wpSd', 'wpCurve', 'wpSlateProgress', 'wpGraphSVG', 'schedNormCdf',
    'LIVE_BUCKET_MIN', 'liveBucket', 'liveProTeams', 'liveSideOn', 'liveMatchupOn', 'liveNote'], `
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

console.log(nl + '7. THE PANEL CARRIES A WHOLE Y AXIS AND NOTHING ELSE');
{
  /* Three numbers in a column beside the plot are an axis. ONE number floating
     on the midline was not -- it read as a second value disagreeing with the
     headline above it, which is exactly the complaint that got it removed. So
     50% only ever appears with 100% and 0% around it. */
  const t0 = 28000000;
  const s2 = {}; s2[M.liveMKey(ME, OPP)] = [[t0, 20, 30], [t0 + 60, 55, 70]];
  const live = M.wpGraphSVG(M.wpCurve(s2, PROJ, ME, OPP, 0), 'MINE', 'THEIRS');

  ok('the scale runs top to bottom',
     live.indexOf('>100%<') >= 0 && live.indexOf('>50%<') >= 0 && live.indexOf('>0%<') >= 0);
  ok('50% never appears without the ends of the scale around it',
     live.indexOf('>50%<') < 0 || (live.indexOf('>100%<') >= 0 && live.indexOf('>0%<') >= 0));
  ok('the ends of the afternoon are called what they are',
     live.indexOf('>kickoff<') >= 0 && live.indexOf('>now<') >= 0);
  ok('it does not caption itself over the graph', live.indexOf('win chance') < 0);
  ok('and neither abbreviation is printed on the panel',
     live.indexOf('>MINE<') < 0 && live.indexOf('>THEIRS<') < 0);

  /* the axis is a GUTTER, not an overlay: a scale drawn on top of the curve is
     a scale competing with the thing it measures */
  ok('the plot is inset by the gutter', /padding-left:\d+px/.test(live), live.slice(0, 220));
  ok('and the gutter width is published for the labels that need it',
     live.indexOf('--wpax:') >= 0);

  /* the accessible name is NOT a visible caption and still has to identify the
     line -- a screen reader has no key to read */
  ok('the screen reader is still told whose line it is',
     /aria-label="MINE win probability, \d+ percent"/.test(live), live.slice(0, 300));

  /* THE LABELS ARE NOT INSIDE THE SVG. It is drawn preserveAspectRatio="none"
     so the curve fills the panel, and that stretch smears any text in the
     viewBox horizontally by however wide the container is. */
  const svgOnly = live.slice(live.indexOf('<svg'), live.indexOf('</svg>'));
  ok('no text element inside the stretched viewBox', svgOnly.indexOf('<text') < 0,
     svgOnly.slice(0, 160));

  /* THE AXIS LINES UP WITH WHAT IT MEASURES. The svg carries its height inline,
     so a label placed at y(p) px sits exactly on the p the curve would. */
  const H = Number(live.match(/style="height:(\d+)px"/)[1]);
  const at = t => Number(live.match(new RegExp('top:([0-9.]+)px">' + t)) [1]);
  ok('100% sits at the top of the plot, not the top of the box',
     at('100%') > 0 && at('100%') < H * 0.12, at('100%') + ' of ' + H);
  ok('0% sits at the bottom of the plot', at('0%') > H * 0.88 && at('0%') < H, at('0%'));
  ok('and 50% is exactly halfway between them',
     Math.abs(at('50%') - (at('100%') + at('0%')) / 2) < 0.1,
     at('100%') + ' / ' + at('50%') + ' / ' + at('0%'));

  /* nothing has kicked off, so there are no ends to name -- but a chart with no
     scale is not a chart, so the axis stays */
  const pre = M.wpGraphSVG(M.wpCurve({}, PROJ, ME, OPP, 0), 'MINE', 'THEIRS');
  ok('a pre-kickoff panel names no ends at all',
     pre.indexOf('kickoff') < 0 && pre.indexOf('>now<') < 0, pre.slice(0, 300));
  ok('but it still carries the whole scale',
     pre.indexOf('>100%<') >= 0 && pre.indexOf('>50%<') >= 0 && pre.indexOf('>0%<') >= 0);
  ok('and still names the line for a screen reader',
     /aria-label="MINE win probability/.test(pre));

  /* the Schedule drawer draws the same function shorter, and the axis has to
     follow the viewBox rather than a number pinned in the stylesheet */
  const short = M.wpGraphSVG(M.wpCurve(s2, PROJ, ME, OPP, 0), 'MINE', 'THEIRS', { h: 84 });
  const sh = Number(short.match(/style="height:(\d+)px"/)[1]);
  const sAt = t => Number(short.match(new RegExp('top:([0-9.]+)px">' + t))[1]);
  ok('a shorter panel is labelled the same way',
     short.indexOf('>100%<') >= 0 && short.indexOf('win chance') < 0);
  ok('and its axis is scaled to it, not to the tall one',
     sh === 84 && sAt('0%') < at('0%') && Math.abs(sAt('50%') - 42) < 0.1,
     sh + ' / ' + sAt('50%'));
}

console.log(nl + '7b. WHEN A READING IS WORTH TAKING');
{
  /* THE COMPLAINT THIS ANSWERS. Readings used to go down only when a score
     MOVED, so an hour of two evenly matched teams trading nothing came out as
     one straight segment and a frantic ninety seconds of touchdowns spread
     over a third of the panel. The panel plots at equal spacing, so the points
     have to be equally spaced in time for the shape to be a retelling. */
  ok('the grid is five minutes', M.LIVE_BUCKET_MIN === 5);
  const at = s => M.liveBucket(Date.parse('2026-09-13T' + s + 'Z'));
  ok('a bucket holds five minutes', at('17:01:00') === at('17:04:59'));
  ok('and the next five are the next bucket', at('17:05:00') - at('17:01:00') === 5);
  ok('the stamps are still minutes since the epoch, as the archive holds them',
     at('17:05:00') === Math.floor(Date.parse('2026-09-13T17:05:00Z') / 60000));

  /* one reading per bucket, whoever writes it */
  const arr = [];
  ok('a fresh bucket is recorded', M.liveNote(arr, at('17:01:00'), 0, 0) === true);
  ok('and 0-0 counts: the kickoff of a game nobody has scored in yet is a real moment',
     arr.length === 1 && arr[0][1] === 0);
  ok('the same bucket again with the same score is not a second point',
     M.liveNote(arr, at('17:04:00'), 0, 0) === false && arr.length === 1);
  ok('the same bucket with a fuller look replaces it in place',
     M.liveNote(arr, at('17:04:00'), 6.4, 0) === true && arr.length === 1 && arr[0][1] === 6.4);
  ok('a stale look at the same bucket does not undo it',
     M.liveNote(arr, at('17:04:00'), 2, 0) === false && arr[0][1] === 6.4);
  ok('a bucket older than the last one is dropped, not spliced in',
     M.liveNote(arr, at('16:40:00'), 99, 99) === false && arr.length === 1);

  /* THE POINT OF THE WHOLE CHANGE: a flat score in a new bucket is still a
     point. Two evenly matched teams get width for the time they spent level. */
  ok('a NEW bucket with an unchanged score is recorded anyway',
     M.liveNote(arr, at('17:06:00'), 6.4, 0) === true && arr.length === 2);
  ok('so a level hour is twelve points wide, not one',
     (() => {
       const a2 = []; let t = at('17:00:00');
       for (let i = 0; i < 12; i++) { M.liveNote(a2, t + i * 5, 50, 50); }
       return a2.length === 12;
     })());

  /* ONLY WHILE SOMEBODY IS PLAYING. A reading at 4am on a Friday is a point on
     the graph at a moment nothing could have happened. */
  const on = M.liveProTeams({ games: [
    { s: 'in', ht: 'SEA', at: 'NE' }, { s: 'pre', ht: 'KC', at: 'DEN' },
    { s: 'post', ht: 'GB', at: 'CHI' }] });
  ok('only the game in progress puts teams on the field',
     [...on].sort().join(',') === 'NE,SEA', [...on].join(','));
  ok('nothing in progress is nobody on the field',
     M.liveProTeams({ games: [{ s: 'pre', ht: 'SEA', at: 'NE' }] }).size === 0);
  ok('and a digest that never arrived is nobody, not everybody',
     M.liveProTeams(null).size === 0);

  /* 26 is SEA, 17 is NE, 12 is KC. Bench slots are 20, 21 and 24. */
  const side = (...es) => ({ rosterForCurrentScoringPeriod: { entries:
    es.map(([slot, pro]) => ({ lineupSlotId: slot, playerPoolEntry: { player: { proTeamId: pro } } })) } });
  ok('a starter on the field lights the side up', M.liveSideOn(side([0, 26]), on) === true);
  ok('a starter whose team is not playing does not', M.liveSideOn(side([0, 12]), on) === false);
  ok('a FLEX is a starter', M.liveSideOn(side([23, 26]), on) === true);
  ok('a BENCH player on the field is not', M.liveSideOn(side([20, 26]), on) === false);
  ok('nor is one stashed on IR', M.liveSideOn(side([21, 26]), on) === false);
  ok('one starter out of a full lineup is enough',
     M.liveSideOn(side([0, 12], [2, 12], [4, 17]), on) === true);
  ok('an empty roster is not on the field', M.liveSideOn(side(), on) === false);

  /* the matchup is on if EITHER side is */
  const m = (h, a) => ({ home: h, away: a });
  ok('either side playing makes the matchup live',
     M.liveMatchupOn(m(side([0, 12]), side([0, 26])), on) === true);
  ok('neither side playing does not',
     M.liveMatchupOn(m(side([0, 12]), side([0, 7])), on) === false);
  /* which is the manager whose last starter finished on Thursday: their
     matchup stops taking up width on Sunday, and that is correct */
  ok('and with nothing live at all, no matchup is',
     M.liveMatchupOn(m(side([0, 26]), side([0, 17])), new Set()) === false);
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
