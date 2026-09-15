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
  'const cpWeek=', 'const cpKeyFor=', 'const cpKey=', 'function cpSeedBallot(row){',
], ['cpKey', 'cpKeyFor', 'cpWeek', 'cpSeedBallot', 'setWeek'],
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

/* ── the seed ─────────────────────────────────────────────────────────────── */
head("this week opens on last week's order");
M.setWeek(3);
const row = { 'cp_2026': JSON.stringify([1, 2, 3]), 'cp_2026_w2': JSON.stringify([3, 2, 1]) };
ok('it reaches back to the most recent week', M.cpSeedBallot(row), [3, 2, 1]);

head('and keeps reaching back past a week nobody voted in');
ok('skipping week 2, it finds week 1', M.cpSeedBallot({ 'cp_2026': JSON.stringify([9, 8]) }), [9, 8]);

head('a manager with no history gets nothing to start from');
ok('no row', M.cpSeedBallot(null), null);
ok('empty row', M.cpSeedBallot({}), null);
ok('a malformed ballot is not a seed', M.cpSeedBallot({ 'cp_2026': 'not json' }), null);
ok('nor is an empty array', M.cpSeedBallot({ 'cp_2026': '[]' }), null);

head('the seed never reads THIS week, only earlier ones');
M.setWeek(2);
ok('week 2 does not seed from week 2',
  M.cpSeedBallot({ 'cp_2026_w2': JSON.stringify([7, 7]) }), null);

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
