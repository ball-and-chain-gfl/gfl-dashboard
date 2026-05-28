export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { view, seasonId, type } = req.query;
  const leagueId = '1327340807';
  const season = seasonId || '2025';

  const espn_s2 = process.env.ESPN_S2;
  const swid = process.env.ESPN_SWID;

  if (!espn_s2 || !swid) {
    return res.status(500).json({ error: 'ESPN credentials not configured in environment variables' });
  }

  const headers = {
    'Cookie': `espn_s2=${espn_s2}; SWID=${swid}`,
    'Accept': 'application/json',
  };

  // YouTube RSS proxy — no API key needed
  if (type === 'youtube') {
    const channelId = 'UCUoUwKYMkspanOjX5_6d5-Q'; // Ball & Chain Media
    const rssUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
    try {
      const rssRes = await fetch(rssUrl);
      const xml = await rssRes.text();
      // Extract first video id and title from RSS
      const videoIdMatch = xml.match(/<yt:videoId>(.*?)<\/yt:videoId>/);
      const titleMatch = xml.match(/<title>(.*?)<\/title>/g);
      const videoId = videoIdMatch ? videoIdMatch[1] : null;
      const title = titleMatch && titleMatch[1] ? titleMatch[1].replace(/<\/?title>/g, '') : 'Latest Video';
      return res.status(200).json({ videoId, title });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // Multi-view support: ?view=mTeam&view=mRoster etc via comma-separated
  const viewParam = view || 'mTeam';
  const views = viewParam.split(',').map(v => `view=${v.trim()}`).join('&');
  const url = `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${season}/segments/0/leagues/${leagueId}?${views}`;

  console.log('URL:', url);

  try {
    const response = await fetch(url, { headers });

    if (!response.ok) {
      const text = await response.text();
      return res.status(response.status).json({
        error: `ESPN API returned ${response.status}`,
        details: text,
        url
      });
    }

    const data = await response.json();
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate');
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
