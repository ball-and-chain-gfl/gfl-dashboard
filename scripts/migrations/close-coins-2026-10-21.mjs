/* EVERY COIN POSITION CLOSED AT THE BOARD'S PRICE (21 October 2026).
 *
 * Coins are suspended (INV_COINS_SUSPENDED) while the coin market is reworked,
 * and the league ruled that nobody keeps one in the meantime: every coin still
 * held is sold, and every coin short covered, at the price the board shows --
 * the price sealed for the last completed week in /data/charts-<season>.json,
 * which is the price this week's coin trades went through at.
 *
 * APPENDED, never edited: one sale (or cover) per open position, stamped now
 * and marked `adj`, so the merge with any device's copy keeps it and the
 * ledger still says what happened. Voided entries are skipped, the same as
 * invWalk skips them. A sale books its profit or loss against the average cost
 * exactly as a sale from the app would.
 *
 * Every touched profile's `inv` is written to a backup outside the repo first.
 *
 *   node scripts/migrations/close-coins-2026-10-21.mjs            # dry run: report only
 *   node scripts/migrations/close-coins-2026-10-21.mjs --apply    # write the closes
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
const APPLY = process.argv.includes('--apply');
const STAMP = 'coins-closed-2026-10-21';
const SEASON = '2026';
const WEEK_NOW = 7;                               // the week being played: invWeekNow()

const APP = fs.readFileSync(new URL('../../public/app.js', import.meta.url), 'utf8');
const gm = /const GFL_DB=\{([^}]*)\}/.exec(APP)[1];
const pick = k => new RegExp(k + "\\s*:\\s*['\"]([^'\"]+)").exec(gm)[1];
const DOCS = `https://firestore.googleapis.com/v1/projects/${pick('project')}/databases/(default)/documents`;
const KEY = `key=${pick('key')}`;
const COIN = Object.fromEntries([...APP.matchAll(/\{t:'([A-Z]+)',\s*name:'[^']*',\s*pid:(\d+)\}/g)].map(m => ['COIN_' + m[2], m[1]]));
const COIN_TOP = Number(/const INV_COIN_TOP=(\d+(?:\.\d+)?);/.exec(APP)[1]);
const cents = v => Math.round(v * 100) / 100;

/* the board's price: the last completed week sealed with coins in it */
const charts = await (await fetch(`https://gfl-dashboard.vercel.app/data/charts-${SEASON}.json?x=${Date.now()}`)).json();
const weeks = Object.keys(charts.weeks || {}).map(Number).sort((a, b) => a - b);
const priceWeek = weeks.filter(w => Object.keys(charts.weeks[w].prices || {}).some(k => k.startsWith('COIN_'))).pop();
const PRICE = Object.fromEntries(Object.entries(charts.weeks[priceWeek].prices).filter(([k]) => k.startsWith('COIN_')));

/* invWalk, coins only, voids skipped: what is open, and at what average */
function open(inv) {
  const L = {}, S = {};
  const slot = (m, o) => m[o] || (m[o] = { sh: 0, cost: 0 });
  inv.slice().sort((a, b) => (Number(a.t) || 0) - (Number(b.t) || 0)).forEach(l => {
    const o = l && l.o, n = Number(l && l.s) || 0, p = Number(l && l.p) || 0;
    if (!o || !n || l.void || !String(o).startsWith('COIN_')) return;
    if (l.k === 'so') { const s = slot(S, o); s.sh += n; s.cost += n * p; return; }
    if (l.k === 'sc') { const s = slot(S, o), m = Math.min(n, s.sh); if (m <= 0) return; const a = s.cost / s.sh; s.sh -= m; s.cost -= a * m; return; }
    const t = slot(L, o);
    if (l.k === 's') { const m = Math.min(n, t.sh); if (m <= 0) return; const a = t.cost / t.sh; t.sh -= m; t.cost -= a * m; }
    else { t.sh += n; t.cost += n * p; }
  });
  const out = [];
  Object.entries(L).forEach(([o, t]) => { if (t.sh > 0.0001) out.push({ o, k: 's', sh: t.sh, avg: t.cost / t.sh }); });
  Object.entries(S).forEach(([o, s]) => { if (s.sh > 0.0001) out.push({ o, k: 'sc', sh: s.sh, avg: s.cost / s.sh }); });
  return out;
}

const res = await fetch(`${DOCS}/profiles?pageSize=100&${KEY}`);
if (!res.ok) throw new Error('could not read profiles ' + res.status);
const docs = (await res.json()).documents || [];
const now = Date.now();
let tick = 0;
const backup = [], plan = [];
for (const doc of docs) {
  const id = doc.name.split('/').pop();
  const raw = (doc.fields && doc.fields.inv && doc.fields.inv.stringValue) || '';
  let inv; try { inv = JSON.parse(raw || '[]'); } catch { continue; }
  if (!Array.isArray(inv)) continue;
  const pos = open(inv);
  if (!pos.length) continue;
  const closes = pos.map(p => {
    const px = PRICE[p.o];
    if (px == null) throw new Error(`${id}: no board price for ${p.o}`);
    return { o: p.o, s: p.sh, p: px, t: now + (tick++), w: WEEK_NOW, k: p.k, adj: STAMP, _avg: p.avg };
  });
  /* the cash each close hands back, as invNetSpent counts it */
  const cash = closes.reduce((s, c) => s + (c.k === 's' ? cents(c.s * c.p)
    : cents(c.s * Math.max(0, COIN_TOP - Math.min(COIN_TOP, c.p)))), 0);
  const pnl = closes.reduce((s, c) => s + (c.k === 's' ? c.s * (c.p - c._avg) : c.s * (c._avg - Math.min(COIN_TOP, c.p))), 0);
  backup.push({ id, inv: raw });
  plan.push({ id, next: inv.concat(closes.map(({ _avg, ...c }) => c)), closes, cash, pnl });
}

console.log(`${APPLY ? 'APPLYING' : 'DRY RUN'} -- close every coin position at the week ${priceWeek} board price ('${STAMP}')\n`);
plan.forEach(p => {
  console.log(`  ${p.id.padEnd(6)} balance +$${p.cash.toFixed(2)}   profit on the sale ${p.pnl >= 0 ? '+' : '−'}$${Math.abs(p.pnl).toFixed(2)}`);
  p.closes.forEach(c => console.log(`           ${c.k === 's' ? 'sell ' : 'cover'} ${(COIN[c.o] || c.o).padEnd(9)} ${c.s.toFixed(4).padStart(12)} @ $${c.p.toFixed(2)}   (avg cost $${c._avg.toFixed(4)})`));
});
if (!plan.length) console.log('  nobody holds a coin -- nothing to close');
if (!APPLY) console.log('\n  dry run: nothing written. --apply to write.');
else if (plan.length) await apply();

/* process.exitCode, never process.exit: exiting while a fetch socket is still
   closing trips a libuv assertion on this Windows / Node build */
async function apply() {
  const dir = path.join(os.homedir(), 'Documents', 'gfl-backups');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `close-coins-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(file, JSON.stringify({ stamp: STAMP, at: new Date().toISOString(), priceWeek, prices: PRICE, profiles: backup }, null, 1));
  console.log(`\n  backup: ${file}`);
  let written = 0, failed = 0;
  for (const p of plan) {
    const r = await fetch(`${DOCS}/profiles/${encodeURIComponent(p.id)}?${KEY}&updateMask.fieldPaths=inv`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: { inv: { stringValue: JSON.stringify(p.next) } } }) });
    if (!r.ok) { console.error(`  !! ${p.id}: write failed ${r.status}`); failed++; continue; }
    const back = await (await fetch(`${DOCS}/profiles/${encodeURIComponent(p.id)}?${KEY}`)).json();
    const inv = JSON.parse(back.fields.inv.stringValue);
    const ok = inv.length === p.next.length && open(inv).length === 0;
    console.log(`  ${p.id.padEnd(6)} ${ok ? 'written, read back, no coin left' : 'READ-BACK MISMATCH'}`);
    ok ? written++ : failed++;
  }
  console.log(`\n  ${written} written, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
}
