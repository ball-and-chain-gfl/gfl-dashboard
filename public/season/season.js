/* ═══ THE SEASON ═══
   Pick a league size, build your team, then play it out week by week: everyone plays everyone once, the best go to the
   playoffs, one team wins it. Between games is the hub: the schedule, your next game, your team, and the league.
   The season lives on this device only (localStorage), so a reload picks up where you were. */
const SEASON_KEY='gfl-season-v1';
const PRESETS=[
  {id:'short',name:'Short',teams:6,po:2,note:'6 teams · 5 games · the top 2 play the final'},
  {id:'standard',name:'Standard',teams:8,po:4,note:'8 teams · 7 games · the top 4 make the playoffs'},
  {id:'long',name:'Long',teams:10,po:4,note:'10 teams · 9 games · the top 4 make the playoffs'},
  {id:'gfl',name:'The GFL',teams:12,po:6,note:'12 teams · 11 games · the top 6 make the playoffs, the top 2 get a bye'}];
let LG=null;
const OSLOTS=['QB','RB','WR','WR','TE'];
const pois=l=>{ let L=Math.exp(-l), k=0, p=1; do{ k++; p*=Math.random(); }while(p>L); return k-1; };
const slim=p=>({id:p.id,n:p.n,pos:p.pos,season:p.season,r:p.r,a:p.a,sk:p.sk});
const save=()=>{ try{ localStorage.setItem(SEASON_KEY,JSON.stringify(LG)); }catch(e){} };
const youIdx=()=>0;

/* EVERY TEAM THE GFL HAS HAD, once: names that are the same team written two ways ("The Teton Tinglers" and "Teton
   Tinglers", "Team silly willy" and "Silly Willys") count once, as the most recent. Your own team isn't an opponent. */
function leaguePool(){ const key=n=>String(n).toLowerCase().replace(/[^a-z0-9 ]/g,' ').trim().replace(/^(the|team)\s+/,'').replace(/\s+/g,'').replace(/s$/,'');
  const by={}; TEAMS.forEach(t=>{ const k=key(t.name); if(!k) return; if(!by[k]||(t.first||0)>(by[k].first||0)) by[k]=t; });
  const me=key(ME.name); return Object.entries(by).filter(([k])=>k!==me).map(([,t])=>t); }

/* A TEAM'S COLOURS, from its logo: the colour it shows most (a bold colour over greys, black or white, and never the
   background around the logo), and the next most that's clearly different. No logo: two colours from its name. */
const NOLOGO=[['#c8233e','#f0ce26'],['#1f7a4d','#e8ebef'],['#6b3fa0','#f0ce26'],['#d9661f','#1b1d22'],['#0f6e8c','#e8ebef'],['#8a1c2b','#c9ced6']];
function nameColors(n){ let h=7; for(const c of String(n)) h=(h*31+c.codePointAt(0))>>>0; return NOLOGO[h%NOLOGO.length]; }
function logoColors(t){ return new Promise(res=>{ const fb=()=>res(nameColors(t.name)); if(!t.logo) return fb();
  const im=new Image(); im.onerror=fb;
  im.onload=()=>{ try{ const N=48, c=document.createElement('canvas'); c.width=c.height=N; const x=c.getContext('2d',{willReadFrequently:true}); x.drawImage(im,0,0,N,N);
    const d=x.getImageData(0,0,N,N).data, bins={}, edge={}; let edges=0;
    for(let y=0;y<N;y++) for(let xx=0;xx<N;xx++){ const o=(y*N+xx)*4; if(d[o+3]<160) continue; const r=d[o],g=d[o+1],b=d[o+2], k=[r,g,b].map(v=>Math.round(v/51)).join('');
      const B=bins[k]||(bins[k]={n:0,r:0,g:0,b:0}); B.n++; B.r+=r; B.g+=g; B.b+=b;
      if(xx<2||y<2||xx>N-3||y>N-3){ edge[k]=(edge[k]||0)+1; edges++; } }
    const bg=Object.entries(edge).sort((a,b)=>b[1]-a[1])[0], list=Object.entries(bins).map(([k,B])=>{ const col=toHex([B.r/B.n,B.g/B.n,B.b/B.n]), [r,g,b]=hx(col), mx=Math.max(r,g,b), mn=Math.min(r,g,b), sat=mx?(mx-mn)/mx:0;
      return {col,n:B.n*(bg&&k===bg[0]&&bg[1]>edges*.35?.12:1),sat,l:lumC(col)}; }).sort((a,b)=>b.n-a.n);
    if(!list.length) return fb();
    const tot=list.reduce((s,b)=>s+b.n,0), bold=list.find(b=>b.sat>.28&&b.l>.1&&b.l<.9&&b.n>tot*.05), p=(bold||list[0]).col;
    const q=(list.find(b=>distC(b.col,p)>95&&b.n>tot*.03)||{col:lumC(p)>.5?'#111318':'#ffffff'}).col;
    res([p,q]); }catch(e){ fb(); } };
  im.src=t.logo; }); }

/* ROSTERS: every team gets its five the way you do, a pack for each spot with the same odds of each tier (a quarter
   each), and a defense the same way each week. No player-season is on two teams. */
function pickPlayer(pos,used){ const t=roll(), ok=p=>p.pos===pos&&!used.has(p.id+'-'+p.season); let g=POOL.filter(p=>ok(p)&&TIER(p.r)===t); if(!g.length) g=POOL.filter(ok);
  const p=g[Math.floor(Math.random()*g.length)]; used.add(p.id+'-'+p.season); return slim(p); }
function pickDST(){ const t=roll(), g=DEFS.filter(d=>TIER(d.r)===t), d=g[Math.floor(Math.random()*g.length)]; return {id:'d'+d.id+'-'+d.season,n:d.n,pos:'D/ST',season:d.season,r:d.r,a:d.a}; }
const offR=t=>Math.round(t.roster.reduce((s,p)=>s+p.r,0)/t.roster.length);
const blank=()=>({g:0,w:0,l:0,t:0,pf:0,pa:0,py:0,ry:0,ya:0,take:0,give:0,sk:0});

/* everyone plays everyone once (the circle method), home and away alternating */
function roundRobin(ids){ const a=ids.slice(); if(a.length%2) a.push(null); const n=a.length, R=[];
  for(let r=0;r<n-1;r++){ const g=[]; for(let i=0;i<n/2;i++){ const x=a[i], y=a[n-1-i]; if(x!=null&&y!=null) g.push((r+i)%2?{h:x,a:y}:{h:y,a:x}); } R.push(g); a.splice(1,0,a.pop()); }
  return R; }

async function newLeague(preset){
  const P=PRESETS.find(p=>p.id===preset)||PRESETS[1], opp=leaguePool().sort(()=>Math.random()-.5).slice(0,P.teams-1);
  const used=new Set((DR.got||[]).slice(0,5).filter(Boolean).map(p=>p.id+'-'+p.season)), teams=[ME,...opp].map((t,i)=>({name:t.name,logo:t.logo||null,teamId:t.teamId,first:t.first,
    roster:i===0?DR.got.slice(0,5).map(slim):OSLOTS.map(pos=>pickPlayer(pos,used)),dst:i===0?DR.got[5]:pickDST(),col:null,st:blank()}));
  const cols=await Promise.all(teams.map(t=>logoColors(t))); teams.forEach((t,i)=>t.col=cols[i]);
  const order=teams.map((_,i)=>i).sort(()=>Math.random()-.5);
  LG={v:1,preset:P.id,name:P.name,po:P.po,teams,rounds:roundRobin(order).map((g,i)=>({kind:'reg',label:'Week '+(i+1),games:g.map(x=>({...x,s:null}))})),cur:0,dstRound:0,
    ps:[0,1,2,3,4].map(()=>({g:0,att:0,comp:0,py:0,ptd:0,int:0,sk:0,car:0,ry:0,rushtd:0,tgt:0,rec:0,recy:0,rtd:0,fum:0})),dst:[],alive:null,champ:null,phase:'reg'};
  save(); }

/* a game neither side is yours: each offence against the other's defense, scored like the games you play */
const bin=(n,p)=>{ let k=0; for(let i=0;i<n;i++) if(Math.random()<p) k++; return k; };
function simSide(o,d){ const adv=(offR(o)-d.dst.r)/10, td=pois(clamp(1.15+adv*.45,.25,3.2)), fg=pois(.85), tot=Math.max(70,Math.round(250+adv*38+gauss()*45)), py=Math.round(tot*clamp(.56+gauss()*.07,.3,.8));
  const tdP=bin(td,.58), give=pois(1.1), ints=bin(give,.6);
  return {pts:td*7+fg*3,py,ry:tot-py,give,sk:pois(1.6),tdP,tdR:td-tdP,ints,fum:give-ints}; }
/* PLAYERS' LINES. A team's offense in a game, shared out the way a real box score falls: the quarterback throws it all;
   the back carries most of the runs and the quarterback the rest; each catch goes to a receiver by his rating and spot
   (receivers most, then the tight end, then the back), and each catch is a different length. */
const pickW=W=>{ let x=Math.random()*W.reduce((a,b)=>a+b.w,0); for(const w of W){ if((x-=w.w)<0) return w; } return W[W.length-1]; };
function linesFrom(t,S){ const R=t.roster, L=R.map(()=>({att:0,comp:0,py:0,ptd:0,int:0,sk:0,car:0,ry:0,rushtd:0,tgt:0,rec:0,recy:0,rtd:0,fum:0}));
  const att=S.py>0?Math.max(6,Math.round(S.py/(6.2+Math.random()*1.8))):pois(4), comp=S.py>0?Math.max(1,Math.min(att,Math.round(att*(.55+Math.random()*.15)))):0, Q=L[0], B=L[1];
  Object.assign(Q,{att,comp,py:comp?S.py:0,ptd:S.tdP,int:S.ints,sk:S.sk});
  const qr=Math.max(0,Math.round(S.ry*(.06+Math.random()*.12))); Q.ry=qr; Q.car=qr>0?1+pois(1.5):pois(.8); B.ry=S.ry-qr; B.car=Math.max(B.ry>0?5:0,Math.round(B.ry/(3.6+Math.random()*1.6)));
  for(let i=0;i<S.tdR;i++) (Math.random()<.82?B:Q).rushtd++;
  for(let i=0;i<(S.fum||0);i++) L[Math.random()<.5?1:Math.floor(Math.random()*5)].fum++;
  const W=[1,2,3,4].map(i=>({i,w:({RB:.15,WR:.31,TE:.23})[R[i].pos]*(R[i].r/85)*(.6+Math.random()*.8)})), C=[];
  for(let k=0;k<comp;k++) C.push({i:pickW(W).i,y:.25+Math.random()*1.5});
  const ty=C.reduce((a,c)=>a+c.y,0)||1; let left=Q.py; C.forEach((c,k)=>{ const y=k===C.length-1?left:Math.round(Q.py*c.y/ty); L[c.i].rec++; L[c.i].recy+=y; left-=y; });
  for(let k=0;k<att-comp;k++) L[pickW(W).i].tgt++; L.forEach(l=>l.tgt+=l.rec);
  const got=W.filter(w=>L[w.i].rec>0); for(let k=0;k<S.tdP;k++) L[pickW(got.length?got:W).i].rtd++;
  return L; }
function addLines(ti,L){ const t=LG.teams[ti]; LG.pl=LG.pl||{}; t.roster.forEach((p,k)=>{ const o=LG.pl[ti+':'+k]||(LG.pl[ti+':'+k]={ti,k,n:p.n,pos:p.pos,id:p.id,r:p.r,g:0});
  o.g++; Object.entries(L[k]).forEach(([f,v])=>{ if(f!=='long'&&f!=='g') o[f]=(o[f]||0)+v; }); }); }
/* a defense's line: what the offense it faced did */
function addD(ti,dst,S){ LG.dl=LG.dl||{}; const o=LG.dl[ti+':'+dst.id]||(LG.dl[ti+':'+dst.id]={ti,n:dst.n,season:dst.season,r:dst.r,g:0,sk:0,int:0,fum:0,pa:0,ya:0});
  o.g++; o.sk+=S.sk||0; o.int+=S.ints||0; o.fum+=S.fum||0; o.pa+=S.pts||0; o.ya+=(S.py||0)+(S.ry||0); }
function record(g,H,A){ const T=LG.teams, add=(t,me,them)=>{ const s=t.st; s.g++; s.pf+=me.pts; s.pa+=them.pts; s.py+=me.py; s.ry+=me.ry; s.ya+=them.py+them.ry; s.give+=me.give; s.take+=them.give; s.sk+=them.sk;
    if(me.pts>them.pts) s.w++; else if(me.pts<them.pts) s.l++; else s.t++; };
  g.s=[H.pts,A.pts]; add(T[g.h],H,A); add(T[g.a],A,H); }
function simGame(g,mustWin){ const T=LG.teams, H=simSide(T[g.h],T[g.a]), A=simSide(T[g.a],T[g.h]);
  if(mustWin&&H.pts===A.pts){ (Math.random()<.5+(offR(T[g.h])-offR(T[g.a]))/60?H:A).pts+=3; g.ot=1; }
  record(g,H,A); addLines(g.h,linesFrom(T[g.h],H)); addLines(g.a,linesFrom(T[g.a],A)); addD(g.h,T[g.h].dst,A); addD(g.a,T[g.a].dst,H); }

const pct=s=>s.g?(s.w+s.t*.5)/s.g:0;
function standings(){ return LG.teams.map((t,i)=>({i,t,s:t.st})).sort((a,b)=>pct(b.s)-pct(a.s)||(b.s.pf-b.s.pa)-(a.s.pf-a.s.pa)||b.s.pf-a.s.pf); }
const myGame=r=>(r||LG.rounds[LG.cur]).games.find(g=>g.h===0||g.a===0);

/* THE PLAYOFFS: the top teams by record, seeded. Six: the top two sit out the wild-card round. Then the best seed left
   plays the worst, and so on, until one is left. A playoff game can't end level: overtime decides it. */
function playoffRound(){ const a=LG.alive, kind=a.length===6?'Wild card':a.length===4?'Semifinals':a.length===2?'The final':'Playoffs';
  const games=a.length===6?[{h:a[2],a:a[5]},{h:a[3],a:a[4]}]:a.slice(0,a.length/2).map((x,i)=>({h:x,a:a[a.length-1-i]}));
  LG.rounds.push({kind:'po',label:kind,games:games.map(g=>({...g,s:null})),bye:a.length===6?[a[0],a[1]]:[]}); }
/* when every game of the round is in: the playoffs, the next round, or the champion */
function advance(){ const R=LG.rounds[LG.cur];
  if(R.kind==='po'){ const won=R.games.map(g=>g.s[0]>g.s[1]?g.h:g.a), seed=i=>LG.seeds.indexOf(i); LG.alive=[...(R.bye||[]),...won].sort((x,y)=>seed(x)-seed(y)); }
  if(R.kind==='reg'&&LG.cur===LG.rounds.length-1){ LG.seeds=standings().map(x=>x.i); LG.alive=LG.seeds.slice(0,LG.po); LG.phase='po'; }
  if(LG.phase==='po'&&LG.alive.length===1){ LG.champ=LG.alive[0]; LG.phase='done'; save(); return; }
  if(LG.phase==='po'&&LG.cur===LG.rounds.length-1) playoffRound();
  LG.cur++; LG.teams.forEach((t,i)=>{ if(i) t.dst=pickDST(); }); cpuRespins(); save(); }
/* ONE RE-SPIN A WEEK, for everyone. Yours you take yourself from the hub; each other team takes its own here: it spins a
   new player at its weakest spot and keeps whichever of the two is better. The moves are listed with the week's results. */
function cpuRespins(){ const used=new Set(LG.teams.flatMap(t=>t.roster.map(p=>p.id+'-'+p.season))); LG.moves=[];
  LG.teams.forEach((t,i)=>{ if(!i) return; let k=0; t.roster.forEach((p,j)=>{ if(p.r<t.roster[k].r) k=j; }); const old=t.roster[k], c=pickPlayer(OSLOTS[k],used);
    if(c&&c.r>old.r){ t.roster[k]=c; LG.moves.push({t:i,pos:OSLOTS[k],out:{n:old.n,r:old.r},in:{n:c.n,r:c.r,season:c.season}}); } }); }
/* YOURS: pick one of your five, spin a pack for that spot, and take a new player or keep the one you had */
let RESPIN=null;
function respinPick(){ const me=LG.teams[0];
  $('#scr-hub .hb-body').innerHTML=`<div class="hb-card"><span class="tag">Re-spin one player</span><h3>Which spot?</h3><p>Spin a pack for one of your five. You'll see four players from it and can take one, or keep the player you have. One re-spin a week; your defense isn't part of it.</p>
    <div class="rsp">${me.roster.map((p,i)=>`<button class="t-${TIER(p.r)}" data-i="${i}"><span>${OSLOTS[i]}</span><b>${esc(p.n)}</b><em>${p.r}</em></button>`).join('')}</div>
    <button class="btn" id="rsp-x">Not this week</button></div>`;
  document.querySelectorAll('.rsp button').forEach(b=>b.onclick=()=>startRespin(+b.dataset.i)); $('#rsp-x').onclick=()=>hub('next'); }
function startRespin(i){ RESPIN={i,old:DR.got[i]||LG.teams[0].roster[i]}; DR.i=i; DR.got[i]=null; screen('draft'); stageSpin(); }
function respinDone(keep){ const i=RESPIN.i; if(keep||!DR.got[i]) DR.got[i]=RESPIN.old; LG.teams[0].roster[i]=slim(DR.got[i]); LG.respin=LG.cur; RESPIN=null; DR.i=6; save(); hub('next'); }
/* finish the round without you: every game left gets simulated */
function simRound(){ const R=LG.rounds[LG.cur]; R.games.forEach(g=>{ if(!g.s) simGame(g,R.kind==='po'); }); advance(); }

/* YOUR GAME. Kits: the home side in its home look, the visitors in theirs, unless they'd look alike. */
function kickoff(){
  const R=LG.rounds[LG.cur], g=myGame(R), home=g.h===0, them=LG.teams[home?g.a:g.h], me=LG.teams[0];
  me.dst=DR.got[5]; const [hk,ak]=dressFor(home?me.col:them.col,home?them.col:me.col); setKits(home?hk:ak,home?ak:hk);
  CPU=them; screen('game'); MATCH.start({team:them,dst:them.dst,off:offR(them),home,label:R.label,mustWin:R.kind==='po'}); }
/* the final whistle: your line goes in the book, then the rest of the round */
function seasonFinal(M){ const R=LG.rounds[LG.cur], g=myGame(R); if(!g||g.s) return; const home=g.h===0, st=M.st, fum=M.ps.reduce((s,p)=>s+p.fum,0);
  const mine={pts:M.score[0],py:st.py,ry:st.ry,give:st.int+fum,sk:st.sk}, theirs={pts:M.score[1],py:M.opp.py||0,ry:M.opp.ry||0,give:M.dst.int+M.dst.fum,sk:M.dst.sk};
  if(R.kind==='po'&&mine.pts===theirs.pts){ (Math.random()<.5?mine:theirs).pts+=3; M.ot=true; }
  if(M.ot) g.ot=1; record(g,home?mine:theirs,home?theirs:mine);
  M.ps.forEach((p,i)=>{ const L=LG.ps[i]; L.g++; Object.keys(p).forEach(k=>{ if(k!=='long') L[k]=(L[k]||0)+p[k]; }); });
  const oi=home?g.a:g.h, them=LG.teams[oi], O=M.opp;
  addLines(0,M.ps); addLines(oi,linesFrom(them,{py:O.py||0,ry:O.ry||0,tdP:O.tdP||0,tdR:O.tdR||0,ints:M.dst.int,fum:M.dst.fum,sk:M.dst.sk}));
  addD(0,DR.got[5],{sk:M.dst.sk,ints:M.dst.int,fum:M.dst.fum,pts:M.score[1],py:O.py||0,ry:O.ry||0}); addD(oi,them.dst,{sk:st.sk,ints:st.int,fum,pts:M.score[0],py:st.py,ry:st.ry});
  LG.dst.push({round:R.label,n:DR.got[5].n,season:DR.got[5].season,r:DR.got[5].r,sk:M.dst.sk,take:M.dst.int+M.dst.fum,pa:M.score[1],ya:M.opp.yds});
  save(); }
function seasonContinue(){ simRound(); hub('next'); }

/* ═══ THE HUB ═══ */
const recTxt=s=>s.w+'–'+s.l+(s.t?'–'+s.t:'');
const tm=(i,cls)=>{ const t=LG.teams[i]; return `<span class="tmn ${cls||''}"><i style="--p:${t.col?t.col[0]:'#555'};--q:${t.col?t.col[1]:'#999'}"></i>${crest(t)}<b>${esc(t.name)}</b></span>`; };
let HUBTAB='next', LGTAB='table';
function hub(tab){ if(tab) HUBTAB=tab; screen('hub'); const R=LG.rounds[LG.cur], me=LG.teams[0], tabs=[['next',LG.phase==='done'?'Final':'Next'],['sched','Schedule'],['team','Your team'],['league','League']];
  $('#scr-hub').innerHTML=`<div class="hb-top"><div class="fade"><div class="dots"></div></div><span class="tag">${esc(LG.name)} season · ${LG.phase==='done'?'Over':esc(R.label)}</span>
      <div class="hb-me">${crest(me)}<div><b>${esc(me.name)}</b><span>${recTxt(me.st)} · ${ordinal(standings().findIndex(x=>x.i===0)+1)} of ${LG.teams.length}</span></div></div></div>
    <div class="hb-tabs">${tabs.map(([k,l])=>`<button data-k="${k}" class="${k===HUBTAB?'on':''}">${l}</button>`).join('')}</div>
    <div class="hb-body">${({next:hubNext,sched:hubSched,team:hubTeam,league:hubLeague})[HUBTAB]()}</div>`;
  document.querySelectorAll('.hb-tabs button').forEach(b=>b.onclick=()=>hub(b.dataset.k));
  const act=$('#hb-go'); if(act) act.onclick=()=>{ const g=myGame();
    if(LG.phase==='done') return newSeason();
    if(!g) return (simRound(),hub('next'));
    if(LG.dstRound===LG.cur&&DR.got[5]) return kickoff();
    DR.i=5; DR.got[5]=null; screen('draft'); stageSpin(); };
  const qb=$('#hb-quick'); if(qb) qb.onclick=()=>quickGame(false);
  const rs=$('#hb-respin'); if(rs) rs.onclick=respinPick;
  const ns=$('#hb-new'); if(ns) ns.onclick=()=>{ if(confirm('Start a new season? This one will be gone.')) newSeason(); };
  document.querySelectorAll('.lg-tabs button').forEach(b=>b.onclick=()=>{ LGTAB=b.dataset.k; hub('league'); }); }
const ordinal=n=>n+(['th','st','nd','rd'][(n%100-20)%10]||['th','st','nd','rd'][n%100]||'th');
function hubNext(){
  if(LG.phase==='done'){ const c=LG.teams[LG.champ], won=LG.champ===0;
    return `<div class="hb-card champ2" style="--fc:${won?'var(--gold)':'var(--text2)'}"><span class="tag">Champion</span><div class="big">${crest(c)}</div><h3>${esc(c.name)}</h3>
      <p>${won?'That\'s you. A title.':'Your season: '+recTxt(LG.teams[0].st)+', '+ordinal(standings().findIndex(x=>x.i===0)+1)+' in the regular season.'}</p>
      <button class="btn w" id="hb-go">New season</button><button class="btn" id="hb-quick">Quick game</button></div>`; }
  const R=LG.rounds[LG.cur], g=myGame(R);
  let top;
  if(g){ const home=g.h===0, o=home?g.a:g.h, t=LG.teams[o], needD=!(LG.dstRound===LG.cur&&DR.got[5]);
    top=`<div class="hb-card"><span class="tag">${esc(R.label)} · ${home?'Home':'Away'}</span>
      <div class="hb-vs"><div>${crest(LG.teams[0])}<b>You</b><span>${recTxt(LG.teams[0].st)}</span></div><i>${home?'v':'at'}</i><div>${crest(t)}<b>${esc(t.name)}</b><span>${recTxt(t.st)}</span></div></div>
      <div class="hb-lu">${[[LG.teams[0],needD?null:DR.got[5],'You'],[t,t.dst,t.name]].map(([T,D,lab])=>`<div><span class="tag">${esc(lab)}</span><span class="ov">Offense <b class="t-${TIER(offR(T))}">${offR(T)}</b></span>
        ${T.roster.map(p=>`<div class="t-${TIER(p.r)}"><span>${p.pos}</span><b>${esc(p.n)}</b><em>${p.r}</em></div>`).join('')}
        ${D?`<div class="t-${TIER(D.r)}"><span>D/ST</span><b>${D.season} ${esc(D.n)}</b><em>${D.r}</em></div>`:'<div class="spin"><span>D/ST</span><b>Spin to see</b><em>?</em></div>'}</div>`).join('')}</div>
      <button class="btn w" id="hb-go">${needD?'Spin your defense':'Kick off'}</button>${needD?'<span class="tag">A new defense every week</span>':''}
      ${LG.respin===LG.cur?'<span class="tag">Re-spin used this week</span>':'<button class="btn" id="hb-respin">Re-spin a player</button>'}</div>`; }
  else top=`<div class="hb-card"><span class="tag">${esc(R.label)}</span><h3>${LG.phase==='po'?(R.bye&&R.bye.includes(0)?'You have a bye':'You\'re out'):'No game this week'}</h3>
      <p>${LG.phase==='po'&&!(R.bye&&R.bye.includes(0))?'The playoffs go on without you.':'The rest of the league plays.'}</p><button class="btn w" id="hb-go">Sim ${esc(R.label.toLowerCase())}</button></div>`;
  const last=LG.cur>0?LG.rounds[LG.cur-1]:null;
  const mv=(LG.moves||[]).map(m=>`<div><b>${esc(LG.teams[m.t].name)}</b><span>${m.pos}: ${esc(m.in.n)} (${m.in.r}) in for ${esc(m.out.n)} (${m.out.r})</span></div>`).join('');
  return top+(last?`<div class="tag hb-h">${esc(last.label)} results</div>${gamesHTML(last)}`:'')+(mv?`<div class="tag hb-h">Roster moves</div><div class="hb-moves">${mv}</div>`:'')+`<div class="hb-row"><button class="btn" id="hb-quick">Quick game</button><button class="btn" id="hb-new">New season</button></div>`; }
function gamesHTML(R){ return `<div class="hb-games">${R.games.map(g=>{ const w=g.s?(g.s[0]>g.s[1]?'h':g.s[1]>g.s[0]?'a':''):'';
  return `<div class="${g.h===0||g.a===0?'me':''}">${tm(g.a,w==='a'?'w':'')}<b class="sc">${g.s?g.s[1]:''}</b><i>at</i><b class="sc">${g.s?g.s[0]:''}</b>${tm(g.h,w==='h'?'w':'')}${g.ot?'<em>OT</em>':''}</div>`; }).join('')}</div>`; }
function hubSched(){ return LG.rounds.map((R,k)=>`<details ${k===LG.cur||(LG.phase==='done'&&k===LG.rounds.length-1)?'open':''}><summary><span>${esc(R.label)}</span>${(()=>{ const g=myGame(R); if(!g) return '<em>'+(R.bye&&R.bye.includes(0)?'Bye':'—')+'</em>';
    const home=g.h===0, o=LG.teams[home?g.a:g.h]; const res=g.s?(()=>{ const m=home?g.s[0]:g.s[1], t=home?g.s[1]:g.s[0]; return `<b class="${m>t?'w':m<t?'l':''}">${m>t?'W':m<t?'L':'T'} ${m}–${t}</b>`; })():'';
    return `<em>${home?'v':'at'} ${esc(o.name)}</em>${res}`; })()}</summary>${gamesHTML(R)}</details>`).join('')
    +(LG.phase!=='done'&&LG.rounds[LG.rounds.length-1].kind==='reg'?`<div class="hb-note">Then the playoffs: the top ${LG.po}${LG.po===6?', the top 2 with a bye':''}.</div>`:''); }
function hubTeam(){ const L=LG.ps, line=(p,i)=>{ const s=L[i];
    if(p.pos==='QB') return [`${s.comp}/${s.att} · ${s.py} yds · ${s.ptd} TD · ${s.int} INT`,`${s.car} rushes, ${s.ry} yds · ${s.sk} sacked`];
    if(p.pos==='RB') return [`${s.car} carries · ${s.ry} yds · ${s.rushtd} TD`,`${s.rec} catches · ${s.recy} yds`];
    return [`${s.rec} of ${s.tgt} · ${s.recy} yds · ${s.rtd} TD`,s.g?`${(s.recy/s.g).toFixed(1)} yds a game`:'no games yet']; };
  const D=LG.dst, tot=D.reduce((a,d)=>({sk:a.sk+d.sk,take:a.take+d.take,pa:a.pa+d.pa}),{sk:0,take:0,pa:0}), cur=DR.got[5];
  return `<div class="tag hb-h">Your five · season</div><div class="pbox">${LG.teams[0].roster.map((p,i)=>{ const [a,b]=line(p,i);
      return `<div class="t-${TIER(p.r)}"><img src="${SHOT(p.id)}" alt=""><span><b>${esc(p.n)}</b><em>${p.pos} · ${p.season} · ${p.r}</em><i>${a}</i><i>${b}</i></span></div>`; }).join('')}</div>
    <div class="tag hb-h">Your defense</div><div class="pbox">${cur&&LG.dstRound===LG.cur?`<div class="t-${TIER(cur.r)}">${nflImg(cur.n)}<span><b>${cur.season} ${esc(cur.n)}</b><em>This week · ${cur.r}</em><i>${ATTR['D/ST'].map((l,k)=>l+' '+(cur.a?cur.a[k]:'–')).join(' · ')}</i></span></div>`:''}
      <div class="t-silver"><span class="ini">D</span><span><b>Season</b><em>${D.length} game${D.length===1?'':'s'}</em><i>${tot.sk} sacks · ${tot.take} takeaways · ${D.length?(tot.pa/D.length).toFixed(1):'0'} points a game allowed</i></span></div>
      ${D.slice().reverse().map(d=>`<div class="t-${TIER(d.r)}">${nflImg(d.n)}<span><b>${d.season} ${esc(d.n)}</b><em>${esc(d.round)} · ${d.r}</em><i>${d.sk} sacks · ${d.take} takeaways · ${d.pa} points, ${d.ya} yds allowed</i></span></div>`).join('')}</div>`; }
function hubLeague(){ const S=standings(), pg=(v,s)=>s.g?(v/s.g).toFixed(1):'–', po=LG.phase==='reg'?LG.po:0;
  const TT=[['table','Standings'],['off','Offense'],['def','Defense']], PT=[['pass','Passing'],['rush','Rushing'],['recv','Receiving'],['dst','Defense']];
  const row=(rank,i,name,sub,vals,me,cut)=>{ const t=LG.teams[i]; return `<div class="lg-r${me?' me':''}${cut?' cut':''}"><span>${rank}</span><span class="tmn"><i style="--p:${t.col?t.col[0]:'#555'};--q:${t.col?t.col[1]:'#999'}"></i>${crest(t)}<b>${esc(name)}${sub?`<small>${esc(sub)}</small>`:''}</b></span>${vals.map(v=>`<span>${v}</span>`).join('')}</div>`; };
  const tabs=`<div class="lg-tabs"><span class="tag">Teams</span>${TT.map(([k,l])=>`<button data-k="${k}" class="${k===LGTAB?'on':''}">${l}</button>`).join('')}</div>
    <div class="lg-tabs p"><span class="tag">Players</span>${PT.map(([k,l])=>`<button data-k="${k}" class="${k===LGTAB?'on':''}">${l}</button>`).join('')}</div>`;
  /* THE TEAMS */
  if(TT.some(t=>t[0]===LGTAB)){ const cols={table:[['W–L',x=>recTxt(x.s)],['PF',x=>x.s.pf],['PA',x=>x.s.pa],['+/–',x=>{ const d=x.s.pf-x.s.pa; return (d>0?'+':'')+d; }]],
      off:[['Pts/G',x=>pg(x.s.pf,x.s)],['Pass/G',x=>pg(x.s.py,x.s)],['Rush/G',x=>pg(x.s.ry,x.s)],['Give',x=>x.s.give]],
      def:[['PA/G',x=>pg(x.s.pa,x.s)],['Yds/G',x=>pg(x.s.ya,x.s)],['Sacks',x=>x.s.sk],['Take',x=>x.s.take]]}[LGTAB];
    return tabs+`<div class="lg"><div class="lg-r lg-h"><span>#</span><span>Team</span>${cols.map(c=>`<span>${c[0]}</span>`).join('')}</div>
      ${S.map((x,k)=>row(k+1,x.i,x.t.name,'',cols.map(c=>c[1](x)),x.i===0,po&&k===po-1)).join('')}</div>
      <div class="hb-note">${LGTAB==='table'?(po?`The top ${po} make the playoffs.`:'Final regular-season standings.'):LGTAB==='off'?'Per game, across the games played. Give: turnovers.':'Per game allowed. Take: turnovers forced.'}</div>`; }
  /* THE PLAYERS, across the games played, the leaders first */
  const P=Object.values(LG.pl||{}), avg=(a,b)=>b?(a/b).toFixed(1):'–';
  const T={pass:{cols:'16px minmax(0,1fr) 54px 40px 26px 26px',h:['C/A','Yds','TD','Int'],rows:P.filter(p=>p.att>0).sort((a,b)=>b.py-a.py),v:p=>[p.comp+'/'+p.att,p.py,p.ptd,p.int],note:'Every quarterback, most yards first.'},
    rush:{cols:'16px minmax(0,1fr) 34px 40px 34px 26px',h:['Car','Yds','Avg','TD'],rows:P.filter(p=>p.car>0).sort((a,b)=>b.ry-a.ry),v:p=>[p.car,p.ry,avg(p.ry,p.car),p.rushtd],note:'Backs and quarterbacks, most yards first.'},
    recv:{cols:'16px minmax(0,1fr) 34px 40px 34px 26px',h:['Rec','Yds','Avg','TD'],rows:P.filter(p=>p.rec>0).sort((a,b)=>b.recy-a.recy),v:p=>[p.rec,p.recy,avg(p.recy,p.rec),p.rtd],note:'Receivers, tight ends and backs, most yards first.'},
    dst:{cols:'16px minmax(0,1fr) 24px 30px 30px 40px',h:['G','Sk','TO','PA/G'],rows:Object.values(LG.dl||{}).sort((a,b)=>a.pa/a.g-b.pa/b.g||(b.sk+b.int+b.fum)-(a.sk+a.int+a.fum)),v:d=>[d.g,d.sk,d.int+d.fum,avg(d.pa,d.g)],note:'Every defense that has played this season, fewest points a game allowed first. TO: takeaways.'}}[LGTAB];
  const name=p=>LGTAB==='dst'?p.season+' '+p.n:p.n, sub=p=>LGTAB==='dst'?LG.teams[p.ti].name:p.pos+' · '+LG.teams[p.ti].name;
  return tabs+`<div class="lg" style="--cols:${T.cols}"><div class="lg-r lg-h"><span>#</span><span>${LGTAB==='dst'?'Defense':'Player'}</span>${T.h.map(c=>`<span>${c}</span>`).join('')}</div>
    ${T.rows.length?T.rows.slice(0,30).map((p,k)=>row(k+1,p.ti,name(p),sub(p),T.v(p),p.ti===0)).join(''):'<div class="lg-empty">No games played yet</div>'}</div><div class="hb-note">${T.note}</div>`; }

/* ═══ STARTING OUT ═══ pick a size, build your team, then the hub */
/* QUICK GAMES ONLY: an account let in just for quick games (Marathon Men) sees the quick game and its test team, and
   nothing of a season: no league to pick, no season to resume */
let QUICK_ONLY=false;
function setupScreen(){ screen('match');
  if(QUICK_ONLY){ $('#scr-match').innerHTML=`<div class="mu setup"><div class="fade"><div class="dots"></div></div><span class="tag" style="position:relative">Season Mode</span>
    <div class="vs" style="grid-template-columns:1fr"><div>${crest(ME)}<span>${esc(ME.name)}</span></div></div>
    <h3>Quick game</h3><p class="sub" style="font-size:13px">Open packs for your six, then play one game against a random GFL team.</p>
    <button class="btn w" id="qg" style="position:relative;width:220px">Quick game</button><button class="btn" id="qgmix" style="position:relative;width:220px">Quick game · test team</button></div>`;
    $('#qg').onclick=()=>quickGame(false); $('#qgmix').onclick=()=>quickGame(true); return; }
  $('#scr-match').innerHTML=`<div class="mu setup"><div class="fade"><div class="dots"></div></div><span class="tag" style="position:relative">Season Mode</span>
    <div class="vs" style="grid-template-columns:1fr"><div>${crest(ME)}<span>${esc(ME.name)}</span></div></div>
    <h3>Pick your league</h3><div class="presets">${PRESETS.map((p,i)=>`<button class="${i===1?'on':''}" data-p="${p.id}"><b>${p.name}</b><span>${p.note}</span></button>`).join('')}</div>
    <p class="sub" style="font-size:13px">Your opponents are drawn from every team the GFL has had, each built from packs on the same odds as yours.</p>
    <button class="btn w" id="go" style="position:relative;width:220px">Open packs</button>
    <button class="btn" id="mix" style="position:relative;width:220px">Test team · mixed tiers</button>
    <div class="qg"><span class="tag">Or just one game</span><p class="sub" style="font-size:13px">A quick game against a random GFL team. Any season you have going stays where it is.</p>
      <button class="btn w" id="qg" style="width:220px">Quick game</button><button class="btn" id="qgmix" style="width:220px">Quick game · test team</button></div></div>`;
  let pick='standard'; document.querySelectorAll('.presets button').forEach(b=>b.onclick=()=>{ pick=b.dataset.p; document.querySelectorAll('.presets button').forEach(x=>x.classList.toggle('on',x===b)); });
  $('#go').onclick=()=>{ SETUP=pick; DR.i=0; DR.got=[]; screen('draft'); stageSpin(); };
  $('#mix').onclick=()=>{ SETUP=pick; mixTeam(); };
  $('#qg').onclick=()=>quickGame(false); $('#qgmix').onclick=()=>quickGame(true); }
/* for testing: skip the packs with one of every tier, in a random order across the six slots */
function mixTeam(){ const tiers=['legend','gold','silver','bronze','gold','silver'].sort(()=>Math.random()-.5); DR.got=[]; DR.i=0;
  SLOTS.forEach((pos,i)=>{ DR.i=i; DR.got[i]=four(pos,tiers[i])[0]; }); DR.i=SLOTS.length; screen('draft'); stageSpin(); }

/* ═══ A QUICK GAME ═══ Your six from packs, one opponent drawn from every GFL team with its five and a defense on the
   same odds, kits from both logos, home or away at random. Nothing goes in a season's book. */
let QUICK=false;
function quickGame(mix){ SETUP=null; QUICK=true; if(mix) return mixTeam(); DR.i=0; DR.got=[]; screen('draft'); stageSpin(); }
async function quickKick(){ $('#kick').disabled=true; $('#kick').textContent='Finding an opponent';
  const pool=leaguePool(), t0=pool[Math.floor(Math.random()*pool.length)], used=new Set(DR.got.slice(0,5).map(p=>p.id+'-'+p.season));
  const them={name:t0.name,logo:t0.logo||null,roster:OSLOTS.map(pos=>pickPlayer(pos,used)),dst:pickDST()};
  const [mine,theirs]=await Promise.all([logoColors(ME),logoColors(them)]), home=Math.random()<.5;
  const [hk,ak]=dressFor(home?mine:theirs,home?theirs:mine); setKits(home?hk:ak,home?ak:hk);
  CPU=them; screen('game'); MATCH.start({team:them,dst:them.dst,off:offR(them),home,label:'Quick game',mustWin:false}); }
/* after it: back to the season if there is one, otherwise the start */
function quickDone(){ QUICK=false; if(resume()) hub('next'); else { DR.i=0; DR.got=[]; setupScreen(); } }
let SETUP=null;
/* the packs are done: the first time, the league is made; every week after, it's time to play */
async function afterDraft(){ if(QUICK) return quickKick(); if(SETUP){ const p=SETUP; SETUP=null; $('#kick').disabled=true; $('#kick').textContent='Building the league'; await newLeague(p); LG.dstRound=0; save(); return hub('next'); }
  LG.dstRound=LG.cur; LG.teams[0].dst=DR.got[5]; save(); kickoff(); }
const draftLabel=()=>SETUP&&!QUICK?'To the season':'Kick off';
function newSeason(){ try{ localStorage.removeItem(SEASON_KEY); }catch(e){} LG=null; DR.i=0; DR.got=[]; setupScreen(); }
/* back where you were: your five and this week's defense come back from the save */
function resume(){ if(QUICK_ONLY){ LG=null; return false; } try{ LG=JSON.parse(localStorage.getItem(SEASON_KEY)||'null'); }catch(e){ LG=null; }
  if(!LG||LG.v!==1||!LG.teams) { LG=null; return false; }
  DR.got=[...LG.teams[0].roster,LG.dstRound===LG.cur?LG.teams[0].dst:null]; DR.i=6; return true; }

/* the defense pack says which game it's for: the first one is week 1's, and before every game after you spin again */
function dLabel(){ if(QUICK||!(SETUP||LG)) return 'Defense'; return (SETUP?'Week 1':LG.rounds[LG.cur].label)+' defense'; }
function dNote(){ if(QUICK||!(SETUP||LG)) return ''; return 'Just for '+(SETUP?'week 1':LG.rounds[LG.cur].label.toLowerCase())+'. You spin a new defense before every game.'; }
