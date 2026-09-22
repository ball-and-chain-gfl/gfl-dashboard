/* AN UNBEATEN TEAM IS NOT THE UNLUCKIEST TEAM IN THE LEAGUE.
 *
 * The Bad Beat O'Meter adds four ranks: how narrow your closest defeat was, your
 * median defeat, how many defeats came inside a touchdown, and what share of
 * them still beat the week's league average. Higher is unluckier.
 *
 * The first two are margins of a DEFEAT. A team with none has nothing to take a
 * minimum or a median of and falls back to 0 -- and because those two ranks are
 * descending, 0 read as the tightest loss in the league and paid top marks for
 * it. Through week 3 of 2026 that put all four unbeaten teams second through
 * fifth, ahead of everyone who had actually lost a game, while a side that went
 * down by 46.8 finished last.
 *
 * Run: node scripts/test-badbeat.mjs
 */
import { lifter, assemble } from './lib/lift.mjs';

const NL = String.fromCharCode(10);
let pass = 0, fail = 0;
const ok = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; return; }
  fail++;
  console.log('  FAIL  ' + name + NL + '          got  ' + g + NL + '          want ' + w);
};
const head = t => console.log(NL + t);

const grab = lifter(new URL('../public/app.js', import.meta.url));
const M = assemble(grab, ['function badBeatData(season){'], ['badBeatData', 'setMeta'],
  ['let _seasonMeta={};',
   'const regEndOf=()=>14;',
   'const setMeta=m=>{_seasonMeta[2026]=m;};'].join(NL));

const TEAMS = {}, OWNERS = {};
for (let i = 1; i <= 12; i++) { TEAMS[i] = { name: 'T' + i }; OWNERS[i] = 'o' + i; }
const game = (wk, h, hp, a, ap) => ({
  matchupPeriodId: wk,
  home: { teamId: h, totalPoints: hp },
  away: { teamId: a, totalPoints: ap },
  winner: hp > ap ? 'HOME' : 'AWAY',
});
const load = schedule => { M.setMeta({ owners: OWNERS, teams: TEAMS, schedule }); return M.badBeatData(2026); };
const of = (list, id) => list.find(t => t.id === id);

/* ── the shape that broke ────────────────────────────────────────────────────
   T1 goes 2-0 and never has a margin. T2 loses twice by under a point, both
   times outscoring the week's league average -- a bad beat by every measure the
   meter has. T3 loses twice by fifty-odd. The losing scores are set ABOVE the
   weekly average on purpose, because that is the component the real complaint
   was buried under. */
const SCHED = [
  game(1, 1, 120, 4, 100),     // T1 wins
  game(1, 6, 100.5, 2, 100),   // T2 loses by 0.5, week avg 92.58
  game(1, 8, 95, 3, 40),       // T3 loses by 55
  game(2, 1, 118, 5, 101),     // T1 wins -> 2-0
  game(2, 7, 101, 2, 100),     // T2 loses by 1, week avg 91.67
  game(2, 9, 95, 3, 35),       // T3 loses by 60
];
const L = load(SCHED);
const unbeaten = of(L, 1), narrow = of(L, 2), blown = of(L, 3);

head('an unbeaten team has no defeat to be measured by');
ok('no margins at all', unbeaten.margins.length, 0);
ok('so closest and median fall back to the 0 placeholder',
  [unbeaten.closest, unbeaten.median], [0, 0]);
ok('and it is NOT paid for them', [unbeaten.rClose, unbeaten.rMed], [1, 1]);
ok('every component sits on the floor',
  [unbeaten.rClose, unbeaten.rMed, unbeaten.rU7, unbeaten.rPov], [1, 1, 1, 1.5]);
ok('which is the whole of its score', unbeaten.score, 4.5);

head('and the team actually suffering bad beats is above it');
ok('two defeats inside a touchdown', narrow.lossU7, 2);
ok('both of them over the week average', narrow.pctOver, 1);
ok('it tops the meter', narrow.rank, 1);
ok('well clear of the floor', narrow.score > 15, true);
ok('the unbeaten side is below it', narrow.score > unbeaten.score, true);

head('nothing scores BELOW the unbeaten floor');
/* the floor is the floor: being blown out twice is not luckier than not
   playing badly at all, it is the same nothing */
ok('no team is under 4.5', L.every(t => t.score >= 4.5), true);
ok('the blown-out side is on it too', blown.score, 4.5);

head('the margin ranks are taken among teams that have a margin');
ok('the narrow loser outranks the blown-out one on closeness',
  narrow.rClose > blown.rClose, true);
ok('and the widest defeat takes the bottom of that pool', blown.rClose, 1);
/* the pool is the beaten teams and nobody else. Four of the twelve lost a
   game here, so the narrowest of them is ranked fourth of four -- not
   fourth of twelve, which is what counting the unbeaten would have made it */
const beaten = L.filter(t => t.margins.length);
ok('four of the twelve have a margin', beaten.length, 4);
ok('and the narrowest is ranked against those four', narrow.rClose, beaten.length);
ok('every unbeaten side is outside the pool',
  L.filter(t => !t.margins.length).map(t => t.rClose),
  L.filter(t => !t.margins.length).map(() => 1));

head('several unbeaten teams all tie on the floor');
const many = L.filter(t => t.l === 0);
ok('there are several', many.length > 1, true);
ok('and they all read the same', [...new Set(many.map(t => t.score))], [4.5]);

head('the meter still separates teams once everybody has lost');
const A = load([
  game(1, 1, 110, 2, 108),    // T2 loses by 2
  game(2, 2, 130, 1, 100),    // T1 loses by 30
  game(1, 3, 140, 4, 80),     // T4 loses by 60
  game(2, 4, 120, 3, 119),    // T3 loses by 1
]);
ok('everybody has a margin', A.every(t => t.margins.length > 0), true);
ok('the one-point loser is unluckier than the sixty-point loser',
  of(A, 3).score > of(A, 4).score, true);
ok('and nobody is stuck on the empty floor', A.some(t => t.score !== 4.5), true);

console.log(NL + (fail ? 'FAILED  ' : 'ok  ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
