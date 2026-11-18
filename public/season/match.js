/* ═══ THE DRAFT ═══
   Six slots. Spin a carousel of packs, open the one it lands on, take one of four players of that tier. The overalls
   stay hidden until you take one; then all four turn over, so you see what you passed on. */
const SLOTS=['QB','RB','WR','WR','TE','D/ST'], ODDS=[['legend',25],['gold',25],['silver',25],['bronze',25]];
const roll=()=>{ let r=Math.random()*100; for(const [t,p] of ODDS){ if((r-=p)<0) return t; } return 'bronze'; };
const DR={i:0,got:[]};
const packHTML=(t,big)=>`<div class="pk t-${t}${big?' big':''}"><div class="dots"></div><div class="band"></div><b>GFL</b><span>${t}</span></div>`;
function four(pos,tier){
  const used=new Set(DR.got.map(g=>g&&g.id));
  if(pos==='D/ST') return DEFS.filter(d=>TIER(d.r)===tier).sort(()=>Math.random()-.5).slice(0,4).map(d=>({id:'d'+d.id+'-'+d.season,n:d.n,pos:'D/ST',season:d.season,r:d.r}));
  return POOL.filter(p=>p.pos===pos&&TIER(p.r)===tier&&!used.has(p.id)).sort(()=>Math.random()-.5).slice(0,4);
}
function slotsHTML(){ $('#slots').innerHTML=SLOTS.map((s,i)=>{ const g=DR.got[i]; return `<div class="${i===DR.i&&!g?'now':''}${g?' done t-'+TIER(g.r):''}">${s}<b>${g?g.r:'–'}</b></div>`; }).join(''); }
function cardHTML(p){ const t=TIER(p.r), d=p.pos==='D/ST';
  return `<div class="cd t-${t}"><div class="top"><div class="fade"><div class="dots"></div></div>
    <span class="rt" data-r="${p.r}">??</span><span class="tier">${t}</span>
    <div class="ph">${d?nflImg(p.n,'lg'):`<img src="${SHOT(p.id)}" alt="">`}</div></div>
    <div class="cb"><div class="pn">${esc(p.n)}</div><div class="meta">${p.pos} · <b>${p.season}</b></div></div>
    <div class="at">${ATTR[p.pos].map((l,i)=>`<div><span>${l}</span><i><b data-v="${p.a?p.a[i]:70}"></b></i><em data-v="${p.a?p.a[i]:70}">–</em></div>`).join('')}</div></div>`; }
function stageSpin(){
  slotsHTML(); if(DR.i>=SLOTS.length) return stageRoster();
  const pos=SLOTS[DR.i], land=roll(), N=64, AT=56, W=98, tiers=[];
  for(let i=0;i<N;i++) tiers.push(i===AT?land:roll());
  $('#stage').innerHTML=`<span class="q">${DR.i+1} of 6</span><span class="big">${pos==='D/ST'?'Defense':pos}</span>
    <div class="carousel"><div class="belt" id="belt">${tiers.map(t=>packHTML(t)).join('')}</div><div class="fl"></div><div class="fr"></div></div>
    <button class="btn w" id="spin" style="width:220px">Spin</button>`;
  const belt=$('#belt'), mid=$('#stage .carousel').clientWidth/2; belt.style.transform=`translateX(${mid-44}px)`;
  $('#spin').addEventListener('click',()=>{ $('#spin').disabled=true;
    belt.style.transition='transform 5.2s cubic-bezier(.06,.72,.1,1)'; belt.style.transform=`translateX(${mid-44-AT*W+(Math.random()*30-15)}px)`;
    setTimeout(()=>stageOpen(pos,land),5500); });
}
function stageOpen(pos,tier){
  $('#stage').innerHTML=`<span class="q">${pos==='D/ST'?'Defense':pos} · ${tier} pack</span><div id="bp">${packHTML(tier,true)}</div><span class="tag">Tap to open</span>`;
  $('#bp .pk').addEventListener('click',()=>{ $('#bp .pk').classList.add('rip'); setTimeout(()=>stageChoose(pos,tier),430); });
}
function stageChoose(pos,tier){
  const opts=four(pos,tier);
  $('#stage').innerHTML=`<span class="q">Pick one</span><div class="four">${opts.map(cardHTML).join('')}</div><button class="btn w" id="next" style="width:220px;visibility:hidden"></button>`;
  const cs=[...document.querySelectorAll('#stage .cd')]; cs.forEach((c,i)=>setTimeout(()=>c.classList.add('in'),120+i*150));
  cs.forEach((c,i)=>c.addEventListener('click',()=>{ if(DR.got[DR.i]) return; DR.got[DR.i]=opts[i];
    cs.forEach((o,j)=>{ o.classList.add(j===i?'picked':'dim'); const r=o.querySelector('.rt'); setTimeout(()=>{ r.classList.add('flip'); setTimeout(()=>r.textContent=r.dataset.r,200);
      o.querySelectorAll('.at em').forEach(e=>e.textContent=e.dataset.v); o.querySelectorAll('.at b').forEach(b=>b.style.width=((+b.dataset.v-50)/49*100)+'%'); },j===i?0:260); });
    slotsHTML(); $('#next').textContent=DR.i<5?'Next: '+(SLOTS[DR.i+1]==='D/ST'?'Defense':SLOTS[DR.i+1]):'Your roster'; $('#next').style.visibility='visible'; }));
  $('#next').addEventListener('click',()=>{ DR.i++; stageSpin(); });
}
function stageRoster(){
  $('#stage').innerHTML=`<span class="q">Your roster</span><div class="roster">${DR.got.map((p,i)=>`<div class="p">${SLOTS[i]}</div><div>${p.pos==='D/ST'?nflImg(p.n,'rl'):''}${esc(p.n)} <span class="tag">${p.season}</span><span class="ra">${p.a?ATTR[p.pos].map((l,k)=>l.split(' ')[0].slice(0,3)+' '+p.a[k]).join(' · '):''}</span></div><div class="r t-${TIER(p.r)}">${p.r}</div>`).join('')}</div>
    <button class="btn w" id="kick" style="width:220px">Kick off</button>`;
  GAME.roster(DR.got);
  $('#kick').addEventListener('click',()=>{ screen('game'); MATCH.start(); });
}

/* ═══ THEIR DRIVES ═══
   Simulated from their offense against your D/ST, drawn like one of the site's charts: a dotted bar per play in the
   lane between the hashes, a call-out, then the field slides on. */
function makeSim(){
  const cv=$('#sim'), ctx=cv.getContext('2d'); let W=0,H=0,K=0; const DPR=Math.min(2,devicePixelRatio||1);
  const VIEW=34; let st=null, cam=25, timer=null, done=null, fast=false;
  const myD=()=>(DR.got[5]&&DR.got[5].r)||82;
  function size(){ const r=cv.getBoundingClientRect(); if(!r.width) return; W=r.width; H=r.height; K=H/VIEW; cv.width=Math.round(W*DPR); cv.height=Math.round(H*DPR); ctx.setTransform(DPR,0,0,DPR,0,0); }
  const Y=yd=>H*.62-(yd-cam)*K;
  const COL={run:'#FF8E1C',pass:'#4C9EFF',loss:'#D9325E',to:'#D9325E',td:'#4ade80',fg:'#F0CE26',punt:'rgba(253,254,252,.55)',inc:'rgba(253,254,252,.55)'};
  function field(){
    ctx.fillStyle='#171717'; ctx.fillRect(0,0,W,H);
    const lx=Math.round(W*.34), rx=Math.round(W*.66); ctx.fillStyle='#1D1D1D'; ctx.fillRect(lx,0,rx-lx,H); ctx.fillStyle='#2E2E2E'; ctx.fillRect(lx,0,1,H); ctx.fillRect(rx-1,0,1,H);
    ctx.font='500 10px JetBrains Mono'; ctx.textAlign='center';
    [[100,'rgba(217,50,94,.6)','YOUR END ZONE'],[-10,'rgba(253,254,252,.22)','THEIR END ZONE']].forEach(([a,col,l])=>{ const y0=Y(a), y1=Y(a+10); if(y0<0||y1>H) return;
      ctx.fillStyle=dotFill(ctx,col,5,0,Y(0)); ctx.fillRect(0,y1,W,y0-y1); const tw=ctx.measureText(l).width, my=(y0+y1)/2;
      ctx.fillStyle='#171717'; ctx.fillRect(W/2-tw/2-9,my-10,tw+18,20); ctx.fillStyle='rgba(253,254,252,.75)'; ctx.fillText(l,W/2,my+3.5); });
    ctx.textAlign='left'; ctx.font='500 9.5px JetBrains Mono';
    for(let yd=0;yd<=100;yd+=5){ const y=Math.round(Y(yd)); if(y<-4||y>H+4) continue;
      ctx.fillStyle=yd%10?'rgba(253,254,252,.12)':'rgba(253,254,252,.28)'; for(let x=2;x<W;x+=5) ctx.fillRect(x,y-.75,1.5,1.5);
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
    const adv=(st.off-myD())/20, yd=st.yd, x=.44+Math.random()*.12, DA=i=>(DR.got[5]&&DR.got[5].a)?clamp((DR.got[5].a[i]-55)/44,0,1):.5;
    if(st.down===4){ if(yd>=62){ const dist=100-yd+17, good=Math.random()<Math.max(.25,1.05-dist/60); return {x,from:yd,to:yd,kind:'fg',good,call:good?'Field goal good':'No good',sub:dist+' yards'}; }
      if(st.togo<=2&&yd>=45&&Math.random()<.5){ /* they go for it */ }
      else { const l=Math.round(40+gauss()*6); return {x,from:yd,to:Math.min(99,yd+l),kind:'punt',call:'Punt',sub:l+' yards'}; } }
    if(Math.random()<.56){
      if(Math.random()<(.065-adv*.02)*(.55+DA(0)*.9)){ const l=5+Math.floor(Math.random()*5); return {x,from:yd,to:yd-l,kind:'loss',call:'Sacked',sub:'Loss of '+l}; }
      if(Math.random()<(.028-adv*.01)*(.5+DA(3)*1.1)) return {x,from:yd,to:yd+Math.round(8+Math.random()*10),kind:'to',call:'Intercepted',sub:'Your ball'};
      if(Math.random()<.36-adv*.05+(DA(1)-.5)*.1) return {x,from:yd,to:yd,kind:'inc',call:'Incomplete',sub:''};
      const y=Math.max(1,Math.round(7.5+adv*2.5-(DA(1)-.5)*3+gauss()*6+(Math.random()<.08?22:0))); return {x,from:yd,to:Math.min(100,yd+y),kind:'pass',call:'Pass, '+y,sub:''};
    }
    if(Math.random()<.012*(.5+DA(3))) return {x,from:yd,to:yd+Math.round(Math.random()*3),kind:'to',call:'Fumble',sub:'Your ball'};
    const y=Math.round(4+adv*1.5-(DA(2)-.5)*2.5+gauss()*3.4+(Math.random()<.05?15:0)); return {x,from:yd,to:Math.min(100,yd+y),kind:y<0?'loss':'run',call:y<0?'Stuffed, '+y:'Run, '+y,sub:''};
  }
  function info(){ MATCH.ddThem(st); }
  function step(){ if(st.over) return; if(MATCH.stopped()) return finish({kind:'clock'});
    const p=play(); if(p.to>=100&&p.kind!=='to'&&p.kind!=='punt'){ p.to=100; p.kind='td'; p.call='Touchdown'; }
    st.n++; MATCH.cpuTick(p.kind==='inc'?5:Math.round(15+Math.random()*10),p);
    $('#call').innerHTML=`<div style="--cc:${COL[p.kind]}"><b>${p.call}</b>${p.sub?`<small>${p.sub}</small>`:''}</div>`;
    const t0=performance.now(), dur=fast?90:300; const grow=now=>{ const f=Math.min(1,(now-t0)/dur); frame(p,f); if(f<1) requestAnimationFrame(grow); else after(p); }; requestAnimationFrame(grow); }
  function after(p){
    let end=null; const g=p.to-p.from;
    if(p.kind==='td') end={kind:'td'}; else if(p.kind==='to') end={kind:'to',spot:p.to,call:p.call}; else if(p.kind==='punt') end={kind:'punt',spot:p.to,len:p.to-p.from};
    else if(p.kind==='fg') end={kind:p.good?'fg':'miss',spot:p.from,len:100-p.from+17};
    else { st.yd=p.to; if(g>=st.togo){ st.down=1; st.togo=Math.min(10,100-st.yd); } else { st.down++; st.togo-=g; if(st.down>4) end={kind:'downs',spot:st.yd}; } }
    timer=setTimeout(()=>{ $('#call').innerHTML='';
      if(end) return finish(end);
      const from=cam,to=st.yd,t0=performance.now(); const slide=now=>{ const f=Math.min(1,(now-t0)/(fast?80:240)); cam=from+(to-from)*(f*(2-f)); frame(null,0); if(f<1) requestAnimationFrame(slide); else { info(); timer=setTimeout(step,fast?60:180); } }; requestAnimationFrame(slide); },fast?160:620); }
  function finish(r){ st.over=true; clearTimeout(timer); r.n=st.n; r.yd=st.yd; frame(null,0); done(r); }
  function start(yd,off,cb){ clearTimeout(timer); fast=false; size(); st={off,yd,down:1,togo:Math.min(10,100-yd),n:0,over:false}; cam=yd; done=cb; info(); frame(null,0); timer=setTimeout(step,450); }
  addEventListener('resize',()=>{ size(); frame(null,0); });
  return {start,size,myD,skip(){ fast=true; },redraw(){ frame(null,0); }};
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
  const clk=()=>{ const s=Math.max(0,Math.ceil(M.clock)); return Math.floor(s/60)+':'+String(s%60).padStart(2,'0'); };
  function near(r){ const c=DEFS.slice().sort((a,b)=>Math.abs(a.r-r)-Math.abs(b.r-r)).slice(0,6); return c[Math.floor(Math.random()*c.length)]; }
  function bug(){ const b=(t,s,me)=>`<div class="tm${me?'':' r'}">${me?crest(t):''}<span class="sc">${s}</span>${M.poss===(me?'me':'cpu')?'<i class="pos"></i>':''}${me?'':crest(t)}</div>`;
    $('#bug').innerHTML=b(ME,M.score[0],1)+`<div class="clk"><span class="tag">${M.q>4?'Final':'Q'+M.q}</span><b class="${M.run&&M.poss==='me'&&!M.stop?'run':''}">${M.q>4?'0:00':clk()}</b></div>`+b(CPU,M.score[1],0); }
  function ddMe(){ $('#dd').innerHTML=`<span>${ord(M.down)} &amp; ${M.togo>=100-M.yd?'Goal':M.togo} · ${mine(M.yd).replace(/^./,c=>c.toUpperCase())}</span>${M.run&&!M.stop?`<span class="dv pc">Play clock :${String(Math.max(0,Math.ceil(M.pc))).padStart(2,'0')}</span>`:`<span class="dv">${nflImg(M.oppD.n)}${M.oppD.season} ${esc(M.oppD.n)} · ${M.oppD.r}</span>`}`; }
  function ddThem(st){ $('#dd').innerHTML=`<span>${ord(st.down)} &amp; ${st.yd+st.togo>=100?'Goal':st.togo} · ${theirs(st.yd).replace(/^./,c=>c.toUpperCase())}</span><span class="dv">Their O ${M.oppO} v D ${SIM.myD()}</span>`; }
  function view(v){ const snap=v==='snap'; $('#fld').style.display=snap?'':'none'; $('#sim').style.display=snap?'none':''; $('#ctrl').style.display=snap?'':'none'; $('#drive').style.display=snap?'none':'';
    $('#res').className='result'; $('#call').innerHTML=''; $('#hint').style.display='none'; GAME.show(snap); if(!snap) SIM.size(); }
  function banner(o,cb){ const b=$('#ban'); b.innerHTML=`<div class="bx" style="--cc:${o.col||'var(--text)'}"><small>${o.tag}</small><b>${o.title}</b>${o.sub?`<span>${o.sub}</span>`:''}<button class="btn w">${o.btn}</button></div>`;
    b.className='banner show'; $('#ctrl').classList.add('lock'); $('#drive').classList.add('lock');
    b.querySelector('button').onclick=()=>{ b.className='banner'; $('#ctrl').classList.remove('lock'); $('#drive').classList.remove('lock'); cb(); }; }
  function tick(s){ if(M.stop) return; const before=M.clock; M.clock-=s;
    /* the two-minute warning, in the second and fourth quarters */
    if((M.q===2||M.q===4)&&before>120&&M.clock<=120&&!M.warn[M.q]){ M.warn[M.q]=1; M.twoMin=true; }
    if(M.clock<=0){ if(M.q===2||M.q===4){ M.clock=0; M.stop=true; } else { M.q++; M.clock=QLEN+M.clock; M.run=false; M.toast='End of the '+(M.q===2?'1st':'3rd')+' quarter'; } }
    const sec=Math.ceil(M.clock); if(sec!==M.shown){ M.shown=sec; bug(); if(M.poss==='me') ddMe(); } }
  /* run what comes next, unless the half or the game has run out */
  function after(fn){ if(M.stop) return endPeriod(); fn(); if(M.toast){ toast(M.toast); M.toast=null; } }
  function toast(s){ const t=$('#toast'); t.textContent=s; t.className='toast show'; clearTimeout(toast.t); toast.t=setTimeout(()=>t.className='toast',2200); }
  function endPeriod(){
    M.pend=null; M.run=false;
    if(M.q===2){ M.q=3; M.clock=QLEN; M.stop=false; M.tos=3; bug();
      return banner({tag:'Halftime',title:`${M.score[0]} – ${M.score[1]}`,sub:`They get the ball to start the second half.`,btn:'Second half'},()=>cpuDrive(25)); }
    M.q=5; bug(); final(); }
  function myDrive(yd){ M.poss='me'; M.run=false; M.yd=yd; M.down=1; M.togo=Math.min(10,100-yd); bug(); view('snap'); GAME.sit(M.yd,M.down,M.togo); ddMe(); }
  function cpuDrive(yd){ M.poss='cpu'; bug(); view('sim'); $('#drive').innerHTML=`<span class="tag">Their ball</span><button class="btn" id="skip">Skip ahead</button>`; $('#skip').onclick=()=>{ SIM.skip(); $('#skip').disabled=true; };
    SIM.start(yd,M.oppO,r=>{ M.opp.drives++;
      const go=(o,next)=>banner(o,()=>after(next));
      if(r.kind==='td'){ M.score[1]+=7; bug(); go({tag:'They score',title:'Touchdown',sub:`${r.n} plays. Extra point good. Your ball on your 25.`,col:'var(--red)',btn:'Your ball'},()=>myDrive(25)); }
      else if(r.kind==='fg'){ M.score[1]+=3; bug(); go({tag:'They score',title:'Field goal',sub:`${r.len} yards, good. Your ball on your 25.`,col:'var(--yellow)',btn:'Your ball'},()=>myDrive(25)); }
      else if(r.kind==='miss'){ const yd=Math.max(20,100-r.spot); go({tag:'No good',title:'Missed field goal',sub:`From ${r.len}. Your ball on ${mine(yd)}.`,col:'var(--green)',btn:'Your ball'},()=>myDrive(yd)); }
      else if(r.kind==='punt'){ const yd=r.spot>=100?20:Math.max(1,100-r.spot); go({tag:'Punt',title:'They punt',sub:`${r.spot>=100?'Into the end zone, touchback':r.len+' yards'}. Your ball on ${mine(yd)}.`,btn:'Your ball'},()=>myDrive(yd)); }
      else if(r.kind==='to'){ const yd=clamp(100-r.spot,1,99); go({tag:'Turnover',title:r.call==='Fumble'?'Fumble':'Intercepted',sub:`Your D/ST takes it away. Your ball on ${mine(yd)}.`,col:'var(--green)',btn:'Your ball'},()=>myDrive(yd)); }
      else if(r.kind==='downs'){ const yd=clamp(100-r.spot,1,99); go({tag:'Stopped',title:'Turnover on downs',sub:`Your ball on ${mine(yd)}.`,col:'var(--green)',btn:'Your ball'},()=>myDrive(yd)); }
      else endPeriod(); }); }
  return {
    start(){ Object.assign(M,{q:1,clock:QLEN,score:[0,0],poss:null,yd:25,down:1,togo:10,stop:false,pend:null,toast:null,run:false,pc:PLAYCLOCK,tos:3,warn:{},twoMin:false,shown:null,
        st:{att:0,comp:0,py:0,ptd:0,int:0,ra:0,ry:0,rtd:0,sk:0},opp:{plays:0,yds:0,drives:0},
        ps:[0,1,2,3,4].map(()=>({att:0,comp:0,py:0,ptd:0,int:0,sk:0,car:0,ry:0,rushtd:0,tgt:0,rec:0,recy:0,rtd:0,long:0,fum:0})),dst:{sk:0,int:0,fum:0}});
      M.oppO=76+Math.floor(Math.random()*14); M.oppD=near(76+Math.random()*14); GAME.setD(M.oppD); bug(); view('snap');
      banner({tag:'Kickoff',title:`${esc(ME.name)} receive`,sub:`Against ${esc(CPU.name)} and the ${M.oppD.season} ${esc(M.oppD.n)} defense. Touchback: your ball on your 25.`,btn:'Take the field'},()=>myDrive(25)); },
    played(r){ const S=GAME.S, y=r.yards||0, ps=M.ps, Q=ps[0];
      /* each player's line */
      if(S.thrown||r.head==='Thrown away'){ Q.att++; if(S.tgt&&S.tgt.slot!=null) ps[S.tgt.slot].tgt++;
        if(S.caught&&S.catcher){ const R=ps[S.catcher.slot]; Q.comp++; Q.py+=y; R.rec++; R.recy+=y; R.long=Math.max(R.long,y); if(r.kind==='td'){ Q.ptd++; R.rtd++; } if(r.kind==='to') R.fum++; }
        if(r.head==='Intercepted') Q.int++; }
      else if(!S.carrier){ if(r.head==='Sacked'||r.head==='Strip sack'||r.kind==='safety'){ Q.sk++; if(r.kind==='to') Q.fum++; } }
      else { const C=ps[S.carrier.slot]; C.car++; C.ry+=r.kind==='safety'?-M.yd:y; if(r.kind==='td') C.rushtd++; if(r.kind==='to') C.fum++; }
      if(S.thrown||r.head==='Thrown away'){ M.st.att++; if(S.caught){ M.st.comp++; M.st.py+=y; if(r.kind==='td') M.st.ptd++; } if(r.kind==='to') M.st.int++; }
      else if(!S.carrier) M.st.sk++;
      else { M.st.ra++; M.st.ry+=r.kind==='safety'?-M.yd:y; if(r.kind==='td') M.st.rtd++; }
      M.run=(r.kind==='gain'||r.kind==='loss')&&r.head!=='Out of bounds'&&r.head!=='Thrown away'; M.pc=PLAYCLOCK;
      if(M.twoMin){ M.twoMin=false; M.run=false; M.toast='Two-minute warning'; }
      if(r.kind==='td'){ M.score[0]+=7; bug(); M.pend=()=>banner({tag:'Touchdown',title:'Touchdown',sub:r.body+' Extra point good.',col:'var(--green)',btn:'Kick off'},()=>after(()=>cpuDrive(25))); }
      else if(r.kind==='to'){ const abs=M.yd+Math.round(r.at?r.at.y:0), yd=abs>=100?20:clamp(100-abs,1,99); M.pend=()=>banner({tag:'Turnover',title:r.head==='Intercepted'?'Intercepted':r.head==='Strip sack'?'Strip sack':'Fumble',sub:`Their ball on ${theirs(yd)}.`,col:'var(--red)',btn:'Their ball'},()=>after(()=>cpuDrive(yd))); }
      else if(r.kind==='safety'){ M.score[1]+=2; bug(); M.pend=()=>banner({tag:'Safety',title:'Safety',sub:'Two points to them, and you kick it to them.',col:'var(--red)',btn:'Their ball'},()=>after(()=>cpuDrive(35))); }
      else { const g=r.kind==='inc'?0:y; M.yd=clamp(M.yd+g,1,99);
        if(g>=M.togo){ M.down=1; M.togo=Math.min(10,100-M.yd); } else { M.down++; M.togo-=g; }
        if(M.down>4){ const yd=100-M.yd; M.pend=()=>banner({tag:'Turnover on downs',title:'Short',sub:`Their ball on ${theirs(yd)}.`,col:'var(--red)',btn:'Their ball'},()=>after(()=>cpuDrive(yd))); }
        else M.pend=()=>after(()=>{ GAME.regroup(M.yd,M.down,M.togo); ddMe(); }); }
      ddMe(); bug(); },
    next(){ if(M.pend){ const p=M.pend; M.pend=null; p(); } },
    punt(){ const net=Math.round(42+gauss()*5), land=M.yd+net, yd=land>=100?20:100-land; M.run=false; tick(10);
      banner({tag:'Punt',title:`${net}-yard punt`,sub:land>=100?'Into the end zone: touchback. Their ball on their 20.':`Their ball on ${theirs(yd)}.`,btn:'Their ball'},()=>after(()=>cpuDrive(yd))); },
    kick(dist){ const good=Math.random()<clamp(1.1-dist/60,.2,.97); M.run=false; tick(6);
      if(good){ M.score[0]+=3; bug(); banner({tag:'Field goal',title:'It\'s good',sub:`${dist} yards. Three points.`,col:'var(--green)',btn:'Kick off'},()=>after(()=>cpuDrive(25))); }
      else { const yd=Math.max(20,100-M.yd); banner({tag:'Field goal',title:'No good',sub:`${dist} yards, wide. Their ball on ${theirs(yd)}.`,col:'var(--red)',btn:'Their ball'},()=>after(()=>cpuDrive(yd))); } },
    cpuTick(s,p){ M.opp.plays++; if(p.call==='Sacked') M.dst.sk++; if(p.kind==='to') M.dst[p.call==='Fumble'?'fum':'int']++; if(p.kind!=='punt'&&p.kind!=='fg'&&p.kind!=='to') M.opp.yds+=p.to-p.from; tick(s); },
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
    ddThem, M };
  function final(){
    const [a,b]=M.score, res=a>b?'You win':a<b?'You lose':'A tie', col=a>b?'var(--gold)':a<b?'var(--red)':'var(--text2)', s=M.st;
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
      <div class="pbox">${DR.got.map((p,i)=>{ const s=i<5?M.ps[i]:null, d=M.dst; let a='',b='';
        if(p.pos==='QB'){ a=`${s.comp}/${s.att} · ${s.py} yds · ${s.ptd} TD · ${s.int} INT`; b=`${s.sk} sacked · ${s.car} rushes, ${s.ry} yds${s.rushtd?' · '+s.rushtd+' TD':''}${s.fum?' · '+s.fum+' fumble':''}`; }
        else if(p.pos==='RB'){ a=`${s.car} carries · ${s.ry} yds · ${s.rushtd} TD`; b=`${s.rec} catches · ${s.recy} yds${s.fum?' · '+s.fum+' fumble':''}`; }
        else if(p.pos==='D/ST'){ a=`${d.sk} sacks · ${d.int} INT · ${d.fum} fumbles`; b=`${M.score[1]} points · ${M.opp.yds} yds allowed`; }
        else { a=`${s.rec} of ${s.tgt} · ${s.recy} yds · ${s.rtd} TD`; b=s.rec?`long ${s.long}${s.fum?' · '+s.fum+' fumble':''}`:'no catches'; }
        return `<div class="t-${TIER(p.r)}">${p.pos==='D/ST'?nflImg(p.n):`<img src="${SHOT(p.id)}" alt="">`}<span><b>${esc(p.n)}</b><em>${p.pos} · ${p.season} · ${p.r}</em><i>${a}</i><i>${b}</i></span></div>`; }).join('')}</div>
      <button class="btn w" id="again">Play again</button></div>`;
    $('#again').onclick=()=>{ DR.i=0; DR.got=[]; screen('match'); };
  }
}
