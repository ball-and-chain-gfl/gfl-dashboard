/* A TRADE'S POINTS ARE COUNTED FROM THE WEEK IT HAPPENED, NOT FROM TODAY.
 *
 * The trades tab shows what each side's players went on to score since the
 * deal. For trades ESPN's weekly diff cannot see — anything agreed before the
 * first kickoff, when there are no weeks to diff — the reconstruction falls
 * back to the current roster, which knows who was traded and when.
 *
 * It did not know from WHEN to count. It used the league's CURRENT scoring
 * period, and that moves. An August trade read correctly for exactly one week;
 * on the Tuesday the league rolled to week 2 it started counting from week 2,
 * a week nobody had played, and reported 0.0 for all four players. Week 1's
 * points — which those players had genuinely banked for their new sides — were
 * dropped. It would have reset to zero again every Tuesday until January, with
 * the winner bar above it calling every deal dead even.
 *
 * The window now comes off the rosters: the first week each player appears on
 * the side that received him. Struck before the season, that is week 1, and it
 * is still week 1 in December.
 *
 * Run: node scripts/test-trade-window.mjs
 */
import fs from 'fs';

const SRC = fs.readFileSync(new URL('../api/espn.js', import.meta.url), 'utf8');

let pass = 0, fail = 0;
const ok = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; return; }
  fail++;
  console.log('  FAIL  ' + name + '\n          got  ' + g + '\n          want ' + w);
};
const head = t => console.log('\n' + t);

/* Lift the two arrows rather than restate them, the same way every other suite
   here lifts what it is checking: if they are renamed or reshaped this breaks
   loudly instead of testing a copy that has quietly drifted. */
/* One of these is a braced arrow and the other is a one-liner, so the walk
   stops at the first semicolon that is not inside a bracket of any kind rather
   than at a closing brace — a one-liner has none to find. */
function grab(startsWith) {
  const i = SRC.indexOf(startsWith);
  if (i < 0) throw new Error('cannot find "' + startsWith + '" in api/espn.js');
  let depth = 0;
  for (let j = i; j < SRC.length; j++) {
    const c = SRC[j];
    if (c === '{' || c === '(' || c === '[') depth++;
    else if (c === '}' || c === ')' || c === ']') depth--;
    else if (c === ';' && depth === 0) return SRC.slice(i, j + 1);
  }
  throw new Error('unterminated: ' + startsWith);
}

const build = (weeks, wk) => new Function('weeks', 'wk',
  grab('const firstWeekOn = (pid, tid) =>')
  + grab('const ptsFrom = (pid, from) =>')
  + 'return { firstWeekOn, ptsFrom };')(weeks, wk);

/* Four players. 100 and 101 were traded to team 2 before the season, so they
   are on it from week 1. 200 arrives at team 2 in week 4. */
const WEEKS = [1, 2, 3, 4, 5];
const WK = {
  1: { 100: { team: 2, pts: 12 }, 101: { team: 2, pts: 8 },  200: { team: 9, pts: 20 } },
  2: { 100: { team: 2, pts: 10 }, 101: { team: 2, pts: 4 },  200: { team: 9, pts: 15 } },
  3: { 100: { team: 2, pts: 6 },  101: { team: 2, pts: 11 }, 200: { team: 9, pts: 9 } },
  4: { 100: { team: 2, pts: 14 }, 101: { team: 2, pts: 0 },  200: { team: 2, pts: 7 } },
  5: { 100: { team: 2, pts: 5 },  101: { team: 2, pts: 9 },  200: { team: 2, pts: 13 } },
};
const M = build(WEEKS, WK);

head('a deal struck before the season counts from week 1');
ok('and it is week 1 whichever week it is read in', M.firstWeekOn(100, 2), 1);
ok('for both players in it', M.firstWeekOn(101, 2), 1);
ok('every week he has played counts', M.ptsFrom(100, M.firstWeekOn(100, 2)), 12 + 10 + 6 + 14 + 5);
ok('including a week he scored nothing', M.ptsFrom(101, M.firstWeekOn(101, 2)), 8 + 4 + 11 + 0 + 9);

head('a mid-season arrival counts from the week he arrived');
ok('week 4, not week 1', M.firstWeekOn(200, 2), 4);
ok('and none of what he scored for the side that sent him',
  M.ptsFrom(200, M.firstWeekOn(200, 2)), 7 + 13);

head('the window does not move as the season does');
/* THE BUG, stated as a test: this is what counting from the CURRENT scoring
   period did to a pre-season trade, week after week. */
const slid = [2, 3, 4, 5].map(cur => M.ptsFrom(100, cur));
ok('counting from today loses a week every Tuesday', slid,
  [10 + 6 + 14 + 5, 6 + 14 + 5, 14 + 5, 5]);
const fixed = [2, 3, 4, 5].map(() => M.ptsFrom(100, M.firstWeekOn(100, 2)));
ok('counting from the trade does not', fixed, [47, 47, 47, 47]);

head('a week not yet played adds nothing rather than erasing what is banked');
const M2 = build([1, 2], { 1: { 100: { team: 2, pts: 12 } }, 2: {} });
ok('week 2 empty, the week 1 points survive', M2.ptsFrom(100, M2.firstWeekOn(100, 2)), 12);
ok('counting from the unplayed week is what gave 0.0', M2.ptsFrom(100, 2), 0);

head('a player the rosters never show on that side');
ok('falls back to the first week rather than throwing', M.firstWeekOn(999, 2), 1);

/* ── the rule, at the source ─────────────────────────────────────────────── */
head('the handler no longer counts from the current scoring period');
const block = SRC.slice(SRC.indexOf('// THE WEEK A TRADE HAPPENED IN DOES NOT MOVE'),
                        SRC.indexOf('trades.sort((a, b)'));
ok('points come from firstWeekOn', /ptsFrom\(l\.pid, firstWeekOn\(l\.pid, tid\)\)/.test(block), true);
ok('the trade week comes from firstWeekOn too', /Math\.min\(\.\.\.legs\.map\(l => firstWeekOn/.test(block), true);
ok('nothing in it reads scoringPeriodId any more', /ld\.scoringPeriodId/.test(block), false);

console.log('\n' + (fail ? 'FAILED  ' : 'ok  ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
