// Retries image download for placeholder games using Wikipedia Action API.
// Usage: node scripts/retry-images.js

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

function getJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        'User-Agent': 'BosnanRetroGames/1.0 (educational)',
        'Accept': 'application/json',
      }
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: null }); }
      });
    }).on('error', reject);
  });
}

function downloadBinary(url, dest) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        'User-Agent': 'BosnanRetroGames/1.0 (educational)',
        'Accept': 'image/*',
        'Referer': 'https://en.wikipedia.org/',
      }
    }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
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

function imageExt(imgUrl) {
  const m = imgUrl.match(/\.(png|jpg|jpeg|gif|svg|webp)(\?|$)/i);
  return m ? '.' + m[1].toLowerCase() : '.jpg';
}

async function getWikiImage(wikiTitle) {
  const enc = encodeURIComponent(wikiTitle);
  // Action API: pageimages prop
  const url = `https://en.wikipedia.org/w/api.php?action=query&titles=${enc}&prop=pageimages&format=json&pithumbsize=400`;
  const { body } = await getJson(url);
  if (!body || !body.query || !body.query.pages) return null;
  const page = Object.values(body.query.pages)[0];
  return page && page.thumbnail ? page.thumbnail.source : null;
}

async function run() {
  const placeholders = games.filter(g => g.image === 'images/games/placeholder.svg');
  console.log(`Retrying ${placeholders.length} games with placeholder images...\n`);

  let fixed = 0;
  for (const g of placeholders) {
    const meta = byId[g.id];
    const wikiTitle = meta ? meta.wikiTitle : g.title;
    process.stdout.write(`[${g.id}] Fetching...`);

    const thumbUrl = await getWikiImage(wikiTitle);
    await sleep(400);

    if (!thumbUrl) { console.log(' no image.'); continue; }

    const ext  = imageExt(thumbUrl);
    const dest = path.join(IMG_DIR, g.id + ext);
    const ok   = await downloadBinary(thumbUrl, dest);
    await sleep(400);

    if (ok) {
      g.image = `images/games/${g.id}${ext}`;
      console.log(` ✓ saved (${ext})`);
      fixed++;
    } else {
      console.log(' ✗ download failed.');
    }
  }

  fs.writeFileSync(DATA, JSON.stringify(games, null, 2), 'utf8');
  console.log(`\nFixed ${fixed} of ${placeholders.length} placeholder images.`);
}

run().catch(err => { console.error(err); process.exit(1); });
