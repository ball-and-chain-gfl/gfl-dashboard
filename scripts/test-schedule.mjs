/* Does the schedule's win probability still hold together?
 *
 * Four places quote a chance to win — the Schedule table, the Forecast card's
 * headline, the week-in-review curve and the playoff simulation — and until
 * this was written they did not all come from the same model. The Forecast
 * opened on the difference of two season averages; the table used schedWinProb.
 * The same fixture read 63% above the graph and 62% in the row below it, and
 * the only reason nobody could tell which was right is that nothing checked.
 *
 * These are the properties any win-probability model in here has to have, and
 * the last group is the one that regressed: the curve must OPEN on the number
 * the table shows. As with the other suites the functions are lifted out of
 * app.js by string match rather than reimplemented, so a rename breaks this
 * loudly instead of letting the two drift apart again.
 *
 *   node scripts/test-schedule.mjs
 */
import fs from 'fs';

const SRC = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8')
  .split(String.fromCharCode(13)).join('');

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? '  -> ' + extra : '')); }
};

function grab(startsWith) {
  const i = SRC.indexOf(startsWith);
  if (i < 0) throw new Error('cannot find "' + startsWith + '" in app.js');
  let j = i, depth = 0, started = false;
  for (; j < SRC.length; j++) {
    const c = SRC[j];
    if (c === '{' || c === '[') { depth++; started = true; }
    else if (c === '}' || c === ']') { depth--; if (started && depth === 0) { j++; break; } }
    else if (c === ';' && !started && depth === 0) { j++; break; }
  }
  return SRC.slice(i, j);
}

console.log('\n1. every declaration the model needs is still there');
const NEEDED = ['const SCHED_SD=', 'function schedNormCdf(', 'const SCHED_RATING_W=',
  'const SCHED_PPG_W=', 'let _schedPowerCache=', 'function schedPower(',
  'function schedMargin(', 'function schedWinProb(', 'function schedOpenMu(',
  'const wpSd=', 'function wpAt(', 'function sbZ('];
const parts = {};
for (const n of NEEDED) {
  let got = null;
  try { got = grab(n); } catch (e) {}
  ok(n, !!got && got.length > n.length, got ? null : 'not found');
  parts[n] = got || '';
}

/* ── a made-up board ───────────────────────────────────────────────────────
   Twelve teams. ppg and rating are deliberately ANTI-correlated: the best
   career scorer holds the worst roster. That is not a contrivance, it is the
   2026 draft — the team with the highest points per game in this league came
   out of it sixth on the board — and it is the case the old weighting got
   wrong, so it is the case worth testing. */
const N = 12;
const rows = [];
for (let i = 0; i < N; i++) {
  rows.push({ owner: 'own' + i, ppg: 105 + i * 2.5, rating: 1.4 - i * 0.25 });
}
const harness = `
function sbBoardSeason(){ return '2099'; }
const _rows=${JSON.stringify(rows)};
let _boardOn=true;
/* sbBuild hands back ONE cached object and nulls it when anything underneath
   moves. schedPower keys on that object, so the stub has to behave the same
   way: same object until rebuild() is called, a new one after. */
let _book={rows:_rows};
function sbBuild(){ return _boardOn?_book:null; }
function rebuild(){ _book={rows:_rows}; }
function setBoard(on){ _boardOn=on; }
${NEEDED.map(n => parts[n]).join('\n')}
module.exports={schedPower,schedMargin,schedWinProb,schedOpenMu,wpAt,wpSd,
  SCHED_SD,SCHED_RATING_W,SCHED_PPG_W,schedNormCdf,rebuild,setBoard,rows:_rows};
`;
const mod = { exports: {} };
let built = true;
try { new Function('module', harness)(mod); }
catch (e) { built = false; console.log('  FAIL harness does not build -> ' + e.message); fail++; }

if (built) {
  const M = mod.exports;
  const pairs = [];
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) if (i !== j) pairs.push([rows[i], rows[j]]);

  console.log('\n2. the power number is a league-wide, self-scaling quantity');
  const pw = M.schedPower();
  ok('every team gets a power number', pw && Object.keys(pw).length === N,
    pw ? Object.keys(pw).length : 'null');
  const vals = Object.values(pw || {});
  const sum = vals.reduce((a, b) => a + b, 0);
  ok('the league averages out to zero', Math.abs(sum) < 1e-9, sum);
  /* both inputs are z-scores times the league's own ppg spread, so a power
     number is in POINTS and has to sit in a believable range for one */
  const big = Math.max(...vals.map(Math.abs));
  ok('power is in points, not z-scores', big > 2 && big < 30, big.toFixed(2));

  console.log('\n3. the rating leads, and by the stated amount');
  ok('declared weights sum to one', Math.abs(M.SCHED_RATING_W + M.SCHED_PPG_W - 1) < 1e-9,
    M.SCHED_RATING_W + M.SCHED_PPG_W);
  ok('the draft-aware half carries the majority', M.SCHED_RATING_W > M.SCHED_PPG_W,
    `${M.SCHED_RATING_W} vs ${M.SCHED_PPG_W}`);
  /* the team with the best ROSTER beats the team with the best CAREER, which
     is the whole point of the reweighting and was false before it */
  const bestRating = rows.reduce((a, b) => b.rating > a.rating ? b : a);
  const bestPpg = rows.reduce((a, b) => b.ppg > a.ppg ? b : a);
  ok('best rating is favoured over best career scoring',
    M.schedWinProb(bestRating, bestPpg) > 0.5,
    (M.schedWinProb(bestRating, bestPpg) * 100).toFixed(1) + '%');

  console.log('\n4. the probabilities are coherent');
  let worstSym = 0;
  pairs.forEach(([a, b]) => {
    worstSym = Math.max(worstSym, Math.abs(M.schedWinProb(a, b) + M.schedWinProb(b, a) - 1));
  });
  ok('two sides of one game add to 100%', worstSym < 1e-12, worstSym);
  let worstAnti = 0;
  pairs.forEach(([a, b]) => {
    worstAnti = Math.max(worstAnti, Math.abs(M.schedMargin(a, b) + M.schedMargin(b, a)));
  });
  ok('the margin is antisymmetric', worstAnti < 1e-12, worstAnti);
  /* schedNormCdf is Abramowitz & Stegun 26.2.17, good to about 7.5e-8 - so the
     tolerances here are the approximation's, not the model's. Anything looser
     than a millionth would hide a real disagreement; anything tighter is just
     measuring the polynomial. */
  const CDF_EPS = 1e-6;
  ok('a team is exactly even with itself',
    Math.abs(M.schedWinProb(rows[3], rows[3]) - 0.5) < CDF_EPS,
    M.schedWinProb(rows[3], rows[3]));
  ok('every probability is inside the 5-95% clamp',
    pairs.every(([a, b]) => {
      const p = M.schedWinProb(a, b); return p >= 0.05 - 1e-9 && p <= 0.95 + 1e-9;
    }));
  /* a full round robin: expected wins must total the number of games played */
  let exp = 0, games = 0;
  for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
    exp += M.schedWinProb(rows[i], rows[j]) + M.schedWinProb(rows[j], rows[i]);
    games++;
  }
  ok('expected wins total the games played', Math.abs(exp - games) < 1e-9,
    `${exp.toFixed(6)} vs ${games}`);

  console.log('\n5. THE CURVE OPENS ON THE NUMBER THE TABLE SHOWS');
  let worstOpen = 0, worstPair = '';
  pairs.forEach(([a, b]) => {
    const table = M.schedWinProb(a, b);
    const curve = M.wpAt(0, 0, a.ppg, b.ppg, 0, M.schedOpenMu(a, b));
    const d = Math.abs(table - curve);
    if (d > worstOpen) { worstOpen = d; worstPair = `${a.owner} vs ${b.owner} ${table} / ${curve}`; }
  });
  ok('forecast headline equals schedule win% for every pairing',
    worstOpen < 1e-9, `worst ${worstOpen} on ${worstPair}`);
  /* the clamp has to match at the ends too, which is why schedOpenMu clamps the
     MARGIN rather than the probability */
  const wa = { owner: 'x', ppg: 400, rating: 40 }, wb = { owner: 'y', ppg: 10, rating: -40 };
  ok('they still agree at the clamp',
    Math.abs(M.schedWinProb(wa, wb) - M.wpAt(0, 0, wa.ppg, wb.ppg, 0, M.schedOpenMu(wa, wb))) < 1e-6,
    `${M.schedWinProb(wa, wb)} / ${M.wpAt(0, 0, wa.ppg, wb.ppg, 0, M.schedOpenMu(wa, wb))}`);

  console.log('\n6. the curve still behaves once football starts');
  const mu = M.schedOpenMu(rows[0], rows[11]);
  const open = M.wpAt(0, 0, rows[0].ppg, rows[11].ppg, 0, mu);
  const half = M.wpAt(60, 40, rows[0].ppg, rows[11].ppg, 0.5, mu);
  ok('leading at the half beats the opening price', half > open,
    `${open.toFixed(3)} -> ${half.toFixed(3)}`);
  ok('a finished win is all but certain',
    M.wpAt(120, 90, rows[0].ppg, rows[11].ppg, 1, mu) > 0.99);
  ok('a finished loss is all but impossible',
    M.wpAt(90, 120, rows[0].ppg, rows[11].ppg, 1, mu) < 0.01);
  ok('no mu0 falls back to the old two-average opening',
    Math.abs(M.wpAt(0, 0, 130, 110, 0) - M.schedNormCdf(20 / M.wpSd())) < 1e-12);

  console.log('\n7. it survives a board that is not there yet');
  const boardP = M.schedWinProb(rows[0], rows[11]);
  M.setBoard(false);
  M.rebuild();
  const fb = M.schedMargin(rows[11], rows[0]);
  ok('no board still returns a usable margin', Number.isFinite(fb) && fb !== 0, fb);
  const rawP = M.schedWinProb(rows[0], rows[11]);
  ok('no board still returns a real probability',
    rawP > 0 && rawP < 1 && Number.isFinite(rawP), rawP);
  /* own0 is the best roster and the worst career scorer. The board path makes
     it a favourite; the raw fallback - 0.75 x points against 1.2 x a z-score,
     which is about six parts career to one - makes it an underdog. That
     inversion IS the bug this reweighting fixed, so it is worth pinning down
     rather than glossing: if these two ever agree, the board path has stopped
     doing anything. */
  ok('the board favours the roster where the raw fallback favours the career',
    boardP > 0.5 && rawP < 0.5,
    `board ${(boardP * 100).toFixed(1)}% vs raw ${(rawP * 100).toFixed(1)}%`);
  M.setBoard(true);
  M.rebuild();
  ok('the board comes back', M.schedPower() && Object.keys(M.schedPower()).length === N);
  ok('a board too small to score returns nothing rather than a wrong number',
    (() => {
      const keep = M.rows.splice(1);       // one team left
      M.rebuild();
      const got = M.schedPower();
      M.rows.push(...keep); M.rebuild();
      return got === null;
    })());

  console.log('\n8. the cache turns over when the board does');
  /* THIS IS THE ONE THAT CAUGHT A SHIPPED BUG.

     The first cut of schedPower keyed on footballStamp, which says what has
     been PLAYED. Ratings also move when the rosters land — a second after the
     page opens, no football involved — and sbBuild rebuilds for that. Keyed on
     the stamp, the site served the pre-roster, career-only ratings for the
     whole session. Keyed on the board, it cannot: a rebuild is the only thing
     that can change the answer, and it always does. */
  const before = M.schedPower()['own0'];
  M.rows[0].rating = -99;                  // underlying row mutated, same board object
  ok('same board, same answer (cached)', M.schedPower()['own0'] === before);
  M.rebuild();                             // rosters landed: sbBuild hands back a new board
  const after = M.schedPower()['own0'];
  ok('a rebuilt board busts the cache', after !== before, `${before} -> ${after}`);
  M.rows[0].rating = 1.4;
  M.rebuild();
  ok('and settles back when the rating does',
    Math.abs(M.schedPower()['own0'] - before) < 1e-12);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
