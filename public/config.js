/* ============================================================================
   BALL & CHAIN GFL — DASHBOARD CONFIG
   ----------------------------------------------------------------------------
   This is the ONLY file you need to edit to change the featured "Balls Big 4".
   It lives right next to index.html (in the public/ folder). Edit, save,
   redeploy — no need to touch the big index.html file.

   HOW TO SET THE BIG 4:
   Put four teams in `big4`, in display order. Each entry can be EITHER:
     • the team's name, or any part of it (case-insensitive)   e.g. "Bismuth"
     • the numeric ESPN team id                                e.g. 7
   Partial names work, so "Bryan" will match "The Bryan Football Team".
   Leave an entry as "" (empty) to show an empty slot.

   `labels` are the little captions over each pick (optional to change).
============================================================================ */
window.GFL_CONFIG = {
  big4: [
    "The Bryan Football Team",   // slot 1 
    "Bismuth",                   // slot 2
    "Lebron",                    // slot 3
    "Florida",               // slot 4
  ],
  labels: ["#1 Pick", "Dark Horse", "Sleeper", "Wild Card"],

  /* Former league members hidden from Matchup History & Player Tenure.
     Case-insensitive partial matches against the team name. */
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
  /* One dummy notification of every kind, so the whole set can be seen while
     the league is quiet. Set to false once the season starts and the real ones
     begin arriving — the demo cards are keyed on fixed ids, so any that have
     already been swiped away will stay away. */
  notifications: { demo: true },

  /* TESTING ONLY — how many minutes a GFL Bucks cycle lasts, standing in for
     the real Tuesday-to-Tuesday week. Set to 0 (or delete this line) to go back
     to the real thing. Bets already placed stay attached to the cycle they were
     made in either way.

     Now that bucks compound rather than reset, this does more than hurry a
     countdown along: a fresh allowance lands every cycle and is kept, so a
     short cycle inflates every bank in the league. At 30 minutes that is 48
     allowances a day — about $4,800 banked for doing nothing. Fine for
     watching the mechanic work, worth turning off before the season counts. */
  bucksTestMinutes: 30,

  /* Bets placed before this moment are ignored everywhere — My Bets, the
     balance and the bankroll chart. The Firestore rules withhold delete on
     purpose (a losing bet must not be able to vanish), so a clean slate is
     drawn with a line rather than by deleting anything. Raise it to now to
     start over again; set to 0 to count everything ever placed. */
  betsResetBefore: 1787348483576,

  /* TESTING ONLY — how long one locker-room plant stage lasts, in minutes.
     Fractions are fine: 0.25 is fifteen seconds a stage, so the plant runs
     from thriving to dead in about a minute and a half.
     0 (or delete) uses the real three days per stage. */
  plantTestMinutes: 0.25,

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
    reveal: false,
    /* What one graded call is worth on the Ball Knowledge scale — a right
       answer this much up, a wrong one the same amount down. Every call counts
       the same: a trivia question, a weekly pick, a settled bet. */
    iq: { step: 2 },
    /* TESTING — serve one of every kind of question instead of the weekly five,
       and let the graph question through before week 5. Set false for the real
       five-a-week set. */
    previewAll: true,
  },

  punishment: {
    week: 1,
    name: "Beer Pour",
    note: "Loser of the week pours (and chugs) the group's mystery beer blend.",
    /* Seven: the week's pick leads the popup at full width, the other six
       fill a 2x3 grid under it. Rename the placeholder to whatever the
       seventh actually is. */
    options: ["Beer Pour", "Weatherman", "Fast Banana", "Willem Defoe", "Fruit Pledge", "Spicy Food", "TBD Seventh"],
    rules: [
      "Whoever loses the week takes the punishment — lowest score if there is a tie.",
      "The league picks that week's punishment from the menu below.",
      "It gets carried out on camera before the next week's games kick off.",
      "Duck it and you inherit the following week's punishment on top of your own.",
    ],
    /* THE SEASON SCHEDULE — which punishment is on the line each week, weeks
       1 to 14. Keys are week numbers, values must match the `options`
       spelling above. Only week 1 is filled in, because it is the only one
       that has actually been set; every other week reads TBD on the
       Punishments tab until you put a name here. Nothing is invented for you.
       The row for `week` above is outlined on that tab as the current one. */
    schedule: {
      1: "Beer Pour",
      2: "", 3: "", 4: "", 5: "", 6: "", 7: "",
      8: "", 9: "", 10: "", 11: "", 12: "", 13: "", 14: "",
    },
    /* What each punishment actually involves. Click any entry in the menu to
       read it; it opens on whichever one is set above for this week.
       Keys must match the `options` spelling. Blank ones just prompt you to
       write them — nothing here is invented for you. */
    details: {
      "Beer Pour": "Loser of the week pours (and chugs) the group's mystery beer blend.",
      "Weatherman": "",
      "Fast Banana": "",
      "Willem Defoe": "",
      "Fruit Pledge": "",
      "Spicy Food": "",
      "TBD Seventh": "",
    },
  },

  /* BAD BEAT O'METER — worst luck / most painful losses. Fill `entries` with
     items like { rank, team, week, note, score } once you send the details. */
  badBeat: {
    intro: "The most painful, unlucky, and soul-crushing losses in league history.",
    entries: [],
  },

  /* GABE'S GREATNESS — a shrine to Gabe Davis's finest fantasy outings in the GFL. */
  gabe: { name: "Gabe Davis", playerId: 4243537 },
};
