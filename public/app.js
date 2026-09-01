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
let _cmBreakdownSeason=null;             // the season _cmBreakdown was computed for
let _tradeScope='season';               // 'season' | 'alltime'
/* TWO SIDES OF A TRADE, EITHER OF THEM OPTIONAL. Both empty is every trade;
   one set is every trade that team was in; both set is the trades those two
   made with each other, which is the question a trade tab is usually asked. */
let _tradeTeamFilter='';                 // owner id, one side (optional)
let _tradeTeamFilter2='';                // owner id, the other side (optional)
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
/* The nav menu is built in JS and reads its icon colours from here, not from
   the --tc custom properties in the stylesheet. Both have to be changed
   together — a palette change made only in CSS leaves the nav on the old set,
   which is exactly what happened last time. Keep this in step with the
   .tab-btn[data-tab=…]{--tc} block in index.html. */
const TAB_COLORS={home:'#CBE4FF',week:'#fb9167',roster:'#43C9E8',leaders:'#43C9E8',teams:'#ff5f5f',book:'#3fd07a',legacy:'#f09a4a',history:'#6cb7ff',standings:'#6C6AE8',badbeat:'#e78dd4',draft:'#2F5FE0',trades:'#E8437E',tenure:'#2DD4BF',punishment:'#E84146',cm:'#E0B67B'};
const TAB_LABELS={home:'Home',week:'Schedule',roster:'Rosters',leaders:'Leaderboards',book:'B&C Sportsbook',standings:'Standings',trades:'Trades',draft:'Draft Report',history:'Head to Head',tenure:'Player Data',teams:'Team Profiles',legacy:'League History',punishment:'Punishments',badbeat:"Bad Beat O'Meter",messages:'Messages',profile:'My Locker Room',cm:'Coaching Metric'};
function goHome(){ try{toggleTabDD(false);}catch(e){} switchTab('home'); window.scrollTo(0,0); }
function getSeason(){return document.getElementById('season-select').value;}
/* The year in the nav only means anything on the tabs that show one season at a
   time. Everywhere else it is hidden — the homepage, Forecast, the Sportsbook,
   Punishments, Rosters, Previous Matchups, Player Data and League History are
   either about right now or about every season at once, so a year control there
   is either meaningless or actively misleading.
   Hiding it is not enough on its own: pick 2022 on Team Profiles, walk to the
   homepage, and the page would still be built from 2022 data with no visible
   control to explain why. So stepping onto one of those tabs also snaps the
   year back to the newest season and reloads, but only when it had actually
   been moved — the common case costs nothing. */
/* badbeat and cm were left out, so the year control was hidden on both — but
   every panel on them already reads getSeason(): badBeatData(season), the three
   Coaching Metric components and Lineup IQ. The pages were season-scoped with no
   way to say which season. */
const SEASON_TABS=new Set(['week','teams','standings','draft','trades','badbeat','cm']);
/* THE DEFAULT SEASON IS THE ONE THE LEAGUE IS IN.

   This used to fall back to the newest season with football in it, on the
   reasoning that ESPN lists a year as soon as it publishes a schedule, so the
   newest on file can be a year with no games. The effect in August was that the
   whole site opened on last season: newestSeason() answered 2025, the homepage
   snapped the year control back to it on every visit, and Standings, Team
   Profiles, the Draft Report and Trades all read 2025 until week 1 of 2026 was
   scored.

   The current season is the default now, played or not. By the time a season is
   under way in any sense that matters it already carries a completed draft and
   twelve rosters — 2026 had 168 picks in before a snap was played — and 0-0
   records are the truth about a season that has not started rather than a bug.

   The trade-off runs the other way instead: between March, when ESPN opens the
   next season, and that season's draft, the newest year on file really is empty.
   The year control is right there to read last season with. */
function newestSeason(){
  const have=ALL_SEASONS.filter(y=>_seasonMeta[y]).sort((a,b)=>Number(b)-Number(a));
  const real=have.find(y=>((_seasonMeta[y].schedule)||[]).length);
  return real||have[0]||ALL_SEASONS[ALL_SEASONS.length-1];
}
function syncSeasonPicker(tab){
  const sel=document.getElementById('season-select'); if(!sel) return;
  const scoped=SEASON_TABS.has(tab);
  sel.style.display=scoped?'':'none';
  if(scoped) return;
  const newest=newestSeason();
  if(newest&&sel.value&&sel.value!==String(newest)){
    sel.value=String(newest);
    try{ loadDashboard(); }catch(e){}
  }
}
function setStatus(s,l){
  document.getElementById('dot').className='dot'+(s==='live'?' live':s==='err'?' err':'');
  document.getElementById('dot-label').textContent=l;
}
async function espnFetch(view){
  const r=await fetch(`${BASE}?view=${encodeURIComponent(view)}&seasonId=${getSeason()}`);
  if(!r.ok) throw new Error(`ESPN API ${r.status}`);
  return r.json();
}
/* THE LIST PAINTS FROM CACHE AND THEN CORRECTS ITSELF.

   It used to paint from cache and stop there: the cached list won whatever its
   age, and the background refresh only wrote localStorage for next time. So a
   video that went up an hour ago was already in the API and still not on the
   screen — you had to open the app, close it, and open it again. The carousel
   is rebuilt in place when the refresh comes back with a different top video,
   which is the whole of the fix; the instant paint is worth keeping.

   A cache older than the window is not trusted at all — at that age waiting for
   the network beats painting something a day out of date. */
const YT_CACHE_MS=30*60*1000;
async function ytFetch(){
  const c=cacheGet('youtube');
  const fresh=c&&c.t&&(Date.now()-c.t)<YT_CACHE_MS;
  const refresh=fetch(`${BASE}?type=youtube`).then(r=>r.ok?r.json():null)
    .then(j=>{ if(j&&j.videos&&j.videos.length){ cacheSet('youtube',j); ytApply(j.videos); } return j; })
    .catch(()=>null);
  if(fresh&&c.d&&c.d.videos&&c.d.videos.length) return c.d;   // instant from cache
  return (await refresh)||(c&&c.d)||{videos:[]};
}
/* Swap the list under a carousel that is already on screen. Only when the top
   video actually changed — rebuilding it on every refresh would restart the
   ring and drop whatever slide someone was looking at. */
function ytApply(list){
  if(!list||!list.length) return;
  const top=(_videos[0]||{}).videoId;
  if(top===list[0].videoId) return;
  _videos=list;
  /* There is no standalone renderer for the rail — it is built inside the
     homepage template — so the carousel's own box is rewritten and re-wired.
     wireVidRail guards on a data flag the fresh markup does not carry, so it
     wires the new ring rather than refusing. */
  const sc=document.querySelector('.vid-scroll');
  const box=sc&&sc.closest('.home-box');
  if(!box) return;                 // not on the homepage; the next render takes it
  box.innerHTML=vidCarouselHTML();
  try{ wireVidRail(); }catch(e){}
}
/* ── THE ARCHIVE LEADS; ESPN ONLY ADDS WHAT IS NEWER ─────────────────────────
   This used to ask ESPN first and fall back to the repo only when ESPN gave
   back nothing, which is backwards twice over.

   It is wrong on cost: the archived file is a static asset off the CDN, and the
   ESPN call goes through the proxy to a slow upstream on every single load.

   It is wrong on correctness, which matters more. The archive is the only place
   losing waiver bids will ever exist. ESPN serves the detailed log while a
   season is ACTIVE and drops it afterwards — that is why 2022-2025 waiver
   history is gone for good — and even during the season it prunes failed claims
   well before the season ends. A losing bid is exactly what the next-highest
   figure is made of, so once the archiver has captured one it must outrank
   anything ESPN says later, including ESPN saying nothing.

   So: read the file, then merge ESPN over the top keyed by transaction id, and
   let the archived row win wherever both have one. ESPN's job here is only to
   carry the days since the last Wednesday and Sunday run. */
const txKeyOf=t=>String((t&&t.id)||`${t&&t.type}|${t&&t.teamId}|${t&&t.scoringPeriodId}|`
  +((t&&t.items)||[]).map(i=>`${i.playerId}:${i.type}`).join(','));
async function txFetch(){
  let archived=[], savedAt='';
  try{
    const ar=await fetch(`/data/transactions-${getSeason()}.json`);
    if(ar.ok){ const ad=await ar.json(); archived=ad.transactions||[]; savedAt=(ad.savedAt||'').slice(0,10); }
  }catch{}
  let live=[], diag=[];
  try{
    const r=await fetch(`${BASE}?type=transactions&seasonId=${getSeason()}`);
    if(r.ok){ const d=await r.json(); live=d.transactions||[]; diag=d._diag||[]; }
  }catch{}
  if(!archived.length&&!live.length) return {transactions:[],_source:'error',_diag:diag};
  /* live first so an archived row of the same id overwrites it */
  const byKey=new Map();
  live.forEach(t=>byKey.set(txKeyOf(t),t));
  /* An archived TRADE_ACCEPT with no items is not movement, it is the shell
     ESPN files while the players hang off a proposal record it will not return.
     Keeping it would be harmless today — the composite key differs from the
     live rows — but it is one id away from masking a real trade, and C2 is not
     a number to leave that near an edge. */
  archived.filter(t=>String(t.type||'').toUpperCase()!=='TRADE_ACCEPT'||(t.items||[]).length)
    .forEach(t=>byKey.set(txKeyOf(t),t));
  const merged=[...byKey.values()];
  const src=archived.length&&live.length ? `git archive (${savedAt}) + live`
    : archived.length ? `git archive (${savedAt})` : 'live';
  return {transactions:merged,_source:src,_count:merged.length,_diag:diag,
    _archived:archived.length,_live:live.length};
}
/* A finished season's weekly scores can never change again, so they are
   archived in the repo as one file per season instead of being pulled a week
   at a time. This was seventeen API calls on every single page load, each one
   several seconds — comfortably the most expensive thing the app did.
   The promise is cached rather than the value, so the seventeen callers that
   fire together share one fetch instead of racing seventeen. A season with no
   archive — the one currently being played — falls through to ESPN as before. */
let _weeklyStatic={};
function weeklyArchive(season){
  if(!_weeklyStatic[season]) _weeklyStatic[season]=(async()=>{
    try{
      const r=await fetch(`/data/weekly-${season}.json`);
      if(r.ok){ const j=await r.json(); if(j&&j.weeks) return j.weeks; }
    }catch(e){}
    return null;
  })();
  return _weeklyStatic[season];
}
async function fetchPlayerWeekScores(week){
  const season=getSeason();
  const arc=await weeklyArchive(season);
  if(arc&&arc[week]) return arc[week];
  try{
    const r=await fetch(`${BASE}?type=playerscores&seasonId=${season}&scoringPeriodId=${week}`);
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
  /* There is no light mode — the theme is pinned to dark in two places and
     nothing sets anything else — so this only ever took the dark branch. */
  const clampL=l=>Math.max(l,62);      // % — bright enough to read on the dark ground
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
/* ── THE SCHEDULE THE LEAGUE ACTUALLY DREW ───────────────────────────────────
   ESPN generated its own order and the league drew a different one. Where
   config.leagueSchedule has an opinion, it wins — the pairings for that week are
   rewritten onto ESPN's own matchup objects, so everything downstream (records,
   odds, the forecast, the bad beat meter) reads the drawn schedule without any
   of it needing to know this happened.

   THREE THINGS IT REFUSES TO DO.

   It will not touch a week with a point in it. Once a week has been played the
   result is the truth and a config file does not get to rewrite who played whom
   — which also means a mid-season edit can only ever affect the weeks ahead.

   It will not apply a week it cannot verify: six games, twelve distinct teams,
   every team that ESPN has. A typo in the config leaves that week as ESPN had
   it rather than half-rewriting the league into an impossible fixture list.

   And it will not invent games. If ESPN has fewer fixtures in a week than the
   drawn order names, only the ones that exist are rewritten. */
function applyDrawnSchedule(season,schedule){
  try{
    const cfg=(_CFG.leagueSchedule)||{};
    if(!cfg.drawn||String(cfg.season||'')!==String(season)) return schedule;
    const byWeek={};
    schedule.forEach(m=>{ if(m&&m.home&&m.away)
      (byWeek[Number(m.matchupPeriodId)||0]||(byWeek[Number(m.matchupPeriodId)||0]=[])).push(m); });
    const known=new Set();
    schedule.forEach(m=>{ if(m&&m.home&&m.away){ known.add(m.home.teamId); known.add(m.away.teamId); } });
    Object.keys(cfg.drawn).forEach(wk=>{
      const w=Number(wk), pairs=cfg.drawn[wk], games=byWeek[w];
      if(!w||!Array.isArray(pairs)||!games||!games.length) return;
      /* played already — ESPN's result stands */
      if(games.some(m=>(m.home.totalPoints||0)>0||(m.away.totalPoints||0)>0)) return;
      const flat=pairs.flat();
      if(pairs.length!==games.length||flat.length!==games.length*2) return;
      if(new Set(flat).size!==flat.length) return;
      if(!flat.every(id=>known.has(id))) return;
      pairs.forEach((p,i)=>{ games[i].home.teamId=p[0]; games[i].away.teamId=p[1]; });
    });
  }catch(e){}
  return schedule;
}
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
    /* How many of each slot a lineup starts. Needed to work out the best team a
       roster could actually field, which is what the odds are taken from. */
    const slots=d.settings?.rosterSettings?.lineupSlotCounts||null;
    return {season,schedule:applyDrawnSchedule(season,d.schedule||[]),
      owners,names,teams,divisions,playoffTeamCount,regEnd:regEndY,faabBudget,slots};
  }catch{return null;}
}
/* ── WHICH POSTSEASON GAMES COUNT ────────────────────────────────────────────
   Judged by bracket round, never by week number — 2022 ran a 15-week regular
   season, so its rounds are weeks 16-18 while every other year runs 15-17.

   Both sides of the postseason are three-round, six-team brackets with two
   byes. The playoff side advances by winning; the losers' bracket escapes by
   winning once, so there you continue by LOSING. Either way each round has two
   real games, then two, then one.

   A game counts when:
     · it is a real bracket game on either side, or
     · it is in the final round, where every game is a placement game.

   That leaves out the round-1 bye filler — the two teams sitting out are
   scheduled against each other, and both carry on regardless of the result —
   and the round-2 consolation games between teams that are already safe or
   already eliminated. It is decided per game, so it can never count for one
   team and not the other. */
let _pcCache={};
/* the losers' bracket, walked back from the game that decides the season loser.
   Mirrors buildBracket, except the team that continues is the one that lost. */
function buildLoserBracket(season){
  const meta=_seasonMeta[season]; if(!meta) return null;
  const T=meta.teams||{}, sched=meta.schedule||[];
  const ranked=Object.entries(T).map(([id,t])=>({id:Number(id),rank:Number(t.rank)||0}))
    .filter(x=>x.rank>0).sort((a,b)=>b.rank-a.rank);
  if(ranked.length<2) return null;
  const last=ranked[0].id, prev=ranked[1].id;
  const played=sched.filter(m=>m.home&&m.away&&((m.home.totalPoints||0)>0||(m.away.totalPoints||0)>0));
  if(!played.length) return null;
  const finalWeek=Math.max(...played.map(m=>m.matchupPeriodId||0));
  const gAt=w=>played.filter(m=>(m.matchupPeriodId||0)===w);
  const loserOf=m=>((m.home.totalPoints||0)>=(m.away.totalPoints||0))?m.away.teamId:m.home.teamId;
  const fin=gAt(finalWeek).find(m=>{const ids=[m.home.teamId,m.away.teamId];
    return ids.includes(last)&&ids.includes(prev);});
  if(!fin) return null;
  let participants=new Set([last,prev]);
  const rev=[{week:finalWeek,games:[fin]}];
  let w=finalWeek-1,guard=0;
  while(w>regEndOf(season)&&guard++<4){
    /* a real elimination game sends exactly one of its teams onward; when both
       are already through it is the bye filler, not a game */
    const games=gAt(w).filter(m=>participants.has(loserOf(m))
      && !(participants.has(m.home.teamId)&&participants.has(m.away.teamId)));
    if(!games.length) break;
    rev.push({week:w,games});
    participants=new Set(games.flatMap(m=>[m.home.teamId,m.away.teamId]));
    w--;
  }
  return {rounds:rev.reverse()};
}
function loserBracketOf(season){
  const k='LB:'+season;
  if(!(k in _pcCache)){ try{ _pcCache[k]=buildLoserBracket(season); }catch{ _pcCache[k]=null; } }
  return _pcCache[k];
}
/* every real bracket game that season, keyed week:home:away */
function postRealSet(season){
  const k='SET:'+season;
  if(_pcCache[k]) return _pcCache[k];
  const set=new Set();
  const br=bracketOf(season);
  if(br)(br.rounds||[]).forEach(r=>(r.games||[]).forEach(g=>set.add(r.week+':'+g.a.tid+':'+g.b.tid)));
  const lb=loserBracketOf(season);
  if(lb)(lb.rounds||[]).forEach(r=>r.games.forEach(m=>set.add(r.week+':'+m.home.teamId+':'+m.away.teamId)));
  return (_pcCache[k]=set);
}
function finalRoundWeek(season){
  const k='FW:'+season;
  if(_pcCache[k]!=null) return _pcCache[k];
  const meta=_seasonMeta[season];
  const played=((meta&&meta.schedule)||[]).filter(m=>m.home&&m.away
    &&((m.home.totalPoints||0)>0||(m.away.totalPoints||0)>0));
  return (_pcCache[k]=played.length?Math.max(...played.map(m=>m.matchupPeriodId||0)):0);
}
/* the one question everything else asks */
function postGameCounts(season,mu){
  const meta=_seasonMeta[season]; if(!meta||!mu||!mu.home||!mu.away) return true;
  const w=Number(mu.matchupPeriodId)||0, regEnd=meta.regEnd||14;
  if(!w||w<=regEnd) return true;                       // regular season
  if(w===finalRoundWeek(season)) return true;          // final round: all placements count
  return postRealSet(season).has(w+':'+mu.home.teamId+':'+mu.away.teamId);
}

async function buildAllTimeH2H(){
  const results=await Promise.allSettled(ALL_SEASONS.map(fetchSeasonData));
  const ledger={},games={};
  _seasonMeta={}; _brCache={}; _pcCache={};
  results.forEach(res=>{
    if(res.status!=='fulfilled'||!res.value) return;
    const {season,schedule,owners,names,teams}=res.value;
    _seasonMeta[season]={owners,names,teams,schedule,divisions:res.value.divisions||{},playoffTeamCount:res.value.playoffTeamCount||6,regEnd:res.value.regEnd||14,faabBudget:res.value.faabBudget||0,slots:res.value.slots||null};
    schedule.forEach(mu=>{
      if(!mu.home||!mu.away) return;
      const ho=owners[mu.home.teamId], ao=owners[mu.away.teamId];
      if(!ho||!ao||ho===ao) return;
      const hp=mu.home.totalPoints||0, ap=mu.away.totalPoints||0;
      const win=mu.winner; // "HOME" | "AWAY" | "TIE" | "UNDECIDED"/undefined
      if((win==null||win==='UNDECIDED')&&hp===0&&ap===0) return; // not played
      /* a dead consolation game counts for neither side */
      if(!postGameCounts(season,mu)) return;
      const hOn=true, aOn=true;
      const key=ho<ao?`${ho}|${ao}`:`${ao}|${ho}`;
      const k=ledger[key]||(ledger[key]={});
      (k[ho]||(k[ho]={w:0,t:0,pf:0,games:0}));
      (k[ao]||(k[ao]={w:0,t:0,pf:0,games:0}));
      if(hOn){ k[ho].games++; k[ho].pf+=hp; games[ho]=(games[ho]||0)+1; }
      if(aOn){ k[ao].games++; k[ao].pf+=ap; games[ao]=(games[ao]||0)+1; }
      if(win==='HOME'||(win==null&&hp>ap)){ if(hOn) k[ho].w++; }
      else if(win==='AWAY'||(win==null&&ap>hp)){ if(aOn) k[ao].w++; }
      else { if(hOn) k[ho].t++; if(aOn) k[ao].t++; }
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
      /* .nostick opts out of pinning entirely; .noseam keeps the pinned column
         and drops only the shadow down its right edge. Thirteen columns want
         the team name pinned, so standings takes the second — the shadow was
         decorating a seam the opaque background already hides, and read as a
         line hanging in the middle of the row. */
      if(!tbl.classList.contains('nostick')) tbl.classList.add(idIdx<=0?'stick1':'stick2');
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
  const run=()=>{ try{ labelTables(document); applyShortNames(document); seasonLabel(); tradeScopeLabel(); badBeatCols(); stripeProfileStats(); }catch(e){} };
  run();
  const target=document.querySelector('main')||document.body;
  new MutationObserver(()=>{ clearTimeout(_mtblTimer); _mtblTimer=setTimeout(run,120); })
    .observe(target,{childList:true,subtree:true});
  // keep the sticky name-column offset correct through resize / rotation
  window.addEventListener('resize',()=>{ clearTimeout(_mtblTimer); _mtblTimer=setTimeout(()=>{run(); setPageBg(_activeTab);},150); });
  window.addEventListener('orientationchange',()=>setTimeout(run,250));
}
function switchTab(name){
  try{ undockPicker(true); }catch(e){}   // before the page changes under it
  _activeTab=name;
  syncSeasonPicker(name);
  document.documentElement.dataset.tabaccent=name;   // each tab drives the page accent
  setPageBg(name);
  document.querySelectorAll('.tab-btn').forEach(b=>b.classList.toggle('active',b.dataset.tab===name));
  document.querySelectorAll('.tab-page').forEach(p=>p.classList.toggle('active',p.id==='page-'+name));
  /* Cleared before the per-tab renders below, not after: a renderer that fills
     the aside would otherwise have its work wiped on the way out. */
  {const a=document.getElementById('page-h1-aside'); if(a) a.innerHTML='';}
  if(name==='tenure') ensureTenure();
  /* The Rosters tab is off the nav. renderRoster and #page-roster are still in
     the source — the page works if it is ever wanted back — but nothing routes
     to it and nothing fetches for it. */
  if(name==='leaders') renderLeaders();
  if(name==='week') renderWeek();
  if(name==='draft') ensureDraft();
  if(name==='trades') renderTradesTab();
  if(name==='teams') renderProfile();
  if(name==='punishment') renderPunishment();
  if(name==='standings') renderStandings();
  if(name==='cm') renderCoachingMetric();
  if(name==='badbeat') renderBadBeat();
  if(name==='profile') renderMyProfile();
  if(name==='history'){ renderHistoryTable(); loadHistoryScorers().then(()=>{ if(_activeTab==='history') renderHistoryTable(); }); }
  if(name==='home'){ liveStart(); wireVidRail(); try{ renderNotifications(); }catch(e){} try{ leaguePoll(); }catch(e){} } else liveStop();   // the live board lives on the homepage
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
  try{ renderBetsBar(); }catch(e){}
  try{ eggPaint(); }catch(e){}
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
  /* Buttons carrying data-pair are gathered into one row instead of taking a
     full line each. They are the two curiosities at the foot of the menu, and
     side by side they read as a pair rather than as two more destinations. */
  const item=b=>{
    const tab=b.dataset.tab;
    const icon=(b.querySelector('i')||{}).className||'fa fa-circle';
    const label=b.textContent.trim();
    const tc=TAB_COLORS[tab]||'var(--accent)';
    const active=(tab===_activeTab)?' active':'';
    return `<button class="tab-dd-item${active}" data-tab="${tab}" style="--tc:${tc}"
      onclick="tabDDGo('${tab}')"><i class="${icon}" style="color:${tc}"></i><span>${label}</span></button>`;
  };
  const paired=btns.filter(b=>b.dataset.pair);
  const solo=btns.filter(b=>!b.dataset.pair);
  const pairRow=paired.length?`<div class="tab-dd-pair">${paired.map(item).join('')}</div>`:'';
  /* Each section holds four tabs, so they sit two by two rather than in one
     long column — the menu reads as three blocks instead of a list to scan.
     A tab carrying data-group opens the next section. */
  const groups=[];
  solo.forEach(b=>{
    if(!groups.length || b.dataset.group) groups.push({label:b.dataset.group||'', items:[]});
    groups[groups.length-1].items.push(b);
  });
  menu.innerHTML=groups.map(g=>
    (g.label?`<div class="tab-dd-sep"><span class="tab-dd-rule"></span><span class="tab-dd-sep-l">${g.label}</span></div>`:'')
    +`<div class="tab-dd-grid">${g.items.map(item).join('')}</div>`
  ).join('')+pairRow;
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
  const top=Math.round(nv.getBoundingClientRect().bottom+14);
  document.documentElement.style.setProperty('--ddtop',top+'px');
  /* THE MENU ENDS WHERE THE SCREEN DOES. visualViewport is the only height that
     knows about Android's URL bar and the on-screen keyboard; innerHeight is the
     fallback, and both beat the `vh` the stylesheet has to guess with. Without
     this the box ran past the bottom of the phone and the last three pages were
     unreachable — the menu looked like it stopped at Trades. */
  const vh=Math.round((window.visualViewport&&window.visualViewport.height)||window.innerHeight||0);
  if(vh) menu.style.maxHeight=Math.max(220,vh-top-12)+'px';
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
  /* ONE MOVEMENT COUNTS ONCE, WHATEVER THE FEED SAYS.

     ESPN files a trade under two message-type families and the communication
     feed hands back both, so a four-player trade arrived as eight records and
     every player was credited to the buyer twice and debited from the seller
     twice — doubling the whole of C2 for anyone who traded, and showing up as
     duplicate names on both sides of the Trade ROI table.

     The proxy now drops the second telling at the source. This is the belt to
     that pair of braces: the same guard, applied to whatever any feed hands
     over, because the log has three possible sources and only one of them was
     ever checked. Keyed on the movement — player, from, to, week — so a genuine
     trade cannot collide with anything. */
  const seenMove=new Set();
  (transactions||[]).forEach(tx=>{
    if(!executed(tx)) return;
    const tid=tx.teamId;
    if(detail[tid]) detail[tid].txTypes.add(tx.type);
    if(tx.type==='TRADE_ACCEPT'||tx.type==='TRADE'){
      const tradeWeek=tx.scoringPeriodId||0;
      const fromWeek=tradeWeek+1;
      (tx.items||[]).forEach(item=>{
        const pid=item.playerId; if(pid==null) return;
        const key=`${pid}|${item.fromTeamId}|${item.toTeamId}|${tradeWeek}`;
        if(seenMove.has(key)) return;
        seenMove.add(key);
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
/* ── HEADSHOTS COME BACK SIZED ───────────────────────────────────────────────
   The full-resolution PNG is about 285KB and was being fetched to be drawn in a
   sixteen-pixel circle. One page carried 28 of them: 7MB of images for a
   dashboard, on phones, every time the browser cache turned over.

   ESPN's combiner resizes on their CDN. The same headshot at 64px is 5.4KB —
   fifty-four times smaller — and at the sizes these are drawn there is nothing
   to see in the difference. Asked for at twice the drawn size so it stays sharp
   on a retina screen, and capped, because a handful are drawn large. */
const headshotURL=(pid,size)=>{
  /* Width only. Passing h as well makes the combiner return a square, and the
     source is 600x436 — so every face came back squashed into a 1:1 box. With
     just w it keeps the ratio (64x47 for w=64), which is the shape the CSS has
     always cropped from: object-fit:cover in a round box trims the sides and
     anchors to the top. Smaller too — 4.0KB against 5.4KB for the square. */
  const w=Math.min(350,Math.max(48,Math.round((size||24)*2)));
  return `https://a.espncdn.com/combiner/i?img=/i/headshots/nfl/players/full/${pid}.png&w=${w}`;
};
function playerImg(pid,size,name){
  size=size||24;
  const isDef=/d\/st|dst|defense/i.test(String(name||''));
  const url=(pid!=null&&!isDef)?proxyLogo(headshotURL(pid,size)):null;
  /* No disc behind the photo. The headshot is already round and cropped to
     this box, so the fill only ever showed as a ring around the player. It
     stays for the fallback, where the icon does need a ground to sit on. */
  const box=`position:relative;width:${size}px;height:${size}px;border-radius:50%;flex:0 0 ${size}px;display:inline-flex;align-items:center;justify-content:center;background:${url?'transparent':'rgba(255,255,255,0.08)'};overflow:hidden;vertical-align:middle;`;
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
    cmModalShow();
    return;
  }
  const c1f=bd.c1||0,c2f=bd.c2||0,c3f=bd.c3||0,rawf=bd.raw||0;

  /* ── THE POPUP IS THE SCORE BREAKDOWN ─────────────────────────────────────
     It used to carry the breakdown AND every input behind it: the points sum,
     a line per traded player, a line per waiver pickup with its bid, and a
     debug block. That is the same detail the Trade ROI and Waiver ROI tabs
     exist to show, laid out better than a modal can, and it made a sheet three
     screens tall on a phone — long enough to scroll, which is what let a drag
     escape into the page behind it.

     Tapping a name on the ranked list asks one question: where did that score
     come from. C1, C2, C3, the sum, the standardised final. Anyone who wants
     the players goes to the tab named after them. */
  const modeNote=_cmMode==='inferred'
    ?`<div class="modal-note"><i class="fa fa-circle-info" style="margin-right:6px;color:var(--blue)"></i>ESPN deletes the detailed transaction log when a season ends, so trades and pickups for this season are <b>reconstructed from weekly roster changes</b>. Bid amounts are gone too, so every pickup uses the team's estimated average bid.</div>`
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
    <div class="modal-seealso">Player-by-player detail is on the
      <b>Trade ROI</b> and <b>Waiver ROI</b> tabs.</div>`;
  cmModalShow();
}

/* ── THE PAGE BEHIND A MODAL MUST NOT MOVE ───────────────────────────────────
   The overlay is fixed and the page behind it stayed scrollable, so a drag
   starting on the backdrop, or carrying on past the end of the sheet, took the
   whole app with it.

   modalLock is NOT written here. It already existed a few thousand lines down,
   complete and unused, and the first cut of this declared a second one by the
   same name — which JavaScript resolves to whichever came last in the file, so
   every open called the OTHER one with no argument, took its `else` branch and
   ran window.scrollTo. A lock that scrolled the page: the exact symptom being
   fixed, newly caused by the fix.

   Its comment is also the reason not to reach for overflow here. The phone
   rules set body{overflow-y:visible!important}, so an overflow lock on the root
   is scrolled straight through on a phone — which is the screen this matters
   on. Pinning body with position:fixed at minus the current scroll is what
   actually holds, and it puts the position back on close.

   What this adds is the part that lock does not cover: a touch that lands on
   the backdrop itself is not a scroll of anything, so it is cancelled outright
   rather than allowed to chain. Bound once, and only for the overlay as target,
   so scrolling inside the sheet is untouched. */
function cmModalShow(){
  const ov=document.getElementById('cm-overlay');
  if(!ov) return;
  if(!ov._dragGuarded){
    ov._dragGuarded=true;
    ov.addEventListener('touchmove',e=>{ if(e.target===ov) e.preventDefault(); },{passive:false});
  }
  const m=ov.querySelector('.modal'); if(m) m.scrollTop=0;   // a new manager opens at the top
  ov.classList.add('open');
  modalLock(true);
}
function closeCMModal(e){if(e.target===document.getElementById('cm-overlay'))closeCMModalDirect();}
function closeCMModalDirect(){
  document.getElementById('cm-overlay').classList.remove('open');
  modalLock(false);
}

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
/* Standings is a single table again. Kept as a thin wrapper rather than
   inlining it, because several callers repaint the page after data lands. */
function renderStandings(){ try{ renderStandingsTable(); }catch(e){} }
function renderCoachingMetric(){
  try{ renderStatsCM(); }catch(e){}
  try{ renderC2Breakdown(); }catch(e){}
  try{ renderC3Breakdown(); }catch(e){}
  try{ renderLineupIQ(); }catch(e){}
  try{ showCMSection(_cmSection); }catch(e){}
}
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
      ${picks.length?`<div class="tscroll"><table class="min560 srt" style="margin-top:4px" data-mhide="Margin">
        <!-- Next stays on a phone. It was in data-mhide, so the runner-up bid —
             the whole reason the ratio is what it is — was desktop-only, and on
             the screen this league actually reads the table on it looked like
             the column did not exist. Margin is bid minus next, so it is the one
             that can be worked out from what is left. -->
        <thead><tr><th>Pickup</th><th class="right">Wk</th><th class="right">Bid</th><th class="right">Next</th><th class="right">Margin</th><th class="right">PTS</th><th class="right">Ratio</th></tr></thead>
        <tbody>${picks.map(w=>{const mar=Math.max(w.margin??w.bid,1);return `<tr>
          <td><span class="pname">${playerImg(w.pid,20,pName(w.pid))}<span>${pName(w.pid)}</span>${w.est?'<span class="est-tag" style="color:var(--text3);font-size:12px"> est.</span>':''}</span></td>
          <td class="right">${w.week}</td>
          <td class="right">$${w.bid}</td>
          <td class="right" style="color:var(--text3)">${w.next>0?('$'+w.next):'$0'}</td>
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
/* Takes an optional season. Without one it follows the nav year, which is
   what every existing caller wants; the sportsbook passes the season it is
   actually pricing rather than relying on the two happening to agree. */
function loadLineupIQ(want){
  const season=want||getSeason();
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
    <div class="sec-head" style="font-size:15px;margin-top:20px"><i class="fa fa-clock-rotate-left"></i>All Past Matchups</div>
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
  /* The summary hero is gone: the crest and the totals it showed are already
     on the team profile, and the table underneath is what this section is for. */
  body.innerHTML=`
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
    ${marginsHTML()}
    ${mgTeamCardHTML(owner)}
    ${rows.length?pastMatchupsHTML(owner,me,rows):''}`;
}

/* ── MARGINS ─────────────────────────────────────────────────────────────────
   How far apart games finished. Two league-wide top tens side by side — the
   widest gaps and the tightest — and, below, the selected team's own four
   extremes gathered into one card.

   Only games that counted are considered, the same rule the records use, so a
   dead-rubber consolation blowout is not somebody's biggest win.

   Names come from the season the game was played in rather than today's
   roster, so a franchise that has since left is still called what it was
   called then. */
function mgSeasonName(season,owner){
  const m=_seasonMeta[season];
  const n=m&&m.names&&m.names[owner]&&m.names[owner].name;
  if(n) return n;
  const fr=_franchises.find(f=>f.owner===owner);
  return (fr&&fr.name)||'A former team';
}
/* every counting game once, from the winner's point of view */
function mgAllGames(){
  const out=[];
  ALL_SEASONS.forEach(s=>{
    const meta=_seasonMeta[s]; if(!meta) return;
    const owners=meta.owners||{};
    (meta.schedule||[]).forEach(mu=>{
      if(!mu.home||!mu.away) return;
      const hp=mu.home.totalPoints||0, ap=mu.away.totalPoints||0;
      if(hp===0&&ap===0) return;
      if(hp===ap) return;                       // a tie has no margin
      if(!postGameCounts(s,mu)) return;
      const ho=owners[mu.home.teamId], ao=owners[mu.away.teamId];
      if(!ho||!ao||ho===ao) return;
      const homeWon=hp>ap;
      out.push({season:s,week:mu.matchupPeriodId||0,
        win:homeWon?ho:ao, lose:homeWon?ao:ho,
        winPts:homeWon?hp:ap, losePts:homeWon?ap:hp,
        margin:Math.abs(hp-ap)});
    });
  });
  return out;
}
/* Five deep, narrow enough to sit two abreast. No badges: at half a phone the
   logo crowded out the name standing beside it, and the name is the thing
   being read. "def." carries which way round the result went, so neither team
   has to be worked out from position alone. */
function mgTopCol(big){
  const games=mgAllGames()
    .sort((a,b)=>big?(b.margin-a.margin):(a.margin-b.margin))
    .slice(0,5);
  if(!games.length) return '<div class="mg-none">Nothing to rank yet.</div>';
  return games.map((g,i)=>`<div class="mgc">
      <div class="mgc-h">
        <span class="mgc-rk">${i+1}</span>
        <span class="mgc-marg${big?'':' mg-tight'}">${big?'+':''}${g.margin.toFixed(1)}</span>
      </div>
      <div class="mgc-w">${mgSeasonName(g.season,g.win)}</div>
      <div class="mgc-l"><span class="mgc-def">def.</span>${mgSeasonName(g.season,g.lose)}</div>
      <div class="mgc-f"><span class="mgc-sc">${g.winPts.toFixed(1)}–${g.losePts.toFixed(1)}</span><span class="mgc-wk">${g.season} · Wk ${g.week}</span></div>
    </div>`).join('');
}
function marginsHTML(){
  if(!_franchises.length) return '';
  return `<div class="sec wm mg-sec" data-wm="&#xf091;">
    <div class="sec-head"><i class="fa fa-arrows-left-right"></i>Matchup Extremes<span class="badge-info">every season</span></div>
    <div class="mg-pair" data-nochip>
      <div class="mg-col">
        <div class="mg-colh mg-colh-big"><i class="fa fa-explosion"></i>Biggest Blowouts</div>
        ${mgTopCol(true)}
      </div>
      <div class="mg-col">
        <div class="mg-colh mg-colh-close"><i class="fa fa-compress"></i>Closest Games</div>
        ${mgTopCol(false)}
      </div>
    </div>
    <div class="mg-note">The five widest and the five tightest results in league history. Postseason games with nothing riding on them are left out, the same as they are from the records above.</div>
  </div>`;
}
/* ── ONE TEAM'S EXTREMES ─────────────────────────────────────────────────────
   The four corners for whoever the dropdown is on: widest and tightest win,
   widest and tightest loss, in a single card rather than four lists. */
function mgTeamCardHTML(owner){
  if(!owner) return '';
  const fr=_franchises.find(f=>f.owner===owner); if(!fr) return '';
  const games=mgAllGames().filter(g=>g.win===owner||g.lose===owner);
  if(!games.length) return '';
  const wins=games.filter(g=>g.win===owner), losses=games.filter(g=>g.lose===owner);
  const pick=(arr,big)=>arr.length
    ? arr.slice().sort((a,b)=>big?(b.margin-a.margin):(a.margin-b.margin))[0] : null;
  const row=(g,label,won)=>{
    if(!g) return `<div class="mgt-row"><span class="mgt-lab">${label}</span>
      <span class="mg-none">No result yet</span></div>`;
    const opp=won?g.lose:g.win;
    const mine=won?g.winPts:g.losePts, theirs=won?g.losePts:g.winPts;
    return `<div class="mgt-row mgt-${won?'w':'l'}">
      <span class="mgt-lab">${label}</span>
      <span class="mgt-marg">${won?'+':'−'}${g.margin.toFixed(1)}</span>
      <span class="mgt-opp"><span class="mgt-verb">${won?'beat':'lost to'}</span> ${mgSeasonName(g.season,opp)}</span>
      <span class="mgt-sc">${mine.toFixed(1)}–${theirs.toFixed(1)}</span>
      <span class="mgt-when">${g.season} · Wk ${g.week}</span>
    </div>`;
  };
  return `<div class="sec wm mgt-sec" data-wm="&#xf140;">
    <div class="sec-head"><i class="fa fa-bullseye"></i>Team Extremes<span class="badge-info">${fr.name}</span></div>
    <div class="mgt-card">
      <div class="mgt-team">${franchiseAvatar(fr,26,7)}<span>${fr.name}</span></div>
      ${row(pick(wins,true),'Biggest win',true)}
      ${row(pick(wins,false),'Closest win',true)}
      ${row(pick(losses,true),'Biggest loss',false)}
      ${row(pick(losses,false),'Closest loss',false)}
    </div>
    <div class="mgt-note">The four corners for whoever is selected above — widest and tightest, won and lost.</div>
  </div>`;
}

// ── PLAYER TENURE TAB ──────────────────────────────────────────────────────────
/* Whether the career table is showing all of a manager's players or the top
   fifty. Not remembered between visits: fifty is the right thing to open on,
   and a hundred and fifty rows is a choice you make rather than one you inherit
   from the last time you looked. */
let _tenureAll=false, _tenureOwner=null;
function tenureShowAll(on){ _tenureAll=!!on; try{ renderTenureTable(); }catch(e){} }
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
/* How many times this franchise has spent a pick on a player, across every
   season. Built from loadAllDrafts(), which is the same board the Draft tab
   reads, so the two can never disagree. Note computeDraftRows() drops a season
   whose stat sheet has no points yet — an upcoming draft is a placeholder
   board, not a draft — so a pick made for a season that has not been played
   does not count here either. */
let _draftCounts=null,_draftCountsPromise=null,_draftCountsPainted=false;
function draftCounts(){
  if(_draftCounts) return _draftCounts;
  if(!_draftCountsPromise){
    /* pickRows, not rows: every draft that has happened, graded or not */
    _draftCountsPromise=loadAllDrafts().then(({pickRows})=>{
      const m={};
      (pickRows||[]).forEach(r=>{ if(r.owner==null) return;
        const o=m[r.owner]||(m[r.owner]={});
        o[r.pid]=(o[r.pid]||0)+1; });
      return (_draftCounts=m);
    }).catch(()=>(_draftCounts={}));
  }
  return null;                                  // not here yet; caller repaints
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
  /* a different manager is a different list, and it opens at fifty like the
     first one did rather than inheriting an expansion meant for somebody else */
  if(_tenureOwner!==owner){ _tenureOwner=owner; _tenureAll=false; }
  const q=(document.getElementById('tenure-search')?.value||'').trim().toLowerCase();
  /* the draft board loads separately from the roster history; paint the table
     as soon as tenure is ready and fill the column in when the board lands */
  const dc=draftCounts();
  if(!dc&&!_draftCountsPainted){
    _draftCountsPainted=true;
    _draftCountsPromise.then(()=>{ try{ renderTenureTable(); }catch(e){} });
  }
  const drafted=(dc&&dc[owner])||null;
  const players=Object.entries(_tenure[owner]||{}).map(([pid,p])=>({
    pid, n:p.n||`Player #${pid}`,
    wAll:p.wAll, sAll:p.sAll, pAll:p.pAll, pwAll:p.pwAll||0,
    /* POINTS MEANS POINTS HE STARTED FOR YOU. spAll only adds a week's score
       when the player was in the active lineup; pAll adds it whether he was
       started or sat on the bench. The column was showing pAll, so a player who
       spent a season being handcuffed on somebody's bench read as though he had
       been scoring for them all year. Both are collected — pAll is still what
       the roster-weeks column is about — but the number beside a name here is
       what he actually put on the board. */
    spAll:p.spAll||0,
    nDraft:drafted?(drafted[pid]||0):null,
  }))
  .filter(p=>!q||p.n.toLowerCase().includes(q))
  .sort((a,b)=>b.wAll-a.wAll||b.spAll-a.spAll);

  const dash='<span style="color:var(--text3)">—</span>';
  /* ── FIFTY IS NOT THE WHOLE LIST, AND THE REST WAS UNREACHABLE ─────────────
     Ranked by career roster weeks, so a player drafted this morning sits on
     zero of everything and sorts below four seasons of everybody. Every manager
     carries between 97 and 149 names from 2022-25, which put a fresh draft
     class somewhere around a hundredth place — present in the data, past the
     cut, and findable only by typing a name you already knew to look for.

     "Use search to find others" is not a way to see what you just drafted. The
     cap stays, because 150 rows of a career table is not a thing anybody reads
     top to bottom, but it opens now. */
  const shown=_tenureAll?players:players.slice(0,50);
  /* The three single-season columns are gone. Tenure is a career view — how
     long a player has been kept and how much they gave over that time — and
     one season's slice sat oddly next to four all-time totals while pushing
     the table two columns past the width of a phone. */
  /* Built as a grid list rather than a table, the same way the Draft Report
     lays its picks out. A table sizes itself to its widest cell and then makes
     the page carry it sideways; a grid is told what each column gets and the
     name absorbs whatever is left, so the whole row is on screen at any width.
     Sorting comes with it — every cell carries the raw value, so the header can
     reorder without re-rendering. */
  body.innerHTML=shown.length?tenureListHTML(shown)
    +(players.length>50?`<div class="tn-more">${_tenureAll
        ?`Showing all ${players.length}. <button class="tn-more-b" onclick="tenureShowAll(false)">Show top 50</button>`
        :`Showing top 50 of ${players.length}. <button class="tn-more-b" onclick="tenureShowAll(true)">Show all</button>`}</div>`:'')
    +`<div class="tn-note"><b>Starts</b> = weeks in the active lineup ·
      <b>Roster</b> = weeks on the roster, starting or benched ·
      <b>Pts</b> = points scored while started, so a week on the bench adds nothing.
      Bye weeks, and weeks a player was on IR or ruled out, are not counted.</div>`
  :`<div class="tab-loading">No players found${q?` matching “${q}”`:''}.</div>`;
  try{ renderTenureHardware(); }catch(e){}
}


/* One row per player, every column a fixed share except the name, which takes
   what is left. Each cell carries its raw value on data-v so sorting never has
   to parse a formatted number back out of the text. */
let _tnSort={col:1,asc:false};
function tenureListHTML(rows){
  const cols=[
    {k:'#',    cls:'tn-rk',  t:'Order in this list'},
    {k:'Player',cls:'tn-player',t:'Player'},
    {k:'Start',cls:'tn-st', t:'Weeks in the starting lineup, every season'},
    {k:'Rost',cls:'tn-ro', t:'Weeks on the roster (starter or bench), every season'},
    {k:'Draft',cls:'tn-dr', t:'Times this team has spent a draft pick on this player'},
    {k:'Pts',cls:'tn-pts',t:'Points scored while in the starting lineup, every season. Weeks on the bench are not counted.'},
    {k:'PO W',  cls:'tn-pw', t:'Playoff games won while started for this team'},
  ];
  const head=`<div class="tn-row tn-head">${cols.map((c,i)=>
    `<span class="${c.cls} tn-sort" data-col="${i}" title="${c.t}" onclick="sortTN(${i})">${c.k}<i class="tn-arw"></i></span>`
  ).join('')}</div>`;
  const dash='<span class="tn-dash">—</span>';
  const body=rows.map((p,i)=>`<div class="tn-row">
    <span class="tn-rk" data-v="${i+1}">${i+1}</span>
    <span class="tn-player" data-v="${String(p.n||'').replace(/"/g,'&quot;')}">${playerImg(p.pid,20,p.n)}<span class="pl-name">${p.n}</span></span>
    <span class="tn-st" data-v="${p.sAll}">${p.sAll}</span>
    <span class="tn-ro" data-v="${p.wAll}">${p.wAll}</span>
    <span class="tn-dr" data-v="${p.nDraft==null?-1:p.nDraft}">${p.nDraft==null?'<span class="tn-dash">·</span>':(p.nDraft||dash)}</span>
    <span class="tn-pts" data-v="${p.spAll}">${p.spAll.toFixed(1)}</span>
    <span class="tn-pw" data-v="${p.pwAll}">${p.pwAll||dash}</span>
  </div>`).join('');
  return `<div class="tn-list">${head}${body}</div>`;
}
function sortTN(col){
  const list=document.querySelector('.tn-list'); if(!list) return;
  /* names read best A–Z first, numbers biggest first */
  const asc=(_tnSort.col===col)? !_tnSort.asc : (col===0||col===1);
  _tnSort={col,asc};
  const rows=[...list.querySelectorAll('.tn-row:not(.tn-head)')];
  const val=r=>{const c=r.children[col]; const v=c?.dataset.v ?? c?.textContent ?? '';
    const n=parseFloat(v); return (v!==''&&!isNaN(n))?n:String(v).toLowerCase();};
  rows.sort((x,y)=>{const p=val(x),q=val(y);
    if(typeof p==='number'&&typeof q==='number') return asc?p-q:q-p;
    return asc?String(p).localeCompare(String(q)):String(q).localeCompare(String(p));});
  rows.forEach(r=>list.appendChild(r));
  list.querySelectorAll('.tn-head .tn-sort').forEach((sp,i)=>{
    sp.classList.toggle('sorted',i===col);
    const ar=sp.querySelector('.tn-arw'); if(ar) ar.textContent=(i===col)?(asc?' \u2191':' \u2193'):'';
  });
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
/* ── ARCHIVED VOTES, BY THE NAME THE FIELD WOULD HAVE HAD ────────────────────
   The weekly archiver freezes each trade's verdict beside the trade, so the
   league's answer survives a profile reset and any future change to how a vote
   id is built. These hold what came off disk; the live profiles are still read
   and the two are unioned, never added — see ntVoteSides. */
let _tradeVotes={};        // sanitised vote id -> { voterId: side }
let _tradeVoterTeam={};    // voterId -> teamId, for drawing a crest
function tradeVotesLoad(season,d){
  const voters=(d&&d.voters)||null;
  if(voters) Object.keys(voters).forEach(v=>{ _tradeVoterTeam[v]=voters[v]; });
  ((d&&d.trades)||[]).forEach(tr=>{
    if(!tr||!tr.votes) return;
    const raw=ntTradeVoteId(season,tr);
    _tradeVotes[String(raw).replace(/[^a-zA-Z0-9_]/g,'_')]=tr.votes;
  });
}
/* ── A FINISHED SEASON IS THE FILE. THE ONE BEING PLAYED IS BOTH ─────────────
   histJSON returns the archive and stops asking, which is right for a season
   that cannot change and wrong for the one being played. The archiver now runs
   weekly, so the live season HAS a file — and that file is a week old the
   moment it lands.

   Two things would go stale behind it. A trade agreed on Thursday would not be
   in it at all. And a trade's points are what its players scored FROM THE TRADE
   WEEK ONWARD, which grows every Sunday — so a frozen total would quietly stop
   moving while the bar above it kept claiming to show who won.

   So the live season reads both: ESPN for the trades and their running totals,
   the archive for the votes. The archive never supplies a number that changes;
   it supplies the one thing ESPN does not have. */
async function fetchSeasonTrades(season){
  if(_tradeCache[season]) return _tradeCache[season];
  const liveURL=`${BASE}?type=seasontrades&seasonId=${season}&v=3`;
  try{
    let d;
    if(String(season)===String(nflSeasonYear())){
      const [arc,live]=await Promise.all([
        fetch(`/data/trades-${season}.json`).then(r=>r.ok?r.json():null).catch(()=>null),
        fetch(liveURL).then(r=>r.ok?r.json():null).catch(()=>null),
      ]);
      d=mergeSeasonTrades(season,arc,live);
    }else{
      d=await histJSON('trades',season,liveURL);
    }
    d=d||{trades:[],source:'error'};
    tradeVotesLoad(season,d);
    _tradeCache[season]={trades:d.trades||[],source:d.source||'reconstructed'};
  }catch{_tradeCache[season]={trades:[],source:'error'};}
  return _tradeCache[season];
}
/* ESPN's trade, the archive's votes. Keyed on the vote id, which is the only
   identity a trade has — there is no trade id in the payload. A trade ESPN no
   longer reports but the archive still holds is kept: that is what archiving is
   for, and losing it would undo the whole exercise the first time ESPN purged
   the log mid-season. */
function mergeSeasonTrades(season,arc,live){
  const arcT=(arc&&arc.trades)||[], liveT=(live&&live.trades)||[];
  if(!arcT.length) return live||arc||null;
  if(!liveT.length&&!live) return arc;
  const byId={};
  arcT.forEach(t=>{ byId[ntTradeVoteId(season,t)]=t; });
  const out=[];
  liveT.forEach(t=>{
    const id=ntTradeVoteId(season,t);
    const was=byId[id];
    /* the live row wins on everything except the verdict */
    out.push(was&&was.votes?{...t,votes:was.votes}:t);
    delete byId[id];
  });
  Object.keys(byId).forEach(id=>out.push(byId[id]));   // archived only
  return {season,count:out.length,trades:out,
    source:(live&&live.source)||(arc&&arc.source)||'reconstructed',
    voters:(arc&&arc.voters)||undefined};
}
function setTradeSort(mode,btn){
  _tradeSort=mode;
  document.querySelectorAll('#trade-sort .filter-btn').forEach(b=>b.classList.remove('active'));
  if(btn)btn.classList.add('active');
  renderTradesTab();
}
function setTradeTeam(owner){_tradeTeamFilter=owner;renderTradesTab();}
function setTradeTeam2(owner){_tradeTeamFilter2=owner;renderTradesTab();}
/* The pair as the filter actually means it. Picking the same franchise on both
   sides is a request for that team's trades, not for the trades it made with
   itself — which is nothing, and would read as a broken filter. */
function tradeFilterPair(){
  const a=_tradeTeamFilter,b=_tradeTeamFilter2;
  if(a&&b&&a!==b) return {a,b,both:true};
  return {a:a||b||'',b:'',both:false};
}
const tradeFilterName=o=>o?((_franchises.find(f=>f.owner===o)?.name)||''):'';
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
  /* the vote tallies ride on the league's profile documents, which the poll
     pulls on the homepage — this tab may be the first thing opened, so ask for
     them here too. It repaints when they land and is a no-op once they have. */
  try{ cpSync(); }catch(e){}
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
      /* the vote is named off the raw trade, before the card decides which of
         the two sides won and reorders them */
      list.push({season,source,week:tr.week,a,b,margin:Math.abs(a.total-b.total),share,
        voteId:ntTradeVoteId(season,tr)});
    });
  });
  // optional team filter (by franchise owner, works across seasons)
  const _f=tradeFilterPair();
  if(_f.a){
    list=list.filter(tr=>{
      const oa=_seasonMeta[tr.season]?.owners?.[tr.a.teamId], ob=_seasonMeta[tr.season]?.owners?.[tr.b.teamId];
      /* both sides named: the trade has to be between exactly those two, in
         either direction — a and b are whichever way ESPN listed them */
      if(_f.both) return (oa===_f.a&&ob===_f.b)||(oa===_f.b&&ob===_f.a);
      return oa===_f.a||ob===_f.a;
    });
  }
  const _who=_f.both
    ? `${tradeFilterName(_f.a)} v ${tradeFilterName(_f.b)}`
    : tradeFilterName(_f.a);
  const _cnt=document.getElementById('trade-count');
  if(_cnt){
    const _sc=_tradeScope==='alltime'?'all-time':String(getSeason());
    _cnt.innerHTML=`<span class="tc-num">${list.length}</span><span class="tc-lbl">${list.length===1?'trade':'trades'} · ${_sc}${_who?' · '+_who:''}</span>`;
  }
  if(!list.length){body.innerHTML=`<div class="tab-loading">No trades found${_f.both?' between these two teams':_f.a?' for this team':''}${_tradeScope==='alltime'?'':` in the ${getSeason()} season`}.</div>`;return;}

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
          ${sd.players.length?sd.players.map(p=>`<div class="trade-player"><span class="tp-name pname">${playerImg(p.pid,18,p.n)}<span>${p.n}</span></span><span class="tp-pts" style="color:${pcol}">${p.pts.toFixed(1)}</span></div>`).join(''):`<div class="trade-player"><span class="tp-name" style="color:var(--text3);font-style:italic">nothing received</span></div>`}
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
      ${tradeVoteHTML(tr,winner,loser)}
    </div>`;
  }).join('');
  body.dataset.loading='';
}

/* ── WHAT THE LEAGUE SAID AT THE TIME ────────────────────────────────────────
   The trade notification asks who won and is gone by Tuesday. The answer is
   worth more later than it is that week — the whole point of asking before the
   season has settled it is being able to look back at what everyone thought —
   so the tally is drawn on the trade itself, in the same split bar the card
   already uses for post-trade points. The two readings sit one above the other,
   which is the comparison worth having: what the league guessed, and what
   actually happened.

   Nothing is drawn until somebody has voted. An empty bar under every trade
   ESPN ever recorded would be a row of noise. */
function tradeVoteHTML(tr,winner,loser){
  if(!tr.voteId) return '';
  const f=String(tr.voteId).replace(/[^a-zA-Z0-9_]/g,'_');
  let tally={}; try{ tally=ntVoteTally(f)||{}; }catch(e){ return ''; }
  const total=Object.values(tally).reduce((a,b)=>a+b,0);
  if(!total) return '';
  /* Who voted, drawn as who voted. A bar and two percentages says three of
     twelve without saying which three, and in a league of twelve the names are
     the interesting part — you know these people. The crests sit under the side
     they picked, so the card is read the same way the trade above it is. */
  /* the same union the tally counts, so the crests can never come to a
     different number than the bar above them */
  const sides=ntVoteSides(f);
  const backers=sd=>Object.keys(sides)
    .filter(v=>String(sides[v])===String(sd.teamId))
    .map(v=>({teamId:voterTeamId(v)}));
  const crests=list=>list.map(x=>ntCrest(_ownerMap[Number(x.teamId||0)],22)).join('');
  const W=backers(winner), L=backers(loser);
  /* THE COLUMNS FOLLOW THE VOTE. An even split down the middle is right when
     the vote was even and wasteful when it was not: eleven crests in half the
     width is three rows while one crest sits alone in the other half.

     So a lopsided vote sizes the MAJORITY, and sizes it to six crests — six is
     as many as read as a row rather than as a strip, and it is where the column
     stops growing however many voted that way. Eleven or twelve both come out
     two rows of six. The minority takes whatever is left, which is narrower
     than half but still a column rather than a slot.

     Any majority gets it, not only a landslide. The rule used to ask for a
     ratio — twice as many, and no more than three on the other side — which
     left every near-even split on the even columns, and half of 351 holds five
     crests. So six came out five and a stranded one, and seven came out five
     and two. Asking only whether one side has more than the other is simpler
     and is never worse: the majority is no wider than it needs, and the
     minority's own crests still fit in the remainder at every split the league
     can produce. A dead heat still takes the even columns, which is the honest
     picture of a dead heat.

     Sized in crests rather than fractions, so it holds at any card width. A
     shut-out keeps its empty cell for the same reason the minority keeps its
     column — the side that got no votes is a fact about the vote, and an
     absence needs somewhere to be absent from. */
  const SPAN=6;
  const nW=W.length, nL=L.length;
  const small=Math.min(nW,nL), big=Math.max(nW,nL);
  const lop=big>small;
  const slots=Math.min(SPAN,Math.max(1,big));
  const cell=(cls,list)=>`<div class="tv-side ${cls}">${crests(list)}</div>`;
  return `<div class="trade-vote">
    <div class="trade-vote-h"><span>Who the league thought won</span>
      <span class="trade-vote-n">${total} vote${total===1?'':'s'}</span></div>
    <div class="trade-vote-sides${lop?(nW<nL?' tv-big-right':' tv-big-left'):''}"
      style="--tvn:${slots}">
      ${cell('tv-w',W)}
      ${cell('tv-l',L)}
    </div>
  </div>`;
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
  /* A PLACEHOLDER PICK IS ONE THAT NAMES NOBODY, which is not the same thing as
     a negative id. ESPN answers with playerId -1 for a board it has not run yet
     — and it also numbers every D/ST in the negatives, so the Seahawks are
     -16026. Filtering on `playerId > 0` threw away both, which quietly dropped
     all twelve D/ST picks out of every draft board the site has ever drawn:
     2024 and 2025 were showing 156 of their 168 picks. A pick is real when the
     stat sheet can name it. */
  picks=picks.filter(p=>p&&(p.playerId>0||statById[p.playerId]));
  if(!picks.length) return [];
  /* CAN THIS DRAFT BE GRADED YET? Only once somebody has scored. Finish ranks
     are read off the stat sheet's own order, and that sheet is sorted by points
     — so before week 1 the order is arbitrary, and every "finished RB37" would
     be noise wearing the clothes of a fact.

     That is a reason to withhold the grades, not the board. A drafted season has
     a real result in it from the moment the draft ends: who took whom, in which
     round, and where each one went at his own position. So the rows are returned
     either way and carry `graded`, which is what the renderers below read to
     decide whether the finish and Δ columns have earned their place. */
  const graded=stats.some(p=>(p.pts||0)>0);
  const posDraftCount={};
  const owners=_seasonMeta[season]?.owners||{};
  return picks.slice().sort((x,y)=>x.overall-y.overall).map(pk=>{
    const s=statById[pk.playerId];
    const pos=s?.pos??null,posKey=pos??'x';
    posDraftCount[posKey]=(posDraftCount[posKey]||0)+1;
    const posDrafted=posDraftCount[posKey];
    const name=s?.n||_playerNames[pk.playerId]||`Player #${pk.playerId}`;
    const fin=graded?(rankOverall[pk.playerId]??null):null;
    const finPos=graded?(rankPos[pk.playerId]??null):null;
    const delta=!graded?0:(finPos!=null?(posDrafted-finPos):(posDrafted-((posCount[pos]||0)+1)));
    return {season,graded,pid:pk.playerId,name,pos,posName:POS_NAMES[pos]||'—',teamId:pk.teamId,owner:owners[pk.teamId]||null,overall:pk.overall,round:pk.round,posDrafted,fin,finPos,pts:graded?(s?.pts??0):0,delta};
  });
}
/* Whether the season on screen has football in it yet — asked of the rows
   themselves, so there is one answer and it is computed where it is known. */
const draftGraded=season=>!!((_draftCache[season]?.rows)||[])[0]?.graded;
async function loadAllDrafts(){
  if(_draftAllCache) return _draftAllCache;
  const results=await Promise.all(ALL_SEASONS.map(async s=>{
    const [dr,st]=await Promise.all([
      histJSON('draft',s,`${BASE}?type=draft&seasonId=${s}&v=2`),
      histJSON('seasonstats',s,`${BASE}?type=seasonstats&seasonId=${s}&v=2`),
    ]);
    return {s, picks:dr?.picks||[], stats:st?.players||[]};
  }));
  const rows=[], pickRows=[], teamDrafts=[], ownerTotals={}, ownerCounts={};
  results.forEach(({s,picks,stats})=>{
    const r=computeDraftRows(picks,stats,s);
    if(r.length) pickRows.push(...r);
    /* A season with no football in it has no finish ranks, so it has no draft
       score either. It must not reach an all-time aggregate, where it would land
       as twelve classes tied on zero and drag every average toward nothing.

       IT IS STILL A DRAFT, THOUGH. This gate is about SCORING a class, and it
       was also deciding who had ever been drafted — so a player taken in this
       year's draft was not counted as drafted, and Player Data told a manager he
       had taken somebody twice on the third time of asking. The picks go into
       pickRows before the gate; only the grades are held back by it. */
    if(!r.length||!r[0].graded) return;
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
  _draftAllCache={rows,pickRows,teamDrafts,ownerTotals,ownerCounts};
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
function draftMobileHTML(rows,graded){
  /* Before a ball is kicked there is no finish and no \u0394, so those two columns
     come off entirely rather than standing there full of dashes and zeroes.
     What is left is the whole of what a fresh draft knows. */
  const cols=graded?['Rd','Pick','Player','Draft','Finish','\u0394']:['Rd','Pick','Player','Draft'];
  const head=`<div class="dm-row dm-head">${cols.map((c,i)=>`<span class="${i===2?'dm-player ':''}dm-sort" data-col="${i}" onclick="sortDM(${i})">${c}<i class="dm-arw"></i></span>`).join('')}</div>`;
  const body=rows.map(r=>{
    const better=r.finPos!=null&&r.finPos<=r.posDrafted;
    return `<div class="dm-row">
      <span class="dm-rd" data-v="${r.round}">${r.round}</span>
      <span class="dm-pick" data-v="${r.overall}">${r.overall}</span>
      <span class="dm-player" data-v="${r.name}">${playerImg(r.pid,20,r.name)}<span class="pl-name">${r.name}</span></span>
      <span class="dm-drafted" data-v="${r.posDrafted}">${r.posName}${r.posDrafted}</span>
      ${graded?`<span class="dm-finish" data-v="${r.finPos!=null?r.finPos:999}" style="color:${r.finPos==null?'var(--text3)':(better?'var(--green)':'var(--red)')}">${r.finPos!=null?r.posName+r.finPos:'\u2014'}</span>
      <span class="dm-delta" data-v="${r.delta}" style="color:${r.delta>0?'var(--green)':r.delta<0?'var(--red)':'var(--text2)'}">${r.delta>0?'+':''}${r.delta}</span>`:''}
    </div>`;}).join('');
  return `<div class="dm-list${graded?'':' dm-nograde'}">${head}${body}</div>`;
}
function draftTeamTableHTML(rows,showSeason,graded){
  const totalDelta=rows.reduce((s,r)=>s+r.delta,0);
  return draftMobileHTML(rows,graded)+`<div class="tscroll draft-tbl"><table class="min560 srt">
    <thead><tr>${showSeason?'<th>Yr</th>':''}<th>Pick</th><th>Player</th><th class="right">${graded?'Pos: drafted → finished':'Off the board'}</th>${graded?'<th class="right">Pts</th><th class="right">Δ</th>':''}</tr></thead>
    <tbody>${rows.map(r=>`<tr>
      ${showSeason?`<td style="color:var(--text3)">${r.season}</td>`:''}
      <td style="color:var(--text3);white-space:nowrap">Rd ${r.round} · #${r.overall}</td>
      <td><div class="team-cell">${playerImg(r.pid,26,r.name)}<span class="fr-name">${r.name}</span><span class="draft-pos">${r.posName}</span></div></td>
      <td class="right" style="white-space:nowrap">${graded
        ? `${r.posName}${r.posDrafted} → ${r.finPos!=null?`<b style="color:${r.finPos<=r.posDrafted?'var(--green)':'var(--red)'}">${r.posName}${r.finPos}</b>`:'<span style="color:var(--text3)">—</span>'}`
        : `<b>${r.posName}${r.posDrafted}</b>`}</td>
      ${graded?`<td class="right pf">${r.pts.toFixed(1)}</td>
      <td class="right" style="font-weight:600;font-family:'DM Sans',sans-serif;color:${r.delta>0?'var(--green)':r.delta<0?'var(--red)':'var(--text2)'}">${r.delta>0?'+':''}${r.delta}</td>`:''}
    </tr>`).join('')}</tbody>
  </table></div>
  <div style="padding:10px 18px;font-size:12px;color:var(--text2);border-top:1px solid var(--border)">${graded
    ? `Net positional Δ: <b style="color:${totalDelta>=0?'var(--green)':'var(--red)'}">${totalDelta>0?'+':''}${totalDelta}</b> across ${rows.length} picks`
    : `${rows.length} picks. The number beside each player is where he came off the board at his own position — RB3 is the third running back taken. Grades arrive once the season is played.`}</div>`;
}
function renderDraftTab(){
  const body=document.getElementById('draft-body'); if(!body) return;
  const season=getSeason();
  const d=_draftCache[season]; if(!d) return;
  const rows=computeDraftRows(d.picks,d.stats,season); d.rows=rows;
  if(!rows.length){ body.innerHTML=`<div class="tab-loading">No draft data available for the ${season} season.</div>`; return; }
  /* Now that the board is in, the section can say what it is actually showing */
  const badge=document.getElementById('draft-badge');
  if(badge) badge.textContent=draftGraded(season)
    ? 'draft slot vs season finish'
    : `every pick · ${rows.length} in ${Math.max(...rows.map(r=>r.round||0))} rounds`;
  if(_draftTeamSel==null||!_teams.some(t=>t.id===Number(_draftTeamSel))) _draftTeamSel=_teams[0]?.id;
  body.innerHTML=`
  <div class="card" style="margin:0 0 24px">
    <!-- no label: this belongs to the Draft Report section above it, and a
         heading here would earn a third jump chip -->
    ${''/* the picker comes first: the numbers under it describe whichever team
           is selected, so reading them before the selector is backwards */}
    <div class="picker-bar">
      <label for="draft-team-select">Team:</label>
      <select id="draft-team-select" onchange="_draftTeamSel=this.value;renderDraftTeamTable();renderDraftGrades()">${_teams.map(t=>`<option value="${t.id}" ${Number(_draftTeamSel)===t.id?'selected':''}>${t.name}</option>`).join('')}</select>
    </div>
    <div class="section-header dr-scorehead" style="padding:4px 16px 13px"><span id="draft-score"></span></div>
    <div id="draft-team-body"></div>
  </div>
  ${''/* Draft Grades moves here from the team profile: it is season-by-season
         draft work, which belongs with the draft report rather than beside a
         team's all-time record. */}
  <div class="sec wm" data-wm="&#xf46d;">
    <div class="sec-head"><i class="fa fa-clipboard-list"></i>Draft Grades<span class="badge-info">by season</span></div>
    <div id="draft-grades-body"></div>
  </div>
  <div class="sec-head" style="padding-top:4px"><i class="fa fa-ranking-star"></i>Draft Rankings<span class="badge-info">rankings · all-time drafts · steals &amp; busts</span></div>
  <div id="draft-lists" data-nochip></div>`;
  renderDraftTeamTable();
  renderDraftGrades();
  renderDraftLists();
}
/* Draft Grades follows the team picker above it, the same as the score chips */
function renderDraftGrades(){
  const el=document.getElementById('draft-grades-body'); if(!el) return;
  const owner=_ownerMap[Number(_draftTeamSel)];
  if(!owner){ el.innerHTML=''; return; }
  el.innerHTML=profileDraftBlockHTML(owner);
  /* the block reads every season's draft, so repaint once that cache lands */
  if(!_draftAllCache) loadAllDrafts().then(()=>{
    if(_activeTab==='draft') renderDraftGrades();
  }).catch(()=>{});
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
  /* The three year-scoped views rank this season's picks by how far they beat
     their draft slot, which before week 1 is a list of twelve teams tied on
     nothing. They come off the tab strip until the season has been played, and
     anyone standing on one is moved to the all-time list beside it. */
  if(!draftGraded(season)&&!DRAFT_VIEWS[_draftView].all){
    _draftView=_draftView==='ybusts'?'busts':_draftView==='ysteals'?'steals':'best';
    if(_draftView!=='best'){ _draftPickLast=_draftView; _draftPickScope='alltime'; }
  }
  _drWasMobile=drIsMobile();
  el.innerHTML=_drWasMobile?draftListsMobileHTML(season):draftListsDesktopHTML(season);
}
function draftListsDesktopHTML(season){
  const v=DRAFT_VIEWS[_draftView];
  const btn=k=>{const x=DRAFT_VIEWS[k];
    return `<button class="dr-vtab${_draftView===k?' active':''}" onclick="setDraftView('${k}')"><i class="fa ${x.icon}" style="color:${x.col}"></i>${x.tab}</button>`;};
  const tabs=`${draftGraded(season)?`<div class="dr-tabgrp">This Year · ${season}</div>
    <div class="dr-vtabs">${['year','ysteals','ybusts'].map(btn).join('')}</div>`:''}
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
    ${draftGraded(season)?mb('year',season+' Rankings','year','fa-ranking-star','var(--accent)'):''}
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
  const graded=draftGraded(season);
  const scoreEl=document.getElementById('draft-score');
  /* A rank, a score and a grade off a season nobody has played would be three
     numbers dressed as a verdict. Say what is actually known instead. */
  if(!graded){
    if(scoreEl) scoreEl.innerHTML=`<span class="dr-pending"><i class="fa fa-hourglass-half"></i>Drafted. Grades arrive once week 1 is in the books.</span>`;
  }else{
    const totals={}; d.rows.forEach(r=>{totals[r.teamId]=(totals[r.teamId]||0)+r.delta;});
    const ids=Object.keys(totals);
    const avg=ids.length?ids.reduce((s,k)=>s+totals[k],0)/ids.length:0;
    const ranked=ids.map(id=>({id:Number(id),t:totals[id]})).sort((a,b)=>b.t-a.t);
    const rel=(totals[tid]||0)-avg, rank=ranked.findIndex(x=>x.id===tid)+1;
    const rels=ranked.map(x=>x.t-avg); const mn=Math.min(...rels), mx=Math.max(...rels);
    const gt=mx>mn?(rel-mn)/(mx-mn):1; const grade=PPG_GRADES[Math.round(gt*(PPG_GRADES.length-1))]; const gcol=gradeColor(grade);
    if(scoreEl) scoreEl.innerHTML=scoreBadge(rel,rank,season,grade,gcol,ranked.length);
  }
  body.innerHTML=rows.length?draftTeamTableHTML(rows,false,graded):`<div class="tab-loading">No picks found for this team.</div>`;
}

/* The Marathons Ran page is gone. Nothing here read anything but its own
   config block, so the whole tab came out in one piece — the franchise
   called Marathon Men is untouched and still appears everywhere it did. */

// ── LEAGUE HISTORY TAB ─────────────────────────────────────────────────────────
const REGULAR_SEASON_END=14; // fallback only — real value comes from each season's settings
function regEndOf(season){ const n=_seasonMeta[season]?.regEnd; return (n>=8&&n<=18)?n:REGULAR_SEASON_END; }
let _lhView='records';       // records | champs | conf | sups
/* ── THE COACHES' POLL, WEEK BY WEEK ─────────────────────────────────────────
   Read from public/data/polls-<season>.json, which scripts/archive-poll.mjs
   commits once a week. Nothing here touches Firestore: the ballots are a
   season-long list each manager can revise, so the only way to have history is
   to have frozen it, and the only way to show it cheaply is to serve it from
   the repo. One edge GET, cached by the service worker with the rest of /data/.

   No file yet, or no week archived yet, and the section simply does not appear —
   which is the right answer in a week nobody has finished. */
let _polls=null,_pollsFetched=false,_pollsPromise=null;
function pollsLoad(){
  if(_pollsFetched) return _polls;
  if(!_pollsPromise){
    const s=(typeof sbBoardSeason==='function')?sbBoardSeason():getSeason();
    _pollsPromise=fetch(`/data/polls-${s}.json`,{cache:'no-store'})
      .then(r=>r.ok?r.json():null)
      /* League History is built once at load, long before this lands and while
         the homepage is still the open tab — so repainting only when legacy
         happens to be on screen meant the section never appeared at all. It is
         one repaint, once a session, of a page that is already in the DOM. */
      .then(j=>{ _polls=j; _pollsFetched=true;
        try{ if(document.getElementById('legacy-body')) renderLeagueHistory(); }catch(e){}
        return j; })
      .catch(()=>{ _polls=null; _pollsFetched=true; return null; });
  }
  return null;
}
const pollWeeks=()=>Object.keys((_polls&&_polls.weeks)||{})
  .map(Number).filter(n=>n>0).sort((a,b)=>a-b);
/* Twelve hues far enough apart to tell one line from another on a dark chart,
   and fixed per team id so a colour means the same franchise every week. */
const POLL_COLORS=['#e6194b','#3cb44b','#ffe119','#4363d8','#f58231','#911eb4',
  '#42d4f4','#f032e6','#bfef45','#fabed4','#469990','#dcbeff'];
function pollColor(teamId){
  const ids=_teams.map(t=>t.id).sort((a,b)=>a-b);
  const i=ids.indexOf(Number(teamId));
  return POLL_COLORS[(i<0?0:i)%POLL_COLORS.length];
}
const pollTeam=id=>_teams.find(t=>t.id===Number(id))||null;
/* The crest hangs off the FRANCHISE, not the season's team row — _teams carries
   the record and the roster counts and no logo at all, which is why the chart
   first drew twelve initials. */
function pollLogoOf(teamId){
  const o=_ownerMap[Number(teamId)];
  const f=o?_franchises.find(x=>x.owner===o):null;
  return f&&f.logo?proxyLogo(f.logo):null;
}
/* ── THE SHAPE OF A SEASON'S OPINION ─────────────────────────────────────────
   Rank down the y axis with first at the top, week across the x. One line a
   team, its logo sitting at the point the line starts from, so the chart reads
   without a legend underneath it. With a single week archived there is no line
   to draw and it becomes a column of logos in poll order, which is exactly what
   one week of voting is. */
function pollChartHTML(){
  const wks=pollWeeks(); if(!wks.length||!_teams.length) return '';
  const rows=_teams.length;
  const rowH=26, top=18, bottom=26;
  const axisW=18, logoW=30, plotL=axisW+logoW+8, plotR=16;
  const colW=wks.length>1?Math.max(46,Math.min(96,520/(wks.length-1))):0;
  const plotW=wks.length>1?colW*(wks.length-1):0;
  const W=plotL+plotW+plotR, H=top+rows*rowH+bottom;
  const x=w=>plotL+(wks.length>1?wks.indexOf(w)*colW:0);
  const y=r=>top+(r-0.5)*rowH;
  const at={};                      // teamId -> {week: rank}
  wks.forEach(w=>((_polls.weeks[w]||{}).rank||[]).forEach(e=>{
    (at[e.teamId]||(at[e.teamId]={}))[w]=e.rank; }));
  const grid=Array.from({length:rows},(_,i)=>`
    <line x1="${plotL-6}" y1="${y(i+1)}" x2="${W-plotR}" y2="${y(i+1)}"
      stroke="var(--border)" stroke-width="1" opacity="0.5"/>
    <text x="${axisW-4}" y="${y(i+1)+4}" text-anchor="end" font-size="11"
      fill="var(--text3)" font-family="Inter,sans-serif">${i+1}</text>`).join('');
  const weekLabels=wks.map(w=>`<text x="${x(w)}" y="${H-8}" text-anchor="middle"
    font-size="11" fill="var(--text3)" font-family="Inter,sans-serif">Wk ${w}</text>`).join('');
  const lines=Object.keys(at).map(tid=>{
    const t=pollTeam(tid); const col=pollColor(tid);
    const pts=wks.filter(w=>at[tid][w]!=null).map(w=>[x(w),y(at[tid][w])]);
    if(!pts.length) return '';
    const path=pts.length>1
      ? `<polyline points="${pts.map(p=>p.join(',')).join(' ')}" fill="none"
           stroke="${col}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`
      : '';
    const dots=pts.map(p=>`<circle cx="${p[0]}" cy="${p[1]}" r="3.5" fill="${col}"/>`).join('');
    const first=pts[0];
    const logo=pollLogoOf(tid);
    const badge=logo
      ? `<image href="${logo}" x="${axisW+2}" y="${first[1]-11}" width="22" height="22"
           clip-path="inset(0 round 6px)" preserveAspectRatio="xMidYMid slice"/>`
      : `<rect x="${axisW+2}" y="${first[1]-11}" width="22" height="22" rx="6" fill="${col}"/>
         <text x="${axisW+13}" y="${first[1]+4}" text-anchor="middle" font-size="9"
           fill="#0b0b0b" font-weight="700" font-family="Inter,sans-serif">${teamInitials(t?t.name:'')}</text>`;
    return `<g><title>${t?t.name:('Team '+tid)}</title>
      <rect x="${axisW}" y="${first[1]-13}" width="26" height="26" rx="8" fill="${col}" opacity="0.28"/>
      ${badge}${path}${dots}</g>`;
  }).join('');
  return `<div class="poll-chart">
    ${''/* left-aligned, not centred: with one week archived the chart is a
           narrow column, and xMid would float it into the middle of the page
           away from the axis it belongs to */}
    <svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" preserveAspectRatio="xMinYMid meet"
      role="img" aria-label="Coaches' Poll ranking by week">
      ${grid}${weekLabels}${lines}
    </svg></div>`;
}
/* One fold per archived week, newest first. With a single week on file there is
   a single fold, which is what the league sees after week one. */
function pollSectionHTML(){
  if(!_pollsFetched){ pollsLoad(); return ''; }
  const wks=pollWeeks(); if(!wks.length) return '';
  const folds=wks.slice().reverse().map((w,i)=>{
    const d=_polls.weeks[w]||{};
    const rows=(d.rank||[]).map(e=>{
      const t=pollTeam(e.teamId);
      return `<div class="poll-row">
        <span class="poll-rk" style="color:${pollColor(e.teamId)}">${e.rank}</span>
        ${t?logoImg(t.id,'team-logo-sm'):''}
        <span class="poll-nm">${t?t.name:('Team '+e.teamId)}</span>
        <span class="poll-avg">${e.avg.toFixed(2)}</span>
      </div>`;}).join('');
    /* Closed by default, the newest included. The chart above already says how
       the week went, and a fold that opens itself is a fold nobody chose. */
    return `<details class="poll-fold">
      <summary><i class="fa fa-ranking-star"></i><span>Week ${w} Poll</span>
        <span class="poll-ct">${d.ballots||0} ballot${d.ballots===1?'':'s'}</span>
        <i class="fa fa-chevron-down poll-caret"></i></summary>
      <div class="poll-list">${rows}</div>
    </details>`;}).join('');
  return `<div class="sec wm" data-wm="&#xf5a2;">
    <div class="lh-sec-head"><i class="fa fa-ranking-star"></i>Coaches' Poll</div>
    <div class="lh-note">How the league ranked itself, frozen at the end of each
      week. The number beside a team is its average placing across every ballot,
      so lower is better.</div>
    ${pollChartHTML()}
    ${folds}
  </div>`;
}
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
    ${pollSectionHTML()}
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
    <details class="motw-stats">
      <summary class="motw-stats-s"><i class="fa fa-table-list"></i>Matchup Stats<i class="fa fa-chevron-down ms-chev"></i></summary>
      <div class="motw-stats-b">${motwCompareHTML(A,B,at,last,odds)}</div>
    </details>
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
      /* Dead consolation games do not count towards an all-time record, and
         every other all-time table on the site already drops them — the Legacy
         Report was the one that did not, so its ranks disagreed with the very
         records on League History that it reports movement in. */
      if(!postGameCounts(s,m)) return;
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
  /* data-nochip: this is a report the profile carries, not a section of it, and
     as a fifth chip it left the bar one short of a clean grid. Four chips fall
     into 2x2 on a phone on their own — fitSectionNav already refuses to leave a
     remainder of one. */
  return `<div class="sec lr-sec" data-nochip>
    <!-- plain span, not .badge-info: those are hidden inside section heads -->
    <div class="sec-head" style="font-size:15px"><i class="fa fa-landmark" style="color:rgb(var(--lr-rgb))"></i>Legacy Report
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
/* A map of hand-drawn SVGs used to sit here, keyed on punishment names that
   are no longer the league's. Nothing referenced it. The featured cards in
   public/punish are the artwork now. */
/* ── THE PUNISHMENT ARTWORK ──────────────────────────────────────────────────
   One card per punishment, in public/punish. Keyed on a slug of the name rather
   than the name itself, so config can capitalise and punctuate however it reads
   best — "Willem Dafoe", "willem dafoe" and "Willem  Dafoe!" all land on the
   same file. The aliases are the names config has used for the same punishment.

   Filenames are lowercase and hyphenated on purpose: they arrived as "Hot
   Chip.png" and "beer pour card.png", and Vercel serves from a case-sensitive
   filesystem where a space also has to be encoded. */
const punishSlug=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,'-')
  .replace(/^-|-$/g,'');
const PUNISH_PIC={
  'beer-pour':'beer-pour.png',
  'fast-banana':'fast-banana.png',
  'franchise-rebrand':'franchise-rebrand.png',
  'fruit-pledge':'fruit-pledge.png',
  'hot-chip':'hot-chip.png',
  're-enactment':'re-enactment.png',
  'willem-dafoe':'willem-dafoe.png',
  /* the doctrine's own spellings: "Hot & Spicy" slugs to hot-spicy, and
     "The Re-enactment" keeps its article */
  'hot-spicy':'hot-chip.png',
  'hot-and-spicy':'hot-chip.png',
  'the-re-enactment':'re-enactment.png',
  /* names config used before the doctrine was written in */
  'spicy-food':'hot-chip.png',
  'willem-defoe':'willem-dafoe.png',
  'reenactment':'re-enactment.png',
};
/* THE REAL SIZE OF EACH DRAWING.

   An img with no width and height is two pixels tall until it decodes, so
   everything under it jumps down when the file lands. Handing the browser the
   intrinsic size lets it work out the aspect ratio and reserve the right box up
   front — which is also what lets the picture be its own shape rather than
   sitting letterboxed inside a fixed frame.

   Read off the PNG headers, not typed by hand. */
/* What the featured drawing is allowed to grow to. Whichever of the two binds
   first wins, so shapes stay comparable without any being cropped or padded. */
const PUNISH_PIC_MAX_W=178, PUNISH_PIC_MAX_H=132;
const PUNISH_PIC_SIZE={
  'fast-banana.png':[683,384],
  'hot-chip.png':[683,384],
  'willem-dafoe.png':[683,384],
  'beer-pour.png':[812,816],
  'franchise-rebrand.png':[812,816],
  'fruit-pledge.png':[812,816],
  're-enactment.png':[812,816],
};
/* [width,height] of the drawing for a punishment, or null if it has none */
const punishPicSize=n=>{
  const f=PUNISH_PIC[punishSlug(n)];
  return (f&&PUNISH_PIC_SIZE[f])||null;
};
const punishPic=n=>{
  const f=PUNISH_PIC[punishSlug(n)];
  return f?'/punish/'+f:null;
};
/* THE ICON FOR A PUNISHMENT, WHEREVER IT IS NAMED.

   Slugged like the pictures, so config decides the spelling and everything
   follows. Keyed on the exact lowercased name before, which meant renaming
   "Spicy Food" to "Hot & Spicy" in config silently dropped the icon for a
   gavel — the map is one of the things that has to move when the names do.

   The artwork is deliberately NOT here. It shows once, as the featured image on
   the Punishments tab; every other place a punishment is named — the menu tiles,
   the schedule table, the pinned bar, the homepage — uses the icon. */
const PUNISH_ICON={
  'beer-pour':'fa-beer-mug-empty',
  'fruit-pledge':'fa-apple-whole',
  'willem-dafoe':'fa-masks-theater',
  'hot-spicy':'fa-pepper-hot',
  'fast-banana':'fa-person-running',
  'franchise-rebrand':'fa-tag',
  'the-re-enactment':'fa-clapperboard',
  /* earlier config spellings, kept so a revert does not lose the icon */
  'hot-and-spicy':'fa-pepper-hot',
  'spicy-food':'fa-pepper-hot',
  'hot-chip':'fa-pepper-hot',
  'willem-defoe':'fa-masks-theater',
  'reenactment':'fa-clapperboard',
};
const punishIcon=(n,fallback)=>PUNISH_ICON[punishSlug(n)]||fallback||'fa-gavel';
const punishIconHTML=(n,fallback)=>`<i class="fa ${punishIcon(n,fallback)}"></i>`;
function homePunishHTML(){
  const cfg=_CFG.punishment||{};
  if(!cfg.name && cfg.week==null) return '<div class="tab-loading" style="padding:22px">No punishment set this week.</div>';
  return `<div class="home-punish">
    <div class="home-punish-ic">${punishIconHTML(cfg.name)}</div>
    <div class="home-punish-info">
      <div class="home-punish-week">Week ${cfg.week??'—'} Punishment</div>
      <div class="home-punish-name">${cfg.name||'TBD'}</div>
    </div>
    <button class="home-punish-more" onclick="switchTab('punishment')">Details <i class="fa fa-arrow-right"></i></button>
  </div>`;
}
/* The Punishments tab. Everything the Details sheet used to hold — the picked
   punishment, its write-up and the tappable menu — plus the season schedule
   under it. punishRulesHTML() is shared with nothing else now, but it stays a
   separate function because selectPunish() repaints only that half when you
   tap through the menu. */
function renderPunishment(){
  const el=document.getElementById('punishment-body'); if(!el) return;
  const cfg=_CFG.punishment||{};
  if(!cfg.name && cfg.week==null){
    el.innerHTML='<div class="tab-loading" style="padding:22px">No punishment set this week.</div>';
    return;
  }
  el.innerHTML=`
    <div class="sec"><div class="sec-head"><i class="fa fa-gavel"></i>This Week</div>
      <div id="punish-rules-body">${punishRulesHTML()}</div></div>
    <div class="sec"><div class="sec-head"><i class="fa fa-calendar-days"></i>Season Schedule</div>
      ${punishScheduleHTML()}</div>`;
}
/* Weeks 1 to 14 and what is on the line each one. The current week — the one
   punishment.week names — is outlined rather than filled, so it reads as
   "you are here" without competing with the row content. */
function punishScheduleHTML(){
  const cfg=_CFG.punishment||{};
  const sch=cfg.schedule||{};
  const cur=Number(cfg.week);
  const rows=[];
  for(let w=1;w<=14;w++){
    const name=String(sch[w]||'').trim();
    const l=name.toLowerCase();
    const on=w===cur;
    rows.push(`<div class="ps-row${on?' ps-now':''}">
      <span class="ps-wk">Week ${w}</span>
      <span class="ps-name${name?'':' ps-tbd'}">
        <i class="fa ${name?punishIcon(name,'fa-circle'):'fa-minus'}"></i>${name||'TBD'}</span>
      ${on?'<span class="punish-tag">THIS WEEK</span>':''}
    </div>`);
  }
  /* The instruction is for whoever edits the file, and the league is not
     that person — an unfilled week already reads TBD, which says the same
     thing to them without handing them a filename. */
  return `<div class="ps-list">${rows.join('')}</div>
    ${isTestProfile()?`<div class="ps-note">Set each week under <b>punishment.schedule</b> in config.js.</div>`:''}`;
}

/* Which punishment the tab is showing. Reset to this week's on every render,
   so it never remembers a previous browse. */
let _prSel=null;
function selectPunish(name){ _prSel=name; const b=document.getElementById('punish-rules-body'); if(b) b.innerHTML=punishRulesHTML(); }
function punishRulesHTML(){
  const cfg=_CFG.punishment||{};
  const week=cfg.name||'';
  const sel=_prSel||week;                       // defaults to this week's
  const selL=sel.toLowerCase(), curL=week.toLowerCase();
  const opts=cfg.options||[];
  const detail=(cfg.details||{})[sel] || (selL===curL?cfg.note:'') || '';
  /* One column, centred: the drawing, then which week it is, then the name,
     then the write-up. It read as a header bar with a picture bolted under it
     and a left-aligned paragraph under that, which is three different
     alignments in one card. The icon stands in when a punishment has no
     drawing, so the block never opens on a gap. */
  const pic=punishPic(sel);
  return `
    <div class="pr-feat">
      ${pic
        ? (()=>{
            /* SIZED IN PIXELS, FROM THE FILE'S OWN DIMENSIONS.

               Each drawing keeps its own shape, so no two are the same box and
               nothing is letterboxed. The numbers are worked out here rather
               than left to CSS because a width and a height in the markup are
               what reserve the space: with only a max in the stylesheet the
               browser has nothing to go on until the file decodes, gives the
               img a two pixel box, and everything under it jumps when the
               picture lands. Capped at 178 wide and 132 tall, whichever binds
               first, which is where the four square cards and the three 16:9
               ones both end up looking the same weight. */
            const d=punishPicSize(sel);
            if(!d) return `<img class="pr-art-img" src="${pic}"
              alt="${String(sel).replace(/"/g,'&quot;')}">`;
            const k=Math.min(PUNISH_PIC_MAX_W/d[0],PUNISH_PIC_MAX_H/d[1],1);
            const w=Math.round(d[0]*k), h=Math.round(d[1]*k);
            return `<img class="pr-art-img" src="${pic}" width="${w}" height="${h}"
              style="width:${w}px;height:${h}px"
              alt="${String(sel).replace(/"/g,'&quot;')}">`;
          })()
        : `<div class="pr-ic">${punishIconHTML(sel)}</div>`}
      <div class="pr-week">${selL===curL?`Week ${cfg.week??'?'} Punishment`:'From the menu'}</div>
      <div class="pr-name">${sel||'TBD'}</div>
      <p class="pr-note${detail?'':' pr-empty'}">${detail
        ||(isTestProfile()?'No description written for this one yet. Add it under <b>punishment.details</b> in config.js.'
                          :'No description written for this one yet.')}</p>
    </div>
    <!-- "How it works" is deliberately not rendered: it was the bulk of the
         sheet's height and pushed it past the screen on an installed home-screen
         icon. cfg.rules is left in config so it can come back if wanted. -->
    <div class="pr-rules">
      <div class="pr-h">The menu, tap any to read it</div>
      ${(() => {
        /* This week's punishment leads at full width; the rest sit under it in
           a 2x3 grid. Built by pulling the current one out of the list rather
           than assuming it is first, so reordering config cannot break it. */
        const tile=(o,big)=>{const l=o.toLowerCase();
          return `<button class="punish-opt pr-pick${big?' pr-big':''}${l===selL?' active':''}"
            onclick="selectPunish(${JSON.stringify(o).replace(/"/g,'&quot;')})">
            ${punishIconHTML(o,'fa-circle')}<span>${o}</span>
            ${l===curL?'<span class="punish-tag">THIS WEEK</span>':''}</button>`;};
        const lead=opts.find(o=>o.toLowerCase()===curL);
        const rest=opts.filter(o=>o.toLowerCase()!==curL);
        if(!opts.length) return '<div class="pr-note">No options set.</div>';
        return `${lead?tile(lead,true):''}
          <div class="punish-menu pr-grid">${rest.map(o=>tile(o,false)).join('')}</div>`;
      })()}
    </div>`;
}
/* The overlay only covers the viewport, so leaving the page scrollable behind
   it slides the dimmed content around under a fixed sheet. Same lock the nav
   drawer uses. */
/* overflow:hidden alone does not hold here — the phone rules set
   body{overflow-y:visible!important} and the page scrolls straight through it.
   Pinning body and offsetting it by the current scroll is what actually stops
   the page, and it restores the position on close.

   Used by the coaching-metric modal (cmModalShow / closeCMModalDirect). Do not
   declare a second function by this name: two top-level declarations resolve to
   whichever is later in the file, silently, and the loser's callers end up in
   the winner's other branch. */
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

// ── GABE'S GREATNESS ─────────────────────────────────────────────────────────
let _gabeGames=null,_gabePromise=null,_gabeView='started';
function gabeHeart(pid){
  const url=proxyLogo(headshotURL(pid,200));    // the shrine draws it big
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
/* Gabe is done playing, so his book is closed. The 43 games are committed to
   the repo as /data/gabe.json rather than gathered from five separate ESPN
   calls every time somebody opens the section — which also means the section
   still works for a season ESPN has since purged. The live path is kept only
   as a fallback for a missing file; nothing about it should need to run. */
async function loadGabe(pid){
  if(_gabeGames) return _gabeGames;
  if(_gabePromise) return _gabePromise;
  _gabePromise=(async()=>{
    try{
      const r=await fetch('/data/gabe.json');
      if(r.ok){ const j=await r.json();
        if(j&&Array.isArray(j.games)&&j.games.length) return (_gabeGames=j.games); }
    }catch(e){}
    const res=await Promise.allSettled(ALL_SEASONS.map(async s=>{
      const r=await fetch(`${BASE}?type=playergames&seasonId=${s}&playerId=${pid}`);
      return r.ok?{s,d:await r.json()}:null;
    }));
    const all=[];
    res.forEach(rr=>{if(rr.status!=='fulfilled'||!rr.value)return;const {s,d}=rr.value;(d.games||[]).forEach(g=>all.push({...g,season:s}));});
    _gabeGames=all; return all;
  })();
  return _gabePromise;
}
function setGabeView(v){_gabeView=v;renderGabe();}
async function renderGabe(){
  const body=document.getElementById('gabe-body'), mon=document.getElementById('gabe-monument');
  if(!body) return;
  const cfg=_CFG.gabe||{}; const pid=cfg.playerId||4243537;
  if(mon) mon.innerHTML=gabeHeart(pid);
  if(!_gabeGames){ body.innerHTML=`<div class="tab-loading"><i class="fa fa-circle-notch"></i>Opening the Gabe Davis file…</div>`; }
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
      if(!postGameCounts(s,m)) return;                     // dead consolation game
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
      /* Biggest Enemies lives on Player Data now. Only the team profile was
         being repainted here, so the table sat on "Loading" until a tab switch
         forced a fresh render. */
      if(_activeTab==='teams'&&document.getElementById('prof-enemies')) renderProfile();
      if(document.getElementById('tenure-enemies')) try{ renderTenureEnemies(); }catch(e){}
    });
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
/* The ribbon and the scroll rail take the Coaches' Poll accent — the module
   directly under the video — rather than cycling a palette, so the top of the
   homepage reads as one colour. Keep this in step with #page-home .mod-cp's
   --accent in the stylesheet. NEW_VID_COLORS is left in place if the rotation
   is ever wanted back. */
function newVideoColor(){ return '#f09a4a'; }

/* The carousel's markup. Built here rather than inline in the homepage
   template because the track is no longer just the slides: each one is wrapped
   in a cell, and the two ends are copies of the opposite end so the thing loops.

   The cell exists because the slide is the snap target and the slide is also
   what gets scaled — and a transformed box moves its own snap position, so the
   target kept sliding out from under the browser as you scrolled. That is why
   it could come to rest between two videos. The cell holds the snap and stays
   still; everything inside it moves. */
function vidCarouselHTML(){
  const nv=newVideoColor();
  const esc=t=>String(t).replace(/"/g,'&quot;');
  const rest=_videos.slice(1,3);
  const slides=[
    {t:_videos[0].title,
     h:`<div class="vid-wrap"><span class="vid-new">New video</span>
          <div class="video-featured">${videoLinkHTML(_videos[0].videoId)}</div></div>`},
    /* the thumbs open the video on YouTube rather than swapping the embed —
       the featured player stays playable in place */
    ...rest.map(v=>({t:v.title,
     h:`<a class="video-thumb" href="https://www.youtube.com/watch?v=${v.videoId}" target="_blank" rel="noopener" data-vid="${v.videoId}" title="${esc(v.title)}"><img src="${v.thumb||`https://i.ytimg.com/vi/${v.videoId}/mqdefault.jpg`}" alt="" loading="eager" decoding="async"/><span class="vid-out"><i class="fa-brands fa-youtube"></i></span><div class="video-thumb-title">${v.title}</div></a>`})),
    {t:'Ball &amp; Chain Youtube Channel',
     h:`<a class="vid-ch" href="https://www.youtube.com/channel/${YT_CHANNEL_ID}" target="_blank" rel="noopener">
          <i class="fa-brands fa-youtube"></i><span>Visit the channel</span><i class="fa fa-arrow-right vid-ch-a"></i></a>`}
  ];
  const n=slides.length;
  /* Two full passes of the ring, not one pass with a copy bolted on each end.
     Every cell is a real slide and the DOM order repeats — which is what lets
     the track rotate a cell at a time without any of them being re-pointed at
     different content. data-i is the slide it holds; it moves with the cell, so
     the mark stays right however far the ring has turned.

     Nothing is inert any more. The copies had to be, because the featured slide
     carried #vfeat and a second one would have sent the player to whichever
     came first — and the in-page player is gone, so the id went with it. Every
     slide takes a tap now, wherever in the ring it happens to be. */
  const cell=sl=>`<div class="vid-cell" data-i="${slides.indexOf(sl)}" data-t="${esc(sl.t)}">
      <div class="vid-inner">${sl.h}</div></div>`;
  return `<div class="vid-scroll" style="--nv:${nv}" data-n="${n}">
      ${[...slides,...slides].map(cell).join('')}
    </div>
    ${''/* The caption wears the ribbon when it is captioning the video the
           ribbon is on. It opens on that slide, so it opens wearing it. */}
    <div class="vid-title on newest" id="vid-title" style="--nv:${nv}">${slides[0].t}</div>
    <div class="vid-dots" id="vid-dots" style="--nv:${nv}">${
      slides.map((_,i)=>`<button class="vid-dot${i?'':' on'}" onclick="vidGo(${i})"
        aria-label="Video ${i+1}"></button>`).join('')}</div>`;
}

/* Everything the carousel does once it is on the page: the depth that makes it
   read as a carousel, the mark that says where you are, the caption under it,
   and the ring that keeps it turning.

   A waiting slide only has to read as behind, not as a thumbnail. Most of the
   separation comes from the dimming; the shrink is a nudge on top of it. */
const VID_FOCUS_SCALE=0.06;   // how far a waiting slide shrinks
const VID_FOCUS_FADE=0.45;    // and how far it dims
/* Pulled toward the middle as a share of its own width. Layout leaves a
   neighbour clear of the slide in focus; this is what closes that and carries
   it a little further, so it passes under rather than stopping alongside. */
const VID_TUCK=0.14;
function wireVidRail(){
  const sc=document.querySelector('.vid-scroll'), dots=document.getElementById('vid-dots');
  const cap=document.getElementById('vid-title');
  if(!sc||!dots||sc.dataset.railed) return;
  sc.dataset.railed='1';
  const n=+sc.dataset.n||1;                 // distinct videos
  /* The ring is kept turned so the slide in focus sits here. Index n of 2n
     leaves the whole first pass behind it and most of the second ahead, and it
     is the position where slide 0 has slide n-1 — the channel card — on its
     left, which is where the carousel opens. */
  const CENTER=n;
  const cells=()=>[...sc.children];
  const pitch=()=>{const l=cells();
    return l.length>1?l[1].offsetLeft-l[0].offsetLeft:l[0].offsetWidth;};
  /* Centre to centre. A slide snaps to the middle of the track, and the
     distance from the left edge is not the same thing: the panel's own padding
     sits in between, and it would show up as the slide never quite reaching
     focus. offsetLeft on the cells and on the track share an offsetParent, so
     the two are already in the same coordinates. */
  const mid=()=>sc.offsetLeft+sc.scrollLeft+sc.clientWidth/2;
  const focus=()=>{
    const list=cells(), w=pitch(); if(!list.length||!w) return;
    const m=mid();
    list.forEach(el=>{
      const d=(el.offsetLeft+el.offsetWidth/2-m)/w;   // 0 = in focus, ±1 = its neighbours
      const k=Math.min(Math.abs(d),1);
      /* On the cell's contents, never on the cell. The cell is the snap target,
         and a transform on a snap target moves the position the browser is
         trying to snap to — which is what let the track come to rest halfway
         between two videos however mandatory the snapping was. */
      const inner=el.firstElementChild; if(!inner) return;
      /* Toward the middle, whichever side it is on: -d is negative for the
         slide on the right and positive for the one on the left. Capped with k
         so slides further out do not keep piling inward. */
      const tuck=(-Math.sign(d)*k*VID_TUCK*w).toFixed(1);
      inner.style.transform=`translateX(${tuck}px) scale(${(1-k*VID_FOCUS_SCALE).toFixed(4)})`;
      inner.style.opacity=(1-k*VID_FOCUS_FADE).toFixed(3);
      el.style.zIndex=String(10-Math.round(k*9));
    });
  };
  /* Which cell the carousel is over. Same centre-to-centre distance the scaling
     uses, so the mark, the caption and the slide in focus cannot disagree. */
  const nearest=()=>{
    const list=cells(); const m=mid();
    let best=0,bd=Infinity;
    list.forEach((el,i)=>{
      const dist=Math.abs(el.offsetLeft+el.offsetWidth/2-m);
      if(dist<bd){ bd=dist; best=i; }
    });
    return best;
  };
  let shown=-1;
  const mark=()=>{
    const cur=cells()[nearest()]; if(!cur) return;
    const r=+cur.dataset.i;
    [...dots.children].forEach((d,i)=>d.classList.toggle('on',i===r));
    if(cap&&r!==shown){
      shown=r;
      /* Out, then in on the new one. The text is swapped while it is invisible
         so the two titles never cross-fade into each other. */
      cap.classList.remove('on');
      clearTimeout(cap._t);
      cap._t=setTimeout(()=>{
        const src=cells()[nearest()];
        if(src) cap.innerHTML=src.dataset.t||'';
        /* swapped while the caption is invisible, along with the text, so the
           bar does not change colour under a title it no longer belongs to */
        cap.classList.toggle('newest',(+((src||{}).dataset||{}).i||0)===0);
        cap.classList.add('on');
      },170);
    }
  };
  const draw=()=>{ focus(); mark(); };
  /* The transition on the slides is for settling after a snap. During a drag
     it would lag the finger, so the frame-by-frame updates turn it off and the
     scroll settling puts it back for the snap that follows. */
  let moving=null;
  sc.addEventListener('scroll',()=>{
    if(moving===null) sc.classList.add('vid-dragging');
    clearTimeout(moving);
    moving=setTimeout(()=>{ sc.classList.remove('vid-dragging'); moving=null; settled(); },260);
    draw();
  },{passive:true});
  /* The ring may only be turned between gestures. A finger resting mid-drag
     stops the scroll events, and on a short timer that counts as settled — so
     the track would be re-seated while it was still being held. scrollend is
     the real signal; the timer is only a floor under browsers that do not fire
     it, and both are ignored while a finger is down. */
  let held=false;
  sc.addEventListener('touchstart',()=>{ held=true; },{passive:true});
  sc.addEventListener('touchend',()=>{ held=false; settled(); },{passive:true});
  sc.addEventListener('touchcancel',()=>{ held=false; },{passive:true});
  sc.addEventListener('scrollend',settled);
  function settled(){ if(!held) recentre(); }
  window.addEventListener('resize',draw);
  seat(CENTER);
  draw();

  /* Turning the ring, one cell at a time.

     The old wrap waited until you reached a copy on the end and then threw the
     track a thousand pixels to the matching real slide. The images were loaded
     by then, but the browser had never rasterised that stretch of the track, so
     whatever landed next to you arrived blank and painted a beat later — which
     is the delay on the slide to the left, and again on the slide to the right
     coming back.

     Nothing is thrown now. One cell is taken off the far end and put on the
     other, and the scroll is moved by exactly one slide to cancel it out. On
     screen nothing happens at all: the same three slides stay exactly where
     they were, and the cell that moved was off the edge before and after. What
     comes into view next is always the cell that was already sitting just
     outside it — near enough that the browser has it painted. */
  function recentre(){
    const w=pitch(); if(!w) return;
    /* Bounded by the ring's own length: if a measurement is ever off, this
       stops rather than shuffling cells forever. */
    for(let guard=cells().length;guard--;){
      const i=nearest();
      if(i===CENTER) break;
      if(i>CENTER){ sc.appendChild(sc.firstElementChild); sc.scrollLeft-=w; }
      else { sc.insertBefore(sc.lastElementChild,sc.firstElementChild); sc.scrollLeft+=w; }
    }
    draw();
  }
  function seat(i){
    const el=cells()[i]; if(!el) return;
    el.scrollIntoView({inline:'center',block:'nearest',behavior:'instant'});
  }
  /* Tapping a mark. Turned rather than measured: the ring is rotated until the
     slide asked for is the one at the centre, and then the centre is seated.
     Working out which cell to scroll to instead meant reading the current
     position, and a tap can land while the previous re-seat is still settling —
     which had it jumping to the wrong video about half the time. Nothing here
     reads the scroll at all, so there is nothing to be stale. */
  sc._go=i=>{
    for(let guard=cells().length;guard--;){
      if(+cells()[CENTER].dataset.i===i) break;
      sc.appendChild(sc.firstElementChild);
    }
    seat(CENTER);
    draw();
  };
}
/* The marks call this from their onclick, so it has to be global; the work
   itself belongs to the carousel and lives on it. */
function vidGo(i){ document.querySelector('.vid-scroll')?._go?.(i); }

/* ── ROSTER ─────────────────────────────────────────────────────────────────
   The signed-in team's current lineup, taken from the live roster for the week
   on the clock. Starters first in slot order, then the bench. */
const SLOT_NAMES={0:'QB',2:'RB',3:'RB/WR',4:'WR',5:'WR/TE',6:'TE',7:'OP',16:'D/ST',17:'K',
  20:'BE',21:'IR',23:'FLEX',24:'ER'};
const BENCH_SLOTS=[20,21,24];
/* The order a lineup is read in: passer, runners, receivers, tight end, the
   flex spots, then the two that are not people you drafted for their name. */
const SLOT_ORDER=[0,2,3,4,5,6,7,23,16,17];
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
/* ── Formation view ─────────────────────────────────────────────────────────
   The starters laid out as an offence rather than a list: receivers split wide,
   the flex in the slot beside the tight end, the quarterback behind them and
   both backs in the backfield, with the defence and kicker on their own row.

   Positions are percentages of the field box so it scales with the screen. Each
   spot is filled from the roster by lineup slot, taking players in the order
   ESPN returns them, and any spot with nobody in it stays an empty ring — which
   is the whole board before a draft. */
/* The line of scrimmage: receivers, tight end and the five linemen all sit on
   it, which is what makes it read as a formation rather than scattered spots.
   The quarterback lines up directly behind the centre. */
/* ESPN's own position colours, which is what everyone already reads a fantasy
   roster by. Used as a wash behind each card rather than as a fill, so twelve
   of them on one board still look like a team sheet. */
/* Slots that ARE a position, so an empty one still knows its colour. Every
   other slot — flex, RB/WR, WR/TE, OP, bench, IR — says nothing about the
   player in it, so those take the player's own position instead. */
const SLOT_TO_POS={0:1,2:2,4:3,6:4,16:16,17:5};
/* The same position palette the draft board uses, keyed by ESPN's own
   defaultPositionId rather than by lineup slot. Two ids for the same idea is a
   trap worth naming: POS_COLORS above is keyed by SLOT (0 QB, 2 RB, 4 WR,
   6 TE, 17 K), this one by POSITION (1 QB, 2 RB, 3 WR, 4 TE, 5 K). They
   overlap on 2 and 4 and mean different things there.

   Text and a wash behind it, which is what makes a slot label read as a
   position at a glance instead of as twelve identical green words. */
const POS_PILL={1:['#ff9ecb','#4a1f36'],2:['#ffb066','#4a2c12'],3:['#79c0ff','#12324d'],
  4:['#5fe0c0','#123f39'],5:['#c2a8ff','#362a52'],16:['#f2d75e','#453f0f']};
const posPill=ppos=>POS_PILL[ppos]||['#8A98A8','rgba(255,255,255,0.06)'];
/* A card takes the colour of the player in it. The two id spaces are the trap
   this used to fall into: a lineup slot and a default position are both small
   integers and they collide — 2 is RB in both, but 4 is the WR *slot* and the
   TE *position*, which is why a tight end on IR came out receiver blue and a
   quarterback on the bench came out grey. One map, one direction, one space. */
const posColor=(slot,ppos)=>
  (POS_PILL[SLOT_TO_POS[slot]!=null?SLOT_TO_POS[slot]:ppos]||['#8A98A8'])[0];
/* The field, its five drawn-but-never-filled linemen and the row of cards that
   sat under it are gone — LINEUP_ORDER replaced all of it. What survives is the
   bench, which was never part of the diagram. */
/* Five on the bench and one on IR, in a row of their own under the starters.
   Drawn from the same board rather than listed separately, because who is
   sitting is part of reading a lineup. */
const FORMATION_BENCH=[
  {k:'BN',slot:20},{k:'BN',slot:20},{k:'BN',slot:20},
  {k:'BN',slot:20},{k:'BN',slot:20},{k:'IR',slot:21,ir:true},
];
/* The last word is not the last name: "Brian Thomas Jr." is Thomas, and
   "Marvin Harrison Jr." is Harrison. Suffixes come off first. */
const FM_SUFFIX=/^(jr|sr|ii|iii|iv|v)\.?$/i;
function lastNameOf(n){
  const parts=String(n||'').trim().split(/\s+/);
  while(parts.length>1&&FM_SUFFIX.test(parts[parts.length-1])) parts.pop();
  return parts[parts.length-1]||'';
}
/* ── THE LINEUP, TOP TO BOTTOM ───────────────────────────────────────────────
   The field is gone. A formation diagram is a fine thing to look at once and a
   poor thing to read: it puts the quarterback below the receivers because that
   is where he stands, which is not the order anyone thinks about a lineup in,
   and it leaves no room beside a player for anything about him.

   So: one spot per line, in the order the lineup is actually set — the passer,
   the backs, the receivers, the tight end, the flex, then the two units that
   score on their own. Bench and IR keep the card row they had; that is a
   holding pen rather than a lineup, and reading it as a grid is right.

   Tapping a starter opens him. On a wide screen the panel takes the right half
   and the lineup keeps the left; on a phone there is no right half, so it
   opens directly under the player tapped and the lineup stays where it was.
   Same markup either way — the panel sits inline in source order and the
   desktop grid lifts it into the second column, so nothing has to be moved
   about or re-rendered when the window changes size. */
const LINEUP_ORDER=[
  {slot:0,  k:'QB'},
  {slot:2,  k:'RB'},  {slot:2,  k:'RB'},
  {slot:4,  k:'WR'},  {slot:4,  k:'WR'},
  {slot:6,  k:'TE'},
  {slot:23, k:'FLEX'},
  {slot:16, k:'D/ST'},
  {slot:17, k:'K'},
];
let _rsPick=null;                    // pid of the starter whose panel is open
function rsSelect(pid){
  _rsPick=(String(_rsPick)===String(pid))?null:String(pid);
  renderRoster();
  /* on a phone the panel opens below the row, which may be off screen */
  setTimeout(()=>{ const el=document.querySelector('.rs2-panel');
    if(el&&_rsPick&&!matchMedia('(min-width:760px)').matches)
      el.scrollIntoView({block:'nearest',behavior:'smooth'}); },60);
}
function formationHTML(rows){
  const pool={};
  (rows||[]).filter(p=>!p.bench).forEach(p=>{ (pool[p.slot]||(pool[p.slot]=[])).push(p); });
  const take=slot=>(pool[slot]&&pool[slot].shift())||null;
  const num=v=>v==null?'—':Number(v).toFixed(1);
  const line=(f,i)=>{
    const p=take(f.slot);
    const col=posColor(f.slot,p&&p.ppos);
    const on=p&&String(_rsPick)===String(p.pid);
    const row=`<div class="rs2-row${p?'':' empty'}${on?' on':''}" style="--pc:${col};--r:${i+1}"
      ${p?`role="button" tabindex="0" onclick="rsSelect('${p.pid}')"
        onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();rsSelect('${p.pid}');}"`:''}>
      <span class="rs2-slot">${f.k}</span>
      <span class="rs2-face">${p?playerImg(p.pid,34,p.n):'<i class="fa fa-user-slash"></i>'}</span>
      <span class="rs2-who">
        <span class="rs2-n">${p?p.n:'Empty'}</span>
        <span class="rs2-sub">${p?(POS_NAMES[p.ppos]||''):'nobody here yet'}</span>
      </span>
      <span class="rs2-pts">${p?num(p.proj):''}<span class="rs2-pl">proj</span></span>
      ${p?`<i class="fa fa-chevron-${on?'up':'down'} rs2-c"></i>`:''}
    </div>`;
    return row+(on?`<div class="rs2-panel">${rsPanelHTML(p)}</div>`:'');
  };
  /* Each row carries its own grid row, used only by the desktop layout: the
     panel is pinned to row 1 of the second column, and without explicit rows
     the auto-placer will not put anything beside it — the quarterback ended up
     alone in a row as tall as the panel, with a hole under him. */
  const lineup=LINEUP_ORDER.map((f,i)=>line(f,i)).join('');
  /* the bench draws from the players the starters did not take */
  const benchPool={};
  (rows||[]).filter(p=>p.bench).forEach(p=>{ (benchPool[p.slot]||(benchPool[p.slot]=[])).push(p); });
  const takeBench=slot=>(benchPool[slot]&&benchPool[slot].shift())||null;
  const card=(f,p,cls)=>{
    const col=posColor(f.slot,p&&p.ppos);
    return `<div class="fm-card ${cls}${p?' on':''}" style="--pc:${col}"
      title="${p?String(p.n).replace(/"/g,'&quot;'):f.k+' — empty'}">
      <span class="fm-lbl">${f.sub||f.k}</span>
      <span class="fm-nm">${p?lastNameOf(p.n):''}</span>
      <span class="fm-ring">${p?playerImg(p.pid,40,p.n):''}</span>
    </div>`;
  };
  const bench=FORMATION_BENCH.map(f=>{
    const p=takeBench(f.slot);
    return card(f,p,'fm-bn'+(f.ir?' fm-ir':''));}).join('');
  const filled=(rows||[]).filter(p=>!p.bench).length;
  return `<div class="fm-wrap">
    <div class="rs2">${lineup}</div>
    <div class="rs2-bh">Bench</div>
    <div class="fm-benchrow">${bench}</div>
    ${filled?'':'<div class="fm-empty">Every spot opens up once the draft is done.</div>'}
  </div>`;
}
/* ── WHAT THERE IS TO SAY ABOUT ONE PLAYER ───────────────────────────────────
   Everything here is already on hand for other reasons — the NFL pool Ball
   Knowledge is built on, the projection table the player markets price off,
   the committed bios file, and the weekly line fetched one player at a time.
   Nothing new is asked of ESPN to open a panel.

   The insights are the things a season total will not tell you: where he ranks
   at his own position rather than in the abstract, what his floor and ceiling
   have actually been, and how far his weeks scatter. A fifteen point average
   made of fifteens is a different asset from one made of fives and twenty
   fives, and only one of them is safe in a lineup you cannot change. */
function rsPanelHTML(p){
  if(!p) return '';
  const pool=(typeof _bkPool!=='undefined'&&_bkPool)?_bkPool:null;
  const rec=pool?pool.find(x=>String(x.id)===String(p.pid)):null;
  const bio=(_bkBios||{})[String(p.pid)]||null;
  const proj=(sbPlayerProj(invWeekNow())||{})[String(p.pid)]||null;
  const rank=rec?bkRankOf(rec):null;
  const posN=POS_NAMES[p.ppos]||'';
  const nflTeam=rec?(NFL_FULL[bkTeamOf(rec)]||bkTeamOf(rec)||''):'';
  const wk=bkWeekly(p.pid);                       // fetched once, then cached
  const weeks=wk?Object.keys(wk).map(Number).sort((a,b)=>a-b):[];
  const vals=weeks.map(w=>Number(wk[w])||0);
  const n=vals.length;
  const avg=n?vals.reduce((a,b)=>a+b,0)/n:null;
  const hi=n?Math.max(...vals):null, lo=n?Math.min(...vals):null;
  const sd=n>1?Math.sqrt(vals.reduce((a,v)=>a+(v-avg)*(v-avg),0)/n):null;
  /* Boom and bust are the two ends anyone actually cares about: how often he
     carried a week on his own, and how often he cost you one. */
  const boom=n?vals.filter(v=>v>=20).length:null;
  const bust=n?vals.filter(v=>v<8).length:null;
  const stat=(l,v,c)=>`<div class="rs2-s"><span class="rs2-sl">${l}</span>
    <span class="rs2-sv"${c?` style="color:${c}"`:''}>${v}</span></div>`;
  const spark=n>1?bkGraphSVG(weeks.slice(-6).map(w=>({v:Number(wk[w])||0}))):'';
  return `<div class="rs2-p">
    <div class="rs2-ph">
      ${playerImg(p.pid,44,p.n)}
      <div class="rs2-phi">
        <div class="rs2-pn">${p.n}</div>
        <div class="rs2-ps">${[posN&&rank?`${posN}${rank}`:posN,nflTeam].filter(Boolean).join(' · ')||'—'}</div>
      </div>
    </div>
    <div class="rs2-grid">
      ${stat('This week',proj&&proj.wk!=null?Number(proj.wk).toFixed(1):'—')}
      ${stat('Season',rec&&rec.total!=null?Number(rec.total).toFixed(1):'—')}
      ${stat('Per game',avg!=null?avg.toFixed(1):'—')}
      ${stat('Best',hi!=null?hi.toFixed(1):'—','var(--green)')}
      ${stat('Worst',lo!=null?lo.toFixed(1):'—','var(--red)')}
      ${stat('Swing',sd!=null?'±'+sd.toFixed(1):'—')}
    </div>
    ${n?`<div class="rs2-ins">
      <div class="rs2-i"><i class="fa fa-fire"></i>${boom} week${boom===1?'':'s'} over 20</div>
      <div class="rs2-i"><i class="fa fa-battery-empty"></i>${bust} under 8</div>
      <div class="rs2-i"><i class="fa fa-wave-square"></i>${
        sd==null?'—':sd<5?'Steady week to week':sd<9?'Some week-to-week swing':'Boom or bust'}</div>
    </div>`:'<div class="rs2-ins"><div class="rs2-i">No weekly line on file yet.</div></div>'}
    ${spark?`<div class="rs2-spark"><div class="rs2-sh">Last ${Math.min(6,n)} weeks</div>${spark}</div>`:''}
    ${bio?`<div class="rs2-bio">${[bio.college,bio.draftYear?`drafted ${bio.draftYear}`:''].filter(Boolean).join(' · ')}</div>`:''}
  </div>`;
}
/* ── A ROSTER TO LOOK AT ─────────────────────────────────────────────────────
   ESPN returns the twelve teams but no players until a draft has happened, so
   the board sits empty for the whole off-season. This fills it from the real
   NFL player pool — the same one Ball Knowledge is built on — picking the
   highest scorers at each position so the shapes and names are plausible.

   It is a stand-in and says so on the board. The moment ESPN returns actual
   entries this never runs again, because it only fires on an empty roster. */
function rosterDemoRows(){
  const pool=(typeof _bkPool!=='undefined'&&_bkPool)?_bkPool:null;
  if(!pool||!pool.length){ try{ bkLoadPool(); }catch(e){} return []; }
  const seen=new Set();
  const best=(pos,n)=>pool.filter(p=>p.pos===pos&&p.total>0&&!seen.has(p.id))
    .sort((a,b)=>b.total-a.total).slice(0,n)
    .map(p=>{ seen.add(p.id); return p; });
  /* one team's worth: a starting eleven and six on the bench */
  const plan=[
    [1,'QB',0,1],[2,'RB',2,2],[3,'WR',4,2],[4,'TE',6,1],
    [2,'RB',23,1],[16,'D/ST',16,1],[5,'K',17,1],
  ];
  const out=[];
  plan.forEach(([pos,label,slot,n])=>{
    best(pos,n).forEach(p=>out.push({pid:p.id,n:p.name,slot,ppos:p.pos,
      pos:SLOT_NAMES[slot]||label,pts:null,proj:+(p.total/17).toFixed(1),inj:'',bench:false}));
  });
  /* the bench: the next best at the skill positions, then one on IR */
  const bn=[...best(2,2),...best(3,2),...best(1,1)];
  bn.forEach(p=>out.push({pid:p.id,n:p.name,slot:20,ppos:p.pos,pos:'BE',
    pts:null,proj:+(p.total/17).toFixed(1),inj:'',bench:true}));
  const ir=best(4,1)[0];
  if(ir) out.push({pid:ir.id,n:ir.name,slot:21,ppos:ir.pos,pos:'IR',
    pts:null,proj:+(ir.total/17).toFixed(1),inj:'OUT',bench:true});
  return out;
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
          ppos:p.defaultPositionId??0,
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
  /* Before a draft the formation is the whole view — an empty board still says
     what the lineup is going to look like, which a "no roster yet" line does not. */
  if(!rows.length){
    const demo=rosterDemoRows();
    el.innerHTML=rosterPickerHTML()
      +(demo.length?`<div class="rs-demo"><i class="fa fa-flask"></i>
          No draft yet — this is a stand-in roster so the board can be seen.
          It disappears the moment real entries arrive.</div>`:'')
      +formationHTML(demo);
    return;
  }
  const num=v=>v==null?'—':Number(v).toFixed(1);
  const injTag=s=>!s||s==='ACTIVE'||s==='NORMAL'?'':
    `<span class="rs-inj ${/OUT|INJURY_RESERVE|IR|SUSPENSION/.test(s)?'bad':''}">${s.slice(0,3)}</span>`;
  /* The slot says where they are playing; the colour says what they are. That
     pairing is the whole point on a flex, a bench spot or an IR slot, where
     the label alone tells you nothing about the player. */
  const line=p=>`<div class="rs-row${p.bench?' rs-bench':''}">
      <span class="rs-slot" style="color:${posPill(p.ppos)[0]};background:${posPill(p.ppos)[1]}">${p.pos}</span>
      ${playerImg(p.pid,26,p.n)}
      <span class="rs-name">${p.n}${injTag(p.inj)}</span>
      <span class="rs-proj">${num(p.proj)}</span>
      <span class="rs-pts">${num(p.pts)}</span>
    </div>`;
  const starters=rows.filter(p=>!p.bench), bench=rows.filter(p=>p.bench);
  const tot=a=>a.reduce((s,p)=>s+(p.pts||0),0);
  const tn=(_teams.find(t=>String(t.id)===String(_rosterTeam))||{}).name||'';
  el.innerHTML=rosterPickerHTML()+formationHTML(rows)+`
    <div class="rs-head"><span>${tn} · Week ${week}</span><span class="rs-tot">${tot(starters).toFixed(1)} pts</span></div>
    <div class="rs-cols"><span class="rs-slot">Slot</span><span></span><span class="rs-name">Player</span>
      <span class="rs-proj">Proj</span><span class="rs-pts">Pts</span></div>
    ${starters.map(line).join('')}
    ${bench.length?`<div class="rs-sub">Bench</div>${bench.map(line).join('')}`:''}`;
}

/* ── THIS WEEK ──────────────────────────────────────────────────────────────
   The week on the clock at a glance: every matchup, and your own first. */
/* Your Forecast reads the live board, and the live board is pinned to the
   newest season on file whatever the nav says — liveWeekInfo() does not take a
   year. On any other season it would be describing this season's game under
   that season's heading, so it comes off the page entirely rather than being
   left there saying something untrue. The jump chip goes with it: the nav skips
   headings with no offsetParent. */
function fcOnLiveSeason(){
  return String(getSeason())===String(ALL_SEASONS[ALL_SEASONS.length-1]);
}
function renderWeek(){
  const live=fcOnLiveSeason();
  {const sec=document.getElementById('fc-sec'); if(sec) sec.hidden=!live;}
  if(live){
    const info=_liveInfo||liveWeekInfo();
    if(info) renderForecast(info);
    else { const el=document.getElementById('fc-body');
      if(el) el.innerHTML='<div class="tab-loading" style="padding:24px">No season data yet.</div>'; }
  }
  renderSchedule();
}
/* ── Forecast ───────────────────────────────────────────────────────────────
   Your game, read ahead rather than reported. Three parts: the line and what
   the ratings make of it, where the two lineups differ position by position,
   and what each result would do to your season.

   Positional strength is season points per game by lineup slot, so it says
   which parts of the matchup you are actually winning rather than repeating
   the headline number. Playoff implications come from the same simulation the
   Schedules page runs, re-run with the game forced each way — which is the
   only honest way to answer "what does this one game cost me". */
function fcSideStats(owner){
  const b=sbBuild(); const r=b&&b.rows.find(x=>x.owner===owner);
  return r||null;
}

/* ── A LINEUP TO COMPARE ─────────────────────────────────────────────────────
   ESPN hands back no roster entries until a league has drafted, so before the
   draft there is nothing to lay two lineups beside each other with. These are
   built from the real NFL player pool — the same one Ball Knowledge reads —
   so the names, positions and scoring are real even though the ownership is
   invented. Every team gets a different set: the seed is the team id, so a
   team's stand-in lineup is stable between renders and two teams never turn up
   with the same quarterback.

   It disappears the moment ESPN returns actual entries. Everything drawn from
   it is labelled as a stand-in wherever it appears. */
const FC_LINEUP=[[1,'QB',0],[2,'RB',2],[2,'RB',2],[3,'WR',4],[3,'WR',4],
  [4,'TE',6],[2,'FLEX',23],[16,'D/ST',16],[5,'K',17]];
function fcDummyLineup(teamId){
  const pool=(typeof _bkPool!=='undefined'&&_bkPool)?_bkPool:null;
  if(!pool||!pool.length){ try{ bkLoadPool(); }catch(e){} return null; }
  /* a deterministic shuffle per team, so team 1 and team 7 draw from the same
     ranked pool without ever landing on the same player */
  let seed=(Number(teamId)||1)*7919+13;
  const rnd=()=>{ seed=(seed*1103515245+12345)&0x7fffffff; return seed/0x7fffffff; };
  const byPos={};
  [1,2,3,4,5,16].forEach(pos=>{
    byPos[pos]=pool.filter(x=>x.pos===pos&&x.total>0).sort((a,b)=>b.total-a.total).slice(0,36);
  });
  const taken=new Set();
  const pick=pos=>{
    const list=byPos[pos]||[];
    for(let i=0;i<40;i++){
      const c=list[Math.floor(rnd()*Math.min(list.length,24))];
      if(c&&!taken.has(c.id)){ taken.add(c.id); return c; }
    }
    return list.find(c=>!taken.has(c.id))||null;
  };
  const out=[];
  FC_LINEUP.forEach(([pos,label,slot])=>{
    const c=pick(pos);
    if(c) out.push({pid:c.id,n:c.name,pos:label,slot,ppos:pos,
      proj:+(c.total/17).toFixed(1),dummy:true});
  });
  return out.length===FC_LINEUP.length?out:null;
}
/* Real entries if there are any, a stand-in if there are not. sbRosters files
   an entry's position under `pos` and carries no projection, so the week's
   number comes from the same ESPN projection table the player markets price
   off. Starters only — the bench is not part of a matchup. */
function fcLineupFor(season,week,teamId){
  const r=sbRosters(season,week);
  const list=r&&r[teamId];
  if(list&&list.length){
    const starters=list.filter(e=>!BENCH_SLOTS.includes(e.slot));
    if(starters.length){
      const proj=sbPlayerProj(week)||{};
      /* the entry's own weekly projection first — it is the number ESPN shows
         beside that player in the app, for this week, on this roster */
      const wkOf=e=>(typeof e.wkProj==='number'&&e.wkProj>0)
        ? e.wkProj : ((proj[String(e.pid)]||{}).wk??null);
      const out=starters.map(e=>({pid:e.pid,n:e.n||pName(e.pid),pos:SLOT_NAMES[e.slot]||'',
        slot:e.slot,ppos:e.pos,proj:wkOf(e),dummy:false}));
      /* IN LINEUP ORDER, NOT THE ORDER ESPN HAPPENS TO LIST THEM IN.

         The roster feed comes back in its own order, which is neither the
         lineup's nor anything a manager would recognise — the Forecast was
         reading WR, RB, TE, RB, WR, FLEX, QB, K, D/ST down the page, with the
         quarterback seventh. Both sides are sorted the same way, which is what
         keeps the two columns aligned spot for spot; within one slot the higher
         projection goes on top, so RB1 sits above RB2. */
      out.sort((a,b)=>{
        const ai=SLOT_ORDER.indexOf(a.slot), bi=SLOT_ORDER.indexOf(b.slot);
        if(ai!==bi) return (ai<0?99:ai)-(bi<0?99:bi);
        return (b.proj??-1)-(a.proj??-1);
      });
      return out;
    }
  }
  return fcDummyLineup(teamId);
}
/* ── WHO WENT OFF ────────────────────────────────────────────────────────────
   The best started performance on each side of a finished game. ESPN gives it
   in the same roster call the board already makes for that week, so this is a
   read of a cache rather than a new request most of the time. */
let _wkScores={},_wkScoresBusy={};
function weekScores(season,week){
  const key=season+':'+week;
  if(_wkScores[key]) return _wkScores[key];
  if(_wkScoresBusy[key]) return null;
  _wkScoresBusy[key]=true;
  const done=()=>{ _wkScoresBusy[key]=false; };
  fetch(`${BASE}?view=mRoster&seasonId=${season}&scoringPeriodId=${week}&live=1`,{cache:'no-store'})
    .then(r=>r.ok?r.json():null)
    .then(j=>{
      const out={};
      ((j&&j.teams)||[]).forEach(t=>{
        out[t.id]=((t.roster&&t.roster.entries)||[])
          .filter(e=>!BENCH_SLOTS.includes(e.lineupSlotId))
          .map(e=>{
            const pl=(e.playerPoolEntry&&e.playerPoolEntry.player)||{};
            const st=(pl.stats||[]).find(x=>x.statSourceId===0&&x.scoringPeriodId===Number(week));
            return {pid:e.playerId,n:pl.fullName||pName(e.playerId),
              pos:pl.defaultPositionId||0,slot:e.lineupSlotId,pts:st?st.appliedTotal:null};
          });
      });
      _wkScores[key]=out; done();
      try{ if(_activeTab==='week') renderSchedule(); }catch(e){}
    })
    .catch(()=>{ done(); });
  return null;
}
const weekTopStarter=(season,week,teamId)=>{
  const w=weekScores(season,week); if(!w) return null;
  const list=(w[teamId]||[]).filter(x=>x.pts!=null);
  if(!list.length) return null;
  return list.slice().sort((a,b)=>b.pts-a.pts)[0];
};
/* ── WHO WINS EACH SPOT ──────────────────────────────────────────────────────
   Two lineups side by side, row by row, with the spot coloured for whoever is
   ahead at it. The threshold is the point of the thing: two projections a
   point apart is not an advantage, it is the same number twice, and colouring
   it green would say something the data does not. Only a gap worth noticing
   gets a colour, and the rest stays neutral. */
const FC_EDGE=2.5;                 // points of projection before a spot is won
function fcRosterCompareHTML(season,week,aId,bId,abA,abB){
  const A=fcLineupFor(season,week,aId), B=fcLineupFor(season,week,bId);
  if(!A||!B) return `<div class="lr-none">No lineups to compare yet.</div>`;
  const dummy=A.some(x=>x.dummy)||B.some(x=>x.dummy);
  const n=Math.min(A.length,B.length);
  let edgeA=0,edgeB=0;
  const rows=[];
  for(let i=0;i<n;i++){
    const a=A[i], b=B[i];
    const pa=Number(a.proj)||0, pb=Number(b.proj)||0;
    const d=pa-pb;
    const win=Math.abs(d)<FC_EDGE?'':(d>0?'a':'b');
    if(win==='a') edgeA++; if(win==='b') edgeB++;
    rows.push(`<div class="fcr-row">
      <span class="fcr-side ${win==='a'?'good':win==='b'?'bad':''}">
        <span class="fcr-n">${lastNameOf(a.n)}</span><span class="fcr-p">${pa.toFixed(1)}</span>
      </span>
      <span class="fcr-pos" style="color:${posPill(a.ppos)[0]};background:${posPill(a.ppos)[1]}">${a.pos}</span>
      <span class="fcr-side ${win==='b'?'good':win==='a'?'bad':''}">
        <span class="fcr-p">${pb.toFixed(1)}</span><span class="fcr-n">${lastNameOf(b.n)}</span>
      </span>
    </div>`);
  }
  const tot=(l)=>l.slice(0,n).reduce((x,y)=>x+(Number(y.proj)||0),0);
  return `<div class="fcr">
    <div class="fcr-row fcr-head">
      <span class="fcr-side"><span class="fcr-n">${abA}</span></span>
      <span class="fcr-pos">Spot</span>
      <span class="fcr-side"><span class="fcr-n">${abB}</span></span>
    </div>
    ${rows.join('')}
    <div class="fcr-row fcr-tot">
      <span class="fcr-side ${tot(A)>tot(B)?'good':''}"><span class="fcr-n">${tot(A).toFixed(1)}</span></span>
      <span class="fcr-pos">Total</span>
      <span class="fcr-side ${tot(B)>tot(A)?'good':''}"><span class="fcr-n">${tot(B).toFixed(1)}</span></span>
    </div>
    <div class="fcr-note">${edgeA===edgeB
      ? `Spots split ${edgeA}–${edgeB}. Nothing between them.`
      : `${edgeA>edgeB?abA:abB} wins ${Math.max(edgeA,edgeB)} spots to ${Math.min(edgeA,edgeB)}.`}
      ${dummy?' <b>Stand-in lineups</b> — nobody has drafted yet.':''}</div>
  </div>`;
}
function renderForecast(info){
  const el=document.getElementById('fc-body'); if(!el) return;
  if(!_me||!_me.teamId){
    el.innerHTML=`<div class="lr-none">Sign in to see your matchup broken down.</div>`; return;
  }
  const mine=Number(_me.teamId);
  const g=(info.games||[]).find(m=>m.home.teamId===mine||m.away.teamId===mine);
  if(!g){ el.innerHTML=`<div class="lr-none">No game on the slate for you this week.</div>`; return; }
  const home=g.home.teamId===mine;
  const meT=_teams.find(t=>t.id===mine);
  const oppId=home?g.away.teamId:g.home.teamId;
  const oppT=_teams.find(t=>t.id===oppId);
  if(!meT||!oppT){ el.innerHTML=`<div class="lr-none">Could not read that matchup.</div>`; return; }
  const owners=info.meta.owners||{};
  const meO=owners[mine], oppO=owners[oppId];
  const A=fcSideStats(meO), B=fcSideStats(oppO);
  const fcWk=Number(info.week)||schedCurWeek(info.season);
  const p=(A&&B)?schedWinProb(A,B,fcWk):0.5;
  const nm=t=>t.name;
  const ab=t=>t.abbrev||teamInitials(t.name);

  /* The bar is gone. A bar says what the chance is now and nothing about how it
     got there; the curve says both, and on Tuesday it is the only record of
     what the game actually felt like. */
  const projByOwner={};
  Object.values(owners).forEach(o=>{ const r=fcSideStats(o); if(r) projByOwner[o]=r.ppg; });
  const pts=wpCurve(_liveSeries,projByOwner,meO,oppO,(A&&B)?schedOpenMu(A,B,fcWk):null);
  const now=pts[pts.length-1];
  const bar=`<div class="fc-odds">
    <div class="fc-odds-t"><span>${ab(meT)}</span>
      <span class="fc-pct ${now.p>=0.5?'up':'dn'}">${Math.round(now.p*100)}%</span>
      <span>${ab(oppT)}</span></div>
    ${wpGraphSVG(pts,ab(meT),ab(oppT))}
    <div class="fc-odds-s"><span>${pts.length>1?'chance to win, through the week':'chance to win, before kickoff'}</span>
      <span>${amFmt(amFromProb(Math.min(0.95,now.p+0.025)))}</span></div>
  </div>`;

  /* season points per game by slot, both sides, so the mismatch is visible */
  const posRows=(()=>{
    const rows=fcPositional(info,mine,oppId);
    if(!rows.length) return '';
    return `<div class="fc-pos">
      <div class="fc-pr fc-ph"><span>${ab(meT)}</span><span>Position</span><span>${ab(oppT)}</span></div>
      ${rows.map(r=>{
        const meBetter=r.a>r.b, tie=r.a===r.b;
        return `<div class="fc-pr">
          <span class="fc-v ${tie?'':meBetter?'good':'bad'}">${r.a.toFixed(1)}</span>
          <span class="fc-l">${r.pos}</span>
          <span class="fc-v ${tie?'':meBetter?'bad':'good'}">${r.b.toFixed(1)}</span>
        </div>`;}).join('')}
    </div>`;
  })();

  /* Both of these fold. What the game does to the season and who is starting
     for whom are things you go and look at, not things you need in front of
     you every time the page opens — and left open they push the matchup
     itself off a phone screen. */
  const imp=fcImplications(info,meO,p);
  el.innerHTML=`
    <div class="fc-head">
      ${logoImg(meT.id,'big4-logo')}
      <div class="fc-vs"><div class="fc-wk">Week ${info.week}</div><div class="fc-mu">${home?'vs':'@'} ${nm(oppT)}</div></div>
      ${logoImg(oppT.id,'big4-logo')}
    </div>
    ${bar}
    ${posRows}
    ${fcFold('fc-lu','Starting lineups',
      fcRosterCompareHTML(info.season,info.week,mine,oppId,ab(meT),ab(oppT)))}
    ${imp?fcFold('fc-imp','Playoff odds',imp):''}
    ${fcLastMeetingHTML(meO,oppO,meT,oppT)}
    ${ttBoxHTML(fcOppKey(oppT),nm(oppT))}`;
}
/* The last time these two played. Sits under the projections because it is the
   one number on the page that already happened — everything above it is a
   guess, and this is the record. Nothing is shown if they have never met. */
function fcLastMeetingHTML(meO,oppO,meT,oppT){
  if(!meO||!oppO) return '';
  let g=null;
  try{ g=(h2hGames(meO,oppO)||[])[0]; }catch(e){}
  if(!g) return '';
  const won=g.myScore>g.oppScore, tied=g.myScore===g.oppScore;
  /* One line. It was three rows and two crests to say a thing that fits in a
     sentence — the last time these two played, who won, and by what. The teams
     are named at the top of the forecast already; this only has to say which
     way it went. */
  return `<div class="fcl fcl-one">
    <i class="fa fa-clock-rotate-left"></i>
    <span class="fcl-lbl">Last meeting</span>
    <span class="fcl-mid ${tied?'t':won?'w':'l'}">${tied?'TIED':won?'WON':'LOST'}</span>
    <span class="fcl-sc">${g.myScore.toFixed(1)}<span class="fcl-d">\u2013</span>${g.oppScore.toFixed(1)}</span>
    <span class="fcl-when">${g.season} \u00b7 wk ${g.week}</span>
  </div>`;
}
/* the sign-in key a team's manager uses, which is what a profile is filed under */
function fcOppKey(t){
  if(!t) return '';
  return keySlug(t.abbrev||teamInitials(t.name));
}
/* points per game by lineup slot for both teams, this season */
function fcPositional(info,aId,bId){
  const src=_weeklyBySlot;
  if(!src||!src.season||String(src.season)!==String(info.season)) { fcLoadSlots(info); return []; }
  const order=['QB','RB','WR','TE','FLEX','D/ST','K'];
  const out=[];
  order.forEach(pos=>{
    const a=src.data[aId]&&src.data[aId][pos], b=src.data[bId]&&src.data[bId][pos];
    if(!a&&!b) return;
    out.push({pos, a:a?a.pts/Math.max(1,a.g):0, b:b?b.pts/Math.max(1,b.g):0});
  });
  return out;
}
let _weeklyBySlot=null,_slotBusy=false;
async function fcLoadSlots(info){
  if(_slotBusy) return; _slotBusy=true;
  const data={};
  try{
    const last=Math.max(1,Number(info.week)-1);
    for(let w=1;w<=last;w++){
      const r=await fetch(`${BASE}?view=mRoster&seasonId=${info.season}&scoringPeriodId=${w}&live=1`,{cache:'no-store'});
      if(!r.ok) continue;
      const j=await r.json();
      (j.teams||[]).forEach(t=>{
        ((t.roster&&t.roster.entries)||[]).forEach(e=>{
          if(BENCH_SLOTS.includes(e.lineupSlotId)) return;
          const pos=SLOT_NAMES[e.lineupSlotId]; if(!pos) return;
          const pl=e.playerPoolEntry?.player||{};
          const wk=(pl.stats||[]).find(s=>s.statSourceId===0&&s.scoringPeriodId===w);
          if(wk?.appliedTotal==null) return;
          const d=data[t.id]||(data[t.id]={});
          const c=d[pos]||(d[pos]={pts:0,g:0});
          c.pts+=wk.appliedTotal; c.g++;
        });
      });
    }
    _weeklyBySlot={season:info.season,data};
    if(_activeTab==='week'&&fcOnLiveSeason()) renderForecast(info);
  }catch(e){}
  _slotBusy=false;
}
/* what winning or losing would do to the season */
/* The same fold the sportsbook and the homepage use, in the forecast's own
   clothes: state is kept per key so opening one and repainting the week does
   not shut it again. */
/* The lineups open by default — that is the thing you came to look at, and a
   fold you have to open every single time is a lid on the main course. Playoff
   odds stay shut until asked for. */
let _fcOpen={'fc-lu':true};
function fcToggle(k){
  _fcOpen[k]=!_fcOpen[k];
  const el=document.querySelector('.fc-fold[data-k="'+CSS.escape(k)+'"]');
  if(!el) return;
  el.classList.toggle('open',_fcOpen[k]);
  const b=el.querySelector('.fc-fold-h'); if(b) b.setAttribute('aria-expanded',String(!!_fcOpen[k]));
}
/* No icon on the bar. The chevron is not one of them — it is the control that
   says the thing folds — but a pie chart beside the words "playoff odds" only
   repeats them, and two bars each wearing a different symbol read as two
   unrelated things rather than two of the same. */
function fcFold(k,title,body){
  const open=!!_fcOpen[k];
  return `<div class="fc-fold${open?' open':''}" data-k="${k}">
    <button class="fc-fold-h" onclick="fcToggle('${k}')" aria-expanded="${open}">
      <span>${title}</span>
      <i class="fa fa-chevron-down fc-fold-c"></i>
    </button>
    <div class="fc-fold-b"><div class="fc-fold-in">${body}</div></div>
  </div>`;
}
function fcImplications(info,owner,p){
  const d=playoffOutlook();
  if(!d) return '';
  const me=d.teams.find(t=>t.owner===owner);
  if(!me) return '';
  const now=Math.round(me.odds*100);
  /* A win is worth roughly the slice of the odds riding on this game. Rather
     than re-running four thousand seasons twice on a tap, the swing is scaled
     from how much of the season is still open — early games move less than
     late ones, which is the shape the real simulation has. */
  const left=Math.max(1,d.left);
  const swing=Math.min(28,Math.round(46/Math.sqrt(left)));
  const win=Math.min(99,now+Math.round(swing*(1-p)));
  const lose=Math.max(1,now-Math.round(swing*p));
  return `<div class="fc-imp">
    <div class="fc-imp-r">
      <div class="fc-imp-c good"><span class="fc-imp-l">Win</span><span class="fc-imp-v">${win}%</span>
        <span class="fc-imp-s">playoff odds</span></div>
      <div class="fc-imp-c now"><span class="fc-imp-l">Now</span><span class="fc-imp-v">${now}%</span>
        <span class="fc-imp-s">${me.fBest===me.fWorst?ordinal(me.fBest):`${ordinal(me.fBest)}–${ordinal(me.fWorst)}`}</span></div>
      <div class="fc-imp-c bad"><span class="fc-imp-l">Loss</span><span class="fc-imp-v">${lose}%</span>
        <span class="fc-imp-s">playoff odds</span></div>
    </div>
  </div>`;
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
  /* KEYED ON THE WEEK, WHICH DOES NOT CHANGE WHILE THE WEEK IS BEING PLAYED.
     These are live scores: on a Sunday afternoon the key is the same all day
     while every number under it moves, so the board froze at whatever it read
     first. Same two minutes the roster feed uses. */
  const key=`${info.season}-${info.week}`;
  const stale=!_weekTopCache||_weekTopCache.key!==key
    ||(Date.now()-(_weekTopCache.at||0))>SB_ROSTER_TTL;
  if(stale){
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
      _weekTopCache={key,rows:out.slice(0,10),at:Date.now()};
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
  'Head-to-Head Records':'H2H Records',

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
/* The chip bar is sticky. Once it lands under the nav, a dark frosted drawer
   slides down from behind the nav and sits under it — flush at the top, rounded
   at the bottom. The nav's bottom edge is measured rather than hardcoded, so the
   bar docks exactly against it at every breakpoint and under the iOS safe-area
   inset; --navside is how far the bar is inset from the nav's sides, which lets
   the drawer widen to the nav's edges. */
/* ── TEAM PICKER DOCKING ─────────────────────────────────────────────────────
   A page's team dropdown rides into the chip drawer once it scrolls behind the
   nav, and drops back into place on the way up.

   The element itself moves rather than a copy being made, so the select keeps
   its value, its id and its onchange. A placeholder of the same height holds
   the original spot: the page does not jump when it leaves, and the test for
   putting it back reads a position that docking does not itself move — reading
   the picker's own position while docked flip-flops every frame.

   The animation is driven off a MEASURED height rather than a guessed
   max-height. Guessing meant the element snapped to its real size the moment
   the keyframe finished, which is where the second jump came from. Now the
   drawer opens to exactly the height the picker will occupy, and the picker
   fades in behind that, so the container makes space first and the content
   arrives into it. Both directions are animated, and the DOM move on the way
   out waits for the collapse to finish. */
let _dockedPicker=null,_dockedHome=null,_dockedBar=null,_dockBusy=false;
const DOCK_MS=260;
/* the chip bar in use for this page: its own if it has one, else the global */
/* Whichever bar is actually pinned under the nav. Advanced Stats keeps its own
   jump bar and that is the one holding the chips, so a picker docked into the
   global bar landed on top of them; Player Data's row is not sticky at all, so
   there the global bar is still the answer. Asking about position rather than
   about the class is what tells the two apart. */
function activeChipBar(){
  const page=document.getElementById('page-'+_activeTab);
  const local=page&&page.querySelector('.sec-nav-local');
  if(local&&!local.hidden&&getComputedStyle(local).position==='sticky') return local;
  return document.getElementById('sec-nav');
}
/* The sportsbook is the one page that already hangs something off the nav —
   the wallet — and there is only one slot down there. Docking the Team Card's
   selector into it dropped the selector straight on top of My Bets, so on this
   page the selector stays where it is. */
function pagePicker(){
  if(_activeTab==='book') return null;
  const page=document.getElementById('page-'+_activeTab); if(!page) return null;
  return [...page.querySelectorAll('.picker-bar')]
    .find(p=>p.querySelector('select')&&p.offsetParent!==null)||null;
}
/* put it back where it came from, once the collapse has played */
function undockPicker(instant){
  if(!_dockedPicker) return;
  const p=_dockedPicker, home=_dockedHome, bar=_dockedBar;
  _dockedPicker=null; _dockedHome=null; _dockedBar=null;
  const finish=()=>{
    p.style.cssText='';
    p.classList.remove('picker-docked');
    if(home&&home.isConnected){ home.parentNode.insertBefore(p,home); home.remove(); }
    else p.remove();            // its page was re-rendered; a fresh one is there
    if(bar){
      bar.classList.remove('has-dock','dock-only');
      bar.style.removeProperty('--dockh');
      if(bar.dataset.dockOnly){ bar.hidden=true; delete bar.dataset.dockOnly; }
    }
    _dockBusy=false;
  };
  if(instant||!home||!home.isConnected){ if(bar) bar.style.setProperty('--dockh','0px'); finish(); return; }
  _dockBusy=true;
  p.style.transition='opacity .14s ease';
  p.style.opacity='0';
  if(bar) bar.style.setProperty('--dockh','0px');   // the drawer closes back up
  setTimeout(finish,DOCK_MS);
}
function syncPickerDock(){
  if(_dockBusy) return;
  const bar=activeChipBar(), nav=document.getElementById('floatnav');
  if(!bar||!nav) return;
  const line=nav.getBoundingClientRect().bottom;
  if(_dockedPicker){
    const gone=!_dockedHome||!_dockedHome.isConnected
      ||!document.getElementById('page-'+_activeTab)?.contains(_dockedHome);
    if(gone){ undockPicker(true); return; }
    /* a wider band than the docking test, so a page that re-renders to a
       slightly different height cannot chatter across the boundary */
    if(_dockedHome.getBoundingClientRect().top>line+12) undockPicker();
    return;
  }
  const p=pagePicker(); if(!p) return;
  const r=p.getBoundingClientRect();
  if(!r.height||r.bottom>line) return;

  const h=Math.round(r.height);
  /* The drawer opens to the control plus one gap, so the space under the select
     matches the space the chips keep from the drawer's edges. It is the select
     that is measured, not the picker row: the row carries its own vertical
     padding in the page, which docked would read as slack below the control
     and put it 17px off the drawer's edge against the chips' 10. */
  const pad=Math.round(parseFloat(getComputedStyle(bar).getPropertyValue('--secpad')))||10;
  const ctl=p.querySelector('select,input,button');
  const ch=Math.round((ctl?ctl.getBoundingClientRect().height:0)||r.height);
  const ph=document.createElement('div');
  ph.className='picker-ph';
  ph.style.height=h+'px';
  p.parentNode.insertBefore(ph,p);
  bar.insertBefore(p,bar.firstChild);        // the space opens above the chips
  p.classList.add('picker-docked');
  _dockedPicker=p; _dockedHome=ph; _dockedBar=bar;
  bar.classList.add('has-dock');
  bar.classList.toggle('dock-only',!bar.querySelector('.sx-chip'));
  if(bar.hidden){ bar.hidden=false; bar.dataset.dockOnly='1'; }

  /* The picker is taken out of flow and the drawer is grown underneath it by
     --dockh, an animatable custom property. Growing the bar's own box would
     push every following element down the page — which is exactly the jolt
     this is avoiding — so the bar keeps the height its chips give it and the
     backdrop reaches past it instead. One property drives both the backdrop
     and the picker's height, so they cannot drift apart. */
  bar.style.setProperty('--dockh','0px');
  p.style.transition='none'; p.style.opacity='0';
  p.offsetHeight;                            // commit the closed state
  requestAnimationFrame(()=>{
    if(_dockedPicker!==p) return;
    p.style.transition=`opacity .22s ease ${Math.round(DOCK_MS*0.45)}ms`;
    /* a picker-only drawer pads both ends, since the bar above it is now
       zero-height and no longer supplies the top gap */
    const only=bar.classList.contains('dock-only');
    bar.style.setProperty('--dockh',(ch+pad*(only?2:1))+'px');
    p.style.opacity='1';
  });
}

let _dockRaf=0;
function syncNavDock(){
  const nav=document.getElementById('floatnav'); if(!nav) return;
  const nb=nav.getBoundingClientRect();
  document.documentElement.style.setProperty('--navbot',Math.round(nb.bottom)+'px');
  document.querySelectorAll('.sec-nav').forEach(bar=>{
    /* Ask the bar whether it actually pins, rather than assuming from its
       class. Two different things wear .sec-nav-local: Advanced Stats' row is a
       real jump bar and sticks, while Player Data's is a view switcher that
       CSS deliberately pins to the page (position:static). Only something that
       can pin can be "stuck", and only something stuck may wear the drawer —
       a bar that never pins was being marked stuck forever, which left a
       backdrop-filter running and washed the page behind it. */
    if(getComputedStyle(bar).position!=='sticky'){ bar.classList.remove('stuck'); return; }
    if(bar.hidden){ bar.classList.remove('stuck'); return; }
    const r=bar.getBoundingClientRect();
    bar.style.setProperty('--navside',Math.max(0,Math.round(r.left-nb.left))+'px');
    bar.classList.toggle('stuck',r.top<=nb.bottom+1);
  });
  const bets=document.getElementById('bets-bar');
  if(bets&&!bets.hidden){
    const r=bets.getBoundingClientRect();
    bets.style.setProperty('--navside',Math.max(0,Math.round(r.left-nb.left))+'px');
    bets.classList.toggle('stuck',r.top<=nb.bottom+1);
  }
  try{ syncPickerDock(); }catch(e){}
}
function onDockScroll(){
  if(_dockRaf) return;
  _dockRaf=requestAnimationFrame(()=>{ _dockRaf=0; syncNavDock(); });
}
addEventListener('scroll',onDockScroll,{passive:true});
addEventListener('resize',onDockScroll);

function buildSectionNav(tab){
  const top=document.getElementById('sec-nav'); if(!top) return;
  _secNavBusy=true;   // our own writes must not retrigger the observer
  const page=document.getElementById('page-'+tab);
  if(!page){ top.innerHTML=''; top.hidden=true; _secNavBusy=false; return; }
  /* The homepage is three cards and a video that reorder themselves as things
     get done — chips naming sections that move are more noise than navigation.
     Every other tab keeps them. */
  if(tab==='home'){ top.innerHTML=''; top.hidden=true; _secNavBusy=false; return; }
  /* a page can host the bar itself (Advanced Stats puts it under its filters,
     where it reads as belonging to the selected filter rather than the tab) */
  const local=page.querySelector('.sec-nav-local');
  const bar=local||top;
  if(local){
    /* This page has its own chip row, so the global bar carries no chips of its
       own — but it is the one actually pinned under the nav, and it may be
       holding a docked picker. Keep the picker and leave the bar up for it;
       hide it only when it is genuinely empty. */
    const keep=(_dockedPicker&&top.contains(_dockedPicker))?_dockedPicker:null;
    top.innerHTML='';
    if(keep){ top.appendChild(keep); top.hidden=false; }
    else top.hidden=true;
  }
  // Every visible heading on the page, whatever wraps it. Tabs nest their
  // headings differently — Team Profiles puts them in .panel, League History
  // uses .lh-sec-head — so keying off the section wrapper missed most of them.
  /* Advanced Stats' coaching sections are tabbed, so only one is on screen at a
     time — their chips have to come from all four regardless of visibility, or
     the bar would collapse to a single chip the moment a tab was chosen. */
  const cm=page.querySelector('#stats-cm');   // the Coaching Metric tab
  const cmOn=cm&&getComputedStyle(cm).display!=='none';
  const tn=page.querySelector('#tenure-views');
  const host=cmOn?cm:(tn||null);
  const entries=host
    ? [...host.children].filter(c=>c.classList.contains('sec'))
        .map(s=>s.querySelector('.sec-head')).filter(Boolean)
        .map(h=>({h,label:(h.textContent||'').replace(/\s+/g,' ').trim()
          .replace(/(tap a team.*|\d{4} · .*)$/,'').trim()}))
    : sectionEntriesIn(page);
  if(entries.length<2){
    bar.innerHTML='';
    /* a docked picker is the one thing in here that is not a chip; if it is
       riding along, the bar stays up for it rather than being hidden */
    if(_dockedPicker){ bar.appendChild(_dockedPicker); bar.hidden=false; }
    else bar.hidden=true;
    _secNavBusy=false; return;
  }
  // index into the same ordered list the jump re-derives at click time — the
  // page re-renders when its data lands, so ids assigned up front would vanish
  const keepDock=(_dockedPicker&&bar.contains(_dockedPicker))?_dockedPicker:null;
  bar.innerHTML=entries.map((e,i)=>
    `<button class="sx-chip" data-sx="${i}" title="${e.label}" onclick="jumpToSection(this)">${sxShort(e.label)}</button>`).join('');
  if(keepDock) bar.insertBefore(keepDock,bar.firstChild);   // survives the rebuild
  bar.hidden=false;
  fitSectionNav(bar,entries.length);
  syncNavDock();
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
  const bar=document.querySelector('#page-cm .sec-nav-local');
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
  if(_activeTab==='cm' && document.getElementById('stats-cm')){
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
/* ── HOW OFTEN THE SERIES IS PERSISTED ───────────────────────────────────────
   The scoreboard is CHECKED every ten seconds while football is being played,
   because that is what makes the live board feel live and it costs nothing —
   it is a 1.7KB read of a public NFL digest.

   Writing the series to Firestore is a different matter entirely. Every save is
   a read (to merge with whatever other watchers have) plus a write, it happens
   in every open tab, and at a ten second cadence across a nine hour Sunday with
   the league watching that is tens of thousands of operations against a free
   tier that allows twenty thousand writes a day. That is how the quota ran out
   before.

   It buys nothing, either: the series is stamped at minute resolution, so
   saving more than once a minute cannot record anything a later save would not.
   Changes accumulate in memory and are flushed on this interval instead, plus
   once when the tab goes away so the last minute of a game is never lost.
   Twelve tabs at this cadence is a couple of thousand writes across a Sunday,
   which the free tier does not notice. */
const LIVE_SAVE_MS=180000;  // at most one persist every three minutes, per tab
let _liveTimer=null,_liveSeries={},_liveInfo=null,_liveBusy=false,_liveSaved=0,_liveNext=0;
let _liveDirty=false,_liveChanged=0,_liveFlushing=false;
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
    if(key&&(!_liveInfo||_liveInfo.key!==key)){
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
    if(changed){ _liveDirty=true; _liveChanged=Date.now(); }
    if(_liveDirty&&Date.now()-_liveSaved>=LIVE_SAVE_MS) await liveFlush(key);
    renderLiveMatchups();
    renderMyMatchupBar();   // the pinned bar is independent of the live board
  }catch(e){}
  _liveBusy=false;
}
/* Merge with whatever other watchers have written, then persist. One read and
   one write, and only on the throttle above. */
async function liveFlush(key){
  if(_liveFlushing||!_liveDirty) return;
  _liveFlushing=true; _liveSaved=Date.now();
  try{
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
    if(key&&await liveSaveSeries(key,_liveSeries)) _liveDirty=false;
  }catch(e){}
  _liveFlushing=false;
}
/* A tab going away takes its unflushed minutes with it unless they go now.
   visibilitychange rather than unload: it is the one the phone browsers
   actually fire when an app is swiped away. */
if(typeof document!=='undefined') document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='hidden'&&_liveDirty&&_liveInfo)
    try{ liveFlush(_liveInfo.key); }catch(e){}
});
/* null when there is no week to key on. Between seasons liveWeekInfo has no
   schedule to read, so week comes back undefined and this built
   "2026-wundefined" — a Firestore read, every session, for a document that
   cannot exist. Nothing was ever written there (the flush needs a scored game
   first), so it was only ever a wasted read against the daily quota. */
const liveKeyFor=info=>{
  const w=Number(info&&info.week);
  return (info&&info.season&&Number.isFinite(w)&&w>0)?`${info.season}-w${w}`:null;
};

/* ── THE WIN PROBABILITY CURVE ───────────────────────────────────────────────
   A fantasy game is not watched, it is checked on. The score line by itself
   does not say what it meant — a forty point lead in the early window is a
   different thing from a forty point lead on Monday night — so the useful
   record of a matchup is not the score over time but the chance of winning
   over time. Read back on Tuesday it is the narrative: where it was won, what
   the swing was, and whether the ending was ever in doubt.

   THE MODEL. At any moment a team's final score is what it has already banked
   plus what its unplayed players will add. We do not know player by player who
   is left, but we do know how far through the week the league as a whole is:
   every score in the week added up, against every projection added up. Call
   that f, the fraction of the slate played.

     expected final  =  scored so far  +  (1 − f) × projection
     margin          =  expected final A  −  expected final B
     spread of that  =  σ × sqrt(1 − f)

   The square root is the whole point. Uncertainty does not fall away evenly:
   it collapses as the last players finish, which is why a lead that is safe at
   f = 0.9 was nothing like safe at f = 0.5. At f = 1 the spread goes to zero
   and the curve snaps to the result it already knows.

   σ is the spread of a fantasy margin over a full week, which is what
   SCHED_SD already measures for the projections these numbers come from. */
/* Read at call time, not at load: SCHED_SD is declared further down the file
   and touching it up here is a dead page rather than a wrong number. */
const wpSd=()=>SCHED_SD*1.15;
/* `mu0` is the projected margin for the game, and when it is supplied the
   curve opens on exactly the number the Schedule table shows for the same
   fixture — see schedOpenMu. Without it the curve falls back to differencing
   the two season averages, which is what it always did and is still right for
   any caller that has no board to price against. */
function wpAt(a,b,projA,projB,f,mu0){
  const left=Math.max(0,1-Math.min(1,f||0));
  const mu=(mu0!=null)?(a-b)+left*mu0:(a+left*projA)-(b+left*projB);
  const sd=Math.max(0.6,wpSd()*Math.sqrt(left));
  return Math.min(0.999,Math.max(0.001,schedNormCdf(mu/sd)));
}
/* How far through the week the league is, sample by sample. Everyone's points
   at that minute over everyone's projection — one number for the whole slate,
   because the players still to come are shared across every game on it. */
function wpSlateProgress(series,projByOwner){
  const total=Object.values(projByOwner||{}).reduce((x,y)=>x+y,0)||1;
  const at={};
  Object.entries(series||{}).forEach(([k,arr])=>{
    const [oa,ob]=k.split('~');
    (arr||[]).forEach(([t,a,b])=>{
      const m=at[t]||(at[t]={});
      m[oa]=a; m[ob]=b;
    });
  });
  const stamps=Object.keys(at).map(Number).sort((x,y)=>x-y);
  const run={}, out=[];
  stamps.forEach(t=>{
    Object.assign(run,at[t]);
    const sum=Object.values(run).reduce((x,y)=>x+y,0);
    out.push([t,Math.min(1,sum/total)]);
  });
  return out;
}
/* The curve for one matchup: every minute the week's scoreboard moved, turned
   into this team's chance of winning at that minute. Opens on the pre-game
   number so the line starts where the projection had it rather than at a coin
   flip. */
function wpCurve(series,projByOwner,ownerA,ownerB,mu0){
  const projA=projByOwner[ownerA]||0, projB=projByOwner[ownerB]||0;
  const open=wpAt(0,0,projA,projB,0,mu0);
  const arr=(series||{})[liveMKey(ownerA,ownerB)]||[];
  if(!arr.length) return [{t:0,p:open,a:0,b:0,f:0}];
  const aFirst=[ownerA,ownerB].sort()[0]===ownerA;
  const prog=wpSlateProgress(series,projByOwner);
  const fAt=t=>{
    let f=0;
    for(let i=0;i<prog.length;i++){ if(prog[i][0]<=t) f=prog[i][1]; else break; }
    return f;
  };
  const pts=[{t:arr[0][0]-1,p:open,a:0,b:0,f:0}];
  arr.forEach(([t,x,y])=>{
    const a=aFirst?x:y, b=aFirst?y:x;
    const f=fAt(t);
    pts.push({t,p:wpAt(a,b,projA,projB,f,mu0),a,b,f});
  });
  return pts;
}
/* ── WHERE A WEEK'S CURVE COMES FROM ─────────────────────────────────────────
   Two places, in this order. A finished week is committed into the repo as a
   flat file, and that is the whole point of archiving it: permanent, one
   cached GET, and not dependent on Firestore still holding a document nobody
   is paying attention to any more. Anything not archived yet — this week,
   mostly — is read live from Firestore, which is where the poller has been
   writing it all along. */
let _wpArchive={},_wpBusy={};
function wpSeriesFor(season,week){
  const k=`${season}-w${week}`;
  if(_liveInfo&&_liveInfo.key===k&&Object.keys(_liveSeries||{}).length) return _liveSeries;
  return _wpArchive[k]||null;
}
async function wpEnsureSeries(season,week){
  const k=`${season}-w${week}`;
  if(wpSeriesFor(season,week)||_wpBusy[k]) return;
  _wpBusy[k]=true;
  try{
    const r=await fetch(`/data/live-${k}.json`);
    if(r.ok){ _wpArchive[k]=await r.json(); _wpBusy[k]=false; return; }
  }catch(e){}
  /* not archived yet, so ask the collection the poller writes to */
  try{ const live=await liveLoadSeries(k); if(live&&Object.keys(live).length) _wpArchive[k]=live; }catch(e){}
  _wpBusy[k]=false;
}
/* Drawn rather than described. The line is the chance; the ground it sits on
   is even. Above the midline is winning, below is losing, and the two are
   coloured differently because "60% down from 90%" and "60% up from 20%" are
   the same number and not the same story — the shape has to carry that. */
function wpGraphSVG(pts,abA,abB,opt){
  const o=opt||{}, W=300, H=o.h||96, PADT=8, PADB=8;
  if(!pts||!pts.length) return '';
  /* One point is a whole game's worth of information before kickoff — the line
     the projection opens on — so it is drawn flat across the panel rather than
     as a dot floating in an empty box. */
  const pts2=pts.length>1?pts:[pts[0],pts[0]];
  const n=pts2.length;
  const x=i=>(i/(n-1))*W;
  const y=p=>PADT+(1-p)*(H-PADT-PADB);
  const line=pts2.map((q,i)=>`${i?'L':'M'}${x(i).toFixed(1)},${y(q.p).toFixed(1)}`).join('');
  const area=`${line}L${x(n-1).toFixed(1)},${y(0.5).toFixed(1)}L${x(0).toFixed(1)},${y(0.5).toFixed(1)}Z`;
  const last=pts2[n-1], pct=Math.round(last.p*100);
  const up=last.p>=0.5;
  const uid='wp'+Math.random().toString(36).slice(2,8);
  return `<div class="wp-wrap">
    <svg class="wp-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img"
      aria-label="${abA} win probability, ${pct} percent">
      <defs>
        <clipPath id="${uid}u"><rect x="0" y="0" width="${W}" height="${y(0.5)}"/></clipPath>
        <clipPath id="${uid}d"><rect x="0" y="${y(0.5)}" width="${W}" height="${H}"/></clipPath>
      </defs>
      <path d="${area}" class="wp-fill up" clip-path="url(#${uid}u)"/>
      <path d="${area}" class="wp-fill dn" clip-path="url(#${uid}d)"/>
      <line x1="0" y1="${y(0.5)}" x2="${W}" y2="${y(0.5)}" class="wp-mid"/>
      <path d="${line}" class="wp-line up" clip-path="url(#${uid}u)"/>
      <path d="${line}" class="wp-line dn" clip-path="url(#${uid}d)"/>
      <circle cx="${x(n-1).toFixed(1)}" cy="${y(last.p).toFixed(1)}" r="3.5"
        class="wp-dot ${up?'up':'dn'}"/>
    </svg>
  </div>`;
}
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
/* ── Shared league state ────────────────────────────────────────────────────
   Scores were polled but profiles never were, so anything another manager did
   — a Matchup of the Week vote, a poll ballot — only appeared after a reload.
   Two people on the site at once could not see each other.

   One request covers all of it: everything shared lives as fields on the
   profile documents, so a single read refreshes every tally. Only the
   league-visible pieces repaint. Personal cards are deliberately left alone —
   redrawing Ball Knowledge or the picks grid under someone mid-tap would be a
   worse bug than the one being fixed. */
/* ── FIRESTORE READ BUDGET ───────────────────────────────────────────────────
   The free tier allows 50,000 document reads a day. Every leaguePoll reads the
   whole profiles collection — fifteen documents — so at the old 20-second
   interval a single tab left open burned about 2,700 reads an hour, and three
   or four managers with the app open exhausted the day's allowance and took
   every Firestore-backed feature down at once: ballots would not submit, bets
   would not load, bets would not place.

   Two changes hold it down. The interval is two minutes rather than twenty
   seconds, and the poll only runs while the homepage is actually on screen —
   it is the only page showing the tallies it fetches. That is roughly a
   thirtieth of the previous traffic.

   And when Firestore does answer 429, one latch stops every poll for the rest
   of the session and the UI says so, instead of each feature failing silently
   and looking like a bug. */
let _fsQuota=false;
function fsNoteResponse(r){
  if(r&&r.status===429){ _fsQuota=true; try{ leagueStop(); }catch(e){} }
  return r;
}
/* No background polling at all. The shared tallies only move when somebody
   casts a ballot or a vote — a handful of times a week between twelve people —
   so asking on a timer spends the whole day's read allowance to learn nothing
   almost every time. Reads now happen only when something might actually have
   changed:
     · when the dashboard first loads
     · when this manager writes something, which refreshes straight after
     · when the homepage is opened, or the tab comes back to the foreground
   The last one is throttled, so flicking between tabs is not a read per switch.
   That is a few dozen reads a day per manager instead of tens of thousands.

   The one thing this gives up: another manager's ballot landing while you sit
   on the homepage doing nothing will not appear until you leave and come back.
   Seeing that live needs a real-time listener, which the REST API cannot do —
   see the note on leagueStart. */
/* Fifteen minutes, not five. This is the read that fires most often — thirteen
   profile documents every time it runs, on every open homepage — and tripling
   the gap takes two thirds of it off a long visit.

   What it costs is above: another manager's ballot landing while you sit on the
   homepage doing nothing now takes up to a quarter of an hour to appear rather
   than five minutes. Nothing you do yourself waits on it — casting a vote or a
   pick forces a poll — and coming back to the tab still checks. */
const LEAGUE_GAP=15*60*1000;
let _leagueLast=0;
let _leagueTimer=null;
async function leaguePoll(force){
  if(_fsQuota) return;
  if(_activeTab!=='home') return;        // nothing on any other page reads this
  if(!force && Date.now()-_leagueLast<LEAGUE_GAP) return;
  const rows=await gflListProfiles();
  if(!rows) return;
  _cpRows=rows; _cpFetched=true;          // so cpSync does not fetch it again
  const key=motwVoteKey(), tally={};
  rows.forEach(p=>{
    const pick=String(p[key]||'').trim();
    if(!pick) return;
    (tally[pick]||(tally[pick]=[])).push({voter:p.id,team:String(p.teamId||'').trim()});
  });
  _motwVotes=tally;
  try{ renderMotwVoteBar(); }catch(e){}
  try{ renderCoachesPoll(); }catch(e){}
  try{ renderNotifications(); orderHomeTodo(); }catch(e){}
}
/* Firestore's REST API has no subscribe — real-time listeners live in the
   Firebase JS SDK, which this app deliberately does not carry. If live updates
   between open sessions are ever wanted, that is the change to make: a listener
   costs one read per document when it attaches and then only reads documents
   that actually change, which is cheaper than any polling interval. */
function leagueStart(){
  leagueStop();
  leaguePoll(true);
  document.addEventListener('visibilitychange',leagueVis);
}
function leagueVis(){ if(document.visibilityState==='visible') leaguePoll(); }
function leagueStop(){
  if(_leagueTimer) clearInterval(_leagueTimer); _leagueTimer=null;
  document.removeEventListener('visibilitychange',leagueVis);
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
/* The pinned bar carries the week's punishment rather than a live score. It is
   the only place the punishment lives now — the card that used to sit beside
   the video is gone — so it renders from config alone and does not wait on a
   sign-in or a game being in progress. */
function punishBarHTML(){
  const cfg=_CFG.punishment||{};
  if(!cfg.name && cfg.week==null) return '';
  return `<div class="pb-bar">
    <span class="pb-ic">${punishIconHTML(cfg.name)}</span>
    <span class="pb-txt">
      <span class="pb-wk">Week ${cfg.week??'—'} Punishment</span>
      <span class="pb-name">${cfg.name||'TBD'}</span>
    </span>
    <button class="pb-more" onclick="switchTab('punishment')">Details <i class="fa fa-arrow-right"></i></button>
  </div>`;
}
function renderMyMatchupBar(){
  let bar=document.getElementById('my-matchup');
  const html=punishBarHTML();
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
    const p=schedWinProb(rowOf(aOwner),rowOf(bOwner),Number(m.matchupPeriodId)||0);
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
  /* when the board last MOVED, which is no longer the same thing as when it
     was last written — saves are throttled and changes are not */
  const hot=_liveChanged&&Date.now()-_liveChanged<LIVE_HOT_MS;
  const stamp=_liveChanged?`last change ${msgAgo(_liveChanged)}`:'no changes yet';
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

/* how long ago, in words — used by the live board's "last change" stamp */
function msgAgo(ts){
  const s=Math.max(0,(Date.now()-ts)/1000);
  if(s<60) return 'just now';
  if(s<3600) return Math.floor(s/60)+'m ago';
  if(s<86400) return Math.floor(s/3600)+'h ago';
  return Math.floor(s/86400)+'d ago';
}
/* ── THE LEAGUE WEEK ─────────────────────────────────────────────────────────
   Tuesday 6am local: late enough that Monday night is finished and the week is
   genuinely over. tueWeekStart owns the rule, so everything that cares about
   when a week turned over agrees about it. Kept from the message board, which
   is gone — the bets and the forecast still read this. */
function msgWeekStart(now=new Date()){ return tueWeekStart(now); }
const msgKey=()=>`key=${GFL_DB.key}`;

// ── TWO-KEY SIGN IN ──────────────────────────────────────────────────────────
/* Deliberately informal: two keys address a document in Firestore and unlock
   whatever that profile remembers. No accounts, no email, no auth provider.
   Everything here fails soft — if Firestore is unreachable the site behaves
   exactly as it does signed out. */
const GFL_DB={project:'ball-and-chain-dashboard',key:'AIzaSyCOfZYqsD3VZmym7AW0DDX_JQnBYCZhJDA'};
const gflDocUrl=id=>`https://firestore.googleapis.com/v1/projects/${GFL_DB.project}/databases/(default)/documents/profiles/${encodeURIComponent(id)}?key=${GFL_DB.key}`;
const keySlug=s=>String(s||'').trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,60);
let _me=null;                                  // {k1,k2,teamId} once signed in

/* ── THE TESTING PROFILE ─────────────────────────────────────────────────────
   The site was built with a handful of switches thrown: demo notification
   cards so the whole set could be seen out of season, a bucks cycle measured
   in minutes, a plant that dies in ninety seconds, one Ball Knowledge question
   of every kind instead of the weekly five, and a poll that reveals at two
   ballots. Every one of them is now off for the league and on for one account.

   Off rather than deleted. The knobs stay in config.js where they have always
   been, and they still do exactly what their comments say — they just answer
   to whoever is looking. So the next thing can be tried on this profile
   without turning the season back off for eleven other people, which is what
   flipping a global flag amounted to.

   The id is the team's abbreviation slug, the same string sign-in checks, so
   this is the account and not merely the team. Signed out is a real visitor
   and gets the live site. */
/* An account of its own rather than a manager's. Through the build this was
   BFT, which meant the person running the league could not see the site the way
   the league sees it without signing out — and every switch below followed his
   real profile around. 'test' belongs to nobody, holds no team, and appears on
   no board; BFT is now an ordinary manager. */
const TEST_PROFILE='test';
const isTestProfile=()=>!!_me&&_me.k1===TEST_PROFILE;

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
/* No profile-creating helper on purpose. The twelve accounts already exist and
   the app must not be able to mint a thirteenth — restoring a create path is
   what would reopen the hole. New managers get a document added deliberately,
   outside the app. */
async function gflPatchProfile(id,obj){
  const mask=Object.keys(obj).map(k=>`updateMask.fieldPaths=${encodeURIComponent(k)}`).join('&');
  try{ const r=fsNoteResponse(await fetch(gflDocUrl(id)+'&'+mask,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(fsOut(obj))}));
    return r.ok?{ok:true}:{error:r.status===429?'quota':'could not save'};
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
    _leagueLast=Date.now();                 // any full read resets the throttle
    const r=fsNoteResponse(await fetch(url,{cache:'no-store'}));
    if(!r.ok) return null;
    const j=await r.json();
    const rows=(j.documents||[]).map(d=>({id:decodeURIComponent((d.name||'').split('/').pop()||''),...fsIn(d)}));
    /* Only the twelve league accounts count. Documents left over from when
       sign-in would mint one for any name are still in the collection, and two
       of them point at Florida Man — which is why that team was showing up
       twice in the vote badges. Filtering here fixes every tally at once
       rather than each caller remembering to. */
    const allowed=teamAccountIds();
    return allowed.size ? rows.filter(p=>allowed.has(p.id)) : rows;
  }catch(e){ return null; }
}

function signInMsg(t,bad){ const el=document.getElementById('si-msg'); if(!el) return;
  el.textContent=t||''; el.className='si-msg'+(bad?' bad':''); }

/* The league is twelve managers and no more. Sign-in used to create a profile
   for any unrecognised name, which is how bf, tt and idisoxnd came to exist —
   anyone could invent an account and point it at somebody else's team. The
   accounts are now a closed set: the twelve team abbreviations, nothing else,
   and no path that writes a new one. */
/* The twelve team abbreviations, plus the one account that is not a team. The
   closed set is the whole point of this function — sign-in used to mint a
   profile for any name typed at it — so the exception is written here, once,
   rather than by loosening the check. */
const teamAccountIds=()=>{
  const s=new Set(_teams.map(t=>keySlug(t.abbrev||teamInitials(t.name))).filter(Boolean));
  if(s.size) s.add(TEST_PROFILE);
  return s;
};
async function gflSignIn(){
  const k1=(document.getElementById('si-k1')||{}).value||'';
  const k2=(document.getElementById('si-k2')||{}).value||'';
  if(!keySlug(k1)||!String(k2).trim()) return signInMsg('Username and password are both needed.',true);
  const id=keySlug(k1);
  /* Checked against the loaded teams rather than a hard-coded list, so a
     renamed franchise does not lock its manager out. If teams have not loaded
     yet the profile lookup below still gates it — there is no branch that
     creates one either way. */
  const allowed=teamAccountIds();
  if(allowed.size && !allowed.has(id)) return signInMsg('That is not a league account.',true);
  signInMsg('Checking…');
  const res=await gflFetchProfile(id);
  if(res.error) return signInMsg(res.error==='offline'?'No connection — try again.':res.error,true);
  if(res.missing) return signInMsg('That is not a league account.',true);
  if(String(res.data.k2||'')!==String(k2).trim()) return signInMsg('That password does not match.',true);
  /* the team comes off the stored profile, never from whatever the page had
     selected — that was how a made-up account could attach itself to any team */
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
  try{ renderBucksChip(); }catch(e){}
  /* Every team picker on the site opens on the signed-in team. They still hold
     whatever you switch them to while you move around — this only sets the
     starting point, and only on load or on signing in. */
  if(_me&&_me.teamId&&_teams.some(t=>String(t.id)===String(_me.teamId))){
    const tid=String(_me.teamId), owner=_ownerMap[Number(tid)];
    _profileTeam=tid; _schedTeam=tid; _draftTeamSel=tid;
    /* the history and tenure pickers are read straight off the DOM, so setting
       their value is the whole job; the sportsbook keeps its own variable */
    if(owner) _sbTeamSel=owner;
    const setSel=(id,v)=>{ const e=document.getElementById(id);
      if(e&&v!=null&&[...e.options].some(o=>o.value===String(v))) e.value=String(v); };
    setSel('profile-team-select',tid);
    setSel('sched-team-select',tid);
    setSel('draft-team-select',tid);
    setSel('hist-team-select',owner);
    setSel('tenure-team-select',owner);
    setSel('sb-team',owner);
    if(_activeTab==='teams') renderProfile();
    if(_activeTab==='week') renderSchedule();
    if(_activeTab==='draft') try{ renderDraftTeamTable(); }catch(e){}
    if(_activeTab==='history') try{ renderHistoryTable(); }catch(e){}
    if(_activeTab==='tenure') try{ renderTenureTable(); renderTenureEnemies(); }catch(e){}
  }
  try{ eggReset(); }catch(e){}            // this manager's finds, not the last one's
  try{ ttReset(); }catch(e){}             // and whatever has been said to them
  try{ invResetAll(); }catch(e){}         // and whatever they hold
  _lrView=null; _lrPick=false;            // and back to their own locker room
  try{ ntReset(); }catch(e){}             // and their dismissals, from their profile
  try{ renderMotwVoteBar(); }catch(e){}   // pick'em buttons follow sign-in state
  try{ bkReset(); }catch(e){}             // re-pull this manager's saved answers
  try{ pkReset(); }catch(e){}
  try{ _cpBallot=null; _cpFetched=false; _cpJustSent=false; renderCoachesPoll(); }catch(e){}   // a new manager starts fresh
  _rosterCache=null; _rosterTeam=null;
  if(_activeTab==='leaders') renderLeaders();
  if(_activeTab==='week') renderWeek();
}
/* the header button is a sign-in prompt when signed out, and your profile
   page once you are in — the sign-out control moved onto that page */
function meBtnClick(){ if(_me) switchTab('profile'); else openSignIn(); }
/* ── Locker room ────────────────────────────────────────────────────────────
   A pixel-art bay on your profile, in your own colours. Drawn as an SVG on a
   fixed 160x100 grid with shape-rendering:crispEdges, so every rectangle lands
   on a whole pixel and it scales up without going soft — a real bitmap would
   blur or need a dozen assets, one per team.

   Everything on the wall is derived from the team: two colours pulled from the
   logo, the abbreviation on the jersey, and the number of championship banners
   from the honours already computed elsewhere. */
/* ── Superlative keepsakes ──────────────────────────────────────────────────
   One object per honour a team has actually won, placed into the empty parts of
   the room. Kept in its own function on purpose: the room drawing above is the
   design as it stood and is not touched by any of this, so the keepsakes can be
   turned off by simply not calling it.

   Each is meant to be recognisable on its own terms rather than a generic
   trophy with a different label:
     champion    a gold trophy on the shelf, one per title
     conference  a hung plaque beside the locker
     coy         a coach's whistle on the locker hook and a clipboard
     commitment  a packed duffel bag, always there, always ready
     comeback    a roll of tape and a crutch left leaning
     punishment  the beer mug, which is what the punishment usually is
     disappoint  a deflated ball on the floor
*/
/* Each keepsake is wrapped so a tap can name it. The label and the honour it
   came from travel on the group, and the bubble is drawn in HTML over the svg
   rather than inside it — text in a stretched viewBox comes out squashed. */
function lkTag(title, note, body){
  const esc = v => String(v).replace(/"/g, '&quot;');
  return '<g class="lk-item" data-t="' + esc(title) + '" data-n="' + esc(note) +
         '" onclick="lkSay(event)">' + body + '</g>';
}
/* Point a bubble at whatever was tapped. Positioned against the wrapper in
   percentages taken from the item's own box, so it follows the art at any
   width without needing the svg's internal coordinates. */
/* Point a bubble at whatever was tapped, then push it back inside the screen if
   it would hang off an edge. Clamping the anchor in percentages was not enough:
   the bubble is centred on its anchor and can be up to 220px wide, so a
   keepsake near either edge still lost half of it — and now that the art runs
   the full width of the screen, the edges are the screen's edges. So it is
   measured after insertion and clamped in pixels against the viewport, with the
   tail left pointing at the thing that was tapped rather than travelling with
   the box. A bubble that would sit above the top of the screen flips below its
   anchor instead. */
function lkSay(ev){
  const g = ev.currentTarget;
  const wrap = g.closest('.lk-wrap'); if(!wrap) return;
  wrap.querySelectorAll('.lk-bubble').forEach(b => b.remove());
  const wb = wrap.getBoundingClientRect(), gb = g.getBoundingClientRect();
  const anchorX = gb.left + gb.width/2;
  const b = document.createElement('div');
  b.className = 'lk-bubble';
  b.style.left = (anchorX - wb.left) + 'px';
  b.style.top  = (gb.top - wb.top) + 'px';
  b.innerHTML = '<b>' + g.dataset.t + '</b><span>' + g.dataset.n + '</span>';
  wrap.appendChild(b);

  const M = 8;                                    // breathing room at the edge
  const vw = document.documentElement.clientWidth;
  const bw = b.offsetWidth, bh = b.offsetHeight;
  let x = anchorX;                                // where the box wants centring
  if (x - bw/2 < M)      x = M + bw/2;
  if (x + bw/2 > vw - M) x = vw - M - bw/2;
  b.style.left = (x - wb.left) + 'px';
  /* the tail stays under the keepsake, however far the box had to move */
  const tail = Math.max(12, Math.min(bw - 12, anchorX - (x - bw/2)));
  b.style.setProperty('--lk-tail', tail + 'px');

  /* not enough room above? sit under the keepsake and turn the tail over */
  if (gb.top - bh - 10 < M) {
    b.classList.add('below');
    b.style.top = (gb.bottom - wb.top) + 'px';
  }
  /* and if it still hangs off the top or the bottom — a keepsake can be right
     at the edge of the art with the art itself at the edge of the screen —
     shift it back by however much it overhangs. Measured rather than computed,
     because the transform differs between the two positions. */
  const vh = document.documentElement.clientHeight;
  const br = b.getBoundingClientRect();
  let dy = 0;
  if (br.top < M) dy = M - br.top;
  else if (br.bottom > vh - M) dy = -(br.bottom - (vh - M));
  if (dy) b.style.top = (parseFloat(b.style.top) + dy) + 'px';

  requestAnimationFrame(() => b.classList.add('in'));
  clearTimeout(lkSay._t);
  lkSay._t = setTimeout(() => { b.classList.remove('in');
    setTimeout(() => b.remove(), 220); }, 3200);
  ev.stopPropagation();
}
function lockerSupsSVG(owner,at,P,c1,c2,c3,dk,dp){
  const aw=(typeof awardsForOwner==='function')?(awardsForOwner(owner)||[]):[];
  const has=k=>aw.some(a=>a.key===k);
  const n=k=>aw.filter(a=>a.key===k).length;
  const rings=Number(at&&at.rings)||0, confs=Number(at&&at.confs)||0;
  const out=[];

  // champion — trophies on the shelf, in the gap between helmet and ball
  for(let i=0;i<Math.min(rings,3);i++){
    const x=512+i*38;
    out.push(lkTag('Championship trophy','GFL champion — '+rings+' title'+(rings>1?'s':''),
      P(x+8,37,14,20,'#e8c15a')+P(x+8,37,14,4,'#f6dc9a')      // cup + lit rim
      +P(x+4,34,22,5,'#f0d68a')
      +P(x+2,43,5,9,'#e8c15a')+P(x+23,43,5,9,'#e8c15a')       // handles
      +P(x+12,57,6,11,'#c99a34')                               // stem
      +P(x+5,68,20,8,'#8a6a24')+P(x+5,68,20,2,'#a8842e')));    // base
  }
  // conference — a plaque hung on the wall right of the locker
  if(confs){
    out.push(lkTag('Conference plaque','Conference champion — '+confs+' title'+(confs>1?'s':''),
      P(794,160,100,72,'#4a3a2a')+P(794,160,100,4,'#5f4c36')
      +P(802,168,84,56,'#6b5a44')+P(802,168,84,3,'#7d6a52')
      +P(812,182,62,7,c1)+P(812,198,46,5,'#d8c9a8')
      +P(812,210,34,5,'#d8c9a8')
      +(confs>1?P(858,206,22,14,'#e8c15a')+P(858,206,22,3,'#f6dc9a'):'')));
  }
  // coach of the year — whistle on the locker hook, clipboard leaning
  if(has('coy')){
    out.push(lkTag("Coach's whistle",'Coach of the Year',
      P(702,188,6,36,'#8a8f98')                                // lanyard
      +P(690,224,28,16,'#c9ccd2')+P(690,224,28,3,'#e0e3e8')
      +P(716,229,10,7,'#c9ccd2')+P(696,229,7,7,'#5a5f68')));
  }
  if(has('coy')){
    out.push(lkTag('Clipboard','Coach of the Year',
      P(788,370,46,70,'#c9ccd2')+P(788,370,46,3,'#e0e3e8')
      +P(793,376,36,58,'#ececf2')
      +P(799,364,24,10,'#8a8f98')+P(799,362,24,3,'#9aa0a8')
      +P(797,390,27,4,'#9a9aa6')+P(797,401,20,4,'#9a9aa6')+P(797,412,24,4,'#9a9aa6')));
  }
  // commitment — a packed duffel by the locker
  if(has('commitment')){
    out.push(lkTag('Packed duffel','Commitment award',
      P(286,390,98,50,dk)+P(286,390,98,5,c2)
      +P(286,432,98,8,dp)                                      // shaded underside
      +P(308,382,56,9,dk)+P(322,373,28,9,dk)                   // handles
      +P(296,406,78,6,c1,'0.7')+P(296,414,78,3,dp,'0.5')
      +P(366,400,14,20,'#2a2a33')+P(366,400,14,3,'#3a3a46')));
  }
  // comeback — tape roll and a crutch leaning on the post
  if(has('comeback')){
    out.push(lkTag('Roll of tape','Comeback of the Year',
      P(1174,400,40,40,'#e8e4d8')+P(1174,396,40,6,'#f4f0e4')
      +P(1186,412,17,17,'#26262c')+P(1188,414,13,13,'#4a453c')
      +P(1174,432,40,8,'#cfcabb')
      +P(1214,417,13,5,'#f4f0e4')+P(1214,422,13,2,'#cfcabb')));
    out.push(lkTag('Crutch','Comeback of the Year',
      P(754,200,10,238,'#c9b48a')+P(754,200,3,238,'#dcc79c')
      +P(741,195,36,11,'#c9b48a')+P(741,195,36,3,'#dcc79c')
      +P(746,275,26,8,'#b09a70')));
  }
  // punishment — the beer mug on the desk
  if(has('punishment')){
    const nx=1014;
    out.push(lkTag('Beer mug','Punishment served — '+n('punishment')+'x',
      P(nx,272,40,42,'#d8a24a')+P(nx,272,40,4,'#e8b86a')
      +P(nx,264,40,10,'#f0e6c8')+P(nx,262,40,4,'#f8f2de')      // head
      +P(nx+40,284,12,19,'#d8a24a')                            // handle
      +P(nx+4,282,5,26,'#e8b86a','0.7')
      +(n('punishment')>1?P(nx+58,284,28,30,'#d8a24a')+P(nx+58,276,28,9,'#f0e6c8'):'')));
  }
  // most disappointing — a deflated ball on the floor
  if(has('disappoint')){
    out.push(lkTag('Deflated ball','Most Disappointing',
      P(544,470,58,20,'#5a3a1e')+P(552,464,42,7,'#6b4423')
      +P(544,486,58,5,'#3f280f')
      +P(562,474,22,4,'#e8e8e8','0.7')));
  }
  return out.join('');
}
/* opts: {plant, canWater}. A visited locker room draws the plant belonging to
   whoever lives there, and does not let you water it — a plant is a pet, and
   feeding someone else's would go down on their record as their watering. */
function lockerRoomHTML(t,opts){
  if(!t) return '';
  const O=opts||{};
  const owner=_ownerMap[t.id];
  const at=owner?franchiseAllTime(owner):null;
  const rings=Number(at&&at.rings)||0;
  const ab=(t.abbrev||teamInitials(t.name)||'GFL').slice(0,4).toUpperCase();
  const parse=s=>{
    if(!s) return [138,143,152];
    const m=String(s).match(/rgba?\((\d+)[ ,]+(\d+)[ ,]+(\d+)/);
    if(m) return [+m[1],+m[2],+m[3]];
    const h=String(s).replace('#','');
    if(h.length===6) return [0,2,4].map(i=>parseInt(h.slice(i,i+2),16));
    return [138,143,152];
  };
  const base=parse(_logoColorCache[t.id]||teamColor(t.id));
  const mix=(rgb,to,k)=>'rgb('+rgb.map((v,i)=>Math.round(v+(to[i]-v)*k)).join(',')+')';
  const c1='rgb('+base.join(',')+')';
  const cL=mix(base,[255,255,255],0.16);        // lit edge
  const c2=mix(base,[255,255,255],0.30);
  const c3=mix(base,[255,255,255],0.58);
  const dk=mix(base,[0,0,0],0.46);
  const dp=mix(base,[0,0,0],0.66);
  const dv=mix(base,[0,0,0],0.80);              // deepest shadow
  /* 2560x1120 — twice the grid in each direction. Every coordinate below is
     still written in the old 1280x560 space and P doubles it on the way out,
     so nothing moved; what the extra grid buys is R, which draws in raw units
     and can therefore put a line half a block wide. The fine passes marked
     "R:" are the new pixels: brighter one-unit highlights riding on top of the
     lit edges, one-unit shadow lines under them, finer wall and wood grain,
     and hairlines around the vents and seams. Same room, same objects, same
     positions — just resolved twice as finely. */
  const S=2;
  const R=(x,y,w,h,f,o)=>'<rect x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" fill="'+f+'"'+(o?' opacity="'+o+'"':'')+'/>';
  const P=(x,y,w,h,f,o)=>R(x*S,y*S,w*S,h*S,f,o);
  const W=2560,H=1120;
  const FLOOR=440;                      // still base units; P scales it

  /* Championship banners, hung from a rod in the top-left band — the shelf
     owns x 381 on. Each carries the year it was won, which is the thing a
     banner is actually for, and is tappable like a keepsake.
     Sized off the room rather than off a phone: the whole 1280-unit room is
     drawn into about 375px, so a banner has to be around 80 units wide before
     its year survives that scale as readable text. Width and pitch both come
     down as the titles pile up, so six still fit clear of the shelf.
     Years come from the same map the Playoff Hardware tiles caption themselves
     with. On a cold profile load the league history may not have run yet, so a
     banner with no year still hangs — it just says nothing. */
  const pennants=(()=>{
    const yrs=(_profileHonorYears[owner]&&_profileHonorYears[owner].champ)||[];
    const n=Math.min(rings,6);
    if(!n) return '';
    const w=n<=4?80:(n===5?64:54);
    const h=Math.round(w*1.45);
    const pitch=n<2?0:Math.min(w+8,Math.floor((338-w)/(n-1)));
    /* Courier advances 0.6em a glyph, so a three-glyph year runs 1.8 font
       sizes wide — anything past w*0.45 spills off the banner and into its
       neighbour. This lands about 10px tall on a phone, which reads. */
    const fsz=Math.round(w*0.44);
    return Array.from({length:n},(_,i)=>{
      const x=36+i*pitch, cx=x+Math.round(w/2), yr=yrs[i]||'';
      /* the face carries the short year the way the league writes it, 24' */
      const face=yr?yr.replace("'",'')+String.fromCharCode(8217):'';
      const body=
        P(x-4,2,w+8,5,'#3a3a46')+P(x-4,2,w+8,2,'#4a4a58')          // rod
        +P(x,7,w,h,c2)+P(x,7,w,5,c3)                                // body + top hem
        +P(x+w-6,12,6,h-5,dk,'0.55')                                // shaded edge
        +R((x+2)*S,(7+h)*S-2,(w-4)*S,2,dv,'0.35')                   // R: fold above the tail
        +P(x+3,7+h,w-6,8,c2)                                        // tail
        +P(x+Math.round(w*0.22),15+h,Math.round(w*0.56),8,c2)
        +P(x+Math.round(w*0.40),23+h,Math.round(w*0.20),7,c2)
        +P(cx-7,16,14,11,'#e8c15a')+P(cx-7,16,14,3,'#f6dc9a')       // little trophy
        +P(cx-3,27,6,5,'#c99a34')+P(cx-10,32,20,5,'#8a6a24')
        +(yr?'<text x="'+(cx*S)+'" y="'+Math.round((7+h*0.74)*S)+'" text-anchor="middle"'
          +' font-family="\'Courier New\',monospace" font-size="'+(fsz*S)+'" font-weight="700"'
          +' fill="'+dv+'">'+face+'</text>':'');
      return lkTag('Championship banner',
        yr?('GFL champion — '+yr.replace("'","20")):'GFL champion', body);
    }).join('');
  })();

  const st=O.plant||plantStage();
  const canWater=O.canWater!==false;
  /* No heading of its own: the page is called My Locker Room, and a second
     "Locker Room" directly under it was the same word twice. */
  return '<div class="lk-block">'
    +'<div class="lk-wrap">'
    +'<svg class="lk-svg" viewBox="0 0 '+W+' '+H+'" shape-rendering="crispEdges" role="img"'
    +' aria-label="Pixel art locker room for '+t.name+'">'
      +R(0,0,W,H,'#1b1b20')
      +R(0,0,W,196,'#15151a')
      +P(0,96,W/S,3,dv)+P(0,99,W/S,2,'#25252d')
      /* panelled wall: a groove, a lit return and — R: — a hairline core */
      +Array.from({length:32},(_,i)=>P(i*40,101,2,FLOOR-101,'#1f1f26')
        +P(i*40+2,101,1,FLOOR-101,'#26262f')
        +R(i*80+3,202,1,(FLOOR-101)*S,'#15151a')).join('')
      +pennants

      /* ── THE LOCKER ────────────────────────────────────────────────────── */
      +P(400,115,334,325,dp)                       // interior
      +P(400,115,334,10,c1)+P(400,125,334,3,cL)    // top rail + lit edge
      +R(800,230,668,1,c3,'0.55')                  // R: hairline along the rail
      +P(392,115,8,325,'#2e2e38')+P(392,115,3,325,'#3a3a46')   // left post
      +P(734,115,8,325,'#2e2e38')+P(739,115,3,325,'#26262e')   // right post
      +R(785,230,1,650,'#4a4a58','0.6')            // R: lit nose on the left post
      +P(400,115,334,4,dv,'0.6')                   // inner top shadow
      +P(400,430,334,10,'#26262e')+P(400,428,334,2,'#33333e')  // base
      /* vent slots down the back panel, each with — R: — a lit lower lip and a
         one-unit core, which is what makes a slot read as cut rather than drawn */
      +Array.from({length:6},(_,i)=>P(414,150+i*46,10,22,dv)+P(710,150+i*46,10,22,dv)
        +R(828,300+i*92,20,1,'#000','0.55')+R(1420,300+i*92,20,1,'#000','0.55')
        +R(828,343+i*92,20,1,cL,'0.30')+R(1420,343+i*92,20,1,cL,'0.30')).join('')
      /* nameplate */
      +P(500,128,134,34,dv)+P(504,132,126,26,c1)+P(504,132,126,3,cL)
      +'<text x="1134" y="302" text-anchor="middle" font-family="\'Courier New\',monospace"'
      +' font-size="34" font-weight="700" fill="'+c3+'">'+ab+'</text>'
      /* hanger and jersey */
      +P(562,186,10,22,'#3a3a44')+P(560,184,14,4,'#4a4a56')
      +P(534,208,66,6,'#3a3a44')
      +P(494,216,146,140,c1)                       // body
      +P(494,216,146,4,cL)                         // lit shoulder line
      +R(988,432,292,1,c3,'0.5')                   // R: hairline on the shoulder
      +R(988,712,292,1,dv,'0.35')                  // R: crease above the hem
      +R(1132,440,1,272,dv,'0.22')+R(1136,440,1,272,cL,'0.18')  // R: centre seam
      +P(462,224,32,58,c1)+P(640,224,32,58,c1)     // sleeves
      +P(462,224,32,3,cL)+P(640,224,32,3,cL)
      +P(462,258,32,8,c2)+P(640,258,32,8,c2)       // cuffs
      +P(462,270,32,12,c1)+P(640,270,32,12,c1)
      +P(494,232,146,4,dv,'0.35')                  // seam under the shoulders
      +P(528,216,78,14,c3)                         // collar
      +P(534,230,66,4,dv,'0.4')
      +P(494,342,146,14,c2)+P(494,354,146,3,dv,'0.4')   // hem
      +P(510,254,114,58,dv)+P(512,256,110,54,dp)   // number panel
      +'<text x="1134" y="592" text-anchor="middle" font-family="\'Courier New\',monospace"'
      +' font-size="80" font-weight="700" fill="'+c3+'">'+ab+'</text>'
      /* cleats on the locker floor */
      +P(424,394,58,26,c2)+P(424,390,58,5,c3)+P(424,414,58,6,dv,'0.5')
      +Array.from({length:4},(_,i)=>P(432+i*12,398,5,5,dv,'0.5')).join('')
      +P(496,394,58,26,c2)+P(496,390,58,5,c3)+P(496,414,58,6,dv,'0.5')

      /* ── THE SHELF ─────────────────────────────────────────────────────── */
      +P(381,80,371,14,'#3a3a46')+P(381,76,371,6,'#50505e')+P(381,94,371,4,'#2a2a33')
      +P(400,94,12,21,'#2a2a33')+P(722,94,12,21,'#2a2a33')     // brackets
      /* helmet */
      +P(426,34,60,42,c1)+P(426,34,60,5,cL)
      +P(418,50,9,20,c1)+P(486,50,20,7,c3)+P(486,60,14,6,c3)   // facemask bars
      +P(434,28,44,7,c3)+P(452,28,8,48,c3,'0.6')               // stripe
      /* ball */
      +P(626,40,54,36,'#6b4423')+P(626,40,54,5,'#7d5430')
      +P(640,56,26,5,'#e8e8e8')
      +Array.from({length:4},(_,i)=>P(644+i*6,52,3,13,'#e8e8e8')).join('')
      +P(620,50,7,16,'#5a3a1e')+P(680,50,7,16,'#5a3a1e')

      /* ── THE DESK ──────────────────────────────────────────────────────── */
      +P(827,315,340,18,'#4a3d33')+P(827,311,340,6,'#5f4e40')  // top + lit edge
      +P(827,333,340,5,'#33291f')                              // underside shadow
      +Array.from({length:9},(_,i)=>P(840+i*36,318,26,2,'#54463a','0.6')).join('')  // grain
      /* R: half-width grain between the boards, and a lit nose on the front edge */
      +Array.from({length:9},(_,i)=>R(1716+i*72,646,38,1,'#5f5044','0.45')).join('')
      +R(1654,622,680,1,'#75604e','0.6')
      +P(837,338,108,102,'#3a2f27')                            // drawer stack
      +P(841,346,100,26,'#463930')+P(841,344,100,2,'#54463a')
      +P(841,376,100,26,'#463930')+P(841,374,100,2,'#54463a')
      +P(841,406,100,26,'#463930')+P(841,404,100,2,'#54463a')
      +P(875,356,32,5,'#7a6a56')+P(875,386,32,5,'#7a6a56')+P(875,416,32,5,'#7a6a56')
      +P(1130,338,20,102,'#3a2f27')+P(1130,338,4,102,'#48392e') // far leg
      /* lamp */
      +P(1122,256,12,59,'#2f2f38')+P(1122,256,4,59,'#3d3d48')   // neck
      +P(1110,308,36,7,'#3f3f4a')+P(1110,306,36,3,'#50505e')     // foot
      +P(1104,226,48,7,'#c9843a')+P(1104,224,48,3,'#dc9a4e')     // shade, narrow at the top
      +P(1097,233,62,9,'#b8742e')
      +P(1090,242,76,11,'#a8682a')+P(1090,251,76,3,'#8a5320')
      +P(1098,253,60,5,'#f8f0c8')                                // bulb
      +P(1092,258,72,10,'#f8e9b0','0.10')                        // spill, kept faint —
      +P(1084,268,88,14,'#f8e9b0','0.07')                        // any denser and the
      +P(1076,282,104,18,'#f8e9b0','0.045')                      // cone reads as a solid
      +P(1072,311,95,5,'#f8e9b0','0.22')                         // pool on the desktop
      /* playbook and paper */
      +P(840,282,82,30,c1)+P(840,282,82,3,cL)
      +P(846,288,70,5,c3)+P(846,299,48,4,c3,'0.7')
      +P(932,292,74,22,'#e6e6ee')+P(932,290,74,3,'#f4f4fa')
      +P(940,298,58,3,'#9a9aa6')+P(940,305,42,3,'#9a9aa6')
      /* stool tucked under */
      +P(986,338,70,11,'#3a2f27')+P(986,335,70,3,'#4a3d33')
      +P(994,349,10,62,'#2a2119')+P(1040,349,10,62,'#2a2119')
      +P(994,382,56,7,'#2a2119')

      +lockerSupsSVG(owner,at,P,c1,c2,c3,dk,dp)

      /* ── THE PLANT ─────────────────────────────────────────────────────── */
      +(canWater
        ? '<g class="lk-plantg" role="button" tabindex="0" onclick="waterPlant()"'
          +' onkeypress="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();waterPlant();}">'
        : '<g class="lk-plantg lk-plant-ro" role="img" aria-label="Their plant is '+st.label.toLowerCase()+'">')
        +P(70,250,190,190,'#000','0')
        +plantSVG(st.stage,P)
        /* A proper can: arched handle, a rim wider than the body, a tapered
           tin, and a spout that climbs out of the shoulder to a flared rose.

           Aimed by measurement rather than by eye. The plant as drawn occupies
           x 154..230 on this grid and centres on 192; tipping the can 22
           degrees clockwise about its own bounding-box centre carries the rose
           to exactly that x, which is what puts the water on the plant instead
           of on the floor beside it. It is held clear of the bloom, whose top is
           y 276, so the stream is visible rather than the spout resting on the
           flower. Move either piece and the rose has to be re-aimed with it. */
        +'<g class="lk-can">'
          /* handle */
          +P(117,210,8,15,'#8b95a1')+P(125,204,28,8,'#9aa4b0')+P(147,210,8,15,'#8b95a1')
          /* rim, then the tin */
          +P(109,224,56,8,'#b4bcc6')
          +P(113,232,48,26,'#9aa4b0')
          +P(115,258,44,9,'#7d8792')
          +P(119,267,36,6,'#6d7681')
          /* a seam down the tin so it does not read as a flat slab */
          +P(121,232,4,26,'#a8b2be')
          /* spout climbing out of the shoulder */
          +P(159,237,14,9,'#9aa4b0')+P(171,243,14,9,'#9aa4b0')+P(183,249,12,9,'#8b95a1')
          /* the rose on the end */
          +P(193,245,10,16,'#b4bcc6')+P(203,249,5,9,'#7d8792')
        +'</g>'
        /* drawn where the rose ends up once the can has tipped, so the water
           leaves the spout instead of appearing beside it */
        +'<g class="lk-drops">'
          +P(186,270,7,11,'#5bc8f5')+P(191,280,7,11,'#7fd8f8')+P(185,290,7,9,'#5bc8f5')
        +'</g>'
      +'</g>'

      /* ── FLOOR ─────────────────────────────────────────────────────────── */
      +R(0,FLOOR*S,W,H-FLOOR*S,'#121216')
      +P(0,FLOOR,W/S,4,'#2a2a33')
      +R(0,FLOOR*S-1,W,1,'#3a3a46','0.5')         // R: lit nose on the floor edge
      +Array.from({length:32},(_,i)=>P(i*40,FLOOR,38,3,'#22222a')).join('')
      +Array.from({length:16},(_,i)=>P(i*80,FLOOR+42,78,3,'#1c1c23')).join('')
      +Array.from({length:16},(_,i)=>P(i*80,FLOOR+92,78,3,'#191920')).join('')
      /* R: a hairline seam between every board, which at the old grid would
         have been a full block and read as a stripe rather than a joint */
      +Array.from({length:32},(_,i)=>R(i*80,FLOOR*S+6,80,1,'#0e0e12','0.7')).join('')
      +Array.from({length:16},(_,i)=>R(i*160,FLOOR*S+90,158,1,'#0e0e12','0.55')).join('')
      +P(400,FLOOR,334,10,'#000','0.28')          // shadow cast by the locker
      +P(827,FLOOR,340,8,'#000','0.22')           // and by the desk
    +'</svg>'
  +'</div></div>';
}

/* ── The locker room plant ──────────────────────────────────────────────────
   Six stages. It holds for one watering interval, then loses a stage for every
   interval that passes without one — thriving, healthy, dry, drooping, wilting,
   dead. Watering at any point resets it to thriving, including from dead: the
   alternative is a profile with a permanently dead plant on it, which is a
   worse thing to own than a forgiving one.

   Left alone it forgives itself, eventually. Two days after it dies the league
   revives it and bills the owner a Plant Revival Fee, and the seven days start
   again — so an abandoned plant is a standing charge rather than a headstone.
   Watering it is what stops that; it is not a way of getting the money back.

   State is a single timestamp, kept per profile so it follows a manager, with
   localStorage covering signed-out and acting as the instant write. Both the
   stage and the number of revivals are read out of that one number — see
   plantStageOf for why nothing is written when a plant comes back. */
const PLANT_STAGES=['Thriving','Healthy','Getting dry','Drooping','Wilting','Dead'];
const plantKey=()=>'plant_'+(_me?_me.k1:'guest');
/* The interval belongs to the PLANT, not to whoever is looking at it. A stage
   is worked out from a watering time rather than stored, so reading the clock
   off the viewer meant one manager's setting rewrote every plant on the site:
   the testing profile watched the whole league wither at fifteen seconds a
   stage, and the league saw the testing profile's plant frozen at thriving.
   Twelve plants, twelve timers, each answering to its own owner. */
/* ── ONE STAGE A DAY, AND THE WEEK IT ADDS UP TO ─────────────────────────────
   A day per stage. Six labels means five steps between the first and the last,
   so a plant nobody waters is dead on the fifth day — and the day is the unit
   people actually think in, which the old fifth-of-a-week (33 hours and 36
   minutes) was not: it drifted round the clock, so the stage you found it at
   depended on what time you happened to look.

   Then it stays dead for two days and comes back on its own. That is what
   makes the whole thing a CYCLE rather than a dead end — five drying, two
   dead, seven in total, and the eighth day is the first day of the next one.
   Coming back is not free: see plantFee. */
const PLANT_STEP_MS=24*3600*1000;                     // a day, a stage
const PLANT_DRY_STEPS=PLANT_STAGES.length-1;          // 5 — thriving to dead
const PLANT_DEAD_STEPS=2;                             // 2 — how long it lies dead
const PLANT_CYCLE_STEPS=PLANT_DRY_STEPS+PLANT_DEAD_STEPS;   // 7 — and round again
const plantMsFor=id=>{
  const m=Number(String(id||'')===TEST_PROFILE?(_CFG.plantTestMinutes??0):0);
  return m>0?m*60*1000:PLANT_STEP_MS;
};
/* A stage from any watering timestamp. Visiting another locker room needs
   their plant, not yours, so it takes whose plant it is as well as when it was
   last watered — theirs both arrive off their profile.

   NOTHING IS WRITTEN WHEN A PLANT REVIVES. The obvious way to build a revival
   is a job that notices a dead plant, resets its timestamp and records the
   charge — which needs somebody to be looking at the right moment, and there
   is no server here to be that somebody. So the revival is DERIVED instead,
   exactly the way the stage already is: the elapsed time is divided by the
   seven-day cycle, and the whole part of that division is how many times this
   plant has died and come back. The remainder is where it stands today.

   Everyone therefore computes the same answer from the one timestamp, whether
   or not the owner has opened the site since — a plant left alone for a month
   has revived four times to every viewer, and the bank agrees, because the
   bank is reading this same number. There is nothing to keep in sync and
   nothing to race.

   Stages 5 and 6 of a cycle are both Dead: the label list stops at five, so
   the clamp holds it there for the two dead days rather than running off the
   end of the array. */
function plantStageOf(raw,ownerId){
  raw=Number(raw||0);
  if(!raw) return {stage:0,label:PLANT_STAGES[0],fresh:true,revivals:0};
  const step=plantMsFor(ownerId), cycle=PLANT_CYCLE_STEPS*step;
  const gone=Math.max(0,Date.now()-raw);
  const revivals=Math.floor(gone/cycle);
  const stage=Math.min(PLANT_DRY_STEPS,Math.floor((gone-revivals*cycle)/step));
  return {stage,label:PLANT_STAGES[stage],fresh:false,revivals};
}
function plantStage(){ return plantStageOf(localStorage.getItem(plantKey()),_me&&_me.k1); }
async function waterPlant(){
  const now=String(Date.now());
  localStorage.setItem(plantKey(),now);
  /* Play the pour before repainting. Re-rendering immediately would replace the
     node mid-animation and nothing would be seen; the room is redrawn once the
     can has finished, which is also when the new stage should appear. */
  const g=document.querySelector('.lk-plantg');
  if(g){
    g.classList.add('watering');
    setTimeout(()=>{ renderMyProfile(); },1150);
  }else renderMyProfile();
  if(_me){ try{ await gflPatchProfile(_me.k1,{plantWatered:now}); }catch(e){} }
}
async function plantSync(){
  if(!_me) return;
  try{
    const res=await gflFetchProfile(_me.k1);
    const srv=res&&res.data?Number(res.data.plantWatered||0):0;
    const loc=Number(localStorage.getItem(plantKey())||0);
    if(srv>loc){ localStorage.setItem(plantKey(),String(srv)); renderMyProfile(); }
  }catch(e){}
}
/* Each stage is drawn rather than tinted, so the shape changes as it declines:
   upright and full, then shorter, then leaves angling down, then bare. */
/* Each stage is drawn rather than tinted, so the shape changes as it declines:
   upright and full, then shorter, then leaves angling down, then bare. Drawn to
   sit on the stool at x 28..84, whose top is y 193. */
/* Each stage is drawn rather than tinted, so the shape changes as it declines:
   upright and full, then shorter, then leaves angling down, then bare. It sits
   on the near end of the desk, whose top is y 236. */
/* Each stage is drawn rather than tinted, so the shape changes as it declines:
   upright and full, then shorter, then leaves angling down, then bare.
   It stands on the floor in the open space left of the locker — the locker's
   post is at x 294, so the pot is centred on x 147, and the floor line is
   y 330, so the pot sits on it. */
/* Each stage is drawn rather than tinted, so the shape changes as it declines:
   upright and full, then shorter, then leaves angling down, then bare. It
   stands on the floor in the open space left of the locker, whose post is at
   x 392 — so the pot centres on x 196 and sits on the floor line, y 440.
   Leaves are drawn in two tones with a darker underside, which is what stops a
   healthy plant reading as a flat green blob at this size. */
/* Each stage is drawn rather than tinted, so the shape changes as it declines:
   upright and flowering, then shorter, then leaves angling down, then a bare
   stem over shed leaves. It stands on the floor in the open space left of the
   locker, whose post is at x 392 — so the pot centres on x 196 and its base
   sits on the floor line, y 440.
   A leaf is three stepped bands narrowing to a tip, not a flat bar: at this
   resolution the taper is what stops a healthy plant reading as a stack of
   green dashes. Every leaf also carries a shaded lower edge and a midrib. */
/* Kept deliberately simple: a small pot and a handful of leaves, drawn in one
   flat green with a shaded underside. The stages change its shape rather than
   only its colour — upright, then shorter, then hanging, then a bare stem over
   shed leaves. Coordinates are in the base 1280x560 space; P doubles them.
   Leaves are staggered rather than mirrored in pairs, and the stem leans a
   little, so it does not read as a symmetrical fir tree the way an evenly
   paired plant does. */
function plantSVG(stage,P){
  const cx=192, potW=52, potH=42;
  const potX=cx-potW/2, potTop=440-potH;                    // 398
  const pot=P(potX,potTop,potW,potH,'#8a5a3a')
    +P(potX,potTop,potW,8,'#9a6a46')                        // lit rim
    +P(potX-6,potTop-7,potW+12,8,'#7a4a2e')                 // lip
    +P(potX+potW-8,potTop+8,8,potH-8,'#6d3f26','0.7')       // shaded side
    +P(potX+6,potTop+14,5,18,'#a0745a','0.4')               // highlight
    +P(potX+6,potTop+5,potW-12,7,'#3a2a1e');                // soil
  const G =['#4ade80','#3fc46e','#8ab84a','#b0a03a','#8a6a30','#6b5030'][stage];
  const GD=['#2f9e5c','#2c8f50','#668f34','#867a26','#664e22','#4e3a24'][stage];
  /* the stem always reaches the soil */
  const stem=(y,lean)=>P(cx-4+(lean||0),y,8,404-y,G)+P(cx+1+(lean||0),y,3,404-y,GD,'0.5');

  /* A leaf, not a dash. It is drawn as a run of columns that climb as they go
     out, each column as tall as the leaf is thick at that point: thin where it
     joins the stem, fattest a third of the way along, closing to a point.

     Two things do the work. The taper is one — with ten pixels of height to say
     "leaf" in, a flat bar says "green dash", which is what these were. The
     climb is the other, and it matters as much: leaves coming straight out of a
     stalk at ninety degrees are branches, and five of them stacked up read as a
     fir tree however nicely each one is shaped.

     rise is a fraction of the leaf's own height and is the whole wilt. Positive
     and the leaf lifts away from the stem; zero and it sits flat; negative and
     it hangs. So the decline down the stages is one number moving, not six
     drawings of different things, and the shape stays a leaf the whole way
     down instead of turning back into rectangles at the bottom.

     dir is which way the tip points. x is the left edge either way. */
  const LEAFCOL=[0.34,0.72,1,0.98,0.86,0.68,0.46,0.24];
  const leafAt=(x,y,w,h,dir,rise,o)=>{
    const n=LEAFCOL.length, cw=Math.max(2,Math.round(w/n));
    const climb=Math.round(h*(rise==null?0.85:rise));
    let s='';
    for(let i=0;i<n;i++){
      const bh=Math.max(2,Math.round(h*LEAFCOL[i]));
      const bx=dir<0?x+w-cw*(i+1):x+cw*i;
      const by=Math.round(y+(h-bh)/2-climb*(i/(n-1)));
      s+=P(bx,by,cw,bh,G,o)+P(bx,by+bh-2,cw,2,GD,o||'0.55');
      if(bh>=5) s+=P(bx,Math.round(by+bh/2-1),cw,1,GD,o||'0.40');   // midrib
    }
    return s;
  };
  const leafR=(x,y,w,h,rise)=>leafAt(x,y,w,h,1,rise);
  const leafL=(x,y,w,h,rise)=>leafAt(x,y,w,h,-1,rise);
  /* shed leaves lie flat, and fade as they go */
  const fallen=(x,y,w,o)=>leafAt(x,y,w,7,x<cx?-1:1,0,o);
  let p='';
  if(stage===0){
    p=stem(300,1)
      +leafR(196,326,30,13,0.9)+leafL(158,340,30,13,0.9)
      +leafR(196,352,25,11,0.85)+leafL(164,310,26,11,0.85)
      +leafR(196,300,23,10,0.8)
      +P(180,282,22,12,'#f0a0c0')+P(186,276,12,7,'#f8c0d8');   // one small bloom
  }else if(stage===1){
    p=stem(322,1)
      +leafR(196,346,28,12,0.75)+leafL(162,360,28,12,0.75)
      +leafR(196,370,23,10,0.7) +leafL(168,330,25,10,0.7);
  }else if(stage===2){
    /* still up, but no longer reaching */
    p=stem(350)
      +leafR(196,366,26,11,0.25)+leafL(166,378,26,11,0.2)
      +leafR(196,386,21,9,0.15);
  }else if(stage===3){
    /* they have started to hang */
    p=stem(372)
      +leafR(196,378,24,10,-0.85)
      +leafL(168,386,24,10,-0.85)
      +fallen(126,433,17,'0.7');            // the first one to let go
  }else if(stage===4){
    p=stem(386)
      +leafR(196,388,21,9,-1.5)
      +leafL(171,392,21,9,-1.5)
      +fallen(120,433,18,'0.7')+fallen(248,433,18,'0.6');
  }else{
    /* A bare stalk and one leaf that has not fallen yet. It has to hang clear
       of the pot lip at y 391 or it reads as an empty pot with a stick in it —
       the last leaf is the whole difference between dead and never planted. */
    p=stem(374)+leafL(176,372,15,7,-1.4)
      +fallen(114,433,20,'0.5')+fallen(246,433,20,'0.45')+fallen(180,435,18,'0.4');
  }
  return pot+p;
}
/* ── VISITING SOMEBODY ELSE'S ROOM ───────────────────────────────────────────
   The page is a room, and a room is a thing you can be shown round. _lrView
   holds whose room is on screen — null for your own — and everything personal
   in the furniture comes off while you are somebody else's guest: the plant is
   theirs and cannot be watered, and your own egg count and sign-out have no
   business on their wall. */
let _lrView=null, _lrPick=false, _lrPlants=null, _lrPlantsBusy=false;
function lrVisit(id){ _lrView=String(id)===String(_me&&_me.teamId)?null:String(id); _lrPick=false; renderMyProfile(); }
function lrHome(){ _lrView=null; _lrPick=false; renderMyProfile(); }
function lrTogglePick(){ _lrPick=!_lrPick; renderMyProfile(); }
/* Every manager's last watering in one read, so a visited room shows the plant
   its owner has actually been keeping rather than a copy of yours. */
function lrPlantSync(){
  if(_lrPlants||_lrPlantsBusy) return;
  /* the homepage poll already reads the same collection — use what it has
     rather than asking Firestore for all twelve again */
  /* the account id rides along with the timestamp, because the stage needs to
     know whose plant it is to know how fast it dries out */
  const row=p=>({t:Number(p.plantWatered||0), id:p.id});
  if((_cpRows||[]).length){
    const m={};
    _cpRows.forEach(p=>{ if(p&&p.teamId!=null) m[String(p.teamId)]=row(p); });
    _lrPlants=m; return;
  }
  _lrPlantsBusy=true;
  gflListProfiles().then(rows=>{
    const m={};
    (rows||[]).forEach(p=>{ if(p&&p.teamId!=null) m[String(p.teamId)]=row(p); });
    _lrPlants=m; _lrPlantsBusy=false;
    if(_activeTab==='profile'&&_lrView) renderMyProfile();
  }).catch(()=>{ _lrPlants={}; _lrPlantsBusy=false; });
}
function renderMyProfile(){
  const el=document.getElementById('profile-page-body'); if(!el) return;
  if(!_me){ el.innerHTML=`<div class="mp-out">
      <p>You are signed out.</p>
      <button class="mv-btn" onclick="openSignIn()">Sign in</button></div>`; return; }
  const myId=Number(_me.teamId);
  const visiting=_lrView!=null&&String(_lrView)!==String(myId);
  const tid=visiting?Number(_lrView):myId;
  const t=_teams.find(x=>x.id===tid);
  const owner=_ownerMap[tid];
  const at=owner?franchiseAllTime(owner):null;
  const nm=t?t.name:'that team';
  /* Their plant if we have it, and a fresh one rather than a dead one while it
     is still coming — a room should not accuse its owner of neglect on the
     strength of a read that has not landed. */
  const lp=visiting?((_lrPlants||{})[String(tid)]||null):null;
  const plant=visiting?plantStageOf(lp&&lp.t,lp&&lp.id):plantStage();
  const picker=`<div class="lr-pick">
      <button class="lr-pick-b${_lrPick?' on':''}" onclick="lrTogglePick()" aria-expanded="${_lrPick}">
        <i class="fa fa-door-open"></i>Visit another locker room
        <i class="fa fa-chevron-down lr-pick-chev"></i>
      </button>
      ${''/* the same twelve tiles the rosters tab uses to pick a team — one
             way of choosing a franchise on this site, not two */}
      ${_lrPick?`<div class="rp-grid lr-grid">${_teams.map(x=>`
        <button class="rp-cell${x.id===tid?' on':''}" onclick="lrVisit(${x.id})" title="${x.name}">
          ${logoImg(x.id,'rp-logo')}
          <span class="rp-ab">${(x.abbrev||teamInitials(x.name))}</span>
        </button>`).join('')}</div>`:''}
    </div>`;
  el.innerHTML=`
    <div class="mp-head">
      ${t?logoImg(t.id,'big4-logo'):'<i class="fa fa-user"></i>'}
      <div class="mp-id">
        <div class="mp-name">${t?t.name:'No team linked'}</div>
        <div class="mp-sub">${visiting?'their locker room':`signed in as <b>${_me.k1}</b>`}</div>
      </div>
      ${/* sign out sits with the identity it ends, not in a row of actions —
           and it has no place at all in somebody else's room */''}
      ${visiting
        ? `<button class="mv-btn mp-out-btn" onclick="lrHome()">Back to mine</button>`
        : `<button class="mv-btn mp-out-btn" onclick="gflSignOut();switchTab('home')">Sign out</button>`}
    </div>
    ${''/* half these teams are plural — Wigglers's is not a word */}
    ${visiting?`<div class="lr-now"><i class="fa fa-eye"></i>
      <span>Now viewing <b>${nm}</b>${/s$/i.test(nm)?'&rsquo;':'&rsquo;s'} locker room</span></div>`:''}
    ${lockerRoomHTML(t,{plant,canWater:!visiting})}
    ${''/* the way out sits under the room rather than over it: the room is what
           the page is for, and a door belongs at the far wall */}
    ${picker}
    ${/* the locker takes its colour from the logo, which is sampled
          asynchronously — warm it and repaint if this is the first look */''}
    ${visiting?'':`<div class="mp-actions">
      ${''/* how the plant is doing, without having to read the picture */}
      <span class="mp-plant s${plant.stage}">
        <i class="fa fa-seedling"></i>
        <span class="mp-plant-l">Plant</span>
        <span class="mp-plant-v">${plant.label}</span>
      </span>
      ${/* THE RUNNING TOTAL IS GONE FROM HERE. What the room is for is what is
            happening now: a plant that wants water and whether this window's egg
            is still out there. A career count of eggs is a statistic, and it sat
            next to two things you can act on as though it were a third. */''}
      ${(()=>{const e=eggChip(); return `<span class="mp-eggnow ${e.cls}">
        <span class="mp-egg-e">🥚</span>
        <span class="mp-eggnow-t">${e.text}</span>
      </span>`;})()}
    </div>`}`;
  /* The logo colour is sampled from the image, so on a cold load — arriving
     straight here without opening a team profile first — the cache is empty and
     the room falls back to grey. Warm it once and repaint. */
  if(visiting) lrPlantSync(); else plantSync();   // whose last watering to pull
  if(t && !_logoColorCache[t.id]){
    logoMainColor(t.id).then(()=>{ if(_activeTab==='profile') renderMyProfile(); }).catch(()=>{});
  }
}
function openSignIn(){
  const m=document.getElementById('si-modal'); if(!m) return;
  const nm=myTeamName();
  document.getElementById('si-body').innerHTML=_me
    ? `<div class="si-in">Signed in as <b>${_me.k1}</b>${nm?`<div class="si-sub">Remembering ${nm}</div>`:''}</div>
       <button class="si-go" onclick="gflSignOut()">Sign out</button>`
    : `<label class="si-l">Username</label><input id="si-k1" class="si-i" autocomplete="username" autocapitalize="none" spellcheck="false" placeholder="your team's abbreviation"/>
       <label class="si-l">Password</label><input id="si-k2" class="si-i" type="password" autocomplete="current-password" placeholder="three digits"/>
       <button class="si-go" onclick="gflSignIn()">Sign in</button>`;
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
/* Finds are per manager, so signing in or out swaps the list the balance is
   built from — dropping the cache is what stops one account showing another's
   haul on a shared device. */
function eggReset(){ _eggs=null; try{ eggSync(); }catch(e){} try{ eggPaint(); }catch(e){} }
/* messages waiting on my own profile, and whether mine has been read */
function ttReset(){ _ttIn={}; _ttPending=null; try{ ttSync(); }catch(e){} }
/* the share ledger is per manager too */
function invResetAll(){ try{ invReset(); }catch(e){} }
// ── UPCOMING SCHEDULE ────────────────────────────────────────────────────────
/* Which season still has games left? Preseason gives the whole slate; mid-season
   gives whatever's left of the current one. */
/* The schedule reads the year in the nav. A season still in progress gives
   the projection table; one that is finished gives the results instead, which is
   why `complete` is carried alongside `unplayed`. */
function schedSeason(){
  const y=String(getSeason());
  const meta=_seasonMeta[y];
  const games=((meta&&meta.schedule)||[]).filter(m=>m.home&&m.away&&(m.matchupPeriodId||0)>0);
  const played=games.filter(m=>((m.home.totalPoints||0)>0||(m.away.totalPoints||0)>0));
  const unplayed=games.filter(m=>!((m.home.totalPoints||0)>0||(m.away.totalPoints||0)>0));
  return {season:y,meta:meta||{schedule:[]},games,played,unplayed,
    live:played.length>0&&unplayed.length>0,
    complete:games.length>0&&unplayed.length===0,
    regEnd:(meta&&meta.regEnd)||14};
}
/* Every game this franchise played that season, in order, with the result.
   Read straight off the season's own schedule, so it needs no new fetch. */
function schedPlayedRows(owner){
  const info=schedSeason(); const meta=info.meta; if(!meta||!meta.owners) return null;
  const owners=meta.owners;
  const out=[];
  info.played.forEach(m=>{
    const ho=owners[m.home.teamId], ao=owners[m.away.teamId];
    if(!ho||!ao||ho===ao) return;
    if(ho!==owner&&ao!==owner) return;
    const meHome=ho===owner;
    const mine=meHome?m.home:m.away, theirs=meHome?m.away:m.home;
    const my=mine.totalPoints||0, their=theirs.totalPoints||0;
    const oppOwner=meHome?ao:ho;
    const fr=_franchises.find(f=>f.owner===oppOwner);
    const oppName=(fr&&fr.name)||(meta.names&&meta.names[oppOwner]&&meta.names[oppOwner].name)
      ||(meta.teams&&meta.teams[theirs.teamId]&&meta.teams[theirs.teamId].name)||'Team';
    out.push({week:m.matchupPeriodId, playoff:(m.matchupPeriodId||0)>info.regEnd,
      oppOwner, oppName, my, their, counts:postGameCounts(info.season,m),
      res:my>their?'W':their>my?'L':'T', margin:my-their});
  });
  out.sort((a,b)=>a.week-b.week);
  const live=out.filter(r=>r.counts);
  const w=live.filter(r=>r.res==='W').length, l=live.filter(r=>r.res==='L').length,
        t=live.filter(r=>r.res==='T').length;
  return {rows:out,info,w,l,t,dead:out.length-live.length,
    pf:live.reduce((a,r)=>a+r.my,0), pa:live.reduce((a,r)=>a+r.their,0)};
}
/* Projected margin drives everything: the two teams' strength, differenced,
   then run through the normal curve. Weekly fantasy margins scatter with a
   standard deviation around 30 points. */
const SCHED_SD=30;
function schedNormCdf(z){                      // Abramowitz & Stegun 26.2.17
  const t=1/(1+0.2316419*Math.abs(z));
  const poly=t*(0.319381530+t*(-0.356563782+t*(1.781477937+t*(-1.821255978+t*1.330274429))));
  const v=1-Math.exp(-z*z/2)/Math.sqrt(2*Math.PI)*poly;
  return z>=0?v:1-v;
}
/* ── TWO TERMS THAT WERE NEVER ON THE SAME SCALE ──────────────────────────
   This used to read (ppg−ppg)*0.75 + (rating−rating)*1.2, and those two look
   like a 40/60 split until you notice they are in different units. ppg is
   points — four seasons of career average, spread about twenty-five points end
   to end. rating is a z-score, spread about two and a half. So the career term
   was worth up to nineteen points of margin and the rating term barely three,
   and the split was really closer to 6:1 the other way.

   That matters because rating is the only draft-aware number in the pair. It
   is already 65% this year's roster — sbBuild floors the live weight at
   SB_LIVE_MIN the moment there is a roster to read, exactly so the squad a
   manager actually drafted leads their price. None of that reached the
   schedule: a week-one win probability was 87% career history, which is how
   the highest career scorer in the league came out favourite while holding the
   sixth-best roster on the board. It is the same complaint that was already
   fixed on the share prices, and the same fix sbBuild applies one level down
   — put both halves on the same scale BEFORE mixing them, so the stated
   weights are the real ones.

   Scored across the league, blended, then multiplied back into points by the
   league's own spread of scoring. Self-calibrating: no constant here assumes
   how high this league scores or how far apart its teams are. */
const SCHED_RATING_W=0.65;   // the draft-aware half
const SCHED_PPG_W=0.35;      // career scoring, the residual
/* KEYED ON THE BOARD ITSELF, NOT ON A STAMP.

   The first version of this cached on footballStamp, and that is wrong in a way
   worth recording because it is the same mistake three times now. The stamp
   says which football has been played. Ratings do not only move when football
   is played — they move when the ROSTERS land, which happens a second or two
   after the page opens and does not touch the stamp. So the first render cached
   a board whose ratings were still pure career history (sbBuild has no roster
   signal to floor the live weight with until the fetch returns), the stamp never
   changed, and every win probability on the site spent the rest of the session
   built on exactly the history this reweighting existed to demote. The powers
   came out in almost perfect points-per-game order, which is what gave it away.

   sbBuild already solves this properly: it hands back one cached object and
   nulls it whenever anything underneath moves, rosters included. So the board's
   own identity is the key. It cannot go stale without the board going stale
   first, and there is no third thing to keep in sync. */
let _schedPowerCache=null;
function schedPower(){
  let book=null; try{ book=sbBuild(); }catch(e){ return null; }
  const rows=(book&&book.rows)||[];
  if(rows.length<2) return null;              // never cache a board that is not there yet
  if(_schedPowerCache&&_schedPowerCache.book===book) return _schedPowerCache.map;
  let map=null;
  const ppg=rows.map(r=>r.ppg||0);
  const mean=ppg.reduce((a,b)=>a+b,0)/ppg.length;
  const sd=Math.sqrt(ppg.reduce((a,b)=>a+(b-mean)*(b-mean),0)/ppg.length);
  if(sd>0){
    const zP=sbZ(ppg), zR=sbZ(rows.map(r=>r.rating||0));
    map={};
    rows.forEach((r,i)=>{ map[r.owner]=(SCHED_PPG_W*zP[i]+SCHED_RATING_W*zR[i])*sd; });
  }
  _schedPowerCache={book,map};
  return map;
}
function schedPowerMargin(a,b){
  if(!a||!b) return 0;
  const pw=schedPower();
  if(pw&&pw[a.owner]!=null&&pw[b.owner]!=null) return pw[a.owner]-pw[b.owner];
  /* no board to scale against — fall back to the raw terms */
  return (a.ppg-b.ppg)*0.75+(a.rating-b.rating)*1.2;
}

/* ── THE SCHEDULE TAB RUNS ON ESPN'S OWN WEEKLY PROJECTIONS ──────────────────
   Everything above this is a SEASON-STRENGTH model: how good is this franchise,
   blended out of a draft-aware rating and four years of scoring. That is the
   right question for a price on the board, and it is the wrong question for
   "what happens in week six", which is what the Schedule tab is actually
   asking. ESPN publishes a projection for every player for every week of the
   season — byes, opponents and all — and that is a straight answer to the
   straight question. It is also the number in the app, which is the point: the
   Schedule tab and the phone should agree.

   Deliberately NOT the sportsbook's model. The book prices a market — it holds
   a margin, it moves on money laid, and it has to be ungameable because there
   is play money riding on it. This is a projection, and it owes nobody a
   margin. Two different things, and they are allowed to disagree.

   WHOSE LINEUP. For a week that can actually be set — this week and every week
   behind it — the starters are the starters, exactly as ESPN sums them, so the
   two agree to the decimal. For weeks further out nobody has set anything, and
   taking those slots literally is not ESPN's opinion, it is an accident of
   whatever the draft left in place: in week six that read Motor City at 68
   points with three starters on a bye, a 5% chance at a game five weeks away.
   Those weeks use the best legal lineup the roster could field on the same ESPN
   numbers, which is what the manager will do once the week arrives. Still
   entirely ESPN's projections — only the lineup assumption changes, and only
   where there is no lineup to read. A genuinely brutal bye week still shows,
   because a bench of five cannot always cover three. */
/* A FUNCTION, NOT A CONSTANT, AND THAT IS NOT STYLE.
   SB_WK_SD is declared some fifteen hundred lines below this one. A top-level
   const that reads it is evaluated at load, hits the temporal dead zone and
   throws before app.js has finished executing — which takes the whole site
   down, not just this tab. Deferred behind a call it is read at render time,
   long after everything is initialised. */
const schedWkSd=()=>SB_WK_SD*Math.SQRT2;   // two lineups, so a margin scatters wider than one
function schedCurWeek(season){
  let lw=0; try{ lw=(ntLastWeek(String(season))||{}).week||0; }catch(e){}
  return Math.max(1,lw+1);
}
/* Keyed on the roster object the way schedPower keys on the board: sbRosters
   hands back one object per season-week and replaces it on refetch, so identity
   is exactly "these projections, until they change". */
let _schedProjCache={};
function schedEspnProj(week){
  const wk=Number(week)||0; if(!wk) return null;
  let season=null; try{ season=sbBoardSeason(); }catch(e){ return null; }
  if(!season) return null;
  const rosters=sbRosters(season,wk); if(!rosters) return null;
  const hit=_schedProjCache[season+':'+wk];
  if(hit&&hit.rosters===rosters) return hit.map;
  const meta=_seasonMeta[String(season)];
  if(!meta) return null;
  const owners=meta.owners||{}, shape=sbSlotShape(meta);
  const setWeek=wk<=schedCurWeek(season);
  const projOf=e=>Math.max(0,Number(e.wkProj)||0);
  const map={}; let any=false;
  Object.keys(rosters).forEach(tid=>{
    const o=owners[tid]; if(!o) return;
    const es=rosters[tid]||[];
    /* No projections at all means ESPN has not published that week for this
       team — leave it out entirely rather than call it zero, so schedMargin
       falls back to the season model instead of pricing a shutout. */
    if(!es.length||!es.some(e=>Number(e.wkProj)>0)) return;
    const v=setWeek
      ? es.filter(e=>!SB_BENCH_SLOTS.includes(Number(e.slot))).reduce((a,e)=>a+projOf(e),0)
      : sbBestLineup(es,projOf,e=>Number(e.pos)||0,shape);
    if(v>0){ map[o]=v; any=true; }
  });
  const out=any?map:null;
  _schedProjCache[season+':'+wk]={rosters,map:out};
  return out;
}
/* ── ESPN'S OWN ANSWER, WHERE ESPN HAS ONE ──────────────────────────────────
   The matchup feed carries two fields the rest of the site was ignoring:
   totalProjectedPoints and winProbability. Our projection already agrees with
   the first to the decimal — 124.5 and 118.6 for week one, exactly what the app
   shows — so the only thing left to disagree about was the SECOND, and there we
   were reading 56% where the app read 53%.

   The gap is not the margin, it is the spread. ESPN's published probabilities
   imply a margin standard deviation around 88 points; this league's own 336
   completed games scatter with a standard deviation of 34.9. ESPN is treating a
   fantasy week as very close to a coin flip, far flatter than the football
   actually is. Neither of us is computing the other's number, and no amount of
   tuning ours would land on theirs by accident.

   So where ESPN publishes a probability, the Schedule tab quotes it and stops
   modelling. That is the whole point of this tab now: it is the app's view. It
   is only ever the CURRENT week — every other week comes back null — and every
   week beyond it keeps our own model, which the league's own scoring says is
   the better calibrated of the two. The playoff simulation therefore runs on
   our numbers for thirteen of fourteen weeks, which is what a simulation wants:
   ESPN's flatness would turn a season projection into mush. */
/* Two statements, not one comma-separated declaration: the test harnesses lift
   these by string match and that walk stops at the first closing brace, so a
   pair would arrive half-declared. */
let _espnWpCache={};
let _espnWpBusy={};
function espnWinProbs(season,week){
  const wk=Number(week)||0; if(!season||!wk) return null;
  const k=String(season)+':'+wk;
  if(k in _espnWpCache) return _espnWpCache[k];
  if(!_espnWpBusy[k]){
    _espnWpBusy[k]=true;
    fetch(`${BASE}?view=mMatchupScore&seasonId=${season}&scoringPeriodId=${wk}`)
      .then(r=>r.ok?r.json():null)
      .then(j=>{
        const meta=_seasonMeta[String(season)]||{}, owners=meta.owners||{};
        const probs={};
        ((j&&j.schedule)||[]).forEach(m=>{
          if(!m.home||!m.away||Number(m.matchupPeriodId)!==wk) return;
          const ho=owners[m.home.teamId], ao=owners[m.away.teamId];
          const hw=m.home.winProbability, aw=m.away.winProbability;
          /* An exact 0 or 1 is a finished game, not an opinion about one. */
          if(ho&&hw!=null&&hw>0&&hw<1) probs[ho]={p:hw,opp:ao};
          if(ao&&aw!=null&&aw>0&&aw<1) probs[ao]={p:aw,opp:ho};
        });
        _espnWpCache[k]=Object.keys(probs).length?probs:null;
        /* whichever tab is looking at these has to be told they landed */
        if(_activeTab==='week') try{ renderWeek(); }catch(e){}
      })
      .catch(()=>{ _espnWpCache[k]=null; })
      .finally(()=>{ _espnWpBusy[k]=false; });
  }
  return null;                       // not back yet: the model answers meanwhile
}
/* ESPN hands over a probability; the curve and the clamp both want it as a
   z-score. Bisection rather than a rational approximation because it is called
   six times a render, not six thousand, and this cannot be subtly wrong. */
function schedInvNorm(p){
  const q=Math.min(0.999999,Math.max(0.000001,p));
  let lo=-6,hi=6;
  for(let i=0;i<80;i++){ const m=(lo+hi)/2; if(schedNormCdf(m)<q) lo=m; else hi=m; }
  return (lo+hi)/2;
}
function espnProbFor(a,b,week){
  if(!a||!b||!week) return null;
  let season=null; try{ season=sbBoardSeason(); }catch(e){ return null; }
  const tbl=espnWinProbs(season,week); if(!tbl) return null;
  const ea=tbl[a.owner], eb=tbl[b.owner];
  /* only if ESPN is talking about THIS fixture — a team's probability belongs
     to the opponent it was published against */
  if(!ea||ea.opp!==b.owner||!(ea.p>0&&ea.p<1)) return null;
  /* ESPN rounds each side to two places independently, so the pair does not
     have to add to one. Everything downstream assumes it does — the two halves
     of a game, expected wins totalling the games played, the playoff draw — so
     the published pair is renormalised into one. */
  if(eb&&eb.opp===a.owner&&eb.p>0&&eb.p<1){
    const t=ea.p+eb.p;
    if(t>0) return ea.p/t;
  }
  return ea.p;
}
/* The projected margin in POINTS, which is what the spread column prints. */
function schedMargin(a,b,week){
  if(!a||!b) return 0;
  const pj=schedEspnProj(week);
  if(pj&&pj[a.owner]>0&&pj[b.owner]>0) return pj[a.owner]-pj[b.owner];
  return schedPowerMargin(a,b);
}
/* ...and the same margin in standard deviations, which is what the probability
   reads. The two paths do not share a spread: a week of two ESPN lineups
   scatters wider than a difference of season strengths, so each is divided by
   its own. Everything that quotes a chance goes through here, so there is one
   place where the model lives. */
function schedZ(a,b,week){
  if(!a||!b) return 0;
  const ep=espnProbFor(a,b,week);
  if(ep!=null) return schedInvNorm(ep);          // ESPN's own number, quoted
  const pj=schedEspnProj(week);
  if(pj&&pj[a.owner]>0&&pj[b.owner]>0) return (pj[a.owner]-pj[b.owner])/schedWkSd();
  return schedPowerMargin(a,b)/SCHED_SD;
}
function schedWinProb(a,b,week){
  if(!a||!b) return 0.5;
  return Math.min(0.95,Math.max(0.05,schedNormCdf(schedZ(a,b,week))));
}
/* ── ONE GAME, ONE NUMBER ────────────────────────────────────────────────────
   The Forecast's headline percentage is the opening point of the win-
   probability curve, and the curve had its own model: the difference of two
   season averages over a slightly wider spread. The Schedule table right below
   it used schedWinProb. Same fixture, same page, two answers — a point or four
   apart, which is exactly enough to look like a bug and be one.

   The curve has to keep its own shape, because it must converge on the real
   result as points land; it cannot just print schedWinProb all week. So the
   schedule's margin is converted into the curve's units instead, which makes
   the two agree at kickoff and lets the curve take over from there. The clamp
   is schedWinProb's own 5–95%, applied to the margin rather than the
   probability, so they match at the extremes too. */
function schedOpenMu(a,b,week){
  if(!a||!b) return null;
  const Z=1.6448536269514722;                       // the 5% / 95% clamp, in z
  const z=Math.max(-Z,Math.min(Z,schedZ(a,b,week)));
  return z*wpSd();
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
/* ── THE LINE AND THE ODDS ARE THE BOOK'S. THE WIN% IS NOT. ──────────────────
   Two columns sit next to each other on this tab and they answer two different
   questions, on purpose.

   Win% is ESPN's projection for that week — the number in the app, and no more
   than that. It takes the starters as they stand for a week that can be set.

   Line and Odds are prices, and a price is the sportsbook's job. They are built
   the book's way: sbTeamWeek's best legal lineup, the book's own two-lineup
   spread, and the two-way hold on top. Best legal rather than as-set is not an
   oversight here, it is the whole point of a price — anything read off the
   lineup somebody actually set is gameable, and there is play money on it. So a
   manager who leaves a bye-week starter in will see their Win% fall and their
   price stay put, which is correct: the projection knows about the mistake and
   the market refuses to be moved by it.

   Prices are also why these two never agree to the decimal. The hold is real:
   both sides get 2.5 points added, which is where the book's edge comes from. */
function schedBookPrice(me,opp,week,season,meta){
  let tA=null,tB=null;
  try{
    tA=sbTeamWeek(me.tid,week,season,meta,0,false);
    tB=sbTeamWeek(opp.tid,week,season,meta,0,false);
  }catch(e){}
  let p=null,spread=null,favA=null,total=null;
  if(tA&&tB){
    const sd=Math.sqrt(sbWkSd(tA)*sbWkSd(tA)+sbWkSd(tB)*sbWkSd(tB));
    if(sd>1){
      p=Math.min(0.97,Math.max(0.03,sbNormCdf((tA.exp-tB.exp)/sd)));
      spread=Math.abs(tA.exp-tB.exp); favA=tA.exp>=tB.exp;
      total=Math.round(tA.exp+tB.exp)+0.5;
    }
  }
  if(p==null){
    /* ESPN has not published the week — the power-rating model is what the
       board did before there was anything better, capped tight while the
       evidence is thin. Head-to-head fantasy is closer to a coin flip than a
       power rating makes it look. */
    const lim=0.62+0.18*sbEvidence();
    p=Math.min(lim,Math.max(1-lim,1/(1+Math.exp(-(me.rating-opp.rating)*sbDamp(0.55)))));
    spread=Math.abs(me.rating-opp.rating)*sbDamp(3.0);
    favA=me.rating>=opp.rating;
    total=Math.round(me.ppg+opp.ppg)+0.5;
  }
  return {p, ml:amFromProb(Math.min(0.95,p+0.025)),
    spread:Math.max(0.5,Math.round(spread*2)/2), fav:favA, total};
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
    const p=schedWinProb(me,opp,wk);              // ESPN's projection for the week
    const bk=schedBookPrice(me,opp,wk,info.season,meta);   // the book's price
    // last completed season for the opponent, plus the all-time head to head
    const lastSp=(opp.sp||[]).filter(s=>s.g>0).slice(-1)[0]||null;
    const lastRec=lastSp?`${lastSp.w}–${Math.max(0,lastSp.g-lastSp.w)}`:'—';
    const key=owner<oppOwner?`${owner}|${oppOwner}`:`${oppOwner}|${owner}`;
    const k=_h2hAll[key]||{}; const mine=k[owner];
    const g=mine?mine.games:0, w=mine?mine.w:0, t=mine?mine.t:0;
    out.push({week:wk, playoff:wk>(info.regEnd||14), opp, oppOwner,
      p, ml:bk.ml, spread:bk.spread, fav:bk.fav, total:bk.total, bookP:bk.p,
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
/* ── SCOUTING A TEAM NOBODY HAS PLAYED YET ───────────────────────────────────
   schedTopPlayers ranks an opponent on points per start, which needs starts.
   Between the draft and week one there are none, so the drawer had nothing to
   say and said "No 2026 player data yet" — which is true and useless, because
   what everybody actually wants to know in August is who is on that roster.

   So when there is no season to rank on, the scouting report is the opponent's
   best projected starters instead: the same per-week projections the Forecast
   and the book price off. It is labelled as a projection, because it is one. */
function schedTopProjected(owner,season,n=3){
  const meta=_seasonMeta[String(season)]; if(!meta) return null;
  const owners=meta.owners||{};
  const tid=Object.keys(owners).find(id=>owners[id]===owner);
  if(tid==null) return null;
  const week=invWeekNow();
  const r=sbRosters(season,week); if(!r) return null;
  const list=r[tid]||r[Number(tid)]; if(!list||!list.length) return null;
  const proj=sbPlayerProj(week)||{};
  const wkOf=e=>(typeof e.wkProj==='number'&&e.wkProj>0)
    ? e.wkProj : ((proj[String(e.pid)]||{}).wk||0);
  return list.filter(e=>!BENCH_SLOTS.includes(e.slot))
    .map(e=>({pid:e.pid,n:e.n||pName(e.pid),pos:SLOT_NAMES[e.slot]||'',proj:wkOf(e)}))
    .filter(p=>p.proj>0).sort((a,b)=>b.proj-a.proj).slice(0,n);
}
/* ── WEEKS ALREADY PLAYED ────────────────────────────────────────────────────
   A season in progress used to show only what was still to come, which meant
   the one tab called Schedule could not tell you what happened last week. The
   played weeks sit above the upcoming ones in the same list, with the result
   rather than a projection, and their drawer opens on the record of the game
   instead of a scouting report: the best performance on each side, and the
   curve of who was winning it. */
function schedPlayedStripHTML(owner,season){
  let d=null; try{ d=schedPlayedRows(owner); }catch(e){}
  if(!d||!d.rows.length) return '';
  return d.rows.map(r=>{
    const cls=!r.counts?' sch-dead':(r.res==='W'?' sch-won':r.res==='L'?' sch-lost':'');
    return `<div class="sch-row sch-res${cls}">
      <span class="sch-wk">${r.playoff?'PO':''}${r.week}</span>
      <span class="sch-team sch-open" role="button" tabindex="0"
        data-opp="${r.oppOwner}" data-name="${String(r.oppName).replace(/"/g,'&quot;')}"
        data-week="${r.week}" data-played="1" data-me="${owner}"
        onclick="toggleSchedOpp(this)"
        onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();toggleSchedOpp(this);}">
        ${sbAvatar(r.oppOwner,22)}<span class="sch-nm">${r.oppName}</span>
        <span class="sch-ab">${sbTeamAb(r.oppOwner,r.oppName)}</span>
        <i class="fa fa-chevron-down sch-caret"></i></span>
      <span class="r sch-c1">${r.my.toFixed(1)}</span>
      <span class="r sch-c2">${r.their.toFixed(1)}</span>
      <span class="r sch-c3"></span>
      <span class="r sch-p sch-res-b">${r.counts?r.res:'—'}</span>
      <span class="r sch-c4"></span><span class="r"></span>
    </div>
    <div class="sch-detail" data-season="${season}"></div>`;
  }).join('')+`<div class="sch-deadline"><span class="sch-dl-l"></span>
    <span class="sch-dl-t"><i class="fa fa-forward"></i>Still to come</span>
    <span class="sch-dl-l"></span></div>`;
}
/* the record of a game that has been played: the best start on each side, and
   the shape of the week as it happened */
function schedPlayedDetailHTML(meOwner,oppOwner,season,week,oppName){
  const meT=_franchises.find(f=>f.owner===meOwner), oppT=_franchises.find(f=>f.owner===oppOwner);
  const meId=meT&&meT.teamId, oppId=oppT&&oppT.teamId;
  const a=meId?weekTopStarter(season,week,meId):null;
  const b=oppId?weekTopStarter(season,week,oppId):null;
  const abA=meT?sbTeamAb(meOwner,meT.name):'', abB=sbTeamAb(oppOwner,oppName);
  const side=(t,p,ab2)=>`<div class="sd-top">
    <span class="sd-top-l">${ab2}</span>
    ${p?`${playerImg(p.pid,32,p.n)}<span class="sd-top-n">${p.n}</span>
       <span class="sd-top-v">${Number(p.pts).toFixed(1)}</span>`
      :`<span class="sd-top-n sd-none">no box score</span>`}
  </div>`;
  const projByOwner={}; let openMu=null;
  try{
    const book=sbBuild();
    (book?book.rows:[]).forEach(r=>{ projByOwner[r.owner]=r.ppg; });
    const rowOf=o=>(book?book.rows:[]).find(r=>r.owner===o)||null;
    openMu=schedOpenMu(rowOf(meOwner),rowOf(oppOwner),week);
  }catch(e){}
  const series=wpSeriesFor(season,week);
  const graph=series
    ? wpGraphSVG(wpCurve(series,projByOwner,meOwner,oppOwner,openMu),abA,abB,{h:84})
    : `<div class="sd-msg">No minute-by-minute record for that week.</div>`;
  return `<div class="sd-h">Top performer · week ${week}</div>
    <div class="sd-tops">${side(meT,a,abA)}${side(oppT,b,abB)}</div>
    <div class="sd-h">How it was won</div>
    ${graph}
    <div class="sd-foot">${abA} chance to win, minute by minute.</div>`;
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
  /* A game already played has a record; a game still to come has only a
     scouting report. They are different questions and get different drawers. */
  if(el.dataset.played==='1'){
    const week=Number(el.dataset.week)||0, me=el.dataset.me||'';
    try{ await wpEnsureSeries(season,week); }catch(e){}
    try{ weekScores(season,week); }catch(e){}
    box.innerHTML=schedPlayedDetailHTML(me,owner,season,week,name);
    /* both sources land asynchronously — repaint this one drawer when they do */
    setTimeout(()=>{ if(box.classList.contains('open'))
      box.innerHTML=schedPlayedDetailHTML(me,owner,season,week,name); },1200);
    return;
  }
  try{ await loadTenureData(); }catch(e){}
  const top=schedTopPlayers(owner,season,3);
  if(!top||!top.length){
    /* no starts to rank on yet — scout the roster they actually hold */
    const pj=schedTopProjected(owner,season,3);
    if(pj&&pj.length){
      box.innerHTML=`<div class="sd-h">Toughest to face · ${name} — top ${pj.length} by projection, no games played yet</div>
        <div class="sd-list">${pj.map((p,i)=>`<div class="sd-row">
          <span class="sd-rank">${i+1}</span>${playerImg(p.pid,26,p.n)}
          <span class="sd-name">${p.n}</span>
          <span class="sd-ppg">${p.proj.toFixed(1)}</span>
          <span class="sd-st">${p.pos} proj</span>
        </div>`).join('')}</div>`;
      /* the roster feed may not have landed on the first open */
      setTimeout(()=>{ if(!box.classList.contains('open')) return;
        const again=schedTopProjected(owner,season,3);
        if(again&&again.length&&again.length!==pj.length) toggleSchedOpp(el); },1400);
      return;
    }
    box.innerHTML=`<div class="sd-msg">Loading ${name}'s roster…</div>`;
    setTimeout(()=>{ if(!box.classList.contains('open')) return;
      const again=schedTopProjected(owner,season,3);
      box.innerHTML=(again&&again.length)
        ? `<div class="sd-h">Toughest to face · ${name} — top ${again.length} by projection, no games played yet</div>
           <div class="sd-list">${again.map((p,i)=>`<div class="sd-row">
             <span class="sd-rank">${i+1}</span>${playerImg(p.pid,26,p.n)}
             <span class="sd-name">${p.n}</span>
             <span class="sd-ppg">${p.proj.toFixed(1)}</span>
             <span class="sd-st">${p.pos} proj</span>
           </div>`).join('')}</div>`
        : `<div class="sd-msg">No ${season} player data yet.</div>`; },1600);
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
let _poCache=null,_poCacheSeason=null;
function playoffOutlook(){
  /* Keyed on the football as well as the year. This simulates the games that
     are LEFT, so the moment a week is played it is simulating a different set —
     and keyed on the season alone it would go on reporting the odds it worked
     out before that week, for the rest of the session. */
  const cs=String(getSeason())+'|'+footballStamp(getSeason());
  if(_poCache&&_poCacheSeason===cs) return _poCache;
  if(_poCacheSeason!==cs) _poCache=null;
  _poCacheSeason=cs;
  const book=sbBuild(); if(!book) return null;
  const info=schedSeason(), meta=info.meta; if(!meta||!meta.owners) return null;

  /* A finished season is not a forecast. Who made it is already known, so the
     field reads 100% and everyone else 0% rather than a simulation of games
     that have all been played. Qualification is the regular-season seed against
     the league's playoff spot count. */
  if(info.complete){
    const owners=meta.owners, spots=meta.playoffTeamCount||6;
    const regEnd=info.regEnd||14;
    const rec={}; Object.values(owners).forEach(o=>{ if(o) rec[o]={w:0,l:0,t:0}; });
    (meta.schedule||[]).forEach(m=>{
      if(!m.home||!m.away||(m.matchupPeriodId||0)>regEnd) return;
      const hp=m.home.totalPoints||0, ap=m.away.totalPoints||0;
      if(hp===0&&ap===0) return;
      const ho=owners[m.home.teamId], ao=owners[m.away.teamId];
      if(!rec[ho]||!rec[ao]) return;
      if(hp>ap){rec[ho].w++;rec[ao].l++;} else if(ap>hp){rec[ao].w++;rec[ho].l++;}
      else {rec[ho].t++;rec[ao].t++;}
    });
    const seedOf={},nameOf={};
    Object.entries(meta.teams||{}).forEach(([tid,tm])=>{
      if(!tm||!tm.owner) return;
      seedOf[tm.owner]=Number(tm.seed)||99;
      const fr=_franchises.find(f=>f.owner===tm.owner);
      nameOf[tm.owner]=(fr&&fr.name)||tm.name||'Team';
    });
    const teams=Object.keys(rec).map(o=>{
      const sd=seedOf[o]||99, made=sd<=spots;
      return {owner:o,name:nameOf[o]||'Team',played:rec[o],
        odds:made?1:0, now:sd, fBest:sd, fWorst:sd, lo:rec[o].w, hi:rec[o].w, seed:sd};
    }).sort((a,b)=>a.seed-b.seed);
    _poCache={teams,spots,left:0,runs:0,season:info.season,
      maxW:regEnd,regEnd,played:true,final:true,size:teams.length};
    return _poCache;
  }
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
    .map(m=>({a:owners[m.home.teamId],b:owners[m.away.teamId],w:m.matchupPeriodId||0}))
    .filter(g=>g.a&&g.b&&g.a!==g.b&&base[g.a]&&base[g.b]);

  /* Keyed by week as well as by pair: the same two teams can meet twice, and on
     ESPN's weekly numbers those are two different games — different byes,
     different opponents. */
  const pre={}; left.forEach(g=>{ const k=g.w+'|'+g.a+'|'+g.b;
    if(pre[k]==null) pre[k]=schedWinProb(rowOf(g.a),rowOf(g.b),g.w); });
  const ppg={}; list.forEach(o=>{ ppg[o]=(rowOf(o)||{}).ppg||105; });

  const made={},seedSum={},winTotals={},finishes={};
  list.forEach(o=>{made[o]=0;seedSum[o]=0;winTotals[o]=[];finishes[o]=[];});
  // Box-Muller, so simulated weekly scores scatter like real ones
  const gauss=()=>{const u=1-Math.random(),v=Math.random();
    return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);};

  for(let n=0;n<PO_RUNS;n++){
    const w={},pf={};
    list.forEach(o=>{w[o]=base[o].w+base[o].t*0.5;pf[o]=base[o].pf;});
    left.forEach(g=>{
      const p=pre[g.w+'|'+g.a+'|'+g.b];
      if(Math.random()<p) w[g.a]++; else w[g.b]++;
      pf[g.a]+=Math.max(0,ppg[g.a]+gauss()*SCHED_SD*0.7);
      pf[g.b]+=Math.max(0,ppg[g.b]+gauss()*SCHED_SD*0.7);
    });
    const order=list.slice().sort((x,y)=>w[y]-w[x]||pf[y]-pf[x]);
    order.forEach((o,i)=>{ if(i<spots) made[o]++; seedSum[o]+=i+1; finishes[o].push(i+1); });
    list.forEach(o=>winTotals[o].push(w[o]));
  }

  const pct=(arr,q)=>{const s=arr.slice().sort((a,b)=>a-b);
    return s[Math.min(s.length-1,Math.max(0,Math.round((s.length-1)*q)))];};
  const playedAny=list.some(o=>base[o].w||base[o].l||base[o].t);
  const teams=list.map(o=>{
    const t=winTotals[o], f=finishes[o];
    /* Finishes are the full observed span, not a 10th-90th band: the question
       is where a season could still end up, and with nothing played that is
       genuinely anywhere from first to last. Trimming the tails would report a
       narrower range than the simulation actually produced. */
    return {owner:o, name:(_franchises.find(f2=>f2.owner===o)||{}).name||meta.names?.[o]?.name||o,
      played:base[o], odds:made[o]/PO_RUNS, seed:seedSum[o]/PO_RUNS,
      lo:pct(t,0.10), med:pct(t,0.50), hi:pct(t,0.90),
      fBest:Math.min(...f), fWorst:Math.max(...f), fMed:pct(f,0.50)};
  }).map(t=>{
    /* Before a game is played every team can finish anywhere, full stop. The
       sampler does not always agree — a strong team can go a few thousand runs
       without ever landing last — but that is the simulation failing to reach a
       tail, not a real bound, so the unplayed case is stated outright. */
    if(!playedAny){ t.fBest=1; t.fWorst=list.length; t.odds=spots/list.length; }
    return t;
  }).sort((a,b)=>b.odds-a.odds||a.seed-b.seed);
  /* Where each team sits in the table right now, which is what the notch marks.
     Before anything is played every record is identical, so rather than let the
     points-for tiebreak invent an order out of nothing, the whole league is put
     at the midpoint — which is the honest answer to "where are you now". */
  const mid=(list.length+1)/2;
  const nowRank={};
  if(playedAny){
    list.slice().sort((x,y)=>
      (base[y].w+base[y].t*0.5)-(base[x].w+base[x].t*0.5) || base[y].pf-base[x].pf)
      .forEach((o,i)=>{ nowRank[o]=i+1; });
  } else list.forEach(o=>{ nowRank[o]=mid; });
  teams.forEach(t=>{ t.now=nowRank[t.owner]; });

  const maxW=Math.max(1,...teams.map(t=>t.hi));
  _poCache={teams,spots,left:left.length,runs:PO_RUNS,season:info.season,maxW,regEnd,
    size:list.length,played:playedAny};
  return _poCache;
}
const ordinal=n=>{const s=['th','st','nd','rd'],v=n%100;return n+(s[(v-20)%10]||s[v]||s[0]);};
function playoffOutlookHTML(){
  const d=playoffOutlook();
  if(!d) return '';
  const pctTxt=v=>v>=0.995?'>99%':v<=0.005?'<1%':Math.round(v*100)+'%';
  const col=v=>v>=0.85?'var(--green)':v>=0.5?'var(--accent)':v>=0.15?'var(--text2)':'var(--red)';
  /* Where a team can still finish, not how many games it can still win. The
     bar runs first place at the left to last at the right, so a wide band is a
     season still wide open and a short one near the left is a lock. */
  const N=d.size||d.teams.length;
  const posPct=p=>N<2?0:(p-1)/(N-1)*100;
  const rows=d.teams.map((t,i)=>{
    const inCut=i<d.spots;
    const l=posPct(t.fBest), r=posPct(t.fWorst), m=posPct(t.now);
    const nowTxt=d.played?`currently ${ordinal(Math.round(t.now))}`:'level with the league';
    return `<div class="po-row${inCut?' po-in':''}">
      <span class="po-rk">${i+1}</span>
      <span class="po-nm">${t.name}</span>
      <span class="po-rec">${t.played.w}–${t.played.l}${t.played.t?`–${t.played.t}`:''}</span>
      <span class="po-range" title="Can finish anywhere from ${ordinal(t.fBest)} to ${ordinal(t.fWorst)}; ${nowTxt}. Projected ${t.lo}–${t.hi} wins.">
        <span class="po-track"><span class="po-band" style="left:${l}%;width:${Math.max(2,r-l)}%"></span>
        <span class="po-med" style="left:${m}%"></span></span>
        <span class="po-rtxt">${ordinal(t.fBest)}–${ordinal(t.fWorst)}</span>
      </span>
      <span class="po-odds" style="color:${col(t.odds)}">${pctTxt(t.odds)}</span>
    </div>`;}).join('');
  if(d.final) return `<div class="sec po-sec">
    <div class="sec-head"><i class="fa fa-chart-simple"></i>Playoff Field
      <span class="badge-info">${d.season} · final</span></div>
    <div class="po-head"><span></span><span>Team</span><span>Rec</span><span>Seed</span><span class="r">Playoffs</span></div>
    <div class="po-list">${d.teams.map((t,i)=>`<div class="po-row${i<d.spots?' po-in':''}">
      <span class="po-rk">${i+1}</span>
      <span class="po-nm">${t.name}</span>
      <span class="po-rec">${t.played.w}–${t.played.l}${t.played.t?`–${t.played.t}`:''}</span>
      <span class="po-seed">${t.seed<=d.spots?`#${t.seed} seed`:'—'}</span>
      <span class="po-odds" style="color:${t.odds?'var(--green)':'var(--red)'}">${t.odds?'100%':'0%'}</span>
    </div>`).join('')}</div>
    <div class="po-note">${d.season} is finished, so this is the field as it actually fell rather than a projection — the top ${d.spots} seeds made the playoffs, everyone else did not.</div>
  </div>`;
  return `<div class="sec po-sec">
    <div class="sec-head"><i class="fa fa-chart-simple"></i>Playoff Outlook
      <span class="badge-info">${d.left?`${d.left} games left · ${d.runs.toLocaleString()} simulations`:'regular season complete'}</span></div>
    <div class="po-head"><span></span><span>Team</span><span>Rec</span><span>Range of outcomes</span><span class="r">Playoffs</span></div>
    <div class="po-list">${rows}</div>
    <div class="po-note">Every remaining game is simulated ${d.runs.toLocaleString()} times using the same power ratings the sportsbook prices with. The bar spans every finishing position a team reached across those runs — first at the left, ${ordinal(N)} at the right — with the notch marking where that team sits in the table right now. Before a game is played the whole league can still land anywhere, so every range opens at 1st–${ordinal(N)} with the notch dead centre, and both tighten as results come in. The top ${d.spots} shaded rows are the current projected field.</div>
  </div>`;
}
function renderSchedule(){
  const el=document.getElementById('sched-body'); if(!el) return;
  /* a finished season is a record, not a schedule — say so in the heading */
  {const h=document.getElementById('sched-head'); if(h){ const i=schedSeason();
    const done=i.complete;
    h.innerHTML=`<i class="fa fa-calendar-days"></i>${done?i.season+' Results':'Schedule'}<span class="badge-info">${done?'final scores':'win odds from the B&amp;C power ratings'}</span>`; }}
  if(!_franchises.length){ el.innerHTML=`<div class="tab-loading"><i class="fa fa-circle-notch"></i>Loading schedule…</div>`; return; }
  if(_schedTeam==null) _schedTeam=String(_teams[0]?.id||'');
  const sel=document.getElementById('sched-team-select');
  if(sel&&sel.value!==String(_schedTeam)) sel.value=String(_schedTeam);
  const owner=_ownerMap[Number(_schedTeam)];
  /* a finished season shows what actually happened rather than a projection */
  const done=schedSeason();
  if(done.complete){ el.innerHTML=schedResultsHTML(owner); return; }
  const d=owner?schedRows(owner):null;
  if(!d||!d.rows.length){
    el.innerHTML=`<div class="tab-loading" style="padding:40px 16px">No unplayed games on the schedule for ${done.season}.</div>`;
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
      ${''/* whose chance it is was never stated, so a column of numbers under
             fifty next to an opponent read as the OPPONENT's chance */}
      <span class="r" title="${(_franchises.find(f=>f.owner===owner)||{}).name||'This team'}'s chance to win that week">Win%</span><span class="r sch-c4">Line</span><span class="r">Odds</span>
    </div>
    <div class="sch-list">${schedPlayedStripHTML(owner,d.info.season)}${d.rows.map((r,i)=>`
      ${(() => {
        /* The deadline falls between two weeks, so it is drawn before the first
           game past it rather than attached to a row. Skipped when the schedule
           on screen already starts after it. */
        const dl=Number(_CFG.tradeDeadlineWeek||0);
        if(!dl||r.playoff||r.week<=dl) return '';
        const prev=d.rows[i-1];
        if(prev&&!prev.playoff&&prev.week>dl) return '';
        return `<div class="sch-deadline"><span class="sch-dl-l"></span>
          <span class="sch-dl-t"><i class="fa fa-gavel"></i>Trade deadline · after week ${dl}</span>
          <span class="sch-dl-l"></span></div>`;
      })()}
      ${''/* the week on the clock is outlined; before kickoff that is week 1 */}
      <div class="sch-row${r.rival?' sch-rrow':''}${!r.playoff&&r.week===Math.max(1,Number(d.info.week)||1)?' sch-now':''}">
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
/* A finished season, week by week: who they played, the score, and whether it
   was a win. Won rows carry a green edge and lost rows a red one, the same
   device the current week uses on the live table. */
function schedResultsHTML(owner){
  const d=owner?schedPlayedRows(owner):null;
  const info=schedSeason();
  if(!d||!d.rows.length){
    return `<div class="tab-loading" style="padding:40px 16px">No games on record for ${info.season}.</div>`;
  }
  const rec=`${d.w}–${d.l}${d.t?`–${d.t}`:''}`;
  const rows=d.rows.map(r=>{
    const cls=!r.counts?' sch-dead':(r.res==='W'?' sch-won':r.res==='L'?' sch-lost':'');
    const fr=_franchises.find(f=>f.owner===r.oppOwner);
    return `<div class="sch-row sch-res${cls}">
      <span class="sch-wk">${r.playoff?'PO':''}${r.week}</span>
      <span class="sch-team"><span class="sch-nm">${r.oppName}</span>
        <span class="sch-ab">${sbTeamAb(r.oppOwner,r.oppName)}</span>
        ${r.counts?'':'<span class="sch-dead-tag">no bearing</span>'}</span>
      <span class="r sch-res-b">${r.counts?r.res:'—'}</span>
      <span class="r sch-score">${r.my.toFixed(1)} – ${r.their.toFixed(1)}</span>
      <span class="r sch-marg">${r.margin>0?'+':''}${r.margin.toFixed(1)}</span>
    </div>`;}).join('');
  return `<div class="sch-reshead">
      <span class="sch-resy">${info.season} season</span>
      <span class="sch-resr">${rec}<span class="sch-respf">${d.pf.toFixed(1)} PF · ${d.pa.toFixed(1)} PA</span></span>
    </div>
    <div class="sch-head sch-head-res">
      <span>Wk</span><span>Opponent</span><span class="r">Result</span>
      <span class="r">Score</span><span class="r">Margin</span>
    </div>
    <div class="sch-list">${rows}</div>
    ${playoffOutlookHTML()}
    <div class="sch-note">Final results for ${info.season}, taken from the league's own scoreboard.${
      d.dead?` ${d.dead} postseason game${d.dead===1?'':'s'} had nothing riding on ${d.dead===1?'it':'them'} — shown, but left out of the record and the points.`:''}</div>`;
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
    <div class="en-row en-head"><span>#</span><span>Player</span><span class="r">Points</span><span class="r">vs. Team</span><span class="r">PPG</span></div>
    ${list.map((r,i)=>{
      const pct=r.g?r.w/r.g:0;
      return `<div class="en-row">
        <span class="en-rk">${i+1}</span>
        <span class="en-p">${playerImg(r.pid,24,r.name)}<span class="en-nm">${r.name}</span></span>
        <span class="r en-pts">${r.pts.toFixed(1)}</span>
        <span class="r en-rec" style="color:${pct>0.5?'var(--green)':pct<0.5?'var(--red)':'var(--text2)'}">${r.w}–${r.g-r.w}</span>
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
      ${bkIQHTML(id)}
    </div>
    <!-- FAAB gauge removed from the hero on request -->
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
        <!-- Draft Grades moved to the Draft Report tab, where the rest of the
             draft work lives -->
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
      const stillHere=Number(document.getElementById('profile-team-select')?.value||_profileTeam)===id;
      if(stillHere&&d) d.innerHTML=profileOverviewHTML(owner);
    }).catch(()=>{});
  }
}
// ── SPORTSBOOK ───────────────────────────────────────────────────────────────
// Play-money futures board. Every line is derived from this league's own
// history: recency-weighted record and scoring, playoff results, top-3 rate,
// rings, coaching metric, scoring blow-ups and duds. Probabilities are turned
// into American prices with a book-style hold, so the field always adds to more
// than 100% exactly like a real sportsbook.
let _sbView='week';          // week | season | team | invest | folio | mine
/* ── WHERE THE MONEY IS ──────────────────────────────────────────────────────
   The board used to be a pure model: it priced every market off ratings and
   never looked up again, so a price was the same on Sunday night as it was
   before anyone had bet a dollar. It moves now.

   Every live bet in the league is read back and totalled by selection. A price
   is then the model blended toward what the money says, which is the direction
   a real book moves: weight of money on one side shortens it and lengthens
   everything else, so backing the crowd late pays less and taking the
   unfashionable side pays more.

   Two deliberate choices. The blend is capped, so money bends the model rather
   than replacing it — twelve managers on a hundred a week is not a deep enough
   market to be trusted on its own. And a bet keeps the price it was struck at,
   which is what makes moving early worth anything.

   Legs name their selection the same way the slip does: an outright is the
   owner key, a two-way is owner:yes / owner:no / owner:o / owner:u. */
const SB_MONEY_MAX=0.45;      // most of the price the money may ever own
const SB_MONEY_REF=500;       // handle at which it reaches half of that
let _sbMoney=null, _sbMoneyKey='';
function sbMoneyKey(){
  if(!_bets) return '';
  let k='';
  for(const b of _bets){
    if(!betIsLive(b)||b.status==='void') continue;
    if(!betsAfterReset(b)) continue;
    k+=b.id+':'+b.status+';';
  }
  return k;
}
function sbMoneyBook(){
  const key=sbMoneyKey();
  if(_sbMoney&&_sbMoneyKey===key) return _sbMoney;
  const season=String(sbSeason());
  const book={};
  (_bets||[]).forEach(b=>{
    if(!betIsLive(b)||b.status==='void') return;
    if(!betsAfterReset(b)) return;
    if(String(b.season||'')!==season) return;
    const stake=Number(b.stake)||0; if(stake<=0) return;
    /* A parlay stakes one amount across several legs. Splitting it evenly
       stops a four-leg slip from shouting four times as loud as a single. */
    const legs=(b.legs||[]).filter(l=>l&&l.mk!=null);
    if(!legs.length) return;
    const each=stake/legs.length;
    legs.forEach(l=>{
      const m=book[l.mk]||(book[l.mk]={picks:{},total:0});
      m.picks[l.pick]=(m.picks[l.pick]||0)+each;
      m.total+=each;
    });
  });
  _sbMoneyKey=key;
  return (_sbMoney=book);
}
/* how far the money is allowed to pull a price, given how much of it there is */
function sbMoneyPull(total){
  if(!(total>0)) return 0;
  return SB_MONEY_MAX*total/(total+SB_MONEY_REF);
}
/* Blend a set of model probabilities toward the money laid on them. Shares are
   taken over the picks named here, so a two-way market passes its own pair and
   an outright passes the whole field. */
function sbBlend(mk,keys,probs){
  const book=sbMoneyBook()[mk];
  if(!book) return probs.slice();
  const staked=keys.map(k=>book.picks[k]||0);
  const tot=staked.reduce((a,b)=>a+b,0);
  if(!(tot>0)) return probs.slice();
  const k=sbMoneyPull(tot);
  const pTot=probs.reduce((a,b)=>a+b,0)||1;
  return probs.map((p,i)=>(1-k)*(p/pTot)+k*(staked[i]/tot));
}
/* what has actually been laid on one selection, for the board to show */
function sbStakeOn(mk,pick){
  const b=sbMoneyBook()[mk];
  return b?(b.picks[pick]||0):0;
}
let _sbTeamSel=null;         // owner for the By Team view
let _slip=[];                // [{k,mk,mkLabel,pick,pickLabel,odds}]
let _sbStake=10;
let _sbCache=null,_sbLiveWeight=0,_sbLivePlayed=0;
let _sbSlipOpen=false;

// The futures season is the one being played next: if the newest season has a
// schedule but nothing played yet, that's it — otherwise it's the year after the
// last completed season.
function sbSeason(){
  for(let i=ALL_SEASONS.length-1;i>=0;i--){
    const y=ALL_SEASONS[i], meta=_seasonMeta[y];
    if(!meta||!(meta.schedule||[]).length) continue;
    const games=(meta.schedule||[]).filter(m=>m.home&&m.away);
    const scored=m=>((m.home.totalPoints||0)>0||(m.away.totalPoints||0)>0);
    if(!games.some(scored)) return Number(y);      // published, not kicked off yet
    /* A season with football in it that is NOT OVER is the season the book is
       pricing. This used to read "any game has been played" as "the season is
       finished" and answer with the following year, from the first Thursday
       night of the season onward. Everything downstream took that year at its
       word: sbPlaceBet stamped every ticket season 2027 while 2026 was being
       played, and betGrade looks its results up by the season on the ticket —
       so _seasonMeta['2027'] was missing, every leg graded null, and not one
       bet placed after kickoff would ever have settled. The stake leaves the
       balance when the bet is struck and only comes back on settlement, so the
       league's bucks would have drained into open tickets all season.

       Over means: every fixture that exists has been played, AND the playoff
       rounds exist to have been played. ESPN publishes the bracket during the
       season — 2026 currently carries weeks 1-14 and nothing else — so
       "everything scored" on its own is true the moment week 14 finishes, with
       three weeks still to come. */
    const regEnd=Number(meta.regEnd)||14;
    const post=games.filter(m=>(Number(m.matchupPeriodId)||0)>regEnd);
    const over=games.every(scored)&&post.length>0;
    return over?Number(y)+1:Number(y);
  }
  return Number(ALL_SEASONS[ALL_SEASONS.length-1])+1;
}
/* The week board follows the season the book is pricing, not the season picker.
   Futures move to next year the moment its schedule lands, and weekly lines
   have to be on the same season as the futures printed above them — otherwise
   the page offers a 2026 playoff berth and, underneath it, a settled week from
   2025. The picker is for reading history; the book is for betting the season
   about to be played.

   sbSeason() can name a year that has no schedule yet — the day after a season
   ends it is already calling the next one — so fall back to the newest season
   that does have one, which is the only season there is anything to price. */
function sbBoardSeason(){
  const y=String(sbSeason());
  if(_seasonMeta[y]&&(_seasonMeta[y].schedule||[]).length) return y;
  for(let i=ALL_SEASONS.length-1;i>=0;i--){
    const s=String(ALL_SEASONS[i]);
    if(_seasonMeta[s]&&(_seasonMeta[s].schedule||[]).length) return s;
  }
  return String(getSeason());
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
/* ── HOW SURE THE BOARD IS ALLOWED TO BE ─────────────────────────────────────
   Before a ball is thrown, every number behind these prices is a read on
   history and roster shape. That is a real opinion and worth pricing — but it
   is not the same thing as knowing, and a board that prices a guess the way it
   prices a fact posts a −140 favourite and a +2000 shot over a season nobody
   has played a minute of yet.

   So the spread is held in while the evidence is thin and let back out as the
   season fills it in, on the same signal the ratings themselves already use:
   nothing in week one, everything it is going to be by week eight. The shape of
   every market is unchanged — the same team is still the favourite, and the
   same team is still the longest shot. They just are not as far apart until
   there is something behind saying they should be. */
const SB_COLD_K=0.44;        // how much of the spread survives with nothing played
const SB_COLD_B=0.40;        // how far toward even the board sits with nothing played
const sbEvidence=()=>Math.min(1,Math.max(0,(_sbLiveWeight||0)/SB_LIVE_MAX));
/* pulls any spread term — a softmax temperature, a logistic slope — in toward
   flat while the season is young */
const sbDamp=v=>v*(SB_COLD_K+(1-SB_COLD_K)*sbEvidence());
// Standardise first (raw ratings are sums of z-scores, so their spread would
// blow the exponential up), then soften toward uniform so the board prices like
// a real book: a ~20% favourite and longshots in the +2000s rather than +9000s.
function sbProbs(vals,k,blend){
  const b0=blend==null?0.16:blend;
  const b=b0+(SB_COLD_B-b0)*(1-sbEvidence());
  const z=sbZ(vals), p=sbSoftmax(z,sbDamp(k==null?0.75:k)), n=vals.length||1;
  return p.map(v=>v*(1-b)+b/n);
}
const SB_HOLD=0.075;              // outright market hold
const SB_TWOWAY=0.024;            // per side on two-way markets
/* the 0.5% floor is what caps the longest shot on the board at +19900 */
const sbPrice=(p,floor)=>amFromProb(Math.min(0.95,Math.max(floor==null?0.005:floor,p)));

/* An entrant is {k,name,av,ab}: k is what the bet is keyed on, av the leading
   graphic (a headshot, a franchise avatar, or nothing for a matchup). */
function sbOutrightAny(key,title,sub,ents,probs,icon,holdMul,entLabel){
  const tot=probs.reduce((a,b)=>a+b,0)||1;
  const base=ents.map((_,i)=>probs[i]/tot);
  const moved=sbBlend(key,ents.map(e=>e.k),base);
  const h=1+SB_HOLD*(holdMul==null?1:holdMul);
  const picks=ents.map((e,i)=>{
    const open=sbPrice(Math.max(0.008,base[i])*h);
    const o=sbPrice(Math.max(0.008,moved[i])*h);
    return {owner:e.k,name:e.name,av:e.av==null?null:e.av,ab:e.ab||'',tail:!!e.tail,
      odds:o,open,prob:probFromAm(o),fair:base[i],handle:sbStakeOn(key,e.k)};
  /* An "anyone else" line is usually the likeliest single outcome on the
     board, but it is not a favourite — it is the part of the field nobody
     bothered to name. Sorting it to the top would read as one. It sits at the
     foot, which is where a book prints it. */
  }).sort((a,b)=>(a.tail?1:0)-(b.tail?1:0)||b.fair-a.fair);
  return {key,title,sub,type:'outright',entLabel:entLabel||'Team',icon:icon||'fa-trophy',picks};
}
/* Two-way, with the clamps handed in. A market where every row is a long shot
   needs different bounds from one where every row is a coin flip, and it also
   needs a different kind of margin: adding a flat 2.4% to a 0.6% chance is not
   a hold, it is a fivefold markup. Those markets take the margin as a
   multiplier on the yes side and leave the near-certain no side alone. */
function sbYesNoAny(key,title,sub,ents,probs,icon,opt){
  const o=opt||{}, lo=o.lo==null?0.14:o.lo, hi=o.hi==null?0.86:o.hi;
  /* yesOnly prints one column. Some two-way markets are only really one bet:
     when the yes side is a hundred-to-one shot the no side is a formality that
     lays the league's whole bankroll to win pocket change, and it is on the
     board only because the shape of a two-way market says it has to be. */
  return {key,title,sub,type:'yesno',entLabel:o.entLabel||'Team',
    yesOnly:!!o.yesOnly,
    icon:icon||'fa-check-double',
    picks:ents.map((e,i)=>{
      const p=Math.min(hi,Math.max(lo,probs[i]));
      const [py]=sbBlend(key,[e.k+':yes',e.k+':no'],[p,1-p]);
      const q=Math.min(0.98,Math.max(0.002,py));
      const yes=o.mul?sbPrice(q*(1+SB_HOLD*4)):sbPrice(Math.min(0.96,q+SB_TWOWAY));
      const no =o.mul?sbPrice(Math.min(0.97,(1-q)+0.015)):sbPrice(Math.min(0.96,(1-q)+SB_TWOWAY));
      return {owner:e.k,name:e.name,av:e.av==null?null:e.av,ab:e.ab||'',
        yes,no,
        openYes:o.mul?sbPrice(p*(1+SB_HOLD*4)):sbPrice(Math.min(0.96,p+SB_TWOWAY)),
        openNo :o.mul?sbPrice(Math.min(0.97,(1-p)+0.015)):sbPrice(Math.min(0.96,(1-p)+SB_TWOWAY)),
        fair:p, handleYes:sbStakeOn(key,e.k+':yes'), handleNo:sbStakeOn(key,e.k+':no')};
    }).sort((a,b)=>b.fair-a.fair)};
}
/* Solve the logistic offset so a field of n entrants sums to exactly k winners.
   A market for "top two seed" has to add up to two, not to twelve independent
   guesses that happen to average out. */
function sbSolveK(z,k,slope){
  const a=slope==null?1.05:slope;
  let lo=-8,hi=8,c=0;
  for(let it=0;it<60;it++){ c=(lo+hi)/2;
    const sum=z.reduce((t,v)=>t+1/(1+Math.exp(-(a*v+c))),0);
    if(sum>k) hi=c; else lo=c; }
  return z.map(v=>1/(1+Math.exp(-(a*v+c))));
}

/* "Who scores the most" is a question about the maximum of a set of random
   variables, not about their ranking, and a softmax over the projections
   answers the wrong one — it hands the also-rans a share proportional to how
   good they are rather than to how often they actually finish first.

   So the week is simulated. Each player's score is drawn around their
   projection with a spread that scales with it, because that is how fantasy
   scoring behaves: a quarterback projected for twenty lands near twenty far
   more reliably than a receiver projected for the same, whose week is one long
   touchdown away from either side of it. The floor on the spread keeps a low
   projection from being treated as a certainty of scoring nothing.

   Seeded deliberately. The board has to price identically every time it is
   built or a market would drift on every repaint. */
function sbTopProbs(means,seed){
  const n=means.length; if(!n) return [];
  let x=((seed||12345)>>>0)||1;
  const rnd=()=>{ x^=x<<13; x>>>=0; x^=x>>>17; x^=x<<5; x>>>=0; return (x>>>0)/4294967296; };
  /* Spread is wide and only partly proportional. A fantasy week is not a
     tight distribution around its projection — the flat term is what lets a
     bench player projected for four put up twenty on two touchdowns, which is
     the single most common way one of these markets actually settles. Without
     it the top projection on a roster priced like a coin flip to lead it. */
  const sd=means.map(m=>0.60*m+4);
  const win=new Array(n).fill(0), N=4000;
  for(let it=0;it<N;it++){
    let bi=0,bv=-1e9;
    for(let i=0;i<n;i++){
      const u=Math.max(1e-9,rnd()), v=rnd();               // Box–Muller
      const sc=means[i]+sd[i]*Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);
      if(sc>bv){ bv=sc; bi=i; }
    }
    win[bi]++;
  }
  return win.map(w=>w/N);
}

/* the pool, keyed by player id, with a per-week projection */
/* ── WHAT A PLAYER IS PROJECTED FOR THIS WEEK ────────────────────────────────
   ESPN publishes two different numbers and only one of them is the one a
   manager sees beside a player in the app: the per-week projection. This used
   to serve the SEASON projection divided by seventeen instead, which is a flat
   average and cannot know about a bye, a matchup, or a player whose season
   number is dragged down by games he was never going to play.

   The gap is not small. In week 1 of 2026 that put Luther Burden at 5.4 when
   ESPN had him at 12.1, and the Jaguars defence at 5.1 against ESPN's 8.2 —
   rookies and returning players are worst hit, because their season totals are
   depressed by weeks the weekly number already knows about.

   Three sources, best first: ESPN's own per-week projection off the roster feed
   for anyone actually rostered, the pool's per-week line where it carries one,
   and only then the flat average, which is still the right answer for a free
   agent nobody has projections for. */
function sbPlayerProj(week){
  const pool=(typeof _bkPool!=='undefined'&&_bkPool)?_bkPool:null;
  if(!pool||!pool.length){ try{ bkLoadPool(); }catch(e){} return null; }
  const out={};
  pool.forEach(p=>{
    const pw=week!=null?(p.projWeeks||{})[String(week)]:null;
    out[String(p.id)]={name:p.name,pos:p.pos,
      wk:(typeof pw==='number'&&pw>0)?pw:(p.proj||p.total||0)/17};
  });
  /* The roster feed is read straight from the cache rather than through
     sbRosters(), so asking for a projection can never kick off a fetch. */
  if(week!=null){
    try{
      const r=_sbRosters[String(sbBoardSeason())+':'+week];
      if(r) Object.keys(r).forEach(tid=>(r[tid]||[]).forEach(e=>{
        const v=e&&e.wkProj;
        if(typeof v==='number'&&v>0&&out[String(e.pid)]) out[String(e.pid)].wk=v;
      }));
    }catch(e){}
  }
  return out;
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

/* ── WHAT THIS SEASON SAYS ───────────────────────────────────────────────────
   The rating underneath every price was built entirely from career record,
   weighted so recent years count for more. That is the right basis for a line
   posted in August and an increasingly poor one by October: a team that has
   started 0–6 was still being priced on who they used to be.

   These four signals are all about right now, and all of them were already
   being gathered for other parts of the site — none of this needs a new call.

     form     this season's record and scoring, and the last three weeks on top,
              so a team playing well shows up before the record catches up
     vol      week-to-week swing. Not good or bad on its own, but it is what
              separates a team that will post the season's highest week from one
              that grinds out the same number every Sunday

   Two more were built and taken back out: roster strength from the NFL player
   pool, and Lineup IQ. Both are genuinely predictive and both are already
   gathered — but only on other tabs. _tenure loads on Player Data and _liq on
   Coaching Metric, so on the Sportsbook they are usually absent, and a price
   that depends on which tabs you happened to visit first is worse than a
   simpler price. They belong here the day that data is loaded league-wide.

   Everything below comes out of _seasonMeta, which is always in memory, so the
   board is the same for everyone whatever route they took to it.

   HOW MUCH THEY COUNT. Early in a season there is almost no current-season
   evidence, and leaning on three games would make the board lurch after every
   upset. So the live blend is weighted by how much football has been played,
   reaching full strength around week eight. In week one this is a no-op and the
   board is the career model exactly as it was. */
/* THIS SEASON IS MOST OF THE ANSWER, AND IT GETS THERE BY WEEK FOUR.

   These were 0.55 and eight games: a board still leaning on last year's teams
   most of the way to November. Four weeks is enough football to know who is
   good, and the roster term underneath it is pure ESPN projection, which is
   about the season being played rather than any season behind it. The career
   model keeps the remaining quarter — it is what stops three flukey weeks
   deciding everything, and it is all there is in week one. */
const SB_LIVE_MAX=0.75;      // most of the rating this season may ever own
const SB_LIVE_FULL=4;        // games after which it counts for all of that
/* The least of the rating the CURRENT squad owns once there is a roster to
   read, football or not. History still counts — it is simply no longer the
   majority of the answer the moment twelve real rosters exist. */
const SB_LIVE_MIN=0.65;

/* ── WHO IS ON EACH ROSTER ───────────────────────────────────────────────────
   One mRoster call returns all twelve rosters at once, which is what makes
   roster strength cheap enough to price on. An earlier pass skipped it on the
   assumption it needed the tenure crunch — seventeen calls — which was simply
   wrong about where the data comes from.

   Held once per season-week and reused; when it lands the board rebuilds. */
/* Held per season-week rather than in one slot. Two callers now want
   different weeks — the rating wants the last week actually played, the weekly
   board wants the one about to be played — and a single slot had them evicting
   each other's answer and refetching forever, each landing repriced the board
   and sent the other one back to the network. */
const _sbRosters={}; const _sbRostersBusy={}; const _sbRostersAt={};
/* HOW LONG A ROSTER IS TRUSTED. It was cached for the life of the page, so a
   lineup was whatever it had been the first time anybody opened the tab — set
   your lineup on ESPN, come back, and the Forecast still showed the old one
   until a reload. Two minutes is short enough that a lineup change turns up
   while somebody is still looking at it, and long enough that moving between
   tabs is not a request each time. */
const SB_ROSTER_TTL=120000;
function sbRosters(season,week){
  const key=season+':'+week;
  /* Stale-while-revalidate: the copy on hand is returned straight away and a
     fresh one is fetched behind it, so a lineup change appears on the next
     render rather than blanking the page while it is asked for. */
  const have=_sbRosters[key];
  if(have&&Date.now()-(_sbRostersAt[key]||0)<SB_ROSTER_TTL) return have;
  if(_sbRostersBusy[key]) return have||null;
  _sbRostersBusy[key]=true;
  /* The latch has to come off however this ends. A request that simply hangs
     used to leave it on for the life of the page, and six markets that depend
     on the rosters would quietly never appear — no error, no spinner, just a
     board that was missing half of itself until someone reloaded. */
  const done=()=>{ _sbRostersBusy[key]=false; };
  const ctl=typeof AbortController!=='undefined'?new AbortController():null;
  const timer=setTimeout(()=>{ try{ ctl&&ctl.abort(); }catch(e){} done(); },20000);
  fetch(`${BASE}?view=mRoster&seasonId=${season}&scoringPeriodId=${week}&live=1`,
        ctl?{cache:'no-store',signal:ctl.signal}:{cache:'no-store'})
    .then(r=>r.ok?r.json():null)
    .then(j=>{
      clearTimeout(timer);
      /* An empty answer is not an answer. Caching {} would have every market
         that reads this decide the rosters are simply empty and stay wrong for
         the rest of the session rather than trying again. */
      const teams=(j&&j.teams)||[];
      if(!teams.length){ done(); return; }
      const out={};
      teams.forEach(t=>{
        out[t.id]=((t.roster&&t.roster.entries)||[]).map(e=>{
          const pl=(e.playerPoolEntry&&e.playerPoolEntry.player)||{};
          /* ESPN's own numbers for this week, straight off the roster call:
             source 1 is the projection a manager sees beside the player in the
             app, source 0 is what he has actually scored so far. Both were
             being dropped on the floor, which is why a week used to be priced
             off a season total divided by seventeen. */
          const st=pl.stats||[];
          const val=src=>{
            const r=st.find(x=>x.statSourceId===src&&x.statSplitTypeId===1
                              &&Number(x.scoringPeriodId)===Number(week));
            return r&&typeof r.appliedTotal==='number'?Math.round(r.appliedTotal*100)/100:null;
          };
          /* THE NAME IS RIGHT HERE, so take it. _playerNames is filled from
             weekly SCORING, which in a season nobody has played yet is empty —
             so pName fell through to "Player #4426515" and the Forecast lined
             two rosters of id numbers up against each other. The roster call
             has carried fullName all along and it was being dropped on the
             floor. Seeded into the shared map as well as kept on the entry, so
             every other pName on the site resolves too. */
          if(pl.fullName&&!_playerNames[e.playerId]) _playerNames[e.playerId]=pl.fullName;
          return {pid:e.playerId, n:pl.fullName||null, slot:e.lineupSlotId,
            pos:pl.defaultPositionId||0, proTeam:pl.proTeamId||0,
            wkProj:val(1), wkAct:val(0)};
        });
      });
      _sbRosters[key]=out; _sbRostersAt[key]=Date.now(); done();
      _sbCache=null; _invCache=null;                   // reprice both with it
      /* Whichever tab is looking at these has to be told they landed. The book
         was, and the Schedule tab was not — so the Forecast painted whatever it
         had when the page opened and never corrected itself. */
      if(_activeTab==='book') try{ renderBook(); }catch(e){}
      if(_activeTab==='week') try{ renderWeek(); }catch(e){}
    })
    .catch(()=>{ clearTimeout(timer); done(); });
  return have||null;
}

/* ── THE BEST TEAM A ROSTER COULD PUT OUT ────────────────────────────────────
   A team is priced on what it could start, not on what it did start. Anything
   read off the lineup that was actually set is gameable: sit the whole starting
   eleven, lose by ninety, and next week's price has you as a long underdog —
   then put everybody back and collect. What a manager holds cannot be faked
   without genuinely giving the players away.

   Slot-aware, because the top nine projections regardless of position is not a
   team. Quarterbacks project around three hundred and kickers around a hundred
   and twenty, so nine-best handed a full credit to every quarterback on a
   roster when only one of them can start. The shape comes from the league's own
   rosterSettings; the fallback is the shape this league runs. */
const LINEUP_SHAPE_FALLBACK={qb:1,rb:2,wr:2,te:1,flex:1,dst:1,k:1};
function sbSlotShape(meta){
  const c=meta&&meta.slots;
  if(!c) return LINEUP_SHAPE_FALLBACK;
  const n=k=>Math.max(0,Number(c[k])||0);
  const shape={qb:n(0),rb:n(2),wr:n(4),te:n(6),flex:n(23),dst:n(16),k:n(17)};
  /* A settings blob that names no starters at all is not a lineup — some past
     seasons come back with the counts missing entirely. */
  return Object.values(shape).some(v=>v>0)?shape:LINEUP_SHAPE_FALLBACK;
}
/* posOf answers ESPN's defaultPositionId: 1 QB, 2 RB, 3 WR, 4 TE, 5 K, 16 D/ST */
function sbBestLineup(entries,projOf,posOf,shape){
  const by={1:[],2:[],3:[],4:[],5:[],16:[]};
  (entries||[]).forEach(e=>{
    const p=posOf(e);
    if(by[p]) by[p].push(Math.max(0,projOf(e)||0));
  });
  Object.keys(by).forEach(k=>by[k].sort((a,b)=>b-a));
  let total=0;
  const take=(pos,n)=>{ const a=by[pos]; for(let i=0;i<n&&a.length;i++) total+=a.shift(); };
  take(1,shape.qb); take(2,shape.rb); take(3,shape.wr); take(4,shape.te);
  take(16,shape.dst); take(5,shape.k);
  /* FLEX takes the best of whatever running back, receiver or tight end is left
     once the named slots are filled. */
  for(let i=0;i<shape.flex;i++){
    let bestPos=null,bestVal=-1;
    [2,3,4].forEach(p=>{ if(by[p].length&&by[p][0]>bestVal){ bestVal=by[p][0]; bestPos=p; } });
    if(bestPos==null) break;
    total+=by[bestPos].shift();
  }
  return total;
}
/* ── WHAT THE PLAYERS THEY HOLD ARE PROJECTED TO SCORE ───────────────────────
   The best legal lineup a roster could field, valued at ESPN's own season
   projection for each player. Shared by the sportsbook rating and the share
   market, so the two cannot answer differently about the same roster.

   This is the one signal that does not need a game to have been played, which
   makes it the only real information there is between a draft and week one.
   Returns {} rather than a guess when the roster feed or the player pool has
   not landed — both callers treat an empty answer as "no signal" and fall back
   to what they had. */
function rosterProjByOwner(season,week){
  const meta=_seasonMeta[String(season)]; if(!meta) return {};
  const rosters=sbRosters(season,week||1);
  /* THE POOL FOR THE SEASON BEING PRICED, NOT WHICHEVER ONE IS LOADED.
     _bkPool points at bkSeason(), which is the newest season with a SCORE in it
     — last year, from February until September. So a 2026 roster was being
     valued at ESPN's 2025 projections: the numbers were real, they were just
     about a season that had already been played. Lebron's squad came out
     eleventh of twelve on last year's numbers and first on this year's, and the
     whole board is built on that one figure. */
  const pool=(typeof _bkPools!=='undefined'&&_bkPools[String(season)])||null;
  if(!pool||!pool.length){ try{ bkLoadPool(season); }catch(e){} }
  if(!rosters||!pool||!pool.length) return {};
  const proj={},posn={};
  pool.forEach(p=>{ proj[String(p.id)]=p.proj||p.total||0; posn[String(p.id)]=Number(p.pos)||0; });
  const owners=meta.owners||{}, shape=sbSlotShape(meta), out={};
  Object.keys(rosters).forEach(tid=>{
    const o=owners[tid]; if(!o) return;
    const es=rosters[tid]||[];
    if(es.length) out[o]=sbBestLineup(es,
      e=>proj[String(e.pid)]||0, e=>posn[String(e.pid)]||0, shape);
  });
  return out;
}
/* ── WHAT IS STILL TO COME ───────────────────────────────────────────────────
   A fantasy week has no half-time. Every roster plays across Thursday, Sunday
   and Monday, so the honest question is never "is the game over" but "how many
   of these players have yet to kick off". Answer that and a week in progress can
   be priced properly: what is already banked, plus what the players still to
   play are projected to add, with the uncertainty shrinking as the week empties.

   The scoreboard digest is pinned to the fantasy week and to the REGULAR season.
   Unpinned it answers with whatever is current, and in late August that is the
   preseason — which would have read as football in progress and closed the book
   in the middle of the summer. */
const SB_WK_SD=26;            // how far a full lineup's week strays, in points
const SB_WK_MIN_LEFT=4;       // less than this still to come is not a market
const SB_BENCH_SLOTS=[20,21,24];
const NFL_WK_TTL=45000;
let _nflWk={},_nflWkAt={},_nflWkBusy={};
function nflWeekGames(week,season){
  const wk=Number(week)||0, yr=String(season||sbBoardSeason()||'');
  if(!wk||!yr) return null;
  const k=yr+':'+wk;
  if(_nflWk[k]&&Date.now()-(_nflWkAt[k]||0)<NFL_WK_TTL) return _nflWk[k];
  if(!_nflWkBusy[k]){
    _nflWkBusy[k]=true;
    fetch(`${BASE}?type=nflstate&week=${wk}&year=${yr}`,{cache:'no-store'})
      .then(r=>r.ok?r.json():null)
      .then(j=>{ if(j&&Array.isArray(j.games)){ _nflWk[k]=j; _nflWkAt[k]=Date.now();
        _sbCache=null;
        if(_activeTab==='book') try{ renderBook(); }catch(e){} } })
      .catch(()=>{})
      .finally(()=>{ _nflWkBusy[k]=false; });
  }
  return _nflWk[k]||null;
}
/* 'pre' | 'in' | 'post' for a player's NFL team that week, 'bye' when they have
   no game, or null when the digest is not in hand — which is not an answer and
   the callers treat it as such. The abbreviations match exactly: all
   thirty-two of NFL_TEAMS appear in the scoreboard, checked against week 1. */
function nflTeamState(proTeamId,week,season){
  const d=nflWeekGames(week,season);
  if(!d||!Array.isArray(d.games)||!d.games.length) return null;
  const ab=NFL_TEAMS[Number(proTeamId)];
  if(!ab) return null;
  const g=d.games.find(x=>x.ht===ab||x.at===ab);
  return g?(g.s||null):'bye';
}
const nflWeekLive=(week,season)=>{
  const d=nflWeekGames(week,season);
  return d?!!d.anyLive:null;
};
/* ONE TEAM'S WEEK: what it is worth, what is banked, what is left.

   Before a week starts the lineup can still be changed, so it is priced on the
   best legal lineup the roster could put out — reading the lineup as currently
   set would let somebody park their starters on the bench, collect a long
   price, and put them back before kickoff.

   Once the week is under way the lineup is locked, so the players actually in
   it are the ones who will score, and those are what it prices. */
function sbTeamWeek(tid,week,season,meta,banked,started){
  const roster=sbRosters(season,week);
  const es=roster&&roster[tid];
  if(!es||!es.length) return null;
  const projOf=e=>Math.max(0,Number(e.wkProj)||0);
  const posOf=e=>Number(e.pos)||0;
  /* No projections at all means ESPN has not published the week — fall back
     rather than pricing everything at zero. */
  if(!es.some(e=>Number(e.wkProj)>0)) return null;
  if(!started){
    const full=sbBestLineup(es,projOf,posOf,sbSlotShape(meta));
    return {exp:full,left:full,full};
  }
  const starters=es.filter(e=>!SB_BENCH_SLOTS.includes(Number(e.slot)));
  if(!starters.length) return null;
  let left=0,full=0,unknown=false;
  starters.forEach(e=>{
    const p=projOf(e); full+=p;
    const st=nflTeamState(e.proTeam,week,season);
    if(st==='pre') left+=p;                  // not kicked off: all of it to come
    else if(st==null) unknown=true;          // no digest: no honest answer
    /* 'post' and 'bye' have nothing left to give, and 'in' cannot happen while
       the board is open — a live game closes it. */
  });
  if(unknown) return null;
  return {exp:(Number(banked)||0)+left,left,full};
}
/* Abramowitz and Stegun 7.1.26 — plenty for a price. */
function sbErf(x){
  const s=x<0?-1:1; x=Math.abs(x);
  const t=1/(1+0.3275911*x);
  const y=1-(((((1.061405429*t-1.453152027)*t+1.421413741)*t-0.284496736)*t+0.254829592)*t)
    *Math.exp(-x*x);
  return s*y;
}
const sbNormCdf=z=>0.5*(1+sbErf(z/Math.SQRT2));
/* Uncertainty scales with how much of the week is still to be played: a full
   lineup to come is a full week's spread, and a week with nothing left is
   settled. */
const sbWkSd=t=>SB_WK_SD*Math.sqrt(Math.max(0,Math.min(1,t&&t.full>0?t.left/t.full:1)));

function sbLiveSignals(rows,season){
  const out={form:{},vol:{},roster:{},lineup:{},played:0};
  if(!season) return out;
  const meta=_seasonMeta[season]; if(!meta) return out;
  const owners=meta.owners||{};

  /* ── form: this season's record, scoring and last three weeks ── */
  const rec={};
  const R=o=>rec[o]||(rec[o]={w:0,g:0,pf:0,weeks:[]});
  (meta.schedule||[]).forEach(m=>{
    const wk=Number(m.matchupPeriodId)||0;
    if(!wk||!m.home||!m.away) return;
    const hp=m.home.totalPoints||0, ap=m.away.totalPoints||0;
    if(hp===0&&ap===0) return;
    const ho=owners[m.home.teamId], ao=owners[m.away.teamId];
    if(!ho||!ao||ho===ao) return;
    const H=R(ho), A=R(ao);
    H.g++; A.g++; H.pf+=hp; A.pf+=ap;
    H.weeks.push({wk,pts:hp}); A.weeks.push({wk,pts:ap});
    if(hp>ap) H.w++; else if(ap>hp) A.w++; else { H.w+=0.5; A.w+=0.5; }
  });
  const played=Math.max(0,...rows.map(r=>(rec[r.owner]||{}).g||0));
  out.played=played;
  /* ROSTER IS COMPUTED FIRST, BEFORE THE EARLY RETURN BELOW.

     It used to sit at the foot of this function, under `if(!played) return` —
     so the one forward-looking signal in the whole model was skipped in exactly
     the weeks it was the only signal there was. Between the draft and week one
     the board fell back on career history alone: twelve franchises with four
     similar years behind them priced within a whisker of each other, and a team
     that had just drafted brilliantly was the same price as one that had not.
     That is not a market, it is a free bet on the draft. */
  try{
    const lw=ntLastWeek(season);
    Object.assign(out.roster,rosterProjByOwner(season,(lw&&lw.week)||1));
  }catch(e){}
  if(!played) return out;
  const lgPpg=(()=>{ let p=0,g=0; Object.values(rec).forEach(x=>{p+=x.pf;g+=x.g;}); return g?p/g:100; })();
  rows.forEach(r=>{
    const x=rec[r.owner]; if(!x||!x.g) return;
    const wr=(x.w/x.g-0.5)*2;                                   // −1 … +1
    /* Every week counts. This briefly dropped each manager's lowest week, to
       stop somebody sitting a lineup on purpose to lengthen their own price —
       but nobody is going to throw a real fantasy game for a play-money bet,
       and discarding a bad week discards a real bad week far more often than a
       staged one. A team that scored 60 is a team that scored 60. */
    const sc=lgPpg?((x.pf/x.g)/lgPpg-1):0;
    const last=x.weeks.slice(-3);
    const fm=(last.length&&lgPpg)?((last.reduce((a,b)=>a+b.pts,0)/last.length)/lgPpg-1):0;
    out.form[r.owner]=0.50*wr+0.30*sc+0.20*fm;
    /* the spread of their weekly scores, as a fraction of their own average */
    if(x.weeks.length>2){
      const m2=x.pf/x.g;
      const v=Math.sqrt(x.weeks.reduce((a,b)=>a+(b.pts-m2)*(b.pts-m2),0)/x.weeks.length);
      out.vol[r.owner]=m2?v/m2:0;
    }
  });
  /* roster is computed above, before the early return — see the note there */

  /* ── lineup: how often the right players were actually started ──
     A strong roster only converts if it is in the lineup. One cached call. */
  try{
    if(typeof loadLineupIQ==='function') loadLineupIQ(season);
    const l=(typeof _liq!=='undefined'&&_liq)?_liq[season]:null;
    if(l&&Object.keys(l).length) rows.forEach(r=>{
      const tid=r.curId!=null?r.curId:r.tid;
      const d=tid!=null?l[tid]:null;
      if(d&&d.decisions) out.lineup[r.owner]=d.correct/d.decisions;
    });
  }catch(e){}
  return out;
}

/* ── WHAT A CACHE OF A LIVE NUMBER HAS TO WATCH ──────────────────────────────
   Anything derived from results has to be recomputed when results land, and the
   only reliable way to know that happened is to put it in the cache key. This
   has been got wrong three separate times in three separate places — the share
   board froze at its opening prices, the sportsbook kept its pre-season ratings,
   and the playoff outlook went on simulating a week that had already been
   played — each time because the key described the SEASON and not the football.

   So there is one answer to that question now, and every cache of a live number
   asks it: the last completed week, and how many fixtures carry a score. Either
   moving means the football moved. */
function footballStamp(season){
  const meta=_seasonMeta[String(season)]||{};
  const scored=(meta.schedule||[]).filter(m=>m&&m.home&&m.away
    &&((m.home.totalPoints||0)>0||(m.away.totalPoints||0)>0)).length;
  let lw=null; try{ lw=(ntLastWeek(season)||{}).week; }catch(e){}
  return 'w'+(lw??'-')+'s'+scored;
}
function sbBuild(){
  /* The board is a function of the season, of the money on it, AND of the
     football behind it — a rating is mostly form and roster, both of which move
     when a week lands. Without the last of those three the book kept serving the
     ratings it computed the first time anybody opened it. */
  const stamp=String(sbSeason())+'|'+sbMoneyKey()+'|'+footballStamp(sbBoardSeason());
  if(_sbCache&&_sbCache.stamp===stamp) return _sbCache;
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
    /* Points against is not in here. It is what other managers scored on you —
       nothing a manager picks, starts or trades changes it, so rating a team
       down for it was punishing them for the schedule. It still prices the one
       market that is explicitly about it. */
    r.career=1.15*zWin[i]+0.95*zPpg[i]+0.45*zPo[i]+0.30*zT3[i]+0.25*zRg[i]+0.10*zCm[i];
    r.rating=r.career;
    r.z={win:zWin[i],ppg:zPpg[i],pa:zPa[i],hi:zHi[i],o150:z150[i],u80:z80[i],mv:zMv[i],
         last:zLast[i],coy:zCoy[i],commit:zCommit[i]};
  });
  /* Now the part that knows what has happened this year. Each live signal is
     z-scored across the league so it is on the same scale as the career terms,
     and the blend grows with the number of games behind it — nothing at all in
     week one, everything it is going to be by week eight. */
  (function(){
    /* The season being priced, not the last one with games in it. Those are
       the same season for most of the year and very much not the same in
       August: ntSeason() hands back the completed year, so the board was
       folding last season's form in as though it were this season's and, worse,
       reporting a full season of evidence for a season nobody has played a
       minute of. That is what put a −470 favourite on week one. With nothing
       played this comes back empty, the rating falls back to the career number,
       and the spread stays in until real games open it up. */
    const live=sbLiveSignals(rows,sbBoardSeason());
    const has=k=>rows.some(r=>live[k][r.owner]!=null);
    const zf=k=>{ const v=rows.map(r=>live[k][r.owner]!=null?live[k][r.owner]:0); return sbZ(v); };
    const zForm=has('form')?zf('form'):rows.map(()=>0);
    const zVol =has('vol')?zf('vol'):rows.map(()=>0);
    const zRost=has('roster')?zf('roster'):rows.map(()=>0);
    const zLine=has('lineup')?zf('lineup'):rows.map(()=>0);
    /* TWO DIFFERENT WEIGHTS, AND THEY ARE NOT THE SAME QUESTION.

       `gw` is how much football has been played, and it is what the board's
       confidence is still read from — a line may only get sure about a team
       once games have settled it. Flooring that was what once put a −470
       favourite on week one, so it stays exactly as it was.

       `w` is how much of the RATING the current squad owns, and that does not
       have to wait for football. A drafted roster valued at ESPN's own
       projections is real information about the weeks ahead; four years of
       franchise history is real information about a team that no longer exists
       in the same shape. So with a roster to read, the current squad takes the
       majority of the rating from the moment the draft ends, and history keeps
       the rest rather than being thrown away. */
    const gw=Math.min(1,(live.played||0)/SB_LIVE_FULL)*SB_LIVE_MAX;
    const w=has('roster')?Math.max(SB_LIVE_MIN,gw):gw;
    rows.forEach((r,i)=>{
      /* ROSTER LEADS, BECAUSE ROSTER IS THE PROJECTION.

         It is the best legal lineup the players they hold could put out,
         valued at ESPN's own numbers — the most forward-looking thing in the
         data and the only term here about the weeks ahead rather than the ones
         behind. Form is the record, the scoring and the last three weeks, and
         goes in whole. Lineup is back, small: it is how often the right players
         were actually started, which says whether a roster gets converted, and
         the reason it came out — somebody benching a team to lengthen their own
         odds — is not a thing anybody is going to do. */
      r.live=0.85*zForm[i]+1.15*zRost[i]+0.25*zLine[i];
      r.z.form=zForm[i]; r.z.vol=zVol[i]; r.z.roster=zRost[i]; r.z.lineup=zLine[i];
    });
    /* BOTH HALVES GO ON THE SAME SCALE BEFORE THEY ARE MIXED.

       career sums six z-scores and carries about 3.2 of weight; live sums three
       and carries about 2.25, and in a week with no football it is one term
       alone. Mixing those two raw meant the stated split was not the real one —
       at w=0.65 the career half still moved the rating more than the current
       one did, which is precisely the complaint: every team priced the same
       because the only thing separating them was four similar seasons.
       Re-scoring each side across the league makes the weights mean what they
       say. */
    const zCar=sbZ(rows.map(r=>r.career)), zLiv=sbZ(rows.map(r=>r.live));
    rows.forEach((r,i)=>{ r.rating=(1-w)*zCar[i]+w*zLiv[i]; });
    /* the games-based weight is what confidence reads, not the blend weight */
    _sbLiveWeight=gw; _sbLivePlayed=live.played||0;
  })();
  const ratings=rows.map(r=>r.rating);
  const lgPpg=rows.reduce((a,r)=>a+r.ppg,0)/rows.length;
  const GAMES=regEndOf(latest)||14;

  // ── helpers that build market objects ──
  /* Each builder prices twice: once off the model alone, which is the opening
     line and never changes, and once with the money folded in, which is what
     is on the board. Showing both is what makes a move visible. */
  const priced=(p)=>{ const o=amFromProb(Math.min(0.95,Math.max(0.005,p))); return o; };
  /* `only` prices a subset of the league rather than all twelve — the
     conference markets are six-horse races, and they used to build their picks
     by hand for exactly that reason. Building them here instead is what puts
     them on the same money blend as everything else; hand-rolled, they were the
     one board a bet could never move. */
  const outright=(key,title,sub,probs,badge,icon,only,holdMul)=>{
    const rs=only||rows;
    const tot=probs.reduce((a,b)=>a+b,0)||1;
    const base=rs.map((_,i)=>probs[i]/tot);
    const keys=rs.map(r=>r.owner);
    const moved=sbBlend(key,keys,base);
    const h=1+HOLD*(holdMul==null?1:holdMul);
    const picks=rs.map((r,i)=>{
      const open=priced(Math.max(0.008,base[i])*h);
      const o=priced(Math.max(0.008,moved[i])*h);
      return {owner:r.owner,name:r.name,tid:r.tid,odds:o,open,prob:probFromAm(o),
        fair:base[i],handle:sbStakeOn(key,r.owner)};
    }).sort((a,b)=>b.fair-a.fair);
    return {key,title,sub,type:'outright',icon:icon||'fa-trophy',picks};
  };
  const yesno=(key,title,sub,probs,badge,icon)=>({key,title,sub,type:'yesno',
    icon:icon||'fa-check-double',
    picks:rows.map((r,i)=>{
      const p=Math.min(0.86,Math.max(0.14,probs[i]));
      /* two-way, so the shares are between this team's own yes and no */
      const [py]=sbBlend(key,[r.owner+':yes',r.owner+':no'],[p,1-p]);
      const q=Math.min(0.92,Math.max(0.08,py));
      return {owner:r.owner,name:r.name,tid:r.tid,
        yes:priced(Math.min(0.96,q+TWOWAY)), no:priced(Math.min(0.96,(1-q)+TWOWAY)),
        openYes:priced(Math.min(0.96,p+TWOWAY)), openNo:priced(Math.min(0.96,(1-p)+TWOWAY)),
        fair:p, handleYes:sbStakeOn(key,r.owner+':yes'), handleNo:sbStakeOn(key,r.owner+':no')};
    }).sort((a,b)=>b.fair-a.fair)});
  const overunder=(key,title,sub,vals,slope,round,badge,icon)=>({key,title,sub,type:'ou',
    icon:icon||'fa-arrows-up-down',
    picks:rows.map((r,i)=>{
      const exp=vals[i];
      const line=round===0.5?Math.round(exp*2)/2:Math.round(exp/round)*round+(round>=5?0.5:0);
      const pOver=Math.min(0.70,Math.max(0.30,0.5+(exp-line)*slope));
      /* the line itself is left where the model put it and the price moves
         around it — a line that walked as well would make an old slip hard to
         read back against the board */
      const [po]=sbBlend(key,[r.owner+':o',r.owner+':u'],[pOver,1-pOver]);
      const q=Math.min(0.88,Math.max(0.12,po));
      return {owner:r.owner,name:r.name,tid:r.tid,line,exp,
        over:priced(Math.min(0.95,q+TWOWAY)), under:priced(Math.min(0.95,(1-q)+TWOWAY)),
        openOver:priced(Math.min(0.95,pOver+TWOWAY)), openUnder:priced(Math.min(0.95,(1-pOver)+TWOWAY)),
        fair:exp, handleO:sbStakeOn(key,r.owner+':o'), handleU:sbStakeOn(key,r.owner+':u')};
    }).sort((a,b)=>b.fair-a.fair)});

  /* ── FUTURES ──
     Nothing here is written past the end of the regular season. The
     championship and First-Time Champion needed a bracket to settle, and the
     four award markets were decided by a league vote rather than by the data —
     which meant they could never be graded automatically and sat open forever.
     They are off the board. */
  const confs={};
  rows.forEach(r=>{ (confs[r.conf||'League']||(confs[r.conf||'League']=[])).push(r); });
  const confMarkets=Object.entries(confs).filter(([,arr])=>arr.length>1).map(([cname,arr])=>
    outright('conf-'+cname,`${cname} Conference Winner`,'Best record in the conference',
      sbProbs(arr.map(r=>r.rating),0.80,0.30),null,'fa-star',arr,0.8));
  // make the playoffs: logistic on rating, solved so the field sums to 6 of 12
  const spots=Math.min(6,Math.round(rows.length/2));
  const zr=sbZ(ratings);
  let lo=-6,hiC=6,c=0;
  const poSlope=sbDamp(1.05);
  for(let it=0;it<60;it++){ c=(lo+hiC)/2;
    const s=zr.reduce((a,v)=>a+1/(1+Math.exp(-(poSlope*v+c))),0);
    if(s>spots) hiC=c; else lo=c; }
  const pPlayoffs=zr.map(v=>1/(1+Math.exp(-(poSlope*v+c))));
  const playoffs=yesno('playoffs',`${sbSeason()} Playoff Berth`,`Top ${spots} of ${rows.length} make the bracket`,
    pPlayoffs,'Yes / No','fa-calendar-check');

  // ── TEAM PROPS ──
  const wins=overunder('wins',`Regular Season Wins`,`${GAMES}-game regular season`,
    zr.map(v=>Math.min(GAMES-2,Math.max(2,GAMES*Math.min(0.70,Math.max(0.30,1/(1+Math.exp(-sbDamp(0.62)*v))))))),
    0.30,0.5,'Over / Under','fa-arrows-up-down');
  const mostPf=outright('mostpf','Most Points Scored','League leader in points for',
    sbProbs(rows.map(r=>r.z.ppg+0.55*(r.z.form||0)+0.60*(r.z.roster||0)),0.80,0.40),'Outright','fa-fire');
  const fewestPf=outright('fewpf','Fewest Points Scored','League low in points for',
    sbProbs(rows.map(r=>-r.z.ppg-0.55*(r.z.form||0)-0.60*(r.z.roster||0)),0.80,0.40),'Outright','fa-battery-empty');
  const mostPa=outright('mostpa','Most Points Against','Takes the most incoming fire',
    /* Nothing a manager does decides this — it is whoever happens to be
       drawn against them having a good week. So it opens at close to a
       twelve-way coin flip and only earns a shape as the season supplies one:
       10% career lean at the start, rising toward the live signal as the games
       come in. Blend 0.90 is what pulls it back toward even. */
    sbProbs(rows.map(r=>{
      const live=_sbLiveWeight||0;                 // 0 in week one, 0.55 by week eight
      return (1-live)*(0.10*r.z.pa)+live*(0.70*r.z.pa+0.30*(r.z.form||0));
    /* And the flattening itself relaxes. A constant 0.90 would hold the
       market near even all year no matter what actually happened; it eases to
       0.55 as the season fills in, so real points-against earns a real shape. */
    }),0.40,0.90-0.35*(_sbLiveWeight||0)/SB_LIVE_MAX),'Outright','fa-shield-halved');

  // ── ACHIEVEMENTS ──
  /* a big week needs a good offence and a wide spread — a steady team almost
     never posts the league's best score even when it is the best team */
  const highWeek=outright('highweek','Highest Single Week','Top regular-season score by any team in any week',
    sbProbs(rows.map(r=>0.60*r.z.ppg+0.40*r.z.hi+0.45*(r.z.vol||0)+0.35*(r.z.form||0)+0.35*(r.z.roster||0)),0.70,0.42),'Outright','fa-bolt');
  /* ── WHERE THE SEASON LEAVES YOU ──
     Two markets on the ends of the final table. Both are all-or-nothing on a
     fixed number of places, so they are solved to sum to two rather than left
     as twelve separate guesses — otherwise the board would happily sell four
     teams a 40% chance of the same two seeds. The slope is steeper than the
     playoff market's because the very top and the very bottom separate harder
     than the middle does. */
  const pTop2=sbSolveK(zr,2,sbDamp(1.35));
  const topSeed=sbYesNoAny('topseed',`${sbSeason()} Top Two Seed`,
    'Finishes the regular season as the 1 or 2 seed — a first-round bye',
    rows.map(r=>({k:r.owner,name:r.name})),pTop2,'fa-crown',{lo:0.02,hi:0.62});
  const pBot2=sbSolveK(zr.map(v=>-v),2,sbDamp(1.35));
  const botSeed=sbYesNoAny('botseed',`${sbSeason()} Bottom Two Seed`,
    'Finishes 11th or 12th — the losers bracket',
    rows.map(r=>({k:r.owner,name:r.name})),pBot2,'fa-trash-can',{lo:0.02,hi:0.62});
  const groups={
    season:[...confMarkets,playoffs,wins,mostPf,fewestPf,mostPa,highWeek,
      topSeed,botSeed],
  };
  _sbCache={rows,groups,season:sbSeason(),games:GAMES,spots,stamp};
  return _sbCache;
}


/* ── THE MARKET ──────────────────────────────────────────────────────────────
   Shares in a franchise, bought and sold with GFL Bucks.

   HOW A PRICE IS SET. A share is priced off how the team is actually doing this
   season, not off its all-time record — the sportsbook's rating is weighted
   across every year, which is right for a futures line and wrong for something
   meant to move week to week. Three things, all measured against the league
   rather than in absolute terms:

     record   what fraction of games they have won, against the league's 0.500
     scoring  points per game, against the league's average
     form     the last three weeks, so a hot streak shows up before the record

   Each is a ratio that equals 1.00 for a perfectly average team, so a team that
   is average on all three prices at exactly the base. Before a ball is kicked
   every team is average on all three by definition, which is why everyone opens
   at the same price without that having to be special-cased.

   The index is then divided by the league's own mean, which keeps the average
   share worth the base price forever. That is the one genuinely market-like
   property worth having here: the money is finite, so one team climbing means
   the others slip. Without it a good season would simply inflate all twelve.

   WHAT IS DELIBERATELY NOT MODELLED. Real prices also move on order flow — a
   crowd of buyers pushes a price up on its own. With twelve people who can see
   each other's moves that is trivially gamed: buy, watch your own purchase lift
   the price, sell. So demand does not move the price here. Results do. */
const INV_BASE=10;              // what an average share is worth
/* Money on this board is shown to the cent. bucksFmt rounds to the whole buck,
   which is right for a balance and hides everything a market does. */
const invFmt=v=>'$'+(Math.round((Number(v)||0)*100)/100).toFixed(2);
const INV_FORM_WEEKS=3;
/* How much of a share price the roster projection owns: most of it before a
   ball is kicked, a residual once the season can speak for itself. */
const INV_PROJ_MAX=0.70;     // with no football played
const INV_PROJ_MIN=0.15;     // once INV_PROJ_FULL weeks are in
const INV_PROJ_FULL=6;
/* How hard the roster gap is stretched into a price gap. 1 is the raw ratio,
   which puts the whole league inside a dollar of itself. */
const INV_PROJ_POW=3;

/* every team's current-season record, scoring and recent form */
function invStats(season,throughWeek){
  const meta=_seasonMeta[season]; if(!meta) return null;
  const owners=meta.owners||{};
  const rec={};
  const r=o=>rec[o]||(rec[o]={o,w:0,g:0,pf:0,recent:[]});
  (meta.schedule||[]).forEach(m=>{
    const wk=Number(m.matchupPeriodId)||0;
    if(!wk||(throughWeek!=null&&wk>throughWeek)||!m.home||!m.away) return;
    const hp=m.home.totalPoints||0, ap=m.away.totalPoints||0;
    if(hp===0&&ap===0) return;
    const ho=owners[m.home.teamId], ao=owners[m.away.teamId];
    if(!ho||!ao||ho===ao) return;
    const H=r(ho), A=r(ao);
    H.g++; A.g++; H.pf+=hp; A.pf+=ap;
    if(hp>ap) H.w++; else if(ap>hp) A.w++; else { H.w+=0.5; A.w+=0.5; }
    H.recent.push({wk,pts:hp,won:hp>ap}); A.recent.push({wk,pts:ap,won:ap>hp});
  });
  const rows=Object.values(rec);
  return rows.length?rows:null;
}
/* ── THE TWO FUNDS ───────────────────────────────────────────────────────────
   Twelve stocks is twelve decisions, and the first one anybody has to make is
   which six teams they think are going to be good — which is a lot of homework
   to ask of somebody who just wants to be long the East. So there are two funds
   as well, one for each conference, and a share in one is an equal slice of all
   six teams inside it.

   Priced as a fund is priced: the mean of what its holdings are worth. A share
   of the East fund is one-sixth of a share in each East team, so its price has
   to be their average, and it moves when they move — no separate model, no
   second set of numbers to keep honest.

   That falls out of the share prices having a fixed mean of their own. The
   twelve always average to the base price, so the two funds always average to
   it too: one conference can only climb by the other slipping. Buying a fund is
   therefore a bet on a conference rather than on the league, which is the only
   thing a fund of half the market can honestly be.

   Both open at the base price for the same reason every team does — before a
   ball is kicked everyone is average, so both baskets are. */
const INV_FUNDS=[
  {k:'ETF_EAST',name:'East ETF',div:'east'},
  {k:'ETF_WEST',name:'West ETF',div:'west'}
];
const invFund=k=>INV_FUNDS.find(f=>f.k===k)||null;
/* who is inside each fund, for the season being priced. Conferences are a
   property of a season rather than of a franchise — teams move between them —
   so this is read fresh from that season's own meta rather than cached on the
   franchise. */
function invFundMembers(season){
  const out={}; INV_FUNDS.forEach(f=>{ out[f.k]=[]; });
  const meta=_seasonMeta[season];
  if(!meta||!meta.teams) return out;
  const names=meta.divisions||{};
  const rows=Object.values(meta.teams).filter(t=>t&&t.owner);
  let matched=0;
  rows.forEach(t=>{
    const dn=String(names[t.div]||'').toLowerCase();
    const f=INV_FUNDS.find(x=>dn.indexOf(x.div)>=0);
    if(f){ out[f.k].push(t.owner); matched++; }
  });
  if(rows.length&&matched===rows.length) return out;
  /* The conferences have not always carried their names upstream. Two of them
     and no names is still an East and a West — take them in id order, which is
     the order ESPN lists them in. Anything other than two divisions is not a
     league these two funds describe, and they simply do not price. */
  INV_FUNDS.forEach(f=>{ out[f.k]=[]; });
  const ids=[...new Set(rows.map(t=>Number(t.div)||0))].sort((a,b)=>a-b);
  if(ids.length!==2) return out;
  rows.forEach(t=>{ out[INV_FUNDS[ids.indexOf(Number(t.div)||0)].k].push(t.owner); });
  return out;
}

/* the price of one share in every team, and what it was a week ago */
let _invCache=null;
/* Every share price in the league as it stood at the end of a given week.
   Pulled out of invBoard so the same arithmetic can price any week, not only
   the latest one — which is what lets a portfolio be replayed rather than
   sampled and stored. Pure and cheap: it reads the season's own schedule and
   nothing else. */
/* ── A FINISHED WEEK'S PRICES ARE READ, NOT RECOMPUTED ───────────────────────
   Everything below derives a price from the schedule and the rosters as they
   are RIGHT NOW, which is correct for the week being played and wrong for every
   week behind it: change how a team is priced and the whole history of the
   portfolio chart moves with it. Weeks that have been frozen by
   scripts/archive-charts.mjs are served from the file instead, so a settled
   week reads the same in December as it did in September. */
let _frozen=null,_frozenFetched=false,_frozenReq=null;
function frozenPrices(season,week){
  if(!_frozenFetched){
    if(!_frozenReq){
      _frozenReq=fetch(`/data/charts-${season}.json`,{cache:'no-store'})
        .then(r=>r.ok?r.json():null)
        .then(j=>{ _frozen=j; _frozenFetched=true;
          try{ _invCache=null; if(_activeTab==='book') renderBook(); }catch(e){}
          return j; })
        .catch(()=>{ _frozen=null; _frozenFetched=true; return null; });
    }
    return null;
  }
  if(!_frozen||String(_frozen.season)!==String(season)) return null;
  const w=(_frozen.weeks||{})[String(week)];
  return (w&&w.prices&&Object.keys(w.prices).length)?w.prices:null;
}
function invPricesAt(season,through){
  const fr=(_franchises||[]);
  if(!fr.length) return {};
  if(through!=null){
    const froz=frozenPrices(season,through);
    if(froz) return {...froz};
  }
  const rows=season?invStats(season,through):null;
  const byOwner={};
  /* ── WHAT THE ROSTER IS PROJECTED TO SCORE ─────────────────────────────────
     Record, scoring and form are all things that have already happened, and
     before week one none of them has. Every ratio came back 1.00, every team
     divided out to the league mean, and all twelve shares opened at exactly
     $10 — so a manager who had just drafted the best squad in the league was
     the same price as one who had drafted the worst, and buying the good draft
     was free money rather than a market position.

     The roster projection is what the league looks like NOW. It leads the price
     while there is no football to read, and it steps back as results arrive,
     because by then what a team has actually done says more than what it was
     projected to do. It never leaves entirely: a squad is still a squad. */
  const projs=season?rosterProjByOwner(season,through||1):{};
  const pv=Object.values(projs).filter(v=>v>0);
  const projMean=pv.length?pv.reduce((a,b)=>a+b,0)/pv.length:0;
  if(rows){
    const lgPpg=rows.reduce((a,x)=>a+x.pf,0)/Math.max(1,rows.reduce((a,x)=>a+x.g,0));
    rows.forEach(x=>{
      const gp=Math.max(1,x.g);
      const winR=(x.w/gp)/0.5;                       // 1.00 at .500
      const ppgR=lgPpg?(x.pf/gp)/lgPpg:1;            // 1.00 at league average
      const form=x.recent.slice(-INV_FORM_WEEKS);
      const formR=(form.length&&lgPpg)
        ? (form.reduce((a,f)=>a+f.pts,0)/form.length)/lgPpg : 1;
      byOwner[x.o]=0.45*winR+0.35*ppgR+0.20*formR;
    });
  }
  if(projMean>0){
    /* fades from most of the price to a residual as the football arrives */
    const gp=Math.max(0,...(rows||[]).map(x=>x.g||0));
    const t=Math.min(1,gp/INV_PROJ_FULL);
    const rw=INV_PROJ_MAX+(INV_PROJ_MIN-INV_PROJ_MAX)*t;
    (_franchises||[]).forEach(f=>{
      const p=projs[f.owner]; if(!(p>0)) return;
      /* STRETCHED, BECAUSE THE RAW RATIO IS NOT A MARKET.

         Twelve fantasy rosters projected over a season sit within about eleven
         per cent of each other end to end — the best squad in the league is not
         twice the worst, it is a tenth better. Fed in raw that is a board where
         first costs $10.79 and last costs $8.94, which is the same complaint as
         before wearing a smaller number: nobody is going to read the league to
         win forty cents. The exponent stretches the same ORDER into prices
         worth taking a position on without inventing any of it — the ranking is
         untouched, only the distance between the rungs. */
      const projR=Math.pow(p/projMean,INV_PROJ_POW);  // 1.00 at league average
      const base=byOwner[f.owner]!=null?byOwner[f.owner]:1;
      byOwner[f.owner]=(1-rw)*base+rw*projR;
    });
  }
  /* anyone with no games yet sits at the league's own middle */
  const vals=fr.map(f=>byOwner[f.owner]!=null?byOwner[f.owner]:1);
  const mean=vals.reduce((a,b)=>a+b,0)/vals.length || 1;
  const out={};
  fr.forEach((f,i)=>{ out[f.owner]=Math.max(1,+(INV_BASE*vals[i]/mean).toFixed(2)); });
  /* the funds price off the board that was just built, in the same pass, so a
     replayed week prices its funds from that week's teams and never from
     today's */
  const mem=invFundMembers(season);
  INV_FUNDS.forEach(f=>{
    const own=(mem[f.k]||[]).filter(o=>out[o]!=null);
    if(own.length) out[f.k]=+(own.reduce((a,o)=>a+out[o],0)/own.length).toFixed(2);
  });
  return out;
}
function invBoard(){
  /* THE MARKET PRICES THE SEASON BEING PLAYED, NOT THE LAST ONE WITH SCORES.

     ntSeason() answers with the newest season that has a point in it, which
     from February until the first Sunday in September is LAST year. So the
     share market spent the whole off-season pricing twelve teams on a roster
     none of them still had: the best 2025 franchise was the most expensive
     share of 2026 regardless of how its draft had gone. sbBoardSeason() is the
     answer the sportsbook already moved to for exactly this reason. */
  const season=(typeof sbBoardSeason==='function')?sbBoardSeason():(ntSeason&&ntSeason());
  /* The season's own team list is in the stamp, not just the franchise count.
     A season that arrives after the board was first drawn adds no franchises —
     the same twelve owners — so without it the market would keep serving the
     flat opening prices it computed before that season had any games in it. */
  /* AND THE WEEK, WHICH IS THE WHOLE POINT OF THE BOARD.

     The stamp was season, franchise count and team count — not one of which
     changes when a week's results land. Prices are a function of record,
     scoring and recent form through the last completed week, so the board froze
     at whatever it computed the first time and would not move again until the
     page was reloaded. A market that does not reprice when the football does is
     the one thing this board must not be. */
  /* AND THE ROSTERS, now that they price the board. The feed is fetched once
     and cached, so the first paint of a session has no projections in it and
     the one after does — without the rosters in the stamp the market would keep
     serving that first flat set of prices, and a waiver or a trade would never
     move a price either. */
  const _lwk=season?(ntLastWeek(season)||{}).week:null;
  const _pj=season?rosterProjByOwner(season,_lwk||1):{};
  const _pjSig=Object.keys(_pj).sort().map(o=>o+':'+Math.round(_pj[o])).join(',');
  const stamp=String(season)+'|'+(_franchises||[]).length
    +'|'+Object.keys((_seasonMeta[season]||{}).teams||{}).length
    +'|'+footballStamp(season)
    +'|r'+_pjSig;
  if(_invCache&&_invCache.stamp===stamp) return _invCache;

  const fr=(_franchises||[]);
  if(!fr.length) return null;
  const lw=season?(ntLastWeek(season)||{}).week:null;
  const priceAt=through=>invPricesAt(season,through);

  const now=priceAt(lw), prev=priceAt(lw!=null?lw-1:null);
  const list=fr.map(f=>{
    const p=now[f.owner], was=prev[f.owner];
    return {owner:f.owner, name:f.name, fr:f, price:p, prev:was,
      chg:+(p-was).toFixed(2), pct:was?+(((p-was)/was)*100).toFixed(1):0};
  }).sort((a,b)=>b.price-a.price);
  /* the funds sit beside the stocks rather than among them — same shape of row
     so the market reads as one board, its own group so nobody buys one by
     mistake thinking it is a team */
  const mem=invFundMembers(season);
  const funds=INV_FUNDS.map(f=>{
    const p=now[f.k]; if(p==null) return null;
    const was=prev[f.k]!=null?prev[f.k]:p;
    const inside=(mem[f.k]||[]).slice()
      .sort((a,b)=>(now[b]||0)-(now[a]||0));
    return {owner:f.k, name:f.name, fund:f, members:inside, price:p, prev:was,
      chg:+(p-was).toFixed(2), pct:was?+(((p-was)/was)*100).toFixed(1):0};
  }).filter(Boolean);
  return (_invCache={stamp,season,week:lw,list,funds,priceOf:now});
}
/* a fund wears the crests of what it holds, overlapped the way a stack of
   cards is. Four is as many as reads at this size, and the leaders are the
   ones on top. */
function invFundCrest(members){
  const fr=(_franchises||[]);
  const pics=(members||[]).map(o=>fr.find(f=>f.owner===o)).filter(Boolean).slice(0,4);
  if(!pics.length) return '';
  return `<span class="iv-stack">${pics.map(f=>
    `<span class="iv-stack-i">${franchiseAvatar(f,18,5)}</span>`).join('')}</span>`;
}
const invPrice=owner=>{ const b=invBoard(); return b?(b.priceOf[owner]||INV_BASE):INV_BASE; };

/* ── the ledger ──────────────────────────────────────────────────────────────
   Every buy and sell, on the manager's own profile. Holdings are replayed from
   it rather than stored as a number, the same way the bucks balance is — two
   devices can never disagree about a total they both derive. */
let _inv=null;
const invKey=()=>lsKey('inv');
function invLots(){
  if(_inv) return _inv;
  let a=[]; try{ a=JSON.parse(localStorage.getItem(invKey())||'[]')||[]; }catch(e){}
  return (_inv=Array.isArray(a)?a:[]);
}
function invSave(){
  const a=invLots();
  try{ localStorage.setItem(invKey(),JSON.stringify(a)); }catch(e){}
  if(_me) try{ gflPatchProfile(_me.k1,{inv:JSON.stringify(a)}); }catch(e){}
}
/* Merged rather than replaced. Taking the server copy outright would throw
   away a trade made while the profile write was failing — the device would show
   it, the next sync would silently undo it. Each entry is stamped with the
   moment it happened, so the union of both sides is the true ledger. */
async function invSync(){
  if(!_me) return;
  try{
    const res=await gflFetchProfile(_me.k1);
    let srv=[]; try{ srv=JSON.parse((res&&res.data&&res.data.inv)||'[]')||[]; }catch(e){}
    if(!Array.isArray(srv)) return;
    const seen=new Set(), merged=[];
    [...srv,...invLots()].forEach(l=>{
      if(!l||!l.o) return;
      const k=[l.o,l.s,l.p,l.t,l.k].join('|');
      if(seen.has(k)) return; seen.add(k); merged.push(l);
    });
    merged.sort((x,y)=>(Number(x.t)||0)-(Number(y.t)||0));
    if(JSON.stringify(merged)===JSON.stringify(invLots())) return;
    _inv=merged;
    try{ localStorage.setItem(invKey(),JSON.stringify(merged)); }catch(e){}
    /* if the device knew something the profile did not, put it back */
    if(merged.length!==srv.length&&_me)
      try{ gflPatchProfile(_me.k1,{inv:JSON.stringify(merged)}); }catch(e){}
    if(_activeTab==='book') renderBook();
  }catch(e){}
}
function invReset(){ _inv=null; try{ invSync(); }catch(e){} }
/* shares held in each team, replayed */
function invHoldings(){
  const h={};
  invLots().forEach(l=>{
    const n=Number(l.s)||0; if(!n||!l.o) return;
    h[l.o]=(h[l.o]||0)+(l.k==='s'?-n:n);
  });
  Object.keys(h).forEach(o=>{ if(h[o]<=0.0001) delete h[o]; });
  return h;
}
/* what each holding cost on average, for the profit line */
function invCostBasis(owner){
  let sh=0, cost=0;
  invLots().forEach(l=>{
    if(l.o!==owner) return;
    const n=Number(l.s)||0, px=Number(l.p)||0;
    if(l.k==='s'){ const avg=sh?cost/sh:0; sh-=n; cost-=avg*n; }
    else { sh+=n; cost+=n*px; }
  });
  return sh>0?cost/sh:0;
}
/* cash currently tied up in shares — this is what leaves the bucks balance */
function invNetSpent(){
  let net=0;
  bkLots().forEach(l=>{
    /* each lot settles to the cent on its own, the way a real fill would —
       rounding only the total would let sub-cent dust accumulate across a
       season of trades */
    const v=bucks2((Number(l.s)||0)*(Number(l.p)||0));
    net+=(l.k==='s'?-v:v);
  });
  return bucks2(net);
}
/* ── PROFIT, WEEK BY WEEK ────────────────────────────────────────────────────
   Nothing about this is stored or sampled. Share prices are a function of what
   each team had done by the end of a given week, so any past week can simply be
   priced again — and the ledger says what was held at the time. Replaying the
   two together gives the true line, exactly, for free, and it is right about
   trades made before this was ever written.

   Profit rather than value. Value goes up when you buy more, which says how
   invested you are and nothing about whether you are any good at it.

   And profit means the whole of it — what a sale actually banked plus what the
   open positions are up or down — the same reading the bankroll line takes of a
   settled bet. It used to count only what was still held, so selling a winner
   dropped the line back to zero and the chart said you had made nothing the
   moment you took the money. Selling at a profit moves this line up and leaves
   it there. */
/* what every sale actually banked, against the average cost of what it sold */
function invRealised(){
  const sh={},cost={}; let real=0;
  invLots().forEach(l=>{
    const o=l.o, n=Number(l.s)||0, p=Number(l.p)||0;
    if(!o||!n) return;
    if(l.k==='s'){
      const avg=sh[o]?cost[o]/sh[o]:0;
      real+=n*(p-avg);
      sh[o]=(sh[o]||0)-n; cost[o]=(cost[o]||0)-avg*n;
    } else { sh[o]=(sh[o]||0)+n; cost[o]=(cost[o]||0)+n*p; }
  });
  return real;
}
const invWeekNow=()=>Number((_liveInfo||liveWeekInfo()||{}).week)||1;
function invProfitSeries(){
  const lots=invLots();
  if(!lots.length) return null;
  /* the same season the board prices, or the chart and the market would be
     valuing the identical share at two different numbers */
  const season=(typeof sbBoardSeason==='function')?sbBoardSeason():(ntSeason&&ntSeason());
  const last=season?((ntLastWeek(season)||{}).week||0):0;
  /* ── ONE POINT A WEEK, AND THE WEEK IS A TUESDAY ──────────────────────────
     In season that is what the fantasy-week series below already is: a week's
     prices are settled when its results land, which is the Tuesday, so a new
     point appears every Tuesday on its own.

     Out of season there are no completed weeks to walk, and the lots are
     stamped with a week of a season that has not started — which is what had a
     single purchase drawing seventeen weeks of last year. So the line is walked
     by the calendar instead: a point every real Tuesday from the first trade to
     this one.

     That is exact rather than approximate. Realised profit comes off the trade
     timestamps, which are real times; unrealised is measured against today's
     price, which is the only price that exists yet — nothing has been played,
     so no price has moved since any of these trades. The line steps when
     something was sold and is flat in between, which is the truth. */
  const ledgerSeason=String(bkLeagueSeason());
  if(String(season)!==ledgerSeason||!last){
    const tue=t=>realWeekStart(new Date(t));
    const stamps=lots.map(l=>Number(l.t)||Date.now());
    const firstTue=tue(Math.min(...stamps)), nowTue=tue(Date.now());
    const WEEK=7*24*3600*1000;
    /* profit as it stood at a moment: everything banked by then, plus what was
       still held valued at what it is worth */
    const atTime=T=>{
      const sh={},cost={}; let realised=0;
      lots.slice().sort((a,b)=>(Number(a.t)||0)-(Number(b.t)||0))
        .filter(l=>(Number(l.t)||0)<=T).forEach(l=>{
        const o=l.o,n=Number(l.s)||0,pr=Number(l.p)||0;
        if(!o||!n) return;
        if(l.k==='s'){ const avg=sh[o]?cost[o]/sh[o]:0; realised+=n*(pr-avg);
          sh[o]=(sh[o]||0)-n; cost[o]=(cost[o]||0)-avg*n; }
        else { sh[o]=(sh[o]||0)+n; cost[o]=(cost[o]||0)+n*pr; }
      });
      let profit=realised;
      Object.keys(sh).forEach(o=>{ if(sh[o]>0.0001)
        profit+=sh[o]*(invPrice(o)-(cost[o]/sh[o])); });
      return profit;
    };
    const pts=[{wk:firstTue-WEEK,val:0,start:true,date:true}];
    for(let t=firstTue;t<=nowTue;t+=WEEK) pts.push({wk:t,val:atTime(t+WEEK-1),date:true});
    const nowP=invProfit();
    const lastPt=pts[pts.length-1];
    if(Math.abs(lastPt.val-nowP)>0.005||lastPt.start) pts.push({wk:'now',val:nowP,now:true});
    return {pts,net:nowP,byDate:true};
  }
  /* lots written before the week was stamped are treated as held from the
     opening week — the only honest reading of a trade with no week on it */
  const wk=l=>Number(l.w)||1;
  const first=Math.min(...lots.map(wk));
  const weeks=[];
  for(let w=first;w<=Math.max(first,last);w++) weeks.push(w);
  const at=w=>{
    const px=invPricesAt(season,w);
    const sh={}, cost={};
    let real=0;
    lots.filter(l=>wk(l)<=w).forEach(l=>{
      const o=l.o, n=Number(l.s)||0, p=Number(l.p)||0;
      if(!o||!n) return;
      if(l.k==='s'){
        const avg=sh[o]?cost[o]/sh[o]:0;
        real+=n*(p-avg);
        sh[o]=(sh[o]||0)-n; cost[o]=(cost[o]||0)-avg*n;
      } else { sh[o]=(sh[o]||0)+n; cost[o]=(cost[o]||0)+n*p; }
    });
    /* banked by that week, plus whatever the open positions were worth against
       what they cost — a running total rather than a snapshot of the holdings */
    let profit=real;
    Object.keys(sh).forEach(o=>{ if(sh[o]>0.0001) profit+=sh[o]*((px[o]||INV_BASE)-(cost[o]/sh[o])); });
    return profit;
  };
  const pts=[{wk:first-1,val:0,start:true}];
  weeks.forEach(w=>pts.push({wk:w,val:at(w)}));
  /* and where it stands right now, which is not the same as the last week that
     finished if anything was bought this morning */
  const nowProfit=invProfit();
  const lw=pts[pts.length-1];
  if(!lw||Math.abs(lw.val-nowProfit)>0.005||lw.start) pts.push({wk:'now',val:nowProfit,now:true});
  return pts.length>1?{pts,net:nowProfit}:null;
}
/* Same chart the bankroll line uses, on the portfolio's numbers — including
   when there is nothing to draw. Selling the last share used to take the whole
   panel off the page, so the one view that is a record of what you have done
   went blank the moment you closed a position. The bankroll chart next door
   keeps its frame and says why it is empty; this does the same. */
function invChartHTML(){
  const d=invProfitSeries();
  if(!d) return `<div class="inv-chart">
    <div class="inv-ch-h"><span>Profit since you started</span>
      <b style="color:var(--text2)">${invFmt(0)}</b></div>
    <div class="bank-empty">Nothing to plot yet — the line starts with your first trade.</div>
  </div>`;
  const W=600,H=114,padL=8,padR=8,padT=12,padB=10;
  const vals=d.pts.map(p=>p.val);
  let lo=Math.min(...vals,0), hi=Math.max(...vals,0);
  if(hi-lo<4){ const m=(hi+lo)/2; lo=m-2; hi=m+2; }
  const pad=(hi-lo)*0.15; lo-=pad; hi+=pad;
  const x=i=>padL+(d.pts.length<2?0:i*(W-padL-padR)/(d.pts.length-1));
  const y=v=>padT+(hi-v)/(hi-lo)*(H-padT-padB);
  const base=y(0);
  const line=d.pts.map((p,i)=>`${i?'L':'M'}${x(i).toFixed(1)},${y(p.val).toFixed(1)}`).join(' ');
  const area=`${line} L${x(d.pts.length-1).toFixed(1)},${base.toFixed(1)} L${x(0).toFixed(1)},${base.toFixed(1)} Z`;
  const up=d.net>=0, col=up?'#3fd07a':'#e8687e';
  const dots=d.pts.map((p,i)=>{
    const lastOne=i===d.pts.length-1;
    return `<circle cx="${x(i).toFixed(1)}" cy="${y(p.val).toFixed(1)}" r="${lastOne?4:2.6}"
      fill="${p.start?'var(--text3)':col}" ${lastOne?'stroke="var(--bg2)" stroke-width="2"':''}/>`;
  }).join('');
  const axis=d.pts.map((p,i)=>{
    /* the last point is always labelled, so the one before it never is —
       "wk 17" and "Now" sit a few pixels apart and printed over each other */
    if(i===d.pts.length-2) return '';
    if(d.pts.length>7 && i%2 && i!==d.pts.length-1) return '';
    const px=(x(i)/W*100).toFixed(2);
    const shift=i===0?'0':i===d.pts.length-1?'-100%':'-50%';
    /* a date-walked point is a Tuesday, so it is labelled like one — the
       fantasy-week series keeps "wk N" */
    const lbl=p.start?'Start':p.now?'Now'
      :p.date?new Date(p.wk).toLocaleDateString(undefined,{month:'short',day:'numeric'})
      :'wk '+p.wk;
    return `<span class="bank-x" style="left:${px}%;transform:translateX(${shift})">${lbl}</span>`;
  }).join('');
  return `<div class="inv-chart">
    <div class="inv-ch-h"><span>Profit since you started</span>
      <b style="color:${up?'var(--green)':'var(--red)'}">${up?'+':'−'}${invFmt(Math.abs(d.net))}</b></div>
    <div class="bank-chart">
      <svg class="bank-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img"
        aria-label="Portfolio profit by week">
        <defs><linearGradient id="invfill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${col}" stop-opacity="0.30"/>
          <stop offset="100%" stop-color="${col}" stop-opacity="0"/>
        </linearGradient></defs>
        <line x1="${padL}" y1="${base.toFixed(1)}" x2="${W-padR}" y2="${base.toFixed(1)}"
          stroke="var(--text3)" stroke-opacity="0.35" stroke-width="1" stroke-dasharray="3 3"/>
        <path d="${area}" fill="url(#invfill)"/>
        <path d="${line}" fill="none" stroke="${col}" stroke-width="2.2"
          vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round"/>
        ${dots}
      </svg>
      <div class="bank-axis">${axis}</div>
    </div>
  </div>`;
}
function invValue(){
  const h=invHoldings();
  return Object.keys(h).reduce((a,o)=>a+h[o]*invPrice(o),0);
}
function invProfit(){
  const h=invHoldings();
  const open=Object.keys(h).reduce((a,o)=>a+h[o]*(invPrice(o)-invCostBasis(o)),0);
  return invRealised()+open;
}

let _invBusy=false,_invErr='';
async function invTrade(owner,shares,sell){
  if(!_me){ openSignIn(); return; }
  if(_invBusy) return;
  let n=invRound(shares);
  if(!(n>0)){ _invErr=_invMode==='amt'&&!sell?'Pick an amount first.':'Pick a number of shares first.'; renderBook(); return; }
  const px=invPrice(owner);
  if(sell){
    const have=invHoldings()[owner]||0;
    if(n>have+1e-6){ _invErr='You only hold '+invShFmt(have)+'.'; renderBook(); return; }
    /* a sale for all of it must leave nothing behind — rounding a fractional
       holding down would strand dust nobody can ever sell */
    n=Math.min(n,have);
  } else if(n*px>bucksBalance()+1e-6){
    _invErr='Not enough GFL Bucks for that.'; renderBook(); return;
  }
  _invBusy=true; _invErr=''; renderBook();
  /* The week is stamped at the trade, because a timestamp cannot be turned
     back into a fantasy week afterwards with any confidence, and the profit
     line needs to know what you were holding in each of them. */
  invLots().push({o:owner,s:n,p:px,t:Date.now(),w:invWeekNow(),k:sell?'s':'b'});
  invSave();
  /* the card goes back to empty: the amount was spent, and leaving it filled in
     invites a second helping of a trade already made */
  if(sell) _invQty['s_'+owner]=0; else { _invQty[owner]=0; _invCash[owner]=0; }
  _invBusy=false;
  renderBook();
  try{ renderBetsBar(); }catch(e){}
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

/* ── THE EASTER EGG ──────────────────────────────────────────────────────────
   One pixel egg is hidden somewhere on the site at any moment. It moves every
   five minutes, and where it goes is worked out rather than stored: the clock
   is divided into five-minute windows and the window number seeds a small
   deterministic generator, which picks the page and the spot on it. Every
   device runs the same arithmetic on the same window, so everyone is hunting
   the same egg in the same place without a single byte crossing the network.

   Nothing marks an unfound egg. If nobody spots it inside its five minutes the
   window rolls and a new one is somewhere else — there is no queue and no
   catching up, which is what makes finding one worth something.

   Only the finder's claim is written down, as a list of window numbers on
   their own profile document. That list is also the receipt: the bank pays ten
   GFL Bucks per entry, so a find is worth the same whenever it is counted, and
   replaying the ledger on another device produces the same balance. */
/* THE WINDOW AND THE PRIZE ARE TUNABLE, and they were not. Five minutes was a
   build-time value that no switch ever turned off: 288 eggs a day, 2,016 a
   week, a theoretical $20,160 against a weekly allowance of $100. Eggs were not
   a bonus on the economy, they were the economy.

   Twelve hours puts two a day on the board and caps the hunt at $140 a week
   before anybody has to actually find one — which is a bonus worth chasing and
   not worth farming. Both numbers live in config.js now, so the balance can be
   moved without going through here. */
const EGG_MS=Math.max(1,Number(_CFG.eggWindowHours??12))*3600*1000;
const EGG_PRIZE=Math.max(0,Number(_CFG.eggPrize??10));
/* ── WHEN THE HUNT STARTS ────────────────────────────────────────────────────
   Windows used to be counted from the epoch of the clock itself, which meant
   the hunt had always been running and the first egg landed wherever the
   arithmetic happened to put it. config.eggStart is the moment it begins, and
   windows are counted from THERE — so the first egg appears on that date and
   every one after it lands a clean interval later.

   Before that moment there is no egg at all. Nothing is hidden, nothing can be
   claimed, and every locker room says when the first one is due. */
const eggEpoch=()=>{
  const m=/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?$/.exec(String(_CFG.eggStart||'').trim());
  if(!m) return 0;
  return new Date(+m[1],+m[2]-1,+m[3],m[4]?+m[4]:0,m[5]?+m[5]:0,0,0).getTime();
};
const eggWindow=(t=Date.now())=>Math.floor((t-eggEpoch())/EGG_MS);
/* the moment a given window opens, which is what the timer sleeps until */
const eggWindowAt=w=>eggEpoch()+w*EGG_MS;
/* is there an egg out there at all? before the hunt opens, no */
const eggLive=(t=Date.now())=>t>=eggEpoch();
/* how long until the next one is hidden — the wait to the epoch before the hunt
   opens, and the wait to the next window once it has */
const eggNextAt=(t=Date.now())=>eggLive(t)?eggWindowAt(eggWindow(t)+1):eggEpoch();
/* How long until the next egg is hidden, in the same shape as the bucks
   countdown so the two read as the same kind of number. */
function eggInText(t=Date.now()){
  const ms=Math.max(0,eggNextAt(t)-t);
  const d=Math.floor(ms/86400000), h=Math.floor(ms%86400000/3600000);
  const m=Math.floor(ms%3600000/60000);
  return d>0?`${d}d ${h}h`:h>0?`${h}h ${m}m`:`${m}m`;
}
/* WHAT THE LOCKER ROOM SAYS ABOUT THE HUNT. Three states and not two: before the
   hunt opens there is no egg to have missed, so it counts down to the first one
   rather than claiming there is one out there. */
function eggChip(){
  if(!eggLive()) return {cls:'soon', text:`First egg in ${eggInText()}`};
  if(eggClaimedNow()) return {cls:'got', text:`You got this one · next in ${eggInText()}`};
  return {cls:'live', text:'One out there'};
}
/* mulberry32: tiny, and identical in every browser — which matters more here
   than quality, since two managers disagreeing about the spot would be a bug */
function eggRand(seed){
  let a=seed>>>0;
  return ()=>{
    a=(a+0x6D2B79F5)>>>0;
    let t=Math.imul(a^(a>>>15),1|a);
    t=(t+Math.imul(t^(t>>>7),61|t))^t;
    return ((t^(t>>>14))>>>0)/4294967296;
  };
}
/* The homepage is left out — it is the first thing everyone sees and finding it
   there would take no looking. So is the profile page, which is where the
   finds are reported. */
const EGG_TABS=['week','book','punishment','teams','leaders','history',
                'tenure','legacy','standings','draft','trades','badbeat'];
function eggSpot(w=eggWindow()){
  const r=eggRand(Math.imul(w,2654435761));
  const tab=EGG_TABS[Math.floor(r()*EGG_TABS.length)];
  /* kept off the top of the page on purpose: an egg level with the title would
     be sitting in plain sight before anyone had scrolled */
  return {w, tab, x:0.05+r()*0.86, y:0.20+r()*0.70};
}

let _eggs=null, _eggTimer=null, _eggBusy=false;
const eggKey=()=>lsKey('eggs');
/* A find is a window number, and a window number only means anything under the
   window length it was recorded with. Changing eggWindowHours renumbers every
   window, so yesterday's finds become numbers from a scheme that no longer
   exists — the five-minute era counted to about 5,957,000 where twelve-hour
   windows are around 41,000.

   Left alone that was worse than a wrong total on screen: eggClaim writes the
   whole set back to the profile, so the next egg anybody claimed would have
   pushed a few hundred dead numbers back up and paid them ten bucks each.

   So a stored find has to be plausible under the current scheme. Nothing from
   the future, nothing older than two years of windows. That heals every device
   on the next load without anyone clearing anything, and it holds the same way
   if the window is ever changed again — in either direction. */
/* ── A FIND IS A MOMENT, NOT A WINDOW NUMBER ─────────────────────────────────
   The comment above describes what used to be stored and why it could not
   survive a change of window length. It was right about the danger and wrong
   about the cure: dropping anything implausible under the CURRENT scheme means
   the scheme change itself destroys the record. Moving the window from twelve
   hours to two days did exactly that — seven managers between them lost eleven
   finds, a hundred and ten bucks, because their numbers were counted in
   twelve-hour units and the new arithmetic could not read them.

   So what is stored is the millisecond a find was made. That is the same number
   under every scheme: change the window and the finds regroup, none of them
   disappears, and the count that pays is untouched.

   OLD NUMBERS ARE RECOVERED RATHER THAN BINNED. A stored index is small where a
   timestamp is enormous, which is how the two are told apart, and the window
   length that produced it can be solved for: an index times its own unit lands
   on a real recent date, so `now / index` gives that unit back to the nearest
   hour. 41390 resolves to twelve hours and 10347 to forty-eight, which are the
   two schemes this league has actually run. */
const EGG_T_MIN=1e12;                       // below this it is an index, not a time
const EGG_MAX_AGE_MS=2*365*24*3600*1000;
function eggTimeOf(n){
  if(!(n>0)) return 0;
  /* already a moment, but still not one from the future — that guard is the
     only part of the old window check worth keeping */
  if(n>=EGG_T_MIN) return n<=Date.now()+3600000?n:0;
  const hours=Math.round(Date.now()/n/3600000);
  if(!(hours>0)&&hours!==0) return 0;
  const t=n*Math.max(1,hours)*3600000;
  return (t>0&&t<=Date.now()+3600000)?t:0;  // nothing from the future
}
function eggsFound(){
  if(_eggs) return _eggs;
  let list=[];
  try{ list=JSON.parse(localStorage.getItem(eggKey())||'[]')||[]; }catch(e){}
  const cut=Date.now()-EGG_MAX_AGE_MS;
  const clean=[...new Set(list.map(Number).map(eggTimeOf).filter(t=>t>cut))];
  _eggs=new Set(clean);
  /* the migrated list is written straight back, so an old device is repaired
     once rather than re-solved on every read */
  if(clean.length!==list.length||clean.some((t,i)=>t!==Number(list[i]))){
    try{ localStorage.setItem(eggKey(),JSON.stringify(clean)); }catch(e){}
  }
  return _eggs;
}
/* whether any find falls in the window on the board right now */
const eggFoundIn=w=>[...eggsFound()].some(t=>eggWindow(t)===w);
function eggBucks(){ return bkEggCount()*EGG_PRIZE; }
/* Whether this window's egg is still going begging. Says nothing about where
   it is — only that there is one, which is the part worth knowing. */
const eggClaimedNow=()=>eggFoundIn(eggWindow());
/* ── SAVING MERGES, IT DOES NOT REPLACE ──────────────────────────────────────
   This used to write the local set straight over the profile. Two sessions
   signed into the same account each hold their own copy, so the last one to
   save won and whatever the other had found went with it — which is how a find
   made in one tab disappeared because another was open on the same account.

   The server's list is read and folded in before the write, so a claim can only
   ever be added. Exact duplicates collapse; two finds inside one window do not,
   because eggClaim already refuses a window that has been claimed, and a record
   that survived a change of window length should not be thinned out by one. */
async function eggSave(){
  const local=[...eggsFound()];
  try{ localStorage.setItem(eggKey(),JSON.stringify(local)); }catch(e){}
  if(!_me) return;
  const merged=new Set(local);
  try{
    const res=await gflFetchProfile(_me.k1);
    let srv=[]; try{ srv=JSON.parse((res&&res.data&&res.data.eggs)||'[]')||[]; }catch(e){}
    srv.map(Number).map(eggTimeOf).filter(t=>t>0).forEach(t=>merged.add(t));
  }catch(e){}
  /* ONE EGG PER WINDOW, however many devices claim it. The union above can hold
     two stamps for the same window if a phone and a laptop both tapped before
     either had saved, and two stamps is twenty dollars for one egg. The earliest
     wins and the rest are dropped.

     Finds from before the hunt opened sit in negative windows and are left
     alone: they were recorded under other schemes, several can share a window
     under this one, and thinning them would be the old bug again. */
  const seenW=new Set(), keep=[];
  [...merged].sort((a,b)=>a-b).forEach(t=>{
    const w=eggWindow(t);
    if(w<0){ keep.push(t); return; }
    if(seenW.has(w)) return;
    seenW.add(w); keep.push(t);
  });
  const list=keep;
  if(list.length!==local.length){
    _eggs=new Set(list);
    try{ localStorage.setItem(eggKey(),JSON.stringify(list)); }catch(e){}
  }
  try{ await gflPatchProfile(_me.k1,{eggs:JSON.stringify(list)}); }catch(e){}
}
/* The list on the profile is the record; the device copy is only so the
   balance is right before the network answers. Merged rather than replaced,
   so a find made on a phone is not lost by opening a laptop. */
async function eggSync(){
  if(!_me) return;
  try{
    const res=await gflFetchProfile(_me.k1);
    let srv=[]; try{ srv=JSON.parse((res&&res.data&&res.data.eggs)||'[]')||[]; }catch(e){}
    const before=eggsFound().size;
    srv.map(Number).map(eggTimeOf).filter(t=>t>0).forEach(t=>eggsFound().add(t));
    if(eggsFound().size!==before){
      try{ localStorage.setItem(eggKey(),JSON.stringify([...eggsFound()])); }catch(e){}
      eggPaint();
      if(_activeTab==='profile') renderMyProfile();
      if(_activeTab==='book') renderBook();
    }
  }catch(e){}
}
/* 24x31 rather than the 14x17 it started at — enough cells for the silhouette
   to curve instead of step, and for the shell to carry a highlight, a shaded
   edge and banding. Generated from an egg curve and frozen here as plain
   markup: nothing computes it at runtime. */
/* Just an egg. It had bands and dots, which at 34px read as noise rather
   than pattern and made it look like a decorated prop instead of something
   hidden. Shell, a lit side, one specular highlight, and shadow where it
   turns away — nothing else. */
const EGG_SVG=`<svg viewBox="0 0 24 31" width="34" height="44" aria-hidden="true"><g shape-rendering="crispEdges"><rect x="10" y="0" width="4" height="1" fill="#f2e3c4"/><rect x="8" y="1" width="8" height="1" fill="#f2e3c4"/><rect x="14" y="1" width="2" height="1" fill="#dcc79d"/><rect x="7" y="2" width="10" height="1" fill="#f2e3c4"/><rect x="15" y="2" width="2" height="1" fill="#dcc79d"/><rect x="16" y="2" width="1" height="1" fill="#c4aa7a"/><rect x="6" y="3" width="12" height="1" fill="#f2e3c4"/><rect x="16" y="3" width="2" height="1" fill="#dcc79d"/><rect x="17" y="3" width="1" height="1" fill="#c4aa7a"/><rect x="6" y="4" width="12" height="1" fill="#f2e3c4"/><rect x="16" y="4" width="2" height="1" fill="#dcc79d"/><rect x="17" y="4" width="1" height="1" fill="#c4aa7a"/><rect x="5" y="5" width="14" height="1" fill="#f2e3c4"/><rect x="17" y="5" width="2" height="1" fill="#dcc79d"/><rect x="18" y="5" width="1" height="1" fill="#c4aa7a"/><rect x="4" y="6" width="16" height="1" fill="#f2e3c4"/><rect x="18" y="6" width="2" height="1" fill="#dcc79d"/><rect x="19" y="6" width="1" height="1" fill="#c4aa7a"/><rect x="4" y="7" width="16" height="1" fill="#f2e3c4"/><rect x="18" y="7" width="2" height="1" fill="#dcc79d"/><rect x="19" y="7" width="1" height="1" fill="#c4aa7a"/><rect x="3" y="8" width="18" height="1" fill="#f2e3c4"/><rect x="19" y="8" width="2" height="1" fill="#dcc79d"/><rect x="20" y="8" width="1" height="1" fill="#c4aa7a"/><rect x="3" y="9" width="18" height="1" fill="#f2e3c4"/><rect x="19" y="9" width="2" height="1" fill="#dcc79d"/><rect x="20" y="9" width="1" height="1" fill="#c4aa7a"/><rect x="2" y="10" width="20" height="1" fill="#f2e3c4"/><rect x="20" y="10" width="2" height="1" fill="#dcc79d"/><rect x="21" y="10" width="1" height="1" fill="#c4aa7a"/><rect x="2" y="11" width="20" height="1" fill="#f2e3c4"/><rect x="20" y="11" width="2" height="1" fill="#dcc79d"/><rect x="21" y="11" width="1" height="1" fill="#c4aa7a"/><rect x="1" y="12" width="22" height="1" fill="#f2e3c4"/><rect x="21" y="12" width="2" height="1" fill="#dcc79d"/><rect x="22" y="12" width="1" height="1" fill="#c4aa7a"/><rect x="1" y="13" width="22" height="1" fill="#f2e3c4"/><rect x="21" y="13" width="2" height="1" fill="#dcc79d"/><rect x="22" y="13" width="1" height="1" fill="#c4aa7a"/><rect x="1" y="14" width="22" height="1" fill="#f2e3c4"/><rect x="21" y="14" width="2" height="1" fill="#dcc79d"/><rect x="22" y="14" width="1" height="1" fill="#c4aa7a"/><rect x="0" y="15" width="24" height="1" fill="#f2e3c4"/><rect x="22" y="15" width="2" height="1" fill="#dcc79d"/><rect x="23" y="15" width="1" height="1" fill="#c4aa7a"/><rect x="0" y="16" width="24" height="1" fill="#f2e3c4"/><rect x="22" y="16" width="2" height="1" fill="#dcc79d"/><rect x="23" y="16" width="1" height="1" fill="#c4aa7a"/><rect x="0" y="17" width="24" height="1" fill="#f2e3c4"/><rect x="22" y="17" width="2" height="1" fill="#dcc79d"/><rect x="23" y="17" width="1" height="1" fill="#c4aa7a"/><rect x="0" y="18" width="24" height="1" fill="#f2e3c4"/><rect x="22" y="18" width="2" height="1" fill="#dcc79d"/><rect x="23" y="18" width="1" height="1" fill="#c4aa7a"/><rect x="0" y="19" width="24" height="1" fill="#f2e3c4"/><rect x="22" y="19" width="2" height="1" fill="#dcc79d"/><rect x="23" y="19" width="1" height="1" fill="#c4aa7a"/><rect x="0" y="20" width="24" height="1" fill="#f2e3c4"/><rect x="22" y="20" width="2" height="1" fill="#dcc79d"/><rect x="23" y="20" width="1" height="1" fill="#c4aa7a"/><rect x="0" y="21" width="24" height="1" fill="#f2e3c4"/><rect x="22" y="21" width="2" height="1" fill="#dcc79d"/><rect x="23" y="21" width="1" height="1" fill="#c4aa7a"/><rect x="0" y="22" width="24" height="1" fill="#f2e3c4"/><rect x="22" y="22" width="2" height="1" fill="#dcc79d"/><rect x="23" y="22" width="1" height="1" fill="#c4aa7a"/><rect x="1" y="23" width="22" height="1" fill="#f2e3c4"/><rect x="21" y="23" width="2" height="1" fill="#dcc79d"/><rect x="22" y="23" width="1" height="1" fill="#c4aa7a"/><rect x="1" y="24" width="22" height="1" fill="#f2e3c4"/><rect x="21" y="24" width="2" height="1" fill="#dcc79d"/><rect x="22" y="24" width="1" height="1" fill="#c4aa7a"/><rect x="1" y="25" width="22" height="1" fill="#f2e3c4"/><rect x="21" y="25" width="2" height="1" fill="#dcc79d"/><rect x="22" y="25" width="1" height="1" fill="#c4aa7a"/><rect x="2" y="26" width="20" height="1" fill="#f2e3c4"/><rect x="20" y="26" width="2" height="1" fill="#dcc79d"/><rect x="21" y="26" width="1" height="1" fill="#c4aa7a"/><rect x="3" y="27" width="18" height="1" fill="#f2e3c4"/><rect x="19" y="27" width="2" height="1" fill="#dcc79d"/><rect x="20" y="27" width="1" height="1" fill="#c4aa7a"/><rect x="4" y="28" width="16" height="1" fill="#f2e3c4"/><rect x="18" y="28" width="2" height="1" fill="#dcc79d"/><rect x="19" y="28" width="1" height="1" fill="#c4aa7a"/><rect x="4" y="28" width="16" height="1" fill="#dcc79d"/><rect x="17" y="28" width="3" height="1" fill="#c4aa7a"/><rect x="6" y="29" width="12" height="1" fill="#f2e3c4"/><rect x="16" y="29" width="2" height="1" fill="#dcc79d"/><rect x="17" y="29" width="1" height="1" fill="#c4aa7a"/><rect x="6" y="29" width="12" height="1" fill="#dcc79d"/><rect x="15" y="29" width="3" height="1" fill="#c4aa7a"/><rect x="8" y="30" width="8" height="1" fill="#f2e3c4"/><rect x="14" y="30" width="2" height="1" fill="#dcc79d"/><rect x="8" y="30" width="8" height="1" fill="#dcc79d"/><rect x="13" y="30" width="3" height="1" fill="#c4aa7a"/><rect x="8" y="30" width="8" height="1" fill="#c4aa7a"/><rect x="7" y="3" width="2" height="1" fill="#f9eed8"/><rect x="7" y="4" width="2" height="1" fill="#f9eed8"/><rect x="6" y="5" width="2" height="1" fill="#f9eed8"/><rect x="5" y="6" width="2" height="1" fill="#f9eed8"/><rect x="5" y="7" width="2" height="1" fill="#f9eed8"/><rect x="4" y="8" width="2" height="1" fill="#f9eed8"/><rect x="4" y="9" width="2" height="1" fill="#f9eed8"/><rect x="3" y="10" width="2" height="1" fill="#f9eed8"/><rect x="3" y="11" width="2" height="1" fill="#f9eed8"/><rect x="2" y="12" width="2" height="1" fill="#f9eed8"/><rect x="2" y="13" width="2" height="1" fill="#f9eed8"/><rect x="2" y="14" width="2" height="1" fill="#f9eed8"/><rect x="1" y="15" width="2" height="1" fill="#f9eed8"/><rect x="1" y="16" width="2" height="1" fill="#f9eed8"/><rect x="1" y="17" width="2" height="1" fill="#f9eed8"/><rect x="1" y="18" width="2" height="1" fill="#f9eed8"/><rect x="1" y="19" width="2" height="1" fill="#f9eed8"/><rect x="1" y="20" width="2" height="1" fill="#f9eed8"/><rect x="8" y="4" width="3" height="1" fill="#fffaf0"/><rect x="7" y="5" width="3" height="1" fill="#fffaf0"/><rect x="6" y="6" width="2" height="1" fill="#fffaf0"/><rect x="7" y="7" width="1" height="1" fill="#fffaf0"/></g></svg>`;
function eggEl(){ return document.getElementById('gfl-egg'); }
/* Painted into #app rather than the page, so it sits over whatever section
   happens to be at that fraction of the page and no tab has to know about it. */
function eggPaint(){
  const cur=eggEl();
  const spot=eggSpot();
  const app=document.getElementById('app');
  const wrong=!app||!eggLive()||_activeTab!==spot.tab||eggFoundIn(spot.w);
  if(wrong){ if(cur&&!cur.classList.contains('egg-pop')) cur.remove(); return; }
  if(cur&&Number(cur.dataset.w)===spot.w) return;   // already out, same window
  if(cur) cur.remove();
  const b=document.createElement('button');
  b.id='gfl-egg'; b.className='gfl-egg'; b.dataset.w=String(spot.w);
  b.type='button';
  b.setAttribute('aria-label','A hidden Easter egg — tap to claim it');
  b.style.left=(spot.x*100).toFixed(2)+'%';
  b.style.top=(spot.y*100).toFixed(2)+'%';
  b.innerHTML=EGG_SVG;
  b.onclick=eggClaim;
  app.appendChild(b);
}
async function eggClaim(){
  const el=eggEl(); if(!el||_eggBusy) return;
  const w=Number(el.dataset.w);
  if(eggFoundIn(w)) return;
  if(!_me){ openSignIn(); return; }
  _eggBusy=true;
  /* STAMPED INSIDE THE WINDOW BEING CLAIMED, not simply "now". Tap at 21:59:59
     and the write can land a heartbeat after the roll, which would record the
     find against the window that just opened — and the next egg would never be
     drawn, because that window would already read as claimed. Clamped, so the
     stamp always belongs to the egg that was actually on screen. */
  eggsFound().add(Math.min(Math.max(Date.now(),eggWindowAt(w)),eggWindowAt(w+1)-1));
  /* burst first, bookkeeping after: the tap should feel instant even when the
     write is slow, and the claim is already recorded locally by this point */
  el.classList.add('egg-pop');
  el.disabled=true;
  const prize=document.createElement('span');
  prize.className='egg-prize';
  prize.textContent='+'+bucksFmt(EGG_PRIZE);
  el.appendChild(prize);
  setTimeout(()=>{ el.remove(); },900);
  /* awaited so the balance repaints against what was actually written, and so
     a merge that pulled in another session's find is on screen too */
  await eggSave();
  _eggBusy=false;
  if(_activeTab==='book') renderBook();
  if(_activeTab==='profile') try{ renderMyProfile(); }catch(e){}
  try{ renderBetsBar(); }catch(e){}
}
/* Wakes at the window boundary rather than on an interval, so the egg moves at
   the same instant on every device instead of drifting by however long each
   one happened to have been open. */
function eggStart(){
  if(_eggTimer) clearTimeout(_eggTimer);
  eggPaint();
  if(_activeTab==='profile') try{ renderMyProfile(); }catch(e){}
  const next=eggNextAt()-Date.now();
  _eggTimer=setTimeout(eggStart,Math.max(1000,next+50));
}

const BUCKS_WEEKLY=100;
/* ── PAY DAY, AND THE COST OF SITTING OUT ────────────────────────────────────
   The league's money starts on one Tuesday, the same for everybody, rather than
   accruing from whenever each manager happened to place a first bet. Before it
   nobody has anything; on it the first $100 lands; one lands every Tuesday
   after. config.bucksStart is that date. */
function bucksEpoch(){
  const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(_CFG.bucksStart||'').trim());
  if(!m) return 0;                       // unset: fall back to the first-bet rule
  return new Date(+m[1],+m[2]-1,+m[3],6,0,0,0).getTime();
}
const BUCKS_IDLE_COST=()=>Math.max(0,Number(_CFG.bucksIdleCost??0));
const PLANT_REVIVAL_FEE=()=>Math.max(0,Number(_CFG.plantRevivalFee??0));
/* Which season's football the allowance is gated on: the one pay day falls in.
   The NFL year turns over in March, so a September date belongs to that year. */
function bucksEpochSeason(){
  const ep=bucksEpoch(); if(!ep) return bkLeagueSeason();
  const d=new Date(ep);
  return String(d.getMonth()>=2?d.getFullYear():d.getFullYear()-1);
}
const betBase=()=>`https://firestore.googleapis.com/v1/projects/${GFL_DB.project}/databases/(default)/documents/bets`;
let _bets=null,_betErr=null,_betBusy=false;

/* The Tuesday 6am boundary the league already runs on. msgWeekStart used to
   own this rule; both callers share it now so the board and the bucks week can
   never disagree about when a week turned over. */
/* TESTING: config.bucksTestMinutes shortens the bucks cycle so the whole reset
   can be watched in a few minutes instead of waiting a week. It applies to the
   testing profile alone — the league is on Tuesday 6am whatever it says. Set it
   to 0 or remove it to put that profile back on the real week too. Nothing else
   in the app knows the difference: every bucks helper reads the week through
   here, so who is signed in is asked once, in one place. */
const bucksTestMs=()=>{
  /* A scoped read is somebody else's ledger, and the short cycle is a switch on
     one account. Reading it through would put the whole league on test time the
     moment the test profile looked at the Leaderboards. */
  if(_bkScope) return 0;
  const m=Number(isTestProfile()?(_CFG.bucksTestMinutes??0):0);
  return m>0 ? m*60*1000 : 0;
};
/* The real Tuesday 6am, whatever the bucks cycle is set to. Kept separate from
   tueWeekStart because the bankroll chart is a week-by-week reading and has to
   stay one even while a half-hour test cycle runs behind it — otherwise that
   chart is a column of clock times while the portfolio chart beside it, which
   plots fantasy weeks, is the only one of the two saying anything about a week. */
function realWeekStart(now=new Date()){
  const x=new Date(now);
  x.setHours(6,0,0,0);
  let back=(x.getDay()-2+7)%7;                       // days since Tuesday
  if(x.getDay()===2 && now.getHours()<6) back=7;     // pre-dawn Tuesday is still last week
  x.setDate(x.getDate()-back);
  return x.getTime();
}
function realWeekKey(ts){
  const d=new Date(realWeekStart(new Date(ts)));
  const p=n=>String(n).padStart(2,'0');
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;
}
function tueWeekStart(now=new Date()){
  const t=bucksTestMs();
  if(t) return Math.floor(now.getTime()/t)*t;        // fixed-length buckets while testing
  return realWeekStart(now);
}
function bucksWeekKey(now=new Date()){
  const d=new Date(tueWeekStart(now));
  const p=n=>String(n).padStart(2,'0');
  const day=`${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;
  /* a date alone cannot separate buckets that all fall on the same day, so the
     testing cycle carries the time of day too */
  return bucksTestMs() ? `${day}T${p(d.getHours())}${p(d.getMinutes())}` : day;
}
/* A week key is 2026-08-21, or 2026-08-21T2130 while the short test cycle is
   on. Date parses the first and rejects the second, so anything that printed a
   week heading read "Invalid Date" the moment the test cycle was running.
   Parsed by hand rather than by Date so both forms land in local time. */
function bucksWeekParts(wk){
  const m=/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2})(\d{2}))?$/.exec(String(wk||''));
  if(!m) return null;
  return {d:new Date(+m[1],+m[2]-1,+m[3],+(m[4]||0),+(m[5]||0)), timed:m[4]!=null};
}
function bucksWeekDate(wk){ const p=bucksWeekParts(wk); return p?p.d:null; }
/* On the real week a date is the whole story; on a short test cycle every
   bucket falls on the same day, so the clock is what tells them apart.

   Which form to print is read off the key itself rather than off the current
   test flag — bets keep the key they were made under, so a ledger can hold
   both kinds at once and turning the flag on must not relabel every older
   week as midnight. */
function bucksWeekLabel(wk){
  const p=bucksWeekParts(wk);
  if(!p) return String(wk||'');
  /* A clock time only identifies a cycle while it is still today's. Test
     cycles are half an hour long, so a few days of betting turns the ledger
     into a column of times with no way to tell Tuesday's 2:15 from Thursday's.
     Past a day old the date is the thing that says which one it was. */
  const old=Date.now()-p.d.getTime()>=86400000;
  return p.timed&&!old
    ? p.d.toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'})
    : p.d.toLocaleDateString(undefined,{month:'short',day:'numeric'});
}
function bucksWeekEnd(now=new Date()){ return tueWeekStart(now)+(bucksTestMs()||7*24*3600*1000); }
function bucksResetsIn(now=new Date()){
  const ms=Math.max(0,bucksWeekEnd(now)-now.getTime());
  if(bucksTestMs()){
    const m=Math.floor(ms/60000), s=Math.floor(ms%60000/1000);
    return m>0?`${m}m ${s}s`:`${s}s`;
  }
  const d=Math.floor(ms/86400000), h=Math.floor(ms%86400000/3600000);
  return d>0?`${d}d ${h}h`:`${h}h`;
}
/* Bets from before the reset line are ignored rather than deleted — the rules
   withhold delete so a losing bet cannot be made to vanish. */
const betsAfterReset=b=>Number(b.ts||0)>=Number(_CFG.betsResetBefore||0);
const betsMine=()=>(_bets||[]).filter(b=>_me&&b.owner===_me.k1&&betsAfterReset(b));
const betsThisWeek=()=>betsMine().filter(b=>b.wk===bucksWeekKey());
/* An invitation is an offer, not a wager: nothing is staked until it is taken
   up, and a declined one never was. Both stay out of every money figure. */
const betIsLive=b=>b.status!=='invite'&&b.status!=='declined';
const betsLiveThisWeek=()=>betsThisWeek().filter(betIsLive);
/* ── THE BANK ────────────────────────────────────────────────────────────────
   GFL Bucks used to be wiped and reissued every cycle, so a good week bought
   nothing and a bad one cost nothing past Tuesday. They compound now: the
   allowance still lands every cycle, and it stacks on whatever is already
   there, so winnings are worth keeping and a loss follows you.

   Nothing is stored. The balance is still derived by replaying the ledger —
   every allowance earned, minus everything staked, plus everything returned —
   which is what keeps two devices from ever disagreeing about it and what
   makes a cleared bet still cost what it cost.

   Allowances accrue from the cycle of a manager's first bet, not from a fixed
   league epoch. That way someone who has never bet holds exactly one
   allowance rather than a season's worth of back pay, and someone who has been
   playing since week one is credited for every cycle they were in. */
function bucksCycles(now=Date.now()){
  const len=bucksTestMs()||7*24*3600*1000;
  const to=tueWeekStart(new Date(now));
  let from=to;
  bkBets().forEach(b=>{
    const t=tueWeekStart(new Date(Number(b.ts)||now));
    if(t<from) from=t;
  });
  /* rounded, not floored: a real week is 7 days by wall clock, so the two
     Tuesdays either side of a daylight-saving change are an hour apart */
  const n=Math.round((to-from)/len)+1;
  /* The short test cycle is not a season and has no football behind it, so it
     keeps counting buckets — that is the whole point of the switch. */
  if(bucksTestMs()) return Math.max(1,n);
  /* ONE PAY DAY FOR THE WHOLE LEAGUE.

     Allowances used to accrue from each manager's first bet, which meant twelve
     different pay days and a balance that depended on when somebody happened to
     start. They now count from config.bucksStart: nothing before it, the first
     $100 on it, one more every Tuesday after.

     Counting Tuesdays rather than weeks of football is deliberate now that a
     week with nothing risked costs money — the cadence has to be the calendar,
     or an idle pre-season week would take $20 off a balance no allowance had
     arrived in. */
  const ep=bucksEpoch();
  if(ep){
    if(to<ep) return 0;                  // before pay day nobody has anything
    /* PAY DAY, THEN ONE FOR EVERY WEEK ACTUALLY PLAYED.

       Counting Tuesdays alone paid out through a pre-season: the first $100 on
       1 September and another on the 8th, before a snap. It is the football that
       earns an allowance now — pay day hands over the first one, and every
       completed fantasy week adds another.

       Gated on the epoch's OWN season rather than on whatever season it is
       today. bkLeagueSeason rolls over in March, and reading it here would drop
       every manager back to a single allowance the moment it did. 2026's
       schedule stays in _seasonMeta, so this keeps answering 17 all winter. */
    return 1+bucksWeeksPlayed(bucksEpochSeason());
  }
  /* No start date configured: the old rule, capped so a Tuesday with no
     football behind it cannot pay out. */
  return Math.max(1,Math.min(1+bucksWeeksPlayed(),n));
}
/* ── A WEEK WITH NOTHING RISKED ──────────────────────────────────────────────
   Every completed Tuesday-to-Tuesday week since pay day in which this manager
   neither placed a bet nor traded a share costs bucksIdleCost, once. The week
   in progress is never counted — there is still time to do something about it.

   Walked with setDate rather than by adding seven days of milliseconds, so the
   two Tuesdays either side of a daylight-saving change are still one week
   apart. An invitation nobody accepted is not an action: betsLiveAll already
   drops the ones still sitting at 'invite' and the ones declined. */
function bucksIdleWeeks(now=Date.now()){
  const ep=bucksEpoch();
  if(!ep||!BUCKS_IDLE_COST()||bucksTestMs()) return 0;
  const cur=tueWeekStart(new Date(now));
  const acted=new Set();
  try{ betsLiveAll().forEach(b=>{
    const t=Number(b.ts)||0; if(t) acted.add(realWeekStart(new Date(t)));
  }); }catch(e){}
  /* a lot stamps its trade time as .t */
  try{ bkLots().forEach(l=>{
    const t=Number(l.t)||0; if(t) acted.add(realWeekStart(new Date(t)));
  }); }catch(e){}
  let n=0;
  const d=new Date(ep);
  for(let i=0;i<400&&d.getTime()<cur;i++){
    if(!acted.has(realWeekStart(new Date(d)))) n++;
    d.setDate(d.getDate()+7);
  }
  return n;
}
function bucksIdleCost(){ return bucks2(bucksIdleWeeks(bkNow())*BUCKS_IDLE_COST()); }
/* ── THE PLANT REVIVAL FEE ───────────────────────────────────────────────────
   A plant that is left to die comes back on its own two days later, and the
   league bills the owner plantRevivalFee for it. Every revival is charged, so
   a manager who ignores the locker room for a month pays four times — the
   whole point is that it keeps costing until somebody waters the thing.

   Derived, not stored, like every other number the bank uses: the count comes
   straight out of plantStageOf, so there is no ledger to write, nothing to
   replay and no way for the charge to be applied twice. Water the plant and
   the timestamp moves forward, which is what stops the meter — it does not
   refund what has already been taken, because it already happened.

   THE FAST CYCLE IS NOT CHARGED. plantTestMinutes exists to watch the picture
   change, and at fifteen seconds a stage a plant revives every 105 seconds:
   that is $685 an hour against a $100 weekly allowance, so a testing profile
   would sit pinned at zero and the sportsbook would be unusable. Only a plant
   running on the real clock costs anything. To test the fee itself, set
   plantTestMinutes to 0. */
function plantRevivals(){
  const pl=bkPlant();
  if(!pl||!pl.t) return 0;                       // never watered, never billed
  if(plantMsFor(pl.id)!==PLANT_STEP_MS) return 0;
  return plantStageOf(pl.t,pl.id).revivals;
}
/* ── WHAT THE BANK HELD WHEN A REVIVAL HAPPENED ──────────────────────────────
   The balance as of an instant, with the plant charge left out — the money
   there was to pay that revival with.

   It is the SAME bucksBalance, pointed backwards, not a second copy of it. The
   two levers are _bkAsOf, which moves the calendar terms, and a scope holding
   only what had actually happened by then: bets placed, eggs found, shares
   bought. _bkNoPlant suppresses the plant term, which is also what stops this
   from recursing — plantFee is what called it.

   A BET SETTLES LATER THAN IT IS PLACED, and the two are different moments. A
   bet placed in week 2 and graded in week 3 had its stake out of the balance in
   week 2 and its winnings in the balance only from week 3, so replaying it as
   already-won would hand a manager money they did not yet hold and let the
   plant take it. Anything settled after the instant — or carrying no settledTs
   at all, which is the same doubt — is put back to open for the replay. */
function bucksBaseAt(t){
  const bets=bkBets().filter(b=>(Number(b.ts)||0)<=t).map(b=>{
    if(b.status==='open'||!betIsLive(b)) return b;
    const st=Number(b.settledTs)||0;
    return (!st||st>t)?{...b,status:'open',ret:0}:b;
  });
  const et=bkEggTimes();
  const times=et?et.filter(x=>Number(x)<=t):[];
  const lots=bkLots().filter(l=>(Number(l.t)||0)<=t);
  const prevAsOf=_bkAsOf, prevNoPlant=_bkNoPlant;
  try{
    _bkAsOf=t; _bkNoPlant=true;
    return bucksFor({bets,eggs:times.length,eggTimes:times,lots,plant:{t:0,id:null}},
      ()=>bucksBalance());
  } catch(e){ return 0; }
  finally{ _bkAsOf=prevAsOf; _bkNoPlant=prevNoPlant; }
}
/* ── A REVIVAL IS SETTLED WHEN IT HAPPENS, AND NEVER RE-BILLED ───────────────
   Walk the revivals in order and charge each one against what the bank held at
   that moment, less whatever the earlier ones already took. A revival that
   landed on an empty account costs nothing and is DONE — it does not sit as a
   debt waiting for the next allowance.

   That is the whole difference from multiplying the count by the fee. Under
   that arithmetic a manager at zero still accrued $20 a week invisibly, and a
   two-month absence ate the next two allowances the moment they came back.
   Here the meter only runs on money that was actually there.

   A revival is not skipped just because an earlier one went unpaid: somebody
   broke in week 1 who wins a bet in week 3 pays for week 3's revival in full.
   min() of nothing is nothing, so the empty weeks fall out on their own and the
   loop carries on.

   THE LOOP IS CAPPED. n comes from a timestamp in localStorage, which is to say
   from anything at all — a stray `1` in there is fifty-eight thousand years of
   revivals and a page that never paints again.

   The cap keeps the OLDEST revivals and drops the newest, which is the useful
   way round for exactly the case it exists for: a nonsense timestamp puts every
   one of those 520 somewhere before the league had a pay day, they all charge
   nothing, and a corrupt clock therefore costs a manager nothing rather than
   everything. 520 is ten years of weeks against a dashboard built in 2026, so
   no real plant can reach it. */
const PLANT_REPLAY_MAX=520;                       // ten years of weeks, and then some
/* The walk keeps the LAST charge as well as the running total. They answer two
   different questions and both get asked: the balance wants everything this
   plant has ever cost, the notification wants what the revival that just
   happened cost. Working the second one out by dividing the first by the fee
   only holds while every revival charged the same, which is exactly what a
   part-paid one does not do. */
function plantWalk(){
  const none={paid:0,last:0,n:0};
  const pl=bkPlant();
  if(!pl||!pl.t) return none;
  const step=plantMsFor(pl.id);
  if(step!==PLANT_STEP_MS) return none;           // the fast cycle is never billed
  const fee=PLANT_REVIVAL_FEE(); if(!fee) return none;
  const n=Math.min(PLANT_REPLAY_MAX,plantStageOf(pl.t,pl.id).revivals);
  if(n<1) return none;
  const cycle=PLANT_CYCLE_STEPS*step;
  let paid=0, last=0;
  for(let i=1;i<=n;i++){
    const had=bucksBaseAt(pl.t+i*cycle)-paid;     // what was left when it came back
    last=had>0?bucks2(Math.min(fee,had)):0;
    paid=bucks2(paid+last);
  }
  return {paid,last,n};
}
function plantRevivalCharges(){ return plantWalk().paid; }
/* One replay per render, not one per read. bucksBalance is called from the nav
   chip, the bet slip, the quick-stake buttons and twelve leaderboard rows, and
   each call would otherwise walk every revival this manager has ever had.

   Keyed on the values the answer is made of rather than on a stamp that is
   meant to stand for them. A cache keyed on a proxy for the data is how the
   Sportsbook once priced a team against a roster it had not read yet — the key
   changed when the fetch finished, not when the answer did. These are the
   actual inputs: whose plant, when it was watered, and a digest of every bet,
   egg and share trade that could move the balance underneath it.

   AND THE BALANCE ITSELF, which the digest does not cover. The first cut keyed
   on the raw inputs alone and served a stale $0 to a manager whose allowance
   had changed underneath it — the bets, eggs and shares were all identical, so
   the key was too, and the money was not. The allowance and the idle charge are
   worked out from the calendar and from how much football has been scored, and
   neither of those is a bet. One reading of the balance summarises the lot. */
let _plantFeeCache=null;
function plantFeeKey(){
  const pl=bkPlant();
  let d=0, bets=bkBets();
  for(let i=0;i<bets.length;i++){
    const b=bets[i];
    d=(d+(Number(b.ts)||0)+(Number(b.settledTs)||0)+(Number(b.ret)||0)*7
        +(Number(b.stake)||0)*13+String(b.status||'').length)%9007199254740991;
  }
  const et=bkEggTimes()||[], lots=bkLots();
  let e=0; for(let i=0;i<et.length;i++) e+=Number(et[i])||0;
  let l=0; for(let i=0;i<lots.length;i++) l+=(Number(lots[i].t)||0);
  let base=0; try{ base=bucksBaseAt(Date.now()); }catch(err){}
  return [pl&&pl.id,pl&&pl.t,PLANT_REVIVAL_FEE(),bets.length,d,et.length,e,lots.length,l,
    base,Math.floor(Date.now()/60000)].join('|');
}
function plantFee(){
  if(_bkNoPlant) return 0;
  let key=null;
  try{ key=plantFeeKey(); }catch(e){ return 0; }
  if(_plantFeeCache&&_plantFeeCache.key===key) return _plantFeeCache.v;
  const v=bucks2(plantRevivalCharges());
  _plantFeeCache={key,v};
  return v;
}
let _bkNoPlant=false;
/* ── THE CHARGE FOR ONE NAMED PLANT ──────────────────────────────────────────
   plantFee reads whichever plant is in scope, and unscoped that means the one
   in localStorage. The notification is describing a plant off the PROFILE, and
   the two are not guaranteed to be the same timestamp: plantSync only copies
   the server's value down when it is newer, so a device that has not synced yet
   holds nothing while the profile says the plant died three times.

   Quoting one and counting the other is how a card ends up saying a plant was
   revived three times for $0.00. This points the fee at the timestamp the card
   is actually talking about, and leaves every other source — the bets, the
   eggs, the shares — exactly as it was, because those are the money it is
   being charged against. */
function plantForScope(pt,pid,fn){
  const prev=_bkScope;
  /* the reads happen before the assignment, so these are the real ledger */
  _bkScope={bets:bkBets(),eggs:bkEggCount(),eggTimes:bkEggTimes(),lots:bkLots(),
            plant:{t:Number(pt)||0,id:pid}};
  try{ return fn(); } catch(e){ return 0; } finally{ _bkScope=prev; }
}
/* everything a named plant has ever cost */
function plantFeeFor(pt,pid){ return plantForScope(pt,pid,()=>plantFee()); }
/* and what its most recent revival cost on its own — what the card reports */
function plantLastCharge(pt,pid){ return plantForScope(pt,pid,()=>plantWalk().last); }
function bucksAllowance(){ return bucks2(BUCKS_WEEKLY*bucksCycles(bkNow())); }
/* HOW MANY FANTASY WEEKS HAVE ACTUALLY BEEN PLAYED.

   Counted from week 1 and only while every fixture in a week is final, so a
   week ESPN has not finished scoring does not advance the count, and a hole in
   the middle stalls it rather than skipping past it. Erring low is deliberate:
   this gates money, and paying an allowance late is a complaint while paying it
   twice is a hole in the economy. */
function bucksWeeksPlayed(season){
  const meta=_seasonMeta[String(season||bkLeagueSeason())];
  if(!meta) return 0;
  const byWeek={};
  (meta.schedule||[]).forEach(m=>{
    if(!m.home||!m.away) return;
    const w=Number(m.matchupPeriodId)||0; if(!w) return;
    (byWeek[w]||(byWeek[w]=[])).push(m);
  });
  const done=m=>((m.home.totalPoints||0)>0||(m.away.totalPoints||0)>0);
  let n=0;
  for(let w=1;byWeek[w];w++){
    if(!byWeek[w].every(done)) break;
    n=w;
  }
  return n;
}
/* every live bet ever, not just this cycle's — that is the whole change */
/* ── ONE BALANCE, FOR ANYBODY ────────────────────────────────────────────────
   Every function below reads this manager's own ledger through _me. The
   Leaderboards need the same arithmetic run against somebody else's, and used to
   get it by keeping a second copy of it — which promptly fell behind: the copy
   never learned about the league pay day, the football gate on the allowance, or
   the $20 an idle week costs, so the board and the manager's own chip showed
   different money for the same person.

   Setting a scope points the family at another ledger instead. One
   implementation, and the board cannot disagree with the chip. */
let _bkScope=null;
const bkBets=()=>_bkScope?_bkScope.bets:betsMine();
const bkEggCount=()=>_bkScope?_bkScope.eggs:eggsFound().size;
const bkLots=()=>_bkScope?_bkScope.lots:invLots();
/* ── ASKING THE BANK ABOUT A MOMENT THAT HAS PASSED ──────────────────────────
   Everything below reads "now" through bkNow rather than Date.now, so the whole
   family can be pointed at a past instant and answer as of then. It is set by
   bucksBaseAt and by nothing else.

   Only the two terms that are functions of the calendar need it — the allowance
   counts Tuesdays and the idle charge counts weeks. The rest are functions of
   what a manager has DONE, and those arrive already filtered to the moment,
   because a bet, an egg and a share trade all carry the time they happened. */
let _bkAsOf=0;                         // 0 means now, which is the normal case
const bkNow=()=>_bkAsOf||Date.now();
/* When each egg was found, as opposed to how many there are. Needed only for
   the replay: an egg found in November was not in the bank in September.

   Null means a caller did not supply them, and the replay then counts NO egg
   money at that instant rather than all of it. That is the safe direction —
   under-stating an old balance under-states what could be taken out of it, and
   this file already holds the line that paying an allowance late is a complaint
   while paying it twice is a hole in the economy. Both real callers supply the
   times, so the fallback is a guard rather than a behaviour. */
const bkEggTimes=()=>_bkScope?(_bkScope.eggTimes||null):[...eggsFound()];
/* The plant rides in the scope for the same reason the bets and the lots do:
   the Leaderboards work out eleven other balances with this family of
   functions, and a charge they cannot see is a board that disagrees with the
   chip. {t, id} — when it was last watered, and whose it is, because the
   second is what sets the speed of the first. */
function bkPlant(){
  if(_bkScope) return _bkScope.plant||{t:0,id:null};
  let t=0; try{ t=Number(localStorage.getItem(plantKey())||0); }catch(e){}
  return {t,id:_me&&_me.k1};
}
function bucksFor(scope,fn){
  const prev=_bkScope;
  _bkScope={bets:(scope&&scope.bets)||[],eggs:Number(scope&&scope.eggs)||0,
            eggTimes:(scope&&scope.eggTimes)||null,
            lots:(scope&&scope.lots)||[],plant:(scope&&scope.plant)||{t:0,id:null}};
  try{ return fn(); } finally{ _bkScope=prev; }
}
const betsLiveAll=()=>bkBets().filter(betIsLive);
function bucksStaked(){ return bucks2(betsLiveAll().reduce((a,b)=>a+b.stake,0)); }
function bucksReturned(){ return bucks2(betsLiveAll().reduce((a,b)=>a+(b.status==='open'?0:b.ret),0)); }
function bucksBalance(){
  /* shares are bought with the same money as bets, so what is tied up in them
     has to leave the balance — and come back when they are sold */
  let inv=0; try{ inv=invNetSpent(); }catch(e){}
  let idle=0; try{ idle=bucksIdleCost(); }catch(e){}
  let plant=0; try{ plant=plantFee(); }catch(e){}
  return bucks2(Math.max(0,bucksAllowance()-bucksStaked()+bucksReturned()+eggBucks()-inv-idle-plant));
}
/* Always shown as money, and the currency is always "GFL Bucks" in full. */
/* GFL Bucks read like money, to the cent. They were rounded to the whole buck,
   which is fine for an allowance that arrives in hundreds and wrong everywhere
   it is actually spent: a −115 leg on a $25 stake returns $46.74, and a book
   that calls that $47 is a book that cannot add up. The share market already
   prices to the cent (invFmt), so this brings the balance, the stakes and the
   payouts into line with it.

   The twelve-row Leaderboard keeps its own compact format (ldMoney) on purpose
   — two more digits a row there and the table outgrows a phone. */
/* ── MONEY IS A NUMBER OF CENTS, NOT A FLOAT THAT GETS FORMATTED LATE ────────
   bucksCents and bucksFmt round for DISPLAY, which is not the same thing as the
   value being round. A balance is a sum of an allowance, stakes out, returns
   in, eggs, share lots and idle costs; float arithmetic across all of that
   leaves dust, and share lots carry real sub-cent prices. So the underlying
   number was routinely something like 84.83999999999997 while every label on
   the site said $84.84.

   That is invisible until something uses the raw number. The stake box carries
   max="<balance>", and when the browser clamps a typed number to that max it
   clamps to the RAW one — so overtyping your balance filled the field with
   84.83999999999997.

   bucks2 is the one place money becomes money: every figure that is stored,
   compared or clamped goes through it, so the stored value and the printed
   value are the same value. */
const bucks2=v=>Math.round(((Number(v)||0)+Number.EPSILON)*100)/100;
const bucksCents=v=>bucks2(v)
  .toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});
const bucksFmt=v=>'$'+bucksCents(v);

/* ── READING ONLY THE BETS THAT ARE WANTED ───────────────────────────────────
   This used to list the whole collection on every visit to the sportsbook and
   filter to one manager in the browser, so everybody paid a document read for
   everybody else's bets. At 38 documents that is nothing. At three bets a week
   across twelve managers it is 500 by the end of a season, and twelve people
   checking the book three times a day is 18,000 reads against a free tier of
   50,000 — a third of the day's allowance, from one screen. It also capped at
   pageSize 300, so past that the list would have quietly truncated.

   Queried by owner now. Two queries rather than one, because an invitation is
   a document owned by the person invited: the seat count on a parlay and the
   guard against asking the same person twice both need those, and neither can
   be got from a query on my own name. The second asks only about invitations
   attached to bets that are still open to invite on, which is a handful. */
const betDocRow=d=>{
  const f=fsIn(d);
  let legs=[]; try{ legs=JSON.parse(f.legs||'[]')||[]; }catch(e){}
  return {id:(d.name||'').split('/').pop(),owner:f.owner||'',team:f.team||'',
    season:f.season||'',wk:f.wk||'',ts:Number(f.ts)||0,
    stake:Number(f.stake)||0,odds:Number(f.odds)||0,payout:Number(f.payout)||0,
    legs,status:f.status||'open',settledTs:Number(f.settledTs)||0,ret:Number(f.ret)||0,
    invitedBy:f.invitedBy||'', srcBet:f.srcBet||'',
    hidden:String(f.hidden||'')==='1'};
};
const fsRunQueryUrl=()=>`https://firestore.googleapis.com/v1/projects/${GFL_DB.project}`
  +`/databases/(default)/documents:runQuery?${msgKey()}`;
/* One structured query against the bets collection. Single-field filters only,
   which Firestore indexes automatically — no composite index to deploy. */
async function betQuery(where,ordered){
  const r=fsNoteResponse(await fetch(fsRunQueryUrl(),{method:'POST',cache:'no-store',
    headers:{'Content-Type':'application/json'},
    /* Ordered only where there is an index for it. Every filter+order pair is
       its own composite index in Firestore, so owner+ts being deployed does
       nothing for the srcBet query — asking for the order there fails the whole
       request. The owner query is the one that can reach the limit, and it is
       the one that gets the ordering; the invite query returns a handful of
       rows and is sorted with everything else in the browser. */
    body:JSON.stringify({structuredQuery:Object.assign(
      {from:[{collectionId:'bets'}],where,limit:300},
      ordered?{orderBy:[{field:{fieldPath:'ts'},direction:'DESCENDING'}]}:{})})}));
  if(r.status===403){ _betErr='rules'; return null; }
  if(r.status===429){ _betErr='quota'; return null; }
  if(!r.ok){ _betErr='fetch'; return null; }
  const j=await r.json();
  /* runQuery answers with an array, and a run that matched nothing still sends
     one entry carrying only a readTime */
  return (Array.isArray(j)?j:[]).filter(x=>x&&x.document).map(x=>betDocRow(x.document));
}
const fsEq=(field,value)=>({fieldFilter:{field:{fieldPath:field},op:'EQUAL',value:{stringValue:String(value)}}});
async function betList(){
  if(!_me) return [];
  try{
    const mine=await betQuery(fsEq('owner',_me.k1),true);   // owner+ts is indexed
    if(!mine) return null;
    /* invitations sitting on my own bets, so the seat count is right. Capped at
       thirty because that is Firestore's ceiling on an IN filter, and nothing
       close to it is ever open at once. */
    const open=mine.filter(b=>b.status==='open'&&!b.srcBet).map(b=>b.id).slice(0,30);
    let seats=[];
    if(open.length){
      const inv=await betQuery({fieldFilter:{field:{fieldPath:'srcBet'},op:'IN',
        value:{arrayValue:{values:open.map(v=>({stringValue:v}))}}}});
      if(inv) seats=inv;
    }
    _betErr=null;
    const seen=new Set(mine.map(b=>b.id));
    return mine.concat(seats.filter(b=>!seen.has(b.id))).sort((a,b)=>b.ts-a.ts);
  }catch(e){ _betErr='offline'; return null; }
}
async function betRefresh(){
  betsAllDrop();                    // my own bet must not be missing from the board
  const l=await betList(); if(l) _bets=l;
}

/* ── EVERY MANAGER'S BETS, FOR THE BOARDS ────────────────────────────────────
   The sportsbook reads one owner's bets, which is right: it is your ledger and
   nobody else's, and asking for the whole collection to draw one page of it was
   the thing that would have run the read quota down.

   A leaderboard genuinely needs all of them, so this is the one call that asks
   — filtered to the current season, so it stays bounded as seasons pile up, and
   fetched once per session rather than per render. A single equality filter
   needs no composite index, which is what keeps it from breaking the way an
   ordered query would. */
/* ── THE SEASON'S BETS SURVIVE A NAVIGATION ──────────────────────────────────
   This is the largest single read the app makes: every ticket in the season, in
   one query. It was held in a variable, which a page load throws away, so every
   reload and every return to the site paid for the whole collection again — 54
   documents today and capped at 300, against a daily allowance of 50,000.

   sessionStorage rather than localStorage: it is a snapshot of twelve people's
   money and it has no business outliving the tab. Keyed by season so January
   cannot serve December's board.

   TWO MINUTES, because the staleness this buys is somebody ELSE's bet not
   showing up yet. Anything written from this tab drops the cache outright —
   betRefresh is the single funnel every placement, acceptance and cash-out goes
   through — so your own money is never the thing that looks wrong. */
const BETS_ALL_TTL=120000;
const betsAllKey=()=>`gfl:betsAll:${sbSeason()}`;
function betsAllCached(){
  try{
    const raw=sessionStorage.getItem(betsAllKey()); if(!raw) return null;
    const j=JSON.parse(raw);
    if(!j||!Array.isArray(j.rows)) return null;
    if(Date.now()-(Number(j.t)||0)>BETS_ALL_TTL) return null;
    return j.rows;
  }catch(e){ return null; }
}
function betsAllStore(rows){
  try{ sessionStorage.setItem(betsAllKey(),JSON.stringify({t:Date.now(),rows})); }
  catch(e){}                                  // quota or private mode: just do not cache
}
/* Anything that writes a bet calls this. Clearing the variable alone would leave
   the stored copy to be served on the next navigation, which is the same bug
   from one step further away. */
function betsAllDrop(){
  _betsAll=null;
  try{ sessionStorage.removeItem(betsAllKey()); }catch(e){}
}
/* when the stored copy was taken, so a board can say how old it is rather than
   leaving somebody to guess whether they are looking at live money */
function betsAllAt(){
  try{
    const j=JSON.parse(sessionStorage.getItem(betsAllKey())||'null');
    return (j&&Number(j.t))||0;
  }catch(e){ return 0; }
}
let _betsAll=null,_betsAllBusy=false;
async function betLeague(){
  if(_betsAll) return _betsAll;
  const cached=betsAllCached();
  if(cached){ _betsAll=cached; return _betsAll; }
  if(_betsAllBusy) return null;
  _betsAllBusy=true;
  try{
    const rows=await betQuery(fsEq('season',String(sbSeason())));
    _betsAll=rows||[];
    if(rows) betsAllStore(rows);
  }catch(e){ _betsAll=[]; }
  _betsAllBusy=false;
  return _betsAll;
}

async function sbPlaceBet(){
  if(!_me){ openSignIn(); return; }
  if(!_slip.length||_betBusy) return;
  const stake=Math.round(Math.max(0,Number(_sbStake)||0));
  if(stake<=0){ _betErr='stake'; sbRenderSlip(); return; }
  if(stake>bucksBalance()){ _betErr='funds'; sbRenderSlip(); return; }
  /* A slip built before kickoff can still be sitting on screen once the games
     are running — the buttons go dead, the slip does not. Without this a ticket
     could be struck on a week whose football had already started. */
  if(_slip.some(x=>{const w=betLegWeek(x.mk); return w!=null&&sbWeekLocked(w,x.mk);})){
    _betErr='locked'; _betBusy=false; sbRenderSlip(); return;
  }
  _betBusy=true; _betErr=null; sbRenderSlip();
  const dec=_slip.reduce((a,s)=>a*amToDec(s.odds),1);
  const odds=_slip.length>1?amFromProb(1/dec):_slip[0].odds;
  const id=`${Date.now()}-${_me.k1}`.replace(/[^a-zA-Z0-9-]/g,'').slice(0,80);
  const body=fsOut({
    owner:_me.k1, team:String(_me.teamId||''), season:String(sbSeason()),
    wk:bucksWeekKey(), ts:String(Date.now()),
    /* payout was Math.round(stake*dec) — whole bucks, on a book that quotes and
       pays to the cent. A -115 leg on $25 returns $46.74, and storing that as
       $47 hands out 26 cents that were never won. */
    stake:String(bucks2(stake)), odds:String(odds), payout:String(bucks2(stake*dec)),
    legs:JSON.stringify(_slip.map(s=>({mk:s.mk,mkLabel:s.mkLabel,pick:s.pick,pickLabel:s.pickLabel,odds:s.odds}))),
    status:'open', settledTs:'0', ret:'0',
  });
  try{
    const r=await fetch(`${betBase()}?documentId=${encodeURIComponent(id)}&${msgKey()}`,
      {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    fsNoteResponse(r);
    if(r.ok){ _slip=[]; _sbStake=10; await betRefresh(); sbSyncButtons(); renderMyBets(); }
    else _betErr=r.status===403?'rules':r.status===429?'quota':'send';
  }catch(e){ _betErr='offline'; }
  _betBusy=false; sbRenderSlip();
}



/* ── the eight kinds of question ──────────────────────────────────────────────
   Each takes a seeded generator and returns {q, a[4], correct, note} or null if
   the data it needs is not there. None of them writes anything down: the same
   seed rebuilds the same question. */

/* 1 — a manager, described by three of their own numbers */
function bkqManager(r){
  if(!_franchises||_franchises.length<4) return null;
  const rows=_franchises.map(f=>{ let at=null; try{ at=franchiseAllTime(f.owner); }catch(e){}
    return at?{f,at}:null; }).filter(Boolean);
  if(rows.length<4) return null;
  const pick=bkPick(r,rows);
  const at=pick.at;
  const g=at.w+at.l+at.t;
  /* Six facts meant the same three kept coming round. Everything
     franchiseAllTime already works out is on the sheet now — finishes, streaks,
     the biggest and smallest weeks, the blowout counts — and three are drawn
     from it, so two managers with the same record are still told apart by what
     else is picked. Anything a franchise has no answer for drops out rather
     than printing a dash. */
  /* Each stat named in full and given its own line. Run together on one line
     they had to be terse enough to fit — "5th at best" — and terse enough to
     fit turned out to be too terse to read: it is not obvious whether that is a
     finish, a rank or a week. Three rows of label-and-value have the room to
     say which. */
  const facts=[
    {k:'All-time record', v:`${at.w}–${at.l}${at.t?'–'+at.t:''}`},
    {k:'All-time points scored', v:at.pf.toFixed(1)},
    {k:'All-time points against', v:at.pa?at.pa.toFixed(1):null},
    {k:'Seasons played', v:String(at.seasons)},
    {k:'Championships won', v:String(at.rings)},
    {k:'Career win rate', v:g?(at.w/g*100).toFixed(1)+'%':null},
    {k:'Playoff appearances', v:String(at.playoffApps||0)},
    {k:'Playoff games won', v:String(at.playoffWins||0)},
    {k:'Best season finish', v:at.best?ordinal(at.best):null},
    {k:'Worst season finish', v:at.worst?ordinal(at.worst):null},
    {k:'Average season finish', v:at.avgFinish?at.avgFinish.toFixed(1):null},
    {k:'Top-three finishes', v:String(at.top3||0)},
    {k:'Longest winning streak', v:at.winStreak?`${at.winStreak} games`:null},
    {k:'Longest losing streak', v:at.loseStreak?`${at.loseStreak} games`:null},
    {k:'Highest score in a week', v:at.hi?at.hi.pts.toFixed(1):null},
    {k:'Lowest score in a week', v:at.lo?at.lo.pts.toFixed(1):null},
    {k:'Weeks scoring 150 or more', v:String(at.over150||0)},
    {k:'Weeks scoring under 80', v:String(at.under80||0)},
  ].filter(f=>f.v!=null);
  if(facts.length<3) return null;
  const three=bkShuffle(r,facts).slice(0,3);
  const o=bkOptions(r,pick,rows,x=>x.f.name);
  if(!o) return null;
  return {kind:'manager', q:'Which manager is this?',
    note:`<div class="bk-facts">${three.map(f=>
      `<div class="bk-fact"><span>${f.k}</span><b>${f.v}</b></div>`).join('')}</div>`,
    a:o.a, correct:o.correct};
}

/* 3 — four backfields or four receiving corps, one outscored the rest.
       Backs and receivers only: those are the two groups deep enough that the
       answer is about a team rather than about one player having a season. */
function bkqGroup(r){
  const c=bkStatSeason(4);
  const pool=bkPool(c.season); if(pool.length<50) return null;
  const pos=bkPick(r,[2,3]);                      // RB / WR
  const posN=POS_NAMES[pos];
  const byTeam={};
  pool.forEach(p=>{ if(p.pos!==pos||!(p.total>0)) return;
    const t=bkTeamOf(p); if(!t) return;
    (byTeam[t]||(byTeam[t]={t,total:0})).total+=p.total; });
  const groups=Object.values(byTeam).filter(g=>g.total>0)
    .sort((a,b)=>b.total-a.total).slice(0,16);
  if(groups.length<4) return null;
  const four=bkShuffle(r,groups).slice(0,4).sort((a,b)=>b.total-a.total);
  const right=four[0];
  const opts=bkShuffle(r,four);
  return {kind:'group',
    /* "out of these four" is not padding. The four are drawn at random from
       the top sixteen, not taken off the top, so without it the question reads
       as "who led the league" — which has one answer everybody knows, and is
       not the question being asked. */
    q:c.prior?`Which team's ${posN}s put up the most fantasy points in ${c.season}, out of these four?`
             :`Which team's ${posN}s have scored the most fantasy points this year, out of these four?`,
    note:`Every ${posN} on the roster, added together`,
    a:opts.map(g=>`${NFL_FULL[g.t]||g.t} ${posN}s`),
    correct:opts.findIndex(g=>g.t===right.t)};
}

/* 4 — a player, given only where they finished at their position.
       Ranks 10 to 36, at quarterback, back or receiver. The top nine answer
       themselves — everyone knows who the QB1 was — and past 36 it is a name
       nobody has a feel for. In between is where it is actually a question. */
const BK_RANK_LO=10, BK_RANK_HI=36;
function bkqRank(r){
  const c=bkStatSeason(4);
  if(bkPool(c.season).length<50) return null;
  const band=[];
  [1,2,3].forEach(pos=>bkRanked(pos,c.season)
    .slice(BK_RANK_LO-1,BK_RANK_HI)
    .forEach((p,i)=>band.push({p,rank:BK_RANK_LO+i})));
  if(band.length<12) return null;
  const hit=bkPick(r,band);
  const same=bkRanked(hit.p.pos,c.season).slice(0,BK_RANK_HI+8).filter(x=>x.id!==hit.p.id);
  if(same.length<3) return null;
  const o=bkOptions(r,hit.p,same,x=>x.name);
  if(!o) return null;
  const tag=`<b>${bkPosOf(hit.p)}${hit.rank}</b>`;
  return {kind:'rank',
    q:c.prior?`Who finished ${c.season} as the ${tag} in full PPR?`
             :`Who is the ${tag} in full PPR this year?`,
    note:`<b>${hit.p.total.toFixed(1)}</b> points`, a:o.a, correct:o.correct};
}

/* 5 — a player, from the shape of their last six weeks. Held back until the
       season has enough weeks behind it for a line to be worth reading.

   The pool carries season totals but not a week-by-week line, and asking ESPN
   for eighteen weekly splits across seven hundred players to draw one chart
   would be absurd. Only one player's line is ever needed, so it is fetched for
   that player alone and kept — a single call, once a week, for the player the
   seed lands on. */
let _bkLine={};
function bkWeekly(pid,season){
  const s=String(season||bkSeason()||''), key=s+':'+pid;
  if(_bkLine[key]!==undefined) return _bkLine[key];
  _bkLine[key]=null;
  fetch(`/api/espn?type=playergames&seasonId=${s}&playerId=${pid}`)
    .then(r=>r.ok?r.json():null)
    .then(j=>{ const g={};
      ((j&&j.games)||[]).forEach(x=>{ if(x.week) g[x.week]=x.pts; });
      _bkLine[key]=Object.keys(g).length?g:{};
      _bkQCache={key:'',qs:[]};            // rebuild now the line is in
      renderBallKnowledge();
      /* the roster panel reads the same line, and it is the one place that
         asks for a player's weeks on purpose rather than as a side effect */

    }).catch(()=>{ _bkLine[key]={}; });
  return null;
}
function bkqGraph(r,week){
  /* No longer held back. Six weeks of the season just gone is a shape whether
     or not this one has started, so until this season has six of its own the
     question asks about the run-in to the last — the six weeks ending at 17. */
  const c=bkStatSeason(6);
  if(bkPool(c.season).length<50) return null;
  /* only players the league has actually rostered — a chart of someone nobody
     has ever owned is not a question, it is a coin flip */
  const owned=new Set();
  Object.values(_tenure||{}).forEach(byPid=>Object.keys(byPid||{}).forEach(id=>owned.add(String(id))));
  let notable=bkNotable(24,c.season);
  if(owned.size>40) notable=notable.filter(p=>owned.has(String(p.id)));
  if(notable.length<8) return null;
  const p=bkPick(r,notable);
  const line=bkWeekly(p.id,c.season);
  if(!line) return null;                   // still on its way
  const last=c.prior?17:week;
  const ws=Object.keys(line).map(Number).filter(w=>w<=last).sort((a,b)=>a-b);
  const show=ws.slice(-6);
  if(show.length<3) return null;
  const same=bkRanked(p.pos,c.season).slice(0,40).filter(x=>x.id!==p.id);
  const o=bkOptions(r,p,same,x=>x.name);
  if(!o) return null;
  return {kind:'graph',
    q:c.prior?`Whose ${c.season} finish is this?`:'Whose season is this?',
    graph:show.map(w=>({w,v:line[w]})), a:o.a, correct:o.correct,
    note:`${bkPosOf(p)} · ${c.prior?`weeks ${show[0]}–${show[show.length-1]}, ${c.season}`
                                   :`last ${show.length} weeks`}`};
}

/* Every school in bios.json, with the name people actually say. "Cincinnati"
   is a city; "Cincinnati Bearcats" is a football team, and the mascot is half
   of what makes the clue recognisable. Anything not on the list falls back to
   the bare college name rather than guessing. */
const COLLEGE_MASCOT={
  'Alabama':'Crimson Tide','Arizona':'Wildcats','Arizona State':'Sun Devils',
  'Arkansas':'Razorbacks','Auburn':'Tigers','BYU':'Cougars','Boise State':'Broncos',
  'Boston College':'Eagles','Bowling Green':'Falcons','California':'Golden Bears',
  'Cincinnati':'Bearcats','Clemson':'Tigers','Colorado State':'Rams','Delaware':'Blue Hens',
  'Duke':'Blue Devils','Eastern Washington':'Eagles','Florida':'Gators',
  'Florida Atlantic':'Owls','Florida State':'Seminoles','Fort Valley State':'Wildcats',
  'Fresno State':'Bulldogs','Georgia':'Bulldogs','Georgia State':'Panthers',
  'Georgia Tech':'Yellow Jackets','Holy Cross':'Crusaders','Illinois':'Fighting Illini',
  'Iowa':'Hawkeyes','Iowa State':'Cyclones','Kentucky':'Wildcats','LSU':'Tigers',
  'Liberty':'Flames','Louisville':'Cardinals','Marist':'Red Foxes','Maryland':'Terrapins',
  'Memphis':'Tigers','Miami':'Hurricanes','Michigan':'Wolverines','Michigan State':'Spartans',
  'Mississippi State':'Bulldogs','Missouri':'Tigers','NC State':'Wolfpack','Nevada':'Wolf Pack',
  'North Carolina':'Tar Heels','North Dakota State':'Bison','Notre Dame':'Fighting Irish',
  'Ohio State':'Buckeyes','Oklahoma':'Sooners','Oklahoma State':'Cowboys','Ole Miss':'Rebels',
  'Oregon':'Ducks','Penn State':'Nittany Lions','Princeton':'Tigers','Purdue':'Boilermakers',
  'Rice':'Owls','Rutgers':'Scarlet Knights','SMU':'Mustangs','South Carolina':'Gamecocks',
  'South Dakota State':'Jackrabbits','Southeast Missouri State':'Redhawks','Stanford':'Cardinal',
  'Syracuse':'Orange','TCU':'Horned Frogs','Temple':'Owls','Tennessee':'Volunteers',
  'Texas':'Longhorns','Texas A&M':'Aggies','Texas Tech':'Red Raiders','Toledo':'Rockets',
  'Troy':'Trojans','Tulane':'Green Wave','UCF':'Knights','UCLA':'Bruins','USC':'Trojans',
  'UTEP':'Miners','Utah':'Utes','Utah State':'Aggies','Virginia':'Cavaliers',
  'Virginia Tech':'Hokies','Washington':'Huskies','Weber State':'Wildcats',
  'West Virginia':'Mountaineers','Wisconsin':'Badgers','Wyoming':'Cowboys',
};
const bkSchool=c=>{ const m=COLLEGE_MASCOT[c]; return m?`${c} ${m}`:c; };
/* 6 — a player, from where they came from and when */
function bkqBio(r){
  const bios=_bkBios; if(!bios) return null;
  const ids=Object.keys(bios).filter(id=>bios[id].college&&bios[id].draftYear);
  if(ids.length<12) return null;
  const id=bkPick(r,ids), b=bios[id];
  /* The wrong three have to play the same position. The clue names it, so a
     tight end sitting among three running backs answers itself. */
  let others=ids.filter(x=>x!==id).map(x=>bios[x]).filter(x=>x.pos===b.pos);
  if(others.length<3) others=ids.filter(x=>x!==id).map(x=>bios[x]);
  const o=bkOptions(r,b,others,x=>x.name);
  if(!o) return null;
  return {kind:'bio', q:'Which player is this?',
    note:`<b>${bkSchool(b.college)}</b> · ${b.pos||'—'} · drafted <b>${b.draftYear}</b>`,
    a:o.a, correct:o.correct};
}

/* 7 — an NFL team, from where its three best finished at their positions.
       Any three positions will do: it is the team's best fantasy finishers, so
       one roster reads QB7 · RB12 · WR3 and another WR2 · WR14 · TE9, and the
       shape of that is the clue. */
function bkqTeamRanks(r){
  const c=bkStatSeason(4);
  const pool=bkPool(c.season); if(pool.length<50) return null;
  const byTeam={};
  pool.forEach(p=>{ const t=bkTeamOf(p); if(!t||!(p.total>0)) return;
    (byTeam[t]||(byTeam[t]=[])).push(p); });
  const teams=Object.keys(byTeam).filter(t=>byTeam[t].length>=3);
  if(teams.length<4) return null;
  /* only teams whose best three are actually placed — a roster of unranked
     names gives nothing to reason from */
  const usable=teams.filter(t=>{
    const top=byTeam[t].slice().sort((a,b)=>b.total-a.total).slice(0,3);
    return top.every(p=>{ const rk=bkRankOf(p,c.season); return rk&&rk<=48; });
  });
  if(usable.length<4) return null;
  const t=bkPick(r,usable);
  const top=byTeam[t].slice().sort((a,b)=>b.total-a.total).slice(0,3)
    .map(p=>`${bkPosOf(p)}${bkRankOf(p,c.season)}`);
  const o=bkOptions(r,{t},usable.map(x=>({t:x})),x=>NFL_FULL[x.t]||x.t);
  if(!o) return null;
  return {kind:'teamranks',
    q:c.prior?`Which NFL team finished ${c.season} with these fantasy players?`
             :'Which NFL team has these fantasy players this year?',
    note:top.map(x=>`<b>${x}</b>`).join(' · '), a:o.a, correct:o.correct};
}

/* The five for a given week. Kinds are drawn in a seeded order and each is
   asked for a question; one that cannot build drops out and the next takes its
   place, so a thin week still fills up rather than showing gaps. */
/* Six kinds. The NFL-team-total question and the division question are both
   gone: each asked which slice of the NFL scored most, which is a question
   about the NFL rather than about this league, and neither could be got at by
   reasoning — you either had the number or you guessed. */
const BK_KINDS=[bkqManager,bkqGroup,bkqRank,bkqGraph,bkqBio,bkqTeamRanks];
function bkBuildWeek(season,week,n){
  const out=[];
  const seed=Math.imul((Number(season)||0)*100+(Number(week)||0),2654435761);
  /* each question gets its own stream, or one generator's draws would shift
     every question after it whenever its data changed */
  const order=bkShuffle(bkRand(seed),BK_KINDS.map((_,i)=>i));
  for(let pass=0;pass<3&&out.length<(n||5);pass++){
    for(const i of order){
      if(out.length>=(n||5)) break;
      let q=null;
      try{ q=BK_KINDS[i](bkRand(seed+Math.imul(i+1,0x9E3779B1)+pass*7919),week); }catch(e){}
      if(q&&!out.some(x=>x.kind===q.kind)) out.push(q);
    }
    if(!out.length) break;
  }
  return out;
}

/* ── BALL KNOWLEDGE: the question engine ─────────────────────────────────────
   The five weekly questions are generated from this season rather than written
   out by hand. Everything they ask about is already on the site or one cached
   call away: the league's own records, the full NFL player pool with season
   totals, and a committed file of college and draft years.

   Every question is four options with exactly one right answer, and every one
   is built from a seeded generator keyed on the season and week — so the whole
   league gets the same five questions in the same order, and reloading the page
   does not reroll them.

   The generators return null when their data is not there yet. A week that
   cannot fill five questions falls back to whichever kinds can answer, which is
   what stops week one from being blank. */
const NFL_TEAMS={1:'ATL',2:'BUF',3:'CHI',4:'CIN',5:'CLE',6:'DAL',7:'DEN',8:'DET',9:'GB',10:'TEN',
  11:'IND',12:'KC',13:'LV',14:'LAR',15:'MIA',16:'MIN',17:'NE',18:'NO',19:'NYG',20:'NYJ',
  21:'PHI',22:'ARI',23:'PIT',24:'LAC',25:'SF',26:'SEA',27:'TB',28:'WSH',29:'CAR',30:'JAX',
  33:'BAL',34:'HOU'};
const NFL_FULL={ATL:'Atlanta',BUF:'Buffalo',CHI:'Chicago',CIN:'Cincinnati',CLE:'Cleveland',
  DAL:'Dallas',DEN:'Denver',DET:'Detroit',GB:'Green Bay',TEN:'Tennessee',IND:'Indianapolis',
  KC:'Kansas City',LV:'Las Vegas',LAR:'Rams',MIA:'Miami',MIN:'Minnesota',NE:'New England',
  NO:'New Orleans',NYG:'the Giants',NYJ:'the Jets',PHI:'Philadelphia',ARI:'Arizona',
  PIT:'Pittsburgh',LAC:'Chargers',SF:'San Francisco',SEA:'Seattle',TB:'Tampa Bay',
  WSH:'Washington',CAR:'Carolina',JAX:'Jacksonville',BAL:'Baltimore',HOU:'Houston'};
/* one generator, seeded from the season and week, so the league sees one set */
function bkRand(seed){
  let a=seed>>>0;
  return ()=>{ a=(a+0x6D2B79F5)>>>0; let t=Math.imul(a^(a>>>15),1|a);
    t=(t+Math.imul(t^(t>>>7),61|t))^t; return ((t^(t>>>14))>>>0)/4294967296; };
}
const bkPick=(r,arr)=>arr[Math.floor(r()*arr.length)];
function bkShuffle(r,arr){
  const a=arr.slice();
  for(let i=a.length-1;i>0;i--){ const j=Math.floor(r()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; }
  return a;
}
/* four options with the answer among them, in a seeded order */
function bkOptions(r,right,wrongPool,label){
  const wrong=bkShuffle(r,wrongPool.filter(x=>label(x)!==label(right))).slice(0,3);
  if(wrong.length<3) return null;
  const all=bkShuffle(r,[right,...wrong]);
  return {a:all.map(label), correct:all.findIndex(x=>label(x)===label(right))};
}

/* ── the data the questions are built from ─────────────────────────────────── */
let _bkPool=null,_bkBios=null,_bkBiosPromise=null;
/* One pool per season rather than one pool. Most of the questions look back a
   year while the current one is only a few weeks old — a league that has played
   three games has nothing worth asking about — so two seasons are in play at
   once and each is fetched and kept on its own. _bkPool stays pointed at the
   current season, which is what the roster stand-ins and the sportsbook read. */
let _bkPools={},_bkPoolReq={};
function bkSeason(){
  for(let i=ALL_SEASONS.length-1;i>=0;i--){
    const m=_seasonMeta[ALL_SEASONS[i]];
    if(m&&(m.schedule||[]).some(x=>x.home&&x.away&&((x.home.totalPoints||0)>0||(x.away.totalPoints||0)>0)))
      return ALL_SEASONS[i];
  }
  return ALL_SEASONS[ALL_SEASONS.length-1];
}
function bkLoadPool(season){
  const s=String(season||bkSeason()||'');
  if(!s) return null;
  if(_bkPools[s]) return _bkPools[s];
  if(!_bkPoolReq[s]){
    _bkPoolReq[s]=fetch(`/api/espn?type=pool&seasonId=${s}&limit=700`)
      .then(r=>r.ok?r.json():null)
      .then(j=>{ _bkPools[s]=(j&&j.players)||[];
        if(s===String(bkSeason())) _bkPool=_bkPools[s];
        _bkQCache={key:'',qs:[]}; renderBallKnowledge();
        /* the board and the market price off this — repaint whichever is open
           when it lands, or they keep serving whatever they computed without it */
        try{ _sbCache=null; _invCache=null;
          if(_activeTab==='book') renderBook(); }catch(e){}
        return _bkPools[s]; })
      .catch(()=>{ _bkPools[s]=[]; return _bkPools[s]; });
  }
  return null;
}
/* ── WHICH SEASON A QUESTION IS ABOUT ────────────────────────────────────────
   A question about "this year" in week two is a question about one Sunday. So
   the statistical questions look back at the season just gone until the current
   one has enough football in it to be worth asking about, and then switch. The
   cutoff differs by question — four weeks is enough for a points total to mean
   something, six for a six-week shape — so each one names its own.

   The switch is in the wording as well as the data: a question about last year
   says the year, and a question about this one says "this year". Nothing else
   would tell you which you were being asked. */
/* THE SEASON THE QUESTIONS BELONG TO is the one being played, which is not the
   same as the newest season with a score in it. In August the league year has
   turned over and nothing has kicked off: bkSeason still answers "last year",
   because that is the last year anybody scored, and it is right to for the
   roster stand-ins that read it. The quiz is not asking about the last year
   anybody scored — it is asking this year's questions, and the year it looks
   back at is the one just finished. So it anchors on the league year and the
   two only agree once a ball is kicked. */
function bkLeagueSeason(){
  const y=String(nflSeasonYear());
  return ALL_SEASONS.includes(y)?y:ALL_SEASONS[ALL_SEASONS.length-1];
}
/* the newest season before this one that was actually played — a year with a
   schedule and no scores in it is not something to ask questions about */
function bkPrevSeason(){
  const cur=Number(bkLeagueSeason())||0;
  const played=y=>{const m=_seasonMeta[y];
    return m&&(m.schedule||[]).some(x=>x.home&&x.away&&((x.home.totalPoints||0)>0||(x.away.totalPoints||0)>0));};
  const have=ALL_SEASONS.filter(y=>Number(y)<cur&&played(y)).sort();
  return have.length?have[have.length-1]:null;
}
function bkStatSeason(cutoff){
  const cur=bkLeagueSeason();
  if(bkWeek()>cutoff) return {season:cur,prior:false};
  const prev=bkPrevSeason();
  return prev?{season:String(prev),prior:true}:{season:cur,prior:false};
}
/* "in 2025" or "this year", for the end of a sentence */
const bkWhen=c=>c.prior?`in ${c.season}`:'this year';
function bkLoadBios(){
  if(_bkBios) return _bkBios;
  if(!_bkBiosPromise){
    _bkBiosPromise=fetch('/data/bios.json').then(r=>r.ok?r.json():null)
      .then(j=>{ _bkBios=(j&&j.players)||{}; _bkQCache={key:'',qs:[]}; renderBallKnowledge(); return _bkBios; })
      .catch(()=>{ _bkBios={}; return _bkBios; });
  }
  return null;
}
/* season leaders by position, which is what a "WR4" means */
/* No falling back to whatever pool happens to be loaded. A question about last
   season answered out of this season's totals would be wrong and would look
   right, which is the worst way to be wrong — better that the generator finds
   nothing and stands down until the season it asked for arrives. */
function bkPool(season){ return _bkPools[String(season||bkSeason()||'')]||[]; }
function bkRanked(pos,season){
  return bkPool(season).filter(p=>p.pos===pos&&p.total>0).sort((a,b)=>b.total-a.total);
}
function bkRankOf(p,season){
  const list=bkRanked(p.pos,season);
  const i=list.findIndex(x=>x.id===p.id);
  return i<0?null:i+1;
}
const bkPosOf=p=>POS_NAMES[p.pos]||'?';
const bkTeamOf=p=>NFL_TEAMS[p.proTeamId]||null;
/* who a question is allowed to be about: recognisable, not a deep bench arm */
function bkNotable(minRank,season){
  const out=[];
  [1,2,3,4].forEach(pos=>bkRanked(pos,season).slice(0,minRank||36).forEach(p=>out.push(p)));
  return out;
}

/* ── BALL KNOWLEDGE ─────────────────────────────────────────────────────────
   Five weekly trivia questions on the homepage. Answers live as a field on the
   manager's profile document, the same place the Matchup of the Week vote is
   kept — so nothing new had to be opened up in Firestore, and a manager's
   answers follow them between devices.

   Unanswered questions sit at the top expanded; answering one collapses it and
   drops it to the bottom of the stack, so the next question is always the one
   in front of you. Reopening a collapsed card lets the answer be changed. */
/* resetToken is part of the key, so bumping it in config orphans every stored
   answer at once rather than needing them deleted per device and per profile. */
/* The Firestore field name has to stay stable — it is a field on that
   manager's own document, so it is already per profile. The localStorage copy
   is not: it is per device, so signing out and back in as someone else used to
   show them the last manager's answers. Everything cached locally is namespaced
   by whoever is signed in. */
const lsKey=k=>(_me?_me.k1:'guest')+':'+k;
const bkKey=()=>{
  const c=_CFG.ballKnowledge||{};
  const r=c.resetToken?`_r${c.resetToken}`:'';
  return `bk_${bkLeagueSeason()}_w${bkWeek()}${r}`;
};
let _bkAnswers=null,_bkBusy=false,_bkOpen=null,_bkDone=false,_bkFetched=false;

/* _me holds only the two keys and a team, so the saved answers have to be read
   off the profile document itself. Local answers win on conflict: they are the
   ones just tapped on this device. */
async function bkSync(){
  if(!_me||_bkFetched) return;
  _bkFetched=true;
  try{
    const res=await gflFetchProfile(_me.k1);
    const raw=res&&res.data?res.data[bkKey()]:null;
    if(!raw) return;
    const srv=JSON.parse(raw);
    _bkAnswers={...srv,...bkLoadAnswers()};
    localStorage.setItem(lsKey(bkKey()),JSON.stringify(_bkAnswers));
    /* Submitted lives on the profile as well as the device, or clearing the
       storage — or signing in on a second phone — reopens a closed set and
       offers the marks up for a second look. */
    if(String((res.data||{})[bkSubKey()]||'')==='1'){
      _bkSubmitted=true;
      localStorage.setItem(lsKey(bkSubKey()),'1');
    }
    renderBallKnowledge();
  }catch(e){}
}
function bkReset(){ _bkAnswers=null; _bkFetched=false; _bkOpen=null; _bkSubmitted=null; renderBallKnowledge(); }
/* ── SUBMITTING THE SET ──────────────────────────────────────────────────────
   Every tap still saves, to the device and to the profile, so nothing can be
   lost by walking away half way through and nothing about scoring changes.
   What Submit decides is when the set is CLOSED and the marks are shown.

   Before it: the five answers can be read back and changed, and no question
   says whether it landed. After it: the scorecard, and no way back in. Showing
   right and wrong the instant the fifth answer went in meant the last question
   was the only one nobody could reconsider, which is a strange place to draw
   the line. */
const bkSubKey=()=>bkKey()+'_sub';
let _bkSubmitted=null;
/* SUBMIT HAS ITS OWN IN-FLIGHT FLAG, and it is not _bkBusy.

   _bkBusy is raised while an ANSWER is being written to the profile. The Submit
   button read it too, which made it dead for reasons that had nothing to do with
   submitting: the player pool and the bios file both re-render Ball Knowledge
   when they land, and if one landed while the fifth answer was still being
   written the button was drawn disabled and nothing re-rendered afterwards. It
   stayed grey until the section was tapped, which is what forced a fresh render.

   Nothing is at stake in letting them overlap. An answer is in localStorage
   before its write starts, and Submit sends the whole set itself. */
let _bkSending=false;
function bkSubmitted(){
  if(_bkSubmitted!=null) return _bkSubmitted;
  _bkSubmitted=localStorage.getItem(lsKey(bkSubKey()))==='1';
  return _bkSubmitted;
}
async function bkSubmit(){
  if(_bkSending) return;
  const qs=bkQuestions(), ans=bkLoadAnswers();
  if(!qs.length||!qs.every((_,i)=>ans[i]!=null)) return;   // not all five in
  _bkSending=true; renderBallKnowledge();
  localStorage.setItem(lsKey(bkSubKey()),'1');
  _bkSubmitted=true;
  if(_me){ try{ await gflPatchProfile(_me.k1,
    {[bkKey()]:JSON.stringify(ans),[bkSubKey()]:'1'}); }catch(e){} }
  _bkSending=false; renderBallKnowledge();
  try{ orderHomeTodo(); }catch(e){}
}
/* Step back to the most recently answered question and clear it, so it is
   asked again. Only reachable while the set is still open. */
async function bkBack(){
  if(bkSubmitted()) return;              // closed: the marks are already out
  const ans=bkLoadAnswers();
  const done=Object.keys(ans).map(Number).sort((a,b)=>a-b);
  if(!done.length) return;
  const last=done[done.length-1];
  delete ans[last];
  localStorage.setItem(lsKey(bkKey()),JSON.stringify(ans));
  renderBallKnowledge();
  if(_me){ try{ await gflPatchProfile(_me.k1,{[bkKey()]:JSON.stringify(ans)}); }catch(e){} }
}

/* The week the questions belong to is the league's own current week, not a
   number kept in config — there is nothing left to edit by hand each Tuesday. */
function bkWeek(){ return Number((_liveInfo||liveWeekInfo()||{}).week)||1; }
let _bkQCache={key:'',qs:[]};
function bkQuestions(){
  const season=bkLeagueSeason(), week=bkWeek();
  /* previewAll is in the key, not only in the build. It answers to who is
     signed in now, so signing into the testing profile — or out of it — has to
     rebuild rather than hand back the set the other view had already cached. */
  const all=isTestProfile()&&!!(_CFG.ballKnowledge||{}).previewAll;
  const key=season+':'+week+(all?':all':'');
  if(_bkQCache.key===key&&_bkQCache.qs.length) return _bkQCache.qs;
  /* All fire-and-forget: they repaint the card when they land, and until then
     the generators that need them simply decline to build. Two pools, because
     the statistical questions look back a year until this season has enough
     football in it and the six-week shape switches over later than the rest. */
  bkLoadPool(); bkLoadBios();
  bkLoadPool(bkStatSeason(4).season);
  bkLoadPool(bkStatSeason(6).season);
  /* previewAll turns the weekly five into one of every kind, so the whole set
     can be looked over before a season is running. The graph question is
     normally held back until after week 5; in preview it is let through, or
     there would be nothing to look at. */
  const want=all?BK_KINDS.length:5;
  const qs=bkBuildWeek(season,all?99:week,want);
  /* Only a full set is worth keeping. The pool and the bios arrive after the
     first paint, and until they do most generators decline — so the first build
     can come back with just the one question that needs neither. Caching that
     pinned the card to a single question for the rest of the session, because
     the key is only the season and the week and never changed again. */
  if(qs.length>=want) _bkQCache={key,qs};
  return qs;
}
/* A sparkline of the weeks shown, drawn rather than described — the shape is
   the question. No axis labels: a week number would narrow it down for anyone
   who remembers a bye. */
/* Bars rather than a line. A line says "went up, went down", which is a shape
   you can read without knowing the numbers; bars put each week's score inside
   its own bar and the week under it, so the question is the run of scores
   rather than the slope between them.

   The score sits inside the bar at the top when the bar is tall enough to hold
   it, and above the bar when it is not — a 2.4-point week is a stub, and a
   label printed inside it would be printed on the ground. */
function bkGraphSVG(pts){
  if(!pts||pts.length<2) return '';
  const W=280,H=96,padX=6,padT=6,padB=15;
  const n=pts.length;
  const slot=(W-padX*2)/n, bw=Math.min(30,slot-6);
  const hi=Math.max(1,...pts.map(p=>p.v));
  const base=H-padB;
  const bars=pts.map((p,i)=>{
    const cx=padX+slot*i+slot/2;
    const h=Math.max(2,((Math.max(0,p.v))/hi)*(base-padT));
    const top=base-h;
    const inside=h>=17;
    const ty=inside?top+11:top-4;
    const col=inside?'#0d0d0f':'var(--text2)';
    return `<rect x="${(cx-bw/2).toFixed(1)}" y="${top.toFixed(1)}" width="${bw.toFixed(1)}"
        height="${h.toFixed(1)}" rx="3" fill="var(--accent)"/>
      <text x="${cx.toFixed(1)}" y="${ty.toFixed(1)}" text-anchor="middle"
        font-size="9" font-weight="800" fill="${col}"
        font-family="Inter,sans-serif">${p.v.toFixed(1)}</text>
      <text x="${cx.toFixed(1)}" y="${(H-4).toFixed(1)}" text-anchor="middle"
        font-size="8.5" font-weight="700" fill="var(--text3)"
        font-family="Inter,sans-serif">WK ${p.w}</text>`;
  }).join('');
  return `<svg class="bk-graph" viewBox="0 0 ${W} ${H}" role="img"
    aria-label="Fantasy points by week">
    <line x1="${padX}" y1="${base}" x2="${W-padX}" y2="${base}"
      stroke="var(--text3)" stroke-opacity="0.28" stroke-width="1"/>
    ${bars}</svg>`;
}
function bkLoadAnswers(){
  if(_bkAnswers) return _bkAnswers;
  let raw='';
  if(_me&&_me[bkKey()]!=null) raw=String(_me[bkKey()]);
  else raw=localStorage.getItem(lsKey(bkKey()))||'';   // signed out, or before the profile lands
  try{ _bkAnswers=raw?JSON.parse(raw):{}; }catch{ _bkAnswers={}; }
  return _bkAnswers;
}
async function bkAnswer(qi,ai,el){
  if(_bkBusy) return;
  /* The grid is rebuilt in place, so the button that lands in the slot just
     tapped inherits the pressed/hover state and the next question opens with
     an answer looking pre-picked. Dropping focus first resets it. */
  if(el&&el.blur) el.blur();
  const ans=bkLoadAnswers();
  ans[qi]=ai;
  _bkOpen=null;
  localStorage.setItem(lsKey(bkKey()),JSON.stringify(ans));   // instant, and the fallback when signed out
  /* Let the answered card leave before the next is drawn. Without it the words
     change under the finger that just tapped and it reads as the question
     having been edited rather than answered. Short enough not to be a wait. */
  const card=el&&el.closest?el.closest('.bk-card'):null;
  if(card&&!matchMedia('(prefers-reduced-motion:reduce)').matches){
    card.classList.add('bk-leave');
    await new Promise(r=>setTimeout(r,190));
  }
  renderBallKnowledge();
  if(_me){
    _bkBusy=true;
    try{ await gflPatchProfile(_me.k1,{[bkKey()]:JSON.stringify(ans)}); }catch(e){}
    _bkBusy=false;
    /* Anything that repainted while the write was in flight drew the busy state.
       One more render on the way out settles it rather than leaving whatever the
       last repaint happened to catch. */
    renderBallKnowledge();
  }
}
function bkReopen(qi){ _bkOpen=(_bkOpen===qi?null:qi); renderBallKnowledge(); }

function renderBallKnowledge(){
  const el=document.getElementById('bk-body'); if(!el) return;
  bkSync();                                  // fire and forget; re-renders if it finds saved answers
  const sec=document.getElementById('bk-sec');
  const qs=bkQuestions();
  if(!qs.length){ if(sec) sec.style.display='none'; return; }
  if(sec) sec.style.display='';
  /* The five questions are the same for the whole league, but the answers, the
     score and what has been retired are one manager's — and a blank counts
     against you once the week's football starts. Showing the set to nobody in
     particular invites it to be read through signed out and then answered from
     memory, which is not the game. */
  if(!_me){
    el.innerHTML=`<div class="home-signin">
      <div class="home-signin-t">Sign in to answer this week's five and move your Ball Knowledge.</div>
      <button class="home-signin-b" onclick="openSignIn()">Sign in</button>
      <div class="home-signin-m">${qs.length} questions waiting</div>
    </div>`;
    return;
  }
  const cfg=_CFG.ballKnowledge||{};
  const ans=bkLoadAnswers();
  const answered=qs.map((_,i)=>i).filter(i=>ans[i]!=null);
  const pending =qs.map((_,i)=>i).filter(i=>ans[i]==null);

  /* One tap answers a question and it is gone — no collapsing and no reopening.
     The set is graded together at the end instead, which is also what stops
     anyone walking their answers to a perfect score. */
  if(pending.length){
    /* One at a time, the way the notification stack reads — except there is
       nothing to swipe. Answering retires the card and the next takes its slot.
       Which of the set this is stays on show while previewAll is on, since that
       is the only way to tell one kind from another while looking them over. */
    const showKind=isTestProfile()&&!!(_CFG.ballKnowledge||{}).previewAll;
    const card=(i)=>{
      const q=qs[i];
      return `<div class="bk-card bk-open bk-enter">
        ${showKind?`<div class="bk-kind">${i+1} · ${q.kind}</div>`:''}
        <div class="bk-q">${q.q}</div>
        ${q.graph?`<div class="bk-graphwrap">${bkGraphSVG(q.graph)}</div>`:''}
        ${q.note?`<div class="bk-note">${q.note}</div>`:''}
        <div class="bk-opts">
          ${q.a.map((opt,ai)=>`<button type="button" class="bk-opt" onclick="bkAnswer(${i},${ai},this)">${opt}</button>`).join('')}
        </div>
      </div>`;
    };
    const i=pending[0];
    el.innerHTML=`
      <div class="bk-meta"><span>Week ${bkWeek()}</span>
        <span class="bk-count">${answered.length} of ${qs.length}</span></div>
      ${card(i)}
      ${''/* going back re-opens the last one answered, so a misfire can be
             corrected — but only while the set is still open. Once it is graded
             the answers are settled and there is no way back in. */}
      ${answered.length?`<button class="bk-back" onclick="bkBack()">
        <i class="fa fa-arrow-left"></i>Back to the last question</button>`:''}`;
    bkPlace(false);
    orderHomeTodo();
    return;
  }

  /* ALL FIVE IN, NOT YET SENT. The set reads back with the answer given beside
     each question and nothing about whether it landed — the marks are what
     Submit buys. Back still steps into the last one. */
  if(!bkSubmitted()){
    const rows=qs.map((q,i)=>`<div class="bkr pend">
      <i class="fa fa-circle-dot"></i>
      <span class="bkr-q">${q.q}</span>
      <span class="bkr-a">${q.a[ans[i]]}</span>
    </div>`).join('');
    el.innerHTML=`
      <div class="bk-meta"><span>Week ${bkWeek()}</span>
        <span class="bk-count">${qs.length} of ${qs.length} answered</span></div>
      <div class="bk-score">${rows}</div>
      <button class="bk-go" ${_bkSending?'disabled':''} onclick="bkSubmit()">
        ${_bkSending?'Sending…':'Submit answers'}</button>
      <div class="bk-subnote">Nothing is marked until you send it. After that the
        set is closed.</div>
      <button class="bk-back" onclick="bkBack()">
        <i class="fa fa-arrow-left"></i>Back to the last question</button>`;
    bkPlace(false);
    orderHomeTodo();
    return;
  }

  /* Sent: the condensed scorecard. One line per question, coloured by whether
     it landed, with what the set moved your Ball Knowledge by underneath. */
  const iq=bkIQCfg();
  let right=0;
  const rows=qs.map((q,i)=>{
    const ok=ans[i]===q.correct; if(ok) right++;
    return `<div class="bkr ${ok?'ok':'no'}">
      <i class="fa ${ok?'fa-check':'fa-xmark'}"></i>
      <span class="bkr-q">${q.q}</span>
      <span class="bkr-a">${ok?q.a[ans[i]]:q.a[q.correct]}</span>
    </div>`;
  }).join('');
  const wrong=qs.length-right;
  const delta=(right-wrong)*iq.step;
  const word=delta>0?'gained':delta<0?'lost':'held';
  el.innerHTML=`
    <div class="bk-meta"><span>Week ${bkWeek()}</span>
      <span class="bk-count">${right} of ${qs.length} right</span></div>
    <div class="bk-score">${rows}</div>
    <div class="bk-delta ${delta>0?'up':delta<0?'down':'flat'}">
      <span class="bk-delta-v">${delta>0?'+':delta<0?'−':''}${Math.abs(delta)}</span>
      <span class="bk-delta-l">Ball Knowledge ${word}</span>
    </div>
    ${''/* NO START OVER ON A GRADED SET, except for the testing account.

           The scorecard prints the right answer beside every question that was
           missed. A restart wiped the stored answers and reopened the same five
           questions — they are seeded on season and week, so they come back
           identical — which was a two-tap route to five out of five, every week,
           on the one number the site exists to keep honest. Answering one at a
           time and grading the set together is what was supposed to stop
           somebody walking their way to a perfect score, and this undid it.

           Correcting a misfire is what the Back button is for, and it only
           exists while the set is still open. */}
    ${isTestProfile()?homeRestartBtn('bk'):''}`;
  bkPlace(true);
  orderHomeTodo();
}

/* When the set is finished the card leaves the top row and settles at the foot
   of the page. Moving a node mid-flight would jump, so the travel is measured
   first and played back as a transform — the element is already in its new home
   while it animates from where it used to be. */
function bkPlace(done){
  const sec=document.getElementById('bk-sec'); if(!sec) return;
  const page=document.getElementById('page-home'); if(!page) return;
  const atBottom=sec.parentElement===page && sec===page.lastElementChild;
  /* Coming back from finished. The card was appended to the foot of the page
     when the set was completed, and the comment here used to claim it returned
     to its slot on the next render — nothing ever moved it. Starting over left
     it parked at the bottom: no longer a grid item of .home-top, so the slot
     orderHomeTodo hands it does nothing, and the page keeps the tightened
     margin that only makes sense while the card is down there. That is the
     spacing going wrong above it. */
  if(!done && atBottom){
    const col=page.querySelector('.home-left-col');
    if(col){
      col.appendChild(sec);
      sec.classList.remove('bk-moved');
      sec.style.transition=''; sec.style.transform=''; sec.style.zIndex='';
      _bkDone=false;
      try{ orderHomeTodo(); }catch(e){}
    }
    return;
  }
  if(done===_bkDone && (!done||atBottom)) return;
  _bkDone=done;
  if(!done) return;
  if(atBottom) return;
  const from=sec.getBoundingClientRect();
  page.appendChild(sec);
  sec.classList.add('bk-moved');
  const to=sec.getBoundingClientRect();
  const dx=from.left-to.left, dy=from.top-to.top;
  if(!dx&&!dy){ sec.scrollIntoView({block:'center',behavior:'smooth'}); return; }
  sec.style.transition='none';
  sec.style.transform=`translate(${dx}px,${dy}px)`;
  sec.offsetHeight;                       // commit the start position
  /* Slower than a normal reflow on purpose, and the page follows it down. The
     card travelling to the foot of the page is the only cue that the set is
     finished and where the result now lives, so it has to be watchable rather
     than a jump that happens off screen. */
  sec.style.transition='transform 1.1s cubic-bezier(.3,.75,.25,1)';
  sec.style.transform='';
  /* Scroll to where the card is going to be, not to where it is.
     scrollIntoView reads the element's *transformed* box, and at this instant
     that box is still a thousand pixels up the page — so the browser set off
     toward a target that was moving away from it the whole time, overshot the
     end of the document and rubber-banded back. On a phone that reads as the
     screen zooming out and snapping in again. `to` was measured after the card
     was reparented and before the transform went on, so it is the resting
     position: scroll to that and let the card come to meet it. */
  try{
    const top=to.top+window.scrollY-Math.max(0,(window.innerHeight-to.height)/2);
    const max=Math.max(0,document.documentElement.scrollHeight-window.innerHeight);
    window.scrollTo({top:Math.max(0,Math.min(max,top)),behavior:'smooth'});
  }catch(e){}
  setTimeout(()=>{ sec.style.transition=''; sec.classList.add('bk-landed'); },1150);
  setTimeout(()=>{ sec.classList.remove('bk-landed'); },2400);
}

/* ── Weekly picks ───────────────────────────────────────────────────────────
   Pick a side in every game on the slate. Same shape as Ball Knowledge — one
   on screen at a time, picking collapses it and drops it to the bottom — but
   deliberately no tally: Matchup of the Week is where the league's split is
   shown, and seeing it here would colour the picks it is collecting.
   Stored on the profile beside the Ball Knowledge answers. */
const pkKey=()=>{
  const c=_CFG.ballKnowledge||{};
  const r=c.resetToken?`_r${c.resetToken}`:'';
  return `pk_${getSeason()}_w${(_liveInfo||liveWeekInfo()||{}).week??0}${r}`;
};
let _pkPicks=null,_pkBusy=false,_pkFetched=false;

function pkGames(){
  const info=_liveInfo||liveWeekInfo();
  return info&&info.games?info.games.filter(g=>g.home&&g.away):[];
}
function pkLoad(){
  if(_pkPicks) return _pkPicks;
  let raw=localStorage.getItem(lsKey(pkKey()))||'';
  try{ _pkPicks=raw?JSON.parse(raw):{}; }catch{ _pkPicks={}; }
  return _pkPicks;
}
async function pkSync(){
  if(!_me||_pkFetched) return;
  _pkFetched=true;
  try{
    const res=await gflFetchProfile(_me.k1);
    const d=res&&res.data;
    if(!d) return;
    /* Whether the slate was submitted lives on the profile as well as the
       device. It used to be local only, so signing in anywhere else — or on the
       same phone after the storage was cleared — reopened a slate that was
       already in and asked for it again. */
    const sub=String(d[pkSubKey()]||'')==='1';
    if(sub){ _pkSubmitted=true; localStorage.setItem(lsKey(pkSubKey()),'1'); }
    const raw=d[pkKey()];
    if(raw){
      _pkPicks=sub?JSON.parse(raw):{...JSON.parse(raw),...pkLoad()};
      localStorage.setItem(lsKey(pkKey()),JSON.stringify(_pkPicks));
    }
    renderWeekPicks();
    try{ orderHomeTodo(); }catch(e){}
  }catch(e){}
}
function pkReset(){ _pkPicks=null; _pkFetched=false; _pkSubmitted=null; renderWeekPicks(); }
/* Picks are held on the device until they are submitted, the same as a poll
   ballot. Saving each tap straight to the profile made every half-formed slate
   look final, and left no moment where a manager says "these are mine". */
const pkSubKey=()=>pkKey()+'_sub';
/* HAS A SLATE EVER BEEN SENT THIS WEEK?

   Reopening clears the submitted flag but never the picks, and nothing that
   grades a slate looks at the flag — so the last sent slate goes on counting
   while a reopened one is being reconsidered, and a manager who changes their
   mind and then forgets to press Submit keeps the picks they had rather than
   losing the week. This is only so the screen can say so. */
function pkHadSubmitted(){
  const me=(_cpRows||[]).find(p=>_me&&p.id===_me.k1);
  if(me&&me[pkKey()]) return true;
  return !!localStorage.getItem(lsKey(pkKey()));
}
function pkSubmitted(){
  if(_pkSubmitted!=null) return _pkSubmitted;
  _pkSubmitted=localStorage.getItem(lsKey(pkSubKey()))==='1';
  return _pkSubmitted;
}
let _pkSubmitted=null;
async function pkPick(gi,teamId,el){
  if(_pkBusy||pkLocked()||pkSubmitted()) return;
  if(el&&el.blur) el.blur();
  const p=pkLoad();
  /* tapping the side you already have clears it, rather than doing nothing */
  if(String(p[gi])===String(teamId)) delete p[gi];
  else p[gi]=String(teamId);
  localStorage.setItem(lsKey(pkKey()),JSON.stringify(p));
  renderWeekPicks();
}
async function pkSubmit(){
  if(_pkBusy||pkLocked()) return;
  const p=pkLoad();
  if(Object.keys(p).length!==pkGames().length) return;
  _pkBusy=true; renderWeekPicks();
  if(_me){ try{ await gflPatchProfile(_me.k1,
    {[pkKey()]:JSON.stringify(p),[pkSubKey()]:'1'}); }catch(e){} }
  _pkSubmitted=true; localStorage.setItem(lsKey(pkSubKey()),'1');
  _pkBusy=false; renderWeekPicks();
}
/* reopening lets a slate be changed right up until the games start */
function pkReopen(){
  if(pkLocked()) return;
  _pkSubmitted=false; localStorage.removeItem(lsKey(pkSubKey()));
  /* clear it on the profile too, or the next sign-in would resurrect it */
  if(_me){ try{ gflPatchProfile(_me.k1,{[pkSubKey()]:''}); }catch(e){} }
  renderWeekPicks();
}

function renderWeekPicks(){
  const el=document.getElementById('pk-body'); if(!el) return;
  pkSync();
  const sec=document.getElementById('pk-sec');
  const games=pkGames();
  if(!games.length){ if(sec) sec.style.display='none'; return; }
  if(sec) sec.style.display='';
  const picks=pkLoad();
  const nm=id=>(_teams.find(t=>t.id===id)||{}).name||'Team';
  const ab=id=>{const t=_teams.find(x=>x.id===id);return (t&&t.abbrev)||teamInitials(nm(id));};
  const done=games.map((_,i)=>i).filter(i=>picks[i]!=null);
  const locked=pkLocked()||pkSubmitted();
  const sent=pkSubmitted();
  /* Nothing is pickable until the Matchup of the Week has been named. One game
     is worth double and the rest are worth one, so picking before you know
     which is which is a different game — the grid is shown, faded and inert, so
     the league can see the slate and see that it is waiting on something. */
  const waiting=!motwIsSet();
  /* The Matchup of the Week leads the stack. That section is hidden, so this is
     where the pick on it now lives — outlined in the home gold and worth double,
     which is the whole reason to call it out. */
  const motw=pkMotwIndex(games);
  const order=motw>=0?[motw,...games.map((_,i)=>i).filter(i=>i!==motw)]:games.map((_,i)=>i);
  /* A grid rather than a stack of dropdowns: every game is on screen at once
     and a pick is one tap on the side you want, with no opening or closing.
     Both sides of a game sit in one cell so the pair always reads together. */
  const cell=(i)=>{
    const g=games[i], mine=picks[i], big=i===motw;
    const side=t=>`<button type="button" class="pk-s${String(mine)===String(t)?' on':''}"
      ${locked||waiting?'disabled':`onclick="pkPick(${i},${t},this)"`} title="${nm(t).replace(/"/g,'&quot;')}">
      ${logoImg(t,'pk-logo')}<span>${ab(t)}</span></button>`;
    return `<div class="pk-g${mine!=null?' picked':''}${big?' pk-motw':''}${locked?' pk-lock':''}">
      ${big?`<div class="pk-badge"><i class="fa fa-fire"></i>Matchup of the Week · double</div>`:''}
      <div class="pk-sides2">${side(g.away.teamId)}<span class="pk-at">@</span>${side(g.home.teamId)}</div>
    </div>`;
  };
  /* the week number still labels the body's meta line, just not the heading */
  const wk=(_liveInfo||liveWeekInfo()||{}).week??'—';
  /* Submitted, and the week has not started: the grid folds to a line that
     opens to show the slate. Twelve tiles of finished business is a lot of
     screen for something already decided. */
  if(sent&&!pkLocked()){
    el.innerHTML=`
      <details class="cp-fold"${_pkFoldOpen?' open':''} ontoggle="foldKeep('pk',this)">
        <summary class="cp-fold-s"><i class="fa fa-check"></i>Picks are in
          <span class="cp-fold-n">${done.length} of ${games.length}</span>
          <i class="fa fa-chevron-down ms-chev"></i></summary>
        <div class="cp-fold-b">
          <div class="pk-grid">${order.map(cell).join('')}</div>
          <div class="pk-sent">
            <span>Change them any time before the first game of the week</span>
            <button class="pk-reopen" onclick="pkReopen()">Reopen</button>
          </div>
        </div>
      </details>`;
    orderHomeTodo();
    return;
  }
  el.innerHTML=`
    <div class="bk-meta"><span>Week ${wk}</span>
      <span class="bk-count">${waiting?'waiting':`${done.length} of ${games.length}`}</span></div>
    <div class="pk-grid${waiting?' pk-waiting':''}">${order.map(cell).join('')}</div>
    ${waiting
      ?`<div class="pk-wait"><i class="fa fa-hourglass-half"></i>Waiting on the Matchup
          of the Week. Picks open as soon as it is named.</div>`
      :pkLocked()?`<div class="bk-fin"><i class="fa fa-lock"></i>Locked — the week's games have started.</div>`
      :`<button class="pk-go" ${done.length===games.length&&!_pkBusy?'':'disabled'} onclick="pkSubmit()">
          ${_pkBusy?'Saving…':done.length===games.length?'Submit picks':`Pick all ${games.length}`}</button>`}
    ${!waiting&&!pkLocked()&&!sent&&pkHadSubmitted()?`<div class="pk-standing">
      <i class="fa fa-circle-check"></i>Your last submitted slate still counts until you
      send this one.</div>`:''}`;
  orderHomeTodo();
}
/* Picks close when the week's football does. weekHasStarted is the same signal
   the sportsbook and bet-cancellation use, so none of the three can disagree
   about whether a week is under way. */
function pkLocked(){ return weekHasStarted(); }
/* which game on the slate is the Matchup of the Week, if it is on this slate */
/* ── THE MATCHUP OF THE WEEK IS CHOSEN, NOT CONFIGURED ───────────────────────
   One manager picks it each week and the league reads their pick. It is stored
   as the two team ids on that manager's own profile document, which means it
   arrives with the profile list the homepage already fetches — no new
   collection, no new read, and everyone sees the same answer.

   Nothing else on the picks grid can be answered until it is set, because the
   grid's whole shape depends on it: one game is worth double and the rest are
   worth one, and picking before you know which is which is not the game. */
/* BFT's call, and it stays BFT's whoever the testing account happens to be.
   This used to read TEST_PROFILE, which was the same string by coincidence —
   moving testing onto its own account would have handed the league's Matchup of
   the Week to a profile nobody signs into. */
const MOTW_PICKER='bft';
/* THE PICK RESETS ON THE CLOCK, NOT ON ESPN.

   Keyed on the Tuesday it belongs to rather than on the scoring week. Those are
   not the same thing: liveWeekInfo advances when ESPN has finished scoring
   every game of a week, which is some time on Monday night or Tuesday and is
   theirs to decide, not ours. A pick that expires "whenever the data updates"
   is not a weekly job anybody can plan around.

   ntResultsDay is the same Tuesday-at-midnight stamp the cards already date
   themselves by, so the card's day and the key it writes now turn over in the
   same instant — the moment it becomes Tuesday. */
const motwInfo=()=>(_liveInfo||liveWeekInfo()||{});
const motwWeek=()=>Number(motwInfo().week)||0;
function motwStamp(t){
  const d=new Date(ntResultsDay(t==null?Date.now():t));
  const p=n=>String(n).padStart(2,'0');
  return `${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}`;
}
const motwPickKey=()=>`motw_${motwInfo().season||bkLeagueSeason()}_t${motwStamp()}`;
/* Filed by week as well as by Tuesday. Nothing reads this now — the board that
   did has been taken off — but it costs one field on one profile and it is the
   only record of which fixture was the Matchup in a given week. Dropping the
   write would mean that history simply stops accruing, and it cannot be
   reconstructed after the fact. */
const motwWeekKey=(season,wk)=>`motwwk_${season||motwInfo().season||bkLeagueSeason()}_w${wk||motwWeek()}`;
/* [idA,idB] once this Tuesday's pick is in, null until then */
function motwChosen(){
  const r=(_cpRows||[]).find(p=>p&&p.id===MOTW_PICKER);
  const m=/^(\d+)-(\d+)$/.exec(r?String(r[motwPickKey()]||'').trim():'');
  return m?[Number(m[1]),Number(m[2])]:null;
}
const motwIsSet=()=>!!motwChosen();
function pkMotwIndex(games){
  const pair=motwChosen();
  if(!pair) return -1;
  const [a,b]=pair.map(String);
  return games.findIndex(g=>{
    const ids=[g.home.teamId,g.away.teamId].map(String);
    return ids.includes(a)&&ids.includes(b);
  });
}
/* The picker's own write. Keyed on season and week, so last week's choice is
   still on the profile and this week starts empty. */
let _motwSetBusy=false,_motwArmed=null;
function motwArm(k){ _motwArmed=(_motwArmed===k?null:k); try{ renderNotifications(); }catch(e){} }
function motwConfirm(){
  if(!_motwArmed) return;
  const [a,b]=String(_motwArmed).split('-').map(Number);
  if(!a||!b) return;
  motwSet(a,b);
}
async function motwSet(a,b){
  if(!_me||_me.k1!==MOTW_PICKER||_motwSetBusy) return;
  _motwSetBusy=true; try{ renderNotifications(); }catch(e){}
  const val=`${a}-${b}`;
  /* Only file it by week when there is a week to file it under. Between seasons
     liveWeekInfo has no schedule to read and motwWeek comes back 0, which would
     write motwwk_2026_w0 — a key naming a week that does not exist. The Tuesday
     key is always written; the week key waits for a real week. */
  const wk=motwWeek();
  const patch={[motwPickKey()]:val};
  if(wk>0) patch[motwWeekKey()]=val;
  const r=await gflPatchProfile(_me.k1,patch);
  if(r&&r.ok){
    /* write it into the cached profile row too, so the picks grid unfades on
       this device without waiting for the next poll */
    const row=(_cpRows||[]).find(p=>p&&p.id===_me.k1);
    if(row) Object.assign(row,patch);
  }
  _motwSetBusy=false; _motwArmed=null;
  try{ renderNotifications(); }catch(e){}
  try{ renderWeekPicks(); }catch(e){}
  try{ orderHomeTodo(); }catch(e){}
}


/* ── NOTIFICATIONS ───────────────────────────────────────────────────────────
   The league's week, one card at a time. Everything here is derived from data
   the site already holds — schedules, profiles, the transaction log, the bet
   collection — rather than being written anywhere: there is no notification
   store to keep in sync, and nothing new is asked of Firestore. Rebuild the
   list and the same events come back with the same ids.

   Those ids are the whole trick. A notification's id is a description of the
   event it reports (blowout, season, week, winner), so dismissing one can be
   recorded as a single string and the same event will not come back next time
   the list is built. Dismissals live on the device: they are worth nothing to
   anyone else, and putting them on the profile would mean a write per swipe.

   One at a time, deliberately. A stack of eleven kinds of alert is a feed
   nobody reads; a single card with a count is a thing you deal with. */
const NT_KINDS={
  motw:   {icon:'fa-fire',        tone:'warm'},
  blowout:{icon:'fa-explosion',   tone:'warm'},
  wire:   {icon:'fa-stopwatch',   tone:'cool'},
  perfect:{icon:'fa-bullseye',    tone:'good'},
  plant:  {icon:'fa-seedling',    tone:'earth'},
  revive: {icon:'fa-receipt',     tone:'ember'},
  crown:  {icon:'fa-crown',       tone:'gold'},
  faab:   {icon:'fa-sack-dollar', tone:'gold'},
  rival:  {icon:'fa-hand-fist',   tone:'royal'},
  trade:  {icon:'fa-right-left',  tone:'cool'},
  parlay: {icon:'fa-dollar-sign', tone:'good'},
  streakW:{icon:'fa-arrow-trend-up',  tone:'good'},
  streakL:{icon:'fa-arrow-trend-down',tone:'ember'},
  trash:  {icon:'fa-comment-dots', tone:'hot'},
  standings:{icon:'fa-ranking-star', tone:'cool'},
};
/* ── HOW A CARD SHOWS ITS NEWS ───────────────────────────────────────────────
   These cards were paragraphs with the numbers bolded inside them, which meant
   reading a sentence to find out a score. Anything with a result in it draws
   the result instead: both crests, both names, both totals, and the margin —
   so the news is taken in at a glance and the line of text underneath only has
   to say what kind of thing happened.

   Every block here is built from owners rather than team ids, so a card about
   an old season still names and badges the franchise as it was then. */
function ntCrest(owner,size){
  const fr=(_franchises||[]).find(f=>f.owner===owner);
  try{ if(fr) return franchiseAvatar(fr,size||24,7); }catch(e){}
  return '<span class="nt-crest-x"></span>';
}
/* a two-line scoreboard: winner on top, loser under, margin down the side */
function ntScore(a,b,note){
  const m=Math.abs((a.pts||0)-(b.pts||0));
  const side=(s,cls)=>`<div class="nt-side ${cls}">
      <span class="nt-side-c">${ntCrest(s.owner,24)}</span>
      <span class="nt-side-n">${s.name}</span>
      <span class="nt-side-v">${(s.pts||0).toFixed(1)}</span>
    </div>`;
  return `<div class="nt-score">
    <div class="nt-sides">${side(a,'won')}${side(b,'lost')}</div>
    <div class="nt-marg"><span class="nt-marg-v">${m.toFixed(1)}</span>
      <span class="nt-marg-l">${note||'margin'}</span></div>
  </div>`;
}
/* what changed hands, both directions */
function ntSwap(a,b){
  const col=(s,dir)=>`<div class="nt-sw-side">
      <div class="nt-sw-h">${ntCrest(s.owner,20)}<span>${s.name}</span></div>
      <div class="nt-sw-l">${(s.got||[]).map(p=>`<span class="nt-sw-p">${p}</span>`).join('')}</div>
    </div>`;
  return `<div class="nt-swap">
    ${col(a)}
    <div class="nt-sw-arr"><i class="fa fa-right-left"></i></div>
    ${col(b)}
  </div>`;
}
/* a run of results, most recent last */
function ntStreak(owner,name,n,won){
  const pips=Array.from({length:Math.min(n,10)},()=>
    `<span class="nt-pip ${won?'w':'l'}">${won?'W':'L'}</span>`).join('');
  /* No count off to the right. The run of pips IS the count — five Ls beside a
     big red 5 is the same number twice, and the number was the loudest thing on
     a card whose news is the run. Crest, name and pips centre together. */
  return `<div class="nt-run">
    <div class="nt-run-h">${ntCrest(owner,24)}<span class="nt-run-n">${name}</span></div>
    <div class="nt-pips">${pips}</div>
  </div>`;
}
/* one number that is the whole story */
function ntStat(owner,name,value,label){
  return `<div class="nt-stat">
    <span class="nt-stat-c">${ntCrest(owner,26)}</span>
    <span class="nt-stat-n">${name}</span>
    <span class="nt-stat-v">${value}</span>
    <span class="nt-stat-l">${label}</span>
  </div>`;
}
let _ntSeen=null, _ntIdx=0, _ntTradeSeason=null, _ntDay=null, _ntDayTimer=null;
const ntKey=()=>lsKey('nt-seen');
/* What has been swiped away lives on the manager's profile, so clearing a card
   on a phone clears it on a laptop too. The device copy is kept alongside it
   only so the card is right before the network answers — the profile is the
   record and the two are merged, never replaced, or a swipe made on one device
   would be undone by opening another. */
function ntSeen(){
  if(_ntSeen) return _ntSeen;
  let a=[]; try{ a=JSON.parse(localStorage.getItem(ntKey())||'[]')||[]; }catch(e){}
  return (_ntSeen=new Set(a.filter(x=>typeof x==='string')));
}
function ntSaveSeen(extra){
  /* Only ids still being produced are worth keeping. Without this the list
     grows forever as weeks roll past and old events stop being generated. */
  let keep=[...ntSeen()];
  try{
    const live=new Set(ntAll().map(n=>n.id));
    keep=keep.filter(x=>live.has(x)||x===extra);
  }catch(e){}
  try{ localStorage.setItem(ntKey(),JSON.stringify(keep)); }catch(e){}
  if(_me) try{ gflPatchProfile(_me.k1,{ntSeen:JSON.stringify(keep)}); }catch(e){}
}
function ntMarkSeen(id){ ntSeen().add(id); ntSaveSeen(id); }
/* pulled once on sign-in, merged both ways so neither side loses a swipe */
async function ntSync(){
  if(!_me) return;
  try{
    const res=await gflFetchProfile(_me.k1);
    let srv=[]; try{ srv=JSON.parse((res&&res.data&&res.data.ntSeen)||'[]')||[]; }catch(e){}
    const before=ntSeen().size;
    srv.filter(x=>typeof x==='string').forEach(x=>ntSeen().add(x));
    if(ntSeen().size!==before){
      try{ localStorage.setItem(ntKey(),JSON.stringify([...ntSeen()])); }catch(e){}
      if(_activeTab==='home'){ renderNotifications(); try{ orderHomeTodo(); }catch(e){} }
    }
  }catch(e){}
}
/* Signing in or out: drop this manager's list and pull the new one. */
function ntReset(){ _ntSeen=null; _ntIdx=0; _ntUndo=[]; try{ ntSync(); }catch(e){}
  if(_activeTab==='home'){ try{ renderNotifications(); }catch(e){} } }
/* Putting every swiped card back. This cannot go through ntReset — that drops
   the cache and then calls ntSync, which reads the profile and puts every
   dismissed id straight back, so "start over" restored exactly what it had just
   cleared. The record has to be emptied on both sides and left alone. */
/* ── START OVER MEANS THIS WEEK, NOT EVERY WEEK ──────────────────────────────
   It used to empty the seen set outright, which brought back every card still
   being generated — a streak from three weeks ago, a trade from before that.
   Nobody asking to see this week again is asking for October.

   The league week runs Tuesday to Tuesday, and ntResultsDay already answers
   with the Tuesday a moment belongs to, so "this week" is every card dated on
   or after this one. Those come back; anything older stays cleared, and stays
   cleared on the profile too so a second device does not undo the distinction. */
async function ntRestart(){
  const weekStart=ntResultsDay(Date.now());
  let keep=[];
  try{
    const thisWeek=new Set(ntAll().filter(n=>(n.day||0)>=weekStart).map(n=>n.id));
    keep=[...ntSeen()].filter(id=>!thisWeek.has(id));
  }catch(e){ keep=[]; }
  _ntSeen=new Set(keep); _ntIdx=0; _ntUndo=[];
  try{ localStorage.setItem(ntKey(),JSON.stringify(keep)); }catch(e){}
  if(_me) try{ await gflPatchProfile(_me.k1,{ntSeen:JSON.stringify(keep)}); }catch(e){}
  try{ renderNotifications(); }catch(e){}
  try{ orderHomeTodo(); }catch(e){}
}

/* ── When a card is allowed to appear ────────────────────────────────────────
   The league runs on a Tuesday. Everything that comes out of a week's football
   — blowouts, one-score finishes, rivalry wins, perfect slates, streaks — is
   held until the Tuesday after that week, which is when the last game is in and
   when people actually want to read it. Everything else is dated to the day it
   happened and shows up that day: a Wednesday trade is a Wednesday card.

   Cards dated ahead of today are held back rather than dropped, so nothing has
   to be regenerated when the day turns over. */
const ntToday=()=>{const d=new Date(); d.setHours(0,0,0,0); return d.getTime();};
const ntDayOf=t=>{const d=new Date(t); d.setHours(0,0,0,0); return d.getTime();};
/* The Tuesday a week's football was read out on — the one on or before the
   moment given, not the one coming. Looking forward dated results that had
   already been played to a day still in the future, which held every one of
   them back for up to a week. */
function ntResultsDay(t){
  const d=new Date(t); d.setHours(0,0,0,0);
  const back=(d.getDay()-2+7)%7;             // 2 = Tuesday
  d.setDate(d.getDate()-back);
  return d.getTime();
}
function ntWhen(day){
  const today=ntToday();
  const diff=Math.round((today-day)/86400000);
  if(diff<=0) return 'Today';
  if(diff===1) return 'Yesterday';
  if(diff<7) return new Date(day).toLocaleDateString(undefined,{weekday:'long'});
  return new Date(day).toLocaleDateString(undefined,{month:'short',day:'numeric'});
}
/* re-render when the date rolls over, so "Today" stops lying and anything
   held for tomorrow appears without a reload */
function ntStartDayWatch(){
  if(_ntDayTimer) clearTimeout(_ntDayTimer);
  _ntDay=ntToday();
  const next=new Date(); next.setHours(24,0,0,30);
  _ntDayTimer=setTimeout(()=>{
    if(_activeTab==='home'){ try{ renderNotifications(); orderHomeTodo(); }catch(e){} }
    ntStartDayWatch();
  },Math.max(60000,next.getTime()-Date.now()));
}
/* the newest season with a game actually played */
function ntSeason(){
  for(let i=ALL_SEASONS.length-1;i>=0;i--){
    const m=_seasonMeta[ALL_SEASONS[i]];
    if(m&&(m.schedule||[]).some(x=>x.home&&x.away&&((x.home.totalPoints||0)>0||(x.away.totalPoints||0)>0)))
      return ALL_SEASONS[i];
  }
  return null;
}
/* the last week of that season where every game has a score on it */
function ntLastWeek(season){
  const meta=_seasonMeta[season]; if(!meta) return null;
  const byWeek={};
  (meta.schedule||[]).forEach(m=>{
    if(!m.home||!m.away) return;
    const w=Number(m.matchupPeriodId)||0; if(!w) return;
    (byWeek[w]||(byWeek[w]=[])).push(m);
  });
  let last=null;
  Object.keys(byWeek).map(Number).sort((a,b)=>a-b).forEach(w=>{
    if(byWeek[w].every(m=>(m.home.totalPoints||0)>0||(m.away.totalPoints||0)>0)) last=w;
  });
  return last==null?null:{week:last,games:byWeek[last],meta};
}
const ntName=(season,owner)=>mgSeasonName(season,owner);

/* ── the generators. Each one is wrapped by the caller, so a source that is
      not loaded yet costs a missing card rather than an empty homepage. ── */
function ntFromWeek(out){
  const season=ntSeason(); if(!season) return;
  const lw=ntLastWeek(season); if(!lw) return;
  const owners=lw.meta.owners||{};
  const day=ntResultsDay(Date.now());      // this week's football, read on Tuesday
  lw.games.forEach(mu=>{
    const hp=mu.home.totalPoints||0, ap=mu.away.totalPoints||0;
    if(hp===ap) return;
    const ho=owners[mu.home.teamId], ao=owners[mu.away.teamId];
    if(!ho||!ao||ho===ao) return;
    const homeWon=hp>ap;
    const win=homeWon?ho:ao, lose=homeWon?ao:ho;
    const margin=Math.abs(hp-ap);
    const wp=homeWon?hp:ap, lp=homeWon?ap:hp;
    const score=`${wp.toFixed(1)}–${lp.toFixed(1)}`;
    const W={owner:win,name:ntName(season,win),pts:wp};
    const L={owner:lose,name:ntName(season,lose),pts:lp};
    /* No body on these three. The scoreline underneath already carries both
       teams, both totals and the margin; "Week 3" under it was a caption on a
       picture that had nothing left to caption. */
    if(margin>=40) out.push({kind:'blowout', day,
      id:`bl:${season}:${lw.week}:${win}`,
      title:'Blown out',
      art:ntScore(W,L,'margin')});
    else if(margin<6) out.push({kind:'wire', day,
      id:`nw:${season}:${lw.week}:${win}`,
      title:'Down to the wire',
      art:ntScore(W,L,'apart')});
    /* a rivalry game is one of the three that made them rivals in the first
       place, so it is read off the rival list rather than guessed at */
    try{
      if(rivalsFor(win).some(r=>r.owner===lose)) out.push({kind:'rival', day,
        id:`rv:${season}:${lw.week}:${win}`,
        title:'Rivalry settled',
        art:ntScore(W,L,'margin')});
    }catch(e){}
  });
}
/* current run of wins or losses, read backwards through every season in order */
function ntStreaks(out){
  const season=ntSeason(); if(!season) return;
  const byOwner={};
  ALL_SEASONS.forEach(s=>{
    const meta=_seasonMeta[s]; if(!meta) return;
    const owners=meta.owners||{};
    (meta.schedule||[]).slice()
      .sort((a,b)=>(a.matchupPeriodId||0)-(b.matchupPeriodId||0))
      .forEach(mu=>{
        if(!mu.home||!mu.away) return;
        const hp=mu.home.totalPoints||0, ap=mu.away.totalPoints||0;
        if(hp===0&&ap===0) return;
        if(hp===ap) return;
        if(!postGameCounts(s,mu)) return;
        const ho=owners[mu.home.teamId], ao=owners[mu.away.teamId];
        if(!ho||!ao||ho===ao) return;
        (byOwner[ho]||(byOwner[ho]=[])).push(hp>ap);
        (byOwner[ao]||(byOwner[ao]=[])).push(ap>hp);
      });
  });
  Object.entries(byOwner).forEach(([owner,res])=>{
    if(res.length<5) return;
    const last=res[res.length-1];
    let n=0;
    for(let i=res.length-1;i>=0&&res[i]===last;i--) n++;
    if(n<5) return;
    const day=ntResultsDay(Date.now());
    const who=ntName(season,owner);
    out.push(last
      ?{kind:'streakW', day, id:`sw:${owner}:${n}`, title:`${n} in a row`,
        art:ntStreak(owner,who,n,true),
        body:`<b>${who}</b> have won <b>${n} games</b> straight.`}
      :{kind:'streakL', day, id:`sl:${owner}:${n}`, title:`${n} straight losses`,
        art:ntStreak(owner,who,n,false),
        body:`<b>${who}</b> have not won in <b>${n} games</b>.`});
  });
}
/* ── TUESDAY: NAME THE MATCHUP OF THE WEEK ───────────────────────────────────
   One card, for one manager, every Tuesday. Nobody else sees it, and until it
   is answered the league's picks grid sits faded — so it leads the stack rather
   than taking its turn in date order.

   It stays until the week's games kick off, not until it is swiped: this is a
   job rather than a notice, and clearing it without doing the job would leave
   eleven people waiting on a card that no longer exists. Once the pick is in,
   the card goes on its own. */
function ntMotwPick(out){
  if(!_me||_me.k1!==MOTW_PICKER) return;      // one manager's card
  if(motwIsSet()) return;                     // done for the week
  const games=(typeof pkGames==='function'?pkGames():[]).filter(g=>g.home&&g.away);
  if(!games.length) return;
  /* Nothing to name if the slate on screen has already been played. Between
     Tuesday midnight and ESPN finishing with Monday night, the live week can
     still be last week's finished games — this waits for the new fixtures
     rather than asking for a pick on a settled slate. */
  if(games.every(g=>(g.home.totalPoints||0)>0||(g.away.totalPoints||0)>0)) return;
  const wk=motwWeek();
  const nm=id=>(_teams.find(t=>t.id===id)||{}).name||'Team';
  const ab=id=>{const t=_teams.find(x=>x.id===id);return (t&&t.abbrev)||teamInitials(nm(id));};
  /* Two steps, not one. A tap used to send it, which is a lot of finality for
     a thing sitting between two crests on a phone — and it is the one call that
     rewrites everyone else's card. Tapping arms a fixture, Confirm commits it,
     and nothing reaches the profile in between. The sentence underneath is gone
     with it: a button that says what it will do says it better. */
  const sel=_motwArmed&&games.some(g=>_motwArmed===`${g.away.teamId}-${g.home.teamId}`)?_motwArmed:null;
  const armedName=(()=>{ if(!sel) return '';
    const [a,b]=sel.split('-').map(Number); return `${ab(a)} @ ${ab(b)}`; })();
  out.push({kind:'motw', day:ntResultsDay(Date.now()), pin:2,
    id:`motw:${motwInfo().season||bkLeagueSeason()}:${wk}`,
    title:`Name the Matchup of the Week`,
    art:`<div class="nt-motw">${games.map(g=>{
      const k=`${g.away.teamId}-${g.home.teamId}`;
      return `<button class="nt-mw${sel===k?' on':''}" ${_motwSetBusy?'disabled':''}
        onclick="motwArm('${k}')">
        <span class="nt-mw-s">${logoImg(g.away.teamId,'nt-mw-l')}<span>${ab(g.away.teamId)}</span></span>
        <span class="nt-mw-at">@</span>
        <span class="nt-mw-s">${logoImg(g.home.teamId,'nt-mw-l')}<span>${ab(g.home.teamId)}</span></span>
      </button>`;}).join('')}
      <button class="nt-mw-go" ${sel&&!_motwSetBusy?'':'disabled'} onclick="motwConfirm()">
        ${_motwSetBusy?'Setting…':sel?`Confirm ${armedName}`:'Pick a matchup'}</button>
    </div>`});
}
/* everyone's plant, from the profiles the homepage already reads */
function ntPlants(out){
  const rows=_cpRows||[]; if(!rows.length) return;
  rows.forEach(p=>{
    const t=Number(p.plantWatered||0); if(!t) return;
    /* each plant on its owner's own clock, so one manager on a short cycle
       cannot post a death card for eleven plants that are perfectly fine */
    const ms=plantMsFor(p.id);
    const cycle=PLANT_CYCLE_STEPS*ms;
    const gone=Date.now()-t;
    if(gone<PLANT_DRY_STEPS*ms) return;              // still alive, first time round
    const tid=Number(p.teamId||0);
    const nm=(_teams.find(x=>x.id===tid)||{}).name||p.id;
    /* how long it actually took, rather than a number written down once: five
       intervals of whatever this plant's interval is */
    const dry=plantDryLabel(PLANT_DRY_STEPS*ms);
    /* ── THE LATEST DEATH, NOT EVERY DEATH THERE HAS EVER BEEN ──────────────
       A plant revives every seven days now, so an abandoned one does not die
       once — it dies again every week, for as long as it is ignored. Building
       a card per death would hand somebody back from a month away a stack of
       four, and a year of it is fifty-two. The feed shows one card at a time
       and a dismissal is one id, so a stack like that is not news, it is a
       chore.

       Only the run it is in NOW is reported. The id still carries which one it
       was, so the next death after this is a new card rather than a repeat of
       a dismissed one. */
    const revivals=Math.floor(gone/cycle);
    const deathN=(gone-revivals*cycle)>=PLANT_DRY_STEPS*ms?revivals:revivals-1;
    out.push({kind:'plant', day:ntDayOf(t+deathN*cycle+PLANT_DRY_STEPS*ms),
      id:`pl:${p.id}:${t}:${deathN}`, title:'A plant has died',
      art:ntStat(_ownerMap[tid],nm,dry,'without water'),
      body:`<b>${nm}</b> let their plant die. How could they.`});

    /* ── AND THE BILL FOR BRINGING IT BACK ──────────────────────────────────
       The league gets to watch a plant die; the $20 is between the bank and
       its owner, so this card is only built for the manager being charged.

       It is built from the same three things plantFee charges on — a real
       clock, a completed cycle, a configured fee — and it is not built when
       any of them is missing. That is deliberate: a card that announces a
       charge the balance did not take is worse than no card at all, so the two
       are made to agree by construction rather than by being written twice.

       ONE REVIVAL, ONE SENTENCE. A plant dies, comes back, and costs $20 —
       that is the whole event, and it is the same event every time. Counting
       how many have happened since the last watering turns a $20 charge into a
       paragraph of arithmetic about totals and shortfalls and what is not owed,
       which is a worse way of saying $20 came off.

       So the card reports the revival that just happened and what THAT one
       cost. Earlier ones were settled when they happened and have nothing left
       to say. */
    if(!_me||String(p.id)!==String(_me.k1)) return;
    if(!revivals||ms!==PLANT_STEP_MS) return;
    if(!PLANT_REVIVAL_FEE()) return;
    const took=plantLastCharge(t,p.id);
    out.push({kind:'revive', day:ntDayOf(t+revivals*cycle),
      id:`plr:${p.id}:${t}:${revivals}`, title:'Plant Revival Fee',
      art:ntStat(_ownerMap[tid],nm,bucksFmt(took),'taken'),
      body:took>0
        ?`Your plant died and has been revived. <b>${bucksFmt(took)}</b> has come
          off your GFL Bucks.`
        :`Your plant died and has been revived. Your account was empty, so this
          one was free.`});
  });
}
/* "5 days" for a real plant, "1.3 min" for one on the short test cycle */
function plantDryLabel(ms){
  const d=ms/86400000;
  if(d>=1) return `${Math.round(d)} day${Math.round(d)===1?'':'s'}`;
  const h=ms/3600000;
  if(h>=1) return `${Math.round(h)} hr`;
  const mn=ms/60000;
  return `${mn>=10?Math.round(mn):+mn.toFixed(1)} min`;
}
/* a clean slate on the week's picks, for anyone in the league */
function ntPerfectPicks(out){
  const rows=_cpRows||[]; if(!rows.length) return;
  const season=ntSeason(); if(!season) return;
  const lw=ntLastWeek(season); if(!lw) return;
  const owners=lw.meta.owners||{};
  const winners={};
  lw.games.forEach(mu=>{
    const hp=mu.home.totalPoints||0, ap=mu.away.totalPoints||0;
    if(hp===ap) return;
    winners[[mu.home.teamId,mu.away.teamId].sort().join('-')]=String(hp>ap?mu.home.teamId:mu.away.teamId);
  });
  const nGames=Object.keys(winners).length; if(!nGames) return;
  const key=`pk_${season}_w${lw.week}`;
  rows.forEach(p=>{
    let picks=null; try{ picks=JSON.parse(p[key]||'null'); }catch(e){}
    if(!picks||typeof picks!=='object') return;
    const vals=Object.values(picks).map(String);
    if(vals.length!==nGames) return;
    const want=Object.values(winners);
    const hit=vals.filter(v=>want.includes(v)).length;
    if(hit!==nGames) return;
    const nm=(_teams.find(x=>x.id===Number(p.teamId||0))||{}).name||p.id;
    /* the stat block says who and how many, which is the whole card — the
       sentence under it was the same two facts in prose */
    out.push({kind:'perfect', day:ntResultsDay(Date.now()), id:`pp:${season}:${lw.week}:${p.id}`,
      title:'A perfect slate',
      art:ntStat(_ownerMap[Number(p.teamId||0)],nm,`${nGames} / ${nGames}`,'every game called')});
  });
}
/* a waiver claim that cost real money */
function ntBigFaab(out){
  (_transactions||[]).forEach(t=>{
    const bid=Number(t.bid||t.bidAmount||0);
    if(!(bid>100)) return;
    const nm=t.teamName||(_teams.find(x=>x.id===Number(t.teamId))||{}).name||'Someone';
    const pl=t.playerName||t.player||'a player';
    out.push({kind:'faab', day:ntDayOf(Number(t.date||t.proposedDate)||Date.now()),
      id:`fb:${t.id||(nm+':'+pl+':'+bid)}`,
      title:'Big money on the wire',
      body:`<b>${nm}</b> spent <b>$${bid}</b> of FAAB on <b>${pl}</b>.`});
  });
}
/* The name of a trade's vote. Shared, because the notification writes under it
   and the trades tab reads it back — two spellings of this would silently show
   an empty tally next to a trade the league had voted on. */
function ntTradeVoteId(season,tr){
  const teams=tr.teams||[];
  return `td:${season}:${tr.id||teams.map(t=>t.teamId).join('-')+':'+(tr.date||'')}`;
}
/* the trade board, with a vote on who came out ahead */
function ntTrades(out){
  /* THE SEASON BEING PLAYED, NOT THE LAST ONE WITH A SCORE IN IT. ntSeason()
     answers with the newest year that has points on the board, which from
     February until the first Sunday in September is LAST year — so a trade
     agreed in August looked for its card against 2025's ledger and never found
     one. Every other generator here is about results, where ntSeason is right;
     a trade is about right now. */
  const season=(typeof sbBoardSeason==='function')?sbBoardSeason():ntSeason();
  if(!season) return;
  const cached=_tradeCache&&_tradeCache[season];
  if(!cached){
    /* pulled once, then the card repaints itself when it lands */
    if(_ntTradeSeason!==season&&typeof fetchSeasonTrades==='function'){
      _ntTradeSeason=season;
      fetchSeasonTrades(season).then(()=>{ if(_activeTab==='home') renderNotifications(); }).catch(()=>{});
    }
    return;
  }
  /* This week's trades and no others. The card asks a question about a trade
     that has just happened, and a season's worth of them arriving at once is a
     back catalogue rather than news. Anything agreed since Tuesday shows, later
     ones stack on top of earlier ones as they land, and the whole set drops off
     when the next Tuesday turns over. Where the answers live after that is the
     trades tab, which draws the same tally on the trade itself. */
  const thisWeek=ntResultsDay(Date.now());
  (cached.trades||[]).forEach(tr=>{
    const teams=tr.teams||[]; if(teams.length<2) return;
    const when=Number(tr.date||tr.proposedDate)||0;
    if(!when||ntResultsDay(when)!==thisWeek) return;
    const id=ntTradeVoteId(season,tr);
    const nm=t=>(_teams.find(x=>x.id===Number(t.teamId))||{}).name||('Team '+t.teamId);
    const own=t=>_ownerMap[Number(t.teamId)];
    const got=t=>(t.players||[]).map(p=>p.n).filter(Boolean);
    out.push({kind:'trade', day:ntDayOf(Number(tr.date||tr.proposedDate)||Date.now()), id, title:'A trade went through',
      art:ntSwap({owner:own(teams[0]),name:nm(teams[0]),got:got(teams[0])},
                 {owner:own(teams[1]),name:nm(teams[1]),got:got(teams[1])}),
      body:_me
        ?`There has been a trade between <b>${nm(teams[0])}</b> and <b>${nm(teams[1])}</b>. Who won?
           <span class="nt-final">Your decision cannot be changed later.</span>`
        :`There has been a trade between <b>${nm(teams[0])}</b> and <b>${nm(teams[1])}</b>.`,
      /* A vote card refuses to clear until it is answered, and signed out there
         is no profile to answer onto — ntMyVote returns empty for everybody, so
         the card was locked shut for a visitor and the stack shows one card at a
         time. It stops being a question when there is nobody to ask. */
      ...(_me?{vote:{id, sides:[{k:String(teams[0].teamId),label:nm(teams[0])},
                       {k:String(teams[1].teamId),label:nm(teams[1])}]}}:{})});
  });
}
/* a parlay waiting on an answer, which is the one card with somewhere to go */
function ntParlays(out){
  if(!_me) return;
  betsMine().filter(b=>b.status==='invite'&&!inviteLapsed(b)).forEach(b=>{
    out.push({kind:'parlay', day:ntDayOf(Number(b.ts)||Date.now()), id:`pi:${b.id}`, title:'You have been asked in',
      art:ntStat(_ownerMap[Number(b.team||0)]||b.invitedBy,betAccountName(b.invitedBy),
        bucksFmt(b.stake),b.legs.length>1?`a ${b.legs.length}-leg parlay`:'a single'),
      go:'bets'});
  });
}
/* Somebody taking over top spot in one of the all-time tables. There is no
   history to compare against, so the current leader is remembered on the device
   and a card is raised only when the name changes — the first build records the
   holders quietly rather than announcing eight leaders nobody just took. */
/* `fmt` is what the card prints. The crown card used to say it in a sentence —
   "X now leads the league in all-time points" — and carried no art at all; it
   takes the same stat block every other card of its shape uses instead, where
   the number is the headline and the table it belongs to is the label. */
const NT_CROWNS=[
  {k:'w',    label:'all-time wins',        val:at=>at.w,
   fmt:v=>String(Math.round(v))},
  {k:'pf',   label:'all-time points',      val:at=>at.pf,
   fmt:v=>Math.round(v).toLocaleString()},
  {k:'rings',label:'championships',        val:at=>at.rings,
   fmt:v=>String(Math.round(v))},
  {k:'pct',  label:'all-time win rate',    val:at=>{const g=at.w+at.l+at.t; return g?at.w/g:0;},
   fmt:v=>(v*100).toFixed(1)+'%'},
];
function ntCrowns(out){
  if(!_franchises||!_franchises.length) return;
  const prevRaw=localStorage.getItem(lsKey('nt-lead'));
  let prev=null; try{ prev=JSON.parse(prevRaw||'null'); }catch(e){}
  const now={};
  NT_CROWNS.forEach(c=>{
    let best=null,bv=-Infinity;
    _franchises.forEach(f=>{
      let at=null; try{ at=franchiseAllTime(f.owner); }catch(e){}
      if(!at) return;
      const v=c.val(at);
      if(v>bv){ bv=v; best=f.owner; }
    });
    if(best) now[c.k]=best;
  });
  try{ localStorage.setItem(lsKey('nt-lead'),JSON.stringify(now)); }catch(e){}
  if(!prev) return;                       // first run: learn, do not announce
  NT_CROWNS.forEach(c=>{
    if(!now[c.k]||!prev[c.k]||now[c.k]===prev[c.k]) return;
    let at=null; try{ at=franchiseAllTime(now[c.k]); }catch(e){}
    const val=at?c.fmt(c.val(at)):'—';
    out.push({kind:'crown', day:ntToday(), id:`cr:${c.k}:${now[c.k]}`, title:'New at the top',
      art:ntStat(now[c.k],ntName(ntSeason(),now[c.k]),val,c.label)});
  });
}

/* One of everything, so the whole set can be looked at out of season. Turned
   on and off in config; the ids are fixed strings, so a demo card that has been
   swiped away stays away. */
/* One card of every kind, so the whole set can be looked over before a season
   is running. Owners are read off the real franchise list where there is one,
   so the crests and names are the league's own. */
function ntDemo(out){
  if(!isTestProfile()||!(_CFG.notifications||{}).demo) return;
  const d=ntToday(), day=n=>d-n*86400000;
  const T2=ntResultsDay(Date.now());
  const fr=_franchises||[];
  const o=i=>(fr[i%Math.max(1,fr.length)]||{}).owner||('demo'+i);
  const nm=i=>(fr[i%Math.max(1,fr.length)]||{}).name||'A team';
  const S=(i,pts)=>({owner:o(i),name:nm(i),pts});
  /* the standings card, with movement made up so the arrows can be seen */
  {
    const moves=[2,0,-1,3,0,0,-2,1,0,-3,4,-4];
    const recs=['5–1','5–1','4–2','4–2','3–3','3–3','3–3','2–4','2–4','2–4','1–5','1–5'];
    const rows=fr.slice(0,12).map((f,i)=>({owner:f.owner, name:f.name, rank:i+1,
      move:moves[i]||0, rec:recs[i]||'0–0', pf:0}));
    if(rows.length) out.push({kind:'standings', day:T2, pin:1, id:'demo:standings',
      title:'Where everyone stands · week 6',
      art:ntStandingsArt(rows),
      body:'<b>'+rows.filter(r=>r.move).length+'</b> teams moved.'});
  }
  out.push(
   {kind:'trash',day:d,id:'demo:trash',title:'From '+nm(3),
    body:'<b>'+nm(3)+'</b> says: “Enjoy the bye week, you will need the rest.”'},

   {kind:'blowout',day:T2,id:'demo:blowout',title:'Blown out',
    art:ntScore(S(3,168.2),S(6,115.8),'margin')},

   {kind:'wire',day:T2,id:'demo:wire',title:'Down to the wire',
    art:ntScore(S(0,121.4),S(4,120.6),'apart')},

   {kind:'rival',day:T2,id:'demo:rival',title:'Rivalry settled',
    art:ntScore(S(1,143.0),S(2,98.7),'margin')},

   {kind:'perfect',day:T2,id:'demo:perfect',title:'A perfect slate',
    art:ntStat(o(5),nm(5),'6 / 6','every game called')},

   {kind:'streakW',day:T2,id:'demo:streakw',title:'6 in a row',
    art:ntStreak(o(3),nm(3),6,true), body:'<b>'+nm(3)+'</b> have won <b>6 games</b> straight.'},

   {kind:'streakL',day:T2,id:'demo:streakl',title:'5 straight losses',
    art:ntStreak(o(7),nm(7),5,false), body:'<b>'+nm(7)+'</b> have not won in <b>5 games</b>.'},

   {kind:'plant',day:day(1),id:'demo:plant',title:'A plant has died',
    art:ntStat(o(8),nm(8),'6 days','without water'),
    body:'<b>'+nm(8)+'</b> let their plant die. How could they.'},

   {kind:'crown',day:day(2),id:'demo:crown',title:'New at the top',
    art:ntStat(o(0),nm(0),'8,412.6','all-time points')},

   {kind:'faab',day:day(3),id:'demo:faab',title:'Big money on the wire',
    art:ntStat(o(6),nm(6),'$147','on Jaylen Wright'), body:'Next-highest bid was $38.'},

   {kind:'parlay',day:d,id:'demo:parlay',title:'You have been asked in',
    art:ntStat(o(3),nm(3),'$75','a 3-leg parlay'),
    go:'bets'},

   {kind:'trade',day:d,id:'demo:trade',title:'A trade went through',
    art:ntSwap({owner:o(7),name:nm(7),got:['Bijan Robinson','Jake Ferguson']},
               {owner:o(9),name:nm(9),got:['Puka Nacua','a 2027 2nd']}),
    body:'There has been a trade between <b>'+nm(7)+'</b> and <b>'+nm(9)+'</b>. Who won?',
    vote:{id:'demo_trade',sides:[{k:'a',label:nm(7)},{k:'b',label:nm(9)}]}},
  );
}
/* ── TRASH TALK ──────────────────────────────────────────────────────────────
   A line sent to the manager you are playing this week. It is written onto
   *their* profile document, one field per sender, and read back out of your own
   — so it needs no new collection and no new rules, the same trick the poll and
   the picks already use.

   One at a time. The field is the whole state: while it holds something, the
   sender cannot write another, and swiping the card away clears it, which is
   what frees them to send again. That is deliberately the recipient's call
   rather than a timer — the point of the limit is that it is answered. */
const ttField=from=>'tt_'+keySlug(from);
function ttParse(v){ try{ const o=JSON.parse(v||'null'); return (o&&o.t)?o:null; }catch(e){ return null; } }
/* every line currently sitting on my own profile */
let _ttIn={}, _ttOutBusy=false, _ttErr='';
function ntTrash(out){
  Object.entries(_ttIn||{}).forEach(([from,m])=>{
    if(!m||!m.t) return;
    out.push({id:'tt:'+from+':'+m.ts, kind:'trash', day:ntDayOf(m.ts),
      title:'From '+betAccountName(from),
      body:'<b>'+betAccountName(from)+'</b> says: “'+String(m.t).replace(/[<>]/g,'')+'”'});
  });
}
/* Swiping a trash-talk card clears the field it came from, which is what lets
   that manager send another. Every other kind only records the swipe. */
async function ttClear(from){
  delete _ttIn[from];
  if(_me) try{ await gflPatchProfile(_me.k1,{[ttField(from)]:''}); }catch(e){}
}
async function ttSync(){
  if(!_me) return;
  try{
    const res=await gflFetchProfile(_me.k1);
    const d=(res&&res.data)||{};
    const next={};
    Object.keys(d).forEach(k=>{ if(!k.startsWith('tt_')) return;
      const m=ttParse(d[k]); if(m) next[k.slice(3)]=m; });
    if(JSON.stringify(next)!==JSON.stringify(_ttIn)){
      _ttIn=next;
      if(_activeTab==='home'){ try{ renderNotifications(); }catch(e){} try{ orderHomeTodo(); }catch(e){} }
    }
  }catch(e){}
}
/* whether this manager still has a line sitting unread on the opponent */
let _ttPending=null;
async function ttCheck(oppK1){
  if(!_me||!oppK1) return;
  try{
    const res=await gflFetchProfile(oppK1);
    const v=(res&&res.data)?res.data[ttField(_me.k1)]:'';
    const now=!!ttParse(v);
    if(now!==_ttPending){ _ttPending=now; if(_activeTab==='week') renderWeek(); }
  }catch(e){}
}
async function ttSend(oppK1){
  const box=document.getElementById('tt-text');
  if(!box||!_me||_ttOutBusy) return;
  const text=String(box.value||'').trim().slice(0,240);
  if(!text){ _ttErr='Write something first.'; renderWeek(); return; }
  _ttOutBusy=true; _ttErr=''; renderWeek();
  const res=await gflPatchProfile(oppK1,{[ttField(_me.k1)]:JSON.stringify({t:text,ts:Date.now()})});
  _ttOutBusy=false;
  if(res&&res.ok){ _ttPending=true; }
  else _ttErr=(res&&res.error==='quota')?'Firestore is over quota — try later.':'Could not send that.';
  renderWeek();
}
function ttBoxHTML(oppK1,oppName){
  if(!_me||!oppK1) return '';
  if(_ttPending===null){ ttCheck(oppK1); }
  if(_ttPending) return `<div class="tt-box tt-sent">
    <div class="tt-h"><i class="fa fa-paper-plane"></i>Message sent</div>
    <div class="tt-note">${oppName} has one from you waiting. You can send another
      once they have cleared it.</div>
  </div>`;
  return `<div class="tt-box">
    <div class="tt-h"><i class="fa fa-comment-dots"></i>Say something to ${oppName}</div>
    <textarea id="tt-text" class="tt-text" rows="2" maxlength="240"
      placeholder="One message at a time — make it count…"></textarea>
    ${_ttErr?`<div class="tt-err">${_ttErr}</div>`:''}
    <button class="tt-send" ${_ttOutBusy?'disabled':''}
      onclick="ttSend('${String(oppK1).replace(/'/g,"\\'")}')">
      <i class="fa fa-paper-plane"></i>${_ttOutBusy?'Sending…':'Send'}</button>
  </div>`;
}

/* ── TUESDAY: WHERE EVERYONE STANDS ──────────────────────────────────────────
   The week's football is in, so the table has moved. This is the one card that
   reports on all twelve at once rather than on a single result, which is why it
   leads the stack rather than taking its turn in it.

   Standings are rebuilt twice — through last week and through the week before —
   and the difference is the movement. Ties on record break on points for, the
   same way the league's own table does. */
function ntTable(season,throughWeek){
  const meta=_seasonMeta[season]; if(!meta) return null;
  const owners=meta.owners||{};
  const rec={};
  (meta.schedule||[]).forEach(m=>{
    const w=Number(m.matchupPeriodId)||0;
    if(!w||w>throughWeek||!m.home||!m.away) return;
    const hp=m.home.totalPoints||0, ap=m.away.totalPoints||0;
    if(hp===0&&ap===0) return;
    const ho=owners[m.home.teamId], ao=owners[m.away.teamId];
    if(!ho||!ao||ho===ao) return;
    const r=o=>rec[o]||(rec[o]={o,w:0,l:0,t:0,pf:0});
    const H=r(ho), Aw=r(ao);
    H.pf+=hp; Aw.pf+=ap;
    if(hp>ap){ H.w++; Aw.l++; } else if(ap>hp){ Aw.w++; H.l++; } else { H.t++; Aw.t++; }
  });
  const rows=Object.values(rec);
  if(rows.length<2) return null;
  rows.sort((a,b)=>{ const ga=a.w+a.l+a.t, gb=b.w+b.l+b.t;
    const pa=ga?a.w/ga:0, pb=gb?b.w/gb:0;
    return pb-pa || b.pf-a.pf; });
  const at={}; rows.forEach((r,i)=>at[r.o]=i+1);
  return {rows,at};
}
function ntStandingsRows(season,week){
  const now=ntTable(season,week), was=ntTable(season,week-1);
  if(!now) return null;
  return now.rows.map((r,i)=>{
    const prev=was?was.at[r.o]:null;
    return {owner:r.o, name:ntName(season,r.o), rank:i+1,
      move:(prev==null?0:prev-(i+1)),
      rec:`${r.w}–${r.l}${r.t?'–'+r.t:''}`, pf:r.pf};
  });
}
/* drawn as a table: twelve rows of prose would be unreadable */
function ntStandingsArt(rows){
  return `<div class="nts">
    ${rows.map(r=>{
      const dir=r.move>0?'up':r.move<0?'dn':'flat';
      const arrow=r.move>0?'fa-caret-up':r.move<0?'fa-caret-down':'fa-minus';
      return `<div class="nts-row">
        <span class="nts-rk">${r.rank}</span>
        <span class="nts-c">${ntCrest(r.owner,20)}</span>
        <span class="nts-n">${r.name}</span>
        <span class="nts-rec">${r.rec}</span>
        <span class="nts-mv ${dir}"><i class="fa ${arrow}"></i>${r.move?Math.abs(r.move):''}</span>
      </div>`;}).join('')}
  </div>`;
}
function ntStandings(out){
  const season=ntSeason(); if(!season) return;
  const lw=ntLastWeek(season); if(!lw||lw.week<2) return;
  const rows=ntStandingsRows(season,lw.week); if(!rows) return;
  const movers=rows.filter(r=>r.move!==0).length;
  out.push({kind:'standings', day:ntResultsDay(Date.now()), pin:1,
    id:`st:${season}:${lw.week}`,
    title:`Where everyone stands · week ${lw.week}`,
    art:ntStandingsArt(rows),
    body:movers?`<b>${movers}</b> team${movers===1?'':'s'} moved.`:'Nobody moved this week.'});
}

function ntAll(){
  const out=[];
  [ntMotwPick,ntStandings,ntParlays,ntFromWeek,ntPerfectPicks,ntPlants,ntCrowns,ntBigFaab,ntTrades,ntStreaks,ntTrash,ntDemo]
    .forEach(fn=>{ try{ fn(out); }catch(e){} });
  /* anything with no date of its own belongs to today */
  out.forEach(n=>{ if(!n.day) n.day=ntToday(); });
  return out;
}
/* Nothing appears before its day, and the newest sits first — the week's
   results on Tuesday, then whatever has happened since, in order. */
function ntLive(){
  const today=ntToday();
  /* pinned first, then newest: the Tuesday standings card is the week's
     summary and belongs at the top of the stack rather than in date order */
  /* pin is a rank now, not a flag: the standings card sits at 1 and the
     Matchup of the Week card at 2, so on a Tuesday the one that blocks the rest
     of the league comes first. */
  let list=ntAll().filter(n=>n.day<=today)
    .sort((a,b)=>(b.pin||0)-(a.pin||0) || b.day-a.day);
  /* Preview: one of each kind and no more. The real generators produce as many
     as the league earns — fourteen trades in a season is fourteen cards — which
     is right in play and useless when the point is to look the set over.

     The thinning has to happen before the swiped ones are taken out, not after.
     Filtering first meant clearing the one trade card promoted the next trade
     card into its place, so a kind could be swiped away over and over and the
     feed looked full of duplicates. Choosing the representative first means
     each kind has exactly one card, and clearing it clears that kind. */
  if(isTestProfile()&&(_CFG.notifications||{}).demo){
    const kinds=new Set();
    list=list.filter(n=>{ if(kinds.has(n.kind)) return false; kinds.add(n.kind); return true; });
  }
  /* A VOTE THAT HAS BEEN CAST TAKES ITS CARD WITH IT.

     Answered vote cards are dropped here rather than being marked as seen,
     which is what makes them final: ntSeen is what Undo and Start over put
     back, and neither can reach a card that is no longer being generated. The
     verdict lives in tv_<id> on the profile, so it survives both. */
  list=list.filter(n=>!(n.vote&&ntMyVote(String(n.vote.id).replace(/[^a-zA-Z0-9_]/g,'_'))));
  return list.filter(n=>!ntSeen().has(n.id));
}
/* the card counts as done once the stack is empty, which is what sinks it */
function ntDone(){ return ntLive().length===0; }

/* ── the card ───────────────────────────────────────────────────────────── */
/* ── WHO VOTED WHICH WAY, FROM BOTH RECORDS AT ONCE ──────────────────────────
   Keyed by voter and not counted, which is what makes the union safe: a vote
   cannot be changed once cast, so the archive and the live profile can only
   ever agree about somebody they both know. Adding two tallies together would
   count every one of them twice.

   The archive is the floor and the profiles are laid on top, so a vote cast
   since the last weekly run still shows immediately. */
function ntVoteSides(vid){
  const by={};
  const arc=_tradeVotes[vid];
  if(arc) Object.keys(arc).forEach(v=>{ const sd=String(arc[v]??'').trim(); if(sd) by[v]=sd; });
  (_cpRows||[]).forEach(p=>{ const sd=String(p['tv_'+vid]||'').trim(); if(sd) by[p.id]=sd; });
  return by;
}
/* the voter's own team, for the crest under the side they picked. Their profile
   if it is loaded, the archive's map if it is not. */
function voterTeamId(v){
  const p=(_cpRows||[]).find(x=>x&&x.id===v);
  const t=p?Number(p.teamId||0):Number(_tradeVoterTeam[v]||0);
  return t||0;
}
function ntVoteTally(vid){
  const t={};
  Object.values(ntVoteSides(vid)).forEach(sd=>{ t[sd]=(t[sd]||0)+1; });
  return t;
}
function ntMyVote(vid){
  if(!_me) return '';
  return String(ntVoteSides(vid)[_me.k1]||'');
}
/* Change it as often as you like while the card is in front of you — it is the
   swipe that commits, not the tap. Once the card is cleared there is no way back
   to it and no other screen renders these buttons, so the answer stands as
   whatever it was when you let the card go. */
async function ntVote(vid,side){
  if(!_me){ openSignIn(); return; }
  const fieldSafe=String(vid).replace(/[^a-zA-Z0-9_]/g,'_');
  try{ await gflPatchProfile(_me.k1,{['tv_'+fieldSafe]:String(side)}); }catch(e){}
  const me=(_cpRows||[]).find(p=>p.id===_me.k1);
  if(me) me['tv_'+fieldSafe]=String(side);
  /* The card goes as the answer lands — no swipe, and nothing to swipe back.
     Its id comes off the undo stack too, or Undo would offer to restore a card
     that ntLive no longer produces and the count would be a lie. */
  _ntUndo=_ntUndo.filter(id=>id!==('tv:'+fieldSafe));
  try{ ntTrimUndo(); }catch(e){}
  renderNotifications();
  try{ orderHomeTodo(); }catch(e){}
}
/* Drop anything from the undo stack that is no longer on the board at all. */
function ntTrimUndo(){
  const live=new Set(ntAll().map(n=>n.id));
  _ntUndo=_ntUndo.filter(id=>live.has(id));
}
function ntGo(where){
  if(where==='bets'){ switchTab('book'); try{ sbSetView('mine'); }catch(e){} }
}
/* Every card swiped away this session, newest last, so undo walks back through
   them one at a time until there is nothing left to put back. Not persisted:
   it is a record of what you did on this screen, not of what has been cleared —
   that is what the seen set is for, and Start Over is how you empty it. */
let _ntUndo=[];
function ntUndo(){
  const id=_ntUndo.pop(); if(!id) return;
  ntSeen().delete(id);
  ntSaveSeen();
  /* land on the card that just came back rather than wherever the stack had
     moved on to while it was gone */
  const i=ntLive().findIndex(n=>n.id===id);
  if(i>=0) _ntIdx=i;
  renderNotifications();
  try{ orderHomeTodo(); }catch(e){}
}
/* A card carrying a vote is not clearable until it has one. It is the only kind
   that asks the manager for something rather than telling them something, and a
   question that can be flicked away unanswered is not a question. */
function ntNeedsVote(n){
  if(!n) return false;
  /* the Matchup of the Week card is the same shape of obligation as a trade
     vote: it holds the league up, so it does not clear until it is answered */
  if(n.kind==='motw') return !motwIsSet();
  if(!n.vote) return false;
  return !ntMyVote(String(n.vote.id).replace(/[^a-zA-Z0-9_]/g,'_'));
}
function ntLockedId(id){
  try{ return ntNeedsVote(ntLive().find(x=>x.id===id)); }catch(e){ return false; }
}
function ntDismiss(id){
  if(ntLockedId(id)) return;
  /* a trash-talk card is the sender's one slot: clearing it is what gives it
     back to them, so the swipe has to reach the field and not just the log */
  const isTT=String(id).startsWith('tt:');
  if(isTT){
    const from=String(id).split(':')[1];
    try{ ttClear(from); }catch(e){}
  }
  /* No undo on a trash-talk card. Clearing it handed the sender their slot
     back, and they may already have used it — putting the card back on this
     screen would not take that away again, so the button would be lying. It
     does not break the chain either: the swipes either side of it are still on
     the stack and still come back in order. */
  if(!isTT&&_ntUndo[_ntUndo.length-1]!==id) _ntUndo.push(id);
  ntMarkSeen(id);
  const n=ntLive().length;
  if(_ntIdx>=n) _ntIdx=Math.max(0,n-1);
  renderNotifications();
  try{ orderHomeTodo(); }catch(e){}
}
/* Nothing calls this since the chevrons came off the card — kept because the
   stack still has an index and stepping it is the obvious thing any future
   control would want to do. */
function ntStep(d){
  const n=ntLive().length; if(!n) return;
  _ntIdx=(_ntIdx+d+n)%n;
  renderNotifications();
}
function renderNotifications(){
  const el=document.getElementById('nt-body'); if(!el) return;
  const cnt=document.getElementById('nt-count');
  /* The stack is this manager's: their parlay invitations, trash talk sent to
     them, the Matchup of the Week if it is their call, and — the part that
     needs a profile most — what they have already swiped away. Signed out
     there is nowhere to record a dismissal and nothing personal to show, so
     the deck was a league-wide feed that could not be cleared. */
  if(!_me){
    if(cnt) cnt.textContent='';
    el.innerHTML=`<div class="home-signin">
      <div class="home-signin-t">Sign in for your notifications — trades to judge, invitations, and trash talk aimed at you.</div>
      <button class="home-signin-b" onclick="openSignIn()">Sign in</button>
    </div>`;
    return;
  }
  const list=ntLive();
  if(cnt) cnt.textContent=list.length?String(list.length):'';
  if(!list.length){
    /* Undo belongs here most of all: clearing the last card is the swipe
       people most often did not mean, and this is the screen it leaves you on. */
    el.innerHTML=`<div class="nt-clear"><i class="fa fa-check"></i>
      <span>Nothing new. You are all caught up.</span></div>
      ${''/* No undo here. It belongs above a stack, and there is no stack — this
             screen is the end of the run, and Start Over is the control that
             fits it: one button that puts everything back, rather than one that
             walks back through what was just cleared. */}
      ${ntSeen().size?`<div class="home-redo-row">${homeRestartBtn('nt')}</div>`:''}`;
    return;
  }
  if(_ntIdx>=list.length) _ntIdx=0;
  const n=list[_ntIdx];
  const meta=NT_KINDS[n.kind]||{icon:'fa-bell',tone:'cool'};
  const fieldSafe=n.vote?String(n.vote.id).replace(/[^a-zA-Z0-9_]/g,'_'):'';
  const tally=n.vote?ntVoteTally(fieldSafe):null;
  const mine=n.vote?ntMyVote(fieldSafe):'';
  const total=tally?Object.values(tally).reduce((a,b)=>a+b,0):0;
  const needVote=ntNeedsVote(n);
  /* The count and the undo sit above the stack rather than under it. They are
     about the stack, not about the card — and under a card whose height changes
     with every swipe they moved every time, which is the worst place to put the
     one control you reach for after a swipe you did not mean. */
  /* One card behind the one you are on, offset and dimmed — enough to say
     there is another underneath without drawing thirteen of them. It carries
     the next card's tone and nothing else: its job is depth, and a legible
     second card behind the first would be two cards to read rather than one. */
  const nxt=list[(_ntIdx+1)%list.length];
  const nMeta=(nxt&&nxt!==n)?(NT_KINDS[nxt.kind]||{tone:'cool'}):null;
  el.innerHTML=`
    <div class="nt-foot nt-foot-top">
      <span class="nt-pos">${_ntIdx+1} of ${list.length}<span class="nt-hint">swipe to clear</span></span>
      ${_ntUndo.length?`<button class="nt-undo" onclick="ntUndo()">
        <i class="fa fa-rotate-left"></i>Undo${_ntUndo.length>1?` <span class="nt-undo-n">${_ntUndo.length}</span>`:''}</button>`:''}
    </div>
    <div class="nt-deck">
    ${nMeta?`<div class="nt-card nt-${nMeta.tone} nt-under" aria-hidden="true"></div>`:''}
    <div class="nt-card nt-${meta.tone}" id="nt-card" data-id="${String(n.id).replace(/"/g,'&quot;')}"
      ${needVote?'data-lock="1"':''}>
      <div class="nt-top">
        <span class="nt-ico"><i class="fa ${meta.icon}"></i></span>
        <span class="nt-t">${n.title}</span>
        <span class="nt-day">${ntWhen(n.day)}</span>
        <button class="nt-x" onclick="ntDismiss('${String(n.id).replace(/'/g,"\\'")}')"
          ${needVote?'disabled title="Pick a side first"':''}
          aria-label="Dismiss"><i class="fa fa-xmark"></i></button>
      </div>
      ${n.art?`<div class="nt-art">${n.art}</div>`:''}
      ${n.body?`<div class="nt-body">${n.body}</div>`:''}
      ${n.vote?`<div class="nt-vote">${n.vote.sides.map(s=>`
          <button class="nt-vb${mine===s.k?' on':''}"
            onclick="ntVote('${fieldSafe}','${s.k}')">
            <span class="nt-vb-l">${s.label}</span>
            ${total?`<span class="nt-vb-n">${Math.round((tally[s.k]||0)/total*100)}%</span>`:''}
          </button>`).join('')}</div>
        ${needVote?`<div class="nt-voted"><i class="fa fa-hand-pointer"></i>Pick a side — this one does not clear until you do.</div>`:''}
        ${total?`<div class="nt-vn">${total} vote${total===1?'':'s'} in</div>`:''}`:''}
      ${n.go?`<button class="nt-go" onclick="ntGo('${n.go}')">Open My Bets <i class="fa fa-arrow-right"></i></button>`:''}
    </div>
    </div>
    ${''/* No arrows. The card is swiped, and a pair of chevrons under it was a
           second way to do a thing the card already teaches. */}`;
  ntWireSwipe();
}
/* Swipe to clear. Pointer events rather than touch, so a trackpad drag works
   the same as a thumb; the card follows the finger and only leaves if it is
   thrown far enough or fast enough, which is what stops a scroll that starts
   on the card from throwing it away. */
function ntWireSwipe(){
  const card=document.getElementById('nt-card'); if(!card) return;
  let x0=0,y0=0,t0=0,dx=0,drag=false,locked=null;
  const end=()=>{
    card.style.transition='transform .22s ease, opacity .22s ease';
    const dt=Math.max(1,Date.now()-t0);
    const fling=Math.abs(dx)/dt>0.5;
    /* a card waiting on an answer moves under the finger and springs back —
       the drag still reads as a drag, it just has nowhere to go */
    if((Math.abs(dx)>90||fling)&&card.dataset.lock!=='1'){
      card.style.transform=`translateX(${dx>0?400:-400}px) rotate(${dx>0?6:-6}deg)`;
      card.style.opacity='0';
      setTimeout(()=>ntDismiss(card.dataset.id||''),190);
    }else{
      card.style.transform=''; card.style.opacity='';
    }
    drag=false; locked=null; dx=0;
  };
  card.addEventListener('pointerdown',e=>{
    if(e.target.closest('button')) return;      // a vote is not a swipe
    drag=true; locked=null; x0=e.clientX; y0=e.clientY; t0=Date.now(); dx=0;
    card.style.transition='none';
  });
  card.addEventListener('pointermove',e=>{
    if(!drag) return;
    const mx=e.clientX-x0, my=e.clientY-y0;
    /* decide once whether this gesture is a swipe or a scroll, then stick to
       it — re-deciding mid-drag is what makes a card twitch under a scroll */
    if(locked==null&&(Math.abs(mx)>6||Math.abs(my)>6)) locked=Math.abs(mx)>Math.abs(my)?'x':'y';
    if(locked!=='x') return;
    e.preventDefault();
    dx=mx;
    card.style.transform=`translateX(${dx}px) rotate(${dx*0.02}deg)`;
    card.style.opacity=String(Math.max(0.3,1-Math.abs(dx)/260));
  });
  card.addEventListener('pointerup',end);
  card.addEventListener('pointercancel',end);
  card.addEventListener('pointerleave',e=>{ if(drag) end(); });
}

/* ── What still needs doing goes first ──────────────────────────────────────
   Anything outstanding rises to the top of the stack, directly under the video;
   finished cards sink below it. Among equals the order is the canonical one —
   poll, notifications, picks, trivia — so a manager with everything done and one with
   nothing done see the same page, and only a half-finished one gets reordered.

   Done means the same thing a card means by it: a ballot cast, a slate
   submitted, all five questions answered. */
/* Putting a finished card back to the start. Nothing here is destructive
   beyond the card it names: each clears its own stored answer, locally and on
   the profile, and repaints. It exists so the reorder can actually be watched
   — a card that only ever completes once is a thing you get to see move a
   single time. */
async function homeRestart(which){
  if(which==='bk'){
    /* Belt as well as braces: the scorecard no longer draws this button for the
       league, and the handler will not wipe a graded set either. Ball Knowledge
       is the one thing here that is scored, and a redo with the answers already
       shown is not a redo. */
    if(!isTestProfile()) return;
    _bkAnswers={}; _bkOpen=null; _bkDone=false; _bkSubmitted=false;
    localStorage.removeItem(lsKey(bkKey()));
    localStorage.removeItem(lsKey(bkSubKey()));
    if(_me) try{ await gflPatchProfile(_me.k1,{[bkKey()]:'',[bkSubKey()]:''}); }catch(e){}
    renderBallKnowledge();
  }
  /* THE POLL HAS NO START OVER. It was a testing convenience and it read as a
     feature: a ballot could be pulled back and recast with the league's own
     result already on screen, which is the one thing a poll cannot allow. A
     ballot is twelve teams in an order, sent once. */
  if(which==='pk') pkReopen();
  if(which==='nt') await ntRestart();
  orderHomeTodo();
}
const homeRestartBtn=which=>`<button class="home-redo" onclick="homeRestart('${which}')">
  <i class="fa fa-rotate-left"></i>Start over</button>`;
const HOME_TODO=[
  {id:'cp-sec', done:()=>_cpJustSent || !!(_cpRows||[]).find(p=>_me&&p.id===_me.k1&&p[cpKey()])},
  {id:'nt-sec', done:()=>ntDone()},
  {id:'pk-sec', done:()=>pkSubmitted()||pkLocked()},
  {id:'bk-sec', done:()=>{ const qs=bkQuestions(); if(!qs.length) return true;
    return bkSubmitted(); }},
];
/* Outstanding cards rise to the top of the stack, finished ones sink. All
   three travel rather than jump: the slot change is applied, then each card is
   measured before and after and played back from where it used to be, so the
   move is visible instead of the stack silently being in a different order the
   next time you look at it. Same curve as the Ball Knowledge card's trip to the
   foot of the page, quicker because the distance is a fraction of it. */
let _htFirst=true;
function orderHomeTodo(){
  const rows=HOME_TODO.map((t,i)=>{
    const el=document.getElementById(t.id);
    let done=false; try{ done=!!t.done(); }catch(e){}
    return {el,done,i};
  }).filter(r=>r.el);
  if(!rows.length) return;
  rows.sort((a,b)=>(a.done?1:0)-(b.done?1:0) || a.i-b.i);

  /* Any inversion still sitting on a card from a previous call has to come off
     before measuring, or the "before" box is a displaced one and the next
     inversion compounds it. */
  /* OUTSTANDING CARDS LOOK OUTSTANDING. Sinking to the bottom of the stack says
     a section is finished only if you remember what the order was; a card that
     still wants something from you should say so where it stands. Finished ones
     keep exactly the look they have now, and the ones with something left take a
     light wash of their own accent and an outline in it.

     Every path that changes what is outstanding already ends up here — sending a
     ballot, reopening the picks, answering a question, clearing a notification
     and starting them over again — so the state follows the card without any of
     those needing to know about it. */
  rows.forEach(r=>{
    r.el.classList.toggle('home-todo',!r.done);
    r.el.classList.toggle('home-done',!!r.done);
  });

  rows.forEach(r=>{ if(r.el.style.transform){
    r.el.style.transition=''; r.el.style.transform=''; r.el.style.zIndex=''; } });

  /* Nothing to animate on the very first paint, when the order is not actually
     changing, or when the tab is hidden — requestAnimationFrame does not run in
     a background tab, so the cards would sit inverted until it came forward. */
  const moved=rows.some((r,n)=>r.el.style.order!==String(n));
  const animate=!_htFirst && moved && !document.hidden
    && !matchMedia('(prefers-reduced-motion:reduce)').matches;
  _htFirst=false;
  const before=animate?rows.map(r=>r.el.getBoundingClientRect()):null;

  rows.forEach((r,n)=>{
    r.el.style.order=String(n);
    /* the phone grid places by area, so the slot has to move too */
    r.el.style.gridArea='s'+(n+1);
  });
  if(!animate) return;

  rows.forEach((r,n)=>{
    const from=before[n], to=r.el.getBoundingClientRect();
    if(!from.height||!to.height) return;
    const dx=from.left-to.left, dy=from.top-to.top;
    if(!dx&&!dy) return;
    r.el.style.transition='none';
    r.el.style.transform='translate('+dx+'px,'+dy+'px)';
    r.el.style.zIndex='2';
  });
  requestAnimationFrame(()=>{
    rows.forEach(r=>{
      if(!r.el.style.transform) return;
      r.el.style.transition='transform .62s cubic-bezier(.3,.75,.25,1)';
      r.el.style.transform='';
      setTimeout(()=>{ r.el.style.transition=''; r.el.style.zIndex=''; },700);
    });
  });
}

/* ── Coaches' Poll ──────────────────────────────────────────────────────────
   Post-draft rankings. Everyone numbers the teams best to worst; the league
   average of those numbers is the poll. Ballots stay hidden until every manager
   has voted, so nobody can anchor on a running total — the same reason the
   weekly picks card shows no tally.

   A ballot is one field on the profile: team ids in ranked order. The count of
   ballots comes from reading the profiles, the same way the Matchup of the Week
   vote already does, so no new collection was needed. */
const cpKey=()=>`cp_${getSeason()}`;
let _cpBallot=null,_cpRows=null,_cpBusy=false,_cpFetched=false;
/* set the moment a ballot is sent, so the card counts as done before the
   profile round-trip lands — otherwise the reorder briefly disagrees with what
   the manager just did */
let _cpJustSent=false;
/* whether the "your ballot"/"picks are in" folds were left open, so a rebuild
   on the league poll does not close them while they are being read */
let _cpFoldOpen=false,_pkFoldOpen=false;
function foldKeep(which,el){ if(which==='cp') _cpFoldOpen=el.open; else _pkFoldOpen=el.open; }

function cpMyBallot(){
  if(_cpBallot) return _cpBallot;
  try{ _cpBallot=JSON.parse(localStorage.getItem(lsKey(cpKey()))||'[]'); }catch{ _cpBallot=[]; }
  /* nothing cached on this device — adopt whatever this manager already
     submitted, so a ballot follows them rather than looking unfilled */
  if(!_cpBallot.length&&_me&&_cpRows){
    const row=_cpRows.find(p=>p.id===_me.k1);
    if(row&&row[cpKey()]){
      try{ const srv=JSON.parse(row[cpKey()]);
        if(Array.isArray(srv)&&srv.length){ _cpBallot=srv;
          localStorage.setItem(lsKey(cpKey()),JSON.stringify(srv)); } }catch(e){}
    }
  }
  return _cpBallot;
}
async function cpSync(){
  if(_cpFetched) return; _cpFetched=true;
  try{
    const rows=await gflListProfiles();
    if(rows){ _cpRows=rows; renderCoachesPoll();
      /* the trade cards read their tallies out of the same rows */
      if(_activeTab==='trades') try{ renderTradesTab(); }catch(e){} }
  }catch(e){}
}
function cpToggle(teamId){
  const b=cpMyBallot().slice();
  const i=b.indexOf(String(teamId));
  if(i>=0) b.splice(i,1); else b.push(String(teamId));
  _cpBallot=b; localStorage.setItem(lsKey(cpKey()),JSON.stringify(b));
  renderCoachesPoll();
}
function cpClear(){ _cpBallot=[]; localStorage.setItem(lsKey(cpKey()),'[]'); renderCoachesPoll(); }
/* The ballot used to be marked sent before the write was attempted and the
   result was thrown away, so a refused save — a quota block, most of all —
   folded the card away as though it had gone through and quietly lost the
   ballot. Now nothing is marked sent until the write comes back ok. */
let _cpErr=null,_cpRefreshing=false;
async function cpRefresh(){
  if(_cpRefreshing||_fsQuota) return;
  _cpRefreshing=true; renderCoachesPoll();
  try{ await leaguePoll(true); }catch(e){}
  _cpRefreshing=false; renderCoachesPoll();
}
const cpRefreshBtn=()=>`<button class="cp-refresh" onclick="cpRefresh()" ${_cpRefreshing?'disabled':''}
  title="Check for new ballots"><i class="fa fa-rotate${_cpRefreshing?' fa-spin':''}"></i></button>`;
async function cpSubmit(){
  if(!_me||_cpBusy) return;
  const b=cpMyBallot();
  if(b.length!==_teams.length) return;
  _cpBusy=true; _cpErr=null; renderCoachesPoll();
  try{
    const res=await gflPatchProfile(_me.k1,{[cpKey()]:JSON.stringify(b)});
    if(res&&res.ok){
      _cpJustSent=true;
      _cpFetched=false; await leaguePoll(true);
    }else{
      _cpErr=(res&&res.error==='quota')?'quota':'send';
    }
  }catch(e){ _cpErr='send'; }
  _cpBusy=false; renderCoachesPoll();
}
/* average rank across every submitted ballot */
function cpTally(){
  const rows=_cpRows||[];
  const ballots=[];
  rows.forEach(p=>{
    let b=null; try{ b=JSON.parse(p[cpKey()]||'null'); }catch{ b=null; }
    if(Array.isArray(b)&&b.length===_teams.length) ballots.push(b);
  });
  if(!ballots.length) return {ballots:0,rank:[]};
  const sum={},n=ballots.length;
  _teams.forEach(t=>{sum[t.id]=0;});
  ballots.forEach(b=>b.forEach((id,i)=>{ if(sum[id]!=null) sum[id]+=i+1; }));
  const rank=_teams.map(t=>({t,avg:sum[t.id]/n})).sort((a,b)=>a.avg-b.avg);
  return {ballots:n,rank};
}
/* ── WHO IS STILL HOLDING THE POLL UP ────────────────────────────────────────
   Crests only, under the combined standings. A count of ballots says how many
   are missing; this says which, which is the version somebody can do something
   about. Read off the profile rows the poll already pulls, so it costs nothing.

   A team with no profile row at all has not voted either — the check is for a
   ballot against that team, not for the absence of one. */
function cpYetToVoteHTML(){
  const rows=_cpRows||[];
  if(!rows.length||!_teams.length) return '';
  const voted=new Set(rows.filter(p=>p[cpKey()])
    .map(p=>String(p.teamId||'').trim()).filter(Boolean));
  const out=_teams.filter(t=>!voted.has(String(t.id)));
  if(!out.length) return `<div class="cp-yet cp-yet-all">
    <i class="fa fa-circle-check"></i><span>Every ballot is in.</span></div>`;
  return `<div class="cp-yet">
    <span class="cp-yet-l">Yet to vote</span>
    <span class="cp-yet-logos">${out.map(t=>
      `<span class="cp-yet-t" title="${String(t.name).replace(/"/g,'&quot;')}">${logoImg(t.id,'cp-logo')}</span>`
    ).join('')}</span>
  </div>`;
}
function renderCoachesPoll(){
  const el=document.getElementById('cp-body'); if(!el) return;
  cpSync();
  const sec=document.getElementById('cp-sec');
  if(!_teams.length){ if(sec) sec.style.display='none'; return; }
  if(sec) sec.style.display='';
  const {ballots,rank}=cpTally();
  const total=_franchises.length||_teams.length;
  /* Seven is enough to be a poll rather than a couple of opinions; the rest
     can still come in and shift it after that. Two for the testing profile,
     which is the only way to see a result before seven people have voted. */
  const REVEAL_AT=isTestProfile()?2:7;
  const complete=ballots>=REVEAL_AT;

  if(!_me){
    el.innerHTML=`<div class="home-signin">
      <div class="home-signin-t">Sign in to rank the league and see where everyone else has it.</div>
      <button class="home-signin-b" onclick="openSignIn()">Sign in</button>
      <div class="home-signin-m">${ballots} of ${total} ballots in</div>
    </div>`;
    return;
  }
  /* Results are withheld from anyone who has not voted, however many ballots
     are in. Seeing the standings first would tell you what the league thinks
     before you say what you think, which is the one thing a poll cannot allow —
     the late voters would just be ratifying it. */
  const mineIn=!!(_cpRows||[]).find(p=>_me&&p.id===_me.k1&&p[cpKey()]);
  const results=`<div class="cp-meta">${ballots} of ${total} ballots in${ballots<total?' · still open':''}${cpRefreshBtn()}</div>
    <div class="cp-list">${rank.map((r,i)=>`<div class="cp-res">
      <span class="cp-rk">${i+1}</span>
      ${logoImg(r.t.id,'cp-logo')}
      <span class="cp-nm">${r.t.name}</span>
      <span class="cp-avg">${r.avg.toFixed(2)}</span>
    </div>`).join('')}</div>
    ${cpYetToVoteHTML()}`;
  const b=cpMyBallot();
  const done=b.length===_teams.length;
  /* the ballot this manager sent, drawn as a ranked list */
  const myBallotList=()=>{
    const mine=b.length===_teams.length?b:null;
    if(!mine) return '<div class="cp-note">Ballot saved.</div>';
    return `<div class="cp-list">${mine.map((id,i)=>{
      const t=_teams.find(x=>String(x.id)===String(id));
      return t?`<div class="cp-res"><span class="cp-rk">${i+1}</span>
        ${logoImg(t.id,'cp-logo')}<span class="cp-nm">${t.name}</span></div>`:'';
    }).join('')}</div>`;
  };
  if(complete&&mineIn){
    el.innerHTML=results+`
      <details class="cp-fold cp-mine"${_cpFoldOpen?' open':''} ontoggle="foldKeep('cp',this)">
        <summary class="cp-fold-s"><i class="fa fa-check"></i>Your ballot
          <i class="fa fa-chevron-down ms-chev"></i></summary>
        <div class="cp-fold-b">${myBallotList()}</div>
      </details>`;
    return;
  }
  /* Voted, but the poll has not reached the reveal yet: the ballot folds away
     to a line. It has done its job, and leaving twelve tiles open holds space
     the results will want. */
  if(mineIn){
    el.innerHTML=`
      <details class="cp-fold"${_cpFoldOpen?' open':''} ontoggle="foldKeep('cp',this)">
        <summary class="cp-fold-s"><i class="fa fa-check"></i>Your ballot is in
          <span class="cp-fold-n">${ballots} of ${total}</span>${cpRefreshBtn()}
          <i class="fa fa-chevron-down ms-chev"></i></summary>
        <div class="cp-fold-b">
          ${myBallotList()}
          <div class="cp-meta" style="margin-top:10px">Results show once ${REVEAL_AT} ballots are in.</div>
        </div>
      </details>`;
    return;
  }
  el.innerHTML=`
    <div class="cp-meta">${ballots} of ${total} ballots in · ${complete?'vote to see results':`results show at ${REVEAL_AT}`}${cpRefreshBtn()}</div>
    <div class="cp-pick">${_teams.map(t=>{
      const pos=b.indexOf(String(t.id));
      return `<button class="cp-t${pos>=0?' on':''}" onclick="cpToggle(${t.id})">
        ${pos>=0?`<span class="cp-num">${pos+1}</span>`:'<span class="cp-num cp-none"></span>'}
        ${logoImg(t.id,'cp-logo')}
        <span class="cp-nm">${t.abbrev||teamInitials(t.name)}</span>
      </button>`;}).join('')}</div>
    ${_cpErr?`<div class="cp-err">${_cpErr==='quota'
      ?'The league database has hit its daily free-tier limit — your ballot was not saved. Try again after it resets at midnight Pacific.'
      :'That did not save. Check your connection and try again.'}</div>`:''}
    <div class="cp-actions">
      <button class="cp-reset" onclick="cpClear()">Reset</button>
      <button class="cp-go" ${done&&!_cpBusy?'':'disabled'} onclick="cpSubmit()">
        ${_cpBusy?'Saving…':done?'Submit ballot':`Rank all ${_teams.length}`}</button>
    </div>`;
  orderHomeTodo();
}

/* ── League Action ──────────────────────────────────────────────────────────
   Everything happening around the league in one compact feed — adds, drops and
   trades, newest first, one line each so a lot fits without scrolling far.

   Dismissals are per manager and kept locally rather than on the profile: this
   is a "I have seen that" list, not league data, and it should not follow
   anyone onto a second device or be worth a round trip. Clearing hides an item
   from the feed; nothing is deleted, and the transactions themselves are still
   read from ESPN as they always were. */
const laSeenKey=()=>'la_seen_'+(_me?_me.k1:'guest');
let _laSeen=null;
function laSeen(){
  if(_laSeen) return _laSeen;
  try{ _laSeen=new Set(JSON.parse(localStorage.getItem(laSeenKey())||'[]')); }
  catch{ _laSeen=new Set(); }
  return _laSeen;
}
function laSave(){ localStorage.setItem(laSeenKey(),JSON.stringify([...laSeen()])); }
function laDismiss(id){ laSeen().add(id); laSave(); renderLeagueAction(); }
function laClearAll(){ laItems().forEach(i=>laSeen().add(i.id)); laSave(); renderLeagueAction(); }
function laRestore(){ _laSeen=new Set(); laSave(); renderLeagueAction(); }

/* One flat list of events. A transaction can carry several players, so each
   add/drop becomes its own line while a trade stays one. */
function laItems(){
  const teamMap={}; _teams.forEach(t=>teamMap[t.id]=t);
  const out=[];
  (_transactions||[]).forEach((tx,ti)=>{
    const when=Number(tx.processedDate||0);
    const team=teamMap[tx.teamId];
    const ab=team?(team.abbrev||teamInitials(team.name)):'—';
    const type=tx.type||'', items=tx.items||[];
    const base=`${when||'x'}-${tx.teamId}-${ti}`;
    const nameOf=pid=>_playerNames[pid]||('#'+pid);
    if(type==='WAIVER'||type==='FREEAGENT'){
      items.forEach((i,k)=>{
        if(i.type!=='ADD'&&i.type!=='DROP') return;
        out.push({id:`${base}-${k}`, when, kind:i.type==='ADD'?'add':'drop',
          teamId:tx.teamId, ab, player:nameOf(i.playerId),
          note:i.type==='ADD'?(tx.bidAmount!=null?`$${tx.bidAmount}`:(type==='WAIVER'?'waiver':'FA')):''});
      });
    }else if(type==='TRADE_ACCEPT'||type==='TRADE'){
      out.push({id:`${base}-tr`, when, kind:'trade', teamId:tx.teamId, ab,
        player:items.map(i=>nameOf(i.playerId)).filter(Boolean).slice(0,3).join(', '),
        note:`${items.length} player${items.length!==1?'s':''}`});
    }
  });
  return out.sort((a,b)=>b.when-a.when);
}
function renderLeagueAction(){
  const el=document.getElementById('la-body'); if(!el) return;
  const sec=document.getElementById('la-sec');
  const all=laItems();
  if(!all.length){ if(sec) sec.style.display='none'; return; }
  if(sec) sec.style.display='';
  const seen=laSeen();
  const list=all.filter(i=>!seen.has(i.id)).slice(0,40);
  const hidden=all.length-list.length;
  const ICON={add:'fa-plus',drop:'fa-minus',trade:'fa-right-left'};
  const ago=ms=>{ if(!ms) return ''; const d=Math.floor((Date.now()-ms)/86400000);
    if(d>0) return d+'d'; const h=Math.floor((Date.now()-ms)/3600000);
    return h>0?h+'h':'now'; };
  const rows=list.map(i=>`<div class="la-row la-${i.kind}">
      <span class="la-ic"><i class="fa ${ICON[i.kind]}"></i></span>
      <span class="la-ab">${i.ab}</span>
      <span class="la-p">${i.player}</span>
      ${i.note?`<span class="la-n">${i.note}</span>`:''}
      <span class="la-t">${ago(i.when)}</span>
      <button class="la-x" onclick="laDismiss('${i.id}')" aria-label="Clear"><i class="fa fa-xmark"></i></button>
    </div>`).join('');
  el.innerHTML=`
    <div class="la-top">
      <span class="la-count">${list.length} item${list.length===1?'':'s'}</span>
      ${list.length?`<button class="la-clear" onclick="laClearAll()"><i class="fa fa-broom"></i>Clear all</button>`:''}
    </div>
    ${list.length?`<div class="la-list">${rows}</div>`
      :`<div class="la-empty">All caught up.</div>`}
    ${hidden?`<button class="la-restore" onclick="laRestore()">Show ${hidden} cleared</button>`:''}`;
}

/* ── Most cursed ────────────────────────────────────────────────────────────
   Bad Beat O'Meter's top of the table, surfaced on the homepage. */
function renderCursed(){
  const el=document.getElementById('curse-body'); if(!el) return;
  const html=cursedHTML();
  const sec=document.getElementById('curse-sec');
  if(!html){ if(sec) sec.style.display='none'; return; }
  if(sec) sec.style.display='';
  el.innerHTML=html;
}
function cursedHTML(){
  const list=badBeatData(getSeason());
  if(!list||!list.length) return '';
  const t=list[0];
  const cur=_teams.find(x=>x.id===t.id);
  const av=cur?logoImg(t.id,'big4-logo'):avatarCore(t.name,t.id,proxyLogo(t.logo),44,10);
  return `<div class="curse-box" onclick="switchTab('badbeat')" role="button" tabindex="0">
    <div class="curse-ic">${av}</div>
    <div class="curse-txt">
      <div class="curse-lbl">Most Cursed Player</div>
      <div class="curse-name">${t.name}</div>
      <div class="curse-sub">${t.vaW}–${t.vaL} against the field but ${t.w}–${t.l} on the scoreboard</div>
    </div>
    <div class="curse-score"><b>${Number(t.score).toFixed(1)}</b><span>curse</span></div>
  </div>`;
}

/* ── Ball Knowledge IQ ──────────────────────────────────────────────────────
   A team's standing on the week's questions, shown on its profile. Everyone
   opens at the average and moves a step per graded answer.

   Nothing is graded until the week's `reveal` is turned on, so before that the
   whole league sits dead centre — which is the intended starting state rather
   than a placeholder. */
/* 0 to 300, average at 150. The old 40–228 was lopsided — 128 points of room
   above the average and only 60 below — so a bad run hit the floor twice as
   fast as a good one hit the ceiling. Symmetrical now, and it divides cleanly
   into the nine bands below. */
const bkIQCfg=()=>Object.assign({min:0,max:300,avg:150,step:8},(_CFG.ballKnowledge||{}).iq||{});
/* ── WHAT THE NUMBER IS CALLED ───────────────────────────────────────────────
   Nine bands, worst to best, each covering an equal share of the scale — a
   third of a hundred points apiece across 0–300. Average Ball Knower is the
   fifth of nine, so it straddles the midpoint exactly: 133.3 to 166.7, centred
   on 150, which is where everybody starts.

   Derived from min and max rather than written as fixed boundaries, so moving
   the scale in config moves the bands with it instead of silently leaving them
   pointing at the wrong numbers. */
const BK_IQ_LABELS=[
  'Profound Impairment',
  'Moderate Impairment',
  'Casual Fan',
  'Borderline Ball Knower',
  'Average Ball Knower',
  'This Guy Knows Some Ball',
  'Superior Ball Knowledge',
  'Gifted Ball Knower',
  'Ball Lover',
];
function bkIQLabel(v){
  const {min,max}=bkIQCfg();
  const band=(max-min)/BK_IQ_LABELS.length;
  const i=Math.floor((Number(v)-min)/band);
  return BK_IQ_LABELS[Math.max(0,Math.min(BK_IQ_LABELS.length-1,i))];
}
let _bkProfiles=null;
/* One manager's settled bets, for the IQ bar on their profile. The sportsbook
   only reads your own now, so somebody else's have to be asked for — once per
   owner per session, and the profile repaints when the answer arrives. */
const _betsByOwner={};
function betsForOwners(owners){
  const out=[];
  let missing=false;
  owners.forEach(o=>{
    if(_betsByOwner[o]) { out.push(..._betsByOwner[o]); return; }
    if(_me&&o===_me.k1){ out.push(...(_bets||[]).filter(b=>b.owner===o)); return; }
    missing=true;
    if(_betsByOwner[o]===undefined){
      _betsByOwner[o]=null;                       // in flight; do not ask twice
      betQuery(fsEq('owner',o)).then(rows=>{
        _betsByOwner[o]=rows||[];
        if(_activeTab==='teams') try{ renderProfile(); }catch(e){}
      }).catch(()=>{ _betsByOwner[o]=[]; });
    }
  });
  /* Nothing yet for a manager whose bets are still coming: their bar shows
     without the bet component for a beat rather than showing a wrong total. */
  return missing&&!out.length?[]:out;
}

/* Ball Knowledge is not just the quiz. Three things move it, all of them a
   read on the league rather than luck:
     · the weekly trivia — a right answer up, a wrong one down
     · the weekly picks, once the games they call have been played
     · settled bets, which are the same judgement with something on it
   All three carry the same weight: one point up for a right call, one down for
   a wrong one, and the Matchup of the Week pick counts double. */
function bkIQFor(teamId){
  const cfg=_CFG.ballKnowledge||{}, iq=bkIQCfg();
  if(!_bkProfiles) return iq.avg;
  const rows=_bkProfiles.filter(p=>String(p.teamId||'')===String(teamId));
  if(!rows.length) return iq.avg;
  let score=0;
  rows.forEach(p=>{
    // trivia
    /* The questions are generated now rather than written into config, and this
       was still reading the config list — which has been empty since, so the
       trivia has quietly been worth nothing at all. It grades the week's real
       set: right answer up, wrong answer down, each worth one step. */
    /* A question left blank counts against you, the same as getting it wrong —
       but only once the week's football has started. Grading a blank the moment
       the questions go up would sit every manager at minus five on Tuesday
       morning for the crime of not having answered yet, which is not the rule
       anybody agreed to. Until the slate locks a blank is worth nothing and a
       right answer is worth its point; after it locks, the set is settled and
       what is missing is missing.

       Only the current week is graded here. The generators read live data — a
       player's rank now is not their rank in week three — so a past week cannot
       be rebuilt and marked after the fact, and pretending otherwise would
       score people against questions they were never asked. */
    if(cfg.reveal){
      const qs=bkQuestions();
      const settled=(()=>{ try{ return pkLocked(); }catch(e){ return false; } })();
      let ans={}; try{ ans=JSON.parse(p[bkKey()]||'{}'); }catch{ ans={}; }
      qs.forEach((q,i)=>{
        if(ans[i]==null){ if(settled) score-=1; return; }
        score+=(ans[i]===q.correct?1:-1);
      });
    }
    // weekly picks, graded against results that exist
    score+=bkPickScore(p);
  });
  /* Settled bets belonging to this team. _bets is this manager's own ledger
     now rather than the whole league's, so another team's bets are fetched on
     demand — one query for that owner, kept, and the bar repaints when it
     lands. Falls back to _bets, which is the right answer when the team being
     looked at is your own. */
  const owners=rows.map(p=>p.id);
  const src=betsForOwners(owners);
  src.forEach(b=>{
    if(!owners.includes(b.owner)) return;
    if(b.status==='won') score+=1;
    else if(b.status==='lost') score-=1;
  });
  return Math.max(iq.min,Math.min(iq.max,Math.round(iq.avg+score*iq.step)));
}
/* how a manager's weekly picks turned out, over every week still in the
   profile — only games with a finished result count */
function bkPickScore(p){
  let s=0;
  Object.keys(p).forEach(k=>{
    if(!/^pk_/.test(k)) return;
    const wk=Number((k.match(/_w(\d+)/)||[])[1]||0); if(!wk) return;
    let picks={}; try{ picks=JSON.parse(p[k]||'{}'); }catch{ return; }
    const meta=_seasonMeta[getSeason()]; if(!meta) return;
    const games=(meta.schedule||[]).filter(m=>Number(m.matchupPeriodId)===wk&&m.home&&m.away);
    const motw=pkMotwIndex(games);
    Object.entries(picks).forEach(([gi,teamId])=>{
      const g=games[Number(gi)]; if(!g) return;
      const hp=g.home.totalPoints||0, ap=g.away.totalPoints||0;
      if(hp===0&&ap===0) return;                       // not played
      const winner=hp>ap?g.home.teamId:ap>hp?g.away.teamId:null;
      if(winner==null) return;                          // a tie pays neither way
      const w=(Number(gi)===motw)?2:1;                  // the featured game counts double
      s+=(String(winner)===String(teamId)?w:-w);
    });
  });
  return s;
}
/* min..avg fills the left half and avg..max the right, so the average sits at
   the midpoint even though it is nowhere near the midpoint of the range. */
function bkIQPct(v){
  const {min,max,avg}=bkIQCfg();
  return v<=avg ? (v-min)/(avg-min)*50 : 50+(v-avg)/(max-avg)*50;
}
function bkIQColor(v){
  const p=bkIQPct(v)/100;
  return p>=0.5 ? mixHex('#f4c04d','#3fd07a',(p-0.5)/0.5) : mixHex('#ff5f5f','#f4c04d',p/0.5);
}
function bkIQHTML(teamId){
  /* same stale guard: config holds no questions any more, so this hid the bar
     outright. It shows whenever there is a set to be graded against. */
  if(!bkQuestions().length) return '';
  const iq=bkIQCfg(), v=bkIQFor(teamId), pct=bkIQPct(v), col=bkIQColor(v);
  /* No card of its own any more: this sits at the foot of the profile hero,
     inside the black panel, so the wrapper carries position only. */
  return `<div class="bkiq-inhero">
    <div class="bkiq-head">
      <span class="bkiq-t"><i class="fa fa-brain"></i>Ball Knowledge</span>
      ${''/* the band rides the head row, in the gap the title and the number
             leave between them — it used to sit centred under the bar on a line
             of its own, which is a lot of card for three words */}
      <span class="bkiq-lab" style="color:${col};border-color:${col}">${bkIQLabel(v)}</span>
      <span class="bkiq-v" style="color:${col}">${Math.round(v)}</span>
    </div>
    <div class="bkiq-track">
      <span class="bkiq-mid"></span>
      <span class="bkiq-fill" style="width:${pct.toFixed(1)}%;background:${col}"></span>
      <span class="bkiq-dot" style="left:${pct.toFixed(1)}%;background:${col}"></span>
    </div>
    <div class="bkiq-scale"><span>${iq.min}</span><span>${iq.avg} · average</span><span>${iq.max}</span></div>
  </div>`;
}


/* ── LEADERBOARDS ────────────────────────────────────────────────────────────
   The league measured against itself on the two things the site keeps score of
   that ESPN does not: what everybody knows, and what everybody has done with
   their money.

   Both boards are built from data already on hand — the profile list the
   homepage fetches, and one season-scoped read of the bets collection — so
   opening this tab costs one query and nothing on the pages it summarises.

   Every manager appears, including the ones who have not played. A board that
   quietly drops the people with nothing on it is a board that flatters. */
function ldRows(){
  const rows=(_franchises||[]).map(f=>{
    const prof=(_bkProfiles||_cpRows||[]).filter(p=>String(p.teamId||'')===String(f.teamId));
    return {owner:f.owner, name:f.name, teamId:f.teamId, ids:prof.map(p=>p.id), prof};
  });
  return rows.filter(r=>r.teamId!=null);
}
/* One manager's betting record for the season, from the league-wide pull */
function ldBets(ids){
  /* betsAfterReset, the same line every manager's own ledger is drawn behind.
     Without it the board counted bets from before the slate was cleared and
     read a different number for the same manager than their own sportsbook
     did — 360 of staking that their own page had correctly forgotten. */
  const all=(_betsAll||[]).filter(b=>ids.includes(b.owner)&&!b.hidden&&betsAfterReset(b));
  const settled=all.filter(b=>b.status==='won'||b.status==='lost'||b.status==='cashed');
  const won=all.filter(b=>b.status==='won').length;
  const lost=all.filter(b=>b.status==='lost').length;
  const staked=settled.reduce((a,b)=>a+(b.stake||0),0);
  const back=settled.reduce((a,b)=>a+(b.ret||0),0);
  const open=all.filter(b=>b.status==='open').length;
  return {n:all.length, won, lost, open, staked, back, net:back-staked,
    roi:staked>0?((back-staked)/staked*100):null,
    hit:(won+lost)>0?(won/(won+lost)*100):null};
}
/* One manager's portfolio, replayed from the ledger on their profile — the same
   arithmetic invRealised does, run against somebody else's lots. */
function ldFolio(prof){
  let lots=[];
  prof.forEach(p=>{ try{ const a=JSON.parse(p.inv||'[]'); if(Array.isArray(a)) lots=lots.concat(a); }catch(e){} });
  if(!lots.length) return {held:0, cost:0, value:0, real:0, profit:0, trades:0};
  lots.sort((a,b)=>(Number(a.t)||0)-(Number(b.t)||0));
  const sh={},cost={}; let real=0;
  lots.forEach(l=>{
    const o=l.o, n=Number(l.s)||0, p=Number(l.p)||0;
    if(!o||!n) return;
    if(l.k==='s'){ const avg=sh[o]?cost[o]/sh[o]:0; real+=n*(p-avg);
      sh[o]=(sh[o]||0)-n; cost[o]=(cost[o]||0)-avg*n; }
    else { sh[o]=(sh[o]||0)+n; cost[o]=(cost[o]||0)+n*p; }
  });
  let value=0, basis=0, held=0;
  Object.keys(sh).forEach(o=>{ if(sh[o]<=0.0001) return;
    held+=sh[o]; value+=sh[o]*invPrice(o); basis+=cost[o]; });
  return {held, cost:basis, value, real, profit:real+(value-basis), trades:lots.length};
}
/* One manager's GFL Bucks, worked out the way bucksBalance works out your own —
   allowance since their first bet, less what is staked on live bets, plus what
   has come back, plus eggs, less whatever is tied up in shares. Replayed from
   the same three sources rather than stored anywhere, so it cannot drift from
   the number that manager sees on their own sportsbook. */
/* One manager's bucks, from the same function that draws their own chip. This
   used to be a second copy of the balance arithmetic and drifted away from it —
   no pay day, no football gate, no charge for an idle week. */
function ldBucks(ids,prof){
  const bets=(_betsAll||[]).filter(b=>ids.includes(b.owner)&&betsAfterReset(b));
  let eggs=0, lots=[], plant={t:0,id:null}, eggTimes=[];
  prof.forEach(p=>{
    /* the latest watering across their profiles, which is also the kindest
       reading of it: a later timestamp is fewer completed cycles and therefore
       a smaller bill */
    const pt=Number(p.plantWatered||0); if(pt>plant.t) plant={t:pt,id:p.id};
    /* validated the same way eggsFound does, so a find recorded under a retired
       window scheme is not paid for here either */
    try{ const e=JSON.parse(p.eggs||'[]');
      if(Array.isArray(e)){
        const ts=new Set(e.map(Number).map(eggTimeOf).filter(t=>t>0));
        eggs+=ts.size;
        /* the count stays a sum of per-profile sets, exactly as it was — these
           ride alongside it for the replay's benefit and change no total */
        ts.forEach(t=>eggTimes.push(t));
      }
    }catch(e){}
    try{ const a=JSON.parse(p.inv||'[]'); if(Array.isArray(a)) lots=lots.concat(a); }catch(e){}
  });
  /* ── YOUR OWN ROW READS WHAT YOUR OWN BALANCE READS ────────────────────────
     Everything above comes off the profile documents, which is the only source
     there is for eleven other people. For YOU there is a better one: the eggs
     and the lots this device is holding, which is what the chip in the nav is
     counting. The two are normally the same and drift the moment a write does
     not land or is overwritten from somewhere else — and when they drift, the
     board calls you poorer than the bank does, on the same page, which reads as
     one of them being broken.

     Nothing about anybody else's row changes; there is no second source for
     them and inventing one would be worse than the drift. */
  if(_me&&ids.includes(_me.k1)){
    try{ eggs=eggsFound().size; eggTimes=[...eggsFound()]; }catch(e){}
    try{ lots=invLots(); }catch(e){}
    try{ const pt=Number(localStorage.getItem(plantKey())||0);
      if(pt>plant.t) plant={t:pt,id:_me.k1}; }catch(e){}
  }
  return bucksFor({bets,eggs,eggTimes,lots,plant},()=>bucksBalance());
}
/* One manager's matchup-picks record for the season. Every pick on a game that
   has finished, right against wrong — a record counts games, so the Matchup of
   the Week is one here even though it is worth two on the Ball Knowledge scale.
   Picks on games still to be played are held back rather than counted. */
function ldPickRecord(prof){
  let w=0,l=0,pending=0;
  /* The season is read off each key rather than fixed up front. A season can
     exist in _seasonMeta with an empty schedule — 2026 does, all summer — so
     picking one season and trusting it found nothing to grade. Each key names
     its own season, and the only ones that count are the ones whose schedule
     actually has that week in it. */
  prof.forEach(p=>{
    Object.keys(p).forEach(k=>{
      const m=/^pk_(\d+)_w(\d+)$/.exec(k); if(!m) return;
      const wk=Number(m[2]); if(!wk) return;
      const meta=_seasonMeta[m[1]]; if(!meta) return;
      const games=(meta.schedule||[]).filter(x=>Number(x.matchupPeriodId)===wk&&x.home&&x.away);
      if(!games.length) return;
      let picks={}; try{ picks=JSON.parse(p[k]||'{}'); }catch(e){ return; }
      Object.entries(picks).forEach(([gi,teamId])=>{
        const g=games[Number(gi)]; if(!g) return;
        const hp=g.home.totalPoints||0, ap=g.away.totalPoints||0;
        if(hp===0&&ap===0){ pending++; return; }        // not played
        const winner=hp>ap?g.home.teamId:ap>hp?g.away.teamId:null;
        if(winner==null) return;                        // a tie counts neither way
        if(String(winner)===String(teamId)) w++; else l++;
      });
    });
  });
  return {w,l,pending,n:w+l,pct:(w+l)?w/(w+l)*100:null};
}

/* Money on a twelve-row board, kept short. $1,284,500 is ten characters and
   pushes the table past a phone; $1.28M is five and never does. Under ten
   thousand it prints in full, which is where every real figure sits. */
function ldMoney(v){
  const n=Math.abs(Number(v)||0);
  const sign=v<0?'−':'';
  if(n>=1e6) return sign+'$'+(n/1e6).toFixed(n>=1e7?0:2)+'M';
  if(n>=1e4) return sign+'$'+(n/1e3).toFixed(n>=1e5?0:1)+'k';
  return sign+'$'+Math.round(n).toLocaleString();
}
/* the same, signed, for a profit column */
function ldMoneySigned(v){
  const n=Number(v)||0;
  return (n>0?'+':'')+ldMoney(n);
}
const ldFmt=v=>(v>0?'+':v<0?'−':'')+'$'+Math.abs(v).toFixed(2);
const ldCol=v=>v>0?'var(--green)':v<0?'var(--red)':'var(--text2)';

let _ldView='bets';                      // 'bets' | 'folio'
function ldSetView(v){ _ldView=(v==='folio')?'folio':'bets'; renderLeaders(); }

/* ── A BOARD THAT CAN BE ASKED AGAIN ─────────────────────────────────────────
   The two boards here are the expensive page: every ticket in the season, plus
   every profile. Both are now cached — the bets for two minutes, the profiles
   for fifteen — which is what keeps the daily read count down, and it means
   what is on screen can be a few minutes behind somebody else's bet.

   The honest answer to that is not a shorter cache, it is a button. A cache
   nobody can override is a guess about how fresh people need the data to be;
   a cache with a refresh beside it lets them decide, and costs one read only
   when somebody actually wants one. Your own money never needs it — placing a
   bet drops the cache — so this is here for watching everybody else's.

   It says how old the figures are, because "Refresh" on its own does not tell
   anybody whether they need to press it. */
let _ldBusy=false;
function ldAgeText(){
  const t=betsAllAt(); if(!t) return 'Live';
  const s=Math.max(0,Math.round((Date.now()-t)/1000));
  if(s<15) return 'Just now';
  if(s<60) return `${s}s ago`;
  const m=Math.round(s/60);
  return `${m} min ago`;
}
async function ldRefresh(){
  if(_ldBusy) return;
  _ldBusy=true; try{ renderLeaders(); }catch(e){}
  try{
    betsAllDrop();
    _cpFetched=false; _leagueLast=0;
    /* gflListProfiles directly, not leaguePoll — that one returns early unless
       the homepage is open, so calling it from here would do nothing at all */
    await Promise.all([
      betLeague(),
      gflListProfiles().then(r=>{ if(r){ _cpRows=r; _cpFetched=true; } }).catch(()=>{}),
    ]);
  }catch(e){}
  _ldBusy=false;
  try{ renderLeaders(); }catch(e){}
}

function renderLeaders(){
  const bk=document.getElementById('ld-bk-body');
  const mo=document.getElementById('ld-money-body');
  if(!bk||!mo) return;
  /* both boards read the profile list; the homepage poll owns it, so ask for it
     here in case this tab is the first thing opened */
  if(!_bkProfiles&&!(_cpRows||[]).length){ try{ leaguePoll(); }catch(e){} }
  if(!_betsAll) betLeague().then(r=>{ if(r&&_activeTab==='leaders') renderLeaders(); });

  const rows=ldRows();
  if(!rows.length){ bk.innerHTML=mo.innerHTML='<div class="tab-loading">Loading the league…</div>'; return; }
  const ab=tid=>{const t=_teams.find(x=>x.id===Number(tid));
    return (t&&t.abbrev)||teamInitials((t&&t.name)||'');};

  /* ── BALL KNOWLEDGE ───────────────────────────────────────────────────────
     Two lines a manager. The bar sits on its own, full width, so every bar is
     the same length and the fills can be read against each other — hung on the
     end of a row of names they were as long as the name was short.

     Colour is the site's green-to-red on the absolute 0-300 scale, not relative
     to whoever happens to be leading: 150 is amber for everybody, and a league
     where nobody has done anything is a column of amber rather than a false
     spread from green to red. */
  const bkRows=rows.map(r=>({...r, v:bkIQFor(r.teamId)}))
    .sort((a,b)=>b.v-a.v||a.name.localeCompare(b.name));
  bk.innerHTML=`<div class="ld-list">${bkRows.map((r,i)=>{
      const pct=bkIQPct(r.v), col=bkIQColor(r.v);
      return `<div class="ld-row${_me&&String(_me.teamId)===String(r.teamId)?' ld-me':''}">
        <div class="ld-rtop">
          <span class="ld-rk">${i+1}</span>
          <span class="ld-team">${ntCrest(r.owner,22)}
            <span class="ld-ab">${ab(r.teamId)}</span></span>
          <span class="ld-lab" style="color:${col}">${bkIQLabel(r.v)}</span>
          <span class="ld-v" style="color:${col}">${Math.round(r.v)}</span>
        </div>
        <span class="ld-bar"><span class="ld-bar-f" style="width:${pct.toFixed(1)}%;background:${col}"></span>
          <span class="ld-bar-mid"></span></span>
      </div>`;}).join('')}</div>`;

  /* ── BETS AND PORTFOLIOS ──────────────────────────────────────────────────
     A chart and then a table, rather than twelve cards. Twelve cards is twelve
     things to read one at a time; a column chart is the shape of the league in
     one look, and the table under it is where the detail goes — the same table
     the Standings tab uses, so it hides its narrow columns on a phone the way
     that one already does. */
  const tabs=`<div class="standings-filters ld-filters">
    <button class="filter-btn${_ldView==='bets'?' active':''}" onclick="ldSetView('bets')">Bets</button>
    <button class="filter-btn${_ldView==='folio'?' active':''}" onclick="ldSetView('folio')">Portfolios</button>
  </div>
  <div class="ld-fresh">
    <span class="ld-fresh-t">${_ldBusy?'Reading the book…':ldAgeText()}</span>
    <button class="ld-fresh-b" onclick="ldRefresh()" ${_ldBusy?'disabled':''}>
      <i class="fa fa-rotate${_ldBusy?' fa-spin':''}"></i>Refresh</button>
  </div>`;
  if(!_betsAll&&_ldView==='bets'){
    mo.innerHTML=tabs+'<div class="tab-loading"><i class="fa fa-circle-notch"></i>Reading the book…</div>';
    return;
  }
  const money=rows.map(r=>({...r, b:ldBets(r.ids), f:ldFolio(r.prof), bucks:ldBucks(r.ids,r.prof)}));
  const betsView=_ldView==='bets';
  const headV=m=>betsView?m.b.net:m.f.profit;
  /* Ranked on the column the view is about, then on having done something at
     all — everybody sits on zero in September, and sorting that alphabetically
     puts a manager who has never placed a bet above one with ten running. */
  money.sort((x,y)=>headV(y)-headV(x)
    || (betsView?y.b.n-x.b.n:y.f.trades-x.f.trades)
    || x.name.localeCompare(y.name));
  const anyAction=money.some(m=>betsView?m.b.n:m.f.trades);
  /* Six columns, not nine. This site keeps every column on a phone and scrolls
     the table sideways rather than folding it into cards, so a ninth column is
     not hidden on a phone — it is 265px of table nobody can see without
     dragging. Open folds into the record, and staked/returned come out: ROI
     already says what the money did, and the pair of them were the two widest
     columns on the board. */
  const cols=betsView
    ? [['Bucks', m=>ldMoney(m.bucks),null],
       ['Profit',m=>ldMoneySigned(m.b.net),m=>ldCol(m.b.net)],
       ['W–L',   m=>`${m.b.won}–${m.b.lost}${m.b.open?`·${m.b.open}`:''}`,null],
       ['ROI',   m=>m.b.roi==null?'—':(m.b.roi>0?'+':'')+m.b.roi.toFixed(0)+'%',null]]
    : [['Bucks', m=>ldMoney(m.bucks),null],
       ['Profit',m=>ldMoneySigned(m.f.profit),m=>ldCol(m.f.profit)],
       ['Value', m=>m.f.held?ldMoney(m.f.value):'—',null],
       ['Buys',  m=>String(m.f.trades||0),null]];
  mo.innerHTML=tabs
    +(anyAction?'':`<div class="ld-empty">${betsView
        ?'Nobody has placed a bet yet.':'Nobody has bought a share yet.'}</div>`)
    +ldChartHTML(money,headV,betsView?'Profit on settled bets':'Portfolio profit')
    +`<div class="tscroll"><table class="ld-tbl">
      <thead><tr><th>#</th><th>Team</th>${cols.map(c=>`<th class="right">${c[0]}</th>`).join('')}</tr></thead>
      <tbody>${money.map((m,i)=>`<tr${_me&&String(_me.teamId)===String(m.teamId)?' class="ld-me-row"':''}>
        <td><span class="rank">${i+1}</span></td>
        <td><div class="team-cell">${logoImg(m.teamId)}<div class="team-info">
          <div class="team-name tlink" data-tid="${m.teamId}">${m.name}</div>
          <div class="team-sub">${ab(m.teamId)}</div></div></div></td>
        ${cols.map(c=>{const col=c[2]&&c[2](m);
          return `<td class="right"${col?` style="color:${col};font-weight:700"`:''}>${c[1](m)}</td>`;}).join('')}
      </tr>`).join('')}</tbody></table></div>`;
  /* the observer picks this up on its own, but calling it here means the
     phone layout is right on the first paint rather than a frame later */
  try{ labelTables(mo); }catch(e){}
  /* Matchup picks as bars rather than a table. A win percentage is a
     proportion, and a proportion wants a length — three columns of numbers make
     you compare 58% against 42% by reading, where two bars do it by looking.
     The record and the percentage ride the same line, so the row is one line
     with a bar under it, the way the Ball Knowledge board is built. */
  const pk=document.getElementById('ld-pk-body');
  if(pk){
    const recs=rows.map(r=>({...r, r:ldPickRecord(r.prof)}))
      .sort((x,y)=>(y.r.pct==null?-1:y.r.pct)-(x.r.pct==null?-1:x.r.pct)
        || y.r.w-x.r.w || x.name.localeCompare(y.name));
    const any=recs.some(x=>x.r.n||x.r.pending);
    pk.innerHTML=any
      ?`<div class="ld-list">${recs.map((m,i)=>{
        const p=m.r.pct;
        /* the same green-to-red the rest of the site uses, on the proportion
           itself — 50% is the amber middle because a coin flip is the middle */
        const col=p==null?'var(--text3)':bkIQColor(bkIQCfg().min+(p/100)*(bkIQCfg().max-bkIQCfg().min));
        return `<div class="ld-row${_me&&String(_me.teamId)===String(m.teamId)?' ld-me':''}">
          <div class="ld-rtop">
            <span class="ld-rk">${i+1}</span>
            <span class="ld-team">${ntCrest(m.owner,22)}
              <span class="ld-ab">${ab(m.teamId)}</span></span>
            <span class="ld-lab" style="color:var(--text2)">${
              m.r.n?`${m.r.w}–${m.r.l}`:'no picks graded'}${
              m.r.pending?` · ${m.r.pending} pending`:''}</span>
            <span class="ld-v" style="color:${col}">${p==null?'—':p.toFixed(0)+'%'}</span>
          </div>
          <span class="ld-bar"><span class="ld-bar-f"
            style="width:${p==null?0:p.toFixed(1)}%;background:${col}"></span>
            <span class="ld-bar-mid"></span></span>
        </div>`;}).join('')}</div>`
      :`<div class="ld-empty">No picks have been graded yet. Records fill in as
          each week's games finish.</div>`;
  }
  /* ── EGGS ─────────────────────────────────────────────────────────────────
     Twelve tiles, four across. It is one number a manager, so a row each would
     be eleven lines of whitespace to say what a grid says in three. */
  const eg=document.getElementById('ld-egg-body');
  if(eg){
    const eggs=rows.map(r=>{
      let n=0;
      r.prof.forEach(p=>{ try{ const a=JSON.parse(p.eggs||'[]');
        if(Array.isArray(a)) n+=a.length; }catch(e){} });
      return {...r, n};
    }).sort((x,y)=>y.n-x.n||x.name.localeCompare(y.name));
    const top=Math.max(0,...eggs.map(e=>e.n));
    eg.innerHTML=`<div class="eg-grid">${eggs.map(e=>`
      <div class="eg-cell${e.n&&e.n===top?' eg-top':''}${
        _me&&String(_me.teamId)===String(e.teamId)?' eg-me':''}">
        ${ntCrest(e.owner,20)}
        <span class="eg-ab">${ab(e.teamId)}</span>
        <span class="eg-n">${e.n}</span>
      </div>`).join('')}</div>`;
  }
}

/* One column a manager, zero down the middle so a loss reads as a loss. Drawn
   rather than listed: the table underneath already lists it, and the point of a
   chart is the shape of the league in one look. */
function ldChartHTML(rows,val,title){
  const vals=rows.map(val);
  const mx=Math.max(1,...vals.map(v=>Math.abs(v)));
  const n=Math.max(1,rows.length);
  const W=340,H=132,padT=12,padB=20;
  const half=(H-padT-padB)/2, mid=padT+half;
  const slot=W/n, bw=Math.min(18,slot-5);
  const ab2=tid=>{const t=_teams.find(x=>x.id===Number(tid));
    return (t&&t.abbrev)||teamInitials((t&&t.name)||'');};
  const bars=rows.map((r,i)=>{
    const v=val(r), cx=slot*i+slot/2;
    const h=Math.max(1.5,Math.abs(v)/mx*half);
    const y=v>=0?mid-h:mid;
    const col=v>0?'#3fd07a':v<0?'#e8687e':'rgba(255,255,255,0.20)';
    return `<rect x="${(cx-bw/2).toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}"
        height="${h.toFixed(1)}" rx="2" fill="${col}"/>
      <text x="${cx.toFixed(1)}" y="${(H-6).toFixed(1)}" text-anchor="middle"
        font-size="7.5" font-weight="700" fill="#7b7b7b"
        font-family="Inter,sans-serif">${ab2(r.teamId)}</text>`;
  }).join('');
  return `<div class="ld-chart">
    <div class="ld-chart-h"><span>${title}</span><span class="ld-chart-mx">peak ${bucksFmt(mx)}</span></div>
    <svg class="ld-chart-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${title}">
      <line x1="0" y1="${mid}" x2="${W}" y2="${mid}"
        stroke="#7b7b7b" stroke-opacity="0.35" stroke-width="1"/>
      ${bars}
    </svg>
  </div>`;
}

/* ── Bankroll: where you stand since week one ───────────────────────────────
   The balance now carries over, but it also takes an allowance every cycle, so
   a rising balance does not by itself mean a manager is any good at this. What
   does is the profit banked each week — returns minus stakes on everything
   settled — carried forward, which is what this line still plots. The line
   opens at 100 the week before the first bet, so the start sits on the same
   footing as any other week and every move after it is real profit or loss.

   Open bets are left out: their stake is committed but their return is not
   known yet, so counting them would show a loss that may not happen. */
function bankSeries(){
  const mine=betsMine().filter(b=>b.status!=='open'&&betIsLive(b));
  const byWeek={};
  /* Bucketed by the calendar week the bet was placed in rather than by the
     bucks cycle it belongs to. For the league those are the same Tuesday and
     nothing moves; on a short test cycle they are not, and this is what keeps
     the chart to one point a week instead of one every half hour. */
  /* A week key parses back to midnight, and midnight on a Tuesday is before
     the 6am boundary — so stepping straight off it lands in the week before the
     one meant. Everything derived from a key is nudged to midday first, which
     is clear of that edge and of daylight saving at both ends. */
  const NOON=12*3600*1000;
  const wkOf=b=>{
    const t=Number(b.ts)||0;
    if(t) return realWeekKey(t);
    const p=bucksWeekParts(b.wk);
    return p?realWeekKey(p.d.getTime()+NOON):String(b.wk||'');
  };
  mine.forEach(b=>{ const k=wkOf(b); byWeek[k]=(byWeek[k]||0)+((b.ret||0)-(b.stake||0)); });
  const weeks=Object.keys(byWeek).sort();
  if(!weeks.length) return null;
  /* one week before the first bet, so the line opens on the same footing as
     any other week */
  const back=d=>{
    const p=bucksWeekParts(d);
    return p?realWeekKey(p.d.getTime()+NOON-7*24*3600*1000):d;
  };
  /* What the betting has won or lost, opening at nothing. It used to plot the
     balance and sit the baseline on the opening $100, which made the same line
     say two things at once — how the bets had gone, and how much money was in
     the account. The account is in the nav; this is the betting. Zero is level,
     above is up, below is down. */
  const pts=[{wk:back(weeks[0]),val:0,delta:0,start:true}];
  let run=0;
  weeks.forEach(w=>{ run+=byWeek[w]; pts.push({wk:w,val:run,delta:byWeek[w]}); });
  return {pts,net:run};
}
/* The chart stretches to whatever width it is given, which means the viewBox is
   scaled unevenly — x by about half, y not at all. Strokes survive that via
   vector-effect, but text does not: the labels came out squashed to half width
   at full height. They are HTML now, positioned to the same x as the points, so
   they are drawn by the page rather than the stretched canvas. */
function bankAxisHTML(pts,W=600,padL=8,padR=8){
  return pts.map((p,i)=>{
    if(pts.length>7 && i%2 && i!==pts.length-1) return '';
    const x=padL+(pts.length<2?0:i*(W-padL-padR)/(pts.length-1));
    const pct=(x/W*100).toFixed(2);
    const shift=i===0?'0':i===pts.length-1?'-100%':'-50%';
    const d=p.start?'Start':bucksWeekLabel(p.wk);
    return `<span class="bank-x" style="left:${pct}%;transform:translateX(${shift})">${d}</span>`;
  }).join('');
}
function bankChartSVG(pts,W=600,H=114){
  const padL=8,padR=8,padT=12,padB=10;
  const vals=pts.map(p=>p.val);
  let lo=Math.min(...vals,0), hi=Math.max(...vals,0);
  if(hi-lo<20){ const m=(hi+lo)/2; lo=m-10; hi=m+10; }
  const pad=(hi-lo)*0.15; lo-=pad; hi+=pad;
  const x=i=>padL+(pts.length<2?0:i*(W-padL-padR)/(pts.length-1));
  const y=v=>padT+(hi-v)/(hi-lo)*(H-padT-padB);
  const base=y(0);                       // break even, the same as the portfolio
  const line=pts.map((p,i)=>`${i?'L':'M'}${x(i).toFixed(1)},${y(p.val).toFixed(1)}`).join(' ');
  const area=`${line} L${x(pts.length-1).toFixed(1)},${base.toFixed(1)} L${x(0).toFixed(1)},${base.toFixed(1)} Z`;
  const up=pts[pts.length-1].val>=0;
  const col=up?'#3fd07a':'#e8687e';
  const dots=pts.map((p,i)=>{
    const last=i===pts.length-1;
    return `<circle cx="${x(i).toFixed(1)}" cy="${y(p.val).toFixed(1)}" r="${last?4:2.6}"
      fill="${p.start?'var(--text3)':col}" ${last?`stroke="var(--bg2)" stroke-width="2"`:''}/>`;
  }).join('');
  return `<svg class="bank-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img"
      aria-label="GFL Bucks profit by week">
    <defs><linearGradient id="bankfill" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${col}" stop-opacity="0.30"/>
      <stop offset="100%" stop-color="${col}" stop-opacity="0"/>
    </linearGradient></defs>
    <line x1="${padL}" y1="${base.toFixed(1)}" x2="${W-padR}" y2="${base.toFixed(1)}"
      stroke="var(--text3)" stroke-opacity="0.35" stroke-width="1" stroke-dasharray="3 3"/>
    <path d="${area}" fill="url(#bankfill)"/>
    <path d="${line}" fill="none" stroke="${col}" stroke-width="2.2"
      stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
    ${dots}
  </svg>`;
}
function bankHTML(){
  if(!_me) return '';
  const s=bankSeries();
  const net=s?s.net:0;
  const even=net===0;
  const up=net>0;
  /* an exact break-even is neither up nor down, so it takes the neutral colour
     and drops the sign rather than reading "+$0" */
  const col=even?'var(--text2)':up?'#3fd07a':'#e8687e';
  return `<div class="bank-sec">
    <div class="bank-head">
      <span class="bank-t">Where you stand</span>
      <span class="bank-net" style="color:${col}">${even?'':up?'+':'−'}${bucksFmt(Math.abs(net))}</span>
    </div>
    ${s?`<div class="bank-chart">${bankChartSVG(s.pts)}
        <div class="bank-axis">${bankAxisHTML(s.pts)}</div></div>
      <div class="bank-foot">
        <span>${s.pts.length-1} week${s.pts.length-1===1?'':'s'} settled</span>
        <span class="bank-state" style="color:${col}">${even?'Break even':up?'In the black':'In the red'}</span>
      </div>`
    :`<div class="bank-empty">Nothing settled yet — the line starts once your first bets are graded.</div>`}
  </div>`;
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
/* ── CASHING OUT ─────────────────────────────────────────────────────────────
   A bet you have not seen a minute of football on is not really a bet yet, so
   it comes back at face value — that is a withdrawal, and it is what the old
   Remove button did. Everything after that is a cash out: the book buys the
   ticket back at what it is currently worth, and what it is worth changes as
   the season moves under it.

   The two kinds of market behave differently on purpose, because they settle
   differently.

   A WEEKLY leg is decided in one afternoon. Once its games are running there is
   no honest price for it — the result is half known and moving fast, and any
   number the book put up would be either a gift or a robbery depending on which
   way the last hour went. So a weekly leg under way locks the whole ticket,
   parlay included: you ride it out. If it comes in and nothing else weekly is
   still running, the ticket is only season markets again and cashing out comes
   back. If it goes down the bet is dead and there is nothing to buy back.

   A SEASON leg is settled months out and a single Sunday barely moves it, which
   is exactly why a real book will trade it all year. Those stay cashable the
   whole way, at a price that walks from almost nothing up towards the full
   payout as the legs come good. */
const CASHOUT_HOLD=0.08;          // the book's cut for buying a ticket back
const CASHOUT_MIN=0.05;           // below this there is nothing to hand over

/* ── SETTLING A WEEK ─────────────────────────────────────────────────────────
   betLegResult grades the season book and returns null for every weekly market
   — which meant a ticket carrying one never settled at all, cash out or no.
   These settle off the week's own scoreboard, which is already in the season
   meta, so no fetch is involved.

   Nothing grades until every game in the week has a score on it. A week half
   played has no answer to "who scored the most", and answering it early would
   settle a bet on a Sunday afternoon that Monday night was going to overturn. */
function betWeekResult(leg,season,wk){
  const meta=_seasonMeta[String(season)]; if(!meta) return null;
  const owners=meta.owners||{};
  const games=(meta.schedule||[]).filter(m=>Number(m.matchupPeriodId)===Number(wk)&&m.home&&m.away);
  if(!games.length) return null;
  const played=m=>(m.home.totalPoints||0)>0||(m.away.totalPoints||0)>0;
  if(!games.every(played)) return null;
  const mk=String(leg.mk), bits=String(leg.pick).split(':'), ent=bits[0], side=bits[1];
  const pts={};
  games.forEach(m=>{ pts[owners[m.home.teamId]]=m.home.totalPoints||0;
                     pts[owners[m.away.teamId]]=m.away.totalPoints||0; });

  /* the three markets written on one fixture carry both team ids in the key */
  const g3=/^wk\d+-(\d+)-(\d+)-(ml|sp|tot)$/.exec(mk);
  if(g3){
    const a=Number(g3[1]), b=Number(g3[2]);
    const gm=games.find(m=>(m.home.teamId===a&&m.away.teamId===b)||(m.home.teamId===b&&m.away.teamId===a));
    /* THE FIXTURE WAS MOVED, SO THE BET IS OFF. Every game in this week has
       already been played by the time we get here, so a pairing that is not
       among them is one that will never be played — the schedule changed after
       the ticket was written. Returning null left it open for good, with the
       stake deducted and no way back except cashing out by hand. A push returns
       it: nobody should lose money because a fixture moved, and nobody should
       be paid for a game that was never played either. */
    if(!gm) return 'push';
    const hp=gm.home.totalPoints||0, ap=gm.away.totalPoints||0;
    if(g3[3]==='tot'){
      const m2=/([\d.]+)/.exec(leg.pickLabel||''); const line=m2?Number(m2[1]):null;
      if(line==null) return null;
      const tot=hp+ap;
      return tot===line?'push':(side==='under'||ent==='under')?tot<line:tot>line;
    }
    const mine=owners[gm.home.teamId]===ent?hp:ap;
    const theirs=owners[gm.home.teamId]===ent?ap:hp;
    if(g3[3]==='ml') return mine===theirs?'push':mine>theirs;
    /* the spread is only ever sold on the favourite, and the number it was
       struck at is in the label rather than the key */
    const m3=/[\u2212-]\s*([\d.]+)/.exec(leg.pickLabel||'');
    const sp=m3?Number(m3[1]):null;
    if(sp==null) return null;
    const d=mine-theirs-sp;
    return d===0?'push':d>0;
  }
  /* highest and lowest team score of the week */
  const ends=/^wk\d+-(high|low)$/.exec(mk);
  if(ends){
    const vals=Object.values(pts);
    if(pts[ent]==null) return null;
    const target=ends[1]==='high'?Math.max.apply(null,vals):Math.min.apply(null,vals);
    /* a tie at the top pushes rather than paying both */
    const share=vals.filter(v=>v===target).length;
    if(pts[ent]!==target) return false;
    return share>1?'push':true;
  }
  /* the closest game and the biggest blowout, keyed by fixture */
  const shape=/^wk\d+-(close|blow)$/.exec(mk);
  if(shape){
    const gm=/^g(\d+)-(\d+)$/.exec(ent);
    if(!gm) return null;
    /* Matched on the PAIR rather than on home-then-away. The key is written
       home first, so a fixture that survived the reschedule with the two sides
       swapped used to look like a fixture that had vanished. */
    const pair=m=>[m.home.teamId,m.away.teamId].sort((x,y)=>x-y).join('-');
    const want=[Number(gm[1]),Number(gm[2])].sort((x,y)=>x-y).join('-');
    const marg=games.map(m=>({k:pair(m),
      d:Math.abs((m.home.totalPoints||0)-(m.away.totalPoints||0))}));
    const mine=marg.find(x=>x.k===want);
    /* the fixture is not in this week any more — see the push above */
    if(!mine) return 'push';
    const ds=marg.map(x=>x.d);
    const target=shape[1]==='close'?Math.min.apply(null,ds):Math.max.apply(null,ds);
    if(mine.d!==target) return false;
    return ds.filter(d=>d===target).length>1?'push':true;
  }
  /* ── PICK 'EM: which of the three actually scored most ──────────────────
     The three player ids are in the market key, so the ticket carries its own
     field and can be graded long after the projections that chose them moved.
     Settles off the same lineups feed the donut and top-scorer markets read,
     which records what a STARTED player scored — a player left on the bench
     did nothing for anybody that week and cannot win it. A dead heat pushes. */
  const pe=/^wk\d+-pe([\d_]+)$/.exec(mk);
  if(pe){
    const pids=pe[1].split('_').map(Number).filter(n=>n>0);
    if(pids.length<2) return null;
    try{ loadLineups(); }catch(e){}
    const L=_lineups&&_lineups[String(season)];
    const rowsW=L&&L.weeks&&(L.weeks[String(wk)]||L.weeks[Number(wk)]);
    if(!rowsW) return null;                       // feed not in yet
    const got={};
    Object.keys(rowsW).forEach(tid=>(rowsW[tid]||[]).forEach(row=>{
      const pid=Number(row&&row[0]), p=Number(row&&row[1]);
      if(pids.includes(pid)&&isFinite(p)) got[pid]=p;
    }));
    /* nobody in the group started — there is no result to settle against */
    if(!Object.keys(got).length) return null;
    const mine=Number(String(ent).replace(/^p/,''));
    const scored=pids.map(p=>({p,v:got[p]!=null?got[p]:-Infinity}));
    const best=Math.max(...scored.map(s=>s.v));
    const winners=scored.filter(s=>s.v===best).map(s=>s.p);
    if(!winners.includes(mine)) return false;
    return winners.length>1?'push':true;
  }
  /* Anybody in the lineup on a zero. Settles off the week's starting lineups
     rather than the team total, so it needs the lineups dataset — kicked off
     here and left ungraded until it lands, the same way the player markets are.
     D/ST carries a negative player id in that feed, which is how it is dropped:
     the question is about a person having a bad Sunday. */
  if(/^wk\d+-donut$/.test(mk)){
    if(pts[ent]==null) return null;
    try{ loadLineups(); }catch(e){}
    const L=_lineups&&_lineups[String(season)];
    if(!L||!L.weeks) return null;
    const tid=Object.keys(owners).find(id=>owners[id]===ent);
    if(tid==null) return null;
    const arr=(L.weeks[String(wk)]||L.weeks[Number(wk)]||{})[tid];
    if(!arr||!arr.length) return null;
    const starters=arr.filter(([pid])=>Number(pid)>0);
    if(starters.length<5) return null;             // a partial lineup grades nothing
    const donut=starters.some(([,v])=>Number(v)<=0);
    return donut===(side!=='no');
  }
  /* ── THE TWO TOP-SCORER MARKETS ─────────────────────────────────────────
     wk<N>-player is the league's highest scorer of the week; tt<owner>-<week>
     is the same question asked of one roster. Both settle off the lineups feed
     the donut already reads, which carries what each started player scored —
     so "top scorer" means the best player anybody actually started, which is
     what the market says and what the board is built from.

     Neither had a case here at all. They graded null every time, which reads
     as "not finished yet" and left the ticket open for good. */
  const teamTop=(/^tt(.+)-\d+$/.exec(mk)||[])[1];
  if(/^wk\d+-player$/.test(mk)||teamTop){
    try{ loadLineups(); }catch(e){}
    const L=_lineups&&_lineups[String(season)];
    const rows=L&&L.weeks&&L.weeks[wk];
    if(!rows) return null;                       // feed not in yet — ask again later
    let best=-Infinity, who=[];
    Object.keys(rows).forEach(tid=>{
      if(teamTop&&owners[tid]!==teamTop) return; // one roster for the By Team market
      (rows[tid]||[]).forEach(row=>{
        const pid=String(row&&row[0]), p=Number(row&&row[1]);
        if(!pid||!isFinite(p)) return;
        if(p>best){ best=p; who=[pid]; }
        else if(p===best) who.push(pid);
      });
    });
    if(!who.length) return null;
    if(ent==='field'){
      /* The named pids ride along on the pick. Without them there is no honest
         way to say what "anyone else" excluded, so it stays ungraded. */
      const named=String(side||'').split('-').filter(Boolean);
      if(!named.length) return null;
      return who.every(p=>!named.includes(p));
    }
    const one=/^p(\d+)$/.exec(ent);
    if(!one) return null;
    if(!who.includes(one[1])) return false;
    return who.length>1?'push':true;             // a tie at the top is a push
  }
  return null;
}
/* Which week a leg belongs to, or null if it is a season-long market. Weekly
   keys are wk{N}-… for the board markets and fa{pid}-{N} for a FAAB line. */
function betLegWeek(mk){
  let m=/^wk(\d+)-/.exec(String(mk||''));       if(m) return Number(m[1]);
  m=/^fa\d+-(\d+)$/.exec(String(mk||''));       if(m) return Number(m[1]);
  /* The By Team board's top-scorer market is keyed by owner rather than by
     week number — tt<owner>-<week> — so it read as a season leg and stayed open
     through Sunday with the scoreboard in plain sight. It is a one-week
     question like every other wk* market and closes with them. */
  m=/^tt[a-z0-9_-]+-(\d+)$/i.exec(String(mk||''));  if(m) return Number(m[1]);
  return null;
}
const betAnyPlayed=(meta,wk)=>((meta&&meta.schedule)||[]).some(m=>m.home&&m.away
  &&(wk==null||Number(m.matchupPeriodId)===Number(wk))
  &&((m.home.totalPoints||0)>0||(m.away.totalPoints||0)>0));
const betWeekStarted=(season,wk)=>betAnyPlayed(_seasonMeta[String(season)],wk);
const betSeasonStarted=season=>betAnyPlayed(_seasonMeta[String(season)],null);

/* What a leg is worth NOW rather than when it was taken. The board reprices
   every render, so a team that has since run away with it reads as close to
   certain and a team that has fallen apart is close to nothing — which is the
   whole reason a cash-out number moves. Anything no longer on the board (a
   market since retired, a week gone by) falls back to the price it was struck
   at, which is the last honest number anyone quoted for it. */
function betLegProb(leg){
  const fallback=probFromAm(leg.odds);
  try{
    const m=sbAllMarkets().find(x=>x.key===leg.mk);
    if(m){
      const bits=String(leg.pick).split(':'), ent=bits[0], side=bits[1];
      const pk=(m.picks||[]).find(x=>String(x.owner)===ent);
      if(pk){
        if(m.type==='yesno'&&pk.yes!=null) return probFromAm(side==='no'?pk.no:pk.yes);
        if(pk.over!=null&&pk.under!=null)  return probFromAm(side==='u'?pk.under:pk.over);
        if(pk.odds!=null)                  return probFromAm(pk.odds);
      }
    }
  }catch(e){}
  return fallback;
}
/* null when there is nothing to offer, otherwise {ok, amount, full} or a
   {ok:false, why} the card can print instead of a button. */
function betCashOut(b){
  if(!_me||!b||b.owner!==_me.k1||b.status!=='open'||!betIsLive(b)) return null;
  const season=b.season||getSeason();
  const legs=b.legs||[];
  if(!legs.length) return null;
  let anyStarted=false, weeklyLive=false, p=1;
  for(const l of legs){
    const res=betLegResult(l,season);
    if(res===false) return {ok:false,why:'A leg has already gone down.'};
    const wk=betLegWeek(l.mk);
    const started=wk!=null?betWeekStarted(season,wk):betSeasonStarted(season);
    if(started) anyStarted=true;
    /* "in play" is about the football, not the grading: a week that has begun
       and not finished locks the ticket even if the leg is ungradeable. */
    if(wk!=null&&started&&res===null) weeklyLive=true;
    if(res===null) p*=Math.min(0.99,Math.max(0.005,betLegProb(l)));
  }
  if(weeklyLive) return {ok:false,why:'A weekly leg is under way — ride it out.'};
  /* nothing has kicked off: this is a withdrawal, not a trade */
  if(!anyStarted) return {ok:true,amount:bucks2(b.stake),full:true};
  const val=Math.max(0,(b.payout||0)*p*(1-CASHOUT_HOLD));
  if(val<CASHOUT_MIN) return {ok:false,why:'Not worth buying back.'};
  return {ok:true,amount:Math.min(bucks2(b.payout||0),bucks2(val)),full:false};
}
/* Kept as its own name because the invite card still asks the question. */
function betCancellable(b){ const c=betCashOut(b); return !!(c&&c.ok); }
async function sbCashOut(id){
  const b=(_bets||[]).find(x=>x.id===id);
  if(!b||_betBusy) return;
  const co=betCashOut(b);
  if(!co||!co.ok) return;
  _betBusy=true; _betErr=null; renderMyBets();
  /* A withdrawal before kickoff is void — it never really happened, and the
     week's balance should read as though it had not. A cash out is a settled
     bet with a return, which may be more or less than the stake. */
  const status=co.full?'void':'cashed';
  const mask='updateMask.fieldPaths=status&updateMask.fieldPaths=ret&updateMask.fieldPaths=settledTs';
  try{
    const r=await fetch(`${betBase()}/${encodeURIComponent(id)}?${msgKey()}&${mask}`,
      {method:'PATCH',headers:{'Content-Type':'application/json'},
       body:JSON.stringify(fsOut({status,ret:String(co.amount),settledTs:String(Date.now())}))});
    if(r.ok){ b.status=status; b.ret=co.amount; b.settledTs=Date.now(); }
    else _betErr=r.status===403?'rules':'send';
  }catch(e){ _betErr='offline'; }
  _betBusy=false; renderMyBets();
}
/* Deliberately a function declaration and not a const alias: these are called
   from inline onclick attributes, which resolve against the global object, and
   a top-level const in a classic script never lands there. */
async function sbVoidBet(id){ return sbCashOut(id); }

/* Clearing a finished bet off the stack hides the row; it never deletes it and
   never touches the ledger. The week's balance is derived by replaying every
   bet in it, so a cleared loss must still have cost its stake and a cleared win
   must still have paid — hiding only decides what the list shows. */
function betsClearable(){ return betsMine().filter(b=>b.status!=='open'&&!b.hidden&&betIsLive(b)); }
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
   A leg is graded only when its market has an answer, and every market on the
   board is now written against the regular season — so the whole book settles
   the moment the regular season is final, rather than waiting on a bracket.
   The retired markets keep their cases below: they can no longer be bet, but a
   slip written before they came off must still be able to settle.
   Returns null for "cannot grade yet", true/false once it can. */
function betLegResult(leg,season){
  /* weekly markets settle off their own scoreboard, not off the season finals */
  const wk=betLegWeek(leg.mk);
  if(wk!=null) return betWeekResult(leg,season,wk);
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
    /* Off the board, still graded. Both markets were taken down, but a bet
       taken on one before that is still a bet and has to settle. */
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
/* How far along a season is, in one string. The cache is stamped with it so
   that "this season is not decided yet" is remembered only for as long as it
   stays true. It used to cache a bare null, which meant a session open at the
   moment a season finalised went on answering "still running" until it was
   reloaded — and every season future in it stayed unsettled. */
function sbFinalsStamp(meta){
  const T=meta.teams||{};
  const scored=(meta.schedule||[]).filter(m=>m.home&&m.away
    &&((m.home.totalPoints||0)>0||(m.away.totalPoints||0)>0)).length;
  const ranked=Object.keys(T).filter(id=>(T[id].rank||0)>0).length;
  return scored+'|'+ranked+'|'+Object.keys(T).length;
}
function sbFinals(season){
  const meta=_seasonMeta[season];
  if(!meta) return null;                              // not loaded — ask again later
  const stamp=sbFinalsStamp(meta);
  const hit=_finalsCache[season];
  if(hit&&hit.stamp===stamp) return hit.val;
  const keep=val=>((_finalsCache[season]={stamp,val}),val);
  const owners=meta.owners||{}, T=meta.teams||{}, regEnd=regEndOf(season);
  const ids=Object.keys(T);
  const champId=ids.find(id=>T[id].rank===1);
  if(!ids.length||champId==null) return keep(null);
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
  if(!played.length) return keep(null);

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

  return keep({
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
  if(pushes===res.length)    return {status:'push',ret:bucks2(bet.stake)};
  return {status:'won',ret:bucks2(bet.payout)};
}

// ── SPORTSBOOK UI ────────────────────────────────────────────────────────────
/* Every market left on the board is written against the regular season, so
   they all settle on the same afternoon. Splitting them across Futures, Team
   Props and Achievements implied three different deadlines that no longer
   exist — they are one board now. */
/* Regular Season and By Team share the top row; This Week takes the full width
   underneath, since it is the one that changes every week and wants the room. */
/* Order is the layout: on a phone these fill a two-column grid row by row, so
   the list reads This Week / Regular Season across the top and By Team /
   Investments underneath. This Week leads because it is the only one of the
   four that goes stale — the others are the same board in May as in December. */
const SB_GROUPS=[
  {k:'week',label:'This Week',icon:'fa-bolt'},
  {k:'season',label:'Regular Season',icon:'fa-trophy'},
  {k:'team',label:'By Team',icon:'fa-id-badge'},
  {k:'invest',label:'Investments',icon:'fa-chart-line'},
];
function sbAvatar(owner,size){
  const fr=_franchises.find(f=>f.owner===owner);
  return fr?avatarCore(fr.name,fr.teamId||0,proxyLogo(fr.logo),size||24,7):'';
}
function sbTeamAb(owner,name){ return drAbbr(owner,name); }
function sbSel(mk,pick){ return _slip.some(x=>x.k===mk+'|'+pick); }
/* A MARKET CLOSES WHEN ITS OWN WEEK KICKS OFF — NOT WHEN ANY WEEK DOES.

   Once a week's football is under way its prices are stale: the result is
   partly known and the number no longer reflects it. Books take a board down at
   kickoff for exactly that reason. Season futures stay open, the way they do at
   a real book — they settle months out and a single Sunday does not decide one.

   Whose week it is matters, because sbWeekData already rolls the board forward:
   a week counts as played the moment it holds a single point, so from Thursday
   night the board is printing NEXT week's fixtures. Testing "has any football
   started" therefore locked markets for a week nobody had played yet, and the
   entire weekly board sat dead from the first kickoff until Tuesday morning.

   Asking about the market's own week instead gives the league a board every day
   without ever pricing a game that is already running: the week being played is
   closed, the week ahead is open, and its numbers move as each day's results
   land and the power ratings behind them are rebuilt. */
function sbWeekLocked(wk,mk){
  if(wk==null) return weekHasStarted();          // no week named: the old blunt test
  const season=sbBoardSeason();
  const started=betWeekStarted(season,wk);
  const liveNow=nflWeekLive(wk,season);          // true | false | null when unknown
  if(!started){
    /* Not a point on the board yet. Open — unless a game of that week has
       actually kicked off, which is the moment before the first score lands and
       is exactly what a scoreboard can see and a fantasy total cannot. */
    return liveNow===true;
  }
  /* UNDER WAY. Only the three markets written on a single fixture can be priced
     from here, because only they have banked-plus-still-to-come behind them.
     Everything else weekly — top score, low score, closest game, the blowout,
     top player, the donut, By Team's top scorer — is partly decided the moment
     there are scores on the board, and there is no honest number for a question
     you can half-read off the scoreboard. Those stay shut until the week is done.

     Season futures never come through here at all: they settle months out and a
     single Sunday does not decide one. */
  if(!/-(ml|sp|tot)$/.test(String(mk||''))) return true;
  /* Live, or no digest to be sure with. Shut either way — the whole point is
     that nothing is priced while the football is running. */
  return liveNow!==false;
}
function sbBtn(mk,mkLabel,pick,pickLabel,odds,extra,btnLabel){
  if(odds==null) return `<span class="sb-odds sb-odds-off">—</span>`;
  /* A WEEKLY MARKET WITH THE FOOTBALL ALREADY RUNNING IS SHOWN BUT DEAD.

     This tested SB_EXCLUSIVE, which is /-(ml|sp|tot)$/ — the three markets
     written on a single fixture. Every other weekly market missed the test and
     stayed open all Sunday: Top Score, Low Score, Closest Game, Biggest
     Blowout, Top Player, the Donut, the FAAB ladder and By Team's Top Scorer.
     Those are the ones worth having open, too — by Sunday evening you can read
     the top score off the scoreboard and see whose starter has a zero.

     A fantasy week has no half-time. Every manager's roster plays across
     Thursday, Sunday and Monday, so from the first kickoff to the last whistle
     there is no moment when nothing is in play — which is why the whole weekly
     board closes together and only the season futures stay up. */
  const mkWk=betLegWeek(mk);
  if(mkWk!=null&&sbWeekLocked(mkWk,mk))
    return `<span class="sb-odds sb-odds-lock" title="Closed — the week is under way">
      ${btnLabel?`<span class="sb-o-lbl">${btnLabel}</span>`:''}
      <span class="sb-o-val"><i class="fa fa-lock"></i></span></span>`;
  const on=sbSel(mk,pick)?' on':'';
  const args=[mk,mkLabel,pick,pickLabel,odds].map(v=>typeof v==='string'?`'${String(v).replace(/'/g,"\\'")}'`:v).join(',');
  return `<button class="sb-odds${on}${extra?' '+extra:''}" data-k="${mk}|${pick}" onclick="sbPick(${args})">
    ${btnLabel?`<span class="sb-o-lbl">${btnLabel}</span>`:''}<span class="sb-o-val">${amFmt(odds)}</span></button>`;
}
/* A price with money behind it shows how far it has come off the opening
   line. Shorter is the crowd's side and pays less; longer is what is left for
   anyone willing to take the other one. Without this the board just quietly
   changes and nobody can tell it is doing anything. */
function sbDrift(open,now){
  if(open==null||now==null||open===now) return '';
  /* American prices are not a number line — -150 is shorter than +150 — so
     the comparison has to happen in probability, where bigger is shorter. */
  const shorter=probFromAm(now)>probFromAm(open);
  return `<span class="sb-drift ${shorter?'dn':'up'}" title="Opened at ${amFmt(open)}">
    <i class="fa fa-caret-${shorter?'down':'up'}"></i></span>`;
}
function sbMarketHTML(m){
  const rows=m.picks.map(p=>{
    /* A pick carries its own graphic when it is not a franchise — a headshot
       for a player market, nothing at all for a matchup. */
    const nm=p.av!=null
      ? `<span class="sb-tm sb-tm-free">${p.av}<span class="sb-txt"><span class="sb-nm">${p.name}</span>${
          p.ab?`<span class="sb-ab">${p.ab}</span>`:''}</span></span>`
      : `<span class="sb-tm">${sbAvatar(p.owner,22)}<span class="sb-nm">${p.name}</span><span class="sb-ab">${sbTeamAb(p.owner,p.name)}</span></span>`;
    if(m.type==='outright'){
      return `<div class="sb-row">${nm}
        <span class="sb-imp">${sbDrift(p.open,p.odds)}<span class="sb-imp-v">${(p.prob*100).toFixed(1)}%</span></span>
        ${sbBtn(m.key,m.title,p.owner,p.name,p.odds)}</div>`;
    }
    if(m.type==='yesno'){
      /* one column: the header already says Yes, so the button carries the
         price alone rather than repeating the word on every row */
      if(m.yesOnly) return `<div class="sb-row sb-row1">${nm}
        ${sbBtn(m.key,m.title,p.owner+':yes',p.name+' — Yes',p.yes)}</div>`;
      return `<div class="sb-row sb-row2">${nm}
        ${sbBtn(m.key,m.title,p.owner+':yes',p.name+' — Yes',p.yes,'sb-two','Yes')}
        ${sbBtn(m.key,m.title,p.owner+':no',p.name+' — No',p.no,'sb-two','No')}</div>`;
    }
    const ln=m.key==='wins'?p.line.toFixed(1):p.line.toFixed(1);
    return `<div class="sb-row sb-row2">${nm}
      ${sbBtn(m.key,m.title,p.owner+':o',`${p.name} — Over ${ln}`,p.over,'sb-two','O '+ln)}
      ${sbBtn(m.key,m.title,p.owner+':u',`${p.name} — Under ${ln}`,p.under,'sb-two','U '+ln)}</div>`;
  }).join('');
  const el=m.entLabel||'Team';
  const head=m.type==='outright'
    ? `<div class="sb-row sb-head"><span>${el}</span><span class="sb-imp">Implied</span><span class="sb-oh">Odds</span></div>`
    : m.type==='yesno'
      ? (m.yesOnly
        ? `<div class="sb-row sb-row1 sb-head"><span>${el}</span><span class="sb-oh">Yes</span></div>`
        : `<div class="sb-row sb-row2 sb-head"><span>${el}</span><span class="sb-oh">Yes</span><span class="sb-oh">No</span></div>`)
      : `<div class="sb-row sb-row2 sb-head"><span>${el}</span><span class="sb-oh">Over</span><span class="sb-oh">Under</span></div>`;
  /* Ten markets of twelve rows each is a very long page to scroll past to
     reach the one you wanted. Each folds behind its own title; the first opens
     by default so the board is never a wall of closed bars. Open state is kept
     per market so a bet does not close what you were reading. */
  const open=!!_sbOpenMk[m.key];
  /* sb-fold is what the folding CSS keys on, and only blocks that actually
     fold may carry it. Team Card builds its own .sb-market by hand and stays
     open — without the class being opt-in it inherited display:none on its
     rows with no header to open them, which is why By Team came up blank. */
  return `<div class="sb-market sb-fold${open?' open':''}" data-mk="${m.key}">
    <button class="sb-mhead" onclick="sbToggleMk('${m.key}')" aria-expanded="${!!open}">
      <i class="fa ${m.icon}"></i><span class="sb-mt">${m.title}</span>
      <i class="fa fa-chevron-down sb-mchev"></i>
    </button>
    <div class="sb-rows"><div class="sb-rows-in">
      <div class="sb-msub-in">${m.sub}</div>${head}${rows}
    </div></div>
  </div>`;
}
/* which market is open, and which one opens itself */
/* The week's matchup board opens with the page. It is the first thing on the
   view the sportsbook now lands on, and a closed bar as the answer to "what is
   on this week" is a tap in front of the only thing anybody came for. Every
   other market still starts shut. */
let _sbOpenMk={'wk-board':true};
/* Toggles the class in place rather than repainting the board. Re-rendering
   destroyed the panel and built a new one, so there was nothing left to
   transition — the fold snapped open however it was styled. */
function sbToggleMk(k){
  _sbOpenMk[k]=!_sbOpenMk[k];
  const el=document.querySelector('.sb-fold[data-mk="'+CSS.escape(k)+'"]');
  if(!el){ renderBook(); return; }
  el.classList.toggle('open',_sbOpenMk[k]);
  const b=el.querySelector('.sb-mhead');
  if(b) b.setAttribute('aria-expanded',String(!!_sbOpenMk[k]));
}
/* the one funnel for "the bets changed", so the nav balance is repainted from
   here rather than from the sportsbook — the number is in the bar on every
   page, including the pages that never draw a bet */
function renderMyBets(){ try{ renderBucksChip(); }catch(e){} if(_activeTab==='book') renderBook(); }
let _betsInit=false;
/* ── GOING IN ON A PARLAY TOGETHER ──────────────────────────────────────────
   An invitation is just another bet document, owned by the person invited and
   parked at status 'invite'. It carries the original's legs, price and stake —
   the whole point is that both are in for the same — plus who sent it and which
   bet it came from. Accepting flips it to 'open' and it grades like any other;
   declining flips it to 'declined'. Neither state counts as money staked, and
   nothing is ever deleted, which is what the Firestore rules require anyway. */
let _inviteFor=null,_inviteErr=null;
/* How many people one bet may be opened up to. Declining gives the seat back:
   the cap is on how many are in or still being asked, not on how many were
   ever approached. */
const INVITE_MAX=4;
/* An invitation belongs to the bucks week it was raised in. Accepting it after
   that would stake this week's allowance on markets that have already been
   decided — a free look at a known result — so it lapses at the reset. Within
   its own week it stays live right through kickoff: getting in on a parlay
   while the games are running is the point of it. */
function inviteLapsed(inv){
  if(!inv) return true;
  if(inv.wk!==bucksWeekKey()) return true;
  const src=(_bets||[]).find(b=>b.id===inv.srcBet);
  return !!src&&src.status!=='open';
}
/* Only the manager who built the bet can open it up. Someone who came in on an
   invitation holds a copy, not the original, and a copy cannot be passed on. */
const canInviteOn=b=>!!_me&&!!b&&b.owner===_me.k1&&b.status==='open'&&!b.invitedBy;
/* asked or in — a declined seat is free again */
const betInviteSeats=id=>betInvitesFor(id)
  .filter(x=>x.status!=='declined'&&x.status!=='void').length;
/* the league's sign-in accounts, which is what a bet is owned by */
function betAccounts(){
  return _teams.map(t=>({k1:keySlug(t.abbrev||teamInitials(t.name)),name:t.name}))
    .filter(x=>x.k1);
}
const betAccountName=k1=>(betAccounts().find(a=>a.k1===k1)||{}).name||k1;
/* everyone already holding an invitation to this bet */
const betInvitesFor=id=>(_bets||[]).filter(b=>b.srcBet===id);
function betInviteOpen(id){ _inviteFor=(_inviteFor===id?null:id); _inviteErr=null; renderMyBets(); }
async function sbSendInvite(betId,to){
  if(!_me||_betBusy||!to) return;
  const src=(_bets||[]).find(b=>b.id===betId);
  if(!canInviteOn(src)) return;
  if(betInvitesFor(betId).some(b=>b.owner===to)) return;   // already asked
  if(betInviteSeats(betId)>=INVITE_MAX){ _inviteErr='full'; renderMyBets(); return; }
  _betBusy=true; _inviteErr=null; renderMyBets();
  /* Derived from the bet and the person rather than the clock. Two managers
     inviting the same person in the same millisecond used to race for one id;
     and a second attempt at the same person now lands on the same document
     instead of quietly making a duplicate invitation. */
  const id=`inv-${betId}-${to}`.replace(/[^a-zA-Z0-9-]/g,'').slice(0,80);
  const body=fsOut({
    owner:to, team:'', season:String(src.season||sbSeason()),
    wk:src.wk, ts:String(Date.now()),
    stake:String(src.stake), odds:String(src.odds), payout:String(src.payout),
    legs:JSON.stringify(src.legs||[]),
    status:'invite', settledTs:'0', ret:'0',
    invitedBy:_me.k1, srcBet:betId,
  });
  try{
    const r=await fetch(`${betBase()}?documentId=${encodeURIComponent(id)}&${msgKey()}`,
      {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    if(r.ok){ _inviteFor=null; await betRefresh(); }
    else _inviteErr=r.status===403?'rules':'send';
  }catch(e){ _inviteErr='offline'; }
  _betBusy=false; renderMyBets();
}
async function sbInviteRespond(id,accept){
  if(!_me||_betBusy) return;
  const inv=(_bets||[]).find(b=>b.id===id);
  if(!inv||inv.owner!==_me.k1||inv.status!=='invite') return;
  if(accept){
    /* the stake has to be there now, not when it was offered */
    if(inv.stake>bucksBalance()){ _inviteErr='funds'; renderMyBets(); return; }
    if(inviteLapsed(inv)){ _inviteErr='gone'; renderMyBets(); return; }
  }
  _betBusy=true; _inviteErr=null; renderMyBets();
  const mask='updateMask.fieldPaths=status&updateMask.fieldPaths=team&updateMask.fieldPaths=ts';
  try{
    const r=await fetch(`${betBase()}/${encodeURIComponent(id)}?${msgKey()}&${mask}`,
      {method:'PATCH',headers:{'Content-Type':'application/json'},
       body:JSON.stringify(fsOut({status:accept?'open':'declined',
         team:String(_me.teamId||''),ts:String(Date.now())}))});
    if(r.ok){ inv.status=accept?'open':'declined'; inv.team=String(_me.teamId||''); await betRefresh(); }
    else _inviteErr=r.status===403?'rules':'send';
  }catch(e){ _inviteErr='offline'; }
  _betBusy=false; renderMyBets();
}

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

/* Invitations waiting on an answer. Shown before the ledger because they are
   the only thing on the page asking the manager to do something. */
function sbInvitesHTML(){
  if(!_me) return '';
  /* A lapsed invitation comes off the feed rather than sitting there greyed
     out: there is nothing left to answer, and the reset took the week it
     belonged to with it. Nothing is deleted — the document stays at 'invite'
     and simply stops being current. */
  const pend=betsMine().filter(b=>b.status==='invite'&&!inviteLapsed(b));
  if(!pend.length) return '';
  const err=_inviteErr==='funds'?'Not enough GFL Bucks for that stake right now.'
    :_inviteErr==='gone'?'That bet is no longer open — the invite has lapsed.'
    :_inviteErr==='rules'?'The bets collection is not writable yet.'
    :_inviteErr==='full'?`That bet is already open to ${INVITE_MAX} people.`
    :_inviteErr?'Could not send that. Try again.':'';
  return `<div class="sb-invites">
    <div class="sb-invites-h"><i class="fa fa-user-plus"></i>In on a parlay?
      <span>${pend.length}</span></div>
    ${err?`<div class="sb-invite-err">${err}</div>`:''}
    ${pend.map(b=>{
      const bid=b.id.replace(/'/g,"\\'");
      const stale=false;                    // a lapsed one never reaches here
      return `<div class="sb-invite${stale?' sb-invite-stale':''}">
        <div class="sb-invite-top"><b>${betAccountName(b.invitedBy)}</b> wants you in on
          ${b.legs.length>1?`a ${b.legs.length}-leg parlay`:'a bet'}</div>
        <div class="sb-bet-legs">${b.legs.map(l=>`<div class="sb-bl">
          <span class="sb-bl-p">${l.pickLabel}</span><span class="sb-bl-m">${l.mkLabel}</span>
          <span class="sb-bl-o">${amFmt(l.odds)}</span></div>`).join('')}</div>
        <div class="sb-bet-foot">
          <span>Your stake <b>${bucksFmt(b.stake)}</b></span>
          <span>${amFmt(b.odds)}</span>
          <span>To return <b>${bucksFmt(b.payout)}</b></span>
        </div>
        ${stale?'<div class="sb-lockmsg"><i class="fa fa-lock"></i>Their bet was pulled — this has lapsed</div>':''}
        <div class="sb-invite-acts">
          <button class="sb-place" ${_betBusy||stale?'disabled':''}
            onclick="sbInviteRespond('${bid}',true)">
            <i class="fa fa-check"></i>I&#39;m in · ${bucksFmt(b.stake)}</button>
          <button class="sb-pull" ${_betBusy?'disabled':''}
            onclick="sbInviteRespond('${bid}',false)">
            <i class="fa fa-xmark"></i>No thanks</button>
        </div>
      </div>`;}).join('')}
  </div>`;
}
/* The control that sends one, hung under a bet you own and still have open. */
function sbInviteBoxHTML(b){
  if(!canInviteOn(b)) return '';
  const asked=betInvitesFor(b.id);
  const taken=new Set(asked.map(x=>x.owner));
  const seats=betInviteSeats(b.id);
  const left=seats>=INVITE_MAX?[]:betAccounts().filter(a=>a.k1!==_me.k1&&!taken.has(a.k1));
  const badge=asked.length?`<div class="sb-inv-sent">${asked.map(x=>
    `<span class="sb-inv-chip sb-inv-${x.status}">${betAccountName(x.owner)} · ${
      x.status==='invite'?'asked':x.status==='declined'?'declined'
      :x.status==='void'?'backed out':'in'}</span>`).join('')}</div>`:'';
  const bid=b.id.replace(/'/g,"\\'");
  if(_inviteFor!==b.id){
    return badge+(left.length
      ?`<button class="sb-invite-btn" onclick="betInviteOpen('${bid}')">
        <i class="fa fa-user-plus"></i>Invite someone in
        <span class="sb-inv-left">${seats}/${INVITE_MAX}</span></button>`
      :seats>=INVITE_MAX
        ?`<div class="sb-inv-full"><i class="fa fa-user-check"></i>Open to ${INVITE_MAX} people — that is the lot</div>`
        :'');
  }
  return badge+`<div class="sb-invite-pick">
    <select id="inv-sel-${b.id}" aria-label="Invite">
      ${left.map(a=>`<option value="${a.k1}">${a.name}</option>`).join('')}</select>
    <button class="sb-place" ${_betBusy?'disabled':''}
      onclick="sbSendInvite('${bid}',document.getElementById('inv-sel-${b.id}').value)">
      Send · ${bucksFmt(b.stake)} each</button>
    <button class="sb-pull" onclick="betInviteOpen('${bid}')">Close</button>
  </div>`;
}

/* Every bet this profile has placed, newest first, with the bankroll line on
   top. Grouped by bucks week so a settled week reads as its own scoreboard. */
function myBetsHTML(){
  if(!_me) return `<div class="sb-mine-empty"><i class="fa fa-wallet"></i>
    <div>Sign in to track your bets.</div>
    <button class="sb-place" onclick="openSignIn()"><i class="fa fa-right-to-bracket"></i>Sign in</button></div>`;
  if(_betErr==='rules') return `<div class="sb-mine-empty"><i class="fa fa-lock"></i>
    <div>The <code>bets</code> collection is not readable yet — its Firestore rule still needs publishing.</div></div>`;
  if(_betErr==='quota'||_fsQuota) return `<div class="sb-mine-empty"><i class="fa fa-hourglass-half"></i>
    <div><b>The league database has hit its daily free-tier limit.</b><br>
    Nothing is broken and nothing is lost — bets, ballots and picks all come back
    when the quota resets at midnight Pacific.</div></div>`;
  if(_bets===null) return `<div class="tab-loading" style="padding:22px"><i class="fa fa-circle-notch"></i>Loading your bets…</div>`;
  const all=betsMine();                 // ledger reflects every bet, cleared or not
  const mine=all.filter(b=>!b.hidden);  // the list shows what has not been cleared
  /* The balance is in the nav now, on every page rather than only this one, so
     the strip that opened this view has gone with it. What did not survive the
     move was when the next hundred lands, which is a question about the money
     rather than about any one bet — one line, above the chart of the same
     money over time. */
  const head=`<div class="sb-next">Next ${bucksFmt(BUCKS_WEEKLY)} lands in <b>${bucksResetsIn()}</b></div>
  ${bankHTML()}
  ${sbInvitesHTML()}
  ${betsClearable().length?`<div class="sb-clearsettled-row">
    <button class="sb-clear" onclick="sbClearSettled()" ${_betBusy?'disabled':''}>
      <i class="fa fa-broom"></i> Clear settled (${betsClearable().length})</button></div>`:''}`;
  if(!mine.length) return head+`<div class="sb-mine-empty"><i class="fa fa-receipt"></i>
    <div>No bets yet. Tap any price to build a slip.</div></div>`;
  const weeks={};
  mine.filter(b=>b.status!=='invite').forEach(b=>{(weeks[b.wk]||(weeks[b.wk]=[])).push(b);});
  const cur=bucksWeekKey();
  const cards=Object.keys(weeks).sort().reverse().map(wk=>{
    const list=weeks[wk].map(b=>{
      const cls=b.status==='won'?'won':b.status==='lost'?'lost'
        :b.status==='push'?'push':b.status==='void'?'void'
        :b.status==='cashed'?'cashed':'open';
      const legs=b.legs.map(l=>`<div class="sb-bl"><span class="sb-bl-p">${l.pickLabel}</span>
        <span class="sb-bl-m">${l.mkLabel}</span><span class="sb-bl-o">${amFmt(l.odds)}</span></div>`).join('');
      const co=betCashOut(b);
      return `<div class="sb-bet sb-bet-${cls}">
        <div class="sb-bet-top">
          <span class="sb-bet-tag">${b.legs.length>1?`${b.legs.length}-leg parlay`:'Single'}</span>
          <span class="sb-bet-st sb-st-${cls}">${
            b.status==='won'?`Won +${bucksFmt(b.ret-b.stake)}`
            :b.status==='lost'?`Lost ${bucksFmt(b.stake)}`
            :b.status==='push'?'Push'
            :b.status==='void'?'Pulled'
            :b.status==='cashed'?`Cashed ${b.ret>=b.stake?'+':'−'}${bucksFmt(Math.abs(b.ret-b.stake))}`
            :'Open'}</span>
        </div>
        <div class="sb-bet-legs">${legs}</div>
        <div class="sb-bet-foot">
          <span>Stake <b>${bucksFmt(b.stake)}</b></span>
          <span>${amFmt(b.odds)}</span>
          <span>${b.status==='open'?'To return':'Returned'} <b>${bucksFmt(b.status==='open'?b.payout:b.ret)}</b></span>
        </div>
        ${b.invitedBy?`<div class="sb-inv-from"><i class="fa fa-user-group"></i>In with ${betAccountName(b.invitedBy)}</div>`:''}
        ${sbInviteBoxHTML(b)}
        ${''/* The offer carries its number. A button that says only "cash out"
               is asking you to accept a price you cannot see. */}
        ${co&&co.ok?`<button class="sb-pull" onclick="sbCashOut('${b.id.replace(/'/g,"\\'")}')" ${_betBusy?'disabled':''}>
            <i class="fa fa-hand-holding-dollar"></i>Cash out · ${bucksFmt(co.amount)}${co.full?' back':''}</button>`
          :co&&co.why?`<div class="sb-lockmsg"><i class="fa fa-lock"></i>${co.why}</div>`:''}
      </div>`;
    }).join('');
    return `<div class="sb-week">
      <div class="sb-week-h">${wk===cur?'This week':bucksWeekLabel(wk)}
        <span>${weeks[wk].length} bet${weeks[wk].length>1?'s':''}</span></div>
      ${list}</div>`;
  }).join('');
  return head+cards;
}
/* ── WHO LEADS THIS ROSTER THIS WEEK ─────────────────────────────────────────
   Four named players and a fifth pick that covers everybody else on the roster
   at once. The fifth is not filler: on a sixteen-man roster the other twelve
   between them win this more often than any single one of the four, so leaving
   it off would have priced the four as if they were the whole field and made
   every one of them look like better value than it is. */
function sbTeamTopMarket(book,owner,week){
  const r=book.rows.find(x=>x.owner===owner); if(!r) return '';
  const proj=sbPlayerProj(week), rost=sbRosters(sbBoardSeason(),week);
  if(!proj||!rost) return '';
  const mine=rost[r.tid]; if(!mine||!mine.length) return '';
  const list=mine.map(e=>({pid:e.pid,p:proj[String(e.pid)]}))
    .filter(x=>x.p&&x.p.wk>0).sort((a,b)=>b.p.wk-a.p.wk);
  if(list.length<5) return '';
  const four=list.slice(0,4), rest=list.slice(4);
  /* Simulated over the whole roster, so the four named prices and the field's
     price are the same number cut two ways rather than two separate guesses. */
  const all=sbTopProbs(list.map(x=>x.p.wk),(r.tid||1)*7919+week);
  const p=[...all.slice(0,4),all.slice(4).reduce((a,v)=>a+v,0)];
  const ents=[...four.map(x=>({k:'p'+x.pid,name:x.p.name,
      av:playerImg(x.pid,22,x.p.name),ab:POS_NAMES[x.p.pos]||''})),
    /* The field entry carries the pids that were named beside it. Settlement
       has to know which players "anyone else" meant, and the four are chosen
       from projections that cannot be reproduced after the week — so the answer
       travels on the ticket rather than being guessed at later. */
    {k:'field:'+four.map(x=>x.pid).join('-'),name:'Anyone else',tail:true,
      av:'<span class="sb-field-av"><i class="fa fa-users"></i></span>',
      ab:rest.length+' players'}];
  const m=sbOutrightAny('tt'+owner+'-'+week,`Week ${week} Top Scorer`,
    `Which started player on ${r.name} scores the most this week, on ESPN projections`,
    ents,p,'fa-user-astronaut',1,'Player');
  return sbMarketHTML(m);
}
function sbWeekOf(){
  const meta=_seasonMeta[sbBoardSeason()]; if(!meta) return 1;
  const played=new Set(), all=new Set();
  (meta.schedule||[]).forEach(m=>{
    if(!m.home||!m.away) return;
    const wk=m.matchupPeriodId||0; if(!wk) return;
    all.add(wk);
    if((m.home.totalPoints||0)>0||(m.away.totalPoints||0)>0) played.add(wk);
  });
  const last=played.size?Math.max(...played):0;
  return [...all].sort((a,b)=>a-b).find(w=>w>last)||last||1;
}
function sbTeamViewHTML(book){
  if(_sbTeamSel==null||!book.rows.some(r=>r.owner===_sbTeamSel)) _sbTeamSel=book.rows.slice().sort((a,b)=>b.rating-a.rating)[0].owner;
  const owner=_sbTeamSel;
  const r=book.rows.find(x=>x.owner===owner);
  const opts=book.rows.slice().sort((a,b)=>a.name.localeCompare(b.name))
    .map(x=>`<option value="${x.owner}" ${x.owner===owner?'selected':''}>${x.name}</option>`).join('');
  const lines=[];
  Object.values(book.groups).flat().forEach(m=>{
    /* A player or matchup market has rows keyed by player id or by matchup,
       never by owner, so it has nothing to say on a team's card. */
    if(m.entLabel&&m.entLabel!=='Team') return;
    const p=m.picks.find(x=>x.owner===owner); if(!p) return;
    if(m.type==='outright') lines.push({m,label:m.title,cells:[sbBtn(m.key,m.title,owner,r.name,p.odds)],note:(p.prob*100).toFixed(1)+'% implied'});
    else if(m.type==='yesno') lines.push({m,label:m.title,cells:[sbBtn(m.key,m.title,owner+':yes',r.name+' — Yes',p.yes,'sb-two','Yes'),sbBtn(m.key,m.title,owner+':no',r.name+' — No',p.no,'sb-two','No')],note:'Yes / No'});
    else lines.push({m,label:m.title+' · '+p.line.toFixed(1),cells:[sbBtn(m.key,m.title,owner+':o',`${r.name} — Over ${p.line.toFixed(1)}`,p.over,'sb-two','O '+p.line.toFixed(1)),sbBtn(m.key,m.title,owner+':u',`${r.name} — Under ${p.line.toFixed(1)}`,p.under,'sb-two','U '+p.line.toFixed(1))],note:'projection '+(m.key==='wins'?p.exp.toFixed(1)+' wins':Math.round(p.exp)+' pts')});
  });
  const at=r.at;
  return `<div class="sb-market">
    <div class="sb-mhead"><i class="fa fa-id-badge"></i><span class="sb-mt">Team Card</span></div>
    <div class="picker-bar" style="padding:18px 0 12px"><label for="sb-team">Team:</label>
      <select id="sb-team" onchange="sbSetTeam(this.value)">${opts}</select></div>
    <div class="sb-tcard">
      <div class="sb-tc-top">${sbAvatar(owner,40)}<div><div class="sb-tc-nm">${r.name}</div>
        <div class="sb-tc-sub">${at.w}–${at.l} all-time · ${r.ppg.toFixed(1)} PPG · ${at.rings} ring${at.rings===1?'':'s'} · ${at.playoffApps||0} playoff app${(at.playoffApps||0)===1?'':'s'}</div></div>
        <div class="sb-tc-rate"><span class="v">${r.rating>=0?'+':''}${r.rating.toFixed(2)}</span><span class="l">power rating</span></div></div>
    </div>
    <div class="sb-rows">${lines.map(l=>`<div class="sb-trow">
      <span class="sb-tl"><span class="sb-tl-m">${l.label}</span><span class="sb-tl-n">${l.note}</span></span>
      <span class="sb-tc-odds">${l.cells.join('')}</span></div>`).join('')}</div>
  </div>
  ${sbTeamTopMarket(book,owner,sbWeekOf())}`;
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
  const note=_sbNote; _sbNote=null;
  return `<div class="sb-slip-head"><i class="fa fa-receipt"></i>Bet Slip<span class="sb-slip-n">${n}</span></div>
    ${_me?`<div class="sb-bank">
        <span class="sb-bank-l"><i class="fa fa-wallet"></i>GFL Bucks</span>
        <span class="sb-bank-v">${bucksFmt(bal)}</span>
        <span class="sb-bank-r">+${bucksFmt(BUCKS_WEEKLY)} in ${bucksResetsIn()}</span>
      </div>`:''}
    ${n?`<div class="sb-slip-list">${_slip.map(s=>`<div class="sb-slip-item">
        <div class="sb-si-txt"><div class="sb-si-pick">${s.pickLabel}</div><div class="sb-si-mkt">${s.mkLabel}</div></div>
        <div class="sb-si-odds">${amFmt(s.odds)}</div>
        <button class="sb-si-x" onclick="sbDrop('${s.k.replace(/'/g,"\\'")}')" aria-label="Remove"><i class="fa fa-xmark"></i></button>
      </div>`).join('')}</div>
      <div class="sb-slip-actions"><button class="sb-clear" onclick="sbClear()">Clear all</button></div>
      <div class="sb-stake">
        <label for="sb-stake-in">Stake</label>
        <input id="sb-stake-in" type="number" min="0" step="10" max="${bucks2(bal)}" value="${bucks2(stake)}" oninput="sbStakeTyped(this.value)"/>
        <span class="sb-cur">GFL Bucks</span>
      </div>
      <div class="sb-quick">
        ${[25,50,100].filter(v=>v<=bal).map(v=>`<button onclick="sbStake(${v})">${bucksFmt(v)}</button>`).join('')}
        <button onclick="sbStake(${bal})">All in</button>
      </div>
      <div class="sb-totals">
        <div class="sb-tot"><span>${n>1?'Parlay odds':'Odds'}</span><b>${amFmt(n>1?parlay:_slip[0].odds)}</b></div>
        <div class="sb-tot"><span>To win</span><b class="sb-win">${bucksCents(payout-stake)}</b></div>
        <div class="sb-tot sb-tot-big"><span>Payout</span><b>${bucksCents(payout)}</b></div>
      </div>
      ${!_me?`<button class="sb-place" onclick="openSignIn()"><i class="fa fa-right-to-bracket"></i>Sign in to bet</button>`
        :`<button class="sb-place" onclick="sbPlaceBet()" ${_betBusy||stake<=0||stake>bal?'disabled':''}>
            ${_betBusy?'<i class="fa fa-circle-notch fa-spin"></i>Placing…'
              :`<i class="fa fa-check"></i>Place bet · ${bucksFmt(stake)}`}</button>`}
      ${_betErr?`<div class="sb-slip-err">${
        _betErr==='locked'?'That week is under way — those markets are closed. The week ahead and the season futures are still open.'
        :_betErr==='funds'?`That is more than your ${bucksFmt(bal)} balance.`
        :_betErr==='stake'?'Enter a stake first.'
        :_betErr==='quota'?'The league database has hit its daily free-tier limit — try again after it resets at midnight Pacific.'
        :_betErr==='rules'?'The bets collection is not writable yet — Firestore rules need publishing.'
        :'Could not place that bet. Try again.'}</div>`:''}`
    :`<div class="sb-slip-empty">Tap any price to add it here.<br/>Multiple picks become a parlay.</div>`}
    ${note?`<div class="sb-slip-warn"><i class="fa fa-circle-info"></i>${note}</div>`:''}
    <div class="sb-slip-note">Play money. Every team gets ${bucksFmt(BUCKS_WEEKLY)} GFL Bucks a week, Tuesday to Tuesday, and it all carries over — win it and it is yours to keep.</div>`;
}
/* ── What a slip is allowed to hold ─────────────────────────────────────────
   A parlay pays out only if every leg lands, so legs that cannot all land are
   not a bet — they are a way of buying longer odds on an outcome that is
   already guaranteed to fail. Real books refuse them for the same reason.

   Three cases are blocked, all of them mutually exclusive within one market:
     · both sides of a head to head, or a moneyline against its own spread
     · over and under on the same total
     · two teams to win the same outright, where only one can

   Yes/No props on different teams are left alone: two teams can both make the
   playoffs, so those legs are independent and a parlay of them is honest. */
const SB_EXCLUSIVE=/-(ml|sp|tot)$/;          // weekly markets: one side per game

/* ── WHAT CANNOT RIDE WITH WHAT ──────────────────────────────────────────────
   A parlay pays what it pays because every leg has to come in. Two legs that
   cannot both come in are not a longer shot — they are a ticket that is dead
   the moment it is written, sold at the price of a live one. So the board has
   to know which of its own outcomes rule each other out.

   Everything below is that question and only that question: can these two land
   together? Legs that merely lean the same way are left alone. Backing two
   teams to make the playoffs is a fine bet even though the field is finite,
   right up until the twelfth leg would need a seventh seat. */

/* Every market on the board. The season groups alone were the whole search
   before, which quietly missed every market built for the week — and that is
   exactly why two teams could be parlayed to win the same Closest Game. */
function sbAllMarkets(){
  const out=Object.values((sbBuild()||{groups:{}}).groups||{}).flat();
  /* Pick 'Em goes in too, or two players from the same trio could ride the same
     parlay — and only one of three can outscore the other two. sbConflict finds
     the clash through this list, so a market missing from it is a market whose
     own rules do not apply. */
  try{ const d=sbWeekData(); if(d){ if(d.marks) out.push(...d.marks); if(d.pick) out.push(...d.pick); } }catch(e){}
  return out;
}
/* Markets that fill a fixed number of seats. However long the price looks, a
   parlay cannot hold more yes legs than there are seats to go round. */
function sbSeatCap(mk){
  if(mk==='topseed'||mk==='botseed') return 2;
  if(mk==='playoffs') return (sbBuild()||{}).spots||6;
  return null;
}
/* Two readings of one thing, taken from opposite ends. The week's top score is
   not also its low score; its closest game is not also its blowout. The
   entrant key is the same string in both markets of a pair — a team owner for
   the scores, a fixture for the games — so the picks compare directly. */
const SB_ENDS=[['high','low'],['close','blow']];
/* Does this owner play in the game a weekly market key names? The key carries
   team ids and a pick carries an owner, so the two only meet through the book's
   own rows. */
function sbSameGame(mk,owner){
  const m=/^wk\d+-(\d+)-(\d+)-(?:ml|sp|tot)$/.exec(mk); if(!m) return false;
  const b=sbBuild(); if(!b) return false;
  const r=b.rows.find(x=>x.owner===owner); if(!r) return false;
  return String(r.tid)===m[1]||String(r.tid)===m[2];
}
function sbWeekOpposite(mk){
  const m=/^(wk\d+)-(high|low|close|blow)$/.exec(mk); if(!m) return null;
  const pair=SB_ENDS.find(p=>p.indexOf(m[2])>=0);
  return m[1]+'-'+pair[pair[0]===m[2]?1:0];
}
function sbConflict(mk,pick){
  const p=String(pick), team=p.split(':')[0];
  // one selection per weekly market, whichever side or line it is
  /* One side per market. The moneyline and the spread used to be treated as
     one market between them, which also stopped the favourite being backed on
     both — and that is a bet a person is allowed to want. They are separate
     markets again; what is still impossible is caught below. */
  if(SB_EXCLUSIVE.test(mk)){
    const clash=_slip.find(x=>x.mk===mk&&x.pick!==p);
    if(clash) return {leg:clash,why:'You already have a side of that market.'};
  }
  /* Except one way round: the spread is only ever sold on the favourite, so
     taking the underdog to win outright and the favourite to cover the same
     game is a ticket that cannot come in. */
  const game=mk.replace(/-(ml|sp)$/,'');
  if(/-(ml|sp)$/.test(mk)){
    const other=/-ml$/.test(mk)?game+'-sp':game+'-ml';
    const clash=_slip.find(x=>x.mk===other&&x.pick.split(':')[0]!==team);
    if(clash) return {leg:clash,why:'The underdog winning and the favourite covering cannot both land.'};
  }
  // an outright can only be won by one entrant — season or week
  const m=sbAllMarkets().find(x=>x.key===mk);
  if(m&&m.type==='outright'){
    const clash=_slip.find(x=>x.mk===mk&&x.pick!==p);
    if(clash) return {leg:clash,why:`Only one ${(m.entLabel||'team').toLowerCase()} can win that.`};
  }
  /* A team that puts up the week's highest score has beaten whoever it played
     — nobody outscored it. The lowest lost the same way. So the score markets
     and that team's own moneyline are tied together: top score rules out the
     opponent winning, low score rules out the team winning. */
  const sc=/^wk(\d+)-(high|low)$/.exec(mk);
  if(sc){
    const clash=_slip.find(x=>{
      const g=/^wk(\d+)-\d+-\d+-ml$/.exec(x.mk);
      if(!g||g[1]!==sc[1]||!sbSameGame(x.mk,team)) return false;
      const mlTeam=x.pick.split(':')[0];
      return sc[2]==='high' ? mlTeam!==team : mlTeam===team;
    });
    if(clash) return {leg:clash,why:sc[2]==='high'
      ?'Nobody outscored the top score, so that team won its game.'
      :'The low score of the week did not win its game.'};
  }
  // and the other way round: an existing score leg against a new moneyline
  const ml=/^wk(\d+)-\d+-\d+-ml$/.exec(mk);
  if(ml){
    const clash=_slip.find(x=>{
      const m2=/^wk(\d+)-(high|low)$/.exec(x.mk);
      if(!m2||m2[1]!==ml[1]) return false;
      if(!sbSameGame(mk,x.pick)) return false;
      return m2[2]==='high' ? x.pick!==team : x.pick===team;
    });
    if(clash) return {leg:clash,why:'That cannot happen with the score leg already on the slip.'};
  }
  // the same entrant at both ends of the same week
  const opp=sbWeekOpposite(mk);
  if(opp){
    const clash=_slip.find(x=>x.mk===opp&&x.pick===p);
    if(clash) return {leg:clash,why:'It cannot be both.'};
  }
  // the top of the table and the bottom of it are the same table
  if(mk==='topseed'||mk==='botseed'){
    const other=mk==='topseed'?'botseed':'topseed';
    if(/:yes$/.test(p)){
      const clash=_slip.find(x=>x.mk===other&&x.pick===team+':yes');
      if(clash) return {leg:clash,why:'A team cannot finish top two and bottom two.'};
    }
  }
  /* Seats. This one refuses rather than swaps: the legs already on the slip
     are all still possible and there is no way to guess which of them the tap
     meant to replace. */
  const cap=sbSeatCap(mk);
  if(cap&&/:yes$/.test(p)){
    const held=_slip.filter(x=>x.mk===mk&&/:yes$/.test(x.pick));
    if(held.length>=cap)
      return {block:true,why:`Only ${cap} of them can, so that leg cannot come in with the ${cap} already on the slip.`};
  }
  // and one side per team on a yes/no
  const same=_slip.find(x=>x.mk===mk&&x.pick.split(':')[0]===team&&x.pick!==p);
  if(same) return {leg:same,why:null};        // silent swap: same team, other side
  return null;
}
function sbPick(mk,mkLabel,pick,pickLabel,odds){
  const k=mk+'|'+pick;
  const i=_slip.findIndex(x=>x.k===k);
  if(i>=0){ _slip.splice(i,1); sbSyncButtons(); sbRenderSlip(); return; }
  /* The board is repainted dead at kickoff, but a price tapped a second before
     it would otherwise still land on the slip. */
  const mkWeek=betLegWeek(mk);
  if(mkWeek!=null&&sbWeekLocked(mkWeek,mk)){
    _sbNote='Week '+mkWeek+' is under way — those markets are closed. The week ahead is open.';
    sbSyncButtons(); sbRenderSlip(); return;
  }
  const c=sbConflict(mk,pick);
  if(c&&c.block){
    /* Nothing to swap: every leg on the slip is still live and the tap does not
       say which of them to give up. The note says why, and the slip is left
       exactly as it was. */
    _sbNote=c.why; sbSyncButtons(); sbRenderSlip(); return;
  }
  if(c){
    /* Swapping is what someone means by tapping the other side, so the old leg
       is replaced rather than the tap being refused outright. The note explains
       it for the cases where the two are not obviously the same market. */
    _slip=_slip.filter(x=>x.k!==c.leg.k);
    if(c.why) _sbNote=c.why;
  }
  _slip.push({k,mk,mkLabel,pick:String(pick),pickLabel,odds});
  sbSyncButtons(); sbRenderSlip();
}
let _sbNote=null;
function sbDrop(k){ _slip=_slip.filter(x=>x.k!==k); sbSyncButtons(); sbRenderSlip(); }
function sbClear(){ _slip=[]; sbSyncButtons(); sbRenderSlip(); }
function sbStake(v){ _sbStake=v; sbRenderSlip(); }
/* ── TYPING A STAKE MUST NOT REBUILD THE BOX YOU ARE TYPING IN ───────────────
   The field ran oninput="sbStake(...)", and sbStake repaints the whole slip —
   which throws away the <input> the caret is sitting in and builds a new one.
   The browser has nowhere to put focus, so it lands back on the body: one
   character, and you are out of the field. Backspace was worse, because you
   had to re-tap the box between every deletion.

   So typing takes a different path from tapping a quick-stake button. A button
   HAS to repaint, because the number in the field is the thing it changes. A
   keystroke only needs the three things downstream of the stake to follow it:
   what the bet returns, what it pays, and whether Place bet is allowed. The
   input is left exactly as the person typing it left it. */
function sbStakeTyped(v){
  _sbStake=v;
  const dec=_slip.reduce((a,s)=>a*amToDec(s.odds),1);
  const bal=bucksBalance();
  const stake=bucks2(Math.min(bal,Math.max(0,Number(v)||0)));
  const payout=stake*dec;
  const fmt=x=>bucksCents(x);
  /* The slip is painted into every .sb-slip-target there is — the sheet on a
     phone and the panel on a desktop — so all of them are patched, not the
     first one found. */
  document.querySelectorAll('.sb-win').forEach(e=>{ e.textContent=fmt(payout-stake); });
  document.querySelectorAll('.sb-tot-big b').forEach(e=>{ e.textContent=fmt(payout); });
  document.querySelectorAll('.sb-place').forEach(b=>{
    if(!_me||b.getAttribute('onclick')!=='sbPlaceBet()') return;
    b.disabled=!!(_betBusy||stake<=0||stake>bal);
    if(!_betBusy) b.innerHTML=`<i class="fa fa-check"></i>Place bet · ${bucksFmt(stake)}`;
  });
  /* keep any other copy of the field in step, but never the one being typed in */
  document.querySelectorAll('#sb-stake-in').forEach(e=>{ if(e!==document.activeElement) e.value=v; });
}
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
/* ── A REPAINT MUST NOT STEAL THE STAKE FIELD ────────────────────────────────
   Not typing is only half of it. The slip is also rebuilt by things that have
   nothing to do with the stake — adding a leg, the bets ledger refreshing, and
   now the roster feed landing on its two-minute cycle, which repaints the whole
   board underneath the desktop slip panel. Any of those, arriving while
   somebody is mid-number, takes the field away exactly as typing used to.

   So every repaint that can swallow the field goes through here: remember what
   was in it and where the caret was, let the repaint happen, then put it back.
   A number input refuses setSelectionRange in some browsers, hence the try. */
function sbKeepStakeFocus(fn){
  const a=document.activeElement;
  const typing=!!(a&&a.id==='sb-stake-in');
  const val=typing?a.value:null;
  let sel=null;
  if(typing){ try{ sel={s:a.selectionStart,e:a.selectionEnd}; }catch(e){} }
  fn();
  if(!typing) return;
  const next=[...document.querySelectorAll('#sb-stake-in')]
    .find(e=>e.getBoundingClientRect().height>0)||document.getElementById('sb-stake-in');
  if(!next) return;
  if(val!=null&&next.value!==val) next.value=val;
  try{ next.focus({preventScroll:true}); }catch(e){ try{ next.focus(); }catch(e2){} }
  if(sel&&sel.s!=null){ try{ next.setSelectionRange(sel.s,sel.e); }catch(e){} }
}
function sbRenderSlip(){
  sbKeepStakeFocus(()=>{
    sbPortal();
    document.querySelectorAll('.sb-slip-target').forEach(el=>{ el.innerHTML=sbSlipHTML(); });
    sbSyncButtons();
  });
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
  const season=sbBoardSeason(), meta=_seasonMeta[season];
  if(!meta) return null;
  /* THE BOARD SHOWS THE WEEK BEING PLAYED, NOT THE ONE AFTER IT.

     It used to roll forward the moment a week held a single point, so from
     Thursday night it printed next week's fixtures and the week actually being
     played could not be bet at all. The first week that is not finished is the
     one on the board: the upcoming week from Tuesday to Thursday, then that same
     week as it happens, priced on whatever is left of it. */
  const byWeek={};
  (meta.schedule||[]).forEach(m=>{
    if(!m.home||!m.away) return;
    const wk=m.matchupPeriodId||0; if(!wk) return;
    (byWeek[wk]||(byWeek[wk]=[])).push(m);
  });
  const scored=m=>(m.home.totalPoints||0)>0||(m.away.totalPoints||0)>0;
  const weeks=Object.keys(byWeek).map(Number).sort((a,b)=>a-b);
  const unfinished=weeks.find(w=>!byWeek[w].every(scored));
  const week=unfinished||weeks[weeks.length-1]||1;
  const live=unfinished!=null;
  /* Has this week's football begun? It decides whether the price comes off the
     best lineup a roster could field or off the one that is locked in. */
  const wkStarted=(byWeek[week]||[]).some(scored);
  const games=(byWeek[week]||[]).map(m=>{
    const rowOf=tid=>book.rows.find(r=>r.tid===tid);
    const a=rowOf(m.home.teamId), b=rowOf(m.away.teamId);
    const hp=m.home.totalPoints||0, ap=m.away.totalPoints||0;
    const done=hp>0||ap>0;
    if(!a||!b) return null;
    /* ESPN'S OWN PROJECTIONS, WHERE THEY EXIST.

       A power rating says who has been better this year. A projection says what
       these two rosters are expected to score this week, which is the question
       the market actually asks — and it is the number the managers can see for
       themselves in the ESPN app, which is most of why it should be the one
       behind the price.

       Once the week is under way it prices what is left: the points already
       banked, plus the projections of the starters whose games have not kicked
       off, with the spread of outcomes shrinking as the week empties. A fixture
       with nothing left to play has no market and its prices go to null, which
       sbBtn already renders as a dash. */
    const tA=sbTeamWeek(m.home.teamId,week,season,meta,hp,wkStarted);
    const tB=sbTeamWeek(m.away.teamId,week,season,meta,ap,wkStarted);
    if(tA&&tB){
      const sA=sbWkSd(tA), sB=sbWkSd(tB);
      const sd=Math.sqrt(sA*sA+sB*sB);
      const spent=wkStarted&&(tA.left+tB.left)<=SB_WK_MIN_LEFT;
      const pA=sd>1?Math.min(0.97,Math.max(0.03,sbNormCdf((tA.exp-tB.exp)/sd))):null;
      const dead=spent||pA==null;
      return {week,a,b,done,hp,ap,proj:{A:tA,B:tB,sd},
        mlA:dead?null:amFromProb(Math.min(0.95,pA+0.025)),
        mlB:dead?null:amFromProb(Math.min(0.95,(1-pA)+0.025)),
        spread:Math.max(0.5,Math.round(Math.abs(tA.exp-tB.exp)*2)/2),
        favA:tA.exp>=tB.exp,
        line:Math.round(tA.exp+tB.exp)+0.5,
        overP:dead?null:amFromProb(0.5+0.024),
        underP:dead?null:amFromProb(0.5+0.024),
        winA:done?hp>ap:null};
    }
    /* No projections in hand — ESPN has not published the week, or the rosters
       have not come back yet. The power-rating model below is the fallback, and
       is what the board did before there was anything better. */
    /* Head-to-head fantasy is closer to a coin flip than a power rating makes
       it look, and in week one there is nothing behind that rating but last
       year. A −470 favourite in a game where either side can hang forty on the
       other is not a price, it is a boast. The lean is capped tight while the
       evidence is thin and opens up as the season earns it. */
    const lim=0.62+0.18*sbEvidence();
    const pA=Math.min(lim,Math.max(1-lim,1/(1+Math.exp(-(a.rating-b.rating)*sbDamp(0.55)))));
    return {week,a,b,done,hp,ap,
      mlA:amFromProb(Math.min(0.95,pA+0.025)), mlB:amFromProb(Math.min(0.95,(1-pA)+0.025)),
      spread:Math.max(0.5,Math.round(Math.abs(a.rating-b.rating)*sbDamp(3.0)*2)/2),
      favA:a.rating>=b.rating,
      line:Math.round(a.ppg+b.ppg)+0.5,
      overP:amFromProb(0.5+0.024), underP:amFromProb(0.5+0.024),
      winA:done?hp>ap:null};
  }).filter(Boolean);
  // waiver market: the biggest FAAB spends of that week. Only when the
  // pickups on hand are from this board's season — week 1 of one year tells
  // you nothing about week 1 of another, and pricing it as though it did put
  // last year's bids on this year's board.
  const buys=[];
  if(String(_cmBreakdownSeason)===String(season))
  Object.entries(_cmBreakdown||{}).forEach(([tid,bd])=>{
    ((bd.detail&&bd.detail.waiverPickups)||[]).forEach(w=>{
      if(w.week!==week) return;
      const r=book.rows.find(x=>x.tid===Number(tid));
      buys.push({pid:w.pid,bid:w.bid,est:w.est,pts:w.pts,team:r?r.name:('Team '+tid),owner:r?r.owner:null});
    });
  });
  buys.sort((x,y)=>y.bid-x.bid);
  return {book,season,week,live,games,buys:buys.slice(0,8),
    marks:sbWeekMarkets(book,games,week),pick:sbPickEmMarkets(book,week)};
}

/* ── SIX MARKETS ON THE WEEK ─────────────────────────────────────────────────
   Everything here is about one week rather than the season, which changes what
   matters. Over seventeen weeks the better team wins; over one, variance is
   most of the story — so a team's own week-to-week spread is a real term in
   every one of these, and it pushes the same team toward both the high score
   and the low one. That is not a contradiction. A boom-or-bust roster is
   exactly the roster that turns up at both ends of the table. */
function sbWeekMarkets(book,games,week){
  const rows=book.rows;
  if(!rows||rows.length<2) return [];
  const z=r=>({ppg:r.z.ppg||0,form:r.z.form||0,rost:r.z.roster||0,vol:r.z.vol||0});
  const out=[];

  /* 1 & 2 — the top and bottom score of the week.
     Roster carries more here than in any season market: over one week what
     ESPN projects the players to score is closer to the truth than what the
     franchise has averaged since 2015. */
  const te=rows.map(r=>({k:r.owner,name:r.name}));
  out.push(sbOutrightAny('wk'+week+'-high',`Week ${week} Top Score`,
    'Highest team score of the week',te,
    sbProbs(rows.map(r=>{const v=z(r); return 0.80*v.ppg+0.50*v.form+0.75*v.rost+0.35*v.vol;}),0.62,0.42),
    'fa-fire',1,'Team'));
  out.push(sbOutrightAny('wk'+week+'-low',`Week ${week} Low Score`,
    'Lowest team score of the week',te,
    sbProbs(rows.map(r=>{const v=z(r); return -0.80*v.ppg-0.50*v.form-0.75*v.rost+0.35*v.vol;}),0.62,0.42),
    'fa-battery-empty',1,'Team'));

  /* 3 & 4 — the shape of the week's six games.
     The margin the model already put on each matchup is the whole signal; two
     volatile teams simply widen whatever it says, which makes their game both
     the likeliest blowout and the least likely nail-biter. */
  if(games.length>1){
    /* "Bikini Bottom Goobers vs Team silly willy" is not a row that fits a
       phone, and it clipped on every one of the six. The pair of crests plus
       the abbreviations is how the matchup board immediately above these names
       the same twelve teams, so these follow it rather than inventing a second
       way to write a fixture. No second line: the full pair does not fit one
       either, and a clipped subtitle is worse than none. */
    const ge=games.map(g=>({k:'g'+g.a.tid+'-'+g.b.tid,
      name:sbTeamAb(g.a.owner,g.a.name)+' v '+sbTeamAb(g.b.owner,g.b.name),
      av:'<span class="sb-duo">'+sbAvatar(g.a.owner,20)+sbAvatar(g.b.owner,20)+'</span>',
      ab:''}));
    const vol=games.map(g=>((g.a.z.vol||0)+(g.b.z.vol||0))/2);
    out.push(sbOutrightAny('wk'+week+'-close',`Week ${week} Closest Game`,
      'Smallest final margin of the six',ge,
      sbProbs(games.map((g,i)=>-1.0*g.spread-0.55*vol[i]),0.80,0.30),
      'fa-compress',1,'Matchup'));
    out.push(sbOutrightAny('wk'+week+'-blow',`Week ${week} Biggest Blowout`,
      'Largest final margin of the six',ge,
      sbProbs(games.map((g,i)=>1.0*g.spread+0.55*vol[i]),0.80,0.30),
      'fa-explosion',1,'Matchup'));
  }

  /* 5 — the week's top scorer, out of everyone anybody owns.
     Priced straight off ESPN's own projections, which is the only genuinely
     forward-looking number in the data. Free agents are left out: a player
     nobody rosters cannot score for anybody. */
  const proj=sbPlayerProj(week);
  const rost=sbRosters(sbBoardSeason(),week);
  if(proj&&rost){
    const own={};
    Object.keys(rost).forEach(tid=>{
      const o=(book.rows.find(r=>r.tid===Number(tid))||{}).name||'';
      rost[tid].forEach(e=>{ own[String(e.pid)]=o; });
    });
    /* The whole rostered field is simulated, not just the names on the board.
       Pricing only the top ten against each other would normalise their ten
       chances to a certainty and sell every one of them at roughly double what
       it is worth — one of the ten would have to win it. The eleventh name
       down often does. */
    const cand=Object.keys(own).map(pid=>({pid,p:proj[pid]}))
      .filter(x=>x.p&&x.p.wk>0).sort((a,b)=>b.p.wk-a.p.wk).slice(0,60);
    const NAMED=20;
    if(cand.length>NAMED){
      const pw=sbTopProbs(cand.map(c=>c.p.wk),week*7919+11);
      const ents=[...cand.slice(0,NAMED).map(c=>({k:'p'+c.pid,name:c.p.name,
          av:playerImg(Number(c.pid),22,c.p.name),ab:own[c.pid]})),
        /* as above: the twenty names go with the ticket, or the field cannot
           be settled once the projections that chose them have moved on */
        {k:'field:'+cand.slice(0,NAMED).map(c=>c.pid).join('-'),name:'Anyone else',tail:true,
          av:'<span class="sb-field-av"><i class="fa fa-users"></i></span>',
          ab:(cand.length-NAMED)+'+ players'}];
      out.push(sbOutrightAny('wk'+week+'-player',`Week ${week} Top Player`,
        'Highest-scoring started player of the week, on ESPN projections',
        ents,[...pw.slice(0,NAMED),pw.slice(NAMED).reduce((a,v)=>a+v,0)],
        'fa-medal',1,'Player'));
    }
  }

  /* 6 — the donut. Does anybody in this team's lineup put up a zero?
     Not the team total — that takes an empty lineup and has never happened,
     which is what this market used to ask and why it sat at +6500 as a joke.
     One starter laying an egg is an ordinary week: a receiver who is inactive,
     a kicker who never gets sent out, a back who fumbles his only carry.

     Measured across four seasons of archived lineups — 816 team-weeks — it
     happens 15.7% of the time, and steadily: 19.1, 14.2, 15.7, 13.7 by season.
     So it prices as a real two-way market rather than a longshot with a
     formality on the other side.

     The lean is earned rather than assumed. Team scoring and donut rate
     correlate at -0.373 across 48 team-seasons: below-average offences donut
     20.1% of the time against 12.0% for above-average ones. exp(-0.33z) puts a
     z of -1 at 21.8% and +1 at 11.3%, which is that split. D/ST is excluded —
     a defence going scoreless is a different thing and happens far more often. */
  out.push(sbYesNoAny('wk'+week+'-donut',`Week ${week} Donut`,
    'Does anyone in this lineup score zero or less? Defence does not count.',
    te,rows.map(r=>0.157*Math.exp(-0.33*(r.z.ppg||0))),
    /* One column. The yes side runs 6-34%, so the no side lays most of a
       bankroll to win pocket change — it was on the board only because the
       shape of a two-way market said it had to be. */
    'fa-ring',{lo:0.06,hi:0.34,mul:true,yesOnly:true}));
  return out;
}
/* ── PICK 'EM ────────────────────────────────────────────────────────────────
   Three players projected within a whisker of each other; pick the one who
   actually outscores the other two. It is the one market on the board that is
   not about a team at all, and it is the closest thing here to a genuine
   fifty-fifty: the projections are deliberately level, so the price is doing
   almost no work and the read is yours.

   THE THREE ARE CONSECUTIVE IN THE PROJECTION ORDER, which is what makes them
   comparable — the gap between neighbours in a sorted list is as small as the
   field allows. Group 1 is always the three highest projected players in the
   league; the other four are spread evenly down what is left, so the board runs
   from three studs to three flex plays rather than five ways to bet on the same
   tier.

   NOTHING UNDER TEN PROJECTED POINTS. Below that a week is mostly noise — a
   kicker's third field goal decides it — and three players projected for six
   apiece is a coin toss dressed as a read.

   STARTERS ONLY, and the key carries the three player ids. Both of those are
   about settling it later: the lineups feed records what a STARTED player
   scored, and a market that had to be re-derived from today's projections could
   not be graded once those projections had moved on. The ids in the key mean
   the ticket knows who it was about. */
const PICKEM_GROUPS=5;
const PICKEM_MIN_PROJ=10;      // below this a week is noise, not a read
function sbPickEmMarkets(book,week){
  const proj=sbPlayerProj(week);
  const rost=sbRosters(sbBoardSeason(),week);
  if(!proj||!rost) return [];
  const pool=[];
  Object.keys(rost).forEach(tid=>{
    const team=(book.rows.find(r=>r.tid===Number(tid))||{});
    (rost[tid]||[]).forEach(e=>{
      if(BENCH_SLOTS.includes(e.slot)) return;
      const p=proj[String(e.pid)]||null;
      const wk=(typeof e.wkProj==='number'&&e.wkProj>0)?e.wkProj:(p?p.wk:0);
      if(!(wk>=PICKEM_MIN_PROJ)) return;
      pool.push({pid:Number(e.pid),wk,
        name:(p&&p.name)||e.n||pName(e.pid),
        pos:SLOT_NAMES[e.slot]||'',
        team:team.name||''});
    });
  });
  if(pool.length<6) return [];
  pool.sort((a,b)=>b.wk-a.wk);
  /* Group 1 is the top three outright. The rest are spaced evenly through what
     is left, so the last group sits at the ten-point floor and the ones between
     step down in even bites. */
  const want=Math.min(PICKEM_GROUPS,Math.floor(pool.length/3));
  const rest=pool.slice(3);
  const starts=[0];
  for(let g=1;g<want;g++){
    const span=Math.max(0,rest.length-3);
    starts.push(3+Math.round((g-1)*span/Math.max(1,want-2)));
  }
  const out=[];
  for(let g=0;g<starts.length;g++){
    const trio=pool.slice(starts[g],starts[g]+3);
    if(trio.length<3) continue;
    const pids=trio.map(t=>t.pid).slice().sort((a,b)=>a-b);
    const key='wk'+week+'-pe'+pids.join('_');
    if(out.some(m=>m.key===key)) continue;
    const probs=sbTopProbs(trio.map(t=>t.wk),week*104729+g*7919+3);
    const lo=Math.min(...trio.map(t=>t.wk)), hi=Math.max(...trio.map(t=>t.wk));
    out.push(sbOutrightAny(key,`Pick 'Em · Group ${g+1}`,
      `Who scores most of the three? Projected ${lo.toFixed(1)}–${hi.toFixed(1)} this week. Settles on started scores.`,
      trio.map(t=>({k:'p'+t.pid,name:t.name,
        av:playerImg(t.pid,22,t.name),
        ab:`${t.pos} · ${t.team}`})),
      probs,'fa-user-check',1,'Player'));
  }
  return out;
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
    /* One spread, one box, down the middle of both rows. There is only ever one
       price here — the number is the favourite's and the underdog's side was
       never sold — so splitting it across two cells drew a second box whose
       whole job was to say "not this one". Merged, it carries the team it
       belongs to, which the row it used to sit in was saying for it. */
    const fav=g.favA?g.a:g.b;
    const spreadCell=`<span class="wk-sp">${
      sbBtn(key+'-sp',`Week ${g.week} spread`,fav.owner+':sp',`${fav.name} −${sp}`,-115,'sb-two',
        `${sbTeamAb(fav.owner,fav.name)} −${sp}`)}</span>`;
    return `<div class="wk-game" data-a="${g.a.owner}" data-b="${g.b.owner}">
      <div class="wk-grid">
        <span class="wk-h wk-c1"></span>
        <span class="wk-h wk-c2">Win</span>
        <span class="wk-h wk-c3">Spread</span>
        <span class="wk-h wk-c4">Total</span>
        ${spreadCell}
        <span class="wk-team wk-c1 wk-ra">${nm(g.a)}${mark(g.winA===true)}</span>
        <span class="wk-cell wk-c2 wk-ra">${sbBtn(key+'-ml',`Week ${g.week} · ${g.a.name} vs ${g.b.name}`,g.a.owner+':ml',`${g.a.name} moneyline`,g.mlA,'sb-two')}</span>
        <span class="wk-cell wk-c4 wk-ra">${sbBtn(key+'-tot',`Week ${g.week} total`,'over',`Over ${g.line.toFixed(1)} — ${g.a.name} vs ${g.b.name}`,g.overP,'sb-two','O '+g.line.toFixed(1))}</span>
        <span class="wk-team wk-c1 wk-rb">${nm(g.b)}${mark(g.winA===false)}</span>
        <span class="wk-cell wk-c2 wk-rb">${sbBtn(key+'-ml',`Week ${g.week} · ${g.a.name} vs ${g.b.name}`,g.b.owner+':ml',`${g.b.name} moneyline`,g.mlB,'sb-two')}</span>
        <span class="wk-cell wk-c4 wk-rb">${sbBtn(key+'-tot',`Week ${g.week} total`,'under',`Under ${g.line.toFixed(1)} — ${g.a.name} vs ${g.b.name}`,g.underP,'sb-two','U '+g.line.toFixed(1))}</span>
      </div>
      ${res}
    </div>`;}).join('');
  /* THE FAAB OVER/UNDER IS OFF THE BOARD.

     It priced what a manager paid for a waiver pickup, and nothing could ever
     settle it: betWeekResult has no case for an fa<pid>-<week> key, so every
     ticket graded null and sat open for good — the stake gone, since a stake
     only comes back on settlement. Grading it would mean reading the winning
     bid out of the archived transaction log, which is a different job from
     reading a scoreboard, and the market was never worth that much machinery.
     betLegWeek still recognises the key so anything historic classifies. */
  /* The matchup board and the waiver market are hand-built rather than passed
     through sbMarketHTML — their bodies are a game board and a FAAB ladder, not
     a column of priced rows — but they fold like everything else on the week.
     Six matchups and eight pickups left open were most of the page's scroll,
     and the markets between them were unreachable without going past both. */
  const marks=(d.marks||[]).map(sbMarketHTML).join('');
  /* One Pick 'Em dropdown holding the groups, rather than six loose markets
     scattered down the board — they are one idea asked six times. */
  const pick=(d.pick||[]);
  const peOpen=!!_sbOpenMk['wk-pickem'];
  const pickHTML=pick.length?`<div class="sb-market sb-fold sb-pickem${peOpen?' open':''}" data-mk="wk-pickem">
      <button class="sb-mhead" onclick="sbToggleMk('wk-pickem')" aria-expanded="${peOpen}">
        <span class="sb-mt"><i class="fa fa-user-check"></i>Week ${d.week} Pick 'Em</span>
        <span class="badge-info">${pick.length} group${pick.length===1?'':'s'}</span>
        <i class="fa fa-chevron-down sb-mchev"></i>
      </button>
      <div class="sb-rows"><div class="sb-rows-in">
        <div class="sb-msub-in">Three players ESPN projects within a whisker of
          each other. Pick the one who actually outscores the other two.</div>
        ${pick.map(sbMarketHTML).join('')}
      </div></div>
    </div>`:'';
  const wkOpen=!!_sbOpenMk['wk-board'];
  return `<div class="sb-market sb-fold${wkOpen?' open':''}" data-mk="wk-board">
      <button class="sb-mhead" onclick="sbToggleMk('wk-board')" aria-expanded="${wkOpen}">
        <span class="sb-mt">Week ${d.week} Matchups</span>
        <span class="badge-info">${d.live?'open':'settled'}</span>
        <i class="fa fa-chevron-down sb-mchev"></i>
      </button>
      <div class="sb-rows"><div class="sb-rows-in">
        <div class="sb-msub-in">${d.live
          ? `Lines for the upcoming week — moneyline, spread and combined total.`
          : `The ${d.season} season is complete, so week ${d.week}'s board is shown settled against what actually happened.`}</div>
        <div class="wk-list">${games||'<div class="sb-msub" style="padding:12px 14px">No games found for this week.</div>'}</div>
      </div></div>
    </div>
    ${pickHTML}
    ${marks}`;
}

/* ── THE WALLET BAR ──────────────────────────────────────────────────────────
   My Bets used to be a button at the top of the sportsbook page, which meant
   scrolling back up to it. It hangs off the nav now, like the jump chips do —
   but it is deliberately its own element with its own classes and its own
   sticky behaviour, not a chip bar wearing a different hat. The two share a
   look, not a lifecycle: chips are rebuilt from whatever headings a page
   happens to have, and this is one fixed control that only the sportsbook
   shows. Tangling them would mean every future change to one had to be checked
   against the other.

   There is no contention for the slot under the nav: the sportsbook is one of
   the tabs that raises no jump chips at all, so the chip bar is hidden there. */
/* ── GFL Bucks in the nav ────────────────────────────────────────────────────
   One balance, in the bar, on every page. It used to be printed at the top of
   My Bets and again at the top of My Portfolio — which is to say it was only
   ever visible on the two pages you had already gone looking for it on, and it
   was the same number twice.

   Hidden when signed out on purpose. The balance is derived from a profile's
   own bets and holdings, so a signed-out visitor would be shown the opening
   hundred every manager starts with, which is somebody else's money.

   The reset countdown came off the My Bets strip with the rest of it and rides
   the chip's tooltip, since it is a question you ask about the balance rather
   than about your bets.

   Sportsbook only. GFL Bucks are that page's currency and mean nothing on the
   other thirteen, where the chip would just be a number in the bar competing
   with the page you actually came for. */
function renderBucksChip(){
  const el=document.getElementById('bucks-chip'); if(!el) return;
  if(!_me||_activeTab!=='book'){ if(!el.hidden){ el.hidden=true; el.innerHTML=''; } return; }
  let bal=0; try{ bal=bucksBalance(); }catch(e){}
  const txt=bucksFmt(bal);
  el.hidden=false;
  let tip='GFL Bucks';
  try{ tip=`GFL Bucks — next ${bucksFmt(BUCKS_WEEKLY)} lands in ${bucksResetsIn()}`; }catch(e){}
  if(el.title!==tip) el.title=tip;
  /* patched rather than rebuilt: this runs on every tab switch and every
     settled bet, and replacing the node would restart the icon each time */
  const v=el.querySelector('.bucks-v');
  if(v){ if(v.textContent!==txt) v.textContent=txt; return; }
  el.innerHTML=`<span class="bucks-v">${txt}</span>`;
}
function renderBetsBar(){
  try{ renderBucksChip(); }catch(e){}
  const bar=document.getElementById('bets-bar'); if(!bar) return;
  if(_activeTab!=='book'){
    if(!bar.hidden){ bar.hidden=true; bar.innerHTML=''; bar.classList.remove('stuck'); }
    return;
  }
  bar.hidden=false;
  const on=_sbView==='mine', fo=_sbView==='folio';
  /* Just the labels. Both figures are the first thing inside the view each
     button opens, so carrying them here said everything twice and left the two
     buttons looking busy. */
  bar.innerHTML=`<div class="bets-pair">
    <button class="bets-btn${on?' on':''}" onclick="sbSetView('mine')" aria-pressed="${on}">
      <i class="fa fa-wallet"></i><span class="bets-btn-t">My Bets</span>
    </button>
    <button class="bets-btn${fo?' on':''}" onclick="sbSetView('folio')" aria-pressed="${fo}">
      <i class="fa fa-chart-pie"></i><span class="bets-btn-t">My Portfolio</span>
    </button>
  </div>`;
  try{ syncNavDock(); }catch(e){}
}

/* ── BUYING BY THE SHARE OR BY THE DOLLAR ────────────────────────────────────
   A share costs whatever it costs — around ten bucks, and never a round number
   once a season is under way. Buying only in whole shares means you can never
   put a particular amount of money into a team, which is the way most people
   actually think about it: not "four shares of Bismuth" but "ten bucks on
   Bismuth". Dollar mode takes the amount and buys what it buys, fractions and
   all, the same way a real brokerage fills a fractional order.

   The mode is one switch for the whole board rather than one per card. It is a
   way of thinking about the money, not a property of any one team, and twelve
   copies of the same toggle is eleven too many.

   Shares are held to four decimals. That is finer than any amount anyone can
   type is sensitive to — at a ten dollar price it puts the rounding error five
   hundredths of a cent away — so the cost printed on the button is what the
   trade actually costs, which is the only property that has to hold. */
let _invQty={};              // shares typed on a card ('s_'+owner for a sell)
let _invCash={};             // dollars typed on a card, when buying by amount
let _invMode='sh';           // 'sh' buys a share count, 'amt' buys an amount
const invRound=v=>Math.max(0,Math.round((Number(v)||0)*1e4)/1e4);
/* whole numbers stay whole; fractions show what they are and no more */
const invShFmt=v=>{
  const n=Number(v)||0;
  if(Math.abs(n-Math.round(n))<1e-6) return String(Math.round(n));
  return n.toFixed(4).replace(/0+$/,'').replace(/\.$/,'');
};
function invSetMode(m){ _invMode=m==='amt'?'amt':'sh'; _invErr=''; renderBook(); }
function invSetQty(o,v,cap){
  let n=Math.max(0,Number(v)||0);
  if(cap!=null) n=Math.min(n,cap);
  _invQty[o]=invRound(n); renderBook();
}
function invStep(o,d,cap){ invSetQty(o,(_invQty[o]||0)+d,cap); }
function invSetCash(o,v){ _invCash[o]=Math.max(0,Math.round((Number(v)||0)*100)/100); renderBook(); }
function invStepCash(o,d){ invSetCash(o,(_invCash[o]||0)+d); }
/* what a card would trade right now: a share count typed straight in, or the
   shares a dollar amount buys at today's price. Selling is always in shares —
   the holding is a share count and that is what you are giving up. */
function invTradeShares(o,px,sell){
  if(sell||_invMode!=='amt') return invRound(_invQty[sell?'s_'+o:o]||0);
  return invRound((_invCash[o]||0)/(px||1));
}
function invBuyCard(o){ invTrade(o,invTradeShares(o,invPrice(o),false),false); }
function invSellCard(o){ invTrade(o,invTradeShares(o,invPrice(o),true),true); }
/* Typing repaints the one button rather than the board. Rebuilding the card on
   every keystroke would take the focused field down with it, and you would be
   typing one digit at a time into a field that keeps vanishing. */
function invType(el,o,kind){
  if(kind==='amt') _invCash[o]=Math.max(0,Number(el.value)||0);
  else _invQty[o]=invRound(Math.max(0,Number(el.value)||0));
  try{ invPatchCard(el.closest('.iv-card')); }catch(e){}
}
function invPatchCard(card){
  if(!card) return;
  const o=card.dataset.o, px=Number(card.dataset.px)||0, sell=card.dataset.sell==='1';
  const go=card.querySelector('.iv-go'); if(!go) return;
  const n=invTradeShares(o,px,sell), cost=n*px;
  if(sell){
    const have=invHoldings()[o]||0;
    go.disabled=!(n>0)||n>have+1e-6||_invBusy;
    go.textContent='Sell'+(n>0?' · '+invFmt(cost):'');
  }else{
    go.disabled=!(n>0)||cost>bucksBalance()+1e-6||_invBusy;
    go.textContent='Buy'+(n>0?' · '+(_invMode==='amt'?invShFmt(n)+' sh':invFmt(cost)):'');
  }
}

function invBoardHTML(){
  const b=invBoard();
  if(!b) return '<div class="tab-loading" style="padding:30px">Loading the market…</div>';
  const cash=bucksBalance();
  const amt=_invMode==='amt';
  const own=invHoldings();
  /* One card, whether the thing being bought is a team or a fund. They trade
     identically — a price, a number of shares, the same money — so they are
     the same control, and only the crest and the line under the name differ. */
  const card=(x,crest,sub,cls)=>{
    const cashIn=_invCash[x.owner]||0;
    const n=invTradeShares(x.owner,x.price,false), cost=n*x.price;
    const dir=x.chg>0?'up':x.chg<0?'dn':'flat';
    /* In dollar mode the steppers move by five bucks. One cent at a time is
       useless and one dollar is still twenty presses to a sensible stake. */
    const step=amt
      ? `<button class="iv-step" onclick="invStepCash('${x.owner}',-5)" ${cashIn?'':'disabled'}>−</button>
         <span class="iv-amt"><span class="iv-amt-s">$</span><input class="iv-q iv-in" inputmode="decimal"
           value="${cashIn?String(cashIn):''}" placeholder="0" aria-label="Amount to spend on ${x.name}"
           oninput="invType(this,'${x.owner}','amt')" onchange="renderBook()" onblur="renderBook()"></span>
         <button class="iv-step" onclick="invStepCash('${x.owner}',5)">+</button>`
      : `<button class="iv-step" onclick="invStep('${x.owner}',-1)" ${_invQty[x.owner]?'':'disabled'}>−</button>
         <input class="iv-q iv-in" inputmode="decimal" value="${_invQty[x.owner]?invShFmt(_invQty[x.owner]):''}"
           placeholder="0" aria-label="Shares of ${x.name}"
           oninput="invType(this,'${x.owner}','sh')" onchange="renderBook()" onblur="renderBook()">
         <button class="iv-step" onclick="invStep('${x.owner}',1)">+</button>`;
    return `<div class="iv-card${cls||''}" data-o="${x.owner}" data-px="${x.price}">
      <div class="iv-top">
        <span class="iv-c">${crest}</span>
        <span class="iv-n">${x.name}${sub?`<span class="iv-held">${sub}</span>`:''}</span>
        <span class="iv-px">
          <span class="iv-px-v">${invFmt(x.price)}</span>
          <span class="iv-chg ${dir}">${x.chg>0?'▲':x.chg<0?'▼':'–'}${x.chg?Math.abs(x.pct)+'%':''}</span>
        </span>
      </div>
      <div class="iv-buy">
        ${step}
        <button class="iv-go" ${(!(n>0)||cost>cash+1e-6||_invBusy)?'disabled':''}
          onclick="invBuyCard('${x.owner}')">
          Buy${n>0?' · '+(amt?invShFmt(n)+' sh':invFmt(cost)):''}</button>
      </div>
    </div>`;
  };
  const heldSub=o=>own[o]?invShFmt(own[o])+' held':'';
  const funds=(b.funds||[]).map(f=>card(f,invFundCrest(f.members),
    `${f.members.length} teams${own[f.owner]?' · '+invShFmt(own[f.owner])+' held':''}`)).join('');
  const rows=b.list.map(x=>card(x,franchiseAvatar(x.fr,26,7),heldSub(x.owner))).join('');
  /* No cash line at the top. The balance is in the nav on this page, a few
     inches above where this strip used to sit, and two copies of one number on
     one screen is one too many. The Buy button still disables itself against
     the balance, so the limit is enforced where it is felt. */
  return `${_invErr?`<div class="iv-err">${_invErr}</div>`:''}
    <div class="iv-mode" role="group" aria-label="How to buy">
      <span class="iv-mode-l">Buy in</span>
      <button class="iv-mb${amt?'':' on'}" onclick="invSetMode('sh')" aria-pressed="${!amt}">Shares</button>
      <button class="iv-mb${amt?' on':''}" onclick="invSetMode('amt')" aria-pressed="${amt}">Dollars</button>
    </div>
    ${funds?`<div class="iv-gh">The funds</div>
    <div class="iv-list">${funds}</div>
    <div class="iv-gh iv-gh2">The teams</div>`:''}
    <div class="iv-list">${rows}</div>`;
}

function invPortfolioHTML(){
  if(!_me) return `<div class="sb-mine-empty"><i class="fa fa-chart-pie"></i>
    <div>Sign in to hold shares.</div></div>`;
  const b=invBoard();
  if(!b) return '<div class="tab-loading" style="padding:30px">Loading…</div>';
  const h=invHoldings();
  const owners=Object.keys(h);
  /* No ledger strip at the top of this view any more. What it was worth and
     what it had made were two of the three tiles, and the third was the cash
     balance — which now lives in the nav, where it is on show whatever page you
     are on. The chart underneath was already telling the profit story with a
     line rather than a number, so nothing here is lost by dropping the row. */
  if(!owners.length) return invChartHTML()+`<div class="sb-mine-empty"><i class="fa fa-chart-pie"></i>
    <div>No shares yet. The market is on the Investments tab.</div></div>`;
  const chart=invChartHTML();
  const rows=owners.map(o=>{
    /* a fund holding is the same row as a team holding, wearing the crests of
       what it holds instead of one crest of its own */
    const fu=invFund(o);
    const fnd=fu?((b.funds||[]).find(x=>x.owner===o)||{members:[]}):null;
    const fr=fu?null:(_franchises||[]).find(f=>f.owner===o);
    const crest=fu?invFundCrest(fnd.members):(fr?franchiseAvatar(fr,26,7):'');
    const nm=fu?fu.name:(fr?fr.name:o);
    const px=invPrice(o), cb=invCostBasis(o), sh=h[o];
    const gain=(px-cb)*sh, pct=cb?((px-cb)/cb*100):0;
    const q=Math.min(sh,_invQty['s_'+o]||0);
    /* The step up stops at the whole holding rather than at the last whole
       share below it, so one more press on a fractional lot sells all of it
       instead of leaving a remainder no button can reach. */
    return `<div class="iv-card" data-o="${o}" data-px="${px}" data-sell="1">
      <div class="iv-top">
        <span class="iv-c">${crest}</span>
        <span class="iv-n">${nm}<span class="iv-held">${invShFmt(sh)} share${Math.abs(sh-1)<1e-6?'':'s'} · avg ${invFmt(cb)}</span></span>
        <span class="iv-px">
          <span class="iv-px-v">${invFmt(sh*px)}</span>
          <span class="iv-chg ${gain>0?'up':gain<0?'dn':'flat'}">${gain>0?'▲':gain<0?'▼':'–'}${cb?Math.abs(pct).toFixed(1)+'%':''}</span>
        </span>
      </div>
      <div class="iv-buy">
        <button class="iv-step" onclick="invStep('s_${o}',-1,${sh})" ${q?'':'disabled'}>−</button>
        <input class="iv-q iv-in" inputmode="decimal" value="${q?invShFmt(q):''}"
          placeholder="0" aria-label="Shares to sell"
          oninput="invType(this,'s_${o}','sh')" onchange="renderBook()" onblur="renderBook()">
        <button class="iv-step" onclick="invStep('s_${o}',1,${sh})" ${q>=sh-1e-6?'disabled':''}>+</button>
        <button class="iv-go iv-sell" ${(!(q>0)||_invBusy)?'disabled':''}
          onclick="invSellCard('${o}')">
          Sell${q>0?' · '+invFmt(q*px):''}</button>
      </div>
    </div>`;
  }).join('');
  return chart+`${_invErr?`<div class="iv-err">${_invErr}</div>`:''}<div class="iv-list">${rows}</div>`;
}

function renderBook(){
  /* the desktop slip panel lives inside book-body, so a board repaint takes the
     stake field with it — see sbKeepStakeFocus */
  return sbKeepStakeFocus(()=>renderBookInner());
}
function renderBookInner(){
  const el=document.getElementById('book-body'); if(!el) return;
  const book=sbBuild();
  if(!book){ el.innerHTML=`<div class="tab-loading"><i class="fa fa-circle-notch"></i>Setting the lines…</div>`; return; }
  /* no icons on the view filters — six of them side by side was more symbol
     than signal. The My Bets button keeps its wallet, being a different kind
     of control rather than one of a set. */
  const tabs=SB_GROUPS.map(g=>`<button class="tab-btn ${_sbView===g.k?'active':''}" data-view="${g.k}" onclick="sbSetView('${g.k}')">${g.label}</button>`).join('');
  const board=_sbView==='team'?sbTeamViewHTML(book)
    :_sbView==='week'?sbWeekHTML()
    :_sbView==='invest'?invBoardHTML()
    :_sbView==='folio'?invPortfolioHTML()
    :_sbView==='mine'?myBetsHTML()
    :(book.groups[_sbView]||[]).map(sbMarketHTML).join('');
  /* "Lines set" rides beside the page title; My Bets takes the strip the
     futures bar used to hold, so the ledger is one tap from anywhere. */
  const aside=document.getElementById('page-h1-aside');
  if(aside) aside.innerHTML=`<span class="sb-live"><i class="fa fa-circle"></i>Lines set</span>`;
  /* My Bets is not on the page any more — it rides the nav, in #bets-bar */
  /* In My Bets the view tabs are gone — they switch the board, and the board is
     not what you are looking at. A way back takes their place, the same width
     as the wallet button above it so the two read as a pair. */
  el.innerHTML=`
    ${(_sbView==='mine'||_sbView==='folio')
      ? `<button class="sb-back" onclick="sbSetView('week')">
          Return to the sportsbook<i class="fa fa-arrow-right"></i></button>`
      : `<div class="standings-filters sb-tabs" id="sb-tabs" style="padding-bottom:14px">${tabs}</div>`}
    <div class="sb-layout">
      <div class="sb-board">${board}</div>
      <div class="sb-slip-wrap" id="sb-slip-wrap">
        <div class="sb-slip sb-slip-target" id="sb-slip">${sbSlipHTML()}</div>
      </div>
    </div>`;
  sbShowPortal(true);
  sbRenderSlip();
  renderBetsBar();
}

// ── VIDEO ──────────────────────────────────────────────────────────────────────
/* A YouTube embed paints its own poster — title bar, channel name, "Watch on
   YouTube", a big play button — and none of it scales down. Beside the
   punishment card the player is about 170px wide on a phone, where that chrome
   swamps the frame. So the resting state is our own poster: the thumbnail plus
   one play glyph, styled to fit whatever width it gets. The real iframe is
   only built on tap, which also means the homepage no longer loads a YouTube
   player nobody has asked to watch. */
/* The featured video goes to YouTube rather than playing in the page, which is
   what the two thumbs beside it already did — the odd one out was the big one.
   Same poster, and the mark in the middle is the YouTube one now, so it says
   where the tap goes before you take it. */
function videoLinkHTML(videoId){
  const v=_videos.find(x=>x.videoId===videoId)||{};
  const thumb=v.thumb||`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
  return `<a class="vid-facade" href="https://www.youtube.com/watch?v=${videoId}"
      target="_blank" rel="noopener" data-vid="${videoId}"
      aria-label="Watch ${(v.title||'video').replace(/"/g,'&quot;')} on YouTube">
    <img src="${thumb}" alt="" loading="eager" decoding="async"/>
    <span class="vid-play"><i class="fa-brands fa-youtube"></i></span>
  </a>`;
}
/* Nothing reaches this any more — it, playVideo() and selectVideo() are the
   in-page player, and every slide now goes out to YouTube. Kept together and
   intact because they are the way back: swapping videoLinkHTML for
   videoFacadeHTML in vidCarouselHTML restores playback in place. */
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
    /* Which season those pickups belong to. The sportsbook's week board is on
       the season being played next, which is not always the season showing
       here, and a week-1 FAAB bid from a different year is not a week-1 FAAB
       bid on this board. */
    _cmBreakdownSeason=String(season);

    const cmRanked=[..._teams].sort((a,b)=>(_scores[b.id]||0)-(_scores[a.id]||0));
    const firstVid=_videos[0];
    _activeVideoId=firstVid?.videoId||null;

    {const _lu=document.getElementById('last-updated'); if(_lu) _lu.textContent='Updated '+new Date().toLocaleTimeString();}
    setStatus('live','Live');

    const franchiseOpts=sel=>_franchises.map(f=>`<option value="${f.owner}" ${f.owner===sel?'selected':''}>${f.name}</option>`).join('');

    app.innerHTML=`
      <!-- HOME -->
      <div class="tab-page" id="page-home">
        <!-- Row 1: Ball Knowledge + Matchup of the Week (left), video (right).
             The punishment moved to the pinned bar at the foot of the screen. -->
        <div class="home-top">
          <div class="home-left-col">
            <div class="sec wm mod-cp" data-wm="&#xf0ca;" id="cp-sec">
              <div class="sec-head"><i class="fa fa-ranking-star"></i>B&amp;C Coaches Poll</div>
              <div id="cp-body"></div>
            </div>
            <div class="sec wm mod-nt" data-wm="&#xf0f3;" id="nt-sec">
              <div class="sec-head"><i class="fa fa-bell"></i>Notifications<span class="badge-info" id="nt-count"></span></div>
              <div id="nt-body"></div>
            </div>
            <div class="sec wm mod-bk" data-wm="&#xf059;" id="bk-sec">
              <div class="sec-head"><i class="fa fa-brain"></i>Ball Knowledge</div>
              <div id="bk-body"></div>
            </div>
            <div class="sec wm mod-pk" data-wm="&#xf0e7;" id="pk-sec">
              <div class="sec-head"><i class="fa fa-burst"></i>Matchup Picks</div>
              <div id="pk-body"></div>
            </div>
            <!-- Matchup of the Week is hidden for now. The markup and
                 renderMatchupOfWeek() are both still here; putting the block
                 back and restoring the call in the boot sequence brings it
                 back exactly as it was. Its pick now leads the weekly stack. -->
          </div>
          <div class="home-vid-col">
            <div class="sec">
              <div class="home-box">${firstVid
                ?vidCarouselHTML()
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
        <!-- Last on the page, until Ball Knowledge is finished and slides below
             it — that card is explicitly meant to end up last once it is done. -->
        <!-- Most Cursed removed from the homepage; it still leads the Bad Beat
             O'Meter tab, and cursedHTML/renderCursed remain for reuse. -->
      </div>
      <!-- (Legacy Report now lives on the team profile, under the hero) -->

      <!-- STANDINGS & STATS -->
      <div class="tab-page" id="page-standings">
        <div class="sec wm" data-wm="&#xe561;">
          <div id="stats-standings">
            <div style="font-size:12px;color:var(--text3);margin:0 2px 10px">Click any column header to sort.</div>
            <div class="tscroll"><table class="min640 noseam" data-mhide="Moves,Trades,AT PF,AT PA,PF/Yr,PA/Yr"><thead id="standings-thead"></thead><tbody id="standings-tbody"></tbody></table></div>
          </div>
        </div>
      </div>

      <!-- COACHING METRIC — its own tab now. It was a second view bolted onto
           Stats & Standings, which meant four sections' worth of analysis lived
           behind a filter button nobody pressed. -->
      <div class="tab-page" id="page-cm">
        <div class="sec wm" data-wm="&#xf5dc;">
          <!-- the jump bar lives here, above the sections it moves between -->
          <nav class="sec-nav sec-nav-local" aria-label="Sections on this page" hidden></nav>
          <div id="stats-cm">
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
            <!-- no heading: the page title already says Trades, and a second
                 one here just repeated it above the filters -->
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
            ${''/* two sides, side by side, each defaulting to All teams. No
                    label: "All teams" says what the control is, and a label
                    would only take width the second dropdown needs. */}
            <div class="picker-bar picker-2" id="trade-team">
              <select id="trade-team-select" aria-label="First team" onchange="setTradeTeam(this.value)"><option value="">All teams</option>${_franchises.map(f=>`<option value="${f.owner}" ${_tradeTeamFilter===f.owner?'selected':''}>${f.name}</option>`).join('')}</select>
              <select id="trade-team-select-2" aria-label="Second team" onchange="setTradeTeam2(this.value)"><option value="">All teams</option>${_franchises.map(f=>`<option value="${f.owner}" ${_tradeTeamFilter2===f.owner?'selected':''}>${f.name}</option>`).join('')}</select>
            </div>
          </div>
          <div id="trades-body" class="trades-list"></div>
        </div>
      </div>

      <!-- DRAFT -->
      <div class="tab-page" id="page-draft">
        <div class="sec wm" data-wm="&#xf46d;">
          ${''/* the badge is set from renderDraftTab once the board has landed:
                 what this report is depends on whether the season has been
                 played, and the shell is built before anybody knows */}
          <div class="sec-head"><i class="fa fa-clipboard-list"></i>Draft Report — ${season}<span class="badge-info" id="draft-badge">draft slot vs season finish</span></div>
          <div id="draft-body"></div>
        </div>
      </div>

      <!-- MATCHUP HISTORY -->
      <div class="tab-page" id="page-history">
        <div class="sec wm" data-wm="&#xf24e;">
          <div class="sec-head"><i class="fa fa-scale-balanced"></i>Head-to-Head Records<span class="badge-info">all seasons · ${ALL_SEASONS[0]}–present</span></div>
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
      <div class="tab-page" id="page-punishment">
        <div id="punishment-body"></div>
      </div>

      <div class="tab-page" id="page-book">
        <div class="sec wm" data-wm="&#xf51e;">
          <div id="book-body"></div>
        </div>
      </div>

      <!-- LEADERBOARDS — the league against itself -->
      <div class="tab-page" id="page-leaders">
        <div class="sec wm" data-wm="&#xf091;" id="ld-bk-sec">
          <div class="sec-head"><i class="fa fa-brain"></i>Ball Knowledge</div>
          <div id="ld-bk-body"></div>
        </div>
        <div class="sec wm" data-wm="&#xf51e;" id="ld-money-sec">
          <div class="sec-head"><i class="fa fa-sack-dollar"></i>Bets &amp; Portfolios</div>
          <div id="ld-money-body"></div>
        </div>
        <div class="sec wm" data-wm="&#xf0e7;" id="ld-pk-sec">
          <div class="sec-head"><i class="fa fa-burst"></i>Matchup Picks</div>
          <div id="ld-pk-body"></div>
        </div>
        <div class="sec wm" data-wm="&#xf7fb;" id="ld-egg-sec">
          <div class="sec-head"><i class="fa fa-egg"></i>Eggs Found</div>
          <div id="ld-egg-body"></div>
        </div>
      </div>

      <!-- PLAYER TENURE -->
      <!-- THIS WEEK — everything on the clock, gathered in one place -->
      <div class="tab-page" id="page-week">
        <div class="sec wm" data-wm="&#xf201;" id="fc-sec">
          <div class="sec-head"><i class="fa fa-chart-line"></i>Your Forecast</div>
          <div id="fc-body"></div>
        </div>
        <!-- The Schedules tab folded in here: the week ahead belongs beside
             the read on your own game, not a tab away. The Scoreboard and
             League Action are gone; the live board is on the homepage. -->
        <div class="sec">
          <div class="sec-head" id="sched-head"><i class="fa fa-calendar-days"></i>Schedule<span class="badge-info">win odds from the B&amp;C power ratings</span></div>
          <div class="picker-bar" style="padding-bottom:16px">
            <label for="sched-team-select" style="font-size:13px;color:var(--text3)">Team:</label>
            <select id="sched-team-select" onchange="_schedTeam=this.value;renderSchedule()">${_teams.map(t=>`<option value="${t.id}">${t.name}</option>`).join('')}</select>
          </div>
          <div id="sched-body"></div>
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
    /* Matchup of the Week is hidden — see the homepage markup. Skipping the
       render is the point: it built a comparison table and ran a vote fetch on
       every load. */
    // renderMatchupOfWeek();
    renderPunishment();
    renderMyMatchupBar();   // punishment bar: config-driven, so it can paint now
    renderBallKnowledge();
    renderWeekPicks();
    renderCoachesPoll();
    leagueStart();            // keeps shared tallies in step across open sessions
    renderLeagueAction();
    /* Feeds the Ball Knowledge IQ meter, which now reads picks and settled bets
       as well as the trivia — so it is needed whether or not the week has been
       revealed. */
    {
      gflListProfiles().then(rows=>{
        if(!rows) return;
        _bkProfiles=rows;
        if(_activeTab==='teams') renderProfile();
      }).catch(()=>{});
    }
    /* the board is on the homepage, which is where the app opens — switchTab
       only fires when you navigate, so the first load has to start it too */
    if(_activeTab==='home') liveStart();
    if(_profileTeam==null) _profileTeam=String(_teams[0]?.id||'');
    renderHomeHeadlines();
    renderHistoryTable();
    renderLeagueHistory();
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
/* #app is rebuilt wholesale by loadDashboard and by some tab renders, which
   discards anything parked on it — the egg included. Repainting from the same
   observer that rewires sortable tables means the egg comes back after any
   rebuild rather than only the paths someone remembered to hook. It cannot
   loop: eggPaint returns without touching the DOM once the egg on screen is
   the one the current window calls for. */
(function(){const app=document.getElementById('app');if(app){
  new MutationObserver(()=>{ initSortable(); try{ eggPaint(); }catch(e){} })
    .observe(app,{childList:true,subtree:true});
}})();
loadDashboard();

if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',initMobileTables); else initMobileTables();
/* each init is isolated: they shared a statement, so a throw in the first
   silently prevented the second from ever running */
function bootUI(){ try{initSignIn();}catch(e){} try{eggStart();}catch(e){} try{eggSync();}catch(e){}
  try{ntStartDayWatch();}catch(e){} try{ntSync();}catch(e){} try{ttSync();}catch(e){}
  try{invSync();}catch(e){} }
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
