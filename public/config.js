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
  punishment: {
    week: 1,
    name: "Beer Pour",
    note: "Loser of the week pours (and chugs) the group's mystery beer blend.",
    options: ["Beer Pour", "Weatherman", "Fast Banana", "Willem Defoe", "Fruit Pledge", "Spicy Food"],
    rules: [
      "Whoever loses the week takes the punishment — lowest score if there is a tie.",
      "The league picks that week's punishment from the menu below.",
      "It gets carried out on camera before the next week's games kick off.",
      "Duck it and you inherit the following week's punishment on top of your own.",
    ],
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
