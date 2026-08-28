/* ALL-TIME RECORDS AGREE WITH EACH OTHER.

   The site derives an all-time table in two places, for two different jobs:

     · franchiseAllTime(owner) — one franchise's whole history, which is what
       League History and the team profiles print
     · allTimeThrough(season,week) — the same table rebuilt at any cutoff, which
       is how the Legacy Report works out what moved this week

   Both are replays of the same schedules, so they have to agree about what a
   game is. They did not: every other all-time table on the site drops a dead
   consolation game through postGameCounts, and allTimeThrough was the one that
   did not — so the Legacy Report ranked franchises on a record that League
   History disagreed with, and reported movement in positions that were not the
   positions being shown.

   Across 2022-2025, 68 of 410 scored matchups are post-regular-season, so this
   was not a rounding difference.

   Run against the shipped source, like the rest of the suite. */
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

/* postGameCounts itself reaches into the bracket builders, which are a body of
   work of their own. It is handed in here so these cases can say exactly which
   games are real and which are dead, and check that allTimeThrough asks. */
const api = new Function(`
let _seasonMeta={}, ALL_SEASONS=[], _COUNTS=()=>true;
const postGameCounts=(s,m)=>_COUNTS(s,m);
${grab('function allTimeThrough(season,week){')}
return { allTimeThrough,
  set(meta,all,counts){ _seasonMeta=meta; ALL_SEASONS=all;
    _COUNTS=counts||(()=>true); } };`)();

let pass = 0, fail = 0;
const eq = (n, g, w) => {
  const a = JSON.stringify(g), b = JSON.stringify(w);
  if (a === b) { pass++; console.log('  ok   ' + n); }
  else { fail++; console.log('  FAIL ' + n + '\n         got  ' + a + '\n         want ' + b); }
};

/* Two teams, a fourteen-week regular season and a three-week bracket. Week 15
   carries one real semi-final and one dead consolation game, which is the shape
   that separates the two tables. */
const OWNERS = { 1: 'bft', 2: 'bi' };
const game = (wk, hp, ap, dead) => ({
  matchupPeriodId: wk, dead: !!dead,
  home: { teamId: 1, totalPoints: hp }, away: { teamId: 2, totalPoints: ap },
});
const schedule = [
  game(1, 110, 100), game(2, 90, 120), game(3, 100, 100),   // W, L, tie
  game(15, 130, 90),                                        // a real bracket game
  game(15, 200, 10, true),                                  // a dead consolation game
  game(16, 0, 0),                                           // scheduled, never played
];
const META = { 2026: { owners: OWNERS, regEnd: 14, schedule } };
const ALL = ['2026'];

console.log('\n1. the regular season, counted the same either way');
{
  api.set(META, ALL, (s, m) => !m.dead);
  const t = api.allTimeThrough('2026', 14);
  eq('three games', t.bft.g, 3);
  eq('one win, one loss, one tie', [t.bft.w, t.bft.l, t.bft.t], [1, 1, 1]);
  eq('points for', t.bft.pf, 110 + 90 + 100);
  eq('points against', t.bft.pa, 100 + 120 + 100);
  eq('and the other side is its mirror', [t.bi.w, t.bi.l, t.bi.t], [1, 1, 1]);
  eq('a scheduled week nobody played is not a game', t.bft.g, 3);
}

console.log('\n2. a dead consolation game is not an all-time game');
{
  api.set(META, ALL, (s, m) => !m.dead);
  const t = api.allTimeThrough('2026', 99);
  eq('four games, not five', t.bft.g, 4);
  eq('the real bracket game counts', t.bft.w, 2);
  eq('the dead one does not reach points for', t.bft.pf, 110 + 90 + 100 + 130);
  eq('nor the highest score', t.bft.hi, 130);
}

console.log('\n3. and the filter is what is doing the work');
{
  /* the same data with nothing filtered — this is what the Legacy Report used
     to see, and why its ranks disagreed with League History */
  api.set(META, ALL, () => true);
  const t = api.allTimeThrough('2026', 99);
  eq('unfiltered, the dead game counts', t.bft.g, 5);
  eq('and drags a 200 into the record', t.bft.hi, 200);
  eq('which is the disagreement, in one number', t.bft.pf, 110 + 90 + 100 + 130 + 200);
}

console.log('\n4. the cutoff still means what it says');
{
  api.set(META, ALL, (s, m) => !m.dead);
  eq('through week 1',  api.allTimeThrough('2026', 1).bft.g, 1);
  eq('through week 2',  api.allTimeThrough('2026', 2).bft.g, 2);
  eq('through week 15', api.allTimeThrough('2026', 15).bft.g, 4);
  /* a season later than the cutoff is not in the table at all */
  api.set({ ...META, 2027: { owners: OWNERS, regEnd: 14, schedule: [game(1, 500, 10)] } },
          ['2026', '2027'], (s, m) => !m.dead);
  eq('a later season is excluded', api.allTimeThrough('2026', 99).bft.pf,
     110 + 90 + 100 + 130);
  eq('and included once the cutoff reaches it', api.allTimeThrough('2027', 99).bft.pf,
     110 + 90 + 100 + 130 + 500);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
