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
const SKIN=[['#4a2c1b','#7a4b30','#a06a47'],['#33200f','#5a3824','#7b5035'],['#8a5a3c','#bd8864','#dcab85'],['#26160d','#43291b','#61402b']];
const SHOE=['#0f0f12','#3a3a42'], OUTC='#140e12';
const LX=-.6, LY=-.8;

function pose(view,state,ph,f){
  const fr=Math.floor(f||0)%2, run=state==='run'||state==='catch';
  if(view==='side'){
    const V=(o,a,l)=>[o[0]+l*Math.sin(a),o[1]+l*Math.cos(a)];
    const L=(h,t,c)=>{ const k=V(h,t,25), a=V(k,c,24); return [h,k,a,[a[0]+7*Math.cos(c),a[1]-7*Math.sin(c)]]; };
    let lean=.24, la, aa, fix=1;
    if(run||state==='dive'){
      const Lg=o=>{ const p=ph+o, t=.8*Math.sin(p); return [t,t-.18-1.15*Math.pow(Math.max(0,Math.cos(p-.15)),1.5)]; };
      const Ar=o=>{ const u=-.95*Math.sin(ph+o); return [u,u+1.5]; };
      la=[Lg(0),Lg(Math.PI)]; aa=[Ar(0),Ar(Math.PI)]; fix=.7;
      if(state==='catch') aa=[[2.75,2.95],[2.55,2.85]];
      if(state==='dive'){ la=[[-.25,-.45],[-.55,-.8]]; aa=[[2.4,2.25],[2.25,2.15]]; lean=.2; fix=0; } }
    else if(state==='down'){ lean=0; la=[[.04,0],[-.08,-.12]]; aa=[[2.95,3.05],[2.6,2.8]]; fix=0; }
    else if(state==='block'){ lean=.72; la=[[.55,-.5],[-.3,-.6]]; const j=fr*.1; aa=[[1.35+j,1.5+j],[1.25-j,1.45-j]]; }
    else if(state==='throw'){ const f4=Math.floor(f||0)%4; lean=[.05,-.08,.18,.32][f4]; la=f4>=2?[[.55,-.12],[-.45,-.55]]:[[.25,-.1],[-.3,-.4]];
      aa=[[[1.2,2.4],[1.0,2.2]],[[3.75,3.3],[1.6,2.4]],[[2.2,2.0],[.9,1.4]],[[.7,1.3],[.3,.9]]][f4]; }
    else if(state==='catchLow'){ lean=.3; la=[[.35,-.4],[-.2,-.5]]; aa=[[1.25,1.75],[1.15,1.7]]; }
    else if(state==='reach'){ lean=.45; la=[[.6,-.3],[-.5,-.6]]; aa=[[2.2,2.3],[2.0,2.2]]; }
    else if(state==='leap'){ lean=.1; la=[[.9,-.6],[.5,-1.1]]; aa=[[2.95,3.1],[2.8,3.0]]; fix=0; }
    else if(state==='wrap'){ lean=.95; la=[[.8,-.3],[-.45,-.75]]; aa=[[1.55,2.7],[1.45,2.6]]; }
    else if(state==='stumble'){ lean=.35; la=[[.5,-.7],[-.45,-.5]]; aa=[[1.9,1.9],[1.7,1.8]]; fix=0; }
    else if(state==='flail'){ lean=-.35; la=[[.45,-.1],[.1,-.25]]; aa=[[3.5,3.7],[3.2,3.5]]; fix=0; }
    else if(state==='truck'){ lean=.8; la=[[.75,-.4],[-.5,-.75]]; aa=[[1.25,1.0],[.35,2.0]]; }               /* shoulder down, ball tucked */
    else if(state==='stiff'){ lean=.22; la=[[.6,-.55],[-.45,-.5]]; aa=[[1.57,1.57],[.35,2.05]]; }             /* the arm locked out in front */
    else if(state==='hurdle'){ lean=.25; la=[[1.45,1.35],[-.9,-1.7]]; aa=[[2.35,2.2],[.4,1.7]]; fix=0; }       /* front leg out flat, back leg tucked */
    else if(state==='oneHand'){ lean=.3; la=[[.5,-.45],[-.45,-.5]]; aa=[[2.95,3.1],[.3,1.0]]; }
    else if(state==='tiptoe'){ lean=-.05; la=[[.06,-.25],[-.06,-.3]]; aa=[[2.75,2.95],[2.55,2.85]]; }
    else if(state==='wings'){ legs=[lg(-6,-8,-24,-9,-2.6),lg(6,8,-24,9,-2.6)]; arms=[[[-15,sY+1],[-29,-78],[-42,-82]],[[15,sY+1],[29,-78],[42,-82]]]; }
  else if(state==='flex'){ lean=0; la=[[.15,-.1],[-.15,-.2]]; aa=[[1.6,3.4],[1.5,3.3]]; }
    else if(state==='drag'){ lean=-.25; la=[[.55,-.3],[-.2,-.5]]; aa=[[2.15,2.0],[1.95,1.9]]; }          /* leaning back, both hands on the collar */
    else if(state==='bow'){ lean=.95; la=[[.1,-.1],[-.2,-.3]]; aa=[[.9,.4],[.7,.3]]; }
    else if(state==='wings'){ lean=0; la=[[.15,-.1],[-.15,-.2]]; aa=[[2.0,1.8],[1.9,1.7]]; }
    else if(state==='celebrate'){ lean=-.1; la=fr?[[.9,-.5],[.4,-1.2]]:[[.15,-.1],[-.15,-.2]]; aa=[[3.0,3.1],[2.8,3.0]]; fix=fr?0:1; }
    else if(state==='stance3'){ lean=1.32; la=[[1.3,-.3],[.95,-.6]]; aa=[[.12,-.05],[.6,.35]]; }
    else { lean=.5; la=[[.6,-.35],[.4,-.5]]; aa=[[.5,.25],[.42,.2]]; }
    let legs=la.map(([t,c])=>L([0,-50],t,c)), dy=0;
    if(fix){ const low=Math.max(...legs.flatMap(l=>[l[2][1],l[3][1]])); dy=(-1.5-low)*fix; }
    const H=[0,-50+dy]; legs=la.map(([t,c])=>L(H,t,c));
    const up=[Math.sin(lean),-Math.cos(lean)], fw=[Math.cos(lean),Math.sin(lean)];
    const T=(a,b)=>[H[0]+fw[0]*a+up[0]*b, H[1]+fw[1]*a+up[1]*b], S=T(.5,30);
    const arms=aa.map(([u,fa])=>{ const e=V(S,u,17); return [S,e,V(e,fa,16)]; });
    return {view,legs,arms,torso:[T(-5.5,-1),T(6,-1),T(10,17),T(12.5,27),T(8,35),T(-8,35.5),T(-11,28),T(-7.5,14)],
      pants:[T(-5.8,4),T(5.8,4),T(6.4,-7),T(-6.4,-7)],neck:[T(.5,31),T(1.6,38)],head:T(2.2,42.5),top:[5,4]};
  }
  let sw=0, hip=-50, sY=-80, legs, arms, hd=null;
  const lg=(x,kx,ky,ax,ay)=>[[x,hip],[kx,ky],[ax,ay],[ax,ay+2.6]];
  if(run){ const la=Math.max(0,Math.sin(ph)), lb=Math.max(0,-Math.sin(ph)); sw=1.6*Math.sin(ph); hip=-50+1.2*Math.cos(2*ph); sY=hip-30;
    legs=[lg(-5.5,-6.4,-25-9*la,-6.6,-2-16*la),lg(5.5,6.4,-25-9*lb,6.6,-2-16*lb)];
    arms=state==='catch'?[[[-15,sY+1],[-15,-99],[-8.5,-112]],[[15,sY+1],[15,-99],[8.5,-112]]]
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
  else if(state==='leap'){ legs=[lg(-5.5,-8,-32,-7,-14),lg(5.5,8,-30,7,-16)]; arms=[[[-15,sY+1],[-13,-100],[-8,-116]],[[15,sY+1],[13,-100],[8,-116]]]; }
  else if(state==='oneHand'){ sw=2; legs=[lg(-5.5,-6.5,-25,-6.5,-2.6),lg(5.5,8,-27,10,-6)]; arms=[[[-15+sw,sY+1],[-18,-60],[-15,-46]],[[15+sw,sY+1],[20,-98],[24,-115]]]; }
  else if(state==='tiptoe'){ legs=[lg(-4,-3.8,-26,-3.6,-5),lg(4,3.8,-26,3.6,-5)]; arms=[[[-15,sY+1],[-15,-99],[-8.5,-112]],[[15,sY+1],[15,-99],[8.5,-112]]]; }
  else if(state==='wings'){ legs=[lg(-6,-8,-24,-9,-2.6),lg(6,8,-24,9,-2.6)]; arms=[[[-15,sY+1],[-29,-78],[-42,-82]],[[15,sY+1],[29,-78],[42,-82]]]; }
  else if(state==='flex'){ hip=-48; sY=-78; legs=[lg(-7,-9,-24,-10,-2.6),lg(7,9,-24,10,-2.6)]; arms=[[[-15,sY+1],[-26,-74],[-23,-93]],[[15,sY+1],[26,-74],[23,-93]]]; }
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
const RUNF=10, SW=48, SH=48, GX=24, GY=43, PU=.36;
const rgb=c=>[parseInt(c.slice(1,3),16),parseInt(c.slice(3,5),16),parseInt(c.slice(5,7),16)];
function renderSprite(k,view,state,fi,num,si){
  const c=KIT[k], sk=SKIN[si], cv=document.createElement('canvas'); cv.width=SW; cv.height=SH; const x=cv.getContext('2d',{willReadFrequently:true});
  x.translate(GX,GY); x.scale(PU,PU);
  if(state==='dive'){ x.translate(-34,-16); x.rotate(1.15); } else if(state==='down'){ x.translate(-46,-6); x.rotate(Math.PI/2); }
  else if(state==='fallF'){ const k=Math.min(2,fi); x.translate(-[8,24,40][k],0); x.rotate([.35,.8,1.2][k]); }
  else if(state==='fallB'){ const k=Math.min(2,fi); x.translate([8,24,40][k],0); x.rotate(-[.3,.7,1.1][k]); }
  else if(state==='downB'){ x.translate(44,-6); x.rotate(-Math.PI/2); }
  const ps={fallF:'stumble',fallB:'flail',downB:'flail'}[state]||state;
  const P=pose(view,ps,(state==='run'||state==='catch')?fi/RUNF*P2:0,fi);
  paint(x,P,c,sk); x.setTransform(1,0,0,1,0,0);
  const pal=[...c.jersey,...c.pants,...c.helmet,c.stripe,c.acc,...c.sock,c.band,'#9a9da3','#111111',...c.glove,c.mask,...sk,...SHOE,OUTC].map(rgb);
  const id=x.getImageData(0,0,SW,SH), d=id.data, on=new Uint8Array(SW*SH);
  for(let i=0;i<SW*SH;i++){ const o=i*4; if(d[o+3]<120){ d[o+3]=0; continue; } on[i]=1; let best=0,bd=1e9;
    for(let j=0;j<pal.length;j++){ const p=pal[j], e=(p[0]-d[o])**2+(p[1]-d[o+1])**2+(p[2]-d[o+2])**2; if(e<bd){ bd=e; best=j; } }
    d[o]=pal[best][0]; d[o+1]=pal[best][1]; d[o+2]=pal[best][2]; d[o+3]=255; }
  const oc=rgb(OUTC);
  for(let y=0;y<SH;y++) for(let xx=0;xx<SW;xx++){ const i=y*SW+xx; if(on[i]) continue;
    if((xx>0&&on[i-1])||(xx<SW-1&&on[i+1])||(y>0&&on[i-SW])||(y<SH-1&&on[i+SW])){ const o=i*4; d[o]=oc[0]; d[o+1]=oc[1]; d[o+2]=oc[2]; d[o+3]=255; } }
  if(num!=null&&view!=='side'&&state!=='dive'&&state!=='down'){ const s=String(num).slice(-2), w=s.length*4-1, x0=Math.round(GX+P.num[0]*PU-w/2), y0=Math.round(GY+P.num[1]*PU-2), nc=rgb(c.num);
    [...s].forEach((dg,i)=>D3[dg].split('|').forEach((row,r)=>[...row].forEach((ch,cc)=>{ if(ch!=='#') return; const px=x0+i*4+cc, py=y0+r; if(px<0||py<0||px>=SW||py>=SH) return; const o=(py*SW+px)*4; d[o]=nc[0]; d[o+1]=nc[1]; d[o+2]=nc[2]; }))); }
  x.putImageData(id,0,0);
  return cv; }
const SPR=new Map();
function sprite(k,view,state,fi,num,si){ const key=k+view+state+fi+':'+num+':'+si; let s=SPR.get(key); if(!s){ s=renderSprite(k,view,state,fi,num,si); SPR.set(key,s); } return s; }
/* draw a man standing on a point; s is whole pixels per sprite pixel. f runs 0 to 8 through a stride. */
const SIDE_ONLY=new Set(['dive','down','fallF','fallB','downB','wrap','truck','stiff','hurdle','drag','bow']);
function drawPlayer(ctx,k,num,x,y,facing,state,f,s,lift){
  const view=SIDE_ONLY.has(state)?'side':facing==='up'||facing==='upL'?'back':facing==='down'?'front':'side';
  const fi=(state==='run'||state==='catch')?Math.floor(((f||0)%8+8)%8/8*RUNF)%RUNF:state==='throw'?Math.floor(f||0)%4:(state==='fallF'||state==='fallB')?Math.min(2,Math.floor(f||0)):Math.floor(f||0)%2;
  const img=sprite(k,view,state,fi,null,((num||0)*7)%SKIN.length);
  ctx.save(); ctx.imageSmoothingEnabled=false; ctx.translate(Math.round(x),Math.round(y));
  const sw=(state==='down'||state==='downB')?34:(state==='dive'||state==='fallF'||state==='fallB')?22:12, sh=lift>0?Math.max(6,sw-lift/3):sw;
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
