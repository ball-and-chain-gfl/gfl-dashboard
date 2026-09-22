/* A SIDE THAT HAS SCORED DOES NOT UN-SCORE.
 *
 * Week 1 went into the archive with seven readings that crater a matchup to
 * 0-0 and back — one per fixture, every one at a time when no NFL game was on
 * the field. They are not scores. They are what liveSideScore returns when the
 * roster payload carried no scoring at all: an empty response, or one answered
 * for the wrong scoring period. It sums to 0, the recorder sees a score that
 * "moved", and writes it down as news.
 *
 * The trap this suite exists to stop anyone falling into: the obvious fix is to
 * make the series monotonic, and that is WRONG. Fantasy scores fall during play
 * constantly — a defence drops a tier every time it lets another touchdown in,
 * an interception is minus two. 197 of week 1's 625 readings go backwards and
 * almost all of them are real football. Refusing them would flatten every
 * defence's evening into a staircase that only ever climbs.
 *
 * So the line is not "never fall". It is "never fall to nothing".
 *
 * Run: node scripts/test-livenote.mjs
 */
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
const M = assemble(grab, ['function liveRowDecided(r){',
  'function liveNote(arr,t,a,b,p,la,lb,fa,fb){'], ['liveNote', 'liveRowDecided']);

const scores = arr => arr.map(r => [r[1], r[2]]);

/* ── the craters ──────────────────────────────────────────────────────────── */
head('a matchup with points on it never drops to nothing');
let s = [];
M.liveNote(s, 100, 55.46, 137.16);
ok('the real reading lands', scores(s), [[55.46, 137.16]]);
ok('the empty payload is refused', M.liveNote(s, 105, 0, 0), false);
ok('and leaves no row behind', scores(s), [[55.46, 137.16]]);

head('one side emptying is enough to refuse the whole reading');
ok('side A gone', M.liveNote(s, 110, 0, 137.16), false);
ok('side B gone', M.liveNote(s, 115, 55.46, 0), false);
ok('nothing was written', s.length, 1);

/* ── the football ─────────────────────────────────────────────────────────── */
head('a score that genuinely falls is still football');
s = [];
M.liveNote(s, 100, 10, 12.68);
ok('a defence bleeding a tier is kept', M.liveNote(s, 105, 10, 10.68), true);
ok('and again', M.liveNote(s, 110, 10, 8.68), true);
ok('an interception too', M.liveNote(s, 115, 8, 8.68), true);
ok('all four readings are there', s.length, 4);
ok('with the falls intact', scores(s), [[10, 12.68], [10, 10.68], [10, 8.68], [8, 8.68]]);

head('the real week 1 sequence that must survive');
/* 0418AE68's Thursday: a defence going 9, 10, 9, 11, 8, 7, 5, 8, 5, 1 as the
   opponent kept scoring. Every one of these reads as "backwards" and every one
   of them happened. */
s = [];
let t = 100;
const real = [9, 10, 9, 11, 8, 7, 5, 8, 5, 1];
real.forEach(v => { M.liveNote(s, t, 9.82, v); t += 5; });
ok('every one is kept', s.length, real.length);
ok('including the drop to 1', s[s.length - 1][2], 1);

/* ── a week that has not started ──────────────────────────────────────────── */
head('0-0 before anybody has scored is a real reading');
s = [];
ok('the first reading of a week', M.liveNote(s, 100, 0, 0), true);
/* A NEW BUCKET IS ALWAYS APPENDED, even carrying the same pair. Whether a
   quiet minute deserves a point is the CALLER's question -- livePoll asks it
   as "is anybody on the field, or did the score move" -- and this function
   deliberately does not second-guess that. */
ok('a second scoreless bucket is still the caller\'s call', M.liveNote(s, 105, 0, 0), true);
ok('one side opening the scoring', M.liveNote(s, 110, 0, 6), true);
ok('the other still on nothing is fine', s[s.length - 1][1], 0);
ok('and now that side may still sit on zero', M.liveNote(s, 115, 0, 12), true);

head('but once it has scored, zero is refused');
ok('side A has points now', M.liveNote(s, 120, 7, 12), true);
ok('so A at zero is not believed', M.liveNote(s, 125, 0, 12), false);

/* ── the guard must not eat the in-bucket update path ─────────────────────── */
head('within one bucket the reading still sharpens');
s = [];
M.liveNote(s, 200, 10, 20, 0.5);
ok('a higher score in the same bucket replaces it', M.liveNote(s, 200, 12, 20, 0.5), true);
ok('the row moved rather than a new one appearing', s.length, 1);
ok('to the higher pair', scores(s), [[12, 20]]);
ok('a changed probability alone still counts', M.liveNote(s, 200, 12, 20, 0.7), true);
ok('still one row', s.length, 1);

head('and an older bucket is never appended behind a newer one');
ok('a stale reading is refused', M.liveNote(s, 150, 12, 20, 0.7), false);

/* ── the dead tail ──────────────────────────────────────────────────────────
   A matchup whose LOSING side has nothing left to play is over, and week 2 was
   still writing readings into one for another two hours and ten minutes while
   nothing but the decay moved. Everything below is about where that line sits.

   The row carries both models' estimate of what is still to come -- the usage
   model at 4/5 and the old projection-by-clock one at 6/7 -- and the verdict
   takes the GENEROUS of the two, so one model calling it early cannot end a
   matchup the other thinks is still alive. */
head('the row knows when it is over');
const row = (a, b, la, lb, fa, fb) => [1, a, b, 0.5, la, lb, fa, fb];
ok('the loser has nothing left', M.liveRowDecided(row(96.32, 127.08, 0, 3.13, 0, 5.7)), true);
ok('the other way round too', M.liveRowDecided(row(127.08, 96.32, 3.13, 0, 5.7, 0)), true);

head('but a side that finishes AHEAD has decided nothing');
/* this is the half of Sunday night worth watching: they are done, the other
   one is still playing, and the graph has to keep drawing the chase */
ok('leader done, chaser still on the field',
  M.liveRowDecided(row(127.08, 96.32, 0, 20.72, 0, 31.4)), false);
ok('level with one side done', M.liveRowDecided(row(100, 100, 0, 5, 0, 8)), false);

head('and one model alone cannot end it');
ok('usage says nothing left, the old model disagrees',
  M.liveRowDecided(row(96.32, 127.08, 0, 3.13, 4.2, 5.7)), false);
ok('both at zero is the only zero that counts',
  M.liveRowDecided(row(96.32, 127.08, 0, 3.13, 0, 5.7)), true);

head('a row that never carried the models says nothing');
ok('scores only', M.liveRowDecided([1, 96.32, 127.08]), false);
ok('scores and a probability', M.liveRowDecided([1, 96.32, 127.08, 0.01]), false);
ok('nulls where the numbers go', M.liveRowDecided([1, 96.32, 127.08, 0.01, null, null]), false);
ok('no row at all', M.liveRowDecided(undefined), false);

head('once it is settled the recorder stops');
s = [];
ok('the deciding reading is kept', M.liveNote(s, 300, 96.32, 127.08, 0.01, 0, 3.13, 0, 5.7), true);
ok('it is on the graph', s.length, 1);
ok('the next minute is refused', M.liveNote(s, 305, 96.32, 127.08, null, 0, 2.9, 0, 5.2), false);
ok('and the one after that', M.liveNote(s, 310, 96.32, 127.08, null, 0, 0.04, 0, 0.11), false);
ok('the leader running it up changes nothing',
  M.liveNote(s, 315, 96.32, 147.92, null, 0, 0, 0, 0), false);
ok('still the one row', s.length, 1);
ok('showing the score that settled it', scores(s), [[96.32, 127.08]]);

head('a matchup still alive is recorded as it always was');
s = [];
ok('the chase is on', M.liveNote(s, 400, 127.08, 96.32, 0.9, 0, 20.72, 0, 31.4), true);
ok('and keeps being drawn', M.liveNote(s, 405, 127.08, 110.5, 0.7, 0, 12.1, 0, 18.2), true);
/* the lead change IS the settling moment: A finished on 127.08 and the moment
   the chaser goes past it there is nothing A can do about it */
ok('right up to the lead change', M.liveNote(s, 410, 127.08, 131.2, 0.2, 0, 8, 0, 11), true);
ok('which is where it settles', M.liveNote(s, 415, 127.08, 147.92, 0.01, 0, 0, 0, 0), false);
ok('and it stays settled', M.liveNote(s, 420, 127.08, 147.92, null, 0, 0, 0, 0), false);
ok('three readings and no more', s.length, 3);
ok('the last one is the lead change', scores(s).pop(), [127.08, 131.2]);

console.log(NL + (fail ? 'FAILED  ' : 'ok  ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
