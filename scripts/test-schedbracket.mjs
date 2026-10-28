/* PROJECTED BRACKETS: THE SCHEDULE PAGE'S TWO BRACKETS, SEEDED BY PROJECTED FINISH.
 *
 *   ONE CALL A GAME  every regular-season game left is called once, on the Win%
 *                    chance -- the winner gets the W and the loser the L, so the
 *                    wins added always equal the losses added
 *   SEEDS            by projected record; level records by projected points for
 *                    (points so far plus the projected score of each game left)
 *   CHAMPIONSHIP     1 and 2 bye (not drawn in week 15); 4 v 5 feeds 1 and 3 v 6
 *                    feeds 2, each on the row of the game it feeds
 *   LOSERS'          11 and 12 sit out (not drawn in week 15); 7 v 10 and 8 v 9;
 *                    12 and 11 wait in week 16 for the week-15 losers, one line
 *                    spanning both rows since they are dealt by seed
 *   BARE             weeks 15 and 16 only; a spot not yet decided is an empty
 *                    cell -- no "winner of", no notes above or beside
 *   HIDDEN           once there is no regular season left to project
 *
 * Run: node scripts/test-schedbracket.mjs
 */
import { lifter, assemble } from './lib/lift.mjs';

const NL = String.fromCharCode(10);
let pass = 0, fail = 0;
const ok = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; console.log('  PASS  ' + name); return; }
  fail++;
  console.log('  FAIL  ' + name + NL + '          got  ' + g + NL + '          want ' + w);
};
const head = t => console.log(NL + t);

const M = assemble(lifter(new URL('../public/app.js', import.meta.url)), [
  'function schedAllTimePct(owner){', 'function schedTeamOf(owner){', 'function schedCall(owner,oppOwner,p){',
  'function schedProjSeeds(){', 'function schedBracketsHTML(){',
], ['schedProjSeeds', 'schedBracketsHTML', 'set'], `
let _h2hAll={}, _ownerMap={}, _teams=[], _book=null, _season=null, _p={}, _proj={};
const set=(k,v)=>{ if(k==='teams') _teams=v; if(k==='om') _ownerMap=v; if(k==='book') _book=v; if(k==='season') _season=v; if(k==='p') _p=v; if(k==='proj') _proj=v; if(k==='h2h') _h2hAll=v; };
const sbBuild=()=>_book; const schedSeason=()=>_season;
const schedWinProb=(a,b,w)=>_p[a.owner+'|'+b.owner]!=null?_p[a.owner+'|'+b.owner]:0.6;
const schedEspnProj=w=>_proj[w]||null;
const sbAvatar=o=>'<i data-av="'+o+'"></i>'; const sbTeamAb=o=>o.toUpperCase();`);

/* twelve teams, o1..o12, standing in that order on wins after week 7 */
const O = Array.from({ length: 12 }, (_, i) => 'o' + (i + 1));
const om = Object.fromEntries(O.map((o, i) => [i + 1, o]));
const teams = O.map((o, i) => ({ id: i + 1, name: 'Team ' + o, wins: 11 - i, losses: i, ties: 0, pf: 900 - i * 10 }));
const book = { rows: O.map(o => ({ owner: o, ppg: 100 })) };
/* week 8: o1 v o12 ... one fixture per pair, home favoured at 60% */
const unplayed = [];
for (let i = 0; i < 6; i++) unplayed.push({ matchupPeriodId: 8, home: { teamId: i + 1 }, away: { teamId: 12 - i } });
M.set('om', om); M.set('teams', teams); M.set('book', book);
M.set('season', { meta: { owners: om }, regEnd: 14, unplayed });

head('one call a game');
let P = M.schedProjSeeds();
const added = P.seeds.reduce((s, x) => s + x.w + x.l, 0) - teams.reduce((s, t) => s + t.wins + t.losses, 0);
ok('six games left: six wins and six losses added, no more', added, 12);
ok('every home favourite won at 60%', P.seeds.slice(0, 6).map(x => x.owner), ['o1', 'o2', 'o3', 'o4', 'o5', 'o6']);

head('seeds: projected record, then projected points for');
/* o7 and o8 level on 4-4 after week 8 (o7 lost at o6 as 5-2... ) -- force a tie and split it on points */
const tied = teams.map(t => t.id === 7 || t.id === 8 ? { ...t, wins: 4, losses: 3 } : t);
M.set('teams', tied);
M.set('p', { 'o5|o8': 0.4, 'o6|o7': 0.4 });                          // both underdogs win: 5-3 each
M.set('proj', { 8: { o7: 140, o8: 90 } });                          // o7 projected to score more
P = M.schedProjSeeds();
const s7 = P.seeds.find(x => x.owner === 'o7'), s8 = P.seeds.find(x => x.owner === 'o8');
ok('level at 5-3: o7 ahead on projected points for', [s7.w, s8.w, s7.seed < s8.seed], [5, 5, true]);
ok('projected points for = points so far + the projected score left', [s7.ppf, s8.ppf], [840 + 140, 830 + 90]);
M.set('teams', teams); M.set('p', {}); M.set('proj', {});

head('the championship bracket');
const html = M.schedBracketsHTML();
const blocks = html.split('class="spb-bracket ').slice(1);
const seedsIn = s => [...s.matchAll(/class="spb-seed">(\d+)</g)].map(m => +m[1]);
/* every game as [week, grid row, seeds], in the order drawn */
const games = b => [...b.matchAll(/class="spb-game spb-w(\d+)" style="grid-row:(\d+)">([\s\S]*?)<\/div><\/div>/g)]
  .map(m => [+m[1], +m[2], seedsIn(m[3])]);
const C = games(blocks[0]);
ok('week 15: 4 v 5 and 3 v 6, the byes not drawn', C.filter(g => g[0] === 15).map(g => g[2]), [[4, 5], [3, 6]]);
ok('week 16: 1 and 2 first appear, each across from an empty cell', C.filter(g => g[0] === 16).map(g => g[2]), [[1], [2]]);
ok('4 v 5 shares a row with 1 and 3 v 6 with 2, so the lines run straight across',
  C.map(g => g[1] + ':' + g[2].join('v')), ['2:4v5', '2:1', '3:3v6', '3:2']);
ok('a line for each row', (blocks[0].match(/class="spb-link"/g) || []).length, 2);

head('the losers\' bracket');
const L = games(blocks[1]);
ok('week 15: 7 v 10 and 8 v 9, 11 and 12 not drawn', L.filter(g => g[0] === 15).map(g => g[2]), [[7, 10], [8, 9]]);
ok('week 16: 12 and 11 first appear, each across from an empty cell', L.filter(g => g[0] === 16).map(g => g[2]), [[12], [11]]);
ok('one line spanning both rows: the losers are dealt by seed, not game to game',
  /class="spb-link merge" style="grid-row:2 \/ span 2"/.test(blocks[1]) && !/class="spb-link"/.test(blocks[1]), true);

head('bare');
ok('weeks 15 and 16 only', [/Week 15/.test(html), /Week 16/.test(html), /Week 17|Championship<|3rd place|Punishment/.test(html)], [true, true, false]);
ok('every undecided spot is an empty cell: 2 + 2', html.split('<div class="spb-team spb-tbd"></div>').length - 1, 4);
ok('no descriptors, no notes, no aside boxes',
  /Winner of|Semifinal (?:winner|loser)|Week 1[56] loser|higher seed|lower seed|are safe|spb-note|spb-aside|Byes|Sitting out|Projected brackets/.test(html), false);
ok('each team shows its abbreviation and projected record', /class="spb-ab">O1<\/span><span class="spb-rec">12–0</.test(html), true);

head('hidden');
M.set('season', { meta: { owners: om }, regEnd: 14, unplayed: [{ matchupPeriodId: 15, home: { teamId: 1 }, away: { teamId: 2 } }] });
ok('no regular season left to project: nothing drawn', M.schedBracketsHTML(), '');
M.set('season', { meta: { owners: om }, regEnd: 14, unplayed });
M.set('teams', teams.slice(0, 10)); M.set('om', Object.fromEntries(Object.entries(om).slice(0, 10)));
M.set('season', { meta: { owners: Object.fromEntries(Object.entries(om).slice(0, 10)) }, regEnd: 14, unplayed });
ok('fewer than twelve teams: nothing drawn', M.schedBracketsHTML(), '');

console.log(NL + (fail ? 'FAILED  ' : 'ok  ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
