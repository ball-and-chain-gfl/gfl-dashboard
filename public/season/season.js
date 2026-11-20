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
function pickPlayer(pos,used){ const t=roll(), ok=p=>p.pos===pos&&!used.has(p.id+'-'+p.season); let g=POOL.filter(p=>ok(p)&&TIER(p)===t); if(!g.length) g=POOL.filter(ok);
  const p=g[Math.floor(Math.random()*g.length)]; used.add(p.id+'-'+p.season); return slim(p); }
function pickDST(){ const t=roll('D/ST'), g=DEFS.filter(d=>TIER(d.r,1)===t), d=g[Math.floor(Math.random()*g.length)]; return {id:'d'+d.id+'-'+d.season,n:d.n,pos:'D/ST',season:d.season,r:d.r,a:d.a}; }
/* a team's offense is the five who'll actually play */
const BENCH_CAP=6;
function pickTier(pos,used,tier){ const ok=p=>p.pos===pos&&!used.has(p.id+'-'+p.season); let g=POOL.filter(p=>ok(p)&&TIER(p)===tier); if(!g.length) g=POOL.filter(ok);
  const p=g[Math.floor(Math.random()*g.length)]; used.add(p.id+'-'+p.season); return slim(p); }
const offR=t=>{ const L=gameLineup(t); return Math.round(L.reduce((s,p)=>s+p.r,0)/L.length); };
(function(){ try{ if(window.parent===window) return; const d=parent.document, p=d.createElement('div'); p.style.cssText='position:fixed;bottom:0;left:0;height:0;padding-bottom:env(safe-area-inset-bottom,0px);visibility:hidden;pointer-events:none';
  d.body.appendChild(p); const v=parseFloat(parent.getComputedStyle(p).paddingBottom)||0; p.remove(); document.documentElement.style.setProperty('--sab',v+'px'); }catch(e){} })();
/* ═══ STAMINA AND INJURIES ═══
   Each player carries stamina from game to game (0 to 100). Hits wear it down; the lower it is, the likelier the next
   hit hurts him. Between weeks everyone gets some back: a starter 30, a man on the bench 45. When a player is hurt, what
   it is and how long it keeps him out come from the pool below, big hits leaning to the worse ones. g: the games he'll
   miss after this one (99: the rest of the season). */
const INJURIES=[{n:'Shaken up',w:[0,0],p:30},{n:'Bruised ribs',w:[0,1],p:12},{n:'Ankle sprain',w:[1,2],p:14},{n:'Hamstring strain',w:[1,3],p:12},
  {n:'Concussion',w:[1,2],p:8,big:2.2},{n:'Shoulder sprain',w:[1,3],p:7},{n:'High ankle sprain',w:[2,4],p:6,big:1.4},{n:'MCL sprain',w:[2,5],p:4,big:1.4},
  {n:'Broken collarbone',w:[4,8],p:2,big:1.8},{n:'Torn ACL',w:[99,99],p:1.2,big:1.4},{n:'Torn Achilles',w:[99,99],p:.8}];
function rollInjury(big){ const W=INJURIES.map(x=>x.p*(big?(x.big||1)*(x.w[0]>0?1.15:.85):1)); let k=Math.random()*W.reduce((a,b)=>a+b,0), i=0;
  while((k-=W[i])>0&&i<W.length-1) i++; const x=INJURIES[i]; return {n:x.n,w:x.w[0]+Math.floor(Math.random()*(x.w[1]-x.w[0]+1))}; }
const injOut=w=>w>=99?'out for the season':w<=0?'out for the game':'out '+w+' week'+(w===1?'':'s');
const injShort=i=>i.g>=99?'Season':i.g<=0?'This game':i.g+' wk'+(i.g===1?'':'s');
const isBackup=p=>String(p&&p.id).startsWith('bk-');
const backup=pos=>({id:'bk-'+pos,n:'Backup '+pos,pos,season:'',r:68,a:[66,66,66,66],sta:100});
const keyOf=p=>p.id+'-'+p.season;
/* who comes in for a hurt man: the best healthy player on the bench at his position not already playing, or a backup */
function subFor(pos,lineup,team){ const inL=new Set((lineup||[]).filter(Boolean).map(keyOf));
  return ((team&&team.bench)||[]).filter(p=>p.pos===pos&&!p.inj&&!inL.has(keyOf(p))).sort((a,b)=>b.r-a.r)[0]||backup(pos); }
/* who actually plays this week: an injured starter's spot goes to his sub */
function gameLineup(t){ const L=[]; t.roster.forEach(p=>L.push(p.inj?subFor(p.pos,[...L,...t.roster],t):p)); return L; }
function hurt(p,inj){ p.inj={n:inj.n,g:inj.w,fresh:1,wk:LG.rounds[LG.cur].label}; }
/* a simulated game wears a team the same way: every carry, catch and sack is a hit, some of them big */
function simWear(t,L,lineup){ lineup.forEach((p,k)=>{ if(!p||isBackup(p)) return; const l=L[k]||{}; let s=p.sta??100;
    const hits=k===0?(l.sk||0)+(l.car||0):(l.car||0)+(l.rec||0);
    for(let h=0;h<hits;h++){ const big=Math.random()<.14;
      if(!p.inj&&Math.random()<(big?.018:.0065)*(1+3*Math.pow(1-s/100,1.5))) hurt(p,rollInjury(big));
      s=Math.max(0,s-(big?9.5:2.9)*(.75+Math.random()*.5)); }
    p.sta=Math.round(Math.max(0,s-8)); }); }
/* between weeks: stamina back, and the injured a week closer to returning */
function recover(){ LG.teams.forEach(t=>{ const on=new Set(t.roster.map(keyOf));
  [...t.roster,...(t.bench||[])].forEach(p=>{ if(p.inj){ if(p.inj.fresh) delete p.inj.fresh; else if(p.inj.g<99) p.inj.g--; if(p.inj.g<=0&&!p.inj.fresh){ delete p.inj; p.sta=Math.max(p.sta??100,70); } }
    p.sta=Math.min(100,Math.round((p.sta??100)+(on.has(keyOf(p))?30:45))); }); }); }
/* the CPU sets its own lineup: a healthy, better man on its bench starts */
function cpuLineups(){ LG.teams.forEach((t,i)=>{ if(!i||!t.bench||!t.bench.length) return;
  t.roster.forEach((p,k)=>{ const b=t.bench.filter(q=>q.pos===p.pos&&!q.inj).sort((a,c)=>c.r-a.r)[0]; if(b&&(p.inj||b.r>p.r)){ t.roster[k]=b; t.bench.splice(t.bench.indexOf(b),1,p); } }); }); }

/* ═══ WAIVERS (FAAB) ═══
   Every team has $100 for the season. Each week six players nobody owns come up, mostly bronze and silver, now and then
   a legend. Bids are blind. The highest bid wins and pays; a tie goes to the team with the worse record. The CPU bids
   by need: how much better the player is than the man it would start him over (a hurt starter counts as his backup),
   more the more it has left, and it wins one claim a week at most. Waivers run when you head to kickoff. */
const WODDS=[['legend',6],['gold',22],['silver',36],['bronze',36]];
function pickWire(pos,used){ let x=Math.random()*100, t='bronze'; for(const [k,p] of WODDS){ if((x-=p)<0){ t=k; break; } }
  const ok=p=>p.pos===pos&&!used.has(keyOf(p)); let g=POOL.filter(p=>ok(p)&&TIER(p)===t); if(!g.length) g=POOL.filter(ok);
  const p=g[Math.floor(Math.random()*g.length)]; used.add(keyOf(p)); return slim(p); }
function newWire(){ if(LG.phase==='done'){ LG.wire=[]; return; } const used=new Set(LG.teams.flatMap(t=>[...t.roster,...(t.bench||[])].map(keyOf))), P=['QB','RB','RB','WR','WR','WR','TE'];
  LG.wire=Array.from({length:6},()=>pickWire(P[Math.floor(Math.random()*P.length)],used)).sort((a,b)=>b.r-a.r); LG.bids={}; LG.wireDone=-1; }
const wireOpen=()=>!!(LG&&LG.wire&&LG.wire.length&&LG.wireDone!==LG.cur&&LG.phase!=='done');
const myBids=()=>Object.values(LG.bids||{}).filter(v=>v>0);
const upOver=(t,p)=>{ const L=gameLineup(t), at=L.map((q,k)=>OSLOTS[k]===p.pos?q:null).filter(Boolean).sort((a,b)=>a.r-b.r)[0]; return at?{d:p.r-at.r,who:at}:{d:0,who:null}; };
function runWaivers(){ if(!wireOpen()) return []; LG.wireDone=LG.cur; const T=LG.teams, won=new Set(), reg=LG.rounds.filter(r=>r.kind==='reg').length;
  const cpuBid=(t,p)=>{ const u=upOver(t,p).d, left=t.faab, tier=TIER(p), base={legend:34,gold:14,silver:4,bronze:1}[tier]; if(left<=0) return 0;
    if(u<3&&!(tier==='legend'||(tier==='gold'&&u>=0))) return 0;
    const prog=Math.min(1,LG.cur/Math.max(1,reg)), want=(base+Math.max(0,u)*1.5)*(.75+Math.random()*.6)*(u<3?.6:1)+left*.04*prog;
    return Math.min(Math.floor(left*(.6+.4*prog)),Math.max(1,Math.round(want))); };
  const full0=(T[0].bench||[]).length>=BENCH_CAP;
  const all=LG.wire.map(p=>({p,bids:T.map((t,i)=>({i,b:i===0?(full0?0:Math.min(Math.round(+(LG.bids||{})[keyOf(p)]||0),t.faab)):cpuBid(t,p)})).filter(x=>x.b>0)}));
  all.sort((a,b)=>Math.max(0,...b.bids.map(x=>x.b))-Math.max(0,...a.bids.map(x=>x.b)));
  LG.wireLog=all.map(({p,bids})=>{ const ok=bids.filter(x=>x.b<=T[x.i].faab&&!(x.i!==0&&won.has(x.i))).sort((a,b)=>b.b-a.b||pct(T[a.i].st)-pct(T[b.i].st)||T[a.i].st.pf-T[b.i].st.pf);
    const mine=(bids.find(x=>x.i===0)||{}).b||0, row={p:{n:p.n,r:p.r,pos:p.pos,season:p.season,id:p.id},t:null,bid:0,n:ok.length,mine};
    if(!ok.length) return row; const w=ok[0], t=T[w.i]; t.bench=t.bench||[];
    if(t.bench.length>=BENCH_CAP){ if(w.i===0) return Object.assign(row,{full:1}); t.bench.sort((a,b)=>a.r-b.r); t.bench.shift(); }
    t.faab-=w.b; t.bench.push(p); won.add(w.i);
    if(w.i===0) LG.newIds=[...(LG.newIds||[]),keyOf(p)]; return Object.assign(row,{t:w.i,bid:w.b,second:ok[1]?ok[1].b:0}); });
  LG.wire=[]; LG.bids={}; cpuLineups(); save(); return LG.wireLog.filter(x=>x.mine||x.t===0); }

const blank=()=>({g:0,w:0,l:0,t:0,pf:0,pa:0,py:0,ry:0,ya:0,take:0,give:0,sk:0});

/* everyone plays everyone once (the circle method), home and away alternating */
function roundRobin(ids){ const a=ids.slice(); if(a.length%2) a.push(null); const n=a.length, R=[];
  for(let r=0;r<n-1;r++){ const g=[]; for(let i=0;i<n/2;i++){ const x=a[i], y=a[n-1-i]; if(x!=null&&y!=null) g.push((r+i)%2?{h:x,a:y}:{h:y,a:x}); } R.push(g); a.splice(1,0,a.pop()); }
  return R; }

/* THE SEASON PACK. Every team starts from the same spread: one legend, one gold, one silver and two bronze, dealt to the
   five spots at random. Yours come out of one pack, face down; tap each to turn it over. The defense is spun each week. */
const SPREAD_T=['legend','gold','silver','bronze','bronze'], dealSpread=()=>SPREAD_T.slice().sort(()=>Math.random()-.5);
function seasonPack(tz0){ DR.i=0; DR.got=[]; DR.gen=(DR.gen||0)+1; const gen=DR.gen, tz=tz0||dealSpread(); OSLOTS.forEach((pos,k)=>{ DR.got[k]=four(pos,tz[k])[0]; }); DR.deal=DR.got.slice(0,5); DR.got=[];   /* dealt now, shown as each is turned over */
  screen('draft'); slotsHTML();
  $('#stage').innerHTML=`<span class="q">${typeof PVP_BUILD!=='undefined'&&PVP_BUILD?'Your pack':'Your season pack'}</span><div id="bp" class="t-legend"><div class="rays"></div>${packHTML('legend',true).replace('<span>legend</span>','<span>season</span>')}</div><span class="tag">Tap to open</span>`;
  const pk=$('#bp .pk'), sp=setInterval(()=>PFX.rain(pk,'legend',4),260); DR.rain=sp;
  pk.addEventListener('click',()=>{ if(pk.classList.contains('shake')) return; clearInterval(sp); pk.classList.add('shake');
    setTimeout(()=>{ pk.classList.add('rip'); $('#bp').classList.add('pop','lit'); PFX.burst(pk,'legend',140,{sp:400,up:140,life:1.4});
      setTimeout(()=>{ if(gen===DR.gen) seasonDeal(gen); },800); },520); }); }
function seasonDeal(gen){ const five=DR.deal;
  $('#stage').innerHTML=`<span class="q">Tap each card</span><div class="deal">${five.map((p,k)=>`<div class="fc"><div class="fc-back"><b>GFL</b><span>${OSLOTS[k]}</span></div>${cardHTML(p)}</div>`).join('')}</div><button class="btn w" id="next" style="width:220px;visibility:hidden">${typeof PVP_BUILD!=='undefined'&&PVP_BUILD?'Next: Defense':'Your roster'}</button>`;
  const fcs=[...document.querySelectorAll('#stage .fc')]; let left=fcs.length;
  fcs.forEach((f,i)=>f.addEventListener('click',()=>{ if(f.classList.contains('open')) return; f.classList.add('open'); DR.got[i]=five[i]; slotsHTML(); const c=f.querySelector('.cd'), t=TIER(five[i].r);
    setTimeout(()=>{ if(gen!==DR.gen) return; c.classList.add('in'); PFX.burst(c,t,t==='legend'?110:t==='gold'?70:36,{sp:t==='legend'?320:240,up:110,life:1.2});
      const rt=c.querySelector('.rt'); setTimeout(()=>{ rt.classList.add('flip'); setTimeout(()=>rt.textContent=rt.dataset.r,200); c.querySelectorAll('.at em').forEach(e=>e.textContent=e.dataset.v); c.querySelectorAll('.at b').forEach(b=>b.style.width=((+b.dataset.v-50)/49*100)+'%'); },260);
      if(--left===0){ const n=$('#next'); n.style.visibility='visible'; n.onclick=()=>{ if(typeof PVP_BUILD!=='undefined'&&PVP_BUILD){ DR.i=5; return stageSpin(); } DR.i=SLOTS.length; stageRoster(); }; } },180); })); }
async function newLeague(preset){
  const P=PRESETS.find(p=>p.id===preset)||PRESETS[1], opp=leaguePool().sort(()=>Math.random()-.5).slice(0,P.teams-1);
  const used=new Set((DR.got||[]).slice(0,5).filter(Boolean).map(p=>p.id+'-'+p.season)), teams=[ME,...opp].map((t,i)=>({name:t.name,logo:t.logo||null,teamId:t.teamId,first:t.first,
    roster:i===0?DR.got.slice(0,5).map(slim):(tz=>OSLOTS.map((pos,k)=>pickTier(pos,used,tz[k])))(dealSpread()),dst:i===0?DR.got[5]:pickDST(),col:null,st:blank(),faab:100,bench:['QB','RB','WR','TE'].map(pos=>pickTier(pos,used,'bronze'))}));
  const cols=await Promise.all(teams.map(t=>logoColors(t))); teams.forEach((t,i)=>t.col=cols[i]);
  const order=teams.map((_,i)=>i).sort(()=>Math.random()-.5);
  LG={v:1,preset:P.id,name:P.name,po:P.po,teams,rounds:roundRobin(order).map((g,i)=>({kind:'reg',label:'Week '+(i+1),games:g.map(x=>({...x,s:null}))})),cur:0,dstRound:0,
    ps:[0,1,2,3,4].map(()=>({g:0,att:0,comp:0,py:0,ptd:0,int:0,sk:0,car:0,ry:0,rushtd:0,tgt:0,rec:0,recy:0,rtd:0,fum:0})),dst:[],alive:null,champ:null,phase:'reg',wire:[]};
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
function linesFrom(t,S){ const R=Array.isArray(t)?t:gameLineup(t), L=R.map(()=>({att:0,comp:0,py:0,ptd:0,int:0,sk:0,car:0,ry:0,rushtd:0,tgt:0,rec:0,recy:0,rtd:0,fum:0}));
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
function addLines(ti,L,players){ const t=LG.teams[ti]; LG.pl=LG.pl||{}; (players||t.roster).forEach((p,k)=>{ if(!p||isBackup(p)) return; const key=ti+':'+p.id+'-'+p.season, o=LG.pl[key]||(LG.pl[key]={ti,k,n:p.n,pos:p.pos,id:p.id,season:p.season,r:p.r,g:0});
  o.g++; Object.entries(L[k]).forEach(([f,v])=>{ if(f!=='long'&&f!=='g') o[f]=(o[f]||0)+v; }); }); }
/* a defense's line: what the offense it faced did */
function addD(ti,dst,S){ LG.dl=LG.dl||{}; const o=LG.dl[ti+':'+dst.id]||(LG.dl[ti+':'+dst.id]={ti,n:dst.n,season:dst.season,r:dst.r,g:0,sk:0,int:0,fum:0,pa:0,ya:0});
  o.g++; o.sk+=S.sk||0; o.int+=S.ints||0; o.fum+=S.fum||0; o.pa+=S.pts||0; o.ya+=(S.py||0)+(S.ry||0); }
function record(g,H,A){ const T=LG.teams, add=(t,me,them)=>{ const s=t.st; s.g++; s.pf+=me.pts; s.pa+=them.pts; s.py+=me.py; s.ry+=me.ry; s.ya+=them.py+them.ry; s.give+=me.give; s.take+=them.give; s.sk+=them.sk;
    if(me.pts>them.pts) s.w++; else if(me.pts<them.pts) s.l++; else s.t++; };
  g.s=[H.pts,A.pts]; add(T[g.h],H,A); add(T[g.a],A,H); }
function simGame(g,mustWin){ const T=LG.teams, H=simSide(T[g.h],T[g.a]), A=simSide(T[g.a],T[g.h]);
  if(mustWin&&H.pts===A.pts){ (Math.random()<.5+(offR(T[g.h])-offR(T[g.a]))/60?H:A).pts+=3; g.ot=1; }
  record(g,H,A); const LH=gameLineup(T[g.h]), LA=gameLineup(T[g.a]), lh=linesFrom(LH,H), la=linesFrom(LA,A);
  addLines(g.h,lh,LH); addLines(g.a,la,LA); simWear(T[g.h],lh,LH); simWear(T[g.a],la,LA); addD(g.h,T[g.h].dst,A); addD(g.a,T[g.a].dst,H); }

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
  if(LG.phase==='po'&&LG.alive.length===1){ LG.champ=LG.alive[0]; LG.phase='done'; recordTrophy(); save(); return; }
  if(LG.phase==='po'&&LG.cur===LG.rounds.length-1) playoffRound();
  if(wireOpen()) runWaivers(); LG.cur++; LG.teams.forEach((t,i)=>{ if(i) t.dst=pickDST(); }); recover(); cpuLineups(); newWire(); save(); }
/* ONE RE-SPIN A WEEK, for everyone. Yours you take yourself from the hub; each other team takes its own here: it spins a
   new player at its weakest spot and keeps whichever of the two is better. The moves are listed with the week's results. */
function cpuRespins(){ const used=new Set(LG.teams.flatMap(t=>[...t.roster,...(t.bench||[])].map(p=>p.id+'-'+p.season))); LG.moves=[];
  LG.teams.forEach((t,i)=>{ if(!i) return; let k=0; t.roster.forEach((p,j)=>{ if(p.r<t.roster[k].r) k=j; }); const old=t.roster[k], c=pickPlayer(OSLOTS[k],used);
    if(c&&c.r>old.r){ t.roster[k]=c; LG.moves.push({t:i,pos:OSLOTS[k],out:{n:old.n,r:old.r},in:{n:c.n,r:c.r,season:c.season}}); } }); }
/* ADD A PLAYER, once a week: pick a position, spin a pack for it, and the player you take joins your bench. Your five
   stay as they are until you start him from Your team. */
let RESPIN=null;
function respinPick(){ const me=LG.teams[0];
  $('#scr-hub .hb-body').innerHTML=`<div class="hb-card"><span class="tag">Add a player</span><h3>Which position?</h3><p>Spin a pack for one position and take one of the four. He joins your bench; start him from Your team. One a week.</p>
    <div class="rsp">${['QB','RB','WR','TE'].map(pos=>{ const cur=me.roster.filter(p=>p.pos===pos), top=Math.max(...cur.map(p=>p.r)); return `<button class="t-${TIER(top)}" data-p="${pos}"><span>${pos}</span><b>${cur.map(p=>esc(p.n)).join(', ')}</b><em>${cur.map(p=>p.r).join(' / ')}</em></button>`; }).join('')}</div>
    <button class="btn" id="rsp-x">Not this week</button></div>`;
  document.querySelectorAll('.rsp button').forEach(b=>b.onclick=()=>startRespin(b.dataset.p)); $('#rsp-x').onclick=()=>hub('next'); }
function startRespin(pos){ const i=OSLOTS.indexOf(pos); RESPIN={i,save:DR.got[i]}; DR.i=i; DR.got[i]=null; screen('draft'); stageSpin(); }
function respinDone(none){ const i=RESPIN.i, got=DR.got[i]; DR.got[i]=RESPIN.save; RESPIN=null; DR.i=6;
  if(!none&&got){ const me=LG.teams[0]; (me.bench=me.bench||[]).push(slim(got)); LG.newIds=[got.id+'-'+got.season]; LG.respin=LG.cur; save(); return hub('team'); }
  save(); hub('next'); }
/* let a bench player go, for good */
function releasePlayer(j){ const me=LG.teams[0], p=(me.bench||[])[j]; if(!p) return; if(!confirm('Release '+p.n+'? He goes back into the pool.')) return; me.bench.splice(j,1); save(); hub('team'); }
let LSEL=null;
function pickCard(id){ const me=LG.teams[0], B=me.bench||[], R=me.roster, posOf=x=>x[0]==='s'?R[+x.slice(1)].pos:B[+x.slice(1)].pos;
  const can=sel=>sel?(sel[0]==='s'?B.map((p,j)=>p.pos===posOf(sel)?'b'+j:null):R.map((p,k)=>p.pos===posOf(sel)?'s'+k:null)).filter(Boolean):[];
  if(LSEL&&LSEL!==id&&can(LSEL).includes(id)){ const s=LSEL[0]==='s'?LSEL:id, b=LSEL[0]==='b'?LSEL:id; LSEL=null; return startPlayer(+b.slice(1),+s.slice(1)); }
  LSEL=LSEL===id?null:id; const ok=new Set(can(LSEL));
  document.querySelectorAll('.tcs').forEach(g=>g.classList.toggle('picking',!!LSEL));
  document.querySelectorAll('.tc').forEach(c=>{ const k=c.dataset.pick; c.classList.toggle('sel',!!LSEL&&k===LSEL); c.classList.toggle('can',!!k&&ok.has(k)); }); }
/* start a bench player in a spot: the two swap */
function startPlayer(j,k){ const me=LG.teams[0], B=me.bench||[], p=B[j], out=me.roster[k]; if(!p||!out||p.pos!==out.pos) return;
  me.roster[k]=p; B.splice(j,1,out); DR.got[k]=p; LG.newIds=(LG.newIds||[]).filter(x=>x!==p.id+'-'+p.season); save(); hub('team'); }
/* SUBS MID-GAME */
function subsAvail(){ return typeof LG!=='undefined'&&!!LG&&!QUICK&&MATCH&&MATCH.M&&MATCH.M.lineup&&MATCH.M.lineup.length===5; }
function openSubs(){ if(!subsAvail()) return; const M=MATCH.M, me=LG.teams[0], st=GAME.stamina(), inL=new Set(M.lineup.map(keyOf)), pool=[...me.roster,...(me.bench||[])];
  const bar=v=>`<i><b style="width:${v}%;background:${v>60?'var(--green)':v>30?'var(--yellow)':'var(--red)'}"></b></i>`;
  const rows=M.lineup.map((p,i)=>{ const v=Math.round(st[i]), alt=pool.filter(q=>q.pos===p.pos&&!q.inj&&!inL.has(keyOf(q)));
    return `<div class="sb-r"><div class="sb-on"><span>${OSLOTS[i]}</span><b>${esc(isBackup(p)?p.n:lastN(p.n))} <em>${p.r}</em></b><div class="sb-s">${bar(v)}<em>${v}</em></div></div>
      <div class="sb-alt">${alt.length?alt.map(q=>{ const w=Math.round(q.sta??100); return `<button data-i="${i}" data-k="${keyOf(q)}"><b>${esc(lastN(q.n))} <em>${q.r}</em></b><div class="sb-s">${bar(w)}<em>${w}</em></div></button>`; }).join(''):'<span class="sb-none">No one on the bench here</span>'}</div></div>`; }).join('');
  let el=$('#subs'); if(!el){ el=document.createElement('div'); el.id='subs'; $('#fw').appendChild(el); }
  el.className='subs show'; $('#ctrl').classList.add('lock'); el.innerHTML=`<div class="sb-bx"><div class="sb-h"><b>Substitutions</b><button class="lv" id="sb-x">✕</button></div><div class="sb-list">${rows}</div></div>`;
  $('#sb-x').onclick=()=>{ el.className='subs'; $('#ctrl').classList.remove('lock'); };
  el.querySelectorAll('.sb-alt button').forEach(b=>b.onclick=()=>{ const i=+b.dataset.i, q=pool.find(x=>keyOf(x)===b.dataset.k), out=M.lineup[i]; if(!q) return;
    if(out&&!isBackup(out)) out.sta=Math.round(GAME.stamina()[i]); MATCH.subSlot(i,q); GAME.reset(true); openSubs(); }); }
/* THE WAY OUT, from every pack screen and every game */
function draftWhere(){ if(RESPIN) return 'Add a player'; if(QUICK) return 'Quick game · your team'; if(SETUP) return 'New season · your team'; if(LG) return esc(LG.rounds[LG.cur].label)+' · your defense'; return 'Packs'; }
function leaveDraft(){ DR.gen=(DR.gen||0)+1; clearInterval(DR.rain);
  if(RESPIN){ DR.got[RESPIN.i]=RESPIN.save; RESPIN=null; DR.i=6; return hub('next'); }
  if(QUICK) return quickDone();
  if(SETUP){ SETUP=null; DR.i=0; DR.got=[]; return setupScreen(); }
  if(LG){ DR.i=6; return hub('next'); }
  DR.i=0; DR.got=[]; setupScreen(); }
function leaveGame(){ if(!confirm(QUICK?'Leave this quick game?':'Leave this game? It won\'t count, and you can play it from the hub.')) return;
  SIM.stop(); GAME.show(false); const b=$('#ban'); if(b) b.className='banner';
  if(QUICK) return quickDone(); if(LG) return hub('next'); DR.i=0; DR.got=[]; setupScreen(); }
/* finish the round without you: every game left gets simulated */
function simRound(){ const R=LG.rounds[LG.cur]; R.games.forEach(g=>{ if(!g.s) simGame(g,R.kind==='po'); }); advance(); }

/* YOUR GAME. Kits: the home side in its home look, the visitors in theirs, unless they'd look alike. */
function kickoff(){
  const R=LG.rounds[LG.cur], g=myGame(R), home=g.h===0, them=LG.teams[home?g.a:g.h], me=LG.teams[0];
  me.dst=DR.got[5]; const [hk,ak]=dressFor(home?me.col:them.col,home?them.col:me.col); setKits(home?hk:ak,home?ak:hk);
  CPU=them; screen('game'); MATCH.start({team:them,dst:them.dst,off:offR(them),home,label:R.label,mustWin:R.kind==='po',lineup:gameLineup(me),time:sceneFor(R,g).time,snow:sceneFor(R,g).snow,rain:sceneFor(R,g).rain,event:R.kind==='po'?{label:R.label==='The final'?'CHAMPIONSHIP':R.label.toUpperCase(),big:R.label==='The final'}:null}); }
/* the final whistle: your line goes in the book, then the rest of the round */
function seasonFinal(M){ const R=LG.rounds[LG.cur], g=myGame(R); if(!g||g.s) return; const home=g.h===0, st=M.st, fum=M.ps.reduce((s,p)=>s+p.fum,0);
  const mine={pts:M.score[0],py:st.py,ry:st.ry,give:st.int+fum,sk:st.sk}, theirs={pts:M.score[1],py:M.opp.py||0,ry:M.opp.ry||0,give:M.dst.int+M.dst.fum,sk:M.dst.sk};
  if(R.kind==='po'&&mine.pts===theirs.pts){ (Math.random()<.5?mine:theirs).pts+=3; M.ot=true; }
  if(M.ot) g.ot=1; record(g,home?mine:theirs,home?theirs:mine);
  M.ps.forEach((p,i)=>{ const L=LG.ps[i]; L.g++; Object.keys(p).forEach(k=>{ if(k!=='long') L[k]=(L[k]||0)+p[k]; }); });
  const oi=home?g.a:g.h, them=LG.teams[oi], O=M.opp, LU=M.lineup||LG.teams[0].roster, STn=GAME.stamina();
  LU.forEach((p,i)=>{ if(p&&!isBackup(p)) p.sta=Math.round(STn[i]); });
  const LT=gameLineup(them), lt=linesFrom(LT,{py:O.py||0,ry:O.ry||0,tdP:O.tdP||0,tdR:O.tdR||0,ints:M.dst.int,fum:M.dst.fum,sk:M.dst.sk});
  addLines(0,M.ps,LU); (M.subLog||[]).forEach(x=>{ if(!isBackup(x.p)) addLines(0,[x.s],[x.p]); }); addLines(oi,lt,LT); simWear(them,lt,LT);
  addD(0,DR.got[5],{sk:M.dst.sk,ints:M.dst.int,fum:M.dst.fum,pts:M.score[1],py:O.py||0,ry:O.ry||0}); addD(oi,them.dst,{sk:st.sk,ints:st.int,fum,pts:M.score[0],py:st.py,ry:st.ry});
  LG.dst.push({round:R.label,n:DR.got[5].n,season:DR.got[5].season,r:DR.got[5].r,sk:M.dst.sk,take:M.dst.int+M.dst.fum,pa:M.score[1],ya:M.opp.yds});
  save(); }
function seasonContinue(){ simRound(); hub('next'); }

/* ═══ THE HUB ═══ */
const recTxt=s=>s.w+'–'+s.l+(s.t?'–'+s.t:'');
const tm=(i,cls)=>{ const t=LG.teams[i]; return `<span class="tmn ${cls||''}"><i style="--p:${t.col?t.col[0]:'#555'};--q:${t.col?t.col[1]:'#999'}"></i>${crest(t)}<b>${esc(t.name)}</b></span>`; };
let HUBTAB='next', LGTAB='table';
function hub(tab){ const same=!tab||tab===HUBTAB, B0=$('#scr-hub .hb-body'), y0=same&&B0?B0.scrollTop:0, C0=$('#scr-hub .lgc'), x0=C0?C0.scrollLeft:0;
  if(tab) HUBTAB=tab; screen('hub'); const R=LG.rounds[LG.cur], me=LG.teams[0], tabs=[['next',LG.phase==='done'?'Final':'Next'],['sched','Schedule'],['team','Your team'],['league','League']];
  $('#scr-hub').innerHTML=`<div class="hb-top g" style="--tcol:${teamCol(me)}"><div class="fade"><div class="dots"></div></div>
      <div class="hb-me"><div class="hv-c">${crest(me)}</div><div><span class="tag">${esc(LG.name)} season · ${LG.phase==='done'?'Over':esc(R.label)}</span><b>${esc(me.name)}</b>
        <div class="hb-chips"><span class="c-rec">${recTxt(me.st)}</span><span>${ordinal(standings().findIndex(x=>x.i===0)+1)} of ${LG.teams.length}</span><span class="c-faab">$${me.faab??100}</span></div></div>
        ${trophies().length?`<button class="hb-tro" id="hb-tro"><canvas class="trophy"></canvas><b>${trophies().length}</b></button>`:''}</div></div>
    <div class="hb-body">${({next:hubNext,sched:hubSched,team:hubTeam,league:hubLeague})[HUBTAB]()}</div>
    <div class="hb-tabs gnav">${tabs.map(([k,l])=>`<button data-k="${k}" class="${k===HUBTAB?'on':''}">${pxIcon(k)}<span>${l}</span></button>`).join('')}</div>`;
  document.querySelectorAll('.hb-tabs button').forEach(b=>b.onclick=()=>hub(b.dataset.k));
  const act=$('#hb-go'); if(act) act.onclick=()=>{ const g=myGame();
    if(LG.phase==='done') return newSeason();
    if(g&&!(LG.dstRound===LG.cur&&DR.got[5])){ DR.i=5; DR.got[5]=null; screen('draft'); return stageSpin(); }
    if(wireOpen()){ const mine=runWaivers(); if(mine.length){ HUBTAB='next'; hub('next'); const w=$('#wv-sec'); if(w) w.scrollIntoView({block:'start'}); return; } }
    if(!g) return (simRound(),hub('next'));
    if(LG.dstRound===LG.cur&&DR.got[5]) return kickoff();
    DR.i=5; DR.got[5]=null; screen('draft'); stageSpin(); };
  const qb=$('#hb-quick'); if(qb) qb.onclick=()=>quickGame(false); const qm=$('#hb-quickmix'); if(qm) qm.onclick=()=>quickGame(true); const hp=$('#hb-pvp'); if(hp){ hp.onclick=()=>pvpHub(); pvpBadge(); }
  const rs=$('#hb-respin'); if(rs) rs.onclick=respinPick;
  const ns=$('#hb-new'); if(ns) ns.onclick=()=>{ if(confirm('Start a new season? This one will be gone.')) newSeason(); };
  document.querySelectorAll('.lgc button').forEach(b=>b.onclick=()=>{ LGTAB=b.dataset.k; hub('league'); });
  const tb=$('#hb-team'); if(tb) tb.onclick=()=>hub('team');
  paintScenes(); paintArt(); paintTrophies(); [$('#hb-tro'),$('#hb-tro2')].forEach(b=>{ if(b) b.onclick=()=>openTrophies('hub'); });
  const wr=$('#wv-run'); if(wr) wr.onclick=()=>{ runWaivers(); hub('next'); const w=$('#wv-sec'); if(w) w.scrollIntoView({block:'start'}); };
  if(HUBTAB==='team') shareWarm('team','t'+LG.cur+JSON.stringify(LG.teams[0].roster.map(p=>p.id+p.r))+recTxt(LG.teams[0].st)+(DR.got[5]?DR.got[5].id:''),()=>cardTeam(teamShareData()));
  if(HUBTAB==='sched'||(HUBTAB==='next'&&LG.phase==='done')) shareWarm('season','s'+LG.cur+LG.phase+recTxt(LG.teams[0].st),()=>cardSeason(seasonShareData()));
  const wb=$('#hb-wv'); if(wb) wb.onclick=()=>{ const w=$('#wv-sec'); if(w) w.scrollIntoView({block:'start',behavior:'smooth'}); };
  document.querySelectorAll('.tbl .th button').forEach(b=>b.onclick=()=>{ LGSORT={tab:LGTAB,k:+b.dataset.s}; hub('league'); });
  /* a bid: the buttons step it, the box takes a number; never more than you have */
  const setBid=(k,v)=>{ const f=LG.teams[0].faab??100; v=Math.max(0,Math.min(f,Math.round(v)||0)); LG.bids=LG.bids||{}; if(v) LG.bids[k]=v; else delete LG.bids[k]; save();
    const inp=document.querySelector('.wv-bid input[data-k="'+k+'"]'); if(inp) inp.value=v?'$'+v:''; const tot=myBids().reduce((a,b)=>a+b,0), bt=$('#bidtot'); if(bt) bt.textContent='$'+tot; const go=$('#hb-go'); if(go&&go.dataset.base) go.textContent=myBids().length?'Run waivers':go.dataset.base; };
  document.querySelectorAll('.wv-bid button').forEach(b=>b.onclick=()=>{ const k=b.dataset.k; setBid(k,((LG.bids||{})[k]||0)+(+b.dataset.d)); });
  document.querySelectorAll('.wv-bid input').forEach(i=>i.onchange=()=>setBid(i.dataset.k,+String(i.value).replace(/[^0-9]/g,'')));
  const B1=$('#scr-hub .hb-body'); if(B1&&y0) B1.scrollTop=y0; const C1=$('#scr-hub .lgc'); if(C1){ C1.scrollLeft=x0; const on=C1.querySelector('.on'); if(on){ const a=on.offsetLeft, w=on.offsetWidth; if(a<C1.scrollLeft||a+w>C1.scrollLeft+C1.clientWidth) C1.scrollLeft=a-14; } } }
const ordinal=n=>n+(['th','st','nd','rd'][(n%100-20)%10]||['th','st','nd','rd'][n%100]||'th');
function hubNext(){
  if(LG.phase==='done') return titleHTML();
  const R=LG.rounds[LG.cur], g=myGame(R), me=LG.teams[0], wo=wireOpen(), nb=myBids().length;
  const goLabel=lab=>wo&&nb?'Run waivers':lab;
  let top;
  if(g){ const home=g.h===0, o=home?g.a:g.h, t=LG.teams[o], needD=!(LG.dstRound===LG.cur&&DR.got[5]), myD=needD?null:DR.got[5], LM=gameLineup(me), LT=gameLineup(t);
    const rt2=(r,o,d)=>`<b class="rtg t-${TIER(r,d)}${o!=null&&r<o?' lo':''}">${r}</b>`;
    const row=(lab,a,b,cls)=>`<div class="${cls||''}"><div class="me${a?'':' q'}${a&&a.sub?' sub':''}">${a?`<b>${esc(a.s||lastN(a.n))}</b>${rt2(a.r,b&&b.r,a.d)}`:'<b>Spin to see</b>'}</div><span>${lab}</span><div class="th${b&&b.sub?' sub':''}">${b?`${rt2(b.r,a&&a.r,b.d)}<b>${esc(b.s||lastN(b.n))}</b>`:''}</div></div>`;
    const mark=(L,T)=>L.map((p,k)=>p===T.roster[k]?p:Object.assign({},p,{sub:1,s:isBackup(p)?'Backup':lastN(p.n)}));
    const dn=d=>d&&{n:d.n,s:d.n,r:d.r,d:1};
    const outs=me.roster.filter(p=>p.inj).map(p=>`<span><b>Out</b> ${esc(lastN(p.n))} · ${esc(p.inj.n)} · ${injShort(p.inj)}</span>`);
    const sc=sceneFor(R,g), [hl,deck]=headlineFor(R,g), side=(T,lab,i)=>`<div class="hv-t"><div class="hv-c">${crest(T)}</div><b>${lab}</b><span>${recTxt(T.st)} · ${ordinal(standings().findIndex(x=>x.i===i)+1)}</span><em class="t-${TIER(offR(T))}">OFF ${offR(T)}</em></div>`;
    top=`<div class="hero">${sceneImg(sc.art,sc.home,sc.rain,sc.snow&&sc.art!=='snow')}<div class="hero-in">
        <div class="hv-tags"><span>${esc(R.label)}</span><span>${home?'Home':'Away'}</span><span>${esc(sc.label)}</span></div>
        <div class="hv">${side(me,'You',0)}<i>${home?'VS':'AT'}</i>${side(t,esc(t.name),o)}</div></div></div>
      <div class="hb-acts hero-acts"><button class="btn w" id="hb-go" data-base="${needD?'Spin your defense':'Kick off'}">${goLabel(needD?'Spin your defense':'Kick off')}</button>
        <button class="btn" id="hb-team">Set lineup</button><button class="btn" id="hb-wv">Waivers${wo?' · open':''}</button></div>
      <div class="hl news"><span class="tag">B&amp;C News</span><b>${esc(hl)}</b><p>${esc(deck)}</p></div>
      <div class="hb-card hb-mu">
      <div class="h2h">${row('OFF',{s:'Offense',r:offR(me)},{s:'Offense',r:offR(t)},'ovr')}${mark(LM,me).map((p,k)=>row(OSLOTS[k],p,mark(LT,t)[k])).join('')}${row('D/ST',dn(myD),dn(t.dst))}</div>
      ${outs.length?`<div class="hb-inj">${outs.join('')}</div>`:''}</div>`; }
  else top=`<div class="hb-card"><span class="tag">${esc(R.label)}</span><h3>${LG.phase==='po'?(R.bye&&R.bye.includes(0)?'You have a bye':'You\'re out'):'No game this week'}</h3>
      <button class="btn w" id="hb-go">${goLabel('Sim '+esc(R.label.toLowerCase()))}</button></div>`;
  const last=LG.cur>0?LG.rounds[LG.cur-1]:null;
  return top+bracketHTML()+wireHTML()+injuryHTML()+(last?`<div class="sh">${esc(last.label)} <b>results</b></div>${gamesHTML(last,true)}`:'')+`<div class="hb-row"><button class="btn" id="hb-quick">Quick game</button><button class="btn" id="hb-quickmix">Quick game · test team</button><button class="btn" id="hb-pvp" data-pvp>Head to head</button><button class="btn" id="hb-new">New season</button></div>`; }
/* THE END OF A SEASON. Win it, and it's a title: the stadium lit up with fireworks and confetti, the trophy, CHAMPIONS,
   the MVP, the five who won it, and the numbers. Don't, and it's the final table and who won. */
function titleHTML(){ const me=LG.teams[0], won=LG.champ===0, c=LG.teams[LG.champ], place=standings().findIndex(x=>x.i===0)+1;
  const fin=LG.rounds[LG.rounds.length-1], fg=fin&&fin.games[0], P=Object.values(LG.pl||{}).filter(p=>p.ti===0&&!isBackup(p)&&p.id).sort((a,b)=>shScore(b)-shScore(a)), m=P[0];
  const sc={seed:LG.name+'title',home:teamCol(won?me:c),away:teamCol(won?me:c),time:'night',fireworks:won,confetti:won,champ:won};
  const lines=m?shLines(m,m):null, lead=[['py','Pass yds'],['ry','Rush yds'],['recy','Rec yds']].map(([k,l])=>{ const b=P.slice().sort((x,y)=>(y[k]||0)-(x[k]||0))[0]; return b&&b[k]?[b[k],l+' · '+lastN(b.n)]:null; }).filter(Boolean);
  const finTxt=fg&&fg.s?`${LG.teams[fg.h].name} ${fg.s[0]}, ${LG.teams[fg.a].name} ${fg.s[1]}${fg.ot?' (OT)':''}`:'';
  return `<div class="hero title${won?' won':''}">${sceneImg(won?'champ':'night',teamCol(won?me:c))}${won?confettiHTML():''}<div class="hero-in">
      <div class="hv-tags"><span>${esc(LG.name)} season</span><span>Final</span></div>
      ${won?'<canvas class="trophy big"></canvas>':''}<h2 class="ttl">${won?'Champions':'Season over'}</h2>
      <div class="ttl-team"><div class="hv-c">${crest(won?me:c)}</div><div><b>${esc(won?me.name:c.name)}</b><span>${won?recTxt(me.st)+' · '+LG.teams.length+'-team league':'Your season: '+recTxt(me.st)+' · '+ordinal(place)}</span></div></div></div></div>
    ${finTxt?`<div class="hl news"><span class="tag">The final</span><b>${esc(finTxt)}</b></div>`:''}
    <div class="tiles ttl-tiles"><div><b>${recTxt(me.st)}</b><span>Record</span></div><div><b>${me.st.pf}</b><span>Points for</span></div><div><b>${me.st.pa}</b><span>Against</span></div><div><b>${ordinal(place)}</b><span>Seed</span></div></div>
    ${m?`<div class="lead${won?' gold':''}" style="--p:${won?'#F0CE26':teamCol(me)}"><img class="ph" src="${SHOT(m.id)}" alt=""><div class="tx"><span class="tag">Season MVP</span><b>${esc(m.n)}</b><small>${m.pos} · ${m.season} · ${m.g} games</small><span class="big2">${esc(lines[0])}</span></div></div>`:''}
    ${lead.length?`<div class="tiles">${lead.map(([v,l])=>`<div><b>${v}</b><span>${esc(l)}</span></div>`).join('')}</div>`:''}
    <div class="sh">${won?'The <b>champions</b>':'Your <b>five</b>'}</div><div class="tcs">${me.roster.map((p,k)=>tcHTML(p,{pos:OSLOTS[k]})).join('')}</div>
    ${bracketHTML()}
    <div class="hb-acts ttl-acts">${shareButton('season',won?'Share the title':'Share your season')}<button class="btn" id="hb-tro2">Trophy case</button><button class="btn w" id="hb-go">New season</button><button class="btn" id="hb-quick">Quick game</button><button class="btn" id="hb-quickmix">Quick game · test team</button></div>`; }
/* WAIVERS on the Next tab: open, the pool with your bids; run, who got whom and for how much */
function wireHTML(){ const me=LG.teams[0], f=me.faab??100;
  if(wireOpen()){ const tot=myBids().reduce((a,b)=>a+b,0);
    const full=(me.bench||[]).length>=BENCH_CAP;
    return `<div class="sh" id="wv-sec">Waivers</div><div class="faab"><div><b>$${f}</b><span>FAAB left</span></div><div><b id="bidtot">$${tot}</b><span>Your bids</span></div><div><b>${(me.bench||[]).length}/${BENCH_CAP}</b><span>Bench</span></div></div>${full?`<div class="hb-inj"><span>Bench full · release a player to bid</span></div>`:''}
      <div class="tcs">${LG.wire.map(p=>{ const k=keyOf(p), u=upOver(me,p), b=(LG.bids||{})[k]||0;
        const up=u.who?(u.d>0?'+'+u.d+' over '+lastN(u.who.n):'Depth behind '+lastN(u.who.n)):'';
        return tcHTML(p,{stat:p.season+(up?' · '+up:''),cls:u.d>0?'up':'',extra:`<div class="wv-bid bidc"><input data-k="${k}" inputmode="numeric" value="${b?'$'+b:''}" placeholder="Bid $0" ${(me.bench||[]).length>=BENCH_CAP?'disabled':''}><div><button data-k="${k}" data-d="-5">−5</button><button data-k="${k}" data-d="-1">−1</button><button data-k="${k}" data-d="1">+1</button><button data-k="${k}" data-d="5">+5</button></div></div>`}); }).join('')}</div>
      <button class="btn w" id="wv-run">Run waivers now</button>`; }
  if(LG.wireDone===LG.cur&&LG.wireLog&&LG.wireLog.length){ const T=LG.teams;
    return `<div class="sh" id="wv-sec">Waivers <b>· results</b></div><div class="lds">${LG.wireLog.map(x=>{ const t=x.t!=null?T[x.t]:null;
      return `<div class="ld wr${x.t===0?' me':''}" style="--p:${t?tcol(t):'#333'}"><span class="rk">${x.p.pos}</span><i></i>${t?crest(t):'<span class="ini">–</span>'}<span class="nm"><b>${esc(x.p.n)} <small class="r">${x.p.r}</small></b><small>${t?(x.t===0?'You':esc(t.name))+(x.n>1?' · '+x.n+' bids, next $'+x.second:''):'No claims'}${x.mine&&x.t!==0?' · you bid $'+x.mine:''}</small></span><span class="v">${t?'$'+x.bid:''}</span></div>`; }).join('')}</div>`; }
  return ''; }
/* THE INJURY REPORT: everyone out, yours first */
function injuryHTML(){ const L=LG.teams.flatMap((t,i)=>[...t.roster,...(t.bench||[])].filter(p=>p.inj).map(p=>({i,p,start:t.roster.includes(p)}))).sort((a,b)=>(a.i?1:0)-(b.i?1:0)||b.p.inj.g-a.p.inj.g);
  if(!L.length) return ''; return `<div class="sh">Injury <b>report</b></div><div class="lds">${L.slice(0,12).map(({i,p,start})=>`<div class="ld inj${i===0?' me':''}" style="--p:${tcol(LG.teams[i])}"><span class="rk">${p.pos}</span><i></i>${crest(LG.teams[i])}<span class="nm"><b>${esc(p.n)}</b><small>${esc(p.inj.n)} · ${i===0?'You':esc(LG.teams[i].name)}${start?'':' · bench'}</small></span><span class="v">${injShort(p.inj)}</span></div>`).join('')}</div>`; }
/* ═══ THE HUB, GAME-STYLE ═══ every piece reads like the field's own: scorebugs for games, rating tiles in the tier's
   colour, stat tiles in pixel numbers, win and loss chips, and one row shape for every list. */
const tcol=t=>(t&&t.col)?t.col[0]:'#555';
const rtg=r=>`<b class="rtg t-${TIER(r)}">${r}</b>`;
const wkShort=R=>R.kind==='po'?({'Wild card':'WC','Semifinals':'SF','The final':'F'}[R.label]||'PO'):'W'+String(R.label).replace(/\D+/g,'');
const myRes=g=>{ if(!g||!g.s) return null; const home=g.h===0, m=home?g.s[0]:g.s[1], t=home?g.s[1]:g.s[0]; return {k:m>t?'W':m<t?'L':'T',m,t}; };
/* a game as a scorebug: the visitors over the home side, the winner bright, the loser dimmed */
function gameCard(g){ const T=LG.teams, mine=g.h===0||g.a===0, w=g.s?(g.s[0]>g.s[1]?'h':g.s[1]>g.s[0]?'a':'t'):'', res=mine?myRes(g):null;
  const side=(i,sc,k)=>`<div class="gc-t ${w&&w!=='t'?(w===k?'w':'l'):''}" style="--p:${tcol(T[i])}"><i></i>${crest(T[i])}<b>${i===0?'You':esc(T[i].name)}<small>${recTxt(T[i].st)}</small></b><em>${g.s?sc:''}</em></div>`;
  return `<div class="gc${mine?' me':''}">${g.s||mine?`<div class="gc-h"><span>${g.s?'Final'+(g.ot?' · OT':''):'Your game'}</span>${res?`<span class="wl ${res.k}">${res.k}</span>`:''}</div>`:''}
    ${side(g.a,g.s&&g.s[1],'a')}${side(g.h,g.s&&g.s[0],'h')}</div>`; }
function gamesHTML(R,mineFirst){ const G=R.games.slice(); if(mineFirst) G.sort((x,y)=>((y.h===0||y.a===0)-(x.h===0||x.a===0)));
  return `<div class="gcs">${G.map(gameCard).join('')}</div>`; }
/* roster moves: who came in, who went out, by how much */
function movesHTML(){ const M=LG.moves||[]; if(!M.length) return '';
  return `<div class="sh">Roster <b>moves</b></div><div class="mvs">${M.map(m=>{ const t=LG.teams[m.t];
    return `<div class="mv"><div class="mv-t" style="--p:${tcol(t)}"><i></i>${crest(t)}<b>${esc(t.name)}</b><span class="pos">${m.pos}</span><span class="dl">+${m.in.r-m.out.r}</span></div>
      <div class="mv-p in"><span>In</span><b>${esc(m.in.n)}<small>${m.in.season||''}</small></b>${rtg(m.in.r)}</div>
      <div class="mv-p out"><span>Out</span><b>${esc(m.out.n)}</b>${rtg(m.out.r)}</div></div>`; }).join('')}</div>`; }
/* THE SCHEDULE: the season as a strip of squares, then a row a week; open one for the whole week's scores */
function hubSched(){ const R=LG.rounds, strip=R.map((x,k)=>{ const r=myRes(myGame(x)); return `<i class="${r?r.k:k===LG.cur&&LG.phase!=='done'?'now':''}"></i>`; }).join('');
  return `<div class="shr-row">${shareButton('season',LG.phase==='done'?'Share your season':'Share your season so far')}</div>${bracketHTML()}<div class="sh">Your <b>season</b></div><div><div class="ss" style="--n:${R.length}">${strip}</div><div class="ssl"><span>${wkShort(R[0])}</span><span>${recTxt(LG.teams[0].st)}</span><span>${wkShort(R[R.length-1])}</span></div></div>
    <div class="wks">${R.map((x,k)=>{ const g=myGame(x), r=myRes(g), now=k===LG.cur&&LG.phase!=='done', open=now||(LG.phase==='done'&&k===R.length-1);
      let mid, end='<i></i>';
      if(!g) mid=`<span class="ha"></span><span></span><b class="dim">${x.bye&&x.bye.includes(0)?'Bye':'No game'}</b>`;
      else { const home=g.h===0, o=LG.teams[home?g.a:g.h]; mid=`<span class="ha">${home?'vs':'at'}</span>${crest(o)}<b>${esc(o.name)}</b>`;
        end=r?`<span class="res"><span class="wl ${r.k}">${r.k}</span>${r.m}–${r.t}${g.ot?' <small>OT</small>':''}</span>`:now?'<span class="nx">Next</span>':'<i></i>'; }
      return `<details class="wk${now?' now':''}" ${open?'open':''}><summary><span class="wn">${wkShort(x)}</span>${mid}${end}</summary>${gamesHTML(x,true)}</details>`; }).join('')}</div>
`; }
/* YOUR TEAM: each player a card with his four ratings. Your lineup on top, then the bench: every player you've added,
   each with a button to start him in place of a starter at his position. Then your defense. */
const ABR={'Arm':'Arm','Accuracy':'Acc','Legs':'Leg','Escape':'Esc','Speed':'Spd','Elusiveness':'Elu','Power':'Pow','Hands':'Hnd','Route running':'Rte','Contested':'Con','Blocking':'Blk','Pass rush':'Rush','Coverage':'Cov','Run stop':'Stop','Ball hawk':'Hawk'};
const lastN=n=>{ const w=String(n).split(' ').filter(x=>!/^(jr\.?|sr\.?|ii|iii|iv)$/i.test(x)); return w[w.length-1]||n; };
function tcHTML(p,o){ const d=p.pos==='D/ST', a=p.a||[70,70,70,70];
  return `<div class="tc t-${TIER(p)}${o.isNew?' new':''}${p.inj?' hurt':''}${o.side?' tc-wide':''}"${o.pick?` data-pick="${o.pick}" onclick="pickCard('${o.pick}')"`:''}>${o.side?'<div class="tc-l">':''}<div class="tc-top">${d?nflImg(p.n,'lgo'):`<img src="${SHOT(p.id)}" alt="">`}<span class="pos">${o.pos||p.pos}</span><span class="ovr">${p.r}</span></div>
    <div class="tc-b"><b>${esc(d?p.season+' '+p.n:p.n)}</b><small${o.cls?' class="'+o.cls+'"':''}>${esc(o.stat||p.season)}</small>
    <div class="tc-a">${ATTR[p.pos].map((l,k)=>`<div><span>${ABR[l]||l}</span><i><b style="width:${Math.max(4,(a[k]-50)/49*100)}%"></b></i><em>${a[k]}</em></div>`).join('')}</div>
    ${p.pos!=='D/ST'?(()=>{ const v=Math.round(p.sta??100); return `<div class="tc-s"><span>Stamina</span><i><b style="width:${v}%;background:${v>60?'var(--green)':v>30?'var(--yellow)':'var(--red)'}"></b></i><em>${v}</em></div>`; })():''}
    ${p.inj?`<div class="tc-inj"><b>Out · ${injShort(p.inj)}</b><span>${esc(p.inj.n)}</span></div>`:''}
    ${o.extra||''}
    ${o.go&&o.go.length?`<div class="tc-go">${o.go.join('')}</div>`:''}</div>${o.side?'</div>'+o.side:''}</div>`; }
const menHTML=d=>{ if(typeof GAME==='undefined'||!GAME.men||!d) return ''; const U=GAME.men(d);
  return `<div class="tc-men">${['DL','LB','CB','S'].flatMap(k=>U[k]).map(m=>`<div><span>${m.lab||m.pos}</span><b style="color:${TCOL[TIER(m.r)]}">${m.r}</b></div>`).join('')}</div>`; };
const menList=d=>{ if(typeof GAME==='undefined'||!GAME.men||!d) return ''; const U=GAME.men(d), L=GAME.dlab;
  return `<div class="dmen">${['DL','LB','CB','S'].flatMap(k=>U[k]).map(m=>`<div class="dm"><span class="p">${m.lab||m.pos}</span><b style="color:${TCOL[TIER(m.r)]}">${m.r}</b>${m.k.map(k=>`<i><small>${L[k]}</small><em>${m.s[k]}</em></i>`).join('')}</div>`).join('')}</div>`; };
function hubTeam(){ LSEL=null; const me=LG.teams[0], B=me.bench||[], nw=new Set(LG.newIds||[]), P=LG.pl||{};
  const line=(p,k)=>{ const s=P['0:'+p.id+'-'+p.season]||(k!=null&&P['0:'+k]&&P['0:'+k].id===p.id?P['0:'+k]:null);
    if(!s||!s.g) return p.season+' · no games yet';
    if(p.pos==='QB') return `${s.py} yds · ${s.ptd} TD · ${s.int} INT`; if(p.pos==='RB') return `${s.ry} yds · ${s.rushtd} TD`; return `${s.rec} rec · ${s.recy} yds · ${s.rtd} TD`; };
  const dNow=DR.got[5]&&LG.dstRound===LG.cur?DR.got[5]:null;
  const starters=me.roster.map((p,k)=>tcHTML(p,{pos:OSLOTS[k],stat:line(p,k),pick:'s'+k})).join('')+(dNow?tcHTML(dNow,{pos:'D/ST',stat:'This week',extra:menHTML(dNow)}):'');
  const bench=B.map((p,j)=>tcHTML(p,{stat:line(p),isNew:nw.has(p.id+'-'+p.season),pick:'b'+j,go:[`<button class="rel" onclick="event.stopPropagation();releasePlayer(${j})">Release</button>`]})).join('');
  const D=LG.dst, tot=D.reduce((a,d)=>({sk:a.sk+d.sk,take:a.take+d.take,pa:a.pa+d.pa}),{sk:0,take:0,pa:0}), cur=DR.got[5];
  const tl=T=>`<div class="tiles">${T.map(([v,l])=>`<div><b>${v}</b><span>${l}</span></div>`).join('')}</div>`;
  return `<div class="shr-row">${shareButton('team','Share your team')}</div><div class="sh">Your <b>lineup</b></div><div class="tcs">${starters}</div>
    <div class="sh">Your <b>bench · ${B.length} of ${BENCH_CAP}</b></div>${B.length?`<div class="tcs">${bench}</div>`:'<div class="lg-empty">Empty</div>'}
    <div class="sh">Your <b>defense</b></div>${dNow?menList(dNow):''}
    <div class="pcs"><div class="pc t-silver"><div class="pc-top"><span class="ini">D</span><div><b>Season</b><span>All defenses</span></div></div>
      ${tl([[D.length,'Games'],[tot.sk,'Sacks'],[tot.take,'Takeaways'],[D.length?(tot.pa/D.length).toFixed(1):'0','Pts allowed/g']])}</div></div>
    ${D.length?`<div class="sh">Week <b>by week</b></div><div class="lds">${D.slice().reverse().map(d=>`<div class="ld dlog"><span class="rk">${esc(String(d.round).replace(/^Week /,'W'))}</span>${nflImg(d.n,'lgo')||'<span class="ini">D</span>'}<span class="nm"><b>${d.season} ${esc(d.n)}</b><small>${d.sk} sack${d.sk===1?'':'s'} · ${d.take} takeaway${d.take===1?'':'s'} · ${d.ya} yds</small></span><span class="v">${d.pa}</span><span class="v2">pts</span></div>`).join('')}</div>`:''}`; }
/* THE LEAGUE: one strip of chips; then a table. Every column sorts: tap its heading. The player views put the leader
   in that column up top. */
let LGSORT={tab:'',k:0};
function hubLeague(){ const S=standings(), po=LG.phase==='reg'?LG.po:0, per=(v,g)=>g?v/g:0, f1=v=>v.toFixed(1), sgn=d=>d>0?'+'+d:d<0?'–'+Math.abs(d):'0';
  if(LGTAB==='dst') LGTAB='def';
  const TT=[['table','Standings'],['off','Offense'],['def','Defense']], PT=[['pass','Passing'],['rush','Rushing'],['recv','Receiving']];
  const chips=`<div class="lgc">${TT.map(([k,l])=>`<button data-k="${k}" class="${k===LGTAB?'on':''}">${l}</button>`).join('')}<span class="gap"></span>${PT.map(([k,l])=>`<button data-k="${k}" class="${k===LGTAB?'on':''}">${l}</button>`).join('')}</div>`;
  const P=Object.values(LG.pl||{}).filter(p=>!isBackup(p)), team=x=>({ti:x.i,name:x.t.name,sub:'',s:x.s});
  /* [heading, value to sort by (higher first), what to show] */
  const V={
    table:{rows:S.map(team),cols:[['W–L',x=>pct(x.s)*1e4+(x.s.pf-x.s.pa),x=>recTxt(x.s)],['PF',x=>x.s.pf],['PA',x=>-x.s.pa,x=>x.s.pa],['+/–',x=>x.s.pf-x.s.pa,x=>sgn(x.s.pf-x.s.pa)],['FAAB',x=>LG.teams[x.ti].faab??100,x=>'$'+(LG.teams[x.ti].faab??100)]],note:po?`The top ${po} make the playoffs. FAAB: waiver money left.`:'Final regular-season standings.'},
    off:{rows:S.map(team),cols:[['Pts/g',x=>per(x.s.pf,x.s.g),x=>f1(per(x.s.pf,x.s.g))],['Pass/g',x=>per(x.s.py,x.s.g),x=>Math.round(per(x.s.py,x.s.g))],['Rush/g',x=>per(x.s.ry,x.s.g),x=>Math.round(per(x.s.ry,x.s.g))],['Yds/g',x=>per(x.s.py+x.s.ry,x.s.g),x=>Math.round(per(x.s.py+x.s.ry,x.s.g))],['TO',x=>-x.s.give,x=>x.s.give]],note:'Per game. TO: turnovers.'},
    def:{rows:S.map(team),cols:[['PA/g',x=>-per(x.s.pa,x.s.g),x=>f1(per(x.s.pa,x.s.g))],['Yds/g',x=>-per(x.s.ya,x.s.g),x=>Math.round(per(x.s.ya,x.s.g))],['Sacks',x=>x.s.sk],['Take',x=>x.s.take]],note:'Every defense the team has had this season, added up. Per game allowed. Take: takeaways.'},
    pass:{rows:P.filter(p=>p.att>0),cols:[['Yds',p=>p.py],['Cmp%',p=>p.comp/p.att,p=>Math.round(p.comp/p.att*100)],['TD',p=>p.ptd],['Int',p=>-p.int,p=>p.int],['Y/A',p=>p.py/p.att,p=>f1(p.py/p.att)]],note:'Every quarterback.'},
    rush:{rows:P.filter(p=>p.car>0),cols:[['Yds',p=>p.ry],['Car',p=>p.car],['Avg',p=>p.ry/p.car,p=>f1(p.ry/p.car)],['TD',p=>p.rushtd],['Fum',p=>-(p.fum||0),p=>p.fum||0]],note:'Backs and quarterbacks.'},
    recv:{rows:P.filter(p=>p.rec>0),cols:[['Yds',p=>p.recy],['Rec',p=>p.rec],['Tgt',p=>p.tgt],['Avg',p=>p.recy/p.rec,p=>f1(p.recy/p.rec)],['TD',p=>p.rtd]],note:'Receivers, tight ends and backs.'}}[LGTAB];
  const k=LGSORT.tab===LGTAB?LGSORT.k:-1, by=k<0?(LGTAB==='table'?null:0):k, cols=V.cols;
  const rows=V.rows.slice(); if(by!=null) rows.sort((a,b)=>cols[by][1](b)-cols[by][1](a));
  const isP=PT.some(t=>t[0]===LGTAB), nm=r=>isP?(String(r.n).split(' ').length>1?String(r.n)[0]+'. '+lastN(r.n):r.n):r.name, sub=r=>isP?r.pos+' · '+LG.teams[r.ti].name:'';
  if(!rows.length) return chips+`<div class="lds"><div class="lg-empty">No games played yet</div></div>`;
  let lead=''; if(isP){ const L0=rows[0], c=cols[by||0]; lead=`<div class="lead${L0.ti===0?' me':''}" style="--p:${tcol(LG.teams[L0.ti])}"><img class="ph" src="${SHOT(L0.id)}" alt=""><div class="tx"><span class="tag">League leader · ${c[0]}</span><b>${esc(L0.n)}</b><small>${esc(sub(L0))}</small><span class="big">${(c[2]||c[1])(L0)}<span>${c[0]}</span></span></div></div>`; }
  const tbl=`<div class="tbl" style="--n:${cols.length}"><div class="tr th"><span>#</span><span>${isP?'Player':'Team'}</span>${cols.map((c,j)=>`<button data-s="${j}" class="${j===by?'on':''}">${c[0]}</button>`).join('')}</div>
    ${rows.slice(0,40).map((r,i)=>`<div class="tr${r.ti===0?' me':''}${LGTAB==='table'&&by==null&&po&&i<po?' in':''}" style="--p:${tcol(LG.teams[r.ti])}"><span class="rk">${i+1}</span><span class="nm"><i></i>${isP?'':crest(LG.teams[r.ti])}<span><b>${esc(nm(r))}</b>${isP?`<small>${esc(sub(r))}</small>`:''}</span></span>${cols.map((c,j)=>`<span class="${j===by?'on':''}">${(c[2]||c[1])(r)}</span>`).join('')}</div>`
      +(LGTAB==='table'&&by==null&&po&&i===po-1&&i<rows.length-1?'<div class="pline">Playoff line</div>':'')).join('')}</div>`;
  return chips+lead+tbl; }

/* ═══ SHARE PICTURES ═══
   Your team, a game's result and your season, each as a picture in the game's own look, drawn right here on a canvas
   (the player photos and NFL logos come from ESPN, which allows it). Like Build a Manager, a phone hands the picture to
   its share sheet; anywhere else it's saved as a file. The picture is drawn as soon as its button is on screen, so a tap
   can share it at once: a phone only lets a share start inside the tap itself. */
const SHW=1080, SHH=1350, SHARE={}, TCOL={bronze:'#C08552',silver:'#C9CED6',gold:'#F0CE26',legend:'#2F86EB'};
const shImg=src=>new Promise(res=>{ if(!src) return res(null); const i=new Image(); i.crossOrigin='anonymous'; i.onload=()=>res(i); i.onerror=()=>res(null); i.src=src; });
const shFonts=()=>Promise.all(['400 48px Silkscreen','800 48px Inter','700 48px Inter','600 48px Inter','500 48px Inter'].map(f=>document.fonts.load(f).catch(()=>null)));
const nflLogo=n=>AB[n]?'https://a.espncdn.com/i/teamlogos/nfl/500/'+AB[n]+'.png':null;
function shCanvas(){ const c=document.createElement('canvas'); c.width=SHW; c.height=SHH; return [c,c.getContext('2d')]; }
function shNotch(x,X,Y,W,H,n,fill){ x.fillStyle=fill; x.beginPath(); x.moveTo(X+n,Y); x.lineTo(X+W-n,Y); x.lineTo(X+W-n,Y+n); x.lineTo(X+W,Y+n); x.lineTo(X+W,Y+H-n); x.lineTo(X+W-n,Y+H-n);
  x.lineTo(X+W-n,Y+H); x.lineTo(X+n,Y+H); x.lineTo(X+n,Y+H-n); x.lineTo(X,Y+H-n); x.lineTo(X,Y+n); x.lineTo(X+n,Y+n); x.closePath(); x.fill(); }
function shText(x,s,X,Y,font,col,o={}){ x.font=font; x.fillStyle=col; x.textAlign=o.al||'left'; x.textBaseline='alphabetic'; const ls='letterSpacing' in x; if(ls) x.letterSpacing=(o.ls||0)+'px';
  let t=String(s==null?'':s); if(o.up) t=t.toUpperCase(); if(o.max) while(x.measureText(t).width>o.max&&t.length>2) t=t.slice(0,-2)+'…'; x.fillText(t,X,Y); if(ls) x.letterSpacing='0px'; }
function shFit(x,s,X,Y,weight,size,fam,col,max,al){ let z=size; const f=()=>x.font=weight+' '+z+'px '+fam; f(); while(z>18&&x.measureText(s).width>max){ z-=2; f(); } x.fillStyle=col; x.textAlign=al||'left'; x.textBaseline='alphabetic'; x.fillText(s,X,Y); }
function shPic(x,img,X,Y,W,H,bottom){ if(!img) return; const k=Math.min(W/img.width,H/img.height), w=img.width*k, h=img.height*k; x.drawImage(img,X+(W-w)/2,bottom?Y+H-h:Y+(H-h)/2,w,h); }
function shBase(x,head,col){ x.fillStyle='#0E1013'; x.fillRect(0,0,SHW,SHH);
  x.fillStyle=col; for(let yy=4;yy<380;yy+=14){ x.globalAlpha=.2*(1-yy/380); for(let xx=6;xx<SHW;xx+=14) x.fillRect(xx,yy,4,4); } x.globalAlpha=1; x.fillRect(0,0,SHW,10);
  shText(x,head,64,88,'700 26px Inter','rgba(253,254,252,.62)',{ls:3,up:true,max:700}); shText(x,'GFL SEASON MODE',SHW-64,88,'400 24px Silkscreen','rgba(253,254,252,.62)',{al:'right'}); }
function shCrest(x,img,name,X,Y,S){ shNotch(x,X,Y,S,S,8,'#242933'); if(img) shPic(x,img,X+12,Y+12,S-24,S-24); else shText(x,ini(name),X+S/2,Y+S/2+S*.13,'800 '+Math.round(S*.36)+'px Inter','#FDFEFC',{al:'center'}); }
function shTiles(x,T,Y){ const n=T.length, g=12, W=(SHW-128-g*(n-1))/n;
  T.forEach(([v,l],i)=>{ const X=64+i*(W+g); shNotch(x,X,Y,W,150,8,'#1A1E25'); shFit(x,String(v),X+24,Y+84,'400',56,'Silkscreen','#FDFEFC',W-48); shText(x,l,X+24,Y+124,'700 21px Inter','rgba(253,254,252,.55)',{ls:2,up:true,max:W-40}); }); }
function shStar(x,label,p,img,lines,Y){ const H=380, tc=TCOL[TIER(p)]||'#C9CED6';
  shNotch(x,64,Y,SHW-128,H,10,'#1A1E25'); x.fillStyle=tc; x.fillRect(64,Y+10,8,H-20);
  shText(x,label,104,Y+58,'700 24px Inter',tc,{ls:3,up:true}); shText(x,String(p.r),SHW-100,Y+76,'400 56px Silkscreen',tc,{al:'right'});
  shNotch(x,104,Y+84,350,262,8,'#242933'); shPic(x,img,104,Y+84,350,262,true);
  const X=490, M=SHW-64-X-32; shFit(x,p.n,X,Y+160,'800',58,'Inter','#FDFEFC',M);
  shText(x,p.pos+(p.season?' · '+p.season:''),X,Y+204,'600 26px Inter','rgba(253,254,252,.6)',{up:true,ls:2});
  shFit(x,lines[0]||'',X,Y+282,'800',46,'Inter','#FDFEFC',M); shFit(x,lines[1]||'',X,Y+330,'500',30,'Inter','rgba(253,254,252,.72)',M); }
/* a player's best numbers, by position */
const shScore=s=>(s.py||0)/25+(s.ptd||0)*4-(s.int||0)*2+(s.ry||0)/10+(s.rushtd||0)*6+(s.recy||0)/10+(s.rtd||0)*6+(s.rec||0)*.5-(s.fum||0)*2;
function shLines(p,s){ if(p.pos==='QB') return [`${s.py||0} yds · ${s.ptd||0} TD`,`${s.comp||0} of ${s.att||0}${s.int?' · '+s.int+' INT':''}${(s.ry||0)>15?' · '+s.ry+' rush yds':''}`];
  if(p.pos==='RB') return [`${s.ry||0} yds · ${s.rushtd||0} TD`,`${s.car||0} carries${s.rec?' · '+s.rec+' catches for '+s.recy:''}`];
  return [`${s.recy||0} yds · ${s.rtd||0} TD`,`${s.rec||0} catches${s.tgt?' on '+s.tgt+' targets':''}`]; }

async function cardGame(d){ await shFonts(); const [c,x]=shCanvas(); const [lm,lt,pi]=await Promise.all([shImg(d.me.logo),shImg(d.them.logo),shImg(d.pog?SHOT(d.pog.p.id):null)]);
  shBase(x,d.label+' · Final'+(d.ot?' · OT':''),d.col);
  shText(x,d.res==='W'?'YOU WIN':d.res==='L'?'YOU LOSE':'A TIE',64,204,'400 88px Silkscreen',d.res==='W'?'#F0CE26':d.res==='L'?'#FF5C7E':'#FDFEFC');
  const Y=250, W=(SHW-128-12)/2;
  [[d.me,lm,d.res!=='L'],[d.them,lt,d.res!=='W']].forEach(([t,img,hi],i)=>{ const X=64+i*(W+12); shNotch(x,X,Y,W,330,10,'#1A1E25'); shCrest(x,img,t.name,X+32,Y+32,150);
    shText(x,String(t.sc),X+W-36,Y+176,'400 128px Silkscreen',hi?'#FDFEFC':'rgba(253,254,252,.38)',{al:'right'});
    shFit(x,t.name,X+32,Y+264,'800',38,'Inter',hi?'#FDFEFC':'rgba(253,254,252,.55)',W-64); shText(x,t.sub||'',X+32,Y+304,'600 23px Inter','rgba(253,254,252,.5)',{up:true,ls:2,max:W-64}); });
  if(d.pog) shStar(x,'Player of the game',d.pog.p,pi,d.pog.lines,612);
  shTiles(x,d.tiles,1020); shText(x,d.foot||'',64,SHH-60,'600 24px Inter','rgba(253,254,252,.45)',{up:true,ls:2,max:SHW-128}); return c; }

async function cardTeam(d){ await shFonts(); const [c,x]=shCanvas(); const imgs=await Promise.all([shImg(d.logo),...d.five.map(p=>shImg(SHOT(p.id))),shImg(d.dst?nflLogo(d.dst.n):null)]);
  shBase(x,d.label,d.col); shCrest(x,imgs[0],d.name,64,122,140); shFit(x,d.name,232,196,'800',60,'Inter','#FDFEFC',SHW-64-232);
  shText(x,d.sub,232,244,'600 27px Inter','rgba(253,254,252,.62)',{up:true,ls:2,max:SHW-64-232});
  let Y=296; d.five.forEach((p,i)=>{ const H=158, tc=TCOL[TIER(p)]; shNotch(x,64,Y,SHW-128,H,8,'#1A1E25'); x.fillStyle=tc; x.fillRect(64,Y+8,8,H-16);
    shNotch(x,90,Y+13,184,132,6,'#242933'); shPic(x,imgs[1+i],90,Y+13,184,132,true);
    shText(x,OSLOTS[i],302,Y+48,'800 23px Inter','rgba(253,254,252,.55)',{ls:3});
    shFit(x,p.n,302,Y+94,'800',42,'Inter','#FDFEFC',SHW-64-302-150);
    shText(x,p.season+' · '+ATTR[p.pos].map((l,k)=>(ABR[l]||l)+' '+(p.a?p.a[k]:'–')).join(' · '),302,Y+134,'500 24px Inter','rgba(253,254,252,.6)',{max:SHW-64-302-150});
    shText(x,String(p.r),SHW-96,Y+108,'400 72px Silkscreen',tc,{al:'right'}); Y+=H+10; });
  if(d.dst){ shNotch(x,64,Y,SHW-128,108,8,'#1A1E25'); x.fillStyle=TCOL[TIER(d.dst)]; x.fillRect(64,Y+8,8,92); shPic(x,imgs[6],96,Y+14,80,80);
    shText(x,'D/ST',204,Y+46,'800 23px Inter','rgba(253,254,252,.55)',{ls:3}); shFit(x,d.dst.season+' '+d.dst.n,204,Y+86,'800',36,'Inter','#FDFEFC',SHW-64-204-150);
    shText(x,String(d.dst.r),SHW-96,Y+82,'400 56px Silkscreen',TCOL[TIER(d.dst)],{al:'right'}); }
  shText(x,d.foot||'',64,SHH-48,'600 24px Inter','rgba(253,254,252,.45)',{up:true,ls:2,max:SHW-128}); return c; }

async function cardSeason(d){ await shFonts(); const [c,x]=shCanvas(); const [lg,mi]=await Promise.all([shImg(d.logo),shImg(d.mvp?SHOT(d.mvp.p.id):null)]);
  shBase(x,d.label,d.col); shCrest(x,lg,d.name,64,122,150);
  shFit(x,d.title,244,206,'400',80,'Silkscreen',d.titleCol,SHW-64-244); shFit(x,d.name,244,256,'700',34,'Inter','#FDFEFC',SHW-64-244);
  if(d.mvp) shStar(x,'Season MVP',d.mvp.p,mi,d.mvp.lines,312);
  shTiles(x,d.tiles,712);
  const G=d.games, per=Math.min(8,Math.max(1,G.length)), g=8, W=(SHW-128-g*(per-1))/per; shText(x,'Week by week',64,914,'700 24px Inter','rgba(253,254,252,.55)',{up:true,ls:3});
  G.forEach((r,i)=>{ const X=64+(i%per)*(W+g), Y=936+Math.floor(i/per)*132, cc=r.k==='W'?'#4ade80':r.k==='L'?'#D9325E':r.k==='T'?'#C9CED6':'#242933', ink=r.k?'#0E1013':'rgba(253,254,252,.55)';
    shNotch(x,X,Y,W,120,6,cc); shText(x,r.w,X+W/2,Y+44,'800 22px Inter',ink,{al:'center',ls:1}); shFit(x,r.s||'',X+W/2,Y+92,'800',28,'Inter',ink,W-16,'center'); });
  if(d.leaders&&d.leaders.length&&G.length<=8){ shText(x,'Team leaders',64,1104,'700 24px Inter','rgba(253,254,252,.55)',{up:true,ls:3}); shTiles(x,d.leaders,1124); }
  shText(x,d.foot||'',64,SHH-48,'600 24px Inter','rgba(253,254,252,.45)',{up:true,ls:2,max:SHW-128}); return c; }

/* what goes on each picture */
function gameShareData(M){ const L=(M.lineup&&M.lineup.length?M.lineup:DR.got.slice(0,5)), ps=M.ps, [a,b]=M.score; let bi=0; L.forEach((p,i)=>{ if(ps[i]&&shScore(ps[i])>shScore(ps[bi])) bi=i; });
  const season=typeof LG!=='undefined'&&LG&&!(typeof QUICK!=='undefined'&&QUICK), me=season?LG.teams[0]:null, them=CPU;
  return {label:season?LG.rounds[LG.cur].label:'Quick game', col:(me&&me.col&&me.col[0])||'#4C9EFF', res:a>b?'W':a<b?'L':'T', ot:M.ot,
    me:{name:ME.name,logo:ME.logo,sc:a,sub:season?'You · '+recTxt(me.st):'You'}, them:{name:them.name,logo:them.logo,sc:b,sub:season&&them.st?recTxt(them.st):''},
    pog:L[bi]?{p:L[bi],lines:shLines(L[bi],ps[bi])}:null,
    tiles:[[M.st.py+M.st.ry,'Your yards'],[M.opp.yds||0,'Yds allowed'],[M.dst.int+M.dst.fum,'Takeaways'],[M.dst.sk,'Sacks']],
    foot:(DR.got[5]?DR.got[5].season+' '+DR.got[5].n+' defense · ':'')+(season?LG.name+' season':'Season Mode')}; }
function teamShareData(){ const me=LG.teams[0], pl=ordinal(standings().findIndex(x=>x.i===0)+1);
  return {label:'My team · '+LG.name+' season · '+(LG.phase==='done'?'Final':LG.rounds[LG.cur].label), name:me.name, logo:me.logo, col:(me.col&&me.col[0])||'#4C9EFF',
    sub:recTxt(me.st)+' · '+pl+' of '+LG.teams.length+' · Offense '+offR(me), five:me.roster, dst:LG.dstRound===LG.cur?DR.got[5]:null,
    foot:(me.bench||[]).length+' on the bench · $'+(me.faab??100)+' FAAB left'}; }
function seasonShareData(){ const me=LG.teams[0], place=standings().findIndex(x=>x.i===0)+1, done=LG.phase==='done', champ=done&&LG.champ===0;
  const P=Object.values(LG.pl||{}).filter(p=>p.ti===0&&!isBackup(p)&&p.id).sort((x,y)=>shScore(y)-shScore(x)), m=P[0];
  const games=LG.rounds.map(R=>{ const g=myGame(R), r=myRes(g); return g||(R.bye&&R.bye.includes(0))?{w:wkShort(R),k:r?r.k:'',s:r?r.m+'–'+r.t:(g?'':'Bye')}:null; }).filter(Boolean);
  return {label:LG.name+' season · '+(done?'Final':LG.rounds[LG.cur].label), name:me.name, logo:me.logo, col:(me.col&&me.col[0])||'#4C9EFF',
    title:champ?'CHAMPIONS':done?ordinal(place)+' PLACE':'SEASON SO FAR', titleCol:champ?'#F0CE26':'#FDFEFC',
    mvp:m?{p:m,lines:(()=>{ const l=shLines(m,m); return [l[0],l[1]+' · '+m.g+' game'+(m.g===1?'':'s')]; })()}:null,
    tiles:[[recTxt(me.st),'Record'],[me.st.pf,'Pts for'],[me.st.pa,'Pts against'],[ordinal(place),'Place']],
    leaders:[['py','Pass'],['ry','Rush'],['recy','Rec']].map(([k,l])=>{ const b=P.slice().sort((x,y)=>(y[k]||0)-(x[k]||0))[0]; return b&&b[k]?[b[k],l+' yds · '+lastN(b.n)]:null; }).filter(Boolean),
    games, foot:champ?'League champions':done?'Season over':(me.bench||[]).length+' on the bench · $'+(me.faab??100)+' FAAB left'}; }

/* drawing, the button, and the share */
function shareWarm(kind,key,make){ const s=SHARE[kind]; if(s&&s.key===key&&(s.file||s.busy)) return shareBtn(kind); SHARE[kind]={key,busy:true}; shareBtn(kind);
  make().then(c=>new Promise(r=>c.toBlob(r,'image/png'))).then(b=>{ if(!SHARE[kind]||SHARE[kind].key!==key) return; SHARE[kind]={key,file:new File([b],'gfl-season-mode-'+kind+'.png',{type:'image/png'})}; shareBtn(kind); })
    .catch(()=>{ if(SHARE[kind]&&SHARE[kind].key===key){ SHARE[kind]={key,err:1}; shareBtn(kind); } }); }
function shareBtn(kind){ document.querySelectorAll('[data-share="'+kind+'"]').forEach(b=>{ const s=SHARE[kind]||{}; b.disabled=!s.file; b.textContent=s.file?b.dataset.label:s.err?'Picture unavailable':'Drawing picture…'; b.onclick=()=>shareGo(kind); }); }
function shareGo(kind){ const s=SHARE[kind]; if(!s||!s.file) return; const f=s.file;
  if(navigator.share&&matchMedia('(pointer:coarse)').matches&&navigator.canShare&&navigator.canShare({files:[f]})){ navigator.share({files:[f]}).catch(()=>{}); return; }
  const u=URL.createObjectURL(f), a=document.createElement('a'); a.href=u; a.download=f.name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(u),5000);
  document.querySelectorAll('[data-share="'+kind+'"]').forEach(b=>{ b.textContent='Picture saved'; setTimeout(()=>{ b.textContent=b.dataset.label; },1800); }); }
const shareButton=(kind,label)=>`<button class="btn shr" data-share="${kind}" data-label="${label}" disabled>Drawing picture…</button>`;

/* ═══ GAME-DAY SCENES ═══
   A stadium on game day, drawn as pixel art at a low resolution and blown up with hard edges: the sky (day, dusk or
   night, stars and glowing light towers after dark), the stands packed in the home team's colours, the scoreboard, the
   field with the home end zone and two teams lined up at midfield. Snow late in the season; fireworks for the playoffs;
   confetti and fireworks for a title. Each week has its own, the same every time you look. */
function seedRng(s){ let h=2166136261; for(const c of String(s)) h=Math.imul(h^c.codePointAt(0),16777619); return ()=>{ h+=0x6D2B79F5; let t=h; t=Math.imul(t^t>>>15,t|1); t^=t+Math.imul(t^t>>>7,t|61); return ((t^t>>>14)>>>0)/4294967296; }; }
const hexRgb=h=>{ const m=String(h||'#888').replace('#',''); const n=parseInt(m.length===3?m.split('').map(c=>c+c).join(''):m,16)||0; return [n>>16&255,n>>8&255,n&255]; };
const mixHex=(a,b,k)=>{ const A=hexRgb(a), B=hexRgb(b); return 'rgb('+A.map((v,i)=>Math.round(v+(B[i]-v)*k)).join(',')+')'; };
function pxScene(cv,o){ const H=96, box=cv.getBoundingClientRect(), W=Math.max(120,Math.min(260,Math.round(H*((box.width||343)/(box.height||220)))));
  cv.width=W; cv.height=H; const x=cv.getContext('2d'), R=seedRng(o.seed||'gfl'), P=(X,Y,w,h,c)=>{ x.fillStyle=c; x.fillRect(X|0,Y|0,w|0,h|0); };
  const hc=o.home||'#3f8fea', ac=o.away||'#c8233e', t=o.time||'day', night=t==='night', dusk=t==='dusk';
  /* the sky, in bands with a dither between them */
  const sky=night?['#05070f','#0a0f22','#121a38','#1b2550']:dusk?['#1d1640','#4a2a5c','#a8465a','#f08a4b','#ffcf7a']:['#3b8fd6','#5aa9e6','#7cc0ee','#a8d8f0'];
  const skyH=40, band=skyH/sky.length; sky.forEach((c,i)=>{ P(0,i*band,W,band+1,c); if(i<sky.length-1) for(let X=0;X<W;X+=2) P(X+(i%2),(i+1)*band-1,1,1,sky[i+1]); });
  if(night) for(let i=0;i<W*.35;i++) P(R()*W,R()*30,1,1,R()<.2?'#ffffff':'#8fa0d8');
  if(!night){ for(let k=0;k<3;k++){ const cx=R()*W, cy=6+R()*14, cw=14+R()*18; for(let j=0;j<5;j++) P(cx+j*cw/5-2,cy-(j%2?2:0)-(j===2?3:0),cw/4+3,4,dusk?'rgba(255,214,170,.55)':'rgba(255,255,255,.85)'); } }
  if(!night&&!dusk){ P(W*.82,6,7,7,'#fff6b0'); P(W*.82-1,7,9,5,'#fff6b0'); }
  if(dusk){ P(W*.5-9,30,18,6,'#ffd88a'); P(W*.5-6,28,12,2,'#ffe7b0'); }
  /* the bowl: the top of the stadium, the upper deck, a facade band in the home colour, the lower deck */
  const top=26, up0=30, mid=44, low0=48, fld=60;
  P(0,top,W,4,'#2a2f38'); for(let X=0;X<W;X+=6) P(X,top-1,3,1,'#3a404b');
  const crowd=(y0,y1,dens)=>{ for(let Y=y0;Y<y1;Y++){ P(0,Y,W,1,Y%2?'#23272e':'#1d2127'); for(let X=0;X<W;X++){ const r=R(); if(r>dens) continue; const q=R(); P(X,Y,1,1,q<.5?hc:q<.62?ac:q<.72?'#e9ecf0':q<.8?'#f0ce26':['#c94f3d','#3d6fc9','#4a8f5a','#7a7f87'][Math.floor(q*40)%4]); } } };
  crowd(up0,mid,.78);
  P(0,mid,W,4,mixHex(hc,'#000000',.35)); for(let X=2;X<W;X+=12) P(X,mid+1,8,2,X%24===2?'#f0ce26':'#e9ecf0');
  crowd(low0,fld-1,.85); P(0,fld-1,W,1,mixHex(hc,'#000000',.2));
  /* the scoreboard, and light towers at each end of the bowl */
  const sbw=Math.min(40,W*.28), sbx=W/2-sbw/2; P(sbx-1,top-15,sbw+2,13,'#0c0e12'); P(sbx,top-14,sbw,11,'#14181f'); P(sbx+2,top-12,sbw/2-3,7,hc); P(sbx+sbw/2+1,top-12,sbw/2-3,7,ac);
  for(let X=sbx+3;X<sbx+sbw-3;X+=3) P(X,top-4,1,1,'#f0ce26'); P(W/2-1,top-2,2,4,'#2a2f38');
  [W*.08,W*.92].forEach(tx=>{ P(tx-1,4,2,top,'#3a404b'); P(tx-6,2,12,5,night||dusk?'#fffbe0':'#cfd5dd'); for(let X=-5;X<6;X+=2) P(tx+X,3,1,3,night||dusk?'#ffffff':'#e9ecf0');
    if(night||dusk){ x.fillStyle='rgba(255,250,220,.08)'; x.beginPath(); x.moveTo(tx-6,6); x.lineTo(tx+6,6); x.lineTo(W/2+(tx<W/2?-10:10)+(tx<W/2?20:-20),H); x.lineTo(W/2+(tx<W/2?-40:40),H); x.closePath(); x.fill(); } });
  /* the field: stripes that widen toward you, the far end zone in the home colour, yard lines, the hash */
  const rows=[[fld,3,'#1d5a2c'],[fld+3,3,'#236535'],[fld+6,4,'#1d5a2c'],[fld+10,4,'#236535'],[fld+14,5,'#1d5a2c'],[fld+19,6,'#236535'],[fld+25,6,'#1d5a2c'],[fld+31,7,'#236535']];
  rows.forEach(([y,h,c])=>P(0,y,W,h,c)); P(0,fld,W,3,mixHex(hc,'#000000',.15)); for(let X=4;X<W;X+=10) P(X,fld+1,5,1,'rgba(255,255,255,.55)');
  rows.slice(1).forEach(([y])=>P(0,y,W,1,'rgba(255,255,255,.45)'));
  rows.slice(1).forEach(([y,h])=>{ P(W*.4,y+h/2,1,1,'rgba(255,255,255,.4)'); P(W*.6,y+h/2,1,1,'rgba(255,255,255,.4)'); });
  /* two lines at the snap, home in its colour against the visitors */
  const ly=fld+15; for(let k=-5;k<=5;k++){ const px=W/2+k*4; P(px,ly-4,2,3,ac); P(px,ly-5,2,1,mixHex(ac,'#ffffff',.4)); P(px,ly+1,2,3,hc); P(px,ly,2,1,mixHex(hc,'#ffffff',.4)); }
  P(W/2,ly-1,2,1,'#8a4b22');
  /* the weather, and the occasion */
  if(o.rain){ P(0,0,W,H,'rgba(24,34,52,.28)'); for(let i=0;i<W*1.1;i++){ const x=R()*W, y=R()*H; P(x,y,1,1,'rgba(200,214,235,.6)'); P(x-1,y+1,1,2,'rgba(200,214,235,.6)'); } }
  if(o.snow){ for(let i=0;i<W*1.4;i++) P(R()*W,R()*H,1,1,'rgba(255,255,255,.9)'); for(let X=0;X<W;X+=1) if(R()<.5) P(X,fld,1,1,'#e9eef5'); }
  const fw=(cx,cy,c,n)=>{ for(let a=0;a<n;a++){ const ang=a/n*Math.PI*2, L=4+R()*7; for(let s=2;s<L;s+=1.5) P(cx+Math.cos(ang)*s,cy+Math.sin(ang)*s,1,1,s>L-2?'#ffffff':c); } P(cx,cy,1,1,'#ffffff'); };
  if(o.fireworks) for(let k=0;k<(o.champ?6:3);k++) fw(8+R()*(W-16),5+R()*16,[hc,'#f0ce26','#ffffff',ac][k%4],14);
  if(o.confetti) for(let i=0;i<W*.9;i++) P(R()*W,R()*H,1+(R()<.3?1:0),1,[hc,'#f0ce26','#ffffff','#4ade80','#4C9EFF'][Math.floor(R()*5)]);
  return cv; }

/* ═══ GAME DAY ═══ the scene for a week, its headline, the bracket, the title, the trophy case */
const teamCol=t=>(t&&t.col&&t.col[0])||'#3f8fea';
function sceneFor(R,g){ const k=LG.rounds.indexOf(R), reg=LG.rounds.filter(r=>r.kind==='reg').length, h=LG.teams[g?g.h:0], a=LG.teams[g?g.a:1], rnd=seedRng(LG.name+':'+k+':'+(g?g.h+'-'+g.a:'')), po=R.kind==='po', fin=R.label==='The final';
  const time=po?'night':['day','dusk','night'][Math.floor(rnd()*3)], snow=k>=reg*.6&&rnd()<.4, rain=!snow&&rnd()<.22;
  return {rain,art:fin?'playoff':po?'playoff':snow?'snow':time,seed:LG.name+k+(g?g.h+'v'+g.a:''),home:teamCol(h),away:teamCol(a),time,snow,fireworks:po,confetti:false,label:po?(fin?'Championship':R.label)+(snow?' · Snow':rain?' · Rain':''):snow?'Snow game':rain?'Rain game':time==='night'?'Night game':time==='dusk'?'Late kickoff':'Afternoon kickoff'}; }
function paintScenes(){ document.querySelectorAll('canvas[data-scene]').forEach(c=>{ try{ pxScene(c,JSON.parse(c.dataset.scene)); }catch(e){} }); }
/* pixel icons for the menu bar, drawn from rows of a 12x12 grid */
const ICONS={next:['............','....####....','..##....##..','.#..#..#..#.','#..........#','#..######..#','#..........#','.#..#..#..#.','..##....##..','....####....','............','............'],
  sched:['............','.##########.','.#.#.##.#.#.','.##########.','.#........#.','.#.##.##.##.','.#........#.','.#.##.##.#..','.#........#.','.##########.','............','............'],
  team:['............','..##....##..','.####..####.','############','#.########.#','..########..','..###..###..','..##.##.##..','..###..###..','..########..','............','............'],
  league:['............','..########..','.#.######.#.','.#.######.#.','..#.####.#..','....####....','.....##.....','.....##.....','....####....','...######...','............','............']};
const pxIcon=k=>{ const R=ICONS[k==='final'?'league':k]||ICONS.next; let r=''; R.forEach((row,y)=>[...row].forEach((c,x)=>{ if(c==='#') r+=`<rect x="${x}" y="${y}" width="1" height="1"/>`; })); return `<svg viewBox="0 0 12 12" shape-rendering="crispEdges" fill="currentColor">${r}</svg>`; };
const sceneImg=(k,tint,rain,snow)=>`<canvas class="scn art" data-art="${k||'day'}" data-tint="${tint||''}"${rain?' data-rain="1"':''}${snow?' data-snow="1"':''}></canvas>`;
/* snow over a picture that isn't the snow picture */
function snowOn(cv){ const x=cv.getContext('2d'), W=cv.width, H=cv.height; let s=11; const R=()=>{ s=(s*16807)%2147483647; return s/2147483647; }; x.fillStyle='rgba(255,255,255,.9)'; for(let i=0;i<W*1.2;i++) x.fillRect(Math.floor(R()*W),Math.floor(R()*H),1,1); }
/* rain over a picture: a grey-blue wash and slanting streaks */
function rainOn(cv){ const x=cv.getContext('2d'), W=cv.width, H=cv.height; x.fillStyle='rgba(24,34,52,.28)'; x.fillRect(0,0,W,H); let s=7; const R=()=>{ s=(s*16807)%2147483647; return s/2147483647; };
  x.fillStyle='rgba(200,214,235,.55)'; for(let i=0;i<W*.8;i++){ const px=Math.floor(R()*W), py=Math.floor(R()*H); x.fillRect(px,py,1,1); x.fillRect(px-1,py+1,1,1); x.fillRect(px-1,py+2,1,1); } }
const ART_CACHE={};
function rgbHsl(r,g,b){ r/=255; g/=255; b/=255; const mx=Math.max(r,g,b), mn=Math.min(r,g,b), l=(mx+mn)/2; let h=0, s=0; if(mx!==mn){ const d=mx-mn; s=l>.5?d/(2-mx-mn):d/(mx+mn); h=mx===r?(g-b)/d+(g<b?6:0):mx===g?(b-r)/d+2:(r-g)/d+4; h*=60; } return [h,s,l]; }
function hslRgb(h,s,l){ const f=n=>{ const k=(n+h/30)%12, a=s*Math.min(l,1-l); return Math.round(255*(l-a*Math.max(-1,Math.min(k-3,9-k,1)))); }; return [f(0),f(8),f(4)]; }
function paintArt(){ document.querySelectorAll('canvas.art').forEach(cv=>{ const k=cv.dataset.art, tint=cv.dataset.tint, key=k+'|'+tint, wet=cv.dataset.rain==='1', icy=cv.dataset.snow==='1';
    const put=src=>{ cv.width=src.width; cv.height=src.height; cv.getContext('2d').putImageData(src,0,0); if(wet) rainOn(cv); if(icy) snowOn(cv); };
    if(ART_CACHE[key]) return put(ART_CACHE[key]);
    const im=new Image(); im.onload=()=>{ const c=document.createElement('canvas'); c.width=im.width; c.height=im.height; const x=c.getContext('2d'); x.drawImage(im,0,0); const d=x.getImageData(0,0,c.width,c.height);
      if(tint){ const [th,ts]=rgbHsl(...hexRgb(tint).map(Number)), y0=Math.floor(c.height*.3);
        for(let y=y0;y<c.height;y++) for(let X=0;X<c.width;X++){ const i=(y*c.width+X)*4, [h,s,l]=rgbHsl(d.data[i],d.data[i+1],d.data[i+2]); if(h>=195&&h<=255&&s>.3&&l>.12&&l<.85){ const [R,G,B]=hslRgb(th,Math.max(.35,Math.min(.9,ts)),l); d.data[i]=R; d.data[i+1]=G; d.data[i+2]=B; } } }
      ART_CACHE[key]=d; put(d); }; im.src='art2/'+k+'.png'; }); }
/* the streak a team is on: W3, L2 */
function streakOf(i){ const res=[]; LG.rounds.forEach(R=>R.games.forEach(g=>{ if(!g.s||(g.h!==i&&g.a!==i)) return; const m=g.h===i?g.s[0]:g.s[1], t=g.h===i?g.s[1]:g.s[0]; res.push(m>t?'W':m<t?'L':'T'); }));
  if(!res.length) return {k:'',n:0}; const k=res[res.length-1]; let n=0; for(let j=res.length-1;j>=0&&res[j]===k;j--) n++; return {k,n}; }
const nums=['zero','one','two','three','four','five','six','seven','eight','nine','ten'], numW=n=>nums[n]||String(n);
/* THE HEADLINE: the most newsworthy thing about this game, from the records, the streaks, the standings, who's hurt,
   the stars, and what's at stake; and a second line under it */
function headlineFor(R,g){ const me=LG.teams[0], home=g.h===0, oi=home?g.a:g.h, t=LG.teams[oi], S=standings(), pm=S.findIndex(x=>x.i===0)+1, pt=S.findIndex(x=>x.i===oi)+1;
  const sm=streakOf(0), so=streakOf(oi), reg=LG.rounds.filter(r=>r.kind==='reg').length, k=LG.rounds.indexOf(R), late=R.kind==='reg'&&k>=reg-2, po=LG.po;
  const you=me.name, them=t.name, rm=recTxt(me.st), rt=recTxt(t.st), at=home?'host':'visit', LM=gameLineup(me), LT=gameLineup(t);
  const out=me.roster.filter(p=>p.inj), starT=LT.slice().sort((a,b)=>b.r-a.r)[0], starM=LM.slice().sort((a,b)=>b.r-a.r)[0], gap=offR(me)-offR(t), H=[];
  if(R.label==='The final') H.push([100,`For the title: ${you} and ${them} meet in the final`,`One game for the ${LG.name} season crown.`]);
  else if(R.kind==='po') H.push([95,`${R.label}: win or go home against ${them}`,`${them} come in at ${rt}; the winner moves on.`]);
  if(me.st.g&&t.st.g&&!me.st.l&&!t.st.l) H.push([90,`Clash of the unbeatens: ${rm} meets ${rt}`,`Somebody's perfect start ends ${home?'at home':'on the road'} today.`]);
  else if(t.st.g>=2&&!t.st.l) H.push([80,`Unbeaten ${them} (${rt}) ${home?'come to town':'welcome you'}`,`Nobody has solved them yet.`]);
  if(pm<=2&&pt<=2&&me.st.g) H.push([85,`Battle for first: ${you} (${rm}) vs ${them} (${rt})`,`The top of the table is on the line.`]);
  if(late&&Math.abs(pm-po)<=1&&R.kind==='reg') H.push([78,`Playoff hopes on the line in ${R.label}`,`${ordinal(pm)} place with the top ${po} getting in.`]);
  if(sm.k==='W'&&sm.n>=2) H.push([60+sm.n,`Riding a ${numW(sm.n)}-game win streak, ${you} ${at} ${them}`,`${rm} and rolling.`]);
  if(sm.k==='L'&&sm.n>=2) H.push([60+sm.n,`Can ${you} snap a ${numW(sm.n)}-game skid?`,`${them} (${rt}) stand in the way.`]);
  if(so.k==='W'&&so.n>=3) H.push([62,`${them} arrive on a ${numW(so.n)}-game tear`,`Winners of ${numW(so.n)} straight.`]);
  if(out.length) H.push([70,`${out.map(p=>lastN(p.n)).join(' and ')} out: ${you} ${home?'host':'take on'} ${them} short-handed`,out.map(p=>`${lastN(p.n)} (${p.inj.n.toLowerCase()})`).join(', ')+'.']);
  if(starT&&starT.r>=96) H.push([55,`${starT.n} and ${them} ${home?'come to town':'await'}`,`A ${starT.r}-rated ${starT.pos} on the other side.`]);
  if(gap<=-6) H.push([50,`Underdogs: ${you} ${at} a stacked ${them}`,`Their offense rates ${offR(t)} to your ${offR(me)}.`]);
  if(gap>=6) H.push([48,`${you} favored against ${them}`,`${starM?lastN(starM.n)+' and an offense rated '+offR(me):'Your offense rates '+offR(me)}.`]);
  if(k===0) H.push([45,`Season opener: ${you} ${at} ${them}`,`The ${LG.name} season starts here.`]);
  H.push([1,`${you} ${at} ${them}`,`${rm} against ${rt}.`]);
  H.sort((a,b)=>b[0]-a[0]); return [H[0][1],H[0][2]]; }
/* THE BRACKET: every round of the playoffs, by seed; byes; the champion at the end */
function bracketHTML(){ if(!LG.seeds||LG.phase==='reg') return ''; const T=LG.teams, po=LG.rounds.filter(r=>r.kind==='po'), n=LG.po, seed=i=>LG.seeds.indexOf(i)+1;
  const names=n===6?['Wild card','Semifinals','The final']:n===4?['Semifinals','The final']:['The final'];
  const row=(i,sc,w,l)=>i==null?`<div class="bk-t tbd"><i></i><span class="ini">?</span><b>To be decided</b><em></em></div>`
    :`<div class="bk-t${w?' w':''}${l?' l':''}${i===0?' me':''}"><i>${seed(i)}</i>${crest(T[i])}<b>${i===0?'You':esc(T[i].name)}</b><em>${sc??''}</em></div>`;
  const game=g=>{ if(!g) return `<div class="bk-g">${row(null)}${row(null)}</div>`; const w=g.s?(g.s[0]>g.s[1]?'h':'a'):'';
    return `<div class="bk-g${g.h===0||g.a===0?' mine':''}">${row(g.h,g.s&&g.s[0],w==='h',w==='a')}${row(g.a,g.s&&g.s[1],w==='a',w==='h')}${g.ot?'<span class="bk-ot">OT</span>':''}</div>`; };
  const cols=names.map(lab=>{ const R=po.find(r=>r.label===lab), cnt=lab==='The final'?1:2, G=R?R.games:Array(cnt).fill(null);
    const byes=lab==='Wild card'&&po[0]?(po[0].bye||[]).map(b=>`<div class="bk-g bye">${row(b,'Bye')}</div>`).join(''):'';
    return `<div class="bk-col"><span class="tag">${lab}</span>${byes}${G.map(game).join('')}</div>`; });
  const ch=LG.champ!=null?T[LG.champ]:null;
  cols.push(`<div class="bk-col ch"><span class="tag">Champion</span><div class="bk-champ${LG.champ===0?' me':''}">${ch?`${crest(ch)}<b>${LG.champ===0?'You':esc(ch.name)}</b>`:'<span class="ini">?</span><b>To be decided</b>'}</div></div>`);
  return `<div class="sh">Playoff <b>bracket</b></div><div class="bk">${cols.join('')}</div>`; }
/* THE TROPHY CASE: every title you win stays on this device, with the team that won it */
const TROPHY_KEY='gfl-season-trophies';
function trophies(){ try{ return JSON.parse(localStorage.getItem(TROPHY_KEY)||'[]'); }catch(e){ return []; } }
function recordTrophy(){ if(LG.champ!==0||LG.trophied) return; LG.trophied=1; const me=LG.teams[0];
  const P=Object.values(LG.pl||{}).filter(p=>p.ti===0&&!isBackup(p)&&p.id).sort((a,b)=>shScore(b)-shScore(a)), m=P[0], fin=LG.rounds[LG.rounds.length-1], g=myGame(fin), r=myRes(g);
  const T={at:Date.now(),league:LG.name,teams:LG.teams.length,name:me.name,logo:me.logo,col:teamCol(me),rec:recTxt(me.st),pf:me.st.pf,pa:me.st.pa,
    final:r?{m:r.m,t:r.t,opp:LG.teams[g.h===0?g.a:g.h].name}:null,roster:me.roster.map(p=>({n:p.n,pos:p.pos,r:p.r,id:p.id,season:p.season,a:p.a})),
    mvp:m?{n:m.n,pos:m.pos,id:m.id,r:m.r,season:m.season,lines:shLines(m,m),g:m.g}:null,
    leaders:[['py','Pass'],['ry','Rush'],['recy','Rec']].map(([k,l])=>{ const b=P.slice().sort((x,y)=>(y[k]||0)-(x[k]||0))[0]; return b&&b[k]?{v:b[k],l:l+' yds',n:b.n}:null; }).filter(Boolean)};
  const L=trophies(); L.unshift(T); try{ localStorage.setItem(TROPHY_KEY,JSON.stringify(L.slice(0,60))); }catch(e){} }
/* a pixel trophy: a gold cup on a dark base */
function pxTrophy(cv){ const W=24,H=30; cv.width=W; cv.height=H; const x=cv.getContext('2d'), P=(X,Y,w,h,c)=>{ x.fillStyle=c; x.fillRect(X,Y,w,h); };
  P(5,2,14,2,'#fff4c2'); P(4,4,16,8,'#F0CE26'); P(5,12,14,3,'#e0b43a'); P(7,15,10,2,'#c99a1e'); P(10,17,4,4,'#d9a514'); P(7,21,10,2,'#e0b43a'); P(5,23,14,5,'#3a2a12'); P(6,24,12,3,'#4a3618');
  P(1,5,3,2,'#F0CE26'); P(0,6,2,4,'#F0CE26'); P(1,10,4,2,'#e0b43a'); P(20,5,3,2,'#F0CE26'); P(22,6,2,4,'#F0CE26'); P(19,10,4,2,'#e0b43a'); P(7,5,2,6,'#fff4c2'); P(9,25,6,1,'#F0CE26'); return cv; }
function paintTrophies(){ document.querySelectorAll('canvas.trophy').forEach(pxTrophy); }
function trophyCaseHTML(back){ const L=trophies();
  return `<div class="tro-top"><button class="lv" id="tro-back">${back||'Back'}</button><span class="tag">Trophy case · ${L.length} title${L.length===1?'':'s'}</span></div>
    ${L.length?L.map(T=>`<div class="tro" style="--p:${T.col||'#3f8fea'}"><div class="tro-h"><canvas class="trophy"></canvas><div><span class="tag">${esc(T.league)} season · ${T.teams} teams</span><b>${esc(T.name)}</b><em>${T.rec} · ${T.pf} for, ${T.pa} against${T.final?` · won the final ${T.final.m}–${T.final.t} over ${esc(T.final.opp)}`:''}</em><small>${new Date(T.at).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'})}</small></div></div>
      ${T.mvp?`<div class="tro-mvp"><img src="${SHOT(T.mvp.id)}" alt=""><div><span class="tag">Season MVP</span><b>${esc(T.mvp.n)} <small>${T.mvp.pos} · ${T.mvp.r}</small></b><em>${esc(T.mvp.lines[0])}</em></div></div>`:''}
      <div class="tro-five">${T.roster.map(p=>`<div class="t-${TIER(p)}"><img src="${SHOT(p.id)}" alt=""><span>${p.pos}</span><b>${esc(lastN(p.n))}</b><em>${p.r}</em></div>`).join('')}</div>
      ${T.leaders&&T.leaders.length?`<div class="tro-ld">${T.leaders.map(l=>`<div><b>${l.v}</b><span>${l.l} · ${esc(lastN(l.n))}</span></div>`).join('')}</div>`:''}</div>`).join(''):'<div class="lg-empty">No titles yet. Win a season and it goes here.</div>'}`; }
function openTrophies(from){ const body=from==='setup'?$('#scr-match'):$('#scr-hub .hb-body'); if(!body) return;
  body.innerHTML=from==='setup'?`<div class="tro-wrap">${trophyCaseHTML('Back')}</div>`:trophyCaseHTML('Back to the season'); paintTrophies();
  $('#tro-back').onclick=()=>from==='setup'?setupScreen():hub(HUBTAB); }
/* a burst of confetti over the title screen */
const confettiHTML=()=>`<div class="cft">${Array.from({length:42},(_,i)=>`<i style="left:${(i*37)%100}%;background:${['#F0CE26','#FDFEFC','#4ade80','#4C9EFF','#FF8E1C','#D9325E'][i%6]};animation-delay:${(i%14)*.18}s;animation-duration:${2.6+(i%5)*.5}s"></i>`).join('')}</div>`;

/* ═══ STARTING OUT ═══ pick a size, build your team, then the hub */
/* QUICK GAMES ONLY: an account let in just for quick games (Marathon Men) sees the quick game and its test team, and
   nothing of a season: no league to pick, no season to resume */
let QUICK_ONLY=false;
function setupScreen(){ screen('match'); const tc=trophies().length, hero=lab=>`<div class="hero st">${sceneImg('dusk',(ME.col&&ME.col[0])||'')}<div class="hero-in"><div class="hv-tags"><span>Season Mode</span></div><div class="st-me"><div class="hv-c">${crest(ME)}</div><b>${esc(ME.name)}</b></div><h2 class="ttl sm">${lab}</h2></div></div>`;
  if(QUICK_ONLY){ $('#scr-match').innerHTML=`<div class="mu setup st2">${hero('Quick game')}
    <div class="st-acts"><button class="btn w" id="qg">Quick game</button><button class="btn" id="qgmix">Quick game · test team</button><button class="btn" id="qgpvp" data-pvp>Head to head</button></div></div>`;
    paintScenes(); paintArt(); $('#qg').onclick=()=>quickGame(false); $('#qgmix').onclick=()=>quickGame(true); $('#qgpvp').onclick=()=>pvpHub(); pvpBadge(); return; }
  $('#scr-match').innerHTML=`<div class="mu setup st2">${hero('Pick your league')}
    <div class="presets">${PRESETS.map((p,i)=>`<button class="${i===1?'on':''}" data-p="${p.id}"><b>${p.name}</b><span>${p.note}</span></button>`).join('')}</div>
    <div class="st-acts"><button class="btn w" id="go">Open packs</button><button class="btn" id="mix">Test team · mixed tiers</button></div>
    <div class="sh">Or just <b>one game</b></div>
    <div class="st-acts"><button class="btn w" id="qg">Quick game</button><button class="btn" id="qgmix">Quick game · test team</button><button class="btn" id="qgpvp" data-pvp>Head to head</button></div>
    ${tc?`<button class="btn tro-btn" id="st-tro"><canvas class="trophy"></canvas>Trophy case · ${tc}</button>`:''}</div>`;
  paintScenes(); paintArt(); paintTrophies();
  let pick='standard'; document.querySelectorAll('.presets button').forEach(b=>b.onclick=()=>{ pick=b.dataset.p; document.querySelectorAll('.presets button').forEach(x=>x.classList.toggle('on',x===b)); });
  $('#go').onclick=()=>{ SETUP=pick; seasonPack(); };
  $('#mix').onclick=()=>{ SETUP=pick; mixTeam(); };
  $('#qg').onclick=()=>quickGame(false); $('#qgmix').onclick=()=>quickGame(true); $('#qgpvp').onclick=()=>pvpHub(); pvpBadge(); const st=$('#st-tro'); if(st) st.onclick=()=>openTrophies('setup'); }
/* for testing: skip the packs with one of every tier, in a random order across the six slots */
function mixTeam(){ const tiers=['legend','gold','silver','bronze','gold','silver'].sort(()=>Math.random()-.5); DR.got=[]; DR.i=0;
  SLOTS.forEach((pos,i)=>{ DR.i=i; DR.got[i]=four(pos,tiers[i])[0]; }); DR.i=SLOTS.length; screen('draft'); stageSpin(); }

/* ═══ A QUICK GAME ═══ Your six from packs, one opponent drawn from every GFL team with its five and a defense on the
   same odds, kits from both logos, home or away at random. Nothing goes in a season's book. */
let QUICK=false;
function quickGame(mix){ SETUP=null; QUICK=true; if(mix) return mixTeam(); DR.i=0; DR.got=[]; screen('draft'); stageSpin(); }
function quickSetup(){ let tm='day', wq='clear';
  const seg=(id,lab,opts,cur)=>`<span class="qs-l">${lab}</span><div class="qs-seg" id="${id}">${opts.map(([k,l])=>`<button type="button" class="${k===cur?'on':''}" data-k="${k}">${l}</button>`).join('')}</div>`;
  $('#stage').innerHTML=`<span class="q">Game day</span>${seg('qs-time','Time',[['day','Day'],['dusk','Dusk'],['night','Night']],tm)}${seg('qs-wx','Weather',[['clear','Clear'],['rain','Rain'],['snow','Snow']],wq)}<button class="btn w" id="kick" style="width:220px">Kick off</button>`;
  ['qs-time','qs-wx'].forEach(id=>$('#'+id).querySelectorAll('button').forEach(b=>b.onclick=()=>{ $('#'+id).querySelectorAll('button').forEach(x=>x.classList.toggle('on',x===b)); if(id==='qs-time') tm=b.dataset.k; else wq=b.dataset.k; }));
  $('#kick').onclick=()=>quickKick(tm,wq); }
async function quickKick(tm,wq){ $('#kick').disabled=true; $('#kick').textContent='Finding an opponent';
  const pool=leaguePool(), t0=pool[Math.floor(Math.random()*pool.length)], used=new Set(DR.got.slice(0,5).map(p=>p.id+'-'+p.season));
  const them={name:t0.name,logo:t0.logo||null,roster:OSLOTS.map(pos=>pickPlayer(pos,used)),dst:pickDST()};
  const [mine,theirs]=await Promise.all([logoColors(ME),logoColors(them)]), home=Math.random()<.5;
  const [hk,ak]=dressFor(home?mine:theirs,home?theirs:mine); setKits(home?hk:ak,home?ak:hk);
  CPU=them; screen('game'); MATCH.start({team:them,dst:them.dst,off:offR(them),home,label:'Quick game',mustWin:false,time:tm||'day',rain:wq==='rain',snow:wq==='snow'}); }
/* after it: back to the season if there is one, otherwise the start */
function quickDone(){ QUICK=false; if(resume()) hub('next'); else { DR.i=0; DR.got=[]; setupScreen(); } }
let SETUP=null;
/* the packs are done: the first time, the league is made; every week after, it's time to play */
async function afterDraft(){ if(typeof PVP_BUILD!=='undefined'&&PVP_BUILD) return pvpBuilt(); if(QUICK) return quickSetup(); if(SETUP){ const p=SETUP; SETUP=null; $('#kick').disabled=true; $('#kick').textContent='Building the league'; await newLeague(p); LG.dstRound=DR.got[5]?0:-1; save(); return hub('next'); }
  LG.dstRound=LG.cur; LG.teams[0].dst=DR.got[5]; save(); hub('next'); }
const draftLabel=()=>typeof PVP_BUILD!=='undefined'&&PVP_BUILD?'Ready':SETUP&&!QUICK?'To the season':QUICK?'Game day':'Back to the hub';
function newSeason(){ try{ localStorage.removeItem(SEASON_KEY); }catch(e){} LG=null; DR.i=0; DR.got=[]; setupScreen(); }
/* back where you were: your five and this week's defense come back from the save */
function resume(){ if(QUICK_ONLY){ LG=null; return false; } try{ LG=JSON.parse(localStorage.getItem(SEASON_KEY)||'null'); }catch(e){ LG=null; }
  if(!LG||LG.v!==1||!LG.teams) { LG=null; return false; }
  LG.teams.forEach(t=>{ if(t.faab==null) t.faab=100; t.bench=t.bench||[]; }); if(!LG.wire) LG.wire=[];
  { const PA=new Map(POOL.map(p=>[p.id+'-'+p.season,p])), fresh=p=>{ const q=p&&PA.get(p.id+'-'+p.season); if(q&&q.a) p.a=q.a.slice(); };
    LG.teams.forEach(t=>{ t.roster.forEach(fresh); t.bench.forEach(fresh); }); LG.wire.forEach(fresh);
    const DA=new Map(DEFS.map(d=>['d'+d.id+'-'+d.season,d])); LG.teams.forEach(t=>{ const d=t.dst&&DA.get(t.dst.id); if(d){ t.dst.r=d.r; t.dst.a=d.a&&d.a.slice(); } }); }
  DR.got=[...LG.teams[0].roster,LG.dstRound===LG.cur?LG.teams[0].dst:null]; DR.i=6; return true; }

/* the defense pack says which game it's for: the first one is week 1's, and before every game after you spin again */
function dLabel(){ if(QUICK||!(SETUP||LG)) return 'Defense'; return (SETUP?'Week 1':LG.rounds[LG.cur].label)+' defense'; }
function dNote(){ return ''; }
