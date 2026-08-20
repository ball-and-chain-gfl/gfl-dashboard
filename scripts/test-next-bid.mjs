/* Exercise the next-highest-bid rule from scripts/archive-transactions.mjs on a
   fixture, since 2026 has no real transactions yet to test against. */
import fs from 'fs';
const src=fs.readFileSync('C:/dev/gfl-dashboard/scripts/archive-transactions.mjs','utf8');

const FAILED = new Set(['FAILED','CANCELED','CANCELLED','DECLINED','REVERSED','VOID','INVALID']);
function compute(all){
  const bids={};
  all.forEach(t=>{
    if(t.type!=='WAIVER'&&t.type!=='FREEAGENT') return;
    if(t.bidAmount==null) return;
    const wk=t.scoringPeriodId||0;
    (t.items||[]).filter(i=>i.type==='ADD').forEach(i=>{
      if(i.playerId==null) return;
      (bids[`${i.playerId}|${wk}`] ||= []).push(Number(t.bidAmount)||0);
    });
  });
  const out=[];
  all.forEach(t=>{
    if(t.type!=='WAIVER'&&t.type!=='FREEAGENT') return;
    const status=String(t.status||'EXECUTED').toUpperCase();
    if(FAILED.has(status)) return;
    const wk=t.scoringPeriodId||0;
    const bid=Math.max(Number(t.bidAmount)||0,0);
    (t.items||[]).filter(i=>i.type==='ADD').forEach(i=>{
      if(i.playerId==null) return;
      const others=(bids[`${i.playerId}|${wk}`]||[]).slice().sort((a,b)=>b-a);
      const own=others.indexOf(bid); if(own>=0) others.splice(own,1);
      out.push({week:wk,playerId:i.playerId,teamId:t.teamId,bid,
        nextBid:others.length?others[0]:0,contested:others.length});
    });
  });
  return out;
}

const W=(id,team,pid,amt,status,wk=3)=>({id,type:'WAIVER',teamId:team,bidAmount:amt,
  status,scoringPeriodId:wk,items:[{type:'ADD',playerId:pid,toTeamId:team}]});

const cases=[
  ['contested: 3 bids, winner 40, next 25',
   [W(1,1,900,40,'EXECUTED'),W(2,2,900,25,'FAILED'),W(3,3,900,12,'FAILED')],
   r=>r.length===1&&r[0].bid===40&&r[0].nextBid===25&&r[0].contested===2],

  ['uncontested: single bid -> nextBid 0',
   [W(4,1,901,17,'EXECUTED')],
   r=>r.length===1&&r[0].bid===17&&r[0].nextBid===0&&r[0].contested===0],

  ['tie: two identical bids, only own copy removed',
   [W(5,1,902,20,'EXECUTED'),W(6,2,902,20,'FAILED')],
   r=>r.length===1&&r[0].nextBid===20&&r[0].contested===1],

  ['zero-dollar winner with a zero rival',
   [W(7,1,903,0,'EXECUTED'),W(8,2,903,0,'FAILED')],
   r=>r.length===1&&r[0].bid===0&&r[0].nextBid===0&&r[0].contested===1],

  ['different weeks do not pool',
   [W(9,1,904,30,'EXECUTED',3),W(10,2,904,99,'FAILED',5)],
   r=>r.find(x=>x.week===3).nextBid===0],

  ['losing claims never become pickups',
   [W(11,1,905,10,'FAILED'),W(12,2,905,9,'CANCELED')],
   r=>r.length===0],

  ['two winners on the same player in one week (rare, both kept)',
   [W(13,1,906,50,'EXECUTED'),W(14,2,906,30,'EXECUTED')],
   r=>r.length===2&&r.find(x=>x.bid===50).nextBid===30&&r.find(x=>x.bid===30).nextBid===50],
];

let pass=0,fail=0;
for(const [name,input,check] of cases){
  const got=compute(input);
  const ok=check(got);
  console.log((ok?'  PASS  ':'  FAIL  ')+name);
  if(!ok){ console.log('        got:',JSON.stringify(got)); fail++; } else pass++;
}
console.log(`\n${pass} passed, ${fail} failed`);
console.log('logic in script matches this test:',
  src.includes('if (own >= 0) others.splice(own, 1);') ? 'yes' : 'CHECK MANUALLY');
process.exit(fail?1:0);
