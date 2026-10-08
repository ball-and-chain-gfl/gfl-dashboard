/* BIG WIN: ANY BET THAT CAME IN FOR MORE THAN $100.
 *
 *   WINNINGS            what came back less what went on it -- the 'Won +$X'
 *                       My Bets prints -- and more than $100 of it, not $100
 *   ONE CARD PER BET    a shared parlay's seats on the one card it raised, each
 *                       winner held to the $100 on their own stake; a head to
 *                       head told by whichever side won it, naming who lost
 *   WHAT IT SHOWS       who won, how much, on what stake, and the legs
 *   NEWS FOR A WEEK     from when it settled, dated to that day; nothing from
 *                       last season, the testing account, or before the reset
 *
 * Run: node scripts/test-bighit.mjs
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

const DAY = 86400000, NOW = Date.UTC(2026, 9, 8, 15);
const M = assemble(grab, [
  'const NT_KINDS=', 'const NT_BIG_HIT=', 'const NT_BIG_HIT_FOR=', 'let _ntBetsTry=',
  'function ntBetsWant(){', 'function ntBigHits(out){',
], ['NT_KINDS', 'ntBigHits', 'setBets', 'setMe', 'asked'], [
  `Date.now=()=>${NOW};`,
  'let _me={k1:"bft"}; const setMe=m=>{_me=m;};',
  'let _betsAll=null, _pkBetsLast=null, _betsAllBusy=false; const setBets=b=>{_betsAll=b;};',
  'let _asked=0; const asked=()=>_asked; const betLeague=()=>{ _asked++; return new Promise(()=>{}); };',
  'const BETS_ALL_TTL=120000; let _activeTab="home";',
  "const TEST_PROFILE='test';",
  'const sbSeason=()=>2026;',
  'const betsAfterReset=b=>Number(b.ts||0)>=100;',
  'const bucks2=v=>Math.round((Number(v)||0)*100)/100;',
  'const bucksFmt=v=>"$"+bucks2(v).toFixed(2);',
  'const amFmt=v=>(v>0?"+":"")+v;',
  'const betAccountName=k=>k.toUpperCase()+" FC";',
  'const betAccountOwner=k=>"{"+k+"}";',
  'const ntCrest=o=>`<i data-cr="${o}"></i>`;',
  'const ntDayOf=t=>{ const d=new Date(t); d.setUTCHours(0,0,0,0); return d.getTime(); };',
].join(NL));

const legs4 = [
  { mk: 'wk4-1-2-ml', pickLabel: 'BFT moneyline', odds: -270 },
  { mk: 'wk4-1-2-sp', pickLabel: 'BFT −19.5', odds: -115 },
  { mk: 'wk4-3-4-ml', pickLabel: 'MCM moneyline', odds: 600 },
  { mk: 'wk4-high', pickLabel: 'Week 4 Top Score: BFT', odds: 140 },
];
const bet = (id, owner, extra = {}) => ({ id, owner, season: '2026', ts: NOW - 5 * DAY,
  status: 'won', stake: 25, odds: 380, payout: 1076.04, ret: 1076.04, settledTs: NOW - 2 * DAY, legs: legs4, ...extra });

M.setBets([
  bet('par', 'kunk'),                                                     // +$1,051.04
  bet('seat1', 'mcm', { srcBet: 'par' }),                                 //   seat, same win
  bet('seat2', 'kw', { srcBet: 'par', stake: 2, ret: 86.08 }),            //   seat, only +$84.08
  bet('even', 'fman', { stake: 100, ret: 200, legs: legs4.slice(0, 1) }),          // exactly +$100
  bet('just', 'ting', { stake: 100, ret: 200.01, legs: legs4.slice(0, 1), odds: 100 }), // +$100.01
  bet('lost', 'mm', { status: 'lost', ret: 0 }),
  bet('push', 'mm', { id: 'push', status: 'push', ret: 25 }),
  bet('cash', 'dorm', { status: 'cashed', ret: 400 }),
  bet('old', 'goob', { settledTs: NOW - 8 * DAY }),                       // more than a week ago
  bet('last', 'goob', { season: '2025' }),
  bet('pre', 'goob', { ts: 50 }),
  bet('tst', 'test'),
  bet('nots', 'goob', { settledTs: 0 }),
  /* a head to head: DORM offered, MWM took the other side and won the pot */
  bet('h2h', 'dorm', { pvp: true, status: 'lost', stake: 120, ret: 0, legs: [{ pickLabel: 'DORM moneyline', odds: -110 }] }),
  bet('h2hc', 'mwm', { pvp: true, srcBet: 'h2h', status: 'won', stake: 110, ret: 230, settledTs: NOW - DAY,
    legs: [{ pickLabel: 'MWM moneyline', odds: 110 }] }),
]);

head('which bets');
let out = []; M.ntBigHits(out);
const ids = out.map(c => c.id).sort();
ok('one card per bet that won more than $100', ids, ['bh:h2h', 'bh:just', 'bh:par']);
ok('exactly $100 is not more than $100', ids.includes('bh:even'), false);
ok('lost, pushed and cashed-out bets are not wins', ['lost', 'push', 'cash'].some(i => ids.includes('bh:' + i)), false);
ok('nothing over a week old, from last season, before the reset, or from the testing account',
  ['old', 'last', 'pre', 'tst', 'nots'].some(i => ids.includes('bh:' + i)), false);
ok('a big win is a gold card of its own', [out[0].kind, M.NT_KINDS.bighit.tone], ['bighit', 'gold']);

head('what it shows');
const par = out.find(c => c.id === 'bh:par');
ok('everybody in on the parlay who cleared $100, and only them',
  [...par.art.matchAll(/data-cr="\{(\w+)\}"/g)].map(m => m[1]), ['kunk', 'mcm']);
ok('how much each one won', (par.art.match(/\+\$1051\.04/g) || []).length, 2);
ok('on what stake', par.art.includes('on $25.00'), true);
ok('every leg, with its price', ['BFT moneyline', 'BFT −19.5', 'MCM moneyline', 'Week 4 Top Score: BFT', '-270', '+600']
  .every(t => par.art.includes(t)), true);
ok('and what kind of bet it was', par.body, 'A 4-leg parlay at +380.');
ok('dated to the day it settled', par.day, (() => { const d = new Date(NOW - 2 * DAY); d.setUTCHours(0, 0, 0, 0); return d.getTime(); })());
const h2h = out.find(c => c.id === 'bh:h2h');
ok('a head to head is told by the side that won it, with their own leg',
  [/data-cr="\{mwm\}"/.test(h2h.art), h2h.art.includes('+$120.00'), h2h.art.includes('MWM moneyline'), h2h.art.includes('DORM moneyline')],
  [true, true, true, false]);
ok('naming who lost it', h2h.body, 'Head to head against <b>DORM FC</b>.');
ok('a single says so', out.find(c => c.id === 'bh:just').body, 'A single at +100.');

head('reading the league');
M.setBets(null);
out = []; M.ntBigHits(out);
ok('no bets in hand: no cards, and they are asked for', [out.length, M.asked()], [0, 1]);
M.ntBigHits([]);
ok('but not again inside two minutes', M.asked(), 1);
M.setMe(null);
out = []; M.ntBigHits(out);
ok('nobody signed in: nothing asked, nothing shown', [out.length, M.asked()], [0, 1]);

console.log(NL + (fail ? 'FAILED  ' : 'ok  ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
