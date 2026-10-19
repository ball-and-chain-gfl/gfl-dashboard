/* A TRADE IS WHAT ESPN UPHELD, LOCKED THE DAY IT WENT THROUGH; AN INVITATION
 * CLOSES WHEN ITS BET CAN NO LONGER BE PLACED.
 *
 *   ESPN'S RECORD    the season being played reads ESPN's processed trade
 *                    entries and nothing else -- no roster guesswork
 *   LOCKED           an archived trade carrying upheldAt keeps its week, dates,
 *                    money and identity whatever the live feed later says; only
 *                    points move. The archiver captures hourly and never edits
 *   THE CARD         says when it was agreed and when it was upheld
 *   INVITATIONS      closed for good once the bet could no longer be placed
 *
 * Run: node scripts/test-tradecapture.mjs
 */
import fs from 'fs';
import { lifter, assemble } from './lib/lift.mjs';
import { bucksWeekKeyCentral, closeLapsedInvites } from './lib/close-invites.mjs';

const NL = String.fromCharCode(10);
let pass = 0, fail = 0;
const ok = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; console.log('  PASS  ' + name); return; }
  fail++;
  console.log('  FAIL  ' + name + NL + '          got  ' + g + NL + '          want ' + w);
};
const head = t => console.log(NL + t);
const grab = lifter(new URL('../public/app.js', import.meta.url));
const API = fs.readFileSync(new URL('../api/espn.js', import.meta.url), 'utf8');
const ARC = fs.readFileSync(new URL('./archive-trades.mjs', import.meta.url), 'utf8');

const M = assemble(grab, ['function ntTradeVoteId(', 'function tradeWhen(', 'function tradeMergeRow(', 'function mergeSeasonTrades('],
  ['ntTradeVoteId', 'tradeWhen', 'tradeMergeRow', 'mergeSeasonTrades']);

/* the 13 October trade, as the archive holds it and as the feed tells it now */
const ARCH = { week: 5, id: '10-8:1791737959164', date: 1791897184579, at: 1791897184579, agreedAt: 1791737959164,
  upheldAt: 1791897184598, espnId: '3641fba1', faab: [{ from: 8, to: 10, amount: 125 }], votes: { bft: '10' },
  teams: [{ teamId: 8, players: [{ pid: 4686658, n: 'Mike Washington Jr.', pts: 6, from: 6 }] },
          { teamId: 10, players: [{ pid: 4635008, n: 'Keon Coleman', pts: 0, from: 6 }] }] };
const LIVE = { week: 7, date: 1791897184598, at: 1791897184598, agreedAt: 1, upheldAt: 2, espnId: '3641fba1',
  teams: [{ teamId: 10, players: [{ pid: 4635008, n: 'Keon Coleman', pts: 3.5, from: 7 }] },
          { teamId: 8, players: [{ pid: 4686658, n: 'Mike Washington Jr.', pts: 14.2, from: 7 }] }] };

head('a captured trade is locked');
const m = M.tradeMergeRow(LIVE, ARCH);
ok('its identity is the archive\'s: the vote stays where it was cast', M.ntTradeVoteId('2026', m), 'td:2026:10-8:1791737959164');
ok('its week, its dates and its money are what they were the day it went through',
  [m.week, m.agreedAt, m.upheldAt, m.faab[0].amount], [5, 1791737959164, 1791897184598, 125]);
ok('its sides stay in the archive\'s order', m.teams.map(t => t.teamId), [8, 10]);
ok('and only the points move', m.teams.map(t => t.players[0].pts), [14.2, 3.5]);
const pre = M.tradeMergeRow(LIVE, { ...ARCH, upheldAt: undefined, week: 6 });
ok('a record from before capture takes ESPN\'s week once', pre.week, 7);

head('matched on ESPN\'s own id');
const merged = M.mergeSeasonTrades('2026', { trades: [ARCH] }, { trades: [{ ...LIVE, date: 1799999999999 }] });
ok('one trade, not two, even with the date a week off', merged.trades.length, 1);
ok('and its votes found', merged.trades[0].votes, { bft: '10' });

head('the card says when');
const when = M.tradeWhen(ARCH);
ok('agreed and upheld, both dates', /^agreed \w+ \d+ · upheld \w+ \d+$/.test(when), true);
ok('one date when they are the same day', /^upheld \w+ \d+$/.test(M.tradeWhen({ agreedAt: 1788102336690, upheldAt: 1788102664103 })), true);

head('the season being played is ESPN\'s record, nothing else');
const branch = API.slice(API.indexOf('if (!isHistory) {', API.indexOf("type === 'seasontrades'")),
                        API.indexOf("source: 'espn-feed' });"));
ok('it returns before any rebuild', branch.length > 0 && /return res\.status\(200\)\.json\(\{ season, count: out\.length, trades: out, source: 'espn-feed' \}\)/.test(API), true);
ok('processed entries only (244-246), their FAAB 290; accepts (224-226, 284) only for when it was agreed',
  /DONE = new Set\(\[244, 245, 246\]\)/.test(branch) && /ACCEPTED = new Set\(\[224, 225, 226\]\)/.test(branch) && /money\(290\)/.test(branch), true);
ok('the week off ESPN\'s NFL calendar', /calendar/.test(branch) && /const week = weekOf\(upheldAt\)/.test(branch), true);
ok('nothing to go on is said, not guessed', /source: 'unavailable'/.test(branch), true);
ok('no roster diff in it', /_diff/.test(branch), false);

head('the archive captures and never edits');
ok('--capture adds what is new and leaves the rest', /const capture = argv\.includes\('--capture'\)/.test(ARC) && /d\.trades = \[\.\.\.olds, \.\.\.fresh\]/.test(ARC), true);
ok('a record with upheldAt keeps its week, dates, id and money', /\['week', 'agreedAt', 'upheldAt', 'espnId', 'date', 'at', 'id'\]/.test(ARC), true);
const WF = fs.readFileSync(new URL('../.github/workflows/capture-trades.yml', import.meta.url), 'utf8');
ok('hourly', /cron: '23 \* \* \* \*'/.test(WF) && /archive-trades\.mjs --capture/.test(WF), true);

head('the bucks week, Central');
const ct = (y, mo, d, h) => Date.UTC(y, mo - 1, d, h + 5);   // CDT is UTC-5
ok('Tuesday 5am is still last week', bucksWeekKeyCentral(ct(2026, 10, 13, 5)), '2026-10-06');
ok('Tuesday 6am is the new one', bucksWeekKeyCentral(ct(2026, 10, 13, 6)), '2026-10-13');
ok('a Sunday belongs to the Tuesday before it', bucksWeekKeyCentral(ct(2026, 10, 18, 12)), '2026-10-13');

head('invitations close when their bet can no longer be placed');
const NOW_KEY = bucksWeekKeyCentral();
const inv = (id, extra) => ({ name: 'x/bets/' + id, fields: Object.fromEntries(Object.entries({ owner: 'dorm', season: '2026',
  wk: NOW_KEY, status: 'invite', srcBet: 'src-open', legs: JSON.stringify([{ mk: 'wk7-1-2-ml', pick: 'mm:ml', odds: -150 }]), ...extra })
  .map(([k, v]) => [k, { stringValue: String(v) }])) });
const docs = [inv('old', { wk: '2026-08-25' }), inv('kicked', { legs: JSON.stringify([{ mk: 'wk6-1-2-ml', pick: 'mm:ml', odds: -150 }]) }),
  inv('srcgone', { srcBet: 'src-lost' }), inv('live', {})];
const patched = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (u, o) => {
  u = String(u);
  if (/runQuery/.test(u)) return new Response(JSON.stringify(docs.map(d => ({ document: d }))), { status: 200 });
  if (o && o.method === 'PATCH') { patched.push(decodeURIComponent(u.split('/bets/')[1].split('?')[0])); return new Response('{}', { status: 200 }); }
  const id = decodeURIComponent(u.split('/bets/')[1].split('?')[0]);
  return new Response(JSON.stringify({ name: 'x/bets/' + id, fields: { status: { stringValue: id === 'src-lost' ? 'lost' : 'open' } } }), { status: 200 });
};
const B = assemble(grab, ['const fsOut=', 'const fsIn=', 'const betDocRow=', 'function betLegWeek('], ['fsOut', 'betDocRow', 'betLegWeek']);
const n = await closeLapsedInvites({ docs: 'https://fs/documents', key: 'key=k', fsOut: B.fsOut, betDocRow: B.betDocRow,
  legWeek: B.betLegWeek, weekBegun: async (s, w) => w <= 6, log: () => {} });
globalThis.fetch = realFetch;
ok('raised in an old week, kicked off, or its bet settled: closed; the live one: left', [n, patched.sort()], [3, ['kicked', 'old', 'srcgone']]);
const LIB = fs.readFileSync(new URL('./lib/close-invites.mjs', import.meta.url), 'utf8');
ok('closed as declined, marked lapsed -- never a status that counts as money', /status: 'declined', lapsed: '1'/.test(LIB), true);
ok('the poller sweeps during games, the settlement run every week',
  /await sweepInvites\(\)/.test(fs.readFileSync(new URL('./poll-live.mjs', import.meta.url), 'utf8'))
  && /closeLapsedInvites\(/.test(fs.readFileSync(new URL('./settle-bets.mjs', import.meta.url), 'utf8')), true);

console.log(NL + (fail ? 'FAILED  ' : 'ok  ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
