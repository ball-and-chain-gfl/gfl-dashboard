/* A NAME IS NOT AN IDENTITY.
 *
 *   AWARDS        read by the owner stamped on each one, so no rename can move
 *                 one: the Willies' 2023 Most Disappointing Team and 2024
 *                 Punishment Performance went to BFT when Team silly willy became
 *                 Will's Wife Beaters, because "team" was a word they shared
 *   UNSTAMPED     matched exactly, to the season's own names or to the one owner
 *                 who ever carried the name -- otherwise unattributed, never a
 *                 guess
 *   OFFICIAL CM   the archived spreadsheet rows are read by owner too
 *   FORMER TEAMS  a team still in the league is never hidden by the list of
 *                 former members, whatever it renames itself to
 *   THE FILES     every award and every official row carries an owner who
 *                 really played that season -- so an entry added without one
 *                 fails here, not on the site
 *
 * Run: node scripts/test-names.mjs
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
const D = new URL('../public/data/', import.meta.url);
const read = f => JSON.parse(fs.readFileSync(new URL(f, D), 'utf8'));
const AWARDS = read('awards.json'), CM = read('cm-official.json');
const SEASONS = fs.readdirSync(D).map(f => /^season-(\d{4})\.json$/.exec(f)).filter(Boolean).map(m => m[1]).sort();
const META = Object.fromEntries(SEASONS.map(y => { const s = read(`season-${y}.json`); const names = {}, owners = {};
  (s.teams || []).forEach(t => { const o = t.primaryOwner || (t.owners && t.owners[0]); if (o) { names[o] = { name: t.name }; owners[t.id] = o; } });
  return [y, { names, owners }]; }));

const M = assemble(lifter(new URL('../public/app.js', import.meta.url)), [
  'function awardStrip(s){', 'function franchiseOf(owner){', 'function ownerByName(season,name){', 'function awardOwner(entry,season){',
  'function awardsForOwner(owner){', 'function normName(s){', 'function officialFor(team,entry){',
], ['awardOwner', 'awardsForOwner', 'officialFor', 'set'], `
let _franchises=[], _awardsData=null, _seasonMeta={}, _ownerMap={}, ALL_SEASONS=[];
const set=(k,v)=>{ if(k==='fr') _franchises=v; if(k==='aw') _awardsData=v; if(k==='meta') _seasonMeta=v; if(k==='om') _ownerMap=v; if(k==='seasons') ALL_SEASONS=v; };`);

const BFT = '{914E533C-0C16-48AC-A3E2-E51D83ED8802}';
const willies = Object.values(AWARDS.years['2024'].punishment)[0].owner;     // the real id, off the file
const owners = [...new Set(Object.values(META).flatMap(m => Object.keys(m.names)))];
M.set('meta', META); M.set('seasons', SEASONS); M.set('aw', AWARDS);

head('the bug, with the real files');
M.set('fr', owners.map(o => ({ owner: o, name: o === willies ? "Will's Wife Beaters" : (META['2025'].names[o] || {}).name || o })));
const bftAwards = M.awardsForOwner(BFT).map(a => a.year + ' ' + a.key);
ok('BFT keeps its own awards and nothing of the Willies\'', bftAwards.includes('2023 disappoint') || bftAwards.includes('2024 punishment'), false);
ok('the Willies keep 2023 Most Disappointing and 2024 Punishment under their new name',
  M.awardsForOwner(willies).map(a => a.year + ' ' + a.key).sort(), ['2023 disappoint', '2024 punishment']);

head('rename every team at once, to names built to trip a word match');
const tally = () => Object.fromEntries(owners.map(o => [o, M.awardsForOwner(o).map(a => a.year + ' ' + a.key).sort().join(',')]));
const before = tally();
M.set('fr', owners.map((o, i) => ({ owner: o, name: `Team Football Bryan Willy Florida ${i}` })));
ok('every award stays with the same owner', tally(), before);

head('an award without a stamp');
M.set('fr', owners.map(o => ({ owner: o, name: (META['2025'].names[o] || {}).name || o })));
ok('the exact name of that season finds its owner', (M.awardOwner({ team: 'Team silly willy' }, '2023') || {}).owner, willies);
ok('a name only one owner ever carried finds them in any season', (M.awardOwner({ team: 'Tuckasegee Tinglers' }, '2023') || {}).owner,
  (M.awardOwner({ team: 'Tuckasegee Tinglers' }, '2025') || {}).owner);
ok('a name nobody carried is nobody\'s -- not whoever shares a word', M.awardOwner({ team: 'The Team Willy Bryan Florida' }, '2024'), null);

head('the official spreadsheet');
M.set('om', { 7: willies });
ok('read by owner, whatever the team is called now', M.officialFor({ id: 7, name: "Will's Wife Beaters" }, CM['2025']), CM['2025'].scores['Team silly willy']);
ok('an unstamped row only by its exact name', M.officialFor({ id: 99, name: 'Team' }, { scores: { 'Team silly willy': { final: 1 } } }), null);

head('the files');
const missing = [];
Object.entries(AWARDS.years).forEach(([y, yr]) => Object.entries(yr).forEach(([k, l]) => (l || []).forEach(e => {
  if (!e.owner || !Object.values(META).some(m => m.names[e.owner])) missing.push(`awards ${y} ${k} ${e.team}`); })));
Object.keys(CM).filter(k => /^\d{4}$/.test(k)).forEach(y => Object.entries(CM[y].scores || {}).forEach(([n, v]) => {
  if (!v.owner || !(META[y] || { names: {} }).names[v.owner]) missing.push(`cm-official ${y} ${n}`); }));
ok('every award and every official row is stamped with an owner who played (run scripts/migrations/stamp-owners.mjs --write)', missing, []);

head('former members');
const APP = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
ok('a team in the league now is never hidden by the excluded-names list',
  APP.includes('_franchises=_franchises.filter(fr=>active.has(fr.owner)||!excl.some(q=>fr.name.toLowerCase().includes(q)));'), true);
ok('and nothing matches an award by a shared word any more', /nw\.some\(w=>fn\.includes\(w\)\)/.test(APP), false);

console.log(NL + (fail ? 'FAILED  ' : 'ok  ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
