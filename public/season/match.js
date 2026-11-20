/* ═══ THE DRAFT ═══
   Six slots. Spin a carousel of packs, open the one it lands on, take one of four players of that tier. The overalls
   stay hidden until you take one; then all four turn over, so you see what you passed on. */
const SLOTS=['QB','RB','WR','WR','TE','D/ST'], ODDS=[['legend',25],['gold',25],['silver',25],['bronze',25]];
const roll=pos=>{ let r=Math.random()*100; for(const [t,p] of ODDS){ if((r-=p)<0) return t; } return 'bronze'; };
const DR={i:0,got:[]};
const packHTML=(t,big)=>`<div class="pk t-${t}${big?' big':''}"><div class="dots"></div><div class="band"></div><b>GFL</b><span>${t}</span></div>`;
function four(pos,tier){
  const used=new Set([...DR.got,...((typeof LG!=='undefined'&&LG&&LG.teams[0].bench)||[])].map(g=>g&&g.id));
  if(pos==='D/ST') return DEFS.filter(d=>TIER(d.r,1)===tier).sort(()=>Math.random()-.5).slice(0,4).map(d=>({id:'d'+d.id+'-'+d.season,n:d.n,pos:'D/ST',season:d.season,r:d.r,a:d.a}));
  return POOL.filter(p=>p.pos===pos&&TIER(p)===tier&&!used.has(p.id)).sort(()=>Math.random()-.5).slice(0,4);
}
/* ═══ THE SPARKS ═══ A layer over the draft for particles: square pixels and twinkling crosses in the tier's colours,
   thrown out from a pack or a card, falling under gravity and fading. It only runs while something is in the air. */
const FXC={bronze:['#C08552','#e2b48a','#8a5a33'],silver:['#C9CED6','#ffffff','#8a9099'],gold:['#F0CE26','#fff4c2','#d9a514','#ffffff'],legend:['#2F86EB','#8cc2ff','#ffffff','#F0CE26','#4C9EFF']};
const PFX=(()=>{ let cv=null, x=null, P=[], raf=0, last=0, W=0, H=0;
  function host(){ const h=document.getElementById('scr-draft'); if(!cv||!h.contains(cv)){ cv=document.createElement('canvas'); cv.className='pfx'; h.appendChild(cv); x=cv.getContext('2d'); }
    const r=h.getBoundingClientRect(), d=Math.min(2,devicePixelRatio||1); if(W!==r.width||H!==r.height){ W=r.width; H=r.height; cv.width=Math.round(W*d); cv.height=Math.round(H*d); x.setTransform(d,0,0,d,0,0); } return r; }
  function at(el){ const h=host(), b=el.getBoundingClientRect(); return [b.left-h.left+b.width/2,b.top-h.top+b.height/2,b.width,b.height]; }
  function add(cx,cy,n,tier,o){ const cols=FXC[tier]||FXC.silver; for(let i=0;i<n;i++){ const a=o.dir!=null?o.dir+(Math.random()-.5)*(o.spread||1):Math.random()*Math.PI*2, sp=(o.sp||240)*(.25+Math.random()*.9);
      P.push({x:cx+(Math.random()-.5)*(o.w||0),y:cy+(Math.random()-.5)*(o.h||0),vx:Math.cos(a)*sp,vy:Math.sin(a)*sp-(o.up||80),g:o.g??460,life:(o.life||1.1)*(.55+Math.random()*.9),age:0,
        s:Math.random()<.25?3:2,col:cols[Math.floor(Math.random()*cols.length)],tw:Math.random()<(o.tw??.3)}); }
    if(!raf){ last=performance.now(); raf=requestAnimationFrame(step); } }
  function step(now){ const dt=Math.min(.04,(now-last)/1000); last=now; x.clearRect(0,0,W,H);
    for(const p of P){ p.age+=dt; p.vy+=p.g*dt; p.vx*=1-dt*.9; p.x+=p.vx*dt; p.y+=p.vy*dt; const a=Math.max(0,1-p.age/p.life); if(!a) continue;
      x.globalAlpha=a; x.fillStyle=p.col; const px=Math.round(p.x), py=Math.round(p.y), s=p.s;
      if(p.tw){ const k=(Math.sin(p.age*24)>0)?s:s-1; x.fillRect(px-k*2,py,k*4+1,1+(k>2?1:0)); x.fillRect(px,py-k*2,1+(k>2?1:0),k*4+1); } else x.fillRect(px,py,s*2,s*2); }
    x.globalAlpha=1; P=P.filter(p=>p.age<p.life);
    if(P.length) raf=requestAnimationFrame(step); else { raf=0; x.clearRect(0,0,W,H); } }
  return { burst(el,tier,n,o){ const [cx,cy,w,h]=at(el); add(cx,cy,n,tier,Object.assign({w:w*.6,h:h*.4},o||{})); },
    rain(el,tier,n){ const [cx,cy,w,h]=at(el); add(cx,cy,n,tier,{w:w*1.1,h:h*1.1,sp:40,up:40,g:-30,life:1.3,tw:.8}); } }; })();
function slotsHTML(){ const db=$('#dbar'); if(db){ db.innerHTML=`<span>${typeof draftWhere==='function'?draftWhere():'Packs'}</span><button class="lv" id="dleave">Leave</button>`; $('#dleave').onclick=()=>{ if(typeof leaveDraft==='function') leaveDraft(); }; }
  $('#slots').innerHTML=SLOTS.map((s,i)=>{ const g=DR.got[i]; return `<div class="${i===DR.i&&!g?'now':''}${g?' done t-'+TIER(g):''}">${s}<b>${g?g.r:'–'}</b></div>`; }).join(''); }
function cardHTML(p){ const t=TIER(p), d=p.pos==='D/ST';
  return `<div class="cd t-${t}"><div class="top"><div class="fade"><div class="dots"></div></div>
    <span class="rt" data-r="${p.r}">??</span><span class="tier">${t}</span>
    <div class="ph">${d?nflImg(p.n,'lg'):`<img src="${SHOT(p.id)}" alt="">`}</div></div>
    <div class="cb"><div class="pn">${esc(p.n)}</div><div class="meta">${p.pos} · <b>${p.season}</b></div></div>
    <div class="at">${ATTR[p.pos].map((l,i)=>`<div><span>${l}</span><i><b data-v="${p.a?p.a[i]:70}"></b></i><em data-v="${p.a?p.a[i]:70}">–</em></div>`).join('')}</div></div>`; }
function stageSpin(){
  slotsHTML(); if(DR.i>=SLOTS.length) return stageRoster();
  const pos=SLOTS[DR.i], land=(typeof PVP_FORCE!=='undefined'&&PVP_FORCE&&PVP_FORCE[DR.i])||roll(pos), N=64, AT=56, W=98, tiers=[];
  for(let i=0;i<N;i++) tiers.push(i===AT?land:roll(pos));
  const rsp=typeof RESPIN!=='undefined'&&RESPIN;
  $('#stage').innerHTML=`<span class="q">${rsp?'Add a player':(DR.i+1)+' of 6'}</span><span class="big">${pos==='D/ST'?(typeof dLabel==='function'?dLabel():'Defense'):pos}</span>${pos==='D/ST'&&typeof dNote==='function'&&dNote()?`<span class="dnote">${dNote()}</span>`:''}
    <div class="carousel"><div class="belt" id="belt">${tiers.map(t=>packHTML(t)).join('')}</div><div class="fl"></div><div class="fr"></div></div>
    <button class="btn w" id="spin" style="width:220px">Spin</button>`;
  const belt=$('#belt'), mid=$('#stage .carousel').clientWidth/2; belt.style.transform=`translateX(${mid-44}px)`;
  const gen=DR.gen;
  $('#spin').addEventListener('click',()=>{ $('#spin').disabled=true;
    belt.style.transition='transform 5.2s cubic-bezier(.06,.72,.1,1)'; belt.style.transform=`translateX(${mid-44-AT*W+(Math.random()*30-15)}px)`;
    setTimeout(()=>{ if(gen!==DR.gen) return; const pk=belt.children[AT]; if(pk){ pk.classList.add('land'); PFX.burst(pk,land,land==='legend'?60:land==='gold'?44:26,{sp:200,up:120}); } setTimeout(()=>{ if(gen===DR.gen) stageOpen(pos,land); },700); },5500); });
}
function stageOpen(pos,tier){
  $('#stage').innerHTML=`<span class="q">${pos==='D/ST'?(typeof dLabel==='function'?dLabel():'Defense'):pos} · ${tier} pack</span><div id="bp" class="t-${tier}"><div class="rays"></div>${packHTML(tier,true)}</div><span class="tag">Tap to open</span>`;
  const pk=$('#bp .pk'), good=tier==='gold'||tier==='legend', sp=good?setInterval(()=>PFX.rain(pk,tier,tier==='legend'?5:3),260):0, gen=DR.gen; DR.rain=sp;
  pk.addEventListener('click',()=>{ if(pk.classList.contains('shake')) return; clearInterval(sp); pk.classList.add('shake');
    setTimeout(()=>{ pk.classList.add('rip'); $('#bp').classList.add('pop'); if(good) $('#bp').classList.add('lit');
      const n={bronze:36,silver:56,gold:96,legend:160}[tier]; PFX.burst(pk,tier,n,{sp:tier==='legend'?420:320,up:140,life:1.4});
      if(good) setTimeout(()=>PFX.burst(pk,tier,Math.round(n/2),{sp:180,up:60,g:120,life:2,tw:.7}),180);
      setTimeout(()=>{ if(gen===DR.gen) stageChoose(pos,tier); },good?820:560); },520); });
}
function stageChoose(pos,tier){
  const opts=four(pos,tier);
  const rsp=typeof RESPIN!=='undefined'&&RESPIN;
  $('#stage').innerHTML=`<span class="q">Pick one</span><div class="four">${opts.map(cardHTML).join('')}</div><button class="btn w" id="next" style="width:220px;visibility:hidden"></button>${rsp?`<button class="btn" id="keep" style="width:220px">Take none</button>`:''}`;
  if(rsp) $('#keep').addEventListener('click',()=>respinDone(true));
  const cs=[...document.querySelectorAll('#stage .cd')]; cs.forEach((c,i)=>setTimeout(()=>{ c.classList.add('in'); setTimeout(()=>PFX.burst(c,tier,10,{sp:120,up:40,life:.7}),260); },120+i*170));
  cs.forEach((c,i)=>c.addEventListener('click',()=>{ if(DR.got[DR.i]) return; DR.got[DR.i]=opts[i]; PFX.burst(c,TIER(opts[i]),TIER(opts[i])==='legend'?90:50,{sp:260,up:110,life:1.2});
    cs.forEach((o,j)=>{ o.classList.add(j===i?'picked':'dim'); const r=o.querySelector('.rt'); setTimeout(()=>{ r.classList.add('flip'); setTimeout(()=>r.textContent=r.dataset.r,200);
      o.querySelectorAll('.at em').forEach(e=>e.textContent=e.dataset.v); o.querySelectorAll('.at b').forEach(b=>b.style.width=((+b.dataset.v-50)/49*100)+'%'); },j===i?0:260); });
    slotsHTML(); if(rsp){ $('#keep').style.display='none'; $('#next').textContent='Add to your team'; $('#next').style.visibility='visible'; return; } $('#next').textContent=DR.i<5?'Next: '+(SLOTS[DR.i+1]==='D/ST'?(typeof dLabel==='function'?dLabel():'Defense'):SLOTS[DR.i+1]):'Your roster'; $('#next').style.visibility='visible'; }));
  $('#next').addEventListener('click',()=>{ if(rsp) return respinDone(false); DR.i++; stageSpin(); });
}
function stageRoster(){
  $('#stage').innerHTML=`<span class="q">Your roster</span><div class="roster">${DR.got.map((p,i)=>`<div class="p">${SLOTS[i]==='D/ST'&&typeof dLabel==='function'&&dLabel()!=='Defense'?'D/ST<br>'+dLabel().replace(' defense',''):SLOTS[i]}</div><div>${p.pos==='D/ST'?nflImg(p.n,'rl'):''}${esc(p.n)} <span class="tag">${p.season}</span><span class="ra">${p.a?ATTR[p.pos].map((l,k)=>l.split(' ')[0].slice(0,3)+' '+p.a[k]).join(' · '):''}</span></div><div class="r t-${TIER(p)}">${p.r}</div>`).join('')}</div>
    <button class="btn w" id="kick" style="width:220px">${typeof draftLabel==='function'?draftLabel():'Kick off'}</button>`;
  GAME.roster(DR.got);
  $('#kick').addEventListener('click',()=>{ if(typeof afterDraft==='function') return afterDraft(); screen('game'); MATCH.start(); });
}

/* ═══ THEIR DRIVES ═══
   Simulated from their offense against your D/ST, drawn like one of the site's charts: a dotted bar per play in the
   lane between the hashes, a call-out, then the field slides on. */
function makeSim(){
  const cv=$('#sim'), ctx=cv.getContext('2d'); let W=0,H=0,K=0; const DPR=Math.min(2,devicePixelRatio||1);
  const VIEW=34; let st=null, cam=25, timer=null, done=null, fast=false, opt0={};
  const myD=()=>(DR.got[5]&&DR.got[5].r)||82;
  function size(){ const r=cv.getBoundingClientRect(); if(!r.width) return; W=r.width; H=r.height; K=H/VIEW; cv.width=Math.round(W*DPR); cv.height=Math.round(H*DPR); ctx.setTransform(DPR,0,0,DPR,0,0); }
  const Y=yd=>H*.62-(yd-cam)*K;
  const COL={run:'#FF8E1C',pass:'#4C9EFF',loss:'#D9325E',to:'#D9325E',td:'#4ade80',fg:'#F0CE26',punt:'rgba(253,254,252,.55)',inc:'rgba(253,254,252,.55)'};
  function field(){
    ctx.fillStyle='#1F5A2E'; ctx.fillRect(0,0,W,H);
    for(let yd=-10;yd<110;yd+=5){ if(((yd/5)%2+2)%2) continue; const a=Y(yd+5), b=Y(yd); if(b<0||a>H) continue; ctx.fillStyle='#246335'; ctx.fillRect(0,Math.max(0,a),W,Math.min(H,b)-Math.max(0,a)); }
    ctx.font='500 10px JetBrains Mono'; ctx.textAlign='center';
    (st&&st.mine?[[100,'rgba(217,50,94,.6)','THEIR END ZONE'],[-10,'rgba(76,158,255,.45)','YOUR END ZONE']]:[[100,'rgba(217,50,94,.6)','YOUR END ZONE'],[-10,'rgba(253,254,252,.22)','THEIR END ZONE']]).forEach(([a,col,l])=>{ const y0=Y(a), y1=Y(a+10); if(y0<0||y1>H) return;
      ctx.fillStyle=dotFill(ctx,col,5,0,Y(0)); ctx.fillRect(0,y1,W,y0-y1); const tw=ctx.measureText(l).width, my=(y0+y1)/2;
      ctx.fillStyle='#171717'; ctx.fillRect(W/2-tw/2-9,my-10,tw+18,20); ctx.fillStyle='rgba(253,254,252,.75)'; ctx.fillText(l,W/2,my+3.5); });
    ctx.textAlign='left'; ctx.font='500 9.5px JetBrains Mono';
    for(let yd=0;yd<=100;yd+=5){ const y=Math.round(Y(yd)); if(y<-4||y>H+4) continue;
      ctx.fillStyle=yd%10?'rgba(253,254,252,.2)':'rgba(253,254,252,.55)'; ctx.fillRect(0,y-(yd%10?.5:1),W,yd%10?1:2);
      if(yd%10===0&&yd>0&&yd<100){ const lab=yd===50?'50':yd<50?'OWN '+yd:'OPP '+(100-yd), tw=ctx.measureText(lab).width;
        ctx.fillStyle='#171717'; ctx.fillRect(7,y-7,tw+10,14); ctx.fillStyle='rgba(253,254,252,.55)'; ctx.fillText(lab,12,y+3.5); } }
  }
  function bar(x,a,b,col){ const w=30, top=Math.min(a,b), h=Math.max(3,Math.abs(b-a));
    ctx.fillStyle=dotFill(ctx,col,3,x-w/2,Y(0)); ctx.fillRect(x-w/2,top,w,h); ctx.fillStyle=col; ctx.fillRect(x-w/2,Math.round(b)-1,w,2.5); ctx.fillRect(x-w/2,Math.round(a),w,1); }
  function frame(p,grow){
    if(!W) return; field(); if(!st) return;
    const los=Y(st.yd); ctx.fillStyle='#4C9EFF'; ctx.fillRect(0,Math.round(los)-1,W,2);
    if(st.yd+st.togo<100){ ctx.fillStyle='#F0CE26'; ctx.fillRect(0,Math.round(Y(st.yd+st.togo))-1,W,2); }
    if(!p){ drawBall(ctx,W/2,los,0,3,-Math.PI/2,true); return; }
    const x=Math.round(p.x*W), a=Y(p.from), b=Y(p.from+(p.to-p.from)*grow);
    if(p.kind==='inc'){ bar(x,a,a-12*grow,COL.inc); drawBall(ctx,x+22*grow,a-12-10*Math.sin(grow*Math.PI),0,3,-Math.PI/2+grow*3.2,true); return; }
    bar(x,a,b,COL[p.kind]); drawBall(ctx,x,b,0,3,-Math.PI/2,true);
  }
  function play(){
    if(st.script){ const q=st.script.shift(); return q?Object.assign({x:.44+Math.random()*.12},q):{kind:'end'}; }
    /* HOW THEIR OFFENSE FARES AGAINST YOUR DEFENSE. The gap between the two counts, but only so much: a good defense wins most
       drives, not all of them, and a bad one still gets a stop. Each drive also has its own form (st.form), so some drives
       just click and some never get going, whoever is on the field. */
    if(st.form==null) st.form=gauss()*.45;
    const dd=st.mine?st.def:DR.got[5], adv=clamp((st.off-((dd&&dd.r)||82))/20,-1.5,1.5)*.5+st.form+(st.mine?0:.45),   /* the other side's offense is sharper: about 2.3 points a drive against an even defense (1.45 at 0, 1.9 at .25, 2.05 at .35; the user has asked three times for a little more) */ yd=st.yd, x=.44+Math.random()*.12, DA=i=>(dd&&dd.a)?.5+(clamp((dd.a[i]-55)/44,0,1)-.5)*.5:.5, theirs=st.mine?'Their ball':'Your ball';
    if(st.down===4){ const QLEN=420, MM=MATCH.M, trail=st.mine?0:Math.max(0,(MM.score[0]||0)-(MM.score[1]||0)), left=MM.q>4?0:(4-MM.q)*QLEN+Math.max(0,MM.clock), late=clamp(1-left/(4*QLEN),0,1);
      /* urgency: how many scores behind, weighted by how late it is (both have to be true for it to matter much) */
      const urg=clamp(trail/8,0,3)*late**1.5, desperate=trail>0&&left<150, fgUseless=trail>3&&left<240;
      if(yd>=62&&!fgUseless){ const dist=100-yd+17, good=Math.random()<fgOdds(dist); return {x,from:yd,to:yd,kind:'fg',good,call:good?'Field goal good':'No good',sub:dist+' yards'}; }
      const go=desperate||(st.togo<=2&&yd>=45&&Math.random()<.5)||Math.random()<clamp(urg*(st.togo<=3?1:st.togo<=7?.7:.4)*(yd>=40?1:.6),0,.95);
      if(go){ /* they go for it */ }
      else { const l=Math.round(40+gauss()*6); return {x,from:yd,to:Math.min(99,yd+l),kind:'punt',call:'Punt',sub:l+' yards'}; } }
    if(Math.random()<.56){
      if(Math.random()<(.065-adv*.02)*(.55+DA(0)*.9)){ const l=5+Math.floor(Math.random()*5); return {x,from:yd,to:yd-l,kind:'loss',call:'Sacked',sub:'Loss of '+l}; }
      if(Math.random()<(.028-adv*.01)*(.5+DA(3)*1.1)) return {x,from:yd,to:yd+Math.round(8+Math.random()*10),kind:'to',call:'Intercepted',sub:theirs};
      if(Math.random()<.33-adv*.05+(DA(1)-.5)*.1) return {x,from:yd,to:yd,kind:'inc',call:'Incomplete',sub:''};
      const y=Math.max(1,Math.round(8.3+adv*2.5-(DA(1)-.5)*3+gauss()*6+(Math.random()<.08?22:0))); return {x,from:yd,to:Math.min(100,yd+y),kind:'pass',call:'Pass, '+y,sub:''};
    }
    if(Math.random()<.012*(.5+DA(3))) return {x,from:yd,to:yd+Math.round(Math.random()*3),kind:'to',call:'Fumble',sub:theirs};
    const y=Math.round(4.4+adv*1.5-(DA(2)-.5)*2.5+gauss()*3.4+(Math.random()<.05?15:0)); return {x,from:yd,to:Math.min(100,yd+y),kind:y<0?'loss':'run',call:y<0?'Stuffed, '+y:'Run, '+y,sub:''};
  }
  function info(){ MATCH.ddThem(st); }
  function step(){ if(st.over) return; if(!st.script&&MATCH.stopped()) return finish({kind:'clock'});
    const p=play(); if(p.kind==='end') return finish({kind:'clock'}); if(p.to>=100&&p.kind!=='to'&&p.kind!=='punt'){ p.to=100; p.via=p.kind; p.kind='td'; p.call='Touchdown'; }
    st.n++; MATCH[st.mine?'meTick':'cpuTick'](p.s!=null?p.s:p.kind==='inc'?5:Math.round(15+Math.random()*10),p);
    $('#call').innerHTML=`<div style="--cc:${COL[p.kind]}"><b>${p.call}</b>${p.sub?`<small>${p.sub}</small>`:''}</div>`;
    const t0=performance.now(), dur=fast?90:300; const grow=now=>{ if(st.over) return; const f=Math.min(1,(now-t0)/dur); frame(p,f); if(f<1) requestAnimationFrame(grow); else after(p); }; requestAnimationFrame(grow); }
  function after(p){
    let end=null; const g=p.to-p.from;
    if(p.kind==='td') end={kind:'td'}; else if(p.kind==='to') end={kind:'to',spot:p.to,call:p.call}; else if(p.kind==='punt') end={kind:'punt',spot:p.to,len:p.to-p.from};
    else if(p.kind==='fg') end={kind:p.good?'fg':'miss',spot:p.from,len:100-p.from+17};
    else if(p.kind==='safety') end={kind:'safety'};
    else { st.yd=p.to; if(g>=st.togo){ st.down=1; st.togo=Math.min(10,100-st.yd); } else { st.down++; st.togo-=g; if(st.down>4) end={kind:'downs',spot:st.yd}; } }
    timer=setTimeout(()=>{ if(st.over) return; $('#call').innerHTML='';
      if(end) return finish(end);
      const from=cam,to=st.yd,t0=performance.now(); const slide=now=>{ if(st.over) return; const f=Math.min(1,(now-t0)/(fast?80:240)); cam=from+(to-from)*(f*(2-f)); frame(null,0); if(f<1) requestAnimationFrame(slide); else { info(); timer=setTimeout(step,fast?60:180); } }; requestAnimationFrame(slide); },fast?160:620); }
  function finish(r){ st.over=true; clearTimeout(timer); r.n=st.n; r.yd=st.yd; frame(null,0); done(r); }
  function start(yd,off,cb,o){ clearTimeout(timer); opt0=o||{}; fast=!!opt0.fast; size(); st={off,yd,down:1,togo:Math.min(10,100-yd),n:0,over:false,mine:!!opt0.mine,def:opt0.def,script:opt0.script||null}; cam=yd; done=cb; info(); frame(null,0); timer=setTimeout(step,450); }
  addEventListener('resize',()=>{ size(); frame(null,0); });
  if(window.ResizeObserver) new ResizeObserver(()=>{ size(); frame(null,0); }).observe(cv);
  return {start,size,myD,skip(){ fast=true; },unskip(){ fast=false; },state(){ return st&&{yd:st.yd,down:st.down,togo:st.togo}; },redraw(){ frame(null,0); },stop(){ if(st) st.over=true; clearTimeout(timer); }};
}

/* ═══ THE GAME ═══
   Four five-minute quarters. You take the opening kick; they take the second half. Your drives you play snap by snap;
   theirs run on their own. The clock comes off each play; a touchdown is seven with the extra point. */
function makeMatch(){
  const M={};
  const ord=d=>['1st','2nd','3rd','4th'][d-1];
  const mine=yd=>yd===50?'the 50':yd<50?'your '+yd:'their '+(100-yd);
  const theirs=yd=>yd===50?'the 50':yd<50?'their '+yd:'your '+(100-yd);
  /* seven-minute quarters; a forty-second play clock between plays while the game clock runs */
  const QLEN=420, PLAYCLOCK=40, RUNOFF=6;
  /* WIN PROBABILITY, yours: the score, the time left, where the ball is and whose it is, and early on how the two teams
     compare. Level at the kick it's about even; a lead counts for more the less time there is to answer it. */
  const gsec=()=>Math.min(4,M.q-1)*QLEN+(QLEN-Math.max(0,M.clock));
  function wp(){ const left=M.q>4?0:Math.max(0,(4-M.q)*QLEN+M.clock), tl=left/(4*QLEN), diff=M.score[0]-M.score[1];
    if(left<=0) return diff>0?1:diff<0?0:.5;
    const fp=M.poss==='me'?(M.yd-50)/50*2.5+1.2:M.poss==='cpu'?-(((M.cyd||25)-50)/50*2.5+1.2):0, mine=((DR.got.length?DR.got.slice(0,5).reduce((a,p)=>a+((p&&p.r)||80),0)/Math.min(5,DR.got.length):80)+((DR.got[5]&&DR.got[5].r)||80))/2, theirs=((M.oppO||80)+((M.oppD&&M.oppD.r)||80))/2;
    const z=(diff+fp+(mine-theirs)/10*tl)/(1.2+11*Math.sqrt(tl)); return clamp(1/(1+Math.exp(-z*1.7)),.01,.99); }
  /* each drive as it goes: where it started, when, each play's yards, and the win probability when it began */
  function newDrive(me,yd){ M.drv={me,start:yd,t0:gsec(),plays:[],wp0:wp()}; }
  const mmss=s=>Math.floor(s/60)+':'+String(Math.round(s%60)).padStart(2,'0');
  function dsum(){ const d=M.drv; if(!d||!d.plays.length) return ''; const n=d.plays.length, yds=d.plays.reduce((a,p)=>a+p.y,0), dt=gsec()-d.t0, dw=Math.round((wp()-d.wp0)*100), mx=Math.max(8,...d.plays.map(p=>Math.abs(p.y)));
    const C={run:'var(--orange)',pass:'var(--sky)',inc:'var(--text3)',loss:'var(--red)',to:'var(--red)',td:'var(--green)'};
    return `<div class="ds"><div class="dg"><div><span class="lb">Plays</span><b>${n}</b></div><div><span class="lb">Yards</span><b>${yds}</b></div><div><span class="lb">Time</span><b>${mmss(dt)}</b></div><div><span class="lb">Per play</span><b>${(yds/n).toFixed(1)}</b></div></div>
      <div class="dch">${d.plays.map(p=>`<i style="height:${Math.max(6,Math.round(Math.abs(p.y)/mx*100))}%;background:${C[p.k]||'var(--text3)'}"></i>`).join('')}</div>
      <div class="dwp">Win probability <b style="color:${dw>0?'var(--green)':dw<0?'var(--red)':'var(--text2)'}">${dw>0?'+':''}${dw}%</b> on the drive</div></div>`; }
  const clk=()=>{ const s=Math.max(0,Math.ceil(M.clock)); return Math.floor(s/60)+':'+String(s%60).padStart(2,'0'); };
  function near(r){ const c=DEFS.slice().sort((a,b)=>Math.abs(a.r-r)-Math.abs(b.r-r)).slice(0,6); return c[Math.floor(Math.random()*c.length)]; }
  /* inside the app the game fills the screen, so the scoreboard carries the way back to the app's menu */
  const MENU=window.parent!==window?`<button class="menu" aria-label="Menu" onclick="parent.postMessage({gfl:'season-menu'},location.origin)"><i></i><i></i><i></i></button>`:'';
  /* set a box's markup only when it changed: rebuilding the scoreboard every second re-drew the crests, which flickered */
  const LEAVE=`<button class="lv" aria-label="Leave game" onclick="leaveGame()">✕</button>`;
  const setHTML=(el,h)=>{ if(el&&el._h!==h){ el._h=h; el.innerHTML=h; } };
  function clockOnly(){ const b=document.querySelector('#bug .clk b'); if(!b) return bug(); b.textContent=M.q>4?'0:00':clk(); b.className=M.run&&M.poss==='me'&&!M.stop?'run':''; }
  function bug(){ const b=(t,s,me)=>`<div class="tm${me?'':' r'}">${me?MENU+crest(t):''}<span class="sc">${s}</span>${M.poss===(me?'me':'cpu')?'<i class="pos"></i>':''}${me?'':crest(t)+LEAVE}</div>`;
    const w=wp(), wc=Math.round(w*20), ca=(KIT.o&&KIT.o.helmet&&KIT.o.helmet[1])||'#3f8fea', cb=(KIT.d&&KIT.d.helmet&&KIT.d.helmet[1])||'#c8233e';
    setHTML($('#bug'),`<div class="wp"><span class="lb">Win probability</span><span class="lb wv">${esc(ini(ME.name))} ${Math.round(w*100)}%</span><div class="wpb">${Array.from({length:20},(_,i)=>`<i style="background:${i<wc?ca:cb}"></i>`).join('')}</div></div>`+b(ME,M.score[0],1)+`<div class="clk"><span class="tag">${M.q>4?'Final':'Q'+M.q}</span><b class="${M.run&&M.poss==='me'&&!M.stop?'run':''}">${M.q>4?'0:00':clk()}</b></div>`+b(CPU,M.score[1],0)); clockOnly(); }
  const strip=(los,fd)=>{ const ca=(KIT.o&&KIT.o.helmet&&KIT.o.helmet[1])||'#3f8fea', cb=(KIT.d&&KIT.d.helmet&&KIT.d.helmet[1])||'#c8233e', P=y=>((10+y)/120*100).toFixed(1)+'%';
    return `<div class="fs2"><i class="ez" style="left:0;background:${ca}"></i><i class="ez" style="right:0;background:${cb}"></i>${[1,2,3,4,5,6,7,8,9].map(k=>`<i class="yl" style="left:${P(k*10)}"></i>`).join('')}<i class="los" style="left:${P(los)}"></i>${fd!=null&&fd<100?`<i class="fdm" style="left:${P(fd)}"></i>`:''}</div>`; };
  function ddMe(){ setHTML($('#dd'),`<span><b class="dn">${M.conv?'Two-point try':ord(M.down)+' <i class="amp">&amp;</i> '+(M.togo>=100-M.yd?'Goal':M.togo)}</b> ${mine(M.yd).replace(/^./,c=>c.toUpperCase())}</span>${M.run&&!M.stop?`<span class="dv pc">Play clock :${String(Math.max(0,Math.ceil(M.pc))).padStart(2,'0')}</span>`:`<span class="dv">${nflImg(M.oppD.n)}${M.oppD.season} ${esc(M.oppD.n)} · ${M.oppD.r}</span>`}`+strip(M.yd,M.yd+M.togo)); }
  function ddThem(st){ M.cyd=st.yd; $('#dd').innerHTML=`<span><b class="dn">${ord(st.down)} <i class="amp">&amp;</i> ${st.yd+st.togo>=100?'Goal':st.togo}</b> ${theirs(st.yd).replace(/^./,c=>c.toUpperCase())}</span><span class="dv">Their O ${M.oppO} v D ${SIM.myD()}</span>`+strip(100-st.yd,100-st.yd-st.togo); bug(); }
  function view(v){ const snap=v==='snap'; $('#fld').style.display=snap?'':'none'; $('#sim').style.display=snap?'none':''; $('#ctrl').style.display=snap?'':'none'; $('#drive').style.display=snap?'none':'';
    $('#res').className='result'; $('#call').innerHTML=''; $('#hint').style.display='none'; GAME.show(snap); if(!snap) SIM.size(); }
  function banner(o,cb,cb2){ if(M.simAll&&!o.keep){ setTimeout(cb,250); return; } const b=$('#ban'); b.innerHTML=`<div class="bx" style="--cc:${o.col||'var(--text)'}"><small>${o.tag}</small><b>${o.title}</b>${o.sub?`<span>${o.sub}</span>`:''}${o.drive?dsum():''}<button class="btn w">${o.btn}</button>${o.btn2?`<button class="btn b2">${o.btn2}</button>`:''}</div>`;
    b.className='banner show'; $('#ctrl').classList.add('lock'); $('#drive').classList.add('lock');
    const close=()=>{ b.className='banner'; $('#ctrl').classList.remove('lock'); $('#drive').classList.remove('lock'); };
    b.querySelector('button').onclick=()=>{ close(); cb(); }; const b2=b.querySelector('.b2'); if(b2) b2.onclick=()=>{ close(); cb2(); }; }
  function tick(s){ if(M.stop) return; const before=M.clock; M.clock-=s;
    /* the two-minute warning, in the second and fourth quarters */
    if((M.q===2||M.q===4)&&before>120&&M.clock<=120&&!M.warn[M.q]){ M.warn[M.q]=1; M.twoMin=true; }
    if(M.clock<=0){ if(M.q===2||M.q===4){ M.clock=0; M.stop=true; } else { M.q++; M.clock=QLEN; M.run=false; M.toast='End of the '+(M.q===2?'1st':'3rd')+' quarter'; } }
    const sec=Math.ceil(M.clock); if(sec!==M.shown){ M.shown=sec; clockOnly(); if(M.poss==='me') ddMe(); } }
  /* run what comes next, unless the half or the game has run out */
  function after(fn){ if(M.stop) return endPeriod(); fn(); if(M.toast){ toast(M.toast); M.toast=null; } }
  function hurtNotice(p,inj,sub){ setTimeout(()=>{ let el=$('#hurtn'); if(!el){ el=document.createElement('div'); el.id='hurtn'; $('#scr-game').appendChild(el); }
    el.className='hurtn show'; el.innerHTML=`<div class="hn-bx"><span class="tag">Injury</span>${isBackup(p)?'':`<img src="${SHOT(p.id)}" alt="">`}<b>${esc(p.n)} is hurt</b><em>${esc(inj.n)}</em><span class="hn-sub">${esc(sub.n)} comes in</span><button class="btn w" id="hn-ok" disabled>3</button></div>`;
    let n=3; const b=$('#hn-ok'), tk=setInterval(()=>{ n--; if(n>0) b.textContent=n; else { clearInterval(tk); b.disabled=false; b.textContent='Continue'; } },1000);
    b.onclick=()=>{ el.className='hurtn'; }; },450); }
  function toast(s){ const t=$('#toast'); t.textContent=s; t.className='toast show'; clearTimeout(toast.t); toast.t=setTimeout(()=>t.className='toast',2200); }
  function endPeriod(){
    M.pend=null; M.run=false; if(M.pvp) return pvpEndPeriod();
    if(M.q===2){ M.q=3; M.clock=QLEN; M.stop=false; M.tos=3; bug();
      return banner({art:'kick',tag:'Halftime',title:`${M.score[0]} – ${M.score[1]}`,sub:`They get the ball to start the second half.`,btn:'Second half'},()=>cpuDrive(25)); }
    M.q=5; bug(); final(); }
  function driveBar(mine){ $('#drive').innerHTML=`<span class="tb">${crest(mine?ME:CPU)}<span>${mine?'Your ball':'Their ball'}${M.simAll?' · simming':''}</span></span>${M.pvp?'<button class="btn" id="skip">Skip ahead</button>':M.simAll?'<button class="btn simall" id="simstop">Stop sim</button>':'<button class="btn" id="skip">Skip ahead</button><button class="btn simall" id="simall">Sim the rest</button>'}`;
    const sk=$('#skip'); if(sk) sk.onclick=()=>{ SIM.skip(); sk.disabled=true; };
    const sa=$('#simall'); if(sa) sa.onclick=()=>banner({tag:'Sim the rest',title:'Sim the rest of the game?',sub:'Every drive plays out on its own, yours too. You can stop it any time.',col:'var(--red)',btn:'Sim it',btn2:'Keep playing'},()=>{ M.simAll=true; SIM.skip(); driveBar(M.poss==='me'); },()=>{});
    const st=$('#simstop'); if(st) st.onclick=stopSim; }
  function stopSim(){ if(!M.simAll) return; M.simAll=false;
    if(M.poss==='me'){ const q=SIM.state(); SIM.stop(); if(q){ M.yd=q.yd; M.down=q.down; M.togo=q.togo; } M.run=false; bug(); view('snap'); GAME.sit(M.yd,M.down,M.togo,0); ddMe(); toast('Your ball: you\'re back in'); }
    else { SIM.unskip(); driveBar(false); toast('Sim stopped: your next drive is yours'); } }
  /* your drive, simulated: your five against their defense, the same way theirs are */
  function mySimDrive(yd){ newDrive(true,yd); M.poss='me'; M.run=false; M.yd=yd; bug(); view('sim'); driveBar(true);
    const L=M.lineup&&M.lineup.length?M.lineup:DR.got.slice(0,5), off=Math.round(L.reduce((a,p)=>a+((p&&p.r)||75),0)/L.length);
    SIM.start(yd,off,r=>{ const go=(o,next)=>banner(o,()=>after(next));
      if(r.kind==='td'){ const ok=Math.random()<.96; M.score[0]+=6+(ok?1:0); bug(); go({tag:'Touchdown',title:'Touchdown',sub:r.n+' plays.',col:'var(--green)',btn:'Kick off'},()=>cpuDrive(25)); }
      else if(r.kind==='fg'){ M.score[0]+=3; bug(); go({tag:'Field goal',title:'It\'s good',sub:r.len+' yards.',col:'var(--green)',btn:'Kick off'},()=>cpuDrive(25)); }
      else if(r.kind==='miss'){ go({tag:'Field goal',title:'No good',sub:'From '+r.len+'.',col:'var(--red)',btn:'Their ball'},()=>cpuDrive(Math.max(20,100-r.spot))); }
      else if(r.kind==='punt'){ go({tag:'Punt',title:'You punt',sub:r.len+' yards.',btn:'Their ball'},()=>cpuDrive(r.spot>=100?20:Math.max(1,100-r.spot))); }
      else if(r.kind==='to'||r.kind==='downs'){ go({tag:'Turnover',title:r.kind==='downs'?'Turnover on downs':r.call||'Turnover',sub:'Their ball.',col:'var(--red)',btn:'Their ball'},()=>cpuDrive(clamp(100-r.spot,1,99))); }
      else endPeriod(); },{mine:true,def:M.oppD,fast:true}); }
  function myDrive(yd){ if(M.pvp){ M.pvp.mine=true; M.pvp.plays=[]; M.pvp.start=yd; M.pvp.lastG=gsec(); } else if(M.simAll) return mySimDrive(yd); newDrive(true,yd); M.poss='me'; M.run=false; M.yd=yd; M.down=1; M.togo=Math.min(10,100-yd); bug(); view('snap'); GAME.sit(M.yd,M.down,M.togo,0); ddMe(); }
  const oppR=r=>r==='a'?'b':'a';
  function pvpRec(p){ const g=gsec(); p.s=Math.max(4,Math.round(g-M.pvp.lastG)); M.pvp.lastG=g; M.pvp.plays.push(p); }
  function pvpState(a){ const P=M.pvp; if(!a){ M.score=[0,0]; M.q=1; M.clock=QLEN; } else { M.score=[a.score[P.role]||0,a.score[oppR(P.role)]||0]; M.q=a.q; M.clock=a.clock; } M.stop=false; M.shown=null; bug(); }
  function pvpSend(next,nextYd,flags){ const P=M.pvp; if(!P||!P.mine) return Promise.resolve(); P.mine=false;
    const rec={k:Date.now().toString(36)+Math.random().toString(36).slice(2,6),by:P.role,start:P.start,plays:P.plays,next,nextYd,after:{score:{[P.role]:M.score[0],[oppR(P.role)]:M.score[1]},q:M.q,clock:M.clock},st:M.st,ps:M.ps,done:!!(flags&&flags.done)};
    const go=()=>pvpAppend(P.id,rec).then(doc=>{ P.doc=doc; P.idx=doc.drives.length; pvpSeen(P.id,P.idx); }).catch(()=>{ toast('Couldn\u2019t send your drive · trying again'); return new Promise(res=>setTimeout(res,5000)).then(go); });
    return go(); }
  function pvpTheirs(yd){ M.poss='cpu'; bug(); const P=M.pvp; if(P.mine) pvpSend(oppR(P.role),yd).then(()=>pvpWait()); else pvpWait(); }
  function pvpWait(){ const P=M.pvp; if(!P) return; clearTimeout(P.pollT); P.waitT0=Date.now(); M.poss='cpu'; bug(); view('sim'); SIM.redraw();
    $('#drive').innerHTML=`<span class="tb">${crest(CPU)}<span>Their move</span></span><button class="btn" id="pv-leave">Leave</button>`;
    $('#pv-leave').onclick=()=>{ P.left=true; clearTimeout(P.pollT); pvpHub(); };
    $('#dd').innerHTML='<span><b class="dn">Their ball</b></span>'; $('#call').innerHTML=`<div style="--cc:var(--text3)"><b>Waiting for ${esc(CPU.name)}</b></div>`;
    const poll=async()=>{ if(M.pvp!==P||P.left) return; let doc=null; try{ doc=await pvpLoad(P.id); }catch(e){}
      if(doc&&doc.drives.length>P.idx){ P.doc=doc; $('#call').innerHTML=''; return pvpPump(); }
      const age=(Date.now()-P.waitT0)/1000; if(age>1800){ $('#call').innerHTML=`<div style="--cc:var(--text3)"><b>Still their move</b></div>`; $('#drive').insertAdjacentHTML('beforeend','<button class="btn w" id="pv-again">Check again</button>'); $('#pv-again').onclick=()=>pvpWait(); return; }
      P.pollT=setTimeout(poll,age<120?15000:age<600?30000:60000); };
    P.pollT=setTimeout(poll,3000); }
  function pvpPump(){ const P=M.pvp, D=P.doc.drives;
    while(P.idx<D.length&&D[P.idx].by===P.role){ const d=D[P.idx]; pvpState(d.after); if(d.st) M.st=d.st; if(d.ps) M.ps=d.ps; P.idx++; pvpSeen(P.id,P.idx); }
    if(P.idx<D.length) return pvpReplay(D[P.idx]);
    const last=D[D.length-1];
    if(P.doc.status==='done'||(last&&last.done)){ M.q=5; bug(); return final(); }
    if(P.doc.next===P.role){ const yd=last?last.nextYd:25; return banner({art:'kick',tag:'Head to head',title:'Your ball',sub:`On ${mine(yd)}.`,btn:'Take the field'},()=>myDrive(yd)); }
    pvpWait(); }
  function pvpReplay(d){ const P=M.pvp, b0=[...M.score]; M.poss='cpu'; M.cyd=d.start; newDrive(false,d.start); bug(); view('sim'); driveBar(false);
    SIM.start(d.start,M.oppO,r=>{ M.opp.drives++; P.idx++; pvpSeen(P.id,P.idx); pvpState(d.after); const them=M.score[1]-b0[1], us=M.score[0]-b0[0];
      const t=them>=6?{art:'td_them',title:'Touchdown',sub:them===8?'Two-point try good.':them===7?'Extra point good.':'No extra point.',col:'var(--red)'}:them===3?{art:'fg',title:'Field goal',sub:'Good.',col:'var(--yellow)'}
        :us===2?{art:'safety',title:'Safety',sub:'Two points to you.',col:'var(--green)'}:r.kind==='punt'?{art:'punt',title:'They punt',sub:''}:r.kind==='to'?{art:r.call==='Fumble'?'fumble_us':'int_us',title:r.call==='Fumble'?'Fumble':'Intercepted',sub:'',col:'var(--green)'}
        :r.kind==='downs'?{art:'downs_us',title:'Turnover on downs',sub:'',col:'var(--green)'}:r.kind==='miss'?{art:'nofg',title:'Missed field goal',sub:'',col:'var(--green)'}:{art:'kick',title:d.done?'That\u2019s the game':'End of the half',sub:''};
      if(M.q===3&&M.clock===QLEN&&!d.done) t.sub=(t.sub?t.sub+' ':'')+'Halftime.';   /* their drive ran out the half */
      banner(Object.assign({drive:1,tag:'Their drive',btn:'Continue'},t),()=>pvpPump()); },{script:d.plays.map(p=>Object.assign({},p))}); }
  function pvpEndPeriod(){ const P=M.pvp;
    if(M.q===2){ M.q=3; M.clock=QLEN; M.stop=false; M.tos=3; bug(); const rcv='b';   /* the side that didn't have the ball first */
      if(P.mine) pvpSend(rcv,25);
      return banner({art:'kick',tag:'Halftime',title:`${M.score[0]} – ${M.score[1]}`,sub:rcv===P.role?'You get the ball to start the second half.':'They get the ball to start the second half.',btn:'Second half'},()=>{ if(rcv===P.role) myDrive(25); else pvpWait(); }); }
    M.q=5; bug(); if(P.mine) pvpSend(oppR(P.role),25,{done:true}); final(); }
  function cpuDrive(yd){ if(M.pvp) return pvpTheirs(yd); if(M.simAll) setTimeout(()=>SIM.skip(),0); M.cyd=yd; M.poss='cpu'; newDrive(false,yd); bug(); view('sim'); driveBar(false);
    SIM.start(yd,M.oppO,r=>{ M.opp.drives++;
      const go=(o,next)=>banner(o,()=>after(next));
      if(r.kind==='td'){ const d=M.score[1]+6-M.score[0], two=[-2,-5,1,5,-9].includes(d)&&M.q>=3||Math.random()<.06, ok=two?Math.random()<.48:Math.random()<.96; M.score[1]+=6+(ok?(two?2:1):0); bug();
        go({art:'td_them',drive:1,tag:'They score',title:'Touchdown',sub:`${r.n} plays. ${two?(ok?'Two-point try good.':'Two-point try stopped.'):(ok?'Extra point good.':'Extra point missed.')} Your ball on your 25.`,col:'var(--red)',btn:'Your ball'},()=>myDrive(25)); }
      else if(r.kind==='fg'){ M.score[1]+=3; bug(); go({art:'fg',drive:1,tag:'They score',title:'Field goal',sub:`${r.len} yards, good. Your ball on your 25.`,col:'var(--yellow)',btn:'Your ball'},()=>myDrive(25)); }
      else if(r.kind==='miss'){ const yd=Math.max(20,100-r.spot); go({art:'nofg',drive:1,tag:'No good',title:'Missed field goal',sub:`From ${r.len}. Your ball on ${mine(yd)}.`,col:'var(--green)',btn:'Your ball'},()=>myDrive(yd)); }
      else if(r.kind==='punt'){ const yd=r.spot>=100?20:Math.max(1,100-r.spot); go({art:'punt',drive:1,tag:'Punt',title:'They punt',sub:`${r.spot>=100?'Into the end zone, touchback':r.len+' yards'}. Your ball on ${mine(yd)}.`,btn:'Your ball'},()=>myDrive(yd)); }
      else if(r.kind==='to'){ const yd=clamp(100-r.spot,1,99); go({art:r.call==='Fumble'?'fumble_us':'int_us',drive:1,tag:'Turnover',title:r.call==='Fumble'?'Fumble':'Intercepted',sub:`Your D/ST takes it away. Your ball on ${mine(yd)}.`,col:'var(--green)',btn:'Your ball'},()=>myDrive(yd)); }
      else if(r.kind==='downs'){ const yd=clamp(100-r.spot,1,99); go({art:'downs_us',drive:1,tag:'Stopped',title:'Turnover on downs',sub:`Your ball on ${mine(yd)}.`,col:'var(--green)',btn:'Your ball'},()=>myDrive(yd)); }
      else endPeriod(); }); }
  return {
    /* o: the opponent this week (the team, its defense, its offense rating, whether you're at home, the round, and whether it has to have a winner) */
    start(o){ M.pvp=null; Object.assign(M,{simAll:false,q:1,clock:QLEN,score:[0,0],poss:null,yd:25,down:1,togo:10,stop:false,pend:null,toast:null,run:false,pc:PLAYCLOCK,tos:3,warn:{},twoMin:false,shown:null,
        st:{att:0,comp:0,py:0,ptd:0,int:0,ra:0,ry:0,rtd:0,sk:0},opp:{plays:0,yds:0,py:0,ry:0,tdP:0,tdR:0,drives:0},
        ps:[0,1,2,3,4].map(()=>({att:0,comp:0,py:0,ptd:0,int:0,sk:0,car:0,ry:0,rushtd:0,tgt:0,rec:0,recy:0,rtd:0,long:0,fum:0})),dst:{sk:0,int:0,fum:0}});
      M.mustWin=!!(o&&o.mustWin); M.ot=false;
      /* the five on the field are always the five you have now (the hub, a re-spin, a reload or a quick game in between can't leave an old lineup in the engine) */
      M.lineup=((o&&o.lineup)||DR.got||[]).slice(0,5); M.hurt=[]; M.subLog=[]; if(M.lineup.length===5&&M.lineup.every(Boolean)) GAME.roster(M.lineup);
      if(o){ M.oppO=o.off; M.oppD=o.dst; } else { M.oppO=76+Math.floor(Math.random()*14); M.oppD=near(76+Math.random()*14); }
      GAME.setD(M.oppD); GAME.setHome(Object.assign(o&&!o.home?{name:CPU.name,k:'d',logo:CPU.logo}:{name:ME.name,k:'o',logo:ME.logo},{event:(o&&o.event)||null,time:(o&&o.time)||['day','dusk','night'][Math.floor(Math.random()*3)],snow:!!(o&&o.snow),rain:!!(o&&o.rain)})); bug(); view('snap');
      if(o&&o.pvp){ const D=o.pvp.doc.drives, seen=Math.min(pvpSeenGet(o.pvp.id),D.length); M.pvp=Object.assign({idx:seen,mine:false,plays:[],lastG:0},o.pvp);
        pvpState(seen?D[seen-1].after:null); for(let i=seen-1;i>=0;i--){ if(D[i].by===o.pvp.role){ if(D[i].st) M.st=D[i].st; if(D[i].ps) M.ps=D[i].ps; break; } } return pvpPump(); }
      banner({art:'kick',tag:o?o.label+' · Kickoff':'Kickoff',title:`${esc(ME.name)} receive`,sub:`${o?(o.home?'At home against ':'Away at '):'Against '}${esc(CPU.name)} and the ${M.oppD.season} ${esc(M.oppD.n)} defense. Touchback: your ball on your 25.`,btn:'Take the field'},()=>myDrive(25)); },
    played(r){ const S=GAME.S, y=r.yards||0, ps=M.ps, Q=ps[0];
      if(M.pvp&&M.pvp.mine&&!M.conv){ const k=r.kind==='td'?'td':r.kind==='to'?'to':r.kind==='safety'?'safety':r.kind==='inc'?'inc':y<0?'loss':(S&&S.thrown?'pass':'run');
        const thrown=!!(S&&S.thrown), runC=!!(S&&S.runCall), body=String(r.body||'').replace(/\s+/g,' ').trim().slice(0,90);
        const call=k==='td'?(thrown?'Touchdown pass':'Touchdown run'):k==='inc'?'Incomplete pass':k==='to'?(r.head||(thrown?'Intercepted':'Fumble')):k==='safety'?'Safety'
          :k==='loss'?(thrown?'Pass, '+y:runC||(S&&S.carrier&&S.carrier!==S.QB)?'Run, '+y:'Sacked, '+y):(k==='pass'?'Pass, ':'Run, ')+(y===0?'no gain':y);
        pvpRec({from:M.yd,to:r.kind==='to'?clamp(M.yd+Math.round(r.at?r.at.y:0),0,100):k==='td'?100:clamp(M.yd+(k==='inc'?0:y),0,100),kind:k,call,sub:body}); }
      if(M.conv){ M.conv=false; const good=r.kind==='td'; if(good) M.score[0]+=2; bug();
        M.pend=()=>banner({tag:'Two-point try',title:good?'Good':'No good',sub:good?'Eight points on the drive.':'Stopped short. Six it is.',col:good?'var(--green)':'var(--red)',btn:'Kick off'},()=>after(()=>cpuDrive(25))); return; }
      if(r.injury&&typeof rollInjury==='function'){ const i=r.injury.ri, p=M.lineup&&M.lineup[i];
        if(p){ const inj=rollInjury(r.injury.big), out=injOut(inj.w), season=!M.pvp&&typeof LG!=='undefined'&&LG&&!(typeof QUICK!=='undefined'&&QUICK);
          if(season&&!isBackup(p)){ hurt(p,inj); p.sta=Math.round(GAME.stamina()[i]); }
          const sub=subFor(p.pos,M.lineup,season?LG.teams[0]:null); MATCH.subSlot(i,sub); M.hurt.push({n:p.n,inj:inj.n,out});
          r.body+=' '+lastN(p.n)+' is hurt ('+inj.n.toLowerCase()+'). '+sub.n+' comes in.'; hurtNotice(p,inj,sub); } }
      /* each player's line */
      if(S.thrown||r.head==='Thrown away'){ Q.att++; if(S.tgt&&S.tgt.slot!=null) ps[S.tgt.slot].tgt++;
        if(S.caught&&S.catcher){ const R=ps[S.catcher.slot]; Q.comp++; Q.py+=y; R.rec++; R.recy+=y; R.long=Math.max(R.long,y); if(r.kind==='td'){ Q.ptd++; R.rtd++; } if(r.kind==='to') R.fum++; }
        if(r.head==='Intercepted') Q.int++; }
      else if(!S.carrier){ if(r.head==='Sacked'||r.head==='Strip sack'||r.kind==='safety'){ Q.sk++; if(r.kind==='to') Q.fum++; } }
      else { const C=ps[S.carrier.slot]; C.car++; C.ry+=r.kind==='safety'?-M.yd:y; if(r.kind==='td') C.rushtd++; if(r.kind==='to') C.fum++; }
      if(S.thrown||r.head==='Thrown away'){ M.st.att++; if(S.caught){ M.st.comp++; M.st.py+=y; if(r.kind==='td') M.st.ptd++; } if(r.kind==='to') M.st.int++; }
      else if(!S.carrier) M.st.sk++;
      else { M.st.ra++; M.st.ry+=r.kind==='safety'?-M.yd:y; if(r.kind==='td') M.st.rtd++; }
      if(M.drv) M.drv.plays.push({y:r.kind==='inc'||r.kind==='to'?0:y,k:r.kind==='td'?'td':r.kind==='to'?'to':(S.thrown||r.head==='Thrown away')?(S.caught?'pass':'inc'):S.carrier?(y<0?'loss':'run'):'loss'});
      M.run=(r.kind==='gain'||r.kind==='loss')&&r.head!=='Out of bounds'&&r.head!=='Thrown away'; M.pc=PLAYCLOCK;
      if(M.twoMin){ M.twoMin=false; M.run=false; M.toast='Two-minute warning'; }
      if(r.kind==='td'){ M.score[0]+=6; bug(); M.pend=()=>banner({art:'td',drive:1,tag:'Touchdown',title:'Touchdown',sub:r.body,col:'var(--green)',btn:'Kick the extra point · 96%',btn2:'Go for two'},
        ()=>{ const good=Math.random()<.96; if(good) M.score[0]+=1; bug(); banner({tag:'Extra point',title:good?'It\'s good':'No good',sub:good?'Seven points on the drive.':'Wide. Six it is.',col:good?'var(--green)':'var(--red)',btn:'Kick off'},()=>after(()=>cpuDrive(25))); },
        ()=>{ M.conv=true; M.run=false; M.yd=98; M.down=1; M.togo=2; bug(); view('snap'); GAME.sit(98,1,2,0); ddMe(); }); }
      else if(r.kind==='to'){ const abs=M.yd+Math.round(r.at?r.at.y:0), yd=abs>=100?20:clamp(100-abs,1,99); M.pend=()=>banner({art:r.head==='Intercepted'?'int':r.head==='Strip sack'?'strip':'fumble',drive:1,tag:'Turnover',title:r.head==='Intercepted'?'Intercepted':r.head==='Strip sack'?'Strip sack':'Fumble',sub:`Their ball on ${theirs(yd)}.`,col:'var(--red)',btn:'Their ball'},()=>after(()=>cpuDrive(yd))); }
      else if(r.kind==='safety'){ M.score[1]+=2; bug(); M.pend=()=>banner({art:'safety',drive:1,tag:'Safety',title:'Safety',sub:'Two points to them, and you kick it to them.',col:'var(--red)',btn:'Their ball'},()=>after(()=>cpuDrive(35))); }
      else { const g=r.kind==='inc'?0:y; M.yd=clamp(M.yd+g,1,99);
        if(g>=M.togo){ M.down=1; M.togo=Math.min(10,100-M.yd); } else { M.down++; M.togo-=g; }
        if(M.down>4){ const yd=100-M.yd; M.pend=()=>banner({art:'downs',drive:1,tag:'Turnover on downs',title:'Short',sub:`Their ball on ${theirs(yd)}.`,col:'var(--red)',btn:'Their ball'},()=>after(()=>cpuDrive(yd))); }
        else M.pend=()=>after(()=>{ GAME.regroup(M.yd,M.down,M.togo); ddMe(); }); }
      ddMe(); bug(); },
    next(){ if(M.pend){ const p=M.pend; M.pend=null; p(); } },
    punt(){ const net=Math.round(42+gauss()*5), land=M.yd+net, yd=land>=100?20:100-land; M.run=false; tick(10);
      if(M.pvp&&M.pvp.mine) pvpRec({from:M.yd,to:Math.min(100,land),kind:'punt',call:'Punt',sub:net+' yards'});
      banner({art:'punt',drive:1,tag:'Punt',title:`${net}-yard punt`,sub:land>=100?'Into the end zone: touchback. Their ball on their 20.':`Their ball on ${theirs(yd)}.`,btn:'Their ball'},()=>after(()=>cpuDrive(yd))); },
    kick(dist){ const good=Math.random()<fgOdds(dist); M.run=false; tick(6);
      if(M.pvp&&M.pvp.mine) pvpRec({from:M.yd,to:M.yd,kind:'fg',good,call:good?'Field goal good':'No good',sub:dist+' yards'});
      if(good){ M.score[0]+=3; bug(); banner({art:'fg',drive:1,tag:'Field goal',title:'It\'s good',sub:`${dist} yards. Three points.`,col:'var(--green)',btn:'Kick off'},()=>after(()=>cpuDrive(25))); }
      else { const yd=Math.max(20,100-M.yd); banner({art:'nofg',drive:1,tag:'Field goal',title:'No good',sub:`${dist} yards, wide. Their ball on ${theirs(yd)}.`,col:'var(--red)',btn:'Their ball'},()=>after(()=>cpuDrive(yd))); } },
    meTick(s,p){ const ps=M.ps, Q=ps[0], y=p.to-p.from, pick=()=>{ const w=[0,.18,.3,.3,.22], R=Math.random()*1; let a=0; for(let i=1;i<5;i++){ a+=w[i]; if(R<a) return i; } return 2; };
      if(M.drv&&p.kind!=='punt'&&p.kind!=='fg') M.drv.plays.push({y:p.kind==='to'||p.kind==='inc'?0:y,k:p.kind==='td'?'td':p.kind==='loss'?'loss':p.kind});
      if(p.kind==='pass'||(p.kind==='td'&&p.via==='pass')){ const i=pick(); Q.att++; Q.comp++; Q.py+=y; ps[i].tgt++; ps[i].rec++; ps[i].recy+=y; ps[i].long=Math.max(ps[i].long,y); M.st.att++; M.st.comp++; M.st.py+=y; if(p.kind==='td'){ Q.ptd++; ps[i].rtd++; M.st.ptd++; } }
      else if(p.kind==='inc'){ const i=pick(); Q.att++; ps[i].tgt++; M.st.att++; }
      else if(p.kind==='loss'&&p.call==='Sacked'){ Q.sk++; M.st.sk++; }
      else if(p.kind==='to'){ if(p.call==='Fumble'){ ps[1].fum++; } else { Q.att++; Q.int++; M.st.att++; M.st.int++; } }
      else if(p.kind==='run'||p.kind==='loss'||(p.kind==='td'&&p.via!=='pass')){ const i=Math.random()<.82?1:0; ps[i].car++; ps[i].ry+=y; M.st.ra++; M.st.ry+=y; if(p.kind==='td'){ ps[i].rushtd++; M.st.rtd++; } }
      tick(s); },
    cpuTick(s,p){ M.opp.plays++; if(M.drv&&p.kind!=='punt'&&p.kind!=='fg') M.drv.plays.push({y:p.kind==='to'||p.kind==='inc'?0:p.to-p.from,k:p.kind==='pass'||p.kind==='inc'||p.kind==='run'||p.kind==='loss'||p.kind==='td'||p.kind==='to'?p.kind:'run'}); if(p.call==='Sacked') M.dst.sk++; if(p.kind==='to') M.dst[p.call==='Fumble'?'fum':'int']++; if(p.kind!=='punt'&&p.kind!=='fg'&&p.kind!=='to'){ const g=p.to-p.from, pass=p.kind==='pass'||p.kind==='inc'||p.call==='Sacked'||(p.kind==='td'&&p.via==='pass'); M.opp.yds+=g; if(pass) M.opp.py+=g; else M.opp.ry+=g; }
      if(p.kind==='td') M.opp[p.via==='pass'?'tdP':'tdR']++; tick(s); },
    stopped(){ return M.stop; },
    /* the clock runs during a play, in game time */
    liveTick(dt){ if(M.poss==='me') tick(dt); },
    /* and between plays while it's running: six game seconds for every real one, until the play clock is used up */
    preTick(dt){ if(M.poss!=='me'||!M.run||M.stop||$('#ban').classList.contains('show')) return;
      const g=Math.min(dt*RUNOFF,M.pc), q=M.q; M.pc-=g; tick(g);
      if(M.twoMin){ M.twoMin=false; M.run=false; toast('Two-minute warning'); }
      if(M.q!==q){ M.run=false; if(M.toast){ toast(M.toast); M.toast=null; } }
      if(M.stop){ M.run=false; return endPeriod(); }
      if(M.pc<=0) M.run=false;
      if(!M.run){ ddMe(); bug(); GAME.refresh(); } },
    clockUI(){ return {run:M.run&&M.poss==='me'&&!M.stop, tos:M.tos, canSpike:M.run&&M.down<4&&!M.stop}; },
    timeout(){ if(!(M.poss==='me'&&M.run&&M.tos>0&&!M.stop)) return; M.tos--; M.run=false; toast('Timeout · '+M.tos+' left'); ddMe(); bug(); GAME.refresh(); },
    spike(){ if(!(M.poss==='me'&&M.run&&M.down<4&&!M.stop)) return; tick(1); M.run=false; M.down++; M.ps[0].att++; M.st.att++; toast('Spiked: the clock stops');
      if(M.stop) return endPeriod(); GAME.sit(M.yd,M.down,M.togo); ddMe(); bug(); },
    ddThem, M,
    subSlot(i,p){ const out=M.lineup[i], s=M.ps[i]; if(out&&Object.values(s).some(v=>v)) (M.subLog=M.subLog||[]).push({p:out,s:{...s}});
      M.ps[i]={att:0,comp:0,py:0,ptd:0,int:0,sk:0,car:0,ry:0,rushtd:0,tgt:0,rec:0,recy:0,rtd:0,long:0,fum:0}; M.lineup[i]=p; GAME.sub(i,p); } };
  function final(){
    /* a playoff game can't end level: overtime, and a field goal wins it */
    if(M.mustWin&&M.score[0]===M.score[1]){ const w=Math.random()<.5+((DR.got.slice(0,5).reduce((s,p)=>s+p.r,0)/5)-M.oppO)/60?0:1; M.score[w]+=3; M.ot=true; bug(); }
    const [a,b]=M.score, res=(a>b?'You win':a<b?'You lose':'A tie')+(M.ot?' in overtime':''), col=a>b?'var(--gold)':a<b?'var(--red)':'var(--text2)', s=M.st;
    screen('final');
    $('#scr-final').innerHTML=`<div class="champ" style="--fc:${col}"><div class="fade"><div class="dots"></div></div>
      <span class="tag" style="position:relative;color:${col}">Final</span><h3>${res}</h3>
      <div class="fs"><div>${crest(ME)}<b>${a}</b><span>${esc(ME.name)}</span></div><div>${crest(CPU)}<b>${b}</b><span>${esc(CPU.name)}</span></div></div>
      <div class="box">
        <div><span class="tag">Passing</span><b>${s.comp}/${s.att}, ${s.py} yds</b><span>${s.ptd} TD · ${s.int} INT · ${s.sk} sacked</span></div>
        <div><span class="tag">Rushing</span><b>${s.ra} for ${s.ry} yds</b><span>${s.rtd} TD</span></div>
        <div><span class="tag">Their offense</span><b>${M.opp.plays} plays, ${M.opp.yds} yds</b><span>${M.opp.drives} drive${M.opp.drives===1?'':'s'} against your ${DR.got[5]?esc(DR.got[5].n):''} D</span></div>
      </div>
      <div class="tag" style="position:relative;align-self:flex-start;margin-top:4px">Box score</div>
      <div class="pbox">${[...(M.lineup&&M.lineup.length===5?M.lineup:DR.got.slice(0,5)),DR.got[5]].filter(Boolean).map((p,i)=>{ const s=i<5?M.ps[i]:null, d=M.dst; let a='',b='';
        if(p.pos==='QB'){ a=`${s.comp}/${s.att} · ${s.py} yds · ${s.ptd} TD · ${s.int} INT`; b=`${s.sk} sacked · ${s.car} rushes, ${s.ry} yds${s.rushtd?' · '+s.rushtd+' TD':''}${s.fum?' · '+s.fum+' fumble':''}`; }
        else if(p.pos==='RB'){ a=`${s.car} carries · ${s.ry} yds · ${s.rushtd} TD`; b=`${s.rec} catches · ${s.recy} yds${s.fum?' · '+s.fum+' fumble':''}`; }
        else if(p.pos==='D/ST'){ a=`${d.sk} sacks · ${d.int} INT · ${d.fum} fumbles`; b=`${M.score[1]} points · ${M.opp.yds} yds allowed`; }
        else { a=`${s.rec} of ${s.tgt} · ${s.recy} yds · ${s.rtd} TD`; b=s.rec?`long ${s.long}${s.fum?' · '+s.fum+' fumble':''}`:'no catches'; }
        return `<div class="t-${TIER(p)}">${p.pos==='D/ST'?nflImg(p.n):String(p.id).startsWith('bk-')?'<span class="ini">B</span>':`<img src="${SHOT(p.id)}" alt="">`}<span><b>${esc(p.n)}</b><em>${p.pos}${p.season?' · '+p.season:''} · ${p.r}</em><i>${a}</i><i>${b}</i></span></div>`; }).join('')}</div>
      ${typeof shareButton==='function'?shareButton('game','Share this result'):''}<button class="btn w" id="again">${typeof QUICK!=='undefined'&&QUICK?(localStorage.getItem('gfl-season-v1')?'Back to the season':'Play again'):typeof LG!=='undefined'&&LG?'Back to the season':'Play again'}</button></div>`;
    if(typeof shareWarm==='function') setTimeout(()=>shareWarm('game','g'+Date.now(),()=>cardGame(gameShareData(M))),0);
    /* a quick game goes in no book; a season game does */
    if(M.pvp){ $('#again').textContent='Back to your games'; $('#again').onclick=()=>pvpHub(); return; }
    if(typeof QUICK!=='undefined'&&QUICK) $('#again').onclick=()=>quickDone();
    else if(typeof LG!=='undefined'&&LG){ seasonFinal(M); $('#again').onclick=()=>seasonContinue(); }
    else $('#again').onclick=()=>{ DR.i=0; DR.got=[]; screen('match'); };
  }
}
