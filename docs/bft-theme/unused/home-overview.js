/* ═══════════════════════════════════════════════════════════════════════════
   THE BFT HOMEPAGE. A page of its own, not the league's homepage restyled.

   Loaded only for the bft account (meTheme in app.js). It builds #bx-home
   beside the league's #page-home and theme.css shows one in place of the
   other. Nothing here is shared with the old page's markup: every class
   starts bx-.

   WHAT IT READS is what the app already holds: the week's games and their
   win-probability curves, the standings, the Coaches Poll, your balance, and
   which homepage jobs are still open (HOME_TODO). It makes no request of its
   own, to ESPN or to Firestore.

   THE JOBS THEMSELVES (the ballot, the picks, the pick'em, the questions, the
   notifications, the forecast's lineups) are still the app's own modules.
   A tap opens one over the page as a sheet (bxOpen): #page-home shown full
   screen with only that module in it.

   app.js calls window.ME_HOME whenever something the homepage shows may have
   changed. Each part is redrawn only when what it would say has changed.
   ═══════════════════════════════════════════════════════════════════════════ */
(function(){
  'use strict';
  const ME='bft';
  const $=id=>document.getElementById(id);
  const esc=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
  const safe=(fn,d)=>{ try{ const v=fn(); return v==null?d:v; }catch(e){ return d; } };
  const ord=n=>{ const s=['th','st','nd','rd'], v=n%100; return n+(s[(v-20)%10]||s[v]||s[0]); };
  const ab=t=>String((t&&(t.abbrev||t.name))||'').toUpperCase().slice(0,4);
  const calm=()=>matchMedia('(prefers-reduced-motion:reduce)').matches;

  /* the jobs, in the order the page lists them */
  const JOBS=[
    {id:'cp-sec', t:'Coaches Poll',  c:'yellow', open:'Rank the twelve before the ballots close.', go:'Fill in your ballot', draw:()=>renderCoachesPoll()},
    {id:'pk-sec', t:'Matchup Picks', c:'sky',    open:'Call this week’s six games.',            go:'Make your picks',     draw:()=>renderWeekPicks()},
    {id:'pe-sec', t:'Daily Pick’em', c:'red', open:'Today’s head-to-head is open.',        go:'Pick today’s',   draw:()=>pkeRender()},
    {id:'bk-sec', t:'Ball Knowledge',c:'orange', open:'Today’s question is waiting.',          go:'Answer it',           draw:()=>renderBallKnowledge()},
    {id:'nt-sec', t:'Notifications', c:'sky',    open:'Something new since you last looked.',       go:'Read them',           draw:()=>renderNotifications()},
  ];
  const FC={id:'fc-sec', t:'Your Forecast', draw:()=>renderForecastCard()};

  /* ── what the page is about to say ──────────────────────────────────────── */
  function read(){
    if(typeof _me==='undefined'||!_me||_me.k1!==ME) return null;
    const info=safe(()=>_liveInfo||liveWeekInfo(),null);
    const teams=safe(()=>_teams,[])||[];
    if(!info||!teams.length) return null;
    const mine=Number(_me.teamId), T=id=>teams.find(t=>t.id===id);
    const games=(info.games||[]).filter(m=>m&&m.home&&m.away).map(m=>{
      const c=safe(()=>{ const p=fcCurveFor(info,m.home.teamId,m.away.teamId); return p[p.length-1]; },null)||{a:0,b:0,p:0.5};
      return {h:T(m.home.teamId), a:T(m.away.teamId), hp:Number(c.a)||0, ap:Number(c.b)||0, p:Number(c.p), mine:m.home.teamId===mine||m.away.teamId===mine};
    }).filter(g=>g.h&&g.a);
    const me=T(mine), g=games.find(x=>x.mine)||null;
    const order=safe(()=>standingsOrder(),teams), byPf=[...teams].sort((x,y)=>y.pf-x.pf);
    const todo=safe(()=>HOME_TODO,[]);
    const done=id=>{ const t=todo.find(x=>x.id===id); return t?safe(()=>!!t.done(),true):true; };
    return {info, teams, me, mine, games, g, order, byPf, done,
      poll:safe(()=>pollRankNow(),{}), bal:safe(()=>bucksBalance(),null), balOk:safe(()=>bucksReady(),false),
      iq:safe(()=>bkIQFor(mine),null), nt:safe(()=>ntLive().length,0)};
  }
  const pct=p=>{ const v=p*100; return (v<10||v>90?v.toFixed(1):Math.round(v))+'%'; };

  /* ── the parts ──────────────────────────────────────────────────────────── */
  function heroHTML(d){
    const wk=d.info.week, live=d.info.inProgress;
    let a='Week '+wk+'.', b='No game on the slate for you this week.';
    if(d.g&&d.me){
      const home=d.g.h.id===d.mine, opp=home?d.g.a:d.g.h, my=home?d.g.hp:d.g.ap, their=home?d.g.ap:d.g.hp;
      const p=Number.isFinite(d.g.p)?(home?d.g.p:1-d.g.p):0.5, gap=Math.abs(my-their).toFixed(1);
      if(my>0||their>0){
        a=my>their?`You lead ${opp.name} by ${gap}.`:my<their?`You trail ${opp.name} by ${gap}.`:`Level with ${opp.name}.`;
        b=live?`${my.toFixed(1)} to ${their.toFixed(1)}, and ${pct(p)} to win.`:`${my.toFixed(1)} to ${their.toFixed(1)}. Final.`;
      }else{
        a=`Week ${wk}: ${opp.name} is next.`;
        b=`${pct(p)} to win, by the B&C ratings.`;
      }
    }
    return `<div class="bx-fx bx-fall" style="--c:var(--bx-sky)" aria-hidden="true"><i></i><i></i><i></i></div>
      <span class="bx-eyebrow">Week ${wk}${live?' · in progress':''}</span>
      <h1 class="bx-h1">${esc(a)}<br><span>${esc(b)}</span></h1>
      <div class="bx-btns">
        <button class="bx-btn bx-btn-w" onclick="bxOpen('fc-sec')">Your forecast <i>→</i></button>
        <button class="bx-btn" onclick="switchTab('book')">Sportsbook</button>
      </div>`;
  }
  /* the board's lines for a width of `cols` tiles: text, and a class per tile */
  function boardLines(d,cols){
    const wide=cols>=34, dec=cols>=23;
    const pts=v=>v>0?(dec?v.toFixed(1):String(Math.round(v))):'';
    const lines=[{s:'',k:''}];
    d.games.forEach(g=>{
      const pw=dec?5:3, aw=wide?6:4;
      const L=ab(g.a).padEnd(aw)+' '+pts(g.ap).padStart(pw), R=ab(g.h).padEnd(aw)+' '+pts(g.hp).padStart(pw);
      const s=L+(wide?'   →   ':' → ')+R, pad=Math.max(0,Math.floor((cols-s.length)/2));
      const arrow=pad+L.length+(wide?3:1);
      lines.push({s:' '.repeat(pad)+s, k:g.mine?'me':'', arrow, lead:g.hp===g.ap?0:(g.ap>g.hp?-1:1), mid:arrow});
    });
    const st=d.info.inProgress?'IN PROGRESS':'FINAL', wk='WEEK '+d.info.week, pad=Math.max(0,Math.floor((cols-23)/2));
    lines.push({s:'',k:''},{s:' '.repeat(pad)+wk,k:'dim'},{s:' '.repeat(pad)+st,k:''},{s:'',k:''});
    return lines;
  }
  function statsHTML(d){
    const me=d.me; if(!me) return '';
    const rank=d.order.findIndex(t=>t.id===d.mine)+1, pfRank=d.byPf.findIndex(t=>t.id===d.mine)+1, n=d.teams.length;
    const stat=(num,unit,title,desc,go)=>`<button class="bx-stat" onclick="${go}">
        <b>${num}${unit?`<em>${unit}</em>`:''}</b><span>${title}</span><small>${desc}</small></button>`;
    const out=[
      stat(`${me.wins}–${me.losses}${me.ties?'–'+me.ties:''}`,'','Record',`${ord(rank)} of ${n} in the standings.`,"switchTab('standings')"),
      stat(me.pf.toLocaleString(undefined,{minimumFractionDigits:1,maximumFractionDigits:1}),'pts','Points for',pfRank===1?'The most in the league.':`${ord(pfRank)} most in the league.`,"switchTab('standings')"),
    ];
    if(d.poll[d.mine]) out.push(stat('#'+d.poll[d.mine],'','Coaches Poll','Where the league’s ballots put you.',"bxOpen('cp-sec')"));
    if(d.balOk&&d.bal!=null) out.push(stat('$'+Math.round(d.bal).toLocaleString(),'','GFL Bucks','Free to stake in the Sportsbook.',"switchTab('book')"));
    else if(d.iq!=null) out.push(stat(String(Math.round(d.iq)),'','Ball Knowledge',esc(safe(()=>bkIQLabel(d.iq),'')),"switchTab('leaders')"));
    return out.join('');
  }
  function jobsHTML(d){
    const open=JOBS.filter(j=>!d.done(j.id)), shut=JOBS.filter(j=>d.done(j.id));
    const cards=open.length
      ? `<div class="bx-cards">${open.map((j,i)=>`<button class="bx-card" style="--c:var(--bx-${j.c})" onclick="bxOpen('${j.id}')">
          <span class="bx-fade" aria-hidden="true"><span class="bx-tw"><b></b><i></i><i></i><i></i></span></span>
          <span class="bx-card-t">${j.t}<sup>${String(i+1).padStart(2,'0')}</sup></span>
          <span class="bx-card-d">${j.id==='nt-sec'&&d.nt?`${d.nt} new since you last looked.`:j.open}</span>
          <span class="bx-link">${j.go} <i>↗</i></span></button>`).join('')}</div>`
      : `<div class="bx-clear"><span class="bx-fade" aria-hidden="true"><span class="bx-dots"></span></span>
          <b>Nothing is waiting on you.</b><span>Every ballot, pick and question for the week is in.</span></div>`;
    const rows=[{id:FC.id,t:FC.t,s:'Lineups and the curve'}].concat(shut.map(j=>({id:j.id,t:j.t,s:'Done'})))
      .map(r=>`<button class="bx-row" onclick="bxOpen('${r.id}')"><span>${r.t}</span><em>${r.s}</em><u>View <i>↗</i></u></button>`).join('');
    return cards+`<div class="bx-rows">${rows}</div>`;
  }
  function pollHTML(d){
    const ranked=d.teams.filter(t=>d.poll[t.id]).sort((x,y)=>d.poll[x.id]-d.poll[y.id]);
    if(!ranked.length) return '';
    return ranked.map(t=>`<button class="bx-cell${t.id===d.mine?' me':''}" onclick="openTeamProfile(${t.id})">
        <small>${String(d.poll[t.id]).padStart(2,'0')}</small>${safe(()=>avatarHTML(t,40,8),'')}<span>${esc(ab(t))}</span></button>`).join('');
  }
  function barsHTML(d){
    const top=Math.max(1,...d.byPf.map(t=>t.pf));
    return d.byPf.map(t=>`<div class="bx-bar${t.id===d.mine?' me':''}" style="--w:${(100*t.pf/top).toFixed(1)}%"><u><i></i></u>
        <span>${esc(ab(t))}</span><em>${t.pf.toLocaleString(undefined,{minimumFractionDigits:1,maximumFractionDigits:1})}</em></div>`).join('');
  }

  /* ── THE BOARD: tiles whose letters flip through others before they settle ── */
  const GLYPHS='ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.+';
  const board={el:null,cols:0,rows:0,tiles:[],cur:[],busy:new Map(),timer:null,
    size(el,rows){
      const cols=Math.max(19,Math.min(58,Math.floor((el.clientWidth+2)/13.8)));
      if(el===this.el&&cols===this.cols&&rows===this.rows&&this.tiles[0]&&this.tiles[0].isConnected) return;
      this.el=el; this.cols=cols; this.rows=rows;
      el.style.gridTemplateColumns=`repeat(${cols},1fr)`;
      el.innerHTML='<span></span>'.repeat(cols*rows);
      this.tiles=[...el.children]; this.cur=[]; this.busy.clear();
    },
    set(lines){
      lines.forEach((ln,y)=>{
        const s=(ln.s||'').padEnd(this.cols).slice(0,this.cols);
        for(let x=0;x<this.cols;x++){
          const el=this.tiles[y*this.cols+x]; if(!el) continue;
          const ch=s[x], cls=ch==='→'?'ar':(ln.k||''), key=ch+'|'+cls, i=y*this.cols+x;
          if(this.cur[i]===key) continue;
          this.cur[i]=key; el.className=cls;
          if(ch===' '||calm()){ el.textContent=ch===' '?'':ch; this.busy.delete(el); continue; }
          this.busy.set(el,{ch,left:5+Math.floor(Math.random()*9)+Math.floor((y*3+x)/3)});
        }
      });
      if(this.busy.size&&!this.timer) this.timer=setInterval(()=>this.tick(),45);
    },
    tick(){
      this.busy.forEach((v,el)=>{
        if(--v.left<=0){ el.textContent=v.ch; this.busy.delete(el); }
        else if(v.left<12) el.textContent=GLYPHS[Math.floor(Math.random()*GLYPHS.length)];
      });
      if(!this.busy.size){ clearInterval(this.timer); this.timer=null; }
    }};

  /* ── putting it on the page ─────────────────────────────────────────────── */
  const SHELL=`
    <section class="bx-hero" id="bx-hero"></section>
    <div class="bx-band bx-band-dots"><span class="bx-dots"></span></div>
    <section class="bx-sec"><span class="bx-tag" id="bx-board-tag">Scoreboard</span>
      <div class="bx-board" id="bx-board" role="img" aria-label="This week's scores"></div></section>
    <section class="bx-sec bx-sec-h"><h2 class="bx-h2">Your season,<br>by the numbers.</h2></section>
    <div class="bx-stats" id="bx-stats"></div>
    <div class="bx-band bx-band-ticks"></div>
    <section class="bx-sec bx-sec-h"><span class="bx-tag">To do</span><h2 class="bx-h2">What the league<br>needs from you.</h2></section>
    <div id="bx-jobs"></div>
    <div class="bx-band bx-band-dots"><span class="bx-dots"></span></div>
    <section class="bx-grid-wrap"><span class="bx-tag">Coaches Poll</span><div class="bx-grid" id="bx-poll"></div></section>
    <div class="bx-band bx-band-dots"><span class="bx-dots"></span></div>
    <section class="bx-sec"><span class="bx-tag">Points for</span><h2 class="bx-h2">The league,<br>by points.</h2>
      <div class="bx-bars" id="bx-bars"></div>
      <button class="bx-link bx-link-b" onclick="switchTab('standings')">Full standings <i>↗</i></button></section>
    <div class="bx-band bx-band-ticks"></div>
    <div class="bx-word" aria-hidden="true"><strong>GFL</strong></div>
    <nav class="bx-foot">
      <button onclick="switchTab('week')">Schedule</button><button onclick="switchTab('standings')">Standings</button>
      <button onclick="switchTab('book')">Sportsbook</button><button onclick="switchTab('punishment')">Punishments</button>
    </nav>`;
  let seen=null;
  function put(id,html){ const el=$(id); if(el&&el._bx!==html){ el.innerHTML=html; el._bx=html; return true; } return false; }
  function watch(root){
    if(!('IntersectionObserver' in window)){ root.querySelectorAll('.bx-bars').forEach(e=>e.classList.add('bx-in')); return; }
    if(!seen) seen=new IntersectionObserver(es=>es.forEach(e=>{
      e.target.classList.toggle('bx-off',!e.isIntersecting);
      if(e.isIntersecting) e.target.classList.add('bx-in');
    }),{threshold:0.12});
    root.querySelectorAll('.bx-hero,.bx-card,.bx-bars').forEach(el=>{ if(!el._bxw){ el._bxw=1; seen.observe(el); } });
  }
  function render(){
    const old=$('page-home'); let root=$('bx-home');
    const d=read();
    if(!d||!old){ if(root&&(typeof _me==='undefined'||!_me||_me.k1!==ME)) root.remove(); return; }
    if(!root||root.nextElementSibling!==old){
      if(root) root.remove();
      root=document.createElement('div'); root.id='bx-home'; root.innerHTML=SHELL;
      old.parentNode.insertBefore(root,old);
    }
    put('bx-hero',heroHTML(d));
    put('bx-board-tag',`Week ${d.info.week} · scoreboard`);
    const b=$('bx-board'); if(b){ board.size(b,d.games.length+5); board.set(boardLines(d,board.cols)); }
    put('bx-stats',statsHTML(d));
    put('bx-jobs',jobsHTML(d));
    put('bx-poll',pollHTML(d));
    put('bx-bars',barsHTML(d));
    watch(root);
  }

  /* ── A JOB, OPENED OVER THE PAGE ────────────────────────────────────────── */
  function bxOpen(id){
    const job=[FC].concat(JOBS).find(j=>j.id===id), sec=$(id); if(!job||!sec) return;
    let bar=$('bx-bar');
    if(!bar){ bar=document.createElement('div'); bar.id='bx-bar'; document.body.appendChild(bar); }
    bar.innerHTML=`<button onclick="bxClose()" aria-label="Back to your homepage"><i>←</i> Home</button><span>${job.t}</span>`;
    const root=document.documentElement; root.dataset.bx=id; root.classList.add('bx-sheet');
    const page=$('page-home'); if(page) page.scrollTop=0;
    safe(()=>modalLock(true));
    safe(job.draw);                       // drawn while hidden, it had no size to measure
    document.addEventListener('keydown',onKey);
  }
  function bxClose(){
    const root=document.documentElement; if(!root.classList.contains('bx-sheet')) return;
    root.classList.remove('bx-sheet'); delete root.dataset.bx;
    safe(()=>modalLock(false));
    document.removeEventListener('keydown',onKey);
    render();
  }
  function onKey(e){ if(e.key==='Escape') bxClose(); }
  addEventListener('resize',()=>{ if($('bx-board')) render(); });

  window.bxOpen=bxOpen; window.bxClose=bxClose;
  window.ME_HOME=function(){
    /* off the homepage, or signed out: an open sheet has nothing to sit on */
    if(typeof _activeTab!=='undefined'&&_activeTab!=='home') bxClose();
    render();
  };
  render();
})();
