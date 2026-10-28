/* EVERY NAME-KEYED ARCHIVE ENTRY STAMPED WITH THE OWNER IT BELONGED TO.
 *
 * awards.json and cm-official.json record teams by the NAME they had -- and a
 * name is not an identity. When Team silly willy became Will's Wife Beaters the
 * award matcher fell back to "any shared word longer than three letters", found
 * "team" in The Bryan Football Team, and handed BFT the Willies' 2023 Most
 * Disappointing Team and 2024 Punishment Performance.
 *
 * So each entry carries its owner (the ESPN member id, which no rename touches),
 * resolved here once and checked by eye rather than guessed at render time:
 *
 *   1. exact name in THAT season's own team list
 *   2. exact name in any season's list, when only one owner ever carried it
 *      (an award written later under the team's newer name)
 *   3. a season name that is the entry plus a parenthetical -- "SKOL" for
 *      "SKOL (Formerly Gabe Davis)" -- when exactly one fits
 *
 * Anything else stops the script. Re-run it after adding an award or a season
 * of official scores; entries already stamped are left alone.
 *
 *   node scripts/migrations/stamp-owners.mjs            # report
 *   node scripts/migrations/stamp-owners.mjs --write    # write the stamps
 */
import fs from 'fs';
const WRITE = process.argv.includes('--write');
const D = new URL('../../public/data/', import.meta.url);
const read = f => JSON.parse(fs.readFileSync(new URL(f, D), 'utf8'));
const strip = s => String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
const SEASONS = fs.readdirSync(D).map(f => /^season-(\d{4})\.json$/.exec(f)).filter(Boolean).map(m => m[1]).sort();
const NAMES = Object.fromEntries(SEASONS.map(y => [y, (read(`season-${y}.json`).teams || [])
  .map(t => ({ name: t.name, owner: t.primaryOwner || (t.owners && t.owners[0]) || null })).filter(t => t.owner)]));

function resolve(season, name) {
  const n = strip(name); if (!n) return null;
  const inSeason = (NAMES[season] || []).filter(t => strip(t.name) === n);
  if (inSeason.length === 1) return { owner: inSeason[0].owner, how: `exact, ${season}` };
  const anywhere = new Map();
  Object.entries(NAMES).forEach(([y, ts]) => ts.forEach(t => { if (strip(t.name) === n) anywhere.set(t.owner, y); }));
  if (anywhere.size === 1) { const [[owner, y]] = [...anywhere]; return { owner, how: `exact, as named in ${y}` }; }
  const paren = (NAMES[season] || []).filter(t => strip(t.name).startsWith(n + ' ') && /\(/.test(t.name.slice(name.trim().length)));
  if (paren.length === 1) return { owner: paren[0].owner, how: `"${paren[0].name}", ${season}` };
  return null;
}

let unresolved = 0, stamped = 0;
const aw = read('awards.json');
Object.entries(aw.years || {}).forEach(([y, yr]) => Object.entries(yr).forEach(([k, list]) => (list || []).forEach(e => {
  if (e.owner) return;
  const r = resolve(y, e.team);
  if (!r) { unresolved++; console.log(`  !! awards ${y} ${k}: "${e.team}" matches no owner`); return; }
  e.owner = r.owner; stamped++;
  console.log(`  awards ${y} ${k.padEnd(11)} ${e.team.padEnd(26)} -> ${r.owner}  (${r.how})`);
})));
const cm = read('cm-official.json');
Object.keys(cm).filter(k => /^\d{4}$/.test(k)).forEach(y => {
  const owners = cm[y].owners || (cm[y].owners = {});
  Object.keys(cm[y].scores || {}).forEach(name => {
    if (owners[name] || (cm[y].scores[name] && cm[y].scores[name].owner)) return;
    const r = resolve(y, name);
    if (!r) { unresolved++; console.log(`  !! cm-official ${y}: "${name}" matches no owner`); return; }
    owners[name] = r.owner; stamped++;
    console.log(`  cm-official ${y} ${name.padEnd(28)} -> ${r.owner}  (${r.how})`);
  });
});

console.log(`\n  ${stamped} to stamp, ${unresolved} unresolved`);
if (unresolved) process.exitCode = 1;
else if (WRITE && stamped) {
  /* written into the files as they are laid out -- both are hand-aligned, and
     re-serialising them would bury forty stamps in a reformat */
  const edit = (file, fn) => {
    const url = new URL(file, D), txt = fs.readFileSync(url, 'utf8'), nl = txt.includes('\r\n') ? '\r\n' : '\n';
    let year = null;
    const out = txt.split(nl).map(line => { const y = /^\s*"(\d{4})": \{/.exec(line); if (y) year = y[1]; return fn(line, year); }).join(nl);
    fs.writeFileSync(url, out);
    return JSON.parse(out);
  };
  const award = {};
  Object.entries(aw.years).forEach(([y, yr]) => Object.values(yr).forEach(l => (l || []).forEach(e => { award[y + '|' + e.team] = e.owner; })));
  const back1 = edit('awards.json', (line, y) => line.replace(/\{ "team": "([^"]+)"(?![^}]*"owner")/g,
    (m, team) => award[y + '|' + team] ? `{ "team": "${team}", "owner": "${award[y + '|' + team]}"` : m));
  const back2 = edit('cm-official.json', (line, y) => {
    const m = /^(\s*"([^"]+)":\s*\{.*?)\}(,?)\s*$/.exec(line);
    if (!m || !y || !cm[y] || !cm[y].owners || !cm[y].owners[m[2]] || /"owner"/.test(line)) return line;
    return `${m[1]}, "owner": "${cm[y].owners[m[2]]}"}${m[3]}`;
  });
  /* read back: every entry carries the owner resolved above */
  let miss = 0;
  Object.entries(back1.years).forEach(([y, yr]) => Object.values(yr).forEach(l => (l || []).forEach(e => { if (e.owner !== award[y + '|' + e.team]) miss++; })));
  Object.keys(cm).filter(k => /^\d{4}$/.test(k)).forEach(y => Object.entries(back2[y].scores || {}).forEach(([n, v]) => { if (v.owner !== cm[y].owners[n]) miss++; }));
  console.log(miss ? `  !! ${miss} entries did not take their stamp` : '  written and read back: every entry stamped');
  if (miss) process.exitCode = 1;
}
