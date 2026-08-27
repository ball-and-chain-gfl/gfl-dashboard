# How the GFL Dashboard works

Written 2026-08-27 at `sw gfl-v517`. This is the functional reference — what
the app is for, where its data comes from, and what every page does.

Two companion documents:

- **`CLAUDE.md`** — repo rules and conventions. Read first.
- **`HANDOFF.md`** — current state, live passwords, open items, and the traps
  that have already cost somebody time.

---

## 1. What this is, and what it is for

A private dashboard for one twelve-team ESPN fantasy football league
(`leagueId 1327340807`). ESPN already tells you who won. This exists to say the
things ESPN will not:

- **Keep the league talking mid-week.** Football happens on Sunday; the site is
  built for Tuesday-to-Saturday, when there is nothing to watch. Notifications,
  trivia, picks, the poll, a betting book and a share market all exist to give
  twelve people a reason to open it on a Wednesday.
- **Score judgement, not luck.** Fantasy results are mostly variance. **Ball
  Knowledge** is the counter-metric: it only moves on calls a manager actually
  made — trivia answered, games picked, bets placed.
- **Remember.** ESPN deletes the transaction log at season end. The site
  archives it to git so the league's history survives.
- **Be a running joke with a scoreboard.** The plant, the egg hunt, the
  punishments, trash talk. None of it is serious; all of it is scored.

**Architecturally there is one governing idea: nothing is stored that can be
derived.** Balances, records, streaks, standings, share prices, Ball Knowledge —
all replayed from source data on every render. Two devices can never disagree
about a total, and a corrected result corrects everything downstream for free.
The only things written are the decisions a person made.

---

## 2. The shape of it

No build step, no framework, no dependencies. `package.json` exists to pin
Node 24.

```
api/espn.js          ESPN proxy — one handler, branches on ?type=
api/archive.js       Snapshots the transaction log into git (weekly cron)
public/index.html    The shell + every line of CSS (~6k lines, nearly all CSS)
public/app.js        Every line of frontend logic, page markup included (~14.6k)
public/config.js     Hand-edited weekly content and tunables
public/sw.js         Service worker / PWA cache
public/data/*.json   Archived per-season data, committed to git
scripts/*.mjs        Archivers, one-off fetchers, and four test suites
```

Every page body is built by a render function in `app.js`; `index.html` holds
the head, the nav and the mount points, and one 5.9k-line `<style>` block.

Deployed on Vercel from `main`. **Every push deploys.** Bump `sw.js`'s cache
version on any user-facing change or installed PWA copies keep stale assets.

### Where data comes from

Three sources, in order of preference:

1. **Committed archives** (`public/data/*.json`) — free, instant, permanent.
   `histJSON()` tries these first for any completed season.
2. **The ESPN proxy** (`/api/espn`) — live seasons and anything not archived.
   Auth is the `ESPN_S2` / `ESPN_SWID` cookies in Vercel env; they expire about
   annually, and when the dashboard stops loading that is usually why.
3. **Firestore** — the only place *people's own decisions* live.

The proxy's `?type=` branches: `pool`, `draft`, `lineups`, `lineupiq`,
`playergames`, `playerscores`, `seasonstats`, `seasontenure`, `seasontrades`,
`topscorers`, `transactions`, `livepoints`, `nflstate`, `athlete`, `logo`,
`youtube`, plus `raw`/`txdump` for diagnostics. Anything else falls through to a
generic `?view=` passthrough.

### Firestore

Four collections. The web API key is public; Firestore rules do the gating.

| Collection | Holds | Notes |
|---|---|---|
| `profiles` | 13 docs — twelve managers plus `test` | every personal decision |
| `bets` | bet slips | **DELETE is refused by rule** — a losing bet must not vanish |
| `live` | in-progress score series | written only while games are live |
| `messages` | *(empty — retired feature)* | |

**The profile document is the schema.** One document per account, one flat field
per decision, keyed so it expires naturally:

| Field | Meaning |
|---|---|
| `k1`, `k2` | username, password |
| `teamId` | which franchise this account is |
| `bk_<season>_w<week>` | that week's Ball Knowledge answers |
| `pk_<season>_w<week>` | that week's matchup picks (+ `_sub` when submitted) |
| `cp_<season>` | Coaches' Poll ballot |
| `vote_<season>_w<week>` | Matchup of the Week vote |
| `tv_<tradeid>` | trade verdict |
| `motw_<season>_t<tuesday>` | which fixture is this week's Matchup |
| `motwwk_<season>_w<week>` | the same, filed by week so it can be found later |
| `inv` | the share ledger — every buy and sell |
| `eggs` | window numbers found |
| `plantWatered` | one timestamp |
| `ntSeen` | dismissed notification ids |
| `tt_<from>` | a trash-talk message waiting |

Two things to understand about this design. **Keys carry their own expiry** — a
week key stops being read when the week rolls, so nothing needs cleaning up. And
**there is no profile-creating path in the app**: `teamAccountIds()` is a closed
set of the twelve abbreviations plus `test`. Sign-in used to mint an account for
any name typed at it, which is how three orphan profiles came to exist; they
were deleted on 2026-08-27.

### Sign-in

Deliberately not real auth. Username is the team abbreviation, password is three
digits, and both live in the Firestore document. It gates *whose decisions you
are editing*, not access — signed out, the whole site works, you just cannot
answer anything. `_me` is `{k1, k2, teamId}` in `localStorage`.

---

## 3. The economy

**GFL Bucks.** $100 lands every Tuesday at 06:00 and compounds. Everyone opened
the 2026 season on exactly $100.

Balance is derived, never stored:

```
allowance (100 × cycles) − staked + returned + eggs − net invested,  floored at 0
```

`cycles` counts Tuesdays since a manager's first bet, so somebody who has never
bet has exactly one allowance.

**The nav chip** shows the balance on every page. It is hidden signed out —
the number is derived from a profile's own bets and holdings, so a visitor would
be shown somebody else's money.

---

## 4. The homepage

Four modules, each in a tinted glass pane keyed to its own accent, plus the
video rail and a pinned punishment bar.

### Video rail
The three newest Ball & Chain uploads in a carousel. The newest slide's caption
wears the "New video" ribbon's colour. The feed comes from YouTube RSS via the
proxy, with a committed snapshot (`public/data/videos.json`, refreshed by a
GitHub Action) as fallback because YouTube sometimes 404s Vercel's IPs. The
list paints from cache and corrects itself when the refresh lands.

### Coaches' Poll (`cp-sec`)
Rank all twelve teams best to worst. **Results are withheld until you have
voted** — seeing the league's answer first would make the late voters
ratifiers rather than voters. Reveals at 7 ballots (2 for `test`).

### Notifications (`nt-sec`)
A swipeable stack, one card at a time, newest first with pinned cards on top.

**Every card is derived, not stored.** A notification's id *describes the event*
(`bl:2025:3:owner`), so dismissing one is a single string on the profile and the
same event never returns. Rebuild the list and the same cards come back.

Fourteen kinds: `motw`, `standings`, `blowout`, `wire`, `perfect`, `plant`,
`crown`, `faab`, `rival`, `trade`, `parlay`, `streakW`, `streakL`, `trash`.

Two carry obligations and **refuse to clear until answered** — the X is dead and
a swipe springs back:

- **`trade`** — who won this trade? Changeable while the card is up; the swipe
  commits it.
- **`motw`** — BFT only, every Tuesday, naming the week's Matchup of the Week.
  Tap to arm, Confirm to commit. **Pinned above everything else**, because
  until it is answered the league's picks grid is locked.

### Matchup Picks (`pk-sec`)
Pick a winner in all six games. One is the Matchup of the Week and **counts
double**. The grid is faded and inert until BFT names it. Locks when the week's
football starts.

### Ball Knowledge (`bk-sec`)
Five trivia questions a week, generated rather than written. See §6.

---

## 5. Every other page

| Tab | What it does |
|---|---|
| **Schedule** (`week`) | Your forecast — win odds from the B&C power ratings, the week's slate, and the trash-talk box for your opponent |
| **B&C Sportsbook** (`book`) | Four boards plus two personal views — see §7 |
| **Punishments** | This week's punishment, the menu, and the season schedule from `config.js` |
| **Team Profiles** (`teams`) | Hero (crest, honours, Ball Knowledge), Legacy Report, season and all-time stat panels, draft grades, head-to-head, all-time lineup |
| **Leaderboards** (`leaders`) | The league against itself — see §8 |
| **Standings** | The sortable full table: record, PF/PA, moves, trades, Coaching Metric, all-time columns |
| **Player Data** (`tenure`) | Every player every manager has ever rostered, weeks started vs benched, and biggest enemies |
| **League History** (`legacy`) | Champions, season superlatives, records |
| **Head to Head** (`history`) | Every matchup between any two franchises, all-time |
| **Draft Report** (`draft`) | Draft grades by season, all-time draft rankings, steals and busts |
| **Trades** | Every trade, scored by share of post-trade points, with the league's verdict where it was voted on |
| **Bad Beat O'Meter** (`badbeat`) | Computed misery: unlucky losses, high scores that lost, closest defeats |
| **Coaching Metric** (`cm`) | The metric and its three components broken out |
| **My Locker Room** (`profile`) | Your room, your plant, your eggs, and a door into anyone else's |

### The Coaching Metric

One number for how well a manager *managed*, as opposed to how their players
happened to score. Three components, summed then z-scored across the league so
the average manager sits at 0:

- **C1 — scoring**: points for, against the league average, ÷10.
- **C2 — trades**: points scored *from the trade week onward* by everyone you
  received, minus the same for everyone you sent. ÷10.
- **C3 — waivers**: for each pickup, the points that player then scored in your
  lineup ÷ the margin you overbid by. Winning a player by $1 and starting him
  all year scores enormously; overpaying by $40 scores almost nothing.

### The Legacy Report

On each team profile: what changed in the all-time records this week, and which
all-time positions this franchise now holds. It carries `data-nochip` so it does
not appear in the page's jump-chip bar — it is a report the profile carries,
not a section of it.

---

## 6. Ball Knowledge

**The point of the site's scoring.** Scale 0–300, everyone opens at 150,
`iq.step` is 1. Nine evenly-spaced bands from "Profound Impairment" to "Ball
Lover", with "Average Ball Knower" straddling the middle.

Three inputs, all worth one point except where noted:

1. **Weekly trivia** — right up, wrong down. A blank counts wrong too, *but only
   once the week's football has kicked off*, so there is a full week to answer.
2. **Matchup picks** — graded as results land. **Matchup of the Week counts
   double.** Cumulative across the season.
3. **Settled bets** — won up, lost down. Cumulative.

Only the **current** week's trivia is graded. That is a limit, not an oversight:
the questions are generated from live data, so a past week cannot be rebuilt and
marked without scoring people against questions they were never asked.

### How the questions are generated

Nothing is hand-written. A seeded generator keyed on season and week produces
the same five questions for the whole league, in the same order, and reloading
does not reroll them. Six kinds, each returning `{q, a[4], correct, note}` or
`null` when its data is not there:

| Kind | Asks |
|---|---|
| `manager` | Which manager is this? — three of eighteen all-time facts |
| `group` | Which team's RBs/WRs scored most, **out of these four**? |
| `rank` | Who finished as the WR17 in full PPR? — ranks 10–36, QB/RB/WR |
| `graph` | Whose season is this? — six weeks as a bar chart |
| `bio` | Which player is this? — college + mascot, position, draft year |
| `teamranks` | Which NFL team has these three fantasy finishers? |

The statistical ones **look back a year** until this season has enough football
in it — four weeks for the points questions, six for the six-week shape — and
the wording switches with the data ("in 2025" versus "this year"). That needs
one player pool per season, and `bkPool()` returns nothing rather than falling
through to the wrong season's totals.

**`bkSeason()` is not the season being played.** It answers with the newest
season that has a score in it, which in August is last year. The quiz anchors on
`bkLeagueSeason()` instead.

---

## 7. The Sportsbook

Play money. Four boards, plus My Bets and My Portfolio.

**This Week** — every fixture with moneyline, spread and total, plus six weekly
markets: highest score, lowest score, closest game, biggest blowout, top player,
and the donut (does any starter score zero or less, excluding D/ST).

**Regular Season** — futures: championship, last place, playoff berth, most/
fewest points for, most points against, highest single week, season win totals,
points over/under, conference winners.

**By Team** — the same markets grouped by franchise.

**Investments** — a share market on the twelve franchises, plus two ETFs (East
and West) that hold every team in a conference at their average price.

### How share prices work

A share opens at $10. Price is a function of three ratios, each 1.00 for a
perfectly average team — record against .500, points per game against the league
average, and form over the last three weeks — then divided by the league's own
mean, so **the average share is always worth $10 and one team climbing means
another slips**.

**Buying does not move a price.** Demand is deliberately not modelled: with
twelve people who can see each other's moves, buy-watch-it-rise-sell would be
trivially gamed. Results move prices, nothing else.

**Prices change once a week**, when a week's results land.

### The two charts

Both plot **money made, against zero**. Neither plots a balance.

- **My Bets** — winnings and losses from settled bets, bucketed by calendar
  week.
- **My Portfolio** — realised plus unrealised profit, one point per Tuesday. A
  share bought at $1 and sold at $20 leaves +$19 in the total permanently; a
  share bought at $15 now worth $20 counts +$5 while still held.

**Updates are lazy — there is no cron.** A bet moves the chart when it settles,
and settlement happens the next time anyone opens the Sportsbook: `initBets()`
→ `betSettleAll()` grades every open bet whose market now has an answer.

### Reading bets economically

`betList()` queries **by owner** using the `owner`+`ts` composite index.
`betLeague()` is the only call that reads the whole collection — filtered to the
current season, once per session, and only the Leaderboards use it. Reading the
whole collection on a page people visit often is what would burn the free tier.

---

## 8. Leaderboards

Four boards, all derived from the profile list the homepage already fetches plus
one season-scoped read of `bets`.

- **Ball Knowledge** — every manager ranked, bar and band label, green-to-red on
  the absolute 0–300 scale.
- **Bets & Portfolios** — a filter between the two, a column chart above and a
  standings-styled table below: bucks, profit, record, ROI.
- **Matchup Picks** — cumulative season record as progress bars.
- **Eggs Found** — a four-across grid.

---

## 9. The side games

**The plant.** One per locker room. Six stages from Thriving to Dead, **three
days a stage**, so fifteen days of neglect kills it. State is one watering
timestamp; the stage is computed from it. The interval belongs to *the plant*,
not the viewer — otherwise one manager's test settings would rewrite the whole
league's greenery.

**The egg hunt.** One egg hidden on one tab at a time. When the window rolls the
old one is gone — no queue, no catching up. `eggWindowHours` and `eggPrize` in
config, currently 12 hours and $10.

A find is stored as a *window number*, which only means anything under the
window length that recorded it. Changing the window renumbers everything, so
stored finds are validated against the current scheme on read. **Do not remove
that filter** — `eggClaim` writes the whole set back to the profile, so without
it a scheme change resurrects dead finds and pays for them.

**Trash talk.** One message at a time to your week's opponent, sent from the
Schedule tab's forecast. It lands as a notification on their homepage, and
clearing it is what gives the sender their slot back.

---

## 10. Timing

| Event | Fires |
|---|---|
| Notification day, Matchup of the Week card | **Tuesday 00:00** |
| GFL Bucks week and bet cycle | **Tuesday 06:00** |
| Share prices | when a week's results land |
| Egg window | every 12 hours |
| Plant stage | 3 days; dead after 15 |
| Transaction archive cron | Tuesdays 09:00 UTC |

The two Tuesday boundaries differ on purpose: the 6am bucks line means a late
Monday-night bet still counts to the right week.

---

## 11. The test account

`test` / `123`. Belongs to no manager, holds no team, appears on no leaderboard.
`TEST_PROFILE` names it and nine switches answer to it alone — demo
notifications, a 30-minute bucks cycle, 15-second plant stages, one Ball
Knowledge question of every kind, a two-ballot poll reveal, and two config hints.

The league and anyone signed out get the live site regardless of what those
config values say, so **leave them on**. Turning one off only takes it away from
`test`.
