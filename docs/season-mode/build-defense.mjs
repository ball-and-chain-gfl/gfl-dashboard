/* Season Mode: each defense's four attributes, from its real season's play-by-play numbers.
 *   node docs/season-mode/build-defense.mjs    -> the D/ST entries in attrs.json  { "id-season": {a:[n,n,n,n]} }
 * Reads nflverse's team stats by week (github.com/nflverse/nflverse-data, release stats_team), regular season only.
 * What a defense allowed is what its opponents did against it that week.
 *   Pass rush  sacks and half its QB hits, a game
 *   Coverage   pass defense: the opponent's EPA a dropback (passes and sacks), less is better
 *   Run stop   run defense: the opponent's EPA a carry, less is better
 *   Ball hawk  interceptions and fumbles recovered, a game
 * Each is where that defense ranks among the 160 in the pool, on a 55-99 scale, like the players' attributes. */
import fs from 'node:fs';
const D = new URL('./', import.meta.url);
const defs = JSON.parse(fs.readFileSync(new URL('defenses.json', D)));
const attrs = JSON.parse(fs.readFileSync(new URL('attrs.json', D)));
const ABBR = { '49ers': 'SF', Bears: 'CHI', Bengals: 'CIN', Bills: 'BUF', Broncos: 'DEN', Browns: 'CLE', Buccaneers: 'TB', Cardinals: 'ARI',
  Chargers: 'LAC', Chiefs: 'KC', Colts: 'IND', Commanders: 'WAS', Cowboys: 'DAL', Dolphins: 'MIA', Eagles: 'PHI', Falcons: 'ATL', Giants: 'NYG',
  Jaguars: 'JAX', Jets: 'NYJ', Lions: 'DET', Packers: 'GB', Panthers: 'CAR', Patriots: 'NE', Raiders: 'LV', Rams: 'LA', Ravens: 'BAL',
  Saints: 'NO', Seahawks: 'SEA', Steelers: 'PIT', Texans: 'HOU', Titans: 'TEN', Vikings: 'MIN' };
const csv = t => { const [h, ...rows] = t.trim().split('\n'); const k = h.split(','); return rows.map(r => { const v = r.split(','); return Object.fromEntries(k.map((x, i) => [x, v[i]])); }); };
const num = v => +v || 0;
const tot = {};
for (const season of [...new Set(defs.map(d => d.season))]) {
  const r = await fetch(`https://github.com/nflverse/nflverse-data/releases/download/stats_team/stats_team_week_${season}.csv`);
  if (!r.ok) { console.log('season', season, 'status', r.status); continue; }
  for (const w of csv(await r.text())) { if (w.season_type !== 'REG') continue;
    /* this team's own defense that week, and what the other side did against it */
    const me = (tot[w.team + season] ||= { g: 0, sk: 0, hit: 0, take: 0, pEpa: 0, pPl: 0, rEpa: 0, rPl: 0 });
    me.g++; me.sk += num(w.def_sacks); me.hit += num(w.def_qb_hits); me.take += num(w.def_interceptions) + num(w.fumble_recovery_opp);
    const opp = (tot[w.opponent_team + season] ||= { g: 0, sk: 0, hit: 0, take: 0, pEpa: 0, pPl: 0, rEpa: 0, rPl: 0 });
    opp.pEpa += num(w.passing_epa); opp.pPl += num(w.attempts) + num(w.sacks_suffered); opp.rEpa += num(w.rushing_epa); opp.rPl += num(w.carries); }
}
const RAW = [t => (t.sk + t.hit * .5) / t.g, t => -t.pEpa / Math.max(1, t.pPl), t => -t.rEpa / Math.max(1, t.rPl), t => t.take / t.g];
const vals = defs.map(d => { const t = tot[ABBR[d.n] + d.season]; return t && t.g ? RAW.map(f => f(t)) : null; });
let missing = 0;
defs.forEach((d, i) => { const v = vals[i]; if (!v) { missing++; return; }
  attrs[d.id + '-' + d.season] = { a: v.map((x, k) => { const col = vals.filter(Boolean).map(r => r[k]); return Math.round(55 + 44 * col.filter(y => y < x).length / Math.max(1, col.length - 1)); }) }; });
fs.writeFileSync(new URL('attrs.json', D), JSON.stringify(attrs));
console.log('defenses', defs.length, 'from nflverse', defs.length - missing, 'missing', missing);
