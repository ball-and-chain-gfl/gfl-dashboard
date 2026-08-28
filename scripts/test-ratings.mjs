/* WHAT A TEAM IS PRICED ON.
 *
 * The sportsbook rates a team on the best legal lineup it could field, not on
 * the lineup it actually set. That distinction is the whole point: anything read
 * off the lineup as set is gameable. Sit the whole starting eleven, lose by
 * ninety, and next week's price has you as a long underdog — then put everybody
 * back and collect. What a manager holds cannot be faked without genuinely
 * giving the players away.
 *
 * These cases run the real sbBestLineup and sbSlotShape out of public/app.js.
 */
import fs from 'fs';
const SRC = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8')
  .split(String.fromCharCode(13)).join('');

function grab(startsWith) {
  const i = SRC.indexOf(startsWith);
  if (i < 0) throw new Error('not found: ' + startsWith);
  let j = i, depth = 0, started = false;
  for (; j < SRC.length; j++) {
    const c = SRC[j];
    if (c === '{') { depth++; started = true; }
    else if (c === '}') { depth--; if (started && depth === 0) { j++; break; } }
    else if (c === ';' && !started && depth === 0) { j++; break; }
  }
  return SRC.slice(i, j);
}

const api = new Function(`
${grab('const LINEUP_SHAPE_FALLBACK=')}
${grab('function sbSlotShape(meta){')}
${grab('function sbBestLineup(entries,projOf,posOf,shape){')}
return { LINEUP_SHAPE_FALLBACK, sbSlotShape, sbBestLineup };`)();

let pass = 0, fail = 0;
const eq = (n, g, w) => {
  const a = JSON.stringify(g), b = JSON.stringify(w);
  if (a === b) { pass++; console.log('  ok   ' + n); }
  else { fail++; console.log('  FAIL ' + n + '\n         got  ' + a + '\n         want ' + b); }
};

/* ESPN slot ids: 0 QB, 2 RB, 4 WR, 6 TE, 16 D/ST, 17 K, 20 bench, 21 IR, 23 FLEX.
   These are this league's real counts, read off mSettings. */
const REAL_SLOTS = { 0:1, 2:2, 4:2, 6:1, 16:1, 17:1, 20:5, 21:1, 23:1 };
const SHAPE = { qb:1, rb:2, wr:2, te:1, flex:1, dst:1, k:1 };

console.log('\n1. the lineup shape comes from the league, not from a guess');
{
  eq('this league starts nine', api.sbSlotShape({ slots: REAL_SLOTS }), SHAPE);
  eq('no settings falls back', api.sbSlotShape(null), api.LINEUP_SHAPE_FALLBACK);
  eq('no slots key falls back', api.sbSlotShape({}), api.LINEUP_SHAPE_FALLBACK);
  /* some past seasons come back with the counts stripped out entirely */
  eq('a blob naming no starters falls back',
     api.sbSlotShape({ slots: { 0:0, 2:0, 4:0, 6:0, 16:0, 17:0, 23:0 } }),
     api.LINEUP_SHAPE_FALLBACK);
  eq('a two-flex league is respected',
     api.sbSlotShape({ slots: { ...REAL_SLOTS, 23:2 } }), { ...SHAPE, flex:2 });
}

/* positions are ESPN's defaultPositionId: 1 QB, 2 RB, 3 WR, 4 TE, 5 K, 16 D/ST */
const P = { QB:1, RB:2, WR:3, TE:4, K:5, DST:16 };
const roster = (...players) => players.map(([pos, proj], i) => ({ pid: 100 + i, pos, proj }));
const best = (r, shape) => api.sbBestLineup(r, e => e.proj, e => e.pos, shape || SHAPE);

console.log('\n2. the best legal lineup, not the best nine numbers');
{
  /* a plain roster: one of each named slot plus a flex, and a bench that does
     not count towards anything */
  const r = roster(
    [P.QB, 300], [P.RB, 200], [P.RB, 180], [P.WR, 160], [P.WR, 150],
    [P.TE, 120], [P.DST, 110], [P.K, 100],
    [P.WR, 140],                                  // the flex
    [P.RB, 40], [P.WR, 30], [P.TE, 20],           // bench, ignored
  );
  eq('nine starters, best available',
     best(r), 300 + 200 + 180 + 160 + 150 + 120 + 110 + 100 + 140);

  /* THE HOARDING CASE. Three quarterbacks project higher than anything else on
     the board, and only one of them can start. Summing the top nine projections
     regardless of position — which is what this used to do — paid for all three. */
  const qbs = roster(
    [P.QB, 300], [P.QB, 290], [P.QB, 280],
    [P.RB, 200], [P.RB, 180], [P.WR, 160], [P.WR, 150], [P.TE, 120],
    [P.DST, 110], [P.K, 100], [P.WR, 140],
  );
  eq('only one quarterback is paid for',
     best(qbs), 300 + 200 + 180 + 160 + 150 + 120 + 110 + 100 + 140);
  const topNine = qbs.map(e => e.proj).sort((a, b) => b - a).slice(0, 9).reduce((a, b) => a + b, 0);
  eq('and that is less than the top nine would have said', best(qbs) < topNine, true);
}

console.log('\n3. the flex takes the best of what is left');
{
  const withSpareRB = roster(
    [P.QB, 300], [P.RB, 200], [P.RB, 180], [P.RB, 175],
    [P.WR, 160], [P.WR, 150], [P.TE, 120], [P.DST, 110], [P.K, 100],
  );
  eq('a third running back flexes in',
     best(withSpareRB), 300 + 200 + 180 + 160 + 150 + 120 + 110 + 100 + 175);

  const withSpareTE = roster(
    [P.QB, 300], [P.RB, 200], [P.RB, 180], [P.WR, 160], [P.WR, 150],
    [P.TE, 120], [P.TE, 190], [P.DST, 110], [P.K, 100],
  );
  eq('a second tight end flexes in when it is the best left',
     best(withSpareTE), 300 + 200 + 180 + 160 + 150 + 190 + 120 + 110 + 100);

  eq('a quarterback never flexes',
     best(roster([P.QB, 300], [P.QB, 290], [P.RB, 100], [P.WR, 90])),
     300 + 100 + 90);
}

console.log('\n4. it cannot be moved by who was actually started');
{
  /* The exploit this exists to close. The same roster, described twice: once
     with everybody "in the lineup" and once with the whole starting eleven sat
     on the bench. sbBestLineup is handed the roster, so the two are the same
     number — there is nothing here for a benched lineup to move. */
  const players = [
    [P.QB, 300], [P.RB, 200], [P.RB, 180], [P.WR, 160], [P.WR, 150],
    [P.TE, 120], [P.DST, 110], [P.K, 100], [P.WR, 140],
  ];
  const started = players.map(([pos, proj], i) => ({ pid: 100 + i, pos, proj, slot: 'start' }));
  const benched = players.map(([pos, proj], i) => ({ pid: 100 + i, pos, proj, slot: 'bench' }));
  eq('a sat lineup rates exactly the same', best(benched), best(started));
  eq('and that is the full nine', best(benched), 1460);
}

console.log('\n5. missing and broken data');
{
  eq('an empty roster is zero', best([]), 0);
  eq('a null roster is zero', best(null), 0);
  /* a player the pool did not return has position 0 and no projection */
  eq('unknown positions are skipped',
     best(roster([0, 999], [P.QB, 300], [P.RB, 100])), 400);
  eq('a negative projection never subtracts',
     best(roster([P.QB, -50], [P.RB, 100])), 100);
  eq('a short roster takes what it has',
     best(roster([P.QB, 300], [P.K, 100])), 400);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
