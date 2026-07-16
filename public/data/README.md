# Archived league data

ESPN permanently deletes the detailed transaction log (trades, waiver claims,
FAAB bids) shortly after each season ends. Files in this folder preserve that
data in git before it disappears.

## Files

- `cm-official.json` — official Coaching Metric results per season, from the
  commissioner's spreadsheet. Seasons in the `none` list display
  "no data available" on the site. 2024 used the legacy weighted-metric
  formula (final value only).
- `transactions-<year>.json` — raw transaction snapshots straight from ESPN,
  used automatically by the site when ESPN's own log comes back empty.

## How snapshots happen

**Automatic:** a Vercel cron job hits `/api/archive` every Tuesday. If a
`GITHUB_TOKEN` env var (repo Contents read/write) is configured in Vercel, it
commits `transactions-<year>.json` to this folder whenever the transaction
count changes. Set it up once and every season is preserved by week 17
without touching anything.

**Manual fallback:** open
`https://gfl-dashboard.vercel.app/api/archive?seasonId=<year>` in a browser,
save the JSON as `public/data/transactions-<year>.json`, commit, and push.
Do this before the season ends (by week 17) if the cron/token isn't set up.
