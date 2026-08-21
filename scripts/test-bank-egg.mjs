/* The compounding bank and the egg's placement, run against the shipped
   source rather than a restatement of it. */
import fs from 'fs';
const SRC=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8')
  .split(String.fromCharCode(13)).join('');

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
  grab('const bucksTestMs=()=>'),
  grab('function tueWeekStart(now=new Date()){'),
  grab('function bucksCycles(now=Date.now()){'),
  grab('function bucksAllowance(){'),
  grab('const betsLiveAll=()=>'),
  grab('function bucksStaked(){'),
  grab('function bucksReturned(){'),
  grab('function bucksBalance(){'),
  grab('const EGG_MS=5*60*1000, EGG_PRIZE=10;'),
  grab('const eggWindow=(t=Date.now())=>'),
  grab('function eggRand(seed){'),
  grab("const EGG_TABS=['week','book','punishment','teams','roster','history',"),
  grab('function eggSpot(w=eggWindow()){'),
];
const harness=`
let _bets=[], _me={k1:'bfl'}, _CFG={betsResetBefore:0}, _EGGS=0;
const BUCKS_WEEKLY=100;
const betsAfterReset=b=>Number(b.ts||0)>=Number(_CFG.betsResetBefore||0);
const betsMine=()=>(_bets||[]).filter(b=>_me&&b.owner===_me.k1&&betsAfterReset(b));
const betIsLive=b=>b.status!=='invite'&&b.status!=='declined';
const eggsFound=()=>({size:_EGGS});
function eggBucks(){ return _EGGS*EGG_PRIZE; }
${parts.join('\n')}
return { set(b,testMin,eggs){ _bets=b; _CFG={betsResetBefore:0,bucksTestMinutes:testMin||0}; _EGGS=eggs||0; },
  bucksCycles, bucksAllowance, bucksStaked, bucksReturned, bucksBalance,
  eggSpot, eggWindow, eggRand, EGG_TABS, EGG_MS, EGG_PRIZE, tueWeekStart };`;
const api=new Function(harness)();

let pass=0, fail=0;
const eq=(n,g,w)=>{const a=JSON.stringify(g),b=JSON.stringify(w);
  if(a===b){pass++;console.log('  ok   '+n);}
  else{fail++;console.log('  FAIL '+n+'\n         got  '+a+'\n         want '+b);}};

const DAY=86400000, WEEK=7*DAY;
const B=o=>Object.assign({owner:'bfl',status:'open',stake:0,ret:0,ts:Date.now(),wk:''},o);

console.log('\n1. never bet: exactly one allowance');
{
  api.set([],0,0);
  eq('one cycle', api.bucksCycles(), 1);
  eq('balance $100', api.bucksBalance(), 100);
}

console.log('\n2. winnings carry across cycles instead of being wiped');
{
  const now=Date.now();
  // a settled winner three weeks ago: staked 50, returned 130
  api.set([B({ts:now-3*WEEK,stake:50,ret:130,status:'won'})],0,0);
  const cycles=api.bucksCycles(now);
  eq('four cycles of allowance', cycles, 4);
  eq('allowance $400', api.bucksAllowance(), 400);
  // 400 - 50 staked + 130 returned = 480
  eq('old profit still in the bank', api.bucksBalance(), 480);
}

console.log('\n3. a loss follows you past the cycle it happened in');
{
  const now=Date.now();
  api.set([B({ts:now-1*WEEK,stake:90,ret:0,status:'lost'})],0,0);
  eq('two cycles', api.bucksCycles(now), 2);
  eq('200 - 90 = 110', api.bucksBalance(), 110);
}

console.log('\n4. an open bet is committed but not yet returned');
{
  const now=Date.now();
  api.set([B({ts:now,stake:40,ret:0,status:'open'})],0,0);
  eq('100 - 40 = 60', api.bucksBalance(), 60);
}

console.log('\n5. invitations and declines are not money either way');
{
  const now=Date.now();
  api.set([B({ts:now,stake:70,status:'invite'}),B({ts:now,stake:70,status:'declined'})],0,0);
  eq('untouched', api.bucksBalance(), 100);
}

console.log('\n6. eggs pay into the same bank');
{
  api.set([],0,3);
  eq('three finds = $30 on top', api.bucksBalance(), 130);
}

console.log('\n7. the egg is in the same place for everyone in a window');
{
  const w=eggWindowNow();
  const a=api.eggSpot(w), b=api.eggSpot(w);
  eq('two runs agree', a, b);
  eq('names a real tab', api.EGG_TABS.includes(a.tab), true);
  eq('never the top of the page', a.y>=0.20, true);
  eq('stays on the page', a.y<=0.90&&a.x>=0.05&&a.x<=0.91, true);
}
function eggWindowNow(){ return Math.floor(Date.now()/api.EGG_MS); }

console.log('\n8. it moves every window, and spreads over the tabs');
{
  const w=eggWindowNow();
  const spots=[];
  for(let i=0;i<400;i++) spots.push(api.eggSpot(w+i));
  const moved=spots.filter((s,i)=>i&&(s.tab!==spots[i-1].tab
    ||Math.abs(s.x-spots[i-1].x)>0.001||Math.abs(s.y-spots[i-1].y)>0.001)).length;
  eq('every window differs from the last', moved, 399);
  const tabs=new Set(spots.map(s=>s.tab));
  eq('every tab gets used', tabs.size, api.EGG_TABS.length);
  eq('homepage never hosts it', tabs.has('home'), false);
  eq('profile page never hosts it', tabs.has('profile'), false);
  // no tab hogging it: with 12 tabs over 400 draws, expect ~33 each
  const counts=api.EGG_TABS.map(t=>spots.filter(s=>s.tab===t).length);
  eq('no tab runs away with it', Math.max(...counts)<70, true);
  eq('no tab is starved', Math.min(...counts)>10, true);
}

console.log('\n9. five-minute windows');
{
  eq('window length', api.EGG_MS, 300000);
  eq('prize', api.EGG_PRIZE, 10);
  // aligned to a window boundary, or the +299s probe crosses into the next one
  const t=Math.floor(1787000000000/api.EGG_MS)*api.EGG_MS;
  eq('same window inside 5 min', api.eggWindow(t)===api.eggWindow(t+299000), true);
  eq('next window after 5 min', api.eggWindow(t+300001)===api.eggWindow(t)+1, true);
}

console.log('\n10. what the 5-minute test cycle does to the allowance');
{
  const now=Date.now();
  api.set([B({ts:now-3*DAY,stake:0,ret:0,status:'won'})],5,0);
  const cycles=api.bucksCycles(now);
  console.log('       a bet 3 days old, bucksTestMinutes:5  ->  '
    +cycles+' cycles = $'+(cycles*100).toLocaleString());
  api.set([B({ts:now-3*DAY,stake:0,ret:0,status:'won'})],0,0);
  console.log('       the same bet with the flag off        ->  '
    +api.bucksCycles(now)+' cycles = $'+(api.bucksCycles(now)*100));
  eq('flag off gives one cycle per real week', api.bucksCycles(now), 1);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail?1:0);
