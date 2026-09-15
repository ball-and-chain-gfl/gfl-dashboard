/* A FINISHED WEEK ENDS ON THE RESULT, AND A SMALL NUMBER OF POINTS IS A SMALL
 * NUMBER OF POINTS.
 *
 * Two faults met at the end of week 1 and between them put The Bryan Football
 * Team on 98.4% in a game it LOST 152.46 to 156.36.
 *
 *   1. wpAt read any recorded "remaining" at or under 1.5 as a FRACTION of the
 *      side's projection -- a shim for twenty minutes of week 1 written that
 *      way. BFT finished with 0.24 points left. Read as a fraction that is 24%
 *      of a 124 point projection: 29.9 points. A side losing by 3.9 became a
 *      side winning by 26. Every endgame reading passes through that window,
 *      so it was going to invert somebody's graph every week.
 *
 *   2. wpAt clamps to [0.001, 0.999] so the model never claims certainty while
 *      a game is on -- correct then, wrong the moment the last one ends. Even
 *      with the shim gone the curve finished on 0.1% rather than 0%.
 *
 * Run: node scripts/test-wpfinal.mjs
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
const M = assemble(grab, [
  'const SCHED_SD=', 'const liveMKey=',
  'function schedNormCdf(z){', 'const wpSd=',
  'function wpAt(a,b,projA,projB,f,mu0,lA,lB){',
  'function wpSlateProgress(series,projByOwner){',
  'function wpCurve(series,projByOwner,ownerA,ownerB,mu0,projFull,decided){',
], ['wpCurve', 'wpAt', 'liveMKey']);

/* ── the inversion ────────────────────────────────────────────────────────── */
head('a handful of points left is not a fraction of the projection');
/* BFT 152.46, Lebron 156.36, BFT with 0.24 points still to come. */
const p = M.wpAt(152.46, 156.36, 124.48, 118.3, 1, null, 0.24, 0);
ok('the side that is behind is behind', p < 0.5, true);
ok('and it is nearly settled', p < 0.02, true);

head('the same reading, read the old way, inverted it');
/* 0.24 * 124.48 = 29.9 points, which is what the shim produced. */
const wrong = M.wpAt(152.46, 156.36, 124.48, 118.3, 1, null, 29.9, 0);
ok('29.9 points left really would make it a favourite', wrong > 0.9, true);
ok('which is why the two must not be confused', (p < 0.5) !== (wrong < 0.5), true);

head('a genuinely large remaining is still read as points');
const big = M.wpAt(100, 130, 150, 150, 0.5, null, 60, 5);
ok('60 points to come against 5 beats a 30 point deficit', big > 0.5, true);

head('an absent remaining still falls back to the clock');
const noRem = M.wpAt(100, 130, 150, 150, 0.5, null, null, null);
ok('it answers', typeof noRem, 'number');
ok('and is behind on a 30 point deficit at half', noRem < 0.5, true);

/* ── the ending ───────────────────────────────────────────────────────────── */
head('an undecided week never claims certainty');
const live = M.wpAt(140, 40, 150, 150, 0.9, null, 2, 1);
ok('a hundred point lead with a little left is not 100%', live < 1, true);
ok('nor is the other side at 0', live > 0, true);

head('a decided week lands exactly on the result');
const owners = ['aaa', 'bbb'];
const key = M.liveMKey(owners[0], owners[1]);
const proj = { aaa: 124.48, bbb: 118.3 };
const series = { [key]: [
  [100, 0, 0, 0.5, 124.48, 118.3],
  [105, 80.0, 90.0, 0.4, 40, 30],
  [110, 152.46, 156.36, 0.01, 0.24, 0],
] };

const open = M.wpCurve(series, proj, owners[0], owners[1], null, proj, false);
ok('while the week runs it stays a probability', open[open.length - 1].p < 1, true);
ok('and it has the loser behind', open[open.length - 1].p < 0.5, true);

const done = M.wpCurve(series, proj, owners[0], owners[1], null, proj, true);
const last = done[done.length - 1];
ok('once decided the loser is exactly 0', last.p, 0);
ok('and the point is marked as a result', last.done, true);
ok('the earlier points are untouched', done[1].p, open[1].p);
ok('the curve is the same length', done.length, open.length);

head('the winner gets exactly 1');
const flipped = { [key]: [[100, 0, 0], [110, 156.36, 152.46, 0.99, 0, 0.24]] };
const w = M.wpCurve(flipped, proj, owners[0], owners[1], null, proj, true);
ok('100%, not 99.9', w[w.length - 1].p, 1);

head('a tie is left at even, because that is what a tie is');
const tied = { [key]: [[100, 0, 0], [110, 120, 120, 0.5, 0, 0]] };
const t = M.wpCurve(tied, proj, owners[0], owners[1], null, proj, true);
ok('even', t[t.length - 1].p, 0.5);

head('a week with no readings at all still answers');
const empty = M.wpCurve({}, proj, owners[0], owners[1], null, proj, true);
ok('one opening point', empty.length, 1);
ok('and it is a number', typeof empty[0].p, 'number');

/* ── the rule, at the source ──────────────────────────────────────────────── */
head('nothing reads a remaining value as a fraction any more');
/* Comments stripped: the shim is explained at length in the prose above the
   code it replaced, so matching the raw source would match the explanation. */
const src = grab('function wpAt(a,b,projA,projB,f,mu0,lA,lB){')
  .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
ok('no 1.5 threshold survives in the code', /1\.5/.test(src), false);
ok('and the shim itself is gone', /asPts/.test(src), false);
/* left*pa stays and must: a reading that recorded NO remaining at all still
   falls back to the projection scaled by the clock, which is what every
   archived week draws on. */
ok('the no-remaining fallback is untouched', /left\s*\*\s*pa/.test(src), true);
ok('and the forecast card asks whether the week is done',
  /nflWeekDone\s*\(/.test(grab('function renderForecast(')), true);

console.log(NL + (fail ? 'FAILED  ' : 'ok  ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
