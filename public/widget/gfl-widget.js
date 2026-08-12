/* ────────────────────────────────────────────────────────────────────────────
   BALL & CHAIN GFL — iPhone home-screen widget (Scriptable)
   Matchup of the Week plus the New B&C Video badge, whose colour changes each
   week. Display only; tapping opens the dashboard.

   The bootstrap on the phone fetches this file fresh every run, so edits here
   reach the widget without re-pasting anything.
──────────────────────────────────────────────────────────────────────────── */
const API   = 'https://gfl-dashboard.vercel.app/api/widget';
const PROXY = 'https://gfl-dashboard.vercel.app/api/espn?type=logo&url=';
const SITE  = 'https://gfl-dashboard.vercel.app/';
const CREAM = new Color('#f7f8ec');
const DIM   = new Color('#f7f8ec', 0.62);
const FAINT = new Color('#f7f8ec', 0.34);
const CARD  = new Color('#242422');

const fm    = FileManager.local();
const cache = fm.joinPath(fm.cacheDirectory(), 'gfl-widget-cache.json');
const imgDir= fm.joinPath(fm.cacheDirectory(), 'gfl-widget-img');
if (!fm.fileExists(imgDir)) fm.createDirectory(imgDir, true);

/* YouTube blocks datacenter IPs, so the phone checks the feed itself — that's
   what keeps the badge honest about there being a new video. */
async function newestVideo() {
  for (const u of [
    'https://www.youtube.com/feeds/videos.xml?channel_id=UCUoUwKYMkspanOjX5_6d5-Q&hl=en',
    'https://www.youtube.com/feeds/videos.xml?channel_id=UCUoUwKYMkspanOjX5_6d5-Q',
  ]) {
    try {
      const xml = await new Request(u).loadString();
      const e = (xml.match(/<entry>([\s\S]*?)<\/entry>/) || [])[1];
      if (!e) continue;
      const id = (e.match(/<yt:videoId>(.*?)<\/yt:videoId>/) || [])[1];
      if (!id) continue;
      const published = (e.match(/<published>(.*?)<\/published>/) || [])[1] || null;
      return {
        videoId: id,
        published,
        ageDays: published ? Math.max(0, Math.floor((Date.now() - new Date(published)) / 86400000)) : null,
      };
    } catch (err) { /* try the next url */ }
  }
  return null;
}

async function getData() {
  let d = null;
  try { d = await new Request(`${API}?t=${Date.now()}`).loadJSON(); } catch (e) { /* offline */ }
  if (d && d.badge) {
    const live = await newestVideo();
    if (live) d.video = { ...(d.video || {}), ...live };
    fm.writeString(cache, JSON.stringify(d));
    return d;
  }
  try { return JSON.parse(fm.readString(cache)); } catch (e) { return null; }
}

async function logo(team) {
  if (!team || !team.logo) return null;
  const path = fm.joinPath(imgDir, `${team.id}.img`);
  if (fm.fileExists(path)) { try { return fm.readImage(path); } catch (e) {} }
  try {
    const img = await new Request(PROXY + encodeURIComponent(team.logo)).loadImage();
    if (img) { try { fm.writeImage(path, img); } catch (e) {} return img; }
  } catch (e) {}
  return null;
}

function teamRow(stack, team, img, big) {
  const row = stack.addStack();
  row.centerAlignContent();
  if (img) {
    const i = row.addImage(img);
    i.imageSize = new Size(big ? 34 : 26, big ? 34 : 26);
    i.cornerRadius = 7;
    row.addSpacer(10);
  }
  const col = row.addStack();
  col.layoutVertically();
  const n = col.addText(team.name.trim());
  n.font = Font.semiboldSystemFont(big ? 16 : 14);
  n.textColor = CREAM;
  n.lineLimit = 1;
  col.addSpacer(2);
  const s = col.addText(`${team.wins}–${team.losses}  ·  ${Math.round(team.pf)} PF`);
  s.font = Font.systemFont(big ? 12 : 11);
  s.textColor = DIM;
  row.addSpacer();
  return row;
}

async function build() {
  const big = config.widgetFamily !== 'medium' && config.widgetFamily !== 'small';
  const w = new ListWidget();
  w.url = SITE;
  w.backgroundColor = CARD;
  w.setPadding(15, 16, 15, 16);
  w.refreshAfterDate = new Date(Date.now() + 45 * 60 * 1000);

  const d = await getData();
  if (!d) {
    const t = w.addText('Ball & Chain GFL');
    t.font = Font.boldSystemFont(15); t.textColor = CREAM;
    const s = w.addText('No connection');
    s.font = Font.systemFont(12); s.textColor = DIM;
    return w;
  }

  /* badge — a different colour every week */
  const badgeRow = w.addStack();
  badgeRow.centerAlignContent();
  const pill = badgeRow.addStack();
  pill.backgroundColor = new Color(d.badge.color);
  pill.cornerRadius = 9;
  pill.setPadding(4, 10, 4, 10);
  const bt = pill.addText(d.badge.text.toUpperCase());
  bt.font = Font.heavySystemFont(10);
  bt.textColor = new Color('#242422');
  bt.lineLimit = 1;
  badgeRow.addSpacer();
  const v = d.video;
  if (v && (v.ageDays != null || v.ageText)) {
    const age = badgeRow.addText(v.ageText || (v.ageDays === 0 ? 'today' : `${v.ageDays}d ago`));
    age.font = Font.mediumSystemFont(10);
    age.textColor = FAINT;
  }

  w.addSpacer(big ? 16 : 12);

  /* matchup of the week */
  const head = w.addStack();
  head.centerAlignContent();
  const hl = head.addText('MATCHUP OF THE WEEK');
  hl.font = Font.heavySystemFont(10);
  hl.textColor = DIM;
  head.addSpacer();
  const wk = d.matchupWeek || d.week;
  if (wk) {
    const wt = head.addText(`WK ${wk}`);
    wt.font = Font.mediumSystemFont(10);
    wt.textColor = FAINT;
  }

  w.addSpacer(big ? 12 : 9);

  if (d.matchup) {
    const [ia, ib] = await Promise.all([logo(d.matchup.a), logo(d.matchup.b)]);
    teamRow(w, d.matchup.a, ia, big);
    const mid = w.addStack();
    mid.setPadding(big ? 7 : 5, 0, big ? 7 : 5, 0);
    const vs = mid.addText('VS');
    vs.font = Font.heavySystemFont(11);
    vs.textColor = FAINT;
    teamRow(w, d.matchup.b, ib, big);
  } else {
    const none = w.addText('Matchup not set');
    none.font = Font.systemFont(13); none.textColor = DIM;
  }

  if (big) w.addSpacer();
  return w;
}

const widget = await build();
if (config.runsInWidget) Script.setWidget(widget);
else widget.presentLarge();
Script.complete();
