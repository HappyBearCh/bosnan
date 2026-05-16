// Adds curated new games from multiple platforms, fetches Wikipedia descriptions + images.
// Usage: node scripts/expand-games.js
// Skips any game already present in games.json (by id or title match).

const https = require('https');
const fs    = require('fs');
const path  = require('path');

const DATA    = path.join(__dirname, '..', 'data', 'games.json');
const IMG_DIR = path.join(__dirname, '..', 'images', 'games');
const games   = JSON.parse(fs.readFileSync(DATA, 'utf8'));

const existingIds    = new Set(games.map(g => g.id));
const existingTitles = new Set(games.map(g => g.title.toLowerCase()));

const sleep = ms => new Promise(r => setTimeout(r, ms));

function makeId(title) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// ── Curated list of games to add ───────────────────────────────────────────
const WANT = [
  // NES
  { title:'Super Mario Bros.',        wikiTitle:'Super Mario Bros.',                         platform:'NES',                   decade:'1980s', genre:'Platform' },
  { title:'Super Mario Bros. 2',      wikiTitle:'Super Mario Bros. 2',                       platform:'NES',                   decade:'1980s', genre:'Platform' },
  { title:'Super Mario Bros. 3',      wikiTitle:'Super Mario Bros. 3',                       platform:'NES',                   decade:'1980s', genre:'Platform' },
  { title:'The Legend of Zelda',      wikiTitle:'The Legend of Zelda (video game)',           platform:'NES',                   decade:'1980s', genre:'Action-Adventure' },
  { title:'Zelda II',                 wikiTitle:'Zelda II: The Adventure of Link',            platform:'NES',                   decade:'1980s', genre:'Action-RPG' },
  { title:'Ninja Gaiden',             wikiTitle:'Ninja Gaiden (NES video game)',              platform:'NES',                   decade:'1980s', genre:'Action' },
  { title:"Kirby's Adventure",        wikiTitle:"Kirby's Adventure",                         platform:'NES',                   decade:'1980s', genre:'Platform' },
  { title:'Duck Hunt',                wikiTitle:'Duck Hunt',                                  platform:'NES',                   decade:'1980s', genre:'Light Gun Shooter' },
  { title:'Final Fantasy',            wikiTitle:'Final Fantasy (video game)',                 platform:'NES',                   decade:'1980s', genre:'RPG' },
  { title:'Gradius',                  wikiTitle:'Gradius (video game)',                       platform:'Arcade / NES',          decade:'1980s', genre:'Shooter' },
  { title:'Life Force',               wikiTitle:'Life Force (video game)',                    platform:'Arcade / NES',          decade:'1980s', genre:'Shooter' },
  { title:'Battletoads',              wikiTitle:'Battletoads (video game)',                   platform:'NES',                   decade:'1980s', genre:'Beat \'em up' },
  { title:'Teenage Mutant Ninja Turtles', wikiTitle:'Teenage Mutant Ninja Turtles (NES video game)', platform:'NES',          decade:'1980s', genre:'Action' },
  { title:'Rygar',                    wikiTitle:'Rygar (video game)',                         platform:'Arcade / NES',          decade:'1980s', genre:'Action' },
  { title:'Contra',                   wikiTitle:'Contra (video game)',                        platform:'Arcade / NES',          decade:'1980s', genre:'Run and Gun' },
  { title:'Castlevania',              wikiTitle:'Castlevania (video game)',                   platform:'NES',                   decade:'1980s', genre:'Action' },

  // Atari 2600
  { title:'Adventure',                wikiTitle:'Adventure (Atari 2600)',                     platform:'Atari 2600',            decade:'1970s', genre:'Action-Adventure' },
  { title:'Space Invaders (Atari)',   wikiTitle:'Space Invaders (Atari 2600)',                platform:'Atari 2600',            decade:'1970s', genre:'Fixed Shooter' },
  { title:'Missile Command (Atari)',  wikiTitle:'Missile Command',                            platform:'Arcade / Atari 2600',   decade:'1980s', genre:'Fixed Shooter' },
  { title:"Yars' Revenge",            wikiTitle:"Yars' Revenge",                              platform:'Atari 2600',            decade:'1980s', genre:'Shooter' },
  { title:'Pitfall!',                 wikiTitle:'Pitfall!',                                   platform:'Atari 2600',            decade:'1980s', genre:'Platform' },
  { title:'River Raid',               wikiTitle:'River Raid',                                 platform:'Atari 2600',            decade:'1980s', genre:'Shooter' },
  { title:'Kaboom!',                  wikiTitle:'Kaboom! (video game)',                       platform:'Atari 2600',            decade:'1980s', genre:'Action' },
  { title:'Combat',                   wikiTitle:'Combat (Atari 2600)',                        platform:'Atari 2600',            decade:'1970s', genre:'Action' },
  { title:'Haunted House',            wikiTitle:'Haunted House (video game)',                 platform:'Atari 2600',            decade:'1980s', genre:'Action-Adventure' },
  { title:'Warlords',                 wikiTitle:'Warlords (video game)',                      platform:'Arcade / Atari 2600',   decade:'1980s', genre:'Action' },
  { title:'Enduro',                   wikiTitle:'Enduro (video game)',                        platform:'Atari 2600',            decade:'1980s', genre:'Racing' },
  { title:'Pitfall II',               wikiTitle:'Pitfall II: Lost Caverns',                  platform:'Atari 2600',            decade:'1980s', genre:'Platform' },

  // Commodore 64
  { title:'The Last Ninja',           wikiTitle:'The Last Ninja',                             platform:'Commodore 64',          decade:'1980s', genre:'Action-Adventure' },
  { title:'California Games',         wikiTitle:'California Games',                           platform:'Commodore 64 / Multiple',decade:'1980s',genre:'Sports' },
  { title:'Pirates!',                 wikiTitle:'Pirates! (video game)',                      platform:'Commodore 64 / Multiple',decade:'1980s',genre:'Strategy' },
  { title:'M.U.L.E.',                 wikiTitle:'M.U.L.E.',                                  platform:'Commodore 64 / Multiple',decade:'1980s',genre:'Strategy' },
  { title:'Elite',                    wikiTitle:'Elite (video game)',                         platform:'Commodore 64 / Multiple',decade:'1980s',genre:'Space Trading' },
  { title:'Boulder Dash',             wikiTitle:'Boulder Dash',                               platform:'Commodore 64 / Multiple',decade:'1980s',genre:'Puzzle' },
  { title:'Jumpman',                  wikiTitle:'Jumpman (video game)',                       platform:'Commodore 64',          decade:'1980s', genre:'Platform' },
  { title:'Winter Games',             wikiTitle:'Winter Games',                               platform:'Commodore 64 / Multiple',decade:'1980s',genre:'Sports' },
  { title:'Ghostbusters (C64)',       wikiTitle:'Ghostbusters (1984 video game)',             platform:'Commodore 64 / Multiple',decade:'1980s',genre:'Action' },
  { title:'Zak McKracken',            wikiTitle:'Zak McKracken and the Alien Mindbenders',    platform:'Commodore 64 / PC',     decade:'1980s', genre:'Point-and-Click Adventure' },
  { title:'Raid on Bungeling Bay',    wikiTitle:'Raid on Bungeling Bay',                     platform:'Commodore 64',          decade:'1980s', genre:'Action' },
  { title:'Bruce Lee',                wikiTitle:'Bruce Lee (video game)',                     platform:'Commodore 64 / Multiple',decade:'1980s',genre:'Action' },

  // ZX Spectrum
  { title:'Manic Miner',              wikiTitle:'Manic Miner',                               platform:'ZX Spectrum',           decade:'1980s', genre:'Platform' },
  { title:'Jet Set Willy',            wikiTitle:'Jet Set Willy',                             platform:'ZX Spectrum',           decade:'1980s', genre:'Platform' },
  { title:'Knight Lore',              wikiTitle:'Knight Lore',                               platform:'ZX Spectrum',           decade:'1980s', genre:'Action-Adventure' },
  { title:'Sabre Wulf',               wikiTitle:'Sabre Wulf',                               platform:'ZX Spectrum',           decade:'1980s', genre:'Action-Adventure' },
  { title:'Head Over Heels',          wikiTitle:'Head Over Heels (video game)',               platform:'ZX Spectrum / Multiple',decade:'1980s', genre:'Action-Adventure' },
  { title:'Skool Daze',               wikiTitle:'Skool Daze',                               platform:'ZX Spectrum',           decade:'1980s', genre:'Strategy' },
  { title:'Lords of Midnight',        wikiTitle:'The Lords of Midnight',                     platform:'ZX Spectrum',           decade:'1980s', genre:'Strategy' },
  { title:'Dizzy',                    wikiTitle:'Dizzy (video game)',                        platform:'ZX Spectrum / Commodore 64',decade:'1980s',genre:'Platform' },
  { title:'Atic Atac',                wikiTitle:'Atic Atac',                                 platform:'ZX Spectrum',           decade:'1980s', genre:'Action' },

  // Sega Master System
  { title:'Alex Kidd in Miracle World',wikiTitle:'Alex Kidd in Miracle World',              platform:'Sega Master System',    decade:'1980s', genre:'Platform' },
  { title:'Phantasy Star',             wikiTitle:'Phantasy Star',                            platform:'Sega Master System',    decade:'1980s', genre:'RPG' },
  { title:'Wonder Boy',                wikiTitle:'Wonder Boy (video game)',                  platform:'Arcade / Sega Master System',decade:'1980s',genre:'Platform' },
  { title:'Hang-On',                   wikiTitle:'Hang-On',                                  platform:'Arcade / Sega Master System',decade:'1980s',genre:'Racing' },
  { title:'Wonder Boy in Monster Land',wikiTitle:'Wonder Boy in Monster Land',              platform:'Arcade / Sega Master System',decade:'1980s',genre:'Action-Adventure' },
  { title:'Shinobi',                   wikiTitle:'Shinobi (video game)',                     platform:'Arcade / Sega Master System',decade:'1980s',genre:'Action' },
  { title:'Fantasy Zone (SMS)',         wikiTitle:'Fantasy Zone',                            platform:'Arcade / Sega Master System',decade:'1980s',genre:'Shooter' },

  // Apple II
  { title:'The Oregon Trail',          wikiTitle:'The Oregon Trail (1985 video game)',       platform:'Apple II / Multiple',   decade:'1980s', genre:'Simulation' },
  { title:'Ultima',                    wikiTitle:'Ultima (video game)',                      platform:'Apple II / Multiple',   decade:'1980s', genre:'RPG' },
  { title:'Wizardry',                  wikiTitle:'Wizardry: Proving Grounds of the Mad Overlord', platform:'Apple II',        decade:'1980s', genre:'RPG' },
  { title:'Karateka',                  wikiTitle:'Karateka (video game)',                    platform:'Apple II / Multiple',   decade:'1980s', genre:'Fighting' },
  { title:'Choplifter',                wikiTitle:'Choplifter',                               platform:'Apple II / Multiple',   decade:'1980s', genre:'Action' },
  { title:'Castle Wolfenstein',        wikiTitle:'Castle Wolfenstein',                       platform:'Apple II / Multiple',   decade:'1980s', genre:'Stealth Action' },

  // PC / DOS
  { title:'SimCity',                   wikiTitle:'SimCity (1989 video game)',                platform:'PC/DOS / Multiple',     decade:'1980s', genre:'Simulation' },
  { title:'Wing Commander',            wikiTitle:'Wing Commander (video game)',              platform:'PC/DOS',                decade:'1980s', genre:'Space Combat' },
  { title:'Zork',                      wikiTitle:'Zork',                                    platform:'PC/DOS / Multiple',     decade:'1970s', genre:'Text Adventure' },
  { title:'Leisure Suit Larry',        wikiTitle:'Leisure Suit Larry in the Land of the Lounge Lizards', platform:'PC/DOS', decade:'1980s', genre:'Adventure' },
  { title:'Ultima IV',                 wikiTitle:'Ultima IV: Quest of the Avatar',          platform:'PC/DOS / Multiple',     decade:'1980s', genre:'RPG' },
  { title:'Wasteland',                 wikiTitle:'Wasteland (video game)',                   platform:'PC/DOS',                decade:'1980s', genre:'RPG' },
  { title:'Space Quest',               wikiTitle:'Space Quest: The Sarien Encounter',       platform:'PC/DOS',                decade:'1980s', genre:'Adventure' },
  { title:'Sid Meier\'s Pirates!',     wikiTitle:"Sid Meier's Pirates!",                    platform:'PC/DOS / Multiple',     decade:'1980s', genre:'Strategy' },

  // More Arcade
  { title:"Q*bert",                    wikiTitle:"Q*bert",                                  platform:'Arcade',                decade:'1980s', genre:'Platform' },
  { title:'Defender',                  wikiTitle:'Defender (1981 video game)',               platform:'Arcade',                decade:'1980s', genre:'Shooter' },
  { title:'Tempest',                   wikiTitle:'Tempest (video game)',                     platform:'Arcade',                decade:'1980s', genre:'Shooter' },
  { title:'Zaxxon',                    wikiTitle:'Zaxxon',                                   platform:'Arcade',                decade:'1980s', genre:'Isometric Shooter' },
  { title:"Dragon's Lair",             wikiTitle:"Dragon's Lair (video game)",               platform:'Arcade',                decade:'1980s', genre:'Interactive Movie' },
  { title:'Elevator Action',           wikiTitle:'Elevator Action',                          platform:'Arcade',                decade:'1980s', genre:'Action' },
  { title:'Tapper',                    wikiTitle:'Tapper (video game)',                      platform:'Arcade',                decade:'1980s', genre:'Action' },
  { title:'Battlezone',                wikiTitle:'Battlezone (1980 video game)',             platform:'Arcade',                decade:'1980s', genre:'Shooter' },
  { title:'Crystal Castles',           wikiTitle:'Crystal Castles (video game)',             platform:'Arcade',                decade:'1980s', genre:'Platform' },
  { title:'Mappy',                     wikiTitle:'Mappy',                                    platform:'Arcade',                decade:'1980s', genre:'Platform' },
  { title:'Star Wars (Arcade)',        wikiTitle:'Star Wars (1983 video game)',              platform:'Arcade',                decade:'1980s', genre:'Space Shooter' },
  { title:'Wizard of Wor',             wikiTitle:'Wizard of Wor',                            platform:'Arcade',                decade:'1980s', genre:'Shooter' },
  { title:'Phoenix',                   wikiTitle:'Phoenix (video game)',                     platform:'Arcade',                decade:'1970s', genre:'Fixed Shooter' },
  { title:'Pengo',                     wikiTitle:'Pengo (video game)',                       platform:'Arcade',                decade:'1980s', genre:'Action' },
  { title:'Venture',                   wikiTitle:'Venture (video game)',                     platform:'Arcade',                decade:'1980s', genre:'Action-Adventure' },
  { title:'Congo Bongo',               wikiTitle:'Congo Bongo',                              platform:'Arcade',                decade:'1980s', genre:'Platform' },
  { title:'Punch-Out!!',               wikiTitle:'Punch-Out!! (arcade game)',                platform:'Arcade',                decade:'1980s', genre:'Boxing' },
  { title:'1942',                      wikiTitle:'1942 (video game)',                        platform:'Arcade',                decade:'1980s', genre:'Shooter' },
  { title:'1943',                      wikiTitle:'1943: The Battle of Midway',               platform:'Arcade',                decade:'1980s', genre:'Shooter' },
  { title:'Commando',                  wikiTitle:'Commando (video game)',                    platform:'Arcade',                decade:'1980s', genre:'Run and Gun' },
  { title:'Rastan',                    wikiTitle:'Rastan',                                   platform:'Arcade',                decade:'1980s', genre:'Action' },
  { title:'Tiger-Heli',                wikiTitle:'Tiger-Heli',                               platform:'Arcade',                decade:'1980s', genre:'Shooter' },
  { title:'Shao-lin\'s Road',          wikiTitle:"Shao-lin's Road",                         platform:'Arcade',                decade:'1980s', genre:'Beat \'em up' },
  { title:'City Connection',           wikiTitle:'City Connection',                          platform:'Arcade',                decade:'1980s', genre:'Racing' },
  { title:'Bubble Burst',              wikiTitle:'Bubble Burst',                             platform:'Arcade',                decade:'1980s', genre:'Action' },
  { title:'Terra Cresta',              wikiTitle:'Terra Cresta',                             platform:'Arcade',                decade:'1980s', genre:'Shooter' },
  { title:'Side Arms',                 wikiTitle:'Side Arms: Hyper Dyne',                   platform:'Arcade',                decade:'1980s', genre:'Shooter' },
  { title:'Gradius II',                wikiTitle:'Gradius II',                               platform:'Arcade',                decade:'1980s', genre:'Shooter' },
  { title:'R-Type',                    wikiTitle:'R-Type',                                   platform:'Arcade',                decade:'1980s', genre:'Shooter' },
  { title:'Darius',                    wikiTitle:'Darius (video game)',                      platform:'Arcade',                decade:'1980s', genre:'Shooter' },
  { title:'Contra (arcade)',           wikiTitle:'Contra (video game)',                      platform:'Arcade',                decade:'1980s', genre:'Run and Gun' },
];

// ── Wikipedia helpers ──────────────────────────────────────────────────────

function get(url) {
  return new Promise(resolve => {
    const parsed = new URL(url);
    https.get({
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
        'Referer': 'https://en.wikipedia.org/',
      }
    }, res => {
      if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location)
        return resolve(get(res.headers.location));
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, body: d }));
    }).on('error', () => resolve({ status: 0, body: '' }));
  });
}

function downloadBinary(url, dest) {
  return new Promise(resolve => {
    const p = new URL(url);
    https.get({
      hostname: p.hostname,
      path: p.pathname + p.search,
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Accept': 'image/*',
        'Referer': 'https://en.wikipedia.org/',
      }
    }, res => {
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

function firstNSentences(text, n) {
  if (!text) return '';
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [];
  return sentences.slice(0, n).join(' ').trim() || text.substring(0, 400);
}

function imgExt(url) {
  const m = url.match(/\.(png|jpg|jpeg|gif|webp)/i);
  return m ? '.' + m[1].toLowerCase() : '.jpg';
}

function extractThumb(html) {
  const m = html.match(/class="[^"]*infobox[^"]*"[\s\S]{0,5000}?<img[^>]+src="([^"]+)"/i)
         || html.match(/<img[^>]+src="(\/\/upload\.wikimedia\.org\/[^"]+)"/i);
  return m ? m[1] : null;
}

function cleanWiki(val) {
  return val
    .replace(/\[\[([^\]|]+\|)?([^\]]+)\]\]/g, '$2')
    .replace(/\{\{[^}]*\}\}/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/<!--.*?-->/g, '')
    .replace(/\[\[|\]\]/g, '')
    .replace(/&nbsp;/g, ' ')
    .trim()
    .split(/\s*[,;/|]\s*/)[0]
    .trim();
}

async function fetchGameData(entry) {
  const slug = encodeURIComponent(entry.wikiTitle.replace(/ /g, '_'));

  // 1. REST API summary
  const { status, body } = await get(`https://en.wikipedia.org/api/rest_v1/page/summary/${slug}`);
  await sleep(600);
  if (status !== 200) return null;

  let summary;
  try { summary = JSON.parse(body); } catch { return null; }

  // 2. Infobox wikitext for structured fields
  const { body: wtBody } = await get(
    `https://en.wikipedia.org/w/api.php?action=parse&page=${slug}&prop=wikitext&format=json&section=0`
  );
  await sleep(600);
  let year = entry.year || null;
  let developer = entry.developer || 'Unknown';
  let publisher = entry.publisher || 'Unknown';

  try {
    const wt = JSON.parse(wtBody).parse?.wikitext?.['*'] || '';
    const yearM = wt.match(/\|\s*(?:release[ds]?|year|introduced)\s*=\s*[\s\S]{0,200}?(\b(?:19[5-9]\d|198\d|197\d|196\d)\b)/i);
    if (yearM) year = parseInt(yearM[1]);
    const devM  = wt.match(/\|\s*developer\s*=\s*([^\n|}{]{2,60})/i);
    if (devM)  developer  = cleanWiki(devM[1]) || developer;
    const pubM  = wt.match(/\|\s*publisher\s*=\s*([^\n|}{]{2,60})/i);
    if (pubM)  publisher  = cleanWiki(pubM[1]) || publisher;
  } catch { /* infobox parse failed, use defaults */ }

  // 3. Thumbnail image from REST summary or page HTML scrape
  let imgSrc = summary.thumbnail?.source || null;

  if (imgSrc) {
    // Upgrade thumb URL to full-size (works for commons images)
    const m = imgSrc.match(/^(https:\/\/upload\.wikimedia\.org\/wikipedia\/commons)\/thumb\/([^/]+\/[^/]+\/[^/]+)\/[^/]+$/);
    if (m) imgSrc = `${m[1]}/${m[2]}`;
  } else {
    // Scrape page HTML for infobox image
    const { body: html } = await get(`https://en.wikipedia.org/wiki/${slug}`);
    await sleep(700);
    let src = extractThumb(html);
    if (src) {
      if (src.startsWith('//')) src = 'https:' + src;
      imgSrc = src;
    }
  }

  const ext = imgSrc ? imgExt(imgSrc) : '.jpg';
  const id  = entry.id || makeId(entry.title);
  let imageField = 'images/games/placeholder.svg';

  if (imgSrc) {
    const dest = path.join(IMG_DIR, id + ext);
    const ok = await downloadBinary(imgSrc, dest);
    await sleep(500);
    if (ok) imageField = `images/games/${id}${ext}`;
  }

  return {
    id,
    title: entry.title,
    year: year || parseInt((summary.extract || '').match(/\b(19[5-9]\d|198\d|197\d|196\d)\b/)?.[1]) || 1985,
    decade: entry.decade,
    genre: entry.genre,
    platform: entry.platform,
    developer,
    publisher,
    image: imageField,
    description:     firstNSentences(summary.extract, 3),
    longDescription: firstNSentences(summary.extract, 7),
  };
}

// ── Main ──────────────────────────────────────────────────────────────────

async function run() {
  const toProcess = WANT.filter(e => {
    const id = e.id || makeId(e.title);
    if (existingIds.has(id)) { process.stdout.write(`[skip id] ${e.title}\n`); return false; }
    if (existingTitles.has(e.title.toLowerCase())) { process.stdout.write(`[skip title] ${e.title}\n`); return false; }
    return true;
  });

  console.log(`\nAdding ${toProcess.length} new games (${WANT.length - toProcess.length} already exist)...\n`);

  let added = 0;
  for (const entry of toProcess) {
    process.stdout.write(`[${entry.title}] `);
    try {
      const game = await fetchGameData(entry);
      if (!game) { console.log('skip (no wiki data)'); continue; }
      games.push(game);
      existingIds.add(game.id);
      existingTitles.add(game.title.toLowerCase());
      console.log(`✓  (${game.year}, ${game.developer})`);
      added++;
    } catch (e) {
      console.log(`error: ${e.message}`);
    }
  }

  fs.writeFileSync(DATA, JSON.stringify(games, null, 2), 'utf8');
  console.log(`\n✓ Added ${added} games. Total: ${games.length}`);
}

run().catch(console.error);
