/* ONE TEAM'S MONEYLINE AND ITS SPREAD CANNOT SHARE A TICKET.
 *
 *   THE RULE      mlspClash names the leg to drop from each same-team pair in
 *                 the same game: the one at the shorter price (a tie keeps the
 *                 spread). Different teams, different games and lone legs are
 *                 not its business.
 *   THE SLIP      tapping the other half of a pair swaps it in, with a note
 *   THE SEND      sbPlaceBet refuses a slip that still holds a pair
 *   THE FIX       the migration lifts the same rule rather than restating it
 *
 * Run: node scripts/test-mlsp.mjs
 */
import fs from 'fs';
import { lifter, assemble } from './lib/lift.mjs';

const NL = String.fromCharCode(10);
let pass = 0, fail = 0;
const ok = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; console.log('  PASS  ' + name); return; }
  fail++;
  console.log('  FAIL  ' + name + NL + '          got  ' + g + NL + '          want ' + w);
};
const head = t => console.log(NL + t);
const grab = lifter(new URL('../public/app.js', import.meta.url));

const M = assemble(grab, ['function amToDec(o){', 'function mlspClash(legs){'], ['mlspClash']);
const leg = (mk, pick, odds, pickLabel = '') => ({ mk, pick, odds, pickLabel });
const G = 'wk6-10-8';

head('which leg goes');
ok('a favourite: its moneyline is the shorter price, so it goes',
  M.mlspClash([leg(G + '-ml', 'bft:ml', -270), leg(G + '-sp', 'bft:-6.5', -115)]).map(l => l.mk), [G + '-ml']);
ok('an underdog getting points: its moneyline is the longer price, so the spread goes',
  M.mlspClash([leg(G + '-ml', 'wglr:ml', 110), leg(G + '-sp', 'wglr:+4', -115)]).map(l => l.mk), [G + '-sp']);
ok('level prices keep the spread', M.mlspClash([leg(G + '-ml', 'ws:ml', -115), leg(G + '-sp', 'ws:-1', -115)]).map(l => l.mk), [G + '-ml']);
ok('order on the ticket does not matter',
  M.mlspClash([leg(G + '-sp', 'bft:-6.5', -115), leg('wk6-1-2-ml', 'mm:ml', 150), leg(G + '-ml', 'bft:ml', -270)]).map(l => l.mk), [G + '-ml']);

head('and what is not its business');
ok('the two teams in one game (another rule refuses that)', M.mlspClash([leg(G + '-ml', 'ting:ml', 150), leg(G + '-sp', 'bft:-6.5', -115)]), []);
ok('the same team in two different weeks', M.mlspClash([leg('wk5-10-8-ml', 'bft:ml', -150), leg(G + '-sp', 'bft:-6.5', -115)]), []);
ok('a moneyline alone', M.mlspClash([leg(G + '-ml', 'bft:ml', -270), leg('wk6-1-2-ml', 'mm:ml', 150)]), []);
ok('a total beside them', M.mlspClash([leg(G + '-tot', 'over', -110), leg(G + '-ml', 'bft:ml', -270)]), []);
ok('two pairs on one ticket: one leg from each',
  M.mlspClash([leg(G + '-ml', 'bft:ml', -270), leg(G + '-sp', 'bft:-6.5', -115),
    leg('wk6-1-2-ml', 'mm:ml', -160), leg('wk6-1-2-sp', 'mm:-3', -110)]).map(l => l.mk), [G + '-ml', 'wk6-1-2-ml']);
ok('nothing in, nothing out', M.mlspClash(null), []);

head('the slip swaps rather than stacks');
const S = assemble(grab, ['const SB_EXCLUSIVE=', 'function sbConflict(mk,pick){'], ['sbConflict', 'setSlip'], [
  'let _slip=[]; const setSlip=s=>{ _slip=s; };',
  'const sbAllMarkets=()=>[]; const sbSameGame=()=>false; const sbWeekOpposite=()=>null; const sbSeatCap=()=>null;',
].join(NL));
S.setSlip([{ k: G + '-ml|bft:ml', mk: G + '-ml', pick: 'bft:ml', odds: -270 }]);
const c = S.sbConflict(G + '-sp', 'bft:-6.5');
ok('the spread on the same team clashes with its moneyline', [c && c.leg.mk, !!(c && c.why), c && c.block], [G + '-ml', true, undefined]);
S.setSlip([{ k: G + '-sp|bft:-6.5', mk: G + '-sp', pick: 'bft:-6.5', odds: -115 }]);
ok('and the other way round', (S.sbConflict(G + '-ml', 'bft:ml') || {}).leg?.mk, G + '-sp');
S.setSlip([{ k: 'x', mk: 'wk6-1-2-sp', pick: 'mm:-3', odds: -110 }]);
ok('a different game is fine', S.sbConflict(G + '-ml', 'bft:ml'), null);

head('the send, and the fix');
const APP = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const MIG = fs.readFileSync(new URL('./migrations/fix-mlsp-parlays.mjs', import.meta.url), 'utf8');
ok('sbPlaceBet refuses a slip that still holds a pair', /if\(mlspClash\(_slip\)\.length\)\{ _betErr='mlsp';/.test(APP), true);
ok('and says why', /_betErr==='mlsp'\?/.test(APP), true);
ok('the migration lifts the same rule rather than restating it', /'function mlspClash\('/.test(MIG), true);

console.log(NL + (fail ? 'FAILED  ' : 'ok  ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
