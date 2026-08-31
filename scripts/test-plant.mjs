/* Does the locker-room plant still keep time, and does it bill correctly?
 *
 * The plant used to be a one-way trip: six stages, thriving to dead, and it sat
 * dead until somebody watered it. It is a CYCLE now — a stage a day, dead on
 * the fifth, dead for two more, and on the seventh the league revives it and
 * charges the owner a Plant Revival Fee.
 *
 * That turns a decoration into part of the economy, which is why this suite
 * exists. Three things have to agree and none of them is written down anywhere:
 *
 *   the stage    what the locker room draws
 *   the fee      what bucksBalance takes off, every cycle, for ever
 *   the card     what the owner is told they were charged
 *
 * All three are DERIVED from one timestamp, so they cannot drift apart by being
 * updated at different times — but they can drift apart by being computed with
 * three slightly different pieces of arithmetic, which is exactly the failure
 * this catches. A balance that quietly bills $60 while the notification says
 * $20 is worse than either number being wrong on its own.
 *
 * As with the other suites the functions are lifted out of app.js by string
 * match rather than reimplemented, so a rename breaks this loudly instead of
 * letting the site and the tests drift apart.
 *
 * THIS IS THE ONLY SUITE THAT SEES THE FEE IN THE BALANCE. test-bank-egg also
 * lifts the real bucksBalance, but not plantFee — so its `try{...}catch{}`
 * around the charge swallows a ReferenceError and the term reads zero there.
 * That is the same defensive shape bucksIdleCost and invNetSpent already have
 * and it is deliberate, but it does mean a broken fee would pass over there.
 * Section 7 is where it would be caught.
 *
 *   node scripts/test-plant.mjs
 */
import fs from 'fs';

const SRC = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8')
  .split(String.fromCharCode(13)).join('');

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? '  -> ' + extra : '')); }
};

/* The other suites stop a `const` grab at the first closing brace, which works
   until the declaration contains an object literal — and bucksCents does:

     const bucksCents=v=>bucks2(v)
       .toLocaleString(undefined,{minimumFractionDigits:2,...});

   The old rule stopped on the brace closing the options object and handed back
   a line missing its final ')'. The harness then failed to build with "missing
   ) after argument list", which points at the harness rather than at the grab
   that cut it in half.

   So: a `function` grab still ends at the brace closing its body, and anything
   else runs to the first semicolon that is outside every bracket. */
function grab(startsWith) {
  const i = SRC.indexOf(startsWith);
  if (i < 0) throw new Error('cannot find "' + startsWith + '" in app.js');
  const isFn = startsWith.slice(0, 8) === 'function';
  let j = i, curly = 0, paren = 0, sq = 0, opened = false;
  for (; j < SRC.length; j++) {
    const c = SRC[j];
    if (c === '{') { curly++; opened = true; }
    else if (c === '(') paren++;
    else if (c === '[') sq++;
    else if (c === '}') { curly--; if (isFn && opened && curly === 0) { j++; break; } }
    else if (c === ')') paren--;
    else if (c === ']') sq--;
    else if (c === ';' && !curly && !paren && !sq) { j++; break; }
  }
  return SRC.slice(i, j);
}

console.log('\n1. every declaration the plant needs is still there');
const NEEDED = [
  'const PLANT_STAGES=', 'const plantKey=',
  'const PLANT_STEP_MS=', 'const PLANT_DRY_STEPS=', 'const PLANT_DEAD_STEPS=',
  'const PLANT_CYCLE_STEPS=', 'const plantMsFor=', 'function plantStageOf(',
  'const PLANT_REVIVAL_FEE=', 'function bkPlant(', 'function plantRevivals(',
  'function plantFee(', 'function bucksBalance(',
  'const bucks2=', 'const bucksCents=', 'const bucksFmt=',
  'function ntPlants(', 'function plantDryLabel(',
];
const parts = {};
for (const n of NEEDED) {
  let got = null;
  try { got = grab(n); } catch (e) {}
  ok(n, !!got && got.length > n.length, got ? null : 'not found');
  parts[n] = got || '';
}

const DAY = 24 * 3600 * 1000;

/* ── the world app.js expects ───────────────────────────────────────────────
   Only what the plant actually touches. The balance's other terms are stubbed
   to zero so the fee is the only thing moving it — that is the whole point of
   pulling the real bucksBalance in rather than trusting that somebody wired the
   subtraction up. */
const harness = `
const TEST_PROFILE='test';
let _CFG={plantTestMinutes:0, plantRevivalFee:20};
let _me={k1:'me'};
let _bkScope=null;
let _store={};
const localStorage={getItem:k=>(k in _store?_store[k]:null), setItem:(k,v)=>{_store[k]=String(v);}};
function setCfg(c){ _CFG=c; }
function setMe(m){ _me=m; }
function setWatered(t){ if(t==null) delete _store[plantKey()]; else _store[plantKey()]=String(t); }
function setScope(p){ _bkScope=p?{bets:[],eggs:0,lots:[],plant:p}:null; }

/* the balance's other terms, all silent */
function bucksAllowance(){ return 100; }
function bucksStaked(){ return 0; }
function bucksReturned(){ return 0; }
function eggBucks(){ return 0; }
function invNetSpent(){ return 0; }
function bucksIdleCost(){ return 0; }

/* what a notification card needs to exist */
let _cpRows=[], _teams=[{id:7,name:'Dry Bones'}], _ownerMap={7:'own7'};
function setRows(r){ _cpRows=r; }
function ntStat(owner,name,value,label){ return 'STAT|'+value+'|'+label; }
const ntToday=()=>{const d=new Date(); d.setHours(0,0,0,0); return d.getTime();};
const ntDayOf=t=>{const d=new Date(t); d.setHours(0,0,0,0); return d.getTime();};

${NEEDED.map(n => parts[n]).join(';\n')}
module.exports={PLANT_STAGES,PLANT_STEP_MS,PLANT_DRY_STEPS,PLANT_DEAD_STEPS,
  PLANT_CYCLE_STEPS,plantMsFor,plantStageOf,PLANT_REVIVAL_FEE,bkPlant,
  plantRevivals,plantFee,bucksBalance,bucksFmt,plantDryLabel,ntPlants,
  setCfg,setMe,setWatered,setScope,setRows};
`;
const mod = { exports: {} };
let built = true;
try { new Function('module', harness)(mod); }
catch (e) { built = false; console.log('  FAIL harness does not build -> ' + e.message); fail++; }

if (built) {
  const M = mod.exports;
  const fresh = () => { M.setCfg({ plantTestMinutes: 0, plantRevivalFee: 20 }); M.setMe({ k1: 'me' }); M.setScope(null); M.setRows([]); };
  /* a plant watered `d` days ago */
  const ago = d => Date.now() - d * DAY;
  const at = d => M.plantStageOf(ago(d), 'me');

  console.log('\n2. the clock is a day a stage, five to dead, two dead, seven round');
  ok('a stage is exactly one day', M.PLANT_STEP_MS === DAY, M.PLANT_STEP_MS);
  ok('six labels, five steps between them', M.PLANT_DRY_STEPS === 5 && M.PLANT_STAGES.length === 6);
  ok('it lies dead for two of them', M.PLANT_DEAD_STEPS === 2);
  ok('so a full cycle is seven days', M.PLANT_CYCLE_STEPS === 7
    && M.PLANT_CYCLE_STEPS * M.PLANT_STEP_MS === 7 * DAY);
  ok('a real plant is on the real clock', M.plantMsFor('me') === DAY);

  console.log('\n3. one stage a day, and both dead days are Dead');
  fresh();
  const want = ['Thriving', 'Healthy', 'Getting dry', 'Drooping', 'Wilting', 'Dead', 'Dead'];
  want.forEach((label, d) => {
    const st = at(d + 0.5);                       // mid-day, away from the boundary
    ok(`day ${d} is ${label}`, st.label === label, st.label + ' (stage ' + st.stage + ')');
  });
  ok('day 7 has come back to Thriving', at(7.5).label === 'Thriving', at(7.5).label);
  ok('never leaves the label list, four cycles deep', (() => {
    for (let h = 0; h < 28 * 24; h++) {
      const st = M.plantStageOf(Date.now() - h * 3600 * 1000, 'me');
      if (!st.label || st.stage < 0 || st.stage > 5) return false;
    }
    return true;
  })());

  console.log('\n4. the boundaries, where an off-by-one would live');
  ok('a minute short of day 5 is still Wilting', at(5 - 1 / 1440).label === 'Wilting');
  ok('day 5 exactly is Dead', at(5).label === 'Dead');
  ok('a minute short of day 7 is still Dead', at(7 - 1 / 1440).label === 'Dead');
  ok('day 7 exactly is Thriving again', at(7).label === 'Thriving');
  ok('and has one revival on it', at(7).revivals === 1, at(7).revivals);
  ok('a minute short of day 7 has none', at(7 - 1 / 1440).revivals === 0);

  console.log('\n5. revivals count every cycle, not just the first');
  [[0.5, 0], [4.9, 0], [6.9, 0], [7.1, 1], [13.9, 1], [14.1, 2], [28.1, 4], [365, 52]]
    .forEach(([d, n]) => ok(`day ${d} -> ${n} revival${n === 1 ? '' : 's'}`,
      at(d).revivals === n, at(d).revivals));

  console.log('\n6. a plant nobody ever watered is not billed for dying');
  fresh(); M.setWatered(null);
  const never = M.plantStageOf(null, 'me');
  ok('reads as thriving and fresh', never.stage === 0 && never.fresh === true);
  ok('with no revivals', never.revivals === 0);
  ok('and no fee', M.plantFee() === 0, M.plantFee());

  console.log('\n7. the fee: $20 a revival, off the balance, to the cent');
  fresh();
  [[3, 0], [6.9, 0], [7.1, 20], [14.1, 40], [28.1, 80]].forEach(([d, amt]) => {
    M.setWatered(ago(d));
    ok(`day ${d} costs ${amt}`, M.plantFee() === amt, M.plantFee());
  });
  M.setWatered(ago(7.1));
  ok('and it actually comes off bucksBalance', M.bucksBalance() === 80, M.bucksBalance());
  M.setWatered(ago(28.1));
  ok('four of them take $80 of a $100 allowance', M.bucksBalance() === 20, M.bucksBalance());
  M.setWatered(ago(60));
  ok('a balance never goes negative', M.bucksBalance() === 0, M.bucksBalance());
  ok('the fee is money, so never more than two decimals', (() => {
    for (let d = 7; d < 200; d += 0.37) {
      M.setWatered(ago(d));
      const f = M.plantFee();
      if (Math.round(f * 100) !== f * 100) return false;
    }
    return true;
  })());

  console.log('\n8. watering stops the meter');
  fresh(); M.setWatered(ago(30));
  ok('thirty days abandoned is $80', M.plantFee() === 80, M.plantFee());
  M.setWatered(Date.now());
  ok('watered just now is thriving', M.plantStageOf(Date.now(), 'me').stage === 0);
  ok('and charges nothing more', M.plantFee() === 0, M.plantFee());

  console.log('\n9. the fast test cycle animates but is never charged');
  fresh(); M.setCfg({ plantTestMinutes: 0.25, plantRevivalFee: 20 }); M.setMe({ k1: 'test' });
  M.setWatered(Date.now() - 10 * 60 * 1000);          // ten minutes = ~5 test cycles
  ok('a test plant is on the short clock', M.plantMsFor('test') === 15000);
  ok('and really has cycled', M.plantStageOf(Date.now() - 10 * 60 * 1000, 'test').revivals > 3);
  ok('but plantRevivals refuses to bill it', M.plantRevivals() === 0);
  ok('so the fee is zero', M.plantFee() === 0, M.plantFee());
  ok('and the balance is untouched', M.bucksBalance() === 100, M.bucksBalance());
  ok('while a REAL plant on the same page still pays', (() => {
    M.setCfg({ plantTestMinutes: 0.25, plantRevivalFee: 20 });
    return M.plantStageOf(ago(14.1), 'someone-else').revivals === 2;
  })());

  console.log('\n10. the fee can be switched off without stopping the plant');
  fresh(); M.setCfg({ plantTestMinutes: 0, plantRevivalFee: 0 }); M.setWatered(ago(14.1));
  ok('no fee configured, no charge', M.plantFee() === 0);
  ok('but it still died and came back twice', M.plantStageOf(ago(14.1), 'me').revivals === 2);

  console.log('\n11. somebody else\'s balance reads somebody else\'s plant');
  fresh(); M.setWatered(Date.now());                  // mine is spotless
  ok('unscoped, that is my plant and no fee', M.plantFee() === 0);
  M.setScope({ t: ago(21.1), id: 'them' });
  ok('scoped, it is theirs and it is $60', M.plantFee() === 60, M.plantFee());
  ok('and their balance is docked, not mine', M.bucksBalance() === 40, M.bucksBalance());
  M.setScope({ t: 0, id: 'them' });
  ok('a manager with no plant on file is not billed', M.plantFee() === 0);
  M.setScope(null);
  ok('and the scope comes back off cleanly', M.plantFee() === 0);

  console.log('\n12. how long it took, in words');
  ok('five days', M.plantDryLabel(5 * DAY) === '5 days', M.plantDryLabel(5 * DAY));
  ok('two days', M.plantDryLabel(2 * DAY) === '2 days', M.plantDryLabel(2 * DAY));
  ok('one day is singular', M.plantDryLabel(DAY) === '1 day', M.plantDryLabel(DAY));

  /* ── the card ─────────────────────────────────────────────────────────────
     The notification is the ONLY place a manager is told about the charge —
     there is no line item on the sportsbook — so a missing card is a silent
     $20. It matters as much as the arithmetic. */
  console.log('\n13. the cards: a public death, a private bill');
  const cards = (d, ownerId) => {
    M.setRows([{ id: ownerId || 'me', teamId: 7, plantWatered: d == null ? 0 : ago(d) }]);
    const out = []; M.ntPlants(out); return out;
  };
  fresh();
  ok('a plant three days dry says nothing', cards(3).length === 0);
  ok('a plant that has just died posts one card', (() => {
    const c = cards(5.5); return c.length === 1 && c[0].kind === 'plant';
  })());
  ok('and no bill, because it has not been revived yet', cards(5.5).every(c => c.kind !== 'revive'));
  ok('past day 7 there is a death AND a bill', (() => {
    const c = cards(7.5);
    return c.length === 2 && c.some(x => x.kind === 'plant') && c.some(x => x.kind === 'revive');
  })());
  ok('the bill says $20', (() => {
    const c = cards(7.5).find(x => x.kind === 'revive');
    return c && /\$20\.00/.test(c.body) && c.title === 'Plant Revival Fee';
  })(), JSON.stringify((cards(7.5).find(x => x.kind === 'revive') || {}).body));

  console.log('\n14. the bill is only ever shown to the person paying it');
  fresh();
  ok('somebody else\'s plant still posts the death', (() => {
    const c = cards(7.5, 'them'); return c.some(x => x.kind === 'plant');
  })());
  ok('but never their bill', cards(7.5, 'them').every(x => x.kind !== 'revive'));
  M.setMe(null);
  ok('and a signed-out visitor sees no bill at all', cards(7.5, 'me').every(x => x.kind !== 'revive'));

  console.log('\n15. one card per run, not one per week away');
  fresh();
  ok('three weeks away is still two cards, not six', cards(21.5).length === 2, cards(21.5).length);
  ok('and the bill is the whole $60, not the last $20', (() => {
    const c = cards(21.5).find(x => x.kind === 'revive');
    return c && /\$60\.00/.test(c.body);
  })(), JSON.stringify((cards(21.5).find(x => x.kind === 'revive') || {}).body));
  ok('a year away is STILL two cards', cards(365).length === 2, cards(365).length);

  console.log('\n16. the card and the balance never disagree');
  ok('every bill quoted is the exact amount charged', (() => {
    for (let d = 7.1; d < 120; d += 0.83) {
      M.setWatered(ago(d));
      const owed = M.plantFee();
      const c = cards(d).find(x => x.kind === 'revive');
      if (!c) return false;
      if (c.body.indexOf(M.bucksFmt(owed)) < 0) return false;
    }
    return true;
  })());
  ok('no fee configured means no card claiming one', (() => {
    M.setCfg({ plantTestMinutes: 0, plantRevivalFee: 0 });
    return cards(21.5).every(x => x.kind !== 'revive');
  })());
  ok('a test plant is never billed and never told it was', (() => {
    M.setCfg({ plantTestMinutes: 0.25, plantRevivalFee: 20 }); M.setMe({ k1: 'test' });
    M.setRows([{ id: 'test', teamId: 7, plantWatered: Date.now() - 10 * 60 * 1000 }]);
    const out = []; M.ntPlants(out);
    return out.every(x => x.kind !== 'revive');
  })());

  console.log('\n17. an id describes its own event, so a swipe stays swiped');
  fresh();
  const idsAt = d => cards(d).map(c => c.id);
  ok('the death card for cycle 1 differs from cycle 2', idsAt(7.5)[0] !== idsAt(14.5)[0],
    idsAt(7.5)[0] + ' vs ' + idsAt(14.5)[0]);
  ok('the same day gives the same ids twice running',
    JSON.stringify(idsAt(9.5)) === JSON.stringify(idsAt(9.5)));
  ok('a bill id names which revival it is', /:1$/.test(idsAt(7.5).find(i => i.startsWith('plr:'))),
    idsAt(7.5).find(i => i.startsWith('plr:')));
  ok('no card id is ever built off a negative cycle', (() => {
    for (let d = 5; d < 60; d += 0.11) {
      if (cards(d).some(c => /-1/.test(c.id))) return false;
    }
    return true;
  })());
  ok('a card is never dated in the future', (() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    for (let d = 5; d < 60; d += 0.29) {
      if (cards(d).some(c => c.day > today.getTime())) return false;
    }
    return true;
  })());
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
