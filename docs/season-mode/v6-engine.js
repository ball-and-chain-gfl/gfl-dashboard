/* ═══ THE SNAP ═══
   Every man is a point in yards with a velocity, a top speed and how hard he can change direction. Each frame he picks
   where he wants to be and accelerates toward it. Blocks are contests, coverage is chasing, a catch is whoever gets to
   the ball, and a tackle is a defender reaching the man with it. y is yards past the line of scrimmage. */
/* ═══ THE PLAYBOOK ═══
   Sixteen passes and sixteen runs. Each down deals four of each at random; Run or Pass shows that four.
   A pass is a route for each eligible man, in yards from where he lines up (left receiver WA, right WB, the tight end
   on the right, the back beside the QB). A run is the back's path in yards from the ball, the side it goes (dir) and
   whether it bounces outside (wide). */
const FORM={WA:[-9.5,-.6],WB:[9.5,-.6],TE:[5.3,-.9],RB:[-1.6,-4.6],QB:[0,-4.5]}, OLX=[-3.4,-1.7,0,1.7,3.4];
const P_=(name,WA,WB,TE,RB)=>({kind:'pass',name,routes:{WA,WB,TE,RB}});
const R_=(name,path,dir,wide,delay)=>({kind:'run',name,path,dir,wide:!!wide,delay});
const PLAYS={
  slants:P_('Slants',[[0,5],[5,11],[9,15]],[[0,5],[-5,11],[-9,15]],[[0,6],[-2,14],[-3,22]],[[-4,1],[-9,3],[-12,4]]),
  verts:P_('Four verts',[[0,30]],[[0,30]],[[0,10],[-1,30]],[[3,2],[4,5],[4,6]]),
  mesh:P_('Mesh',[[1,2],[14,4]],[[-1,3],[-14,5]],[[0,10],[-10,10]],[[-4,1],[-8,2]]),
  smash:P_('Smash',[[0,6],[0,5]],[[0,6],[0,5]],[[0,10],[6,22]],[[-4,1],[-8,2]]),
  curls:P_('Curls',[[0,12],[1,10]],[[0,12],[-1,10]],[[0,5],[-1,5]],[[-2,2],[-4,3]]),
  outs:P_('Outs',[[0,8],[-7,8]],[[0,8],[7,8]],[[0,10],[-1,30]],[[-4,1],[-8,2]]),
  posts:P_('Posts',[[0,10],[7,26]],[[0,10],[-7,26]],[[0,8],[-1,7]],[[-2,2],[-4,3]]),
  dig:P_('Dig',[[0,12],[11,12]],[[0,30]],[[3,1],[8,2]],[[-4,1],[-9,3],[-12,4]]),
  flood:P_('Flood',[[0,10],[7,26]],[[1,10],[2,30]],[[0,10],[8,10]],[[4,0],[9,2]]),
  drive:P_('Drive',[[1,2],[13,3]],[[0,30]],[[0,12],[-10,12]],[[-2,2],[-4,3]]),
  ycross:P_('Y-cross',[[0,30]],[[0,12],[-1,10]],[[0,6],[-8,14],[-18,18]],[[-4,1],[-8,2]]),
  screen:P_('RB screen',[[0,30]],[[0,30]],[[0,5],[-1,5]],[[-3,-1],[-7,-1],[-9,2]]),
  fade:P_('Fade-hitch',[[-2,10],[-3,30]],[[0,6],[0,5]],[[3,1],[8,2]],[[-2,2],[-4,3]]),
  sluggo:P_('Sluggo',[[2,3],[3,6],[3,30]],[[0,5],[-5,11],[-9,15]],[[0,10],[-1,30]],[[-2,2],[-4,3]]),
  stick:P_('Stick',[[0,30]],[[0,5],[-1,5]],[[3,1],[8,2]],[[-3,3],[-4,4]]),
  comeback:P_('Comebacks',[[0,15],[-2,12]],[[0,15],[2,12]],[[0,10],[-1,30]],[[-4,1],[-9,3],[-12,4]]),
  inside:R_('Inside zone',[[-.4,-2.4],[.9,1.5],[1.2,5]],1),
  outside:R_('Outside zone',[[4.5,-2.6],[8,1],[9,5]],1,1),
  insideL:R_('Zone left',[[-.9,-2.4],[-1.4,1.5],[-1.8,5]],-1),
  outsideL:R_('Outside left',[[-4.8,-2.6],[-8.2,1],[-9,5]],-1,1),
  dive:R_('Dive',[[-.8,-2],[-.6,1],[-.6,5]],-1),
  powerR:R_('Power right',[[1.5,-2.8],[2.6,0],[3,5]],1),
  powerL:R_('Power left',[[-2.6,-2.6],[-3.4,0],[-3.6,5]],-1),
  counter:R_('Counter',[[-2.8,-4],[.5,-2.4],[2.4,1],[3,5]],1,0,.7),
  draw:R_('Draw',[[-1.6,-5.2],[-.4,-3],[0,1],[0,5]],1,0,.95),
  tossR:R_('Toss right',[[5,-4],[9,-1],[10.5,4]],1,1),
  tossL:R_('Toss left',[[-6,-4],[-10,-1],[-11,4]],-1,1),
  stretchR:R_('Stretch right',[[3,-3],[6.5,-1],[7,4]],1,1),
  stretchL:R_('Stretch left',[[-5,-3],[-8,-1],[-8.5,4]],-1,1),
  trap:R_('Trap',[[-.2,-2.6],[.3,.5],[-.5,5]],1),
  cutback:R_('Cutback',[[3,-2.8],[2,0],[-1.5,4]],-1),
  sweepL:R_('Sweep left',[[-4,-4.2],[-9,-2],[-10,3]],-1,1),
};
const BOOK={pass:Object.keys(PLAYS).filter(k=>PLAYS[k].kind==='pass'),run:Object.keys(PLAYS).filter(k=>PLAYS[k].kind==='run')};
const deal=kind=>BOOK[kind].slice().sort(()=>Math.random()-.5).slice(0,4);
const LOOKS={cover2:'Cover 2',cover3:'Cover 3',man:'Man',blitz:'Blitz'};
/* the play drawn small for its button, like a coach's card */
function playSVG(k){
  const PL=PLAYS[k], X=x=>((x+12.5)/25*64).toFixed(1), Y=y=>(31-(y+4.5)*1.3).toFixed(1), run=PL.kind==='run';
  const arrow=(pts,col,w)=>{ const n=pts.length, [ax,ay]=pts[n-2], [bx,by]=pts[n-1], dx=X(bx)-X(ax), dy=Y(by)-Y(ay), L=Math.hypot(dx,dy)||1, ux=dx/L, uy=dy/L, ex=+X(bx), ey=+Y(by);
    return `<polyline points="${pts.map(([x,y])=>X(x)+','+Y(y)).join(' ')}" fill="none" stroke="${col}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"/>`+
      `<path d="M${ex+ux*1.5},${ey+uy*1.5}L${ex-ux*3-uy*2.2},${ey-uy*3+ux*2.2}L${ex-ux*3+uy*2.2},${ey-uy*3-ux*2.2}Z" fill="${col}"/>`; };
  const dot=(x,y,c,r)=>`<circle cx="${X(x)}" cy="${Y(y)}" r="${r||1.7}" fill="${c}"/>`;
  let g=`<line x1="0" x2="64" y1="${Y(0)}" y2="${Y(0)}" stroke="rgba(253,254,252,.3)" stroke-dasharray="1 2"/>`;
  if(run){ OLX.forEach(x=>{ g+=`<path d="M${X(x)},${Y(-.6)}V${Y(1.3)}M${X(x)-2},${Y(1.3)}H${+X(x)+2}" stroke="rgba(253,254,252,.5)" stroke-width="1"/>`; });
    g+=arrow([FORM.RB,...PL.path.map(([x,y],i,a)=>i===a.length-1?[x,y+3]:[x,y])],'#FF8E1C',1.7); }
  else Object.entries(PL.routes).forEach(([w,r])=>{ if(!r) return; const [sx,sy]=FORM[w]; g+=arrow([[sx,sy],...r.map(([rx,ry])=>[clamp(sx+rx,-12,12),Math.min(18.6,sy+ry)])],'#4C9EFF',1.3); });
  OLX.forEach(x=>g+=dot(x,-.9,'rgba(253,254,252,.55)',1.5));
  ['WA','WB','TE','RB','QB'].forEach(w=>g+=dot(FORM[w][0],FORM[w][1],'#FDFEFC'));
  return `<svg viewBox="0 0 64 36" aria-hidden="true">${g}</svg>`;
}

/* how long each frame of a one-off lasts (the times it moves to the next), and which states loop two frames */
const ONESHOT={dive:[.08,.22],leap:[.06,.14,.3],catch:[.08,.18],stiff:[.1],hurdle:[.1,.4],down:[.1],downB:[.1]};
const LOOP=new Set(['wrap','truck','block','flail','flex','wings']);
const stageOf=(th,age)=>{ let i=0; while(i<th.length&&age>=th[i]) i++; return i; };
const HOLD=new Set(['catch','catchLow','reach','leap','throw','dive','tiptoe','oneHand','celebrate','spike','dance','bow','sky','flex','wings','cross']);
/* the states a man catches the ball in: the ball is drawn at his hands */
const CATCHING=new Set(['catch','catchLow','reach','oneHand','tiptoe','leap']);
const LYING=new Set(['down','downB','dive','fallF','fallB']);
const TIERC={legend:'#2F86EB',gold:'#F0CE26',silver:'#C9CED6',bronze:'#C08552'};
/* where his chest is, in sprite units from his feet, when the sprite is turned for a fall or lying down (facing right) */
function ballSpot(st,fr){ const rot=(th,tx,ty)=>{ const c=Math.cos(th), s=Math.sin(th); return [6*c+60*s+tx, 6*s-60*c+ty]; }; let q=null;
  if(st==='fallF'){ const k=Math.min(2,fr|0); q=rot([.35,.8,1.2][k],-[8,24,40][k],0); }
  else if(st==='fallB'){ const k=Math.min(2,fr|0); q=rot(-[.3,.7,1.1][k],[8,24,40][k],0); }
  else if(st==='down') q=rot(Math.PI/2,-46,-6); else if(st==='downB') q=rot(-Math.PI/2,44,-6); else if(st==='dive') q=rot(1.15,-34,-16);
  return q?[q[0],-q[1]]:null; }
function makeGame(){
  const cv=$('#fld'), ctx=cv.getContext('2d'); let W=0,H=0,K=0; const DPR=Math.min(2,devicePixelRatio||1);
  const VIEW=24, SIDE=26.65, HASH=3.08, OLG=82;
  let D={r:82,n:'Defense',season:''};
  const pickS=(pos,lo,hi,skip)=>POOL.find(p=>p.pos===pos&&p.r>=lo&&p.r<=hi&&p.id!==skip)||POOL.find(p=>p.pos===pos);
  const w1=pickS('WR',88,95); const SAMPLE=[pickS('QB',84,90),pickS('RB',82,90),w1,pickS('WR',76,87,w1.id),pickS('TE',72,82)];
  let roster=null; const who=i=>(roster&&roster[i])||SAMPLE[i];
  const S={phase:'pre',call:'slants',kind:'pass',hand:{pass:['slants','verts','mesh','smash'],run:['inside','outside','powerR','draw']},look:'cover2',t:0,P:[],ball:null,carrier:null,cam:{x:0,y:4},eng:[],cut:null,yd:25,down:1,togo:10,goal:75,fourth:false,on:false};
  function size(){ const r=cv.getBoundingClientRect(); if(!r.width) return; W=r.width; H=r.height; K=W/VIEW; cv.width=Math.round(W*DPR); cv.height=Math.round(H*DPR); ctx.setTransform(DPR,0,0,DPR,0,0); }
  const toS=(x,y)=>[W/2+(x-S.cam.x)*K, H*.71-(y-S.cam.y)*K];
  const toY=(px,py)=>({x:(px-W/2)/K+S.cam.x, y:(H*.71-py)/K+S.cam.y});
  const mk=(side,pos,num,r,x,y,vmax,acc)=>({side,pos,num,r,x,y,vx:0,vy:0,vmax,acc,state:'stance',facing:side==='o'?'up':'down',ph:0,at:0,down:false,role:null});
  const spd=(base,r)=>base+(r-80)/40*1.0;
  /* a player's attribute as 0 to 1 (55 is 0, 99 is 1); without one, his overall stands in */
  const A=(p,i)=>p&&p.a&&p.a[i]!=null?clamp((p.a[i]-55)/44,0,1):clamp(((p&&p.r)||80)-60,0,39)/39;
  /* which attribute is which, by position */
  const HANDS={RB:3,WR:2,TE:1}, CONT={WR:3,TE:3};
  const Ad=i=>D.a?clamp((D.a[i]-55)/44,0,1):.5;   /* the defense: pass rush, coverage, run stop, ball hawk */
  function setup(){
    const P=[]; const qb=who(0), rb=who(1), wa=who(2), wb=who(3), te=who(4);
    const PL=PLAYS[S.call], runCall=PL.kind==='run';
    [-3.4,-1.7,0,1.7,3.4].forEach((x,i)=>{ const p=mk('o','OL',[72,66,60,63,77][i],clamp(OLG+Math.round(gauss()*3),60,99),x,-.9,4.6,9); p.state='stance3'; P.push(p); });
    const QB=mk('o','QB',15,qb.r,0,-4.5,spd(5.4,qb.r),12); QB.state='stance'; P.push(QB);
    const RB=mk('o','RB',28,rb.r,-1.6,-4.6,spd(6.2,rb.r),15); P.push(RB);
    const WA=mk('o','WR',13,wa.r,-9.5,-.6,spd(6.3,wa.r),15), WB=mk('o','WR',16,wb.r,9.5,-.6,spd(6.3,wb.r),15), TE=mk('o','TE',81,te.r,5.3,-.9,spd(5.8,te.r),13);
    P.push(WA,WB,TE); WA.name=wa.n; WB.name=wb.n; TE.name=te.n; RB.name=rb.n; QB.name=qb.n;
    QB.a=qb.a; RB.a=rb.a; WA.a=wa.a; WB.a=wb.a; TE.a=te.a; QB.slot=0; RB.slot=1; WA.slot=2; WB.slot=3; TE.slot=4;
    /* speed: legs for the QB, speed for the rest; elusiveness makes the back sharper in and out of cuts */
    QB.vmax=5.1+A(QB,2)*2.1; QB.acc=14+A(QB,2)*12;
    RB.vmax=5.45+A(RB,0)*1.8; RB.acc=16+A(RB,1)*12;
    WA.vmax=5.3+A(WA,0)*2.2; WB.vmax=5.3+A(WB,0)*2.2; TE.vmax=5.0+A(TE,2)*1.8;
    WA.acc=16+A(WA,0)*10; WB.acc=16+A(WB,0)*10; TE.acc=14+A(TE,2)*8;
    if(!runCall){ const r=PL.routes; WA.route=r.WA; WB.route=r.WB; TE.route=r.TE; RB.route=r.RB; if(!RB.route) RB.role='protect'; }
    else { WA.role='stalk'; WB.role='stalk'; TE.role='block'; }
    const dr=()=>clamp(Math.round(D.r+gauss()*5),55,99), q=r=>clamp((r-60)/39,0,1);
    const DL=[-4.4,-1.5,1.5,4.4].map((x,i)=>mk('d','DL',[97,90,99,94][i],dr(),x,.9,0,0));
    const LB=[-3.6,3.6].map((x,i)=>mk('d','LB',[54,52][i],dr(),x,5,0,0));
    const CB=[WA,WB].map((w,i)=>mk('d','CB',[24,21][i],dr(),w.x,6,0,0));
    const SF=[-7,7].map((x,i)=>mk('d','S',[31,42][i],dr(),x,13,0,0));
    [...DL,...LB,...CB,...SF].forEach(d=>{ const qq=q(d.r); d.vmax=d.pos==='DL'?4.95+qq*.7+Ad(0)*.9:d.pos==='LB'?5.55+qq*.8+Ad(2)*1.0:5.65+qq*1.0+Ad(1)*1.3; d.acc=d.pos==='DL'?12+qq*6:16+qq*14; d.react=.38-qq*.12-(d.pos==='DL'?0:Ad(1)*.14); d.state=d.pos==='DL'?'stance3':'stance'; P.push(d); });
    const look=S.look;
    DL.forEach(d=>d.role='rush');
    if(look==='cover2'){ CB.forEach((c,i)=>{ c.y=3; c.role='zone'; c.spot=[i?13:-13,4]; }); SF.forEach((s,i)=>{ s.role='deep'; s.spot=[i?10:-10,17]; }); LB.forEach((l,i)=>{ l.role='zone'; l.spot=[i?5:-5,7]; }); }
    if(look==='cover3'){ CB.forEach((c,i)=>{ c.y=7; c.role='deep'; c.spot=[i?16:-16,17]; }); SF[0].x=0; SF[0].y=15; SF[0].role='deep'; SF[0].spot=[0,18]; SF[1].x=7; SF[1].y=8; SF[1].role='zone'; SF[1].spot=[9,7]; LB.forEach((l,i)=>{ l.role='zone'; l.spot=[i?2:-5,7]; }); }
    if(look==='man'){ CB.forEach((c,i)=>{ c.role='man'; c.man=i?WB:WA; c.cush=5.2-q(c.r)*2.2; c.y=c.man.y+c.cush; }); LB[0].role='man'; LB[0].man=TE; LB[1].role='man'; LB[1].man=RB; SF[0].x=0; SF[0].y=15; SF[0].role='deep'; SF[0].spot=[0,18]; SF[1].x=-2; SF[1].y=9; SF[1].role='zone'; SF[1].spot=[0,9]; }
    if(look==='blitz'){ CB.forEach((c,i)=>{ c.role='man'; c.man=i?WB:WA; c.cush=2; c.y=c.man.y+2; }); SF[1].role='man'; SF[1].man=TE; SF[1].x=TE.x+1; SF[1].y=5; SF[1].cush=2;
      LB.forEach(l=>{ l.role='blitz'; l.y=3; }); SF[0].x=0; SF[0].y=15; SF[0].role='deep'; SF[0].spot=[0,18];
      if(!runCall){ RB.route=null; RB.role='protect'; } }
    if(runCall){ RB.route=null; }
    S.eng=[]; const ols=P.filter(p=>p.pos==='OL').sort((a,b)=>a.x-b.x);
    const pairs=runCall?[[0,DL[0]],[1,DL[1]],[3,DL[2]],[4,DL[3]]]:[[0,DL[0]],[1,DL[1]],[2,DL[1]],[3,DL[2]],[4,DL[3]]];
    pairs.forEach(([oi,d])=>S.eng.push({o:ols[oi],d,w:0,dbl:false}));
    if(!runCall){ S.eng.filter(e=>e.d===DL[1]).forEach(e=>e.dbl=true); }
    else { const ps=PL.dir>0?1:0; ols[2].role='climb'; ols[2].climb=LB[PL.wide?1-ps:ps]; TE.climb=LB[PL.wide?ps:1-ps]; }
    S.eng.forEach(e=>{ const diff=(e.d.r-e.o.r)/20; e.rate=(runCall?.3+(Ad(2)-.5)*.3:.34+(Ad(0)-.5)*.4)+diff*.45+gauss()*.1; e.d.blocked=true; e.o.blocking=e.d; });
    S.P=P; S.QB=QB; S.RB=RB; S.rec=[WA,TE,WB,RB]; S.DL=DL; S.LB=LB; S.CB=CB; S.SF=SF; S.runCall=runCall;
    S.ball={holder:QB,air:null}; S.hold=null; S.slow=0; S.parts=[]; S.fx=null; S.bigHit=null; S.seq=null; S.pops=[]; S.loose=null; S.bobble=null; S.catcher=null; S.tgt=null; S.carrier=null; S.cut=null; S.cam={x:0,y:4}; S.t=0; S.over=false; S.msg=null; S.thrown=false; S.scram=false;
  }
  const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
  function steer(p,tx,ty,dt,vmax){ const dx=tx-p.x, dy=ty-p.y, d=Math.hypot(dx,dy); const want=d<.2?0:Math.min(vmax||p.vmax,d*6.5);
    const wx=d>0?dx/d*want:0, wy=d>0?dy/d*want:0; let ax=wx-p.vx, ay=wy-p.vy; const am=Math.hypot(ax,ay), lim=p.acc*dt; if(am>lim){ ax=ax/am*lim; ay=ay/am*lim; }
    p.vx+=ax; p.vy+=ay; }
  function routeTarget(p){ if(!p.route) return null; const v=p.vmax, d=Math.max(0,S.t-.05)*v+.7; let left=d, x=p.x0, y=p.y0, k=0;
    for(const [rx,ry] of p.route){ const tx=p.x0+rx, ty=p.y0+ry, seg=Math.hypot(tx-x,ty-y); if(left<=seg){ const f=left/seg; brk(p,k); return [x+(tx-x)*f,y+(ty-y)*f]; } left-=seg; x=tx; y=ty; k++; }
    return [x,y]; }
  function brk(p,k){ if(p.seg===undefined){ p.seg=k; return; } if(k===p.seg) return; p.seg=k;
    const rr=p.pos==='WR'?A(p,1):p.pos==='TE'?.35:.3;
    S.P.forEach(d=>{ if(d.side==='d'&&!d.down&&(d.man===p||Math.hypot(d.x-p.x,d.y-p.y)<4.5)) d.stall=S.t+.12+rr*.8; }); }
  function carrierAim(c){
    if(S.cut&&S.t<S.cut.until) return [c.x+S.cut.dir*3.2,c.y+.8];
    if(c.path&&c.path.length){ const [tx,ty]=c.path[0]; if(Math.hypot(tx-c.x,ty-c.y)<1) c.path.shift(); else return [tx,ty]; }
    let best=null,bs=-1e9;
    for(let a=-80;a<=80;a+=10){ const r=a*Math.PI/180, dx=Math.sin(r), dy=Math.cos(r), px=c.x+dx*3.5, py=c.y+dy*3.5;
      let sc=dy*2.2-Math.abs(dx)*.2; S.P.forEach(p=>{ if(p.side!=='d'||p.down) return; const dd=Math.hypot(p.x-px,p.y-py); sc-=4/((dd+.5)*(dd+.5))*(p.blocked&&!p.shed?.35:1); });
      if(Math.abs(px)>SIDE-1) sc-=6; if(sc>bs){ bs=sc; best=[px,py]; } }
    return best; }
  const SEQ={truck:{dur:.55,label:'Trucked'},stiff:{dur:.5,label:'Stiff arm'},juke:{dur:.38,label:'Juked'},spin:{dur:.48,label:'Spin move'},hurdle:{dur:.52,label:'Hurdle'}};
  function pop(text,col,p){ S.pops.push({text,col:col||'#FF8E1C',p,t0:S.t}); S.slow=Math.max(S.slow||0,S.t+(text==='Touchdown'?.9:.55)); }
  /* PARTICLES, in yards with a height, so they move with the field: dust, sparks, confetti */
  const DUST=['#8f8a80','#b8b2a6','#6d685f'], SPARK=['#FDFEFC','#F0CE26','#FDFEFC'], CONF=['#4C9EFF','#FF8E1C','#F0CE26','#4ade80','#D9325E','#FDFEFC'];
  function burst(x,y,n,o){ for(let i=0;i<n;i++){ const a=Math.random()*P2, sp=(o.sp||2)*(.4+Math.random()*.8);
    S.parts.push({x:x+(o.dx||0),y,z:o.z||0,vx:Math.cos(a)*sp+(o.vx||0),vy:Math.sin(a)*sp*.6,vz:(o.vz??2)*(.5+Math.random()),g:o.g??9,life:(o.life||.6)*(.6+Math.random()*.7),age:0,col:o.cols[Math.floor(Math.random()*o.cols.length)],s:o.s||2}); } }
  const dust=(p,n,vx)=>burst(p.x,p.y,n||10,{cols:DUST,sp:2.2,vz:1.6,vx:vx||0,life:.55});
  const sparks=(p,n)=>burst(p.x,p.y,n||8,{cols:SPARK,sp:7,vz:.4,z:1.3,g:0,life:.24});
  function stepParts(dt){ if(!S.parts||!S.parts.length) return;
    for(const p of S.parts){ p.age+=dt; p.x+=p.vx*dt; p.y+=p.vy*dt; p.vz-=p.g*dt; p.z+=p.vz*dt; if(p.z<0){ p.z=0; p.vz*=-.25; p.vx*=.5; p.vy*=.5; } }
    S.parts=S.parts.filter(p=>p.age<p.life); }
  function startSeq(name,a,b){ const v=Math.hypot(a.vx,a.vy)||1;
    S.seq={name,a,b,t0:S.t,a0:{x:a.x,y:a.y},b0:{x:b.x,y:b.y},ux:a.vx/v||0,uy:a.vy/v||1,sp:Math.max(3.5,v),lat:S.cut&&S.t<S.cut.until+.3?S.cut.dir:(b.x<a.x?1:-1),dur:SEQ[name].dur};
    a.seqd=b.seqd=true; b.fxd=true; b.tried=S.t; pop(SEQ[name].label,'#FF8E1C',a); dust(b,10); if(name==='truck'||name==='stiff') sparks(b,8); }
  function runSeq(dt){ const q=S.seq, t=S.t-q.t0, a=q.a, b=q.b, k=Math.min(1,t/q.dur), side=q.ux>=0?'right':'left';
    /* a moves D along the way he was going and L across it */
    const at=(D,L)=>{ a.x=q.a0.x+q.ux*D+q.uy*L*q.lat; a.y=q.a0.y+q.uy*D-q.ux*L*q.lat; };
    const whiff=()=>{ b.state=t<.28?'dive':'down'; b.facing=q.a0.x>=q.b0.x?'right':'left'; const m=Math.min(1,t/.25); b.x=q.b0.x+(q.a0.x-q.b0.x)*m; b.y=q.b0.y+(q.a0.y-q.b0.y)*m; };
    if(q.name==='truck'){ at(1.2*k,0); a.state='truck'; a.facing=side; b.facing=side==='right'?'left':'right'; b.state=t<.36?'fallB':'downB'; b.ff=Math.min(2,Math.floor(t/.12)); b.x=q.b0.x+q.ux*1.5*k; b.y=q.b0.y+q.uy*1.5*k; }
    else if(q.name==='stiff'){ const away=q.b0.x>=q.a0.x?1:-1; at(1.3*k,0); a.state='stiff'; a.facing=away>0?'right':'left'; b.facing=away>0?'right':'left'; b.state=t<.4?'fallF':'down'; b.ff=Math.min(2,Math.floor(t/.13)); b.x=q.b0.x+away*1.1*k; b.y=q.b0.y+q.uy*.3*k; }
    else if(q.name==='juke'){ a.state='run'; a.ph+=dt*16; at(.7*k,1.3*Math.sin(k*Math.PI/2)); a.facing=q.lat>0?'right':'left'; whiff(); }
    else if(q.name==='spin'){ a.state='run'; a.ph+=dt*14; at(1.0*k,.35*Math.sin(k*Math.PI)); a.facing=['up','right','down','left','up'][Math.min(4,Math.floor(k*5))]; whiff(); }
    else if(q.name==='hurdle'){ at(1.9*k,0); a.state='hurdle'; a._st0=S.t-(k<.2?0:k<.75?.15:.45); a.facing=side; a.lift=Math.sin(Math.PI*k)*24; whiff(); }
    if(t>=q.dur){ a.seqd=b.seqd=false; a.lift=0; a.state='run'; a.vx=q.ux*q.sp; a.vy=q.uy*q.sp; a.path=null;
      b.fxd=false; b.down=true; b.missed=true; b.upAt=S.t+1.1; if(b.state!=='downB') b.state='down'; S.seq=null; } }
  /* when a tackle is missed, which move beat him: a juke or spin off a cut, a hurdle over a man diving low in front, a truck from a strong back, or a stiff arm */
  function move(c,p,pw,el){ const v=Math.hypot(c.vx,c.vy)||1, ahead=((p.x-c.x)*c.vx+(p.y-c.y)*c.vy)/v; let name=null;
    if(c.juke&&S.t<c.juke+.15) name=el>.55&&Math.random()<.5?'spin':'juke';
    else if(ahead>.2&&Math.random()<.14+el*.2) name='hurdle';
    else if(pw>.45&&Math.random()<.12+pw*.3) name='truck';
    else if(Math.random()<.35) name='stiff';
    if(!name) return false; startSeq(name,c,p); return true; }
  function update(dt){
    S.t+=dt; const t=S.t, QB=S.QB, carrier=S.carrier;
    if(S.seq) runSeq(dt);
    S.eng.forEach(e=>{ if(e.d.shed) return; e.w+=e.rate*(e.dbl?.5:1)*dt;
      if(e.w>=1){ e.d.shed=true; e.d.blocked=false; e.o.state='run'; e.o.beat=true; return; }
      const ax=e.o.x0+(e.d.x0-e.o.x0)*.5+(S.runCall?(PLAYS[S.call].wide?1:.3)*PLAYS[S.call].dir*Math.max(0,-e.w)*1.5:0);
      const ay=S.runCall?.4-e.w*1.6:.2-Math.max(0,e.w)*2.2;
      e.o.tx=ax; e.o.ty=ay-.45; e.d.tx=ax; e.d.ty=ay+.45; });
    S.P.forEach(p=>{
      if(p.seqd) return;
      if(p.down){ p.vx*=.8; p.vy*=.8; return; }
      let tx=p.x,ty=p.y,vmax=p.vmax;
      const ballAir=S.ball.air, hold=S.ball.holder;
      if(p.side==='o'){
        if(p===carrier){ [tx,ty]=carrierAim(p); if(p.slow&&t<p.slow) vmax*=.6; }
        else if(p.pos==='QB'){ if(!S.runCall){ tx=0; ty=Math.max(-6.5,-4.5-t*2.4); } else { tx=-.6*PLAYS[S.call].dir; ty=-4.6; } }
        else if(p.pos==='OL'){ if(p.blocking&&!p.blocking.shed){ tx=p.tx; ty=p.ty; } else if(p.climb||p.role==='climb'){ const l=p.climb; tx=l.x; ty=l.y-.7; if(dist(p,l)<1.1){ l.blocked=true; l.lockedBy=p; } } else if(carrier&&carrier!==QB){ tx=carrier.x; ty=carrier.y-2; } else { tx=p.x; ty=Math.min(p.y,-1); } }
        else if(ballAir&&dist(p,ballAir.to)<7&&p!==hold){ tx=ballAir.to.x; ty=ballAir.to.y; }
        else if(p.role==='stalk'){ const c=S.CB[p===S.rec[0]?0:1]; tx=c.x; ty=c.y-.8; if(dist(p,c)<1.1&&carrier&&dist(c,carrier)>2){ c.blocked=true; c.lockedBy=p; } }
        else if(p.role==='block'||p.climb){ const l=p.climb||S.LB[1]; tx=l.x; ty=l.y-.7; if(dist(p,l)<1.1){ l.blocked=true; l.lockedBy=p; } }
        else if(p.role==='protect'){ const free=S.LB.find(l=>!l.picked); if(free){ tx=free.x; ty=free.y-.6; if(dist(p,free)<1){ free.picked=true; free.blocked=true; free.lockedBy=p; } } else { tx=-1.5; ty=-5; } }
        else if(p.route&&!carrier){ const r=routeTarget(p); if(r){ tx=r[0]; ty=r[1]; } }
        else if(carrier&&p!==carrier){ tx=carrier.x+(p.x<carrier.x?-2:2); ty=carrier.y+1; }
      } else {
        const seen=Math.max(0,t-(p.react||.25)); if(p.stall&&t<p.stall) vmax*=.4;
        if(p.lockedBy&&!p.down&&dist(p,p.lockedBy)<1.6){ if(Math.random()<dt*(1.3+(p.r-p.lockedBy.r)/25)*(p.lockedBy.pos==='TE'?1.5-A(p.lockedBy,0):1)){ p.lockedBy=null; p.blocked=false; } else { tx=p.lockedBy.x; ty=p.lockedBy.y+.8; vmax=1.2; } }
        else if(p.blocked&&!p.shed&&p.pos==='DL'){ tx=p.tx; ty=p.ty; }
        else if(carrier){ const lead=Math.min(1.1,dist(p,carrier)/p.vmax); tx=carrier.x+carrier.vx*lead; ty=carrier.y+carrier.vy*lead; }
        else if(ballAir&&t-ballAir.t0>(p.react||.25)*.8){ tx=ballAir.to.x; ty=ballAir.to.y; vmax=p.vmax*1.04; }
        else if(p.role==='rush'||p.role==='blitz'){ tx=QB.x; ty=QB.y; if(t<.2) ty=p.y; }
        else if(t<(p.react||.25)){ tx=p.x; ty=p.y+.3; }
        else if(S.runCall&&seen>.45&&hold&&hold!==QB){ tx=hold.x; ty=hold.y; }
        else if(p.role==='man'){ const m=p.man, late=seen>1.7, c=late?.4:Math.max(.9,(p.cush||3)*(1-Math.min(1,seen/1.1))); tx=m.x+(m.x<0?.5:-.5)*(late?0:1); ty=m.y+c; }
        else if(p.role==='zone'){ let best=null,bd=7.5; S.rec.forEach(r=>{ const d2=Math.hypot(r.x-p.spot[0],r.y-p.spot[1]); if(d2<bd){ bd=d2; best=r; } }); if(best){ tx=best.x; ty=best.y+1; } else { tx=p.spot[0]; ty=p.spot[1]; } }
        else if(p.role==='deep'){ let deep=null; S.rec.forEach(r=>{ if(r.y>9&&Math.abs(r.x-p.spot[0])<12&&(!deep||r.y>deep.y)) deep=r; }); if(deep){ tx=deep.x; ty=deep.y+(seen>1.6?.8:2.4); } else { tx=p.spot[0]; ty=p.spot[1]; } }
      }
      steer(p,tx,ty,dt,vmax);
      p.x+=p.vx*dt; p.y+=p.vy*dt;
      const sp=Math.hypot(p.vx,p.vy); if(sp>.6){ p.facing=Math.abs(p.vx)>Math.abs(p.vy)*1.15?(p.vx>0?'right':'left'):(p.vy>0?'up':'down'); }
      if(p.state==='leap') vmax*=.4;
      if(!HOLD.has(p.state)){ if(p.blocking&&!p.blocking.shed||p.lockedBy&&dist(p,p.lockedBy)<1.4||(p.pos==='DL'&&p.blocked&&!p.shed)) p.state='block'; else if(sp>.6) p.state='run'; else if(t>.05) p.state=p.side==='o'&&p.pos==='OL'?'block':'stance'; }
      p.ph+=sp*dt*1.5; if(HOLD.has(p.state)&&p.state!=='dive'&&t>p.until) p.state='run';
      if(p.state==='dive'&&t>p.until){ p.state='down'; p.down=true; }
    });
    S.P.forEach(p=>{ if(p.missed&&p.down&&t>p.upAt){ p.down=false; p.missed=false; p.state='run'; } });
    if(S.runCall&&S.ball.holder===QB&&t>(PLAYS[S.call].delay||.55)){ S.ball.holder=S.RB; S.carrier=S.RB; S.RB.path=PLAYS[S.call].path.map(a=>[a[0],a[1]]); hint('Tap left or right of him to cut'); }
    if(!S.runCall&&S.ball.holder===QB&&!S.carrier){ const r=S.P.find(p=>p.side==='d'&&!p.down&&(p.shed||!p.blocked)&&dist(p,QB)<.75);
      if(r&&!r.escTried&&Math.random()<.06+A(QB,3)*.42){ r.escTried=true; dive(r,QB); r.missed=true; r.upAt=t+1.2; hint('He slipped it'); }
      else if(r){ r.escTried=true; const head=(r.vy*QB.vy+r.vx*QB.vx)<-1, k=Math.random(); fx(r,QB,head&&k<.4?'hit':k<.35?'wrap':k<.68?'sling':'shoe');
        if(QB.y<=-S.yd) return end('Safety','Sacked in his own end zone. Two points to them.','safety',0);
        if(Math.random()<.05+Ad(3)*.08+(1-A(QB,3))*.05){ const spot=fumble(QB); pop('Strip sack','#D9325E',QB);
          if(Math.random()<.55) return end('Strip sack','#'+r.num+' knocks it out of his hand and they fall on it.','to',0,spot);
          return end('Strip sack','#'+r.num+' knocks it loose; your line falls on it.','loss',Math.round(Math.min(QB.y,spot.y))); }
        S.fx.flex=true; pop({sling:'Slung down',shoe:'Chased down',hit:'Sack',wrap:'Sack'}[S.fx.kind]||'Sack','#D9325E',QB);
        return end('Sacked','Down '+Math.max(1,Math.round(-QB.y-1))+' behind the line.','loss',Math.round(QB.y)); } }
    /* the big hit over the middle, a beat after the catch */
    if(S.bigHit&&t>=S.bigHit.at&&S.carrier&&!S.over){ const d=S.bigHit.d, c=S.carrier; S.bigHit=null;
      if(!d.down&&dist(d,c)<2.4){ d.x=c.x+(d.x<c.x?-.5:.5); d.y=c.y+.4;
        if(Math.random()<.34-A(c,HANDS[c.pos]??2)*.2){ S.caught=false; fx(d,c,'hit'); S.ball.holder=null; return end('Jarred loose','#'+d.num+' hits him as it arrives and it comes out.','inc',0,{x:c.x+.7,y:c.y-.5}); }
        return tackled(c,d,'hit'); } }
    const air=S.ball.air;
    if(air&&t>=air.t0+air.dur){ S.ball.air=null; return arrive(air); }
    if(air&&t>=air.t0){ const f=(t-air.t0)/air.dur;
      if(f>.12&&f<.88){ const h=2.1*(1-f)+1.3*f+Math.sin(Math.PI*f)*air.arc,   /* out of his hand at about 6 feet, into the receiver's at his chest */ gx=air.from.x+(air.to.x-air.from.x)*f, gy=air.from.y+(air.to.y-air.from.y)*f;
        for(const p of S.P){ if(p.side!=='d'||p.down||(air.tried&&air.tried.has(p))) continue; if(h>(p.pos==='DL'?2.65:2.5)||Math.hypot(p.x-gx,p.y-gy)>(p.pos==='DL'?.6:.8)) continue;
          (air.tried=air.tried||new Set()).add(p); if(Math.random()>(p.pos==='DL'?.14+Ad(0)*.12:.3+Ad(3)*.25)) continue;
          p.state='leap'; p.leap0=S.t; p.until=S.t+.38; S.ball.air=null; const at={x:gx,y:gy};
          if(Math.random()<.2+Ad(3)*.2){ p.state='catch'; p.x=gx; p.y=gy; S.ball.holder=p; pop('Tipped & picked','#D9325E',p); sparks(p,8); celebrateD(p); return end('Intercepted','#'+p.num+' gets a hand up and it falls to him.','to',0,at); }
          pop(p.pos==='DL'?'Batted down':'Tipped','#D9325E',p); sparks(p,8); return end(p.pos==='DL'?'Batted down':'Tipped away','#'+p.num+' got a hand on it in the air.','inc',0,at); } } }
    const c=S.carrier;
    if(c&&!c.down&&!S.over&&!S.seq){
      for(const p of S.P){ if(p.side!=='d'||p.down||p.state==='dive'||(p.lockedBy&&dist(p,p.lockedBy)<1.3)) continue;
        if(p.pos==='DL'&&p.blocked&&!p.shed){ if(dist(p,c)<.6&&Math.random()<dt*2.2) return tackled(c,p,'wrap'); continue; }
        if(dist(p,c)<.8&&(!p.tried||t-p.tried>.5)){ p.tried=t; const pw=c.pos==='RB'?A(c,2):c.pos==='TE'?A(c,3)*.7:.25, el=c.pos==='RB'?A(c,1):c.pos==='WR'?A(c,1)*.5:c.pos==='QB'?A(c,2)*.5:.25;
          const ok=Math.random()<clamp(.88+(p.r-c.r)/120-pw*.08-el*.04+(Ad(2)-.5)*.2,.3,.96)*(c.juke&&t<c.juke?1-(.12+el*.3):1);
          if(ok) return tackled(c,p); if(move(c,p,pw,el)) break; dive(p,c); p.missed=true; p.upAt=t+1.1; c.slow=t+.35*(1-pw*.6); } }
      if(Math.abs(c.x)>SIDE) return end('Out of bounds',spotText(c),c.y>0?'gain':'loss',Math.round(c.y));
      if(c.y>=S.goal) return end('Touchdown',(c.name||'#'+c.num)+' takes it '+S.goal+' yards to the end zone.','td',S.goal);
    }
    const f=S.ball.air?{x:S.ball.air.from.x+(S.ball.air.to.x-S.ball.air.from.x)*((t-S.ball.air.t0)/S.ball.air.dur),y:S.ball.air.from.y+(S.ball.air.to.y-S.ball.air.from.y)*((t-S.ball.air.t0)/S.ball.air.dur)}:(S.carrier||QB);
    S.cam.x+=(clamp(f.x,-SIDE+VIEW/2-1,SIDE-VIEW/2+1)-S.cam.x)*Math.min(1,dt*3); S.cam.y+=(f.y+4-S.cam.y)*Math.min(1,dt*3);
  }
  const spotText=c=>(c.y>=0?'Gain of '+Math.round(c.y):'Loss of '+Math.round(-c.y))+'.';
  function dive(p,c){ p.state='dive'; p.until=S.t+.3; p.facing=c.x>=p.x?'right':'left'; dust(p,5); }
  /* three ways down: a wrap-up (he's held and taken down forward), a big hit (met head on and knocked back) and a
     shoestring dive from behind (tripped and sent sprawling forward). Both men act it out together. */
  function fx(p,c,kind){
    const dir=Math.abs(c.vx)>.9?Math.sign(c.vx):(p.x<c.x?1:-1);
    c.down=true; c.fxd=true; p.fxd=true; p.down=true; S.fx={kind,a:p,b:c,t0:S.t,dir};
    /* head on (wrap, hit, lift) he's met from the side the tackler is on; from behind (shoe, drag) he's chased from it */
    if(SCENES[kind]){ const front=kind==='wrap'||kind==='hit'||kind==='lift'; Object.assign(S.fx,{scene:true,ax:c.x,ay:c.y,sdir:front?(p.x>=c.x?1:-1):(p.x<=c.x?1:-1)}); } dust(c,14); if(kind==='hit'||kind==='lift') sparks(c,10);
    /* a second man close by piles on */
    const g=S.P.find(d=>d.side==='d'&&d!==p&&!d.down&&!d.seqd&&Math.hypot(d.x-c.x,d.y-c.y)<1.35&&Math.random()<.55);
    if(g){ S.fx.c2=g; g.fxd=true; g.down=true; if(kind!=='hit') pop('Gang tackle','#D9325E',c); } }
  function celebrateD(p){ p.fxd=false; p.down=false; p.lift=0; p.state=p.celeState=['flex','wings','sky','cross','celebrate'][Math.floor(Math.random()*5)]; p.cele0=S.t; p.until=S.t+1.8; p.facing='down'; }
  /* the ball comes out: it bounces to a spot near him */
  function fumble(c){ const spot={x:c.x+(Math.random()-.5)*2.2,y:c.y+(Math.random()-.3)*2}; S.loose={x0:c.x,y0:c.y,to:spot,t0:S.t}; S.ball.holder=null; return spot; }
  function tackled(c,p,kind){
    if(!kind){ const head=(p.vx*c.vx+p.vy*c.vy)<-2&&Math.hypot(p.vx,p.vy)>3, behind=!head&&(p.vx*c.vx+p.vy*c.vy)>4, k=Math.random();
      kind=head?(k<.35&&p.r>=c.r?'lift':'hit'):behind?(k<.28?'drag':'shoe'):(k<.22?'lift':'wrap'); }
    const pw=c.pos==='RB'?A(c,2):c.pos==='TE'?A(c,3)*.7:.25;
    if(kind==='hit') c.y-=.5; else if(c.vy>1) c.y+=pw*1.8;      /* a strong back falls forward for more */
    fx(p,c,kind); if(kind==='hit') pop('Big hit','#D9325E',c); if(kind==='lift') pop('Lift & drive','#D9325E',c); if(kind==='drag') pop('Horse collar','#D9325E',c);
    if(c.y<=.5) S.fx.flex=true;
    if(c.y<=-S.yd) return end('Safety','Brought down in his own end zone. Two points to them.','safety',0);
    if(Math.random()<.004+Ad(3)*.012+(1-A(c,HANDS[c.pos]??2))*.008){ const spot=fumble(c); pop('Stripped','#D9325E',c);
      if(Math.random()<.55) return end('Fumble','#'+p.num+' punches it out and they fall on it.','to',0,spot);
      const y=Math.round(c.y); return end('Fumble','#'+p.num+' knocks it loose, and you fall on it'+(y>=0?' for '+y:', a loss of '+(-y))+'.',y>0?'gain':'loss',y); }
    const y=Math.round(c.y), who=c.name?c.name.split(' ').slice(-1)[0]:'#'+c.num;
    const how={hit:'Hit by',shoe:'Tripped up by',wrap:'Brought down by',drag:'Dragged down by',lift:'Picked up and driven down by'}[kind];
    return end(y>=15?'Big play':kind==='hit'&&y<=2?'Big hit':y>0?'Tackled':'Stopped',who+(y>=0?' for '+y:' loses '+(-y))+(S.caught?' after the catch':'')+'. '+how+' #'+p.num+'.',y>0?'gain':'loss',y); }
  /* each frame of a tackle, from its first contact */
  const SCENE_END=1.3;
  function runFx(dt){ const e=S.fx; if(!e) return; const t=S.t-e.t0, a=e.a, b=e.b, d=e.dir;
    a.facing=d>0?'right':'left'; b.facing=a.facing;
    if(e.scene){ const sc=SCENES[e.kind];
      if(t<SCENE_END){ a.state='down'; b.state='down'; a.ff=b.ff=1; }
      if(t>=sc.len&&!e.placed){ e.placed=1; const qa=sceneAt(sc.A.k,sc.len), qb=sceneAt(sc.B.k,sc.len), yd=1.5/K;
        b.x=e.ax+e.sdir*qb[11]*yd; b.y=e.ay; a.x=e.ax+e.sdir*qa[11]*yd; a.y=e.ay+.05; } }
    else
    if(e.kind==='sling'||e.kind==='drag'||e.kind==='lift'){}
    else if(e.kind==='wrap'){ a.state=t<.32?'wrap':'down'; a.ff=0; b.state=t<.42?'fallF':'down'; b.ff=Math.min(2,Math.floor(t/.13));
      if(t<.42){ b.x+=d*dt*1.4; } a.x=b.x-d*(t<.32?.55:.4); a.y=b.y+.05; }
    else if(e.kind==='hit'){ b.facing=a.x>b.x?'right':'left'; a.facing=b.facing==='right'?'left':'right';
      a.state=t<.4?'block':'stance'; a.ff=Math.floor(t/.1);
      b.state=t<.36?'fallB':'downB'; b.ff=Math.min(2,Math.floor(t/.12)); if(t<.36){ b.y-=dt*2.4; b.x-=(a.x>b.x?1:-1)*dt*1.2; } }
    else { a.state=t<.3?'dive':'down'; a.ff=0; if(t<.3){ a.x+=(b.x-d*.8-a.x)*Math.min(1,dt*10); a.y+=(b.y-.2-a.y)*Math.min(1,dt*10); }
      b.state=t<.12?'run':t<.48?'fallF':'down'; b.ff=Math.min(2,Math.floor((t-.12)/.12)); if(t<.48){ b.x+=d*dt*2; b.y+=dt*1.5; } }
    if(e.scene){}
    else if(e.kind==='drag'){ a.state=t<.45?'drag':'down'; a.ff=0; b.state=t<.4?'fallB':'downB'; b.ff=Math.min(2,Math.floor(t/.13)); if(t<.4) b.x-=d*dt*1.1; a.x=b.x-d*(t<.45?.7:.9); a.y=b.y-.1; }
    else if(e.kind==='lift'){ a.state=t<.5?'wrap':'down'; a.ff=0; a.x=b.x-d*.5; a.y=b.y+.05;
      if(t<.3){ b.state='flail'; b.lift=Math.sin(Math.min(1,t/.3)*Math.PI/2)*16; } else if(t<.58){ b.state='fallF'; b.ff=Math.min(2,Math.floor((t-.3)/.09)); b.lift=16*(1-(t-.3)/.28); b.x+=d*dt*1.2; } else { b.state='down'; b.lift=0; } }
    else if(e.kind==='sling'){ a.state=t<.5?'wrap':'down'; a.ff=0; a.x=b.x-d*.5;
      if(t<.45){ b.state='run'; b.ph+=dt*20; b.facing=['right','down','left','up','right'][Math.min(4,Math.floor(t/.09))]; } else { b.state='down'; b.facing=a.facing; } }
    if(e.c2){ const g=e.c2; g.facing=g.x<b.x?'right':'left'; if(t<.32){ g.state='dive'; g.x+=(b.x-g.x)*Math.min(1,dt*8); g.y+=(b.y+.25-g.y)*Math.min(1,dt*8); } else g.state='down'; }
    if(t>1.3&&t<1.6){ if(!e.cele) a.state='kneel'; b.state='kneel'; if(e.c2) e.c2.state='kneel'; }
    else if(t>=1.6){ if(!e.cele){ a.state='stance'; a.facing='down'; } b.state='stance'; b.facing='up'; b.lift=0; if(e.c2){ e.c2.state='stance'; e.c2.facing='down'; } }
    if(e.flex&&t>(e.scene?SCENE_END:.85)){ if(!e.cele){ e.cele=1; celebrateD(a); } a.state=a.celeState; a.facing='down'; a.fxd=false; }   /* the man who made it gets up and lets them know */
    if(t>2.4) S.fx=null; }
  /* a receiver's catch radius, and where he will be after a throw of this power gets to him */
  const catchR=r=>1.35+A(r,HANDS[r.pos]??2)*.65;
  function routeAt(p,t){ const v=p.vmax; let left=Math.max(0,t-.05)*v, x=p.x0, y=p.y0; for(const [rx,ry] of p.route){ const tx=p.x0+rx, ty=p.y0+ry, seg=Math.hypot(tx-x,ty-y); if(left<=seg){ const f=left/seg; return {x:x+(tx-x)*f,y:y+(ty-y)*f}; } left-=seg; x=tx; y=ty; } return {x,y}; }
  function leadOf(r,power){ const QB=S.QB, arm=A(QB,0), iv=power>.7?.06:power<.3?.13:.1, fl=d=>(.22+d*.03*(1.2-arm*.4))*(1.45-.8*power)+iv;
    let t=fl(Math.hypot(r.x-QB.x,r.y-QB.y)), q=null;
    for(let i=0;i<2;i++){ const ahead=routeAt(r,S.t+t), lag={x:ahead.x-(ahead.x-r.x)*.08,y:ahead.y-(ahead.y-r.y)*.08}; q=r.route&&!S.carrier?lag:{x:r.x+r.vx*t,y:r.y+r.vy*t}; t=fl(Math.hypot(q.x-QB.x,q.y-QB.y)); }
    return q; }
  function throwTo(px,py,power){
    if(S.phase!=='live'||S.ball.holder!==S.QB||S.runCall) return; if(power==null) power=.5;
    const QB=S.QB, aim=toY(px,py), d=Math.hypot(aim.x-QB.x,aim.y-QB.y);
    const rush=Math.min(...S.P.filter(p=>p.side==='d'&&(p.shed||!p.blocked)).map(p=>dist(p,QB)),99);
    /* accuracy sets how far a throw strays; arm keeps long ones on line and gets them there sooner; pressure costs less the better he escapes */
    const arm=A(QB,0), acc=A(QB,1), sig=(.95-acc*.65)*(.3+d/24*(1.2-arm*.55))+(rush<2.5?.9*(1-.35*A(QB,3)):0);
    const to={x:aim.x+gauss()*sig, y:aim.y+gauss()*sig};
    S.tgt=S.rec.filter(r=>!r.down).sort((a,b)=>Math.hypot(a.x-aim.x,a.y-aim.y)-Math.hypot(b.x-aim.x,b.y-aim.y))[0]||null;
    /* how he throws it: a bullet comes out quick, a lob with a long wind-up, on the move from the side, a jump pass with a man in his face, or his standard throw */
    const moving=Math.hypot(QB.vx,QB.vy)>2.2, style=rush<1.6?'jump':moving?'run':power>.7?'quick':power<.3?'lob':'standard', iv={quick:.06,lob:.13,run:.08,jump:.09,standard:.1}[style];
    /* a lob hangs: half again as long in the air and high enough to clear the men underneath; a bullet gets there in two thirds of the time, flat */
    const dur=(.22+d*.03*(1.2-arm*.4))*(1.45-.8*power), arc=Math.max(.8,d*(.34-.28*power));
    S.ball.air={from:{x:QB.x,y:QB.y},to,aim,t0:S.t+iv,dur,d,arc,power}; S.ball.holder=null; S.thrown=true;
    QB.state='throw'; QB.throw0=S.t; QB.throwIv=iv; QB.throwStyle=style; QB.until=S.t+iv*4; if(style==='run') QB.facing=QB.vx>=0?'right':'left'; buttons(); hint('');
  }
  function arrive(a){
    const to=a.to, off=S.rec.filter(r=>!r.down).map(r=>[r,dist(r,to)]).sort((x,y)=>x[1]-y[1])[0], def=S.P.filter(p=>p.side==='d'&&!p.down&&p.pos!=='DL').map(p=>[p,dist(p,to)]).sort((x,y)=>x[1]-y[1])[0];
    const od=off?off[1]:99, dd=def?def[1]:99;
    const rh=off?A(off[0],HANDS[off[0].pos]??2):.5, R=1.35+rh*.65;   /* how far he can reach for it, 1.35 to 2 yards */
    if(od>R+.3&&dd>1.2) return end('Incomplete','Nobody near it.','inc',0,to);
    if(dd<od-.45&&dd<1.05){ const d=def[0]; d.state='leap'; d.leap0=S.t; d.until=S.t+.38; if(Math.random()<clamp(.24+(d.r-80)/80+(1.3-dd)*.25+(Ad(3)-.5)*.35,.08,.8)){ d.x=to.x; d.y=to.y; S.ball.holder=d;
        const k=dd>.7?'dive':d.y<to.y-.2?'catchLow':Math.random()<.3?'oneHand':'leap';
        d.state=k==='leap'?'leap':k; d.until=S.t+.35; if(k==='dive') dive(d,{x:to.x}); d.leapH=k==='leap'?18:0;
        pop({dive:'Diving pick',catchLow:'Undercut',oneHand:'One-hand pick',leap:'Picked off'}[k],'#D9325E',d); return end('Intercepted','#'+d.num+' was there first.','to',0,to); }
      if(dd>.6&&Math.random()<.5){ dive(d,{x:to.x}); pop('Pass breakup','#D9325E',d); } else pop('Swatted','#D9325E',d);
      return end('Broken up','#'+d.num+' got a hand on it.','inc',0,to); }
    const r=off[0], d=def&&def[0], hands=.7+A(r,HANDS[r.pos]??2)*.27, ct=CONT[r.pos]!=null?A(r,CONT[r.pos]):.3;
    const contested=dd<1.1, contest=dd<.7?.45+ct*.45:dd<1.3?.72+ct*.25:1, diving=od>R*.8, reach=od<R*.5?1:od<R*.8?.9:.6;
    /* both go up for it when it's contested */
    if(contested&&d){ d.state='leap'; d.leap0=S.t; d.until=S.t+.38; }
    const caught=Math.random()<clamp(hands*contest*reach,.05,.97);
    if(caught&&diving){ S.caught=true; S.catcher=r; pop('Diving catch','#4C9EFF',r); r.facing=to.x>=r.x?'right':'left'; r.x=to.x-(to.x>=r.x?.6:-.6); r.y=to.y-.2; dive(r,{x:to.x}); r.until=S.t+.25; S.ball.holder=r;
      const y=Math.round(to.y); return end(y>=S.goal?'Touchdown':'Diving catch',(r.name||'#'+r.num)+' lays out for it'+(y>=S.goal?' in the end zone.':', '+y+' yards.'),y>=S.goal?'td':'gain',y>=S.goal?S.goal:y); }
    if(caught){ S.caught=true; S.catcher=r; r.x=to.x; r.y=to.y; S.ball.holder=r; S.carrier=r; r.path=null; r.route=null; hint('Tap left or right of him to cut');
      if(contested){ r.state='leap'; r.leap0=S.t; r.until=S.t+.38; if(ct>.6&&Math.random()<.65){ r.leapH=28; if(d) d.leapH=10; pop('Over the top','#4C9EFF',r); } }
      else if(Math.abs(to.x)>SIDE-2.4){ r.state='tiptoe'; r.until=S.t+.42; r.slow=S.t+.42; pop('Toe tap','#4C9EFF',r); }
      else if(od>R*.35&&Math.random()<.5){ r.state='oneHand'; r.until=S.t+.38; pop('One hand','#4C9EFF',r); }
      else if(hands<.88&&Math.random()<.2){ S.bobble={r,t0:S.t}; r.state='catchLow'; r.until=S.t+.48; r.slow=S.t+.48; pop('Bobbled','#F0CE26',r); }
      else if(a.d>17){ r.state='catch'; r.until=S.t+.3; }                       /* over the shoulder, hands high */
      else if(a.d<8){ r.state='catchLow'; r.until=S.t+.28; }                    /* a short one, into the basket */
      else if(od>.6){ r.state='reach'; r.until=S.t+.3; r.reachL=to.x<r.x; }     /* stretched out for it */
      else { r.state='catch'; r.until=S.t+.25; }
      if(r.y>=S.goal) return end('Touchdown',(r.name||'#'+r.num)+' catches it in the end zone.','td',S.goal);
      if(Math.abs(to.x)<5.5&&to.y>3&&d&&dd<2.4) S.bigHit={d,at:S.t+(contested?.34:.18)};
      return; }
    if(diving){ dive(r,{x:to.x}); r.facing=to.x>=r.x?'right':'left'; pop('Just missed','#F0CE26',r); }
    else if(dd>=1.6){ r.state='catchLow'; r.until=S.t+.4; S.loose={x0:r.x,y0:r.y,to:{x:r.x+(Math.random()-.5)*1.6,y:r.y-.8},t0:S.t}; pop('Dropped','#F0CE26',r); }
    else pop('Broken up','#D9325E',d||r);
    end(dd<1.6?'Broken up':'Incomplete',dd<1.6?'Contested, and the defender won it.':diving?'He laid out for it and couldn\'t hold on.':'Off his hands.','inc',0,to);
  }
  function end(head,body,kind,yards,at){
    if(S.over) return; S.over=true; S.phase='done'; S.ball.air=null; if(at&&kind!=='to') S.landed=at;
    S.result={head,body,kind,yards,at:at?{x:at.x,y:at.y}:null};
    if(kind==='td'){ const sc=S.carrier||S.ball.holder; if(sc&&!sc.fxd&&sc.state!=='dive'){ const k=['celebrate','spike','dance','bow','sky'][Math.floor(Math.random()*5)]; sc.state=k; sc.cele0=S.t; sc.until=S.t+2.2; sc.facing=k==='bow'?(sc.vx>=0?'right':'left'):'down';
      if(k==='spike'){ S.ball.holder=null; S.loose={x0:sc.x,y0:sc.y,to:{x:sc.x+.8,y:sc.y-.6},t0:S.t+.15}; } } pop('Touchdown','#4ade80',sc||S.QB); const cc=sc||S.QB; burst(cc.x,cc.y,80,{cols:CONF,sp:3.2,vz:7,z:2,g:2.4,life:2.4,s:3}); }
    const col={td:'#4ade80',gain:'#4ade80',loss:'#D9325E',to:'#D9325E',safety:'#D9325E',inc:'#F0CE26'}[kind]||'#FDFEFC';
    if(MATCH) MATCH.played(S.result);
    setTimeout(()=>{ $('#res').innerHTML=`<small>They were in ${LOOKS[S.look]}</small><b style="color:${col}">${head}</b><span>${body}</span>`; $('#res').className='result show'; buttons(); },650);
    hint('');
  }
  function hint(s){ $('#hint').textContent=s; $('#hint').style.display=s?'':'none'; }
  function draw(){
    if(!W||!S.ball) return;
    ctx.fillStyle='#171717'; ctx.fillRect(0,0,W,H);
    const top=toY(0,0).y+2, bot=toY(0,H).y-2, [sl]=toS(-SIDE,0), [sr]=toS(SIDE,0), [ox,oy]=toS(0,0), xl=Math.max(sl,0), xr=Math.min(sr,W);
    const back=-S.yd-10, front=S.goal+10, [,yb]=toS(0,back), [,yf]=toS(0,front);
    ctx.fillStyle='#1F5A2E'; ctx.fillRect(sl,yf,sr-sl,yb-yf);
    ctx.fillStyle='#246335'; for(let yd=Math.floor(bot/5)*5;yd<=top;yd+=5){ if(((Math.floor((S.yd+yd)/5))%2+2)%2) continue; const ya=toS(0,yd)[1], yb2=toS(0,yd+5)[1];
      const y0=Math.max(yf,Math.min(ya,yb2)), y1=Math.min(yb,Math.max(ya,yb2)); if(y1>y0) ctx.fillRect(sl,y0,sr-sl,y1-y0); }
    /* end zones: theirs a field of sky dots with the league's mark, ours a field of faint dots */
    [[S.goal,'rgba(76,158,255,.55)','GFL'],[-S.yd-10,'rgba(253,254,252,.2)','']].forEach(([a,col,mark])=>{ const [,e1]=toS(0,a+10),[,e0]=toS(0,a),[,em]=toS(0,a+5); if(e0<0||e1>H) return;
      ctx.fillStyle=dotFill(ctx,col,5,ox,oy); ctx.fillRect(sl,e1,sr-sl,e0-e1);
      if(mark){ ctx.font='400 30px Cardo'; ctx.textAlign='center'; ctx.textBaseline='middle'; const tw=ctx.measureText(mark).width; ctx.fillStyle='#1D1D1D'; ctx.fillRect(W/2-tw/2-12,em-19,tw+24,36);
        ctx.fillStyle='rgba(253,254,252,.8)'; ctx.fillText(mark,W/2,em+1); ctx.textBaseline='alphabetic'; } });
    ctx.fillStyle='#2E2E2E'; ctx.fillRect(Math.round(sl)-1,yf,1,yb-yf); ctx.fillRect(Math.round(sr),yf,1,yb-yf);
    const [h1]=toS(-HASH,0),[h2]=toS(HASH,0);
    for(let yd=Math.max(Math.ceil(bot),-S.yd);yd<=Math.min(top,S.goal);yd++){ const y=Math.round(toS(0,yd)[1]), abs=S.yd+yd;
      if(abs%5===0){ ctx.fillStyle=abs%10===0||abs===0||abs===100?'rgba(253,254,252,.36)':'rgba(253,254,252,.18)'; for(let x=xl+((ox-xl)%5+5)%5;x<xr;x+=5) ctx.fillRect(x-.75,y-.75,1.5,1.5); }
      ctx.fillStyle='rgba(253,254,252,.2)'; ctx.fillRect(Math.round(h1)-2,y,4,1); ctx.fillRect(Math.round(h2)-2,y,4,1);
      if(abs%10===0&&abs>0&&abs<100){ const line=50-Math.abs(50-abs); ctx.font='500 9.5px JetBrains Mono'; ctx.fillStyle='rgba(253,254,252,.45)';
        ctx.textAlign='left'; ctx.fillText(String(line),xl+7,y-5); ctx.textAlign='right'; ctx.fillText(String(line),xr-7,y-5); } }
    const [,los]=toS(0,0); ctx.fillStyle='#4C9EFF'; ctx.fillRect(sl,Math.round(los)-1,sr-sl,2);
    if(S.togo<S.goal){ const [,fd]=toS(0,S.togo); ctx.fillStyle='#F0CE26'; ctx.fillRect(sl,Math.round(fd)-1,sr-sl,2); }
    if(S.phase==='pre'){ ctx.save(); ctx.lineJoin='round'; ctx.lineCap='round';
      const path=(pts,col,w,dash)=>{ ctx.strokeStyle=ctx.fillStyle=col; ctx.lineWidth=w; ctx.setLineDash(dash); ctx.beginPath(); pts.forEach(([x,y],i)=>{ const [a,b]=toS(x,y); i?ctx.lineTo(a,b):ctx.moveTo(a,b); }); ctx.stroke(); ctx.setLineDash([]);
        const [ax,ay]=toS(...pts[pts.length-2]), [bx,by]=toS(...pts[pts.length-1]), an=Math.atan2(by-ay,bx-ax), co=Math.cos(an), si=Math.sin(an);
        ctx.beginPath(); ctx.moveTo(bx+co*3,by+si*3); ctx.lineTo(bx-co*5-si*4,by-si*5+co*4); ctx.lineTo(bx-co*5+si*4,by-si*5-co*4); ctx.fill(); };
      S.P.forEach(p=>{ if(p.route) path([[p.x,p.y],...p.route.map(([rx,ry])=>[p.x+rx,p.y+ry])],'rgba(76,158,255,.7)',1.6,[5,4]); });
      if(S.runCall) path([[S.RB.x,S.RB.y],...PLAYS[S.call].path.map(([x,y],i,a)=>i===a.length-1?[x,y+1]:[x,y])],'rgba(255,142,28,.85)',2.2,[]);
      ctx.restore(); }
    const u=PU*1.5;
    /* WHILE YOU THROW: each receiver's catch radius is a ring of dots at his feet (bigger, the better his Hands), and a
       dashed ring shows where he'll be when the ball gets there, thrown the way you're holding it now. Let go inside
       that ring and the throw goes to him. */
    if(S.phase==='live'&&S.ball.holder===S.QB&&!S.runCall&&S.carrier!==S.QB){ const pw=S.hold?clamp((performance.now()-S.hold.t0)/1500,0,1):0;
      ctx.save(); S.rec.forEach(r=>{ if(!r.route||r.down) return; const R=catchR(r)*K, [x,y]=toS(r.x,r.y), q=leadOf(r,pw), [lx,ly]=toS(q.x,q.y);
        ctx.fillStyle='rgba(253,254,252,.45)'; for(let a=0;a<P2;a+=P2/Math.max(10,Math.round(R/3.2))) ctx.fillRect(Math.round(x+Math.cos(a)*R)-1,Math.round(y+Math.sin(a)*R*.55)-1,2,2);
        ctx.strokeStyle='rgba(76,158,255,.85)'; ctx.fillStyle='rgba(76,158,255,.10)'; ctx.lineWidth=1.5; ctx.setLineDash([4,3]);
        ctx.beginPath(); ctx.ellipse(lx,ly,R,R*.55,0,0,P2); ctx.fill(); ctx.stroke(); ctx.setLineDash([]);
        ctx.strokeStyle='rgba(76,158,255,.35)'; ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(lx,ly); ctx.stroke(); }); ctx.restore(); }
    const E=S.fx&&S.fx.scene&&S.t-S.fx.t0<SCENE_END?S.fx:null;
    const dk=p=>p.y-(p===S.catcher&&CATCHING.has(p.state)?3:0);
    [...S.P].sort((a,b)=>dk(b)-dk(a)).forEach(p=>{ const [x,y]=toS(p.x,p.y);
      if(E&&p===E.a) return;
      if(E&&p===E.b){ const [ax,ay]=toS(E.ax,E.ay), si=q=>((q.num||0)*7)%SKIN.length;
        const hand=drawScene(ctx,E.kind,S.t-E.t0,ax,ay,E.sdir,1.5,{A:{k:E.a.side,si:si(E.a)},B:{k:E.b.side,si:si(E.b)}});
        if(S.ball.holder===p&&hand) drawBall(ctx,hand[0],ay,Math.max(2,ay-hand[1]),1.5,0,true);
        return; }
      if(p._st!==p.state){ p._st=p.state; p._st0=S.t; } const age=S.t-(p._st0||0);
      let st=p.state, fr=p.fxd?(p.ff||0):(st==='run'?p.ph%8:0), face=p.facing, lift=0;
      /* frames: a one-off plays through by time, a loop alternates */
      if(ONESHOT[st]) fr=stageOf(ONESHOT[st],age); else if(LOOP.has(st)) fr=Math.floor(age/.12)%2;
      if(st==='catch') fr=(p.ph%8)+100*stageOf(ONESHOT.catch,age);
      if(st==='throw'){ fr=1+Math.min(2,Math.floor((S.t-(p.throw0||0))/(p.throwIv||.1))); if(p.throwStyle==='jump') lift=Math.max(0,Math.sin(Math.PI*clamp((S.t-p.throw0)/.4,0,1)))*12; }
      else if(p===S.QB&&S.ball.holder===p&&!S.runCall&&S.phase==='live'&&st==='stance'){ st='throw'; fr=0; }
      if(st==='leap') lift=Math.max(0,Math.sin(Math.PI*clamp((S.t-p.leap0-.06)/.32,0,1)))*(p.leapH||16);
      if(p.lift) lift=p.lift;
      if(st==='celebrate'){ fr=Math.floor((S.t-p.cele0)/.22)%2; lift=Math.abs(Math.sin((S.t-p.cele0)*Math.PI/.44))*12; }
      else if(st==='spike'){ st='throw'; fr=S.t-p.cele0<.15?1:3; }
      else if(st==='dance'){ st=Math.floor((S.t-p.cele0)/.25)%2?'reach':'oneHand'; lift=Math.floor((S.t-p.cele0)/.25)%2?3:0; }
      else if(st==='sky'){ st='catch'; fr=0; }
      else if(st==='cross'){ st='throw'; fr=0; }
      if(st==='reach'&&(face==='up'||face==='down')) face=p.reachL?'upL':'up';
      if(p.plantUntil&&S.t<p.plantUntil&&st==='run'){ st='plant'; fr=0; if(face==='up'||face==='down') face=p.plantDir<0?'upL':'up'; }
      /* a ring under his feet in his tier's colour */
      if(!LYING.has(st)){ ctx.strokeStyle=TIERC[TIER(p.r)]; ctx.lineWidth=2; ctx.beginPath(); ctx.ellipse(Math.round(x),Math.round(y)+1,13,4.5,0,0,P2); ctx.stroke(); }
      drawPlayer(ctx,p.side,p.num,x,y,face,st,fr,1.5,lift);
      /* the ball stays in his arms, wherever his body is: falling, down, on his back, laid out */
      if(S.ball.holder===p&&S.phase!=='pre'){ const d=face==='left'||face==='upL'?-1:1, side=face==='left'||face==='right', q=ballSpot(st,fr);
        const bb=S.bobble&&S.bobble.r===p&&S.t-S.bobble.t0<.45?(S.t-S.bobble.t0)/.45:-1;
        if(bb>=0) drawBall(ctx,x,y,60*u+Math.abs(Math.sin(bb*Math.PI*2))*18+lift,1.5,bb*7,true);
        else if(CATCHING.has(st)&&p===S.catcher){ const h=handPoint(st,fr,face,1.5); drawBall(ctx,x+h[0],y,Math.max(2,-h[1]+lift),1.5,0,true); }
        else if(q) drawBall(ctx,x+d*q[0]*u,y,Math.max(2,q[1]*u),1.5,0,true);
        else if(p===S.QB&&!S.carrier) drawBall(ctx,x+9*u,y,70*u+lift,1.5,-1.1,true);
        else drawBall(ctx,x+(side?d*10:-11)*u,y,56*u+lift,1.5,side?-d*.45:-.9,true); } });
    const air=S.ball.air; if(air){ const f=clamp((S.t-air.t0)/air.dur,0,1), A=clamp((air.arc||2)*K*.85,6,140), x=air.from.x+(air.to.x-air.from.x)*f, y=air.from.y+(air.to.y-air.from.y)*f, [bx,by]=toS(x,y), [fx,fy]=toS(air.from.x,air.from.y), [tx,ty]=toS(air.to.x,air.to.y);
      const [ax,ay]=toS(air.aim.x,air.aim.y); ctx.strokeStyle='rgba(76,158,255,.85)'; ctx.lineWidth=1.5; ctx.beginPath(); ctx.arc(ax,ay,6,0,P2); ctx.stroke();
      const lift=Math.sin(f*Math.PI)*A+u*(72-40*f), dl=Math.PI*Math.cos(f*Math.PI)*A-40*u;
      if((air.power||0)>.6&&f>0){ for(let k=1;k<=4;k++){ const g=Math.max(0,f-k*.035), gx=air.from.x+(air.to.x-air.from.x)*g, gy=air.from.y+(air.to.y-air.from.y)*g, [sx,sy]=toS(gx,gy);
        ctx.globalAlpha=.42-k*.09; drawBall(ctx,sx,sy,Math.sin(g*Math.PI)*A+u*(72-40*g),1.5,Math.atan2((ty-fy)-dl,tx-fx),true); } ctx.globalAlpha=1; }
      drawBall(ctx,bx,by,lift,1.5,Math.atan2((ty-fy)-dl,tx-fx)); }
    if(S.parts&&S.parts.length){ for(const p of S.parts){ const [x,y]=toS(p.x,p.y); ctx.globalAlpha=Math.max(0,1-p.age/p.life); ctx.fillStyle=p.col; ctx.fillRect(Math.round(x-p.s/2),Math.round(y-p.z*K*.6-p.s/2),p.s,p.s); } ctx.globalAlpha=1; }
    if(S.landed&&S.phase==='done'&&!S.loose){ const [x,y]=toS(S.landed.x,S.landed.y); drawBall(ctx,x,y,2,1.5,.35); }
    if(S.loose){ const L=S.loose, k=clamp((S.t-L.t0)/.7,0,1), [bx,by]=toS(L.x0+(L.to.x-L.x0)*k,L.y0+(L.to.y-L.y0)*k); drawBall(ctx,bx,by,2+Math.abs(Math.sin(k*Math.PI*2.5))*(1-k)*24,1.5,k*9); }
    /* the callouts: a label over the moment, in the site's chips */
    ctx.font='600 10px JetBrains Mono'; ctx.textAlign='center'; ctx.textBaseline='middle';
    S.pops.forEach((q,i)=>{ const age=S.t-q.t0; if(age>1.4||!q.p) return; const [x,y]=toS(q.p.x,q.p.y), a=age>1.1?1-(age-1.1)/.3:1, txt=q.text.toUpperCase(), w=ctx.measureText(txt).width+16, yy=y-88-Math.min(age,.4)*30-i%2*0;
      ctx.globalAlpha=a; ctx.fillStyle='rgba(23,23,23,.94)'; ctx.fillRect(Math.round(x-w/2),Math.round(yy-11),Math.round(w),22); ctx.fillStyle=q.col; ctx.fillRect(Math.round(x-w/2),Math.round(yy-11),Math.round(w),2);
      ctx.fillStyle='#FDFEFC'; ctx.fillText(txt,Math.round(x),Math.round(yy+1)); ctx.globalAlpha=1; });
    ctx.textBaseline='alphabetic';
    /* slow motion shows as a letterbox */
    if(S.hold||S.t<(S.slow||0)){ ctx.fillStyle='rgba(6,6,6,.88)'; ctx.fillRect(0,0,W,12); ctx.fillRect(0,H-12,W,12); }
    /* the press: a ring where the ball is going, filling as you hold, from LOB to ZIP */
    if(S.hold){ const k=clamp((performance.now()-S.hold.t0)/1500,0,1), x=S.hold.px, y=S.hold.py, col=k<.5?'#4C9EFF':'#FF8E1C';
      ctx.strokeStyle='rgba(253,254,252,.35)'; ctx.lineWidth=2; ctx.beginPath(); ctx.arc(x,y,13,0,P2); ctx.stroke();
      ctx.strokeStyle=col; ctx.lineWidth=3; ctx.beginPath(); ctx.arc(x,y,13,-Math.PI/2,-Math.PI/2+P2*Math.max(.02,k)); ctx.stroke();
      ctx.font='600 9px JetBrains Mono'; ctx.textAlign='center'; ctx.fillStyle='#FDFEFC'; ctx.fillText(k<.34?'LOB':k<.67?'TOUCH':'ZIP',x,y+28); }
    /* a cut shows as a pair of chevrons on the side he went */
    if(S.cut&&S.carrier&&S.t<S.cut.t0+.4){ const [x,y]=toS(S.carrier.x,S.carrier.y), a=Math.max(0,1-(S.t-S.cut.t0)/.4), d=S.cut.dir; ctx.strokeStyle='rgba(76,158,255,'+a.toFixed(2)+')'; ctx.lineWidth=2.5;
      [0,8].forEach(o=>{ const bx=x+d*(26+o); ctx.beginPath(); ctx.moveTo(bx-d*5,y-38); ctx.lineTo(bx,y-32); ctx.lineTo(bx-d*5,y-26); ctx.stroke(); }); }
  }
  let last=0;
  function loop(now){ const rdt=Math.min(.04,(now-last)/1000)||0; last=now;
    try{ if(S.on){ const slow=S.t<(S.slow||0), dt=rdt*(S.hold?.45:1)*(slow?.4:1), M=MATCH;
      if(S.phase==='live'){ update(S.seq?dt*.5:dt); if(S.fx) runFx(dt); if(M&&M.liveTick) M.liveTick(dt); }
      else if(S.phase==='regroup'){ runRegroup(rdt); if(M&&M.preTick) M.preTick(rdt); }
      else if(S.phase==='pre'){ if(M&&M.preTick) M.preTick(rdt); }
      else if(S.phase==='done'&&S.t<99){ S.t+=dt; if(S.fx) runFx(dt); if(M&&M.preTick) M.preTick(rdt);
      S.P.forEach(p=>{ if(p.fxd) return; if(p.state==='dive'&&S.t>p.until){ p.state='down'; } if(HOLD.has(p.state)&&p.state!=='dive'&&S.t>p.until) p.state='stance'; p.vx*=.85; p.vy*=.85; p.x+=p.vx*dt; p.y+=p.vy*dt; }); } stepParts(dt); draw(); }
    }catch(e){ console.error(e); }
    requestAnimationFrame(loop); }
  function buttons(){
    const pre=S.phase==='pre', live=S.phase==='live', done=S.phase==='done', qbHas=live&&S.ball.holder===S.QB&&!S.runCall, choose=pre||S.phase==='regroup';
    /* Run or Pass, then that side's four for this down */
    $('#calls').innerHTML=`<div class="kind">${['run','pass'].map(k=>`<button data-kind="${k}" class="k-${k}${S.kind===k?' on':''}" ${choose?'':'disabled'}>${k}</button>`).join('')}</div>`+
      `<div class="four4">${S.hand[S.kind].map(k=>`<button data-k="${k}" class="${S.call===k?'on':''}" ${choose?'':'disabled'}>${playSVG(k)}${PLAYS[k].name}</button>`).join('')}</div>`;
    document.querySelectorAll('#calls .kind button').forEach(b=>b.addEventListener('click',()=>{ if(S.kind===b.dataset.kind) return; S.kind=b.dataset.kind; S.call=S.hand[S.kind][0]; reset(true); }));
    document.querySelectorAll('#calls .four4 button').forEach(b=>b.addEventListener('click',()=>{ S.call=b.dataset.k; reset(true); }));
    if(pre&&S.fourth){ const fgd=S.goal+17, fg=fgd<=57;
      $('#acts').innerHTML=`<button id="punt">Punt</button><button class="go" id="goforit">Go for it</button><button id="fg" ${fg?'':'disabled'}>FG · ${fgd} yds</button>`;
      $('#goforit').onclick=()=>{ S.fourth=false; buttons(); }; $('#punt').onclick=()=>MATCH.punt(); $('#fg').onclick=()=>fg&&MATCH.kick(fgd);
      return; }
    const C=MATCH&&MATCH.clockUI?MATCH.clockUI():{run:false,tos:0,canSpike:false}, setting=pre||S.phase==='regroup';
    if(setting){ $('#acts').innerHTML=`<button id="spk" ${C.canSpike&&pre?'':'disabled'}>Spike</button><button class="go" id="hike" ${pre?'':'disabled'}>Hike</button><button id="tmo" ${C.run&&C.tos>0?'':'disabled'}>Timeout ${'●'.repeat(C.tos)}${'○'.repeat(Math.max(0,3-C.tos))}</button>`;
      $('#hike').onclick=hike; $('#spk').onclick=()=>MATCH.spike(); $('#tmo').onclick=()=>MATCH.timeout(); return; }
    $('#acts').innerHTML=`<button id="scr" ${qbHas?'':'disabled'}>Scramble</button><button class="go" id="hike" ${live?'disabled':''}>${done?'Next':'Hike'}</button><button id="away" ${qbHas?'':'disabled'}>Throw away</button>`;
    $('#hike').onclick=hike;
    $('#away').onclick=()=>{ if(S.phase==='live'&&S.ball.holder===S.QB) end('Thrown away','Out of bounds. Next down.','inc',0); };
    $('#scr').onclick=()=>{ if(S.phase==='live'&&S.ball.holder===S.QB&&!S.runCall){ S.carrier=S.QB; S.scram=true; S.QB.vmax*=1.05; hint('Tap left or right of him to cut'); buttons(); } };
  }
  /* match each man from the last play to his place in the next one, by side and position */
  function carry(old,shift){ const groups={}, used={}; old.forEach(o=>{ const k=o.side+o.pos; (groups[k]=groups[k]||[]).push(o); });
    S.P.forEach(p=>{ const k=p.side+p.pos, i=used[k]||0; used[k]=i+1; const o=(groups[k]||[])[i]; if(!o) return;
      p.x=clamp(o.x,-SIDE+1,SIDE-1); p.y=clamp(o.y+shift,p.y0-14,p.y0+14); p.state='run'; }); }
  function regroup(yd,down,togo){ const old=S.P.map(p=>({side:p.side,pos:p.pos,x:p.x,y:p.y})), shift=S.yd-yd;
    sitOnly(yd,down,togo); carry(old,shift); S.phase='regroup'; S.rgT=0; buttons(); hint('Getting set'); }
  function runRegroup(dt){ S.rgT+=dt; let moving=0;
    S.P.forEach(p=>{ const dx=p.x0-p.x, dy=p.y0-p.y, d=Math.hypot(dx,dy);
      if(d>.15){ moving++; const sp=Math.min(d/dt,p.side==='o'?5:4.4); p.x+=dx/d*sp*dt; p.y+=dy/d*sp*dt; p.vx=dx/d*sp; p.vy=dy/d*sp;
        p.facing=Math.abs(dx)>Math.abs(dy)*1.15?(dx>0?'right':'left'):(dy>0?'up':'down'); p.state='run'; p.ph+=sp*dt*1.5; }
      else { p.x=p.x0; p.y=p.y0; p.vx=p.vy=0; p.state=p.home; p.facing=p.side==='o'?'up':'down'; } });
    if(!moving||S.rgT>5){ S.P.forEach(p=>{ p.x=p.x0; p.y=p.y0; p.state=p.home; p.facing=p.side==='o'?'up':'down'; }); S.phase='pre'; buttons(); hint(preHint()); } }
  const preHint=()=>S.fourth?'Fourth down':S.runCall?'Hike, then tap beside the back to cut':'Hike, then tap to lob it, hold to zip it';
  function reset(keepLook){
    const rg=S.phase==='regroup', keep=rg?S.P.map(p=>({side:p.side,pos:p.pos,x:p.x,y:p.y})):null;
    if(!keepLook){ const r=Math.random(), long=S.down>=3&&S.togo>=7; S.look=r<(long?.4:.2)?'blitz':['cover2','cover3','man'][Math.floor(Math.random()*3)]; }
    S.phase='pre'; S.landed=null; S.caught=false; S.result=null; setup(); S.P.forEach(p=>{ p.x0=p.x; p.y0=p.y; p.home=p.state; });
    if(rg){ carry(keep,0); S.phase='regroup'; }
    $('#res').className='result'; hint(rg?'Getting set':preHint()); buttons();
  }
  function hike(){ if(S.phase==='done') return MATCH.next(); if(S.phase!=='pre') return; S.t=0; S.phase='live'; buttons(); hint(S.runCall?'':'Tap to lob it · hold to zip it'); }
  /* THE THROW IS A PRESS. Put a finger where the ball should go: let go at once and it's lobbed, high and soft, over
     whoever is underneath; hold it and it gets flatter and faster, up to a bullet at a second and a half. */
  const fw=$('#fw'); fw.addEventListener('contextmenu',e=>e.preventDefault());
  fw.addEventListener('pointerdown',e=>{ if(!S.on) return; const r=cv.getBoundingClientRect(), px=e.clientX-r.left, py=e.clientY-r.top;
    if(S.phase!=='live') return;
    if(S.ball.holder===S.QB&&!S.runCall&&S.carrier!==S.QB){ S.hold={px,py,t0:performance.now()}; try{ fw.setPointerCapture(e.pointerId); }catch(_){} return; }
    if(S.carrier&&!S.carrier.down&&S.carrier.state!=='leap'&&!S.seq){ const c=S.carrier, [cx]=toS(c.x,c.y), dir=px<cx?-1:1, el=c.pos==='RB'?A(c,1):c.pos==='WR'?.2+A(c,1)*.6:.4;
      /* the plant: he is already going sideways, at nearly full speed, the moment you tap */
      S.cut={dir,until:S.t+.24,t0:S.t}; c.path=null; c.juke=S.t+.34; c.plantUntil=S.t+.1; c.plantDir=dir; const sp=c.vmax*(.9+el*.35); c.vx=dir*sp*.88; c.vy=Math.max(.5,c.vy*.3); dust(c,7,-dir*2.5); } });
  fw.addEventListener('pointermove',e=>{ if(!S.hold) return; const r=cv.getBoundingClientRect(); S.hold.px=e.clientX-r.left; S.hold.py=e.clientY-r.top; });
  fw.addEventListener('pointerup',()=>{ const h=S.hold; S.hold=null; if(!h||S.phase!=='live'||S.ball.holder!==S.QB) return; const pw=clamp((performance.now()-h.t0)/1500,0,1);
    /* let go inside a receiver's lead ring and the ball is thrown to the middle of it; accuracy still decides where it lands */
    const at=toY(h.px,h.py); let px=h.px, py=h.py, best=1e9;
    S.rec.forEach(r=>{ if(!r.route||r.down) return; const q=leadOf(r,pw), d=Math.hypot(q.x-at.x,(q.y-at.y)*1.4); if(d<catchR(r)+.35&&d<best){ best=d; [px,py]=toS(q.x,q.y); } });
    throwTo(px,py,pw); });
  fw.addEventListener('pointercancel',()=>{ S.hold=null; });
  function sitOnly(yd,down,togo){ S.phase='pre'; S.yd=yd; S.down=down; S.togo=togo; S.goal=100-yd; S.fourth=down===4; S.hand={pass:deal('pass'),run:deal('run')}; S.call=S.hand[S.kind][0]; reset(); }
  addEventListener('resize',()=>size());
  requestAnimationFrame(t=>{ last=t; requestAnimationFrame(loop); });
  return { roster(g){ roster=g.slice(0,5); }, setD(d){ D=d; }, sit(yd,down,togo){ sitOnly(yd,down,togo); }, regroup, refresh(){ buttons(); },
    show(on){ S.on=on; if(on) size(); }, S, throwTo, toS, hike, reset, update, size };
}
