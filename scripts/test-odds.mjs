/* The board's reaction to money, run against the shipped source. */
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
  grab('const SB_MONEY_MAX=0.45;'),
  grab('const SB_MONEY_REF=500;'),
  grab('function sbMoneyKey(){'),
  grab('function sbMoneyBook(){'),
  grab('function sbMoneyPull(total){'),
  grab('function sbBlend(mk,keys,probs){'),
  grab('function sbStakeOn(mk,pick){'),
  grab('function amFromProb(p){'),
  grab('function probFromAm(o){'),
  grab('function amFmt(o){'),
];
const harness=`
let _bets=[], _sbMoney=null, _sbMoneyKey='', _SEASON='2026';
const sbSeason=()=>_SEASON;
const betIsLive=b=>b.status!=='invite'&&b.status!=='declined';
const betsAfterReset=()=>true;
${parts.join('\n')}
return { set(b){ _bets=b; _sbMoney=null; _sbMoneyKey='__'; },
  sbBlend, sbMoneyPull, sbStakeOn, sbMoneyBook, amFromProb, probFromAm, amFmt,
  SB_MONEY_MAX, SB_MONEY_REF };`;
const api=new Function(harness)();

let pass=0,fail=0;
const eq=(n,g,w)=>{const a=JSON.stringify(g),b=JSON.stringify(w);
  if(a===b){pass++;console.log('  ok   '+n);}
  else{fail++;console.log('  FAIL '+n+'\n         got  '+a+'\n         want '+b);}};
const ok=(n,c)=>eq(n,!!c,true);

const bet=(o)=>Object.assign({id:'b'+Math.random(),owner:'x',season:'2026',status:'open',stake:100,legs:[]},o);
const leg=(mk,pick)=>({mk,pickLabel:'',odds:0,pick});

console.log('\n1. an untouched market prices off the model alone');
{
  api.set([]);
  eq('no shift', api.sbBlend('champ',['a','b','c'],[0.5,0.3,0.2]), [0.5,0.3,0.2]);
  eq('nothing staked', api.sbStakeOn('champ','a'), 0);
}

console.log('\n2. money shortens the side it is on and lengthens the rest');
{
  api.set([bet({stake:300,legs:[leg('conf-East','goob')]})]);
  const before=[0.5,0.3,0.2];
  const after=api.sbBlend('conf-East',['goob','kunk','ting'],before);
  ok('backed side gains probability', after[0]>before[0]);
  ok('the others lose it', after[1]<before[1] && after[2]<before[2]);
  eq('still a probability distribution', +after.reduce((a,b)=>a+b,0).toFixed(6), 1);
  const openOdds=api.amFromProb(before[0]), nowOdds=api.amFromProb(after[0]);
  ok('the price actually shortened', api.probFromAm(nowOdds)>api.probFromAm(openOdds));
  console.log('       '+api.amFmt(openOdds)+'  ->  '+api.amFmt(nowOdds)+'  on $300');
}

console.log('\n3. more money moves it further, but never all the way');
{
  const pull=[0,100,500,2000,100000].map(t=>+api.sbMoneyPull(t).toFixed(3));
  eq('pull rises with the handle', pull.slice(0,4), [0,0.075,0.225,0.36]);
  ok('and is capped below the model', pull[4]<api.SB_MONEY_MAX+1e-9);
  ok('half the cap at the reference handle',
     Math.abs(api.sbMoneyPull(api.SB_MONEY_REF)-api.SB_MONEY_MAX/2)<1e-9);
}

console.log('\n4. a two-way market only weighs its own pair');
{
  api.set([bet({stake:200,legs:[leg('playoffs','goob:yes')]})]);
  const [y]=api.sbBlend('playoffs',['goob:yes','goob:no'],[0.6,0.4]);
  ok('yes shortened', y>0.6);
  const [y2]=api.sbBlend('playoffs',['kunk:yes','kunk:no'],[0.6,0.4]);
  eq('another team is untouched', y2, 0.6);
}

console.log('\n5. a parlay is one stake, not one per leg');
{
  api.set([bet({stake:400,legs:[leg('a','p'),leg('b','p'),leg('c','p'),leg('d','p')]})]);
  eq('split across its legs', api.sbStakeOn('a','p'), 100);
  api.set([bet({stake:400,legs:[leg('a','p')]})]);
  eq('a single carries the lot', api.sbStakeOn('a','p'), 400);
}

console.log('\n6. money that never was, or no longer is, does not count');
{
  api.set([
    bet({stake:500,status:'invite',legs:[leg('m','p')]}),
    bet({stake:500,status:'declined',legs:[leg('m','p')]}),
    bet({stake:500,status:'void',legs:[leg('m','p')]}),
    bet({stake:500,season:'2025',legs:[leg('m','p')]}),
    bet({stake:70,legs:[leg('m','p')]}),
  ]);
  eq('only the live one, this season', api.sbStakeOn('m','p'), 70);
}

console.log('\n7. a settled bet still counts — the money did move the line');
{
  api.set([bet({stake:120,status:'won',legs:[leg('m','p')]}),
           bet({stake:80,status:'lost',legs:[leg('m','p')]})]);
  eq('won and lost both count', api.sbStakeOn('m','p'), 200);
}

console.log('\n8. both sides backed evenly leaves the price where it was');
{
  api.set([bet({stake:250,legs:[leg('playoffs','goob:yes')]}),
           bet({stake:250,legs:[leg('playoffs','goob:no')]})]);
  const [y]=api.sbBlend('playoffs',['goob:yes','goob:no'],[0.5,0.5]);
  eq('an even book does not move', y, 0.5);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail?1:0);
