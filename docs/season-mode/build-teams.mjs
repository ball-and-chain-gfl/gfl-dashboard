/* Stamps every player-season in rated.json with his NFL team that season (tm, as ESPN's abbreviation), for bye weeks.
 *   node docs/season-mode/build-teams.mjs <dir with espn-players-YYYY.json>
 * The team comes first from the league's own data (public/data/season-*.json and live-*.json carry proTeamId on every
 * rostered player), and otherwise from ESPN's public fantasy player list for that season, saved as espn-players-YYYY.json
 * (lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/YYYY/players?scoringPeriodId=0&view=players_wl). A player
 * with no team (a free agent) gets none, and so never has a bye. */
import fs from 'node:fs';
const HERE = new URL('.', import.meta.url), ROOT = new URL('../../', import.meta.url);
const ESPN_DIR = process.argv[2] || process.env.TEMP;
const ABBR = {1:'ATL',2:'BUF',3:'CHI',4:'CIN',5:'CLE',6:'DAL',7:'DEN',8:'DET',9:'GB',10:'TEN',11:'IND',12:'KC',13:'LV',14:'LAR',15:'MIA',16:'MIN',17:'NE',18:'NO',19:'NYG',20:'NYJ',21:'PHI',22:'ARI',23:'PIT',24:'LAC',25:'SF',26:'SEA',27:'TB',28:'WSH',29:'CAR',30:'JAX',33:'BAL',34:'HOU'};
const pool = JSON.parse(fs.readFileSync(new URL('rated.json', HERE), 'utf8'));
const want = new Set(pool.map(p => p.id + '-' + p.season));
/* 1. the league's own data */
const league = {};
const walk = (o, s) => { if (Array.isArray(o)) return o.forEach(x => walk(x, s)); if (o && typeof o === 'object') { const id = o.id ?? o.playerId;
  if (id != null && o.proTeamId != null && want.has(id + '-' + s)) league[id + '-' + s] = o.proTeamId; Object.values(o).forEach(v => walk(v, s)); } };
const dataDir = new URL('public/data/', ROOT);
for (const f of fs.readdirSync(dataDir).filter(f => /^(season|live)-20\d\d/.test(f))) { try { walk(JSON.parse(fs.readFileSync(new URL(f, dataDir), 'utf8')), +f.match(/20\d\d/)[0]); } catch (e) {} }
/* 2. ESPN's list for each season */
const espn = {};
for (const s of [...new Set(pool.map(p => p.season))]) { const f = `${ESPN_DIR}/espn-players-${s}.json`; if (!fs.existsSync(f)) { console.log('no ESPN list for', s); continue; }
  for (const p of JSON.parse(fs.readFileSync(f, 'utf8'))) if (want.has(p.id + '-' + s)) espn[p.id + '-' + s] = p.proTeamId; }
/* 3. FIRST CHOICE: the team he actually played for that season, from his ESPN stats page (one request per player,
   cached in ESPN_DIR/espn-ath-<id>.json). The two lists above are snapshots taken after the season, so a player who moved
   in the offseason shows his next team there (Keenan Allen 2023 as CHI); this doesn't. */
const played = {};
const ids = [...new Set(pool.map(p => p.id))];
for (const id of ids) { const f = `${ESPN_DIR}/espn-ath-${id}.json`; let j = null;
  if (fs.existsSync(f)) { try { j = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) {} }
  if (!j) { try { const r = await fetch(`https://site.web.api.espn.com/apis/common/v3/sports/football/nfl/athletes/${id}/stats`); if (r.ok) { j = await r.json(); fs.writeFileSync(f, JSON.stringify(j)); } } catch (e) {} await new Promise(r => setTimeout(r, 120)); }
  if (!j) continue;
  for (const cat of (j.categories || [])) for (const row of (cat.statistics || [])) { const y = row.season && row.season.year, t = +row.teamId; if (y && t && played[id + '-' + y] == null) played[id + '-' + y] = t; } }
let fromPlayed = 0, fromLeague = 0, fromEspn = 0, none = 0;
for (const p of pool) { const k = p.id + '-' + p.season, t = played[k] ?? league[k] ?? espn[k];
  if (played[k] != null) fromPlayed++; else if (league[k] != null) fromLeague++; else if (espn[k] != null) fromEspn++;
  const ab = ABBR[t]; if (ab) p.tm = ab; else { delete p.tm; none++; } }
fs.writeFileSync(new URL('rated.json', HERE), JSON.stringify(pool));
console.log('teams:', pool.length, 'players;', fromPlayed, 'from the season he played,', fromLeague, 'from league data,', fromEspn, 'from ESPN,', none, 'without a team');
