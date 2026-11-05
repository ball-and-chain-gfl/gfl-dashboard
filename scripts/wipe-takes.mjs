/* WIPE LAST WEEK'S HOT TAKES.
 *
 * Hot Takes live in the `messages` collection and last one week. The page asks
 * for the current week's key and nothing else, so last week's leave the page
 * the moment Tuesday 06:00 Central passes; this removes them from the
 * collection as well. It runs in Tuesday's rollover, and every run after the
 * first that lands past the turn finds nothing to do.
 *
 * Only a document carrying a week key other than this week's is deleted.
 * Anything without one is not a take and is left alone. The week is worked
 * out by takesWeekKey, lifted out of app.js, so the page and this cannot
 * disagree about which week it is.
 *
 *   node scripts/wipe-takes.mjs          delete last week's takes
 *   node scripts/wipe-takes.mjs --dry    list what would go, delete nothing
 */
import { lifter, assemble } from './lib/lift.mjs';

const DRY = process.argv.includes('--dry');
const grab = lifter(new URL('../public/app.js', import.meta.url));
const app = assemble(grab, ['const GFL_DB=', 'const TAKES_TZ=', 'function takesWeekKey('], ['GFL_DB', 'takesWeekKey']);
const DOCS = `https://firestore.googleapis.com/v1/projects/${app.GFL_DB.project}/databases/(default)/documents/messages`;
const KEY = `key=${app.GFL_DB.key}`;

/* exitCode rather than process.exit(): exiting straight after a fetch trips a
   libuv assertion on Windows, and letting the process wind down does not */
async function wipe() {
  const thisWeek = app.takesWeekKey();
  let token = '', seen = 0, gone = 0, failed = 0;
  do {
    const r = await fetch(`${DOCS}?${KEY}&pageSize=300${token ? '&pageToken=' + encodeURIComponent(token) : ''}`);
    if (!r.ok) { console.error(`could not list messages: HTTP ${r.status}`); return 1; }
    const j = await r.json();
    for (const d of j.documents || []) {
      seen++;
      const wk = d.fields && d.fields.wk && d.fields.wk.stringValue;
      if (!wk || wk === thisWeek) continue;
      const id = d.name.split('/').pop();
      console.log(`  ${DRY ? 'would delete' : 'delete'} ${id} (week of ${wk})`);
      if (DRY) { gone++; continue; }
      const del = await fetch(`${DOCS}/${id}?${KEY}`, { method: 'DELETE' });
      if (del.ok) gone++; else { failed++; console.log(`  !! HTTP ${del.status}`); }
    }
    token = j.nextPageToken || '';
  } while (token);
  console.log(`hot takes: this week is the week of ${thisWeek}; ${seen} in the collection, `
    + `${gone} ${DRY ? 'would be deleted' : 'deleted'}${failed ? `, ${failed} failed` : ''}`);
  return failed ? 1 : 0;
}
process.exitCode = await wipe();
