/* ONE TEAM'S MONEYLINE AND SPREAD ON ONE TICKET, TAKEN APART.
 *
 * A favourite's moneyline and its spread were allowed on the same parlay, and
 * paid the parlay multiplier for what is very nearly one outcome told twice:
 * a team that covers has won. The league ruled it out on 19 October, and the
 * slip now refuses it (sbConflict). This puts right every ticket already
 * placed that way:
 *
 *   - of the two legs, the one at the LONGER odds stays and the other goes
 *   - the ticket is re-priced on what is left -- one leg is a straight bet at
 *     that leg's price, more is a parlay at the product -- and the stake stays
 *   - a ticket already settled is graded again on its new legs, with the same
 *     betGrade the site and settle-bets.mjs use, lifted rather than copied:
 *     a parlay that lost only on the leg that came off can now win
 *   - void, declined and cashed-out tickets keep their status and their money;
 *     only the legs and the price are corrected on them
 *
 * Every original is written to a backup file before anything is touched, and
 * every corrected ticket carries an `mlspFix` field saying what it was.
 *
 *   node scripts/migrations/fix-mlsp-parlays.mjs            # dry run: report only
 *   node scripts/migrations/fix-mlsp-parlays.mjs --apply    # write the corrections
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
const BASE = 'https://gfl-dashboard.vercel.app/api/espn';
const APPLY = process.argv.includes('--apply');
const SEASON = String(process.argv.find(a => /^\d{4}$/.test(a)) || '2026');
const SRC = fs.readFileSync(new URL('../../public/app.js', import.meta.url), 'utf8').split(String.fromCharCode(13)).join('');
function grab(startsWith) {
  const i = SRC.indexOf(startsWith);
  if (i < 0) throw new Error('cannot find "' + startsWith + '" in app.js');
  let j = i, depth = 0, started = false;
  for (; j < SRC.length; j++) {
    const c = SRC[j];
    if (c === '{') { depth++; started = true; }
    else if (c === '}') { depth--; if (started && depth === 0) { j++; break; } }
    else if (c === ';' && !started && depth === 0) { j++; break; }
  }
  return SRC.slice(i, j);
}
const parts = ['const bucks2=', 'const GFL_DB=', 'const fsOut=', 'const fsIn=', 'const betDocRow=',
  'const REGULAR_SEASON_END=', 'function regEndOf(season){', 'const weekDecided=', 'const weekScored=',
  'function weeksOf(schedule){', 'function weekOver(byWeek,w){', 'function betLegWeek(',
  'function betWeekResult(leg,season,wk){', 'function betLegResult(leg,season){',
  'function sbFinalsStamp(meta){', 'function sbFinals(season){', 'function betGrade(bet){',
  'function amFromProb(p){', 'function amToDec(o){', 'function mlspClash('].map(grab);
const api = new Function(`
let _seasonMeta={}, _lineups={}, _finalsCache={};
const loadLineups=()=>{};
${parts.join('\n')}
return { setData(meta,lineups){ _seasonMeta=meta; _lineups=lineups; _finalsCache={}; },
  betGrade, betDocRow, fsOut, GFL_DB, amFromProb, amToDec, bucks2, mlspClash };`)();

const get = async q => {
  for (let a = 0; a < 3; a++) {
    try { const r = await fetch(`${BASE}?${q}`); if (r.ok) return await r.json(); }
    catch {}
    await new Promise(s => setTimeout(s, 1500));
  }
  return null;
};
function seasonMeta(d) {
  const owners = {}, teams = {}, divisions = {};
  (d.settings?.scheduleSettings?.divisions || []).forEach(dv => { divisions[dv.id] = dv.name; });
  (d.teams || []).forEach(t => {
    owners[t.id] = t.primaryOwner || (t.owners && t.owners[0]) || `team:${t.id}`;
    teams[t.id] = { rank: t.rankCalculatedFinal || 0, div: t.divisionId ?? 0, seed: t.playoffSeed || 0 };
  });
  return { owners, teams, divisions, schedule: d.schedule || [],
    regEnd: d.settings?.scheduleSettings?.matchupPeriodCount || 14,
    playoffTeamCount: d.settings?.scheduleSettings?.playoffTeamCount || 6 };
}
const KEY = () => `key=${api.GFL_DB.key}`;
const DOCS = () => `https://firestore.googleapis.com/v1/projects/${api.GFL_DB.project}/databases/(default)/documents`;

const raw = await get(`view=mMatchup&view=mTeam&view=mSettings&seasonId=${SEASON}`);
if (!raw || !raw.teams) { console.error('could not load the season'); process.exit(1); }
const lineups = await get(`type=lineups&seasonId=${SEASON}&v=1`);
api.setData({ [SEASON]: seasonMeta(raw) }, lineups && lineups.weeks ? { [SEASON]: lineups } : {});
const abOf = {}; (raw.teams || []).forEach(t => { abOf[t.primaryOwner || (t.owners || [])[0]] = t.abbrev; abOf[t.id] = t.abbrev; });

const r = await fetch(`${DOCS()}:runQuery?${KEY()}`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'bets' }],
    where: { fieldFilter: { field: { fieldPath: 'season' }, op: 'EQUAL', value: { stringValue: SEASON } } } } }) });
if (!r.ok) { console.error('bets query failed', r.status, await r.text()); process.exit(1); }
const docs = (await r.json()).filter(x => x && x.document);
console.log(`${docs.length} bets in ${SEASON}${APPLY ? '' : '  (DRY RUN -- nothing is written)'}`);

const fixes = [];
docs.forEach(x => {
  const bet = api.betDocRow(x.document);
  if (bet.pvp || (bet.legs || []).length < 2) return;
  const drop = api.mlspClash(bet.legs);
  if (!drop.length) return;
  const legs = bet.legs.filter(l => !drop.includes(l));
  const dec = legs.reduce((a, l) => a * api.amToDec(Number(l.odds)), 1);
  const odds = legs.length > 1 ? api.amFromProb(1 / dec) : Number(legs[0].odds);
  const payout = api.bucks2(bet.stake * dec);
  let status = bet.status, ret = bet.ret, settledTs = bet.settledTs;
  if (['won', 'lost', 'push'].includes(bet.status)) {
    const g = api.betGrade({ ...bet, legs, odds, payout });
    if (g) { status = g.status; ret = g.ret; }
    else { status = 'open'; ret = 0; settledTs = 0; }       // a leg still to play
    if (status !== bet.status || ret !== bet.ret) settledTs = settledTs ? Date.now() : 0;
  }
  fixes.push({ bet, drop, legs, odds, payout, status, ret, settledTs, doc: x.document });
});

const money = v => '$' + Number(v || 0).toFixed(2);
fixes.forEach(f => {
  const b = f.bet;
  console.log(`\n${b.id}  ${abOf[b.owner] || b.owner}  wk ${b.wk}  stake ${money(b.stake)}  ${b.status}${b.srcBet ? '  (seat on ' + b.srcBet + ')' : ''}`);
  console.log(`  was ${b.legs.length} legs at ${b.odds > 0 ? '+' : ''}${b.odds}, pays ${money(b.payout)}, returned ${money(b.ret)}`);
  f.drop.forEach(l => console.log(`  - drops  ${l.pickLabel}  (${l.odds > 0 ? '+' : ''}${l.odds})`));
  console.log(`  now ${f.legs.length} leg${f.legs.length > 1 ? 's' : ''} at ${f.odds > 0 ? '+' : ''}${f.odds}, pays ${money(f.payout)}; ${f.status}, returns ${money(f.ret)}`
    + `  [balance ${f.ret - b.ret >= 0 ? '+' : ''}${money(f.ret - b.ret)}]`);
});
const delta = fixes.reduce((n, f) => n + (f.ret - f.bet.ret), 0);
console.log(`\n${fixes.length} ticket(s) to correct; net change to balances ${money(delta)}`);

if (!APPLY || !fixes.length) process.exit(0);
/* outside the repo: it is public, and these are the league's tickets */
const dir = process.env.GFL_BACKUP_DIR || path.join(os.homedir(), 'Documents', 'gfl-backups');
fs.mkdirSync(dir, { recursive: true });
const backup = path.join(dir, `mlsp-backup-${SEASON}-${Date.now()}.json`);
fs.writeFileSync(backup, JSON.stringify(fixes.map(f => f.doc), null, 1));
console.log(`backup of the originals: ${backup}`);
for (const f of fixes) {
  const b = f.bet;
  const fields = { legs: JSON.stringify(f.legs), odds: String(f.odds), payout: String(f.payout),
    status: f.status, ret: String(f.ret), settledTs: String(f.settledTs || 0),
    mlspFix: JSON.stringify({ at: Date.now(), dropped: f.drop, was: { odds: b.odds, payout: b.payout, status: b.status, ret: b.ret, legs: b.legs.length } }) };
  const mask = Object.keys(fields).map(k => `updateMask.fieldPaths=${k}`).join('&');
  const w = await fetch(`${DOCS()}/bets/${encodeURIComponent(b.id)}?${KEY()}&${mask}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(api.fsOut(fields)) });
  console.log(`${w.ok ? 'written' : 'FAILED ' + w.status}  ${b.id}`);
}
