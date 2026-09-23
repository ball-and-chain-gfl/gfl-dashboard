/* A SHORT CANNOT COST MORE THAN IT PUT UP.
 *
 * The balance on this site is derived rather than stored — the allowance
 * earned, less what is staked and tied up — so there is nowhere in it to put a
 * position worth less than nothing. A long share cannot do that: the worst it
 * can do is become worthless. A short can, and without a bound it would.
 *
 * The bound is a cap rather than a margin call. A short settles against
 * min(price, INV_CEIL), and opening n shares at p ties up n × (CEIL − p) —
 * exactly what covering at the cap would cost. So the worst case is a number
 * known at the moment the position is opened, nothing has to watch the market
 * on the manager's behalf, and no scheduled job ever closes somebody's position
 * while they are asleep.
 *
 * These cases are about that arithmetic holding at the edges, and about the two
 * sides of the book staying apart. Being long three and short three of the same
 * team is NOT holding nothing — different cost bases, different collateral,
 * different closing prices — and netting them would quietly cancel both.
 *
 * Run: node scripts/test-short.mjs
 */
import { lifter, assemble } from './lib/lift.mjs';

const NL = String.fromCharCode(10);
let pass = 0, fail = 0;
const near = (a, b, eps = 0.005) => Math.abs(a - b) < eps;
const ok = (name, got, want, eps) => {
  const good = (typeof want === 'number' && typeof got === 'number')
    ? near(got, want, eps) : JSON.stringify(got) === JSON.stringify(want);
  if (good) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + NL + '         got  ' + JSON.stringify(got)
    + NL + '         want ' + JSON.stringify(want)); }
};
const head = t => console.log(NL + t);

const M = assemble(lifter(new URL('../public/app.js', import.meta.url)), [
  'const INV_BASE=',
  'const bucks2=',
  'function invLots(){',
  'const INV_CEIL=',
  'const invCap=',
  'const invCollat=',
  'function invWalk(lots){',
  'function invWalkProfit(w,priceOf){',
  'function invHoldings(){',
  'function invShorts(){',
  'function invCostBasis(owner){',
  'function invShortBasis(owner){',
  'function invRealised(){',
  'function invNetSpent(){',
], ['INV_CEIL', 'invCap', 'invCollat', 'invWalk', 'invWalkProfit', 'invHoldings',
    'invShorts', 'invCostBasis', 'invShortBasis', 'invRealised', 'invNetSpent',
    'setLedger', 'setPrices', 'profit'],
`
let _inv=[], _me=null, _px={};
const lsKey=()=>'x'; const gflPatchProfile=()=>{}; const invSync=()=>{};
const bkLots=()=>invLots();
const invPrice=o=>_px[o]!=null?_px[o]:INV_BASE;
const setLedger=a=>{ _inv=a; };
const setPrices=p=>{ _px=p; };
const profit=()=>invWalkProfit(invWalk(invLots()),invPrice);
`);

const T = (() => { let n = 1000; return () => ++n; })();
const buy   = (o, s, p) => ({ o, s, p, t: T(), w: 1, k: 'b'  });
const sell  = (o, s, p) => ({ o, s, p, t: T(), w: 1, k: 's'  });
const short = (o, s, p) => ({ o, s, p, t: T(), w: 1, k: 'so' });
const cover = (o, s, p) => ({ o, s, p, t: T(), w: 1, k: 'sc' });
const CEIL = M.INV_CEIL;

/* ── 1 ─────────────────────────────────────────────────────────────────── */
head('1. a short is its own position, not a negative holding');
{
  M.setLedger([short('mm', 2, 12)]);
  ok('it does not appear as shares held', M.invHoldings().mm, undefined);
  ok('it appears as a short',             M.invShorts().mm, 2);
  ok('with the price it was sold at',     M.invShortBasis('mm'), 12);
  ok('and no long cost basis',            M.invCostBasis('mm'), 0);

  /* THE CASE THAT MADE THE TWO SIDES SEPARATE. Netting these would leave
     nothing, and nothing is not what is owed: the long was bought at 9 and the
     short sold at 14, and they close against different prices. */
  M.setLedger([buy('mm', 3, 9), short('mm', 3, 14)]);
  ok('long and short of the same team do not cancel — the long', M.invHoldings().mm, 3);
  ok('                                        — and the short',  M.invShorts().mm, 3);
  ok('each keeps its own basis — long',  M.invCostBasis('mm'), 9);
  ok('                        — short',  M.invShortBasis('mm'), 14);
}

/* ── 2 ─────────────────────────────────────────────────────────────────── */
head('2. it pays when the price falls, and costs when it rises');
{
  M.setLedger([short('mm', 2, 12)]);
  M.setPrices({ mm: 8 });
  ok('down four a share is eight up',   M.profit(), 8);
  M.setPrices({ mm: 12 });
  ok('unmoved is nothing either way',   M.profit(), 0);
  M.setPrices({ mm: 15 });
  ok('up three a share is six down',    M.profit(), -6);

  /* covering banks it, and the banked figure does not move afterwards */
  M.setLedger([short('mm', 2, 12), cover('mm', 2, 8)]);
  ok('covering at 8 banks the eight',   M.invRealised(), 8);
  M.setPrices({ mm: 20 });
  ok('and the price after the cover is not this position\'s problem', M.profit(), 8);
  ok('nothing is left short',           M.invShorts().mm, undefined);
}

/* ── 3 ─────────────────────────────────────────────────────────────────── */
head('3. averaging, partial covers, and closing the rest');
{
  M.setLedger([short('x', 2, 10), short('x', 2, 14)]);
  ok('two opens average to twelve',     M.invShortBasis('x'), 12);
  ok('and it is four short',            M.invShorts().x, 4);

  M.setLedger([short('x', 2, 10), short('x', 2, 14), cover('x', 1, 9)]);
  ok('one covered at 9 banks three',    M.invRealised(), 3);
  ok('three are still short',           M.invShorts().x, 3);
  ok('at the same average',             M.invShortBasis('x'), 12);

  M.setLedger([short('x', 2, 10), short('x', 2, 14), cover('x', 1, 9), cover('x', 3, 13)]);
  ok('the rest covered at 13 gives it back', M.invRealised(), 0);
  ok('and the position is closed',      M.invShorts().x, undefined);
}

/* ── 4 ─────────────────────────────────────────────────────────────────── */
head('4. THE CAP. The loss stops, and it stops where the collateral is');
{
  const collat = M.invCollat(1, 12);
  ok('a share shorted at 12 ties up the gap to the cap', collat, CEIL - 12);

  M.setLedger([short('mm', 1, 12)]);
  M.setPrices({ mm: CEIL });
  ok('at the cap the loss is exactly the collateral', M.profit(), -(CEIL - 12));
  M.setPrices({ mm: CEIL + 40 });
  ok('and past it, still exactly the collateral',     M.profit(), -(CEIL - 12));
  M.setPrices({ mm: 9999 });
  ok('however far past it goes',                      M.profit(), -(CEIL - 12));

  M.setLedger([short('mm', 1, 12), cover('mm', 1, CEIL + 40)]);
  ok('covering above the cap banks the capped loss',  M.invRealised(), -(CEIL - 12));

  /* the floor end: a price cannot go below zero, so the most a short can make
     is everything it was sold for */
  M.setLedger([short('mm', 1, 12)]);
  M.setPrices({ mm: 0 });
  ok('the best a short can do is what it sold for',   M.profit(), 12);
}

/* ── 5 ─────────────────────────────────────────────────────────────────── */
head('5. the cash tied up, which is what the balance is built from');
{
  const spent = lots => { M.setLedger(lots); return M.invNetSpent(); };
  ok('opening ties up the worst case',     spent([short('mm', 1, 12)]), CEIL - 12);
  ok('covering flat gives all of it back', spent([short('mm', 1, 12), cover('mm', 1, 12)]), 0);
  ok('covering at a profit frees more',    spent([short('mm', 1, 12), cover('mm', 1, 8)]), -4);
  ok('covering at a loss keeps some',      spent([short('mm', 1, 12), cover('mm', 1, 20)]), 8);

  /* THE ONE THAT MATTERS. Whatever the price does, the cash this position can
     ever cost is the collateral it posted — so a balance it fitted into can
     reach zero and cannot pass it. */
  ok('covering at the cap costs the collateral and no more',
     spent([short('mm', 1, 12), cover('mm', 1, CEIL)]), CEIL - 12);
  ok('and covering far above the cap costs the same',
     spent([short('mm', 1, 12), cover('mm', 1, 500)]), CEIL - 12);

  /* many opens at many prices still net to the same rule */
  const many = [short('a', 2, 10), short('a', 1, 16), buy('b', 3, 11)];
  ok('shorts and longs tie up their own money',
     spent(many), (CEIL - 10) * 2 + (CEIL - 16) + 33);

  /* and the realised profit is the negative of what the cash did */
  M.setLedger([short('mm', 3, 12), cover('mm', 3, 7)]);
  ok('cash freed matches profit banked', -M.invNetSpent(), M.invRealised());
}

/* ── 6 ─────────────────────────────────────────────────────────────────── */
head('6. the long side is exactly what it was');
{
  M.setLedger([buy('mm', 2, 10)]);
  M.setPrices({ mm: 13 });
  ok('a holding is still a holding',   M.invHoldings().mm, 2);
  ok('its basis is still its basis',   M.invCostBasis('mm'), 10);
  ok('and it is up six',               M.profit(), 6);
  ok('it is not a short',              M.invShorts().mm, undefined);

  M.setLedger([buy('mm', 2, 10), buy('mm', 2, 14), sell('mm', 1, 15)]);
  ok('selling one of four banks three', M.invRealised(), 3);
  ok('three left',                      M.invHoldings().mm, 3);
  ok('at the same average',             M.invCostBasis('mm'), 12);
  ok('cash tied up is what was paid',   M.invNetSpent(), 20 + 28 - 15);
}

/* ── 7 ─────────────────────────────────────────────────────────────────── */
head('7. both sides of the book add up in one number');
{
  /* long one team, short another, one of each closed */
  M.setLedger([
    buy('a', 2, 10), short('b', 2, 12),
    sell('a', 1, 13), cover('b', 1, 9),
  ]);
  M.setPrices({ a: 13, b: 9 });
  ok('banked: three on the sale, three on the cover', M.invRealised(), 6);
  /* one share of a still held at 10 against 13, one of b still short from 12
     against 9 — three apiece on top */
  ok('plus both open positions marked',              M.profit(), 12);
}

/* ── 8 ─────────────────────────────────────────────────────────────────── */
head('8. rubbish in the ledger does not become money');
{
  M.setLedger([short('mm', 0, 12), short('', 2, 12), { k: 'so' }, null]);
  ok('a zero, a nameless and an empty lot are all ignored', M.invShorts(), {});
  ok('and none of them tie up cash',                        M.invNetSpent(), 0);

  /* CLOSING MORE THAN IS OPEN. Past the end of a position the running average
     is zero, so an over-cover used to realise the whole buy-back as a loss and
     an over-sell the whole sale price as a profit — money conjured out of a
     ledger that had simply run out. invDo clamps every close to the position,
     so neither is reachable through the app; a profile merged from two devices
     mid-write is how it would arrive. */
  M.setLedger([short('mm', 1, 12), cover('mm', 1, 10), cover('mm', 1, 10)]);
  ok('a second cover of a closed short banks nothing extra', M.invRealised(), 2);
  ok('and leaves nothing short',                             M.invShorts().mm, undefined);

  M.setLedger([buy('mm', 1, 10), sell('mm', 1, 14), sell('mm', 5, 14)]);
  ok('selling shares nobody holds banks nothing extra',      M.invRealised(), 4);
  ok('and cannot leave a negative holding',                  M.invHoldings().mm, undefined);

  /* a cover with no short at all behind it is simply not a trade */
  M.setLedger([cover('mm', 3, 10)]);
  ok('a cover against no position does nothing',             M.invRealised(), 0);
}

/* ── 9 ─────────────────────────────────────────────────────────────────── */
head('9. the card can show its own arithmetic');
{
  /* THE NUMBER ON THE BUTTON HAS TO BE THE ONE UNDER THE NAME, TIMES THE
     QUANTITY. A short card prints the price ($10.17), a per-share figure
     (invCollat(1, px)) and a button total (invCollat(n, px)) -- and the whole
     point of printing the middle one is that the reader can get from the first
     to the last. Shipped without it, the button read $14.83 beside a $10.17
     price and the only available reading was that the board was quoting two
     different prices for one share. It was read exactly that way. */
  const px = 10.17;
  const per = M.invCollat(1, px);
  ok('one share at 10.17 holds the gap to the cap', per, CEIL - px);
  [1, 2, 3, 0.5, 12.75].forEach(n =>
    ok('  x' + n + ' is exactly n times that', M.invCollat(n, px), per * n, 1e-9));

  /* and at the cap it is nothing, which is why opening one there is refused */
  ok('at the cap there is no worst case left to post', M.invCollat(1, CEIL), 0);
  ok('and above it, still none',                       M.invCollat(1, CEIL + 5), 0);
}

console.log(NL + pass + ' passed, ' + fail + ' failed');
process.exitCode = fail ? 1 : 0;
