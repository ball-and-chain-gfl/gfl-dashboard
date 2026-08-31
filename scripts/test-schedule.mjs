/* Does the Schedule tab's win probability still hold together?
 *
 * Four places quote a chance to win — the Schedule table, the Forecast card's
 * headline, the week-in-review curve and the playoff simulation — and until
 * this suite was written they did not all come from the same model. The
 * Forecast opened on the difference of two season averages; the table used
 * schedWinProb. The same fixture read 63% above the graph and 62% in the row
 * below it, and the only reason nobody could tell which was right is that
 * nothing checked.
 *
 * The model now has two paths and they matter separately:
 *
 *   ESPN   — the projected points of two lineups for THAT WEEK, which is what
 *            the Schedule tab quotes and what the phone shows. Deliberately not
 *            the sportsbook's model: the book prices a market, holds a margin
 *            and moves on money laid. Two different things.
 *   power  — the season-strength blend, used only where ESPN has published no
 *            projection for that week (a finished season, a week ESPN has not
 *            opened, a team whose roster has not come back).
 *
 * As with the other suites the functions are lifted out of app.js by string
 * match rather than reimplemented, so a rename breaks this loudly instead of
 * letting the site and the tests drift apart.
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
  'function schedPowerMargin(', 'const schedWkSd=', 'function schedCurWeek(',
  'let _schedProjCache=', 'function schedEspnProj(', 'function schedMargin(',
  'function schedZ(', 'function schedWinProb(', 'function schedOpenMu(',
  'const LINEUP_SHAPE_FALLBACK=', 'function sbSlotShape(', 'function sbBestLineup(',
  'const wpSd=', 'function wpAt(', 'function sbZ('];
const parts = {};
for (const n of NEEDED) {
  let got = null;
  try { got = grab(n); } catch (e) {}
  ok(n, !!got && got.length > n.length, got ? null : 'not found');
  parts[n] = got || '';
}

/* ── a made-up league ──────────────────────────────────────────────────────
   Twelve teams. ppg and rating are deliberately ANTI-correlated: the best
   career scorer holds the worst roster. That is not a contrivance, it is the
   2026 draft — the team with the highest points per game in this league came
   out of it seventh on the board — and it is the case the old weighting got
   wrong, so it is the case worth testing. */
const N = 12;
const rows = [], owners = {};
for (let i = 0; i < N; i++) {
  rows.push({ owner: 'own' + i, ppg: 105 + i * 2.5, rating: 1.4 - i * 0.25 });
  owners[i + 1] = 'own' + i;
}

/* Rosters ESPN would hand back: nine starters in real slots, five on the bench.
   Slot ids 0 QB, 2 RB, 4 WR, 6 TE, 23 FLEX, 16 D/ST, 17 K, 20 BENCH.
   Position ids 1 QB, 2 RB, 3 WR, 4 TE, 5 K, 16 D/ST. */
const START = [[0, 1], [2, 2], [2, 2], [4, 3], [4, 3], [6, 4], [23, 2], [16, 16], [17, 5]];
const BENCH = [[20, 2], [20, 3], [20, 3], [20, 4], [20, 1]];
function makeRoster(teamIx, opts) {
  const o = opts || {};
  const es = [];
  let pid = teamIx * 100;
  /* every team projects the same except for a per-team step, so the ESPN path
     has an unambiguous ordering to check against */
  const step = teamIx * 0.4;             // lands on nine starters, so keep it small
  START.forEach(([slot, pos], i) => {
    pid++;
    let proj = 12 + step + i;
    if (o.byeStarters && i < o.byeStarters) proj = 0;      // on a bye, ESPN projects nothing
    es.push({ pid, slot, pos, wkProj: proj });
  });
  BENCH.forEach(([slot, pos], i) => {
    pid++;
    /* a strong bench player the SET lineup ignores and the BEST lineup promotes */
    const proj = o.strongBench && i === 0 ? 40 + step : 5 + step + i;
    es.push({ pid, slot, pos, wkProj: proj });
  });
  if (o.noProj) es.forEach(e => { e.wkProj = 0; });
  return es;
}

const harness = `
function sbBoardSeason(){ return '2099'; }
const _rows=${JSON.stringify(rows)};
let _boardOn=true;
let _book={rows:_rows};
function sbBuild(){ return _boardOn?_book:null; }
function rebuild(){ _book={rows:_rows}; }
function setBoard(on){ _boardOn=on; }
const _seasonMeta={'2099':{owners:${JSON.stringify(owners)}}};   // no slots: fallback shape
let _lastWeek=null;
function ntLastWeek(){ return _lastWeek; }
function setLastWeek(w){ _lastWeek=w==null?null:{week:w}; _schedProjCache={}; }
let _rosters={};
function setRosters(wk,r){ _rosters[wk]=r; }
function dropRosters(wk){ delete _rosters[wk]; }
function sbRosters(season,wk){ return _rosters[wk]||null; }
const SB_BENCH_SLOTS=[20,21,24];
const SB_WK_SD=26;
${NEEDED.map(n => parts[n]).join('\n')}
module.exports={schedPower,schedPowerMargin,schedMargin,schedZ,schedWinProb,
  schedOpenMu,schedEspnProj,schedCurWeek,wpAt,wpSd,SCHED_SD,schedWkSd,
  SCHED_RATING_W,SCHED_PPG_W,schedNormCdf,rebuild,setBoard,setRosters,dropRosters,
  setLastWeek,rows:_rows};
`;
const mod = { exports: {} };
let built = true;
try { new Function('module', harness)(mod); }
catch (e) { built = false; console.log('  FAIL harness does not build -> ' + e.message); fail++; }

if (built) {
  const M = mod.exports;
  const pairs = [];
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) if (i !== j) pairs.push([rows[i], rows[j]]);

  /* week 3 has ESPN projections for everyone; week 9 has none at all */
  const wk3 = {}; for (let t = 1; t <= N; t++) wk3[t] = makeRoster(t, {});
  M.setRosters(3, wk3);
  M.setLastWeek(2);                          // so week 3 is "this week"

  console.log('\n2. the ESPN path is the one the Schedule tab takes');
  const pj = M.schedEspnProj(3);
  ok('a projection for every team', pj && Object.keys(pj).length === N,
    pj ? Object.keys(pj).length : 'null');
  ok('projections are believable weekly scores',
    Object.values(pj).every(v => v > 60 && v < 220), JSON.stringify(Object.values(pj).slice(0, 3)));
  ok('a stronger roster projects higher', pj['own11'] > pj['own0'],
    `${pj['own0']} vs ${pj['own11']}`);
  /* the whole point: with ESPN numbers in hand the margin IS the ESPN margin,
     not the season-strength one */
  ok('schedMargin returns the ESPN points difference',
    Math.abs(M.schedMargin(rows[11], rows[0], 3) - (pj['own11'] - pj['own0'])) < 1e-9,
    `${M.schedMargin(rows[11], rows[0], 3)} vs ${pj['own11'] - pj['own0']}`);
  ok('and it is NOT the season-strength margin',
    Math.abs(M.schedMargin(rows[11], rows[0], 3) - M.schedPowerMargin(rows[11], rows[0])) > 1,
    `espn ${M.schedMargin(rows[11], rows[0], 3).toFixed(2)} vs power ${M.schedPowerMargin(rows[11], rows[0]).toFixed(2)}`);
  ok('the ESPN path divides by the two-lineup spread',
    Math.abs(M.schedZ(rows[11], rows[0], 3) - (pj['own11'] - pj['own0']) / M.schedWkSd()) < 1e-9);
  ok('the two-lineup spread is wider than one team-strength spread',
    M.schedWkSd() > M.SCHED_SD, `${M.schedWkSd().toFixed(1)} vs ${M.SCHED_SD}`);

  console.log('\n3. whose lineup, and when');
  /* THIS is the week-six case. A future week nobody has set: three starters on
     a bye read as a 68-point team if the slots are taken literally. The best
     legal lineup on the SAME ESPN numbers is what the manager will field. */
  const wk6 = {}; for (let t = 1; t <= N; t++) wk6[t] = makeRoster(t, {});
  wk6[1] = makeRoster(1, { byeStarters: 3, strongBench: true });
  M.setRosters(6, wk6);
  M.setLastWeek(2);                          // week 6 is still in the future
  const future = M.schedEspnProj(6);
  const setSum = wk6[1].filter(e => e.slot !== 20).reduce((a, e) => a + e.wkProj, 0);
  ok('a future week uses the best legal lineup, not the slots as they sit',
    future['own0'] > setSum, `best ${future['own0'].toFixed(1)} vs set ${setSum.toFixed(1)}`);
  ok('the promoted bench player is the one ESPN projects highest',
    future['own0'] >= setSum + 30, `${(future['own0'] - setSum).toFixed(1)} points recovered`);
  /* ...and once that week is reachable, the set lineup is the answer, because
     that is what ESPN's app is showing the manager */
  M.setLastWeek(5);                          // now week 6 is this week
  const now = M.schedEspnProj(6);
  ok('the current week takes the lineup exactly as set',
    Math.abs(now['own0'] - setSum) < 1e-9, `${now['own0']} vs ${setSum}`);
  ok('a genuine bye still shows once the week is live', now['own0'] < now['own5'],
    `${now['own0'].toFixed(1)} vs ${now['own5'].toFixed(1)}`);
  M.setLastWeek(2);

  console.log('\n4. it falls back to season strength where ESPN has nothing');
  M.dropRosters(9);
  ok('no rosters for that week means no ESPN projection', M.schedEspnProj(9) === null);
  ok('the margin falls back to the power model',
    Math.abs(M.schedMargin(rows[11], rows[0], 9) - M.schedPowerMargin(rows[11], rows[0])) < 1e-9);
  ok('the fallback divides by the season spread',
    Math.abs(M.schedZ(rows[11], rows[0], 9) - M.schedPowerMargin(rows[11], rows[0]) / M.SCHED_SD) < 1e-9);
  ok('no week at all still prices', M.schedWinProb(rows[11], rows[0]) > 0
    && M.schedWinProb(rows[11], rows[0]) < 1);
  /* a week ESPN has opened but for a team whose roster is empty: that team must
     not be priced as a shutout */
  const wk10 = {}; for (let t = 1; t <= N; t++) wk10[t] = makeRoster(t, {});
  wk10[1] = makeRoster(1, { noProj: true });
  M.setRosters(10, wk10);
  const partial = M.schedEspnProj(10);
  ok('a team with no published projection is left out, not zeroed',
    partial && partial['own0'] === undefined && Object.keys(partial).length === N - 1,
    partial ? `own0=${partial['own0']} of ${Object.keys(partial).length}` : 'null');
  ok('and that fixture falls back rather than pricing a shutout',
    Math.abs(M.schedMargin(rows[0], rows[5], 10) - M.schedPowerMargin(rows[0], rows[5])) < 1e-9);

  console.log('\n5. the probabilities are coherent, on either path');
  [3, 9].forEach(wk => {
    const via = wk === 3 ? 'espn' : 'power';
    let worstSym = 0, worstAnti = 0;
    pairs.forEach(([a, b]) => {
      worstSym = Math.max(worstSym, Math.abs(M.schedWinProb(a, b, wk) + M.schedWinProb(b, a, wk) - 1));
      worstAnti = Math.max(worstAnti, Math.abs(M.schedMargin(a, b, wk) + M.schedMargin(b, a, wk)));
    });
    ok(`two sides of one game add to 100% (${via})`, worstSym < 1e-12, worstSym);
    ok(`the margin is antisymmetric (${via})`, worstAnti < 1e-12, worstAnti);
    ok(`every probability is inside the 5-95% clamp (${via})`,
      pairs.every(([a, b]) => {
        const p = M.schedWinProb(a, b, wk); return p >= 0.05 - 1e-9 && p <= 0.95 + 1e-9;
      }));
    let exp = 0, games = 0;
    for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
      exp += M.schedWinProb(rows[i], rows[j], wk) + M.schedWinProb(rows[j], rows[i], wk);
      games++;
    }
    ok(`expected wins total the games played (${via})`, Math.abs(exp - games) < 1e-9,
      `${exp.toFixed(6)} vs ${games}`);
  });
  /* schedNormCdf is Abramowitz & Stegun 26.2.17, good to about 7.5e-8 - so this
     tolerance is the approximation's, not the model's. */
  ok('a team is exactly even with itself',
    Math.abs(M.schedWinProb(rows[3], rows[3], 3) - 0.5) < 1e-6,
    M.schedWinProb(rows[3], rows[3], 3));

  console.log('\n6. THE CURVE OPENS ON THE NUMBER THE TABLE SHOWS');
  [3, 9].forEach(wk => {
    let worst = 0, where = '';
    pairs.forEach(([a, b]) => {
      const table = M.schedWinProb(a, b, wk);
      const curve = M.wpAt(0, 0, a.ppg, b.ppg, 0, M.schedOpenMu(a, b, wk));
      const d = Math.abs(table - curve);
      if (d > worst) { worst = d; where = `${a.owner} vs ${b.owner} ${table} / ${curve}`; }
    });
    /* 1e-6, not 1e-9: schedNormCdf is Abramowitz & Stegun 26.2.17 and carries
       about 7.5e-8 of its own error, which shows up wherever a pairing lands on
       the 5/95 clamp. Anything looser would hide a real disagreement. */
    ok(`forecast headline equals schedule win% for all 132 orderings (week ${wk})`,
      worst < 1e-6, `worst ${worst} on ${where}`);
  });
  /* the clamp has to match at the ends too, which is why schedOpenMu clamps the
     MARGIN rather than the probability */
  const wa = { owner: 'x', ppg: 400, rating: 40 }, wb = { owner: 'y', ppg: 10, rating: -40 };
  ok('they still agree at the clamp',
    Math.abs(M.schedWinProb(wa, wb, 9) - M.wpAt(0, 0, wa.ppg, wb.ppg, 0, M.schedOpenMu(wa, wb, 9))) < 1e-6,
    `${M.schedWinProb(wa, wb, 9)} / ${M.wpAt(0, 0, wa.ppg, wb.ppg, 0, M.schedOpenMu(wa, wb, 9))}`);

  console.log('\n7. the curve still behaves once football starts');
  const mu = M.schedOpenMu(rows[0], rows[11], 3);
  const open = M.wpAt(0, 0, rows[0].ppg, rows[11].ppg, 0, mu);
  ok('leading at the half beats the opening price',
    M.wpAt(60, 40, rows[0].ppg, rows[11].ppg, 0.5, mu) > open);
  ok('a finished win is all but certain',
    M.wpAt(120, 90, rows[0].ppg, rows[11].ppg, 1, mu) > 0.99);
  ok('a finished loss is all but impossible',
    M.wpAt(90, 120, rows[0].ppg, rows[11].ppg, 1, mu) < 0.01);
  ok('no mu0 falls back to the old two-average opening',
    Math.abs(M.wpAt(0, 0, 130, 110, 0) - M.schedNormCdf(20 / M.wpSd())) < 1e-12);

  console.log('\n8. the season-strength fallback still leads with the roster');
  ok('declared weights sum to one', Math.abs(M.SCHED_RATING_W + M.SCHED_PPG_W - 1) < 1e-9);
  ok('the draft-aware half carries the majority', M.SCHED_RATING_W > M.SCHED_PPG_W,
    `${M.SCHED_RATING_W} vs ${M.SCHED_PPG_W}`);
  const bestRating = rows.reduce((a, b) => b.rating > a.rating ? b : a);
  const bestPpg = rows.reduce((a, b) => b.ppg > a.ppg ? b : a);
  ok('best rating is favoured over best career scoring',
    M.schedWinProb(bestRating, bestPpg, 9) > 0.5,
    (M.schedWinProb(bestRating, bestPpg, 9) * 100).toFixed(1) + '%');
  const pw = M.schedPower();
  ok('the league averages out to zero',
    Math.abs(Object.values(pw).reduce((a, b) => a + b, 0)) < 1e-9);
  const big = Math.max(...Object.values(pw).map(Math.abs));
  ok('power is in points, not z-scores', big > 2 && big < 30, big.toFixed(2));

  console.log('\n9. the caches turn over when their inputs do');
  /* THIS GROUP CAUGHT A SHIPPED BUG.

     schedPower first keyed on footballStamp, which says what has been PLAYED.
     Ratings also move when the rosters land — a second after the page opens, no
     football involved — and sbBuild rebuilds for that. Keyed on the stamp, the
     site served pre-roster, career-only ratings for the whole session. Both
     caches now key on the object they read, which cannot go stale without the
     thing itself going stale. */
  const beforeP = M.schedPower()['own0'];
  M.rows[0].rating = -99;                  // row mutated, same board object
  ok('same board, same answer (cached)', M.schedPower()['own0'] === beforeP);
  M.rebuild();
  ok('a rebuilt board busts the power cache', M.schedPower()['own0'] !== beforeP);
  M.rows[0].rating = 1.4; M.rebuild();
  ok('and settles back when the rating does',
    Math.abs(M.schedPower()['own0'] - beforeP) < 1e-12);

  const beforeE = M.schedEspnProj(3)['own0'];
  wk3[1][0].wkProj = 999;                  // roster mutated, same roster object
  ok('same rosters, same answer (cached)', M.schedEspnProj(3)['own0'] === beforeE);
  const wk3b = {}; for (let t = 1; t <= N; t++) wk3b[t] = makeRoster(t, {});
  wk3b[1][0].wkProj = 999;
  M.setRosters(3, wk3b);                   // a refetch hands back a new object
  ok('a refetched roster busts the projection cache',
    M.schedEspnProj(3)['own0'] !== beforeE,
    `${beforeE} -> ${M.schedEspnProj(3)['own0']}`);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
