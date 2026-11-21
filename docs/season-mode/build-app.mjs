/* Builds the app's copy of Season Mode from the concept: public/season/.
 *   node docs/season-mode/build-app.mjs
 * The concept (concept-v6.html and the v6-*.js beside it) stays the source. This writes the game alone, with no
 * concept notes and no players panel, sized to fill the frame the BFT's Season Mode tab puts it in, plus the data
 * it reads and every team's crest. */
import fs from 'node:fs';
const D = new URL('./', import.meta.url), OUT = new URL('../../public/season/', import.meta.url);
fs.mkdirSync(new URL('logos/', OUT), { recursive: true });
const read = f => fs.readFileSync(new URL(f, D), 'utf8');
const cut = (s, a, b, rep = '') => { const i = s.indexOf(a), j = s.indexOf(b, i); if (i < 0 || j < 0) throw new Error('missing ' + a); return s.slice(0, i) + rep + s.slice(j); };
const put = (s, a, b) => { if (!s.includes(a)) throw new Error('missing ' + a.slice(0, 80)); return s.split(a).join(b); };

let h = read('concept-v6.html');
h = put(h, '<title>Season Mode · concept 6</title>', '<title>GFL Seasons</title>');
h = put(h, '--dots:url(/theme-dots.svg); --spark:url(/theme-sparks.svg);', '--dots:url(/theme/site/dots.svg); --spark:url(/theme/site/sparks-a.svg);');
/* the game fills its frame */
h = put(h, '  @media (prefers-reduced-motion:reduce)', `  html,body{height:100%;overflow:hidden;}
  body>.phone{width:100%;max-width:none;height:100%;border:0;margin:0;}
  .closed{height:100%;display:flex;align-items:center;justify-content:center;padding:24px;text-align:center;color:var(--text3);font:500 11px var(--mono);letter-spacing:.1em;text-transform:uppercase;}
  @media (prefers-reduced-motion:reduce)`);
/* no concept notes, no players panel: the body is the phone */
h = cut(h, '<div class="page">', '      <div class="phone" id="app">');
h = cut(h, '      <div class="side">', '<script>', '');
h = put(h, '      <div class="phone" id="app">', '<div class="phone" id="app">');
h = h.replace(/(<div class="scr" id="scr-final"><\/div>\n      <\/div>\n)/, '$1');
h = h.replace(/      <\/div>\n    <\/div>\n  <\/section>\n<\/div>\n\n/, '');
h = put(h, '<script src="v6-pvp.js"></script>', '<script src="pvp.js"></script>');
h = put(h, '<script src="v6-sprites.js"></script>\n<script src="v6-engine.js"></script>\n<script src="v6-match.js"></script>\n<script src="v6-season.js"></script>', '<script src="sprites.js"></script>\n<script src="engine.js"></script>\n<script src="match.js"></script>\n<script src="season.js"></script>');
/* BFT only for now: the page checks the sign-in the app already keeps on this device */
h = put(h, `(async()=>{
  const j=u=>fetch(u).then(r=>r.json());`, `(async()=>{
  const me=(()=>{ try{ return JSON.parse(localStorage.getItem('gfl-me')||'null'); }catch(e){ return null; } })();
  /* BFT and Marathon Men (team 1) both play everything */
  const full=!!me&&(me.k1==='bft'||String(me.teamId)==='1'), quick=false;
  if(!full&&!quick){ document.getElementById('app').innerHTML='<div class="closed">GFL Seasons isn\\'t open yet</div>'; return; }
  QUICK_ONLY=!full; window.ACH_ON=!!me&&me.k1==='bft'; window.ACCT=me&&me.k1?String(me.k1):null;   /* the account the season's cloud copy is kept under */   /* achievements: the BFT's for now */
  const j=u=>fetch(u).then(r=>r.json());`);
h = put(h, `ME=TEAMS.find(t=>/Bryan/.test(t.name))||TEAMS[0];`, `const tid=new URLSearchParams(location.search).get('team');
  /* team ids are reused across seasons: the newest name to hold the id is the team now */
  ME=TEAMS.filter(t=>tid&&String(t.teamId)===tid).sort((a,b)=>(b.first||0)-(a.first||0))[0]||TEAMS.find(t=>/Bryan/.test(t.name))||TEAMS[0];
  /* the app hands over the team's name and logo as they are now: a rename or a new picture shows up (new seasons take it;
     a season already under way keeps what it started with) */
  { const qp=new URLSearchParams(location.search), qn=qp.get('name'), ql=qp.get('logo'); if(qn||ql) ME=Object.assign({},ME,qn?{name:qn}:{},ql?{logo:ql}:{}); }`);
/* the players panel's drawing goes; the boot keeps its close */
h = cut(h, '  /* the sheet: the players close up', '})();\n</script>', '');
fs.writeFileSync(new URL('index.html', OUT), h);

for (const [a, b] of [['v6-sprites.js', 'sprites.js'], ['v6-engine.js', 'engine.js'], ['v6-match.js', 'match.js'], ['v6-season.js', 'season.js'], ['v6-pvp.js', 'pvp.js']]) fs.copyFileSync(new URL(a, D), new URL(b, OUT));
for (const f of ['rated.json', 'defenses.json', 'attrs.json']) fs.copyFileSync(new URL(f, D), new URL(f, OUT));
/* the game-day pictures: six pixel stadiums */
fs.mkdirSync(new URL('art2/', OUT), { recursive: true });
for (const f of fs.readdirSync(new URL('art2/', D))) fs.copyFileSync(new URL('art2/' + f, D), new URL('art2/' + f, OUT));
/* every team's crest: any of them can be in your league, and its kit colours come from it */
const teams = JSON.parse(read('teams.json'));
teams.forEach(t => { if (t.logo && fs.existsSync(new URL(t.logo, D))) fs.copyFileSync(new URL(t.logo, D), new URL(t.logo, OUT)); else t.logo = null; });
fs.writeFileSync(new URL('teams.json', OUT), JSON.stringify(teams));
console.log('built public/season/', fs.readdirSync(OUT).join(' '));
