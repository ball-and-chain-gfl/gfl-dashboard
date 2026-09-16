/* A TEAM CAN CHANGE ITS NAME WITHOUT LOSING ITS HISTORY.
 *
 * A profile document's id is a slug of the team's name — taken once, when the
 * account was made, and fixed ever since. Everything a manager has ever done is
 * filed under it: both coaches' poll ballots, every week of Ball Knowledge
 * answers and the scores sealed from them, weekly picks, eggs, investments,
 * trade votes, their sign-in key. Bets carry the same id as `owner`, trash talk
 * as tt_<id>.
 *
 * The read that loads profiles used to keep only documents whose id matched a
 * slug of a CURRENT team name. So renaming a team silently deleted it. Motor
 * City Mulligans became Dad shouldve Used Contraception, MCM became DSUC, and
 * profiles/mcm stopped being returned: every screen agreed that team had never
 * done anything, and they could not sign in to say otherwise, because the same
 * set gated that too.
 *
 * Nothing had been lost — one filter, keyed on a name somebody is entitled to
 * change, hid all of it. The link is teamId now.
 *
 * Run: node scripts/test-rename.mjs
 */
import { lifter, assemble } from './lib/lift.mjs';

const NL = String.fromCharCode(10);
const grab = lifter(new URL('../public/app.js', import.meta.url));

const M = assemble(grab, [
  'const keySlug=',
  'function teamInitials(name){',
  'const TEST_PROFILE=',
  'const teamAccountIds=',
  'function profilesForLeague(rows){',
  'function teamAcctId(t){',
  'function accountIds(){',
], ['profilesForLeague', 'teamAcctId', 'accountIds', 'teamAccountIds', 'setTeams', 'setProfRows'],
  ['let _teams=[], _profRows=null;',
   'const setTeams=t=>{_teams=t;};',
   'const setProfRows=r=>{_profRows=r;};'].join(NL));

let pass = 0, fail = 0;
const ok = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; return; }
  fail++;
  console.log('  FAIL  ' + name + NL + '          got  ' + g + NL + '          want ' + w);
};
const head = t => console.log(NL + t);

/* the league as it stands, with team 2 rebranded */
const TEAMS = [
  { id: 1, abbrev: 'MM', name: 'Marathon Men' },
  { id: 2, abbrev: 'DSUC', name: 'Dad shouldve Used Contraception' },
  { id: 3, abbrev: 'GOOB', name: 'Bikini Bottom Goobers' },
];
/* and the documents, filed under the names they were made with */
const MCM = { id: 'mcm', teamId: '2', k2: 'x', cp_2026: '[]', cp_2026_w2: '[]',
  bkt_2026_w1: '-1', bkt_2026_w2: '-3', pk_2026_w1: '{}', eggs: '3' };
const ROWS = [
  { id: 'mm', teamId: '1', k2: 'x' },
  MCM,
  { id: 'goob', teamId: '3', k2: 'x' },
];

M.setTeams(TEAMS);
M.setProfRows(ROWS);

head('the renamed team keeps its document');
const kept = M.profilesForLeague(ROWS);
ok('all three come back', kept.map(p => p.id).sort(), ['goob', 'mcm', 'mm']);
ok('and mcm still carries everything it had',
  Object.keys(kept.find(p => p.id === 'mcm')).sort(),
  Object.keys(MCM).sort());

head('the old id is what the franchise still answers to');
ok('team 2 resolves to its document, not to dsuc', M.teamAcctId(TEAMS[1]), 'mcm');
ok('which is what its bets and trash talk are filed under',
  M.teamAcctId(TEAMS[1]) === MCM.id, true);
ok('an unchanged team is unaffected', M.teamAcctId(TEAMS[0]), 'mm');

head('and they can still sign in');
ok('mcm is a league account', M.accountIds().has('mcm'), true);
ok('so is the slug of the new name, for whenever a document is made under it',
  M.accountIds().has('dsuc'), true);
ok('a name nobody holds is not', M.accountIds().has('nonsense'), false);

head('a team with no profile yet falls back to its slug');
M.setProfRows([]);
ok('nothing to resolve against', M.teamAcctId(TEAMS[1]), 'dsuc');
M.setProfRows(ROWS);

head('the junk this filter was written for is still dropped');
/* the leftovers from when sign-in minted a profile for any name: no teamId, and
   two of them pointed at Florida Man, who was voting twice because of it */
const JUNK = [{ id: 'bryan', k2: 'x' }, { id: 'flor1da', k2: 'x' }];
ok('a document belonging to no team goes',
  M.profilesForLeague(ROWS.concat(JUNK)).map(p => p.id).sort(),
  ['goob', 'mcm', 'mm']);

head('two documents for one team: the one with the history wins');
const EMPTY_NEW = { id: 'dsuc', teamId: '2', k2: 'x' };
const both = M.profilesForLeague(ROWS.concat([EMPTY_NEW]));
ok('one row for team 2', both.filter(p => String(p.teamId) === '2').length, 1);
ok('and it is the full one, not the empty newcomer',
  both.find(p => String(p.teamId) === '2').id, 'mcm');
/* the empty one is the row whose id the CURRENT name produces, so preferring
   the current slug here would have thrown the history away */

head('the testing profile is not a franchise and still survives');
const T = { id: 'test', k2: 'x' };
ok('kept on its own id', M.profilesForLeague(ROWS.concat([T])).map(p => p.id).includes('test'), true);

head('before the teams have loaded, nothing is thrown away');
M.setTeams([]);
ok('every row passes through', M.profilesForLeague(ROWS.concat(JUNK)).length, 5);

console.log(NL + (fail ? 'FAILED  ' : 'ok  ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
