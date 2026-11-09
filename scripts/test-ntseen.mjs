/* A SWIPED CARD STAYS SWIPED.
 *
 *   BEFORE ITS DATA     a swipe made while a card's data is still loading
 *                       (the league's tickets, the profiles) keeps every card
 *                       already swiped, on the device and on the profile; on
 *                       9 November BFT's Big win from the 3rd came back because
 *                       one such swipe dropped it
 *   BOUNDED             the newest swipes are kept whatever is being produced,
 *                       older ones only while still produced, so the list does
 *                       not grow forever
 *
 * Run: node scripts/test-ntseen.mjs
 */
import { lifter, assemble } from './lib/lift.mjs';

const NL = String.fromCharCode(10);
let pass = 0, fail = 0;
const ok = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; console.log('  PASS  ' + name); return; }
  fail++;
  console.log('  FAIL  ' + name + NL + '          got  ' + g + NL + '          want ' + w);
};
const grab = lifter(new URL('../public/app.js', import.meta.url));
const M = assemble(grab, ['const lsKey=', 'const ntKey=', 'function ntSeen(', 'const NT_SEEN_KEEP=', 'function ntSaveSeen(', 'function ntMarkSeen('],
  ['ntSeen', 'ntMarkSeen', 'NT_SEEN_KEEP', 'set', 'saved'], [
  "let _me={k1:'bft'}, _ntSeen=null, _ls={}, _live=[], _saved=[];",
  "const localStorage={getItem:k=>(k in _ls?_ls[k]:null), setItem:(k,v)=>{ _ls[k]=String(v); }};",
  /* the cards being produced right now, and what reached the profile */
  "const ntAll=()=>_live.map(id=>({id}));",
  "const gflPatchProfile=(id,o)=>{ _saved.push(JSON.parse(o.ntSeen)); return Promise.resolve({ok:true}); };",
  "const saved=()=>_saved[_saved.length-1]||[];",
  "const set=o=>{ if('live' in o) _live=o.live; if('fresh' in o){ _ntSeen=null; _ls={}; _saved=[]; } };",
].join(NL));

console.log(NL + 'before its data');
M.set({ fresh: true, live: ['bh:1793154301256-kunk', 'st:bft:3', 'pl:mm'] });
M.ntMarkSeen('bh:1793154301256-kunk');
ok('the Big win swiped while the tickets are in', M.saved().includes('bh:1793154301256-kunk'), true);
/* the next open: profiles in, the league's tickets not yet */
M.set({ live: ['st:bft:3', 'pl:mm'] });
M.ntMarkSeen('pl:mm');
ok('another swipe before the tickets land keeps it, on the profile and the device',
  [M.saved().includes('bh:1793154301256-kunk'), M.ntSeen().has('bh:1793154301256-kunk')], [true, true]);
M.set({ live: [] });
M.ntMarkSeen('st:bft:3');
ok('and with nothing loaded at all, every swipe is kept', ['bh:1793154301256-kunk', 'pl:mm', 'st:bft:3'].every(id => M.saved().includes(id)), true);

console.log(NL + 'bounded');
M.set({ fresh: true, live: ['tr:long'] });
M.ntMarkSeen('tr:long');
for (let i = 0; i < M.NT_SEEN_KEEP + 50; i++) M.ntMarkSeen('x:' + i);
const list = M.saved();
ok('the newest swipes are kept and the oldest let go', [list.includes('x:' + (M.NT_SEEN_KEEP + 49)), list.includes('x:0'), list.includes('x:49'), list.includes('x:50')],
  [true, false, false, true]);
ok('but an old one whose card is still produced stays', list.includes('tr:long'), true);
ok('so the list stays bounded', list.length, M.NT_SEEN_KEEP + 1);
ok('three hundred swipes are kept', M.NT_SEEN_KEEP, 300);

console.log(NL + `${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
