/* WHAT THE LINEUP LIST UNDER YOUR FORECAST SAYS EACH PLAYER IS WORTH.
 *
 * It used to say one thing all week: ESPN's published projection, which never
 * moves. The curve above it stopped believing that number on Tuesday, so the
 * graph could show a receiver running away with the night while the list
 * underneath still had him down for his pre-game figure.
 *
 * Three states now, one per player, because a fantasy week runs across four
 * days and the man in the next row can be in any of them:
 *
 *   PRE    not kicked off  -> ESPN's projection, untouched
 *   LIVE   game on         -> banked + livePlayerLeft, the curve's own maths
 *   FINAL  game over       -> what he actually scored
 *
 * The real livePlayerLeft and liveProProgress are lifted here, not stubbed, so
 * this fails if the projection model changes underneath it.
 *
 * Run: node scripts/test-fclive.mjs
 */
import { lifter, assemble } from './lib/lift.mjs';

const grab = lifter(new URL('../public/app.js', import.meta.url));

const PRELUDE = [
  'let _me={teamId:7};',
  'let _nflGames=null;',
  'const setMe=v=>{_me=v;};',
  'const setGames=v=>{_nflGames=v;};',
].join(String.fromCharCode(10));

const M = assemble(grab, [
  'const BENCH_SLOTS=', 'const NFL_TEAMS=', 'const LIVE_VOLUME=', 'const LIVE_USAGE_R=',
  'const LIVE_EFF_R=', 'const LIVE_EFF_SKIP=', 'const liveEffW=', 'const liveUsageW=',
  'const liveProProgress=', 'function liveScoreLine(line,rules){',
  'function livePlayerLeft(entry,f,rules){', 'function fcLivePlayers(info){',
], ['fcLivePlayers', 'livePlayerLeft', 'setMe', 'setGames'], PRELUDE);

let pass = 0, fail = 0;
const ok = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; return; }
  fail++;
  console.log('  FAIL  ' + name + '\n          got  ' + g + '\n          want ' + w);
};
const near = (name, got, want, tol) => {
  if (got != null && Math.abs(got - want) <= (tol || 0.05)) { pass++; return; }
  fail++;
  console.log('  FAIL  ' + name + '\n          got  ' + got + '\n          want ~' + want);
};
const head = t => console.log('\n' + t);

/* the league's real scoring, the bits these lines touch */
const RULES = { 3: 0.04, 4: 4, 20: -2, 24: 0.1, 25: 6, 42: 0.1, 43: 6, 53: 1 };

/* SF is 25, LAR is 14, NO is 18 */
const player = (id, name, proTeamId, slot, projLine, projTotal, actLine, actTotal) => ({
  playerId: id, lineupSlotId: slot,
  playerPoolEntry: {
    appliedStatTotal: actTotal,
    player: { id, fullName: name, proTeamId,
      stats: [
        { statSourceId: 1, statSplitTypeId: 1, appliedTotal: projTotal, stats: projLine },
        { statSourceId: 0, statSplitTypeId: 1, appliedTotal: actTotal, stats: actLine },
      ] },
  },
});

/* a receiver on 6.5 projected targets for 10.65 points */
const EVANS_PROJ = { 58: 6.5, 53: 3.5, 42: 54.2, 43: 0.3 };
const evans = (actLine, actTotal) =>
  player(1001, 'Mike Evans', 25, 4, EVANS_PROJ, 10.65, actLine, actTotal);
/* a back on 14.7 carries for 18.39 */
const CMC_PROJ = { 23: 14.7, 24: 57.2, 25: 0.4, 58: 6.2, 53: 4.8, 42: 38.6, 43: 0.2 };
const cmc = (actLine, actTotal) =>
  player(1002, 'Christian McCaffrey', 25, 2, CMC_PROJ, 18.39, actLine, actTotal);
/* a receiver whose team plays Sunday */
const olave = () => player(1003, 'Chris Olave', 18, 4, { 58: 9.1, 53: 5.6, 42: 72.2, 43: 0.3 }, 14.78, {}, 0);
/* and a bench player, who must never appear */
const bench = () => player(1099, 'Bench Guy', 25, 20, { 58: 5 }, 9.9, {}, 0);

const info = (starters, opp) => ({
  meta: { scoring: RULES },
  games: [{
    home: { teamId: 7, rosterForCurrentScoringPeriod: { entries: starters } },
    away: { teamId: 8, rosterForCurrentScoringPeriod: { entries: opp || [olave()] } },
  }],
});
const board = games => ({ games });
const PRE = board([{ ht: 'SF', at: 'LAR', s: 'pre', p: 0, c: '0:00' },
  { ht: 'NO', at: 'DET', s: 'pre', p: 0, c: '0:00' }]);
const HALF = board([{ ht: 'SF', at: 'LAR', s: 'in', p: 2, c: '0:00' },
  { ht: 'NO', at: 'DET', s: 'pre', p: 0, c: '0:00' }]);
const DONE = board([{ ht: 'SF', at: 'LAR', s: 'post', p: 4, c: '0:00' },
  { ht: 'NO', at: 'DET', s: 'pre', p: 0, c: '0:00' }]);

/* ── nothing to say ───────────────────────────────────────────────────────── */
head('when there is nothing live to say, it says nothing');
M.setGames(null);
ok('no scoreboard digest: null, and the list falls back to projections',
  M.fcLivePlayers(info([evans({}, 0)])), null);
M.setGames(PRE);
M.setMe(null);
ok('nobody signed in: null', M.fcLivePlayers(info([evans({}, 0)])), null);
M.setMe({ teamId: 7 });
ok('no matchup for this team: null',
  M.fcLivePlayers({ meta: { scoring: RULES }, games: [
    { home: { teamId: 3 }, away: { teamId: 4 } }] }), null);

/* ── before kickoff ───────────────────────────────────────────────────────── */
head('before kickoff — the published projection, untouched');
M.setGames(PRE);
let r = M.fcLivePlayers(info([evans({}, 0), cmc({}, 0), olave(), bench()]));
ok('everyone reads pre', Object.keys(r).map(k => r[k].state), ['pre', 'pre', 'pre']);
ok('Evans is his projection', r['1001'].now, 10.65);
ok('McCaffrey is his projection', r['1002'].now, 18.39);
ok('the bench is not in the list', r['1099'], undefined);

/* ── the game is over ─────────────────────────────────────────────────────── */
head('game over — the score, and it cannot move');
M.setGames(DONE);
r = M.fcLivePlayers(info([evans({ 58: 5, 53: 2, 42: 74, 43: 1 }, 15.4), cmc({ 23: 16, 24: 57 }, 10.5), olave()]));
ok('Evans is final', r['1001'].state, 'final');
ok('and reads what he actually scored', r['1001'].now, 15.4);
ok('McCaffrey too', [r['1002'].state, r['1002'].now], ['final', 10.5]);
ok('the man playing Sunday is still pre', [r['1003'].state, r['1003'].now], ['pre', 14.78]);

/* ── the game is on ───────────────────────────────────────────────────────── */
head('game on — banked plus what the model says is left');
M.setGames(HALF);
/* One target, one long touchdown -- the case the usage model exists to refuse.
   One target in a whole half is BELOW his 6.5 pace, so the model does not just
   decline to extrapolate the touchdown, it cuts what is left of his game. */
r = M.fcLivePlayers(info([evans({ 58: 1, 53: 1, 42: 68, 43: 1 }, 13.8)]));
ok('he reads live', r['1001'].state, 'live');
const bomb = r['1001'].now;
near('13.8 on one target reads near 17, not near 27', bomb, 17.1, 0.6);
ok('a points model doubling him would say 27.6', (13.8 * 2).toFixed(1), '27.6');
ok('the flat model would say 19.1', (13.8 + 10.65 * 0.5).toFixed(1), '19.1');
ok('the usage model is under both, because one target is below pace',
  bomb < 13.8 + 10.65 * 0.5, true);

/* nine targets, no score: the mirror case */
r = M.fcLivePlayers(info([evans({ 58: 9, 53: 6, 42: 71 }, 13.1)]));
const vol = r['1001'].now;
near('nine targets and 13.1 points reads near 25', vol, 24.8, 0.8);
ok('the volume night is worth MORE than the bomb night, on fewer points',
  vol > bomb, true);
ok('a flat projection could not tell them apart',
  Math.abs((13.8 + 10.65 * 0.5) - (13.1 + 10.65 * 0.5)).toFixed(1), '0.7');

head('a live number is banked plus livePlayerLeft, exactly');
const line = { 23: 8, 24: 42, 58: 4, 53: 3, 42: 22 };
const entry = cmc(line, 9.4);
r = M.fcLivePlayers(info([entry]));
const left = M.livePlayerLeft(entry, 0.5, RULES);
ok('the two agree', r['1002'].now, Math.round((9.4 + left) * 10) / 10);
ok('and it is rounded to one place', String(r['1002'].now).split('.').pop().length <= 1, true);

head('a player whose team is not on the board is left alone');
r = M.fcLivePlayers(info([player(1004, 'Bye Guy', 9, 4, { 58: 7 }, 12.0, {}, 0)]));
ok('bye week reads pre at his projection', [r['1004'].state, r['1004'].now], ['pre', 12.0]);

head('both sides of the matchup are read');
M.setGames(HALF);
r = M.fcLivePlayers(info([evans({ 58: 4, 53: 3, 42: 30 }, 6.0)], [cmc({ 23: 9, 24: 50 }, 5.0)]));
ok('mine and theirs', Object.keys(r).sort(), ['1001', '1002']);
ok('both live', [r['1001'].state, r['1002'].state], ['live', 'live']);

console.log('\n' + (fail ? 'FAILED  ' : 'ok  ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
