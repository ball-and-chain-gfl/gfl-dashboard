export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { view, seasonId } = req.query;
  const leagueId = '1327340807';
  const season = seasonId || '2025';

  const espn_s2 = process.env.ESPN_S2;
  const swid = process.env.ESPN_SWID;

  if (!espn_s2 || !swid) {
    return res.status(500).json({ error: 'ESPN credentials not configured in environment variables' });
  }

  const viewParam = view || 'mTeam';
  const url = `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${season}/segments/0/leagues/${leagueId}?view=${viewParam}`;
  console.log('Season:', season);
  console.log('View:', viewParam);
  console.log('URL:', url);
  console.log('Has espn_s2:', !!espn_s2);
  console.log('Has swid:', !!swid);
  try {
    const response = await fetch(url, {
      headers: {
        'Cookie': `espn_s2=${espn_s2}; SWID=${swid}`,
        'Accept': 'application/json',
      },
    });

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
