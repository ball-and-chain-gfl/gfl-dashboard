# Ball & Chain GFL Dashboard

Fantasy football dashboard for a private ESPN league (`leagueId 1327340807`).
Vanilla HTML/CSS/JS frontend, two Vercel serverless functions, and Firestore for
the one thing that cannot be derived — the decisions people made. No build step,
no framework, no dependencies: `package.json` has no `dependencies` and no
`scripts`, it exists only to pin `node: 24.x`.

Deployed at https://gfl-dashboard.vercel.app from `main` on
https://github.com/ball-and-chain-gfl/gfl-dashboard — every push to `main`
deploys.

## Three documents

- **`CLAUDE.md`** (this file) — repo rules and conventions. Read first.
- **`HOW-IT-WORKS.md`** — what the app is for, where its data comes from, and
  what every page does.
- **`HANDOFF.md`** — the state of play: live accounts, open items, and the traps
  that have already cost somebody time.

`public/data/README.md` documents the archive files on their own terms.

## Layout

```
api/espn.js             ESPN API proxy — one handler, branches on ?type=
api/archive.js          Snapshots the transaction log into git (Vercel cron)
public/index.html       The shell + every line of CSS (6.1k lines)
public/app.js           All frontend logic (14.6k lines)
public/config.js        Hand-edited weekly content and tunables
public/sw.js            Service worker / PWA cache
public/data/*.json      Archived per-season data, committed to git
scripts/*.mjs           Archivers, one-off fetchers, and the test suite
firestore.rules         Collection gating — `bets` refuses DELETE by rule
firestore.indexes.json  The `owner`+`ts` composite index the bet reader needs
.github/workflows/      Four scheduled jobs — see Archiving
```

**`index.html` is a stylesheet with a shell attached.** Lines 33–5962 are a
single `<style>` block; the ~120 lines after it are the head, the nav and a few
mount points. Every page body is built by a render function in `app.js`, so the
markup for a tab lives in the JS, not the HTML.

## Editing conventions

**Bump the service worker cache on every user-facing change.** `public/sw.js`
line 7 is `const CACHE = 'gfl-v517';`. Increment it, and note the new number in
the commit message as `sw gfl-v518` — that is the form the whole history uses.
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

**Tabs** are driven by `data-tab` attributes. Fourteen are on the nav, in this
order: `home`, `week`, `book`, `punishment`, `teams`, `leaders`, `standings`,
`tenure`, `legacy`, `history`, `draft`, `trades`, `badbeat`, `cm`.

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

`node --check` plus four suites, run by `.github/workflows/tests.yml` on every
push that touches `public/app.js` or `scripts/**`:

```bash
node scripts/test-invites.mjs    # invitations, seats, and the bucks balance
node scripts/test-bank-egg.mjs   # the compounding bank and the egg's placement
node scripts/test-odds.mjs       # odds react to money
node scripts/test-next-bid.mjs   # next-highest waiver bid
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
a red suite is easy to miss — this one went unnoticed for 59 consecutive runs
across three days and a launch. `HANDOFF.md` §11 has the post-mortem.

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

## Firestore

Project `ball-and-chain-dashboard`, addressed straight over the REST API — there
is no SDK. `GFL_DB` in `app.js` carries the project id and the public web key;
the rules do the gating, and every call fails soft, so an unreachable Firestore
leaves the site behaving exactly as it does signed out.

Four collections: `profiles`, `bets`, `live`, and `messages` (retired, empty).
`bets` allows read, create and update but **refuses delete by rule** — the
balance is derived by replaying the collection, so removing a bet would silently
rewrite history and hand back a losing stake. `live` is written only while games
are in progress, and is emptied into the repo once a week is final.

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

`.claude/launch.json` has two preview entries: `gfl-attach` points at an
already-running server on port 3000, and `gfl-dev` starts one. `gfl-dev` cannot
work from a shell without Vercel credentials — it exits with "No existing
credentials found" — so attaching to a server started interactively is the
reliable path.

`.gitignore` covers `.env*` and `.vercel`. Never commit cookie values.

## Archiving

ESPN purges the detailed transaction log after each season, which is why
2022–2025 waiver history is gone and cannot be recovered. Four scheduled jobs
keep everything since:

| Job | When | What it does |
|---|---|---|
| `api/archive` — Vercel cron (`vercel.json`) | Tue 09:00 UTC | Commits `transactions-<year>.json` through the GitHub contents API |
| `archive-transactions.yml` | Wed + Sun 14:30 UTC | `scripts/archive-transactions.mjs`, merged by transaction id |
| `archive-week.yml` | Tue + Wed 09:30 UTC | Moves a finished week's win-probability series out of Firestore `live` and into the repo |
| `refresh-videos.yml` | Hourly at :17 | Refreshes `public/data/videos.json`, because YouTube answers Vercel's IPs with random 404s |

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
