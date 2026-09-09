/* WHEN A NOTIFICATION IS ALLOWED TO BE NEWS.
 *
 * The three generators that report football -- the standings, the blowouts and
 * rivalries out of the week, and the streaks -- key off ntSeason(), which
 * answers with the newest season that has points on the board. From January
 * until the first Sunday in September that is LAST season. All three then date
 * their cards with ntResultsDay(Date.now()): the most recent Tuesday relative
 * to NOW, not the Tuesday of the week being described.
 *
 * So for eight months of the year the homepage carried last season's week 17 --
 * final standings, its blowouts, a losing streak that ended in January -- dated
 * to this week, and re-dated to every Tuesday as each came round.
 *
 * These lift with almost none of their dependencies on purpose. The guard is
 * the first line of each, so when it stops them nothing else runs and no stub
 * is needed; and when it lets them through they reach a helper that is not
 * there and throw. A clean return proves the guard held. A throw proves it did
 * not -- which is exactly the pair of outcomes worth telling apart.
 */
import { lifter, assemble } from './lib/lift.mjs';

const grab = lifter(new URL('../public/app.js', import.meta.url));

const api = assemble(grab, [
  'function ntResultsAreCurrent(){',
  'function ntStandings(out){',
  'function ntFromWeek(out){',
  'function ntStreaks(out){',
], ['ntResultsAreCurrent', 'ntStandings', 'ntFromWeek', 'ntStreaks', 'setSeasons'], `
let _played='2025', _playing='2026';
const setSeasons=(a,b)=>{ _played=a; _playing=b; };
const ntSeason=()=>_played;
const sbBoardSeason=()=>_playing;
`);

let pass = 0, fail = 0;
const nl = String.fromCharCode(10);
function ok(name, cond, detail) {
  console.log((cond ? '  PASS  ' : '  FAIL  ') + name);
  if (!cond) { if (detail !== undefined) console.log('        ' + detail); fail++; } else pass++;
}

/* runs a generator and says whether it returned without doing anything */
function silent(fn) {
  const out = [];
  try { fn(out); } catch (e) { return { quiet: false, threw: String(e.message || e).slice(0, 60) }; }
  return { quiet: out.length === 0, threw: null };
}

console.log('1. THE GUARD ITSELF');
{
  api.setSeasons('2026', '2026');
  ok('mid-season, the results are current', api.ntResultsAreCurrent() === true);

  api.setSeasons('2025', '2026');
  ok('before week 1, last season is not news', api.ntResultsAreCurrent() === false);

  api.setSeasons('2026', '2027');
  ok('and in the following off-season it is not either', api.ntResultsAreCurrent() === false);

  api.setSeasons('', '2026');
  ok('no season played at all is not current', api.ntResultsAreCurrent() === false);
}

console.log(nl + '2. WHAT THE THREE GENERATORS DO WITH IT');
{
  /* the state the league is actually in today: 2025 is the newest season with
     points, 2026 is the one about to be played */
  api.setSeasons('2025', '2026');
  const gens = [['standings', api.ntStandings], ['blowouts and rivalries', api.ntFromWeek],
                ['streaks', api.ntStreaks]];
  gens.forEach(([name, fn]) => {
    const r = silent(fn);
    ok('preseason: ' + name + ' says nothing', r.quiet && !r.threw,
       r.threw ? 'threw instead of returning: ' + r.threw : 'produced cards');
  });

  /* and they are not simply dead -- with the seasons lined up each one goes
     past the guard and on into work it has no stubs for */
  api.setSeasons('2026', '2026');
  gens.forEach(([name, fn]) => {
    const r = silent(fn);
    ok('in season: ' + name + ' gets past the guard', !!r.threw,
       r.threw ? null : 'returned quietly, so the guard may be stopping it always');
  });
}

console.log(nl + '3. IT CANNOT BE THE THING THAT BREAKS THE FEED');
{
  /* the guard is wrapped: if either season lookup throws, it answers true and
     the generators behave exactly as they did before it existed */
  const risky = assemble(grab, ['function ntResultsAreCurrent(){'], ['ntResultsAreCurrent'], `
    const ntSeason=()=>{ throw new Error('boom'); };
    const sbBoardSeason=()=>'2026';
  `);
  ok('a lookup that throws falls back to letting them through',
     risky.ntResultsAreCurrent() === true);
}

console.log(nl + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
