// Snapshots the season's transaction log (trades, waiver claims, FAAB bids —
// everything ESPN deletes after the season) so it can be preserved in git.
//
//   GET /api/archive?seasonId=2026            -> returns the snapshot JSON (save manually)
//   GET /api/archive?seasonId=2026&commit=1   -> commits public/data/transactions-<year>.json
//                                                to GitHub (needs GITHUB_TOKEN env var)
//
// A weekly Vercel cron hits this endpoint automatically (see vercel.json), so
// with GITHUB_TOKEN configured every season is archived well before week 17.
const REPO = 'ball-and-chain-gfl/gfl-dashboard';

export default async function handler(req, res) {
  const season = req.query.seasonId || String(new Date().getFullYear());
  const isCron = (req.headers['user-agent'] || '').includes('vercel-cron');
  const wantCommit = req.query.commit === '1' || isCron;

  let tx;
  try {
    const base = `https://${req.headers.host}`;
    const r = await fetch(`${base}/api/espn?type=transactions&seasonId=${season}`);
    tx = await r.json();
  } catch (e) {
    return res.status(502).json({ error: `could not fetch transactions: ${e.message}` });
  }

  const payload = {
    season,
    savedAt: new Date().toISOString(),
    source: tx._source || 'unknown',
    count: (tx.transactions || []).length,
    transactions: tx.transactions || [],
  };

  if (!wantCommit) {
    res.setHeader('Content-Disposition', `attachment; filename="transactions-${season}.json"`);
    return res.status(200).json(payload);
  }

  const token = process.env.GITHUB_TOKEN;
  if (!token) return res.status(200).json({ committed: false, reason: 'GITHUB_TOKEN not configured in Vercel env vars', count: payload.count });
  if (!payload.count) return res.status(200).json({ committed: false, reason: 'no transactions to archive (season not started or log already purged)', count: 0 });

  try {
    const path = `public/data/transactions-${season}.json`;
    const api = `https://api.github.com/repos/${REPO}/contents/${path}`;
    const hdrs = { 'Authorization': `Bearer ${token}`, 'Accept': 'application/vnd.github+json', 'User-Agent': 'gfl-dashboard-archiver' };
    const curRes = await fetch(api, { headers: hdrs });
    const cur = curRes.ok ? await curRes.json() : null;
    if (cur?.content) {
      try {
        const existing = JSON.parse(Buffer.from(cur.content, 'base64').toString('utf-8'));
        if (existing.count === payload.count) return res.status(200).json({ committed: false, reason: 'unchanged', count: payload.count });
      } catch {}
    }
    const body = {
      message: `Archive ${season} transactions (${payload.count} records)`,
      content: Buffer.from(JSON.stringify(payload)).toString('base64'),
      ...(cur?.sha ? { sha: cur.sha } : {}),
    };
    const put = await fetch(api, { method: 'PUT', headers: { ...hdrs, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return res.status(200).json({ committed: put.ok, status: put.status, count: payload.count });
  } catch (e) {
    return res.status(500).json({ committed: false, error: e.message });
  }
}
