# Ball & Chain GFL Dashboard

A private dashboard for one twelve-team ESPN fantasy football league
(`leagueId 1327340807`), live at <https://gfl-dashboard.vercel.app>.

ESPN already tells you who won. This exists to say the things ESPN will not: to
keep the league talking mid-week, to score judgement rather than luck, and to
remember the seasons after ESPN deletes them.

Vanilla HTML/CSS/JS, two Vercel serverless functions, Firestore for the
decisions people make. No build step, no framework, no dependencies.

## Documentation

| Document | What it covers |
|---|---|
| **`CLAUDE.md`** | Repo rules and conventions — read first before editing |
| **`HOW-IT-WORKS.md`** | What the app is for, where its data comes from, what every page does |
| **`HANDOFF.md`** | Current state of play, open items, and the traps already paid for |
| **`public/data/README.md`** | The committed archive files, and how snapshots happen |

## Running it locally

`vercel dev` is required. A plain static server over `public/` renders the shell,
but every tab fails with `ESPN API 404` because the frontend calls `/api/*`.

```bash
vercel dev
```

Needs `vercel login` and `vercel link` first, and two env gotchas that have cost
real time — both written up in `CLAUDE.md`: `vercel dev` reads `.env` while
`vercel env pull` writes `.env.local`, and the sensitive values pull as
11-character placeholders that must be filled in by hand.

## Environment variables

Set these in Vercel → Project Settings → Environment Variables.

| Key | Value | Notes |
|---|---|---|
| `ESPN_S2` | the `espn_s2` cookie from a logged-in `fantasy.espn.com` session | ~320 chars; expires roughly annually |
| `ESPN_SWID` | `{914E533C-0C16-48AC-A3E2-E51D83ED8802}` | 38 chars |
| `GITHUB_TOKEN` | a token with Contents read/write on this repo | only needed for the archive cron |

**When the dashboard stops loading data, the cookies have expired.** Grab fresh
ones from ESPN (DevTools → Application → Cookies) and update them in Vercel.
Never commit cookie values — `.gitignore` covers `.env*`.

## What is in it

Fifteen pages — fourteen on the nav, plus your own locker room reached from the
balance chip — all derived from ESPN data and the league's own decisions:

- **Homepage** — video rail, Coaches' Poll, a swipeable notification stack, the
  weekly matchup picks grid, and five generated trivia questions
- **B&C Sportsbook** — moneylines, spreads, totals, season futures, and a share
  market on the twelve franchises with two conference ETFs
- **Ball Knowledge** — the counter-metric to luck, moved only by trivia
  answered, games picked and bets settled
- **Leaderboards** — Ball Knowledge, bets and portfolios, matchup picks, eggs
- **Team Profiles, Standings, Player Data, League History, Head to Head,
  Draft Report, Trades, Bad Beat O'Meter, Coaching Metric**
- **My Locker Room** — the plant, the egg hunt, and a door into anyone else's
- **Punishments** — this week's, the menu, and the season schedule

Sign-in is deliberately not real auth: the username is a team abbreviation and
the password is three digits. It gates *whose decisions you are editing*, not
access — signed out, the whole site still works.

## Tests

Four suites plus a parse check, run in CI on every push touching `public/app.js`
or `scripts/**`. Run them before pushing:

```bash
node --check public/app.js && for t in invites bank-egg odds next-bid; do node scripts/test-$t.mjs; done
```

Vercel deploys whether or not Actions is green, so a red suite is easy to miss.

## Tech

- Vercel serverless functions (Node 24) for the ESPN proxy and the archiver
- Vanilla HTML/CSS/JS frontend, no framework, no build step
- Firestore over the REST API for profiles and bet slips
- PWA with a network-first service worker
- ESPN private-league auth via `espn_s2` + `SWID` cookies
