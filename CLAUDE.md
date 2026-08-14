# Ball & Chain GFL Dashboard

Fantasy football dashboard for a private ESPN league (`leagueId 1327340807`).
Vanilla HTML/CSS/JS frontend + two Vercel serverless functions. No build step,
no framework, no dependencies — `package.json` has no `dependencies` and no
`scripts`, it exists only to pin `node: 24.x`.

Deployed at https://gfl-dashboard.vercel.app from `main` on
https://github.com/ball-and-chain-gfl/gfl-dashboard — every push to `main`
deploys.

## Layout

```
api/espn.js      ESPN API proxy — one handler, branches on ?type=
api/archive.js   Snapshots the season transaction log into git (weekly cron)
public/index.html  Markup + all CSS in one file (~2.6k lines)
public/app.js      All frontend logic (~4.8k lines)
public/config.js   Hand-edited weekly content — see below
public/sw.js       Service worker / PWA cache
public/data/*.json Archived per-season data, committed to git
```

## Editing conventions

**`public/config.js` is the weekly-content file.** Big 4 picks, matchup of the
week, punishment, excluded teams, bad-beat entries. If a change is about *this
week's content* rather than behaviour, it almost certainly belongs here and not
in `app.js` or `index.html`. It is deliberately heavily commented for
non-developer editing — preserve that commenting style.

**Bump the service worker cache on every user-facing change.** `public/sw.js`
line 7 is `const CACHE = 'gfl-v257';`. Increment it, and note the new number in
the commit message as `SW v258` — that is the established convention across the
whole history. Skipping the bump leaves installed home-screen PWA copies on
stale assets.

**CSS lives in `index.html`**, not a separate stylesheet. Each tab has an accent
colour, and homepage modules are coloured to match their tab's accent.

**Tabs** are driven by `data-tab` attributes: `home`, `standings`, `teams`,
`schedule`, `history`, `trades`, `draft`, `tenure`, `legacy`, `badbeat`,
`marathon`, `punishment`, `gabe`, `book`.

## The ESPN proxy

`api/espn.js` is a single handler switching on `?type=`. Existing types:
`logo`, `youtube`, `raw`, `transactions`, `playerscores`, `playergames`,
`seasontenure`, `topscorers`, `lineups`, `lineupiq`, `draft`, `seasonstats`,
`seasontrades`. Anything else falls through to a generic `?view=` passthrough to
ESPN. Add new capabilities as a new `type` branch.

Two upstream endpoints, chosen automatically: `leagueHistory` for past seasons,
`seasons/.../leagues` for the current one. Completed-but-recent seasons are
retried against the live endpoint because `leagueHistory` drops the transaction
log.

Auth is the `ESPN_S2` and `ESPN_SWID` cookies from env. They expire roughly
annually; when the dashboard stops loading, refresh them in Vercel project
settings. The handler returns HTTP 500 `ESPN credentials not configured` when
they are missing — including under any local server that isn't `vercel dev`.

## Local development

`vercel dev` is required — a plain static server over `public/` renders the
shell but every tab fails with `ESPN API 404`, because the frontend calls
`/api/*` on the homepage.

```bash
vercel dev
```

Needs `vercel login`, `vercel link`, then `vercel env pull` to populate a local
`.env`. `.gitignore` covers `.env*` and `.vercel`. Never commit cookie values.

## Archiving

ESPN purges the transaction log after each season. `api/archive.js` snapshots it
to `public/data/transactions-<year>.json` via the GitHub contents API, driven by
a Vercel cron (`vercel.json`, Tuesdays 09:00 UTC). It needs a `GITHUB_TOKEN` env
var in Vercel with write access to this repo; without it the endpoint returns
`committed: false` and quietly does nothing.

## Do not

- Store this repo inside OneDrive. A previous clone on the OneDrive Desktop had
  its `.git/objects/pack/*.pack` file dehydrated away, corrupting history
  irrecoverably. Keep it on a local path (`C:\dev\gfl-dashboard`).
- Commit `public/data/season-*.json` regenerations without checking the diff —
  they are ~730KB each and churn noisily.
