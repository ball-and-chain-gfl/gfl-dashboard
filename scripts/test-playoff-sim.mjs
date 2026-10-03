/* THE PLAYOFF ODDS, WORKED OUT FROM THE SITE'S OWN WIN PERCENTAGES.
 *
 * For a while the Playoff Outlook quoted ESPN's playoffPct and the Forecast's
 * Win/Loss columns were that number pushed up or down by a fixed swing. Neither
 * was built on the games this site actually prices. poSimulate plays the rest of
 * the season out at the probabilities the Schedule prints, and these are the
 * properties it has to hold:
 *
 *   CALIBRATED   a team that needs one game it wins 70% of the time is in 70%
 *   CONSERVED    the twelve percentages add up to the six places
 *   SEEDED       the same football gives the same number, every render
 *   TIEBREAK     level on record goes to points for, which is ESPN's rule here
 *   REPLAY       Win >= Now >= Loss, and Now sits between them where it should
 *
 * Run: node scripts/test-playoff-sim.mjs
 */
import fs from 'fs';
import { lifter, assemble } from './lib/lift.mjs';

const grab = lifter(new URL('../public/app.js', import.meta.url));
const M = assemble(grab, [
  'function schedNormCdf(z){', 'function schedInvNorm(p){',
  'const PO_RUNS=', 'const PO_TEAM_SD=', 'function poRng(seed){', 'function poSimulate(list,base,games,spots,focus){',
], ['poSimulate', 'poRng', 'PO_RUNS'], 'const schedWkSd=()=>35;');

let pass = 0, fail = 0;
const ok = (name, cond, detail) => {
  console.log((cond ? '  PASS  ' : '  FAIL  ') + name);
  if (!cond) { if (detail !== undefined) console.log('        ' + detail); fail++; } else pass++;
};
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const rec = (w, l, pf) => ({ w, l, t: 0, pf });
const game = (a, b, p, w = 5) => ({ a, b, p, w, muA: 110, muB: 110 });

console.log('1. ONE GAME FOR THE LAST PLACE IS THAT GAME\'S PROBABILITY');
{
  const base = { A: rec(3, 1, 450), B: rec(3, 1, 450) };
  const r = M.poSimulate(['A', 'B'], base, [game('A', 'B', 0.7)], 1, null);
  ok('the 70% side is in about 70% of the time', near(r.made.A, 0.7, 0.02), r.made.A);
  ok('and the other side the rest', near(r.made.A + r.made.B, 1, 1e-9), r.made.A + r.made.B);
  const q = M.poSimulate(['A', 'B'], base, [game('A', 'B', 0.3)], 1, null);
  ok('and it turns over with the price', near(q.made.A, 0.3, 0.02), q.made.A);
}

console.log('\n2. LEVEL ON RECORD GOES TO POINTS FOR');
{
  /* nothing left to play, same record, A two hundred points ahead */
  const base = { A: rec(8, 6, 1600), B: rec(8, 6, 1400), C: rec(5, 9, 1700) };
  const r = M.poSimulate(['A', 'B', 'C'], base, [], 1, null);
  ok('the points leader takes the place', r.made.A === 1 && r.made.B === 0);
  ok('and points never outrank a better record', r.made.C === 0);
}

console.log('\n3. THE PLACES ADD UP, AND THE SAME FOOTBALL GIVES THE SAME NUMBER');
{
  /* twelve teams, eleven weeks, a round robin of real-looking prices */
  const T = Array.from({ length: 12 }, (_, i) => 'T' + i);
  /* everybody level at 2-1, points running the WRONG way, so only the prices
     of the games still to play can sort them */
  const base = {}; T.forEach((t, i) => { base[t] = rec(2, 1, 330 + i * 2); });
  const games = [];
  for (let w = 4; w <= 14; w++) {
    const rot = T.slice(1); const k = (w - 4) % 11;
    const order = [T[0]].concat(rot.slice(k), rot.slice(0, k));
    for (let i = 0; i < 6; i++) {
      const a = order[i], b = order[11 - i];
      /* T0 strongest down to T11 weakest */
      const p = Math.min(0.9, Math.max(0.1, 0.5 + (T.indexOf(b) - T.indexOf(a)) * 0.04));
      games.push(game(a, b, p, w));
    }
  }
  const t0 = Date.now();
  const fg = games.findIndex(g => g.a === 'T5' || g.b === 'T5');
  const r = M.poSimulate(T, base, games, 6, { owner: 'T5', game: fg });
  const ms = Date.now() - t0;
  const sum = T.reduce((s, t) => s + r.made[t], 0);
  ok('twelve percentages add up to the six places', near(sum, 6, 1e-6), sum);
  const again = M.poSimulate(T, base, games, 6, { owner: 'T5', game: fg });
  ok('run twice, the same answer to the last digit',
     JSON.stringify(again.made) === JSON.stringify(r.made) && again.focus.win === r.focus.win);
  ok('the strongest team is the likeliest to make it',
     T.every(t => r.made.T0 >= r.made[t]), JSON.stringify(r.made));
  ok('and the weakest the least', T.every(t => r.made.T11 <= r.made[t]));
  ok('six thousand seasons in well under a second', ms < 1500, ms + 'ms');
  ok('a median record for everybody', T.every(t => typeof r.med[t] === 'number'));
  ok('which never falls below what is already banked', T.every(t => r.med[t] >= base[t].w));

  console.log('\n   the replayed game');
  const g0 = games[fg], f = r.focus;
  const mineFirst = g0.a === 'T5';
  ok('the focus game is the one asked for', f && f.owner === 'T5');
  ok('winning it can never leave you worse off than now', f.win >= r.made.T5, f.win + ' vs ' + r.made.T5);
  ok('nor losing it better', f.loss <= r.made.T5, f.loss + ' vs ' + r.made.T5);
  const p = mineFirst ? g0.p : 1 - g0.p;
  const stray = games.findIndex(g => g.a !== 'T5' && g.b !== 'T5');
  ok('a game the owner is not in is refused rather than replayed',
     M.poSimulate(T, base, games, 6, { owner: 'T5', game: stray }).focus === undefined);
  ok('and Now is the two weighted by the chance of each',
     near(r.made.T5, p * f.win + (1 - p) * f.loss, 0.02),
     r.made.T5 + ' vs ' + (p * f.win + (1 - p) * f.loss).toFixed(4));
}

console.log('\n4. A GAME THAT DECIDES IT SAYS SO');
{
  /* one place, three teams; A and B meet, C is out of reach of both */
  const base = { A: rec(9, 4, 1500), B: rec(9, 4, 1400), C: rec(4, 9, 1300) };
  const r = M.poSimulate(['A', 'B', 'C'], base, [game('A', 'B', 0.55, 14)], 1, { owner: 'B', game: 0 });
  ok('win it and B is in', r.focus.win === 1, r.focus.win);
  ok('lose it and B is out', r.focus.loss === 0, r.focus.loss);
  ok('and now is the price of the game', near(r.made.B, 0.45, 0.02), r.made.B);
}

console.log('\n6. A TEAM IS WRONG ABOUT ITSELF ALL SEASON, NOT ONE WEEK AT A TIME');
{
  /* A plays eleven games, each at 65%, against opponents who can never catch
     anybody. R sits on 5.5 wins and plays nobody. One place: A is in exactly
     when A wins six or more. */
  const opp = Array.from({ length: 11 }, (_, i) => 'O' + i);
  const list = ['A', 'R'].concat(opp);
  const base = { A: rec(0, 3, 300), R: { w: 5, l: 8, t: 1, pf: 1300 } };
  opp.forEach(o => { base[o] = rec(0, 3, 250); });
  const games = opp.map((o, i) => game('A', o, 0.65, 4 + i));
  const r = M.poSimulate(list, base, games, 1, null);

  ok('every game is still won at the price printed for it',
     near(r.mean.A, 11 * 0.65, 0.12), r.mean.A.toFixed(3) + ' wins against ' + (11 * 0.65).toFixed(2));

  /* eleven independent 65% games: P(at least six) */
  const C = (n, k) => { let c = 1; for (let i = 1; i <= k; i++) c = c * (n - k + i) / i; return c; };
  let indep = 0; for (let k = 6; k <= 11; k++) indep += C(11, k) * Math.pow(0.65, k) * Math.pow(0.35, 11 - k);
  ok('but the season is wider than eleven independent coin flips',
     r.made.A < indep - 0.015, r.made.A.toFixed(3) + ' against ' + indep.toFixed(3) + ' if every week were a fresh roll');
  ok('and not by so much that the projection stops meaning anything',
     r.made.A > indep - 0.2, r.made.A.toFixed(3));
}

console.log('\n5. THE PAGE READS THE SIMULATION, NOT ESPN');
{
  const SRC = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  ok('ESPN\'s playoff fetch is gone', !SRC.includes('function espnPlayoff('));
  ok('the outlook odds come from the simulation',
     SRC.includes('let odds=sim?sim.made[o]:null;'));
  ok('the Forecast\'s Win and Loss are the replayed game',
     SRC.includes("const f=d.focus&&d.focus.owner===owner?d.focus:null;")
     && !SRC.includes('46/Math.sqrt(left)'));
  ok('the week being played is priced off its own Forecast curve',
     SRC.includes('const pts=fcCurveFor(li,tidOf(g.a),tidOf(g.b));'));
  ok('and every later week off the Schedule\'s Win%',
     /const out=\{p:schedWinProb\(A,B,g\.w\)/.test(SRC));
  ok('the pane draws the same curve it hands the simulation',
     SRC.includes('  const pts=fcCurveFor(info,aTid,bTid);'));
  ok('the outlook no longer claims ESPN\'s numbers',
     !SRC.includes("odds from ESPN") && !SRC.includes("The playoff percentages are ESPN's own"));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
