/* WAIVER ROI, WHEN THE SAME PLAYER IS BOUGHT MORE THAN ONCE.
 *
 * A manager picks a player up, drops him, and picks him up again. That is two
 * claims. It cost money twice, so both belong on the Waiver ROI board — and
 * they must not both bank the same points.
 *
 * The old rule counted a pickup's points from its add week to the end of the
 * season, taking every week the player was on that roster. A second spell was
 * therefore counted twice, once under each claim, and re-signing somebody you
 * had already owned inflated your C3 for it. Each claim is bounded to its own
 * spell now.
 *
 * This suite pins that, the bid arithmetic around it (a team does not bid
 * against itself), and the transaction key that decides whether two claims
 * survive the archive/live merge as two things or collapse into one.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const SRC = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8')
  .split(String.fromCharCode(13)).join('');

/* the bracket walker from test-weeks.mjs — strings, template literals and
   comments are stepped over rather than counted */
function skipQuote(src, i) {
  const q = src[i];
  let j = i + 1;
  while (j < src.length) {
    if (src[j] === '\\') { j += 2; continue; }
    if (src[j] === q) return j + 1;
    j++;
  }
  return j;
}
function skipTemplate(src, i) {
  let j = i + 1;
  while (j < src.length) {
    if (src[j] === '\\') { j += 2; continue; }
    if (src[j] === '`') return j + 1;
    if (src[j] === '$' && src[j + 1] === '{') {
      let d = 1; j += 2;
      while (j < src.length && d > 0) {
        const c = src[j];
        if (c === '\\') { j += 2; continue; }
        if (c === "'" || c === '"') { j = skipQuote(src, j); continue; }
        if (c === '`') { j = skipTemplate(src, j); continue; }
        if (c === '{') d++;
        else if (c === '}') d--;
        j++;
      }
      continue;
    }
    j++;
  }
  return j;
}
function walk(src, i) {
  let j = i, depth = 0;
  while (j < src.length) {
    const c = src[j];
    if (c === "'" || c === '"') { j = skipQuote(src, j); continue; }
    if (c === '`') { j = skipTemplate(src, j); continue; }
    if (c === '/' && src[j + 1] === '/') { const e = src.indexOf('\n', j); j = e < 0 ? src.length : e; continue; }
    if (c === '/' && src[j + 1] === '*') { const e = src.indexOf('*/', j); j = e < 0 ? src.length : e + 2; continue; }
    if (c === '(' || c === '[' || c === '{') { depth++; j++; continue; }
    if (c === ')' || c === ']' || c === '}') {
      depth--; j++;
      if (depth === 0 && (c === '}' || c === ']')) return src.slice(i, j);
      continue;
    }
    if (c === ';' && depth === 0) return src.slice(i, j + 1);
    j++;
  }
  return src.slice(i, j);
}
function grab(startsWith) {
  const i = SRC.indexOf(startsWith);
  if (i < 0) throw new Error('not found in app.js: ' + startsWith);
  return walk(SRC, i);
}

const api = new Function(`
const TOTAL_WEEKS = 17;
${grab('async function computeCoaching(teams, transactions, weeklyData){')}
${grab('const txKeyOf=t=>')}
return { computeCoaching, txKeyOf };
`)();

let pass = 0, fail = 0;
const near = (a, b) => Math.abs(a - b) < 1e-6;
function eq(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log((ok ? '  PASS  ' : '  FAIL  ') + name);
  if (!ok) { console.log('        got : ' + JSON.stringify(got));
             console.log('        want: ' + JSON.stringify(want)); fail++; } else pass++;
}

/* Two teams, so "somebody else has him now" is expressible. Points-for is only
   used by C1, which is not what this suite is about, so both are level. */
const TEAMS = [{ id: 1, pf: 1000 }, { id: 2, pf: 1000 }];

/* A weekly roster snapshot: who was on which team, what they started, what they
   scored. `null` for a week means ESPN never gave us that week. */
function weekly(spec) {
  const out = {};
  Object.keys(spec).forEach(w => {
    if (spec[w] === null) return;                 // week absent entirely
    out[w] = {};
    spec[w].forEach(([pid, team, pts, started = true]) => {
      out[w][pid] = { pts, team, started, slot: started ? 2 : 20, n: 'P' + pid };
    });
  });
  return out;
}
const add = (id, team, pid, wk, bid, extra = {}) => ({
  id, type: 'WAIVER', teamId: team, bidAmount: bid, status: 'EXECUTED',
  scoringPeriodId: wk, items: [{ type: 'ADD', playerId: pid, toTeamId: team }], ...extra,
});
const picksOf = async (txns, wk) => {
  const { breakdown } = await api.computeCoaching(TEAMS, txns, wk);
  return (breakdown[1].detail.waiverPickups || [])
    .slice().sort((a, b) => a.week - b.week || b.bid - a.bid);
};

console.log('1. one claim, held to the end of the season');
{
  /* picked up in week 2, on the roster and starting every week after */
  const wk = weekly({ 2: [[900, 1, 10]], 3: [[900, 1, 20]], 4: [[900, 1, 30]] });
  const p = await picksOf([add(1, 1, 900, 2, 5)], wk);
  eq('one row', p.length, 1);
  eq('all of it counts', p[0].pts, 60);
}

console.log('\n2. one claim, dropped part way');
{
  /* gone from week 4 — no entry anywhere, which is free agency */
  const wk = weekly({ 2: [[900, 1, 10]], 3: [[900, 1, 20]], 4: [[999, 2, 5]] });
  const p = await picksOf([add(1, 1, 900, 2, 5)], wk);
  eq('stops at the drop', p[0].pts, 30);
}

console.log('\n3. THE ONE THIS IS ABOUT — picked up, dropped, picked up again');
{
  /* week 2 he scores 10 and 20, is dropped, and in week 6 the same manager buys
     him back and he scores 40 and 50. Two claims: 30 points on the first, 90 on
     the second. The old rule gave the FIRST claim 30+90=120 as well, because it
     ran to the end of the season and week 6 matched the team again. */
  const wk = weekly({
    2: [[900, 1, 10]], 3: [[900, 1, 20]],
    4: [[900, 2, 99]],                            // somebody else picked him up
    5: [[900, 2, 99]],
    6: [[900, 1, 40]], 7: [[900, 1, 50]],
  });
  const p = await picksOf([add(1, 1, 900, 2, 5), add(2, 1, 900, 6, 12)], wk);
  eq('both claims are on the board', p.length, 2);
  eq('first spell only', p[0].pts, 30);
  eq('second spell only', p[1].pts, 90);
  eq('each keeps its own bid', [p[0].bid, p[1].bid], [5, 12]);
  /* C3 = Σ(points ÷ margin) ÷ 10. Uncontested, so margin is the full bid.
     30/5 + 90/12 = 6 + 7.5 = 13.5, ÷10 = 1.35 */
  const { breakdown } = await api.computeCoaching(TEAMS,
    [add(1, 1, 900, 2, 5), add(2, 1, 900, 6, 12)], wk);
  eq('C3 counts each spell once', near(breakdown[1].c3, 1.35), true);
}

console.log('\n4. a bye in the middle is not a departure');
{
  /* on the roster, benched, nothing beside his name — still yours */
  const wk = weekly({
    2: [[900, 1, 10]], 3: [[900, 1, 0, false]], 4: [[900, 1, 30]],
  });
  const p = await picksOf([add(1, 1, 900, 2, 5)], wk);
  eq('the spell survives the bye', p[0].pts, 40);
}

console.log('\n5. a week nobody fetched is not a departure either');
{
  /* week 3 absent from the data — that says nothing about who owned him */
  const wk = weekly({ 2: [[900, 1, 10]], 3: null, 4: [[900, 1, 30]] });
  const p = await picksOf([add(1, 1, 900, 2, 5)], wk);
  eq('steps over the hole', p[0].pts, 40);
}

console.log('\n6. add and re-add inside one week');
{
  /* The weekly rosters cannot see between two moves in the same scoring period,
     so the later claim owns the week and the earlier one shows its bid against
     nothing — which is what it actually bought. */
  const wk = weekly({ 3: [[900, 1, 25]], 4: [[900, 1, 25]] });
  const p = await picksOf([
    add(1, 1, 900, 3, 4, { processDate: 100 }),
    add(2, 1, 900, 3, 9, { processDate: 200 }),
  ], wk);
  eq('both claims still shown', p.length, 2);
  eq('the later one owns the week', p.find(x => x.bid === 9).pts, 50);
  eq('the earlier one bought nothing', p.find(x => x.bid === 4).pts, 0);
}

console.log('\n7. a team does not bid against itself');
{
  /* Two claims on one player in one week by the SAME manager. Neither is the
     other's competition: the margin is the full bid, not $1. */
  const wk = weekly({ 3: [[900, 1, 10]] });
  const p = await picksOf([
    add(1, 1, 900, 3, 20, { processDate: 100 }),
    add(2, 1, 900, 3, 8, { processDate: 200 }),
  ], wk);
  eq('no self-contest on the first', p.find(x => x.bid === 20).margin, 20);
  eq('no self-contest on the second', p.find(x => x.bid === 8).margin, 8);
}

console.log('\n8. a real rival still counts');
{
  const wk = weekly({ 3: [[900, 1, 10]] });
  const txns = [
    add(1, 1, 900, 3, 20),
    { ...add(2, 2, 900, 3, 14), status: 'FAILED' },      // the losing claim
  ];
  const p = await picksOf(txns, wk);
  eq('runner-up is read', p[0].next, 14);
  eq('margin is the gap', p[0].margin, 6);
  eq('the losing claim is not a pickup', p.length, 1);
}

console.log('\n9. the transaction key keeps two claims apart');
{
  /* Rows ESPN serves carry an id, and that is the key. Rows rebuilt from weekly
     roster diffs do not, and the fallback key used to be type|team|week|players
     — identical for two claims on the same player in the same week, so the
     merge kept one and lost the other. The date is what separates them. */
  const a = { type: 'WAIVER', teamId: 1, scoringPeriodId: 3, proposedDate: 111,
              items: [{ type: 'ADD', playerId: 900 }] };
  const b = { type: 'WAIVER', teamId: 1, scoringPeriodId: 3, proposedDate: 222,
              items: [{ type: 'ADD', playerId: 900 }] };
  eq('two same-week claims are two keys', api.txKeyOf(a) !== api.txKeyOf(b), true);
  /* and the same row from both sides of the merge is still one thing */
  eq('the same row is one key', api.txKeyOf(a) === api.txKeyOf({ ...a }), true);
  /* an id always wins, whatever else differs */
  eq('an id is the key when there is one',
     api.txKeyOf({ ...a, id: 7 }) === api.txKeyOf({ ...b, id: 7 }), true);
}

console.log('\n10. the app and the archiver agree on what a key is');
{
  /* scripts/archive-transactions.mjs has always carried the date in its own
     key. This is the check that app.js still does too — they are the two sides
     of the same merge, and a key they disagree about is a row that survives on
     one side and not the other. */
  const arch = fs.readFileSync(new URL('./archive-transactions.mjs', import.meta.url), 'utf8');
  eq('archiver keys on the date', /proposedDate \|\| t\.processDate/.test(arch), true);
  eq('app.js keys on the date too',
     /txKeyOf=t=>[\s\S]{0,400}proposedDate\|\|t\.processDate/.test(SRC), true);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
