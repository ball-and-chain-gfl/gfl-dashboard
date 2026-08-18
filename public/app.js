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
const YT_CHANNEL_ID='UCUoUwKYMkspanOjX5_6d5-Q';   // Ball & Chain Media (matches api/espn.js)

/* ─────────────────────────────────────────────────────────────────────────────
   BALLS BIG 4  —  EDIT IN config.js (loaded before this file), NOT here.
─────────────────────────────────────────────────────────────────────────────── */
const _CFG = (typeof window!=='undefined' && window.GFL_CONFIG) ? window.GFL_CONFIG : {};

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
let _tenurePoGP={};                     // season -> owner -> playoff bracket games that team played
let _transactions=[];                   // current season's transaction list (real/archive/inferred)
let _draftCache={},_draftLoading=false; // season -> {picks, stats}
let _tradeSort='week';                  // 'week' | 'unbalanced' | 'balanced'
let _statsView='standings';             // 'standings' | 'cm'
let _c3Team=null;                        // teamId for the C3 breakdown dropdown (defaults to Lebron's)
let _profileTeam=null;                   // teamId string for the profile tab
let _schedTeam=null;                     // teamId string for the schedule tab
let _hardware={};                        // owner -> {rings,confs} (filled by renderLeagueHistory)
let _hardwareHonors={};                  // owner -> {rings,confs,awards} (filled by renderLeagueHistory)
let _profileHonorYears={};               // owner -> {champ:[],conf:[]} year captions
let _cmBreakdown={};                     // teamId -> computed {c1,c2,c3,detail} for breakdown tables
let _tradeScope='season';               // 'season' | 'alltime'
let _tradeTeamFilter='';                 // owner id to filter trades by (optional)
let _tradeCache={};                     // season -> {trades,source} from /api/espn?type=seasontrades
let _draftTeamSel=null;                 // team filter on draft tab
let _draftAllCache=null;
let _draftView='year';        // year | ysteals | ybusts | best | worst | steals | busts
let _draftPickScope='year';   // scope for the mobile "Steals & Busts" group
let _draftPickLast='ysteals'; // last steals/busts view chosen (current year by default)
let _drWasMobile=null;
const _logoColorCache={};               // teamId -> dominant logo color
const POS_NAMES={1:'QB',2:'RB',3:'WR',4:'TE',5:'K',16:'D/ST'};
let _activeTab='home';
// Seasons are discovered, not hardcoded: everything from 2022 up to the current
// NFL season year, so a brand-new season appears on its own (the API simply
// returns nothing for a year that hasn't started, and it drops out below).
const SEASON_START=2022;
function nflSeasonYear(){
  const d=new Date();
  // the NFL year rolls over in March; before that we're still in last year's season
  return d.getUTCMonth()>=2 ? d.getUTCFullYear() : d.getUTCFullYear()-1;
}
const ALL_SEASONS=(()=>{
  const out=[]; for(let y=SEASON_START;y<=nflSeasonYear();y++) out.push(String(y));
  return out;
})();
function refreshSeasonOptions(){
  const sel=document.getElementById('season-select'); if(!sel) return;
  const have=new Set([...sel.options].map(o=>o.value));
  const want=ALL_SEASONS.filter(y=>_seasonMeta[y]).sort((a,b)=>b-a);
  if(!want.length) return;
  if(want.every(y=>have.has(y))&&want.length===sel.options.length) return;
  const cur=sel.value;
  sel.innerHTML=want.map(y=>`<option value="${y}">${y}</option>`).join('');
  sel.value=want.includes(cur)?cur:want[0];
  try{ seasonLabel(); }catch(e){}
}

// ── THEME ──────────────────────────────────────────────────────────────────────
document.documentElement.dataset.theme='dark';   // dark only — light mode removed
/* Hand-picked primaries — see the matching --tc / --tabaccent blocks in
   index.html for these plus each tab's secondary. Nav shows the primary only. */
const TAB_COLORS={home:'#E0B67B',week:'#E8437E',roster:'#43C9E8',teams:'#E84146',schedule:'#E89845',book:'#3fd07a',legacy:'#E8BC56',history:'#587DE8',standings:'#6C6AE8',badbeat:'#E860AF',draft:'#63E0E8',trades:'#9F61E8',tenure:'#5CE8B3',gabe:'#CBE853',punishment:'#ff5f5f',marathon:'#22d3ee'};
const TAB_LABELS={home:'Home',week:'This Week',roster:'Rosters',book:'B&C Sportsbook',schedule:'Schedules',standings:'Advanced Stats',trades:'Trades',draft:'Draft Report',history:'Previous Matchups',tenure:'Player Data',teams:'Team Profiles',legacy:'League History',punishment:'Punishment',badbeat:"Bad Beat O'Meter",gabe:"Gabe's Greatness",marathon:'Marathons Ran',messages:'Messages',profile:'My Profile'};
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
  if(rings) tiles.push(tile('🏆','Champion',rings,'champ hk-champ',(years&&years.champ&&years.champ.join(' '))||''));
  if(confs) tiles.push(tile('⭐','Conference',confs,'conf hk-conf',(years&&years.conf&&years.conf.join(' '))||''));
  const byKey={};(awards||[]).forEach(aw=>{(byKey[aw.key]||(byKey[aw.key]={n:0,label:aw.label,yrs:[]})).n++;byKey[aw.key].yrs.push(aw.year);});
  // years short-form ('25) so several fit on one line beside the award name
  const yr=y=>`'${String(y).slice(2)}`;
  (_awardsData?.order||Object.keys(byKey)).forEach(k=>{const v=byKey[k];if(!v)return;
    tiles.push(tile(v.label.emoji,AWARD_SHORT[k]||v.label.name,v.n,`hk-${k} ${v.label.good===false?'bad':'award'}`,v.yrs.map(yr).join(' ')));});
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
  const wrap=`width:${size}px;height:${size}px;border-radius:${radius}px;flex:0 0 ${size}px;position:relative;display:inline-flex;align-items:center;justify-content:center;background:${teamColor(id)};color:#f7f8ec;font-weight:800;font-size:${fs}px;letter-spacing:-0.5px;overflow:hidden;vertical-align:middle;`;
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
    // ESPN's matchupPeriodCount IS the regular season length; playoffs start after
    // it. It has not been the same every year (2022 ran 15 weeks, later years 14).
    const mpc=d.settings?.scheduleSettings?.matchupPeriodCount;
    const regEndY=(mpc>=8&&mpc<=18)?mpc:14;
    const faabBudget=d.settings?.acquisitionSettings?.acquisitionBudget||0;
    return {season,schedule:d.schedule||[],owners,names,teams,divisions,playoffTeamCount,regEnd:regEndY,faabBudget};
  }catch{return null;}
}
async function buildAllTimeH2H(){
  const results=await Promise.allSettled(ALL_SEASONS.map(fetchSeasonData));
  const ledger={},games={};
  _seasonMeta={}; _brCache={};
  results.forEach(res=>{
    if(res.status!=='fulfilled'||!res.value) return;
    const {season,schedule,owners,names,teams}=res.value;
    _seasonMeta[season]={owners,names,teams,schedule,divisions:res.value.divisions||{},playoffTeamCount:res.value.playoffTeamCount||6,regEnd:res.value.regEnd||14,faabBudget:res.value.faabBudget||0};
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
// ── PER-PAGE BACKGROUNDS ─────────────────────────────────────────────────────
// Retired: pages are a flat matte now. Leaving the map empty makes setPageBg
// hide the media layer entirely; put the entries back to bring the video back.
const PAGE_BG={};
function startPageBgVideo(vid,src){
  const go=()=>{ if(vid.dataset.src!==src) return; vid.src=src; vid.load();
    const p=vid.play(); if(p&&p.catch) p.catch(()=>{}); };
  const soon=()=>{ if(window.requestIdleCallback) requestIdleCallback(go,{timeout:1500}); else setTimeout(go,400); };
  if(document.readyState==='complete') soon();
  else window.addEventListener('load',soon,{once:true});
}
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
      // phones get a lighter encode, and it only starts downloading once the page
      // is up — the poster frame carries the look until then
      const mob=window.matchMedia('(max-width:768px)').matches;
      const src=(mob&&m.msrc)?m.msrc:m.src;
      if(m.poster&&!vid.getAttribute('poster')) vid.setAttribute('poster',m.poster);
      if(vid.dataset.src!==src){ vid.dataset.src=src; startPageBgVideo(vid,src); }
      else { const p=vid.play(); if(p&&p.catch) p.catch(()=>{}); }
    }
  } else {
    if(vid){ if(!vid.paused) vid.pause(); vid.style.display='none'; }
    const mob=window.matchMedia('(max-width:768px)').matches;
    const url=(mob&&m.msrc)?m.msrc:m.src;
    if(img){ img.style.display='block'; img.style.backgroundImage=`linear-gradient(rgba(6,6,9,${m.ov}),rgba(6,6,9,${m.ov})), url("${url}")`; }
  }
}
// Abbreviate player first names on phones ("Zach Ertz" -> "Z. Ertz").
function shortName(n){
  const s=String(n||'').trim();
  if(!s||/d\/st|dst|defense/i.test(s)) return s;
  const p=s.split(/\s+/);
  if(p.length<2) return s;
  const first=p[0].replace(/[^A-Za-z]/g,'');
  if(!first) return s;
  return first[0].toUpperCase()+'. '+p.slice(1).join(' ');
}
function applyShortNames(root){
  const mob=window.matchMedia('(max-width:768px)').matches;
  (root||document).querySelectorAll('.pname>span:not(.phs),.tp-name>span:not(.phs),.lineup-pname,.pl-name,td .team-cell>.fr-name').forEach(el=>{
    if(el.querySelector('*')) return;                       // only plain text nodes
    if(mob){
      if(el.dataset.fullname==null) el.dataset.fullname=el.textContent;
      const s=shortName(el.dataset.fullname);
      if(el.textContent!==s) el.textContent=s;
    } else if(el.dataset.fullname!=null){
      if(el.textContent!==el.dataset.fullname) el.textContent=el.dataset.fullname;
    }
  });
}
// ── LIQUID EDGE ACCENTS ──────────────────────────────────────────────────────
// Give each large display card one of the 10 "Liquid Colored Shapes" bleeding in
// off an edge. Assignment is deterministic per page so a card keeps its shape.
// On phones the season selector shows just the year, so a long tab name in the
// header doesn't push the controls onto a second line.
// Phones: size the tenure name column to the widest name it actually holds, so
// the numbers start exactly 8px after the longest name and nothing ever wraps.
function tenureNameWidth(){
  const tbl=document.querySelector('#page-tenure table.tenure-tbl'); if(!tbl) return;
  if(!window.matchMedia('(max-width:768px)').matches){ tbl.style.removeProperty('--tnw'); return; }
  tbl.style.setProperty('--tnw','420px');                 // unconstrain, then measure
  let max=0;
  tbl.querySelectorAll('tbody td:first-child .pname').forEach(p=>{const w=p.getBoundingClientRect().width; if(w>max) max=w;});
  if(max>0) tbl.style.setProperty('--tnw',Math.ceil(max+8)+'px');
  else tbl.style.removeProperty('--tnw');
}
function tradeScopeLabel(){
  const b=document.getElementById('trade-scope-season'); if(!b) return;
  const t=window.matchMedia('(max-width:768px)').matches?String(getSeason()):'This Season';
  if(b.textContent!==t) b.textContent=t;
}
function seasonLabel(){
  const sel=document.getElementById('season-select'); if(!sel) return;
  const mob=window.matchMedia('(max-width:768px)').matches;
  [...sel.options].forEach(o=>{
    const t=o.value;                       // the pill stays compact: year only
    if(o.textContent!==t) o.textContent=t;
  });
}
// ── MOBILE TABLES ────────────────────────────────────────────────────────────
// Tag every data cell with its column label so phones can render each row as a
// compact card (label left / value right) instead of a horizontally scrolling
// table. Runs automatically after any render via a debounced observer.
function labelTables(root){
  (root||document).querySelectorAll('table').forEach(tbl=>{
    const head=tbl.tHead; if(!head||!head.rows.length) return;
    const hrow=head.rows[head.rows.length-1];
    const labels=[...hrow.cells].map(th=>{const c=th.cloneNode(true);c.querySelectorAll('span,i').forEach(s=>s.remove());return c.textContent.replace(/[\u2191\u2193\u21C5\u25B2\u25BC]/g,'').replace(/\s+/g,' ').trim();});
    tbl.classList.add('mtbl');
    const hide=(tbl.dataset.mhide||'').split(',').map(s=>s.trim().toLowerCase()).filter(Boolean);
    const body=tbl.tBodies[0]; if(!body) return;
    // which column holds the team/player identity? that column sticks to the left on phones
    const first=body.rows[0];
    if(first){
      let idIdx=[...first.cells].findIndex(c=>c.querySelector('.team-cell,.fr-name,.pname,.tp-name'));
      if(idIdx<0) idIdx=0;
      tbl.classList.remove('stick1','stick2');
      tbl.classList.add(idIdx<=0?'stick1':'stick2');
      if(idIdx===1){
        // round up and include the header cell: a fractional width here is what
        // opens a sliver between the two sticky columns while scrolling
        const hrow0=head.rows[head.rows.length-1];
        const w=Math.ceil(Math.max(first.cells[0].getBoundingClientRect().width,
                                   hrow0?.cells[0]?.getBoundingClientRect().width||0))||34;
        tbl.style.setProperty('--c1w',w+'px');
      }
    }
    [...body.rows].forEach(tr=>{
      [...tr.cells].forEach((td,i)=>{
        const lb=labels[i]||'';
        if(td.getAttribute('data-label')!==lb) td.setAttribute('data-label',lb);
        if(hide.length){ const h=hide.includes(lb.toLowerCase()); td.classList.toggle('mhide',h); if(hrow.cells[i]) hrow.cells[i].classList.toggle('mhide',h); }
        if(td.querySelector('.team-cell .team-sub')) td.classList.add('has-abbr');
        // the cell holding the team/player identity becomes the card title
        if(td.querySelector('.team-cell,.fr-name,.pname,.tp-name')) td.classList.add('mtd-title');
      });
    });
  });
}
let _mtblTimer=null;
function initMobileTables(){
  const run=()=>{ try{ labelTables(document); applyShortNames(document); seasonLabel(); tradeScopeLabel(); tenureNameWidth(); badBeatCols(); stripeProfileStats(); }catch(e){} };
  run();
  const target=document.querySelector('main')||document.body;
  new MutationObserver(()=>{ clearTimeout(_mtblTimer); _mtblTimer=setTimeout(run,120); })
    .observe(target,{childList:true,subtree:true});
  // keep the sticky name-column offset correct through resize / rotation
  window.addEventListener('resize',()=>{ clearTimeout(_mtblTimer); _mtblTimer=setTimeout(()=>{run(); setPageBg(_activeTab);},150); });
  window.addEventListener('orientationchange',()=>setTimeout(run,250));
}
function switchTab(name){
  _activeTab=name;
  document.documentElement.dataset.tabaccent=name;   // each tab drives the page accent
  setPageBg(name);
  document.querySelectorAll('.tab-btn').forEach(b=>b.classList.toggle('active',b.dataset.tab===name));
  document.querySelectorAll('.tab-page').forEach(p=>p.classList.toggle('active',p.id==='page-'+name));
  /* Cleared before the per-tab renders below, not after: a renderer that fills
     the aside would otherwise have its work wiped on the way out. */
  {const a=document.getElementById('page-h1-aside'); if(a) a.innerHTML='';}
  if(name==='tenure') ensureTenure();
  if(name==='roster') renderRoster();
  if(name==='week') renderWeek();
  if(name==='draft') ensureDraft();
  if(name==='trades') renderTradesTab();
  if(name==='teams') renderProfile();
  if(name==='schedule') renderSchedule();
  if(name==='punishment') renderPunishment();
  if(name==='standings') setStatsView(_statsView);
  if(name==='badbeat') renderBadBeat();
  if(name==='messages') initMessages();
  if(name==='profile') renderMyProfile();
  if(name==='history'){ renderHistoryTable(); loadHistoryScorers().then(()=>{ if(_activeTab==='history') renderHistoryTable(); }); }
  if(name==='home'){ liveStart(); renderHomeMessage(); wireVidRail(); } else liveStop();   // the live board lives on the homepage
  if(name==='book'){ renderBook(); initBets(); } else if(typeof sbShowPortal==='function') sbShowPortal(false);
  if(name==='legacy'){
    // phones always open on Champions; the sub-tab highlight is re-applied because
    // switchTab clears .active from every .tab-btn on the page
    if(window.matchMedia('(max-width:768px)').matches) _lhView='records';
    setLHView(_lhView);
  }
  const h1=document.getElementById('page-h1');
  /* the label lives in a span so the gradient sizes to the text, not the rule */
  if(h1){ const s=h1.querySelector('span')||h1; s.textContent=TAB_LABELS[name]||''; }
  buildSectionNav(name);
  watchSectionNav(name);
  /* A new tab always opens at the top. Without this the browser keeps the
     scroll position from the tab you just left, so arriving after a jump chip
     dropped you mid-page. scroll-behavior is suspended for the reset so it
     lands immediately instead of animating back up. */
  (function(){
    const doc=document.scrollingElement||document.documentElement;
    const prev=document.documentElement.style.scrollBehavior;
    document.documentElement.style.scrollBehavior='auto';
    doc.scrollTop=0;
    requestAnimationFrame(()=>{ document.documentElement.style.scrollBehavior=prev; });
    setTimeout(()=>{ document.documentElement.style.scrollBehavior=prev; },80);
  })();
  updateTabDD(name);
  scrollNavToActive();
}
// phones: keep the selected pill centred in the scrolling nav
function scrollNavToActive(smooth){
  const bar=document.getElementById('tabbar'); if(!bar) return;
  if(bar.scrollWidth<=bar.clientWidth+1) return;              // nothing to scroll
  const btn=bar.querySelector('.tab-btn.active'); if(!btn) return;
  const target=Math.max(0,Math.min(bar.scrollWidth-bar.clientWidth,
    btn.offsetLeft-(bar.clientWidth-btn.offsetWidth)/2));
  // only ever scroll the strip itself — scrollIntoView() would also scroll the
  // page, which is what kept snapping the view back to the top
  if(smooth!==false&&bar.scrollTo){ try{ bar.scrollTo({left:target,behavior:'smooth'}); }catch(e){} }
  else bar.scrollLeft=target;
  // some engines ignore smooth scrollTo on a freshly shown element — set it too
  requestAnimationFrame(()=>{ if(Math.abs(bar.scrollLeft-target)>2) bar.scrollLeft=target; });
}
// ── MOBILE TAB DROPDOWN (replaces hamburger) ─────────────────────────────────
let _ddSig='';
function buildTabDD(){
  const menu=document.getElementById('tab-dd-menu'); if(!menu) return;
  const btns=[...document.querySelectorAll('#tabbar .tab-btn')].filter(b=>b.style.display!=='none');
  const sig=btns.map(b=>b.dataset.tab).join(',');
  if(sig===_ddSig&&menu.children.length){ syncTabDDActive(); return; }   /* already built */
  _ddSig=sig;
  menu.innerHTML=btns.map(b=>{
    const tab=b.dataset.tab;
    const icon=(b.querySelector('i')||{}).className||'fa fa-circle';
    const label=b.textContent.trim();
    const tc=TAB_COLORS[tab]||'var(--accent)';
    const active=(tab===_activeTab)?' active':'';
    // a tab marked with data-group opens a new section: rule first, then label
    const div=b.dataset.group
      ? `<div class="tab-dd-sep"><span class="tab-dd-rule"></span><span class="tab-dd-sep-l">${b.dataset.group}</span></div>` : '';
    return div+`<button class="tab-dd-item${active}" data-tab="${tab}" style="--tc:${tc}" onclick="tabDDGo('${tab}')"><i class="${icon}" style="color:${tc}"></i><span>${label}</span></button>`;
  }).join('');
}
function syncTabDDActive(){
  document.querySelectorAll('#tab-dd-menu .tab-dd-item').forEach(i=>i.classList.toggle('active',i.dataset.tab===_activeTab));
}
/* open on pointerdown so the menu appears the instant a finger lands */
let _ddPD=0;
/* the capsule never moves, so its offset is measured off the tap path and cached */
function positionTabDD(){
  const nv=document.getElementById('floatnav'), menu=document.getElementById('tab-dd-menu');
  if(!nv||!menu) return;
  document.documentElement.style.setProperty('--ddtop',Math.round(nv.getBoundingClientRect().bottom+14)+'px');
  menu.style.overflowY=(menu.scrollHeight>menu.clientHeight+1)?'auto':'hidden';
}
function tabDDPointer(e){
  if(e&&e.type==='pointerdown'&&e.button>0) return;
  if(Date.now()-_ddPD<700) return;      /* touchstart and pointerdown both fire */
  _ddPD=Date.now(); toggleTabDD();
}
function tabDDClick(){ if(Date.now()-_ddPD<700) return; toggleTabDD(); }
/* a tap that turns into a drag shouldn't leave the menu open */
document.addEventListener('touchmove',function(e){
  if(!_ddPD||Date.now()-_ddPD>400) return;
  const t=e.touches&&e.touches[0]; if(!t) return;
  const btn=document.getElementById('tab-dd-btn'); if(!btn) return;
  const r=btn.getBoundingClientRect();
  if(t.clientY<r.top-30||t.clientY>r.bottom+30) toggleTabDD(false);   /* no-ops when closed */
},{passive:true});
let _navLockY=0;
let _navLocked=false;
function navLock(on){
  const html=document.documentElement, body=document.body;
  if(!!on===_navLocked) return;          /* never touch scroll unless the state changes */
  _navLocked=!!on;
  if(on){
    _navLockY=window.scrollY||window.pageYOffset||0;
    html.classList.add('nav-lock'); body.classList.add('nav-lock');
    body.style.position='fixed'; body.style.top=(-_navLockY)+'px';
    body.style.left='0'; body.style.right='0'; body.style.width='100%';
  }else{
    html.classList.remove('nav-lock'); body.classList.remove('nav-lock');
    body.style.position=''; body.style.top=''; body.style.left=''; body.style.right=''; body.style.width='';
    window.scrollTo(0,_navLockY);
  }
}
function toggleTabDD(open){
  const menu=document.getElementById('tab-dd-menu'); if(!menu) return;
  const show=(open===undefined)?!menu.classList.contains('show'):!!open;
  if(show===menu.classList.contains('show')) return;   /* already in that state */
  if(show) buildTabDD();
  menu.classList.toggle('show',show);
  navLock(show);
  const scrim=document.getElementById('nav-scrim'); if(scrim) scrim.classList.toggle('show',show);
  const b=document.getElementById('tab-dd-btn'); if(b) b.classList.toggle('open',show);

}
function tabDDGo(tab){ toggleTabDD(false); switchTab(tab); window.scrollTo(0,0); }
/* ── KEEP THE PAGE STILL ON CLICK ────────────────────────────────────────────
   Sub-tabs, filters and sort headers re-render whole panels, so the browser's
   scroll anchoring can leave you somewhere else on the page. Pin the control
   you clicked: measure where it sits in the viewport, then put it back. */
const STILL_SEL='.tab-btn,.filter-btn,.week-btn,.hl-tab,.dr-vtab,.dr-sbtn,.bracket-btn,.sb-odds,'
  +'.dm-sort,thead th,.tc-scope,.trade-scope,.dr-scope,.lq-sort,.liq-sort,.st-sort,summary';
function keepStill(el){
  if(!el) return;
  /* re-renders replace the button itself, so also pin a container that survives */
  const box=el.closest('.sec,.card,.tab-page')||el.parentElement;
  const bEl=el.getBoundingClientRect().top, bBox=box?box.getBoundingClientRect().top:null;
  const fix=()=>{
    const live=document.body.contains(el)?el:(box&&document.body.contains(box)?box:null);
    if(!live) return;
    const base=(live===el)?bEl:bBox;
    const d=live.getBoundingClientRect().top-base;
    if(Math.abs(d)>1&&Math.abs(d)<4000) window.scrollBy(0,d);
  };
  requestAnimationFrame(fix); setTimeout(fix,90); setTimeout(fix,260);
}
document.addEventListener('click',function(e){
  if(document.getElementById('tab-dd-menu')?.classList.contains('show')) return;  /* nav handles itself */
  const el=e.target.closest(STILL_SEL);
  if(!el||!el.closest('main')) return;
  if(el.closest('#tab-dd')||el.closest('#tabbar')) return;   /* main nav intentionally goes to top */
  keepStill(el);
},true);

document.addEventListener('click',e=>{
  const menu=document.getElementById('tab-dd-menu');
  if(!menu||!menu.classList.contains('show')) return;
  if(e.target.closest('#tab-dd')||e.target.closest('#tab-dd-menu')) return;
  toggleTabDD(false);
},true);
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
  requestAnimationFrame(positionTabDD);
}
document.addEventListener('click',function(e){ const dd=document.getElementById('tab-dd'), mn=document.getElementById('tab-dd-menu');
  if(!mn||!mn.classList.contains('show')) return;
  if(dd&&!dd.contains(e.target)&&!(mn&&mn.contains(e.target))) toggleTabDD(false); });

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
        <div class="modal-total-left"><div class="label">Coaching Metric Score</div></div>
        <div class="modal-total-score" style="color:${s>0?'var(--green)':s<0?'var(--red)':'var(--text2)'}">${s.toFixed(3)}</div>
      </div>
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
      <div class="modal-total-left"><div class="label">Coaching Metric Score</div></div>
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
/* Two views only. Standings is unchanged; Coaching Metric collects the ranked
   list from the homepage plus the three breakdowns that used to be their own
   sub-tabs, stacked as sections so the jump chips can move between them. */
function setStatsView(v){
  if(v==='c2'||v==='c3'||v==='liq') v='cm';        // old sub-tabs fold into one
  _statsView=v;
  document.querySelectorAll('#stats-subtabs .tab-btn').forEach(b=>b.classList.toggle('active',b.dataset.view===v));
  const st=document.getElementById('stats-standings'), cm=document.getElementById('stats-cm');
  if(st)st.style.display=v==='standings'?'':'none';
  if(cm)cm.style.display=v==='cm'?'':'none';
  if(v==='cm'){
    renderStatsCM();
    renderC2Breakdown();
    renderC3Breakdown();
    renderLineupIQ();
  }
  buildSectionNav('standings');                    // views differ in section count
  if(v==='cm') showCMSection(_cmSection);          // one section at a time, overall first
}
/* the homepage's ranked coaching-metric list, reused here */
function renderStatsCM(){
  const el=document.getElementById('stats-cm-list'); if(!el) return;
  if(_cmMode==='none'){ el.innerHTML=`<div class="tab-loading" style="padding:26px">No coaching metric data for the ${getSeason()} season.</div>`; return; }
  const ranked=_teams.slice().sort((a,b)=>(_scores[b.id]||0)-(_scores[a.id]||0));
  const mx=Math.max(1,...Object.values(_scores).map(v=>Math.abs(v||0)));
  const bar=v=>Math.min(100,Math.max(0,((v/mx)+1)/2*100)).toFixed(1);
  const col=v=>v>mx*0.15?'var(--green)':v<-mx*0.15?'var(--red)':'var(--text2)';
  el.innerHTML=ranked.map((t,i)=>{
    const s=_scores[t.id]||0;
    return `<div class="coaching-row" onclick="openCMModal(${t.id})">
      <div class="coaching-rank">${i===0?'🥇':i+1}</div>
      ${logoImg(t.id)}
      <div class="coaching-info"><div class="coaching-name">${t.name}</div><div class="coaching-sub">${t.wins}W · ${t.losses}L · ${t.pf.toFixed(0)} PF</div></div>
      <div class="coaching-bar"><div class="coaching-bar-fill" style="width:${bar(s)}%;background:${col(s)}"></div></div>
      <div class="coaching-score" style="color:${col(s)}">${s.toFixed(2)}</div>
      <div class="coaching-chevron"><i class="fa fa-chevron-right"></i></div>
    </div>`;
  }).join('');
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
  el.innerHTML=`<div style="font-size:12px;color:var(--text3);margin:0 2px 12px;line-height:1.6"><b>C2</b> = points gained from players traded for minus those traded away, counted from the week after each trade.</div>`+
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
    <div style="font-size:12px;color:var(--text3);margin:0 2px 12px;line-height:1.6"><b>C3</b> = lineup points each waiver pickup scored, divided by what it cost to win the bid.</div>
    <div class="picker-bar" style="padding:0 2px 14px">
      <label for="c3-team-select" style="font-size:13px;color:var(--text3)">Team:</label>
      <select id="c3-team-select" onchange="_c3Team=this.value;renderC3Breakdown()">${opts}</select>
    </div>
    ${t?`<div class="hist-item">
      <div class="brk-head"><span class="fr-name">${logoImg(t.id)} ${t.name}</span><span class="brk-val" style="color:${cc(bd.c3)}">C3 ${bd.c3>=0?'+':''}${(bd.c3||0).toFixed(2)}</span></div>
      ${picks.length?`<div class="tscroll"><table class="min560 srt" style="margin-top:4px" data-mhide="Next,Margin">
        <thead><tr><th>Pickup</th><th class="right">Wk</th><th class="right">Bid</th><th class="right">Next</th><th class="right">Margin</th><th class="right">Lineup pts</th><th class="right">Ratio</th></tr></thead>
        <tbody>${picks.map(w=>{const mar=Math.max(w.margin??w.bid,1);return `<tr>
          <td><span class="pname">${playerImg(w.pid,20,pName(w.pid))}<span>${pName(w.pid)}</span>${w.est?'<span class="est-tag" style="color:var(--text3);font-size:12px"> est.</span>':''}</span></td>
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
// ── LINEUP IQ ────────────────────────────────────────────────────────────────
// % of start/sit calls that matched the optimal lineup + points left on the
// bench. Only regular-season weeks, and only slots where the roster actually
// held another eligible option.
let _liq={};                 // season -> { teamId: {weeks,decisions,correct,missed} }
let _liqLoading={};
function liqOf(teamId){ const d=_liq[getSeason()]; return d?d[teamId]:null; }
function loadLineupIQ(){
  const season=getSeason();
  if(_liq[season]||_liqLoading[season]) return;
  _liqLoading[season]=true;
  histJSON('lineupiq',season,`${BASE}?type=lineupiq&seasonId=${season}&v=1`)
    .then(d=>{ _liq[season]=(d&&d.teams)||{}; })
    .catch(()=>{ _liq[season]={}; })
    .finally(()=>{ _liqLoading[season]=false;
      if(getSeason()!==season) return;
      if(document.getElementById('stats-liq')) renderLineupIQ();
      if(_activeTab==='teams'&&document.getElementById('profile-body')) renderProfile(); });
}
function renderLineupIQ(){
  const el=document.getElementById('stats-liq'); if(!el) return;
  const season=getSeason(), data=_liq[season];
  if(!data){ loadLineupIQ();
    el.innerHTML=`<div class="tab-loading"><i class="fa fa-circle-notch"></i>Rebuilding every optimal lineup of the ${season} season…</div>`; return; }
  const rows=_teams.map(t=>{const d=data[t.id]; return d&&d.decisions?{t,d,pct:d.correct/d.decisions*100}:null;})
    .filter(Boolean);
  rows.sort((a,b)=>{
    const v=_liqSort.col==='miss'?[a.d.missed,b.d.missed]:[a.pct,b.pct];
    return _liqSort.asc?v[0]-v[1]:v[1]-v[0];
  });
  const arr=c=>_liqSort.col===c?(_liqSort.asc?'\u2191':'\u2193'):'\u21C5';
  const sh=(c,label,cls)=>`<span class="${cls||''} liq-sort${_liqSort.col===c?' sorted':''}" onclick="sortLIQ('${c}')">${label} <span class="liq-arw">${arr(c)}</span></span>`;
  if(!rows.length){ el.innerHTML=`<div class="tab-loading">No weekly roster data for the ${season} season.</div>`; return; }
  const worst=Math.max(...rows.map(r=>r.d.missed))||1;
  el.innerHTML=`<div style="font-size:12px;color:var(--text3);margin:0 2px 14px;line-height:1.6"><b>Lineup IQ</b> = the share of start/sit calls that matched the optimal lineup, with <b>Missed points</b> the difference in score.</div>
  <div class="liq-list">
    <div class="liq-row liq-head"><span>#</span><span>Team</span>${sh('pct','Lineup IQ','right')}<span class="liq-barcell">Correct calls</span>${sh('miss','Missed pts','right')}</div>
    ${rows.map((r,i)=>`<div class="liq-row">
      <span class="liq-rk">${i+1}</span>
      <span class="liq-team"><div class="team-cell">${logoImg(r.t.id)}<div class="team-info"><div class="team-name tlink" data-tid="${r.t.id}">${r.t.name}</div><div class="team-sub">${r.t.abbrev}</div></div></div></span>
      <span class="right liq-pct" style="color:${liqColor(r.pct)}">${r.pct.toFixed(1)}%</span>
      <span class="liq-barcell"><span class="liq-bar"><span class="liq-bar-fill" style="width:${r.pct.toFixed(1)}%;background:${liqColor(r.pct)}"></span></span><span class="liq-frac">${r.d.correct} / ${r.d.decisions}</span></span>
      <span class="right liq-miss" style="opacity:${(0.45+0.55*r.d.missed/worst).toFixed(2)}">${r.d.missed.toFixed(1)}</span>
    </div>`).join('')}
  </div>`;
}
let _liqSort={col:'pct',asc:false};
function sortLIQ(col){ _liqSort={col,asc:_liqSort.col===col?!_liqSort.asc:false}; renderLineupIQ(); } // first click = highest first, like every other table
function liqPct(teamId){ const d=_liq[getSeason()]?.[teamId]; return (d&&d.decisions)?(d.correct/d.decisions*100):null; }
/* Fixed colours, deliberately not var(--accent): this tier used to inherit the
   tab accent, which turned every good score purple the moment Advanced Stats
   became a purple tab. Blue is the tier above green — only 2023's 86.0 has
   cleared it so far. */
function liqColor(p){ return p>=85?'#5A89E8':p>=78?'var(--green)':p>=72?'#E0B67B':'var(--red)'; }
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
let _hmSort={col:null,asc:false};
function sortHM(col){
  const list=document.querySelector('.hm-list'); if(!list) return;
  const asc=(_hmSort.col===col)? !_hmSort.asc : (col===0);   // text asc first, numbers desc first
  _hmSort={col,asc};
  const rows=[...list.querySelectorAll('.hm-row:not(.hm-head)')];
  const val=r=>{const c=r.children[col]; const v=c?.dataset.v ?? c?.textContent ?? '';
    const n=parseFloat(v); return (v!==''&&!isNaN(n))?n:String(v).toLowerCase();};
  rows.sort((a,b)=>{const x=val(a),y=val(b);
    if(typeof x==='number'&&typeof y==='number') return asc?x-y:y-x;
    return asc?String(x).localeCompare(String(y)):String(y).localeCompare(String(x));});
  rows.forEach(r=>list.appendChild(r));
  list.querySelectorAll('.hm-head .hm-sort').forEach((s,i)=>{
    s.classList.toggle('sorted',i===col);
    const arw=s.querySelector('.hm-arw'); if(arw) arw.textContent=(i===col)?(asc?' ↑':' ↓'):'';
  });
}
let _histSort={col:null,asc:false};
// Sort the desktop matchup-history table while keeping each expandable
// detail row glued to the opponent row it belongs to.
function sortHistTable(col){
  const tbl=document.querySelector('#page-history table'); if(!tbl) return;
  const body=tbl.tBodies[0]; if(!body) return;
  const asc=(_histSort.col===col)? !_histSort.asc : (col===0);
  _histSort={col,asc};
  const pairs=[];
  [...body.rows].forEach(r=>{
    if(r.classList.contains('h2h-detail')){ if(pairs.length) pairs[pairs.length-1].detail=r; }
    else pairs.push({main:r,detail:null});
  });
  const val=r=>{const c=r.cells[col]; if(!c) return '';
    const t=c.textContent.replace(/[↑↓]/g,'').trim();
    const n=parseFloat(t.replace(/[^0-9.\-]/g,''));
    return (/[0-9]/.test(t)&&!isNaN(n))?n:t.toLowerCase();};
  pairs.sort((p,q)=>{const x=val(p.main),y=val(q.main);
    if(typeof x==='number'&&typeof y==='number') return asc?x-y:y-x;
    return asc?String(x).localeCompare(String(y)):String(y).localeCompare(String(x));});
  pairs.forEach(p=>{body.appendChild(p.main); if(p.detail) body.appendChild(p.detail);});
  tbl.querySelectorAll('thead .hs-th').forEach((th,i)=>{
    th.classList.toggle('sorted',i===col);
    const arw=th.querySelector('.hs-arw'); if(arw) arw.textContent=(i===col)?(asc?' ↑':' ↓'):'';
  });
}
function histMobileHTML(owner,rows,hasT){
  const abbr=fr=>{const t=_teams.find(x=>_ownerMap[x.id]===fr.owner); return (t&&t.abbrev)||teamInitials(fr.name);};
  const cols=['Team','W','L','Win%','PF','PA'];
  const head=`<div class="hm-row hm-head">${cols.map((c,i)=>`<span class="${i===0?'hm-team ':''}hm-sort" data-col="${i}" onclick="sortHM(${i})">${c}<i class="hm-arw"></i></span>`).join('')}</div>`;
  const body=rows.map(r=>`<div class="hm-row">
      <span class="hm-team" data-v="${abbr(r.opp)}">${franchiseAvatar(r.opp,22,6)}<span class="hm-ab">${abbr(r.opp)}</span></span>
      <span class="hm-w" data-v="${r.w}">${r.w}</span>
      <span class="hm-l" data-v="${r.l}">${r.l}</span>
      <span class="hm-pct" data-v="${r.pct}" style="color:${r.pct>=0.5?'var(--green)':'var(--red)'}">${(r.pct*100).toFixed(0)}%</span>
      <span class="hm-pf" data-v="${r.pf}">${r.pf.toFixed(0)}</span>
      <span class="hm-pa" data-v="${r.pa}">${r.pa.toFixed(0)}</span>
    </div>`).join('');
  return `<div class="hm-list">${head}${body}</div>`;
}
function pastMatchupsHTML(owner,me,rows){
  const abbr=fr=>{const t=_teams.find(x=>_ownerMap[x.id]===fr.owner); return (t&&t.abbrev)||teamInitials(fr.name);};
  const myAb=me?abbr(me):'';
  const blocks=rows.map(r=>{
    const games=h2hGames(owner,r.opp.owner);
    if(!games.length) return '';
    const lines=games.map(g=>{
      const win=g.myScore>g.oppScore;
      return `<div class="pm-row">
        <span class="pm-when">${g.season} · Wk ${g.week}</span>
        <span class="pm-team ${win?'w':'l'}">${franchiseAvatar(me,20,5)}<span class="pm-ab">${myAb}</span><b>${g.myScore.toFixed(1)}</b></span>
        <span class="pm-dash">–</span>
        <span class="pm-team ${win?'l':'w'}"><b>${g.oppScore.toFixed(1)}</b><span class="pm-ab">${abbr(r.opp)}</span>${franchiseAvatar(r.opp,20,5)}</span>
      </div>`;}).join('');
    return `<details class="pm-group">
      <summary>${franchiseAvatar(r.opp,24,6)}<span class="pm-opp">${r.opp.name}</span>
        <span class="pm-rec">${r.w}–${r.l}${r.t?`–${r.t}`:''}</span><i class="fa fa-chevron-down pm-caret"></i></summary>
      <div class="pm-list">${lines}</div>
    </details>`;}).join('');
  if(!blocks) return '';
  return `<div class="pm-section">
    <div class="sec-head" style="font-size:15px;margin-top:20px"><i class="fa fa-clock-rotate-left"></i>Past Matchups</div>
    <div class="pm-wrap">${blocks}</div>
  </div>`;
}
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
      <div class="h2h-total-main">
        <div class="h2h-total-rec">${tw}–${tl}${tt?`–${tt}`:''}</div>
        <div class="h2h-total-pct" style="color:${tpct>=0.5?'var(--green)':'var(--red)'}">${(tpct*100).toFixed(1)}%</div>
      </div>
      <div class="h2h-total-pfpa">
        <div class="htp"><span class="htp-l">PF</span><span class="htp-v" style="color:var(--green)">${tpf.toFixed(1)}</span></div>
        <div class="htp"><span class="htp-l">PA</span><span class="htp-v" style="color:var(--red)">${tpa.toFixed(1)}</span></div>
      </div>
    </div>
    ${rows.length?`${histMobileHTML(owner,rows,!!tt)}<div class="hint-tap" style="font-size:12px;color:var(--text3);margin:0 2px 8px">Tap a team to see every head-to-head game.</div><div class="tscroll hist-tbl"><table class="min560">
      <thead><tr>${['Opponent','W','L',...(tt?['T']:[]),'Win %','PF','PA'].map((c,i)=>`<th class="hs-th${i?' right':''}" data-col="${i}" onclick="sortHistTable(${i})">${c}<i class="hs-arw"></i></th>`).join('')}</tr></thead>
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
    </table></div>`:`<div class="tab-loading">No games found for this team.</div>`}
    ${rows.length?pastMatchupsHTML(owner,me,rows):''}`;
}

// ── PLAYER TENURE TAB ──────────────────────────────────────────────────────────
let _tenurePromise=null;
async function loadTenureData(){
  if(_tenure) return _tenure;
  if(_tenurePromise) return _tenurePromise;
  _tenurePromise=(async()=>{
    const results=await Promise.allSettled(ALL_SEASONS.map(async s=>{
      const d=await histJSON('tenure',s,`${BASE}?type=seasontenure&seasonId=${s}&v=9`);
      if(!d) return null;
      return {s, d};
    }));
    const tenure={},poGP={};
    results.forEach(rr=>{
      if(rr.status!=='fulfilled'||!rr.value) return;
      const {s,d}=rr.value;
      const owners=_seasonMeta[s]?.owners||{};
      // bracket games each team actually played that postseason, by owner
      Object.entries(d.poGP||{}).forEach(([tid,n])=>{
        (poGP[s]||(poGP[s]={}))[owners[tid]||`team:${tid}`]=n||0;
      });
      Object.entries(d.teams||{}).forEach(([tid,players])=>{
        const owner=owners[tid]||`team:${tid}`;
        const bucket=tenure[owner]||(tenure[owner]={});
        Object.entries(players).forEach(([pid,rec])=>{
          const p=bucket[pid]||(bucket[pid]={n:rec.n,pos:rec.pos,wAll:0,sAll:0,pAll:0,spAll:0,pwAll:0,seasons:{}});
          if(rec.n) p.n=rec.n;
          if(p.pos==null) p.pos=rec.pos;
          p.wAll+=rec.w||0; p.sAll+=rec.s||0; p.pAll+=rec.p||0; p.spAll+=rec.sp||0; p.pwAll+=rec.pw||0;
          p.seasons[s]={w:rec.w||0,s:rec.s||0,p:rec.p||0,sp:rec.sp||0,pw:rec.pw||0,pg:rec.pg||0};
        });
      });
    });
    _tenure=tenure; _tenurePoGP=poGP;
    return _tenure;
  })();
  return _tenurePromise;
}
async function ensureTenure(){
  showTenureSection(_tnSection);            // one view at a time, from the off
  if(_tenure){renderTenureTable();return;}
  const body=document.getElementById('tenure-body');
  if(body) body.innerHTML=`<div class="tab-loading"><i class="fa fa-circle-notch"></i>Crunching every roster from every week of every season…<br><span style="font-size:12px;color:var(--text3)">first load takes a moment — it's cached after that</span></div>`;
  try{ await loadTenureData(); }
  catch(e){ if(body) body.innerHTML=`<div class="tab-loading" style="color:var(--red)">Failed to load roster history: ${e.message}</div>`; return; }
  renderTenureTable();
  showTenureSection(_tnSection);
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
  body.innerHTML=shown.length?`<div class="tscroll"><table class="min640 srt tenure-tbl" data-mhide="All Rostered,${yr} Rostered">
    <thead>
      <tr>
        <th>Player</th>
        <th class="right" title="Weeks in the starting lineup, every season">All Starts</th>
        <th class="right" title="Weeks on the roster (starter or bench), every season">All Rostered</th>
        <th class="right" title="Points scored for GFL teams, every season">All PTS</th>
        <th class="right" title="Weeks in the starting lineup">${yr} Starts</th>
        <th class="right" title="Weeks on the roster (starter or bench)">${yr} Rostered</th>
        <th class="right" title="Points scored in ${yr}">${yr} PTS</th>
        <th class="right" title="Playoff games won while started for this team">Playoff Wins</th>
      </tr>
    </thead>
    <tbody>${shown.map((p,i)=>`
      <tr>
        <td><span class="pname"><span class="rank" style="margin-right:4px">${i+1}</span>${playerImg(p.pid,22,p.n)}<span class="fr-name">${p.n}</span></span></td>
        <td class="right"><strong>${p.sAll}</strong></td>
        <td class="right" style="color:var(--text2)">${p.wAll}</td>
        <td class="right pf">${p.pAll.toFixed(1)}</td>
        <td class="right"><strong>${p.sYr||dash}</strong></td>
        <td class="right" style="color:var(--text2)">${p.wYr||dash}</td>
        <td class="right" style="color:var(--text2)">${p.wYr?p.pYr.toFixed(1):dash}</td>
        <td class="right" style="color:var(--accent);font-weight:600">${p.pwAll||dash}</td>
      </tr>`).join('')}</tbody>
  </table></div>${players.length>50?`<div style="padding:12px 2px;font-size:12px;color:var(--text3)">Showing top 50 of ${players.length} — use search to find others.</div>`:''}
  <div style="padding:4px 2px 16px;font-size:12px;color:var(--text3)"><b>Started</b> = weeks in the active lineup · <b>Rostered</b> = weeks on the roster (starter or bench). Bye weeks and weeks a player was on IR or ruled out are not counted.</div>`
  :`<div class="tab-loading">No players found${q?` matching “${q}”`:''}.</div>`;
  try{ renderTenureHardware(); }catch(e){}
}


/* ── PLAYOFF HARDWARE (player tenure, composite) ───────────────────────────
   Deliberately team-agnostic: a player's playoff wins and rings are summed
   across every roster they ever sat on, so the team dropdown above does not
   filter this section.
   playoff wins  = weeks the player was in the STARTING lineup for a team that
                   won a playoff game (already computed per season as `pw`).
   championships = seasons where the player started ANY playoff game on the
                   title team's run — one start is enough. Bench weeks still
                   earn nothing. `pg` counts started bracket games, taken from
                   the traced winners' bracket rather than ESPN's unreliable
                   playoffSeed. */
let _hwSort='rings';
function champOwnerBySeason(){
  const out={};
  ALL_SEASONS.forEach(s=>{
    const T=_seasonMeta[s]?.teams||{};
    for(const tid in T){ if(T[tid].rank===1){ out[s]=T[tid].owner; break; } }
  });
  return out;
}
function tenureHardwareRows(){
  if(!_tenure) return [];
  const champ=champOwnerBySeason(), agg={};
  Object.entries(_tenure).forEach(([owner,players])=>{
    Object.entries(players).forEach(([pid,p])=>{
      const a=agg[pid]||(agg[pid]={pid,n:p.n||`Player #${pid}`,pos:p.pos,pw:0,rings:[]});
      if(p.n) a.n=p.n;
      Object.entries(p.seasons||{}).forEach(([y,d])=>{
        a.pw+=d.pw||0;
        if(champ[y]===owner && (d.pg||0)>0) a.rings.push(y);
      });
    });
  });
  const rows=Object.values(agg).filter(a=>a.rings.length||a.pw).map(a=>{ a.rings.sort(); return a; });
  return _hwSort==='pw'
    ? rows.sort((x,y)=>y.pw-x.pw||y.rings.length-x.rings.length||x.n.localeCompare(y.n))
    : rows.sort((x,y)=>y.rings.length-x.rings.length||y.pw-x.pw||x.n.localeCompare(y.n));
}
function setHwSort(k){ _hwSort=k; renderTenureHardware(); }
function renderTenureHardware(){
  const box=document.getElementById('tenure-hw'); if(!box) return;
  const rows=tenureHardwareRows();
  if(!rows.length){ box.innerHTML='<div class="tab-loading">No playoff results yet.</div>'; return; }
  const ringYears=r=>r.rings.map(y=>`<span class="hw-yr">'${String(y).slice(2)}</span>`).join('');
  const dash='<span style="color:var(--text3)">—</span>';
  box.innerHTML=`<div class="hw-sort">
      <span>Sort</span>
      <button class="filter-btn ${_hwSort==='rings'?'active':''}" onclick="setHwSort('rings')">Titles</button>
      <button class="filter-btn ${_hwSort==='pw'?'active':''}" onclick="setHwSort('pw')">Playoff Wins</button>
    </div>
    <div class="hw-head">
      <span>Player</span><span class="right">Titles</span>
      <span class="hw-when">Won</span><span class="right">Playoff Wins</span>
    </div>
    ${rows.map((r,i)=>`<div class="hw-row">
      <span class="hw-p"><span class="rank">${i+1}</span>${playerImg(r.pid,22,r.n)}<span class="fr-name">${r.n}</span></span>
      <span class="right hw-rings">${r.rings.length?`<i class="fa fa-trophy"></i>${r.rings.length}`:dash}</span>
      <span class="hw-when">${r.rings.length?ringYears(r):dash}</span>
      <span class="right hw-pw">${r.pw||dash}</span>
    </div>`).join('')}
    <div style="padding:10px 2px 16px;font-size:12px;color:var(--text3)">
      <b>Playoff Wins</b> = weeks started for a team that won a playoff game, every team a player has been on.
      <b>Titles</b> = seasons they started a playoff win for that year's champion.</div>`;
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
/* abbreviation, so both sides of a trade fit side by side on a phone */
/* Green through amber to red, stretched to the trades actually on screen.
   A fixed 0-100% mapping wasted most of the range: real splits cluster between
   about 50% and 75%, so everything came out a muted mid-tone. _tradeSpread is
   the widest gap from even in the current filter group, so the most lopsided
   trade in view anchors full green against full red and everything else scales
   between. It is recomputed per filter, so the colours always describe the set
   being looked at rather than a theoretical 0-100. */
const TRADE_RED='#fb7185', TRADE_AMBER='#f4c04d', TRADE_GREEN='#4ade80';
let _tradeSpread=0.5;
function mixHex(a,b,t){
  const p=h=>[parseInt(h.slice(1,3),16),parseInt(h.slice(3,5),16),parseInt(h.slice(5,7),16)];
  const [r1,g1,b1]=p(a),[r2,g2,b2]=p(b);
  const c=(x,y)=>Math.round(x+(y-x)*t);
  return `rgb(${c(r1,r2)},${c(g1,g2)},${c(b1,b2)})`;
}
function tradeShareColor(share){
  const d=Math.max(0.02,_tradeSpread);                  // guard an all-even set
  const t=Math.min(1,Math.max(0,0.5+(share-0.5)/(2*d)));
  return t>=0.5 ? mixHex(TRADE_AMBER,TRADE_GREEN,(t-0.5)/0.5)
                : mixHex(TRADE_RED,TRADE_AMBER,t/0.5);
}
/* the same colour as a low-alpha wash for the panel behind each side */
function tradeShareTint(share){
  return tradeShareColor(share).replace('rgb(','rgba(').replace(')',',0.11)');
}
function tradeTeamAb(season,teamId){
  const o=_seasonMeta[season]?.owners?.[teamId];
  return drAbbr(o,tradeTeamName(season,teamId));
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
  const _cnt=document.getElementById('trade-count');
  if(_cnt){
    const _sc=_tradeScope==='alltime'?'all-time':String(getSeason());
    const _tm=_tradeTeamFilter?((_franchises.find(f=>f.owner===_tradeTeamFilter)?.name)||''):'';
    _cnt.innerHTML=`<span class="tc-num">${list.length}</span><span class="tc-lbl">${list.length===1?'trade':'trades'} · ${_sc}${_tm?' · '+_tm:''}</span>`;
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
  /* anchor the colour scale to this filter group before drawing any of it:
     the widest gap from an even split becomes the full green / full red end */
  _tradeSpread=list.reduce((mx,tr)=>{
    const a=Math.max(tr.a.total,0), b=Math.max(tr.b.total,0);
    if(a+b<=0) return mx;
    return Math.max(mx,Math.abs(Math.max(a,b)/(a+b)-0.5));
  },0);
  body.innerHTML=list.map((tr,i)=>{
    const totA=Math.max(tr.a.total,0),totB=Math.max(tr.b.total,0);
    const aWin=tr.a.total>=tr.b.total;
    const winner=aWin?tr.a:tr.b, loser=aWin?tr.b:tr.a;
    const wShare=(totA+totB)>0?Math.max(tr.a.total,tr.b.total)/(totA+totB):0.5;
    const wPct=Math.min(0.96,Math.max(0.04,wShare));
    /* Same A+→F ramp the rest of the site grades on, so a lopsided trade reads
       deep green against deep red and a 50/50 one sits neutral for both sides
       rather than every trade being flat green vs flat red. */
    const cW=tradeShareColor(wShare), cL=tradeShareColor(1-wShare);
    const tintW=tradeShareTint(wShare), tintL=tradeShareTint(1-wShare);
    const side=(sd,state)=>{
      const tint=state==='won'?tintW:tintL;
      const pcol=state==='won'?cW:cL;
      return `
      <div class="trade-side ${state}">
        <div class="trade-wl ${state}" style="background:${tint}">
          <div class="trade-team">${tradeTeamAvatar(tr.season,sd.teamId)}<div class="trade-team-name">${tradeTeamAb(tr.season,sd.teamId)}</div></div>
          <div class="trade-recv">received</div>
          ${sd.players.length?sd.players.map(p=>`<div class="trade-player"><span class="tp-name pname">${playerImg(p.pid,18,p.n)}<span>${p.n}</span></span><span class="tp-dots"></span><span class="tp-pts" style="color:${pcol}">${p.pts.toFixed(1)}</span></div>`).join(''):`<div class="trade-player"><span class="tp-name" style="color:var(--text3);font-style:italic">nothing received</span></div>`}
        </div>
      </div>`;};
    const seasonBadge=_tradeScope==='alltime'?`<span class="badge-info" style="margin-left:0">${tr.season}</span>`:'';
    return`<div class="trade-card">
      <div class="trade-head">${seasonBadge}Week ${tr.week} trade</div>
      <!-- two children for two columns: the old divider cell would wrap the
           loser onto a second row now that there is no gap track -->
      <div class="trade-grid">${side(winner,'won')}${side(loser,'lost')}</div>
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
  /* an upcoming season returns a placeholder board (playerId -1) and a stat sheet
     with no points — that isn't a draft, so keep it out of every draft list */
  picks=picks.filter(p=>p&&p.playerId>0);
  if(!picks.length) return [];
  if(!stats.some(p=>(p.pts||0)>0)) return [];
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
/* FAAB left, shown beside the team name on a profile. ESPN reports the budget
   on league settings and the spend on each team, so remaining is the
   difference; the bar is what is left, not what is gone. */
function faabChipHTML(t){
  const budget=_seasonMeta[getSeason()]?.faabBudget||0;
  if(!budget||!t) return '';
  const spent=Math.max(0,Math.min(budget,t.budgetSpent||0));
  const left=budget-spent, pct=budget?left/budget*100:0;
  const col=pct>=50?'var(--green)':pct>=20?'var(--accent)':'var(--red)';
  // vertical gauge on the right of the hero: it fills from the bottom, so the
  // column height reads directly as budget remaining
  return `<div class="prof-faab" title="$${spent} of $${budget} spent">
    <span class="pf-v" style="color:${col}">$${left}</span>
    <div class="pf-bar"><div class="pf-fill" style="height:${pct.toFixed(1)}%;background:${col}"></div></div>
    <span class="pf-l">FAAB</span>
  </div>`;
}
function draftRowTeam(r){
  if(r.owner) return (_franchises.find(f=>f.owner===r.owner)?.name)||(_seasonMeta[r.season]?.names?.[r.owner]?.name)||`Team ${r.teamId}`;
  return (_teams.find(t=>t.id===r.teamId)?.name)||`Team ${r.teamId}`;
}
function draftPickCard(r,i,showSeason){
  return `<div class="draft-row">
    <div class="draft-rankn">${i+1}</div>
    ${playerImg(r.pid,40,r.name)}
    <div class="draft-info">
      <div class="draft-name"><span class="pl-name">${r.name}</span><span class="draft-pos">${r.posName}</span></div>
      <div class="draft-mgr2">${draftRowTeam(r)}${showSeason?` · ${r.season}`:''}</div>
      <div class="draft-line"><b>${r.posName}${r.posDrafted}</b> → ${r.finPos!=null?`<b>${r.posName}${r.finPos}</b>`:'<b>unranked</b>'}</div>
    </div>
    <div class="draft-dwrap"><div class="draft-delta" style="color:${r.delta>0?'var(--green)':r.delta<0?'var(--red)':'var(--text2)'}">${r.delta>0?'+':''}${r.delta}</div><div class="draft-pts">${r.pts.toFixed(1)} pts</div></div>
  </div>`;
}
function draftClassCard(d,i,showSeason,tint){
  const v=(d.val!=null?d.val:d.total);
  const fr=_franchises.find(f=>f.owner===d.owner);
  const graded=tint?' draft-row-graded':'';
  const bstyle=tint?` style="--dtint:${tint}"`:'';
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
function scoreBadge(rel,rank,season,grade,gcol,rankOf){
  const col=gcol||(rel>0?'var(--green)':rel<0?'var(--red)':'var(--text2)');
  /* Draft rank rides the same green-to-red scale as the grade, mapped straight
     off the placing: 1st is an A, last is an F, evenly spaced between. */
  const rcol=(()=>{
    const n=Number(rankOf)||0, r=Number(rank)||0;
    if(!n||!r||n<2) return gradeColor('A');
    const t=1-(r-1)/(n-1);                       // 1 = best placing, 0 = worst
    return gradeColor(PPG_GRADES[Math.round(t*(PPG_GRADES.length-1))]);
  })();
  return `<div class="draft-score-wrap">
    <div class="dgrade"><div class="dgrade-num" style="border-color:${rcol};color:${rcol}">${rank}</div><div class="dgrade-lbl">Draft rank</div></div>
    <div class="dgrade"><div class="dgrade-num" style="border-color:${col};color:${col}">${rel>0?'+':''}${rel.toFixed(0)}</div><div class="dgrade-lbl">Draft Score</div></div>
    ${grade?`<div class="dgrade"><div class="dgrade-num" style="border-color:${col};color:${col}">${grade}</div><div class="dgrade-lbl">Draft Grade</div></div>`:''}
  </div>`;
}
let _dmSort={col:null,asc:false};
function sortDM(col){
  const list=document.querySelector('.dm-list'); if(!list) return;
  const asc=(_dmSort.col===col)? !_dmSort.asc : (col<=2||col===3);
  _dmSort={col,asc};
  const rows=[...list.querySelectorAll('.dm-row:not(.dm-head)')];
  const val=r=>{const c=r.children[col]; const v=c?.dataset.v ?? c?.textContent ?? '';
    const n=parseFloat(v); return (v!==''&&!isNaN(n))?n:String(v).toLowerCase();};
  rows.sort((x,y)=>{const p=val(x),q=val(y);
    if(typeof p==='number'&&typeof q==='number') return asc?p-q:q-p;
    return asc?String(p).localeCompare(String(q)):String(q).localeCompare(String(p));});
  rows.forEach(r=>list.appendChild(r));
  list.querySelectorAll('.dm-head .dm-sort').forEach((s,i)=>{
    s.classList.toggle('sorted',i===col);
    const ar=s.querySelector('.dm-arw'); if(ar) ar.textContent=(i===col)?(asc?' \u2191':' \u2193'):'';
  });
}
// Mobile-only draft list, built on the same pattern as the matchup-history list:
// Round | Pick | Player | Drafted (pos rank) | Finish (pos rank) | Delta
function draftMobileHTML(rows){
  const cols=['Rd','Pick','Player','Draft','Finish','\u0394'];
  const head=`<div class="dm-row dm-head">${cols.map((c,i)=>`<span class="${i===2?'dm-player ':''}dm-sort" data-col="${i}" onclick="sortDM(${i})">${c}<i class="dm-arw"></i></span>`).join('')}</div>`;
  const body=rows.map(r=>{
    const better=r.finPos!=null&&r.finPos<=r.posDrafted;
    return `<div class="dm-row">
      <span class="dm-rd" data-v="${r.round}">${r.round}</span>
      <span class="dm-pick" data-v="${r.overall}">${r.overall}</span>
      <span class="dm-player" data-v="${r.name}">${playerImg(r.pid,20,r.name)}<span class="pl-name">${r.name}</span></span>
      <span class="dm-drafted" data-v="${r.posDrafted}">${r.posName}${r.posDrafted}</span>
      <span class="dm-finish" data-v="${r.finPos!=null?r.finPos:999}" style="color:${r.finPos==null?'var(--text3)':(better?'var(--green)':'var(--red)')}">${r.finPos!=null?r.posName+r.finPos:'\u2014'}</span>
      <span class="dm-delta" data-v="${r.delta}" style="color:${r.delta>0?'var(--green)':r.delta<0?'var(--red)':'var(--text2)'}">${r.delta>0?'+':''}${r.delta}</span>
    </div>`;}).join('');
  return `<div class="dm-list">${head}${body}</div>`;
}
function draftTeamTableHTML(rows,showSeason){
  const totalDelta=rows.reduce((s,r)=>s+r.delta,0);
  return draftMobileHTML(rows)+`<div class="tscroll draft-tbl"><table class="min560 srt">
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
    <!-- no label: this belongs to the Draft Report section above it, and a
         heading here would earn a third jump chip -->
    <div class="section-header" style="padding:13px 16px"><span id="draft-score" style="margin-left:auto"></span></div>
    <div class="picker-bar">
      <label for="draft-team-select">Team:</label>
      <select id="draft-team-select" onchange="_draftTeamSel=this.value;renderDraftTeamTable()">${_teams.map(t=>`<option value="${t.id}" ${Number(_draftTeamSel)===t.id?'selected':''}>${t.name}</option>`).join('')}</select>
    </div>
    <div id="draft-team-body"></div>
  </div>
  <div class="sec-head" style="padding-top:4px"><i class="fa fa-ranking-star"></i>Draft Rankings<span class="badge-info">rankings · all-time drafts · steals &amp; busts</span></div>
  <div id="draft-lists" data-nochip></div>`;
  renderDraftTeamTable();
  renderDraftLists();
}
const DRAFT_VIEWS={
  year:   {grp:'year',  all:false, tab:'Draft Rankings', icon:'fa-ranking-star', col:'var(--accent)',
           title:s=>`Draft Rankings · ${s}`, badge:'vs league average',
           note:'Draft Score is each team’s summed positional Δ against the league average, so higher means they drafted better than the field.'},
  ysteals:{grp:'picks', all:false, tab:'Biggest Steals', icon:'fa-gem', col:'var(--green)',
           title:s=>`Biggest Steals · ${s}`, badge:'beat draft slot',
           note:'Steals are the picks that finished far higher at their position than where they were drafted.'},
  ybusts: {grp:'picks', all:false, tab:'Worst Busts', icon:'fa-heart-crack', col:'var(--red)',
           title:s=>`Worst Busts · ${s}`, badge:'first 6 rounds',
           note:'Busts are early picks (first six rounds) that finished well below their draft slot at their position.'},
  best:   {grp:'drafts',all:true,  tab:'Best Drafts', icon:'fa-trophy', col:'var(--green)',
           title:()=>'Best Drafts Ever', badge:'positional Δ',
           note:'Every team-season ranked by raw draft score.'},
  worst:  {grp:'drafts',all:true,  tab:'Worst Drafts', icon:'fa-fire', col:'var(--red)',
           title:()=>'Worst Drafts Ever', badge:'positional Δ',
           note:'Every team-season ranked by raw draft score.'},
  steals: {grp:'picks', all:true,  tab:'Biggest Steals', icon:'fa-gem', col:'var(--green)',
           title:()=>'Biggest Steals Ever', badge:'beat draft slot',
           note:'Every pick from every season, ranked by how far it beat its draft slot at its position.'},
  busts:  {grp:'picks', all:true,  tab:'Worst Busts', icon:'fa-heart-crack', col:'var(--red)',
           title:()=>'Worst Busts Ever', badge:'first 6 rounds',
           note:'Every early pick (first six rounds) from every season, ranked by how far it fell short of its draft slot.'},
};
function setDraftView(v){ _draftView=v;
  if(v==='steals'||v==='busts'||v==='ysteals'||v==='ybusts'){ _draftPickLast=v; _draftPickScope=(v==='steals'||v==='busts')?'alltime':'year'; }
  renderDraftLists(); }
function setDraftPickScope(sc){ setDraftView(sc==='year'?'ysteals':'steals'); }
function drIsMobile(){ return window.matchMedia('(max-width:768px)').matches; }
function draftYearData(season){
  const rows=(_draftCache[season]?.rows)||[];
  const steals=rows.slice().sort((a,b)=>b.delta-a.delta).slice(0,10);
  const busts=rows.filter(r=>r.overall<=72).sort((a,b)=>a.delta-b.delta).slice(0,10);
  const totals={}; rows.forEach(r=>{ if(r.owner==null) return; totals[r.owner]=(totals[r.owner]||0)+r.delta; });
  const os=Object.keys(totals);
  const avg=os.length?os.reduce((a,o)=>a+totals[o],0)/os.length:0;
  const ranked=os.map(o=>({owner:o,season,total:totals[o],val:totals[o]-avg,
    name:(_franchises.find(f=>f.owner===o)?.name)||(_seasonMeta[season]?.names?.[o]?.name)||o})).sort((a,b)=>b.val-a.val);
  return {rows,steals,busts,ranked};
}
function draftAllData(){
  const {rows,teamDrafts}=_draftAllCache;
  /* these two lists use the raw draft score (summed positional Δ), not the
     season-adjusted one the yearly rankings use */
  const classes=teamDrafts.map(d=>({...d,val:d.total}));
  return {
    steals:rows.slice().sort((a,b)=>b.delta-a.delta).slice(0,10),
    busts:rows.filter(r=>r.overall<=72).sort((a,b)=>a.delta-b.delta).slice(0,10),
    best:classes.slice().sort((a,b)=>b.val-a.val).slice(0,10),
    worst:classes.slice().sort((a,b)=>a.val-b.val).slice(0,10),
    classes,
  };
}
/* grade colour for an all-time draft class, scaled across every class ever */
function draftClassTint(val,classes){
  const vs=(classes||[]).map(d=>d.val); if(vs.length<2) return null;
  const mn=Math.min(...vs), mx=Math.max(...vs);
  const t=mx>mn?(val-mn)/(mx-mn):1;
  return gradeColor(PPG_GRADES[Math.round(t*(PPG_GRADES.length-1))]);
}
function rankedListHTML(ranked){
  const vs=ranked.map(d=>d.val); const mn=Math.min(...vs),mx=Math.max(...vs);
  return ranked.map((d,i)=>{const t=mx>mn?(d.val-mn)/(mx-mn):1;
    const tint=gradeColor(PPG_GRADES[Math.round(t*(PPG_GRADES.length-1))]);
    return draftClassCard(d,i,false,tint);}).join('');
}
function drPanel(v,season,inner,cls){
  return `<div class="card dr-panel${cls?' '+cls:''}" style="box-shadow:none"><div class="section-header" style="padding:13px 16px"><i class="fa ${v.icon}" style="color:${v.col}"></i>${v.title(season)}<span class="badge-info">${v.badge}</span></div>${inner}</div>`;
}
// compact card used inside the side-by-side mobile pairs
function drAbbr(owner,name){
  const t=_teams.find(x=>_ownerMap[x.id]===owner);
  return (t&&t.abbrev)||teamInitials(name);
}
function draftClassCardMini(d,i,showSeason,tint){
  const val=(d.val!=null?d.val:d.total);
  const fr=_franchises.find(f=>f.owner===d.owner);
  const dcol=tint||(val>0?'var(--green)':val<0?'var(--red)':'var(--text2)');
  return `<div class="dpm${tint?' dpm-tint':''}"${tint?` style="--dtint:${tint}"`:''}>
    <div class="dpm-top"><span class="dpm-rk">${i+1}</span>${fr?franchiseAvatar(fr,20):''}<span class="dpm-name">${drAbbr(d.owner,d.name)}</span></div>
    <div class="dpm-bot dpm-ind">${showSeason?`<span class="dpm-pts">${d.season}</span>`:'<span class="dpm-pts"></span>'}<span class="dpm-delta" style="color:${dcol}">${val>0?'+':''}${Math.round(val)}</span></div>
  </div>`;
}
function draftPickCardMini(r,i,showSeason){
  return `<div class="dpm">
    <div class="dpm-top"><span class="dpm-rk">${i+1}</span>${playerImg(r.pid,20,r.name)}<span class="dpm-name">${r.name}</span></div>
    <div class="dpm-sub">${draftRowTeam(r)}${showSeason?` · ${r.season}`:''}</div>
    <div class="dpm-line"><b>${r.posName}${r.posDrafted}</b> → ${r.finPos!=null?`<b>${r.posName}${r.finPos}</b>`:'<b>unranked</b>'}</div>
    <div class="dpm-bot"><span class="dpm-pts">${r.pts.toFixed(1)} pts</span><span class="dpm-delta" style="color:${r.delta>0?'var(--green)':r.delta<0?'var(--red)':'var(--text2)'}">${r.delta>0?'+':''}${r.delta}</span></div>
  </div>`;
}
function drLoading(){ return `<div class="tab-loading"><i class="fa fa-circle-notch"></i>Crunching every draft from every season…</div>`; }
function drNeedAll(){ if(_draftAllCache) return false;
  loadAllDrafts().then(()=>{ if(_activeTab==='draft') renderDraftLists(); })
    .catch(()=>{ const el=document.getElementById('draft-lists'); if(el) el.innerHTML=`<div class="tab-loading" style="color:var(--red)">Couldn’t load all-time drafts.</div>`; });
  return true;
}
function renderDraftLists(){
  const el=document.getElementById('draft-lists'); if(!el) return;
  const season=getSeason();
  if(!DRAFT_VIEWS[_draftView]) _draftView='year';
  _drWasMobile=drIsMobile();
  el.innerHTML=_drWasMobile?draftListsMobileHTML(season):draftListsDesktopHTML(season);
}
function draftListsDesktopHTML(season){
  const v=DRAFT_VIEWS[_draftView];
  const btn=k=>{const x=DRAFT_VIEWS[k];
    return `<button class="dr-vtab${_draftView===k?' active':''}" onclick="setDraftView('${k}')"><i class="fa ${x.icon}" style="color:${x.col}"></i>${x.tab}</button>`;};
  const tabs=`<div class="dr-tabgrp">This Year · ${season}</div>
    <div class="dr-vtabs">${['year','ysteals','ybusts'].map(btn).join('')}</div>
    <div class="dr-tabgrp">All-Time</div>
    <div class="dr-vtabs">${['best','worst','steals','busts'].map(btn).join('')}</div>`;
  let right='';
  if(v.all&&drNeedAll()) right=drLoading();
  else if(_draftView==='year') right=rankedListHTML(draftYearData(season).ranked);
  else{
    const d=v.all?draftAllData():draftYearData(season);
    const key=({ysteals:'steals',ybusts:'busts',steals:'steals',busts:'busts',best:'best',worst:'worst'})[_draftView];
    right=drPanel(v,season,(d[key]||[]).map((r,i)=>v.grp==='drafts'?draftClassCard(r,i,true,draftClassTint(r.val!=null?r.val:r.total,d.classes)):draftPickCard(r,i,v.all)).join(''));
  }
  return `<div class="dr-card">
    <div class="dr-left dr-tabbox">
      <div class="section-header" style="padding:0 0 12px;border-bottom:none"><i class="fa fa-ranking-star"></i>Draft Rankings</div>
      ${tabs}
      <div class="dr-note">${v.note}</div>
    </div>
    <div class="dr-right">${right}</div>
  </div>`;
}
function draftListsMobileHTML(season){
  const grp=DRAFT_VIEWS[_draftView].grp;
  const mb=(g,label,target,icon,col)=>`<button class="dr-vtab dr-mtab${grp===g?' active':''}" onclick="setDraftView('${target}')"><i class="fa ${icon}" style="color:${col}"></i>${label}</button>`;
  const tabs=`<div class="dr-mtabs">
    ${mb('year',season+' Rankings','year','fa-ranking-star','var(--accent)')}
    ${mb('drafts','All-Time Drafts','best','fa-trophy','var(--green)')}
    ${mb('picks','Steals &amp; Busts',_draftPickLast,'fa-gem','var(--green)')}
  </div>`;
  let body='';
  if(grp==='year'){
    body=`<div class="dr-right">${rankedListHTML(draftYearData(season).ranked)}</div>
      <div class="dr-note" style="margin-top:14px">${DRAFT_VIEWS.year.note}</div>`;
  }else if(grp==='drafts'){
    if(drNeedAll()) body=drLoading();
    else{ const d=draftAllData();
      body=`<div class="dv-pair">
        ${drPanel(DRAFT_VIEWS.best,season,d.best.map((r,i)=>draftClassCardMini(r,i,true,draftClassTint(r.val,d.classes))).join(''),'dr-mini')}
        ${drPanel(DRAFT_VIEWS.worst,season,d.worst.map((r,i)=>draftClassCardMini(r,i,true,draftClassTint(r.val,d.classes))).join(''),'dr-mini')}
      </div>
      <div class="dr-note" style="margin-top:14px">${DRAFT_VIEWS.best.note}</div>`; }
  }else{
    const isAll=(_draftView==='steals'||_draftView==='busts');
    const scope=`<div class="dr-scope">
      <button class="dr-sbtn${!isAll?' active':''}" onclick="setDraftPickScope('year')">${season}</button>
      <button class="dr-sbtn${isAll?' active':''}" onclick="setDraftPickScope('alltime')">All-Time</button>
    </div>`;
    if(isAll&&drNeedAll()) body=scope+drLoading();
    else{ const d=isAll?draftAllData():draftYearData(season);
      const sv=isAll?DRAFT_VIEWS.steals:DRAFT_VIEWS.ysteals, bv=isAll?DRAFT_VIEWS.busts:DRAFT_VIEWS.ybusts;
      body=scope+`<div class="dv-pair">
        ${drPanel(sv,season,d.steals.map((r,i)=>draftPickCardMini(r,i,isAll)).join(''),'dr-mini')}
        ${drPanel(bv,season,d.busts.map((r,i)=>draftPickCardMini(r,i,isAll)).join(''),'dr-mini')}
      </div>
      <div class="dr-note" style="margin-top:14px">${sv.note}</div>`; }
  }
  return tabs+body;
}
let _navRsz;
window.addEventListener('resize',()=>{ clearTimeout(_navRsz); _navRsz=setTimeout(()=>scrollNavToActive(false),200); });
let _lhRsz;
window.addEventListener('resize',()=>{ clearTimeout(_lhRsz); _lhRsz=setTimeout(()=>{
  if(_activeTab==='legacy'&&_lhView==='champs') openDesktopBrackets();
},200); });
let _drRsz;
window.addEventListener('resize',()=>{ clearTimeout(_drRsz); _drRsz=setTimeout(()=>{
  if(_activeTab==='draft'&&_drWasMobile!==null&&_drWasMobile!==drIsMobile()) renderDraftLists();
},180); });
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
  const scoreEl=document.getElementById('draft-score'); if(scoreEl) scoreEl.innerHTML=scoreBadge(rel,rank,season,grade,gcol,ranked.length);
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
const REGULAR_SEASON_END=14; // fallback only — real value comes from each season's settings
function regEndOf(season){ const n=_seasonMeta[season]?.regEnd; return (n>=8&&n<=18)?n:REGULAR_SEASON_END; }
let _lhView='records';       // records | champs | conf | sups
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
      if((m.matchupPeriodId||99)>regEndOf(s))return;
      if(rec[m.home.teamId]){rec[m.home.teamId].pf+=hp;if(hp>ap||m.winner==='HOME')rec[m.home.teamId].w++;}
      if(rec[m.away.teamId]){rec[m.away.teamId].pf+=ap;if(ap>hp||m.winner==='AWAY')rec[m.away.teamId].w++;}
    });
    if(maxPlayed>=regEndOf(s)){
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

  const tidOf=o=>(_teams.find(x=>_ownerMap[x.id]===o)||{}).id||'';
  const nm=(owner,name)=>`<span class="lh-name" data-tid="${tidOf(owner)}">${name}</span><span class="lh-ab">${drAbbr(owner,name)}</span>`;

  // ── Champions: one line per season, bracket opens underneath ──
  const champsHTML=champRows.length?`<div class="lh-list">${champRows.map(r=>`
    <div class="lh-row">
      <span class="lh-yr">${r.season}</span>
      <span class="lh-main">
        ${av(r.champ,22,6)}<span class="lh-win tlink">${nm(r.champ.owner,r.champ.name)}</span>
        <span class="lh-sc lh-sc-w">${r.cPts!=null?r.cPts.toFixed(1):'—'}</span>
        <span class="lh-def">def.</span>
        <span class="lh-sc">${r.rPts!=null?r.rPts.toFixed(1):'—'}</span>
        ${av(r.ru,22,6)}<span class="lh-lose tlink">${nm(r.ru.owner,r.ru.name)}</span>
      </span>
      <button class="lh-brk" onclick="toggleBracket('${r.season}',this)"><i class="fa fa-sitemap"></i><span class="lh-brk-t">Bracket</span></button>
      <div class="bracket-wrap" id="bracket-${r.season}" style="display:none"></div>
    </div>`).join('')}</div>`
    :`<div class="tab-loading">No completed championships yet.</div>`;

  // ── Conference titles: a tight column per conference ──
  const confHTML=(()=>{
    if(!confRows.length) return `<div class="tab-loading">No completed regular seasons yet.</div>`;
    const byDiv={};
    confRows.forEach(r=>r.winners.forEach(w=>{(byDiv[w.div]||(byDiv[w.div]={name:w.divName,rows:[]})).rows.push({season:r.season,w});}));
    const cols=Object.entries(byDiv).sort((a,b)=>a[0]-b[0]);
    return `<div class="lh-cols">${cols.map(([id,c])=>`
      <div class="lh-col">
        <div class="lh-col-head">${c.name}</div>
        <div class="lh-list">${c.rows.map(({season,w})=>`
          <div class="lh-row lh-row-2">
            <span class="lh-yr">${season}</span>
            <span class="lh-main">${avatarCore(w.name,w.tid,proxyLogo(w.logo),22,6)}<span class="lh-win tlink">${nm(w.owner,w.name)}</span></span>
            <span class="lh-meta">${w.w}–${regEndOf(season)-w.w} · ${w.pf.toFixed(0)} PF</span>
          </div>`).join('')}</div>
      </div>`).join('')}</div>`;
  })();

  // ── All-Time records: one sortable-looking line per franchise ──
  const recsHTML=(()=>{
    const recs=_franchises.map(fr=>{const at=franchiseAllTime(fr.owner);const gg=at.w+at.l+at.t;return {fr,at,pct:gg?at.w/gg:0};})
      .sort((a,b)=>b.pct-a.pct||b.at.w-a.at.w);
    const pcts=recs.map(r=>r.pct);
    const mn=Math.min(...pcts), mx=Math.max(...pcts);
    const col=v=>{ if(mx===mn) return gradeColor('A'); return gradeColor(PPG_GRADES[Math.round((v-mn)/(mx-mn)*(PPG_GRADES.length-1))]); };
    const cards=`<div class="lh-reccards">${recs.map(({fr,at,pct},i)=>`
      <div class="lh-rcard">
        <span class="lh-rcard-rk">${i+1}</span>
        <div class="lh-rcard-body">
          <div class="lh-rcard-top">${avatarCore(fr.name,fr.teamId||0,proxyLogo(fr.logo),24,7)}<span class="lh-rcard-nm tlink" data-tid="${tidOf(fr.owner)}">${fr.name}</span></div>
          <div class="lh-rcard-rec">${at.w}–${at.l}${at.t?`–${at.t}`:''}<span class="lh-rcard-pct" style="color:${col(pct)}">${(pct*100).toFixed(1)}%</span></div>
          <div class="lh-rcard-sub">${at.pf.toFixed(0)} PF · ${at.pa.toFixed(0)} PA · ${at.seasons} season${at.seasons!==1?'s':''}</div>
        </div>
      </div>`).join('')}</div>`;
    return cards+`<div class="lh-recs">
      <div class="lh-rec lh-rec-head"><span>#</span><span>Team</span><span class="r">Record</span><span class="r">Win%</span><span class="r">PF</span><span class="r">PA</span><span class="r lh-yrs">Seasons</span></div>
      ${recs.map(({fr,at,pct},i)=>`<div class="lh-rec">
        <span class="lh-rk">${i+1}</span>
        <span class="lh-team">${avatarCore(fr.name,fr.teamId||0,proxyLogo(fr.logo),22,6)}<span class="tlink">${nm(fr.owner,fr.name)}</span></span>
        <span class="r lh-recval">${at.w}–${at.l}${at.t?`–${at.t}`:''}</span>
        <span class="r lh-pct" style="color:${col(pct)}">${(pct*100).toFixed(1)}%</span>
        <span class="r lh-pf">${at.pf.toFixed(0)}</span>
        <span class="r lh-pa">${at.pa.toFixed(0)}</span>
        <span class="r lh-yrs">${at.seasons}</span>
      </div>`).join('')}
    </div>`;
  })();

  // ── Superlatives: award name + winners on one line, grouped by season ──
  const supsHTML=(()=>{
    const yrs=_awardsData?Object.keys(_awardsData.years||{}).sort((a,b)=>b-a):[];
    if(!yrs.length) return `<div class="tab-loading">No awards recorded yet.</div>`;
    const order=_awardsData.order||[];
    return yrs.map(y=>{
      const yr=_awardsData.years[y];
      const rows=order.filter(k=>yr[k]&&yr[k].length).map(k=>{
        const lab=_awardsData.labels[k]||{name:k};
        const wins=yr[k].map(e=>{const fr=awardOwner(e.team);
          const a=fr?avatarCore(fr.name,fr.teamId||0,proxyLogo(fr.logo),20,5):'';
          return `<span class="lh-sup-win">${a}${fr?`<span class="tlink">${nm(fr.owner,fr.name)}</span>`:`<span class="lh-name" style="color:var(--text3)">${e.team}</span>`}${e.detail?`<span class="sup-detail">${e.detail}</span>`:''}</span>`;}).join('');
        return `<div class="lh-sup-row"><span class="lh-sup-award hk-${k}">${lab.name}</span><span class="lh-sup-wins">${wins}</span></div>`;
      }).join('');
      return `<div class="lh-col"><div class="lh-col-head">${y} Season</div><div class="lh-sup-rows">${rows}</div></div>`;
    }).join('');
  })();

  const tab=(v,icon,label)=>`<button class="tab-btn ${_lhView===v?'active':''}" data-view="${v}" onclick="setLHView('${v}')"><i class="fa ${icon}"></i>${label}</button>`;
  const head=(icon,label)=>`<div class="lh-sec-head"><i class="fa ${icon}"></i>${label}</div>`;
  body.innerHTML=`
    <div class="sec wm" data-wm="&#xf091;">
      <div class="standings-filters lh-tabs" id="lh-subtabs" style="padding-bottom:15px">
        ${tab('records','fa-clipboard-list','All-Time Records')}
        ${tab('champs','fa-trophy','Champions')}
        ${tab('conf','fa-star','Conference')}
        ${tab('sups','fa-award','Superlatives')}
      </div>
      <div id="lh-records" ${_lhView==='records'?'':'style="display:none"'}>
        ${head('fa-clipboard-list','All-Time Records')}
        <div class="lh-note">Every season combined, ranked by win percentage.</div>
        ${recsHTML}</div>
      <div id="lh-champs" ${_lhView==='champs'?'':'style="display:none"'}>
        ${head('fa-trophy','Champions')}
        ${champsHTML}</div>
      <div id="lh-conf" ${_lhView==='conf'?'':'style="display:none"'}>
        ${head('fa-star','Conference Championships')}
        <div class="lh-note">Conference winners are decided on regular-season record, with points for as the tiebreak.</div>
        ${confHTML}</div>
      <div id="lh-sups" ${_lhView==='sups'?'':'style="display:none"'}>
        ${head('fa-award','Season Superlatives')}
        ${supsHTML}</div>
    </div>
    <!-- Gabe's Greatness lives here now, collapsed at the foot of the page.
         A <summary> rather than a .sec-head, so it stays off the jump bar. -->
    <details class="lh-gabe">
      <summary><i class="fa fa-dumbbell"></i><span>Gabe's Greatness</span><i class="fa fa-chevron-down gb-caret"></i></summary>
      <div class="lh-gabe-body">
        <div id="gabe-monument"></div>
        <div id="gabe-body"></div>
      </div>
    </details>`;
  openDesktopBrackets();
  const gd=document.querySelector('.lh-gabe');
  if(gd&&!gd.dataset.wired){ gd.dataset.wired='1';
    gd.addEventListener('toggle',()=>{ if(gd.open) renderGabe(); }); }
}
// Brackets ride open on desktop and stay closed on phones (where they'd bury
// the rest of the list).
function openDesktopBrackets(){
  if(window.matchMedia('(max-width:768px)').matches) return;
  document.querySelectorAll('#lh-champs .lh-row').forEach(row=>{
    const wrap=row.querySelector('.bracket-wrap'), btn=row.querySelector('.lh-brk');
    if(!wrap||!btn||wrap.style.display!=='none') return;
    const season=(wrap.id||'').replace('bracket-','');
    if(season) toggleBracket(season,btn);
  });
}
function setLHView(v){
  _lhView=v;
  document.querySelectorAll('#lh-subtabs .tab-btn').forEach(b=>b.classList.toggle('active',b.dataset.view===v));
  ['champs','conf','records','sups'].forEach(k=>{const el=document.getElementById('lh-'+k); if(el) el.style.display=(k===v)?'':'none';});
  if(v==='champs') openDesktopBrackets();
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
  while(w>regEndOf(season)&&guard++<4){
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
  btn.innerHTML=`<i class="fa fa-sitemap"></i><span class="lh-brk-t">${open?'Hide bracket':'View bracket'}</span>`;
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
// Sportsbook lines for the matchup of the week: a head-to-head moneyline priced
// off the two power ratings, plus each side's championship and playoff numbers.
function motwOddsHTML(A,B){
  const book=(typeof sbBuild==='function')?sbBuild():null;
  if(!book) return '';
  const rA=book.rows.find(r=>r.owner===_ownerMap[A.id]), rB=book.rows.find(r=>r.owner===_ownerMap[B.id]);
  if(!rA||!rB) return '';
  // Only prices derived from this matchup belong here — the championship and
  // playoff-berth futures live on the board, not in a matchup card.
  // head to head: logistic on the rating gap, then a standard two-way hold
  const pWinA=Math.min(0.80,Math.max(0.20,1/(1+Math.exp(-(rA.rating-rB.rating)*0.55))));
  const mlA=amFromProb(Math.min(0.95,pWinA+0.025)), mlB=amFromProb(Math.min(0.95,(1-pWinA)+0.025));
  const line=Math.round(rA.ppg+rB.ppg)+0.5;              // combined points
  const favA=rA.rating>=rB.rating;                        // same side the moneyline favours
  const sp=(Math.max(0.5,Math.round(Math.abs(rA.rating-rB.rating)*3.0*2)/2)).toFixed(1);
  const cell=(lbl,val,sub)=>`<div class="mo-cell"><div class="mo-l">${lbl}</div><div class="mo-v">${val}</div>${sub?`<div class="mo-s">${sub}</div>`:''}</div>`;
  const go=`onclick="motwToBook('${rA.owner}','${rB.owner}')"`;
  return `<div class="motw-book motw-book-link" ${go} role="button" tabindex="0"
      onkeypress="if(event.key==='Enter')motwToBook('${rA.owner}','${rB.owner}')">
    <div class="mo-head"><i class="fa fa-coins"></i>B&amp;C Sportsbook
      <span class="mo-go">Open board <i class="fa fa-arrow-right"></i></span></div>
    <div class="mo-grid">
      ${cell('Moneyline',`${amFmt(mlA)} / ${amFmt(mlB)}`,`${sbTeamAb(rA.owner,rA.name)} / ${sbTeamAb(rB.owner,rB.name)}`)}
      ${cell('Spread',`${favA?sbTeamAb(rA.owner,rA.name):sbTeamAb(rB.owner,rB.name)} \u2212${sp}`,'projected margin')}
      ${cell('Total',`O/U ${line.toFixed(1)}`,'combined points')}
    </div>
  </div>`;
}
// Jump from the homepage strip straight to this matchup on the weekly board.
function motwToBook(oA,oB){
  _sbView='week';
  switchTab('book');
  window.scrollTo(0,0);
  const find=()=>{
    const row=[...document.querySelectorAll('#page-book .wk-game')].find(g=>g.dataset.a===oA&&g.dataset.b===oB)
      ||[...document.querySelectorAll('#page-book .wk-game')].find(g=>g.dataset.a===oB&&g.dataset.b===oA);
    if(!row) return false;
    row.classList.add('wk-focus');
    row.scrollIntoView({block:'center',behavior:'smooth'});
    setTimeout(()=>row.classList.remove('wk-focus'),2600);
    return true;
  };
  let tries=0;
  const tick=()=>{ if(find()||tries++>20) return; setTimeout(tick,120); };
  setTimeout(tick,80);
}
/* ── MATCHUP OF THE WEEK: pick'em ──────────────────────────────────────────
   Signed-in profiles pick a side; the bar splits on the tally and each voter's
   own team badge sits under the side they backed. Voting while signed out
   opens the sign-in dialog instead. Fails soft: if Firestore is unreachable the
   bar simply shows no votes and the buttons still explain themselves. */
let _motwVotes=null,_motwVoteBusy=false;
const motwVoteKey=()=>`vote_${getSeason()}_w${(_CFG.matchup||{}).week??0}`;
function motwPair(){
  const cfg=_CFG.matchup||{};
  let pair=null;
  if(cfg.auto) pair=detectMatchupFromVideo();
  if(!pair){const h=resolveTeamByName(cfg.home),a=resolveTeamByName(cfg.away);if(h&&a)pair=[h,a];}
  return pair;
}
async function loadMotwVotes(){
  const rows=await gflListProfiles();
  if(!rows) return null;
  const key=motwVoteKey(), tally={};
  rows.forEach(p=>{
    const pick=String(p[key]||'').trim();
    if(!pick) return;
    (tally[pick]||(tally[pick]=[])).push({voter:p.id,team:String(p.teamId||'').trim()});
  });
  return tally;
}
async function refreshMotwVotes(){
  const t=await loadMotwVotes();
  if(t){ _motwVotes=t; renderMotwVoteBar(); }
}
function renderMotwVoteBar(){
  const box=document.getElementById('motw-vote'); if(!box) return;
  const pair=motwPair(); if(!pair) return;
  const [A,B]=pair, key=motwVoteKey();
  const t=_motwVotes||{};
  const va=(t[String(A.id)]||[]), vb=(t[String(B.id)]||[]);
  const na=va.length, nb=vb.length, tot=na+nb;
  const pa=tot?Math.round(na/tot*100):50, pb=tot?100-pa:50;
  const mine=_me?String((t[String(A.id)]||[]).some(v=>v.voter===_me.k1)?A.id
    :(t[String(B.id)]||[]).some(v=>v.voter===_me.k1)?B.id:''):'';
  const badges=list=>list.map(v=>{
    const tid=Number(v.team);
    return _teams.some(x=>x.id===tid)?`<span class="mv-badge" title="${v.voter}">${logoImg(tid,'team-logo-sm')}</span>`:'';
  }).join('');
  box.innerHTML=`
    <div class="mv-h">Who wins?${tot?`<span class="mv-count">${tot} vote${tot===1?'':'s'}</span>`:''}</div>
    <div class="mv-bar" role="img" aria-label="${na} for ${A.name}, ${nb} for ${B.name}">
      <div class="mv-fill a" style="width:${tot?pa:0}%"></div>
      <div class="mv-fill b" style="width:${tot?pb:0}%"></div>
    </div>
    <div class="mv-pcts"><span>${tot?`${pa}% · ${na}`:'—'}</span><span>${tot?`${pb}% · ${nb}`:'—'}</span></div>
    <div class="mv-btns">
      <button class="mv-btn${mine==String(A.id)?' picked':''}" ${_motwVoteBusy?'disabled':''} onclick="castMotwVote(${A.id})">
        ${mine==String(A.id)?'<i class="fa fa-check"></i>':''}${A.abbrev||A.name}
      </button>
      <button class="mv-btn${mine==String(B.id)?' picked':''}" ${_motwVoteBusy?'disabled':''} onclick="castMotwVote(${B.id})">
        ${mine==String(B.id)?'<i class="fa fa-check"></i>':''}${B.abbrev||B.name}
      </button>
    </div>
    <div class="mv-voters"><div class="mv-side">${badges(va)}</div><div class="mv-side right">${badges(vb)}</div></div>
    ${_me?'':'<div class="mv-note">Sign in to cast a pick.</div>'}`;
}
async function castMotwVote(teamId){
  if(!_me){ openSignIn(); return; }
  if(_motwVoteBusy) return;
  _motwVoteBusy=true; renderMotwVoteBar();
  const res=await gflPatchProfile(_me.k1,{[motwVoteKey()]:String(teamId)});
  _motwVoteBusy=false;
  if(res&&res.error){
    const box=document.getElementById('motw-vote');
    if(box&&!box.querySelector('.mv-err')) box.insertAdjacentHTML('beforeend','<div class="mv-note mv-err">Could not save that pick — try again.</div>');
    return;
  }
  await refreshMotwVotes();
}

/* Head-to-head comparison table, laid out like the All-Time panel on a team
   profile: one metric per row, both teams' values on either side of the label.
   The stronger side is tinted, so the shape of the matchup reads at a glance. */
function motwCompareHTML(A,B,at,last,odds){
  const gA=A.wins+A.losses+(A.ties||0), gB=B.wins+B.losses+(B.ties||0);
  const pctA=gA?A.wins/gA*100:null, pctB=gB?B.wins/gB*100:null;
  const cmA=_cmMode==='none'?null:_scores[A.id], cmB=_cmMode==='none'?null:_scores[B.id];
  /* `dir` is which way is better: 1 higher, -1 lower, 0/undefined neither.
     `showA`/`showB` override the rendered text when it is not just the number
     being compared (Record is ranked on win %, but reads as W–L). */
  const row=(label,a,b,fmt,dir,sub,showA,showB)=>{
    const f=(v,over)=>over!=null?over
      :(v==null||(typeof v==='number'&&!isFinite(v)))?'—':fmt(v);
    let ab=false,bb=false;
    if(dir&&typeof a==='number'&&typeof b==='number'&&isFinite(a)&&isFinite(b)&&a!==b){
      ab=dir>0?a>b:a<b; bb=!ab;
    }
    // the favoured side reads green and the other red, the way the rest of the
    // site colours a comparison; ties stay neutral
    return `<div class="mc-row">
      <span class="mc-v${ab?' better':bb?' worse':''}">${f(a,showA)}</span>
      <span class="mc-l">${label}${sub?`<span class="mc-sub">${sub}</span>`:''}</span>
      <span class="mc-v${bb?' better':ab?' worse':''}">${f(b,showB)}</span>
    </div>`;
  };
  const rec=t=>`${t.wins}–${t.losses}${t.ties?`–${t.ties}`:''}`;
  const one=v=>Number(v).toFixed(1);
  const two=v=>Number(v).toFixed(2);
  return `<div class="motw-cmp">
    <div class="mc-row mc-head"><span class="mc-v">${A.abbrev||'A'}</span><span class="mc-l">${getSeason()} season</span><span class="mc-v">${B.abbrev||'B'}</span></div>
    ${row('Record',pctA,pctB,String,1,'',rec(A),rec(B))}
    ${row('Points For',A.pf,B.pf,v=>Number(v).toFixed(0),1)}
    ${row('Points Against',A.pa,B.pa,v=>Number(v).toFixed(0),-1)}
    ${row('Avg / Game',gA?A.pf/gA:null,gB?B.pf/gB:null,one,1)}
    ${row('Point Diff',A.pf-A.pa,B.pf-B.pa,v=>(v>0?'+':'')+Number(v).toFixed(0),1)}
    ${row('Coaching Metric',cmA,cmB,two,1)}
    <div class="mc-row mc-head"><span class="mc-v"></span><span class="mc-l">Head to head</span><span class="mc-v"></span></div>
    ${at.games
      ? row('All-Time Series',at.wA,at.wB,v=>String(v),1,`${at.games} meeting${at.games===1?'':'s'}`)
      : `<div class="mc-row"><span class="mc-v">—</span><span class="mc-l">All-Time Series<span class="mc-sub">first meeting</span></span><span class="mc-v">—</span></div>`}
    ${last
      ? row('Last Meeting',last.aPts,last.bPts,one,1,`${last.season} Wk ${last.week}`)
      : `<div class="mc-row"><span class="mc-v">—</span><span class="mc-l">Last Meeting<span class="mc-sub">never played</span></span><span class="mc-v">—</span></div>`}
    ${motwOddsRows(odds,row)}
  </div>`;
}
/* Playoff odds as rows of the same comparison table rather than a separate
   dropdown. Values come from config.js already as whole percentages. */
function motwOddsRows(odds,row){
  const a=(odds&&odds.home)||{}, b=(odds&&odds.away)||{};
  if(a.win==null&&a.loss==null&&b.win==null&&b.loss==null) return '';
  const pc=v=>v==null?'—':`${v}%`;
  return `<div class="mc-row mc-head"><span class="mc-v"></span><span class="mc-l">Playoff odds</span><span class="mc-v"></span></div>
    ${row('With a Win',a.win,b.win,pc,1)}
    ${row('With a Loss',a.loss,b.loss,pc,1)}`;
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
  el.innerHTML=`
    <div class="motw-panel home-box">
      <div class="motw-head">
        <div class="motw-team">${logoImg(A.id,'big4-logo')}<div class="motw-tinfo"><div class="fr-name motw-tname">${A.name}</div></div></div>
        <div class="motw-vs">VS</div>
        <div class="motw-team right">${logoImg(B.id,'big4-logo')}<div class="motw-tinfo"><div class="fr-name motw-tname">${B.name}</div></div></div>
      </div>
      <div class="motw-vote" id="motw-vote"></div>
    </div>
    ${motwCompareHTML(A,B,at,last,odds)}
    ${motwOddsHTML(A,B)}`;
  renderMotwVoteBar();                       // paint immediately from cache
  if(!_motwVotes) refreshMotwVotes();        // then fill in from Firestore
}

/* ── LEGACY REPORT ──────────────────────────────────────────────────────────
   What last week did to the all-time table. Nothing is stored: every game
   carries its season and week, so the career table can be rebuilt as of any
   cutoff. The report is the difference between the table through the last
   completed week and the table through the week before it — so it lands on
   its own once the week's games are final, which is Tuesday morning, and it
   backfills correctly for any week already played. */
function allTimeThrough(season,week){
  const agg={};
  const touch=o=>agg[o]||(agg[o]={w:0,l:0,t:0,pf:0,pa:0,g:0,hi:0});
  ALL_SEASONS.forEach(s=>{
    if(Number(s)>Number(season)) return;
    const meta=_seasonMeta[s]; if(!meta) return;
    (meta.schedule||[]).forEach(m=>{
      if(!m.home||!m.away) return;
      const wk=m.matchupPeriodId||0;
      if(Number(s)===Number(season)&&wk>week) return;
      const hp=m.home.totalPoints||0, ap=m.away.totalPoints||0;
      if(hp===0&&ap===0) return;
      const ho=meta.owners?.[m.home.teamId], ao=meta.owners?.[m.away.teamId];
      if(!ho||!ao) return;
      const H=touch(ho),A=touch(ao);
      H.g++;A.g++; H.pf+=hp;H.pa+=ap; A.pf+=ap;A.pa+=hp;
      H.hi=Math.max(H.hi,hp); A.hi=Math.max(A.hi,ap);
      if(hp>ap){H.w++;A.l++;} else if(ap>hp){A.w++;H.l++;} else {H.t++;A.t++;}
    });
  });
  return agg;
}
/* the last week anywhere in league history that actually has results */
function lastCompletedWeek(){
  for(let i=ALL_SEASONS.length-1;i>=0;i--){
    const s=ALL_SEASONS[i], meta=_seasonMeta[s]; if(!meta) continue;
    let mx=0;
    (meta.schedule||[]).forEach(m=>{
      if(!m.home||!m.away) return;
      if((m.home.totalPoints||0)===0&&(m.away.totalPoints||0)===0) return;
      mx=Math.max(mx,m.matchupPeriodId||0);
    });
    if(mx) return {season:s,week:mx};
  }
  return null;
}
const LEGACY_METRICS=[
  {k:'wins', label:'All-Time Wins',    val:a=>a.w,                  fmt:v=>v},
  {k:'pf',   label:'All-Time Points',  val:a=>a.pf,                 fmt:v=>Math.round(v).toLocaleString()},
  {k:'pct',  label:'All-Time Win %',   val:a=>a.g?a.w/a.g:0,        fmt:v=>(v*100).toFixed(1)+'%'},
  {k:'ppg',  label:'All-Time PPG',     val:a=>a.g?a.pf/a.g:0,       fmt:v=>v.toFixed(1)},
  {k:'best', label:'Highest Score',    val:a=>a.hi,                 fmt:v=>v.toFixed(1)},
  {k:'diff', label:'Points Differential',val:a=>a.pf-a.pa,          fmt:v=>(v>=0?'+':'')+Math.round(v).toLocaleString()},
  {k:'papg', label:'Points Against/Gm',val:a=>a.g?-(a.pa/a.g):0,    fmt:v=>(-v).toFixed(1)},
];
function legacyReportData(){
  const at=lastCompletedWeek(); if(!at) return null;
  const now=allTimeThrough(at.season,at.week);
  const before=allTimeThrough(at.week>1?at.season:String(Number(at.season)-1), at.week>1?at.week-1:99);
  const owners=Object.keys(now); if(owners.length<2) return null;
  const nameOf=o=>(_franchises.find(f=>f.owner===o)||{}).name
    ||_seasonMeta[at.season]?.names?.[o]?.name||o;
  const rankIn=(tbl,val)=>{
    const rows=Object.keys(tbl).map(o=>({o,v:val(tbl[o])})).sort((a,b)=>b.v-a.v);
    const r={}; rows.forEach((x,i)=>r[x.o]=i+1); return r;
  };
  const moves=[];
  LEGACY_METRICS.forEach(m=>{
    const rNow=rankIn(now,m.val), rWas=rankIn(before,m.val);
    owners.forEach(o=>{
      if(!before[o]||!rWas[o]) return;                 // no prior standing to move from
      const a=rWas[o], b=rNow[o];
      if(a===b) return;
      moves.push({owner:o,name:nameOf(o),metric:m.label,from:a,to:b,
        dir:b<a?'up':'down',value:m.fmt(m.val(now[o]))});
    });
  });
  moves.sort((x,y)=>Math.abs(y.from-y.to)-Math.abs(x.from-x.to)||x.to-y.to);
  // records broken during the week
  const records=[];
  const bestNow=Math.max(...owners.map(o=>now[o].hi));
  const bestWas=Math.max(...Object.keys(before).map(o=>before[o].hi),0);
  if(bestNow>bestWas){
    const who=owners.find(o=>now[o].hi===bestNow);
    records.push({txt:`${nameOf(who)} set a new league record for the highest single-game score`,val:bestNow.toFixed(1)});
  }
  LEGACY_METRICS.forEach(m=>{
    const rNow=rankIn(now,m.val), rWas=rankIn(before,m.val);
    const leadNow=owners.find(o=>rNow[o]===1), leadWas=Object.keys(before).find(o=>rWas[o]===1);
    if(leadNow&&leadWas&&leadNow!==leadWas)
      records.push({txt:`${nameOf(leadNow)} took over the ${m.label.toLowerCase()} lead from ${nameOf(leadWas)}`,val:m.fmt(m.val(now[leadNow]))});
  });
  return {season:at.season,week:at.week,moves,records};
}
/* Week-by-week history for one team. The all-time table is rebuildable at any
   cutoff, so this walks every played week and records where that team stood —
   which means the full history back to the first season is available now,
   rather than only from the day snapshots started being written. */
function legacyTeamHistory(owner){
  const weeks=[];
  ALL_SEASONS.forEach(s=>{
    const meta=_seasonMeta[s]; if(!meta) return;
    const played=new Set();
    (meta.schedule||[]).forEach(m=>{
      if(!m.home||!m.away) return;
      if((m.home.totalPoints||0)===0&&(m.away.totalPoints||0)===0) return;
      played.add(m.matchupPeriodId||0);
    });
    [...played].filter(Boolean).sort((a,b)=>a-b).forEach(w=>weeks.push({season:s,week:w}));
  });
  if(!weeks.length) return null;
  const rankOf=(tbl,val,o)=>{
    const rows=Object.keys(tbl).map(k=>({k,v:val(tbl[k])})).sort((a,b)=>b.v-a.v);
    const i=rows.findIndex(x=>x.k===o); return i<0?null:i+1;
  };
  const out=[];
  let prev=null;
  weeks.forEach(pt=>{
    const tbl=allTimeThrough(pt.season,pt.week);
    if(!tbl[owner]) { prev=null; return; }
    const snap={season:pt.season,week:pt.week,ranks:{},vals:{}};
    LEGACY_METRICS.forEach(m=>{ snap.ranks[m.k]=rankOf(tbl,m.val,owner); snap.vals[m.k]=m.fmt(m.val(tbl[owner])); });
    snap.changes=prev?LEGACY_METRICS.filter(m=>prev.ranks[m.k]!=null&&snap.ranks[m.k]!=null&&prev.ranks[m.k]!==snap.ranks[m.k])
      .map(m=>({metric:m.label,from:prev.ranks[m.k],to:snap.ranks[m.k],dir:snap.ranks[m.k]<prev.ranks[m.k]?'up':'down'})):[];
    out.push(snap); prev=snap;
  });
  return out.reverse();     // newest first
}
/* Lives on the team profile now, so it always reports the team being viewed —
   no picker of its own, and never the whole league. */
function legacyReportHTML(owner){
  const d=legacyReportData();
  if(!d||!owner) return '';
  const arrow=dir=>`<i class="fa fa-arrow-${dir==='up'?'up lr-up':'down lr-down'}"></i>`;
  const nm=(_franchises.find(f=>f.owner===owner)||{}).name||'This team';
  const mine=d.moves.filter(m=>m.owner===owner);
  const recs=d.records.filter(r=>r.txt.indexOf(nm)===0);
  return `<div class="sec lr-sec">
    <!-- plain span, not .badge-info: those are hidden inside section heads -->
    <div class="sec-head" style="font-size:15px"><i class="fa fa-landmark" style="color:var(--accent)"></i>Legacy Report
      <span class="lr-wk-tag">Week ${d.week} · ${d.season}</span></div>
    ${recs.length?`<div class="lr-recs">${recs.map(r=>
      `<div class="lr-rec"><i class="fa fa-certificate"></i><span>${r.txt}</span><b>${r.val}</b></div>`).join('')}</div>`:''}
    ${mine.length
      ? `<div class="lr-list">${mine.map(m=>`<div class="lr-row">
          ${arrow(m.dir)}
          <span class="lr-who"><span class="lr-mt">${m.metric}</span></span>
          <span class="lr-mv">#${m.from} → <b class="${m.dir==='up'?'lr-up':'lr-down'}">#${m.to}</b></span>
        </div>`).join('')}</div>`
      : `<div class="lr-none">${nm} held every all-time position in week ${d.week}.</div>`}
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
    </div>
    <button class="home-punish-more" onclick="openPunishRules()">Details <i class="fa fa-arrow-right"></i></button>
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

/* The Punishment tab is retired; its content lives in a popup off the homepage
   module's CTA. Same config in config.js, so the weekly edit is unchanged. */
/* Which punishment the popup is showing. Reset to this week's every time the
   popup opens, so it never remembers a previous browse. */
let _prSel=null;
function selectPunish(name){ _prSel=name; const b=document.getElementById('punish-rules-body'); if(b) b.innerHTML=punishRulesHTML(); }
function punishRulesHTML(){
  const cfg=_CFG.punishment||{};
  const week=cfg.name||'';
  const sel=_prSel||week;                       // defaults to this week's
  const selL=sel.toLowerCase(), curL=week.toLowerCase();
  const opts=cfg.options||[];
  const detail=(cfg.details||{})[sel] || (selL===curL?cfg.note:'') || '';
  return `
    <div class="pr-hero">
      <div class="pr-ic"><i class="fa ${PUNISH_ICON[selL]||'fa-gavel'}"></i></div>
      <div>
        <div class="pr-week">${selL===curL?`Week ${cfg.week??'—'} Punishment`:'From the menu'}</div>
        <div class="pr-name">${sel||'TBD'}</div>
      </div>
    </div>
    <p class="pr-note${detail?'':' pr-empty'}">${detail||'No description written for this one yet — add it under <b>punishment.details</b> in config.js.'}</p>
    ${(cfg.rules||[]).length?`<div class="pr-rules">
      <div class="pr-h">How it works</div>
      <ol class="pr-list">${cfg.rules.map(r=>`<li>${r}</li>`).join('')}</ol>
    </div>`:''}
    <div class="pr-rules">
      <div class="pr-h">The menu — tap any to read it</div>
      <div class="punish-menu">
        ${opts.map(o=>{const l=o.toLowerCase();
          return `<button class="punish-opt pr-pick${l===selL?' active':''}" onclick="selectPunish(${JSON.stringify(o).replace(/"/g,'&quot;')})">
            <i class="fa ${PUNISH_ICON[l]||'fa-circle'}"></i>${o}${l===curL?'<span class="punish-tag">THIS WEEK</span>':''}
          </button>`;}).join('')||'<div class="pr-note">No options set.</div>'}
      </div>
    </div>`;
}
/* The overlay only covers the viewport, so leaving the page scrollable behind
   it slides the dimmed content around under a fixed sheet. Same lock the nav
   drawer uses. */
/* overflow:hidden alone does not hold here — the phone rules set
   body{overflow-y:visible!important} and the page scrolls straight through it.
   Pinning body and offsetting it by the current scroll is what actually stops
   the page, and it restores the position on close. */
let _lockY=0;
function modalLock(on){
  const b=document.body, d=document.documentElement;
  if(on){
    _lockY=window.scrollY||d.scrollTop||0;
    b.style.position='fixed'; b.style.top=`-${_lockY}px`;
    b.style.left='0'; b.style.right='0'; b.style.width='100%';
    d.classList.add('modal-lock'); b.classList.add('modal-lock');
  }else{
    b.style.position=''; b.style.top=''; b.style.left=''; b.style.right=''; b.style.width='';
    d.classList.remove('modal-lock'); b.classList.remove('modal-lock');
    window.scrollTo(0,_lockY);
  }
}
function openPunishRules(){
  const body=document.getElementById('punish-rules-body');
  const ov=document.getElementById('punish-overlay');
  if(!body||!ov) return;
  _prSel=null;                         // always opens on this week's punishment
  body.innerHTML=punishRulesHTML();
  ov.classList.add('open');
  modalLock(true);
}
function closePunishRules(e){ if(e.target===document.getElementById('punish-overlay')) closePunishRulesDirect(); }
function closePunishRulesDirect(){ document.getElementById('punish-overlay')?.classList.remove('open'); modalLock(false); }

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
  const REG=regEndOf(season);
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
  // same row anatomy as the Standings & Stats table: rank chip, team cell with
  // logo + name + abbreviation, right-aligned numerics
  const rows=list.map(t=>{
    const cur=_teams.find(x=>x.id===t.id);
    const ab=(cur&&cur.abbrev)||teamInitials(t.name);
    const av=cur?logoImg(t.id):avatarCore(t.name,t.id,proxyLogo(t.logo),28,8);
    const luck=t.vaW-t.w; // vs-avg wins minus actual wins (positive = unlucky)
    const luckTag = luck>0?` <span style="color:var(--green);font-size:11px;font-weight:600">+${luck}</span>` : (luck<0?` <span style="color:var(--red);font-size:11px;font-weight:600">${luck}</span>`:'');
    return `<tr>
      <td><span class="rank">${t.rank}</span></td>
      <td><div class="team-cell">${av}<div class="team-info"><div class="team-name tlink" data-tid="${t.id}">${t.name}</div><div class="team-sub">${ab}</div></div></div></td>
      <td class="right"><strong style="color:var(--accent)">${num(t.score)}</strong></td>
      <td class="right">${t.vaW}&ndash;${t.vaL}${luckTag}</td>
      <td class="right">${t.w}&ndash;${t.l}</td>
      <td class="right" style="color:var(--text2)">${num(t.closest)}</td>
      <td class="right" style="color:var(--text2)">${num(t.median)}</td>
      <td class="right">${t.lossU7}</td>
      <td class="right" style="color:var(--text2)">${num(t.pctOver*100)}%</td>
    </tr>`;
  }).join('');
  el.innerHTML=`<div class="tscroll"><table class="min720 srt bb-tbl" data-mhide="Closest L,Median L">
      <thead><tr>
        <th data-nosort>#</th><th>Team</th>
        <th class="right">Score</th><th class="right">vs&#8209;Avg</th><th class="right">Record</th>
        <th class="right">Closest&nbsp;L</th><th class="right">Median&nbsp;L</th><th class="right">L&lt;7</th><th class="right" title="Share of losses where they still outscored the week's league average">%&nbsp;Over&nbsp;Avg</th>
      </tr></thead><tbody>${rows}</tbody></table></div>
    <div class="bb-key">
      <div class="bb-key-h">What each column means</div>
      <div class="bb-key-g">
        <div class="bb-key-i"><b>Score</b><span>Overall bad-beat rating — higher means unluckier.</span></div>
        <div class="bb-key-i"><b>vs-Avg</b><span>Record if they'd played the league average each week, with the gap to their real record.</span></div>
        <div class="bb-key-i"><b>Record</b><span>Actual wins and losses.</span></div>
        <div class="bb-key-i"><b>Closest L</b><span>Narrowest margin of defeat, in points.</span></div>
        <div class="bb-key-i"><b>Median L</b><span>Typical margin of defeat, in points.</span></div>
        <div class="bb-key-i"><b>L&lt;7</b><span>Losses by fewer than 7 points.</span></div>
        <div class="bb-key-i"><b>% Over Avg</b><span>Share of losses where they still beat the week's league average — the purest bad-beat signal.</span></div>
      </div>
      <div class="bb-key-n">Regular season through week ${regEndOf(getSeason())}.</div>
    </div>`;
  badBeatCols();
}
// Bad Beat table: pull the rank tight to the team and leave exactly 8px between
// the longest team name and the start of the Score column.
function badBeatCols(){
  const t=document.querySelector('#badbeat-body table.bb-tbl'); if(!t) return;
  const head=t.tHead&&t.tHead.rows[0], body=t.tBodies&&t.tBodies[0];
  if(!head||!body||!body.rows.length) return;
  // desktop keeps the original stretched table; only phones get fitted columns
  if(!window.matchMedia('(max-width:768px)').matches){
    t.style.removeProperty('--bbw');
    [...head.cells].forEach((c,i)=>t.style.removeProperty('--bbc'+(i+1)));
    return;
  }
  // measure at natural width, then pin each column to its own content so the
  // table is only as wide as it needs to be (no stretched, far-apart columns)
  t.classList.add('bb-measure');
  const widths=[...head.cells].map((c,i)=>{
    if(getComputedStyle(c).display==='none') return 0;
    let m=c.getBoundingClientRect().width;
    for(const r of body.rows){ const cell=r.cells[i]; if(!cell) continue;
      const x=cell.getBoundingClientRect().width; if(x>m) m=x; }
    return Math.ceil(m)+3;
  });
  t.classList.remove('bb-measure');
  widths.forEach((w,i)=>t.style.setProperty('--bbc'+(i+1), w?w+'px':'0px'));
  t.style.setProperty('--bbw', widths.reduce((a,b)=>a+b,0)+'px');
}
// ── TEAM PROFILE ─────────────────────────────────────────────────────────────
let _brCache={};
// The winners' bracket, traced from the finalists — ESPN's playoffSeed can't be
// trusted for this league (manual matchup edits mean the 7 seed has made the
// bracket while the 6 seed went to the consolation ladder).
function bracketOf(season){
  if(!(season in _brCache)){ try{ _brCache[season]=buildBracket(season); }catch{ _brCache[season]=null; } }
  return _brCache[season];
}
function franchiseAllTime(owner){
  let w=0,l=0,t=0,pf=0,pa=0,rings=0,best=99,worst=0,poW=0,poApp=0,hi=null,lo=null;const seasons=new Set(),played=new Set();
  let top3=0,over150=0,under80=0;const finishes=[];const results=[];
  ALL_SEASONS.forEach(s=>{
    const meta=_seasonMeta[s]; if(!meta) return;
    const owners=meta.owners||{},teams=meta.teams||{};
    const tid=Object.keys(owners).find(id=>owners[id]===owner);
    if(tid==null) return;
    const ti=teams[tid]; if(ti){if(ti.rank===1)rings++;
      if(ti.rank){best=Math.min(best,ti.rank);worst=Math.max(worst,ti.rank);finishes.push(ti.rank);if(ti.rank<=3)top3++;}}
    // playoff appearances and wins come from the real bracket, not from seeds
    const br=bracketOf(s), myId=Number(tid);
    if(br){
      let inBracket=false;
      (br.rounds||[]).forEach(r=>{
        (r.games||[]).forEach(g=>[g.a,g.b].forEach(side=>{ if(side.tid===myId){ inBracket=true; if(side.win) poW++; } }));
        (r.byes||[]).forEach(b=>{ if(Number(b)===myId) inBracket=true; });
      });
      if(inBracket) poApp++;
    }
    (meta.schedule||[]).forEach(m=>{
      if(!m.home||!m.away)return;const hp=m.home.totalPoints||0,ap=m.away.totalPoints||0;if(hp===0&&ap===0)return;
      if(String(m.home.teamId)===tid){played.add(s);pf+=hp;pa+=ap;if(hp>150)over150++;if(hp<80)under80++;
        results.push({s:Number(s),wk:m.matchupPeriodId||0,r:hp>ap?1:(hp<ap?-1:0)});if(hi==null||hp>hi.pts)hi={pts:hp,season:s,week:m.matchupPeriodId};if(lo==null||hp<lo.pts)lo={pts:hp,season:s,week:m.matchupPeriodId};if(m.winner==='HOME'||hp>ap)w++;else if(hp<ap)l++;else t++;}
      else if(String(m.away.teamId)===tid){played.add(s);pf+=ap;pa+=hp;if(ap>150)over150++;if(ap<80)under80++;
        results.push({s:Number(s),wk:m.matchupPeriodId||0,r:ap>hp?1:(ap<hp?-1:0)});if(hi==null||ap>hi.pts)hi={pts:ap,season:s,week:m.matchupPeriodId};if(lo==null||ap<lo.pts)lo={pts:ap,season:s,week:m.matchupPeriodId};if(m.winner==='AWAY'||ap>hp)w++;else if(ap<hp)l++;else t++;}
    });
  });
  played.forEach(y=>seasons.add(y));           // only seasons actually played
  const avgFinish=finishes.length?finishes.reduce((a,b)=>a+b,0)/finishes.length:null;
  // longest win / losing streaks across every game in chronological order
  results.sort((a,b)=>a.s-b.s||a.wk-b.wk);
  let wStreak=0,lStreak=0,cw=0,cl=0;
  results.forEach(g=>{
    if(g.r===1){ cw++; cl=0; } else if(g.r===-1){ cl++; cw=0; } else { cw=0; cl=0; }
    if(cw>wStreak) wStreak=cw; if(cl>lStreak) lStreak=cl;
  });
  return {w,l,t,pf,pa,seasons:seasons.size,playedSeasons:played.size,rings,playoffWins:poW,playoffApps:poApp,
    best:best===99?null:best,worst:worst||null,hi,lo,top3,avgFinish,over150,under80,
    winStreak:wStreak,loseStreak:lStreak,
    confs:(_hardware[owner]?.confs)||0};
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
function gradeTint(hex,a){
  const m=String(hex||'').match(/^#?([0-9a-f]{6})$/i);
  if(!m) return `rgba(255,255,255,${a})`;
  const n=parseInt(m[1],16);
  return `rgba(${(n>>16)&255},${(n>>8)&255},${n&255},${a})`;
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
  const tabsOnly=`<div class="standings-filters" style="padding:0;gap:6px">${tabBtn('ppg','Points / Start')}${tabBtn('gs','Games Started')}</div>`;
  if(line.every(s=>!s.pl)) return `<div class="lineup-topbar">${tabsOnly}</div><div class="tab-loading" style="padding:24px">No roster history found for this team.</div>`;
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
  let gradeChip='', gradeNote='';
  if(mode==='ppg'){
    const g=ppgGradeFor(owner); const gc=gradeColor(g.grade);
    gradeChip=`<div class="lg-chip" style="background:${gradeTint(gc,0.13)};border-color:${gradeTint(gc,0.45)}">
      <div class="lg-chip-num"><span class="lg-score">${g.score.toFixed(1)}</span><span class="lg-label">PPG</span></div>
      <div class="lg-gwrap"><span class="lg-glabel">All Time GFL Team Grade</span><div class="lg-grade" style="color:${gc};border-color:${gc}">${g.grade}</div></div>
    </div>`;
    gradeNote=`<div class="lg-note">Sum of all 9 starters' points-per-start.${g.n?` Graded across all ${g.n} teams — ranked #${g.rank} of ${g.n}.`:''}</div>`;
  }
  const note = mode==='ppg'
    ? 'Highest points-per-start at each spot (min. 5 starts). FLEX = best remaining RB/WR/TE.'
    : 'Most-started player at each spot, all-time (games started → weeks rostered → points). FLEX = best remaining RB/WR/TE.';
  return `<div class="lineup-topbar">${tabsOnly}${gradeChip}</div>`+body+gradeNote+`<div style="padding:8px 2px 0;font-size:12px;color:var(--text3)">${note}</div>`;
}
// All-Time vs Each Team on phones: the same one-line list the Matchup History
// tab uses, so the section never needs a sideways scroll.
function profOppMobileHTML(rows){
  const abbr=fr=>{const t=_teams.find(x=>_ownerMap[x.id]===fr.owner); return (t&&t.abbrev)||teamInitials(fr.name);};
  const cols=['Team','W','L','Win%'];
  const head=`<div class="om-row om-head">${cols.map((c,i)=>`<span class="${i===0?'om-team ':''}om-sort" data-col="${i}" onclick="sortOM(this,${i})">${c}<i class="om-arw"></i></span>`).join('')}</div>`;
  const body=rows.map(r=>`<div class="om-row">
      <span class="om-team" data-v="${abbr(r.opp)}">${franchiseAvatar(r.opp,22,6)}<span class="om-ab">${abbr(r.opp)}</span></span>
      <span data-v="${r.w}" style="color:var(--green);font-weight:700">${r.w}</span>
      <span data-v="${r.l}" style="color:var(--red)">${r.l}</span>
      <span data-v="${r.pct}" style="font-weight:600;color:${r.pct>=0.5?'var(--green)':'var(--red)'}">${(r.pct*100).toFixed(0)}%</span>
    </div>`).join('');
  return `<div class="om-list">${head}${body}</div>`;
}
let _omSort={col:null,asc:false};
function sortOM(el,col){
  const list=el.closest('.om-list'); if(!list) return;
  const asc=(_omSort.col===col)?!_omSort.asc:(col===0);
  _omSort={col,asc};
  const rows=[...list.querySelectorAll('.om-row:not(.om-head)')];
  const val=r=>{const c=r.children[col];const v=c?.dataset.v??c?.textContent??'';const n=parseFloat(v);return (v!==''&&!isNaN(n))?n:String(v).toLowerCase();};
  rows.sort((x,y)=>{const p=val(x),q=val(y);
    if(typeof p==='number'&&typeof q==='number') return asc?p-q:q-p;
    return asc?String(p).localeCompare(String(q)):String(q).localeCompare(String(p));});
  rows.forEach(r=>list.appendChild(r));
  list.querySelectorAll('.om-head .om-sort').forEach((sp,i)=>{
    sp.classList.toggle('sorted',i===col);
    const a=sp.querySelector('.om-arw'); if(a) a.textContent=(i===col)?(asc?' \u2191':' \u2193'):'';
  });
}
function profileDraftsHTML(owner){
  const dc=_draftAllCache;
  if(!dc){ return `<div class="tab-loading" style="padding:22px"><i class="fa fa-circle-notch"></i>Crunching past drafts…</div>`; }
  const mine=(dc.teamDrafts||[]).filter(d=>d.owner===owner);
  if(!mine.length) return `<div class="tab-loading" style="padding:22px">No draft history for this team.</div>`;
  // grade each of this manager's drafts on the same scale the Draft page uses:
  // adj = summed positional delta minus that season's league average.
  const bySeason={};
  (dc.teamDrafts||[]).forEach(d=>{ (bySeason[d.season]||(bySeason[d.season]=[])).push(d.adj); });
  const rows=mine.slice().sort((x,y)=>y.season-x.season).map(d=>{
    const vals=bySeason[d.season]||[d.adj];
    const mn=Math.min(...vals), mx=Math.max(...vals);
    const t=mx>mn?(d.adj-mn)/(mx-mn):1;
    const grade=PPG_GRADES[Math.round(t*(PPG_GRADES.length-1))];
    const col=gradeColor(grade);
    const rank=vals.slice().sort((p,q)=>q-p).indexOf(d.adj)+1;
    return `<div class="pd-row">
      <span class="pd-yr">${d.season}</span>
      <span class="pd-grade" style="color:${col};border-color:${col}">${grade}</span>
      <span class="pd-score" style="color:${col}">${d.adj>0?'+':''}${Math.round(d.adj)}</span>
      <span class="pd-rank">#${rank} of ${vals.length}</span>
    </div>`;}).join('');
  return `<div class="pd-list">${rows}</div>
    <div style="font-size:11.5px;color:var(--text3);padding:9px 2px 0;line-height:1.5">Draft Score = summed positional &Delta; (draft rank &minus; finish rank per pick) minus that season's league average; graded across the league that year.</div>`;
}
// Zebra-stripe the profile stat rows. The stats sit in an auto-fit grid, so the
// column count changes with width — work out the real rows before tagging.
function stripeProfileStats(){
  document.querySelectorAll('#page-teams .prof-stats').forEach(g=>{
    const cols=(getComputedStyle(g).gridTemplateColumns||'').split(' ').filter(Boolean).length||1;
    [...g.children].forEach((el,i)=>{ el.classList.toggle('pstat-alt', Math.floor(i/cols)%2===1); });
  });
}
// ── BIGGEST ENEMIES ──────────────────────────────────────────────────────────
// Weekly starting lineups, paired with the schedule, tell us which players have
// scored the most against a given franchise (and how those games went).
let _lineups=null,_lineupsLoading=false;
function loadLineups(){
  if(_lineups||_lineupsLoading) return;
  _lineupsLoading=true;
  Promise.all(ALL_SEASONS.map(async s=>({s,d:await histJSON('lineups',s,`${BASE}?type=lineups&seasonId=${s}&v=1`)})))
    .then(res=>{ const out={}; res.forEach(({s,d})=>{ if(d&&d.weeks) out[s]=d; }); _lineups=out; })
    .catch(()=>{ _lineups={}; })
    .finally(()=>{ _lineupsLoading=false;
      if(_activeTab==='teams'&&document.getElementById('prof-enemies')) renderProfile(); });
}
function enemiesFor(owner){
  if(!_lineups) return null;
  const agg={};
  ALL_SEASONS.forEach(s=>{
    const L=_lineups[s], meta=_seasonMeta[s]; if(!L||!meta) return;
    const myTid=Object.keys(meta.owners||{}).find(id=>meta.owners[id]===owner); if(myTid==null) return;
    (meta.schedule||[]).forEach(m=>{
      if(!m.home||!m.away) return;
      const hp=m.home.totalPoints||0, ap=m.away.totalPoints||0; if(hp===0&&ap===0) return;
      let oppTid=null, oppWon=false;
      if(String(m.home.teamId)===myTid){ oppTid=m.away.teamId; oppWon=ap>hp; }
      else if(String(m.away.teamId)===myTid){ oppTid=m.home.teamId; oppWon=hp>ap; }
      else return;
      const arr=L.weeks&&L.weeks[m.matchupPeriodId]&&L.weeks[m.matchupPeriodId][oppTid];
      if(!arr) return;
      arr.forEach(([pid,pts])=>{
        const r=agg[pid]||(agg[pid]={pid,name:(L.names&&L.names[pid])||('#'+pid),pts:0,g:0,w:0});
        r.pts+=pts; r.g++; if(oppWon) r.w++;
        if(L.names&&L.names[pid]) r.name=L.names[pid];
      });
    });
  });
  return Object.values(agg).filter(r=>r.g>0).sort((a,b)=>b.pts-a.pts||b.g-a.g).slice(0,10);
}
/* The "New video" ribbon changes colour every week. Driven off the week number
   rather than a random pick, so it is stable for everyone all week and only
   turns over when the chat week does. */
const NEW_VID_COLORS=['#E86043','#E89845','#E8C656','#66E89D','#5CE8B3','#63E0E8',
                      '#587DE8','#6C6AE8','#9F61E8','#E860AF','#CBE853','#E0B67B'];
function newVideoColor(){
  const wk=Math.floor(msgWeekStart()/604800000);   // Tuesday-anchored week index
  return NEW_VID_COLORS[((wk%NEW_VID_COLORS.length)+NEW_VID_COLORS.length)%NEW_VID_COLORS.length];
}

/* drives the drawn scroll indicator under the video carousel */
function wireVidRail(){
  const sc=document.querySelector('.vid-scroll'), th=document.getElementById('vid-rail-thumb');
  if(!sc||!th||sc.dataset.railed) return;
  sc.dataset.railed='1';
  const draw=()=>{
    const max=sc.scrollWidth-sc.clientWidth;
    const frac=sc.clientWidth/Math.max(1,sc.scrollWidth);
    th.style.width=(frac*100).toFixed(2)+'%';
    const p=max>0?sc.scrollLeft/max:0;
    th.style.transform=`translateX(${(p*(100/Math.max(frac,0.0001)-100)).toFixed(2)}%)`;
  };
  sc.addEventListener('scroll',draw,{passive:true});
  window.addEventListener('resize',draw);
  draw();
}

/* Most recent board post, surfaced on the homepage. Reads the same weekly
   window the Messages tab shows, so a stale post from last week never sits
   here pretending to be current. */
async function renderHomeMessage(){
  const el=document.getElementById('home-msg'); if(!el) return;
  if(!_msgs){ el.innerHTML='<div class="lr-none">Loading…</div>'; const l=await msgList(); if(l) _msgs=l; }
  const wk=msgWeekStart();
  const list=(_msgs||[]).filter(m=>Number(m.ts)>=wk);
  const m=list[0];
  if(!m){ el.innerHTML=`<div class="hm-empty">Nothing said yet this week.
    <button class="mv-btn hm-go" onclick="switchTab('messages')">Open the board</button></div>`; return; }
  const t=_teams.find(x=>String(x.id)===String(m.team));
  const reacts=Object.entries(m.reactions||{});
  el.innerHTML=`<div class="hm-h">Latest message</div>
  <div class="hm-msg" onclick="switchTab('messages')" role="button" tabindex="0">
    <div class="hm-av">${m.team?logoImg(Number(m.team)):'<i class="fa fa-user"></i>'}</div>
    <div class="hm-body">
      <div class="hm-meta"><span class="hm-who">${t?t.name:(m.user||'Someone')}</span><span class="hm-when">${msgAgo(m.ts)}</span></div>
      <div class="hm-text">${String(m.text).replace(/[<>&]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;'}[c]))}</div>
      ${reacts.length?`<div class="hm-reacts">${reacts.slice(0,5).map(([k,u])=>`<span class="hm-chip">${k}<b>${u.length}</b></span>`).join('')}</div>`:''}
    </div>
    <i class="fa fa-chevron-right hm-arw"></i>
  </div>`;
}

/* ── ROSTER ─────────────────────────────────────────────────────────────────
   The signed-in team's current lineup, taken from the live roster for the week
   on the clock. Starters first in slot order, then the bench. */
const SLOT_NAMES={0:'QB',2:'RB',3:'RB/WR',4:'WR',5:'WR/TE',6:'TE',7:'OP',16:'D/ST',17:'K',
  20:'BE',21:'IR',23:'FLEX',24:'ER'};
const BENCH_SLOTS=[20,21,24];
let _rosterCache=null,_rosterTeam=null;
function setRosterTeam(id){ _rosterTeam=String(id); renderRoster(); }
/* every team as a tile, so any roster is one tap away */
function rosterPickerHTML(){
  const cur=String(_rosterTeam||'');
  return `<div class="rp-grid">${_teams.map(t=>`
    <button class="rp-cell${String(t.id)===cur?' on':''}" onclick="setRosterTeam(${t.id})" title="${t.name}">
      ${logoImg(t.id,'rp-logo')}
      <span class="rp-ab">${(t.abbrev||teamInitials(t.name))}</span>
    </button>`).join('')}</div>`;
}
async function renderRoster(){
  const el=document.getElementById('roster-body'); if(!el) return;
  // default to your own team once signed in, otherwise the first team
  if(!_rosterTeam) _rosterTeam=String((_me&&_me.teamId)||_teams[0]?.id||'');
  if(!_rosterTeam){ el.innerHTML='<div class="tab-loading" style="padding:24px">No teams yet.</div>'; return; }
  const info=liveWeekInfo();
  if(!info){ el.innerHTML='<div class="tab-loading" style="padding:24px">No season data yet.</div>'; return; }
  const key=`${info.season}-${info.week}-${_rosterTeam}`;
  if(!_rosterCache||_rosterCache.key!==key){
    el.innerHTML=rosterPickerHTML()+`<div class="tab-loading"><i class="fa fa-circle-notch"></i>Loading roster…</div>`;
    try{
      const r=await fetch(`${BASE}?view=mRoster&seasonId=${info.season}&scoringPeriodId=${info.week}&live=1`,{cache:'no-store'});
      const j=r.ok?await r.json():{};
      const t=(j.teams||[]).find(x=>String(x.id)===String(_rosterTeam));
      const rows=((t&&t.roster&&t.roster.entries)||[]).map(e=>{
        const p=e.playerPoolEntry?.player||{};
        const wk=(p.stats||[]).find(s=>s.statSourceId===0&&s.scoringPeriodId===info.week);
        const proj=(p.stats||[]).find(s=>s.statSourceId===1&&s.scoringPeriodId===info.week);
        return {pid:e.playerId,n:p.fullName||('#'+e.playerId),slot:e.lineupSlotId,
          pos:SLOT_NAMES[e.lineupSlotId]||'',pts:wk?.appliedTotal??null,
          proj:proj?.appliedTotal??null,
          inj:String(e.injuryStatus||p.injuryStatus||'').toUpperCase(),
          bench:BENCH_SLOTS.includes(e.lineupSlotId)};
      });
      _rosterCache={key,rows,season:info.season,week:info.week};
    }catch(err){ el.innerHTML=rosterPickerHTML()+`<div class="tab-loading" style="color:var(--red)">Could not load roster: ${err.message}</div>`; return; }
  }
  const {rows,season,week}=_rosterCache;
  // ESPN returns the teams but no entries until a season has drafted
  if(!rows.length){ el.innerHTML=rosterPickerHTML()+`<div class="lr-none">No ${season} roster yet — this fills in once the draft is done.</div>`; return; }
  const num=v=>v==null?'—':Number(v).toFixed(1);
  const injTag=s=>!s||s==='ACTIVE'||s==='NORMAL'?'':
    `<span class="rs-inj ${/OUT|INJURY_RESERVE|IR|SUSPENSION/.test(s)?'bad':''}">${s.slice(0,3)}</span>`;
  const line=p=>`<div class="rs-row${p.bench?' rs-bench':''}">
      <span class="rs-slot">${p.pos}</span>
      ${playerImg(p.pid,26,p.n)}
      <span class="rs-name">${p.n}${injTag(p.inj)}</span>
      <span class="rs-proj">${num(p.proj)}</span>
      <span class="rs-pts">${num(p.pts)}</span>
    </div>`;
  const starters=rows.filter(p=>!p.bench), bench=rows.filter(p=>p.bench);
  const tot=a=>a.reduce((s,p)=>s+(p.pts||0),0);
  const tn=(_teams.find(t=>String(t.id)===String(_rosterTeam))||{}).name||'';
  el.innerHTML=rosterPickerHTML()+`
    <div class="rs-head"><span>${tn} · Week ${week}</span><span class="rs-tot">${tot(starters).toFixed(1)} pts</span></div>
    <div class="rs-cols"><span class="rs-slot">Slot</span><span></span><span class="rs-name">Player</span>
      <span class="rs-proj">Proj</span><span class="rs-pts">Pts</span></div>
    ${starters.map(line).join('')}
    ${bench.length?`<div class="rs-sub">Bench</div>${bench.map(line).join('')}`:''}`;
}

/* ── THIS WEEK ──────────────────────────────────────────────────────────────
   The week on the clock at a glance: every matchup, and your own first. */
function renderWeek(){
  const el=document.getElementById('week-body'); if(!el) return;
  const info=_liveInfo||liveWeekInfo();
  if(!info){ el.innerHTML='<div class="tab-loading" style="padding:24px">No season data yet.</div>'; return; }
  const owners=info.meta.owners||{};
  const nm=id=>(_teams.find(t=>t.id===id)||{}).name||'Team';
  const rec=id=>{const t=_teams.find(x=>x.id===id);return t?`${t.wins}-${t.losses}`:'';};
  const mine=_me&&_me.teamId?Number(_me.teamId):null;
  const games=(info.games||[]).slice().sort((a,b)=>{
    const am=a.home.teamId===mine||a.away.teamId===mine, bm=b.home.teamId===mine||b.away.teamId===mine;
    return (bm?1:0)-(am?1:0);
  });
  const card=m=>{
    const a=m.home.totalPoints||0,b=m.away.totalPoints||0;
    const started=a>0||b>0;
    const yours=mine&&(m.home.teamId===mine||m.away.teamId===mine);
    const row=(id,score,lead)=>`<div class="lv-row${lead?' lv-lead':''}">
        ${logoImg(id,'lv-logo')}<span class="lv-nm">${nm(id)}</span>
        <span class="lv-rec">${rec(id)}</span><span class="lv-pct"></span>
        <span class="lv-sc">${score.toFixed(1)}</span></div>`;
    return `<div class="lv-card${yours?' wk-mine':''}">
      <div class="lv-status"><span class="${started?'lv-live':'lv-pre'}">${started?'In progress':'Not started'}</span>
        ${yours?'<span class="wk-tag">Your matchup</span>':''}</div>
      ${row(m.home.teamId,a,started&&a>b)}
      ${row(m.away.teamId,b,started&&b>a)}
    </div>`;
  };
  el.innerHTML=`
    <div class="rs-head"><span>${info.season} · Week ${info.week}</span>
      <span class="rs-tot">${games.length} matchup${games.length===1?'':'s'}</span></div>
    <div class="lv-grid">${games.map(card).join('')||'<div class="lr-none">No matchups scheduled.</div>'}</div>`;
  weekPunishment();
  weekMoves(info);
  weekTopPerformers(info);
}
/* the punishment on the clock, same card the homepage shows */
function weekPunishment(){
  const el=document.getElementById('week-punish'); if(!el) return;
  el.innerHTML=homePunishHTML();
}
/* adds, drops and trades processed in the current week */
function weekMoves(info){
  const el=document.getElementById('week-moves'); if(!el) return;
  const teamMap={}; _teams.forEach(t=>teamMap[t.id]=t.name);
  const wk=Number(info.week);
  const mine=(_transactions||[]).filter(t=>Number(t.scoringPeriodId)===wk);
  const rows=mine.slice(0,12).map(tx=>renderTx(tx,teamMap)).filter(Boolean).join('');
  el.innerHTML=rows||`<div class="lr-none">No moves recorded in week ${info.week} yet.</div>`;
}
/* the week's best started performances across the whole league */
let _weekTopCache=null;
async function weekTopPerformers(info){
  const el=document.getElementById('week-top'); if(!el) return;
  const key=`${info.season}-${info.week}`;
  if(!_weekTopCache||_weekTopCache.key!==key){
    el.innerHTML=`<div class="tab-loading"><i class="fa fa-circle-notch"></i>Reading this week's lineups…</div>`;
    try{
      const r=await fetch(`${BASE}?view=mRoster&seasonId=${info.season}&scoringPeriodId=${info.week}&live=1`,{cache:'no-store'});
      const j=r.ok?await r.json():{};
      const owners=info.meta.owners||{};
      const out=[];
      (j.teams||[]).forEach(t=>{
        ((t.roster&&t.roster.entries)||[]).forEach(e=>{
          if(BENCH_SLOTS.includes(e.lineupSlotId)) return;      // started only
          const p=e.playerPoolEntry?.player||{};
          const wk=(p.stats||[]).find(s=>s.statSourceId===0&&s.scoringPeriodId===Number(info.week));
          const pts=wk?.appliedTotal;
          if(pts==null) return;
          out.push({pid:e.playerId,n:p.fullName||('#'+e.playerId),pts,tid:t.id,
            slot:SLOT_NAMES[e.lineupSlotId]||''});
        });
      });
      out.sort((a,b)=>b.pts-a.pts);
      _weekTopCache={key,rows:out.slice(0,10)};
    }catch(err){ el.innerHTML=`<div class="lr-none">Could not read lineups: ${err.message}</div>`; return; }
  }
  const rows=_weekTopCache.rows;
  if(!rows.length){ el.innerHTML=`<div class="lr-none">No scores posted for week ${info.week} yet.</div>`; return; }
  el.innerHTML=rows.map((p,i)=>`<div class="wt-row">
      <span class="wt-rank">${i+1}</span>
      ${playerImg(p.pid,26,p.n)}
      <span class="wt-name">${p.n}<span class="wt-slot">${p.slot}</span></span>
      ${logoImg(p.tid,'wt-logo')}
      <span class="wt-pts">${p.pts.toFixed(1)}</span>
    </div>`).join('');
}

/* ── SECTION JUMP NAV ───────────────────────────────────────────────────────
   Under the title rule, a row of chips listing the sections on this tab. Built
   by reading the page's own top-level headings rather than a hand-kept list,
   so it can never drift out of step with what is actually rendered. Anchors are
   assigned on the fly and scrolling is offset for the fixed nav capsule. */
/* One list used by both the chip builder and the jump, so a heading that
   produces no label can never shift the two out of step. Ordered the way the
   page reads — top row left to right, then the next row — because the
   homepage lays its sections out in columns and DOM order zig-zags. */
function sectionEntriesIn(page){
  /* [data-nochip] marks a subtree whose headings title a view rather than a
     section of the page — the draft panels retitle themselves as you switch
     between Rankings, All-Time Drafts and Steals & Busts, which otherwise
     spawns a fresh chip at the top every time. */
  return [...page.querySelectorAll('.sec-head, .section-header, .lh-sec-head')]
    .filter(h=>h.offsetParent!==null && !h.closest('.modal') && !h.closest('[data-nochip]'))
    .map(h=>{
      const c=h.cloneNode(true);
      c.querySelectorAll('.badge-info,[id$="-score"],.dsb-lbl,.lg-grade,.lr-wk-tag').forEach(n=>n.remove());
      const label=(c.textContent||'').replace(/\s+/g,' ').replace(/[—–-]\s*\d{4}\s*$/,'').trim();
      const r=h.getBoundingClientRect();
      return {h,label,top:r.top+window.pageYOffset,left:r.left};
    })
    .filter(x=>x.label)
    .sort((a,b)=>Math.abs(a.top-b.top)>40 ? a.top-b.top : a.left-b.left);
}
const sectionHeadsIn=page=>sectionEntriesIn(page).map(x=>x.h);
/* Most tabs render their sections only once their data arrives, so a nav built
   at switch time sees an empty page — Team Profiles came up with no chips at
   all on a cold load. Watching the page and rebuilding when it changes covers
   every tab without each render function having to remember to call back.
   #sec-nav sits outside the page, so rebuilding cannot retrigger this. */
let _secNavObs=null,_secNavTimer=null,_secNavBusy=false;
function watchSectionNav(tab){
  if(_secNavObs){ _secNavObs.disconnect(); _secNavObs=null; }
  clearTimeout(_secNavTimer);
  const page=document.getElementById('page-'+tab); if(!page) return;
  _secNavObs=new MutationObserver(recs=>{
    /* Ignore anything we caused ourselves inside a jump bar. Advanced Stats
       hosts its bar within the page, so rebuilding it mutates the element being
       observed — which rebuilt it again, and the chips flickered continuously. */
    if(_secNavBusy) return;
    const outside=recs.some(r=>{
      const el=r.target&&(r.target.nodeType===1?r.target:r.target.parentElement);
      return !el || !el.closest || !el.closest('.sec-nav');
    });
    if(!outside) return;
    clearTimeout(_secNavTimer);
    _secNavTimer=setTimeout(()=>{ if(_activeTab===tab) buildSectionNav(tab); },200);
  });
  /* childList only, deliberately. initMobileTables watches main for childList
     and its pass always rewrites table classes, so watching attributes here
     closed a loop: our rebuild wrote innerHTML, that woke their observer, their
     class churn woke ours, and the chips flickered forever. View switches are
     the only attribute-driven change that matters and setStatsView rebuilds the
     bar itself, so nothing is lost. */
  _secNavObs.observe(page,{childList:true,subtree:true});
}
/* Chip labels are shortened rather than clipped — a truncated label is worse
   than an abbreviated one. The full text stays in the title attribute. */
const SX_ABBR={
  'All-Time Starting Lineup':'AT Lineup',
  'All-Time vs Each Team':'AT vs Team',
  'Live Around the League':'Live League',
  'Historical Matchup Records':'Matchup Records',
  'Conference Championships':'Conferences',
  'Season Superlatives':'Superlatives',
  'Player Tenure':'Tenure',
  'Playoff Hardware':'Hardware',
  'Matchup of the Week':'Matchup',
  'All-Time Records':'AT Records',
  'Draft Rankings':'Rankings',
  'Draft Report':'Report',
  'Biggest Enemies':'Enemies',
  'Draft Grades':'Grades',
  'GFL Overview':'Overview',
};
const sxShort=l=>SX_ABBR[l]||l;
/* Choose an explicit column count so the last row is never a single orphan
   chip. auto-fit cannot express that, since it only knows the track width. */
function fitSectionNav(bar,n){
  const w=bar.clientWidth||0; if(!w||!n) return;
  const min=window.matchMedia('(max-width:768px)').matches?94:124;
  const gap=parseFloat(getComputedStyle(bar).columnGap)||7;
  let max=Math.max(1,Math.floor((w+gap)/(min+gap)));
  max=Math.min(max,n);
  let cols=max;
  // walk down until the remainder is not exactly one
  while(cols>1 && n>cols && n%cols===1) cols--;
  bar.style.gridTemplateColumns=`repeat(${cols},minmax(0,1fr))`;
}
function buildSectionNav(tab){
  const top=document.getElementById('sec-nav'); if(!top) return;
  _secNavBusy=true;   // our own writes must not retrigger the observer
  const page=document.getElementById('page-'+tab);
  if(!page){ top.innerHTML=''; top.hidden=true; _secNavBusy=false; return; }
  /* a page can host the bar itself (Advanced Stats puts it under its filters,
     where it reads as belonging to the selected filter rather than the tab) */
  const local=page.querySelector('.sec-nav-local');
  const bar=local||top;
  if(local){ top.innerHTML=''; top.hidden=true; }
  // Every visible heading on the page, whatever wraps it. Tabs nest their
  // headings differently — Team Profiles puts them in .panel, League History
  // uses .lh-sec-head — so keying off the section wrapper missed most of them.
  /* Advanced Stats' coaching sections are tabbed, so only one is on screen at a
     time — their chips have to come from all four regardless of visibility, or
     the bar would collapse to a single chip the moment a tab was chosen. */
  const cm=page.querySelector('#stats-cm');
  const cmOn=cm&&getComputedStyle(cm).display!=='none';
  const tn=page.querySelector('#tenure-views');
  const host=cmOn?cm:(tn||null);
  const entries=host
    ? [...host.children].filter(c=>c.classList.contains('sec'))
        .map(s=>s.querySelector('.sec-head')).filter(Boolean)
        .map(h=>({h,label:(h.textContent||'').replace(/\s+/g,' ').trim()
          .replace(/(tap a team.*|\d{4} · .*)$/,'').trim()}))
    : sectionEntriesIn(page);
  if(entries.length<2){ bar.innerHTML=''; bar.hidden=true; _secNavBusy=false; return; }
  // index into the same ordered list the jump re-derives at click time — the
  // page re-renders when its data lands, so ids assigned up front would vanish
  bar.innerHTML=entries.map((e,i)=>
    `<button class="sx-chip" data-sx="${i}" title="${e.label}" onclick="jumpToSection(this)">${sxShort(e.label)}</button>`).join('');
  bar.hidden=false;
  fitSectionNav(bar,entries.length);
  // the bar is rebuilt whenever the page mutates, so the switcher's selected
  // state has to be re-applied here rather than only when a chip is clicked
  if(cmOn) bar.querySelectorAll('.sx-chip').forEach((c,n)=>c.classList.toggle('on',n===_cmSection));
  else if(tn) bar.querySelectorAll('.sx-chip').forEach((c,n)=>c.classList.toggle('on',n===_tnSection));
  _secNavBusy=false;
}
/* Inside Advanced Stats the four coaching sections behave as tabs: one at a
   time, the overall metric by default. The chips double as the switcher there
   rather than scrolling a long stack. */
let _cmSection=0;
function showCMSection(i){
  const wrap=document.getElementById('stats-cm'); if(!wrap) return;
  const secs=[...wrap.children].filter(c=>c.classList.contains('sec'));
  if(!secs.length) return;
  _cmSection=Math.max(0,Math.min(secs.length-1,i));
  secs.forEach((s,n)=>{ s.style.display=n===_cmSection?'':'none'; });
  const bar=document.querySelector('#page-standings .sec-nav-local');
  if(bar) bar.querySelectorAll('.sx-chip').forEach((c,n)=>c.classList.toggle('on',n===_cmSection));
}
/* Player Tenure works the same way: one view at a time, chips as the switcher,
   with the team select sitting above them all. */
let _tnSection=0;
function showTenureSection(i){
  const wrap=document.getElementById('tenure-views'); if(!wrap) return;
  const secs=[...wrap.children].filter(c=>c.classList.contains('sec'));
  if(!secs.length) return;
  _tnSection=Math.max(0,Math.min(secs.length-1,i));
  secs.forEach((s,n)=>{ s.style.display=n===_tnSection?'':'none'; });
  const bar=document.querySelector('#page-tenure .sec-nav-local');
  if(bar) bar.querySelectorAll('.sx-chip').forEach((c,n)=>c.classList.toggle('on',n===_tnSection));
  // Playoff Hardware aggregates every roster a player ever sat on, so the team
  // picker has nothing to act on there
  const pick=document.getElementById('tenure-picker');
  if(pick) pick.style.display=_tnSection===1?'none':'';
  if(_tnSection===2) renderTenureEnemies();
}
function renderTenureEnemies(){
  const el=document.getElementById('tenure-enemies'); if(!el) return;
  const sel=document.getElementById('tenure-team-select');
  const owner=sel?.value||_franchises[0]?.owner;
  el.innerHTML=owner?enemiesHTML(owner):'';
}
function jumpToSection(btn){
  const page=document.getElementById('page-'+_activeTab); if(!page) return;
  // Advanced Stats swaps sections instead of scrolling to them
  if(_activeTab==='standings' && document.getElementById('stats-cm')){
    showCMSection(Number(btn.dataset.sx));
    smoothScrollTo(0);
    return;
  }
  if(_activeTab==='tenure' && document.getElementById('tenure-views')){
    showTenureSection(Number(btn.dataset.sx));
    smoothScrollTo(0);
    return;
  }
  const heads=sectionHeadsIn(page);
  // scroll to the heading itself — the wrapper differs per tab and sometimes
  // spans several sections, which would land in the wrong place
  const el=heads[Number(btn.dataset.sx)];
  if(!el) return;
  const nav=document.getElementById('floatnav');
  // clear the chip bar as well as the nav — the bar pins directly under the
  // nav, so offsetting by the nav alone parked the heading behind the chips
  const barEl=btn.closest('.sec-nav');
  const barH=(barEl&&getComputedStyle(barEl).position==='sticky')
    ? barEl.getBoundingClientRect().height : 0;
  const pad=(nav?nav.getBoundingClientRect().bottom:70)+barH+14;
  const y=Math.max(0,el.getBoundingClientRect().top+window.pageYOffset-pad);
  smoothScrollTo(y);
}
/* A plain scrollTop assignment, deliberately. Both behavior:'smooth' and a
   rAF-driven animation depend on the compositor running, and silently do
   nothing where it isn't — which left the jump chips dead. Assigning scrollTop
   always lands, and `html{scroll-behavior:smooth}` in the stylesheet gives real
   browsers the easing for free (and is disabled under reduced motion there). */
function smoothScrollTo(target){
  const doc=document.scrollingElement||document.documentElement;
  doc.scrollTop=target;
}

/* ── LIVE MATCHUPS ──────────────────────────────────────────────────────────
   ESPN only ever reports where a matchup stands right now — there is no
   in-game history to ask for. So the history is built by watching: while the
   tab is open the scores are polled, and any time a number actually moves the
   new totals are appended to a per-week document in Firestore. That series is
   what the graphs, the largest-lead figures and the comeback records are all
   read back out of.

   One document per week holds every matchup's series, written as
   [[minutesIntoWeek, aPts, bPts], …]. Before saving, whatever is already
   stored is merged in, so two people watching at once extend the same series
   rather than clobbering each other.

   Nothing backfills. 2022-2025 have no recorded series and never will; this
   starts collecting the first time somebody loads the page during a 2026
   game. */
/* ESPN has no push, webhook or stream — the only way to learn a score changed
   is to ask again. So the cadence adapts instead: while points are actually
   landing it asks every 15s, it eases off when a window goes quiet, and it
   idles right down once the week is settled. A change is applied the moment it
   is seen, and an unchanged score is never recorded. */
const LIVE_FAST=15000;      // something scored in the last few minutes
const LIVE_BASE=45000;      // games live but quiet
const LIVE_IDLE=300000;     // week complete or not started
const LIVE_HOT_MS=240000;   // how long a change keeps the fast cadence
let _liveTimer=null,_liveSeries={},_liveInfo=null,_liveBusy=false,_liveSaved=0,_liveNext=0;
const liveDocUrl=k=>`https://firestore.googleapis.com/v1/projects/${GFL_DB.project}/databases/(default)/documents/live/${encodeURIComponent(k)}?key=${GFL_DB.key}`;
const liveCollUrl=k=>`https://firestore.googleapis.com/v1/projects/${GFL_DB.project}/databases/(default)/documents/live?documentId=${encodeURIComponent(k)}&key=${GFL_DB.key}`;
const liveMKey=(a,b)=>[a,b].sort().join('~');

/* which week is on the clock: the earliest one that still has an unplayed game */
function liveWeekInfo(){
  const season=ALL_SEASONS[ALL_SEASONS.length-1], meta=_seasonMeta[season];
  if(!meta) return null;
  const byWeek={};
  (meta.schedule||[]).forEach(m=>{
    if(!m.home||!m.away) return;
    const w=m.matchupPeriodId||0; if(!w||w>(meta.regEnd||14)+3) return;
    (byWeek[w]||(byWeek[w]=[])).push(m);
  });
  const weeks=Object.keys(byWeek).map(Number).sort((a,b)=>a-b);
  let live=null,last=null;
  weeks.forEach(w=>{
    const any=byWeek[w].some(m=>(m.home.totalPoints||0)>0||(m.away.totalPoints||0)>0);
    const all=byWeek[w].every(m=>(m.home.totalPoints||0)>0||(m.away.totalPoints||0)>0);
    if(any) last=w;
    if(live==null&&!all) live=w;
  });
  const week=live||last||weeks[0];
  return {season,week,meta,games:byWeek[week]||[],inProgress:live!=null};
}
async function liveLoadSeries(key){
  try{
    const r=await fetch(liveDocUrl(key),{cache:'no-store'});
    if(r.status===404) return {};
    if(!r.ok) return null;
    const f=fsIn(await r.json());
    try{ return JSON.parse(f.series||'{}')||{}; }catch(e){ return {}; }
  }catch(e){ return null; }
}
async function liveSaveSeries(key,series){
  const body=JSON.stringify(fsOut({series:JSON.stringify(series),updated:String(Date.now())}));
  const hdr={'Content-Type':'application/json'};
  try{
    const r=await fetch(liveDocUrl(key)+'&updateMask.fieldPaths=series&updateMask.fieldPaths=updated',
      {method:'PATCH',headers:hdr,body});
    if(r.ok) return true;
    const c=await fetch(liveCollUrl(key),{method:'POST',headers:hdr,body});
    return c.ok;
  }catch(e){ return false; }
}
/* one poll: read the live scoreboard, append anything that moved, redraw */
async function livePoll(){
  if(_liveBusy) return; _liveBusy=true;
  try{
    const info=liveWeekInfo(); if(!info){_liveBusy=false;return;}
    const owners=info.meta.owners||{};
    let games=info.games;
    // ask ESPN directly so an in-progress week reflects the current minute
    try{
      const r=await fetch(`${BASE}?view=mMatchup&seasonId=${info.season}&scoringPeriodId=${info.week}&live=1`,{cache:'no-store'});
      if(r.ok){
        const j=await r.json();
        const fresh=(j.schedule||[]).filter(m=>(m.matchupPeriodId||0)===info.week&&m.home&&m.away);
        if(fresh.length) games=fresh;
      }
    }catch(e){}
    const key=liveKeyFor(info);
    if(!_liveInfo||_liveInfo.key!==key){
      const stored=await liveLoadSeries(key);
      _liveSeries=stored||{};
    }
    _liveInfo={...info,key,games};
    const t=Math.round(Date.now()/60000);          // minute resolution is plenty
    let changed=false;
    games.forEach(m=>{
      const ao=owners[m.home.teamId], bo=owners[m.away.teamId];
      if(!ao||!bo) return;
      const k=liveMKey(ao,bo);
      const aFirst=[ao,bo].sort()[0]===ao;
      const a=aFirst?(m.home.totalPoints||0):(m.away.totalPoints||0);
      const b=aFirst?(m.away.totalPoints||0):(m.home.totalPoints||0);
      if(a===0&&b===0) return;                     // nothing has happened yet
      const arr=_liveSeries[k]||(_liveSeries[k]=[]);
      const prev=arr[arr.length-1];
      if(!prev||prev[1]!==a||prev[2]!==b){ arr.push([t,a,b]); changed=true; }
    });
    if(changed){
      _liveSaved=Date.now();
      const remote=await liveLoadSeries(key);      // merge, so parallel watchers do not clobber
      if(remote){
        Object.entries(remote).forEach(([k,arr])=>{
          const mine=_liveSeries[k]||[];
          const seen=new Set(mine.map(p=>p.join(',')));
          arr.forEach(p=>{ if(!seen.has(p.join(','))) mine.push(p); });
          mine.sort((x,y)=>x[0]-y[0]);
          _liveSeries[k]=mine;
        });
      }
      await liveSaveSeries(key,_liveSeries);
    }
    renderLiveMatchups();
    renderMyMatchupBar();   // the pinned bar is independent of the live board
  }catch(e){}
  _liveBusy=false;
}
const liveKeyFor=info=>`${info.season}-w${info.week}`;
/* ── NFL-driven trigger ─────────────────────────────────────────────────────
   Fantasy points still come from ESPN's fantasy API — it owns this league's
   scoring rules, and recomputing them from raw stats would risk our totals
   quietly disagreeing with the official ones. What the public NFL scoreboard
   gives us instead is a cheap answer to "did anything happen at all", so the
   expensive fantasy call is only made when the field actually moved.
   /api/espn?type=nflstate returns a digest of the whole board in ~1.7KB. */
const NFL_LIVE_MS=10000;    // something is being played: watch closely
const NFL_QUIET_MS=120000;  // nothing kicked off: just keep an eye out
let _nflSig=null,_nflLive=false,_nflSeen=0;
async function nflState(){
  try{
    const r=await fetch(`${BASE}?type=nflstate`,{cache:'no-store'});
    if(!r.ok) return null;
    return await r.json();
  }catch(e){ return null; }
}
/* one beat: ask the cheap endpoint, and only reach for fantasy if it moved */
async function liveTick(force){
  const st=await nflState();
  let moved=!!force;
  if(st){
    _nflLive=!!st.anyLive; _nflSeen=Date.now();
    if(st.sig!==_nflSig){ if(_nflSig!==null) moved=true; _nflSig=st.sig; }
  }else if(force===undefined){
    moved=true;                       // digest unavailable — fall back to polling directly
  }
  if(moved||!Object.keys(_liveSeries).length) await livePoll();
  else { renderLiveMatchups(); renderMyMatchupBar(); }   // keeps the cadence readout honest
}
function liveInterval(){
  if(_nflLive) return NFL_LIVE_MS;
  if(!_liveInfo||!_liveInfo.inProgress) return LIVE_IDLE;
  return NFL_QUIET_MS;
}
function liveSchedule(override){
  if(_liveTimer) clearTimeout(_liveTimer);
  const ms=override||liveInterval();
  _liveNext=Date.now()+ms;
  _liveTimer=setTimeout(async()=>{
    if(document.visibilityState==='visible') await liveTick();
    liveSchedule();
  },ms);
}
function liveStart(){
  liveStop();
  /* Schedule before the async work, not after. The homepage render can run
     again while the first fetch is still in flight, and each liveStart begins
     by clearing the timer — so a timer that only got set at the end of the
     chain could be cancelled forever and the board would quietly stop
     updating. Setting it up front means one always exists; the chain just
     re-times it once the real cadence is known. */
  liveSchedule(8000);      // short bootstrap tick; the chain re-times it properly
  livePoll().then(()=>liveTick(false)).then(()=>liveSchedule()).catch(()=>liveSchedule());
  document.addEventListener('visibilitychange',liveVis);
}
/* coming back to the tab should never show a stale board */
function liveVis(){ if(document.visibilityState==='visible'){ liveTick(true).then(liveSchedule); } }
function liveStop(){ if(_liveTimer) clearTimeout(_liveTimer); _liveTimer=null; _liveNext=0;
  document.removeEventListener('visibilitychange',liveVis); }
/* manual nudge from the board */
function liveRefreshNow(){ liveTick(true).then(liveSchedule); }

/* margin sparkline — the shape of the game, zero line through the middle */
function liveSpark(series,w=150,h=34){
  if(!series||series.length<2) return `<div class="lv-nospark">no movement recorded yet</div>`;
  const marg=series.map(p=>p[1]-p[2]);
  const mx=Math.max(6,...marg.map(Math.abs));
  const step=w/(series.length-1);
  const y=v=>h/2-(v/mx)*(h/2-2);
  const pts=marg.map((v,i)=>`${(i*step).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const last=marg[marg.length-1];
  const col=last>0?'#5DE883':last<0?'#E8687E':'var(--text3)';
  return `<svg class="lv-spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
    <line x1="0" y1="${h/2}" x2="${w}" y2="${h/2}" stroke="rgba(255,255,255,0.18)" stroke-width="1"/>
    <polyline points="${pts}" fill="none" stroke="${col}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
  </svg>`;
}
/* biggest comeback and largest lead, read back out of the recorded series */
function liveRecordsFrom(seriesByWeek){
  const best={};                                   // owner -> {deficit, week, opp}
  const leads={};
  Object.entries(seriesByWeek).forEach(([wkKey,byMatch])=>{
    Object.entries(byMatch||{}).forEach(([k,arr])=>{
      if(!arr||arr.length<2) return;
      const [a,b]=k.split('~');
      const fin=arr[arr.length-1];
      const winner=fin[1]>fin[2]?a:fin[2]>fin[1]?b:null;
      if(!winner) return;
      let worst=0,lead=0;
      arr.forEach(p=>{
        const m=p[1]-p[2];                          // + means a leads
        const winnerMargin=winner===a?m:-m;
        if(winnerMargin<worst) worst=winnerMargin;
        if(Math.abs(m)>Math.abs(lead)) lead=m;
      });
      const deficit=Math.abs(worst);
      if(deficit>0&&(!best[winner]||deficit>best[winner].deficit))
        best[winner]={deficit,week:wkKey,opp:winner===a?b:a};
      const leader=lead>0?a:b;
      const mag=Math.abs(lead);
      if(!leads[leader]||mag>leads[leader].lead) leads[leader]={lead:mag,week:wkKey,opp:leader===a?b:a};
    });
  });
  return {best,leads};
}
/* Your own matchup, as a compact bar pinned to the bottom of every screen.
   Only while signed in — signed out there is no "your team" to show. The same
   markup is reused at the foot of the live board. */
function myMatchupHTML(compact){
  const info=_liveInfo; if(!info||!_me||!_me.teamId) return '';
  const owners=info.meta.owners||{};
  const mine=Number(_me.teamId);
  const g=(info.games||[]).find(m=>m.home.teamId===mine||m.away.teamId===mine);
  if(!g) return '';
  const home=g.home.teamId===mine;
  const me=home?g.home:g.away, opp=home?g.away:g.home;
  const a=me.totalPoints||0, b=opp.totalPoints||0;
  const k=liveMKey(owners[me.teamId],owners[opp.teamId]);
  const arr=_liveSeries[k]||[];
  const state=a>b?'up':b>a?'down':'even';
  return `<div class="mm-bar${compact?' mm-fixed':''}" onclick="switchTab('home')" role="button" tabindex="0">
    <span class="mm-tag">Your matchup</span>
    <span class="mm-side">${logoImg(me.teamId,'mm-logo')}<span class="mm-sc mm-${state}">${a.toFixed(1)}</span></span>
    <span class="mm-vs">vs</span>
    <span class="mm-side mm-r"><span class="mm-sc">${b.toFixed(1)}</span>${logoImg(opp.teamId,'mm-logo')}</span>
    ${arr.length>1?`<span class="mm-spark">${liveSpark(arr,60,18)}</span>`:''}
  </div>`;
}
function renderMyMatchupBar(){
  let bar=document.getElementById('my-matchup');
  const html=myMatchupHTML(true);
  if(!html){ if(bar) bar.remove(); return; }
  if(!bar){ bar=document.createElement('div'); bar.id='my-matchup'; document.body.appendChild(bar); }
  bar.innerHTML=html;
}
function renderLiveMatchups(){
  const el=document.getElementById('live-body'); if(!el) return;
  const info=_liveInfo;
  if(!info){ el.innerHTML=`<div class="tab-loading" style="padding:22px"><i class="fa fa-circle-notch"></i>Checking the scoreboard…</div>`; return; }
  const owners=info.meta.owners||{};
  const nm=o=>(_franchises.find(f=>f.owner===o)||{}).name||info.meta.names?.[o]?.name||o;
  const rowOf=o=>{const b=sbBuild();return b?b.rows.find(r=>r.owner===o):null;};
  const cards=(info.games||[]).map(m=>{
    const ao=owners[m.home.teamId], bo=owners[m.away.teamId];
    if(!ao||!bo) return '';
    const k=liveMKey(ao,bo), aFirst=[ao,bo].sort()[0]===ao;
    const a=aFirst?(m.home.totalPoints||0):(m.away.totalPoints||0);
    const b=aFirst?(m.away.totalPoints||0):(m.home.totalPoints||0);
    const an=aFirst?nm(ao):nm(bo), bn=aFirst?nm(bo):nm(ao);
    const aOwner=aFirst?ao:bo, bOwner=aFirst?bo:ao;
    const arr=_liveSeries[k]||[];
    const margins=arr.map(p=>p[1]-p[2]);
    const biggest=margins.length?margins.reduce((x,y)=>Math.abs(y)>Math.abs(x)?y:x,0):(a-b);
    // live odds: remaining scoring is unknown, so price the current margin
    const p=schedWinProb(rowOf(aOwner),rowOf(bOwner));
    const live=Math.min(0.99,Math.max(0.01,schedNormCdf(((a-b)*0.55+(p-0.5)*22)/18)));
    const started=a>0||b>0;
    /* Scoreboard rows the way a sports app lays them out: one line per team,
       logo and name left, score right, the leader in full white with a marker.
       Everything else is secondary and sits underneath. */
    const aId=aFirst?m.home.teamId:m.away.teamId, bId=aFirst?m.away.teamId:m.home.teamId;
    const rec=id=>{const t=_teams.find(x=>x.id===id);return t?`${t.wins}-${t.losses}`:'';};
    /* win probability reads per team, on that team's own line — a single split
       bar underneath had nothing to attach itself to once the card became rows */
    const pctA=Math.round(live*100), pctB=100-pctA;
    const row=(id,name,score,lead,pct)=>`<div class="lv-row${lead?' lv-lead':''}">
        ${logoImg(id,'lv-logo')}
        <span class="lv-nm">${name}</span>
        <span class="lv-rec">${rec(id)}</span>
        <span class="lv-pct">${started?pct+'%':''}</span>
        <span class="lv-sc">${score.toFixed(1)}</span>
      </div>`;
    return `<div class="lv-card">
      <div class="lv-status">
        <span class="${started?'lv-live':'lv-pre'}">${started?'In progress':'Not started'}</span>
        ${arr.length>1?`<span class="lv-lead-n">largest lead ${Math.abs(biggest).toFixed(1)}</span>`:''}
      </div>
      ${row(aId,an,a,started&&a>b,pctA)}
      ${row(bId,bn,b,started&&b>a,pctB)}
    </div>`;}).join('');
  const secs=Math.round(liveInterval()/1000);
  const hot=_liveSaved&&Date.now()-_liveSaved<LIVE_HOT_MS;
  const stamp=_liveSaved?`last change ${msgAgo(_liveSaved)}`:'no changes yet';
  const nfl=_nflLive?'NFL games in progress':(_nflSeen?'no NFL games live':'checking the NFL board');
  el.innerHTML=`
    <div class="lv-head">
      <span class="lv-dot${_nflLive?' on hot':info.inProgress?' on':''}"></span>
      <span>${info.season} · Week ${info.week}</span>
      <span class="lv-stamp">${info.inProgress?`${stamp} · ${nfl} · every ${secs}s`:'week complete'}
        <button class="lv-now" onclick="liveRefreshNow()" title="Check now"><i class="fa fa-rotate-right"></i></button></span>
    </div>
    <div class="lv-grid">${cards||'<div class="lr-none">No matchups scheduled.</div>'}</div>
    <div id="live-records"></div>`;
  renderLiveRecords();
}
async function renderLiveRecords(){
  const el=document.getElementById('live-records'); if(!el) return;
  const key=_liveInfo?_liveInfo.key:null;
  const all={}; if(key) all[key]=_liveSeries;
  const {best,leads}=liveRecordsFrom(all);
  const nm=o=>(_franchises.find(f=>f.owner===o)||{}).name||o;
  const cb=Object.entries(best).sort((a,b)=>b[1].deficit-a[1].deficit).slice(0,6);
  const ld=Object.entries(leads).sort((a,b)=>b[1].lead-a[1].lead).slice(0,6);
  el.innerHTML=`
    <div class="lv-recs">
      <div class="lv-rec">
        <div class="lv-rec-h"><i class="fa fa-arrow-trend-up"></i>Biggest comebacks</div>
        ${cb.length?cb.map(([o,r])=>`<div class="lv-rrow"><span class="lv-rn">${nm(o)}</span>
          <span class="lv-rv">−${r.deficit.toFixed(1)}</span><span class="lv-rw">${r.week.replace('-w',' wk ')}</span></div>`).join('')
          :'<div class="lv-rnone">Nothing recorded yet — this fills in as games are watched.</div>'}
      </div>
      <div class="lv-rec">
        <div class="lv-rec-h"><i class="fa fa-bolt"></i>Largest leads held</div>
        ${ld.length?ld.map(([o,r])=>`<div class="lv-rrow"><span class="lv-rn">${nm(o)}</span>
          <span class="lv-rv">+${r.lead.toFixed(1)}</span><span class="lv-rw">${r.week.replace('-w',' wk ')}</span></div>`).join('')
          :'<div class="lv-rnone">Nothing recorded yet.</div>'}
      </div>
    </div>`;
}

/* ── MESSAGES ───────────────────────────────────────────────────────────────
   A league board. Messages live in their own Firestore collection rather than
   inside profiles, because a shared page of documents would eventually crowd
   out the profile reads the pick'em tally depends on.

   Reactions are stored on the message as one JSON string: keys are either an
   emoji or `pid:<playerId>` for a player sticker, values are the profile ids
   that reacted. One field means one write per reaction, and re-reacting
   toggles rather than stacking. Everything fails soft — if the collection is
   not readable the tab explains what is missing instead of erroring. */
const MSG_EMOJI=['🔥','😂','💀','🫡','😭','🏆'];
let _msgs=null,_msgErr=null,_msgBusy=false;
const msgBase=()=>`https://firestore.googleapis.com/v1/projects/${GFL_DB.project}/databases/(default)/documents/messages`;
const msgKey=()=>`key=${GFL_DB.key}`;

async function msgList(){
  try{
    const r=await fetch(`${msgBase()}?${msgKey()}&pageSize=200`,{cache:'no-store'});
    if(r.status===403){ _msgErr='rules'; return null; }
    if(!r.ok){ _msgErr='fetch'; return null; }
    const j=await r.json();
    _msgErr=null;
    return (j.documents||[]).map(d=>{
      const f=fsIn(d);
      let re={}; try{ re=JSON.parse(f.reactions||'{}')||{}; }catch(e){}
      return {id:(d.name||'').split('/').pop(),ts:Number(f.ts)||0,user:f.user||'',
        team:f.team||'',text:f.text||'',reactions:re};
    }).sort((a,b)=>b.ts-a.ts);
  }catch(e){ _msgErr='offline'; return null; }
}
async function msgSend(){
  if(!_me){ openSignIn(); return; }
  const box=document.getElementById('msg-input'); if(!box) return;
  const text=(box.value||'').trim(); if(!text) return;
  if(_msgBusy) return; _msgBusy=true;
  const id=`${Date.now()}-${_me.k1}`.replace(/[^a-zA-Z0-9-]/g,'').slice(0,80);
  const body=fsOut({ts:String(Date.now()),user:_me.k1,team:String(_me.teamId||''),text:text.slice(0,600),reactions:'{}'});
  try{
    const r=await fetch(`${msgBase()}?documentId=${encodeURIComponent(id)}&${msgKey()}`,
      {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    if(r.ok){ box.value=''; await msgRefresh(); }
    else { _msgErr=r.status===403?'rules':'send'; renderMessages(); }
  }catch(e){ _msgErr='offline'; renderMessages(); }
  _msgBusy=false;
}
async function msgReact(id,key){
  if(!_me){ openSignIn(); return; }
  const m=(_msgs||[]).find(x=>x.id===id); if(!m) return;
  const re={...m.reactions};
  const who=re[key]?re[key].slice():[];
  const i=who.indexOf(_me.k1);
  if(i>=0) who.splice(i,1); else who.push(_me.k1);
  if(who.length) re[key]=who; else delete re[key];
  m.reactions=re; renderMessages();                       // optimistic
  try{
    await fetch(`${msgBase()}/${encodeURIComponent(id)}?${msgKey()}&updateMask.fieldPaths=reactions`,
      {method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(fsOut({reactions:JSON.stringify(re)}))});
  }catch(e){}
}
async function msgRefresh(){ const l=await msgList(); if(l){_msgs=l;} renderMessages(); }
function msgAgo(ts){
  const s=Math.max(0,(Date.now()-ts)/1000);
  if(s<60) return 'just now';
  if(s<3600) return Math.floor(s/60)+'m ago';
  if(s<86400) return Math.floor(s/3600)+'h ago';
  return Math.floor(s/86400)+'d ago';
}
/* The chat is a weekly room. It rolls over Tuesday at 6am local — late enough
   that Monday night is finished and the week is genuinely over. Nothing is
   deleted; the board simply shows the current week. */
/* The league week turns over Tuesday 6am; tueWeekStart owns that rule so the
   board and the GFL bucks week can never disagree about when it happened. */
function msgWeekStart(now=new Date()){ return tueWeekStart(now); }
function msgWeekLabel(){
  const s=new Date(msgWeekStart());
  return s.toLocaleDateString(undefined,{month:'short',day:'numeric'});
}
/* textarea that grows with what you type, like a real message box */
function msgGrow(el){ el.style.height='auto'; el.style.height=Math.min(140,el.scrollHeight)+'px'; }
function msgKeydown(e){ if(e.key==='Enter'&&!e.shiftKey){ e.preventDefault(); msgSend(); } }
function msgTogglePlays(){
  const b=document.getElementById('msg-plays'); if(!b) return;
  b.hidden=!b.hidden;
  if(!b.hidden&&!(_msgPlays||[]).length) msgLoadPlays();
}
/* the signed-in manager's own scorers this week — the taunt material */
let _msgPlays=null,_msgPlaysLoading=false;
async function msgLoadPlays(){
  if(_msgPlaysLoading||!_me) return;
  _msgPlaysLoading=true; renderMessages();
  try{
    const info=liveWeekInfo();
    const tid=_me.teamId;
    if(info&&tid){
      const r=await fetch(`${BASE}?view=mRoster&seasonId=${info.season}&scoringPeriodId=${info.week}&live=1`,{cache:'no-store'});
      if(r.ok){
        const j=await r.json();
        const t=(j.teams||[]).find(x=>String(x.id)===String(tid));
        const BENCH=[20,21,24];
        _msgPlays=((t&&t.roster&&t.roster.entries)||[])
          .filter(e=>!BENCH.includes(e.lineupSlotId))
          .map(e=>{ const p=e.playerPoolEntry?.player||{};
            const wk=(p.stats||[]).find(s=>s.statSourceId===0&&s.scoringPeriodId===info.week);
            return {pid:e.playerId,n:p.fullName||('#'+e.playerId),pts:wk?.appliedTotal??0}; })
          .filter(p=>p.pts>0).sort((a,b)=>b.pts-a.pts).slice(0,8);
      }
    }
    if(!_msgPlays) _msgPlays=[];
  }catch(e){ _msgPlays=[]; }
  _msgPlaysLoading=false; renderMessages();
}
const MSG_TAUNTS=['just put up','just dropped','just hung','just went for'];
function msgTaunt(pid,name,pts){
  const box=document.getElementById('msg-input'); if(!box) return;
  const verb=MSG_TAUNTS[Math.floor(Math.random()*MSG_TAUNTS.length)];
  box.value=`🔥 ${name} ${verb} ${Number(pts).toFixed(1)} for me this week.`;
  const b=document.getElementById('msg-plays'); if(b) b.hidden=true;
  box.focus(); msgGrow(box);
}
function renderMessages(){
  const el=document.getElementById('messages-body'); if(!el) return;
  const teamOf=o=>{
    const m=(_msgs||[]).find(x=>x.user===o);
    return m?Number(m.team):null;
  };
  const nameOf=(user,team)=>{
    const t=_teams.find(x=>String(x.id)===String(team));
    return t?t.name:(user||'Someone');
  };
  if(_msgErr==='rules'){
    return void(el.innerHTML=`<div class="msg-setup">
      <div class="msg-setup-h"><i class="fa fa-lock"></i>One Firestore rule away</div>
      <p>The board is built and ready, but the database only allows the <b>profiles</b> collection right now, so messages can't be read or written yet.</p>
      <p>In the Firebase console → Firestore → Rules, add a <b>messages</b> block alongside the existing profiles one, then publish:</p>
      <pre class="msg-code">match /messages/{id} {
  allow read, create, update: if true;
}</pre>
      <p class="msg-setup-n">That mirrors however profiles is already permitted. Reload this page afterwards and the board comes to life — nothing else needs changing.</p>
      <button class="mv-btn" onclick="msgRefresh()">Try again</button>
    </div>`);
  }
  /* the board is a weekly room — it clears every Tuesday morning, once Monday
     night is done. Older posts stay in the database, they just stop showing. */
  const wkStart=msgWeekStart();
  const list=(_msgs||[]).filter(m=>Number(m.ts)>=wkStart);
  const plays=_msgPlays||[];
  const composer=`<div class="msg-compose${_me?'':' msg-out'}">
    <div class="msg-inrow">
      <textarea id="msg-input" rows="1" maxlength="600"
        placeholder="${_me?'Message the league…':'Sign in to post'}" ${_me?'':'disabled'}
        oninput="msgGrow(this)" onkeydown="msgKeydown(event)"></textarea>
      <button class="msg-go" ${_me?'onclick="msgSend()"':'onclick="openSignIn()"'} aria-label="${_me?'Send':'Sign in'}">
        <i class="fa fa-${_me?'paper-plane':'right-to-bracket'}"></i>
      </button>
    </div>
    ${_me?`<div class="msg-tools">
      <button class="msg-tool" onclick="msgTogglePlays()"><i class="fa fa-fire"></i>Big play</button>
      <span class="msg-hint">as ${myTeamName()||'you'}</span>
    </div>
    <div class="msg-plays" id="msg-plays" hidden>
      ${plays.length
        ? `<div class="msg-plays-l">Your week — pick one to taunt with</div>
           <div class="msg-plays-r">${plays.map(p=>`
             <button class="msg-play" onclick="msgTaunt(${p.pid},'${String(p.n).replace(/'/g,"\\'")}',${p.pts})">
               ${playerImg(p.pid,28,p.n)}
               <span class="msg-play-n">${p.n}</span>
               <span class="msg-play-p">${p.pts.toFixed(1)}</span>
             </button>`).join('')}</div>`
        : `<div class="msg-hint" style="padding:6px 2px">${_msgPlaysLoading?'Loading your week…':'No scoring players found for this week yet.'}</div>`}
    </div>`:''}
  </div>`;
  /* plain emoji reactions only — the player faces moved into the composer as
     big-play taunts, which is what they were actually wanted for */
  const reactBar=m=>{
    const mine=k=>_me&&(m.reactions[k]||[]).includes(_me.k1);
    const chips=Object.entries(m.reactions).map(([k,users])=>
      `<button class="msg-chip${mine(k)?' on':''}" onclick="msgReact('${m.id}','${k}')"><span class="mr-e">${k}</span><span class="mr-n">${users.length}</span></button>`).join('');
    return `<div class="msg-reacts">${chips}
      <details class="msg-add"><summary title="React">+</summary>
        <div class="msg-pal">
          <div class="msg-pal-r">${MSG_EMOJI.map(e=>`<button class="msg-pb" onclick="msgReact('${m.id}','${e}')">${e}</button>`).join('')}</div>
        </div>
      </details></div>`;
  };
  const rows=list.length?list.map(m=>`<div class="msg-item">
      <div class="msg-av">${m.team?logoImg(Number(m.team),'team-logo-sm'):'<i class="fa fa-user"></i>'}</div>
      <div class="msg-main">
        <div class="msg-meta"><span class="msg-who">${nameOf(m.user,m.team)}</span><span class="msg-when">${msgAgo(m.ts)}</span></div>
        <div class="msg-text">${String(m.text).replace(/[<>&]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;'}[c]))}</div>
        ${reactBar(m)}
      </div>
    </div>`).join('')
    :`<div class="lr-none">No messages yet${_me?' — say the first thing.':'.'}</div>`;
  el.innerHTML=composer+`<div class="msg-list">${rows}</div>`;
  void teamOf;
}
async function initMessages(){
  renderMessages();
  if(_me) msgLoadPlays();
  await msgRefresh();
}

// ── TWO-KEY SIGN IN ──────────────────────────────────────────────────────────
/* Deliberately informal: two keys address a document in Firestore and unlock
   whatever that profile remembers. No accounts, no email, no auth provider.
   Everything here fails soft — if Firestore is unreachable the site behaves
   exactly as it does signed out. */
const GFL_DB={project:'ball-and-chain-dashboard',key:'AIzaSyCOfZYqsD3VZmym7AW0DDX_JQnBYCZhJDA'};
const gflDocUrl=id=>`https://firestore.googleapis.com/v1/projects/${GFL_DB.project}/databases/(default)/documents/profiles/${encodeURIComponent(id)}?key=${GFL_DB.key}`;
const gflCollUrl=id=>`https://firestore.googleapis.com/v1/projects/${GFL_DB.project}/databases/(default)/documents/profiles?documentId=${encodeURIComponent(id)}&key=${GFL_DB.key}`;
const keySlug=s=>String(s||'').trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,60);
let _me=null;                                  // {k1,k2,teamId} once signed in

function meLoad(){ try{ return JSON.parse(localStorage.getItem('gfl-me')||'null'); }catch(e){ return null; } }
function meSave(){ try{ _me?localStorage.setItem('gfl-me',JSON.stringify(_me)):localStorage.removeItem('gfl-me'); }catch(e){} }

/* Firestore REST speaks typed values; keep the mapping in one place */
const fsOut=o=>{const f={};Object.entries(o).forEach(([k,v])=>{f[k]={stringValue:String(v==null?'':v)};});return {fields:f};};
const fsIn=d=>{const o={};Object.entries((d&&d.fields)||{}).forEach(([k,v])=>{o[k]=v.stringValue??v.integerValue??v.booleanValue??'';});return o;};

async function gflFetchProfile(id){
  try{ const r=await fetch(gflDocUrl(id),{cache:'no-store'});
    if(r.status===404) return {missing:true};
    if(!r.ok) return {error:'lookup failed'};
    return {data:fsIn(await r.json())};
  }catch(e){ return {error:'offline'}; }
}
async function gflCreateProfile(id,obj){
  try{ const r=await fetch(gflCollUrl(id),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(fsOut(obj))});
    return r.ok?{ok:true}:{error:'could not create'};
  }catch(e){ return {error:'offline'}; }
}
async function gflPatchProfile(id,obj){
  const mask=Object.keys(obj).map(k=>`updateMask.fieldPaths=${encodeURIComponent(k)}`).join('&');
  try{ const r=await fetch(gflDocUrl(id)+'&'+mask,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(fsOut(obj))});
    return r.ok?{ok:true}:{error:'could not save'};
  }catch(e){ return {error:'offline'}; }
}

/* Votes live as a field on the voter's own profile document rather than in a
   separate collection, so no new Firestore rules are needed — sign in already
   creates and patches these docs. One field per matchup: vote_<season>_w<week>
   holds the team id that profile picked. Field name is a plain identifier so
   it needs no quoting in an updateMask path. */
async function gflListProfiles(){
  try{
    const url=`https://firestore.googleapis.com/v1/projects/${GFL_DB.project}/databases/(default)/documents/profiles?key=${GFL_DB.key}&pageSize=300`;
    const r=await fetch(url,{cache:'no-store'});
    if(!r.ok) return null;
    const j=await r.json();
    return (j.documents||[]).map(d=>({id:decodeURIComponent((d.name||'').split('/').pop()||''),...fsIn(d)}));
  }catch(e){ return null; }
}

function signInMsg(t,bad){ const el=document.getElementById('si-msg'); if(!el) return;
  el.textContent=t||''; el.className='si-msg'+(bad?' bad':''); }

async function gflSignIn(){
  const k1=(document.getElementById('si-k1')||{}).value||'';
  const k2=(document.getElementById('si-k2')||{}).value||'';
  if(!keySlug(k1)||!String(k2).trim()) return signInMsg('Both keys are needed.',true);
  const id=keySlug(k1);
  signInMsg('Checking…');
  const res=await gflFetchProfile(id);
  if(res.error) return signInMsg(res.error==='offline'?'No connection — try again.':res.error,true);
  if(res.missing){
    const teamId=String(_profileTeam||_teams[0]?.id||'');
    const c=await gflCreateProfile(id,{k2:String(k2).trim(),teamId});
    if(c.error) return signInMsg(c.error,true);
    _me={k1:id,k2:String(k2).trim(),teamId}; meSave(); applyMe(); closeSignIn();
    return;
  }
  if(String(res.data.k2||'')!==String(k2).trim()) return signInMsg('That second key does not match.',true);
  _me={k1:id,k2:String(k2).trim(),teamId:res.data.teamId||''}; meSave(); applyMe(); closeSignIn();
}
function gflSignOut(){ _me=null; meSave(); applyMe(); closeSignIn(); }

/* remember-my-team: called whenever a team dropdown changes */
function meSetTeam(teamId){
  if(!_me||!teamId||String(teamId)===String(_me.teamId)) return;
  _me.teamId=String(teamId); meSave(); renderMeChip();
  gflPatchProfile(_me.k1,{teamId:_me.teamId});
}

function myTeamName(){
  if(!_me||!_me.teamId) return null;
  const t=_teams.find(x=>String(x.id)===String(_me.teamId));
  return t?t.name:null;
}
function renderMeChip(){
  const b=document.getElementById('me-btn'); if(!b) return;
  const nm=myTeamName();
  b.classList.toggle('on',!!_me);
  b.title=_me?`Signed in as ${_me.k1}${nm?` · ${nm}`:''}`:'Sign in';
  // the linked team's logo, falling back to the key's initials only if the
  // team has no logo to show
  const tid=_me&&_me.teamId;
  b.innerHTML=!_me ? '<i class="fa fa-user"></i>'
    : (tid&&_teams.some(t=>String(t.id)===String(tid))
        ? logoImg(Number(tid),'me-logo')
        : `<span class="me-ini">${_me.k1.slice(0,2).toUpperCase()}</span>`);
}
/* preselect the remembered team everywhere it matters */
function applyMe(){
  renderMeChip();
  if(_me&&_me.teamId&&_teams.some(t=>String(t.id)===String(_me.teamId))){
    _profileTeam=String(_me.teamId); _schedTeam=String(_me.teamId);
    const p=document.getElementById('profile-team-select'); if(p) p.value=_profileTeam;
    const s=document.getElementById('sched-team-select'); if(s) s.value=_schedTeam;
    if(_activeTab==='teams') renderProfile();
    if(_activeTab==='schedule') renderSchedule();
  }
  try{ renderMotwVoteBar(); }catch(e){}   // pick'em buttons follow sign-in state
  _rosterCache=null; _rosterTeam=null;
  if(_activeTab==='roster') renderRoster();
  if(_activeTab==='week') renderWeek();
}
/* the header button is a sign-in prompt when signed out, and your profile
   page once you are in — the sign-out control moved onto that page */
function meBtnClick(){ if(_me) switchTab('profile'); else openSignIn(); }
function renderMyProfile(){
  const el=document.getElementById('profile-page-body'); if(!el) return;
  if(!_me){ el.innerHTML=`<div class="mp-out">
      <p>You are signed out.</p>
      <button class="mv-btn" onclick="openSignIn()">Sign in</button></div>`; return; }
  const tid=Number(_me.teamId);
  const t=_teams.find(x=>x.id===tid);
  const owner=_ownerMap[tid];
  const at=owner?franchiseAllTime(owner):null;
  const budget=_seasonMeta[getSeason()]?.faabBudget||0;
  const left=budget?budget-Math.max(0,Math.min(budget,t?.budgetSpent||0)):null;
  const myVotes=(()=>{ const k=motwVoteKey(); const t2=_motwVotes||{};
    for(const [team,list] of Object.entries(t2)) if(list.some(v=>v.voter===_me.k1)) return team; return null; })();
  const votedName=myVotes?(_teams.find(x=>String(x.id)===String(myVotes))||{}).name:null;
  el.innerHTML=`
    <div class="mp-head">
      ${t?logoImg(t.id,'big4-logo'):'<i class="fa fa-user"></i>'}
      <div class="mp-id">
        <div class="mp-name">${t?t.name:'No team linked'}</div>
        <div class="mp-sub">signed in as <b>${_me.k1}</b></div>
      </div>
    </div>
    <div class="mp-grid">
      ${t?`<div class="mp-c"><span class="mp-l">${getSeason()} record</span><span class="mp-v">${t.wins}–${t.losses}${t.ties?`–${t.ties}`:''}</span></div>
      <div class="mp-c"><span class="mp-l">Points for</span><span class="mp-v">${t.pf.toFixed(0)}</span></div>`:''}
      ${left!=null?`<div class="mp-c"><span class="mp-l">FAAB left</span><span class="mp-v">$${left}</span></div>`:''}
      <div class="mp-c"><span class="mp-l">This week's pick</span><span class="mp-v">${votedName||'—'}</span></div>
    </div>
    <!-- No team picker: the linked team comes from the sign-in key and is fixed.
         The header above already names it. -->
    <div class="mp-actions">
      <button class="mv-btn" onclick="switchTab('teams')">Open team profile</button>
      <button class="mv-btn mp-out-btn" onclick="gflSignOut();switchTab('home')">Sign out</button>
    </div>`;
}
function openSignIn(){
  const m=document.getElementById('si-modal'); if(!m) return;
  const nm=myTeamName();
  document.getElementById('si-body').innerHTML=_me
    ? `<div class="si-in">Signed in as <b>${_me.k1}</b>${nm?`<div class="si-sub">Remembering ${nm}</div>`:''}</div>
       <button class="si-go" onclick="gflSignOut()">Sign out</button>`
    : `<label class="si-l">Key 1</label><input id="si-k1" class="si-i" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="anything you'll remember"/>
       <label class="si-l">Key 2</label><input id="si-k2" class="si-i" type="password" autocomplete="off" placeholder="second key"/>
       <button class="si-go" onclick="gflSignIn()">Unlock</button>
       <div class="si-note">New key pair? It saves itself the first time. Signed out, the site works exactly the same.</div>`;
  signInMsg('');
  m.classList.add('show');
  document.documentElement.classList.add('si-open');
  setTimeout(()=>{const i=document.getElementById('si-k1'); if(i) i.focus();},80);
}
function closeSignIn(){
  const m=document.getElementById('si-modal'); if(m) m.classList.remove('show');
  document.documentElement.classList.remove('si-open');
}
function initSignIn(){
  _me=meLoad();
  renderMeChip();
  if(_me) applyMe();
}
// ── UPCOMING SCHEDULE ────────────────────────────────────────────────────────
/* Which season still has games left? Preseason gives the whole slate; mid-season
   gives whatever's left of the current one. */
function schedSeason(){
  for(let i=ALL_SEASONS.length-1;i>=0;i--){
    const y=ALL_SEASONS[i], meta=_seasonMeta[y];
    if(!meta||!(meta.schedule||[]).length) continue;
    const games=(meta.schedule||[]).filter(m=>m.home&&m.away&&(m.matchupPeriodId||0)>0);
    if(!games.length) continue;
    const unplayed=games.filter(m=>!((m.home.totalPoints||0)>0||(m.away.totalPoints||0)>0));
    if(unplayed.length) return {season:y,meta,games,unplayed,
      live:games.length!==unplayed.length,regEnd:meta.regEnd||14};
  }
  const y=ALL_SEASONS[ALL_SEASONS.length-1];
  return {season:y,meta:_seasonMeta[y]||{schedule:[]},games:[],unplayed:[],live:false,regEnd:14};
}
/* Projected margin drives everything: mostly the scoring gap, nudged by the
   power rating, then run through the normal curve. Weekly fantasy margins
   scatter with a standard deviation around 30 points. */
const SCHED_SD=30;
function schedNormCdf(z){                      // Abramowitz & Stegun 26.2.17
  const t=1/(1+0.2316419*Math.abs(z));
  const poly=t*(0.319381530+t*(-0.356563782+t*(1.781477937+t*(-1.821255978+t*1.330274429))));
  const v=1-Math.exp(-z*z/2)/Math.sqrt(2*Math.PI)*poly;
  return z>=0?v:1-v;
}
function schedMargin(a,b){
  if(!a||!b) return 0;
  return (a.ppg-b.ppg)*0.75+(a.rating-b.rating)*1.2;
}
function schedWinProb(a,b){
  if(!a||!b) return 0.5;
  return Math.min(0.95,Math.max(0.05,schedNormCdf(schedMargin(a,b)/SCHED_SD)));
}
/* Nothing on the calendar yet? Lay out a deterministic round robin so the tab
   still shows something useful. Marked as a sample everywhere it appears, and
   every number attached to it (records, head to head, ratings) is still real. */
function schedDummy(){
  const n=_franchises.length; if(n<2) return null;
  const ids=_franchises.map(f=>f.owner);
  const weeks=[]; const rot=ids.slice();
  const rounds=Math.max(1,n-1);
  for(let w=1;w<=14;w++){
    const r=(w-1)%rounds;
    const order=[rot[0],...rot.slice(1).slice(-r).concat(rot.slice(1).slice(0,rot.length-1-r))];
    const games=[];
    for(let i=0;i<Math.floor(n/2);i++) games.push([order[i],order[n-1-i]]);
    weeks.push({week:w,games});
  }
  return weeks;
}
function schedRows(owner){
  const book=sbBuild(); if(!book) return null;
  const info=schedSeason(); const meta=info.meta; if(!meta) return null;
  const owners=meta.owners||{};
  const rowOf=o=>book.rows.find(r=>r.owner===o);
  const me=rowOf(owner); if(!me) return null;
  const out=[];
  const rivalWeeks={}; rivalsFor(owner).forEach(r=>{ rivalWeeks[r.owner]=r.week; });
  // real slate when ESPN has one, otherwise the sample round robin
  let pairs=info.unplayed.map(m=>({week:m.matchupPeriodId,
    ho:owners[m.home.teamId], ao:owners[m.away.teamId]}));
  let sample=false;
  if(!pairs.length){
    const dz=schedDummy()||[];
    pairs=[]; sample=true;
    dz.forEach(wk=>wk.games.forEach(([x,y])=>pairs.push({week:wk.week,ho:x,ao:y})));
  }
  pairs.forEach(m=>{
    const ho=m.ho, ao=m.ao;
    if(!ho||!ao||ho===ao) return;
    if(ho!==owner&&ao!==owner) return;
    const oppOwner=(ho===owner)?ao:ho;
    const opp=rowOf(oppOwner); if(!opp) return;
    const wk=m.week;
    const p=schedWinProb(me,opp);
    // last completed season for the opponent, plus the all-time head to head
    const lastSp=(opp.sp||[]).filter(s=>s.g>0).slice(-1)[0]||null;
    const lastRec=lastSp?`${lastSp.w}–${Math.max(0,lastSp.g-lastSp.w)}`:'—';
    const key=owner<oppOwner?`${owner}|${oppOwner}`:`${oppOwner}|${owner}`;
    const k=_h2hAll[key]||{}; const mine=k[owner];
    const g=mine?mine.games:0, w=mine?mine.w:0, t=mine?mine.t:0;
    out.push({week:wk, playoff:wk>(info.regEnd||14), opp, oppOwner,
      p, ml:amFromProb(Math.min(0.95,p+0.025)),
      spread:Math.max(0.5,Math.round(Math.abs(schedMargin(me,opp))*2)/2),
      fav:schedMargin(me,opp)>=0,
      total:Math.round(me.ppg+opp.ppg)+0.5,
      oppRec:lastRec, oppSeason:lastSp?lastSp.season:null, oppPpg:opp.ppg,
      rival:rivalWeeks[oppOwner]!=null, rivalWeek:rivalWeeks[oppOwner]??null,
      h2h:g?`${w}–${Math.max(0,g-w-t)}${t?`–${t}`:''}`:'—', h2hPct:g?w/g:null});
  });
  out.sort((x,y)=>x.week-y.week);
  const sampleSlate=sample;
  // strength of schedule: mean opponent rating, ranked against the league
  const sosOf=o=>{
    const r=rowOf(o); if(!r) return null;
    const mine=info.unplayed.filter(m=>owners[m.home.teamId]===o||owners[m.away.teamId]===o);
    if(!mine.length) return null;
    const vals=mine.map(m=>{const oo=(owners[m.home.teamId]===o)?owners[m.away.teamId]:owners[m.home.teamId];
      const rr=rowOf(oo); return rr?rr.rating:0;});
    return vals.reduce((x,y)=>x+y,0)/vals.length;
  };
  const sos=sosOf(owner);
  const allSos=_franchises.map(f=>({owner:f.owner,sos:sosOf(f.owner)})).filter(x=>x.sos!=null)
    .sort((x,y)=>y.sos-x.sos);                       // hardest first
  const sosRank=allSos.findIndex(x=>x.owner===owner)+1;
  const projW=out.reduce((s,r)=>s+r.p,0);
  return {info,me,rows:out,sos,sosRank,sosCount:allSos.length,
    projW, projL:out.length-projW,
    sample:sampleSlate, rivals:out.filter(r=>r.rival).length,
    toughest:out.slice().sort((x,y)=>x.p-y.p)[0]||null,
    easiest:out.slice().sort((x,y)=>y.p-x.p)[0]||null};
}
function schedPctCol(p){
  if(p>=0.62) return 'var(--green)';
  if(p>=0.52) return '#a3e635';
  if(p>=0.48) return 'var(--accent)';
  if(p>=0.38) return '#ff8f5a';
  return 'var(--red)';
}
/* Toughest players to face: the opponent's best starters by points per start
   in the scheduled season. Tenure data only exists for seasons that have been
   played, so an upcoming season simply reports that it has nothing yet. */
const SCHED_MIN_STARTS=4;   // a one-week cameo is not a hard player to face
function schedTopPlayers(owner,season,n=3){
  const t=_tenure&&_tenure[owner];
  if(!t) return null;
  const all=[];
  Object.entries(t).forEach(([pid,p])=>{
    const s=p.seasons&&p.seasons[season];
    if(!s||!s.s) return;                     // never started for them that year
    all.push({pid,n:p.n||('#'+pid),ppg:(s.sp||0)/s.s,starts:s.s});
  });
  const by=(a,b)=>b.ppg-a.ppg||b.starts-a.starts;
  // Rank on a real sample first. A single 25-point week from a streamed
  // defence would otherwise outrank a back who started all year.
  const solid=all.filter(p=>p.starts>=SCHED_MIN_STARTS).sort(by);
  if(solid.length>=n) return solid.slice(0,n);
  const rest=all.filter(p=>p.starts<SCHED_MIN_STARTS).sort(by);
  return solid.concat(rest).slice(0,n);
}
async function toggleSchedOpp(el){
  const row=el.closest('.sch-row'); if(!row) return;
  const box=row.nextElementSibling;
  if(!box||!box.classList.contains('sch-detail')) return;
  const open=!box.classList.contains('open');
  // one drawer at a time
  document.querySelectorAll('.sch-detail.open').forEach(d=>{d.classList.remove('open');d.previousElementSibling?.classList.remove('sch-row-open');});
  if(!open) return;
  box.classList.add('open'); row.classList.add('sch-row-open');
  const season=box.dataset.season, owner=el.dataset.opp, name=el.dataset.name||'This team';
  box.innerHTML='<div class="sd-msg">Loading…</div>';
  try{ await loadTenureData(); }catch(e){}
  const top=schedTopPlayers(owner,season,3);
  if(!top||!top.length){
    box.innerHTML=`<div class="sd-msg">No ${season} player data yet.</div>`;
    return;
  }
  box.innerHTML=`<div class="sd-h">Toughest to face · ${name} — top ${top.length} by ${season} points per start</div>
    <div class="sd-list">${top.map((p,i)=>`<div class="sd-row">
      <span class="sd-rank">${i+1}</span>${playerImg(p.pid,26,p.n)}
      <span class="sd-name">${p.n}</span>
      <span class="sd-ppg">${p.ppg.toFixed(1)}</span>
      <span class="sd-st">${p.starts} start${p.starts===1?'':'s'}</span>
    </div>`).join('')}</div>`;
}
/* ── PLAYOFF OUTLOOK ────────────────────────────────────────────────────────
   Monte Carlo over whatever is left on the calendar. Every remaining game is
   decided by schedWinProb, which already blends the power ratings — weighted
   record, scoring for and against, playoff history and the rest — so the
   forecast moves on its own as results land and those ratings shift.

   Each run also carries simulated points, because points for is the tiebreak
   in this league; without it, equal records would resolve arbitrarily. The
   range of outcomes is the 10th to 90th percentile of a team's final win
   total across every run, so it widens early in the year and tightens as the
   schedule empties. With no games left it reports the settled table. */
const PO_RUNS=4000;
let _poCache=null;
function playoffOutlook(){
  if(_poCache) return _poCache;
  const book=sbBuild(); if(!book) return null;
  const info=schedSeason(), meta=info.meta; if(!meta||!meta.owners) return null;
  const owners=meta.owners, regEnd=info.regEnd||14;
  const rowOf=o=>book.rows.find(r=>r.owner===o);
  const list=Object.values(owners).filter((o,i,a)=>o&&a.indexOf(o)===i);
  if(list.length<2) return null;
  const spots=meta.playoffTeamCount||6;

  // standings so far, from games that have actually been played
  const base={}; list.forEach(o=>base[o]={w:0,l:0,t:0,pf:0});
  (meta.schedule||[]).forEach(m=>{
    if(!m.home||!m.away) return;
    if((m.matchupPeriodId||0)>regEnd) return;                 // regular season only
    const hp=m.home.totalPoints||0, ap=m.away.totalPoints||0;
    if(hp===0&&ap===0) return;
    const ho=owners[m.home.teamId], ao=owners[m.away.teamId];
    if(!base[ho]||!base[ao]) return;
    base[ho].pf+=hp; base[ao].pf+=ap;
    if(hp>ap){base[ho].w++;base[ao].l++;}
    else if(ap>hp){base[ao].w++;base[ho].l++;}
    else {base[ho].t++;base[ao].t++;}
  });

  const left=(meta.schedule||[]).filter(m=>m.home&&m.away
    && (m.matchupPeriodId||0)>0 && (m.matchupPeriodId||0)<=regEnd
    && !((m.home.totalPoints||0)>0||(m.away.totalPoints||0)>0))
    .map(m=>({a:owners[m.home.teamId],b:owners[m.away.teamId]}))
    .filter(g=>g.a&&g.b&&g.a!==g.b&&base[g.a]&&base[g.b]);

  const pre={}; left.forEach(g=>{ const k=g.a+'|'+g.b;
    if(pre[k]==null) pre[k]=schedWinProb(rowOf(g.a),rowOf(g.b)); });
  const ppg={}; list.forEach(o=>{ ppg[o]=(rowOf(o)||{}).ppg||105; });

  const made={},seedSum={},winTotals={};
  list.forEach(o=>{made[o]=0;seedSum[o]=0;winTotals[o]=[];});
  // Box-Muller, so simulated weekly scores scatter like real ones
  const gauss=()=>{const u=1-Math.random(),v=Math.random();
    return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);};

  for(let n=0;n<PO_RUNS;n++){
    const w={},pf={};
    list.forEach(o=>{w[o]=base[o].w+base[o].t*0.5;pf[o]=base[o].pf;});
    left.forEach(g=>{
      const p=pre[g.a+'|'+g.b];
      if(Math.random()<p) w[g.a]++; else w[g.b]++;
      pf[g.a]+=Math.max(0,ppg[g.a]+gauss()*SCHED_SD*0.7);
      pf[g.b]+=Math.max(0,ppg[g.b]+gauss()*SCHED_SD*0.7);
    });
    const order=list.slice().sort((x,y)=>w[y]-w[x]||pf[y]-pf[x]);
    order.forEach((o,i)=>{ if(i<spots) made[o]++; seedSum[o]+=i+1; });
    list.forEach(o=>winTotals[o].push(w[o]));
  }

  const pct=(arr,q)=>{const s=arr.slice().sort((a,b)=>a-b);
    return s[Math.min(s.length-1,Math.max(0,Math.round((s.length-1)*q)))];};
  const teams=list.map(o=>{
    const t=winTotals[o];
    return {owner:o, name:(_franchises.find(f=>f.owner===o)||{}).name||meta.names?.[o]?.name||o,
      played:base[o], odds:made[o]/PO_RUNS, seed:seedSum[o]/PO_RUNS,
      lo:pct(t,0.10), med:pct(t,0.50), hi:pct(t,0.90)};
  }).sort((a,b)=>b.odds-a.odds||a.seed-b.seed);
  const maxW=Math.max(1,...teams.map(t=>t.hi));
  _poCache={teams,spots,left:left.length,runs:PO_RUNS,season:info.season,maxW,regEnd};
  return _poCache;
}
function playoffOutlookHTML(){
  const d=playoffOutlook();
  if(!d) return '';
  const pctTxt=v=>v>=0.995?'>99%':v<=0.005?'<1%':Math.round(v*100)+'%';
  const col=v=>v>=0.85?'var(--green)':v>=0.5?'var(--accent)':v>=0.15?'var(--text2)':'var(--red)';
  const rows=d.teams.map((t,i)=>{
    const inCut=i<d.spots;
    const l=t.lo/d.maxW*100, h=t.hi/d.maxW*100, m=t.med/d.maxW*100;
    return `<div class="po-row${inCut?' po-in':''}">
      <span class="po-rk">${i+1}</span>
      <span class="po-nm">${t.name}</span>
      <span class="po-rec">${t.played.w}–${t.played.l}${t.played.t?`–${t.played.t}`:''}</span>
      <span class="po-range" title="${t.lo}–${t.hi} wins, median ${t.med}">
        <span class="po-track"><span class="po-band" style="left:${l}%;width:${Math.max(2,h-l)}%"></span>
        <span class="po-med" style="left:${m}%"></span></span>
        <span class="po-rtxt">${t.lo}–${t.hi}</span>
      </span>
      <span class="po-odds" style="color:${col(t.odds)}">${pctTxt(t.odds)}</span>
    </div>`;}).join('');
  return `<div class="sec po-sec">
    <div class="sec-head"><i class="fa fa-chart-simple"></i>Playoff Outlook
      <span class="badge-info">${d.left?`${d.left} games left · ${d.runs.toLocaleString()} simulations`:'regular season complete'}</span></div>
    <div class="po-head"><span></span><span>Team</span><span>Rec</span><span>Range of outcomes</span><span class="r">Playoffs</span></div>
    <div class="po-list">${rows}</div>
    <div class="po-note">Every remaining game is simulated ${d.runs.toLocaleString()} times using the same power ratings the sportsbook prices with. The bar spans each team's 10th to 90th percentile win total, the notch is the median, and the top ${d.spots} shaded rows are the current projected field.</div>
  </div>`;
}
function renderSchedule(){
  const el=document.getElementById('sched-body'); if(!el) return;
  if(!_franchises.length){ el.innerHTML=`<div class="tab-loading"><i class="fa fa-circle-notch"></i>Loading schedule…</div>`; return; }
  if(_schedTeam==null) _schedTeam=String(_teams[0]?.id||'');
  const sel=document.getElementById('sched-team-select');
  if(sel&&sel.value!==String(_schedTeam)) sel.value=String(_schedTeam);
  const owner=_ownerMap[Number(_schedTeam)];
  const d=owner?schedRows(owner):null;
  if(!d||!d.rows.length){
    el.innerHTML=`<div class="tab-loading" style="padding:40px 16px">No unplayed games on the schedule right now.</div>`;
    return;
  }
  /* the opponent name opens a drawer with their toughest players to face */
  const nm=r=>`<span class="sch-team sch-open" role="button" tabindex="0"
    data-opp="${r.opp.owner}" data-name="${String(r.opp.name).replace(/"/g,'&quot;')}"
    onclick="toggleSchedOpp(this)" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();toggleSchedOpp(this);}"
    >${sbAvatar(r.opp.owner,22)}<span class="sch-nm">${r.opp.name}</span><span class="sch-ab">${sbTeamAb(r.opp.owner,r.opp.name)}</span>${r.rival?`<span class="sch-rival" title="Rivalry game — 2025 week ${r.rivalWeek}">RIVAL</span>`:''}<i class="fa fa-chevron-down sch-caret"></i></span>`;
  const sosPct=d.sosCount?1-(d.sosRank-1)/Math.max(1,d.sosCount-1):0.5;
  const recSeason=(d.rows.find(r=>r.oppSeason)||{}).oppSeason||'Last';
  el.innerHTML=`
    <div class="sch-head">
      <span>Wk</span><span>Opponent</span>
      <span class="r sch-c1">${recSeason} rec</span>
      <span class="r sch-c2">Opp PPG</span><span class="r sch-c3">All-time</span>
      <span class="r">Win%</span><span class="r sch-c4">Line</span><span class="r">Odds</span>
    </div>
    <div class="sch-list">${d.rows.map(r=>`
      <div class="sch-row${r.rival?' sch-rrow':''}">
        <span class="sch-wk">${r.playoff?'PO':''}${r.week}</span>
        ${nm(r)}
        <span class="r sch-c1">${r.oppRec}</span>
        <span class="r sch-c2">${r.oppPpg.toFixed(1)}</span>
        <span class="r sch-c3" ${r.h2hPct!=null?`style="color:${schedPctCol(r.h2hPct)}"`:''}>${r.h2h}</span>
        <span class="r sch-p" style="color:${schedPctCol(r.p)}">${Math.round(r.p*100)}%</span>
        <span class="r sch-c4">${r.fav?'−':'+'}${r.spread.toFixed(1)}</span>
        <span class="r sch-ml">${amFmt(r.ml)}</span>
      </div>
      <div class="sch-detail" data-season="${d.info.season}"></div>`).join('')}</div>
    ${playoffOutlookHTML()}
    <div class="sch-note">Win probability comes from the same power ratings the B&C Sportsbook prices with.</div>`;
}
/* ── RIVALS ──────────────────────────────────────────────────────────────────
   A manager's rivals are whoever they played in weeks 12, 13 and 14 of 2025.
   That schedule is the source of truth — earlier years paired those weeks
   differently, so we only read 2025 and then look the records up all-time. */
const RIVAL_SEASON='2025';
const RIVAL_WEEKS=[12,13,14];
function rivalsFor(owner){
  const meta=_seasonMeta[RIVAL_SEASON]; if(!meta||!meta.schedule) return [];
  const owners=meta.owners||{};
  const out=[];
  meta.schedule.forEach(mu=>{
    if(!mu.home||!mu.away) return;
    const wk=mu.matchupPeriodId;
    if(!RIVAL_WEEKS.includes(wk)) return;
    const ho=owners[mu.home.teamId], ao=owners[mu.away.teamId];
    if(!ho||!ao||ho===ao) return;
    if(ho!==owner&&ao!==owner) return;
    const oppOwner=(ho===owner)?ao:ho;
    const mine=(ho===owner)?mu.home:mu.away, theirs=(ho===owner)?mu.away:mu.home;
    // all-time head to head, every season, regular season and playoffs
    const key=owner<oppOwner?`${owner}|${oppOwner}`:`${oppOwner}|${owner}`;
    const k=_h2hAll[key]||{};
    const m=k[owner], o=k[oppOwner];
    const g=m?m.games:0, w=m?m.w:0, t=m?m.t:0;
    const fr=_franchises.find(f=>f.owner===oppOwner);
    const nm=(fr&&fr.name)||meta.names?.[oppOwner]?.name||'Unknown';
    out.push({
      week:wk, owner:oppOwner, name:nm,
      teamId:(fr&&fr.teamId)||meta.names?.[oppOwner]?.teamId||0,
      logo:(fr&&fr.logo)||meta.names?.[oppOwner]?.logo||null,
      w, l:Math.max(0,g-w-t), t, g, pct:g?w/g:0,
      pf:m?m.pf:0, pa:o?o.pf:0,
      lastPts:(mine.totalPoints||0), lastOppPts:(theirs.totalPoints||0),
    });
  });
  return out.sort((x,y)=>x.week-y.week);
}
function rivalsHTML(owner){
  const rows=rivalsFor(owner);
  if(!rows.length) return `<div class="tab-loading" style="padding:22px 12px">No ${RIVAL_SEASON} rivalry-week matchups for this manager.</div>`;
  return `<div class="rv-list">${rows.map(r=>{
    const col=r.g?scaleTwo(r.pct):'var(--text2)';
    const rec=`${r.w}–${r.l}${r.t?`–${r.t}`:''}`;
    return `<div class="rv-row">
      <span class="rv-wk">Wk ${r.week}</span>
      <span class="rv-team">${avatarCore(r.name,r.teamId||0,proxyLogo(r.logo),22,6)}<span class="rv-nm tlink" data-tid="${r.teamId||''}">${r.name}</span><span class="rv-ab tlink" data-tid="${r.teamId||''}">${drAbbr(r.owner,r.name)}</span></span>
      <span class="r rv-rec">${rec}</span>
      <span class="r rv-pct" style="color:${col}">${r.g?(r.pct*100).toFixed(0)+'%':'—'}</span>
      <span class="r rv-pf">${r.g?`${Math.round(r.pf)}–${Math.round(r.pa)}`:'—'}</span>
    </div>`;
  }).join('')}</div>`;
}
/* green when they own the matchup, red when they don't */
function scaleTwo(pct){
  if(pct>=0.66) return 'var(--green)';
  if(pct>=0.5)  return 'var(--accent)';
  if(pct>=0.34) return '#ff8f5a';
  return 'var(--red)';
}
function enemiesHTML(owner){
  const list=enemiesFor(owner);
  if(!list){ loadLineups();
    return `<div class="tab-loading" style="padding:22px"><i class="fa fa-circle-notch"></i>Digging through every lineup they've faced…</div>`; }
  if(!list.length) return `<div class="tab-loading" style="padding:22px">No opposing lineup data yet.</div>`;
  const mxp=list[0].pts||1;
  return `<div class="en-list">
    <div class="en-row en-head"><span>#</span><span>Player</span><span class="r">Points</span><span class="r">Record</span><span class="r">PPG</span></div>
    ${list.map((r,i)=>{
      const pct=r.g?r.w/r.g:0;
      return `<div class="en-row">
        <span class="en-rk">${i+1}</span>
        <span class="en-p">${playerImg(r.pid,24,r.name)}<span class="en-nm">${r.name}</span></span>
        <span class="r en-pts">${r.pts.toFixed(1)}</span>
        <span class="r en-rec" style="color:${pct>0.5?'var(--red)':pct<0.5?'var(--green)':'var(--text2)'}">${r.w}–${r.g-r.w}</span>
        <span class="r en-ppg">${(r.pts/r.g).toFixed(1)}</span>
      </div>`;}).join('')}
  </div>
  <div class="en-note">Points scored against this team by opposing starters, all seasons. <b>Record</b> is how those games finished for the player's side; <b>PPG</b> is their average in games against this franchise.</div>`;
}
// ── SEASON-BY-SEASON OVERVIEW (team profile) ─────────────────────────────────
// One row per season: record, finish, scoring, draft grade, how the playoffs
// went and any hardware picked up that year.
function profileOverviewHTML(owner,draftOnly){
  const dc=_draftAllCache;
  const sp=sbSplits(owner);                       // regular-season splits per season
  if(!sp.length) return `<div class="tab-loading" style="padding:22px">No season history for this team.</div>`;
  // league-wide draft spread per season so the grade matches the Draft page
  const bySeason={};
  ((dc&&dc.teamDrafts)||[]).forEach(d=>{ (bySeason[d.season]||(bySeason[d.season]=[])).push(d.adj); });
  const mineDraft={};
  ((dc&&dc.teamDrafts)||[]).filter(d=>d.owner===owner).forEach(d=>{ mineDraft[d.season]=d.adj; });
  const aw=awardsForOwner(owner);
  const seasons=sp.slice().sort((a,b)=>b.season-a.season);

  // ── season results ──
  const rows=seasons.map(x=>{
    const s=String(x.season), meta=_seasonMeta[s]||{};
    const tid=Object.keys(meta.owners||{}).find(id=>meta.owners[id]===owner);
    const ti=tid!=null?meta.teams[tid]:null;
    const rank=ti?ti.rank:null;
    const br=bracketOf(s); let po='Missed', poCol='var(--text3)';
    if(br&&tid!=null){
      const me=Number(tid); let inB=false, wins=0;
      (br.rounds||[]).forEach(r=>{ (r.games||[]).forEach(g=>[g.a,g.b].forEach(sd=>{ if(sd.tid===me){ inB=true; if(sd.win) wins++; } }));
        (r.byes||[]).forEach(b=>{ if(Number(b)===me) inB=true; }); });
      if(rank===1){ po='Champion'; poCol='var(--accent)'; }
      else if(rank===2){ po='Runner-up'; poCol='var(--green)'; }
      else if(inB){ po=wins?`Playoffs · ${wins}W`:'Playoffs'; poCol='var(--text2)'; }
    }
    const conf=ti?(meta.divisions&&meta.divisions[ti.div])||'':'';
    const wpct=x.g?x.w/x.g:0;
    return `<div class="ov-row">
      <span class="ov-yr">${s}</span>
      <span class="ov-rec"><b style="color:${wpct>=0.5?'var(--green)':'var(--red)'}">${x.w}–${x.g-x.w}</b><span class="ov-sub">${conf||'—'}</span></span>
      <span class="r ov-fin">${rank?'#'+rank:'—'}</span>
      <span class="r ov-pf ov-hpf">${x.pf.toFixed(0)}</span>
      <span class="r ov-pa ov-hpa">${x.pa.toFixed(0)}</span>
      <span class="r ov-po" style="color:${poCol}">${po}</span>
    </div>`;}).join('');

  // ── draft grades, in their own block underneath ──
  let draftBlock;
  if(!dc){
    draftBlock=`<div class="tab-loading" style="padding:16px 2px"><i class="fa fa-circle-notch"></i>Crunching past drafts…</div>`;
  }else{
    const dRows=seasons.filter(x=>mineDraft[String(x.season)]!=null).map(x=>{
      const s=String(x.season), adj=mineDraft[s];
      const vals=bySeason[s]||[adj];
      const mn=Math.min(...vals), mx=Math.max(...vals);
      const t=mx>mn?(adj-mn)/(mx-mn):1;
      const grade=PPG_GRADES[Math.round(t*(PPG_GRADES.length-1))];
      const col=gradeColor(grade);
      const rk=vals.slice().sort((p,q)=>q-p).indexOf(adj)+1;
      return `<div class="dg-row">
        <span class="dg-yr">${s}</span>
        <span class="dg-grade" style="color:${col};border-color:${col}">${grade}</span>
        <span class="r dg-score" style="color:${col}">${adj>0?'+':''}${Math.round(adj)}</span>
        <span class="r dg-rank">#${rk} of ${vals.length}</span>
      </div>`;}).join('');
    // all-time draft grade: average each franchise's per-season LETTER grades
    // (rank follows that same average) among the 12 current franchises
    const gradeIdx=(season,adj)=>{
      const vals=bySeason[season]||[adj];
      const mn=Math.min(...vals), mx=Math.max(...vals);
      const tt=mx>mn?(adj-mn)/(mx-mn):1;
      return Math.round(tt*(PPG_GRADES.length-1));
    };
    const perOwner={};
    ((dc&&dc.teamDrafts)||[]).forEach(d=>{
      const o=perOwner[d.owner]||(perOwner[d.owner]={gi:[],adj:[]});
      o.gi.push(gradeIdx(String(d.season),d.adj)); o.adj.push(d.adj);
    });
    const avgs=Object.entries(perOwner)
      .filter(([o])=>_franchises.some(f=>f.owner===o))
      .map(([o,v])=>({owner:o,
        gi:v.gi.reduce((a,b)=>a+b,0)/v.gi.length,
        avg:v.adj.reduce((a,b)=>a+b,0)/v.adj.length}));
    const mine=avgs.find(x=>x.owner===owner);
    let allRow='';
    if(mine&&avgs.length>1){
      const g=PPG_GRADES[Math.max(0,Math.min(PPG_GRADES.length-1,Math.round(mine.gi)))];
      const c=gradeColor(g);
      const rk=avgs.slice().sort((a,b)=>b.gi-a.gi||b.avg-a.avg).findIndex(x=>x.owner===owner)+1;
      allRow=`<div class="dg-row dg-total" style="background:${gradeTint(c,0.13)};border-top-color:${gradeTint(c,0.45)}">
        <span class="dg-yr dg-all">All-Time</span>
        <span class="dg-grade" style="color:${c};border-color:${c}">${g}</span>
        <span class="r dg-score" style="color:${c}">${mine.avg>0?'+':''}${mine.avg.toFixed(1)}</span>
        <span class="r dg-rank">#${rk} of ${avgs.length}</span>
      </div>`;
    }
    draftBlock=dRows
      ? `<div class="dg-list">
          <div class="dg-row dg-head"><span>Year</span><span>Grade</span><span class="r">Score</span><span class="r">League rank</span></div>
          ${dRows}
          ${allRow}
         </div>`
      : '';
  }

  if(draftOnly) return draftBlock||`<div class="tab-loading" style="padding:18px">No draft history for this team.</div>`;
  return `<div class="ov-list">
    <div class="ov-row ov-head"><span>Year</span><span>Record</span><span class="r">Finish</span><span class="r ov-pf ov-hpf">PF</span><span class="r ov-pa ov-hpa">PA</span><span class="r">Postseason</span></div>
    ${rows}
  </div>`;
}
// the draft block is its own panel now
function profileDraftBlockHTML(owner){
  const html=profileOverviewHTML(owner,true);
  return html;
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

  // Colour every stat the way the draft page grades teams: rank the value against
  // the rest of the league in that same category and paint it on the A+→F scale.
  const _atAll={}; _franchises.forEach(f=>{ _atAll[f.owner]=franchiseAllTime(f.owner); });
  const _liqSeason=_liq[getSeason()]||{};
  const scaleCol=(vals,v,higherBetter)=>{
    const list=vals.filter(x=>x!=null&&!isNaN(x));
    if(v==null||isNaN(v)||list.length<2) return '';
    const mn=Math.min(...list), mx=Math.max(...list);
    if(mx===mn) return gradeColor('A');
    let t=(v-mn)/(mx-mn); if(!higherBetter) t=1-t;
    return gradeColor(PPG_GRADES[Math.round(t*(PPG_GRADES.length-1))]);
  };
  const seasonVals=f=>_teams.map(f);
  const atVals=f=>_franchises.map(x=>f(_atAll[x.owner],x.owner));
  const liqPctOf=o=>{const tid=_teams.find(x=>_ownerMap[x.id]===o)?.id; const d=tid!=null?_liqSeason[tid]:null;
    return (d&&d.decisions)?d.correct/d.decisions*100:null;};
  const myLiq=_liqSeason[id], myLiqPct=(myLiq&&myLiq.decisions)?myLiq.correct/myLiq.decisions*100:null;
  const winPctOf=x=>{const g=x.wins+x.losses+(x.ties||0); return g?x.wins/g:0;};

  // label left, value right — no icons, one line per stat
  const stat=(label,val,col)=>`<div class="prof-stat"><span class="prof-stat-l">${label}</span><span class="prof-stat-v" ${col?`style="color:${col}"`:''}>${val}</span></div>`;
  const chip=(label,val,col)=>`<div class="prof-chip"><div class="prof-chip-v" ${col?`style="color:${col}"`:''}>${val}</div><div class="prof-chip-l">${label}</div></div>`;

  const oppRows=_franchises.filter(f=>f.owner!==owner).map(opp=>{
    const key=owner<opp.owner?`${owner}|${opp.owner}`:`${opp.owner}|${owner}`;
    const k=_h2hAll[key]; if(!k||!k[owner]) return null;
    const mine=k[owner],gg=mine.games,wl=mine.w,t2=mine.t,ll=gg-wl-t2;
    return {opp,w:wl,l:ll,g:gg,pct:gg?wl/gg:0};
  }).filter(Boolean).sort((a,b)=>b.g-a.g);

  el.innerHTML=`
    <div class="prof-hero">
    <div class="prof-banner" style="--tc:${tcRaw}">
      <div class="prof-banner-wm">${(_logoMap[id]?`<img src="${_logoMap[id]}" alt="" decoding="async"/>`:'')}</div>
      <div class="prof-banner-row">
        <div class="prof-badge">${logoImg(id,'big4-logo')}</div>
        <div class="prof-headline">
          <div class="prof-name">${t.name}</div>
          <div class="prof-sub">${at.seasons} season${at.seasons!==1?'s':''}${conf?` · ${conf} Conference`:''}</div>
          <div class="prof-chips">
            ${honorTiles(at.rings,at.confs,aw,_profileHonorYears[owner])}
          </div>
        </div>
      </div>
    </div>
    ${faabChipHTML(t)}
    </div>
    ${legacyReportHTML(owner)}
    <div class="prof-top2">
    <div class="panel"><div class="sec-head" style="font-size:15px"><i class="fa fa-bolt" style="color:var(--accent)"></i>${getSeason()} Season</div>
    <div class="prof-stats">
      ${stat('Record',`${t.wins}–${t.losses}${t.ties?`–${t.ties}`:''}`,scaleCol(seasonVals(winPctOf),winPctOf(t),true))}
      ${stat('Points For',t.pf.toFixed(1),scaleCol(seasonVals(x=>x.pf),t.pf,true))}
      ${stat('Points Against',t.pa.toFixed(1),scaleCol(seasonVals(x=>x.pa),t.pa,false))}
      ${stat('Moves',t.moves)}
      ${stat('Trades',t.trades)}
      ${stat('Coaching Metric',_cmMode==='none'?'—':s.toFixed(2),_cmMode==='none'?'':scaleCol(seasonVals(x=>_scores[x.id]||0),s,true))}
      ${stat('Trade ROI',c2!=null?(c2>=0?'+':'')+c2.toFixed(2):'—',scaleCol(seasonVals(x=>(_cmBreakdown[x.id]||{}).c2),c2,true))}
      ${stat('Waiver ROI',c3!=null?(c3>=0?'+':'')+c3.toFixed(2):'—',scaleCol(seasonVals(x=>(_cmBreakdown[x.id]||{}).c3),c3,true))}
      ${stat('Lineup IQ',myLiqPct!=null?myLiqPct.toFixed(1)+'%':'—',scaleCol(_teams.map(x=>{const d=_liqSeason[x.id];return (d&&d.decisions)?d.correct/d.decisions*100:null;}),myLiqPct,true))}
      ${stat('Missed Points',myLiq?myLiq.missed.toFixed(1):'—',scaleCol(_teams.map(x=>_liqSeason[x.id]?_liqSeason[x.id].missed:null),myLiq?myLiq.missed:null,false))}
    </div>
    </div>
    <div class="panel"><div class="sec-head" style="font-size:15px"><i class="fa fa-trophy" style="color:var(--accent)"></i>All-Time</div>
    <div class="prof-stats">
      ${stat('Record',`${at.w}–${at.l}${at.t?`–${at.t}`:''}`,scaleCol(atVals(a=>{const gg=a.w+a.l+a.t;return gg?a.w/gg:0;}),g?at.w/g:0,true))}
      ${stat('Win %',`${winpct.toFixed(1)}%`,scaleCol(atVals(a=>{const gg=a.w+a.l+a.t;return gg?a.w/gg:0;}),g?at.w/g:0,true))}
      ${stat('Points For',at.pf.toFixed(0),scaleCol(atVals(a=>a.playedSeasons?a.pf/a.playedSeasons:null),at.playedSeasons?at.pf/at.playedSeasons:null,true))}
      ${stat('Points Against',at.pa.toFixed(0),scaleCol(atVals(a=>a.playedSeasons?a.pa/a.playedSeasons:null),at.playedSeasons?at.pa/at.playedSeasons:null,false))}
      ${stat('Highest Score',at.hi?at.hi.pts.toFixed(1):'—',scaleCol(atVals(a=>a.hi?a.hi.pts:null),at.hi?at.hi.pts:null,true))}
      ${stat('Lowest Score',at.lo?at.lo.pts.toFixed(1):'—',scaleCol(atVals(a=>a.lo?a.lo.pts:null),at.lo?at.lo.pts:null,true))}
      ${stat('Longest Win Streak',at.winStreak||0,scaleCol(atVals(a=>a.winStreak||0),at.winStreak||0,true))}
      ${stat('Longest Losing Streak',at.loseStreak||0,scaleCol(atVals(a=>a.loseStreak||0),at.loseStreak||0,false))}
      ${stat('Scores Over 150',at.over150||0,scaleCol(atVals(a=>a.over150||0),at.over150||0,true))}
      ${stat('Scores Under 80',at.under80||0,scaleCol(atVals(a=>a.under80||0),at.under80||0,false))}
      ${stat('Championships',at.rings,scaleCol(atVals(a=>a.rings),at.rings,true))}
      ${stat('Top-3 Finishes',at.top3||0,scaleCol(atVals(a=>a.top3||0),at.top3||0,true))}
      ${stat('Playoff Apps',at.playoffApps||0,scaleCol(atVals(a=>a.playoffApps||0),at.playoffApps||0,true))}
      ${stat('Playoff Wins',at.playoffWins||0,scaleCol(atVals(a=>a.playoffWins||0),at.playoffWins||0,true))}
      ${stat('Best Finish',at.best?`#${at.best}`:'—',scaleCol(atVals(a=>a.best),at.best,false))}
      ${stat('Worst Finish',at.worst?`#${at.worst}`:'—',scaleCol(atVals(a=>a.worst),at.worst,false))}
      ${stat('Avg Finish',at.avgFinish!=null?`#${at.avgFinish.toFixed(1)}`:'—',scaleCol(atVals(a=>a.avgFinish),at.avgFinish,false))}
    </div>
    </div>
    </div>
    <div class="prof-cols">
      <div class="prof-colstack">
        <div class="prof-col panel prof-ov">
          <div class="sec-head" style="font-size:15px;margin-top:8px"><i class="fa fa-chart-line" style="color:var(--accent)"></i>GFL Overview<span class="badge-info">season by season</span></div>
          <div id="prof-drafts">${profileOverviewHTML(owner)}</div>
        </div>
        <div class="prof-col panel prof-dg">
          <div class="sec-head" style="font-size:15px;margin-top:8px"><i class="fa fa-clipboard-list" style="color:var(--accent)"></i>Draft Grades<span class="badge-info">by season</span></div>
          <div id="prof-draftgrades">${profileDraftBlockHTML(owner)}</div>
        </div>
        <!-- Biggest Enemies moved to Player Tenure; All-Time vs Each Team retired -->
      </div>
      <div class="prof-col panel">
        <div class="sec-head" style="font-size:15px;margin-top:8px"><i class="fa fa-clipboard-list" style="color:var(--accent)"></i>All-Time Starting Lineup</div>
        <div id="prof-lineup">${_tenure?lineupHTML(owner):`<div class="tab-loading" style="padding:24px"><i class="fa fa-circle-notch"></i>Building the all-time lineup…</div>`}</div>
      </div>
    </div>`;
  if(!_tenure){
    loadTenureData().then(()=>{
      const c=document.getElementById('prof-lineup');
      const stillHere=Number(document.getElementById('profile-team-select')?.value||_profileTeam)===id;
      if(c&&stillHere) c.innerHTML=lineupHTML(owner);
    }).catch(()=>{});
  }
  stripeProfileStats();
  if(!_liq[getSeason()]){ loadLineupIQ(); }
  if(!_lineups) loadLineups();
  if(!_draftAllCache){
    loadAllDrafts().then(()=>{
      const d=document.getElementById('prof-drafts');
      const dg=document.getElementById('prof-draftgrades');
      const stillHere=Number(document.getElementById('profile-team-select')?.value||_profileTeam)===id;
      if(stillHere){ if(d) d.innerHTML=profileOverviewHTML(owner); if(dg) dg.innerHTML=profileDraftBlockHTML(owner); }
    }).catch(()=>{});
  }
}
// ── SPORTSBOOK ───────────────────────────────────────────────────────────────
// Play-money futures board. Every line is derived from this league's own
// history: recency-weighted record and scoring, playoff results, top-3 rate,
// rings, coaching metric, scoring blow-ups and duds. Probabilities are turned
// into American prices with a book-style hold, so the field always adds to more
// than 100% exactly like a real sportsbook.
let _sbView='futures';       // futures | props | awards | achieve | team
let _sbTeamSel=null;         // owner for the By Team view
let _slip=[];                // [{k,mk,mkLabel,pick,pickLabel,odds}]
let _sbStake=10;
let _sbCache=null;
let _sbSlipOpen=false;

// The futures season is the one being played next: if the newest season has a
// schedule but nothing played yet, that's it — otherwise it's the year after the
// last completed season.
function sbSeason(){
  for(let i=ALL_SEASONS.length-1;i>=0;i--){
    const y=ALL_SEASONS[i], meta=_seasonMeta[y];
    if(!meta||!(meta.schedule||[]).length) continue;
    const played=(meta.schedule||[]).some(m=>m.home&&m.away&&((m.home.totalPoints||0)>0||(m.away.totalPoints||0)>0));
    return played?Number(y)+1:Number(y);
  }
  return Number(ALL_SEASONS[ALL_SEASONS.length-1])+1;
}
function amFmt(o){ return o==null?'—':(o>0?'+'+o:''+o); }
function amFromProb(p){
  if(!(p>0&&p<1)) return null;
  if(p>=0.5){ const v=100*p/(1-p); return -(v>=200?Math.round(v/10)*10:Math.round(v/5)*5); }
  const v=100*(1-p)/p;
  return v>=400?Math.round(v/50)*50:v>=200?Math.round(v/25)*25:v>=140?Math.round(v/10)*10:Math.round(v/5)*5;
}
function amToDec(o){ return o>0?1+o/100:1+100/Math.abs(o); }
function probFromAm(o){ return o>0?100/(o+100):Math.abs(o)/(Math.abs(o)+100); }
function sbZ(arr){
  const m=arr.reduce((a,b)=>a+b,0)/(arr.length||1);
  const sd=Math.sqrt(arr.reduce((a,b)=>a+(b-m)*(b-m),0)/(arr.length||1))||1;
  return arr.map(v=>(v-m)/sd);
}
function sbSoftmax(vals,k){
  const mx=Math.max(...vals), e=vals.map(v=>Math.exp((v-mx)*k)), s=e.reduce((a,b)=>a+b,0);
  return e.map(v=>v/s);
}
// Standardise first (raw ratings are sums of z-scores, so their spread would
// blow the exponential up), then soften toward uniform so the board prices like
// a real book: a ~20% favourite and longshots in the +2000s rather than +9000s.
function sbProbs(vals,k,blend){
  const z=sbZ(vals), p=sbSoftmax(z,k==null?0.75:k), n=vals.length||1, b=blend==null?0.16:blend;
  return p.map(v=>v*(1-b)+b/n);
}
// per-season regular-season splits for one franchise
function sbSplits(owner){
  const out=[];
  ALL_SEASONS.forEach(s=>{
    const meta=_seasonMeta[s]; if(!meta) return;
    const tid=Object.keys(meta.owners||{}).find(id=>meta.owners[id]===owner); if(tid==null) return;
    let g=0,w=0,pf=0,pa=0;
    (meta.schedule||[]).forEach(m=>{
      if(!m.home||!m.away) return;
      if((m.matchupPeriodId||99)>regEndOf(s)) return;
      const hp=m.home.totalPoints||0, ap=m.away.totalPoints||0; if(hp===0&&ap===0) return;
      if(String(m.home.teamId)===tid){ g++; pf+=hp; pa+=ap; if(hp>ap) w++; }
      else if(String(m.away.teamId)===tid){ g++; pf+=ap; pa+=hp; if(ap>hp) w++; }
    });
    const ti=meta.teams[tid];
    if(g) out.push({season:Number(s),g,w,pf,pa,rank:ti?ti.rank:null});
  });
  return out;
}
function sbBuild(){
  if(_sbCache) return _sbCache;
  if(!_franchises.length||!Object.keys(_seasonMeta).length) return null;
  const latest=ALL_SEASONS[ALL_SEASONS.length-1];
  const meta=_seasonMeta[latest]||{teams:{},owners:{},divisions:{}};
  const HOLD=0.075;                 // outright market hold
  const TWOWAY=0.024;               // per side on two-way markets

  const rows=_franchises.map(fr=>{
    const at=franchiseAllTime(fr.owner), sp=sbSplits(fr.owner);
    let wn=0,wd=0,pfn=0,pan=0;
    sp.forEach(x=>{ const k=Math.pow(1.6,ALL_SEASONS.indexOf(String(x.season)));
      wn+=x.w*k; wd+=x.g*k; pfn+=x.pf*k; pan+=x.pa*k; });
    const tidStr=Object.keys(meta.owners||{}).find(id=>meta.owners[id]===fr.owner);
    const tid=tidStr!=null?Number(tidStr):null;
    const cur=_teams.find(t=>_ownerMap[t.id]===fr.owner);
    const seasons=Math.max(1,at.seasons||1), played=Math.max(1,at.playedSeasons||1);
    const aw=awardsForOwner(fr.owner);
    const cnt=k=>aw.filter(a=>a.key===k).length;
    return {fr,owner:fr.owner,name:fr.name.trim(),at,sp,tid,curId:cur?cur.id:null,
      conf:(tid!=null&&meta.teams[tid])?(meta.divisions[meta.teams[tid].div]||''):'',
      winPct:wd?wn/wd:0.5, ppg:wd?pfn/wd:105, papg:wd?pan/wd:105,
      poApp:(at.playoffApps||0)/seasons, poWin:(at.playoffWins||0)/seasons,
      top3:(at.top3||0)/seasons, rings:(at.rings||0)/seasons,
      o150:(at.over150||0)/played, u80:(at.under80||0)/played,
      hi:at.hi?at.hi.pts:0, moves:cur?cur.moves:0, cm:(cur?_scores[cur.id]:0)||0,
      lastRank:sp.length?sp[sp.length-1].rank||6:6, seasons,
      coy:cnt('coy'), commit:cnt('commitment'), comeback:cnt('comeback'), disappoint:cnt('disappoint')};
  });
  const Z=f=>sbZ(rows.map(f));
  const zWin=Z(r=>r.winPct), zPpg=Z(r=>r.ppg), zPa=Z(r=>r.papg), zPo=Z(r=>r.poWin),
        zT3=Z(r=>r.top3), zRg=Z(r=>r.rings), zHi=Z(r=>r.hi), z150=Z(r=>r.o150),
        z80=Z(r=>r.u80), zMv=Z(r=>r.moves), zCm=Z(r=>r.cm), zLast=Z(r=>r.lastRank),
        zCoy=Z(r=>r.coy), zCommit=Z(r=>r.commit);
  rows.forEach((r,i)=>{
    r.rating=1.15*zWin[i]+0.95*zPpg[i]-0.20*zPa[i]+0.45*zPo[i]+0.30*zT3[i]+0.25*zRg[i]+0.10*zCm[i];
    r.z={win:zWin[i],ppg:zPpg[i],pa:zPa[i],hi:zHi[i],o150:z150[i],u80:z80[i],mv:zMv[i],
         last:zLast[i],coy:zCoy[i],commit:zCommit[i]};
  });
  const ratings=rows.map(r=>r.rating);
  const lgPpg=rows.reduce((a,r)=>a+r.ppg,0)/rows.length;
  const GAMES=regEndOf(latest)||14;

  // ── helpers that build market objects ──
  const outright=(key,title,sub,probs,badge,icon)=>{
    const tot=probs.reduce((a,b)=>a+b,0)||1;
    const picks=rows.map((r,i)=>{
      const p=Math.max(0.008,(probs[i]/tot))*(1+HOLD);
      const o=amFromProb(Math.min(0.95,p));
      return {owner:r.owner,name:r.name,tid:r.tid,odds:o,prob:probFromAm(o),fair:probs[i]/tot};
    }).sort((a,b)=>b.fair-a.fair);
    return {key,title,sub,type:'outright',badge:badge||'Outright',icon:icon||'fa-trophy',picks};
  };
  const yesno=(key,title,sub,probs,badge,icon)=>({key,title,sub,type:'yesno',badge:badge||'Yes / No',
    icon:icon||'fa-check-double',
    picks:rows.map((r,i)=>{
      const p=Math.min(0.86,Math.max(0.14,probs[i]));
      const y=amFromProb(Math.min(0.96,p+TWOWAY)), n=amFromProb(Math.min(0.96,(1-p)+TWOWAY));
      return {owner:r.owner,name:r.name,tid:r.tid,yes:y,no:n,fair:p};
    }).sort((a,b)=>b.fair-a.fair)});
  const overunder=(key,title,sub,vals,slope,round,badge,icon)=>({key,title,sub,type:'ou',
    badge:badge||'Over / Under',icon:icon||'fa-arrows-up-down',
    picks:rows.map((r,i)=>{
      const exp=vals[i];
      const line=round===0.5?Math.round(exp*2)/2:Math.round(exp/round)*round+(round>=5?0.5:0);
      const pOver=Math.min(0.70,Math.max(0.30,0.5+(exp-line)*slope));
      return {owner:r.owner,name:r.name,tid:r.tid,line,exp,
        over:amFromProb(Math.min(0.95,pOver+TWOWAY)), under:amFromProb(Math.min(0.95,(1-pOver)+TWOWAY)),
        fair:exp};
    }).sort((a,b)=>b.fair-a.fair)});

  // ── FUTURES ──
  const champ=outright('champ',`${sbSeason()} GFL Championship`,'Who lifts the trophy',
    sbProbs(ratings,0.70,0.46),'Outright','fa-trophy');
  const confs={};
  rows.forEach(r=>{ (confs[r.conf||'League']||(confs[r.conf||'League']=[])).push(r); });
  const confMarkets=Object.entries(confs).filter(([,arr])=>arr.length>1).map(([cname,arr])=>{
    const pr=sbProbs(arr.map(r=>r.rating),0.80,0.30);
    const tot=pr.reduce((a,b)=>a+b,0)||1;
    return {key:'conf-'+cname,title:`${cname} Conference Winner`,sub:'Best record in the conference',
      type:'outright',badge:'Outright',icon:'fa-star',
      picks:arr.map((r,i)=>{const p=Math.max(0.02,pr[i]/tot)*(1+HOLD*0.8);const o=amFromProb(Math.min(0.95,p));
        return {owner:r.owner,name:r.name,tid:r.tid,odds:o,prob:probFromAm(o),fair:pr[i]/tot};})
        .sort((a,b)=>b.fair-a.fair)};
  });
  // make the playoffs: logistic on rating, solved so the field sums to 6 of 12
  const spots=Math.min(6,Math.round(rows.length/2));
  const zr=sbZ(ratings);
  let lo=-6,hiC=6,c=0;
  for(let it=0;it<60;it++){ c=(lo+hiC)/2;
    const s=zr.reduce((a,v)=>a+1/(1+Math.exp(-(1.05*v+c))),0);
    if(s>spots) hiC=c; else lo=c; }
  const pPlayoffs=zr.map(v=>1/(1+Math.exp(-(1.05*v+c))));
  const playoffs=yesno('playoffs',`${sbSeason()} Playoff Berth`,`Top ${spots} of ${rows.length} make the bracket`,
    pPlayoffs,'Yes / No','fa-calendar-check');
  const lastPlace=outright('last',`${sbSeason()} Last Place`,'Finishes bottom of the league — punishment duty',
    sbProbs(ratings.map(v=>-v),0.68,0.44),'Outright','fa-gavel');

  // ── TEAM PROPS ──
  const wins=overunder('wins',`Regular Season Wins`,`${GAMES}-game regular season`,
    zr.map(v=>Math.min(GAMES-2,Math.max(2,GAMES*Math.min(0.70,Math.max(0.30,1/(1+Math.exp(-0.62*v))))))),
    0.30,0.5,'Over / Under','fa-arrows-up-down');
  const pfTotals=overunder('pf','Total Points Scored',`Regular season total, ${GAMES} games`,
    rows.map(r=>(lgPpg+0.55*(r.ppg-lgPpg))*GAMES),0.0055,5,'Over / Under','fa-fire');
  const paTotals=overunder('pa','Total Points Against',`Regular season total, ${GAMES} games`,
    rows.map(r=>(lgPpg+0.25*(r.papg-lgPpg))*GAMES),0.0055,5,'Over / Under','fa-shield-halved');
  const mostPf=outright('mostpf','Most Points Scored','League leader in points for',
    sbProbs(rows.map(r=>r.z.ppg),0.80,0.40),'Outright','fa-fire');
  const fewestPf=outright('fewpf','Fewest Points Scored','League low in points for',
    sbProbs(rows.map(r=>-r.z.ppg),0.80,0.40),'Outright','fa-battery-empty');
  const mostPa=outright('mostpa','Most Points Against','Takes the most incoming fire',
    sbProbs(rows.map(r=>r.z.pa),0.40,0.58),'Outright','fa-shield-halved');

  // ── AWARDS ──
  const coy=outright('coy','Coach of the Year','GFL voted',
    sbProbs(rows.map(r=>0.9*r.rating+0.55*r.z.coy),0.70,0.44),'Outright','fa-brain');
  const disappoint=outright('disappoint','Most Disappointing Team','Expectations vs reality',
    sbProbs(rows.map(r=>0.85*r.rating-0.25*r.z.last),0.60,0.48),'Outright','fa-face-frown');
  const comeback=outright('comeback','Comeback Team of the Year','Biggest jump off last season',
    sbProbs(rows.map(r=>0.85*r.z.last+0.35*r.z.ppg),0.66,0.44),'Outright','fa-rotate-left');
  const commit=outright('commit','League Commitment Award','Most active, most involved',
    sbProbs(rows.map(r=>0.75*r.z.mv+0.65*r.z.commit),0.68,0.44),'Outright','fa-hand-fist');

  // ── ACHIEVEMENTS ──
  const highWeek=outright('highweek','Highest Single Week','Top score of any team in any week',
    sbProbs(rows.map(r=>0.75*r.z.ppg+0.5*r.z.hi),0.70,0.42),'Outright','fa-bolt');
  const most150=outright('most150','Most 150+ Point Games','Blow-up weeks',
    sbProbs(rows.map(r=>0.9*r.z.o150+0.45*r.z.ppg),0.72,0.42),'Outright','fa-rocket');
  const most80=outright('most80','Most Sub-80 Duds','Weeks the offense never showed',
    sbProbs(rows.map(r=>0.9*r.z.u80-0.3*r.z.ppg),0.72,0.42),'Outright','fa-face-dizzy');
  // only franchises that have never won can win a FIRST ring, and it reads better
  // as an outright than as a Yes/No carrying -2000 on the No side
  const ringless=rows.filter(r=>!r.at.rings);
  let anyRing=null;
  if(ringless.length>1){
    const raw=ringless.map(r=>(champ.picks.find(x=>x.owner===r.owner)||{fair:0.05}).fair);
    const tot=raw.reduce((a,b)=>a+b,0)||1;
    anyRing={key:'firstring',title:'First-Time Champion',
      sub:`${ringless.length} franchises have never won — which one breaks through`,
      type:'outright',badge:'Outright',icon:'fa-ring',
      picks:ringless.map((r,i)=>{
        const p=Math.max(0.02,raw[i]/tot)*(1+HOLD);
        const o=amFromProb(Math.min(0.95,p));
        return {owner:r.owner,name:r.name,tid:r.tid,odds:o,prob:probFromAm(o),fair:raw[i]/tot};
      }).sort((a,b)=>b.fair-a.fair)};
  }

  const groups={
    futures:[champ,...confMarkets,playoffs,lastPlace],
    props:[wins,pfTotals,paTotals,mostPf,fewestPf,mostPa],
    awards:[coy,disappoint,comeback,commit],
    achieve:[highWeek,most150,most80,...(anyRing?[anyRing]:[])],
  };
  _sbCache={rows,groups,season:sbSeason(),games:GAMES,spots};
  return _sbCache;
}

/* ── GFL BUCKS ──────────────────────────────────────────────────────────────
   Every team gets 100 bucks a week, Tuesday 6am to Tuesday 6am, and it does
   not carry: each new week starts at 100 again regardless of what was left.

   Because of that reset the balance is *derived* rather than stored — it is
   100 minus what this week's bets staked, plus what this week's settled bets
   returned. There is no balance document to drift out of sync with the bets,
   and a bet is the only thing that can move the number.

   Bets live in their own Firestore collection keyed to the profile that placed
   them, so "my bets" is a filter rather than a per-user document. */
const BUCKS_WEEKLY=100;
const betBase=()=>`https://firestore.googleapis.com/v1/projects/${GFL_DB.project}/databases/(default)/documents/bets`;
let _bets=null,_betErr=null,_betBusy=false;

/* The Tuesday 6am boundary the league already runs on. msgWeekStart used to
   own this rule; both callers share it now so the board and the bucks week can
   never disagree about when a week turned over. */
function tueWeekStart(now=new Date()){
  const x=new Date(now);
  x.setHours(6,0,0,0);
  let back=(x.getDay()-2+7)%7;                       // days since Tuesday
  if(x.getDay()===2 && now.getHours()<6) back=7;     // pre-dawn Tuesday is still last week
  x.setDate(x.getDate()-back);
  return x.getTime();
}
function bucksWeekKey(now=new Date()){
  const d=new Date(tueWeekStart(now));
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function bucksWeekEnd(now=new Date()){ return tueWeekStart(now)+7*24*3600*1000; }
function bucksResetsIn(now=new Date()){
  const ms=bucksWeekEnd(now)-now.getTime();
  const d=Math.floor(ms/86400000), h=Math.floor(ms%86400000/3600000);
  return d>0?`${d}d ${h}h`:`${h}h`;
}
const betsMine=()=>(_bets||[]).filter(b=>_me&&b.owner===_me.k1);
const betsThisWeek=()=>betsMine().filter(b=>b.wk===bucksWeekKey());
function bucksStaked(){ return betsThisWeek().reduce((a,b)=>a+b.stake,0); }
function bucksReturned(){ return betsThisWeek().reduce((a,b)=>a+(b.status==='open'?0:b.ret),0); }
function bucksBalance(){ return Math.max(0,BUCKS_WEEKLY-bucksStaked()+bucksReturned()); }
/* Always shown as money, and the currency is always "GFL Bucks" in full. */
const bucksFmt=v=>'$'+Math.round(v).toLocaleString();

async function betList(){
  try{
    const r=await fetch(`${betBase()}?${msgKey()}&pageSize=300`,{cache:'no-store'});
    if(r.status===403){ _betErr='rules'; return null; }
    if(!r.ok){ _betErr='fetch'; return null; }
    const j=await r.json();
    _betErr=null;
    return (j.documents||[]).map(d=>{
      const f=fsIn(d);
      let legs=[]; try{ legs=JSON.parse(f.legs||'[]')||[]; }catch(e){}
      return {id:(d.name||'').split('/').pop(),owner:f.owner||'',team:f.team||'',
        season:f.season||'',wk:f.wk||'',ts:Number(f.ts)||0,
        stake:Number(f.stake)||0,odds:Number(f.odds)||0,payout:Number(f.payout)||0,
        legs,status:f.status||'open',settledTs:Number(f.settledTs)||0,ret:Number(f.ret)||0,
        hidden:String(f.hidden||'')==='1'};
    }).sort((a,b)=>b.ts-a.ts);
  }catch(e){ _betErr='offline'; return null; }
}
async function betRefresh(){ const l=await betList(); if(l) _bets=l; }

async function sbPlaceBet(){
  if(!_me){ openSignIn(); return; }
  if(!_slip.length||_betBusy) return;
  const stake=Math.round(Math.max(0,Number(_sbStake)||0));
  if(stake<=0){ _betErr='stake'; sbRenderSlip(); return; }
  if(stake>bucksBalance()){ _betErr='funds'; sbRenderSlip(); return; }
  _betBusy=true; _betErr=null; sbRenderSlip();
  const dec=_slip.reduce((a,s)=>a*amToDec(s.odds),1);
  const odds=_slip.length>1?amFromProb(1/dec):_slip[0].odds;
  const id=`${Date.now()}-${_me.k1}`.replace(/[^a-zA-Z0-9-]/g,'').slice(0,80);
  const body=fsOut({
    owner:_me.k1, team:String(_me.teamId||''), season:String(sbSeason()),
    wk:bucksWeekKey(), ts:String(Date.now()),
    stake:String(stake), odds:String(odds), payout:String(Math.round(stake*dec)),
    legs:JSON.stringify(_slip.map(s=>({mk:s.mk,mkLabel:s.mkLabel,pick:s.pick,pickLabel:s.pickLabel,odds:s.odds}))),
    status:'open', settledTs:'0', ret:'0',
  });
  try{
    const r=await fetch(`${betBase()}?documentId=${encodeURIComponent(id)}&${msgKey()}`,
      {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    if(r.ok){ _slip=[]; _sbStake=10; await betRefresh(); sbSyncButtons(); renderMyBets(); }
    else _betErr=r.status===403?'rules':'send';
  }catch(e){ _betErr='offline'; }
  _betBusy=false; sbRenderSlip();
}

/* ── Pulling a bet back ─────────────────────────────────────────────────────
   A bet can be taken back until the week's football starts. Once any game in
   the current bucks week has kicked off everything locks, and earlier weeks
   are locked outright.

   Cancelling voids rather than deletes: the stake is returned and the row
   stays on the ledger. That is why the Firestore rules withhold delete — a
   losing bet must never be able to disappear, and a void is an event worth
   being able to see. */
/* "Started" means this league's week has started, not the NFL's. The public
   scoreboard is the wrong clock: in August it reports preseason games already
   final, which would lock every bet before a fantasy season even exists. The
   fantasy week is the honest signal — once any matchup in it has put a point
   on the board, the week is under way and the slips are set. */
function weekHasStarted(){
  let info=_liveInfo;
  if(!info && typeof liveWeekInfo==='function'){ try{ info=liveWeekInfo(); }catch(e){} }
  if(!info||!info.games||!info.games.length) return false;
  return info.games.some(g=>((g.home&&g.home.totalPoints)||0)>0
                          ||((g.away&&g.away.totalPoints)||0)>0);
}
function betCancellable(b){
  return !!_me && b.owner===_me.k1 && b.status==='open'
    && b.wk===bucksWeekKey() && !weekHasStarted();
}
async function sbVoidBet(id){
  const b=(_bets||[]).find(x=>x.id===id);
  if(!b||!betCancellable(b)||_betBusy) return;
  _betBusy=true; _betErr=null; renderMyBets();
  const mask='updateMask.fieldPaths=status&updateMask.fieldPaths=ret&updateMask.fieldPaths=settledTs';
  try{
    const r=await fetch(`${betBase()}/${encodeURIComponent(id)}?${msgKey()}&${mask}`,
      {method:'PATCH',headers:{'Content-Type':'application/json'},
       body:JSON.stringify(fsOut({status:'void',ret:String(b.stake),settledTs:String(Date.now())}))});
    if(r.ok){ b.status='void'; b.ret=b.stake; b.settledTs=Date.now(); }
    else _betErr=r.status===403?'rules':'send';
  }catch(e){ _betErr='offline'; }
  _betBusy=false; renderMyBets();
}

/* Clearing a finished bet off the stack hides the row; it never deletes it and
   never touches the ledger. The week's balance is derived by replaying every
   bet in it, so a cleared loss must still have cost its stake and a cleared win
   must still have paid — hiding only decides what the list shows. */
function betsClearable(){ return betsMine().filter(b=>b.status!=='open'&&!b.hidden); }
async function sbClearSettled(){
  const done=betsClearable();
  if(!done.length||_betBusy) return;
  _betBusy=true; _betErr=null; renderMyBets();
  for(const b of done){
    try{
      const r=await fetch(`${betBase()}/${encodeURIComponent(b.id)}?${msgKey()}&updateMask.fieldPaths=hidden`,
        {method:'PATCH',headers:{'Content-Type':'application/json'},
         body:JSON.stringify(fsOut({hidden:'1'}))});
      if(r.ok) b.hidden=true; else _betErr=r.status===403?'rules':'send';
    }catch(e){ _betErr='offline'; }
  }
  _betBusy=false; renderMyBets();
}

/* ── Settling ───────────────────────────────────────────────────────────────
   A leg is graded only when its market has an answer. Most of this book is
   season-long futures, so nothing settles until a season is final — and the
   four award markets are decided by a league vote rather than by the data, so
   they are never auto-graded and are reported as needing a manual call.
   Returns null for "cannot grade yet", true/false once it can. */
function betLegResult(leg,season){
  const [ownerRaw,side]=String(leg.pick).split(':');
  const owner=ownerRaw;
  const fin=sbFinals(season); if(!fin) return null;
  const num=v=>typeof v==='number'&&isFinite(v)?v:null;
  const line=(()=>{const m=/(?:Over|Under)\s+([\d.]+)/.exec(leg.pickLabel||'');return m?Number(m[1]):null;})();
  const ou=(val,over)=>{const v=num(val);if(v==null||line==null)return null;if(v===line)return 'push';return over?v>line:v<line;};
  switch(leg.mk){
    case 'champ':     return fin.champ==null?null:fin.champ===owner;
    case 'last':      return fin.last==null?null:fin.last===owner;
    case 'firstring': return fin.champ==null?null:fin.champ===owner;
    case 'playoffs':  return fin.playoff==null?null:(fin.playoff.includes(owner)===(side==='yes'));
    case 'mostpf':    return fin.mostPf==null?null:fin.mostPf===owner;
    case 'fewpf':     return fin.fewPf==null?null:fin.fewPf===owner;
    case 'mostpa':    return fin.mostPa==null?null:fin.mostPa===owner;
    case 'highweek':  return fin.highWeek==null?null:fin.highWeek===owner;
    case 'most150':   return fin.most150==null?null:fin.most150===owner;
    case 'most80':    return fin.most80==null?null:fin.most80===owner;
    case 'wins':      return ou(fin.wins[owner],side==='o');
    case 'pf':        return ou(fin.pf[owner],side==='o');
    case 'pa':        return ou(fin.pa[owner],side==='o');
    default:
      if(String(leg.mk).startsWith('conf-'))
        return fin.confWinners==null?null:fin.confWinners[leg.mk.slice(5)]===owner;
      return null;      // coy / disappoint / comeback / commit — league vote
  }
}
/* Everything a season's markets can be graded against, or null while the
   season is still running. Built from the schedule rather than from standings
   fields, and capped at regEnd, because every line in this book is written
   against the regular season. A season counts as decided once a team carries
   rankCalculatedFinal 1. */
const _finalsCache={};
function sbFinals(season){
  if(season in _finalsCache) return _finalsCache[season];
  const meta=_seasonMeta[season];
  if(!meta) return null;                              // not loaded — ask again later
  const owners=meta.owners||{}, T=meta.teams||{}, regEnd=regEndOf(season);
  const ids=Object.keys(T);
  const champId=ids.find(id=>T[id].rank===1);
  if(!ids.length||champId==null) return (_finalsCache[season]=null);
  const lastId=ids.reduce((a,b)=>(T[b].rank||0)>(T[a].rank||0)?b:a,ids[0]);

  const rec={}; ids.forEach(id=>rec[id]={w:0,g:0,pf:0,pa:0,hi:0,o150:0,u80:0});
  (meta.schedule||[]).forEach(m=>{
    if(!m.home||!m.away) return;
    if((m.matchupPeriodId||99)>regEnd) return;
    const hp=m.home.totalPoints||0, ap=m.away.totalPoints||0;
    if(hp===0&&ap===0) return;
    [[String(m.home.teamId),hp,ap],[String(m.away.teamId),ap,hp]].forEach(([id,f,ag])=>{
      const r=rec[id]; if(!r) return;
      r.g++; r.pf+=f; r.pa+=ag; if(f>ag) r.w++;
      if(f>r.hi) r.hi=f;
      if(f>=150) r.o150++;
      if(f<80) r.u80++;
    });
  });
  const played=ids.filter(id=>rec[id].g);
  if(!played.length) return (_finalsCache[season]=null);

  const own=id=>owners[id];
  const best=(val,better)=>{let bi=null;played.forEach(id=>{
    if(bi==null||better(val(rec[id]),val(rec[bi]))) bi=id;});return bi==null?null:own(bi);};
  const map=f=>{const o={};played.forEach(id=>{const ow=own(id);if(ow)o[ow]=f(rec[id]);});return o;};
  const rank=(a,b)=>rec[b].w-rec[a].w||rec[b].pf-rec[a].pf;

  const playoff=played.slice().sort(rank).slice(0,meta.playoffTeamCount||6).map(own).filter(Boolean);
  const conf={};
  played.forEach(id=>{
    const c=(meta.divisions||{})[T[id].div]||'League';
    if(!conf[c]||rank(id,conf[c])<0) conf[c]=id;
  });
  Object.keys(conf).forEach(c=>{conf[c]=own(conf[c]);});

  return (_finalsCache[season]={
    champ:own(champId), last:own(lastId), playoff, confWinners:conf,
    wins:map(r=>r.w), pf:map(r=>r.pf), pa:map(r=>r.pa),
    mostPf:best(r=>r.pf,(a,b)=>a>b), fewPf:best(r=>r.pf,(a,b)=>a<b),
    mostPa:best(r=>r.pa,(a,b)=>a>b), highWeek:best(r=>r.hi,(a,b)=>a>b),
    most150:best(r=>r.o150,(a,b)=>a>b), most80:best(r=>r.u80,(a,b)=>a>b),
  });
}
function betGrade(bet){
  const res=bet.legs.map(l=>betLegResult(l,bet.season));
  if(res.some(r=>r===false)) return {status:'lost',ret:0};
  if(res.some(r=>r===null))  return null;                 // still open
  const pushes=res.filter(r=>r==='push').length;
  if(pushes===res.length)    return {status:'push',ret:bet.stake};
  return {status:'won',ret:bet.payout};
}

// ── SPORTSBOOK UI ────────────────────────────────────────────────────────────
const SB_GROUPS=[
  {k:'week',label:'This Week',icon:'fa-calendar-week'},
  {k:'futures',label:'Futures',icon:'fa-trophy'},
  {k:'props',label:'Team Props',icon:'fa-chart-simple'},
  {k:'awards',label:'Awards',icon:'fa-award'},
  {k:'achieve',label:'Achievements',icon:'fa-bolt'},
  {k:'team',label:'By Team',icon:'fa-id-badge'},
];
function sbAvatar(owner,size){
  const fr=_franchises.find(f=>f.owner===owner);
  return fr?avatarCore(fr.name,fr.teamId||0,proxyLogo(fr.logo),size||24,7):'';
}
function sbTeamAb(owner,name){ return drAbbr(owner,name); }
function sbSel(mk,pick){ return _slip.some(x=>x.k===mk+'|'+pick); }
function sbBtn(mk,mkLabel,pick,pickLabel,odds,extra,btnLabel){
  if(odds==null) return `<span class="sb-odds sb-odds-off">—</span>`;
  const on=sbSel(mk,pick)?' on':'';
  const args=[mk,mkLabel,pick,pickLabel,odds].map(v=>typeof v==='string'?`'${String(v).replace(/'/g,"\\'")}'`:v).join(',');
  return `<button class="sb-odds${on}${extra?' '+extra:''}" data-k="${mk}|${pick}" onclick="sbPick(${args})">
    ${btnLabel?`<span class="sb-o-lbl">${btnLabel}</span>`:''}<span class="sb-o-val">${amFmt(odds)}</span></button>`;
}
function sbMarketHTML(m){
  const rows=m.picks.map(p=>{
    const nm=`<span class="sb-tm">${sbAvatar(p.owner,22)}<span class="sb-nm">${p.name}</span><span class="sb-ab">${sbTeamAb(p.owner,p.name)}</span></span>`;
    if(m.type==='outright'){
      return `<div class="sb-row">${nm}
        <span class="sb-imp">${(p.prob*100).toFixed(1)}%</span>
        ${sbBtn(m.key,m.title,p.owner,p.name,p.odds)}</div>`;
    }
    if(m.type==='yesno'){
      return `<div class="sb-row sb-row2">${nm}
        ${sbBtn(m.key,m.title,p.owner+':yes',p.name+' — Yes',p.yes,'sb-two','Yes')}
        ${sbBtn(m.key,m.title,p.owner+':no',p.name+' — No',p.no,'sb-two','No')}</div>`;
    }
    const ln=m.key==='wins'?p.line.toFixed(1):p.line.toFixed(1);
    return `<div class="sb-row sb-row2">${nm}
      ${sbBtn(m.key,m.title,p.owner+':o',`${p.name} — Over ${ln}`,p.over,'sb-two','O '+ln)}
      ${sbBtn(m.key,m.title,p.owner+':u',`${p.name} — Under ${ln}`,p.under,'sb-two','U '+ln)}</div>`;
  }).join('');
  const head=m.type==='outright'
    ? `<div class="sb-row sb-head"><span>Team</span><span class="sb-imp">Implied</span><span class="sb-oh">Odds</span></div>`
    : m.type==='yesno'
      ? `<div class="sb-row sb-row2 sb-head"><span>Team</span><span class="sb-oh">Yes</span><span class="sb-oh">No</span></div>`
      : `<div class="sb-row sb-row2 sb-head"><span>Team</span><span class="sb-oh">Over</span><span class="sb-oh">Under</span></div>`;
  return `<div class="sb-market">
    <div class="sb-mhead"><i class="fa ${m.icon}"></i><span class="sb-mt">${m.title}</span><span class="badge-info">${m.badge}</span></div>
    <div class="sb-msub">${m.sub}</div>
    <div class="sb-rows">${head}${rows}</div>
  </div>`;
}
function renderMyBets(){ if(_activeTab==='book') renderBook(); }
let _betsInit=false;
async function initBets(){
  if(_betsInit) return; _betsInit=true;
  await betRefresh();
  renderMyBets();
  betSettleAll();
}
/* Grade every open bet whose markets now have an answer and write the result
   back. Safe to run repeatedly: betGrade returns null while a season is still
   undecided, and a settled bet is never revisited. */
async function betSettleAll(){
  if(!_bets||!_bets.length) return;
  let changed=false;
  for(const b of _bets.filter(x=>x.status==='open')){
    const g=betGrade(b); if(!g) continue;
    const mask='updateMask.fieldPaths=status&updateMask.fieldPaths=ret&updateMask.fieldPaths=settledTs';
    try{
      const r=await fetch(`${betBase()}/${encodeURIComponent(b.id)}?${msgKey()}&${mask}`,
        {method:'PATCH',headers:{'Content-Type':'application/json'},
         body:JSON.stringify(fsOut({status:g.status,ret:String(g.ret),settledTs:String(Date.now())}))});
      if(r.ok){ b.status=g.status; b.ret=g.ret; b.settledTs=Date.now(); changed=true; }
    }catch(e){}
  }
  if(changed) renderMyBets();
}

/* Every bet this profile has placed, newest first, with the week's ledger on
   top. Grouped by bucks week so a settled week reads as its own scoreboard. */
function myBetsHTML(){
  if(!_me) return `<div class="sb-mine-empty"><i class="fa fa-wallet"></i>
    <div>Sign in to track your bets.</div>
    <button class="sb-place" onclick="openSignIn()"><i class="fa fa-right-to-bracket"></i>Sign in</button></div>`;
  if(_betErr==='rules') return `<div class="sb-mine-empty"><i class="fa fa-lock"></i>
    <div>The <code>bets</code> collection is not readable yet — its Firestore rule still needs publishing.</div></div>`;
  if(_bets===null) return `<div class="tab-loading" style="padding:22px"><i class="fa fa-circle-notch"></i>Loading your bets…</div>`;
  const all=betsMine();                 // ledger reflects every bet, cleared or not
  const mine=all.filter(b=>!b.hidden);  // the list shows what has not been cleared
  const bal=bucksBalance(), staked=bucksStaked(), back=bucksReturned();
  const open=all.filter(b=>b.status==='open').length;
  const won=all.filter(b=>b.status==='won').length;
  const lost=all.filter(b=>b.status==='lost').length;   // voids count to neither
  const ledger=`<div class="sb-ledger">
    <div class="sb-led"><span>GFL Bucks</span><b>${bucksFmt(bal)}</b></div>
    <div class="sb-led"><span>Record</span><b>${won}-${lost}${open?` · ${open} open`:''}</b></div>
    <div class="sb-led sb-led-note">Resets to ${bucksFmt(BUCKS_WEEKLY)} in ${bucksResetsIn()}</div>
  </div>
  ${betsClearable().length?`<div class="sb-clearsettled-row">
    <button class="sb-clear" onclick="sbClearSettled()" ${_betBusy?'disabled':''}>
      <i class="fa fa-broom"></i> Clear settled (${betsClearable().length})</button></div>`:''}`;
  if(!mine.length) return ledger+`<div class="sb-mine-empty"><i class="fa fa-receipt"></i>
    <div>No bets yet. Tap any price to build a slip.</div></div>`;
  const weeks={};
  mine.forEach(b=>{(weeks[b.wk]||(weeks[b.wk]=[])).push(b);});
  const cur=bucksWeekKey();
  const cards=Object.keys(weeks).sort().reverse().map(wk=>{
    const list=weeks[wk].map(b=>{
      const cls=b.status==='won'?'won':b.status==='lost'?'lost'
        :b.status==='push'?'push':b.status==='void'?'void':'open';
      const legs=b.legs.map(l=>`<div class="sb-bl"><span class="sb-bl-p">${l.pickLabel}</span>
        <span class="sb-bl-m">${l.mkLabel}</span><span class="sb-bl-o">${amFmt(l.odds)}</span></div>`).join('');
      const canPull=betCancellable(b);
      return `<div class="sb-bet sb-bet-${cls}">
        <div class="sb-bet-top">
          <span class="sb-bet-tag">${b.legs.length>1?`${b.legs.length}-leg parlay`:'Single'}</span>
          <span class="sb-bet-st sb-st-${cls}">${
            b.status==='won'?`Won +${bucksFmt(b.ret-b.stake)}`
            :b.status==='lost'?`Lost ${bucksFmt(b.stake)}`
            :b.status==='push'?'Push'
            :b.status==='void'?'Pulled'
            :'Open'}</span>
        </div>
        <div class="sb-bet-legs">${legs}</div>
        <div class="sb-bet-foot">
          <span>Stake <b>${bucksFmt(b.stake)}</b></span>
          <span>${amFmt(b.odds)}</span>
          <span>${b.status==='open'?'To return':'Returned'} <b>${bucksFmt(b.status==='open'?b.payout:b.ret)}</b></span>
        </div>
        ${canPull?`<button class="sb-pull" onclick="sbVoidBet('${b.id.replace(/'/g,"\\'")}')" ${_betBusy?'disabled':''}>
            <i class="fa fa-rotate-left"></i>Remove bet · ${bucksFmt(b.stake)} back</button>`
          :b.status==="open"&&b.wk===cur&&weekHasStarted()?`<div class="sb-lockmsg"><i class="fa fa-lock"></i>Locked — the week is under way</div>`:''}
      </div>`;
    }).join('');
    const d=new Date(wk+'T00:00:00');
    return `<div class="sb-week">
      <div class="sb-week-h">${wk===cur?'This week':d.toLocaleDateString(undefined,{month:'short',day:'numeric'})}
        <span>${weeks[wk].length} bet${weeks[wk].length>1?'s':''}</span></div>
      ${list}</div>`;
  }).join('');
  return ledger+cards;
}
function sbTeamViewHTML(book){
  if(_sbTeamSel==null||!book.rows.some(r=>r.owner===_sbTeamSel)) _sbTeamSel=book.rows.slice().sort((a,b)=>b.rating-a.rating)[0].owner;
  const owner=_sbTeamSel;
  const r=book.rows.find(x=>x.owner===owner);
  const opts=book.rows.slice().sort((a,b)=>a.name.localeCompare(b.name))
    .map(x=>`<option value="${x.owner}" ${x.owner===owner?'selected':''}>${x.name}</option>`).join('');
  const lines=[];
  Object.values(book.groups).flat().forEach(m=>{
    const p=m.picks.find(x=>x.owner===owner); if(!p) return;
    if(m.type==='outright') lines.push({m,label:m.title,cells:[sbBtn(m.key,m.title,owner,r.name,p.odds)],note:(p.prob*100).toFixed(1)+'% implied'});
    else if(m.type==='yesno') lines.push({m,label:m.title,cells:[sbBtn(m.key,m.title,owner+':yes',r.name+' — Yes',p.yes,'sb-two','Yes'),sbBtn(m.key,m.title,owner+':no',r.name+' — No',p.no,'sb-two','No')],note:'Yes / No'});
    else lines.push({m,label:m.title+' · '+p.line.toFixed(1),cells:[sbBtn(m.key,m.title,owner+':o',`${r.name} — Over ${p.line.toFixed(1)}`,p.over,'sb-two','O '+p.line.toFixed(1)),sbBtn(m.key,m.title,owner+':u',`${r.name} — Under ${p.line.toFixed(1)}`,p.under,'sb-two','U '+p.line.toFixed(1))],note:'projection '+(m.key==='wins'?p.exp.toFixed(1)+' wins':Math.round(p.exp)+' pts')});
  });
  const at=r.at;
  return `<div class="sb-market">
    <div class="sb-mhead"><i class="fa fa-id-badge"></i><span class="sb-mt">Team Card</span><span class="badge-info">every market</span></div>
    <div class="picker-bar" style="padding:10px 0 12px"><label for="sb-team">Team:</label>
      <select id="sb-team" onchange="sbSetTeam(this.value)">${opts}</select></div>
    <div class="sb-tcard">
      <div class="sb-tc-top">${sbAvatar(owner,40)}<div><div class="sb-tc-nm">${r.name}</div>
        <div class="sb-tc-sub">${at.w}–${at.l} all-time · ${r.ppg.toFixed(1)} PPG · ${at.rings} ring${at.rings===1?'':'s'} · ${at.playoffApps||0} playoff app${(at.playoffApps||0)===1?'':'s'}</div></div>
        <div class="sb-tc-rate"><span class="v">${r.rating>=0?'+':''}${r.rating.toFixed(2)}</span><span class="l">power rating</span></div></div>
    </div>
    <div class="sb-rows">${lines.map(l=>`<div class="sb-trow">
      <span class="sb-tl"><span class="sb-tl-m">${l.label}</span><span class="sb-tl-n">${l.note}</span></span>
      <span class="sb-tc-odds">${l.cells.join('')}</span></div>`).join('')}</div>
  </div>`;
}
function sbSlipHTML(){
  const n=_slip.length;
  const dec=_slip.reduce((a,s)=>a*amToDec(s.odds),1);
  const bal=bucksBalance();
  const stake=Math.min(bal,Math.max(0,Number(_sbStake)||0));
  const payout=stake*dec;
  const parlay=n?amFromProb(1/dec):null;
  /* No Clear here: on phones the dock already titles the sheet, so this header
     is hidden and anything living in it would go with it. Clear sits under the
     picks instead, next to what it actually clears. */
  return `<div class="sb-slip-head"><i class="fa fa-receipt"></i>Bet Slip<span class="sb-slip-n">${n}</span></div>
    ${_me?`<div class="sb-bank">
        <span class="sb-bank-l"><i class="fa fa-wallet"></i>GFL Bucks</span>
        <span class="sb-bank-v">${bucksFmt(bal)}</span>
        <span class="sb-bank-r">resets in ${bucksResetsIn()}</span>
      </div>`:''}
    ${n?`<div class="sb-slip-list">${_slip.map(s=>`<div class="sb-slip-item">
        <div class="sb-si-txt"><div class="sb-si-pick">${s.pickLabel}</div><div class="sb-si-mkt">${s.mkLabel}</div></div>
        <div class="sb-si-odds">${amFmt(s.odds)}</div>
        <button class="sb-si-x" onclick="sbDrop('${s.k.replace(/'/g,"\\'")}')" aria-label="Remove"><i class="fa fa-xmark"></i></button>
      </div>`).join('')}</div>
      <div class="sb-slip-actions"><button class="sb-clear" onclick="sbClear()">Clear all</button></div>
      <div class="sb-stake">
        <label for="sb-stake-in">Stake</label>
        <input id="sb-stake-in" type="number" min="0" step="10" max="${bal}" value="${stake}" oninput="sbStake(this.value)"/>
        <span class="sb-cur">GFL Bucks</span>
      </div>
      <div class="sb-quick">
        ${[25,50,100].filter(v=>v<=bal).map(v=>`<button onclick="sbStake(${v})">${bucksFmt(v)}</button>`).join('')}
        <button onclick="sbStake(${bal})">All in</button>
      </div>
      <div class="sb-totals">
        <div class="sb-tot"><span>${n>1?'Parlay odds':'Odds'}</span><b>${amFmt(n>1?parlay:_slip[0].odds)}</b></div>
        <div class="sb-tot"><span>To win</span><b class="sb-win">${(payout-stake).toLocaleString(undefined,{maximumFractionDigits:0})}</b></div>
        <div class="sb-tot sb-tot-big"><span>Payout</span><b>${payout.toLocaleString(undefined,{maximumFractionDigits:0})}</b></div>
      </div>
      ${!_me?`<button class="sb-place" onclick="openSignIn()"><i class="fa fa-right-to-bracket"></i>Sign in to bet</button>`
        :`<button class="sb-place" onclick="sbPlaceBet()" ${_betBusy||stake<=0||stake>bal?'disabled':''}>
            ${_betBusy?'<i class="fa fa-circle-notch fa-spin"></i>Placing…'
              :`<i class="fa fa-check"></i>Place bet · ${bucksFmt(stake)}`}</button>`}
      ${_betErr?`<div class="sb-slip-err">${
        _betErr==='funds'?`That is more than your ${bucksFmt(bal)} balance.`
        :_betErr==='stake'?'Enter a stake first.'
        :_betErr==='rules'?'The bets collection is not writable yet — Firestore rules need publishing.'
        :'Could not place that bet. Try again.'}</div>`:''}`
    :`<div class="sb-slip-empty">Tap any price to add it here.<br/>Multiple picks become a parlay.</div>`}
    <div class="sb-slip-note">Play money. Every team gets ${bucksFmt(BUCKS_WEEKLY)} GFL Bucks a week, Tuesday to Tuesday — unspent GFL Bucks do not carry over.</div>`;
}
function sbPick(mk,mkLabel,pick,pickLabel,odds){
  const k=mk+'|'+pick;
  const i=_slip.findIndex(x=>x.k===k);
  if(i>=0) _slip.splice(i,1);
  else{
    const j=_slip.findIndex(x=>x.mk===mk&&x.pick.split(':')[0]===String(pick).split(':')[0]);
    if(j>=0) _slip.splice(j,1);                        // one side per team per market
    _slip.push({k,mk,mkLabel,pick:String(pick),pickLabel,odds});
  }
  sbSyncButtons(); sbRenderSlip();
}
function sbDrop(k){ _slip=_slip.filter(x=>x.k!==k); sbSyncButtons(); sbRenderSlip(); }
function sbClear(){ _slip=[]; sbSyncButtons(); sbRenderSlip(); }
function sbStake(v){ _sbStake=v; sbRenderSlip(); }
function sbSyncButtons(){
  document.querySelectorAll('#page-book .sb-odds[data-k]').forEach(b=>{
    b.classList.toggle('on',_slip.some(x=>x.k===b.dataset.k));
  });
  const n=document.getElementById('sb-dock-n'); if(n) n.textContent=_slip.length;
  const d=document.getElementById('sb-dock'); if(d) d.classList.toggle('has',_slip.length>0);
}
function sbPortal(){
  let el=document.getElementById('sb-portal');
  if(!el){
    el=document.createElement('div'); el.id='sb-portal';
    el.innerHTML=`<div class="sb-dock" id="sb-dock" onclick="sbToggleSlip()">
        <i class="fa fa-receipt"></i><span class="sb-dock-t">Bet slip</span>
        <span class="sb-dock-n" id="sb-dock-n">0</span>
        <i class="fa fa-chevron-up sb-dock-c" id="sb-dock-c"></i></div>
      <div class="sb-sheet" id="sb-sheet"><div class="sb-slip sb-slip-target" id="sb-slip-m"></div></div>`;
    document.body.appendChild(el);
  }
  return el;
}
function sbRenderSlip(){
  sbPortal();
  document.querySelectorAll('.sb-slip-target').forEach(el=>{ el.innerHTML=sbSlipHTML(); });
  sbSyncButtons();
}
function sbShowPortal(on){
  const el=sbPortal();
  el.classList.toggle('on',!!on);
  if(!on){ _sbSlipOpen=false; el.classList.remove('open'); }
}
function sbSetView(v){ _sbView=v;
  document.querySelectorAll('#sb-tabs .tab-btn').forEach(b=>b.classList.toggle('active',b.dataset.view===v));
  renderBook();
}
function sbSetTeam(o){ _sbTeamSel=o; renderBook(); }
function sbToggleSlip(open){
  _sbSlipOpen=(open===undefined)?!_sbSlipOpen:!!open;
  const p=document.getElementById('sb-portal'); if(p) p.classList.toggle('open',_sbSlipOpen);
  const c=document.getElementById('sb-dock-c'); if(c) c.style.transform=_sbSlipOpen?'rotate(180deg)':'';
}
// ── IN-SEASON BOARD (weekly games + waiver market) ───────────────────────────
// Weekly matchup lines come from the schedule plus each team's power rating and
// scoring; the waiver market prices what managers actually paid that week.
function sbWeekData(){
  const book=sbBuild(); if(!book) return null;
  const season=getSeason(), meta=_seasonMeta[season];
  if(!meta) return null;
  const played=new Set(), all=new Set();
  (meta.schedule||[]).forEach(m=>{
    if(!m.home||!m.away) return;
    const wk=m.matchupPeriodId||0; if(!wk) return;
    all.add(wk);
    if((m.home.totalPoints||0)>0||(m.away.totalPoints||0)>0) played.add(wk);
  });
  const lastPlayed=played.size?Math.max(...played):0;
  const next=[...all].sort((a,b)=>a-b).find(w=>w>lastPlayed);
  const week=next||lastPlayed;                     // upcoming week if the season is live
  const live=!!next;
  const games=(meta.schedule||[]).filter(m=>(m.matchupPeriodId||0)===week&&m.home&&m.away).map(m=>{
    const rowOf=tid=>book.rows.find(r=>r.tid===tid);
    const a=rowOf(m.home.teamId), b=rowOf(m.away.teamId);
    const hp=m.home.totalPoints||0, ap=m.away.totalPoints||0;
    const done=hp>0||ap>0;
    if(!a||!b) return null;
    const pA=Math.min(0.80,Math.max(0.20,1/(1+Math.exp(-(a.rating-b.rating)*0.55))));
    return {week,a,b,done,hp,ap,
      mlA:amFromProb(Math.min(0.95,pA+0.025)), mlB:amFromProb(Math.min(0.95,(1-pA)+0.025)),
      spread:Math.max(0.5,Math.round(Math.abs(a.rating-b.rating)*3.0*2)/2),
      favA:a.rating>=b.rating,
      line:Math.round(a.ppg+b.ppg)+0.5,
      overP:amFromProb(0.5+0.024), underP:amFromProb(0.5+0.024),
      winA:done?hp>ap:null};
  }).filter(Boolean);
  // waiver market: the biggest FAAB spends of that week
  const buys=[];
  Object.entries(_cmBreakdown||{}).forEach(([tid,bd])=>{
    ((bd.detail&&bd.detail.waiverPickups)||[]).forEach(w=>{
      if(w.week!==week) return;
      const r=book.rows.find(x=>x.tid===Number(tid));
      buys.push({pid:w.pid,bid:w.bid,est:w.est,pts:w.pts,team:r?r.name:('Team '+tid),owner:r?r.owner:null});
    });
  });
  buys.sort((x,y)=>y.bid-x.bid);
  return {book,season,week,live,games,buys:buys.slice(0,8)};
}
function sbWeekHTML(){
  const d=sbWeekData();
  if(!d) return `<div class="tab-loading">No schedule data for this season.</div>`;
  const nm=r=>`<span class="sb-tm">${sbAvatar(r.owner,22)}<span class="sb-nm">${r.name}</span><span class="sb-ab">${sbTeamAb(r.owner,r.name)}</span></span>`;
  const games=d.games.map(g=>{
    const key='wk'+g.week+'-'+g.a.tid+'-'+g.b.tid;
    const res=g.done?`<span class="wk-final">Final ${g.hp.toFixed(1)}–${g.ap.toFixed(1)}</span>`:'';
    const mark=w=>g.done?(w?'<i class="fa fa-check wk-hit"></i>':'<i class="fa fa-xmark wk-miss"></i>'):'';
    /* One row per team with the three markets in fixed columns, the way a real
       book prints a board. The spread is only priced on the favourite, so the
       underdog shows its number greyed rather than leaving a hole. */
    const sp=g.spread.toFixed(1);
    const spreadCell=side=>{
      const isFav=(side==='a')===!!g.favA;
      // same two-line shape as a live price so the column stays aligned
      return isFav
        ? sbBtn(key+'-sp',`Week ${g.week} spread`,(g.favA?g.a.owner:g.b.owner)+':sp',`${(g.favA?g.a.name:g.b.name)} −${sp}`,-115,'sb-two','−'+sp)
        : `<span class="sb-odds wk-dog"><span class="sb-o-lbl">+${sp}</span><span class="sb-o-val">—</span></span>`;
    };
    return `<div class="wk-game" data-a="${g.a.owner}" data-b="${g.b.owner}">
      <div class="wk-r wk-rhead"><span></span><span>Win</span><span>Spread</span><span>Total</span></div>
      <div class="wk-r">
        <span class="wk-team">${nm(g.a)}${mark(g.winA===true)}</span>
        ${sbBtn(key+'-ml',`Week ${g.week} · ${g.a.name} vs ${g.b.name}`,g.a.owner+':ml',`${g.a.name} moneyline`,g.mlA,'sb-two')}
        ${spreadCell('a')}
        ${sbBtn(key+'-tot',`Week ${g.week} total`,'over',`Over ${g.line.toFixed(1)} — ${g.a.name} vs ${g.b.name}`,g.overP,'sb-two','O '+g.line.toFixed(1))}
      </div>
      <div class="wk-r">
        <span class="wk-team">${nm(g.b)}${mark(g.winA===false)}</span>
        ${sbBtn(key+'-ml',`Week ${g.week} · ${g.a.name} vs ${g.b.name}`,g.b.owner+':ml',`${g.b.name} moneyline`,g.mlB,'sb-two')}
        ${spreadCell('b')}
        ${sbBtn(key+'-tot',`Week ${g.week} total`,'under',`Under ${g.line.toFixed(1)} — ${g.a.name} vs ${g.b.name}`,g.underP,'sb-two','U '+g.line.toFixed(1))}
      </div>
      ${res}
    </div>`;}).join('');
  const waiver=d.buys.length?d.buys.map((b,i)=>{
    const line=Math.max(1,Math.round(b.bid))+0.5;
    const key='fa'+b.pid+'-'+d.week;
    return `<div class="sb-row sb-row2">
      <span class="sb-tm">${playerImg(b.pid,22,pName(b.pid))}<span class="wk-pl">${pName(b.pid)}</span><span class="wk-pt">${b.team}</span></span>
      ${sbBtn(key,`Week ${d.week} FAAB · ${pName(b.pid)}`,'o',`${pName(b.pid)} — Over $${line.toFixed(1)} FAAB`,-110,'sb-two','O '+line.toFixed(1))}
      ${sbBtn(key,`Week ${d.week} FAAB · ${pName(b.pid)}`,'u',`${pName(b.pid)} — Under $${line.toFixed(1)} FAAB`,-110,'sb-two','U '+line.toFixed(1))}
    </div>`;}).join(''):`<div class="sb-msub" style="padding:12px 14px">No waiver activity recorded for week ${d.week}.</div>`;
  return `<div class="sb-market">
      <div class="sb-mhead"><i class="fa fa-calendar-week"></i><span class="sb-mt">Week ${d.week} Matchups</span>
        <span class="badge-info">${d.live?'open':'settled'}</span></div>
      <div class="sb-msub">${d.live
        ? `Lines for the upcoming week — moneyline, spread and combined total.`
        : `The ${d.season} season is complete, so week ${d.week}'s board is shown settled against what actually happened.`}</div>
      <div class="wk-list">${games||'<div class="sb-msub" style="padding:12px 14px">No games found for this week.</div>'}</div>
    </div>
    <div class="sb-market">
      <div class="sb-mhead"><i class="fa fa-hand-holding-dollar"></i><span class="sb-mt">Waiver Wire</span>
        <span class="badge-info">FAAB over / under</span></div>
      <div class="sb-msub">What managers paid for week ${d.week} pickups. Bids are estimated for seasons ESPN has purged.</div>
      <div class="sb-rows">
        <div class="sb-row sb-row2 sb-head"><span>Player</span><span class="sb-oh">Over</span><span class="sb-oh">Under</span></div>
        ${waiver}
      </div>
    </div>`;
}

function renderBook(){
  const el=document.getElementById('book-body'); if(!el) return;
  const book=sbBuild();
  if(!book){ el.innerHTML=`<div class="tab-loading"><i class="fa fa-circle-notch"></i>Setting the lines…</div>`; return; }
  const tabs=SB_GROUPS.map(g=>`<button class="tab-btn ${_sbView===g.k?'active':''}" data-view="${g.k}" onclick="sbSetView('${g.k}')"><i class="fa ${g.icon}"></i>${g.label}</button>`).join('');
  const board=_sbView==='team'?sbTeamViewHTML(book)
    :_sbView==='week'?sbWeekHTML()
    :_sbView==='mine'?myBetsHTML()
    :(book.groups[_sbView]||[]).map(sbMarketHTML).join('');
  /* "Lines set" rides beside the page title; My Bets takes the strip the
     futures bar used to hold, so the ledger is one tap from anywhere. */
  const aside=document.getElementById('page-h1-aside');
  if(aside) aside.innerHTML=`<span class="sb-live"><i class="fa fa-circle"></i>Lines set</span>`;
  el.innerHTML=`
    <button class="sb-mine-btn ${_sbView==='mine'?'on':''}" onclick="sbSetView('mine')">
      <i class="fa fa-wallet"></i><span class="sb-mine-t">My Bets</span>
      ${_me?`<span class="sb-mine-bal">${bucksFmt(bucksBalance())}</span>`:'<span class="sb-mine-bal">Sign in</span>'}
    </button>
    <div class="standings-filters sb-tabs" id="sb-tabs" style="padding-bottom:14px">${tabs}</div>
    <div class="sb-layout">
      <div class="sb-board">${board}</div>
      <div class="sb-slip-wrap" id="sb-slip-wrap">
        <div class="sb-slip sb-slip-target" id="sb-slip">${sbSlipHTML()}</div>
      </div>
    </div>`;
  sbShowPortal(true);
  sbRenderSlip();
}

// ── VIDEO ──────────────────────────────────────────────────────────────────────
/* A YouTube embed paints its own poster — title bar, channel name, "Watch on
   YouTube", a big play button — and none of it scales down. Beside the
   punishment card the player is about 170px wide on a phone, where that chrome
   swamps the frame. So the resting state is our own poster: the thumbnail plus
   one play glyph, styled to fit whatever width it gets. The real iframe is
   only built on tap, which also means the homepage no longer loads a YouTube
   player nobody has asked to watch. */
function videoFacadeHTML(videoId){
  const v=_videos.find(x=>x.videoId===videoId)||{};
  const thumb=v.thumb||`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
  return `<button class="vid-facade" data-vid="${videoId}" onclick="playVideo('${videoId}')"
      aria-label="Play ${(v.title||'video').replace(/"/g,'&quot;')}">
    <img src="${thumb}" alt="" loading="lazy"/>
    <span class="vid-play"><i class="fa fa-play"></i></span>
  </button>`;
}
function playVideo(videoId){
  const box=document.getElementById('vfeat'); if(!box) return;
  box.innerHTML=`<iframe id="vi" src="https://www.youtube.com/embed/${videoId}?autoplay=1"
    allow="accelerometer;autoplay;encrypted-media;gyroscope;picture-in-picture" allowfullscreen></iframe>`;
}
function selectVideo(videoId){
  _activeVideoId=videoId;
  const box=document.getElementById('vfeat');
  const title=document.getElementById('vt');
  const v=_videos.find(v=>v.videoId===videoId);
  // If a video is already playing, switching swaps the player straight over;
  // otherwise stay on the poster so picking a thumb does not start playback.
  if(box) box.innerHTML=document.getElementById('vi')
    ? `<iframe id="vi" src="https://www.youtube.com/embed/${videoId}?autoplay=1" allow="accelerometer;autoplay;encrypted-media;gyroscope;picture-in-picture" allowfullscreen></iframe>`
    : videoFacadeHTML(videoId);
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
    const firstVid=_videos[0];
    _activeVideoId=firstVid?.videoId||null;

    {const _lu=document.getElementById('last-updated'); if(_lu) _lu.textContent='Updated '+new Date().toLocaleTimeString();}
    setStatus('live','Live');

    const franchiseOpts=sel=>_franchises.map(f=>`<option value="${f.owner}" ${f.owner===sel?'selected':''}>${f.name}</option>`).join('');

    app.innerHTML=`
      <!-- HOME -->
      <div class="tab-page" id="page-home">
        <!-- Row 1: punishment + Matchup of the Week (left), video (right) -->
        <div class="home-top">
          <div class="home-left-col">
            <div class="sec wm mod-punish" data-wm="&#xf0e3;">
              <div class="home-box punish-box">${homePunishHTML()}</div>
            </div>
            <div class="sec wm" data-wm="&#xf091;">
              <div class="sec-head"><i class="fa fa-fire"></i>Matchup of the Week</div>
              <div id="motw"></div>
            </div>
          </div>
          <div class="home-vid-col">
            <div class="sec">
              <div class="home-box">${firstVid
                ?`<div class="vid-scroll" style="--nv:${newVideoColor()}">
                    <div class="vid-wrap"><span class="vid-new">New video</span>
                      <div class="video-featured" id="vfeat">${videoFacadeHTML(firstVid.videoId)}</div></div>
                    ${_videos.slice(1,3).map(v=>`<button class="video-thumb ${v.videoId===_activeVideoId?'active':''}" data-vid="${v.videoId}" onclick="selectVideo('${v.videoId}')"><img src="${v.thumb||`https://i.ytimg.com/vi/${v.videoId}/mqdefault.jpg`}" alt="" loading="lazy"/><div class="video-thumb-title">${v.title}</div></button>`).join('')}
                    <a class="vid-ch" href="https://www.youtube.com/channel/${YT_CHANNEL_ID}" target="_blank" rel="noopener">
                      <i class="fa-brands fa-youtube"></i><span>Visit the channel</span><i class="fa fa-arrow-right vid-ch-a"></i></a>
                  </div>
                  <div class="vid-rail" style="--nv:${newVideoColor()}"><div class="vid-rail-thumb" id="vid-rail-thumb"></div></div>`
                :`<div style="padding:60px 24px;text-align:center;color:var(--text3)">Could not load videos</div>`
              }</div>
            </div>
          </div>
        </div>
        <!-- Coaching Metric moved to Advanced Stats, where it now heads its own
             view alongside the three ROI breakdowns. -->
        <!-- Matchup Headlines: hidden for now. Kept out of a grid wrapper —
             an empty .home-bottom still contributed its own 40px margin, which
             is what pushed the message card away from the sportsbook. -->
        <div class="sec wm" data-wm="&#xf1ea;" style="display:none">
          <div class="sec-head"><i class="fa fa-newspaper"></i>Matchup Headlines</div>
          <div id="home-headlines"></div>
        </div>
        <!-- Live Around the League removed: This Week covers the same ground.
             The poll itself still runs — it feeds the pinned matchup bar and
             This Week — it just no longer renders a board here. -->
      </div>
      <!-- (Legacy Report now lives on the team profile, under the hero) -->

      <!-- STANDINGS & STATS -->
      <div class="tab-page" id="page-standings">
        <div class="sec wm" data-wm="&#xe561;">
          <div class="standings-filters st-two" id="stats-subtabs" style="padding-bottom:16px">
            <button class="tab-btn ${_statsView==='standings'?'active':''}" data-view="standings" onclick="setStatsView('standings')"><i class="fa fa-ranking-star"></i>${season} Standings</button>
            <button class="tab-btn ${_statsView==='cm'?'active':''}" data-view="cm" onclick="setStatsView('cm')"><i class="fa fa-brain"></i>Coaching Metric</button>
          </div>
          <div id="stats-standings" ${_statsView==='standings'?'':'style="display:none"'}>
            <div style="font-size:12px;color:var(--text3);margin:0 2px 10px">Click any column header to sort.</div>
            <div class="tscroll"><table class="min640" data-mhide="Moves,Trades,AT PF,AT PA,PF/Yr,PA/Yr"><thead id="standings-thead"></thead><tbody id="standings-tbody"></tbody></table></div>
          </div>
          <!-- the jump bar lives here, under the filters, not under the title -->
          <nav class="sec-nav sec-nav-local" aria-label="Sections on this page" hidden></nav>
          <!-- one view, four sections: the jump chips are built from these heads -->
          <div id="stats-cm" ${_statsView==='cm'?'':'style="display:none"'}>
            <div class="sec">
              <div class="sec-head"><i class="fa fa-brain"></i>Coaching Metric<span class="badge-info">${season} · tap a team for the breakdown</span></div>
              <div id="stats-cm-list" class="home-cm"></div>
            </div>
            <div class="sec">
              <div class="sec-head"><i class="fa fa-right-left"></i>Trade ROI</div>
              <div id="stats-c2"></div>
            </div>
            <div class="sec">
              <div class="sec-head"><i class="fa fa-magnifying-glass-dollar"></i>Waiver ROI</div>
              <div id="stats-c3"></div>
            </div>
            <div class="sec">
              <div class="sec-head"><i class="fa fa-brain"></i>Lineup IQ</div>
              <div id="stats-liq"></div>
            </div>
          </div>
        </div>
      </div>

      <!-- TRADES -->
      <div class="tab-page" id="page-trades">
        <div class="trades-layout">
          <div class="trades-filters wm" data-wm="&#xf362;">
            <div class="sec-head"><i class="fa fa-right-left"></i>Trade Report</div>
            <div class="trade-count" id="trade-count"></div>
            <div class="standings-filters" id="trade-scope">
              <span style="font-size:12px;color:var(--text3);margin-right:4px">Scope:</span>
              <button id="trade-scope-season" class="filter-btn ${_tradeScope==='season'?'active':''}" onclick="setTradeScope('season',this)">This Season</button>
              <button class="filter-btn ${_tradeScope==='alltime'?'active':''}" onclick="setTradeScope('alltime',this)">All-Time</button>
            </div>
            <div class="standings-filters" id="trade-sort">
              <span style="font-size:12px;color:var(--text3);margin-right:4px">Sort:</span>
              <button class="filter-btn ${_tradeSort==='week'?'active':''}" onclick="setTradeSort('week',this)">By<br>Week</button>
              <button class="filter-btn ${_tradeSort==='unbalanced'?'active':''}" onclick="setTradeSort('unbalanced',this)">Most<br>Unbalanced</button>
              <button class="filter-btn ${_tradeSort==='balanced'?'active':''}" onclick="setTradeSort('balanced',this)">Most<br>Balanced</button>
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

      <!-- SPORTSBOOK -->
      <div class="tab-page" id="page-book">
        <div class="sec wm" data-wm="&#xf51e;">
          <div id="book-body"></div>
        </div>
      </div>

      <!-- PLAYER TENURE -->
      <!-- THIS WEEK — everything on the clock, gathered in one place -->
      <div class="tab-page" id="page-week">
        <div class="sec wm" data-wm="&#xf0e7;">
          <div class="sec-head"><i class="fa fa-bolt"></i>Scoreboard</div>
          <div id="week-body"></div>
        </div>
        <div class="sec wm" data-wm="&#xf091;">
          <div class="sec-head"><i class="fa fa-fire"></i>Top Performers</div>
          <div id="week-top"></div>
        </div>
        <div class="sec wm mod-punish" data-wm="&#xf0e3;">
          <div class="sec-head"><i class="fa fa-gavel"></i>Punishment</div>
          <div class="home-box punish-box" id="week-punish"></div>
        </div>
        <div class="sec wm" data-wm="&#xf1da;">
          <div class="sec-head"><i class="fa fa-arrow-right-arrow-left"></i>Moves This Week</div>
          <div id="week-moves"></div>
        </div>
      </div>

      <!-- ROSTER -->
      <div class="tab-page" id="page-roster">
        <!-- no heading: the page title already says Rosters -->
        <div class="sec wm" data-wm="&#xf500;">
          <div id="roster-body"></div>
        </div>
      </div>

      <div class="tab-page" id="page-tenure">
        <nav class="sec-nav sec-nav-local sx-filters" aria-label="Sections on this page" hidden></nav>
        <!-- below the filters, and hidden on Hardware, which is league-wide -->
        <div class="picker-bar tn-picker" id="tenure-picker">
          <label for="tenure-team-select">Team:</label>
          <select id="tenure-team-select" onchange="renderTenureTable();renderTenureEnemies()">${franchiseOpts(_ownerMap[_teams[0]?.id])}</select>
        </div>
        <div id="tenure-views">
          <div class="sec wm" data-wm="&#xf4fd;">
            <div class="sec-head"><i class="fa fa-user-clock"></i>Player Tenure</div>
            <div class="picker-bar">
              <input type="text" id="tenure-search" placeholder="Search player…" oninput="renderTenureTable()"/>
            </div>
            <div id="tenure-body"></div>
          </div>
          <div class="sec wm" data-wm="&#xf091;">
            <div class="sec-head"><i class="fa fa-trophy"></i>Playoff Hardware</div>
            <div id="tenure-hw"></div>
          </div>
          <div class="sec wm" data-wm="&#xf714;">
            <div class="sec-head"><i class="fa fa-skull-crossbones"></i>Biggest Enemies</div>
            <div id="tenure-enemies"></div>
          </div>
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

      <!-- UPCOMING SCHEDULE -->
      <div class="tab-page" id="page-schedule">
        <div class="sec">
          <div class="sec-head"><i class="fa fa-calendar-days"></i>Upcoming Schedule<span class="badge-info">win odds from the B&amp;C power ratings</span></div>
          <div class="picker-bar" style="padding-bottom:16px">
            <label for="sched-team-select" style="font-size:13px;color:var(--text3)">Team:</label>
            <select id="sched-team-select" onchange="_schedTeam=this.value;renderSchedule()">${_teams.map(t=>`<option value="${t.id}">${t.name}</option>`).join('')}</select>
          </div>
          <div id="sched-body"></div>
        </div>
      </div>

      <!-- BAD BEAT O'METER -->
      <!-- MY PROFILE (reached from the header button, not the tab bar) -->
      <div class="tab-page" id="page-profile">
        <div class="sec wm" data-wm="&#xf007;">
          <div id="profile-page-body"></div>
        </div>
      </div>

      <div class="tab-page" id="page-badbeat">
        <div class="sec wm" data-wm="&#xf7a9;">
          <div id="badbeat-body"></div>
        </div>
      </div>

      <!-- GABE'S GREATNESS -->
      <!-- Gabe's Greatness moved into League History as a collapsed section -->
    `;

    refreshSeasonOptions();
    renderStandingsTable();
    renderMatchupOfWeek();
    renderPunishment();
    /* the board is on the homepage, which is where the app opens — switchTab
       only fires when you navigate, so the first load has to start it too */
    if(_activeTab==='home') liveStart();
    if(_profileTeam==null) _profileTeam=String(_teams[0]?.id||'');
    renderHomeHeadlines();
    renderHistoryTable();
    renderLeagueHistory();
    renderMarathon();
    renderTradesTab();
    renderSchedule();
    applyMe();
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

if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',initMobileTables); else initMobileTables();
/* each init is isolated: they shared a statement, so a throw in the first
   silently prevented the second from ever running */
function bootUI(){ try{initSignIn();}catch(e){} }
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',bootUI); else bootUI();
/* pre-render the nav menu so the first tap has nothing to build */
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>{buildTabDD();positionTabDD();});
else { buildTabDD(); positionTabDD(); }

/* ── AUTO-UPDATE ────────────────────────────────────────────────────────────
   Installed home-screen copies (Share → Add to Home Screen) run as a standalone
   web app that iOS freezes and thaws for days without ever re-loading the page,
   so a plain service-worker registration alone never notices a new build.
   This watches the deployed build itself: HEAD /index.html + /app.js with
   cache:'no-store' (HEAD skips the service worker, no-store skips the HTTP
   cache) and compares their ETags with the ones the running copy booted from.
   A change means a new deploy is live → refresh the SW, then reload once.
   No version constant to bump: any push to main changes an ETag. */
const UPD_WATCH=['/index.html','/app.js'];
const UPD_POLL=5*60*1000;      // background poll while the app is open
const UPD_IDLE=30*1000;        // if found mid-session, wait for a quiet moment
const UPD_FLOOR=45*1000;       // never reload twice inside this window
let _bootFp=null, _updPending=false, _idleTimer=null;

async function updFingerprint(){
  const parts=[];
  for(const f of UPD_WATCH){
    try{
      const r=await fetch(f+'?fp='+Date.now(),{method:'HEAD',cache:'no-store'});
      if(!r.ok) return null;
      parts.push(r.headers.get('etag')||r.headers.get('last-modified')||'');
    }catch(e){ return null; }   // offline: try again next time
  }
  const fp=parts.join('|');
  return /[^|]/.test(fp)?fp:null;
}
function updReload(){
  let last=0; try{ last=+(sessionStorage.getItem('gfl-upd-reload')||0); }catch(e){}
  if(Date.now()-last<UPD_FLOOR) return;                 // guard against loops
  try{ sessionStorage.setItem('gfl-upd-reload',String(Date.now())); }catch(e){}
  location.reload();
}
async function updApply(){
  try{
    const reg=await navigator.serviceWorker.getRegistration();
    if(reg){ await reg.update(); }                       // pull the new worker first
  }catch(e){}
  updReload();
}
function updArmIdle(){
  clearTimeout(_idleTimer);
  _idleTimer=setTimeout(()=>{ if(_updPending) updApply(); },UPD_IDLE);
}
async function updCheck(reason){
  if(document.visibilityState!=='visible') return;
  if(_updPending && reason==='resume') return updApply();
  const fp=await updFingerprint();
  if(!fp) return;
  if(!_bootFp){ _bootFp=fp; return; }
  if(fp===_bootFp) return;
  if(reason==='resume') return updApply();              // safest moment to reload
  _updPending=true; updArmIdle();                       // mid-session: wait for a pause
}
function initAutoUpdate(){
  updFingerprint().then(fp=>{ if(fp&&!_bootFp) _bootFp=fp; });
  document.addEventListener('visibilitychange',()=>{ if(document.visibilityState==='visible') updCheck('resume'); });
  window.addEventListener('pageshow',()=>updCheck('resume'));
  window.addEventListener('focus',()=>updCheck('resume'));
  window.addEventListener('online',()=>updCheck('resume'));
  setInterval(()=>updCheck('poll'),UPD_POLL);
  ['pointerdown','keydown','scroll','touchstart'].forEach(ev=>
    window.addEventListener(ev,()=>{ if(_updPending) updArmIdle(); },{passive:true}));
}
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',initAutoUpdate); else initAutoUpdate();

window.addEventListener('resize',()=>{ clearTimeout(window._ddRsz); window._ddRsz=setTimeout(positionTabDD,150); });
window.addEventListener('orientationchange',()=>setTimeout(positionTabDD,300));
