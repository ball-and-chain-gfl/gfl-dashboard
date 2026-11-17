/* THE SPORTSBOOK'S MONEYLINE BOARD: ONE GAME IS ONE ROW OF TILES, AND NOTHING IN IT IS EVER CUT OFF.
 *
 *   THE WIDTH IS THE BOARD'S     a row is exactly as many characters as the
 *                                board has tiles, at every width it can be
 *   A PHONE                      FMAN -350  WGLR +260 on twenty tiles, and the
 *                                longest price there is still fits whole
 *   NO PRICE                     dashes; and once the game has a result, WON on
 *                                the side that took it
 *   A WIDE BOARD                 both prices and the game's state, none of them
 *                                run into each other
 *   WHAT EACH TILE IS            a team, a price, a result or quiet, so the look
 *                                can colour them
 *   THE SLOT                     sits above the sportsbook's own section, and is
 *                                not shown at all unless a look draws it
 *
 * Run: node scripts/test-flap.mjs
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
const grab = lifter(appUrl);
const ctx = vm.createContext({});
vm.runInContext(grab('function sbFlapLine(r,cols){') + NL + 'this.sbFlapLine=sbFlapLine;', ctx);
const line = (r, cols) => ctx.sbFlapLine(r, cols);
const game = (a, mlA, b, mlB, more) => Object.assign({ a, b, mlA, mlB, winA: null, st: 'OPEN' }, more || {});

console.log('the width is the board\'s');
const widths = []; for (let c = 20; c <= 46; c++) widths.push(c);
const samples = [game('FMAN', -350, 'WGLR', 260), game('Bi', -1900, 'KUNK', 1718, { st: 'LOCKED' }), game('SW', null, 'KW', null), game('TING', null, 'GOOB', null, { winA: false, st: 'FINAL' })];
ok('every row is exactly as wide as the board, 20 to 46 tiles', widths.filter(c => samples.some(r => line(r, c).s.length !== c || line(r, c).c.length !== c)), []);

console.log(NL + 'a phone');
ok('twenty tiles', line(game('FMAN', -350, 'WGLR', 260), 20).s, 'FMAN -350  WGLR +260');
ok('a short name keeps its place', line(game('Bi', 105, 'SW', -125), 20).s, 'BI   +105  SW   -125');
ok('the longest prices fit whole, beside four-letter names', line(game('WGLR', -1900, 'FMAN', 1718), 20).s, 'WGLR-1900  FMAN+1718');
ok('a name longer than four letters is cut, not the price', line(game('BISMUTH', -120, 'goobers', 100), 20).s, 'BISM -120  GOOB +100');

console.log(NL + 'no price');
ok('dashes on both sides', line(game('SW', null, 'KW', null), 20).s, 'SW     --  KW     --');
ok('the home side took it', line(game('SW', null, 'KW', null, { winA: true }), 20).s, 'SW    WON  KW     --');
ok('the away side took it', line(game('SW', null, 'KW', null, { winA: false }), 20).s, 'SW     --  KW    WON');
ok('a price is never replaced by a result', line(game('SW', -150, 'KW', 130, { winA: true }), 20).s, 'SW   -150  KW   +130');

console.log(NL + 'a wide board');
const order = (s, parts) => { let at = 0; for (const p of parts) { const i = s.indexOf(p, at); if (i < 0) return false; at = i + p.length; } return true; };
const wide = widths.filter(c => c >= 32);
ok('teams, prices and state all there, in order, at every wide width',
  wide.filter(c => !order(line(game('WGLR', -1900, 'FMAN', 1718, { st: 'LOCKED' }), c).s, ['WGLR', '-1900', 'FMAN', '+1718', 'LOCKED'])), []);
ok('and none of them touch', wide.filter(c => !/^ WGLR +-1900 +FMAN +\+1718 +LOCKED $/.test(line(game('WGLR', -1900, 'FMAN', 1718, { st: 'LOCKED' }), c).s)), []);
ok('a narrow board leaves the state out', /OPEN/.test(line(game('FMAN', -350, 'WGLR', 260), 31).s), false);

console.log(NL + 'what each tile is');
const L = line(game('FMAN', -350, 'WGLR', null, { winA: null }), 20);
ok('team tiles are plain', L.c.slice(0, 4), ['', '', '', '']);
ok('price tiles are prices', [...L.s].map((ch, i) => (ch === '-' || /\d/.test(ch)) && i < 10 ? L.c[i] : null).filter(x => x !== null), ['p', 'p', 'p', 'p']);
ok('dashes are quiet', L.c.slice(18), ['d', 'd']);
ok('a result is a result', line(game('SW', null, 'KW', null, { winA: true }), 20).c.slice(6, 9), ['w', 'w', 'w']);
ok('an empty tile is nothing', L.c[4], '');

console.log(NL + 'the slot');
const app = fs.readFileSync(appUrl, 'utf8'), idx = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const slot = app.indexOf('<div class="sb-flap-sec" id="sb-flap" hidden></div>'), page = app.indexOf('<div class="tab-page" id="page-book">'), body = app.indexOf('<div id="book-body"></div>');
ok('it is on the sportsbook page, above the sportsbook\'s own section', slot > page && slot < body && page > 0, true);
ok('index.html does not show it on its own', /\.sb-flap-sec\{display:none;\}/.test(idx), true);
ok('the sportsbook\'s render paints it', /renderBetsBar\(\);\s*sbFlapPaint\(\);/.test(app), true);
ok('and the working-out rides the batched repaint, not the render', /paintSoon\('flap',sbFlapFill\)/.test(app), true);

console.log(NL + (fail ? 'FAILED  ' : 'ok  ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
