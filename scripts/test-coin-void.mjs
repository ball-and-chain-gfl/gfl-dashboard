/* VOIDED LEDGER ENTRIES, AND THE COIN SUSPENSION (21 October 2026).
 *
 *   VOID       an entry the league has voided stays on the profile -- so no device
 *              can merge it back -- and counts for nothing: not in holdings, not
 *              in what was banked, not in the cash the balance sets aside
 *   MERGE      a device that has not synced holds the same entry without the
 *              void; whichever copy arrives first, the voided one is kept
 *   SUSPENDED  no coin can be bought, sold, shorted or covered; a team share can
 *
 * The real case: TING bought MARV for $130.05, sold 1,000 for $980, bought
 * 100,000 BILL for $1,000 and sold 5 DALE for $18.40, all but the MARV buys in
 * week 7. Every MARV entry and every week 7 coin trade is voided: the cash the
 * balance holds back moves by -$131.65, i.e. the balance rises $131.65.
 *
 * Run: node scripts/test-coin-void.mjs
 */
import { lifter, assemble } from './lib/lift.mjs';

const NL = String.fromCharCode(10);
let pass = 0, fail = 0;
const near = (a, b, eps = 0.005) => Math.abs(a - b) < eps;
const ok = (name, got, want, eps) => {
  const good = (typeof want === 'number' && typeof got === 'number')
    ? near(got, want, eps) : JSON.stringify(got) === JSON.stringify(want);
  if (good) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + NL + '         got  ' + JSON.stringify(got)
    + NL + '         want ' + JSON.stringify(want)); }
};
const head = t => console.log(NL + t);
const grab = lifter(new URL('../public/app.js', import.meta.url));

const M = assemble(grab, [
  'const INV_BASE=', 'const bucks2=', 'function invLots(){', 'const INV_COINS=', 'const invCoinKey=', 'const invCoin=',
  'const INV_COINS_SUSPENDED=', 'const invSuspended=', 'const INV_COIN_TOP=', 'const INV_CEIL=', 'const invCeilOf=',
  'const invCap=', 'const invCollat=', 'function invWalk(lots){', 'function invHoldings(){', 'function invRealised(){',
  'function invNetSpent(){', 'async function invSync(){',
], ['invWalk', 'invHoldings', 'invRealised', 'invNetSpent', 'invSync', 'invSuspended', 'setLedger', 'setServer', 'ledger'],
`
let _inv=[], _me={k1:'ting'}, _srv=[], _activeTab='';
const lsKey=()=>'x'; const gflPatchProfile=()=>{}; const renderBook=()=>{};
const gflFetchProfile=async()=>({data:{inv:JSON.stringify(_srv)}});
const localStorage={setItem(){},getItem(){return null;}};
const bkLots=()=>invLots();
const setLedger=a=>{ _inv=a; };
const setServer=a=>{ _srv=a; };
const ledger=()=>_inv;
`);

const MARV = 'COIN_4432708', BILL = 'COIN_4575131', DALE = 'COIN_4569587', TEAM = 'mm';
const L = (o, k, s, p, t, w) => ({ o, k, s, p, t, w });
const TING = [
  L(MARV, 'b', 5, 1.21, 1, 3), L(DALE, 'b', 5, 1.00, 2, 3), L(MARV, 'b', 34, 0.25, 3, 4), L(MARV, 'b', 62, 0.25, 4, 4),
  L(TEAM, 'b', 10, 9.50, 5, 5), L(MARV, 'b', 10000, 0.01, 6, 6),
  L(DALE, 's', 5, 3.68, 7, 7), L(BILL, 'b', 60000, 0.01, 8, 7), L(MARV, 's', 1000, 0.98, 9, 7), L(BILL, 'b', 40000, 0.01, 10, 7),
];
const voided = TING.map(l => (l.o === MARV || (String(l.o).startsWith('COIN_') && l.w === 7)) ? { ...l, void: 'coins-2026-10-21' } : l);

head('a voided entry counts for nothing');
M.setLedger(TING);
const before = M.invNetSpent(), hBefore = M.invHoldings();
ok('before: MARV and BILL held, MARV profit banked', [Math.round(hBefore[MARV]), Math.round(hBefore[BILL]), +M.invRealised().toFixed(2) > 900], [9101, 100000, true]);
M.setLedger(voided);
const after = M.invNetSpent(), hAfter = M.invHoldings();
ok('the cash the balance holds back falls $131.65 -- the balance rises by it', +(after - before).toFixed(2), -131.65);
ok('no MARV, no BILL; the 5 DALE sold this week are held again; the team share untouched',
  [hAfter[MARV] || 0, hAfter[BILL] || 0, hAfter[DALE], hAfter[TEAM]], [0, 0, 5, 10]);
ok('nothing banked on MARV or DALE any more', +M.invRealised().toFixed(2), 0);
ok('and the entries are still there, marked', M.ledger().filter(l => l.void).length, 8);

head('a void survives the merge');
const stale = TING.map(l => ({ ...l }));                     // a device that never heard
M.setServer(voided); M.setLedger(stale);
await M.invSync();
ok('server voided, device not: the voided copy is kept', M.ledger().filter(l => l.void).length, 8);
M.setServer(TING.map(l => ({ ...l }))); M.setLedger(voided.map(l => ({ ...l })));
await M.invSync();
ok('and the other way round', M.ledger().filter(l => l.void).length, 8);
ok('no entry doubled', M.ledger().length, TING.length);

head('coins are suspended, team shares are not');
ok('every coin', [M.invSuspended(MARV), M.invSuspended(BILL), M.invSuspended(DALE)], [true, true, true]);
ok('a team share trades', M.invSuspended(TEAM), false);
const APP = (await import('fs')).readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
ok('the trade itself refuses a coin, and reads the profile before writing',
  APP.includes('if(invSuspended(owner)){ _invErr=INV_SUSPENDED_NOTE; renderBook(); return; }') && APP.includes('  try{ await invSync(); }catch(e){}'), true);
ok('every button that trades a coin says Suspended',
  APP.includes("shutTxt=invSuspended(o)?'Suspended':'Closed'") && APP.includes("${susp?'Suspended':'Closed'}") && (APP.match(/\$\{!shut\?'Suspended':'Closed'\}/g) || []).length === 2, true);

ok('the coins tab is a dark sheet with one line on it, not a notice box', APP.includes("_sbView==='coins'?invCoinsHTML()") && APP.includes('Coin market currently under construction</span>') && APP.includes("${(shut&&!susp)?"), true);

console.log(NL + (fail ? 'FAILED  ' : 'ok  ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
