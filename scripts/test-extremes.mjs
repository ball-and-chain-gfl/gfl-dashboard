/* ALL MATCHUPS: SIX EDGES A TEAM, AND THE LEAGUE BESIDE THEM.
 *
 *   THE SIX            most and fewest points in a game, biggest win, worst
 *                      loss, closest win, closest loss
 *   WHAT COUNTS        finished counting games: a meaningless postseason game is
 *                      out, a week still being played is out, a tie has points
 *                      but no margin, and a franchise that has left is nobody's
 *                      rank -- though its games still count for its opponents
 *   THE LEAGUE         every team ranked on each edge, #1 the most extreme,
 *                      level teams sharing a place
 *   THE PAGE           the selected team's six tiles carry their ranks; the
 *                      league list is one edge at a time
 *
 * Run: node scripts/test-extremes.mjs
 */
import { lifter, assemble } from './lib/lift.mjs';

const NL = String.fromCharCode(10);
let pass = 0, fail = 0;
const ok = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; console.log('  PASS  ' + name); return; }
  fail++;
  console.log('  FAIL  ' + name + NL + '          got  ' + g + NL + '          want ' + w);
};
const head = t => console.log(NL + t);
const grab = lifter(new URL('../public/app.js', import.meta.url));

/* teams 1-3 are franchises a, b, c; team 4 is d, who has since left */
const G = (wk, h, hp, a, ap, winner) => ({ matchupPeriodId: wk, home: { teamId: h, totalPoints: hp },
  away: { teamId: a, totalPoints: ap }, winner: winner || (hp > ap ? 'HOME' : ap > hp ? 'AWAY' : 'TIE') });
const META = {
  2025: { owners: { 1: 'a', 2: 'b', 3: 'c', 4: 'd' }, schedule: [
    G(1, 1, 150, 2, 100),          // a by 50
    G(2, 2, 120.4, 3, 119.8),      // b by 0.6
    G(3, 3, 90, 1, 130),           // a by 40
    G(4, 4, 140, 2, 80),           // d by 60: b's worst loss, d not ranked
    G(15, 1, 200, 3, 10),          // a meaningless postseason game
  ] },
  2026: { owners: { 1: 'a', 2: 'b', 3: 'c' }, schedule: [
    G(1, 2, 160, 3, 80),           // b by 80
    G(1, 1, 100, 1, 100),          // (a playing itself: ignored)
    G(2, 1, 101, 3, 101),          // a tie: points, no margin
    G(3, 1, 5, 2, 3, 'UNDECIDED'), // being played: not anybody's fewest
  ] },
};
const M = assemble(grab, [
  'const weekDecided=', 'const weekScored=', 'function weeksOf(', 'function weekOver(',
  'const MX_FACTORS=', 'let _mxFactor=', 'function mxSides(){', 'function mxData(){', 'const mxFmt=', 'const mxAb=',
  'function mxTeamHTML(owner){', 'function mxLeagueHTML(owner){',
], ['mxData', 'mxTeamHTML', 'mxLeagueHTML', 'setFactor'], [
  'const ALL_SEASONS=[2025,2026];',
  `const _seasonMeta=${JSON.stringify(META)};`,
  "const _franchises=[{owner:'a',name:'Alpha'},{owner:'b',name:'Bravo'},{owner:'c',name:'Charlie'}];",
  'const postGameCounts=(s,mu)=>mu.matchupPeriodId<15;',
  'const mgSeasonName=(s,o)=>o.toUpperCase()+" FC";',
  'const sbTeamAb=(o,n)=>o.toUpperCase();',
  'const sbAvatar=o=>`<i data-av="${o}"></i>`;',
  'const setFactor=k=>{_mxFactor=k;};',
].join(NL));

const d = M.mxData();
const edge = (o, k) => { const x = d.per[o][k]; return x ? [x.v, x.g.opp, x.g.season, x.g.week] : null; };

head('the six, for one team');
ok('most points: the 150, not the meaningless 200', edge('a', 'hi'), [150, 'b', 2025, 1]);
ok('fewest points: the tie\'s 101, not the 5 of a week still being played', edge('a', 'lo'), [101, 'c', 2026, 2]);
ok('biggest win', edge('a', 'bw'), [50, 'b', 2025, 1]);
ok('closest win', edge('a', 'cw'), [40, 'c', 2025, 3]);
ok('a team that never lost has no losses to show', [edge('a', 'bl'), edge('a', 'cl')], [null, null]);
ok('a tie is no margin either way: c\'s closest loss is not the tie', edge('c', 'cl'), [0.6, 'b', 2025, 2]);
ok('a franchise that has left still counts as an opponent', edge('b', 'bl'), [60, 'd', 2025, 4]);
ok('margins are rounded to the cent, not left as float noise', edge('b', 'cw')[0], 0.6);

head('the league');
const rk = k => d.rank[k].map(x => x.owner + x.rk);
ok('most points, highest first', rk('hi'), ['b1', 'a2', 'c3']);
ok('fewest points, lowest first, level teams sharing a place', rk('lo'), ['b1', 'c1', 'a3']);
ok('biggest win, widest first', rk('bw'), ['b1', 'a2']);
ok('worst loss, widest first', rk('bl'), ['c1', 'b2']);
ok('closest loss, tightest first', rk('cl'), ['c1', 'b2']);
ok('the franchise that left is nobody\'s rank', Object.values(d.rank).some(l => l.some(x => x.owner === 'd')), false);

head('the page');
const team = M.mxTeamHTML('a');
ok('six tiles, good beside bad', [...team.matchAll(/class="mx-tile (mx-good|mx-bad)"/g)].map(m => m[1]),
  ['mx-good', 'mx-bad', 'mx-good', 'mx-bad', 'mx-good', 'mx-bad']);
ok('each with its rank among the league', team.includes('>#2<') && team.includes('2 of 3 in the league'), true);
ok('a win shows plus, and its game', team.includes('+50.0') && team.includes('vs B · 150.0–100.0') && team.includes('2025 · Wk 1'), true);
ok('and an edge with nothing to show says so', (team.match(/None yet/g) || []).length, 2);
ok('every tile opens the league list for its edge', (team.match(/onclick="mxPick\('/g) || []).length, 6);
M.setFactor('bl');
const league = M.mxLeagueHTML('b');
ok('the league list is the chosen edge, in red', /mx-list mx-bad/.test(league) && /mx-chip mx-bad on/.test(league), true);
ok('ranked, with the selected team ringed', [...league.matchAll(/class="mx-row( mx-me)?"/g)].map(m => !!m[1]), [false, true]);
ok('a loss shows minus', league.includes('−60.0'), true);
ok('the most extreme fills the bar', /--mx-w:100%/.test(league), true);
M.setFactor('nope');
ok('an edge nobody knows falls back to most points', /mx-chip mx-good on"\s+aria-pressed="true" onclick="mxSet\('hi'\)"/.test(M.mxLeagueHTML('a')), true);

console.log(NL + (fail ? 'FAILED  ' : 'ok  ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
