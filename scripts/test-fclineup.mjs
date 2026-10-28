/* THE FORECAST'S LINEUPS: WHATEVER ESPN HAS SET, SPOT BY SPOT.
 *
 *   NO TRUNCATION   one side with a single starter used to cut both columns to
 *                   one row; each side now shows its own full lineup
 *   SPOT BY SPOT    both sides are laid against the league's nine starting
 *                   spots, so a QB sits across from a QB whatever is missing
 *   EMPTY IS EMPTY  a spot nobody is started in reads "Empty" and scores 0 --
 *                   and loses the spot to whoever is started across from it
 *   NO STAND-INS    a team with a roster but everybody benched gets its real,
 *                   empty lineup; the stand-in is only for a team with nobody
 *   TOTALS          every starter counts, not just the rows the shorter side had
 *   NO ODDS FOLD    the card carries no Playoff odds dropdown (removed v797)
 *
 * Run: node scripts/test-fclineup.mjs
 */
import { lifter, assemble } from './lib/lift.mjs';
import fs from 'fs';

const NL = String.fromCharCode(10);
let pass = 0, fail = 0;
const ok = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; console.log('  PASS  ' + name); return; }
  fail++;
  console.log('  FAIL  ' + name + NL + '          got  ' + g + NL + '          want ' + w);
};
const head = t => console.log(NL + t);

const M = assemble(lifter(new URL('../public/app.js', import.meta.url)), [
  'const SLOT_NAMES=', 'const BENCH_SLOTS=', 'const SLOT_ORDER=', 'const FC_LINEUP=', 'const FC_EDGE=',
  'function fcLineupFor(season,week,teamId){', 'function fcRosterCompareHTML(season,week,aId,bId,abA,abB,live){',
], ['fcLineupFor', 'fcRosterCompareHTML', 'set'], `
let _ros={}, _dummyCalls=0;
const set=(k,v)=>{ if(k==='ros') _ros=v; };
const sbRosters=()=>_ros;
const sbPlayerProj=()=>({});
const pName=pid=>'P'+pid;
const lastNameOf=n=>String(n||'').split(' ').pop();
const posPill=()=>['#fff','#000'];
const fcDummyLineup=()=>{ _dummyCalls++; return [{pid:999,n:'Stand In',pos:'QB',slot:0,ppos:1,proj:10,dummy:true}]; };`);

/* team 1: one back started, everybody else on the bench (slot 20) */
const ting = [
  { pid: 1, n: 'Mike Washington', slot: 2, pos: 2, wkProj: 12 },
  { pid: 2, n: 'Bench Guy', slot: 20, pos: 3, wkProj: 15 },
  { pid: 3, n: 'Other Bench', slot: 20, pos: 1, wkProj: 18 },
];
/* team 2: a full nine */
const full = [
  [10, 'Q B', 0, 1, 20], [11, 'R One', 2, 2, 14], [12, 'R Two', 2, 2, 11], [13, 'W One', 4, 3, 13],
  [14, 'W Two', 4, 3, 9], [15, 'T E', 6, 4, 8], [16, 'F X', 23, 2, 7], [17, 'D ST', 16, 16, 6], [18, 'K K', 17, 5, 8],
].map(([pid, n, slot, pos, wkProj]) => ({ pid, n, slot, pos, wkProj }));
M.set('ros', { 1: ting, 2: full });

head('no stand-ins for a rostered team');
const A = M.fcLineupFor(2026, 8, 1);
ok('everybody benched but one: just that one, no stand-in', A.map(x => [x.n, x.dummy]), [['Mike Washington', false]]);
M.set('ros', { 1: ting.map(e => ({ ...e, slot: 20 })), 2: full });
ok('everybody benched: an empty lineup, not a stand-in', M.fcLineupFor(2026, 8, 1), []);
M.set('ros', { 1: [], 2: full });
ok('no roster at all: the stand-in', M.fcLineupFor(2026, 8, 1)[0].dummy, true);
M.set('ros', { 1: ting, 2: full });

head('spot by spot, neither side cut short');
const html = M.fcRosterCompareHTML(2026, 8, 1, 2, 'TING', 'BFT', null);
const rows = html.split('<div class="fcr-row fcr-tot">')[0].split('<div class="fcr-row">').slice(1)
  .map(r => r.replace(/<[^>]+>/g, '|').split('|').map(x => x.trim()).filter(Boolean));
ok('nine rows, one per starting spot', rows.length, 9);
ok('the opponent keeps all nine', rows.map(r => r[r.length - 1]), ['B', 'One', 'Two', 'One', 'Two', 'E', 'X', 'ST', 'K']);
ok('the one back sits in the first RB spot', rows[1].slice(0, 2), ['Washington', '12.0']);
ok('the QB spot is empty on that side, across from the QB', rows[0], ['Empty', '—', 'QB', '20.0', 'B']);
ok('an empty spot loses the spot', /fcr-side st-pre bad"><span class="fcr-n fcr-empty">Empty/.test(html), true);

head('totals');
const tot = [...html.matchAll(/fcr-tot[\s\S]*?class="fcr-n">([\d.]+)<[\s\S]*?class="fcr-n">([\d.]+)</g)][0];
ok('every starter on each side counts', [tot[1], tot[2]], ['12.0', '96.0']);
ok('the spot count reflects all nine (RB1, 12 v 14, is inside the edge)', /BFT wins 8 spots to 0/.test(html), true);

head('no odds fold');
const card = lifter(new URL('../public/app.js', import.meta.url))('function renderForecast(info){');
ok('the card draws no Playoff odds dropdown', /'Playoff odds'|fcImplications[(]|fcFold[(]|fc-imp/.test(card), false);
ok('and the helpers behind it are gone', /function (?:fcImplications|fcFold|fcToggle)[(]/.test(fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8')), false);

console.log(NL + (fail ? 'FAILED  ' : 'ok  ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
