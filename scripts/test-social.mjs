/* SOCIAL: EVERY BET AND EVERY TRADE IN THE LEAGUE, AS ONE FEED.
 *
 *   ONE BET, ONE CARD   a shared bet's seats and a head-to-head's reply are
 *                       gathered under the bet they joined, never shown twice
 *   ONLY WHO IS IN      voided, declined and unanswered invitations are nobody
 *                       being in on anything; a head-to-head still waiting on
 *                       its answer is shown as waiting
 *   EVERY TRADE         buys, sales, shorts and covers of teams, funds and
 *                       coins, read off every manager's investment ledger
 *   THIS SEASON         and newest first, across both
 *
 * Run: node scripts/test-social.mjs
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

const ACCT = { bft: 10, kunk: 7, kw: 11, mcm: 2, fman: 5, mm: 1, dorm: 6 };
const M = assemble(grab, [
  'const nflSeasonOfMs=', 'const pkCash=',
  'const SB_SOCIAL_PAGE=', 'let _sbSocialN=', 'const SB_SOCIAL_LIVE=', 'const SB_SOCIAL_VERB=',
  'function sbSocialItems(){', 'function sbSocialAgo(t){', 'function sbSocialHTML(){',
], ['sbSocialItems', 'sbSocialHTML', 'setBets', 'setRows', 'setFilter', 'setN'], [
  'let _betsAll=null, _pkBetsLast=null, _cpRows=[];',
  'let _sbSocialRows=null;',
  'const setBets=b=>{_betsAll=b;}; const setRows=r=>{_cpRows=r;};',
  "const TEST_PROFILE='test';",
  'const sbSeason=()=>2026;',
  'const betsAfterReset=b=>Number(b.ts||0)>=100;',
  'const sbSocialWant=()=>{};',
  `const ACCT=${JSON.stringify(ACCT)};`,
  'const betAccountTeam=k=>ACCT[k]||0;',
  'let _teams=Object.entries(ACCT).map(([k,id])=>({id,name:k.toUpperCase()+" FC",abbrev:k.toUpperCase()}));',
  'const teamInitials=n=>String(n).slice(0,2);',
  'const avatarHTML=t=>`<i data-av="${t.id}"></i>`;',
  'const amFmt=v=>(v>0?"+":"")+v;',
  'const INV={coin1:{name:"Puka Nacua",pid:9}}, FUNDS={fundE:{name:"East ETF"}};',
  'const invCoin=k=>INV[k]||null; const invFund=k=>FUNDS[k]||null;',
  'let _franchises=[{owner:"{MM}",name:"Marathon Men"}];',
  'const playerImg=pid=>`<i data-pl="${pid}"></i>`;',
  'const franchiseAvatar=f=>`<i data-fr="${f.owner}"></i>`;',
  'const invShFmt=v=>String(+Number(v).toFixed(2));',
  'const invFmt=v=>"$"+Number(v).toFixed(2);',
  'const bucks2=v=>Math.round((Number(v)||0)*100)/100; const bucksCents=v=>bucks2(v).toFixed(2);',
  'const setFilter=f=>{_sbSocialF=f;}; const setN=n=>{_sbSocialN=n;};',
].join(NL));

const T = (d, h = 12) => Date.UTC(2026, 9, d, h);                 // October 2026
const bet = (id, owner, extra = {}) => ({ id, owner, season: '2026', status: 'open', ts: T(1),
  stake: 25, payout: 120, odds: 380, legs: [{ mk: 'wk5-1-6-ml', mkLabel: 'Week 5 · MM vs DORM', pickLabel: 'MM moneyline', odds: -145 }], ...extra });
const legs3 = [1, 2, 3].map(i => ({ mk: 'm' + i, pickLabel: 'Leg ' + i, odds: 100 + i }));

M.setBets([
  bet('r1', 'bft', { ts: T(3), legs: legs3, stake: 25, payout: 300 }),         // shared parlay
  bet('s1', 'kunk', { ts: T(3, 13), srcBet: 'r1', legs: legs3 }),              //   seat taken
  bet('s2', 'kw', { ts: T(3, 14), srcBet: 'r1', status: 'invite' }),           //   not answered
  bet('s3', 'mcm', { ts: T(3, 15), srcBet: 'r1', status: 'declined' }),        //   said no
  bet('p1', 'fman', { ts: T(4), pvp: true, status: 'offer', vs: 'bft', payout: 50 }),   // h2h waiting
  bet('c1', 'bft', { ts: T(4), pvp: true, status: 'challenge', srcBet: 'p1' }),
  bet('p2', 'mm', { ts: T(2), pvp: true, payout: 50, stake: 30 }),             // h2h accepted
  bet('c2', 'dorm', { ts: T(2), pvp: true, srcBet: 'p2', stake: 20,
    legs: [{ mk: 'wk5-1-6-ml', pickLabel: 'DORM moneyline', odds: 145 }] }),
  bet('v1', 'kw', { ts: T(5), status: 'void' }),
  bet('h1', 'mcm', { ts: T(5), status: 'lost', hidden: true }),
  bet('old', 'kw', { ts: T(5), season: '2025' }),
  bet('pre', 'kw', { ts: 50 }),
  bet('cash', 'mcm', { ts: T(1, 9), status: 'cashed' }),
]);
M.setRows([
  { id: 'bft', teamId: '10', inv: JSON.stringify([
    { o: '{MM}', t: T(6), k: 'b', s: 2, p: 10.5 },
    { o: 'coin1', t: T(6, 14), k: 'so', s: 3, p: 8 },
    { o: 'fundE', t: T(2, 18), k: 's', s: 1.5, p: 12 },
    { o: '{MM}', t: Date.UTC(2025, 10, 1), k: 'b', s: 1, p: 9 },             // last season
    { o: '{MM}', t: T(6), k: 'x', s: 1, p: 9 },                                // not a trade
  ]) },
  { id: 'test', teamId: '7', inv: JSON.stringify([{ o: '{MM}', t: T(7), k: 'b', s: 1, p: 1 }]) },
  { id: 'kw', teamId: '11', inv: 'not json' },
  { id: 'mm', teamId: '1' },
]);

head('one bet, one card');
const items = M.sbSocialItems();
const bets = items.filter(i => i.kind === 'bet');
ok('four bets are worth telling', bets.map(i => i.b.id).sort(), ['cash', 'p1', 'p2', 'r1']);
ok('a seat is told under its bet, not on its own', bets.some(i => ['s1', 'c1', 'c2'].includes(i.b.id)), false);
ok('the shared parlay carries the seat that was taken, and only that one',
  bets.find(i => i.b.id === 'r1').seats.map(s => s.id), ['s1']);
ok('voided, hidden, last season and pre-reset bets are left out',
  bets.some(i => ['v1', 'h1', 'old', 'pre'].includes(i.b.id)), false);
ok('a head-to-head nobody has answered is waiting', bets.find(i => i.b.id === 'p1').waiting, true);
ok('one that was answered carries the other side', bets.find(i => i.b.id === 'p2').seats.map(s => s.id), ['c2']);

head('every trade');
const trades = items.filter(i => i.kind === 'inv');
ok('three trades this season from the ledgers', trades.map(i => i.l.k), ['so', 'b', 's']);
ok('the testing account, last season and a non-trade line are left out',
  trades.some(i => i.acct === 'test' || i.l.k === 'x' || i.l.p === 9), false);

head('newest first, across both');
ok('in time order', items.map(i => i.t).every((t, k, a) => !k || a[k - 1] >= t), true);
ok('the newest is the short', items[0].kind === 'inv' && items[0].l.k === 'so', true);

head('the cards');
let html = M.sbSocialHTML();
ok('every card is drawn', (html.match(/class="soc-item/g) || []).length, items.length);
ok('the shared parlay names both people and stacks both crests',
  /BFT &amp; KUNK|BFT & KUNK/.test(html) && /data-av="10"[\s\S]*?data-av="7"/.test(html), true);
ok('and says the stake is each', html.includes('$25 each'), true);
ok('a parlay says how many legs', html.includes('Parlay · 3 legs'), true);
ok('a head-to-head shows both sides and the pot',
  html.includes('MM <em>vs</em> DORM') && html.includes('DORM moneyline') && html.includes('Pot $50'), true);
ok('a waiting one says who it waits on', html.includes('waiting on BFT'), true);
ok('a cashed bet says so', html.includes('Cashed out'), true);
ok('a buy says what it cost', html.includes('Bought') && html.includes('2 shares of') && html.includes('$21'), true);
ok('a short of a coin is in coins, with no total', html.includes('Shorted') && html.includes('3 coins of')
  && html.includes('Puka Nacua') && html.includes('at $8.00</span>'), true);
ok('a fund is named', html.includes('East ETF'), true);

head('filters and paging');
M.setFilter('bets');
html = M.sbSocialHTML();
ok('Bets shows only bets', (html.match(/soc-inv/g) || []).length === 0 && /soc-item/.test(html), true);
M.setFilter('inv');
html = M.sbSocialHTML();
ok('Investments shows only trades', (html.match(/class="soc-item soc-inv/g) || []).length, 3);
M.setFilter('all'); M.setN(2);
html = M.sbSocialHTML();
ok('a page at a time, with a way to see more',
  (html.match(/class="soc-item/g) || []).length === 2 && html.includes('sbSocialMore()'), true);

console.log(NL + (fail ? 'FAILED  ' : 'ok  ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
