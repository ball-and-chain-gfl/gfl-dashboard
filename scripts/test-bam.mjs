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
  'const BAM_SCALE=', 'const bamIdx=', 'const BAM_CODE=', 'const bamTone=', 'const bamToneCls=',
  'const BAM_ATTRS=', 'const BAM_RESPINS=', 'const BAM_TURNS=', 'const BAM_HUES=', 'const bamCfg=',
  'function bamGrade(', 'function bamPool(', 'const bamFresh=', 'const bamOpen=', 'const bamDone=',
  'const BAM_PTS=', 'function bamRating(', 'const bamRateTone=', 'function bamOvr(', 'function bamManagerOvr(', 'function bamPick(', 'function bamTake(', 'function bamSeasonOk(', 'function bamValid(',
  'function bamAim(', 'function bamAt(', 'function bamCode(', 'function bamDecode(',
  'const BAM_MGR_W=', 'const BAM_BASE=', 'const bamStrength=', 'function bamGauss(', 'function bamScore(',
  'function bamGame(', 'function bamRoster(', 'function bamGames(', 'function bamSimSeason(', 'const bamOrd=', 'function bamFinish(',
  'const takesEsc=', 'const bamTeam=', 'const bamAbbr=', 'const BAM_WIN_DAYS=', 'function ntBamWins(', 'function bamRateOrder(',
  'function bamRateCardHTML(', 'function bamRatingsHTML(', 'function bamResultHTML(',
  /* a title's GFL Bucks, and the bank they land in */
  'const lsKey=', 'function realWeekStart(', 'const bucks2=', 'function bucksFor(',
  'const BAM_PRIZE=', 'const BAM_PRIZE_FROM=', 'const bamPaidKey=', 'const bamPaidParse=', 'function bamPaidClean(',
  'function bamPaidMine(', 'const bkBamTimes=', 'function bamBucks(', 'function bamPrizeDue(',
], ['BAM_ATTRS', 'BAM_RESPINS', 'BAM_TURNS', 'BAM_HUES', 'BAM_SCALE', 'BAM_CODE', 'bamTone', 'bamToneCls', 'bamGrade', 'bamPool', 'bamFresh', 'bamOpen',
  'bamDone', 'BAM_PTS', 'bamRating', 'bamRateTone', 'bamOvr', 'bamManagerOvr', 'BAM_MGR_W', 'bamStrength', 'bamGame', 'bamRoster', 'bamGames', 'bamSimSeason', 'bamFinish', 'bamPick', 'bamTake', 'bamValid', 'bamAim', 'bamAt', 'bamCode', 'bamDecode',
  'ntBamWins', 'bamRateOrder', 'BAM_WIN_DAYS', 'bamRateCardHTML', 'bamRatingsHTML', 'bamResultHTML',
  'BAM_PRIZE', 'BAM_PRIZE_FROM', 'bamPaidClean', 'bamPaidMine', 'bamBucks', 'bamPrizeDue', 'bucksFor', 'realWeekStart', 'set'], [
  "let _CFG={}, _teams=[], _cpRows=null, _bamRateSel=null, _me=null, _bkScope=null, _ls={}, _now=null;",
  "const localStorage={getItem:k=>(k in _ls?_ls[k]:null), setItem:(k,v)=>{ _ls[k]=String(v); }};",
  // a clock the prize's bucks weeks can be read against: the real one unless set
  "const RealDate=globalThis.Date;",
  "class Date extends RealDate{ constructor(...a){ if(!a.length&&_now!=null) super(_now); else super(...a); } static now(){ return _now!=null?_now:RealDate.now(); } }",
  // the drawing helpers stand in as tags, so the pop-up's own markup can be read
  "const avatarHTML=t=>'<av '+(t&&t.id)+'>'; const bamPx=s=>'['+s+']';",
  "const bamSlotHTML=(a,id,gi)=>'<slot '+a[0]+'='+gi+'>'; const bamOvrHTML=(n,left)=>'<ovr '+n+' '+left+'>';",
  "const regEndOf=()=>14;",
  "const TEST_PROFILE='test';",
  "const teamInitials=n=>String(n||'').split(' ').map(w=>w[0]||'').join('').toUpperCase();",
  "const set=o=>{ if('cfg' in o) _CFG=o.cfg; if('teams' in o) _teams=o.teams; if('rows' in o) _cpRows=o.rows; if('sel' in o) _bamRateSel=o.sel;",
  "  if('me' in o) _me=o.me; if('ls' in o) _ls=o.ls; if('now' in o) _now=o.now; };",
].join(NL));

/* the real table, out of the real config file */
const box = { window: {} };
vm.runInNewContext(fs.readFileSync(cfgUrl, 'utf8'), box);
const CFG = box.window.GFL_CONFIG;
const league = Array.from({ length: 12 }, (_, i) => ({ id: i + 1, name: 'Team ' + (i + 1) }));
M.set({ cfg: CFG, teams: league });
const KEYS = M.BAM_ATTRS.map(([k]) => k);
const L = (id, k) => M.BAM_SCALE[M.bamGrade(id, k)];

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
/* team id -> trait -> letter, round by round as he gave them on 6 November.
   A later round's word on a grade is the one that stands. */
const BFT = 10, MCM = 2, BI = 4, SW = 6, FMAN = 5, GOOB = 3, KUNK = 7, KW = 11, MWM = 9, MM = 1, TING = 8, WGLR = 12;
const rounds = [
  [
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
  ],
  /* after a look at the table */
  [[BFT, 'fin', 'C+'], [GOOB, 'trade', 'B'], [TING, 'luck', 'C+'], [FMAN, 'trade', 'D-'], [MCM, 'luck', 'B']],
  /* and again, with an F+ and the first three S */
  [
    [KUNK, 'trade', 'B+'], [KUNK, 'pun', 'A-'], [KUNK, 'eng', 'B-'],
    [BFT, 'luck', 'B-'], [BFT, 'fin', 'C'], [BFT, 'eng', 'S'],
    [TING, 'pun', 'A+'],
    [MCM, 'legacy', 'B-'], [MCM, 'trade', 'S'],
    [FMAN, 'trade', 'F'], [FMAN, 'pun', 'S'],
    [GOOB, 'eng', 'B-'], [GOOB, 'pun', 'C'], [GOOB, 'coach', 'A'],
    [MM, 'trade', 'C+'], [MM, 'fin', 'B-'], [MM, 'pun', 'C+'], [MM, 'bk', 'B+'],
    [SW, 'legacy', 'C'], [SW, 'pun', 'C+'], [SW, 'luck', 'B-'], [SW, 'fin', 'B-'],
    [MWM, 'pun', 'B-'], [MWM, 'legacy', 'C-'], [MWM, 'eng', 'B'],
    [KW, 'draft', 'D+'], [KW, 'trade', 'C'], [KW, 'bk', 'D-'], [KW, 'luck', 'B+'], [KW, 'pun', 'D+'], [KW, 'legacy', 'D+'],
    [WGLR, 'legacy', 'F+'], [WGLR, 'luck', 'D'],
    [BI, 'trade', 'D+'], [BI, 'luck', 'C-'], [BI, 'coach', 'C-'],
  ],
];
const told = new Map();
rounds.flat().forEach(([id, k, g]) => told.set(id + '.' + k, [id, k, g]));
ok('every grade he set is the grade on file, his latest word on each', [...told.values()].filter(([id, k, g]) => L(id, k) !== g).map(([id, k, g]) => `${id}.${k} ${L(id, k)}≠${g}`), []);
ok('three S, one each in Trading, Engagement and Punishment',
  Object.entries(table).flatMap(([id, row]) => KEYS.filter(k => row[k] === 'S').map(k => id + '.' + k)).sort(), ['10.eng', '2.trade', '5.pun']);
const lucks = Object.keys(table).map(id => L(id, 'luck'));
ok('Luck still spreads from the A range down to the D range', [lucks.some(g => g[0] === 'A'), lucks.some(g => g[0] === 'D'), lucks.every(g => 'ABCD'.includes(g[0]))], [true, true, true]);

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
ok('fifteen grades, F, F+, D- and on up to A+ and then S', [M.BAM_SCALE.length, M.BAM_SCALE.slice(0, 3), M.BAM_SCALE.slice(-2)],
  [15, ['F', 'F+', 'D-'], ['A+', 'S']]);
ok('each worth more than the one below: F 55, F+ 59, A+ 99, S 103', [M.BAM_PTS.length, M.BAM_PTS[0], M.BAM_PTS[1], M.BAM_PTS[13], M.BAM_PTS[14],
  M.BAM_PTS.every((p, i) => !i || p > M.BAM_PTS[i - 1])], [15, 55, 59, 99, 103, true]);
ok('one A+ is a 99', M.bamOvr({ slots: { coach: BFT } }), 99);
ok('an A+ and a C meet at 87', M.bamOvr({ slots: { coach: BFT, draft: TING } }), 87);
ok('an S beside a C counts for more than an A+ would', M.bamOvr({ slots: { trade: MCM, draft: TING } }), 89);
ok('nine A+ is the top of the scale', M.bamRating(Array(9).fill(13)), 99);
ok('and nine S is no higher', M.bamRating(Array(9).fill(14)), 99);
ok('the colour follows the number', [95, 85, 75, 65, 58].map(M.bamRateTone), ['pg-a', 'pg-b', 'pg-c', 'pg-d', 'pg-f']);
ok('an S is blue, an F+ is an F\'s red', [M.bamTone(14), M.bamToneCls(14), M.bamTone(1), M.bamToneCls(1), M.bamTone(13)],
  ['pg-s', 'bam-ts', 'pg-f', 'bam-tf', 'pg-a']);
ok('every real manager has an overall of their own', [M.bamManagerOvr(BFT), M.bamManagerOvr(BI)], [91, 70]);

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
  { slots: { trade: 2, bk: 10 }, land: 5, last: 5, respins: 0, team: null, season: null, paid: null });
ok('and with no season, nothing paid for one', M.bamValid({ slots: { trade: 2 }, paid: true }, pool).paid, null);
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
  ok('with the grades they had', KEYS.map(k => M.BAM_SCALE[back.grades[k]]), KEYS.map(k => L(built.slots[k], k)));
  ok('and who built it', back.by, 10);
  ok('nobody signed in is nobody', M.bamDecode(M.bamCode(built, null)).by, null);
  /* the grades ride in the code: change the table and the link still shows the build as made */
  const moved = JSON.parse(JSON.stringify(CFG)); moved.buildManager.grades[2].trade = 'F';
  M.set({ cfg: moved });
  ok('a link keeps its grades when the table changes', M.BAM_SCALE[M.bamDecode(code).grades.trade], 'S');
  M.set({ cfg: CFG });
  /* S and F+ came after links were already being sent: they take the two
     characters past the old thirteen, and every old character means what it did */
  ok('an S travels as d, an F+ as e', [code[5], M.bamCode({ ...built, slots: { ...built.slots, legacy: WGLR } }, 10)[19]], ['d', 'e']);
  const tops = { slots: { draft: 10, trade: 2, fin: 7, coach: 10, bk: 10, luck: 7, eng: 10, pun: 5, legacy: 12 } };
  ok('and come back the same', KEYS.map(k => M.BAM_SCALE[M.bamDecode(M.bamCode(tops, 10)).grades[k]]), KEYS.map(k => L(tops.slots[k], k)));
  ok('a link sent before S and F+ reads as it always did: 0 an F, 1 a D-, c an A+',
    ['draft', 'trade', 'fin'].map(k => M.BAM_SCALE[M.bamDecode('1a' + '30' + '31' + '3c' + '3c'.repeat(6)).grades[k]]), ['F', 'D-', 'A+']);
  ok('and nothing past e is a grade', M.bamDecode('1a' + '3f' + '3c'.repeat(8)), null);
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

console.log(NL + 'a title pays $10 GFL Bucks, once a bucks week');
{
  const at = (y, mo, d, h = 12) => new Date(y, mo - 1, d, h).getTime();
  const NOW = at(2026, 11, 20);                    // a Friday, two bucks weeks after titles started paying
  M.set({ now: NOW, me: { k1: 'bft', teamId: 10 }, ls: {}, rows: [] });
  ok('ten dollars a title, from 6 November', [M.BAM_PRIZE, new Date(M.BAM_PRIZE_FROM).toDateString()], [10, 'Fri Nov 06 2026']);
  const mon = at(2026, 11, 9), tue5 = at(2026, 11, 10, 5), tue7 = at(2026, 11, 10, 7), thu = at(2026, 11, 12);
  ok('the first title of a bucks week is paid and a second that week is not', M.bamPaidClean([thu, tue7]), [tue7]);
  ok('the week turns at 6am on Tuesday', M.bamPaidClean([mon, tue5, tue7]), [mon, tue7]);
  ok('nothing from before titles paid, from the future, or that is not a time at all',
    [M.bamPaidClean([at(2026, 11, 5), NOW + 7200e3, 'x', null, -1, at(2026, 11, 18)]), M.bamPaidClean('nope')], [[at(2026, 11, 18)], []]);
  M.set({ ls: { 'bft:bampaid': JSON.stringify([tue7]) } });
  ok('your device\'s list is in your bank', M.bamBucks(), 10);
  M.set({ rows: [{ id: 'bft', bamPaid: JSON.stringify([tue7, at(2026, 11, 18)]) }, { id: 'mm', bamPaid: JSON.stringify([thu]) }] });
  ok('and so is your profile\'s, with no title counted twice and nobody else\'s counted', M.bamBucks(), 20);
  ok('a title in a week already paid is not paid again', M.bamPrizeDue(NOW), false);
  ok('next week\'s is', M.bamPrizeDue(at(2026, 11, 24, 7)), true);
  M.set({ ls: {}, rows: [] });
  ok('with nothing paid this week, a title is', M.bamPrizeDue(NOW), true);
  ok('another manager\'s bank holds what their profile carries', M.bucksFor({ bamTimes: [mon, tue7] }, () => M.bamBucks()), 20);
  M.set({ me: null });
  ok('signed out there is no bank to pay into', [M.bamBucks(), M.bamPaidMine()], [0, []]);
  M.set({ now: null, rows: null });

  const fin = paid => M.bamResultHTML(3, 1, 11, 3, 1, paid);
  ok('a title that paid says so on the Champion box', fin(true).includes('[+$10 GFL Bucks]'), true);
  ok('one won after the week\'s was paid says that instead', [fin(false).includes('[$10 already paid this week]'), fin(false).includes('+$')], [true, false]);
  ok('with nobody signed in to pay, nothing about money', fin(null).includes('$'), false);
  ok('and only a title pays', M.bamResultHTML(3, 2, 10, 4, 2, true).includes('$'), false);
}

console.log(NL + 'every manager\'s ratings');
ok('a tab for each of the twelve, best overall first', [M.bamRateOrder().length, M.bamRateOrder()[0]], [12, BFT]);
ok('in order of overall all the way down', M.bamRateOrder().every((id, i, a) => !i || M.bamManagerOvr(a[i - 1]) >= M.bamManagerOvr(id)), true);
{
  const order = M.bamRateOrder();
  M.set({ sel: null });
  const pop = M.bamRatingsHTML();
  const onTabs = pop.match(/class="bam-rtab on"[^>]*data-id="(\d+)"/g) || [];
  ok('opened fresh, the best is picked, and only one tab is lit', [onTabs.length, (onTabs[0] || '').endsWith(`data-id="${order[0]}"`)], [1, true]);
  ok('every tab says which manager it is, so a pick only moves the light', (pop.match(/class="bam-rtab[^"]*"[^>]*data-id="\d+"/g) || []).length, 12);
  ok('the card sits in its own box, repainted alone', pop.includes('<div id="bam-rate-card">'), true);
  const card = M.bamRateCardHTML(order, order[0]);
  ok('the arrows go round: back from the first is the last', [card.includes(`bamRatingsPick(${order[11]})`), card.includes(`bamRatingsPick(${order[1]})`)], [true, true]);
  ok('nine tiles, the overall and the rank', [(card.match(/<slot /g) || []).length, card.includes(` of 12>`)], [9, true]);
  M.set({ sel: order[5] });
  ok('opened again, it remembers the last one looked at', (M.bamRatingsHTML().match(/class="bam-rtab on"[^>]*data-id="(\d+)"/) || [])[1], String(order[5]));
  M.set({ sel: null });
}

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
{
  const fn = name => { const a = src.indexOf(name); return a < 0 ? '' : src.slice(a, src.indexOf('\n}\n', a) + 2); };
  const pick = fn('function bamRatingsPick('), key = fn('function bamRatingsKey('), close = fn('function bamRatingsClose(');
  ok('the ratings pop-up: its backdrop answers no tap, so nothing outside closes it or shrinks it',
    /id="bam-rate-overlay"[^>]*onclick/.test(idx), false);
  ok('no backdrop anywhere shrinks on a press, nor the menu\'s scrim', idx.includes('.modal-overlay:active,#nav-scrim:active,'), true);
  ok('and nothing inside this one moves when pressed: the tabs, arrows and X answer in colour',
    [idx.includes('.bam-rate-modal button:active{transform:none;}'), /\.bam-rate-modal \.bam-rtab:active\{background:/.test(idx)], [true, true]);
  ok('a pick moves the light and repaints the card, and never rebuilds the strip of tabs',
    [pick.includes("classList.toggle('on',on)"), pick.includes('bamRateCardHTML('), pick.includes('bamRatingsHTML(')], [true, true, false]);
  const reveal = fn('function bamRateReveal(');
  ok('the strip scrolls only itself, never the page', [reveal.includes('strip.scrollLeft'), (reveal + pick).includes('scrollIntoView')], [true, false]);
  ok('the arrow keys move the pick and nothing else', key.includes('e.preventDefault();'), true);
  ok('the X and Escape close it, whatever was tapped', [close.includes('e.target'), idx.includes('onclick="bamRatingsClose()"')], [false, true]);
}
ok('and a share carries the picture with no title text alongside it', [src.includes('{files:[file]}:{url}'), src.includes("title:'Build a Manager'")], [true, false]);
const vj = JSON.parse(fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
ok('which vercel.json sends to the preview, picture and page', ['/b/:code/card.png', '/b/:code'].map(p =>
  (vj.rewrites.find(r => r.source === p) || {}).destination), ['/api/bam?c=:code&img=1', '/api/bam?c=:code']);
ok('the wheel has no flashing lights', [src.includes('bam-bulb'), idx.includes('bamBulb')], [false, false]);
ok('every trait has an icon and no colour of its own', M.BAM_ATTRS.every(a => /^fa-/.test(a[2]) && a.length === 3), true);
{
  /* a filled box is its grade's colour: the six box colours are the six letter colours */
  const box = Object.fromEntries([...idx.matchAll(/\.bam-t([abcdfs])\{--bc:(#[0-9A-Fa-f]{6});\}/g)].map(m => [m[1], m[2].toLowerCase()]));
  const letter = Object.fromEntries([...idx.matchAll(/\.pg-([abcdfs])\{color:(#[0-9A-Fa-f]{6});\}/g)].map(m => [m[1], m[2].toLowerCase()]));
  ok('a filled box takes the colour of its grade, the same as the letter', [Object.keys(box).sort().join(''), ['a', 'b', 'c', 'd', 'f', 's'].every(k => box[k] === letter[k])], ['abcdfs', true]);
  const blue = h => { const [r, g, b] = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)); return b > r + 60 && b > g + 30; };
  ok('and an S is blue', blue(box.s || '#000000'), true);
  ok('the slots and the picks both carry it', [src.includes("' filled '+bamToneCls(gi)"), src.includes('class="bam-pick ${bamToneCls(i)}"')], [true, true]);
  ok('and the dashed open outline is only ever on an empty slot, never over a grade\'s colour', src.includes("${open&&!filled?' open':''}"), true);
}
ok('and leaving a shared build takes the link out of the address', /function bamOwn\(\)\{[\s\S]{0,200}searchParams\.delete\('bam'\)/.test(src), true);
{
  const lf = src.replace(/\r\n/g, '\n');
  const fn = name => { const a = lf.indexOf(name); return a < 0 ? '' : lf.slice(a, lf.indexOf('\n}\n', a) + 2); };
  ok('a title is paid where it is recorded: due or not is kept with the build, and only a due one pays',
    /b\.paid=bamPrizeDue\(now\);\n\s*bamSave\(\);\n\s*if\(b\.paid\) bamPaySave\(now\);/.test(fn('function bamRecordWin(')), true);
  ok('the Champion box is told what it paid', lf.includes('bamResultHTML(me,sum.place,sum.w,sum.l,sum.seed,b.paid)'), true);
  ok('your balance counts it, and so do the Leaderboards', [lf.includes('+eggBucks()+bam-inv-idle-plant'),
    fn('function ldBucks(').includes('bamPaidClean(bamPaidParse(p.bamPaid))'), fn('function ldBucks(').includes('bamTimes=bamPaidMine()')], [true, true, true]);
  ok('a balance replayed to an earlier moment counts only the titles won by then',
    fn('function bucksBaseAt(').includes('const bam=bkBamTimes().filter(x=>Number(x)<=t);'), true);
  const pay = fn('async function bamPaySave(');
  ok('and a paid title is saved over nothing another device paid: the profile\'s list is read and folded in first',
    [pay.indexOf('gflFetchProfile(acct)') > 0, pay.indexOf('gflFetchProfile(acct)') < pay.indexOf('gflPatchProfile(acct,{bamPaid:list})'),
      pay.includes('bamPaidClean(dev.concat(srv))')], [true, true, true]);
}

console.log(NL + `${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
