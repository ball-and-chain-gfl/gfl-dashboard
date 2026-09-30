/* A BET WITH NO HOUSE IN IT HAS TO BALANCE, EXACTLY.
 *
 * Every other market on this board is underwritten: the bank takes the stake and
 * conjures the winnings at settlement, so an arithmetic slip there costs the bank
 * -- which does not exist -- and nobody notices. A head to head is funded by the
 * two managers in it and by nothing else, so the same slip is one of them being
 * paid money the other one never put up, out of a balance that is derived by
 * replaying the ledger and will therefore never add up again.
 *
 * So the property under test is one sentence: RET_A + RET_B == STAKE_A + STAKE_B,
 * on every outcome, at every price, for every pot. Won, lost, pushed, declined,
 * pulled back, lapsed -- all of them.
 *
 * The second thing here is the derived opposite side. betWeekResult reads a
 * spread's sign and number off the END OF pickLabel rather than out of the market
 * key, so the label sbPvpOpposite builds is load-bearing: get it even slightly
 * wrong and the other half of the bet grades against a line nobody wrote, or
 * comes back null and sits open forever with the stake gone. Section 6 grades
 * both halves of a real fixture against real scorelines and checks they are
 * mirrors.
 *
 * Run: node scripts/test-pvp.mjs
 */
import fs from 'fs';
import { lifter } from './lib/lift.mjs';

const NL = String.fromCharCode(10);
let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; return; }
  fail++;
  console.log('  FAIL  ' + name + NL + '          got  ' + g + NL + '          want ' + w);
};
const ok = (name, cond) => eq(name, !!cond, true);
const head = t => console.log(NL + t);

const grab = lifter(new URL('../public/app.js', import.meta.url));

/* ── harness A: the money ──────────────────────────────────────────────────── */
const moneyParts = [
  grab('function probFromAm(o){'),
  grab('function amFromProb(p){'),
  grab('const bucks2='),
  grab('function sbPvpShares(stake,myOdds,theirOdds){'),
  grab('const PVP_MK='),
  grab('function sbPvpLeg(){'),
  grab('const betIsLive=b=>'),
  grab('const betIsPvp=b=>'),
  grab('const betPending=b=>'),
  grab('const betsAfterReset=b=>'),
  grab('const betsMine=()=>'),
  grab('function betsClearable(){'),
  grab('let _bkScope=null;'),
  grab('const bkBets='),
  grab('const betsLiveAll=()=>'),
  grab('function bucksStaked(){'),
  grab('function bucksReturned(){'),
  grab('function bucksBalance(){'),
  grab('function betGrade(bet){'),
  grab('function pvpReconcileTo(offer,other,shut){'),
  grab('const pvpLapsed=b=>'),
  grab('function ntPvp(out){'),
  grab('const CASHOUT_HOLD='),
  grab('const CASHOUT_MIN='),
  grab('function betCashOut(b){'),
  grab('function betCancellable(b){'),
];

const moneyHarness = `
let _bets=[], _me=null, _CFG={betsResetBefore:0}, _slip=[], _LEG=null;
const BUCKS_WEEKLY=1000;
const bucksWeekKey=()=>'W2';
/* the bank's own accrual is test-bank-egg's job; one flat allowance here */
const bucksAllowance=()=>BUCKS_WEEKLY;
const eggBucks=()=>0;
/* betGrade asks this per leg, and betCashOut walks it too */
const betLegResult=()=>_LEG;
const betLegWeek=()=>2;
const betLegProb=()=>0.5;
const betWeekInPlay=()=>false;
const betSeasonInPlay=()=>false;
const getSeason=()=>'2026';
/* ntPvp draws a card; what is under test is WHICH bets get one, so everything
   it decorates with answers plainly and the shut predicate is a switch. */
let _SHUT=false;
const pvpShut=()=>_SHUT;
const ntDayOf=t=>t;
const ntWeekOf=()=>4;
const bucksFmt=v=>'$'+v;
const betAccountName=k=>'NAME:'+k;
const betAccountOwner=k=>'OWN:'+k;
const ntStat=(o,n,v,l,w)=>[o,n,v,l,w].join('|');
${moneyParts.join(NL)}
return { set(b,me){ _bets=b; _me=me; }, setSlip(s){ _slip=s; }, setLeg(v){ _LEG=v; },
  setShut(v){ _SHUT=v; }, feed(){ const o=[]; ntPvp(o); return o; },
  sbPvpShares, sbPvpLeg, PVP_MK, probFromAm, amFromProb, bucks2,
  betGrade, betIsLive, betIsPvp, betPending, betCashOut, betCancellable, pvpReconcileTo,
  bucksBalance, bucksStaked, bucksReturned,
  clearable:()=>betsClearable().map(b=>b.id) };`;
const M = new Function(moneyHarness)();

/* ── harness B: the opposite side, and whether it grades ───────────────────── */
const gradeParts = [
  grab('function sbPvpOpposite(leg){'),
  grab('function weeksOf(schedule){'),
  grab('const weekDecided='),
  grab('const weekScored='),
  grab('function weekOver(byWeek,w){'),
  grab('function betWeekResult(leg,season,wk){'),
];
const gradeHarness = `
let _seasonMeta={}, _GAME=null, _lineups=null;
const sbWeekData=()=>({games:_GAME?[_GAME]:[]});
const loadLineups=()=>{};
const sbFinals=()=>null;
const regEndOf=()=>14;
${gradeParts.join(NL)}
return { setGame(g){ _GAME=g; }, setMeta(m){ _seasonMeta=m; },
  sbPvpOpposite, betWeekResult };`;
const G = new Function(gradeHarness)();

const B = o => Object.assign({ team: '', season: '2026', wk: 'W2', ts: 5, odds: -100,
  stake: 0, payout: 0, ret: 0, legs: [{ mk: 'wk2-1-2-sp' }], status: 'open', settledTs: 0,
  invitedBy: '', srcBet: '', pvp: false, vs: '', hidden: false }, o);
const ME = { k1: 'bfl', teamId: 1 };

/* ══ 1 ══════════════════════════════════════════════════════════════════════ */
head('1. the board\'s two sides are not complements, and de-vigging makes them');
{
  /* both sides of a spread go out at -115 */
  eq('-115 implies 53.49%', Math.round(M.probFromAm(-115) * 10000) / 100, 53.49);
  eq('the pair sums past 100', Math.round((M.probFromAm(-115) * 2) * 10000) / 100, 106.98);

  /* the FIRST argument is my own stake now, and everything else follows it */
  const sp = M.sbPvpShares(25, -115, -115);
  eq('a spread de-vigs to dead even', sp.fair, 0.5);
  eq('so they are asked for the same', [sp.mine, sp.theirs, sp.pot], [25, 25, 50]);
  eq('and the effective price is even money', sp.odds, -100);
  ok('which beats the -115 the board was charging', sp.odds > -115);

  /* and the case the whole thing exists to get right */
  const ml = M.sbPvpShares(34.21, -260, 200);
  eq('a -260 favourite is 68.42% once de-vigged', Math.round(ml.fair * 10000) / 100, 68.42);
  eq('laying 34.21 asks the dog for 15.79', [ml.mine, ml.theirs, ml.pot], [34.21, 15.79, 50]);
  eq('and both real prices come off the same pot', [ml.odds, ml.oddsThem], [-220, 225]);
  eq('the dog laying 15.79 asks the same back', M.sbPvpShares(15.79, 200, -260).theirs, 34.21);
}

/* ══ 2 ══════════════════════════════════════════════════════════════════════ */
head('2. and equal stakes at the board\'s own prices would not have funded it');
{
  /* what the old design would have owed: each side's stake times its decimal
     price. This is the number that has to be UNDER the pot and is not. */
  const owed = (stake, am) => M.bucks2(stake * (am > 0 ? 1 + am / 100 : 1 + 100 / Math.abs(am)));
  eq('dog +200 on $25 is owed', owed(25, 200), 75);
  eq('but the pot only holds', 50, 50);
  ok('so equal stakes are short by $25', owed(25, 200) - 50 === 25);
  /* the de-vigged pair, on the same $50, is exact */
  const sh = M.sbPvpShares(15.79, 200, -260);
  eq('de-vigged, the dog is owed exactly the pot', sh.pot, M.bucks2(sh.mine + sh.theirs));
}

/* ══ 3 ══════════════════════════════════════════════════════════════════════ */
head('3. the pot is the sum of the rounded shares, at every price and stake');
{
  let mismatched = 0, tested = 0, freeRide = 0, flagged = 0;
  const prices = [[-115, -115], [-260, 200], [200, -260], [-1000, 650], [650, -1000],
                  [-105, -125], [-500, 350], [120, -140]];
  for (const [a, b] of prices) {
    for (let cents = 2; cents <= 40000; cents += 7) {
      const sh = M.sbPvpShares(cents / 100, a, b);   // cents is MY stake
      tested++;
      /* the one property everything else rests on */
      if (M.bucks2(sh.mine + sh.theirs) !== sh.pot) mismatched++;
      /* a share that rounded to nothing has to be REFUSED, not merely noticed */
      const degenerate = !(sh.mine > 0) || !(sh.theirs > 0);
      if (degenerate) flagged++;
      if (degenerate !== !sh.min) freeRide++;
    }
  }
  eq('combinations checked', tested, 8 * Math.ceil((40000 - 2 + 1) / 7));
  eq('a pot that does not equal its two shares', mismatched, 0);
  eq('a side asked for nothing that was not refused', freeRide, 0);
  ok('and the long prices do produce some to refuse', flagged > 0);

  /* the actual hole: two cents at -1000/+650 leaves the dog staking nothing for
     a shot at the pot, which is a free option rather than a bet */
  const degen = M.sbPvpShares(0.02, -1000, 650);
  eq('the underdog share rounds away', [degen.mine, degen.theirs], [0.02, 0]);
  eq('so the pair is not offerable', degen.min, false);
  ok('while an ordinary stake at the same price is', M.sbPvpShares(20, -1000, 650).min);

  /* rounding goes UP on both halves at the smallest size there is, so the real
     pot is a cent more than the typed one -- solvent, and the panel shows the
     summed figure rather than what was typed */
  const tiny = M.sbPvpShares(0.01, -115, -115);
  eq('a one-cent stake makes a two-cent pot', [tiny.mine, tiny.theirs, tiny.pot], [0.01, 0.01, 0.02]);
}

/* ══ 4 ══════════════════════════════════════════════════════════════════════ */
head('4. every outcome is zero sum: what one side gets, the other side put up');
{
  const sh = M.sbPvpShares(34.21, -260, 200);
  const mine = B({ id: 'm', owner: 'bfl', pvp: true, stake: sh.mine, payout: sh.pot });
  const them = B({ id: 't', owner: 'kunk', pvp: true, stake: sh.theirs, payout: sh.pot });

  M.setLeg(true);
  const wonMine = M.betGrade(mine);
  M.setLeg(false);
  const lostThem = M.betGrade(them);
  eq('the winner takes the pot', wonMine, { status: 'won', ret: 50 });
  eq('the loser takes nothing', lostThem, { status: 'lost', ret: 0 });
  eq('rets sum to the two stakes', M.bucks2(wonMine.ret + lostThem.ret),
     M.bucks2(mine.stake + them.stake));

  /* the other way round, so the asymmetric price is exercised in both directions */
  M.setLeg(false);
  const lostMine = M.betGrade(mine);
  M.setLeg(true);
  const wonThem = M.betGrade(them);
  eq('and the same when the dog lands', M.bucks2(lostMine.ret + wonThem.ret),
     M.bucks2(mine.stake + them.stake));
  eq('the dog is paid the whole pot too', wonThem.ret, 50);

  /* a push hands each side its own share back, which is also zero sum */
  M.setLeg('push');
  eq('a push returns my share', M.betGrade(mine), { status: 'push', ret: 34.21 });
  eq('and theirs', M.betGrade(them), { status: 'push', ret: 15.79 });
  eq('still balanced', M.bucks2(34.21 + 15.79), M.bucks2(mine.stake + them.stake));
}

/* ══ 5 ══════════════════════════════════════════════════════════════════════ */
head('5. escrow: the offer holds money, the challenge does not');
{
  /* my sent-and-unanswered half */
  M.set([B({ id: 'off', owner: 'bfl', pvp: true, status: 'offer', stake: 25, payout: 50 })], ME);
  eq('an offer is live, so it is staked', M.bucksStaked(), 25);
  eq('nothing is back yet', M.bucksReturned(), 0);
  eq('and the balance is down my share', M.bucksBalance(), 975);
  ok('it counts as pending', M.betPending({ status: 'offer' }));
  ok('and it is not sweepable off the page', M.clearable().length === 0);

  /* the half sitting in somebody else's ledger, unanswered */
  M.set([B({ id: 'ch', owner: 'bfl', pvp: true, status: 'challenge', stake: 25, payout: 50 })], ME);
  eq('a challenge is not live', M.betIsLive({ status: 'challenge' }), false);
  eq('so nothing is staked on it', M.bucksStaked(), 0);
  eq('and the balance is untouched', M.bucksBalance(), 1000);

  /* declined: their half never was a bet */
  M.set([B({ id: 'ch', owner: 'bfl', pvp: true, status: 'declined', stake: 25, payout: 50 })], ME);
  eq('a declined challenge stakes nothing', M.bucksBalance(), 1000);

  /* voided: my half was a bet and is now not, so the share comes back whole */
  M.set([B({ id: 'off', owner: 'bfl', pvp: true, status: 'void', stake: 25, ret: 25, payout: 50 })], ME);
  eq('a void with ret=stake is a round trip', M.bucksBalance(), 1000);
  eq('staked and returned both count it', [M.bucksStaked(), M.bucksReturned()], [25, 25]);
  eq('and now it can be cleared', M.clearable(), ['off']);

  /* THE BUG THIS GUARDS: a void written with ret=0 silently eats the stake,
     because bucksReturned only adds ret for anything that is not 'open'. */
  M.set([B({ id: 'off', owner: 'bfl', pvp: true, status: 'void', stake: 25, ret: 0, payout: 50 })], ME);
  eq('a void with ret=0 would have eaten it', M.bucksBalance(), 975);

  /* matched and running: both halves are ordinary open bets from here */
  M.set([B({ id: 'm', owner: 'bfl', pvp: true, status: 'open', stake: 25, payout: 50 })], ME);
  eq('a matched half is staked', M.bucksStaked(), 25);
  eq('and unsettled, so nothing is back', M.bucksReturned(), 0);
}

/* ══ 6 ══════════════════════════════════════════════════════════════════════ */
head('6. the derived opposite side is a real, gradeable ticket');
{
  /* one fixture: team 1 favoured by 6.5 over team 2 */
  G.setGame({ week: 2, spread: 6.5, favA: true, mlA: -260, mlB: 200,
    a: { tid: 1, owner: 'A', name: 'Alpha' }, b: { tid: 2, owner: 'B', name: 'Beta' } });

  const mine = { mk: 'wk2-1-2-sp', mkLabel: 'Week 2 spread', pick: 'A:sp',
    pickLabel: 'Alpha −6.5', odds: -115 };
  const opp = G.sbPvpOpposite(mine);
  eq('the other side is the other team', opp.pick, 'B:sp');
  eq('it is given the points it was giving', opp.pickLabel, 'Beta +6.5');
  eq('on the same market key', opp.mk, mine.mk);
  eq('at the same price', opp.odds, -115);

  /* and back again, which is the cheapest check that the sides really are a pair */
  eq('the opposite of the opposite is me', G.sbPvpOpposite(opp).pick, mine.pick);

  /* the moneyline branch is written for when PVP_MK opens up to it */
  const mlMine = { mk: 'wk2-1-2-ml', mkLabel: 'Week 2', pick: 'A:ml', pickLabel: 'Alpha moneyline', odds: -260 };
  eq('a moneyline flips to the other team at its own price',
     [G.sbPvpOpposite(mlMine).pick, G.sbPvpOpposite(mlMine).odds], ['B:ml', 200]);

  /* ...but the slip only offers it on a spread for now */
  M.setSlip([{ mk: 'wk2-1-2-sp' }]);
  ok('a lone spread leg qualifies', !!M.sbPvpLeg());
  M.setSlip([{ mk: 'wk2-1-2-ml' }]);
  ok('and so does a lone moneyline', !!M.sbPvpLeg());
  M.setSlip([{ mk: 'wk2-1-2-tot' }]);
  eq('a total does not: it has no opposing TEAM, only a number', M.sbPvpLeg(), null);
  M.setSlip([{ mk: 'wk2-1-2-sp' }, { mk: 'wk2-3-4-sp' }]);
  eq('and a parlay never will', M.sbPvpLeg(), null);

  /* NOW GRADE BOTH HALVES against real scorelines. weekOver wants every fixture
     in the week to hold points, so the week is these two and nobody else. */
  /* winner as well as the points: weekOver takes "every fixture decided" OR
     "every fixture scored AND a later week has started", and one fixture in one
     week can only ever satisfy the first. Without it betWeekResult answers null
     for every scoreline below and the section passes nothing while looking
     like it ran. */
  const meta = sc => ({ owners: { 1: 'A', 2: 'B' }, schedule: [{ matchupPeriodId: 2,
    winner: sc[0] > sc[1] ? 'HOME' : sc[0] < sc[1] ? 'AWAY' : 'TIE',
    home: { teamId: 1, totalPoints: sc[0] }, away: { teamId: 2, totalPoints: sc[1] } }] });
  const both = sc => { G.setMeta({ 2026: meta(sc) });
    return [G.betWeekResult(mine, '2026', 2), G.betWeekResult(opp, '2026', 2)]; };

  eq('favourite wins by more than the line', both([120, 110]), [true, false]);
  eq('favourite wins by less than it', both([112, 110]), [false, true]);
  eq('the dog wins outright', both([100, 110]), [false, true]);
  eq('exactly on the line pushes BOTH sides', both([116.5, 110]), ['push', 'push']);

  /* and the moneyline, which is the side of this that has real money riding on
     the de-vig: the two halves are different prices and different stakes */
  const mlOpp = G.sbPvpOpposite(mlMine);
  const bothMl = sc => { G.setMeta({ 2026: meta(sc) });
    return [G.betWeekResult(mlMine, '2026', 2), G.betWeekResult(mlOpp, '2026', 2)]; };
  eq('the favourite wins it', bothMl([120, 110]), [true, false]);
  eq('the dog wins it', bothMl([100, 110]), [false, true]);
  eq('a one-point win is still a win', bothMl([111, 110]), [true, false]);
  eq('a dead heat pushes both', bothMl([110, 110]), ['push', 'push']);
  /* never the same answer twice, which is the shape of a bet that cannot balance */
  const scorelines = [[120, 110], [112, 110], [100, 110], [116.5, 110], [130, 90], [90, 130]];
  const sameAnswer = scorelines.filter(sc => { const [x, y] = both(sc); return x === y && x !== 'push'; });
  eq('no scoreline pays or loses both halves', sameAnswer, []);
}

/* ══ 7 ══════════════════════════════════════════════════════════════════════ */
head('7. there is nobody to sell it back to');
{
  M.setLeg(null);
  const pvp = B({ id: 'm', owner: 'bfl', pvp: true, status: 'open', stake: 25, payout: 50 });
  M.set([pvp], ME);
  const co = M.betCashOut(pvp);
  eq('cash out is refused with a reason, not hidden', co.ok, false);
  ok('and the reason says why', /nobody to sell it back to/.test(co.why));
  eq('so it is not cancellable either', M.betCancellable(pvp), false);

  /* the same ticket without the marker is an ordinary bet and still is one */
  const house = B({ id: 'h', owner: 'bfl', status: 'open', stake: 25, payout: 50 });
  M.set([house], ME);
  ok('an ordinary bet can still be bought back', M.betCancellable(house));
}

/* ══ 8 ══════════════════════════════════════════════════════════════════════ */
head('8. you type your own stake, and their side and the pot follow it');
{
  /* THE SAME STAKE ON EITHER SIDE MAKES A DIFFERENT POT, which is exactly why
     this is the end you want to hold: what leaves your account is the number
     you chose, and the one you cannot work out in your head is the one the app
     works out. Backing your whole balance used to mean dividing it by a
     fraction nobody had shown you. */
  const even = M.sbPvpShares(25, -115, -115);
  const fav  = M.sbPvpShares(25, -260, 200);
  const dog  = M.sbPvpShares(25, 200, -260);
  eq('at even money, 25 each and a 50 pot', [even.theirs, even.pot], [25, 50]);
  eq('a favourite laying 25 asks for less', [fav.theirs, fav.pot], [11.54, 36.54]);
  eq('a dog laying 25 asks for more', [dog.theirs, dog.pot], [54.17, 79.17]);

  /* whatever the side, the stake out is the stake in -- no rounding on my half */
  [even, fav, dog].forEach((sh, i) => eq('stake ' + i + ' is exactly what was typed', sh.mine, 25));
  eq('and every pot is still its two shares',
     [even, fav, dog].map(sh => sh.pot === M.bucks2(sh.mine + sh.theirs)), [true, true, true]);

  /* the prices are struck against the realised pot, so they hold either way round */
  eq('favourite lays -220, dog is paid +225', [fav.odds, dog.odds], [-220, 225]);
  eq('and each side sees the other price', [fav.oddsThem, dog.oddsThem], [225, -220]);

  /* all in is now a number you can simply type */
  const allIn = M.sbPvpShares(400, -260, 200);
  eq('a whole 400 balance goes straight in', allIn.mine, 400);
  ok('and the pot it makes is bigger than the balance', allIn.pot > 400);
}

/* == 9 ===================================================================== */
head('9. the challenger half only ever follows a decision already made');
{
  const offer = B({ id: 'off', owner: 'bfl', pvp: true, status: 'offer', stake: 25, payout: 50 });
  const half = st => B({ id: 'ch', owner: 'kunk', pvp: true, status: st, srcBet: 'off', stake: 25, payout: 50 });
  const R = (other, shut) => M.pvpReconcileTo(offer, other, shut);

  eq('unanswered and nothing kicked off: wait', R(half('challenge'), false), null);
  eq('they are in: mine opens alongside', R(half('open'), false), { status: 'open', ret: 0 });
  eq('they said no: my share comes back', R(half('declined'), false), { status: 'void', ret: 25 });
  eq('their half was voided: same', R(half('void'), false), { status: 'void', ret: 25 });
  eq('never answered and the football is on: void', R(half('challenge'), true), { status: 'void', ret: 25 });
  eq('no counterpart at all, and kickoff: void', R(null, true), { status: 'void', ret: 25 });
  eq('no counterpart, no kickoff: wait', R(null, false), null);

  /* AN ACCEPTED PAIR IS ACCEPTED WHATEVER THE CLOCK SAYS. Consulting the football
     before the other half would void a matched bet the instant its week kicked
     off -- handing the stake back on a bet that is being played. */
  eq('a matched pair survives its own kickoff', R(half('open'), true), { status: 'open', ret: 0 });

  /* == THE ONE THAT SHIPPED BROKEN ====================================
     nflWeekBegun answers null until the scoreboard digest lands, about two
     seconds after the page opens, and the old predicate read that unknown as
     'the football is on'. The reconcile runs from initBets INSIDE that window,
     so a live offer was voided on page load and the accept on the other end
     was refused. An unknown must never be a reason to take money back. */
  eq('unknown, unanswered: wait, do not void', R(half('challenge'), null), null);
  eq('unknown and no counterpart yet: wait', R(null, null), null);
  eq('a caller that passed nothing at all: wait', R(half('challenge'), undefined), null);
  /* ...but an answer already given needs no scoreboard to be acted on */
  eq('they are in, digest or not', R(half('open'), null), { status: 'open', ret: 0 });
  eq('they said no, digest or not', R(half('declined'), null), { status: 'void', ret: 25 });

  /* and it will not touch anything that is not an unanswered offer of mine */
  eq('a matched half is not reconsidered',
     M.pvpReconcileTo(B({ id: 'x', status: 'open', pvp: true, stake: 25 }), half('open'), true), null);
  eq('nor a settled one',
     M.pvpReconcileTo(B({ id: 'x', status: 'won', pvp: true, stake: 25, ret: 50 }), half('open'), true), null);

  /* the void it writes is the round trip, not the stake-eating one from section 5 */
  const back = R(half('declined'), false);
  M.set([B({ id: 'off', owner: 'bfl', pvp: true, status: back.status, ret: back.ret, stake: 25, payout: 50 })], ME);
  eq('so replaying the ledger leaves the balance whole', M.bucksBalance(), 1000);
}

/* == 10 ==================================================================== */
head('10. a moneyline pair balances the same way a spread one does');
{
  /* the board prices from the fixture above */
  const sh = M.sbPvpShares(34.21, -260, 200);
  const mine = B({ id: 'm', owner: 'bfl', pvp: true, stake: sh.mine, payout: sh.pot });
  const them = B({ id: 't', owner: 'kunk', pvp: true, stake: sh.theirs, payout: sh.pot });
  eq('the stakes really are different numbers', mine.stake !== them.stake, true);
  eq('and they still add to the pot', M.bucks2(mine.stake + them.stake), sh.pot);

  /* the favourite laying more to win less, and the dog the other way -- both
     paid the same pot, which is what makes the asymmetry honest */
  M.setLeg(true);  const favWon = M.betGrade(mine);
  M.setLeg(false); const dogLost = M.betGrade(them);
  eq('favourite risks 34.21 to win 15.79', [mine.stake, M.bucks2(favWon.ret - mine.stake)], [34.21, 15.79]);
  M.setLeg(true);  const dogWon = M.betGrade(them);
  eq('dog risks 15.79 to win 34.21', [them.stake, M.bucks2(dogWon.ret - them.stake)], [15.79, 34.21]);
  eq('either way the pot is all that moves', [favWon.ret, dogWon.ret], [50, 50]);
  eq('zero sum on the favourite landing', M.bucks2(favWon.ret + dogLost.ret), sh.pot);

  /* a tie on a moneyline pushes, and a push is the one outcome where the two
     sides get back DIFFERENT amounts -- their own, which still sums to the pot */
  M.setLeg('push');
  eq('each side gets its own share back', [M.betGrade(mine).ret, M.betGrade(them).ret], [34.21, 15.79]);
  eq('summing to the pot', M.bucks2(34.21 + 15.79), sh.pot);

  /* the de-vig is the point: both sides beat the board they were quoted */
  const favPrice = sh.odds, dogPrice = M.sbPvpShares(15.79, 200, -260).odds;
  ok('the favourite lays less than -260', favPrice > -260);
  ok('and the dog is paid more than +200', dogPrice > 200);
  eq('which is the hold, handed back', [favPrice, dogPrice], [-220, 225]);
}

/* == 11 ==================================================================== */
head('11. the manager being asked is told, and stops being told');
{
  const ch = o => B({ id: 'ch', owner: 'bfl', pvp: true, status: o.st || 'challenge',
    stake: 60.24, payout: 111, invitedBy: 'mm', vs: 'mm', ts: 7,
    legs: [{ mk: 'wk4-7-3-ml', pickLabel: 'Bikini Bottom Goobers moneyline' }] });

  M.setShut(false);
  M.set([ch({})], ME);
  const cards = M.feed();
  eq('a live challenge raises one card', cards.length, 1);
  eq('of its own kind', cards[0].kind, 'pvp');
  eq('keyed to the ticket, so it cannot double up', cards[0].id, 'pvp:ch');
  eq('it names the challenger, not the account slug', cards[0].art, 'OWN:mm|NAME:mm|$60.24|to win $50.76|4');
  ok('and says which side you are being given', /Bikini Bottom Goobers moneyline/.test(cards[0].body));
  eq('tapping it goes to the bets page', cards[0].go, 'bets');

  /* the two numbers on it are the two that decide it, read off the ledger
     rather than recomputed for the card */
  eq('what you put up, and what you take off them',
     [60.24, M.bucks2(111 - 60.24)], [60.24, 50.76]);

  /* == AND IT HAS TO LEAVE ============================================== */
  M.set([ch({ st: 'open' })], ME);
  eq('answered yes: gone', M.feed().length, 0);
  M.set([ch({ st: 'declined' })], ME);
  eq('answered no: gone', M.feed().length, 0);
  M.set([ch({ st: 'void' })], ME);
  eq('withdrawn: gone', M.feed().length, 0);

  M.setShut(true);
  M.set([ch({})], ME);
  eq('market shut: gone', M.feed().length, 0);
  M.setShut(false);

  /* MY OWN HALF IS NOT NEWS TO ME. The challenger holds an 'offer', and a card
     telling you about the bet you just sent is noise on your own feed. */
  M.set([B({ id: 'off', owner: 'bfl', pvp: true, status: 'offer', stake: 50.76, payout: 111 })], ME);
  eq('my own sent offer raises nothing', M.feed().length, 0);

  /* and somebody else's challenge is not mine to answer */
  M.set([Object.assign({}, ch({}), { owner: 'kunk' })], ME);
  eq('a challenge to another manager raises nothing', M.feed().length, 0);

  /* a parlay invitation still belongs to the other card */
  M.set([B({ id: 'inv', owner: 'bfl', status: 'invite', invitedBy: 'mm', stake: 25 })], ME);
  eq('an ordinary invitation is not one of these', M.feed().length, 0);
}

console.log(NL + (fail ? 'FAILED  ' : 'ok  ') + pass + ' passed' + (fail ? ', ' + fail + ' failed' : ''));
process.exit(fail ? 1 : 0);
