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
 *   THE OVERALL       the mean of the steps taken, rounded to one
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
  'function bamMean(', 'function bamOvr(', 'function bamPick(', 'function bamTake(', 'function bamValid(',
  'function bamAim(', 'function bamAt(', 'function bamCode(', 'function bamDecode(',
], ['BAM_ATTRS', 'BAM_RESPINS', 'BAM_TURNS', 'BAM_HUES', 'PG_SCALE', 'bamGrade', 'bamPool', 'bamFresh', 'bamOpen',
  'bamDone', 'bamMean', 'bamOvr', 'bamPick', 'bamTake', 'bamValid', 'bamAim', 'bamAt', 'bamCode', 'bamDecode', 'set'], [
  "let _CFG={}, _teams=[];",
  "const set=o=>{ if('cfg' in o) _CFG=o.cfg; if('teams' in o) _teams=o.teams; };",
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
];
ok('every grade he set is the grade on file', told.filter(([id, k, g]) => L(id, k) !== g).map(([id, k, g]) => `${id}.${k} ${L(id, k)}≠${g}`), []);
const luck = { [TING]: 'A', [KUNK]: 'A-', [BFT]: 'B', [SW]: 'B', [KW]: 'B', [GOOB]: 'C', [MCM]: 'C-', [FMAN]: 'D+', [BI]: 'D' };
ok('Luck runs A to D across everyone he did not set by hand', Object.entries(luck).filter(([id, g]) => L(id, 'luck') !== g).map(([id]) => id), []);
ok('and the spread really does reach both ends', [L(TING, 'luck'), L(BI, 'luck')], ['A', 'D']);

console.log(NL + 'nothing live');
const src = fs.readFileSync(appUrl, 'utf8');
const block = src.slice(src.indexOf('/* ── BUILD A MANAGER'), src.indexOf('/* ── TUESDAY: WHERE EVERYONE STANDS'));
ok('the game is in app.js', block.length > 1000, true);
ok('and reads no stat, only the table', ['bkIQFor', 'badBeatData', 'computeCoaching', 'pgComposite', '_draftAllCache',
  '_cmBreakdown', '_scores', '_cpRows', 'legacyTeamHistory'].filter(w => block.includes(w)), []);

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
ok('one A+ is an A+', M.PG_SCALE[M.bamOvr({ slots: { trade: MCM } })], 'A+');
ok('A+ and C meet at B+', M.PG_SCALE[M.bamOvr({ slots: { trade: MCM, coach: FMAN } })], 'B+');

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
  { slots: { trade: 2, bk: 10 }, land: 5, last: 5, respins: 0 });
ok('a trait that is not one throws it out', M.bamValid({ slots: { charisma: 2 } }, pool), M.bamFresh());
ok('so does a manager no longer in the pool', M.bamValid({ slots: { trade: 2 }, land: 44 }, pool), M.bamFresh());
ok('more respins than a build gets are not believed', M.bamValid({ slots: {}, respins: 5 }, pool).respins, M.BAM_RESPINS);
const full = Object.fromEntries(KEYS.map(k => [k, 1]));
ok('a full build is not still landed on anyone', M.bamValid({ slots: full, land: 3 }, pool).land, null);

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
  ok('and the overall of a shared build is the mean of its grades',
    M.PG_SCALE[M.bamMean(KEYS.map(k => back.grades[k]))], M.PG_SCALE[M.bamOvr(built)]);
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
ok('and leaving a shared build takes the link out of the address', /function bamOwn\(\)\{[\s\S]{0,200}searchParams\.delete\('bam'\)/.test(src), true);

console.log(NL + `${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
