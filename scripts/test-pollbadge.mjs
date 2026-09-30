/* THE COACHES' POLL RANKING, AS IT APPEARS NEXT TO A TEAM.
 *
 * Six places draw this badge — Your Forecast, the schedule, the sportsbook's
 * week board, every priced team row, the profile hero and the standings table —
 * and none of them owns the number. So the things worth holding still are the
 * ones that would otherwise drift apart between tabs:
 *
 *   THE GATE. The poll withholds its standings from anyone who has not voted,
 *   because seeing what the league thinks before you say what you think turns a
 *   late ballot into a ratification. A badge on every page would walk straight
 *   around that if it were not gated on the same test, so it is gated on
 *   literally the same function — cpMineIn, which renderCoachesPoll now calls
 *   too rather than keeping its own copy of the check.
 *
 *   WHICH WEEK THE NUMBER IS FROM. pollRankNow answers off pollWeeksData, which
 *   only admits a live week once EVERY ballot is in. That is right for the
 *   chart, which is a record, and a week stale for a badge, which is a
 *   scoreboard — so pollNowRanks takes the live week from the moment the
 *   homepage card would reveal it, and the newest week on file until then.
 *
 *   THAT IT IS THE POSITION AND NOT THE AVERAGE. 3, never 3.42.
 *
 * Run: node scripts/test-pollbadge.mjs
 */
import { lifter, assemble } from './lib/lift.mjs';

const NL = String.fromCharCode(10);

const M = assemble(lifter(new URL('../public/app.js', import.meta.url)),
  [
    'const cpWeek=',
    'const cpKeyFor=',
    'const cpKey=',
    'function cpTally(){',
    'function pollLiveWeekEntry(){',
    'function pollWeeksData(){',
    'const pollWeeks=',
    'function pollRankNow(){',
    'const CP_REVEAL_AT=',
    'function cpMineIn(){',
    'function pollNowRanks(){',
    'const pollTeamIdOf=',
    'function pollBadge(teamId,cls){',
    'const pollBadgeFor=',
    'const NT_BIG4_OWNER=',
    'const NT_BIG4_FROM=',
    'function ntBig4(out){',
    'let _pollAtCache=',
    'function pollRanksAt(w){',
    'function pollBadgeAt(teamId,w,cls){',
    'const pollBadgeAtFor=',
    'function pollSosRows(){',
    'const SOS_RAMP=',
    'function sosCol(v,lo,hi){',
    'function pollSosHTML(owner){',
    'let _wkScRank=',
    'function weekScoreRanks(week){',
  ],
  ['cpMineIn', 'pollNowRanks', 'pollBadge', 'pollBadgeFor', 'pollTeamIdOf',
   'cpTally', 'cpKey', 'ntBig4', 'CP_REVEAL_AT', 'NT_BIG4_OWNER', 'NT_BIG4_FROM',
   'pollRanksAt', 'pollBadgeAt', 'pollBadgeAtFor', 'pollSosRows', 'pollSosHTML',
   'weekScoreRanks', 'sosCol', 'SOS_RAMP',
   'setTeams', 'setRows', 'setMe', 'setPolls', 'setFranchises', 'setWeek', 'setTest',
   'setSeason'],
`
let _teams=[], _cpRows=[], _me=null, _polls=null, _franchises=[], _liveInfo=null, _test=false;
const setTeams=v=>{_teams=v;};
const setRows=v=>{_cpRows=v;};
const setMe=v=>{_me=v;};
const setPolls=v=>{_polls=v;};
const setFranchises=v=>{_franchises=v;};
const setWeek=v=>{_liveInfo={week:v};};
const setTest=v=>{_test=v;};
const isTestProfile=()=>_test;
const getSeason=()=>'2026';
/* the colour is the poll's own ramp and is not what this suite is about */
const pollRampColor=(r,n)=>'#R'+r+'of'+n;
const logoImg=(id,cls)=>'<img data-t="'+id+'" class="'+cls+'">';
const teamInitials=n=>String(n).slice(0,3).toUpperCase();
const ntToday=()=>1700000000000;
let _season=null;
const setSeason=v=>{_season=v;};
const schedSeason=()=>_season;
const sbAvatar=()=>'';
const sbTeamAb=(o,n)=>String(n).replace(/[^0-9]/g,'');
`);

let pass = 0, fail = 0;
const ok = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + NL + '         got  ' + g + NL + '         want ' + w); }
};
const head = t => console.log(NL + t);

/* ── the league ────────────────────────────────────────────────────────── */
const N = 12;
const TEAMS = [];
for (let i = 1; i <= N; i++) TEAMS.push({ id: i, abbrev: 'T' + i, name: 'Team ' + i });
const FR = TEAMS.map(t => ({ owner: t.id === 10 ? 'bft' : 'o' + t.id, teamId: t.id, name: t.name }));
/* the identity order: team 1 first, team 12 last */
const ORDER = TEAMS.map(t => String(t.id));
const rot = (a, n) => a.slice(n).concat(a.slice(0, n));

/* one profile row per manager, carrying a ballot for the week under test */
const rows = (n, week, ballotOf) => {
  const key = Number(week) <= 1 ? 'cp_2026' : 'cp_2026_w' + week;
  return FR.slice(0, n).map((f, i) => {
    const r = { id: f.owner, teamId: String(f.teamId) };
    r[key] = JSON.stringify(ballotOf ? ballotOf(i) : ORDER);
    return r;
  });
};
/* an archived week, in the shape public/data/polls-<season>.json holds */
const archive = (week, order) => ({ weeks: { [week]: { ballots: N,
  rank: order.map((id, i) => ({ rank: i + 1, teamId: Number(id), avg: i + 1 })) } } });

/* what a badge actually says, and whether it is the withheld one */
const txt = h => (h.match(/>([^<>]*)<\/span>$/) || [, ''])[1];
const withheld = h => h.indexOf('cp-bdg-q') >= 0;

const reset = () => {
  M.setTeams(TEAMS); M.setFranchises(FR); M.setRows([]);
  M.setMe(null); M.setPolls(null); M.setWeek(4); M.setTest(false);
};

/* ── 1 ─────────────────────────────────────────────────────────────────── */
head('1. THE GATE IS THE POLL\'S OWN GATE');
{
  reset();
  M.setRows(rows(N, 4));                       // the whole league has voted
  M.setPolls(archive(3, ORDER));

  ok('signed out sees a question mark', withheld(M.pollBadge(1)), true);
  ok('and no number leaks into it', txt(M.pollBadge(1)), '?');

  M.setMe({ k1: 'o1' });
  ok('signed in, ballot in, the rank shows', txt(M.pollBadge(1)), '1');

  /* the one that matters: a manager who has not voted this week */
  M.setRows(rows(N, 4).filter(r => r.id !== 'o1'));
  ok('eleven ballots in and yours is not', withheld(M.pollBadge(1)), true);
  ok('the other eleven are hidden from you too', withheld(M.pollBadge(7)), true);
  ok('including your own team', withheld(M.pollBadge(1)), true);

  /* a ballot for LAST week is not a ballot for this one */
  M.setRows(rows(N, 3));
  ok('last week\'s ballot does not unlock this week', withheld(M.pollBadge(1)), true);
}

/* ── 2 ─────────────────────────────────────────────────────────────────── */
head('2. cpMineIn IS THE TEST, AND IT IS ONE FUNCTION');
{
  reset();
  M.setMe({ k1: 'o1' });
  ok('no rows at all is not voted', M.cpMineIn(), false);
  M.setRows(rows(N, 4));
  ok('a full slate is voted', M.cpMineIn(), true);
  M.setRows([{ id: 'o1', teamId: '1' }]);
  ok('a row with no ballot field is not voted', M.cpMineIn(), false);
  M.setMe(null);
  M.setRows(rows(N, 4));
  ok('signed out is never voted', M.cpMineIn(), false);
  M.setMe({ k1: 'nobody' });
  ok('a manager with no row of their own is not voted', M.cpMineIn(), false);
}

/* ── 3 ─────────────────────────────────────────────────────────────────── */
head('3. WHICH WEEK THE NUMBER COMES FROM');
{
  /* week 3 on file has team 1 first; the live week 4 has it LAST */
  const flipped = rot(ORDER, 1).concat([ORDER[0]]).slice(0, N);
  reset();
  M.setMe({ k1: 'o1' });
  M.setPolls(archive(3, ORDER));

  /* six ballots — under the reveal, so the badge is still on last week */
  M.setRows(rows(6, 4, () => flipped));
  ok('six ballots is under the reveal', M.cpTally().ballots, 6);
  ok('so the badge still reads the archived week', txt(M.pollBadge(1)), '1');

  /* seven — the homepage card reveals here, and so does the badge */
  M.setRows(rows(7, 4, () => flipped));
  ok('seven ballots is the reveal', M.CP_REVEAL_AT(), 7);
  ok('and the live week takes over', txt(M.pollBadge(1)), String(N));
  ok('the team that moved up moved up', txt(M.pollBadge(2)), '1');

  /* the testing account sees a result earlier, exactly as the card does */
  M.setTest(true);
  M.setRows(rows(2, 4, () => flipped));
  ok('the test profile reveals at two', M.CP_REVEAL_AT(), 2);
  ok('and its badge follows the live week', txt(M.pollBadge(1)), String(N));
  M.setTest(false);
  ok('a real account at two ballots does not', txt(M.pollBadge(1)), '1');

  /* nothing anywhere: a season whose first poll has not closed */
  M.setPolls(null);
  M.setRows(rows(N, 4).map(r => Object.assign({}, r)));
  M.setRows([{ id: 'o1', teamId: '1', cp_2026_w4: JSON.stringify(ORDER) }]);
  ok('voted, but no poll has a result yet', withheld(M.pollBadge(1)), true);
  ok('which is the same question mark, not a blank', txt(M.pollBadge(1)), '?');
}

/* ── 4 ─────────────────────────────────────────────────────────────────── */
head('4. THE POSITION, NOT THE AVERAGE');
{
  reset();
  M.setMe({ k1: 'o1' });
  /* seven ballots that disagree, so every average lands on a fraction */
  M.setRows(rows(7, 4, i => rot(ORDER, i)));
  const t = M.cpTally();
  ok('the averages really are fractional',
     t.rank.some(r => Math.abs(r.avg - Math.round(r.avg)) > 1e-9), true);
  const badges = TEAMS.map(x => txt(M.pollBadge(x.id))).sort((a, b) => a - b);
  ok('twelve whole numbers, one to twelve', badges,
     TEAMS.map((_, i) => String(i + 1)));
  ok('and not one of them carries a decimal point',
     badges.every(v => v.indexOf('.') < 0), true);
}

/* ── 5 ─────────────────────────────────────────────────────────────────── */
head('5. EVERY PLACE ASKS THE SAME QUESTION');
{
  reset();
  M.setMe({ k1: 'o1' });
  M.setRows(rows(N, 4));
  M.setPolls(archive(3, ORDER));
  ok('owner and team id resolve to each other', M.pollTeamIdOf('bft'), 10);
  ok('an unknown owner resolves to nothing', M.pollTeamIdOf('nope'), 0);
  ok('the sportsbook badge matches the standings badge',
     txt(M.pollBadgeFor('bft')), txt(M.pollBadge(10)));
  ok('an owner nobody knows is withheld, not blank',
     withheld(M.pollBadgeFor('nope')), true);
  /* the modifier is the only thing a caller may vary */
  ok('a modifier rides along', M.pollBadge(1, 'cp-bdg-tl').indexOf('cp-bdg cp-bdg-tl') >= 0, true);
  ok('and the number is unchanged by it', txt(M.pollBadge(1, 'cp-bdg-hero')), '1');
  ok('the ramp colour is handed in, not hard coded',
     M.pollBadge(1).indexOf('--cpb:#R1of12') >= 0, true);
}

/* ── 6 ─────────────────────────────────────────────────────────────────── */
head('6. BALLS BIG 4');
{
  const build = () => { const out = []; M.ntBig4(out); return out; };
  reset();
  M.setRows(rows(N, 5));

  ok('it opens in week 5, the NEXT poll', M.NT_BIG4_FROM, 5);
  ok('and it is BFT\'s ballot', M.NT_BIG4_OWNER, 'bft');

  /* week 4's ballot is already cast — a card for it would be Tuesday's news */
  M.setWeek(4);
  M.setRows(rows(N, 4));
  ok('nothing for the poll that is already open', build().length, 0);
  M.setWeek(3);
  M.setRows(rows(N, 3));
  ok('nor for one that has closed', build().length, 0);

  M.setWeek(5);
  M.setRows(rows(N, 5));
  const c = build();
  ok('one card once the ballot is in', c.length, 1);
  ok('titled the way it was asked for', c[0] && c[0].title, 'Balls Big 4');
  ok('keyed to the season and the week', c[0] && c[0].id, 'b4:2026:5');
  ok('and it is its own kind', c[0] && c[0].kind, 'big4');

  /* four cells, in ballot order, each with a crest and an abbreviation */
  const art = c[0].art;
  ok('a two by two grid', art.indexOf('class="nt-b4"') >= 0, true);
  ok('four cells and no more', (art.match(/nt-b4-c/g) || []).length, 4);
  ok('four crests', (art.match(/nt-b4-l/g) || []).length, 4);
  ok('the crests are the top four, in his order',
     (art.match(/data-t="(\d+)"/g) || []).map(s => s.replace(/\D/g, '')),
     ['1', '2', '3', '4']);
  ok('the abbreviations are there', (art.match(/>T(\d+)</g) || []).map(s => s.slice(1, -1)),
     ['T1', 'T2', 'T3', 'T4']);
  ok('numbered one to four', (art.match(/nt-b4-r">(\d)/g) || []).map(s => s.slice(-1)),
     ['1', '2', '3', '4']);

  /* BFT ranks somebody else first */
  M.setRows(rows(N, 5, i => (FR[i].owner === 'bft' ? rot(ORDER, 5) : ORDER)));
  ok('it reads HIS ballot and not the league average',
     (build()[0].art.match(/data-t="(\d+)"/g) || []).map(s => s.replace(/\D/g, '')),
     ['6', '7', '8', '9']);

  /* the cases where there is nothing to say */
  M.setRows(rows(N, 5).filter(r => r.id !== 'bft'));
  ok('no ballot from him, no card', build().length, 0);
  M.setRows([{ id: 'bft', teamId: '10', cp_2026_w5: JSON.stringify(ORDER.slice(0, 4)) }]);
  ok('a half-finished draft is not a vote', build().length, 0);
  M.setRows([{ id: 'bft', teamId: '10', cp_2026_w5: 'not json' }]);
  ok('and neither is a corrupt field', build().length, 0);
  M.setRows(rows(N, 5));
  M.setTeams([]);
  ok('no league loaded, no card', build().length, 0);
  M.setTeams(TEAMS);

  /* IT IS NOT GATED ON THE VIEWER'S OWN BALLOT. The four names are published
     deliberately, by the manager they belong to — this is the one poll thing on
     the site that does not wait for you to vote first. */
  M.setMe(null);
  M.setRows(rows(N, 5));
  ok('a manager who has not voted still gets the card', build().length, 1);
  ok('while their own badges stay withheld', withheld(M.pollBadge(1)), true);
}

/* ── 7 ─────────────────────────────────────────────────────────────────── */
head('7. WHERE A TEAM STOOD IN A WEEK THAT IS OVER');
{
  /* three weeks on file, each a different order */
  const W1 = ORDER;                                   // 1,2,3,...,12
  const W2 = ORDER.slice().reverse();                 // 12,...,2,1
  const W3 = rot(ORDER, 1);                           // 2,3,...,12,1
  const polls = { weeks: {} };
  [[1, W1], [2, W2], [3, W3]].forEach(([w, o]) => {
    polls.weeks[w] = { ballots: N, rank: o.map((id, i) => ({ rank: i + 1, teamId: Number(id), avg: i + 1 })) };
  });
  reset();
  M.setMe({ k1: 'o1' });
  M.setRows(rows(N, 4));                              // voted this week
  M.setPolls(polls);

  ok('week 1 is week 1', M.pollRanksAt(1)[1], 1);
  ok('and team 12 was last in it', M.pollRanksAt(1)[12], 12);
  ok('week 2 is its own order', M.pollRanksAt(2)[1], 12);
  ok('week 3 is its own order', M.pollRanksAt(3)[1], 12);
  /* the week in progress counts as on file the moment every ballot is in --
     pollLiveWeekEntry puts it there, and a schedule asking for a week past
     the archive should get the newest thing that exists, not the newest
     thing that has been WRITTEN */
  ok('the live week counts once every ballot is in',
     JSON.stringify(M.pollRanksAt(9)), JSON.stringify(M.pollRanksAt(4)));
  M.setRows(rows(5, 4));                              // not everybody: no live week
  ok('a week with no poll falls BACK, never forward',
     JSON.stringify(M.pollRanksAt(9)), JSON.stringify(M.pollRanksAt(3)));
  M.setRows(rows(N, 4));
  ok('and before the first poll there is nothing', JSON.stringify(M.pollRanksAt(0)), '{}');

  ok('the badge prints the number from THAT week', txt(M.pollBadgeAt(1, 1)), '1');
  ok('not the one from this one', txt(M.pollBadgeAt(1, 2)), '12');
  ok('the owner form agrees with the id form',
     txt(M.pollBadgeAtFor('o1', 2)), txt(M.pollBadgeAt(1, 2)));
  ok('the tooltip says which week', M.pollBadgeAt(1, 2).indexOf('in week 2') >= 0, true);
  /* gated exactly like the live one */
  M.setRows(rows(N, 4).filter(r => r.id !== 'o1'));
  ok('a manager who has not voted sees history withheld too',
     withheld(M.pollBadgeAt(1, 1)), true);
}

/* ── 8 ─────────────────────────────────────────────────────────────────── */
head('8. STRENGTH OF SCHEDULE');
{
  /* Four of the twelve, playing a round robin. Weeks 1 and 2 are in the books
     and week 4 is not; week 6 is a playoff fixture and must be ignored.

       poll wk1   1 2 3 4        poll wk2   4 3 2 1        poll wk3   2 1 4 3

     so `now` is week 3: t2 first, t1 second, t4 third, t3 fourth. */
  const polls = { weeks: {} };
  [[1, ['1','2','3','4']], [2, ['4','3','2','1']], [3, ['2','1','4','3']]]
    .forEach(([w, o]) => { polls.weeks[w] = { ballots: 4,
      rank: o.map((id, i) => ({ rank: i + 1, teamId: Number(id), avg: i + 1 })) }; });
  /* the SCORES matter as well as the poll, for the Scored column:
       wk1   t3 140, t1 120, t2 100, t4 90     so t3 is 1st and t4 is 4th
       wk2   t4 130, t3 110, t2 95,  t1 80 */
  const g = (w, a, ap, b, bp) => ({ matchupPeriodId: w,
    home: { teamId: a, totalPoints: ap }, away: { teamId: b, totalPoints: bp } });
  reset();
  M.setTeams(TEAMS.slice(0, 4));
  M.setFranchises(FR.slice(0, 4));
  M.setMe({ k1: 'o1' });
  M.setRows(rows(4, 4));
  M.setPolls(polls);
  /* 2025 rather than 2026 so this fixture cannot collide with section 9's in
     the weekScoreRanks memo, which is keyed on the season and the number of
     games played and would otherwise see two different four-game seasons */
  M.setSeason({ season: 2025, regEnd: 4,
    meta: { owners: { 1: 'o1', 2: 'o2', 3: 'o3', 4: 'o4' } },
    played: [g(1, 1, 120, 2, 100), g(1, 3, 140, 4, 90),
             g(2, 1, 80, 3, 110),  g(2, 2, 95, 4, 130)],
    unplayed: [g(4, 1, 0, 4, 0), g(4, 2, 0, 3, 0), g(6, 1, 0, 2, 0)] });

  const r = M.pollSosRows();
  const by = {}; (r || []).forEach(x => { by[x.owner] = x; });
  ok('every team gets a line', (r || []).length, 4);

  /* o1: played t2 in wk1 (2) and t3 in wk2 (2); still to play t4, now 3rd */
  ok('o1 played adds the ranks of that week', by.o1.played, 4);
  ok('o1 still to come uses TODAY', by.o1.left, 3);
  ok('o1 total', by.o1.total, 7);
  ok('o2 total', by.o2.total, 6);
  ok('o3 total', by.o3.total, 9);
  ok('o4 total', by.o4.total, 8);
  ok('nothing went missing', (r || []).every(x => x.miss === 0), true);
  /* two behind and one ahead: the week 6 fixture is a playoff and does not
     count, which is the whole point of the next assertion */
  ok('two games behind, one ahead', [by.o1.pn, by.o1.ln], [2, 1]);

  /* the playoff fixture in week 6 would have added t2's rank of 1 to o1 */
  ok('the playoff week is not counted', by.o1.total !== 8, true);

  /* ── the Scored column: the opponents' finishing places, added up ────────
       o1 met t2 (3rd in wk1) and t3 (2nd in wk2)   = 5
       o2 met t1 (2nd)        and t4 (1st)          = 3   the hardest of it
       o3 met t4 (4th)        and t1 (4th)          = 8   the easiest
       o4 met t3 (1st)        and t2 (3rd)          = 4                      */
  ok('o1 scored', by.o1.scored, 5);
  ok('o2 scored', by.o2.scored, 3);
  ok('o3 scored', by.o3.scored, 8);
  ok('o4 scored', by.o4.scored, 4);
  ok('it counts the games behind and not the ones ahead', by.o1.sn, 2);
  /* it is a DIFFERENT measure of the same slate, so it must not move the one
     the table is ranked on */
  ok('and it stays out of the total', by.o1.played + by.o1.left, by.o1.total);
  ok('the order is still the poll order', (r || []).map(x => x.owner),
     ['o2', 'o1', 'o4', 'o3']);

  /* ── the two graded columns run RED to green as the number climbs ───────
       Red is the bad news, and on both of these the bad news is the LOW
       number: the hardest slate in the league, or opponents who have been
       putting up the best weeks in it. */
  ok('the bottom of the range is red', M.sosCol(10, 10, 30), M.SOS_RAMP[0]);
  ok('and SOS_RAMP starts red', M.SOS_RAMP[0], '#ff5f5f');
  ok('the top of it is green', M.sosCol(30, 10, 30), M.SOS_RAMP[M.SOS_RAMP.length - 1]);
  ok('and SOS_RAMP ends green', M.SOS_RAMP[M.SOS_RAMP.length - 1], '#3fd07a');
  ok('and the middle is the middle stop', M.sosCol(20, 10, 30), M.SOS_RAMP[2]);
  ok('past the top it clamps rather than wrapping', M.sosCol(99, 10, 30),
     M.SOS_RAMP[M.SOS_RAMP.length - 1]);
  ok('and below the bottom too', M.sosCol(-5, 10, 30), M.SOS_RAMP[0]);
  /* the hardest schedule in the table is the one that gets the red */
  ok('the hardest slate is red', M.sosCol(by.o2.total,
     Math.min(...r.map(x => x.total)), Math.max(...r.map(x => x.total))),
     M.SOS_RAMP[0]);
  /* a column where every team is level has no gradient to draw */
  ok('a flat column is not graded', M.sosCol(7, 7, 7), 'var(--text2)');
  ok('and neither is a missing number', M.sosCol(null, 10, 30), 'var(--text2)');
  /* the divider marks off the three that make the total */
  ok('the rule sits on Played', (M.pollSosHTML('o1').match(/sos-sep/g) || []).length,
     (r || []).length + 1);
  ok('and the column says whose scoring it is',
     M.pollSosHTML('o1').indexOf('>Opp Scored<') >= 0, true);

  ok('hardest first', (r || []).map(x => x.owner), ['o2', 'o1', 'o4', 'o3']);
  ok('and the rank follows the sort', (r || []).map(x => x.rank), [1, 2, 3, 4]);

  /* the section is the poll, and adding it up does not stop it being the poll */
  ok('it draws for a manager who has voted',
     M.pollSosHTML('o1').indexOf('sos-grid') >= 0, true);
  ok('and their own line is picked out',
     M.pollSosHTML('o1').indexOf('sos-me') >= 0, true);
  M.setRows(rows(4, 4).filter(x => x.id !== 'o1'));
  ok('and is withheld from one who has not',
     M.pollSosHTML('o1').indexOf('sos-gate') >= 0, true);
  ok('with no numbers left in it',
     M.pollSosHTML('o1').indexOf('sos-grid') < 0, true);

  /* a season the app has not loaded is not an error */
  M.setRows(rows(4, 4));
  M.setSeason(null);
  ok('no season, no rows', M.pollSosRows(), null);
  ok('and no section', M.pollSosHTML('o1'), '');
}

/* ── 9 ──────────────────────────────────────────────────────────────────── */
head('9. WHERE A SCORE RANKED IN ITS OWN WEEK');
{
  const gp = (w, a, ap, b, bp) => ({ matchupPeriodId: w,
    home: { teamId: a, totalPoints: ap }, away: { teamId: b, totalPoints: bp } });
  reset();
  M.setTeams(TEAMS.slice(0, 4));
  M.setFranchises(FR.slice(0, 4));
  M.setSeason({ season: 2026, regEnd: 4,
    meta: { owners: { 1: 'o1', 2: 'o2', 3: 'o3', 4: 'o4' } },
    played: [gp(1, 1, 120, 2, 100), gp(1, 3, 140, 4, 90),
             gp(2, 1, 80, 3, 80),   gp(2, 2, 95, 4, 110)],
    unplayed: [] });

  /* week 1:  o3 140, o1 120, o2 100, o4 90 */
  ok('the biggest week is first', M.weekScoreRanks(1).o3, 1);
  ok('and the smallest is last', M.weekScoreRanks(1).o4, 4);
  ok('the whole week, in order',
     ['o1', 'o2', 'o3', 'o4'].map(o => M.weekScoreRanks(1)[o]), [2, 3, 1, 4]);

  /* week 2:  o4 110, o2 95, then o1 and o3 both on 80 */
  ok('a tie shares the better number',
     [M.weekScoreRanks(2).o1, M.weekScoreRanks(2).o3], [3, 3]);
  ok('and nobody is given the one below it',
     Object.values(M.weekScoreRanks(2)).indexOf(4), -1);
  ok('above the tie is unaffected',
     [M.weekScoreRanks(2).o4, M.weekScoreRanks(2).o2], [1, 2]);

  ok('a week nobody has played is empty', JSON.stringify(M.weekScoreRanks(3)), '{}');
  ok('and so is week zero', JSON.stringify(M.weekScoreRanks(0)), '{}');

  /* the memo has to notice a week landing */
  M.setSeason({ season: 2026, regEnd: 4,
    meta: { owners: { 1: 'o1', 2: 'o2', 3: 'o3', 4: 'o4' } },
    played: [gp(1, 1, 120, 2, 100), gp(1, 3, 140, 4, 90),
             gp(2, 1, 80, 3, 80),   gp(2, 2, 95, 4, 110),
             gp(3, 1, 200, 2, 10),  gp(3, 3, 50, 4, 60)],
    unplayed: [] });
  ok('a new week is picked up rather than served from the cache',
     M.weekScoreRanks(3).o1, 1);
  ok('and the weeks already cached are still right', M.weekScoreRanks(1).o3, 1);

  M.setSeason(null);
  ok('no season, no ranks', JSON.stringify(M.weekScoreRanks(1)), '{}');
}

console.log(NL + pass + ' passed, ' + fail + ' failed');
process.exitCode = fail ? 1 : 0;
