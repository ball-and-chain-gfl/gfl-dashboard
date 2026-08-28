/* ============================================================================
   BALL & CHAIN GFL — DASHBOARD CONFIG
   ----------------------------------------------------------------------------
   The hand-edited file. It lives next to index.html in public/ — edit, save,
   redeploy. Nothing here needs the big files touched.

   WHAT IS IN HERE, AND HOW OFTEN IT WANTS TOUCHING:

     punishment    weekly — which punishment is on, and the season schedule
     excludeTeams  rarely — franchises to leave out of all-time tables
     notifications never — a testing switch
     bucksStart    once a season — the league's pay day
     bucksIdleCost rarely — what a week with nothing risked costs
     betsResetBefore  once — the line the ledger is drawn behind
     eggWindowHours / eggPrize   rarely — read the arithmetic before moving them
     tradeDeadlineWeek  once a season
     ballKnowledge      never — it writes its own questions now
     matchup       nothing on the picks grid reads this any more; the hidden
                   Matchup of the Week module still does
     gabe          once — the player the League History shrine is built on

   WHAT IS NOT IN HERE ANY MORE: everything the site can work out for itself.
   Standings, records, share prices, Ball Knowledge, the Bad Beat O'Meter and
   the Coaching Metric are all derived from ESPN and from what managers have
   actually done, so there is nothing to keep in step by hand and nothing that
   can go stale.

   If a value here is not listed above, check that something still reads it
   before spending time on it. This file used to open with thirteen lines
   explaining how to set the "Balls Big 4" — a module that had been taken off
   the homepage, with the config keys left behind. Anybody following those
   instructions would have edited, redeployed and seen nothing change.
============================================================================ */
window.GFL_CONFIG = {
  excludeTeams: ["who gibbs", "wafflestomp", "bozeman", "simptown"],


  /* MATCHUP OF THE WEEK (homepage). Set the two teams and the Ball & Chain
     takeaways each week. If `auto` is true the dashboard will try to detect the
     two teams from the latest Ball & Chain video TITLE and override home/away;
     it falls back to the names below if it can't find two team names.
     `odds` are playoff-odds percentages you set manually for now. */
  matchup: {
    week: 1,
    auto: false,   // set by hand below; auto-detect would override it from the video title
    home: "Florida",
    away: "Wigglers",
    ball:  ["Lebron's ceiling is the highest in the league right now",
            "The waiver pickups are finally paying off",
            "Defense has quietly been a top-3 unit"],
    chain: ["Florida Man is peaking at exactly the wrong time",
            "One injury away from a total collapse",
            "The trade that sent away depth still stings"],
    odds: { home: { win: 82, loss: 55 }, away: { win: 61, loss: 28 } },
  },

  /* WEEKLY PUNISHMENT. Set the current week's punishment; `options` is the menu
     the league picks from. There is no Punishment tab any more — the homepage
     module's "Details" button opens a popup built from everything here.
     `rules` is the numbered "How it works" list in that popup. EDIT THESE to
     match how the league actually runs it; they are a starting point, not
     gospel. Add or remove lines freely. */
  /* ── BALL KNOWLEDGE (homepage) ─────────────────────────────────────────────
     Five trivia questions a week, sitting between the video and Matchup of the
     Week. Answering one collapses it and drops it to the bottom of the stack;
     once all five are in, the whole card slides down to the foot of the page.
     Answers save against the signed-in profile, so they follow a manager
     between devices and can be changed by reopening a question.

     EACH WEEK: bump `week` and replace the five questions. `correct` is the
     zero-based index of the right answer in `a`. Leave `reveal` false while the
     week is live; flip it to true afterwards to show everyone how they did. */
  /* ── TESTING SWITCHES ──────────────────────────────────────────────────────
     Everything marked TESTING below is shown to ONE account and nobody else:
     `test`, password 123. It belongs to no manager, holds no team and appears
     on no leaderboard. The twelve managers see the live site, and so does
     anyone signed out.

     So these can be left on. Turning one on does not change what the league
     gets; turning one off only takes it away from the test account. Sign in as
     `test` to see the demo notifications, the short bucks cycle, the fast plant
     and one Ball Knowledge question of every kind.

     The account is set in app.js as TEST_PROFILE. */

  /* TESTING — one dummy notification of every kind, so the whole set can be
     seen while the league is quiet. The demo cards are keyed on fixed ids, so
     any that have already been swiped away will stay away.

     The league never sees these: every switch marked TESTING answers to the
     `test` account alone. Leaving them on is what keeps that account useful. */
  notifications: { demo: true },

  /* TESTING — how many minutes a GFL Bucks cycle lasts, standing in for the
     real Tuesday-to-Tuesday week. The league is on the real week; this is what
     the testing profile gets. Set to 0 (or delete this line) to put the testing
     profile on the real week too. Bets already placed stay attached to the
     cycle they were made in either way.

     Now that bucks compound rather than reset, this does more than hurry a
     countdown along: a fresh allowance lands every cycle and is kept, so a
     short cycle inflates the bank it applies to. At 30 minutes that is 48
     allowances a day — about $4,800 for doing nothing. That is now the testing
     profile's bank alone, which is the point of it being the testing one. */
  bucksTestMinutes: 30,

  /* Bets placed before this moment are ignored everywhere — My Bets, the
     balance and the bankroll chart. The Firestore rules withhold delete on
     purpose (a losing bet must not be able to vanish), so a clean slate is
     drawn with a line rather than by deleting anything. Raise it to now to
     start over again; set to 0 to count everything ever placed.

     Moved to the start of the 2026 season: every bet placed while the site was
     being built sits behind this line and counts for nobody. */
  betsResetBefore: 1787846825391,

  /* ── PAY DAY ───────────────────────────────────────────────────────────────
     The Tuesday the league's money starts. The first $100 lands on this date at
     6am and one lands every Tuesday after it; before it, everybody holds $0.

     Written as a date rather than a timestamp so it can be read and changed.
     Blank it out and the bank falls back to counting from each manager's first
     bet, which is what it did before there was a league-wide start.

     bucksIdleCost is what a week with nothing risked costs. A Tuesday-to-Tuesday
     week in which a manager placed no bet and made no investment trade takes
     this off the balance, once, for that week — the point of the dashboard is
     that people turn up mid-week, and an allowance that arrives whether or not
     they do is an argument for ignoring it. Set it to 0 to switch the penalty
     off entirely. */
  bucksStart: "2026-09-01",
  bucksIdleCost: 20,

  /* TESTING — how long one locker-room plant stage lasts, in minutes.
     Fractions are fine: 0.25 is fifteen seconds a stage, so the plant runs
     from thriving to dead in about a minute and a half.
     0 (or delete) uses the real three days per stage.

     It applies to the testing profile's OWN plant and to nothing else. Each of
     the twelve runs on its own timer: whoever is looking, that one plant is on
     the fast cycle and the other eleven are on the real three days. */
  plantTestMinutes: 0.25,

  /* ── THE EGG HUNT ──────────────────────────────────────────────────────────
     One egg is hidden on one tab at a time. When the window rolls the old one
     is gone and a new one is somewhere else — there is no queue and no catching
     up, which is what makes finding one worth something.

     `eggWindowHours` is how long each one stays put, and `eggPrize` is what it
     pays. The pair of them set a ceiling on what the hunt can be worth:

        window     eggs/week     most it can pay
        6 hours       28              $280
        12 hours      14              $140   <- current
        1 day          7               $70
        2 days         3.5             $35

     against a weekly allowance of $100. Nobody finds every one — you only catch
     the ones that are up while you happen to be looking — so the real figure is
     a fraction of that. It was five minutes through the build, which is 2,016 a
     week and $20,160, and that was not a bonus on the economy, it was the
     economy. Raising the window lowers the ceiling. */
  eggWindowHours: 12,
  eggPrize: 10,

  /* Last week trades can be made. Drawn as a line in the Schedules table before
     the first week past it. Set to 0 to hide it. 11 is a placeholder — change
     it to whatever the league actually runs. */
  tradeDeadlineWeek: 11,

  /* Ball Knowledge writes itself now. The five weekly questions are generated
     from this season — the league's own records, the full NFL player pool and
     the committed bios file — so there is nothing to edit here each Tuesday.
     resetToken still works: bump it to orphan every stored answer at once. */
  ballKnowledge: {
    resetToken: 0,
    /* ON. The week's trivia counts toward Ball Knowledge: a right answer up, a
       wrong one down, and a blank down too — but a blank only once the week's
       football has kicked off. There is the whole week to answer in before
       anything is held against you.

       Only the current week is graded. The questions are generated from live
       data, so a past week cannot be rebuilt and marked afterwards — it would
       score people against questions they were never asked. Picks and settled
       bets are the cumulative half of the number; the trivia is the live half. */
    reveal: true,
    /* What one graded call is worth on the Ball Knowledge scale — a right
       answer this much up, a wrong one the same amount down. Every call counts
       the same: a trivia question, a weekly pick, a settled bet, except the
       Matchup of the Week pick, which counts double.

       The scale runs 0 to 300 with everyone starting at 150, and the nine
       labels on a team profile divide it evenly — Average Ball Knower is the
       middle band, 133 to 167. min, max and avg can be set here too if the
       scale ever wants moving; the labels follow whatever it is set to.

       One point a call. The Matchup of the Week pick is the only thing worth
       two, and that doubling lives in the code beside the pick rather than
       here. So a perfect week is about +16 and a terrible one -16, which puts
       the ceiling and the floor a season apart rather than five weeks. */
    iq: { step: 1 },
    /* TESTING — serve one of every kind of question instead of the weekly five,
       and let the graph question through before week 5. The league gets the
       real five-a-week set regardless; this is the testing profile's view.
       Set false to put the testing profile on the weekly five as well. */
    previewAll: true,
  },

  /* ── THE PUNISHMENTS ────────────────────────────────────────────────────────
     Written from the GFL Punishment Doctrine for 2026. Seven punishments, each
     appearing exactly twice across weeks 1-14, in an order drawn at the draft.

     The names here are the source of truth for the whole tab: the menu, the
     schedule table, the icons and the featured artwork are all looked up from
     them. Rename one and everything follows, because the lookups slug the name
     rather than matching it character for character — "Hot & Spicy", "hot and
     spicy" and "HOT & SPICY" all land on the same icon and the same picture. */
  punishment: {
    week: 1,
    name: "Beer Pour",
    note: "Pour a beer over your head on camera and send it to the league by Sunday 1pm LLT.",
    options: ["Beer Pour", "Fruit Pledge", "Willem Dafoe", "Hot & Spicy",
              "Fast Banana", "Franchise Rebrand", "The Re-enactment"],
    /* How the whole thing works, as opposed to what any one punishment is. */
    rules: [
      "The week's LOWEST POINTS SCORER takes the punishment — not the loser of a matchup.",
      "The schedule is set in advance: all seven appear twice across weeks 1-14, in an order drawn at the draft, so no single week can be manipulated.",
      "Most punishments open the moment you are mathematically confirmed as low scorer — if nobody can drop below you, there is no need to wait for Monday night — and close the following Sunday at 1pm LLT (Loser Local Time). The Fruit Pledge is the exception and starts the Tuesday after at 9am.",
      "Ignore one and that week's matchup takes -5. Still outstanding a week later and it is -10. After two weeks the deduction is wiped: it is meant to incentivise, not to snowball.",
    ],
    /* THE SEASON SCHEDULE — which punishment is on the line each week.
       Values must match the `options` spelling above.

       The order was drawn at the draft and only week 1 is recorded here, so
       weeks 2-14 read TBD on the tab until the drawn order is filled in.
       Nothing is invented: each of the seven should appear exactly twice
       across the fourteen weeks. */
    schedule: {
      1: "Beer Pour",
      2: "", 3: "", 4: "", 5: "", 6: "", 7: "",
      8: "", 9: "", 10: "", 11: "", 12: "", 13: "", 14: "",
    },
    /* The rules for each one, condensed from the doctrine. Tap any entry in the
       menu to read it; it opens on whichever is set for this week. */
    details: {
      "Beer Pour":
        "Record yourself pouring a beer — or the alcoholic beverage of your choice — over your head, and send it to the league. Your window opens the moment you are mathematically confirmed as the week's lowest scorer, so if nobody can drop below you there is no need to wait on Monday night. Deadline is the following Sunday at 1pm LLT. Miss it and that week's matchup takes -5; still nothing a week later and it is -10. Both wipe after two weeks.",
      "Fruit Pledge":
        "Carry your fruit on you at all times, from 9am LLT the Tuesday after your dud week until 1pm the following Sunday. The order is grape, kiwi, apple, grapefruit, coconut, cantaloupe, pineapple, watermelon, pumpkin, jackfruit — and beyond that it is -1 point for every failed check. Anyone in the league can call a fruit check and you have 15 minutes to produce photographic evidence or you move up a fruit. Two hours' immunity after each check, and checks only run 7am to 10pm LLT. If you will be away from your phone, send a pre-emptive check or share your work calendar for the week. Refuse the whole thing and it is -15 off next week's score.",
      "Willem Dafoe":
        "Pick a pose from the league's Willem Dafoe folder and recreate it — outfit, pose and all — then post it to your Instagram story, ideally with a nice song behind it. Your window opens once you are mathematically the lowest scorer; deadline the following Sunday at 1pm LLT. Repercussions as the Beer Pour: -5 after one week, -10 after two, wiped thereafter.",
      "Hot & Spicy":
        "It lands twice a season and the two are not the same. One week is a single jalapeno. The other is the Hot Chip — the league expenses it and it arrives at your door, so the hype has time to build. You must wait a full minute from your first bite before any milk or ice cream, and it goes on camera for the league's enjoyment. Repercussions as the Beer Pour.",
      "Fast Banana":
        "No stopwatch this year. The first manager to draw it has to eat a banana with no hands — no time limit, any means necessary, filmed. The second has to do the same thing in that time or better, to settle who the true eater is. Repercussions as the Beer Pour.",
      "Franchise Rebrand":
        "The league renames your team, and you cannot change it back until you win a matchup. That might be one week as the Toe Suckers, or it might be a month, depending on how locked in your team is. The league may hand you a new logo to go with it. There is nothing here to ignore — it is simply done to you.",
      "The Re-enactment":
        "Re-enact a scene from a film or piece of media, playing every part yourself. The scene is chosen by the league going into the week, so everybody knows what is on the line. It does not have to be complex — it has to entertain the GFL. See the Season 5 Punishments video on Ball & Chain for the standard. Repercussions as the Beer Pour.",
    },
  },

  /* BAD BEAT O'METER — nothing to configure. The tab computes its own
     misery from the schedule: unlucky losses, high scores that lost, closest
     defeats. It used to take a hand-written `entries` list and an `intro`
     string, and read neither — so anything typed there was invisible. */

  /* GABE'S GREATNESS — a shrine to Gabe Davis's finest fantasy outings in the GFL. */
  gabe: { name: "Gabe Davis", playerId: 4243537 },
};
