/* THE COACHES' POLL IS A WEEKLY BALLOT, NOT A SEASON-LONG LIST.
 *
 * It used to be one field per manager per season, revised in place — so it was
 * the only card on the homepage that never came back, and the archive filed
 * whatever that field happened to say on a Tuesday morning as "that week's
 * poll" even when half the league had last touched it a fortnight before.
 *
 * Week 1 is the exception and has to stay one: those ballots predate the change
 * and are what week 1 was already archived from, so they keep the bare key.
 * Re-keying them would have asked twelve managers to vote again for a week that
 * was over.
 *
 * The app and scripts/archive-poll.mjs both derive the key, separately. If they
 * disagree, a Tuesday silently files nothing — so this holds them level.
 *
 * Run: node scripts/test-pollweek.mjs
 */
import fs from 'fs';
import { lifter, assemble } from './lib/lift.mjs';

const NL = String.fromCharCode(10);
let pass = 0, fail = 0;
const ok = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; return; }
  fail++;
  console.log('  FAIL  ' + name + NL + '          got  ' + g + NL + '          want ' + w);
};
const head = t => console.log(NL + t);

const grab = lifter(new URL('../public/app.js', import.meta.url));
const M = assemble(grab, [
  'const cpWeek=', 'const cpKeyFor=', 'const cpKey=',
], ['cpKey', 'cpKeyFor', 'cpWeek', 'setWeek'],
  ['let _liveInfo=null;', 'const getSeason=()=>2026;',
   'const setWeek=w=>{_liveInfo=w==null?null:{week:w};};'].join(NL));

head('the key carries the week');
M.setWeek(1);
ok('week 1 keeps the legacy field', M.cpKey(), 'cp_2026');
M.setWeek(2);
ok('week 2 gets its own', M.cpKey(), 'cp_2026_w2');
M.setWeek(14);
ok('and so does week 14', M.cpKey(), 'cp_2026_w14');

head('every week from 2 on is distinct');
const keys = [1, 2, 3, 4, 5].map(w => M.cpKeyFor(w));
ok('no two weeks share a field', new Set(keys).size, keys.length);

head('an unknown week falls back to week 1 rather than inventing a field');
M.setWeek(null);
ok('no live info', M.cpKey(), 'cp_2026');

/* ── no seed ──────────────────────────────────────────────────────────────
   Each week used to open pre-filled with last week's order. That armed the
   submit button the moment the card appeared: one tap sent last week's
   ranking verbatim and the poll counted it. The Tinglers did exactly that in
   week 2 -- a ballot byte-identical to their week 1 one -- and reported, quite
   reasonably, that they had never been given a chance to rank anybody.

   A new week opens blank now and all twelve are placed by hand.

   Plain string checks rather than patterns: every one of these is an exact
   line of source, and a regex here only adds a way to be wrong. */
head('nothing carries a previous week forward');
const SRC = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
ok('the seeding function is gone', SRC.includes('function cpSeedBallot'), false);
ok('and nothing calls it', SRC.includes('cpSeedBallot('), false);
ok('the name appears nowhere at all', SRC.includes('cpSeedBallot'), false);
ok('no draft is filled from an earlier key', SRC.includes('_cpBallot=seed'), false);

head('a ballot already sent for THIS week still follows the manager');
/* the one carry-over that stays: what you submitted this week should reach
   your other devices. It reads this week's key and no other. */
ok('cpMyBallot still adopts the server row for this week',
  SRC.includes('const srv=JSON.parse(row[cpKey()])'), true);

head('and a partial ballot cannot be sent');
/* this is what makes "fill in all twelve" a rule rather than a hope: with no
   seed the draft starts empty, and submit refuses until every slot is placed */
ok('submit refuses anything short of the full slate',
  SRC.includes('if(b.length!==_teams.length) return;'), true);

/* ── the two copies must agree ────────────────────────────────────────────── */
head('the archiver derives the same key');
const arch = fs.readFileSync(new URL('./archive-poll.mjs', import.meta.url), 'utf8');
ok('it has a week-aware key', /cpKeyFor\s*=\s*w\s*=>/.test(arch), true);
ok('week 1 is the bare field there too',
  /Number\(w\)\s*<=\s*1\s*\?\s*`cp_\$\{SEASON\}`/.test(arch), true);
ok('and later weeks carry _w', /cp_\$\{SEASON\}_w\$\{Number\(w\)\}/.test(arch), true);
ok('it reads the ballot through that key', /p\[cpKeyFor\(week\)\]/.test(arch), true);
ok('and no longer reads the season field directly',
  /p\[`cp_\$\{SEASON\}`\]/.test(arch), false);

/* ── the homepage card reopens ────────────────────────────────────────────── */
head('the homepage card is outstanding again each week');
const todo = grab('const HOME_TODO=');
ok('the poll card tests this week\'s key', /p\[cpKey\(\)\]/.test(todo), true);

console.log(NL + (fail ? 'FAILED  ' : 'ok  ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
