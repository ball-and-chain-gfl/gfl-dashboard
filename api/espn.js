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

  // ── Player scoring per week — used for C2/C3 calculation ────────────────────
  // Returns all players' scoring for a specific week from the roster view
  if (type === 'playerscores') {
    const week = scoringPeriodId || '1';
    const url  = `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${season}/segments/0/leagues/${leagueId}?view=mRoster&scoringPeriodId=${week}`;
    try {
      const r    = await fetch(url, { headers });
      const data = await r.json();
      // Build flat map: playerId -> points for this week
      const scores = {};
      (data.teams || []).forEach(team => {
        (team.roster?.entries || []).forEach(e => {
          const pid  = e.playerId;
          const pts  = e.playerPoolEntry?.appliedStatTotal ?? 0;
          scores[pid] = pts;
        });
      });
      return res.status(200).json({ week: parseInt(week), scores });
    } catch (err) { return res.status(500).json({ error: err.message }); }
  }

  // ── ESPN Fantasy API ─────────────────────────────────────────────────────────
  const viewParam = view || 'mTeam';
  const seasonNum = parseInt(season, 10);
  const currentYear = new Date().getFullYear();

  let url;
  if (seasonNum < currentYear) {
    url = `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/leagueHistory/${leagueId}?seasonId=${season}&view=${viewParam}`;
  } else {
    url = `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${season}/segments/0/leagues/${leagueId}?view=${viewParam}`;
  }

  try {
    const response = await fetch(url, { headers });
    if (!response.ok) {
      const text = await response.text();
      return res.status(response.status).json({ error: `ESPN API ${response.status}`, details: text, url });
    }
    let data = await response.json();
    if (Array.isArray(data)) data = data[0];
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate');
    return res.status(200).json(data);
  } catch (err) { return res.status(500).json({ error: err.message }); }
}
