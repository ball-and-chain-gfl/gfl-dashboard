/* AN INVITATION CLOSES WHEN ITS BET COULD NO LONGER BE PLACED.
 *
 * A parlay can be opened up to other managers, and each one asked is a ticket of
 * their own parked at status 'invite' until they answer. The app already
 * refused to let one be accepted once the football on it had started
 * (inviteLapsed) -- but the ticket itself was left at 'invite' for ever, so the
 * bet went on showing a seat 'asked' weeks after nobody could take it. One from
 * the August test cycle was still sitting there in October.
 *
 * This closes them for good, on the same three rules the app uses:
 *   - a weekly leg whose week has kicked off -- the week's first kickoff is
 *     when its board shuts, so it is when the invitation dies with it
 *   - raised in an earlier bucks week (the Tuesday-6am week, Central)
 *   - the bet it was a seat on is no longer open
 *
 * Closed as 'declined' -- the word the app already uses for a seat that never
 * became a bet, which no balance, leaderboard or feed counts as money -- with
 * lapsed:'1' so the bet card can say 'expired' rather than 'declined'.
 *
 * Used by poll-live.mjs (during games, so it happens at kickoff) and
 * settle-bets.mjs (the Tuesday run, as a backstop).
 */
const CENTRAL = 'America/Chicago';

/* the bucks week a moment belongs to: the most recent Tuesday 06:00 Central,
   as YYYY-MM-DD -- realWeekStart / bucksWeekKey in app.js, in the league's zone */
export function bucksWeekKeyCentral(ms = Date.now()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: CENTRAL, year: 'numeric',
    month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23', weekday: 'short' })
    .formatToParts(new Date(ms)).map(p => [p.type, p.value]));
  const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday);
  let back = (dow - 2 + 7) % 7;
  if (dow === 2 && Number(parts.hour) < 6) back = 7;
  const d = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day) - back));
  return d.toISOString().slice(0, 10);
}

/**
 * @param o.docs      Firestore documents base URL
 * @param o.key       'key=...'
 * @param o.fsOut     the app's field encoder
 * @param o.betDocRow the app's document reader
 * @param o.legWeek   the app's betLegWeek
 * @param o.weekBegun async (season, week) => true | false | null (null: cannot tell)
 * @param o.dry       report only
 */
export async function closeLapsedInvites(o) {
  const log = o.log || console.log;
  const r = await fetch(`${o.docs}:runQuery?${o.key}`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'bets' }],
      where: { fieldFilter: { field: { fieldPath: 'status' }, op: 'EQUAL', value: { stringValue: 'invite' } } } } }) });
  if (!r.ok) { log(`  invites: query failed (${r.status})`); return 0; }
  const invites = (await r.json()).filter(x => x && x.document).map(x => o.betDocRow(x.document));
  if (!invites.length) return 0;
  const nowKey = bucksWeekKeyCentral();
  const srcCache = {};
  const srcStatus = async id => {
    if (!id) return null;
    if (id in srcCache) return srcCache[id];
    try {
      const s = await fetch(`${o.docs}/bets/${encodeURIComponent(id)}?${o.key}`);
      if (s.status === 404) return (srcCache[id] = 'gone');
      if (!s.ok) return (srcCache[id] = null);
      return (srcCache[id] = o.betDocRow(await s.json()).status);
    } catch { return (srcCache[id] = null); }
  };
  let closed = 0;
  for (const inv of invites) {
    let why = null;
    if (String(inv.wk || '') !== nowKey) why = `raised in the bucks week of ${inv.wk || '?'}`;
    if (!why) {
      for (const l of inv.legs || []) {
        const w = o.legWeek(l && l.mk);
        if (w != null && (await o.weekBegun(inv.season, w)) === true) { why = `week ${w} has kicked off`; break; }
      }
    }
    if (!why) {
      const st = await srcStatus(inv.srcBet);
      if (st && st !== 'open') why = `the bet it was a seat on is ${st}`;
    }
    if (!why) continue;
    log(`  invite ${inv.id} to ${inv.owner} closed: ${why}${o.dry ? ' (dry run)' : ''}`);
    if (o.dry) { closed++; continue; }
    const fields = { status: 'declined', lapsed: '1', settledTs: String(Date.now()) };
    const mask = Object.keys(fields).map(k => `updateMask.fieldPaths=${k}`).join('&');
    const w = await fetch(`${o.docs}/bets/${encodeURIComponent(inv.id)}?${o.key}&${mask}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(o.fsOut(fields)) });
    if (w.ok) closed++; else log(`  invite ${inv.id}: close failed (${w.status})`);
  }
  return closed;
}

/* has a week's football started, off the deployed NFL digest -- null if it
   cannot be read, which is not a yes */
export function weekBegunVia(base) {
  const cache = {};
  return async (season, week) => {
    const k = season + ':' + week;
    if (k in cache && Date.now() - cache[k].at < 60000) return cache[k].v;
    let v = null;
    try {
      const r = await fetch(`${base}?type=nflstate&week=${week}&year=${season}`);
      if (r.ok) { const j = await r.json(); const g = j.games || [];
        v = g.length ? g.some(x => x && (x.s === 'in' || x.s === 'post')) : null; }
    } catch {}
    cache[k] = { v, at: Date.now() };
    return v;
  };
}
