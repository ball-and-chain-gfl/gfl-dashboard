/* Season Mode: each card's four attributes, from that player's real season.
 *   node docs/season-mode/build-attrs.mjs      -> attrs.json  { "id-season": {a:[n,n,n,n]} }
 * Reads ESPN's public fantasy API (season totals, no league data). Each attribute is where that season ranks among the
 * rated players at his position, on a 55-99 scale, so the best in the pool at something is a 99 at it. */
import fs from 'node:fs';
const D = new URL('./', import.meta.url);
const rated = JSON.parse(fs.readFileSync(new URL('rated.json', D)));
const defs = JSON.parse(fs.readFileSync(new URL('defenses.json', D)));
const all = [...rated.map(p => ({ ...p })), ...defs.map(d => ({ ...d, pos: 'D/ST' }))];
const seasons = [...new Set(all.map(p => p.season))];
const stats = {};
for (const season of seasons) {
  const ids = all.filter(p => p.season === season).map(p => p.id);
  for (let i = 0; i < ids.length; i += 60) {
    const chunk = ids.slice(i, i + 60);
    const url = `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${season}/segments/0/leaguedefaults/3?view=kona_player_info`;
    const filter = { players: { filterIds: { value: chunk }, filterStatsForTopScoringPeriodIds: { value: 2, additionalValue: ['00' + season, '10' + season] } } };
    const r = await fetch(url, { headers: { 'x-fantasy-filter': JSON.stringify(filter), Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' } });
    if (!r.ok) { console.log('season', season, 'status', r.status); continue; }
    for (const e of (await r.json()).players || []) {
      const t = (e.player.stats || []).find(s => s.statSourceId === 0 && s.statSplitTypeId === 0 && String(s.seasonId) === String(season));
      if (t) stats[e.player.id + '-' + season] = t.stats;
    }
  }
}
const g = (s, k) => (s && s[k]) || 0;
/* the raw measure behind each attribute, bigger is better */
const RAW = {
  QB: [ /* arm: yards a throw, and how many go 40+ */ s => g(s, 3) / Math.max(1, g(s, 0)) + 6 * (g(s, 15) + g(s, 16) + g(s, 17)) / Math.max(1, g(s, 0)) * 10,
        /* accuracy: completion rate, less the picks */ s => g(s, 1) / Math.max(1, g(s, 0)) - 2 * g(s, 20) / Math.max(1, g(s, 0)),
        /* legs: rushing yards a game */ s => g(s, 24) / Math.max(1, g(s, 210)),
        /* escape: how seldom he goes down, sacks per dropback */ s => -g(s, 64) / Math.max(1, g(s, 0) + g(s, 64)) ],
  RB: [ /* speed: yards a carry, and the long runs */ s => g(s, 39) + 0.4 * (g(s, 31) + g(s, 33)),
        /* elusiveness: yards a touch, carries and catches together */ s => (g(s, 24) + g(s, 42)) / Math.max(1, g(s, 23) + g(s, 53)),
        /* power: touchdowns a carry, and the work he can take */ s => 10 * g(s, 25) / Math.max(1, g(s, 23)) + g(s, 23) / 300,
        /* hands: catches a target */ s => g(s, 53) / Math.max(1, g(s, 58)) + g(s, 53) / 200 ],
  WR: [ /* speed: yards a catch */ s => g(s, 60) || g(s, 42) / Math.max(1, g(s, 53)),
        /* route running: targets a game, how often he gets open */ s => g(s, 58) / Math.max(1, g(s, 210)),
        /* hands: catches a target */ s => g(s, 53) / Math.max(1, g(s, 58)),
        /* contested catches: touchdowns a catch, near the goal it's all contested */ s => g(s, 43) / Math.max(1, g(s, 53)) + g(s, 43) / 60 ],
  TE: [ /* blocking: no stat for it; the fewer targets a game, the more he stays in to block */ s => -g(s, 58) / Math.max(1, g(s, 210)),
        /* hands */ s => g(s, 53) / Math.max(1, g(s, 58)),
        /* speed: yards a catch */ s => g(s, 60) || g(s, 42) / Math.max(1, g(s, 53)),
        /* contested */ s => g(s, 43) / Math.max(1, g(s, 53)) + g(s, 43) / 40 ],
};
/* defenses come from nflverse's play-by-play numbers (build-defense.mjs); keep what that wrote */
const prev = fs.existsSync(new URL('attrs.json', D)) ? JSON.parse(fs.readFileSync(new URL('attrs.json', D), 'utf8')) : {};
const out = Object.fromEntries(Object.entries(prev).filter(([k]) => k.startsWith('-'))); let missing = 0;
for (const pos of Object.keys(RAW)) {
  const group = all.filter(p => p.pos === pos);
  RAW[pos].forEach((fn, k) => {
    const vals = group.map(p => { const s = stats[p.id + '-' + p.season]; return s ? fn(s) : null; });
    const sorted = vals.filter(v => v != null).sort((a, b) => a - b);
    group.forEach((p, i) => { const key = p.id + '-' + p.season; out[key] = out[key] || { a: [0, 0, 0, 0] };
      const v = vals[i]; const pct = v == null ? 0.35 : sorted.filter(x => x < v).length / Math.max(1, sorted.length - 1);
      out[key].a[k] = Math.round(55 + 44 * pct); });
  });
  missing += group.filter(p => !stats[p.id + '-' + p.season]).length;
}
/* SPEED IS THE 40. Where a player ran at the NFL Combine (forty.json, from build-forty.mjs), his Speed comes from
 * that time on one scale for everyone at his position, not from where his stats rank: a 4.26 back or receiver is a
 * 99 and a 4.70 is a 55; for tight ends 4.40 to 4.90. A quarterback's Legs is half his 40 and half his running.
 * Players lose a step with time: two points a season after their sixth. A player with no combine 40 keeps the
 * estimate from his stats above. */
const forty = fs.existsSync(new URL('forty.json', D)) ? JSON.parse(fs.readFileSync(new URL('forty.json', D), 'utf8')) : {};
const SCALE = { RB: [4.26, 4.70, 0], WR: [4.26, 4.70, 0], TE: [4.40, 4.90, 2], QB: [4.40, 5.05, 2] };
let timed = 0;
for (const p of rated) { const f = forty[p.id], sc = SCALE[p.pos], key = p.id + '-' + p.season; if (!f || !sc || !out[key]) continue;
  const fromForty = 99 - 44 * Math.max(0, Math.min(1, (f.forty - sc[0]) / (sc[1] - sc[0])));
  const age = Math.max(0, p.season - f.draft - 6) * 2;
  let v = fromForty - age; if (p.pos === 'QB') v = (v + out[key].a[2]) / 2;
  out[key].a[sc[2]] = Math.round(Math.max(55, Math.min(99, v))); timed++; }
fs.writeFileSync(new URL('attrs.json', D), JSON.stringify(out));
console.log('players', Object.keys(out).length, 'with stats', Object.keys(stats).length, 'missing', missing, 'speed from a 40:', timed);
