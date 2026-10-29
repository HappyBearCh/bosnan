const express = require('express');
const compression = require('compression');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const app = express();
const PORT = process.env.PORT || 3000;

// Canonical origin for SEO tags (sitemap, canonical, og:url) and the host every
// other spelling of the site 301s to. This MUST be the domain the site is meant
// to rank as: it was left on the deployment URL while the site served from
// bosnan.net, so every canonical on bosnan.net pointed at bosnan.vercel.app and
// told Google the real site was somewhere else — which is why bosnan.net had no
// entity to recognise. Override with SITE_URL only to move the whole site.
const SITE_URL = (process.env.SITE_URL || 'https://www.bosnan.net').replace(/\/+$/, '');
const SITE_HOST = SITE_URL.replace(/^https?:\/\//, '');
// The registrable domain behind SITE_HOST, so the canonical-host guard below
// can treat the apex and every subdomain of it as ours, whichever is canonical.
const CANONICAL_APEX = SITE_HOST.split('.').slice(-2).join('.');
const SITE_NAME = 'Bosnan Retro Games Archive';
// Derived from the newest data file's mtime, so it moves only when content
// actually changes — a per-request "today" lastmod teaches crawlers to ignore
// the field entirely, and a hardcoded date goes stale the moment data lands.
// Override with SITE_LASTMOD when the build environment flattens mtimes.
//
// Vercel's build output does flatten them, to 2018-10-20, so the live sitemap
// was stamping all 1,953 URLs eight years stale. Anything before MTIME_FLOOR is
// therefore not a real edit date; fall back to the cold-start date, which on a
// deploy-per-change site is the deploy date.
const MTIME_FLOOR = Date.parse('2020-01-01');
// Per-entry last-changed dates, kept in data/lastmod.json by
// scripts/update-lastmod.js (content-hash based, so a date moves only when that
// entry's text does). The newest of them is the site-wide date, which keeps the
// homepage and hubs stable across cold starts instead of reading "today".
const LASTMOD = (() => {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'lastmod.json'), 'utf8')); }
  catch { return {}; }
})();
const LASTMOD_MAX = Object.values(LASTMOD).reduce((m, v) => (v && v.date > m ? v.date : m), '');
const SITE_LASTMOD = (() => {
  if (process.env.SITE_LASTMOD) return process.env.SITE_LASTMOD;
  if (LASTMOD_MAX) return LASTMOD_MAX;
  const dataDir = path.join(__dirname, 'data');
  let newest = 0;
  try {
    for (const f of fs.readdirSync(dataDir)) {
      const m = fs.statSync(path.join(dataDir, f)).mtimeMs;
      if (m > newest) newest = m;
    }
  } catch { /* fall through to today */ }
  if (!(newest > MTIME_FLOOR)) newest = Date.now();
  return new Date(Math.min(newest, Date.now())).toISOString().slice(0, 10);
})();

// The publishing entity, reused as the `publisher` of every Article node and
// emitted standalone on the homepage so the archive resolves to one identity.
//
// The `@id` is the load-bearing part for entity recognition: it is a stable URI
// that every one of the ~1,950 pages repeats, so a crawler merges 1,950 separate
// `publisher` objects into one node instead of treating each page as published
// by a coincidentally identically-named stranger. `alternateName` teaches it the
// short name people actually search for.
const ORG_ID = `${SITE_URL}/#organization`;
const WEBSITE_ID = `${SITE_URL}/#website`;
// The archive's span is read from the data, so the tagline, homepage and
// schema cannot go on claiming "to 1999" once later releases are added.
const ARCHIVE_YEARS = (() => {
  try {
    const ys = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'games.json'), 'utf8'))
      .map(g => +g.year).filter(y => y > 1900);
    return { from: Math.min(...ys), to: Math.max(...ys) };
  } catch (e) { return { from: 1952, to: 1999 }; }
})();
const ARCHIVE_SPAN = `${ARCHIVE_YEARS.from} to ${ARCHIVE_YEARS.to}`;
const ARCHIVE_SPAN_DASH = `${ARCHIVE_YEARS.from}–${ARCHIVE_YEARS.to}`;
const SITE_TAGLINE = `An independent archive of video game history from ${ARCHIVE_SPAN}: games, ` +
  'hardware, developers, music, magazines and long-form essays on the arcade, ' +
  'home-computer and console eras.';
const ORG_SCHEMA = {
  '@type': 'Organization',
  '@id': ORG_ID,
  name: SITE_NAME,
  alternateName: 'Bosnan',
  url: `${SITE_URL}/`,
  description: SITE_TAGLINE,
  logo: { '@type': 'ImageObject', url: `${SITE_URL}/logo.svg`, contentUrl: `${SITE_URL}/logo.svg` },
};

// The two nodes that identify the site, serialised once and injected verbatim
// on every page by the SEO middleware. A constant, not a per-page build: it is
// byte-identical on all ~1,950 pages, which is exactly the repetition that
// makes an entity legible.
const SITE_IDENTITY_JSON = JSON.stringify({
  '@context': 'https://schema.org',
  '@graph': [
    ORG_SCHEMA,
    {
      '@type': 'WebSite',
      '@id': WEBSITE_ID,
      name: SITE_NAME,
      alternateName: 'Bosnan',
      url: `${SITE_URL}/`,
      description: SITE_TAGLINE,
      inLanguage: 'en',
      publisher: { '@id': ORG_ID },
      potentialAction: {
        '@type': 'SearchAction',
        target: { '@type': 'EntryPoint', urlTemplate: `${SITE_URL}/search?q={search_term_string}` },
        'query-input': 'required name=search_term_string',
      },
    },
  ],
}).replace(/</g, '\u003c');

// ── Retro news RSS fetcher ───────────────────────────────────────────────────

// Verified live 2026-09-24. All three previous feeds had rotted: Hookshot moved
// both of its feeds to /feeds/latest (the old paths 404), and retrogamer.net/feed
// 302s to a GamesRadar HTML page, which parses to zero items. The homepage widget
// had been rendering "No news available right now." on every visit as a result —
// re-check these URLs if that string ever comes back.
const NEWS_FEEDS = [
  { url: 'https://www.timeextension.com/feeds/latest',          source: 'Time Extension' },
  { url: 'https://www.nintendolife.com/feeds/latest',           source: 'Nintendo Life' },
  { url: 'https://retrododo.com/rss/',                           source: 'Retro Dodo' },
];
const NEWS_TTL = 6 * 60 * 60 * 1000; // refresh every 6 hours

let newsCache = { articles: [], fetchedAt: 0, error: null };

function httpGet(rawUrl, redirects = 4) {
  return new Promise((resolve, reject) => {
    if (redirects < 0) return reject(new Error('Too many redirects'));
    const mod = rawUrl.startsWith('https') ? https : http;
    const req = mod.get(rawUrl, {
      headers: { 'User-Agent': 'Bosnan/1.0 (+https://bosnan.vercel.app/)', Accept: 'application/rss+xml,application/xml,*/*' },
      timeout: 8000,
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve(httpGet(new URL(res.headers.location, rawUrl).href, redirects - 1));
      }
      let body = '';
      res.setEncoding('utf8');
      res.on('data', c => { body += c; });
      res.on('end', () => resolve(body));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

// One pass per call, run twice: several feeds double-encode ("&amp;#x1f91d;"),
// which the old &amp;-first chain left on screen as a literal "&#x1f91d;".
const NAMED_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', mdash: '—', ndash: '–', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“' };
function decodeHtmlEntities(s) {
  const once = t => t.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const cp = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1));
      return cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : m;
    }
    return NAMED_ENTITIES[e.toLowerCase()] ?? m;
  });
  return once(once(s));
}

function stripTags(s) { return s.replace(/<[^>]+>/g, ' ').replace(/\s{2,}/g, ' ').trim(); }

function grabTag(block, tag) {
  // Match both plain text and CDATA content inside an XML tag.
  // Uses indexOf so we avoid RegExp string-escaping pitfalls with \s\S.
  const open = `<${tag}`;
  const close = `</${tag}>`;
  const si = block.toLowerCase().indexOf(open.toLowerCase());
  if (si === -1) return '';
  const gt = block.indexOf('>', si);
  if (gt === -1) return '';
  const ei = block.toLowerCase().indexOf(close.toLowerCase(), gt);
  if (ei === -1) return '';
  let content = block.slice(gt + 1, ei).trim();
  // Unwrap CDATA
  if (content.startsWith('<![CDATA[')) content = content.slice(9);
  if (content.endsWith(']]>')) content = content.slice(0, -3);
  return content.trim();
}

function parseRss(xml, source) {
  const items = [];
  const re = /<item[^>]*>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const b = m[1];
    const title = decodeHtmlEntities(grabTag(b, 'title'));
    // <link> in RSS is awkwardly positioned; try text node then atom:link href
    let link = grabTag(b, 'link') || (b.match(/atom:link[^>]+href="([^"]+)"/) || [])[1] || '';
    link = link.replace(/^\s*<!\[CDATA\[/, '').replace(/\]\]>\s*$/, '').trim();
    const desc = decodeHtmlEntities(stripTags(grabTag(b, 'description'))).substring(0, 220);
    const raw = grabTag(b, 'pubDate') || grabTag(b, 'dc:date') || grabTag(b, 'published');
    const pubDate = raw ? new Date(raw) : new Date(0);
    if (title && link && link.startsWith('http')) {
      items.push({ title, link, description: desc, pubDate, source });
    }
  }
  return items;
}

async function refreshNews() {
  const now = Date.now();
  if (now - newsCache.fetchedAt < NEWS_TTL && newsCache.articles.length > 0) return;

  const all = [];
  for (const feed of NEWS_FEEDS) {
    try {
      const xml = await httpGet(feed.url);
      all.push(...parseRss(xml, feed.source));
    } catch (e) {
      console.error(`[news] ${feed.source}: ${e.message}`);
    }
  }

  if (all.length > 0) {
    all.sort((a, b) => b.pubDate - a.pubDate);
    newsCache = { articles: all.slice(0, 3), fetchedAt: now, error: null };
    console.log(`[news] refreshed: ${all.length} items fetched, showing ${newsCache.articles.length}`);
  } else {
    newsCache = { ...newsCache, fetchedAt: now, error: 'No articles fetched' };
    console.error('[news] All feeds failed');
  }
}

// Pre-warm on startup, then silently refresh in background on each request
refreshNews().catch(() => {});

// ── Duplicate-content guards ────────────────────────────────────────────────
// Content grew by appending to separate data files, so the same subject landed
// twice under one id (two `zx-spectrum` platforms, `shareware-revolution` in
// both essays3 and essays11). Duplicated ids emit the same <loc> twice in the
// sitemap and let the thinner write-up shadow the richer one, since lookups
// take the first match. Collapse them at load time, keeping the fuller entry,
// so a future duplicate can't silently reintroduce the problem.
function contentWeight(e) {
  return [e.description, e.longDescription, ...(e.sections || []).map(s => s.html)]
    .reduce((n, s) => n + (s ? String(s).length : 0), 0);
}

// Collapse a list onto one entry per `keyOf` value, keeping the fuller write-up.
// Ids dropped along the way are recorded in `aliases` so the route can 301 onto
// the survivor: the retired URL keeps its inbound links and hands its ranking
// signal over instead of decaying into a 404.
function dedupe(list, keyOf = (e) => e.id, aliases = null) {
  const best = new Map();
  for (const e of list) {
    const key = String(keyOf(e)).toLowerCase();
    const prev = best.get(key);
    if (!prev) { best.set(key, e); continue; }
    const [keep, drop] = contentWeight(e) > contentWeight(prev) ? [e, prev] : [prev, e];
    best.set(key, keep);
    if (aliases && keep.id !== drop.id) aliases.set(drop.id, keep.id);
  }
  const kept = new Set([...best.values()]);
  return list.filter(e => kept.has(e));
}

// Same subject under two different slugs — `/games/outrun` and
// `/games/outrun-arcade`, `/essays/demo-scene` and
// `/essays/demo-scene-culture` — is near-duplicate content on two URLs, which
// splits the ranking signal between them.
const GAME_ALIASES = new Map();
const ESSAY_ALIASES = new Map();

// `Star Wars` and `Star Wars (Arcade)` are the same 1983 arcade game under two
// slugs, so the platform-echoing suffix is dropped before the titles are
// compared. A parenthetical naming a *different* platform is left alone — it is
// what separates the Game Gear cut of a game from the Genesis one.
function gameKey(g) {
  const title = g.title.replace(/\s*\(([^)]+)\)\s*$/, (m, inner) =>
    inner.toLowerCase() === g.platform.toLowerCase() ? '' : m);
  return `${title}|${g.year}|${g.platform}`;
}

const games = dedupe(
  JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'games.json'), 'utf8')),
  gameKey, GAME_ALIASES);
// Duplicates whose titles differ, so gameKey can't pair them. The retired entry
// was removed from games.json; its URL still 301s to the one that was kept.
for (const [retired, kept] of [
  ['shinobi-gg', 'the-gg-shinobi'],
  ['abes-oddysee', 'oddworld-abes-oddysee'],
]) GAME_ALIASES.set(retired, kept);
const GENRES = dedupe(require('./data/genres'));
// Essays are deduped on title, not id: an essay title is its identity, and the
// two "The Demo Scene" entries landed under different slugs.
const ESSAYS = dedupe(dedupe([...require('./data/essays'), ...require('./data/essays2'), ...require('./data/essays3'), ...require('./data/essays4'), ...require('./data/essays5'), ...require('./data/essays6'), ...require('./data/essays7'), ...require('./data/essays8'), ...require('./data/essays9'), ...require('./data/essays10'), ...require('./data/essays11')],
  e => e.id, ESSAY_ALIASES), e => e.title, ESSAY_ALIASES);
const DEVELOPERS = require('./data/developers');
const COMPOSERS = require('./data/composers');
const FRANCHISES = require('./data/franchises');
const HARDWARE = require('./data/hardware');
const DESIGNERS = require('./data/designers');
const REGIONAL = require('./data/regional');
const PUBLISHERS = require('./data/publishers');
const ARCADE_BOARDS = require('./data/arcade-boards');
const PERIPHERALS = require('./data/peripherals');
const LOST_GAMES = require('./data/lost-games');
const CONTROVERSIES = require('./data/controversies');
const FAILED_CONSOLES = require('./data/failed-consoles');
const GAME_ENGINES = require('./data/game-engines');
const SOUND_CHIPS = require('./data/sound-chips');
const EASTER_EGGS = require('./data/easter-eggs');
const GLOSSARY = require('./data/glossary');
const CHEAT_CODES = require('./data/cheat-codes');
const MAGAZINES = require('./data/magazines');
const BOX_ART = require('./data/box-art');
const PORTS = require('./data/ports');
const VOICE_ACTORS = require('./data/voice-actors');
const PIXEL_ARTISTS = require('./data/pixel-artists');
const PRODUCERS = require('./data/producers');
const COLLECTIONS = require('./data/collections');
const SEQUELS = require('./data/sequels');
const ROM_HACKS = require('./data/rom-hacks');
const AD_CAMPAIGNS = require('./data/ad-campaigns');
const SALES_FIGURES = require('./data/sales-figures');
const SPEEDRUNS = require('./data/speedruns');
const CRITICS = require('./data/critics');
const YEAR_REVIEWS = require('./data/year-reviews');
const YEAR_REVIEWS_MAP = new Map(YEAR_REVIEWS.map(y => [String(y.year), y]));
const DECADE_INTROS_MAP = new Map(require('./data/decade-intros').map(d => [d.decade, d]));
const CANCELLED = require('./data/cancelled');
const LOCALIZATION = require('./data/localization');
const PROTOTYPES = require('./data/prototypes');
const STRATEGY_GUIDES = require('./data/strategy-guides');
const CABINET_ART = require('./data/cabinet-art');
const MERCHANDISE = require('./data/merchandise');
const BOOTLEGS = require('./data/bootlegs');
const COMPETITIVE = require('./data/competitive');
const ENDINGS = require('./data/endings');
const BOSSFIGHTS = require('./data/bossfights');
const SOUNDTRACKS = require('./data/soundtracks');
const MANUALS = require('./data/manuals');
const DIFFICULTY = require('./data/difficulty');
const CHARACTERS = require('./data/characters');
const COVER_STORIES = require('./data/cover-stories');
const CONTROLLERS = require('./data/controllers');
const DISAPPOINTMENTS = require('./data/disappointments');
const LEVELS = require('./data/levels');
const URBAN_LEGENDS = require('./data/urban-legends');
const GLITCHES = require('./data/glitches');
const PACKAGING = require('./data/packaging');
const MULTIPLAYER = require('./data/multiplayer');
const COMICS = require('./data/comics');
const STUDIOS = require('./data/studios');
const IMPORTS = require('./data/imports');
const SPEEDRUN_TECHNIQUES = require('./data/speedrun-techniques');
const FAMOUS_BUGS = require('./data/famous-bugs');
const RETRO_REVIVAL = require('./data/retro-revival');
const SOUND_EFFECTS = require('./data/sound-effects');
const gamesSlim = games.map(({ id, title, year, decade, genre, platform, developer, image, playUrl }) =>
  ({ id, title, year, decade, genre, platform, developer, image, playUrl: playUrl || null })
);

const gamesById = new Map(games.map(g => [g.id, g]));

// ---- Cross-link engine: auto-relate entries across categories by shared game/franchise/series ----
const CROSSLINK_REGISTRY = [
  ['bossfights', BOSSFIGHTS, 'Boss Fight'],
  ['cabinet-art', CABINET_ART, 'Cabinet Art'],
  ['cheat-codes', CHEAT_CODES, 'Cheat Code'],
  ['easter-eggs', EASTER_EGGS, 'Easter Egg'],
  ['competitive', COMPETITIVE, 'Competitive'],
  ['cover-stories', COVER_STORIES, 'Cover Story'],
  ['difficulty', DIFFICULTY, 'Difficulty'],
  ['easter-eggs', EASTER_EGGS, 'Easter Egg'],
  ['endings', ENDINGS, 'Ending'],
  ['famous-bugs', FAMOUS_BUGS, 'Famous Bug'],
  ['glitches', GLITCHES, 'Glitch'],
  ['imports', IMPORTS, 'Import'],
  ['levels', LEVELS, 'Level'],
  ['localization', LOCALIZATION, 'Localization'],
  ['manuals', MANUALS, 'Manual'],
  ['multiplayer', MULTIPLAYER, 'Multiplayer'],
  ['packaging', PACKAGING, 'Packaging'],
  ['prototypes', PROTOTYPES, 'Prototype'],
  ['regional', REGIONAL, 'Regional'],
  ['sound-effects', SOUND_EFFECTS, 'Sound Effect'],
  ['soundtracks', SOUNDTRACKS, 'Soundtrack'],
  ['speedrun-techniques', SPEEDRUN_TECHNIQUES, 'SR Technique'],
  ['speedruns', SPEEDRUNS, 'Speedrun'],
  ['strategy-guides', STRATEGY_GUIDES, 'Strategy Guide'],
  ['characters', CHARACTERS, 'Character'],
  ['comics', COMICS, 'Comic'],
  ['merchandise', MERCHANDISE, 'Merchandise'],
  ['disappointments', DISAPPOINTMENTS, 'Disappointment'],
  ['sequels', SEQUELS, 'Sequel'],
  ['controversies', CONTROVERSIES, 'Controversy'],
  // The "people and makers" half of the archive. These sections name the games
  // they are about in list fields rather than a `game` string, so each row
  // declares the extra fields that hold game titles (4th element). Without
  // them these ~600 pages were invisible to the cross-link engine — they
  // linked out to nothing and nothing linked back, which is most of why 1,090
  // of 1,953 URLs had two or fewer inbound internal links.
  ['developers', DEVELOPERS, 'Developer', ['notableGames']],
  ['publishers', PUBLISHERS, 'Publisher', ['notableTitles']],
  ['designers', DESIGNERS, 'Designer', ['notableGames']],
  ['composers', COMPOSERS, 'Composer', ['notableSoundtracks', 'notableGameIds']],
  ['arcade-boards', ARCADE_BOARDS, 'Arcade Board', ['notableGames']],
  ['game-engines', GAME_ENGINES, 'Game Engine', ['notableGames']],
  ['failed-consoles', FAILED_CONSOLES, 'Failed Console', ['goodGames']],
  ['sound-chips', SOUND_CHIPS, 'Sound Chip', ['notableTracks']],
  ['voice-actors', VOICE_ACTORS, 'Voice Actor', ['notableRoles']],
  ['pixel-artists', PIXEL_ARTISTS, 'Pixel Artist', ['notableWork']],
  ['producers', PRODUCERS, 'Producer', ['notableWork']],
  ['rom-hacks', ROM_HACKS, 'ROM Hack', ['baseGame']],
  // For these sections the entry's own title *is* the game it covers.
  ['box-art', BOX_ART, 'Box Art', ['title']],
  ['ports', PORTS, 'Port', ['title']],
  ['lost-games', LOST_GAMES, 'Lost Game', ['title']],
  ['cancelled', CANCELLED, 'Cancelled', ['title']],
  // Essays carry no structured game references at all — just prose — so their
  // anchors are mined from the text below and cached on the entry.
  ['essays', ESSAYS, 'Essay', ['__gameMentions']],
  // Game pages anchor on their own title, which makes the index work in
  // reverse: the 427 highest-authority pages on the site now surface — and
  // link to — every boss fight, cheat code, port and essay written about that
  // game. That is the only inbound link most essays were ever going to get.
  ['games', games, 'Game', ['title']],
  // Sections that name their subject in prose rather than in a structured game
  // field, and so had no registry row at all. Without one they were invisible
  // to the cross-link engine in both directions: 260 of these pages had
  // exactly one inbound internal link — their own hub — and offered no route
  // sideways. `__gameMentions` runs the same prose miner the essays use.
  ['ad-campaigns', AD_CAMPAIGNS, 'Ad Campaign', ['product', '__gameMentions']],
  ['bootlegs', BOOTLEGS, 'Bootleg', ['baseGame', '__gameMentions']],
  ['collections', COLLECTIONS, 'Curated List', ['__collectionTitles']],
  ['controllers', CONTROLLERS, 'Controller', ['__gameMentions']],
  ['critics', CRITICS, 'Critic', ['__gameMentions']],
  ['franchises', FRANCHISES, 'Franchise', ['__gameMentions']],
  ['hardware', HARDWARE, 'Hardware', ['__gameMentions']],
  ['magazines', MAGAZINES, 'Magazine', ['__gameMentions']],
  ['peripherals', PERIPHERALS, 'Peripheral', ['__gameMentions']],
  ['retro-revival', RETRO_REVIVAL, 'Retro Revival', ['inspiredBy', '__gameMentions']],
  ['sales-figures', SALES_FIGURES, 'Sales Figures', ['title', '__gameMentions']],
  ['studios', STUDIOS, 'Studio', ['firstGame', '__gameMentions']],
  ['urban-legends', URBAN_LEGENDS, 'Urban Legend', ['__gameMentions']],
];

// Curated lists name their picks as `items[].title` ("Pong (1972)"), one level
// deeper than clAnchors() walks. Lift them to a flat field so each list joins
// the index on the games it actually ranks rather than on prose.
for (const c of COLLECTIONS) {
  if (Array.isArray(c.items)) c.__collectionTitles = c.items.map(i => i && i.title).filter(Boolean);
}

// ---- Prose mining ----------------------------------------------------------
// 205 essays are the archive's largest body of writing and had no cross-links
// in either direction. Their references live in sentences, so scan the prose
// for names the archive actually has a page for and cache the hits as anchors.
// Only names of two or more words are matched: a single-word title like
// "Adventure" or "Defender" collides with ordinary English, and "Sega" or
// "Atari" appears in nearly every essay here, so either would relate pages that
// share nothing.
//
// The dictionary is not just game titles. Half the archive's writing is about
// people, studios, magazines and hardware rather than about a game, so those
// sections' own names are mined too — an essay that says "Electronic Arts" or
// "Nobuo Uematsu" should reach that profile. For the mention to resolve, the
// named sections also anchor on their own name where the index is built below.
const NAMED_ENTITY_SECTIONS = new Map([
  ['developers', DEVELOPERS], ['publishers', PUBLISHERS], ['designers', DESIGNERS],
  ['composers', COMPOSERS], ['studios', STUDIOS], ['franchises', FRANCHISES],
  ['magazines', MAGAZINES], ['critics', CRITICS], ['producers', PRODUCERS],
  ['pixel-artists', PIXEL_ARTISTS], ['voice-actors', VOICE_ACTORS],
  ['arcade-boards', ARCADE_BOARDS], ['game-engines', GAME_ENGINES],
  ['sound-chips', SOUND_CHIPS], ['peripherals', PERIPHERALS], ['hardware', HARDWARE],
  ['characters', CHARACTERS], ['failed-consoles', FAILED_CONSOLES],
  ['controllers', CONTROLLERS],
  // PLATFORMS is deliberately absent: it is built further down the file, after
  // this dictionary, and platform pages are already among the best-linked on
  // the site — they do not need the help.
]);
const essayTitleByLen = new Map();
let essayMaxTitleWords = 0;
const addMinedName = (raw) => {
  const k = clNorm(raw);
  const n = k ? k.split(' ').length : 0;
  if (n < 2) return;
  if (!essayTitleByLen.has(n)) essayTitleByLen.set(n, new Map());
  if (!essayTitleByLen.get(n).has(k)) essayTitleByLen.get(n).set(k, String(raw));
  if (n > essayMaxTitleWords) essayMaxTitleWords = n;
};
for (const [, data] of NAMED_ENTITY_SECTIONS) {
  if (Array.isArray(data)) for (const e of data) if (e) addMinedName(clTitle(e));
}
// The other half of that bargain: a named section's entries anchor on their own
// name as well as on the games they list, so the mined mention has a node to
// resolve to. Held in a field rather than read per-section from `name`/`title`
// because clAnchors() is handed a flat list of keys and knows no slug. The
// `__` prefix keeps it out of entryProse(), so an entry cannot mine itself.
for (const row of CROSSLINK_REGISTRY) {
  const [slug, data] = row;
  if (!NAMED_ENTITY_SECTIONS.has(slug) || !Array.isArray(data)) continue;
  for (const e of data) if (e) e.__selfName = clTitle(e);
  row[3] = [...(row[3] || []), '__selfName'];
}
for (const g of games) {
  const k = clNorm(g.title);
  const n = k ? k.split(' ').length : 0;
  if (n < 2) continue;
  if (!essayTitleByLen.has(n)) essayTitleByLen.set(n, new Map());
  if (!essayTitleByLen.get(n).has(k)) essayTitleByLen.get(n).set(k, g.title);
  if (n > essayMaxTitleWords) essayMaxTitleWords = n;
}
// Longest-match-wins scan, so "Super Mario Bros. 3" is not recorded as the
// separate game "Super Mario Bros.".
function mineGameMentions(text) {
  const words = clNorm(text).split(' ');
  const hits = new Set();
  for (let i = 0; i < words.length; i++) {
    for (let n = Math.min(essayMaxTitleWords, words.length - i); n >= 2; n--) {
      const bucket = essayTitleByLen.get(n);
      const title = bucket && bucket.get(words.slice(i, i + n).join(' '));
      if (title) { hits.add(title); i += n - 1; break; }
    }
  }
  return [...hits];
}
// Every string an entry carries, flattened, so the miner reads the same prose a
// visitor does: the text fields, the bullet arrays (`keyFacts`,
// `notableIssues`, `context`, …) and the HTML of each body section. A few keys
// are skipped — `sources` is a bibliography whose titles are books and
// Wikipedia articles rather than the entry's subject, and `id`/`image` are
// slugs and paths that can normalise onto a short game title by accident.
const PROSE_SKIP_KEYS = new Set(['id', 'image', 'sources', 'playUrl', 'url', 'links']);
function entryProse(e) {
  const parts = [];
  const walk = (v, depth) => {
    if (depth > 3 || v == null) return;
    if (typeof v === 'string') parts.push(v.replace(/<[^>]*>/g, ' '));
    else if (Array.isArray(v)) v.forEach(x => walk(x, depth + 1));
    else if (typeof v === 'object') {
      for (const [k, x] of Object.entries(v)) if (!PROSE_SKIP_KEYS.has(k)) walk(x, depth + 1);
    }
  };
  for (const [k, v] of Object.entries(e)) {
    if (PROSE_SKIP_KEYS.has(k) || k.startsWith('__')) continue;
    walk(v, 0);
  }
  return parts.join(' ');
}

// A page that mentions thirty games in passing is not *about* thirty games, and
// letting it anchor on all of them makes it a candidate related link everywhere
// without ever being the relevant one. Keep the leading few: the data files
// open on the entry's actual subject and drift into context further down.
const MAX_MINED_MENTIONS = 30;
for (const [, data, , extraKeys] of CROSSLINK_REGISTRY) {
  if (!Array.isArray(data) || !(extraKeys || []).includes('__gameMentions')) continue;
  for (const e of data) {
    if (!e || e.__gameMentions) continue;
    e.__gameMentions = mineGameMentions(entryProse(e)).slice(0, MAX_MINED_MENTIONS);
  }
}
const CL_ANCHOR_KEYS = ['game', 'games', 'franchise', 'series'];
function clNorm(s) { return String(s == null ? '' : s).toLowerCase().replace(/&amp;/g, '&').replace(/[^a-z0-9]+/g, ' ').trim(); }
// Speedrun entries are keyed on the game they run rather than a title of their
// own, and rendered an empty related-link label without this fallback.
function clTitle(e) { return e.title || e.name || e.term || e.game || ''; }
// Anchors are the game/franchise names an entry is *about*, normalised so two
// sections that spell the same game differently ("Donkey Kong (1981)" vs
// "Donkey Kong") still meet on one key. The extra keys named by a registry row
// are run through the same title extraction the game linker uses, so year
// suffixes and role wrappers don't fragment the index.
function clAnchors(e, extraKeys) {
  const out = [];
  const add = (v, extract) => {
    if (Array.isArray(v)) v.forEach(x => add(x, extract));
    else if (v) out.push(...(extract ? gameTitleCandidates(v) : [v]));
  };
  for (const k of CL_ANCHOR_KEYS) add(e[k], false);
  for (const k of (extraKeys || [])) add(e[k], true);
  // Ignore overly generic anchors that would link unrelated entries
  return [...new Set(out.map(clNorm).filter(a => a && a.length > 2 && a !== 'various' && a !== 'multiple'))];
}
const clLabelBySlug = new Map(CROSSLINK_REGISTRY.map(([slug, , label]) => [slug, label]));
const clExtraKeys = new Map(CROSSLINK_REGISTRY.map(([slug, , , keys]) => [slug, keys]));
const clIndex = new Map(); // normAnchor -> [{ slug, id, title }]
// Which section an entry object belongs to, keyed by identity. Lets
// relatedBlock() look up the same extra anchor keys the index was built with
// without every one of the ~80 render sites having to pass its own slug.
const clSlugByEntry = new Map();
// "slug/id" -> entry, so the SEO middleware can find the entry behind a URL
// and inject its related-entries block without the template's help.
const clEntryByKey = new Map();
function clEntryByPath(cleanPath) {
  const [, slug, id] = cleanPath.split('/');
  return (slug && id) ? clEntryByKey.get(`${slug}/${id}`) : undefined;
}
for (const [slug, data, , extraKeys] of CROSSLINK_REGISTRY) {
  if (!Array.isArray(data)) continue;
  for (const e of data) {
    if (!e || !e.id) continue;
    if (!clEntryByKey.has(`${slug}/${e.id}`)) clEntryByKey.set(`${slug}/${e.id}`, e);
    if (!clSlugByEntry.has(e)) clSlugByEntry.set(e, slug);
    for (const a of clAnchors(e, extraKeys)) {
      if (!clIndex.has(a)) clIndex.set(a, []);
      clIndex.get(a).push({ slug, id: e.id, title: clTitle(e) });
    }
  }
}
// ---- Game-title linker ----------------------------------------------------
// The "Notable games / titles / work" lists on developer, publisher, composer,
// designer, arcade-board (etc.) pages name real games that already have a page
// in this archive, but they render as plain text. Resolving each entry to its
// /games/<id> turns ~320 dead strings into contextual internal links whose
// anchor text is the game's exact title — the strongest internal-linking signal
// the archive was leaving on the table, and the only inbound links many game
// pages get besides their own hub listing.
const gameTitleExact = new Map();
const gameTitlePrefix = new Map();
for (const g of games) {
  const k = clNorm(g.title);
  if (!gameTitleExact.has(k)) gameTitleExact.set(k, g);
  // "Street Fighter II" should resolve to "Street Fighter II: The World
  // Warrior", but only when the prefix is unambiguous — a prefix shared by two
  // games is set to null so it never links to an arbitrary one of them.
  const pk = clNorm(g.title.split(/[:–—]/)[0]);
  if (pk && pk !== k) gameTitlePrefix.set(pk, gameTitlePrefix.has(pk) ? null : g);
}

// The candidate title strings hidden in one list entry, most specific first.
// Entries come in three shapes across the data files:
//   "Donkey Kong (1981)"                    -> Donkey Kong
//   "Final Fantasy IV (1991) — SNES"        -> Final Fantasy IV
//   "Mario (Super Mario 64, 1996)"          -> Super Mario 64   (role listings)
function gameTitleCandidates(s) {
  const out = [];
  const t = String(s).trim();
  const push = v => { v = v.replace(/\s+/g, ' ').trim(); if (v.length > 2) out.push(v); };
  const paren = t.match(/\(([^)]+)\)/);
  if (paren) {
    const inner = paren[1].replace(/,?\s*(?:19|20)\d{2}.*$/, '').replace(/\s*—.*$/, '').trim();
    if (inner && !/^(?:19|20)\d{2}$/.test(inner)) push(inner);
  }
  push(t.split(' — ')[0].split(' – ')[0]
    .replace(/\s*\((?:19|20)\d{2}[^)]*\)\s*/g, ' ')
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    .replace(/\s*\[[^\]]*\]\s*/g, ' '));
  return [...new Set(out)];
}

function resolveGameTitle(s) {
  for (const c of gameTitleCandidates(s)) {
    const k = clNorm(c);
    if (gameTitleExact.has(k)) return gameTitleExact.get(k);
    if (gameTitlePrefix.get(k)) return gameTitlePrefix.get(k);
  }
  return null;
}

// Render a "notable games" style array as list items, linking each entry that
// resolves to a real game page and leaving the rest as plain escaped text.
// `selfId` keeps a game page from linking to itself.
function gameLinkList(arr, selfId) {
  return (arr || []).map(v => {
    const g = resolveGameTitle(v);
    return g && g.id !== selfId
      ? `<li><a href="/games/${escapeHtml(g.id)}">${escapeHtml(v)}</a></li>`
      : `<li>${escapeHtml(v)}</li>`;
  }).join('');
}

function relatedBlock(item) {
  if (!item) return '';
  const selfSlug = clSlugByEntry.get(item);
  const anchors = clAnchors(item, clExtraKeys.get(selfSlug));
  if (!anchors.length) return '';
  const seen = new Set();
  const out = [];
  for (const a of anchors) {
    for (const r of (clIndex.get(a) || [])) {
      if (r.id === item.id && r.slug === selfSlug) continue;
      const key = r.slug + '/' + r.id;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(r);
    }
  }
  if (!out.length) return '';
  // Spread the eight slots across sections rather than letting one section
  // (usually the one with the most entries per game) take them all, so a
  // developer page surfaces a boss fight, a port and a soundtrack instead of
  // eight box-art rows.
  out.sort((a, b) => (a.slug === selfSlug ? 1 : 0) - (b.slug === selfSlug ? 1 : 0));
  const perSection = new Map();
  const spread = [];
  for (const pass of [1, 2, 8]) {
    for (const r of out) {
      if (spread.length >= 8) break;
      const n = perSection.get(r.slug) || 0;
      if (n >= pass || spread.includes(r)) continue;
      perSection.set(r.slug, n + 1);
      spread.push(r);
    }
  }
  out.length = 0;
  out.push(...spread);
  const links = out.slice(0, 8).map(r =>
    `<a href="/${r.slug}/${r.id}" class="related-link"><span class="related-cat">${escapeHtml(clLabelBySlug.get(r.slug) || r.slug)}</span><span class="related-title">${escapeHtml(r.title)}</span></a>`
  ).join('');
  return `<div class="related-entries"><h2>Related across the archive</h2><div class="related-entries-grid">${links}</div></div>`;
}
// skipSchema: the caller emits its own richer Article node and folds the
// citations into it, so we must not emit a second competing Article.
function sourcesBlock(item, skipSchema) {
  const src = item && (item.sources || item.references);
  if (!Array.isArray(src) || !src.length) return '';
  const items = src.map(s => {
    if (typeof s === 'string') return `<li>${escapeHtml(s)}</li>`;
    const title = escapeHtml(s.title || s.url || '');
    const pub = s.publisher ? ` <span class="source-pub">— ${escapeHtml(s.publisher)}</span>` : '';
    return s.url
      ? `<li><a href="${escapeHtml(s.url)}" target="_blank" rel="noopener nofollow">${title}</a>${pub}</li>`
      : `<li>${title}${pub}</li>`;
  }).join('');
  return `<div class="entry-sources"><h2>Sources &amp; further reading</h2><ul class="entry-sources-list">${items}</ul></div>${skipSchema ? '' : sourcesSchema(item, src)}`;
}

// The citation array on its own, for callers building their own Article node.
function citationList(item) {
  const src = (item && (item.sources || item.references)) || [];
  return src.map(s => {
    if (typeof s === 'string' || !s.url) return null;
    const c = { '@type': 'CreativeWork', name: s.title || s.url, url: s.url };
    if (s.publisher) c.publisher = { '@type': 'Organization', name: s.publisher };
    return c;
  }).filter(Boolean);
}
// Emit schema.org citations for any entry that carries sources, so the
// references render as machine-readable structured data. Injected alongside
// sourcesBlock, so it covers every sourced category entry automatically.
function sourcesSchema(item, src) {
  // Entity sections (people, companies, products, magazines) get a typed
  // Person/Organization/Product node from autoSchema(). Emitting this Article
  // first made autoSchema() see the page as covered, so a composer's page was
  // typed as a generic Article. Leave those pages to the typed node.
  if (ENTRY_SCHEMA_TYPE.has(clSlugByEntry.get(item))) return '';
  const citations = src.map(s => {
    if (typeof s === 'string') return null;
    if (!s.url) return null;
    const c = { '@type': 'CreativeWork', name: s.title || s.url, url: s.url };
    if (s.publisher) c.publisher = { '@type': 'Organization', name: s.publisher };
    return c;
  }).filter(Boolean);
  if (!citations.length) return '';
  const headline = item.title || item.name || item.term || '';
  const json = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline,
    citation: citations,
  }).replace(/</g, '\\u003c');
  return `<script type="application/ld+json">${json}</script>`;
}

// Breadcrumbs: one trail definition drives both the JSON-LD BreadcrumbList
// (SERP breadcrumb display) and the visible nav. Trail entries are
// { name, path }; the last one is the current page and is not linked.
function breadcrumbSchema(trail) {
  const json = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((c, i) => ({
      '@type': 'ListItem', position: i + 1, name: c.name, item: SITE_URL + c.path,
    })),
  }).replace(/</g, '\\u003c');
  return `<script type="application/ld+json">${json}</script>`;
}
function crumbsNav(trail) {
  const parts = trail.map((c, i) => i === trail.length - 1
    ? `<span aria-current="page">${escapeHtml(c.name)}</span>`
    : `<a href="${c.path}">${escapeHtml(c.name)}</a>`);
  return `<nav class="crumbs" aria-label="Breadcrumb">${parts.join(' &rsaquo; ')}</nav>`;
}

// Trim to a meta-description length on a word boundary, so snippets don't end
// mid-word (or mid-HTML-entity, which would render as literal "&amp" garbage).
// A description cut mid-phrase with an ellipsis ("…after Bowser steals the
// Star…") reads as broken in the SERP and invites Google to write its own.
// Prefer, in order: the longest run of whole sentences that fits, then the
// longest prefix ending at a clause break (", ", " — ", " after ", " which "…)
// closed with a full stop. Either must keep at least ~60% of the budget and
// leave quotes and brackets balanced; only failing both do we fall back to the
// word-boundary ellipsis.
const DESC_ABBREV = /\b(?:Mr|Mrs|Ms|Dr|St|Jr|Sr|Inc|Ltd|Co|Corp|Bros|vs|Vol|No|Mt|Ft|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec|U\.S|U\.K|[A-Z])\.$/;
const DESC_CLAUSE = /(?:; | \(|, which |, where |, whose |, while |, (?=[a-z]+ing ))/g;
const DESC_DANGLING = / (?:a|an|the|of|to|for|and|or|but|in|on|at|by|from|its|their|his|her|that|is|was|were|has|had|have|be|into|than)$/i;
function descBalanced(s) {
  if ((s.match(/"/g) || []).length % 2) return false;
  if ((s.match(/\(/g) || []).length !== (s.match(/\)/g) || []).length) return false;
  return (s.match(/[“]/g) || []).length === (s.match(/[”]/g) || []).length;
}
function fitDescription(text, max) {
  const floor = Math.floor(max * 0.6);
  let best = '';
  for (const m of text.matchAll(/[.!?](?:["”')\]]*)(?= [A-Z0-9"“(])/g)) {
    const end = m.index + m[0].length;
    if (end > max) break;
    const cand = text.slice(0, end);
    if (DESC_ABBREV.test(text.slice(0, m.index + 1))) continue;
    if (cand.length >= floor && descBalanced(cand)) best = cand;
  }
  if (best) return best;
  for (const m of text.matchAll(DESC_CLAUSE)) {
    if (m.index + 1 > max) break;
    const cand = text.slice(0, m.index).replace(/[\s,;:—–-]+$/, '');
    if (cand.length >= floor && descBalanced(cand) && !DESC_DANGLING.test(cand)) best = cand + '.';
  }
  return best;
}
function metaDesc(s, max = 160) {
  const text = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  if (text.length <= max) return escapeHtml(text);
  const fitted = fitDescription(text, max);
  if (fitted) return escapeHtml(fitted);
  const cut = text.slice(0, max - 1);
  const sp = cut.lastIndexOf(' ');
  return escapeHtml((sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s,;:.\-]+$/, '')) + '&#8230;';
}

// Meta description for a games listing page (a year, a decade). The old
// template read "1 games from 1952 in the Bosnan retro archive." — wrong
// plural, and thin enough that Google would rather invent its own snippet.
// Naming the first few titles gives the snippet something specific to show
// and lifts these pages clear of the boilerplate-description threshold.
function listingDesc(games, phrase) {
  const list = Array.isArray(games) ? games : [];
  const n = list.length;
  const site = 'the Bosnan retro gaming archive';
  if (!n) return `Games ${phrase} in ${site} — browse the full archive by platform, genre, developer and year.`;
  const titles = list.slice(0, 3).map(g => g.title).filter(Boolean);
  const named = titles.length > 1
    ? `${titles.slice(0, -1).join(', ')} and ${titles[titles.length - 1]}`
    : titles[0];
  const lead = `${n} ${n === 1 ? 'game' : 'games'} ${phrase}`;
  return named
    ? (`${lead}, including ${named} — with platforms, developers and release history.`.length <= 160
      ? `${lead}, including ${named} — with platforms, developers and release history.`
      : `${lead}, including ${named}.`)
    : `${lead}, with platforms, developers and release history from ${site}.`;
}

// Shared renderer for the "platform-detail" entry family — pages that share an
// identical skeleton and differ only in nav slug, back link, title suffix, the
// header name, the meta line, and an optional extra paragraph. o.meta and
// o.extra are pre-built HTML (fields already escaped); o.name is raw.
function detailPage(item, o) {
  const facts = (item.keyFacts || []).map(f => `<li>${escapeHtml(f)}</li>`).join('');
  const sections = (item.sections || []).map(s => `<h2>${escapeHtml(s.title)}</h2>${s.html}`).join('');
  const name = escapeHtml(o.name);
  const url = `${SITE_URL}/${o.slug}/${item.id}`;
  const trail = [
    { name: 'Home', path: '/' },
    { name: o.suffix, path: `/${o.slug}` },
    { name: o.name, path: `/${o.slug}/${item.id}` },
  ];
  // One Article node per page, carrying citations when the entry has sources
  // (which is why sourcesBlock is told to suppress its own schema below).
  const citations = citationList(item);
  const article = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: o.name,
    description: item.description,
    url,
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    isPartOf: { '@type': 'CollectionPage', name: o.suffix, url: `${SITE_URL}/${o.slug}` },
    publisher: ORG_SCHEMA,
  };
  if (citations.length) article.citation = citations;
  const articleJson = JSON.stringify(article).replace(/</g, '\\u003c');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${name} – ${o.suffix} – Bosnan</title><meta name="description" content="${metaDesc(item.description)}"><meta property="og:type" content="article"><link rel="canonical" href="${url}"><script type="application/ld+json">${articleJson}</script>${breadcrumbSchema(trail)}<style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${nav(o.nav)}<div class="platform-detail-wrapper">${crumbsNav(trail)}<a href="/${o.slug}" class="back-link">&#8592; ${o.backLabel}</a><div class="platform-detail-header"><h1>${name}</h1><p class="platform-detail-era">${o.meta}</p><p class="platform-detail-desc">${escapeHtml(item.description)}</p><div class="platform-detail-desc">${paragraphs(item.longDescription)}</div>${o.extra || ''}${facts ? `<div class="dev-notable"><strong>Key Facts:</strong><ul class="trivia-list">${facts}</ul></div>` : ''}</div><div class="platform-long-desc essay-body">${sections}</div>${sourcesBlock(item, true)}${relatedBlock(item)}</div>${toggleScript()}</body></html>`;
}

const PLATFORMS = dedupe([
  {
    id: 'arcade', name: 'Arcade', era: '1971 – 1990s',
    manufacturer: 'Various (Namco, Atari, Konami, Capcom, Sega)',
    keyword: 'Arcade',
    sources: [
      { title: 'Golden age of arcade video games', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Golden_age_of_arcade_video_games' },
    ],
    description: 'Coin-operated arcade games defined the first golden age of video gaming. North American arcades doubled in number between 1980 and 1982, and US arcade revenue reached an estimated $8 billion in 1982 — more than pop music and Hollywood films combined.',
    longDescription: 'The golden age of arcade video games ran from the late 1970s into the early 1980s, usually dated from Space Invaders in 1978 to the downturn of 1983. Japanese manufacturers such as Taito, Namco and Nintendo competed with American companies including Atari, Midway, Williams and Cinematronics, and by 1982–83 Japanese makers held a large share of the North American market. The number of arcades in North America doubled between 1980 and 1982 to a peak of about 10,000, with roughly 1.5 million machines in operation.\n\nThe money was extraordinary. US arcade revenue tripled to $2.8 billion in 1980, and by 1982 it was estimated at $8 billion a year, more than pop music and Hollywood films combined, while pinball sales collapsed. Space Invaders sold more than 360,000 cabinets and grossed about $2 billion in quarters by 1982, and Pac-Man, which sold about 400,000 cabinets, had grossed more than $1 billion by 1981 and is considered the highest-grossing arcade game of all time.\n\nHardware moved quickly: Galaxian brought tile-based colour graphics, Asteroids, Battlezone and Tempest used vector displays, Turbo, Pole Position and Zaxxon introduced pseudo-3D and isometric views, Dragon\'s Lair used laserdisc video, and I, Robot (1984) was the first arcade game rendered entirely in real-time 3D. The boom ended in 1983, as clones saturated arcades, home consoles improved and arcades drew a moral panic over their influence on children. The business revived in the early 1990s, driven largely by fighting games.',
  },
  {
    id: 'nes', name: 'Nintendo Entertainment System', shortName: 'NES', era: '1983 – 2003',
    manufacturer: 'Nintendo',
    keyword: 'NES',
    sources: [
      { title: 'Nintendo Entertainment System', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Nintendo_Entertainment_System' },
    ],
    description: 'The NES helped revitalise the American video game industry after the crash of 1983. Released in Japan as the Famicom in 1983 and in North America from 1985, it sold 61.91 million units and launched franchises such as Mario, Zelda, Metroid, Castlevania and Mega Man.',
    longDescription: 'Nintendo released the Family Computer, or Famicom, in Japan on 15 July 1983. For the West it redesigned the machine as the Nintendo Entertainment System, with a front-loading cartridge slot, detachable controllers and accessories such as the Zapper light gun and the R.O.B. robot, and test-marketed it in New York on 18 October 1985 before a nationwide US release on 27 September 1986. Its Western terms helped it find a place in toy stores, while Nintendo\'s marketing presented it as sophisticated, cutting-edge technology.\n\nSuper Mario Bros., the pack-in game, sold about 40 million copies, and third-party publishers such as Capcom, Konami and Namco produced some of the platform\'s defining games. Nintendo controlled that market tightly: the 10NES lockout chip prevented unlicensed cartridges, the "Seal of Quality" marked approved games, and licensing terms including a limit of five games per publisher per year led to a 1991 settlement with the US Federal Trade Commission.\n\nThe NES sold 61.91 million units. It was discontinued in North America and Europe on 14 August 1995, while the Famicom remained in production in Japan until 25 September 2003. It helped revitalise the American industry after the 1983 crash and popularised the model of licensing games from third-party developers.',
  },
  {
    id: 'atari-2600', name: 'Atari 2600', era: '1977 – 1992',
    manufacturer: 'Atari',
    keyword: 'Atari 2600',
    sources: [
      { title: 'Atari 2600', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Atari_2600' },
    ],
    description: 'The Atari VCS, later the 2600, popularised ROM cartridges and brought arcade-style games into living rooms. Launched in 1977, it sold an estimated 30 million units, and Space Invaders nearly doubled its installed base in 1980.',
    longDescription: 'The console was prototyped as "Stella" by Atari\'s engineering subsidiary Cyan Engineering, with Jay Miner designing its Television Interface Adaptor graphics chip, and Atari was sold to Warner Communications in 1976. The Video Computer System went on sale around September 1977 at $199. Its hardware was modest — a MOS 6507 processor at 1.19 MHz and 128 bytes of RAM — and programmers drew their graphics by timing code to the television\'s scanning beam, a technique known as "racing the beam". The Fairchild Channel F had used ROM cartridges first, in 1976, but the VCS popularised them.\n\nSpace Invaders, licensed in 1980, sold 1.25 million cartridges and helped sell more than a million systems, nearly doubling the installed base to over two million. In 1979 four Atari programmers — among them David Crane, Bob Whitehead and Alan Miller — founded Activision to make third-party games for the console.\n\nThe console\'s success also fed the crash: the disappointing ports of Pac-Man and E.T. and a glut of low-quality third-party games were among the factors that brought down the North American market in 1983. Atari released the cost-reduced 2600 Jr. in 1986 and kept the console in production until 1992; it sold an estimated 30 million units in all.',
  },
  {
    id: 'commodore-64', name: 'Commodore 64', shortName: 'C64', era: '1982 – 1994',
    manufacturer: 'Commodore International',
    keyword: 'Commodore 64',
    sources: [
      { title: 'Commodore 64', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Commodore_64' },
    ],
    description: 'Guinness lists the Commodore 64 as the best-selling desktop computer model of all time, with estimates of 12.5 to 17 million units. Its SID sound chip remains popular with musicians, and it helped start the demoscene.',
    longDescription: 'Commodore introduced the Commodore 64 at the Consumer Electronics Show in January 1982 and put it on sale that August at $595. It combined a MOS Technology 6510 processor with 64 KB of RAM, the VIC-II graphics chip, two CIA chips for input and output, and the SID sound chip designed by Bob Yannes. Commodore made many of its parts in-house and sold the machine through department, discount and toy stores rather than only specialist shops, and its aggressive pricing helped drive Texas Instruments out of the home computer market in 1983.\n\nBetween 1983 and 1986 the C64 held roughly 30 to 40 per cent of the US market. It was also strong in Germany and in the UK, where it ranked second to the ZX Spectrum, though it did not dominate France or Japan. Its software was loaded from cassette or the 1541 floppy drive, and around 10,000 commercial titles were released, including games from Epyx and SSI.\n\nIndependent estimates put its sales at 12.5 to 17 million units, and Guinness lists it as the best-selling desktop computer model of all time. Production ended when Commodore went bankrupt in April 1994. The C64 helped start the demoscene, and its SID chip remains popular with hobbyists and musicians.',
  },
  {
    id: 'sega-master-system', name: 'Sega Master System', shortName: 'SMS', era: '1985 – 1996',
    manufacturer: 'Sega',
    keyword: 'Sega Master System',
    sources: [
      { title: 'Master System', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Master_System' },
    ],
    description: 'Sega\'s 8-bit console, sold in Japan as the Mark III, lost North America to the NES but found its audience in Europe and Brazil, where Tectoy sold about 8 million units and kept it in production into the 2000s. About 13 million were sold worldwide.',
    longDescription: 'Sega launched the Mark III in Japan on 20 October 1985 and later rebranded it as the Master System, releasing it in North America in September 1986 and in Europe in August 1987. It used a Zilog Z80A processor at 3.58 MHz with 8 KB of RAM and 16 KB of video RAM, and displayed 32 colours on screen from a palette of 64 at a resolution of 256 × 192; the Japanese version added a Yamaha YM2413 FM sound chip. Some models had games built in, including Snail Maze, Hang-On and Safari Hunt, Alex Kidd in Miracle World and later Sonic the Hedgehog, and the SegaScope 3-D glasses plugged into the original model\'s card slot.\n\nIn North America, Nintendo\'s licensing rules restricted the third-party games available to the Master System, limiting its library, and after weak sales Sega sold the US distribution rights to Tonka in 1987. Its estimated US sales reached about 2 million by 1993.\n\nEurope and Brazil were different stories. Western Europe accounted for about 6.8 million units by 1993, and in Brazil, Tectoy distributed the system from 1989 and sold about 8 million Master System–branded units, keeping it in production into the 2000s. The console was discontinued in Japan in 1991, North America in 1992 and Europe in 1996, and sold about 13 million units worldwide.',
  },
  {
    id: 'apple-ii', name: 'Apple II', era: '1977 – 1993',
    manufacturer: 'Apple Computer',
    keyword: 'Apple II',
    sources: [
      { title: 'Apple II', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Apple_II' },
    ],
    description: 'Steve Wozniak\'s Apple II, sold from 1977 as a finished machine rather than a kit, helped establish the home computer market. With colour graphics, eight expansion slots and a strong presence in schools, it sold about six million units.',
    longDescription: 'The Apple II went on sale in June 1977 at $1,298 for a 4 KB model. Steve Wozniak designed it around the MOS 6502 processor, with colour and high-resolution graphics and eight expansion slots on the motherboard, and it was sold as a finished appliance rather than a kit. The Disk II floppy drive followed in 1978, with Apple DOS developed for it, and the VisiCalc spreadsheet (1979) carried the machine into business.\n\nThe Apple II also helped boost the computer game market, and a partnership with the Minnesota Educational Computing Consortium (MECC) made it popular in schools.\n\nThe line was refreshed repeatedly: the Apple II Plus (1979), the IIe (1983), the IIc (1984), the 16-bit IIGS (1986) and the IIc Plus (1988). Sales peaked in 1983, the IIe was the best-selling model, and the family sold about six million units before the last model was discontinued in 1993.',
  },
  {
    id: 'pc-dos', name: 'PC / DOS', era: '1981 – 1990s',
    manufacturer: 'IBM / Microsoft',
    keyword: 'PC',
    sources: [
      { title: 'PC game', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/PC_game' },
    ],
    description: 'The IBM PC and its DOS-based clones began as business machines with poor graphics and sound, but cheap clones, EGA and VGA graphics and sound cards such as AdLib and Sound Blaster turned DOS into the leading computer game platform by the early 1990s.',
    longDescription: 'IBM\'s PC arrived in 1981 with games already among its launch software, including Microsoft Adventure, and Microsoft Flight Simulator sold well partly because buyers could describe it as a simulation. But its CGA graphics and PC speaker sound were poor, and most buyers used it for business. That changed from the mid-1980s, as cheap IBM PC clones lowered prices and game companies increased their DOS releases; by 1987–88 clones with EGA graphics were rated superior for games, and PC game sales rose sharply.\n\nSound and graphics caught up quickly. AdLib\'s Music Synthesizer Card brought FM synthesis in 1987, and Creative\'s Sound Blaster added PCM sampled sound and a DSP in 1989, the year VGA gained wide adoption. DOS held 65 per cent of the computer game market in 1990 and 82 per cent of computer game sales in 1991, with games such as Wing Commander and Civilization.\n\nThe early 1990s made the PC the home of the first-person shooter: id Software\'s Hovertank 3D (1991), Wolfenstein 3D (1992), spread as shareware, and Doom (1993), while CD-ROM games such as Myst appeared the same year. Memory management remained a notorious hassle until Windows simplified drivers and memory, with DirectX and OpenGL maturing by 1996.',
  },
  {
    id: 'snes', name: 'Super Nintendo Entertainment System', shortName: 'SNES', era: '1990 – 2003',
    manufacturer: 'Nintendo',
    keyword: 'SNES',
    sources: [
      { title: 'Super Nintendo Entertainment System', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Super_Nintendo_Entertainment_System' },
    ],
    description: 'Nintendo\'s 16-bit console, with Mode 7 graphics, a Sony-designed sound system and a library of celebrated RPGs, platformers and action games. It sold 49.1 million units, the best-selling home console of its generation.',
    longDescription: 'Masayuki Uemura, who had designed the Famicom, also designed its successor. The Super Famicom launched in Japan on 21 November 1990 and quickly succeeded there, and the Super NES followed in North America in August 1991 at $199, bundled with Super Mario World. Its hardware combined a Ricoh 5A22 processor with an audio system designed by Sony\'s Ken Kutaragi and Mode 7, a graphics mode for scaling and rotating backgrounds into pseudo-3D effects.\n\nCartridges could carry their own enhancement chips to extend the console\'s abilities, most famously the Super FX that powered Star Fox. In the US the Super NES fought a long battle with the Sega Genesis for market share, in which neither console could keep a definitive lead for several years. Late in its life, Rare\'s Donkey Kong Country (1994) helped sustain the console into the 32-bit era.\n\nNintendo sold 49.1 million units, making the Super NES the best-selling console of the fourth generation. Production ended in Europe in 1998, in North America in 1999 and in Japan in 2003.',
  },
  {
    id: 'genesis', name: 'Sega Genesis', shortName: 'Genesis', era: '1988 – 1997',
    manufacturer: 'Sega',
    keyword: 'Genesis',
    sources: [
      { title: 'Sega Genesis', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Sega_Genesis' },
    ],
    description: 'The Sega Genesis (Mega Drive outside North America) had a two-year head start on the Super NES in the West. Aggressive marketing, a sports and arcade-heavy library and Sonic the Hedgehog made it Nintendo\'s toughest rival, and it sold 30.75 million units.',
    longDescription: 'Sega launched the Mega Drive in Japan on 29 October 1988, where it was overshadowed by Super Mario Bros. 3, released a week earlier. It reached North America as the Genesis in 1989 — officially in September, after a few units went on sale in New York and Los Angeles in late August — and Europe in September 1990. Its hardware paired a Motorola 68000 main processor with a Zilog Z80 for sound control and a Yamaha YM2612 FM synthesiser.\n\nSega of America\'s first chief executive, former Atari executive Michael Katz, challenged Nintendo head-on with the "Genesis does what Nintendon\'t" campaign and a library of licensed sports and celebrity games. Tom Kalinske, who replaced him in mid-1990, cut the price and replaced the bundled Altered Beast with Sonic the Hedgehog. Sega\'s advertising also promised "blast processing", a term for an obscure programming method that suggested the console was far more capable than the Super NES.\n\nThe two-year lead let the Genesis outsell the Super NES over four consecutive Christmas seasons. Sega reported 30.75 million units sold worldwide and discontinued the console in 1997, although Majesco continued selling it in North America until 1999.',
  },
  {
    id: 'game-boy', name: 'Game Boy', era: '1989 – 2003',
    manufacturer: 'Nintendo',
    keyword: 'Game Boy',
    sources: [
      { title: 'Game Boy', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Game_Boy' },
    ],
    description: 'Gunpei Yokoi\'s handheld embodied his philosophy of "lateral thinking with withered technology": mature, cheap parts instead of cutting-edge colour. Together with the Game Boy Color it sold 118.69 million units, outlasting technically superior rivals on price and battery life.',
    longDescription: 'Nintendo R&D1, led by Gunpei Yokoi and Satoru Okada, designed the Game Boy around mature, low-cost components rather than cutting-edge colour hardware — Yokoi\'s "lateral thinking with withered technology". It launched in Japan on 21 April 1989, in North America on 31 July 1989 at $89.95, and in Europe in September 1990, with a monochrome dot-matrix screen showing four shades, an 8-bit Sharp processor and four AA batteries that lasted up to 30 hours. Everywhere except Japan, Tetris came in the box.\n\nIts rivals had better screens: the Atari Lynx and Sega Game Gear had backlit colour displays, as did NEC\'s TurboExpress. The Game Boy beat them all on price and battery life. The smaller Game Boy Pocket followed in 1996, and the backward-compatible Game Boy Color in 1998.\n\nThe platform\'s best-selling games were Pokémon Red, Blue and Yellow, with more than 46 million copies. The Game Boy and Game Boy Color together sold 118.69 million units before the line was discontinued on 31 March 2003.',
  },
  {
    id: 'nintendo-64', name: 'Nintendo 64', shortName: 'N64', era: '1996 – 2002',
    manufacturer: 'Nintendo',
    keyword: 'Nintendo 64',
    sources: [
      { title: 'Nintendo 64', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Nintendo_64' },
    ],
    description: 'Nintendo\'s first fully 3D console introduced the analog thumbstick to its controllers and produced Super Mario 64, Ocarina of Time and GoldenEye 007. Its choice of cartridges over CD-ROM pushed Square, Enix and other third parties toward the PlayStation.',
    longDescription: 'The Nintendo 64 grew out of Project Reality, a partnership with Silicon Graphics that began in 1993. It was released in Japan on 23 June 1996, in North America on 29 September 1996 and in Europe on 1 March 1997, built around an NEC VR4300 processor at 93.75 MHz — based on the MIPS R4300i — and the Reality Coprocessor, which handled graphics, audio and memory management. Its controller introduced an analog stick as standard, and the console had four controller ports for multiplayer.\n\nNintendo chose ROM cartridges over CD-ROM for faster loading and resistance to piracy, but cartridges cost more and held far less data, up to 64 MB. That pushed third-party developers including Square and Enix toward the PlayStation and left the N64 with a smaller library, strongest in North America and weaker in Japan and Europe. Accessories such as the Rumble Pak, the Controller Pak and the Expansion Pak extended it.\n\nWhat it lacked in breadth it made up in landmark games: Super Mario 64, The Legend of Zelda: Ocarina of Time and GoldenEye 007 remain among the most acclaimed ever made. The N64 sold 32.93 million units and was discontinued in 2002, after the GameCube\'s launch.',
  },
  {
    id: 'playstation', name: 'PlayStation', shortName: 'PS1', era: '1994 – 2006',
    manufacturer: 'Sony',
    keyword: 'PlayStation',
    sources: [
      { title: 'PlayStation (console)', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/PlayStation_(console)' },
    ],
    description: 'Sony\'s first console grew out of a cancelled Super NES CD-ROM add-on. Launched at $299 in North America, it courted third-party developers with PC-based tools and cheap CDs, and became the first computer entertainment platform to ship over 100 million units.',
    longDescription: 'The PlayStation began as a CD-ROM add-on for Nintendo\'s Super NES, led at Sony by Ken Kutaragi. The deal collapsed in 1991 when Nintendo turned to Philips at that year\'s Consumer Electronics Show, and Sony went on to develop its own console. It launched in Japan on 3 December 1994, in North America on 9 September 1995 at $299, after a reveal at the first E3, and in Europe on 29 September 1995, built around a 32-bit R3000 processor at about 33.87 MHz.\n\nSony courted outside developers with support and PC-based development kits, and CD-ROMs were far cheaper to manufacture than cartridges. The result was a vast library: Final Fantasy VII, Tekken, Crash Bandicoot, Resident Evil and Gran Turismo all became defining games of the platform.\n\nA smaller redesign, the PS one, followed on 7 July 2000, and the console was discontinued on 23 March 2006 after selling 102.49 million units — the first computer entertainment platform to ship more than 100 million. The combined success of the PlayStation and its successor contributed to Sega\'s retirement of the Dreamcast in 2001 and its exit from the console business.',
  },
  {
    id: 'sega-saturn', name: 'Sega Saturn', shortName: 'Saturn', era: '1994 – 2000',
    manufacturer: 'Sega',
    keyword: 'Sega Saturn',
    sources: [
      { title: 'Sega Saturn', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Sega_Saturn' },
    ],
    description: 'Sega\'s 32-bit console was a hit in Japan but was undone in the West by a surprise $399 launch and a complex dual-CPU design. It sold 9.26 million units and is remembered for games such as Panzer Dragoon Saga, Sakura Wars and Guardian Heroes.',
    longDescription: 'The Saturn launched in Japan on 22 November 1994 at ¥44,800, and its first 200,000 units sold out on the first day, driven by Virtua Fighter, which sold almost one copy for every console. Its two Hitachi SH-2 processors were powerful but complex: they shared a bus and could not access system memory at the same time, developers found the design hard to use, and analysts described it as essentially 2D hardware.\n\nIn the West the launch went wrong. At E3 in May 1995 Sega released the Saturn in North America four months early, at $399 and with only six games; retailers that had not been told in advance were upset, and KB Toys refused to stock it. At the same show Sony announced the PlayStation at $299. The PlayStation went on to outsell the Saturn two to one in 1996 and three to one in the US in 1997, and Sega cancelled Sonic X-treme in early 1997, leaving the Saturn without a 3D Sonic game.\n\nThe Saturn was discontinued in North America in March 1998 and in Japan in 2000, having sold 9.26 million units — 5.75 million of them in Japan and 1.8 million in the US. Much of its best software, including Sakura Wars and Grandia, was Japan-exclusive or never localised for it, and only fewer than 20,000 retail copies of Panzer Dragoon Saga were released in North America.',
  },
  {
    id: 'dreamcast', name: 'Sega Dreamcast', shortName: 'Dreamcast', era: '1998 – 2001',
    manufacturer: 'Sega',
    keyword: 'Dreamcast',
    sources: [
      { title: 'Dreamcast', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Dreamcast' },
    ],
    description: 'Sega\'s last console was the first with a built-in modem and introduced the VMU memory card with its own screen. Launched in 1998, it sold 9.13 million units before Sega discontinued it in March 2001 and became a third-party developer.',
    longDescription: 'Two teams, one led by Hideki Sato and one by Tatsuo Yamamoto, worked on the hardware that became the Dreamcast. Sega chose low-cost, PC-like parts — a Hitachi SH-4 processor and an NEC PowerVR2 graphics chip — and its own GD-ROM disc format to avoid DVD licensing costs. It was the first console to include a built-in modem for internet access and online play: early Japanese and PAL models used 33.6 kbit/s modems, and consoles sold in the US, and in Japan after September 1999, used 56 kbit/s.\n\nThe Dreamcast launched in Japan on 27 November 1998 at ¥29,000, amid supply shortages and with only the Virtua Fighter 3 port selling well. Its North American launch on 9 September 1999 at $199 was far stronger, with more than 225,000 units sold in 24 hours, and it reached Europe in October 1999. SegaNet launched in September 2000, and Phantasy Star Online became a landmark of console online play; Sonic Adventure was its best-selling game, at 2.5 million copies, alongside Crazy Taxi, Shenmue and Jet Set Radio.\n\nSony\'s announcement and release of the PlayStation 2 drew buyers away, and the PSone outsold the Dreamcast in the US. On 31 January 2001 Sega announced the end of its hardware business, discontinued the Dreamcast on 31 March 2001 and restructured as a third-party developer, after several years of financial losses. More than 600 games were released, and the console sold about 9.13 million units.',
  },
  {
    id: 'turbografx-16', name: 'TurboGrafx-16', shortName: 'TG-16', era: '1987 – 1994',
    manufacturer: 'NEC / Hudson Soft',
    keyword: 'TurboGrafx-16',
    sources: [
      { title: 'TurboGrafx-16', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/TurboGrafx-16' },
    ],
    description: 'NEC and Hudson Soft\'s PC Engine was at one point Japan\'s best-selling console and the first to use CD-ROM. As the TurboGrafx-16 in North America it struggled against the Genesis, despite a library of excellent shooters and action games.',
    longDescription: 'The PC Engine, developed by Hudson Soft and manufactured by NEC, launched in Japan on 30 October 1987 and sold 500,000 units in its first week; at one point it was the best-selling console in the country. Its games came on HuCards, thin credit-card-sized cartridges, and the CD-ROM² add-on, released in Japan on 4 December 1988, made it the first console to use CD-ROM as a storage medium.\n\nThe North American TurboGrafx-16 followed in August 1989 with Keith Courage in Alpha Zones as its pack-in, after the Sega Genesis was already on sale. NEC\'s costly redesign of the console for the American market, an overproduction of 750,000 units and a lack of third-party support worked against it; 750,000 consoles had been sold there by March 1991. In mid-1992 Turbo Technologies, a Hudson–NEC joint venture, took over the North American business and launched the combined TurboDuo that October.\n\nIn Japan the PC Engine family had sold 10 million units by 1995, and NEC released several variants, including the more powerful SuperGrafx (1989), which received only five exclusive games. The console was discontinued in North America on 11 May 1994 and in Japan on 16 December 1994.',
  },
  {
    id: 'neo-geo', name: 'Neo Geo AES', shortName: 'Neo Geo', era: '1990 – 2004',
    manufacturer: 'SNK',
    keyword: 'Neo Geo',
    sources: [
      { title: 'Neo Geo (system)', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Neo_Geo_(system)' },
    ],
    description: 'SNK\'s Neo Geo brought its MVS arcade hardware home: more powerful than any console when it was released, it launched in the US at $649.99 with games from about $200. Its fighting games and Metal Slug defined it, and official releases continued until 2004.',
    longDescription: 'SNK launched the Neo Geo MVS arcade system in Japan on 16 April 1990 and the AES home console ten days later. Because it was so expensive to make, the AES was first offered for rent to commercial venues in Japan. The hardware, a Motorola 68000 with a Zilog Z80 coprocessor and a Yamaha YM2610 sound chip, was more powerful than any games console at the time, and its cartridges could hold up to 330 megabits — advertised as "Max 330 Mega Pro-Gear Spec".\n\nIn the US the Gold System launched at $649.99, with a cheaper Silver System at $399.99 with one controller, and games cost about $200 and up. The home cartridges carried the same games as the arcade boards, and its best-known games were fighting games — Fatal Fury, Art of Fighting, Samurai Shodown and The King of Fighters — and for the run-and-gun Metal Slug.\n\nThe Neo Geo CD followed in 1994. AES production ended in 1997, but the arcade hardware lived on: the last official game, Samurai Shodown V Special, was released in 2004, when MVS production also ended. SNK sold about a million MVS units and 410,000 AES consoles.',
  },
  {
    id: 'amiga', name: 'Commodore Amiga', shortName: 'Amiga', era: '1985 – 1996',
    manufacturer: 'Commodore International',
    keyword: 'Amiga',
    sources: [
      { title: 'Amiga', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Amiga' },
    ],
    description: 'Commodore\'s Amiga combined custom graphics, sound and DMA chips with a pre-emptively multitasking operating system. HAM mode showed up to 4,096 colours, Paula played four channels of sampled sound, and the Amiga 500 was a best-seller in the UK and Germany.',
    longDescription: 'The Amiga was developed by Amiga Corporation under the codename "Lorraine", with Jay Miner — who had led development of the Atari VCS\'s Television Interface Adaptor — in charge of the hardware. Commodore bought the company in 1984 and released the Amiga 1000 in July 1985, built around a Motorola 68000, although production problems delayed wide availability until early 1986.\n\nIts custom chips — Agnus, Denise and Paula — handled graphics, audio and DMA independently of the processor. In HAM mode it could display up to 4,096 colours, and Paula provided four channels of 8-bit PCM sound. AmigaOS was one of the first consumer operating systems with pre-emptive multitasking, and NewTek\'s Video Toaster (1990) made the Amiga a low-cost option for video production. Populous (1989) and Lemmings (1991) both originated on the platform.\n\nThe Amiga 500 of 1987 was the best-selling model and was most popular in the UK and Germany. The machine\'s advantage eroded as IBM PC compatibles gained 256-colour VGA graphics from 1987 and improved rapidly. Commodore shut down its Amiga division on 26 April 1994 and filed for bankruptcy three days later; estimates of total sales range from about 4.85 to 5 million.',
  },
  {
    id: 'atari-st', name: 'Atari ST', era: '1985 – 1993',
    manufacturer: 'Atari Corporation',
    keyword: 'Atari ST',
    sources: [
      { title: 'Atari ST', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Atari_ST' },
    ],
    description: 'Jack Tramiel\'s Atari Corporation built the 68000-based ST in about five months and released it in 1985. Built-in MIDI ports made it a favourite of musicians, and West Germany became its strongest market.',
    longDescription: 'Jack Tramiel bought Atari\'s consumer division in July 1984, renaming it Atari Corporation, and a team led by former Commodore engineer Shiraz Shivji designed the 520ST in about five months. It was built around the Motorola 68000 and ran the GEM graphical environment on Atari\'s TOS operating system. The 520ST reached developers in early 1985 and general retail in July 1985, at $799.99 with a monochrome monitor or $999.99 with colour.\n\nIts built-in MIDI ports made the ST popular with musicians, and many well-known artists used it for music production. West Germany became Atari\'s strongest market, where business users also adopted it for desktop publishing and CAD. Among its games, Dungeon Master was the platform\'s best-selling software, and MIDI Maze (1987) used the MIDI ports to link up to 16 machines for networked first-person deathmatch.\n\nThe enhanced STE line arrived in late 1989 with improved graphics and sound and a blitter chip, and the Falcon, released in 1992, was the last machine in the line. Atari discontinued the ST family in 1993.',
  },
  {
    id: 'atari-8bit', name: 'Atari 8-bit', shortName: 'Atari 8-bit', era: '1979 – 1992',
    manufacturer: 'Atari, Inc.',
    keyword: 'Atari 8-bit',
    sources: [
      { title: 'Atari 8-bit computers', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Atari_8-bit_computers' },
    ],
    description: 'Atari\'s 400, 800, XL and XE home computers used custom ANTIC, CTIA/GTIA and POKEY chips, giving them graphics superior to the Apple II\'s. Star Raiders was the platform\'s killer app, and Atari supported the line from 1979 until 1992.',
    longDescription: 'Atari\'s engineers began planning a successor to the VCS in 1976–77, and design of what became the Atari home computers started in late 1977. Jay Miner created their two-chip display architecture, and the low-end machine, codenamed Candy, was first designed as a games console. Atari spent about $10 million developing the custom chips: ANTIC and CTIA (later GTIA) for graphics, and POKEY for sound and input.\n\nThe Atari 400 and 800 shipped in November 1979, the 800 as the high-end model and the 400 as the cheaper one. Their graphics were superior to the Apple II\'s, although InfoWorld noted in 1981 that the software library was no match for Apple\'s. Star Raiders (1980) became the platform\'s killer app, and M.U.L.E. is among its best-remembered games.\n\nThe line was refreshed with the 1200XL, 600XL and 800XL in 1983 and the 65XE and 130XE in 1985. About two million were sold between late 1979 and mid-1985, and Atari Corporation dropped all remaining support in 1992.',
  },
  {
    id: 'atari-lynx', name: 'Atari Lynx', shortName: 'Lynx', era: '1989 – 1995',
    manufacturer: 'Atari Corporation',
    keyword: 'Atari Lynx',
    sources: [
      { title: 'Atari Lynx', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Atari_Lynx' },
    ],
    description: 'The first handheld games console with a colour LCD, designed at Epyx and sold by Atari. Its backlit screen and hardware sprite scaling outclassed the Game Boy, but six AA batteries lasted only four to five hours, and it sold far fewer units.',
    longDescription: 'The Lynx began at Epyx as the "Handy Game", designed by RJ Mical and Dave Needle, two veterans of the original Amiga team. When Epyx went bankrupt, Atari effectively took over the project and handled its production and marketing. It launched in North America in September 1989 at $179.99, five months after the Game Boy, and reached Europe and Japan in 1990.\n\nIts hardware was ahead of Nintendo\'s: a backlit colour screen, hardware sprite scaling, a screen that could be flipped for left- or right-handed play, and a link cable that allowed up to eight players reliably. But it ran on six AA batteries that lasted four to five hours, and its library reached only 71 games.\n\nThe Lynx sold about 500,000 units in the US in 1990 and an estimated 800,000 by late 1991. The smaller Lynx II followed in July 1991 at $99, with a stereo headphone jack and slightly longer battery life, but it now also faced Sega\'s Game Gear, released that May. Atari discontinued the Lynx in 1995.',
  },
  {
    id: '3do', name: '3DO Interactive Multiplayer', shortName: '3DO', era: '1993 – 1996',
    manufacturer: 'Various (Panasonic, Goldstar, Sanyo)',
    keyword: '3DO',
    sources: [
      { title: '3DO Interactive Multiplayer', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/3DO_Interactive_Multiplayer' },
    ],
    description: 'Trip Hawkins\'s console was a licensed standard built by Panasonic, GoldStar and Sanyo. Launched at $699.99 in 1993 — far above its rivals — it was named Time\'s Product of the Year but never escaped its price or the PlayStation\'s arrival.',
    longDescription: 'The 3DO Company, spun off from Electronic Arts in 1991 and led by EA\'s founder Trip Hawkins, did not build consoles itself. It licensed a hardware design by Dave Needle and RJ Mical of the New Technology Group to electronics companies — Panasonic first, then GoldStar and Sanyo — and earned royalties on hardware, while charging publishers only $3 per game. The specification was advanced for 1993: a 32-bit ARM60 processor at 12.5 MHz, 2 MB of RAM and 1 MB of video RAM, a double-speed CD-ROM drive and a graphics engine capable of scaling, rotation and texture mapping.\n\nPanasonic\'s FZ-1 launched in North America on 4 October 1993 at $699.99, and Time named the 3DO its 1993 Product of the Year. But because each manufacturer had to make a profit on the hardware, the machine stayed expensive: the FZ-1 fell to $399.99 in autumn 1994 and to $299 later that year, and by December 1995 GoldStar was losing more than $100 on every unit it sold at $199.\n\nOnly one game, Crash \'N Burn, was ready at launch, though later titles included Gex, Myst and Alone in the Dark. GoldStar dropped the system in early 1996 and production ended late that year. Estimates of total sales vary from about 750,000 to two million, and the planned successor, M2, was cancelled and its technology sold to Matsushita.',
  },
  {
    id: 'atari-jaguar', name: 'Atari Jaguar', shortName: 'Jaguar', era: '1993 – 1996',
    manufacturer: 'Atari Corporation',
    keyword: 'Atari Jaguar',
    sources: [
      { title: 'Atari Jaguar', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Atari_Jaguar' },
    ],
    description: 'Marketed with the slogan "Do the math!" as a 64-bit console — a claim critics disputed — the Jaguar was Atari\'s last home console. Hardware bugs and unfinished tools frustrated developers, and only 63 licensed games were released.',
    longDescription: 'The Jaguar was designed by Flare Technology, the company formed by Martin Brennan and John Mathieson, and Atari cancelled its Panther console in 1991 to concentrate on it. IBM manufactured it under a $500 million deal. Atari\'s marketing leaned on its 64-bit claim: its custom Tom and Jerry chips were 32-bit, which led critics to call the claim misleading, though Next Generation argued it was valid because the data path was 64-bit.\n\nThe console went on sale in test markets in New York and San Francisco on 23 November 1993 at $249.95, with a nationwide release in 1994. Hardware bugs and unfinished development tools pushed many developers to rely on its Motorola 68000 rather than the custom chips, and its 17-button controller was widely criticised. Only 63 licensed games were released, 50 on cartridge and 13 on CD, although Jeff Minter\'s Tempest 2000 and Alien vs. Predator were acclaimed.\n\nAtari sold about 100,000 units by the end of 1994 and roughly 125,000 through 1995, with about 100,000 more left in inventory. The Jaguar CD followed in September 1995, Atari abandoned the platform that November, and it merged with JTS in 1996. In 1999 Hasbro Interactive released the Jaguar\'s patents into the public domain, opening the door to homebrew development.',
  },
  {
    id: 'virtual-boy', name: 'Nintendo Virtual Boy', shortName: 'Virtual Boy', era: '1995 – 1996',
    manufacturer: 'Nintendo',
    keyword: 'Virtual Boy',
    sources: [
      { title: 'Virtual Boy', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Virtual_Boy' },
    ],
    description: 'Gunpei Yokoi\'s tabletop console used oscillating mirrors and red LED displays to create a stereoscopic 3D image. Its monochrome red screen, awkward visor and reports of eye strain made it Nintendo\'s first major hardware failure: 770,000 units and 22 games.',
    longDescription: 'Nintendo R&D1 developed the Virtual Boy under Gunpei Yokoi over nearly four years, licensing a red LED display from the US company Reflection Technology. Linear LED arrays were swept across the player\'s view by oscillating mirrors, which created the image and an audible hum. Plans for a head-mounted unit with head tracking were dropped because of concerns about motion sickness, children\'s eye health, injury and Japanese product liability law, so the system became a stationary tabletop unit that players leaned into.\n\nRed LEDs were the cheapest option, used less battery power and gave the black backgrounds that sold the illusion of depth; Nintendo said full colour would look "jumpy" and be prohibitively expensive. Every official game included an automatic pause prompting players to take a break every 15 to 30 minutes to reduce eye strain.\n\nThe Virtual Boy launched in Japan on 21 July 1995 and in North America on 14 August at $179.95, backed by an estimated $25 million in promotion, and never reached PAL regions. It sold 770,000 units with 22 games before Nintendo quietly ended it — in Japan in December 1995 and in North America in August 1996. Yokoi left Nintendo that August; his departure was widely linked to the failure, though he had long planned to retire around that age and Nintendo called the timing coincidental.',
  },
  {
    id: 'msx', name: 'MSX', era: '1983 – 1993',
    manufacturer: 'Various (Sony, Panasonic, Toshiba, Philips, etc.)',
    keyword: 'MSX',
    sources: [
      { title: 'MSX', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/MSX' },
    ],
    description: 'ASCII and Microsoft Japan\'s MSX was a shared home-computer standard built by many manufacturers. Strongest in Japan, South Korea, Argentina and Brazil, it was where Konami made the first two Metal Gear games, Vampire Killer and Nemesis.',
    longDescription: 'ASCII Corporation, led by Kazuhiko Nishi and working with Microsoft Japan, announced MSX in June 1983 as a common standard that many manufacturers could build to. It was assembled from off-the-shelf parts — a Zilog Z80 processor, a Texas Instruments TMS9918 graphics chip, an AY-3-8910 sound chip and MSX BASIC in ROM — so software written for the standard ran on any compliant machine.\n\nMSX was most popular in Japan, South Korea, Argentina and Brazil, and fairly popular in continental Europe, especially the Netherlands and Spain. Konami was one of its most important developers, producing the first two Metal Gear games, Vampire Killer (a Castlevania game) and Nemesis (Gradius) for the platform. Sales estimates vary widely, from about four million to nine million units.\n\nThe standard went through four generations: MSX (1983), MSX2 (1985) with Yamaha\'s V9938 video chip, and the Japan-only MSX2+ (1988) and turboR (1990), the last built around the faster R800 processor. Microsoft ended its partnership with ASCII in 1986, the turboR sold poorly because of its high price, and production ended in 1993.',
  },
  {
    id: 'game-gear', name: 'Sega Game Gear', shortName: 'Game Gear', era: '1990 – 1997',
    manufacturer: 'Sega',
    keyword: 'Game Gear',
    sources: [
      { title: 'Game Gear', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Game_Gear' },
    ],
    description: 'Sega\'s first handheld put Master System hardware behind a backlit colour screen. It outclassed the Game Boy\'s display but drained six AA batteries in three to five hours, and sold about 14 million units.',
    longDescription: 'The Game Gear launched in Japan on 6 October 1990 at ¥19,800 and in North America and Europe in April 1991, at $149.99 and £99.99. It was based on the Master System — a Zilog Z80 processor at 3.5 MHz with 8 KB of RAM and 16 KB of video RAM — and its 3.2-inch backlit LCD showed 32 colours at once from a palette of 4,096, at 160 × 144 pixels. Columns was the pack-in game.\n\nIts screen gave it an advantage over the Game Boy, but it needed six AA batteries and lasted roughly three to five hours, which reviewers criticised. Accessories extended it in unusual directions: a TV Tuner let it receive television broadcasts, and the Master Gear adapter played Master System cartridges. Its library grew to more than 300 games, many of them Master System ports, and Sonic the Hedgehog 2 was its best-selling title, at 400,000 copies.\n\nThe Game Gear sold about 14 million units. Sega cancelled a planned 16-bit successor and favoured its home consoles, releasing the Genesis Nomad in 1995, and the Game Boy Pocket also hurt sales. Sega ended support in Japan in 1996 and worldwide in 1997, though Majesco sold a budget version from 2000 to 2002.',
  },
  {
    id: 'zx-spectrum', name: 'ZX Spectrum', era: '1982 – 1992',
    manufacturer: 'Sinclair Research',
    keyword: 'ZX Spectrum',
    sources: [
      { title: 'ZX Spectrum', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/ZX_Spectrum' },
    ],
    description: 'Sinclair\'s rubber-keyed home computer launched at £125 in 1982, sold more than five million units and was Britain\'s top-selling computer for years. It helped establish the UK games industry: by the end of 1983 more than 450 companies were selling games for it on cassette.',
    longDescription: 'Sinclair Research launched the ZX Spectrum in Britain on 23 April 1982, at £125 for the 16K model and £175 for the 48K — the 16K price well below that of the BBC Micro. Richard Altwasser designed its ULA chip and Rick Dickinson its case and rubber keyboard, which many early users disliked. A Zilog Z80 at 3.5 MHz drove a display of 15 colours, limited by "attribute clash": each 8×8 block of pixels could hold only two colours, so moving sprites often took on the colours of the background. Sound came from a single-channel beeper until the 128K models added an AY-3-8912 chip.\n\nComputer games were the dominant part of the British home video game market until consoles overtook them in 1991, and the Spectrum was at the centre of it. It helped establish the UK games industry: by the end of 1983 more than 450 companies were selling games on cassette, and its library includes Manic Miner, Jet Set Willy, The Hobbit, Knight Lore and Elite.\n\nThe Spectrum+, 128, +2 and +3 followed, the later models after Amstrad bought Sinclair\'s computer range in 1986 for £5 million. The Spectrum remained Britain\'s best-selling computer until the Amstrad PCW overtook it, sold more than five million units in all, and was discontinued in 1992.',
  },
  {
    id: 'famicom-disk-system', name: 'Famicom Disk System', shortName: 'Famicom Disk System', era: '1986 – 1990',
    manufacturer: 'Nintendo',
    keyword: 'Famicom Disk System',
    sources: [
      { title: 'Family Computer Disk System', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Family_Computer_Disk_System' },
    ],
    description: 'Nintendo\'s Famicom add-on used rewritable Disk Cards and in-store Disk Writer kiosks that rewrote games for ¥500. It launched with The Legend of Zelda, hosted Metroid and Kid Icarus, and sold about 4.4 million units.',
    longDescription: 'Nintendo released the Family Computer Disk System in Japan on 21 February 1986 for ¥15,000. Its games came on proprietary Disk Cards, based on Mitsumi\'s Quick Disk, holding 112 KB per double-sided disk, and it added an extra wavetable sound channel through its Ricoh 2C33 chip. The Legend of Zelda was its launch title.\n\nThe system\'s distinctive feature was the Disk Writer: kiosks in shops where players could have a new game written onto their disk for ¥500, about a sixth of the price of many new cartridge games. From 1987, Disk Fax kiosks let players submit high scores to Nintendo for nationwide leaderboards. Metroid, Kid Icarus, Zelda II and Akumajō Dracula (Castlevania) appeared on the format, and Yume Kōjō: Doki Doki Panic was later reworked into the Western Super Mario Bros. 2.\n\nThe format had real weaknesses: disks were fragile and easy to pirate, loading was slow, and the drive belt was poor. By 1989 cartridges had become easier and cheaper to produce, and Nintendo officially discontinued the system in 1990 after selling about 4.4 million units — although the disk-writing service ran until 2003.',
  },
  {
    id: 'colecovision', name: 'ColecoVision', era: '1982 – 1985',
    manufacturer: 'Coleco',
    keyword: 'ColecoVision',
    sources: [
      { title: 'ColecoVision', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/ColecoVision' },
    ],
    description: 'Coleco\'s 1982 console shipped with Donkey Kong and built its reputation on arcade conversions. Its Expansion Module #1 played Atari 2600 cartridges, and it sold more than 2 million units before Coleco left the video game business in 1985.',
    longDescription: 'The ColecoVision launched in North America in August 1982, with Nintendo\'s Donkey Kong as its pack-in game, and reached Europe in July 1983 as the CBS ColecoVision. Its hardware was strong for the time: a Zilog Z80A processor at 3.58 MHz, a Texas Instruments TMS9918A video chip with 16 KB of video RAM, and an SN76489 sound chip. It sold more than 500,000 units by Christmas 1982 and over a million by early 1983.\n\nColeco extended the console with expansion modules. Expansion Module #1 contained a complete set of Atari 2600 electronics, letting it play 2600 cartridges; Atari took legal action, and the companies settled out of court, with Coleco licensed under Atari\'s patents. Expansion Module #2 was a steering wheel and pedal packaged with Turbo, and Expansion Module #3 turned the console into the Adam computer.\n\nThe Adam was discontinued in January 1985, and Coleco planned to leave the video game market by the middle of that year; the ColecoVision was officially discontinued by October 1985. Its total sales are uncertain but exceeded two million consoles.',
  },
  {
    id: 'pc-9801', name: 'NEC PC-9801', shortName: 'PC-9801', era: '1982 – 2003',
    manufacturer: 'NEC',
    keyword: 'PC-9801',
    sources: [
      { title: 'PC-9800 series', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/PC-9800_series' },
    ],
    description: 'NEC\'s PC-9801 dominated Japanese personal computing, with more than 60% of the market through the 1980s and early 1990s and 18.3 million units shipped. Its Japanese-only ecosystem produced strategy games, visual novels and the early Touhou Project titles.',
    longDescription: 'NEC launched the PC-9801 in October 1982 with an Intel 8086 processor at 5 MHz, 128 KB of RAM and an eight-colour 640×400 display. Most users added a kanji ROM board to display Japanese text, until later models built the font in. Over its life the platform ran N88-BASIC(86), CP/M-86, MS-DOS, OS/2 and versions of Windows up to Windows 2000. NEC held about half of the Japanese PC market by the end of 1983 and more than 60% in the 1980s and early 1990s.\n\nThe platform\'s graphics could be expanded to 16 colours from a palette of 4,096, and NEC\'s FM sound boards — the YM2203-based PC-9801-26 and the YM2608-based PC-9801-86, which added CD-quality PCM playback — gave its games rich music. Its library was its own: strategy games such as Daisenryaku and Romance of the Three Kingdoms, dating sims and visual novels such as Dōkyūsei and YU-NO, Hideo Kojima\'s Policenauts and the early Touhou Project games.\n\nIts dominance ended in the 1990s. DOS/V clones arrived in 1990, a Compaq price cut in 1992 started a price war, and Windows 95 overturned the PC-98\'s advantage. NEC launched the Windows-based PC98-NX in 1997; the last PC-9801-lineage model appeared in 2000, and the line was discontinued in 2003 after shipping 18.3 million units.',
  },
]);

// ── Pre-computed indices ────────────────────────────────────────────────────

// A game's platform string ("SNES", "PC/DOS") resolved to exactly one platform
// id. The old test was `g.platform.toLowerCase().includes(keyword)`, and
// "snes".includes("nes") is true — so with NES listed before SNES, every one of
// the 38 SNES games linked to /platforms/nes and was counted under it, while
// /platforms/snes listed almost nothing. Match whole tokens instead, and when
// several aliases match let the longest win, so a PC-9801 game resolves to
// PC-9801 rather than the shorter 'PC' keyword.
function platformTokens(s) { return clNorm(s).split(' ').filter(Boolean); }
// Length of `alias` if its tokens appear as a contiguous run in `tokens`, else 0.
function aliasScore(tokens, alias) {
  const a = platformTokens(alias);
  if (!a.length || a.length > tokens.length) return 0;
  outer: for (let i = 0; i + a.length <= tokens.length; i++) {
    for (let j = 0; j < a.length; j++) if (tokens[i + j] !== a[j]) continue outer;
    return a.length;
  }
  return 0;
}
const platformIdCache = new Map();
function resolvePlatformId(gamePlatform) {
  const key = String(gamePlatform == null ? '' : gamePlatform);
  if (platformIdCache.has(key)) return platformIdCache.get(key);
  const tokens = platformTokens(key);
  let bestId = null, bestScore = 0;
  for (const p of PLATFORMS) {
    for (const alias of [p.keyword, p.shortName, p.name]) {
      const score = alias ? aliasScore(tokens, alias) : 0;
      if (score > bestScore) { bestScore = score; bestId = p.id; }
    }
  }
  platformIdCache.set(key, bestId);
  return bestId;
}

// One resolver drives the hub listing, the game-page link and the compare
// counts, so the three can no longer disagree about which platform a game is on.
const platformGamesIndex = new Map();
for (const platform of PLATFORMS) {
  platformGamesIndex.set(platform.id, games.filter(g => resolvePlatformId(g.platform) === platform.id));
}

const genreGamesIndex = new Map();
for (const genre of GENRES) {
  const genreSet = new Set(genre.genres);
  genreGamesIndex.set(genre.id, games.filter(g => genreSet.has(g.genre)));
}

const developerGamesIndex = new Map();
for (const dev of DEVELOPERS) {
  developerGamesIndex.set(dev.id, games.filter(g =>
    g.developer.toLowerCase().includes(dev.keyword.toLowerCase()) ||
    g.publisher.toLowerCase().includes(dev.keyword.toLowerCase())
  ));
}

const yearsIndex = new Map();
for (const g of games) {
  if (!yearsIndex.has(g.year)) yearsIndex.set(g.year, []);
  yearsIndex.get(g.year).push(g);
}
const YEARS = [...yearsIndex.keys()].sort((a, b) => a - b);

const designerGamesIndex = new Map();
// Explicit ids, like composers. Matching on the employer name credited every
// Capcom game to Okamoto, Fujiwara, Inafune, Mikami and Kamiya alike.
for (const d of DESIGNERS) {
  const ids = new Set(d.notableGameIds || []);
  designerGamesIndex.set(d.id, games.filter(g => ids.has(g.id)));
}

const composerGamesIndex = new Map();
for (const c of COMPOSERS) {
  const ids = new Set(c.notableGameIds || []);
  composerGamesIndex.set(c.id, games.filter(g => ids.has(g.id)));
}

const franchiseGamesIndex = new Map();
for (const f of FRANCHISES) {
  const tk = f.titleKeyword.toLowerCase();
  const dk = (f.developerKeyword || '').toLowerCase();
  const matched = games.filter(g => {
    const titleMatch = g.title.toLowerCase().includes(tk);
    const devMatch = !dk || g.developer.toLowerCase().includes(dk) || g.publisher.toLowerCase().includes(dk);
    return titleMatch && devMatch;
  }).sort((a, b) => a.year - b.year);
  franchiseGamesIndex.set(f.id, matched);
}

const publisherGamesIndex = new Map();
for (const p of PUBLISHERS) {
  publisherGamesIndex.set(p.id, games.filter(g =>
    (g.publisher || '').toLowerCase().includes(p.keyword.toLowerCase()) ||
    g.developer.toLowerCase().includes(p.keyword.toLowerCase())
  ));
}

const arcadeBoardGamesIndex = new Map();
for (const b of ARCADE_BOARDS) {
  arcadeBoardGamesIndex.set(b.id, games.filter(g =>
    g.platform.toLowerCase().includes('arcade') &&
    (b.notableGames || []).some(ng => g.title.toLowerCase().includes(ng.toLowerCase().split(' (')[0]))
  ));
}

const decadesIndex = new Map();
for (const g of games) {
  if (!decadesIndex.has(g.decade)) decadesIndex.set(g.decade, []);
  decadesIndex.get(g.decade).push(g);
}
const DECADES = [...decadesIndex.keys()].sort();

const relatedGamesIndex = new Map();
for (const game of games) {
  const byDev = games.filter(g => g.id !== game.id &&
    g.developer.toLowerCase() === game.developer.toLowerCase()).slice(0, 4);
  const usedIds = new Set([game.id, ...byDev.map(g => g.id)]);
  const byGenre = games.filter(g => !usedIds.has(g.id) &&
    g.genre.toLowerCase() === game.genre.toLowerCase()).slice(0, 4);
  relatedGamesIndex.set(game.id, [...byDev, ...byGenre].slice(0, 6));
}

// ── CSS merge: one HTTP request instead of two ──────────────────────────────

const rawCss = [
  fs.readFileSync(path.join(__dirname, 'style.css'), 'utf8'),
  fs.readFileSync(path.join(__dirname, 'games.css'), 'utf8'),
].join('\n');
const cssHash = crypto.createHash('md5').update(rawCss).digest('hex').slice(0, 8);
const CSS_PATH = `/app.${cssHash}.css`;

function cssHead() {
  return `<link rel="preload" href="${CSS_PATH}" as="style"><link rel="stylesheet" href="${CSS_PATH}">
    <link rel="icon" href="/logo.svg" type="image/svg+xml">
    <meta name="theme-color" content="#0b0b0c">
    <script>try{if(localStorage.getItem("bosnan_theme")==="light"){document.documentElement.dataset.theme="light";document.querySelector('meta[name="theme-color"]').content="#f6f5f2"}}catch(e){}</script>`;
}

// ── Page caches ─────────────────────────────────────────────────────────────

// Decade filter tabs on the /games hub, in chronological order. Hard-coding
// them is what left the 203 1990s games with no tab to be filtered to.
const DECADE_TABS = [...new Set(games.map(g => g.decade).filter(Boolean))].sort();
const EAGER_IMAGES = 8;

let cachedGamesListHtml = null;
let cachedGenresListHtml = null;
let cachedEssaysListHtml = null;
let cachedYearsListHtml = null;
let cachedDecadesListHtml = null;
let cachedFamilyTreeHtml = null;
const cachedYearPageHtml = {};
const cachedDecadePageHtml = {};
const cachedEssayPageHtml = {};
const cachedGenrePageHtml = {};
const cachedGamePageHtml = new Map();
let cachedWordSearchHtml = null;
let cachedBookmarksHtml = null;
let cachedGlossaryHtml = null;
let cachedStudioMapHtml = null;
let cachedStatsHtml = null;
let cachedRecentHtml = null;
let cachedTimelineHtml = null;
let cachedSitemap = null;
let cachedHomepage = { html: null, day: -1 };

// ── Middleware ───────────────────────────────────────────────────────────────

app.use(compression());

// Security headers. HSTS is left to Vercel, which already sends it on every
// custom domain. The CSP still has to allow inline script and style: the pages
// carry per-page <script> blocks and onerror/onclick attributes, and moving
// those out is a larger job. What it does fix is the source list — scripts can
// only come from this origin and Google Tag Manager, nothing can frame the
// site, and no <form>, <base> or plugin can point off-site.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https://*.google-analytics.com https://*.googletagmanager.com",
  "connect-src 'self' https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com",
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');
app.use((req, res, next) => {
  res.set({
    'Content-Security-Policy': CSP,
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  });
  next();
});

// Host canonicalisation, for the one host Vercel will not canonicalise itself.
// The site answered on three hostnames at once — bosnan.net, www.bosnan.net and
// the bosnan.vercel.app deployment URL — each serving a full 200 of the same
// ~1,950 pages. Vercel 301s between the custom domains it owns once one is set
// as the Primary Domain, but it never redirects its own deployment URL, so
// bosnan.vercel.app stayed a complete crawlable duplicate of the archive.
//
// Deliberately scoped to `*.vercel.app` ONLY. Redirecting www→apex here as well
// would be redundant with Vercel's edge redirect and, while the dashboard still
// has www as Primary, would fight it: Vercel 301s apex→www at the edge, this
// 301s www→apex, and the browser loops until it gives up. Leave the custom
// domains to the dashboard, which is the only place that knows which way round
// they are currently pointed.
//
// Production only: preview deployments (VERCEL_ENV === 'preview') must keep
// serving themselves, and local dev must not bounce to the live site.
const CANONICAL_HOST_REDIRECT = process.env.VERCEL_ENV === 'production'
  || process.env.CANONICAL_HOST_REDIRECT === '1';
app.use((req, res, next) => {
  if (!CANONICAL_HOST_REDIRECT) return next();
  const host = (req.headers['x-forwarded-host'] || req.headers.host || '').split(':')[0].toLowerCase();
  if (!host || host === SITE_HOST) return next();
  // Preview deployments keep serving themselves; `*-git-*` and the hashed build
  // hosts are already excluded by VERCEL_ENV above, and this is the belt to it.
  if (/-git-|-[a-z0-9]{9}\./.test(host)) return next();
  // Only hosts we own get redirected. The apex is covered explicitly because it
  // is the one that mattered: Vercel serves the site on www and 307s the apex
  // onto it, while every canonical, og:url, JSON-LD url and sitemap <loc> named
  // the apex — so the canonical each page declared was a URL that redirected
  // away, on all ~1,950 of them. Whichever host SITE_URL names, the rest 301.
  const ours = host === CANONICAL_APEX || host.endsWith('.' + CANONICAL_APEX)
    || (host.startsWith('bosnan') && host.endsWith('.vercel.app'));
  if (!ours) return next();
  return res.redirect(301, `${SITE_URL}${req.originalUrl}`);
});

// Express matches routes case-insensitively, so /GAMES returned the /games hub
// as a full 200 carrying its own self-referencing canonical — a duplicate of
// every hub page for whatever casing a crawler happened to find. Redirect to
// the lowercase form, which is what every route, id and sitemap entry uses.
// Paths with a file extension are left alone: /images/* is served by
// express.static, whose filenames are case-sensitive on disk.
app.use((req, res, next) => {
  if (!req.path.includes('.') && req.path !== req.path.toLowerCase()) {
    return res.redirect(301, req.path.toLowerCase() + req.originalUrl.slice(req.path.length));
  }
  next();
});

// Same problem, same fix, for the trailing slash: Express matches `/games/` and
// `/games/pac-man/` as readily as the bare form and serves a full 200. The
// canonical tag below already points at the slashless URL, so Google would
// consolidate them eventually — but only after spending crawl budget fetching
// every page twice. A 301 settles it on the first request.
app.use((req, res, next) => {
  if (req.path.length > 1 && req.path.endsWith('/')) {
    return res.redirect(301, req.path.replace(/\/+$/, '') + req.originalUrl.slice(req.path.length));
  }
  next();
});

// SEO/footer post-processing: every server-rendered HTML page gets a canonical
// URL, Open Graph / Twitter fallbacks derived from its <title> and meta
// description, and the shared site footer — without each of the ~80 page
// templates having to repeat the boilerplate. Pages that define their own
// tags (e.g. game detail pages) are left untouched.
// ---- Image reality check ---------------------------------------------------
// 230 of the 432 games name an `image` that is not on disk. The card grids hide
// it — every <img> carries an onerror that swaps in a letter placeholder — so
// nothing looks broken to a visitor, and the gap went unnoticed. Two things did
// notice: the sitemap declares an <image:image> for all 432, so a third of the
// image sitemap is 404s (a Search Console error), and og:image points at those
// same paths, so the share card for those pages resolves to nothing.
//
// The images that do exist are all small — 168 of 195 are under 300px wide and
// none reaches 600px. That matters only for the social card: every platform
// wants 600x315 at minimum and renders anything smaller as a cramped thumbnail,
// so a 250px screenshot is a *worse* card than the 1200x678 site default. It
// does not matter for Google Images, which indexes small images happily. Hence
// two gates rather than one — existence for the sitemap, existence plus width
// for og:image.
const OG_IMAGE_MIN_WIDTH = 600;
const imageMetaCache = new Map();

// Width and height from the file header alone, so this stays cheap enough to
// run lazily per image rather than scanning the whole directory at boot.
// Returns null for a file that is missing or in a format we do not parse.
function imageMeta(relPath) {
  const key = String(relPath).replace(/^\//, '');
  if (imageMetaCache.has(key)) return imageMetaCache.get(key);
  let meta = null;
  try {
    const buf = fs.readFileSync(path.join(__dirname, key));
    if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) {
      meta = { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
    } else if (buf[0] === 0xff && buf[1] === 0xd8) {
      // Walk the JPEG segment chain to the start-of-frame, which is the only
      // marker carrying the dimensions.
      for (let i = 2; i + 9 < buf.length;) {
        if (buf[i] !== 0xff) { i++; continue; }
        const marker = buf[i + 1];
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
          meta = { width: buf.readUInt16BE(i + 7), height: buf.readUInt16BE(i + 5) };
          break;
        }
        i += 2 + buf.readUInt16BE(i + 2);
      }
    } else {
      meta = { width: 0, height: 0 }; // on disk, but unmeasured
    }
  } catch (e) {
    meta = null; // missing or unreadable
  }
  imageMetaCache.set(key, meta);
  return meta;
}

// Good enough to declare in the image sitemap: the file is actually there.
function imageExists(relPath) {
  return !!relPath && !/^https?:/i.test(relPath) && imageMeta(relPath) !== null;
}

// Good enough to be a share card: on disk and wide enough that the large-image
// card renders. Remote images are trusted, having no local file to measure.
function imageUsableAsCard(relPath) {
  if (!relPath) return false;
  if (/^https?:/i.test(relPath)) return true;
  const m = imageMeta(relPath);
  return !!m && m.width >= OG_IMAGE_MIN_WIDTH;
}

// Every game has an original 1200×630 title card (scripts/generate-game-cards.js).
// 230 games named a picture that was never on disk and the rest are ~200–400px
// Wikipedia box art, so the card is what fills the gaps on the page and what
// every game-related share preview uses unless the game's own picture is big
// enough to render as a large card itself.
function gameCardPath(g) {
  return g && g.id ? `images/cards/${g.id}.png` : null;
}
// What to show on the page: the game's own picture if it exists, else its card.
function gameImagePath(g) {
  if (g && imageExists(g.image)) return g.image;
  const card = gameCardPath(g);
  return imageExists(card) ? card : null;
}
const isTitleCard = p => typeof p === 'string' && p.startsWith('images/cards/');
// What to use as og:image / schema image: own picture only if it is wide
// enough to render as a large card, else the title card.
function gameShareImage(g) {
  if (g && imageUsableAsCard(g.image)) return g.image;
  const card = gameCardPath(g);
  return imageUsableAsCard(card) ? card : null;
}

const DEFAULT_OG_IMAGE = `${SITE_URL}/images/screenshot1.png`;

// 1,509 of the 1,953 pages shared one og:image — the same generic screenshot —
// because only game pages (and the genre hubs) carry first-party imagery. That
// is the thumbnail every share, every Discover card and every social unfurl of
// three quarters of the archive used, so none of them looked like a page about
// their own subject.
//
// The archive does have a relevant picture for most of them; it just lives on
// another page. The cross-link engine already resolves an entry to the games it
// is about, so reuse that: a box-art entry for Sonic, a speedrun of Sonic and
// an essay that opens on Sonic all borrow the Sonic screenshot. Structured
// anchors are tried in the order clAnchors() returns them — the entry's own
// `game`/`title` fields before any mined prose mention — so a page falls back
// to an incidental mention only when it names no game outright.
function entryOgImage(cleanPath) {
  const e = clEntryByPath(cleanPath);
  if (!e) return null;
  const asUrl = img => `${SITE_URL}/${String(img).replace(/^\//, '')}`;
  if (imageUsableAsCard(e.image)) return asUrl(e.image);
  for (const a of clAnchors(e, clExtraKeys.get(clSlugByEntry.get(e)))) {
    const g = gameTitleExact.get(a) || gameTitlePrefix.get(a);
    const img = g && gameShareImage(g);
    if (img) return asUrl(img);
  }
  return null;
}
const GA_MEASUREMENT_ID = 'G-7PKQSXLCD8';
// The 174 KB gtag.js used to load from <head> with the page, and Lighthouse
// measured it as the largest third-party cost on every page (up to ~440 ms of
// main-thread blocking on mobile), competing with the first render. Commands are
// queued in dataLayer immediately, so the pageview is still recorded; only the
// library download waits until the page has loaded and the browser is idle.
const GA_SNIPPET = `\n    <!-- Google tag (gtag.js), loaded after the page -->
    <script>
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('js', new Date());
      gtag('config', '${GA_MEASUREMENT_ID}');
      window.addEventListener('load', function () {
        var go = function () {
          var s = document.createElement('script');
          s.async = true;
          s.src = 'https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}';
          document.head.appendChild(s);
        };
        if ('requestIdleCallback' in window) requestIdleCallback(go, { timeout: 3000 }); else setTimeout(go, 1500);
      });
    </script>`;
// Section registry lookups, built once from NAV_GROUPS, so the breadcrumb and
// CollectionPage injection below knows the human label for any `/section` or
// `/section/entry` path without each template declaring it.
let sectionLabels = null;
function sectionLabel(slug) {
  if (!sectionLabels) {
    sectionLabels = new Map();
    for (const g of NAV_GROUPS) for (const [, href, label] of g.items) sectionLabels.set(href.slice(1), label);
  }
  return sectionLabels.get(slug) || null;
}

// Reverse escapeHtml, so an already-rendered attribute can be re-measured and
// re-trimmed as text rather than counting `&amp;` as five characters.
function unescapeHtml(s) {
  return String(s).replace(/&(amp|lt|gt|quot|#39|#8230);/g, (_, e) =>
    ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", '#8230': '…' }[e]));
}

// ---- Same-section neighbours -----------------------------------------------
// The cross-link engine relates two pages when they name the same game or the
// same studio, which reaches nothing written about a *theme*: 395 pages — 44
// essays among them — still had exactly one inbound internal link, their own
// hub. Those pages are not unrelated to everything, they are unrelated to
// anything *named*. So rank an entry's own section by shared distinctive
// vocabulary and link the closest few.
//
// Scoring stays inside one section deliberately. It keeps the work to sum(n^2)
// over ~70 sections of ~21 entries instead of 1,950 squared, and it keeps the
// block honest: "More in Essays" promises a sibling, not a global best match.
// Each section's index is built on the first request that needs it, so a cold
// start pays nothing and only the first visitor to a section pays the few
// milliseconds.
const SIBLING_STOPWORDS = new Set((
  'the a an and or but of to in on at for with from by as is was were be been being are am ' +
  'it its this that these those they them their there here he she his her him you your yours ' +
  'we our us i not no nor so if then than when what which who whom whose how why where all any ' +
  'both each few more most other others some such only own same too very can will just should ' +
  'now also would could had has have having do does did doing one two three first second next ' +
  'new old more much many out up down over under after before while about into through during ' +
  'game games gamer gamers player players play played playing video console consoles release ' +
  'released releases version versions title titles system systems'
).split(' '));

// The distinctive words in one entry, counted once per word. Four characters is
// the floor because the archive's prose is thick with two- and three-letter
// abbreviations that carry no topic ("nes", "rom", "cpu" appear everywhere).
function siblingTerms(e) {
  const out = new Set();
  for (const w of clNorm(entryProse(e)).split(' ')) {
    if (w.length < 4 || SIBLING_STOPWORDS.has(w) || /^\d+$/.test(w)) continue;
    out.add(w);
  }
  return out;
}

// Sibling ranking needs nothing more than a section's entry array, so it can
// cover the two sections the cross-link registry cannot. PLATFORMS and GENRES
// are assembled further down this file than CROSSLINK_REGISTRY is, which is why
// they have no row there and why their pages were the last 8 in the archive
// still holding a single inbound link. This map is built late enough to see
// them.
const clDataBySlug = new Map([
  ...CROSSLINK_REGISTRY.map(([s, d]) => [s, d]),
  ['platforms', PLATFORMS],
  ['genres', GENRES],
]);

// "More in Genre Encyclopedia" is the nav label, and it reads as a place rather
// than a group. Only the sections whose nav label is not a plain plural need an
// override here.
const SIBLING_SECTION_LABELS = new Map([['genres', 'Genres']]);
const SIBLING_COUNT = 4;
const siblingCache = new Map(); // slug -> Map(entry id -> [{ slug, id, title }])

function buildSiblingIndex(slug) {
  const data = clDataBySlug.get(slug);
  const docs = Array.isArray(data) ? data.filter(e => e && e.id) : [];
  const byId = new Map();
  siblingCache.set(slug, byId);
  if (docs.length < 2) return byId;

  const terms = docs.map(siblingTerms);
  // term -> the documents holding it, so scoring walks only the entries that
  // actually share a word rather than the whole section per term.
  const postings = new Map();
  terms.forEach((t, i) => {
    for (const w of t) {
      if (!postings.has(w)) postings.set(w, []);
      postings.get(w).push(i);
    }
  });
  const n = docs.length;
  // A word every entry uses separates nothing; a word only one entry uses
  // matches nothing. Both ends are dropped before scoring.
  const maxDf = Math.max(2, Math.floor(n * 0.4));
  const ref = i => ({ slug, id: docs[i].id, title: clTitle(docs[i]) });

  for (let i = 0; i < n; i++) {
    const scores = new Map();
    for (const w of terms[i]) {
      const post = postings.get(w);
      if (post.length < 2 || post.length > maxDf) continue;
      const weight = Math.log(n / post.length);
      for (const j of post) if (j !== i) scores.set(j, (scores.get(j) || 0) + weight);
    }
    const ranked = [...scores].sort((a, b) => b[1] - a[1]).map(([j]) => j);
    const picked = ranked.slice(0, SIBLING_COUNT - 1);
    // Always keep the next entry in the section as well, wrapping at the end.
    // Similarity alone can leave an entry that resembles nothing with no
    // inbound sibling links at all; the ring guarantees every entry is somebody
    // else's neighbour, so no page in a section can be stranded again.
    const ring = (i + 1) % n;
    if (!picked.includes(ring)) picked.push(ring);
    for (let k = 1; picked.length < SIBLING_COUNT && k < n; k++) {
      const j = (i + k) % n;
      if (j !== i && !picked.includes(j)) picked.push(j);
    }
    byId.set(docs[i].id, picked.slice(0, SIBLING_COUNT).map(ref));
  }
  return byId;
}

// "More in Essays" — the section's closest entries to this one. Reuses the
// related-block markup so it needs no styling of its own, with an extra class
// so the middleware can tell the two apart when deciding what to inject.
function siblingsBlock(cleanPath) {
  const [, slug, id] = cleanPath.split('/');
  if (!slug || !id || !clDataBySlug.has(slug)) return '';
  if (!siblingCache.has(slug)) buildSiblingIndex(slug);
  const sibs = siblingCache.get(slug).get(id);
  if (!sibs || !sibs.length) return '';
  const label = SIBLING_SECTION_LABELS.get(slug) || sectionLabel(slug) || slug;
  const links = sibs.map(r =>
    `<a href="/${r.slug}/${r.id}" class="related-link"><span class="related-cat">${escapeHtml(label)}</span><span class="related-title">${escapeHtml(r.title)}</span></a>`
  ).join('');
  return `<div class="related-entries section-siblings"><h2>More in ${escapeHtml(label)}</h2><div class="related-entries-grid">${links}</div></div>`;
}

// ---- Heading disambiguation ------------------------------------------------
// Which subject names are used by more than one page. Built lazily on the first
// request rather than at load, because the sources include PLATFORMS and
// GENRES, which are assembled further down this file than the cross-link
// registry is.
let ambiguousNames = null;
function isAmbiguousName(text) {
  if (!ambiguousNames) {
    const count = new Map();
    const bump = (raw) => {
      const k = clNorm(raw);
      if (k.length > 2) count.set(k, (count.get(k) || 0) + 1);
    };
    for (const [, data] of CROSSLINK_REGISTRY) {
      if (Array.isArray(data)) for (const e of data) if (e) bump(clTitle(e));
    }
    for (const p of PLATFORMS) bump(p.name);
    for (const g of GENRES) bump(g.name);
    ambiguousNames = new Set([...count].filter(([, n]) => n > 1).map(([k]) => k));
  }
  return ambiguousNames.has(clNorm(text));
}

// The `/section/entry` slug of an entry page, or null for hubs and the home
// page. A section is only recognised if the shared registry knows it, which is
// the same test the breadcrumbs use.
function entryPageSlug(cleanPath) {
  const [, slug, entry] = cleanPath.split('/');
  return entry && sectionLabel(slug) ? slug : null;
}

// A game's own page is the archive's primary page for that name, so it keeps
// the bare heading; the box art, character, franchise and speedrun pages that
// share the name are the ones that say which they are. Qualifying all four
// would leave no page actually titled "Donkey Kong".
//
// The exception is two games that share a title — the 1981 arcade Donkey Kong
// and the 1994 Game Boy one — where "Game" would separate nothing. Their
// <title> tags already tell them apart by platform, so the heading does too.
let duplicateGameTitles = null;
let duplicateGameTitlePlatforms = null;
function gameHeadingLabel(cleanPath, text) {
  if (!duplicateGameTitles) {
    const seenTitle = new Set();
    const seenPair = new Set();
    duplicateGameTitles = new Set();
    duplicateGameTitlePlatforms = new Set();
    for (const g of games) {
      const k = clNorm(g.title);
      if (seenTitle.has(k)) duplicateGameTitles.add(k);
      else seenTitle.add(k);
      const pk = `${k}|${clNorm(g.platform)}`;
      if (seenPair.has(pk)) duplicateGameTitlePlatforms.add(pk);
      else seenPair.add(pk);
    }
  }
  const k = clNorm(text);
  if (!duplicateGameTitles.has(k)) return null;
  const g = clEntryByPath(cleanPath);
  if (!g || !g.platform) return null;
  // Two Amiga releases of Alien Breed, a year apart, need the year as well —
  // the same thing the <title> falls back to.
  return duplicateGameTitlePlatforms.has(`${k}|${clNorm(g.platform)}`) && g.year
    ? `${g.platform}, ${g.year}`
    : g.platform;
}

// Singular labels for the sections outside the cross-link registry, whose only
// name is the plural hub label — "Nintendo Entertainment System — Platforms"
// reads as a category, not as this page's subject.
const EXTRA_SINGULAR_LABELS = new Map([['platforms', 'Platform'], ['genres', 'Genre']]);

// Append " — Box Art" (etc.) to the visible <h1> when its text names something
// another page also claims. The cross-link label is preferred over the nav
// label because it is already singular: "Box Art", not "Box Art Gallery", and
// "Sales Figures", not the plural hub name.
function qualifyHeading(body, cleanPath, slug) {
  const m = body.match(/<h1([^>]*)>([\s\S]*?)<\/h1>/);
  if (!m) return body;
  const text = unescapeHtml(m[2].replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();
  if (!text) return body;
  let label;
  if (slug === 'games') {
    label = gameHeadingLabel(cleanPath, text);
  } else if (isAmbiguousName(text)) {
    label = EXTRA_SINGULAR_LABELS.get(slug) || clLabelBySlug.get(slug) || sectionLabel(slug);
  }
  if (!label) return body;
  // Nothing to add if the heading already says it — "Doom (Box Art)".
  if (clNorm(text).includes(clNorm(label))) return body;
  return body.replace(m[0],
    `<h1${m[1]}>${m[2]}<span class="h1-qualifier"> &mdash; ${escapeHtml(label)}</span></h1>`);
}

// ---- Hub page titles -------------------------------------------------------
// The 76 section hubs are the archive's highest-authority pages — they collect
// the most internal links and are the only pages with a shot at a head term —
// but their titles were built as `${navLabel} – Bosnan` and averaged 25 of the
// ~60 characters Google renders. "Box Art – Bosnan" describes the site's own
// navigation, not the query anyone types: it contains neither "retro" nor
// "game" nor any console name. These rewrite each hub's title around the terms
// the page can actually rank for, in one map rather than 76 templates. `{n}` is
// substituted with the hub's live entry count, read off the rendered page, so
// the number cannot drift as content is added. Entry pages are left alone —
// their titles are already unique and subject-led.
const HUB_TITLES = new Map(Object.entries({
  'ad-campaigns': 'Retro Video Game Ad Campaigns of the 80s and 90s',
  'arcade-boards': 'Arcade System Boards — Neo Geo, CPS-1, Sega System 16',
  'bootlegs': 'Bootleg & Pirate Games — Famiclones and Unlicensed Ports',
  'bossfights': 'Iconic Retro Boss Fights — {n} Classic Encounters',
  'box-art': 'Retro Game Box Art — Classic NES, SNES & Arcade Covers',
  'cabinet-art': 'Arcade Cabinet Art — Classic Side Art and Marquees',
  'cancelled': 'Cancelled Retro Games That Were Never Released',
  'characters': 'Retro Video Game Characters — Origins and History',
  'cheat-codes': 'Classic Cheat Codes — The Konami Code and {n} More',
  'collections': 'Curated Retro Gaming Lists and Best-of Rankings',
  'comics': 'Video Game Tie-in Comics — Nintendo Power and More',
  'compare': 'Compare Retro Consoles — Specs, Library and Sales',
  'competitive': 'Competitive Gaming History — Arcade Era to Esports',
  'composers': 'Retro Game Composers — Chiptune and 16-bit Soundtracks',
  'controllers': 'Retro Game Controllers — D-Pads, Sticks and Input History',
  'controversies': 'Retro Gaming Controversies — Mortal Kombat to the ESRB',
  'cover-stories': 'Magazine Cover Stories That Shaped Retro Gaming',
  'critics': 'Retro Game Critics and Journalists Who Shaped Gaming',
  'decades': 'Retro Games by Decade — the 1950s to the 2000s',
  'designers': 'Legendary Game Designers — Miyamoto, Yokoi and More',
  'developers': 'Retro Game Developers — Nintendo, Sega, Atari and More',
  'difficulty': 'Nintendo Hard — Retro Game Difficulty and Hard Modes',
  'disappointments': 'Sequels That Disappointed — Retro Gaming’s Worst Follow-ups',
  'easter-eggs': 'Video Game Easter Eggs — Hidden Secrets in Retro Games',
  'endings': 'Classic Game Endings — Retro Gaming’s Best Finales',
  'essays': 'Retro Gaming Essays — {n} Long-Form Histories',
  'failed-consoles': 'Failed Consoles — Virtual Boy, Jaguar, 3DO and More',
  'family-tree': 'Game Developer Family Tree — Studio Splits and Spin-offs',
  'famous-bugs': 'Famous Video Game Bugs — Glitches That Made History',
  'franchises': 'Retro Game Franchises — Mario, Zelda, Sonic and More',
  'game-engines': 'Classic Game Engines — Doom, Build, SCUMM and More',
  'genres': 'Retro Game Genres — Shmups, Platformers, RPGs and More',
  'glitches': 'Notable Video Game Glitches — Speedrun Skips and Bugs',
  'glossary': 'Retro Gaming Glossary — Metroidvania, SHMUP, Mode 7',
  'hardware': 'Retro Console Hardware — CPUs, Sound Chips and Specs',
  'imports': 'Import Gaming Culture — Japanese Games and Region Locks',
  'levels': 'Greatest Retro Game Levels — Level Design Hall of Fame',
  'localization': 'Game Localization Differences — Japan vs the West',
  'lost-games': 'Lost Video Games — Unreleased and Missing Retro Titles',
  'magazines': 'Classic Gaming Magazines — EGM, Nintendo Power, CVG',
  'manuals': 'Retro Game Instruction Manuals and Their Artwork',
  'map': 'Retro Game Studio World Map — Where Classics Were Made',
  'merchandise': 'Retro Gaming Merchandise — Toys, Cereal and Tie-ins',
  'multiplayer': 'Co-op and Multiplayer Milestones in Retro Gaming',
  'on-this-day': 'Retro Gaming On This Day — Video Game History Calendar',
  'packaging': 'Retro Game Packaging — Boxes, Carts and Long Boxes',
  'peripherals': 'Retro Console Peripherals — Zapper, Power Glove and More',
  'pixel-artists': 'Pixel Artists Behind Retro Gaming’s Iconic Sprites',
  'platforms': 'Retro Gaming Platforms — {n} Consoles and Home Computers',
  'ports': 'Retro Game Port Comparisons — Arcade vs Home Console',
  'producers': 'Game Producers and Executives Who Built the Industry',
  'prototypes': 'Game Prototypes and Beta Versions — Cut Retro Content',
  'publishers': 'Retro Game Publishers — Atari, EA, Activision, Taito',
  'quiz': 'Retro Gaming Trivia Quiz — Test Your 80s Game Knowledge',
  'recent': 'Recently Added to the Bosnan Retro Games Archive',
  'regional': 'Regional Game Differences — Japan, US and PAL Versions',
  'retro-revival': 'Retro Revival Games — Modern Throwbacks to 8-bit Classics',
  'rom-hacks': 'ROM Hacks and Game Mods — Fan Translations and Remixes',
  'sales-figures': 'Retro Game and Console Sales Figures — Units Sold',
  'sequels': 'Sequels That Changed Everything in Retro Gaming',
  'sound-chips': 'Retro Sound Chips — SID, YM2612, Ricoh 2A03 and More',
  'sound-effects': 'Iconic Retro Game Sound Effects and Where They Came From',
  'soundtracks': 'Best Retro Game Soundtracks — Chiptune and 16-bit Music',
  'speedrun-techniques': 'Speedrun Techniques Explained — Wrong Warps and Skips',
  'speedruns': 'Famous Speedruns — Super Mario Bros., Ocarina of Time',
  'stats': 'Bosnan Archive Stats — What’s Inside the Retro Archive',
  'strategy-guides': 'Classic Strategy Guides — Nintendo Player’s Guides',
  'studios': 'Game Studio Origin Stories — id, Rare, Nintendo and More',
  'timeline': 'Video Game History Timeline — 1958 to the PS2 Era',
  'urban-legends': 'Gaming Urban Legends — Polybius, Lavender Town and More',
  'voice-actors': 'Retro Game Voice Actors and Their Iconic Roles',
  'wordsearch': 'Retro Gaming Word Search — Free Printable Puzzle',
  'years': 'Retro Games by Year — Browse {n} Years of Game History',
}));

// Hub descriptions that left a third of the snippet unused. Only the hubs
// under ~90 characters are overridden; the rest already read well.
// Hand-written search snippets for pages whose own description is one long
// sentence that cannot be cut cleanly (people, hardware, essays…). Keyed by
// path; each is <=160 characters and written only from the page's own text.
// The page body keeps the full description — this replaces the snippet only.
let metaDescriptions = null;
function metaDescriptionFor(cleanPath) {
  if (!metaDescriptions) {
    try {
      metaDescriptions = new Map(Object.entries(JSON.parse(
        fs.readFileSync(path.join(__dirname, 'data', 'meta-descriptions.json'), 'utf8'))));
    } catch (e) { metaDescriptions = new Map(); }
  }
  return metaDescriptions.get(cleanPath) || null;
}

const HUB_DESCRIPTIONS = new Map(Object.entries({
  'cancelled': 'Retro games announced, previewed and then killed before release — from Star Fox 2 to Sonic X-treme — and the reasons each one died.',
  'controllers': 'How the game controller evolved: the NES d-pad, the analogue stick, shoulder buttons, rumble and the input ideas that stuck.',
  'cover-stories': 'The magazine cover stories that set the agenda for retro gaming, from console launches and review scandals to previews that never shipped.',
  'disappointments': 'Sequels that followed a classic and fell short — what each one changed, why it went wrong, and how players and the press reacted.',
  'endings': 'How classic games said goodbye: the final screens, twists and credits sequences players spent whole cartridges working toward.',
  'manuals': 'Retro instruction manuals as artefacts — the artwork, fiction, maps and hint pages that shipped in the box before in-game tutorials.',
  'merchandise': 'The toys, cereals, cartoons and lunchboxes that turned retro game characters into 1980s and 1990s household brands.',
  'years': 'Browse the archive one year at a time, from the earliest experiments of the 1950s to the end of the 1990s — releases and hardware.',
}));

// The hub's live entry count, for the `{n}` placeholder: the distinct
// `/section/entry` links the rendered page lists. Read from the body rather
// than a data array so a hub that paginates or filters cannot advertise a
// number it does not actually show.
function hubEntryCount(slug, body) {
  const seen = new Set();
  for (const m of body.matchAll(new RegExp(`<a[^>]+href="/${slug}/([^"#?/]+)"`, 'g'))) seen.add(m[1]);
  return seen.size;
}

// Titles are built as `Subject – Section – Bosnan Retro Archive`, which
// overruns the ~60 characters Google renders on plenty of long entry names.
// Reclaim the room by dropping the boilerplate tail — Google appends the site
// name to the result itself, and the section is already the breadcrumb and the
// URL. The subject is never truncated: it is the only part that distinguishes
// this result from the other 1,900, and two pages cut to the same prefix
// (`Castle of Illusion Starring Mickey…`) would collide into one duplicate
// title. A long unique title beats a short ambiguous one.
const TITLE_BOILERPLATE = /^(Bosnan|Bosnan Retro Archive|Bosnan Retro Games Archive)$/;
function shortenSubtitle(raw, max = 65, section = '') {
  const text = unescapeHtml(raw).replace(/\s+/g, ' ').trim();
  if (text.length <= max || !text.includes(' — ')) return null;
  const [subject, ...rest] = text.split(' — ');
  // Whenever the subtitle has to go, name the section in its place: the bare
  // subject ("EarthBound", "Kirby") is ambiguous and can collide with
  // another section's page.
  const labelled = () => {
    for (const label of [ENTRY_TITLE_DESCRIPTORS.get(section), sectionLabel(section)].filter(Boolean)) {
      for (const t of [`${subject} – ${label} – Bosnan`, `${subject} – ${label}`]) if (t.length <= 60) return escapeHtml(t);
    }
    return escapeHtml(subject);
  };
  if (subject.length >= 20) return labelled();
  let out = subject + ' —';
  let truncated = false;
  for (const word of rest.join(' — ').split(' ')) {
    if ((out + ' ' + word).length > max) { truncated = true; break; }
    out += ' ' + word;
  }
  // A subtitle cut part-way ("…Forgot What Made") reads as broken, and the
  // bare subject ("EarthBound", "Kirby") is ambiguous and can collide with
  // another section's page — so name the section instead.
  if (truncated) return labelled();
  out = out.replace(/[\s—,:;]+$/, '');
  // Never end on an open bracket or a dangling function word: "…Weapon
  // Against" and "…Box Art (NES / MSX2" read as truncation, which is worse
  // than the shorter subject alone.
  if ((out.match(/\(/g) || []).length > (out.match(/\)/g) || []).length) out = out.slice(0, out.lastIndexOf('(')).replace(/[\s—,:;]+$/, '');
  while (/ (?:a|an|the|of|to|for|with|and|or|in|on|at|by|from|against|behind|every|its|their|his|her|that|than|into|over|is|was|when|how|why)$/i.test(out)) out = out.replace(/ \S+$/, '');
  out = out.replace(/[\s—,:;]+$/, '');
  return out.length > subject.length + 2 ? escapeHtml(out) : labelled();
}

// Entry pages are titled `${name} – ${navLabel} – Bosnan`, and for a short
// name that leaves half of the ~60 characters Google renders unused, with a
// bare section label ("Sega – Developers – Bosnan") that matches nothing
// anyone searches for. The descriptor names what the page actually is, and is
// applied only when the result still fits, so long names keep the original.
const ENTRY_TITLE_DESCRIPTORS = new Map(Object.entries({
  developers: 'Game Developer History & Classic Games',
  publishers: 'Video Game Publisher History',
  studios: 'Game Studio History & Origins',
  designers: 'Game Designer Profile & Games',
  producers: 'Video Game Industry Profile',
  composers: 'Video Game Composer & Soundtracks',
  'voice-actors': 'Video Game Voice Roles',
  'pixel-artists': 'Pixel Artist Profile & Games',
  critics: 'Video Game Critic & Journalist',
  characters: 'Video Game Character History',
  franchises: 'Game Series History',
  magazines: 'Video Game Magazine History',
  comics: 'Video Game Comic History',
  hardware: 'Retro Gaming Hardware History',
  'arcade-boards': 'Arcade Board History & Games',
  peripherals: 'Retro Console Peripheral History',
  'sound-chips': 'Sound Chip History & Games',
  'game-engines': 'Game Engine History & Games',
  'failed-consoles': 'Why the Console Failed',
  sequels: 'Retro Sequel Retrospective',
  cancelled: 'Cancelled Video Game History',
  glitches: 'Video Game Glitch Explained',
  'cheat-codes': 'Cheat Code History & How It Works',
  'retro-revival': 'Retro-Style Game Retrospective',
  ports: 'Port Comparison Across Platforms',
  imports: 'Import Game Guide',
  bossfights: 'Boss Fight Breakdown',
  essays: 'Retro Gaming History Essay',
  'lost-games': 'Lost Video Game History',
  'rom-hacks': 'ROM Hack Profile',
  difficulty: 'Why This Retro Game Is So Hard',
  manuals: 'Original Game Manual History',
  controllers: 'Retro Controller History',
  endings: 'Video Game Ending Explained',
  'urban-legends': 'Video Game Urban Legend Explained',
  'easter-eggs': 'Video Game Easter Egg Explained',
  'famous-bugs': 'Famous Video Game Bug Explained',
}));

function describeEntryTitle(raw, segments, max = 60) {
  if (segments.length !== 2) return null;
  const clean = unescapeHtml(raw).replace(/\s+/g, ' ').trim();
  const desc = ENTRY_TITLE_DESCRIPTORS.get(segments[0]);
  const suffixed = clean.match(/^(.+?) – [^–]+ – Bosnan$/);
  if (suffixed) {
    if (!desc) return null;
    const out = `${suffixed[1]} – ${desc} – Bosnan`;
    return out.length <= max ? escapeHtml(out) : null;
  }
  // A few templates title the page with the bare entry name and no suffix at
  // all ("Dragon Warrior Manual", 21 characters): add the descriptor, or the
  // section name when the descriptor will not fit, so the result says what
  // kind of page it is.
  if (/ [–—] /.test(clean) || clean.length >= 40) return null;
  for (const label of [desc, sectionLabel(segments[0])].filter(Boolean)) {
    for (const out of [`${clean} – ${label} – Bosnan`, `${clean} – ${label}`]) if (out.length <= max) return escapeHtml(out);
  }
  return null;
}

function trimTitle(raw, max = 60) {
  const text = unescapeHtml(raw).replace(/\s+/g, ' ').trim();
  if (text.length <= max) return null;
  const parts = text.split(' – ');
  if (parts.length < 2) return null;
  // Shed the trailing site name first, then the section label, stopping as
  // soon as the title fits or only the subject is left.
  while (parts.length > 1 && parts.join(' – ').length > max) parts.pop();
  if (!parts.length) return null;
  const out = parts.join(' – ');
  // Guard against shedding so much that nothing but boilerplate remains.
  if (!out || TITLE_BOILERPLATE.test(out)) return null;
  return out === text ? null : escapeHtml(out);
}

app.use((req, res, next) => {
  const origSend = res.send.bind(res);
  res.send = (body) => {
    if (typeof body === 'string' && body.startsWith('<!DOCTYPE html') && body.includes('</head>')) {
      const cleanPath = req.path === '/index.html' ? '/' : req.path.replace(/\/+$/, '') || '/';
      const canonical = SITE_URL + (CANONICAL_OVERRIDES.get(cleanPath) || cleanPath);

      // Normalise title and description in place *before* the Open Graph
      // fallbacks are derived from them, so the social tags inherit the
      // trimmed values instead of the overlong originals.
      // Section hubs take their search-facing title from HUB_TITLES, which
      // runs first so trimTitle() measures the replacement rather than the
      // nav label it supersedes.
      const pathSegments = cleanPath.split('/').filter(Boolean);
      const hubSlug = pathSegments.length === 1 ? pathSegments[0] : null;
      if (hubSlug && HUB_TITLES.has(hubSlug)) {
        const t = HUB_TITLES.get(hubSlug).replace('{n}', () => hubEntryCount(hubSlug, body));
        body = body.replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(t)}</title>`);
      }
      const described = body.match(/<title>([^<]*)<\/title>/);
      const describedTitle = described && describeEntryTitle(described[1], pathSegments);
      if (describedTitle) body = body.replace(described[0], `<title>${describedTitle}</title>`);
      const titleMatch = body.match(/<title>([^<]*)<\/title>/);
      if (titleMatch) {
        const trimmed = trimTitle(titleMatch[1]);
        const fitted = trimmed || titleMatch[1];
        const shortened = shortenSubtitle(fitted, 65, pathSegments.length === 2 ? pathSegments[0] : '');
        if (shortened || trimmed) body = body.replace(titleMatch[0], `<title>${shortened || trimmed}</title>`);
      }
      // Most templates build descriptions with `.substring(0, 160)` on raw
      // text, which lands over the limit once entities are escaped and cuts
      // mid-word. Re-trim every one on a word boundary.
      if (hubSlug && HUB_DESCRIPTIONS.has(hubSlug)) {
        body = body.replace(/<meta name="description" content="[^"]*"/,
          `<meta name="description" content="${escapeHtml(HUB_DESCRIPTIONS.get(hubSlug))}"`);
      }
      const handDesc = metaDescriptionFor(cleanPath);
      if (handDesc) {
        const d = escapeHtml(handDesc);
        body = body.replace(/<meta name="description" content="[^"]*"/, `<meta name="description" content="${d}"`)
          .replace(/<meta property="og:description" content="[^"]*"/, `<meta property="og:description" content="${d}"`)
          .replace(/<meta name="twitter:description" content="[^"]*"/, `<meta name="twitter:description" content="${d}"`);
      }
      const descMatch = body.match(/<meta name="description" content="([^"]*)"/);
      if (descMatch && unescapeHtml(descMatch[1]).length > 160) {
        body = body.replace(descMatch[0], `<meta name="description" content="${metaDesc(unescapeHtml(descMatch[1]))}"`);
      }

      let extra = '';
      if (!body.includes(GA_MEASUREMENT_ID)) extra += GA_SNIPPET;
      if (!body.includes('rel="canonical"')) extra += `\n    <link rel="canonical" href="${canonical}">`;
      // Opt in to full-size image thumbnails and full text snippets in the
      // SERP. An image-led archive loses clicks to the default small thumbnail.
      if (!body.includes('name="robots"')) extra += `\n    <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1">`;
      if (!body.includes('property="og:title"')) {
        const t = body.match(/<title>([^<]*)<\/title>/);
        if (t) extra += `\n    <meta property="og:title" content="${t[1]}">`;
      }
      if (!body.includes('property="og:description"')) {
        const d = body.match(/<meta name="description" content="([^"]*)"/);
        if (d) extra += `\n    <meta property="og:description" content="${d[1]}">`;
      }
      if (!body.includes('property="og:url"')) extra += `\n    <meta property="og:url" content="${canonical}">`;
      if (!body.includes('property="og:type"')) extra += `\n    <meta property="og:type" content="website">`;
      if (!body.includes('property="og:image"')) {
        extra += `\n    <meta property="og:image" content="${escapeHtml(entryOgImage(cleanPath) || DEFAULT_OG_IMAGE)}">`;
      } else {
        // A template set its own og:image — the game pages do — but 230 of
        // those files are not on disk and the rest are too small to render as a
        // card. Hold every page to the same bar and fall back to the default
        // rather than shipping a share card that resolves to nothing.
        const own = body.match(/property="og:image" content="([^"]*)"/);
        if (own && own[1].startsWith(SITE_URL)
          && !imageUsableAsCard(unescapeHtml(own[1]).slice(SITE_URL.length))) {
          const better = entryOgImage(cleanPath) || DEFAULT_OG_IMAGE;
          body = body.replace(own[0], `property="og:image" content="${escapeHtml(better)}"`);
        }
      }
      if (!body.includes('property="og:site_name"')) extra += `\n    <meta property="og:site_name" content="${SITE_NAME}">`;
      // Every og:image on the site is a wide screenshot or box shot, so the
      // large card is always the right treatment.
      if (!body.includes('name="twitter:card"')) extra += `\n    <meta name="twitter:card" content="summary_large_image">`;
      // Site identity. The Organization/WebSite pair was asserted only on the
      // homepage, and the ~10 hand-written page templates each decided for
      // themselves whether to name a publisher — so most of the archive said
      // nothing about who published it. A crawler cannot recognise an entity
      // it is told about once. Emitting the same two `@id`-bearing nodes on
      // every page is what lets 1,954 pages resolve to one publisher instead
      // of 1,954 anonymous documents. Guarded like every other injection here,
      // so a template that already references the entity wins.
      if (!body.includes(ORG_ID)) extra += `
    <script type="application/ld+json">${SITE_IDENTITY_JSON}</script>`;
      extra += autoSchema(cleanPath, body);
      if (extra) body = body.replace('</head>', `${extra}\n</head>`);
      body = enrichEntrySchema(body, cleanPath);

      // Visible breadcrumbs. The BreadcrumbList JSON-LD above already covered
      // every sectioned page, but 877 of them rendered no crumbs a reader (or
      // a crawler following links) could actually see. Slot them in where
      // detailPage() puts its own — immediately above the "back to section"
      // link — so the injected and hand-written pages look identical.
      if (!body.includes('class="crumbs"')) {
        const trail = pageTrail(cleanPath, body);
        if (trail) {
          body = body.replace(/<a href="[^"]*" class="back-link">/,
            m => `${crumbsNav(trail)}${m}`);
          // A handful of templates (the /decades pages) open straight into a
          // hero section with no back-link to anchor against, so fall back to
          // the close of the site nav.
          if (!body.includes('class="crumbs"')) {
            body = body.replace('</nav>', `</nav>${crumbsNav(trail)}`);
          }
        }
      }

      // "Related across the archive". Only ten of the ~80 renderers called
      // relatedBlock(), so 1,489 entry pages offered no route sideways. The
      // cross-link registry already maps slug+id to the entry object, so the
      // block can be injected here for every section at once rather than
      // threaded through each bespoke template.
      if (!body.includes('class="related-entries"')) {
        const entry = clEntryByPath(cleanPath);
        if (entry) {
          const rel = relatedBlock(entry);
          if (rel) body = body.replace('</body>', `${rel}\n</body>`);
        }
      }

      // "More in <section>". The block above only fires when the page names a
      // game or a studio some other page also names, so a page written about a
      // theme got nothing from it. This one always has neighbours to offer.
      if (!body.includes('section-siblings')) {
        const sibs = siblingsBlock(cleanPath);
        if (sibs) body = body.replace('</body>', `${sibs}\n</body>`);
      }

      // Disambiguate a heading whose subject name belongs to more than one page.
      // 250 pages shared an <h1> with another: "Sonic the Hedgehog" heads a
      // game, a franchise, a box-art entry and a speedrun, and "Nintendo
      // Entertainment System" heads both the platform and its sales figures.
      // Their <title>s are already distinct, so this is about the page itself
      // saying which of the four it is, to a reader arriving from a result and
      // to a crawler weighing the heading. Deliberately last: autoSchema() and
      // the breadcrumbs above have already read the clean name out of the body,
      // so a Person keeps `"name":"Shigeru Miyamoto"` rather than gaining an
      // editorial suffix, and only the visible heading is qualified.
      const entrySlug = entryPageSlug(cleanPath);
      if (entrySlug && !body.includes('h1-qualifier')) {
        body = qualifyHeading(body, cleanPath, entrySlug);
      }

      if (!body.includes('class="site-footer"')) body = body.replace('</body>', `${footerHtml()}\n</body>`);
    }
    // Vercel's CDN only caches a function response that carries s-maxage; a
    // plain max-age is passed to the browser and every page view still runs
    // the function cold (X-Vercel-Cache: MISS on every URL). Mirror each
    // route's own max-age into s-maxage so the edge keeps the same freshness
    // the route already chose. Vercel scopes its cache to a deployment, so a
    // deploy still publishes new content immediately.
    const cc = res.getHeader('Cache-Control');
    if (typeof cc === 'string' && /\bpublic\b/.test(cc) && !/s-maxage/.test(cc) && res.statusCode === 200) {
      const maxAge = (cc.match(/max-age=(\d+)/) || [])[1];
      if (maxAge && !/immutable/.test(cc)) res.setHeader('Cache-Control', `${cc}, s-maxage=${maxAge}`);
    }
    return origSend(body);
  };
  next();
});

// Schema types that count as a page's *primary* node. Deliberately excludes
// Organization and ImageObject: those appear inside the `publisher` of every
// node on the site, so matching them would report every page as already
// covered. CollectionPage/ItemList are included because a listing page that
// already describes itself does not also need an Article.
const PRIMARY_SCHEMA = /"@type":"(?:Article|NewsArticle|BlogPosting|VideoGame|VideoGameSeries|Person|Product|Book|Movie|SoftwareApplication|ItemList|CollectionPage)"/;

// Sections whose entry pages are game listings rather than written entries —
// /years/1984 and /decades/1980s are indexes of cards with no prose, so they
// describe themselves as a CollectionPage instead of an Article.
const LISTING_ENTRY_SECTIONS = new Set(['years', 'decades']);

// What an entry page's subject actually *is*. Everything outside this map is a
// written piece about a topic and stays an Article, but a profile of Nobuo
// Uematsu is a Person, and typing them as Article tells a search engine the
// page is journalism rather than an entity. These types take `name` rather than
// `headline`, and no `publisher` — a person does not have one. Historical
// hardware is a Thing, not a Product: Google validates every Product as a
// shopping item and reports one without offers, review or aggregateRating as
// an error, and a 1985 console has none of those.
const ENTRY_SCHEMA_TYPE = new Map([
  ...['composers', 'designers', 'critics', 'voice-actors', 'pixel-artists', 'producers']
    .map(s => [s, 'Person']),
  ...['developers', 'publishers', 'studios'].map(s => [s, 'Organization']),
  ...['platforms', 'hardware', 'peripherals', 'controllers', 'failed-consoles',
    'arcade-boards', 'sound-chips'].map(s => [s, 'Thing']),
  ['magazines', 'Periodical'],
  ['game-engines', 'SoftwareApplication'],
]);
const ARTICLE_TYPES = new Set(['Article', 'CollectionPage']);

// Structured data for the ~900 pages whose templates predate the schema work:
// a BreadcrumbList for anything under a known section, plus a CollectionPage
// on section hubs. Pages that already emit their own are left alone.
// The breadcrumb trail for any `/section` or `/section/entry` path, derived
// from the section registry and the page's own <h1>. Shared by the JSON-LD
// BreadcrumbList and the visible crumbs nav so the two can never disagree —
// Google treats markup that describes breadcrumbs the page doesn't show as a
// structured-data mismatch.
function pageTrail(cleanPath, body) {
  if (cleanPath === '/') return null;
  const [, slug, entry] = cleanPath.split('/');
  const label = sectionLabel(slug);
  if (!label) return null;
  const h1Match = body.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
  const h1Text = h1Match
    ? unescapeHtml(h1Match[1].replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim()
    : entry;
  const trail = [{ name: 'Home', path: '/' }, { name: label, path: `/${slug}` }];
  if (entry) trail.push({ name: h1Text, path: `/${slug}/${entry}` });
  return trail;
}

// Give every entry page's primary schema node the two fields Google's Article
// guidelines ask for and the templates never set: an author, and the real
// last-changed date from data/lastmod.json. Runs over template-built nodes as
// well as autoSchema()'s, and only adds what is missing. dateModified is set
// only when the entry has a tracked date — never invented.
const DATED_SCHEMA_TYPES = new Set(['Article', 'NewsArticle', 'BlogPost', 'BlogPosting', 'VideoGame']);
// Node types that stand for the page's subject itself (a person, company,
// product, magazine, game). Only these take sameAs: an Article about Doom is
// not "the same as" Wikipedia's Doom page, but the VideoGame node for Doom is.
const ENTITY_SCHEMA_TYPES = new Set(['VideoGame', 'Person', 'Organization', 'Thing', 'Periodical', 'SoftwareApplication']);
function enrichEntrySchema(body, cleanPath) {
  const [slug, id, more] = cleanPath.split('/').filter(Boolean);
  if (!slug || !id || more) return body;
  const date = entryLastmod(slug, { id });
  // The entry's cited Wikipedia article(s), linked as sameAs on entity nodes so
  // search engines can tie the page to the right real-world entity.
  const entry = slug === 'games' ? gamesById.get(id) : clEntryByPath(cleanPath);
  const wiki = ((entry && entry.sources) || [])
    .map(s => s && s.url).filter(u => typeof u === 'string' && /^https:\/\/en\.wikipedia\.org\/wiki\//.test(u));
  // Google requires an image on Article rich results; 1,030 template-built
  // Article nodes had none. Use the page's own og:image, which the middleware
  // has already resolved to the best available picture for this entry.
  const ogImage = (body.match(/property="og:image" content="([^"]*)"/) || [])[1];
  return body.replace(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g, (whole, json) => {
    let node;
    try { node = JSON.parse(json); } catch { return whole; }
    if (!node || Array.isArray(node) || node['@graph']) return whole;
    const type = node['@type'];
    const dated = DATED_SCHEMA_TYPES.has(type), entity = ENTITY_SCHEMA_TYPES.has(type);
    if (!dated && !entity) return whole;
    let changed = false;
    if (entity && wiki.length && !node.sameAs) { node.sameAs = wiki.length === 1 ? wiki[0] : wiki; changed = true; }
    if (!dated) return changed ? `<script type="application/ld+json">${JSON.stringify(node).replace(/</g, '\\u003c')}</script>` : whole;
    const isGame = type === 'VideoGame';
    if (date && !node.dateModified) { node.dateModified = date; changed = true; }
    if (!isGame && !node.author) { node.author = ORG_SCHEMA; changed = true; }
    if (!isGame && !node.publisher) { node.publisher = ORG_SCHEMA; changed = true; }
    if (!node.image && ogImage) { node.image = unescapeHtml(ogImage); changed = true; }
    return changed ? `<script type="application/ld+json">${JSON.stringify(node).replace(/</g, '\\u003c')}</script>` : whole;
  });
}

function autoSchema(cleanPath, body) {
  if (cleanPath === '/') return '';
  const [, slug, entry] = cleanPath.split('/');
  const label = sectionLabel(slug);
  if (!label) return '';
  let out = '';
  const trail = pageTrail(cleanPath, body);
  const h1Text = trail[trail.length - 1].name;
  if (!body.includes('BreadcrumbList')) {
    out += `\n    ${breadcrumbSchema(trail)}`;
  }
  // Entry pages built by the bespoke per-section renderers never got a primary
  // schema node — only the shared detailPage() family did. Give every written
  // entry an Article so the whole archive is eligible for the same rich
  // results, deriving each field from tags already present on the page.
  if (entry && !PRIMARY_SCHEMA.test(body)) {
    const url = `${SITE_URL}/${slug}/${entry}`;
    const desc = body.match(/<meta name="description" content="([^"]*)"/);
    const img = body.match(/property="og:image" content="([^"]*)"/);
    const isListing = LISTING_ENTRY_SECTIONS.has(slug);
    const type = isListing ? 'CollectionPage' : (ENTRY_SCHEMA_TYPE.get(slug) || 'Article');
    // Only Article carries a headline, and only Article is published by anyone.
    const isArticle = ARTICLE_TYPES.has(type);
    const node = {
      '@context': 'https://schema.org',
      '@type': type,
      // Google ignores an Article headline over 110 characters, and a handful
      // of editorial titles run past that. Entity names are left intact.
      [type === 'Article' ? 'headline' : 'name']:
        type === 'Article' && h1Text.length > 110 ? `${h1Text.slice(0, 109).trimEnd()}\u2026` : h1Text,
      description: desc ? unescapeHtml(desc[1]) : undefined,
      image: img ? unescapeHtml(img[1]) : DEFAULT_OG_IMAGE,
      url,
      inLanguage: isArticle ? 'en' : undefined,
      mainEntityOfPage: { '@type': 'WebPage', '@id': url },
      isPartOf: { '@type': 'CollectionPage', name: label, url: `${SITE_URL}/${slug}` },
      publisher: isArticle ? ORG_SCHEMA : undefined,
      // Google recommends an author on Article; the archive is written as one
      // publication, so the author is the same organisation as the publisher.
      author: isArticle ? ORG_SCHEMA : undefined,
      // A real last-changed date from data/lastmod.json — never invented. Pages
      // without a tracked entry (platforms, genres) simply omit it.
      dateModified: isArticle ? (entryLastmod(slug, { id: entry }) || undefined) : undefined,
    };
    out += `\n    <script type="application/ld+json">${JSON.stringify(node).replace(/</g, '\\u003c')}</script>`;
  }
  if (!entry && !body.includes('"ItemList"') && !body.includes('CollectionPage')) {
    const desc = body.match(/<meta name="description" content="([^"]*)"/);
    const json = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: label,
      url: `${SITE_URL}/${slug}`,
      description: desc ? unescapeHtml(desc[1]) : undefined,
      mainEntity: hubItemList(slug, body),
      isPartOf: { '@type': 'WebSite', '@id': WEBSITE_ID, name: SITE_NAME, url: `${SITE_URL}/` },
      publisher: ORG_SCHEMA,
    }).replace(/</g, '\\u003c');
    out += `\n    <script type="application/ld+json">${json}</script>`;
  }
  return out;
}

// A hub's own entries, as an ItemList, read back out of the rendered page. 70
// of the 75 hubs described themselves as a bare CollectionPage that never said
// what they collected. Reading the links out of the body means this works for
// every hub without the ~80 templates declaring their contents twice.
const HUB_ITEMLIST_MAX = 100;
function hubItemList(slug, body) {
  const seen = new Set();
  const items = [];
  // Anchors pointing one level below this hub, in document order. The capture
  // keeps the anchor's inner HTML so a clean name can be pulled from it.
  const re = new RegExp(`<a[^>]+href="/${slug}/([^"#?/]+)"[^>]*>([\\s\\S]*?)</a>`, 'g');
  for (const m of body.matchAll(re)) {
    const id = m[1];
    if (seen.has(id)) continue;
    seen.add(id);
    // Cards wrap an image, a title and several meta lines. Only the title is
    // reliably just the entry's name; flattening the whole card gives
    // "Donkey Kong 1980s Play 1981 · Platform NES". Card titles are either a
    // heading or a `*-name` / `*-title` element depending on the template.
    const t = m[2].match(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/)
      || m[2].match(/<[a-z0-9]+[^>]*class="[^"]*(?:-name|-title)[^"]*"[^>]*>([\s\S]*?)<\//i);
    const name = t
      ? unescapeHtml(t[1].replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim()
      : null;
    items.push({
      '@type': 'ListItem',
      position: items.length + 1,
      url: `${SITE_URL}/${slug}/${id}`,
      name: name || undefined,
    });
    if (items.length >= HUB_ITEMLIST_MAX) break;
  }
  if (!items.length) return undefined;
  return { '@type': 'ItemList', numberOfItems: items.length, itemListElement: items };
}

// Serve merged CSS with immutable 1-year cache (content-addressed by hash)
app.get(/^\/app\.[a-f0-9]+\.css$/, (req, res) => {
  res.setHeader('Content-Type', 'text/css; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.send(rawCss);
});

// Server-render the homepage with GOTD baked in — must be before express.static
// so it intercepts / and /index.html before the static file is served.
app.get('/index.html', (req, res) => res.redirect(301, '/'));

app.get('/', (req, res) => {
  const day = dayOfYear();
  if (!cachedHomepage.html || cachedHomepage.day !== day) {
    cachedHomepage = { html: homepagePage(gameOfDay()), day };
  }
  res.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
  res.set('Link', `<${CSS_PATH}>; rel=preload; as=style`);
  res.send(cachedHomepage.html);
});

let cachedAboutHtml = null;
app.get('/about', (req, res) => {
  if (!cachedAboutHtml) cachedAboutHtml = aboutPage();
  res.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
  res.send(cachedAboutHtml);
});

// Legacy static URLs → canonical routes (avoid duplicate content)
app.get('/games.html', (req, res) => res.redirect(301, '/games'));
// /game.html hosted the Bosnan game launcher, since removed. The URL is
// indexed, so it redirects rather than 404s.
app.get('/game.html', (req, res) => res.redirect(301, '/'));

// Only the assets the site actually uses are exposed. Serving __dirname
// wholesale also exposed server.js, data/, scripts/, and node_modules.
app.use('/images', express.static(path.join(__dirname, 'images'), {
  setHeaders(res) {
    res.setHeader('Cache-Control', 'public, max-age=2592000, stale-while-revalidate=86400');
  },
}));

app.get('/logo.svg', (req, res) => {
  res.set('Cache-Control', 'public, max-age=2592000, stale-while-revalidate=86400');
  res.sendFile(path.join(__dirname, 'logo.svg'));
});

// ── Helpers ─────────────────────────────────────────────────────────────────

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// XML predefined entities only. escapeHtml would emit &#39;, which is valid
// HTML but not valid XML, and would break the sitemap on any title with an
// apostrophe ("Ghosts 'n Goblins").
function escapeXml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
}

function dayOfYear() {
  const now = new Date();
  return Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000);
}

function gameOfDay() {
  return games[dayOfYear() % games.length];
}

function gamesForPlatform(platform) {
  return platformGamesIndex.get(platform.id) || [];
}

// Hub-page lookups for cross-linking game metadata (UX + internal linking)
function platformHub(game) {
  const id = resolvePlatformId(game.platform);
  return id ? `/platforms/${id}` : null;
}
function genreHub(game) {
  const g = GENRES.find(G => (G.genres || []).includes(game.genre));
  return g ? `/genres/${g.id}` : null;
}
function developerHub(game) {
  const d = DEVELOPERS.find(d => game.developer.toLowerCase().includes(d.keyword.toLowerCase()));
  return d ? `/developers/${d.id}` : null;
}
function publisherHub(game) {
  const p = PUBLISHERS.find(p => (game.publisher || '').toLowerCase().includes(p.keyword.toLowerCase()));
  return p ? `/publishers/${p.id}` : null;
}
function metaValue(text, href) {
  const safe = escapeHtml(text);
  return href ? `<a href="${href}" class="meta-link">${safe}</a>` : safe;
}

// Single registry of every section: drives the nav mega-menu, the footer,
// the /browse index page, and the sitemap. Add new sections here only.
const NAV_GROUPS = [
  { name: 'Games & Library', items: [
    ['games', '/games', 'All Games'],
    ['collections', '/collections', 'Curated Lists'],
    ['franchises', '/franchises', 'Franchises'],
    ['sequels', '/sequels', 'Sequels'],
    ['ports', '/ports', 'Ports'],
    ['imports', '/imports', 'Imports'],
    ['regional', '/regional', 'Regional Scenes'],
    ['rom-hacks', '/rom-hacks', 'ROM Hacks'],
    ['bootlegs', '/bootlegs', 'Bootlegs'],
    ['cancelled', '/cancelled', 'Cancelled Games'],
    ['prototypes', '/prototypes', 'Prototypes'],
    ['lost-games', '/lost-games', 'Lost Games'],
    ['disappointments', '/disappointments', 'Disappointments'],
    ['retro-revival', '/retro-revival', 'Retro Revival'],
  ] },
  { name: 'Hardware & Tech', items: [
    ['platforms', '/platforms', 'Platforms'],
    ['hardware', '/hardware', 'Hardware'],
    ['failed-consoles', '/failed-consoles', 'Failed Consoles'],
    ['arcade-boards', '/arcade-boards', 'Arcade Boards'],
    ['controllers', '/controllers', 'Controllers'],
    ['peripherals', '/peripherals', 'Peripherals'],
    ['sound-chips', '/sound-chips', 'Sound Chips'],
    ['game-engines', '/game-engines', 'Game Engines'],
    ['compare', '/compare', 'Compare Platforms'],
  ] },
  { name: 'People & Studios', items: [
    ['developers', '/developers', 'Developers'],
    ['studios', '/studios', 'Studio Origins'],
    ['publishers', '/publishers', 'Publishers'],
    ['designers', '/designers', 'Designers'],
    ['producers', '/producers', 'Producers'],
    ['composers', '/composers', 'Composers'],
    ['pixel-artists', '/pixel-artists', 'Pixel Artists'],
    ['voice-actors', '/voice-actors', 'Voice Actors'],
    ['family-tree', '/family-tree', 'Family Tree'],
    ['map', '/map', 'Studio Map'],
  ] },
  { name: 'Design & Play', items: [
    ['genres', '/genres', 'Genre Encyclopedia'],
    ['characters', '/characters', 'Characters'],
    ['levels', '/levels', 'Iconic Levels'],
    ['bossfights', '/bossfights', 'Boss Fights'],
    ['endings', '/endings', 'Endings'],
    ['difficulty', '/difficulty', 'Difficulty'],
    ['multiplayer', '/multiplayer', 'Multiplayer'],
    ['competitive', '/competitive', 'Competitive Gaming'],
    ['speedruns', '/speedruns', 'Speedruns'],
    ['speedrun-techniques', '/speedrun-techniques', 'Speedrun Techniques'],
    ['easter-eggs', '/easter-eggs', 'Easter Eggs'],
    ['cheat-codes', '/cheat-codes', 'Cheat Codes'],
    ['glitches', '/glitches', 'Glitches'],
    ['famous-bugs', '/famous-bugs', 'Famous Bugs'],
  ] },
  { name: 'Culture & Media', items: [
    ['essays', '/essays', 'Essays'],
    ['magazines', '/magazines', 'Magazines'],
    ['cover-stories', '/cover-stories', 'Cover Stories'],
    ['ad-campaigns', '/ad-campaigns', 'Ad Campaigns'],
    ['box-art', '/box-art', 'Box Art'],
    ['cabinet-art', '/cabinet-art', 'Cabinet Art'],
    ['packaging', '/packaging', 'Packaging'],
    ['manuals', '/manuals', 'Manuals'],
    ['strategy-guides', '/strategy-guides', 'Strategy Guides'],
    ['merchandise', '/merchandise', 'Merchandise'],
    ['comics', '/comics', 'Comics'],
    ['soundtracks', '/soundtracks', 'Soundtracks'],
    ['sound-effects', '/sound-effects', 'Sound Effects'],
    ['localization', '/localization', 'Localization'],
    ['controversies', '/controversies', 'Controversies'],
    ['urban-legends', '/urban-legends', 'Urban Legends'],
    ['critics', '/critics', 'Critics'],
    ['sales-figures', '/sales-figures', 'Sales Figures'],
  ] },
  { name: 'Explore & Fun', items: [
    ['years', '/years', 'By Year'],
    ['decades', '/decades', 'By Decade'],
    ['timeline', '/timeline', 'Timeline'],
    ['on-this-day', '/on-this-day', 'On This Day'],
    ['recent', '/recent', 'Recently Added'],
    ['stats', '/stats', 'Stats'],
    ['glossary', '/glossary', 'Glossary'],
    ['quiz', '/quiz', 'Quiz'],
    ['wordsearch', '/wordsearch', 'Word Search'],
    ['search', '/search', 'Search'],
    ['bookmarks', '/bookmarks', 'My Bookmarks'],
  ] },
];

function nav(active) {
  const link = (href, label, id) =>
    `<a href="${href}"${active === id ? ' class="active"' : ''}>${label}</a>`;
  const groupsHtml = NAV_GROUPS.map(group => `<div class="nav-mega-group">
            <div class="nav-mega-title">${group.name}</div>
            ${group.items.map(([id, href, label]) => link(href, label, id)).join('\n            ')}
          </div>`).join('\n          ');
  // A page with its own top-level link highlights only that link, not Browse too.
  const TOP_LEVEL = ['games', 'platforms', 'genres', 'essays'];
  const inGroup = !TOP_LEVEL.includes(active) && NAV_GROUPS.some(g => g.items.some(([id]) => id === active));
  return `<a class="skip-link" href="#main">Skip to content</a>
<nav>
    <a href="/" class="nav-logo" aria-label="Bosnan home"><img src="/logo.svg" alt="Bosnan logo" width="50" height="50"></a>
    <button class="menu-toggle" onclick="toggleMenu()" id="menuToggle" aria-label="Toggle menu" aria-controls="navLinks" aria-expanded="false">
        <span></span><span></span><span></span>
    </button>
    <div class="nav-links" id="navLinks">
        ${link('/games', 'Games', 'games')}
        ${link('/platforms', 'Platforms', 'platforms')}
        ${link('/genres', 'Encyclopedia', 'genres')}
        ${link('/essays', 'Essays', 'essays')}
        <details class="nav-drop">
          <summary${inGroup ? ' class="active"' : ''}>Browse &#9662;</summary>
          <div class="nav-mega">
          ${groupsHtml}
            <a href="/browse" class="nav-mega-all">All sections A&ndash;Z &#8594;</a>
          </div>
        </details>
        <form class="nav-search" action="/search" method="GET" role="search">
            <input type="search" name="q" placeholder="Search&#8230;" aria-label="Search the archive">
        </form>
        <button type="button" class="theme-toggle" id="themeToggle" aria-label="Light theme" aria-pressed="false"><span class="ti-light" aria-hidden="true">&#9728;</span><span class="ti-dark" aria-hidden="true">&#9790;</span></button>
    </div>
</nav>
<span id="main" tabindex="-1"></span>`;
}

let cachedFooterHtml = null;
function footerHtml() {
  if (!cachedFooterHtml) {
    const cols = NAV_GROUPS.map(g => `<div class="footer-col">
      <div class="footer-col-title">${g.name}</div>
      ${g.items.map(([, href, label]) => `<a href="${href}">${label}</a>`).join('\n      ')}
    </div>`).join('\n    ');
    cachedFooterHtml = `<footer class="site-footer">
  <div class="footer-grid">
    ${cols}
  </div>
  <div class="footer-bottom">
    <a href="/">${SITE_NAME}</a> &middot; <a href="/about">About</a> &middot; <a href="/browse">All sections</a> &middot; <a href="/sitemap.xml">Sitemap</a>
  </div>
</footer>`;
  }
  return cachedFooterHtml;
}

function toggleScript() {
  return `<script>(function(){var b=document.getElementById("themeToggle");if(!b)return;var r=document.documentElement;function sync(){var l=r.dataset.theme==="light";b.setAttribute("aria-pressed",l?"true":"false");var m=document.querySelector('meta[name="theme-color"]');if(m)m.content=l?"#f6f5f2":"#0b0b0c"}sync();b.addEventListener("click",function(){if(r.dataset.theme==="light")delete r.dataset.theme;else r.dataset.theme="light";try{localStorage.setItem("bosnan_theme",r.dataset.theme||"dark")}catch(e){}sync()})})();
function toggleMenu(){var n=document.getElementById("navLinks"),t=document.getElementById("menuToggle"),o=n.classList.toggle("active");if(t)t.setAttribute("aria-expanded",o?"true":"false")}
document.addEventListener("click",function(e){document.querySelectorAll("details.nav-drop[open]").forEach(function(d){if(!d.contains(e.target))d.removeAttribute("open")})});
document.addEventListener("keydown",function(e){if(e.key==="/"&&document.activeElement.tagName!=="INPUT"&&document.activeElement.tagName!=="TEXTAREA"&&!e.ctrlKey&&!e.metaKey){var s=document.querySelector(".nav-search input");if(s){e.preventDefault();s.focus();}}});
(function(){var inp=document.querySelector(".nav-search input");if(!inp)return;var box=document.createElement("ul");box.className="nav-ac";inp.parentNode.style.position="relative";inp.parentNode.appendChild(box);var tmr;inp.addEventListener("input",function(){clearTimeout(tmr);var q=inp.value.trim();if(q.length<2){box.style.display="none";return;}tmr=setTimeout(function(){fetch("/api/search?q="+encodeURIComponent(q)).then(function(r){return r.json();}).then(function(items){box.innerHTML="";if(!items.length){box.style.display="none";return;}items.forEach(function(it){var li=document.createElement("li"),a=document.createElement("a"),t=document.createElement("span"),u=document.createElement("span");a.href=it.href;t.className="ac-title";t.textContent=it.title;u.className="ac-sub";u.textContent=it.sub;a.appendChild(t);a.appendChild(u);li.appendChild(a);box.appendChild(li);});box.style.display="block";}).catch(function(){box.style.display="none";});},220);});inp.addEventListener("blur",function(){setTimeout(function(){box.style.display="none";},160);});inp.addEventListener("keydown",function(e){if(e.key==="Escape"){box.style.display="none";inp.blur();}});})();</script>`;
}

// 230 of the 432 games name an image file that is not on disk. Each card used
// to request it anyway, take the 404, and swap in a placeholder from onerror —
// a wasted request per missing image per page view. Deciding on the server
// skips the request; onerror stays as the fallback for a file that fails later.
function cardImage(g, imgAttrs) {
  const placeholder = `<div class="game-card-placeholder" aria-hidden="true">${escapeHtml(g.title[0])}</div>`;
  const src = gameImagePath(g);
  if (!src) return placeholder;
  // gameImagePath() only returns files that are on disk, so no onerror fallback
  // is needed — it was ~100 bytes repeated on every card of every grid.
  return `<img src="/${escapeHtml(src)}" alt="${escapeHtml(g.title)}" ${imgAttrs}${isTitleCard(src) ? ' class="is-titlecard"' : ''}>`;
}

// eagerCount: first N images get fetchpriority=high (no lazy), rest get loading=lazy
function buildCardHtml(list, eagerCount = 0, withFilterData = false) {
  return list.map((g, i) => {
    const imgAttrs = i < eagerCount
      ? `fetchpriority="high" decoding="async"`
      : `loading="lazy" decoding="async"`;
    // The /games hub filters these in place, so the haystack it matches on
    // travels with the card. That is what lets all 427 ship as real anchors.
    const filterData = withFilterData
      ? ` data-decade="${escapeHtml(g.decade)}" data-s="${escapeHtml(
          [g.title, g.genre, g.platform, g.developer, g.year].join(" ").toLowerCase())}"`
      : '';
    // Kept compact: the /games hub renders all 425 of these on one page, where
    // per-card markup decides the page's DOM size and weight.
    return `<a href="/games/${g.id}" class="game-card"${filterData}><div class="game-card-img-wrap">${cardImage(g, imgAttrs)}${g.playUrl ? '<div class="game-card-playable">&#9654; Play</div>' : ''}</div><div class="game-card-body"><h3 class="game-card-title">${escapeHtml(g.title)}</h3><div class="game-card-meta">${escapeHtml(String(g.year))} · ${escapeHtml(g.genre)}</div><p class="game-card-platform">${escapeHtml(g.platform)}</p></div></a>`;
  }).join('');
}

// ── Routes ──────────────────────────────────────────────────────────────────

// Kept in step with the Disallow list in robots.txt below.
const SITEMAP_EXCLUDE = new Set(['/search', '/bookmarks']);

// The real last-changed date of the page at a site path. Entry pages use their
// own entry's date; year and decade pages the newest of the games they list;
// section hubs the newest of their entries; everything else the site date.
function entryLastmod(slug, entry) {
  const rec = LASTMOD[slug === 'games' ? `games:${entry.id}` : entry.id];
  return rec ? rec.date : '';
}
const newestOf = (slug, list) => (list || []).reduce((m, e) => {
  const d = entryLastmod(slug, e);
  return d > m ? d : m;
}, '');
function urlLastmod(p) {
  const [slug, id] = p.split('/').filter(Boolean);
  let date = '';
  if (slug && id) {
    if (slug === 'years') date = newestOf('games', yearsIndex.get(Number(id)));
    else if (slug === 'decades') date = newestOf('games', decadesIndex.get(id));
    else date = entryLastmod(slug, { id });
  } else if (slug) {
    date = slug === 'games' ? newestOf('games', games) : newestOf(slug, clDataBySlug.get(slug));
  }
  return date || SITE_LASTMOD;
}

function buildSitemapCache() {
  if (!cachedSitemap) {
    const base = SITE_URL;
    const today = SITE_LASTMOD;
    // Every section hub from the shared registry, so new sections can't be
    // forgotten — minus the pages robots.txt disallows or that render nothing
    // server-side. Submitting a URL that robots.txt blocks is a Search Console
    // error, and /bookmarks is an empty shell filled from localStorage.
    const staticUrls = ['', '/about', '/browse', ...NAV_GROUPS.flatMap(g => g.items.map(([, p]) => p))]
      .filter(p => !SITEMAP_EXCLUDE.has(p)).map(p => `
  <url>
    <loc>${base}${p}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>${p === '' ? '1.0' : '0.9'}</priority>
  </url>`).join('');
    // Game pages carry the archive's only first-party imagery — a screenshot
    // per title, each already captioned. Declaring them as sitemap images is
    // the one discovery path Google Images has, since a crawler otherwise has
    // to reach them through the lazy-loaded card grids.
    const gameUrls = games.map(g => `
  <url>
    <loc>${base}/games/${g.id}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>yearly</changefreq>
    <priority>0.7</priority>${gameImagePath(g) ? `
    <image:image>
      <image:loc>${base}/${escapeXml(gameImagePath(g))}</image:loc>
      <image:title>${escapeXml(`${g.title} (${g.year})`)}</image:title>
      <image:caption>${escapeXml(`${g.title} — ${g.genre} for ${g.platform}, released ${g.year} by ${g.developer}.`)}</image:caption>
    </image:image>` : ''}
  </url>`).join('');
    const platformUrls = PLATFORMS.map(p => `
  <url>
    <loc>${base}/platforms/${p.id}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>`).join('');
    const genreUrls = GENRES.map(g => `
  <url>
    <loc>${base}/genres/${g.id}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>`).join('');
    const essayUrls = ESSAYS.map(e => `
  <url>
    <loc>${base}/essays/${e.id}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>`).join('');
    const developerUrls = DEVELOPERS.map(d => `
  <url>
    <loc>${base}/developers/${d.id}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>`).join('');
    const composerUrls = COMPOSERS.map(c => `
  <url>
    <loc>${base}/composers/${c.id}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>`).join('');
    const franchiseUrls = FRANCHISES.map(f => `
  <url>
    <loc>${base}/franchises/${f.id}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>`).join('');
    const hardwareUrls = HARDWARE.map(hw => `
  <url>
    <loc>${base}/hardware/${hw.id}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>`).join('');
    const designerUrls = DESIGNERS.map(d => `
  <url>
    <loc>${base}/designers/${d.id}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>`).join('');
    const yearUrls = YEARS.filter(y => !isThinYear(y)).map(y => `
  <url>
    <loc>${base}/years/${y}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>`).join('');
    const regionalUrls = REGIONAL.map(r => `
  <url>
    <loc>${base}/regional/${r.id}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>`).join('');
    const publisherUrls = PUBLISHERS.map(p => `
  <url>
    <loc>${base}/publishers/${p.id}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>`).join('');
    const arcadeBoardUrls = ARCADE_BOARDS.map(b => `
  <url>
    <loc>${base}/arcade-boards/${b.id}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>`).join('');
    const peripheralUrls = PERIPHERALS.map(p => `
  <url>
    <loc>${base}/peripherals/${p.id}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>`).join('');
    const lostGameUrls = LOST_GAMES.filter(g => !CANONICAL_OVERRIDES.has(`/lost-games/${g.id}`)).map(g => `
  <url>
    <loc>${base}/lost-games/${g.id}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>`).join('');
    const decadeUrls = DECADES.map(d => `
  <url>
    <loc>${base}/decades/${encodeURIComponent(d)}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>`).join('');
    const magazineUrls = MAGAZINES.map(m => `
  <url>
    <loc>${base}/magazines/${m.id}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>`).join('');
    const boxArtUrls = BOX_ART.map(b => `
  <url>
    <loc>${base}/box-art/${b.id}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>`).join('');
    const portUrls = PORTS.map(p => `
  <url>
    <loc>${base}/ports/${p.id}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>`).join('');
    const voiceActorUrls = VOICE_ACTORS.map(v => `
  <url>
    <loc>${base}/voice-actors/${v.id}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>`).join('');
    const pixelArtistUrls = PIXEL_ARTISTS.map(a => `
  <url>
    <loc>${base}/pixel-artists/${a.id}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>`).join('');
    const producerUrls = PRODUCERS.map(p => `
  <url>
    <loc>${base}/producers/${p.id}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>`).join('');
    const collectionUrls = COLLECTIONS.map(c => `
  <url>
    <loc>${base}/collections/${c.id}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>`).join('');
    const controversyUrls = CONTROVERSIES.map(c => `
  <url>
    <loc>${base}/controversies/${c.id}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>`).join('');
    const failedConsoleUrls = FAILED_CONSOLES.map(c => `
  <url>
    <loc>${base}/failed-consoles/${c.id}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>`).join('');
    const gameEngineUrls = GAME_ENGINES.map(e => `
  <url>
    <loc>${base}/game-engines/${e.id}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>`).join('');
    const soundChipUrls = SOUND_CHIPS.map(c => `
  <url>
    <loc>${base}/sound-chips/${c.id}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>`).join('');
    const easterEggUrls = EASTER_EGGS.map(e => `
  <url>
    <loc>${base}/easter-eggs/${e.id}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>`).join('');
    const cheatCodeUrls = CHEAT_CODES.map(c => `
  <url>
    <loc>${base}/cheat-codes/${c.id}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>`).join('');
    const sequelUrls = SEQUELS.map(s => `
  <url>
    <loc>${base}/sequels/${s.id}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>`).join('');
    const romHackUrls = ROM_HACKS.map(r => `
  <url>
    <loc>${base}/rom-hacks/${r.id}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>`).join('');
    const adCampaignUrls = AD_CAMPAIGNS.map(a => `
  <url>
    <loc>${base}/ad-campaigns/${a.id}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>`).join('');
    const speedrunUrls = SPEEDRUNS.map(s => `
  <url>
    <loc>${base}/speedruns/${s.id}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>`).join('');
    const criticUrls = CRITICS.map(c => `
  <url>
    <loc>${base}/critics/${c.id}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>`).join('');
    const cancelledUrls = CANCELLED.map(c => `
  <url>
    <loc>${base}/cancelled/${c.id}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>`).join('');
    const localizationUrls = LOCALIZATION.map(l => `
  <url>
    <loc>${base}/localization/${l.id}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>`).join('');
    const prototypeUrls = PROTOTYPES.map(p => `
  <url>
    <loc>${base}/prototypes/${p.id}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>`).join('');
    const strategyGuideUrls = STRATEGY_GUIDES.map(g => `
  <url>
    <loc>${base}/strategy-guides/${g.id}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>`).join('');
    const cabinetArtUrls = CABINET_ART.map(c => `
  <url>
    <loc>${base}/cabinet-art/${c.id}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>`).join('');
    const merchandiseUrls = MERCHANDISE.map(m => `
  <url>
    <loc>${base}/merchandise/${m.id}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>`).join('');
    const bootlegUrls = BOOTLEGS.map(b => `
  <url>
    <loc>${base}/bootlegs/${b.id}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>`).join('');
    const competitiveUrls = COMPETITIVE.map(c => `
  <url>
    <loc>${base}/competitive/${c.id}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>`).join('');
    const endingUrls = ENDINGS.map(e => `
  <url>
    <loc>${base}/endings/${e.id}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>`).join('');
    const bossfightUrls = BOSSFIGHTS.map(b => `
  <url>
    <loc>${base}/bossfights/${b.id}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>`).join('');
    const soundtrackUrls = SOUNDTRACKS.map(s => `
  <url>
    <loc>${base}/soundtracks/${s.id}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>`).join('');
    const manualUrls = MANUALS.map(m => `
  <url>
    <loc>${base}/manuals/${m.id}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>`).join('');
    const difficultyUrls = DIFFICULTY.map(d => `
  <url>
    <loc>${base}/difficulty/${d.id}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>`).join('');
    const characterUrls = CHARACTERS.map(c => `
  <url>
    <loc>${base}/characters/${c.id}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>`).join('');
    const coverStoryUrls = COVER_STORIES.map(c => `
  <url>
    <loc>${base}/cover-stories/${c.id}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>`).join('');
    const controllerUrls = CONTROLLERS.map(c => `
  <url>
    <loc>${base}/controllers/${c.id}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>`).join('');
    const disappointmentUrls = DISAPPOINTMENTS.map(d => `
  <url>
    <loc>${base}/disappointments/${d.id}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>`).join('');
    const levelUrls = LEVELS.map(l => `
  <url>
    <loc>${base}/levels/${l.id}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>`).join('');
    const urbanLegendUrls = URBAN_LEGENDS.map(u => `
  <url>
    <loc>${base}/urban-legends/${u.id}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>`).join('');
    const glitchUrls = GLITCHES.map(g => `
  <url>
    <loc>${base}/glitches/${g.id}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>`).join('');
    const packagingUrls = PACKAGING.map(p => `
  <url>
    <loc>${base}/packaging/${p.id}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>`).join('');
    const multiplayerUrls = MULTIPLAYER.map(m => `
  <url>
    <loc>${base}/multiplayer/${m.id}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>`).join('');
    const comicUrls = COMICS.map(c => `
  <url>
    <loc>${base}/comics/${c.id}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>`).join('');
    const studioUrls = STUDIOS.map(s => `
  <url>
    <loc>${base}/studios/${s.id}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>`).join('');
    const importUrls = IMPORTS.map(i => `
  <url>
    <loc>${base}/imports/${i.id}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>`).join('');
    const speedrunTechUrls = SPEEDRUN_TECHNIQUES.map(s => `
  <url>
    <loc>${base}/speedrun-techniques/${s.id}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>`).join('');
    const famousBugUrls = FAMOUS_BUGS.map(b => `
  <url>
    <loc>${base}/famous-bugs/${b.id}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>`).join('');
    const retroRevivalUrls = RETRO_REVIVAL.map(r => `
  <url>
    <loc>${base}/retro-revival/${r.id}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>`).join('');
    const soundEffectUrls = SOUND_EFFECTS.map(s => `
  <url>
    <loc>${base}/sound-effects/${s.id}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>`).join('');
    const salesFigureUrls = SALES_FIGURES.map(s => `
  <url>
    <loc>${base}/sales-figures/${s.id}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>`).join('');
    // One 1,953-URL sitemap is valid but tells you nothing: Search Console
    // reports coverage per submitted sitemap, so a single file can only ever
    // say "1,400 indexed, 553 not" with no clue which kind of page is failing.
    // Split into a sitemap index of six themed children and the same report
    // becomes per-section. /sitemap.xml stays the index, so a sitemap already
    // submitted to Search Console keeps working without resubmission.
    const GROUPS = [
      ['core', [staticUrls]],
      ['games', [gameUrls]],
      ['hardware', [platformUrls, hardwareUrls, arcadeBoardUrls, peripheralUrls, controllerUrls,
        soundChipUrls, gameEngineUrls, failedConsoleUrls, packagingUrls]],
      ['people', [developerUrls, publisherUrls, studioUrls, composerUrls, designerUrls,
        producerUrls, voiceActorUrls, pixelArtistUrls, criticUrls, characterUrls]],
      ['writing', [essayUrls, yearUrls, decadeUrls, magazineUrls, coverStoryUrls,
        strategyGuideUrls, manualUrls, comicUrls]],
      ['catalogue', [franchiseUrls, lostGameUrls, regionalUrls, genreUrls, boxArtUrls, portUrls,
        collectionUrls, controversyUrls, easterEggUrls, cheatCodeUrls, sequelUrls, romHackUrls,
        adCampaignUrls, speedrunUrls, cancelledUrls, localizationUrls, prototypeUrls,
        cabinetArtUrls, merchandiseUrls, bootlegUrls, competitiveUrls, endingUrls, bossfightUrls,
        soundtrackUrls, difficultyUrls, disappointmentUrls, levelUrls, urbanLegendUrls,
        glitchUrls, multiplayerUrls, importUrls, speedrunTechUrls, famousBugUrls,
        retroRevivalUrls, soundEffectUrls, salesFigureUrls]],
    ];
    // The flat form is still the source of truth. A section added to the data
    // but forgotten in GROUPS would silently vanish from the sitemap — the exact
    // way sales-figures went unlisted before — so count both and fall back to
    // the single-file sitemap rather than publish a lossy index.
    const flat = `${staticUrls}${platformUrls}${developerUrls}${composerUrls}${franchiseUrls}${hardwareUrls}${designerUrls}${publisherUrls}${arcadeBoardUrls}${peripheralUrls}${lostGameUrls}${regionalUrls}${genreUrls}${essayUrls}${yearUrls}${decadeUrls}${magazineUrls}${boxArtUrls}${portUrls}${voiceActorUrls}${pixelArtistUrls}${producerUrls}${collectionUrls}${controversyUrls}${failedConsoleUrls}${gameEngineUrls}${soundChipUrls}${easterEggUrls}${cheatCodeUrls}${sequelUrls}${romHackUrls}${adCampaignUrls}${speedrunUrls}${criticUrls}${cancelledUrls}${localizationUrls}${prototypeUrls}${strategyGuideUrls}${cabinetArtUrls}${merchandiseUrls}${bootlegUrls}${competitiveUrls}${endingUrls}${bossfightUrls}${soundtrackUrls}${manualUrls}${difficultyUrls}${characterUrls}${coverStoryUrls}${controllerUrls}${disappointmentUrls}${levelUrls}${urbanLegendUrls}${glitchUrls}${packagingUrls}${multiplayerUrls}${comicUrls}${studioUrls}${importUrls}${speedrunTechUrls}${famousBugUrls}${retroRevivalUrls}${soundEffectUrls}${salesFigureUrls}${gameUrls}`;
    const countLocs = str => (str.match(/<loc>/g) || []).length;
    const grouped = GROUPS.map(([name, parts]) => [name, parts.join('')]);
    const complete = grouped.reduce((n, [, xml]) => n + countLocs(xml), 0) === countLocs(flat);
    if (!complete) console.warn('[sitemap] group split is lossy — serving the single-file sitemap');

    const wrap = body => `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">${body}
</urlset>`;

    // Swap the uniform date for each URL's own last-changed date.
    const stamp = xml => xml.replace(/<loc>([^<]*)<\/loc>(\s*)<lastmod>[^<]*<\/lastmod>/g,
      (m, loc, ws) => `<loc>${loc}</loc>${ws}<lastmod>${urlLastmod(loc.slice(base.length) || '/')}</lastmod>`);
    const newestLastmod = xml => (xml.match(/<lastmod>[^<]*/g) || [])
      .map(t => t.slice(9)).reduce((m, d) => (d > m ? d : m), '') || today;
    for (const g of grouped) g[1] = stamp(g[1]);
    const children = new Map(grouped.map(([name, xml]) => [name, wrap(xml)]));
    const index = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${grouped.map(([name]) => `
  <sitemap>
    <loc>${base}/sitemaps/${name}.xml</loc>
    <lastmod>${newestLastmod(children.get(name))}</lastmod>
  </sitemap>`).join('')}
</sitemapindex>`;

    cachedSitemap = complete
      ? { xml: index, type: 'index', children }
      : { xml: wrap(stamp(flat)), type: 'urlset', children: new Map() };
  }
}

app.get('/sitemap.xml', (req, res) => {
  buildSitemapCache();
  res.header('Content-Type', 'application/xml');
  res.set('Cache-Control', 'public, max-age=86400');
  res.send(cachedSitemap.xml);
});

// Children of the sitemap index. Reuses the same cache, so hitting a child
// cold builds the whole set once.
app.get('/sitemaps/:name.xml', (req, res, next) => {
  if (!cachedSitemap) buildSitemapCache();
  const xml = cachedSitemap.children.get(req.params.name);
  if (!xml) return next();
  res.header('Content-Type', 'application/xml');
  res.set('Cache-Control', 'public, max-age=86400');
  res.send(xml);
});

app.get('/robots.txt', (req, res) => {
  res.type('text/plain');
  // Keep crawl budget on the ~1,900 content URLs: /search and /compare are
  // unbounded query-string spaces, /random is a redirect, /api returns JSON.
  // Only the query-string forms are blocked — the bare /search and /bookmarks
  // pages carry `noindex` instead, and a blocked page is one whose noindex
  // Google never gets to read, so it can linger in the index as a bare URL.
  res.send([
    'User-agent: *',
    'Allow: /',
    'Disallow: /search?',
    'Disallow: /compare?',
    'Disallow: /random',
    'Disallow: /api/',
    '',
    `Sitemap: ${SITE_URL}/sitemap.xml`,
    '',
  ].join('\n'));
});

app.get('/random', (req, res) => {
  const game = games[Math.floor(Math.random() * games.length)];
  res.redirect(302, `/games/${game.id}`);
});

let cachedBrowseHtml = null;
app.get('/browse', (req, res) => {
  if (!cachedBrowseHtml) cachedBrowseHtml = browsePage();
  res.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
  res.send(cachedBrowseHtml);
});

app.get('/api/games', (req, res) => {
  res.set('Cache-Control', 'public, max-age=3600');
  res.json(gamesSlim);
});

app.get('/api/games/:id', (req, res) => {
  const game = gamesById.get(req.params.id);
  if (!game) return res.status(404).json({ error: 'Game not found' });
  res.set('Cache-Control', 'public, max-age=3600');
  res.json(game);
});

app.get('/api/game-of-the-day', (req, res) => {
  res.set('Cache-Control', 'public, max-age=3600');
  res.json(gameOfDay());
});

app.get('/api/retro-news', async (req, res) => {
  refreshNews().catch(() => {});
  const articles = newsCache.articles.map(a => ({
    title: a.title,
    link: a.link,
    description: a.description,
    source: a.source,
    pubDate: a.pubDate,
  }));
  res.set('Cache-Control', 'public, max-age=1800, stale-while-revalidate=21600');
  res.json(articles);
});

app.get('/api/search', (req, res) => {
  const q = String(req.query.q || '');
  const { results } = runSearch(q, 8);
  res.set('Cache-Control', 'public, max-age=300');
  res.json(results.map(d => ({ title: d.title, sub: d.sub || d.label, href: d.href })));
});

app.get('/games', (req, res) => {
  if (!cachedGamesListHtml) cachedGamesListHtml = gamesListPage();
  res.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
  res.set('Link', `<${CSS_PATH}>; rel=preload; as=style`);
  res.send(cachedGamesListHtml);
});

app.get('/games/:id', (req, res) => {
  // A slug dropped as a near-duplicate keeps its inbound links and passes its
  // ranking signal to the surviving page instead of decaying into a 404.
  const alias = GAME_ALIASES.get(req.params.id);
  if (alias) return res.redirect(301, `/games/${alias}`);
  const game = gamesById.get(req.params.id);
  if (!game) return res.status(404).send(notFoundPage());
  if (!cachedGamePageHtml.has(game.id)) {
    cachedGamePageHtml.set(game.id, gameDetailPage(game, SITE_URL));
  }
  res.set('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
  res.set('Link', `<${CSS_PATH}>; rel=preload; as=style`);
  res.send(cachedGamePageHtml.get(game.id));
});

// Hub + entry routes for a section whose entries live at /<slug>/<id>. 59
// sections used to spell this out by hand, each with its own pair of cache
// variables; both pages are rendered once per instance and kept. Sections that
// 301 retired slugs (games, essays) keep their own routes.
// Entries deliberately removed after fact-checking found them unverifiable or
// false. Their URLs answer 410 Gone rather than 404, which tells search
// engines the page was withdrawn on purpose and can be dropped promptly.
const RETIRED_ENTRIES = new Set([
  'lost-games/the-9-nes',
  'glitches/soul-reaver-teleport',
  'merchandise/mario-kart-happy-meal',
  'pixel-artists/susan-lee-merritt',
  'voice-actors/barry-stigler',
  'speedrun-techniques/alttp-wrong-warp',
  'speedrun-techniques/sotn-save-corruption',
  'speedrun-techniques/mega-man-2-pause-glitch',
  'speedrun-techniques/goldeneye-flag-body',
  'prototypes/street-fighter-ii-beta-1991',
  'strategy-guides/sonic-the-hedgehog-first-guide-sega',
  'strategy-guides/chrono-trigger-japanese-guide-square',
  'strategy-guides/mortal-kombat-arcade-move-cards',
]);

// The same cancelled game written up twice — once under Lost Games, once under
// Cancelled — with 67–94% of the same vocabulary. Both pages stay for readers,
// but the shorter lost-games copy names the fuller cancelled-games page as its
// canonical and is left out of the sitemap, so the two stop competing.
const CANONICAL_OVERRIDES = new Map([
  ['/lost-games/starfox-2-snes', '/cancelled/starfox-2-snes'],
  ['/lost-games/thrill-kill', '/cancelled/thrill-kill-ps1'],
  ['/lost-games/dinosaur-planet-n64', '/cancelled/dinosaur-planet-n64'],
  ['/lost-games/sonic-xtreme', '/cancelled/sonic-xtreme-saturn'],
  ['/lost-games/castlevania-resurrection', '/cancelled/castlevania-resurrection-dreamcast'],
  ['/lost-games/earthbound-64-mother-3-n64', '/cancelled/earthbound-64-mother-3-n64'],
  ['/lost-games/duke-nukem-forever-1997-era', '/cancelled/duke-nukem-forever-development-hell'],
]);

function sectionRoutes(slug, entries, listPage, detailPage) {
  let listHtml = null;
  let byId = null;
  const pages = new Map();
  app.get(`/${slug}`, (req, res) => {
    if (!listHtml) listHtml = listPage();
    res.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
    res.set('Link', `<${CSS_PATH}>; rel=preload; as=style`);
    res.send(listHtml);
  });
  app.get(`/${slug}/:id`, (req, res) => {
    if (!byId) {
      // First entry wins on a duplicate id, as Array#find did.
      byId = new Map();
      for (const e of entries) if (e && !byId.has(e.id)) byId.set(e.id, e);
    }
    const entry = byId.get(req.params.id);
    if (!entry) return res.status(RETIRED_ENTRIES.has(`${slug}/${req.params.id}`) ? 410 : 404).send(notFoundPage());
    if (!pages.has(entry.id)) pages.set(entry.id, detailPage(entry));
    res.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
    res.set('Link', `<${CSS_PATH}>; rel=preload; as=style`);
    res.send(pages.get(entry.id));
  });
}

sectionRoutes('platforms', PLATFORMS, platformsListPage, platformDetailPage);

app.get('/genres', (req, res) => {
  if (!cachedGenresListHtml) cachedGenresListHtml = genresListPage();
  res.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
  res.set('Link', `<${CSS_PATH}>; rel=preload; as=style`);
  res.send(cachedGenresListHtml);
});

app.get('/genres/:id', (req, res) => {
  const genre = GENRES.find(g => g.id === req.params.id);
  if (!genre) return res.status(404).send(notFoundPage());
  if (!cachedGenrePageHtml[genre.id]) {
    cachedGenrePageHtml[genre.id] = genreDetailPage(genre);
  }
  res.set('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
  res.set('Link', `<${CSS_PATH}>; rel=preload; as=style`);
  res.send(cachedGenrePageHtml[genre.id]);
});

app.get('/essays', (req, res) => {
  if (!cachedEssaysListHtml) cachedEssaysListHtml = essaysListPage();
  res.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
  res.set('Link', `<${CSS_PATH}>; rel=preload; as=style`);
  res.send(cachedEssaysListHtml);
});

app.get('/essays/:id', (req, res) => {
  const alias = ESSAY_ALIASES.get(req.params.id);
  if (alias) return res.redirect(301, `/essays/${alias}`);
  const essay = ESSAYS.find(e => e.id === req.params.id);
  if (!essay) return res.status(404).send(notFoundPage());
  if (!cachedEssayPageHtml[essay.id]) {
    cachedEssayPageHtml[essay.id] = essayDetailPage(essay);
  }
  res.set('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
  res.set('Link', `<${CSS_PATH}>; rel=preload; as=style`);
  res.send(cachedEssayPageHtml[essay.id]);
});

sectionRoutes('developers', DEVELOPERS, developersListPage, developerDetailPage);

sectionRoutes('composers', COMPOSERS, composersListPage, composerDetailPage);

sectionRoutes('franchises', FRANCHISES, franchisesListPage, franchiseDetailPage);

sectionRoutes('hardware', HARDWARE, hardwareListPage, hardwareDetailPage);

sectionRoutes('designers', DESIGNERS, designersListPage, designerDetailPage);

app.get('/years', (req, res) => {
  if (!cachedYearsListHtml) cachedYearsListHtml = yearsListPage();
  res.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
  res.set('Link', `<${CSS_PATH}>; rel=preload; as=style`);
  res.send(cachedYearsListHtml);
});

app.get('/years/:year', (req, res) => {
  const year = parseInt(req.params.year, 10);
  if (!yearsIndex.has(year)) return res.status(404).send(notFoundPage());
  if (!cachedYearPageHtml[year]) cachedYearPageHtml[year] = yearDetailPage(year, YEAR_REVIEWS_MAP.get(String(year)));
  res.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
  res.set('Link', `<${CSS_PATH}>; rel=preload; as=style`);
  res.send(cachedYearPageHtml[year]);
});

sectionRoutes('regional', REGIONAL, regionalListPage, regionalDetailPage);

sectionRoutes('publishers', PUBLISHERS, publishersListPage, publisherDetailPage);

sectionRoutes('arcade-boards', ARCADE_BOARDS, arcadeBoardsListPage, arcadeBoardDetailPage);

sectionRoutes('peripherals', PERIPHERALS, peripheralsListPage, peripheralDetailPage);

sectionRoutes('lost-games', LOST_GAMES, lostGamesListPage, lostGameDetailPage);

app.get('/decades', (req, res) => {
  if (!cachedDecadesListHtml) cachedDecadesListHtml = decadesListPage();
  res.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
  res.set('Link', `<${CSS_PATH}>; rel=preload; as=style`);
  res.send(cachedDecadesListHtml);
});

app.get('/decades/:decade', (req, res) => {
  const decade = req.params.decade;
  if (!decadesIndex.has(decade)) return res.status(404).send(notFoundPage());
  if (!cachedDecadePageHtml[decade]) cachedDecadePageHtml[decade] = decadeDetailPage(decade);
  res.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
  res.set('Link', `<${CSS_PATH}>; rel=preload; as=style`);
  res.send(cachedDecadePageHtml[decade]);
});

app.get('/family-tree', (req, res) => {
  if (!cachedFamilyTreeHtml) cachedFamilyTreeHtml = familyTreePage();
  res.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
  res.set('Link', `<${CSS_PATH}>; rel=preload; as=style`);
  res.send(cachedFamilyTreeHtml);
});

app.get('/compare', (req, res) => {
  const a = req.query.a ? PLATFORMS.find(p => p.id === req.query.a) : null;
  const b = req.query.b ? PLATFORMS.find(p => p.id === req.query.b) : null;
  res.set('Cache-Control', 'no-store');
  res.set('Link', `<${CSS_PATH}>; rel=preload; as=style`);
  res.send(comparePage(a, b));
});

app.get('/search', (req, res) => {
  const q = (req.query.q || '').trim();
  res.set('Cache-Control', 'no-store');
  res.set('Link', `<${CSS_PATH}>; rel=preload; as=style`);
  res.send(searchPage(q));
});

sectionRoutes('magazines', MAGAZINES, magazinesListPage, magazineDetailPage);

sectionRoutes('box-art', BOX_ART, boxArtListPage, boxArtDetailPage);

sectionRoutes('ports', PORTS, portsListPage, portDetailPage);

sectionRoutes('voice-actors', VOICE_ACTORS, voiceActorsListPage, voiceActorDetailPage);

sectionRoutes('pixel-artists', PIXEL_ARTISTS, pixelArtistsListPage, pixelArtistDetailPage);

sectionRoutes('producers', PRODUCERS, producersListPage, producerDetailPage);

sectionRoutes('collections', COLLECTIONS, collectionsListPage, collectionDetailPage);

app.get('/stats', (req, res) => {
  if (!cachedStatsHtml) cachedStatsHtml = statsPage();
  res.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
  res.set('Link', `<${CSS_PATH}>; rel=preload; as=style`);
  res.send(cachedStatsHtml);
});

app.get('/recent', (req, res) => {
  if (!cachedRecentHtml) cachedRecentHtml = recentPage();
  res.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
  res.set('Link', `<${CSS_PATH}>; rel=preload; as=style`);
  res.send(cachedRecentHtml);
});

app.get('/timeline', (req, res) => {
  if (!cachedTimelineHtml) cachedTimelineHtml = timelinePage();
  res.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
  res.set('Link', `<${CSS_PATH}>; rel=preload; as=style`);
  res.send(cachedTimelineHtml);
});

sectionRoutes('sequels', SEQUELS, sequelsListPage, sequelDetailPage);

sectionRoutes('rom-hacks', ROM_HACKS, romHacksListPage, romHackDetailPage);

sectionRoutes('ad-campaigns', AD_CAMPAIGNS, adCampaignsListPage, adCampaignDetailPage);

sectionRoutes('sales-figures', SALES_FIGURES, salesFiguresPage, salesFigureDetailPage);

sectionRoutes('speedruns', SPEEDRUNS, speedrunsListPage, speedrunDetailPage);

sectionRoutes('critics', CRITICS, criticsListPage, criticDetailPage);

app.get('/wordsearch', (req, res) => {
  if (!cachedWordSearchHtml) cachedWordSearchHtml = wordSearchPage();
  res.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
  res.set('Link', `<${CSS_PATH}>; rel=preload; as=style`);
  res.send(cachedWordSearchHtml);
});

app.get('/bookmarks', (req, res) => {
  if (!cachedBookmarksHtml) cachedBookmarksHtml = bookmarksPage();
  res.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
  res.set('Link', `<${CSS_PATH}>; rel=preload; as=style`);
  res.send(cachedBookmarksHtml);
});

sectionRoutes('cancelled', CANCELLED, cancelledListPage, cancelledDetailPage);

sectionRoutes('localization', LOCALIZATION, localizationListPage, localizationDetailPage);

sectionRoutes('prototypes', PROTOTYPES, prototypesListPage, prototypeDetailPage);

sectionRoutes('strategy-guides', STRATEGY_GUIDES, strategyGuidesListPage, strategyGuideDetailPage);

sectionRoutes('cabinet-art', CABINET_ART, cabinetArtListPage, cabinetArtDetailPage);

sectionRoutes('merchandise', MERCHANDISE, merchandiseListPage, merchandiseDetailPage);

sectionRoutes('bootlegs', BOOTLEGS, bootlegsListPage, bootlegDetailPage);

sectionRoutes('competitive', COMPETITIVE, competitiveListPage, competitiveDetailPage);

sectionRoutes('endings', ENDINGS, endingsListPage, endingDetailPage);

sectionRoutes('bossfights', BOSSFIGHTS, bossfightsListPage, bossfightDetailPage);

sectionRoutes('soundtracks', SOUNDTRACKS, soundtracksListPage, soundtrackDetailPage);

sectionRoutes('manuals', MANUALS, manualsListPage, manualDetailPage);

sectionRoutes('difficulty', DIFFICULTY, difficultyListPage, difficultyDetailPage);

sectionRoutes('characters', CHARACTERS, charactersListPage, characterDetailPage);

sectionRoutes('cover-stories', COVER_STORIES, coverStoriesListPage, coverStoryDetailPage);

sectionRoutes('controllers', CONTROLLERS, controllersListPage, controllerDetailPage);

sectionRoutes('disappointments', DISAPPOINTMENTS, disappointmentsListPage, disappointmentDetailPage);

sectionRoutes('levels', LEVELS, levelsListPage, levelDetailPage);

sectionRoutes('urban-legends', URBAN_LEGENDS, urbanLegendsListPage, urbanLegendDetailPage);

sectionRoutes('glitches', GLITCHES, glitchesListPage, glitchDetailPage);

sectionRoutes('packaging', PACKAGING, packagingListPage, packagingDetailPage);

sectionRoutes('multiplayer', MULTIPLAYER, multiplayerListPage, multiplayerDetailPage);

sectionRoutes('comics', COMICS, comicsListPage, comicDetailPage);

sectionRoutes('studios', STUDIOS, studiosListPage, studioDetailPage);

sectionRoutes('imports', IMPORTS, importsListPage, importDetailPage);

sectionRoutes('speedrun-techniques', SPEEDRUN_TECHNIQUES, speedrunTechniquesListPage, speedrunTechniqueDetailPage);

sectionRoutes('famous-bugs', FAMOUS_BUGS, famousBugsListPage, famousBugDetailPage);

sectionRoutes('retro-revival', RETRO_REVIVAL, retroRevivalListPage, retroRevivalDetailPage);

sectionRoutes('sound-effects', SOUND_EFFECTS, soundEffectsListPage, soundEffectDetailPage);

sectionRoutes('controversies', CONTROVERSIES, controversiesListPage, controversyDetailPage);

sectionRoutes('failed-consoles', FAILED_CONSOLES, failedConsolesListPage, failedConsoleDetailPage);

sectionRoutes('game-engines', GAME_ENGINES, gameEnginesListPage, gameEngineDetailPage);

sectionRoutes('sound-chips', SOUND_CHIPS, soundChipsListPage, soundChipDetailPage);

sectionRoutes('easter-eggs', EASTER_EGGS, easterEggsListPage, easterEggDetailPage);

sectionRoutes('cheat-codes', CHEAT_CODES, cheatCodesListPage, cheatCodeDetailPage);

app.get('/glossary', (req, res) => {
  if (!cachedGlossaryHtml) cachedGlossaryHtml = glossaryPage();
  res.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
  res.set('Link', `<${CSS_PATH}>; rel=preload; as=style`);
  res.send(cachedGlossaryHtml);
});

app.get('/quiz', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.set('Link', `<${CSS_PATH}>; rel=preload; as=style`);
  res.send(quizPage());
});

app.get('/on-this-day', (req, res) => {
  res.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
  res.set('Link', `<${CSS_PATH}>; rel=preload; as=style`);
  res.send(onThisDayPage());
});

app.get('/map', (req, res) => {
  if (!cachedStudioMapHtml) cachedStudioMapHtml = studioMapPage();
  res.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
  res.set('Link', `<${CSS_PATH}>; rel=preload; as=style`);
  res.send(cachedStudioMapHtml);
});

app.get('/feed.xml', (req, res) => {
  const base = SITE_URL;
  const recent = ESSAYS.slice(-20).reverse();
  const items = recent.map(e => `
    <item>
      <title>${escapeHtml(e.title)}</title>
      <link>${base}/essays/${e.id}</link>
      <description>${escapeHtml(e.summary || '')}</description>
      <guid>${base}/essays/${e.id}</guid>
    </item>`).join('');
  res.set('Content-Type', 'application/rss+xml; charset=utf-8');
  res.set('Cache-Control', 'public, max-age=3600');
  res.send(`<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Bosnan – Retro Gaming Essays</title>
    <link>${base}</link>
    <description>Essays on retro video game history, design, and technology.</description>
    <language>en</language>
    ${items}
  </channel>
</rss>`);
});

// ── Page generators ──────────────────────────────────────────────────────────

function browsePage() {
  const total = NAV_GROUPS.reduce((n, g) => n + g.items.length, 0);
  const groupsHtml = NAV_GROUPS.map(g => `<div class="browse-group">
    <h2>${g.name}</h2>
    <div class="browse-links">
      ${g.items.map(([, href, label]) => `<a href="${href}">${label}</a>`).join('\n      ')}
    </div>
  </div>`).join('\n  ');
  const az = NAV_GROUPS.flatMap(g => g.items)
    .slice()
    .sort((a, b) => a[2].localeCompare(b[2]))
    .map(([, href, label]) => `<a href="${href}">${label}</a>`)
    .join('\n      ');
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Browse All ${total} Sections – ${SITE_NAME}</title>
    <meta name="description" content="Every section of the Bosnan retro gaming archive in one place: games, platforms, developers, soundtracks, magazines, speedruns, and ${total - 6}+ more.">
    <script type="application/ld+json">${JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: `Browse All ${total} Sections`,
      url: `${SITE_URL}/browse`,
      isPartOf: { '@type': 'WebSite', '@id': WEBSITE_ID, name: SITE_NAME, url: `${SITE_URL}/` },
      publisher: ORG_SCHEMA,
      mainEntity: {
        '@type': 'ItemList',
        numberOfItems: total,
        itemListElement: NAV_GROUPS.flatMap(g => g.items).map(([, href, label], i) => ({
          '@type': 'ListItem', position: i + 1, name: label, url: SITE_URL + href,
        })),
      },
    }).replace(/</g, '\\u003c')}</script>
    ${breadcrumbSchema([{ name: 'Home', path: '/' }, { name: 'All sections', path: '/browse' }])}
    ${cssHead()}
</head>
<body>
${nav('browse')}
<section class="platforms-hero">
    <h1>Browse the Archive</h1>
    <p>All ${total} sections, grouped by theme</p>
</section>
<div class="browse-wrapper">
  ${groupsHtml}
  <div class="browse-group">
    <h2>A&ndash;Z</h2>
    <div class="browse-links browse-az">
      ${az}
    </div>
  </div>
</div>
${toggleScript()}
</body>
</html>`;
}

// The site had no page that said what it is or who publishes it. That is the
// gap behind "no recognized entity for bosnan.net": an entity is recognised
// from a page that states its scope, method and identity, corroborated by the
// same `@id` on every other page. Everything stated here is checkable against
// the archive itself — no claims about people or affiliations that the data
// cannot back.
function aboutPage() {
  const sections = NAV_GROUPS.reduce((n, g) => n + g.items.length, 0);
  const desc = `Bosnan is an independent archive of video game history, ${ARCHIVE_SPAN_DASH} — `
    + `${games.length} game entries, ${ESSAYS.length} essays and ${sections} sections `
    + `on hardware, developers and music.`;
  const schema = JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'AboutPage',
        '@id': `${SITE_URL}/about#page`,
        name: `About ${SITE_NAME}`,
        url: `${SITE_URL}/about`,
        description: desc,
        inLanguage: 'en',
        isPartOf: { '@id': WEBSITE_ID },
        about: { '@id': ORG_ID },
        mainEntity: { '@id': ORG_ID },
        publisher: { '@id': ORG_ID },
      },
      {
        ...ORG_SCHEMA,
        description: desc,
        knowsAbout: [
          'Retro video games', 'Arcade games', 'Video game history',
          'Home computer games', '8-bit consoles', 'Video game music',
          'Video game preservation',
        ],
        mainEntityOfPage: { '@id': `${SITE_URL}/about#page` },
      },
    ],
  }).replace(/</g, '\u003c');
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>About Bosnan — An Independent Retro Game History Archive</title>
    <meta name="description" content="${escapeHtml(desc)}">
    <script type="application/ld+json">${schema}</script>
    ${breadcrumbSchema([{ name: 'Home', path: '/' }, { name: 'About', path: '/about' }])}
    ${cssHead()}
</head>
<body>
${nav('about')}
<section class="platforms-hero">
    <h1>About Bosnan</h1>
    <p>An independent archive of video game history, ${ARCHIVE_SPAN_DASH}</p>
</section>
<div class="essay-wrapper">
  <p><strong>Bosnan</strong> is a free, independent, non-commercial reference archive for the
  first five decades of video games — the mainframe experiments of the 1950s and 60s, the arcade
  boom, the 8-bit consoles and home-computer scenes that grew up beside them, and the 16- and
  32-bit machines that closed out the century.</p>

  <h2>What is in the archive</h2>
  <p>The archive currently holds <strong>${games.length} game entries</strong> and
  <strong>${ESSAYS.length} long-form essays</strong>, organised into
  <strong>${sections} reference sections</strong>. Alongside the games themselves it documents the
  things around them that are usually lost first: the
  <a href="/arcade-boards">arcade boards</a> and <a href="/sound-chips">sound chips</a> the games
  ran on, the <a href="/developers">developers</a>, <a href="/composers">composers</a> and
  <a href="/pixel-artists">pixel artists</a> who made them, the
  <a href="/magazines">magazines</a> that reviewed them, and the
  <a href="/cancelled">cancelled projects</a>, <a href="/prototypes">prototypes</a> and
  <a href="/lost-games">lost games</a> that never reached anyone at all.</p>
  <p><a href="/browse">Browse all ${sections} sections &#8594;</a></p>

  <h2>Scope</h2>
  <p>The cut-off is the end of 1999. A title qualifies if it was released, announced or credibly
  documented before then, or if it is a late release (up to ${ARCHIVE_YEARS.to}) for a console or
  computer of that era, such as the Nintendo 64, PlayStation, Game Boy Color or Dreamcast;
  hardware, people and publications qualify if their significant work falls in the same window. Later material appears only where it is directly about that era —
  a <a href="/retro-revival">revival</a>, a re-release, or a <a href="/rom-hacks">ROM hack</a>
  of a game the archive already covers.</p>

  <h2>How entries are written</h2>
  <p>Every entry is written for this site rather than syndicated. Entries are cross-referenced:
  a game links to its developer, platform, genre and franchise, and those pages link back, so the
  archive can be read as a network rather than a list. Where an entry draws on a specific
  published source, that source is named on the entry itself.</p>
  <p>Corrections are welcome and wanted. Retro gaming history is full of figures that get copied
  between sites without anyone checking them, and this archive is not immune to that.</p>

  <h2>Independence</h2>
  <p>Bosnan is not affiliated with, endorsed by, or sponsored by any game publisher, hardware
  manufacturer or rights holder mentioned in the archive. Company names, game titles and
  trademarks belong to their respective owners and are used here for identification and
  commentary. The archive does not host or distribute game ROMs.</p>
  <p>There is no advertising, no paywall, no tracking beyond what the host records, and nothing
  for sale.</p>

  <h2>Start here</h2>
  <p>New readers usually start with the <a href="/games">game index</a>, the
  <a href="/platforms">platform histories</a>, or the <a href="/essays">essays</a>.
  <a href="/random">A random game</a> works too.</p>
</div>
${toggleScript()}
</body>
</html>`;
}

function homepagePage(gotd) {
  const gotdHref = `/games/${gotd.id}`;
  const gotdImgPath = gameImagePath(gotd);
  const gotdImgSrc = `/${escapeHtml(gotdImgPath || '')}`;
  const gotdDesc = !gotd.description ? ''
    : gotd.description.length <= 180 ? gotd.description
    : gotd.description.substring(0, 180).replace(/\s+\S*$/, '') + '…';

  const websiteSchema = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': WEBSITE_ID,
    name: SITE_NAME,
    alternateName: 'Bosnan',
    url: `${SITE_URL}/`,
    description: SITE_TAGLINE,
    inLanguage: 'en',
    potentialAction: {
      '@type': 'SearchAction',
      target: { '@type': 'EntryPoint', urlTemplate: `${SITE_URL}/search?q={search_term_string}` },
      'query-input': 'required name=search_term_string',
    },
    publisher: { '@id': ORG_ID },
  });
  const orgSchema = JSON.stringify({ '@context': 'https://schema.org', ...ORG_SCHEMA });

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Bosnan – Retro Games Archive: ${games.length}+ Classic Games, ${ARCHIVE_SPAN_DASH}</title>
    <meta name="description" content="Bosnan – explore legendary retro games from ${ARCHIVE_SPAN}. Browse ${games.length}+ games across Arcade, NES, C64, SNES, Genesis and PlayStation, plus essays and hardware.">
    <script type="application/ld+json">${websiteSchema}</script>
    <script type="application/ld+json">${orgSchema}</script>
    ${cssHead()}
</head>
<body>
${nav('home')}

<section class="home-hero">
    <h1>Retro Games Archive</h1>
    <p class="home-tagline">The history of video games, ${ARCHIVE_YEARS.from}&ndash;${ARCHIVE_YEARS.to} — games, hardware, people, and culture</p>
    <form class="home-search" action="/search" method="GET" role="search">
        <input type="search" name="q" placeholder="Search ${games.length} games, essays, platforms, people&#8230;" aria-label="Search the archive">
        <button type="submit">Search</button>
    </form>
    <div class="home-stats">
        <a href="/games">${games.length} games</a>
        <a href="/platforms">${PLATFORMS.length} platforms</a>
        <a href="/genres">${GENRES.length} genre histories</a>
        <a href="/essays">${ESSAYS.length} essays</a>
        <a href="/browse">all sections &#8594;</a>
    </div>
</section>

<div class="gotd-section">
    <h2>Game of the Day</h2>
    <a class="gotd-card" href="${escapeHtml(gotdHref)}">
        ${gotdImgPath ? `<img class="gotd-img${isTitleCard(gotdImgPath) ? ' is-titlecard' : ''}" src="${gotdImgSrc}" alt="${escapeHtml(gotd.title)}" fetchpriority="high" onerror="this.style.display='none'">` : ''}
        <div class="gotd-body">
            <h3 class="gotd-title">${escapeHtml(gotd.title)}</h3>
            <div class="gotd-meta">${escapeHtml(String(gotd.year))} · ${escapeHtml(gotd.genre)} · ${escapeHtml(gotd.platform)}</div>
            <p class="gotd-desc">${escapeHtml(gotdDesc)}</p>
        </div>
    </a>
</div>

<div class="news-section" id="newsSection">
    <div class="news-header">
        <h2>Retro Gaming News</h2>
        <p>Latest from around the web, updated daily</p>
    </div>
    <div class="news-grid" id="newsGrid">
        <div class="news-loading">Loading news&#8230;</div>
    </div>
</div>

<div class="enc-section">
    <div class="enc-header">
        <h2>Game Encyclopedia</h2>
        <p>Explore the history of every major video game genre — from the first arcade machines to the golden age of home computing</p>
    </div>
    <div class="enc-grid">
        <a href="/genres/shoot-em-up" class="enc-card">
            <div class="enc-card-name">Shoot 'em Ups</div>
            <div class="enc-card-era">1962 – present</div>
            <p class="enc-card-desc">From Spacewar! to Space Invaders — the genre that launched a billion-dollar industry</p>
        </a>
        <a href="/genres/platformer" class="enc-card">
            <div class="enc-card-name">Platform Games</div>
            <div class="enc-card-era">1981 – present</div>
            <p class="enc-card-desc">Donkey Kong, Pitfall!, Super Mario Bros. — the jump that changed everything</p>
        </a>
        <a href="/genres/rpg" class="enc-card">
            <div class="enc-card-name">Role-Playing Games</div>
            <div class="enc-card-era">1974 – present</div>
            <p class="enc-card-desc">Ultima, Wizardry, Rogue — character, growth, and the dungeon below</p>
        </a>
        <a href="/genres/adventure" class="enc-card">
            <div class="enc-card-name">Adventure Games</div>
            <div class="enc-card-era">1976 – present</div>
            <p class="enc-card-desc">Colossal Cave, Zork, Monkey Island — the birth of interactive storytelling</p>
        </a>
    </div>
    <a href="/genres" class="enc-browse-btn">Browse all ${GENRES.length} genres &#8594;</a>
</div>

<div class="enc-section home-about">
    <div class="enc-header">
        <h2>About the Archive</h2>
        <p>Bosnan is an independent archive of video game history from ${ARCHIVE_SPAN}. It covers ${games.length} games on ${PLATFORMS.length} platforms, together with the hardware, sound chips, designers, composers, studios, magazines, controversies and cancelled projects behind them, and ${ESSAYS.length} long-form essays. Entries are written from documented sources, many of which are cited on the page, and every entry links to the related games, people and machines elsewhere in the archive.</p>
        <p><a href="/about">How the archive is made</a> &middot; <a href="/browse">Browse every section</a> &middot; <a href="/timeline">Timeline</a> &middot; <a href="/glossary">Glossary of gaming terms</a></p>
    </div>
</div>

<script>
(function() {
  function timeAgo(iso) {
    const s = Math.floor((Date.now() - new Date(iso)) / 1000);
    if (s < 3600)  return Math.floor(s / 60) + 'm ago';
    if (s < 86400) return Math.floor(s / 3600) + 'h ago';
    return Math.floor(s / 86400) + 'd ago';
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});
  }
  fetch('/api/retro-news')
    .then(function(r){ return r.json(); })
    .then(function(articles) {
      var grid = document.getElementById('newsGrid');
      if (!grid) return;
      if (!articles || articles.length === 0) {
        grid.innerHTML = '<p class="news-empty">No news available right now.</p>';
        return;
      }
      grid.innerHTML = articles.map(function(a) {
        return '<a href="' + esc(a.link) + '" class="news-card" target="_blank" rel="noopener noreferrer">' +
          '<div class="news-card-source">' + esc(a.source) + ' &middot; ' + timeAgo(a.pubDate) + '</div>' +
          '<h3 class="news-card-title">' + esc(a.title) + '</h3>' +
          (a.description ? '<p class="news-card-desc">' + esc(a.description) + '&hellip;</p>' : '') +
          '</a>';
      }).join('');
    })
    .catch(function() {
      var s = document.getElementById('newsSection');
      if (s) s.style.display = 'none';
    });
})();
</script>

${toggleScript()}
</body>
</html>`;
}

function gamesListPage() {
  // Every game renders as a real anchor: the decade tabs and the search box
  // below filter the cards already in the DOM, so nothing here is gated on JS.
  const cardHtml = buildCardHtml(gamesSlim, EAGER_IMAGES, true);

  const itemListSchema = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `Retro Games Archive – ${games.length} classic games`,
    numberOfItems: games.length,
    itemListElement: gamesSlim.slice(0, HUB_ITEMLIST_MAX).map((g, i) => ({
      '@type': 'ListItem', position: i + 1, name: g.title, url: `${SITE_URL}/games/${g.id}`,
    })),
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>All ${games.length} Retro Games, ${ARCHIVE_SPAN_DASH} – Bosnan Archive</title>
    <meta name="description" content="Browse ${games.length} legendary retro games from ${ARCHIVE_SPAN}. Search by title, genre, platform, or decade.">
    <meta property="og:title" content="Retro Games Archive – Bosnan">
    <meta property="og:description" content="Browse ${games.length} legendary retro games from ${ARCHIVE_SPAN}.">
    <meta property="og:type" content="website">
    <script type="application/ld+json">${itemListSchema}</script>
    ${cssHead()}
</head>
<body>
${nav('games')}

<section class="games-hero">
    <h1>Retro Games Archive</h1>
    <p>A collection of legendary games from ${ARCHIVE_SPAN}</p>
</section>

<div class="games-controls">
    <div class="search-wrapper">
        <input type="text" id="searchInput" placeholder="Search games, genres, platforms..." autocomplete="off">
        <span class="search-icon">&#9906;</span>
    </div>
    <div class="filter-tabs">
        <button class="filter-btn active" data-decade="all">All Eras</button>
        ${DECADE_TABS.map(d => `<button class="filter-btn" data-decade="${escapeHtml(d)}">${escapeHtml(d)}</button>`).join('')}
    </div>
</div>

<div class="games-count" id="gamesCount">${gamesSlim.length} games in archive</div>

<h2 class="sr-only">All games</h2>
<div class="games-grid" id="gamesGrid">${cardHtml}
</div>

<div class="no-results" id="noResults" style="display:none">
    <p>No games found matching your search.</p>
    <button class="btn" onclick="clearSearch()">Clear Search</button>
</div>

${toggleScript()}
<script>
// Filters the server-rendered cards in place. The previous version shipped
// every game a second time as a JSON array and rebuilt the grid from it,
// which cost 93.6 KB and left 395 of 427 games reachable only by running JS.
const cards = Array.from(document.querySelectorAll('#gamesGrid .game-card'));
const grid = document.getElementById('gamesGrid');
const noResults = document.getElementById('noResults');
const countEl = document.getElementById('gamesCount');
let currentDecade = 'all', currentQuery = '', debounceTimer = null;

function applyFilter() {
    const q = currentQuery.trim().toLowerCase();
    let shown = 0;
    for (const c of cards) {
        const ok = (currentDecade === 'all' || c.dataset.decade === currentDecade)
            && (!q || c.dataset.s.indexOf(q) !== -1);
        c.style.display = ok ? '' : 'none';
        if (ok) shown++;
    }
    countEl.textContent = shown === cards.length
        ? cards.length + ' games in archive'
        : shown + ' of ' + cards.length + ' games';
    noResults.style.display = shown === 0 ? 'block' : 'none';
    grid.style.display = shown === 0 ? 'none' : '';
}
function clearSearch() { document.getElementById('searchInput').value = ''; currentQuery = ''; applyFilter(); }
document.getElementById('searchInput').addEventListener('input', e => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => { currentQuery = e.target.value; applyFilter(); }, 200);
});
document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentDecade = btn.dataset.decade;
        applyFilter();
    });
});
</script>
</body>
</html>`;
}

// Game text is stored with blank lines between paragraphs; one <p> per
// paragraph keeps them from running together into a single block.
function paragraphs(text) {
  return String(text || '').split(/\n\s*\n/).map(t => t.trim()).filter(Boolean)
    .map(t => `<p>${escapeHtml(t)}</p>`).join('\n        ');
}

// Game descriptions are often one long sentence with nowhere clean to cut, so
// metaDesc() would end them on an ellipsis. When the description neither fits
// nor trims to a whole sentence, build the snippet from the page's own
// structured facts instead, plus the first trivia line that fits: every word of
// it is on the page, it ends cleanly, and title + year keeps it unique.
function gameMetaDesc(game, max = 160) {
  const d = String(game.description || '').replace(/\s+/g, ' ').trim();
  if (d.length <= max) return escapeHtml(d);
  const fitted = fitDescription(d, max);
  if (fitted) return escapeHtml(fitted);
  const who = game.developer && game.publisher && game.publisher !== game.developer
    ? `by ${game.developer}, published by ${game.publisher}`
    : game.developer ? `by ${game.developer}` : '';
  const genre = game.genre ? (/(?:RPG|game|Adventure|Simulator|Simulation|Platformer|Shooter|up|Strategy)$/i.test(game.genre) ? game.genre : game.genre + ' game') : '';
  const platform = String(game.platform || '').replace(/ \/ Multiple$/, '').replace(/^Arcade$/, 'arcades');
  const what = [genre, platform ? `for ${platform}` : '', who].filter(Boolean).join(' ');
  const core = `${game.title}${game.year ? ` (${game.year})` : ''}: ${what}${/[.!?]$/.test(what) ? "" : "."}`;
  if (core.length > max) return metaDesc(d, max);
  const facts = (game.trivia || []).map(t => String(t).trim()).filter(Boolean);
  for (const t of facts) {
    const line = /[.!?]["”']?$/.test(t) ? t : t + '.';
    if (core.length + 1 + line.length <= max) return escapeHtml(`${core} ${line}`);
  }
  const tail = ' History, trivia and how it was made.';
  return escapeHtml(core.length + tail.length <= max ? core + tail : core);
}

function gameDetailPage(game, base) {
  const url = `${base}/games/${game.id}`;
  const shareImg = gameShareImage(game);
  const imgUrl = shareImg ? `${base}/${shareImg}` : DEFAULT_OG_IMAGE;
  const pageImg = gameImagePath(game);
  const desc = gameMetaDesc(game);

  const related = relatedGamesIndex.get(game.id) || [];

  const relatedHtml = related.length === 0 ? '' : `
<div class="related-section">
  <h2>More like this</h2>
  <div class="related-grid">
    ${buildCardHtml(related, 0)}
  </div>
</div>`;

  const devHref = developerHub(game), pubHref = publisherHub(game);
  const devPage = devHref ? DEVELOPERS.find(d => `/developers/${d.id}` === devHref) : null;
  const pubPage = pubHref ? PUBLISHERS.find(p => `/publishers/${p.id}` === pubHref) : null;
  // Nintendo, Sega and other first parties have their page under Developers.
  const pubAsDev = pubPage ? null : DEVELOPERS.find(d => (game.publisher || '').toLowerCase().includes(d.keyword.toLowerCase()));
  const pubUrl = pubPage ? `${base}/publishers/${pubPage.id}` : pubAsDev ? `${base}/developers/${pubAsDev.id}` : undefined;
  const schemaJson = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'VideoGame',
    name: game.title,
    description: game.description,
    datePublished: String(game.year),
    genre: game.genre,
    gamePlatform: game.platform,
    // Tie the game to the archive's own company pages where one exists, so the
    // developer and publisher resolve to entities rather than bare strings. The
    // developer field sometimes names people, so it only becomes an
    // Organization when it matches a developer page.
    author: devPage ? { '@type': 'Organization', name: devPage.name, url: `${base}/developers/${devPage.id}` } : undefined,
    publisher: { '@type': 'Organization', name: game.publisher, url: pubUrl },
    applicationCategory: 'Game',
    image: imgUrl,
    url,
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    citation: citationList(game).length ? citationList(game) : undefined,
  });

  const breadcrumbJson = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${base}/` },
      { '@type': 'ListItem', position: 2, name: 'Games', item: `${base}/games` },
      { '@type': 'ListItem', position: 3, name: game.title, item: url },
    ],
  });

  const pageTitle = `${escapeHtml(game.title)} (${game.year}) – ${escapeHtml(game.platform)} – Bosnan Retro Archive`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${pageTitle}</title>
    <meta name="description" content="${desc}">
    <meta property="og:title" content="${pageTitle}">
    <meta property="og:description" content="${desc}">
    <meta property="og:image" content="${imgUrl}">
    <meta property="og:url" content="${url}">
    <meta property="og:type" content="website">
    <meta property="og:site_name" content="${SITE_NAME}">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${pageTitle}">
    <meta name="twitter:description" content="${desc}">
    <meta name="twitter:image" content="${imgUrl}">
    <link rel="canonical" href="${url}">
    <script type="application/ld+json">${schemaJson}</script>
    <script type="application/ld+json">${breadcrumbJson}</script>
    ${cssHead()}
</head>
<body>
${nav('games')}

<div class="game-detail-wrapper">
  <nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a> &rsaquo; <a href="/games">Games</a> &rsaquo; <span aria-current="page">${escapeHtml(game.title)}</span></nav>

  <div class="game-detail-card">
    <div class="game-detail-image-col">
      ${pageImg
        ? `<img src="/${escapeHtml(pageImg)}" alt="${escapeHtml(game.title)} (${game.year}) ${isTitleCard(pageImg) ? `title card — ${escapeHtml(game.platform)}, ${escapeHtml(game.genre)}` : 'gameplay screenshot'}" class="game-detail-img${isTitleCard(pageImg) ? ' is-titlecard' : ''}"${isTitleCard(pageImg) ? ' width="1200" height="630"' : ''}
           fetchpriority="high" onerror="this.src='/images/games/placeholder.svg'">`
        : `<div class="game-detail-img game-detail-noimg" role="img" aria-label="No image of ${escapeHtml(game.title)} yet"><span>${escapeHtml(game.title)}</span><small>${escapeHtml(game.platform)} &middot; ${escapeHtml(String(game.year))}</small></div>`}
      <div class="game-meta">
        <div class="meta-item"><span class="meta-label">Year</span><span class="meta-value">${metaValue(String(game.year), `/years/${game.year}`)}</span></div>
        <div class="meta-item"><span class="meta-label">Decade</span><span class="meta-value">${metaValue(game.decade, `/decades/${encodeURIComponent(game.decade)}`)}</span></div>
        <div class="meta-item"><span class="meta-label">Genre</span><span class="meta-value">${metaValue(game.genre, genreHub(game))}</span></div>
        <div class="meta-item"><span class="meta-label">Platform</span><span class="meta-value">${metaValue(game.platform, platformHub(game))}</span></div>
        <div class="meta-item"><span class="meta-label">Developer</span><span class="meta-value">${metaValue(game.developer, developerHub(game))}</span></div>
        <div class="meta-item"><span class="meta-label">Publisher</span><span class="meta-value">${metaValue(game.publisher, publisherHub(game))}</span></div>
      </div>
    </div>
    <div class="game-detail-info-col">
      <h1 class="game-detail-title">${escapeHtml(game.title)}</h1>
      <p class="game-detail-year">${escapeHtml(String(game.year))} &middot; ${escapeHtml(game.genre)} &middot; ${escapeHtml(game.platform)}</p>
      ${bookmarkBtn(game.id, game.title, 'game')}
      <div class="game-detail-desc">
        <h2>About ${escapeHtml(game.title)}</h2>
        <p>${escapeHtml(game.description)}</p>
      </div>
      <div class="game-detail-desc">
        <h2>${escapeHtml(game.title)} in Depth</h2>
        ${paragraphs(game.longDescription)}
      </div>
      ${game.devStory ? `<div class="game-detail-desc">
        <h2>Making ${escapeHtml(game.title)}</h2>
        ${paragraphs(game.devStory)}
      </div>` : ''}
      ${game.trivia && game.trivia.length ? `<div class="game-detail-desc game-trivia">
        <h2>${escapeHtml(game.title)} Trivia</h2>
        <ul class="trivia-list">
          ${game.trivia.map(t => `<li>${escapeHtml(t)}</li>`).join('\n          ')}
        </ul>
      </div>` : ''}
      <div class="game-play-actions">
        ${game.playUrl ? `<a href="${escapeHtml(game.playUrl)}" target="_blank" rel="noopener" class="btn btn-play">&#9654; Play Online</a>` : ''}
        ${game.downloadUrl ? `<a href="${escapeHtml(game.downloadUrl)}" target="_blank" rel="noopener" class="btn btn-download">&#11015; Download</a>` : ''}
      </div>
      <button class="share-btn" id="shareBtn" onclick="shareGame()">Share this game</button>
    </div>
  </div>
  ${sourcesBlock(game, true)}
</div>

${relatedHtml}

${toggleScript()}
<script>
function shareGame() {
    const url = '${url}';
    const title = '${escapeHtml(game.title)} (${game.year}) – Bosnan Retro Archive';
    if (navigator.share) {
        navigator.share({ title, url });
    } else {
        navigator.clipboard.writeText(url).then(() => {
            const btn = document.getElementById('shareBtn');
            btn.textContent = '✓ Link copied!';
            setTimeout(() => { btn.innerHTML = 'Share this game'; }, 2000);
        });
    }
}
</script>
</body>
</html>`;
}

function platformsListPage() {
  const cards = PLATFORMS.map(p => {
    const count = gamesForPlatform(p).length;
    return `<a href="/platforms/${p.id}" class="platform-card">
      <div class="platform-card-name">${escapeHtml(p.shortName || p.name)}</div>
      <div class="platform-card-era">${escapeHtml(p.era)}</div>
      <div class="platform-card-count">${count} game${count !== 1 ? 's' : ''} in archive</div>
      <p class="platform-card-desc">${escapeHtml(p.description)}</p>
    </a>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Retro Gaming Platforms – Bosnan</title>
    <meta name="description" content="Explore retro gaming platforms from the 1970s to the 1990s: Arcade, NES, Atari 2600, Commodore 64, ZX Spectrum, SNES, Genesis, PlayStation, and more.">
    <script type="application/ld+json">${JSON.stringify({
      '@context': 'https://schema.org', '@type': 'ItemList', name: 'Retro Gaming Platforms',
      numberOfItems: PLATFORMS.length,
      itemListElement: PLATFORMS.map((p, i) => ({ '@type': 'ListItem', position: i + 1, name: p.name, url: `${SITE_URL}/platforms/${p.id}` })),
    })}</script>
    ${cssHead()}
</head>
<body>
${nav('platforms')}

<section class="platforms-hero">
    <h1>Platforms</h1>
    <p>The machines that defined a golden age of gaming</p>
</section>

<div class="platforms-grid">
    ${cards}
</div>

${toggleScript()}
</body>
</html>`;
}

// Everything else the archive says about a platform. A platform hub used to
// hold two paragraphs and a handful of game cards, while the hardware chips,
// peripherals, controllers, sales figures and essays about the same machine
// sat unlinked elsewhere. Entries are matched on the platform's own names as
// whole words, case-sensitively, and ranked so an entry *about* the machine
// (named in its title or platform field) outranks one that mentions it.
// Platforms whose name is an ordinary word ("Arcade") or too generic to match
// safely ("PC") are skipped rather than linked to everything.
const PLATFORM_COVERAGE_SKIP = new Set(['arcade', 'pc-dos']);
const PLATFORM_COVERAGE_LIMIT = 36;
const platformCoverageCache = new Map();
const escapeRegExp = str => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function platformCoverage(platform) {
  if (platformCoverageCache.has(platform.id)) return platformCoverageCache.get(platform.id);
  let groups = [];
  if (!PLATFORM_COVERAGE_SKIP.has(platform.id)) {
    const aliases = [...new Set([platform.name, platform.shortName, platform.keyword])]
      .filter(a => a && a.length >= 3);
    const re = new RegExp(`(?<![A-Za-z0-9])(?:${aliases.map(escapeRegExp).join('|')})(?![A-Za-z0-9])`);
    const routable = entryRouteSlugs();
    // The game grid above already shows this platform's own games.
    const shown = new Set(gamesForPlatform(platform).map(g => g.id));
    const hits = [];
    for (const [slug, data] of clDataBySlug) {
      if (slug === 'platforms' || !routable.has(slug) || !Array.isArray(data)) continue;
      for (const e of data) {
        const title = e && (e.title || e.name);
        if (!title || !e.id || (slug === 'games' && shown.has(e.id))) continue;
        const field = [e.platform, e.usedIn, e.foundIn].flat().filter(Boolean).join(' ');
        const score = (re.test(title) ? 4 : 0) + (re.test(field) ? 3 : 0)
          + (re.test(e.description || '') ? 2 : 0) + (re.test(e.longDescription || '') ? 1 : 0);
        if (score) hits.push({ slug, id: e.id, title, score });
      }
    }
    hits.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
    const bySection = new Map();
    for (const h of hits.slice(0, PLATFORM_COVERAGE_LIMIT)) {
      if (!bySection.has(h.slug)) bySection.set(h.slug, []);
      bySection.get(h.slug).push(h);
    }
    groups = [...bySection].map(([slug, items]) => ({ slug, label: clLabelBySlug.get(slug) || SEARCH_SECTION_LABELS.get(slug) || slug, items }));
  }
  platformCoverageCache.set(platform.id, groups);
  return groups;
}

function platformCoverageHtml(platform) {
  const groups = platformCoverage(platform);
  if (!groups.length) return '';
  const name = escapeHtml(platform.shortName || platform.name);
  const blocks = groups.map(g => `<div class="platform-coverage-group"><h3>${escapeHtml(g.label)}</h3><ul class="trivia-list">${
    g.items.map(i => `<li><a href="/${i.slug}/${i.id}">${escapeHtml(i.title)}</a></li>`).join('')}</ul></div>`).join('');
  return `
  <section class="platform-coverage">
    <h2 class="platform-games-heading">The ${name} Across the Archive</h2>
    <p class="platform-detail-desc">Hardware, people, controversies and stories connected to the ${name}, gathered from every section of the archive.</p>
    <div class="platform-coverage-grid">${blocks}</div>
  </section>`;
}

function platformDetailPage(platform) {
  const platformGames = gamesForPlatform(platform);
  const cardHtml = buildCardHtml(platformGames, EAGER_IMAGES);

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(platform.name)} Games – Bosnan Retro Archive</title>
    <meta name="description" content="${metaDesc(platform.description)}">
    ${cssHead()}
</head>
<body>
${nav('platforms')}

<div class="platform-detail-wrapper">
  <a href="/platforms" class="back-link">&#8592; All Platforms</a>
  <div class="platform-detail-header">
    <h1>${escapeHtml(platform.name)}</h1>
    <p class="platform-detail-era">${escapeHtml(platform.manufacturer)} &middot; ${escapeHtml(platform.era)}</p>
    <p class="platform-detail-desc">${escapeHtml(platform.description)}</p>
    <div class="platform-detail-desc">${paragraphs(platform.longDescription)}</div>
  </div>

  <h2 class="platform-games-heading">${platformGames.length} Games in Archive</h2>
  <div class="games-grid" id="gamesGrid">${cardHtml}</div>
${platformCoverageHtml(platform)}
${sourcesBlock(platform)}
</div>

${toggleScript()}
</body>
</html>`;
}

function genresListPage() {
  const cards = GENRES.map(g => {
    const count = (genreGamesIndex.get(g.id) || []).length;
    return `<a href="/genres/${g.id}" class="genre-card">
      <div class="genre-card-img-wrap">
        <img src="${g.image}" alt="${escapeHtml(g.imageAlt)}" loading="lazy" onerror="this.style.display='none'">
      </div>
      <div class="genre-card-body">
        <div class="genre-card-era">${escapeHtml(g.era)}</div>
        <div class="genre-card-name">${escapeHtml(g.name)}</div>
        <div class="genre-card-count">${count} game${count !== 1 ? 's' : ''} in archive</div>
        <p class="genre-card-desc">${escapeHtml(g.description)}</p>
      </div>
    </a>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Game Encyclopedia – Bosnan Retro Archive</title>
    <meta name="description" content="Explore the history of video game genres — shoot 'em ups, platformers, RPGs, adventure games, fighting games and more. A wiki-style encyclopedia of gaming history.">
    <meta property="og:title" content="Game Encyclopedia – Bosnan Retro Archive">
    <meta property="og:description" content="A wiki-style encyclopedia of video game genre history, from shoot 'em ups to RPGs.">
    <meta property="og:type" content="website">
    <script type="application/ld+json">${JSON.stringify({
      '@context': 'https://schema.org', '@type': 'ItemList', name: 'Video Game Genre Encyclopedia',
      numberOfItems: GENRES.length,
      itemListElement: GENRES.map((g, i) => ({ '@type': 'ListItem', position: i + 1, name: g.name, url: `${SITE_URL}/genres/${g.id}` })),
    })}</script>
    ${cssHead()}
</head>
<body>
${nav('genres')}

<section class="genres-hero">
    <h1>Game Encyclopedia</h1>
    <p>The history of every major video game genre — from the first arcade machines to the golden age of home computing</p>
</section>

<div class="genres-grid">
    ${cards}
</div>

${toggleScript()}
</body>
</html>`;
}

function genreDetailPage(genre) {
  const genreGames = genreGamesIndex.get(genre.id) || [];
  const count = genreGames.length;
  const cardHtml = buildCardHtml(genreGames, EAGER_IMAGES);

  const statsRows = genre.stats.map(s =>
    `<tr><td class="gi-label">${escapeHtml(s.label)}</td><td class="gi-value">${escapeHtml(s.value)}</td></tr>`
  ).join('');

  const tocItems = genre.sections.map((s, i) =>
    `<li><a href="#section-${i}">${escapeHtml(s.title)}</a></li>`
  ).join('');

  const articleSections = genre.sections.map((s, i) => `
<div class="genre-section" id="section-${i}">
  <h2>${escapeHtml(s.title)}</h2>
  ${s.html}
</div>`).join('');

  const desc = metaDesc(genre.description);

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(genre.name)} – Game Encyclopedia – Bosnan</title>
    <meta name="description" content="${desc}">
    <meta property="og:title" content="${escapeHtml(genre.name)} – Game Encyclopedia – Bosnan">
    <meta property="og:description" content="${desc}">
    <meta property="og:image" content="${genre.image}">
    <meta property="og:type" content="article">
    ${cssHead()}
</head>
<body>
${nav('genres')}

<div class="genre-wiki-wrapper">
  <a href="/genres" class="back-link">&#8592; Game Encyclopedia</a>

  <div class="genre-article">
    <h1 class="genre-article-title">${escapeHtml(genre.name)}</h1>
    <p class="genre-article-subtitle">${escapeHtml(genre.subtitle)}</p>

    <div class="genre-infobox">
      <div class="genre-infobox-title">${escapeHtml(genre.shortName || genre.name)}</div>
      <div class="genre-infobox-image">
        <img src="${genre.image}" alt="${escapeHtml(genre.imageAlt)}" loading="lazy" onerror="this.parentElement.style.display='none'">
      </div>
      <div class="genre-infobox-caption">${escapeHtml(genre.imageCaption)}<br><span class="genre-infobox-license">License: ${escapeHtml(genre.imageLicense)}</span></div>
      <table class="genre-infobox-table">
        ${statsRows}
      </table>
    </div>

    <div class="genre-toc">
      <div class="genre-toc-title">Contents</div>
      <ol>
        ${tocItems}
        <li><a href="#games-section">${count} Games in Archive</a></li>
      </ol>
    </div>

    <div class="genre-article-intro">
      <p>${escapeHtml(genre.description)}</p>
    </div>

    ${articleSections}

    <div class="genre-games-section" id="games-section">
      <h2 class="genre-games-heading">${count} Game${count !== 1 ? 's' : ''} in Archive</h2>
      <div class="games-grid" id="gamesGrid">${cardHtml}</div>
    </div>
  </div>
</div>

${toggleScript()}
</body>
</html>`;
}

const CATEGORY_LABELS = {
  history: 'History',
  profile: 'Profile',
  technology: 'Technology',
  culture: 'Culture',
  design: 'Design',
  business: 'Business',
  hardware: 'Hardware',
};

function essaysListPage() {
  // Group case-insensitively: the essay files disagree about whether the
  // category is "history" or "History", and grouping on the raw value split
  // one category into two keys, only one of which matched the order list.
  const byCategory = {};
  for (const e of ESSAYS) {
    const key = String(e.category || 'other').trim().toLowerCase();
    if (!byCategory[key]) byCategory[key] = [];
    byCategory[key].push(e);
  }

  // Preferred order first, then anything else alphabetically. Listing the
  // known categories must never be a filter — an essay in an unanticipated
  // category previously vanished from this page while staying in the sitemap,
  // leaving it with no inbound link anywhere on the site.
  const preferred = ['history', 'profile', 'technology', 'culture', 'design'];
  const categoryOrder = [
    ...preferred.filter(c => byCategory[c]),
    ...Object.keys(byCategory).filter(c => !preferred.includes(c)).sort(),
  ];
  const sections = categoryOrder.map(cat => {
    const label = CATEGORY_LABELS[cat] || (cat.charAt(0).toUpperCase() + cat.slice(1));
    const cards = byCategory[cat].map(e => `
    <a href="/essays/${e.id}" class="essay-card">
      <h2 class="essay-card-title">${escapeHtml(e.title)}</h2>
      <p class="essay-card-subtitle">${escapeHtml(e.subtitle)}</p>
      <div class="essay-card-meta">
        <span class="essay-card-read">${escapeHtml(e.readTime)}</span>
      </div>
    </a>`).join('');
    return `<div class="essays-category-section">
  <h2 class="essays-category-heading">${escapeHtml(label)}</h2>
  <div class="essays-grid">${cards}
  </div>
</div>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Essays – Bosnan Retro Archive</title>
    <meta name="description" content="Long-form essays on the history, technology, and culture of retro gaming — the golden age of arcades, the designers who shaped the medium, and the worlds they built.">
    <meta property="og:title" content="Essays – Bosnan Retro Archive">
    <meta property="og:type" content="website">
    <script type="application/ld+json">${JSON.stringify({
      '@context': 'https://schema.org', '@type': 'ItemList', name: 'Retro Gaming Essays',
      numberOfItems: ESSAYS.length,
      itemListElement: ESSAYS.map((e, i) => ({ '@type': 'ListItem', position: i + 1, name: e.title, url: `${SITE_URL}/essays/${e.id}` })),
    })}</script>
    ${cssHead()}
</head>
<body>
${nav('essays')}

<section class="essays-hero">
    <h1>Essays</h1>
    <p>Long-form writing on the history, technology, and culture of the golden age of gaming</p>
</section>

<div class="essays-wrapper">
${sections}
</div>

${toggleScript()}
</body>
</html>`;
}

function essayDetailPage(essay) {
  const categoryLabel = CATEGORY_LABELS[String(essay.category || '').trim().toLowerCase()] || essay.category;
  const articleSections = essay.sections.map((s, i) => `
<div class="essay-section" id="section-${i}">
  <h2>${escapeHtml(s.title)}</h2>
  ${s.html}
</div>`).join('');

  const tocItems = essay.sections.map((s, i) =>
    `<li><a href="#section-${i}">${escapeHtml(s.title)}</a></li>`
  ).join('');

  const articleSchema = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: essay.title,
    description: essay.summary,
    articleSection: categoryLabel,
    url: `${SITE_URL}/essays/${essay.id}`,
    publisher: ORG_SCHEMA,
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(essay.title)} – Essays – Bosnan</title>
    <meta name="description" content="${escapeHtml(essay.summary)}">
    <meta property="og:title" content="${escapeHtml(essay.title)} – Bosnan">
    <meta property="og:description" content="${escapeHtml(essay.summary)}">
    <meta property="og:type" content="article">
    <script type="application/ld+json">${articleSchema}</script>
    ${cssHead()}
</head>
<body>
${nav('essays')}

<div class="essay-wrapper">
  <a href="/essays" class="back-link">&#8592; All Essays</a>

  <div class="essay-header">
    <div class="essay-header-meta">
      <span class="essay-header-category">${escapeHtml(categoryLabel)}</span>
      <span class="essay-header-read">${escapeHtml(essay.readTime)}</span>
    </div>
    <h1 class="essay-title">${escapeHtml(essay.title)}</h1>
    <p class="essay-subtitle">${escapeHtml(essay.subtitle)}</p>
    ${bookmarkBtn(essay.id, essay.title, 'essay')}
  </div>

  <div class="essay-layout">
    <aside class="essay-toc">
      <div class="essay-toc-label">Contents</div>
      <ol>
        ${tocItems}
      </ol>
    </aside>

    <article class="essay-body">
      ${articleSections}
    </article>
  </div>
</div>

${toggleScript()}
</body>
</html>`;
}

function developersListPage() {
  const cards = DEVELOPERS.map(d => {
    const count = (developerGamesIndex.get(d.id) || []).length;
    return `<a href="/developers/${d.id}" class="platform-card">
      <div class="platform-card-name">${escapeHtml(d.name)}</div>
      <div class="platform-card-era">${escapeHtml(d.country)} &middot; Est. ${escapeHtml(String(d.founded))}</div>
      <div class="platform-card-count">${count} game${count !== 1 ? 's' : ''} in archive</div>
      <p class="platform-card-desc">${escapeHtml(d.description)}</p>
    </a>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Game Developers &amp; Studios – Bosnan</title>
    <meta name="description" content="Profiles of the studios and developers who shaped retro gaming: Nintendo, Sega, Capcom, Konami, id Software, and more.">
    ${cssHead()}
</head>
<body>
${nav('developers')}

<section class="platforms-hero">
    <h1>Developers</h1>
    <p>The studios and visionaries who built the golden age of gaming</p>
</section>

<div class="platforms-grid">
    ${cards}
</div>

${toggleScript()}
</body>
</html>`;
}

function developerDetailPage(dev) {
  const devGames = developerGamesIndex.get(dev.id) || [];
  const cardHtml = buildCardHtml(devGames, EAGER_IMAGES);

  const notableList = gameLinkList(dev.notableGames);
  const figureList = (dev.keyFigures || []).map(f => `<span class="dev-figure">${escapeHtml(f)}</span>`).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(dev.name)} – Developers – Bosnan</title>
    <meta name="description" content="${metaDesc(dev.description)}">
    ${cssHead()}
</head>
<body>
${nav('developers')}

<div class="platform-detail-wrapper">
  <a href="/developers" class="back-link">&#8592; All Developers</a>
  <div class="platform-detail-header">
    <h1>${escapeHtml(dev.name)}</h1>
    <p class="platform-detail-era">${escapeHtml(dev.country)} &middot; Founded ${escapeHtml(String(dev.founded))} &middot; ${escapeHtml(dev.role)}</p>
    <p class="platform-detail-desc">${escapeHtml(dev.description)}</p>
    <div class="platform-detail-desc">${paragraphs(dev.longDescription)}</div>
    ${figureList ? `<div class="dev-figures-row"><strong>Key Figures:</strong> ${figureList}</div>` : ''}
    ${notableList ? `<div class="dev-notable"><strong>Notable Games:</strong><ul class="trivia-list">${notableList}</ul></div>` : ''}
  </div>

  <h2 class="platform-games-heading">${devGames.length} Game${devGames.length !== 1 ? 's' : ''} in Archive</h2>
  <div class="games-grid" id="gamesGrid">${cardHtml}</div>
${sourcesBlock(dev)}</div>

${toggleScript()}
</body>
</html>`;
}

function composersListPage() {
  const cards = COMPOSERS.map(c => {
    const count = (composerGamesIndex.get(c.id) || []).length;
    return `<a href="/composers/${c.id}" class="platform-card">
      <div class="platform-card-name">${escapeHtml(c.name)}</div>
      <div class="platform-card-era">${escapeHtml(c.country)} &middot; ${escapeHtml(c.era)}</div>
      <div class="platform-card-count">${count} game${count !== 1 ? 's' : ''} in archive</div>
      <p class="platform-card-desc">${escapeHtml(c.description)}</p>
    </a>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Game Composers – Bosnan</title>
    <meta name="description" content="Profiles of the composers who scored retro gaming's greatest soundtracks: Nobuo Uematsu, Yuzo Koshiro, Koji Kondo, and more.">
    ${cssHead()}
</head>
<body>
${nav('composers')}
<section class="platforms-hero">
    <h1>Composers</h1>
    <p>The musicians who defined the sound of retro gaming</p>
</section>
<div class="platforms-grid">
    ${cards}
</div>
${toggleScript()}
</body>
</html>`;
}

function composerDetailPage(c) {
  const cGames = composerGamesIndex.get(c.id) || [];
  const cardHtml = buildCardHtml(cGames, EAGER_IMAGES);
  const factList = (c.keyFacts || []).map(f => `<li>${escapeHtml(f)}</li>`).join('');
  const trackList = gameLinkList(c.notableSoundtracks);

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(c.name)} – Composers – Bosnan</title>
    <meta name="description" content="${metaDesc(c.description)}">
    ${cssHead()}
</head>
<body>
${nav('composers')}
<div class="platform-detail-wrapper">
  <a href="/composers" class="back-link">&#8592; All Composers</a>
  <div class="platform-detail-header">
    <h1>${escapeHtml(c.name)}</h1>
    <p class="platform-detail-era">${escapeHtml(c.country)}${c.born ? ` &middot; Born ${escapeHtml(String(c.born))}` : ''} &middot; ${escapeHtml(c.role)}</p>
    <p class="platform-detail-desc">${escapeHtml(c.description)}</p>
    <div class="platform-detail-desc">${paragraphs(c.longDescription)}</div>
    ${trackList ? `<div class="dev-notable"><strong>Notable Soundtracks:</strong><ul class="trivia-list">${trackList}</ul></div>` : ''}
    ${factList ? `<div class="dev-notable"><strong>Key Facts:</strong><ul class="trivia-list">${factList}</ul></div>` : ''}
  </div>
  ${cGames.length > 0 ? `<h2 class="platform-games-heading">${cGames.length} Game${cGames.length !== 1 ? 's' : ''} in Archive</h2>
  <div class="games-grid" id="gamesGrid">${cardHtml}</div>` : ''}
${sourcesBlock(c)}</div>
${toggleScript()}
</body>
</html>`;
}

function franchisesListPage() {
  const cards = FRANCHISES.map(f => {
    const count = (franchiseGamesIndex.get(f.id) || []).length;
    return `<a href="/franchises/${f.id}" class="platform-card">
      <div class="platform-card-name">${escapeHtml(f.name)}</div>
      <div class="platform-card-era">${escapeHtml(f.developer)} &middot; Since ${escapeHtml(String(f.since))}</div>
      <div class="platform-card-count">${count} game${count !== 1 ? 's' : ''} in archive</div>
      <p class="platform-card-desc">${escapeHtml(f.description)}</p>
    </a>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Game Franchises – Bosnan</title>
    <meta name="description" content="Explore gaming's greatest franchise histories: Mario, Zelda, Final Fantasy, Sonic, Mega Man, and more.">
    ${cssHead()}
</head>
<body>
${nav('franchises')}
<section class="platforms-hero">
    <h1>Franchises</h1>
    <p>Gaming's greatest series — from a single coin-op to generational legacies</p>
</section>
<div class="platforms-grid">
    ${cards}
</div>
${toggleScript()}
</body>
</html>`;
}

function franchiseDetailPage(f) {
  const fGames = franchiseGamesIndex.get(f.id) || [];
  const cardHtml = buildCardHtml(fGames, EAGER_IMAGES);

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(f.name)} – Franchises – Bosnan</title>
    <meta name="description" content="${metaDesc(f.description)}">
    ${cssHead()}
</head>
<body>
${nav('franchises')}
<div class="platform-detail-wrapper">
  <a href="/franchises" class="back-link">&#8592; All Franchises</a>
  <div class="platform-detail-header">
    <h1>${escapeHtml(f.name)}</h1>
    <p class="platform-detail-era">${escapeHtml(f.developer)} &middot; Since ${escapeHtml(String(f.since))}</p>
    <p class="platform-detail-desc">${escapeHtml(f.description)}</p>
    <div class="platform-detail-desc">${paragraphs(f.longDescription)}</div>
  </div>
  <h2 class="platform-games-heading">${fGames.length} Game${fGames.length !== 1 ? 's' : ''} in Archive</h2>
  <div class="games-grid" id="gamesGrid">${cardHtml}</div>
  ${sourcesBlock(f)}
</div>
${toggleScript()}
</body>
</html>`;
}

function hardwareListPage() {
  const cards = HARDWARE.map(hw => {
    return `<a href="/hardware/${hw.id}" class="platform-card">
      <div class="platform-card-name">${escapeHtml(hw.name)}</div>
      <div class="platform-card-era">${escapeHtml(hw.manufacturer)} &middot; ${escapeHtml(String(hw.year))}</div>
      <div class="platform-card-count">Used in: ${escapeHtml(hw.usedIn)}</div>
      <p class="platform-card-desc">${escapeHtml(hw.description)}</p>
    </a>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Hardware &amp; Chips – Bosnan</title>
    <meta name="description" content="The processors and sound chips that powered retro gaming: MOS 6502, Z80, YM2612, SID chip, Super FX, and more.">
    ${cssHead()}
</head>
<body>
${nav('hardware')}
<section class="platforms-hero">
    <h1>Hardware &amp; Chips</h1>
    <p>The silicon that made it all possible</p>
</section>
<div class="platforms-grid">
    ${cards}
</div>
${toggleScript()}
</body>
</html>`;
}

// "TIA" or "SA-1" alone tells a searcher nothing; short names take the full one.
function hardwareTitleName(hw) {
  if (hw.name.length >= 6 || !hw.fullName) return hw.name;
  return hw.fullName.includes(hw.name) ? hw.fullName : `${hw.name} (${hw.fullName})`;
}

function hardwareDetailPage(hw) {
  const specRows = (hw.specs || []).map(s =>
    `<tr><th>${escapeHtml(s.label)}</th><td>${escapeHtml(s.value)}</td></tr>`
  ).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(hardwareTitleName(hw))} – Hardware – Bosnan</title>
    <meta name="description" content="${metaDesc(hw.description)}">
    ${cssHead()}
</head>
<body>
${nav('hardware')}
<div class="platform-detail-wrapper">
  <a href="/hardware" class="back-link">&#8592; All Hardware</a>
  <div class="platform-detail-header">
    <h1>${escapeHtml(hw.name)}</h1>
    <p class="platform-detail-era">${escapeHtml(hw.manufacturer)} &middot; ${escapeHtml(String(hw.year))} &middot; ${escapeHtml(hw.fullName)}</p>
    <p class="platform-detail-desc">${escapeHtml(hw.description)}</p>
    <div class="platform-detail-desc">${paragraphs(hw.longDescription)}</div>
    <div class="dev-notable"><strong>Used In:</strong> ${escapeHtml(hw.usedIn)}</div>
    ${specRows ? `<table class="trivia-table" style="margin-top:16px;width:100%;max-width:480px;border-collapse:collapse">
      <tbody>${specRows}</tbody>
    </table>` : ''}
  </div>
${sourcesBlock(hw)}</div>
${toggleScript()}
</body>
</html>`;
}

function designersListPage() {
  const cards = DESIGNERS.map(d => {
    const count = (designerGamesIndex.get(d.id) || []).length;
    return `<a href="/designers/${d.id}" class="platform-card">
      <div class="platform-card-name">${escapeHtml(d.name)}</div>
      <div class="platform-card-era">${escapeHtml(d.country)} &middot; ${escapeHtml(d.role)}</div>
      <div class="platform-card-count">${count} game${count !== 1 ? 's' : ''} in archive</div>
      <p class="platform-card-desc">${escapeHtml(d.description)}</p>
    </a>`;
  }).join('');
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Game Designers – Bosnan</title>
    <meta name="description" content="Profiles of the individuals who shaped retro gaming: Miyamoto, Yokoi, Yu Suzuki, Carmack, Molyneux, Tajiri and more.">
    ${cssHead()}
</head>
<body>
${nav('designers')}
<section class="platforms-hero">
    <h1>Designers</h1>
    <p>The individuals whose decisions shaped the golden age of gaming</p>
</section>
<div class="platforms-grid">${cards}</div>
${toggleScript()}
</body>
</html>`;
}

function designerDetailPage(d) {
  const dGames = designerGamesIndex.get(d.id) || [];
  const cardHtml = buildCardHtml(dGames, EAGER_IMAGES);
  const gamesList = gameLinkList(d.notableGames);
  const factList = (d.keyFacts || []).map(f => `<li>${escapeHtml(f)}</li>`).join('');
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(d.name)} – Designers – Bosnan</title>
    <meta name="description" content="${metaDesc(d.description)}">
    ${cssHead()}
</head>
<body>
${nav('designers')}
<div class="platform-detail-wrapper">
  <a href="/designers" class="back-link">&#8592; All Designers</a>
  <div class="platform-detail-header">
    <h1>${escapeHtml(d.name)}</h1>
    <p class="platform-detail-era">${escapeHtml(d.country)} &middot; Born ${escapeHtml(String(d.born))} &middot; ${escapeHtml(d.employer)} &middot; ${escapeHtml(d.role)}</p>
    <p class="platform-detail-desc">${escapeHtml(d.description)}</p>
    <div class="platform-detail-desc">${paragraphs(d.longDescription)}</div>
    ${gamesList ? `<div class="dev-notable"><strong>Notable Games:</strong><ul class="trivia-list">${gamesList}</ul></div>` : ''}
    ${factList ? `<div class="dev-notable"><strong>Key Facts:</strong><ul class="trivia-list">${factList}</ul></div>` : ''}
  </div>
  ${dGames.length > 0 ? `<h2 class="platform-games-heading">${dGames.length} Game${dGames.length !== 1 ? 's' : ''} in Archive</h2>
  <div class="games-grid" id="gamesGrid">${cardHtml}</div>` : ''}
${sourcesBlock(d)}</div>
${toggleScript()}
</body>
</html>`;
}

function yearsListPage() {
  const cards = YEARS.map(y => {
    const count = (yearsIndex.get(y) || []).length;
    const dec = y < 1970 ? '1960s' : y < 1980 ? '1970s' : y < 1990 ? '1980s' : '1990s';
    return `<a href="/years/${y}" class="platform-card">
      <div class="platform-card-name">${y}</div>
      <div class="platform-card-era">${escapeHtml(dec)}</div>
      <div class="platform-card-count">${count} game${count !== 1 ? 's' : ''}</div>
    </a>`;
  }).join('');
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Browse by Year – Bosnan</title>
    <meta name="description" content="Browse ${games.length}+ retro games by release year, from the 1960s through the 1990s.">
    ${cssHead()}
</head>
<body>
${nav('years')}
<section class="platforms-hero">
    <h1>By Year</h1>
    <p>Browse the archive by release year</p>
</section>
<div class="platforms-grid">${cards}</div>
${toggleScript()}
</body>
</html>`;
}

// A year page with one or two game cards and no written review is a thinner
// copy of those games' own pages. Keep it for visitors browsing by year, but
// keep it out of the index and the sitemap.
function isThinYear(year) {
  return (yearsIndex.get(year) || []).length < 3 && !YEAR_REVIEWS_MAP.has(String(year));
}

function yearDetailPage(year, review) {
  const yGames = (yearsIndex.get(year) || []).slice().sort((a, b) => a.title.localeCompare(b.title));
  const releases = `${yGames.length} Classic Release${yGames.length === 1 ? '' : 's'}`;
  const cardHtml = buildCardHtml(yGames, EAGER_IMAGES);
  const reviewHtml = review ? `
  <div style="border-bottom:1px solid var(--border);padding-bottom:2rem;margin-bottom:2rem">
    <h2 style="color:var(--accent);font-size:1.4em;margin-bottom:0.5rem">${escapeHtml(review.headline)}</h2>
    <p style="color:var(--text-secondary);line-height:1.7;margin-bottom:1.2rem">${escapeHtml(review.summary)}</p>
    ${(review.topEvents || []).length ? `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:0.8rem;margin-bottom:1.5rem">${review.topEvents.map(e => `<div style="background:var(--surface-1);border-radius:6px;padding:0.8rem 1rem"><div style="font-weight:700;margin-bottom:0.3rem;font-size:0.9em">${escapeHtml(e.title)}</div><div style="color:var(--text-secondary);font-size:0.85em;line-height:1.5">${escapeHtml(e.desc)}</div></div>`).join('')}</div>` : ''}
    ${(review.sections || []).map(s => `<div style="margin-bottom:1.5rem"><h3 style="margin-bottom:0.6rem">${escapeHtml(s.title)}</h3><div style="color:var(--text-secondary);line-height:1.7">${s.html}</div></div>`).join('')}
    ${review.quote ? `<blockquote style="border-left:3px solid var(--accent);padding-left:1rem;margin:1rem 0;color:var(--text-muted);font-style:italic">${escapeHtml(review.quote)}</blockquote>` : ''}
  </div>` : '';
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${year} in Video Games — ${releases} – Bosnan</title>${isThinYear(year) ? '\n    <meta name="robots" content="noindex, follow">' : ''}
    <meta name="description" content="${review ? metaDesc(review.summary) : metaDesc(listingDesc(yGames, `released in ${year}`))}">
    <style>h1,h2,h3{font-family:inherit}</style>
    ${cssHead()}
</head>
<body>
${nav('years')}
<div class="platform-detail-wrapper">
  <a href="/years" class="back-link">&#8592; All Years</a>
  <div class="platform-detail-header">
    <h1>${year}</h1>
    <p class="platform-detail-era">${yGames.length} game${yGames.length !== 1 ? 's' : ''} in archive from ${year}</p>
  </div>
  ${reviewHtml}
  <h2 style="margin-bottom:1rem">Games from ${year}</h2>
  <div class="games-grid" id="gamesGrid">${cardHtml}</div>
  ${review ? sourcesBlock(review, true) : ''}
</div>
${toggleScript()}
</body>
</html>`;
}

function regionalListPage() {
  const cards = REGIONAL.map(r => `<a href="/regional/${r.id}" class="platform-card">
    <div class="platform-card-name">${escapeHtml(r.game)}</div>
    <div class="platform-card-era">${escapeHtml(r.region1)} vs ${escapeHtml(r.region2)}</div>
    <div class="platform-card-count">${escapeHtml(r.readTime)}</div>
    <p class="platform-card-desc">${escapeHtml(r.summary)}</p>
  </a>`).join('');
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Regional Differences – Bosnan</title>
    <meta name="description" content="How retro games changed between regions: censorship, renamed characters, replaced soundtracks, and different versions of classic games.">
    ${cssHead()}
</head>
<body>
${nav('regional')}
<section class="platforms-hero">
    <h1>Regional Differences</h1>
    <p>How the same game became different games across countries</p>
</section>
<div class="platforms-grid">${cards}</div>
${toggleScript()}
</body>
</html>`;
}

function regionalDetailPage(r) {
  const sectionsHtml = (r.sections || []).map(s =>
    `<div class="essay-section"><h2>${escapeHtml(s.title)}</h2><div class="essay-body">${s.html}</div></div>`
  ).join('');
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(r.title)} – Regional Differences – Bosnan</title>
    <meta name="description" content="${escapeHtml(r.summary)}">
    ${cssHead()}
</head>
<body>
${nav('regional')}
<div class="essay-wrapper">
  <a href="/regional" class="back-link">&#8592; All Regional Differences</a>
  <div class="essay-header">
    <div class="essay-meta">${escapeHtml(r.region1)} vs ${escapeHtml(r.region2)} &middot; ${escapeHtml(r.game)} &middot; ${escapeHtml(r.readTime)}</div>
    <h1 class="essay-title">${escapeHtml(r.title)}</h1>
    <p class="essay-subtitle">${escapeHtml(r.subtitle)}</p>
    ${r.summary ? `<p class="platform-detail-desc">${escapeHtml(r.summary)}</p>` : ''}
  </div>
  ${sectionsHtml}
  ${sourcesBlock(r)}${relatedBlock(r)}
</div>
${toggleScript()}
</body>
</html>`;
}

function publishersListPage() {
  const cards = PUBLISHERS.map(p => {
    const count = (publisherGamesIndex.get(p.id) || []).length;
    return `<a href="/publishers/${p.id}" class="platform-card">
      <div class="platform-card-name">${escapeHtml(p.name)}</div>
      <div class="platform-card-era">${escapeHtml(p.country)} &middot; ${escapeHtml(p.era)}</div>
      <div class="platform-card-count">${count} game${count !== 1 ? 's' : ''} in archive</div>
      <p class="platform-card-desc">${escapeHtml(p.description)}</p>
    </a>`;
  }).join('');
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Publishers – Bosnan</title>
    <meta name="description" content="Profiles of the publishers who shaped retro gaming: Atari, EA, Activision, Taito, Hudson, Psygnosis and more.">
    ${cssHead()}
</head>
<body>
${nav('publishers')}
<section class="platforms-hero">
    <h1>Publishers</h1>
    <p>The companies that brought retro games to players</p>
</section>
<div class="platforms-grid">${cards}</div>
${toggleScript()}
</body>
</html>`;
}

function publisherDetailPage(pub) {
  const pGames = publisherGamesIndex.get(pub.id) || [];
  const cardHtml = buildCardHtml(pGames, EAGER_IMAGES);
  const titleList = gameLinkList(pub.notableTitles);
  const factList = (pub.keyFacts || []).map(f => `<li>${escapeHtml(f)}</li>`).join('');
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(pub.name)} – Publishers – Bosnan</title>
    <meta name="description" content="${metaDesc(pub.description)}">
    ${cssHead()}
</head>
<body>
${nav('publishers')}
<div class="platform-detail-wrapper">
  <a href="/publishers" class="back-link">&#8592; All Publishers</a>
  <div class="platform-detail-header">
    <h1>${escapeHtml(pub.name)}</h1>
    <p class="platform-detail-era">${escapeHtml(pub.country)} &middot; Founded ${pub.founded}${pub.dissolved ? ' &middot; Closed ' + pub.dissolved : ''} &middot; ${escapeHtml(pub.era)}</p>
    <p class="platform-detail-desc">${escapeHtml(pub.description)}</p>
    <div class="platform-detail-desc">${paragraphs(pub.longDescription)}</div>
    ${titleList ? `<div class="dev-notable"><strong>Notable Titles:</strong><ul class="trivia-list">${titleList}</ul></div>` : ''}
    ${factList ? `<div class="dev-notable"><strong>Key Facts:</strong><ul class="trivia-list">${factList}</ul></div>` : ''}
  </div>
  ${pGames.length > 0 ? `<h2 class="platform-games-heading">${pGames.length} Game${pGames.length !== 1 ? 's' : ''} in Archive</h2>
  <div class="games-grid" id="gamesGrid">${cardHtml}</div>` : ''}
${sourcesBlock(pub)}</div>
${toggleScript()}
</body>
</html>`;
}

function arcadeBoardsListPage() {
  const cards = ARCADE_BOARDS.map(b => `<a href="/arcade-boards/${b.id}" class="platform-card">
    <div class="platform-card-name">${escapeHtml(b.name)}</div>
    <div class="platform-card-era">${escapeHtml(b.manufacturer)} &middot; ${b.year}</div>
    <div class="platform-card-count">${escapeHtml(b.cpu || '')}</div>
    <p class="platform-card-desc">${escapeHtml(b.description)}</p>
  </a>`).join('');
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Arcade Boards – Bosnan</title>
    <meta name="description" content="The hardware boards that powered arcade gaming's golden age: CPS-1, CPS-2, System 16, Neo Geo MVS, and more.">
    ${cssHead()}
</head>
<body>
${nav('arcade-boards')}
<section class="platforms-hero">
    <h1>Arcade Boards</h1>
    <p>The silicon behind the golden age of coin-operated gaming</p>
</section>
<div class="platforms-grid">${cards}</div>
${toggleScript()}
</body>
</html>`;
}

function arcadeBoardDetailPage(board) {
  const gamesList = gameLinkList(board.notableGames);
  const factList = (board.keyFacts || []).map(f => `<li>${escapeHtml(f)}</li>`).join('');
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(board.name)} – Arcade Boards – Bosnan</title>
    <meta name="description" content="${metaDesc(board.description)}">
    ${cssHead()}
</head>
<body>
${nav('arcade-boards')}
<div class="platform-detail-wrapper">
  <a href="/arcade-boards" class="back-link">&#8592; All Arcade Boards</a>
  <div class="platform-detail-header">
    <h1>${escapeHtml(board.name)}</h1>
    <p class="platform-detail-era">${escapeHtml(board.manufacturer)} &middot; ${board.year} &middot; ${escapeHtml(board.era || '')}</p>
    ${board.cpu ? `<p class="platform-detail-era" style="font-size:0.9em;opacity:0.8">CPU: ${escapeHtml(board.cpu)}</p>` : ''}
    <p class="platform-detail-desc">${escapeHtml(board.description)}</p>
    <div class="platform-detail-desc">${paragraphs(board.longDescription)}</div>
    ${gamesList ? `<div class="dev-notable"><strong>Notable Games:</strong><ul class="trivia-list">${gamesList}</ul></div>` : ''}
    ${factList ? `<div class="dev-notable"><strong>Key Facts:</strong><ul class="trivia-list">${factList}</ul></div>` : ''}
  </div>
  ${sourcesBlock(board)}${relatedBlock(board)}
</div>
${toggleScript()}
</body>
</html>`;
}

function peripheralsListPage() {
  const cards = PERIPHERALS.map(p => `<a href="/peripherals/${p.id}" class="platform-card">
    <div class="platform-card-name">${escapeHtml(p.name)}</div>
    <div class="platform-card-era">${escapeHtml(p.manufacturer)} &middot; ${p.year} &middot; ${escapeHtml(p.platform)}</div>
    <div class="platform-card-count">${escapeHtml(p.verdict || '')}</div>
    <p class="platform-card-desc">${escapeHtml(p.description)}</p>
  </a>`).join('');
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Peripherals – Bosnan</title>
    <meta name="description" content="The accessories that shaped retro gaming: Power Glove, R.O.B., Game Genie, Sega 32X, and the gadgets that succeeded or spectacularly failed.">
    ${cssHead()}
</head>
<body>
${nav('peripherals')}
<section class="platforms-hero">
    <h1>Peripherals</h1>
    <p>The accessories, add-ons, and gadgets of the retro era</p>
</section>
<div class="platforms-grid">${cards}</div>
${toggleScript()}
</body>
</html>`;
}

function peripheralDetailPage(periph) {
  const factList = (periph.keyFacts || []).map(f => `<li>${escapeHtml(f)}</li>`).join('');
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(periph.name)} – Peripherals – Bosnan</title>
    <meta name="description" content="${metaDesc(periph.description)}">
    ${cssHead()}
</head>
<body>
${nav('peripherals')}
<div class="platform-detail-wrapper">
  <a href="/peripherals" class="back-link">&#8592; All Peripherals</a>
  <div class="platform-detail-header">
    <h1>${escapeHtml(periph.name)}</h1>
    <p class="platform-detail-era">${escapeHtml(periph.manufacturer)} &middot; ${periph.year} &middot; ${escapeHtml(periph.platform)}</p>
    <p class="platform-detail-desc">${escapeHtml(periph.description)}</p>
    <div class="platform-detail-desc">${paragraphs(periph.longDescription)}</div>
    ${factList ? `<div class="dev-notable"><strong>Key Facts:</strong><ul class="trivia-list">${factList}</ul></div>` : ''}
    ${periph.verdict ? `<div class="dev-notable" style="margin-top:1rem"><strong>Verdict:</strong> ${escapeHtml(periph.verdict)}</div>` : ''}
  </div>
${sourcesBlock(periph)}</div>
${toggleScript()}
</body>
</html>`;
}

function lostGamesListPage() {
  const cards = LOST_GAMES.map(g => `<a href="/lost-games/${g.id}" class="platform-card">
    <div class="platform-card-name">${escapeHtml(g.title)}</div>
    <div class="platform-card-era">${escapeHtml(g.developer)} &middot; ${escapeHtml(g.platform)} &middot; ${g.year}</div>
    <div class="platform-card-count">${escapeHtml(g.status)}</div>
    <p class="platform-card-desc">${escapeHtml(g.description)}</p>
  </a>`).join('');
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Lost &amp; Cancelled Games – Bosnan</title>
    <meta name="description" content="Games that never shipped: StarFox 2, Thrill Kill, Sonic X-treme, EarthBound 64, and the cancelled classics of retro gaming.">
    ${cssHead()}
</head>
<body>
${nav('lost-games')}
<section class="platforms-hero">
    <h1>Lost &amp; Cancelled Games</h1>
    <p>Finished, shelved, and never released — the games that almost were</p>
</section>
<div class="platforms-grid">${cards}</div>
${toggleScript()}
</body>
</html>`;
}

function lostGameDetailPage(g) {
  const factList = (g.keyFacts || []).map(f => `<li>${escapeHtml(f)}</li>`).join('');
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(g.title)} – Lost Games – Bosnan</title>
    <meta name="description" content="${metaDesc(g.description)}">
    ${cssHead()}
</head>
<body>
${nav('lost-games')}
<div class="platform-detail-wrapper">
  <a href="/lost-games" class="back-link">&#8592; All Lost Games</a>
  <div class="platform-detail-header">
    <h1>${escapeHtml(g.title)}</h1>
    <p class="platform-detail-era">${escapeHtml(g.developer)} &middot; ${escapeHtml(g.platform)} &middot; ${g.year} &middot; <em>${escapeHtml(g.status)}</em></p>
    <p class="platform-detail-desc">${escapeHtml(g.description)}</p>
    <div class="platform-detail-desc">${paragraphs(g.longDescription)}</div>
    ${g.discoveredBy ? `<div class="dev-notable"><strong>Prototype discovered by:</strong> ${escapeHtml(g.discoveredBy)}</div>` : ''}
    ${factList ? `<div class="dev-notable"><strong>Key Facts:</strong><ul class="trivia-list">${factList}</ul></div>` : ''}
  </div>
${sourcesBlock(g)}</div>
${toggleScript()}
</body>
</html>`;
}

// Year reviews that fall inside a decade ("1980s" → 1980..1989), oldest first.
function decadeReviews(decade) {
  const start = parseInt(decade, 10);
  return YEAR_REVIEWS.filter(r => r.year >= start && r.year < start + 10).sort((a, b) => a.year - b.year);
}

function decadeSummary(decade) {
  const intro = DECADE_INTROS_MAP.get(decade);
  if (intro) return intro.summary;
  const reviews = decadeReviews(decade);
  if (!reviews.length) return '';
  return `${reviews.map(r => r.headline).slice(0, 3).join('; ')} — a written review of ${reviews.length === 1 ? reviews[0].year : `${reviews.length} years, ${reviews[0].year} to ${reviews[reviews.length - 1].year}`}.`;
}

function decadesListPage() {
  const cards = DECADES.map(d => {
    const count = (decadesIndex.get(d) || []).length;
    const summary = decadeSummary(d);
    return `<a href="/decades/${encodeURIComponent(d)}" class="platform-card">
      <div class="platform-card-name">${escapeHtml(d)}</div>
      <div class="platform-card-count">${count} game${count !== 1 ? 's' : ''}</div>${summary ? `
      <p class="platform-card-desc">${escapeHtml(summary)}</p>` : ''}
    </a>`;
  }).join('');
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Browse by Decade – Bosnan</title>
    <meta name="description" content="Video game history decade by decade, from Tennis for Two in the 1950s to the PlayStation 2 in 2000, with every game in the Bosnan archive by era.">
    ${cssHead()}
</head>
<body>
${nav('decades')}
<section class="platforms-hero">
    <h1>Browse by Decade</h1>
    <p>The arc of gaming history, decade by decade</p>
    <p>Each decade opens with its history, year by year, followed by every game in the archive from those ten years.</p>
</section>
<div class="platforms-grid">${cards}</div>
${toggleScript()}
</body>
</html>`;
}

function decadeDetailPage(decade) {
  const dGames = (decadesIndex.get(decade) || []).sort((a, b) => a.year - b.year);
  const cardHtml = buildCardHtml(dGames, EAGER_IMAGES);
  const intro = DECADE_INTROS_MAP.get(decade);
  const reviews = decadeReviews(decade);
  const yearsHtml = reviews.length ? `
  <div class="essay-section"><h2>The ${escapeHtml(decade)}, Year by Year</h2><div class="essay-body">${reviews.map(r => `
    <h3><a href="/years/${r.year}">${r.year}: ${escapeHtml(r.headline)}</a></h3>
    <p>${escapeHtml(r.summary)}</p>`).join('')}
  </div></div>` : '';
  const overview = intro || reviews.length ? `
<div class="essay-wrapper">${intro ? `
  <div class="essay-section"><h2>Video Games in the ${escapeHtml(decade)}</h2><div class="essay-body">${intro.html}</div></div>` : ''}${yearsHtml}
  ${intro ? sourcesBlock(intro, true) : ''}
</div>` : '';
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(decade)} Video Games — ${dGames.length} Classics, Year by Year – Bosnan</title>
    <meta name="description" content="${metaDesc(intro ? intro.summary : listingDesc(dGames, `from the ${decade}`))}">
    ${cssHead()}
</head>
<body>
${nav('decades')}
<section class="platforms-hero">
    <h1>${escapeHtml(decade)}</h1>
    <p>${dGames.length} game${dGames.length !== 1 ? 's' : ''} in the archive from this decade</p>
</section>${overview}
<h2 class="${overview ? 'decade-games-heading' : 'sr-only'}">Games from the ${escapeHtml(decade)}</h2>
<div class="games-grid" id="gamesGrid">${cardHtml}</div>
${toggleScript()}
</body>
</html>`;
}

function familyTreePage() {
  const lineages = [
    {
      name: 'The Atari Diaspora',
      desc: 'When Atari\'s original programming team left to found Activision in 1979, they set a precedent: game developers could leave publishers and found their own studios. The studios that grew from Atari\'s talent — and from Activision\'s subsequent departures — seeded much of the American game industry.',
      entries: [
        { from: 'Atari (1972)', arrow: '→', to: 'Activision (1979)', note: 'David Crane, Larry Kaplan, Alan Miller, Bob Whitehead departed to found the first third-party publisher' },
        { from: 'Atari', arrow: '→', to: 'Avalon Hill / SSI', note: 'Several Atari wargame designers moved to dedicated wargame publishers' },
        { from: 'Activision', arrow: '→', to: 'Accolade (1984)', note: 'Bob Whitehead and Alan Miller left Activision to found Accolade' },
        { from: 'Activision', arrow: '→', to: 'Insomniac Games lineage', note: 'Multiple Activision alumni founded studios during the PS1 era' },
      ],
    },
    {
      name: 'Origin Systems → Looking Glass → Ion Storm',
      desc: 'Richard Garriott\'s Origin Systems produced Ultima and Wing Commander. After EA\'s 1992 acquisition, key developers departed to found studios that defined the immersive sim genre.',
      entries: [
        { from: 'Origin Systems (1983)', arrow: '→', to: 'EA acquisition (1992)', note: 'Richard Garriott\'s studio, home of Ultima and Wing Commander' },
        { from: 'Origin / Blue Sky Prods.', arrow: '→', to: 'Looking Glass Studios (1992)', note: 'Paul Neurath\'s team built Ultima Underworld, then System Shock and Thief' },
        { from: 'Origin / Looking Glass alumni', arrow: '→', to: 'Ion Storm Austin (1997)', note: 'Warren Spector\'s team built Deus Ex here after the Looking Glass closure' },
        { from: 'Looking Glass Studios', arrow: '→', to: 'Irrational Games (1997)', note: 'Ken Levine\'s team departed to build System Shock 2 and BioShock' },
      ],
    },
    {
      name: 'id Software and the First-Person Shooter Tree',
      desc: 'John Carmack and John Romero\'s id Software created Wolfenstein 3D, Doom, and Quake. The studio\'s alumni and the technology it licenced seeded an entire generation of action studios.',
      entries: [
        { from: 'Softdisk (1990)', arrow: '→', to: 'id Software (1991)', note: 'Carmack, Romero, Adrian Carmack, Tom Hall departed Softdisk to found id' },
        { from: 'id Software', arrow: '→', to: 'Raven Software', note: 'Built Heretic and Hexen using id engine licences; eventually acquired by Activision' },
        { from: 'id Software (Romero)', arrow: '→', to: 'Ion Storm Dallas (1996)', note: 'John Romero\'s notorious venture; produced Daikatana (2000)' },
        { from: 'id engine licences', arrow: '→', to: 'Valve (1996)', note: 'Half-Life built on Quake engine; Valve became the dominant PC gaming platform' },
        { from: 'id Software', arrow: '→', to: 'ZeniMax / Bethesda (2009)', note: 'id acquired by ZeniMax; Doom (2016) reboot produced under new ownership' },
      ],
    },
    {
      name: 'Ultimate Play the Game → Rare',
      desc: 'Chris and Tim Stamper founded Ultimate Play the Game in 1982, producing landmark ZX Spectrum games. They rebranded as Rare in 1985 and built a 25-year relationship with Nintendo that produced Donkey Kong Country and GoldenEye 007.',
      entries: [
        { from: 'Ultimate Play the Game (1982)', arrow: '→', to: 'Rare Ltd. (1985)', note: 'Stamper brothers renamed and repositioned the company for NES development' },
        { from: 'Rare / Nintendo partnership', arrow: '→', to: 'Donkey Kong Country era (1994)', note: 'Silicon Graphics workstations and pre-rendered sprites redefined 16-bit visuals' },
        { from: 'Rare', arrow: '→', to: 'Microsoft acquisition (2002)', note: '$375 million acquisition ended the Nintendo relationship; Banjo-Kazooie moved to Xbox' },
      ],
    },
    {
      name: 'DMA Design → Rockstar',
      desc: 'David Jones\'s DMA Design in Dundee produced Lemmings and the first Grand Theft Auto before being acquired and rebranded as Rockstar North — the studio that made GTA III and the open-world game formula dominant.',
      entries: [
        { from: 'DMA Design (1987, Dundee)', arrow: '→', to: 'Body Harvest / GTA (1997)', note: 'David Jones\'s studio produced Lemmings (1991) before pivoting to open-world crime games' },
        { from: 'DMA Design', arrow: '→', to: 'Rockstar North (1999)', note: 'BMG Interactive then Take-Two acquired DMA; rebranded after GTA (1997)\'s success' },
        { from: 'Rockstar North', arrow: '→', to: 'GTA III (2001)', note: 'The 3D open-world formula that defined a decade of action game design' },
      ],
    },
    {
      name: 'Bullfrog Productions → Mucky Foot / Lionhead',
      desc: 'Peter Molyneux\'s Bullfrog invented the god game with Populous (1989). After EA\'s 1995 acquisition, Bullfrog\'s alumni founded several influential British studios.',
      entries: [
        { from: 'Bullfrog Productions (1987)', arrow: '→', to: 'EA acquisition (1995)', note: 'Peter Molyneux\'s studio; Populous, Theme Park, Dungeon Keeper, Magic Carpet' },
        { from: 'Bullfrog alumni', arrow: '→', to: 'Lionhead Studios (1997)', note: 'Peter Molyneux founded Lionhead; produced Black & White and Fable' },
        { from: 'Bullfrog alumni', arrow: '→', to: 'Mucky Foot Productions (1997)', note: 'Theme Hospital team founded Mucky Foot; produced Urban Chaos' },
        { from: 'Lionhead', arrow: '→', to: 'Microsoft acquisition (2006)', note: 'Fable series moved to Xbox; Lionhead closed by Microsoft in 2016' },
      ],
    },
    {
      name: 'Apogee Software → 3D Realms → Remedy / Frozenbyte',
      desc: 'Scott Miller\'s Apogee Software pioneered the shareware model for PC gaming. The developers who passed through Apogee and its successor 3D Realms founded studios across the world.',
      entries: [
        { from: 'Apogee Software (1987)', arrow: '→', to: '3D Realms (1994)', note: 'Renamed as the company moved from shareware to retail; produced Duke Nukem 3D' },
        { from: '3D Realms (Remedy team)', arrow: '→', to: 'Remedy Entertainment (1995, Finland)', note: 'Finnish team that built Death Rally and Max Payne; still independent' },
        { from: '3D Realms / Terminal Reality', arrow: '→', to: 'Various FPS studios', note: 'Developers who learned on Build Engine and Quake-era tech founded multiple studios' },
      ],
    },
  ];

  const sectionsHtml = lineages.map(l => `
    <div class="essay-section">
      <h2>${escapeHtml(l.name)}</h2>
      <p style="color:var(--text-muted);margin-bottom:1.2rem">${escapeHtml(l.desc)}</p>
      <div style="display:flex;flex-direction:column;gap:0.6rem">
        ${l.entries.map(e => `
        <div style="display:grid;grid-template-columns:1fr auto 1fr;gap:0.8rem;align-items:center;background:var(--surface-1);border-radius:6px;padding:0.8rem 1rem">
          <div style="font-weight:600;color:var(--accent)">${escapeHtml(e.from)}</div>
          <div style="font-size:1.4em;color:var(--text-muted)">${escapeHtml(e.arrow)}</div>
          <div style="font-weight:600">${escapeHtml(e.to)}</div>
          ${e.note ? `<div style="grid-column:1/-1;font-size:0.85em;color:var(--text-muted);padding-top:0.3rem">${escapeHtml(e.note)}</div>` : ''}
        </div>`).join('')}
      </div>
    </div>`).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Developer Family Tree – Bosnan</title>
    <meta name="description" content="The studio lineages of retro gaming: from Atari to Activision, Origin to Looking Glass, id to Valve, Bullfrog to Lionhead.">
    ${cssHead()}
</head>
<body>
${nav('family-tree')}
<div class="essay-wrapper">
  <div class="essay-header">
    <div class="essay-meta">Reference</div>
    <h1 class="essay-title">Developer Family Tree</h1>
    <p class="essay-subtitle">The studio lineages and alumni networks that shaped retro and modern gaming</p>
  </div>
  ${sectionsHtml}
</div>
${toggleScript()}
</body>
</html>`;
}

function comparePage(a, b) {
  const opts = PLATFORMS.map(p => `<option value="${escapeHtml(p.id)}"${a && a.id === p.id ? ' selected' : ''}>${escapeHtml(p.name)}</option>`).join('');
  const opts2 = PLATFORMS.map(p => `<option value="${escapeHtml(p.id)}"${b && b.id === p.id ? ' selected' : ''}>${escapeHtml(p.name)}</option>`).join('');
  const formHtml = `<div style="display:flex;gap:1rem;align-items:center;flex-wrap:wrap;margin-bottom:2rem">
    <form method="GET" action="/compare" style="display:flex;gap:0.8rem;align-items:center;flex-wrap:wrap">
      <select name="a" style="background:var(--surface-2);color:var(--text);border:1px solid var(--border-strong);padding:0.5rem 0.8rem;border-radius:4px;font-size:1rem">
        <option value="">Select platform A…</option>${opts}
      </select>
      <span style="color:var(--text-muted);font-size:1.2em">vs</span>
      <select name="b" style="background:var(--surface-2);color:var(--text);border:1px solid var(--border-strong);padding:0.5rem 0.8rem;border-radius:4px;font-size:1rem">
        <option value="">Select platform B…</option>${opts2}
      </select>
      <button type="submit" style="background:var(--accent);color:var(--on-accent);border:none;padding:0.5rem 1.2rem;border-radius:4px;font-size:1rem;cursor:pointer;font-weight:700">Compare</button>
    </form>
  </div>`;

  let tableHtml = '';
  if (a && b) {
    const fields = [
      ['Era', 'era'],
      ['Manufacturer', 'manufacturer'],
      ['Description', 'description'],
    ];
    const aCount = (platformGamesIndex.get(a.id) || []).length;
    const bCount = (platformGamesIndex.get(b.id) || []).length;
    tableHtml = `<div style="display:grid;grid-template-columns:200px 1fr 1fr;gap:0;border:1px solid var(--border);border-radius:8px;overflow:hidden">
      <div style="background:var(--surface-1);padding:0.8rem 1rem;font-weight:700;border-bottom:1px solid var(--border)"></div>
      <div style="background:var(--surface-1);padding:0.8rem 1rem;font-weight:700;color:var(--accent);border-bottom:1px solid var(--border);border-left:1px solid var(--border)">${escapeHtml(a.name)}</div>
      <div style="background:var(--surface-1);padding:0.8rem 1rem;font-weight:700;color:var(--accent);border-bottom:1px solid var(--border);border-left:1px solid var(--border)">${escapeHtml(b.name)}</div>
      ${fields.map(([label, key]) => `
      <div style="padding:0.8rem 1rem;border-bottom:1px solid var(--surface-3);font-weight:600;font-size:0.9em;color:var(--text-muted)">${escapeHtml(label)}</div>
      <div style="padding:0.8rem 1rem;border-bottom:1px solid var(--surface-3);border-left:1px solid var(--surface-3);font-size:0.9em">${escapeHtml((a[key] || '').substring(0, 200))}</div>
      <div style="padding:0.8rem 1rem;border-bottom:1px solid var(--surface-3);border-left:1px solid var(--surface-3);font-size:0.9em">${escapeHtml((b[key] || '').substring(0, 200))}</div>`).join('')}
      <div style="padding:0.8rem 1rem;font-weight:600;font-size:0.9em;color:var(--text-muted)">Games in Archive</div>
      <div style="padding:0.8rem 1rem;border-left:1px solid var(--surface-3);font-size:0.9em;font-weight:700">${aCount}</div>
      <div style="padding:0.8rem 1rem;border-left:1px solid var(--surface-3);font-size:0.9em;font-weight:700">${bCount}</div>
    </div>
    ${a.longDescription ? `<div style="margin-top:2rem"><h3 style="margin-bottom:0.5rem">${escapeHtml(a.name)}</h3><p style="color:var(--text-secondary);line-height:1.7">${escapeHtml(a.longDescription.substring(0, 600))}…</p></div>` : ''}
    ${b.longDescription ? `<div style="margin-top:1.5rem"><h3 style="margin-bottom:0.5rem">${escapeHtml(b.name)}</h3><p style="color:var(--text-secondary);line-height:1.7">${escapeHtml(b.longDescription.substring(0, 600))}…</p></div>` : ''}`;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Compare Platforms – Bosnan</title>
    <meta name="description" content="Compare any two retro gaming platforms side by side — specs, era, and games in the archive.">
    ${a || b ? '<meta name="robots" content="noindex, follow">\n    ' : ''}${cssHead()}
</head>
<body>
${nav('compare')}
<div class="essay-wrapper">
  <div class="essay-header">
    <h1 class="essay-title">Compare Platforms</h1>
    <p class="essay-subtitle">Select any two platforms to see them side by side</p>
  </div>
  ${formHtml}
  ${tableHtml}
</div>
${toggleScript()}
</body>
</html>`;
}

// ---- Site search -------------------------------------------------------------
// One index over every section that has entry pages, plus the section hubs.
// Search used to look in 7 of the 74 sections (and the nav autocomplete in 4,
// titles only), so a query like "Miyamoto" missed the characters, box art,
// cancelled games and difficulty entries that name him. clDataBySlug already
// lists every section's entries — the same source the sibling blocks use — so
// the index cannot drift from what the site actually publishes. ~1,950 docs
// fit comfortably in memory; a linear scan per query costs a few ms.
//
// Built lazily on the first query: cold start pays nothing for it.
let searchIndex = null;
function searchNorm(s) {
  return String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
}
function buildSearchIndex() {
  const routed = entryRouteSlugs();
  const docs = [];
  const vocab = new Set();
  const seen = new Set();
  const add = (doc) => {
    if (seen.has(doc.href)) return;
    seen.add(doc.href);
    doc.nTitle = searchNorm(doc.title);
    // Short names ("C64", "SNES") count as title words too.
    doc.nAlias = searchNorm(doc.alias);
    doc.pTitle = ' ' + doc.nTitle + ' ' + (doc.nAlias ? doc.nAlias + ' ' : '');
    doc.pProse = ' ' + searchNorm(doc.prose) + ' ';
    doc.titleWords = new Set(doc.pTitle.trim().split(' '));
    for (const w of doc.titleWords) if (w.length >= 4) vocab.add(w);
    docs.push(doc);
  };
  for (const [slug, data] of clDataBySlug) {
    if (!Array.isArray(data) || !routed.has(slug)) continue;
    const label = SEARCH_SECTION_LABELS.get(slug) || clLabelBySlug.get(slug) || sectionLabel(slug) || slug;
    for (const e of data) {
      if (!e || !e.id) continue;
      const title = clTitle(e);
      if (!title) continue;
      const blurb = e.description || e.summary || e.subtitle || e.significance || '';
      add({
        slug, label, title, href: `/${slug}/${e.id}`, alias: e.shortName && e.shortName !== title ? e.shortName : '',
        sub: slug === 'games' ? [e.year, e.platform].filter(Boolean).join(' · ') : label,
        blurb: String(blurb).replace(/<[^>]*>/g, ''),
        prose: entryProse(e),
      });
    }
  }
  // Section hubs, so "glossary" or "sound chips" lands on the section itself.
  for (const g of NAV_GROUPS) for (const [slug, href, label] of g.items) {
    if (SITEMAP_EXCLUDE.has(href)) continue;
    add({ slug: 'section', label: 'Section', title: label, href, sub: 'Section', blurb: HUB_DESCRIPTIONS.get(slug) || '', prose: '' });
  }
  return { docs, vocab: [...vocab] };
}
// Sections whose pages live at /<slug>/<id>, read from the registered routes
// rather than assumed, so a registry row without detail pages is never indexed
// into a 404. Read at first query, by which point every route is registered.
function entryRouteSlugs() {
  const out = new Set();
  for (const layer of app._router.stack) {
    const m = layer.route && /^\/([a-z0-9-]+)\/:id$/.exec(layer.route.path);
    if (m) out.add(m[1]);
  }
  return out;
}
const SEARCH_SECTION_LABELS = new Map([['genres', 'Genre'], ['platforms', 'Platform']]);

// Edit distance with an early exit once it exceeds `max`.
function editDistance(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (cur[j] < best) best = cur[j];
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

// Words match from their start ("metr" finds Metroid, not "geometry"), so both
// haystacks are held space-padded and each token is looked up as " token".
// Tokens under 4 characters must be whole words, or "sid" would match every
// "side" and "pac" every "package".
function scoreDoc(d, nq, tokens) {
  let score = 0;
  tokens = tokens.map(t => t.length < 4 ? t + ' ' : t);
  if (d.nTitle === nq || d.nAlias === nq) score += 100;
  else if (d.nTitle.replace(/^(the|a|an) /, '').startsWith(nq)) score += 60;
  else if (d.pTitle.includes(' ' + nq)) score += 40;
  let inTitle = 0, inAny = 0;
  for (const t of tokens) {
    const titleHit = d.pTitle.includes(' ' + t);
    if (titleHit) inTitle++;
    if (titleHit || d.pProse.includes(' ' + t)) inAny++;
    if (d.titleWords.has(t.trim())) score += 10; // a whole word, not just a prefix
  }
  if (inAny < tokens.length) return 0; // every word must appear somewhere
  if (inTitle === tokens.length) score += 30;
  else score += 10 * inTitle;
  if (tokens.length > 1 && d.pProse.includes(' ' + nq)) score += 12;
  if (!score) score = 4; // matched only in the body
  if (d.slug === 'section' && inTitle === tokens.length) score += 8;
  if (d.slug === 'games') score += 2;
  return score;
}

// Replace each unknown query word by its nearest title word, for typos
// ("zeldda", "castelvania"). Only used when the literal query finds nothing.
function correctQuery(tokens, vocab) {
  let changed = false;
  const out = tokens.map(t => {
    if (t.length < 4 || vocab.includes(t)) return t;
    const max = t.length >= 7 ? 2 : 1;
    let best = null, bestD = max + 1;
    for (const w of vocab) {
      const d = editDistance(t, w, max);
      if (d < bestD) { bestD = d; best = w; if (d === 1 && max === 1) break; }
    }
    if (best) { changed = true; return best; }
    return t;
  });
  return changed ? out : null;
}

function runSearch(q, limit = 200) {
  if (!searchIndex) searchIndex = buildSearchIndex();
  const nq = searchNorm(q);
  if (nq.length < 2) return { results: [], corrected: null };
  const rank = (tokens, nqs) => searchIndex.docs
    .map(d => ({ d, s: scoreDoc(d, nqs, tokens) }))
    .filter(x => x.s > 0)
    .sort((a, b) => b.s - a.s || a.d.title.length - b.d.title.length || a.d.title.localeCompare(b.d.title))
    .slice(0, limit)
    .map(x => x.d);
  const tokens = nq.split(' ');
  let results = rank(tokens, nq);
  let corrected = null;
  if (!results.length) {
    const fixed = correctQuery(tokens, searchIndex.vocab);
    if (fixed) {
      results = rank(fixed, fixed.join(' '));
      if (results.length) corrected = fixed.join(' ');
    }
  }
  return { results, corrected };
}

// The first place the query occurs in the entry's text, with the match marked.
function searchSnippet(d, q) {
  const text = (d.blurb || d.prose || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  const words = searchNorm(q).split(' ').filter(w => w.length >= 2);
  const lower = text.toLowerCase();
  let at = -1;
  for (const w of words) { const i = lower.indexOf(w); if (i >= 0 && (at < 0 || i < at)) at = i; }
  let start = 0;
  if (at > 60) { start = text.lastIndexOf(' ', at - 50); if (start < 0) start = 0; }
  let snip = text.slice(start, start + 170);
  if (start + 170 < text.length) snip = snip.replace(/\s+\S*$/, '') + '…';
  if (start > 0) snip = '…' + snip;
  let html = escapeHtml(snip);
  const pattern = words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  if (pattern) html = html.replace(new RegExp(`(${pattern})`, 'gi'), '<mark>$1</mark>');
  return html;
}

function searchPage(q) {
  let resultsHtml = '';
  if (q.trim().length >= 2) {
    const { results, corrected } = runSearch(q);
    const shownQ = corrected || q;
    const note = corrected
      ? `<p class="search-note">No results for “<strong>${escapeHtml(q)}</strong>”. Showing results for “<strong>${escapeHtml(corrected)}</strong>”.</p>`
      : '';
    if (!results.length) {
      resultsHtml = `<p class="search-note">No results for “<strong>${escapeHtml(q)}</strong>”. Try fewer words, or start from the <a href="/">homepage</a>.</p>`;
    } else {
      // Section chips: counts per section, each filtering the list in place.
      const bySection = new Map();
      for (const d of results) bySection.set(d.label, (bySection.get(d.label) || 0) + 1);
      // The eight biggest sections show; the long tail folds behind "More".
      const chip = ([label, n]) =>
        `<button type="button" class="search-chip" data-f="${escapeHtml(label)}">${escapeHtml(label)} <span>${n}</span></button>`;
      const sorted = [...bySection].sort((a, b) => b[1] - a[1]);
      const chips = sorted.slice(0, 8).map(chip).join('') + (sorted.length > 8
        ? `<details class="search-more"><summary class="search-chip">+${sorted.length - 8} more</summary>${sorted.slice(8).map(chip).join('')}</details>`
        : '');
      const rows = results.map(d => { const snip = searchSnippet(d, shownQ); return `<li class="search-hit" data-f="${escapeHtml(d.label)}">
        <a href="${d.href}" class="search-hit-title">${escapeHtml(d.title)}</a>
        <span class="search-hit-sub">${escapeHtml(d.sub || d.label)}</span>
        ${snip ? `<p class="search-hit-snip">${snip}</p>` : ''}
      </li>`; }).join('');
      resultsHtml = `${note}
  <p class="search-count">${results.length}${results.length >= 200 ? '+' : ''} result${results.length !== 1 ? 's' : ''} for “<strong>${escapeHtml(shownQ)}</strong>”</p>
  ${bySection.size > 1 ? `<div class="search-chips" role="group" aria-label="Filter by section"><button type="button" class="search-chip is-on" data-f="">All <span>${results.length}</span></button>${chips}</div>` : ''}
  <ol class="search-hits">${rows}</ol>
  <script>
  document.querySelector('.search-chips')&&document.querySelector('.search-chips').addEventListener('click',function(e){
    var b=e.target.closest('.search-chip');if(!b)return;var f=b.dataset.f;
    document.querySelectorAll('.search-chip').forEach(function(c){c.classList.toggle('is-on',c===b);});
    document.querySelectorAll('.search-hit').forEach(function(h){h.hidden=!!f&&h.dataset.f!==f;});
  });
  </script>`;
    }
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${q ? escapeHtml(q) + ' – ' : ''}Search – Bosnan</title>
    <meta name="description" content="Search the Bosnan retro games archive.">
    <meta name="robots" content="noindex, follow">
    ${cssHead()}
</head>
<body>
${nav('search')}
<div class="essay-wrapper search-wrapper">
  <div class="essay-header">
    <h1 class="essay-title">Search</h1>
  </div>
  <form method="GET" action="/search" class="search-form" role="search">
    <input type="search" name="q" value="${escapeHtml(q)}" placeholder="Search games, people, hardware, essays…"
      aria-label="Search the archive" ${q ? '' : 'autofocus'}>
    <button type="submit">Search</button>
  </form>
  ${resultsHtml}
</div>
${toggleScript()}
</body>
</html>`;
}

function bookmarkBtn(id, title, type) {
  return `<button class="bm-btn" id="bm-${escapeHtml(id)}" onclick="toggleBM('${escapeHtml(id)}','${escapeHtml(title.replace(/'/g,"\\\'"))}','${escapeHtml(type)}')">&#9734; Save</button>
<script>
(function(){
  const k='bosnan_bm';
  function bms(){try{return JSON.parse(localStorage.getItem(k)||'[]');}catch(e){return[];}}
  const id='${escapeHtml(id)}';
  const btn=document.getElementById('bm-'+id);
  function upd(){const has=bms().some(b=>b.id===id);btn.innerHTML=has?'&#9733; Saved':'&#9734; Save';btn.classList.toggle('is-saved',has);}
  upd();
  window.toggleBM=function(id,title,type){const list=bms();const i=list.findIndex(b=>b.id===id);if(i>=0)list.splice(i,1);else list.push({id,title,type});localStorage.setItem(k,JSON.stringify(list));upd();};
})();
</script>`;
}

function sequelsListPage() {
  const cards = SEQUELS.map(s => `<a href="/sequels/${s.id}" class="platform-card">
    <div class="platform-card-name">${escapeHtml(s.title)}</div>
    <div class="platform-card-era">${escapeHtml(s.series)} &middot; ${escapeHtml(s.platform)} &middot; ${s.year}</div>
    <p class="platform-card-desc">${escapeHtml(s.description)}</p>
  </a>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Sequels That Changed Everything – Bosnan</title><meta name="description" content="How sequels reinvented their franchises: Mario 3, A Link to the Past, Symphony of the Night, Super Metroid and more."><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${nav('sequels')}<section class="platforms-hero"><h1>Sequels That Changed Everything</h1><p>Not just more — fundamentally different</p></section><div class="platforms-grid">${cards}</div>${toggleScript()}</body></html>`;
}

function sequelDetailPage(item) {
  const changed = (item.changedWhat || []).map(c => `<li>${escapeHtml(c)}</li>`).join('');
  const facts = (item.keyFacts || []).map(f => `<li>${escapeHtml(f)}</li>`).join('');
  // Entries written as sections carry their prose there; the rest keep it in longDescription.
  const sections = (item.sections || []).length
    ? item.sections.map(s => `<div class="essay-section"><h2>${escapeHtml(s.title)}</h2>${s.html}</div>`).join('')
    : item.longDescription ? `<div class="essay-section"><h2>About ${escapeHtml(item.title)}</h2><div class="essay-body">${paragraphs(item.longDescription)}</div></div>` : '';
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escapeHtml(item.title)} – Sequels – Bosnan</title><meta name="description" content="${metaDesc(item.description)}"><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${nav('sequels')}<div class="essay-wrapper"><a href="/sequels" class="back-link">&#8592; All Sequels</a><div class="essay-header"><div class="essay-meta">${escapeHtml(item.series)} &middot; ${escapeHtml(item.platform)} &middot; ${item.year}</div><h1 class="essay-title">${escapeHtml(item.title)}</h1><p class="essay-subtitle">${escapeHtml(item.description)}</p>${item.original ? `<p style="color:var(--text-muted);font-size:0.9em">Follows: <em>${escapeHtml(item.original)}</em></p>` : ''}</div>${changed ? `<div class="essay-section"><h2>What Changed</h2><ul class="trivia-list">${changed}</ul></div>` : ''}${sections}${facts ? `<div class="essay-section"><h2>Key Facts</h2><ul class="trivia-list">${facts}</ul></div>` : ''}${sourcesBlock(item)}${relatedBlock(item)}</div>${toggleScript()}</body></html>`;
}

function romHacksListPage() {
  const typeColors = { 'Difficulty Hack': '#ef9a9a', 'Translation': '#90caf9', 'Total Conversion': '#ce93d8', 'Restoration': '#a5d6a7', 'Randomiser': '#ffcc80', 'Bug Fix': '#b0bec5' };
  const cards = ROM_HACKS.map(r => `<a href="/rom-hacks/${r.id}" class="platform-card">
    <div class="platform-card-name">${escapeHtml(r.title)}</div>
    <div class="platform-card-era">${escapeHtml(r.baseGame)} &middot; ${r.year}</div>
    <div class="platform-card-count" style="color:${typeColors[r.type]||'var(--text-muted)'}">${escapeHtml(r.type)}</div>
    <p class="platform-card-desc">${escapeHtml(r.description)}</p>
  </a>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>ROM Hacks &amp; Mods – Bosnan</title><meta name="description" content="Famous ROM hacks and fan modifications: Kaizo Mario, Doom WADs, Zelda randomiser, Mother fan translation and more."><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${nav('rom-hacks')}<section class="platforms-hero"><h1>ROM Hacks &amp; Mods</h1><p>Fan modifications, translations, and total conversions</p></section><div class="platforms-grid">${cards}</div>${toggleScript()}</body></html>`;
}

function romHackDetailPage(item) {
  const facts = (item.keyFacts || []).map(f => `<li>${escapeHtml(f)}</li>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escapeHtml(item.title)} – ROM Hacks – Bosnan</title><meta name="description" content="${metaDesc(item.description)}"><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${nav('rom-hacks')}<div class="platform-detail-wrapper"><a href="/rom-hacks" class="back-link">&#8592; All ROM Hacks</a><div class="platform-detail-header"><h1>${escapeHtml(item.title)}</h1><p class="platform-detail-era">Base: ${escapeHtml(item.baseGame)} &middot; ${escapeHtml(item.platform)} &middot; ${item.year} &middot; ${escapeHtml(item.type)}</p>${item.creator ? `<p class="platform-detail-era" style="font-size:0.9em;opacity:0.7">Creator: ${escapeHtml(item.creator)}</p>` : ''}<p class="platform-detail-desc">${escapeHtml(item.description)}</p><div class="platform-detail-desc">${paragraphs(item.longDescription)}</div>${item.notableFor ? `<div class="dev-notable"><strong>Legacy:</strong> ${escapeHtml(item.notableFor)}</div>` : ''}${facts ? `<div class="dev-notable"><strong>Key Facts:</strong><ul class="trivia-list">${facts}</ul></div>` : ''}</div>${sourcesBlock(item)}</div>${toggleScript()}</body></html>`;
}

function adCampaignsListPage() {
  const cards = AD_CAMPAIGNS.map(a => `<a href="/ad-campaigns/${a.id}" class="platform-card">
    <div class="platform-card-name">${escapeHtml(a.title)}</div>
    <div class="platform-card-era">${escapeHtml(a.company)} &middot; ${a.year}</div>
    <div class="platform-card-count" style="font-style:italic;color:var(--accent)">${escapeHtml(a.tagline || '')}</div>
    <p class="platform-card-desc">${escapeHtml(a.description)}</p>
  </a>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Advertising Campaigns – Bosnan</title><meta name="description" content="Iconic game advertising: Genesis Does What Nintendon't, PlayStation Double Life, Now You're Playing With Power and more."><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${nav('ad-campaigns')}<section class="platforms-hero"><h1>Advertising Campaigns</h1><p>The marketing that shaped the console wars</p></section><div class="platforms-grid">${cards}</div>${toggleScript()}</body></html>`;
}

function adCampaignDetailPage(item) {
  const facts = (item.keyFacts || []).map(f => `<li>${escapeHtml(f)}</li>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escapeHtml(item.title)} – Ad Campaigns – Bosnan</title><meta name="description" content="${metaDesc(item.description)}"><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${nav('ad-campaigns')}<div class="platform-detail-wrapper"><a href="/ad-campaigns" class="back-link">&#8592; All Campaigns</a><div class="platform-detail-header"><h1>${escapeHtml(item.title)}</h1><p class="platform-detail-era">${escapeHtml(item.company)} &middot; ${item.year} &middot; ${escapeHtml(item.product || '')}</p>${item.tagline ? `<blockquote style="border-left:3px solid var(--accent);padding-left:1rem;margin:1rem 0;font-style:italic;font-size:1.2em;color:var(--accent)">"${escapeHtml(item.tagline)}"</blockquote>` : ''}<p class="platform-detail-desc">${escapeHtml(item.description)}</p><div class="platform-detail-desc">${paragraphs(item.longDescription)}</div>${item.impact ? `<div class="dev-notable"><strong>Impact:</strong> ${escapeHtml(item.impact)}</div>` : ''}${facts ? `<div class="dev-notable"><strong>Key Facts:</strong><ul class="trivia-list">${facts}</ul></div>` : ''}</div>${sourcesBlock(item)}</div>${toggleScript()}</body></html>`;
}

function salesFiguresPage() {
  const cards = SALES_FIGURES.map(s => `<a href="/sales-figures/${s.id}" class="platform-card">
    <div class="platform-card-name">${escapeHtml(s.title)}</div>
    <div class="platform-card-era">${escapeHtml(s.type)} &middot; ${escapeHtml(s.period)}</div>
    <div class="platform-card-count" style="font-size:1.2em;font-weight:900;color:var(--accent)">${escapeHtml(s.units)}</div>
    <p class="platform-card-desc">${escapeHtml(s.description)}</p>
  </a>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Sales Figures – Bosnan</title><meta name="description" content="Retro gaming by the numbers: NES, Game Boy, PlayStation, Tetris, Super Mario Bros. and the sales that defined the industry."><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${nav('sales-figures')}<section class="platforms-hero"><h1>Sales Figures</h1><p>Gaming history measured in units and dollars</p></section><div class="platforms-grid">${cards}</div>${toggleScript()}</body></html>`;
}

function salesFigureDetailPage(item) {
  const context = (item.context || []).map(c => `<li>${escapeHtml(c)}</li>`).join('');
  const facts = (item.keyFacts || []).map(f => `<li>${escapeHtml(f)}</li>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escapeHtml(item.title)} – Sales Figures – Bosnan</title><meta name="description" content="${metaDesc(item.description)}"><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${nav('sales-figures')}<div class="platform-detail-wrapper"><a href="/sales-figures" class="back-link">&#8592; All Sales Figures</a><div class="platform-detail-header"><h1>${escapeHtml(item.title)}</h1><p class="platform-detail-era">${escapeHtml(item.type)} &middot; ${escapeHtml(item.period)}</p><div style="font-size:3em;font-weight:900;color:var(--accent);margin:0.5rem 0">${escapeHtml(item.units)}</div><p class="platform-detail-desc">${escapeHtml(item.description)}</p><div class="platform-detail-desc">${paragraphs(item.longDescription)}</div>${context ? `<div class="dev-notable"><strong>In Context:</strong><ul class="trivia-list">${context}</ul></div>` : ''}${facts ? `<div class="dev-notable"><strong>Key Facts:</strong><ul class="trivia-list">${facts}</ul></div>` : ''}</div>${sourcesBlock(item)}</div>${toggleScript()}</body></html>`;
}

function speedrunsListPage() {
  const cards = SPEEDRUNS.map(s => `<a href="/speedruns/${s.id}" class="platform-card">
    <div class="platform-card-name">${escapeHtml(s.game)}</div>
    <div class="platform-card-era">${escapeHtml(s.platform)} &middot; ${escapeHtml(s.category)}</div>
    <div class="platform-card-count" style="font-family:monospace;color:var(--accent)">${escapeHtml(s.currentWR)}</div>
    <p class="platform-card-desc">${escapeHtml(s.description)}</p>
  </a>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Speedruns – Bosnan</title><meta name="description" content="Iconic speedrun histories: Super Mario Bros. sub-5, Ocarina of Time wrong warp, GoldenEye bond tricks and more."><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${nav('speedruns')}<section class="platforms-hero"><h1>Speedruns</h1><p>The races to the bottom of the clock</p></section><div class="platforms-grid">${cards}</div>${toggleScript()}</body></html>`;
}

function speedrunDetailPage(item) {
  const techniques = (item.famousTechniques || []).map(t => `<li>${escapeHtml(t)}</li>`).join('');
  const runners = (item.notableRunners || []).map(r => `<li>${escapeHtml(r)}</li>`).join('');
  const facts = (item.keyFacts || []).map(f => `<li>${escapeHtml(f)}</li>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escapeHtml(`${item.game} Speedrun: ${item.category}`.length <= 50 ? `${item.game} Speedrun: ${item.category} History` : `${item.game} Speedrun History`)} – Bosnan</title><meta name="description" content="${metaDesc(item.description)}"><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${nav('speedruns')}<div class="platform-detail-wrapper"><a href="/speedruns" class="back-link">&#8592; All Speedruns</a><div class="platform-detail-header"><h1>${escapeHtml(item.game)}</h1><p class="platform-detail-era">${escapeHtml(item.platform)} &middot; ${escapeHtml(item.category)} &middot; ${item.year}</p><div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin:1rem 0">${item.currentWR ? `<div style="background:var(--surface-1);border-radius:6px;padding:1rem;text-align:center"><div style="font-size:0.8em;color:var(--text-muted);margin-bottom:0.3rem">Current WR</div><div style="font-size:1.6em;font-weight:900;font-family:monospace;color:var(--accent)">${escapeHtml(item.currentWR)}</div></div>` : ''}${item.firstKnownRun ? `<div style="background:var(--surface-1);border-radius:6px;padding:1rem;text-align:center"><div style="font-size:0.8em;color:var(--text-muted);margin-bottom:0.3rem">First Known Run</div><div style="font-size:1.6em;font-weight:900;font-family:monospace;color:var(--text-muted)">${escapeHtml(item.firstKnownRun)}</div></div>` : ''}</div><p class="platform-detail-desc">${escapeHtml(item.description)}</p><div class="platform-detail-desc">${paragraphs(item.longDescription)}</div>${techniques ? `<div class="dev-notable"><strong>Famous Techniques:</strong><ul class="trivia-list">${techniques}</ul></div>` : ''}${runners ? `<div class="dev-notable"><strong>Notable Runners:</strong><ul class="trivia-list">${runners}</ul></div>` : ''}${facts ? `<div class="dev-notable"><strong>Key Facts:</strong><ul class="trivia-list">${facts}</ul></div>` : ''}</div>${sourcesBlock(item)}${relatedBlock(item)}</div>${toggleScript()}</body></html>`;
}

function criticsListPage() {
  const cards = CRITICS.map(c => `<a href="/critics/${c.id}" class="platform-card">
    <div class="platform-card-name">${escapeHtml(c.name)}</div>
    <div class="platform-card-era">${escapeHtml(c.role)} &middot; ${escapeHtml(c.outlet)} &middot; ${escapeHtml(c.era)}</div>
    <p class="platform-card-desc">${escapeHtml(c.description)}</p>
  </a>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Critics &amp; Journalists – Bosnan</title><meta name="description" content="The writers who shaped games coverage: Bill Kunkel, Dave Halverson, Jeff Gerstmann, Kieron Gillen and more."><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${nav('critics')}<section class="platforms-hero"><h1>Critics &amp; Journalists</h1><p>The writers who shaped how we talk about games</p></section><div class="platforms-grid">${cards}</div>${toggleScript()}</body></html>`;
}

function criticDetailPage(item) {
  const work = gameLinkList(item.notableWork);
  const facts = (item.keyFacts || []).map(f => `<li>${escapeHtml(f)}</li>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escapeHtml(item.name)} – Critics – Bosnan</title><meta name="description" content="${metaDesc(item.description)}"><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${nav('critics')}<div class="platform-detail-wrapper"><a href="/critics" class="back-link">&#8592; All Critics</a><div class="platform-detail-header"><h1>${escapeHtml(item.name)}</h1><p class="platform-detail-era">${escapeHtml(item.role)} &middot; ${escapeHtml(item.outlet)} &middot; ${escapeHtml(item.era)}${item.nationality ? ' &middot; ' + escapeHtml(item.nationality) : ''}</p><p class="platform-detail-desc">${escapeHtml(item.description)}</p><div class="platform-detail-desc">${paragraphs(item.longDescription)}</div>${work ? `<div class="dev-notable"><strong>Notable Work:</strong><ul class="trivia-list">${work}</ul></div>` : ''}${facts ? `<div class="dev-notable"><strong>Key Facts:</strong><ul class="trivia-list">${facts}</ul></div>` : ''}</div>${sourcesBlock(item)}</div>${toggleScript()}</body></html>`;
}

function wordSearchPage() {
  const wordList = games.map(g => g.title.replace(/[^A-Z]/gi, '').toUpperCase()).filter(w => w.length >= 4 && w.length <= 12).filter((v, i, a) => a.indexOf(v) === i).sort(() => Math.random() - 0.5).slice(0, 15);
  const SIZE = 15;
  const grid = Array.from({ length: SIZE }, () => Array(SIZE).fill(''));
  const placed = [];
  const dirs = [[0,1],[1,0],[0,-1],[-1,0],[1,1],[1,-1],[-1,1],[-1,-1]];
  for (const word of wordList) {
    let tries = 0, ok = false;
    while (tries++ < 100 && !ok) {
      const [dr, dc] = dirs[Math.floor(Math.random() * dirs.length)];
      const r = Math.floor(Math.random() * SIZE);
      const c = Math.floor(Math.random() * SIZE);
      let fits = true;
      for (let i = 0; i < word.length; i++) {
        const nr = r + dr * i, nc = c + dc * i;
        if (nr < 0 || nr >= SIZE || nc < 0 || nc >= SIZE) { fits = false; break; }
        if (grid[nr][nc] !== '' && grid[nr][nc] !== word[i]) { fits = false; break; }
      }
      if (fits) {
        for (let i = 0; i < word.length; i++) grid[r + dr * i][c + dc * i] = word[i];
        placed.push(word);
        ok = true;
      }
    }
  }
  const alpha = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (!grid[r][c]) grid[r][c] = alpha[Math.floor(Math.random() * 26)];
  const cells = grid.map((row, r) => row.map((ch, c) => `<td id="c${r}_${c}" onclick="sel(${r},${c})" style="width:2rem;height:2rem;text-align:center;cursor:pointer;user-select:none;border:1px solid var(--border);font-family:monospace;font-size:1em">${ch}</td>`).join('')).map(row => `<tr>${row}</tr>`).join('');
  const wordItems = placed.map(w => `<li id="w-${w}" style="font-family:monospace;padding:0.3rem 0">${w}</li>`).join('');
  const gridData = JSON.stringify(grid);
  const wordsData = JSON.stringify(placed);
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Word Search – Bosnan</title><meta name="description" content="A retro gaming word search: find classic game titles from the Bosnan archive hidden in the grid. A new puzzle is generated on every server restart."><style>h1,h2{font-family:inherit}td.found{background:var(--accent-soft);color:var(--accent);font-weight:700}td.sel{background:var(--surface-3)}</style>${cssHead()}</head><body>${nav('wordsearch')}<div class="essay-wrapper"><div class="essay-header"><h1 class="essay-title">Word Search</h1><p class="essay-subtitle">Find ${placed.length} retro game titles — refreshes with new words each server restart</p></div><div style="display:grid;grid-template-columns:auto 200px;gap:2rem;align-items:start;flex-wrap:wrap"><div style="overflow-x:auto"><table style="border-collapse:collapse">${cells}</table></div><div><h2 style="margin-bottom:0.8rem;font-size:1.1rem">Find these words:</h2><ul style="list-style:none;padding:0;margin:0">${wordItems}</ul><p id="winMsg" style="display:none;color:var(--accent);font-weight:700;margin-top:1rem">You found them all!</p></div></div></div>
<script>
const GRID=${gridData},WORDS=${wordsData};
const SIZE=${SIZE};let sel1=null,found=new Set(),foundCells=new Set();
function cel(r,c){return document.getElementById('c'+r+'_'+c);}
function sel(r,c){
  if(!sel1){sel1=[r,c];cel(r,c).classList.add('sel');return;}
  const[r1,c1]=sel1;cel(r1,c1).classList.remove('sel');sel1=null;
  const dr=Math.sign(r-r1),dc=Math.sign(c-c1);
  const len=Math.max(Math.abs(r-r1),Math.abs(c-c1))+1;
  let word='';const cells=[];
  for(let i=0;i<len;i++){const nr=r1+dr*i,nc=c1+dc*i;word+=GRID[nr][nc];cells.push([nr,nc]);}
  const rev=word.split('').reverse().join('');
  const match=WORDS.find(w=>w===word||w===rev);
  if(match&&!found.has(match)){
    found.add(match);
    cells.forEach(([nr,nc])=>{cel(nr,nc).classList.add('found');foundCells.add(nr+'_'+nc);});
    const li=document.getElementById('w-'+match);
    if(li)li.style.textDecoration='line-through';
    if(found.size===WORDS.length)document.getElementById('winMsg').style.display='block';
  }
}
</script>
${toggleScript()}</body></html>`;
}

function bookmarksPage() {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Bookmarks – Bosnan</title><meta name="description" content="Your saved games, essays, and articles."><meta name="robots" content="noindex, follow"><style>h1,h2{font-family:inherit}.bm-card{display:block;background:var(--surface-1);border-radius:8px;padding:1rem 1.2rem;margin-bottom:0.8rem;text-decoration:none;color:inherit;border:1px solid var(--border)}.bm-card:hover{border-color:var(--accent)}.bm-type{font-size:var(--fs-xs);color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:0.3rem}.bm-title{font-weight:700}.bm-remove{float:right;background:none;border:none;color:var(--text-faint);cursor:pointer;font-size:1.2em;padding:0}</style>${cssHead()}</head><body>${nav('bookmarks')}<div class="essay-wrapper"><div class="essay-header"><h1 class="essay-title">Bookmarks</h1><p class="essay-subtitle">Your saved items</p></div><div id="bmList"><p style="color:var(--text-muted)">No bookmarks yet — click the Save button on any game or article page.</p></div></div>
<script>
const k='bosnan_bm';
function bms(){try{return JSON.parse(localStorage.getItem(k)||'[]');}catch(e){return[];}}
function esc(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function remove(id){const list=bms().filter(b=>b.id!==id);try{localStorage.setItem(k,JSON.stringify(list));}catch(e){}render();}
document.addEventListener('click',e=>{const b=e.target.closest('.bm-remove');if(b)remove(b.dataset.id);});
function render(){
  const list=bms();const el=document.getElementById('bmList');
  if(!list.length){el.innerHTML='<p style="color:var(--text-muted)">No bookmarks yet — click the Save button on any game or article page.</p>';return;}
  el.innerHTML=list.map(b=>'<div class="bm-card"><div style="display:flex;justify-content:space-between;align-items:start"><div><div class="bm-type">'+esc(b.type)+'</div><a href="/'+encodeURIComponent(String(b.type).toLowerCase().replace(/ /g,'-'))+'s/'+encodeURIComponent(b.id)+'" class="bm-title">'+esc(b.title)+'</a></div><button class="bm-remove" data-id="'+esc(b.id)+'" aria-label="Remove '+esc(b.title)+'">&#10005;</button></div></div>').join('');
}
render();
</script>
${toggleScript()}</body></html>`;
}

function controversiesListPage() {
  const cards = CONTROVERSIES.map(c => `<a href="/controversies/${c.id}" class="platform-card">
    <div class="platform-card-name">${escapeHtml(c.title)}</div>
    <div class="platform-card-era">${c.year} &middot; ${escapeHtml(c.era)}</div>
    <p class="platform-card-desc">${escapeHtml(c.description)}</p>
  </a>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Controversies – Bosnan</title><meta name="description" content="The scandals and controversies that shaped gaming history: ESRB creation, Doom moral panic, Hot Coffee, the 1983 crash and more."><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${nav('controversies')}<section class="platforms-hero"><h1>Controversies</h1><p>The scandals, moral panics, and flashpoints that changed gaming</p></section><div class="platforms-grid">${cards}</div>${toggleScript()}</body></html>`;
}

function controversyDetailPage(item) {
  const gamesHtml = (item.games || []).map(g => `<span style="background:var(--surface-2);border-radius:3px;padding:0.2rem 0.5rem;font-size:0.85em">${escapeHtml(g)}</span>`).join(' ');
  const facts = (item.keyFacts || []).map(f => `<li>${escapeHtml(f)}</li>`).join('');
  const sectionsHtml = (item.sections || []).map(s => `<div class="essay-section"><h2>${escapeHtml(s.title)}</h2>${s.html}</div>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escapeHtml(item.title)} – Controversies – Bosnan</title><meta name="description" content="${metaDesc(item.description)}"><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${nav('controversies')}<div class="essay-wrapper"><a href="/controversies" class="back-link">&#8592; All Controversies</a><div class="essay-header"><div class="essay-meta">${item.year} &middot; ${escapeHtml(item.era)}</div><h1 class="essay-title">${escapeHtml(item.title)}</h1><p class="essay-subtitle">${escapeHtml(item.description)}</p>${gamesHtml ? `<div style="margin-top:0.8rem;display:flex;gap:0.4rem;flex-wrap:wrap">${gamesHtml}</div>` : ''}</div>${sectionsHtml}${item.outcome ? `<div class="essay-section"><h2>Outcome</h2><p>${escapeHtml(item.outcome)}</p></div>` : ''}${facts ? `<div class="essay-section"><h2>Key Facts</h2><ul class="trivia-list">${facts}</ul></div>` : ''}${sourcesBlock(item)}${relatedBlock(item)}</div>${toggleScript()}</body></html>`;
}

function failedConsolesListPage() {
  const cards = FAILED_CONSOLES.map(c => `<a href="/failed-consoles/${c.id}" class="platform-card">
    <div class="platform-card-name">${escapeHtml(c.name)}</div>
    <div class="platform-card-era">${escapeHtml(c.manufacturer)} &middot; ${c.year}–${c.discontinued || '?'}</div>
    <div class="platform-card-count">${escapeHtml(c.unitsSold || 'Unknown units')}</div>
    <p class="platform-card-desc">${escapeHtml(c.description)}</p>
  </a>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Failed Consoles – Bosnan</title><meta name="description" content="Postmortems on the consoles that didn't make it: Atari Jaguar, 3DO, Virtual Boy, Philips CD-i, Sega 32X and more."><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${nav('failed-consoles')}<section class="platforms-hero"><h1>Failed Consoles</h1><p>The hardware that history passed by</p></section><div class="platforms-grid">${cards}</div>${toggleScript()}</body></html>`;
}

function failedConsoleDetailPage(item) {
  const goodGames = gameLinkList(item.goodGames);
  const facts = (item.keyFacts || []).map(f => `<li>${escapeHtml(f)}</li>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escapeHtml(item.name)} – Failed Consoles – Bosnan</title><meta name="description" content="${metaDesc(item.description)}"><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${nav('failed-consoles')}<div class="platform-detail-wrapper"><a href="/failed-consoles" class="back-link">&#8592; All Failed Consoles</a><div class="platform-detail-header"><h1>${escapeHtml(item.name)}</h1><p class="platform-detail-era">${escapeHtml(item.manufacturer)} &middot; ${item.year}–${item.discontinued || '?'} &middot; ${escapeHtml(item.unitsSold || 'Unknown units sold')}</p><p class="platform-detail-desc">${escapeHtml(item.description)}</p><div class="platform-detail-desc">${paragraphs(item.longDescription)}</div>${goodGames ? `<div class="dev-notable"><strong>Worth Playing:</strong><ul class="trivia-list">${goodGames}</ul></div>` : ''}${facts ? `<div class="dev-notable"><strong>Key Facts:</strong><ul class="trivia-list">${facts}</ul></div>` : ''}${item.verdict ? `<div class="dev-notable" style="margin-top:1rem"><strong>Verdict:</strong> ${escapeHtml(item.verdict)}</div>` : ''}</div>${sourcesBlock(item)}${relatedBlock(item)}</div>${toggleScript()}</body></html>`;
}

function gameEnginesListPage() {
  const cards = GAME_ENGINES.map(e => `<a href="/game-engines/${e.id}" class="platform-card">
    <div class="platform-card-name">${escapeHtml(e.name)}</div>
    <div class="platform-card-era">${escapeHtml(e.developer)} &middot; ${e.year}${e.language ? ' &middot; ' + escapeHtml(e.language) : ''}</div>
    <p class="platform-card-desc">${escapeHtml(e.description)}</p>
  </a>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Game Engines – Bosnan</title><meta name="description" content="The engines that powered retro gaming: Doom engine, Quake, Build Engine, SCUMM, GoldSrc and more."><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${nav('game-engines')}<section class="platforms-hero"><h1>Game Engines</h1><p>The technology that made the games possible</p></section><div class="platforms-grid">${cards}</div>${toggleScript()}</body></html>`;
}

function gameEngineDetailPage(item) {
  const games = gameLinkList(item.notableGames);
  const facts = (item.keyFacts || []).map(f => `<li>${escapeHtml(f)}</li>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escapeHtml(item.name)} – Game Engines – Bosnan</title><meta name="description" content="${metaDesc(item.description)}"><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${nav('game-engines')}<div class="platform-detail-wrapper"><a href="/game-engines" class="back-link">&#8592; All Game Engines</a><div class="platform-detail-header"><h1>${escapeHtml(item.name)}</h1><p class="platform-detail-era">${escapeHtml(item.developer)} &middot; ${item.year} &middot; ${escapeHtml(item.era)}${item.language ? ' &middot; ' + escapeHtml(item.language) : ''}</p><p class="platform-detail-desc">${escapeHtml(item.description)}</p><div class="platform-detail-desc">${paragraphs(item.longDescription)}</div>${games ? `<div class="dev-notable"><strong>Notable Games:</strong><ul class="trivia-list">${games}</ul></div>` : ''}${facts ? `<div class="dev-notable"><strong>Key Facts:</strong><ul class="trivia-list">${facts}</ul></div>` : ''}</div>${sourcesBlock(item)}</div>${toggleScript()}</body></html>`;
}

function soundChipsListPage() {
  const cards = SOUND_CHIPS.map(c => `<a href="/sound-chips/${c.id}" class="platform-card">
    <div class="platform-card-name">${escapeHtml(c.name)}</div>
    <div class="platform-card-era">${escapeHtml(c.manufacturer)} &middot; ${c.year}${c.voices ? ' &middot; ' + c.voices + ' voices' : ''}</div>
    <div class="platform-card-count">${(c.foundIn || []).slice(0, 3).map(p => escapeHtml(p)).join(', ')}</div>
    <p class="platform-card-desc">${escapeHtml(c.description)}</p>
  </a>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Sound Chips – Bosnan</title><meta name="description" content="The silicon that made the music: SID, YM2612, SPC700, OPL2, Paula and the chips that defined retro game audio."><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${nav('sound-chips')}<section class="platforms-hero"><h1>Sound Chips</h1><p>The hardware that made the music of a generation</p></section><div class="platforms-grid">${cards}</div>${toggleScript()}</body></html>`;
}

function soundChipDetailPage(item) {
  const platforms = (item.foundIn || []).map(p => `<li>${escapeHtml(p)}</li>`).join('');
  const tracks = gameLinkList(item.notableTracks);
  const facts = (item.keyFacts || []).map(f => `<li>${escapeHtml(f)}</li>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escapeHtml(item.name)} – Sound Chips – Bosnan</title><meta name="description" content="${metaDesc(item.description)}"><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${nav('sound-chips')}<div class="platform-detail-wrapper"><a href="/sound-chips" class="back-link">&#8592; All Sound Chips</a><div class="platform-detail-header"><h1>${escapeHtml(item.name)}</h1><p class="platform-detail-era">${escapeHtml(item.manufacturer)} &middot; ${item.year} &middot; ${escapeHtml(item.era)}${item.voices ? ' &middot; ' + item.voices + ' voices' : ''}</p><p class="platform-detail-desc">${escapeHtml(item.description)}</p><div class="platform-detail-desc">${paragraphs(item.longDescription)}</div>${platforms ? `<div class="dev-notable"><strong>Found In:</strong><ul class="trivia-list">${platforms}</ul></div>` : ''}${tracks ? `<div class="dev-notable"><strong>Iconic Tracks:</strong><ul class="trivia-list">${tracks}</ul></div>` : ''}${facts ? `<div class="dev-notable"><strong>Key Facts:</strong><ul class="trivia-list">${facts}</ul></div>` : ''}</div>${sourcesBlock(item)}</div>${toggleScript()}</body></html>`;
}

function easterEggsListPage() {
  const cards = EASTER_EGGS.map(e => `<a href="/easter-eggs/${e.id}" class="platform-card">
    <div class="platform-card-name">${escapeHtml(e.title)}</div>
    <div class="platform-card-era">${escapeHtml(e.game)} &middot; ${escapeHtml(e.platform)} &middot; ${e.year}</div>
    <p class="platform-card-desc">${escapeHtml(e.description)}</p>
  </a>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Easter Eggs – Bosnan</title><meta name="description" content="Hidden secrets in retro games: the first-ever Easter egg in Adventure, the Konami Code, Doom's id room, GoldenEye paintball mode and more."><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${nav('easter-eggs')}<section class="platforms-hero"><h1>Easter Eggs</h1><p>Hidden secrets, developer jokes, and undocumented features</p></section><div class="platforms-grid">${cards}</div>${toggleScript()}</body></html>`;
}

function easterEggDetailPage(item) {
  const facts = (item.keyFacts || []).map(f => `<li>${escapeHtml(f)}</li>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escapeHtml(item.title)} – Easter Eggs – Bosnan</title><meta name="description" content="${metaDesc(item.description)}"><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${nav('easter-eggs')}<div class="platform-detail-wrapper"><a href="/easter-eggs" class="back-link">&#8592; All Easter Eggs</a><div class="platform-detail-header"><h1>${escapeHtml(item.title)}</h1><p class="platform-detail-era">${escapeHtml(item.game)} &middot; ${escapeHtml(item.platform)} &middot; ${item.year}${item.discoveredYear && item.discoveredYear !== item.year ? ' &middot; discovered ' + item.discoveredYear : ''}</p><p class="platform-detail-desc">${escapeHtml(item.description)}</p><div class="platform-detail-desc">${paragraphs(item.longDescription)}</div>${item.howToFind ? `<div class="dev-notable" style="border-left:3px solid var(--accent);padding-left:1rem;margin-top:1rem"><strong>How to find it:</strong><p style="margin-top:0.4rem;color:var(--text-secondary)">${escapeHtml(item.howToFind)}</p></div>` : ''}${facts ? `<div class="dev-notable"><strong>Key Facts:</strong><ul class="trivia-list">${facts}</ul></div>` : ''}</div>${sourcesBlock(item)}${relatedBlock(item)}</div>${toggleScript()}</body></html>`;
}

function cheatCodesListPage() {
  const cards = CHEAT_CODES.map(c => `<a href="/cheat-codes/${c.id}" class="platform-card">
    <div class="platform-card-name">${escapeHtml(c.title)}</div>
    <div class="platform-card-era">${escapeHtml(c.game)} &middot; ${escapeHtml(c.platform)} &middot; ${c.year}</div>
    <div class="platform-card-count" style="font-family:monospace;font-size:0.8em;color:var(--accent)">${escapeHtml(c.code)}</div>
    <p class="platform-card-desc">${escapeHtml(c.effect)}</p>
  </a>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Cheat Codes – Bosnan</title><meta name="description" content="Classic cheat codes from retro gaming: Konami Code, IDDQD, ABACABB, Justin Bailey and more."><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${nav('cheat-codes')}<section class="platforms-hero"><h1>Cheat Codes</h1><p>The codes that became part of gaming folklore</p></section><div class="platforms-grid">${cards}</div>${toggleScript()}</body></html>`;
}

function cheatCodeDetailPage(item) {
  const facts = (item.keyFacts || []).map(f => `<li>${escapeHtml(f)}</li>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escapeHtml(item.title)} – Cheat Codes – Bosnan</title><meta name="description" content="${metaDesc(`${item.effect} — the ${item.code} cheat for ${item.game} on ${item.platform} (${item.year}), with how it was found and what it does.`)}"><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${nav('cheat-codes')}<div class="platform-detail-wrapper"><a href="/cheat-codes" class="back-link">&#8592; All Cheat Codes</a><div class="platform-detail-header"><h1>${escapeHtml(item.title)}</h1><p class="platform-detail-era">${escapeHtml(item.game)} &middot; ${escapeHtml(item.platform)} &middot; ${item.year} &middot; ${escapeHtml(item.type)}</p><div style="background:var(--surface-1);border:1px solid var(--border);border-radius:6px;padding:1rem 1.5rem;margin:1rem 0;font-family:monospace;font-size:1.1em;letter-spacing:0.04em;color:var(--accent)">${escapeHtml(item.code)}</div><p class="platform-detail-desc"><strong>Effect:</strong> ${escapeHtml(item.effect)}</p><p class="platform-detail-desc">${escapeHtml(item.description)}</p>${item.history ? `<h2 class="cheat-history-heading">The Story Behind the Code</h2><div class="platform-detail-desc">${paragraphs(item.history)}</div>` : ''}${facts ? `<div class="dev-notable"><strong>Key Facts:</strong><ul class="trivia-list">${facts}</ul></div>` : ''}</div>${sourcesBlock(item)}${relatedBlock(item)}</div>${toggleScript()}</body></html>`;
}

function glossaryPage() {
  const letters = [...new Set(GLOSSARY.map(g => g.term[0].toUpperCase()))].sort();
  const alphaLinks = letters.map(l => `<a href="#letter-${l}" style="display:inline-flex;align-items:center;justify-content:center;min-width:40px;min-height:40px;background:var(--surface-2);border:1px solid var(--border);border-radius:var(--r-sm);font-size:var(--fs-sm);font-weight:600;color:var(--accent);text-decoration:none">${l}</a>`).join('');
  const alphaEntries = letters.map(l => {
    const terms = GLOSSARY.filter(g => g.term[0].toUpperCase() === l).sort((a, b) => a.term.localeCompare(b.term));
    const entries = terms.map(t => `<div style="margin-bottom:1.5rem" id="term-${escapeHtml(t.id)}"><div style="display:flex;align-items:baseline;gap:0.8rem;margin-bottom:0.4rem"><h3 style="margin:0;font-size:1.05em">${escapeHtml(t.term)}</h3><span style="font-size:var(--fs-xs);background:var(--surface-3);padding:0.15rem 0.5rem;border-radius:3px;color:var(--text-muted)">${escapeHtml(t.category)}</span></div><p style="color:var(--text-secondary);line-height:1.7;margin:0 0 0.4rem">${escapeHtml(t.definition)}</p>${(t.examples || []).length ? `<div style="font-size:0.85em;color:var(--text-muted)">e.g. ${t.examples.map(e => escapeHtml(e)).join(', ')}</div>` : ''}</div>`).join('');
    return `<div id="letter-${l}" style="margin-bottom:2rem"><h2 style="font-size:2em;color:var(--accent);margin-bottom:1rem">${l}</h2>${entries}</div>`;
  }).join('');
  // A glossary is not a CollectionPage of links, it is a set of definitions,
  // and schema.org has the exact type for it. Each term is addressed by the
  // `#term-<id>` anchor the list now carries, which is also what lets a search
  // engine deep-link a single definition rather than the whole page.
  const glossarySchema = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'DefinedTermSet',
    name: 'Retro Gaming Glossary',
    url: `${SITE_URL}/glossary`,
    hasDefinedTerm: GLOSSARY.map(t => ({
      '@type': 'DefinedTerm',
      '@id': `${SITE_URL}/glossary#term-${t.id}`,
      name: t.term,
      description: t.definition,
      inDefinedTermSet: `${SITE_URL}/glossary`,
    })),
  }).replace(/</g, '\\u003c');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Glossary – Bosnan</title><meta name="description" content="Retro gaming terminology explained: SHMUP, Metroidvania, roguelike, chiptune, blast processing, Mode 7 and more."><script type="application/ld+json">${glossarySchema}</script><style>h1,h2,h3{font-family:inherit}</style>${cssHead()}</head><body>${nav('glossary')}<div class="essay-wrapper"><div class="essay-header"><h1 class="essay-title">Glossary</h1><p class="essay-subtitle">${GLOSSARY.length} retro gaming terms defined</p></div><div style="display:flex;flex-wrap:wrap;gap:0.4rem;margin-bottom:2rem">${alphaLinks}</div>${alphaEntries}</div>${toggleScript()}</body></html>`;
}

function quizPage() {
  const pool = [];
  for (const g of games.slice(0, 200)) {
    if (g.developer) pool.push({ q: `Who developed <strong>${escapeHtml(g.title)}</strong>?`, a: g.developer, distractors: games.filter(x => x.developer !== g.developer && x.developer).map(x => x.developer).filter((v, i, a) => a.indexOf(v) === i).sort(() => Math.random() - 0.5).slice(0, 3) });
    if (g.year) pool.push({ q: `What year was <strong>${escapeHtml(g.title)}</strong> released?`, a: String(g.year), distractors: [String(g.year - 2), String(g.year - 1), String(g.year + 1)].sort(() => Math.random() - 0.5) });
    if (g.platform) pool.push({ q: `On which platform was <strong>${escapeHtml(g.title)}</strong> originally released?`, a: g.platform, distractors: games.filter(x => x.platform !== g.platform).map(x => x.platform).filter((v, i, a) => a.indexOf(v) === i).sort(() => Math.random() - 0.5).slice(0, 3) });
  }
  const questions = pool.sort(() => Math.random() - 0.5).slice(0, 10).map((item, i) => {
    const choices = [...item.distractors, item.a].sort(() => Math.random() - 0.5);
    const btns = choices.map(c => `<button onclick="answer(this,'${escapeHtml(item.a.replace(/'/g, "\\'"))}','${escapeHtml(c.replace(/'/g, "\\'"))}')" style="display:block;width:100%;text-align:left;background:var(--surface-2);border:1px solid var(--border-strong);color:var(--text);padding:0.7rem 1rem;border-radius:5px;cursor:pointer;font-size:0.95em;margin-bottom:0.4rem">${escapeHtml(c)}</button>`).join('');
    return `<div class="quiz-question" id="q${i}" style="display:${i === 0 ? 'block' : 'none'};margin-bottom:1rem"><p style="font-size:1.1em;margin-bottom:1rem">${i + 1}/10 &mdash; ${item.q}</p>${btns}</div>`;
  }).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Trivia Quiz – Bosnan</title><meta name="description" content="Ten randomised trivia questions on classic games, consoles and the people who made them, drawn from the Bosnan retro archive. New questions every visit."><style>h1,h2{font-family:inherit}.quiz-btn-correct{background:rgba(76,175,80,0.3)!important;border-color:#4caf50!important}.quiz-btn-wrong{background:rgba(244,67,54,0.3)!important;border-color:#f44336!important}</style>${cssHead()}</head><body>${nav('quiz')}<div class="essay-wrapper"><div class="essay-header"><h1 class="essay-title">Trivia Quiz</h1><p class="essay-subtitle">10 random questions from the archive — refreshes each visit</p></div><div id="score" style="font-size:1.1em;margin-bottom:1.5rem;color:var(--text-muted)">Score: <span id="scoreVal">0</span> / <span id="total">0</span></div>${questions}<div id="result" style="display:none;margin-top:2rem;text-align:center"><h2 id="resultMsg"></h2><a href="/quiz" style="display:inline-block;margin-top:1rem;background:var(--accent);color:var(--on-accent);padding:0.6rem 1.5rem;border-radius:5px;font-weight:700;text-decoration:none">Play Again</a></div></div><script>let cur=0,score=0,answered=false;function answer(btn,correct,chosen){if(answered)return;answered=true;const btns=btn.parentElement.querySelectorAll('button');btns.forEach(b=>{b.disabled=true;if(b.textContent.trim()===correct)b.classList.add('quiz-btn-correct');});if(chosen===correct){score++;btn.classList.add('quiz-btn-correct');}else{btn.classList.add('quiz-btn-wrong');}document.getElementById('scoreVal').textContent=score;document.getElementById('total').textContent=cur+1;setTimeout(()=>nextQ(),900);}function nextQ(){const qs=document.querySelectorAll('.quiz-question');if(cur<qs.length-1){qs[cur].style.display='none';cur++;qs[cur].style.display='block';answered=false;}else{document.querySelectorAll('.quiz-question').forEach(q=>q.style.display='none');const r=document.getElementById('result');r.style.display='block';const pct=Math.round(score/qs.length*100);document.getElementById('resultMsg').textContent=score+'/'+qs.length+' — '+pct+'%';}}</script>${toggleScript()}</body></html>`;
}

function onThisDayPage() {
  const now = new Date();
  const month = now.getMonth() + 1;
  const day = now.getDate();
  const notableDates = [
    { month: 7, day: 15, year: 1983, title: 'Famicom launches in Japan', desc: 'Nintendo releases the Family Computer (Famicom) in Japan at ¥14,800.' },
    { month: 10, day: 18, year: 1985, title: 'NES launches in North America', desc: 'Nintendo launches the NES in New York City, bundled with Super Mario Bros.' },
    { month: 1, day: 14, year: 1990, title: 'Game Boy launches in Europe', desc: 'Nintendo\'s Game Boy hits European shelves, completing its worldwide rollout.' },
    { month: 8, day: 23, year: 1991, title: 'Super Nintendo launches in North America', desc: 'The SNES arrives in the US at $199.99 bundled with Super Mario World.' },
    { month: 6, day: 23, year: 1991, title: 'Sonic the Hedgehog releases', desc: 'Sega releases Sonic the Hedgehog for the Mega Drive/Genesis — the character who would define the 16-bit console war.' },
    { month: 10, day: 1, year: 1990, title: 'Super Famicom launches in Japan', desc: 'Nintendo\'s 16-bit console sells 300,000 units on its first day, causing a temporary ban on weekday launches.' },
    { month: 12, day: 10, year: 1993, title: 'Doom is released', desc: 'id Software releases Doom as shareware on the internet, changing PC gaming forever.' },
    { month: 12, day: 3, year: 1994, title: 'PlayStation launches in Japan', desc: 'Sony\'s first gaming console launches in Japan at ¥39,800, beginning the CD-ROM era of console gaming.' },
    { month: 9, day: 9, year: 1995, title: 'Saturn and PlayStation launch in North America', desc: 'Sega Saturn surprise-launches at $399; Sony PlayStation launches at $299 — a $100 gap that proved decisive.' },
    { month: 9, day: 29, year: 1996, title: 'Nintendo 64 launches in North America', desc: 'The N64 sells 350,000 units on its first day in North America with Super Mario 64.' },
    { month: 11, day: 21, year: 1998, title: 'Zelda: Ocarina of Time releases', desc: 'The Legend of Zelda: Ocarina of Time launches — widely considered one of the greatest games ever made.' },
    { month: 11, day: 27, year: 1997, title: 'Final Fantasy VII launches in North America', desc: 'Square\'s Final Fantasy VII arrives in North America, introducing millions of Western players to JRPGs.' },
    { month: 7, day: 21, year: 1989, title: 'Game Boy launches in North America', desc: 'Nintendo\'s Game Boy goes on sale in the US at $89.99 bundled with Tetris, selling 40,000 units on its first day.' },
    { month: 10, day: 26, year: 1985, title: 'Super Mario Bros. releases', desc: 'Nintendo releases Super Mario Bros. for the Famicom in Japan, establishing the template for platform games.' },
    { month: 4, day: 5, year: 1992, title: 'Mortal Kombat hits arcades', desc: 'Midway releases Mortal Kombat in arcades, sparking the violence-in-games debate that created the ESRB.' },
    { month: 1, day: 8, year: 1994, title: 'ESRB is announced', desc: 'The Entertainment Software Rating Board is announced, with ratings appearing on games from September 1994.' },
    { month: 11, day: 22, year: 1987, title: 'Final Fantasy releases in Japan', desc: 'Square releases the first Final Fantasy for the Famicom, a last-ditch effort that saved the company.' },
    { month: 2, day: 7, year: 1986, title: 'The Legend of Zelda releases in Japan', desc: 'Nintendo releases Zelda no Densetsu for the Famicom Disk System, establishing open-world adventure gaming.' },
    { month: 9, day: 13, year: 1985, title: 'Super Mario Bros. releases in Japan', desc: 'Nintendo releases the most commercially successful game of its era for the Famicom.' },
    { month: 10, day: 31, year: 1988, title: 'Mega Drive launches in Japan', desc: 'Sega releases the Mega Drive (later Genesis) in Japan at ¥21,000, beginning the 16-bit era.' },
  ];
  const todayEvents = notableDates.filter(e => e.month === month && e.day === day);
  const monthEvents = notableDates.filter(e => e.month === month).sort((a, b) => a.day - b.day);
  const monthName = ['January','February','March','April','May','June','July','August','September','October','November','December'][month - 1];
  const recentGames = games.filter(g => {
    const yearMod = (g.year % 10);
    return true;
  }).filter(g => g.year % 12 === (month % 12)).slice(0, 8);
  const todayHtml = todayEvents.length ? `<div style="background:var(--accent-soft);border:1px solid var(--accent);border-radius:8px;padding:1.5rem;margin-bottom:2rem">${todayEvents.map(e => `<div><div style="font-size:1.2em;font-weight:700;margin-bottom:0.4rem">${e.title} (${e.year})</div><p style="color:var(--text-secondary);margin:0">${escapeHtml(e.desc)}</p></div>`).join('<hr style="border-color:var(--border);margin:1rem 0">')}</div>` : `<p style="color:var(--text-muted);margin-bottom:2rem">No notable gaming events recorded for ${monthName} ${day} specifically — but here's what happened in ${monthName}:</p>`;
  const monthHtml = monthEvents.map(e => `<div style="display:grid;grid-template-columns:2.5rem 1fr;gap:0.8rem;padding:0.8rem 0;border-bottom:1px solid var(--surface-3)"><div style="font-weight:700;color:var(--accent);padding-top:0.1rem">${e.day}</div><div><div style="font-weight:600">${escapeHtml(e.title)} <span style="color:var(--text-muted);font-weight:400">(${e.year})</span></div><div style="color:var(--text-secondary);font-size:0.9em;margin-top:0.2rem">${escapeHtml(e.desc)}</div></div></div>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>On This Day – Bosnan</title><meta name="description" content="Video game history that happened on ${monthName} ${day} — console launches, landmark releases and industry milestones from the Bosnan retro archive."><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${nav('on-this-day')}<div class="essay-wrapper"><div class="essay-header"><h1 class="essay-title">On This Day</h1><p class="essay-subtitle">${monthName} ${day} in gaming history</p></div>${todayHtml}${monthEvents.length ? `<h2 style="margin-bottom:1rem">All of ${monthName}</h2>${monthHtml}` : ''}</div>${toggleScript()}</body></html>`;
}

function studioMapPage() {
  const studios = [
    { name: 'Nintendo HQ', city: 'Kyoto, Japan', x: 78, y: 38, desc: 'Founded 1889 as a playing card company. Home of Mario, Zelda, Metroid.' },
    { name: 'Sega (Ōta)', city: 'Tokyo, Japan', x: 79, y: 37, desc: 'Originally Service Games. Sonic, Streets of Rage, Virtua Fighter.' },
    { name: 'Capcom', city: 'Osaka, Japan', x: 77, y: 38, desc: 'Street Fighter, Mega Man, Resident Evil, Devil May Cry.' },
    { name: 'Konami (Kobe)', city: 'Kobe, Japan', x: 77, y: 38, desc: 'Castlevania, Metal Gear, Contra, Silent Hill.' },
    { name: 'Square (Osaka)', city: 'Osaka, Japan', x: 77, y: 38, desc: 'Final Fantasy, Chrono Trigger, Secret of Mana.' },
    { name: 'Namco (Tokyo)', city: 'Tokyo, Japan', x: 79, y: 37, desc: 'Pac-Man, Galaga, Ridge Racer, Tekken.' },
    { name: 'id Software', city: 'Mesquite, TX, USA', x: 22, y: 38, desc: 'Wolfenstein 3D, Doom, Quake. Founded by Carmack and Romero.' },
    { name: 'LucasArts', city: 'San Rafael, CA, USA', x: 12, y: 35, desc: 'Monkey Island, Grim Fandango, Day of the Tentacle. SCUMM engine.' },
    { name: 'Atari (original)', city: 'Sunnyvale, CA, USA', x: 12, y: 36, desc: 'Pong, Asteroids, the Atari 2600. Founded by Nolan Bushnell 1972.' },
    { name: 'Blizzard (original)', city: 'Irvine, CA, USA', x: 13, y: 37, desc: 'Warcraft, StarCraft, Diablo. Founded 1991 as Silicon & Synapse.' },
    { name: 'Electronic Arts', city: 'Redwood City, CA, USA', x: 12, y: 35, desc: 'First third-party publisher to credit game developers. Trip Hawkins 1982.' },
    { name: 'Bullfrog Productions', city: 'Guildford, UK', x: 47, y: 28, desc: 'Populous, Theme Park, Dungeon Keeper. Peter Molyneux.' },
    { name: 'Rare', city: 'Twycross, UK', x: 47, y: 27, desc: 'Donkey Kong Country, Goldeneye 007, Banjo-Kazooie. Stamper brothers.' },
    { name: 'DMA Design (Rockstar North)', city: 'Dundee, Scotland', x: 46, y: 24, desc: 'Lemmings, GTA series. Founded 1987 by David Jones.' },
    { name: 'Remedy Entertainment', city: 'Espoo, Finland', x: 52, y: 20, desc: 'Death Rally, Max Payne, Alan Wake.' },
    { name: 'Bitmap Brothers', city: 'London, UK', x: 47, y: 28, desc: 'Speedball 2, The Chaos Engine, Gods. Amiga era style icons.' },
    { name: 'Origin Systems', city: 'Austin, TX, USA', x: 22, y: 40, desc: 'Ultima, Wing Commander. Richard Garriott. Acquired by EA 1992.' },
    { name: 'Looking Glass Studios', city: 'Cambridge, MA, USA', x: 30, y: 32, desc: 'System Shock, Thief, Ultima Underworld. Immersive sim pioneers.' },
    { name: 'Irrational Games', city: 'Boston, MA, USA', x: 30, y: 32, desc: 'System Shock 2, BioShock. Ken Levine. Looking Glass alumni.' },
    { name: 'SNK', city: 'Osaka, Japan', x: 77, y: 38, desc: 'Neo Geo, Metal Slug, King of Fighters, Samurai Shodown.' },
  ];

  const dots = studios.map((s, i) => `<g class="studio-dot" style="cursor:pointer" onclick="showStudio(${i})">
    <circle cx="${s.x}%" cy="${s.y}%" r="6" fill="var(--accent)" stroke="#000" stroke-width="1.5" opacity="0.9"/>
    <title>${escapeHtml(s.name)}</title>
  </g>`).join('');

  const studioData = JSON.stringify(studios);

  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Studio Map – Bosnan</title><meta name="description" content="World map of iconic retro game studios: Nintendo in Kyoto, id Software in Texas, Rare in the UK, DMA Design in Dundee."><style>h1,h2{font-family:inherit}.studio-dot circle:hover{r:9;opacity:1}</style>${cssHead()}</head><body>${nav('map')}<div class="essay-wrapper"><div class="essay-header"><h1 class="essay-title">Studio Map</h1><p class="essay-subtitle">Where the games were made — ${studios.length} iconic studios</p></div><div style="position:relative;background:var(--surface-1);border:1px solid var(--border);border-radius:8px;overflow:hidden;margin-bottom:2rem"><svg viewBox="0 0 100 60" style="width:100%;display:block;background:linear-gradient(180deg,#0a1628 0%,#1a2a1a 100%)">
  <!-- Simplified continent outlines -->
  <!-- North America -->
  <path d="M5,20 L25,18 L30,25 L28,40 L22,48 L15,50 L8,45 L5,35 Z" fill="#1e3a1e" stroke="#2a4a2a" stroke-width="0.3"/>
  <!-- South America -->
  <path d="M20,50 L30,48 L32,58 L25,60 L18,56 Z" fill="#1e3a1e" stroke="#2a4a2a" stroke-width="0.3"/>
  <!-- Europe -->
  <path d="M44,20 L55,18 L58,25 L54,30 L46,30 L43,25 Z" fill="#1e3a1e" stroke="#2a4a2a" stroke-width="0.3"/>
  <!-- Africa -->
  <path d="M46,32 L56,30 L60,45 L55,55 L47,55 L43,45 Z" fill="#1e3a1e" stroke="#2a4a2a" stroke-width="0.3"/>
  <!-- Asia -->
  <path d="M58,15 L90,12 L95,25 L90,35 L80,40 L70,38 L60,30 L56,22 Z" fill="#1e3a1e" stroke="#2a4a2a" stroke-width="0.3"/>
  <!-- Australia -->
  <path d="M78,45 L90,43 L92,52 L84,55 L76,52 Z" fill="#1e3a1e" stroke="#2a4a2a" stroke-width="0.3"/>
  ${dots}
</svg></div>
<div id="studioInfo" style="display:none;background:var(--accent-soft);border:1px solid var(--accent);border-radius:8px;padding:1.2rem 1.5rem;margin-bottom:1.5rem"><h2 id="studioName" style="margin:0 0 0.3rem"></h2><div id="studioCity" style="color:var(--text-muted);font-size:0.9em;margin-bottom:0.5rem"></div><p id="studioDesc" style="margin:0;color:var(--text-secondary)"></p></div>
<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:0.8rem">${studios.map((s, i) => `<div onclick="showStudio(${i})" style="background:var(--surface-1);border-radius:6px;padding:0.7rem 1rem;cursor:pointer;border:1px solid transparent" id="scard${i}"><div style="font-weight:600;font-size:0.9em">${escapeHtml(s.name)}</div><div style="color:var(--text-muted);font-size:0.8em">${escapeHtml(s.city)}</div></div>`).join('')}</div>
</div>
<script>const studios=${studioData};function showStudio(i){const s=studios[i];document.getElementById('studioInfo').style.display='block';document.getElementById('studioName').textContent=s.name;document.getElementById('studioCity').textContent=s.city;document.getElementById('studioDesc').textContent=s.desc;document.querySelectorAll('[id^="scard"]').forEach(el=>el.style.borderColor='transparent');document.getElementById('scard'+i).style.borderColor='var(--accent)';}</script>
${toggleScript()}</body></html>`;
}

function magazinesListPage() {
  const cards = MAGAZINES.map(m => `<a href="/magazines/${m.id}" class="platform-card">
    <div class="platform-card-name">${escapeHtml(m.name)}</div>
    <div class="platform-card-era">${escapeHtml(m.country)} &middot; ${m.founded}${m.closed ? '–' + m.closed : '–present'}</div>
    <p class="platform-card-desc">${escapeHtml(m.description)}</p>
  </a>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Gaming Magazines – Bosnan</title><meta name="description" content="Profiles of the gaming magazines that shaped the industry: EGM, Nintendo Power, Edge, Famitsu, GameFan, CVG and more."><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${nav('magazines')}<section class="platforms-hero"><h1>Gaming Magazines</h1><p>The print media that shaped a generation of players</p></section><div class="platforms-grid">${cards}</div>${toggleScript()}</body></html>`;
}

function magazineDetailPage(mag) {
  const issues = (mag.notableIssues || []).map(i => `<li>${escapeHtml(i)}</li>`).join('');
  const facts = (mag.keyFacts || []).map(f => `<li>${escapeHtml(f)}</li>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escapeHtml(mag.name)} – Magazines – Bosnan</title><meta name="description" content="${metaDesc(mag.description)}"><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${nav('magazines')}<div class="platform-detail-wrapper"><a href="/magazines" class="back-link">&#8592; All Magazines</a><div class="platform-detail-header"><h1>${escapeHtml(mag.name)}</h1><p class="platform-detail-era">${escapeHtml(mag.country)} &middot; ${mag.founded}${mag.closed ? '–' + mag.closed : '–present'}</p><p class="platform-detail-desc">${escapeHtml(mag.description)}</p><div class="platform-detail-desc">${paragraphs(mag.longDescription)}</div>${issues ? `<div class="dev-notable"><strong>Notable Issues:</strong><ul class="trivia-list">${issues}</ul></div>` : ''}${facts ? `<div class="dev-notable"><strong>Key Facts:</strong><ul class="trivia-list">${facts}</ul></div>` : ''}</div>${sourcesBlock(mag)}</div>${toggleScript()}</body></html>`;
}

function boxArtListPage() {
  const cards = BOX_ART.map(b => `<a href="/box-art/${b.id}" class="platform-card">
    <div class="platform-card-name">${escapeHtml(b.title)}</div>
    <div class="platform-card-era">${escapeHtml(b.platform)} &middot; ${b.year} &middot; ${escapeHtml(b.region)}</div>
    <p class="platform-card-desc">${escapeHtml(b.description)}</p>
  </a>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Box Art – Bosnan</title><meta name="description" content="Iconic retro game box art: the infamous Mega Man NES cover, Earthbound's oversized box, Castlevania, Contra, and more."><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${nav('box-art')}<section class="platforms-hero"><h1>Box Art</h1><p>The covers that launched a thousand arguments</p></section><div class="platforms-grid">${cards}</div>${toggleScript()}</body></html>`;
}

function boxArtDetailPage(entry) {
  const facts = (entry.keyFacts || []).map(f => `<li>${escapeHtml(f)}</li>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escapeHtml(entry.title)}${/\b(?:box|cover)\b/i.test(entry.title) ? '' : ' Box Art'} (${escapeHtml([entry.platform, entry.region, entry.year].filter(Boolean).join(', '))}) – Bosnan</title><meta name="description" content="${metaDesc(entry.description)}"><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${nav('box-art')}<div class="platform-detail-wrapper"><a href="/box-art" class="back-link">&#8592; All Box Art</a><div class="platform-detail-header"><h1>${escapeHtml(entry.title)}</h1><p class="platform-detail-era">${escapeHtml(entry.platform)} &middot; ${entry.year} &middot; ${escapeHtml(entry.region)}${entry.artist ? ' &middot; Art: ' + escapeHtml(entry.artist) : ''}</p><p class="platform-detail-desc">${escapeHtml(entry.description)}</p><div class="platform-detail-desc">${paragraphs(entry.longDescription)}</div>${facts ? `<div class="dev-notable"><strong>Key Facts:</strong><ul class="trivia-list">${facts}</ul></div>` : ''}</div>${sourcesBlock(entry)}</div>${toggleScript()}</body></html>`;
}

function portsListPage() {
  const cards = PORTS.map(p => `<a href="/ports/${p.id}" class="platform-card">
    <div class="platform-card-name">${escapeHtml(p.title)}</div>
    <div class="platform-card-era">${escapeHtml(p.originalPlatform)} &middot; ${p.year}</div>
    <div class="platform-card-count">${(p.versions || []).length} version${(p.versions || []).length !== 1 ? 's' : ''} compared</div>
    <p class="platform-card-desc">${escapeHtml(p.description)}</p>
  </a>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Port Comparisons – Bosnan</title><meta name="description" content="How retro games changed across platforms: Street Fighter II, Doom, Mortal Kombat, Pac-Man, Tetris and more compared version by version."><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${nav('ports')}<section class="platforms-hero"><h1>Port Comparisons</h1><p>How games changed — or didn't — on their journey to every platform</p></section><div class="platforms-grid">${cards}</div>${toggleScript()}</body></html>`;
}

function portDetailPage(port) {
  const qualityColor = { 'Excellent': '#a5d6a7', 'Good': '#c5e1a5', 'Acceptable': '#ffe082', 'Poor': '#ffab91', 'Infamous': '#ef9a9a' };
  const versionsHtml = (port.versions || []).map(v => `<div style="background:var(--surface-1);border-radius:6px;padding:1rem 1.2rem;margin-bottom:0.8rem"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.5rem"><strong>${escapeHtml(v.platform)} (${v.year})</strong><span style="background:${qualityColor[v.quality] || 'var(--text-muted)'};color:var(--on-accent);padding:0.2rem 0.6rem;border-radius:3px;font-size:var(--fs-xs);font-weight:700">${escapeHtml(v.quality)}</span></div><p style="color:var(--text-secondary);font-size:0.9em;line-height:1.6;margin:0">${escapeHtml(v.notes)}</p></div>`).join('');
  const facts = (port.keyFacts || []).map(f => `<li>${escapeHtml(f)}</li>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escapeHtml(port.title)} – Port Comparisons – Bosnan</title><meta name="description" content="${metaDesc(port.description)}"><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${nav('ports')}<div class="platform-detail-wrapper"><a href="/ports" class="back-link">&#8592; All Port Comparisons</a><div class="platform-detail-header"><h1>${escapeHtml(port.title)}</h1><p class="platform-detail-era">Original: ${escapeHtml(port.originalPlatform)} &middot; ${port.year}</p><p class="platform-detail-desc">${escapeHtml(port.description)}</p><div class="platform-detail-desc">${paragraphs(port.longDescription)}</div><h2 style="margin-top:1.5rem;margin-bottom:1rem">Version Breakdown</h2>${versionsHtml}${facts ? `<div class="dev-notable" style="margin-top:1rem"><strong>Key Facts:</strong><ul class="trivia-list">${facts}</ul></div>` : ''}</div>${sourcesBlock(port)}</div>${toggleScript()}</body></html>`;
}

function voiceActorsListPage() {
  const cards = VOICE_ACTORS.map(v => `<a href="/voice-actors/${v.id}" class="platform-card">
    <div class="platform-card-name">${escapeHtml(v.name)}</div>
    <div class="platform-card-era">${escapeHtml(v.nationality)} &middot; ${escapeHtml(v.era)}</div>
    <p class="platform-card-desc">${escapeHtml(v.description)}</p>
  </a>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Voice Actors – Bosnan</title><meta name="description" content="The voices of retro gaming: Charles Martinet, David Hayter, Cam Clarke, Jennifer Hale and the actors who defined iconic characters."><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${nav('voice-actors')}<section class="platforms-hero"><h1>Voice Actors</h1><p>The voices behind the characters</p></section><div class="platforms-grid">${cards}</div>${toggleScript()}</body></html>`;
}

function voiceActorDetailPage(va) {
  const roles = gameLinkList(va.notableRoles);
  const facts = (va.keyFacts || []).map(f => `<li>${escapeHtml(f)}</li>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escapeHtml(va.name)} – Voice Actors – Bosnan</title><meta name="description" content="${metaDesc(va.description)}"><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${nav('voice-actors')}<div class="platform-detail-wrapper"><a href="/voice-actors" class="back-link">&#8592; All Voice Actors</a><div class="platform-detail-header"><h1>${escapeHtml(va.name)}</h1><p class="platform-detail-era">${escapeHtml(va.nationality)}${va.born ? ' &middot; b. ' + va.born : ''} &middot; ${escapeHtml(va.era)}</p><p class="platform-detail-desc">${escapeHtml(va.description)}</p><div class="platform-detail-desc">${paragraphs(va.longDescription)}</div>${roles ? `<div class="dev-notable"><strong>Notable Roles:</strong><ul class="trivia-list">${roles}</ul></div>` : ''}${facts ? `<div class="dev-notable"><strong>Key Facts:</strong><ul class="trivia-list">${facts}</ul></div>` : ''}</div>${sourcesBlock(va)}</div>${toggleScript()}</body></html>`;
}

function pixelArtistsListPage() {
  const cards = PIXEL_ARTISTS.map(a => `<a href="/pixel-artists/${a.id}" class="platform-card">
    <div class="platform-card-name">${escapeHtml(a.name)}</div>
    <div class="platform-card-era">${escapeHtml(a.nationality)} &middot; ${escapeHtml(a.era)}</div>
    <p class="platform-card-desc">${escapeHtml(a.description)}</p>
  </a>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Pixel Artists – Bosnan</title><meta name="description" content="The pixel artists and visual designers of retro gaming: Yoshitaka Amano, Ken Sugimori, Naoto Ohshima, Yoji Shinkawa and more."><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${nav('pixel-artists')}<section class="platforms-hero"><h1>Pixel Artists</h1><p>The visual creators of retro gaming's iconic look</p></section><div class="platforms-grid">${cards}</div>${toggleScript()}</body></html>`;
}

function pixelArtistDetailPage(artist) {
  const work = gameLinkList(artist.notableWork);
  const facts = (artist.keyFacts || []).map(f => `<li>${escapeHtml(f)}</li>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escapeHtml(artist.name)} – Pixel Artists – Bosnan</title><meta name="description" content="${metaDesc(artist.description)}"><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${nav('pixel-artists')}<div class="platform-detail-wrapper"><a href="/pixel-artists" class="back-link">&#8592; All Pixel Artists</a><div class="platform-detail-header"><h1>${escapeHtml(artist.name)}</h1><p class="platform-detail-era">${escapeHtml(artist.nationality)}${artist.born ? ' &middot; b. ' + artist.born : ''} &middot; ${escapeHtml(artist.era)}</p><p class="platform-detail-desc">${escapeHtml(artist.description)}</p><div class="platform-detail-desc">${paragraphs(artist.longDescription)}</div>${work ? `<div class="dev-notable"><strong>Notable Work:</strong><ul class="trivia-list">${work}</ul></div>` : ''}${facts ? `<div class="dev-notable"><strong>Key Facts:</strong><ul class="trivia-list">${facts}</ul></div>` : ''}</div>${sourcesBlock(artist)}</div>${toggleScript()}</body></html>`;
}

function producersListPage() {
  const cards = PRODUCERS.map(p => `<a href="/producers/${p.id}" class="platform-card">
    <div class="platform-card-name">${escapeHtml(p.name)}</div>
    <div class="platform-card-era">${escapeHtml(p.role)} &middot; ${escapeHtml(p.company)} &middot; ${escapeHtml(p.era)}</div>
    <p class="platform-card-desc">${escapeHtml(p.description)}</p>
  </a>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Producers &amp; Executives – Bosnan</title><meta name="description" content="The business figures and producers who shaped retro gaming: Hiroshi Yamauchi, Minoru Arakawa, Tom Kalinske, Nolan Bushnell and more."><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${nav('producers')}<section class="platforms-hero"><h1>Producers &amp; Executives</h1><p>The business minds and decision-makers behind the games</p></section><div class="platforms-grid">${cards}</div>${toggleScript()}</body></html>`;
}

function producerDetailPage(prod) {
  const work = gameLinkList(prod.notableWork);
  const facts = (prod.keyFacts || []).map(f => `<li>${escapeHtml(f)}</li>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escapeHtml(prod.name)} – Producers – Bosnan</title><meta name="description" content="${metaDesc(prod.description)}"><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${nav('producers')}<div class="platform-detail-wrapper"><a href="/producers" class="back-link">&#8592; All Producers</a><div class="platform-detail-header"><h1>${escapeHtml(prod.name)}</h1><p class="platform-detail-era">${escapeHtml(prod.role)} &middot; ${escapeHtml(prod.company)}${prod.born ? ' &middot; b. ' + prod.born : ''} &middot; ${escapeHtml(prod.era)}</p><p class="platform-detail-desc">${escapeHtml(prod.description)}</p><div class="platform-detail-desc">${paragraphs(prod.longDescription)}</div>${work ? `<div class="dev-notable"><strong>Notable Work:</strong><ul class="trivia-list">${work}</ul></div>` : ''}${facts ? `<div class="dev-notable"><strong>Key Facts:</strong><ul class="trivia-list">${facts}</ul></div>` : ''}</div>${sourcesBlock(prod)}</div>${toggleScript()}</body></html>`;
}

function collectionsListPage() {
  const cards = COLLECTIONS.map(c => `<a href="/collections/${c.id}" class="platform-card">
    <div class="platform-card-name">${escapeHtml(c.title)}</div>
    <div class="platform-card-era">${escapeHtml(c.category)} &middot; ${(c.items || []).length} entries</div>
    <p class="platform-card-desc">${escapeHtml(c.description)}</p>
  </a>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Curated Lists – Bosnan</title><meta name="description" content="Curated editorial lists: most influential games, best soundtracks, hardest games, graphical milestones and more."><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${nav('collections')}<section class="platforms-hero"><h1>Curated Lists</h1><p>Editorial picks and ranked selections from the archive</p></section><div class="platforms-grid">${cards}</div>${toggleScript()}</body></html>`;
}

function collectionDetailPage(col) {
  const itemsHtml = (col.items || []).map(item => `<div style="display:grid;grid-template-columns:2.5rem 1fr;gap:0.8rem;align-items:start;padding:0.9rem 0;border-bottom:1px solid var(--surface-3)"><div style="font-size:1.5em;font-weight:900;color:var(--accent);text-align:center;padding-top:0.1rem">${item.rank}</div><div><div style="font-weight:700;margin-bottom:0.2rem">${escapeHtml(item.title)}</div><div style="color:var(--text-secondary);font-size:0.9em;line-height:1.5">${escapeHtml(item.note)}</div></div></div>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escapeHtml(col.title)} – Bosnan</title><meta name="description" content="${metaDesc(col.description)}"><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${nav('collections')}<div class="essay-wrapper"><a href="/collections" class="back-link">&#8592; All Lists</a><div class="essay-header"><div class="essay-meta">${escapeHtml(col.category)}</div><h1 class="essay-title">${escapeHtml(col.title)}</h1><p class="essay-subtitle">${escapeHtml(col.subtitle || col.description)}</p>${col.subtitle && col.description ? `<p class="platform-detail-desc">${escapeHtml(col.description)}</p>` : ''}</div><div style="margin-top:1rem">${itemsHtml}</div>${sourcesBlock(col)}</div>${toggleScript()}</body></html>`;
}

function statsPage() {
  const byPlatform = {};
  for (const g of games) { byPlatform[g.platform] = (byPlatform[g.platform] || 0) + 1; }
  const topPlatforms = Object.entries(byPlatform).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const byGenre = {};
  for (const g of games) { byGenre[g.genre] = (byGenre[g.genre] || 0) + 1; }
  const topGenres = Object.entries(byGenre).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const byDecade = {};
  for (const g of games) { byDecade[g.decade] = (byDecade[g.decade] || 0) + 1; }
  const playable = games.filter(g => g.playUrl).length;
  const statCard = (label, value, sub = '') => `<div style="background:var(--surface-1);border-radius:8px;padding:1.2rem 1.5rem;text-align:center"><div style="font-size:2.5em;font-weight:900;color:var(--accent)">${value}</div><div style="font-weight:600;margin-top:0.3rem">${label}</div>${sub ? `<div style="font-size:0.85em;color:var(--text-muted);margin-top:0.2rem">${sub}</div>` : ''}</div>`;
  const barRow = (label, count, max) => `<div style="display:grid;grid-template-columns:160px 1fr 2.5rem;gap:0.8rem;align-items:center;margin-bottom:0.5rem"><span style="font-size:0.9em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(label)}</span><div style="background:var(--surface-3);border-radius:3px;height:8px;overflow:hidden"><div style="background:var(--accent);height:100%;width:${Math.round(count / max * 100)}%"></div></div><span style="font-size:0.85em;color:var(--text-muted);text-align:right">${count}</span></div>`;
  const totalEssays = ESSAYS.length;
  const totalSections = [PLATFORMS, DEVELOPERS, COMPOSERS, DESIGNERS, PUBLISHERS, ARCADE_BOARDS, PERIPHERALS, LOST_GAMES, MAGAZINES, BOX_ART, PORTS, VOICE_ACTORS, PIXEL_ARTISTS, PRODUCERS, COLLECTIONS, GENRES, FRANCHISES, HARDWARE, REGIONAL].reduce((s, a) => s + a.length, 0);
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Archive Stats – Bosnan</title><meta name="description" content="How the Bosnan retro archive breaks down: games per platform, genre and decade, plus totals for essays, playable titles and reference sections."><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${nav('stats')}<div class="essay-wrapper"><div class="essay-header"><h1 class="essay-title">Archive Stats</h1><p class="essay-subtitle">By the numbers</p></div><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:1rem;margin-bottom:2.5rem">${statCard('Games', games.length)}${statCard('Platforms', PLATFORMS.length)}${statCard('Essays', totalEssays)}${statCard('Playable', playable, 'with play link')}${statCard('Sections', totalSections, 'profiles & articles')}</div><div style="display:grid;grid-template-columns:1fr 1fr;gap:2rem;flex-wrap:wrap"><div><h2 style="margin-bottom:1rem">Top Platforms</h2>${topPlatforms.map(([p, c]) => barRow(p, c, topPlatforms[0][1])).join('')}</div><div><h2 style="margin-bottom:1rem">Top Genres</h2>${topGenres.map(([g, c]) => barRow(g, c, topGenres[0][1])).join('')}</div></div><div style="margin-top:2rem"><h2 style="margin-bottom:1rem">By Decade</h2><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:0.8rem">${Object.entries(byDecade).sort().map(([d, c]) => `<div style="background:var(--surface-1);border-radius:6px;padding:0.8rem 1rem;text-align:center"><div style="font-size:1.3em;font-weight:700;color:var(--accent)">${c}</div><div style="font-size:0.85em">${escapeHtml(d)}</div></div>`).join('')}</div></div></div>${toggleScript()}</body></html>`;
}

function recentPage() {
  const recentGames = [...games].sort((a, b) => b.year - a.year).slice(0, 48);
  const recentEssays = ESSAYS.slice(-12).reverse();
  const cardHtml = buildCardHtml(recentGames, EAGER_IMAGES);
  const essayLinks = recentEssays.map(e => `<a href="/essays/${e.id}" class="platform-card"><div class="platform-card-name">${escapeHtml(e.title)}</div><p class="platform-card-desc">${escapeHtml((e.summary || '').substring(0, 100))}</p></a>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Recently Added – Bosnan</title><meta name="description" content="The newest essays and games added to the Bosnan retro archive, listed newest first so you can see what has changed since your last visit."><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${nav('recent')}<section class="platforms-hero"><h1>Recently Added</h1><p>The newest content in the archive</p></section><h2 style="max-width:var(--content);margin:1.5rem auto 1rem;padding:0 var(--sp-5)">Latest Essays</h2><div class="platforms-grid">${essayLinks}</div><h2 style="max-width:var(--content);margin:2rem auto 1rem;padding:0 var(--sp-5)">Games by Year (Newest First)</h2><div class="games-grid">${cardHtml}</div>${toggleScript()}</body></html>`;
}

function timelinePage() {
  const events = [
    { year: 1958, title: 'Tennis for Two', desc: 'William Higinbotham creates one of the first interactive electronic games on an oscilloscope at Brookhaven National Laboratory.' },
    { year: 1962, title: 'Spacewar!', desc: 'MIT hackers create Spacewar!, the first widely influential video game, played on the PDP-1 mainframe.' },
    { year: 1971, title: 'Computer Space', desc: 'Nolan Bushnell and Ted Dabney launch Computer Space — the first commercially sold coin-operated video game.' },
    { year: 1972, title: 'Pong & Atari', desc: 'Atari is founded. Pong, the first commercially successful arcade game, launches and becomes a cultural phenomenon.' },
    { year: 1975, title: 'Home Pong', desc: 'Atari releases Home Pong, one of the first home video game consoles, selling 150,000 units through Sears.' },
    { year: 1977, title: 'Atari 2600', desc: 'The Atari 2600 launches, establishing the ROM cartridge as the standard for home consoles. Apple II also launches.' },
    { year: 1978, title: 'Space Invaders', desc: 'Taito\'s Space Invaders becomes a cultural phenomenon, causing a shortage of 100-yen coins in Japan.' },
    { year: 1979, title: 'Activision Founded', desc: 'Four Atari programmers leave to found Activision — the first independent third-party game publisher.' },
    { year: 1980, title: 'Pac-Man', desc: 'Namco\'s Pac-Man becomes the highest-grossing arcade game ever. Donkey Kong launches, introducing Mario.' },
    { year: 1981, title: 'Donkey Kong & IBM PC', desc: 'Donkey Kong launches in arcades. IBM releases the IBM PC, defining PC gaming for a decade.' },
    { year: 1982, title: 'Golden Age Peak', desc: 'US arcade revenue hits $8 billion. The Commodore 64 launches. The ZX Spectrum launches in the UK.' },
    { year: 1983, title: 'The Great Crash', desc: 'The North American video game market collapses. Atari\'s disastrous E.T. port is emblematic of the oversaturation crisis.' },
    { year: 1984, title: 'Tetris', desc: 'Alexey Pajitnov creates Tetris in the Soviet Union. Apple Macintosh launches. EA is founded by Trip Hawkins.' },
    { year: 1985, title: 'NES & Super Mario Bros.', desc: 'Nintendo launches the NES in North America alongside Super Mario Bros., reviving the US game industry.' },
    { year: 1986, title: 'Zelda & Sega', desc: 'The Legend of Zelda launches. Sega releases the Master System. Nintendo sells 1.1 million NES units in North America.' },
    { year: 1987, title: 'Final Fantasy & Metal Gear', desc: 'Square launches Final Fantasy and Konami launches Metal Gear — two franchises that define the next two decades.' },
    { year: 1988, title: 'Mega Drive & Game Boy', desc: 'Sega launches the Mega Drive (Genesis) in Japan. Nintendo\'s Game Boy launches the following year with Tetris.' },
    { year: 1989, title: 'Game Boy', desc: 'Nintendo\'s Game Boy launches with Tetris, selling 1 million units in the first week in the US alone.' },
    { year: 1990, title: 'SNES', desc: 'Super Nintendo launches in Japan. Super Mario World ships with the system. Sonic the Hedgehog launches on Mega Drive.' },
    { year: 1991, title: 'Sonic & Street Fighter II', desc: 'Sega\'s Sonic the Hedgehog outsells Mario. Street Fighter II becomes the highest-grossing arcade game of the era.' },
    { year: 1992, title: 'Mortal Kombat & SEGA CD', desc: 'Mortal Kombat\'s gore controversy leads directly to the creation of the ESRB content rating system.' },
    { year: 1993, title: 'Doom', desc: 'id Software releases Doom as shareware — it reaches more PCs than Microsoft Windows 95 in its first two years.' },
    { year: 1994, title: 'PlayStation & 32-bit Era', desc: 'Sony enters gaming with the PlayStation. Donkey Kong Country demonstrates pre-rendered 3D graphics on SNES.' },
    { year: 1995, title: 'PlayStation Launches Globally', desc: 'PlayStation launches in the US and Europe. Sega Saturn also launches but loses the race. Nintendo 64 is announced.' },
    { year: 1996, title: 'N64 & Super Mario 64', desc: 'Nintendo 64 launches with Super Mario 64 — widely considered the template for all 3D platformers.' },
    { year: 1997, title: 'Final Fantasy VII', desc: 'Final Fantasy VII on PlayStation brings JRPGs to a Western mainstream audience. GoldenEye 007 defines console FPS.' },
    { year: 1998, title: 'Zelda: Ocarina of Time', desc: 'The Legend of Zelda: Ocarina of Time launches to universal perfect scores, setting records that stood for years.' },
    { year: 1999, title: 'Dreamcast', desc: 'Sega\'s Dreamcast launches — ahead of its time with online play and an internal memory card. Sega\'s last console.' },
    { year: 2001, title: 'PS2 & GameCube & Xbox', desc: 'PlayStation 2 sells 150 million lifetime units. Nintendo releases GameCube. Microsoft enters gaming with Xbox.' },
  ];

  const eventsHtml = events.map((e, i) => `<div style="display:grid;grid-template-columns:5rem 1px 1fr;gap:0 1.5rem;align-items:start;padding-bottom:1.5rem"><div style="text-align:right;font-size:1.1em;font-weight:900;color:var(--accent);padding-top:0.15rem">${e.year}</div><div style="background:${i % 2 === 0 ? 'var(--accent)' : 'var(--border-strong)'};width:1px;min-height:100%;margin:0 auto"></div><div style="padding-bottom:0.5rem"><div style="font-weight:700;margin-bottom:0.3rem">${escapeHtml(e.title)}</div><div style="color:var(--text-secondary);font-size:0.9em;line-height:1.6">${escapeHtml(e.desc)}</div></div></div>`).join('');

  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Timeline – Bosnan</title><meta name="description" content="A year-by-year timeline of video game history from Tennis for Two in 1958 to the PlayStation 2 era, covering hardware launches and landmark releases."><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${nav('timeline')}<div class="essay-wrapper"><div class="essay-header"><h1 class="essay-title">Timeline</h1><p class="essay-subtitle">Gaming history from Spacewar! to the PS2 era — a chronological view</p></div><div style="margin-top:2rem">${eventsHtml}</div></div>${toggleScript()}</body></html>`;
}

function glitchesListPage() {
  const cards = GLITCHES.map(g => `<a href="/glitches/${g.id}" class="platform-card">
    <div class="platform-card-name">${escapeHtml(g.title)}</div>
    <div class="platform-card-era">${escapeHtml(g.game)} &middot; ${escapeHtml(g.platform)} &middot; ${g.year} &middot; ${escapeHtml(g.type)}</div>
    <p class="platform-card-desc">${escapeHtml(g.description)}</p>
  </a>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Notable Glitches – Bosnan</title><meta name="description" content="Bugs that became features — Rocket Jump, wavedash, BLJ, and the glitches that changed games."><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${nav('glitches')}<section class="platforms-hero"><h1>Notable Glitches</h1><p>Bugs that became beloved — exploits that communities adopted as features</p></section><div class="platforms-grid">${cards}</div>${toggleScript()}</body></html>`;
}

function glitchDetailPage(item) {
  return detailPage(item, {
    nav: 'glitches', slug: 'glitches', backLabel: 'All Glitches', suffix: 'Glitches', name: item.title,
    meta: `${escapeHtml(item.game)} &middot; ${escapeHtml(item.platform)} &middot; ${item.year} &middot; ${escapeHtml(item.type)}${item.discoveredBy && item.discoveredBy !== 'Unknown' ? ' &middot; Discovered by ' + escapeHtml(item.discoveredBy) : ''}`,
  });
}

function packagingListPage() {
  const cards = PACKAGING.map(p => `<a href="/packaging/${p.id}" class="platform-card">
    <div class="platform-card-name">${escapeHtml(p.title)}</div>
    <div class="platform-card-era">${escapeHtml(p.game)} &middot; ${escapeHtml(p.platform)} &middot; ${p.year}</div>
    <p class="platform-card-desc">${escapeHtml(p.description)}</p>
  </a>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Game Packaging &amp; Boxes – Bosnan</title><meta name="description" content="The art of the retail box before digital — Ultima feelies, NES black boxes, big-box PC epics."><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${nav('packaging')}<section class="platforms-hero"><h1>Game Packaging &amp; Boxes</h1><p>The retail box as artefact — from cloth maps and coins to three-disc jewel cases</p></section><div class="platforms-grid">${cards}</div>${toggleScript()}</body></html>`;
}

function packagingDetailPage(item) {
  return detailPage(item, {
    nav: 'packaging', slug: 'packaging', backLabel: 'All Packaging', suffix: 'Packaging', name: item.title,
    meta: `${escapeHtml(item.game)} &middot; ${escapeHtml(item.platform)} &middot; ${escapeHtml(item.publisher)} &middot; ${item.year}`,
    extra: `<p class="platform-detail-desc"><em>${escapeHtml(item.notableFor)}</em></p>`,
  });
}

function multiplayerListPage() {
  const cards = MULTIPLAYER.map(m => `<a href="/multiplayer/${m.id}" class="platform-card">
    <div class="platform-card-name">${escapeHtml(m.title)}</div>
    <div class="platform-card-era">${escapeHtml(m.game)} &middot; ${m.year} &middot; ${escapeHtml(m.type)} &middot; ${m.playerCount} players</div>
    <p class="platform-card-desc">${escapeHtml(m.description)}</p>
  </a>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Co-op &amp; Multiplayer Milestones – Bosnan</title><meta name="description" content="How multiplayer evolved from Pong to 4-player GoldenEye — the milestones that changed gaming together."><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${nav('multiplayer')}<section class="platforms-hero"><h1>Co-op &amp; Multiplayer Milestones</h1><p>How gaming together evolved — from two paddles on a screen to split-screen deathmatches</p></section><div class="platforms-grid">${cards}</div>${toggleScript()}</body></html>`;
}

function multiplayerDetailPage(item) {
  return detailPage(item, {
    nav: 'multiplayer', slug: 'multiplayer', backLabel: 'All Multiplayer Milestones', suffix: 'Multiplayer', name: item.title,
    meta: `${escapeHtml(item.game)} &middot; ${escapeHtml(item.platform)} &middot; ${item.year} &middot; ${item.playerCount} players &middot; ${escapeHtml(item.type)}`,
  });
}

function comicsListPage() {
  const cards = COMICS.map(c => `<a href="/comics/${c.id}" class="platform-card">
    <div class="platform-card-name">${escapeHtml(c.title)}</div>
    <div class="platform-card-era">${escapeHtml(c.franchise)} &middot; ${escapeHtml(c.publisher)} &middot; ${c.startYear}${c.issues ? ' &middot; ' + c.issues + ' issues' : ''}</div>
    <p class="platform-card-desc">${escapeHtml(c.description)}</p>
  </a>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Tie-in Comics – Bosnan</title><meta name="description" content="Game-based comics and manga — Sonic Archie, Nintendo Comics System, Pokémon Adventures, and more."><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${nav('comics')}<section class="platforms-hero"><h1>Tie-in Comics</h1><p>When games became sequential art — official comics, manga, and graphic novels</p></section><div class="platforms-grid">${cards}</div>${toggleScript()}</body></html>`;
}

function comicDetailPage(item) {
  return detailPage(item, {
    nav: 'comics', slug: 'comics', backLabel: 'All Comics', suffix: 'Comics', name: item.title,
    meta: `${escapeHtml(item.franchise)} &middot; ${escapeHtml(item.publisher)} &middot; From ${item.startYear}${item.issues ? ' &middot; ' + item.issues + ' issues' : ''}`,
    extra: `<p class="platform-detail-desc"><em>${escapeHtml(item.notableFor)}</em></p>`,
  });
}

function studiosListPage() {
  const cards = STUDIOS.map(s => `<a href="/studios/${s.id}" class="platform-card">
    <div class="platform-card-name">${escapeHtml(s.name)}</div>
    <div class="platform-card-era">Founded ${s.foundedYear} &middot; ${escapeHtml(s.location)} &middot; First: ${escapeHtml(s.firstGame)}</div>
    <p class="platform-card-desc">${escapeHtml(s.description)}</p>
  </a>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Studio Origin Stories – Bosnan</title><meta name="description" content="How the great game studios came to exist — garage startups, corporate rebellions, and dorm room legends."><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${nav('studios')}<section class="platforms-hero"><h1>Studio Origin Stories</h1><p>Dorm rooms, farmhouses, and corporate rebellions — how the great studios began</p></section><div class="platforms-grid">${cards}</div>${toggleScript()}</body></html>`;
}

function studioDetailPage(item) {
  return detailPage(item, {
    nav: 'studios', slug: 'studios', backLabel: 'All Studio Origins', suffix: 'Studio Origins', name: item.name,
    meta: `Founded ${item.foundedYear} &middot; ${escapeHtml(item.location)} &middot; Founders: ${escapeHtml(item.founders)} &middot; First game: ${escapeHtml(item.firstGame)}`,
  });
}

function importsListPage() {
  const cards = IMPORTS.map(i => `<a href="/imports/${i.id}" class="platform-card">
    <div class="platform-card-name">${escapeHtml(i.title)}</div>
    <div class="platform-card-era">${escapeHtml(i.game)} &middot; ${escapeHtml(i.platform)} &middot; ${escapeHtml(i.originalRegion)} &#8594; ${escapeHtml(i.targetRegion)}</div>
    <p class="platform-card-desc">${escapeHtml(i.description)}</p>
  </a>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Import Gaming Culture – Bosnan</title><meta name="description" content="Playing Japanese games before Western release — grey imports, converter carts, and the fax machine era."><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${nav('imports')}<section class="platforms-hero"><h1>Import Gaming Culture</h1><p>Playing Japanese releases before Western localisation — grey imports, converter carts, and obsession</p></section><div class="platforms-grid">${cards}</div>${toggleScript()}</body></html>`;
}

function importDetailPage(item) {
  return detailPage(item, {
    nav: 'imports', slug: 'imports', backLabel: 'All Import Stories', suffix: 'Imports', name: item.title,
    meta: `${escapeHtml(item.game)} &middot; ${escapeHtml(item.platform)} &middot; ${item.year} &middot; ${escapeHtml(item.originalRegion)} &#8594; ${escapeHtml(item.targetRegion)}`,
  });
}

function speedrunTechniquesListPage() {
  const cards = SPEEDRUN_TECHNIQUES.map(s => `<a href="/speedrun-techniques/${s.id}" class="platform-card">
    <div class="platform-card-name">${escapeHtml(s.title)}</div>
    <div class="platform-card-era">${escapeHtml(s.game)} &middot; ${escapeHtml(s.technique)}${s.timeSaved ? ' &middot; ' + escapeHtml(s.timeSaved) : ''}</div>
    <p class="platform-card-desc">${escapeHtml(s.description)}</p>
  </a>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Speedrun Techniques – Bosnan</title><meta name="description" content="The specific tricks that define competitive speedrunning — wrong warps, BLJ, wavedash, and more."><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${nav('speedrun-techniques')}<section class="platforms-hero"><h1>Speedrun Techniques</h1><p>The exploits and tricks that define competitive speedrunning — documented and explained</p></section><div class="platforms-grid">${cards}</div>${toggleScript()}</body></html>`;
}

function speedrunTechniqueDetailPage(item) {
  return detailPage(item, {
    nav: 'speedrun-techniques', slug: 'speedrun-techniques', backLabel: 'All Techniques', suffix: 'Speedrun Techniques', name: item.title,
    meta: `${escapeHtml(item.game)} &middot; ${escapeHtml(item.platform)} &middot; ${escapeHtml(item.technique)}${item.timeSaved ? ' &middot; Saves: ' + escapeHtml(item.timeSaved) : ''}${item.discoveredYear ? ' &middot; Documented: ' + item.discoveredYear : ''}`,
  });
}

function famousBugsListPage() {
  const impactColor = v => v === 'Beloved' ? '#4a9' : v === 'Data Loss' ? '#c66' : v === 'Industry-Changing' ? '#c8a44a' : '#888';
  const cards = FAMOUS_BUGS.map(b => `<a href="/famous-bugs/${b.id}" class="platform-card">
    <div class="platform-card-name">${escapeHtml(b.title)}</div>
    <div class="platform-card-era" style="color:${impactColor(b.impact)}">${escapeHtml(b.game)} &middot; ${b.year} &middot; ${escapeHtml(b.impact)}</div>
    <p class="platform-card-desc">${escapeHtml(b.description)}</p>
  </a>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Famous Bugs – Bosnan</title><meta name="description" content="Glitches that shaped history — the Minus World, Hall of Fame corruption, and bugs that changed gaming."><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${nav('famous-bugs')}<section class="platforms-hero"><h1>Famous Bugs</h1><p>Unintended code with outsized consequences — beloved, infamous, and industry-changing</p></section><div class="platforms-grid">${cards}</div>${toggleScript()}</body></html>`;
}

function famousBugDetailPage(item) {
  return detailPage(item, {
    nav: 'famous-bugs', slug: 'famous-bugs', backLabel: 'All Famous Bugs', suffix: 'Famous Bugs', name: item.title,
    meta: `${escapeHtml(item.game)} &middot; ${escapeHtml(item.platform)} &middot; ${item.year} &middot; Impact: ${escapeHtml(item.impact)}`,
  });
}

function retroRevivalListPage() {
  const cards = RETRO_REVIVAL.map(r => `<a href="/retro-revival/${r.id}" class="platform-card">
    <div class="platform-card-name">${escapeHtml(r.title)}</div>
    <div class="platform-card-era">${escapeHtml(r.developer)} &middot; ${r.year} &middot; Inspired by: ${escapeHtml(r.inspiredBy)}</div>
    <p class="platform-card-desc">${escapeHtml(r.description)}</p>
  </a>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Retro Revival Games – Bosnan</title><meta name="description" content="Modern games that channelled retro aesthetics deliberately — Cave Story, Shovel Knight, Undertale, and more."><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${nav('retro-revival')}<section class="platforms-hero"><h1>Retro Revival Games</h1><p>Modern games that deliberately channelled the retro era — and what they understood about it</p></section><div class="platforms-grid">${cards}</div>${toggleScript()}</body></html>`;
}

function retroRevivalDetailPage(item) {
  return detailPage(item, {
    nav: 'retro-revival', slug: 'retro-revival', backLabel: 'All Retro Revival', suffix: 'Retro Revival', name: item.title,
    meta: `${escapeHtml(item.developer)} &middot; ${escapeHtml(item.platform)} &middot; ${item.year} &middot; Inspired by: ${escapeHtml(item.inspiredBy)}`,
  });
}

function soundEffectsListPage() {
  const cards = SOUND_EFFECTS.map(s => `<a href="/sound-effects/${s.id}" class="platform-card">
    <div class="platform-card-name">${escapeHtml(s.title)}</div>
    <div class="platform-card-era">${escapeHtml(s.game)} &middot; ${escapeHtml(s.platform)} &middot; ${s.year} &middot; ${escapeHtml(s.sfxType)}</div>
    <p class="platform-card-desc">${escapeHtml(s.description)}</p>
  </a>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Iconic Sound Effects – Bosnan</title><meta name="description" content="The sounds that defined retro gaming — Mario's jump, Pac-Man's death, the Zelda item jingle."><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${nav('sound-effects')}<section class="platforms-hero"><h1>Iconic Sound Effects</h1><p>The sounds you can hear just by reading their names</p></section><div class="platforms-grid">${cards}</div>${toggleScript()}</body></html>`;
}

function soundEffectDetailPage(item) {
  return detailPage(item, {
    nav: 'sound-effects', slug: 'sound-effects', backLabel: 'All Sound Effects', suffix: 'Sound Effects', name: item.title,
    meta: `${escapeHtml(item.game)} &middot; ${escapeHtml(item.platform)} &middot; ${item.year} &middot; ${escapeHtml(item.sfxType)}${item.creator && item.creator !== 'Unknown' ? ' &middot; ' + escapeHtml(item.creator) : ''}`,
  });
}

function bossfightsListPage() {
  const cards = BOSSFIGHTS.map(b => `<a href="/bossfights/${b.id}" class="platform-card">
    <div class="platform-card-name">${escapeHtml(b.title)}</div>
    <div class="platform-card-era">${escapeHtml(b.bossName)} &middot; ${escapeHtml(b.game)} &middot; ${b.year} &middot; ${escapeHtml(b.type)}</div>
    <p class="platform-card-desc">${escapeHtml(b.description)}</p>
  </a>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Iconic Boss Fights – Bosnan</title><meta name="description" content="The most memorable boss encounters in retro gaming — Mike Tyson, Mother Brain, Psycho Mantis, and more."><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${nav('bossfights')}<section class="platforms-hero"><h1>Iconic Boss Fights</h1><p>The encounters that defined retro gaming — designed to challenge, surprise, and be remembered</p></section><div class="platforms-grid">${cards}</div>${toggleScript()}</body></html>`;
}

function bossfightDetailPage(item) {
  return detailPage(item, {
    nav: 'bossfights', slug: 'bossfights', backLabel: 'All Boss Fights', suffix: 'Boss Fights', name: item.title,
    meta: `${escapeHtml(item.bossName)} &middot; ${escapeHtml(item.game)} &middot; ${escapeHtml(item.platform)} &middot; ${item.year} &middot; ${escapeHtml(item.type)}`,
  });
}

function soundtracksListPage() {
  const cards = SOUNDTRACKS.map(s => `<a href="/soundtracks/${s.id}" class="platform-card">
    <div class="platform-card-name">${escapeHtml(s.title)}</div>
    <div class="platform-card-era">${escapeHtml(s.composer)} &middot; ${escapeHtml(s.platform)} &middot; ${s.year}</div>
    <p class="platform-card-desc">${escapeHtml(s.description)}</p>
  </a>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Game Soundtracks – Bosnan</title><meta name="description" content="Deep dives into the landmark game soundtracks — Nobuo Uematsu, Koji Kondo, David Wise, and more."><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${nav('soundtracks')}<section class="platforms-hero"><h1>Game Soundtracks</h1><p>The music that made retro games unforgettable</p></section><div class="platforms-grid">${cards}</div>${toggleScript()}</body></html>`;
}

function soundtrackDetailPage(item) {
  return detailPage(item, {
    nav: 'soundtracks', slug: 'soundtracks', backLabel: 'All Soundtracks', suffix: 'Soundtracks', name: item.title,
    meta: `${escapeHtml(item.composer)} &middot; ${escapeHtml(item.game)} &middot; ${escapeHtml(item.platform)} &middot; ${item.year}${item.trackCount ? ' &middot; ' + item.trackCount + ' tracks' : ''}`,
  });
}

function manualsListPage() {
  const cards = MANUALS.map(m => `<a href="/manuals/${m.id}" class="platform-card">
    <div class="platform-card-name">${escapeHtml(m.title)}</div>
    <div class="platform-card-era">${escapeHtml(m.game)} &middot; ${escapeHtml(m.platform)} &middot; ${m.year}${m.pageCount ? ' &middot; ' + m.pageCount + ' pages' : ''}</div>
    <p class="platform-card-desc">${escapeHtml(m.description)}</p>
  </a>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Instruction Manuals – Bosnan</title><meta name="description" content="The golden age of game manuals — booklets that built worlds before the game even loaded."><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${nav('manuals')}<section class="platforms-hero"><h1>Instruction Manuals</h1><p>The booklets that built worlds before you pressed Start</p></section><div class="platforms-grid">${cards}</div>${toggleScript()}</body></html>`;
}

function manualDetailPage(item) {
  return detailPage(item, {
    nav: 'manuals', slug: 'manuals', backLabel: 'All Manuals', suffix: 'Manuals', name: item.title,
    meta: `${escapeHtml(item.game)} &middot; ${escapeHtml(item.platform)} &middot; ${escapeHtml(item.publisher)} &middot; ${item.year}${item.pageCount ? ' &middot; ' + item.pageCount + ' pages' : ''}`,
    extra: `<p class="platform-detail-desc"><em>${escapeHtml(item.notableFor)}</em></p>`,
  });
}

function difficultyListPage() {
  const cards = DIFFICULTY.map(d => `<a href="/difficulty/${d.id}" class="platform-card">
    <div class="platform-card-name">${escapeHtml(d.title)}</div>
    <div class="platform-card-era">${escapeHtml(d.game)} &middot; ${escapeHtml(d.platform)} &middot; ${d.year} &middot; ${escapeHtml(d.difficultyType)}</div>
    <p class="platform-card-desc">${escapeHtml(d.description)}</p>
  </a>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Difficulty &amp; Hard Modes – Bosnan</title><meta name="description" content="The games that broke controllers and tested patience — Battletoads, Ghosts 'n Goblins, Ninja Gaiden, and more."><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${nav('difficulty')}<section class="platforms-hero"><h1>Difficulty &amp; Hard Modes</h1><p>The games that demanded everything — and gave no quarter</p></section><div class="platforms-grid">${cards}</div>${toggleScript()}</body></html>`;
}

function difficultyDetailPage(item) {
  return detailPage(item, {
    nav: 'difficulty', slug: 'difficulty', backLabel: 'All Difficulty Entries', suffix: 'Difficulty', name: item.title,
    meta: `${escapeHtml(item.game)} &middot; ${escapeHtml(item.platform)} &middot; ${item.year} &middot; ${escapeHtml(item.difficultyType)}`,
  });
}

function charactersListPage() {
  const cards = CHARACTERS.map(c => `<a href="/characters/${c.id}" class="platform-card">
    <div class="platform-card-name">${escapeHtml(c.name)}</div>
    <div class="platform-card-era">${escapeHtml(c.franchise)} &middot; ${escapeHtml(c.role)} &middot; ${c.debutYear}</div>
    <p class="platform-card-desc">${escapeHtml(c.description)}</p>
  </a>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Fictional Characters – Bosnan</title><meta name="description" content="Lore profiles for gaming's most iconic characters — Mario, Link, Samus, Sonic, Cloud, and more."><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${nav('characters')}<section class="platforms-hero"><h1>Fictional Characters</h1><p>The heroes, villains, and icons who defined retro gaming culture</p></section><div class="platforms-grid">${cards}</div>${toggleScript()}</body></html>`;
}

function characterDetailPage(item) {
  const abilities = (item.abilities || []).map(a => `<li>${escapeHtml(a)}</li>`).join('');
  return detailPage(item, {
    nav: 'characters', slug: 'characters', backLabel: 'All Characters', suffix: 'Characters', name: item.name,
    meta: `${escapeHtml(item.franchise)} &middot; ${escapeHtml(item.role)} &middot; Debut: ${item.debutYear} &middot; ${escapeHtml(item.platform)} &middot; Created by ${escapeHtml(item.creator)}`,
    extra: abilities ? `<div class="dev-notable"><strong>Abilities &amp; Traits:</strong><ul class="trivia-list">${abilities}</ul></div>` : '',
  });
}

function coverStoriesListPage() {
  const cards = COVER_STORIES.map(c => `<a href="/cover-stories/${c.id}" class="platform-card">
    <div class="platform-card-name">${escapeHtml(c.title)}</div>
    <div class="platform-card-era">${escapeHtml(c.magazine)} &middot; ${escapeHtml(c.issue)}</div>
    <p class="platform-card-desc">${escapeHtml(c.description)}</p>
  </a>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Cover Stories – Bosnan</title><meta name="description" content="Landmark gaming magazine covers and the moments that defined games journalism."><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${nav('cover-stories')}<section class="platforms-hero"><h1>Cover Stories</h1><p>The magazine covers and issues that captured gaming history as it happened</p></section><div class="platforms-grid">${cards}</div>${toggleScript()}</body></html>`;
}

function coverStoryDetailPage(item) {
  return detailPage(item, {
    nav: 'cover-stories', slug: 'cover-stories', backLabel: 'All Cover Stories', suffix: 'Cover Stories', name: item.title,
    meta: `${escapeHtml(item.magazine)} &middot; ${escapeHtml(item.issue)} &middot; ${escapeHtml(item.game)}`,
    extra: `<p class="platform-detail-desc"><em>${escapeHtml(item.notableFor)}</em></p>`,
  });
}

function controllersListPage() {
  const cards = CONTROLLERS.map(c => `<a href="/controllers/${c.id}" class="platform-card">
    <div class="platform-card-name">${escapeHtml(c.title)}</div>
    <div class="platform-card-era">${escapeHtml(c.manufacturer)} &middot; ${escapeHtml(c.platform)} &middot; ${c.year}</div>
    <p class="platform-card-desc">${escapeHtml(c.description)}</p>
  </a>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Controllers &amp; Input Devices – Bosnan</title><meta name="description" content="The controllers that shaped how we play — D-pad, analog stick, light gun, and beyond."><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${nav('controllers')}<section class="platforms-hero"><h1>Controllers &amp; Input Devices</h1><p>The hardware that sits between player and game — designed to disappear</p></section><div class="platforms-grid">${cards}</div>${toggleScript()}</body></html>`;
}

function controllerDetailPage(item) {
  return detailPage(item, {
    nav: 'controllers', slug: 'controllers', backLabel: 'All Controllers', suffix: 'Controllers', name: item.title,
    meta: `${escapeHtml(item.manufacturer)} &middot; ${escapeHtml(item.platform)} &middot; ${item.year}`,
    extra: `<p class="platform-detail-desc"><em>${escapeHtml(item.notableFor)}</em></p>`,
  });
}

function disappointmentsListPage() {
  const cards = DISAPPOINTMENTS.map(d => `<a href="/disappointments/${d.id}" class="platform-card">
    <div class="platform-card-name">${escapeHtml(d.title)}</div>
    <div class="platform-card-era">${escapeHtml(d.series)} &middot; ${escapeHtml(d.platform)} &middot; ${d.year}</div>
    <p class="platform-card-desc">${escapeHtml(d.description)}</p>
  </a>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Sequel Disappointments – Bosnan</title><meta name="description" content="Highly anticipated follow-ups that fell short — analysed fairly and in context."><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${nav('disappointments')}<section class="platforms-hero"><h1>Sequel Disappointments</h1><p>Anticipated follow-ups that didn't deliver — examined in context, without cruelty</p></section><div class="platforms-grid">${cards}</div>${toggleScript()}</body></html>`;
}

function disappointmentDetailPage(item) {
  const failedAt = (item.failedAt || []).map(f => `<li>${escapeHtml(f)}</li>`).join('');
  return detailPage(item, {
    nav: 'disappointments', slug: 'disappointments', backLabel: 'All Disappointments', suffix: 'Disappointments', name: item.title,
    meta: `${escapeHtml(item.series)} &middot; ${escapeHtml(item.platform)} &middot; ${item.year} &middot; Preceded by: ${escapeHtml(item.predecessor)}`,
    extra: failedAt ? `<div class="dev-notable"><strong>Where It Fell Short:</strong><ul class="trivia-list">${failedAt}</ul></div>` : '',
  });
}

function levelsListPage() {
  const cards = LEVELS.map(l => `<a href="/levels/${l.id}" class="platform-card">
    <div class="platform-card-name">${escapeHtml(l.title)}</div>
    <div class="platform-card-era">${escapeHtml(l.levelName)} &middot; ${escapeHtml(l.game)} &middot; ${l.year}</div>
    <p class="platform-card-desc">${escapeHtml(l.description)}</p>
  </a>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Level Design Hall of Fame – Bosnan</title><meta name="description" content="Iconic individual levels analysed as design works — World 1-1, Chemical Plant, E1M1, and more."><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${nav('levels')}<section class="platforms-hero"><h1>Level Design Hall of Fame</h1><p>Individual levels that demonstrate what great game design looks like</p></section><div class="platforms-grid">${cards}</div>${toggleScript()}</body></html>`;
}

function levelDetailPage(item) {
  const principles = (item.designPrinciples || []).map(p => `<li>${escapeHtml(p)}</li>`).join('');
  return detailPage(item, {
    nav: 'levels', slug: 'levels', backLabel: 'All Levels', suffix: 'Levels', name: item.title,
    meta: `${escapeHtml(item.levelName)} &middot; ${escapeHtml(item.game)} &middot; ${escapeHtml(item.platform)} &middot; ${item.year}`,
    extra: principles ? `<div class="dev-notable"><strong>Design Principles:</strong><ul class="trivia-list">${principles}</ul></div>` : '',
  });
}

function urbanLegendsListPage() {
  const verdictColor = v => v === 'Confirmed True' ? '#4a9' : v === 'Confirmed False' ? '#c66' : v === 'Partially True' ? '#c8a44a' : '#888';
  const cards = URBAN_LEGENDS.map(u => `<a href="/urban-legends/${u.id}" class="platform-card">
    <div class="platform-card-name">${escapeHtml(u.title)}</div>
    <div class="platform-card-era" style="color:${verdictColor(u.verdict)}">${escapeHtml(u.verdict)} &middot; ${escapeHtml(u.era)}</div>
    <p class="platform-card-desc">${escapeHtml(u.description)}</p>
  </a>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Gaming Urban Legends – Bosnan</title><meta name="description" content="Polybius, Lavender Town Syndrome, the buried E.T. cartridges — gaming's myths investigated."><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${nav('urban-legends')}<section class="platforms-hero"><h1>Gaming Urban Legends</h1><p>The myths, rumours, and folklore that grew up around retro games — investigated</p></section><div class="platforms-grid">${cards}</div>${toggleScript()}</body></html>`;
}

function urbanLegendDetailPage(item) {
  const verdictColor = v => v === 'Confirmed True' ? '#4a9' : v === 'Confirmed False' ? '#c66' : v === 'Partially True' ? '#c8a44a' : '#888';
  return detailPage(item, {
    nav: 'urban-legends', slug: 'urban-legends', backLabel: 'All Urban Legends', suffix: 'Urban Legends', name: item.title,
    meta: `Verdict: <strong style="color:${verdictColor(item.verdict)}">${escapeHtml(item.verdict)}</strong> &middot; ${escapeHtml(item.era)}`,
  });
}

function cancelledListPage() {
  const cards = CANCELLED.map(c => `<a href="/cancelled/${c.id}" class="platform-card">
    <div class="platform-card-name">${escapeHtml(c.title)}</div>
    <div class="platform-card-era">${escapeHtml(c.platform)} &middot; ${c.year} &middot; <em>${escapeHtml(c.status)}</em></div>
    <p class="platform-card-desc">${escapeHtml(c.description)}</p>
  </a>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Cancelled Games – Bosnan</title><meta name="description" content="Games that were announced but never released — from StarFox 2 to Sonic X-treme."><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${nav('cancelled')}<section class="platforms-hero"><h1>Cancelled Games</h1><p>Announced, developed, and then shelved — the games that never made it</p></section><div class="platforms-grid">${cards}</div>${toggleScript()}</body></html>`;
}

function cancelledDetailPage(item) {
  return detailPage(item, {
    nav: 'cancelled', slug: 'cancelled', backLabel: 'All Cancelled Games', suffix: 'Cancelled', name: item.title,
    meta: `${escapeHtml(item.platform)} &middot; ${item.year} &middot; ${escapeHtml(item.developer)}${item.publisher && item.publisher !== 'Unknown' ? ' &middot; ' + escapeHtml(item.publisher) : ''} &middot; <strong>${escapeHtml(item.status)}</strong>`,
  });
}

function localizationListPage() {
  const cards = LOCALIZATION.map(l => `<a href="/localization/${l.id}" class="platform-card">
    <div class="platform-card-name">${escapeHtml(l.title)}</div>
    <div class="platform-card-era">${escapeHtml(l.game)} &middot; ${escapeHtml(l.platform)} &middot; ${escapeHtml(l.originalRegion)} &#8594; ${escapeHtml(l.localizedRegion)}</div>
    <p class="platform-card-desc">${escapeHtml(l.description)}</p>
  </a>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Localization Differences – Bosnan</title><meta name="description" content="How games changed between regional releases — censorship, renamed characters, altered content."><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${nav('localization')}<section class="platforms-hero"><h1>Localization Differences</h1><p>How games changed crossing borders — censored blood, renamed heroes, and rewritten stories</p></section><div class="platforms-grid">${cards}</div>${toggleScript()}</body></html>`;
}

function localizationDetailPage(item) {
  const changes = (item.changes || []).map(c => `<li>${escapeHtml(c)}</li>`).join('');
  return detailPage(item, {
    nav: 'localization', slug: 'localization', backLabel: 'All Localization Differences', suffix: 'Localization', name: item.title,
    meta: `${escapeHtml(item.game)} &middot; ${escapeHtml(item.platform)} &middot; ${item.year} &middot; ${escapeHtml(item.originalRegion)} &#8594; ${escapeHtml(item.localizedRegion)}`,
    extra: changes ? `<div class="dev-notable"><strong>Changes Made:</strong><ul class="trivia-list">${changes}</ul></div>` : '',
  });
}

function prototypesListPage() {
  const cards = PROTOTYPES.map(p => `<a href="/prototypes/${p.id}" class="platform-card">
    <div class="platform-card-name">${escapeHtml(p.title)}</div>
    <div class="platform-card-era">${escapeHtml(p.game)} &middot; ${escapeHtml(p.platform)} &middot; ${escapeHtml(p.buildDate)}</div>
    <p class="platform-card-desc">${escapeHtml(p.description)}</p>
  </a>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Prototype &amp; Beta Versions – Bosnan</title><meta name="description" content="Pre-release builds that reveal how games evolved — from early Sonic designs to Ocarina of Time's 1996 demo."><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${nav('prototypes')}<section class="platforms-hero"><h1>Prototypes &amp; Beta Versions</h1><p>Pre-release builds that show how games were made — and unmade</p></section><div class="platforms-grid">${cards}</div>${toggleScript()}</body></html>`;
}

function prototypeDetailPage(item) {
  const diffs = (item.differences || []).map(d => `<li>${escapeHtml(d)}</li>`).join('');
  return detailPage(item, {
    nav: 'prototypes', slug: 'prototypes', backLabel: 'All Prototypes', suffix: 'Prototypes', name: item.title,
    meta: `${escapeHtml(item.game)} &middot; ${escapeHtml(item.platform)} &middot; Build: ${escapeHtml(item.buildDate)} &middot; Discovered: ${item.discoveredYear} &middot; ${escapeHtml(item.source)}`,
    extra: diffs ? `<div class="dev-notable"><strong>Differences from Final:</strong><ul class="trivia-list">${diffs}</ul></div>` : '',
  });
}

function strategyGuidesListPage() {
  const cards = STRATEGY_GUIDES.map(g => `<a href="/strategy-guides/${g.id}" class="platform-card">
    <div class="platform-card-name">${escapeHtml(g.title)}</div>
    <div class="platform-card-era">${escapeHtml(g.game)} &middot; ${escapeHtml(g.publisher)} &middot; ${g.year}</div>
    <p class="platform-card-desc">${escapeHtml(g.description)}</p>
  </a>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Strategy Guides – Bosnan</title><meta name="description" content="The iconic strategy guides that defined retro gaming — Nintendo Power, Prima, Brady Games, and more."><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${nav('strategy-guides')}<section class="platforms-hero"><h1>Strategy Guides</h1><p>The books that taught us how to play — Nintendo Power, Prima, Brady, and beyond</p></section><div class="platforms-grid">${cards}</div>${toggleScript()}</body></html>`;
}

function strategyGuideDetailPage(item) {
  return detailPage(item, {
    nav: 'strategy-guides', slug: 'strategy-guides', backLabel: 'All Strategy Guides', suffix: 'Strategy Guides', name: item.title,
    meta: `${escapeHtml(item.game)} &middot; ${escapeHtml(item.publisher)} &middot; ${item.year}${item.author && item.author !== 'Staff' ? ' &middot; ' + escapeHtml(item.author) : ''}`,
    extra: `<p class="platform-detail-desc"><em>${escapeHtml(item.notableFor)}</em></p>`,
  });
}

function cabinetArtListPage() {
  const cards = CABINET_ART.map(c => `<a href="/cabinet-art/${c.id}" class="platform-card">
    <div class="platform-card-name">${escapeHtml(c.title)}</div>
    <div class="platform-card-era">${escapeHtml(c.game)} &middot; ${escapeHtml(c.manufacturer)} &middot; ${c.year}</div>
    <p class="platform-card-desc">${escapeHtml(c.description)}</p>
  </a>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Arcade Cabinet Art – Bosnan</title><meta name="description" content="The marquee art, side panels, and illustrated cabinet artwork that defined the arcade era."><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${nav('cabinet-art')}<section class="platforms-hero"><h1>Arcade Cabinet Art</h1><p>The marquees, panels, and artwork that defined arcade culture</p></section><div class="platforms-grid">${cards}</div>${toggleScript()}</body></html>`;
}

function cabinetArtDetailPage(item) {
  return detailPage(item, {
    nav: 'cabinet-art', slug: 'cabinet-art', backLabel: 'All Cabinet Art', suffix: 'Cabinet Art', name: item.title,
    meta: `${escapeHtml(item.game)} &middot; ${escapeHtml(item.manufacturer)} &middot; ${item.year}${item.artist && item.artist !== 'Unknown' ? ' &middot; ' + escapeHtml(item.artist) : ''}`,
    extra: `<p class="platform-detail-desc"><em>${escapeHtml(item.notableFor)}</em></p>`,
  });
}

function merchandiseListPage() {
  const cards = MERCHANDISE.map(m => `<a href="/merchandise/${m.id}" class="platform-card">
    <div class="platform-card-name">${escapeHtml(m.title)}</div>
    <div class="platform-card-era">${escapeHtml(m.franchise)} &middot; ${escapeHtml(m.type)} &middot; ${m.year}</div>
    <p class="platform-card-desc">${escapeHtml(m.description)}</p>
  </a>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Merchandise &amp; Tie-ins – Bosnan</title><meta name="description" content="Cartoons, toys, cereals, films, and merchandise from the golden age of gaming tie-ins."><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${nav('merchandise')}<section class="platforms-hero"><h1>Merchandise &amp; Tie-ins</h1><p>When games went beyond the screen — cartoons, toys, cereals, and Hollywood</p></section><div class="platforms-grid">${cards}</div>${toggleScript()}</body></html>`;
}

function merchandiseDetailPage(item) {
  return detailPage(item, {
    nav: 'merchandise', slug: 'merchandise', backLabel: 'All Merchandise', suffix: 'Merchandise', name: item.title,
    meta: `${escapeHtml(item.franchise)} &middot; ${escapeHtml(item.type)} &middot; ${item.year} &middot; ${escapeHtml(item.manufacturer)}`,
    extra: `<p class="platform-detail-desc"><em>${escapeHtml(item.notableFor)}</em></p>`,
  });
}

function bootlegsListPage() {
  const cards = BOOTLEGS.map(b => `<a href="/bootlegs/${b.id}" class="platform-card">
    <div class="platform-card-name">${escapeHtml(b.title)}</div>
    <div class="platform-card-era">${escapeHtml(b.platform)} &middot; ${b.year} &middot; ${escapeHtml(b.type)}</div>
    <p class="platform-card-desc">${escapeHtml(b.description)}</p>
  </a>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Bootlegs &amp; Clones – Bosnan</title><meta name="description" content="Unlicensed ports, pirate compilations, Famiclones, and the grey market that defined gaming outside the West."><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${nav('bootlegs')}<section class="platforms-hero"><h1>Bootlegs &amp; Clones</h1><p>Unlicensed games, pirate carts, Famiclones, and the grey market</p></section><div class="platforms-grid">${cards}</div>${toggleScript()}</body></html>`;
}

function bootlegDetailPage(item) {
  return detailPage(item, {
    nav: 'bootlegs', slug: 'bootlegs', backLabel: 'All Bootlegs', suffix: 'Bootlegs', name: item.title,
    meta: `${escapeHtml(item.platform)} &middot; ${item.year} &middot; ${escapeHtml(item.region)} &middot; ${escapeHtml(item.type)}`,
    extra: `<p class="platform-detail-desc"><em>${escapeHtml(item.notableFor)}</em></p>`,
  });
}

function competitiveListPage() {
  const cards = COMPETITIVE.map(c => `<a href="/competitive/${c.id}" class="platform-card">
    <div class="platform-card-name">${escapeHtml(c.title)}</div>
    <div class="platform-card-era">${c.year} &middot; ${escapeHtml(c.game)} &middot; ${escapeHtml(c.location)}</div>
    <p class="platform-card-desc">${escapeHtml(c.description)}</p>
  </a>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Competitive Gaming History – Bosnan</title><meta name="description" content="Early esports, high-score competitions, and the tournaments that shaped competitive gaming."><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${nav('competitive')}<section class="platforms-hero"><h1>Competitive Gaming History</h1><p>High-score records, championships, and the birth of esports</p></section><div class="platforms-grid">${cards}</div>${toggleScript()}</body></html>`;
}

function competitiveDetailPage(item) {
  return detailPage(item, {
    nav: 'competitive', slug: 'competitive', backLabel: 'All Competitive Events', suffix: 'Competitive', name: item.title,
    meta: `${item.year} &middot; ${escapeHtml(item.game)} &middot; ${escapeHtml(item.organizer)} &middot; ${escapeHtml(item.location)}`,
    extra: item.winner ? `<p class="platform-detail-desc"><strong>Winner:</strong> ${escapeHtml(item.winner)}</p>` : '',
  });
}

function endingsListPage() {
  const cards = ENDINGS.map(e => `<a href="/endings/${e.id}" class="platform-card">
    <div class="platform-card-name">${escapeHtml(e.title)}</div>
    <div class="platform-card-era">${escapeHtml(e.game)} &middot; ${escapeHtml(e.platform)} &middot; ${e.year} &middot; ${escapeHtml(e.type)}</div>
    <p class="platform-card-desc">${escapeHtml(e.description)}</p>
  </a>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Endings Gallery – Bosnan</title><meta name="description" content="Famous, surprising, and emotionally devastating game endings from the retro era."><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${nav('endings')}<section class="platforms-hero"><h1>Endings Gallery</h1><p>The moments that closed out the greatest retro games — and never left us</p></section><div class="platforms-grid">${cards}</div>${toggleScript()}</body></html>`;
}

function endingDetailPage(item) {
  return detailPage(item, {
    nav: 'endings', slug: 'endings', backLabel: 'All Endings', suffix: 'Endings', name: item.title,
    meta: `${escapeHtml(item.game)} &middot; ${escapeHtml(item.platform)} &middot; ${item.year} &middot; ${escapeHtml(item.type)}${item.spoilerWarning ? ' &middot; <em>Spoilers</em>' : ''}`,
  });
}

function notFoundPage() {
  const rg = games[Math.floor(Math.random() * games.length)];
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>404 – Page Not Found – Bosnan</title>
    <meta name="robots" content="noindex">
    ${cssHead()}
</head>
<body>
${nav('')}
<div class="notfound-wrapper">
  <div class="notfound-code">404</div>
  <h1 class="notfound-title">Page not found</h1>
  <p class="notfound-sub">That page doesn't exist in the archive.</p>
  <div class="notfound-actions">
    <a href="/games" class="btn">Browse Games</a>
    <a href="/random" class="btn notfound-random">&#127922; Random Game</a>
  </div>
  <div class="notfound-suggest">
    <h2 class="notfound-suggest-label">While you're here:</h2>
    <a href="/games/${escapeHtml(rg.id)}" class="game-card notfound-card">
      <div class="game-card-img-wrap">
        ${cardImage(rg, 'loading="lazy"')}
      </div>
      <div class="game-card-body">
        <h3 class="game-card-title">${escapeHtml(rg.title)}</h3>
        <div class="game-card-meta">${rg.year} · ${escapeHtml(rg.genre)}</div>
        <p class="game-card-platform">${escapeHtml(rg.platform)}</p>
      </div>
    </a>
  </div>
</div>
${toggleScript()}
</body>
</html>`;
}

app.use((req, res) => {
  res.status(404).send(notFoundPage());
});

app.listen(PORT, () => {
  console.log(`Bosnan server running at http://localhost:${PORT}`);
  console.log(`CSS bundle: ${CSS_PATH} (${rawCss.length} bytes raw)`);
});
