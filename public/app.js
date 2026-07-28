const BASE='/api/espn';
// ── Local cache (localStorage) for instant loads ────────────────────────────
function cacheGet(k){try{const r=localStorage.getItem('gfl-cache:'+k);return r?JSON.parse(r):null;}catch{return null;}}
function cacheSet(k,d){try{localStorage.setItem('gfl-cache:'+k,JSON.stringify({t:Date.now(),d}));}catch{}}
// Historical data is archived as static JSON in /data — read that first (no ESPN call), fall back to the live proxy.
async function histJSON(type, season, liveURL){
  try{ const r=await fetch(`/data/${type}-${season}.json`); if(r.ok){ const j=await r.json(); if(j) return j; } }catch(e){}
  try{ const r=await fetch(liveURL); return r.ok?await r.json():null; }catch(e){ return null; }
}
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
let _tenure=null,_tenureLoading=false;  // owner -> pid -> {n, wAll(roster), sAll(started), pAll, seasons:{y:{w,s,p}}}
let _transactions=[];                   // current season's transaction list (real/archive/inferred)
let _draftCache={},_draftLoading=false; // season -> {picks, stats}
let _tradeSort='unbalanced';            // 'unbalanced' | 'balanced' | 'week'
let _statsView='standings';             // 'standings' | 'c2' | 'c3'
let _c3Team=null;                        // teamId for the C3 breakdown dropdown (defaults to Lebron's)
let _profileTeam=null;                   // teamId string for the profile tab
let _hardware={};                        // owner -> {rings,confs} (filled by renderLeagueHistory)
let _hardwareHonors={};                  // owner -> {rings,confs,awards} (filled by renderLeagueHistory)
let _profileHonorYears={};               // owner -> {champ:[],conf:[]} year captions
let _cmBreakdown={};                     // teamId -> computed {c1,c2,c3,detail} for breakdown tables
let _tradeScope='season';               // 'season' | 'alltime'
let _tradeTeamFilter='';                 // owner id to filter trades by (optional)
let _tradeCache={};                     // season -> {trades,source} from /api/espn?type=seasontrades
let _draftTeamSel=null;                 // team filter on draft tab
let _draftListScope='year',_draftAllCache=null;
const _logoColorCache={};               // teamId -> dominant logo color
const POS_NAMES={1:'QB',2:'RB',3:'WR',4:'TE',5:'K',16:'D/ST'};
let _activeTab='home';
const ALL_SEASONS=['2022','2023','2024','2025'];

// ── THEME ──────────────────────────────────────────────────────────────────────
document.documentElement.dataset.theme='dark';   // dark only — light mode removed
const TAB_COLORS={home:'#ffb347',standings:'#5aa9ff',trades:'#3fd07a',draft:'#b58cff',history:'#33d6c4',tenure:'#ff6f9c',teams:'#ff8f5a',legacy:'#f4c04d',punishment:'#ff5f5f',badbeat:'#e879f9',gabe:'#a3e635',marathon:'#22d3ee'};
const TAB_LABELS={home:'Home',standings:'Standings & Stats',trades:'Trades',draft:'Draft',history:'Matchup History',tenure:'Player Tenure',teams:'Team Profiles',legacy:'League History',punishment:'Punishment',badbeat:"Bad Beat O'Meter",gabe:"Gabe's Greatness",marathon:'Marathons Ran'};
function goHome(){ try{toggleTabDD(false);}catch(e){} switchTab('home'); window.scrollTo(0,0); }
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
  const c=cacheGet('youtube');
  // kick off a background refresh so the list stays current for next open
  const refresh=fetch(`${BASE}?type=youtube`).then(r=>r.ok?r.json():null)
    .then(j=>{if(j&&j.videos&&j.videos.length)cacheSet('youtube',j);return j;}).catch(()=>null);
  if(c&&c.d&&c.d.videos&&c.d.videos.length) return c.d;   // instant from cache
  return (await refresh)||{videos:[]};
}
async function txFetch(){
  let d={transactions:[],_source:'error'};
  try{const r=await fetch(`${BASE}?type=transactions&seasonId=${getSeason()}`);if(r.ok)d=await r.json();}catch{}
  if(!(d.transactions||[]).length){
    // ESPN purged it — check the git-archived snapshot (see /data/README.md)
    try{
      const ar=await fetch(`/data/transactions-${getSeason()}.json`);
      if(ar.ok){const ad=await ar.json();if((ad.transactions||[]).length)d={transactions:ad.transactions,_source:'git archive ('+(ad.savedAt||'').slice(0,10)+')',_count:ad.transactions.length,_diag:d._diag||[]};}
    }catch{}
  }
  return d;
}
async function fetchPlayerWeekScores(week){
  try{
    const r=await fetch(`${BASE}?type=playerscores&seasonId=${getSeason()}&scoringPeriodId=${week}`);
    return r.ok?(await r.json()).players||{}:{};
  }catch{return{};}
}

// ── OFFICIAL COACHING METRIC RECORDS (archived in /data/cm-official.json) ────
let _cmOfficialData;
async function loadCMOfficial(){
  if(_cmOfficialData!==undefined) return _cmOfficialData;
  try{const r=await fetch('/data/cm-official.json');_cmOfficialData=r.ok?await r.json():null;}catch{_cmOfficialData=null;}
  return _cmOfficialData;
}
let _awardsData;
async function loadAwards(){
  if(_awardsData!==undefined) return _awardsData;
  try{const r=await fetch('/data/awards.json');_awardsData=r.ok?await r.json():null;}catch{_awardsData=null;}
  return _awardsData;
}
function awardStrip(s){return String(s||'').toLowerCase().replace(/[^a-z0-9 ]/g,'').replace(/\s+/g,' ').trim();}
// Match an award's team name to a current franchise.
function awardOwner(name){
  const n=awardStrip(name); if(!n) return null;
  let best=null;
  _franchises.forEach(f=>{const fn=awardStrip(f.name);if(fn===n||fn.includes(n)||n.includes(fn))best=f;});
  if(!best){const nw=n.split(' ').filter(w=>w.length>3);_franchises.forEach(f=>{const fn=awardStrip(f.name);if(nw.some(w=>fn.includes(w)))best=f;});}
  return best;
}
// All awards won by an owner, newest year first.
function awardsForOwner(owner){
  if(!_awardsData) return [];
  const out=[];
  Object.keys(_awardsData.years||{}).sort((a,b)=>b-a).forEach(y=>{
    const yr=_awardsData.years[y];
    (_awardsData.order||Object.keys(yr)).forEach(k=>{
      (yr[k]||[]).forEach(entry=>{
        const fr=awardOwner(entry.team);
        if(fr&&fr.owner===owner){const lab=_awardsData.labels[k]||{name:k};out.push({year:y,key:k,label:lab,detail:entry.detail||''});}
      });
    });
  });
  return out;
}
const AWARD_SHORT={coy:'Coach of Yr',commitment:'Commitment',comeback:'Comeback',punishment:'Punishment',disappoint:'Disappointing'};
// Shared honor-shelf tiles: championships, conference titles, and awards, each
// with an icon and a clear label so it reads without guessing.
function honorTiles(rings,confs,awards,years){
  const tiles=[];
  const tile=(emoji,label,count,cls,sub)=>`<div class="honor-tile ${cls}"><div class="honor-lb">${label}${count>1?` <b>×${count}</b>`:''}</div>${sub?`<div class="honor-sub">${sub}</div>`:''}</div>`;
  if(rings) tiles.push(tile('🏆','Champion',rings,'champ hk-champ',(years&&years.champ&&years.champ.join(', '))||''));
  if(confs) tiles.push(tile('⭐','Conference',confs,'conf hk-conf',(years&&years.conf&&years.conf.join(', '))||''));
  const byKey={};(awards||[]).forEach(aw=>{(byKey[aw.key]||(byKey[aw.key]={n:0,label:aw.label,yrs:[]})).n++;byKey[aw.key].yrs.push(aw.year);});
  (_awardsData?.order||Object.keys(byKey)).forEach(k=>{const v=byKey[k];if(!v)return;
    tiles.push(tile(v.label.emoji,AWARD_SHORT[k]||v.label.name,v.n,`hk-${k} ${v.label.good===false?'bad':'award'}`,v.yrs.join(', ')));});
  return tiles.join('');
}
function normName(s){return String(s||'').toLowerCase().replace(/\s+/g,' ').trim();}
function officialFor(team,entry){
  const n=normName(team.name);
  for(const k in (entry.scores||{})){
    const kn=normName(k);
    if(kn===n||n.includes(kn)||kn.includes(n)) return entry.scores[k];
  }
  return null;
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
  const img=url?`<img src="${url}" loading="lazy" decoding="async" style="position:absolute;inset:0;width:100%;height:100%;object-fit:contain;background:var(--bg2)" onerror="this.remove()"/>`:'';
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

// ── COLOR HELPERS ─────────────────────────────────────────────────────────────
// Lift dark extracted colors so they read against the dark background while
// keeping the hue that identifies the team.
function readableColor(col){
  const lightMode=document.documentElement.dataset.theme==='light';
  const clampL=l=>lightMode?Math.min(l,42):Math.max(l,62); // % — dark ink on light bg, bright on dark
  let r,g,b,m;
  if((m=String(col).match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/))){r=+m[1]/255;g=+m[2]/255;b=+m[3]/255;}
  else if((m=String(col).match(/hsl\((\d+)[ ,]+(\d+)%[ ,]+(\d+)%\)/))) return `hsl(${m[1]} ${Math.max(+m[2],50)}% ${clampL(+m[3])}%)`;
  else return col;
  const mx=Math.max(r,g,b),mn=Math.min(r,g,b);
  let hph=0,s=0;const l=(mx+mn)/2;
  if(mx!==mn){
    const d=mx-mn;
    s=l>0.5?d/(2-mx-mn):d/(mx+mn);
    hph=mx===r?((g-b)/d+(g<b?6:0)):mx===g?((b-r)/d+2):((r-g)/d+4);
    hph*=60;
  }
  return `hsl(${Math.round(hph)} ${Math.round(Math.max(s,0.5)*100)}% ${clampL(Math.round(l*100))}%)`;
}

// ── DOMINANT LOGO COLOR (for trade bars) ─────────────────────────────────────
async function logoMainColor(teamId){
  if(_logoColorCache[teamId]) return _logoColorCache[teamId];
  const url=_logoMap[teamId];
  const fallback=teamColor(teamId);
  if(!url) return (_logoColorCache[teamId]=fallback);
  try{
    const img=new Image();
    img.src=url;
    await new Promise((res,rej)=>{img.onload=res;img.onerror=rej;setTimeout(rej,4000);});
    const S=24,c=document.createElement('canvas');c.width=S;c.height=S;
    const ctx=c.getContext('2d');ctx.drawImage(img,0,0,S,S);
    const d=ctx.getImageData(0,0,S,S).data;
    const buckets={};
    for(let i=0;i<d.length;i+=4){
      const r=d[i],g=d[i+1],b=d[i+2],al=d[i+3];
      if(al<128) continue;
      const mx=Math.max(r,g,b),mn=Math.min(r,g,b);
      if(mx-mn<28||mx<45||mn>235) continue;           // skip gray / near-black / near-white
      let hph;
      if(mx===r) hph=((g-b)/(mx-mn)+6)%6; else if(mx===g) hph=(b-r)/(mx-mn)+2; else hph=(r-g)/(mx-mn)+4;
      const key=Math.round(hph*60/24)*24;              // 24° hue buckets
      const e=buckets[key]||(buckets[key]={n:0,r:0,g:0,b:0});
      e.n++;e.r+=r;e.g+=g;e.b+=b;
    }
    const best=Object.values(buckets).sort((x,y)=>y.n-x.n)[0];
    if(!best||best.n<8) return (_logoColorCache[teamId]=fallback);
    return (_logoColorCache[teamId]=`rgb(${Math.round(best.r/best.n)},${Math.round(best.g/best.n)},${Math.round(best.b/best.n)})`);
  }catch{return (_logoColorCache[teamId]=fallback);}
}

// ── ALL-TIME HEAD-TO-HEAD (across every season) ───────────────────────────────
// Keyed on stable owner GUIDs — ESPN reassigns team ids between seasons.
function ownerOf(team){
  return team?.primaryOwner || (team?.owners&&team.owners[0]) || `team:${team?.id}`;
}
function tName(t){return t.name||`${t.location||''} ${t.nickname||''}`.trim()||t.abbrev||'Team';}
async function fetchSeasonData(season){
  try{
    const d=await histJSON('season',season,`${BASE}?view=mMatchup&view=mTeam&view=mSettings&seasonId=${season}`);
    if(!d) return null;
    const owners={},names={},teams={};
    const divisions={};
    (d.settings?.scheduleSettings?.divisions||[]).forEach(dv=>{divisions[dv.id]=dv.name;});
    (d.teams||[]).forEach(t=>{
      const o=ownerOf(t);
      owners[t.id]=o;
      names[o]={name:tName(t),logo:t.logo||null,teamId:t.id};
      teams[t.id]={name:tName(t),logo:t.logo||null,owner:o,div:t.divisionId??0,rank:t.rankCalculatedFinal||0,seed:t.playoffSeed||0};
    });
    const playoffTeamCount=d.settings?.scheduleSettings?.playoffTeamCount||d.settings?.playoffTeamCount||6;
    return {season,schedule:d.schedule||[],owners,names,teams,divisions,playoffTeamCount};
  }catch{return null;}
}
async function buildAllTimeH2H(){
  const results=await Promise.allSettled(ALL_SEASONS.map(fetchSeasonData));
  const ledger={},games={};
  _seasonMeta={};
  results.forEach(res=>{
    if(res.status!=='fulfilled'||!res.value) return;
    const {season,schedule,owners,names,teams}=res.value;
    _seasonMeta[season]={owners,names,teams,schedule,divisions:res.value.divisions||{},playoffTeamCount:res.value.playoffTeamCount||6};
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
// ── PER-PAGE BACKGROUNDS (color-matched to each tab) ─────────────────────────
const PAGE_BG={
  home:     {type:'video', src:'/bg/home.mp4',  poster:'/bg/home.jpg',  ov:0.6},
  standings:{type:'image', src:'/bg/standings.webp', ov:0.6},
  draft:    {type:'image', src:'/bg/draft.webp',     ov:0.6},
  trades:   {type:'image', src:'/bg/trades.webp',    ov:0.6},
  history:  {type:'image', src:'/bg/history.webp',   ov:0.6},
  tenure:   {type:'image', src:'/bg/tenure.webp',    ov:0.6},
};
function setPageBg(tab){
  const wrap=document.getElementById('pgbg'); if(!wrap) return;
  const vid=document.getElementById('pgbg-video'), img=document.getElementById('pgbg-image');
  const m=PAGE_BG[tab];
  if(!m){ wrap.style.display='none'; if(vid&&!vid.paused) vid.pause(); document.documentElement.classList.remove('has-pagebg'); return; }
  wrap.style.display='block';
  document.documentElement.classList.add('has-pagebg');
  wrap.style.setProperty('--ov', m.ov);
  if(m.type==='video'){
    if(img) img.style.display='none';
    if(vid){
      vid.style.display='block';
      if(vid.dataset.src!==m.src){ vid.dataset.src=m.src; if(m.poster) vid.poster=m.poster; vid.src=m.src; vid.load(); }
      const p=vid.play(); if(p&&p.catch) p.catch(()=>{});
    }
  } else {
    if(vid){ if(!vid.paused) vid.pause(); vid.style.display='none'; }
    if(img){ img.style.display='block'; img.style.backgroundImage=`linear-gradient(rgba(6,6,9,${m.ov}),rgba(6,6,9,${m.ov})), url("${m.src}")`; }
  }
}
function switchTab(name){
  _activeTab=name;
  document.documentElement.dataset.tabaccent=name;   // each tab drives the page accent
  setPageBg(name);
  document.querySelectorAll('.tab-btn').forEach(b=>b.classList.toggle('active',b.dataset.tab===name));
  document.querySelectorAll('.tab-page').forEach(p=>p.classList.toggle('active',p.id==='page-'+name));
  if(name==='tenure') ensureTenure();
  if(name==='draft') ensureDraft();
  if(name==='trades') renderTradesTab();
  if(name==='teams') renderProfile();
  if(name==='punishment') renderPunishment();
  if(name==='standings') setStatsView(_statsView);
  if(name==='badbeat') renderBadBeat();
  if(name==='gabe') renderGabe();
  if(name==='history'){ renderHistoryTable(); loadHistoryScorers().then(()=>{ if(_activeTab==='history') renderHistoryTable(); }); }
  updateTabDD(name);
}
// ── MOBILE TAB DROPDOWN (replaces hamburger) ─────────────────────────────────
function buildTabDD(){
  const menu=document.getElementById('tab-dd-menu'); if(!menu) return;
  const btns=[...document.querySelectorAll('#tabbar .tab-btn')];
  menu.innerHTML=btns.map(b=>{
    const tab=b.dataset.tab;
    const icon=(b.querySelector('i')||{}).className||'fa fa-circle';
    const label=b.textContent.trim();
    const tc=TAB_COLORS[tab]||'var(--accent)';
    const active=(tab===_activeTab)?' active':'';
    return `<button class="tab-dd-item${active}" data-tab="${tab}" style="--tc:${tc}" onclick="tabDDGo('${tab}')"><i class="${icon}" style="color:${tc}"></i><span>${label}</span></button>`;
  }).join('');
}
function toggleTabDD(open){
  const menu=document.getElementById('tab-dd-menu'); if(!menu) return;
  const show=(open===undefined)?!menu.classList.contains('show'):!!open;
  if(show) buildTabDD();
  menu.classList.toggle('show',show);
  document.documentElement.classList.toggle('nav-lock',show);
  document.body.classList.toggle('nav-lock',show);
  const caret=document.querySelector('.tab-dd-caret'); if(caret) caret.style.transform=show?'rotate(180deg)':'';
}
function tabDDGo(tab){ toggleTabDD(false); switchTab(tab); window.scrollTo(0,0); }
function updateTabDD(name){
  const btn=document.querySelector('#tabbar .tab-btn[data-tab="'+name+'"]');
  const ic=document.getElementById('tab-dd-ic'), lb=document.getElementById('tab-dd-lb'), b=document.getElementById('tab-dd-btn');
  const label=(btn&&btn.textContent.trim())||TAB_LABELS[name]||'';
  const icon=(btn&&btn.querySelector('i'))?btn.querySelector('i').className:'fa fa-circle';
  const tc=TAB_COLORS[name]||'var(--accent)';
  if(lb) lb.textContent=label;
  if(ic){ ic.className=icon; ic.style.color=tc; }
  if(b) b.style.setProperty('--tc',tc);
  document.querySelectorAll('#tab-dd-menu .tab-dd-item').forEach(i=>i.classList.toggle('active',i.dataset.tab===name));
}
document.addEventListener('click',function(e){ const dd=document.getElementById('tab-dd'); if(dd&&!dd.contains(e.target)) toggleTabDD(false); });

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
    const groups={}; const faAdds=[];
    moved.forEach(m=>{
      if(m.from!=null&&m.to!=null&&m.from!==m.to){
        const key=m.from<m.to?`${m.from}|${m.to}`:`${m.to}|${m.from}`;
        (groups[key]||(groups[key]=[])).push(m);
      }else if(m.from==null&&m.to!=null) faAdds.push(m);
    });
    // Players appearing from free agency are waiver/FA adds.
    faAdds.forEach(m=>{
      txns.push({type:'WAIVER',teamId:m.to,bidAmount:avgBid[m.to]||1,scoringPeriodId:w,status:'EXECUTED',_estBid:true,
        items:[{type:'ADD',playerId:m.pid,toTeamId:m.to}]});
    });
    // Trades are RECIPROCAL: players must move in BOTH directions between the
    // same two teams in the same week (uneven 2-for-1 legs included). Verified
    // against this league's history — every real trade swaps at least one
    // player each way, while strictly one-way roster-to-roster moves are drops
    // claimed off waivers, which belong in C3, not C2.
    Object.values(groups).forEach(list=>{
      const dirs=new Set(list.map(m=>`${m.from}>${m.to}`));
      if(dirs.size>1){
        txns.push({type:'TRADE_ACCEPT',teamId:list[0].to,scoringPeriodId:wPrev,status:'EXECUTED',
          items:list.map(m=>({type:'TRADE',playerId:m.pid,fromTeamId:m.from,toTeamId:m.to}))});
      }else{
        list.forEach(m=>{
          txns.push({type:'WAIVER',teamId:m.to,bidAmount:avgBid[m.to]||1,scoringPeriodId:w,status:'EXECUTED',_estBid:true,
            items:[{type:'ADD',playerId:m.pid,toTeamId:m.to}]});
        });
      }
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
// ESPN player headshot (routed through the logo proxy). Falls back to a person
// icon (or shield for D/ST) if ESPN has no image for that id.
function playerImg(pid,size,name){
  size=size||24;
  const isDef=/d\/st|dst|defense/i.test(String(name||''));
  const url=(pid!=null&&!isDef)?proxyLogo(`https://a.espncdn.com/i/headshots/nfl/players/full/${pid}.png`):null;
  const box=`position:relative;width:${size}px;height:${size}px;border-radius:50%;flex:0 0 ${size}px;display:inline-flex;align-items:center;justify-content:center;background:rgba(255,255,255,0.08);overflow:hidden;vertical-align:middle;`;
  const icon=`<i class="fa ${isDef?'fa-shield-halved':'fa-user'}" style="font-size:${Math.round(size*0.42)}px;color:var(--text3);opacity:.55"></i>`;
  const img=url?`<img src="${url}" loading="lazy" decoding="async" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:top" onerror="this.remove()"/>`:'';
  return `<span class="phs" style="${box}">${icon}${img}</span>`;
}
// name with headshot, inline
function pNameImg(pid,size,name){const n=name||pName(pid);return `<span class="pname">${playerImg(pid,size,n)}<span>${n}</span></span>`;}
function openCMModal(teamId){
  if(_cmMode==='none') return;
  const team=_teams.find(t=>t.id===teamId);if(!team)return;
  const bd=_breakdown[teamId]||{};
  const s=_scores[teamId]||0;
  if(bd.official){
    const legacy=bd.c1==null;
    document.getElementById('cm-title').textContent=team.name;
    document.getElementById('cm-body').innerHTML=`
      <div class="modal-total">
        <div class="modal-total-left"><div class="label">Coaching Metric Score</div><div class="sub">${legacy?'Legacy 2024 weighted-metric formula':'Official league formula'} · higher = better</div></div>
        <div class="modal-total-score" style="color:${s>0?'var(--green)':s<0?'var(--red)':'var(--text2)'}">${s.toFixed(3)}</div>
      </div>
      <div class="modal-note"><i class="fa fa-book" style="margin-right:6px;color:var(--blue)"></i>Official commissioner-calculated value from the league's Coaching Metric spreadsheet${bd.source?` (<b>${bd.source}</b>)`:''}, archived in the site's repository so it survives ESPN's data deletion.${legacy?' The 2024 season used a different formula, so only the final weighted-metric value is available — no component breakdown.':''}</div>
      ${legacy?'':`<div class="modal-formula">
        <div style="font-size:12px;color:var(--text3);margin-bottom:9px;text-transform:uppercase;letter-spacing:0.8px">Score Breakdown</div>
        <div class="eq-line"><span style="color:var(--accent);font-weight:700;width:26px">C1</span><span style="color:var(--text2);flex:1">Points Efficiency</span><span style="font-weight:700;color:${cc(bd.c1)}">${bd.c1.toFixed(3)}</span></div>
        <div class="eq-line"><span style="color:var(--blue);font-weight:700;width:26px">C2</span><span style="color:var(--text2);flex:1">Trade Metric</span><span style="font-weight:700;color:${cc(bd.c2)}">${bd.c2>=0?'+':''}${bd.c2.toFixed(3)}</span></div>
        <div class="eq-line"><span style="color:var(--green);font-weight:700;width:26px">C3</span><span style="color:var(--text2);flex:1">FAAB Efficiency</span><span style="font-weight:700;color:${cc(bd.c3)}">${bd.c3>=0?'+':''}${bd.c3.toFixed(3)}</span></div>
        <hr/>
        <div class="eq-line"><span style="width:26px"></span><span style="color:var(--text2);flex:1">Final</span><span style="font-weight:800;font-size:14px;color:${s>0?'var(--green)':'var(--red)'}">${s.toFixed(3)}</span></div>
      </div>`}`;
    document.getElementById('cm-overlay').classList.add('open');
    return;
  }
  const d=bd.detail||{};
  const c1f=bd.c1||0,c2f=bd.c2||0,c3f=bd.c3||0,rawf=bd.raw||0;

  const tradeRows=[
    ...(d.tradesReceived||[]).map(r=>`<div class="modal-comp-row"><span class="key pname">${playerImg(r.pid,18,pName(r.pid))}<span>Got ${pName(r.pid)} (joined wk ${r.week+1})</span></span><span class="val" style="color:var(--green)">+${r.pts.toFixed(1)} pts</span></div>`),
    ...(d.tradesSent||[]).map(r=>`<div class="modal-comp-row"><span class="key pname">${playerImg(r.pid,18,pName(r.pid))}<span>Sent ${pName(r.pid)} (left wk ${r.week+1})</span></span><span class="val" style="color:var(--red)">−${r.pts.toFixed(1)} pts</span></div>`)
  ].join('')||`<div class="modal-comp-row"><span class="key">No trades found</span><span class="val" style="color:var(--text3)">—</span></div>`;

  const waiverRows=(d.waiverPickups||[]).slice().sort((a,b)=>b.pts/Math.max(b.margin??b.bid,1)-a.pts/Math.max(a.margin??a.bid,1)).map(w=>{
    const mar=Math.max(w.margin??w.bid,1);
    return `<div class="modal-comp-row"><span class="key pname">${playerImg(w.pid,18,pName(w.pid))}<span>${pName(w.pid)} · wk ${w.week} · $${w.bid}${w.next?` (next bid $${w.next})`:''}${w.est?'<span style="opacity:0.6"> est.</span>':''}</span></span><span class="val">${w.pts.toFixed(1)} pts ÷ $${mar} = ${(w.pts/mar).toFixed(2)}x</span></div>`;
  }).join('')||`<div class="modal-comp-row"><span class="key">No waiver adds found</span><span class="val" style="color:var(--text3)">—</span></div>`;

  const modeNote=_cmMode==='inferred'
    ?`<div class="modal-note"><i class="fa fa-circle-info" style="margin-right:6px;color:var(--blue)"></i>ESPN deletes the detailed transaction log when a season ends, so trades and pickups for this season are <b>reconstructed from weekly roster changes</b>: players swapping between two rosters in the same week count as a trade (uneven legs included); strictly one-way roster-to-roster moves are drops claimed off waivers and count toward C3 instead. ESPN also deleted all FAAB bid amounts, so every pickup uses the team's estimated average bid (budget spent ÷ adds) and the C3 margin equals that full bid. Real per-bid margins apply automatically to live seasons.</div>`
    :'';

  document.getElementById('cm-title').textContent=team.name;
  document.getElementById('cm-body').innerHTML=`
    <div class="modal-total">
      <div class="modal-total-left"><div class="label">Coaching Metric Score</div><div class="sub">Z-score · higher = better</div></div>
      <div class="modal-total-score" style="color:${sc(s)}">${s.toFixed(3)}</div>
    </div>
    ${modeNote}
    <div class="modal-formula">
      <div style="font-size:12px;color:var(--text3);margin-bottom:9px;text-transform:uppercase;letter-spacing:0.8px">Score Breakdown</div>
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

  el.innerHTML=`<div class="sec-head">
    <span class="svc-idx">— 04</span><i class="fa fa-crown"></i>Balls Big 4
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
          <div class="big4-name tlink" data-tid="${t.id}">${t.name}</div>
          <div class="big4-record">${t.wins}–${t.losses} · ${t.pf.toFixed(0)} PF</div>
          ${_cmMode==='none'?'':`<div class="big4-cm" style="color:${sc(s)}">CM: ${s.toFixed(2)}</div>`}
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

// Generic click-to-sort for any <table class="srt">. Numeric columns sort
// numerically, text columns alphabetically; click again to reverse.
function initSortable(root){
  (root||document).querySelectorAll('table.srt').forEach(tbl=>{
    if(tbl.dataset.srt) return; tbl.dataset.srt='1';
    if(!tbl.tHead||!tbl.tBodies[0]) return;
    const hrow=tbl.tHead.rows[tbl.tHead.rows.length-1];
    [...hrow.cells].forEach((th,ci)=>{
      if(th.dataset.nosort!==undefined) return;
      th.classList.add('srt-th');
      th.addEventListener('click',()=>{
        const asc=(tbl.dataset.col==String(ci))? tbl.dataset.asc!=='1' : false;
        tbl.dataset.col=ci; tbl.dataset.asc=asc?'1':'0';
        const tb=tbl.tBodies[0], rows=[...tb.rows];
        const val=r=>{const c=r.cells[ci]; if(!c) return '';
          const t=c.textContent.trim();
          const num=parseFloat(t.replace(/[^0-9.\-]/g,''));
          return (/[0-9]/.test(t)&&!isNaN(num))?num:t.toLowerCase();};
        rows.sort((r1,r2)=>{const a1=val(r1),b1=val(r2);
          if(typeof a1==='number'&&typeof b1==='number') return asc?a1-b1:b1-a1;
          return asc?String(a1).localeCompare(String(b1)):String(b1).localeCompare(String(a1));});
        rows.forEach(r=>tb.appendChild(r));
        [...hrow.cells].forEach(h=>{h.classList.remove('sorted');const x=h.querySelector('.srt-arw');if(x)x.remove();});
        th.classList.add('sorted');
        const arw=document.createElement('span');arw.className='srt-arw';arw.textContent=asc?' ↑':' ↓';th.appendChild(arw);
      });
    });
  });
}
function topStarter(week,teamId){
  const wd=_weeklyData[week]; if(!wd) return null;
  let best=null;
  for(const pid in wd){
    const e=wd[pid];
    if(e.team===teamId&&e.started&&(best==null||e.pts>best.pts)) best={pid,pts:e.pts,n:e.n||_playerNames[pid]||null};
  }
  return (best&&best.n)?best:null;
}

/* Headline puns keyed to team names. Each entry is a short pun/reference
   headline (h) + a one-sentence description (d) built from the matchup context
   (c.W winner, c.L loser, c.score, c.topW top performer, c.diff margin). The
   headline is ALWAYS a play on a name/player in the matchup — never generic. */
const TEAM_PUNS=[
  {re:/bryan football/i,e:[
    {h:"Bryan's Song",d:c=>`No logo, no nickname, no problem — the Bryan Football Team rolled ${c.L} ${c.score}.`},
    {h:"The Bryan Identity",d:c=>`The Bryan Football Team knew exactly who they were, erasing ${c.L} ${c.score}.`},
    {h:"Brand-Name Beatdown",d:c=>`The most generic name in the league delivered the least generic result over ${c.L}, ${c.score}.`}]},
  {re:/bikini|goober|sponge/i,e:[
    {h:"Sweet Victory",d:c=>`Straight out of the Bubble Bowl — the Goobers nose-fluted ${c.L} ${c.score}.`},
    {h:"Krabby Patty Formula",d:c=>`Secret recipe intact, the Goobers fry-cooked ${c.L} ${c.score}.`},
    {h:"I'm Ready!",d:c=>`The Goobers reported for duty and mopped the floor with ${c.L}, ${c.score}.`}]},
  {re:/bismuth/i,e:[
    {h:"Heavy Metal",d:c=>`Bismuth hardened under pressure and crystallized ${c.L} into an L, ${c.score}.`},
    {h:"Element of Surprise",d:c=>`Atomic number 83, loss number that stings for ${c.L} — Bismuth wins ${c.score}.`},
    {h:"Periodic Beatdown",d:c=>`Bismuth ran the table like a chem final, ${c.score} past ${c.L}.`}]},
  {re:/florida/i,e:[
    {h:"Florida Man Strikes Again",d:c=>`Local man does something inexplicable, wins anyway — over ${c.L}, ${c.score}.`},
    {h:"Sunshine State of Mind",d:c=>`Florida Man dunked ${c.L} in a ${c.score} bath of chaos.`},
    {h:"Man Bites Dog",d:c=>`The headline writes itself: Florida Man devoured ${c.L}, ${c.score}.`}]},
  {re:/silly\s*willy|wonka/i,e:[
    {h:"Golden Ticket",d:c=>`Pure imagination, zero mercy — silly willy toured past ${c.L}, ${c.score}.`},
    {h:"Willy Nilly",d:c=>`No plan, all payoff — silly willy stumbled into a ${c.score} win over ${c.L}.`},
    {h:"Everlasting Gobstopper",d:c=>`silly willy's lineup just kept scoring, ${c.score} over ${c.L}.`}]},
  {re:/lebron/i,e:[
    {h:"Not 1, Not 2…",d:c=>`Lebron's 3rd Leg kept counting rings and stepped over ${c.L}, ${c.score}.`},
    {h:"The Third Leg Stands",d:c=>`When it mattered, the extra leg held — past ${c.L} ${c.score}.`},
    {h:"Taking Talents South",d:c=>`Lebron's 3rd Leg took its talents straight to the win column, ${c.score} over ${c.L}.`}]},
  {re:/tingl/i,e:[
    {h:"Spidey Senses",d:c=>`The Tinglers felt it coming and swung past ${c.L}, ${c.score}.`},
    {h:"The Tingle Is Real",d:c=>`A full-body chill for ${c.L} as the Tinglers won ${c.score}.`},
    {h:"Sends Shivers",d:c=>`The Tinglers sent ${c.L} home shaking, ${c.score}.`}]},
  {re:/miner/i,e:[
    {h:"Struck Gold",d:c=>`The Miners dug up a ${c.score} win and buried ${c.L}.`},
    {h:"Money in the Mine",d:c=>`Diamond hands, diamond win — Midwest Miners over ${c.L}, ${c.score}.`},
    {h:"Pickaxe to the Chin",d:c=>`The Miners chipped ${c.L} down to a ${c.score} loss.`}]},
  {re:/marathon/i,e:[
    {h:"Went the Distance",d:c=>`26.2 miles of misery for ${c.L} — Marathon Men win ${c.score}.`},
    {h:"Second Wind",d:c=>`Marathon Men found another gear and ran down ${c.L}, ${c.score}.`},
    {h:"Broke the Tape",d:c=>`${c.L} hit the wall; Marathon Men breezed through the finish, ${c.score}.`}]},
  {re:/wiggl/i,e:[
    {h:"Wiggle Room",d:c=>`Just enough wiggle to slip past ${c.L}, ${c.score}.`},
    {h:"The Worm Turns",d:c=>`West Coast Wigglers wriggled free and left ${c.L} in a ${c.score} knot.`},
    {h:"West Coast, Best Coast",d:c=>`The Wigglers squirmed to a ${c.score} win over ${c.L}.`}]},
  {re:/whittingham|beatjimmy|jimmy/i,e:[
    {h:"Utah Man, Sir",d:c=>`Whittingham Sports coached up a grinding ${c.score} win over ${c.L}.`},
    {h:"Sports. Sports. Sports.",d:c=>`Whittingham Sports simply did sports better than ${c.L}, ${c.score}.`},
    {h:"Corporate Takeover",d:c=>`The blandest brand in the league acquired a ${c.score} W against ${c.L}.`}]},
  {re:/motor\s*city|mulligan/i,e:[
    {h:"Mom's Spaghetti",d:c=>`Palms sweaty, knees weak — the Mulligans seized their shot at ${c.L}, ${c.score}.`},
    {h:"No Do-Overs Needed",d:c=>`No mulligan required as Motor City striped ${c.L} ${c.score}.`},
    {h:"Motor City Madness",d:c=>`Detroit muscle overpowered ${c.L}, ${c.score}.`}]},
  /* legacy names (older seasons) */
  {re:/skol|gabe davis/i,e:[{h:"SKOL Clap",d:c=>`SKOL chant all the way to a ${c.score} win over ${c.L}.`}]},
  {re:/kirkland/i,e:[{h:"Bulk Discount",d:c=>`Kirkland Signature bought a ${c.score} win in bulk over ${c.L}.`}]},
  {re:/naber/i,e:[{h:"Beautiful Day",d:c=>`A beautiful day in the neighborhood — Nabers over ${c.L}, ${c.score}.`}]},
  {re:/wan.?dalicious/i,e:[{h:"D-E-L-I-C-I-O-U-S",d:c=>`Wan'dalicious spelled out a tasty ${c.score} win over ${c.L}.`}]},
  {re:/justins?\s*jets/i,e:[{h:"Wheels Up",d:c=>`Justins Jets cleared for takeoff, ${c.score} over ${c.L}.`}]},
  {re:/who gibbs/i,e:[{h:"Gibbs a Damn",d:c=>`Turns out they did give one — a ${c.score} win over ${c.L}.`}]},
];

function generateHeadline(home,away,hPts,aPts,week){
  const winner=hPts>=aPts?home:away, loser=hPts>=aPts?away:home;
  const winPts=Math.max(hPts,aPts), losePts=Math.min(hPts,aPts);
  const diff=Math.abs(hPts-aPts);
  const topW=topStarter(week,winner.id);
  const c={W:winner.name,L:loser.name,score:`${winPts.toFixed(1)}–${losePts.toFixed(1)}`,winPts,losePts,diff,topW};
  const pool=[];
  const pack=TEAM_PUNS.find(p=>p.re.test(winner.name));
  if(pack) pack.e.forEach(e=>pool.push({h:e.h,d:e.d(c)}));
  // a standout-player reference (still tied to who's in the matchup)
  if(topW&&topW.pts>=30){
    const last=String(topW.n).split(' ').slice(-1)[0];
    pool.push({h:`The ${last} Show`,d:`${topW.n} erupted for ${topW.pts.toFixed(1)} to drag ${winner.name} past ${loser.name}, ${c.score}.`});
  }
  if(!pool.length){
    const w1=winner.name.replace(/^the\s+/i,'').split(' ').slice(0,2).join(' ');
    pool.push({h:`${w1} Handle It`,d:`${winner.name} took care of ${loser.name}, ${c.score}.`});
  }
  const seed=hashStr(`${home.id}|${away.id}|${week}|${winPts.toFixed(1)}`);
  return pool[seed%pool.length];
}
let _hlGames=[],_hlIdx=0,_hlTimer=null;
function hlPaint(){
  const card=document.getElementById('hl-card'); if(!card||!_hlGames.length) return;
  const teamMap=Object.fromEntries(_teams.map(t=>[t.id,t]));
  const mu=_hlGames[_hlIdx%_hlGames.length];
  const home={...teamMap[mu.home.teamId]||{name:'Home',wins:0,losses:0,pf:0},id:mu.home.teamId};
  const away={...teamMap[mu.away.teamId]||{name:'Away',wins:0,losses:0,pf:0},id:mu.away.teamId};
  const hPts=mu.home.totalPoints||0,aPts=mu.away.totalPoints||0;
  const hWin=hPts>aPts,aWin=aPts>hPts;
  const hl=generateHeadline(home,away,hPts,aPts,_currentWeek);
  card.innerHTML=`
    <div class="hl-headline">${hl.h}</div>
    <div class="hl-desc">${hl.d}</div>
    <div class="headline-matchup" style="margin-top:12px">
      <div class="headline-team-block">${logoImg(home.id,'team-logo-sm')}<span class="headline-team-name">${home.name}</span></div>
      <div class="headline-vs">vs</div>
      <div class="headline-team-block away">${logoImg(away.id,'team-logo-sm')}<span class="headline-team-name">${away.name}</span></div>
    </div>
    <div class="headline-score">
      <div class="headline-pts ${hWin?'winner':aPts>0?'loser':''}">${hPts.toFixed(1)}</div>
      <div class="headline-pts ${aWin?'winner':hPts>0?'loser':''}">${aPts.toFixed(1)}</div>
    </div>`;
  const idx=_hlIdx%_hlGames.length;
  document.querySelectorAll('#home-headlines .hl-tab').forEach((d,i)=>d.classList.toggle('active',i===idx));
}
function hlGoto(i){_hlIdx=i;hlPaint();if(_hlTimer){clearInterval(_hlTimer);_hlTimer=setInterval(hlNext,7000);}}
function hlNext(){_hlIdx=(_hlIdx+1)%(_hlGames.length||1);hlPaint();}
function renderHomeHeadlines(){
  const wrap=document.getElementById('home-headlines'); if(!wrap) return;
  _hlGames=_allMatchups.filter(mu=>mu.matchupPeriodId===_currentWeek&&mu.home&&mu.away&&((mu.home.totalPoints||0)>0||(mu.away.totalPoints||0)>0));
  if(!_hlGames.length){wrap.innerHTML=`<div class="tab-loading" style="padding:30px">No games played yet in ${getSeason()}.</div>`;return;}
  _hlIdx=0;
  const teamMap=Object.fromEntries(_teams.map(t=>[t.id,t]));
  wrap.innerHTML=`<div class="hl-tabs">${_hlGames.map((mu,i)=>{
      const hn=(teamMap[mu.home.teamId]?.abbrev||'')||'?', an=(teamMap[mu.away.teamId]?.abbrev||'')||'?';
      return `<button class="hl-tab" onclick="hlGoto(${i})" title="${teamMap[mu.home.teamId]?.name||''} vs ${teamMap[mu.away.teamId]?.name||''}">${logoImg(mu.home.teamId,'team-logo-sm')}<span class="hl-tab-x">/</span>${logoImg(mu.away.teamId,'team-logo-sm')}</button>`;
    }).join('')}</div>
    <div class="hl-card headline-card" id="hl-card"></div>`;
  hlPaint();
  if(_hlTimer)clearInterval(_hlTimer);
  _hlTimer=setInterval(hlNext,7000);
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
function setStatsView(v){
  _statsView=v;
  document.querySelectorAll('#stats-subtabs .tab-btn').forEach(b=>b.classList.toggle('active',b.dataset.view===v));
  const st=document.getElementById('stats-standings'),c2=document.getElementById('stats-c2'),c3=document.getElementById('stats-c3');
  if(st)st.style.display=v==='standings'?'':'none';
  if(c2)c2.style.display=v==='c2'?'':'none';
  if(c3)c3.style.display=v==='c3'?'':'none';
  if(v==='c2') renderC2Breakdown();
  if(v==='c3') renderC3Breakdown();
}
function cmSourceNote(){
  if(_cmMode==='none') return 'No coaching-metric data for this season.';
  if(_cmMode==='official') return 'Headline scores for this season are the official commissioner values; the breakdown below is computed from weekly rosters to show the inputs.';
  if(_cmMode==='inferred') return 'Reconstructed from weekly rosters (ESPN deleted this season\'s transaction log).';
  return 'Computed live from the ESPN transaction log.';
}
function renderC2Breakdown(){
  const el=document.getElementById('stats-c2'); if(!el) return;
  if(_cmMode==='none'){el.innerHTML=`<div class="tab-loading">No trade data for this season.</div>`;return;}
  const rows=[..._teams].map(t=>({t,bd:_cmBreakdown[t.id]||{}})).filter(x=>x.bd.detail)
    .sort((a,b)=>(b.bd.c2||0)-(a.bd.c2||0));
  if(!rows.length){el.innerHTML=`<div class="tab-loading">No trades found for this season.</div>`;return;}
  el.innerHTML=`<div style="font-size:12px;color:var(--text3);margin:0 2px 12px;line-height:1.6">${cmSourceNote()}<br><b>C2 = Σ(points scored by players received after each trade − points scored by players sent) ÷ 10.</b> Points count from the week after the trade onward.</div>`+
  rows.map(({t,bd})=>{
    const d=bd.detail||{};
    const recv=(d.tradesReceived||[]);
    const sent=(d.tradesSent||[]);
    const gained=recv.reduce((s,r)=>s+r.pts,0), lost=sent.reduce((s,r)=>s+r.pts,0);
    const line=(r,sign,col)=>`<div class="brk-row"><span class="brk-p">${pName(r.pid)} <span class="brk-wk">wk ${r.week+1}+</span></span><span style="color:${col};font-weight:600">${sign}${r.pts.toFixed(1)}</span></div>`;
    return `<div class="hist-item">
      <div class="brk-head"><span class="fr-name">${logoImg(t.id)} ${t.name}</span><span class="brk-val" style="color:${cc(bd.c2)}">C2 ${bd.c2>=0?'+':''}${(bd.c2||0).toFixed(2)}</span></div>
      ${(recv.length||sent.length)?`<div class="brk-cols">
        <div><div class="brk-col-h" style="color:var(--green)">Received (+${gained.toFixed(1)})</div>${recv.length?recv.map(r=>line(r,'+','var(--green)')).join(''):'<div class="brk-empty">none</div>'}</div>
        <div><div class="brk-col-h" style="color:var(--red)">Sent (−${lost.toFixed(1)})</div>${sent.length?sent.map(r=>line(r,'−','var(--red)')).join(''):'<div class="brk-empty">none</div>'}</div>
      </div>
      <div class="brk-formula">(${gained.toFixed(1)} − ${lost.toFixed(1)}) ÷ 10 = <b style="color:${cc(bd.c2)}">${(bd.c2||0).toFixed(2)}</b></div>`
      :'<div class="brk-empty">No trades this season.</div>'}
    </div>`;
  }).join('');
}
function renderC3Breakdown(){
  const el=document.getElementById('stats-c3'); if(!el) return;
  if(_cmMode==='none'){el.innerHTML=`<div class="tab-loading">No waiver data for this season.</div>`;return;}
  // default the team selector to Lebron's 3rd Leg (or first team)
  if(_c3Team==null||!_teams.some(t=>t.id===Number(_c3Team))){
    const leb=_teams.find(t=>/lebron/i.test(t.name));
    _c3Team=String((leb||_teams[0])?.id||'');
  }
  const opts=_teams.map(t=>`<option value="${t.id}" ${Number(_c3Team)===t.id?'selected':''}>${t.name}</option>`).join('');
  const t=_teams.find(x=>x.id===Number(_c3Team));
  const bd=_cmBreakdown[t?.id]||{};
  const d=bd.detail||{};
  const picks=(d.waiverPickups||[]).slice().sort((a,b)=>b.pts/Math.max(b.margin??b.bid,1)-a.pts/Math.max(a.margin??a.bid,1));
  el.innerHTML=`
    <div style="font-size:12px;color:var(--text3);margin:0 2px 12px;line-height:1.6">${cmSourceNote()}<br><b>C3 = Σ(lineup points a pickup scored ÷ bid margin) ÷ 10</b>, where bid margin = winning FAAB bid − next-highest bid (full bid when uncontested). Bids are estimated for reconstructed seasons.</div>
    <div class="picker-bar" style="padding:0 2px 14px">
      <label for="c3-team-select" style="font-size:13px;color:var(--text3)">Team:</label>
      <select id="c3-team-select" onchange="_c3Team=this.value;renderC3Breakdown()">${opts}</select>
    </div>
    ${t?`<div class="hist-item">
      <div class="brk-head"><span class="fr-name">${logoImg(t.id)} ${t.name}</span><span class="brk-val" style="color:${cc(bd.c3)}">C3 ${bd.c3>=0?'+':''}${(bd.c3||0).toFixed(2)}</span></div>
      ${picks.length?`<div class="tscroll"><table class="min560 srt" style="margin-top:4px">
        <thead><tr><th>Pickup</th><th class="right">Wk</th><th class="right">Bid</th><th class="right">Next</th><th class="right">Margin</th><th class="right">Lineup pts</th><th class="right">Ratio</th></tr></thead>
        <tbody>${picks.map(w=>{const mar=Math.max(w.margin??w.bid,1);return `<tr>
          <td><span class="pname">${playerImg(w.pid,20,pName(w.pid))}<span>${pName(w.pid)}</span>${w.est?'<span style="color:var(--text3);font-size:12px"> est.</span>':''}</span></td>
          <td class="right">${w.week}</td>
          <td class="right">$${w.bid}</td>
          <td class="right" style="color:var(--text3)">${w.next?('$'+w.next):'—'}</td>
          <td class="right">$${mar}</td>
          <td class="right pf">${w.pts.toFixed(1)}</td>
          <td class="right" style="font-weight:600">${(w.pts/mar).toFixed(2)}x</td>
        </tr>`;}).join('')}</tbody>
      </table></div>`:'<div class="brk-empty">No waiver pickups for this team this season.</div>'}
    </div>`:''}`;
}
function renderStandingsTable(){
  const teams=[..._teams];
  const atCache={};
  _teams.forEach(t=>{const o=_ownerMap[t.id]; const at=o?franchiseAllTime(o):null; atCache[t.id]=at||{pf:0,pa:0,seasons:0};});
  const atOf=t=>atCache[t.id]||{pf:0,pa:0,seasons:0};
  const pfy=t=>{const a=atOf(t);return a.playedSeasons?a.pf/a.playedSeasons:0;};
  const pay=t=>{const a=atOf(t);return a.playedSeasons?a.pa/a.playedSeasons:0;};
  teams.sort((a,b)=>{
    let va,vb;
    if(_sortCol==='rank'){va=a.wins/((a.wins+a.losses+a.ties)||1)+a.pf/1e7;vb=b.wins/((b.wins+b.losses+b.ties)||1)+b.pf/1e7;}
    else if(_sortCol==='pf'){va=a.pf;vb=b.pf;}
    else if(_sortCol==='pa'){va=a.pa;vb=b.pa;}
    else if(_sortCol==='wins'){va=a.wins;vb=b.wins;}
    else if(_sortCol==='moves'){va=a.moves;vb=b.moves;}
    else if(_sortCol==='trades'){va=a.trades;vb=b.trades;}
    else if(_sortCol==='cm'){va=_scores[a.id]||0;vb=_scores[b.id]||0;}
    else if(_sortCol==='atpf'){va=atOf(a).pf;vb=atOf(b).pf;}
    else if(_sortCol==='atpa'){va=atOf(a).pa;vb=atOf(b).pa;}
    else if(_sortCol==='pfy'){va=pfy(a);vb=pfy(b);}
    else if(_sortCol==='pay'){va=pay(a);vb=pay(b);}
    else return 0;
    return _sortAsc?va-vb:vb-va;
  });
  function arr(c){return _sortCol===c?(_sortAsc?'↑':'↓'):'⇅';}
  function th(col,label,right=true){return`<th class="${right?'right':''} ${_sortCol===col?'sorted':''}" onclick="sortStandings('${col}')">${label} <span style="font-size:12px;opacity:0.6">${arr(col)}</span></th>`;}
  const thead=document.getElementById('standings-thead');
  const tbody=document.getElementById('standings-tbody');
  if(!thead||!tbody)return;
  thead.innerHTML=`<tr>
    <th class="${_sortCol==='rank'?'sorted':''}" onclick="sortStandings('rank')"># <span style="font-size:12px;opacity:0.6">${arr('rank')}</span></th>
    <th>Team</th>${th('wins','W')}
    <th class="right">L</th>${th('pf','PF')}${th('pa','PA')}${th('moves','Moves')}${th('trades','Trades')}${th('cm','CM')}${th('atpf','AT PF')}${th('atpa','AT PA')}${th('pfy','PF/Yr')}${th('pay','PA/Yr')}
  </tr>`;
  tbody.innerHTML=teams.map((t,i)=>{
    const s=_scores[t.id]||0;
    return`<tr>
      <td><span class="rank">${i===0&&_sortCol==='rank'?'🥇':i+1}</span></td>
      <td><div class="team-cell">${logoImg(t.id)}<div class="team-info"><div class="team-name tlink" data-tid="${t.id}">${t.name}</div><div class="team-sub">${t.abbrev}</div></div></div></td>
      <td class="right"><strong>${t.wins}</strong></td>
      <td class="right" style="color:var(--text3)">${t.losses}</td>
      <td class="right pf">${t.pf.toFixed(1)}</td>
      <td class="right pa">${t.pa.toFixed(1)}</td>
      <td class="right">${t.moves}</td>
      <td class="right">${t.trades}</td>
      <td class="right" style="color:${_cmMode==='none'?'var(--text3)':sc(s)};font-weight:600">${_cmMode==='none'?'—':s.toFixed(2)}</td>
      <td class="right pf">${atOf(t).pf?atOf(t).pf.toFixed(0):'—'}</td>
      <td class="right pa">${atOf(t).pa?atOf(t).pa.toFixed(0):'—'}</td>
      <td class="right" style="color:var(--text2)">${atOf(t).playedSeasons?pfy(t).toFixed(0):'—'}</td>
      <td class="right" style="color:var(--text2)">${atOf(t).playedSeasons?pay(t).toFixed(0):'—'}</td>
    </tr>`;
  }).join('');
}

// ── MATCHUP HISTORY TAB ────────────────────────────────────────────────────────
let _topScorers={},_topScorersLoaded=false,_topScorersPromise=null;
async function loadHistoryScorers(){
  if(_topScorersLoaded) return;
  if(_topScorersPromise) return _topScorersPromise;
  _topScorersPromise=(async()=>{
    await Promise.all(ALL_SEASONS.map(async s=>{
      const d=await histJSON('topscorers',s,`${BASE}?type=topscorers&seasonId=${s}&v=1`);
      if(d&&d.teams) _topScorers[s]=d.teams;
    }));
    _topScorersLoaded=true;
  })();
  return _topScorersPromise;
}
function topScorer(season,teamId,week){ return (_topScorers[season]&&_topScorers[season][teamId]&&_topScorers[season][teamId][week])||null; }
function h2hGames(ownerA,ownerB){
  const out=[];
  ALL_SEASONS.forEach(s=>{
    const meta=_seasonMeta[s]; if(!meta) return; const owners=meta.owners||{};
    (meta.schedule||[]).forEach(mu=>{
      if(!mu.home||!mu.away) return;
      const ho=owners[mu.home.teamId], ao=owners[mu.away.teamId];
      const hp=mu.home.totalPoints||0, ap=mu.away.totalPoints||0; if(hp===0&&ap===0) return;
      let mine,opp;
      if(ho===ownerA&&ao===ownerB){mine=mu.home;opp=mu.away;}
      else if(ho===ownerB&&ao===ownerA){mine=mu.away;opp=mu.home;}
      else return;
      out.push({season:s,week:mu.matchupPeriodId,myTeamId:mine.teamId,oppTeamId:opp.teamId,myScore:mine.totalPoints||0,oppScore:opp.totalPoints||0});
    });
  });
  return out.sort((x,y)=>(y.season-x.season)||(y.week-x.week));
}
function toggleH2H(i){ const el=document.getElementById('h2hd-'+i); if(el) el.style.display=el.style.display==='none'?'':'none'; }
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
        <div class="h2h-total-rec">${tw}–${tl}${tt?`–${tt}`:''} <span style="font-size:12px;color:${tpct>=0.5?'var(--green)':'var(--red)'}">(${(tpct*100).toFixed(1)}%)</span></div>
        <div class="h2h-total-sub">${me?.name||''} · all-time vs the league · ${tg} games · ${tpf.toFixed(1)} PF / ${tpa.toFixed(1)} PA</div>
      </div>
    </div>
    ${rows.length?`<div style="font-size:12px;color:var(--text3);margin:0 2px 8px">Tap a team to see every head-to-head game.</div><div class="tscroll"><table class="min560">
      <thead><tr><th>Opponent</th><th class="right">W</th><th class="right">L</th>${tt?'<th class="right">T</th>':''}<th class="right">Win %</th><th class="right">PF</th><th class="right">PA</th></tr></thead>
      <tbody>${rows.map((r,i)=>{const cols=tt?7:6;const games=h2hGames(owner,r.opp.owner);
        const log=games.map(g=>{const win=g.myScore>g.oppScore;const ts=topScorer(g.season,g.myTeamId,g.week),to=topScorer(g.season,g.oppTeamId,g.week);
          return `<div class="h2h-game">
            <span class="h2h-game-yr">${g.season} · Wk ${g.week}</span>
            <span class="h2h-game-side ${win?'w':'l'}"><span class="hs-team">${me?.name||''}</span> <b>${g.myScore.toFixed(1)}</b>${ts?`<span class="h2h-hs">${ts.n} · ${ts.pts}</span>`:''}</span>
            <span class="h2h-vs">${win?'def.':'lost to'}</span>
            <span class="h2h-game-side"><span class="hs-team">${r.opp.name}</span> <b>${g.oppScore.toFixed(1)}</b>${to?`<span class="h2h-hs">${to.n} · ${to.pts}</span>`:''}</span>
          </div>`;}).join('');
        return `<tr class="h2h-oppo" onclick="toggleH2H(${i})">
          <td><div class="team-cell">${franchiseAvatar(r.opp,28,8)}<div class="team-info"><div class="team-name">${r.opp.name}</div><div class="team-sub">${r.g} game${r.g!==1?'s':''}</div></div><i class="fa fa-chevron-down h2h-caret"></i></div></td>
          <td class="right" style="color:var(--green);font-weight:700">${r.w}</td>
          <td class="right" style="color:var(--red)">${r.l}</td>
          ${tt?`<td class="right" style="color:var(--text3)">${r.t}</td>`:''}
          <td class="right"><span style="font-weight:600;color:${r.pct>=0.5?'var(--green)':'var(--red)'}">${(r.pct*100).toFixed(0)}%</span> <span class="winpct-bar"><span class="winpct-fill" style="width:${(r.pct*100).toFixed(0)}%;background:${r.pct>=0.5?'var(--green)':'var(--red)'};display:block"></span></span></td>
          <td class="right pf">${r.pf.toFixed(1)}</td>
          <td class="right pa">${r.pa.toFixed(1)}</td>
        </tr>
        <tr class="h2h-detail" id="h2hd-${i}" style="display:none"><td colspan="${cols}"><div class="h2h-log">${log||'<div style="color:var(--text3);padding:8px">No game detail available.</div>'}</div></td></tr>`;}).join('')}</tbody>
    </table></div>`:`<div class="tab-loading">No games found for this team.</div>`}`;
}

// ── PLAYER TENURE TAB ──────────────────────────────────────────────────────────
let _tenurePromise=null;
async function loadTenureData(){
  if(_tenure) return _tenure;
  if(_tenurePromise) return _tenurePromise;
  _tenurePromise=(async()=>{
    const results=await Promise.allSettled(ALL_SEASONS.map(async s=>{
      const d=await histJSON('tenure',s,`${BASE}?type=seasontenure&seasonId=${s}&v=8`);
      if(!d) return null;
      return {s, d};
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
          const p=bucket[pid]||(bucket[pid]={n:rec.n,pos:rec.pos,wAll:0,sAll:0,pAll:0,spAll:0,pwAll:0,seasons:{}});
          if(rec.n) p.n=rec.n;
          if(p.pos==null) p.pos=rec.pos;
          p.wAll+=rec.w||0; p.sAll+=rec.s||0; p.pAll+=rec.p||0; p.spAll+=rec.sp||0; p.pwAll+=rec.pw||0;
          p.seasons[s]={w:rec.w||0,s:rec.s||0,p:rec.p||0,sp:rec.sp||0,pw:rec.pw||0};
        });
      });
    });
    _tenure=tenure;
    return _tenure;
  })();
  return _tenurePromise;
}
async function ensureTenure(){
  if(_tenure){renderTenureTable();return;}
  const body=document.getElementById('tenure-body');
  if(body) body.innerHTML=`<div class="tab-loading"><i class="fa fa-circle-notch"></i>Crunching every roster from every week of every season…<br><span style="font-size:12px;color:var(--text3)">first load takes a moment — it's cached after that</span></div>`;
  try{ await loadTenureData(); }
  catch(e){ if(body) body.innerHTML=`<div class="tab-loading" style="color:var(--red)">Failed to load roster history: ${e.message}</div>`; return; }
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
    wAll:p.wAll, sAll:p.sAll, pAll:p.pAll, pwAll:p.pwAll||0,
    wYr:p.seasons[yr]?.w||0, sYr:p.seasons[yr]?.s||0, pYr:p.seasons[yr]?.p||0,
  }))
  .filter(p=>!q||p.n.toLowerCase().includes(q))
  .sort((a,b)=>b.wAll-a.wAll||b.pAll-a.pAll);

  const dash='<span style="color:var(--text3)">—</span>';
  const shown=players.slice(0,50);
  body.innerHTML=shown.length?`<div class="tscroll"><table class="min640 srt">
    <thead>
      <tr>
        <th>Player</th>
        <th class="right" title="Weeks in the starting lineup">Started ${yr}</th>
        <th class="right" title="Weeks on the roster (starter or bench)">Rostered ${yr}</th>
        <th class="right">Pts ${yr}</th>
        <th class="right" title="Weeks in the starting lineup">Started all-time</th>
        <th class="right" title="Weeks on the roster (starter or bench)">Rostered all-time</th>
        <th class="right">Pts all-time</th>
        <th class="right" title="Playoff games won while started for this team">Playoff W</th>
      </tr>
    </thead>
    <tbody>${shown.map((p,i)=>`
      <tr>
        <td><span class="pname"><span class="rank" style="margin-right:4px">${i+1}</span>${playerImg(p.pid,22,p.n)}<span class="fr-name">${p.n}</span></span></td>
        <td class="right"><strong>${p.sYr||dash}</strong></td>
        <td class="right" style="color:var(--text2)">${p.wYr||dash}</td>
        <td class="right" style="color:var(--text2)">${p.wYr?p.pYr.toFixed(1):dash}</td>
        <td class="right"><strong>${p.sAll}</strong></td>
        <td class="right" style="color:var(--text2)">${p.wAll}</td>
        <td class="right pf">${p.pAll.toFixed(1)}</td>
        <td class="right" style="color:var(--accent);font-weight:600">${p.pwAll||dash}</td>
      </tr>`).join('')}</tbody>
  </table></div>${players.length>50?`<div style="padding:12px 2px;font-size:12px;color:var(--text3)">Showing top 50 of ${players.length} — use search to find others.</div>`:''}
  <div style="padding:4px 2px 16px;font-size:12px;color:var(--text3)"><b>Started</b> = weeks in the active lineup · <b>Rostered</b> = weeks on the roster (starter or bench). Bye weeks and weeks a player was on IR or ruled out are not counted.</div>`
  :`<div class="tab-loading">No players found${q?` matching “${q}”`:''}.</div>`;
}

// ── TRADES TAB ─────────────────────────────────────────────────────────────────
function ptsFromWeek(pid,startWeek){
  let t=0;
  for(const w in _weeklyData){const wn=Number(w);if(wn>=startWeek)t+=_weeklyData[wn]?.[pid]?.pts??0;}
  return t;
}
async function fetchSeasonTrades(season){
  if(_tradeCache[season]) return _tradeCache[season];
  try{
    const d=(await histJSON('trades',season,`${BASE}?type=seasontrades&seasonId=${season}&v=3`))||{trades:[],source:'error'};
    _tradeCache[season]={trades:d.trades||[],source:d.source||'reconstructed'};
  }catch{_tradeCache[season]={trades:[],source:'error'};}
  return _tradeCache[season];
}
function setTradeSort(mode,btn){
  _tradeSort=mode;
  document.querySelectorAll('#trade-sort .filter-btn').forEach(b=>b.classList.remove('active'));
  if(btn)btn.classList.add('active');
  renderTradesTab();
}
function setTradeTeam(owner){_tradeTeamFilter=owner;renderTradesTab();}
function setTradeScope(scope,btn){
  _tradeScope=scope;
  document.querySelectorAll('#trade-scope .filter-btn').forEach(b=>b.classList.remove('active'));
  if(btn)btn.classList.add('active');
  renderTradesTab();
}
// franchise (owner) resolution so all-time trades label correctly across renames
function tradeTeamName(season,teamId){
  const meta=_seasonMeta[season];
  const o=meta?.owners?.[teamId];
  if(o){const fr=_franchises.find(f=>f.owner===o); if(fr) return fr.name.trim();
    const nm=meta.names?.[o]?.name; if(nm) return nm.trim();}
  return (_teams.find(t=>t.id===teamId)?.name||`Team ${teamId}`).trim();
}
function tradeTeamAvatar(season,teamId){
  const meta=_seasonMeta[season];
  const o=meta?.owners?.[teamId];
  if(o){const fr=_franchises.find(f=>f.owner===o)||{name:meta.names?.[o]?.name,logo:meta.names?.[o]?.logo,teamId};
    return franchiseAvatar(fr,28,8);}
  return logoImg(teamId);
}
async function renderTradesTab(){
  const body=document.getElementById('trades-body'); if(!body) return;
  const scopeSeasons = _tradeScope==='alltime' ? ALL_SEASONS.filter(s=>_seasonMeta[s]) : [getSeason()];

  body.dataset.loading='1';
  if(_tradeScope==='alltime'&&scopeSeasons.some(s=>!_tradeCache[s])){
    body.innerHTML=`<div class="tab-loading"><i class="fa fa-circle-notch"></i>Gathering trades from every season…</div>`;
  }
  const results=await Promise.all(scopeSeasons.map(async s=>({season:s,...(await fetchSeasonTrades(s))})));

  // flatten into display list
  let list=[];
  results.forEach(({season,trades,source})=>{
    (trades||[]).forEach(tr=>{
      if((tr.teams||[]).length<2) return;
      const a=tr.teams[0],b=tr.teams[1];
      const _tA=Math.max(a.total,0),_tB=Math.max(b.total,0);
      const share=(_tA+_tB)>0?Math.max(a.total,b.total)/(_tA+_tB):0.5;
      list.push({season,source,week:tr.week,a,b,margin:Math.abs(a.total-b.total),share});
    });
  });
  // optional team filter (by franchise owner, works across seasons)
  if(_tradeTeamFilter){
    list=list.filter(tr=>{
      const oa=_seasonMeta[tr.season]?.owners?.[tr.a.teamId], ob=_seasonMeta[tr.season]?.owners?.[tr.b.teamId];
      return oa===_tradeTeamFilter||ob===_tradeTeamFilter;
    });
  }
  if(!list.length){body.innerHTML=`<div class="tab-loading">No trades found${_tradeTeamFilter?' for this team':''}${_tradeScope==='alltime'?'':` in the ${getSeason()} season`}.</div>`;return;}

  if(_tradeSort==='balanced') list.sort((x,y)=>Math.abs(x.share-0.5)-Math.abs(y.share-0.5));
  else if(_tradeSort==='week') list.sort((x,y)=>(y.season-x.season)||(x.week-y.week));
  else list.sort((x,y)=>y.share-x.share);

  // colors keyed by franchise owner so they stay consistent across seasons
  const colorKeys={};
  list.forEach(t=>{[[t.season,t.a.teamId],[t.season,t.b.teamId]].forEach(([s,id])=>{
    const o=_seasonMeta[s]?.owners?.[id]||`t${id}`; colorKeys[o]=id;
  });});
  const colors={};
  await Promise.all(Object.entries(colorKeys).map(async ([o,id])=>{colors[o]=readableColor(await logoMainColor(id));}));
  const colOf=(s,id)=>colors[_seasonMeta[s]?.owners?.[id]||`t${id}`]||'var(--accent)';

  const reconstructedAny=results.some(r=>r.source!=='log');
  body.innerHTML=list.map((tr,i)=>{
    const totA=Math.max(tr.a.total,0),totB=Math.max(tr.b.total,0);
    const aWin=tr.a.total>=tr.b.total;
    const winner=aWin?tr.a:tr.b, loser=aWin?tr.b:tr.a;
    const wShare=(totA+totB)>0?Math.max(tr.a.total,tr.b.total)/(totA+totB):0.5;
    const wPct=Math.min(0.96,Math.max(0.04,wShare));
    const cW=colOf(tr.season,winner.teamId), cL=colOf(tr.season,loser.teamId);
    const side=(sd,state)=>{
      const col=state==='won'?'var(--green)':'var(--red)';
      return `
      <div class="trade-side ${state}">
        <div class="trade-team">${tradeTeamAvatar(tr.season,sd.teamId)}<div class="trade-team-name">${tradeTeamName(tr.season,sd.teamId)}</div></div>
        <div class="trade-wl" style="border-color:${col}">
          <div class="trade-wl-tag" style="color:${col}">${state==='won'?'WON':'LOST'}</div>
          <div class="trade-recv">received</div>
          ${sd.players.length?sd.players.map(p=>`<div class="trade-player"><span class="tp-name pname">${playerImg(p.pid,18,p.n)}<span>${p.n}</span></span><span class="tp-dots"></span><span class="tp-pts" style="color:${state==='lost'?'var(--red)':(p.pts>=0?'var(--green)':'var(--red)')}">${p.pts.toFixed(1)}</span></div>`).join(''):`<div class="trade-player"><span class="tp-name" style="color:var(--text3);font-style:italic">nothing received</span></div>`}
        </div>
      </div>`;};
    const seasonBadge=_tradeScope==='alltime'?`<span class="badge-info" style="margin-left:0">${tr.season}</span>`:'';
    return`<div class="trade-card">
      <div class="trade-head">${seasonBadge}Week ${tr.week} trade</div>
      <div class="trade-grid">${side(winner,'won')}<div class="trade-vs"><i class="fa fa-right-left"></i></div>${side(loser,'lost')}</div>
      <div class="trade-totals"><span style="color:${cW}">${winner.total.toFixed(1)} pts</span><span style="color:${cL}">${loser.total.toFixed(1)} pts</span></div>
      <div class="trade-bar"><span style="width:${(wPct*100).toFixed(1)}%;background:${cW}"></span><span style="flex:1;background:${cL}"></span></div>
      <div class="trade-bar-labels"><span style="color:${cW};font-weight:700">${(wShare*100).toFixed(0)}% of post-trade points</span><span style="color:${cL};font-weight:700">${(100-wShare*100).toFixed(0)}%</span></div>
    </div>`;
  }).join('')+`<div style="padding:0 2px 16px;font-size:12px;color:var(--text3);line-height:1.6">Each side shows the players a manager received and the points those players scored from the trade week onward — the bar splits by share of post-trade points (45–55% = fair).${reconstructedAny?' Completed seasons are <b>reconstructed from weekly rosters</b> since ESPN deletes the trade log; a few trades whose returned player was immediately dropped or was a draft pick can\'t be recovered. Seasons from 2026 on are archived live and show every trade.':''}</div>`;
  body.dataset.loading='';
}

// ── DRAFT TAB ──────────────────────────────────────────────────────────────────
async function ensureDraft(){
  const season=getSeason();
  const body=document.getElementById('draft-body'); if(!body) return;
  if(_draftCache[season]){renderDraftTab();return;}
  if(_draftLoading) return;
  _draftLoading=true;
  body.innerHTML=`<div class="tab-loading"><i class="fa fa-circle-notch"></i>Loading draft results &amp; season stats…</div>`;
  try{
    const [dr,st]=await Promise.all([
      histJSON('draft',season,`${BASE}?type=draft&seasonId=${season}&v=2`),
      histJSON('seasonstats',season,`${BASE}?type=seasonstats&seasonId=${season}&v=2`),
    ]);
    _draftCache[season]={picks:dr?.picks||[],stats:st?.players||[]};
  }catch{_draftCache[season]={picks:[],stats:[]};}
  _draftLoading=false;
  renderDraftTab();
}
function computeDraftRows(picks, stats, season){
  if(!picks||!picks.length||!stats||!stats.length) return [];
  const rankOverall={},rankPos={},posCount={},statById={};
  stats.forEach((p,i)=>{rankOverall[p.id]=i+1;posCount[p.pos]=(posCount[p.pos]||0)+1;rankPos[p.id]=posCount[p.pos];statById[p.id]=p;});
  const posDraftCount={};
  const owners=_seasonMeta[season]?.owners||{};
  return picks.slice().sort((x,y)=>x.overall-y.overall).map(pk=>{
    const s=statById[pk.playerId];
    const pos=s?.pos??null,posKey=pos??'x';
    posDraftCount[posKey]=(posDraftCount[posKey]||0)+1;
    const posDrafted=posDraftCount[posKey];
    const name=s?.n||_playerNames[pk.playerId]||`Player #${pk.playerId}`;
    const fin=rankOverall[pk.playerId]??null;
    const finPos=rankPos[pk.playerId]??null;
    const delta=finPos!=null?(posDrafted-finPos):(posDrafted-((posCount[pos]||0)+1));
    return {season,pid:pk.playerId,name,pos,posName:POS_NAMES[pos]||'—',teamId:pk.teamId,owner:owners[pk.teamId]||null,overall:pk.overall,round:pk.round,posDrafted,fin,finPos,pts:s?.pts??0,delta};
  });
}
async function loadAllDrafts(){
  if(_draftAllCache) return _draftAllCache;
  const results=await Promise.all(ALL_SEASONS.map(async s=>{
    const [dr,st]=await Promise.all([
      histJSON('draft',s,`${BASE}?type=draft&seasonId=${s}&v=2`),
      histJSON('seasonstats',s,`${BASE}?type=seasonstats&seasonId=${s}&v=2`),
    ]);
    return {s, picks:dr?.picks||[], stats:st?.players||[]};
  }));
  const rows=[], teamDrafts=[], ownerTotals={}, ownerCounts={};
  results.forEach(({s,picks,stats})=>{
    const r=computeDraftRows(picks,stats,s);
    if(!r.length) return;
    rows.push(...r);
    const totals={};
    r.forEach(x=>{ if(x.owner==null) return; totals[x.owner]=(totals[x.owner]||0)+x.delta; });
    const vals=Object.values(totals); if(!vals.length) return;
    const avg=vals.reduce((a,b)=>a+b,0)/vals.length;
    Object.entries(totals).forEach(([owner,total])=>{
      teamDrafts.push({owner,season:s,total,adj:total-avg,name:(_franchises.find(f=>f.owner===owner)?.name)||(_seasonMeta[s]?.names?.[owner]?.name)||owner});
      ownerTotals[owner]=(ownerTotals[owner]||0)+total; ownerCounts[owner]=(ownerCounts[owner]||0)+1;
    });
  });
  _draftAllCache={rows,teamDrafts,ownerTotals,ownerCounts};
  return _draftAllCache;
}
function setDraftListScope(s){ _draftListScope=(s==='alltime'?'alltime':'year'); renderDraftTab(); }
function draftRowTeam(r){
  if(r.owner) return (_franchises.find(f=>f.owner===r.owner)?.name)||(_seasonMeta[r.season]?.names?.[r.owner]?.name)||`Team ${r.teamId}`;
  return (_teams.find(t=>t.id===r.teamId)?.name)||`Team ${r.teamId}`;
}
function draftPickCard(r,i,showSeason){
  return `<div class="draft-row">
    <div class="draft-rankn">${i+1}</div>
    ${playerImg(r.pid,40,r.name)}
    <div class="draft-info">
      <div class="draft-name">${r.name}<span class="draft-pos">${r.posName}</span></div>
      <div class="draft-mgr2">${draftRowTeam(r)}${showSeason?` · ${r.season}`:''}</div>
      <div class="draft-line">Drafted <b>${r.posName}${r.posDrafted}</b>${r.finPos!=null?` → finished <b>${r.posName}${r.finPos}</b>`:' → <b>unranked</b>'} · ${r.pts.toFixed(1)} pts</div>
    </div>
    <div class="draft-delta" style="color:${r.delta>0?'var(--green)':r.delta<0?'var(--red)':'var(--text2)'}">${r.delta>0?'+':''}${r.delta}</div>
  </div>`;
}
function draftClassCard(d,i,showSeason,tint){
  const v=(d.val!=null?d.val:d.total);
  const fr=_franchises.find(f=>f.owner===d.owner);
  const graded=tint?' draft-row-graded':'';
  const bstyle=tint?` style="border-left-color:${tint}"`:'';
  const dcol=tint||(v>0?'var(--green)':v<0?'var(--red)':'var(--text2)');
  return `<div class="draft-row${graded}"${bstyle}>
    <div class="draft-rankn">${i+1}</div>
    ${fr?franchiseAvatar(fr,34):playerImg(null,34,d.name)}
    <div class="draft-info">
      <div class="draft-name">${d.name}${showSeason?`<span class="draft-pos">${d.season}</span>`:''}</div>
    </div>
    <div class="draft-delta" style="color:${dcol}">${v>0?'+':''}${Math.round(v)}</div>
  </div>`;
}
function draftPickLists(steals,busts,showSeason){
  return `<div class="two-col" style="margin:0 0 8px;gap:16px">
    <div class="card" style="box-shadow:none"><div class="section-header" style="padding:13px 16px"><i class="fa fa-gem" style="color:var(--green)"></i>Biggest Steals${showSeason?' Ever':''}<span class="badge-info">beat draft slot</span></div>${steals.map((r,i)=>draftPickCard(r,i,showSeason)).join('')}</div>
    <div class="card" style="box-shadow:none"><div class="section-header" style="padding:13px 16px"><i class="fa fa-heart-crack" style="color:var(--red)"></i>Worst Busts${showSeason?' Ever':''}<span class="badge-info">first 6 rounds</span></div>${busts.map((r,i)=>draftPickCard(r,i,showSeason)).join('')}</div>
  </div>`;
}
function scoreBadge(rel,rank,season,grade,gcol){
  const col=gcol||(rel>0?'var(--green)':rel<0?'var(--red)':'var(--text2)');
  return `<div class="draft-score-wrap">
    <div class="dgrade"><div class="dgrade-num" style="border-color:var(--accent);color:var(--accent)">${rank}</div><div class="dgrade-lbl">Draft rank &middot; ${season}</div></div>
    <div class="dgrade"><div class="dgrade-num" style="border-color:${col};color:${col}">${rel>0?'+':''}${rel.toFixed(0)}</div><div class="dgrade-lbl">Draft Score</div></div>
    ${grade?`<div class="dgrade"><div class="dgrade-num" style="border-color:${col};color:${col}">${grade}</div><div class="dgrade-lbl">Draft Grade</div></div>`:''}
  </div>`;
}
function draftTeamTableHTML(rows,showSeason){
  const totalDelta=rows.reduce((s,r)=>s+r.delta,0);
  return `<div class="tscroll"><table class="min560 srt">
    <thead><tr>${showSeason?'<th>Yr</th>':''}<th>Pick</th><th>Player</th><th class="right">Pos: drafted → finished</th><th class="right">Pts</th><th class="right">Δ</th></tr></thead>
    <tbody>${rows.map(r=>`<tr>
      ${showSeason?`<td style="color:var(--text3)">${r.season}</td>`:''}
      <td style="color:var(--text3);white-space:nowrap">Rd ${r.round} · #${r.overall}</td>
      <td><div class="team-cell">${playerImg(r.pid,26,r.name)}<span class="fr-name">${r.name}</span><span class="draft-pos">${r.posName}</span></div></td>
      <td class="right" style="white-space:nowrap">${r.posName}${r.posDrafted} → ${r.finPos!=null?`<b style="color:${r.finPos<=r.posDrafted?'var(--green)':'var(--red)'}">${r.posName}${r.finPos}</b>`:'<span style="color:var(--text3)">—</span>'}</td>
      <td class="right pf">${r.pts.toFixed(1)}</td>
      <td class="right" style="font-weight:600;font-family:'DM Sans',sans-serif;color:${r.delta>0?'var(--green)':r.delta<0?'var(--red)':'var(--text2)'}">${r.delta>0?'+':''}${r.delta}</td>
    </tr>`).join('')}</tbody>
  </table></div>
  <div style="padding:10px 18px;font-size:12px;color:var(--text2);border-top:1px solid var(--border)">Net positional Δ: <b style="color:${totalDelta>=0?'var(--green)':'var(--red)'}">${totalDelta>0?'+':''}${totalDelta}</b> across ${rows.length} picks</div>`;
}
function renderDraftTab(){
  const body=document.getElementById('draft-body'); if(!body) return;
  const season=getSeason();
  const d=_draftCache[season]; if(!d) return;
  const rows=computeDraftRows(d.picks,d.stats,season); d.rows=rows;
  if(!rows.length){ body.innerHTML=`<div class="tab-loading">No draft data available for the ${season} season.</div>`; return; }
  if(_draftTeamSel==null||!_teams.some(t=>t.id===Number(_draftTeamSel))) _draftTeamSel=_teams[0]?.id;
  body.innerHTML=`
  <div class="card" style="margin:0 0 24px">
    <div class="section-header" style="padding:13px 16px"><i class="fa fa-list-ol"></i>Full Draft by Team<span id="draft-score" style="margin-left:auto"></span></div>
    <div class="picker-bar">
      <label for="draft-team-select">Team:</label>
      <select id="draft-team-select" onchange="_draftTeamSel=this.value;renderDraftTeamTable()">${_teams.map(t=>`<option value="${t.id}" ${Number(_draftTeamSel)===t.id?'selected':''}>${t.name}</option>`).join('')}</select>
    </div>
    <div id="draft-team-body"></div>
  </div>
  <div id="draft-lists"></div>`;
  renderDraftTeamTable();
  renderDraftLists();
}
function listsHTML(best,worst,steals,busts,showSeason,note){
  return `
  <div class="two-col" style="margin:0 0 22px;gap:16px">
    <div class="card" style="box-shadow:none"><div class="section-header" style="padding:13px 16px"><i class="fa fa-trophy" style="color:var(--green)"></i>Best Drafts Ever<span class="badge-info">positional Δ</span></div>${best.map((d,i)=>draftClassCard(d,i,showSeason)).join('')}</div>
    <div class="card" style="box-shadow:none"><div class="section-header" style="padding:13px 16px"><i class="fa fa-fire" style="color:var(--red)"></i>Worst Drafts Ever<span class="badge-info">positional Δ</span></div>${worst.map((d,i)=>draftClassCard(d,i,showSeason)).join('')}</div>
  </div>
  ${draftPickLists(steals,busts,showSeason)}
  <div style="padding:0 2px 16px;font-size:12px;color:var(--text3)">${note}</div>`;
}
function renderDraftLists(){
  const el=document.getElementById('draft-lists'); if(!el) return;
  const season=getSeason();
  const toggle=`<button class="tab-btn ${_draftListScope==='year'?'active':''}" style="--tc:var(--accent);font-size:13px;padding:7px 13px" onclick="setDraftListScope('year')">This Year · ${season}</button><button class="tab-btn ${_draftListScope==='alltime'?'active':''}" style="--tc:var(--accent);font-size:13px;padding:7px 13px" onclick="setDraftListScope('alltime')">All-Time</button>`;
  if(_draftListScope==='alltime'){
    if(!_draftAllCache){
      el.innerHTML=`<div class="tab-loading"><i class="fa fa-circle-notch"></i>Crunching every draft from every season…</div>`;
      loadAllDrafts().then(()=>{ if(_activeTab==='draft'&&_draftListScope==='alltime') renderDraftLists(); })
        .catch(()=>{ el.innerHTML=`<div class="tab-loading" style="color:var(--red)">Couldn't load all-time drafts.</div>`; });
      return;
    }
    const {rows,teamDrafts}=_draftAllCache;
    const steals=rows.slice().sort((a,b)=>b.delta-a.delta).slice(0,10);
    const busts=rows.filter(r=>r.overall<=72).sort((a,b)=>a.delta-b.delta).slice(0,10);
    const best=teamDrafts.slice().sort((a,b)=>b.total-a.total).slice(0,10);
    const worst=teamDrafts.slice().sort((a,b)=>a.total-b.total).slice(0,10);
    el.innerHTML=`<div class="dr-filters" style="margin:0 0 16px">${toggle}</div>`+listsHTML(best,worst,steals,busts,true,`"Best/Worst Drafts Ever" rank each team's draft by its summed positional Δ (position draft rank − position finish rank, summed across every pick).`);
    return;
  }
  const rows=(_draftCache[season]?.rows)||[];
  const steals=rows.slice().sort((a,b)=>b.delta-a.delta).slice(0,10);
  const busts=rows.filter(r=>r.overall<=72).sort((a,b)=>a.delta-b.delta).slice(0,10);
  const totals={}; rows.forEach(r=>{ if(r.owner==null) return; totals[r.owner]=(totals[r.owner]||0)+r.delta; });
  const _os=Object.keys(totals);
  const _avg=_os.length?_os.reduce((s,o)=>s+totals[o],0)/_os.length:0;
  const ranked=_os.map(o=>({owner:o,season,total:totals[o],val:totals[o]-_avg,name:(_franchises.find(f=>f.owner===o)?.name)||(_seasonMeta[season]?.names?.[o]?.name)||o})).sort((a,b)=>b.val-a.val);
  el.innerHTML=`
  <div class="dr-card">
    <div class="dr-left">
      <div class="section-header" style="padding:0 0 12px;border-bottom:none"><i class="fa fa-ranking-star"></i>Draft Rankings · ${season}</div>
      <div class="dr-filters" style="margin-bottom:14px">${toggle}</div>
      <div class="dr-note">Draft Score = each team's summed positional Δ (draft rank − finish rank per position) minus the league average. Higher means they drafted better than the field.</div>
    </div>
    <div class="dr-right">${(()=>{const vs=ranked.map(d=>d.val);const mn=Math.min(...vs),mx=Math.max(...vs);return ranked.map((d,i)=>{const t=mx>mn?(d.val-mn)/(mx-mn):1;const tint=gradeColor(PPG_GRADES[Math.round(t*(PPG_GRADES.length-1))]);return draftClassCard(d,i,false,tint);}).join('');})()}</div>
  </div>
  ${draftPickLists(steals,busts,false)}`;
}
function renderDraftTeamTable(){
  const body=document.getElementById('draft-team-body'); if(!body) return;
  const season=getSeason();
  const d=_draftCache[season]; if(!d?.rows) return;
  const tid=Number(document.getElementById('draft-team-select')?.value??_draftTeamSel);
  const rows=d.rows.filter(r=>r.teamId===tid);
  const totals={}; d.rows.forEach(r=>{totals[r.teamId]=(totals[r.teamId]||0)+r.delta;});
  const ids=Object.keys(totals);
  const avg=ids.length?ids.reduce((s,k)=>s+totals[k],0)/ids.length:0;
  const ranked=ids.map(id=>({id:Number(id),t:totals[id]})).sort((a,b)=>b.t-a.t);
  const rel=(totals[tid]||0)-avg, rank=ranked.findIndex(x=>x.id===tid)+1;
  const rels=ranked.map(x=>x.t-avg); const mn=Math.min(...rels), mx=Math.max(...rels);
  const gt=mx>mn?(rel-mn)/(mx-mn):1; const grade=PPG_GRADES[Math.round(gt*(PPG_GRADES.length-1))]; const gcol=gradeColor(grade);
  const scoreEl=document.getElementById('draft-score'); if(scoreEl) scoreEl.innerHTML=scoreBadge(rel,rank,season,grade,gcol);
  body.innerHTML=rows.length?draftTeamTableHTML(rows,false):`<div class="tab-loading">No picks found for this team.</div>`;
}

// ── MARATHON TAB ───────────────────────────────────────────────────────────────
let _marathonTimer=null;
function marathonDays(){
  const cfg=_CFG.marathon||{};
  const since=new Date((cfg.sinceDate||'2024-12-30')+'T23:59:59');
  return Math.max(0,Math.floor((Date.now()-since.getTime())/86400000));
}
function renderMarathon(){
  const el=document.getElementById('marathon-hero'); if(!el) return;
  const cfg=_CFG.marathon||{};
  const fr=_franchises.find(f=>normName(f.name).includes(normName(cfg.team||'marathon')))||null;
  el.innerHTML=`
    ${fr?franchiseAvatar(fr,72,18):''}
    <div class="marathon-team">${fr?.name||'Marathon Men'}</div>
    <div class="marathon-big">${cfg.count??0}</div>
    <div class="marathon-label">Marathons Ran</div>
    <hr class="marathon-sep"/>
    <div class="marathon-days" id="marathon-days">${marathonDays().toLocaleString()}</div>
    <div class="marathon-label">${cfg.sinceLabel||'days since the 2024 last place game went final'}</div>`;
  if(!_marathonTimer){
    _marathonTimer=setInterval(()=>{
      const d=document.getElementById('marathon-days');
      if(d) d.textContent=marathonDays().toLocaleString();
    },60*60*1000); // re-check hourly so the counter rolls over at midnight
  }
}

// ── LEAGUE HISTORY TAB ─────────────────────────────────────────────────────────
const REGULAR_SEASON_END=14; // conference champs decided after this matchup period
function renderLeagueHistory(){
  const body=document.getElementById('legacy-body'); if(!body) return;
  const seasons=ALL_SEASONS.filter(s=>_seasonMeta[s]?.teams).sort((x,y)=>y-x);
  if(!seasons.length){body.innerHTML=`<div class="tab-loading">No historical data available.</div>`;return;}
  const champRows=[],confRows=[],champCount={},confCount={},latestName={};
  const av=(t,size,rad)=>avatarCore(t.name,t.teamId||0,proxyLogo(t.logo),size,rad);

  seasons.slice().reverse().forEach(s=>{
    const meta=_seasonMeta[s],T=meta.teams||{};
    Object.values(T).forEach(t=>{latestName[t.owner]={name:t.name,logo:t.logo,teamId:null};});

    let champ=null,ru=null;
    Object.entries(T).forEach(([tid,t])=>{
      if(t.rank===1)champ={tid:+tid,...t};
      if(t.rank===2)ru={tid:+tid,...t};
    });
    if(champ&&ru){
      let mu=null;
      (meta.schedule||[]).forEach(m=>{
        if(!m.home||!m.away)return;
        const ids=[m.home.teamId,m.away.teamId];
        if(ids.includes(champ.tid)&&ids.includes(ru.tid)&&((m.home.totalPoints||0)>0||(m.away.totalPoints||0)>0)){
          if(!mu||m.matchupPeriodId>mu.matchupPeriodId) mu=m;
        }
      });
      const cPts=mu?(mu.home.teamId===champ.tid?mu.home.totalPoints:mu.away.totalPoints):null;
      const rPts=mu?(mu.home.teamId===champ.tid?mu.away.totalPoints:mu.home.totalPoints):null;
      champRows.unshift({season:s,champ,ru,cPts,rPts,week:mu?.matchupPeriodId});
      champCount[champ.owner]=(champCount[champ.owner]||0)+1;
    }

    const rec={};
    Object.keys(T).forEach(tid=>rec[tid]={w:0,pf:0});
    let maxPlayed=0;
    (meta.schedule||[]).forEach(m=>{
      if(!m.home||!m.away)return;
      const hp=m.home.totalPoints||0,ap=m.away.totalPoints||0;
      if(hp===0&&ap===0)return;
      maxPlayed=Math.max(maxPlayed,m.matchupPeriodId||0);
      if((m.matchupPeriodId||99)>REGULAR_SEASON_END)return;
      if(rec[m.home.teamId]){rec[m.home.teamId].pf+=hp;if(hp>ap||m.winner==='HOME')rec[m.home.teamId].w++;}
      if(rec[m.away.teamId]){rec[m.away.teamId].pf+=ap;if(ap>hp||m.winner==='AWAY')rec[m.away.teamId].w++;}
    });
    if(maxPlayed>=REGULAR_SEASON_END){
      const byDiv={};
      Object.entries(T).forEach(([tid,t])=>{(byDiv[t.div]||(byDiv[t.div]=[])).push({tid:+tid,...t,...rec[tid]});});
      const winners=Object.entries(byDiv).map(([d,arr])=>{
        arr.sort((x,y)=>y.w-x.w||y.pf-x.pf);
        const w=arr[0];
        confCount[w.owner]=(confCount[w.owner]||0)+1;
        return {div:Number(d),divName:(meta.divisions&&meta.divisions[d])||`Conference ${Number(d)+1}`,...w};
      }).sort((x,y)=>x.div-y.div);
      confRows.unshift({season:s,winners});
    }
  });

  const hardware=Object.keys({...champCount,...confCount}).map(o=>({
    owner:o,name:latestName[o]?.name||'Unknown',logo:latestName[o]?.logo||null,
    rings:champCount[o]||0,confs:confCount[o]||0,
  })).sort((x,y)=>y.rings-x.rings||y.confs-x.confs);
  _hardware={}; hardware.forEach(x=>{_hardware[x.owner]={rings:x.rings,confs:x.confs};});
  // merge trophies + superlatives into one honors list (includes award-only teams)
  const honorsMap={};
  const ensureHonor=(owner,name,logo)=>honorsMap[owner]||(honorsMap[owner]={owner,name,logo,rings:_hardware[owner]?.rings||0,confs:_hardware[owner]?.confs||0,awards:awardsForOwner(owner)});
  _franchises.forEach(f=>ensureHonor(f.owner,f.name,f.logo));
  Object.keys(_hardware).forEach(o=>ensureHonor(o,latestName[o]?.name||'Unknown',latestName[o]?.logo));
  const honors=Object.values(honorsMap).filter(h=>h.rings||h.confs||h.awards.length)
    .sort((a,b)=>b.rings-a.rings||b.confs-a.confs||b.awards.length-a.awards.length);
  // per-owner championship & conference years for the shelf tile captions
  const honorYears={};
  champRows.forEach(r=>{const o=r.champ.owner;(honorYears[o]||(honorYears[o]={champ:[],conf:[]})).champ.push(`'${String(r.season).slice(2)}`);});
  confRows.forEach(r=>r.winners.forEach(w=>{(honorYears[w.owner]||(honorYears[w.owner]={champ:[],conf:[]})).conf.push(`'${String(r.season).slice(2)}`);}));
  _hardwareHonors=honorsMap; _profileHonorYears=honorYears; // expose for profiles

  body.innerHTML=`
    <div class="two-col" style="margin-bottom:28px;align-items:start">
    <div class="sec wm" data-wm="&#xf091;">
      <div class="sec-head"><i class="fa fa-trophy"></i>Champions</div>
      <div class="champ-list">
        ${champRows.length?champRows.map(r=>`
          <div class="champ-line">
            <div class="champ-line-yr">${r.season}</div>
            <div class="champ-line-main">
              <div class="champ-line-teams">
                ${av(r.champ,32,9)}
                <span class="fr-name tlink champ-line-win" data-tid="${(_teams.find(x=>_ownerMap[x.id]===r.champ.owner)||{}).id||''}">${r.champ.name}</span>
                <span class="champ-line-score" style="color:var(--green)">${r.cPts!=null?r.cPts.toFixed(1):'—'}</span>
                <span class="champ-line-def">def.</span>
                <span class="champ-line-score" style="color:var(--text3)">${r.rPts!=null?r.rPts.toFixed(1):'—'}</span>
                <span class="fr-name tlink" style="font-weight:400;color:var(--text2)" data-tid="${(_teams.find(x=>_ownerMap[x.id]===r.ru.owner)||{}).id||''}">${r.ru.name}</span>
              </div>
              <button class="bracket-btn" onclick="toggleBracket('${r.season}',this)"><i class="fa fa-sitemap"></i> Bracket</button>
            </div>
            <div class="bracket-wrap" id="bracket-${r.season}" style="display:none"></div>
          </div>`).join(''):`<div class="tab-loading">No completed championships yet.</div>`}
      </div>
    </div>
    <div class="sec wm" data-wm="&#xf005;">
      <div class="sec-head"><i class="fa fa-star"></i>Conference Championships<span class="badge-info">week ${REGULAR_SEASON_END} · PF tiebreak</span></div>
      ${(()=>{
        if(!confRows.length) return `<div class="tab-loading">No completed regular seasons yet.</div>`;
        const byDiv={};
        confRows.forEach(r=>r.winners.forEach(w=>{(byDiv[w.div]||(byDiv[w.div]={name:w.divName,rows:[]})).rows.push({season:r.season,w});}));
        const cols=Object.entries(byDiv).sort((a,b)=>a[0]-b[0]);
        return `<div class="conf-cols">${cols.map(([id,c])=>`
          <div class="conf-col">
            <div class="conf-col-head">${c.name}</div>
            ${c.rows.map(({season,w})=>`
              <div class="conf-win-row">
                <span class="conf-win-yr">${season}</span>
                ${avatarCore(w.name,w.tid,proxyLogo(w.logo),28,8)}
                <div class="conf-win-info"><div class="fr-name">${w.name}</div><div style="font-size:12px;color:var(--text3)">${w.w}–${REGULAR_SEASON_END-w.w} · ${w.pf.toFixed(1)} PF</div></div>
              </div>`).join('')}
          </div>`).join('')}</div>`;
      })()}
    </div>
    </div>
    <div class="sec wm" data-wm="&#xf091;" style="margin-bottom:28px">
      <div class="sec-head"><i class="fa fa-clipboard-list"></i>All-Time Records<span class="badge-info">by win % · every season combined</span></div>
      <div class="allrec-grid">
        ${_franchises.map(fr=>{const at=franchiseAllTime(fr.owner);const g=at.w+at.l+at.t;return {fr,at,pct:g?at.w/g:0};})
          .sort((a,b)=>b.pct-a.pct||b.at.w-a.at.w)
          .map(({fr,at,pct},i)=>{
          const tid=(_teams.find(x=>_ownerMap[x.id]===fr.owner)||{}).id||'';
          return `<div class="allrec-card">
            <span class="allrec-rank">${i+1}</span>
            ${avatarCore(fr.name,fr.teamId||0,proxyLogo(fr.logo),34,9)}
            <div class="allrec-info">
              <div class="fr-name tlink" data-tid="${tid}">${fr.name}</div>
              <div class="allrec-rec">${at.w}–${at.l}${at.t?`–${at.t}`:''} <span style="color:${pct>=0.5?'var(--green)':'var(--red)'};font-weight:700">${(pct*100).toFixed(1)}%</span></div>
              <div class="allrec-sub">${at.pf.toFixed(0)} PF · ${at.pa.toFixed(0)} PA · ${at.seasons} yr${at.seasons!==1?'s':''}</div>
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>
    <div class="sec wm" data-wm="&#xf559;" style="margin-top:8px">
      <div class="sec-head"><i class="fa fa-award"></i>Season Superlatives<span class="badge-info">GFL voted</span></div>
      ${(()=>{
        const yrs=_awardsData?Object.keys(_awardsData.years||{}).sort((a,b)=>b-a):[];
        if(!yrs.length) return `<div class="tab-loading">No awards recorded yet.</div>`;
        const order=_awardsData.order||[];
        return yrs.map(y=>{
          const yr=_awardsData.years[y];
          const rows=order.filter(k=>yr[k]&&yr[k].length).map(k=>{
            const lab=_awardsData.labels[k]||{name:k,emoji:'🏅'};
            const winners=yr[k].map(e=>{const fr=awardOwner(e.team);const av=fr?avatarCore(fr.name,fr.teamId||0,proxyLogo(fr.logo),22,6):'';const nm=fr?fr.name:e.team;return `<span class="sup-win">${av}<span class="fr-name" ${fr?`data-tid="${(_teams.find(x=>_ownerMap[x.id]===fr.owner)||{}).id||''}"`:''} style="${fr?'':'color:var(--text3)'}">${nm}</span>${e.detail?`<span class="sup-detail">${e.detail}</span>`:''}</span>`;}).join('');
            return `<div class="sup-row${lab.good===false?' bad':''}">
              <div class="sup-award hk-${k}">${lab.name}</div>
              <div class="sup-winners">${winners}</div>
            </div>`;
          }).join('');
          return `<div class="hist-item"><div class="hist-item-year">${y} SEASON</div><div class="sup-grid">${rows}</div></div>`;
        }).join('');
      })()}
    </div>`;
}


// Championship playoff bracket — traced backward from the finalists by who beat
// whom each week (robust to non-standard seeding, byes, and reseeds).
function buildBracket(season){
  const meta=_seasonMeta[season]; if(!meta) return null;
  const T=meta.teams||{}, sched=meta.schedule||[];
  let champ=null,ru=null;
  Object.entries(T).forEach(([id,t])=>{if(t.rank===1)champ=+id;if(t.rank===2)ru=+id;});
  if(champ==null||ru==null) return null;
  const played=sched.filter(m=>m.home&&m.away&&((m.home.totalPoints||0)>0||(m.away.totalPoints||0)>0));
  const periods=[...new Set(played.map(m=>m.matchupPeriodId))].sort((a,b)=>a-b);
  if(!periods.length) return null;
  const finalWeek=Math.max(...periods);
  const gAt=w=>played.filter(m=>m.matchupPeriodId===w);
  const winnerOf=m=>((m.home.totalPoints||0)>=(m.away.totalPoints||0))?m.home.teamId:m.away.teamId;
  const info=m=>{const hp=m.home.totalPoints||0,ap=m.away.totalPoints||0,hw=hp>=ap;return {a:{tid:m.home.teamId,pts:hp,win:hw},b:{tid:m.away.teamId,pts:ap,win:!hw}};};
  const finalGame=gAt(finalWeek).find(m=>{const ids=[m.home.teamId,m.away.teamId];return ids.includes(champ)&&ids.includes(ru);});
  if(!finalGame) return null;
  let participants=new Set([champ,ru]);
  const roundsRev=[{week:finalWeek,games:[info(finalGame)],byes:[]}];
  let w=finalWeek-1,guard=0;
  while(w>REGULAR_SEASON_END&&guard++<4){
    const games=gAt(w).filter(m=>participants.has(winnerOf(m)));
    if(!games.length) break;
    const byes=[...participants].filter(t=>!games.some(m=>m.home.teamId===t||m.away.teamId===t));
    roundsRev.push({week:w,games:games.map(info),byes});
    participants=new Set(games.flatMap(m=>[m.home.teamId,m.away.teamId]));
    w--;
  }
  const rounds=roundsRev.reverse();
  const names=rounds.length>=3?['Quarterfinals','Semifinals','Championship']
    :rounds.length===2?['Semifinals','Championship']:['Championship'];
  rounds.forEach((r,i)=>r.name=names[i]||`Round ${i+1}`);
  return {rounds,byes:rounds[0]?.byes||[]};
}
function toggleBracket(season,btn){
  const el=document.getElementById('bracket-'+season); if(!el) return;
  const open=el.style.display==='none';
  el.style.display=open?'block':'none';
  btn.innerHTML=open?'<i class="fa fa-sitemap"></i> Hide bracket':'<i class="fa fa-sitemap"></i> View bracket';
  if(open&&!el.dataset.built){
    const br=buildBracket(season);
    const meta=_seasonMeta[season];
    const nm=tid=>(meta?.names?.[meta?.owners?.[tid]]?.name||_teams.find(t=>t.id===tid)?.name||'Team').trim();
    const avt=tid=>{const o=meta?.owners?.[tid];const info=meta?.names?.[o]||{};return avatarCore(info.name||'',tid,proxyLogo(info.logo),22,6);};
    if(!br){el.innerHTML='<div class="brk-empty" style="padding:10px">Bracket data unavailable for this season.</div>';el.dataset.built='1';return;}
    el.innerHTML=`<div class="bracket">
      ${br.rounds.map(r=>`<div class="bracket-col">
        <div class="bracket-round">${r.name}</div>
        ${r.byes&&false?'':''}
        ${r.games.map(g=>`<div class="bracket-game">
          <div class="bracket-team ${g.a.win?'adv':''}">${avt(g.a.tid)}<span class="bracket-name">${nm(g.a.tid)}</span><span class="bracket-pts">${g.a.pts.toFixed(1)}</span></div>
          <div class="bracket-team ${g.b.win?'adv':''}">${avt(g.b.tid)}<span class="bracket-name">${nm(g.b.tid)}</span><span class="bracket-pts">${g.b.pts.toFixed(1)}</span></div>
        </div>`).join('')}
        ${(r===br.rounds[0]&&br.byes.length)?`<div class="bracket-byes">Byes to next round: ${br.byes.map(nm).join(', ')}</div>`:''}
      </div>`).join('')}
    </div>`;
    el.dataset.built='1';
  }
}

// ── Trophy & ring SVGs (on-brand gold hardware) ──────────────────────────────
function trophySVG(sz){
  return `<svg viewBox="0 0 48 60" width="${sz}" height="${sz*1.25}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <defs><linearGradient id="gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffe08a"/><stop offset="0.5" stop-color="var(--accent)"/><stop offset="1" stop-color="#a35f00"/></linearGradient></defs>
    <path d="M14 6h20v10a10 10 0 0 1-20 0z" fill="url(#gold)"/>
    <path d="M14 8H8a6 6 0 0 0 6 8z" fill="none" stroke="url(#gold)" stroke-width="2.5"/>
    <path d="M34 8h6a6 6 0 0 1-6 8z" fill="none" stroke="url(#gold)" stroke-width="2.5"/>
    <rect x="22" y="26" width="4" height="8" fill="url(#gold)"/>
    <path d="M16 34h16l-2 6H18z" fill="url(#gold)"/>
    <rect x="14" y="40" width="20" height="4" rx="1.5" fill="url(#gold)"/>
    <rect x="11" y="44" width="26" height="5" rx="2" fill="#7a4a00"/>
  </svg>`;
}
function ringSVG(label,sz){
  const S=sz||64;
  return `<svg viewBox="0 0 64 64" width="${S}" height="${S}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <defs><linearGradient id="rg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffe08a"/><stop offset="0.5" stop-color="var(--accent)"/><stop offset="1" stop-color="#8f5400"/></linearGradient></defs>
    <ellipse cx="32" cy="46" rx="15" ry="14" fill="none" stroke="url(#rg)" stroke-width="5"/>
    <path d="M18 30 L24 16 H40 L46 30 A16 16 0 0 0 18 30 Z" fill="url(#rg)"/>
    <rect x="24" y="14" width="16" height="18" rx="3" fill="#1a1205" stroke="url(#rg)" stroke-width="2"/>
    <circle cx="32" cy="23" r="4.5" fill="url(#rg)"/>
    ${label?`<text x="32" y="26" text-anchor="middle" font-size="7" font-family="'DM Sans',sans-serif" font-weight="800" fill="#1a1205">${String(label).slice(2)}</text>`:''}
  </svg>`;
}


// ── MATCHUP OF THE WEEK (homepage) ───────────────────────────────────────────
function resolveTeamByName(q){
  if(!q) return null;
  const s=String(q).trim().toLowerCase();
  if(/^\d+$/.test(s)){const b=_teams.find(t=>t.id===Number(s));if(b)return b;}
  return _teams.find(t=>(t.name||'').toLowerCase()===s)
      || _teams.find(t=>(t.name||'').toLowerCase().includes(s))
      || null;
}
// Try to detect the two teams from the latest Ball & Chain video title.
function detectMatchupFromVideo(){
  const v=_videos[0]; if(!v) return null;
  const text=((v.description||'')+' '+(v.title||'')).toLowerCase();
  if(!text.trim()) return null;
  // score each team by how many of its distinctive name-words appear, and where
  const STOP=new Set(['team','the','football','fantasy','league','man','and','for','with','3rd','leg']);
  const found=[];
  _teams.forEach(t=>{
    const words=(t.name||'').toLowerCase().split(/\s+/).filter(w=>w.length>2&&!STOP.has(w));
    let firstIdx=Infinity,hits=0;
    words.forEach(w=>{const i=text.indexOf(w);if(i>=0){hits++;firstIdx=Math.min(firstIdx,i);}});
    if(hits>0) found.push({t,hits,firstIdx});
  });
  // require at least one strong-word hit; order by appearance in the text
  found.sort((x,y)=>x.firstIdx-y.firstIdx);
  const uniq=[];const seen=new Set();
  found.forEach(f=>{if(!seen.has(f.t.id)){seen.add(f.t.id);uniq.push(f.t);}});
  return uniq.length>=2?[uniq[0],uniq[1]]:null;
}
function lastMeeting(ownerA,ownerB){
  let best=null;
  ALL_SEASONS.forEach(s=>{
    const meta=_seasonMeta[s]; if(!meta) return;
    const owners=meta.owners||{};
    (meta.schedule||[]).forEach(m=>{
      if(!m.home||!m.away) return;
      const ho=owners[m.home.teamId], ao=owners[m.away.teamId];
      const hp=m.home.totalPoints||0, ap=m.away.totalPoints||0;
      if(hp===0&&ap===0) return;
      if((ho===ownerA&&ao===ownerB)||(ho===ownerB&&ao===ownerA)){
        const rank=Number(s)*100+(m.matchupPeriodId||0);
        if(!best||rank>best.rank){
          const aPts=ho===ownerA?hp:ap, bPts=ho===ownerA?ap:hp;
          best={rank,season:s,week:m.matchupPeriodId,aPts,bPts};
        }
      }
    });
  });
  return best;
}
function renderMatchupOfWeek(){
  const el=document.getElementById('motw'); if(!el) return;
  const cfg=_CFG.matchup||{};
  let pair=null;
  if(cfg.auto) pair=detectMatchupFromVideo();
  if(!pair){const h=resolveTeamByName(cfg.home),a=resolveTeamByName(cfg.away);if(h&&a)pair=[h,a];}
  if(!pair){el.innerHTML='';return;}
  const [A,B]=pair;
  const oA=_ownerMap[A.id],oB=_ownerMap[B.id];
  const at=allTimeH2H(A.id,B.id);           // {wA,wB,games}
  const last=lastMeeting(oA,oB);
  const odds=cfg.odds||{home:{},away:{}};
  const oddChip=(label,pct,cls)=>`<div class="odd-chip"><div class="odd-label">${label}</div><div class="odd-val ${cls}">${pct!=null?pct+'%':'—'}</div></div>`;
  const takeCol=(title,icon,arr,col)=>`<div class="motw-take">
    <div class="motw-take-h" style="color:${col}"><i class="fa ${icon}"></i> ${title}</div>
    ${(arr||[]).map(t=>`<div class="motw-take-item">${t}</div>`).join('')||'<div class="motw-take-item" style="color:var(--text3)">—</div>'}
  </div>`;
  el.innerHTML=`
    <div class="motw-head">
      <div class="motw-team">${logoImg(A.id,'big4-logo')}<div><div class="fr-name" style="font-size:17px">${A.name}</div><div style="font-size:12px;color:var(--text3)">${A.wins}–${A.losses} · ${A.pf.toFixed(0)} PF</div></div></div>
      <div class="motw-vs">VS</div>
      <div class="motw-team right">${logoImg(B.id,'big4-logo')}<div><div class="fr-name" style="font-size:17px">${B.name}</div><div style="font-size:12px;color:var(--text3)">${B.wins}–${B.losses} · ${B.pf.toFixed(0)} PF</div></div></div>
    </div>
    <div class="motw-facts">
      <div class="motw-fact"><div class="motw-fact-l">All-time series</div><div class="motw-fact-v">${at.games?`${at.wA}–${at.wB}`:'first meeting'}</div></div>
      <div class="motw-fact"><div class="motw-fact-l">Last meeting</div><div class="motw-fact-v">${last?`${last.aPts.toFixed(1)}–${last.bPts.toFixed(1)}`:'—'}</div><div class="motw-fact-s">${last?`${last.season} Wk ${last.week}`:'never played'}</div></div>
    </div>
    <div class="motw-takes">
      ${takeCol('The Ball 🔨','fa-hand-fist',cfg.ball,'var(--accent)')}
      ${takeCol('The Chain ⛓️','fa-link',cfg.chain,'var(--blue)')}
    </div>
    <div class="motw-odds">
      <div class="motw-odds-h">Playoff odds</div>
      <div class="motw-odds-grid">
        <div class="motw-odds-team">
          <div class="fr-name">${A.name}</div>
          <div class="odd-row">${oddChip('With a win',odds.home?.win,'win')}${oddChip('With a loss',odds.home?.loss,'loss')}</div>
        </div>
        <div class="motw-odds-team">
          <div class="fr-name">${B.name}</div>
          <div class="odd-row">${oddChip('With a win',odds.away?.win,'win')}${oddChip('With a loss',odds.away?.loss,'loss')}</div>
        </div>
      </div>
    </div>`;
}

// ── WEEKLY PUNISHMENT ────────────────────────────────────────────────────────
const PUNISH_ART={
  'beer pour':{icon:'&#xf0fc;',svg:`<svg viewBox="0 0 90 100" width="120" height="133" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="beer" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffcf5c"/><stop offset="1" stop-color="#c9860d"/></linearGradient></defs><rect x="20" y="26" width="42" height="64" rx="6" fill="none" stroke="var(--accent)" stroke-width="3"/><rect x="24" y="40" width="34" height="46" rx="3" fill="url(#beer)"/><rect x="24" y="34" width="34" height="9" rx="3" fill="#fff8ec"/><ellipse cx="30" cy="33" rx="5" ry="4" fill="#fff8ec"/><ellipse cx="42" cy="31" rx="6" ry="5" fill="#fff8ec"/><ellipse cx="53" cy="33" rx="5" ry="4" fill="#fff8ec"/><path d="M62 38h10a8 8 0 0 1 0 24h-10" fill="none" stroke="var(--accent)" stroke-width="3"/><circle cx="34" cy="55" r="2" fill="#fff8ec" opacity="0.6"/><circle cx="46" cy="66" r="2.4" fill="#fff8ec" opacity="0.5"/><circle cx="40" cy="74" r="1.8" fill="#fff8ec" opacity="0.5"/></svg>`},
  'weatherman':{icon:'&#xf743;',svg:''},
  'fast banana':{icon:'&#xf5d1;',svg:''},
  'willem defoe':{icon:'&#xf508;',svg:''},
  'fruit pledge':{icon:'&#xf5d1;',svg:''},
  'spicy food':{icon:'&#xf06d;',svg:''},
};
const PUNISH_ICON={'weatherman':'fa-cloud-sun-rain','fast banana':'fa-person-running','willem defoe':'fa-masks-theater','fruit pledge':'fa-apple-whole','spicy food':'fa-pepper-hot','beer pour':'fa-beer-mug-empty'};
function homePunishHTML(){
  const cfg=_CFG.punishment||{};
  if(!cfg.name && cfg.week==null) return '<div class="tab-loading" style="padding:22px">No punishment set this week.</div>';
  const cur=(cfg.name||'').toLowerCase();
  const icon=PUNISH_ICON[cur]||'fa-gavel';
  return `<div class="home-punish">
    <div class="home-punish-ic"><i class="fa ${icon}"></i></div>
    <div class="home-punish-info">
      <div class="home-punish-week">Week ${cfg.week??'—'} Punishment</div>
      <div class="home-punish-name">${cfg.name||'TBD'}</div>
      ${cfg.note?`<div class="home-punish-note">${cfg.note}</div>`:''}
    </div>
    <button class="home-punish-more" onclick="switchTab('punishment')">Details <i class="fa fa-arrow-right"></i></button>
  </div>`;
}
function renderPunishment(){
  const el=document.getElementById('punishment-body'); if(!el) return;
  const cfg=_CFG.punishment||{};
  const cur=(cfg.name||'').toLowerCase();
  const art=PUNISH_ART[cur]||{};
  el.innerHTML=`
    <div class="punish-hero">
      <div class="punish-art">${art.svg||`<i class="fa ${PUNISH_ICON[cur]||'fa-gavel'}" style="font-size:96px;color:var(--accent)"></i>`}</div>
      <div class="punish-info">
        <div class="punish-week">Week ${cfg.week??'—'} Punishment</div>
        <div class="punish-name">${cfg.name||'TBD'}</div>
        <div class="punish-note">${cfg.note||''}</div>
      </div>
    </div>
    <div class="sec-head" style="font-size:15px;margin-top:8px"><i class="fa fa-list-check"></i>Punishment Menu</div>
    <div class="punish-menu">
      ${(cfg.options||[]).map(o=>`<div class="punish-opt ${o.toLowerCase()===cur?'active':''}"><i class="fa ${PUNISH_ICON[o.toLowerCase()]||'fa-circle'}"></i>${o}${o.toLowerCase()===cur?'<span class="punish-tag">THIS WEEK</span>':''}</div>`).join('')}
    </div>`;
}

// ── GABE'S GREATNESS ─────────────────────────────────────────────────────────
let _gabeGames=null,_gabePromise=null,_gabeView='started';
function gabeHeart(pid){
  const url=proxyLogo(`https://a.espncdn.com/i/headshots/nfl/players/full/${pid}.png`);
  const heart="M100 172 C100 172 18 116 18 62 C18 33 44 20 68 34 C84 43 100 64 100 64 C100 64 116 43 132 34 C156 20 182 33 182 62 C182 116 100 172 100 172 Z";
  return `<div class="gabe-heart">
    <svg viewBox="0 0 200 185" width="100%" xmlns="http://www.w3.org/2000/svg" aria-label="Gabe Davis">
      <defs>
        <linearGradient id="ghg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffe08a"/><stop offset="0.5" stop-color="var(--accent)"/><stop offset="1" stop-color="#a35f00"/></linearGradient>
        <clipPath id="ghclip"><path d="${heart}"/></clipPath>
      </defs>
      <path d="${heart}" fill="#1a1205"/>
      <image href="${url}" x="34" y="10" width="132" height="150" clip-path="url(#ghclip)" preserveAspectRatio="xMidYMid slice"/>
      <path d="${heart}" fill="none" stroke="url(#ghg)" stroke-width="7"/>
    </svg>
    <div class="gabe-mon-cap">The heart of the GFL 💛</div>
  </div>`;
}
async function loadGabe(pid){
  if(_gabeGames) return _gabeGames;
  if(_gabePromise) return _gabePromise;
  const cached=cacheGet('gabe-v1:'+pid);          // gathered once, then reused
  if(cached&&Array.isArray(cached.d)){_gabeGames=cached.d;return _gabeGames;}
  _gabePromise=(async()=>{
    const res=await Promise.allSettled(ALL_SEASONS.map(async s=>{
      const r=await fetch(`${BASE}?type=playergames&seasonId=${s}&playerId=${pid}`);
      return r.ok?{s,d:await r.json()}:null;
    }));
    const all=[];
    res.forEach(rr=>{if(rr.status!=='fulfilled'||!rr.value)return;const {s,d}=rr.value;(d.games||[]).forEach(g=>all.push({...g,season:s}));});
    _gabeGames=all; cacheSet('gabe-v1:'+pid,all); return all;
  })();
  return _gabePromise;
}
function setGabeView(v){_gabeView=v;renderGabe();}
async function renderGabe(){
  const body=document.getElementById('gabe-body'), mon=document.getElementById('gabe-monument');
  if(!body) return;
  const cfg=_CFG.gabe||{}; const pid=cfg.playerId||4243537;
  if(mon) mon.innerHTML=gabeHeart(pid);
  if(!_gabeGames){ body.innerHTML=`<div class="tab-loading"><i class="fa fa-circle-notch"></i>Digging up every Gabe Davis box score…</div>`; }
  const games=await loadGabe(pid);
  if(!games.length){ body.innerHTML=`<div class="tab-loading">No Gabe Davis games found in league history.</div>`; return; }
  const subtab=(v,label)=>`<button class="tab-btn ${_gabeView===v?'active':''}" onclick="setGabeView('${v}')">${label}</button>`;
  let list=games.slice();
  if(_gabeView==='started') list=list.filter(g=>g.started);
  else if(_gabeView==='benched') list=list.filter(g=>!g.started);
  list.sort((a,b)=>b.pts-a.pts);
  const top=list.slice(0,15);
  const best=top[0]?.pts||0;
  const noteScope=_gabeView==='started'?'started by a GFL manager':_gabeView==='benched'?'left on a GFL bench':'rostered by a GFL manager';
  body.innerHTML=`
    <div class="standings-filters" id="gabe-subtabs" style="padding-bottom:14px">
      ${subtab('started','Started')}${subtab('benched','Benched')}${subtab('both','Both')}
    </div>
    <div style="font-size:13px;color:var(--text2);margin:0 2px 14px;line-height:1.6">Gabe Davis's best weeks ${noteScope}, ranked by fantasy points.${top.length?` Top mark here: <b style="color:var(--accent)">${best.toFixed(1)}</b>.`:''}</div>
    ${top.length?top.map((g,i)=>`
      <div class="gabe-game">
        <div class="gabe-rank">#${i+1}</div>
        <div class="gabe-ptbox"><div class="gabe-pts">${g.pts.toFixed(1)}</div><div class="gabe-pts-l">pts</div></div>
        <div class="gabe-detail">
          <div class="gabe-line1">${tradeTeamAvatar(g.season,g.teamId)}<span class="fr-name">${tradeTeamName(g.season,g.teamId)}</span>
            <span class="gabe-badge ${g.started?'st':'bn'}">${g.started?'STARTED':'BENCHED'}</span>
            <span class="gabe-when">${g.season} · Wk ${g.week}</span></div>
          <div class="gabe-stat">${g.rec} rec · ${g.yds} yds · ${g.td} TD</div>
          ${g.oppTeamId!=null?`<div class="gabe-gfl">GFL game: <b>${tradeTeamName(g.season,g.teamId)}</b> ${g.teamPts??'—'}–${g.oppPts??'—'} ${tradeTeamName(g.season,g.oppTeamId)} <span class="gabe-res ${g.result==='W'?'w':g.result==='L'?'l':''}">${g.result||''}</span></div>`:''}
        </div>
      </div>`).join(''):`<div class="tab-loading">No ${_gabeView==='benched'?'benched':'started'} games found.</div>`}`;
}

// ── BAD BEAT O'METER ─────────────────────────────────────────────────────────
function badBeatData(season){
  const meta=_seasonMeta[season]; if(!meta) return null;
  const owners=meta.owners||{}, tms=meta.teams||{};
  const REG=REGULAR_SEASON_END;
  // weekly league averages (all played scores that week)
  const byWeek={};
  (meta.schedule||[]).forEach(mu=>{
    const wk=mu.matchupPeriodId; if(!wk||wk>REG||!mu.home||!mu.away) return;
    const hp=mu.home.totalPoints||0, ap=mu.away.totalPoints||0; if(hp===0&&ap===0) return;
    const a=byWeek[wk]||(byWeek[wk]=[]);
    if(mu.home.teamId!=null) a.push(hp);
    if(mu.away.teamId!=null) a.push(ap);
  });
  const wkAvg={}; Object.keys(byWeek).forEach(wk=>{const a=byWeek[wk]; wkAvg[wk]=a.reduce((s,x)=>s+x,0)/a.length;});
  const T={};
  const rec=id=>T[id]||(T[id]={id,owner:owners[id],name:tms[id]?.name||owners[id]||('Team '+id),logo:tms[id]?.logo||null,w:0,l:0,vaW:0,vaL:0,margins:[],lossOverAvg:0,games:0});
  (meta.schedule||[]).forEach(mu=>{
    const wk=mu.matchupPeriodId; if(!wk||wk>REG||!mu.home||!mu.away) return;
    const hp=mu.home.totalPoints||0, ap=mu.away.totalPoints||0; if(hp===0&&ap===0) return;
    const hid=mu.home.teamId, aid=mu.away.teamId; if(hid==null||aid==null) return;
    const H=rec(hid), A=rec(aid), avg=wkAvg[wk]||0;
    H.games++; A.games++;
    const homeWon = mu.winner==='HOME' || (mu.winner==null&&hp>ap);
    const awayWon = mu.winner==='AWAY' || (mu.winner==null&&ap>hp);
    if(homeWon){H.w++;A.l++;A.margins.push(hp-ap); if(ap>avg)A.lossOverAvg++;}
    else if(awayWon){A.w++;H.l++;H.margins.push(ap-hp); if(hp>avg)H.lossOverAvg++;}
    if(hp>avg)H.vaW++;else H.vaL++;
    if(ap>avg)A.vaW++;else A.vaL++;
  });
  const list=Object.values(T).filter(t=>t.games>0);
  if(!list.length) return null;
  const med=arr=>{if(!arr.length)return 0;const s=arr.slice().sort((a,b)=>a-b),m=s.length>>1;return s.length%2?s[m]:(s[m-1]+s[m])/2;};
  list.forEach(t=>{
    t.closest=t.margins.length?Math.min(...t.margins):0;
    t.largest=t.margins.length?Math.max(...t.margins):0;
    t.avgLoss=t.margins.length?t.margins.reduce((s,x)=>s+x,0)/t.margins.length:0;
    t.median=med(t.margins);
    t.lossU7=t.margins.filter(m=>m<7).length;
    t.pctOver=t.l>0?(t.lossOverAvg/t.l):0; // fraction of losses scored over week avg
  });
  // RANK.EQ replication: desc = rank 1 is largest; asc = rank 1 is smallest (ties share rank)
  const rd=(v,arr)=>1+arr.filter(x=>x>v).length;
  const ra=(v,arr)=>1+arr.filter(x=>x<v).length;
  const cA=list.map(t=>t.closest), mA=list.map(t=>t.median), uA=list.map(t=>t.lossU7), pA=list.map(t=>t.pctOver);
  list.forEach(t=>{
    t.rClose=rd(t.closest,cA);   // M
    t.rMed=rd(t.median,mA);      // N
    t.rU7=ra(t.lossU7,uA);       // O
    t.rPov=ra(t.pctOver,pA)*1.5; // P (weighted 1.5x)
    t.score=t.rClose+t.rMed+t.rU7+t.rPov;
  });
  list.sort((a,b)=>b.score-a.score);
  list.forEach((t,i)=>t.rank=i+1);
  return list;
}
function renderBadBeat(){
  const el=document.getElementById('badbeat-body'); if(!el) return;
  const season=getSeason();
  const list=badBeatData(season);
  if(!list){ el.innerHTML=`<div class="tab-loading" style="padding:26px">No matchup data for ${season} yet.</div>`; return; }
  const num=(v,d=1)=>Number(v).toLocaleString(undefined,{minimumFractionDigits:d,maximumFractionDigits:d});
  const intro=`How <b>unlucky</b> was each team through week ${REGULAR_SEASON_END}? The <b>Score</b> is a composite of four loss-luck ranks &mdash; Closest Loss, Median Loss, Losses under 7 points, and % of losses scored above the weekly average (weighted &times;1.5). A higher Score means a more bad-beaten season. The <b>vs&#8209;Avg</b> column is each team's record if every week were scored against that week's league average instead of their actual opponent.`;
  const rows=list.map(t=>{
    const av=avatarCore(t.name,t.id,proxyLogo(t.logo),26,7);
    const luck=t.vaW-t.w; // vs-avg wins minus actual wins (positive = unlucky)
    const luckTag = luck>0?` <span style="color:var(--green);font-size:11px;font-weight:600">+${luck}</span>` : (luck<0?` <span style="color:var(--red);font-size:11px;font-weight:600">${luck}</span>`:'');
    return `<tr>
      <td class="right"><span class="bb-rank">${t.rank}</span></td>
      <td><span class="fr-name" style="gap:8px">${av}${t.name}</span></td>
      <td class="right"><b style="color:var(--accent);font-size:15px">${num(t.score)}</b></td>
      <td class="right">${t.vaW}&ndash;${t.vaL}${luckTag}</td>
      <td class="right">${t.w}&ndash;${t.l}</td>
      <td class="right">${num(t.closest)}</td>
      <td class="right">${num(t.median)}</td>
      <td class="right">${t.lossU7}</td>
      <td class="right">${num(t.pctOver*100)}%</td>
    </tr>`;
  }).join('');
  el.innerHTML=`<div style="font-size:12.5px;color:var(--text2);line-height:1.55;margin:0 2px 14px">${intro}</div>
    <div class="tscroll"><table class="min720 srt">
      <thead><tr>
        <th class="right" data-nosort>#</th><th>Team</th>
        <th class="right">Score</th><th class="right">vs&#8209;Avg</th><th class="right">Record</th>
        <th class="right">Closest&nbsp;L</th><th class="right">Median&nbsp;L</th><th class="right">L&lt;7</th><th class="right">%&nbsp;Over&nbsp;Avg</th>
      </tr></thead><tbody>${rows}</tbody></table></div>
    <div style="font-size:11.5px;color:var(--text3);margin:11px 2px 0;line-height:1.5">Regular season through week ${REGULAR_SEASON_END}. Closest&nbsp;L / Median&nbsp;L are margins of defeat in points; L&lt;7 counts losses by fewer than 7. % Over Avg = the share of a team's losses where it still outscored the week's league average &mdash; the purest bad-beat signal.</div>`;
}
// ── TEAM PROFILE ─────────────────────────────────────────────────────────────
function franchiseAllTime(owner){
  let w=0,l=0,t=0,pf=0,pa=0,rings=0,best=99,worst=0,poW=0,poApp=0;const seasons=new Set(),played=new Set();
  ALL_SEASONS.forEach(s=>{
    const meta=_seasonMeta[s]; if(!meta) return;
    const owners=meta.owners||{},teams=meta.teams||{};
    const tid=Object.keys(owners).find(id=>owners[id]===owner);
    if(tid==null) return;
    seasons.add(s);
    const ti=teams[tid]; if(ti){if(ti.rank===1)rings++;if(ti.rank){best=Math.min(best,ti.rank);worst=Math.max(worst,ti.rank);}}
    const pt=meta.playoffTeamCount||6; const inBr=id=>{const sd=(teams[id]?.seed)||0;return sd>0&&sd<=pt;};
    if(ti&&ti.seed>0&&ti.seed<=pt) poApp++;
    (meta.schedule||[]).forEach(m=>{
      if(!m.home||!m.away)return;const hp=m.home.totalPoints||0,ap=m.away.totalPoints||0;if(hp===0&&ap===0)return;
      if(String(m.home.teamId)===tid){played.add(s);pf+=hp;pa+=ap;if(m.winner==='HOME'||hp>ap)w++;else if(hp<ap)l++;else t++;}
      else if(String(m.away.teamId)===tid){played.add(s);pf+=ap;pa+=hp;if(m.winner==='AWAY'||ap>hp)w++;else if(ap<hp)l++;else t++;}
      if((m.matchupPeriodId||0)>14 && inBr(m.home.teamId) && inBr(m.away.teamId)){
        if(String(m.home.teamId)===tid && (m.winner==='HOME'||(m.winner==null&&hp>ap))) poW++;
        else if(String(m.away.teamId)===tid && (m.winner==='AWAY'||(m.winner==null&&ap>hp))) poW++;
      }
    });
  });
  return {w,l,t,pf,pa,seasons:seasons.size,playedSeasons:played.size,rings,playoffWins:poW,playoffApps:poApp,best:best===99?null:best,worst:worst||null,confs:(_hardware[owner]?.confs)||0};
}
function openTeamProfile(teamId){
  _profileTeam=String(teamId);
  const sel=document.getElementById('profile-team-select'); if(sel) sel.value=_profileTeam;
  switchTab('teams');
  document.querySelector('main')?.scrollIntoView({behavior:'smooth',block:'start'});
}
function fmtYears(arr){
  const ys=(arr||[]).map(Number).filter(Boolean).sort((a,b)=>a-b); if(!ys.length) return '';
  const runs=[]; let start=ys[0],prev=ys[0];
  const push=()=>runs.push(start===prev?String(start):`${start}\u2013${String(prev).slice(2)}`);
  for(let i=1;i<ys.length;i++){ if(ys[i]===prev+1){prev=ys[i];} else {push();start=prev=ys[i];} }
  push(); return runs.join(', ');
}
function buildAllTimeLineup(owner, mode){
  mode = mode==='ppg' ? 'ppg' : 'gs';
  const players=Object.entries((_tenure&&_tenure[owner])||{}).map(([pid,p])=>{
    const s=p.sAll||0, sp=p.spAll||0;
    const yrs=Object.keys(p.seasons||{}).filter(y=>((p.seasons[y]&&p.seasons[y].w)||0)>0).sort();
    return {pid,n:p.n||('#'+pid),pos:p.pos,s,w:p.wAll||0,pts:p.pAll||0,sp,ppg:s>0?sp/s:0,yrs};
  });
  const cmp = mode==='ppg'
    ? (x,y)=> y.ppg-x.ppg || y.s-x.s || y.pts-x.pts
    : (x,y)=> y.s-x.s || y.w-x.w || y.pts-x.pts;
  const pool=(mode==='ppg' ? players.filter(p=>p.s>=5) : players.filter(p=>p.s>0)).slice().sort(cmp);
  const slots=[['QB',1],['RB',2],['RB',2],['WR',3],['WR',3],['TE',4],['FLEX',[2,3,4]],['DEF',16],['K',5]];
  const used=new Set();
  const pick=(m)=>{ for(const p of pool){ if(used.has(p.pid))continue; if(Array.isArray(m)?m.includes(p.pos):p.pos===m){used.add(p.pid);return p;} } return null; };
  return slots.map(([label,m])=>({label, pl:pick(m)}));
}
const LINEUP_POSC={QB:'#f8296d',RB:'#36ce85',WR:'#58a7ff',TE:'#ffae58',DEF:'#c17f60',K:'#bd66ff',FLEX:'#9aa7b5'};
let _lineupMode='ppg';
function setLineupMode(m,owner){ _lineupMode=(m==='ppg'?'ppg':'gs'); const c=document.getElementById('prof-lineup'); if(c) c.innerHTML=lineupHTML(owner); }
let _ppgScoreCache=null;
const PPG_GRADES=['F','D-','D','D+','C-','C','C+','B-','B','B+','A-','A','A+'];
function teamPPGScore(owner){
  const line=buildAllTimeLineup(owner,'ppg');
  return line.reduce((s,sl)=>s+(sl.pl?(sl.pl.ppg||0):0),0);
}
function allPPGScores(){
  if(_ppgScoreCache) return _ppgScoreCache;
  if(!_tenure) return {};
  const m={}; (_franchises||[]).forEach(f=>{ m[f.owner]=teamPPGScore(f.owner); });
  _ppgScoreCache=m; return m;
}
function gradeColor(g){const c=(g||'')[0];return c==='A'?'#3fd07a':c==='B'?'#a3e635':c==='C'?'#f4c04d':c==='D'?'#ff8f5a':'#ff5f5f';}
function ppgGradeFor(owner){
  const m=allPPGScores();
  const entries=Object.entries(m).filter(([o,v])=>v>0);
  const score=m[owner]||0;
  if(!entries.length) return {score,grade:'\u2014',rank:0,n:0};
  const vals=entries.map(e=>e[1]);
  const min=Math.min(...vals), max=Math.max(...vals);
  const t=max>min?(score-min)/(max-min):1;
  const grade=PPG_GRADES[Math.round(t*(PPG_GRADES.length-1))];
  const ranked=entries.slice().sort((a,b)=>b[1]-a[1]);
  const rank=ranked.findIndex(([o])=>o===owner)+1;
  return {score,grade,rank,n:ranked.length};
}
function lineupHTML(owner){
  const mode=_lineupMode;
  const line=buildAllTimeLineup(owner,mode);
  const tabBtn=(m,label)=>`<button class="tab-btn ${mode===m?'active':''}" style="--tc:var(--accent);font-size:13px;padding:7px 12px" onclick="setLineupMode('${m}','${owner}')">${label}</button>`;
  const tabs=`<div class="standings-filters" style="padding:0 0 12px;gap:6px">${tabBtn('ppg','Points / Start')}${tabBtn('gs','Games Started')}</div>`;
  if(line.every(s=>!s.pl)) return tabs+`<div class="tab-loading" style="padding:24px">No roster history found for this team.</div>`;
  const body=`<div class="lineup-list">${line.map(sl=>{
    const c=LINEUP_POSC[sl.label]||'var(--accent)';
    let rv='—', rl='';
    if(sl.pl){ if(mode==='ppg'){ rv=sl.pl.s>0?(sl.pl.sp/sl.pl.s).toFixed(1):'—'; rl='PPG'; } else { rv=String(sl.pl.s); rl='GS'; } }
    return `<div class="lineup-row">
      <div class="lineup-slot-pos" style="background:${c}">${sl.label}</div>
      ${sl.pl?`${playerImg(sl.pl.pid,42,sl.pl.n)}
        <div class="lineup-pinfo"><div class="lineup-pname">${sl.pl.n}</div><div class="lineup-psub">${sl.pl.s} GS · ${(sl.pl.sp/(sl.pl.s||1)).toFixed(1)} pts/start${sl.pl.yrs&&sl.pl.yrs.length?` · ${fmtYears(sl.pl.yrs)}`:''}</div></div>
        <div class="lineup-ppts"><span class="v">${rv}</span><span class="l">${rl}</span></div>`
        :`${playerImg(null,42,sl.label)}<div class="lineup-pinfo"><div class="lineup-pname" style="color:var(--text3)">Empty</div></div>`}
    </div>`;}).join('')}</div>`;
  let grade='';
  if(mode==='ppg'){
    const g=ppgGradeFor(owner); const gc=gradeColor(g.grade);
    grade=`<div class="lineup-grade">
      <div><div class="lg-label">Combined PPG</div><div class="lg-score">${g.score.toFixed(1)}</div></div>
      <div class="lg-grade" style="color:${gc};border-color:${gc}">${g.grade}</div>
    </div>
    <div class="lg-note">Sum of all 9 starters' points-per-start.${g.n?` Graded across all ${g.n} teams — ranked #${g.rank} of ${g.n}.`:''}</div>`;
  }
  const note = mode==='ppg'
    ? 'Highest points-per-start at each spot (min. 5 starts). FLEX = best remaining RB/WR/TE.'
    : 'Most-started player at each spot, all-time (games started → weeks rostered → points). FLEX = best remaining RB/WR/TE.';
  return tabs+body+grade+`<div style="padding:8px 2px 0;font-size:12px;color:var(--text3)">${note}</div>`;
}
async function renderProfile(){
  const el=document.getElementById('profile-body'); if(!el) return;
  const sel=document.getElementById('profile-team-select');
  const id=Number(sel?.value||_profileTeam||_teams[0]?.id);
  const t=_teams.find(x=>x.id===id); if(!t){el.innerHTML='';return;}
  const owner=_ownerMap[id];
  const s=_scores[id]||0;
  const at=franchiseAllTime(owner);
  const _bd=_cmBreakdown[id]||{}; const c2=_bd.c2, c3=_bd.c3;
  const g=at.w+at.l+at.t, winpct=g?(at.w/g*100):0;
  const cur=_seasonMeta[getSeason()];
  const seed=cur?.teams?.[id]?.seed||0;
  const conf=cur?.teams?.[id]?(cur.divisions?.[cur.teams[id].div]||''):'';
  const aw=awardsForOwner(owner);
  const tcRaw=await logoMainColor(id);         // dominant logo color for the banner tint
  const tc=readableColor(tcRaw);

  const stat=(icon,label,val,sub,col)=>`<div class="prof-stat"><div class="prof-stat-top"><i class="fa ${icon}"></i><span class="prof-stat-l">${label}</span></div><div class="prof-stat-v" ${col?`style="color:${col}"`:''}>${val}</div>${sub?`<div class="prof-stat-s">${sub}</div>`:''}</div>`;
  const chip=(label,val,col)=>`<div class="prof-chip"><div class="prof-chip-v" ${col?`style="color:${col}"`:''}>${val}</div><div class="prof-chip-l">${label}</div></div>`;

  const oppRows=_franchises.filter(f=>f.owner!==owner).map(opp=>{
    const key=owner<opp.owner?`${owner}|${opp.owner}`:`${opp.owner}|${owner}`;
    const k=_h2hAll[key]; if(!k||!k[owner]) return null;
    const mine=k[owner],gg=mine.games,wl=mine.w,t2=mine.t,ll=gg-wl-t2;
    return {opp,w:wl,l:ll,g:gg,pct:gg?wl/gg:0};
  }).filter(Boolean).sort((a,b)=>b.g-a.g);

  el.innerHTML=`
    <div class="prof-banner" style="--tc:${tcRaw}">
      <div class="prof-banner-wm">${(_logoMap[id]?`<img src="${_logoMap[id]}" alt="" decoding="async"/>`:'')}</div>
      <div class="prof-banner-row">
        <div class="prof-badge">${logoImg(id,'big4-logo')}</div>
        <div class="prof-headline">
          <div class="prof-name">${t.name}</div>
          <div class="prof-sub">${at.seasons} season${at.seasons!==1?'s':''}${conf?` · ${conf} Conference`:''}${seed?` · #${seed} seed in ${getSeason()}`:''}</div>
          <div class="prof-chips">
            ${chip('All-Time',`${at.w}–${at.l}`,'')}
            ${chip('Win %',`${winpct.toFixed(1)}%`,winpct>=50?'var(--green)':'var(--red)')}
            ${honorTiles(at.rings,at.confs,aw,_profileHonorYears[owner])}
          </div>
        </div>
      </div>
    </div>
    <div class="prof-top2">
    <div class="panel"><div class="sec-head" style="font-size:15px"><i class="fa fa-bolt" style="color:var(--accent)"></i>${getSeason()} Season</div>
    <div class="prof-stats">
      ${stat('fa-scale-balanced','Record',`${t.wins}–${t.losses}${t.ties?`–${t.ties}`:''}`,seed?`#${seed} seed`:'')}
      ${stat('fa-fire','Points For',t.pf.toFixed(1),'','var(--green)')}
      ${stat('fa-shield-halved','Points Against',t.pa.toFixed(1),'','var(--red)')}
      ${stat('fa-brain','Coaching Metric',_cmMode==='none'?'—':s.toFixed(2),'',sc(s))}
      ${stat('fa-arrow-trend-up','Moves',t.moves,`${t.trades} trades`)}
      ${stat('fa-right-left','C2 · Trade ROI',c2!=null?(c2>=0?'+':'')+c2.toFixed(2):'—','',sc(c2||0))}
      ${stat('fa-magnifying-glass-dollar','C3 · Waiver ROI',c3!=null?(c3>=0?'+':'')+c3.toFixed(2):'—','',sc(c3||0))}
    </div>
    </div>
    <div class="panel"><div class="sec-head" style="font-size:15px;margin-top:8px"><i class="fa fa-trophy" style="color:var(--accent)"></i>All-Time</div>
    <div class="prof-stats">
      ${stat('fa-scale-balanced','Record',`${at.w}–${at.l}${at.t?`–${at.t}`:''}`,`${winpct.toFixed(1)}% win`,winpct>=50?'var(--green)':'var(--red)')}
      ${stat('fa-fire','Points For',at.pf.toFixed(0),'','var(--green)')}
      ${stat('fa-shield-halved','Points Against',at.pa.toFixed(0),'','var(--red)')}
      ${stat('fa-crown','Championships',at.rings,at.rings?'🏆':'')}
      ${stat('fa-trophy','Playoff Wins',at.playoffWins||0,'')}
      ${stat('fa-calendar-check','Playoff Apps',at.playoffApps||0,'')}
      ${stat('fa-ranking-star','Best Finish',at.best?`#${at.best}`:'—','','var(--green)')}
      ${stat('fa-arrow-down-9-1','Worst Finish',at.worst?`#${at.worst}`:'—','','var(--red)')}
    </div>
    </div>
    </div>
    <div class="prof-cols">
      <div class="prof-col panel">
        <div class="sec-head" style="font-size:15px;margin-top:8px"><i class="fa fa-clipboard-list" style="color:var(--accent)"></i>All-Time Starting Lineup</div>
        <div id="prof-lineup">${_tenure?lineupHTML(owner):`<div class="tab-loading" style="padding:24px"><i class="fa fa-circle-notch"></i>Building the all-time lineup…</div>`}</div>
      </div>
      ${oppRows.length?`<div class="prof-col panel">
        <div class="sec-head" style="font-size:15px;margin-top:8px"><i class="fa fa-scale-balanced"></i>All-Time vs Each Team</div>
        <div class="tscroll"><table class="min480 srt"><thead><tr><th>Opponent</th><th class="right">W</th><th class="right">L</th><th class="right">Win%</th></tr></thead>
        <tbody>${oppRows.map(r=>`<tr>
          <td><div class="team-cell">${franchiseAvatar(r.opp,24,7)}<span class="fr-name">${r.opp.name}</span></div></td>
          <td class="right" style="color:var(--green);font-weight:700">${r.w}</td>
          <td class="right" style="color:var(--red)">${r.l}</td>
          <td class="right" style="font-weight:600;color:${r.pct>=0.5?'var(--green)':'var(--red)'}">${(r.pct*100).toFixed(0)}%</td>
        </tr>`).join('')}</tbody></table></div>
      </div>`:''}
    </div>`;
  if(!_tenure){
    loadTenureData().then(()=>{
      const c=document.getElementById('prof-lineup');
      const stillHere=Number(document.getElementById('profile-team-select')?.value||_profileTeam)===id;
      if(c&&stillHere) c.innerHTML=lineupHTML(owner);
    }).catch(()=>{});
  }
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
  const named=pid=>_playerNames[pid]?` <span class="pname" style="display:inline-flex">${playerImg(pid,16,_playerNames[pid])}<strong>${_playerNames[pid]}</strong></span>`:'';
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
        weeklyAdds:t.transactionCounter?.matchupAcquisitionTotals||{},
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
    // from weekly roster diffs so the activity feed still works.
    let txReconstructed=false;
    if(!transactions.length){
      const inferred=inferTransactionsFromRosters(weeklyData,_teams);
      if(inferred.length){
        transactions=inferred.sort((a,b)=>(b.scoringPeriodId||0)-(a.scoringPeriodId||0));
        txReconstructed=true;
        _txMeta={source:'inferred from weekly rosters',count:inferred.length,diag:_txMeta.diag};
      }
    }

    // Coaching metric source, in priority order:
    //  1. official archived values from the commissioner's spreadsheet
    //  2. "no data" for seasons listed in the archive's `none` list
    //  3. live computation from the transaction log (real or reconstructed)
    const officialAll=await loadCMOfficial();
    await loadAwards();
    const officialSeason=officialAll?.[season]||null;
    if(Array.isArray(officialAll?.none)&&officialAll.none.includes(season)){
      _cmMode='none';_scores={};_breakdown={};
    }else if(officialSeason){
      _cmMode='official';_scores={};_breakdown={};
      _teams.forEach(t=>{
        const o=officialFor(t,officialSeason);
        if(o){_scores[t.id]=o.final;_breakdown[t.id]={c1:o.c1??null,c2:o.c2??null,c3:o.c3??null,raw:o.final,final:o.final,official:true,legacy:!!officialSeason.legacy,source:officialSeason.source||''};}
      });
    }else{
      _cmMode=txReconstructed?'inferred':'transactions';
      const{scores,breakdown}=await computeCoaching(_teams,transactions,weeklyData);
      _scores=scores;_breakdown=breakdown;
    }
    _transactions=transactions;

    // Always compute the full C2/C3 breakdown (with per-player detail) for the
    // Trade ROI / Waiver ROI tables — even when the headline CM score is official.
    try{ _cmBreakdown=(await computeCoaching(_teams,transactions,weeklyData)).breakdown; }catch{ _cmBreakdown={}; }

    const cmRanked=[..._teams].sort((a,b)=>(_scores[b.id]||0)-(_scores[a.id]||0));
    const totalMoves=_teams.reduce((s,t)=>s+t.moves,0);
    const totalTrades=_teams.reduce((s,t)=>s+t.trades,0);
    const totalDrops=_teams.reduce((s,t)=>s+t.drops,0);
    const avgPF=_teams.reduce((s,t)=>s+t.pf,0)/(_teams.length||1);
    const firstVid=_videos[0];
    _activeVideoId=firstVid?.videoId||null;

    {const _lu=document.getElementById('last-updated'); if(_lu) _lu.textContent='Updated '+new Date().toLocaleTimeString();}
    setStatus('live','Live');

    const franchiseOpts=sel=>_franchises.map(f=>`<option value="${f.owner}" ${f.owner===sel?'selected':''}>${f.name}</option>`).join('');

    app.innerHTML=`
      <!-- HOME -->
      <div class="tab-page" id="page-home">
        <!-- Row 1: Matchup (left) + Ball & Chain video (right) -->
        <div class="home-top">
          <div class="sec wm" data-wm="&#xf091;">
            <div class="sec-head"><span class="svc-idx">— 01</span><i class="fa fa-fire"></i>Matchup of the Week</div>
            <div id="motw"></div>
          </div>
          <div class="sec">
            <div class="sec-head"><span class="svc-idx">— 02</span><i class="fa-brands fa-youtube" style="color:#ff0000"></i>Ball &amp; Chain Media</div>
            ${firstVid
              ?`<div class="video-featured"><iframe id="vi" src="https://www.youtube.com/embed/${firstVid.videoId}" allowfullscreen loading="lazy"></iframe></div>
                <div class="video-featured-title" id="vt">${firstVid.title}</div>
                ${_videos.length>1?`<div class="video-scroll-label">More Videos</div>
                <div class="video-list">${_videos.map(v=>`<div class="video-thumb ${v.videoId===_activeVideoId?'active':''}" data-vid="${v.videoId}" onclick="selectVideo('${v.videoId}')"><img src="${v.thumb||`https://i.ytimg.com/vi/${v.videoId}/mqdefault.jpg`}" alt="" loading="lazy"/><div class="video-thumb-title">${v.title}</div></div>`).join('')}</div>`:''}`
              :`<div style="padding:60px 24px;text-align:center;color:var(--text3)">Could not load videos</div>`
            }
          </div>
        </div>
        <!-- Row 2: Coaching Metric (left) + [Big4 top, Headlines bottom] (right) -->
        <div class="home-bottom">
          <div class="sec wm" data-wm="&#xf5dc;">
            <div class="sec-head"><span class="svc-idx">— 03</span><i class="fa fa-brain"></i>Coaching Metric</div>
            ${_cmMode==='none'
              ?`<div class="tab-loading" style="padding:40px 20px">No coaching metric data available for the ${season} season.</div>`
              :(()=>{
                const cmMax=Math.max(1,...Object.values(_scores).map(v=>Math.abs(v||0)));
                const cmBar=v=>Math.min(100,Math.max(0,((v/cmMax)+1)/2*100)).toFixed(1);
                const cmCol=v=>v>cmMax*0.15?'var(--green)':v<-cmMax*0.15?'var(--red)':'var(--text2)';
                return cmRanked.map((t,i)=>{
                  const s=_scores[t.id]||0;
                  return`<div class="coaching-row" onclick="openCMModal(${t.id})">
                    <div class="coaching-rank">${i===0?'🥇':i+1}</div>
                    ${logoImg(t.id)}
                    <div class="coaching-info"><div class="coaching-name tlink" data-tid="${t.id}">${t.name}</div><div class="coaching-sub">${t.wins}W · ${t.losses}L · ${t.pf.toFixed(0)} PF</div></div>
                    <div class="coaching-bar"><div class="coaching-bar-fill" style="width:${cmBar(s)}%;background:${cmCol(s)}"></div></div>
                    <div class="coaching-score" style="color:${cmCol(s)}">${s.toFixed(2)}</div>
                    <div class="coaching-chevron"><i class="fa fa-chevron-right"></i></div>
                  </div>`;
                }).join('');
              })()}
          </div>
          <div class="home-right">
            <div class="sec wm" data-wm="&#xf521;" id="big4-display"></div>
            <div class="sec wm" data-wm="&#xf0e3;">
              <div class="sec-head"><span class="svc-idx">— 05</span><i class="fa fa-gavel"></i>Punishment of the Week</div>
              ${homePunishHTML()}
            </div>
            <div class="sec wm" data-wm="&#xf1ea;">
              <div class="sec-head"><span class="svc-idx">— 06</span><i class="fa fa-newspaper"></i>Matchup Headlines</div>
              <div id="home-headlines"></div>
            </div>
          </div>
        </div>
      </div>

      <!-- STANDINGS & STATS -->
      <div class="tab-page" id="page-standings">
        <div class="stat-grid">
          <div class="card stat-card"><div class="stat-label">Total Moves</div><div class="stat-value">${totalMoves}</div><div class="stat-sub">${totalMoves} adds · ${totalDrops} drops</div></div>
          <div class="card stat-card"><div class="stat-label">Total Trades</div><div class="stat-value">${totalTrades}</div><div class="stat-sub">across all teams</div></div>
          <div class="card stat-card"><div class="stat-label">Avg Points For</div><div class="stat-value">${avgPF.toFixed(1)}</div><div class="stat-sub">${season} season</div></div>
        </div>
        <div class="sec wm" data-wm="&#xe561;">
          <div class="standings-filters" id="stats-subtabs" style="padding-bottom:16px">
            <button class="tab-btn ${_statsView==='standings'?'active':''}" data-view="standings" onclick="setStatsView('standings')"><i class="fa fa-ranking-star"></i>${season} Standings</button>
            <button class="tab-btn ${_statsView==='c2'?'active':''}" data-view="c2" onclick="setStatsView('c2')"><i class="fa fa-right-left"></i>C2 · Trade ROI</button>
            <button class="tab-btn ${_statsView==='c3'?'active':''}" data-view="c3" onclick="setStatsView('c3')"><i class="fa fa-magnifying-glass-dollar"></i>C3 · Waiver ROI</button>
          </div>
          <div id="stats-standings" ${_statsView==='standings'?'':'style="display:none"'}>
            <div style="font-size:12px;color:var(--text3);margin:0 2px 10px">Click any column header to sort.</div>
            <div class="tscroll"><table class="min640"><thead id="standings-thead"></thead><tbody id="standings-tbody"></tbody></table></div>
          </div>
          <div id="stats-c2" ${_statsView==='c2'?'':'style="display:none"'}></div>
          <div id="stats-c3" ${_statsView==='c3'?'':'style="display:none"'}></div>
        </div>
        <div class="sec wm" data-wm="&#xf1da;">
          <div class="sec-head"><i class="fa fa-clock-rotate-left"></i>Recent Activity${_cmMode==='inferred'?'<span class="badge-info">reconstructed from weekly rosters</span>':''}</div>
          ${transactions.slice(0,10).map(tx=>renderTx(tx,teamMap)).filter(Boolean).join('')||`<div style="padding:28px;text-align:center;color:var(--text3)">No recent transactions</div>`}
        </div>
      </div>

      <!-- TRADES -->
      <div class="tab-page" id="page-trades">
        <div class="trades-layout">
          <div class="trades-filters wm" data-wm="&#xf362;">
            <div class="sec-head"><i class="fa fa-right-left"></i>Trade Report</div>
            <div class="standings-filters" id="trade-scope">
              <span style="font-size:12px;color:var(--text3);margin-right:4px">Scope:</span>
              <button class="filter-btn ${_tradeScope==='season'?'active':''}" onclick="setTradeScope('season',this)">This Season</button>
              <button class="filter-btn ${_tradeScope==='alltime'?'active':''}" onclick="setTradeScope('alltime',this)">All-Time</button>
            </div>
            <div class="standings-filters" id="trade-sort">
              <span style="font-size:12px;color:var(--text3);margin-right:4px">Sort:</span>
              <button class="filter-btn ${_tradeSort==='unbalanced'?'active':''}" onclick="setTradeSort('unbalanced',this)">Most Unbalanced</button>
              <button class="filter-btn ${_tradeSort==='balanced'?'active':''}" onclick="setTradeSort('balanced',this)">Most Balanced</button>
              <button class="filter-btn ${_tradeSort==='week'?'active':''}" onclick="setTradeSort('week',this)">By Week</button>
            </div>
            <div class="standings-filters" id="trade-team">
              <span style="font-size:12px;color:var(--text3);margin-right:4px">Team:</span>
              <select onchange="setTradeTeam(this.value)"><option value="">All teams</option>${_franchises.map(f=>`<option value="${f.owner}" ${_tradeTeamFilter===f.owner?'selected':''}>${f.name}</option>`).join('')}</select>
            </div>
          </div>
          <div id="trades-body" class="trades-list"></div>
        </div>
      </div>

      <!-- DRAFT -->
      <div class="tab-page" id="page-draft">
        <div class="sec wm" data-wm="&#xf46d;">
          <div class="sec-head"><i class="fa fa-clipboard-list"></i>Draft Report — ${season}<span class="badge-info">draft slot vs season finish</span></div>
          <div id="draft-body"></div>
        </div>
      </div>

      <!-- MATCHUP HISTORY -->
      <div class="tab-page" id="page-history">
        <div class="sec wm" data-wm="&#xf24e;">
          <div class="sec-head"><i class="fa fa-scale-balanced"></i>Historical Matchup Records<span class="badge-info">all seasons · ${ALL_SEASONS[0]}–present</span></div>
          <div class="picker-bar">
            <label for="hist-team-select">Team:</label>
            <select id="hist-team-select" onchange="renderHistoryTable()">${franchiseOpts(_ownerMap[_teams[0]?.id])}</select>
          </div>
          <div id="history-body"></div>
        </div>
      </div>

      <!-- LEAGUE HISTORY -->
      <div class="tab-page" id="page-legacy"><div id="legacy-body"></div></div>

      <!-- MARATHON -->
      <div class="tab-page" id="page-marathon">
        <div class="sec wm" data-wm="&#xf70c;">
          <div class="sec-head"><i class="fa fa-person-running"></i>Marathons Ran</div>
          <div class="marathon-hero" id="marathon-hero"></div>
        </div>
      </div>

      <!-- PLAYER TENURE -->
      <div class="tab-page" id="page-tenure">
        <div class="sec wm" data-wm="&#xf4fd;">
          <div class="sec-head"><i class="fa fa-user-clock"></i>Player Tenure<span class="badge-info">weeks rostered &amp; points · all seasons</span></div>
          <div class="picker-bar">
            <label for="tenure-team-select">Team:</label>
            <select id="tenure-team-select" onchange="renderTenureTable()">${franchiseOpts(_ownerMap[_teams[0]?.id])}</select>
            <input type="text" id="tenure-search" placeholder="Search player…" oninput="renderTenureTable()"/>
          </div>
          <div id="tenure-body"></div>
        </div>
      </div>

      <!-- TEAM PROFILES -->
      <div class="tab-page" id="page-teams">
        <div class="sec">
          <div class="picker-bar" style="padding-bottom:16px">
            <label for="profile-team-select" style="font-size:13px;color:var(--text3)">Team:</label>
            <select id="profile-team-select" onchange="_profileTeam=this.value;renderProfile()">${_teams.map(t=>`<option value="${t.id}">${t.name}</option>`).join('')}</select>
          </div>
          <div id="profile-body"></div>
        </div>
      </div>

      <!-- WEEKLY PUNISHMENT -->
      <div class="tab-page" id="page-punishment">
        <div class="sec wm" data-wm="&#xf0fc;">
          <div class="sec-head"><i class="fa fa-gavel"></i>Weekly Punishment</div>
          <div id="punishment-body"></div>
        </div>
      </div>

      <!-- BAD BEAT O'METER -->
      <div class="tab-page" id="page-badbeat">
        <div class="sec wm" data-wm="&#xf7a9;">
          <div class="sec-head"><i class="fa fa-heart-crack"></i>Bad Beat O'Meter</div>
          <div id="badbeat-body"></div>
        </div>
      </div>

      <!-- GABE'S GREATNESS -->
      <div class="tab-page" id="page-gabe">
        <div class="gabe-layout">
          <div class="sec wm" data-wm="&#xf44b;">
            <div class="sec-head"><i class="fa fa-dumbbell"></i>Gabe's Greatness<span class="badge-info">Gabe Davis's finest GFL outings</span></div>
            <div id="gabe-body"></div>
          </div>
          <div id="gabe-monument"></div>
        </div>
      </div>
    `;

    renderStandingsTable();
    renderBig4();
    renderMatchupOfWeek();
    renderPunishment();
    if(_profileTeam==null) _profileTeam=String(_teams[0]?.id||'');
    renderHomeHeadlines();
    renderHistoryTable();
    renderLeagueHistory();
    renderMarathon();
    renderTradesTab();
    if(_activeTab==='draft') ensureDraft();
    switchTab(_activeTab);
    if(_activeTab!=='tenure'&&_tenure) renderTenureTable();

  }catch(err){
    setStatus('err','Error');
    {const _lu=document.getElementById('last-updated'); if(_lu) _lu.textContent='Failed to load';}
    document.getElementById('app').innerHTML=`<div class="err-box"><i class="fa fa-triangle-exclamation" style="margin-right:8px"></i>${err.message}</div>`;
    console.error(err);
  }
}

document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeCMModalDirect();closePinOverlay();}});
// Clicking a team name anywhere opens that team's profile.
document.addEventListener('click',e=>{
  const el=e.target.closest('[data-tid]'); if(!el) return;
  const id=Number(el.getAttribute('data-tid')); if(!id) return;
  e.preventDefault(); e.stopPropagation();
  openTeamProfile(id);
});
// auto-wire click-to-sort on any table.srt as it enters the DOM
(function(){const app=document.getElementById('app');if(app){new MutationObserver(()=>initSortable()).observe(app,{childList:true,subtree:true});}})();
loadDashboard();
