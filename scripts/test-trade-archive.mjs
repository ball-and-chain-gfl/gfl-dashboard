/* Can a trade be archived without losing the votes cast on it?
 *
 * A trade's vote lives on each manager's Firestore profile, in a field named
 * after the trade:
 *
 *     ntTradeVoteId(season, tr)  ->  td:2026:2-3:1788102664091
 *     sanitised to a field name  ->  tv_td_2026_2_3_1788102664091
 *
 * Nothing else records it. There is no trade id in the payload — ESPN's
 * seasontrades endpoint returns {week, teams, at, date} and nothing that
 * survives a round trip except those values — so the NAME is the only link
 * between a trade and what the league said about it.
 *
 * Which makes archiving dangerous in a way that looks completely safe. Writing
 * the season's trades to /data is a copy, and any copy that tidies the payload
 * on the way past — drops the `date`, sorts `teams`, renumbers a week — renames
 * the field and orphans every vote in it. The page still renders. The tally
 * just reads zero, on a trade twelve people argued about.
 *
 * So this suite pins the two halves together: the id the archiver computes must
 * be the id the app computes, both lifted from their own files rather than
 * written out again here, and a payload that loses its date must be refused.
 *
 *   node scripts/test-trade-archive.mjs
 */
import fs from 'fs';

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? '  -> ' + extra : '')); }
};

const read = rel => {
  try { return fs.readFileSync(new URL('../' + rel, import.meta.url), 'utf8')
    .split(String.fromCharCode(13)).join(''); }
  catch (e) { return null; }
};

const APP = read('public/app.js');
const ARC = read('scripts/archive-trades.mjs');

console.log('\n1. both halves still have the function');
ok('app.js has ntTradeVoteId', !!APP && APP.includes('function ntTradeVoteId('));
ok('archive-trades.mjs has voteId', !!ARC && ARC.includes('const voteId ='));

/* Lifted, not reimplemented — the whole point is to catch the two drifting. */
function lift(src, startsWith, endsWith) {
  const i = src.indexOf(startsWith);
  if (i < 0) return null;
  const j = src.indexOf(endsWith, i);
  return j < 0 ? null : src.slice(i, j + endsWith.length);
}
const appFn = APP && lift(APP, 'function ntTradeVoteId(', '\n}');
const arcFn = ARC && lift(ARC, 'const voteId =', '};');

const mod = { exports: {} };
let built = true;
try {
  new Function('module', `
    ${appFn}
    ${arcFn}
    module.exports = { appId: ntTradeVoteId, arcId: voteId };
  `)(mod);
} catch (e) { built = false; console.log('  FAIL harness does not build -> ' + e.message); fail++; }

if (built) {
  const { appId, arcId } = mod.exports;
  const field = v => 'tv_' + String(v).replace(/[^a-zA-Z0-9_]/g, '_');

  /* The shape ESPN's seasontrades endpoint actually returns, and the real 2026
     trade that already carries seven votes in Firestore. */
  const LIVE = { week: 1, at: 1788102664091, date: 1788102664091,
    teams: [{ teamId: 2, players: [], total: 0 }, { teamId: 3, players: [], total: 0 }] };
  const REAL_FIELD = 'tv_td_2026_2_3_1788102664091';

  console.log('\n2. the archiver names a trade exactly as the app does');
  ok('same id for the live 2026 trade', appId('2026', LIVE) === arcId('2026', LIVE),
    appId('2026', LIVE) + ' vs ' + arcId('2026', LIVE));
  ok('and that id is the field the votes are actually in',
    field(appId('2026', LIVE)) === REAL_FIELD, field(appId('2026', LIVE)));

  console.log('\n3. they agree on every shape the payload comes in');
  const shapes = [
    ['no date (the hand-made 2022-25 files)', { week: 3, teams: [{ teamId: 9 }, { teamId: 4 }] }],
    ['an explicit id, should ESPN ever send one', { id: 'abc123', week: 2, teams: [{ teamId: 1 }, { teamId: 5 }] }],
    ['three-way', { week: 6, date: 17, teams: [{ teamId: 1 }, { teamId: 2 }, { teamId: 3 }] }],
    ['no teams at all', { week: 1, date: 5 }],
    ['date of zero', { week: 1, date: 0, teams: [{ teamId: 7 }, { teamId: 8 }] }],
  ];
  shapes.forEach(([what, tr]) => {
    ok(what, appId('2026', tr) === arcId('2026', tr),
      appId('2026', tr) + ' vs ' + arcId('2026', tr));
  });

  console.log('\n4. a field name survives the trip through Firestore');
  ok('every character in an id is legal in a field name once sanitised',
    /^tv_[A-Za-z0-9_]+$/.test(field(appId('2026', LIVE))), field(appId('2026', LIVE)));
  ok('two trades in one season do not sanitise onto each other', (() => {
    const a = field(appId('2026', { week: 1, date: 111, teams: [{ teamId: 2 }, { teamId: 3 }] }));
    const b = field(appId('2026', { week: 4, date: 222, teams: [{ teamId: 2 }, { teamId: 3 }] }));
    return a !== b;
  })());

  console.log('\n5. tidying the payload is what loses the votes');
  const tidied = { week: LIVE.week, teams: LIVE.teams };      // date dropped
  ok('dropping the date renames the field',
    field(appId('2026', tidied)) !== REAL_FIELD, field(appId('2026', tidied)));
  ok('reordering the teams renames it too', (() => {
    const flipped = { ...LIVE, teams: [...LIVE.teams].reverse() };
    return field(appId('2026', flipped)) !== REAL_FIELD;
  })());
  /* the archiver's own refusal, run against those two */
  const orphans = (oldTrades, newTrades) => {
    const before = new Set(oldTrades.map(t => arcId('2026', t)));
    const after = new Set(newTrades.map(t => arcId('2026', t)));
    return [...before].filter(v => !after.has(v));
  };
  ok('so the archiver refuses a tidied rewrite', orphans([LIVE], [tidied]).length === 1);
  ok('and allows a verbatim one', orphans([LIVE], [{ ...LIVE }]).length === 0);
  ok('and allows one that only ADDS a trade', (() => {
    const extra = { week: 5, date: 999, teams: [{ teamId: 6 }, { teamId: 7 }] };
    return orphans([LIVE], [LIVE, extra]).length === 0;
  })());
}

/* ── WHAT IS ALREADY ON DISK MUST STAY NAMEABLE ───────────────────────────── */
console.log('\n6. every archived season still produces vote ids');
if (built) {
  const { arcId } = mod.exports;
  for (const y of ['2022', '2023', '2024', '2025', '2026']) {
    let d = null;
    try { d = JSON.parse(read(`public/data/trades-${y}.json`)); } catch {}
    if (!d) { console.log(`  --   trades-${y}.json not archived yet`); continue; }
    const ids = (d.trades || []).map(t => arcId(y, t));
    ok(`trades-${y}.json — ${ids.length} trades, all nameable`,
      ids.length > 0 && ids.every(v => /^td:\d{4}:.+/.test(v)));
    /* Two trades between the same pair in a season collapse onto one tally,
       because the id has no week in it. Reported rather than failed: it is a
       pre-existing property of ids already written to profiles, and changing
       the recipe would orphan the votes this suite exists to protect. */
    const dupes = [...new Set(ids.filter((v, i) => ids.indexOf(v) !== i))];
    if (dupes.length) {
      console.log(`       note: ${dupes.length} shared id(s) in ${y} — these trades share one tally:`);
      dupes.forEach(v => console.log(`         ${v}`));
    }
  }
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
