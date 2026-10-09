import fs from 'fs';
/* WHEN A RESULT IS STILL NEWS.
 *
 * The three generators that report football -- the standings, the blowouts and
 * rivalries out of the week, and the streaks -- key off ntSeason(), which
 * answers with the newest season that has POINTS on the board. From January
 * until the first Sunday in September that is LAST season.
 *
 * All three then dated their cards with ntResultsDay(Date.now()): the most
 * recent Tuesday relative to NOW rather than the Tuesday of the week being
 * described. So for eight months of the year the homepage carried last season's
 * week 17 -- final standings, its blowouts, a losing streak that ended in
 * January -- dated to this week, and re-dated to every Tuesday as each came
 * round.
 *
 * The card is dated by the week it is ABOUT now, and results stop being news
 * three weeks later.
 */
import { lifter, assemble } from './lib/lift.mjs';

const grab = lifter(new URL('../public/app.js', import.meta.url));

const api = assemble(grab, [
  'function ntWeekResultsDay(season,week){',
  'const NT_RESULTS_MAX=',
  'const ntResultsFresh=',
], ['ntWeekResultsDay', 'ntResultsFresh', 'NT_RESULTS_MAX']);

let pass = 0, fail = 0;
const nl = String.fromCharCode(10);
const DAY = 24 * 3600 * 1000;
function ok(name, cond, detail) {
  console.log((cond ? '  PASS  ' : '  FAIL  ') + name);
  if (!cond) { if (detail !== undefined) console.log('        ' + detail); fail++; } else pass++;
}
const iso = t => new Date(t).toISOString().slice(0, 10);

console.log('1. A WEEK IS DATED BY WHEN IT WAS PLAYED');
{
  const w1 = api.ntWeekResultsDay(2026, 1);
  const d = new Date(w1);
  ok('it lands on a Tuesday', d.getDay() === 2, iso(w1));
  ok('2026 week 1 is read in mid-September', iso(w1) === '2026-09-15', iso(w1));

  /* every week is one week further on, and never the same day as its neighbour */
  let stepsOk = true, prev = null;
  for (let w = 1; w <= 17; w++) {
    const t = api.ntWeekResultsDay(2026, w);
    if (prev != null && Math.round((t - prev) / DAY) !== 7) stepsOk = false;
    prev = t;
  }
  ok('and each week is exactly seven days after the last', stepsOk);

  const w17 = api.ntWeekResultsDay(2025, 17);
  ok('2025 week 17 lands in the new year, not in 2025', iso(w17) > '2025-12-25', iso(w17));
  ok('which is months before today', Date.now() - w17 > 200 * DAY, iso(w17));
  /* the anchor is the first Tuesday of September, so a season boundary must not
     put week 1 before the season starts */
  ok('week 1 is never in August', new Date(api.ntWeekResultsDay(2026, 1)).getMonth() === 8);
}

console.log(nl + '2. RESULTS STOP BEING NEWS');
{
  ok('this week is fresh', api.ntResultsFresh(2026, 1) === (Date.now() - api.ntWeekResultsDay(2026, 1) < api.NT_RESULTS_MAX));
  ok('last season week 17 is not', api.ntResultsFresh(2025, 17) === false);
  ok('nor is anything from 2022', api.ntResultsFresh(2022, 9) === false);
  ok('the window is three weeks', api.NT_RESULTS_MAX === 21 * DAY, api.NT_RESULTS_MAX);
  /* a week that has not happened yet reads as fresh -- it has to, or the card
     could never appear on the Tuesday it belongs to. What stops it being built
     early is the generators needing points on the board, not this. */
  ok('a week still to come is not stale', api.ntResultsFresh(2026, 17) === true);
}

console.log(nl + '3. THE BUG IT REPLACES, STATED AS A TEST');
{
  /* THE FIRST ATTEMPT compared the season played against the season being
     played and suppressed everything when they differed. That fixed the case in
     front of me and reopened every January: sbBoardSeason falls back to the
     newest season with a SCHEDULE, and next year's does not publish until the
     spring, so from January to May the two agree again and the stale cards come
     back. This is the case that guard could not see. */
  const w17 = api.ntWeekResultsDay(2026, 17);
  /* it finalises around the 5th of January, so it is legitimately still news
     for the rest of that month -- the window has to close after it, not on it */
  const midJan = new Date(2027, 0, 12).getTime();
  ok('a week after it landed, week 17 is still news',
     midJan - w17 < api.NT_RESULTS_MAX, Math.round((midJan - w17) / DAY) + ' days');
  /* and by the spring, when sbBoardSeason has fallen back to 2026 because
     2027's schedule has not published, it is long gone */
  const march = new Date(2027, 2, 15).getTime();
  ok('and by March -- the hole the season comparison left -- it is not',
     march - w17 > api.NT_RESULTS_MAX, Math.round((march - w17) / DAY) + ' days');
  /* and on the Tuesday it actually landed, it is news -- which the season
     comparison would also have got right, but only by accident */
  ok('and it is news on the day it landed',
     api.NT_RESULTS_MAX > 0 && (w17 + DAY) - w17 < api.NT_RESULTS_MAX);
}

/* ── NO LEAGUE TEXT IN AN HTML ATTRIBUTE ─────────────────────────────────────
 * The Submit button on a trade vote carried the team NAME through onclick as
 * ${JSON.stringify(label)} -- double quotes, inside an attribute that is itself
 * double quoted. The browser ended the attribute at the first one, the handler
 * became a fragment, and clicking Submit threw: no vote written, no card
 * cleared, no confirmation. It looked from the outside exactly like the feature
 * not existing, and it shipped because the button was never actually pressed in
 * testing -- only the states around it.
 *
 * Single quotes are no safer. Lebron's 3rd Leg is a real team in this league
 * and it breaks the other form. So the rule is the simple one: an inline
 * handler gets ids and numbers, never a name somebody chose.
 */
{
  console.log(nl + 'inline handlers carry no free text');
  const src = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  /* every on*= attribute written into a template, with what it interpolates */
  /* LINE BASED, not attribute based. An attribute regex stops at the first
     quote -- and the quote inside .replace(/"/g,...) is one, so it truncates
     the very expression under test and reports a safe line as unsafe. The
     handlers here are written one per source line, so the line is the honest
     unit. */
  const lines = src.split(String.fromCharCode(10)).map(l => l.replace(String.fromCharCode(13), ""));
  const handlerLines = lines.filter(l => /on[a-z]+="/.test(l));
  ok('app.js has inline handlers to check at all', handlerLines.length > 20, handlerLines.length);

  /* JSON.stringify into an attribute is allowed, but ONLY with the quotes
     entity-escaped on the way in -- selectPunish does exactly that and is fine.
     Without it the first quote ends the attribute, which is what happened here.
     So the rule is not "never stringify", it is "never emit a raw quote". */
  const raw = handlerLines.filter(l => l.includes('JSON.stringify(') && !l.includes('&quot;'));
  ok('any handler that stringifies into an attribute escapes its quotes',
     raw.length === 0, raw.map(l => l.trim()).slice(0, 3).join(' | '));
  /* and the safe one is still there, so this is a rule with teeth rather than
     a condition nothing in the file meets */
  ok('...and the one that does it correctly still counts',
     handlerLines.some(l => l.includes('JSON.stringify(') && l.includes('&quot;')));

  /* and the one that was broken takes an id and nothing else */
  const vsub = /onclick="ntVote\(([^"]*)\)"/.exec(src);
  ok('the vote submit handler is still in the source', !!vsub);
  if (vsub) {
    const args = vsub[1].split(',');
    ok('it takes exactly one argument', args.length === 1, vsub[1]);
    ok('and that argument is the sanitised vote id',
       /^'\$\{fieldSafe\}'$/.test(args[0].trim()), args[0]);
  }
}

console.log(nl + 'NO RIVALRY CARD');
{
  /* taken off the homepage at the league's request: no generator raises one,
     the preview has none, and the kind is gone from the registry */
  const src = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  ok('nothing raises a rivalry card', !/kind:\s*'rival'/.test(src));
  ok('and it has no icon or tone left to draw with', !/^\s*rival:\s*\{icon:/m.test(src));
}

console.log(nl + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
