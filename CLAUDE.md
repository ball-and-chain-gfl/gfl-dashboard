# Ball & Chain GFL Dashboard

Fantasy football dashboard for a private ESPN league (`leagueId 1327340807`).
Vanilla HTML/CSS/JS frontend, two Vercel serverless functions, and Firestore for
the one thing that cannot be derived — the decisions people made. No build step,
no framework, no dependencies: `package.json` has no `dependencies` and no
`scripts`, it exists only to pin `node: 24.x`.

Deployed at https://gfl-dashboard.vercel.app from `main` on
https://github.com/ball-and-chain-gfl/gfl-dashboard — every push to `main`
deploys.

## Documents

- **`CLAUDE.md`** (this file) — repo rules and conventions. Read first.
- **`public/data/README.md`** — the archive files on their own terms.

Everything else is in the code and its comments. The app changes week to week,
and a tour of it kept anywhere else goes stale faster than anyone reads it.

## Layout

```
api/espn.js             ESPN API proxy — one handler, branches on ?type=
api/archive.js          Snapshots the transaction log into git (Vercel cron)
public/index.html       The shell + every line of CSS (7.3k lines)
public/app.js           All frontend logic (25.6k lines)
public/config.js        Hand-edited weekly content and tunables
public/sw.js            Service worker / PWA cache
public/data/*.json      Archived per-season data, committed to git
scripts/*.mjs           Archivers, one-off fetchers, the local preview, the tests
firestore.rules         Collection gating — `bets` refuses DELETE by rule
firestore.indexes.json  The `owner`+`ts` composite index the bet reader needs
.github/workflows/      The scheduled jobs and the test run — see Archiving
```

**`index.html` is a stylesheet with a shell attached.** Lines 33–7178 are a
single `<style>` block; the ~135 lines after it are the head, the nav and a few
mount points. Every page body is built by a render function in `app.js`, so the
markup for a tab lives in the JS, not the HTML.

## Editing conventions

**Bump the service worker cache on every user-facing change.** `public/sw.js`
opens with `const CACHE = 'gfl-vNNN';`. Increment it, and note the new number in
the commit message as `sw gfl-vNNN` — that is the form the whole history uses.
Skipping the bump leaves installed home-screen PWA copies on stale assets. A
commit that touches only docs, tests or scripts is not user-facing and does not
need one.

**`public/config.js` is the weekly-content file.** If a change is about *this
week's content* rather than behaviour, it almost certainly belongs here and not
in `app.js` or `index.html`. It is deliberately heavily commented for
non-developer editing — preserve that commenting style. It currently holds
`big4`, `labels`, `excludeTeams`, `matchup`, `notifications`, `bucksTestMinutes`,
`betsResetBefore`, `plantTestMinutes`, `eggWindowHours`, `eggPrize`,
`tradeDeadlineWeek`, `ballKnowledge`, `punishment`, `badBeat` and `gabe`.

**CSS lives in `index.html`**, not a separate stylesheet. Each tab has an accent
colour, and homepage modules are coloured to match their tab's accent.

**Tabs** are driven by `data-tab` attributes. Fifteen are on the nav, in this
order: `home`, `week`, `book`, `standings`, `leaders`, `punishment`, `takes`,
`legacy`, `history`, `teams`, `tenure`, `draft`, `trades`, `badbeat`, `cm`.
The menu lays them out two to a row, so a button's place in that list decides
what it sits under: `takes` (Hot Takes) follows `punishment` so that it lands
directly under `leaders`. A new tab needs its button, `TAB_COLORS` and
`TAB_LABELS` entries, a `switchTab` hook, a `#page-<tab>` container in
`loadDashboard`, and the three accent rules in the stylesheet.

Three more tab names exist without a nav button:

- `profile` — My Locker Room, and a live page: `#page-profile`, rendered by
  `renderMyProfile()`. It is reached from the balance chip rather than the nav
  (`meBtnClick()` sends you there when signed in, and opens sign-in when not),
  so it will not turn up in a `data-tab` grep.
- `roster` — `renderRoster()`, `#page-roster` and a `.tab-btn[data-tab=roster]`
  accent all still exist, with no button pointing at them. Deliberately kept.
- `gabe` — not a tab at all any more. `renderGabe()` fills a `<details>`
  (`.lh-gabe`) on League History, and `config.gabe` still feeds it.

## Tests

`node --check` plus about seventy suites, `scripts/test-*.mjs`, each its own step
in `.github/workflows/tests.yml`, run on every push that touches
`public/app.js`, `api/**` or `scripts/**`. A new suite needs a step there as
well, or CI never runs it. All of them, locally:

```bash
node --check public/app.js && for f in scripts/test-*.mjs; do node "$f" >/dev/null || echo "FAILED $f"; done
```

**They lift the real functions out of `public/app.js` by string match and eval
them in a stub harness.** That is what keeps them honest — the thing under test
is the shipped source rather than a restatement of it — but it also means a
rename, a moved constant, or a new dependency inside a function they grab breaks
the harness rather than the feature. When a suite fails right after a refactor,
the fix is usually a grab string or one more stub in the test, not a change to
the app.

Anything a test asserts about the economy should come from `config.js` rather
than a number typed into the test, so that changing the config is what moves the
expectation. `test-bank-egg.mjs` reads `eggWindowHours` and `eggPrize` out of
the config file for exactly that reason.

**Run them before pushing.** Vercel deploys whether or not Actions is green, so
a red suite is easy to miss — one went unnoticed for 59 consecutive runs
across three days and a launch.

## The ESPN proxy

`api/espn.js` is a single handler switching on `?type=`. Existing types:
`athlete`, `draft`, `lineupiq`, `lineups`, `livepoints`, `logo`, `nflstate`,
`playergames`, `playerscores`, `pool`, `seasonstats`, `seasontenure`,
`seasontrades`, `topscorers`, `transactions`, `youtube`, plus `raw` and `txdump`
for diagnostics. Anything else falls through to a generic `?view=` passthrough
to ESPN. Add new capabilities as a new `type` branch.

Two upstream endpoints, chosen automatically: `leagueHistory` for past seasons,
`seasons/.../leagues` for the current one. Completed-but-recent seasons are
retried against the live endpoint because `leagueHistory` drops the transaction
log.

Auth is the `ESPN_S2` and `ESPN_SWID` cookies from env. They expire roughly
annually; when the dashboard stops loading, refresh them in Vercel project
settings. The handler returns HTTP 500 `ESPN credentials not configured` when
they are missing — including under any local server that isn't `vercel dev`.

**Every byte the proxy sends back out is metered.** The project is on Vercel's
Hobby plan, and on 3 Nov 2026 Vercel paused the whole site for a month for
running through its Fast Origin Transfer allowance. The cause was the live
read: full ESPN replies (every week's schedule, every team's roster, every
player's every stat line -- 5.9 MB for the week-8 matchup read) re-sent
every ten seconds while anyone watched, plus the poller's full-league read
every minute -- and every homepage visit pulling 16.8 MB of season reads and
rosters that went stale at the edge within a minute. The team moved to Pro,
but **the site must keep fitting the free plan** (about 10 GB a month of
this). So every passthrough reply now goes through `slimEspn` (fields
nothing reads), a live one through `slimLive` as well (one week, no
unrequested teams), and `passthroughCache` keeps each reply by its week:
finished weeks an hour, weeks to come half an hour, season reads ten
minutes, this week's live reads thirty seconds (LIVE DATA BUDGET in
`api/espn.js`). The browser's live beat and the poller's league read are
slowed to match. `scripts/test-data-budget.mjs` holds all of it, including a
priced free-plan month that must stay under 6 GB. Before adding a polled
request, shortening a cache, or reading a new field off an ESPN reply,
check it against that test: size times how often the edge copy expires is
what Vercel bills.

## Firestore

Project `ball-and-chain-dashboard`, addressed straight over the REST API — there
is no SDK. `GFL_DB` in `app.js` carries the project id and the public web key;
the rules do the gating, and every call fails soft, so an unreachable Firestore
leaves the site behaving exactly as it does signed out.

Four collections: `profiles`, `bets`, `live`, and `messages`, which holds Hot
Takes. A take is one document, stamped with the week it belongs to (`wk`, the
date of the Tuesday that week began — it turns at 06:00 Central) and named by an
inverted timestamp, so name order is newest first and the feed needs no index.
The page reads only this week's, and the rollover's last step
(`scripts/wipe-takes.mjs`) deletes the rest every Tuesday. The rules leave
`messages` open: "once it is posted it is locked in" is the app's rule, not the
database's, the same as the rest of the sign-in. Only `bft` (`TAKES_ADMIN`) is
shown a delete button.

`bets` allows read, create and update but **refuses delete by rule** — the
balance is derived by replaying the collection, so removing a bet would silently
rewrite history and hand back a losing stake. `live` is written only while games
are in progress, and is emptied into the repo once a week is final.

`live` also holds the daily drop: a `bkq-<season>-w<week>-d<day>` question
for each day from week 10 of 2026, and a `pke-<season>-w<week>-d<day>` pick'em
for each day from week 9 (`PKE_FROM_WEEK`), written once by the first browser to open that day and
read by every browser after (see THE DAILY DROP in `app.js`). The answers and
picks are on profiles as `bkd_` and `pkd_` fields. The pick'em documents are
what every pick'em all season is graded against, so nothing may delete them.

Punishment grades are on profiles too: `pg_<season>_w<week>` holds the letter
(F to A+) that manager gave that week's punishment. The punished manager is
the week's lowest scorer, read off the schedule, and is never asked to grade
their own. A week is graded a week late: its lowest scorer does the punishment
the following week, so week N's card opens on week N+1's Tuesday, and until
then no grade for it counts or shows (see GRADING THE PUNISHMENT in `app.js`).

Build a Manager (tab `bam`) reads no collection and writes one field, only for
a title (below). Its grades are one baseline
table in `config.js` (`buildManager.grades`, keyed by ESPN team id, set by hand
on 6 November 2026), and the game reads nothing live, by request: no grade may
be fixed while another moves. If grades are ever made to move with the season,
the movement goes in `bamGrade` on top of every baseline at once. A build in
progress is kept in localStorage under `lsKey('bam')`. The overall is 0-99,
the mean of `BAM_PTS` (what each grade is worth). A finished manager spins
ONCE for a team and is locked to it, then plays ONE season (THE SEASON in
`app.js`), saved with the build before it is revealed a game at a time, so it
cannot be re-rolled; Start over is the only way back. Strength is 60% the
manager's overall and 40% the roster's points this season (`BAM_MGR_W`).

Sharing is the recap picture, never the site: a link from a message opens the
browser, not the home-screen app people are signed in to. A finished build is
`/b/<code>` (version 1: twenty base-36 characters, the builder's team id and
each slot's team id and grade; version 2 adds five for the season). `vercel.json`
rewrites it to `api/bam.js`, which draws the PNG itself (no dependencies) and
answers a person with that picture alone. On a phone, Share sends the picture
file, with no title text. The pictures are the game's only Vercel cost, priced
in `test-data-budget.mjs`, and each is cheap to draw (zlib level 6 and a cached
background: about 21 ms of CPU, not 155). The game is drawn in the card's own
5x7 type (`bamPx`, `BAM_G` = `G` in `api/bam.js`). `/?bam=<code>` still opens a
build in the game for old links.

A title (first place at the end of the one season) is the game's only write:
`bamRecordWin` patches `bamWin`, JSON `{t, code}`, onto the winner's own profile,
signed in only, and only the latest title is kept. `ntBamWins` reads it off the
profile list the app already loads, so it costs no read, and puts the winner's
picture at the top of everyone's home stack for `BAM_WIN_DAYS` (7) from the day
it was won. Under the build, "See all managers' ratings" opens
`#bam-rate-overlay`: a tab per manager, best overall first (`bamRateOrder`),
each showing that manager's nine grades in the game's own tiles. The tile's
parts are `bam-ttop`/`bam-tbot`; `bam-ta`...`bam-tf` are the grade colours, and
the two must never share a name (`bam-tb` once meant both, and B tiles broke).

Rules and indexes are **not** part of the Vercel push; they ship with the
Firebase CLI (`firebase deploy --only firestore:rules`, or `firestore:indexes`).
An ordered query on a filtered field needs a composite index, and without one
the whole request fails with a 400 rather than degrading.

## Local development

`vercel dev` is required — a plain static server over `public/` renders the
shell but every tab fails with `ESPN API 404`, because the frontend calls
`/api/*` on the homepage.

```bash
vercel dev
```

Needs `vercel login` and `vercel link` first. Then, two gotchas:

1. **`vercel dev` reads `.env`, not `.env.local`.** `vercel env pull` writes to
   `.env.local` by default, so the pulled file is ignored and every route fails
   with `500 ESPN credentials not configured`. Copy it: `cp .env.local .env`.
2. **`ESPN_S2`, `ESPN_SWID` and `GITHUB_TOKEN` are typed Sensitive in Vercel**,
   and Sensitive values cannot be read back. `vercel env pull` writes an
   11-character placeholder for each instead of the real value. They have to be
   filled in by hand.

`ESPN_S2` is the ~320-char `espn_s2` cookie from a logged-in
`fantasy.espn.com` session (DevTools → Application → Cookies). `ESPN_SWID` is
the 38-char GUID in braces recorded in `README.md`. A quick way to tell they are
in the right slots is length: 320 vs 38.

`.claude/launch.json` has three entries: `gfl-attach` points at an
already-running server on port 3000, `gfl-dev` starts one, and `gfl-preview`
runs the credential-free preview below. `gfl-dev` cannot
work from a shell without Vercel credentials — it exits with "No existing
credentials found" — so attaching to a server started interactively is the
reliable path.

**To look at the front end without credentials**, `node scripts/preview.mjs`
serves `public/` on port 5178 and forwards `/api/*` to the live site, so every
tab has real data. `?as=<username>&team=<id>` on the URL signs you in as that
team, and `?out` signs you out. It blocks every Firestore write, keeping Hot
Takes posts and placed bets in the page's memory instead, so nothing done in
the preview reaches the league's data.

`.gitignore` covers `.env*` and `.vercel`. Never commit cookie values.

## Archiving

ESPN purges the detailed transaction log after each season, which is why
2022–2025 waiver history is gone and cannot be recovered. The scheduled jobs
that keep everything since:

| Job | When | What it does |
|---|---|---|
| `api/archive` — Vercel cron (`vercel.json`) | Tue 09:00 UTC | Commits `transactions-<year>.json` through the GitHub contents API |
| `rollover.yml` | Tue + Wed, every 20 min, 04:10–13:50 UTC | The week rollover, in order: the win-probability series out of Firestore `live` and into the repo, the Coaches' Poll, settling bets, freezing prices, trades, then wiping last week's Hot Takes. Each step is a no-op once its work is on file. |
| `archive-transactions.yml` | Wed + Sun 14:30 UTC | `scripts/archive-transactions.mjs`, merged by transaction id |
| `capture-trades.yml` | Hourly at :23 | Captures trades as they happen |
| `poll-live.yml` | Every 5 min through game windows | Polls the live scoreboard into Firestore `live` |
| `refresh-videos.yml` | Hourly at :17 | Refreshes `public/data/videos.json`, because YouTube answers Vercel's IPs with random 404s |

`archive-week`, `archive-poll`, `settle-bets`, `archive-charts` and
`archive-trades` still exist as workflows, but only for running by hand: their
schedule is `rollover.yml`'s. GitHub runs scheduled jobs late and less often
than asked, which the comment at the top of `rollover.yml` explains.

The Vercel cron needs a `GITHUB_TOKEN` env var with write access to this repo;
without it the endpoint returns `committed: false` and quietly does nothing. The
Actions jobs use the workflow's own token. `public/data/README.md` has the
per-file detail and the manual fallbacks.

## Do not

- Store this repo inside OneDrive. A previous clone on the OneDrive Desktop had
  its `.git/objects/pack/*.pack` file dehydrated away, corrupting history
  irrecoverably. Keep it on a local path (`C:\dev\gfl-dashboard`).
- Commit `public/data/season-*.json` regenerations without checking the diff —
  they are ~730KB each and churn noisily.
- Reintroduce a whole-collection Firestore read on a page people visit often.
  `betList()` queries by owner against the composite index; `betLeague()` reads
  the whole `bets` collection once per session, and only the Leaderboards use it.
