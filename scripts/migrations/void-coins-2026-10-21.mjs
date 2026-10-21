/* MARV COIN UNDONE, AND EVERY COIN TRADE OF WEEK 7 WITH IT (21 October 2026).
 *
 * MARV fell to the $0.01 floor when Marvin Harrison Jr. dropped out of the WR
 * rankings, 78,000 shares were bought there, and he climbed back to WR68: the
 * coin went to 98 cents and the market with it. The league ruled:
 *
 *   - every MARV entry, every team, every week, is VOIDED -- as if MARV had
 *     never traded: what was paid comes back, what was banked goes
 *   - every coin trade made this week (week 7) is voided too, so money MARV put
 *     in a balance and was spent on another coin comes back out with it
 *   - coins are suspended (INV_COINS_SUSPENDED in app.js)
 *
 * Voided, not deleted. An entry deleted from a profile would be merged straight
 * back by any device still holding it (invSync takes the union); an entry
 * marked `void` is kept by the merge and read by nothing (invWalk, invNetSpent,
 * the profit chart and the feed all skip it).
 *
 * Every touched profile's `inv` is written to a backup outside the repo before
 * anything changes. Only the `inv` field is read back out or written.
 *
 *   node scripts/migrations/void-coins-2026-10-21.mjs            # dry run: report only
 *   node scripts/migrations/void-coins-2026-10-21.mjs --apply    # write the voids
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
const APPLY = process.argv.includes('--apply');
const STAMP = 'coins-2026-10-21';
const MARV = 'COIN_4432708';
const WEEK = 7;

const APP = fs.readFileSync(new URL('../../public/app.js', import.meta.url), 'utf8');
const gm = /const GFL_DB=\{([^}]*)\}/.exec(APP)[1];
const pick = k => new RegExp(k + "\\s*:\\s*['\"]([^'\"]+)").exec(gm)[1];
const DOCS = `https://firestore.googleapis.com/v1/projects/${pick('project')}/databases/(default)/documents`;
const KEY = `key=${pick('key')}`;
const COIN = Object.fromEntries([...APP.matchAll(/\{t:'([A-Z]+)',\s*name:'[^']*',\s*pid:(\d+)\}/g)].map(m => ['COIN_' + m[2], m[1]]));

const shouldVoid = l => !!l && !l.void && (l.o === MARV || (String(l.o).startsWith('COIN_') && Number(l.w) === WEEK));
/* the cash a lot moves, as invNetSpent counts it, to the cent per lot */
const cents = v => Math.round(v * 100) / 100;
const cashOf = l => { const v = cents((Number(l.s) || 0) * (Number(l.p) || 0)); return l.k === 's' ? -v : l.k === 'b' ? v : 0; };

const res = await fetch(`${DOCS}/profiles?pageSize=100&${KEY}`);
if (!res.ok) throw new Error('could not read profiles ' + res.status);
const docs = (await res.json()).documents || [];
const backup = [], plan = [];
for (const doc of docs) {
  const id = doc.name.split('/').pop();
  const raw = (doc.fields && doc.fields.inv && doc.fields.inv.stringValue) || '';
  let inv; try { inv = JSON.parse(raw || '[]'); } catch { continue; }
  if (!Array.isArray(inv)) continue;
  const hits = inv.filter(shouldVoid);
  if (!hits.length) continue;
  if (hits.some(l => ['so', 'sc'].includes(l.k))) throw new Error(`${id}: a short in the set -- not handled, stopping`);
  const next = inv.map(l => shouldVoid(l) ? { ...l, void: STAMP } : l);
  const heldBack = hits.reduce((s, l) => s + cashOf(l), 0);        // what the balance gets back: a voided buy returns its cost, a voided sale takes its proceeds
  backup.push({ id, inv: raw });
  plan.push({ id, next, hits, heldBack });
}

console.log(`${APPLY ? 'APPLYING' : 'DRY RUN'} -- void '${STAMP}': every MARV entry, every week ${WEEK} coin trade\n`);
plan.forEach(p => {
  console.log(`  ${p.id.padEnd(6)} ${String(p.hits.length).padStart(2)} entries   balance ${p.heldBack >= 0 ? '+' : '−'}$${Math.abs(p.heldBack).toFixed(2)}`);
  p.hits.forEach(l => console.log(`           wk${l.w} ${l.k.padEnd(2)} ${(COIN[l.o] || l.o).padEnd(9)} ${(+l.s).toFixed(2).padStart(10)} @ $${(+l.p).toFixed(2)}  ${new Date(l.t).toISOString()}`));
});
if (!plan.length) console.log('  nothing to void -- already done');
if (!APPLY) console.log('\n  dry run: nothing written. --apply to write.');
else if (plan.length) await apply();

/* process.exitCode, never process.exit: exiting while a fetch socket is still
   closing trips a libuv assertion on this Windows / Node build */
async function apply() {
  const dir = path.join(os.homedir(), 'Documents', 'gfl-backups');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `void-coins-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(file, JSON.stringify({ stamp: STAMP, at: new Date().toISOString(), profiles: backup }, null, 1));
  console.log(`\n  backup: ${file}`);
  let written = 0, failed = 0;
  for (const p of plan) {
    const r = await fetch(`${DOCS}/profiles/${encodeURIComponent(p.id)}?${KEY}&updateMask.fieldPaths=inv`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: { inv: { stringValue: JSON.stringify(p.next) } } }) });
    if (!r.ok) { console.error(`  !! ${p.id}: write failed ${r.status}`); failed++; continue; }
    /* read it back: the voids are on the profile, and nothing else moved */
    const back = await (await fetch(`${DOCS}/profiles/${encodeURIComponent(p.id)}?${KEY}`)).json();
    const inv = JSON.parse(back.fields.inv.stringValue);
    const ok = inv.length === p.next.length && inv.filter(l => l.void === STAMP).length >= p.hits.length;
    console.log(`  ${p.id.padEnd(6)} ${ok ? 'written and read back' : 'READ-BACK MISMATCH'}`);
    ok ? written++ : failed++;
  }
  console.log(`\n  ${written} written, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
}
