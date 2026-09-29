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
  ],
  ['cpMineIn', 'pollNowRanks', 'pollBadge', 'pollBadgeFor', 'pollTeamIdOf',
   'cpTally', 'cpKey', 'ntBig4', 'CP_REVEAL_AT', 'NT_BIG4_OWNER', 'NT_BIG4_FROM',
   'setTeams', 'setRows', 'setMe', 'setPolls', 'setFranchises', 'setWeek', 'setTest'],
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

console.log(NL + pass + ' passed, ' + fail + ' failed');
process.exitCode = fail ? 1 : 0;
