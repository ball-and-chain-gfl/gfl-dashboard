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

## weekly-<season>.json — archived by scripts/archive-season.mjs

A finished season's per-week player scores, all weeks in one file. These used
to be seventeen separate API calls on every page load, each taking seconds;
they are now one static fetch. Written only for seasons whose every scheduled
game has been played, so an in-progress season still goes to ESPN live.

Run `node scripts/archive-season.mjs` after a season ends. It skips anything
already archived and refuses to write a season that is not finished, so it is
safe to run repeatedly. lineups-<season>.json and lineupiq-<season>.json are
written by the same pass.
