// Final pass: for remaining placeholders, keep 250px thumbnail instead of full-size.
const https = require('https');
const fs    = require('fs');
const path  = require('path');

const DATA   = path.join(__dirname, '..', 'data', 'games.json');
const IMG_DIR = path.join(__dirname, '..', 'images', 'games');
const games  = JSON.parse(fs.readFileSync(DATA, 'utf8'));
const list   = require('./game-list');
const byId   = {};
list.forEach(g => { byId[g.id] = g; });

const sleep = ms => new Promise(r => setTimeout(r, ms));

function getText(url) {
  return new Promise(resolve => {
    const parsed = new URL(url);
    https.get({ hostname: parsed.hostname, path: parsed.pathname + parsed.search, headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'text/html', 'Referer': 'https://en.wikipedia.org/',
    }}, res => {
      if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location)
        return resolve(getText(res.headers.location));
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve({ s: res.statusCode, b: d }));
    }).on('error', () => resolve({ s: 0, b: '' }));
  });
}

function downloadBinary(url, dest) {
  return new Promise(resolve => {
    const p = new URL(url);
    https.get({ hostname: p.hostname, path: p.pathname + p.search, headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'image/*', 'Referer': 'https://en.wikipedia.org/',
    }}, res => {
      if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location)
        return resolve(downloadBinary(res.headers.location, dest));
      if (res.statusCode !== 200) { res.resume(); return resolve(false); }
      const out = fs.createWriteStream(dest);
      res.pipe(out);
      out.on('finish', () => { out.close(); resolve(true); });
      out.on('error', () => resolve(false));
    }).on('error', () => resolve(false));
  });
}

function imgExt(url) { const m = url.match(/\.(png|jpg|jpeg|gif|webp)/i); return m ? '.'+m[1].toLowerCase() : '.jpg'; }

function extractThumb(html) {
  // Get the raw src of first infobox image (with /thumb/ kept — this is the 220px version that works)
  const m = html.match(/class="[^"]*infobox[^"]*"[\s\S]{0,5000}?<img[^>]+src="([^"]+)"[^>]*>/i) ||
            html.match(/<img[^>]+src="(\/\/upload\.wikimedia\.org\/[^"]+)"[^>]*>/i);
  return m ? m[1] : null;
}

async function run() {
  const todo = games.filter(g => g.image === 'images/games/placeholder.svg');
  console.log(`Final pass for ${todo.length} games...\n`);
  let fixed = 0;
  for (const g of todo) {
    const meta = byId[g.id];
    const title = (meta ? meta.wikiTitle : g.title).replace(/ /g, '_');
    process.stdout.write(`[${g.id}] `);
    const { s, b } = await getText(`https://en.wikipedia.org/wiki/${encodeURIComponent(title)}`);
    await sleep(900);
    if (s !== 200) { console.log('skip'); continue; }
    let src = extractThumb(b);
    if (!src) { console.log('no img'); continue; }
    if (src.startsWith('//')) src = 'https:' + src;
    const ext = imgExt(src);
    const dest = path.join(IMG_DIR, g.id + ext);
    const ok = await downloadBinary(src, dest);
    await sleep(700);
    if (ok) { g.image = `images/games/${g.id}${ext}`; console.log(`✓`); fixed++; }
    else console.log('fail');
  }
  fs.writeFileSync(DATA, JSON.stringify(games, null, 2), 'utf8');
  console.log(`\nFixed ${fixed} more. Total with images: ${games.filter(g=>g.image!=='images/games/placeholder.svg').length}/${games.length}`);
}
run().catch(console.error);
