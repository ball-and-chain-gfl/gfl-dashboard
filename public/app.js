const BASE='/api/espn';
const TOTAL_WEEKS=17;
const COMMISSIONER_PIN='1327';

/* ─────────────────────────────────────────────────────────────────────────────
   BALLS BIG 4  —  EDIT IN config.js (loaded before this file), NOT here.
─────────────────────────────────────────────────────────────────────────────── */
const _CFG = (typeof window!=='undefined' && window.GFL_CONFIG) ? window.GFL_CONFIG : {};
const BIG4 = Array.isArray(_CFG.big4) ? _CFG.big4 : ['','','',''];
const BIG4_LABELS = Array.isArray(_CFG.labels) ? _CFG.labels : ['#1 Pick','Dark Horse','Sleeper','Wild Card'];

let _teams=[],_scores={},_breakdown={},_sortCol='pf',_sortAsc=false;
let _videos=[],_activeVideoId=null;
let _allMatchups=[],_currentWeek=null;
let _txMeta={source:'?',count:0};
let _cmMode='transactions';   // 'transactions' | 'inferred'
let _pinUnlocked=false,_pendingPinAction=null;
let _logoMap={};      // teamId -> proxied logo URL (current season)
let _ownerMap={};     // teamId -> stable owner GUID (current season)
let _h2hAll={};       // "ownerA|ownerB" -> { [ownerGUID]: {w, t, pf, games} }  (all seasons)
let _seasonMeta={};   // season -> { owners:{tid:guid}, names:{guid:{name,logo,teamId}} }
let _franchises=[];   // [{owner, name, logo, teamId, games}] — latest identity per owner
let _weeklyData={};   // week -> pid -> {pts, slot, started, team, n}
let _playerNames={};  // pid -> name
let _tenure=null,_tenureLoading=false;  // owner -> pid -> {n, wAll, pAll, seasons:{y:{w,p}}}
let _activeTab='home';
const ALL_SEASONS=['2022','2023','2024','2025','2026'];

function getSeason(){return document.getElementById('season-select').value;}
function setStatus(s,l){
  document.getElementById('dot').className='dot'+(s==='live'?' live':s==='err'?' err':'');
  document.getElementById('dot-label').textContent=l;
}
async function espnFetch(view){
  const r=await fetch(`${BASE}?view=${encodeURIComponent(view)}&seasonId=${getSeason()}`);
  if(!r.ok) throw new Error(`ESPN API ${r.status}`);
  return r.json();
}
async function ytFetch(){
  try{const r=await fetch(`${BASE}?type=youtube`);return r.ok?r.json():{videos:[]};}catch{return{videos:[]};}
}
async function txFetch(){
  try{const r=await fetch(`${BASE}?type=transactions&seasonId=${getSeason()}`);return r.ok?r.json():{transactions:[],_source:'error'};}catch{return{transactions:[],_source:'error'};}
}
async function fetchPlayerWeekScores(week){
  try{
    const r=await fetch(`${BASE}?type=playerscores&seasonId=${getSeason()}&scoringPeriodId=${week}`);
    return r.ok?(await r.json()).players||{}:{};
  }catch{return{};}
}

// ── TEAM LOGOS / AVATARS ─────────────────────────────────────────────────────
// All logo URLs are routed through our own /api/espn?type=logo proxy so that
// hosts which block hotlinking (mystique-api uploads, twimg, etc.) still work.
// Layered over a colored initials badge as the fallback.
function proxyLogo(url){
  if(!url || !/^https?:\/\//i.test(url)) return null;
  return `${BASE}?type=logo&url=${encodeURIComponent(url.replace(/^http:\/\//i,'https://'))}`;
}
function teamInitials(name){
  if(!name) return '?';
  const w=name.trim().split(/\s+/).filter(Boolean);
  if(w.length===1) return w[0].slice(0,2).toUpperCase();
  return (w[0][0]+w[w.length-1][0]).toUpperCase();
}
function teamColor(id){
  const hue=(Number(id||0)*47+13)%360;
  return `hsl(${hue} 52% 40%)`;
}
function avatarCore(name,id,url,size,radius){
  const fs=Math.max(9,Math.round(size*0.42));
  const wrap=`width:${size}px;height:${size}px;border-radius:${radius}px;flex:0 0 ${size}px;position:relative;display:inline-flex;align-items:center;justify-content:center;background:${teamColor(id)};color:#fff;font-weight:800;font-size:${fs}px;letter-spacing:-0.5px;overflow:hidden;vertical-align:middle;`;
  const img=url?`<img src="${url}" loading="lazy" decoding="async" style="position:absolute;inset:0;width:100%;height:100%;object-fit:contain;background:#0d0d0d" onerror="this.remove()"/>`:'';
  return `<span class="tm-avatar" style="${wrap}">${teamInitials(name)}${img}</span>`;
}
function avatarHTML(team,size,radius){
  const id=team?.id, name=team?.name||'';
  const url=id!=null?_logoMap[id]:null;
  return avatarCore(name,id,url,size,radius);
}
function logoImg(teamId,cls='team-logo'){
  const team=(_teams.find(t=>t.id===teamId))||{id:teamId,name:''};
  if(cls==='team-logo-sm') return avatarHTML(team,22,6);
  if(cls==='big4-logo')    return avatarHTML(team,38,9);
  return avatarHTML(team,28,8);
}
function franchiseAvatar(f,size,radius){
  return avatarCore(f?.name||'',f?.teamId||0,proxyLogo(f?.logo),size,radius);
}

// ── ALL-TIME HEAD-TO-HEAD (across every season) ───────────────────────────────
// Keyed on stable owner GUIDs — ESPN reassigns team ids between seasons.
function ownerOf(team){
  return team?.primaryOwner || (team?.owners&&team.owners[0]) || `team:${team?.id}`;
}
function tName(t){return t.name||`${t.location||''} ${t.nickname||''}`.trim()||t.abbrev||'Team';}
async function fetchSeasonData(season){
  try{
    const r=await fetch(`${BASE}?view=mMatchup&view=mTeam&seasonId=${season}`);
    if(!r.ok) return null;
    const d=await r.json();
    const owners={},names={};
    (d.teams||[]).forEach(t=>{
      const o=ownerOf(t);
      owners[t.id]=o;
      names[o]={name:tName(t),logo:t.logo||null,teamId:t.id};
    });
    return {season,schedule:d.schedule||[],owners,names};
  }catch{return null;}
}
async function buildAllTimeH2H(){
  const results=await Promise.allSettled(ALL_SEASONS.map(fetchSeasonData));
  const ledger={},games={};
  _seasonMeta={};
  results.forEach(res=>{
    if(res.status!=='fulfilled'||!res.value) return;
    const {season,schedule,owners,names}=res.value;
    _seasonMeta[season]={owners,names};
    schedule.forEach(mu=>{
      if(!mu.home||!mu.away) return;
      const ho=owners[mu.home.teamId], ao=owners[mu.away.teamId];
      if(!ho||!ao||ho===ao) return;
      const hp=mu.home.totalPoints||0, ap=mu.away.totalPoints||0;
      const win=mu.winner; // "HOME" | "AWAY" | "TIE" | "UNDECIDED"/undefined
      if((win==null||win==='UNDECIDED')&&hp===0&&ap===0) return; // not played
      const key=ho<ao?`${ho}|${ao}`:`${ao}|${ho}`;
      const k=ledger[key]||(ledger[key]={});
      (k[ho]||(k[ho]={w:0,t:0,pf:0,games:0}));
      (k[ao]||(k[ao]={w:0,t:0,pf:0,games:0}));
      k[ho].games++; k[ao].games++; k[ho].pf+=hp; k[ao].pf+=ap;
      games[ho]=(games[ho]||0)+1; games[ao]=(games[ao]||0)+1;
      if(win==='HOME'||(win==null&&hp>ap)) k[ho].w++;
      else if(win==='AWAY'||(win==null&&ap>hp)) k[ao].w++;
      else {k[ho].t++;k[ao].t++;}
    });
  });
  _h2hAll=ledger;
  // Franchise list: newest identity per owner (iterate seasons oldest→newest)
  const f={};
  ALL_SEASONS.forEach(s=>{
    const meta=_seasonMeta[s]; if(!meta) return;
    Object.entries(meta.names).forEach(([o,info])=>{f[o]={owner:o,...info};});
  });
  _franchises=Object.values(f).filter(x=>(games[x.owner]||0)>0).map(x=>({...x,games:games[x.owner]||0}));
  // Hide former league members (configured in config.js -> excludeTeams)
  const excl=(Array.isArray(_CFG.excludeTeams)?_CFG.excludeTeams:[]).map(s=>String(s).toLowerCase()).filter(Boolean);
  _franchises=_franchises.filter(fr=>!excl.some(q=>fr.name.toLowerCase().includes(q)));
  _franchises.sort((a,b)=>a.name.localeCompare(b.name));
}
function allTimeH2H(idA,idB){
  const oA=_ownerMap[idA]||`team:${idA}`, oB=_ownerMap[idB]||`team:${idB}`;
  if(oA===oB) return {wA:0,wB:0,games:0};
  const key=oA<oB?`${oA}|${oB}`:`${oB}|${oA}`;
  const k=_h2hAll[key];
  if(!k) return {wA:0,wB:0,games:0};
  return {wA:k[oA]?.w||0, wB:k[oB]?.w||0, games:k[oA]?.games||0};
}

// ── TABS ───────────────────────────────────────────────────────────────────────
function switchTab(name){
  _activeTab=name;
  document.querySelectorAll('.tab-btn').forEach(b=>b.classList.toggle('active',b.dataset.tab===name));
  document.querySelectorAll('.tab-page').forEach(p=>p.classList.toggle('active',p.id==='page-'+name));
  if(name==='tenure') ensureTenure();
}

// ── PIN ────────────────────────────────────────────────────────────────────────
function openPinOverlay(action){
  _pendingPinAction=action;
  document.getElementById('pin-input').value='';
  document.getElementById('pin-error').textContent='';
  document.getElementById('pin-overlay').classList.add('open');
  setTimeout(()=>document.getElementById('pin-input').focus(),100);
}
function closePinOverlay(){document.getElementById('pin-overlay').classList.remove('open');}
function submitPin(){
  if(document.getElementById('pin-input').value.trim()===COMMISSIONER_PIN){
    _pinUnlocked=true;closePinOverlay();if(_pendingPinAction)_pendingPinAction();
  }else{
    document.getElementById('pin-error').textContent='Incorrect PIN.';
    document.getElementById('pin-input').value='';
  }
}
document.getElementById('pin-input').addEventListener('keydown',e=>{if(e.key==='Enter')submitPin();});

// ── TRANSACTION INFERENCE (for seasons where ESPN purged the log) ──────────────
// ESPN deletes the detailed transaction log once a season completes, but weekly
// rosters survive forever. So we reconstruct: a player on team B this week who
// was on team A last week moved; if another player moved B→A the same week,
// that pair is a trade. Everything else is a waiver/FA add. FAAB bids aren't
// retained either, so C3 uses each team's average bid (budget spent ÷ adds).
function inferTransactionsFromRosters(weeklyData,teams){
  const weeks=Object.keys(weeklyData).map(Number).filter(n=>!isNaN(n)).sort((a,b)=>a-b);
  if(weeks.length<2) return [];
  const avgBid={};
  teams.forEach(t=>{avgBid[t.id]=(t.budgetSpent>0&&t.moves>0)?Math.max(1,Math.round(t.budgetSpent/t.moves)):1;});
  const txns=[];
  for(let i=1;i<weeks.length;i++){
    const wPrev=weeks[i-1],w=weeks[i];
    const prev=weeklyData[wPrev]||{},cur=weeklyData[w]||{};
    if(!Object.keys(prev).length||!Object.keys(cur).length) continue;
    const moved=[];
    for(const pid in cur){
      const t=cur[pid].team, tp=prev[pid]?.team;
      if(tp==null) moved.push({pid:Number(pid),from:null,to:t});      // added from FA/waivers
      else if(tp!==t) moved.push({pid:Number(pid),from:tp,to:t});     // changed teams
    }
    // ANY direct team-to-team move is a trade leg (covers uneven 2-for-1 trades).
    // Legs between the same two teams in the same week are grouped into one trade.
    const tradeGroups={};
    moved.forEach(m=>{
      if(m.from!=null&&m.to!=null&&m.from!==m.to){
        const key=m.from<m.to?`${m.from}|${m.to}`:`${m.to}|${m.from}`;
        (tradeGroups[key]||(tradeGroups[key]=[])).push({type:'TRADE',playerId:m.pid,fromTeamId:m.from,toTeamId:m.to});
      }else if(m.from==null&&m.to!=null){
        // Appeared from free agency = waiver/FA add (est. bid = team season average)
        txns.push({type:'WAIVER',teamId:m.to,bidAmount:avgBid[m.to]||1,scoringPeriodId:w,status:'EXECUTED',_estBid:true,
          items:[{type:'ADD',playerId:m.pid,toTeamId:m.to}]});
      }
    });
    Object.values(tradeGroups).forEach(items=>{
      txns.push({type:'TRADE_ACCEPT',teamId:items[0].toTeamId,scoringPeriodId:wPrev,status:'EXECUTED',items});
    });
  }
  return txns;
}

// ── COACHING METRIC ────────────────────────────────────────────────────────────
// C1: (Team PF − League Avg PF) ÷ 10
// C2: for every completed trade, Σ ALL points scored by each received player
//     from the week after the trade onward, minus the same for sent players. ÷ 10
// C3: for every waiver/FA add, Σ (LINEUP points that player scored for the adding
//     team from the add week onward ÷ FAAB bid paid). ÷ 10
async function computeCoaching(teams, transactions, weeklyData){
  const leagueAvgPF=teams.reduce((s,t)=>s+t.pf,0)/(teams.length||1);
  const weeks=Object.keys(weeklyData).map(Number).filter(n=>!isNaN(n));
  const maxWeek=weeks.length?Math.max(...weeks):TOTAL_WEEKS;

  function allPts(pid, startWeek){
    let total=0;
    for(let w=startWeek;w<=maxWeek;w++) total+=weeklyData[w]?.[pid]?.pts??0;
    return total;
  }
  function lineupPts(pid, startWeek, teamId){
    let total=0;
    for(let w=startWeek;w<=maxWeek;w++){
      const e=weeklyData[w]?.[pid];
      if(!e) continue;
      if(e.started && (teamId==null || e.team===teamId)) total+=e.pts||0;
    }
    return total;
  }

  const c1={},c2={},c3={},detail={};
  teams.forEach(t=>{
    c1[t.id]=(t.pf-leagueAvgPF)/10;
    c2[t.id]=0; c3[t.id]=0;
    detail[t.id]={
      leagueAvgPF, teamPF:t.pf,
      tradesReceived:[], tradesSent:[],
      waiverPickups:[], txTypes:new Set(),
      weeksLoaded:weeks.length
    };
  });

  const FAILED_STATUS=new Set(['FAILED','CANCELED','CANCELLED','PENDING','DECLINED','REVERSED','VOID','INVALID']);
  function executed(tx){
    const s=(tx.status||tx.executionType||'').toString().toUpperCase();
    return !FAILED_STATUS.has(s);
  }

  // C2 — trades
  (transactions||[]).forEach(tx=>{
    if(!executed(tx)) return;
    const tid=tx.teamId;
    if(detail[tid]) detail[tid].txTypes.add(tx.type);
    if(tx.type==='TRADE_ACCEPT'||tx.type==='TRADE'){
      const tradeWeek=tx.scoringPeriodId||0;
      const fromWeek=tradeWeek+1;
      (tx.items||[]).forEach(item=>{
        const pid=item.playerId; if(pid==null) return;
        const pts=allPts(pid, fromWeek);
        if(item.toTeamId!=null && item.toTeamId in c2){
          c2[item.toTeamId]+=pts/10;
          detail[item.toTeamId].tradesReceived.push({pid,week:tradeWeek,pts});
        }
        if(item.fromTeamId!=null && item.fromTeamId in c2){
          c2[item.fromTeamId]-=pts/10;
          detail[item.fromTeamId].tradesSent.push({pid,week:tradeWeek,pts});
        }
      });
    }
  });

  // C3 — waivers / free agents.
  // Denominator = bid-efficiency margin: (winning bid − next-highest bid on that
  // player in the same waiver run). Competing bids come from losing/failed claims
  // in the transaction log; if nobody else bid (or no bid data survives, as in
  // reconstructed seasons), the margin is the full bid. Floor of $1.
  const bidsByKey={};
  (transactions||[]).forEach(tx=>{
    if(tx.type!=='WAIVER'&&tx.type!=='FREEAGENT') return;
    if(tx.bidAmount==null) return;
    const wk=tx.scoringPeriodId||0;
    (tx.items||[]).filter(i=>i.type==='ADD').forEach(item=>{
      if(item.playerId==null) return;
      const key=`${item.playerId}|${wk}`;
      (bidsByKey[key]||(bidsByKey[key]=[])).push(Number(tx.bidAmount)||0);
    });
  });
  (transactions||[]).forEach(tx=>{
    if(tx.type!=='WAIVER'&&tx.type!=='FREEAGENT') return;
    if(!executed(tx)) return;
    const bid=Math.max(tx.bidAmount??0,0);
    const addWeek=tx.scoringPeriodId||1;
    (tx.items||[]).filter(i=>i.type==='ADD').forEach(item=>{
      const pid=item.playerId; if(pid==null) return;
      const tid=(tx.teamId!=null&&tx.teamId in c3)?tx.teamId:item.toTeamId;
      if(tid==null||!(tid in c3)) return;
      detail[tid].txTypes.add(tx.type);
      const key=`${pid}|${tx.scoringPeriodId||0}`;
      const others=(bidsByKey[key]||[]).slice().sort((x,y)=>y-x);
      const i0=others.indexOf(bid); if(i0>=0) others.splice(i0,1);
      const next=others.length?Math.min(others[0],bid):0;
      const margin=Math.max(bid-next,1);
      const lpts=lineupPts(pid, addWeek, tid);
      c3[tid]+=(lpts/margin)/10;
      detail[tid].waiverPickups.push({pid,week:addWeek,bid,next,margin,pts:lpts,est:!!tx._estBid});
    });
  });

  // Z-score standardize
  const raw={};
  teams.forEach(t=>{raw[t.id]=(c1[t.id]||0)+(c2[t.id]||0)+(c3[t.id]||0);});
  const vals=Object.values(raw);
  const mean=vals.reduce((a,b)=>a+b,0)/(vals.length||1);
  const std=Math.sqrt(vals.reduce((s,v)=>s+(v-mean)**2,0)/(vals.length||1))||1;
  const final={};
  teams.forEach(t=>{final[t.id]=(raw[t.id]-mean)/std;});

  const breakdown={};
  teams.forEach(t=>{breakdown[t.id]={c1:c1[t.id]||0,c2:c2[t.id]||0,c3:c3[t.id]||0,raw:raw[t.id]||0,final:final[t.id]||0,detail:detail[t.id]};});
  return{scores:final,breakdown};
}

// ── CM MODAL ───────────────────────────────────────────────────────────────────
function pName(pid){return _playerNames[pid]||`Player #${pid}`;}
function openCMModal(teamId){
  const team=_teams.find(t=>t.id===teamId);if(!team)return;
  const bd=_breakdown[teamId]||{};
  const s=_scores[teamId]||0;
  const d=bd.detail||{};
  const c1f=bd.c1||0,c2f=bd.c2||0,c3f=bd.c3||0,rawf=bd.raw||0;

  const tradeRows=[
    ...(d.tradesReceived||[]).map(r=>`<div class="modal-comp-row"><span class="key">Got ${pName(r.pid)} (wk ${r.week})</span><span class="val" style="color:var(--green)">+${r.pts.toFixed(1)} pts</span></div>`),
    ...(d.tradesSent||[]).map(r=>`<div class="modal-comp-row"><span class="key">Sent ${pName(r.pid)} (wk ${r.week})</span><span class="val" style="color:var(--red)">−${r.pts.toFixed(1)} pts</span></div>`)
  ].join('')||`<div class="modal-comp-row"><span class="key">No trades found</span><span class="val" style="color:var(--text3)">—</span></div>`;

  const waiverRows=(d.waiverPickups||[]).slice().sort((a,b)=>b.pts/Math.max(b.margin??b.bid,1)-a.pts/Math.max(a.margin??a.bid,1)).map(w=>{
    const mar=Math.max(w.margin??w.bid,1);
    return `<div class="modal-comp-row"><span class="key">${pName(w.pid)} · wk ${w.week} · $${w.bid}${w.next?` (next bid $${w.next})`:''}${w.est?'<span style="opacity:0.6"> est.</span>':''}</span><span class="val">${w.pts.toFixed(1)} pts ÷ $${mar} = ${(w.pts/mar).toFixed(2)}x</span></div>`;
  }).join('')||`<div class="modal-comp-row"><span class="key">No waiver adds found</span><span class="val" style="color:var(--text3)">—</span></div>`;

  const modeNote=_cmMode==='inferred'
    ?`<div class="modal-note"><i class="fa fa-circle-info" style="margin-right:6px;color:var(--blue)"></i>ESPN deletes the detailed transaction log when a season ends, so trades and pickups for this season are <b>reconstructed from weekly roster changes</b>: any player moving directly from one roster to another counts as a trade (uneven trades included). FAAB bids are estimated from each team's average (budget spent ÷ adds), and competing-bid margins aren't recoverable, so the C3 denominator equals the full estimated bid.</div>`
    :'';

  document.getElementById('cm-title').textContent=team.name;
  document.getElementById('cm-body').innerHTML=`
    <div class="modal-total">
      <div class="modal-total-left"><div class="label">Coaching Metric Score</div><div class="sub">Z-score · higher = better</div></div>
      <div class="modal-total-score" style="color:${sc(s)}">${s.toFixed(3)}</div>
    </div>
    ${modeNote}
    <div class="modal-formula">
      <div style="font-size:11px;color:var(--text3);margin-bottom:9px;text-transform:uppercase;letter-spacing:0.8px">Score Breakdown</div>
      <div class="eq-line"><span style="color:var(--accent);font-weight:700;width:26px">C1</span><span style="color:var(--text2);flex:1">Points Efficiency</span><span style="font-weight:700;color:${cc(c1f)}">${c1f.toFixed(3)}</span></div>
      <div class="eq-line"><span style="color:var(--blue);font-weight:700;width:26px">C2</span><span style="color:var(--text2);flex:1">Trade ROI</span><span style="font-weight:700;color:${cc(c2f)}">${c2f>=0?'+':''}${c2f.toFixed(3)}</span></div>
      <div class="eq-line"><span style="color:var(--green);font-weight:700;width:26px">C3</span><span style="color:var(--text2);flex:1">Waiver ROI</span><span style="font-weight:700;color:${cc(c3f)}">${c3f>=0?'+':''}${c3f.toFixed(3)}</span></div>
      <hr/>
      <div class="eq-line"><span style="width:26px"></span><span style="color:var(--text2);flex:1">Raw sum</span><span style="font-weight:700">${rawf.toFixed(3)}</span></div>
      <div class="eq-line"><span style="width:26px"></span><span style="color:var(--text2);flex:1">Standardized final</span><span style="font-weight:800;font-size:14px;color:${sc(s)}">${s.toFixed(3)}</span></div>
    </div>
    <div class="modal-comp">
      <div class="modal-comp-top"><div class="modal-comp-label"><i class="fa fa-chart-line" style="color:var(--accent)"></i>C1 — Points Efficiency</div><div class="modal-comp-value" style="color:${cc(c1f)}">${c1f.toFixed(3)}</div></div>
      <div class="modal-comp-breakdown">
        <div class="modal-comp-row"><span class="key">Team PF</span><span class="val">${team.pf.toFixed(1)}</span></div>
        <div class="modal-comp-row"><span class="key">League Avg PF</span><span class="val">${(d.leagueAvgPF||0).toFixed(1)}</span></div>
        <div class="modal-comp-row"><span class="key">Difference</span><span class="val" style="color:${cc(team.pf-(d.leagueAvgPF||0))}">${(team.pf-(d.leagueAvgPF||0))>=0?'+':''}${(team.pf-(d.leagueAvgPF||0)).toFixed(1)}</span></div>
        <div class="modal-comp-row"><span class="key">÷ 10</span><span class="val" style="color:${cc(c1f)}">${c1f.toFixed(3)}</span></div>
      </div>
      <div class="modal-comp-formula">(Team PF − League Avg PF) ÷ 10</div>
    </div>
    <div class="modal-comp">
      <div class="modal-comp-top"><div class="modal-comp-label"><i class="fa fa-right-left" style="color:var(--blue)"></i>C2 — Trade ROI</div><div class="modal-comp-value" style="color:${cc(c2f)}">${c2f>=0?'+':''}${c2f.toFixed(3)}</div></div>
      <div class="modal-comp-breakdown">${tradeRows}</div>
      <div class="modal-comp-formula">Σ (pts scored by received players after trade − pts scored by sent players after trade) ÷ 10</div>
    </div>
    <div class="modal-comp">
      <div class="modal-comp-top"><div class="modal-comp-label"><i class="fa fa-magnifying-glass-dollar" style="color:var(--green)"></i>C3 — Waiver ROI</div><div class="modal-comp-value" style="color:${cc(c3f)}">${c3f>=0?'+':''}${c3f.toFixed(3)}</div></div>
      <div class="modal-comp-breakdown">${waiverRows}</div>
      <div class="modal-comp-formula">Σ (lineup pts scored by pickup ÷ (winning FAAB bid − next-highest bid)) ÷ 10 — the margin rewards efficient bids; if nobody else bid, the margin is the full bid</div>
    </div>
    <details class="modal-debug">
      <summary>🔍 Debug info</summary>
      <pre>Transaction source: ${_txMeta.source} (${_txMeta.count} records)
Attempts: ${(_txMeta.diag||[]).map(a=>`${a.name}=${a.count??0}${a.status&&a.status!==200?`(${a.status})`:''}`).join('  ')||'—'}
Weeks loaded for scoring: ${d.weeksLoaded||0}
TX types seen this team: ${Array.from(d.txTypes||[]).join(', ')||'none'}
Trades received: ${(d.tradesReceived||[]).length} · sent: ${(d.tradesSent||[]).length}
Waiver pickups: ${(d.waiverPickups||[]).length}
Logo URL: ${_logoMap[team.id]||'(none)'}</pre>
    </details>`;
  document.getElementById('cm-overlay').classList.add('open');
}
function closeCMModal(e){if(e.target===document.getElementById('cm-overlay'))closeCMModalDirect();}
function closeCMModalDirect(){document.getElementById('cm-overlay').classList.remove('open');}

// ── BIG 4 ──────────────────────────────────────────────────────────────────────
function resolveBig4Entry(entry){
  if(entry==null||entry==='') return null;
  if(typeof entry==='number') return _teams.find(t=>t.id===entry)||null;
  const q=String(entry).trim().toLowerCase();
  if(/^\d+$/.test(q)) {const byId=_teams.find(t=>t.id===Number(q)); if(byId) return byId;}
  return _teams.find(t=>(t.name||'').toLowerCase()===q)
      || _teams.find(t=>(t.name||'').toLowerCase().includes(q))
      || null;
}
function renderBig4(){
  const el=document.getElementById('big4-display');if(!el)return;
  const picked=BIG4.map(resolveBig4Entry);
  const anyPicked=picked.some(Boolean);

  el.innerHTML=`<div class="section-header" style="padding:12px 16px">
    <i class="fa fa-crown"></i>Balls Big 4
  </div>
  ${!anyPicked
    ?`<div class="big4-empty">Set your Big 4 in <code>config.js</code>.</div>`
    :`<div class="big4-grid">${picked.map((t,i)=>{
      if(!t) return `<div class="big4-team"><div class="big4-info"><div class="big4-label">${BIG4_LABELS[i]||'Featured'}</div><div class="big4-record" style="color:var(--text3)">— empty slot —</div></div></div>`;
      const s=_scores[t.id]||0;
      return`<div class="big4-team">
        ${logoImg(t.id,'big4-logo')}
        <div class="big4-info">
          <div class="big4-label">${BIG4_LABELS[i]||'Featured'}</div>
          <div class="big4-name">${t.name}</div>
          <div class="big4-record">${t.wins}–${t.losses} · ${t.pf.toFixed(0)} PF</div>
          <div class="big4-cm" style="color:${sc(s)}">CM: ${s.toFixed(2)}</div>
        </div>
      </div>`;
    }).join('')}</div>`}`;
}

// ── HEADLINES ──────────────────────────────────────────────────────────────────
function h2h(idA,idB){
  let wA=0,wB=0;
  _allMatchups.forEach(mu=>{
    if(!mu.home||!mu.away) return;
    const hid=mu.home.teamId,aid=mu.away.teamId;
    const hp=mu.home.totalPoints||0,ap=mu.away.totalPoints||0;
    if((hp===0&&ap===0)) return;
    if((hid===idA&&aid===idB)||(hid===idB&&aid===idA)){
      if(hp>ap){if(hid===idA)wA++;else wB++;}
      else if(ap>hp){if(aid===idA)wA++;else wB++;}
    }
  });
  return{wA,wB};
}
function hashStr(s){let h=2166136261>>>0;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;}
function standingsOrder(){return [..._teams].sort((a,b)=>(b.wins-a.wins)||(b.pf-a.pf));}
function seedOf(id){return standingsOrder().findIndex(t=>t.id===id)+1;}
function playoffCut(){return Math.max(4,Math.ceil((_teams.length||12)/2));}
function leagueWeeksPlayed(){return Math.max(0,..._teams.map(t=>t.wins+t.losses+t.ties));}
function ord(n){const s=['th','st','nd','rd'],v=n%100;return n+(s[(v-20)%10]||s[v]||s[0]);}
function topStarter(week,teamId){
  const wd=_weeklyData[week]; if(!wd) return null;
  let best=null;
  for(const pid in wd){
    const e=wd[pid];
    if(e.team===teamId&&e.started&&(best==null||e.pts>best.pts)) best={pid,pts:e.pts,n:e.n||_playerNames[pid]||null};
  }
  return (best&&best.n)?best:null;
}

/* Pop-culture flavor packs keyed to team names. `win` lines fire when that team
   wins, `loss` lines when it loses. In templates: c.W / c.L are <strong> names,
   c.topW / c.topL are top starters {n, pts} or null. */
const NAME_PACKS=[
  {re:/marathon/i,
   win:[c=>`${c.W} ran this one like Kipchoge — brutal, even splits until ${c.L} hit the wall at mile 20. Final: ${c.score}.`,
        c=>`Like Forrest Gump, ${c.W} just felt like running… right past ${c.L}, ${c.score}. That's all they have to say about that.`,
        c=>`26.2 miles? Try 17 weeks. ${c.W} keeps pacing the field, outlasting ${c.L} ${c.score}.`],
   loss:[c=>`${c.L} pulled up with a cramp at mile three. ${c.W} jogged to the tape, ${c.score}.`,
         c=>`Even Pheidippides delivered his message before collapsing — ${c.L} just collapsed. ${c.W} wins ${c.score}.`]},
  {re:/motor\s*city|mulligan/i,
   win:[c=>`Mom's spaghetti stayed down — ${c.W} seized the moment, lost themselves in it, and snap-backed to reality with a ${c.score} win over ${c.L}. You only get one shot.`,
        c=>`No mulligan required. ${c.W} striped it down the fairway and walked off ${c.L} ${c.score}.`,
        c=>`Detroit vs. Everybody — this week "everybody" was ${c.L}, and Detroit won ${c.score}.`],
   loss:[c=>`${c.L} will absolutely be taking a mulligan on that one. ${c.W} plays it as it lies, ${c.score}.`,
         c=>`Knees weak, arms heavy — ${c.L} choked ${c.score} against ${c.W}. Back to the lab again.`]},
  {re:/bikini|goober|sponge/i,
   win:[c=>`Is mayonnaise an instrument? No — but ${c.W} played ${c.L} like one, ${c.score}.`,
        c=>`The Krusty Krab was slammed and ${c.W} kept up with every order, dropping ${c.winPts} on ${c.L}. Plankton-level scheming, Mr. Krabs-level profit.`,
        c=>`I'M READY. ${c.W} was, anyway — ${c.L} clearly wasn't, ${c.score}.`],
   loss:[c=>`A full Squidward performance from ${c.L}: technically present, spiritually at home with a canvas and self-portraits. ${c.W} wins ${c.score}.`,
         c=>`Tartar sauce. ${c.L} needed the secret formula and served a plain patty instead — ${c.W} takes it ${c.score}.`]},
  {re:/bismuth/i,
   win:[c=>`${c.W} was not in danger this week. ${c.W} WAS the danger — ${c.L} answered the door when they knocked, ${c.score}.`,
        c=>`Say my name. It's ${c.W}, ${c.score} winners over ${c.L}, and the product was 99.1% pure.`,
        c=>`Chemistry is the study of transformation — and ${c.W} transformed ${c.L} into a cautionary tale, ${c.score}.`],
   loss:[c=>`${c.L}'s cook got busted. ${c.W} ran the lab this week, ${c.score}. No half measures.`,
         c=>`Turns out ${c.L} was the one who folded when somebody knocked — ${c.W} wins ${c.score}.`]},
  {re:/florida/i,
   win:[c=>`FLORIDA MAN WINS ${c.score}; WITNESSES SAY ${c.loserName.toUpperCase()} NEVER SAW IT COMING.`,
        c=>`Florida Man does something incomprehensible and it WORKS — ${c.topW?`${c.topW.n} (${c.topW.pts.toFixed(1)}) was the alligator in the pool`:'chaos was the whole gameplan'}. ${c.W} over ${c.L}, ${c.score}.`,
        c=>`You can't gameplan for Florida Man. ${c.L} tried. ${c.score}.`],
   loss:[c=>`FLORIDA MAN DISCOVERS SCOREBOARD, DOES NOT CARE FOR IT — ${c.W} wins ${c.score}.`,
         c=>`Even the gators felt bad for ${c.L} on this one. ${c.W} bites down ${c.score}.`]},
  {re:/silly\s*willy|wonka/i,
   win:[c=>`${c.W} found the golden ticket${c.topW?` — it was ${c.topW.n} (${c.topW.pts.toFixed(1)}) all along`:''} and toured right past ${c.L}, ${c.score}. Pure imagination.`,
        c=>`The snozzberries taste like victory — ${c.W} over ${c.L}, ${c.score}.`],
   loss:[c=>`"You get NOTHING. You LOSE. Good day, sir!" — the scoreboard, to ${c.L}, after ${c.W}'s ${c.score} win.`,
         c=>`${c.L} went full Augustus Gloop: got greedy early, got stuck in the pipe by halftime. ${c.W} wins ${c.score}.`]},
  {re:/lebron/i,
   win:[c=>`${c.W} took their talents straight to the win column, dispatching ${c.L} ${c.score}. Not one, not two, not three…`,
        c=>`That was the fantasy version of the 2016 chasedown block — ${c.W} erased everything ${c.L} had at the rim, ${c.score}.`,
        c=>`The GOAT debate rages on, but this week's tape is clear: ${c.W} ${c.score} over ${c.L}.`],
   loss:[c=>`The Decision this week: to lose. ${c.L} falls ${c.score} to ${c.W}, and the talents are staying home for film review.`,
         c=>`Even the King has bad nights in Cleveland — ${c.L} drops this one ${c.score} to ${c.W}.`]},
  {re:/tingl/i,
   win:[c=>`${c.W}'s spidey-senses were tingling all week — they saw every move ${c.L} made coming, ${c.score}.`,
        c=>`That tingle you feel is the win column growing — ${c.W} over ${c.L}, ${c.score}.`],
   loss:[c=>`No tingle. No spidey-sense. No answers. ${c.L} falls ${c.score} to ${c.W}.`]},
  {re:/miner/i,
   win:[c=>`${c.W} struck gold${c.topW?` — ${c.topW.n} panned out for ${c.topW.pts.toFixed(1)}`:''} and out-dug ${c.L} ${c.score}. There's always money in the mine.`,
        c=>`Diamonds are made under pressure, and ${c.W} just pressure-cooked ${c.L}, ${c.score}.`,
        c=>`${c.W} went full Minecraft: mined all week, crafted a ${c.score} win, left ${c.L} staring at a creeper.`],
   loss:[c=>`The canary stopped singing early. ${c.L}'s shaft caved in ${c.score} against ${c.W}.`,
         c=>`${c.L} dug all week and hit nothing but rock — ${c.W} takes it ${c.score}.`]},
  {re:/bryan\s*football\s*team/i,
   win:[c=>`No mascot, no logo, no mercy — ${c.W} goes full Washington-Football-Team-era minimalism on ${c.L}, ${c.score}.`,
        c=>`You don't need a brand when you have a record. ${c.W} handles ${c.L} ${c.score}.`],
   loss:[c=>`Maybe it IS time for the rebrand — ${c.L} drops this one ${c.score} to ${c.W}.`]},
  {re:/whittingham/i,
   win:[c=>`${c.W} won this like a Whittingham-coached Utah team: suffocating, unglamorous, extremely effective. ${c.score} over ${c.L}.`,
        c=>`${c.W} just did the corporate-sports-brand thing: quiet quarter, record profits. ${c.score} over ${c.L}.`],
   loss:[c=>`Even hall-of-fame coaches drop road games — ${c.L} falls ${c.score} at the hands of ${c.W}.`]},
  {re:/wiggl/i,
   win:[c=>`The West Coast offense lives — ${c.W} dinked, dunked, and wiggled ${c.L} to death, ${c.score}.`,
        c=>`Fruit salad, yummy yummy: ${c.W} made a whole meal of ${c.L}, ${c.score}. The Wiggles would be proud.`,
        c=>`${c.W} found just enough wiggle room, slithering past ${c.L} ${c.score}.`],
   loss:[c=>`No wiggle room left — ${c.L} comes up short ${c.score} against ${c.W}.`,
         c=>`${c.L} did the wiggle. The scoreboard didn't move. ${c.W} wins ${c.score}.`]},
];

function generateHeadline(home,away,hPts,aPts,week){
  const diff=Math.abs(hPts-aPts);
  const winner=hPts>=aPts?home:away;
  const loser =hPts>=aPts?away:home;
  const winPts=Math.max(hPts,aPts), losePts=Math.min(hPts,aPts);
  const W=`<strong>${winner.name}</strong>`, L=`<strong>${loser.name}</strong>`;
  const score=`${winPts.toFixed(1)}–${losePts.toFixed(1)}`;
  const topW=topStarter(week,winner.id), topL=topStarter(week,loser.id);
  const c={W,L,score,diff,winPts:winPts.toFixed(1),losePts:losePts.toFixed(1),topW,topL,winnerName:winner.name,loserName:loser.name};

  const wRec=`${winner.wins}–${winner.losses}`, lRec=`${loser.wins}–${loser.losses}`;
  const wSeed=seedOf(winner.id), lSeed=seedOf(loser.id), cut=playoffCut();
  const lateSeason=leagueWeeksPlayed()>=9;

  const s=h2h(winner.id,loser.id);
  const sWin=hPts>=aPts?s.wA:s.wB, sLose=hPts>=aPts?s.wB:s.wA;
  const at=allTimeH2H(winner.id,loser.id);
  const atWin=hPts>=aPts?at.wA:at.wB, atLose=hPts>=aPts?at.wB:at.wA, atGames=at.games;

  const nail=diff<2, close=diff<6, blowout=diff>=45, shootout=winPts>=150&&losePts>=125;
  const high=winPts>=165, monster=winPts>=185, low=losePts>0&&losePts<80, bothLow=winPts<95;
  const upset=(loser.wins>winner.wins)||(lSeed>0&&wSeed>0&&lSeed<wSeed-1);
  const undefeatedW=winner.losses===0&&winner.wins>=3;
  const winlessL=loser.wins===0&&loser.losses>=3;

  const pool=[];
  const add=(line,weight=1)=>{for(let i=0;i<weight;i++)pool.push(line);};

  // 1) Team-name pop-culture packs (heaviest weight — the signature flavor)
  NAME_PACKS.forEach(p=>{
    if(p.re.test(winner.name)) p.win.forEach(fn=>add(fn(c),3));
    if(p.re.test(loser.name))  p.loss.forEach(fn=>add(fn(c),3));
  });

  // 2) Star-player storylines
  if(topW&&topW.pts>=25){
    add(`${topW.n} went full John Wick — ${topW.pts.toFixed(1)} points and everyone in ${L}'s lineup was just another henchman. ${W} wins ${score}.`,2);
    add(`${W} rode ${topW.n} (${topW.pts.toFixed(1)}) like Gandalf arriving at Helm's Deep — right on time, absolutely decisive. ${score} over ${L}.`,2);
    add(`Somewhere, ${topW.n}'s agent is drafting an email. ${topW.pts.toFixed(1)} points powered ${W} past ${L}, ${score}.`,2);
  }
  if(topL&&topL.pts>=25&&winPts>losePts){
    add(`${topL.n} put up ${topL.pts.toFixed(1)} and deserved so much better — the rest of ${L} pulled a full Ocean's Eleven and vanished. ${W} wins ${score}.`,2);
    add(`${topL.n} (${topL.pts.toFixed(1)}) was Leo in The Revenant: incredible individual performance, brutal ending. ${W} over ${L}, ${score}.`,2);
  }

  // 3) Outcome-driven pop culture
  if(nail){
    add(`${diff.toFixed(1)} points. That's the whole margin. ${W} survives ${L} like the final girl in a slasher flick, ${score}.`,2);
    add(`Closer than the La La Land / Moonlight envelope — but after a review, ${W} actually won, ${score} over ${L}.`,2);
  } else if(close){
    add(`${W} escapes ${L} by ${diff.toFixed(1)}, ${score} — one bench decision from a different multiverse. No word yet from Doctor Strange on the other 14,000,605 outcomes.`);
    add(`By the skin of their teeth: ${W} over ${L}, ${score}. Bragging rights secured, group chat notifications muted.`);
  }
  if(blowout){
    add(`That wasn't a matchup, it was the Red Wedding — ${W} massacres ${L} by ${diff.toFixed(1)}, ${score}. The Lannisters send their regards.`,2);
    add(`${L} got Thanos-snapped: half their hopes gone by halftime, the rest turned to dust in a ${score} loss to ${W}.`,2);
    add(`${W} put ${L} in the Upside Down and unplugged the Christmas lights, ${score}.`);
  }
  if(shootout) add(`${W} and ${L} turned this into a Fast & Furious movie — no defense, pure nitrous, ${(winPts+losePts).toFixed(1)} combined. ${W} wins the drag race ${score}. Family.`,2);
  if(monster) add(`${winPts.toFixed(1)} points?! ${W} went Super Saiyan on ${L}. Scouts are calling it the most points scored since the invention of the forward pass. ${score}.`,2);
  else if(high) add(`${W} hung ${winPts.toFixed(1)} on ${L} like it was a Madden rookie-difficulty franchise, ${score}.`);
  if(low) add(`${losePts.toFixed(1)} points from ${L} — a performance so quiet it could star in A Quiet Place 3. ${W} strolls, ${score}.`,2);
  if(bothLow) add(`Two teams entered, neither brought offense — ${W} wins the rock fight ${score} over ${L}. Even the refs left early.`);

  // 4) Rivalry / series context
  if(atGames>=2){
    if(atWin>atLose+1) add(`${W} owns this rivalry like Vader owns family reunions — ${atWin}–${atLose} all-time over ${L} after the ${score} win.`);
    else if(atWin===atLose) add(`The all-time ledger was knotted at ${atLose}–${atLose} — until ${W} broke serve, ${score}. See you at the rematch.`);
    else if(atWin<atLose) add(`${L} still leads the all-time series ${atLose}–${atWin}, but ${W} stole one back ${score} — a proper Empire Strikes Back move.`);
  }
  if(sWin+sLose>=2&&Math.abs(sWin-sLose)<=1) add(`These two just keep meeting — ${W} takes the latest chapter ${score}, ${sWin}–${sLose} between them this season. Somebody write the trilogy.`);

  // 5) Standings stakes
  if(lateSeason){
    if(wSeed>0&&wSeed<=cut) add(`${W} (${wRec}) keeps a kung-fu grip on the ${ord(wSeed)} seed, handling ${L} ${score} with January in sight.`);
    if(lSeed>cut) add(`${L} (${lRec}) is running out of runway — sitting ${ord(lSeed)} after a ${losePts.toFixed(1)}-point outing, the playoff math needs a Christopher Nolan timeline to work.`);
    if(wSeed>cut) add(`Win or go home, and ${W} chose violence — beating ${L} ${score} to keep a flickering playoff pulse alive at ${wRec}.`);
  }
  if(undefeatedW) add(`Still perfect. ${W} moves to ${wRec}, swatting ${L} aside ${score}. The rest of the league is living in their villain era.`);
  if(winlessL) add(`The misery tour continues for ${L} (${lRec}) after a ${score} loss. ${W} didn't even feel bad about it.`);
  if(upset&&winner.wins>1) add(`Nobody had ${W} (${wRec}) in this bracket — a genuine March Madness moment against ${L} (${lRec}), ${score}. Throw the seedings out.`);

  // 6) Evergreen fallbacks
  const flavor=[
    `${W} understood the assignment: ${winPts.toFixed(1)} points, one W, zero notes. ${L} falls ${score}.`,
    `Main-character energy from ${W} — ${L} was an NPC in the ${score} storyline.`,
    `${W} cooked. ${L} did the dishes. Final: ${score}.`,
    `The scoreboard remains the league's best storyteller: ${W} ${winPts.toFixed(1)}, ${L} ${losePts.toFixed(1)}. Roll credits.`,
    `${L} brought a spork to a lightsaber duel. ${W} wins ${score}.`,
  ];
  if(!pool.length) flavor.forEach(f=>add(f));
  else add(flavor[hashStr(winner.name+loser.name)%flavor.length]);

  const seed=hashStr(`${home.id}|${away.id}|${week}|${winPts.toFixed(1)}|${losePts.toFixed(1)}`);
  return pool[seed%pool.length];
}

function renderHeadlines(week){
  _currentWeek=week;
  const teamMap=Object.fromEntries(_teams.map(t=>[t.id,t]));
  document.querySelectorAll('.week-btn').forEach(b=>b.classList.toggle('active',parseInt(b.dataset.week)===week));
  const grid=document.getElementById('headline-grid');if(!grid)return;
  const weekMu=_allMatchups.filter(mu=>mu.matchupPeriodId===week&&mu.home&&mu.away);
  if(!weekMu.length){grid.innerHTML=`<div style="padding:24px;color:var(--text3);font-size:13px;text-align:center">No data for Week ${week}</div>`;return;}
  grid.innerHTML=weekMu.map(mu=>{
    const home={...teamMap[mu.home.teamId]||{name:'Home',wins:0,losses:0,pf:0},id:mu.home.teamId};
    const away={...teamMap[mu.away.teamId]||{name:'Away',wins:0,losses:0,pf:0},id:mu.away.teamId};
    const hPts=mu.home.totalPoints||0,aPts=mu.away.totalPoints||0;
    const hWin=hPts>aPts,aWin=aPts>hPts;
    return`<div class="headline-card">
      <div class="headline-matchup">
        <div class="headline-team-block">
          ${logoImg(home.id,'team-logo-sm')}
          <span class="headline-team-name">${home.name}</span>
        </div>
        <div class="headline-vs">vs</div>
        <div class="headline-team-block away">
          ${logoImg(away.id,'team-logo-sm')}
          <span class="headline-team-name">${away.name}</span>
        </div>
      </div>
      <div class="headline-score">
        <div class="headline-pts ${hWin?'winner':aPts>0?'loser':''}">${hPts.toFixed(1)}</div>
        <div class="headline-pts ${aWin?'winner':hPts>0?'loser':''}">${aPts.toFixed(1)}</div>
      </div>
      <div class="headline-blurb">${generateHeadline(home,away,hPts,aPts,week)}</div>
    </div>`;
  }).join('');
}

// ── STANDINGS ──────────────────────────────────────────────────────────────────
function sortStandings(col){
  if(_sortCol===col)_sortAsc=!_sortAsc;
  else{_sortCol=col;_sortAsc=false;}
  renderStandingsTable();
}
function sortAndHighlight(col,btn){
  document.querySelectorAll('.filter-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  _sortCol=col;_sortAsc=false;
  renderStandingsTable();
}
function renderStandingsTable(){
  const teams=[..._teams];
  teams.sort((a,b)=>{
    let va,vb;
    if(_sortCol==='rank'){va=a.wins/((a.wins+a.losses+a.ties)||1)+a.pf/1e7;vb=b.wins/((b.wins+b.losses+b.ties)||1)+b.pf/1e7;}
    else if(_sortCol==='pf'){va=a.pf;vb=b.pf;}
    else if(_sortCol==='pa'){va=a.pa;vb=b.pa;}
    else if(_sortCol==='wins'){va=a.wins;vb=b.wins;}
    else if(_sortCol==='moves'){va=a.moves;vb=b.moves;}
    else if(_sortCol==='trades'){va=a.trades;vb=b.trades;}
    else if(_sortCol==='cm'){va=_scores[a.id]||0;vb=_scores[b.id]||0;}
    else return 0;
    return _sortAsc?va-vb:vb-va;
  });
  function arr(c){return _sortCol===c?(_sortAsc?'↑':'↓'):'⇅';}
  function th(col,label,right=true){return`<th class="${right?'right':''} ${_sortCol===col?'sorted':''}" onclick="sortStandings('${col}')">${label} <span style="font-size:9px;opacity:0.6">${arr(col)}</span></th>`;}
  const thead=document.getElementById('standings-thead');
  const tbody=document.getElementById('standings-tbody');
  if(!thead||!tbody)return;
  thead.innerHTML=`<tr>
    <th class="${_sortCol==='rank'?'sorted':''}" onclick="sortStandings('rank')"># <span style="font-size:9px;opacity:0.6">${arr('rank')}</span></th>
    <th>Team</th>${th('wins','W')}
    <th class="right">L</th>${th('pf','PF')}${th('pa','PA')}${th('moves','Moves')}${th('trades','Trades')}${th('cm','CM')}
  </tr>`;
  tbody.innerHTML=teams.map((t,i)=>{
    const s=_scores[t.id]||0;
    return`<tr>
      <td><span class="rank">${i===0&&_sortCol==='rank'?'🥇':i+1}</span></td>
      <td><div class="team-cell">${logoImg(t.id)}<div class="team-info"><div class="team-name">${t.name}</div><div class="team-sub">${t.abbrev}</div></div></div></td>
      <td class="right"><strong>${t.wins}</strong></td>
      <td class="right" style="color:var(--text3)">${t.losses}</td>
      <td class="right pf">${t.pf.toFixed(1)}</td>
      <td class="right pa">${t.pa.toFixed(1)}</td>
      <td class="right">${t.moves}</td>
      <td class="right">${t.trades}</td>
      <td class="right" style="color:${sc(s)};font-weight:600">${s.toFixed(2)}</td>
    </tr>`;
  }).join('');
}

// ── MATCHUP HISTORY TAB ────────────────────────────────────────────────────────
function renderHistoryTable(){
  const body=document.getElementById('history-body'); if(!body) return;
  const sel=document.getElementById('hist-team-select');
  const owner=sel?.value||_franchises[0]?.owner;
  if(!owner){body.innerHTML=`<div class="tab-loading">No historical data available.</div>`;return;}
  const me=_franchises.find(f=>f.owner===owner);

  let tw=0,tl=0,tt=0,tpf=0,tpa=0;
  const rows=_franchises.filter(f=>f.owner!==owner).map(opp=>{
    const key=owner<opp.owner?`${owner}|${opp.owner}`:`${opp.owner}|${owner}`;
    const k=_h2hAll[key];
    if(!k||!k[owner]) return null;
    const mine=k[owner],theirs=k[opp.owner]||{w:0,t:0,pf:0,games:0};
    const g=mine.games, w=mine.w, t=mine.t, l=g-w-t;
    if(!g) return null;
    tw+=w;tl+=l;tt+=t;tpf+=mine.pf;tpa+=theirs.pf;
    const pct=g?w/g:0;
    return {opp,w,l,t,g,pct,pf:mine.pf,pa:theirs.pf};
  }).filter(Boolean).sort((a,b)=>b.g-a.g||b.pct-a.pct);

  const tg=tw+tl+tt;
  const tpct=tg?(tw/tg):0;
  body.innerHTML=`
    <div class="h2h-total">
      ${franchiseAvatar(me,38,9)}
      <div>
        <div class="h2h-total-rec">${tw}–${tl}${tt?`–${tt}`:''} <span style="font-size:13px;color:${tpct>=0.5?'var(--green)':'var(--red)'}">(${(tpct*100).toFixed(1)}%)</span></div>
        <div class="h2h-total-sub">${me?.name||''} · all-time vs the league · ${tg} games · ${tpf.toFixed(1)} PF / ${tpa.toFixed(1)} PA</div>
      </div>
    </div>
    ${rows.length?`<div class="tscroll"><table class="min560">
      <thead><tr><th>Opponent</th><th class="right">W</th><th class="right">L</th>${tt?'<th class="right">T</th>':''}<th class="right">Win %</th><th class="right">PF</th><th class="right">PA</th></tr></thead>
      <tbody>${rows.map(r=>`
        <tr>
          <td><div class="team-cell">${franchiseAvatar(r.opp,28,8)}<div class="team-info"><div class="team-name">${r.opp.name}</div><div class="team-sub">${r.g} game${r.g!==1?'s':''}</div></div></div></td>
          <td class="right" style="color:var(--green);font-weight:700">${r.w}</td>
          <td class="right" style="color:var(--red)">${r.l}</td>
          ${tt?`<td class="right" style="color:var(--text3)">${r.t}</td>`:''}
          <td class="right"><span style="font-weight:600;color:${r.pct>=0.5?'var(--green)':'var(--red)'}">${(r.pct*100).toFixed(0)}%</span> <span class="winpct-bar"><span class="winpct-fill" style="width:${(r.pct*100).toFixed(0)}%;background:${r.pct>=0.5?'var(--green)':'var(--red)'};display:block"></span></span></td>
          <td class="right pf">${r.pf.toFixed(1)}</td>
          <td class="right pa">${r.pa.toFixed(1)}</td>
        </tr>`).join('')}</tbody>
    </table></div>`:`<div class="tab-loading">No games found for this team.</div>`}`;
}

// ── PLAYER TENURE TAB ──────────────────────────────────────────────────────────
async function ensureTenure(){
  if(_tenure){renderTenureTable();return;}
  if(_tenureLoading) return;
  _tenureLoading=true;
  const body=document.getElementById('tenure-body');
  if(body) body.innerHTML=`<div class="tab-loading"><i class="fa fa-circle-notch"></i>Crunching every roster from every week of every season…<br><span style="font-size:11px;color:var(--text3)">first load takes a moment — it's cached after that</span></div>`;
  try{
    const results=await Promise.allSettled(ALL_SEASONS.map(async s=>{
      const r=await fetch(`${BASE}?type=seasontenure&seasonId=${s}&v=2`);
      if(!r.ok) return null;
      return {s, d:await r.json()};
    }));
    const tenure={};
    results.forEach(rr=>{
      if(rr.status!=='fulfilled'||!rr.value) return;
      const {s,d}=rr.value;
      const owners=_seasonMeta[s]?.owners||{};
      Object.entries(d.teams||{}).forEach(([tid,players])=>{
        const owner=owners[tid]||`team:${tid}`;
        const bucket=tenure[owner]||(tenure[owner]={});
        Object.entries(players).forEach(([pid,rec])=>{
          const p=bucket[pid]||(bucket[pid]={n:rec.n,wAll:0,pAll:0,seasons:{}});
          if(rec.n) p.n=rec.n;
          p.wAll+=rec.w||0; p.pAll+=rec.p||0;
          p.seasons[s]={w:rec.w||0,p:rec.p||0};
        });
      });
    });
    _tenure=tenure;
  }catch(e){
    const b=document.getElementById('tenure-body');
    if(b) b.innerHTML=`<div class="tab-loading" style="color:var(--red)">Failed to load roster history: ${e.message}</div>`;
    _tenureLoading=false;
    return;
  }
  _tenureLoading=false;
  renderTenureTable();
}
function renderTenureTable(){
  const body=document.getElementById('tenure-body'); if(!body||!_tenure) return;
  const sel=document.getElementById('tenure-team-select');
  const owner=sel?.value||_franchises[0]?.owner;
  const yr=getSeason();
  const q=(document.getElementById('tenure-search')?.value||'').trim().toLowerCase();
  const players=Object.entries(_tenure[owner]||{}).map(([pid,p])=>({
    pid, n:p.n||`Player #${pid}`,
    wAll:p.wAll, pAll:p.pAll,
    wYr:p.seasons[yr]?.w||0, pYr:p.seasons[yr]?.p||0,
  }))
  .filter(p=>!q||p.n.toLowerCase().includes(q))
  .sort((a,b)=>b.wAll-a.wAll||b.pAll-a.pAll);

  const shown=players.slice(0,100);
  body.innerHTML=shown.length?`<div class="tscroll"><table class="min480">
    <thead><tr><th>Player</th><th class="right">Weeks ${yr}</th><th class="right">Pts ${yr}</th><th class="right">Weeks all-time</th><th class="right">Pts all-time</th></tr></thead>
    <tbody>${shown.map((p,i)=>`
      <tr>
        <td><span class="rank" style="margin-right:8px">${i+1}</span><span style="font-weight:600;font-size:13px">${p.n}</span></td>
        <td class="right">${p.wYr||'—'}</td>
        <td class="right" style="color:var(--text2)">${p.wYr?p.pYr.toFixed(1):'—'}</td>
        <td class="right"><strong>${p.wAll}</strong></td>
        <td class="right pf">${p.pAll.toFixed(1)}</td>
      </tr>`).join('')}</tbody>
  </table></div>${players.length>100?`<div style="padding:12px 18px;font-size:11px;color:var(--text3)">Showing top 100 of ${players.length} — use search to find others.</div>`:''}`
  :`<div class="tab-loading">No players found${q?` matching “${q}”`:''}.</div>`;
}

// ── VIDEO ──────────────────────────────────────────────────────────────────────
function selectVideo(videoId){
  _activeVideoId=videoId;
  const iframe=document.getElementById('vi');
  const title=document.getElementById('vt');
  const v=_videos.find(v=>v.videoId===videoId);
  if(iframe)iframe.src=`https://www.youtube.com/embed/${videoId}`;
  if(title&&v)title.textContent=v.title;
  document.querySelectorAll('.video-thumb').forEach(el=>el.classList.toggle('active',el.dataset.vid===videoId));
}

// ── HELPERS ────────────────────────────────────────────────────────────────────
function sc(v){return v>0.5?'var(--green)':v<-0.5?'var(--red)':'var(--text2)';}
function cc(v){return v>0?'var(--green)':v<0?'var(--red)':'var(--text2)';}
function bp(v){return Math.min(100,Math.max(0,((v+3)/6)*100)).toFixed(1);}
function bc(v){return v>0.5?'var(--green)':v<-0.5?'var(--red)':'var(--accent)';}

function renderTx(tx,teamMap){
  const date=tx.processedDate?new Date(tx.processedDate).toLocaleDateString('en-US',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})
            :(tx.scoringPeriodId?`Week ${tx.scoringPeriodId}`:'');
  const team=teamMap[tx.teamId]||'Unknown';
  const av=logoImg(tx.teamId,'team-logo-sm');
  const type=tx.type||'';const items=tx.items||[];
  const named=pid=>_playerNames[pid]?` <strong>${_playerNames[pid]}</strong>`:'';
  if(type==='WAIVER'||type==='FREEAGENT'){
    const bid=tx.bidAmount!=null?` · <span style="color:var(--accent)">$${tx.bidAmount}${tx._estBid?' est.':''}</span>`:'';
    return items.filter(i=>i.type==='ADD').map(i=>`
      <div class="activity-item"><div class="act-icon add"><i class="fa fa-plus"></i></div>
      <div><div class="act-title">${av}Add${named(i.playerId)} by <strong>${team}</strong>${bid}</div>
      <div class="act-sub">${date} · ${type==='WAIVER'?'Waiver':'Free Agent'}</div></div></div>`).join('')+
    items.filter(i=>i.type==='DROP').map(i=>`
      <div class="activity-item"><div class="act-icon drop"><i class="fa fa-minus"></i></div>
      <div><div class="act-title">${av}Drop${named(i.playerId)} by <strong>${team}</strong></div><div class="act-sub">${date}</div></div></div>`).join('');
  }
  if(type==='TRADE_ACCEPT'||type==='TRADE')
    return`<div class="activity-item"><div class="act-icon trade"><i class="fa fa-right-left"></i></div>
      <div><div class="act-title">${av}Trade · <strong>${items.length} player${items.length!==1?'s':''}</strong>${items.map(i=>named(i.playerId)).filter(Boolean).join(',')}</div><div class="act-sub">${date}</div></div></div>`;
  return'';
}

// ── MAIN LOAD ──────────────────────────────────────────────────────────────────
async function loadDashboard(){
  const app=document.getElementById('app');
  _sortCol='pf';_sortAsc=false;
  setStatus('','–');
  app.innerHTML=`<div class="loading"><i class="fa fa-circle-notch"></i>Loading dashboard...</div>`;

  try{
    const season=getSeason();

    const [teamData,transData,schedData,ytData]=await Promise.all([
      espnFetch('mTeam'),
      txFetch(),
      espnFetch('mMatchup'),
      ytFetch()
    ]);

    _logoMap={}; _ownerMap={};
    _teams=(teamData.teams||[]).map(t=>{
      const r=t.record?.overall||{};
      _logoMap[t.id]=proxyLogo(t.logo);
      _ownerMap[t.id]=t.primaryOwner||(t.owners&&t.owners[0])||`team:${t.id}`;
      return{
        id:t.id,
        name:tName(t),
        abbrev:t.abbrev||'',
        wins:r.wins||0,losses:r.losses||0,ties:r.ties||0,
        pf:r.pointsFor||0,pa:r.pointsAgainst||0,
        moves:t.transactionCounter?.acquisitions||0,
        trades:t.transactionCounter?.trades||0,
        drops:t.transactionCounter?.drops||0,
        budgetSpent:t.transactionCounter?.acquisitionBudgetSpent||0,
      };
    }).sort((a,b)=>b.pf-a.pf);

    let transactions=transData.transactions||[];
    _txMeta={source:transData._source||'?',count:transData._count??(transactions.length),diag:transData._diag||[]};
    _allMatchups=schedData.schedule||[];
    const teamMap=Object.fromEntries(_teams.map(t=>[t.id,t.name]));
    _videos=ytData.videos||[];

    const playedWeeks=[...new Set(
      _allMatchups.filter(mu=>(mu.home?.totalPoints||0)>0||(mu.away?.totalPoints||0)>0)
        .map(mu=>mu.matchupPeriodId)
    )].sort((a,b)=>b-a);
    _currentWeek=playedWeeks[0]||1;
    const maxPlayedWeek=playedWeeks[0]||0;

    // Per-week player data (pts/slot/team/name) + all-season H2H ledger
    const weeklyData={};
    const weekFetches=[];
    if(maxPlayedWeek>0){
      for(let w=1;w<=maxPlayedWeek;w++) weekFetches.push(fetchPlayerWeekScores(w).then(d=>{weeklyData[w]=d;}));
    }
    const h2hFetch=buildAllTimeH2H().catch(()=>{});
    await Promise.all([...weekFetches, h2hFetch]);
    _weeklyData=weeklyData;
    Object.values(weeklyData).forEach(wk=>{for(const pid in wk){if(wk[pid].n)_playerNames[pid]=wk[pid].n;}});

    // If ESPN purged the transaction log (completed seasons), reconstruct it
    // from weekly roster diffs so C2/C3 still compute.
    _cmMode='transactions';
    if(!transactions.length){
      const inferred=inferTransactionsFromRosters(weeklyData,_teams);
      if(inferred.length){
        transactions=inferred.sort((a,b)=>(b.scoringPeriodId||0)-(a.scoringPeriodId||0));
        _cmMode='inferred';
        _txMeta={source:'inferred from weekly rosters',count:inferred.length,diag:_txMeta.diag};
      }
    }

    const{scores,breakdown}=await computeCoaching(_teams,transactions,weeklyData);
    _scores=scores;_breakdown=breakdown;

    const cmRanked=[..._teams].sort((a,b)=>(scores[b.id]||0)-(scores[a.id]||0));
    const totalMoves=_teams.reduce((s,t)=>s+t.moves,0);
    const totalTrades=_teams.reduce((s,t)=>s+t.trades,0);
    const totalDrops=_teams.reduce((s,t)=>s+t.drops,0);
    const avgPF=_teams.reduce((s,t)=>s+t.pf,0)/(_teams.length||1);
    const firstVid=_videos[0];
    _activeVideoId=firstVid?.videoId||null;

    document.getElementById('last-updated').textContent='Updated '+new Date().toLocaleTimeString();
    setStatus('live','Live');

    const franchiseOpts=sel=>_franchises.map(f=>`<option value="${f.owner}" ${f.owner===sel?'selected':''}>${f.name}</option>`).join('');

    app.innerHTML=`
      <!-- HOME -->
      <div class="tab-page" id="page-home">
        <div class="card" style="margin-bottom:20px" id="big4-display"></div>
        <div class="top-grid">
          <div class="card">
            <div class="section-header"><i class="fa fa-brain"></i>Coaching Metric<span class="badge-info">${_cmMode==='inferred'?'reconstructed from rosters · ':''}Click for breakdown</span></div>
            ${cmRanked.map((t,i)=>{
              const s=scores[t.id]||0;
              return`<div class="coaching-row" onclick="openCMModal(${t.id})">
                <div class="coaching-rank">${i===0?'🥇':i+1}</div>
                ${logoImg(t.id)}
                <div class="coaching-info"><div class="coaching-name">${t.name}</div><div class="coaching-sub">${t.wins}W · ${t.losses}L · ${t.pf.toFixed(0)} PF</div></div>
                <div class="coaching-bar"><div class="coaching-bar-fill" style="width:${bp(s)}%;background:${bc(s)}"></div></div>
                <div class="coaching-score" style="color:${sc(s)}">${s.toFixed(2)}</div>
                <div class="coaching-chevron"><i class="fa fa-chevron-right"></i></div>
              </div>`;
            }).join('')}
          </div>
          <div class="card">
            <div class="section-header"><i class="fa-brands fa-youtube" style="color:#ff0000"></i>Ball &amp; Chain Media</div>
            ${firstVid
              ?`<div class="video-featured"><iframe id="vi" src="https://www.youtube.com/embed/${firstVid.videoId}" allowfullscreen loading="lazy"></iframe></div>
                <div class="video-featured-title" id="vt">${firstVid.title}</div>
                ${_videos.length>1?`<div class="video-scroll-label">More Videos</div>
                <div class="video-list">${_videos.map(v=>`<div class="video-thumb ${v.videoId===_activeVideoId?'active':''}" data-vid="${v.videoId}" onclick="selectVideo('${v.videoId}')"><img src="${v.thumb||`https://i.ytimg.com/vi/${v.videoId}/mqdefault.jpg`}" alt="" loading="lazy"/><div class="video-thumb-title">${v.title}</div></div>`).join('')}</div>`:''}`
              :`<div style="padding:60px 24px;text-align:center;color:var(--text3)">Could not load videos</div>`
            }
          </div>
        </div>
      </div>

      <!-- HEADLINES -->
      <div class="tab-page" id="page-headlines">
        ${playedWeeks.length?`<div class="card">
          <div class="section-header"><i class="fa fa-newspaper"></i>Weekly Matchup Headlines</div>
          <div class="headline-controls">
            <span style="font-size:12px;color:var(--text3);margin-right:4px">Week:</span>
            ${playedWeeks.map(w=>`<button class="week-btn ${w===_currentWeek?'active':''}" data-week="${w}" onclick="renderHeadlines(${w})">Wk ${w}</button>`).join('')}
          </div>
          <div class="headline-grid" id="headline-grid"></div>
        </div>`:`<div class="card"><div class="tab-loading">No games played yet in ${season}.</div></div>`}
      </div>

      <!-- STANDINGS & STATS -->
      <div class="tab-page" id="page-standings">
        <div class="stat-grid">
          <div class="card stat-card"><div class="stat-label">Total Moves</div><div class="stat-value">${totalMoves}</div><div class="stat-sub">${totalMoves} adds · ${totalDrops} drops</div></div>
          <div class="card stat-card"><div class="stat-label">Total Trades</div><div class="stat-value">${totalTrades}</div><div class="stat-sub">across all teams</div></div>
          <div class="card stat-card"><div class="stat-label">Avg Points For</div><div class="stat-value">${avgPF.toFixed(1)}</div><div class="stat-sub">${season} season</div></div>
        </div>
        <div class="card" style="margin-bottom:22px">
          <div class="section-header"><i class="fa fa-ranking-star"></i>${season} Standings</div>
          <div class="standings-filters">
            <span style="font-size:12px;color:var(--text3);margin-right:4px">Sort:</span>
            <button class="filter-btn" onclick="sortAndHighlight('rank',this)">Record</button>
            <button class="filter-btn active" onclick="sortAndHighlight('pf',this)">Points For</button>
            <button class="filter-btn" onclick="sortAndHighlight('pa',this)">Points Against</button>
            <button class="filter-btn" onclick="sortAndHighlight('moves',this)">Most Active</button>
            <button class="filter-btn" onclick="sortAndHighlight('trades',this)">Most Trades</button>
            <button class="filter-btn" onclick="sortAndHighlight('cm',this)">Coaching Metric</button>
          </div>
          <div class="tscroll"><table class="min640"><thead id="standings-thead"></thead><tbody id="standings-tbody"></tbody></table></div>
        </div>
        <div class="two-col">
          <div class="card">
            <div class="section-header"><i class="fa fa-fire"></i>Highest Scoring</div>
            <table><tbody>${[..._teams].sort((a,b)=>b.pf-a.pf).slice(0,6).map((t,i)=>`
              <tr><td><div class="team-cell">${logoImg(t.id)}<span class="rank" style="margin:0 6px">${i+1}</span>${t.name}</div></td><td class="right pf">${t.pf.toFixed(1)}</td></tr>`).join('')}</tbody></table>
          </div>
          <div class="card">
            <div class="section-header"><i class="fa fa-arrow-trend-up"></i>Most Active</div>
            <table><tbody>${[..._teams].sort((a,b)=>b.moves-a.moves).slice(0,6).map((t,i)=>`
              <tr><td><div class="team-cell">${logoImg(t.id)}<span class="rank" style="margin:0 6px">${i+1}</span>${t.name}</div></td><td class="right" style="color:var(--text2)">${t.moves}</td><td class="right" style="color:var(--blue)">${t.trades}</td></tr>`).join('')}</tbody></table>
          </div>
        </div>
        <div class="card">
          <div class="section-header"><i class="fa fa-clock-rotate-left"></i>Recent Activity${_cmMode==='inferred'?'<span class="badge-info">reconstructed from weekly rosters</span>':''}</div>
          ${transactions.slice(0,10).map(tx=>renderTx(tx,teamMap)).filter(Boolean).join('')||`<div style="padding:28px;text-align:center;color:var(--text3)">No recent transactions</div>`}
        </div>
      </div>

      <!-- MATCHUP HISTORY -->
      <div class="tab-page" id="page-history">
        <div class="card">
          <div class="section-header"><i class="fa fa-scale-balanced"></i>Historical Matchup Records<span class="badge-info">all seasons · ${ALL_SEASONS[0]}–present</span></div>
          <div class="picker-bar">
            <label for="hist-team-select">Team:</label>
            <select id="hist-team-select" onchange="renderHistoryTable()">${franchiseOpts(_ownerMap[_teams[0]?.id])}</select>
          </div>
          <div id="history-body"></div>
        </div>
      </div>

      <!-- PLAYER TENURE -->
      <div class="tab-page" id="page-tenure">
        <div class="card">
          <div class="section-header"><i class="fa fa-user-clock"></i>Player Tenure<span class="badge-info">weeks rostered &amp; points · all seasons</span></div>
          <div class="picker-bar">
            <label for="tenure-team-select">Team:</label>
            <select id="tenure-team-select" onchange="renderTenureTable()">${franchiseOpts(_ownerMap[_teams[0]?.id])}</select>
            <input type="text" id="tenure-search" placeholder="Search player…" oninput="renderTenureTable()"/>
          </div>
          <div id="tenure-body"></div>
        </div>
      </div>
    `;

    renderStandingsTable();
    renderBig4();
    if(playedWeeks.length) renderHeadlines(_currentWeek);
    renderHistoryTable();
    switchTab(_activeTab);
    if(_activeTab!=='tenure'&&_tenure) renderTenureTable();

  }catch(err){
    setStatus('err','Error');
    document.getElementById('last-updated').textContent='Failed to load';
    document.getElementById('app').innerHTML=`<div class="err-box"><i class="fa fa-triangle-exclamation" style="margin-right:8px"></i>${err.message}</div>`;
    console.error(err);
  }
}

document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeCMModalDirect();closePinOverlay();}});
loadDashboard();
