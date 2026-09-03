/* GRADING A DRAFT PICK.
 *
 * A pick is worth what it returned above a startable player, measured against
 * what its slot normally returns. This suite pins the failures of the rank
 * delta it replaces, the two exclusions (defenses out, kickers on their own
 * curve), and -- most importantly -- that the baked DRAFT_CURVE still matches
 * what the generator produces from public/data. A constant that silently
 * drifts from its source is a constant nobody can trust.
 */
import fs from 'fs';
import { execFileSync } from 'child_process';

const ROOT = new URL('../', import.meta.url);
const SRC = fs.readFileSync(new URL('public/app.js', ROOT), 'utf8')
  .split(String.fromCharCode(13)).join('');
const BS = String.fromCharCode(92);
const TICK = String.fromCharCode(96);

function skipQuote(src, i) {
  const q = src[i]; let j = i + 1;
  while (j < src.length) {
    if (src[j] === BS) { j += 2; continue; }
    if (src[j] === q) return j + 1;
    j++;
  }
  return j;
}
function skipTemplate(src, i) {
  let j = i + 1;
  while (j < src.length) {
    if (src[j] === BS) { j += 2; continue; }
    if (src[j] === TICK) return j + 1;
    if (src[j] === '$' && src[j + 1] === '{') {
      let d = 1; j += 2;
      while (j < src.length && d > 0) {
        const c = src[j];
        if (c === BS) { j += 2; continue; }
        if (c === "'" || c === '"') { j = skipQuote(src, j); continue; }
        if (c === TICK) { j = skipTemplate(src, j); continue; }
        if (c === '{') d++; else if (c === '}') d--;
        j++;
      }
      continue;
    }
    j++;
  }
  return j;
}
function grab(startsWith) {
  const i = SRC.indexOf(startsWith);
  if (i < 0) throw new Error('not found in app.js: ' + startsWith);
  let j = i, depth = 0;
  while (j < SRC.length) {
    const c = SRC[j];
    if (c === "'" || c === '"') { j = skipQuote(SRC, j); continue; }
    if (c === TICK) { j = skipTemplate(SRC, j); continue; }
    if (c === '/' && SRC[j + 1] === '/') { const e = SRC.indexOf(String.fromCharCode(10), j); j = e < 0 ? SRC.length : e; continue; }
    if (c === '/' && SRC[j + 1] === '*') { const e = SRC.indexOf('*/', j); j = e < 0 ? SRC.length : e + 2; continue; }
    if (c === '(' || c === '[' || c === '{') { depth++; j++; continue; }
    if (c === ')' || c === ']' || c === '}') {
      depth--; j++;
      if (depth === 0 && (c === '}' || c === ']')) return SRC.slice(i, j);
      continue;
    }
    if (c === ';' && depth === 0) return SRC.slice(i, j + 1);
    j++;
  }
  return SRC.slice(i, j);
}

const parts = [
  "const POS_NAMES={1:'QB',2:'RB',3:'WR',4:'TE',5:'K',16:'DST'};",
  'const _playerNames={};',
  'const _seasonMeta={};',
  grab('const DRAFT_STARTERS='),
  grab('const DRAFT_CURVE='),
  grab('function draftReplacement(stats){'),
  grab('const draftBaseline='),
  grab('const drCol='),
  grab('const drNum='),
  grab('const drSum='),
  grab('function computeDraftRows(picks, stats, season){'),
  'return { DRAFT_STARTERS, DRAFT_CURVE, draftReplacement, draftBaseline, drCol, drNum, drSum, computeDraftRows };',
];
const api = new Function(parts.join(String.fromCharCode(10)))();

let pass = 0, fail = 0;
const near = (a, b, eps = 0.05) => Math.abs(a - b) < eps;
function ok(name, cond, detail) {
  console.log((cond ? '  PASS  ' : '  FAIL  ') + name);
  if (!cond) { if (detail !== undefined) console.log('        ' + detail); fail++; } else pass++;
}
const nl = String.fromCharCode(10);

console.log('1. THE BAKED CURVE STILL MATCHES ITS SOURCE');
{
  const cwd = fs.realpathSync(new URL('.', ROOT));
  const out = execFileSync(process.execPath, ['scripts/gen-draft-curve.mjs'], { cwd, encoding: 'utf8' });
  const regen = new Function(out + '; return DRAFT_CURVE;')();
  ok('the skill curve is what the generator produces',
     JSON.stringify(regen.skill) === JSON.stringify(api.DRAFT_CURVE.skill),
     'app.js holds ' + api.DRAFT_CURVE.skill.length + ' values, the generator produced ' + regen.skill.length);
  ok('and so is the kicker curve',
     JSON.stringify(regen.k) === JSON.stringify(api.DRAFT_CURVE.k));
  ok('the curve never rises as the draft goes on',
     api.DRAFT_CURVE.skill.every((v, i) => i === 0 || v <= api.DRAFT_CURVE.skill[i - 1]));
  ok('and it reaches zero, which is what makes late picks free',
     api.DRAFT_CURVE.skill[api.DRAFT_CURVE.skill.length - 1] === 0);
  /* the median drafted kicker never finishes startable -- a fact about kickers,
     not a placeholder waiting to be filled in */
  ok('the kicker baseline is zero everywhere', api.DRAFT_CURVE.k.every(v => v === 0));
}

console.log(nl + '2. THE BASELINE READS OFF THE SLOT, AND RUNS OFF THE END SAFELY');
{
  ok('pick 1 is the dearest slot', api.draftBaseline(1, 2) === api.DRAFT_CURVE.skill[0]);
  ok('a slot past the end of the array takes the last value', api.draftBaseline(9999, 2) === 0);
  ok('pick 0 and negatives clamp to pick 1', api.draftBaseline(0, 2) === api.draftBaseline(1, 2));
  ok('a kicker reads the kicker curve, not the skill one',
     api.draftBaseline(1, 5) === 0 && api.draftBaseline(1, 2) > 0);
  ok('an early slot is worth more than a late one',
     api.draftBaseline(1, 2) > api.draftBaseline(40, 2));
}

console.log(nl + "3. REPLACEMENT IS THIS SEASON'S OWN BAR");
{
  const mk = (pos, n, step) => [...Array(n)].map((_, i) => ({ id: pos * 1000 + i, n: 'p' + i, pos, pts: 300 - i * step }));
  const stats = [...mk(2, 60, 5), ...mk(3, 60, 5), ...mk(1, 40, 5), ...mk(4, 40, 5), ...mk(5, 40, 5), ...mk(16, 40, 5)];
  const r = api.draftReplacement(stats);
  ok('RB replacement is the 30th best RB', r[2] === 300 - 29 * 5);
  ok('QB replacement is the 12th best QB', r[1] === 300 - 11 * 5);
  ok('defenses get no replacement level at all', r[16] === undefined);
  /* double every score and the bar doubles with it, so a high-scoring season
     does not hand the whole league a bonus */
  const hot = stats.map(p => ({ ...p, pts: p.pts * 2 }));
  ok('a higher-scoring season raises the bar with it', api.draftReplacement(hot)[2] === r[2] * 2);
}

console.log(nl + '4. WHAT A PICK SCORES');
{
  const stats = [];
  for (let i = 0; i < 60; i++) stats.push({ id: 2000 + i, n: 'RB' + (i + 1), pos: 2, pts: 300 - i * 5 });
  for (let i = 0; i < 40; i++) stats.push({ id: 16000 + i, n: 'D' + (i + 1), pos: 16, pts: 150 - i * 2 });
  for (let i = 0; i < 40; i++) stats.push({ id: 5000 + i, n: 'K' + (i + 1), pos: 5, pts: 140 - i * 2 });
  stats.sort((a, b) => b.pts - a.pts);
  const picks = [
    { playerId: 2000, teamId: 1, overall: 1, round: 1 },      // the best RB, first overall
    { playerId: 2059, teamId: 2, overall: 2, round: 1 },      // the worst RB, second overall
    { playerId: 2005, teamId: 3, overall: 160, round: 14 },   // a good RB, very late
    { playerId: 16000, teamId: 4, overall: 100, round: 9 },   // a defense
    { playerId: 5000, teamId: 5, overall: 150, round: 13 },   // the best kicker
  ];
  const rows = api.computeDraftRows(picks, stats, 2099);
  const by = {}; rows.forEach(r => { by[r.overall] = r; });
  const replRB = 300 - 29 * 5;

  ok('the best RB at pick 1 banks his points above replacement, less the slot',
     near(by[1].score, (300 - replRB) - api.draftBaseline(1, 2)),
     by[1].score + ' vs ' + ((300 - replRB) - api.draftBaseline(1, 2)));
  ok('a useless player floors at zero rather than going negative', by[2].par === 0);
  ok('so his score is exactly minus the slot', near(by[2].score, -api.draftBaseline(2, 2)));
  ok('THE SAME PRODUCTION IS WORTH MORE WHEN IT COMES LATER',
     by[160].score > by[1].score, by[160].score + ' at pick 160 vs ' + by[1].score + ' at pick 1');
  ok('a very late pick is graded against nothing', near(by[160].score, by[160].par));
  ok('A DEFENSE IS NOT GRADED', by[100].score === null);
  ok('but it still appears, named and slotted',
     by[100].name === 'D1' && by[100].posName === 'DST' && by[100].posDrafted === 1);
  ok('a kicker IS graded', by[150].score !== null);
  ok('and against a zero baseline, so he can only gain', near(by[150].score, by[150].par));
}

console.log(nl + '5. THE FAILURES OF THE OLD RANK DELTA, AS REGRESSIONS');
{
  const stats = [];
  for (let i = 0; i < 60; i++) stats.push({ id: 2000 + i, n: 'RB' + (i + 1), pos: 2, pts: 300 - i * 5 });
  stats.sort((a, b) => b.pts - a.pts);
  const one = (pid, overall, round) =>
    api.computeDraftRows([{ playerId: pid, teamId: 1, overall, round }], stats, 2099)[0];
  /* 2025, pick 9: the eventual RB1. The rank delta gave that +3, and gave a
     round-13 flier +47. */
  const hit = one(2000, 9, 1);
  ok('the best player in the draft, taken 9th, is a big positive', hit.score > 50, 'scored ' + hit.score);
  /* 2024, pick 1: a first overall pick who returned nothing */
  const miss = one(2059, 1, 1);
  ok('a first overall pick who returns nothing is a big negative', miss.score < -50, 'scored ' + miss.score);
  /* A first-round hit beats a TYPICAL late hit, which is the thing the old
     metric could not do -- there, every one of the ten biggest positives in
     four years was round 9 or later. */
  ok('a first-round hit outscores a typical late hit', hit.score > one(2024, 150, 13).score,
     hit.score + ' vs ' + one(2024, 150, 13).score);
  /* But a MONSTER late hit still beats it, and that is correct rather than a
     regression: a 250-point back taken 150th beat his slot by more than a
     300-point back taken 9th beat his. Against-expectation is the whole point,
     so this asserts the behaviour rather than guarding against it. */
  ok('a monster late hit still outscores it, which is the design working',
     one(2010, 150, 13).score > hit.score);
  ok('A WHIFFED LATE PICK COSTS EXACTLY ZERO', one(2059, 150, 13).score === 0);
  /* the ceiling that made the old metric unfixable: the first player taken at a
     position could not score positive, however well he did */
  ok('the first RB off the board CAN now score positive', one(2000, 1, 1).score > 0);
}

console.log(nl + '6. A SEASON NOBODY HAS PLAYED HAS NO GRADES');
{
  const stats = [...Array(40)].map((_, i) => ({ id: 2000 + i, n: 'RB' + i, pos: 2, pts: 0 }));
  const rows = api.computeDraftRows([{ playerId: 2000, teamId: 1, overall: 1, round: 1 }], stats, 2099);
  ok('graded is false', rows[0].graded === false);
  ok('score is null rather than zero', rows[0].score === null);
  ok('but the pick is still there, named and slotted',
     rows[0].name === 'RB0' && rows[0].posDrafted === 1);
}

console.log(nl + '7. SUMMING AND FORMATTING IGNORE THE UNGRADED');
{
  ok('drSum skips nulls', api.drSum([{ score: 10 }, { score: null }, { score: -4 }]) === 6);
  ok('drSum of nothing is zero', api.drSum([]) === 0 && api.drSum(null) === 0);
  ok('drNum writes a dash for no score', api.drNum(null).length === 1 && api.drNum(null) !== '0');
  ok('drNum signs a positive', api.drNum(12.4) === '+12');
  ok('drNum rounds rather than truncating', api.drNum(-12.6) === '-13');
  ok('drCol greys out an ungraded pick', api.drCol(null) === 'var(--text3)');
  ok('drCol is one colour up and another down', api.drCol(5) !== api.drCol(-5));
}

console.log(nl + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
