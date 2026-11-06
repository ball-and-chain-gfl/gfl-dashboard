/* THE DAILY DROP: ONE QUESTION AND ONE PICK'EM A DAY, FROM WEEK 10 OF 2026.
 *
 *   THE CALENDAR        a day turns at 06:00 Central; the first daily question
 *                       is Tuesday 10 November 2026, while the pick'em started a
 *                       week earlier, in week 9; a week is Tuesday to Monday;
 *                       nothing daily before either or after the last week
 *   THE QUESTIONS       right +1 and wrong -1 as calls; a blank costs minus one,
 *                       and only once its week is over
 *   BOOM AND BOOF       four players with no two alike and the answer a point
 *                       clear, graded off weekly actual minus projection
 *   THE PICK'EM DRAW    rostered, projected 10+, a skill position, a game not
 *                       yet started and not about to; Thursday's from the
 *                       Thursday game; two neighbours in projection order
 *   THE PICK'EM GRADE   locks at the first kickoff; right/wrong once both games
 *                       are final; minus one for a lock with no pick
 *   THE OLD WEEKS       weeks 1-9 keep their five and their rules
 *
 * Run: node scripts/test-daily.mjs
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
const head = t => console.log(NL + t);
const appUrl = new URL('../public/app.js', import.meta.url);
const grab = lifter(appUrl);

const M = assemble(grab, [
  'const NFL_TEAMS=', 'function bkRand(', 'const bkPick=', 'function bkShuffle(',
  'const BK_DAILY=', 'const BK_DAILY_N=', 'const BK_DAY_HOUR=', 'const BK_TZ=', 'const BK_DAY_MS=',
  'function bkChiParts(', 'function bkChiMs(', 'function bkDayStart(', 'function bkDailyLastWeek(',
  'function bkDailyAt(', 'function bkDailyWeeks(', 'const bkdKey=', 'function bkDailyCalls(',
  'function bkProjGap(', 'function bkqProjWay(', 'function bkqBoom(', 'function bkqBoof(',
  'const pkeDoc=', 'const pkdKey=', 'const PKE_FROM_WEEK=', 'const pkeAt=', 'const pkeWeeks=', 'let _pkeDays=', 'function pkeBuild(', 'function pkeLocked(',
  'function pkePts(', 'function pkeResult(', 'function pkeCalls(',
], ['bkDailyAt', 'bkDailyWeeks', 'pkeAt', 'pkeWeeks', 'bkDailyCalls', 'bkqBoom', 'bkqBoof', 'bkRand', 'pkeBuild', 'pkeCalls',
  'pkeResult', 'pkeLocked', 'bkChiMs', 'set', 'clock'], [
  'let _now=0; const clock=t=>{ _now=t; };',
  'const Date=(()=>{ const D=globalThis.Date; return class extends D{ constructor(...a){ if(a.length) super(...a); else super(_now); } static now(){ return _now; } }; })();',
  'let _season="2026", _pool=[], _games=null, _rost=null, _states={}, _all={}, _sbRosters={};',
  'const _seasonMeta={}; const weeksOf=()=>({});',
  'const bkLeagueSeason=()=>_season;',
  'const bkPool=()=>_pool;',
  'const bkRanked=(pos)=>_pool.filter(p=>p.pos===pos&&p.total>0).sort((a,b)=>b.total-a.total);',
  'const nflWeekGames=()=>_games;',
  'const sbRosters=()=>_rost;',
  'const nflTeamState=(pt)=>_states[pt]||"pre";',
  'const pkeAll=()=>_all;',
  'const PICKEM_MIN_PROJ=10; const pName=id=>"P"+id;',
  'const set=o=>{ if("season" in o) _season=o.season; if("pool" in o) _pool=o.pool; if("games" in o) _games=o.games;',
  '  if("rost" in o) _rost=o.rost; if("states" in o) _states=o.states; if("all" in o) _all=o.all; };',
].join(NL));

const CT = (y, m, d, h, mi = 0) => M.bkChiMs(y, m, d, h) + mi * 60000;
const at = t => M.bkDailyAt(t);

head('the calendar');
ok('the first daily morning is Tuesday 10 November at 06:00 Central',
  [at(CT(2026, 11, 10, 5, 59)), at(CT(2026, 11, 10, 6))], [null, { season: '2026', week: 10, day: 0 }]);
ok('a day turns at six, not at midnight', [at(CT(2026, 11, 11, 5, 59)).day, at(CT(2026, 11, 11, 6)).day], [0, 1]);
ok('Thursday is day 2, Monday is day 6', [at(CT(2026, 11, 12, 20)).day, at(CT(2026, 11, 16, 23)).day], [2, 6]);
ok('Monday night is still the week; Tuesday at six is the next one',
  [at(CT(2026, 11, 17, 5, 59)), at(CT(2026, 11, 17, 6))],
  [{ season: '2026', week: 10, day: 6 }, { season: '2026', week: 11, day: 0 }]);
ok('a week in late December lands on its own number', at(CT(2026, 12, 25, 12)), { season: '2026', week: 16, day: 3 });
ok('nothing daily past the season\'s last week', at(CT(2027, 1, 5, 6)), null);
M.set({ season: '2025' });
ok('nothing daily in any other season', at(CT(2026, 11, 12, 12)), null);
M.set({ season: '2026' });
M.clock(CT(2026, 11, 19, 9));
ok('every week with time on the clock, and which are over',
  M.bkDailyWeeks(), [{ week: 10, over: true }, { week: 11, over: false }]);
M.clock(CT(2026, 11, 9, 9));
ok('and none before the first one', M.bkDailyWeeks(), []);
ok("the pick'em started in week 9, on its Tuesday's clock, while the questions waited",
  [M.pkeAt(CT(2026, 11, 5, 20)), M.bkDailyAt(CT(2026, 11, 5, 20))], [{ season: '2026', week: 9, day: 2 }, null]);
ok("so its Thursday of week 9 already has three days out", M.pkeAt(CT(2026, 11, 5, 20)).day + 1, 3);
ok("and nothing before week 9's Tuesday", M.pkeAt(CT(2026, 11, 3, 5, 59)), null);
M.clock(CT(2026, 11, 12, 9));
ok("its weeks carry week 9 along with the questions' first", M.pkeWeeks(), [{ week: 9, over: true }, { week: 10, over: false }]);

head('the questions');
const day = (a, r) => ({ a, r });
const profile = {
  bkd_2026_w10: JSON.stringify({ 0: day(1, 1), 1: day(0, 1), 2: day(2, -1), 3: day(3, 1), 5: day(0, -1) }),
  bkd_2026_w11: JSON.stringify({ 0: day(2, -1) }),
};
M.clock(CT(2026, 11, 19, 9));                 // Thursday of week 11
ok('right minus wrong as calls; week 10 over with two blanks; week 11 still open',
  M.bkDailyCalls(profile), { calls: 3 - 2 - 1, missed: -2 });
M.clock(CT(2026, 11, 24, 6));                 // the next Tuesday
ok('at the reset the week\'s blanks count, one each', M.bkDailyCalls(profile), { calls: 0, missed: -2 - 6 });
ok('a week nobody touched is all seven: weeks 10 and 11 are over, 12 has only just opened',
  M.bkDailyCalls({}), { calls: 0, missed: -7 * 2 });

head('boom and boof');
const mk = (id, pos, total, weeks, proj) => ({ id, name: 'N' + id, pos, total,
  weeks: Object.fromEntries(weeks.map((v, i) => [String(i + 1), v])),
  projWeeks: Object.fromEntries(proj.map((v, i) => [String(i + 1), v])) });
const pool = [];
let id = 1;
[1, 2, 3, 4].forEach(pos => { for (let i = 0; i < 12; i++) {
  const base = 10 + i, swing = ((id * 37) % 23) - 11;          // a spread of over- and under-performers
  pool.push(mk(id++, pos, 200 - i, Array(9).fill(base + swing / 3), Array(9).fill(base))); } });
while (pool.length < 60) pool.push(mk(id++, 5, 50, Array(9).fill(5), Array(9).fill(5)));
M.set({ pool });
const gapOf = name => { const p = pool.find(x => x.name === name);
  return Math.round(Object.keys(p.weeks).reduce((s, k) => s + p.weeks[k] - p.projWeeks[k], 0) * 10) / 10; };
let distinct = true, rightBoom = true, rightBoof = true, clear = true;
for (let s = 1; s <= 40; s++) {
  const b = M.bkqBoom(M.bkRand(s * 7919), 10), f = M.bkqBoof(M.bkRand(s * 104729), 10);
  for (const [q, dir] of [[b, 1], [f, -1]]) {
    if (!q) { distinct = false; continue; }
    const g = q.a.map(gapOf);
    if (new Set(g).size !== 4) distinct = false;
    const best = dir > 0 ? Math.max(...g) : Math.min(...g);
    if (g[q.correct] !== best) (dir > 0 ? rightBoom = false : rightBoof = false);
    const sorted = g.slice().sort((x, y) => dir * (y - x));
    if (Math.abs(sorted[0] - sorted[1]) < 1) clear = false;
  }
}
ok('forty draws each: four players, no two alike', distinct, true);
ok('boom\'s answer has beaten the projections by the most', rightBoom, true);
ok('boof\'s answer has fallen furthest short of them', rightBoof, true);
ok('and the answer is always a point clear of the next', clear, true);
ok('the wording asked for', [M.bkqBoom(M.bkRand(1), 10).q, M.bkqBoof(M.bkRand(1), 10).q], [
  'Which of these four players has beaten their ESPN weekly projections by the most this season?',
  'Which of these four players has scored under their ESPN weekly projections by the most this season?']);
ok('not in the first month', M.bkqBoom(M.bkRand(1), 4), null);

head('the pick\'em draw');
const THU = CT(2026, 11, 12, 19, 15), SUN = CT(2026, 11, 15, 12), MON = CT(2026, 11, 16, 19, 15);
// team ids from NFL_TEAMS: 33 BAL, 30 JAX, 21 PHI, 6 DAL, 12 KC, 2 BUF
const games = { games: [
  { id: 'g1', ht: 'BAL', at: 'JAX', s: 'pre', k: THU },
  { id: 'g2', ht: 'PHI', at: 'DAL', s: 'pre', k: SUN },
  { id: 'g3', ht: 'KC', at: 'BUF', s: 'pre', k: MON },
] };
const e = (pid, pt, pos, proj, slot = 0) => ({ pid, proTeam: pt, pos, wkProj: proj, slot, n: 'Pl' + pid });
const rost = { 1: [e(1, 33, 1, 22.1), e(2, 30, 3, 14.2), e(3, 33, 2, 14.0), e(4, 21, 2, 18.0), e(5, 6, 3, 17.6, 21)],
  2: [e(6, 21, 3, 15.3), e(7, 6, 4, 9.9), e(8, 12, 1, 21.9), e(9, 2, 2, 13.8), e(10, 2, 5, 12)] };
M.set({ games, rost });
const thu = M.pkeBuild('2026', 10, 2, CT(2026, 11, 12, 6));
ok('Thursday\'s pair comes from the Thursday game', [thu.a.team, thu.b.team].every(t => t === 'BAL' || t === 'JAX'), true);
ok('and its lock is that kickoff', thu.k, THU);
const tue = M.pkeBuild('2026', 10, 0, CT(2026, 11, 10, 6));
ok('a Tuesday pair is two neighbours in projection order', Math.abs(tue.a.proj - tue.b.proj) <= 1, true);
const pool2 = [];
for (let s = 0; s < 4; s++) { const p = M.pkeBuild('2026', 10, 4, CT(2026, 11, 14, 6)); if (p) pool2.push(p.a.pid, p.b.pid); }
ok('never the injured list, a kicker, or anybody projected under ten', pool2.some(x => [5, 7, 10].includes(x)), false);
const late = M.pkeBuild('2026', 10, 2, THU - 10 * 60000);
ok('ten minutes before Thursday kicks off, its players are not drawn', [late.a.team, late.b.team].some(t => t === 'BAL' || t === 'JAX'), false);
M.set({ games: { games: games.games.map(g => g.id === 'g2' ? { ...g, s: 'in' } : g) } });
const mon = M.pkeBuild('2026', 10, 6, CT(2026, 11, 16, 6));
ok('Monday morning: only Monday night is left', [mon.a.team, mon.b.team].every(t => t === 'KC' || t === 'BUF'), true);
M.set({ games: null });
ok('no schedule yet: wait rather than draw', M.pkeBuild('2026', 10, 0, CT(2026, 11, 10, 6)), undefined);

head('the pick\'em grade');
const pe = { season: '2026', week: 10, day: 5, k: SUN,
  a: { pid: 4, pt: 21, team: 'PHI', name: 'A' }, b: { pid: 6, pt: 21, team: 'PHI', name: 'B' } };
const poolW = (a, b) => [{ id: 4, weeks: a == null ? {} : { 10: a } }, { id: 6, weeks: b == null ? {} : { 10: b } }];
M.set({ all: { k: pe }, states: {}, pool: poolW(20, 11) });
M.clock(SUN - 3600000);
ok('before kickoff it is open, and an empty pick costs nothing yet', [M.pkeLocked(pe), M.pkeCalls({})], [false, { calls: 0, missed: 0 }]);
M.clock(SUN + 60000);
ok('from kickoff a missing pick is minus one', M.pkeCalls({}), { calls: 0, missed: -1 });
M.set({ states: { 21: 'in' } });
ok('mid-game nothing is graded', M.pkeCalls({ pkd_2026_w10: JSON.stringify({ 5: '4' }) }), { calls: 0, missed: 0 });
M.set({ states: { 21: 'post' } });
ok('both final: the right pick is +1', M.pkeCalls({ pkd_2026_w10: JSON.stringify({ 5: '4' }) }), { calls: 1, missed: 0 });
ok('and the wrong one -1', M.pkeCalls({ pkd_2026_w10: JSON.stringify({ 5: '6' }) }), { calls: -1, missed: 0 });
M.set({ pool: poolW(15, 15) });
ok('a dead heat is neither', M.pkeCalls({ pkd_2026_w10: JSON.stringify({ 5: '4' }) }), { calls: 0, missed: 0 });
M.set({ pool: poolW(9, null), states: { 21: 'post' } });
ok('within the week, a player with no line yet is not a zero', M.pkeResult(pe), null);
M.clock(CT(2026, 11, 17, 6));
ok('once the week is over he did not play, and scored nothing', M.pkeResult(pe), 4);

head('the old weeks');
const src = fs.readFileSync(appUrl, 'utf8');
ok('weeks before the daily drop still owe their weekly five',
  src.includes('if(String(bkLeagueSeason())===BK_DAILY.season&&w>=BK_DAILY.week) continue;   // daily: bkDailyCalls'), true);
ok('the weekly set is not built, and no key written for it, in a daily week',
  src.includes('function bkQuestions(){\n  if(bkDailyAt()) return [];') || src.includes('function bkQuestions(){\r\n  if(bkDailyAt()) return [];'), true);
ok('the daily drop counts toward Ball Knowledge, blanks undoubled',
  /calls\+=dq\.calls\+dp\.calls;\s*score\+=dq\.missed\+dp\.missed;\s*score\+=calls\*BK_PT\+bkPicksMissed\(p\);/.test(src), true);
ok('the eight kinds: the six there were, then boom and boof',
  src.includes('const BK_DAILY_KINDS=[bkqManager,bkqGroup,bkqRank,bkqGraph,bkqBio,bkqTeamRanks,bkqBoom,bkqBoof];'), true);
ok('the weekly six are untouched, so weeks 1-9 rebuild the same',
  src.includes('const BK_KINDS=[bkqManager,bkqGroup,bkqRank,bkqGraph,bkqBio,bkqTeamRanks];'), true);

console.log(NL + `${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
