/* Archive the live season's transactions before ESPN drops them.
 *
 * ESPN only serves the detailed transaction log while a season is ACTIVE. Once
 * it ends, mTransactions2 comes back with no `transactions` key at all and the
 * activity feed 404s — which is why 2022-2025 waiver history is gone for good.
 * This has to run DURING the season. Weekly is plenty; more often is harmless.
 *
 * It never discards anything: existing archived rows are merged with whatever
 * ESPN returns today, keyed by transaction id, so a row captured in week 3
 * survives even after ESPN stops serving it.
 *
 * Every waiver pickup is recorded with the next highest bid ANOTHER TEAM made
 * on that same player in the same waiver run — same player, same day, someone
 * else's money. If nobody else was in for him, that is 0.
 *
 *   node scripts/archive-transactions.mjs            # current season
 *   node scripts/archive-transactions.mjs 2026       # a specific one
 */
import fs from 'fs';
import path from 'path';

const BASE = process.env.GFL_BASE || 'https://gfl-dashboard.vercel.app/api/espn';
const OUT  = path.resolve('public/data');

const nflSeasonYear = () => {
  const d = new Date();
  return d.getUTCMonth() >= 2 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
};
const season = String(process.argv[2] || nflSeasonYear());

/* ESPN'S STATUS IS A COMPOUND STRING, AND AN EXACT MATCH MISSES MOST OF THEM.
   This was a Set and `FAILED.has(status)`, which catches "FAILED" and lets
   "FAILED_PLAYERALREADYDROPPED" straight through -- so a claim that never
   processed was archived as a pickup, with the money spent and the player
   credited. Florida Man was shown having bought Juwan Johnson for $25 on a
   claim that failed because the player was already gone. Two such rows in 2026
   alone, $26 of spending that never happened, and Waiver ROI was priced off
   both. PENDING is excluded for the same reason: it has not happened yet. */
const DEAD = /^(FAILED|CANCEL|DECLIN|REVERS|VOID|INVALID|PENDING)/;
const isDead = s => DEAD.test(String(s || '').toUpperCase());
/* A WITHDRAWN claim never competed for anybody. A claim that was submitted and
   LOST did -- that is exactly what a next-highest bid is -- so the two are
   separated: cancelled bids leave the pool, failed ones stay in it. */
const WITHDRAWN = /^(CANCEL|VOID|INVALID)/;
const isWithdrawn = s => WITHDRAWN.test(String(s || '').toUpperCase());
/* ── A BID THROWN OUT IS NOT A BID ANYBODY BEAT ──────────────────────────────
   FAILED is not one thing. A claim marked FAILED_INVALIDPLAYERSOURCE lost on
   PRICE: the run processes in bid order, somebody above it took the player,
   and the source stopped being valid underneath it. Across 2026 not one of
   the twenty-two of those ever sat above the claim that won, which is what
   losing looks like, and it belongs in the pool.

   FAILED_PLAYERALREADYDROPPED and FAILED_ROSTERLIMIT are the claimant's OWN
   move being invalid -- the spot was already spoken for -- and the claim is
   thrown out before price is ever reached. Bismuth won the Bears defence at
   $25 in a run that also held the Mulligans' $29. That $29 was never pitted
   against it. It was still read as the runner-up, the margin collapsed to
   the $1 floor, and Waiver ROI paid Bismuth as though they had squeaked it
   by a dollar rather than won by twelve.

   A list of what NEVER RAN rather than a list of what did, so a status
   nobody has seen yet still counts, the way every status does today, and
   test-waiver-rules is what fails the moment one of them outbids a winner.

   Mirrored in the C3 block of public/app.js, which scores Waiver ROI off the
   same feed rather than off this file. */
const NEVER_RAN = /^FAILED_(PLAYERALREADYDROPPED|ROSTERLIMIT)/;
const neverRan = s => NEVER_RAN.test(String(s || '').toUpperCase());
/* The day a claim processed. Waivers run in batches -- 4am ET, which is 08:00
   UTC -- so a UTC date is one run. Keying the bid pool by WEEK instead pooled
   eight days of separate runs together: Juwan Johnson went to one team on the
   2nd and was claimed again by another on the 10th, and the archive reported
   the 2nd's winning bid as the "next highest" against the 10th's. */
const dayOf = t => {
  const ms = t.processDate || t.proposedDate || 0;
  return ms ? new Date(ms).toISOString().slice(0, 10) : 'na';
};

const get = async (q) => {
  for (let a = 0; a < 3; a++) {
    try {
      const r = await fetch(`${BASE}?${q}`);
      if (r.ok) return await r.json();
      if (r.status >= 500) { await new Promise(s => setTimeout(s, 1500)); continue; }
      return null;
    } catch { await new Promise(s => setTimeout(s, 1500)); }
  }
  return null;
};

/* a stable identity for a transaction, so re-runs merge instead of duplicating */
const keyOf = (t) => t.id != null ? `id:${t.id}`
  : `syn:${t.type}|${t.teamId}|${t.scoringPeriodId}|${t.proposedDate || t.processDate || ''}|` +
    (t.items || []).map(i => `${i.type}:${i.playerId}`).sort().join(',');

const file = path.join(OUT, `transactions-${season}.json`);
const prior = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
/* ── A BID THAT HAS NOT RUN YET DOES NOT SHIP ────────────────────────────────
   api/espn.js stopped serving pending claims live, but this writes a SECOND
   copy of the same feed into public/data, and that file is fetched by anybody
   who asks. The Sunday run put twelve of them back: team 10's week 2 claims,
   each carrying bidAmount and the playerId it was for, sitting in a file on
   the public site three days before waivers ran.

   DEAD below is a different question -- it decides what COUNTS, so a claim
   that never happened cannot be priced as spending. This decides what is
   WRITTEN DOWN, and a sealed bid has no business being written down at all.

   Applied to the prior file as well as the fresh dump, so a run does not just
   stop adding them, it takes out the ones an earlier run left behind. They
   come back on their own once they settle, with a status that is not PENDING
   and a result everybody is entitled to see. */
const isSealedBid = t => String(t.type || '').toUpperCase() === 'WAIVER'
  && /^PENDING/.test(String(t.status || '').toUpperCase());

const merged = new Map();
(prior.transactions || []).forEach(t => { if (!isSealedBid(t)) merged.set(keyOf(t), t); });
const priorCount = merged.size;

const dump = await get(`type=txdump&seasonId=${season}`);
if (!dump) { console.error(`${season} – txdump unreachable, nothing written`); process.exit(1); }
(dump.transactions || []).forEach(t => { if (!isSealedBid(t)) merged.set(keyOf(t), t); });

const all = [...merged.values()];

/* Next highest bid, per pickup. Every claim on a player in a week is a bid,
 * won or lost. Sort them, drop this claim's own bid once, take what is left.
 * Nobody else in for that player means 0 — which is also what you get if ESPN
 * only ever published the winning claim. */
const bids = {};
all.forEach(t => {
  if (t.type !== 'WAIVER' && t.type !== 'FREEAGENT') return;
  if (t.bidAmount == null) return;
  if (isWithdrawn(t.status)) return;                    // pulled before it ran
  if (neverRan(t.status)) return;                       // thrown out before price
  const day = dayOf(t);
  const team = t.teamId != null ? t.teamId : null;
  (t.items || []).filter(i => i.type === 'ADD').forEach(i => {
    if (i.playerId == null) return;
    (bids[`${i.playerId}|${day}`] ||= []).push({ team, bid: Number(t.bidAmount) || 0 });
  });
});

const waivers = [];
all.forEach(t => {
  if (t.type !== 'WAIVER' && t.type !== 'FREEAGENT') return;
  if (isDead(t.status)) return;                          // losing claims are context, not pickups
  const wk = t.scoringPeriodId || 0;
  const day = dayOf(t);
  const me = t.teamId != null ? t.teamId : null;
  const bid = Math.max(Number(t.bidAmount) || 0, 0);
  (t.items || []).filter(i => i.type === 'ADD').forEach(i => {
    if (i.playerId == null) return;
    /* OTHER TEAMS ONLY. Dropping a single bid equal to your own was the old
       rule, and it left your OTHER claims on the same player in the pool as if
       somebody else had made them -- a manager stacking two claims out-bid
       himself in the record. Whose bid it is settles it, not what it was worth. */
    const others = (bids[`${i.playerId}|${day}`] || [])
      .filter(b => b.team == null || me == null || String(b.team) !== String(me))
      .map(b => b.bid)
      .filter(v => v > 0)
      .sort((a, b) => b - a);
    waivers.push({
      week: wk,
      playerId: i.playerId,
      teamId: t.teamId != null ? t.teamId : i.toTeamId,
      bid,
      nextBid: others.length ? others[0] : 0,
      contested: others.length,
      type: t.type,
      date: t.processDate || t.proposedDate || null,
    });
  });
});
waivers.sort((a, b) => a.week - b.week || b.bid - a.bid);

const withBids = all.filter(t => t.bidAmount != null).length;
const contested = waivers.filter(w => w.contested > 0).length;

fs.writeFileSync(file, JSON.stringify({
  season,
  savedAt: new Date().toISOString(),
  sources: dump.sources || [],
  counts: { transactions: all.length, waivers: waivers.length, withBidAmount: withBids, contested },
  waivers,
  transactions: all,
}));

console.log(`${season} – transactions-${season}.json`);
console.log(`  archived rows : ${priorCount} -> ${all.length} (+${all.length - priorCount})`);
console.log(`  with a bid    : ${withBids}`);
console.log(`  waiver pickups: ${waivers.length}, of which contested: ${contested}`);
(dump.sources || []).forEach(s =>
  console.log(`  source ${String(s.name).padEnd(15)} status=${s.status} tx=${s.count}${s.topics != null ? ` topics=${s.topics}` : ''}`));
if (all.length === 0) console.log('  (nothing yet — expected before the season starts)');
