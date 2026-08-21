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
  grab('const canInviteOn=b=>'),
  grab('const betInviteSeats=id=>'),
  grab('function betCancellable(b){'),
  grab('const betInvitesFor=id=>'),
  grab('const betIsLive=b=>'),
  grab('const betsAfterReset=b=>'),
  grab('const betsMine=()=>'),
  grab('const betsThisWeek=()=>'),
  grab('const betsLiveThisWeek=()=>'),
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
const bucksAllowance=()=>BUCKS_WEEKLY;
const eggBucks=()=>0;
${parts.join('\n')}
return {
  set(b,me,wk,started){ _bets=b; _me=me; _WEEK=wk; _STARTED=started; },
  inviteLapsed, canInviteOn, betInviteSeats, betCancellable,
  bucksBalance, bucksStaked, betsMine, INVITE_MAX,
  feed:()=>_bets.filter(b=>_me&&b.owner===_me.k1&&b.status==='invite'&&!inviteLapsed(b)).map(b=>b.id),
};`;
const api=new Function(harness)();

let pass=0, fail=0;
const eq=(name,got,want)=>{
  const g=JSON.stringify(got), w=JSON.stringify(want);
  if(g===w){pass++; console.log('  ok   '+name);}
  else{fail++; console.log('  FAIL '+name+'\n         got  '+g+'\n         want '+w);}
};
const B=o=>Object.assign({team:'',season:'2026',ts:5,odds:100,payout:0,ret:0,legs:[],
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

console.log('\n4. an invitation can still be accepted mid-game');
{
  const inv=B({id:'inv',owner:'bfl',wk:'W2',stake:300,status:'invite',invitedBy:'kunk',srcBet:'src'});
  api.set([inv,B({id:'src',owner:'kunk',wk:'W2',stake:300})],ME,'W2',true);
  eq('not lapsed with games running', api.inviteLapsed(inv), false);
  eq('still on the feed', api.feed(), ['inv']);
}

console.log('\n5. a pending invitation lapses at the reset and leaves the feed');
{
  const inv=B({id:'inv',owner:'bfl',wk:'W1',stake:300,status:'invite',invitedBy:'kunk',srcBet:'src'});
  api.set([inv,B({id:'src',owner:'kunk',wk:'W1',stake:300})],ME,'W2',false);
  eq('lapsed', api.inviteLapsed(inv), true);
  eq('gone from the feed', api.feed(), []);
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
