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

  // ── YOUTUBE SOURCE (shared) ──────────────────────────────────────────────────
  // YouTube's RSS feed 404s Vercel's IPs, but the channel page serves normally,
  // so read the feed when it answers and parse the page when it doesn't. Both
  // paths return the same shape.
  const YT_CHANNEL = 'UCUoUwKYMkspanOjX5_6d5-Q';
  const ytHeaders = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
    'Accept-Language': 'en-US,en;q=0.9', 'Accept': '*/*',
  };
  const ytDecode = s => String(s || '')
    .replace(/\\u0026/g, '&').replace(/\\"/g, '"').replace(/\\n/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'").replace(/&quot;/g, '"');
  const ytThumb = id => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

  async function ytFromRSS() {
    for (const u of [
      `https://www.youtube.com/feeds/videos.xml?channel_id=${YT_CHANNEL}&hl=en`,
      `https://www.youtube.com/feeds/videos.xml?channel_id=${YT_CHANNEL}`,
    ]) {
      try {
        const r = await fetch(u, { headers: ytHeaders });
        if (!r.ok) continue;
        const xml = await r.text();
        if (!xml.includes('<entry>')) continue;
        const list = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].slice(0, 15).map(m => {
          const b = m[1];
          const id = (b.match(/<yt:videoId>(.*?)<\/yt:videoId>/) || [])[1] || null;
          if (!id) return null;
          return {
            videoId: id,
            title: ytDecode((b.match(/<title>(.*?)<\/title>/) || [])[1] || 'Untitled'),
            published: (b.match(/<published>(.*?)<\/published>/) || [])[1] || null,
            ageText: null,
            thumb: (b.match(/url="(https:\/\/i\.ytimg[^"]+)"/) || [])[1] || ytThumb(id),
            description: ytDecode((b.match(/<media:description>([\s\S]*?)<\/media:description>/) || [])[1] || ''),
          };
        }).filter(Boolean);
        if (list.length) return list;
      } catch (e) { /* next url */ }
    }
    return null;
  }

  async function ytFromChannelPage(attempt = 0) {
    try {
      const urls = [
        `https://www.youtube.com/channel/${YT_CHANNEL}/videos?hl=en`,
        `https://m.youtube.com/channel/${YT_CHANNEL}/videos?hl=en`,
        `https://www.youtube.com/channel/${YT_CHANNEL}/videos?hl=en&gl=US`,
      ];
      const r = await fetch(urls[attempt % urls.length], { headers: ytHeaders });
      if (!r.ok) return attempt < 3 ? ytFromChannelPage(attempt + 1) : null;
      const html = await r.text();
      const out = [], seen = new Set();
      const re = /"videoId":"([\w-]{11})"/g;
      let m;
      while ((m = re.exec(html)) && out.length < 15) {
        const id = m[1];
        if (seen.has(id)) continue;
        const win = html.slice(m.index, m.index + 1600);
        const title = (win.match(/"title":\{"runs":\[\{"text":"((?:[^"\\]|\\.)*)"/) ||
                       win.match(/"title":\{"simpleText":"((?:[^"\\]|\\.)*)"/) || [])[1];
        if (!title) continue;                    // shelves and related rails have no title here
        seen.add(id);
        out.push({
          videoId: id, title: ytDecode(title), published: null,
          ageText: (win.match(/"publishedTimeText":\{"simpleText":"([^"]+)"/) || [])[1] || null,
          thumb: ytThumb(id), description: '',
        });
      }
      if (out.length) return out;
      return attempt < 3 ? ytFromChannelPage(attempt + 1) : null;
    } catch (e) { return attempt < 3 ? ytFromChannelPage(attempt + 1) : null; }
  }

  // last resort: the snapshot committed at public/data/videos.json, refreshed by
  // the scheduled GitHub Action. Keeps the widget and the video list populated
  // even when YouTube refuses every request from this IP.
  async function ytFromSnapshot(req) {
    try {
      const host = req.headers['x-forwarded-host'] || req.headers.host;
      if (!host) return null;
      const proto = (req.headers['x-forwarded-proto'] || 'https').split(',')[0];
      const r = await fetch(`${proto}://${host}/data/videos.json`);
      if (!r.ok) return null;
      const j = await r.json();
      const list = Array.isArray(j) ? j : (j.videos || []);
      return list.length ? list.map(v => ({ ageText: null, description: '', thumb: ytThumb(v.videoId), ...v, stale: true })) : null;
    } catch (e) { return null; }
  }

  // the watch page carries the description that matchup detection reads
  async function ytDescription(id) {
    try {
      const r = await fetch(`https://www.youtube.com/watch?v=${id}&hl=en`, { headers: ytHeaders });
      if (!r.ok) return '';
      const html = await r.text();
      return ytDecode((html.match(/"shortDescription":"((?:[^"\\]|\\.)*)"/) || [])[1] || '');
    } catch (e) { return ''; }
  }

  async function ytVideos({ withDescription = true } = {}) {
    const list = (await ytFromRSS()) || (await ytFromChannelPage()) || (await ytFromSnapshot(req)) || [];
    if (withDescription && list.length && !list[0].description) {
      list[0].description = await ytDescription(list[0].videoId);
    }
    return list;
  }

  // ── WIDGET PAYLOAD ───────────────────────────────────────────────────────────
  // One compact document for the iPhone home-screen widget: the newest Ball &
  // Chain video, a badge colour that rotates every week, and the matchup the
  // video is about (detected from its title/description, same as the site).
  // Visit: /api/widget  or  /api/espn?type=widget
  if (type === 'widget') {
    const BADGE_COLORS = ['#3fd07a','#5aa9ff','#E0B67B','#e879f9','#33d6c4','#ff8f5a','#b58cff','#a3e635'];
    // ISO-ish week index, stable for everyone in the league
    const isoWeek = d => {
      const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
      t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
      const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
      return Math.ceil((((t - y0) / 86400000) + 1) / 7);
    };
    const now = new Date();
    const week = isoWeek(now);
    const badge = { text: 'New B&C Video', color: BADGE_COLORS[(week + now.getUTCFullYear()) % BADGE_COLORS.length], week };

    const out = { generated: now.toISOString(), season, badge, video: null, matchup: null };

    // newest video
    try {
      const v = (await ytVideos())[0];
      if (v) {
        out.video = {
          videoId: v.videoId,
          title: v.title,
          description: v.description || '',
          published: v.published || null,
          ageDays: v.published ? Math.max(0, Math.floor((now - new Date(v.published)) / 86400000)) : null,
          ageText: v.ageText || null,
          thumb: `https://i.ytimg.com/vi/${v.videoId}/maxresdefault.jpg`,
          thumbFallback: `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`,
          url: `https://www.youtube.com/watch?v=${v.videoId}`,
        };
      }
    } catch (err) { out.videoError = err.message; }

    // teams for the current season, then find the two named in the video
    try {
      const r = await fetch(leagueURL(['mTeam','mSettings'], { forceLive: true }), { headers });
      if (r.ok) {
        const d = unwrap(await r.json());
        const teams = (d.teams || []).map(t => ({
          id: t.id,
          name: (t.name || `${t.location || ''} ${t.nickname || ''}`).trim(),
          wins: t.record?.overall?.wins ?? 0,
          losses: t.record?.overall?.losses ?? 0,
          pf: Math.round((t.record?.overall?.pointsFor ?? 0) * 10) / 10,
        }));
        out.week = d.status?.currentMatchupPeriod ?? null;
        const text = ((out.video?.description || '') + ' ' + (out.video?.title || '')).toLowerCase();
        if (text.trim() && teams.length) {
          const STOP = new Set(['team','the','football','fantasy','league','man','and','for','with','3rd','leg']);
          const hits = [];
          teams.forEach(t => {
            const words = t.name.toLowerCase().split(/\s+/).filter(w => w.length > 2 && !STOP.has(w));
            let firstIdx = Infinity, n = 0;
            words.forEach(w => { const i = text.indexOf(w); if (i >= 0) { n++; firstIdx = Math.min(firstIdx, i); } });
            if (n > 0) hits.push({ t, firstIdx });
          });
          hits.sort((x, y) => x.firstIdx - y.firstIdx);
          const seen = new Set(), pick = [];
          hits.forEach(hh => { if (!seen.has(hh.t.id)) { seen.add(hh.t.id); pick.push(hh.t); } });
          if (pick.length >= 2) out.matchup = { a: pick[0], b: pick[1] };
        }
        out.standings = teams.slice().sort((x, y) =>
          (y.wins - y.losses) - (x.wins - x.losses) || y.pf - x.pf).slice(0, 3);
      }
    } catch (err) { out.teamsError = err.message; }

    res.setHeader('Cache-Control', out.video
      ? 'public, max-age=300, s-maxage=900, stale-while-revalidate=86400'
      : 'public, max-age=15, s-maxage=30');
    return res.status(200).json(out);
  }

  // ── YouTube RSS ──────────────────────────────────────────────────────────────
  if (type === 'youtube') {
    try {
      const videos = await ytVideos();
      res.setHeader('Cache-Control', videos.length
        ? 'public, max-age=300, s-maxage=1800, stale-while-revalidate=86400'
        : 'public, max-age=15, s-maxage=30');
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
  // ESPN only retains the detailed transaction log while a season is ACTIVE.
  // For completed seasons mTransactions2 comes back without a `transactions`
  // key. We try every plausible source and report which one worked; the client
  // falls back to inferring transactions from weekly roster diffs when all of
  // these come back empty.
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
    // The communication feed is worth trying even for completed seasons — ESPN's
    // retention there varies, and when it works it's the only per-player record.
    const sources = isHistory
      ? [ ['hist_mTx2', `${histBase}&view=mTransactions2`, txFilter, nativeParse],
          ['live_mTx2', `${liveBase}?view=mTransactions2`, txFilter, nativeParse],
          ['live_comm', `${liveBase}/communication/?view=kona_league_communication`, topicsFilter, commParse] ]
      : [ ['live_mTx2', `${liveBase}?view=mTransactions2`, txFilter, nativeParse],
          ['live_comm', `${liveBase}/communication/?view=kona_league_communication`, topicsFilter, commParse] ];

    try{
      let txns=[], source='none';
      for(const [name,url,f,p] of sources){
        txns = await attempt(name, url, f, p);
        if(txns.length){ source=name; break; }
      }
      res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate');
      return res.status(200).json({ transactions:txns, _source:source, _count:txns.length, _diag:diag });
    }catch(err){ return res.status(500).json({ error:err.message, transactions:[], _diag:diag }); }
  }

  // ── Player scoring per week — used for C2/C3 calculation ────────────────────
  // players[pid] = { pts, slot, started, team, n, pos }
  //   pts  = ACTUAL fantasy points that week (statSourceId 0), start or bench
  //   slot = lineupSlotId that week (starters vs bench for C3)
  //   team = teamId that rostered the player that week
  if (type === 'playerscores') {
    const week = parseInt(scoringPeriodId || '1', 10);
    // Always use the seasons/{year} endpoint: unlike leagueHistory, it returns
    // TRUE week-specific rosters for completed seasons (verified back to 2022).
    const url  = leagueURL('mRoster', { forceLive: true }) + `${leagueURL('mRoster', { forceLive: true }).includes('?') ? '&' : '?'}scoringPeriodId=${week}`;
    try {
      const r  = await fetch(url, { headers });
      const data = unwrap(await r.json());
      const BENCH_SLOTS = [20, 21, 24]; // bench, IR, taxi/reserve
      const players = {};
      (data.teams || []).forEach(team => {
        (team.roster?.entries || []).forEach(e => {
          const pid = e.playerId;
          if (pid == null) return;
          const stats = e.playerPoolEntry?.player?.stats || [];
          const wk = stats.find(s => s.statSourceId === 0 && s.scoringPeriodId === week);
          const pts = wk?.appliedTotal ?? e.playerPoolEntry?.appliedStatTotal ?? 0;
          players[pid] = {
            pts,
            slot: e.lineupSlotId,
            started: !BENCH_SLOTS.includes(e.lineupSlotId),
            team: team.id,
            n: e.playerPoolEntry?.player?.fullName || null,
            pos: e.playerPoolEntry?.player?.defaultPositionId ?? null,
          };
        });
      });
      return res.status(200).json({ week, players });
    } catch (err) { return res.status(500).json({ error: err.message }); }
  }

  // ── Season tenure — every week's roster for a season, aggregated ─────────────
  // Response: { season, teams: { [teamId]: { [playerId]: { n, w, s, p } } } }
  //   n = player name, w = weeks rostered, s = weeks started, p = points scored
  //   while on that roster (start or bench).
  // ── Single player's weekly games with GFL matchup context ────────────────────
  //   /api/espn?type=playergames&seasonId=2024&playerId=4243537
  if (type === 'playergames') {
    const pid = parseInt(req.query.playerId, 10);
    if (!pid) return res.status(400).json({ error: 'playerId required' });
    const BENCH_SLOTS = [20, 21, 24];
    const REC = 53, YDS = 42, TD = 43;
    try {
      // schedule for matchup context
      const schedRes = await fetch(leagueURL('mMatchup'), { headers });
      const sched = (unwrap(await schedRes.json()).schedule) || [];
      const weekIds = Array.from({ length: 18 }, (_, i) => i + 1);
      const rosters = await Promise.all(weekIds.map(async w => {
        try {
          const r = await fetch(leagueURL('mRoster', { forceLive: true }) + `&scoringPeriodId=${w}`, { headers });
          if (!r.ok) return null;
          return { week: w, data: unwrap(await r.json()) };
        } catch { return null; }
      }));
      const finalWeek = (() => { for (const rr of rosters) if (rr?.data?.status?.finalScoringPeriod) return rr.data.status.finalScoringPeriod; return 17; })();
      const games = [];
      let name = null;
      rosters.forEach(rr => {
        if (!rr || rr.week > finalWeek) return;
        (rr.data.teams || []).forEach(team => {
          const e = (team.roster?.entries || []).find(x => x.playerId === pid);
          if (!e) return;
          const pl = e.playerPoolEntry?.player || {};
          name = pl.fullName || name;
          const st = (pl.stats || []).find(x => x.statSourceId === 0 && x.scoringPeriodId === rr.week);
          if (!st) return; // bye / didn't play
          const raw = st.stats || {};
          const started = !BENCH_SLOTS.includes(e.lineupSlotId);
          // matchup context
          let opp = null, tp = null, op = null;
          const mu = sched.find(m => m.matchupPeriodId === rr.week && m.home && m.away &&
            (m.home.teamId === team.id || m.away.teamId === team.id));
          if (mu) {
            const home = mu.home.teamId === team.id;
            tp = (home ? mu.home.totalPoints : mu.away.totalPoints) || 0;
            op = (home ? mu.away.totalPoints : mu.home.totalPoints) || 0;
            opp = home ? mu.away.teamId : mu.home.teamId;
          }
          games.push({
            week: rr.week, teamId: team.id, started,
            pts: +(st.appliedTotal ?? 0).toFixed(1),
            rec: raw[REC] || 0, yds: raw[YDS] || 0, td: raw[TD] || 0,
            oppTeamId: opp, teamPts: tp != null ? +tp.toFixed(1) : null, oppPts: op != null ? +op.toFixed(1) : null,
            result: (tp != null && op != null) ? (tp > op ? 'W' : tp < op ? 'L' : 'T') : null,
          });
        });
      });
      res.setHeader('Cache-Control', isHistory
        ? 'public, max-age=300, s-maxage=2592000, stale-while-revalidate=86400'
        : 'public, max-age=300, s-maxage=3600, stale-while-revalidate=3600');
      return res.status(200).json({ season, playerId: pid, name, games });
    } catch (err) { return res.status(500).json({ error: err.message, games: [] }); }
  }

  if (type === 'seasontenure') {
    const BENCH_SLOTS = [20, 21, 24];
    const weekIds = Array.from({ length: 18 }, (_, i) => i + 1);
    try {
      const weekResults = await Promise.all(weekIds.map(async w => {
        try {
          const r = await fetch(leagueURL('mRoster', { forceLive: true }) + `&scoringPeriodId=${w}`, { headers });
          if (!r.ok) return null;
          return { week: w, data: unwrap(await r.json()) };
        } catch { return null; }
      }));
      const finalWeek = (() => {
        for (const wr of weekResults) if (wr?.data?.status?.finalScoringPeriod) return wr.data.status.finalScoringPeriod;
        return 17;
      })();
      // Playoff wins by week/team: which teams won a playoff matchup each week.
      const poWin = {};
      try {
        const sr = await fetch(leagueURL(['mMatchup', 'mTeam', 'mSettings']), { headers });
        if (sr.ok) {
          const sd = unwrap(await sr.json());
          const mpc = sd.settings?.scheduleSettings?.matchupPeriodCount;
          const REG_END = (mpc >= 8 && mpc <= 18) ? mpc : 14; // playoffs start after the regular season
          const pt = sd.settings?.scheduleSettings?.playoffTeamCount || sd.settings?.playoffTeamCount || 6;
          const seed = {}; (sd.teams || []).forEach(t => { seed[t.id] = t.playoffSeed || 0; });
          const inBracket = id => { const sd2 = seed[id] || 0; return sd2 > 0 && sd2 <= pt; };
          (sd.schedule || []).forEach(mu => {
            if ((mu.matchupPeriodId || 0) <= REG_END) return;       // regular season -> skip
            if (!mu.home || !mu.away) return;                       // bye -> not a game won
            if (!inBracket(mu.home.teamId) || !inBracket(mu.away.teamId)) return; // consolation -> skip
            const hp = mu.home.totalPoints || 0, ap = mu.away.totalPoints || 0;
            if (hp === 0 && ap === 0) return;                       // not played
            const wk = mu.matchupPeriodId;
            const winId = (mu.winner === 'HOME' || (mu.winner == null && hp > ap)) ? mu.home.teamId
                        : (mu.winner === 'AWAY' || (mu.winner == null && ap > hp)) ? mu.away.teamId : null;
            if (winId != null) (poWin[wk] || (poWin[wk] = {}))[winId] = true;
          });
        }
      } catch {}
      const teams = {};
      weekResults.forEach(wr => {
        if (!wr || wr.week > finalWeek) return;
        (wr.data.teams || []).forEach(team => {
          const bucket = teams[team.id] || (teams[team.id] = {});
          (team.roster?.entries || []).forEach(e => {
            const pid = e.playerId;
            if (pid == null) return;
            const stats = e.playerPoolEntry?.player?.stats || [];
            const wk = stats.find(s => s.statSourceId === 0 && s.scoringPeriodId === wr.week);
            const pts = wk?.appliedTotal ?? 0;
            // Exclude bye weeks (no game that week → no statSourceId 0 line) and
            // weeks the player was injured/out (IR lineup slot, or an OUT-type
            // injury status). Those weeks don't count toward tenure.
            const onBye = !wk;
            const st = String(e.injuryStatus || e.playerPoolEntry?.player?.injuryStatus || '').toUpperCase();
            const outStatuses = ['OUT', 'INJURY_RESERVE', 'IR', 'SUSPENSION', 'PUP', 'NON_FOOTBALL_INJURY'];
            const injuredOut = e.lineupSlotId === 21 || outStatuses.includes(st);
            const available = !onBye && !injuredOut;
            const rec = bucket[pid] || (bucket[pid] = { n: null, pos: null, w: 0, s: 0, p: 0, sp: 0, pw: 0 });
            rec.n = e.playerPoolEntry?.player?.fullName || rec.n;
            if (rec.pos == null) rec.pos = e.playerPoolEntry?.player?.defaultPositionId ?? null;
            rec.p += pts;
            if (available) {
              rec.w++;
              if (!BENCH_SLOTS.includes(e.lineupSlotId)) { rec.s++; rec.sp += pts; if (poWin[wr.week] && poWin[wr.week][team.id]) rec.pw++; }  // started; playoff win credit
            }
          });
        });
      });
      // Past seasons never change — cache hard. Current season: 1h.
      res.setHeader('Cache-Control', isHistory
        ? 'public, max-age=300, s-maxage=2592000, stale-while-revalidate=86400'
        : 'public, max-age=300, s-maxage=3600, stale-while-revalidate=3600');
      return res.status(200).json({ season, teams });
    } catch (err) { return res.status(500).json({ error: err.message, teams: {} }); }
  }

  // ── Top started scorer per team per week (for matchup-history game logs) ────────
  if (type === 'topscorers') {
    const BENCH_SLOTS = [20, 21, 24];
    const weekIds = Array.from({ length: 18 }, (_, i) => i + 1);
    try {
      const weekResults = await Promise.all(weekIds.map(async w => {
        try {
          const r = await fetch(leagueURL('mRoster', { forceLive: true }) + `&scoringPeriodId=${w}`, { headers });
          if (!r.ok) return null;
          return { week: w, data: unwrap(await r.json()) };
        } catch { return null; }
      }));
      const teams = {};
      weekResults.forEach(wr => {
        if (!wr) return;
        (wr.data.teams || []).forEach(team => {
          let best = null;
          (team.roster?.entries || []).forEach(e => {
            if (BENCH_SLOTS.includes(e.lineupSlotId)) return; // starters only
            const stats = e.playerPoolEntry?.player?.stats || [];
            const wk = stats.find(s => s.statSourceId === 0 && s.scoringPeriodId === wr.week);
            const pts = wk?.appliedTotal;
            if (pts == null) return;
            if (!best || pts > best.pts) best = { pid: e.playerId, n: e.playerPoolEntry?.player?.fullName || ('#' + e.playerId), pts: Math.round(pts * 10) / 10 };
          });
          if (best) (teams[team.id] || (teams[team.id] = {}))[wr.week] = best;
        });
      });
      res.setHeader('Cache-Control', isHistory
        ? 'public, max-age=300, s-maxage=2592000, stale-while-revalidate=86400'
        : 'public, max-age=300, s-maxage=3600, stale-while-revalidate=3600');
      return res.status(200).json({ season, teams });
    } catch (err) { return res.status(500).json({ error: err.message, teams: {} }); }
  }

  // ── Weekly starting lineups (who scored against whom) ───────────────────────
  // Per week, per team: the players that were actually in the lineup and what
  // they scored. The client pairs these with the schedule to work out which
  // players have done the most damage to a given franchise.
  if (type === 'lineups') {
    const BENCH = [20, 21, 24];
    const weekIds = Array.from({ length: 18 }, (_, i) => i + 1);
    try {
      const weekResults = await Promise.all(weekIds.map(async w => {
        try {
          const r = await fetch(leagueURL('mRoster', { forceLive: true }) + `&scoringPeriodId=${w}`, { headers });
          if (!r.ok) return null;
          return { week: w, data: unwrap(await r.json()) };
        } catch { return null; }
      }));
      const weeks = {}, names = {};
      weekResults.forEach(wr => {
        if (!wr) return;
        (wr.data.teams || []).forEach(team => {
          const arr = [];
          (team.roster?.entries || []).forEach(e => {
            if (BENCH.includes(e.lineupSlotId)) return;         // starters only
            const pl = e.playerPoolEntry?.player || {};
            const wk = (pl.stats || []).find(x => x.statSourceId === 0 && x.scoringPeriodId === wr.week);
            if (!wk) return;                                     // bye / never played
            names[e.playerId] = pl.fullName || ('#' + e.playerId);
            arr.push([e.playerId, Math.round((wk.appliedTotal || 0) * 10) / 10]);
          });
          if (arr.length) (weeks[wr.week] || (weeks[wr.week] = {}))[team.id] = arr;
        });
      });
      res.setHeader('Cache-Control', isHistory
        ? 'public, max-age=300, s-maxage=2592000, stale-while-revalidate=86400'
        : 'public, max-age=300, s-maxage=3600, stale-while-revalidate=3600');
      return res.status(200).json({ season, weeks, names });
    } catch (err) { return res.status(500).json({ error: err.message, weeks: {}, names: {} }); }
  }

  // ── Lineup IQ: correct sit/start decisions + points left on the bench ────────
  // For every regular-season week we rebuild that team's optimal lineup from the
  // players it actually rostered, using the same slot template it started that
  // week (RB/WR/TE are all FLEX-eligible). A started slot only counts as a
  // "decision" when the roster held at least one other player eligible for it —
  // one kicker on the roster is not a choice. The slot is correct when the
  // player started is part of the optimal lineup. Byes, IR and players who
  // never took the field are ignored on both sides.
  if (type === 'lineupiq') {
    const BENCH = [20, 21, 24];                       // bench / IR / taxi
    const IR_SLOT = 21;
    // lineupSlotId -> eligible defaultPositionId list
    const SLOT_POS = {
      0:[1], 1:[1], 2:[2], 3:[2,3], 4:[3], 5:[3,4], 6:[4], 7:[1,2,3,4],
      16:[16], 17:[5], 23:[2,3,4],
    };
    const OUT = ['OUT','INJURY_RESERVE','IR','SUSPENSION','PUP','NON_FOOTBALL_INJURY','DOUBTFUL'];
    try {
      // regular-season length (playoffs start right after it)
      // ESPN's matchupPeriodCount is the number of REGULAR-season matchup
      // periods (playoff weeks come after it), so it is the regular-season end.
      let regEnd = 14, regSource = 'default', regDbg = {};
      try {
        const sr = await fetch(leagueURL(['mSettings'], { forceLive: true }), { headers });
        if (sr.ok) {
          const sd = unwrap(await sr.json());
          const ss = sd.settings?.scheduleSettings || {};
          regDbg = { matchupPeriodCount: ss.matchupPeriodCount, playoffTeamCount: ss.playoffTeamCount,
                     playoffMatchupPeriodLength: ss.playoffMatchupPeriodLength,
                     finalScoringPeriod: sd.status?.finalScoringPeriod,
                     periods: (ss.matchupPeriods ? Object.keys(ss.matchupPeriods).length : null) };
          const n = ss.matchupPeriodCount;
          if (n >= 8 && n <= 18) { regEnd = n; regSource = 'settings'; }
        }
      } catch {}
      const weekIds = Array.from({ length: regEnd }, (_, i) => i + 1);
      const weekResults = await Promise.all(weekIds.map(async w => {
        try {
          const r = await fetch(leagueURL('mRoster', { forceLive: true }) + `&scoringPeriodId=${w}`, { headers });
          if (!r.ok) return null;
          return { week: w, data: unwrap(await r.json()) };
        } catch { return null; }
      }));
      const teams = {};
      const dbgTeam = req.query.debugTeam ? Number(req.query.debugTeam) : null;
      const detail = [];
      weekResults.forEach(wr => {
        if (!wr) return;
        (wr.data.teams || []).forEach(team => {
          const entries = team.roster?.entries || [];
          if (!entries.length) return;
          const pool = [];        // everyone who could legally have been started
          const starters = [];    // { slot, player }
          entries.forEach(e => {
            const pl = e.playerPoolEntry?.player || {};
            const wk = (pl.stats || []).find(x => x.statSourceId === 0 && x.scoringPeriodId === wr.week);
            const played = !!wk;                              // no line => bye / never active
            const st = String(e.injuryStatus || pl.injuryStatus || '').toUpperCase();
            const usable = played && e.lineupSlotId !== IR_SLOT && !OUT.includes(st);
            const p = { pid: e.playerId, pos: pl.defaultPositionId ?? null, pts: wk?.appliedTotal ?? 0, usable };
            if (!BENCH.includes(e.lineupSlotId)) starters.push({ slot: e.lineupSlotId, p });
            if (usable) pool.push(p);
          });
          if (!starters.length) return;
          // slot template = exactly what they started, hardest slots filled first
          const slots = starters.map(s => s.slot)
            .sort((a, b) => (SLOT_POS[a]?.length || 9) - (SLOT_POS[b]?.length || 9));
          const remaining = pool.slice().sort((a, b) => b.pts - a.pts);
          const taken = new Set();
          const optimal = new Set();
          let optPts = 0;
          slots.forEach(slot => {
            const ok = SLOT_POS[slot];
            const pick = remaining.find(p => !taken.has(p.pid) && (!ok || ok.includes(p.pos)));
            if (!pick) return;
            taken.add(pick.pid); optimal.add(pick.pid); optPts += pick.pts;
          });
          let actPts = 0, decisions = 0, correct = 0;
          starters.forEach(({ slot, p }) => {
            actPts += p.pts;
            const ok = SLOT_POS[slot];
            // was there any other eligible body on the roster for this slot?
            const alt = pool.some(x => x.pid !== p.pid && (!ok || ok.includes(x.pos)));
            if (!alt) return;
            decisions++;
            if (optimal.has(p.pid)) correct++;
          });
          if (dbgTeam === team.id) {
            const nm = {};
            entries.forEach(e => { nm[e.playerId] = (e.playerPoolEntry?.player?.fullName || '#' + e.playerId); });
            detail.push({
              week: wr.week, actPts: Math.round(actPts * 10) / 10, optPts: Math.round(optPts * 10) / 10,
              decisions, correct,
              started: starters.map(({ slot, p }) => ({ slot, pos: p.pos, n: nm[p.pid], pts: p.pts, inOpt: optimal.has(p.pid) })),
              bench: entries.filter(e => BENCH.includes(e.lineupSlotId)).map(e => {
                const pl = e.playerPoolEntry?.player || {};
                const wk = (pl.stats || []).find(x => x.statSourceId === 0 && x.scoringPeriodId === wr.week);
                return { n: pl.fullName, pos: pl.defaultPositionId, slot: e.lineupSlotId, pts: wk?.appliedTotal ?? null,
                         inj: e.injuryStatus || null, inOpt: optimal.has(e.playerId) };
              }),
            });
          }
          const bucket = teams[team.id] || (teams[team.id] = { weeks: 0, decisions: 0, correct: 0, missed: 0 });
          bucket.weeks++;
          bucket.decisions += decisions;
          bucket.correct += correct;
          bucket.missed += Math.max(optPts - actPts, 0);
        });
      });
      Object.values(teams).forEach(t => { t.missed = Math.round(t.missed * 10) / 10; });
      res.setHeader('Cache-Control', isHistory
        ? 'public, max-age=300, s-maxage=2592000, stale-while-revalidate=86400'
        : 'public, max-age=300, s-maxage=3600, stale-while-revalidate=3600');
      return res.status(200).json({ season, regEnd, regSource, regDbg, teams, ...(dbgTeam != null ? { detail } : {}) });
    } catch (err) { return res.status(500).json({ error: err.message, teams: {} }); }
  }

  // ── Draft results ─────────────────────────────────────────────────────────────
  if (type === 'draft') {
    try {
      const r = await fetch(leagueURL('mDraftDetail', { forceLive: true }), { headers });
      const data = unwrap(await r.json());
      const picks = (data.draftDetail?.picks || []).map(p => ({
        playerId: p.playerId,
        overall: p.overallPickNumber,
        round: p.roundId,
        roundPick: p.roundPickNumber,
        teamId: p.teamId,
        keeper: !!p.keeper,
      }));
      res.setHeader('Cache-Control', isHistory
        ? 'public, max-age=300, s-maxage=2592000, stale-while-revalidate=86400'
        : 'public, max-age=300, s-maxage=86400, stale-while-revalidate=3600');
      return res.status(200).json({ season, picks });
    } catch (err) { return res.status(500).json({ error: err.message, picks: [] }); }
  }

  // ── Season-total player stats (league scoring) — for draft steals/busts ──────
  if (type === 'seasonstats') {
    try {
      const baseUrl = leagueURL('kona_player_info', { forceLive: true }) + '&scoringPeriodId=0';
      const filters = [
        { players: { limit: 600, sortAppliedStatTotal: { sortAsc: false, sortPriority: 1 },
                     filterStatsForSplitTypeIds: { value: [0] } } },
        { players: { limit: 600, sortAppliedStatTotal: { sortAsc: false, sortPriority: 1 } } },
        { players: { limit: 600, sortPercOwned: { sortAsc: false, sortPriority: 1 } } },
      ];
      let data = {};
      const diag = [];
      for (const f of filters) {
        const r = await fetch(baseUrl, { headers: { ...headers, 'x-fantasy-filter': JSON.stringify(f) } });
        if (!r.ok) { diag.push({ status: r.status }); continue; }
        data = unwrap(await r.json());
        diag.push({ status: 200, players: (data.players || []).length });
        if ((data.players || []).length) break;
      }
      res.setHeader('x-diag', JSON.stringify(diag));
      const players = (data.players || []).map(e => {
        const pl = e.player || {};
        const tot = (pl.stats || []).find(st => st.statSourceId === 0 && st.statSplitTypeId === 0 && String(st.seasonId) === String(season));
        return {
          id: pl.id,
          n: pl.fullName || null,
          pos: pl.defaultPositionId ?? null,
          pts: tot?.appliedTotal ?? e.appliedStatTotal ?? 0,
        };
      }).filter(p => p.id != null);
      players.sort((a, b) => b.pts - a.pts);
      res.setHeader('Cache-Control', isHistory
        ? 'public, max-age=300, s-maxage=2592000, stale-while-revalidate=86400'
        : 'public, max-age=300, s-maxage=3600, stale-while-revalidate=3600');
      return res.status(200).json({ season, count: players.length, players });
    } catch (err) { return res.status(500).json({ error: err.message, players: [] }); }
  }

  // ── Season trades — reconstructed from weekly rosters ────────────────────────
  // ESPN purges the transaction log after a season ends, but weekly rosters
  // survive. A trade = players moving BOTH directions between the same two teams
  // within a ±1 week window (covers trades whose sides landed on different weeks).
  // Each traded player's value = points scored from the week AFTER the trade on.
  if (type === 'seasontrades') {
    const weekIds = Array.from({ length: 18 }, (_, i) => i + 1);
    try {
      const weekResults = await Promise.all(weekIds.map(async w => {
        try {
          const r = await fetch(leagueURL('mRoster', { forceLive: true }) + `&scoringPeriodId=${w}`, { headers });
          if (!r.ok) return null;
          return { week: w, data: unwrap(await r.json()) };
        } catch { return null; }
      }));
      const finalWeek = (() => {
        for (const wr of weekResults) if (wr?.data?.status?.finalScoringPeriod) return wr.data.status.finalScoringPeriod;
        return 17;
      })();
      // week -> pid -> { team, pts, n }
      const wk = {};
      const name = {};
      weekResults.forEach(wr => {
        if (!wr || wr.week > finalWeek) return;
        const map = wk[wr.week] = {};
        (wr.data.teams || []).forEach(team => {
          (team.roster?.entries || []).forEach(e => {
            const pid = e.playerId; if (pid == null) return;
            const stats = e.playerPoolEntry?.player?.stats || [];
            const st = stats.find(x => x.statSourceId === 0 && x.scoringPeriodId === wr.week);
            map[pid] = { team: team.id, pts: st?.appliedTotal ?? 0 };
            if (e.playerPoolEntry?.player?.fullName) name[pid] = e.playerPoolEntry.player.fullName;
          });
        });
      });
      const weeks = Object.keys(wk).map(Number).sort((a, b) => a - b);
      const ptsFrom = (pid, from) => weeks.filter(w => w >= from).reduce((t, w) => t + (wk[w]?.[pid]?.pts || 0), 0);

      // Prefer the REAL transaction log when ESPN still has it (live seasons) or
      // when it's been archived — that's authoritative & complete. Reconstruction
      // from rosters is the fallback for seasons ESPN has purged.
      let realTrades = null;
      try {
        const liveBase = `${BASE}/seasons/${season}/segments/0/leagues/${leagueId}`;
        const txFilter = { transactions: { filterType:{ value:['TRADE_ACCEPT'] }, limit:2000, offset:0 } };
        const tr = await fetch(`${liveBase}?view=mTransactions2`, { headers:{ ...headers, 'x-fantasy-filter': JSON.stringify(txFilter) } });
        if (tr.ok) {
          const td = unwrap(await tr.json());
          const raw = (td.transactions || []).filter(t => t.type === 'TRADE_ACCEPT' || t.type === 'TRADE');
          if (raw.length) {
            realTrades = raw.map(tx => {
              const twk = tx.scoringPeriodId || 0, from = twk + 1;
              const byTeam = {};
              (tx.items || []).forEach(it => { if (it.playerId != null && it.toTeamId != null) (byTeam[it.toTeamId] || (byTeam[it.toTeamId] = [])).push(it.playerId); });
              const teams = Object.entries(byTeam).map(([tid, pids]) => {
                const players = pids.map(pid => ({ pid, n: name[pid] || `#${pid}`, pts: +ptsFrom(pid, from).toFixed(1) })).sort((a,b)=>b.pts-a.pts);
                return { teamId: +tid, players, total: +players.reduce((s,p)=>s+p.pts,0).toFixed(1) };
              });
              return { week: from, teams };
            }).filter(t => t.teams.length >= 2);
          }
        }
      } catch {}
      if (realTrades && realTrades.length) {
        res.setHeader('Cache-Control', isHistory
          ? 'public, max-age=300, s-maxage=2592000, stale-while-revalidate=86400'
          : 'public, max-age=120, s-maxage=600, stale-while-revalidate=600');
        return res.status(200).json({ season, count: realTrades.length, trades: realTrades, source: 'log' });
      }

      // collect directional moves at each week transition
      const moves = [];
      for (let i = 1; i < weeks.length; i++) {
        const w = weeks[i], prev = wk[weeks[i - 1]], cur = wk[w];
        for (const pid in cur) {
          const tp = prev[pid]?.team, t = cur[pid].team;
          if (tp != null && t != null && tp !== t) moves.push({ pid: +pid, from: tp, to: t, week: w });
        }
      }
      const used = new Array(moves.length).fill(false);
      const trades = [];
      const pairKey = (a, b) => a < b ? `${a}|${b}` : `${b}|${a}`;
      for (let i = 0; i < moves.length; i++) {
        if (used[i]) continue;
        const m = moves[i], key = pairKey(m.from, m.to);
        // gather all unused moves on this pair within ±1 week
        const grp = [];
        for (let j = 0; j < moves.length; j++) {
          if (used[j]) continue;
          const n = moves[j];
          if (pairKey(n.from, n.to) === key && Math.abs(n.week - m.week) <= 1) grp.push(j);
        }
        const dirs = new Set(grp.map(j => `${moves[j].from}>${moves[j].to}`));
        if (dirs.size < 2) continue; // not reciprocal → waiver churn, skip
        grp.forEach(j => used[j] = true);
        const legs = grp.map(j => moves[j]);
        const tradeWeek = Math.min(...legs.map(l => l.week)); // week players first changed hands
        const teamIds = [...new Set(legs.flatMap(l => [l.from, l.to]))];
        const byTeam = {};
        teamIds.forEach(t => byTeam[t] = []);
        legs.forEach(l => { byTeam[l.to].push(l.pid); });
        const teams = teamIds.map(tid => {
          const players = byTeam[tid].map(pid => ({ pid, n: name[pid] || `#${pid}`, pts: +ptsFrom(pid, tradeWeek).toFixed(1) }))
            .sort((a, b) => b.pts - a.pts);
          return { teamId: tid, players, total: +players.reduce((s, p) => s + p.pts, 0).toFixed(1) };
        });
        trades.push({ week: tradeWeek, teams });
      }
      res.setHeader('Cache-Control', isHistory
        ? 'public, max-age=300, s-maxage=2592000, stale-while-revalidate=86400'
        : 'public, max-age=300, s-maxage=3600, stale-while-revalidate=3600');
      return res.status(200).json({ season, count: trades.length, trades, source: 'reconstructed' });
    } catch (err) { return res.status(500).json({ error: err.message, trades: [] }); }
  }

  // ── Generic view passthrough (supports multiple ?view= params) ───────────────
  const views = view || 'mTeam';
  let url = leagueURL(views, { forceLive: req.query.live === '1' });
  if (scoringPeriodId) url += `&scoringPeriodId=${parseInt(scoringPeriodId, 10)}`;
  try {
    const response = await fetch(url, { headers });
    if (!response.ok) {
      const text = await response.text();
      return res.status(response.status).json({ error: `ESPN API ${response.status}`, details: text, url });
    }
    const data = unwrap(await response.json());
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate');
    return res.status(200).json(data);
  } catch (err) { return res.status(500).json({ error: err.message }); }
}
