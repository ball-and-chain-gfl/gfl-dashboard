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
};
