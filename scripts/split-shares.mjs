/* A SHARE SPLIT, BECAUSE THE PRICING MODEL CHANGED.
 *
 * Roster strength moved from ESPN's season projection to a rest-of-season one,
 * and the roster/results blend moved from a six-game ramp to a season-long
 * slide. Both are improvements to how a price is derived. Neither is anything a
 * shareholder did, so neither should hand one a profit or a loss.
 *
 * The naive fix — shift each lot's stored price by the amount its team moved —
 * preserves profit but changes the CASH tied up in the position, and the cash
 * tied up is subtracted from a manager's balance. Two managers are within $9 of
 * broke while holding over $100 of shares; for them that shift is larger than
 * the balance it comes out of, and bucksBalance ends in Math.max(0, …) so it
 * would not even show as negative. It would read $0 with the real arithmetic
 * underwater.
 *
 * So this restates the holding instead, exactly the way a stock split does.
 * With f = oldPrice / newPrice, every lot for that team gets
 *
 *     shares × f        price ÷ f
 *
 * and because shares × price is unchanged on every single lot, the cash tied up
 * is unchanged, and therefore so is the balance. Nobody can be pushed under.
 * Meanwhile the position is worth shares·f × newPrice = shares × oldPrice, so
 * the holding's value does not move either. Realised profit on closed positions
 * survives because a buy and its sell scale by the same factor:
 *
 *     s·f × (q/f − p/f)  =  s × (q − p)
 *
 * Four invariants, all exact: cash paid, balance, holding value, and profit
 * both realised and unrealised. The only thing that changes is the share count,
 * which is what a split changes, and fractional shares are already normal here.
 *
 * REQUIRES the [owner, time, side] merge key to be live and propagated first.
 * On the old key — which included shares and price, both of which move here — a
 * device still holding pre-split lots would read them as new trades and add
 * them alongside the restated ones, doubling the position.
 *
 *   node scripts/split-shares.mjs <old.json> <new.json>          # apply
 *   DRY_RUN=1 node scripts/split-shares.mjs <old.json> <new.json>
 *
 * Both files are { season, prices: { ownerKey: price } }. Idempotent: a profile
 * already carrying this stamp is skipped, so a re-run costs nothing.
 */
import fs from 'fs';

const STAMP = 'gain3-2026-split';          // bump only for a genuinely new split
const DRY = !!process.env.DRY_RUN;

const SRC = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const dbLine = SRC.match(/const GFL_DB=\{[^}]*\}/);
if (!dbLine) { console.error('GFL_DB not found in app.js'); process.exit(1); }
const GFL_DB = new Function(`${dbLine[0]}; return GFL_DB;`)();

const [oldPath, newPath] = process.argv.slice(2);
if (!oldPath || !newPath) {
  console.error('usage: node scripts/split-shares.mjs <old.json> <new.json>');
  process.exit(1);
}
const oldP = JSON.parse(fs.readFileSync(oldPath, 'utf8')).prices || {};
const newP = JSON.parse(fs.readFileSync(newPath, 'utf8')).prices || {};

/* The factor per team. A key missing from either side gets 1 — no restatement
 * rather than a guessed one, because a wrong factor silently moves money. */
const factor = {};
Object.keys(oldP).forEach(k => {
  const a = Number(oldP[k]), b = Number(newP[k]);
  factor[k] = (a > 0 && b > 0) ? a / b : 1;
});

const BASE = `https://firestore.googleapis.com/v1/projects/${GFL_DB.project}`
  + `/databases/(default)/documents`;
const KEY = `key=${GFL_DB.key}`;

const fsIn = (doc) => {
  const out = {};
  Object.entries(doc.fields || {}).forEach(([k, v]) => {
    out[k] = v.stringValue ?? v.integerValue ?? v.doubleValue
      ?? (v.booleanValue !== undefined ? v.booleanValue : undefined);
  });
  return out;
};

const round = (v, dp) => {
  const m = Math.pow(10, dp);
  return Math.round((Number(v) || 0) * m) / m;
};

console.log(`\nsplit-shares — stamp ${STAMP}${DRY ? '  (DRY RUN, nothing will be written)' : ''}`);
const moved = Object.entries(factor).filter(([, f]) => Math.abs(f - 1) > 1e-9);
console.log(`  ${Object.keys(factor).length} priced keys, ${moved.length} actually moved`);

const listRes = await fetch(`${BASE}/profiles?${KEY}&pageSize=300`);
if (!listRes.ok) { console.error('profiles unreadable:', listRes.status); process.exit(1); }
const docs = (await listRes.json()).documents || [];

let touched = 0, skipped = 0, unchanged = 0, failed = 0;
const report = [];

for (const d of docs) {
  const id = decodeURIComponent((d.name || '').split('/').pop() || '');
  const data = fsIn(d);
  if (data.invSplit === STAMP) { skipped++; continue; }

  let lots = [];
  try { lots = JSON.parse(data.inv || '[]') || []; } catch { lots = []; }
  if (!Array.isArray(lots) || !lots.length) { unchanged++; continue; }

  /* what it was worth before, so the write can be checked rather than trusted */
  const before = (() => {
    const hold = {}; let cash = 0;
    lots.forEach(l => {
      const n = Number(l.s) || 0, px = Number(l.p) || 0;
      if (!n || !l.o) return;
      hold[l.o] = (hold[l.o] || 0) + (l.k === 's' ? -n : n);
      cash += (l.k === 's' ? -1 : 1) * n * px;
    });
    let value = 0;
    Object.keys(hold).forEach(k => { if (hold[k] > 1e-9) value += hold[k] * (Number(oldP[k]) || 0); });
    return { cash, value };
  })();

  const split = lots.map(l => {
    const f = factor[l.o];
    if (!f || Math.abs(f - 1) < 1e-12) return l;
    /* shares up by f, price down by f — their product, the cash, is untouched */
    return { ...l, s: round((Number(l.s) || 0) * f, 6), p: round((Number(l.p) || 0) / f, 6) };
  });

  const after = (() => {
    const hold = {}; let cash = 0;
    split.forEach(l => {
      const n = Number(l.s) || 0, px = Number(l.p) || 0;
      if (!n || !l.o) return;
      hold[l.o] = (hold[l.o] || 0) + (l.k === 's' ? -n : n);
      cash += (l.k === 's' ? -1 : 1) * n * px;
    });
    let value = 0;
    Object.keys(hold).forEach(k => { if (hold[k] > 1e-9) value += hold[k] * (Number(newP[k]) || 0); });
    return { cash, value };
  })();

  const dCash = Math.abs(after.cash - before.cash);
  const dValue = Math.abs(after.value - before.value);
  report.push({ id, lots: lots.length, dCash, dValue,
    cash: before.cash, value: before.value });

  /* A split that moved money is a bug, and writing it would move somebody's
     money. One cent of slack for the rounding above and no more. */
  if (dCash > 0.01 || dValue > 0.01) {
    console.error(`  !! ${id}: cash moved ${dCash.toFixed(4)}, value moved ${dValue.toFixed(4)} — NOT written`);
    failed++;
    continue;
  }
  if (DRY) { touched++; continue; }

  const body = { fields: {
    inv: { stringValue: JSON.stringify(split) },
    invSplit: { stringValue: STAMP },
  } };
  const mask = ['inv', 'invSplit'].map(f => `updateMask.fieldPaths=${f}`).join('&');
  const r = await fetch(`${BASE}/profiles/${encodeURIComponent(id)}?${KEY}&${mask}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (r.ok) touched++;
  else { console.error(`  !! ${id}: write failed ${r.status}`); failed++; }
}

console.log('');
report.forEach(r => console.log(
  `  ${r.id.padEnd(6)} ${String(r.lots).padStart(3)} lots  cash $${r.cash.toFixed(2).padStart(8)}`
  + `  value $${r.value.toFixed(2).padStart(8)}`
  + `  drift  cash ${r.dCash.toFixed(4)}  value ${r.dValue.toFixed(4)}`));
console.log(`\n  ${touched} restated, ${skipped} already stamped, ${unchanged} hold nothing, ${failed} failed`);
process.exit(failed ? 1 : 0);
