export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { view, seasonId, type } = req.query;
  const leagueId = '1327340807';
  const season   = seasonId || '2025';
  const espn_s2  = process.env.ESPN_S2;
  const swid     = process.env.ESPN_SWID;

  if (!espn_s2 || !swid) {
    return res.status(500).json({ error: 'ESPN credentials not configured' });
  }

  const headers = {
    'Cookie': `espn_s2=${espn_s2}; SWID=${swid}`,
    'Accept': 'application/json',
  };

  // ── YouTube RSS — returns up to 15 videos ──────────────────────────────────
  if (type === 'youtube') {
    const channelId = 'UCUoUwKYMkspanOjX5_6d5-Q';
    try {
      const rssRes = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`);
      const xml    = await rssRes.text();

      const entries   = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)];
      const videos = entries.slice(0, 15).map(m => {
        const block     = m[1];
        const videoId   = (block.match(/<yt:videoId>(.*?)<\/yt:videoId>/)  || [])[1] || null;
        const title     = (block.match(/<title>(.*?)<\/title>/)             || [])[1] || 'Untitled';
        const published = (block.match(/<published>(.*?)<\/published>/)     || [])[1] || '';
        const thumb     = (block.match(/url="(https:\/\/i\.ytimg[^"]+)"/)  || [])[1] || null;
        return { videoId, title, published, thumb };
      }).filter(v => v.videoId);

      return res.status(200).json({ videos });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // ── ESPN Fantasy API ────────────────────────────────────────────────────────
  const viewParam = view || 'mTeam';

  // ESPN uses different base URLs for current vs historical seasons
  // Current season (2025+): lm-api-reads
  // History (<=2024): leagueHistory endpoint
  const currentYear = new Date().getFullYear();
  const seasonNum   = parseInt(season, 10);

  let url;
  if (seasonNum < currentYear) {
    // Historical endpoint
    url = `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/leagueHistory/${leagueId}?seasonId=${season}&view=${viewParam}`;
  } else {
    url = `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${season}/segments/0/leagues/${leagueId}?view=${viewParam}`;
  }

  console.log('ESPN URL:', url);

  try {
    const response = await fetch(url, { headers });

    if (!response.ok) {
      const text = await response.text();
      return res.status(response.status).json({ error: `ESPN API ${response.status}`, details: text, url });
    }

    let data = await response.json();

    // leagueHistory returns an array — unwrap it
    if (Array.isArray(data)) data = data[0];

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate');
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
