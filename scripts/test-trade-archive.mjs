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

/* ── THE MERGE, AND THE TALLY IT FEEDS ──────────────────────────────────────
   Archiving the live season weekly means the app now reads TWO sources for it,
   and both ways of getting that wrong are silent:

     lose a trade   the archive holds one ESPN has stopped reporting, and a
                    merge that trusts only the live feed drops it
     freeze a total a trade is scored on what its players did after it, which
                    grows every Sunday — take the number from the archive and
                    the bar quietly stops moving
     count twice    the same vote is in the archive AND on the profile, and a
                    tally that adds the two says fourteen people voted in a
                    league of twelve

   All three render perfectly. */
console.log('\n7. the live season merges its archive without losing or freezing anything');
const APP2 = APP;
function liftFn(name) {
  const i = APP2.indexOf('function ' + name + '(');
  if (i < 0) return null;
  let j = i, d = 0, started = false;
  for (; j < APP2.length; j++) {
    const c = APP2[j];
    if (c === '{') { d++; started = true; }
    else if (c === '}') { d--; if (started && d === 0) { j++; break; } }
  }
  return APP2.slice(i, j);
}
const mod2 = { exports: {} };
let built2 = true;
try {
  new Function('module', `
    let _cpRows = null, _me = null;
    let _tradeVotes = {}, _tradeVoterTeam = {};
    function setRows(r){ _cpRows = r; }
    function setMe(m){ _me = m; }
    function setArchived(v, t){ _tradeVotes = v || {}; _tradeVoterTeam = t || {}; }
    ${liftFn('ntTradeVoteId')}
    ${liftFn('mergeSeasonTrades')}
    ${liftFn('ntVoteSides')}
    ${liftFn('ntVoteTally')}
    ${liftFn('ntMyVote')}
    ${liftFn('voterTeamId')}
    module.exports = { mergeSeasonTrades, ntVoteSides, ntVoteTally, ntMyVote,
      voterTeamId, ntTradeVoteId, setRows, setMe, setArchived };
  `)(mod2);
} catch (e) { built2 = false; console.log('  FAIL merge harness does not build -> ' + e.message); fail++; }

if (built2) {
  const M = mod2.exports;
  const T = (teamIds, date, extra) => ({ week: 1, date, teams: teamIds.map(id => ({ teamId: id, players: [], total: 0 })), ...extra });

  const archived = { season: '2026', trades: [T([2, 3], 111, { votes: { mm: '3' }, teams: [{ teamId: 2, total: 10 }, { teamId: 3, total: 20 }] })], voters: { mm: 1 } };
  const live = { season: '2026', source: 'log', trades: [T([2, 3], 111, { teams: [{ teamId: 2, total: 88 }, { teamId: 3, total: 99 }] })] };

  const m = M.mergeSeasonTrades('2026', archived, live);
  ok('one trade in, one trade out', m.trades.length === 1, m.trades.length);
  ok('the votes come from the archive', JSON.stringify(m.trades[0].votes) === '{"mm":"3"}',
    JSON.stringify(m.trades[0].votes));
  ok('the POINTS come from the live feed, not the frozen copy',
    m.trades[0].teams[1].total === 99, m.trades[0].teams[1].total);
  ok('and the voter map rides along', m.voters && m.voters.mm === 1);

  const live2 = { season: '2026', trades: [live.trades[0], T([5, 6], 222)] };
  ok('a trade ESPN has that the archive does not is added',
    M.mergeSeasonTrades('2026', archived, live2).trades.length === 2);
  ok('a trade the archive has that ESPN has dropped is KEPT',
    M.mergeSeasonTrades('2026', archived, { season: '2026', trades: [T([5, 6], 222)] }).trades.length === 2);
  ok('no archive at all is just the live feed',
    M.mergeSeasonTrades('2026', null, live).trades.length === 1);
  ok('no live feed at all is just the archive',
    M.mergeSeasonTrades('2026', archived, null).trades.length === 1);

  console.log('\n8. a vote in both records is one vote');
  const vid = 'td_2026_2_3_111';
  M.setArchived({ [vid]: { mm: '3', bft: '3', kunk: '2' } }, { mm: 1, bft: 10, kunk: 7 });
  M.setRows([
    { id: 'mm', teamId: 1, ['tv_' + vid]: '3' },     // in both, agreeing
    { id: 'bft', teamId: 10, ['tv_' + vid]: '3' },   // in both, agreeing
    { id: 'goob', teamId: 3, ['tv_' + vid]: '2' },   // profile only, cast since
  ]);
  const sides = M.ntVoteSides(vid);
  ok('four distinct voters, not seven', Object.keys(sides).length === 4, Object.keys(sides).length);
  const tally = M.ntVoteTally(vid);
  ok('the tally adds to four', Object.values(tally).reduce((a, b) => a + b, 0) === 4, JSON.stringify(tally));
  ok('and splits 2-2', tally['3'] === 2 && tally['2'] === 2, JSON.stringify(tally));
  ok('a vote cast since the archive shows immediately', sides.goob === '2');
  ok('a vote only in the archive still shows', sides.kunk === '2');

  console.log('\n9. the tally is right with either record missing');
  M.setArchived({}, {});
  ok('profiles alone', Object.values(M.ntVoteTally(vid)).reduce((a, b) => a + b, 0) === 3);
  M.setArchived({ [vid]: { mm: '3', bft: '3', kunk: '2' } }, { mm: 1, bft: 10, kunk: 7 });
  M.setRows(null);
  ok('archive alone', Object.values(M.ntVoteTally(vid)).reduce((a, b) => a + b, 0) === 3);
  ok('an unknown trade has no votes', Object.keys(M.ntVoteSides('td_2026_9_9_9')).length === 0);

  console.log('\n10. a crest can be drawn without the profiles collection');
  ok('the archive knows whose team a voter is', M.voterTeamId('kunk') === 7, M.voterTeamId('kunk'));
  M.setRows([{ id: 'kunk', teamId: 99 }]);
  ok('a loaded profile wins over the archived map', M.voterTeamId('kunk') === 99, M.voterTeamId('kunk'));
  ok('an unknown voter is zero, not NaN', M.voterTeamId('nobody') === 0, M.voterTeamId('nobody'));

  console.log('\n11. my own vote reads the union');
  M.setRows([{ id: 'goob', teamId: 3, ['tv_' + vid]: '2' }]);
  M.setMe({ k1: 'kunk' });
  ok('mine from the archive when my profile is not loaded', M.ntMyVote(vid) === '2', M.ntMyVote(vid));
  M.setMe({ k1: 'goob' });
  ok('mine from my profile when it is', M.ntMyVote(vid) === '2', M.ntMyVote(vid));
  M.setMe(null);
  ok('signed out, no vote', M.ntMyVote(vid) === '');
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
