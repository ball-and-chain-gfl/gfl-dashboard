/* ────────────────────────────────────────────────────────────────────────────
   BALL & CHAIN GFL — iPhone home-screen widget (Scriptable)
   Large widget: newest B&C video as the backdrop, a badge whose colour rotates
   every week, the video title, and the league line underneath.

   This file is fetched fresh by the bootstrap script on the phone, so edits
   here reach every phone without anyone re-pasting anything.
──────────────────────────────────────────────────────────────────────────── */
const API   = 'https://gfl-dashboard.vercel.app/api/widget';
const SITE  = 'https://gfl-dashboard.vercel.app/';
const CREAM = new Color('#f7f8ec');
const INK   = new Color('#242422');

const fm    = FileManager.local();
const cache = fm.joinPath(fm.cacheDirectory(), 'gfl-widget-cache.json');
const imgDir= fm.joinPath(fm.cacheDirectory(), 'gfl-widget-img');
if (!fm.fileExists(imgDir)) fm.createDirectory(imgDir, true);

/* YouTube blocks datacenter IPs (Vercel, GitHub, everything), but a phone on
   wifi or cellular reads the feed fine — so ask YouTube directly here and treat
   the API's copy as the fallback rather than the source of truth. */
async function newestFromYouTube() {
  const urls = [
    'https://www.youtube.com/feeds/videos.xml?channel_id=UCUoUwKYMkspanOjX5_6d5-Q&hl=en',
    'https://www.youtube.com/feeds/videos.xml?channel_id=UCUoUwKYMkspanOjX5_6d5-Q',
  ];
  for (const u of urls) {
    try {
      const xml = await new Request(u).loadString();
      const entry = (xml.match(/<entry>([\s\S]*?)<\/entry>/) || [])[1];
      if (!entry) continue;
      const id = (entry.match(/<yt:videoId>(.*?)<\/yt:videoId>/) || [])[1];
      if (!id) continue;
      const dec = t => String(t || '').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"');
      const published = (entry.match(/<published>(.*?)<\/published>/) || [])[1] || null;
      return {
        videoId: id,
        title: dec((entry.match(/<title>(.*?)<\/title>/) || [])[1] || 'Untitled'),
        published,
        ageDays: published ? Math.max(0, Math.floor((Date.now() - new Date(published)) / 86400000)) : null,
        ageText: null,
        thumb: `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`,
        thumbFallback: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
      };
    } catch (e) { /* try the next url */ }
  }
  return null;
}

async function getData() {
  let d = null;
  try {
    d = await new Request(`${API}?t=${Date.now()}`).loadJSON();
  } catch (e) { /* offline — cached copy below */ }
  if (d && d.badge) {
    const live = await newestFromYouTube();
    if (live) d.video = live;                     // phone-fresh beats server-cached
    fm.writeString(cache, JSON.stringify(d));
    return d;
  }
  try { return JSON.parse(fm.readString(cache)); } catch (e) { return null; }
}

async function getImage(v) {
  if (!v) return null;
  const path = fm.joinPath(imgDir, `${v.videoId}.jpg`);
  if (fm.fileExists(path)) { try { return fm.readImage(path); } catch (e) {} }
  for (const url of [v.thumb, v.thumbFallback].filter(Boolean)) {
    try {
      const img = await new Request(url).loadImage();
      if (img) { try { fm.writeImage(path, img); } catch (e) {} return img; }
    } catch (e) { /* try the fallback */ }
  }
  return null;
}

/* darken the thumbnail so cream text stays readable, heavier toward the bottom */
function scrim(img, w, h) {
  const dc = new DrawContext();
  dc.size = new Size(w, h);
  dc.opaque = false;
  dc.respectScreenScale = true;
  dc.drawImageInRect(img, new Rect(0, 0, w, h));
  dc.setFillColor(new Color('#101014', 0.34));
  dc.fillRect(new Rect(0, 0, w, h));
  const bands = 26;
  for (let i = 0; i < bands; i++) {
    const a = 0.03 + 0.62 * Math.pow(i / bands, 2.1);
    dc.setFillColor(new Color('#0b0b0e', a));
    dc.fillRect(new Rect(0, h - (h * 0.62) + (i * (h * 0.62) / bands), w, h * 0.62 / bands + 1));
  }
  return dc.getImage();
}

function pill(stack, text, hex) {
  const p = stack.addStack();
  p.backgroundColor = new Color(hex);
  p.cornerRadius = 9;
  p.setPadding(4, 9, 4, 9);
  const t = p.addText(text.toUpperCase());
  t.font = Font.heavySystemFont(10);
  t.textColor = INK;
  t.lineLimit = 1;
  return p;
}

async function build() {
  const w = new ListWidget();
  w.url = SITE;
  w.setPadding(14, 15, 13, 15);
  w.refreshAfterDate = new Date(Date.now() + 45 * 60 * 1000);

  const d = await getData();
  if (!d) {
    w.backgroundColor = INK;
    const t = w.addText('Ball & Chain GFL');
    t.font = Font.boldSystemFont(16); t.textColor = CREAM;
    const s = w.addText('No connection');
    s.font = Font.systemFont(12); s.textColor = new Color('#f7f8ec', 0.6);
    return w;
  }

  const v = d.video;
  const img = await getImage(v);
  const size = config.widgetFamily === 'medium' ? new Size(364, 170) : new Size(364, 364);
  if (img) w.backgroundImage = scrim(img, size.width, size.height);
  else w.backgroundColor = INK;

  /* top line: brand + week */
  const top = w.addStack();
  top.centerAlignContent();
  const brand = top.addText('BALL & CHAIN GFL');
  brand.font = Font.heavySystemFont(10);
  brand.textColor = new Color('#f7f8ec', 0.72);
  top.addSpacer();
  if (d.week) {
    const wk = top.addText(`WEEK ${d.week}`);
    wk.font = Font.mediumSystemFont(10);
    wk.textColor = new Color('#f7f8ec', 0.6);
  }

  w.addSpacer();

  /* the badge, in this week's colour */
  const badgeRow = w.addStack();
  pill(badgeRow, d.badge.text, d.badge.color);
  badgeRow.addSpacer();
  if (v && (v.ageText || v.ageDays != null)) {
    const age = badgeRow.addText(v.ageText || (v.ageDays === 0 ? 'today' : `${v.ageDays}d ago`));
    age.font = Font.mediumSystemFont(10);
    age.textColor = new Color('#f7f8ec', 0.66);
  }

  w.addSpacer(7);

  /* video title */
  const title = w.addText(v ? v.title : 'Ball & Chain GFL');
  title.font = Font.boldSystemFont(config.widgetFamily === 'medium' ? 15 : 19);
  title.textColor = CREAM;
  title.lineLimit = config.widgetFamily === 'medium' ? 2 : 3;
  title.shadowColor = new Color('#000000', 0.6);
  title.shadowRadius = 4;

  /* league line: the matchup if we could detect one, otherwise the top of the table */
  if (config.widgetFamily !== 'medium') {
    w.addSpacer(9);
    const line = w.addStack();
    line.centerAlignContent();
    if (d.matchup) {
      const a = d.matchup.a, b = d.matchup.b;
      const l = line.addText(`${a.name}  ${a.wins}–${a.losses}`);
      l.font = Font.semiboldSystemFont(11); l.textColor = new Color('#f7f8ec', 0.9); l.lineLimit = 1;
      const vs = line.addText('   vs   ');
      vs.font = Font.mediumSystemFont(11); vs.textColor = new Color('#f7f8ec', 0.5);
      const r = line.addText(`${b.name}  ${b.wins}–${b.losses}`);
      r.font = Font.semiboldSystemFont(11); r.textColor = new Color('#f7f8ec', 0.9); r.lineLimit = 1;
    } else if (d.standings && d.standings.length) {
      d.standings.slice(0, 3).forEach((t, i) => {
        if (i) { const dot = line.addText('  ·  '); dot.font = Font.mediumSystemFont(11); dot.textColor = new Color('#f7f8ec', 0.4); }
        const s = line.addText(`${i + 1}. ${t.name.split(' ').slice(-1)[0]} ${t.wins}–${t.losses}`);
        s.font = Font.semiboldSystemFont(11); s.textColor = new Color('#f7f8ec', 0.85); s.lineLimit = 1;
      });
    }
  }
  return w;
}

const widget = await build();
if (config.runsInWidget) Script.setWidget(widget);
else widget.presentLarge();
Script.complete();
