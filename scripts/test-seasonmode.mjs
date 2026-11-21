/* SEASON MODE: ONE ACCOUNT, ONE TAB, ONE PAGE THAT CARRIES EVERYTHING IT NEEDS.
 *
 *   ONLY BFT                 seasonAllowed() is true for bft and for nobody else,
 *                            signed out included; the nav button starts hidden
 *   NOBODY ELSE GETS IN      switchTab('season') sends anyone else home, and
 *                            seasonGate() hides the button and empties the page
 *   WHERE IT SITS            right after Build a Manager, so the menu's two
 *                            columns put it under Hot Takes; its colour is the
 *                            same in TAB_COLORS and the three accent rules
 *   THE GAME PAGE            public/season/index.html checks the same sign-in,
 *                            and every file it loads is there
 *
 * Run: node scripts/test-seasonmode.mjs
 */
import fs from 'node:fs';
import vm from 'node:vm';
import { lifter } from './lib/lift.mjs';

const NL = String.fromCharCode(10);
let pass = 0, fail = 0;
const ok = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; console.log('  PASS  ' + name); return; }
  fail++;
  console.log('  FAIL  ' + name + NL + '          got  ' + g + NL + '          want ' + w);
};
const appUrl = new URL('../public/app.js', import.meta.url);
const src = fs.readFileSync(appUrl, 'utf8'), idx = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const grab = lifter(appUrl);

/* a stub page: one nav button, the page body, and switchTab recording where it was sent */
const mk = (me, active) => {
  const btn = { style: { display: 'none' } }, body = { innerHTML: '<iframe>' }, sent = [];
  const ctx = vm.createContext({ _me: me, _activeTab: active || 'home', sent,
    document: { querySelector: s => s === '.tab-btn[data-tab=season]' ? btn : null, getElementById: id => id === 'season-body' ? body : null },
    switchTab: n => sent.push(n) });
  vm.runInContext([grab('function seasonAllowed(){'), grab('function seasonGate(){'),
    'this.seasonAllowed=seasonAllowed;this.seasonGate=seasonGate;'].join(NL), ctx);
  return { ctx, btn, body, sent };
};

console.log('every manager with a team (open to the league 11-20)');
ok('bft is let in', mk({ k1: 'bft', teamId: '10' }).ctx.seasonAllowed(), true);
ok('Marathon Men (team 1) are let in', mk({ k1: 'mm', teamId: '1' }).ctx.seasonAllowed(), true);
ok('their team id as a number too', mk({ k1: 'mm', teamId: 1 }).ctx.seasonAllowed(), true);
ok('another manager is too', mk({ k1: 'kunk', teamId: '7' }).ctx.seasonAllowed(), true);
ok('an account with no team is not', mk({ k1: 'test' }).ctx.seasonAllowed(), false);
ok('signed out is not', mk(null).ctx.seasonAllowed(), false);
ok('the button starts hidden in the page', /<button class="tab-btn" data-tab="season"[^>]*style="display:none"/.test(idx), true);

console.log(NL + 'nobody without a team gets in');
{ const s = mk({ k1: 'kunk', teamId: '7' }); s.ctx.seasonGate(); ok('a manager sees the button', s.btn.style.display, ''); }
{ const s = mk({ k1: 'test' }); s.ctx.seasonGate(); ok('no team: no button', s.btn.style.display, 'none'); ok('and the page is emptied', s.body.innerHTML, ''); }
{ const s = mk(null, 'season'); s.ctx.seasonGate(); ok('signing out while on it goes home', s.sent, ['home']); }
ok('switchTab turns everyone else away before anything renders',
  /function switchTab\(name\)\{\s*if\(name==='season'&&!seasonAllowed\(\)\) name='home';/.test(src), true);
ok('switchTab renders it', /if\(name==='season'\) renderSeason\(\);/.test(src), true);
ok('every sign-in and sign-out passes the gate', /function applyMe\(\)\{\s*seasonGate\(\);/.test(src), true);

console.log(NL + 'where it sits');
ok('right after Build a Manager, so it lands under Hot Takes',
  /data-tab="bam"[^\n]*\n[^\n]*\n\s*<button class="tab-btn" data-tab="season"/.test(idx), true);
ok('the tab is named', /TAB_LABELS=\{[^}]*season:'GFL Seasons'/.test(src), true);
const hex = (src.match(/TAB_COLORS=\{[^}]*season:'(#[0-9A-Fa-f]{6})'/) || [])[1];
ok('one colour everywhere', [hex, idx.includes(`.tab-btn[data-tab=season]{--tc:${hex};}`), idx.includes(`html[data-tabaccent=season]{--h1a:${hex};`),
  idx.includes(`[data-tabaccent=season]{--accent:${hex};`)], ['#5BC489', true, true, true]);
ok('it has a page to land on', /<div class="tab-page" id="page-season">/.test(src), true);

console.log(NL + 'the game page');
const page = fs.readFileSync(new URL('../public/season/index.html', import.meta.url), 'utf8');
ok('it checks the same sign-in itself (a team)', /localStorage\.getItem\('gfl-me'\)[\s\S]{0,300}const full=!!me&&!!me\.teamId/.test(page), true);
ok('and anyone without one gets nothing of a season', /QUICK_ONLY=!full;/.test(page), true);
const wanted = [...page.matchAll(/<script src="([^"/][^"]*)"/g)].map(m => m[1]).concat([...page.matchAll(/j\('([^']+\.json)'\)/g)].map(m => m[1]));
ok('it loads its five scripts (head to head is the fifth) and four data files', wanted.length, 9);
ok('every one of them is there', wanted.filter(f => !fs.existsSync(new URL('../public/season/' + f, import.meta.url))), []);
const teams = JSON.parse(fs.readFileSync(new URL('../public/season/teams.json', import.meta.url), 'utf8'));
ok('every crest it names is there', teams.filter(t => t.logo && !fs.existsSync(new URL('../public/season/' + t.logo, import.meta.url))).map(t => t.name), []);

console.log(NL + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
