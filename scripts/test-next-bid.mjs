/* WHAT THE NEXT-HIGHEST BID IS, AND WHAT COUNTS AS A PICKUP AT ALL.
 *
 * Three faults met on one row and produced a number wrong twice over. Florida
 * Man was shown having bought Juwan Johnson for $25 with a next-best bid of $6.
 * He never got the player, and nobody bid $6 against him.
 *
 *   1. ESPN'S STATUS IS A COMPOUND STRING. The filter was a Set and
 *      `FAILED.has(status)`, which catches "FAILED" and lets
 *      "FAILED_PLAYERALREADYDROPPED" straight through. A claim that never
 *      processed was archived as a pickup, money spent and player credited --
 *      two such rows in 2026, $26 of imaginary spending, all of it priced into
 *      Waiver ROI. PENDING leaked the same way.
 *
 *   2. THE BID POOL WAS KEYED BY WEEK. Waivers run in batches, more than once a
 *      week, so separate runs pooled together. Johnson went to one team on the
 *      2nd and was claimed again on the 10th, and the 2nd's WINNING bid was
 *      reported as the "next highest" against the 10th's claim.
 *
 *   3. YOUR OWN OTHER CLAIMS COUNTED AS RIVALS. The rule dropped a single bid
 *      equal to your own, so a manager stacking two claims on one player
 *      out-bid himself in the record.
 *
 * The rule now: another team, the same player, the same waiver run.
 *
 * The four predicates are cut out of scripts/archive-transactions.mjs rather
 * than restated here, so this cannot pass against a copy that has drifted.
 *
 * Run: node scripts/test-next-bid.mjs
 */
import fs from 'fs';
import path from 'path';

const src = fs.readFileSync(path.resolve('scripts/archive-transactions.mjs'), 'utf8');
const grab = (start, end) => {
  const i = src.indexOf(start);
  if (i < 0) throw new Error('cannot find in archive-transactions.mjs: ' + start);
  const j = src.indexOf(end, i);
  return src.slice(i, j < 0 ? src.length : j);
};
const RULES = [
  grab('const DEAD =', 'const WITHDRAWN'),
  grab('const WITHDRAWN =', 'const dayOf'),
  grab('const dayOf =', '\nconst get'),
].join('\n');

const compute = new Function('all', RULES + `
  const bids = {};
  all.forEach(t => {
    if (t.type !== 'WAIVER' && t.type !== 'FREEAGENT') return;
    if (t.bidAmount == null) return;
    if (isWithdrawn(t.status)) return;
    if (neverRan(t.status)) return;
    const day = dayOf(t);
    const team = t.teamId != null ? t.teamId : null;
    (t.items || []).filter(i => i.type === 'ADD').forEach(i => {
      if (i.playerId == null) return;
      (bids[i.playerId + '|' + day] ||= []).push({ team, bid: Number(t.bidAmount) || 0 });
    });
  });
  const out = [];
  all.forEach(t => {
    if (t.type !== 'WAIVER' && t.type !== 'FREEAGENT') return;
    if (isDead(t.status)) return;
    const day = dayOf(t), me = t.teamId != null ? t.teamId : null;
    const bid = Math.max(Number(t.bidAmount) || 0, 0);
    (t.items || []).filter(i => i.type === 'ADD').forEach(i => {
      if (i.playerId == null) return;
      const others = (bids[i.playerId + '|' + day] || [])
        .filter(b => b.team == null || me == null || String(b.team) !== String(me))
        .map(b => b.bid).filter(v => v > 0).sort((a, b) => b - a);
      out.push({ week: t.scoringPeriodId || 0, playerId: i.playerId, teamId: t.teamId,
        bid, nextBid: others.length ? others[0] : 0, contested: others.length });
    });
  });
  return out;
`);

const DAY = d => Date.parse('2026-09-' + String(d).padStart(2, '0') + 'T08:00:00Z');
const W = (id, team, pid, amt, status, day = 2, wk = 3) => ({
  id, type: 'WAIVER', teamId: team, bidAmount: amt, status,
  scoringPeriodId: wk, processDate: DAY(day),
  items: [{ type: 'ADD', playerId: pid, toTeamId: team }],
});

const cases = [
  ['contested: three teams, winner 40, next 25',
    [W(1, 1, 900, 40, 'EXECUTED'), W(2, 2, 900, 25, 'FAILED'), W(3, 3, 900, 12, 'FAILED')],
    r => r.length === 1 && r[0].bid === 40 && r[0].nextBid === 25 && r[0].contested === 2],

  ['uncontested: a single bid leaves nextBid 0',
    [W(4, 1, 901, 17, 'EXECUTED')],
    r => r.length === 1 && r[0].nextBid === 0 && r[0].contested === 0],

  /* ── 1. the compound status ──────────────────────────────────────────────── */
  ['FAILED_PLAYERALREADYDROPPED is not a pickup — the Juwan Johnson row',
    [W(5, 2, 3929645, 6, 'EXECUTED', 2), W(6, 5, 3929645, 25, 'FAILED_PLAYERALREADYDROPPED', 10)],
    r => r.length === 1 && r[0].teamId === 2 && r[0].bid === 6],

  ['and the real pickup is not charged a rival that was never there',
    [W(7, 2, 3929645, 6, 'EXECUTED', 2), W(8, 5, 3929645, 25, 'FAILED_PLAYERALREADYDROPPED', 10)],
    r => r[0].nextBid === 0 && r[0].contested === 0],

  ['every FAILED_ variant is caught, not just the bare word',
    [W(9, 1, 907, 30, 'FAILED_INVALIDPLAYERSOURCE'), W(10, 2, 907, 20, 'FAILED')],
    r => r.length === 0],

  ['a PENDING claim has not happened yet',
    [W(11, 1, 908, 14, 'PENDING')],
    r => r.length === 0],

  /* ── 2. the day, not the week ────────────────────────────────────────────── */
  ['two runs in the same week do not pool',
    [W(12, 1, 909, 30, 'EXECUTED', 2, 3), W(13, 2, 909, 99, 'EXECUTED', 9, 3)],
    r => r.length === 2 && r.every(x => x.nextBid === 0 && x.contested === 0)],

  ['the same run still pools',
    [W(14, 1, 910, 30, 'EXECUTED', 2), W(15, 2, 910, 22, 'FAILED', 2)],
    r => r.length === 1 && r[0].nextBid === 22],

  /* ── 3. your own claims are not rivals ───────────────────────────────────── */
  ['a manager stacking two claims does not out-bid himself',
    [W(16, 1, 911, 25, 'EXECUTED'), W(17, 1, 911, 6, 'FAILED')],
    r => r.length === 1 && r[0].bid === 25 && r[0].nextBid === 0 && r[0].contested === 0],

  ['but another team at the same number still counts',
    [W(18, 1, 912, 20, 'EXECUTED'), W(19, 2, 912, 20, 'FAILED')],
    r => r.length === 1 && r[0].nextBid === 20 && r[0].contested === 1],

  /* ── the rest ────────────────────────────────────────────────────────────── */
  ['a withdrawn claim never competed',
    [W(20, 1, 913, 10, 'EXECUTED'), W(21, 2, 913, 88, 'CANCELED')],
    r => r.length === 1 && r[0].nextBid === 0],

  ['a losing claim still counts as competition',
    [W(22, 1, 914, 10, 'EXECUTED'), W(23, 2, 914, 8, 'FAILED')],
    r => r.length === 1 && r[0].nextBid === 8 && r[0].contested === 1],

  ['a zero-dollar rival is not a rival',
    [W(24, 1, 915, 5, 'EXECUTED'), W(25, 2, 915, 0, 'FAILED')],
    r => r.length === 1 && r[0].nextBid === 0 && r[0].contested === 0],

  ['losing claims never become pickups',
    [W(26, 1, 916, 10, 'FAILED'), W(27, 2, 916, 9, 'CANCELED')],
    r => r.length === 0],

  /* ── 4. a bid thrown out is not a bid anybody beat ────────────────────────
     Bismuth won the Bears defence at $25 in a run that also held the
     Mulligans' $29. The $29 was FAILED_PLAYERALREADYDROPPED -- their own drop
     was already gone, so the claim was voided before price was reached and it
     never ran against the $25. It was read as the runner-up anyway, and since
     a runner-up above your own bid gets clamped down to it, the margin fell to
     the $1 floor and Waiver ROI paid out as though the thing had been won by a
     dollar. Twelve of the twenty-two FAILED rows in 2026 are the other kind
     and have to keep counting. */
  ['the real Bismuth run: the voided claim above the winner drops out',
    [W(28, 10, -16025, 29, 'FAILED_PLAYERALREADYDROPPED'),
     W(29, 4, -16025, 25, 'EXECUTED'),
     W(30, 2, -16025, 13, 'FAILED_INVALIDPLAYERSOURCE'),
     W(31, 6, -16025, 3, 'FAILED_INVALIDPLAYERSOURCE')],
    r => r.length === 1 && r[0].teamId === 4 && r[0].bid === 25
      && r[0].nextBid === 13 && r[0].contested === 2],

  ['a claim that lost on price still counts against you',
    [W(32, 1, 917, 40, 'EXECUTED'), W(33, 2, 917, 39, 'FAILED_INVALIDPLAYERSOURCE')],
    r => r.length === 1 && r[0].nextBid === 39 && r[0].contested === 1],

  ['no roster room is the same kind of thrown out',
    [W(34, 1, 918, 10, 'EXECUTED'), W(35, 2, 918, 99, 'FAILED_ROSTERLIMIT')],
    r => r.length === 1 && r[0].nextBid === 0 && r[0].contested === 0],

  ['and it drops out from under a genuine rival rather than replacing it',
    [W(36, 1, 919, 50, 'EXECUTED'),
     W(37, 2, 919, 80, 'FAILED_PLAYERALREADYDROPPED'),
     W(38, 3, 919, 30, 'FAILED_INVALIDPLAYERSOURCE')],
    r => r.length === 1 && r[0].nextBid === 30 && r[0].contested === 1],

  ['a bare FAILED is not assumed to be either one',
    [W(39, 1, 920, 20, 'EXECUTED'), W(40, 2, 920, 12, 'FAILED')],
    r => r.length === 1 && r[0].nextBid === 12 && r[0].contested === 1],
];

let pass = 0, fail = 0;
for (const [name, input, check] of cases) {
  let got, ok = false;
  try { got = compute(input); ok = check(got); } catch (e) { got = String(e.message); }
  console.log((ok ? '  PASS  ' : '  FAIL  ') + name);
  if (!ok) { console.log('        got: ' + JSON.stringify(got)); fail++; } else pass++;
}

/* ── and the archive on disk obeys it ─────────────────────────────────────── */
const arch = JSON.parse(fs.readFileSync(path.resolve('public/data/transactions-2026.json'), 'utf8'));
const wv = arch.waivers || [], tx = arch.transactions || [];
const dead = wv.filter(w => {
  const hit = tx.find(t => String(t.teamId) === String(w.teamId)
    && Math.max(Number(t.bidAmount) || 0, 0) === w.bid
    && (t.items || []).some(i => i.type === 'ADD' && String(i.playerId) === String(w.playerId)));
  return hit && /^(FAILED|CANCEL|PENDING|DECLIN|REVERS|VOID|INVALID)/
    .test(String(hit.status || '').toUpperCase());
});
const nm = 'no archived pickup came from a claim that failed';
if (dead.length) { fail++; console.log('  FAIL  ' + nm + '\n        ' + JSON.stringify(dead)); }
else { pass++; console.log('  PASS  ' + nm); }

console.log('\n' + (fail ? 'FAILED  ' : 'ok  ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
