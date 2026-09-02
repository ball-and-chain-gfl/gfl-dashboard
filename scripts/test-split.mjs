/* A SPLIT MUST NOT MOVE ANYBODY'S MONEY.
 *
 * When the pricing model changes, every open position is restated: shares × f
 * and price ÷ f, where f = oldPrice / newPrice. Four things have to come out
 * identical, and this suite is the proof of each:
 *
 *   cash tied up      because it is subtracted from the bucks balance, and two
 *                     managers are within $9 of broke holding $100+ of shares
 *   the balance       which follows from the cash, and which bucksBalance
 *                     clamps at zero — so an error there hides itself
 *   holding value     shares·f × newPrice = shares × oldPrice
 *   profit            realised on closed positions and unrealised on open ones
 *
 * The fixtures are the real ledgers of the two managers with no headroom.
 */
import fs from 'fs';

const SRC = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8')
  .split(String.fromCharCode(13)).join('');

function skipQuote(src, i) {
  const q = src[i]; let j = i + 1;
  while (j < src.length) {
    if (src[j] === '\\') { j += 2; continue; }
    if (src[j] === q) return j + 1;
    j++;
  }
  return j;
}
function skipTemplate(src, i) {
  let j = i + 1;
  while (j < src.length) {
    if (src[j] === '\\') { j += 2; continue; }
    if (src[j] === '`') return j + 1;
    if (src[j] === '$' && src[j + 1] === '{') {
      let d = 1; j += 2;
      while (j < src.length && d > 0) {
        const c = src[j];
        if (c === '\\') { j += 2; continue; }
        if (c === "'" || c === '"') { j = skipQuote(src, j); continue; }
        if (c === '`') { j = skipTemplate(src, j); continue; }
        if (c === '{') d++; else if (c === '}') d--;
        j++;
      }
      continue;
    }
    j++;
  }
  return j;
}
function walk(src, i) {
  let j = i, depth = 0;
  while (j < src.length) {
    const c = src[j];
    if (c === "'" || c === '"') { j = skipQuote(src, j); continue; }
    if (c === '`') { j = skipTemplate(src, j); continue; }
    if (c === '/' && src[j + 1] === '/') { const e = src.indexOf('\n', j); j = e < 0 ? src.length : e; continue; }
    if (c === '/' && src[j + 1] === '*') { const e = src.indexOf('*/', j); j = e < 0 ? src.length : e + 2; continue; }
    if (c === '(' || c === '[' || c === '{') { depth++; j++; continue; }
    if (c === ')' || c === ']' || c === '}') {
      depth--; j++;
      if (depth === 0 && (c === '}' || c === ']')) return src.slice(i, j);
      continue;
    }
    if (c === ';' && depth === 0) return src.slice(i, j + 1);
    j++;
  }
  return src.slice(i, j);
}
function grab(startsWith) {
  const i = SRC.indexOf(startsWith);
  if (i < 0) throw new Error('not found in app.js: ' + startsWith);
  return walk(SRC, i);
}

/* the real replay functions out of app.js, pointed at a fixture ledger */
const api = new Function(`
let _inv=null, _me=null, _bkScope=null;
const lsKey=()=>'x'; const gflPatchProfile=()=>{};
${grab('function invLots(){')}
${grab('function invHoldings(){')}
${grab('function invCostBasis(owner){')}
${grab('function invRealised(){')}
${grab('const bucks2=')}
const bkLots=()=>invLots();
${grab('function invNetSpent(){')}
return {
  setLedger(a){ _inv=a; },
  invHoldings, invCostBasis, invRealised, invNetSpent,
};
`)();

let pass = 0, fail = 0;
const near = (a, b, eps = 0.01) => Math.abs(a - b) < eps;
function ok(name, cond, detail) {
  console.log((cond ? '  PASS  ' : '  FAIL  ') + name);
  if (!cond) { if (detail) console.log('        ' + detail); fail++; } else pass++;
}

/* ── the split, exactly as scripts/split-shares.mjs applies it ────────────── */
const round = (v, dp) => { const m = Math.pow(10, dp); return Math.round((Number(v) || 0) * m) / m; };
const split = (lots, factor) => lots.map(l => {
  const f = factor[l.o];
  if (!f || Math.abs(f - 1) < 1e-12) return l;
  return { ...l, s: round((Number(l.s) || 0) * f, 6), p: round((Number(l.p) || 0) / f, 6) };
});

const valueOf = (lots, prices) => {
  api.setLedger(lots);
  const h = api.invHoldings();
  return Object.keys(h).reduce((a, k) => a + h[k] * (prices[k] || 0), 0);
};
const measure = (lots, prices) => {
  api.setLedger(lots);
  const h = api.invHoldings();
  return {
    cash: api.invNetSpent(),
    realised: api.invRealised(),
    value: valueOf(lots, prices),
    unrealised: Object.keys(h).reduce((a, k) =>
      a + h[k] * ((prices[k] || 0) - api.invCostBasis(k)), 0),
  };
};

/* real prices either side of the change */
const A = '{D6FFE34D-182A-42A5-BFE3-4D182A12A516}';   // moved up
const B = '{1DFEA78E-F518-47D1-88C3-E18B001B0CFE}';   // moved down
const C = 'ETF_EAST';
const OLD = { [A]: 10.66, [B]: 10.23, [C]: 9.84 };
const NEW = { [A]: 11.12, [B]: 9.86,  [C]: 10.02 };
const F = {}; Object.keys(OLD).forEach(k => F[k] = OLD[k] / NEW[k]);

const lot = (o, s, p, t, k = 'b') => ({ o, s, p, t, w: 1, k });

console.log('1. an open position — a price that went UP');
{
  const L = [lot(A, 2, 10.00, 1000)];
  const b = measure(L, OLD), a = measure(split(L, F), NEW);
  ok('cash tied up is identical', near(a.cash, b.cash), `${b.cash} -> ${a.cash}`);
  ok('holding value is identical', near(a.value, b.value), `${b.value} -> ${a.value}`);
  ok('unrealised profit is identical', near(a.unrealised, b.unrealised),
     `${b.unrealised.toFixed(4)} -> ${a.unrealised.toFixed(4)}`);
  api.setLedger(split(L, F));
  ok('the share count is what moved', Math.abs(api.invHoldings()[A] - 2) > 0.01);
}

console.log('\n2. an open position — a price that went DOWN');
{
  const L = [lot(B, 5, 10.22, 1000)];
  const b = measure(L, OLD), a = measure(split(L, F), NEW);
  ok('cash tied up is identical', near(a.cash, b.cash));
  ok('holding value is identical', near(a.value, b.value));
  ok('unrealised profit is identical', near(a.unrealised, b.unrealised));
}

console.log('\n3. a CLOSED position keeps its banked profit');
{
  /* bought at 9.00, sold at 11.00 — that $2 a share is history and is not the
     split's to touch */
  const L = [lot(A, 3, 9.00, 1000), lot(A, 3, 11.00, 2000, 's')];
  const b = measure(L, OLD), a = measure(split(L, F), NEW);
  ok('realised profit is identical', near(a.realised, b.realised),
     `${b.realised.toFixed(4)} -> ${a.realised.toFixed(4)}`);
  ok('realised is the $6 it should be', near(b.realised, 6));
  ok('nothing is still held', Object.keys(api.invHoldings()).length === 0);
  /* Cash tied up is buys minus sells, so a closed WINNER reads negative: the
     $6 profit has been released back to the balance. Not zero — that was this
     test's first guess and it was wrong about the code, not the other way
     round. mcm's real ledger reads -$41.65 for exactly this reason. */
  ok('the profit is released to the balance', near(b.cash, -6), `${b.cash}`);
  ok('and the split does not touch it', near(a.cash, b.cash), `${b.cash} -> ${a.cash}`);
}

console.log('\n4. goob — the real ledger, $6.41 of headroom');
{
  /* mixed: an ETF holding and three teams, part sold. The manager who cannot
     absorb a shift of any size. */
  const L = [
    lot(C, 5, 9.80, 1000), lot(A, 2, 10.50, 1100),
    lot(B, 4, 10.10, 1200), lot(A, 1, 10.70, 1300),
    lot(B, 1, 10.40, 1400, 's'),
  ];
  const b = measure(L, OLD), a = measure(split(L, F), NEW);
  ok('cash tied up is identical',      near(a.cash, b.cash), `${b.cash} -> ${a.cash}`);
  ok('holding value is identical',     near(a.value, b.value), `${b.value} -> ${a.value}`);
  ok('realised profit is identical',   near(a.realised, b.realised));
  ok('unrealised profit is identical', near(a.unrealised, b.unrealised));
  /* the one that actually matters: balance is allowance − cash − …, so an
     unchanged cash figure is an unchanged balance, and nobody goes under */
  ok('so the balance cannot move', near(a.cash, b.cash, 0.0001));
}

console.log('\n5. it is idempotent in the only way that counts');
{
  /* running it twice with the SAME factors would restate twice, which is why
     the script stamps a profile. Proving the stamp matters: a double apply is
     visibly wrong, so the guard is not decoration. */
  const L = [lot(A, 2, 10.00, 1000)];
  const once = split(L, F), twice = split(once, F);
  const b = measure(L, OLD), t = measure(twice, NEW);
  ok('a double apply DOES move value (hence the stamp)', !near(t.value, b.value));
}

console.log('\n6. a key with no price on one side is left alone');
{
  const D = '{UNPRICED}';
  const L = [lot(D, 4, 10.00, 1000)];
  const s = split(L, F);
  ok('untouched shares', s[0].s === 4);
  ok('untouched price',  s[0].p === 10.00);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
