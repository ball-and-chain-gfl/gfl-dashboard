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

  /* "Marathons Ran" tab. `sinceDate` is the day the 2024 last-place game went
     final — the day counter is computed from it automatically. */
  marathon: {
    team: "Marathon",
    count: 0,
    sinceDate: "2024-12-30",
    sinceLabel: "days since the 2024 last place game went final",
  },

  /* MATCHUP OF THE WEEK (homepage). Set the two teams and the Ball & Chain
     takeaways each week. If `auto` is true the dashboard will try to detect the
     two teams from the latest Ball & Chain video TITLE and override home/away;
     it falls back to the names below if it can't find two team names.
     `odds` are playoff-odds percentages you set manually for now. */
  matchup: {
    week: 1,
    auto: true,
    home: "Lebron",
    away: "Florida",
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
  /* TESTING ONLY — how many minutes a GFL Bucks cycle lasts. Set to 5 so the
     reset can be watched without waiting for Tuesday. Set to 0 (or delete this
     line) to go back to the real Tuesday-to-Tuesday week. Bets already placed
     stay attached to the cycle they were made in either way. */
  bucksTestMinutes: 5,

  /* TESTING ONLY — how long one locker-room plant stage lasts, in minutes.
     0 (or delete) uses the real three days per stage. */
  plantTestMinutes: 0,

  /* Last week trades can be made. Drawn as a line in the Schedules table before
     the first week past it. Set to 0 to hide it. 11 is a placeholder — change
     it to whatever the league actually runs. */
  tradeDeadlineWeek: 11,

  ballKnowledge: {
    week: 1,
    reveal: false,
    /* Bump this to wipe the slate. It is part of the key answers are stored
       under, so raising it makes every saved answer — on every device and on
       every profile — invisible and the week starts fresh. Handy while
       testing; nothing has to be deleted by hand. */
    resetToken: 2,
    /* The Ball Knowledge IQ meter on each team profile. Everyone starts at
       `avg` — dead centre of the bar — and moves `step` points per question,
       up for a right answer and down for a wrong one.
       `min` and `max` are the lowest and highest IQs ever claimed to have been
       recorded. Both are pop-trivia figures rather than anything clinical: 228
       is the Guinness number for Marilyn vos Savant, and the low end has no
       real record at all, so 40 is a stand-in. Change either freely.
       Because avg is not the midpoint of min and max, the bar maps the two
       halves separately so 100 still lands in the middle. */
    iq: { min: 40, max: 228, avg: 100, step: 8 },
    questions: [
      { q: "Which team has the most GFL championships?",
        a: ["The Bryan Football Team", "Lebron's 3rd Leg", "Florida Man", "Bismuth"], correct: 0 },
      { q: "How many teams are in the GFL?",
        a: ["10", "12", "14", "16"], correct: 1 },
      { q: "What does a team's Coaching Metric measure?",
        a: ["Total points scored", "Points left on the bench", "Lineup decisions vs the optimal lineup", "Waiver spending"], correct: 2 },
      { q: "In fantasy scoring, how many points is a receiving touchdown worth in the GFL?",
        a: ["4", "6", "3", "8"], correct: 1 },
      { q: "What happens to unspent GFL Bucks at the end of a week?",
        a: ["They roll over", "They double", "They disappear", "They convert to FAAB"], correct: 2 },
    ],
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
    /* What each punishment actually involves. Click any entry in the popup's
       menu to read it; it opens on whichever one is set above for this week.
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
