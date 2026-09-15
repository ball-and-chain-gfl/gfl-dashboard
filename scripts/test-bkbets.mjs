/* WHICH BETS A BALL KNOWLEDGE TOTAL IS ALLOWED TO COUNT.
 *
 * Florida Man read 154 on one load of the leaderboard and 153 on the next.
 * Nothing about the manager had changed between them. Two separate faults, and
 * they happened to point in opposite directions:
 *
 *   THE RACE. The bet component was gathered with one Firestore query PER
 *   OWNER, and the total was computed against whatever had come back by the
 *   time the screen drew. Land before the paint and the bets counted; land
 *   after and they did not — and the leaderboard never repainted, so which
 *   number you got was a coin toss on the network. The board also SORTS by
 *   this, so a half-read ledger put the league in the wrong order.
 *
 *   THE RESET. Every money screen in the app drops bets placed before
 *   betsResetBefore — the pre-season test tickets — and this did not. Ball
 *   Knowledge was scoring two settled bets nothing else will admit exists. One
 *   of them was a loss of Florida Man's from 18 August, and it was the entire
 *   difference between his two numbers.
 *
 * Both now go through one list: the season ledger betLeague already fetches
 * and caches for the money boards, filtered by owner and by the reset.
 *
 * Run: node scripts/test-bkbets.mjs
 */
import { lifter, assemble } from './lib/lift.mjs';

const grab = lifter(new URL('../public/app.js', import.meta.url));

const PRELUDE = [
  'let _betsAll=null;',
  'let _CFG={betsResetBefore:1787846825391};',   // 2026-08-27T16:07:05.391Z, the real one
  'let _cached=null;',
  'const betsAllCached=()=>_cached;',
  'const setAll=v=>{_betsAll=v;};',
  'const setCached=v=>{_cached=v;};',
].join(String.fromCharCode(10));

const M = assemble(grab,
  ['const betsAfterReset=', 'function bkBetsFor(owners){'],
  ['bkBetsFor', 'betsAfterReset', 'setAll', 'setCached'], PRELUDE);

let pass = 0, fail = 0;
const ok = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; return; }
  fail++;
  console.log('  FAIL  ' + name + '\n          got  ' + g + '\n          want ' + w);
};
const head = t => console.log('\n' + t);

const RESET = 1787846825391;
const bet = (owner, status, ts) => ({ owner, status, ts: String(ts), id: owner + ':' + ts });

/* Florida Man's three settled tickets, as they actually stand */
const FMAN = [
  bet('fman', 'lost', 1787108890053),   // 18 Aug — BEFORE the reset
  bet('fman', 'lost', 1788206759613),   // after
  bet('fman', 'won',  1788965073430),   // after
];
const score = rows => (rows || []).reduce((s, b) =>
  s + (b.status === 'won' ? 1 : b.status === 'lost' ? -1 : 0), 0);

head('not loaded is not the same as none');
M.setAll(null); M.setCached(null);
ok('no ledger yet answers null, so the caller can hold the number back',
  M.bkBetsFor(['fman']), null);
M.setAll([]);
ok('an empty ledger answers an empty list, which is a real answer',
  M.bkBetsFor(['fman']), []);

head('the reset is honoured, the way every money screen honours it');
M.setAll(FMAN);
const got = M.bkBetsFor(['fman']);
ok('the pre-season ticket is dropped', got.length, 2);
ok('and it is the August one that went', got.map(b => b.ts).sort(),
  ['1788206759613', '1788965073430']);
ok('Florida Man nets zero from bets, not minus one', score(got), 0);
ok('which is the whole of 154 against 153',
  150 + 2 + 2 + score(got), 154);

head('counting every settled ticket was the bug');
ok('unfiltered, the same three net minus one', score(FMAN), -1);
ok('and betsAfterReset is what separates them',
  FMAN.map(b => M.betsAfterReset(b)), [false, true, true]);
ok('a bet placed exactly on the reset counts',
  M.betsAfterReset(bet('x', 'won', RESET)), true);
ok('a millisecond before it does not',
  M.betsAfterReset(bet('x', 'won', RESET - 1)), false);

head('only the owners asked for');
M.setAll([...FMAN, bet('bft', 'won', 1788965073430), bet('bi', 'lost', 1788965073430)]);
ok('one owner', M.bkBetsFor(['fman']).map(b => b.owner), ['fman', 'fman']);
ok('another owner', M.bkBetsFor(['bft']).map(b => b.owner), ['bft']);
ok('two at once', M.bkBetsFor(['bft', 'bi']).length, 2);
ok('an owner with nothing on the book', M.bkBetsFor(['wglr']), []);

head('the same question gets the same answer, every time');
/* the whole point: this used to depend on which queries had landed */
const runs = [1, 2, 3, 4, 5].map(() => score(M.bkBetsFor(['fman'])));
ok('five reads, one number', runs, [0, 0, 0, 0, 0]);
M.setAll(null); M.setCached(FMAN);
ok('and the cached ledger answers the same as the live one',
  score(M.bkBetsFor(['fman'])), 0);

head('open, void and declined tickets are not results');
M.setAll([bet('fman', 'open', 1788965073430), bet('fman', 'void', 1788965073430),
          bet('fman', 'declined', 1788965073430), bet('fman', 'won', 1788965073430)]);
ok('only the settled one moves the number', score(M.bkBetsFor(['fman'])), 1);

/* ── the rule, at the source ─────────────────────────────────────────────── */
head('nothing queries per owner any more');
const src = grab('function bkBetsFor(owners){');
ok('it reads the season ledger', /_betsAll\|\|betsAllCached\(\)/.test(src), true);
ok('it filters on the reset', /betsAfterReset\(b\)/.test(src), true);
ok('and it answers null rather than guessing', /if\(!all\) return null;/.test(src), true);

console.log('\n' + (fail ? 'FAILED  ' : 'ok  ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
