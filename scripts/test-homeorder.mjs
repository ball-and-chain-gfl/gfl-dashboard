/* WHAT SITS AT THE TOP OF THE HOMEPAGE.
 *
 * The stack under the video sorts on one rule: anything with business still
 * open rises, everything finished sinks, and ties break on the order of the
 * HOME_TODO registry. Your Forecast joined that stack and is a new kind of
 * card -- it is never outstanding, because it asks nothing of anybody. Being
 * first in the registry makes it the first of the FINISHED cards, so it leads
 * the page once the league has nothing left to ask you and gets pushed down by
 * anything that does.
 *
 * orderHomeTodo itself measures and animates real elements, so what is checked
 * here is the rule it sorts by, lifted with the registry.
 *
 * Run: node scripts/test-homeorder.mjs
 */
import { lifter, assemble } from './lib/lift.mjs';

const grab = lifter(new URL('../public/app.js', import.meta.url));

/* the registry's predicates reach for a dozen globals; every one is a stub the
   test drives, so each card can be put in either state on demand */
const PRELUDE = [
  'let S={cp:false,nt:false,pk:false,bk:false,bkAsked:true};',
  'const _me={k1:"me"};',
  'let _cpJustSent=false;',
  'let _cpRows=[];',
  'const cpKey=()=>"cp_2026_w1";',
  'const ntDone=()=>S.nt;',
  'const pkSubmitted=()=>S.pk;',
  'const pkLocked=()=>false;',
  'const bkQuestions=()=>S.bkAsked?[1,2,3]:[];',
  'const bkSubmitted=()=>S.bk;',
  'const setState=v=>{S={...S,...v};',
  '  _cpJustSent=!!S.cp; _cpRows=S.cp?[{id:"me","cp_2026_w1":"1"}]:[];};',
].join(String.fromCharCode(10));

const M = assemble(grab, ['const HOME_TODO='], ['HOME_TODO', 'setState'], PRELUDE);

/* the sort orderHomeTodo runs, on ids alone */
function stack() {
  return M.HOME_TODO
    .map((t, i) => { let d = false; try { d = !!t.done(); } catch (e) {} return { id: t.id, d, i }; })
    .sort((a, b) => (a.d ? 1 : 0) - (b.d ? 1 : 0) || a.i - b.i);
}
const order = () => stack().map(r => r.id);
const outstanding = () => stack().filter(r => !r.d).map(r => r.id);

let pass = 0, fail = 0;
const ok = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; return; }
  fail++;
  console.log('  FAIL  ' + name + '\n          got  ' + g + '\n          want ' + w);
};
const head = t => console.log('\n' + t);

const ALL_DONE = { cp: true, nt: true, pk: true, bk: true };

head('the registry');
ok('Your Forecast is registered first', M.HOME_TODO[0].id, 'fc-sec');
ok('all five cards are in the stack', M.HOME_TODO.length, 5);

head('everything finished');
M.setState(ALL_DONE);
ok('nothing is outstanding', outstanding(), []);
ok('the forecast leads the page', order()[0], 'fc-sec');
ok('and the rest follow in registry order',
  order(), ['fc-sec', 'cp-sec', 'nt-sec', 'pk-sec', 'bk-sec']);

head('the forecast is never outstanding');
[{}, ALL_DONE, { cp: false, nt: false, pk: false, bk: false }].forEach((s, i) => {
  M.setState({ ...ALL_DONE, ...s });
  ok('state ' + i + ': fc-sec is done', stack().find(r => r.id === 'fc-sec').d, true);
});

head('notifications with something to say go above it');
M.setState({ ...ALL_DONE, nt: false });
ok('nt-sec is outstanding', outstanding(), ['nt-sec']);
ok('and sits above the forecast', order().slice(0, 2), ['nt-sec', 'fc-sec']);

head('so does every other kind of unfinished business');
[['cp', 'cp-sec'], ['pk', 'pk-sec'], ['bk', 'bk-sec']].forEach(([k, id]) => {
  M.setState({ ...ALL_DONE, [k]: false });
  ok(id + ' rises above the forecast', order().slice(0, 2), [id, 'fc-sec']);
});

head('several at once');
M.setState({ cp: false, nt: false, pk: false, bk: false });
ok('all four outstanding, in registry order',
  order(), ['cp-sec', 'nt-sec', 'pk-sec', 'bk-sec', 'fc-sec']);
ok('the forecast is last when everything else wants something',
  order()[order().length - 1], 'fc-sec');

M.setState({ ...ALL_DONE, nt: false, pk: false });
ok('two outstanding sit above it, finished ones below',
  order(), ['nt-sec', 'pk-sec', 'fc-sec', 'cp-sec', 'bk-sec']);

head('Ball Knowledge with no questions asked is finished, not outstanding');
M.setState({ ...ALL_DONE, bk: false, bkAsked: false });
ok('an empty set does not hold the page open', outstanding(), []);
ok('the forecast still leads', order()[0], 'fc-sec');

console.log('\n' + (fail ? 'FAILED  ' : 'ok  ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
