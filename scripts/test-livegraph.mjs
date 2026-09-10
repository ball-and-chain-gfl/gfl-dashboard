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
  'function liveSideScore(side){',
  'function liveWithScores(m){',
  'function liveWpOf(m,aFirst){',
  'const liveProProgress=',
  'const LIVE_VOLUME=',
  'const LIVE_USAGE_R=',
  'const LIVE_EFF_R=',
  'const LIVE_EFF_SKIP=',
  'const liveEffW=',
  'const liveUsageW=',
  'function liveScoreLine(line,rules){',
  'function livePlayerLeft(entry,f,rules){',
  'function liveSideProj(side){',
  'function liveSideLeft(side,prog,rules){',
  'function liveNote(arr,t,a,b,p,la,lb,fa,fb){',
], ['liveMKey', 'wpAt', 'wpSd', 'wpCurve', 'wpSlateProgress', 'wpGraphSVG', 'schedNormCdf',
    'LIVE_BUCKET_MIN', 'liveBucket', 'liveProTeams', 'liveSideOn', 'liveMatchupOn',
    'liveNote', 'liveWpOf', 'liveSideScore', 'liveWithScores', 'liveEffW', 'liveSideProj',
    'liveProProgress', 'liveSideLeft', 'livePlayerLeft', 'liveScoreLine',
    'liveUsageW', 'LIVE_USAGE_R'], `
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

console.log(nl + '7c. THE LINE MOVES ON THE SCORES');
{
  /* WHAT WENT WRONG, IN ORDER. The series held scores and nothing else, so
     every point was recomputed from mu0 -- today's anchor -- each time the
     panel drew, and on the night of the week 1 opener the whole flat line slid
     up and down as one. The first read was that a reading should carry the
     probability published AT it, so a point written at 00:20 never moves.

     Then the reason the line was flat turned out to be the real story: ESPN's
     matchup TOTAL does not update during a game, its winProbability is
     computed off that total, and so the published probability is frozen for
     the whole afternoon too. A frozen number recorded faithfully is still a
     frozen number. So the published one is the opening anchor -- which is what
     mu0 has always been -- and the line moves on the scores, which are live
     now they are read off the players rather than the fixture. */
  const t0 = 28000000;
  const moving = {};
  moving[M.liveMKey(ME, OPP)] = [[t0,0,0,0.5],[t0+5,7.8,0,0.5],[t0+10,7.8,12.4,0.5],
    [t0+15,24.1,12.4,0.5],[t0+20,24.1,31.0,0.5]];
  const drawn = M.wpCurve(moving, PROJ, ME, OPP, 0).map(q => Math.round(q.p * 100));

  ok('a series of moving scores draws a shape, not a level',
     new Set(drawn.slice(1)).size === 5, drawn.join(','));
  ok('and it follows the lead: ahead, behind, ahead, behind',
     drawn[2] > drawn[1] && drawn[3] < drawn[2] && drawn[4] > drawn[3] && drawn[5] < drawn[4],
     drawn.join(','));
  ok('a frozen ESPN number does not flatten it', new Set(drawn.slice(1)).size > 1);

  /* the recorded number still travels with the point -- it is the only record
     of what ESPN was saying at the time, and the line that would use it if
     that number ever starts moving mid-game is one line */
  const pts = M.wpCurve(moving, PROJ, ME, OPP, 0);
  ok('the published number is kept on the point', pts[1].q === 0.5, String(pts[1].q));
  ok('and a reading without one carries null',
     (() => { const s2 = {}; s2[M.liveMKey(ME,OPP)] = [[t0,1,2]];
              return M.wpCurve(s2, PROJ, ME, OPP, 0)[1].q === null; })());

  /* level scores still read level, which is the whole point of recording a
     reading every five minutes whether or not anything moved */
  const level = {};
  level[M.liveMKey(ME, OPP)] = [0,1,2,3,4,5].map(i => [t0 + i*5, 40, 40, 0.5]);
  const flat = M.wpCurve(level, PROJ, ME, OPP, 0).map(q => Math.round(q.p * 100));
  ok('a level matchup draws level', new Set(flat.slice(1)).size === 1, flat.join(','));
}

console.log(nl + "7c2. BECAUSE ESPN'S MATCHUP TOTAL IS NOT LIVE");
{
  /* Checked during the week 1 opener with the NFL game at 7-0 in the second
     quarter: every fixture in the league read 0-0 at the matchup level while
     the players underneath carried Drake Maye 7.76, the Seattle defence 8,
     Jaxon Smith-Njigba 4.1. totalPointsLive read 0 too. Everything live on the
     site was reading that field. */
  const BENCH = [20, 21, 24];
  const side = (tot, ...pts) => ({ totalPoints: tot, rosterForCurrentScoringPeriod: { entries:
    pts.map(([slot, v]) => ({ lineupSlotId: slot, playerPoolEntry: { appliedStatTotal: v } })) } });

  ok('a side scores what its starters have banked',
     M.liveSideScore(side(0, [0, 7.76], [2, 1.2], [16, 8])) === 16.96);
  ok('the bench does not count',
     M.liveSideScore(side(0, [0, 7.76], [20, 99], [21, 99], [24, 99])) === 7.76);
  ok('and it is rounded to the cent',
     M.liveSideScore(side(0, [0, 1.2000000000000002], [2, 0.1])) === 1.3);
  ok('a side with no roster in hand answers nothing, not zero',
     M.liveSideScore({ totalPoints: 0 }) === null);

  /* ZERO IS ESPN NOT TALKING. There is no other way to read a matchup total of
     nothing, so the roster sum fills a silence and never overrides a number. */
  const live = M.liveWithScores({ home: side(0, [0, 8]), away: side(0, [0, 3.2]) });
  ok('a fixture reading 0-0 takes its starters',
     live.home.totalPoints === 8 && live.away.totalPoints === 3.2,
     live.home.totalPoints + '-' + live.away.totalPoints);

  const settled = M.liveWithScores({ home: side(118.4, [0, 9]), away: side(102.1, [0, 4]) });
  ok('a fixture ESPN has scored keeps ITS number, not ours',
     settled.home.totalPoints === 118.4 && settled.away.totalPoints === 102.1,
     settled.home.totalPoints + '-' + settled.away.totalPoints);

  const half = M.liveWithScores({ home: side(88.2, [0, 9]), away: side(0, [0, 4]) });
  ok('and one side reported, one not, is handled a side at a time',
     half.home.totalPoints === 88.2 && half.away.totalPoints === 4);

  ok('a fixture with no rosters at all is left exactly as it came',
     M.liveWithScores({ home: { totalPoints: 5 }, away: { totalPoints: 6 } }).home.totalPoints === 5);
  ok('and a malformed one does not throw', M.liveWithScores(null) === null);
}

console.log(nl + '7c3. THE LINE CHANGES COLOUR WHERE IT CROSSES, NOT ALONG ITS LENGTH');
{
  /* THE BUG. The line was drawn twice over itself and clipped to the two
     halves of the panel. That is right for a FILL, whose edge is the midline,
     and wrong for a STROKE, which has width: a line sitting on or near 50% has
     the top half of its 2.2px clipped into the green copy and the bottom half
     into the red one, so it comes out two-toned along its WHOLE LENGTH rather
     than changing colour where it crosses. On an even matchup that is the
     entire line, which is exactly what the Miners against the Marathon Men
     looked like all Wednesday evening. */
  const t0 = 28000000;
  const mk = rows => { const o = {}; o[M.liveMKey(ME, OPP)] = rows; return o; };
  const runs = h => ({ up: (h.match(/wp-line up/g) || []).length,
                       dn: (h.match(/wp-line dn/g) || []).length });
  const draw = rows => runs(M.wpGraphSVG(M.wpCurve(mk(rows), PROJ, ME, OPP, 0), 'A', 'B'));

  const ahead = draw([[t0, 60, 10], [t0 + 5, 70, 10]]);
  ok('a line that never dips is one colour', ahead.up === 1 && ahead.dn === 0,
     JSON.stringify(ahead));
  const behind = draw([[t0, 10, 60], [t0 + 5, 10, 70]]);
  ok('and one that never rises is the other', behind.up === 0 && behind.dn === 1,
     JSON.stringify(behind));

  /* A LEVEL MATCHUP IS ONE COLOUR, NOT TWO. This is the case that was broken:
     the stroke straddled the clip boundary and every pixel of it was both. */
  const level = draw([[t0, 40, 40], [t0 + 5, 40, 40]]);
  ok('a line sitting exactly on 50% is not two-toned', level.up === 1 && level.dn === 0,
     JSON.stringify(level));

  const once = draw([[t0, 60, 10], [t0 + 5, 10, 60]]);
  ok('a line that crosses is cut in two', once.up === 1 && once.dn === 1, JSON.stringify(once));
  const twice = draw([[t0, 60, 10], [t0 + 5, 10, 60], [t0 + 10, 80, 10]]);
  ok('and crossing back cuts it again', twice.up === 2 && twice.dn === 1, JSON.stringify(twice));

  /* the two runs must MEET on the midline: a gap reads as a broken line and an
     overlap puts one colour over the other */
  const svg = M.wpGraphSVG(M.wpCurve(mk([[t0, 60, 10], [t0 + 5, 10, 60]]), PROJ, ME, OPP, 0), 'A', 'B');
  const pl = [...svg.matchAll(/<polyline points="([^"]+)"/g)].map(m => m[1].trim().split(/\s+/));
  ok('there are exactly two runs', pl.length === 2, String(pl.length));
  ok('and the first ends where the second begins',
     pl[0][pl[0].length - 1] === pl[1][0], pl[0][pl[0].length - 1] + ' vs ' + pl[1][0]);
  const midY = Number(pl[1][0].split(',')[1]);
  const H = Number(svg.match(/style="height:(\d+)px"/)[1]);
  ok('and they meet on the midline itself', Math.abs(midY - H / 2) < 0.1, midY + ' of ' + H);

  /* the clipped double-draw is gone; the fills still use their clips */
  ok('the stroke is no longer drawn twice and clipped',
     /class="wp-line up" clip-path/.test(svg) === false);
  ok('but the fills still are', /class="wp-fill up" clip-path/.test(svg));

  /* a zero-length run draws a dot under a round linecap, and a stray dot in
     the wrong colour at the left edge is worse than nothing */
  const opensLevel = M.wpGraphSVG(M.wpCurve(mk([[t0, 10, 60]]), PROJ, ME, OPP, 0), 'A', 'B');
  ok('a run with nowhere to go is dropped rather than drawn as a dot',
     (opensLevel.match(/wp-line up/g) || []).length === 0, opensLevel.slice(0, 200));

  ok('nothing NaN gets into a segment', svg.indexOf('NaN') < 0);
}

console.log(nl + '7c4. EACH SIDE GETS ITS OWN REMAINING WEEK');
{
  /* THE BUG. wpAt scaled the remaining projection by ONE league-wide figure --
     the whole slate's points over the whole slate's projections -- which
     assumes every roster plays at the same pace. In a week where it does, that
     is right. In a week where one manager is Thursday-heavy and the other is
     Monday-heavy it is badly wrong, and it was wrong in the worst possible
     way: a thirty point lead read the SAME whether the opponent had finished
     their roster or had not started it. */
  const P = 105;
  const pct = (a, b, f, mu0, lA, lB) => Math.round(M.wpAt(a, b, P, P, f, mu0, lA, lB) * 100);

  const blind = pct(30, 0, 0.22, 0);                     // no per-side figures
  const oppDone = pct(30, 0, 0.22, 0, 0.60*P, 0.05*P);  // I am 40% done, they are 95%
  const oppFresh = pct(30, 0, 0.22, 0, 0.60*P, 0.95*P); // I am 40% done, they have not started
  ok('a thirty point lead is not one number', oppDone !== oppFresh,
     blind + ' / ' + oppDone + ' / ' + oppFresh);
  ok('leading against a roster that is finished is nearly won', oppDone > 90, String(oppDone));
  ok('leading against one that has not started is not', oppFresh < 55, String(oppFresh));
  ok('and the old blind answer sat between them, wrong both ways',
     blind > oppFresh && blind < oppDone, blind + ' vs ' + oppFresh + '/' + oppDone);

  /* SYMMETRIC WEEKS ARE UNCHANGED, which is most of them and was all of the
     week 1 opener: one starter each, both sides equally far through. */
  ok('two sides equally far through barely moves',
     Math.abs(pct(24.1, 7.4, 0.057, 0.9, 0.83*P, 0.83*P) - pct(24.1, 7.4, 0.057, 0.9)) <= 3,
     pct(24.1, 7.4, 0.057, 0.9, 0.83*P, 0.83*P) + ' vs ' + pct(24.1, 7.4, 0.057, 0.9));

  /* BACKWARD COMPATIBILITY IS THE WHOLE SAFETY STORY. Every reading taken
     before this is three or four long and carries no fractions, and every
     archived week is full of them. Absent, the maths has to collapse exactly
     onto what it was. */
  for (const [a, b, f, mu0] of [[0,0,0,0],[30,10,0.3,4],[80,95,0.7,-6],[110,104,1,2],[0,0,0,12]]) {
    const was = M.schedNormCdf(((a-b) + (1-f)*mu0) / Math.max(0.6, M.wpSd()*Math.sqrt(1-f)));
    const now = M.wpAt(a, b, P, P, f, mu0);
    ok('no fractions reproduces the old maths exactly at ' + a + '-' + b + ' f=' + f,
       Math.abs(now - Math.min(0.999, Math.max(0.001, was))) < 1e-9,
       now + ' vs ' + was);
  }

  /* the fixture's own spread rides on ITS football, not the league's */
  ok('a fixture that is nearly done is nearly certain',
     pct(60, 40, 0.1, 0, 0.02*P, 0.02*P) > 95, String(pct(60, 40, 0.1, 0, 0.02*P, 0.02*P)));
  ok('even though the league has barely started', pct(60, 40, 0.1, 0) < 80);

  /* THE PRE-GAME LINE IS NOT ADDED ON TOP OF THE PROJECTIONS. mu0 comes from
     ESPN'''s pre-game win probability, which is built out of the same lineup
     projections remA and remB are made of -- adding both counts the fixture
     twice. With lineups in hand the projections speak for themselves. */
  {
    const P2=117;
    const kick=M.wpAt(0,0,105,105,0,8,117.6,117.4);   // mu0 says +8, lineups say +0.2
    const noMu=M.wpAt(0,0,105,105,0,null,117.6,117.4);
    ok('a recorded lineup ignores the pre-game lean', Math.abs(kick-noMu)<1e-12,
       kick+' vs '+noMu);
    ok('and opens on what the lineups actually project',
       Math.abs(kick-M.schedNormCdf(0.2/M.wpSd()))<1e-9, String(kick));
    /* the fallback still leans, because there it is the only fixture read */
    const fb=M.wpAt(0,0,105,105,0,8);
    ok('with no lineups the pre-game line still carries the fixture',
       Math.abs(fb-M.schedNormCdf(8/M.wpSd()))<1e-9, String(fb));
  }

  /* a value at or under 1.5 is read as the FRACTION it was for twenty minutes
     of week one, so the readings written then still mean what they meant */
  ok('a legacy fraction is read as a fraction',
     Math.abs(M.wpAt(30,0,P,P,0.2,0,0.6,0.05) - M.wpAt(30,0,P,P,0.2,0,0.6*P,0.05*P)) < 1e-9);
  ok('and points are read as points',
     M.wpAt(30,0,P,P,0.2,0,63,5.25) === M.wpAt(30,0,P,P,0.2,0,0.6,0.05));
}

console.log(nl + '7c5. AND THEY ARE READ OFF THE SCOREBOARD AND THE ROSTER');
{
  const st = { games: [
    { s: 'post', ht: 'SEA', at: 'NE', p: 4, c: '0:00' },
    { s: 'in',   ht: 'KC',  at: 'DEN', p: 3, c: '10:00' },
    { s: 'pre',  ht: 'GB',  at: 'CHI', p: 0, c: '' }] };
  const prog = M.liveProProgress(st);
  ok('a final is finished', prog.SEA === 1 && prog.NE === 1);
  ok('one not started is at nothing', prog.GB === 0 && prog.CHI === 0);
  /* third quarter, ten minutes left: 35 of 60 minutes gone */
  ok('one in progress is read off the clock',
     Math.abs(prog.KC - 35/60) < 1e-9, String(prog.KC));
  ok('a team not on the board at all is simply absent', prog.MIA === undefined);
  ok('and no digest is an empty answer, not a throw',
     Object.keys(M.liveProProgress(null)).length === 0);

  /* 26 is SEA (finished), 12 is KC (mid-game), 9 is GB (not started) */
  const side = (...es) => ({ rosterForCurrentScoringPeriod: { entries: es.map(([slot, pro, proj]) => ({
    lineupSlotId: slot,
    playerPoolEntry: { player: { proTeamId: pro, stats: [{ statSourceId: 1, appliedTotal: proj }] } } })) } });
  /* no stat line on these, so every one takes the flat fallback — which is
     what these cases are about */
  const sideOf = (...a) => side(...a);

  ok('a roster nobody has played is all still to come',
     M.liveSideLeft(side([0, 9, 20], [2, 9, 10]), prog) === 30);
  ok('a roster that has finished has nothing left',
     M.liveSideLeft(side([0, 26, 20], [2, 26, 10]), prog) === 0);
  ok('and it is weighted by projection, not by headcount',
     M.liveSideLeft(side([0, 26, 30], [2, 9, 10]), prog) === 10,
     String(M.liveSideLeft(side([0, 26, 30], [2, 9, 10]), prog)));
  ok('a bench player is not part of anybody\'s week',
     M.liveSideLeft(side([0, 9, 20], [20, 26, 999]), prog) === 20);
  ok('a mid-game starter counts what is left of his game',
     Math.abs(M.liveSideLeft(side([0, 12, 20]), prog) - 20*(1 - 35/60)) < 0.02,
     String(M.liveSideLeft(side([0, 12, 20]), prog)));
  ok('a starter projected nothing does not drag it',
     M.liveSideLeft(side([0, 9, 20], [16, 9, 0]), prog) === 20);
  ok('an empty roster answers nothing rather than zero',
     M.liveSideLeft({ rosterForCurrentScoringPeriod: { entries: [] } }, prog) === null);
  ok('and so does a fixture with no roster at all',
     M.liveSideLeft(null, prog) === null);
}

console.log(nl + '7c6. PROJECTING THE REST OF A PLAYER FROM HIS USAGE');
{
  /* ESPN publishes one projection per player per week and never moves it, so
     "what has he got left" was projection x time remaining -- which says a
     receiver with one target and an eighty yard touchdown will do it again
     after half time, and one with eight targets and no luck will not.

     Volume persists, efficiency does not. So volume is re-read from what has
     happened and efficiency is held at the projected rate. */
  const R = { 53:1, 42:0.1, 43:6, 24:0.1, 25:6, 3:0.04, 4:4, 20:-2, 72:-2 };
  const P = { 58:9.75, 53:6.78, 42:90.98, 43:0.49 };        // 18.9 projected
  const man = act => ({ playerPoolEntry: { player: { stats: [
    { statSourceId:1, appliedTotal:18.9, stats:P },
    { statSourceId:0, appliedTotal:0, stats:act } ] } } });
  const at = (act, f) => M.livePlayerLeft(man(act), f, R);
  const flat = f => 18.9 * (1 - f);

  ok('the league rules score a line the way ESPN does',
     Math.abs(M.liveScoreLine({ 53:8, 42:122, 43:1 }, R) - 26.2) < 0.001,
     String(M.liveScoreLine({ 53:8, 42:122, 43:1 }, R)));

  /* THE TWO CASES THIS EXISTS FOR, and they move in opposite directions */
  const bomb = at({ 58:1, 53:1, 42:80, 43:1 }, 0.5);
  const busy = at({ 58:8, 53:5, 42:40, 43:0 }, 0.5);
  ok('one target and an eighty yard score leaves him with LESS', bomb < flat(0.5) - 3,
     bomb.toFixed(1) + ' vs ' + flat(0.5).toFixed(1));
  ok('eight targets and no luck leaves him with MORE', busy > flat(0.5) + 3,
     busy.toFixed(1) + ' vs ' + flat(0.5).toFixed(1));
  ok('and the busy one is worth well over double the lucky one', busy > bomb * 2,
     busy.toFixed(1) + ' vs ' + bomb.toFixed(1));

  /* a man doing exactly what was expected of him should barely move */
  const script = at({ 58:5, 53:3, 42:45, 43:0 }, 0.5);
  ok('a player on script is left almost exactly where he was',
     Math.abs(script - flat(0.5)) < 1, script.toFixed(1) + ' vs ' + flat(0.5).toFixed(1));

  /* usage is what carries it, NOT the points he has scored */
  const noPts = at({ 58:8, 53:5, 42:0, 43:0 }, 0.5);
  ok('eight targets and zero yards still leaves him busy', noPts > flat(0.5),
     noPts.toFixed(1));
  ok('no targets at all leaves him with almost nothing',
     at({ 58:0, 53:0, 42:0, 43:0 }, 0.5) < flat(0.5) * 0.5);

  /* THE ENDPOINTS ARE SAFE AT ANY SETTING, which is what makes this shippable */
  ok('kickoff is untouched — the full projection', Math.abs(at({}, 0) - 18.9) < 0.001);
  ok('the whistle is exact — nothing left',
     Math.abs(at({ 58:11, 53:8, 42:122, 43:1 }, 1)) < 1e-9);
  ok('it never goes negative', at({ 58:0, 53:0, 42:0, 43:0 }, 0.99) >= 0);

  /* WITHOUT THE PIECES IT FALLS BACK, rather than guessing */
  ok('no scoring rules falls back to projection x time left',
     Math.abs(M.livePlayerLeft(man({ 58:8 }), 0.5, null) - flat(0.5)) < 0.01);
  ok('no stat line at all falls back too',
     Math.abs(M.livePlayerLeft({ playerPoolEntry: { player: { stats: [
       { statSourceId:1, appliedTotal:9 } ] } } }, 0.5, R) - 4.5) < 0.01);
  /* a projected line that does not add up to its own published total means
     this league scores something the volume split does not model */
  ok('a line that does not reconcile falls back',
     Math.abs(M.livePlayerLeft({ playerPoolEntry: { player: { stats: [
       { statSourceId:1, appliedTotal:40, stats:P } ] } } }, 0.5, R) - 20) < 0.01);

  /* a kicker: no volume stat, so every part of his line is flat */
  const K = { 83:2, 86:1 };
  ok('a kicker keeps the flat treatment',
     Math.abs(M.livePlayerLeft({ playerPoolEntry: { player: { stats: [
       { statSourceId:1, appliedTotal:8, stats:K } ] } } }, 0.5, { 83:3, 86:1 }) - 4) < 0.01);

  /* the weight on observed usage, which is the one number still to be measured */
  ok('usage weight starts at nothing', M.liveUsageW(0) === 0);
  ok('and is past half by half time', M.liveUsageW(0.5) > 0.6, String(M.liveUsageW(0.5)));
  ok('and never reaches certainty', M.liveUsageW(1) < 1);
  ok('it rises the whole way through', M.liveUsageW(0.25) < M.liveUsageW(0.75));
}

console.log(nl + '7c7. SIGMA RIDES THE LINEUPS, NOT THE SCOREBOARD');
{
  /* L measured what was left against (banked + remaining) — the two expected
     FINALS — and those grow every time somebody has a big game. So a monster
     performance shrank sigma and made the model MORE confident because a player
     had done well. Backwards: what the eight men still to come might do has
     nothing to do with what the first one already did. */
  const P = 119.5, Q = 119.0, rA = 112.3, rB = 108.3;
  const at = b => M.wpAt(14, b, P, Q, 0.1, null, rA, rB);
  const sd = () => M.wpSd() * Math.sqrt((rA + rB) / (P + Q));

  /* the probability MUST move with the banked points — that is mu doing its job */
  ok('a bigger game still moves the number', at(60) < at(28.8) && at(28.8) < at(10.7),
     [at(10.7), at(28.8), at(60)].map(x => (x * 100).toFixed(1)).join(' > '));

  /* ...but the spread must not. Recover sigma from two points on the curve. */
  const back = b => {
    const p = at(b), mu = (14 - b) + (rA - rB);
    return mu / M.schedNormCdf.inv ? 0 : mu;   // mu is what we can check directly
  };
  const s1 = sd();
  ok('the spread is the lineups, so it does not move at all',
     Math.abs(s1 - 33.2) < 0.2, s1.toFixed(2));

  /* the same reading with a bigger banked total must give the SAME sigma, which
     shows up as the probability moving exactly as much as mu says it should */
  const z = b => M.schedNormCdf(((14 - b) + (rA - rB)) / s1);
  [10.7, 28.8, 60].forEach(b => ok('banked ' + b + ' prices off an unchanged spread',
    Math.abs(at(b) - z(b)) < 1e-9, at(b).toFixed(6) + ' vs ' + z(b).toFixed(6)));

  /* with no per-side figures it still falls back to the league-wide number */
  const f = 0.3;
  ok('no lineups recorded falls back exactly as before',
     Math.abs(M.wpAt(30, 10, P, Q, f, 4) -
       M.schedNormCdf(((30 - 10) + (1 - f) * 4) / (M.wpSd() * Math.sqrt(1 - f)))) < 1e-9);
}

console.log(nl + '7c8. EFFICIENCY IS BELIEVED, BUT SLOWLY AND NEVER ON A SCORE');
{
  const R = { 53:1, 42:0.1, 43:6 };
  const P = { 58:9.75, 53:6.78, 42:90.98, 43:0.49 };
  const proj = M.liveScoreLine(P, R);
  const man = A => ({ playerPoolEntry: { player: { stats: [
    { statSourceId:1, appliedTotal:proj, stats:P },
    { statSourceId:0, appliedTotal:0, stats:A } ] } } });
  const at = A => M.livePlayerLeft(man(A), 0.5, R);

  ok('one target buys almost no belief', M.liveEffW(1) < 0.06, String(M.liveEffW(1)));
  ok('eight targets buys about a quarter',
     M.liveEffW(8) > 0.2 && M.liveEffW(8) < 0.3, String(M.liveEffW(8)));
  ok('twenty five buys about half',
     Math.abs(M.liveEffW(25) - 0.5) < 0.02, String(M.liveEffW(25)));
  ok('and it never reaches certainty', M.liveEffW(200) < 1);

  /* same volume, different efficiency — the number should move, but not much */
  const cold = at({ 58:8, 53:5, 42:40 });
  const onRate = at({ 58:8, 53:5, 42:74 });
  const hot = at({ 58:8, 53:6, 42:110 });
  ok('a hot night is worth more than a cold one on the same volume', hot > cold,
     hot.toFixed(1) + ' vs ' + cold.toFixed(1));
  ok('but efficiency moves it far less than volume does',
     (hot - cold) < Math.abs(onRate - at({ 58:1, 53:1, 42:9 })),
     (hot - cold).toFixed(1) + ' vs ' + Math.abs(onRate - at({ 58:1, 53:1, 42:9 })).toFixed(1));

  /* A SCORE IS NOT EVIDENCE OF MORE SCORES. Two identical volume and yardage
     lines, one with a touchdown — the touchdown must not raise what is left. */
  const noTd = at({ 58:8, 53:5, 42:74 });
  const withTd = at({ 58:8, 53:5, 42:74, 43:1 });
  ok('a touchdown does not raise his remaining at all',
     Math.abs(noTd - withTd) < 1e-9, noTd.toFixed(3) + ' vs ' + withTd.toFixed(3));

  ok('and the bomb is still heavily written down',
     at({ 58:1, 53:1, 42:80, 43:1 }) < proj * 0.5 * 0.65,
     at({ 58:1, 53:1, 42:80, 43:1 }).toFixed(1) + ' vs flat ' + (proj * 0.5).toFixed(1));
}

console.log(nl + '7d. WHERE THAT NUMBER COMES FROM');
{
  const m = (h, a) => ({ home: { winProbability: h }, away: { winProbability: a } });
  ok('it is read for the side that sorts first', M.liveWpOf(m(0.62, 0.38), true) === 0.62);
  ok('and flipped for the other one',            M.liveWpOf(m(0.62, 0.38), false) === 0.38);

  /* ESPN rounds each side on its own, so 0.53/0.46 happens and the pair does
     not add up. Everything downstream assumes it does. */
  const r = M.liveWpOf(m(0.53, 0.46), true);
  ok('a pair that does not add to one is renormalised', Math.abs(r - 0.53/0.99) < 1e-4, r);
  ok('and the two halves still sum to one',
     Math.abs(M.liveWpOf(m(0.53,0.46),true) + M.liveWpOf(m(0.53,0.46),false) - 1) < 1e-4);

  /* an exact 0 or 1 is a finished game, not an opinion about one */
  ok('a settled game records nothing', M.liveWpOf(m(1, 0), true) === null);
  ok('nor the other way round',        M.liveWpOf(m(0, 1), true) === null);
  ok('nothing published records nothing', M.liveWpOf({home:{},away:{}}, true) === null);
  ok('and a malformed fixture does not throw', M.liveWpOf(null, true) === null);

  /* one side missing is still an answer: the other is its complement */
  ok('one side alone is enough', Math.abs(M.liveWpOf({home:{winProbability:0.7},away:{}},false) - 0.3) < 1e-9);

  /* it is stored, so it is trimmed */
  ok('it is kept to four places', String(M.liveWpOf(m(0.53, 0.46), true)).length <= 6,
     String(M.liveWpOf(m(0.53, 0.46), true)));
}

console.log(nl + '7e. AND THE READING KEEPS IT UP TO DATE');
{
  const t = 29816660;
  const arr = [];
  ok('a new bucket stores the number', M.liveNote(arr, t, 0, 0, 0.5) === true
     && arr[0].length === 4 && arr[0][3] === 0.5);
  ok('the same bucket, nothing changed, is not a write',
     M.liveNote(arr, t, 0, 0, 0.5) === false && arr.length === 1);
  /* THE SCORE CAN SIT STILL WHILE THE NUMBER MOVES -- which is most of a first
     quarter, and was the whole of what the panel had to show that night */
  ok('a moved probability on a flat score is still news',
     M.liveNote(arr, t, 0, 0, 0.56) === true && arr[0][3] === 0.56 && arr.length === 1);
  ok('a fuller score still replaces in place',
     M.liveNote(arr, t, 6.4, 0, 0.61) === true && arr[0][1] === 6.4 && arr[0][3] === 0.61);
  ok('a stale score does not undo it, but its number still lands',
     M.liveNote(arr, t, 2, 0, 0.63) === true && arr[0][1] === 6.4 && arr[0][3] === 0.63);
  /* a minute ESPN published nothing leaves the last one standing rather than
     blanking it */
  ok('no number leaves the one already there',
     M.liveNote(arr, t, 6.4, 0, null) === false && arr[0][3] === 0.63);
  ok('a reading with no number at all is still three long',
     (() => { const a2 = []; M.liveNote(a2, t, 1, 2); return a2[0].length === 3; })());
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
