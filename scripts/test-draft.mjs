/* GRADING A DRAFT PICK.
 *
 * A pick is worth what it returned above a startable player, measured against
 * what its slot normally returns. This suite pins the failures of the rank
 * delta it replaces, the two exclusions (defenses out, kickers on their own
 * curve), where the flex actually goes, and how any of it behaves in week 3 of
 * a season rather than after one.
 *
 * It also refuses to let the baked DRAFT_CURVE drift from the generator that
 * produced it -- a constant that no longer matches its source is a constant
 * nobody can trust.
 */
import fs from 'fs';
import { execFileSync } from 'child_process';
import { lifter, assemble } from './lib/lift.mjs';

const ROOT = new URL('../', import.meta.url);
const grab = lifter(new URL('public/app.js', ROOT));

/* _seasonMeta is a live global in the browser; out here the tests own it, so a
   season can be handed a schedule that is three weeks old. */
const api = assemble(grab, [
  'const DRAFT_BASE_SLOTS=',
  'const DRAFT_FLEX_SLOTS=',
  'const DRAFT_FLEX_POS=',
  'const DRAFT_SEASON_WEEKS=',
  'const DRAFT_CURVE=',
  'function draftStarterCounts(pool){',
  'function draftReplacement(stats){',
  'const weekDecided=',
  'const weekScored=',
  'function weeksOf(schedule){',
  'function weekOver(byWeek,w){',
  'function weeksOverCount(schedule){',
  'function draftWeeksDone(season){',
  'const draftBaseline=',
  'const drCol=',
  'const drNum=',
  'const drSum=',
  'function computeDraftRows(picks, stats, season){',
], [
  'DRAFT_BASE_SLOTS', 'DRAFT_FLEX_SLOTS', 'DRAFT_FLEX_POS', 'DRAFT_SEASON_WEEKS', 'DRAFT_CURVE',
  'draftStarterCounts', 'draftReplacement', 'weeksOverCount', 'draftWeeksDone', 'draftBaseline',
  'drCol', 'drNum', 'drSum', 'computeDraftRows', 'setMeta',
], `
const POS_NAMES={1:'QB',2:'RB',3:'WR',4:'TE',5:'K',16:'D/ST'};
const _playerNames={};
let _seasonMeta={};
const setMeta=m=>{ _seasonMeta=m||{}; };
`);

let pass = 0, fail = 0;
const near = (a, b, eps = 0.05) => Math.abs(a - b) < eps;
const nl = String.fromCharCode(10);
function ok(name, cond, detail) {
  console.log((cond ? '  PASS  ' : '  FAIL  ') + name);
  if (!cond) { if (detail !== undefined) console.log('        ' + detail); fail++; } else pass++;
}

/* a season whose first `done` weeks are finished, in the shape weekOver reads */
function schedule(done, total = 17) {
  const out = [];
  for (let w = 1; w <= total; w++) {
    for (let g = 0; g < 6; g++) {
      out.push({ matchupPeriodId: w, winner: w <= done ? 'HOME' : 'UNDECIDED',
        home: { teamId: g * 2 + 1, totalPoints: w <= done ? 100 : 0 },
        away: { teamId: g * 2 + 2, totalPoints: w <= done ? 90 : 0 } });
    }
  }
  return out;
}
const useSeason = (season, done) => api.setMeta({ [String(season)]: { owners: {}, schedule: schedule(done) } });

/* a stat sheet where every position is a clean ladder, scaled by `frac` so a
   partial season looks like a partial season */
function sheet(frac = 1, opts = {}) {
  const out = [];
  const mk = (pos, n, top, step) => {
    for (let i = 0; i < n; i++) out.push({ id: pos * 1000 + i, n: POSN(pos) + (i + 1), pos,
      pts: Math.round((top - i * step) * frac * 10) / 10 });
  };
  mk(1, 40, 300, 4);
  mk(2, 60, opts.rbTop ?? 300, 5);
  mk(3, 60, opts.wrTop ?? 300, 4);       // WRs decay slower -> deeper pool
  mk(4, 40, 250, 6);
  mk(5, 40, 140, 2);
  mk(16, 40, 150, 2);
  out.sort((a, b) => b.pts - a.pts);
  return out;
}
const POSN = p => ({ 1: 'QB', 2: 'RB', 3: 'WR', 4: 'TE', 5: 'K', 16: 'DST' })[p];

console.log('1. THE BAKED CURVE STILL MATCHES ITS SOURCE');
{
  const cwd = fs.realpathSync(new URL('.', ROOT));
  const out = execFileSync(process.execPath, ['scripts/gen-draft-curve.mjs'], { cwd, encoding: 'utf8' });
  const regen = new Function(out + '; return DRAFT_CURVE;')();
  ok('the skill curve is what the generator produces',
     JSON.stringify(regen.skill) === JSON.stringify(api.DRAFT_CURVE.skill),
     'app.js holds ' + api.DRAFT_CURVE.skill.length + ', the generator produced ' + regen.skill.length);
  ok('and so is the kicker curve', JSON.stringify(regen.k) === JSON.stringify(api.DRAFT_CURVE.k));
  ok('the curve never rises as the draft goes on',
     api.DRAFT_CURVE.skill.every((v, i) => i === 0 || v <= api.DRAFT_CURVE.skill[i - 1]));
  ok('and it reaches zero, which is what makes late picks free',
     api.DRAFT_CURVE.skill[api.DRAFT_CURVE.skill.length - 1] === 0);
  ok('the kicker baseline is zero everywhere', api.DRAFT_CURVE.k.every(v => v === 0));
}

console.log(nl + '2. WHERE THE FLEX ACTUALLY GOES');
{
  const pool = p => { const o = {}; sheet().forEach(x => { (o[x.pos] = o[x.pos] || []).push(x.pts); });
    Object.keys(o).forEach(k => o[k].sort((a, b) => b - a)); return p ? o[p] : o; };
  const n = api.draftStarterCounts(pool());
  const base = api.DRAFT_BASE_SLOTS;
  ok('every flex spot is allocated',
     [2, 3, 4].reduce((a, p) => a + (n[p] - base[p]), 0) === api.DRAFT_FLEX_SLOTS,
     JSON.stringify(n));
  ok('the mandatory slots are never reduced', [1, 2, 3, 4, 5].every(p => n[p] >= base[p]));
  ok('QB and K take no flex', n[1] === base[1] && n[5] === base[5]);
  /* WRs decay slower in this fixture, so the deep WR beats the deep RB and the
     flex goes to receivers -- which is what the real league does 11-12 times
     out of 12 */
  ok('the deeper position takes the flex', n[3] > n[2], 'RB' + n[2] + ' WR' + n[3]);

  /* and it follows the points, not a hardcoded preference */
  const rbHeavy = {}; sheet(1, { rbTop: 460 }).forEach(x => { (rbHeavy[x.pos] = rbHeavy[x.pos] || []).push(x.pts); });
  Object.keys(rbHeavy).forEach(k => rbHeavy[k].sort((a, b) => b - a));
  const m = api.draftStarterCounts(rbHeavy);
  ok('make the running backs better and the flex follows them', m[2] > n[2],
     'RB' + m[2] + ' WR' + m[3]);

  /* the real league, from the real sheets */
  const real = JSON.parse(fs.readFileSync(new URL('public/data/seasonstats-2022.json', ROOT), 'utf8')).players;
  const rp = {}; real.forEach(p => { (rp[p.pos] = rp[p.pos] || []).push(p.pts || 0); });
  Object.keys(rp).forEach(k => rp[k].sort((a, b) => b - a));
  const r22 = api.draftStarterCounts(rp);
  ok('2022 really does put all twelve flex spots on receivers',
     r22[3] === 36 && r22[2] === 24, 'RB' + r22[2] + ' WR' + r22[3] + ' TE' + r22[4]);
}

console.log(nl + '3. REPLACEMENT IS THE LAST STARTER, ON THIS SEASON\'S OWN SHEET');
{
  const st = sheet();
  const r = api.draftReplacement(st);
  const pool = {}; st.forEach(x => { (pool[x.pos] = pool[x.pos] || []).push(x.pts); });
  Object.keys(pool).forEach(k => pool[k].sort((a, b) => b - a));
  const n = api.draftStarterCounts(pool);
  ok('each bar is the nth best at that position', [1, 2, 3, 4, 5].every(p => r[p] === pool[p][n[p] - 1]));
  ok('defenses get no bar at all', r[16] === undefined);
  ok('a deeper flex means a LOWER bar for that position', r[3] < pool[3][api.DRAFT_BASE_SLOTS[3] - 1]);
  /* three weeks in, everything is a fraction of itself -- and so is the bar */
  const part = api.draftReplacement(sheet(3 / 17));
  ok('a partial season moves the bar with it', near(part[2], r[2] * 3 / 17, 1),
     part[2] + ' vs ' + (r[2] * 3 / 17).toFixed(1));
}

console.log(nl + '4. HOW MUCH SEASON HAS BEEN PLAYED');
{
  useSeason(2099, 3);
  ok('three finished weeks reads as three', api.draftWeeksDone(2099) === 3);
  useSeason(2099, 0);
  ok('a season nobody has played reads as zero', api.draftWeeksDone(2099) === 0);
  useSeason(2099, 17);
  ok('a finished season reads as the whole thing', api.draftWeeksDone(2099) === api.DRAFT_SEASON_WEEKS);
  /* a historical season has no schedule loaded, and a historical season is over */
  api.setMeta({});
  ok('no schedule means a finished season, not an unplayed one',
     api.draftWeeksDone(2099) === api.DRAFT_SEASON_WEEKS);
}

console.log(nl + '5. THE BASELINE, PRORATED');
{
  const full = api.draftBaseline(1, 2, 1);
  ok('pick 1 at full season is the head of the curve', full === api.DRAFT_CURVE.skill[0]);
  ok('three weeks in it is three seventeenths', near(api.draftBaseline(1, 2, 3 / 17), full * 3 / 17));
  ok('before any football it is nothing', api.draftBaseline(1, 2, 0) === 0);
  ok('it clamps above one', api.draftBaseline(1, 2, 5) === full);
  ok('and below zero', api.draftBaseline(1, 2, -3) === 0);
  ok('an omitted factor still means full season', api.draftBaseline(1, 2) === full);
  ok('a slot past the array takes the last value', api.draftBaseline(9999, 2, 1) === 0);
  ok('a kicker reads the kicker curve', api.draftBaseline(1, 5, 1) === 0 && full > 0);
}

console.log(nl + '6. ONE THURSDAY NIGHT IS NOT A GRADED SEASON');
{
  const st = sheet(1 / 17);
  const picks = [{ playerId: 2000, teamId: 1, overall: 1, round: 1 }];
  useSeason(2099, 0);
  const early = api.computeDraftRows(picks, st, 2099);
  ok('points on the board but no week finished: not graded', early[0].graded === false);
  ok('and the score is null, not zero', early[0].score === null);
  ok('but the pick is still listed', early[0].name === 'RB1' && early[0].posDrafted === 1);
  useSeason(2099, 1);
  ok('once week 1 is over it grades', api.computeDraftRows(picks, st, 2099)[0].graded === true);
}

console.log(nl + '7. WEEK 3 IS NOT GRADED AGAINST A SEVENTEEN-WEEK BAR');
{
  /* the bug this fixes: par is cumulative-to-date, DRAFT_CURVE is full-season.
     Ungated, one week of production against a whole season's baseline put every
     pick in the league near -56 and kept the board negative until week 12. */
  const picks = [{ playerId: 2000, teamId: 1, overall: 9, round: 1 }];
  const at = wk => { useSeason(2099, wk); return api.computeDraftRows(picks, sheet(wk / 17), 2099)[0]; };
  const w3 = at(3), w17 = at(17);
  ok('a week-3 board is not deeply negative', w3.score > 0, 'scored ' + w3.score);
  ok('the baseline shrinks with the season',
     near(w3.par - w3.score, (w17.par - w17.score) * 3 / 17, 1),
     'wk3 baseline ' + (w3.par - w3.score).toFixed(1) + ', full ' + (w17.par - w17.score).toFixed(1));
  /* the same player, the same relative standing, all season: the score should
     grow roughly in step rather than start deep underwater and climb out */
  const path = [1, 3, 6, 10, 14, 17].map(w => at(w).score);
  ok('every week of the season scores positive', path.every(v => v > 0), JSON.stringify(path));
  ok('and it grows as the season does', path.every((v, i) => i === 0 || v >= path[i - 1]),
     JSON.stringify(path));
}

console.log(nl + '8. WHAT A PICK SCORES');
{
  useSeason(2099, 17);
  const st = sheet();
  const picks = [
    { playerId: 2000, teamId: 1, overall: 1, round: 1 },      // the best RB, first overall
    { playerId: 2059, teamId: 2, overall: 2, round: 1 },      // the worst RB, second overall
    { playerId: 2005, teamId: 3, overall: 160, round: 14 },   // a good RB, very late
    { playerId: 16000, teamId: 4, overall: 100, round: 9 },   // a defense
    { playerId: 5000, teamId: 5, overall: 150, round: 13 },   // the best kicker
  ];
  const by = {}; api.computeDraftRows(picks, st, 2099).forEach(r => { by[r.overall] = r; });
  const repl = api.draftReplacement(st);
  ok('a pick banks its points above replacement, less the slot',
     near(by[1].score, (st.find(p => p.id === 2000).pts - repl[2]) - api.draftBaseline(1, 2, 1)));
  ok('a useless player floors at zero rather than going negative', by[2].par === 0);
  ok('so his score is exactly minus the slot', near(by[2].score, -api.draftBaseline(2, 2, 1)));
  ok('THE SAME PRODUCTION IS WORTH MORE WHEN IT COMES LATER', by[160].score > by[1].score);
  ok('a very late pick is graded against nothing', near(by[160].score, by[160].par));
  ok('A DEFENSE IS NOT GRADED', by[100].score === null);
  ok('but it still appears, named and slotted',
     by[100].posName === 'D/ST' && by[100].posDrafted === 1);
  ok('a kicker IS graded, against a zero baseline', by[150].score !== null && near(by[150].score, by[150].par));
}

console.log(nl + '9. THE FAILURES OF THE OLD RANK DELTA, AS REGRESSIONS');
{
  useSeason(2099, 17);
  const st = sheet();
  const one = (pid, overall, round) =>
    api.computeDraftRows([{ playerId: pid, teamId: 1, overall, round }], st, 2099)[0];
  const hit = one(2000, 9, 1);
  ok('the best player in the draft, taken 9th, is a big positive', hit.score > 50, 'scored ' + hit.score);
  ok('a first overall pick who returns nothing is a big negative', one(2059, 1, 1).score < -50);
  ok('the first RB off the board CAN now score positive', one(2000, 1, 1).score > 0);
  ok('A WHIFFED LATE PICK COSTS EXACTLY ZERO', one(2059, 150, 13).score === 0);
  ok('a first-round hit outscores a typical late hit', hit.score > one(2024, 150, 13).score);
}

console.log(nl + '10. SUMMING AND FORMATTING IGNORE THE UNGRADED');
{
  ok('drSum skips nulls', api.drSum([{ score: 10 }, { score: null }, { score: -4 }]) === 6);
  ok('drSum of nothing is zero', api.drSum([]) === 0 && api.drSum(null) === 0);
  ok('drNum writes a dash for no score', api.drNum(null) === '—');
  ok('drNum signs a positive', api.drNum(12.4) === '+12');
  ok('drNum rounds rather than truncating', api.drNum(-12.6) === '-13');
  /* +0.3 used to print "+0" while -0.3 printed "0" -- a marginal beat and a
     marginal miss looked like two different things. Zero is written one way. */
  ok('a hair above its slot reads 0', api.drNum(0.3) === '0');
  ok('a hair below reads the same', api.drNum(-0.3) === '0');
  ok('and exactly on it too', api.drNum(0) === '0');
  ok('no signed zero anywhere', ['+0','-0'].indexOf(api.drNum(0.4)) === -1);
  ok('drCol greys out an ungraded pick', api.drCol(null) === 'var(--text3)');
  ok('drCol is one colour up and another down', api.drCol(5) !== api.drCol(-5));
}

console.log(nl + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
