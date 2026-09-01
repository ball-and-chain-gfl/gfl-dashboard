/* WHEN IS A FANTASY WEEK OVER?
 *
 * Nearly everything in the app that turns over weekly hangs on that one
 * question — the trivia set, the picks slate, the Matchup of the Week, the
 * allowance, the week's result cards, the fixtures the sportsbook prices, and
 * every bet graded off a week's scores.
 *
 * It used to be answered by the points: every fixture in the week with somebody
 * on the board. That is a fine test for a week in the PAST and the wrong test
 * for the week being played, because all six fixtures have somebody scoring
 * within minutes of the Sunday one o'clock kickoffs — with the late window,
 * Sunday night and Monday night still to come. The whole app rolled its week
 * over on Sunday lunchtime.
 *
 * The answer is ESPN's `winner` field, which reads UNDECIDED until the scoring
 * period closes. This suite is the truth table for that, the timeline it
 * produces across a real week one, and a check that the copies of the rule
 * living in the archive scripts still say the same thing as app.js.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8')
  .split(String.fromCharCode(13)).join('');

/* Lifting a declaration out of the source needs a walker that knows what it is
   looking at. The one in settle-bets counts curly braces; archive-charts counts
   square brackets too. Neither is enough here, because half of what this suite
   needs is one-line arrow functions:

     const motwInfo=()=>(_liveInfo||liveWeekInfo()||{});

   a brace walker stops dead at that `}` and hands back an unclosed paren, and

     const motwPickKey=()=>`motw_${...}_t${motwStamp()}`;

   is worse — the `${` reads as a brace and the string is cut in half. So this
   one counts all three kinds of bracket, skips strings, template literals and
   comments, and only ends on a closing curly or square at depth zero, or on a
   semicolon outside everything. */
function skipQuote(src, i) {
  const q = src[i];
  let j = i + 1;
  while (j < src.length) {
    if (src[j] === '\\') { j += 2; continue; }
    if (src[j] === q) return j + 1;
    j++;
  }
  return j;
}
function skipTemplate(src, i) {
  let j = i + 1;
  while (j < src.length) {
    if (src[j] === '\\') { j += 2; continue; }
    if (src[j] === '`') return j + 1;
    if (src[j] === '$' && src[j + 1] === '{') {
      let d = 1; j += 2;
      while (j < src.length && d > 0) {
        const c = src[j];
        if (c === '\\') { j += 2; continue; }
        if (c === "'" || c === '"') { j = skipQuote(src, j); continue; }
        if (c === '`') { j = skipTemplate(src, j); continue; }
        if (c === '{') d++;
        else if (c === '}') d--;
        j++;
      }
      continue;
    }
    j++;
  }
  return j;
}
function walk(src, i) {
  let j = i, depth = 0;
  while (j < src.length) {
    const c = src[j];
    if (c === "'" || c === '"') { j = skipQuote(src, j); continue; }
    if (c === '`') { j = skipTemplate(src, j); continue; }
    if (c === '/' && src[j + 1] === '/') { const e = src.indexOf('\n', j); j = e < 0 ? src.length : e; continue; }
    if (c === '/' && src[j + 1] === '*') { const e = src.indexOf('*/', j); j = e < 0 ? src.length : e + 2; continue; }
    if (c === '(' || c === '[' || c === '{') { depth++; j++; continue; }
    if (c === ')' || c === ']' || c === '}') {
      depth--; j++;
      if (depth === 0 && (c === '}' || c === ']')) return src.slice(i, j);
      continue;
    }
    if (c === ';' && depth === 0) return src.slice(i, j + 1);
    j++;
  }
  return src.slice(i, j);
}
function grab(startsWith) {
  const i = SRC.indexOf(startsWith);
  if (i < 0) throw new Error('not found in app.js: ' + startsWith);
  return walk(SRC, i);
}

const parts = [
  grab('const weekDecided='),
  grab('const weekScored='),
  grab('function weeksOf(schedule){'),
  grab('function weekOver(byWeek,w){'),
  grab('function weeksOverCount(schedule){'),
  grab('function liveWeekInfo(){'),
  grab('function bucksWeeksPlayed(season){'),
  grab('function ntLastWeek(season){'),
  grab('function bkWeek(){'),
  grab('const bkKey=()=>{'),
  grab('const pkKey=()=>{'),
  grab('function ntResultsDay(t){'),
  grab('function motwStamp(t){'),
  grab('const motwInfo='),
  grab('const motwWeek='),
  grab('const motwPickKey='),
  grab('const motwWeekKey='),
  grab("const MOTW_PICKER='bft';"),
  grab('function motwSeasonStarted(){'),
  grab('function motwChosen(){'),
  grab('function tradeVoteHeldOpen(id){'),
  grab('function tradeVoteOpen(season,when,id){'),
  grab('function punishWeek(){'),
  grab('function punishName(){'),
];

const api = new Function(`
let _seasonMeta={}, ALL_SEASONS=[], _liveInfo=null, _cpRows=[];
let _CFG={ ballKnowledge:{} };
/* THE CLOCK, MOVEABLE. The vote rule asks what day it is, so the suite has to
   be able to say. A stand-in for Date that behaves the same in every way the
   lifted code uses it, with now() answering whatever the case has set. */
const RealDate=globalThis.Date;
let _NOW=0;
function Date(...a){ return a.length?new RealDate(...a):new RealDate(_NOW||RealDate.now()); }
Date.now=()=>_NOW||RealDate.now();
/* the nav's year control, which has no DOM here — every case below is about the
   live season anyway, which is the one these keys are built from */
const getSeason=()=>ALL_SEASONS[ALL_SEASONS.length-1];
const bkLeagueSeason=()=>ALL_SEASONS[ALL_SEASONS.length-1];
${parts.join('\n')}
return {
  set(meta, all){ _seasonMeta=meta; ALL_SEASONS=all; _liveInfo=null; },
  setPicker(rows){ _cpRows=rows; },
  setCfg(c){ _CFG=Object.assign({ballKnowledge:{}},c||{}); },
  setNow(t){ _NOW=t||0; },
  weekOver, weeksOf, weeksOverCount, weekDecided, weekScored,
  liveWeekInfo, bucksWeeksPlayed, ntLastWeek, ntResultsDay,
  bkKey, pkKey, motwWeekKey, motwChosen, motwSeasonStarted,
  tradeVoteOpen, tradeVoteHeldOpen, punishWeek, punishName,
};`)();

let pass = 0, fail = 0;
const eq = (n, g, w) => {
  const a = JSON.stringify(g), b = JSON.stringify(w);
  if (a === b) { pass++; console.log('  ok   ' + n); }
  else { fail++; console.log('  FAIL ' + n + '\n         got  ' + a + '\n         want ' + b); }
};

/* one fixture. `pts` puts points on the board; `win` closes it. */
const fx = (w, tid, pts = 0, win = 'UNDECIDED') => ({
  matchupPeriodId: w, winner: win,
  home: { teamId: tid, totalPoints: pts }, away: { teamId: tid + 100, totalPoints: pts ? pts - 12 : 0 },
});
/* a week of six, in one of the states a real week passes through */
const WEEK = {
  unplayed:  w => [1, 2, 3, 4, 5, 6].map(g => fx(w, g)),
  kickoff:   w => [1, 2, 3, 4, 5, 6].map(g => fx(w, g, g <= 2 ? 90 + g : 0)),
  sunday:    w => [1, 2, 3, 4, 5, 6].map(g => fx(w, g, 90 + g)),
  closed:    w => [1, 2, 3, 4, 5, 6].map(g => fx(w, g, 90 + g, g % 5 ? 'HOME' : 'AWAY')),
};
const sched = (...weeks) => weeks.flat();
const by = (...weeks) => api.weeksOf(sched(...weeks));

/* ────────────────────────────────────────────────────────────────────────── */
console.log('\n1. what "the week is over" means');
{
  eq('a week that is not there is not over',        api.weekOver(by(WEEK.unplayed(1)), 2), false);
  eq('published, nothing played',                   api.weekOver(by(WEEK.unplayed(1)), 1), false);
  eq('Wednesday night: two fixtures scoring',       api.weekOver(by(WEEK.kickoff(1)), 1), false);
  /* THE ONE THIS EXISTS FOR. Ten past one on the Sunday: every fixture has
     somebody on the board, and two thirds of the week is still to be played. */
  eq('Sunday lunchtime: all six scoring, none closed', api.weekOver(by(WEEK.sunday(1)), 1), false);
  eq('Tuesday: ESPN has closed it',                 api.weekOver(by(WEEK.closed(1)), 1), true);

  const mixed = WEEK.closed(1); mixed[3] = fx(1, 4, 96);
  eq('five closed and one not is not closed',       api.weekOver(by(mixed), 1), false);

  const tie = WEEK.closed(1).map(m => ({ ...m, winner: 'TIE' }));
  eq('a tie is a decided fixture',                  api.weekOver(by(tie), 1), true);
  const lower = WEEK.closed(1).map(m => ({ ...m, winner: 'home' }));
  eq('and the flag is not read case-sensitively',   api.weekOver(by(lower), 1), true);

  const noPts = WEEK.unplayed(1).map(m => ({ ...m, winner: 'HOME' }));
  eq('closed with nobody scoring still counts',     api.weekOver(by(noPts), 1), true);
}

console.log('\n2. the release valve, for a flag that never lands');
{
  /* Every fixture scored, ESPN never closed it, and the following week has
     started scoring. Football has moved on; that is proof enough. */
  eq('all scored, undecided, next week scoring',
     api.weekOver(by(WEEK.sunday(1), WEEK.sunday(2)), 1), true);
  eq('but the week that is actually being played is not over',
     api.weekOver(by(WEEK.sunday(1), WEEK.sunday(2)), 2), false);
  eq('an EARLIER week scoring proves nothing',
     api.weekOver(by(WEEK.closed(1), WEEK.sunday(2)), 2), false);
  eq('the valve still needs every fixture scored',
     api.weekOver(by(WEEK.kickoff(1), WEEK.sunday(2)), 1), false);
  /* This is what stops it firing early: while week one is being played there
     are no points anywhere in week two. */
  eq('a later week with no points does not open it',
     api.weekOver(by(WEEK.sunday(1), WEEK.unplayed(2)), 1), false);
}

console.log('\n3. counting the weeks that are finished');
{
  eq('nothing played',        api.weeksOverCount(sched(WEEK.unplayed(1), WEEK.unplayed(2))), 0);
  eq('week 1 still running',  api.weeksOverCount(sched(WEEK.sunday(1), WEEK.unplayed(2))), 0);
  eq('week 1 closed',         api.weeksOverCount(sched(WEEK.closed(1), WEEK.unplayed(2))), 1);
  eq('week 2 under way',      api.weeksOverCount(sched(WEEK.closed(1), WEEK.sunday(2))), 1);
  eq('both closed',           api.weeksOverCount(sched(WEEK.closed(1), WEEK.closed(2))), 2);
  /* A REAL hole stalls the count rather than being stepped over, and this gates
     money: a week with a fixture that never scored and was never closed is a
     week we do not know the truth about, so nothing after it is counted. */
  eq('a hole in the middle stalls it',
     api.weeksOverCount(sched(WEEK.closed(1), WEEK.closed(2), WEEK.kickoff(3), WEEK.closed(4))), 2);
  /* A middle week that is fully scored but never closed is NOT a hole — the
     weeks either side of it are proof it finished. The valve carries it, and
     the count goes past. */
  eq('but a week ESPN forgot to close is carried',
     api.weeksOverCount(sched(WEEK.closed(1), WEEK.sunday(2), WEEK.closed(3))), 3);
}

/* ────────────────────────────────────────────────────────────────────────── */
console.log('\n4. week one, hour by hour');
{
  const at = (...weeks) => {
    const rest = [];
    for (let w = weeks.length + 1; w <= 14; w++) rest.push(WEEK.unplayed(w));
    api.set({ 2026: { schedule: sched(...weeks, ...rest), regEnd: 14, owners: {} } }, ['2026']);
    return api;
  };
  const state = () => ({
    live: api.liveWeekInfo().week,
    weeks: api.bucksWeeksPlayed('2026'),
    read: api.ntLastWeek('2026') ? api.ntLastWeek('2026').week : null,
    bk: api.bkKey(), pk: api.pkKey(),
  });

  at(WEEK.unplayed(1));
  eq('the pre-season', state(), { live: 1, weeks: 0, read: null, bk: 'bk_2026_w1', pk: 'pk_2026_w1' });

  at(WEEK.kickoff(1));
  eq('Wednesday night', state(), { live: 1, weeks: 0, read: null, bk: 'bk_2026_w1', pk: 'pk_2026_w1' });

  /* Before this change every line here read 2 — a new set of questions and a
     fresh picks slate handed out at ten past one on the Sunday, an allowance
     paid, and the week's blowout cards posted off a third of a week. */
  at(WEEK.sunday(1));
  eq('Sunday lunchtime', state(), { live: 1, weeks: 0, read: null, bk: 'bk_2026_w1', pk: 'pk_2026_w1' });

  at(WEEK.closed(1));
  eq('Tuesday, once ESPN closes it',
     state(), { live: 2, weeks: 1, read: 1, bk: 'bk_2026_w2', pk: 'pk_2026_w2' });

  at(WEEK.closed(1), WEEK.sunday(2));
  eq('and week two behaves the same way',
     state(), { live: 2, weeks: 1, read: 1, bk: 'bk_2026_w2', pk: 'pk_2026_w2' });
}

console.log("\n5. the Matchup of the Week holds for as long as the week does");
{
  const picker = wk => ([{ id: 'bft', ['motwwk_2026_w' + wk]: '10-7', motw_2026_t20260825: '10-7' }]);
  const at = weeks => {
    const all = [...weeks];
    for (let w = all.length + 1; w <= 14; w++) all.push(WEEK.unplayed(w));
    api.set({ 2026: { schedule: sched(...all), regEnd: 14, owners: {} } }, ['2026']);
  };
  api.setPicker(picker(1));

  at([WEEK.unplayed(1)]);
  eq('the pick made in the pre-season stands',   api.motwChosen(), [10, 7]);
  at([WEEK.sunday(1)]);
  eq('and stands all through the Sunday',        api.motwChosen(), [10, 7]);
  at([WEEK.closed(1)]);
  eq('once the week closes, a new one is due',   api.motwChosen(), null);

  api.setPicker(picker(2));
  eq('and the week-two pick reads back',         api.motwChosen(), [10, 7]);

  /* A profile carrying only the old Tuesday stamp still reads, which is what
     keeps a pick made before the week key existed. */
  api.setPicker([{ id: 'bft', motw_2026_t20260825: '4-9' }]);
  at([WEEK.unplayed(1)]);
  eq('a stamp-only profile still reads',         api.motwChosen(), [4, 9]);
}

console.log("\n6. a trade's vote waits for football, not for a Tuesday");
{
  /* The first trade of 2026 was agreed on Sunday 30 August. The calendar week
     it belongs to ended at midnight on Tuesday 1 September, with five managers
     still to answer and the season nine days away — so under the old rule the
     card vanished off their stacks on a morning when nothing had been played,
     nothing read out and nobody had a reason to open the site. */
  const D = (y, m, d, h = 12) => new Date(y, m - 1, d, h, 0, 0).getTime();
  const AGREED = D(2026, 8, 30, 16);
  const ID = 'td:2026:2-3:1788102664091';
  const at = (weeks, when) => {
    const all = [...weeks];
    for (let w = all.length + 1; w <= 14; w++) all.push(WEEK.unplayed(w));
    api.set({ 2026: { schedule: sched(...all), regEnd: 14, owners: {} } }, ['2026']);
    api.setNow(when);
    return api.tradeVoteOpen('2026', AGREED, ID);
  };
  api.setCfg({});

  eq('the day it was agreed',            at([WEEK.unplayed(1)], D(2026, 8, 30, 18)), true);
  eq('Tuesday 1 Sep, nothing played',    at([WEEK.unplayed(1)], D(2026, 9, 1, 6)), true);
  eq('Sunday 13 Sep, week one running',  at([WEEK.sunday(1)], D(2026, 9, 13, 13)), true);
  eq('Monday 14 Sep, still running',     at([WEEK.sunday(1)], D(2026, 9, 14, 23)), true);
  /* and it closes when a week of football has actually been played */
  eq('Tuesday 15 Sep, week one closed',  at([WEEK.closed(1)], D(2026, 9, 15, 9)), false);

  /* AND THE NORMAL WEEK STILL WORKS. A trade agreed mid-season runs to the
     following Tuesday and no further — the football rule only ever holds the
     clock before it starts, it does not slow it down once it is going. */
  const inSeason = D(2026, 9, 17, 14);           // Thursday of week 2
  const at2 = when => {
    api.set({ 2026: { schedule: sched(WEEK.closed(1), WEEK.unplayed(2),
      ...Array.from({ length: 12 }, (_, i) => WEEK.unplayed(i + 3))), regEnd: 14, owners: {} } }, ['2026']);
    api.setNow(when);
    return api.tradeVoteOpen('2026', inSeason, 'td:2026:5-6:999');
  };
  eq('agreed Thursday, open that day',   at2(D(2026, 9, 17, 15)), true);
  eq('open on the Monday',               at2(D(2026, 9, 21, 23)), true);
  eq('closed on the Tuesday',            at2(D(2026, 9, 22, 0)), false);

  /* the manual hatch still overrides both */
  api.setCfg({ tradeVoteExtend: { 'td:2026:5-6:999': '2026-09-29' } });
  eq('config can hold one open past that', at2(D(2026, 9, 22, 9)), true);
  eq('and it closes on the named day',     at2(D(2026, 9, 29, 0)), false);
  api.setCfg({});
  api.setNow(0);
}

console.log('\n7. the punishment advances with the football');
{
  /* It used to be a hand-set field, with the fourteen-week schedule sitting
     three lines below it in the same config object — so the bar, the homepage
     card and the Punishments tab all read "Week 1 · Fruit Pledge" and would
     have gone on reading it into October. */
  const SCHEDULE = { 1: 'Fruit Pledge', 2: 'Franchise Rebrand', 3: 'The Re-enactment',
                     4: 'Fruit Pledge', 5: 'Beer Pour' };
  const at = (weeks, cfg) => {
    const all = [...weeks];
    for (let w = all.length + 1; w <= 14; w++) all.push(WEEK.unplayed(w));
    api.set({ 2026: { schedule: sched(...all), regEnd: 14, owners: {} } }, ['2026']);
    api.setCfg({ punishment: Object.assign({ schedule: SCHEDULE }, cfg || {}) });
    return [api.punishWeek(), api.punishName()];
  };

  eq('the pre-season',            at([WEEK.unplayed(1)]), [1, 'Fruit Pledge']);
  eq('Wednesday night kickoff',   at([WEEK.kickoff(1)]), [1, 'Fruit Pledge']);
  /* the whole point: it does not turn over on the Sunday, halfway through the
     week whose low scorer is still being decided */
  eq('Sunday lunchtime, week one running', at([WEEK.sunday(1)]), [1, 'Fruit Pledge']);
  eq('once ESPN closes week one', at([WEEK.closed(1)]), [2, 'Franchise Rebrand']);
  eq('and on through week two',   at([WEEK.closed(1), WEEK.sunday(2)]), [2, 'Franchise Rebrand']);
  eq('week three',                at([WEEK.closed(1), WEEK.closed(2)]), [3, 'The Re-enactment']);

  /* the overrides, for a week the league pins or swaps */
  eq('a pinned week wins',        at([WEEK.closed(1)], { week: 1 }), [1, 'Fruit Pledge']);
  eq('a pinned name wins',        at([WEEK.closed(1)], { name: 'Hot & Spicy' }), [2, 'Hot & Spicy']);
  eq('and both together',         at([WEEK.closed(1)], { week: 9, name: 'Beer Pour' }), [9, 'Beer Pour']);
  eq('null is not a pin',         at([WEEK.closed(1)], { week: null, name: null }), [2, 'Franchise Rebrand']);
  /* a week past the end of the schedule names no punishment rather than the
     wrong one — the fourteen are the fourteen */
  eq('past the schedule',         at(Array.from({ length: 14 }, (_, i) => WEEK.closed(i + 1))), [14, '']);
}

/* ────────────────────────────────────────────────────────────────────────── */
console.log('\n8. the archive scripts say the same thing as the app');
{
  /* Five cron jobs freeze things into the repo on the strength of "that week is
     over", and each carries its own copy of the rule because they run alone.
     A copy that drifts would quietly archive half a Sunday for good, so the
     copies are run against the same matrix here. */
  const FILES = ['archive-charts.mjs', 'archive-poll.mjs', 'archive-week.mjs',
                 'archive-trades.mjs', 'archive-season.mjs'];
  const cases = [
    ['unplayed',           by(WEEK.unplayed(1)), 1],
    ['kickoff',            by(WEEK.kickoff(1)), 1],
    ['sunday',             by(WEEK.sunday(1)), 1],
    ['closed',             by(WEEK.closed(1)), 1],
    ['valve open',         by(WEEK.sunday(1), WEEK.sunday(2)), 1],
    ['valve shut',         by(WEEK.sunday(1), WEEK.unplayed(2)), 1],
    ['week being played',  by(WEEK.closed(1), WEEK.sunday(2)), 2],
    ['absent',             by(WEEK.closed(1)), 9],
  ];
  const want = cases.map(([, b, w]) => api.weekOver(b, w));

  for (const f of FILES) {
    const src = fs.readFileSync(path.join(__dirname, f), 'utf8').split(String.fromCharCode(13)).join('');
    const i = src.indexOf('const wkDecided =');
    if (i < 0) { fail++; console.log('  FAIL ' + f + ' has no copy of the rule'); continue; }
    const j = src.indexOf('function weekOver(byWeek, w) {', i);
    if (j < 0) { fail++; console.log('  FAIL ' + f + ' has no weekOver'); continue; }
    const copy = src.slice(i, j) + walk(src, j);
    const fn = new Function(copy + '\nreturn weekOver;')();
    const got = cases.map(([, b, w]) => fn(b, w));
    eq(f + ' agrees on all ' + cases.length + ' cases', got, want);
  }
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
