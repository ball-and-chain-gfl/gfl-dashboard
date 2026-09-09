/* THE COACHES' POLL CHART.
 *
 * Two things this holds down. The PALETTE is the standings now rather than
 * twelve arbitrary hues, so the ordering of the ramp is load-bearing: if it
 * ever stops running blue at the top to red at the bottom, the chart is
 * quietly lying about who is winning the room. And the AXIS is the whole
 * season from week one, not just the weeks archived so far, so the chart has
 * to draw seventeen columns on a day when exactly one of them has any data.
 *
 * proxyLogo is stubbed rather than lifted: it carries a regex with a // in it
 * and the bracket walker in lift.mjs reads that as a line comment and runs off
 * the end of the file.
 */
import { lifter, assemble } from './lib/lift.mjs';

const M = assemble(lifter(new URL('../public/app.js', import.meta.url)), [
  'function teamInitials(name){',
  'const REGULAR_SEASON_END=',
  'function regEndOf(season){',
  'const pollWeeks=',
  'const POLL_RAMP=',
  'function pollRampColor(rank,n){',
  'function pollRankNow(){',
  'function pollColor(teamId){',
  'const pollTeam=',
  'function pollLogoOf(teamId){',
  'const POLL_WEEKS_MAX=',
  'const POLL_PLAYOFF_WEEKS=',
  'function pollSeasonWeeks(){',
  'function pollChartHTML(){',
], ['pollChartHTML', 'pollRampColor', 'pollSeasonWeeks', 'pollColor', 'pollRankNow',
    'POLL_RAMP', 'POLL_WEEKS_MAX', 'setUp'], `
const proxyLogo=u=>null;
let _polls={weeks:{}}, _teams=[], _franchises=[], _ownerMap={};
let _seasonMeta={}; const ALL_SEASONS=['2026'];
/* orders: {week: [teamId,...] best first}. regEnd is the regular season
   length; schedMax is how far the SCHEDULE reaches, which in September is the
   regular season and nothing more. */
function setUp(orders,regEnd,nTeams,schedMax){
  const n=nTeams==null?12:nTeams;
  _teams=Array.from({length:n},(_,i)=>({id:i+1,name:'Team '+(i+1)}));
  _franchises=_teams.map(t=>({owner:'o'+t.id,name:t.name,logo:null}));
  _ownerMap={}; _teams.forEach(t=>{_ownerMap[t.id]='o'+t.id;});
  const re=regEnd==null?14:regEnd;
  const sched=[];
  for(let w=1;w<=(schedMax==null?re:schedMax);w++) sched.push({matchupPeriodId:w});
  _seasonMeta={'2026':{schedule:sched,regEnd:re}};
  _polls={weeks:{}};
  Object.entries(orders).forEach(([w,order])=>{
    _polls.weeks[w]={ballots:9,rank:order.map((id,i)=>({teamId:id,rank:i+1,avg:i+1.1}))};
  });
}
`);

let pass = 0, fail = 0;
const nl = String.fromCharCode(10);
function ok(name, cond, detail) {
  console.log((cond ? '  PASS  ' : '  FAIL  ') + name);
  if (!cond) { if (detail !== undefined) console.log('        ' + detail); fail++; } else pass++;
}
const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const seq = n => Array.from({ length: n }, (_, i) => i + 1);

console.log('1. THE RAMP RUNS BLUE TO RED, IN ORDER');
{
  ok('there is a stop for every place in a twelve team league', M.POLL_RAMP.length === 12);
  ok('every stop is a real six digit colour',
     M.POLL_RAMP.every(c => /^#[0-9a-f]{6}$/.test(c)), M.POLL_RAMP.join(' '));
  ok('first place is the site blue', M.pollRampColor(1, 12) === '#60a5fa');
  ok('last place is the deep red', M.pollRampColor(12, 12) === '#e11d48');
  ok('the site green is on the way through', M.POLL_RAMP.indexOf('#4ade80') > 0);
  ok('and so is the site accent', M.POLL_RAMP.indexOf('#ffb347') > 0);

  /* THE ORDERING IS THE POINT, and the thing that is actually ordered is HUE.
     No single RGB channel is monotone across a spectral ramp -- red dips
     through the cyans before it climbs -- so checking one of those was
     checking the wrong thing. Hue walks steadily down from the blue at 213
     degrees, through green and amber, and past zero into the reds, which is
     why the last two unwrap to negatives rather than jumping to 350. */
  const cols = seq(12).map(r => rgb(M.pollRampColor(r, 12)));
  const hues = cols.map(([r, g, b]) => {
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    if (!d) return 0;
    const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    const deg = h * 60;
    const pos = (deg + 360) % 360;
    return pos > 300 ? pos - 360 : pos;      // the reds sit just below zero
  });
  ok('hue walks steadily from blue round to red, never back',
     hues.every((h, i) => i === 0 || h < hues[i - 1]), hues.map(h => Math.round(h)).join(','));
  ok('it starts cool', cols[0][2] > cols[0][0] + 100, cols[0].join(','));
  ok('and ends warm', cols[11][0] > cols[11][2] + 100, cols[11].join(','));

  /* neighbours have to be tellable apart -- they are the lines that sit next
     to each other on the chart */
  const gap = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
  const worst = cols.slice(1).reduce((m, c, i) => Math.min(m, gap(c, cols[i])), 1e9);
  ok('no two adjacent stops are near-identical', worst > 40, 'closest pair differs by ' + worst);

  /* a league of any size still spans the whole ramp rather than stopping in
     the oranges */
  ok('a ten team league still ends on the deep red', M.pollRampColor(10, 10) === '#e11d48');
  ok('and still starts on the blue', M.pollRampColor(1, 10) === '#60a5fa');
  ok('a fourteen team league interpolates between stops',
     /^#[0-9a-f]{6}$/.test(M.pollRampColor(7, 14)), M.pollRampColor(7, 14));

  ok('a rank off the end of the table clamps rather than going undefined',
     M.pollRampColor(99, 12) === '#e11d48' && M.pollRampColor(0, 12) === '#60a5fa');
  ok('a one team league does not divide by zero',
     /^#[0-9a-f]{6}$/.test(M.pollRampColor(1, 1)));
}

console.log(nl + '2. A TEAM IS COLOURED BY WHERE IT SITS NOW');
{
  /* team 12 climbs from last to first; team 1 falls the other way. The line
     has one colour, and it should be the colour of where it ENDED -- that is
     the end of the chart everybody reads. */
  M.setUp({ 1: seq(12), 2: seq(12).reverse() });
  ok('the latest week is the one that decides', M.pollRankNow()[12] === 1);
  ok('the team on top now draws in blue', M.pollColor(12) === '#60a5fa');
  ok('and the team that fell to last draws in red', M.pollColor(1) === '#e11d48');

  M.setUp({ 1: seq(12) });
  ok('with one week on file it is that week', M.pollColor(1) === '#60a5fa');
  /* a team that has never been ranked still needs a colour rather than
     undefined painted into a stroke attribute */
  ok('a team nobody ranked still gets one', /^#[0-9a-f]{6}$/.test(M.pollColor(99)));
}

console.log(nl + '3. THE WHOLE SEASON IS DRAWN FROM WEEK ONE');
{
  M.setUp({ 1: seq(12) });
  ok('a fourteen week regular season is a seventeen week chart',
     M.pollSeasonWeeks() === 17, M.pollSeasonWeeks());

  /* THE BUG THIS FIXES. ESPN publishes the regular season the day the league
     is set up and does not add the playoff brackets until seeding is known --
     so all autumn the schedule stops at 14, and reading the axis off it drew
     a fourteen week chart for a seventeen week season. */
  M.setUp({ 1: seq(12) }, 14, 12, 14);
  ok('a schedule carrying no playoff rows yet still lays them out',
     M.pollSeasonWeeks() === 17, M.pollSeasonWeeks());
  M.setUp({ 1: seq(12) }, 14, 12, 17);
  ok('and a finished season that has them reads the same',
     M.pollSeasonWeeks() === 17);
  M.setUp({ 1: seq(12) });

  const html = M.pollChartHTML();
  const weekLabels = (html.match(/text-anchor="middle" font-size="10"/g) || []).length;
  ok('all seventeen weeks are labelled after one week of voting', weekLabels === 17,
     weekLabels + ' labels');

  /* the ones still to come are dimmed, so the chart shows how much season is
     left instead of ending at the last ballot */
  ok('the week that has been voted on is not dimmed', html.indexOf('opacity="1"') >= 0);
  ok('and the ones still to come are', html.indexOf('opacity="0.5"') >= 0);
  ok('their gridlines are fainter too',
     html.indexOf('opacity="0.22"') >= 0 && html.indexOf('opacity="0.6"') >= 0);

  ok('the rank axis is one row a team', (html.match(/text-anchor="end" font-size="11"/g) || []).length === 12);
  ok('and the week axis says what it is', html.indexOf('>WK<') >= 0);

  /* WITH ONE WEEK ARCHIVED THERE IS NO LINE, ONLY A COLUMN OF CRESTS. That was
     the bug: the chart was 40px wide and twelve teams sat on top of each other
     in it. It has to be a full season wide even with nothing in it. */
  ok('one week of data draws no connecting line', html.indexOf('<polyline') < 0);
  ok('but still draws a dot for every team', (html.match(/<circle/g) || []).length === 12);
}

console.log(nl + '4. IT KEEPS ITS OWN WIDTH AND THE PANEL SCROLLS');
{
  M.setUp({ 1: seq(12) });
  const html = M.pollChartHTML();
  const w = html.match(/width="(\d+)" height="(\d+)"/);
  ok('the svg is sized in pixels, not stretched to the panel',
     !!w && Number(w[1]) > 600, w ? w[1] : html.slice(0, 200));
  ok('and it is not width="100%" any more', html.indexOf('width="100%"') < 0);
  ok('it sits in the panel that scrolls', html.indexOf('class="poll-chart"') >= 0);

  /* a shorter season is a narrower chart, which is how an old archived season
     with a ten week regular season stays honest */
  M.setUp({ 1: seq(12) }, 10);
  ok('a ten week regular season is a thirteen week chart', M.pollSeasonWeeks() === 13);
  const short = M.pollChartHTML().match(/width="(\d+)"/);
  ok('and it draws narrower', Number(short[1]) < Number(w[1]), short[1] + ' vs ' + w[1]);

  /* a poll week past all of that still gets a column rather than being drawn
     off the side */
  M.setUp({ 1: seq(12), 18: seq(12) }, 10);
  ok('a week past the end of the season still gets one', M.pollSeasonWeeks() === 18);

  /* a nonsense regular season length falls back rather than drawing a chart
     four pixels wide or four thousand */
  M.setUp({ 1: seq(12) }, 0);
  ok('a zero week season falls back to seventeen', M.pollSeasonWeeks() === 17);
  M.setUp({ 1: seq(12) }, 99);
  ok('and so does an absurd one', M.pollSeasonWeeks() === 17,
     M.pollSeasonWeeks());
}

console.log(nl + '5. THE CREST RIDES THE FRONT OF THE LINE');
{
  /* It used to sit in a fixed column at the far left. On a chart you scroll
     sideways that is a legend you cannot see while you are looking at this
     week. */
  M.setUp({ 1: seq(12), 2: seq(12), 3: seq(12) });
  const html = M.pollChartHTML();
  const dots = [...html.matchAll(/<circle cx="(\d+(?:\.\d+)?)"/g)].map(m => Number(m[1]));
  const badges = [...html.matchAll(/<rect x="(\d+(?:\.\d+)?)" y="[\d.]+" width="26"/g)]
    .map(m => Number(m[1]) + 13);
  const lastCol = Math.max(...dots);
  ok('every crest sits on the last week that has been voted on',
     badges.length === 12 && badges.every(b => Math.abs(b - lastCol) < 0.01),
     badges.join(',') + ' vs ' + lastCol);
  ok('which is not the first week', Math.min(...dots) < lastCol);
  ok('there is a line to ride, with three weeks on file',
     (html.match(/<polyline/g) || []).length === 12);

  /* ranks are unique within a week, so twelve crests at one x never collide */
  M.setUp({ 1: seq(12), 2: seq(12) });
  const ys = [...M.pollChartHTML().matchAll(/<rect x="[\d.]+" y="([\d.]+)" width="26"/g)]
    .map(m => Number(m[1]));
  ok('and no two of them land on the same row', new Set(ys).size === 12);
}

console.log(nl + '6. NOTHING DRAWS AS NaN OR undefined');
{
  M.setUp({ 1: seq(12), 4: seq(12).reverse() });      // a gap in the middle
  const html = M.pollChartHTML();
  ok('no NaN in the markup', html.indexOf('NaN') < 0);
  ok('no undefined in the markup', html.indexOf('undefined') < 0);
  ok('a week with no ballot leaves a gap rather than a point at zero',
     (html.match(/<circle/g) || []).length === 24);

  M.setUp({});
  ok('no polls at all draws nothing rather than a broken tag', M.pollChartHTML() === '');
  M.setUp({ 1: [] }, 17, 0);
  ok('and no teams does the same', M.pollChartHTML() === '');
}

console.log(nl + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
