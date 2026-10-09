/* ALL MATCHUPS: THE LEAGUE'S TOP TEN, AND ONE TEAM'S SIX.
 *
 *   THE SIX            highest and lowest score, biggest win, worst loss,
 *                      closest win, closest loss -- each a ranking of every game
 *                      in league history
 *   WHAT COUNTS        finished counting games: a meaningless postseason game is
 *                      out, a week still being played is out, a tie has a score
 *                      but no margin; a score is one per team per game, a margin
 *                      one per game from the winner's or the loser's side
 *   THE LEAGUE         four lists -- biggest blowout, closest game, highest and
 *                      lowest score -- the top ten of each, whoever played them;
 *                      a game list is winner over loser, ringed for either side
 *   THE NOTICE         a game from the week just finished that made a list gets
 *                      a Tuesday card for everybody, a new #1 saying so
 *   ONE TEAM           its most extreme game on each edge, with that game's place
 *                      in the same all-time ranking, the opponent and the week
 *
 * Run: node scripts/test-extremes.mjs
 */
import fs from 'fs';
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
const grab = lifter(new URL('../public/app.js', import.meta.url));

/* teams 1-3 are franchises a, b, c; team 4 is d, who has since left */
const G = (wk, h, hp, a, ap, winner) => ({ matchupPeriodId: wk, home: { teamId: h, totalPoints: hp },
  away: { teamId: a, totalPoints: ap }, winner: winner || (hp > ap ? 'HOME' : ap > hp ? 'AWAY' : 'TIE') });
const META = {
  2025: { owners: { 1: 'a', 2: 'b', 3: 'c', 4: 'd' }, schedule: [
    G(1, 1, 150, 2, 100),          // a by 50
    G(2, 2, 120.4, 3, 119.8),      // b by 0.6
    G(3, 3, 90, 1, 130),           // a by 40
    G(4, 4, 140, 2, 80),           // d by 60
    G(15, 1, 200, 3, 10),          // a meaningless postseason game
  ] },
  2026: { owners: { 1: 'a', 2: 'b', 3: 'c' }, schedule: [
    G(1, 2, 160, 3, 80),           // b by 80
    G(1, 1, 100, 1, 100),          // (a playing itself: ignored)
    G(2, 1, 101, 3, 101),          // a tie: a score each, no margin
    G(3, 1, 5, 2, 3, 'UNDECIDED'), // being played: nobody's lowest
  ] },
};
const M = assemble(grab, [
  'const weekDecided=', 'const weekScored=', 'function weeksOf(', 'function weekOver(',
  'const MX_FACTORS=', 'const MX_TOP=', 'const MX_LISTS=', 'const MX_TILE_LIST=', 'let _mxFactor=',
  'function mxSides(){', 'function mxData(){',
  'const mxFmt=', 'const mxAb=', 'const mxCrest=', 'function mxLeagueHTML(owner){', 'function mxNewEntries(',
  'function mxTeamHTML(owner){', 'function ntExtremes(out){',
], ['mxData', 'mxTeamHTML', 'mxLeagueHTML', 'mxNewEntries', 'ntExtremes', 'MX_TILE_LIST', 'setFactor'], [
  'const ALL_SEASONS=[2025,2026];',
  `const _seasonMeta=${JSON.stringify(META)};`,
  "const _franchises=[{owner:'a',name:'Alpha'},{owner:'b',name:'Bravo'},{owner:'c',name:'Charlie'}];",
  'const postGameCounts=(s,mu)=>mu.matchupPeriodId<15;',
  'const mgSeasonName=(s,o)=>o.toUpperCase()+" FC";',
  'const sbTeamAb=(o,n)=>o.toUpperCase();',
  /* a franchise that has left has no crest on file, which is what sbAvatar says */
  "const sbAvatar=o=>['a','b','c'].includes(o)?`<i data-av=\"${o}\"></i>`:'';",
  'const avatarCore=n=>`<i data-init=\"${n}\"></i>`;',
  'const setFactor=k=>{_mxFactor=k;};',
  /* the notification's world: 2026 week 1 just finished */
  "const ntSeason=()=>'2026'; const ntLastWeek=()=>({week:1}); const ntResultsFresh=()=>true;",
  'const ntWeekResultsDay=()=>7; const ntName=(s,o)=>o.toUpperCase()+" FC";',
  'const ntScore=(a,b,note)=>`[${a.owner} ${a.pts} > ${b.owner} ${b.pts} ${note}]`;',
  'const ntStat=(o,n,v,l)=>`[${o}|${v}|${l}]`;',
].join(NL));

const d = M.mxData();
const list = k => d.lists[k].map(x => x.g.o + ':' + x.v + '#' + x.rk);
const mine = (o, k) => { const x = d.per[o][k]; return x ? [x.v, x.rk, x.g.opp, x.g.season, x.g.week] : null; };

head('every game, ranked');
ok('highest score: every score once, the meaningless 200 and the unfinished 5 left out', list('hi'),
  ['b:160#1', 'a:150#2', 'd:140#3', 'a:130#4', 'b:120.4#5', 'c:119.8#6', 'a:101#7', 'c:101#7', 'b:100#9', 'c:90#10', 'b:80#11', 'c:80#11']);
ok('lowest score, level games sharing a place, the earlier listed first', list('lo').slice(0, 4),
  ['b:80#1', 'c:80#1', 'c:90#3', 'b:100#4']);
ok('biggest win: one per game, from the winner\'s side; a tie is no margin', list('bw'),
  ['b:80#1', 'd:60#2', 'a:50#3', 'a:40#4', 'b:0.6#5']);
ok('worst loss: the same games from the loser\'s side', list('bl'), ['c:80#1', 'b:60#2', 'b:50#3', 'c:40#4', 'c:0.6#5']);
ok('closest win', list('cw').slice(0, 2), ['b:0.6#1', 'a:40#2']);
ok('closest loss', list('cl').slice(0, 2), ['c:0.6#1', 'c:40#2']);

head('one team\'s six');
ok('its highest score, with its place all-time', mine('a', 'hi'), [150, 2, 'b', 2025, 1]);
ok('its lowest: the tie, not the unfinished 5', mine('a', 'lo'), [101, 5, 'c', 2026, 2]);
ok('its biggest win is third all-time', mine('a', 'bw'), [50, 3, 'b', 2025, 1]);
ok('a team that never lost has no loss to show', [mine('a', 'bl'), mine('a', 'cl')], [null, null]);
ok('a game against a franchise that has left still counts', mine('b', 'bl'), [60, 2, 'd', 2025, 4]);
ok('and the franchise that left is nobody\'s six', d.per.d, undefined);

head('the league section');
M.setFactor('hi');
const league = M.mxLeagueHTML('a');
const rows = [...league.matchAll(/class="mx-row( mx-me)?"/g)];
ok('the top ten, whoever played them', rows.length, 10);
ok('one team can hold several of them, each ringed for the team selected', rows.filter(r => r[1]).length, 3);
ok('a franchise that has left is in it, its initials standing in for a crest', /data-init="D FC"/.test(league), true);
ok('each row names the opponent with its crest, and the week', league.includes('<span class="mx-vs">vs</span><i data-av="b"></i><span>B · Wk 1 2025</span>'), true);
ok('headed as the all-time top ten', league.includes('all-time top 10'), true);

head('four lists, the margins told once a game');
ok('four chips, in this order', [...league.matchAll(/class="mx-chip [^"]*"[^>]*>([^<]+)</g)].map(m => m[1]),
  ['Biggest blowout', 'Closest game', 'Highest score', 'Lowest score']);
M.setFactor('blow');
const blow = M.mxLeagueHTML('b');
ok('biggest blowout: winner over loser, widest first', [...blow.matchAll(/data-av="(\w)"><\/i>\s*<span class="mx-r-ab">(\w)<\/span>\s*<span class="mx-r-g"><span class="mx-vs">def\.<\/span>(?:<i data-av="(\w)"><\/i>|<i data-init="(\w) FC"><\/i>)/g)].map(m => m[2] + '>' + (m[3] || m[4]).toUpperCase()),
  ['B>C', 'A>B', 'A>C', 'B>C']);
ok('every game once, the margin plain, in the page colour', [(blow.match(/class="mx-row/g) || []).length, blow.includes('>80.0<'), /mx-list mx-neu/.test(blow)], [5, true, true]);
ok('a game the selected team was in is ringed, on either side', [...blow.matchAll(/class="mx-row( mx-me)?"/g)].map(r => !!r[1]),
  [true, true, true, false, true]);
M.setFactor('close');
ok('closest game, tightest first, ringed for either side', [...M.mxLeagueHTML('c').matchAll(/class="mx-row( mx-me)?"/g)].map(r => !!r[1]),
  [true, true, false, false, true]);
ok('a team tile opens the list it belongs to', [M.MX_TILE_LIST.bw, M.MX_TILE_LIST.bl, M.MX_TILE_LIST.cw, M.MX_TILE_LIST.cl, M.MX_TILE_LIST.hi],
  ['blow', 'blow', 'close', 'close', 'hi']);
M.setFactor('nope');
ok('a list nobody knows falls back to the first', /mx-chip mx-neu on"/.test(M.mxLeagueHTML('a')), true);

head('into the record book');
const fresh = M.mxNewEntries('2026', 1).map(e => e.F.k + ':' + e.x.g.o + '#' + e.x.rk);
ok('every game from the week that made a list, with its place', fresh, ['blow:b#1', 'close:b#5', 'hi:b#1', 'lo:c#1']);
ok('one close game can make four lists, both its scores in two of them', M.mxNewEntries('2025', 2).map(e => e.F.k), ['blow', 'close', 'hi', 'hi', 'lo', 'lo']);
ok('a meaningless postseason game makes none', M.mxNewEntries('2025', 15), []);
const cards = []; M.ntExtremes(cards);
ok('a card for each, everybody\'s, with the Tuesday results', [cards.length, cards.every(c => c.kind === 'extreme' && c.day === 7)], [4, true]);
ok('a new #1 says so; the rest give their place', cards.map(c => c.title),
  ['New league record · Biggest blowout', 'Top 10 · Closest game', 'New league record · Highest score', 'New league record · Lowest score']);
ok('a game list shows the scoreline, a score list the team that scored it',
  [cards[0].art, cards[2].art], ['[b 160 > c 80 margin]', '[b|160.0|vs C]']);
ok('and the place in words', cards[1].body, '<b>#5</b> all-time for closest game.');
ok('its button opens that list', cards.map(c => c.go + ':' + c.goList), ['extremes:blow', 'extremes:close', 'extremes:hi', 'extremes:lo']);
ok('one card per game per list', new Set(cards.map(c => c.id)).size, 4);

head('the team section');
const team = M.mxTeamHTML('a');
ok('six tiles, good beside bad', [...team.matchAll(/class="mx-tile (mx-good|mx-bad)"/g)].map(m => m[1]),
  ['mx-good', 'mx-bad', 'mx-good', 'mx-bad', 'mx-good', 'mx-bad']);
ok('titled plainly', [...team.matchAll(/class="mx-t-l">([^<]+)</g)].map(m => m[1]),
  ['Highest score', 'Lowest score', 'Biggest win', 'Worst loss', 'Closest win', 'Closest loss']);
ok('each with its all-time place', team.includes('<b>#2</b><small>all-time</small>') && team.includes('<b>#3</b><small>all-time</small>'), true);
ok('the opponent\'s crest and abbreviation, and the score', team.includes('<i data-av="b"></i><b>B</b>') && team.includes('150.0–100.0'), true);
ok('the week written out', team.includes('Week 1 · 2025'), true);
ok('no note under it', /mx-note|The rank is where/.test(team), false);

head('the page');
const SRC = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
ok('the league above the team', SRC.indexOf('${mxLeagueHTML(owner)}') < SRC.indexOf('${mxTeamHTML(owner)}') && SRC.indexOf('${mxLeagueHTML(owner)}') > 0, true);

console.log(NL + (fail ? 'FAILED  ' : 'ok  ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
