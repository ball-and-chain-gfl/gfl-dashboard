/* THE WEEK'S QUESTIONS COME BACK IN THE SAME ORDER EVERY TIME.
 *
 * Ball Knowledge answers are stored by INDEX — ans[0], ans[1] — so the order of
 * the set is part of the grading key. bkBuildWeek used to push each question as
 * it SUCCEEDED, across three passes, and a generator declines while its pool or
 * bios are still in the air. A kind that failed on pass one and built on pass
 * two landed behind kinds the seed had put after it: same five questions,
 * different order, depending only on which fetch came back first.
 *
 * That is the whole of the score moving between page loads. BFT's five stored
 * answers scored +3, then +2, then -1 inside an hour. Neither the answers nor
 * the data moved — the questions are about LAST season, which is frozen. Only
 * the order did.
 *
 * Run: node scripts/test-bkorder.mjs
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

/* Six generators. `slow` names the ones that decline on their first pass, which
   is exactly what a pool still in flight does. */
const PRELUDE = [
  'let SLOW=new Set();',
  'const setSlow=s=>{SLOW=new Set(s);};',
  'let SEEN={};',
  'const mk=name=>function(r,week){',
  '  SEEN[name]=(SEEN[name]||0)+1;',
  '  if(SLOW.has(name)&&SEEN[name]===1) return null;',
  '  return {kind:name,correct:name.length%4};',
  '};',
  'const BK_KINDS=[mk("a"),mk("b"),mk("c"),mk("d"),mk("e"),mk("f")];',
  'const reset=()=>{SEEN={};};',
].join(NL);

const M = assemble(grab, ['function bkRand(seed){', 'function bkShuffle(r,arr){',
  'function bkBuildWeek(season,week,n){'],
  ['bkBuildWeek', 'setSlow', 'reset'], PRELUDE);

const kinds = () => { M.reset(); return M.bkBuildWeek(2026, 1, 5).map(q => q.kind); };

head('with every generator ready, the set is the seeded order');
M.setSlow([]);
const base = kinds();
ok('five questions', base.length, 5);
ok('and it repeats exactly', kinds(), base);
ok('and again', kinds(), base);

head('a generator that declines once still lands where the seed put it');
for (const slow of [['a'], ['b'], ['c'], ['d'], ['e'], ['f'], ['a', 'c'], ['b', 'e', 'f']]) {
  M.setSlow(slow);
  const got = kinds();
  /* whatever built, it must be in the same relative order as the ready run */
  const want = base.filter(k => got.includes(k));
  const extra = got.filter(k => !base.includes(k));
  ok('slow=' + slow.join(',') + ' keeps the seeded order',
    got.filter(k => base.includes(k)), want);
  ok('slow=' + slow.join(',') + ' still returns five', got.length, 5);
  if (extra.length) ok('slow=' + slow.join(',') + ' fills from the back of the order',
    extra.length <= 1, true);
}

head('the same five kinds always produce the same five INDEXES');
M.setSlow([]);
const ready = kinds();
M.setSlow(['a', 'b', 'c']);
const slowed = kinds();
const sameSet = JSON.stringify(ready.slice().sort()) === JSON.stringify(slowed.slice().sort());
ok('when the set is the same, the order is the same too',
  sameSet ? JSON.stringify(ready) === JSON.stringify(slowed) : true, true);

head('nothing builds at all on the first pass');
/* Pre-existing and right: if not one generator can answer, the data has not
   arrived and there is nothing to wait three passes for. bkQuestions refuses
   to cache a short set, the card hides, and the next render rebuilds. */
M.setSlow(['a', 'b', 'c', 'd', 'e', 'f']);
ok('it gives up rather than spinning', kinds().length, 0);
M.setSlow([]);
ok('and the next build is whole again', kinds().length, 5);
ok('with the seeded order intact', kinds(), base);

head('a substituted set is marked as not canonical');
M.setSlow([]); M.reset();
const clean = M.bkBuildWeek(2026, 1, 5);
ok('nothing declined, so the seed got its own five', clean.canonical, true);

/* the dangerous case: a generator declines, another fills the slot, and the set
   still comes back five long on the first pass with nothing to show for it */
for (const slow of [['a'], ['b'], ['c'], ['d'], ['e']]) {
  M.setSlow(slow); M.reset();
  const got = M.bkBuildWeek(2026, 1, 5);
  const wasChosen = clean.map(q => q.kind).includes(slow[0]);
  ok('slow=' + slow[0] + ' still returns five', got.length, 5);
  if (wasChosen) ok('slow=' + slow[0] + ' is flagged as substituted', got.canonical, false);
}

/* ── the rule, at the source ──────────────────────────────────────────────── */
head('the source emits by seed rather than by arrival');
const src = grab('function bkBuildWeek(season,week,n){');
ok('questions are collected by kind', /const got=\{\}/.test(src), true);
ok('and emitted in the seeded order', /order\.forEach\(i=>\{ if\(got\[i\]\) out\.push/.test(src), true);
ok('nothing is pushed as it arrives', /if\(q&&!out\.some/.test(src), false);
ok('and it reports whether the seed got its own five', /res\.canonical=order\.slice/.test(src), true);

console.log(NL + (fail ? 'FAILED  ' : 'ok  ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
