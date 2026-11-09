/* BUILD A MANAGER ACHIEVEMENTS: THE TROPHY CASE.
 *
 *   THE LIST          thirty, with the rewards the commissioner approved, every
 *                     name drawable in the game's pixel type
 *   ONE RECORD        a manager's record read from anywhere is cleaned; two
 *                     records (device and profile) fold into one without
 *                     losing anything either earned
 *   WHAT EARNS        landings, traits taken, a finished build, and a season's
 *                     result, each the moment it happens; signed in only
 *   A SEASON WAITS    for the end of its reveal, so nothing gives it away
 *   THE BANK          every achievement pays its reward once, into the balance,
 *                     the replay, the plant's fee and the Leaderboards
 *   ONE READ, ONE     write a season, the profile's copy folded in first, and
 *   WRITE             none at all if that read fails
 *   THE POP-UP        a row each with its bar, what is new lit up, and what is
 *                     left of Use every attribute
 *
 * Run: node scripts/test-bam-ach.mjs
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
  'const BAM_SCALE=', 'const bamIdx=', 'const BAM_PTS=', 'const BAM_ATTRS=', 'const BAM_RESPINS=', 'const bamTone=', 'const bamToneCls=',
  'const bamCfg=', 'const bamSeth=', 'const bamIsSeth=', 'function bamGrade(', 'function bamTeamPool(', 'function bamPool(',
  'const bamFresh=', 'const bamOpen=', 'const bamDone=', 'function bamRating(', 'function bamOvr(', 'function bamManagerOvr(',
  'function bamSeasonSum(', 'const BAM_ROUNDS=', 'function bamMine(', 'const bamTeam=', 'const bamAbbr=', 'function bamRateOrder(',
  'function bamSeasonOk(', 'function bamValid(',
  'const BAM_G=', 'const BAM_GLYPH=', 'function bamPxClean(',
  'const lsKey=', 'const bucks2=', 'function bucksFor(', 'const bkAch=', 'function bamAchBucks(',
  'const BAM_ACH_FROM=', 'const bamAchPool=', 'const bamAchIn=', 'const bamBits=', 'const BAM_ACH=',
  'const bamAchName=', 'const bamAchKey=', 'const bamAchBlank=', 'const BAM_ACH_MAX=', 'function bamAchClean(', 'function bamAchMerge(',
  'const bamAchOf=', 'function bamAchMine(', 'function bamAchPaid(', 'function bamAchEdit(', 'function bamAchLand(', 'function bamAchTake(',
  'function bamAchSeason(', 'async function bamAchSave(', 'function bamAchSeen(', 'const bamAchNewCount=', 'function bamTrophyHTML(',
  'function bamAchLeftHTML(', 'function bamAchRowHTML(', 'function bamAchHTML(',
], ['BAM_ATTRS', 'BAM_ACH', 'BAM_ACH_FROM', 'bamAchName', 'bamPxClean', 'bamAchBlank', 'bamAchClean', 'bamAchMerge', 'bamAchOf',
  'bamAchMine', 'bamAchPaid', 'bamAchEdit', 'bamAchLand', 'bamAchTake', 'bamAchSeason', 'bamAchSave', 'bamAchBucks', 'bucksFor',
  'bamAchNewCount', 'bamTrophyHTML', 'bamAchRowHTML', 'bamAchHTML', 'bamFresh', 'bamValid', 'bamOvr', 'bamManagerOvr', 'set', 'log'], [
  "let _CFG={}, _teams=[], _cpRows=null, _me=null, _bkScope=null, _ls={}, _now=null, _bamAchMemo=null, _bamAchSince=0, _bamAchLeft=false;",
  "const localStorage={getItem:k=>(k in _ls?_ls[k]:null), setItem:(k,v)=>{ _ls[k]=String(v); }};",
  "const RealDate=globalThis.Date;",
  "class Date extends RealDate{ constructor(...a){ if(!a.length&&_now!=null) super(_now); else super(...a); } static now(){ return _now!=null?_now:RealDate.now(); } }",
  "const avatarHTML=t=>'<av '+(t&&t.id)+'>'; const bamPx=s=>'['+s+']'; const bamPxWrap=s=>'{'+s+'}';",
  "const teamInitials=n=>String(n||'').split(' ').map(w=>w[0]||'').join('').toUpperCase();",
  /* the network, as a log: what was read, what was written, and what the profile holds */
  "const log={reads:0,writes:[],prof:{},readFails:false,saves:0};",
  "async function gflFetchProfile(id){ log.reads++; return log.readFails?{error:'quota'}:{data:{...log.prof}}; }",
  "async function gflPatchProfile(id,obj){ log.writes.push(obj); Object.assign(log.prof,obj); return {ok:true}; }",
  "function bamSave(){ log.saves++; }",
  "const set=o=>{ if('cfg' in o) _CFG=o.cfg; if('teams' in o) _teams=o.teams; if('rows' in o) _cpRows=o.rows;",
  "  if('me' in o) _me=o.me; if('ls' in o) _ls=o.ls; if('now' in o) _now=o.now; if('since' in o) _bamAchSince=o.since; if('left' in o) _bamAchLeft=o.left; };",
].join(NL));

const box = { window: {} };
vm.runInNewContext(fs.readFileSync(cfgUrl, 'utf8'), box);
const CFG = box.window.GFL_CONFIG;
const league = Array.from({ length: 12 }, (_, i) => ({ id: i + 1, name: 'Team ' + (i + 1), abbrev: ['MM', 'MCM', 'GOOB', 'BI', 'FMAN', 'SW', 'KUNK', 'TING', 'MWM', 'BFT', 'KW', 'WGLR'][i] }));
const SETH = CFG.buildManager.seth.id;
const KEYS = M.BAM_ATTRS.map(([k]) => k);
const NOW = new Date(2026, 10, 9, 20).getTime();
const fresh = () => { M.set({ cfg: CFG, teams: league, me: { k1: 'bft', teamId: 10 }, ls: {}, rows: [], now: NOW, since: 0, left: false });
  M.log.reads = 0; M.log.writes = []; M.log.prof = {}; M.log.readFails = false; };
fresh();
const rec = () => M.bamAchMine();
const done = () => Object.keys(rec().done).sort();
const flush = () => new Promise(r => setTimeout(r, 0));

console.log(NL + 'the list');
/* widened on 8 November at the commissioner's word: $10 at the bottom, $750 for
   a title with every team, and $1000 for completing every achievement; then
   the two 95s at $400 each, a title with 2 Seths down to $200, and no title
   with MCM or WGLR */
const want = { nail: 10, s10: 10, seth: 15, land: 15, title: 25, big: 25, toilet: 30, last: 40, nine: 40, w5: 50, sethw: 50, s50: 60,
  teams: 75, b2b: 75, own: 75, six: 125, s100: 150, seth2: 150, coach: 200, seth2w: 200, w25: 250, p2000: 350, m95: 400, t95: 400,
  every: 500, three: 500, winless: 500, perfect: 600, allwin: 750, all: 1000 };
ok('thirty, each with its reward, cheapest first',
  [M.BAM_ACH.length, Object.fromEntries(M.BAM_ACH.map(a => [a.id, a.r])), M.BAM_ACH.every((a, i, l) => !i || l[i - 1].r <= a.r)], [30, want, true]);
ok('$6670 in all', M.BAM_ACH.reduce((s, a) => s + a.r, 0), 6670);
ok('the spread runs from $10 to $750, with $1000 on top for the lot',
  [Math.min(...M.BAM_ACH.map(a => a.r)), Math.max(...M.BAM_ACH.filter(a => a.id !== 'all').map(a => a.r)), M.BAM_ACH[M.BAM_ACH.length - 1].id], [10, 750, 'all']);
ok('no blowout', M.BAM_ACH.some(a => /blow/i.test(a.id + M.bamAchName(a))), false);
ok('every name is drawn whole in the pixel type, no letter dropped',
  M.BAM_ACH.map(M.bamAchName).filter(n => M.bamPxClean(n) !== n.toUpperCase()), []);
ok('no title with MCM or WGLR', M.BAM_ACH.some(a => a.id === 'under'), false);
ok('Use every attribute is every grade of the twelve, Seth aside', M.BAM_ACH.find(a => a.id === 'every').goal(), 108);
ok('and nothing counted from before 8 November', new Date(M.BAM_ACH_FROM).toDateString(), 'Sun Nov 08 2026');

console.log(NL + 'one record');
ok('junk reads as a blank record', [M.bamAchClean(null), M.bamAchClean('x'), M.bamAchClean({ n: -3, land: 'no', done: [] })],
  [M.bamAchBlank(), M.bamAchBlank(), M.bamAchBlank()]);
{
  const c = M.bamAchClean({ n: 4.7, bm: 140, bs: 30, land: [3, 3, '5', 99, 0, -1, 1.5], use: { 3: 1023, 99: 4, x: 1 },
    done: { title: NOW - 1000, nope: NOW, last: M.BAM_ACH_FROM - 1, seth: NOW + 7200e3 } });
  ok('kept to what makes sense: whole counts, the scale\'s top, real managers, nine bits, real achievements since 8 November',
    [c.n, c.bm, c.bs, c.land, c.use, c.done], [4, 99, 9, [3, 5], { 3: 511 }, { title: NOW - 1000 }]);
}
{
  const a = { n: 10, w: 2, st: 2, stT: 500, land: [1, 2], play: [3], use: { 1: 3 }, bg: 150.5, done: { title: NOW - 5000, land: NOW - 100 } };
  const b = { n: 7, w: 4, st: 0, stT: 900, land: [2, 9], win: [4], use: { 1: 4, 6: 1 }, bg: 120, done: { title: NOW - 9000 } };
  const m = M.bamAchMerge(a, b);
  ok('device and profile fold together: the larger count, both sets, every grade used, an achievement from its first time',
    [m.n, m.w, m.bg, m.land, m.play, m.win, m.use, m.done], [10, 4, 150.5, [1, 2, 9], [3], [4], { 1: 7, 6: 1 }, { title: NOW - 9000, land: NOW - 100 }]);
  ok('and the run of titles is whichever played last', [m.st, m.stT], [0, 900]);
  ok('in either order', JSON.stringify(M.bamAchMerge(b, a)) === JSON.stringify(m), true);
}

console.log(NL + 'what earns');
fresh();
league.forEach(t => M.bamAchLand(t.id));
M.bamAchLand(SETH);
ok('landing on all twelve earns Land on every manager, and Seth is not one of them', [rec().land.length, done()], [12, ['land']]);
fresh();
{
  const b = M.bamFresh();
  b.slots.draft = 10; M.bamAchTake(b, 10, 'draft');
  b.slots.trade = SETH; M.bamAchTake(b, SETH, 'trade');
  ok('a trait taken is a grade used; Seth\'s are his own; one Seth earns Get a Seth', [rec().use, rec().bs, done()], [{ 10: 1 }, 1, ['seth']]);
  b.slots.fin = SETH; M.bamAchTake(b, SETH, 'fin');
  ok('a second in the same build earns Get 2 Seths', done(), ['seth', 'seth2']);
}
fresh();
{
  const b = M.bamFresh();
  KEYS.forEach((k, i) => { b.slots[k] = i + 1; M.bamAchTake(b, i + 1, k); });
  ok('nine different managers in one build', [rec().bd, done().includes('nine')], [9, true]);
  ok('and the finished build\'s overall is its best so far', rec().bm, M.bamOvr(b));
}
fresh();
{
  /* the best grade on the board in every slot: an S where there is one */
  const b = M.bamFresh();
  KEYS.forEach(k => { b.slots[k] = SETH; M.bamAchTake(b, SETH, k); });
  ok('an all-Seth build is a 99 manager: Build a 95 overall manager', [rec().bm, done().includes('m95')], [99, true]);
}
fresh();
{
  /* every grade of every manager, Seth aside */
  const b = M.bamFresh();
  league.forEach(t => KEYS.forEach(k => M.bamAchTake(b, t.id, k)));
  ok('all 108 grades used earns Use every attribute', [M.BAM_ACH.find(a => a.id === 'every').at(rec()), done().includes('every')], [108, true]);
}
fresh();
{
  const others = M.BAM_ACH.filter(a => a.id !== 'all').map(a => a.id);
  M.set({ ls: { 'bft:bamach': JSON.stringify({ done: Object.fromEntries(others.slice(1).map(id => [id, NOW - 1000])) }) } });
  M.bamAchLand(3);
  ok('all but one is not the lot', done().includes('all'), false);
  const b = { ...M.bamFresh(), slots: Object.fromEntries(KEYS.map(k => [k, 10])) };
  const wonBy = M.bamAchSeason({ ...b, team: 3, ach: { tr: 85 }, season: { log: [{ w: 1, a: 3, b: 1, as: 100.5, bs: 100, win: 3, lose: 1 }], post: [],
    table: [{ id: 3, w: 1, l: 0, pf: 100.5 }].concat(league.filter(t => t.id !== 3).map(t => ({ id: t.id, w: 0, l: 1, pf: 90 }))),
    seed: [3].concat(league.filter(t => t.id !== 3).map(t => t.id)), place: { 3: 5 } } });
  ok('the last of them earns Complete every achievement in the same moment', [wonBy, done().includes('all')], [['nail', 'all'], true]);
  ok('and pays its $1000 with the rest', M.bamAchBucks(), 6670);
  await flush();
}
fresh();
M.set({ me: null });
M.bamAchLand(3);
ok('signed out, nothing is kept and nothing is paid', [M.bamAchMine(), M.bamAchBucks()], [M.bamAchBlank(), 0]);

console.log(NL + 'a season');
/* a season for `team`: its regular-season scores, its record, its seed and where it finished */
const season = ({ team, place, w, l, seed, scores }) => {
  const opp = team === 1 ? 2 : 1;
  const log = scores.map(([a, b], i) => ({ w: i + 1, a: team, b: opp, as: a, bs: b, win: a > b ? team : opp, lose: a > b ? opp : team }));
  const order = league.map(t => t.id).filter(id => id !== team);
  order.splice(seed - 1, 0, team);
  const table = order.map(id => id === team ? { id, w, l, pf: Math.round(scores.reduce((s, x) => s + x[0], 0) * 10) / 10 } : { id, w: 7, l: 7, pf: 1500 });
  return { log, post: [], table, seed: order, place: { [team]: place } };
};
const games = (won, lost, mine = 130, theirs = 110) => [...Array(won)].map(() => [mine, theirs]).concat([...Array(lost)].map(() => [theirs, mine]));
const slots = id => Object.fromEntries(KEYS.map(k => [k, id]));
const play = async (o, sl, tr = 85) => {
  const b = { ...M.bamFresh(), slots: sl || slots(10), team: o.team, season: season(o), ach: { tr } };
  const got = M.bamAchSeason(b); await flush(); return { b, got };
};
fresh();
{
  const { b, got } = await play({ team: 3, place: 2, w: 10, l: 4, seed: 2, scores: games(10, 4).concat() });
  ok('a season counts once: the build is marked, the record moves', [b.ach, rec().n, rec().play, got], [true, 1, [3], []]);
}
fresh();
{
  const { got } = await play({ team: 10, place: 1, w: 11, l: 3, seed: 1, scores: games(11, 3) });
  ok('your own team\'s title: Win the championship and Win a title with your own team', got.sort(), ['own', 'title']);
  ok('and it is a team won with', rec().win, [10]);
}
fresh();
{
  const { got } = await play({ team: 2, place: 1, w: 8, l: 6, seed: 6, scores: games(8, 6) }, slots(4));
  ok('a sixth seed\'s title with Motor City and a weak manager: Cinderella and Coach \'em up, and nothing for whose team it was',
    got.sort(), ['coach', 'six', 'title']);
}
fresh();
{
  const sl = { ...slots(10), draft: SETH, trade: SETH };
  const { got } = await play({ team: 5, place: 1, w: 12, l: 2, seed: 1, scores: games(12, 2) }, sl);
  ok('a title with two Seths earns both Seth titles', got.filter(x => /seth/.test(x)).sort(), ['seth2w', 'sethw']);
}
fresh();
{
  const { got } = await play({ team: 12, place: 12, w: 0, l: 14, seed: 12, scores: games(0, 14) });
  ok('0-14 and last: Go 0-14 and Finish last', got.sort(), ['last', 'winless']);
}
fresh();
{
  const { got } = await play({ team: 9, place: 11, w: 4, l: 10, seed: 10, scores: games(4, 10) });
  ok('eleventh is winning the losers final', got, ['toilet']);
}
fresh();
{
  const { got } = await play({ team: 9, place: 1, w: 14, l: 0, seed: 1, scores: games(14, 0, 145, 100) });
  ok('14-0 earns Go 14-0, and 2030 points Score 2000 in a regular season', [got.includes('perfect'), got.includes('p2000'), rec().bw, rec().bp], [true, true, 14, 2030]);
}
fresh();
{
  const near = await play({ team: 9, place: 5, w: 7, l: 7, seed: 5, scores: games(6, 7).concat([[100.1, 99.1]]) });
  ok('a win by a whole point is no nail-biter, however the sum rounds', near.got.includes('nail'), false);
  const close = await play({ team: 9, place: 5, w: 7, l: 7, seed: 5, scores: games(6, 7).concat([[100.9, 100.0]]) });
  ok('by nine tenths it is', close.got.includes('nail'), true);
  const lost = await play({ team: 9, place: 5, w: 6, l: 8, seed: 5, scores: games(6, 7).concat([[100.0, 100.5]]) });
  ok('and losing by half a point is not winning by it', lost.got, []);
}
fresh();
{
  const big = await play({ team: 9, place: 5, w: 7, l: 7, seed: 5, scores: games(6, 7).concat([[181.2, 120]]) }, null, 96);
  ok('180 in a game and a 96 team', [big.got.includes('big'), big.got.includes('t95'), rec().bg, rec().bt], [true, true, 181.2, 96]);
}
fresh();
{
  const t = o => play({ team: 4, place: o, w: 9, l: 5, seed: 2, scores: games(9, 5) });
  const g1 = (await t(1)).got, g2 = (await t(1)).got, g3 = (await t(2)).got, g4 = (await t(1)).got, g5 = (await t(1)).got, g6 = (await t(1)).got;
  ok('back to back, a loss to break the run, then three in a row', [g1.includes('b2b'), g2.includes('b2b'), g3, g5.includes('three'), g6.includes('three'), rec().st],
    [false, true, [], false, true, 3]);
  ok('five titles is Win 5 titles', [rec().w, done().includes('w5')], [5, true]);
}
fresh();
{
  for (let i = 0; i < 10; i++) await play({ team: (i % 12) + 1, place: 3, w: 9, l: 5, seed: 3, scores: games(9, 5) });
  ok('ten seasons is Play 10 seasons', [rec().n, done().includes('s10')], [10, true]);
}
fresh();
{
  for (const t of league) await play({ team: t.id, place: 1, w: 10, l: 4, seed: 1, scores: games(10, 4) });
  ok('a title with every team is Win with every team, and every team played', [done().includes('allwin'), done().includes('teams')], [true, true]);
}
fresh();
{
  const b = { ...M.bamFresh(), slots: slots(10), team: 3, season: season({ team: 3, place: 1, w: 10, l: 4, seed: 1, scores: games(10, 4) }), ach: { tr: 90 } };
  M.set({ me: null });
  M.bamAchSeason(b); await flush();
  ok('signed out, a season is marked counted and pays nobody', [b.ach, M.log.reads, M.log.writes.length], [true, 0, 0]);
}

console.log(NL + 'a season waits for its reveal');
{
  const src = fs.readFileSync(appUrl, 'utf8').replace(/\r\n/g, '\n');
  const fn = name => { const a = src.indexOf(name); return a < 0 ? '' : src.slice(a, src.indexOf('\n}\n', a) + 2); };
  ok('played, it is owed to the trophy case with its team\'s rating, signed in only',
    /b\.season=bamSimSeason\(games,str\);\n[^\n]*\n\s*b\.ach=_me\?\{tr:Math\.round\(str\[b\.team\]\)\}:null;\n\s*bamSave\(\);/.test(fn('function bamPlay(')), true);
  ok('and counted on the first paint once no reveal is running', fn('function renderBam(').includes('if(b.season&&b.ach&&b.ach!==true&&_bamShown==null) bamAchSeason(b);'), true);
  ok('a landing and a trait count straight away', [fn('async function bamSpin(').includes('bamSave(); bamAchLand(id);'),
    fn('function bamPut(').includes('const b=bamState(), id=b.land;') && fn('function bamPut(').includes('bamSave(); bamAchTake(b,id,k); renderBam();')], [true, true]);
  M.set({ teams: league });
  const pool = league.map(t => t.id).concat([SETH]);
  const sea = season({ team: 3, place: 2, w: 10, l: 4, seed: 2, scores: games(10, 4) });
  const kept = x => M.bamValid({ slots: slots(10), team: 3, season: sea, ...x }, pool).ach;
  ok('a build off the device keeps what it owes, and a season from before achievements owes nothing',
    [kept({ ach: { tr: 88 } }), kept({ ach: true }), kept({}), kept({ ach: 'x' }), M.bamValid({ slots: {}, ach: true }, pool).ach],
    [{ tr: 88 }, true, null, null, null]);
}

console.log(NL + 'the bank');
fresh();
{
  const t1 = NOW - 86400e3, t2 = NOW - 3600e3;
  M.set({ ls: { 'bft:bamach': JSON.stringify({ done: { title: t1 } }) }, rows: [{ id: 'bft', bamAch: JSON.stringify({ done: { title: t1 + 50, last: t2 } }) }] });
  ok('device and profile together, each achievement once, at its first time', M.bamAchPaid(rec()), [{ t: t1, v: 25 }, { t: t2, v: 40 }]);
  ok('in your balance', M.bamAchBucks(), 65);
  ok("another manager's bank holds what their profile carries", M.bucksFor({ ach: M.bamAchPaid(M.bamAchOf({ bamAch: JSON.stringify({ done: { allwin: t2 } }) })) }, () => M.bamAchBucks()), 750);
  ok('nobody else\'s profile counts toward yours', (M.set({ rows: [{ id: 'mm', bamAch: JSON.stringify({ done: { allwin: t2 } }) }] }), M.bamAchBucks()), 25);
  const src = fs.readFileSync(appUrl, 'utf8').replace(/\r\n/g, '\n');
  const fn = name => { const a = src.indexOf(name); return a < 0 ? '' : src.slice(a, src.indexOf('\n}\n', a) + 2); };
  ok('the balance adds it, a replay counts only what was earned by then, and the plant\'s fee sees it',
    [fn('function bucksBalance(').includes('+eggBucks()+bam+ach-inv-idle-plant'), fn('function bucksBaseAt(').includes('const ach=bkAch().filter(x=>Number(x.t)<=t);'),
      fn('function bucksBaseAt(').includes('bamTimes:bam,ach,lots'), fn('function plantFeeKey(').includes("ach.map(x=>x.t+':'+x.v).join(',')")], [true, true, true, true]);
  ok('every scope carries it', [fn('function plantForScope(').includes('ach:bkAch()'), fn('function bucksFor(').includes('ach:(scope&&scope.ach)||[]')], [true, true]);
  ok('and the Leaderboards: off the profile for everyone, off your own record for you',
    [fn('function ldBucks(').includes('achSt=bamAchMerge(achSt,bamAchOf(p));'), fn('function ldBucks(').includes('achSt=bamAchMine();'),
      fn('function ldBucks(').includes('bucksFor({bets,eggs,eggTimes,bamTimes,ach,lots,plant}')], [true, true, true]);
}

console.log(NL + 'one read, one write');
fresh();
{
  M.log.prof = { bamAch: JSON.stringify({ n: 40, land: [7], done: { seth: NOW - 9e6 } }) };
  await play({ team: 3, place: 4, w: 8, l: 6, seed: 4, scores: games(8, 6) });
  const wrote = M.log.writes.length ? JSON.parse(M.log.writes[0].bamAch) : null;
  ok('a season reads the profile once and writes once, only bamAch', [M.log.reads, M.log.writes.length, Object.keys(M.log.writes[0] || {})], [1, 1, ['bamAch']]);
  ok('folding in what another device earned rather than writing over it', [wrote && wrote.n, wrote && wrote.land, wrote && Object.keys(wrote.done)], [40, [7], ['seth']]);
  ok('and the device keeps the folded record', JSON.parse(M.log.prof.bamAch).n === rec().n, true);
  M.log.writes = []; M.log.reads = 0;
  await M.bamAchSave();
  ok('nothing new, nothing written', [M.log.reads, M.log.writes.length], [1, 0]);
  M.log.readFails = true; M.bamAchLand(9);
  await M.bamAchSave();
  ok('a read that fails writes nothing', M.log.writes.length, 0);
}

console.log(NL + 'the trophy and the pop-up');
fresh();
{
  M.set({ ls: { 'bft:bamach': JSON.stringify({ n: 3, land: [1, 2, 3, 4, 5, 6], use: { 10: 511, 3: 7 }, done: { title: NOW - 5000, last: NOW - 60000 } }),
    'bft:bamachseen': String(NOW - 10000) } });
  ok('the trophy counts what is new since the last look', [M.bamAchNewCount(rec()), M.bamTrophyHTML().includes('class="bam-trophy-n">[1]')], [1, true]);
  M.set({ ls: { ...JSON.parse(JSON.stringify({})), 'bft:bamach': JSON.stringify({ n: 3, land: [1, 2, 3, 4, 5, 6], use: { 10: 511, 3: 7 }, done: { title: NOW - 5000, last: NOW - 60000 } }),
    'bft:bamachseen': String(NOW) } });
  ok('and nothing once it has been opened', M.bamTrophyHTML().includes('bam-trophy-n'), false);
  M.set({ since: NOW - 10000 });
  const pop = M.bamAchHTML();
  ok('a row for each, and the totals', [(pop.match(/class="bam-ach[ "]/g) || []).length, pop.includes('[2 of 30]'), pop.includes('[$65 of $6670]')], [30, true, true]);
  ok('Complete every achievement counts the other twenty-nine', pop.includes('[2/29]'), true);
  ok('what is earned is done, and what is new since the last look is lit',
    [/class="bam-ach done new" id="bam-ach-title"/.test(pop), /class="bam-ach done" id="bam-ach-last"/.test(pop), /class="bam-ach" id="bam-ach-land"/.test(pop)], [true, true, true]);
  ok('each with its bar and how far along', [pop.includes('[6/12]'), pop.includes('width:50%'), pop.includes('[3/10]'), pop.includes('[$15]')], [true, true, true, true]);
  const every = M.bamAchRowHTML(M.BAM_ACH.find(a => a.id === 'every'), rec());
  ok('Use every attribute has its list of what is left, shut until asked', [every.includes('onclick="bamAchLeftToggle()"'), every.includes('class="bam-left"'), every.includes('[12/108]')], [true, false, true]);
  M.set({ left: true });
  const open = M.bamAchRowHTML(M.BAM_ACH.find(a => a.id === 'every'), rec());
  ok('opened, it lists only the grades not yet used: none of BFT\'s, six of GOOB\'s, nine of the rest',
    [open.includes('<av 10>'), (open.match(/<av 3>[\s\S]*?<\/span><\/div>/) || [''])[0].split('bam-left-c').length - 1, open.split('class="bam-left-r"').length - 1], [false, 6, 11]);
  const idx = fs.readFileSync(idxUrl, 'utf8').replace(/\r\n/g, '\n');
  ok('the pop-up: no tap on the backdrop closes it, only the X and Escape', [/id="bam-ach-overlay"[^>]*onclick/.test(idx), idx.includes('onclick="bamAchClose()"'),
    fs.readFileSync(appUrl, 'utf8').includes("function bamAchEsc(e){ if(e.key==='Escape') bamAchClose(); }")], [false, true, true]);
  ok('and nothing in it moves when pressed', [idx.includes('class="modal bam-rate-modal bam-ach-modal"'), idx.includes('.bam-rate-modal button:active{transform:none;}')], [true, true]);
  ok('the trophy is on the game for whoever is signed in', fs.readFileSync(appUrl, 'utf8').includes('<div class="bam-play">${_me?bamTrophyHTML():\'\'}${play}</div>'), true);
}

console.log(NL + `${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
