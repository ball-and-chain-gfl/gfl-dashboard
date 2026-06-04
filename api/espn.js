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
  // Returns the UNMODIFIED shape of what ESPN sends back for the transaction
  // sources, so we can see exactly how this league's data is structured.
  // Visit: /api/espn?type=raw&seasonId=2025
  if (type === 'raw') {
    const liveBase = `${BASE}/seasons/${season}/segments/0/leagues/${leagueId}`;
    const histBase = `${BASE}/leagueHistory/${leagueId}?seasonId=${season}`;
    const MSG_IDS = [178,179,180,181,224,225,226,239,241,242,243,244,245,246,247,248,249,250,251,252,253,254,255,256,257,258,259];

    // Candidate x-fantasy-filter shapes (history endpoint accepts keys:
    // players, transactions, communication, schedule).
    const txFilter = { transactions: {
      filterType: { value: ['WAIVER','FREEAGENT','TRADE_ACCEPT','TRADE'] },
      limit: 1000, offset: 0, sortDate: { sortPriority: 1, sortAsc: false },
    }};
    const commFilter = { communication: {
      filterType: { value: ['ACTIVITY_TRANSACTIONS'] },
      limit: 1000, limitPerMessageSet: { value: 1000 }, offset: 0,
      sortMessageDate: { sortPriority: 1, sortAsc: false },
      filterIncludeMessageTypeIds: { value: MSG_IDS },
    }};
    const commNested = { communication: { topics: {
      filterType: { value: ['ACTIVITY_TRANSACTIONS'] },
      limit: 1000, limitPerMessageSet: { value: 1000 }, offset: 0,
      sortMessageDate: { sortPriority: 1, sortAsc: false },
      filterIncludeMessageTypeIds: { value: MSG_IDS },
    }}};

    const out = { season, probes: [] };
    async function probe(name, url, filterObj) {
      const p = { name, url, filter: filterObj ? Object.keys(filterObj)[0] : null };
      const hdrs = filterObj ? { ...headers, 'x-fantasy-filter': JSON.stringify(filterObj) } : headers;
      try {
        const r = await fetch(url, { headers: hdrs });
        p.status = r.status;
        if (!r.ok) { p.body = (await r.text()).slice(0, 220); out.probes.push(p); return; }
        const data = unwrap(await r.json());
        p.topLevelKeys = Object.keys(data || {});
        if (Array.isArray(data.transactions)) { p.transactionCount = data.transactions.length; p.sampleTransactions = data.transactions.slice(0, 3); }
        if (Array.isArray(data.topics)) {
          p.topicCount = data.topics.length;
          const msgs = []; data.topics.forEach(tp => (tp.messages||[]).forEach(m => { if (msgs.length < 8) msgs.push(m); }));
          p.sampleMessages = msgs;
        }
        if (Array.isArray(data.communication)) { p.communicationCount = data.communication.length; p.sampleComm = data.communication.slice(0, 2); }
      } catch (e) { p.error = String(e).slice(0, 200); }
      out.probes.push(p);
    }

    await probe('hist_mTx2_txFilter', `${histBase}&view=mTransactions2`, txFilter);
    await probe('live_mTx2_txFilter', `${liveBase}?view=mTransactions2`, txFilter);
    await probe('hist_kona_commFilter', `${histBase}&view=kona_league_communication`, commFilter);
    await probe('hist_kona_commNested', `${histBase}&view=kona_league_communication`, commNested);
    await probe('hist_mTx2_commFilter', `${histBase}&view=mTransactions2`, commFilter);
    await probe('live_tx_subpath', `${liveBase}/transactions/?view=mTransactions2`, txFilter);
    return res.status(200).json(out);
  }

  // ── Transactions (waivers / free agents / trades) — used for C2/C3 ───────────
  // ESPN's `mTransactions2` view returns NOTHING for many leagues/finished
  // seasons. The reliable source for the historical add/drop/trade log is the
  // league COMMUNICATION feed (view=kona_league_communication) with an
  // x-fantasy-filter on transaction topics — this is what the community ESPN
  // libraries use. We normalize those messages into the same shape the rest of
  // the app expects: { type, teamId, bidAmount, scoringPeriodId, items:[...] }.
  if (type === 'transactions') {
    const MSG = {                       // ESPN messageTypeId → bucket
      178:'ADD', 180:'ADD', 179:'DROP', 239:'DROP', 181:'DROP',
      224:'TRADE', 225:'TRADE', 226:'TRADE', 244:'TRADE', 245:'TRADE', 246:'TRADE',
    };
    const topicsFilter = { topics: {
      filterType:{ value:['ACTIVITY_TRANSACTIONS'] },
      limit: 1000, limitPerMessageSet:{ value:1000 }, offset:0,
      sortMessageDate:{ sortPriority:1, sortAsc:false },
      filterIncludeMessageTypeIds:{ value:[178,179,180,181,224,225,226,239,241,242,243,244,245,246,247,248,249,250,251,252,253,254,255,256,257,258,259] },
    }};

    function normFromComm(topics){
      const txns=[];
      (topics||[]).forEach(tp=>{
        const week = tp.scoringPeriodId ?? tp.matchupPeriodId ?? 0;
        (tp.messages||[]).forEach(m=>{
          const bucket = MSG[m.messageTypeId];
          if(!bucket || bucket==='DROP') return;            // C2/C3 don't need drops
          const pid = m.targetId!=null ? Number(m.targetId) : null;
          const wk  = m.scoringPeriodId ?? week ?? 0;
          if(bucket==='ADD'){
            txns.push({ type:'WAIVER', teamId:m.to, bidAmount:m.bidAmount??0,
              scoringPeriodId:wk, items:[{ type:'ADD', playerId:pid, toTeamId:m.to }] });
          } else if(bucket==='TRADE'){
            txns.push({ type:'TRADE_ACCEPT', teamId:m.from??m.to, scoringPeriodId:wk,
              items:[{ type:'TRADE', playerId:pid, fromTeamId:m.from, toTeamId:m.to }] });
          }
        });
      });
      return txns;
    }

    const diag = [];
    async function attempt(name, url, hdrs, parse){
      try{
        const r = await fetch(url, { headers:hdrs });
        if(!r.ok){ diag.push({ name, status:r.status, count:0 }); return []; }
        const data = unwrap(await r.json());
        const txns = parse(data);
        diag.push({ name, status:200, count:txns.length, keys:Object.keys(data||{}).slice(0,8) });
        return txns;
      }catch(e){ diag.push({ name, error:String(e).slice(0,80), count:0 }); return []; }
    }

    const commHdr = { ...headers, 'x-fantasy-filter': JSON.stringify(topicsFilter) };
    const liveBase = `${BASE}/seasons/${season}/segments/0/leagues/${leagueId}`;
    const histBase = `${BASE}/leagueHistory/${leagueId}?seasonId=${season}`;

    try{
      let txns=[], source='none';
      // 1) Communication feed on the live endpoint (best for recent seasons).
      txns = await attempt('comm_live',
        `${liveBase}/communication/?view=kona_league_communication`,
        commHdr, d=>normFromComm(d.topics));
      if(txns.length) source='comm_live';
      // 2) Communication feed on the history endpoint.
      if(!txns.length){
        txns = await attempt('comm_hist',
          `${histBase}&view=kona_league_communication`,
          commHdr, d=>normFromComm(d.topics));
        if(txns.length) source='comm_hist';
      }
      // 3) Legacy mTransactions2 (live) as a last resort, no filter.
      if(!txns.length){
        txns = await attempt('mTx2_live', `${liveBase}?view=mTransactions2`, headers,
          d=>Array.isArray(d.transactions)?d.transactions:[]);
        if(txns.length) source='mTx2_live';
      }
      res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate');
      return res.status(200).json({ transactions:txns, _source:source, _count:txns.length, _diag:diag });
    }catch(err){ return res.status(500).json({ error:err.message, transactions:[], _diag:diag }); }
  }

  // ── Player scoring per week — used for C2/C3 calculation ────────────────────
  // players[pid] = { pts, slot, started, team }
  //   pts  = ACTUAL fantasy points that week (statSourceId 0), start or bench
  //   slot = lineupSlotId that week (starters vs bench for C3)
  //   team = teamId that rostered the player that week
  if (type === 'playerscores') {
    const week = parseInt(scoringPeriodId || '1', 10);
    const url  = leagueURL('mRoster') + `&scoringPeriodId=${week}`;
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
          };
        });
      });
      return res.status(200).json({ week, players });
    } catch (err) { return res.status(500).json({ error: err.message }); }
  }

  // ── Generic view passthrough (supports multiple ?view= params) ───────────────
  const views = view || 'mTeam';
  const url = leagueURL(views);
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
