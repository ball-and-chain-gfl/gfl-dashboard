/* ═══ THE SNAP ═══
   Every man is a point in yards with a velocity, a top speed and how hard he can change direction. Each frame he picks
   where he wants to be and accelerates toward it. Blocks are contests, coverage is chasing, a catch is whoever gets to
   the ball, and a tackle is a defender reaching the man with it. y is yards past the line of scrimmage. */
/* ═══ THE PLAYBOOK ═══
   Sixteen passes and sixteen runs. Each down deals four of each at random; Run or Pass shows that four.
   A pass is a route for each eligible man, in yards from where he lines up (left receiver WA, right WB, the tight end
   on the right, the back beside the QB). A run is the back's path in yards from the ball, the side it goes (dir) and
   whether it bounces outside (wide). */
/* THE FORMATIONS each play is run from: the shotgun, spread wide to the sidelines, tight and bunched in, the pistol
   (the back straight behind a short gun), and under centre with the back deep */
const FORMS={gun:{WA:[-9.5,-.6],WB:[9.5,-.6],TE:[5.3,-.9],RB:[-1.6,-4.6],QB:[0,-4.5]},
  spread:{WA:[-12.5,-.6],WB:[12.5,-.6],TE:[5.3,-.9],RB:[-1.6,-4.6],QB:[0,-4.5]},
  tight:{WA:[-6.6,-.6],WB:[7.8,-.6],TE:[5.3,-.9],RB:[1.6,-4.6],QB:[0,-4.5]},
  pistol:{WA:[-9.5,-.6],WB:[9.5,-.6],TE:[5.3,-.9],RB:[0,-6.3],QB:[0,-3.7]},
  under:{WA:[-9.5,-.6],WB:[9.5,-.6],TE:[5.3,-.9],RB:[0,-5.8],QB:[0,-1.2]},
  /* out to the sidelines: both receivers on the numbers; trips with the tight end in the slot; empty, the back split out in
     the other slot */
  wide:{WA:[-16,-.6],WB:[16,-.6],TE:[5.3,-.9],RB:[-1.6,-4.6],QB:[0,-4.5]},
  trips:{WA:[-15,-.6],WB:[16,-.6],TE:[9,-.6],RB:[-1.6,-4.6],QB:[0,-4.5]},
  empty:{WA:[-16,-.6],WB:[16,-.6],TE:[9,-.6],RB:[-9,-.6],QB:[0,-4.5]}};
const FNAME={gun:'Shotgun',spread:'Spread',tight:'Tight',pistol:'Pistol',under:'Under center',wide:'Wide',trips:'Trips',empty:'Empty'};
const FORM=FORMS.gun, OLX=[-3.4,-1.7,0,1.7,3.4];
const P_=(name,WA,WB,TE,RB)=>({kind:'pass',name,routes:{WA,WB,TE,RB}});
const R_=(name,path,dir,wide,delay)=>({kind:'run',name,path,dir,wide:!!wide,delay});
/* a jet sweep: the receiver on the far side comes across in motion before the snap, takes it from the QB at full speed
   as he goes past, and runs for the edge on the other side */
const J_=(name,motion,path,dir)=>({kind:'run',name,path,dir,wide:true,jet:motion});
/* ONE SPEED SCALE FOR EVERYONE. A speed stat is a top speed: 40 runs 4.6 yards a second, 99 runs 7.9, the same for every
   position. Each position still runs in its own band (a lineman is slow because linemen are slow): SPD_BASE is where a
   position's slowest and fastest sit, and spdPos says where a man is inside his own band, which is what his speed and
   his burst are built from, so the game plays as before. An overall is the weighted average of a player's four by
   position (POSW for the offense, DW for the defense), so a lineman's low speed barely touches his. */
const SPD_BASE={WR:[5.3,2.2],RB:[5.45,1.8],TE:[5.0,1.8],DB:[6.3,1.6],LB:[5.9,1.3],DL:[5.0,1.0]}, SPI={RB:0,WR:0,TE:2};
const toU=v=>Math.round(Math.max(40,Math.min(99,40+(v-4.6)*59/3.3))), fromU=s=>4.6+(s-40)*3.3/59;
const spdPos=(pos,s)=>{ const B=SPD_BASE[pos]; return B?Math.max(0,Math.min(1,(fromU(s)-B[0])/B[1])):0; };
const POSW={QB:[.25,.25,.25,.25],RB:[.3,.25,.2,.25],WR:[.25,.3,.3,.15],TE:[.3,.3,.1,.3]};
const DW={DL:{rush:.35,stop:.35,tkl:.3,spd:0},LB:{stop:.3,cov:.25,tkl:.35,spd:.1},DB:{cov:.3,hawk:.25,tkl:.2,spd:.25}};
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
  qbdraw:{...R_('QB draw',[[-.4,-3],[0,1],[0,5]],1,0,.95),qb:true},
  draw:R_('Draw',[[-1.6,-5.2],[-.4,-3],[0,1],[0,5]],1,0,.95),
  tossR:R_('Toss right',[[5,-4],[9,-1],[10.5,4]],1,1),
  tossL:R_('Toss left',[[-6,-4],[-10,-1],[-11,4]],-1,1),
  stretchR:R_('Stretch right',[[3,-3],[6.5,-1],[7,4]],1,1),
  stretchL:R_('Stretch left',[[-5,-3],[-8,-1],[-8.5,4]],-1,1),
  trap:R_('Trap',[[-.2,-2.6],[.3,.5],[-.5,5]],1),
  cutback:R_('Cutback',[[3,-2.8],[2,0],[-1.5,4]],-1),
  sweepL:R_('Sweep left',[[-4,-4.2],[-9,-2],[-10,3]],-1,1),
  jetR:J_('Jet sweep',"WA",[[4.5,-2.3],[9,-.8],[10.5,2],[11,5]],1),
  jetL:J_('Jet left',"WB",[[-4.5,-2.3],[-9,-.8],[-10.5,2],[-11,5]],-1),
};
/* where the man in motion is when the ball is snapped, and the line he runs to get there */
const JET_SNAP=-3.4, JET_Y=-2.5;
/* MORE PASSES. block: who stays in to block instead of running a route ('wall': the nearest man to the screen); motion: who
   goes in motion before the snap and where to (he's moving when it's snapped, straight into his route); bite: how long the
   linebackers and safeties step up for the run they think they see; flea: the back takes the handoff and pitches it back. */
Object.assign(PLAYS,{
  bubble:{...P_('Bubble screen',[[0,30]],[[1.2,-1.2],[3.2,-.8],[4,.2]],null,null),block:{TE:'wall'}},
  mscreen:{...P_('Motion screen',[[0,8],[6,14]],[[0,30]],[[0,6],[-1,5]],[[-1.5,.3],[-2,.5]]),motion:{p:'RB',to:[-10.5,-2.4],T:1.1},block:{WA:'wall'}},
  tscreen:{...P_('TE screen',[[0,30]],[[0,12],[-1,10]],[[-1,-1.5],[-1.5,-1]],[[-4,1],[-8,2]]),block:{WB:'wall'}},
  mcorner:{...P_('Motion corner',[[2.5,5],[-4,13],[-8,19]],[[0,12],[-1,10]],[[0,10],[-1,30]],[[-4,1],[-8,2]]),motion:{p:'WA',to:[-8.5,-.8],T:1}},
  mslant:{...P_('Motion slant',[[0,8],[6,14]],[[-2.5,4],[-9,10]],[[3,1],[8,2]],[[-2,2],[-4,3]]),motion:{p:'WB',to:[10,-.8],T:.9}},
  pa:{...P_('Play action',[[0,10],[7,26]],[[0,12],[-14,18]],[[0,6],[-6,8]],[[1.4,3],[5,3.6]]),bite:.9},
  flea:{...P_('Flea flicker',[[0,30]],[[0,10],[-7,26]],[[0,12],[6,20]],[[1.4,2.4],[1.4,2.6]]),flea:true,bite:1.15},
  everts:P_('Empty verts',[[0,30]],[[0,30]],[[0,8],[1,30]],[[0,8],[-1,30]]),
  seam:P_('Trips seam',[[0,12],[11,12]],[[0,6],[0,5]],[[0,30]],[[-4,1],[-8,2]]),
});
/* which formation each play comes out of */
Object.entries({slants:'tight',verts:'wide',mesh:'tight',smash:'trips',curls:'empty',outs:'wide',posts:'spread',dig:'gun',flood:'trips',drive:'tight',ycross:'gun',screen:'gun',fade:'wide',sluggo:'spread',stick:'empty',comeback:'wide',
  bubble:'trips',mscreen:'spread',tscreen:'gun',mcorner:'wide',mslant:'wide',pa:'pistol',flea:'gun',everts:'empty',seam:'trips',
  inside:'pistol',outside:'gun',insideL:'pistol',outsideL:'gun',dive:'under',powerR:'under',powerL:'under',counter:'pistol',draw:'gun',qbdraw:'gun',tossR:'under',tossL:'under',stretchR:'pistol',stretchL:'pistol',trap:'under',cutback:'pistol',sweepL:'gun',jetR:'gun',jetL:'gun'})
  .forEach(([k,f])=>{ if(PLAYS[k]) PLAYS[k].f=f; });
const BOOK={pass:Object.keys(PLAYS).filter(k=>PLAYS[k].kind==='pass'),run:Object.keys(PLAYS).filter(k=>PLAYS[k].kind==='run')};
const deal=kind=>BOOK[kind].slice().sort(()=>Math.random()-.5).slice(0,4);
/* A FIELD GOAL'S ODDS by its length, for both teams: about 98 in 100 from 20 yards, 93 from 30, 81 from 40, 62 from 50,
   45 from 57. Never a sure thing, and always better the closer the kick. */
const fgOdds=d=>clamp(.98-.00035*Math.max(0,d-18)**2,.05,.98);
const LOOKS={cover0:'Cover 0',man:'Cover 1',blitz:'Cover 1 blitz',cover2:'Cover 2',c2man:'Cover 2 man',cover3:'Cover 3',cover4:'Cover 4'};
/* the play drawn small for its button, like a coach's card */
function playSVG(k){
  const PL=PLAYS[k], FORM=FORMS[PL.f||'gun'], X=x=>((clamp(x,-17,17)+17)/34*64).toFixed(1), Y=y=>(31-(y+4.5)*1.3).toFixed(1), run=PL.kind==='run';
  const arrow=(pts,col,w)=>{ const n=pts.length, [ax,ay]=pts[n-2], [bx,by]=pts[n-1], dx=X(bx)-X(ax), dy=Y(by)-Y(ay), L=Math.hypot(dx,dy)||1, ux=dx/L, uy=dy/L, ex=+X(bx), ey=+Y(by);
    return `<polyline points="${pts.map(([x,y])=>X(x)+','+Y(y)).join(' ')}" fill="none" stroke="${col}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"/>`+
      `<path d="M${ex+ux*1.5},${ey+uy*1.5}L${ex-ux*3-uy*2.2},${ey-uy*3+ux*2.2}L${ex-ux*3+uy*2.2},${ey-uy*3-ux*2.2}Z" fill="${col}"/>`; };
  const dot=(x,y,c,r)=>`<circle cx="${X(x)}" cy="${Y(y)}" r="${r||1.7}" fill="${c}"/>`;
  let g=`<line x1="0" x2="64" y1="${Y(0)}" y2="${Y(0)}" stroke="rgba(253,254,252,.3)" stroke-dasharray="1 2"/>`;
  if(run){ OLX.forEach(x=>{ g+=`<path d="M${X(x)},${Y(-.6)}V${Y(1.3)}M${X(x)-2},${Y(1.3)}H${+X(x)+2}" stroke="rgba(253,254,252,.5)" stroke-width="1"/>`; });
    if(PL.jet){ const [mx,my]=FORM[PL.jet], sx=PL.dir*JET_SNAP; g+=`<polyline points="${X(mx)},${Y(my)} ${X(sx)},${Y(JET_Y)} ${X(0)},${Y(JET_Y)}" fill="none" stroke="#FF8E1C" stroke-width="1.3" stroke-dasharray="1.6 1.6"/>`;
      g+=arrow([[0,JET_Y],...PL.path.map(([x,y],i,a)=>i===a.length-1?[x,y+3]:[x,y])],'#FF8E1C',1.7); }
    else g+=arrow([PL.qb?FORM.QB:FORM.RB,...PL.path.map(([x,y],i,a)=>i===a.length-1?[x,y+3]:[x,y])],'#FF8E1C',1.7); }
  else Object.entries(PL.routes).forEach(([w,r])=>{ let [sx,sy]=FORM[w];
    if(PL.block&&PL.block[w]){ g+=`<path d="M${X(sx)},${Y(sy)}V${Y(sy+2.2)}M${+X(sx)-2.2},${Y(sy+2.2)}H${+X(sx)+2.2}" stroke="#FF8E1C" stroke-width="1.2"/>`; return; }
    if(!r) return;
    if(PL.motion&&PL.motion.p===w){ const [mx,my]=PL.motion.to; g+=`<polyline points="${X(sx)},${Y(sy)} ${X(mx)},${Y(my)}" fill="none" stroke="#4C9EFF" stroke-width="1.2" stroke-dasharray="1.6 1.6"/>`; sx=mx; sy=my; }
    g+=arrow([[sx,sy],...r.map(([rx,ry])=>[clamp(sx+rx,-17,17),Math.min(18.6,sy+ry)])],PL.flea&&w==='RB'?'#FF8E1C':'#4C9EFF',1.3); });
  OLX.forEach(x=>g+=dot(x,-.9,'rgba(253,254,252,.55)',1.5));
  ['WA','WB','TE','RB','QB'].forEach(w=>g+=dot(FORM[w][0],FORM[w][1],'#FDFEFC'));
  return `<svg viewBox="0 0 64 36" aria-hidden="true">${g}</svg>`;
}

/* how long each frame of a one-off lasts (the times it moves to the next), and which states loop two frames */
const ONESHOT={slip:[.09,.2],dive:[.08,.22],leap:[.06,.14,.3],catch:[.08,.18],stiff:[.1],hurdle:[.1,.4],down:[.1],downB:[.1]};
const LOOP=new Set(['wrap','truck','block','flail','flex','wings']);
const stageOf=(th,age)=>{ let i=0; while(i<th.length&&age>=th[i]) i++; return i; };
const HOLD=new Set(['slip','catch','catchLow','reach','leap','throw','dive','tiptoe','oneHand','celebrate','spike','dance','bow','sky','flex','wings','cross']);
/* the states a man catches the ball in: the ball is drawn at his hands */
const CATCHING=new Set(['catch','catchLow','reach','oneHand','tiptoe','leap']);
const LYING=new Set(['down','downB','dive','fallF','fallB','slip']);
const TIERC={legend:'#2F86EB',gold:'#F0CE26',silver:'#C9CED6',bronze:'#C08552'};
/* where his chest is, in sprite units from his feet, when the sprite is turned for a fall or lying down (facing right) */
function ballSpot(st,fr){ const rot=(th,tx,ty)=>{ const c=Math.cos(th), s=Math.sin(th); return [6*c+60*s+tx, 6*s-60*c+ty]; }; let q=null;
  if(st==='fallF'){ const k=Math.min(2,fr|0); q=rot([.35,.8,1.2][k],-[8,24,40][k],0); }
  else if(st==='fallB'||st==='slip'){ const k=Math.min(2,fr|0); q=rot(-[.3,.7,1.1][k],[8,24,40][k],0); }
  else if(st==='down') q=rot(Math.PI/2,-46,-6); else if(st==='downB') q=rot(-Math.PI/2,44,-6); else if(st==='dive') q=rot(1.15,-34,-16);
  return q?[q[0],-q[1]]:null; }
function makeGame(){
  const cv=$('#fld'), ctx=cv.getContext('2d'); let W=0,H=0,K=0; const DPR=Math.min(2,devicePixelRatio||1);
  let VIEW=30, SC=1.2; const SIDE=26.65, HASH=6.67, OLG=82; let BF=0, FC=0;
  let D={r:82,n:'Defense',season:''};
  const pickS=(pos,lo,hi,skip)=>POOL.find(p=>p.pos===pos&&p.r>=lo&&p.r<=hi&&p.id!==skip)||POOL.find(p=>p.pos===pos);
  const w1=pickS('WR',88,95); const SAMPLE=[pickS('QB',84,90),pickS('RB',82,90),w1,pickS('WR',76,87,w1.id),pickS('TE',72,82)];
  let roster=null; const who=i=>(roster&&roster[i])||SAMPLE[i];
  let STA=[100,100,100,100,100], HYPE=0;
  /* WEAR AND INJURY. Every time one of your five is brought down he loses stamina: a big hit most, a sling or a gang
     tackle more than a plain tackle, a shoestring trip least. And every hit carries a small chance he's hurt, which grows
     as his stamina falls: about four times as likely when he's spent as when he's fresh. */
  const WEAR={hit:11.5,sling:6.8,tackle:3.5,wrap:3.5,shoe:2.6,drag:2.6,truck:2.2,stiff:1.4}, HURT={hit:.02,sling:.011,tackle:.007,wrap:.0055,shoe:.0045,drag:.0045,truck:.003,stiff:.0018};
  function wear(c,kind,gang){ const i=c.ri, s0=STA[i]; STA[i]=Math.max(0,s0-(WEAR[kind]||4)*(.75+Math.random()*.5)-(gang?2:0));
    if(!S.injury&&Math.random()<(HURT[kind]||.004)*(1+3*Math.pow(1-s0/100,1.5))*(gang?1.3:1)){ S.injury={ri:i,big:kind==='hit'||kind==='sling'}; pop('Hurt','#D9325E',c); } }
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
  /* HOW MUCH A DEFENDER'S STAT SWINGS A PLAY: pulled in toward the middle (ASP), so a great defender is hard to beat but
     not a wall. Dn is a stat on 0-1, Eg his edge above 84 in it, erR how a stat plays on the rating scale (counts .4 a
     point: 68 plays as 81, 99 as 93). stat() is an offensive player's stat (his overall only if he has none). */
  const ASP=.35;
  const erR=r=>81+((r||80)-68)*.4;
  const stat=(p,k)=>p&&p.a&&p.a[k]!=null?p.a[k]:((p&&p.r)||80);
  /* EVERY DEFENDER HAS FOUR STATS FOR HIS POSITION, like the offense:
       DL  pass rush, run stop, tackling, speed       LB  run stop, coverage, tackling, speed
       DB  coverage, ball hawk, tackling, speed       (the two corners and two safeties are all DBs)
     His overall is the weighted average of his four (DW). The defense's card adds them up: pass rush is the line's average pass rush,
     coverage the backers' and backs' average coverage, run stop the line's and backers' average run stop, ball hawk the
     backs' average ball hawk, and the overall the average of the ten overalls. Every play reads only stats. */
  const DBSET=['cov','hawk','tkl','spd'], DSET={DL:['rush','stop','tkl','spd'],LB:['stop','cov','tkl','spd'],CB:DBSET,S:DBSET}, DLABP={DL:'DL',LB:'LB',CB:'DB',S:'DB'};
  const TEAMK=['rush','cov','stop','hawk'], DLAB={rush:'Rush',cov:'Cov',stop:'Stop',hawk:'Hawk',tkl:'Tkl',spd:'Spd'};
  const ds=(p,k)=>p&&p.s&&p.s[k]!=null?p.s[k]:((p&&p.r)||80);
  const Dn=(p,k)=>.5+(clamp((ds(p,k)-55)/44,0,1)-.5)*ASP;
  const Eg=(p,k)=>clamp((ds(p,k)-84)/15,0,1);
  const Df=(p,k)=>clamp((ds(p,k)-55)/44,0,1);
  /* a lineman with no ball hawk gets his hands on it with his rush; a backer with his coverage */
  const hawkOf=p=>p&&p.s&&p.s.hawk!=null?'hawk':p&&p.pos==='DL'?'rush':'cov';
  /* THE TEN MEN. Made once per defense from its real season and never changed. Who is best comes from what the defense
     was good at (pass rush to the line, coverage to the backs); a great or a poor defense has less room either side, so a
     99 is ten 99s. They're built so their stats add up exactly to the card. */
  const MEN=new Map(), DSP=[12,10,8,4,2,0,-2,-6,-10,-14], TKL={DL:3,LB:3,CB:-2,S:-2};
  const LEAN={DL:t=>t[0]*.55+t[2]*.45,LB:t=>t[2]*.55+t[1]*.45,CB:t=>t[1]*.7+t[3]*.3,S:t=>t[1]*.7+t[3]*.3};
  /* whole numbers inside lo..hi, as near the wanted values as can be, that average exactly to the target */
  function fitAvg(vals,target,lo,hi){ const v=vals.map(x=>clamp(Math.round(x),lo,hi)), want=Math.round(target)*v.length;
    for(let g=0;g<400;g++){ const d=want-v.reduce((a,b)=>a+b,0); if(!d) break; const s=Math.sign(d); let bi=-1, bv=-1e9;
      v.forEach((x,i)=>{ if(s>0?x>=hi:x<=lo) return; const pull=(vals[i]-x)*s; if(pull>bv){ bv=pull; bi=i; } }); if(bi<0) break; v[bi]+=s; }
    return v; }
  function menOf(d){ d=d||{}; const R=Math.round(d.r||80), ta=(d.a||[R,R,R,R]).map(Number), key=[d.id,d.n,d.season,R,ta.join('.')].join('|');
    if(MEN.has(key)) return MEN.get(key);
    const seed=typeof d.id==='number'?Math.abs(d.id):[...String(d.id||d.n||7)].reduce((h,c)=>(h*31+c.charCodeAt(0))%99991,7);
    const step=i=>{ const x=Math.sin((seed%9973+1)*12.9898+i*78.233)*43758.5453; return Math.round((x-Math.floor(x))*6)-3; };
    let n=0; const men=[['DL',4],['LB',2],['CB',2],['S',2]].flatMap(([pos,c])=>Array.from({length:c},()=>({pos,v:LEAN[pos](ta)+step(n),j:n++,s:{}})));
    const w=clamp(Math.min((99-R)/12,(R-62)/14),0,1), off=DSP.map(o=>o*w), mo=off.reduce((a,b)=>a+b,0)/off.length;
    [...men].sort((x,y)=>y.v-x.v).forEach((m,i)=>m.off=off[i]-mo);
    const ovr=fitAvg(men.map(m=>R+m.off),R,62,99); men.forEach((m,i)=>m.want=ovr[i]);
    /* the card's four: each man who has one sits near his own level, shifted so the group averages to the card exactly */
    TEAMK.forEach((k,ki)=>{ const G=men.filter(m=>DSET[m.pos].includes(k)), raw=G.map(m=>m.want+(ta[ki]-R)+step(20+m.j*4+ki)), mean=raw.reduce((a,b)=>a+b,0)/raw.length;
      fitAvg(raw.map(x=>x-mean+ta[ki]),ta[ki],40,99).forEach((v,i)=>G[i].s[k]=v); });
    /* speed on the scale everyone shares: near his own level for a man at his position, then put on that scale (a
       lineman's is low because linemen are slow), tackling near his own level; then the team's tackling and speed are nudged
       a point at a time until the ten weighted overalls average exactly to the card. */
    const W=m=>DW[DLABP[m.pos]], wsum=m=>DSET[m.pos].reduce((a,k)=>a+W(m)[k]*m.s[k],0), ov=m=>Math.round(wsum(m));
    men.forEach(m=>{ const B=SPD_BASE[DLABP[m.pos]], rel=clamp(m.want-TKL[m.pos]/2+step(60+m.j),40,99); m.s.spd=toU(B[0]+clamp((rel-55)/44,0,1)*B[1]);
      m.s.tkl=clamp(Math.round(m.want+TKL[m.pos]/2+step(70+m.j)),40,99); m.s0={tkl:m.s.tkl,spd:m.s.spd}; });
    /* and the ten overalls average exactly to the card's overall */
    for(let g=0;g<3000;g++){ const dif=men.length*R-men.reduce((a,m)=>a+ov(m),0); if(!dif) break; const sg=Math.sign(dif); let best=null, bk=null, bd=1e9;
      men.forEach(m=>['tkl','spd'].forEach(k=>{ if(sg>0?m.s[k]>=99:m.s[k]<=40) return; const t=wsum(m), need=sg>0?(ov(m)+.5)-t:t-(ov(m)-.5)+1e-9, steps=W(m)[k]?need/W(m)[k]+Math.abs(m.s[k]+sg-m.s0[k])*.6:Infinity;   /* spread the nudges: the man nearest a whole number, not the same man again and again */ if(steps<bd){ bd=steps; best=m; bk=k; } }));
      if(!best) break; best.s[bk]+=sg; }
    const U={DL:[],LB:[],CB:[],S:[]}; men.forEach(m=>U[m.pos].push({pos:m.pos,lab:DLABP[m.pos],r:ov(m),k:DSET[m.pos],s:m.s}));
    men.forEach(m=>delete m.s0); MEN.set(key,U); return U; }
  function units(){ return menOf(D); }
  function setup(){
    const P=[]; const qb=who(0), rb=who(1), wa=who(2), wb=who(3), te=who(4);
    const PL=PLAYS[S.call], runCall=PL.kind==='run';
    [-3.4,-1.7,0,1.7,3.4].forEach((x,i)=>{ const p=mk('o','OL',[72,66,60,63,77][i],OLG,x,-.9,4.6,9); p.state='stance3'; P.push(p); });
    const QB=mk('o','QB',15,qb.r,0,-4.5,spd(5.4,qb.r),12); QB.state='stance'; P.push(QB);
    const RB=mk('o','RB',28,rb.r,-1.6,-4.6,spd(6.2,rb.r),15); P.push(RB);
    const WA=mk('o','WR',13,wa.r,-9.5,-.6,spd(6.3,wa.r),15), WB=mk('o','WR',16,wb.r,9.5,-.6,spd(6.3,wb.r),15), TE=mk('o','TE',81,te.r,5.3,-.9,spd(5.8,te.r),13);
    P.push(WA,WB,TE); S.form=PL.f||'gun'; { const F=FORMS[S.form]; [['QB',QB],['RB',RB],['WA',WA],['WB',WB],['TE',TE]].forEach(([k,p])=>{ p.x=F[k][0]; p.y=F[k][1]; }); }
    /* each of your five in his own skin tone */
    [[QB,qb],[RB,rb],[WA,wa],[WB,wb],[TE,te]].forEach(([p,w])=>{ const sk=w&&(w.sk!=null?w.sk:((typeof POOL!=='undefined'&&POOL.find(x=>x.id===w.id))||{}).sk); if(sk!=null) p.si=sk; });
    WA.name=wa.n; WB.name=wb.n; TE.name=te.n; RB.name=rb.n; QB.name=qb.n; [QB,RB,WA,WB,TE].forEach((p,i)=>p.ri=i);
    QB.a=qb.a; RB.a=rb.a; WA.a=wa.a; WB.a=wb.a; TE.a=te.a; QB.slot=0; RB.slot=1; WA.slot=2; WB.slot=3; TE.slot=4;
    /* speed: legs for the QB, speed for the rest; elusiveness makes the back sharper in and out of cuts */
    QB.vmax=5.1+A(QB,2)*2.1; QB.acc=14+A(QB,2)*12;
    const sA=p=>p&&p.a&&SPI[p.pos]!=null&&p.a[SPI[p.pos]]!=null?spdPos(p.pos,p.a[SPI[p.pos]]):A(p,SPI[p&&p.pos]??0);
    RB.vmax=5.45+sA(RB)*1.8; RB.acc=16+A(RB,1)*12;
    WA.vmax=5.3+sA(WA)*2.2; WB.vmax=5.3+sA(WB)*2.2; TE.vmax=5.0+sA(TE)*1.8;
    WA.acc=16+sA(WA)*10; WB.acc=16+sA(WB)*10; TE.acc=14+sA(TE)*8;
    if(!runCall){ const r=PL.routes; WA.route=r.WA; WB.route=r.WB; TE.route=r.TE; RB.route=r.RB; if(!RB.route) RB.role='protect';
      if(PL.block) Object.entries(PL.block).forEach(([k,role])=>{ const p={WA,WB,TE,RB}[k]; p.route=null; p.role=role; }); }
    else { WA.role='stalk'; WB.role='stalk'; TE.role='block'; if(PL.qb) RB.role='lead';
      if(PL.jet){ const J=PL.jet==='WA'?WA:WB; J.role='jet'; S.jet=J; RB.role='lead'; } }
    if(!PL.jet) S.jet=null;
    S.mot=PL.motion?{p:{WA,WB,TE,RB}[PL.motion.p],to:PL.motion.to,T:PL.motion.T}:null;
    S.bite=PL.bite?{who:RB,until:PL.bite}:null; S.flea=!!PL.flea; S.fleaOut=S.fleaBack=false;
    const U=units(), q=r=>clamp((r-60)/39,0,1);
    const DL=[-4.4,-1.5,1.5,4.4].map((x,i)=>mk('d','DL',[97,90,99,94][i],U.DL[i].r,x,.9,0,0));
    const LB=[-3.6,3.6].map((x,i)=>mk('d','LB',[54,52][i],U.LB[i].r,x,5,0,0));
    const CB=[WA,WB].map((w,i)=>mk('d','CB',[24,21][i],U.CB[i].r,w.x,6,0,0));
    const SF=[-7,7].map((x,i)=>mk('d','S',[31,42][i],U.S[i].r,x,13,0,0));
    [DL,LB,CB,SF].forEach((g,k)=>g.forEach((d,i)=>d.s=U[['DL','LB','CB','S'][k]][i].s));
    [...DL,...LB,...CB,...SF].forEach(d=>{ const sp=spdPos(d.pos==='DL'?'DL':d.pos==='LB'?'LB':'DB',ds(d,'spd')); /* speed is his speed stat alone; his read is his coverage (a lineman's, his pass rush) */
      d.vmax=d.pos==='DL'?5.0+sp*1.0:d.pos==='LB'?5.9+sp*1.3:6.3+sp*1.6; d.acc=d.pos==='DL'?13+sp*4:20+sp*5; d.react=d.pos==='DL'?.35-Df(d,'rush')*.12:.36-Df(d,'cov')*.2; if(d.pos!=='DL') d.turn=.55+.75*Df(d,'cov'); d.state=d.pos==='DL'?'stance3':'stance'; P.push(d); });
    /* play action and the flea flicker don't fool everyone: each backer and safety bites by his coverage (a 55 nine times in ten, a 99 not quite half) */
    if(S.bite) [...LB,...SF].forEach(p=>p.bites=Math.random()<.9-.45*Df(p,'cov'));
    const look=S.look;
    DL.forEach(d=>d.role='rush');
    if(look==='cover2'){ CB.forEach((c,i)=>{ c.y=3; c.role='zone'; c.spot=[i?13:-13,4]; }); SF.forEach((s,i)=>{ s.role='deep'; s.spot=[i?10:-10,17]; }); LB.forEach((l,i)=>{ l.role='zone'; l.spot=[i?5:-5,7]; }); }
    if(look==='cover3'){ CB.forEach((c,i)=>{ c.y=7; c.role='deep'; c.spot=[i?16:-16,17]; }); SF[0].x=0; SF[0].y=15; SF[0].role='deep'; SF[0].spot=[0,18]; SF[1].x=7; SF[1].y=8; SF[1].role='zone'; SF[1].spot=[9,7]; LB.forEach((l,i)=>{ l.role='zone'; l.spot=[i?2:-5,7]; }); }
    if(look==='man'){ CB.forEach((c,i)=>{ c.role='man'; c.man=i?WB:WA; c.cush=3.9;   /* the call sets how far off he plays, not the man */ c.y=c.man.y+c.cush; }); LB[0].role='man'; LB[0].man=TE; LB[1].role='man'; LB[1].man=RB; SF[0].x=0; SF[0].y=15; SF[0].role='deep'; SF[0].spot=[0,18]; SF[1].x=-2; SF[1].y=9; SF[1].role='zone'; SF[1].spot=[0,9]; }
    /* Cover 4, quarters: the corners and safeties each take a deep quarter, three underneath. Cover 2 man: man underneath
       with two deep halves. Cover 0: man across the board, both safeties on the tight end and the back, no deep help, the
       backers coming. */
    if(look==='cover4'){ CB.forEach((c,i)=>{ c.y=7; c.role='deep'; c.spot=[i?16:-16,15]; }); SF.forEach((s,i)=>{ s.x=i?6:-6; s.y=12; s.role='deep'; s.spot=[i?6:-6,16]; }); LB.forEach((l,i)=>{ l.role='zone'; l.spot=[i?5:-5,6]; }); }
    if(look==='c2man'){ CB.forEach((c,i)=>{ c.role='man'; c.man=i?WB:WA; c.cush=2.6; c.y=c.man.y+2.6; }); LB[0].role='man'; LB[0].man=TE; LB[1].role='man'; LB[1].man=RB; SF.forEach((s,i)=>{ s.role='deep'; s.spot=[i?10:-10,17]; }); }
    if(look==='cover0'){ CB.forEach((c,i)=>{ c.role='man'; c.man=i?WB:WA; c.cush=1.2; c.y=c.man.y+1.2; c.press=true; }); SF[0].role='man'; SF[0].man=TE; SF[0].x=TE.x+.8; SF[0].y=5; SF[0].cush=1.6;
      SF[1].role='man'; SF[1].man=RB; SF[1].x=RB.x; SF[1].y=5; SF[1].cush=2; LB.forEach(l=>{ l.role='blitz'; l.y=2.4; }); }
    if(look==='blitz'){ CB.forEach((c,i)=>{ c.role='man'; c.man=i?WB:WA; c.cush=2; c.y=c.man.y+2; }); SF[1].role='man'; SF[1].man=TE; SF[1].x=TE.x+1; SF[1].y=5; SF[1].cush=2;
      LB.forEach(l=>{ l.role='blitz'; l.y=3; }); SF[0].x=0; SF[0].y=15; SF[0].role='deep'; SF[0].spot=[0,18];
      if(!runCall){ RB.route=null; RB.role='protect'; } }
    if(runCall){ RB.route=null; }
    /* the front each coverage comes out of: Cover 2 from the nickel, Cover 3 from a 4-3 over with the safety down in the
       box, man from a 3-4 with the outside backers standing up and the corners pressed, the blitz from a bear front with
       both backers walked up into the A gaps */
    S.front={cover2:'nickel',cover3:'4-3 over',man:'3-4',blitz:'bear front',cover0:'bear front',cover4:'nickel',c2man:'nickel'}[look];
    /* PRESS: in man with a single high safety or none, each corner decides whether to press his man at the line, more
       often the better he is than the receiver's route running. Pressed, he lines up a yard off and gets a jam in. */
    if(look==='man'||look==='blitz'||look==='cover0') CB.forEach(c=>{ c.press=c.press||Math.random()<clamp(.55+(ds(c,'cov')-stat(c.man,1))/20,.12,.9); if(c.press){ c.cush=1.2; c.y=c.man.y+1.2; } });
    if(look==='cover3'){ [-4.8,-2,1,3.8].forEach((x,i)=>DL[i].x=x); LB[0].x=-3.4; LB[1].x=1.6; SF[1].x=6.6; SF[1].y=4.8; }
    if(look==='man'){ [DL[0],DL[3]].forEach((d,i)=>{ d.x=i?5.8:-5.8; d.y=1.4; d.state='stance'; }); }
    if(look==='cover0'){ LB.forEach((l,i)=>{ l.x=i?1.2:-1.2; l.y=2.2; }); }
    if(look==='blitz'){ LB.forEach((l,i)=>{ l.x=i?.9:-.9; l.y=2.2; }); }
    { const back=S.goal+10; [...DL,...LB,...CB,...SF].forEach(d=>{ d.y=Math.min(d.y,back-1.5); if(d.spot) d.spot[1]=Math.min(d.spot[1],back-2); }); }
    S.eng=[]; const ols=P.filter(p=>p.pos==='OL').sort((a,b)=>a.x-b.x);
    const pairs=runCall?[[0,DL[0]],[1,DL[1]],[3,DL[2]],[4,DL[3]]]:[[0,DL[0]],[1,DL[1]],[2,DL[1]],[3,DL[2]],[4,DL[3]]];
    pairs.forEach(([oi,d])=>S.eng.push({o:ols[oi],d,w:0,dbl:false}));
    if(!runCall){ S.eng.filter(e=>e.d===DL[1]).forEach(e=>e.dbl=true); }
    else { const ps=PL.dir>0?1:0; ols[2].role='climb'; ols[2].climb=LB[PL.wide?1-ps:ps]; TE.climb=LB[PL.wide?ps:1-ps]; }
    S.eng.forEach(e=>{ const sk=runCall?'stop':'rush', diff=(erR(ds(e.d,sk))-e.o.r)/20; e.rate=Math.max(.3,(runCall?.34+(Dn(e.d,'stop')-.5)*.3:.36+(Dn(e.d,'rush')-.5)*.4)+diff*.3+Eg(e.d,sk)*.14+gauss()*.1);   /* even a poor line gets off its block in the end */ e.d.blocked=true; e.o.blocking=e.d; });
    S.P=P; S.QB=QB; S.RB=RB; S.rec=[WA,TE,WB,RB]; S.DL=DL; S.LB=LB; S.CB=CB; S.SF=SF; S.runCall=runCall;
    S.ball={holder:QB,air:null}; S.hold=null; S.slow=0; S.parts=[]; S.fx=null; S.bigHit=null; S.seq=null; S.pops=[]; S.loose=null; S.bobble=null; S.catcher=null; S.secure=0; S.ps=null; S.plastered=false; S.jamDone=false; S.injury=null; S.qbSafe=0; S.picker=null; S.dove=false; S.flashT=null; S.pitchV=null; S.slipEnd=null; S.tgt=null; S.carrier=null; S.cut=null; S.cam={x:0,y:4}; S.t=0; S.over=false; S.msg=null; S.thrown=false; S.scram=false; S.qbDash=null;
  }
  const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
  function track(p,m,dt){ if(p._tk!==m){ p._tk=m; p.mvx=m.vx; p.mvy=m.vy; } const k=Math.min(1,dt*1.6*Math.exp(2.4*Df(p,'cov')));   /* reads a break in about .3 s at 70 coverage, .12 s at 85, .06 s at 97 */ p.mvx+=(m.vx-p.mvx)*k; p.mvy+=(m.vy-p.mvy)*k; }
  function steer(p,tx,ty,dt,vmax){ const dx=tx-p.x, dy=ty-p.y, d=Math.hypot(dx,dy); const want=d<.2?0:Math.min(vmax||p.vmax,d*6.5);
    const wx=d>0?dx/d*want:0, wy=d>0?dy/d*want:0; let ax=wx-p.vx, ay=wy-p.vy; const am=Math.hypot(ax,ay); let lim=p.acc*dt;
    /* TURNING WITH A BREAK, in coverage before the ball is out: a cover man's hips are his coverage, so a sharp change of
       direction comes at .8 of his pull for a poor one and 1.25 for a great one. Running straight is his speed alone. */
    if(p.turn&&!S.carrier&&!S.ball.air){ const cv=Math.hypot(p.vx,p.vy); if(cv>2&&want>0&&(p.vx*wx+p.vy*wy)/(cv*want)<.7) lim*=p.turn; }
    if(am>lim){ ax=ax/am*lim; ay=ay/am*lim; }
    p.vx+=ax; p.vy+=ay; }
  const inb=(x,y)=>[clamp(x,FC-SIDE+1.2,FC+SIDE-1.2),Math.min(y,S.goal+9.2)];
  /* ROUTES BY ROUTE RUNNING: a receiver runs at a point just ahead of him on his route, .1 yds for a great route runner
     (right to the corner) to 1.5 for a poor one (round it). At a break of more than 35 degrees he cuts, his pull 1.6 to 7
     times as strong for a moment, and a good one plants his foot to do it. */
  const RR=p=>p.pos==='WR'?A(p,1):p.pos==='TE'?.35:.3;
  function routeTarget(p){ if(!p.route) return null; const v=p.vmax, d=Math.max(0,S.t-.05-(p.rdelay||0))*v+.1+(1-RR(p))*1.4; let left=d, x=p.x0, y=p.y0, k=0;
    for(const [rx,ry] of p.route){ const tx=p.x0+rx, ty=p.y0+ry, seg=Math.hypot(tx-x,ty-y); if(left<=seg){
        const L=p.leg||0; if(k>L&&p.route[L]){ const pts=[[0,0],...p.route], ax=p.x0+pts[L][0], ay=p.y0+pts[L][1], cx=p.x0+pts[L+1][0], cy=p.y0+pts[L+1][1], ll=Math.hypot(cx-ax,cy-ay)||1;
          if(Math.hypot(p.x-cx,p.y-cy)>.05+(1-RR(p))*2.2) return inb(cx+(cx-ax)/ll*1.2,cy+(cy-ay)/ll*1.2); p.leg=L+1; }
        const f=left/seg; brk(p,k); return inb(x+(tx-x)*f,y+(ty-y)*f); } left-=seg; x=tx; y=ty; k++; }
    return inb(x,y); }
  function brk(p,k){ if(p.seg===undefined){ p.seg=k; return; } if(k===p.seg) return; p.seg=k;
    const rr=RR(p);
    { const pts=[[0,0],...p.route], a=pts[k-1], b=pts[k], c=pts[k+1]; if(a&&b&&c){ const ux=b[0]-a[0], uy=b[1]-a[1], vx=c[0]-b[0], vy=c[1]-b[1], lu=Math.hypot(ux,uy)||1, lv=Math.hypot(vx,vy)||1, cos=(ux*vx+uy*vy)/(lu*lv);
      if(cos<.95){ p.cutUntil=S.t+.16+(1-rr)*.14; p.cutK=1.6+5.4*rr; if(rr>.4){ p.plantUntil=S.t+.1+rr*.06; p.plantDir=Math.sign(ux*vy-uy*vx)||1; } } } }
    S.P.forEach(d=>{ if(d.side==='d'&&!d.down&&(d.man===p||Math.hypot(d.x-p.x,d.y-p.y)<4.5)) d.stall=S.t+.12+rr*.8; }); }
  function carrierAim(c){
    if(S.cut&&S.t<S.cut.until) return [c.x+S.cut.dir*3.2,c.y+.8];
    const D=S.P.filter(p=>p.side==='d'&&!p.down&&!p.seqd), free=p=>!((p.blocked&&!p.shed)||(p.lockedBy&&dist(p,p.lockedBy)<1.4));
    /* SLIDE OFF A MAN IN THE WAY: anyone just ahead of him and close pushes his line sideways, away from that man, so he
       runs round a lineman locked in a block or a defender in the hole instead of into him */
    const slide=(tx,ty)=>{ const lx=tx-c.x, ly=ty-c.y, ll=Math.hypot(lx,ly)||1; let push=0;
      for(const p of D){ const dx=p.x-c.x, dy=p.y-c.y, d=Math.hypot(dx,dy); if(d>2.2||d<.05) continue; const ahead=(dx*lx+dy*ly)/ll; if(ahead<-.2) continue;
        const side=(dx*ly-dy*lx)/ll; push+=(side>0?-1:1)*(2.2-d)/2.2*(1.1-Math.min(1,Math.abs(side)/1.2)); }
      return [clamp(tx+push*1.8*(ly/ll),FC-SIDE+1.6,FC+SIDE-1.6), ty-push*1.8*(lx/ll)*.3]; };
    /* THE PLAY'S PATH TO ITS GAP, through the line. He keeps to it unless the gap is gone: a free man (not held by a block)
       who can get to the next point of the path before he does. Then, and once he's through, it's open field. */
    if(c.path&&c.path.length){ while(c.path.length&&Math.hypot(c.path[0][0]-c.x,c.path[0][1]-c.y)<1) c.path.shift();
      if(c.path.length){ const [tx,ty]=c.path[0], tc=Math.hypot(tx-c.x,ty-c.y)/Math.max(4,c.vmax);
        if(D.some(p=>free(p)&&Math.max(0,Math.hypot(p.x-tx,p.y-ty)-.8)/p.vmax<tc+.05&&Math.hypot(p.x-c.x,p.y-c.y)<5)) c.path=null; else return slide(tx,ty); } }
    /* OPEN FIELD. He looks down every line in front of him, never back toward his own goal (75 degrees either side of
       straight up the field at most), and for each asks how far he can get along it before a man can be there first:
       each defender's time to the spot (engaged blockers barely count) against his own. He takes the line that gets
       him furthest toward the end zone, with a little for room to spare and a little for not jinking about. */
    /* He also thinks one turn ahead: a line that keeps him clear for a few yards (a crosser carrying on across the field,
       away from the man trailing him) is worth those yards and then whatever is straight up the field from there. Turning
       costs him: the sharper the turn at speed, the longer before he's going the new way, and the closer they get. */
    const v=Math.max(4,c.vmax), sp0=Math.hypot(c.vx,c.vy), hv=sp0||1, hx=c.vx/hv, hy=c.vy/hv, ac=(c.acc||16)*1.2, N=14;
    const turn=(ax,ay,bx,by,sp)=>2*Math.sin(Math.acos(clamp(ax*bx+ay*by,-1,1))/2)*sp/ac;
    const probe=(x0,y0,dx,dy,t0,n)=>{ let run=0, room=9;
      for(let L=1;L<=n;L++){ const px=x0+dx*L, py=y0+dy*L; if(Math.abs(px-FC)>SIDE-.8) break; const tc=t0+L/v; let m=9;
        for(const p of D){ const dd=Math.hypot(p.x-px,p.y-py), vd=Math.hypot(p.vx,p.vy), cs=vd>1&&dd>.01?(p.vx*(px-p.x)+p.vy*(py-p.y))/(vd*dd):0;
          const td=Math.max(0,dd-.75)/(free(p)?p.vmax:1.6)+.06+.16*(1-cs)/2+(free(p)?0:.25); if(td-tc<m) m=td-tc; }
        if(m<room) room=m; if(m<.15) break; run=L; if(py>=S.goal){ run+=3; break; } }
      return {run,room}; };
    let best=null,bs=-1e9;
    for(let a=-75;a<=75;a+=7.5){ const r=a*Math.PI/180, dx=Math.sin(r), dy=Math.cos(r), t1=sp0>1?turn(hx,hy,dx,dy,sp0):0, L1=probe(c.x,c.y,dx,dy,t1,N);
      let gain=L1.run*dy;
      if(dy<.97) for(const k of [3,5,7,9]){ if(k>L1.run) break; const L2=probe(c.x+dx*k,c.y+dy*k,0,1,t1+k/v+turn(dx,dy,0,1,v),N-k); gain=Math.max(gain,k*dy+L2.run); }
      const sc=gain+Math.min(L1.room,1)*.9+(dx*hx+dy*hy)*.4;
      if(sc>bs){ bs=sc; best=[c.x+dx*3.5,c.y+dy*3.5]; } }
    return best?slide(best[0],best[1]):best; }
  const SEQ={truck:{dur:.55,label:'Trucked'},stiff:{dur:.5,label:'Stiff arm'},juke:{dur:.38,label:'Juked'},spin:{dur:.48,label:'Spin move'},hurdle:{dur:.52,label:'Hurdle'}};
  function pop(text,col,p,slow){ S.pops.push({text,col:col||'#FF8E1C',p,t0:S.t}); S.slow=Math.max(S.slow||0,S.t+(slow??(text==='Touchdown'?.9:.55))); }
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
    if(SCENES[name]){ const q=S.seq; Object.assign(q,{scene:true,sdir:dir4(q.ux,q.uy),ax:a.x,ay:a.y,dur:SCENES[name].len}); }
    a.seqd=b.seqd=true; b.fxd=true; b.tried=S.t; pop(SEQ[name].label,'#FF8E1C',a,.22); dust(b,10); if(name==='truck'||name==='stiff'){ sparks(b,8); if(a.side==='o'&&a.ri!=null) wear(a,name,false); } }
  function runSeq(dt){ const q=S.seq, t=S.t-q.t0, a=q.a, b=q.b, k=Math.min(1,t/q.dur), side=q.ux>=0?'right':'left';
    /* a moves D along the way he was going and L across it */
    const at=(D,L)=>{ a.x=q.a0.x+q.ux*D+q.uy*L*q.lat; a.y=q.a0.y+q.uy*D-q.ux*L*q.lat; };
    const whiff=()=>{ b.state=t<.28?'dive':'down'; b.facing=FACE[dir4(q.a0.x-q.b0.x,q.a0.y-q.b0.y)]; const m=Math.min(1,t/.25); b.x=q.b0.x+(q.a0.x-q.b0.x)*m; b.y=q.b0.y+(q.a0.y-q.b0.y)*m; };
    if(q.scene){ const sc=SCENES[q.name]; sceneSpot(a,q.ax,q.ay,q.sdir,sceneAt(sc.B.k,Math.min(t,sc.len))[11],0);
      a.state='run'; a.facing=FACE[q.sdir]; b.state='down'; b.facing=OPP[a.facing];
      if(t>=q.dur){ sceneSpot(b,q.ax,q.ay,q.sdir,sceneAt(sc.A.k,sc.len)[11],1); b.state=q.name==='hurdle'?'down':'downB'; } }
    else if(q.name==='truck'){ at(1.2*k,0); a.state='truck'; a.facing=side; b.facing=side==='right'?'left':'right'; b.state=t<.36?'fallB':'downB'; b.ff=Math.min(2,Math.floor(t/.12)); b.x=q.b0.x+q.ux*1.5*k; b.y=q.b0.y+q.uy*1.5*k; }
    else if(q.name==='stiff'){ const away=q.b0.x>=q.a0.x?1:-1; at(1.3*k,0); a.state='stiff'; a.facing=away>0?'right':'left'; b.facing=away>0?'right':'left'; b.state=t<.4?'fallF':'down'; b.ff=Math.min(2,Math.floor(t/.13)); b.x=q.b0.x+away*1.1*k; b.y=q.b0.y+q.uy*.3*k; }
    /* a jab one way, a plant, then the hop the other way; his chest stays up the field the whole time */
    else if(q.name==='juke'){ const up=q.uy>=-.5?1:-1, f=up>0?'up':'down', jab=k<.3, L=jab?-.35*Math.sin(k/.3*Math.PI/2):-.35+1.65*Math.sin(Math.min(1,(k-.3)/.55)*Math.PI/2);
      a.x=q.a0.x+q.lat*L; a.y=q.a0.y+up*.55*k; a.facing=f; a.ph+=dt*12; a.state=k<.12||(k>.28&&k<.42)?'plant':'run'; a.plantDir=(k<.3?-q.lat:q.lat)*up; whiff(); }
    else if(q.name==='spin'){ a.state='run'; a.ph+=dt*14; at(1.0*k,.35*Math.sin(k*Math.PI)); a.facing=['up','right','down','left','up'][Math.min(4,Math.floor(k*5))]; whiff(); }
    else if(q.name==='hurdle'){ at(1.9*k,0); a.state='hurdle'; a._st0=S.t-(k<.2?0:k<.75?.15:.45); a.facing=side; a.lift=Math.sin(Math.PI*k)*24; whiff(); }
    if(t>=q.dur){ a.seqd=b.seqd=false; a.lift=0; a.state='run'; a.vx=q.ux*q.sp; a.vy=q.uy*q.sp; a.path=null;
      b.fxd=false; b.down=true; b.missed=true; b.upAt=S.t+1.1; if(b.state!=='downB') b.state='down'; S.seq=null; } }
  /* when a tackle is missed, which move beat him: a juke or spin off a cut, a hurdle (only at a man in front of him or beside him), or a stiff arm; a truck is its own roll, before the tackle */
  function move(c,p,pw,el){ const v=Math.hypot(c.vx,c.vy)||1, ahead=((p.x-c.x)*c.vx+(p.y-c.y)*c.vy)/v; let name=null;
    if(c.juke&&S.t<c.juke+.15) name=el>.55&&Math.random()<.5?'spin':'juke';
    else if(ahead>-.3&&Math.random()<.14+el*.2) name='hurdle';
    else if(ahead>-.3&&pw>.45&&Math.random()<.12+pw*.3) name='truck';
    else if(Math.random()<.35) name='stiff';
    if(!name) return false; startSeq(name,c,p); return true; }
  function update(dt){
    S.t+=dt; const t=S.t, QB=S.QB, carrier=S.carrier;
    if(S.seq) runSeq(dt);
    if(S.ps) runPs();
    /* PRESS AT THE LINE: a pressing corner gets his hands on an outside receiver as he comes off the line. How long he holds
       him is the matchup: the corner's rating and his team's coverage against the receiver's rating and route running,
       with some luck. A receiver who wins it clean gets a step on him instead. Only at the line, right at the snap. */
    if(!S.jamDone&&t>.02){ S.jamDone=true; S.CB.forEach(c=>{ const m=c.man; if(!c.press||!m||c.role!=='man'||!m.route||m.y>.5||dist(c,m)>2.6) return;
      const cov=clamp((ds(c,'cov')-55)/44,0,1), J=clamp(.26+(erR(ds(c,'cov'))-erR(stat(m,1)))/45+(cov-.5)*.3-(A(m,1)-.5)*.3+gauss()*.12,0,.85);
      if(J<.08){ c.stall=t+.6; c.stumble=t+.36; c.stumble0=t; m.burst=t+.6; m.rdelay=0; pop('Beat the press','#4C9EFF',m,.2); }
      else { m.jam=t+J; m.rdelay=J; c.jamming=m; if(J>.3) pop('Jammed','#D9325E',m,.2); } }); }
    if(!S.runCall&&!S.plastered&&t>2.1&&S.ball.holder===QB){ S.plastered=true; const R=S.rec.filter(r=>r.route&&!r.down&&r.role!=='protect'), C=S.P.filter(p=>p.side==='d'&&!p.down&&(p.role==='man'||p.role==='zone'||p.role==='deep')), took=new Set();
      C.forEach(p=>{ if(p.role==='man'&&R.includes(p.man)){ p.plaster=p.man; took.add(p.man); } });
      const pairs=[]; R.filter(r=>!took.has(r)).forEach(r=>C.filter(p=>!p.plaster).forEach(p=>pairs.push([dist(p,r),p,r]))); pairs.sort((a,b)=>a[0]-b[0]);
      pairs.forEach(([,p,r])=>{ if(p.plaster||took.has(r)) return; p.plaster=r; took.add(r); }); }
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
        if(p===carrier){ [tx,ty]=carrierAim(p); if(p.slow&&t<p.slow) vmax*=p.slowK||.6; }
        else if(p.pos==='QB'){ if(S.qbDash&&t<S.qbDash.until){ tx=S.qbDash.x; ty=S.qbDash.y; vmax=p.vmax*1.4; } else if(!S.runCall||PLAYS[S.call].qb){ tx=0; ty=Math.max(PLAYS[S.call].qb?-4.9:-6.5,-4.5-t*2.4); } else if(S.jet){ tx=S.ball.holder===p?0:-1.2*PLAYS[S.call].dir; ty=S.ball.holder===p?JET_Y-.75:-4.2; } else { tx=-.6*PLAYS[S.call].dir; ty=S.form==='under'?-2.6:S.form==='pistol'?-3.9:-4.6; } }
        else if(p.pos==='OL'){ if(p.blocking&&!p.blocking.shed){ tx=p.tx; ty=p.ty; } else if(p.climb||p.role==='climb'){ const l=p.climb; tx=l.x; ty=l.y-.7; if(dist(p,l)<1.1){ l.blocked=true; l.lockedBy=p; } } else if(carrier&&carrier!==QB){ tx=carrier.x; ty=carrier.y-2; } else { tx=p.x; ty=Math.min(p.y,-1); } }
        else if(ballAir&&dist(p,ballAir.to)<7&&p!==hold&&!['wall','stalk','block','lead','protect'].includes(p.role)&&!p.climb){ [tx,ty]=inb(ballAir.to.x,ballAir.to.y); }
        else if(p.role==='jet'){ tx=p.x+PLAYS[S.call].dir*4; ty=JET_Y; }
        /* the back leads out to the edge and takes the first man he meets there */
        else if(p.role==='lead'){ const dir=PLAYS[S.call].dir, f=S.P.find(d=>d.side==='d'&&!d.down&&!d.lockedBy&&!(d.blocked&&!d.shed)&&dist(p,d)<1.4);
          if(f){ p.role='block'; p.climb=f; f.blocked=true; f.lockedBy=p; tx=f.x; ty=f.y-.7; } else { tx=dir*7.5; ty=t<.5?-2.8:1; } }
        /* a screen's blocker: the nearest man who could make the play, held */
        else if(p.role==='wall'){ const w=S.P.filter(d=>d.side==='d'&&!d.down&&d.pos!=='DL'&&!(d.lockedBy&&d.lockedBy!==p)).sort((a,b)=>dist(a,p)-dist(b,p))[0];
          if(w){ tx=w.x; ty=w.y-.7; if(dist(p,w)<1.1){ w.blocked=true; w.lockedBy=p; } } }
        else if(p.role==='stalk'){ const c=S.CB[p===S.rec[0]?0:1]; tx=c.x; ty=c.y-.8; if(dist(p,c)<1.1&&carrier&&dist(c,carrier)>2){ c.blocked=true; c.lockedBy=p; } }
        else if(p.role==='block'||p.climb){ const l=p.climb||S.LB[1]; tx=l.x; ty=l.y-.7; if(dist(p,l)<1.1){ l.blocked=true; l.lockedBy=p; } }
        else if(p.role==='protect'){ const free=S.LB.find(l=>!l.picked); if(free){ tx=free.x; ty=free.y-.6; if(dist(p,free)<1){ free.picked=true; free.blocked=true; free.lockedBy=p; } } else { tx=-1.5; ty=-5; } }
        else if(p.jam&&t<p.jam&&!carrier){ tx=p.x; ty=p.y+.12; vmax=.8; }
        else if(p.route&&!carrier){ const r=routeTarget(p); if(r){ tx=r[0]; ty=r[1]; } }
        else if(carrier&&p!==carrier){ tx=carrier.x+(p.x<carrier.x?-2:2); ty=carrier.y+1; }
      } else {
        const seen=Math.max(0,t-(p.react||.25)); if(p.stall&&t<p.stall) vmax*=.4; p._deep=null;
        /* CHASING FROM BEHIND: a man with the ball and a step on you keeps it. A defender behind the carrier runs a touch
           slower than his top speed in coverage, so he catches only a carrier slower than him, not one his equal. */
        if(carrier&&carrier!==S.QB&&p.y<carrier.y-.4&&!p.lockedBy) vmax*=.96;
        if(p.lockedBy&&!p.down&&dist(p,p.lockedBy)<1.6){ if(Math.random()<dt*Math.max(.9,1.3+(ds(p,p.s&&p.s.stop!=null?'stop':'tkl')-stat(p.lockedBy,{TE:0,RB:2,WR:3}[p.lockedBy.pos]??0))/25)){ p.lockedBy=null; p.blocked=false; } else { tx=p.lockedBy.x; ty=p.lockedBy.y+.8; vmax=1.2; } }
        else if(p.blocked&&!p.shed&&p.pos==='DL'){ tx=p.tx; ty=p.ty; }
        else if(p.jamming&&t<p.jamming.jam){ tx=p.jamming.x; ty=p.jamming.y+.75; vmax=.8; }
        else if(carrier&&(!S.runCall||carrier===S.QB||carrier.y>.5||t>=(S.handT||0)+(p.react||.25)+({deep:.26,zone:.15,man:.18}[p.role]??.04))){ const lead=Math.min(1.1,dist(p,carrier)/p.vmax); tx=carrier.x+carrier.vx*lead; ty=carrier.y+carrier.vy*lead; }
        else if(ballAir&&t-ballAir.t0>(p.react||.25)*.8){ tx=ballAir.to.x; ty=ballAir.to.y; vmax=p.vmax*1.04; }
        else if(p.role==='rush'||p.role==='blitz'){ tx=QB.x; ty=QB.y; if(t<.2) ty=p.y; }
        else if(t<(p.react||.25)){ tx=p.x; ty=p.y+.3; }
        else if(S.runCall&&seen>.45&&hold&&hold!==QB){ tx=hold.x; ty=hold.y; }
        /* play action and the flea flicker: the backers and safeties step up for the run they see, for a moment */
        else if(S.bite&&t<S.bite.until&&(p.pos==='LB'||p.pos==='S')&&p.bites&&!p.lockedBy){ tx=S.bite.who.x; ty=S.bite.who.y+2.2; }
        else if(p.role==='man'){ const m=p.man, late=seen>1.7, c=late?.4:Math.max(.9,(p.cush||3)*(1-Math.min(1,seen/1.1))); track(p,m,dt); tx=m.x+p.mvx*.25+(m.x<0?.5:-.5)*(late?0:1); ty=m.y+Math.max(0,p.mvy)*.3+c; }
        else if(p.plaster&&!p.plaster.down){ const m=p.plaster; tx=m.x+m.vx*.3+(m.x<p.x?.35:-.35); ty=m.y+Math.max(0,m.vy)*.35+.7; }
        else if(p.role==='zone'){ const cov=r=>S.P.some(q=>q!==p&&q.side==='d'&&!q.down&&(q.man===r||q.carry===r||q.plaster===r)&&dist(q,r)<dist(p,r));
          if(p.carry&&(p.carry.down||!p.carry.route||Math.hypot(p.carry.x-p.spot[0],p.carry.y-p.spot[1])>11||cov(p.carry))) p.carry=null;
          if(!p.carry){ let bd=7.5; S.rec.forEach(r=>{ if(!r.route||r.down) return; const d2=Math.hypot(r.x-p.spot[0],r.y-p.spot[1]); if(d2<bd&&!cov(r)){ bd=d2; p.carry=r; } }); }
          if(p.carry){ track(p,p.carry,dt); tx=p.carry.x+p.mvx*.25; ty=p.carry.y+1+Math.max(0,p.mvy)*.3; } else { tx=p.spot[0]; ty=p.spot[1]; } }
        else if(p.role==='deep'){ let deep=null; const half=p.spot[0]===0?99:14; S.rec.forEach(r=>{ if(r.route&&!r.down&&r.y>9&&Math.abs(r.x-p.spot[0])<half&&(!deep||r.y>deep.y)) deep=r; }); /* over the top of him, where he's going: and while he's still running at the safety, the safety keeps his depth instead of coming down to meet him and being run past */
          p._deep=deep; if(deep){ track(p,deep,dt); tx=deep.x+p.mvx*.3; ty=deep.y+Math.max(0,p.mvy)*.45+(seen>1.6?1:2.4); if(deep.vy>1.5&&deep.y<p.y) ty=Math.max(ty,Math.min(p.y,deep.y+7)); } else { tx=p.spot[0]; ty=p.spot[1]; } }
      }
      if(p.side==='d'&&!carrier&&!ballAir){ const m=p.role==='man'?p.man:p.plaster||(p.role==='zone'?p.carry:null)||p._deep; if(m&&!m.down&&m.route){ const v=Math.hypot(m.vx,m.vy), dx=m.x-p.x, dy=m.y-p.y, d=Math.hypot(dx,dy);
        /* COVERING A MAN he paces him: never more than .35 a second faster than the receiver can run, so a fast DB closes a
           lost step slowly and a slow one loses ground on a long route; what wins or loses the breaks is his read and his turn */
        if(v>1.5&&d>.8) vmax=Math.min(vmax,m.vmax+.35); } }
      if(p.burst&&t<p.burst) vmax*=1.18;
      if(p.side==='d') ty=Math.min(ty,S.goal+9.5);
      /* the ball carrier bursts: he gets up to speed quicker than the men chasing him */
      if(p===carrier&&carrier!==QB){ const a0=p.acc; p.acc=a0*1.2; steer(p,tx,ty,dt,vmax); p.acc=a0; }
      else if(p.cutUntil&&t<p.cutUntil&&p.route){ const a0=p.acc; p.acc=a0*(p.cutK||1); steer(p,tx,ty,dt,vmax); p.acc=a0; }
      else steer(p,tx,ty,dt,vmax);
      p.x+=p.vx*dt; p.y+=p.vy*dt;
      if(S.home&&(S.home.rain||S.home.snow)&&!p.down&&t>(p.stepT||0)&&Math.hypot(p.vx,p.vy)>2.8){ p.stepT=t+.16+Math.random()*.06; burst(p.x+(Math.random()-.5)*.3,p.y,2,{cols:S.home.snow?['#ffffff','#e8eef4','#d6dee8']:['rgba(200,218,240,.85)','#9fb8d2','#c9d8ea'],sp:1.1,vz:S.home.snow?1.4:1.8,g:9,life:.3,s:S.home.snow?2:1}); }
      const sp=Math.hypot(p.vx,p.vy); if(p===carrier&&S.cut&&t<S.cut.until+.12) p.facing=p.vy>=-.5?'up':'down';
      if(sp>3&&!p.down&&p.pos!=='OL'&&(!p.hT||t-p.hT>.1)){ const ux=p.vx/sp, uy=p.vy/sp; if(p.hx!=null&&p.hx*ux+p.hy*uy<.7&&!(p.plantUntil>t-.3)){ p.plantUntil=t+.12; p.plantDir=Math.sign(p.hx*uy-p.hy*ux)||1; } p.hx=ux; p.hy=uy; p.hT=t; }
      else if(sp<=3) p.hx=null;
      else if(sp>.6){ p.facing=Math.abs(p.vx)>Math.abs(p.vy)*1.15?(p.vx>0?'right':'left'):(p.vy>0?'up':'down'); }
      if(p.state==='leap') vmax*=.4;
      if(!HOLD.has(p.state)){ if(p.blocking&&!p.blocking.shed||p.lockedBy&&dist(p,p.lockedBy)<1.4||(p.pos==='DL'&&p.blocked&&!p.shed)||(p.jam&&t<p.jam)||(p.jamming&&t<p.jamming.jam)) p.state='block'; else if(sp>.6) p.state='run'; else if(t>.05) p.state=p.side==='o'&&p.pos==='OL'?'block':'stance'; }
      if(p.stumble&&t<p.stumble){ p.state='fallF'; p.ff=Math.min(1,Math.floor((t-p.stumble0)/.14)); }
      p.ph+=sp*dt*1.5; if(HOLD.has(p.state)&&p.state!=='dive'&&t>p.until) p.state='run';
      if(p.state==='dive'&&t>p.until){ p.state='down'; p.down=true; }
    });
    S.P.forEach(p=>{ if(p.missed&&p.down&&t>p.upAt){ p.down=false; p.missed=false; p.state='run'; } });
    /* the flea flicker: handed to the back, and a beat later pitched back to the QB to throw */
    if(S.flea&&!S.runCall){ if(t>.3&&!S.fleaOut&&S.ball.holder===QB){ S.fleaOut=true; S.ball.holder=S.RB; hint('Wait for the pitch back'); }
      if(S.fleaOut&&!S.fleaBack&&t>1.0){ S.fleaBack=true; S.ball.holder=QB; S.RB.route=null; S.RB.role='protect'; hint('Tap to lob it · hold to zip it'); } }
    if(S.runCall&&S.ball.holder===QB&&!S.carrier&&(S.jet?Math.abs(S.jet.x-QB.x)<.55||t>1.2:t>(PLAYS[S.call].delay||.55))){ const B=S.jet||(PLAYS[S.call].qb?QB:S.RB); if(/^toss|^sweep/.test(S.call)){ S.pitchV={t0:t,x:QB.x+.4,y:QB.y}; QB.state='throw'; QB.throw0=t; QB.throwIv=.07; QB.until=t+.3; QB.throwStyle='quick'; }
      S.ball.holder=B; S.carrier=B; S.handT=t; B.role=null; B.path=PLAYS[S.call].path.map(a=>[a[0],a[1]]); hint('Tap left or right of him to cut'); }
    if(!S.runCall&&S.ball.holder===QB&&!S.carrier&&!(S.qbSafe&&t<S.qbSafe)){ const r=S.P.find(p=>p.side==='d'&&!p.down&&(p.shed||!p.blocked)&&dist(p,QB)<.75);
      if(r&&!r.escTried&&Math.random()<.06+A(QB,3)*.42){ r.escTried=true; dive(r,QB); r.state='down'; r.down=true; r.missed=true; r.upAt=t+1.6; r.vx=r.vy=0; pop('Escaped','#4C9EFF',QB,.3);
        let L=0,R=0; S.P.forEach(d=>{ if(d.side!=='d'||d.down||d===r) return; const dd=dist(d,QB); if(dd>6) return; const w=6-dd; if(d.x<QB.x) L+=w; else R+=w; });
        const dir=Math.abs(L-R)<.5?(Math.sign(QB.x-r.x)||(Math.random()<.5?-1:1)):(L>R?1:-1);
        S.qbDash={x:clamp(QB.x+dir*3.6,FC-SIDE+2,FC+SIDE-2),y:QB.y+.3,until:t+.65}; S.qbSafe=t+1.1; QB.vx=dir*QB.vmax*1.4; QB.vy=.2; QB.facing=dir>0?'right':'left'; dust(QB,8,-dir*2.5); }
      else if(r){ r.escTried=true; const head=(r.vy*QB.vy+r.vx*QB.vx)<-1, k=Math.random(); fx(r,QB,r.y<QB.y-.3?(k<.5?'tackle':k<.8?'sling':'shoe'):k<.5?'tackle':(head&&k<.8)||k<.72?'hit':k<.82?'wrap':k<.91?'sling':'shoe');
        if(QB.y<=-S.yd) return end('Safety','Sacked in his own end zone. Two points to them.','safety',0);
        if(Math.random()<(.05+Dn(r,hawkOf(r))*.08+(1-A(QB,3))*.05)*(S.home&&(S.home.rain||S.home.snow)?1.5:1)){   /* a wet ball comes loose more: rain or snow, 1.5x */ const spot=fumble(QB); pop('Strip sack','#D9325E',QB);
          if(Math.random()<.55) return end('Strip sack','#'+r.num+' knocks it out of his hand and they fall on it.','to',0,spot);
          return end('Strip sack','#'+r.num+' knocks it loose; your line falls on it.','loss',Math.round(Math.min(QB.y,spot.y))); }
        S.fx.flex=true; pop({sling:'Slung down',shoe:'Chased down'}[S.fx.kind]||'Sack','#D9325E',QB);
        return end('Sacked','Down '+Math.max(1,Math.round(-QB.y-1))+' behind the line.','loss',Math.round(QB.y)); } }
    /* the big hit over the middle, a beat after the catch */
    if(S.bigHit&&t>=Math.max(S.bigHit.at,S.secure||0)&&S.carrier&&!S.over){ const d=S.bigHit.d, c=S.carrier; S.bigHit=null;
      if(!d.down&&dist(d,c)<2.4&&fromBehind(d,c)) return tackled(c,d);
      if(!d.down&&dist(d,c)<2.4){ d.x=c.x+(d.x<c.x?-.5:.5); d.y=c.y+.4;
        if(Math.random()<.34-A(c,HANDS[c.pos]??2)*.2){ S.caught=false; fx(d,c,'hit'); S.ball.holder=null; return end('Jarred loose','#'+d.num+' hits him as it arrives and it comes out.','inc',0,{x:c.x+.7,y:c.y-.5}); }
        return tackled(c,d,'hit'); } }
    const air=S.ball.air;
    if(air&&!air.rose&&t>=air.t0+air.dur-.16&&(air.power||0)<=.66&&(air.d>=15||(air.power||0)<.34)){ air.rose=true; const to=air.to, nr=(L)=>L.sort((a,b)=>dist(a,to)-dist(b,to))[0];
      const r=nr(S.rec.filter(x=>!x.down)), d=nr(S.P.filter(p=>p.side==='d'&&!p.down&&p.pos!=='DL'));
      if(r&&d&&dist(r,to)<catchR(r)+.2&&dist(d,to)<1.15){ [r,d].forEach(p=>{ p.state='leap'; p.leap0=t; p.until=t+.4; p.leapH=20; }); r.rose=true; } }
    if(air&&t>=air.t0+air.dur){ S.ball.air=null; return arrive(air); }
    if(air&&t>=air.t0){ const f=(t-air.t0)/air.dur;
      if(f>.12&&f<.88){ const h=2.1*(1-f)+1.3*f+Math.sin(Math.PI*f)*air.arc,   /* out of his hand at about 6 feet, into the receiver's at his chest */ gx=air.from.x+(air.to.x-air.from.x)*f, gy=air.from.y+(air.to.y-air.from.y)*f;
        for(const p of S.P){ if(p.side!=='d'||p.down||(air.tried&&air.tried.has(p))) continue; if(h>(p.pos==='DL'?2.65:2.5)||Math.hypot(p.x-gx,p.y-gy)>(p.pos==='DL'?.6:.8)) continue;
          (air.tried=air.tried||new Set()).add(p); if(Math.random()>(p.pos==='DL'?.14+Dn(p,'rush')*.12:.3+Dn(p,hawkOf(p))*.25)) continue;
          p.state='leap'; p.leap0=S.t; p.until=S.t+.38; S.ball.air=null; const at={x:gx,y:gy};
          if(Math.random()<.05+Dn(p,hawkOf(p))*.05){ p.state='catch'; p.x=gx; p.y=gy; S.ball.holder=p; pop('Tipped & picked','#D9325E',p); sparks(p,8); celebrateD(p); return end('Intercepted','#'+p.num+' gets a hand up and it falls to him.','to',0,at); }
          pop(p.pos==='DL'?'Batted down':'Tipped','#D9325E',p); sparks(p,8); return end(p.pos==='DL'?'Batted down':'Tipped away','#'+p.num+' got a hand on it in the air.','inc',0,at); } } }
    if(S.slipEnd&&t>=S.slipEnd.t){ const p=S.slipEnd.p; S.slipEnd=null; if(p.y<=-S.yd) return end('Safety','He slipped in his own end zone. Two points to them.','safety',0); const y=Math.round(p.y);
      return end('Slipped',(p.name||'#'+p.num)+' lost his footing and went down'+(y>0?', '+y+' yards.':'.'),y>0?'gain':'loss',y); }
    const c=S.carrier;
    if(c&&!c.down&&!S.over&&!S.seq&&!S.ps&&!(c===S.catcher&&t<(S.secure||0))){
      for(const p of S.P){ if(p.side!=='d'||p.down||p.state==='dive'||(p.lockedBy&&dist(p,p.lockedBy)<1.3)) continue;
        if(p.pos==='DL'&&p.blocked&&!p.shed){ if(dist(p,c)<.6&&Math.random()<dt*2.2) return tackled(c,p,'tackle'); continue; }
        if(dist(p,c)<.95&&(!p.tried||t-p.tried>.5)){ p.tried=t; const pw=c.pos==='RB'?A(c,2):c.pos==='TE'?A(c,3)*.7:0, el=c.pos==='RB'?A(c,1):c.pos==='WR'?A(c,1)*.5:c.pos==='QB'?A(c,2)*.5:.25;
          const cut=c.juke&&t<c.juke, front=((p.x-c.x)*c.vx+(p.y-c.y)*c.vy)/(Math.hypot(c.vx,c.vy)||1)>-.3;
          if(!cut&&front&&pw>0&&Math.random()<.15*pw*(1-.6*Df(p,'tkl'))){ startSeq('truck',c,p); break; }
          const ok=Math.random()<clamp(.92+Eg(p,'tkl')*.07+(erR(ds(p,'tkl'))-87)/300-el*.07+(Dn(p,'tkl')-.5)*.2,.3,.96)*(cut?1-(.05+el*.429):1);
          if(ok) return tackled(c,p); if(move(c,p,0,el)) break; dive(p,c); p.missed=true; p.upAt=t+1.1; c.slow=t+.35*(1-pw*.6); c.slowK=.6; }
        /* THE DIVING TACKLE, the defense's juke: a man a step or two short who can't close (beside him or behind him, the
           runner getting away) lays out for his legs, once a play. It reaches to 2.1 yds but catches less than a tackle, the
           longer the dive the less, and a cut just before it beats it the way a juke beats a tackle. Miss and he's on the
           ground for a second. Two men at most dive a play, and a man who gets the look takes it 3 times in 10. */
        else if(p.pos!=='DL'&&!p.dived&&!p.blocked&&(!p.tried||t-p.tried>.5)){   /* linemen don't dive */ const dd=dist(p,c), sp=Math.hypot(c.vx,c.vy);
          if(dd>=1.2&&dd<2.1&&sp>3&&((c.x-p.x)*c.vx+(c.y-p.y)*c.vy)/(dd*sp)>.3&&c.vmax>=p.vmax*.97&&(S.dove||0)<2&&(p.dived=true,Math.random()<.3)){   /* a chance, not a habit: a man who gets the look takes it 3 times in 10, and only one man a play */
            S.dove=(S.dove||0)+1; p.tried=t; const el=c.pos==='RB'?A(c,1):c.pos==='WR'?A(c,1)*.5:c.pos==='QB'?A(c,2)*.5:.25;
            const base=clamp(.92+Eg(p,'tkl')*.07+(erR(ds(p,'tkl'))-87)/300-el*.07+(Dn(p,'tkl')-.5)*.2,.3,.96);
            if(Math.random()<base*(.4+.25*Df(p,'tkl'))*(1-(dd-.95)*.35)*(c.juke&&t<c.juke?1-(.05+el*.429):1)*(S.home&&(S.home.rain||S.home.snow)?.75:1)){ pop('Diving tackle','#D9325E',p); return tackled(c,p,'shoe'); }
            dive(p,c); p.missed=true; p.upAt=t+1.0; pop(c.juke&&t<c.juke?'Juked the dive':'Dove and missed','#4C9EFF',c,.2); } } }
      if(Math.abs(c.x-FC)>SIDE) return end('Out of bounds',spotText(c),c.y>0?'gain':'loss',Math.round(c.y));
      if(S.home&&(S.home.rain||S.home.snow)&&c!==S.QB&&Math.hypot(c.vx,c.vy)>4.5&&Math.random()<dt*SLIP) return slip(c,true);   /* the same for everyone running flat out; only a cut is likelier */
      if(c.y>=S.goal) return end('Touchdown',(c.name||'#'+c.num)+' takes it '+S.goal+' yards to the end zone.','td',S.goal);
    }
    /* everyone else on a wet field: a rare slip for a man running flat out, once the play is under way */
    if(S.home&&(S.home.rain||S.home.snow)&&S.phase==='live'&&!S.seq&&!S.ps&&(!S.runCall||S.carrier)){ const rate=SLIP;
      for(const p of S.P){ if(p===S.carrier||p===S.QB||p.pos==='OL'||p.down||p.fxd||p.seqd||p.state==='dive'||(p.blocked&&!p.shed)||p.lockedBy) continue;
        if(Math.hypot(p.vx,p.vy)>4.5&&Math.random()<dt*rate){ slip(p,false,!(S.carrier&&dist(p,S.carrier)<9||!S.carrier)); } } }
    const f=S.ball.air?{x:S.ball.air.from.x+(S.ball.air.to.x-S.ball.air.from.x)*((t-S.ball.air.t0)/S.ball.air.dur),y:S.ball.air.from.y+(S.ball.air.to.y-S.ball.air.from.y)*((t-S.ball.air.t0)/S.ball.air.dur)}:(S.carrier||QB);
    S.cam.x+=(clamp(f.x,FC-SIDE+VIEW/2-2,FC+SIDE-VIEW/2+2)-S.cam.x)*Math.min(1,dt*3); S.cam.y+=(f.y+4-S.cam.y)*Math.min(1,dt*3);
  }
  const spotText=c=>(c.y>=0?'Gain of '+Math.round(c.y):'Loss of '+Math.round(-c.y))+'.';
  const SLIP=.0143;   /* a running man's slip chance a second on a wet field, rain or snow, ball or no ball */
  function slip(p,isC,quiet){ if(!quiet) pop('Slipped','#F0CE26',p,.2); dust(p,6); p.state='slip'; p._st='slip'; p._st0=S.t; p.down=true; p.vx*=.3; p.vy*=.3;
    /* a ball carrier goes down where he fell: the play runs on a beat so his fall plays out, then the whistle */
    if(isC){ p.juke=0; S.slipEnd={t:S.t+.6,p}; return; }
    p.missed=true; p.upAt=S.t+1.0; }
  function dive(p,c){ p.state='dive'; p.until=S.t+.3; p.facing=FACE[dir4(c.x-p.x,(c.y??p.y)-p.y)]; dust(p,5); }
  /* three ways down: a wrap-up (he's held and taken down forward), a big hit (met head on and knocked back) and a
     shoestring dive from behind (tripped and sent sprawling forward). Both men act it out together. */
  /* a direction on the field as a scene's way: 1 right, -1 left, 'up' the field, 'down' it */
  const dir4=(dx,dy)=>Math.abs(dx)>Math.abs(dy)?(dx>=0?1:-1):(dy>=0?'up':'down');
  const FACE={'1':'right','-1':'left',up:'up',down:'down'}, OPP={right:'left',left:'right',up:'down',down:'up'};
  /* put a man where a scene left him: 'across' is the scene's own offset, in sprite pixels along its way */
  function sceneSpot(p,ax,ay,dir,across,isA){ const v=dir==='up'||dir==='down', ds=sceneDir(dir), yd=across*SC/K;
    p.x=ax+(v?(isA?9*SC/K:0):ds*yd); p.y=ay+(v?ds*yd*DK:0); }
  function fx(p,c,kind){
    const dir=Math.abs(c.vx)>.9?Math.sign(c.vx):(p.x<c.x?1:-1);
    c.down=true; c.fxd=true; p.fxd=true; p.down=true; S.fx={kind,a:p,b:c,t0:S.t,dir};
    /* head on (wrap, hit, lift) he's met from the side the tackler is on; from behind (shoe, drag) he's chased from it */
    /* the scene's way: met head on (wrap, hit) he faces the tackler; chased (shoe, drag) the tackler comes from behind;
       a standard tackle goes the way he was running */
    if(SCENES[kind]){ const v=Math.hypot(c.vx,c.vy), sd=kind==='wrap'||kind==='hit'?dir4(p.x-c.x,p.y-c.y):kind==='tackle'&&v>.5?dir4(c.vx,c.vy):dir4(c.x-p.x,c.y-p.y);
      Object.assign(S.fx,{scene:true,ax:c.x,ay:c.y,sdir:sd}); c.facing=FACE[sd]; p.facing=SCENES[kind].A.face>0?c.facing:OPP[c.facing]; }
    dust(c,14); if(kind==='hit') sparks(c,10);
    /* a second man close by piles on */
    const g=S.P.find(d=>d.side==='d'&&d!==p&&!d.down&&!d.seqd&&Math.hypot(d.x-c.x,d.y-c.y)<1.35&&Math.random()<.55);
    if(g){ S.fx.c2=g; g.fxd=true; g.down=true; if(kind!=='hit') pop('Gang tackle','#D9325E',c); }
    if(c.side==='o'&&c.ri!=null) wear(c,kind,!!g); }
  function celebrateD(p){ p.fxd=false; p.down=false; p.lift=0; p.state=p.celeState=['flex','wings','sky','cross','celebrate'][Math.floor(Math.random()*5)]; p.cele0=S.t; p.until=S.t+1.8; p.facing='down'; }
  /* the ball comes out: it bounces to a spot near him */
  function fumble(c){ const spot={x:c.x+(Math.random()-.5)*2.2,y:c.y+(Math.random()-.3)*2}; S.loose={x0:c.x,y0:c.y,to:spot,t0:S.t}; S.ball.holder=null; return spot; }
  /* is he coming from behind the man with the ball: behind where he's going, or behind where he's facing if he's stood still */
  function fromBehind(p,c){ const v=Math.hypot(c.vx,c.vy), f={up:[0,1],down:[0,-1],left:[-1,0],right:[1,0]}[c.facing]||[0,1], ux=v>1?c.vx/v:f[0], uy=v>1?c.vy/v:f[1];
    return (p.x-c.x)*ux+(p.y-c.y)*uy < -.2; }
  function tackled(c,p,kind){
    if(kind==='hit'&&fromBehind(p,c)) kind=null;
    if(!kind&&fromBehind(p,c)) kind=Math.random()<.68?'tackle':'shoe';
    if(!kind){ const head=(p.vx*c.vx+p.vy*c.vy)<-2&&Math.hypot(p.vx,p.vy)>3, behind=!head&&(p.vx*c.vx+p.vy*c.vy)>4, k=Math.random();
      kind=head?(k<.45?'tackle':k<.85?'hit':'wrap'):behind?(k<.68?'tackle':'shoe'):(k<.62?'tackle':k<.86?'hit':'wrap'); }
    const pw=c.pos==='RB'?A(c,2):c.pos==='TE'?A(c,3)*.7:.25;
    if(kind==='hit') c.y-=.5; else if(c.vy>1) c.y+=pw*1.8;      /* a strong back falls forward for more */
    fx(p,c,kind); if(kind==='hit') pop('Big hit','#D9325E',c);
    if(c.y<=.5) S.fx.flex=true;
    if(c.y<=-S.yd) return end('Safety','Brought down in his own end zone. Two points to them.','safety',0);
    if(Math.random()<(.004+Dn(p,hawkOf(p))*.012+(1-A(c,HANDS[c.pos]??2))*.008)*(S.home&&(S.home.rain||S.home.snow)?1.5:1)){ const spot=fumble(c); pop('Stripped','#D9325E',c);
      if(Math.random()<.55) return end('Fumble','#'+p.num+' punches it out and they fall on it.','to',0,spot);
      const y=Math.round(c.y); return end('Fumble','#'+p.num+' knocks it loose, and you fall on it'+(y>=0?' for '+y:', a loss of '+(-y))+'.',y>0?'gain':'loss',y); }
    const y=Math.round(c.y), who=c.name?c.name.split(' ').slice(-1)[0]:'#'+c.num;
    const how={tackle:'Brought down by',hit:'Hit by',shoe:'Tripped up by',wrap:'Wrapped up by',drag:'Dragged down by',sling:'Slung down by'}[kind]||'Brought down by';
    return end(y>=15?'Big play':kind==='hit'&&y<=2?'Big hit':y>0?'Tackled':'Stopped',who+(y>=0?' for '+y:' loses '+(-y))+(S.caught?' after the catch':'')+'. '+how+' #'+p.num+'.',y>0?'gain':'loss',y); }
  /* each frame of a tackle, from its first contact */
  const SCENE_END=1.3;
  function runFx(dt){ const e=S.fx; if(!e) return; const t=S.t-e.t0, a=e.a, b=e.b, d=e.dir;
    if(!e.scene){ a.facing=FACE[dir4(b.x-a.x,b.y-a.y)]; if(t<.02) b.facing=a.facing; }
    if(e.scene){ const sc=SCENES[e.kind];
      if(t<SCENE_END){ a.state='down'; b.state='down'; a.ff=b.ff=1; }
      if(t>=sc.len&&!e.placed){ e.placed=1; sceneSpot(b,e.ax,e.ay,e.sdir,sceneAt(sc.B.k,sc.len)[11],0); sceneSpot(a,e.ax,e.ay,e.sdir,sceneAt(sc.A.k,sc.len)[11],1); } }
    else
    if(e.kind==='sling'||e.kind==='drag'){}
    else if(e.kind==='wrap'){ a.state=t<.32?'wrap':'down'; a.ff=0; b.state=t<.42?'fallF':'down'; b.ff=Math.min(2,Math.floor(t/.13));
      if(t<.42){ b.x+=d*dt*1.4; } a.x=b.x-d*(t<.32?.55:.4); a.y=b.y+.05; }
    else if(e.kind==='hit'){ b.facing=a.x>b.x?'right':'left'; a.facing=b.facing==='right'?'left':'right';
      a.state=t<.4?'block':'stance'; a.ff=Math.floor(t/.1);
      b.state=t<.36?'fallB':'downB'; b.ff=Math.min(2,Math.floor(t/.12)); if(t<.36){ b.y-=dt*2.4; b.x-=(a.x>b.x?1:-1)*dt*1.2; } }
    else { a.state=t<.3?'dive':'down'; a.ff=0; if(t<.3){ a.x+=(b.x-d*.8-a.x)*Math.min(1,dt*10); a.y+=(b.y-.2-a.y)*Math.min(1,dt*10); }
      b.state=t<.12?'run':t<.48?'fallF':'down'; b.ff=Math.min(2,Math.floor((t-.12)/.12)); if(t<.48){ b.x+=d*dt*2; b.y+=dt*1.5; } }
    if(e.scene){}
    else if(e.kind==='drag'){ a.state=t<.45?'drag':'down'; a.ff=0; b.state=t<.4?'fallB':'downB'; b.ff=Math.min(2,Math.floor(t/.13)); if(t<.4) b.x-=d*dt*1.1; a.x=b.x-d*(t<.45?.7:.9); a.y=b.y-.1; }
    else if(e.kind==='sling'){ a.state=t<.5?'wrap':'down'; a.ff=0; a.x=b.x-d*.5;
      if(t<.45){ b.state='run'; b.ph+=dt*20; b.facing=['right','down','left','up','right'][Math.min(4,Math.floor(t/.09))]; } else { b.state='down'; b.facing=a.facing; } }
    if(e.c2){ const g=e.c2; g.facing=FACE[dir4(b.x-g.x,b.y-g.y)]; if(t<.32){ g.state='dive'; g.x+=(b.x-g.x)*Math.min(1,dt*8); g.y+=(b.y+.25-g.y)*Math.min(1,dt*8); } else g.state='down'; }
    if(t>1.3&&t<1.6){ if(!e.cele) a.state='kneel'; b.state='kneel'; if(e.c2) e.c2.state='kneel'; }
    else if(t>=1.6){ if(!e.cele){ a.state='stance'; a.facing='down'; } b.state='stance'; b.facing='up'; b.lift=0; if(e.c2){ e.c2.state='stance'; e.c2.facing='down'; } }
    if(e.flex&&t>(e.scene?SCENE_END:.85)){ if(!e.cele){ e.cele=1; celebrateD(a); } a.state=a.celeState; a.facing='down'; a.fxd=false; }   /* the man who made it gets up and lets them know */
    if(t>2.4) S.fx=null; }
  /* a receiver's catch radius, and where he will be after a throw of this power gets to him */
  const catchR=r=>1.35+A(r,HANDS[r.pos]??2)*.65;
  function routeAt(p,t){ const v=p.vmax; let left=Math.max(0,t-.05-(p.rdelay||0))*v, x=p.x0, y=p.y0; for(const [rx,ry] of p.route){ const tx=p.x0+rx, ty=p.y0+ry, seg=Math.hypot(tx-x,ty-y); if(left<=seg){ const f=left/seg, [qx,qy]=inb(x+(tx-x)*f,y+(ty-y)*f); return {x:qx,y:qy}; } left-=seg; x=tx; y=ty; } const [qx,qy]=inb(x,y); return {x:qx,y:qy}; }
  function leadOf(r,power){ const QB=S.QB, arm=A(QB,0), iv=power>.7?.06:power<.3?.13:.1, fl=d=>(.22+d*.03)*(1.45-.8*power)*(1.32-arm*.6)+iv;
    let t=fl(Math.hypot(r.x-QB.x,r.y-QB.y)), q=null;
    for(let i=0;i<2;i++){ const ahead=routeAt(r,S.t+t), lag={x:ahead.x-(ahead.x-r.x)*.08,y:ahead.y-(ahead.y-r.y)*.08}; q=r.route&&!S.carrier?lag:{x:r.x+r.vx*t,y:r.y+r.vy*t}; t=fl(Math.hypot(q.x-QB.x,q.y-QB.y)); }
    return q; }
  function throwTo(px,py,power){
    if(S.phase!=='live'||S.ball.holder!==S.QB||S.runCall) return; if(power==null) power=.5;
    const QB=S.QB, aim=toY(px,py), d=Math.hypot(aim.x-QB.x,aim.y-QB.y);
    const rush=Math.min(...S.P.filter(p=>p.side==='d'&&(p.shed||!p.blocked)).map(p=>dist(p,QB)),99);
    /* accuracy sets how far a throw strays; arm keeps long ones on line and gets them there sooner; pressure costs less the better he escapes */
    const arm=A(QB,0), acc=A(QB,1), zone=1.9*((1.5-acc*1.4)*(.3+d/20)+(1-arm)*Math.max(0,d-18)/18*.9)+(rush<2.5?1.1:0);   /* QB RATINGS. Arm: how fast it gets there (scaling what the zip meter asks for). Accuracy: how far it lands from where you tapped, further on a long throw. Escape: slipping a rusher. Legs: scrambling. */
    /* THE LANDING ZONE: a circle around where he aimed, as big as his accuracy (and, deep, his arm) and a rusher in his face
       make it; the ball is as likely to come down anywhere in it as anywhere else. A great QB's circle is a dot. */
    const za=Math.random()*Math.PI*2, zr=zone*Math.sqrt(Math.random()), to={x:aim.x+Math.cos(za)*zr, y:aim.y+Math.sin(za)*zr};
    S.tgt=S.rec.filter(r=>!r.down).sort((a,b)=>Math.hypot(a.x-aim.x,a.y-aim.y)-Math.hypot(b.x-aim.x,b.y-aim.y))[0]||null;
    /* how he throws it: a bullet comes out quick, a lob with a long wind-up, on the move from the side, a jump pass with a man in his face, or his standard throw */
    const moving=Math.hypot(QB.vx,QB.vy)>2.2, style=rush<1.6?'jump':moving?'run':power>.7?'quick':power<.3?'lob':'standard', iv={quick:.06,lob:.13,run:.08,jump:.09,standard:.1}[style];
    /* a lob hangs: half again as long in the air and high enough to clear the men underneath; a bullet gets there in two thirds of the time, flat */
    const dur=(.22+d*.03)*(1.45-.8*power)*(1.32-arm*.6), arc=Math.max(.8,d*(.34-.28*power));
    S.ball.air={from:{x:QB.x,y:QB.y},to,aim,t0:S.t+iv,dur,d,arc,power}; S.ball.holder=null; S.thrown=true;
    QB.state='throw'; QB.throw0=S.t; QB.throwIv=iv; QB.throwStyle=style; QB.until=S.t+iv*4; if(style==='run') QB.facing=QB.vx>=0?'right':'left'; buttons(); hint('');
  }
  /* A PASS PLAY BETWEEN TWO MEN, acted out together (the contested catch, Mossed, the swat, the undercut pick): both are
     held to the scene while it runs, moved where it puts them, then let go. A catch is his before anyone can hit him. */
  /* It starts at the catch: the real throw has already put the ball in his hands, so nothing comes in from an angle the
     throw didn't. A scene can be one man alone (the edge catches). */
  function passScene(kind,a,b,face){ const sc=SCENES[kind], v=Math.hypot(b.vx,b.vy), sd=face||(v>.5?dir4(b.vx,b.vy):'up'), si=q=>q.si!=null?q.si:((q.num||0)*7)%SKIN.length, c0=sc.catchT||0;
    S.ps={kind,a,b,t0:S.t-c0,ax:b.x,ay:b.y,sdir:sd,len:sc.len,who:{A:a?{k:a.side,si:si(a)}:null,B:{k:b.side,si:si(b)}}};
    b.seqd=b.fxd=true; b.facing=FACE[sd]; if(a){ a.seqd=a.fxd=true; a.facing=sc.A.face>0?b.facing:OPP[b.facing]; }
    S.secure=Math.max(S.secure||0,S.t+sc.len-c0); }
  function runPs(){ const q=S.ps, t=S.t-q.t0, sc=SCENES[q.kind];
    sceneSpot(q.b,q.ax,q.ay,q.sdir,sceneAt(sc.B.k,Math.min(t,sc.len))[11],0); if(q.a) sceneSpot(q.a,q.ax,q.ay,q.sdir,sceneAt(sc.A.k,Math.min(t,sc.len))[11],1);
    if(t<sc.len) return; S.ps=null;
    /* let go: whoever the scene left on the ground stays down a moment; the man with the ball runs on the way it was going */
    [['A',q.a],['B',q.b]].filter(x=>x[1]).forEach(([role,p])=>{ p.seqd=p.fxd=false; const e=sceneAt(sc[role].k,sc.len);
      if(e[1]<20){ p.state=e[2]>0?'down':'downB'; p.ff=1; p.down=true; p.missed=true; p.upAt=S.t+1.1; } else p.state=S.carrier===p&&S.phase==='live'?'run':'stance'; });
    const c=S.carrier; if(c&&(c===q.a||c===q.b)&&S.phase==='live'){ const ds=sceneDir(q.sdir), sp=c.vmax*.8;
      if(q.sdir==='up'||q.sdir==='down'){ c.vx=0; c.vy=ds*sp; } else { c.vx=ds*sp; c.vy=0; } c.facing=FACE[q.sdir]; } }
  /* he goes for it: hands up for a high one, low for a short one, stretched out if it's away from him */
  function reachFor(r,to){ const off=dist(r,to); r.state=off>.7?'reach':to.y<r.y-.2?'catchLow':'catch'; r.reachL=to.x<r.x; r.until=S.t+.4; r.ph=0; }
  /* it comes off the hands and falls a step or two away */
  function deflect(to,later){ S.loose={x0:to.x,y0:to.y,to:{x:to.x+(Math.random()-.5)*2.4,y:to.y-.6-Math.random()*1.4},t0:S.t+(later||0)}; }
  function arrive(a){
    /* a zip is a line drive: nobody goes up for it, it's taken at the chest or knocked down */
    const zip=(a.power||0)>.66, up=st=>zip&&st==='leap'?'reach':st;
    const to=a.to, off=S.rec.filter(r=>!r.down&&!['wall','stalk','block','lead','protect'].includes(r.role)).map(r=>[r,dist(r,to)]).sort((x,y)=>x[1]-y[1])[0], defs=S.P.filter(p=>p.side==='d'&&!p.down&&p.pos!=='DL').map(p=>[p,dist(p,to)]).sort((x,y)=>x[1]-y[1]), def=defs[0], d2=defs[1]?defs[1][1]:99;
    const od=off?off[1]:99, dd=def?def[1]:99;
    const rh=off?A(off[0],HANDS[off[0].pos]??2):.5, R=1.35+rh*.65;   /* how far he can reach for it, 1.35 to 2 yards */
    /* THE BALL COMES DOWN: one roll between the receiver and the nearest defender, by who is nearer the spot and who is
       better at the ball, not who got there first. The receiver can reach 1.35-2 yds (his hands), a defender 1-1.35 (his
       ball hawk). Both in reach is a jump ball: at the same spot two 99s give the receiver about 55%, the defender a pick
       about 13%, the rest knocked away. Each yard nearer the spot is worth a lot. */
    const d=def&&def[0], hw=d?Df(d,hawkOf(d)):0, Rd=1.0+hw*.35, rIn=!!off&&od<=R+.3, dIn=!!d&&dd<=Rd, dd2=defs[1]&&defs[1][0], hw2=dd2?Df(dd2,hawkOf(dd2)):0;
    if(!rIn&&!dIn) return end('Incomplete','Nobody near it.','inc',0,to);
    const r=off?off[0]:null, hands=r?(.9+A(r,HANDS[r.pos]??2)*.085)*(S.home&&S.home.rain?.965:1):0, ct=r?(CONT[r.pos]!=null?A(r,CONT[r.pos]):rh):0, dbl=dIn&&d2<1.6;
    const w=!dIn?1:!rIn?0:1/(1+Math.exp(-(.24+3*(dd-od)+1.2*((rh+ct)/2-hw)-(dbl?2.25+.5*hw2:0))));
    const hwP=dbl?Math.max(hw,hw2):hw, pickP=dIn?(1-w)*((rIn?.08+.22*hwP:.2+.35*hwP)+(dbl?.1:0))*(1-.3*dd/Rd)*(S.home&&S.home.rain?.8:1):0;   /* in the rain a defender holds on less, too: more of them are knocked away */
    const contested=dIn, diving=rIn&&od>R*.8, reach=od>R*.8?.6:clamp(1-(od/R)**2*.6,.6,1);   /* a ball he has to stretch past a yard for is harder to hold, the further the harder */
    const roll=Math.random(), pC=rIn?w*clamp(hands*reach,.05,.985):0;
    if(roll>=pC&&roll<pC+pickP){ d.state=up('leap'); d.leap0=S.t; d.until=S.t+.38; d.x=to.x; d.y=to.y; S.ball.holder=d; S.picker=d;
      const k=dd>.7?'dive':d.y<to.y-.2||(zip&&Math.random()<.6)?'catchLow':Math.random()<(zip?1:.3)?'oneHand':'leap';
      d.state=k==='leap'?'leap':k; d.until=S.t+.35; if(k==='dive') dive(d,to); d.leapH=k==='leap'?18:0;
      /* the undercut: he jumps the route in front of the receiver; the high point: he wins it at the top over him */
      if(off&&od<1.4&&k==='catchLow') passScene('pick',d,off[0]); else if(off&&od<1.3&&k==='leap') passScene('contest',off[0],d);
      pop({dive:'Diving pick',catchLow:'Undercut',oneHand:'One-hand pick',leap:'Picked off'}[k],'#D9325E',d); return end('Intercepted','#'+d.num+(rIn?' won it in the air.':' was the only one who could get to it.'),'to',0,to); }
    if(!rIn){ if(dd>.6&&Math.random()<.5){ dive(d,to); pop('Pass breakup','#D9325E',d); if(off&&od<R+.6) reachFor(off[0],to); deflect(to); }
      else { pop('Swatted','#D9325E',d); if(off&&od<Math.min(R,1.6)){ passScene('swat',d,off[0]); deflect(to,.2); } else deflect(to); }
      return end('Broken up','#'+d.num+' got a hand on it.','inc',0,to); }
    /* both go up for it when it's contested */
    if(contested){ d.state=up('leap'); d.leap0=S.t; d.until=S.t+.38; }
    const caught=roll<pC, inHands=!caught&&roll>=w*hands;
    if(dbl&&caught) pop('Through two','#4C9EFF',r);
    /* caught past the end line or over the sideline: he had it, but he was out */
    if(caught&&(Math.abs(to.x-FC)>SIDE||to.y>S.goal+10)){ reachFor(r,to); pop('Out of bounds','#F0CE26',r); return end('Incomplete',(r.name||'#'+r.num)+' had it, but out of bounds.','inc',0,to); }
    if(caught&&diving){ S.caught=true; S.catcher=r; pop('Diving catch','#4C9EFF',r); { const ux=to.x-r.x, uy=to.y-r.y, ul=Math.hypot(ux,uy)||1; r.x=to.x-ux/ul*.6; r.y=to.y-uy/ul*.6; dive(r,{x:r.x+ux,y:r.y+uy}); } r.until=S.t+.25; S.ball.holder=r;
      const y=Math.round(to.y); return end(y>=S.goal?'Touchdown':'Diving catch',(r.name||'#'+r.num)+' lays out for it'+(y>=S.goal?' in the end zone.':', '+y+' yards.'),y>=S.goal?'td':'gain',y>=S.goal?S.goal:y); }
    if(caught){ S.caught=true; S.catcher=r; r.x=to.x; r.y=to.y; S.ball.holder=r; S.carrier=r; r.path=null; r.route=null; hint('Tap left or right of him to cut');
      /* a short one in coverage: he snaps it straight into a tight, secure carry and keeps running, the better his hands the more often */
      const atLine=to.y>=S.goal+10-1.8, atSide=Math.abs(to.x-FC)>SIDE-2.4;
      if(atLine&&to.y>=S.goal){ passScene('toeDrag',null,r,dir4(r.vx||0,Math.max(.1,r.vy||1))); pop('Toe drag','#4C9EFF',r); }
      else if(atSide){ passScene('sideTap',null,r,to.x>FC?1:-1); pop('Toe tap','#4C9EFF',r); }
      else if(d&&dd<1.9&&a.d<15&&!r.rose&&Math.random()<.3+rh*.5){ r.state='catch'; r.tuck=S.t; r.until=S.t+.3; }
      else if(contested&&d&&!zip){ const moss=ct>.55&&Math.random()<.45; passScene(moss?'mossed':'contest',d,r); pop(moss?'Mossed':'Over the top','#4C9EFF',r); }
      else if(contested&&!zip){ r.state='leap'; r.leap0=S.t; r.until=S.t+.38; }
      else if(contested){ r.state='catch'; r.until=S.t+.28; }
      else if(od>R*.35&&Math.random()<.5){ r.state='oneHand'; r.until=S.t+.38; pop('One hand','#4C9EFF',r); }
      else if(hands<.88&&Math.random()<.2){ S.bobble={r,t0:S.t}; r.state='catchLow'; r.until=S.t+.48; r.slow=S.t+.48; pop('Bobbled','#F0CE26',r); }
      else if(a.d>17){ r.state='catch'; r.until=S.t+.3; }                       /* over the shoulder, hands high */
      else if(a.d<8){ r.state='catchLow'; r.until=S.t+.28; }                    /* a short one, into the basket */
      else if(od>.6){ r.state='reach'; r.until=S.t+.3; r.reachL=to.x<r.x; }     /* stretched out for it */
      else { r.state='catch'; r.until=S.t+.25; }
      /* the catch is his first: no tackle lands until his hands have it in, and he's slowed while he secures it */
      S.secure=Math.max(r.until||0,S.t+.24); r.slowK=r.slow>S.t?.6:.88; r.slow=Math.max(r.slow||0,S.secure);
      if(r.y>=S.goal) return end('Touchdown',(r.name||'#'+r.num)+' catches it in the end zone.','td',S.goal);
      if(Math.abs(to.x)<5.5&&to.y>3&&d&&dd<2.4) S.bigHit={d,at:S.t+(contested?.34:.18)};
      return; }
    if(dbl) pop('Double covered','#D9325E',r);
    if(diving){ dive(r,to); pop('Just missed','#F0CE26',r); }
    else if(!dIn&&!inHands){ reachFor(r,to); deflect(to); pop(to.y<r.y-.4?'Behind him':'Off his fingertips','#F0CE26',r); }
    else if(!dIn){ r.state='catchLow'; r.until=S.t+.4; S.loose={x0:r.x,y0:r.y,to:{x:r.x+(Math.random()-.5)*1.6,y:r.y-.8},t0:S.t}; pop('Dropped','#F0CE26',r); }
    else if(dd<1.3){ pop('Broken up','#D9325E',d); passScene('swat',d,r); deflect(to,.2); }
    else { pop('Broken up','#D9325E',d||r); reachFor(r,to); if(d&&dd<1.6&&d.state!=='leap'){ d.state=up('leap'); d.leap0=S.t; d.until=S.t+.38; } deflect(to); }
    end(dIn?'Broken up':'Incomplete',dIn?(dbl?'Double covered, and they won it.':'Contested, and the defender won it.'):diving?'He laid out for it and couldn\'t hold on.':inHands?'Dropped.':'Just out of his reach.','inc',0,to);
  }
  function end(head,body,kind,yards,at){
    if(S.over) return; S.over=true; S.phase='done'; S.ball.air=null; if(at&&kind!=='to') S.landed=at;
    S.result={head,body,kind,yards,at:at?{x:at.x,y:at.y}:null,injury:S.injury||null};
    if(kind==='gain'||kind==='loss'){ const c=S.carrier||(S.ball.holder&&S.ball.holder.side==='o'?S.ball.holder:S.QB); if(c) S.nextBF=clamp(c.x-FC,-HASH,HASH); } STA=STA.map(v=>Math.max(0,v-.28));
    if(kind==='td') S.flashT=S.t;   /* the cameras go off */
    if(kind==='td'){ const sc=S.carrier||S.ball.holder; if(sc&&!sc.fxd&&sc.state!=='dive'){ const k=['celebrate','spike','dance','bow','sky'][Math.floor(Math.random()*5)]; sc.state=k; sc.cele0=S.t; sc.until=S.t+2.2; sc.facing=k==='bow'?(sc.vx>=0?'right':'left'):'down';
      if(k==='spike'){ S.ball.holder=null; S.loose={x0:sc.x,y0:sc.y,to:{x:sc.x+.8,y:sc.y-.6},t0:S.t+.15}; } } pop('Touchdown','#4ade80',sc||S.QB); const cc=sc||S.QB; burst(cc.x,cc.y,80,{cols:CONF,sp:3.2,vz:7,z:2,g:2.4,life:2.4,s:3});
      if(S.home&&S.home.event) [-1,1].forEach(sd=>{ burst(FC+sd*(SIDE+12),cc.y+6,60,{cols:['#F0CE26','#FDFEFC','#FF8E1C','#4C9EFF'],sp:5,vz:4,z:9,g:1.4,life:1.8,s:3}); }); }
    const col={td:'#4ade80',gain:'#4ade80',loss:'#D9325E',to:'#D9325E',safety:'#D9325E',inc:'#F0CE26'}[kind]||'#FDFEFC';
    if(kind==='td'||(yards>=15&&kind==='gain')) HYPE=performance.now()/1000+3.5;
    if(MATCH) MATCH.played(S.result); const R0=S.result;
    setTimeout(()=>{ $('#res').innerHTML=`<small>They were in ${LOOKS[S.look]} out of a ${S.front||'nickel'}</small><b style="color:${col}">${head}</b><span>${esc(R0.body)}</span>`; $('#res').className='result show'; buttons(); },650);
    hint('');
  }
  function hint(s){ $('#hint').textContent=s; $('#hint').style.display=s?'':'none'; }
  /* THE STADIUM around the field, in yards like everything else, so it moves with the camera: a white border, each
     team's sideline (its players standing in their kits between the 30s, the coaches' box marked in yellow), a padded wall
     in the home team's colour, and the stands, full, every seat a fan. Behind each end line the same, with the goalposts. */
  const hashU=(a,b)=>{ const v=Math.sin(a*12.9898+b*78.233)*43758.5453; return v-Math.floor(v); };
  function stadium(){
    const hk=(S.home&&S.home.k)||'o', ak=hk==='o'?'d':'o', hc=(KIT[hk]&&KIT[hk].jersey[1])||'#3f8fea', ac=(KIT[ak]&&KIT[ak].jersey[1])||'#3d4049';
    const EL0=-S.yd-10, EL1=S.goal+10, R=(x0,y0,x1,y1,c)=>{ x0+=FC; x1+=FC; const [a,b]=toS(x0,y1),[c2,d]=toS(x1,y0); if(c2<0||a>W||d<0||b>H) return; ctx.fillStyle=c; ctx.fillRect(Math.floor(a),Math.floor(b),Math.ceil(c2-a)+1,Math.ceil(d-b)+1); };
    const xv0=S.cam.x-VIEW/2-2, xv1=S.cam.x+VIEW/2+2, yv0=toY(0,H).y-2, yv1=toY(0,0).y+2;
    ctx.fillStyle='#202327'; ctx.fillRect(0,0,W,H);
    /* the stands: rows of concrete, a fan in nearly every seat, most of them in the home colour */
    const ev=S.home&&S.home.event, nowS=performance.now()/1000, hype=nowS<HYPE, waveOn=(nowS%38)<11, waveX=((nowS%38)*24)%420;
    const night=S.home&&S.home.time==='night', dusk=S.home&&S.home.time==='dusk', rainy=!!(S.home&&S.home.rain);
    const SEAT=.66, FAN=['#E6E8EB','#2b2d31','#c94f3d','#3d6fc9','#e0b43a','#7a7f87','#4a8f5a'], sz=Math.max(2,Math.round(K*.42));
    const stands=(x0,x1,y0,y1)=>{ x0=Math.max(x0+FC,xv0); x1=Math.min(x1+FC,xv1); y0=Math.max(y0,yv0); y1=Math.min(y1,yv1); if(x1<=x0||y1<=y0) return;
      for(let gy=Math.ceil(y0/SEAT);gy*SEAT<y1;gy++){ R(x0-FC,gy*SEAT-SEAT*.5,x1-FC,gy*SEAT,gy%2?'#272a2f':'#2c3036');
        for(let gx=Math.ceil(x0/SEAT);gx*SEAT<x1;gx++){ const h=hashU(gx,gy); if(h<.07) continue;
          const [sx,sy]=toS(gx*SEAT+(h-.5)*.12,gy*SEAT); let c=h<.52?hc:h<.64?ac:FAN[Math.floor(h*977)%FAN.length]; if(rainy&&h>.78&&h<.9) c=['#dfe6ee','#f0ce26','#9fb3c8'][Math.floor(h*1000)%3];
          if((ev||night)&&hashU(gy,gx*1.7)<(ev?.05:.045)&&Math.floor(nowS*6+hashU(gx*3,gy)*40)%23===0) c=night?'#FFF6D8':'#FFFFFF';
          if(S.flashT!=null&&S.t-S.flashT<3.2&&hashU(gx*1.3,gy*2.1)<.07){ const ph=(nowS*7+hashU(gy*5,gx)*40)%5; if(ph<1){ const k=Math.sin(ph*Math.PI), [fx,fy]=toS(gx*SEAT,gy*SEAT), cx=Math.round(fx), cy=Math.round(fy-sz), L=Math.round(sz*(2+k*4)), l=Math.round(sz*(1+k*2));
            ctx.fillStyle='rgba(255,255,255,'+(.55+.45*k).toFixed(2)+')'; ctx.fillRect(cx-1,cy-1,3,3); ctx.fillRect(cx-L,cy,L*2+1,1); ctx.fillRect(cx,cy-L,1,L*2+1);
            ctx.fillStyle='rgba(255,255,255,'+(.35*k).toFixed(2)+')'; for(let i=1;i<=l;i++){ ctx.fillRect(cx+i,cy+i,1,1); ctx.fillRect(cx-i,cy-i,1,1); ctx.fillRect(cx+i,cy-i,1,1); ctx.fillRect(cx-i,cy+i,1,1); } } }
          const wv=waveOn&&Math.abs((((gx+gy)%420)+420)%420-waveX)<4, lift=(hype?Math.max(0,Math.sin(nowS*10+h*31))*sz*.9:0)+Math.sin(nowS*2.1+h*40)*sz*.14+(wv?sz*.9:0), fy=Math.round(sy-lift);
          ctx.fillStyle=c; ctx.fillRect(Math.round(sx-sz/2),Math.round(fy-sz*.7),sz,Math.max(2,Math.round(sz*.75)));
          ctx.fillStyle=SKIN[Math.floor(h*311)%SKIN.length][1]; const hs=Math.max(1,Math.round(sz*.55)); ctx.fillRect(Math.round(sx-hs/2),Math.round(fy-sz*.7-hs),hs,hs);
          if(h>.989){ const sw=sz*3.4, shh=sz*1.5, by=fy-sz*2.3-Math.abs(Math.sin(nowS*3+h*9))*sz*.4; ctx.fillStyle='#F4F1E8'; ctx.fillRect(Math.round(sx-sw/2),Math.round(by),Math.round(sw),Math.round(shh));
            ctx.fillStyle=h>.995?hc:'#D9325E'; ctx.fillRect(Math.round(sx-sw/2+sz*.4),Math.round(by+shh*.3),Math.round(sw-sz*.8),Math.max(1,Math.round(shh*.4))); } } } };
    stands(-SIDE-60,-SIDE-6.6,EL0-60,EL1+60); stands(SIDE+6.6,SIDE+60,EL0-60,EL1+60);
    stands(-SIDE-6.6,SIDE+6.6,EL1+4.6,EL1+60); stands(-SIDE-6.6,SIDE+6.6,EL0-60,EL0-4.6);
    /* the wall, padded in the home colour, and the grass inside it */
    const wc=mixC(hc,'#000000',.25);
    const PAL=fieldPal(); R(-SIDE-6.6,EL0-4.6,SIDE+6.6,EL1+4.6,wc); R(-SIDE-6,EL0-4,SIDE+6,EL1+4,PAL.s1);
    for(let y=Math.floor((EL0-4)/7)*7,k=0;y<EL1+4;y+=7,k++){ const c=k%3===0?'#F4F1E8':k%3===1?mixC(hc,'#ffffff',.25):'#F0CE26'; R(-SIDE-6.6,y+1,-SIDE-6.05,y+5,c); R(SIDE+6.05,y+1,SIDE+6.6,y+5,c); }
    if(ev){ const bc=ev.big?['#F0CE26','#FDFEFC']:[hc,'#FDFEFC']; for(let y=Math.floor(EL0-4),k=0;y<EL1+4;y+=2,k++){ const c=bc[k%2]; R(-SIDE-6.6,y,-SIDE-6,y+1.4,c); R(SIDE+6,y,SIDE+6.6,y+1.4,c); } }
    for(let yd=Math.floor((EL0-4)/5)*5;yd<EL1+4;yd+=5){ if(((yd/5)%2+2)%2) R(-SIDE-6,yd,SIDE+6,Math.min(yd+5,EL1+4),PAL.s2); }
    /* snow banked along the walls */
    if(PAL.w==='snow') for(let y=Math.floor(EL0-4);y<EL1+4;y+=1.5){ const h=hashU(y*3,5); R(-SIDE-6,y,-SIDE-6+.6+h*1.4,y+1.5,'#eef2f4'); R(SIDE+6-.6-hashU(y*3,9)*1.4,y,SIDE+6,y+1.5,'#eef2f4'); }
    /* the white border all the way round */
    R(-SIDE-.6,EL0-.6,SIDE+.6,EL1+.6,'#E9ECE8');
    /* each sideline: the coaches' box between the 25s, the team standing in its kit between the 30s, home on the left */
    [[-1,hk,hc],[1,ak,ac]].forEach(([sd,k,c])=>{ const x=sd*(SIDE+2.2);
      for(let a=25;a<75;a+=1.2){ const y=a-S.yd; if(y<yv0||y>yv1) continue; R(x-.08,y,x+.08,y+.6,'#F0CE26'); }
      for(let a=31;a<=69;a+=1.35){ const y=a-S.yd+Math.sin(nowS*.7+hashU(sd,a)*30)*.35; if(y<yv0||y>yv1) continue; const h=hashU(a,sd), xx=FC+sd*(SIDE+3.3+h*1.6+Math.sin(nowS*1.1+h*25)*.3);
        const [sx,sy0]=toS(xx,y), sy=sy0-(hype?Math.max(0,Math.sin(nowS*9+h*20))*K*.5:0), w=Math.max(3,Math.round(K*.55)); ctx.fillStyle=c; ctx.fillRect(Math.round(sx-w/2),Math.round(sy-w*.6),w,Math.round(w*.9));
        ctx.fillStyle=(KIT[k]&&KIT[k].helmet[1])||c; ctx.fillRect(Math.round(sx-w*.3),Math.round(sy-w*1.1),Math.round(w*.6),Math.round(w*.55)); }
      R(sd>0?SIDE+4.9:-SIDE-5.4,40-S.yd,sd>0?SIDE+5.4:-SIDE-4.9,60-S.yd,mixC(c,'#000000',.45)); });
    /* the goalposts on each end line */
    [[EL1,1],[EL0,-1]].forEach(([y,d])=>{ R(-3.1,d>0?y+.05:y-.3,3.1,d>0?y+.3:y-.05,'#F0CE26'); R(-.22,d>0?y+.3:y-1.4,.22,d>0?y+1.4:y-.3,'#F0CE26'); });
  }
  let RAYCV=null;
  /* at night the sidelines sit outside the light: their turf is a good deal darker */
  function fieldPal(){ const P=fieldPal0(); if(P.tm==='night'){ P.s1=mixC(P.s1,'#000000',.45); P.s2=mixC(P.s2,'#000000',.45); } return P; }
  function fieldPal0(){ const h=S.home||{}, w=h.snow?'snow':h.rain?'rain':'', tm=h.time;
    if(w==='snow') return {w,tm,f1:'#869b91',f2:'#93a89e',s1:'#c7d0ce',s2:'#d2dad8'};
    if(w==='rain') return {w,tm,f1:'#19492a',f2:'#1c522e',s1:'#13321f',s2:'#163923'};
    if(tm==='day') return {w,tm,f1:'#256a37',f2:'#2c773f',s1:'#1c4a2d',s2:'#205233'};
    return {w,tm,f1:'#1F5A2E',f2:'#246335',s1:'#183f27',s2:'#1b4a2c'}; }
  function draw(){
    if(!W||!S.ball) return;
    stadium();
    const top=toY(0,0).y+2, bot=toY(0,H).y-2, [sl]=toS(FC-SIDE,0), [sr]=toS(FC+SIDE,0), [ox,oy]=toS(0,0), xl=Math.max(sl,0), xr=Math.min(sr,W);
    const back=-S.yd-10, front=S.goal+10, [,yb]=toS(0,back), [,yf]=toS(0,front);
    const PAL=fieldPal(); ctx.fillStyle=PAL.f1; ctx.fillRect(sl,yf,sr-sl,yb-yf);
    ctx.fillStyle=PAL.f2; for(let yd=Math.floor(bot/5)*5;yd<=top;yd+=5){ if(((Math.floor((S.yd+yd)/5))%2+2)%2) continue; const ya=toS(0,yd)[1], yb2=toS(0,yd+5)[1];
      const y0=Math.max(yf,Math.min(ya,yb2)), y1=Math.min(yb,Math.max(ya,yb2)); if(y1>y0) ctx.fillRect(sl,y0,sr-sl,y1-y0); }
    if(PAL.w){ for(let i=0;i<70;i++){ const ay=hashU(i,5)*120-10, wx=FC+(hashU(i,9)-.5)*2*(SIDE-1.5), [px,py]=toS(wx,ay-S.yd); if(py<-20||py>H+20) continue; const w=(1.2+hashU(i,11)*2.4)*K, h=(.35+hashU(i,17)*.5)*K;
        ctx.fillStyle=PAL.w==='rain'?'rgba(120,150,175,.16)':'rgba(240,244,246,.42)'; ctx.beginPath(); ctx.ellipse(px,py,w/2,h/2,0,0,P2); ctx.fill();
        if(PAL.w==='rain'){ ctx.fillStyle='rgba(210,225,240,.14)'; ctx.fillRect(Math.round(px-w*.25),Math.round(py-h*.15),Math.round(w*.4),1); } } }
    /* END ZONES: the home team's. Its colour, its name painted across each one, orange pylons at the corners */
    { const hk=(S.home&&S.home.k)||'o', hc=(KIT[hk]&&KIT[hk].jersey[1])||'#3f8fea', name0=String((S.home&&S.home.name)||'GFL').toUpperCase(), ev=S.home&&S.home.event;
      [S.goal,-S.yd-10].forEach(a=>{ const name=ev&&a===S.goal?ev.label:name0; const [,e1]=toS(0,a+10),[,e0]=toS(0,a),[,em]=toS(0,a+5); if(e0<0||e1>H) return;
        ctx.fillStyle=mixC(hc,'#000000',.3); ctx.fillRect(sl,e1,sr-sl,e0-e1);
        ctx.fillStyle='rgba(255,255,255,.07)'; for(let k=0;k<10;k+=2){ const [,s1]=toS(0,a+k+1),[,s0]=toS(0,a+k); ctx.fillRect(sl,s1,sr-sl,s0-s1); }
        /* painted on the grass: sized in yards and centred on the field, so it stays put as the camera moves, with the
           home team's logo either side of the name, all a little see-through like paint on turf */
        const cx=(sl+sr)/2, fw=sr-sl, im=S.home&&S.home.img, logo=im&&im.complete&&im.naturalWidth?im:null, lg=K*5, gap=K*1.2;
        let fs=K*3.6; ctx.font='800 '+fs+'px Inter, sans-serif'; let tw=ctx.measureText(name).width; const room=Math.min(fw*.9,K*34)-(logo?2*(lg+gap):0);
        if(tw>room){ fs*=room/tw; ctx.font='800 '+fs+'px Inter, sans-serif'; tw=ctx.measureText(name).width; }
        ctx.save(); ctx.globalAlpha=.8; ctx.fillStyle='#F4F6F2'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(name,cx,em+fs*.05);
        if(logo){ const k=Math.min(lg/logo.naturalWidth,lg/logo.naturalHeight), w=logo.naturalWidth*k, h=logo.naturalHeight*k;
          [-1,1].forEach(sd=>ctx.drawImage(logo,cx+sd*(tw/2+gap+lg/2)-w/2,em-h/2,w,h)); }
        ctx.restore(); ctx.textBaseline='alphabetic';
        const pw=Math.max(3,Math.round(K*.45)); ctx.fillStyle='#FF6A1C'; [[sl,e0],[sl,e1],[sr,e0],[sr,e1]].forEach(([x,y])=>ctx.fillRect(Math.round(x-pw/2),Math.round(y-pw/2),pw,pw)); }); }
    const [h1]=toS(FC-HASH,0),[h2]=toS(FC+HASH,0);
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
      S.P.forEach(p=>{ if(!p.route) return; let ox=p.x, oy=p.y;
        if(S.mot&&S.mot.p===p){ path([[p.x,p.y],S.mot.to],'rgba(76,158,255,.55)',1.4,[2,3]); [ox,oy]=S.mot.to; }
        path([[ox,oy],...p.route.map(([rx,ry])=>[ox+rx,oy+ry])],'rgba(76,158,255,.7)',1.6,[5,4]); });
      if(S.jet){ const J=S.jet, d=PLAYS[S.call].dir; path([[J.x,J.y],[d*JET_SNAP,JET_Y],[0,JET_Y]],'rgba(255,142,28,.85)',1.8,[4,4]); path([[0,JET_Y],...PLAYS[S.call].path.map(([x,y],i,a)=>i===a.length-1?[x,y+1]:[x,y])],'rgba(255,142,28,.85)',2.2,[]); }
      else if(S.runCall) path([[S.RB.x,S.RB.y],...PLAYS[S.call].path.map(([x,y],i,a)=>i===a.length-1?[x,y+1]:[x,y])],'rgba(255,142,28,.85)',2.2,[]);
      ctx.restore(); }
    /* THE LIGHT, over the stands and the field alike: a warm sun by day, a low orange sun at dusk, under the lights at
       night (a glow from the light towers above), and a grey wash in the rain */
    { const h=S.home||{}, tm=h.time; if(tm==='day'&&!h.rain&&!h.snow){ ctx.fillStyle='rgba(255,244,210,.05)'; ctx.fillRect(0,0,W,H); }
      if(tm==='dusk'){ const g=ctx.createLinearGradient(0,0,W,H*.6); g.addColorStop(0,'rgba(255,140,50,.20)'); g.addColorStop(.55,'rgba(230,90,70,.10)'); g.addColorStop(1,'rgba(70,30,110,.18)'); ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
        if(!h.rain&&!h.snow){ const sg=ctx.createRadialGradient(W*.05,-H*.05,4,W*.05,-H*.05,H*.55); sg.addColorStop(0,'rgba(255,214,140,.32)'); sg.addColorStop(.35,'rgba(255,170,90,.12)'); sg.addColorStop(1,'rgba(255,170,90,0)'); ctx.fillStyle=sg; ctx.fillRect(0,0,W,H); } }
      if(h.rain){ ctx.fillStyle='rgba(28,42,62,.2)'; ctx.fillRect(0,0,W,H); } }
    const u=PU*SC;
    const E=S.fx&&S.fx.scene&&S.t-S.fx.t0<SCENE_END?S.fx:null;
    const dk=p=>p.y-(p===S.catcher&&CATCHING.has(p.state)?3:0);
    [...S.P].sort((a,b)=>dk(b)-dk(a)).forEach(p=>{ const [x,y]=toS(p.x,p.y);
      if(E&&p===E.a) return;
      const PS=S.ps;
      if(PS&&p===PS.a) return;
      if(PS&&p===PS.b){ const [ax,ay]=toS(PS.ax,PS.ay), hand=drawScene(ctx,PS.kind,S.t-PS.t0,ax,ay,PS.sdir,SC,PS.who);
        if(hand&&(S.ball.holder===PS.a||S.ball.holder===PS.b)) drawBall(ctx,hand[0],ay,Math.max(2,ay-hand[1]),SC,0,true); return; }
      const Q=S.seq&&S.seq.scene?S.seq:null;
      if(Q&&p===Q.b) return;
      if(Q&&p===Q.a){ const [ax,ay]=toS(Q.ax,Q.ay), si=q=>q.si!=null?q.si:((q.num||0)*7)%SKIN.length;
        const hand=drawScene(ctx,Q.name,S.t-Q.t0,ax,ay,Q.sdir,SC,{A:{k:Q.b.side,si:si(Q.b)},B:{k:Q.a.side,si:si(Q.a)}});
        if(S.ball.holder===p&&hand) drawBall(ctx,hand[0],ay,Math.max(2,ay-hand[1]),SC,0,true);
        return; }
      if(E&&p===E.b){ const [ax,ay]=toS(E.ax,E.ay), si=q=>q.si!=null?q.si:((q.num||0)*7)%SKIN.length;
        const hand=drawScene(ctx,E.kind,S.t-E.t0,ax,ay,E.sdir,SC,{A:{k:E.a.side,si:si(E.a)},B:{k:E.b.side,si:si(E.b)}});
        if(S.ball.holder===p&&hand) drawBall(ctx,hand[0],ay,Math.max(2,ay-hand[1]),SC,0,true);
        return; }
      if(p._st!==p.state){ p._st=p.state; p._st0=S.t; } const age=S.t-(p._st0||0);
      let st=p.state, fr=p.fxd?(p.ff||0):(st==='run'?p.ph%8:0), face=p.facing, lift=0;
      /* frames: a one-off plays through by time, a loop alternates */
      if(ONESHOT[st]) fr=stageOf(ONESHOT[st],age); else if(LOOP.has(st)) fr=Math.floor(age/.12)%2;
      if(st==='slip'&&age>.34){ st='downB'; fr=1; }
      if(st==='catch') fr=(p.ph%8)+100*(p.tuck&&S.t-p.tuck<.6?1+stageOf([.07],age):stageOf(ONESHOT.catch,age));
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
      if(p.plantUntil&&S.t<p.plantUntil&&st==='run'){ st='plant'; fr=0; }
      if(st==='plant'&&(face==='up'||face==='down')) face=p.plantDir<0?'upL':'up';
      /* a ring under his feet in his tier's colour */
      if(!LYING.has(st)&&p.pos!=='OL'){ ctx.strokeStyle=TIERC[TIER(p.r)]; ctx.lineWidth=2; ctx.beginPath(); ctx.ellipse(Math.round(x),Math.round(y)+1,13*SC/1.5,4.5*SC/1.5,0,0,P2); ctx.stroke(); }
      if(S.home&&S.home.time==='night'&&!LYING.has(st)){ ctx.fillStyle='rgba(20,8,30,.27)'; [[1,1],[-1,1],[1,-1],[-1,-1]].forEach(([dx,dy])=>{ ctx.beginPath(); ctx.ellipse(x+dx*8*SC,y+dy*1.4*SC,10*SC,1.9*SC,dx*dy*.18,0,P2); ctx.fill(); }); }   /* four lights, four shadows, in the dusk shadow's style */
      if(S.home&&S.home.time==='dusk'&&!S.home.rain&&!S.home.snow&&!LYING.has(st)){ ctx.fillStyle='rgba(30,10,40,.22)'; ctx.beginPath(); ctx.ellipse(x+10*SC,y+SC*.3,13*SC,2.2*SC,.18,0,P2); ctx.fill(); }   /* the low sun throws a long shadow */
      drawPlayer(ctx,p.side,p.num,x,y,face,st,fr,SC,lift,p.si);
      if(p.ri!=null&&p.side==='o'&&!LYING.has(st)){ const v=STA[p.ri]/100, w=Math.round(24*SC/1.5), h=Math.max(3,Math.round(3.2*SC/1.5)), bx=Math.round(x-w/2), by=Math.round(y+7.5*SC/1.5);
        ctx.fillStyle='rgba(8,9,11,.8)'; ctx.fillRect(bx-1,by-1,w+2,h+2); ctx.fillStyle=v>.6?'#4ade80':v>.3?'#F0CE26':'#D9325E'; ctx.fillRect(bx,by,Math.max(1,Math.round(w*v)),h); }
      /* the ball stays in his arms, wherever his body is: falling, down, on his back, laid out */
      if(S.ball.holder===p&&S.phase!=='pre'){ const d=face==='left'||face==='upL'?-1:1, side=face==='left'||face==='right', q=null;
        const bb=S.bobble&&S.bobble.r===p&&S.t-S.bobble.t0<.45?(S.t-S.bobble.t0)/.45:-1;
        if(S.pitchV&&p===S.carrier&&S.t-S.pitchV.t0<.32){ const k=(S.t-S.pitchV.t0)/.32, [qx,qy]=toS(S.pitchV.x,S.pitchV.y); drawBall(ctx,qx+(x-qx)*k,qy+(y-qy)*k,(62+Math.sin(k*Math.PI)*30)*u,SC,k*6,false); }
        else if(bb>=0) drawBall(ctx,x,y,60*u+Math.abs(Math.sin(bb*Math.PI*2))*18+lift,SC,bb*7,true);
        else if(CATCHING.has(st)&&(p===S.catcher||p===S.picker)){ const h=handPoint(st,fr,face,SC); drawBall(ctx,x+h[0],y,Math.max(2,-h[1]+lift),SC,0,true); }
        else if(q) drawBall(ctx,x+d*q[0]*u,y,Math.max(2,q[1]*u),SC,0,true);
        else if(LYING.has(st)){ const h=handPoint(st,fr,face,SC); drawBall(ctx,x+h[0],y,Math.max(2,-h[1]+lift),SC,0,true); }
        else if(p===S.QB&&!S.carrier) drawBall(ctx,x+9*u,y,70*u+lift,SC,-1.1,true);
        else drawBall(ctx,x+(side?d*10:-11)*u,y,56*u+lift,SC,side?-d*.45:-.9,true); } });
    if(S.home&&S.home.time==='night'){ const cw=ctx.canvas.width, chh=ctx.canvas.height, BASE=[92,100,132];
      if(!RAYCV||RAYCV.width!==cw||RAYCV.height!==chh){ RAYCV=document.createElement('canvas'); RAYCV.width=cw; RAYCV.height=chh; }
      const rx=RAYCV.getContext('2d'), mix=v=>'rgb('+BASE.map(c=>Math.round(c+(255-c)*v)).join(',')+')';
      rx.setTransform(1,0,0,1,0,0); rx.globalCompositeOperation='source-over'; rx.fillStyle=mix(0); rx.fillRect(0,0,cw,chh); rx.setTransform(cw/W,0,0,chh/H,0,0); rx.globalCompositeOperation='lighten';
      const ya=toY(0,H).y, yb=toY(0,0).y, LAY=[[25,.3],[21,.5],[17,.68],[13,.84],[9,1]];
      for(let ab=-40;ab<=140;ab+=20){ [[-1,0],[1,0]].forEach(([sd,off])=>{ const yy=ab+off-S.yd; if(yy<ya-30||yy>yb+30) return; const sx=FC+sd*(SIDE+5), ex=FC-sd*14, [x0]=toS(sx,yy), [x1]=toS(ex,yy), edge=5/(SIDE+19);
          LAY.forEach(([hh,v])=>{ const [,t1]=toS(ex,yy+hh), [,b1]=toS(ex,yy-hh), [,t0]=toS(sx,yy+hh*.16), [,b0]=toS(sx,yy-hh*.16);
            const g=rx.createLinearGradient(x0,0,x1,0); g.addColorStop(0,mix(0)); g.addColorStop(edge,mix(v)); g.addColorStop(.6,mix(v*.8)); g.addColorStop(1,mix(0));
            rx.fillStyle=g; rx.beginPath(); rx.moveTo(x0,t0); rx.lineTo(x1,t1); rx.lineTo(x1,b1); rx.lineTo(x0,b0); rx.closePath(); rx.fill(); }); }); }
      ctx.save(); ctx.setTransform(1,0,0,1,0,0); ctx.globalCompositeOperation='multiply'; ctx.drawImage(RAYCV,0,0); ctx.restore(); }
    const air=S.ball.air; if(air){ const f=clamp((S.t-air.t0)/air.dur,0,1), A=clamp((air.arc||2)*K*.85,6,140), x=air.from.x+(air.to.x-air.from.x)*f, y=air.from.y+(air.to.y-air.from.y)*f, [bx,by]=toS(x,y), [fx,fy]=toS(air.from.x,air.from.y), [tx,ty]=toS(air.to.x,air.to.y);
      const [ax,ay]=toS(air.aim.x,air.aim.y); ctx.strokeStyle='rgba(76,158,255,.85)'; ctx.lineWidth=1.5; ctx.beginPath(); ctx.arc(ax,ay,6,0,P2); ctx.stroke();
      const lift=Math.sin(f*Math.PI)*A+u*(72-40*f), dl=Math.PI*Math.cos(f*Math.PI)*A-40*u;
      if((air.power||0)>.6&&f>0){ for(let k=1;k<=4;k++){ const g=Math.max(0,f-k*.035), gx=air.from.x+(air.to.x-air.from.x)*g, gy=air.from.y+(air.to.y-air.from.y)*g, [sx,sy]=toS(gx,gy);
        ctx.globalAlpha=.42-k*.09; drawBall(ctx,sx,sy,Math.sin(g*Math.PI)*A+u*(72-40*g),SC,Math.atan2((ty-fy)-dl,tx-fx),true); } ctx.globalAlpha=1; }
      drawBall(ctx,bx,by,lift,SC,Math.atan2((ty-fy)-dl,tx-fx)); }
    if(S.parts&&S.parts.length){ for(const p of S.parts){ const [x,y]=toS(p.x,p.y); ctx.globalAlpha=Math.max(0,1-p.age/p.life); ctx.fillStyle=p.col; ctx.fillRect(Math.round(x-p.s/2),Math.round(y-p.z*K*.6-p.s/2),p.s,p.s); } ctx.globalAlpha=1; }
    if(S.landed&&S.phase==='done'&&!S.loose){ const [x,y]=toS(S.landed.x,S.landed.y); drawBall(ctx,x,y,2,SC,.35); }
    if(S.loose&&S.t>=S.loose.t0){ const L=S.loose, k=clamp((S.t-L.t0)/.7,0,1), [bx,by]=toS(L.x0+(L.to.x-L.x0)*k,L.y0+(L.to.y-L.y0)*k); drawBall(ctx,bx,by,2+Math.abs(Math.sin(k*Math.PI*2.5))*(1-k)*24,SC,k*9); }
    /* THE CALLOUTS, a stack: the first one sits just over the play, each one after it goes on top of the stack, and no
       two ever cover each other */
    ctx.font='600 10px JetBrains Mono'; ctx.textAlign='center'; ctx.textBaseline='middle';
    { const live=S.pops.filter(q=>q.p&&S.t-q.t0<=1.4).sort((a,b)=>a.t0-b.t0), put=[], BH=22, GAP=4;
      for(const q of live){ const age=S.t-q.t0, txt=q.text.toUpperCase(), w=ctx.measureText(txt).width+16, [px,py]=toS(q.p.x,q.p.y), x=clamp(px,w/2+4,W-w/2-4);
        let yy=py-88*SC/1.5-Math.min(age,.4)*30; while(put.some(b=>Math.abs(b.x-x)<(b.w+w)/2+4&&Math.abs(b.y-yy)<BH+GAP)) yy-=BH+GAP; yy=Math.max(BH,yy); put.push({x,y:yy,w});
        ctx.globalAlpha=age>1.1?1-(age-1.1)/.3:1; ctx.fillStyle='rgba(23,23,23,.94)'; ctx.fillRect(Math.round(x-w/2),Math.round(yy-11),Math.round(w),22); ctx.fillStyle=q.col; ctx.fillRect(Math.round(x-w/2),Math.round(yy-11),Math.round(w),2);
        ctx.fillStyle='#FDFEFC'; ctx.fillText(txt,Math.round(x),Math.round(yy+1)); ctx.globalAlpha=1; } }
    ctx.textBaseline='alphabetic';
    /* slow motion shows as a letterbox */
    if(S.hold||S.t<(S.slow||0)){ ctx.fillStyle='rgba(6,6,6,.88)'; ctx.fillRect(0,0,W,12); ctx.fillRect(0,H-12,W,12); }
    /* the flight it will take, thrown now: the same arc the ball flies, high and soft at first, flattening as you hold
       toward a zip. Dots for the ball, a faint line on the grass under it. */
    if(S.hold&&S.ball.holder===S.QB){ const k=clamp((performance.now()-S.hold.t0)/750,0,1), [ex,ey]=holdAim(S.hold,k), at=toY(ex,ey), QB=S.QB, d=Math.hypot(at.x-QB.x,at.y-QB.y),
        Aa=clamp(Math.max(.8,d*(.34-.28*k))*K*.85,6,140), col=k<.34?'76,158,255':k<.67?'240,206,38':'255,142,28', n=Math.max(12,Math.round(d*1.6));
      ctx.save(); ctx.strokeStyle='rgba(253,254,252,.16)'; ctx.lineWidth=1.5; ctx.setLineDash([3,4]); ctx.beginPath(); const [qx,qy]=toS(QB.x,QB.y); ctx.moveTo(qx,qy); ctx.lineTo(ex,ey); ctx.stroke(); ctx.setLineDash([]);
      for(let i=1;i<n;i++){ const f=i/n, [gx,gy]=toS(QB.x+(at.x-QB.x)*f,QB.y+(at.y-QB.y)*f), h=Math.sin(f*Math.PI)*Aa+u*(72-40*f), r=1.4+Math.sin(f*Math.PI)*.9;
        ctx.fillStyle='rgba('+col+','+(.9-f*.35).toFixed(2)+')'; ctx.beginPath(); ctx.arc(gx,gy-h,r,0,P2); ctx.fill(); }
      ctx.restore(); }
    /* the press: a ring where the ball is going, filling as you hold, from LOB to ZIP */
    if(S.hold){ const k=clamp((performance.now()-S.hold.t0)/750,0,1), x=S.hold.px, y=S.hold.py, col=k<.5?'#4C9EFF':'#FF8E1C';
      ctx.strokeStyle='rgba(253,254,252,.35)'; ctx.lineWidth=2; ctx.beginPath(); ctx.arc(x,y,13,0,P2); ctx.stroke();
      ctx.strokeStyle=col; ctx.lineWidth=3; ctx.beginPath(); ctx.arc(x,y,13,-Math.PI/2,-Math.PI/2+P2*Math.max(.02,k)); ctx.stroke();
      ctx.font='600 9px JetBrains Mono'; ctx.textAlign='center'; ctx.fillStyle='#FDFEFC'; ctx.fillText(k<.34?'LOB':k<.67?'TOUCH':'ZIP',x,y+28); }
    if(S.home&&S.home.rain){ const n=performance.now()/1000; ctx.strokeStyle='rgba(205,220,240,.38)'; ctx.lineWidth=1; ctx.beginPath();
      for(let i=0;i<170;i++){ const a=hashU(i,7), b=hashU(i,13), x=((a*W-n*70)%W+W)%W, y=((b*H+n*(520+a*160))%H+H)%H, L=9+a*7; ctx.moveTo(Math.round(x),Math.round(y)); ctx.lineTo(Math.round(x-L*.28),Math.round(y+L)); } ctx.stroke(); }
    if(S.home&&S.home.snow){ const n=performance.now()/1000; ctx.fillStyle='rgba(255,255,255,.85)'; for(let i=0;i<140;i++){ const a=hashU(i,7), b=hashU(i,13), x=((a*W+Math.sin(n*.8+i)*14)%W+W)%W, y=((b*H+n*(28+a*30))%H+H)%H, z=a>.7?3:2; ctx.fillRect(Math.round(x),Math.round(y),z,z); } }
    /* a cut shows as a pair of chevrons on the side he went */
    if(S.cut&&S.carrier&&S.t<S.cut.t0+.4){ const [x,y]=toS(S.carrier.x,S.carrier.y), a=Math.max(0,1-(S.t-S.cut.t0)/.4), d=S.cut.dir; ctx.strokeStyle='rgba(76,158,255,'+a.toFixed(2)+')'; ctx.lineWidth=2.5;
      [0,8].forEach(o=>{ const bx=x+d*(26+o); ctx.beginPath(); ctx.moveTo(bx-d*5,y-38); ctx.lineTo(bx,y-32); ctx.lineTo(bx-d*5,y-26); ctx.stroke(); }); }
  }
  let last=0;
  /* THE CAMERA PULLS BACK while you're choosing a throw (and before the snap), far enough to keep every receiver and the
     end of his route in view, out to the sideline; once somebody's running with it, it comes back in to 30 yards across.
     The men are drawn smaller as it pulls back, so the picture is the same field, just more of it. */
  function frame(rdt){ let tgt=30; const QB=S.QB, choosing=S.phase==='pre'||S.phase==='regroup'||S.phase==='motion'||(S.phase==='live'&&!S.runCall&&!S.carrier&&(S.ball.holder===QB||S.ball.air));
    if(choosing&&S.rec){ let span=0; S.rec.forEach(p=>{ span=Math.max(span,Math.abs(p.x-S.cam.x)); if(p.route&&S.phase!=='live') p.route.forEach(([rx])=>span=Math.max(span,Math.abs(p.x+rx-S.cam.x))); else if(p.route) span=Math.max(span,Math.abs(routeAt(p,S.t+.6).x-S.cam.x)); }); tgt=clamp(2*(span+4),30,48); }
    VIEW+=(tgt-VIEW)*Math.min(1,rdt*(tgt>VIEW?3:1.6)); if(W){ K=W/VIEW; SC=36/VIEW; } }
  function loop(now){ const rdt=Math.min(.04,(now-last)/1000)||0; last=now; if(S.on&&S.P&&S.P.length) frame(rdt);
    try{ if(S.on){ const slow=S.t<(S.slow||0), dt=rdt*(S.hold?.45:1)*(slow?.4:1), M=MATCH;
      if(S.phase==='live'){ update(S.seq?dt*.8:dt); if(S.fx) runFx(dt); if(M&&M.liveTick) M.liveTick(dt); }
      else if(S.phase==='regroup'){ runRegroup(rdt); if(M&&M.preTick) M.preTick(rdt); }
      else if(S.phase==='motion') runMotion(rdt);
      else if(S.phase==='pre'){ if(M&&M.preTick) M.preTick(rdt); }
      else if(S.phase==='done'&&S.t<99){ S.t+=dt; if(S.fx) runFx(dt); if(S.ps) runPs(); if(M&&M.preTick) M.preTick(rdt);
      S.P.forEach(p=>{ if(p.fxd) return; if(p.state==='dive'&&S.t>p.until){ p.state='down'; } if(HOLD.has(p.state)&&p.state!=='dive'&&S.t>p.until) p.state='stance'; p.vx*=.85; p.vy*=.85; p.x+=p.vx*dt; p.y+=p.vy*dt; }); } stepParts(dt); draw(); }
    }catch(e){ console.error(e); }
    requestAnimationFrame(loop); }
  function buttons(){
    const pre=S.phase==='pre', live=S.phase==='live'||S.phase==='motion', done=S.phase==='done', qbHas=live&&S.ball.holder===S.QB&&!S.runCall, choose=pre||S.phase==='regroup';
    /* Run or Pass, then that side's four for this down */
    const subs=typeof subsAvail==='function'&&subsAvail();
    $('#calls').innerHTML=`<div class="kind${subs?' k3':''}">${['run','pass'].map(k=>`<button data-kind="${k}" class="k-${k}${S.kind===k?' on':''}" ${choose?'':'disabled'}>${k}</button>`).join('')}${subs?`<button class="k-subs" id="k-subs" ${choose?'':'disabled'}>Subs</button>`:''}</div>`+
      `<div class="four4">${S.hand[S.kind].map(k=>`<button data-k="${k}" class="${S.call===k?'on':''}" ${choose?'':'disabled'}>${playSVG(k)}${PLAYS[k].name}</button>`).join('')}</div>`;
    const ks=$('#k-subs'); if(ks) ks.onclick=()=>{ if(typeof openSubs==='function') openSubs(); };
    document.querySelectorAll('#calls .kind button[data-kind]').forEach(b=>b.addEventListener('click',()=>{ if(S.kind===b.dataset.kind) return; S.kind=b.dataset.kind; S.call=S.hand[S.kind][0]; reset(true); }));
    document.querySelectorAll('#calls .four4 button').forEach(b=>b.addEventListener('click',()=>{ S.call=b.dataset.k; reset(true); }));
    if(pre&&S.fourth){ const fgd=S.goal+17, fg=fgd<=57;
      $('#acts').innerHTML=`<button id="punt">Punt</button><button class="go" id="goforit">Go for it</button><button id="fg" ${fg?'':'disabled'}>FG · ${fgd} yds<small>${Math.round(fgOdds(fgd)*100)}%</small></button>`;
      $('#goforit').onclick=()=>{ S.fourth=false; buttons(); }; $('#punt').onclick=()=>MATCH.punt(); $('#fg').onclick=()=>fg&&MATCH.kick(fgd);
      return; }
    const C=MATCH&&MATCH.clockUI?MATCH.clockUI():{run:false,tos:0,canSpike:false}, setting=pre||S.phase==='regroup';
    if(setting){ const fgd=S.goal+17, fgOk=fgd<=57&&MATCH&&MATCH.kick&&!(MATCH.M&&MATCH.M.conv);
      $('#acts').className='acts';
      $('#acts').innerHTML=`<div class="grp"><button id="spk" ${C.canSpike&&pre?'':'disabled'}>Spike</button>${fgOk?`<button id="fgk" ${pre?'':'disabled'}>FG ${fgd}<small>${Math.round(fgOdds(fgd)*100)}%</small></button>`:''}</div><button class="go" id="hike" ${pre?'':'disabled'}>Hike</button><button id="tmo" ${C.run&&C.tos>0?'':'disabled'}>Timeout ${'●'.repeat(C.tos)}${'○'.repeat(Math.max(0,3-C.tos))}</button>`;
      $('#hike').onclick=hike; $('#spk').onclick=()=>MATCH.spike(); $('#tmo').onclick=()=>MATCH.timeout(); const fk=$('#fgk'); if(fk) fk.onclick=()=>{ if(S.phase==='pre') MATCH.kick(fgd); }; return; }
    $('#acts').className='acts';
    $('#acts').innerHTML=`<button id="scr" ${qbHas?'':'disabled'}>Scramble</button><button class="go" id="hike" ${live?'disabled':''}>${done?'Next':'Hike'}</button><button id="away" ${qbHas?'':'disabled'}>Throw away</button>`;
    $('#hike').onclick=hike;
    $('#away').onclick=()=>{ if(S.phase==='live'&&S.ball.holder===S.QB) end('Thrown away','Out of bounds. Next down.','inc',0); };
    $('#scr').onclick=()=>{ if(S.phase==='live'&&S.ball.holder===S.QB&&!S.runCall){ S.carrier=S.QB; S.scram=true; S.QB.vmax*=1.05; S.QB.acc=400; { const Q=S.QB, h=Math.hypot(Q.vx,Q.vy)||0; Q.vx=h>.3?Q.vx/h*Q.vmax:0; Q.vy=h>.3?Q.vy/h*Q.vmax:Q.vmax; } hint('Tap left or right of him to cut'); buttons(); } };
  }
  /* match each man from the last play to his place in the next one, by side and position */
  function carry(old,shift,dx){ const groups={}, used={}; old.forEach(o=>{ const k=o.side+o.pos; (groups[k]=groups[k]||[]).push(o); });
    S.P.forEach(p=>{ const k=p.side+p.pos, i=used[k]||0; used[k]=i+1; const o=(groups[k]||[])[i]; if(!o) return;
      p.x=clamp(o.x+(dx||0),FC-SIDE+1,FC+SIDE-1); p.y=clamp(o.y+shift,p.y0-14,p.y0+14); p.state='run'; }); }
  function regroup(yd,down,togo){ const old=S.P.map(p=>({side:p.side,pos:p.pos,x:p.x,y:p.y})), shift=S.yd-yd, FC0=FC;
    sitOnly(yd,down,togo); carry(old,shift,FC-FC0); S.phase='regroup'; S.rgT=0; buttons(); hint('Getting set'); }
  function runRegroup(dt){ S.rgT+=dt; let moving=0;
    S.P.forEach(p=>{ const dx=p.x0-p.x, dy=p.y0-p.y, d=Math.hypot(dx,dy);
      if(d>.15){ moving++; const sp=Math.min(d/dt,p.side==='o'?5:4.4); p.x+=dx/d*sp*dt; p.y+=dy/d*sp*dt; p.vx=dx/d*sp; p.vy=dy/d*sp;
        p.facing=Math.abs(dx)>Math.abs(dy)*1.15?(dx>0?'right':'left'):(dy>0?'up':'down'); p.state='run'; p.ph+=sp*dt*1.5; }
      else { p.x=p.x0; p.y=p.y0; p.vx=p.vy=0; p.state=p.home; p.facing=p.side==='o'?'up':'down'; } });
    if(!moving||S.rgT>5){ S.P.forEach(p=>{ p.x=p.x0; p.y=p.y0; p.state=p.home; p.facing=p.side==='o'?'up':'down'; }); S.phase='pre'; buttons(); hint(preHint()); } }
  const preHint=()=>S.fourth?'Fourth down':S.jet?'Hike: motion, then tap beside him to cut':S.runCall?'Hike, then tap beside the back to cut':'Hike, then tap to lob it, hold to zip it';
  function callCoverage(){ const w={cover3:.3,man:.2,cover4:.14,cover2:.14,c2man:.08,blitz:.09,cover0:.05}, add=(o)=>Object.entries(o).forEach(([k,v])=>w[k]=Math.max(.02,w[k]+v));
    const short=S.togo<=2, goal=S.goal<=3, red=S.goal<=12, third=S.down>=3;
    if(short||goal) add({man:.2,cover0:goal?.18:.1,blitz:.14,cover3:.05,cover4:-.1,cover2:-.1,c2man:-.05});
    else if(third&&S.togo>=7) add({cover3:.08,cover2:.06,cover4:.1,cover0:.06,blitz:.05,man:-.08});
    else if(third&&S.togo>=4) add({cover2:.12,c2man:.06,blitz:.04});
    if(red&&!goal) add({man:.1,cover0:.04,cover4:-.06});
    const U=units(), cb=(erR(U.CB[0].s.cov)+erR(U.CB[1].s.cov))/2, wa=who(2), wb=who(3), wr=(((wa&&wa.r)||82)+((wb&&wb.r)||82))/2, m=clamp(1+(cb-wr)/20,.35,1.7);
    ['man','blitz','cover0','c2man'].forEach(k=>w[k]*=m);
    let x=Math.random()*Object.values(w).reduce((a,b)=>a+b,0); for(const [k,v] of Object.entries(w)){ if((x-=v)<=0) return k; } return 'cover3'; }
  function reset(keepLook){
    const rg=S.phase==='regroup', keep=rg?S.P.map(p=>({side:p.side,pos:p.pos,x:p.x,y:p.y})):null;
    if(!keepLook) S.look=callCoverage();
    S.phase='pre'; S.landed=null; S.caught=false; S.result=null; setup(); S.P.forEach(p=>{ p.x0=p.x; p.y0=p.y; p.home=p.state; });
    if(rg){ carry(keep,0); S.phase='regroup'; }
    $('#res').className='result'; hint(rg?'Getting set':preHint()); buttons();
  }
  function hike(){ if(document.querySelector('.subs.show')) return; if(S.phase==='done') return MATCH.next(); if(S.phase!=='pre') return;
    if(S.jet||S.mot){ S.phase='motion'; S.mt=0; buttons(); hint('Motion'); return; }
    snap(); }
  function snap(){ S.t=0; S.phase='live'; buttons(); hint(S.runCall?'':'Tap to lob it · hold to zip it'); }
  const JET_T=1.15;
  /* a man in motion on a pass: across (or out) to his spot, picking up speed, and snapped as he gets there so he's already
     going when his route starts from that spot; whoever has him in man runs with him */
  function runMot(dt){ S.mt+=dt; const M=S.mot, p=M.p, k=Math.min(1,S.mt/M.T), f=.5*k+.5*k*k, px=p.x, py=p.y;
    p.x=p.x0+(M.to[0]-p.x0)*f; p.y=p.y0+(M.to[1]-p.y0)*f; p.vx=(p.x-px)/Math.max(dt,1e-3); p.vy=(p.y-py)/Math.max(dt,1e-3); p.state='run';
    p.facing=Math.abs(p.vx)>Math.abs(p.vy)?(p.vx>0?'right':'left'):(p.vy>0?'up':'down'); p.ph+=Math.hypot(p.vx,p.vy)*dt*1.5;
    const C=S.P.find(d=>d.man===p); if(C){ C.x+=(p.x-C.x)*Math.min(1,dt*4); C.state='run'; C.ph+=dt*6; }
    if(k>=1){ const sp=Math.hypot(M.to[0]-p.x0,M.to[1]-p.y0)*1.5/M.T, ux=(M.to[0]-p.x0), uy=(M.to[1]-p.y0), ul=Math.hypot(ux,uy)||1;
      p.vx=ux/ul*Math.min(p.vmax,sp); p.vy=uy/ul*Math.min(p.vmax,sp); p.x0=p.x; p.y0=p.y; if(C) C.state='stance'; snap(); } }
  function runMotion(dt){ if(S.mot&&!S.jet) return runMot(dt); S.mt+=dt; const J=S.jet, dir=PLAYS[S.call].dir, k=Math.min(1,S.mt/JET_T), x0=J.x0, x1=dir*JET_SNAP, f=.45*k+.55*k*k;
    const px=J.x; J.x=x0+(x1-x0)*f; J.y=J.y0+(JET_Y-J.y0)*Math.min(1,k*2.2); J.vx=(J.x-px)/Math.max(dt,1e-3); J.vy=0; J.state='run'; J.facing=dir>0?'right':'left'; J.ph+=Math.abs(J.vx)*dt*1.5;
    const C=S.CB.find(c=>c.man===J); if(C){ C.x+=(J.x-C.x)*Math.min(1,dt*4); C.state='run'; C.facing=dir>0?'right':'left'; C.ph+=dt*6; }
    if(k>=1){ J.vx=dir*Math.min(J.vmax,(x1-x0)*dir*(.45+1.1)/JET_T); if(C) C.state='stance'; snap(); } }
  /* THE THROW IS A PRESS. Put a finger where the ball should go: let go at once and it's lobbed, high and soft, over
     whoever is underneath; hold it and it gets flatter and faster, up to a bullet at a second and a half. */
  const fw=$('#fw'); fw.addEventListener('contextmenu',e=>e.preventDefault());
  fw.addEventListener('pointerdown',e=>{ if(!S.on) return; const r=cv.getBoundingClientRect(), px=e.clientX-r.left, py=e.clientY-r.top;
    if(S.phase!=='live') return;
    if(S.ball.holder===S.QB&&!S.runCall&&S.carrier!==S.QB){ S.hold={px,py,t0:performance.now()}; try{ fw.setPointerCapture(e.pointerId); }catch(_){} return; }
    if(S.carrier&&!S.carrier.down&&S.carrier.state!=='leap'&&!S.seq&&!S.ps){ const c=S.carrier, [cx]=toS(c.x,c.y), dir=px<cx?-1:1, el=c.pos==='RB'?A(c,1):c.pos==='WR'?.2+A(c,1)*.6:.4;
      /* a beat between cuts, a little shorter the more elusive he is: no spamming them */
      if(S.cut&&S.t<S.cut.t0+.95-el*.3) return;
      /* the plant: he is already going sideways, at nearly full speed, the moment you tap */
      if(S.home&&(S.home.rain||S.home.snow)&&Math.random()<.085){ S.cut={dir,until:S.t+.24,t0:S.t}; c.path=null; slip(c,true); return; }
      S.cut={dir,until:S.t+.24,t0:S.t}; c.path=null; c.juke=S.t+.34; c.plantUntil=S.t+.1; c.plantDir=dir; const sp=c.vmax*(.9+el*.35); c.vx=dir*sp*.88; c.vy=Math.max(.5,c.vy*.3); dust(c,7,-dir*2.5); } });
  fw.addEventListener('pointermove',e=>{ if(!S.hold) return; const r=cv.getBoundingClientRect(); S.hold.px=e.clientX-r.left; S.hold.py=e.clientY-r.top; });
  /* let go inside a receiver's lead ring and the ball is thrown to the middle of it; accuracy still decides where it lands */
  function holdAim(h,pw){ const at=toY(h.px,h.py); let px=h.px, py=h.py, best=1e9;
    S.rec.forEach(r=>{ if(!r.route||r.down) return; const q=leadOf(r,pw), d=Math.hypot(q.x-at.x,(q.y-at.y)*1.4); if(d<catchR(r)+.35&&d<best){ best=d; [px,py]=toS(q.x,q.y); } });
    return [px,py]; }
  fw.addEventListener('pointerup',()=>{ const h=S.hold; S.hold=null; if(!h||S.phase!=='live'||S.ball.holder!==S.QB) return; const pw=clamp((performance.now()-h.t0)/750,0,1);
    const [px,py]=holdAim(h,pw); throwTo(px,py,pw); });
  fw.addEventListener('pointercancel',()=>{ S.hold=null; });
  function sitOnly(yd,down,togo){ if(S.nextBF!=null){ BF=S.nextBF; S.nextBF=null; } FC=-BF; S.phase='pre'; S.yd=yd; S.down=down; S.togo=togo; S.goal=100-yd; S.fourth=down===4; S.hand={pass:deal('pass'),run:deal('run')}; S.call=S.hand[S.kind][0]; reset(); }
  addEventListener('resize',()=>size());
  /* and whenever its box changes (the play buttons coming in, the app giving the game the whole screen), so the field is never drawn squashed */
  if(window.ResizeObserver) new ResizeObserver(()=>{ if(S.on) size(); }).observe(cv);
  requestAnimationFrame(t=>{ last=t; requestAnimationFrame(loop); });
  return { men(d){ return menOf(d); }, dlab:DLAB, _slip(p,c){ slip(p,!!c); }, roster(g){ roster=g.slice(0,5); STA=roster.map(p=>p&&p.sta!=null?p.sta:100); }, sub(i,p){ if(roster) roster[i]=p; STA[i]=p&&p.sta!=null?p.sta:100; }, stamina(){ return STA.slice(); }, ballX(){ return BF; }, setD(d){ D=d; }, setHome(h){ S.home=h; if(h&&h.logo){ const im=new Image(); im.src=h.logo; h.img=im; } }, sit(yd,down,togo,bf){ if(bf!=null){ BF=bf; S.nextBF=null; } sitOnly(yd,down,togo); }, regroup, refresh(){ buttons(); },
    show(on){ S.on=on; if(on) size(); }, S, throwTo, toS, hike, reset, update, size };
}
