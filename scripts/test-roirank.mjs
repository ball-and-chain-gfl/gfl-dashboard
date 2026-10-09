/* TRADE ROI AND WAIVER ROI: THE LEAGUE RANKED ABOVE THE TEAM PICKER.
 *
 *   RANKED              every team, best C2 / C3 first, the team on show
 *                       picked out, and a tap on a row picks that team
 *   WHAT EACH ROW SAYS  trades in and out; a pickup total that reads the way
 *                       the season was scored -- points and margin from 2026,
 *                       pickups and points before it
 *
 * Run: node scripts/test-roirank.mjs
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
const M = assemble(grab, [
  'function roiDefaultTeam(){', 'function roiRankHTML(key,cur,sub,pick){', 'const c2RankSub=', 'const c3RankSub=',
], ['roiDefaultTeam', 'roiRankHTML', 'c2RankSub', 'c3RankSub', 'setBreakdown'], [
  'let _teams=[{id:1,name:"Alpha"},{id:2,name:"Lebron\'s 3rd Leg"},{id:3,name:"Gamma"}];',
  'let _cmBreakdown={}; const setBreakdown=b=>{_cmBreakdown=b;};',
  'const logoImg=id=>`<i data-logo="${id}"></i>`;',
  'const cc=v=>v>0?"g":v<0?"r":"n";',
].join(NL));

M.setBreakdown({
  1: { c2: -1.2, c3: 3.83, detail: { tradesReceived: [{ pid: 9, week: 3, pts: 4 }], tradesSent: [{ pid: 8, week: 3, pts: 16 }],
    c3Mode: 'share', waiverPickups: [{ pts: 29.8, margin: 3, bid: 3 }, { pts: 39.7, margin: 204, bid: 259 }] } },
  2: { c2: 0, c3: -6.1, detail: { tradesReceived: [], tradesSent: [], c3Mode: 'share', waiverPickups: [] } },
  3: { c2: 1.9, c3: 0.4, detail: { tradesReceived: [{ pid: 7, week: 2, pts: 19 }], tradesSent: [],
    c3Mode: 'ratio', waiverPickups: [{ pts: 12, margin: 4, bid: 4 }] } },
});

head('ranked');
const c3 = M.roiRankHTML('c3', '3', M.c3RankSub, 'c3Pick');
const order = h => [...h.matchAll(/c3Pick\((\d)\)"/g)].map(m => m[1]);
ok('every team, best C3 first', [...c3.matchAll(/data-logo="(\d)"/g)].map(m => m[1]), ['1', '3', '2']);
ok('the first is the medal, the rest are numbered', [c3.includes('🥇'), c3.includes('coaching-rank">2<'), c3.includes('coaching-rank">3<')], [true, true, true]);
ok('scores signed to two places', [c3.includes('+3.83'), c3.includes('-6.10')], [true, true]);
ok('the team on show is picked out, and only that one',
  [(c3.match(/roi-row on/g) || []).length, /roi-row on"[^>]*aria-pressed="true"[\s\S]*?c3Pick\(3\)/.test(c3)], [1, true]);
ok('a tap or a key on a row picks that team', order(c3).length >= 3 && c3.includes("event.key==='Enter'"), true);
const c2 = M.roiRankHTML('c2', '1', M.c2RankSub, 'c2Pick');
ok('Trade ROI ranks by C2 the same way', [...c2.matchAll(/data-logo="(\d)"/g)].map(m => m[1]), ['3', '2', '1']);

head('what each row says');
ok('players in and out', c2.includes('1 player in · 1 out') && c2.includes('1 player in · 0 out'), true);
ok('a team with no trades says so', c2.includes('No trades'), true);
ok('from 2026, a pickup line is points and margin', c3.includes('69.5 pts · $207 margin'), true);
ok('before it, pickups and points', c3.includes('1 pickup · 12.0 pts'), true);
ok('a team with no pickups says so', c3.includes('No pickups'), true);

head('the picker');
ok("it opens on Lebron's 3rd Leg, as the Waiver ROI picker always has", M.roiDefaultTeam(), '2');

console.log(NL + (fail ? 'FAILED  ' : 'ok  ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
