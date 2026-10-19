/* PROJECTED FINISH: WHERE THE SCHEDULE ENDS UP.
 *
 *   THE CALL       favoured is a win, not favoured a loss -- on the exact
 *                  chance, so 49.8% is a loss though the column says 50%
 *   A DEAD HEAT    the better all-time record takes it; level there too, the
 *                  more points scored this season
 *   THE FINISH     the record already banked plus the calls, regular season
 *                  only -- the panel sits after week 14
 *
 * Run: node scripts/test-schedproj.mjs
 */
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

const M = assemble(grab, ['function schedAllTimePct(owner){', 'function schedTeamOf(owner){', 'function schedCall(owner,oppOwner,p){',
  'function schedProjHTML(owner,d){', 'function schedPctCol(p){'], ['schedCall', 'schedProjHTML', 'schedAllTimePct', 'set'], [
  /* bft .600 all time; ting and mm level at .500 (ting's other games are against kw) */
  "let _h2hAll={ 'bft|ting':{bft:{w:20,t:0,games:30},ting:{w:10,t:0,games:30}}, 'bft|mm':{bft:{w:10,t:0,games:20},mm:{w:10,t:0,games:20}},",
  "  'kw|ting':{kw:{w:10,t:0,games:30},ting:{w:20,t:0,games:30}} };",
  "let _ownerMap={10:'bft',8:'ting',1:'mm'};",
  "let _teams=[{id:10,wins:4,losses:1,ties:0,pf:700},{id:8,wins:2,losses:3,ties:0,pf:600},{id:1,wins:3,losses:2,ties:0,pf:650}];",
  "const set=(k,v)=>{ if(k==='teams') _teams=v; if(k==='h2h') _h2hAll=v; };",
  "let _franchises=[{owner:'bft',name:'The Bryan Football Team'}]; const sbAvatar=o=>`<i data-av=\"${o}\"></i>`; const sbTeamAb=o=>o.toUpperCase();",
].join(NL));

head('the call');
ok('favoured by a hair is a win', M.schedCall('bft', 'ting', 0.501).win, true);
ok('49.8% is a loss, whatever the column rounds it to', M.schedCall('bft', 'ting', 0.498).win, false);
ok('a heavy favourite is a win, no tiebreak named', M.schedCall('bft', 'ting', 0.81), { win: true, why: '' });

head('a dead heat');
ok('the better all-time record takes it', M.schedCall('bft', 'ting', 0.5), { win: true, why: 'level at 50% · better all-time record' });
ok('...from either side', M.schedCall('ting', 'bft', 0.5).win, false);
ok('level all-time too: more points this season', M.schedCall('ting', 'mm', 0.5), { win: false, why: 'level at 50% · more points this season' });
ok('all-time is wins over games, ties half', +M.schedAllTimePct('bft').toFixed(3), +(30 / 50).toFixed(3));

head('the finish');
const row = (week, oppOwner, p, playoff = false) => ({ week, oppOwner, p, playoff, opp: { name: oppOwner } });
const html = M.schedProjHTML('bft', { rows: [row(6, 'ting', 0.63), row(7, 'mm', 0.41), row(8, 'ting', 0.5), row(15, 'mm', 0.7, true)] });
const rec = /class="spj-rec">([^<]+)</.exec(html)[1];
ok('4-1 banked, then W L W (the dead heat to all-time), regular season only: 6-2', rec, '6–2');
ok('one plain line: crest, abbreviation, the words, the record', [/data-av="bft"/.test(html), /class="spj-ab">BFT</.test(html), /Projected finish/.test(html)], [true, true, true]);
ok('nothing coloured on it', /--green|--red|spj-w"|spj-l"/.test(html), false);
ok('nothing left to play: no line', M.schedProjHTML('bft', { rows: [row(15, 'mm', 0.7, true)] }), '');

console.log(NL + (fail ? 'FAILED  ' : 'ok  ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
