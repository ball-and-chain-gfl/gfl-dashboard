/* The compounding bank and the egg's placement, run against the shipped
   source rather than a restatement of it. */
import fs from 'fs';
const SRC=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8')
  .split(String.fromCharCode(13)).join('');

/* EGG_MS and EGG_PRIZE are derived from config.js at load, so the harness has
   to hand app.js the shipped values rather than a guess — and the cases below
   assert against config instead of against a number baked in here. */
const CFGSRC=fs.readFileSync(new URL('../public/config.js',import.meta.url),'utf8');
const cfgNum=k=>{
  const i=CFGSRC.indexOf(k+':');
  if(i<0) throw new Error('config.js: '+k+' not found');
  const v=parseFloat(CFGSRC.slice(i+k.length+1));
  if(!isFinite(v)) throw new Error('config.js: '+k+' is not a number');
  return v;
};
const EGG_HOURS=cfgNum('eggWindowHours'), EGG_MONEY=cfgNum('eggPrize');

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
  grab('function realWeekStart(now=new Date()){'),
  grab('function tueWeekStart(now=new Date()){'),
  grab('function bucksCycles(now=Date.now()){'),
  grab('function bucksAllowance(){'),
  grab('function bucksEpoch(){'),
  grab('function bucksEpochSeason(){'),
  grab('const BUCKS_IDLE_COST='),
  grab('function bucksIdleWeeks(now=Date.now()){'),
  grab('function bucksIdleCost(){'),
  grab('const betsLiveAll=()=>'),
  grab('function bucksStaked(){'),
  grab('function bucksReturned(){'),
  grab('function bucksBalance(){'),
  grab('const EGG_MS='),
  grab('const EGG_PRIZE='),
  grab('const eggWindow=(t=Date.now())=>'),
  grab('function eggRand(seed){'),
  grab('const EGG_TABS=['),
  grab('function eggSpot(w=eggWindow()){'),
];
const harness=`
let _bets=[], _me={k1:'bfl'}, _EGGS=0;
let _CFG={betsResetBefore:0,eggWindowHours:${EGG_HOURS},eggPrize:${EGG_MONEY}};
const BUCKS_WEEKLY=100;
/* bucksTestMs only speeds the clock up for the test account, and section 10 is
   about what that flag does — so the harness says yes. */
const isTestProfile=()=>true;
/* bucksEpochSeason only reaches for this when no pay day is configured */
const bkLeagueSeason=()=>'2026';
/* Completed fantasy weeks. The allowance is capped at one per week played, so
   every case below has to say where in the season it is standing. */
let _WEEKS=0;
const bucksWeeksPlayed=()=>_WEEKS;
/* The share ledger, for the idle-week rule: a lot stamps its trade time as .t */
let _LOTS=[];
const invLots=()=>_LOTS;
const betsAfterReset=b=>Number(b.ts||0)>=Number(_CFG.betsResetBefore||0);
const betsMine=()=>(_bets||[]).filter(b=>_me&&b.owner===_me.k1&&betsAfterReset(b));
const betIsLive=b=>b.status!=='invite'&&b.status!=='declined';
const eggsFound=()=>({size:_EGGS});
function eggBucks(){ return _EGGS*EGG_PRIZE; }
${parts.join('\n')}
return { set(b,testMin,eggs,weeks,extra){ _bets=b; _EGGS=eggs||0; _WEEKS=weeks||0;
    _LOTS=(extra&&extra.lots)||[];
    _CFG=Object.assign({betsResetBefore:0,bucksTestMinutes:testMin||0,
          eggWindowHours:${EGG_HOURS},eggPrize:${EGG_MONEY}},(extra&&extra.cfg)||{}); },
  bucksIdleWeeks, bucksEpoch,
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
  api.set([B({ts:now-3*WEEK,stake:50,ret:130,status:'won'})],0,0,3);
  const cycles=api.bucksCycles(now);
  eq('four cycles of allowance', cycles, 4);
  eq('allowance $400', api.bucksAllowance(), 400);
  // 400 - 50 staked + 130 returned = 480
  eq('old profit still in the bank', api.bucksBalance(), 480);
}

console.log('\n3. a loss follows you past the cycle it happened in');
{
  const now=Date.now();
  api.set([B({ts:now-1*WEEK,stake:90,ret:0,status:'lost'})],0,0,1);
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
  eq('three finds pay the prize three times', api.bucksBalance(), 100+3*EGG_MONEY);
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

console.log('\n9. the window is whatever config says (now '+EGG_HOURS+'h)');
{
  eq('window length matches config', api.EGG_MS, EGG_HOURS*3600*1000);
  eq('prize matches config', api.EGG_PRIZE, EGG_MONEY);
  /* The whole economy hangs off this number, because every roll of the window
     is another egg somebody can be paid for. 12 hours is 14 a week and a $140
     ceiling against a $100 allowance. The five minutes this once shipped with
     was 2,016 a week and $20,160 — not a bonus on the economy, the economy.
     Anything under an hour is a testing speed-up that got out. */
  eq('not a testing speed-up', api.EGG_MS>=3600*1000, true);
  // aligned to a boundary, or the probe just short of the roll crosses it
  const t=Math.floor(1787000000000/api.EGG_MS)*api.EGG_MS;
  eq('same window right up to the roll', api.eggWindow(t)===api.eggWindow(t+api.EGG_MS-1000), true);
  eq('next window just after it', api.eggWindow(t+api.EGG_MS+1)===api.eggWindow(t)+1, true);
}

console.log('\n10. what the short test cycle does to the allowance');
{
  const now=Date.now();
  api.set([B({ts:now-3*DAY,stake:0,ret:0,status:'won'})],5,0);
  const cycles=api.bucksCycles(now);
  console.log('       a bet 3 days old, bucksTestMinutes:5  ->  '
    +cycles+' cycles = $'+(cycles*100).toLocaleString());
  eq('the short cycle mints allowances by the hundred', cycles>100, true);
  /* With the flag off the count is real Tuesdays crossed, so a bet pinned to
     "three days ago" falls in this week or the last one depending on which day
     of the week the suite happens to run — it read 1 from Friday to Monday and
     2 from Tuesday to Thursday. Anchor it inside the current week instead and
     the answer is one, every day. */
  api.set([],0,0);
  const inWeek=api.tueWeekStart(new Date(now))+3600000;
  api.set([B({ts:inWeek,stake:0,ret:0,status:'won'})],0,0);
  console.log('       a bet placed this week, flag off      ->  '
    +api.bucksCycles(now)+' cycles = $'+(api.bucksCycles(now)*100));
  eq('flag off gives one cycle per real week', api.bucksCycles(now), 1);
}

console.log('\n11. an allowance is paid for a week that was played');
{
  const now=Date.now();
  const early=[B({ts:now-3*WEEK,stake:0,ret:0,status:'won'})];
  /* Pre-season: three calendar Tuesdays have gone by since the bet and no
     football at all. The bank used to pay for every one of them. */
  api.set(early,0,0,0);
  eq('three Tuesdays, no football, one allowance', api.bucksCycles(now), 1);
  eq('still $100', api.bucksBalance(), 100);
  /* Week 1 in the books: the second allowance lands. */
  api.set(early,0,0,1);
  eq('week 1 played — two allowances', api.bucksCycles(now), 2);
  /* It never pays for more weeks than the calendar has turned over either. */
  api.set(early,0,0,9);
  eq('nine weeks played, but only four Tuesdays since the bet',
    api.bucksCycles(now), 4);
  /* And it still does not back-pay somebody who arrived late: first bet this
     week, deep into the season, is one allowance and not nine. */
  api.set([B({ts:now,stake:0,ret:0,status:'won'})],0,0,9);
  eq('a first bet in week 9 is not nine allowances', api.bucksCycles(now), 1);
}

/* ── PAY DAY ─────────────────────────────────────────────────────────────────
   One start date for the whole league instead of twelve, counted from
   config.bucksStart. September 1st 2026 is a Tuesday; these walk past it. */
console.log('\n12. the money starts on one Tuesday for everybody');
{
  const cfg={cfg:{bucksStart:'2026-09-01',bucksIdleCost:20}};
  const on=(y,m,d,h)=>new Date(y,m-1,d,h==null?12:h,0,0,0).getTime();
  api.set([],0,0,0,cfg);
  eq('the epoch is Tue 1 Sep 2026 at 6am', api.bucksEpoch(), on(2026,9,1,6));
  eq('the Thursday before pay day: nothing',   api.bucksCycles(on(2026,8,27)), 0);
  eq('the Monday before pay day: nothing',     api.bucksCycles(on(2026,8,31)), 0);
  eq('5am on pay day is still the week before',api.bucksCycles(on(2026,9,1,5)), 0);
  eq('pay day: one allowance',                 api.bucksCycles(on(2026,9,1,7)), 1);
  eq('the Sunday after: still one',            api.bucksCycles(on(2026,9,6)), 1);
  /* PAY DAY HANDS OVER THE FIRST ONE; FOOTBALL EARNS THE REST.

     Counting Tuesdays alone paid out twice before a snap was played — 1
     September and then the 8th, with the season not starting until the 10th. */
  eq('the next Tuesday, nothing played: still one',  api.bucksCycles(on(2026,9,8)), 1);
  eq('three Tuesdays on, nothing played: still one', api.bucksCycles(on(2026,9,22)), 1);
  /* it does not matter when this manager first bet — everybody shares a pay day */
  api.set([B({ts:on(2026,9,15),stake:0,ret:0,status:'won'})],0,0,0,cfg);
  eq('a late first bet does not move pay day',  api.bucksCycles(on(2026,9,22)), 1);
}

console.log('\n12b. and one more for every week actually played');
{
  const cfg={cfg:{bucksStart:'2026-09-01',bucksIdleCost:20}};
  const on=(y,m,d,h)=>new Date(y,m-1,d,h==null?12:h,0,0,0).getTime();
  const at=(weeks)=>{ api.set([],0,0,weeks,cfg); return api.bucksCycles(on(2026,11,1)); };
  eq('week 1 in the books: two',   at(1), 2);
  eq('week 3 in the books: four',  at(3), 4);
  eq('week 8 in the books: nine',  at(8), 9);
  eq('a full season: eighteen',    at(17), 18);
  /* and it never runs backwards just because a Tuesday has not come round */
  api.set([],0,0,5,cfg);
  eq('the same answer on any day of that week',
     api.bucksCycles(on(2026,10,15)), api.bucksCycles(on(2026,10,18)));
  /* before pay day, football or not, nobody has anything */
  api.set([],0,0,3,cfg);
  eq('still nothing before pay day', api.bucksCycles(on(2026,8,27)), 0);
}

console.log('\n13. a week with nothing risked costs $20');
{
  const cfg={cfg:{bucksStart:'2026-09-01',bucksIdleCost:20}};
  const on=(y,m,d,h)=>new Date(y,m-1,d,h==null?12:h,0,0,0).getTime();
  const now=on(2026,9,22);          // the week of the 22nd is in progress

  api.set([],0,0,0,cfg);
  eq('three finished weeks, nothing risked in any', api.bucksIdleWeeks(now), 3);

  /* a bet in the week of the 8th clears that week only */
  api.set([B({ts:on(2026,9,9),stake:10,ret:0,status:'open'})],0,0,0,cfg);
  eq('one week answered for', api.bucksIdleWeeks(now), 2);

  /* a share trade counts as turning up, the same as a bet */
  api.set([],0,0,0,{cfg:cfg.cfg,lots:[{o:'bft',s:1,p:10,t:on(2026,9,3),w:1,k:'b'}]});
  eq('an investment counts too', api.bucksIdleWeeks(now), 2);

  /* the week in progress is never charged for — there is still time */
  api.set([],0,0,0,cfg);
  eq('pay day week only, nothing yet', api.bucksIdleWeeks(on(2026,9,3)), 0);
  eq('and nothing at all before pay day', api.bucksIdleWeeks(on(2026,8,27)), 0);

  /* an invitation nobody took up is not an action */
  api.set([B({ts:on(2026,9,9),stake:70,status:'invite'})],0,0,0,cfg);
  eq('an unanswered invitation does not count', api.bucksIdleWeeks(now), 3);

  /* switching the penalty off */
  api.set([],0,0,0,{cfg:{bucksStart:'2026-09-01',bucksIdleCost:0}});
  eq('bucksIdleCost 0 turns it off', api.bucksIdleWeeks(now), 0);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail?1:0);
