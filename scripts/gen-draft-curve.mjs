/* THE DRAFT VALUE CURVE, REGENERATED FROM LEAGUE HISTORY.
 *
 * Prints the constant that belongs in app.js. Run it after a season lands in
 * public/data, paste the output over DRAFT_CURVE, and test-draft.mjs checks
 * that what is in app.js is what this produces.
 *
 *   node scripts/gen-draft-curve.mjs
 *
 * The replacement levels are LIFTED out of app.js rather than reimplemented
 * here. They have to agree exactly -- the curve is the median of the same par
 * values app.js computes, so a second copy of draftStarterCounts that drifted
 * would silently produce a baseline measuring something the board never does.
 *
 * WHY A MEDIAN AND NOT A MEAN. The baseline answers "what does a pick here
 * normally return". Past about pick 46 more than half of all picks return a
 * player who never starts, so the mean is carried entirely by the one-in-nine
 * that hit -- and grading against it charges a manager ~15 points for the
 * ORDINARY outcome of a round-8 flier. The median says zero there, which is
 * both true and the behaviour the league asked for: a late miss costs nothing,
 * a late hit still banks everything it produced.
 *
 * WHY FULL-SEASON POINTS. Scoring drifts 8-19% between seasons, which would
 * bias a baseline fixed in points -- but every team holds one pick per round,
 * so every team's summed baseline is near-identical and the league-average
 * adjustment in loadAllDrafts subtracts almost all of a constant scaling error.
 * What it cannot subtract is a baseline of the wrong SHAPE, which is why the
 * shape comes from four seasons rather than one. Mid-season, app.js prorates
 * this curve by how much football has actually been played.
 */
import fs from 'fs';
import { lifter, assemble } from './lib/lift.mjs';

const DIR = new URL('../public/data/', import.meta.url);
const SEASONS = fs.readdirSync(DIR).map(f => (f.match(/^draft-(\d{4})\.json$/) || [])[1])
  .filter(Boolean).map(Number).sort();

const grab = lifter(new URL('../public/app.js', import.meta.url));
const app = assemble(grab, [
  'const DRAFT_BASE_SLOTS=',
  'const DRAFT_FLEX_SLOTS=',
  'const DRAFT_FLEX_POS=',
  'function draftStarterCounts(pool){',
  'function draftReplacement(stats){',
], ['DRAFT_BASE_SLOTS', 'DRAFT_FLEX_SLOTS', 'DRAFT_FLEX_POS', 'draftStarterCounts', 'draftReplacement']);

const WINDOW = 12;                       // slots either side, so 25 picks a point
const MIN_N = 12;                        // below this the median is noise

const med = a => { const s = a.slice().sort((x, y) => x - y); const n = s.length;
  return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : 0; };
const read = (kind, s) => JSON.parse(fs.readFileSync(new URL(`${kind}-${s}.json`, DIR), 'utf8'));

const ALL = [];
const counts = [];
for (const season of SEASONS) {
  const stats = read('seasonstats', season).players || [];
  const picks = read('draft', season).picks || [];
  const byId = {}; stats.forEach(p => { byId[p.id] = p; });
  const repl = app.draftReplacement(stats);

  /* reported so a season whose flex lands somewhere unexpected is visible
     rather than silently folded into the curve */
  const pool = {};
  stats.forEach(p => { if (p && p.pos != null) (pool[p.pos] = pool[p.pos] || []).push(p.pts || 0); });
  Object.keys(pool).forEach(k => pool[k].sort((a, b) => b - a));
  counts.push({ season, n: app.draftStarterCounts(pool), repl });

  picks.filter(p => p && (p.playerId > 0 || byId[p.playerId]))
    .sort((a, b) => a.overall - b.overall)
    .forEach(pk => {
      const s = byId[pk.playerId], pos = s?.pos ?? null;
      if (pos == null || !(String(pos) in app.DRAFT_BASE_SLOTS)) return;   // DST, unknown
      ALL.push({ season, overall: pk.overall, pos, isK: pos === 5,
                 par: Math.max(0, (s.pts || 0) - (repl[pos] || 0)) });
    });
}
const MAX = Math.max(...ALL.map(r => r.overall));

function curve(rows) {
  const raw = [];
  for (let n = 1; n <= MAX; n++) {
    const near = rows.filter(r => Math.abs(r.overall - n) <= WINDOW);
    raw[n] = near.length >= MIN_N ? med(near.map(r => r.par)) : null;
  }
  /* monotone non-increasing: a later pick may never be expected to return more
     than an earlier one. Without this the raw medians wobble and a manager
     could be graded against a baseline that rises as the draft goes on. */
  const out = []; let last = Infinity;
  for (let n = 1; n <= MAX; n++) {
    let v = raw[n]; if (v == null) v = last === Infinity ? 0 : last;
    if (v > last) v = last;
    out[n] = Math.round(v * 10) / 10; last = out[n];
  }
  return out;
}
const skill = curve(ALL.filter(r => !r.isK));
const kick  = curve(ALL.filter(r => r.isK));

/* both curves go flat long before the end, so only the head is worth storing;
   past the cut the last value repeats */
const trim = c => { let i = c.length - 1; while (i > 1 && c[i] === c[i - 1]) i--; return c.slice(1, i + 1); };
const sk = trim(skill), kk = trim(kick);

const fmt = a => {
  const out = []; for (let i = 0; i < a.length; i += 12) out.push('  ' + a.slice(i, i + 12).join(','));
  return out.join(',\n');
};
console.log(`/* Generated by scripts/gen-draft-curve.mjs from ${SEASONS.join(', ')} (${ALL.length} graded picks).
   Median points above replacement returned by each draft slot over a FULL
   season; app.js prorates it by how much of the season has been played. Index 0
   is the first overall pick; past the end of the array the last value repeats. */`);
console.log(`const DRAFT_CURVE={skill:[\n${fmt(sk)}\n],k:[\n${fmt(kk)}\n]};`);

const PN = { 1: 'QB', 2: 'RB', 3: 'WR', 4: 'TE', 5: 'K' };
console.error(`\n  seasons ${SEASONS.join(', ')}   picks ${ALL.length}   deepest pick ${MAX}`);
counts.forEach(c => console.error(
  `  ${c.season}  starters ${[1, 2, 3, 4].map(p => PN[p] + c.n[p]).join(' ').padEnd(24)}`
  + `  replacement ${[1, 2, 3, 4].map(p => PN[p] + ' ' + Math.round(c.repl[p])).join('  ')}`));
console.error(`  skill curve: ${sk.length} stored values, ${sk[0]} at pick 1, zero from pick ${skill.indexOf(0)}`);
console.error(`  kicker curve: ${kk.length} stored values, ${kk[0]} at pick 1`);
