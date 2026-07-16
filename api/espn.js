export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { view, seasonId, type, scoringPeriodId } = req.query;
  const leagueId = '1327340807';
  const season   = seasonId || '2025';
  const espn_s2  = process.env.ESPN_S2;
  const swid     = process.env.ESPN_SWID;

  if (!espn_s2 || !swid) return res.status(500).json({ error: 'ESPN credentials not configured' });

  const headers = {
    'Cookie': `espn_s2=${espn_s2}; SWID=${swid}`,
    'Accept': 'application/json',
  };
  const BASE = 'https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl';
  const seasonNum   = parseInt(season, 10);
  const currentYear = new Date().getFullYear();
  const isHistory   = seasonNum < currentYear;

  // Build a league URL for a given list of views, choosing the history vs live
  // endpoint. `forceLive` lets us retry a completed-but-recent season on the
  // live endpoint (ESPN often still serves it there, and it carries data the
  // leagueHistory endpoint drops — notably the transaction log).
  function leagueURL(views, { forceLive = false } = {}) {
    const vlist = (Array.isArray(views) ? views : [views]).filter(Boolean);
    const vq = vlist.map(v => `view=${v}`).join('&');
    if (isHistory && !forceLive) {
      return `${BASE}/leagueHistory/${leagueId}?seasonId=${season}${vq ? '&' + vq : ''}`;
    }
    return `${BASE}/seasons/${season}/segments/0/leagues/${leagueId}${vq ? '?' + vq : ''}`;
  }
  const unwrap = d => (Array.isArray(d) ? (d[0] || {}) : d);

  // ── LOGO PROXY ───────────────────────────────────────────────────────────────
  // Team logos live on hosts that often block hotlinking (mystique-api uploads,
  // twimg, pinimg, etc.). Serving them through our own domain fixes that. ESPN
  // cookies are attached only for *.espn.com hosts.
  if (type === 'logo') {
    const raw = Array.isArray(req.query.url) ? req.query.url[0] : req.query.url;
    if (!raw) return res.status(400).json({ error: 'missing url' });
    let u;
    try { u = new URL(raw); } catch { return res.status(400).json({ error: 'bad url' }); }
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return res.status(400).json({ error: 'bad protocol' });
    const host = u.hostname.toLowerCase();
    if (host === 'localhost' || /^[0-9.]+$/.test(host) || host.includes(':') || host.endsWith('.local') || host.endsWith('.internal'))
      return res.status(400).json({ error: 'bad host' });
    const hdrs = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
      'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
    };
    if (host === 'espn.com' || host.endsWith('.espn.com')) hdrs.Cookie = `espn_s2=${espn_s2}; SWID=${swid}`;
    try {
      const r = await fetch(u.toString(), { headers: hdrs, redirect: 'follow' });
      if (!r.ok) return res.status(502).json({ error: `upstream ${r.status}` });
      const ct = r.headers.get('content-type') || 'image/png';
      if (!/^image\//i.test(ct) && !/svg/i.test(ct)) return res.status(415).json({ error: `not an image: ${ct}` });
      const buf = Buffer.from(await r.arrayBuffer());
      res.setHeader('Content-Type', ct);
      res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400');
      return res.status(200).send(buf);
    } catch (err) { return res.status(502).json({ error: err.message }); }
  }

  // ── YouTube RSS ──────────────────────────────────────────────────────────────
  if (type === 'youtube') {
    const channelId = 'UCUoUwKYMkspanOjX5_6d5-Q';
    try {
      const rssRes = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`);
      const xml    = await rssRes.text();
      const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)];
      const videos  = entries.slice(0, 15).map(m => {
        const b = m[1];
        return {
          videoId:   (b.match(/<yt:videoId>(.*?)<\/yt:videoId>/) || [])[1] || null,
          title:     (b.match(/<title>(.*?)<\/title>/)            || [])[1] || 'Untitled',
          published: (b.match(/<published>(.*?)<\/published>/)    || [])[1] || '',
          thumb:     (b.match(/url="(https:\/\/i\.ytimg[^"]+)"/) || [])[1] || null,
        };
      }).filter(v => v.videoId);
      return res.status(200).json({ videos });
    } catch (err) { return res.status(500).json({ error: err.message }); }
  }

  // ── RAW DIAGNOSTIC ───────────────────────────────────────────────────────────
  // Confirms the working transaction source + shows the real record shape.
  // Visit: /api/espn?type=raw&seasonId=2025
  if (type === 'raw') {
    const liveBase = `${BASE}/seasons/${season}/segments/0/leagues/${leagueId}`;
    const histBase = `${BASE}/leagueHistory/${leagueId}?seasonId=${season}`;
    // Valid TransactionType enum values (ESPN rejected "TRADE").
    const txFilterTyped = { transactions: {
      filterType: { value: ['WAIVER','FREEAGENT','TRADE_ACCEPT'] },
      limit: 2000, offset: 0,
    }};
    const txFilterAll = { transactions: { limit: 2000, offset: 0 } };

    const out = { season, probes: [] };
    async function probe(name, url, filterObj) {
      const p = { name, url };
      const hdrs = filterObj ? { ...headers, 'x-fantasy-filter': JSON.stringify(filterObj) } : headers;
      try {
        const r = await fetch(url, { headers: hdrs });
        p.status = r.status;
        if (!r.ok) { p.body = (await r.text()).slice(0, 220); out.probes.push(p); return; }
        const data = unwrap(await r.json());
        p.topLevelKeys = Object.keys(data || {});
        if (Array.isArray(data.transactions)) {
          p.transactionCount = data.transactions.length;
          p.sampleTransactions = data.transactions.slice(0, 4); // full raw objects
        }
      } catch (e) { p.error = String(e).slice(0, 200); }
      out.probes.push(p);
    }

    const topicsProbe = { topics: {
      filterType: { value: ['ACTIVITY_TRANSACTIONS'] }, limit: 25, limitPerMessageSet: { value: 25 }, offset: 0,
      sortMessageDate: { sortPriority: 1, sortAsc: false },
    }};
    await probe('hist_mTx2_typed', `${histBase}&view=mTransactions2`, txFilterTyped);
    await probe('live_mTx2_typed', `${liveBase}?view=mTransactions2`, txFilterTyped);
    await probe('hist_mTx2_all',   `${histBase}&view=mTransactions2`, txFilterAll);
    await probe('live_mTx2_all',   `${liveBase}?view=mTransactions2`, txFilterAll);
    await probe('live_comm',       `${liveBase}/communication/?view=kona_league_communication`, topicsProbe);
    // Peek at topics shape too (probe only reports `transactions`)
    try {
      const r = await fetch(`${liveBase}/communication/?view=kona_league_communication`, { headers: { ...headers, 'x-fantasy-filter': JSON.stringify(topicsProbe) } });
      out.commStatus = r.status;
      if (r.ok) {
        const d = unwrap(await r.json());
        out.commTopicCount = (d.topics || []).length;
        out.commSample = (d.topics || []).slice(0, 2);
      }
    } catch (e) { out.commError = String(e).slice(0, 200); }
    return res.status(200).json(out);
  }

  // ── Transactions (waivers / free agents / trades) — used for C2/C3 ───────────
  // Reality of ESPN's API (confirmed via the ?type=raw diagnostics for this
  // league): the detailed transaction log is only retained while a season is
  // ACTIVE. For the live season the activity/communication feed returns it; for
  // COMPLETED seasons ESPN purges the detail (mTransactions2 comes back with no
  // `transactions` key and the communication group 404s), leaving only the
  // aggregate counts. So C2/C3 can be computed for the current season but not
  // retroactively for finished ones.
  //
  // We therefore try, in order: mTransactions2 (native objects, in case a live
  // season exposes them) and the live communication feed (normalized). An
  // optional manual override (?... handled client-side) covers past seasons if
  // the user supplies data. Whatever we get is reported with its source.
  if (type === 'transactions') {
    const MSG = { 178:'ADD', 180:'ADD', 179:'DROP', 239:'DROP', 181:'DROP',
                  224:'TRADE', 225:'TRADE', 226:'TRADE', 244:'TRADE', 245:'TRADE', 246:'TRADE' };
    const txFilter = { transactions: { filterType:{ value:['WAIVER','FREEAGENT','TRADE_ACCEPT'] }, limit:2000, offset:0 } };
    const topicsFilter = { topics: {
      filterType:{ value:['ACTIVITY_TRANSACTIONS'] }, limit:1000, limitPerMessageSet:{ value:1000 }, offset:0,
      sortMessageDate:{ sortPriority:1, sortAsc:false },
      filterIncludeMessageTypeIds:{ value:[178,179,180,181,224,225,226,239,241,242,243,244,245,246,247,248,249,250,251,252,253,254,255,256,257,258,259] },
    }};
    const liveBase = `${BASE}/seasons/${season}/segments/0/leagues/${leagueId}`;
    const histBase = `${BASE}/leagueHistory/${leagueId}?seasonId=${season}`;

    function normFromComm(topics){
      const txns=[];
      (topics||[]).forEach(tp=>{
        const week = tp.scoringPeriodId ?? tp.matchupPeriodId ?? 0;
        (tp.messages||[]).forEach(m=>{
          const bucket = MSG[m.messageTypeId];
          if(!bucket || bucket==='DROP') return;
          const pid = m.targetId!=null ? Number(m.targetId) : null;
          const wk  = m.scoringPeriodId ?? week ?? 0;
          if(bucket==='ADD') txns.push({ type:'WAIVER', teamId:m.to, bidAmount:m.bidAmount??0, scoringPeriodId:wk, status:'EXECUTED', items:[{ type:'ADD', playerId:pid, toTeamId:m.to }] });
          else if(bucket==='TRADE') txns.push({ type:'TRADE_ACCEPT', teamId:m.from??m.to, scoringPeriodId:wk, status:'EXECUTED', items:[{ type:'TRADE', playerId:pid, fromTeamId:m.from, toTeamId:m.to }] });
        });
      });
      return txns;
    }

    const diag = [];
    async function attempt(name, url, filterObj, parse){
      try{
        const r = await fetch(url, { headers:{ ...headers, 'x-fantasy-filter': JSON.stringify(filterObj) } });
        if(!r.ok){ diag.push({ name, status:r.status }); return []; }
        const data = unwrap(await r.json());
        const txns = parse(data);
        diag.push({ name, status:200, count:txns.length });
        return txns;
      }catch(e){ diag.push({ name, error:String(e).slice(0,80) }); return []; }
    }

    const nativeParse = d => Array.isArray(d.transactions) ? d.transactions : [];
    const commParse   = d => normFromComm(d.topics);
    // The communication feed is worth trying even for completed se
