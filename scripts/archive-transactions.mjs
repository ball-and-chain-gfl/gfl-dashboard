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
 * Every waiver pickup is recorded with the next highest bid on that same player
 * in that same week. If nobody else bid, that is 0.
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

const FAILED = new Set(['FAILED','CANCELED','CANCELLED','DECLINED','REVERSED','VOID','INVALID']);

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
const merged = new Map();
(prior.transactions || []).forEach(t => merged.set(keyOf(t), t));
const priorCount = merged.size;

const dump = await get(`type=txdump&seasonId=${season}`);
if (!dump) { console.error(`${season} – txdump unreachable, nothing written`); process.exit(1); }
(dump.transactions || []).forEach(t => merged.set(keyOf(t), t));

const all = [...merged.values()];

/* Next highest bid, per pickup. Every claim on a player in a week is a bid,
 * won or lost. Sort them, drop this claim's own bid once, take what is left.
 * Nobody else in for that player means 0 — which is also what you get if ESPN
 * only ever published the winning claim. */
const bids = {};
all.forEach(t => {
  if (t.type !== 'WAIVER' && t.type !== 'FREEAGENT') return;
  if (t.bidAmount == null) return;
  const wk = t.scoringPeriodId || 0;
  (t.items || []).filter(i => i.type === 'ADD').forEach(i => {
    if (i.playerId == null) return;
    (bids[`${i.playerId}|${wk}`] ||= []).push(Number(t.bidAmount) || 0);
  });
});

const waivers = [];
all.forEach(t => {
  if (t.type !== 'WAIVER' && t.type !== 'FREEAGENT') return;
  const status = String(t.status || 'EXECUTED').toUpperCase();
  if (FAILED.has(status)) return;                       // losing claims are context, not pickups
  const wk = t.scoringPeriodId || 0;
  const bid = Math.max(Number(t.bidAmount) || 0, 0);
  (t.items || []).filter(i => i.type === 'ADD').forEach(i => {
    if (i.playerId == null) return;
    const others = (bids[`${i.playerId}|${wk}`] || []).slice().sort((a, b) => b - a);
    const own = others.indexOf(bid);
    if (own >= 0) others.splice(own, 1);                // do not out-bid yourself
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
