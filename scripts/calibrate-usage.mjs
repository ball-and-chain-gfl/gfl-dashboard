/* IS THE USAGE MODEL BETTER THAN THE OLD ONE?
 *
 * livePlayerLeft re-projects a player's remaining points from his usage instead
 * of from projection x time left. It is a better idea. Nobody has shown it is a
 * better NUMBER, and after the win probability curve turned out to be arguing
 * with itself for four seasons, "it is obviously better" is not good enough.
 *
 * So every reading records BOTH answers side by side — the usage model at
 * positions 4 and 5, the old flat model at 6 and 7 — and the final score says
 * which was right. This scores them against each other.
 *
 *   [minute, bankedA, bankedB, espnWp, usageLeftA, usageLeftB, flatLeftA, flatLeftB]
 *
 * WHAT IT MEASURES. At a reading taken at minute t, a side had banked `a` and
 * was predicted to score `left` more. It finished on `F`. So the truth is
 * F - a, and the error is (predicted - truth). Do that for every reading of
 * every matchup and the two models can be compared on mean absolute error.
 *
 * A week must be FINISHED for this to mean anything, because F is the final.
 * Weeks still running are skipped.
 *
 *   node scripts/calibrate-usage.mjs                 # every archived week
 *   node scripts/calibrate-usage.mjs 2026-w1         # one week
 *
 * SOURCES. Archived weeks live in public/data/live-<season>-w<week>.json, which
 * is what archive-week writes. The week in progress is in Firestore and can be
 * read with LIVE=1, though it will not have a final to score against until the
 * week closes.
 */
import fs from 'fs';

const DIR = new URL('../public/data/', import.meta.url);
const ONLY = process.argv[2] || null;
const LIVE = !!process.env.LIVE;

const read = f => { try { return JSON.parse(fs.readFileSync(new URL(f, DIR), 'utf8')); } catch { return null; } };
const mean = v => v.reduce((a, b) => a + b, 0) / (v.length || 1);
const med = v => { const s = [...v].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };

/* ── find the weeks ───────────────────────────────────────────────────────── */
const files = fs.readdirSync(new URL('.', DIR))
  .filter(f => /^live-\d{4}-w\d+\.json$/.test(f))
  .filter(f => !ONLY || f.includes(ONLY));

if (LIVE) {
  const cfg = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  const db = new Function(cfg.match(/const GFL_DB=\{[^}]*\}/)[0] + '; return GFL_DB;')();
  const key = ONLY || (() => { throw new Error('LIVE=1 needs a week, e.g. 2026-w1'); })();
  const url = `https://firestore.googleapis.com/v1/projects/${db.project}`
    + `/databases/(default)/documents/live/${encodeURIComponent(key)}?key=${db.key}`;
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) { console.log('could not read ' + key); process.exit(1); }
  const f = (await r.json()).fields || {};
  fs.writeFileSync(new URL(`live-${key}.json`, DIR),
    (f.series || {}).stringValue || '{}');
  console.log(`pulled ${key} from Firestore into public/data/ (not committed)\n`);
  files.push(`live-${key}.json`);
}

if (!files.length) {
  console.log('No archived weeks found. archive-week writes them on the Tuesday.');
  console.log('For the week in progress:  LIVE=1 node scripts/calibrate-usage.mjs 2026-w1');
  process.exit(0);
}

/* ── score them ───────────────────────────────────────────────────────────── */
const rows = [];        // {week, owner, t, banked, usage, flat, truth}
let readings = 0, withBoth = 0;

files.forEach(file => {
  const series = read(file);
  if (!series) return;
  const week = file.replace(/^live-|\.json$/g, '');
  Object.entries(series).forEach(([key, arr]) => {
    if (!Array.isArray(arr) || arr.length < 2) return;
    const [oa, ob] = key.split('~');
    /* the last reading of the week is the final score */
    const last = arr[arr.length - 1];
    const finalA = last[1], finalB = last[2];
    arr.forEach(p => {
      readings++;
      if (p.length < 8 || p[4] == null || p[6] == null) return;   // written before both were recorded
      withBoth++;
      rows.push({ week, owner: oa, t: p[0], banked: p[1], usage: p[4], flat: p[6], truth: finalA - p[1] });
      rows.push({ week, owner: ob, t: p[0], banked: p[2], usage: p[5], flat: p[7], truth: finalB - p[2] });
    });
  });
});

console.log(`${files.length} week${files.length === 1 ? '' : 's'} · ${readings} readings`
  + ` · ${withBoth} carrying both models\n`);

if (!rows.length) {
  console.log('NOTHING TO SCORE YET.');
  console.log('Readings only carry both answers from gfl-v626 onward, so this needs');
  console.log('a week played after that. Everything before it has the usage number');
  console.log('alone, which cannot be compared with anything.');
  process.exit(0);
}

const uErr = rows.map(r => r.usage - r.truth);
const fErr = rows.map(r => r.flat - r.truth);
const abs = v => v.map(Math.abs);

console.log('                      usage model      old model');
console.log('  mean abs error   ' + mean(abs(uErr)).toFixed(2).padStart(11)
  + mean(abs(fErr)).toFixed(2).padStart(15));
console.log('  median abs err   ' + med(abs(uErr)).toFixed(2).padStart(11)
  + med(abs(fErr)).toFixed(2).padStart(15));
console.log('  bias (over +)    ' + mean(uErr).toFixed(2).padStart(11)
  + mean(fErr).toFixed(2).padStart(15));

const better = rows.filter(r => Math.abs(r.usage - r.truth) < Math.abs(r.flat - r.truth)).length;
console.log('\n  usage was closer on ' + (better / rows.length * 100).toFixed(1)
  + '% of readings (' + better + ' of ' + rows.length + ')');

const gain = (mean(abs(fErr)) - mean(abs(uErr))) / mean(abs(fErr)) * 100;
console.log('  mean error ' + (gain >= 0 ? 'reduced by ' : 'INCREASED by ')
  + Math.abs(gain).toFixed(1) + '%');

/* where in a week the difference shows up — early readings have the most
   projection left to be wrong about */
console.log('\n  by how much of the side\'s week was still to come:');
console.log('    still to come     n     usage      old    winner');
[[0.8, 1.01], [0.6, 0.8], [0.4, 0.6], [0.2, 0.4], [0, 0.2]].forEach(([lo, hi]) => {
  const r = rows.filter(x => {
    const tot = x.banked + x.truth;
    const frac = tot > 0 ? x.truth / tot : 0;
    return frac >= lo && frac < hi;
  });
  if (r.length < 20) return;
  const u = mean(abs(r.map(x => x.usage - x.truth)));
  const f = mean(abs(r.map(x => x.flat - x.truth)));
  console.log('    ' + ((lo * 100).toFixed(0) + '-' + (hi * 100).toFixed(0) + '%').padEnd(12)
    + String(r.length).padStart(7) + u.toFixed(2).padStart(9) + f.toFixed(2).padStart(9)
    + '    ' + (u < f ? 'usage' : 'old'));
});

console.log('\n  A NOTE ON WHAT THIS CANNOT DO. It scores the two models against');
console.log('  each other. It does not fit LIVE_USAGE_R, because a reading records');
console.log('  the answer at the r that was live when it was written, not the');
console.log('  inputs needed to recompute it at another. Refitting r needs');
console.log('  per-player mid-game state, which nothing stores.');
