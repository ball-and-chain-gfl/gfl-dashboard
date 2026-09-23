/* A COIN'S PRICE IS ABOUT ONE PLAYER AND NOBODY ELSE.
 *
 * A team share is priced RELATIVE to the league — its index divided by the mean
 * of all twelve — and that is safe only because those twelve never come and go.
 * Players do. If a coin were priced against the mean of the coin list, editing
 * the list would move every other coin's price, and because the portfolio chart
 * REPLAYS old weeks through the pricer, that would rewrite history every time
 * somebody added a name. So the pricer reads the player, his position's best
 * projection, and his rank among his position. Never another coin.
 *
 * These cases hold that line, and hold the curve:
 *
 *     rel   = his projection / the best projection at his position
 *     w     = 1 - positional rank / the position's cutoff
 *     price = TOP x rel x w^p, floored at a cent
 *
 * Plus the ceiling. INV_CEIL is $25, calibrated to a team share at a $10 mean.
 * A coin cannot exceed INV_COIN_TOP by construction — rel and w are both at
 * most 1 — so that is what a short on one settles against, and a five cent coin
 * does not need twenty-five dollars of collateral to sell.
 *
 * Run: node scripts/test-coins.mjs
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
  'const INV_COINS=',
  'const INV_COIN_CUT=',
  'const INV_COIN_POS=',
  'const INV_COIN_TOP=',
  'const INV_COIN_P=',
  'const INV_COIN_FLOOR=',
  'const invCoinKey=',
  'const invCoin=',
  'function invCoinPrices(){',
  'const INV_CEIL=',
  'const invCeilOf=',
  'const invCap=',
  'const invCollat=',
], ['INV_COINS', 'INV_COIN_CUT', 'INV_COIN_TOP', 'INV_COIN_FLOOR', 'INV_CEIL',
    'invCoinKey', 'invCoin', 'invCoinPrices', 'invCeilOf', 'invCap', 'invCollat',
    'setPool'],
`
let _bkPool=null;
const setPool=p=>{ _bkPool=p; };
const pName=id=>'Player #'+id;
`);

const TOP = M.INV_COIN_TOP, CUT = M.INV_COIN_CUT, FLOOR = M.INV_COIN_FLOOR;
const K = M.invCoinKey;

/* The real list, so these cases are about the coins that actually ship. */
const COINS = M.INV_COINS;
const WR = COINS.find(c => c.t === 'COKEHEAD');   // Jalen Coker, a live one
const RB = COINS.find(c => c.t === 'TONY');       // Tony Pollard

/* A pool is just [{id,name,pos,proj}] — the shape /api/espn?type=pool returns.
   Built here so the curve can be checked against numbers chosen on purpose
   rather than against whatever ESPN happens to be projecting today. */
const filler = (pos, n, fromProj, startId) =>
  Array.from({ length: n }, (_, i) => ({ id: startId + i, name: 'F' + pos + '-' + i,
    pos, proj: fromProj - i }));

/* A pool that puts the coin at a CHOSEN rank with a CHOSEN projection. The
   pricer sorts by projection, so rank cannot be set by insertion order — the
   players above him have to really be projected above him. That is what this
   builds: rank-1 of them spaced between `top` and his own number, then a tail
   beneath. Position 3 is WR. */
const poolWith = (rank, proj, pos = 3, pid = WR.pid, top = 300) => {
  const out = [{ id: pid, name: 'The Coin', pos, proj }];
  for (let i = 0; i < rank - 1; i++)
    out.push({ id: 910000 + i, name: 'a' + i, pos, proj: top - i * ((top - proj) / rank) });
  for (let i = 0; i < 120; i++)
    out.push({ id: 920000 + i, name: 'b' + i, pos, proj: proj - 1 - i * 0.1 });
  return out;
};

/* ── 1 ─────────────────────────────────────────────────────────────────── */
head('1. the curve is TOP x rel x w');
{
  /* WR1 projects 300; put the coin at rank 10 with a projection of 150.
     rel = 0.5, w = 1 - 10/80 = 0.875  ->  22 * 0.5 * 0.875 = 9.625 */
  M.setPool(poolWith(10, 150));
  const p = M.invCoinPrices()[K(WR.pid)];
  ok('rank 10, half the top projection', p, +(TOP * 0.5 * (1 - 10 / CUT[3])).toFixed(2));

  /* same projection, worse rank -> cheaper, and only w moved */
  M.setPool(poolWith(40, 150));
  ok('same projection at rank 40 is worth less',
     M.invCoinPrices()[K(WR.pid)], +(TOP * 0.5 * (1 - 40 / CUT[3])).toFixed(2));

  /* being the best at the position is rel = 1 */
  M.setPool(poolWith(1, 300));
  ok('the best at his position', M.invCoinPrices()[K(WR.pid)],
     +(TOP * 1 * (1 - 1 / CUT[3])).toFixed(2));
  ok('and no coin can exceed the ceiling',
     M.invCoinPrices()[K(WR.pid)] <= TOP, true);
}

/* ── 2 ─────────────────────────────────────────────────────────────────── */
head('2. the cutoff, and the cent it bottoms out at');
{
  M.setPool(poolWith(CUT[3], 150));
  ok('exactly at the cutoff is a cent', M.invCoinPrices()[K(WR.pid)], FLOOR);
  M.setPool(poolWith(CUT[3] + 30, 150));
  ok('past it is still a cent', M.invCoinPrices()[K(WR.pid)], FLOOR);
  M.setPool(poolWith(CUT[3] - 1, 150));
  ok('one inside it is worth more than a cent',
     M.invCoinPrices()[K(WR.pid)] > FLOOR, true);
}

/* ── 3 ─────────────────────────────────────────────────────────────────── */
head('3. RANK IS POSITIONAL, which is the whole reason for it');
{
  /* A tight end projected for 130 against a TE1 of 260 is rel 0.5 at TE rank 2.
     A wide receiver projected for the same 130 against a WR1 of 300 is rel 0.43
     at whatever rank that buys him. Same points, different worlds -- which a
     single overall ranking could not express. */
  const te = [{ id: 111, name: 'TE1', pos: 4, proj: 260 },
              { id: RB.pid, name: 'The Coin', pos: 4, proj: 130 },
              ...filler(4, 60, 120, 800000)];
  M.setPool(te);
  ok('TE2 on half the top projection',
     M.invCoinPrices()[K(RB.pid)], +(TOP * 0.5 * (1 - 2 / CUT[4])).toFixed(2));

  /* the same player, the same projection, priced as a WR instead */
  M.setPool(poolWith(2, 130, 3, RB.pid));
  ok('the same points as a WR price differently',
     M.invCoinPrices()[K(RB.pid)], +(TOP * (130 / 300) * (1 - 2 / CUT[3])).toFixed(2));
}

/* ── 4 ─────────────────────────────────────────────────────────────────── */
head('4. NOTHING ABOUT ONE COIN DEPENDS ON ANOTHER');
{
  /* This is the property the whole design turns on. A player added BELOW him
     cannot touch his price; one added ABOVE him moves his rank, which is a fact
     about football and not about the coin list. */
  const base = poolWith(10, 150);
  M.setPool(base);
  const before = M.invCoinPrices()[K(WR.pid)];

  const below = base.concat([{ id: 700001, name: 'nobody', pos: 3, proj: 1 }]);
  M.setPool(below);
  ok('a player added beneath him changes nothing',
     M.invCoinPrices()[K(WR.pid)], before);

  /* and every OTHER coin in the shipped list is also untouched by it */
  M.setPool(base); const allBefore = M.invCoinPrices();
  M.setPool(below); const allAfter = M.invCoinPrices();
  ok('and changes nothing for any other coin either', allAfter, allBefore);

  const above = [{ id: 700002, name: 'a new star', pos: 3, proj: 299 }].concat(base);
  M.setPool(above);
  ok('a player added above him costs him a rank',
     M.invCoinPrices()[K(WR.pid)], +(TOP * 0.5 * (1 - 11 / CUT[3])).toFixed(2));
}

/* ── 5 ─────────────────────────────────────────────────────────────────── */
head('5. a coin with nobody behind it is not priced at all');
{
  M.setPool([]);
  ok('no pool, no prices', M.invCoinPrices(), {});
  M.setPool(filler(3, 50, 300, 900000));
  ok('a pool without him does not invent one', M.invCoinPrices()[K(WR.pid)], undefined);
  /* a position with no cutoff -- a kicker, say -- is not a coin we price */
  M.setPool([{ id: WR.pid, name: 'The Coin', pos: 5, proj: 140 },
             ...filler(5, 40, 150, 800000)]);
  ok('a position with no cutoff is left alone', M.invCoinPrices()[K(WR.pid)], undefined);
}

/* ── 6 ─────────────────────────────────────────────────────────────────── */
head('6. the ceiling belongs to the instrument');
{
  ok('a team settles a short at INV_CEIL', M.invCeilOf('mm'), M.INV_CEIL);
  ok('a fund does too',                    M.invCeilOf('ETF_EAST'), M.INV_CEIL);
  ok('a coin settles at its own top',      M.invCeilOf(K(WR.pid)), TOP);

  /* WHY IT HAD TO BE PER INSTRUMENT. On the flat $25 a five cent coin would
     have needed $24.95 of collateral to sell one share. */
  ok('a cheap coin ties up its own worst case',
     M.invCollat(K(WR.pid), 1, 0.05), TOP - 0.05);
  ok('and not the team ceiling',
     M.invCollat(K(WR.pid), 1, 0.05) < M.INV_CEIL - 0.05, true);

  /* and the cap still caps: a coin cannot be marked above its own top */
  ok('a coin marks at its ceiling, however high the price goes',
     M.invCap(K(WR.pid), 999), TOP);
  ok('a team marks at its own',
     M.invCap('mm', 999), M.INV_CEIL);
}

/* ── 7 ─────────────────────────────────────────────────────────────────── */
head('7. the shipped list is well formed');
{
  ok('eleven coins', COINS.length, 11);
  ok('every one has a player id', COINS.every(c => Number(c.pid) > 0), true);
  ok('no id is used twice', new Set(COINS.map(c => c.pid)).size, COINS.length);
  ok('no ticker is used twice', new Set(COINS.map(c => c.t)).size, COINS.length);
  ok('every key resolves back to its coin',
     COINS.every(c => (M.invCoin(K(c.pid)) || {}).pid === c.pid), true);
  /* a coin key cannot be mistaken for a team's (a GUID) or a fund's */
  ok('no coin key collides with a fund', COINS.every(c => !/^ETF_/.test(K(c.pid))), true);
  ok('a team key is not a coin', M.invCoin('ETF_EAST'), null);
  ok('nor is an owner slug', M.invCoin('mm'), null);
}

console.log(NL + pass + ' passed, ' + fail + ' failed');
process.exitCode = fail ? 1 : 0;
