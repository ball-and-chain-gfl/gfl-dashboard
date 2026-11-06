/* THE SPORTSBOOK'S PROMOTIONS: JIMMIE'S JUMBO JUMBLE AND THE TWO RIDES.
 *
 *   THE BOX             only the Marathon Men see it, only on a parlay, and
 *                       only until a Jumble has been struck that bucks week --
 *                       a voided one gives the week back, a cashed one does not
 *   THE CARD            shows this week's Jumble, or last week's until there
 *                       is one; the Marathon Men's own ledger outranks the
 *                       league's copy of the same ticket
 *   TAILING             each leg at the board's price now; a spread takes the
 *                       board's line now; a shut or vanished market cannot be
 *                       tailed at all
 *   THE RIDES           BFT's and the Tinglers' submitted picks in the Matchup
 *                       of the Week, as the board's own moneyline on that side
 *   THE TICKET          the stamp goes on only when the box allows it
 *
 * Run: node scripts/test-promos.mjs
 */
import fs from 'node:fs';
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
const appUrl = new URL('../public/app.js', import.meta.url);
const grab = lifter(appUrl);

const M = assemble(grab, [
  'const JJJ_OWNER=', 'const JJJ_LIVE=', 'const RIDE_PROMOS=',
  'const pkFixKey=', 'function pkNormalise(p,games){',
  'function jjjCan(){', 'function jjjFind(){', 'function sbLegNow(l){', 'function sbRideFor(owner){',
], ['jjjCan', 'jjjFind', 'sbLegNow', 'sbRideFor', 'RIDE_PROMOS', 'set'], [
  'let _me=null, _bets=null, _near=[], _locked=false, _cpRows=[], _liveInfo={week:9}, _motw=[9,7], _wd=null, _mk=[];',
  'const bucksWeekKey=()=>"2026-11-03";',
  'const betsNearKeys=()=>["2026-11-03","2026-10-27"];',
  'const betsNear=()=>_near;',
  'const betLegWeek=mk=>{ const m=/^wk(\\d+)-/.exec(String(mk)); return m?Number(m[1]):null; };',
  'const sbWeekLocked=()=>_locked;',
  'const sbWeekData=()=>_wd;',
  'const sbAllMarkets=()=>_mk;',
  'const motwChosen=()=>_motw;',
  'const pkKey=()=>"pk_2026_w9";',
  'const liveWeekInfo=()=>_liveInfo;',
  'const pkGames=()=>(_wd?_wd.games:[]).map(g=>({home:{teamId:g.a.tid},away:{teamId:g.b.tid}}));',
  'const set=o=>{ if("me" in o) _me=o.me; if("bets" in o) _bets=o.bets; if("near" in o) _near=o.near;',
  '  if("locked" in o) _locked=o.locked; if("rows" in o) _cpRows=o.rows; if("motw" in o) _motw=o.motw;',
  '  if("wd" in o) _wd=o.wd; if("mk" in o) _mk=o.mk; if("live" in o) _liveInfo=o.live; };',
].join(NL));

const MM = { k1: 'mm', teamId: '1' }, BFT = { k1: 'bft', teamId: '10' };
const jjj = (id, wk, status, ts, owner = 'mm') => ({ id, owner, wk, status, ts, feat: 'jjj', legs: [] });

head('the box on the slip');
M.set({ me: MM, bets: [] });
ok('the Marathon Men, nothing struck this week: offered', M.jjjCan(), true);
M.set({ me: BFT });
ok('anybody else: never', M.jjjCan(), false);
M.set({ me: null });
ok('signed out: never', M.jjjCan(), false);
M.set({ me: MM, bets: null });
ok('the ledger not in yet: not offered, so it cannot be offered twice', M.jjjCan(), false);
M.set({ bets: [jjj('a', '2026-11-03', 'open', 5)] });
ok('one struck this week: gone until Tuesday', M.jjjCan(), false);
M.set({ bets: [jjj('a', '2026-11-03', 'cashed', 5)] });
ok('a cashed Jumble still used the week', M.jjjCan(), false);
M.set({ bets: [jjj('a', '2026-11-03', 'void', 5)] });
ok('a voided one gives the week back', M.jjjCan(), true);
M.set({ bets: [jjj('a', '2026-10-27', 'won', 5)] });
ok('last week\'s does not count against this one', M.jjjCan(), true);
M.set({ bets: [{ id: 'b', owner: 'mm', wk: '2026-11-03', status: 'open', ts: 5, feat: '' }] });
ok('an ordinary parlay this week does not either', M.jjjCan(), true);

head('the card');
M.set({ me: BFT, bets: [], near: [] });
ok('nothing this week or last: no Jumble', M.jjjFind(), null);
M.set({ near: [jjj('old', '2026-10-27', 'lost', 1)] });
ok('only last week\'s: shown as last week\'s', [M.jjjFind().bet.id, M.jjjFind().last], ['old', true]);
M.set({ near: [jjj('old', '2026-10-27', 'lost', 1), jjj('new', '2026-11-03', 'open', 9)] });
ok('this week\'s takes over', [M.jjjFind().bet.id, M.jjjFind().last], ['new', false]);
M.set({ near: [jjj('x', '2026-11-03', 'open', 9, 'bft')] });
ok('a feat flag on somebody else\'s ticket is not a Jumble', M.jjjFind(), null);
M.set({ near: [jjj('v', '2026-11-03', 'void', 9)] });
ok('a voided Jumble is not shown', M.jjjFind(), null);
M.set({ me: MM, bets: [jjj('n', '2026-11-03', 'void', 9)], near: [jjj('n', '2026-11-03', 'open', 9)] });
ok('the Marathon Men\'s own ledger outranks the league\'s older copy', M.jjjFind(), null);
M.set({ me: MM, bets: [jjj('n', '2026-11-03', 'open', 9)], near: [] });
ok('and is there before the league\'s copy catches up', M.jjjFind().bet.id, 'n');

/* a week board: Midwest Miners (9) v Lebron's 3rd Leg (7), and BFT (10) v somebody (11) */
const row = (tid, owner, name) => ({ tid, owner, name });
const WD = { week: 9, games: [
  { week: 9, a: row(9, 'oMWM', 'Midwest Miners'), b: row(7, 'oKUNK', "Lebron's 3rd Leg"), mlA: -180, mlB: 140, spread: 6.5, favA: true },
  { week: 9, a: row(10, 'oBFT', 'The Bryan Football Team'), b: row(11, 'oKW', 'Kansas'), mlA: -330, mlB: 240, spread: 12.5, favA: true },
] };

head('tailing: each leg at today\'s price');
M.set({ wd: WD, locked: false, mk: [] });
ok('a moneyline at the board\'s price now, not the one it was struck at',
  M.sbLegNow({ mk: 'wk9-9-7-ml', pick: 'oKUNK:ml', pickLabel: "Lebron's 3rd Leg moneyline", odds: 175 }),
  { mk: 'wk9-9-7-ml', mkLabel: "Week 9 · Midwest Miners vs Lebron's 3rd Leg", pick: 'oKUNK:ml', pickLabel: "Lebron's 3rd Leg moneyline", odds: 140 });
ok('a spread takes the board\'s line now -- the label is what settles it',
  M.sbLegNow({ mk: 'wk9-9-7-sp', pick: 'oKUNK:sp', pickLabel: "Lebron's 3rd Leg +4.5", odds: -115 }),
  { mk: 'wk9-9-7-sp', mkLabel: 'Week 9 spread', pick: 'oKUNK:sp', pickLabel: "Lebron's 3rd Leg +6.5", odds: -115 });
ok('a fixture no longer on the board cannot be tailed', M.sbLegNow({ mk: 'wk9-1-2-ml', pick: 'x:ml' }), null);
ok('nor a side that is not in that fixture', M.sbLegNow({ mk: 'wk9-9-7-ml', pick: 'oBFT:ml' }), null);
M.set({ locked: true });
ok('nor anything once its week has kicked off', M.sbLegNow({ mk: 'wk9-9-7-ml', pick: 'oKUNK:ml' }), null);
M.set({ locked: false, mk: [
  { key: 'champ', title: 'Champion', type: 'outright', picks: [{ owner: 'oBFT', name: 'BFT', odds: 450 }] },
  { key: 'wk9-donut', title: 'Week 9 Donut', type: 'yesno', picks: [{ owner: 'oKW', name: 'Kansas', yes: 380, no: -900 }] },
  { key: 'wins', title: 'Season Wins', type: 'ou', picks: [{ owner: 'oBFT', name: 'BFT', line: 9.5, over: -120, under: 100 }] },
] });
ok('an outright at its price now', M.sbLegNow({ mk: 'champ', pick: 'oBFT' }).odds, 450);
ok('a yes/no side', [M.sbLegNow({ mk: 'wk9-donut', pick: 'oKW:yes' }).odds, M.sbLegNow({ mk: 'wk9-donut', pick: 'oKW:no' }).odds], [380, -900]);
ok('a season total, with its line now', M.sbLegNow({ mk: 'wins', pick: 'oBFT:u' }).pickLabel, 'BFT — Under 9.5');
ok('a market gone from the board', M.sbLegNow({ mk: 'gone', pick: 'oBFT' }), null);

head('ride with the Ball, ride with the Chain');
ok('the Ball is BFT and the Chain is the Tinglers', M.RIDE_PROMOS.map(p => [p.owner, p.title, p.icon]),
  [['bft', 'Ride with the Ball', 'fa-football'], ['ting', 'Ride with the Chain', 'fa-link']]);
const slate = o => JSON.stringify(o);
M.set({ rows: [
  { id: 'bft', pk_2026_w9: slate({ '7-9': '9', '10-11': '11' }) },
  { id: 'ting', pk_2026_w9: slate({ '7-9': '7' }) },
  { id: 'kunk' },
], motw: [9, 7], live: { week: 9 } });
const ball = M.sbRideFor('bft'), chain = M.sbRideFor('ting');
ok('BFT took Midwest Miners: their moneyline, at the board\'s price', [ball.t.name, ball.odds], ['Midwest Miners', -180]);
ok('the Tinglers took the other side', [chain.t.name, chain.odds], ["Lebron's 3rd Leg", 140]);
ok('a manager with no slate in: no card', M.sbRideFor('kunk'), null);
M.set({ motw: null });
ok('no Matchup of the Week yet: no card', M.sbRideFor('bft'), null);
M.set({ motw: [9, 7], live: { week: 10 } });
ok('the board on another week than the picks: no card', M.sbRideFor('bft'), null);
M.set({ live: { week: 9 }, rows: [{ id: 'bft', pk_2026_w9: slate({ '10-11': '10' }) }] });
ok('a slate with no pick in the Matchup: no card', M.sbRideFor('bft'), null);

head('the ticket and the board');
const src = fs.readFileSync(appUrl, 'utf8');
const place = src.slice(src.indexOf('async function sbPlaceBet(){'), src.indexOf('async function sbPlaceBet(){') + 6000);
ok('the stamp goes on only when the box allows it',
  [/const jjj=_jjjOn&&_slip\.length>1&&jjjCan\(\);/.test(place), /if\(jjj\) doc\.feat='jjj';/.test(place)], [true, true]);
ok('and the box is cleared once a ticket is placed', /_slip=\[\]; _sbStake=10; _jjjOn=false;/.test(place), true);
ok('the bet row reads the stamp back', /feat:f\.feat\|\|''\}/.test(src), true);
const ride = src.slice(src.indexOf('function sbRideHTML(p){'), src.indexOf('function sbRideHTML(p){') + 1200);
ok('a Ride button is the board\'s own moneyline button: same key, labels and price',
  ride.includes("sbBtn('wk'+g.week+'-'+g.a.tid+'-'+g.b.tid+'-ml',`Week ${g.week} · ${g.a.name} vs ${g.b.name}`,")
  && ride.includes("t.owner+':ml',`${t.name} moneyline`,r.odds"), true);
ok('the board\'s moneyline buttons are written the same way',
  src.includes("sbBtn(key+'-ml',`Week ${g.week} · ${g.a.name} vs ${g.b.name}`,g.a.owner+':ml',`${g.a.name} moneyline`,g.mlA"), true);

console.log(NL + `${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
