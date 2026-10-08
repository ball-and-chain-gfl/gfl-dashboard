/* THE SLATE, AS THE LEAGUE HAS IT.
 *
 * Once your weekly picks are in, the picks card shows every matchup with the
 * crests of the managers on each side of it and what the sportsbook has riding
 * on each side -- straight bets and parlays alike.
 *
 *   WHO       the submitted slates on the profile rows, yours from this device
 *   MONEY     live moneyline and spread bets on the week, a parlay at its whole
 *             stake on every side it backs, counted once per side
 *   WHEN      only after your own picks are in, or once the week has begun --
 *             the same rule that keeps the Coaches' Poll sealed
 *
 * Run: node scripts/test-pickslate.mjs
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

/* week 5: BFT (10) at FMAN (5), MM (1) at DORM (6). Owners are their GUIDs. */
const OWN = { 10: '{BFT}', 5: '{FMAN}', 1: '{MM}', 6: '{DORM}' };
const GAMES = [
  { away: { teamId: 10 }, home: { teamId: 5 } },
  { away: { teamId: 1 }, home: { teamId: 6 } },
];

head('the money on each side');
const MONEY = assemble(grab, [
  'const pkFixKey=', 'let _pkBetsLast=null,_pkBetsTry=0;', 'function pkMoney(games,week){',
], ['pkMoney', 'setBets'], [
  'let _betsAll=null;',
  'const setBets=b=>{_betsAll=b;};',
  'const sbSeason=()=>2026;',
  'const betsAfterReset=b=>Number(b.ts||0)>=100;',
  `let _liveInfo={week:5, meta:{owners:${JSON.stringify(OWN)}}};`,
  'const liveWeekInfo=()=>_liveInfo;',
].join(NL));
const bet = (stake, legs, extra = {}) => ({ season: '2026', status: 'open', ts: 200, stake, legs, ...extra });
const leg = (mk, pick) => ({ mk, pick });
const ML = 'wk5-10-5-ml', SP = 'wk5-10-5-sp', ML2 = 'wk5-6-1-ml';   // the second keyed the other way round
MONEY.setBets(null);
ok('nothing loaded yet is not the same as nothing bet', MONEY.pkMoney(GAMES, 5), null);
MONEY.setBets([
  bet(40, [leg(ML, '{BFT}:ml')]),                                   // straight, BFT
  bet(25, [leg(SP, '{FMAN}:sp')]),                                  // straight, FMAN spread
  bet(10, [leg(ML, '{BFT}:ml'), leg(ML2, '{DORM}:ml')]),            // parlay across two games
  bet(6, [leg(ML, '{FMAN}:ml'), leg(SP, '{FMAN}:sp')]),             // parlay, both markets one side
  bet(15, [leg(ML, '{FMAN}:ml')], { pvp: '1' }),                    // an accepted head-to-head
  bet(99, [leg(ML, '{BFT}:ml')], { status: 'void' }),
  bet(99, [leg(ML, '{BFT}:ml')], { status: 'cashed' }),
  bet(99, [leg(ML, '{BFT}:ml')], { status: 'invite' }),
  bet(99, [leg(ML, '{BFT}:ml')], { status: 'offer' }),
  bet(99, [leg(ML, '{BFT}:ml')], { status: 'challenge' }),
  bet(99, [leg('wk4-10-5-ml', '{BFT}:ml')]),                        // last week
  bet(99, [leg(ML, '{BFT}:ml')], { season: '2025' }),
  bet(99, [leg(ML, '{BFT}:ml')], { ts: 50 }),                       // before the reset
  bet(99, [leg('wk5-pe12_34', '12')]),                              // a player market, not a side
  bet(30, [leg(ML, '{BFT}:ml')], { status: 'won' }),                // settled money still was bet
]);
const m = MONEY.pkMoney(GAMES, 5);
ok('BFT: two straight bets, one parlay', m['5-10']['10'], { straight: 70, nS: 2, parlay: 10, nP: 1 });
ok('FMAN: the spread, the head-to-head, and one parlay counted once', m['5-10']['5'], { straight: 40, nS: 2, parlay: 6, nP: 1 });
ok('the other game gets the same parlay at its whole stake', m['1-6']['6'], { straight: 0, nS: 0, parlay: 10, nP: 1 });
ok('and a side with nothing on it has no entry', m['1-6']['1'], undefined);
ok('a market keyed the other way round still lands on its fixture', !!m['1-6'], true);

head('who is on which side');
const PICKS = assemble(grab, [
  'const pkFixKey=', 'function pkNormalise(p,games){', 'function pkLeaguePicks(games,mine){',
], ['pkLeaguePicks', 'setRows', 'setMe', 'setSent'], [
  "const TEST_PROFILE='test';",
  "const pkKey=()=>'pk_2026_w5';",
  'let _me=null, _cpRows=[], _sent=false;',
  'const setRows=r=>{_cpRows=r;}; const setMe=v=>{_me=v;}; const setSent=v=>{_sent=v;};',
  'const pkSubmitted=()=>_sent; const pkHadSubmitted=()=>_sent;',
].join(NL));
const slate = o => JSON.stringify(o);
PICKS.setRows([
  { id: 'fman', teamId: '5', pk_2026_w5: slate({ '5-10': '5', '1-6': '1' }) },
  { id: 'dorm', teamId: '6', pk_2026_w5: slate({ '5-10': '10', '1-6': '6' }) },
  { id: 'mm', teamId: '1', pk_2026_w5: slate({ '0': '10', '1': '1' }) },          // an old position-keyed slate
  { id: 'mm2', teamId: '1', pk_2026_w5: slate({ '5-10': '5' }) },                  // the same team twice
  { id: 'test', teamId: '7', pk_2026_w5: slate({ '5-10': '5' }) },                 // the testing account
  { id: 'kw', teamId: '11', pk_2026_w5: 'not json' },
  { id: 'bft', teamId: '10', pk_2026_w5: slate({ '5-10': '5' }) },                 // my stale row
  { id: 'wglr', teamId: '12' },                                                    // no slate yet
]);
PICKS.setMe({ k1: 'bft', teamId: 10 }); PICKS.setSent(true);
const p = PICKS.pkLeaguePicks(GAMES, { '5-10': '10', '1-6': '6' });
ok('BFT\'s side: Dorm and me', p.by['5-10']['10'], [10, 6, 1]);
ok('Florida Man\'s side: themselves', p.by['5-10']['5'], [5]);
ok('my own slate comes from this device, not my older row', p.by['1-6']['6'], [10, 6]);
ok('an old position-keyed slate is read by team', p.by['1-6']['1'], [5, 1]);
ok('one team is counted once', [...p.pickers].sort((a, b) => a - b), [1, 5, 6, 10]);
ok('the testing account and an unreadable slate are left out', p.pickers.has(7) || p.pickers.has(11), false);
PICKS.setSent(false);
ok('a slate I have not sent is not mine to show',
  PICKS.pkLeaguePicks(GAMES, { '5-10': '10' }).by['5-10']['5'], [5, 10]);

head('a dollar is a dollar');
const C = assemble(grab, ['const pkCash='], ['pkCash'], [
  'const bucks2=v=>Math.round((Number(v)||0)*100)/100;',
  'const bucksCents=v=>bucks2(v).toFixed(2);',
].join(NL));
ok('whole dollars without cents', C.pkCash(40), '$40');
ok('cents where there are cents', C.pkCash(31.6), '$31.60');
ok('nothing is $0', C.pkCash(0), '$0');

head('the card');
const H = assemble(grab, ['const pkFixKey=', 'const pkCash=', 'function pkLeagueHTML(games,order,picks,motw,wk){'], ['pkLeagueHTML', 'setLocked', 'setMoney'], [
  'let _teams=[{id:10,name:"The Bryan Football Team",abbrev:"BFT"},{id:5,name:"Florida Man",abbrev:"FMAN"},{id:1,name:"Marathon Men",abbrev:"MM"},{id:6,name:"Team silly willy",abbrev:"DORM"},{id:12,name:"West Coast Wigglers",abbrev:"WGLR"}];',
  'let _locked=false, _money=null;',
  'const setLocked=v=>{_locked=v;}; const setMoney=v=>{_money=v;};',
  'const pkLocked=()=>_locked; const pkBetsWant=()=>{};',
  'const pkLeaguePicks=()=>({by:{"5-10":{"10":[10,6],"5":[5]},"1-6":{"6":[10,6,1]}},pickers:new Set([10,6,5,1])});',
  'const pkMoney=()=>_money;',
  'const bucks2=v=>Math.round((Number(v)||0)*100)/100; const bucksCents=v=>bucks2(v).toFixed(2);',
  'const teamInitials=n=>String(n).slice(0,2);',
  'const logoImg=id=>`<i data-logo="${id}"></i>`;',
  'const avatarHTML=t=>`<i data-av="${t.id}"></i>`;',
].join(NL));
let html = H.pkLeagueHTML(GAMES, [1, 0], { '5-10': '10', '1-6': '6' }, 1, 5);
ok('both matchups are drawn', (html.match(/class="pkl-g/g) || []).length, 2);
ok('the Matchup of the Week leads, with its badge', html.indexOf('pk-badge') < html.indexOf('data-logo="10"'), true);
ok('my sides are outlined, and only mine', (html.match(/pkl-side[^"]* on"/g) || []).length, 2);
ok('each side carries its pickers\' crests', /data-av="6"/.test(html) && /data-av="5"/.test(html), true);
ok('a side nobody took says so', html.includes('nobody'), true);
ok('money still loading shows a placeholder, not $0', html.includes('…') && !html.includes('$0'), true);
ok('it counts who has picked', html.includes('4 of 5 picked'), true);
ok('and names who has not', html.includes('Yet to pick') && /cp-yet-t[^>]*>\s*<i data-logo="12">/.test(html), true);
ok('picks can still be reopened before kickoff', html.includes('onclick="pkReopen()"'), true);
H.setMoney({ '5-10': { '10': { straight: 70, nS: 2, parlay: 10, nP: 1 } }, '1-6': {} });
html = H.pkLeagueHTML(GAMES, [1, 0], { '5-10': '10', '1-6': '6' }, 1, 5);
ok('straight and parlay money add up on the side', html.includes('$80'), true);
ok('and say what they are made of, in dollars', html.includes('$70 straight') && html.includes('$10 in 1 parlay<'), true);
ok('a side with no money reads $0, no bets', html.includes('$0') && html.includes('no bets'), true);
H.setLocked(true);
html = H.pkLeagueHTML(GAMES, [1, 0], {}, 1, 5);
ok('once the week is on it is locked, with nothing to reopen',
  html.includes('Locked') && !html.includes('pkReopen'), true);
ok('and the stragglers are no longer "yet to"', html.includes('No picks') && !html.includes('Yet to pick'), true);

head('when it opens');
{
  const SRC = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  ok('only once your picks are in, or the week has begun',
    SRC.includes('_pkRevealed=!waiting&&(sent||pkLocked());'), true);
  ok('and the grid is still the grid until then',
    SRC.indexOf('_pkRevealed=!waiting&&(sent||pkLocked());') < SRC.indexOf('if(sent&&!pkLocked()){'), true);
  ok('the league poll repaints it -- and only it -- as new picks arrive',
    SRC.includes('else if(_pkRevealed) renderWeekPicks();'), true);
}

console.log(NL + (fail ? 'FAILED  ' : 'ok  ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
