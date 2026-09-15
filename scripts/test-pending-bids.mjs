/* AN UNPROCESSED WAIVER CLAIM DOES NOT LEAVE THE PROXY.
 *
 * The dashboard holds ONE ESPN session for the whole league — the cookies in
 * Vercel belong to a single member. Every manager's browser therefore receives
 * whatever ESPN would show that one account, and ESPN shows an account its own
 * pending waiver claims, bid amounts and all.
 *
 * So twelve browsers were being handed one manager's live bids. A notification
 * card read them straight off the wire and announced a $123 claim on Jalen
 * Coker to the eleven people bidding against it, a day before it processed.
 * Removing the card stopped the announcement; it did not stop the data, which
 * still reached every browser and which the archiver writes from this same
 * route into a PUBLIC repository.
 *
 * A blind bid is the one thing in this league meant to stay blind until it
 * settles, so it is dropped at the edge.
 *
 * NOTHING DOWNSTREAM LOSES ANYTHING, and that is what most of this file is for.
 * Both waiver rules — app-side TX_DEAD and the archiver's DEAD — already list
 * PENDING as dead, so a pending claim has never counted toward a pickup, a
 * spend or a next-highest-bid margin. Those margins come from EXECUTED rows,
 * which ESPN publishes league-wide once a claim has run, and from FAILED ones,
 * which are losing bids that have already lost. Both must survive.
 *
 * Run: node scripts/test-pending-bids.mjs
 */
import fs from 'fs';

const SRC = fs.readFileSync(new URL('../api/espn.js', import.meta.url), 'utf8');
const APP = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const ARC = fs.readFileSync(new URL('./archive-transactions.mjs', import.meta.url), 'utf8');

let pass = 0, fail = 0;
const ok = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; return; }
  fail++;
  console.log('  FAIL  ' + name + '\n          got  ' + g + '\n          want ' + w);
};
const head = t => console.log('\n' + t);

/* lift the filter and the parser it lives in, rather than restating them */
function grab(startsWith) {
  const i = SRC.indexOf(startsWith);
  if (i < 0) throw new Error('cannot find "' + startsWith + '" in api/espn.js');
  let j = i, depth = 0, started = false;
  for (; j < SRC.length; j++) {
    const c = SRC[j];
    if (c === '{') { depth++; started = true; }
    else if (c === '}') { depth--; if (started && depth === 0) { j++; break; } }
    else if (c === ';' && !started && depth === 0) { j++; break; }
  }
  return SRC.slice(i, j);
}
const parse = new Function(
  grab('const txKeep =') + ';' + grab('function nativeParse(d){')
  + 'return nativeParse;')();

const wv = (status, bid, id) => ({ id: id || ('w' + status + bid), type: 'WAIVER', status,
  bidAmount: bid, teamId: 10, items: [{ playerId: 1, type: 'ADD', toTeamId: 10 }] });

head('a claim still waiting to run never leaves');
let out = parse({ transactions: [wv('PENDING', 123)] });
ok('one pending waiver, nothing returned', out.length, 0);
out = parse({ transactions: [wv('PENDING', 123), wv('PENDING', 3), wv('PENDING', 16), wv('PENDING', 3)] });
ok('the four real ones, all dropped', out.length, 0);
ok('and no bid amount escapes with them',
  JSON.stringify(out).includes('123'), false);

head('everything the waiver maths needs still does');
out = parse({ transactions: [wv('EXECUTED', 25)] });
ok('an executed claim survives', out.length, 1);
ok('carrying its bid', out[0].bidAmount, 25);
out = parse({ transactions: [wv('FAILED_PLAYERALREADYDROPPED', 6)] });
ok('a failed claim survives — it is a losing bid, and that is the margin',
  [out.length, out[0] && out[0].bidAmount], [1, 6]);
out = parse({ transactions: [wv('CANCELED', 0)] });
ok('a withdrawn claim survives', out.length, 1);

head('a mixed log keeps exactly the settled half');
out = parse({ transactions: [
  wv('PENDING', 123, 'a'), wv('EXECUTED', 25, 'b'),
  wv('PENDING', 3, 'c'), wv('FAILED_PLAYERALREADYDROPPED', 6, 'd'),
  wv('CANCELED', 0, 'e'), wv('PENDING', 16, 'f'),
] });
ok('three of six', out.map(t => t.id).sort(), ['b', 'd', 'e']);

head('nothing else is touched');
out = parse({ transactions: [{ id: 'fa', type: 'FREEAGENT', status: 'EXECUTED',
  items: [{ playerId: 2, type: 'ADD', toTeamId: 3 }] }] });
ok('free agent adds are not waiver claims and pass through', out.length, 1);
/* a pending TRADE_PROPOSAL was already dropped before this change — proposals
   are not player movement — so the new line must not be what is doing it */
out = parse({ transactions: [{ id: 'tp', type: 'TRADE_PROPOSAL', status: 'PENDING', items: [] }] });
ok('a trade proposal is still dropped, for the reason it always was', out.length, 0);
out = parse({ transactions: [{ id: 'ta', type: 'TRADE_ACCEPT', status: 'EXECUTED',
  items: [{ playerId: 9, type: 'TRADE', toTeamId: 4 }] }] });
ok('an accepted trade still comes through', out.length, 1);

head('the rule this is safe because of');
/* if either of these ever stops calling PENDING dead, dropping the rows here
   would start changing a number instead of only hiding one */
ok('the app counts PENDING as dead', /const TX_DEAD=\/\^\(FAILED\|CANCEL\|DECLIN\|REVERS\|VOID\|INVALID\|PENDING\)/.test(APP), true);
ok('so does the archiver', /const DEAD = \/\^\(FAILED\|CANCEL\|DECLIN\|REVERS\|VOID\|INVALID\|PENDING\)/.test(ARC), true);

head('and none is left in the archive that ships');
const arc = JSON.parse(fs.readFileSync(new URL('../public/data/transactions-2026.json', import.meta.url), 'utf8'));
const stillPending = (arc.transactions || []).filter(t =>
  String(t.type || '').toUpperCase() === 'WAIVER'
  && /^PENDING/.test(String(t.status || '').toUpperCase()));
ok('no pending waiver claim in the committed file', stillPending.length, 0);

console.log('\n' + (fail ? 'FAILED  ' : 'ok  ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
