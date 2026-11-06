/* A LOCAL PREVIEW ON THE LIVE DATA, THAT CANNOT WRITE ANYTHING.
 *
 * `vercel dev` needs Vercel credentials and the ESPN cookies filled in by hand.
 * This needs neither: it serves public/ from disk and passes /api/* through to
 * the live site, so the page runs on today's real data with today's code on
 * disk. And it cannot change the league's records: a guard injected ahead of
 * app.js answers every Firestore write itself (reads still go through). Hot
 * Takes are kept in the page's own memory, seeded with a few examples, and so
 * are bets placed in the preview, until the page reloads.
 *
 *   node scripts/preview.mjs                    http://localhost:5178
 *   http://localhost:5178/?as=bft&team=10       the page as that account sees it --
 *                                               the local sign-in state is set, no
 *                                               password is involved
 *   http://localhost:5178/?out                  signed out again
 *
 * No service worker is served, so nothing it caches outlives the preview.
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = fileURLToPath(new URL('../public/', import.meta.url));
const LIVE = process.env.GFL_LIVE || 'https://gfl-dashboard.vercel.app';
const PORT = Number(process.env.PORT || 5178);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.mp4': 'video/mp4', '.webm': 'video/webm',
  '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };

/* Runs before config.js and app.js, so app.js's own fetch guard wraps this one. */
const GUARD = `<script>
(function(){
  var q=new URLSearchParams(location.search);
  try{
    if(q.get('as')) localStorage.setItem('gfl-me',JSON.stringify({k1:q.get('as'),k2:'',teamId:q.get('team')||''}));
    else if(q.has('out')) localStorage.removeItem('gfl-me');
  }catch(e){}
  var real=window.fetch.bind(window), now=Date.now(), seq=0;
  var take=function(min,text,anon,owner,teamId){ var f={text:{stringValue:text},ts:{stringValue:String(now-min*60000)},
    anon:{stringValue:anon?'1':'0'}}; if(!anon){ f.owner={stringValue:owner}; f.teamId={stringValue:teamId}; }
    return {id:'tkpreview'+(seq++),fields:f}; };
  /* examples only -- the preview never reads or writes the real takes */
  var takes=[take(12,'Florida Man is the best 4-4 team in fantasy history and nobody is ready to say it.',true),
    take(95,'If BFT drops another 180 I am filing a formal complaint with the commissioner. Oh wait.',false,'kunk','7'),
    take(400,'The Coaches Poll is rigged and I have the receipts.',true)];
  /* and some reactions on them, so the chips show before anyone taps */
  takes[0].fields.rx_kunk={stringValue:'fire'}; takes[0].fields.rx_ting={stringValue:'fire'};
  takes[0].fields.rx_sw={stringValue:'haha'};
  takes[1].fields.rx_mm={stringValue:'poop'}; takes[1].fields.rx_goob={stringValue:'cap'};
  var reply=function(o){ return new Response(JSON.stringify(o),{status:200,headers:{'Content-Type':'application/json'}}); };
  var docName=function(id){ return 'projects/preview/databases/(default)/documents/messages/'+id; };
  /* Bets placed in the preview are kept here, never sent, and folded into every
     bets query they match -- so placing one shows up in the ledger, the boards
     and the promotions exactly as a real one would, until the page reloads. */
  var bets=[];
  var betMatch=function(b,where){
    var f=where&&where.fieldFilter; if(!f) return false;
    var v=(b.fields[f.field.fieldPath]||{}).stringValue;
    if(f.op==='EQUAL') return v===(f.value||{}).stringValue;
    if(f.op==='IN') return (((f.value||{}).arrayValue||{}).values||[]).some(function(x){ return x.stringValue===v; });
    return false;
  };
  window.fetch=function(input,init){
    var url=String((input&&input.url)||input), m=String((init&&init.method)||(input&&input.method)||'GET').toUpperCase();
    if(url.indexOf('firestore.googleapis.com')<0) return real(input,init);
    var body=(init&&typeof init.body==='string')?init.body:'';
    if(url.indexOf(':runQuery')>=0&&body.indexOf('"collectionId":"messages"')>=0){
      var wk=(JSON.parse(body).structuredQuery.where.fieldFilter.value||{}).stringValue||'';
      return Promise.resolve(reply(takes.slice().sort(function(a,b){return Number(b.fields.ts.stringValue)-Number(a.fields.ts.stringValue);})
        .map(function(t){ var f=Object.assign({wk:{stringValue:wk}},t.fields); return {document:{name:docName(t.id),fields:f}}; })));
    }
    if(url.indexOf(':runQuery')>=0&&body.indexOf('"collectionId":"bets"')>=0&&bets.length){
      var bw=JSON.parse(body).structuredQuery.where;
      return real(input,init).then(function(r){ return r.json().then(function(j){
        var kept=bets.filter(function(b){ return betMatch(b,bw); }).map(function(b){
          return {document:{name:'projects/preview/databases/(default)/documents/bets/'+b.id,fields:b.fields}}; });
        var all=(Array.isArray(j)?j:[]).filter(function(x){ return x&&x.document; }).concat(kept);
        return reply(all.length?all:[{readTime:'preview'}]);
      }); });
    }
    if(m==='POST'&&url.indexOf('/documents/bets?')>=0){
      var bid=decodeURIComponent((url.match(/documentId=([^&]+)/)||[])[1]||('betpreview'+(seq++)));
      var bd=JSON.parse(body||'{}'); bets.push({id:bid,fields:bd.fields||{}});
      console.info('[preview] kept a bet in memory');
      return Promise.resolve(reply({name:'projects/preview/databases/(default)/documents/bets/'+bid,fields:bd.fields||{}}));
    }
    if(m==='GET'||url.indexOf(':runQuery')>=0||url.indexOf(':batchGet')>=0) return real(input,init);
    if(url.indexOf('/documents/messages')>=0){
      if(m==='POST'){ var id=(url.match(/documentId=([^&]+)/)||[])[1]||('tkpreview'+(seq++));
        var d=JSON.parse(body||'{}'); takes.push({id:id,fields:d.fields||{}}); console.info('[preview] kept a take in memory');
        return Promise.resolve(reply({name:docName(id),fields:d.fields||{}})); }
      if(m==='DELETE'){ var did=decodeURIComponent(url.split('?')[0].split('/').pop());
        takes=takes.filter(function(t){return t.id!==did;}); console.info('[preview] removed a take from memory');
        return Promise.resolve(reply({})); }
      /* a reaction: the masked fields set or cleared on the take in memory, and a
         404 for a take that is gone, as Firestore answers a patch that insists it exists */
      if(m==='PATCH'){ var pid=decodeURIComponent(url.split('?')[0].split('/').pop());
        var tk=takes.filter(function(t){return t.id===pid;})[0];
        if(!tk) return Promise.resolve(new Response(JSON.stringify({error:{code:404,status:'NOT_FOUND'}}),
          {status:404,headers:{'Content-Type':'application/json'}}));
        var pf=JSON.parse(body||'{}').fields||{};
        (url.match(/updateMask\.fieldPaths=[^&]+/g)||[]).forEach(function(p){
          var k=decodeURIComponent(p.split('=')[1]); if(pf[k]) tk.fields[k]=pf[k]; else delete tk.fields[k]; });
        console.info('[preview] kept a reaction in memory');
        return Promise.resolve(reply({name:docName(pid),fields:tk.fields})); }
    }
    console.info('[preview] write blocked: '+m+' '+url.split('?')[0]);
    return Promise.resolve(reply({}));
  };
})();
</script>`;

function send(res, status, body, type) {
  res.writeHead(status, { 'Content-Type': type || 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}

http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://preview');
  if (u.pathname.startsWith('/api/')) {
    try {
      const r = await fetch(LIVE + u.pathname + u.search, { headers: { 'Accept-Encoding': 'identity' } });
      const buf = Buffer.from(await r.arrayBuffer());
      return send(res, r.status, buf, r.headers.get('content-type') || 'application/json');
    } catch (e) { return send(res, 502, JSON.stringify({ error: e.message }), 'application/json'); }
  }
  /* a shared Build a Manager link, answered by the local api/bam.js the way
     vercel.json's rewrite sends it there on the live site */
  const share = u.pathname.match(/^\/b\/([0-9A-Za-z]+)(\/card\.png)?$/);
  if (share) {
    const { default: bam } = await import('../api/bam.js');
    const head = { 'Cache-Control': 'no-store' };
    const out = { code: 200, setHeader(k, v) { if (k.toLowerCase() !== 'cache-control') head[k] = v; },
      status(c) { this.code = c; return this; },
      send(b) { res.writeHead(this.code, head); res.end(b); }, end() { res.writeHead(this.code, head); res.end(); } };
    try { return await bam({ query: { c: share[1], img: share[2] ? '1' : undefined }, headers: req.headers }, out); }
    catch (e) { return send(res, 500, e.message); }
  }
  let p = decodeURIComponent(u.pathname);
  if (p === '/') p = '/index.html';
  if (p === '/sw.js') return send(res, 404, 'no service worker in the preview');
  const file = path.normalize(path.join(ROOT, p));
  if (!file.startsWith(path.normalize(ROOT))) return send(res, 403, 'outside public/');
  fs.readFile(file, (err, data) => {
    if (err) return send(res, 404, 'not found');
    const type = TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';
    if (p === '/index.html') data = String(data).replace('<head>', '<head>' + GUARD);
    send(res, 200, data, type);
  });
}).listen(PORT, () => console.log(`preview on http://localhost:${PORT} (api from ${LIVE}, Firestore writes blocked)`));
