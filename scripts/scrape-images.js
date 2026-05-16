// Scrapes infobox images directly from Wikipedia HTML for placeholder games.
// Usage: node scripts/scrape-images.js

const https = require('https');
const fs    = require('fs');
const path  = require('path');

const DATA   = path.join(__dirname, '..', 'data', 'games.json');
const IMG_DIR = path.join(__dirname, '..', 'images', 'games');
const games  = JSON.parse(fs.readFileSync(DATA, 'utf8'));
const list   = require('./game-list');
const byId   = {};
list.forEach(g => { byId[g.id] = g; });

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function getText(url) {
  return new Promise((resolve) => {
    const parsed = new URL(url);
    https.get({ hostname: parsed.hostname, path: parsed.pathname + parsed.search, headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.9',
    }}, res => {
      if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
        return resolve(getText(res.headers.location));
      }
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    }).on('error', () => resolve({ status: 0, body: '' }));
  });
}

function downloadBinary(url, dest) {
  return new Promise((resolve) => {
    const parsedUrl = new URL(url);
    https.get({ hostname: parsedUrl.hostname, path: parsedUrl.pathname + parsedUrl.search, headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'image/*,*/*;q=0.8',
      'Referer': 'https://en.wikipedia.org/',
    }}, res => {
      if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
        return resolve(downloadBinary(res.headers.location, dest));
      }
      if (res.statusCode !== 200) { res.resume(); return resolve(false); }
      const out = fs.createWriteStream(dest);
      res.pipe(out);
      out.on('finish', () => { out.close(); resolve(true); });
      out.on('error', () => resolve(false));
    }).on('error', () => resolve(false));
  });
}

function imageExt(url) {
  const m = url.match(/\.(png|jpg|jpeg|gif|webp)(\?|$)/i);
  return m ? '.' + m[1].toLowerCase() : '.jpg';
}

// Extract first infobox image src from Wikipedia HTML
function extractInfoboxImage(html) {
  // Look for infobox table first, then take first img src
  const infoboxMatch = html.match(/class="[^"]*infobox[^"]*"[\s\S]{0,5000}?<img[^>]+src="([^"]+)"/i);
  if (infoboxMatch) return infoboxMatch[1];
  // Fallback: first image in the article content
  const imgMatch = html.match(/<img[^>]+src="(\/\/upload\.wikimedia\.org\/[^"]+)"[^>]*>/i);
  if (imgMatch) return imgMatch[1];
  return null;
}

async function run() {
  const placeholders = games.filter(g => g.image === 'images/games/placeholder.svg');
  console.log(`Scraping images for ${placeholders.length} games...\n`);

  let fixed = 0;
  for (const g of placeholders) {
    const meta = byId[g.id];
    const wikiTitle = (meta ? meta.wikiTitle : g.title).replace(/ /g, '_');
    const wikiUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(wikiTitle)}`;

    process.stdout.write(`[${g.id}] `);

    const { status, body } = await getText(wikiUrl);
    await sleep(800);

    if (status !== 200 || !body) { console.log('fetch failed.'); continue; }

    let imgSrc = extractInfoboxImage(body);
    if (!imgSrc) { console.log('no infobox image.'); continue; }

    // Fix protocol-relative URLs
    if (imgSrc.startsWith('//')) imgSrc = 'https:' + imgSrc;

    // Prefer larger size — replace /thumb/ path and strip trailing size segment
    // e.g. //upload.wikimedia.org/wikipedia/en/thumb/a/ab/File.jpg/220px-File.jpg
    // → https://upload.wikimedia.org/wikipedia/en/a/ab/File.jpg
    const thumbMatch = imgSrc.match(/^(https:\/\/upload\.wikimedia\.org\/wikipedia\/[^/]+)\/thumb\/([^/]+\/[^/]+\/[^/]+)\/[^/]+$/);
    if (thumbMatch) {
      imgSrc = `${thumbMatch[1]}/${thumbMatch[2]}`;
    }

    const ext  = imageExt(imgSrc);
    const dest = path.join(IMG_DIR, g.id + ext);

    const ok = await downloadBinary(imgSrc, dest);
    await sleep(600);

    if (ok) {
      g.image = `images/games/${g.id}${ext}`;
      console.log(`✓ ${ext}`);
      fixed++;
    } else {
      console.log('download failed.');
    }
  }

  fs.writeFileSync(DATA, JSON.stringify(games, null, 2), 'utf8');
  console.log(`\nFixed ${fixed} images. Saved games.json.`);
}

run().catch(err => { console.error(err); process.exit(1); });
