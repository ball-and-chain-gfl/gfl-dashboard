/* BUILD A MANAGER: THE BASELINE, THE WHEEL, AND ONE TRAIT A SPIN.
 *
 *   THE BASELINE      twelve managers, nine grades each, every one on the scale,
 *                     and the commissioner's corrections as he gave them
 *   NOTHING LIVE      the game reads the table and no stat, so no grade is fixed
 *                     while the one beside it moves
 *   THE WHEEL         lands on anyone in the league with all nine; a respin never
 *                     lands where it already was; it turns forward, a few full
 *                     turns, and stops with that manager's wedge under the pointer
 *   ONE TRAIT A SPIN  into its own empty slot, and only off whoever was landed on
 *   THE OVERALL       0-99, the mean of what each grade taken is worth
 *   THE SEASON        a finished manager runs a real team through the real
 *                     schedule: 60% manager, 40% roster, a full
 *                     postseason on both sides, and every place handed out once
 *   KEPT ON DEVICE    a saved build comes back only if it still makes sense
 *   SHARED AS A LINK  a finished build packs into ?bam=, grades and all, and
 *                     opens on the first load for whoever it is sent to
 *
 * Run: node scripts/test-bam.mjs
 */
import fs from 'node:fs';
import vm from 'node:vm';
import { lifter, assemble } from './lib/lift.mjs';

const NL = String.fromCharCode(10);
let pass = 0, fail = 0;
const ok = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; console.log('  PASS  ' + name); return; }
  fail++;
  console.log('  FAIL  ' + name + NL + '          got  ' + g + NL + '          want ' + w);
};
const appUrl = new URL('../public/app.js', import.meta.url);
const cfgUrl = new URL('../public/config.js', import.meta.url);
const idxUrl = new URL('../public/index.html', import.meta.url);
const grab = lifter(appUrl);
const M = assemble(grab, [
  'const PG_SCALE=', 'const pgIdx=',
  'const BAM_ATTRS=', 'const BAM_RESPINS=', 'const BAM_TURNS=', 'const BAM_HUES=', 'const bamCfg=',
  'function bamGrade(', 'function bamPool(', 'const bamFresh=', 'const bamOpen=', 'const bamDone=',
  'const BAM_PTS=', 'function bamRating(', 'const bamRateTone=', 'function bamOvr(', 'function bamManagerOvr(', 'function bamPick(', 'function bamTake(', 'function bamSeasonOk(', 'function bamValid(',
  'function bamAim(', 'function bamAt(', 'function bamCode(', 'function bamDecode(',
  'const BAM_MGR_W=', 'const BAM_BASE=', 'const bamStrength=', 'function bamGauss(', 'function bamScore(',
  'function bamGame(', 'function bamRoster(', 'function bamGames(', 'function bamSimSeason(', 'const bamOrd=', 'function bamFinish(',
  'const takesEsc=', 'const bamTeam=', 'const bamAbbr=', 'const BAM_WIN_DAYS=', 'function ntBamWins(', 'function bamRateOrder(',
], ['BAM_ATTRS', 'BAM_RESPINS', 'BAM_TURNS', 'BAM_HUES', 'PG_SCALE', 'bamGrade', 'bamPool', 'bamFresh', 'bamOpen',
  'bamDone', 'BAM_PTS', 'bamRating', 'bamRateTone', 'bamOvr', 'bamManagerOvr', 'BAM_MGR_W', 'bamStrength', 'bamGame', 'bamRoster', 'bamGames', 'bamSimSeason', 'bamFinish', 'bamPick', 'bamTake', 'bamValid', 'bamAim', 'bamAt', 'bamCode', 'bamDecode',
  'ntBamWins', 'bamRateOrder', 'BAM_WIN_DAYS', 'set'], [
  "let _CFG={}, _teams=[], _cpRows=null;",
  "const regEndOf=()=>14;",
  "const TEST_PROFILE='test';",
  "const teamInitials=n=>String(n||'').split(' ').map(w=>w[0]||'').join('').toUpperCase();",
  "const set=o=>{ if('cfg' in o) _CFG=o.cfg; if('teams' in o) _teams=o.teams; if('rows' in o) _cpRows=o.rows; };",
].join(NL));

/* the real table, out of the real config file */
const box = { window: {} };
vm.runInNewContext(fs.readFileSync(cfgUrl, 'utf8'), box);
const CFG = box.window.GFL_CONFIG;
const league = Array.from({ length: 12 }, (_, i) => ({ id: i + 1, name: 'Team ' + (i + 1) }));
M.set({ cfg: CFG, teams: league });
const KEYS = M.BAM_ATTRS.map(([k]) => k);
const L = (id, k) => M.PG_SCALE[M.bamGrade(id, k)];

console.log(NL + 'the baseline');
const table = (CFG.buildManager || {}).grades || {};
ok('all twelve managers are in it', Object.keys(table).map(Number).sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
ok('nine traits, in three rows of three', KEYS, ['draft', 'trade', 'fin', 'coach', 'bk', 'luck', 'eng', 'pun', 'legacy']);
const offScale = [];
for (const [id, row] of Object.entries(table)) for (const k of KEYS) if (M.bamGrade(id, k) < 0) offScale.push(id + '.' + k + '=' + row[k]);
ok('every grade is a letter on the scale', offScale, []);
ok('and nothing extra rides along', Object.values(table).every(r => Object.keys(r).every(k => KEYS.includes(k))), true);
ok('dated, so movement can be measured from it later', CFG.buildManager.asOf, '2026-11-06');

console.log(NL + "the commissioner's corrections");
/* team id -> trait -> letter, exactly as given on 6 November */
const BFT = 10, MCM = 2, BI = 4, SW = 6, FMAN = 5, GOOB = 3, KUNK = 7, KW = 11, MWM = 9, MM = 1, TING = 8, WGLR = 12;
const told = [
  [BFT, 'trade', 'A'], [BFT, 'bk', 'A+'], [BFT, 'pun', 'B-'],
  [MCM, 'trade', 'A+'], [MCM, 'fin', 'C+'], [MCM, 'eng', 'A'], [MCM, 'pun', 'A'],
  [BI, 'bk', 'C'], [BI, 'eng', 'F'],
  [SW, 'eng', 'B-'], [SW, 'pun', 'B'],
  [FMAN, 'eng', 'A+'], [FMAN, 'pun', 'A+'],
  [GOOB, 'eng', 'B'], [GOOB, 'pun', 'C-'],
  [KUNK, 'fin', 'A'], [KUNK, 'eng', 'B'], [KUNK, 'pun', 'A'],
  [KW, 'coach', 'D'], [KW, 'pun', 'C+'],
  [MWM, 'luck', 'D-'], [MWM, 'bk', 'C'], [MWM, 'eng', 'C-'], [MWM, 'pun', 'C+'],
  [MM, 'draft', 'B'], [MM, 'luck', 'C-'], [MM, 'pun', 'B'],
  [TING, 'eng', 'A+'], [TING, 'pun', 'A'],
  [WGLR, 'luck', 'D+'], [WGLR, 'pun', 'B+'],
  /* and on 6 November, after a look at the table */
  [BFT, 'fin', 'C+'], [GOOB, 'trade', 'B'], [TING, 'luck', 'C+'], [FMAN, 'trade', 'D-'], [MCM, 'luck', 'B'],
];
ok('every grade he set is the grade on file', told.filter(([id, k, g]) => L(id, k) !== g).map(([id, k, g]) => `${id}.${k} ${L(id, k)}≠${g}`), []);
const luck = { [KUNK]: 'A-', [BFT]: 'B', [SW]: 'B', [KW]: 'B', [GOOB]: 'C', [FMAN]: 'D+', [BI]: 'D' };
ok('Luck runs A to D across everyone he did not set by hand', Object.entries(luck).filter(([id, g]) => L(id, 'luck') !== g).map(([id]) => id), []);
ok('and the spread still runs from the top of the B range down to a D', [L(KUNK, 'luck'), L(BI, 'luck')], ['A-', 'D']);

console.log(NL + 'nothing live');
const src = fs.readFileSync(appUrl, 'utf8');
const block = src.slice(src.indexOf('/* ── BUILD A MANAGER'), src.indexOf('/* ── TUESDAY: WHERE EVERYONE STANDS'));
ok('the game is in app.js', block.length > 1000, true);
// The one profile the game touches is your own, to note a title for the league's stack.
const recAt = block.indexOf('function bamRecordWin('), recEnd = block.indexOf('\n}\n', recAt) + 3;
const record = block.slice(recAt, recEnd), play = block.slice(0, recAt) + block.slice(recEnd);
ok('and reads no stat, only the table', ['bkIQFor', 'badBeatData', 'computeCoaching', 'pgComposite', '_draftAllCache',
  '_cmBreakdown', '_scores', '_cpRows', 'legacyTeamHistory'].filter(w => play.includes(w)), []);
ok('a title is noted on your own profile and nothing else is read', [recAt > 0, record.includes('p.id===_me.k1'),
  ['bkIQFor', 'badBeatData', 'computeCoaching', 'pgComposite', '_scores'].filter(w => record.includes(w))], [true, true, []]);

console.log(NL + 'the wheel');
ok('everyone in the league with all nine can come up', M.bamPool(), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
M.set({ teams: league.filter(t => t.id !== 4) });
ok('a team not in the league now cannot', M.bamPool().includes(4), false);
const short = JSON.parse(JSON.stringify(CFG)); delete short.buildManager.grades[7].luck;
M.set({ cfg: short, teams: league });
ok('nor can one missing a grade', M.bamPool().includes(7), false);
M.set({ cfg: CFG });
ok('a respin never lands where it already was', [0, 0.3, 0.6, 0.99999].map(r => M.bamPick([3, 5, 9], 5, () => r)).includes(5), false);
ok('the draw is even across the pool', [0, 0.34, 0.67, 0.99999].map(r => M.bamPick([3, 5, 9], null, () => r)), [3, 5, 9, 9]);
ok('nobody left to land on is nobody', M.bamPick([5], 5, () => 0.5), null);
{
  /* every wedge, from wherever the wheel happens to rest, with the stop pulled
     either way inside the wedge */
  const n = 12, seg = 360 / n, miss = [];
  for (const from of [0, 47, -130, 7215.5]) for (let k = 0; k < n; k++) for (const j of [-0.3, 0, 0.3]) {
    const to = M.bamAim(from, k, n, j * seg, M.BAM_TURNS);
    if (M.bamAt(to, n) !== k) miss.push(`from ${from} to ${k}`);
    if (!(to >= from + M.BAM_TURNS * 360 && to < from + (M.BAM_TURNS + 1) * 360)) miss.push(`${from}→${to} turns`);
  }
  ok('it stops with the chosen wedge under the pointer, five full turns on and never backwards', miss, []);
  ok('resting with a manager under the pointer is no turn at all', M.bamAt(M.bamAim(0, 7, n, 0, 0), n), 7);
  ok('and no two wedges side by side share a colour', Array.from({ length: n }, (_, i) =>
    M.BAM_HUES[i % M.BAM_HUES.length] === M.BAM_HUES[(i + 1) % n % M.BAM_HUES.length]).includes(true), false);
}

console.log(NL + 'one trait a spin');
let b = M.bamFresh();
ok('nothing to take before the wheel stops', M.bamTake(b, 'trade'), false);
b.land = MCM;
ok('the landed manager gives one trait', [M.bamTake(b, 'trade'), b.slots.trade, b.land], [true, MCM, null]);
ok('and the wheel has to turn again before another', M.bamTake(b, 'fin'), false);
b.land = BFT;
ok('a slot already filled stays filled', [M.bamTake(b, 'trade'), b.slots.trade], [false, MCM]);
ok('a trait that does not exist is refused', M.bamTake(b, 'charisma'), false);
ok('the open slots are the ones left', M.bamOpen(b), ['draft', 'fin', 'coach', 'bk', 'luck', 'eng', 'pun', 'legacy']);

console.log(NL + 'the overall');
ok('nothing taken, no overall', M.bamOvr(M.bamFresh()), -1);
ok('thirteen grades, F to A+, climbing to 99', [M.BAM_PTS.length, M.BAM_PTS[0], M.BAM_PTS[12],
  M.BAM_PTS.every((p, i) => !i || p > M.BAM_PTS[i - 1])], [13, 55, 99, true]);
ok('one A+ is a 99', M.bamOvr({ slots: { trade: MCM } }), 99);
ok('an A+ and a C meet at 87', M.bamOvr({ slots: { trade: MCM, coach: FMAN } }), 87);
ok('nine A+ is the top of the scale and no higher', M.bamRating(Array(9).fill(12)), 99);
ok('the colour follows the number', [95, 85, 75, 65, 58].map(M.bamRateTone), ['pg-a', 'pg-b', 'pg-c', 'pg-d', 'pg-f']);
ok('every real manager has an overall of their own', [M.bamManagerOvr(BFT), M.bamManagerOvr(BI)], [92, 69]);

console.log(NL + 'a whole build');
{
  let seed = 7;
  const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
  const g = M.bamFresh(), pool = M.bamPool();
  let spins = 0;
  while (!M.bamDone(g) && spins < 50) {
    g.land = M.bamPick(pool, null, rnd); spins++;
    M.bamTake(g, M.bamOpen(g)[0]);
  }
  ok('nine spins fill nine slots', [spins, M.bamDone(g), Object.keys(g.slots).length], [9, true, 9]);
  ok('every slot holds someone from the pool', Object.values(g.slots).every(id => pool.includes(id)), true);
  ok('and the build has an overall', M.bamOvr(g) >= 0, true);
}

console.log(NL + 'kept on the device');
const pool = M.bamPool();
ok('junk starts a fresh build', [M.bamValid(null, pool), M.bamValid('x', pool), M.bamValid({ slots: 3 }, pool)],
  [M.bamFresh(), M.bamFresh(), M.bamFresh()]);
ok('a sound build comes back as it was',
  M.bamValid({ slots: { trade: 2, bk: 10 }, land: 5, last: 5, respins: 0 }, pool),
  { slots: { trade: 2, bk: 10 }, land: 5, last: 5, respins: 0, team: null, season: null });
ok('a trait that is not one throws it out', M.bamValid({ slots: { charisma: 2 } }, pool), M.bamFresh());
ok('so does a manager no longer in the pool', M.bamValid({ slots: { trade: 2 }, land: 44 }, pool), M.bamFresh());
ok('more respins than a build gets are not believed', M.bamValid({ slots: {}, respins: 5 }, pool).respins, M.BAM_RESPINS);
const full = Object.fromEntries(KEYS.map(k => [k, 1]));
ok('a full build is not still landed on anyone', M.bamValid({ slots: full, land: 3 }, pool).land, null);
ok('a finished build keeps the team it was spun onto', M.bamValid({ slots: full, team: 8 }, pool).team, 8);
ok('an unfinished one has no team to keep', M.bamValid({ slots: { trade: 2 }, team: 8 }, pool).team, null);
ok('and a team not in the league is dropped', M.bamValid({ slots: full, team: 40 }, pool).team, null);

console.log(NL + 'shared as a link');
{
  const built = { slots: { draft: 5, trade: 2, fin: 7, coach: 10, bk: 10, luck: 8, eng: 5, pun: 5, legacy: 7 }, land: null };
  const code = M.bamCode(built, '10');
  ok('a finished build packs into twenty characters', [code.length, /^[0-9a-z]+$/.test(code)], [20, true]);
  const back = M.bamDecode(code);
  ok('and unpacks to the same managers', back.slots, built.slots);
  ok('with the grades they had', KEYS.map(k => M.PG_SCALE[back.grades[k]]), KEYS.map(k => L(built.slots[k], k)));
  ok('and who built it', back.by, 10);
  ok('nobody signed in is nobody', M.bamDecode(M.bamCode(built, null)).by, null);
  /* the grades ride in the code: change the table and the link still shows the build as made */
  const moved = JSON.parse(JSON.stringify(CFG)); moved.buildManager.grades[2].trade = 'F';
  M.set({ cfg: moved });
  ok('a link keeps its grades when the table changes', M.PG_SCALE[M.bamDecode(code).grades.trade], 'A+');
  M.set({ cfg: CFG });
  ok('a build not yet finished has no link', M.bamCode({ slots: { trade: 2 } }, 10), '');
  ok('a garbled code opens nothing', [M.bamDecode(''), M.bamDecode('hello'), M.bamDecode(code.slice(0, 19)),
    M.bamDecode(code.slice(0, 3) + 'z' + code.slice(4)), M.bamDecode('2' + code.slice(1))], [null, null, null, null, null]);
  ok('capitals from a phone keyboard still open it', M.bamDecode(code.toUpperCase()).slots, built.slots);
  ok('and the overall of a shared build comes out of the grades it carries',
    M.bamRating(KEYS.map(k => back.grades[k])), M.bamOvr(built));
}

console.log(NL + 'the season');
{
  let seed = 11;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  ok('60% manager, 40% roster', [M.BAM_MGR_W, M.bamStrength(90, 70), M.bamStrength(70, 90)], [0.6, 82, 78]);
  /* a big sample of one game at a time, to hold the noise to what was promised:
     the better side wins most weeks and not every one */
  const share = (sa, sb, n = 6000) => { let w = 0; for (let i = 0; i < n; i++) if (M.bamGame(1, 2, { 1: sa, 2: sb }, rnd).win === 1) w++; return w / n; };
  const even = share(80, 80), ten = share(85, 75), twenty = share(90, 70);
  ok('level sides are a coin flip', even > 0.47 && even < 0.53, true);
  ok('ten points of strength wins about seven in ten', ten > 0.64 && ten < 0.76, true);
  ok('twenty about eight or nine in ten, and still not all', twenty > 0.78 && twenty < 0.92, true);
  ok('so the manager carries a team more than its roster does',
    share(M.bamStrength(95, 60), M.bamStrength(60, 95)) > 0.55, true);
  const g = M.bamGame(1, 2, { 1: 80, 2: 80 }, rnd);
  ok('a game has a winner, a loser and a score each, never level', [g.win !== g.lose, g.as !== g.bs, [g.a, g.b].includes(g.win)], [true, true, true]);

  /* a round robin's worth of weeks for twelve teams, as a schedule */
  const sched = [];
  for (let w = 1; w <= 14; w++) for (let i = 0; i < 6; i++) {
    const a = ((i + w) % 12) + 1, b = ((11 - i + w) % 12) + 1;
    sched.push({ matchupPeriodId: w, home: { teamId: a, totalPoints: w <= 8 ? 100 + a * 2 : 0 }, away: { teamId: b, totalPoints: w <= 8 ? 100 + b * 2 : 0 },
      winner: w <= 8 ? (a > b ? 'HOME' : 'AWAY') : 'UNDECIDED' });
  }
  sched.push({ matchupPeriodId: 15, home: { teamId: 1, totalPoints: 0 }, away: { teamId: 2, totalPoints: 0 }, winner: 'UNDECIDED' });
  const meta = { schedule: sched };
  const games = M.bamGames(meta, '2026');
  ok('the regular season is every game of weeks 1 to 14, and nothing after', [games.length, Math.max(...games.map(x => x.w))], [84, 14]);
  const roster = M.bamRoster(meta, '2026');
  const avg = Object.values(roster).reduce((a, x) => a + x, 0) / 12;
  ok('the roster reads 80 at the league average, from games already decided', Math.abs(avg - 80) < 1, true);
  ok('better scorers read higher, inside 55 to 99', [roster[12] > roster[1], Object.values(roster).every(v => v >= 55 && v <= 99)], [true, true]);
  ok('a season with nothing played is no roster at all', M.bamRoster({ schedule: sched.map(m => ({ ...m, winner: 'UNDECIDED' })) }, '2026'), {});

  const str = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [i + 1, 70 + i * 2]));
  const s = M.bamSimSeason(games, str, rnd);
  ok('everybody plays all fourteen', s.table.every(t => t.w + t.l === 14), true);
  ok('the table is wins, then points for', s.table.every((t, i) => !i || s.table[i - 1].w > t.w || (s.table[i - 1].w === t.w && s.table[i - 1].pf >= t.pf)), true);
  ok('twelve places, each handed out once', Object.values(s.place).sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  const po = s.post.filter(x => x.side !== 'lb'), lb = s.post.filter(x => x.side === 'lb');
  ok('six playoff games and five in the losers bracket', [po.length, lb.length], [6, 5]);
  const r1 = po.filter(x => x.round === 1).flatMap(x => [x.a, x.b]);
  ok('the top two seeds sit out the first round', [r1.includes(s.seed[0]), r1.includes(s.seed[1]), r1.length], [false, false, 4]);
  ok('and the champion came out of the top six', s.seed.slice(0, 6).includes(Object.keys(s.place).map(Number).find(id => s.place[id] === 1)), true);
  const l1 = lb.filter(x => x.round === 1).flatMap(x => [x.a, x.b]);
  ok('the worst two sit out the losers first round', [l1.includes(s.seed[11]), l1.includes(s.seed[10]), l1.length], [false, false, 4]);
  const [a1, a2] = lb.filter(x => x.round === 1), lr2 = lb.filter(x => x.round === 2).flatMap(x => [x.a, x.b]);
  ok('in the losers bracket it is the loser who goes on', [lr2.includes(a1.lose), lr2.includes(a2.lose), lr2.includes(a1.win)], [true, true, false]);
  const last = lb.find(x => x.round === 3);
  ok('and losing the last game there is last place', s.place[last.lose], 12);
  ok('a finish for every place, last place included', [M.bamFinish(1).big, M.bamFinish(12).big], ['Champion', 'Last place']);

  /* the point of it: the same team, a better manager, a better season */
  const wins = mgr => { let t = 0; for (let i = 0; i < 300; i++) {
    const st = { ...str, 6: M.bamStrength(mgr, 80) }; t += M.bamSimSeason(games, st, rnd).table.find(x => x.id === 6).w; } return t / 300; };
  const good = wins(95), poor = wins(60);
  ok('a 95 manager wins more than a 60 with the same roster', good > poor + 3, true);
}

console.log(NL + 'a champion, for the whole league');
{
  const CHAMP = '2ab46497413b7ac57b43' + '3' + '1' + 'b' + '3' + '1';    // GOOB, 1st, 11-3, 1 seed
  const SECOND = '2ab46497413b7ac57b43' + '3' + '2' + 'b' + '3' + '1';
  const now = Date.now(), day = 864e5;
  const win = (code, t) => JSON.stringify({ t, code });
  const cards = rows => { M.set({ rows }); const out = []; M.ntBamWins(out); return out; };
  const fresh = cards([{ id: 'bft', teamId: '10', bamWin: win(CHAMP, now - 3600e3) }]);
  ok('a title this week is a card for everyone', fresh.length, 1);
  ok('named for the win, so a new one replaces it rather than stacking', fresh[0].id, `bam:bft:${now - 3600e3}`);
  ok('with the share picture, who won, with whom, and a way in', [fresh[0].art.includes(`src="/b/${CHAMP}/card.png"`),
    /Team 10<\/b> won the title with Team 3, 11-3\./.test(fresh[0].body), fresh[0].go], [true, true, 'bam']);
  const d = new Date(now - 3600e3); d.setHours(0, 0, 0, 0);
  ok('dated the day it was won, so it shows from that morning', fresh[0].day, d.getTime());
  ok('a week on, it has gone', cards([{ id: 'bft', teamId: '10', bamWin: win(CHAMP, now - (M.BAM_WIN_DAYS + 1) * day) }]).length, 0);
  ok('a runner-up is no news', cards([{ id: 'bft', teamId: '10', bamWin: win(SECOND, now) }]).length, 0);
  ok('nor is a field that is not a win', cards([{ id: 'bft', teamId: '10', bamWin: 'nonsense' },
    { id: 'mm', teamId: '1', bamWin: win('<script>', now) }]).length, 0);
  ok('nor the test account', cards([{ id: 'test', teamId: '10', bamWin: win(CHAMP, now) }]).length, 0);
  ok('and nothing before the profiles are in', cards(null).length, 0);
  M.set({ rows: null });
}

console.log(NL + 'every manager\'s ratings');
ok('a tab for each of the twelve, best overall first', [M.bamRateOrder().length, M.bamRateOrder()[0]], [12, BFT]);
ok('in order of overall all the way down', M.bamRateOrder().every((id, i, a) => !i || M.bamManagerOvr(a[i - 1]) >= M.bamManagerOvr(id)), true);

console.log(NL + 'where it lives');
const idx = fs.readFileSync(idxUrl, 'utf8').replace(/\r\n/g, '\n');
ok('the tab is named', /TAB_LABELS=\{[^}]*bam:'Build a Manager'/.test(src), true);
ok('and opens the game', src.includes("if(name==='bam') renderBam();"), true);
ok('it sits in the menu right after Hot Takes', /data-tab="takes"[^\n]*\n[^\n]*\n\s*<button class="tab-btn" data-tab="bam"/.test(idx), true);
const hex = (src.match(/TAB_COLORS=\{[^}]*bam:'(#[0-9A-Fa-f]{6})'/) || [])[1];
ok('the menu icon and the page accent are one colour', [hex,
  idx.includes(`.tab-btn[data-tab=bam]{--tc:${hex};}`),
  idx.includes(`html[data-tabaccent=bam]{--h1a:${hex};`),
  idx.includes(`[data-tabaccent=bam]{--accent:${hex};`)], ['#A66CFF', true, true, true]);
{
  /* the turning disc and the fixed ring have to meet: disc radius from its inset,
     ring's inner edge from its radius less half its width, both out of 100 */
  const inset = Number((idx.match(/\.bam-wheel\{[^}]*inset:([\d.]+)%/) || [])[1]);
  const w = Number((idx.match(/\.bam-ring\{[^}]*stroke-width:([\d.]+)/) || [])[1]);
  const r = Number((src.match(/class="bam-ring" cx="100" cy="100" r="([\d.]+)"/) || [])[1]);
  ok('the disc meets its ring with no gap', [inset, w, r, +(100 - 2 * inset).toFixed(2) === +(r - w / 2).toFixed(2)], [3.5, 7, 96.5, true]);
}
ok('a shared link is read before the first tab is chosen',
  /try\{ bamReadLink\(\); \}catch\(e\)\{\}\n\s*switchTab\(_activeTab\);/.test(src.replace(/\r\n/g, '\n')), true);
ok('a finished build offers Share', src.includes('onclick="bamShare()"'), true);
ok('and shares the /b/ link a message app can draw', src.includes("location.origin+'/b/'+code"), true);
ok('your own build says nothing about who built it', src.includes('${bamCardHeadHTML(null)}'), true);
ok('a title is recorded the moment the season is decided, signed in, first place only',
  [/bamSave\(\);\n\s*bamRecordWin\(b\);/.test(src.replace(/\r\n/g, '\n')), src.includes('if(!sum||sum.place!==1||!code) return;'),
    src.includes("gflPatchProfile(_me.k1,{bamWin:rec})")], [true, true, true]);
ok('and the league\'s stack carries it', [/\[ntBkMakeGood,ntMotwPick,ntPunishGrades,ntBamWins,/.test(src),
  /bamwin:\s*\{icon:'fa-trophy'/.test(src), src.includes("if(where==='bam')")], [true, true, true]);
ok('every manager\'s ratings, from under the build', [src.includes('onclick="bamRatingsOpen()"'), idx.includes('id="bam-rate-overlay"')], [true, true]);
ok('a tile\'s parts are never named like a grade\'s colour (bam-tb was both)', [src.includes('class="bam-tb"'), src.includes('class="bam-tbot"')], [false, true]);
ok('and a share carries the picture with no title text alongside it', [src.includes('{files:[file]}:{url}'), src.includes("title:'Build a Manager'")], [true, false]);
const vj = JSON.parse(fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
ok('which vercel.json sends to the preview, picture and page', ['/b/:code/card.png', '/b/:code'].map(p =>
  (vj.rewrites.find(r => r.source === p) || {}).destination), ['/api/bam?c=:code&img=1', '/api/bam?c=:code']);
ok('the wheel has no flashing lights', [src.includes('bam-bulb'), idx.includes('bamBulb')], [false, false]);
ok('every trait has an icon and no colour of its own', M.BAM_ATTRS.every(a => /^fa-/.test(a[2]) && a.length === 3), true);
{
  /* a filled box is its grade's colour: the five box colours are the five letter colours */
  const box = Object.fromEntries([...idx.matchAll(/\.bam-t([abcdf])\{--bc:(#[0-9A-Fa-f]{6});\}/g)].map(m => [m[1], m[2].toLowerCase()]));
  const letter = Object.fromEntries([...idx.matchAll(/\.pg-([abcdf])\{color:(#[0-9A-Fa-f]{6});\}/g)].map(m => [m[1], m[2].toLowerCase()]));
  ok('a filled box takes the colour of its grade, the same as the letter', [Object.keys(box).sort().join(''), ['a', 'b', 'c', 'd', 'f'].every(k => box[k] === letter[k])], ['abcdf', true]);
  ok('the slots and the picks both carry it', [src.includes("' filled '+bamToneCls(gi)"), src.includes('class="bam-pick ${bamToneCls(i)}"')], [true, true]);
  ok('and the dashed open outline is only ever on an empty slot, never over a grade\'s colour', src.includes("${open&&!filled?' open':''}"), true);
}
ok('and leaving a shared build takes the link out of the address', /function bamOwn\(\)\{[\s\S]{0,200}searchParams\.delete\('bam'\)/.test(src), true);

console.log(NL + `${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
