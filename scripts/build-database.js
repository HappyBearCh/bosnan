// Fetches Wikipedia summaries + thumbnail images for every game in game-list.js,
// then writes data/games.json and saves images to images/games/.
// Usage: node scripts/build-database.js

const https = require('https');
const http  = require('http');
const fs    = require('fs');
const path  = require('path');
const url   = require('url');

const games    = require('./game-list');
const IMG_DIR  = path.join(__dirname, '..', 'images', 'games');
const OUT_FILE = path.join(__dirname, '..', 'data', 'games.json');

// Load existing games.json so we can preserve any hand-written descriptions
let existing = {};
try {
  const prev = JSON.parse(fs.readFileSync(OUT_FILE, 'utf8'));
  prev.forEach(g => { existing[g.id] = g; });
} catch (_) {}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function get(urlStr) {
  return new Promise((resolve, reject) => {
    const parsed = url.parse(urlStr);
    const lib    = parsed.protocol === 'https:' ? https : http;
    const opts   = {
      hostname : parsed.hostname,
      path     : parsed.path,
      method   : 'GET',
      headers  : {
        'User-Agent': 'BosnanRetroGames/1.0 (educational; node.js)',
        'Accept'    : 'application/json',
      },
    };
    lib.get(opts, res => {
      let data = '';
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(get(res.headers.location));
      }
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    }).on('error', reject);
  });
}

function downloadBinary(urlStr, dest) {
  return new Promise((resolve, reject) => {
    const parsed = url.parse(urlStr);
    const lib    = parsed.protocol === 'https:' ? https : http;
    const opts   = {
      hostname : parsed.hostname,
      path     : parsed.path,
      method   : 'GET',
      headers  : {
        'User-Agent': 'BosnanRetroGames/1.0 (educational; node.js)',
        'Accept'    : 'image/*',
        'Referer'   : 'https://en.wikipedia.org/',
      },
    };
    lib.get(opts, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(downloadBinary(res.headers.location, dest));
      }
      if (res.statusCode !== 200) return resolve(false);
      const out = fs.createWriteStream(dest);
      res.pipe(out);
      out.on('finish', () => { out.close(); resolve(true); });
      out.on('error', reject);
    }).on('error', reject);
  });
}

function imageExt(imgUrl) {
  const m = imgUrl.match(/\.(png|jpg|jpeg|gif|svg|webp)(\?|$)/i);
  return m ? '.' + m[1].toLowerCase() : '.jpg';
}

async function fetchWiki(wikiTitle) {
  const enc = encodeURIComponent(wikiTitle.replace(/ /g, '_'));
  const apiUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${enc}`;
  try {
    const { status, body } = await get(apiUrl);
    if (status !== 200) return null;
    return JSON.parse(body);
  } catch (_) { return null; }
}

function firstSentences(text, n) {
  if (!text) return '';
  // Split on ". " or "." followed by capital letter / end
  const parts = text.match(/[^.!?]+[.!?]+/g) || [text];
  return parts.slice(0, n).join(' ').trim();
}

async function run() {
  fs.mkdirSync(IMG_DIR, { recursive: true });
  const result = [];
  const total  = games.length;

  for (let i = 0; i < total; i++) {
    const g   = games[i];
    const old = existing[g.id];
    console.log(`[${i + 1}/${total}] ${g.title}`);

    // --- Wikipedia summary ---
    const wiki = await fetchWiki(g.wikiTitle);
    await sleep(500); // be polite to Wikipedia API

    let description     = old && old.description     ? old.description     : '';
    let longDescription = old && old.longDescription ? old.longDescription : '';

    if (wiki && wiki.extract) {
      const sents = wiki.extract.match(/[^.!?]+[.!?]+/g) || [];
      if (!description)
        description = sents.slice(0, 3).join(' ').trim();
      if (!longDescription)
        longDescription = sents.slice(0, 6).join(' ').trim();
    }

    // fallback
    if (!description)
      description = `${g.title} is a classic ${g.decade} ${g.genre.toLowerCase()} game developed by ${g.developer} for ${g.platform}.`;
    if (!longDescription)
      longDescription = description;

    // --- Image ---
    let imgPath = old && old.image ? old.image : '';
    let imgFile = path.join(IMG_DIR, g.id + '.jpg');

    // check existing files (any extension)
    const exts = ['.jpg','.png','.gif','.svg','.webp','.jpeg'];
    let alreadyHave = exts.some(e => fs.existsSync(path.join(IMG_DIR, g.id + e)));

    if (!alreadyHave && wiki && wiki.thumbnail && wiki.thumbnail.source) {
      const thumbUrl = wiki.thumbnail.source;
      const ext      = imageExt(thumbUrl);
      imgFile = path.join(IMG_DIR, g.id + ext);
      const ok = await downloadBinary(thumbUrl, imgFile);
      await sleep(300);
      if (ok) {
        console.log(`  ✓ image saved (${ext})`);
        imgPath = `images/games/${g.id}${ext}`;
      } else {
        console.log(`  ✗ image download failed`);
        imgPath = 'images/games/placeholder.svg';
      }
    } else if (alreadyHave && !imgPath) {
      const found = exts.find(e => fs.existsSync(path.join(IMG_DIR, g.id + e)));
      imgPath = `images/games/${g.id}${found}`;
    } else if (!imgPath) {
      imgPath = 'images/games/placeholder.svg';
    }

    result.push({
      id             : g.id,
      title          : g.title,
      year           : g.year,
      decade         : g.decade,
      developer      : g.developer,
      publisher      : g.publisher,
      genre          : g.genre,
      platform       : g.platform,
      image          : imgPath,
      description,
      longDescription,
    });
  }

  fs.writeFileSync(OUT_FILE, JSON.stringify(result, null, 2), 'utf8');
  console.log(`\nDone. ${result.length} games written to ${OUT_FILE}`);
}

run().catch(err => { console.error(err); process.exit(1); });
