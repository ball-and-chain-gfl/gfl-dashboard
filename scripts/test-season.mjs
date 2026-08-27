/* HOW A TICKET IS ROUTED: WHICH SEASON, AND WEEKLY OR SEASON-LONG.

   Two questions decide whether a bet can ever be graded, and both used to have
   wrong answers. The season on the ticket has to be a season the site can look
   up, and a leg has to be recognised as weekly if it is going to close when the
   football starts and settle off that week's scoreboard.

   ── PART ONE ───────────────────────────────────────────────────────────────

   Every bet is stamped with sbSeason() when it is struck, and betGrade looks a
   ticket's results up by the season written on it. If those two ever disagree
   the bet cannot be graded, so it never settles and the stake never comes back
   — silently, with nothing on screen to say so.

   That is not hypothetical. sbSeason() used to read "any game has been played"
   as "this season is finished" and answer with the following year, from the
   first Thursday night of the season onward: bets struck during 2026 were
   stamped 2027, _seasonMeta['2027'] did not exist, and every leg graded null.
   These cases walk the real functions through a season so it cannot come back.

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

const parts = [
  grab('function nflSeasonYear(){'),
  grab('function sbSeason(){'),
  grab('function betLegWeek('),
  grab('function betWeekResult(leg,season,wk){'),
  grab('function betLegResult(leg,season){'),
  grab('function betGrade(bet){'),
];

const harness = `
let _seasonMeta={}, ALL_SEASONS=[], _finalsCache={};
/* Season-long legs settle off sbFinals, which is its own body of work; these
   cases are about the weekly path, so it answers "loaded" or "not loaded". */
const sbFinals=s=>(_seasonMeta[s]?{}:null);
const regEndOf=()=>14;
${parts.join('\n')}
return { set(m,all){_seasonMeta=m; ALL_SEASONS=all; _finalsCache={};},
         sbSeason, betGrade, betWeekResult, betLegWeek };`;
const api = new Function(harness)();

let pass = 0, fail = 0;
const eq = (n, g, w) => {
  const a = JSON.stringify(g), b = JSON.stringify(w);
  if (a === b) { pass++; console.log('  ok   ' + n); }
  else { fail++; console.log('  FAIL ' + n + '\n         got  ' + a + '\n         want ' + b); }
};

/* A season as ESPN serves it: 14 one-week matchup periods for twelve teams,
   then a bracket of 4, 4 and 2 — byes for the top two seeds and the bottom two.
   `scoredThrough` is how much football has been played; `withBracket` is
   whether ESPN has published the playoff rounds yet, which it does during the
   season rather than up front. */
function season(scoredThrough, withBracket = true) {
  const schedule = [];
  const weeks = withBracket ? 17 : 14;
  for (let w = 1; w <= weeks; w++) {
    const games = w <= 14 ? 6 : (w === 17 ? 2 : 4);
    for (let g = 0; g < games; g++) {
      const played = w <= scoredThrough;
      schedule.push({
        matchupPeriodId: w,
        home: { teamId: g * 2 + 1, totalPoints: played ? 120 - g : 0 },
        away: { teamId: g * 2 + 2, totalPoints: played ?  95 + g : 0 },
      });
    }
  }
  return { schedule, regEnd: 14 };
}

const ALL = ['2022', '2023', '2024', '2025', '2026'];
const finished = season(17);
const past = { 2022: finished, 2023: finished, 2024: finished, 2025: finished };
const at = (meta) => { api.set({ ...past, ...meta }, ALL); return String(api.sbSeason()); };

console.log('\n1. the book prices the season being played');
{
  eq('2026 not published yet — price 2026',        at({}), '2026');
  eq('2026 published, nothing kicked off',        at({ 2026: season(0, false) }), '2026');
  eq('week 1 played — still 2026',                at({ 2026: season(1, false) }), '2026');
  eq('mid-season — still 2026',                   at({ 2026: season(8, false) }), '2026');
  eq('week 14 done, no bracket yet — still 2026', at({ 2026: season(14, false) }), '2026');
  eq('bracket published, unplayed — still 2026',  at({ 2026: season(14, true) }), '2026');
  eq('one playoff round in — still 2026',         at({ 2026: season(15, true) }), '2026');
}

console.log('\n2. and moves on only once the season is actually over');
{
  eq('2026 complete — futures are 2027', at({ 2026: season(17, true) }), '2027');
}

console.log('\n3. a ticket struck mid-season settles');
{
  api.set({ ...past, 2026: season(1, false) }, ALL);
  const stamp = String(api.sbSeason());
  const leg = { mk: 'wk1-1-2-ml', pick: 'bft', pickLabel: 'BFT', odds: -150 };
  /* team 1 (home, 120) beat team 2 (away, 95) in week 1 */
  api.set({ ...past, 2026: Object.assign(season(1, false), {
    owners: { 1: 'bft', 2: 'bi', 3: 'dorm', 4: 'fman', 5: 'goob', 6: 'kunk',
              7: 'kw', 8: 'mcm', 9: 'mm', 10: 'mwm', 11: 'ting', 12: 'wglr' },
  }) }, ALL);
  eq('the stamp is the season being played', stamp, '2026');
  eq('the winning leg reads as won', api.betWeekResult(leg, stamp, 1), true);
  eq('and the ticket grades', api.betGrade({ season: stamp, stake: 50, payout: 83, legs: [leg] }),
    { status: 'won', ret: 83 });
  /* the regression itself: a season nothing can be looked up under */
  eq('a ticket stamped with an unknown season cannot grade',
    api.betGrade({ season: '2099', stake: 50, payout: 83, legs: [leg] }), null);
}

/* ── PART TWO ────────────────────────────────────────────────────────────────
   betLegWeek is what tells a weekly leg from a season one. The kickoff lock
   reads it, and so does grading: a leg it does not recognise is treated as a
   season future, which stays open through Sunday and settles off the standings.

   The lock used to test /-(ml|sp|tot)$/ instead, which is only the three
   markets written on a single fixture — so Top Score, the Donut, the FAAB
   ladder and By Team's Top Scorer stayed bettable all afternoon with the
   scoreboard in plain sight. Every key shape the board can emit is listed here
   so a new market cannot quietly join that set. */
console.log('\n4. every weekly market is recognised as weekly');
{
  const weekly=[
    ['wk5-1-2-ml',   'a fixture moneyline'],
    ['wk5-1-2-sp',   'a fixture spread'],
    ['wk5-1-2-tot',  'a fixture total'],
    ['wk5-high',     'top score'],
    ['wk5-low',      'low score'],
    ['wk5-close',    'closest game'],
    ['wk5-blow',     'biggest blowout'],
    ['wk5-player',   'top player'],
    ['wk5-donut',    'the donut'],
    ['fa4262921-5',  'a FAAB over/under'],
    ['ttbft-5',      "By Team's top scorer"],
  ];
  weekly.forEach(([mk,label])=>eq(label+' ('+mk+')', api.betLegWeek(mk), 5));
}

console.log('\n5. and no season future is mistaken for one');
{
  const seasonMarkets=['champ','last','firstring','playoffs','mostpf','fewpf',
    'mostpa','highweek','most150','most80','wins','pf','pa','topseed','botseed'];
  seasonMarkets.forEach(mk=>eq(mk+' is season-long', api.betLegWeek(mk), null));
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
