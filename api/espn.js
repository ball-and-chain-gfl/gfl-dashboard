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

    await probe('hist_mTx2_typed', `${histBase}&view=mTransactions2`, txFilterTyped);
    await probe('live_mTx2_typed', `${liveBase}?view=mTransactions2`, txFilterTyped);
    await probe('hist_mTx2_all',   `${histBase}&view=mTransactions2`, txFilterAll);
    await probe('live_mTx2_all',   `${liveBase}?view=mTransactions2`, txFilterAll);
    return res.status(200).json(out);
  }

  // ── Transactions (waivers / free agents / trades) — used for C2/C3 ───────────
  // Correct method (confirmed via diagnostics): view=mTransactions2 with an
  // x-fantasy-filter on `transactions` using valid TransactionType enum values.
  // Returns ESPN's native transaction objects:
  //   { type:'WAIVER'|'FREEAGENT'|'TRADE_ACCEPT', teamId, bidAmount,
  //     scoringPeriodId, status, items:[{ type:'ADD'|'DROP'|'TRADE',
  //                                       playerId, fromTeamId, toTeamId }] }
  // The history endpoint serves completed seasons; the live endpoint serves the
  // current one. We try the season-appropriate endpoint first, then the other.
  if (type === 'transactions') {
    const txFilter = { transactions: {
      filterType: { value: ['WAIVER','FREEAGENT','TRADE_ACCEPT'] },
      limit: 2000, offset: 0,
    }};
    const hdr = { ...headers, 'x-fantasy-filter': JSON.stringify(txFilter) };
    const histUrl = `${BASE}/leagueHistory/${leagueId}?seasonId=${season}&view=mTransactions2`;
    const liveUrl = `${BASE}/seasons/${season}/segments/0/leagues/${leagueId}?view=mTransactions2`;
    const diag = [];

    async function pull(name, url) {
      try {
        const r = await fetch(url, { headers: hdr });
        if (!r.ok) { diag.push({ name, status: r.status }); return []; }
        const data = unwrap(await r.json());
        const txns = Array.isArray(data.transactions) ? data.transactions : [];
        diag.push({ name, status: 200, count: txns.length });
        return txns;
      } catch (e) { diag.push({ name, error: String(e).slice(0, 80) }); return []; }
    }

    try {
      const order = isHistory ? [['hist', histUrl], ['live', liveUrl]]
                              : [['live', liveUrl], ['hist', histUrl]];
      let txns = [], source = 'none';
      for (const [name, url] of order) {
        txns = await pull(name, url);
        if (txns.length) { source = name; break; }
      }
      res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate');
      return res.status(200).json({ transactions: txns, _source: source, _count: txns.length, _diag: diag });
    } catch (err) { return res.status(500).json({ error: err.message, transactions: [], _diag: diag }); }
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
