# Handoff — Ball & Chain GFL Dashboard

Written 2026-08-27, at `sw gfl-v517`. Read `CLAUDE.md` first for the repo's
shape and rules; this is the state of play on top of it.

The site went live for the league on 2026-08-27. Everything below either just
changed, is about to matter, or is a trap somebody should know about before
they touch it.

---

## 1. Accounts and the test profile

Thirteen documents in `profiles`. Twelve managers plus one account that is not a
manager.

| Username | Team | Password |
|---|---|---|
| `bft` | The Bryan Football Team | 151 |
| `bi` | Bismuth | 177 |
| `dorm` | Team silly willy | 839 |
| `fman` | Florida Man | 938 |
| `goob` | Bikini Bottom Goobers | 189 |
| `kunk` | Lebron's 3rd Leg | 950 |
| `kw` | Whittingham Sports | 186 |
| `mcm` | Motor City Mulligans | 413 |
| `mm` | Marathon Men | 370 |
| `mwm` | Midwest Miners | 672 |
| `ting` | Tuckasegee Tinglers | 140 |
| `wglr` | West Coast Wigglers | 578 |
| **`test`** | *(none)* | **123** |

`test` is the testing account. `TEST_PROFILE` in `app.js` names it, and nine
switches answer to it and to nothing else:

- demo notification cards (`notifications.demo`)
- the 30-minute GFL Bucks cycle (`bucksTestMinutes`)
- the 15-second plant stage (`plantTestMinutes`)
- one Ball Knowledge question of every kind (`ballKnowledge.previewAll`)
- the two-ballot Coaches' Poll reveal (7 for everyone else)
- two config hints on the Punishments tab

The league and anyone signed out get the live site regardless of what those
config values say. **Leave them on.** Turning one off only takes it away from
`test`.

`MOTW_PICKER` is `'bft'` and is deliberately *not* `TEST_PROFILE`. They were the
same string once; separating them is what stopped the Matchup of the Week being
handed to an account nobody signs into.

`teamAccountIds()` is a closed set — the twelve abbreviations plus `test`. There
is no sign-up path and no profile-creating helper, on purpose. Adding a
thirteenth manager means writing the document outside the app.

---

## 2. What is live and what it costs

Deployed at <https://gfl-dashboard.vercel.app> from `main`. **Every push to
`main` deploys.**

- **Always bump `public/sw.js` line 7** (`const CACHE = 'gfl-vNNN'`) on any
  user-facing change and put the new number in the commit message as
  `sw gfl-vNNN`. Skipping it leaves installed PWA copies on stale assets.
- **The deploy webhook does occasionally miss.** On 2026-08-27 Vercel created no
  deployment at all for one commit — not queued, not failed, absent from the
  deployments list. If a change will not go live, check the Vercel deployments
  API before assuming it is slow. The fix is an empty commit to re-trigger; see
  `cc4c6b3`.
- Confirm a deploy by polling `https://gfl-dashboard.vercel.app/sw.js` for the
  cache version you just shipped.

---

## 3. The economy

Everything is derived and replayed — nothing about a balance is stored.

- **$100 a week**, Tuesday 06:00, compounding. `BUCKS_WEEKLY` in `app.js`.
- **Balance** = allowance − staked + returned + eggs − net invested, floored at
  zero. Every manager currently sits on exactly $100.
- **Eggs**: `eggWindowHours` and `eggPrize` in `config.js`, currently 12 hours
  and $10 — a ceiling of $140/week before anybody has to actually find one. It
  was **five minutes** through the build, which is 2,016 a week and $20,160.
  That was the one testing speed-up never gated behind the test account.
  Raising the window lowers the ceiling; the arithmetic is written in the config
  comment.
- **A find is a window number**, and window numbers only mean anything under the
  window length that recorded them. Changing `eggWindowHours` renumbers
  everything, so `eggsFound()` drops any stored find that is not plausible under
  the current scheme — nothing from the future, nothing older than two years of
  windows. That heals stale devices on their next load. **Do not remove that
  filter**: `eggClaim` writes the whole set back to the profile, so without it a
  scheme change resurrects dead finds and pays for them.

---

## 4. Ball Knowledge

Scale is **0–300, everyone opens at 150**, `iq.step` is **1**. Nine bands, even
thirds, "Average Ball Knower" straddling the middle.

Three things move it, all worth one point except where noted:

1. **The weekly trivia** — right up, wrong down, and a blank down *once the
   week's football has kicked off*. Before kickoff a blank costs nothing, so
   there is a full week to answer in.
2. **Matchup picks** — graded as results land. **The Matchup of the Week pick
   counts double.**
3. **Settled bets** — won up, lost down.

**Only the current week's trivia is graded, and that is a limit rather than an
oversight.** The questions are generated from live data — a player's rank now is
not their rank in week three — so a past week cannot be rebuilt and marked
without scoring people against questions they were never asked. Picks and bets
are the cumulative half of the number; trivia is the live half. If cumulative
trivia is ever wanted, the honest way is to grade at answer time and store the
running score on the profile.

Six question kinds: manager, group, rank, graph, bio, teamranks. The statistical
ones look back at last season until this one has enough football in it — four
weeks for the points questions, six for the six-week shape — and the wording
switches with the data ("in 2025" against "this year").

---

## 5. Charts and when they update

Both charts plot **money made, against zero**. Neither plots a balance.

| | My Bets | My Portfolio |
|---|---|---|
| Plots | winnings and losses from bets | profit on shares, banked plus open |
| Baseline | 0 | 0 |
| Buckets | calendar weeks (real Tuesday) | one point per Tuesday |
| Source | settled bets only | the share ledger, replayed |

Portfolio profit is **realised plus unrealised**: a share bought at $1 and sold
at $20 leaves +$19 baked into the total permanently, and a share bought at $15
now worth $20 counts as +$5 while it is still held. Both verified against worked
cases.

**Updates are lazy — there is no cron.**

- A bet moves the chart when it **settles**, and settlement happens the next
  time somebody opens the Sportsbook: `initBets()` → `betSettleAll()` grades
  every open bet whose market now has an answer and writes the result back.
- The portfolio chart is recomputed on every render.
- **Share prices change when a week's results land** — once a week. They are a
  function of record, scoring and recent form through the last completed week,
  divided by the league mean, so the average share is always worth $10 and one
  team climbing means another slips. Buying does **not** move a price; demand is
  deliberately not modelled, because with twelve people who can see each other's
  moves it would be trivially gamed.

### Two known chart caveats

- `invBoard()` caches on `season | franchises | teams` and **not on the week**,
  so if a new week's results land mid-session the price board will not refresh
  until a reload. Low impact, easy fix, not yet done.
- Between seasons the ledger's season and the price season disagree — a lot
  bought in August 2026 is stamped week 1 and would be priced against 2025's
  weeks 1–17. Out of season the line is walked by the **calendar** instead: one
  point per real Tuesday from the first trade to this one, realised profit taken
  off the trade timestamps and unrealised measured against today's price. That
  is exact rather than approximate — nothing has been played, so no price has
  moved since any of those trades. In season the fantasy-week series takes over,
  which is the same Tuesday cadence by another route: a week's prices settle
  when its results land.

---

## 6. Event timing

| Event | Fires |
|---|---|
| Notification day, Matchup of the Week card | **Tuesday 00:00** |
| GFL Bucks week and bet cycle | **Tuesday 06:00** |
| Egg window rolls | every 12 hours |
| Plant stage | 3 days; dead after 5 stages (15 days) |

The two Tuesday boundaries differ on purpose — the 6am bucks line means a late
Monday-night bet still counts to the right week. It does leave a six-hour window
on Tuesday morning where the new week's cards are up and bets still belong to
last cycle.

---

## 7. Firestore, and what it will and will not allow

Collections: `profiles` (13), `bets` (39), `live` (0), `messages` (0).

- **`bets` refuses DELETE — 403, by rule.** That is deliberate: a losing bet must
  not be able to vanish. The 39 documents are all pre-season test bets and are
  excluded everywhere by `betsResetBefore` in `config.js`; every reader honours
  it (`betsMine`, `ldBets`, the bankroll chart, the balance). Verified 0 of 39
  count. Genuinely removing them needs the Firebase console or an admin
  credential — it cannot be done with the web key.
- **Reads are the thing to watch.** `betList()` queries by owner with a
  composite index (`owner` + `ts`); `betLeague()` is the one call that reads the
  whole collection, filtered to the current season, once per session, and only
  the Leaderboards use it. Do not reintroduce a whole-collection read on a page
  people visit often.
- `firestore.indexes.json` carries the `owner`+`ts` index. If a query starts
  failing with a 400, an index is missing — an ordered query on a filtered field
  needs one, and asking for the order without it fails the whole request.
- Profile documents are tiny (2.4KB at the largest, 0.2% of the 1 MiB limit) and
  grow ~50 small fields a season. Not a concern for years.

---

## 8. Traps worth knowing before touching things

- **`labelTables()` pins the identity column on any table it thinks scrolls**,
  and a pinned column paints a shadow down its right edge that reads as a stray
  line beside the numbers. `.nostick` opts a table out entirely; `.noseam` keeps
  the pin and drops the shadow. Standings uses `.noseam`.
- **Money on a twelve-row board must be compact** (`ldMoney`) or the table
  outgrows a phone and starts scrolling — which brings the pinned column, and
  the stray line, straight back.
- **Read the rendered DOM before writing CSS against it.** Two rounds of
  `flex-wrap:nowrap` did nothing on the Ball Knowledge band because the label
  lived in a `.bkiq-labrow`, not the `.bkiq-r` wrapper I assumed. Dumping
  `innerHTML` found it in seconds.
- **The ESPN combiner returns a square if you pass both `w` and `h`.** Pass
  width only or every headshot comes back squashed; the source is 600×436.
- **`bkSeason()` is not the season being played.** It answers with the newest
  season that has a score in it, which in August is last year. The quiz anchors
  on `bkLeagueSeason()` instead. Anything asking "what season is it" should
  think about which of the two it means.
- **The Browser pane sometimes stops compositing**, so screenshots time out
  while `javascript_tool` still works. Measure geometry from the DOM when that
  happens, and say so rather than claiming a visual check.

---

## 9. Local development

`vercel dev` is required — a plain static server renders the shell but every tab
fails with `ESPN API 404`. See `CLAUDE.md` for the `.env` gotchas (it reads
`.env`, not `.env.local`, and the sensitive values pull as placeholders).

`.claude/launch.json` has two entries: `gfl-attach` points the preview at an
already-running server on port 3000, and `gfl-dev` starts one. **`gfl-dev`
cannot work from a shell without Vercel credentials** — it exits with "No
existing credentials found" — so attaching to a server started interactively is
the reliable path.

---

## 10. Open items

- `config.js` still needs real content: the seventh punishment is named
  "TBD Seventh", six of seven punishment descriptions are blank, and weeks 2–14
  of `punishment.schedule` are empty. The league sees "TBD" for all of it. The
  editor hints that name config keys are shown to `test` only.
- `tradeDeadlineWeek: 11` is still the placeholder the comment says it is.
- `badBeat.entries` is empty, but the Bad Beat tab computes itself from real
  data and does not need it.
- The `matchup` block in config no longer drives the picks grid — the Matchup of
  the Week is chosen from BFT's Tuesday card. The hidden Matchup of the Week
  module still reads it.
- The Rosters tab is off the nav but `renderRoster()` and `#page-roster` are
  still in the source, unreferenced, deliberately kept.
