/* Writes public/data/videos.json from the channel feed. Runs on GitHub's
   runners (scheduled), because YouTube refuses Vercel's IPs at random and the
   API uses this snapshot as its last-resort fallback. */
import { writeFileSync, mkdirSync } from 'node:fs';

const CHANNEL = 'UCUoUwKYMkspanOjX5_6d5-Q';
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9',
};
const dec = s => String(s || '')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&#39;/g, "'").replace(/&quot;/g, '"');
const pick = (re, s) => (s.match(re) || [])[1] || null;

async function feed() {
  const urls = [
    `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL}&hl=en`,
    `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL}`,
  ];
  for (let i = 0; i < 8; i++) {
    try {
      const r = await fetch(urls[i % urls.length], { headers: HEADERS });
      if (r.ok) {
        const xml = await r.text();
        if (xml.includes('<entry>')) return xml;
      }
    } catch {}
    await new Promise(s => setTimeout(s, 1500));
  }
  return null;
}

const xml = await feed();
if (!xml) { console.error('feed unavailable after retries'); process.exit(1); }

const videos = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].slice(0, 15).map(m => {
  const b = m[1];
  const videoId = pick(/<yt:videoId>(.*?)<\/yt:videoId>/, b);
  if (!videoId) return null;
  return {
    videoId,
    title: dec(pick(/<title>(.*?)<\/title>/, b) || 'Untitled'),
    published: pick(/<published>(.*?)<\/published>/, b),
    thumb: pick(/url="(https:\/\/i\.ytimg[^"]+)"/, b) || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    description: dec(pick(/<media:description>([\s\S]*?)<\/media:description>/, b) || ''),
  };
}).filter(Boolean);

if (!videos.length) { console.error('parsed zero entries'); process.exit(1); }
mkdirSync('public/data', { recursive: true });
writeFileSync('public/data/videos.json', JSON.stringify({ updated: new Date().toISOString(), videos }, null, 1) + '\n');
console.log(`wrote ${videos.length} videos — newest: ${videos[0].title}`);
