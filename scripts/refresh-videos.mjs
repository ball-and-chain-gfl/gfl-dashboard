/* Writes public/data/videos.json from the channel feed. Runs on GitHub's
   runners (scheduled), because YouTube refuses Vercel's IPs at random and the
   API uses this snapshot as its last-resort fallback.

   Tries the RSS feed first (it carries exact publish dates and descriptions),
   then falls back to parsing the channel page, then to the watch pages for the
   newest few descriptions. Exits non-zero only if every route fails, so a bad
   run never overwrites a good snapshot. */
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';

const CHANNEL = 'UCUoUwKYMkspanOjX5_6d5-Q';
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept': '*/*',
};
const OUT = 'public/data/videos.json';
const sleep = ms => new Promise(s => setTimeout(s, ms));
const pick = (re, s) => (s.match(re) || [])[1] || null;
const dec = s => String(s || '')
  .replace(/\\u0026/g, '&').replace(/\\"/g, '"').replace(/\\n/g, ' ')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&#39;/g, "'").replace(/&quot;/g, '"');
const thumb = id => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

async function get(url) {
  try {
    const r = await fetch(url, { headers: HEADERS });
    return r.ok ? await r.text() : null;
  } catch { return null; }
}

async function fromRSS() {
  const urls = [
    `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL}&hl=en`,
    `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL}`,
  ];
  for (let i = 0; i < 8; i++) {
    const xml = await get(urls[i % urls.length]);
    if (xml && xml.includes('<entry>')) {
      const list = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].slice(0, 15).map(m => {
        const b = m[1];
        const videoId = pick(/<yt:videoId>(.*?)<\/yt:videoId>/, b);
        if (!videoId) return null;
        return {
          videoId,
          title: dec(pick(/<title>(.*?)<\/title>/, b) || 'Untitled'),
          published: pick(/<published>(.*?)<\/published>/, b),
          thumb: pick(/url="(https:\/\/i\.ytimg[^"]+)"/, b) || thumb(videoId),
          description: dec(pick(/<media:description>([\s\S]*?)<\/media:description>/, b) || ''),
        };
      }).filter(Boolean);
      if (list.length) { console.log('source: rss'); return list; }
    }
    await sleep(1200);
  }
  return null;
}

async function fromChannelPage() {
  const urls = [
    `https://www.youtube.com/channel/${CHANNEL}/videos?hl=en`,
    `https://m.youtube.com/channel/${CHANNEL}/videos?hl=en`,
  ];
  for (let i = 0; i < 4; i++) {
    const html = await get(urls[i % urls.length]);
    if (html) {
      const out = [], seen = new Set();
      const re = /"videoId":"([\w-]{11})"/g;
      let m;
      while ((m = re.exec(html)) && out.length < 15) {
        const id = m[1];
        if (seen.has(id)) continue;
        const win = html.slice(m.index, m.index + 1600);
        const title = pick(/"title":\{"runs":\[\{"text":"((?:[^"\\]|\\.)*)"/, win) ||
                      pick(/"title":\{"simpleText":"((?:[^"\\]|\\.)*)"/, win);
        if (!title) continue;
        seen.add(id);
        out.push({ videoId: id, title: dec(title), published: null,
                   ageText: pick(/"publishedTimeText":\{"simpleText":"([^"]+)"/, win),
                   thumb: thumb(id), description: '' });
      }
      if (out.length) {
        console.log('source: channel page');
        // descriptions matter for matchup detection — fill the newest few
        for (const v of out.slice(0, 3)) {
          const w = await get(`https://www.youtube.com/watch?v=${v.videoId}&hl=en`);
          if (w) v.description = dec(pick(/"shortDescription":"((?:[^"\\]|\\.)*)"/, w) || '');
          await sleep(400);
        }
        return out;
      }
    }
    await sleep(1500);
  }
  return null;
}

/* GitHub's runners are blocked by YouTube as well, but Vercel's aren't — so if
   the direct routes fail, read through our own endpoint (fresh=1 makes it skip
   this very snapshot, so we never copy the file onto itself). */
async function fromOwnApi() {
  for (let i = 0; i < 4; i++) {
    const txt = await get(`https://gfl-dashboard.vercel.app/api/espn?type=youtube&fresh=1&n=${Date.now()}`);
    if (txt) {
      try {
        const j = JSON.parse(txt);
        if (j.videos && j.videos.length && j.source && j.source !== 'snapshot') {
          console.log('source: own api (' + j.source + ')');
          return j.videos;
        }
      } catch {}
    }
    await sleep(2500);
  }
  return null;
}

const videos = (await fromRSS()) || (await fromChannelPage()) || (await fromOwnApi());
if (!videos || !videos.length) {
  console.error('every source failed — leaving the existing snapshot alone');
  process.exit(existsSync(OUT) ? 0 : 1);   // don't fail the job if we already have data
}

mkdirSync('public/data', { recursive: true });
const prev = existsSync(OUT) ? readFileSync(OUT, 'utf8') : '';
const next = JSON.stringify({ updated: new Date().toISOString(), videos }, null, 1) + '\n';
// only rewrite when the video list actually changed, so the timestamp alone
// doesn't create a commit every six hours
const strip = s => { try { const j = JSON.parse(s); return JSON.stringify(j.videos); } catch { return null; } };
if (strip(prev) === strip(next)) { console.log('snapshot already current — no change'); process.exit(0); }
writeFileSync(OUT, next);
console.log(`wrote ${videos.length} videos — newest: ${videos[0].title}`);
