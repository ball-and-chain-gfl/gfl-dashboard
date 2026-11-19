/* ═══ PLAYERS, IN PIXELS ═══
   Each sprite is posed as a skeleton (hips, knees, ankles, shoulders, elbows, hands), painted with three tones per part
   lit from the upper left, drawn small onto a 64 x 64 canvas, then snapped to pixels: every pixel is either empty or
   exactly one colour of the kit, and a dark line runs round the outside. Long legs, broad pads, a narrow waist and a
   small helmet; about 50px tall at 1x. Units below are hundredths of his height, feet on 0. */
const P2=Math.PI*2;
const KIT={
  /* yours: sky with white trim. Theirs: dark pewter with red, after the reference */
  o:{jersey:['#1c5cae','#3f8fea','#8cc2ff'],pants:['#b8c0ca','#e4e9ef','#ffffff'],helmet:['#1c5cae','#3f8fea','#a9d2ff'],stripe:'#ffffff',acc:'#ffffff',pstripe:'#3f8fea',
     sock:['#1c5cae','#3f8fea','#3f8fea'],band:'#f4f6f8',glove:['#c8ced6','#ffffff'],mask:'#c9ced5',num:'#ffffff'},
  d:{jersey:['#24262c','#3d4049','#646874'],pants:['#24262c','#3d4049','#5a5e69'],helmet:['#24262c','#454955','#8e94a2'],stripe:'#c8233e',acc:'#c8233e',pstripe:'#c8233e',
     sock:['#24262c','#3d4049','#3d4049'],band:'#e9ebee',glove:['#8f1428','#c8233e'],mask:'#b9bec6',num:'#ffffff'},
};
/* ═══ TEAM KITS ═══ Every team dresses from the two colours in its logo. At home the jersey is its main colour; away it's
   white with the main colour on the helmet, pants, socks and trim. A jersey too pale to show the main colour, or too close
   to the other side's, swaps for the team's other look. */
const hx=c=>{ c=c.replace('#',''); if(c.length===3) c=[...c].map(x=>x+x).join(''); return [0,2,4].map(i=>parseInt(c.slice(i,i+2),16)); };
const toHex=a=>'#'+a.map(v=>Math.round(Math.max(0,Math.min(255,v))).toString(16).padStart(2,'0')).join('');
const mixC=(c,d,t)=>{ const a=hx(c), b=hx(d); return toHex(a.map((v,i)=>v+(b[i]-v)*t)); };
const lumC=c=>{ const [r,g,b]=hx(c); return (.299*r+.587*g+.114*b)/255; };
const distC=(c,d)=>{ const a=hx(c), b=hx(d); return Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]); };
const tri=c=>[mixC(c,'#000000',.42),c,mixC(c,'#ffffff',.42)];
const WHITE='#e8ebef';
/* a team's two looks from its main colour p and second colour q */
function kitFor(p,q,away){ const pale=lumC(p)>.72, q2=distC(p,q)<70?(lumC(p)>.5?'#111318':WHITE):q;
  if(!away&&!pale) return {look:'home',jersey:tri(p),pants:tri(lumC(q2)>.55?q2:WHITE),helmet:tri(p),stripe:q2,acc:q2,pstripe:p,sock:tri(p),band:'#f4f6f8',glove:[mixC(q2,'#000000',.3),q2],mask:'#c9ced5',num:'#ffffff'};
  const tr=pale?(lumC(q2)<.6?q2:'#1b1d22'):p;
  return {look:'away',jersey:tri(WHITE),pants:tri(tr),helmet:tri(tr),stripe:tr,acc:tr,pstripe:WHITE,sock:tri(tr),band:'#f4f6f8',glove:[mixC(tr,'#000000',.3),tr],mask:'#c9ced5',num:tr}; }
/* dress both sides for a game: the home team in its home look, the visitors away, unless the two jerseys would read alike */
function dressFor(home,away){ let h=kitFor(home[0],home[1],false), a=kitFor(away[0],away[1],true);
  if(distC(h.jersey[1],a.jersey[1])<110){ const alt=kitFor(away[0],away[1],false); if(distC(h.jersey[1],alt.jersey[1])>=110) a=alt; else h=kitFor(home[0],home[1],true), a=kitFor(away[0],away[1],false); }
  return [h,a]; }
/* put the kits on: o is your side, d is theirs; every drawn body is redrawn in the new colours */
function setKits(o,d){ KIT.o=o; KIT.d=d; SPR.clear(); KFS.clear(); }
const SKIN=[['#4a2c1b','#7a4b30','#a06a47'],['#33200f','#5a3824','#7b5035'],['#8a5a3c','#bd8864','#dcab85'],['#26160d','#43291b','#61402b']];
const SHOE=['#0f0f12','#3a3a42'], OUTC='#140e12';
const LX=-.6, LY=-.8;

/* a side-view body from its angles: lean of the body, each leg's thigh and shin, each arm and forearm (from straight
   down, forward is plus); fix stands him on the ground */
function buildSide(lean,la,aa,fix){
  const V=(o,a,l)=>[o[0]+l*Math.sin(a),o[1]+l*Math.cos(a)];
  const L=(h,t,c)=>{ const k=V(h,t,25), a=V(k,c,24); return [h,k,a,[a[0]+7*Math.cos(c),a[1]-7*Math.sin(c)]]; };
  let legs=la.map(([t,c])=>L([0,-50],t,c)), dy=0;
  if(fix){ const low=Math.max(...legs.flatMap(l=>[l[2][1],l[3][1]])); dy=(-1.5-low)*fix; }
  const H=[0,-50+dy]; legs=la.map(([t,c])=>L(H,t,c));
  const up=[Math.sin(lean),-Math.cos(lean)], fw=[Math.cos(lean),Math.sin(lean)];
  const T=(a,b)=>[H[0]+fw[0]*a+up[0]*b, H[1]+fw[1]*a+up[1]*b], S=T(.5,30);
  const arms=aa.map(([u,fa])=>{ const e=V(S,u,17); return [S,e,V(e,fa,16)]; });
  return {view:'side',legs,arms,torso:[T(-5.5,-1),T(6,-1),T(10,17),T(12.5,27),T(8,35),T(-8,35.5),T(-11,28),T(-7.5,14)],
    pants:[T(-5.8,4),T(5.8,4),T(6.4,-7),T(-6.4,-7)],neck:[T(.5,31),T(1.6,38)],head:T(2.2,42.5),top:[5,4]}; }
function pose(view,state,ph,f){
  const fr=Math.floor(f||0)%2, run=state==='run'||state==='catch', cs=Math.min(2,Math.floor((f||0)/RUNF)), st4=Math.floor(f||0);
  if(view==='side'){
    const V=(o,a,l)=>[o[0]+l*Math.sin(a),o[1]+l*Math.cos(a)];
    const L=(h,t,c)=>{ const k=V(h,t,25), a=V(k,c,24); return [h,k,a,[a[0]+7*Math.cos(c),a[1]-7*Math.sin(c)]]; };
    let lean=.24, la, aa, fix=1;
    if(run||state==='dive'){
      const Lg=o=>{ const p=ph+o, t=.8*Math.sin(p); return [t,t-.18-1.15*Math.pow(Math.max(0,Math.cos(p-.15)),1.5)]; };
      const Ar=o=>{ const u=-.95*Math.sin(ph+o); return [u,u+1.5]; };
      la=[Lg(0),Lg(Math.PI)]; aa=[Ar(0),Ar(Math.PI)]; fix=.7;
      if(state==='catch') aa=[[[2.75,2.95],[2.55,2.85]],[[2.2,3.4],[2.05,3.3]],[[.7,2.5],[.5,2.3]]][cs];
      if(state==='dive'){ la=st4===0?[[.5,-.9],[-.6,-.5]]:[[-.25,-.45],[-.55,-.8]]; aa=st4===0?[[1.9,1.8],[1.7,1.7]]:[[2.4,2.25],[2.25,2.15]]; lean=st4===0?.5:.2; fix=0; } }
    else if(state==='down'){ lean=0; la=[[.04,0],[-.08,-.12]]; aa=[[2.95,3.05],[2.6,2.8]]; fix=0; }
    else if(state==='block'){ lean=.72; la=[[.55,-.5],[-.3,-.6]]; const j=fr*.1; aa=[[1.35+j,1.5+j],[1.25-j,1.45-j]]; }
    else if(state==='throw'){ const f4=Math.floor(f||0)%4; lean=[.05,-.08,.18,.32][f4]; la=f4>=2?[[.55,-.12],[-.45,-.55]]:[[.25,-.1],[-.3,-.4]];
      aa=[[[1.2,2.4],[1.0,2.2]],[[3.75,3.3],[1.6,2.4]],[[2.2,2.0],[.9,1.4]],[[.7,1.3],[.3,.9]]][f4]; }
    else if(state==='catchLow'){ lean=.3; la=[[.35,-.4],[-.2,-.5]]; aa=[[1.25,1.75],[1.15,1.7]]; }
    else if(state==='reach'){ lean=.45; la=[[.6,-.3],[-.5,-.6]]; aa=[[2.2,2.3],[2.0,2.2]]; }
    else if(state==='leap'){ const k=Math.min(3,st4); lean=[.35,.05,.1,.25][k]; la=[[[.95,-.9],[.75,-1.1]],[[.15,-.1],[-.1,-.25]],[[.9,-.6],[.5,-1.1]],[[.8,-.7],[.55,-.9]]][k];
      aa=[[[.3,.6],[.2,.5]],[[2.6,2.8],[2.4,2.7]],[[2.95,3.1],[2.8,3.0]],[[1.6,1.9],[1.4,1.7]]][k]; fix=k===2?0:1; }
    else if(state==='wrap'){ lean=.95; la=fr?[[.45,-.55],[-.15,-.45]]:[[.8,-.3],[-.45,-.75]]; aa=[[1.55,2.7],[1.45,2.6]]; }
    else if(state==='plant'){ lean=.15; la=[[.75,-.35],[-.65,-.3]]; aa=[[1.9,1.6],[1.0,1.8]]; }                 /* the jump cut's plant */
    else if(state==='kneel'){ lean=.25; la=[[1.5,0],[.25,-1.55]]; aa=[[.9,.6],[.4,.3]]; }                        /* getting up */
    else if(state==='stumble'){ lean=.35; la=[[.5,-.7],[-.45,-.5]]; aa=[[1.9,1.9],[1.7,1.8]]; fix=0; }
    else if(state==='flail'){ lean=-.35; la=fr?[[.2,-.4],[.5,-.1]]:[[.45,-.1],[.1,-.25]]; aa=fr?[[3.3,3.6],[3.6,3.8]]:[[3.5,3.7],[3.2,3.5]]; fix=0; }
    else if(state==='truck'){ lean=.8; la=fr?[[.4,-.6],[-.2,-.5]]:[[.75,-.4],[-.5,-.75]]; aa=[[1.25,1.0],[.35,2.0]]; }               /* shoulder down, ball tucked */
    else if(state==='stiff'){ lean=.22; la=[[.6,-.55],[-.45,-.5]]; aa=st4===0?[[1.15,2.5],[.35,2.05]]:[[1.57,1.57],[.35,2.05]]; }             /* the arm locked out in front */
    else if(state==='hurdle'){ const k=Math.min(2,st4); lean=[.35,.25,.3][k]; la=[[[.95,-.2],[-.5,-.95]],[[1.45,1.35],[-.9,-1.7]],[[.55,-.5],[-.15,-.65]]][k]; aa=[[[1.9,1.8],[.4,1.7]],[[2.35,2.2],[.4,1.7]],[[1.7,1.6],[.5,1.6]]][k]; fix=k===1?0:1; }       /* front leg out flat, back leg tucked */
    else if(state==='oneHand'){ lean=.3; la=[[.5,-.45],[-.45,-.5]]; aa=[[2.95,3.1],[.3,1.0]]; }
    else if(state==='tiptoe'){ lean=-.05; la=[[.06,-.25],[-.06,-.3]]; aa=[[2.75,2.95],[2.55,2.85]]; }
    else if(state==='flex'){ lean=0; la=[[.15,-.1],[-.15,-.2]]; aa=fr?[[1.7,3.6],[1.6,3.5]]:[[1.6,3.4],[1.5,3.3]]; }
    else if(state==='drag'){ lean=-.25; la=[[.55,-.3],[-.2,-.5]]; aa=[[2.15,2.0],[1.95,1.9]]; }          /* leaning back, both hands on the collar */
    else if(state==='bow'){ lean=.95; la=[[.1,-.1],[-.2,-.3]]; aa=[[.9,.4],[.7,.3]]; }
    else if(state==='wings'){ lean=0; la=[[.15,-.1],[-.15,-.2]]; aa=fr?[[2.3,2.1],[2.2,2.0]]:[[1.8,1.6],[1.7,1.5]]; }
    else if(state==='celebrate'){ lean=-.1; la=fr?[[.9,-.5],[.4,-1.2]]:[[.15,-.1],[-.15,-.2]]; aa=[[3.0,3.1],[2.8,3.0]]; fix=fr?0:1; }
    else if(state==='stance3'){ lean=1.32; la=[[1.3,-.3],[.95,-.6]]; aa=[[.12,-.05],[.6,.35]]; }
    else { lean=.5; la=[[.6,-.35],[.4,-.5]]; aa=[[.5,.25],[.42,.2]]; }
    return buildSide(lean,la,aa,fix);
  }
  let sw=0, hip=-50, sY=-80, legs, arms, hd=null;
  const lg=(x,kx,ky,ax,ay)=>[[x,hip],[kx,ky],[ax,ay],[ax,ay+2.6]];
  if(run){ const la=Math.max(0,Math.sin(ph)), lb=Math.max(0,-Math.sin(ph)); sw=1.6*Math.sin(ph); hip=-50+1.2*Math.cos(2*ph); sY=hip-30;
    legs=[lg(-5.5,-6.4,-25-9*la,-6.6,-2-16*la),lg(5.5,6.4,-25-9*lb,6.6,-2-16*lb)];
    arms=state==='catch'?[[[[-15,sY+1],[-15,-99],[-8.5,-112]],[[15,sY+1],[15,-99],[8.5,-112]]],[[[-15,sY+1],[-16,-90],[-5,-96]],[[15,sY+1],[16,-90],[5,-96]]],[[[-15,sY+1],[-14,-62],[-3,-70]],[[15,sY+1],[14,-62],[3,-70]]]][cs]
      :[[[-15+sw,sY+1],[-19.5+sw,-64-5*lb],[-15+sw+4*lb,-52-15*lb]],[[15+sw,sY+1],[19.5+sw,-64-5*la],[15+sw-4*la,-52-15*la]]]; }
  else if(state==='stance3'){ hip=-40; sY=-60; hd=-67;
    legs=[lg(-6,-10.5,-21,-11,-2.6),lg(6,10.5,-21,11,-2.6)]; arms=[[[-14,sY+1],[-13,-32],[-8,-5]],[[14,sY+1],[17,-46],[12,-36]]]; }
  else if(state==='block'){ hip=-46; sY=-76;
    legs=[lg(-7,-10,-24,-10.5,-2.6),lg(7,10,-24-fr,10.5,-2.6-fr)]; arms=[[[-15,sY+1],[-14,-63+fr],[-7,-67+fr]],[[15,sY+1],[14,-63-fr],[7,-67-fr]]]; }
  else if(state==='throw'){ const f4=Math.floor(f||0)%4; sw=[0,2,-1,-3][f4];
    /* set, cock, release, follow through */
    legs=f4>=2?[lg(-5,-7,-25,-8,-2.6),lg(5,6.5,-29,7,-9)]:[lg(-5,-7,-25,-8,-2.6),lg(5,7,-25,8,-2.6)];
    arms=[[[[-15,sY+1],[-12,-64],[-3,-70]],[[15,sY+1],[13,-66],[4,-72]]],
          [[[-15,sY+1],[-18,-88],[-13,-100]],[[15,sY+1],[23,-84],[22,-100]]],
          [[[-15,sY+1],[-18,-70],[-10,-62]],[[15,sY+1],[12,-96],[4,-110]]],
          [[[-15,sY+1],[-20,-62],[-16,-50]],[[15,sY+1],[6,-66],[-6,-56]]]][f4].map(a=>a.map(([px,py])=>[px+sw,py])); }
  else if(state==='catchLow'){ legs=[lg(-5.5,-7,-25,-7.5,-2.6),lg(5.5,7,-25,7.5,-2.6)]; arms=[[[-15,sY+1],[-14,-62],[-5,-58]],[[15,sY+1],[14,-62],[5,-58]]]; }
  else if(state==='reach'){ sw=3; legs=[lg(-5.5,-6,-25,-5,-2.6),lg(5.5,9,-27,12,-6)]; arms=[[[-15+sw,sY+1],[-4,-92],[8,-104]],[[15+sw,sY+1],[27,-92],[35,-102]]]; }
  else if(state==='leap'){ const k=Math.min(3,st4);
    if(k===0||k===3){ hip=k===0?-42:-45; sY=hip-30; legs=[lg(-6,-9.5,-22,-8.5,-2.6),lg(6,9.5,-22,8.5,-2.6)]; arms=k===0?[[[-15,sY+1],[-18,-55],[-14,-43]],[[15,sY+1],[18,-55],[14,-43]]]:[[[-15,sY+1],[-21,-72],[-18,-58]],[[15,sY+1],[21,-72],[18,-58]]]; }
    else if(k===1){ legs=[lg(-5,-5.5,-25,-5.5,-5),lg(5,5.5,-25,5.5,-5)]; arms=[[[-15,sY+1],[-17,-90],[-12,-104]],[[15,sY+1],[17,-90],[12,-104]]]; }
    else { legs=[lg(-5.5,-8,-32,-7,-14),lg(5.5,8,-30,7,-16)]; arms=[[[-15,sY+1],[-13,-100],[-8,-116]],[[15,sY+1],[13,-100],[8,-116]]]; } }
  else if(state==='plant'){ sw=4; legs=[lg(-5.5,-11,-24,-15,-2.6),lg(5.5,6,-29,6,-10)]; arms=[[[-15+sw,sY+1],[-26,-70],[-30,-58]],[[15+sw,sY+1],[22,-64],[18,-52]]]; }
  else if(state==='oneHand'){ sw=2; legs=[lg(-5.5,-6.5,-25,-6.5,-2.6),lg(5.5,8,-27,10,-6)]; arms=[[[-15+sw,sY+1],[-18,-60],[-15,-46]],[[15+sw,sY+1],[20,-98],[24,-115]]]; }
  else if(state==='tiptoe'){ legs=[lg(-4,-3.8,-26,-3.6,-5),lg(4,3.8,-26,3.6,-5)]; arms=[[[-15,sY+1],[-15,-99],[-8.5,-112]],[[15,sY+1],[15,-99],[8.5,-112]]]; }
  else if(state==='wings'){ legs=[lg(-6,-8,-24,-9,-2.6),lg(6,8,-24,9,-2.6)]; arms=fr?[[[-15,sY+1],[-29,-84],[-42,-96]],[[15,sY+1],[29,-84],[42,-96]]]:[[[-15,sY+1],[-29,-74],[-42,-70]],[[15,sY+1],[29,-74],[42,-70]]]; }
  else if(state==='flex'){ hip=-48; sY=-78; legs=[lg(-7,-9,-24,-10,-2.6),lg(7,9,-24,10,-2.6)]; arms=fr?[[[-15,sY+1],[-27,-78],[-21,-97]],[[15,sY+1],[27,-78],[21,-97]]]:[[[-15,sY+1],[-26,-74],[-23,-93]],[[15,sY+1],[26,-74],[23,-93]]]; }
  else if(state==='celebrate'){ legs=fr?[lg(-5.5,-8,-32,-7,-14),lg(5.5,8,-30,7,-16)]:[lg(-5.5,-6,-25,-6,-2.6),lg(5.5,6,-25,6,-2.6)];
    arms=fr?[[[-15,sY+1],[-18,-100],[-14,-117]],[[15,sY+1],[18,-100],[14,-117]]]:[[[-15,sY+1],[-24,-96],[-31,-110]],[[15,sY+1],[24,-96],[31,-110]]]; }
  else { hip=-44; sY=-75;
    legs=[lg(-6,-10,-23,-9.5,-2.6),lg(6,10,-23,9.5,-2.6)]; arms=[[[-15,sY+1],[-18.5,-56],[-10.5,-40]],[[15,sY+1],[18.5,-56],[10.5,-40]]]; }
  const mid=Math.min(sY+11,hip-4);
  return {view,legs,arms,sw,sY,
    torso:[[-16+sw,sY-2],[16+sw,sY-2],[17.5+sw,sY+4],[13+sw*.7,mid],[8.5+sw*.3,hip-1],[-8.5+sw*.3,hip-1],[-13+sw*.7,mid],[-17.5+sw,sY+4]],
    pants:[[-9+sw*.3,hip-3],[9+sw*.3,hip-3],[10,hip+7],[-10,hip+7]],neck:[[sw,sY-1],[sw,sY-7]],head:[sw,hd!=null?hd:sY-12.5],num:[sw*.6,(sY+hip)/2-2],top:[0,1]};
}

/* painting, three tones a part, built heavy: limbs swell at the biceps, forearms and calves */
function paint(x,P,c,sk){
  const fill=col=>{ x.fillStyle=col; };
  const disc=(p,r,col)=>{ fill(col); x.beginPath(); x.arc(p[0],p[1],r,0,P2); x.fill(); };
  /* a limb as a swelling shape: width w0 at a, wm through the middle, w1 at b */
  const limb=(a,b,w0,wm,w1,col,ox,oy)=>{ ox=ox||0; oy=oy||0; const n=8, dx=b[0]-a[0], dy=b[1]-a[1], L=Math.hypot(dx,dy)||1e-3, nx=-dy/L, ny=dx/L, l=[], r=[];
    for(let i=0;i<=n;i++){ const t=i/n, w=(w0+(w1-w0)*t+(wm-(w0+w1)/2)*Math.sin(Math.PI*t))/2, px=a[0]+dx*t+ox, py=a[1]+dy*t+oy; l.push([px+nx*w,py+ny*w]); r.push([px-nx*w,py-ny*w]); }
    fill(col); x.beginPath(); [...l,...r.reverse()].forEach((p,i)=>i?x.lineTo(p[0],p[1]):x.moveTo(p[0],p[1])); x.closePath(); x.fill();
    disc([a[0]+ox,a[1]+oy],w0/2,col); disc([b[0]+ox,b[1]+oy],w1/2,col); };
  const lit=(a,b)=>{ const dx=b[0]-a[0],dy=b[1]-a[1],L=Math.hypot(dx,dy)||1; let nx=-dy/L,ny=dx/L; if(nx*LX+ny*LY<0){ nx=-nx; ny=-ny; } return [nx,ny]; };
  const limb3=(a,b,w0,wm,w1,t)=>{ limb(a,b,w0,wm,w1,t[0]); const [nx,ny]=lit(a,b);
    limb(a,b,w0*.6,wm*.62,w1*.6,t[1],nx*wm*.18,ny*wm*.18); if(t[2]) limb(a,b,w0*.22,wm*.26,w1*.22,t[2],nx*wm*.32,ny*wm*.32); };
  const along=(a,b,t)=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];
  const poly=(pts,col)=>{ fill(col); x.beginPath(); pts.forEach((p,i)=>i?x.lineTo(p[0],p[1]):x.moveTo(p[0],p[1])); x.closePath(); x.fill(); };
  const poly3=(pts,t)=>{ poly(pts,t[0]); const cx=pts.reduce((s,p)=>s+p[0],0)/pts.length, cy=pts.reduce((s,p)=>s+p[1],0)/pts.length;
    poly(pts.map(([px,py])=>[cx+(px-cx)*.74+LX*3,cy+(py-cy)*.8+LY*3]),t[1]); };
  /* a leg: pants to the knee with a stripe down it, the sock, a white band at the ankle, the cleat */
  const leg=(l,far,line)=>{ const pn=far?[c.pants[0],c.pants[0],c.pants[1]]:c.pants, so=far?[c.sock[0],c.sock[0]]:c.sock;
    if(line){ limb(l[0],l[1],18,19,13,OUTC); limb(l[1],l[2],13,14,10,OUTC); }
    limb3(l[0],l[1],14,15,10,pn); limb(l[0],along(l[0],l[1],.92),2.8,2.8,2.8,far?c.pants[0]:c.pstripe);
    limb3(l[1],l[2],9.5,11,6.5,so); limb(along(l[1],l[2],.78),l[2],6.6,6.8,6.6,far?'#9a9da3':c.band);
    limb(l[2],l[3],8,8.5,7,SHOE[0]); limb(l[2],l[3],3,3,3,SHOE[1],0,-1.6); };
  /* an arm: the sleeve over the top of it with a band, the bicep, the forearm, a glove */
  const arm=(a,far,line)=>{ const j=far?[c.jersey[0],c.jersey[0],c.jersey[1]]:c.jersey, s=far?[sk[0],sk[0],sk[1]]:sk;
    if(line){ limb(a[0],a[1],15,15,12,OUTC); limb(a[1],a[2],12,12.5,10,OUTC); disc(a[2],6.6,OUTC); }
    limb3(a[0],a[1],10.5,11.5,8,s); limb3(a[1],a[2],8.5,9.5,6.5,s);
    const sl=along(a[0],a[1],.5); limb3(a[0],sl,13,13.5,12,j); limb(along(a[0],a[1],.42),sl,12.4,12.4,12.4,far?c.jersey[0]:c.acc);
    disc(a[2],4.6,far?c.glove[0]:c.glove[0]); disc([a[2][0]+LX*1.2,a[2][1]+LY*1.2],2.8,far?c.glove[0]:c.glove[1]); };
  const h=P.head, side=P.view==='side', R=8.2;
  const helmet=()=>{ disc(h,R,c.helmet[0]); disc([h[0]+LX*1.3,h[1]+LY*1.3],R*.76,c.helmet[1]); disc([h[0]+LX*4,h[1]+LY*3.8],1.7,c.helmet[2]);
    x.save(); x.beginPath(); x.arc(h[0],h[1],R,0,P2); x.clip();
    if(side){ x.strokeStyle=c.stripe; x.lineWidth=3.4; x.beginPath(); x.arc(h[0],h[1],R-2,Math.PI*1.08,Math.PI*1.86); x.stroke();
      disc([h[0]+7.4,h[1]+2.6],3.8,sk[1]); disc([h[0]-1.4,h[1]+1.6],2,'#111'); }
    else if(P.view==='back'){ fill(c.stripe); x.fillRect(h[0]-1.8,h[1]-R,3.6,R*2); }
    else { fill(c.stripe); x.fillRect(h[0]-1.8,h[1]-R,3.6,5); fill(sk[1]); x.beginPath(); x.ellipse(h[0],h[1]+2.8,4.6,4.4,0,0,P2); x.fill(); }
    x.restore();
    /* the cage */
    x.strokeStyle=c.mask; x.lineWidth=3; x.lineCap='round'; x.beginPath();
    if(side){ x.moveTo(h[0]+4.6,h[1]+.4); x.lineTo(h[0]+10.6,h[1]+1.2); x.moveTo(h[0]+4.6,h[1]+4.8); x.lineTo(h[0]+10,h[1]+5.4); x.moveTo(h[0]+10.6,h[1]+1); x.lineTo(h[0]+9.6,h[1]+6.4); }
    else if(P.view==='front'){ x.moveTo(h[0]-5,h[1]+1.4); x.lineTo(h[0]+5,h[1]+1.4); x.moveTo(h[0]-4.2,h[1]+5); x.lineTo(h[0]+4.2,h[1]+5); x.moveTo(h[0],h[1]+1.4); x.lineTo(h[0],h[1]+6.6); }
    x.stroke(); };
  if(side){
    leg(P.legs[1],1); arm(P.arms[1],1);
    poly3(P.pants,c.pants); leg(P.legs[0],0,1);
    /* the body: deep through the chest, pads riding high on the shoulder */
    poly3(P.torso,c.jersey); const sh=P.arms[0][0]; disc(sh,9.6,c.jersey[0]); disc([sh[0]+LX*1.4,sh[1]+LY*1.4],7.4,c.jersey[1]); disc([sh[0]+LX*3.6,sh[1]+LY*3.6],3,c.jersey[2]);
    limb(P.neck[0],P.neck[1],9,9,8,sk[0]); helmet(); arm(P.arms[0],0,1); return; }
  leg(P.legs[0],0); leg(P.legs[1],0); poly3(P.pants,c.pants);
  poly3(P.torso,c.jersey);
  [[-1,P.torso[0]],[1,P.torso[1]]].forEach(([s,p])=>{ const q=[p[0]-s*2.5,p[1]+4.5]; disc(q,7.2,c.jersey[0]); disc([q[0]+LX*1.2,q[1]+LY*1.4],5.4,c.jersey[1]); disc([q[0]+LX*2.6,q[1]+LY*2.6],2.2,c.jersey[2]); disc([q[0]+s*1.5,q[1]-1],2.4,c.acc); });
  limb(P.neck[0],P.neck[1],10,10,9,sk[0]); helmet(); P.arms.forEach(a=>arm(a,0,1));
}

/* to pixels */
const D3={0:'###|#.#|#.#|#.#|###',1:'.#.|##.|.#.|.#.|###',2:'###|..#|###|#..|###',3:'###|..#|###|..#|###',4:'#.#|#.#|###|..#|..#',5:'###|#..|###|..#|###',6:'###|#..|###|#.#|###',7:'###|..#|..#|..#|..#',8:'###|#.#|###|#.#|###',9:'###|#.#|###|..#|###'};
const RUNF=10, SW=72, SH=72, GX=36, GY=54, PU=.36;   /* room for arms overhead and a man laid out at full length */
const rgb=c=>[parseInt(c.slice(1,3),16),parseInt(c.slice(3,5),16),parseInt(c.slice(5,7),16)];
/* snap a painted figure to pixels: each pixel one colour of the kit or empty, and a dark line round the outside */
function pixelize(x,W,H,c,sk,keep){
  const pal=[...c.jersey,...c.pants,...c.helmet,c.stripe,c.acc,...c.sock,c.band,'#9a9da3','#111111',...c.glove,c.mask,...sk,...SHOE,OUTC].map(rgb);
  const id=x.getImageData(0,0,W,H), d=id.data, on=new Uint8Array(W*H);
  for(let i=0;i<W*H;i++){ const o=i*4; if(d[o+3]<120){ d[o+3]=0; continue; } on[i]=1; let best=0,bd=1e9;
    for(let j=0;j<pal.length;j++){ const p=pal[j], e=(p[0]-d[o])**2+(p[1]-d[o+1])**2+(p[2]-d[o+2])**2; if(e<bd){ bd=e; best=j; } }
    d[o]=pal[best][0]; d[o+1]=pal[best][1]; d[o+2]=pal[best][2]; d[o+3]=255; }
  const oc=rgb(OUTC);
  for(let y=0;y<H;y++) for(let xx=0;xx<W;xx++){ const i=y*W+xx; if(on[i]) continue;
    if((xx>0&&on[i-1])||(xx<W-1&&on[i+1])||(y>0&&on[i-W])||(y<H-1&&on[i+W])){ const o=i*4; d[o]=oc[0]; d[o+1]=oc[1]; d[o+2]=oc[2]; d[o+3]=255; } }
  if(keep) return id; x.putImageData(id,0,0); return id; }
/* ═══ FOUR WAYS ═══ Every body is posed side on (forward is +x, down is +y). Seen from behind or in front, his forward
   runs into the screen, shortened by DK (the camera looks down the field from above); his left and right spread to their
   widths; whether we see his back or his chest follows which way his chest faces the camera. */
const DK=.6, CAM=.75;
function project(P,g,tilt){
  const S=P.arms[0][0], H=P.legs[0][0], ux=S[0]-H[0], uy=S[1]-H[1], ul=Math.hypot(ux,uy)||1, nx=-uy/ul, ny=ux/ul;
  const front=nx*(-g*Math.cos(CAM))-ny*Math.sin(CAM)>0, m=front?-1:1;
  const Y=p=>p[1]-g*p[0]*DK, cl=v=>v<0?0:v>1?1:v;
  const legs=P.legs.map((l,i)=>l.map((p,j)=>[(i?-1:1)*m*[6,7,7.5,7.5][j],Y(p)]));
  const arms=P.arms.map((a,i)=>a.map((p,j)=>{ const ahead=(p[0]-a[0][0])*nx+(p[1]-a[0][1])*ny;
    const lat=j===0?15:j===1?18.5-cl(ahead/20)*4:13-cl(ahead/25)*8; return [(i?-1:1)*m*lat,Y(p)]; }));
  let sp=Y(S), hp=Y(H); if(Math.abs(hp-sp)<12){ const d=hp>=sp?1:-1, mid=(sp+hp)/2; sp=mid-6*d; hp=mid+6*d; }
  const at=t=>sp+(hp-sp)*t;
  /* a man on the ground lies at a slant: straight up the screen he would read as a short man standing */
  const lf=cl((Math.abs(ux/ul)-.5)/.45), tau=(tilt||1)*.6*lf, H0=[0,Y(H)], c0=Math.cos(tau), s0=Math.sin(tau);
  const R=p=>lf?[H0[0]+c0*(p[0]-H0[0])-s0*(p[1]-H0[1]),H0[1]+s0*(p[0]-H0[0])+c0*(p[1]-H0[1])]:p;
  return {view:front?'front':'back',legs:legs.map(l=>l.map(R)),arms:arms.map(a=>a.map(R)),
    torso:[[-16,-.067],[16,-.067],[17.5,.133],[13,.367],[8.5,.967],[-8.5,.967],[-13,.367],[-17.5,.133]].map(([l,t])=>R([l,at(t)])),
    pants:[[-9,.9],[9,.9],[10,1.233],[-10,1.233]].map(([l,t])=>R([l,at(t)])),
    neck:[R([0,Y(P.neck[0])]),R([0,Y(P.neck[1])])],head:R([0,Y(P.head)]),num:[0,at(.5)],top:[0,1],sw:0}; }
/* how a falling or lying state turns the side-on figure about his feet: [x, y, turn] */
function XF(state,fi){ const k=Math.min(2,fi);
  if(state==='dive') return [...[[-18,-8],[-34,-16],[-42,-8]][k],[.6,1.15,1.45][k]];
  if(state==='down') return fi===0?[-42,-12,1.38]:[-46,-6,Math.PI/2];
  if(state==='fallF') return [-[8,24,40][k],0,[.35,.8,1.2][k]];
  if(state==='fallB') return [[8,24,40][k],0,-[.3,.7,1.1][k]];
  if(state==='downB') return fi===0?[40,-12,-1.38]:[44,-6,-Math.PI/2];
  return null; }
function xfP(P,[tx,ty,r]){ const c=Math.cos(r), n=Math.sin(r), f=p=>[tx+c*p[0]-n*p[1],ty+n*p[0]+c*p[1]];
  return {...P,legs:P.legs.map(l=>l.map(f)),arms:P.arms.map(a=>a.map(f)),torso:P.torso.map(f),pants:P.pants.map(f),neck:P.neck.map(f),head:f(P.head)}; }
/* a man's body for a view, state and frame, in sprite units from his feet */
/* GOING DOWN, posed like the tackle scenes rather than a stiff man turned on his side: each frame is a hip height, a
   body angle and every limb's bend. [hip height, body, near thigh, shin, far thigh, shin, near arm, forearm, far arm, forearm]
   Face down the knees bend and a foot comes up, an arm is under him; on his back the knees come up and the arms fall loose. */
const LIE={
  dive:[[30,1.1,-.4,-.9,-.9,-1.3,2.0,2.0,1.9,1.9],[16,1.45,-1.2,-1.6,-1.4,-1.8,2.4,2.3,2.3,2.2],[9,1.55,-1.3,-2.3,-1.5,-2.0,2.4,2.2,2.3,2.1]],
  fallF:[[40,.8,.3,-.4,-.6,-1.2,.5,2.4,1.6,1.5],[24,1.2,-.2,-.9,-.5,-1.3,2.0,2.0,2.2,2.1],[12,1.5,-1.2,-2.0,-1.4,-2.1,2.4,2.0,2.3,2.1]],
  down:[[9,1.55,-1.3,-2.1,-1.5,-2.2,2.4,2.0,2.3,2.1],[9,1.55,-1.35,-2.55,-1.55,-2.0,2.15,1.55,2.45,2.25]],
  fallB:[[46,-.55,.5,-.1,.2,-.3,2.5,3.0,2.9,3.3],[40,-1.0,1.4,.7,1.1,.4,2.9,3.2,3.2,3.4],[16,-1.4,1.9,.8,1.5,.5,2.9,3.2,3.1,3.3]],
  downB:[[14,-1.45,2.4,1.2,2.0,.9,2.8,3.1,3.0,3.2],[9,-1.5,2.05,.8,1.4,.3,.4,2.2,2.5,2.8]]};
function lieP(state,fi){ const L=LIE[state], q=L[Math.min(L.length-1,fi)];
  return xfP(buildSide(q[1],[[q[2],q[3]],[q[4],q[5]]],[[q[6],q[7]],[q[8],q[9]]],0),[0,50-q[0],0]); }
function bodyP(view,state,fi){ const ps={fallF:'stumble',fallB:'flail',downB:'flail'}[state]||state, ph=(state==='run'||state==='catch')?(fi%RUNF)/RUNF*P2:0;
  if(LIE[state]){ const P=lieP(state,fi); return view==='side'?P:project(P,view==='back'?1:-1); }
  /* running at you or away: the side-on stride seen from behind or in front, so the legs reach and drive instead of marching */
  if(state==='run'&&view!=='side') return project(pose('side','run',ph,fi),view==='back'?1:-1);
  if(view!=='side'&&!SIDE_ONLY.has(state)) return pose(view,ps,ph,fi);
  let P=pose('side',ps,ph,fi); const xf=XF(state,fi); if(xf) P=xfP(P,xf);
  return view==='side'?P:project(P,view==='back'?1:-1); }
function renderSprite(k,view,state,fi,num,si){
  const c=KIT[k], sk=SKIN[si], cv=document.createElement('canvas'); cv.width=SW; cv.height=SH; const x=cv.getContext('2d',{willReadFrequently:true});
  x.translate(GX,GY); x.scale(PU,PU);
  const P=bodyP(view,state,fi);
  paint(x,P,c,sk); x.setTransform(1,0,0,1,0,0);
  const id=pixelize(x,SW,SH,c,sk,true), d=id.data;
  if(num!=null&&view!=='side'&&state!=='dive'&&state!=='down'){ const s=String(num).slice(-2), w=s.length*4-1, x0=Math.round(GX+P.num[0]*PU-w/2), y0=Math.round(GY+P.num[1]*PU-2), nc=rgb(c.num);
    [...s].forEach((dg,i)=>D3[dg].split('|').forEach((row,r)=>[...row].forEach((ch,cc)=>{ if(ch!=='#') return; const px=x0+i*4+cc, py=y0+r; if(px<0||py<0||px>=SW||py>=SH) return; const o=(py*SW+px)*4; d[o]=nc[0]; d[o+1]=nc[1]; d[o+2]=nc[2]; }))); }
  x.putImageData(id,0,0);
  return cv; }
const SPR=new Map();
function sprite(k,view,state,fi,num,si){ const key=k+view+state+fi+':'+num+':'+si; let s=SPR.get(key); if(!s){ s=renderSprite(k,view,state,fi,num,si); SPR.set(key,s); } return s; }
/* draw a man standing on a point; s is whole pixels per sprite pixel. f runs 0 to 8 through a stride. */
function fiOf(state,f){ const rf=n=>Math.floor((((n%100)%8)+8)%8/8*RUNF)%RUNF;
  return state==='run'?rf(f||0):state==='catch'?rf(f||0)+RUNF*Math.min(2,Math.floor((f||0)/100)):state==='throw'?Math.floor(f||0)%4:(state==='fallF'||state==='fallB')?Math.min(2,Math.floor(f||0)):Math.max(0,Math.floor(f||0)); }
const SIDE_ONLY=new Set(['dive','down','fallF','fallB','downB','wrap','truck','stiff','hurdle','drag','bow','kneel']);
function drawPlayer(ctx,k,num,x,y,facing,state,f,s,lift){
  const view=facing==='up'||facing==='upL'?'back':facing==='down'?'front':'side';
  const fi=fiOf(state,f);
  const img=sprite(k,view,state,fi,null,((num||0)*7)%SKIN.length);
  ctx.save(); ctx.imageSmoothingEnabled=false; ctx.translate(Math.round(x),Math.round(y));
  const sw=view!=='side'?((state==='down'||state==='downB')?16:12):(state==='down'||state==='downB')?34:(state==='dive'||state==='fallF'||state==='fallB')?22:12, sh=lift>0?Math.max(6,sw-lift/3):sw;
  ctx.fillStyle='rgba(0,0,0,.4)'; ctx.fillRect(Math.round(-sh/2*s),Math.round(-s),Math.round(sh*s),Math.round(2*s));
  if(facing==='left'||facing==='upL') ctx.scale(-1,1);
  ctx.drawImage(img,-GX*s,Math.round(-GY*s-(lift||0)),SW*s,SH*s); ctx.restore();
}
/* the football, pixel too: eight turns drawn once */
const BALLS=[];
(function(){ const pal=['#3a1d0a','#7a3e18','#a85d2c','#d08a55','#f3eadb',OUTC].map(rgb);
  for(let a=0;a<8;a++){ const cv=document.createElement('canvas'); cv.width=cv.height=12; const x=cv.getContext('2d',{willReadFrequently:true});
    x.translate(6,6); x.rotate(a*Math.PI/8); const L=4.6, h=2.7;
    const shape=(s,dx,dy,col)=>{ x.fillStyle=col; x.beginPath(); x.moveTo(-L*s+dx,dy); x.quadraticCurveTo(dx,-h*2*s+dy,L*s+dx,dy); x.quadraticCurveTo(dx,h*2*s+dy,-L*s+dx,dy); x.fill(); };
    shape(1,0,0,'#7a3e18'); shape(.7,-.3,-.6,'#a85d2c'); shape(.28,-1,-1.2,'#d08a55');
    x.fillStyle='#f3eadb'; x.fillRect(-2,-1.2,4,1);
    x.setTransform(1,0,0,1,0,0);
    const id=x.getImageData(0,0,12,12), d=id.data, on=new Uint8Array(144);
    for(let i=0;i<144;i++){ const o=i*4; if(d[o+3]<110){ d[o+3]=0; continue; } on[i]=1; let b=0,bd=1e9; pal.forEach((p,j)=>{ const e=(p[0]-d[o])**2+(p[1]-d[o+1])**2+(p[2]-d[o+2])**2; if(e<bd){ bd=e; b=j; } }); d[o]=pal[b][0]; d[o+1]=pal[b][1]; d[o+2]=pal[b][2]; d[o+3]=255; }
    for(let i=0;i<144;i++){ if(on[i]) continue; const xx=i%12; if((xx>0&&on[i-1])||(xx<11&&on[i+1])||(i>=12&&on[i-12])||(i<132&&on[i+12])){ const o=i*4; d[o]=20; d[o+1]=14; d[o+2]=18; d[o+3]=255; } }
    x.putImageData(id,0,0); BALLS.push(cv); } })();
function drawBall(ctx,x,y,lift,s,ang,noShadow){ s=s||1; const k=((Math.round((ang||0)/(Math.PI/8))%8)+8)%8;
  ctx.save(); ctx.imageSmoothingEnabled=false;
  if(!noShadow){ ctx.fillStyle='rgba(0,0,0,.4)'; ctx.fillRect(Math.round(x-3*s),Math.round(y-s/2),6*s,s); }
  ctx.drawImage(BALLS[k],Math.round(x-6*s),Math.round(y-(lift||0)-6*s),12*s,12*s); ctx.restore(); }

/* the site's dot fields on a canvas: one dot per cell, anchored where the caller says so they move with the field */
const DPRg=Math.min(2,devicePixelRatio||1), PATS={};
function dotFill(ctx,col,step,ax,ay){ const key=col+'|'+step; let p=PATS[key];
  if(!p){ const c=document.createElement('canvas'); c.width=c.height=Math.round(step*DPRg); const x=c.getContext('2d'); x.fillStyle=col; x.beginPath(); x.arc(c.width/2,c.height/2,.8*DPRg,0,P2); x.fill(); p=PATS[key]=x.createPattern(c,'repeat'); }
  p.setTransform(new DOMMatrix().translate(ax||0,ay||0).scale(1/DPRg)); return p; }

/* ═══ TWO-MAN SCENES ═══
   A tackle is one animation of two bodies, not two men doing their own thing. Each scene is a list of keyframes for the
   ball carrier (B) and the tackler (A): where his hip is (how high off the ground, and across in pixels) and the angle of
   his body and every limb, all measured on the field (forward is the way he faces). Between keyframes everything eases,
   so a man can be on his back with his knees up, or on top of another with his arms round him, at any angle.
   A keyframe: [time, hip height, body, near thigh, near shin, far thigh, far shin, near arm, near forearm, far arm, far forearm, across]. */
const KW=96, KH=84, KX=48, KY=66;
const SCENES={
  /* met from the front and wrapped up: driven back off his feet, down on his back, the tackler on top of him */
  wrap:{len:1.25,order:['B','A'],B:{face:1,k:[
      [0,46,.25,.6,-.4,-.45,-.7,.5,2.4,1.4,1.7,0],[.12,47,-.25,.4,-.2,-.2,-.6,.5,2.4,2.4,2.8,-2],[.26,40,-.8,.9,.3,.5,-.1,.3,2.2,2.9,3.2,-5],
      [.4,12,-1.45,1.8,.7,1.5,.5,.2,2.0,3.0,3.3,-8],[.48,17,-1.35,2.45,1.25,2.1,.95,.2,2.0,2.7,3.0,-9],[.62,9,-1.5,2.0,.8,1.6,.4,.3,2.1,2.5,2.8,-10],[1.25,9,-1.5,2.0,.8,1.6,.4,.3,2.1,2.5,2.8,-10]]},
    A:{face:-1,k:[
      [0,42,.85,.75,-.35,-.45,-.8,1.3,2.7,1.1,2.6,11],[.12,40,.95,.95,-.2,-.7,-.9,1.4,2.8,1.2,2.7,9],[.26,30,1.2,.5,-.6,-.9,-1.2,1.5,2.8,1.3,2.7,3],
      [.4,17,1.45,.2,-1.2,-.1,-1.4,.6,2.0,.5,1.9,2],[.48,19,1.4,.2,-1.2,-.1,-1.4,.6,2.0,.5,1.9,3],[.62,16,1.5,0,-1.5,-.2,-1.5,.5,1.8,.4,1.7,5],[1.25,16,1.5,0,-1.5,-.2,-1.5,.5,1.8,.4,1.7,5]]}},
  /* met head on: his body snaps back, his feet fly up, he lands on his back and slides; the hitter stands over him */
  hit:{len:1.25,order:['B','A'],B:{face:1,k:[
      [0,46,.25,.6,-.4,-.45,-.7,.5,2.4,1.4,1.7,0],[.08,46,-.55,.5,-.1,.2,-.3,2.5,3.0,2.9,3.3,-2],[.2,44,-1.0,1.4,.7,1.1,.4,2.9,3.2,3.2,3.4,-10],
      [.32,12,-1.5,1.8,.7,1.5,.5,2.9,3.2,3.1,3.3,-15],[.4,18,-1.4,2.45,1.25,2.1,.95,2.7,3.0,2.9,3.2,-17],[.52,9,-1.55,2.0,.8,1.6,.4,2.6,2.9,2.4,2.7,-21],[1.25,9,-1.55,2.0,.8,1.6,.4,2.6,2.9,2.4,2.7,-21]]},
    A:{face:-1,k:[
      [0,44,.55,.6,-.5,-.4,-.6,.4,1.9,.3,1.7,12],[.08,40,.95,.85,-.3,-.5,-.8,1.2,1.0,.3,2.0,8],[.2,44,.7,.5,-.6,-.3,-.5,1.0,1.2,.4,1.8,3],
      [.4,48,.15,.2,-.1,-.1,-.2,.5,.3,.4,.2,0],[1.25,48,.3,.2,-.1,-.1,-.2,.6,.3,.5,.2,-1]]}},
  /* a dive at his ankles from behind: tripped, he sprawls forward onto his chest, then pushes up; the diver hangs on to his legs */
  shoe:{len:1.25,order:['A','B'],B:{face:1,k:[
      [0,46,.25,.6,-.4,-.45,-.7,.5,2.4,1.4,1.7,0],[.1,44,.55,.4,-.3,-.9,-1.6,1.6,1.6,1.8,1.8,2],[.22,32,1.0,.1,-.5,-1.1,-1.8,2.0,1.9,2.2,2.0,6],
      [.34,20,1.3,-.3,-.9,-1.3,-1.9,1.2,1.0,1.0,.9,9],[.42,8,1.55,-1.3,-2.3,-1.5,-2.0,2.3,2.1,2.0,1.8,11],[.5,12,1.5,-1.2,-2.6,-1.4,-2.1,2.2,2.0,2.0,1.8,12],
      [.62,8,1.5,-1.3,-2.7,-1.5,-2.1,1.9,1.6,2.1,1.8,14],[.85,14,1.25,-1.3,-2.6,-1.5,-2.2,.3,.1,.5,.2,14],[1.25,14,1.25,-1.3,-2.6,-1.5,-2.2,.3,.1,.5,.2,14]]},
    A:{face:1,k:[
      [0,38,.7,.6,-.8,-.7,-.5,1.9,1.8,1.7,1.7,-18],[.1,22,1.4,-.9,-1.3,-1.2,-1.5,2.4,2.3,2.3,2.2,-12],[.22,10,1.55,-1.4,-1.7,-1.6,-1.9,2.0,2.1,1.9,2.0,-10],
      [.5,9,1.57,-1.1,-2.3,-1.4,-2.0,2.0,2.1,1.9,2.0,-9],[1.25,9,1.57,-1.1,-2.3,-1.4,-2.0,2.0,2.1,1.9,2.0,-9]]}},
  /* pulled down by the collar from behind: his feet go out from under him and he lands on the man who pulled him */
  drag:{len:1.25,order:['A','B'],B:{face:1,k:[
      [0,46,.25,.6,-.4,-.45,-.7,.5,2.4,1.4,1.7,0],[.1,46,-.5,.9,.3,.6,.1,.5,2.4,2.6,2.9,1],[.24,34,-.95,1.3,.6,1.0,.4,.5,2.4,2.8,3.1,0],
      [.38,14,-1.4,1.8,.7,1.5,.5,.4,2.2,2.9,3.2,-2],[.46,17,-1.35,2.45,1.25,2.1,.95,.4,2.2,2.7,3.0,-3],[.6,12,-1.45,2.0,.8,1.6,.4,.4,2.2,2.5,2.8,-3],[1.25,12,-1.45,2.0,.8,1.6,.4,.4,2.2,2.5,2.8,-3]]},
    A:{face:1,k:[
      [0,44,.35,.6,-.5,-.4,-.6,2.2,2.0,2.0,1.9,-11],[.1,44,-.1,.5,-.2,-.3,-.5,2.4,2.6,2.3,2.5,-10],[.24,30,-.5,1.1,.1,.8,-.1,2.2,2.6,2.1,2.5,-11],
      [.38,12,-1.1,1.7,.7,1.4,.5,2.0,2.5,1.9,2.4,-12],[.6,9,-1.3,1.9,.8,1.6,.5,1.8,2.3,1.7,2.2,-12],[1.25,9,-1.3,1.9,.8,1.6,.5,1.8,2.3,1.7,2.2,-12]]}},
  /* the standard tackle: he comes in from the side, wraps the waist, the carrier's legs churn a step, and they go down
     together, the carrier on his chest and the tackler across his legs */
  tackle:{len:1.0,order:['B','A'],B:{face:1,k:[
      [0,46,.24,.8,.55,-.8,-.98,.5,2.4,.95,2.45,0],[.1,46,.4,-.8,-.98,.8,.55,.5,2.4,-.6,.9,3],[.22,40,.8,.3,-.4,-.6,-1.2,.5,2.4,1.6,1.5,6],
      [.34,24,1.2,-.2,-.9,-.5,-1.3,2.0,2.0,2.2,2.1,8],[.44,9,1.55,-1.3,-2.1,-1.5,-2.2,2.4,2.0,2.3,2.1,9],[.5,12,1.5,-1.3,-2.3,-1.5,-2.1,2.3,2.0,2.2,2.0,9],
      [.62,9,1.55,-1.35,-2.4,-1.5,-2.2,2.4,2.1,2.3,2.0,9],[1.0,9,1.55,-1.35,-2.4,-1.5,-2.2,2.4,2.1,2.3,2.0,9]]},
    A:{face:1,k:[
      [0,44,.5,.9,-.2,-.6,-.9,1.3,2.2,1.2,2.1,-14],[.1,40,.95,.8,-.4,-.7,-1.2,1.6,2.7,1.5,2.6,-10],[.22,32,1.15,.5,-.9,-.9,-1.5,1.7,2.8,1.6,2.7,-9],
      [.34,20,1.35,-.2,-1.2,-.8,-1.7,1.8,2.6,1.7,2.5,-12],[.44,12,1.5,-1.0,-1.9,-1.3,-2.1,1.9,2.4,1.8,2.3,-16],[.62,10,1.55,-1.1,-2.2,-1.4,-2.1,1.9,2.3,1.8,2.2,-17],
      [1.0,10,1.55,-1.1,-2.2,-1.4,-2.1,1.9,2.3,1.8,2.2,-17]]}},
  /* THE PASS PLAYS (B the receiver, A the defender) */
  /* contested: both already rising as it arrives; he goes higher, takes it at the top, brings it down and lands running;
     the defender comes down a beat later, beaten */
  contest:{len:.7,order:['A','B'],catchT:.14,B:{face:1,k:[
      [0,62,.1,.6,-.7,-.1,-1.0,2.7,2.9,2.6,2.85,0],[.14,84,-.05,.7,-.9,-.3,-1.3,2.95,3.05,2.9,3.0,1],[.28,74,.05,.6,-.6,-.2,-1.0,2.2,2.6,2.0,2.5,2],
      [.4,50,.2,.8,-.3,-.4,-.9,.5,2.4,.6,2.2,4],[.52,46,.25,.8,.55,-.8,-.98,.5,2.4,.95,2.45,6],[.65,46,.25,-.8,-.98,.8,.55,.5,2.4,-.95,.55,9]]},
    A:{face:1,k:[
      [0,58,.15,.4,-.6,-.2,-.9,2.6,2.8,2.4,2.7,-8],[.14,74,.1,.6,-.8,-.3,-1.2,2.8,3.0,2.2,2.6,-7],[.28,64,-.1,.6,-.4,-.2,-.8,2.4,2.8,1.8,2.2,-7],
      [.44,44,-.25,.7,-.2,-.4,-.7,1.4,2.0,1.2,1.8,-8],[.7,44,.1,.6,-.5,-.4,-.6,.6,1.6,.5,1.5,-7]]}},
  /* MOSSED: he climbs right over the defender, knee in his back, takes it over his head and rips it down, and the
     defender is driven face first into the ground while he lands past him and runs */
  mossed:{len:.8,order:['A','B'],catchT:.2,B:{face:1,k:[
      [0,62,.3,.9,-.3,-.2,-1.0,2.6,2.8,2.5,2.75,-4],[.1,80,.35,1.3,.2,-.1,-1.2,2.9,3.0,2.8,2.95,-1],[.2,84,.45,1.2,.1,-.2,-1.1,2.75,2.7,2.6,2.6,1],
      [.32,76,.2,.9,-.2,-.3,-1.0,1.6,2.6,1.5,2.5,3],[.46,58,.1,.7,-.4,-.4,-1.0,.5,2.4,.8,2.2,5],[.6,46,.3,.8,-.3,-.5,-.9,.5,2.4,.9,2.0,8],
      [.8,46,.25,.8,.55,-.8,-.98,.5,2.4,.95,2.45,12]]},
    A:{face:1,k:[
      [0,56,.15,.3,-.5,-.2,-.9,2.6,2.8,2.4,2.7,6],[.1,64,.1,.5,-.7,-.3,-1.1,2.8,3.0,2.5,2.8,7],[.2,62,.35,.4,-.9,-.3,-1.2,2.9,3.1,2.7,2.9,8],
      [.32,48,.8,.3,-.8,-.5,-1.2,2.4,2.6,2.2,2.4,10],[.46,24,1.25,-.2,-1.2,-.6,-1.6,2.2,2.0,2.3,2.1,13],[.56,9,1.55,-1.3,-2.1,-1.5,-2.2,2.4,2.0,2.3,2.1,15],
      [.8,9,1.55,-1.35,-2.5,-1.5,-2.1,2.2,1.6,2.4,2.2,15]]}},
  /* swatted: he reaches for it, the defender comes over the top and chops his arm down through the hands, the ball pops
     loose and both stumble */
  swat:{len:.7,order:['B','A'],noBall:1,B:{face:1,k:[
      [0,48,.2,.6,-.5,-.4,-.7,2.3,2.6,2.2,2.5,0],[.1,50,.15,.5,-.4,-.3,-.7,2.6,2.8,2.5,2.75,1],[.2,46,-.1,.6,-.2,-.4,-.6,2.9,3.3,2.0,2.8,2],
      [.36,44,.15,.7,-.4,-.5,-.8,1.3,1.8,1.6,2.2,3],[.7,46,.25,.6,-.5,-.4,-.6,.6,1.4,.5,1.3,4]]},
    A:{face:-1,k:[
      [0,46,.45,.8,-.4,-.5,-.9,1.4,1.9,1.2,1.8,18],[.1,54,.35,.6,-.6,-.4,-.9,2.9,3.1,1.6,2.2,13],[.2,50,.7,.8,-.4,-.6,-1.0,1.3,1.1,1.5,2.0,10],
      [.36,40,.85,.6,-.6,-.6,-1.1,.8,1.0,1.1,1.6,9],[.7,46,.4,.6,-.5,-.4,-.6,.8,1.8,.6,1.6,9]]}},
  /* undercut: the defender jumps the route, bursting past him to the front, takes it low into his chest and runs off
     with it; the receiver, reaching round him, runs into his back */
  pick:{len:.7,order:['B','A'],ballRole:'A',catchT:.24,B:{face:1,k:[
      [0,46,.25,.8,.55,-.8,-.98,.9,1.6,.8,1.5,0],[.12,46,.3,-.8,-.98,.8,.55,1.9,2.2,1.8,2.1,3],[.24,44,.4,.6,-.6,-.6,-1.0,2.0,2.1,1.9,2.0,5],
      [.36,42,-.15,.7,-.1,-.3,-.6,1.4,1.8,1.2,1.6,6],[.7,46,.15,.6,-.5,-.4,-.6,.6,1.4,.5,1.3,6]]},
    A:{face:1,k:[
      [0,46,.5,.8,.4,-.7,-1.0,1.4,1.8,1.2,1.7,-6],[.12,40,.75,-.7,-1.0,.9,.2,1.8,1.9,1.7,1.8,3],[.24,38,.7,.9,-.6,-.6,-1.1,1.4,1.2,1.3,1.1,9],
      [.36,44,.3,.7,-.5,-.5,-.8,.6,2.4,.5,2.3,11],[.5,46,.25,.8,.55,-.8,-.98,.6,2.4,.95,2.45,15],[.7,46,.25,-.8,-.98,.8,.55,.6,2.4,-.95,.55,19]]}},
  /* the possession catch: a short one with a man on him. Hands out at his chest, he snaps it in high and tight, sinks
     and turns his shoulder into the defender arriving, takes the shot without the ball moving, and drives on */
  possess:{len:.62,order:['A','B'],catchT:.1,B:{face:1,k:[
      [0,48,.15,.6,-.5,-.4,-.7,1.5,1.75,1.4,1.7,0],[.1,47,.25,.6,-.5,-.4,-.7,1.55,1.8,1.45,1.75,0],[.18,45,.4,.7,-.4,-.5,-.8,1.0,2.5,.9,2.55,0],
      [.28,42,.6,.85,-.35,-.55,-1.0,.75,2.75,.65,2.85,0],[.36,43,.25,.8,-.2,-.7,-1.1,.8,2.7,.7,2.8,-4],[.46,44,.5,.9,-.3,-.6,-1.0,.75,2.7,.65,2.8,-3],
      [.62,46,.35,.8,.55,-.8,-.98,.6,2.6,.7,2.7,-1]]},
    A:{face:-1,k:[
      [0,46,.45,.8,.55,-.8,-.98,1.1,1.7,1.0,1.6,26],[.1,45,.55,-.8,-.98,.8,.55,1.4,2.0,1.3,1.9,19],[.18,43,.75,.8,-.4,-.6,-1.0,1.6,2.4,1.5,2.3,13],[.24,41,.9,.75,-.45,-.65,-1.05,1.65,2.6,1.55,2.5,10],
      [.28,40,.95,.7,-.5,-.7,-1.1,1.7,2.8,1.6,2.7,10],[.36,40,1.0,.6,-.6,-.6,-1.1,1.4,2.9,1.3,2.8,9],[.46,41,.9,.6,-.5,-.6,-1.0,1.3,2.9,1.2,2.8,9],
      [.62,42,.85,.6,-.5,-.6,-1.0,1.3,2.9,1.2,2.8,8]]}},
  /* THE EDGE CATCHES, one man alone. The toe drag: at the back line he takes it high, leans back to stay in, drags his
     back toe through the paint and sits down out of bounds with it. */
  toeDrag:{len:.9,order:['B'],B:{face:1,k:[
      [0,52,-.1,.3,-.2,-.3,-.6,2.8,3.0,2.7,2.95,0],[.12,48,-.35,.5,-.1,-.6,-.95,2.5,2.9,2.4,2.8,1],[.26,43,-.55,.8,.2,-.95,-1.3,1.2,2.6,1.1,2.6,2],
      [.42,33,-.8,1.1,.5,-.5,-1.0,.6,2.4,.5,2.3,3],[.6,16,-1.2,1.6,.8,1.2,.5,.5,2.3,.4,2.2,3],[.9,14,-1.25,1.6,.8,1.2,.5,.5,2.3,.4,2.2,3]]}},
  /* the sideline: up on his toes for it, both feet tapped down in bounds, the ball pulled in, then his run carries him out */
  sideTap:{len:.62,order:['B'],B:{face:1,k:[
      [0,54,-.05,.2,-.3,-.2,-.5,2.8,3.0,2.7,2.95,0],[.1,52,-.1,.1,-.15,-.1,-.25,2.6,2.9,2.5,2.8,1],[.2,52,-.15,.05,-.1,-.05,-.2,1.6,2.6,1.5,2.5,2],
      [.32,44,.3,.9,-.2,-.6,-1.1,.6,2.4,.7,2.3,5],[.46,46,.25,.8,.55,-.8,-.98,.5,2.4,.95,2.45,8],[.62,46,.25,-.8,-.98,.8,.55,.5,2.4,-.95,.55,11]]}},
  /* THE CARRIER'S MOVES (B has the ball, A is the man trying to stop him) */
  /* truck: shoulder down into him, he's knocked onto his back, the carrier stumbles through and keeps going */
  truck:{len:.55,order:['A','B'],B:{face:1,k:[
      [0,46,.3,.8,.55,-.8,-.98,.5,2.4,.95,2.45,0],[.08,42,.85,.6,-.3,-.7,-1.1,.5,2.4,.3,1.6,4],[.16,42,.75,-.6,-1.0,.7,.1,.5,2.4,1.2,1.8,8],
      [.28,44,.55,.8,.3,-.8,-1.1,.5,2.4,1.0,2.0,13],[.4,46,.35,-.8,-.98,.8,.55,.5,2.4,-.95,.55,18],[.55,46,.25,.8,.55,-.8,-.98,.5,2.4,.95,2.45,23]]},
    A:{face:-1,k:[
      [0,44,.55,.6,-.5,-.4,-.6,.4,1.9,.3,1.7,13],[.08,42,.7,.8,-.3,-.5,-.8,1.2,1.6,1.0,1.8,10],[.16,44,-.4,.4,.1,.9,.4,2.6,3.0,2.8,3.2,14],
      [.26,34,-1.0,1.4,.7,1.1,.4,2.9,3.2,3.1,3.3,20],[.36,12,-1.5,1.8,.7,1.5,.5,2.9,3.2,3.1,3.3,24],[.42,17,-1.4,2.45,1.25,2.1,.95,2.7,3.0,2.9,3.2,26],
      [.55,9,-1.55,2.0,.8,1.6,.4,2.6,2.9,2.4,2.7,28]]}},
  /* stiff arm: the free arm locks out into his facemask, his head snaps back, he stumbles and goes down; the ball stays in the other arm */
  stiff:{len:.5,order:['A','B'],ballArm:1,B:{face:1,k:[
      [0,46,.3,.8,.55,-.8,-.98,.9,1.6,.5,2.4,0],[.1,46,.25,-.8,-.98,.8,.55,1.45,1.5,.5,2.4,4],[.2,45,.2,.7,.4,-.7,-1.0,1.57,1.57,.5,2.4,8],
      [.32,46,.25,-.8,-.98,.8,.55,1.3,1.6,.5,2.4,13],[.5,46,.25,.8,.55,-.8,-.98,.6,1.9,.5,2.4,19]]},
    A:{face:-1,k:[
      [0,44,.6,.6,-.5,-.4,-.6,1.4,1.9,1.3,1.8,24],[.1,42,.7,.7,-.4,-.5,-.8,1.6,2.0,1.5,1.9,25],[.2,44,.1,.3,-.2,.5,.1,2.2,2.6,2.4,2.8,27],
      [.3,40,-.5,.9,.2,-.2,-.6,2.6,3.0,2.8,3.2,31],[.4,22,-1.1,1.5,.6,1.2,.4,2.9,3.2,3.1,3.3,34],[.5,9,-1.5,2.0,.8,1.6,.4,2.6,2.9,2.4,2.7,36]]}},
  /* hurdle: he dives low at the carrier's legs and the carrier goes over the top of him, lead leg out, and lands running */
  hurdle:{len:.52,order:['A','B'],B:{face:1,k:[
      [0,46,.3,.8,.55,-.8,-.98,.5,2.4,.95,2.45,0],[.08,40,.4,.7,-.6,-.3,-1.0,.5,2.4,1.5,1.8,4],[.18,66,.3,1.45,1.35,-.9,-1.7,.5,2.4,2.3,2.2,12],
      [.3,74,.3,1.5,1.4,-1.0,-1.8,.5,2.4,2.4,2.3,20],[.42,58,.3,.9,.2,-.6,-1.3,.5,2.4,1.8,1.9,28],[.52,44,.35,.7,.3,-.7,-1.0,.5,2.4,.9,2.0,34]]},
    A:{face:-1,k:[
      [0,44,.6,.6,-.5,-.4,-.6,1.3,1.9,1.2,1.8,34],[.1,30,1.1,-.4,-.9,-.9,-1.3,2.0,2.0,1.9,1.9,28],[.22,16,1.45,-1.2,-1.6,-1.4,-1.8,2.4,2.3,2.3,2.2,20],
      [.32,9,1.55,-1.3,-2.3,-1.5,-2.0,2.4,2.2,2.3,2.1,16],[.52,9,1.55,-1.3,-2.5,-1.5,-2.1,2.2,2.0,2.1,1.9,16]]}},
};
const ease=x=>x*x*(3-2*x);
function sceneAt(kfs,t){ let i=0; while(i<kfs.length-2&&t>=kfs[i+1][0]) i++; const a=kfs[i], b=kfs[Math.min(kfs.length-1,i+1)];
  const k=b[0]>a[0]?ease(clamp01((t-a[0])/(b[0]-a[0]))):0; return a.map((v,j)=>j===0?t:v+(b[j]-v)*k); }
const clamp01=v=>v<0?0:v>1?1:v;
const KFS=new Map();
/* one body in a scene, in pixels: posed straight from the numbers, no turning of a stiff figure */
function kfSprite(k,si,q,g,tilt){ g=g||0; const r=n=>Math.round(n*20)/20, key=k+si+'|'+g+'|'+(tilt||1)+'|'+q.slice(1,11).map(r).join(','); let e=KFS.get(key); if(e) return e;
  const c=KIT[k], sk=SKIN[si], cv=document.createElement('canvas'); cv.width=KW; cv.height=KH; const x=cv.getContext('2d',{willReadFrequently:true});
  x.translate(KX,KY); x.scale(PU,PU);
  let P=buildSide(r(q[2]),[[r(q[3]),r(q[4])],[r(q[5]),r(q[6])]],[[r(q[7]),r(q[8])],[r(q[9]),r(q[10])]],0); if(g) P=project(P,g,tilt);
  paint(x,P,c,sk); x.setTransform(1,0,0,1,0,0); pixelize(x,KW,KH,c,sk);
  e={img:cv,P}; KFS.set(key,e); return e; }
/* draw a whole scene at a point on the field (the carrier's feet when it began), the way it runs: 1 right, -1 left,
   'up' away up the field, 'down' toward the camera. s is pixels per sprite pixel. Returns the carrier's ball hand. */
const sceneDir=d=>d==='up'?1:d==='down'?-1:d;
function sceneSpot(sc,role,t,dir,s){ const q=sceneAt(sc[role].k,Math.min(t,sc.len)), v=dir==='up'||dir==='down';
  return {q,dx:v?0:sceneDir(dir)*q[11]*s,dy:v?-sceneDir(dir)*q[11]*s*DK:0}; }
function drawScene(ctx,kind,t,x,y,dir,s,who){ const sc=SCENES[kind], v=dir==='up'||dir==='down', ds=sceneDir(dir); let hand=null;
  const it=['A','B'].filter(role=>sc[role]).map(role=>{ const R=sc[role], {q,dx,dy}=sceneSpot(sc,role,t,dir,s), m=ds*R.face, e=kfSprite(who[role].k,who[role].si,q,v?m:0,role==='A'?-1:1);
    /* up or down the field the tackler comes in a little to one side, so neither man hides the other */
    return {role,q,m,e,bx:x+dx+(v&&role==='A'?9*s:0),gy:y+dy,oy:y+dy+(50-q[1])*PU*s}; });
  /* standing, the man further up the field goes behind; once they're going down, the scene's own order (who lands on top) */
  const order=v&&it.length>1&&it.every(i=>i.q[1]>28)?[...it].sort((a,b)=>a.gy-b.gy).map(i=>i.role):sc.order;
  for(const role of order){ const {q,m,e,bx,gy,oy}=it.find(i=>i.role===role), mx=v?1:m;
    /* the shadow covers the body where it's on the ground */
    const pts=[e.P.head,...e.P.legs.flatMap(l=>[l[2],l[3]]),e.P.legs[0][0]], xs=pts.map(p=>p[0]*PU*s*mx), lo=Math.min(...xs), hi=Math.max(...xs);
    ctx.fillStyle='rgba(0,0,0,.4)';
    if(v&&q[1]<26){ const ys=pts.map(p=>oy+p[1]*PU*s), y0=Math.min(...ys), y1=Math.max(...ys); ctx.globalAlpha=.6; ctx.beginPath(); ctx.ellipse(bx+(lo+hi)/2,(y0+y1)/2+3*s,(hi-lo)*.36+s,Math.max(2*s,(y1-y0)*.28),0,0,P2); ctx.fill(); ctx.globalAlpha=1; }
    else ctx.fillRect(Math.round(bx+lo-2*s),Math.round(gy-s),Math.round(hi-lo+4*s),Math.round(2*s));
    ctx.save(); ctx.imageSmoothingEnabled=false; ctx.translate(Math.round(bx),Math.round(oy)); if(mx<0) ctx.scale(-1,1);
    ctx.drawImage(e.img,-KX*s,-KY*s,KW*s,KH*s); ctx.restore();
    if(!sc.noBall&&role===(sc.ballRole||'B')){ const h=role==='B'?e.P.arms[sc.ballArm||0][2]:(()=>{ const a=e.P.arms[0][2], b=e.P.arms[1][2]; return [(a[0]+b[0])/2,(a[1]+b[1])/2]; })(); hand=[bx+mx*h[0]*PU*s,oy+h[1]*PU*s]; } }
  return hand; }
/* where a man's hands are, in pixels from his feet, for the ball while he catches it */
function handPoint(state,f,facing,s){ const view=facing==='up'||facing==='upL'?'back':facing==='down'?'front':'side', fi=fiOf(state,f);
  const P=bodyP(view,state,fi), a=P.arms[0][2], b=P.arms[1][2];
  const h=(state==='oneHand'||state==='reach')?(a[1]<b[1]?a:b):[(a[0]+b[0])/2,(a[1]+b[1])/2], m=facing==='left'||facing==='upL'?-1:1;
  return [m*h[0]*PU*s,h[1]*PU*s]; }

