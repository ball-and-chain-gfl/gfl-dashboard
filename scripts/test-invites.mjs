/* Exercises the real invite/money predicates lifted straight out of app.js, so
   the thing under test is the shipped source rather than a restatement of it. */
import fs from 'fs';
const SRC=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8').split(String.fromCharCode(13)).join('');

/* pull a named declaration out of the file by its first line, up to a line that
   starts at column 0 with } or const/function (crude but exact enough here) */
function grab(startsWith){
  const i=SRC.indexOf(startsWith);
  if(i<0) throw new Error('not found: '+startsWith);
  let j=i, depth=0, started=false;
  for(;j<SRC.length;j++){
    const c=SRC[j];
    if(c==='{'){depth++;started=true;}
    else if(c==='}'){depth--; if(started&&depth===0){ j++; break; }}
    else if(c===';'&&!started&&depth===0){ j++; break; }
  }
  return SRC.slice(i,j);
}
const parts=[
  'const INVITE_MAX=4;',
  grab('function inviteLapsed(inv){'),
  grab('const canInviteBet=b=>'),
  grab('const canInviteOn=b=>'),
  grab('const betInviteSeats=id=>'),
  grab('const CASHOUT_HOLD='),
  grab('const CASHOUT_MIN='),
  grab('const betWeekInPlay='),
  grab('function betInPlay(b){'),
  grab('function betSeasonInPlay(season){'),
  grab('function betCashOut(b){'),
  grab('function betCancellable(b){'),
  grab('const betInvitesFor=id=>'),
  grab('const betIsLive=b=>'),
  grab('const betsAfterReset=b=>'),
  grab('const betsMine=()=>'),
  grab('const betsThisWeek=()=>'),
  grab('const betsLiveThisWeek=()=>'),
  /* betsLiveAll reads through the bucks scope, so the leaderboard can run the
     same balance against another manager's ledger. Unset, it is betsMine. */
  grab('let _bkScope=null;'),
  grab('const bkBets='),
  grab('const betsLiveAll=()=>'),
  grab('function bucksStaked(){'),
  grab('function bucksReturned(){'),
  grab('function bucksBalance(){'),
];

const harness=`
let _bets=[], _me=null, _CFG={betsResetBefore:0}, _WEEK='W2', _STARTED=false;
const BUCKS_WEEKLY=1000;
const bucksWeekKey=()=>_WEEK;
const weekHasStarted=()=>_STARTED;
/* The bank's own arithmetic — how many allowances have accrued, what the egg
   hunt has paid — is covered by test-bank-egg.mjs. Held flat here so these
   cases stay about invitations: one allowance, no eggs. */
const bucks2=v=>Math.round(((Number(v)||0)+Number.EPSILON)*100)/100;
const bucksAllowance=()=>BUCKS_WEEKLY;
const eggBucks=()=>0;
/* betCancellable is a thin wrapper over betCashOut, which walks a ticket's legs
   to price a buy-back. These stubs put the football exactly where each case
   below needs it: nothing graded yet, one weekly leg, and two SEPARATE flags
   for the state of the football.

   Two, because one was the bug. _STARTED is "a fantasy point has landed" and
   _KICKED is "the ball is in the air", and the whole of the week 1 opener sat
   in the gap between them -- kicked off, nothing scored yet -- where a stub
   with a single flag has nothing to say. */
const getSeason=()=>'2026';
let _KICKED=false;
let _LEGWK=2;
const betLegWeek=()=>_LEGWK;   // null is what a season-long market answers
const betLegResult=()=>null;
const betWeekStarted=()=>_STARTED;
const betSeasonStarted=()=>_STARTED;
const nflWeekLive=()=>_KICKED;
const liveWeekInfo=()=>({week:2});
let _liveInfo=null;
const betLegProb=()=>0.5;
${parts.join('\n')}
return {
  set(b,me,wk,started,kicked){ _bets=b; _me=me; _WEEK=wk; _STARTED=started;
    /* undefined means "as started" — every case written before the kickoff
       flag existed described a week that had either not begun or was already
       scoring, and both of those read the same on both flags */
    _KICKED=(kicked===undefined?started:kicked); },
  setLegWeek(w){ _LEGWK=w; },
  inviteLapsed, canInviteOn, canInviteBet, betInPlay, betInviteSeats,
  betCancellable, betCashOut,
  bucksBalance, bucksStaked, betsMine, INVITE_MAX,
  feed:()=>_bets.filter(b=>_me&&b.owner===_me.k1&&b.status==='invite'&&!inviteLapsed(b)).map(b=>b.id),
  /* what renderMyBets files into a week card: betsMine, minus the cleared,
     through the same betIsLive the money is counted with */
  ledger:()=>betsMine().filter(b=>!b.hidden).filter(betIsLive).map(b=>b.id),
  /* exactly what sbPlaceBet does with a typed stake before it writes:
     round it to cents, then refuse anything past the balance */
  place:(typed)=>{
    const stake=bucks2(Math.max(0,Number(typed)||0));
    if(stake<=0) return {err:'stake'};
    if(stake>bucks2(bucksBalance())+0.005) return {err:'funds'};
    return {stake};
  },
};`;
const api=new Function(harness)();

let pass=0, fail=0;
const eq=(name,got,want)=>{
  const g=JSON.stringify(got), w=JSON.stringify(want);
  if(g===w){pass++; console.log('  ok   '+name);}
  else{fail++; console.log('  FAIL '+name+'\n         got  '+g+'\n         want '+w);}
};
const B=o=>Object.assign({team:'',season:'2026',ts:5,odds:100,payout:0,ret:0,legs:[{mk:'ml-1'}],
  status:'open',settledTs:0,invitedBy:'',srcBet:'',hidden:false},o);
const ME={k1:'bfl',teamId:1}, OTHER={k1:'kunk',teamId:2};

console.log('\n1. accepting an invitation takes the stake');
{
  const bets=[B({id:'own',owner:'bfl',wk:'W2',stake:200}),
              B({id:'inv',owner:'bfl',wk:'W2',stake:300,invitedBy:'kunk',srcBet:'src'})];
  api.set(bets,ME,'W2',false);
  eq('balance is down both stakes', api.bucksBalance(), 500);
  eq('staked counts the invited bet', api.bucksStaked(), 500);
}

console.log('\n2. you can back out of an invited bet, and only your side');
{
  const bets=[B({id:'inv',owner:'bfl',wk:'W2',stake:300,invitedBy:'kunk',srcBet:'src'}),
              B({id:'src',owner:'kunk',wk:'W2',stake:300})];
  api.set(bets,ME,'W2',false);
  eq('mine is backable', api.betCancellable(bets[0]), true);
  eq('theirs is not mine to touch', api.betCancellable(bets[1]), false);
}

console.log('\n3. nothing can be pulled once the week is under way');
{
  const bets=[B({id:'own',owner:'bfl',wk:'W2',stake:200}),
              B({id:'inv',owner:'bfl',wk:'W2',stake:300,invitedBy:'kunk',srcBet:'src'})];
  api.set(bets,ME,'W2',true);
  eq('own bet locked', api.betCancellable(bets[0]), false);
  eq('invited bet locked', api.betCancellable(bets[1]), false);
}

console.log('\n3b. and "under way" means the KICKOFF, not the first point');
{
  /* THE GAP THIS CLOSES. betCashOut asked betWeekStarted, which is "has any
     fixture of this week SCORED". Between the opening whistle of a week and
     its first fantasy point that is false -- on the night of the week 1 opener
     it was false for the better part of an hour, with the game live on screen.
     Every open ticket offered a full withdrawal for all of it: watch the first
     quarter, see your guy go down, pull your stake, nothing lost.

     The stub used to carry one flag for the state of the football, which is
     why this shipped: there was no way to write the case down. */
  const own=B({id:'own',owner:'bfl',wk:'W2',stake:200});

  /* nothing at all: a withdrawal, in full, which is right */
  api.set([own],ME,'W2',false,false);
  const before=api.betCashOut(own);
  eq('before kickoff it is a full withdrawal', !!(before&&before.ok&&before.full), true);
  eq('and it is the whole stake', before.amount, 200);

  /* KICKED OFF, NOTHING SCORED — the hole */
  api.set([own],ME,'W2',false,true);
  const gap=api.betCashOut(own);
  eq('the kickoff shuts it before a single point', !!(gap&&gap.ok), false);
  eq('and it says why', /under way/.test(gap&&gap.why||''), true);
  eq('betCancellable agrees', api.betCancellable(own), false);

  /* points on the board: shut, as it always was */
  api.set([own],ME,'W2',true,true);
  eq('still shut once the scoring starts', api.betCancellable(own), false);

  /* AN UNREADABLE SCOREBOARD FAILS SHUT. Unknown is null from nflWeekLive,
     and the choice is between briefly refusing a withdrawal and briefly
     handing a stake back on a locked ticket. Only one of those is free money. */
  api.set([own],ME,'W2',false,null);
  eq('an unknown scoreboard is treated as in play', api.betCancellable(own), false);

  /* explicitly not live and nothing scored is open again — a bet on a week
     that has not come round yet stays withdrawable */
  api.set([own],ME,'W2',false,false);
  eq('a week that has not come round is withdrawable', api.betCancellable(own), true);
}

console.log('\n4. an invitation dies at the kickoff, not at the week reset');
{
  /* THIS USED TO SAY THE OPPOSITE, and said so on purpose: "getting in on a
     parlay while the games are running is the point of it". It is not the
     point of it, it is the hole in it. Watch the first quarter, take the seat
     on the ticket that is going well, leave the other one unanswered — the
     same free look the buy-back was handing out from the other end.

     The reasoning was already written one line above inviteLapsed and stopped
     a step short: an invitation lapses at the reset because accepting it then
     "would stake this week's allowance on markets that have already been
     decided". A market half-decided is that same look at a discount. */
  const inv=B({id:'inv',owner:'bfl',wk:'W2',stake:300,status:'invite',invitedBy:'kunk',srcBet:'src'});
  const src=B({id:'src',owner:'kunk',wk:'W2',stake:300});

  /* nothing kicked off: live, and on the feed */
  api.set([inv,src],ME,'W2',false,false);
  eq('open before the football starts', api.inviteLapsed(inv), false);
  eq('and it is on the feed',           api.feed(), ['inv']);

  /* KICKED OFF, NOTHING SCORED — the gap the buy-back was leaking through */
  api.set([inv,src],ME,'W2',false,true);
  eq('the kickoff kills it before a point lands', api.inviteLapsed(inv), true);
  eq('and it leaves the feed',                    api.feed(), []);

  /* and once there are scores on the board, obviously */
  api.set([inv,src],ME,'W2',true,true);
  eq('still dead once the scoring starts', api.inviteLapsed(inv), true);

  /* an unreadable scoreboard fails shut, the same way the buy-back does */
  api.set([inv,src],ME,'W2',false,null);
  eq('an unknown scoreboard is treated as in play', api.inviteLapsed(inv), true);
}

console.log('\n4b. and nobody new can be asked in either');
{
  /* Sending shuts for the same reason accepting does: a seat offered at half
     time is priced off a line nobody could still get. */
  const own=B({id:'own',owner:'bfl',wk:'W2',stake:200});
  const theirs=B({id:'oth',owner:'kunk',wk:'W2',stake:200});
  const copy=B({id:'cp',owner:'bfl',wk:'W2',stake:200,invitedBy:'kunk',srcBet:'own'});

  api.set([own,theirs,copy],ME,'W2',false,false);
  eq('my own open bet can be opened up', api.canInviteOn(own), true);
  eq('somebody else\'s cannot',          api.canInviteOn(theirs), false);
  eq('nor can a copy I was invited onto', api.canInviteOn(copy), false);

  api.set([own,theirs,copy],ME,'W2',false,true);
  eq('the kickoff shuts sending too',     api.canInviteOn(own), false);
  /* the card needs to tell them apart: this one is mine and open, it is just
     too late — which is what puts a reason on the card instead of a gap */
  eq('but it is still my bet to open',    api.canInviteBet(own), true);
  eq('and the ticket knows it is in play', api.betInPlay(own), true);

  /* A SEASON FUTURE IS NOT A WEEK. The board leaves those open all year, so
     testing the season here would kill futures invitations from the first
     kickoff of September through to February. betLegWeek is stubbed to 2 for
     every leg above; null is what a season market answers. */
  const futures=B({id:'fut',owner:'bfl',wk:'W2',stake:200,legs:[{mk:'champ'}]});
  api.setLegWeek(null);
  api.set([futures],ME,'W2',true,true);
  eq('a season future is not in play just because a week is', api.betInPlay(futures), false);
  eq('so it can still be opened up',                          api.canInviteOn(futures), true);
  api.setLegWeek(2);
}

console.log('\n5. a pending invitation lapses at the reset and leaves the feed');
{
  const inv=B({id:'inv',owner:'bfl',wk:'W1',stake:300,status:'invite',invitedBy:'kunk',srcBet:'src'});
  api.set([inv,B({id:'src',owner:'kunk',wk:'W1',stake:300})],ME,'W2',false);
  eq('lapsed', api.inviteLapsed(inv), true);
  eq('gone from the feed', api.feed(), []);
}

console.log('\n5b. AN INVITATION RAISED THIS WEEK IS LIVE THIS WEEK');
{
  /* The bug this pins: sbSendInvite stamped the invitation with the SOURCE
     bet's week rather than the week it was being raised in. A parlay placed on
     the Monday and opened up to somebody on the Wednesday crosses the Tuesday
     reset, so the invitation arrived already lapsed and the person invited
     never saw it. Four of them went missing that way.

     Both invitations below come off the same week-1 bet. The first is stamped
     the old way and is dead on arrival; the second is stamped the way it ships
     now and is answerable. */
  const src=B({id:'src',owner:'kunk',wk:'W1',stake:300});
  const oldWay=B({id:'i1',owner:'bfl',wk:'W1',stake:300,status:'invite',invitedBy:'kunk',srcBet:'src'});
  const newWay=B({id:'i2',owner:'bfl',wk:'W2',stake:300,status:'invite',invitedBy:'kunk',srcBet:'src'});
  api.set([src,oldWay,newWay],ME,'W2',false);
  eq('stamped with the source bet week, it is lapsed on arrival',
     api.inviteLapsed(oldWay), true);
  eq('stamped with the week it was raised in, it is live',
     api.inviteLapsed(newWay), false);
  eq('and only the live one reaches the feed', api.feed(), ['i2']);
}

console.log('\n5c. A DECLINED OFFER IS NOT ONE OF YOUR BETS');
{
  /* The ledger dropped status 'invite' and kept everything else, so a DECLINED
     invitation was filed into its week and drawn as a ticket -- carrying the
     original's legs and stake, and printing "In with <them>" underneath from
     invitedBy. The league was told you were in on a parlay you had turned
     down. */
  const own   = B({id:'own',  owner:'bfl', wk:'W2', stake:100});
  const took  = B({id:'took', owner:'bfl', wk:'W2', stake:50, status:'open',
                   invitedBy:'kunk', srcBet:'s1'});
  const said  = B({id:'said', owner:'bfl', wk:'W2', stake:25, status:'declined',
                   invitedBy:'mm',   srcBet:'s2'});
  const asked = B({id:'asked',owner:'bfl', wk:'W2', stake:10, status:'invite',
                   invitedBy:'mm',   srcBet:'s3'});
  api.set([own,took,said,asked],ME,'W2',false);

  eq('the declined one is not in the ledger', api.ledger().indexOf('said'), -1);
  eq('your own bet still is',                 api.ledger().indexOf('own')>=0, true);
  eq('and one you accepted still is',         api.ledger().indexOf('took')>=0, true);
  eq('a pending invitation is not a bet yet', api.ledger().indexOf('asked'), -1);
  eq('so the week holds two, not four',       api.ledger().length, 2);
  /* it belongs in the invitations section instead, which is where it can be
     answered -- and the declined one is not there either */
  eq('the pending one is what the feed offers', api.feed(), ['asked']);

  /* and none of it was ever money */
  eq('nothing declined was staked',   api.bucksStaked(), 150);
  eq('so the balance is untouched by it', api.bucksBalance(), 1000-150);
}

console.log('\n5d. A STAKE IS MONEY, AND MONEY HERE HAS CENTS');
{
  /* sbPlaceBet rounded the stake with Math.round -- whole dollars, and it
     rounds UP. All in on $10.56 became a stake of 11, which is more than
     $10.56, so the one button whose whole job is to stake exactly what you
     have was refused for having too little. */
  const bal=b=>{ api.set([B({id:'x',owner:'bfl',wk:'W2',stake:1000-b,status:'open'})],ME,'W2',false); };

  bal(10.56);                                   // balance is 1000-989.44 = 10.56
  eq('the balance is what we think it is', api.bucksBalance(), 10.56);

  eq('ALL IN ON 10.56 IS ACCEPTED',  api.place(10.56).stake, 10.56);
  eq('and 10.55 too',                api.place(10.55).stake, 10.55);
  eq('and 10.50, the old rounding boundary', api.place(10.50).stake, 10.5);

  /* the half that said nothing: under .50 it rounded down and staked less than
     the slip had already quoted a payout on */
  eq('10.49 is staked as 10.49, not 10', api.place(10.49).stake, 10.49);
  eq('and a penny is a penny',           api.place(0.01).stake, 0.01);

  /* the guard still guards */
  eq('a stake over the balance is still refused', api.place(10.57).err, 'funds');
  eq('and one far over',                          api.place(500).err, 'funds');
  eq('nothing is not a stake',                    api.place(0).err, 'stake');
  eq('nor is a negative one',                     api.place(-5).err, 'stake');
  eq('nor is a word',                             api.place('abc').err, 'stake');

  /* a whole-dollar balance must behave exactly as it always did */
  bal(50);
  eq('a round balance still goes all in', api.place(50).stake, 50);
  eq('and one buck over is still refused', api.place(51).err, 'funds');
}

console.log('\n6. an invitation dies with the bet it came from');
{
  const inv=B({id:'inv',owner:'bfl',wk:'W2',stake:300,status:'invite',invitedBy:'kunk',srcBet:'src'});
  api.set([inv,B({id:'src',owner:'kunk',wk:'W2',stake:300,status:'void'})],ME,'W2',false);
  eq('lapsed when they pulled theirs', api.inviteLapsed(inv), true);
  eq('gone from the feed', api.feed(), []);
}

console.log('\n7. only the manager who built the bet can invite');
{
  const own=B({id:'own',owner:'bfl',wk:'W2',stake:200});
  const came=B({id:'inv',owner:'bfl',wk:'W2',stake:300,invitedBy:'kunk',srcBet:'src'});
  api.set([own,came],ME,'W2',false);
  eq('my own bet, yes', api.canInviteOn(own), true);
  eq('one I came in on, no', api.canInviteOn(came), false);
}

console.log('\n8. two people inviting the same person are two separate offers');
{
  const a=B({id:'inv-a-bfl',owner:'bfl',wk:'W2',stake:100,status:'invite',invitedBy:'kunk',srcBet:'a'});
  const b=B({id:'inv-b-bfl',owner:'bfl',wk:'W2',stake:150,status:'invite',invitedBy:'goob',srcBet:'b'});
  api.set([a,b,B({id:'a',owner:'kunk',wk:'W2',stake:100}),
            B({id:'b',owner:'goob',wk:'W2',stake:150})],ME,'W2',false);
  eq('both stand', api.feed().sort(), ['inv-a-bfl','inv-b-bfl']);
  eq('distinct document ids', a.id!==b.id, true);
}

console.log('\n9. four seats, and declining or backing out frees one');
{
  const src=B({id:'src',owner:'bfl',wk:'W2',stake:100});
  const inv=n=>B({id:'i'+n,owner:'p'+n,wk:'W2',stake:100,status:'invite',srcBet:'src',invitedBy:'bfl'});
  api.set([src,inv(1),inv(2),inv(3),inv(4)],ME,'W2',false);
  eq('four fills it', api.betInviteSeats('src'), 4);
  eq('cap is four', api.INVITE_MAX, 4);

  const declined=[src,inv(1),inv(2),inv(3),Object.assign(inv(4),{status:'declined'})];
  api.set(declined,ME,'W2',false);
  eq('a decline gives the seat back', api.betInviteSeats('src'), 3);

  const backedOut=[src,inv(1),inv(2),inv(3),Object.assign(inv(4),{status:'void'})];
  api.set(backedOut,ME,'W2',false);
  eq('so does a back-out', api.betInviteSeats('src'), 3);

  const mixed=[src,Object.assign(inv(1),{status:'open'}),inv(2),inv(3),inv(4)];
  api.set(mixed,ME,'W2',false);
  eq('accepted still holds a seat', api.betInviteSeats('src'), 4);
}

console.log('\n10. a backed-out invited bet returns the stake');
{
  const bets=[B({id:'inv',owner:'bfl',wk:'W2',stake:300,status:'void',ret:300,invitedBy:'kunk',srcBet:'src'})];
  api.set(bets,ME,'W2',false);
  eq('balance whole again', api.bucksBalance(), 1000);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail?1:0);
