/* ═══ HEAD TO HEAD ═══
   A quick game against another manager, one drive at a time. You invite them with the time, the weather and how both
   teams are built; they accept or decline. Once both teams are built, the one who sent the invite has the ball first:
   he plays his drive, it's sent over, the other watches it in the drive view and plays his own, and so on to the end.

   THE STORE. The only Season Mode feature that touches Firestore, and it keeps that small:
     live/pvp_<id>      one game: the invite, the rules, both teams and every drive so far (one document)
     live/pvpbox_<tid>  one manager's list of his games, each with whose move it is (so "your move" costs one read)
   Reads happen when you open the list, open a game, or are waiting on the other side's drive (one document every 15 s,
   slowing to a minute, and stopping after half an hour). Nothing reads on a redraw. A drive costs about three reads and
   three writes. Inside the app the frame's fetch goes through the app's own read meter. */
const PVP_DB={project:'ball-and-chain-dashboard',key:'AIzaSyCOfZYqsD3VZmym7AW0DDX_JQnBYCZhJDA'};
try{ if(window.parent!==window&&typeof parent.fsGovern==='function') parent.fsGovern(window); }catch(e){}
/* who can be invited: the teams Season Mode is open to (by team id) */
const PVP_TEAMS=['1','10'];
const pvpUrl=id=>`https://firestore.googleapis.com/v1/projects/${PVP_DB.project}/databases/(default)/documents/live/${encodeURIComponent(id)}?key=${PVP_DB.key}`;
async function pvpGet(id){ const r=await fetch(pvpUrl(id),{cache:'no-store'}); if(r.status===404) return null; if(!r.ok) throw new Error('read '+r.status);
  const d=await r.json(); try{ return JSON.parse((d.fields&&d.fields.j&&d.fields.j.stringValue)||'null'); }catch(e){ return null; } }
async function pvpPut(id,obj,kind){ const r=await fetch(pvpUrl(id),{method:'PATCH',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({fields:{kind:{stringValue:kind},j:{stringValue:JSON.stringify(obj)},at:{stringValue:String(Date.now())}}})});
  if(!r.ok) throw new Error('write '+r.status); }
const pvpLoad=id=>pvpGet('pvp_'+id);
const pvpSave=g=>{ g.updated=Date.now(); return pvpPut('pvp_'+g.id,g,'pvp'); };
const pvpTid=()=>String(new URLSearchParams(location.search).get('team')||(ME&&ME.teamId)||'');
const pvpMe=()=>({tid:pvpTid(),name:ME.name,logo:ME.logo||null});
const pvpRoleOf=g=>g.a.tid===pvpTid()?'a':'b';
/* the seen marker: how many of a game's drives this device has already shown */
const pvpSeenGet=id=>{ try{ return +localStorage.getItem('gfl-pvp-seen-'+id)||0; }catch(e){ return 0; } };
function pvpSeen(id,n){ try{ localStorage.setItem('gfl-pvp-seen-'+id,String(n)); }catch(e){} }
/* a manager's list: one entry a game, with whose move it is */
async function pvpBoxSet(tid,entry){ const b=(await pvpGet('pvpbox_'+tid))||{games:[]}; const i=b.games.findIndex(x=>x.id===entry.id);
  if(i>=0) b.games[i]=Object.assign(b.games[i],entry); else b.games.unshift(entry); b.games=b.games.slice(0,24); await pvpPut('pvpbox_'+tid,b,'pvpbox'); }
async function pvpBoxes(g,patch){ const ent=side=>{ const o=g[side==='a'?'b':'a']; return Object.assign({id:g.id,opp:{tid:o.tid,name:o.name,logo:o.logo},role:side,st:g.status,turn:g.status==='invited'?g.b.tid:g.status==='active'?g[g.next].tid:'',score:g.score||null,at:Date.now()},patch||{}); };
  await Promise.all([pvpBoxSet(g.a.tid,ent('a')),pvpBoxSet(g.b.tid,ent('b'))]); }
/* a drive goes on the end of the game, read fresh first; a retry never adds the same drive twice */
async function pvpAppend(id,rec){ const g=await pvpLoad(id); if(!g) throw new Error('no game');
  if(!g.drives.some(d=>d.k===rec.k)) g.drives.push(rec);
  g.next=rec.next; if(rec.done){ g.status='done'; } g.score={a:rec.after.score.a,b:rec.after.score.b};
  await pvpSave(g); await pvpBoxes(g); return g; }

/* ═══ THE LIST ═══ */
let PVP_BUILD=null, PVP_FORCE=null, PVP_BOX=null;
const pvpTeams=()=>{ const by={}; TEAMS.forEach(t=>{ const k=String(t.teamId); if(!by[k]||(t.first||0)>(by[k].first||0)) by[k]=t; });
  return PVP_TEAMS.filter(k=>k!==pvpTid()&&by[k]).map(k=>({tid:k,name:by[k].name,logo:by[k].logo||null})); };
async function pvpBadge(){ const el=document.querySelectorAll('[data-pvp]'); if(!el.length) return; try{ PVP_BOX=(await pvpGet('pvpbox_'+pvpTid()))||{games:[]}; }catch(e){ return; }
  const n=PVP_BOX.games.filter(x=>x.turn===pvpTid()&&x.st!=='done'&&x.st!=='declined').length; el.forEach(b=>{ const s=b.querySelector('.pv-n'); if(s) s.remove(); if(n) b.insertAdjacentHTML('beforeend',`<span class="pv-n">${n}</span>`); }); }
async function pvpHub(){ screen('match'); const back=()=>{ if(typeof resume==='function'&&resume()) hub('next'); else setupScreen(); };
  $('#scr-match').innerHTML=`<div class="mu pv"><div class="pv-top"><button class="btn" id="pv-back">Back</button><b>Head to head</b><button class="btn w" id="pv-new">New game</button></div><div class="pv-list" id="pv-list"><div class="lg-empty">Loading</div></div></div>`;
  $('#pv-back').onclick=back; $('#pv-new').onclick=()=>pvpNew();
  let box=null; try{ box=(await pvpGet('pvpbox_'+pvpTid()))||{games:[]}; }catch(e){ if($('#pv-list')) $('#pv-list').innerHTML='<div class="lg-empty">Couldn’t load your games</div>'; return; }
  PVP_BOX=box; const me=pvpTid(); if(!$('#pv-list')) return;   /* the list was left before it loaded */
  if(!box.games.length){ $('#pv-list').innerHTML='<div class="lg-empty">No games yet</div>'; return; }
  $('#pv-list').innerHTML=box.games.map(x=>{ const yours=x.turn===me, sc=x.score?`${x.score[x.role]}–${x.score[x.role==='a'?'b':'a']}`:'';
    const st=x.st==='invited'?(x.role==='b'?'Invited you':'Invite sent'):x.st==='declined'?'Declined':x.st==='done'?'Final '+sc:yours?'Your move'+(sc?' · '+sc:''):'Their move'+(sc?' · '+sc:'');
    const act=x.st==='invited'&&x.role==='b'?`<button class="btn w" data-acc="${x.id}">Accept</button><button class="btn" data-dec="${x.id}">Decline</button>`:x.st==='active'||x.st==='done'?`<button class="btn${yours?' w':''}" data-open="${x.id}">${x.st==='done'?'See it':yours?'Play':'Watch'}</button>`:'';
    return `<div class="pv-g${yours&&x.st!=='done'?' you':''}"><span class="pv-c">${crest(x.opp)}</span><span class="pv-t"><b>${esc(x.opp.name)}</b><small>${st}</small></span><span class="pv-a">${act}</span></div>`; }).join('');
  document.querySelectorAll('[data-acc]').forEach(b=>b.onclick=()=>pvpAccept(b.dataset.acc));
  document.querySelectorAll('[data-dec]').forEach(b=>b.onclick=()=>pvpDecline(b.dataset.dec));
  document.querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>pvpOpen(b.dataset.open)); }

/* ═══ THE INVITE ═══ the opponent, the time, the weather, and how both teams are built */
function pvpNew(){ const opps=pvpTeams(); if(!opps.length) return toastS('Nobody else can play yet');
  const R={opp:opps[0].tid,time:'night',wx:'clear',mode:'spin',pos:['any','any','any','any','any','any'],pack:{legend:1,gold:1,silver:1,bronze:2},dst:'any'};
  const TI=['any','bronze','silver','gold','legend'], TL={any:'Random',bronze:'Bronze',silver:'Silver',gold:'Gold',legend:'Legend'};
  const seg=(k,opts)=>`<div class="qs-seg" data-k="${k}">${opts.map(([v,l])=>`<button type="button" class="${R[k]===v?'on':''}" data-v="${v}">${l}</button>`).join('')}</div>`;
  const draw=()=>{ const tot=Object.values(R.pack).reduce((a,b)=>a+b,0);
    $('#scr-match').innerHTML=`<div class="mu pv"><div class="pv-top"><button class="btn" id="pv-back">Back</button><b>New game</b><span></span></div>
      <span class="qs-l">Opponent</span><div class="pv-opps">${opps.map(o=>`<button type="button" class="pv-o${R.opp===o.tid?' on':''}" data-o="${o.tid}">${crest(o)}<b>${esc(o.name)}</b></button>`).join('')}</div>
      <span class="qs-l">Time</span>${seg('time',[['day','Day'],['dusk','Dusk'],['night','Night']])}
      <span class="qs-l">Weather</span>${seg('wx',[['clear','Clear'],['rain','Rain'],['snow','Snow']])}
      <span class="qs-l">Teams</span>${seg('mode',[['spin','Spin every spot'],['pos','Pick per spot'],['pack','One pack']])}
      ${R.mode==='pos'?`<div class="pv-pos">${SLOTS.slice(0,5).map((s,i)=>`<label><span>${s}</span><select data-i="${i}">${TI.map(t=>`<option value="${t}"${R.pos[i]===t?' selected':''}>${TL[t]}</option>`).join('')}</select></label>`).join('')}</div>`:''}
      ${R.mode==='pack'?`<div class="pv-pack">${['legend','gold','silver','bronze'].map(t=>`<div class="t-${t}"><span>${TL[t]}</span><button type="button" data-m="${t}">−</button><b>${R.pack[t]}</b><button type="button" data-p="${t}">+</button></div>`).join('')}<small class="${tot===5?'':'bad'}">${tot} of 5</small></div>`:''}
      <span class="qs-l">Defense</span>${seg('dst',TI.map(t=>[t,TL[t]]))}
      <button class="btn w" id="pv-go"${R.mode==='pack'&&tot!==5?' disabled':''}>Build my team</button></div>`;
    $('#pv-back').onclick=()=>pvpHub();
    document.querySelectorAll('.pv-o').forEach(b=>b.onclick=()=>{ R.opp=b.dataset.o; draw(); });
    document.querySelectorAll('.qs-seg').forEach(g=>g.querySelectorAll('button').forEach(b=>b.onclick=()=>{ R[g.dataset.k]=b.dataset.v; draw(); }));
    document.querySelectorAll('.pv-pos select').forEach(s=>s.onchange=()=>{ R.pos[+s.dataset.i]=s.value; });
    document.querySelectorAll('[data-p]').forEach(b=>b.onclick=()=>{ if(Object.values(R.pack).reduce((a,c)=>a+c,0)<5){ R.pack[b.dataset.p]++; draw(); } });
    document.querySelectorAll('[data-m]').forEach(b=>b.onclick=()=>{ if(R.pack[b.dataset.m]>0){ R.pack[b.dataset.m]--; draw(); } });
    $('#pv-go').onclick=()=>{ const rules={mode:R.mode,pos:R.pos.slice(0,5).concat(R.dst),pack:{...R.pack},dst:R.dst}, o=opps.find(x=>x.tid===R.opp);
      pvpBuild(rules,async team=>{ const g={id:Date.now().toString(36)+Math.random().toString(36).slice(2,7),v:1,created:Date.now(),status:'invited',time:R.time,wx:R.wx,rules,
          a:Object.assign(pvpMe(),{team}),b:{tid:o.tid,name:o.name,logo:o.logo,team:null},next:'a',drives:[],score:{a:0,b:0}};
        try{ await pvpSave(g); await pvpBoxes(g); toastS('Invite sent to '+o.name); }catch(e){ toastS('Couldn’t send the invite'); } pvpHub(); }); }; };
  draw(); }
function toastS(s){ let t=document.getElementById('pv-toast'); if(!t){ t=document.createElement('div'); t.id='pv-toast'; t.className='pv-toast'; document.body.appendChild(t); } t.textContent=s; t.classList.add('show'); clearTimeout(toastS.t); toastS.t=setTimeout(()=>t.classList.remove('show'),2400); }

/* ═══ BUILDING A TEAM UNDER THE INVITE'S RULES ═══
   spin: a spin at every spot; pos: each spot random or a set tier; pack: one pack of five with the tiers chosen, dealt to
   random spots like the season pack, then the defense: a spin, at the tier the invite sets or any tier */
function pvpBuild(rules,done){ QUICK=false; SETUP=null; PVP_BUILD={rules,done}; DR.i=0; DR.got=[];
  if(rules.mode==='pack'){ const tz=[]; Object.entries(rules.pack).forEach(([t,n])=>{ for(let i=0;i<n;i++) tz.push(t); }); PVP_FORCE=[null,null,null,null,null,rules.dst&&rules.dst!=='any'?rules.dst:null]; return seasonPack(tz.sort(()=>Math.random()-.5)); }
  const dz=rules.dst||rules.pos[5]||'any'; PVP_FORCE=(rules.mode==='pos'?rules.pos.slice(0,5):[0,0,0,0,0].map(()=>'any')).concat(dz).map(t=>t==='any'?null:t); screen('draft'); stageSpin(); }
function pvpBuilt(){ const b=PVP_BUILD; PVP_BUILD=null; PVP_FORCE=null; const got=DR.got.slice(0,6);
  b.done({five:got.slice(0,5).map(slim),dst:got[5]&&{id:got[5].id,n:got[5].n,pos:'D/ST',season:got[5].season,r:got[5].r,a:got[5].a}}); }

/* ═══ ACCEPT, DECLINE, PLAY ═══ */
async function pvpAccept(id){ let g; try{ g=await pvpLoad(id); }catch(e){ return toastS('Couldn’t load the game'); } if(!g||g.status!=='invited') return pvpHub();
  pvpBuild(g.rules,async team=>{ try{ const f=await pvpLoad(id); f.b=Object.assign(f.b,{team,name:ME.name,logo:ME.logo||f.b.logo}); f.status='active'; f.next='a'; await pvpSave(f); await pvpBoxes(f); toastS('Game on: their ball first'); }catch(e){ toastS('Couldn’t accept'); } pvpHub(); }); }
async function pvpDecline(id){ try{ const g=await pvpLoad(id); if(g&&g.status==='invited'){ g.status='declined'; await pvpSave(g); await pvpBoxes(g,{turn:''}); } }catch(e){ toastS('Couldn’t decline'); } pvpHub(); }
async function pvpOpen(id){ let g; try{ g=await pvpLoad(id); }catch(e){ return toastS('Couldn’t load the game'); } if(!g||!g.a.team||!g.b.team) return pvpHub();
  const role=pvpRoleOf(g), me=g[role], op=g[role==='a'?'b':'a'];
  DR.got=[...me.team.five,me.team.dst]; QUICK=false;
  CPU={name:op.name,logo:op.logo,roster:op.team.five,dst:op.team.dst};
  const meT=Object.assign({},ME,{name:me.name,logo:me.logo||ME.logo});
  const [mine,theirs]=await Promise.all([logoColors(meT),logoColors(CPU)]), home=role==='a';
  const [hk,ak]=dressFor(home?mine:theirs,home?theirs:mine); setKits(home?hk:ak,home?ak:hk);
  screen('game'); MATCH.start({team:CPU,dst:CPU.dst,off:offR(CPU),home,label:'Head to head',mustWin:false,lineup:DR.got.slice(0,5),time:g.time,rain:g.wx==='rain',snow:g.wx==='snow',pvp:{id:g.id,role,doc:g}}); }
