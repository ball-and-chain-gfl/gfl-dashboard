/* WHICH BETS THE LEAGUE BOARD IS ALLOWED TO COUNT.
 *
 * This suite used to be about Ball Knowledge, which scored a settled bet a point
 * either way. Bets no longer count toward Ball Knowledge — a wager is already
 * scored, in money, on the two boards built for it — so bkBetsFor is gone and
 * the questions it answered moved here, to the board that still has to get this
 * right.
 *
 * TWO FILTERS, AND ONLY ONE OF THEM IS REAL.
 *
 *   betsAfterReset IS. Every money screen drops bets placed before
 *   betsResetBefore — the pre-season test tickets — and a board that did not
 *   would print a different number for the same manager than their own
 *   sportsbook does.
 *
 *   `hidden` IS NOT. It means CLEARED: a manager tidying a settled bet off their
 *   own My Bets list. renderMyBets honours it because it is a list; the money
 *   deliberately does not, because clearing a bet out of a view cannot un-stake
 *   it. ldBets was filtering on it, and BFT had cleared all eight of their
 *   settled bets — so the league board showed them won 0, lost 0, staked 0, ROI
 *   blank, profit 0, against the +187.98 their own sportsbook correctly showed
 *   on those same eight.
 *
 * Run: node scripts/test-ldbets.mjs
 */
import { lifter, assemble } from './lib/lift.mjs';

const NL = String.fromCharCode(10);
const RESET = 1787846825391;           // 2026-08-27T16:07:05.391Z, the real line

const M = assemble(lifter(new URL('../public/app.js', import.meta.url)),
  ['const betsAfterReset=', 'function ldBets(ids){'],
  ['ldBets', 'betsAfterReset', 'setAll'],
`
let _betsAll=null;
let _CFG={betsResetBefore:${RESET}};
const setAll=v=>{_betsAll=v;};
`);

let pass = 0, fail = 0;
const ok = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + NL + '         got  ' + g + NL + '         want ' + w); }
};
const head = t => console.log(NL + t);

const bet = (o) => Object.assign(
  { owner: 'bft', status: 'won', ts: String(RESET + 1000), stake: 10, ret: 20, hidden: false }, o);

/* ── 1 ─────────────────────────────────────────────────────────────────── */
head('1. the reset line, which is a real filter');
{
  M.setAll([
    bet({ status: 'lost', ts: String(RESET - 1), stake: 50, ret: 0 }),   // pre-season
    bet({ status: 'lost', ts: String(RESET),     stake: 10, ret: 0 }),   // exactly on it
    bet({ status: 'won',  ts: String(RESET + 1), stake: 10, ret: 25 }),
  ]);
  const r = M.ldBets(['bft']);
  ok('the pre-season ticket is dropped', r.n, 2);
  ok('a bet placed exactly on the reset counts', M.betsAfterReset({ ts: String(RESET) }), true);
  ok('a millisecond before it does not',        M.betsAfterReset({ ts: String(RESET - 1) }), false);
  ok('and the dropped stake is not in the total', r.staked, 20);
}

/* ── 2 ─────────────────────────────────────────────────────────────────── */
head('2. CLEARED IS NOT DELETED — the bug this board shipped with');
{
  /* BFT's real shape: every settled bet cleared off their own list. */
  const eight = [
    ...Array.from({ length: 6 }, (_, i) =>
      bet({ status: 'lost', ts: String(RESET + i + 1), stake: 20, ret: 0, hidden: true })),
    ...Array.from({ length: 2 }, (_, i) =>
      bet({ status: 'won', ts: String(RESET + 100 + i), stake: 20, ret: 90, hidden: true })),
  ];
  M.setAll(eight);
  const r = M.ldBets(['bft']);
  ok('a cleared bet still counts — all eight are there', r.n, 8);
  ok('the losses are counted',  r.lost, 6);
  ok('the wins are counted',    r.won, 2);
  ok('the stake is counted',    r.staked, 160);
  ok('what came back is counted', r.back, 180);
  ok('and the profit is real rather than zero', r.net, 20);
  ok('ROI is a number, not blank', Math.round(r.roi), 13);

  /* the shape that used to come out: every one of them filtered away */
  ok('nothing about them is hidden from the board',
     [r.won, r.lost, r.staked, r.back, r.net].some(v => v !== 0), true);
}

/* ── 3 ─────────────────────────────────────────────────────────────────── */
head('3. what settles, and what merely exists');
{
  M.setAll([
    bet({ status: 'won',      stake: 10, ret: 30 }),
    bet({ status: 'lost',     stake: 10, ret: 0 }),
    bet({ status: 'cashed',   stake: 10, ret: 12 }),
    bet({ status: 'open',     stake: 10, ret: 0 }),
    bet({ status: 'void',     stake: 10, ret: 10 }),
    bet({ status: 'declined', stake: 10, ret: 0 }),
    bet({ status: 'invite',   stake: 10, ret: 0 }),
  ]);
  const r = M.ldBets(['bft']);
  ok('every ticket is on the record',   r.n, 7);
  ok('an open bet is counted as open',  r.open, 1);
  /* staked/returned come off SETTLED tickets only — an open stake is money
     still on the table, and a void one was handed back */
  ok('only settled money moves the total', r.staked, 30);
  ok('and what came back with it',         r.back, 42);
  ok('so the profit is the settled profit', r.net, 12);
  ok('a void is neither a win nor a loss', [r.won, r.lost], [1, 1]);
}

/* ── 4 ─────────────────────────────────────────────────────────────────── */
head('4. whose bets they are');
{
  M.setAll([
    bet({ owner: 'bft' }), bet({ owner: 'bft' }),
    bet({ owner: 'mm' }),
    bet({ owner: 'kunk' }),
  ]);
  ok('one owner',        M.ldBets(['bft']).n, 2);
  ok('another owner',    M.ldBets(['mm']).n, 1);
  ok('two at once',      M.ldBets(['bft', 'mm']).n, 3);
  ok('somebody with nothing on the book', M.ldBets(['wglr']).n, 0);
  ok('and they score nothing rather than null', M.ldBets(['wglr']).net, 0);
}

/* ── 5 ─────────────────────────────────────────────────────────────────── */
head('5. an empty or absent ledger');
{
  M.setAll(null);
  const r = M.ldBets(['bft']);
  ok('no ledger reads as no bets', r.n, 0);
  ok('ROI is blank rather than zero when nothing settled', r.roi, null);
  ok('and so is the hit rate', r.hit, null);
  M.setAll([]);
  ok('an empty ledger is the same', M.ldBets(['bft']).n, 0);
}

console.log(NL + pass + ' passed, ' + fail + ' failed');
process.exitCode = fail ? 1 : 0;
