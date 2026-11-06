/* GRADING THE PUNISHMENT: WHO TOOK IT, WHAT THE LEAGUE GAVE IT, WHO GETS ASKED.
 *
 *   WHO TOOK IT       the week's lowest scorer, and nobody until the week is over
 *   THE COMPOSITE     the mean of the grades on thirteen equal steps, rounded
 *   NOT COUNTED       the punished manager's own grade, and the test account's
 *   THE CARD          one per finished week, not for your own, gone once graded,
 *                     and it does not clear until it is answered
 *   THE CATCH-UP      weeks 1 to 8 went out together on 5 November 2026
 *
 * Run: node scripts/test-punish-grade.mjs
 */
import fs from 'node:fs';
import { lifter, assemble } from './lib/lift.mjs';

const NL = String.fromCharCode(10);
let pass = 0, fail = 0;
const ok = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; console.log('  PASS  ' + name); return; }
  fail++;
  console.log('  FAIL  ' + name + NL + '          got  ' + g + NL + '          want ' + w);
};
const appUrl = new URL('../public/app.js', import.meta.url);
const grab = lifter(appUrl);
const M = assemble(grab, [
  'const weekDecided=', 'const weekScored=', 'function weeksOf(', 'function weekOver(',
  'function ntWeekResultsDay(', 'const takesEsc=',
  'const PG_SCALE=', 'const PG_WEEKS=', 'const PG_MID=', 'const PG_FROM=',
  'const pgKey=', 'const pgIdx=', 'const pgTone=', 'const pgSeason=',
  'function pgLowest(', 'function pgGrades(', 'function pgComposite(',
  'let _pgPick=', 'function pgMine(', 'function ntPunishGrades(', 'function ntNeedsVote(',
], ['pgLowest', 'pgComposite', 'pgMine', 'pgTone', 'ntPunishGrades', 'ntNeedsVote', 'PG_SCALE', 'PG_MID', 'set', 'sent'], [
  "let _seasonMeta={}, _cpRows=null, _me=null, _teams=[], _CFG={};",
  "const TEST_PROFILE='test';",
  "const ntSeason=()=>'2026';",
  "const logoImg=id=>'<logo '+id+'>';",
  "const punishIconHTML=n=>'<i>';",
  "const motwIsSet=()=>true; const ntMyVote=()=>'';",
  "const set=o=>{ if('meta' in o) _seasonMeta=o.meta; if('rows' in o) _cpRows=o.rows; if('me' in o) _me=o.me;",
  "  if('teams' in o) _teams=o.teams; if('cfg' in o) _CFG=o.cfg; };",
  "const sent=(k,g)=>{ if(g==null) delete _pgSent[k]; else _pgSent[k]=g; };",
].join(NL));

/* A league of four, three finished weeks and one being played. */
const side = (teamId, totalPoints) => ({ teamId, totalPoints });
const game = (w, a, ap, b, bp, winner) => ({ matchupPeriodId: w, home: side(a, ap), away: side(b, bp), winner });
const schedule = [
  game(1, 1, 101.2, 2, 72.4, 'HOME'), game(1, 3, 88.0, 4, 90.5, 'AWAY'),     // week 1: team 2 low
  game(2, 1, 64.1, 3, 99.9, 'AWAY'),  game(2, 2, 80.0, 4, 77.7, 'HOME'),     // week 2: team 1 low
  game(3, 1, 95.0, 4, 61.3, 'HOME'),  game(3, 2, 70.0, 3, 88.8, 'AWAY'),     // week 3: team 4 low
  game(4, 1, 12.0, 2, 3.5, 'UNDECIDED'), game(4, 3, 0, 4, 0, 'UNDECIDED'),   // week 4: Sunday
];
const teams = [1, 2, 3, 4].map(id => ({ id, name: 'Team ' + id, abbrev: 'T' + id }));
const cfg = { punishment: { schedule: { 1: 'Fruit Pledge', 2: 'Franchise Rebrand', 3: 'The Re-enactment', 4: 'Fruit Pledge' } } };
M.set({ meta: { 2026: { schedule } }, teams, cfg });

console.log(NL + 'who took it');
ok('week 1: the lowest score of the week, not of a game', M.pgLowest('2026', 1), { teamId: 2, pts: 72.4 });
ok('week 2: a winner on the other side of the slate is still not it', M.pgLowest('2026', 2).teamId, 1);
ok('week 3', M.pgLowest('2026', 3).teamId, 4);
ok('nobody while the week is still being played', M.pgLowest('2026', 4), null);
ok('and nothing for a season that is not loaded', M.pgLowest('2027', 1), null);

console.log(NL + 'the composite');
const row = (id, teamId, grades) => Object.assign({ id, teamId: String(teamId) },
  Object.fromEntries(Object.entries(grades).map(([w, g]) => ['pg_2026_w' + w, g])));
M.set({ rows: [
  row('a', 1, { 1: 'A', 3: 'C' }),
  row('b', 2, { 1: 'A+', 2: 'B' }),       // team 2 took week 1: their own grade does not count
  row('c', 3, { 1: 'B+', 2: 'B-' }),
  row('d', 4, { 1: 'nonsense', 3: 'C-' }),
  row('test', 4, { 1: 'F' }),              // the test account never counts
] });
const c1 = M.pgComposite('2026', 1);
ok('A and B+ make A-, and the punished one\'s A+ is left out', [c1.letter, c1.n], ['A-', 2]);
ok('something that is not a grade is not counted', M.pgComposite('2026', 1).n, 2);
ok('B and B- round to B', M.pgComposite('2026', 2).letter, 'B');
ok('C and C- round up, to C', M.pgComposite('2026', 3).letter, 'C');
ok('no grades yet is no composite', M.pgComposite('2026', 4), null);
ok('thirteen steps, F to A+', [M.PG_SCALE.length, M.PG_SCALE[0], M.PG_SCALE[12]], [13, 'F', 'A+']);
ok('and the thumb starts in the middle of them', M.PG_SCALE[M.PG_MID], 'C+');
ok('each letter takes its band\'s colour', ['F', 'D-', 'C+', 'B', 'A+'].map(g => M.pgTone(M.PG_SCALE.indexOf(g))),
  ['pg-f', 'pg-d', 'pg-c', 'pg-b', 'pg-a']);

console.log(NL + 'who gets a card');
const cards = () => { const out = []; M.ntPunishGrades(out); return out; };
M.set({ me: { k1: 'c', teamId: '3' } });
ok('team 3 graded weeks 1 and 2, so week 3 is the one left', cards().map(n => n.id), ['pg:2026:3']);
M.set({ me: { k1: 'a', teamId: '1' } });
ok('team 1 took week 2, so it is never asked about it', cards().map(n => n.id), []);
M.set({ me: { k1: 'b', teamId: '2' } });
ok('team 2 took week 1 and is asked about week 3 only', cards().map(n => n.id), ['pg:2026:3']);
M.set({ me: { k1: 'd', teamId: '4' } });
ok('a grade that is not on the scale does not count as answered', cards().map(n => n.id), ['pg:2026:1', 'pg:2026:2']);
ok('no card for a week still being played', cards().some(n => n.id === 'pg:2026:4'), false);
M.set({ me: null });
ok('nobody signed in, no cards', cards().length, 0);
M.set({ me: { k1: 'd', teamId: '4' }, rows: null });
ok('and none before the profiles are in, or every week would look ungraded', cards().length, 0);

console.log(NL + 'the card');
M.set({ rows: [row('d', 4, {})] });
const [w1] = cards();
ok('names the punished team and the punishment', [/Team 2/.test(w1.art), /Fruit Pledge/.test(w1.art)], [true, true]);
ok('carries the week it grades', w1.grade, { season: 2026, week: 1 });
ok('and does not clear until it is graded', M.ntNeedsVote(w1), true);
M.sent('pg_2026_w1', 'B');
ok('graded this session: it can go, and it is gone', [M.ntNeedsVote(w1), cards().map(n => n.id)], [false, ['pg:2026:2']]);
ok('pgMine reads the grade back', M.pgMine('2026', 1), 'B');

console.log(NL + 'the catch-up');
const day = t => { const d = new Date(t); return [d.getFullYear(), d.getMonth() + 1, d.getDate()]; };
ok('weeks 1 to 8 went out on 5 November 2026', day(cards()[0].day), [2026, 11, 5]);
{
  const late = [];
  for (let w = 1; w <= 9; w++) late.push(game(w, 1, 50 + w, 2, 60 + w, 'HOME'));
  M.sent('pg_2026_w1', null);                // a fresh manager, nothing sent this session
  M.set({ meta: { 2026: { schedule: late } }, rows: [row('z', 3, {})], me: { k1: 'z', teamId: '3' },
    cfg: { punishment: { schedule: Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8, 9].map(w => [w, 'Beer Pour'])) } } });
  const all = cards();
  ok('week 9 is dated the Tuesday it opens, 10 November', day(all.find(n => n.id === 'pg:2026:9').day), [2026, 11, 10]);
  ok('one card per finished week', all.length, 9);
}

console.log(NL + 'where it lives');
const src = fs.readFileSync(appUrl, 'utf8');
ok('the card is in the stack', /\[ntBkMakeGood,ntMotwPick,ntPunishGrades,/.test(src), true);
ok('dragging the slider is not a swipe', src.includes("if(e.target.closest('button,input')) return;"), true);
ok('the schedule shows who took each finished week', src.includes("(low?pgWhoHTML(season,w,low):'')"), true);
ok('the grade goes on the grader\'s own profile', src.includes('gflPatchProfile(_me.k1,{[k]:g})'), true);

console.log(NL + `${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
