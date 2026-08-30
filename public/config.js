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
  /* Moved back a week, from 1 September to 25 August, so the league holds its
     first $100 now rather than on the Tuesday. bucksCycles pays one allowance on
     pay day and one for every fantasy week actually played, and no week has been
     played yet, so this is exactly $100 each and not a penny more.

     WATCH THE IDLE CHARGE AFTER THIS. bucksIdleWeeks never counts the week in
     progress, so nobody is docked today. When the week 25 August to 1 September
     closes, anyone who has neither bet nor traded in it loses bucksIdleCost —
     $20, before a snap of football has been played. Set bucksIdleCost to 0 if
     the penalty should not start biting until the season does. */
  bucksStart: "2026-08-25",
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
     the first week past it. Set to 0 to hide it.

     No longer a guess: ESPN carries the league's own deadline, and for 2026 it
     is Wednesday 2 December at 1pm Central. That Wednesday falls inside NFL week
     13 — week 12's games finish on Monday 30 November, and week 13 opens on
     Thursday 3 December — so a trade agreed on deadline day is still in the
     lineup for week 13, and week 13 is the last week trades can touch. From week
     14 on, the roster you have is the roster you finish with.

     If the league moves the date in ESPN, the check is which NFL week contains
     it: weeks run Wednesday 08:00 UTC to the following Wednesday. */
  tradeDeadlineWeek: 13,

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

  /* ── THE SEASON SCHEDULE AS DRAWN ──────────────────────────────────────────
     The league's own order, which is NOT the order ESPN generated. Weeks 1 to 3
     happen to agree; weeks 4 to 11 do not, and this is what overrides them.

     TEAM IDS, because names get edited and ids do not. The pairing is written
     out in the comment above each week so it can be read without a lookup:

       1  Marathon Men (Jimmie)        7  Lebron's 3rd Leg (Brett)
       2  Motor City Mulligans (Matt)  8  Tuckasegee Tinglers (Cooper)
       3  Bikini Bottom Goobers (Chris) 9 Midwest Miners (Caden)
       4  Bismuth (Ross)              10  The Bryan Football Team (Bryan)
       5  Florida Man (Jon)           11  Whittingham Sports (Kyle)
       6  Team silly willy (Will)     12  West Coast Wigglers (Logan)

     TWO THINGS THIS CANNOT DO, both worth knowing before relying on it.

     It never touches a week that has been played. The moment a week carries a
     single point it is ESPN's result and this file stops having an opinion, so
     a schedule edited mid-season can never rewrite a game that already happened.

     And it does not change ESPN. ESPN still scores its own pairings, so if the
     two disagree once football starts, the dashboard will show one opponent and
     ESPN will score another. The real fix is to correct the schedule in ESPN's
     league settings, at which point this block simply agrees with it and does
     nothing. Weeks 12 to 14 are not in the drawn order at all and are left
     exactly as ESPN has them. */
  leagueSchedule: {
    season: 2026,
    drawn: {
      /* Marathon Men v Midwest Miners; The Bryan Football Team v Lebron's 3rd Leg; Motor City Mulligans v Team silly willy; Tuckasegee Tinglers v West Coast Wigglers; Whittingham Sports v Florida Man; Bikini Bottom Goobers v Bismuth */
      1: [[1,9], [10,7], [2,6], [8,12], [11,5], [3,4]],
      /* Marathon Men v Whittingham Sports; The Bryan Football Team v Bismuth; Motor City Mulligans v Lebron's 3rd Leg; Tuckasegee Tinglers v Midwest Miners; West Coast Wigglers v Bikini Bottom Goobers; Team silly willy v Florida Man */
      2: [[1,11], [10,4], [2,7], [8,9], [12,3], [6,5]],
      /* Marathon Men v Bismuth; The Bryan Football Team v West Coast Wigglers; Motor City Mulligans v Tuckasegee Tinglers; Team silly willy v Whittingham Sports; Midwest Miners v Bikini Bottom Goobers; Lebron's 3rd Leg v Florida Man */
      3: [[1,4], [10,12], [2,8], [6,11], [9,3], [7,5]],
      /* Marathon Men v Team silly willy; The Bryan Football Team v Florida Man; Motor City Mulligans v Midwest Miners; Tuckasegee Tinglers v Whittingham Sports; West Coast Wigglers v Bismuth; Lebron's 3rd Leg v Bikini Bottom Goobers */
      4: [[1,6], [10,5], [2,9], [8,11], [12,4], [7,3]],
      /* Marathon Men v Bikini Bottom Goobers; The Bryan Football Team v Motor City Mulligans; Tuckasegee Tinglers v Team silly willy; West Coast Wigglers v Midwest Miners; Whittingham Sports v Lebron's 3rd Leg; Florida Man v Bismuth */
      5: [[1,3], [10,2], [8,6], [12,9], [11,7], [5,4]],
      /* Marathon Men v Florida Man; The Bryan Football Team v Team silly willy; Motor City Mulligans v West Coast Wigglers; Tuckasegee Tinglers v Bikini Bottom Goobers; Whittingham Sports v Midwest Miners; Lebron's 3rd Leg v Bismuth */
      6: [[1,5], [10,6], [2,12], [8,3], [11,9], [7,4]],
      /* Marathon Men v The Bryan Football Team; Motor City Mulligans v Bismuth; Tuckasegee Tinglers v Lebron's 3rd Leg; West Coast Wigglers v Whittingham Sports; Team silly willy v Bikini Bottom Goobers; Midwest Miners v Florida Man */
      7: [[1,10], [2,4], [8,7], [12,11], [6,3], [9,5]],
      /* Marathon Men v Lebron's 3rd Leg; The Bryan Football Team v Tuckasegee Tinglers; Motor City Mulligans v Whittingham Sports; West Coast Wigglers v Team silly willy; Midwest Miners v Bismuth; Bikini Bottom Goobers v Florida Man */
      8: [[1,7], [10,8], [2,11], [12,6], [9,4], [3,5]],
      /* Marathon Men v West Coast Wigglers; The Bryan Football Team v Whittingham Sports; Motor City Mulligans v Bikini Bottom Goobers; Tuckasegee Tinglers v Florida Man; Team silly willy v Bismuth; Midwest Miners v Lebron's 3rd Leg */
      9: [[1,12], [10,11], [2,3], [8,5], [6,4], [9,7]],
      /* Marathon Men v Motor City Mulligans; The Bryan Football Team v Midwest Miners; Tuckasegee Tinglers v Bismuth; West Coast Wigglers v Florida Man; Team silly willy v Lebron's 3rd Leg; Whittingham Sports v Bikini Bottom Goobers */
      10: [[1,2], [10,9], [8,4], [12,5], [6,7], [11,3]],
      /* Marathon Men v Tuckasegee Tinglers; The Bryan Football Team v Bikini Bottom Goobers; Motor City Mulligans v Florida Man; West Coast Wigglers v Lebron's 3rd Leg; Team silly willy v Midwest Miners; Whittingham Sports v Bismuth */
      11: [[1,8], [10,3], [2,5], [12,7], [6,9], [11,4]],
    },
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
    name: "Fruit Pledge",
    note: "Carry your fruit from 9am Tuesday until 1pm the following Sunday, and answer every fruit check within 15 minutes.",
    options: ["Beer Pour", "Fruit Pledge", "Willem Dafoe", "Hot & Spicy",
              "Fast Banana", "Franchise Rebrand", "The Re-enactment"],
    /* How the whole thing works, as opposed to what any one punishment is.
       Written without dashes: this text is read on a phone, where a clause
       hanging off an em dash turns into its own orphaned line. */
    rules: [
      "The week's LOWEST POINTS SCORER takes the punishment, not the loser of a matchup.",
      "The schedule is set in advance. All seven appear twice across weeks 1 to 14, in an order drawn at the draft, so no single week can be manipulated.",
      "Most punishments open the moment you are mathematically confirmed as low scorer. If nobody can drop below you there is no need to wait for Monday night. They close the following Sunday at 1pm LLT, which stands for Loser Local Time. The Fruit Pledge is the exception and starts the Tuesday after at 9am.",
      "Ignore one and that week's matchup loses 5 points. Still outstanding a week later and it loses 10. After two weeks the deduction is wiped, because it is meant to incentivise rather than snowball.",
    ],
    /* THE SEASON SCHEDULE. Which punishment is on the line each week.
       Values must match the `options` spelling above.

       The order as drawn at the 2026 draft. Each of the seven appears exactly
       twice across the fourteen weeks, which is the check to run on any edit:
       Fruit Pledge 1 and 4, Franchise Rebrand 2 and 6, The Re-enactment 3 and
       10, Beer Pour 5 and 9, Hot & Spicy 7 and 14, Fast Banana 8 and 12,
       Willem Dafoe 11 and 13. Seven twos, fourteen weeks.

       The two Hot & Spicy weeks are not the same dish, and the doctrine has
       them in this order: week 7 is the Hot Chip the league expenses and ships
       to the door, week 14 is the full jalapeno. */
    schedule: {
      1: "Fruit Pledge",
      2: "Franchise Rebrand",
      3: "The Re-enactment",
      4: "Fruit Pledge",
      5: "Beer Pour",
      6: "Franchise Rebrand",
      7: "Hot & Spicy",
      8: "Fast Banana",
      9: "Beer Pour",
      10: "The Re-enactment",
      11: "Willem Dafoe",
      12: "Fast Banana",
      13: "Willem Dafoe",
      14: "Hot & Spicy",
    },
    /* The rules for each one, condensed from the doctrine. Tap any entry in the
       menu to read it; it opens on whichever is set for this week. */
    details: {
      "Beer Pour":
        "Record yourself pouring a beer over your head, or the alcoholic beverage of your choice, and send it to the league. Your window opens the moment you are mathematically confirmed as the week's lowest scorer, so if nobody can drop below you there is no need to wait on Monday night. The deadline is the following Sunday at 1pm Loser Local Time. Miss it and that week's matchup loses 5 points. Still nothing a week later and it loses 10. Both are wiped after two weeks.",
      "Fruit Pledge":
        "Carry your fruit on you at all times, from 9am LLT on the Tuesday after your dud week until 1pm the following Sunday. The order runs grape, kiwi, apple, grapefruit, coconut, cantaloupe, pineapple, watermelon, pumpkin, jackfruit, and past that every failed check costs a point. Anyone in the league can call a fruit check and you have 15 minutes to produce photographic evidence or you move up a fruit. Each check buys you two hours of immunity, and checks only run between 7am and 10pm LLT. If you will be away from your phone, send your own check in advance or share your work calendar for the week. Refuse the whole thing and you lose 15 points off next week's score.",
      "Willem Dafoe":
        "Pick a pose from the league's Willem Dafoe folder and recreate it, outfit and pose and all, then post it to your Instagram story, ideally with a nice song behind it. Your window opens once you are mathematically the lowest scorer, and the deadline is the following Sunday at 1pm LLT. The penalty matches the Beer Pour: 5 points off after one week, 10 after two, wiped from then on.",
      "Hot & Spicy":
        "It lands twice a season and the two are not the same. One week is a single jalapeno. The other is the Hot Chip, which the league expenses and has sent to your door, so the hype has time to build. You must wait a full minute from your first bite before any milk or ice cream, and it goes on camera for the league's enjoyment. The penalty matches the Beer Pour.",
      "Fast Banana":
        "No stopwatch this year. The first manager to draw it has to eat a banana with no hands, filmed, with no time limit and by any means necessary. The second has to do the same thing in that time or better, to settle who the true eater is. The penalty matches the Beer Pour.",
      "Franchise Rebrand":
        "The league renames your team, and you cannot change it back until you win a matchup. That might be one week as the Toe Suckers, or it might be a month, depending on how locked in your team is. The league may hand you a new logo to go with it. There is nothing here to ignore, because it is simply done to you.",
      "The Re-enactment":
        "Recreate a scene from a film or piece of media, playing every part yourself. The league picks the scene going into the week, so everybody knows what is on the line. It does not have to be complex, it has to entertain the GFL. See the Season 5 Punishments video on Ball & Chain for the standard. The penalty matches the Beer Pour.",
    },
  },

  /* BAD BEAT O'METER — nothing to configure. The tab computes its own
     misery from the schedule: unlucky losses, high scores that lost, closest
     defeats. It used to take a hand-written `entries` list and an `intro`
     string, and read neither — so anything typed there was invisible. */

  /* GABE'S GREATNESS — a shrine to Gabe Davis's finest fantasy outings in the GFL. */
  gabe: { name: "Gabe Davis", playerId: 4243537 },
};
