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
const SITE_LASTMOD = (() => {
  if (process.env.SITE_LASTMOD) return process.env.SITE_LASTMOD;
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
const SITE_TAGLINE = 'An independent archive of video game history from 1952 to 1999: games, ' +
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
function metaDesc(s, max = 160) {
  const text = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  if (text.length <= max) return escapeHtml(text);
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
    ? `${lead}, including ${named} — with platforms, developers and release history from ${site}.`
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
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${name} – ${o.suffix} – Bosnan</title><meta name="description" content="${metaDesc(item.description)}"><meta property="og:type" content="article"><link rel="canonical" href="${url}"><script type="application/ld+json">${articleJson}</script>${breadcrumbSchema(trail)}<style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${bgLogo()}${nav(o.nav)}<div class="platform-detail-wrapper">${crumbsNav(trail)}<a href="/${o.slug}" class="back-link">&#8592; ${o.backLabel}</a><div class="platform-detail-header"><h1>${name}</h1><p class="platform-detail-era">${o.meta}</p><p class="platform-detail-desc">${escapeHtml(item.description)}</p><p class="platform-detail-desc">${escapeHtml(item.longDescription)}</p>${o.extra || ''}${facts ? `<div class="dev-notable"><strong>Key Facts:</strong><ul class="trivia-list">${facts}</ul></div>` : ''}</div><div class="platform-long-desc essay-body">${sections}</div>${sourcesBlock(item, true)}${relatedBlock(item)}</div>${toggleScript()}</body></html>`;
}

const PLATFORMS = dedupe([
  {
    id: 'arcade', name: 'Arcade', era: '1971 – 1990s',
    manufacturer: 'Various (Namco, Atari, Konami, Capcom, Sega)',
    keyword: 'Arcade',
    description: 'Coin-operated arcade games defined the first golden age of video gaming. Standing cabinets filled malls and arcades worldwide. At their peak in 1982, US arcades generated over $8 billion annually — more than Hollywood box office and recorded music combined. Pac-Man alone earned over $2.5 billion by 1990.',
    longDescription: 'The golden age of arcade games ran roughly from 1978 to 1983, sparked by the global success of Space Invaders and Pac-Man. Japanese manufacturers like Namco and Taito competed fiercely with American companies like Atari and Williams. Hardware pushed boundaries every year: vector graphics (Asteroids, Tempest), sprite scaling (Turbo), and early 3D polygon rendering all debuted in arcade cabinets long before reaching home computers. The crash of 1983 slowed the North American industry, but Japanese arcades continued thriving through the decade, producing legendary fighting games, shoot-\'em-ups, and beat \'em ups that remain benchmarks of game design.',
  },
  {
    id: 'nes', name: 'Nintendo Entertainment System', shortName: 'NES', era: '1983 – 1995',
    manufacturer: 'Nintendo',
    keyword: 'NES',
    description: 'The NES single-handedly revived the video game industry after the crash of 1983. Released in Japan as the Famicom in 1983 and globally from 1985, the NES sold over 61 million units. Franchises born on the NES — Mario, Zelda, Metroid, Castlevania, Mega Man — remain the most valuable intellectual properties in gaming today.',
    longDescription: 'Nintendo launched the NES in the US with a deliberate strategy to avoid the stigma of the video game crash: they marketed it as a toy and positioned it in toy stores alongside action figures. Super Mario Bros. bundled with the system became the best-selling game of its era. Third-party publishers like Capcom, Konami, and Namco produced titles that remain masterclasses of platform, action, and role-playing design. The NES\'s strict licensing system and iconic seal of quality restored consumer trust in video games.',
  },
  {
    id: 'atari-2600', name: 'Atari 2600', era: '1977 – 1992',
    manufacturer: 'Atari',
    keyword: 'Atari 2600',
    description: 'The Atari 2600 was the first mass-market home console to popularize ROM cartridges, bringing the arcade experience into living rooms. Launched in 1977, it sold over 30 million units. Space Invaders quadrupled 2600 sales in 1980. The 2600 also sparked the first gaming crash when a flood of low-quality titles collapsed consumer confidence in 1983.',
    longDescription: 'The Atari 2600\'s hardware was modest: a MOS 6507 CPU at 1.19 MHz with 128 bytes of RAM. Yet programmers developed extraordinary techniques — racing the beam, kernel tricks — to squeeze remarkable visuals from these constraints. Activision became the first third-party game developer in 1979 after disgruntled Atari programmers demanded credit and royalties. The 2600\'s long lifespan until 1992 makes it one of the longest-running consoles in history.',
  },
  {
    id: 'commodore-64', name: 'Commodore 64', shortName: 'C64', era: '1982 – 1994',
    manufacturer: 'Commodore International',
    keyword: 'Commodore 64',
    description: 'The Commodore 64 is the best-selling personal computer model of all time, with estimates of 12–17 million units sold. Its custom SID sound chip is beloved by chiptune musicians to this day. Europe\'s dominant home computer through the 1980s, the C64 hosted thousands of games including Impossible Mission, The Last Ninja, and Elite.',
    longDescription: 'The C64\'s three custom chips — VIC-II (graphics), SID (sound), and CIA (I/O) — created capabilities unmatched by competitors. The SID chip\'s three-voice synthesis with multiple waveforms produced music quality no other computer of its era could match. UK and German software houses thrived on the C64, producing a culture of bedroom coders who founded major game studios. The cassette tape as primary storage made software cheap and created a vibrant (if piracy-heavy) gaming scene.',
  },
  {
    id: 'zx-spectrum', name: 'ZX Spectrum', era: '1982 – 1992',
    manufacturer: 'Sinclair Research',
    keyword: 'ZX Spectrum',
    description: 'Launching at just £125 in 1982, the ZX Spectrum became the most popular home computer in the UK and much of Europe. Despite its rubber keyboard and colour-clash limitations, it democratised computing and created a generation of bedroom programmers. The UK games industry was largely built on Spectrum development.',
    longDescription: 'The Spectrum\'s colour attribute system — where each 8×8 pixel block could only hold two colours — created the distinctive "colour clash" developers learned to work around creatively. Loading games from cassette tape, with its distinctive warbling audio, became a ritual of 1980s British childhood. Companies like Ultimate Play the Game (later Rare), Ocean, and Codemasters built their early reputations on Spectrum software. Many gaming genres — isometric 3D (Knight Lore), text adventure (Lords of Midnight) — advanced rapidly on this humble machine.',
  },
  {
    id: 'sega-master-system', name: 'Sega Master System', shortName: 'SMS', era: '1985 – 1996',
    manufacturer: 'Sega',
    keyword: 'Sega Master System',
    description: 'The Sega Master System boasted superior hardware to the NES: a Z80 CPU, better colour palette, and higher resolution. While the NES dominated North America, the Master System conquered Brazil and Europe. In Brazil, where the NES never gained market share, the Master System sold over 8 million units and became a beloved gaming institution.',
    longDescription: 'The Master System could display 64 colours simultaneously (versus the NES\'s 25), had built-in 3D glasses support, and came with a built-in game depending on region. Sega\'s slow US start was due to Nintendo\'s exclusive licensing deals with major publishers. But in Europe and particularly Brazil — where Tec Toy produced localised versions well into the 2000s — the Master System defines retro gaming as much as the NES does elsewhere.',
  },
  {
    id: 'apple-ii', name: 'Apple II', era: '1977 – 1993',
    manufacturer: 'Apple Computer',
    keyword: 'Apple II',
    description: 'One of the first mass-produced personal computers, the Apple II became the dominant computing platform for US education through the 1980s. Its open architecture and colour graphics made it a natural gaming platform, hosting landmark titles like Oregon Trail, Ultima, Wizardry, and Karateka. Many foundational RPG and adventure game conventions were established here.',
    longDescription: 'Steve Wozniak designed the Apple II around a 6502 CPU, with his engineering allowing colour graphics without additional chips. The machine\'s eight expansion slots enabled a thriving ecosystem of hardware add-ons. Sierra On-Line, Broderbund, and SSI built their early reputations on Apple II software. The machine\'s longevity until 1993 reflects its educational market penetration — almost every US school had one.',
  },
  {
    id: 'pc-dos', name: 'PC / DOS', era: '1981 – 1990s',
    manufacturer: 'IBM / Microsoft',
    keyword: 'PC',
    description: 'The IBM PC and its DOS-based clones became the world\'s dominant computing platform through the 1980s. Despite lacking dedicated game hardware, clever developers used the PC speaker, CGA/EGA graphics, and eventually Sound Blaster audio to produce defining games. Text adventures, early RPGs, flight simulators, and strategy games flourished on DOS.',
    longDescription: 'The PC\'s open architecture — any manufacturer could clone it — created rapid commoditisation and broad adoption. Games like King\'s Quest proved graphical adventure games could work on home computers; Ultima and Wizardry established the CRPG genre. The introduction of VGA graphics in 1987 and Sound Blaster audio in 1989 transformed the PC into a serious gaming platform that would eventually eclipse dedicated consoles.',
  },
  {
    id: 'snes', name: 'Super Nintendo Entertainment System', shortName: 'SNES', era: '1990 – 1998',
    manufacturer: 'Nintendo',
    keyword: 'SNES',
    description: 'The SNES delivered a 16-bit leap over its predecessor, producing some of the most celebrated games ever made. Its Mode 7 graphics, stereo sound chip, and deep library of RPGs, platformers, and action games made the early 1990s a golden era for Nintendo. Over 49 million units were sold worldwide.',
    longDescription: 'Released in Japan as the Super Famicom in 1990 and in North America in 1991, the SNES launched directly into the Sega Genesis\'s territory and quickly established superiority with superior colour output, built-in stereo sound, and a deeper software catalogue. The SNES\'s custom chips — the SPC700 sound processor and the Super FX chip used in Star Fox — enabled capabilities the competition couldn\'t match. Nintendo\'s partnership with second-party developers like HAL Laboratory, Rare, and Argonaut produced genre-defining titles year after year. The SNES library remains the most critically praised in console history, with multiple entries in any list of all-time greatest games.',
  },
  {
    id: 'genesis', name: 'Sega Genesis', shortName: 'Genesis', era: '1988 – 1997',
    manufacturer: 'Sega',
    keyword: 'Genesis',
    description: 'The Sega Genesis (Mega Drive outside North America) was the first 16-bit console to reach Western markets, giving Sega a two-year head start over the SNES. Its blast-processing marketing, edgier game library, and Sonic the Hedgehog mascot made the Genesis the rebellious alternative to Nintendo\'s family-friendly brand.',
    longDescription: 'Launched in Japan in 1988 and North America in 1989, the Genesis used a Motorola 68000 CPU — the same chip that powered the Amiga and Atari ST — paired with a Yamaha FM sound chip that gave its audio a distinctive, punchy character. Sega\'s aggressive marketing — first under Michael Katz, then Tom Kalinske — positioned the Genesis as the cool alternative to the NES, with the famous "Genesis does what Nintendon\'t" campaign. The console sold over 30 million units globally and hosted landmark titles from Sega\'s internal studios such as Sonic Team, plus key third-party titles such as Gunstar Heroes from Treasure. The Genesis era was Sega at its commercial and creative peak.',
  },
  {
    id: 'game-boy', name: 'Game Boy', era: '1989 – 2003',
    manufacturer: 'Nintendo',
    keyword: 'Game Boy',
    description: 'Gunpei Yokoi\'s masterpiece of "lateral thinking with withered technology" sold over 118 million units across its original and Color versions. Despite technically inferior hardware to competitors, the Game Boy\'s battery life, durability, and Tetris bundle made it the dominant portable gaming platform for over a decade.',
    longDescription: 'The Game Boy launched in 1989 with a dot-matrix LCD screen, four AA batteries for roughly 30 hours of play, and (outside Japan) Tetris bundled in the box. Despite the Sega Game Gear\'s backlit colour screen and the Atari Lynx\'s superior hardware, the Game Boy outlasted all competitors because Yokoi prioritised playability over spectacle. Nintendo\'s grip on the handheld market through its first-party exclusives — Pokémon, Zelda, Mario, Metroid — made the platform a self-reinforcing ecosystem. The Game Boy Color (1998) and Game Boy Advance (2001) extended the lineage, with the combined family selling more than any single home console of its era.',
  },
  {
    id: 'nintendo-64', name: 'Nintendo 64', shortName: 'N64', era: '1996 – 2002',
    manufacturer: 'Nintendo',
    keyword: 'Nintendo 64',
    description: 'The Nintendo 64 delivered hardware capable of true 3D gaming and produced some of the most influential titles ever made — Super Mario 64, The Legend of Zelda: Ocarina of Time, GoldenEye 007. Its decision to stay with cartridges while Sony used CD-ROM cost it the majority of third-party support.',
    longDescription: 'Released in Japan and North America in 1996 and in Europe in March 1997, the N64 used a MIPS R4300i CPU at 93.75 MHz and the custom Reality Coprocessor GPU, delivering 3D performance that impressed at launch. The console sold 33 million units — a respectable number, but far behind the PlayStation\'s 102 million — largely because Nintendo\'s cartridge format was more expensive to manufacture and hold less data than CD-ROM, driving Square and many others to favour Sony. What the N64 lost in third-party breadth it made up in first-party quality: Super Mario 64, Zelda: Ocarina of Time, and GoldenEye 007 remain among the most critically acclaimed games ever made, and their influence on 3D game design is still felt today.',
  },
  {
    id: 'playstation', name: 'PlayStation', shortName: 'PS1', era: '1994 – 2006',
    manufacturer: 'Sony',
    keyword: 'PlayStation',
    description: 'Sony\'s PlayStation reshaped the games industry with its CD-ROM format, $299 launch price, and aggressive third-party licensing strategy. Selling 102 million units, the PlayStation ended Sega\'s competition, weakened Nintendo\'s market position, and established Sony as the dominant console manufacturer of the late 1990s.',
    longDescription: 'The PlayStation originated as a CD-ROM add-on for the Super Nintendo before a falling-out between Sony and Nintendo sent Sony to develop a standalone console. Ken Kutaragi\'s team built a machine centred on the R3000A CPU and a custom GPU capable of fast 3D polygon rendering. Sony\'s approach to third-party licensing was the opposite of Nintendo\'s restrictive model: developers paid lower royalties, had access to the hardware specifications, and were not required to source manufacturing through Nintendo. The result was an unprecedented flood of third-party support. Squaresoft\'s Final Fantasy VII (1997) defined the PlayStation era culturally, demonstrating that games could be cinematic experiences with mass-market appeal. Tekken, Crash Bandicoot, Resident Evil, and Gran Turismo each defined genres on the platform.',
  },
  {
    id: 'sega-saturn', name: 'Sega Saturn', shortName: 'Saturn', era: '1994 – 1998',
    manufacturer: 'Sega',
    keyword: 'Sega Saturn',
    description: 'The Sega Saturn\'s surprise early launch at $399 and complex dual-CPU architecture hampered its Western performance, but it produced brilliant 2D games and a devoted Japanese fanbase. Home to Panzer Dragoon Saga, Guardian Heroes, and NiGHTS into Dreams, the Saturn\'s cult status has only grown with time.',
    longDescription: 'Designed primarily as a 2D powerhouse to compete with Neo Geo-quality arcade conversions, the Saturn\'s architecture — dual Hitachi SH-2 CPUs and multiple graphics processors — proved difficult to program for 3D games when the PlayStation demonstrated superior polygon performance. Sega\'s decision to launch the Saturn at $399, four months earlier than announced and without warning retailers or third parties, generated immediate ill-will and gave Sony\'s $299 PlayStation an advantage it never relinquished. In Japan, however, the Saturn maintained a strong position through 1997 on the back of arcade ports — Virtua Fighter 2, Daytona USA — and RPGs. The Saturn\'s 2D capabilities were genuinely superior to the PlayStation for sprite-based games, and titles like Guardian Heroes, Radiant Silvergun, and Panzer Dragoon Saga are among the most acclaimed games of the decade.',
  },
  {
    id: 'dreamcast', name: 'Sega Dreamcast', shortName: 'Dreamcast', era: '1998 – 2001',
    manufacturer: 'Sega',
    keyword: 'Dreamcast',
    description: 'The Dreamcast was Sega\'s final and most innovative console: the first to include a built-in modem, online gaming, and a VMU memory card with its own screen. Launched in 1998, it was discontinued in 2001 after Sony\'s PlayStation 2 announcement undermined consumer confidence. It remains one of gaming\'s most beloved machines.',
    longDescription: 'The Dreamcast used a Hitachi SH-4 CPU at 200 MHz and a PowerVR2 GPU delivering 3D performance competitive with early PlayStation 2 titles. Its built-in 33.6K modem — upgraded to 56K in later versions — enabled online gaming for Phantasy Star Online and NFL 2K1, making the Dreamcast the first console to make online play accessible to mainstream consumers. The VMU (Visual Memory Unit) memory card had its own screen and buttons, enabling secondary gameplay displays and mini-games. Despite critical acclaim for its library — Shenmue, Jet Set Radio, Soul Calibur, Crazy Taxi, Skies of Arcadia — Sega\'s history of hardware failures and Sony\'s announcement that the PlayStation 2 would deliver DVD playback and DVD-quality graphics eroded consumer confidence. Sega discontinued the Dreamcast in March 2001, exiting the hardware business entirely.',
  },
  {
    id: 'turbografx-16', name: 'TurboGrafx-16', shortName: 'TG-16', era: '1987 – 1994',
    manufacturer: 'NEC / Hudson Soft',
    keyword: 'TurboGrafx-16',
    description: 'The TurboGrafx-16 (PC Engine in Japan) was the first console to challenge the NES in Japan, where it briefly outsold the Famicom. Its HuCard format, CD-ROM add-on, and arcade-perfect ports gave it a technically impressive library, though it failed to gain meaningful traction in North America.',
    longDescription: 'Developed jointly by NEC and Hudson Soft, the PC Engine launched in Japan in 1987 and became a genuine competitive threat to Nintendo\'s Famicom, offering superior 2D sprite capability and clean arcade translations of popular games. Its HuCard format — credit card-sized ROM cards — was smaller than cartridges, and the CD-ROM² add-on (1988) made it the first console to use compact disc media, allowing for redbook audio and dramatically expanded storage. In North America, rebranded as the TurboGrafx-16 and launched in 1989, the console struggled against established NES loyalty and a confusing product line. The platform\'s library includes some of the finest shooters and action games of the 8-bit era — Blazing Lazers, Gate of Thunder, Ys Book I & II — and demonstrated what was possible with dedicated hardware design.',
  },
  {
    id: 'neo-geo', name: 'Neo Geo AES', shortName: 'Neo Geo', era: '1990 – 2004',
    manufacturer: 'SNK',
    keyword: 'Neo Geo',
    description: 'The Neo Geo AES was the most powerful home console of its era, offering true arcade-identical hardware at home. Priced at $649 at launch with games costing $200 each, it was a luxury product for the most dedicated fans — and it delivered exceptional fighting games, shooters, and action titles unmatched until the PlayStation era.',
    longDescription: 'SNK designed the Neo Geo as a home version of its MVS arcade system, meaning the same ROM chips ran in both the cabinet and the home console. The Motorola 68000 CPU and Zilog Z80 combination, backed by 64KB of work RAM and dedicated sprite hardware capable of displaying hundreds of large sprites simultaneously, made the Neo Geo the reference standard for 2D game quality throughout the early and mid-1990s. Street-level arcades ran MVS hardware while enthusiasts paid premium prices for identical experiences at home. The platform\'s catalogue — built almost entirely by SNK and a few close partners — concentrated on fighting games: Fatal Fury, Samurai Shodown, The King of Fighters, Art of Fighting. Metal Slug (1996) expanded the genre repertoire into run-and-gun with extraordinary hand-drawn animation. The Neo Geo outlasted all of its contemporaries, with new commercial releases through the early 2000s.',
  },
  {
    id: 'amiga', name: 'Commodore Amiga', shortName: 'Amiga', era: '1985 – 1996',
    manufacturer: 'Commodore International',
    keyword: 'Amiga',
    description: 'The Amiga was the most capable home computer of its era — its custom chips (Agnus, Denise, Paula) enabled multitasking, 4096-colour graphics, and four-channel stereo sample playback that no competitor could match until the mid-1990s. It became the platform of choice for game developers, video producers, and musicians alike.',
    longDescription: 'Launched in 1985, the Amiga 1000 used three custom chips designed by Jay Miner — the same engineer who had designed the Atari 2600\'s TIA chip — to deliver multimedia capabilities that the IBM PC and Apple Macintosh could not approach. Agnus handled DMA and graphics, Denise managed display generation with up to 4,096 simultaneous colours (HAM mode), and Paula processed audio with four 8-bit PCM channels and handled floppy disk I/O. The system\'s AmigaOS was genuinely multitasking at a time when DOS was entirely single-tasking. Games on the Amiga routinely exceeded what console developers achieved on dedicated gaming hardware; titles like Shadow of the Beast pushed colour and animation quality to levels the NES and Master System could not approach. The Amiga\'s decline after Commodore\'s 1994 bankruptcy left a devoted user community that maintained hardware and software support well into the 2000s.',
  },
  {
    id: 'atari-st', name: 'Atari ST', era: '1985 – 1993',
    manufacturer: 'Atari Corporation',
    keyword: 'Atari ST',
    description: 'The Atari ST used the Motorola 68000 processor and launched weeks before the Amiga at a much lower price, dominating the European market for music production thanks to built-in MIDI ports. In Germany and France especially, it was the primary home computer through the late 1980s.',
    longDescription: 'Jack Tramiel\'s Atari Corporation developed the ST rapidly after his departure from Commodore, releasing it in 1985 at a significantly lower price than the Amiga. The ST used the same Motorola 68000 CPU but with a simpler custom chip set (Shifter for graphics, GLUE for logic, ACIA for serial I/O). Where the Amiga\'s custom chips were purpose-designed for multimedia output, the ST\'s architecture was more conventional, with GEM — a licensed graphical user interface — providing the windowed environment. The ST\'s killer feature was its built-in MIDI in/out/thru ports, making it the music production computer of choice for professional musicians through the late 1980s. In recording studios, the Atari ST was ubiquitous as a MIDI sequencer host long after computers with superior general capabilities were available. Its game library, while extensive, was generally considered inferior to the Amiga\'s, though several titles — notably MIDI Maze, one of the first networked multiplayer games — used the ST\'s specific capabilities in ways the Amiga could not replicate.',
  },
  {
    id: 'atari-8bit', name: 'Atari 8-bit', shortName: 'Atari 8-bit', era: '1979 – 1992',
    manufacturer: 'Atari, Inc.',
    keyword: 'Atari 8-bit',
    description: 'Atari\'s home computer line — the 400, 800, XL, and XE series — used CTIA/GTIA and POKEY custom chips to deliver graphics and audio that exceeded the Apple II and outpaced most competitors. Many influential games appeared first on Atari 8-bit hardware.',
    longDescription: 'The Atari 400 and 800 launched in 1979 with hardware designed by Jay Miner (before his Amiga work) using custom chips: ANTIC and CTIA/GTIA for graphics and POKEY for audio and keyboard input, with a standard PIA for I/O. The GTIA chip\'s sprite handling and colour capabilities exceeded the Apple II significantly, making the Atari 8-bit line the premium home computer gaming platform of its era. The POKEY chip provided four audio channels with distortion control that produced more complex sounds than the beepers of competing computers. Lucasfilm Games\' Rescue on Fractalus and Ballblazer and Ozark Softscape\'s The Seven Cities of Gold debuted on Atari 8-bit hardware. The platform remained commercially viable through the XL series (1983) and XE series (1985) before DOS-based PCs made it obsolete in the late 1980s.',
  },
  {
    id: 'atari-lynx', name: 'Atari Lynx', shortName: 'Lynx', era: '1989 – 1995',
    manufacturer: 'Atari Corporation',
    keyword: 'Atari Lynx',
    description: 'The Lynx was the first handheld with a colour backlit screen, designed by Epyx before being acquired and marketed by Atari. Superior hardware to the Game Boy — faster processor, more colours, hardware sprite scaling — couldn\'t overcome the Game Boy\'s battery life, software library, and price advantage.',
    longDescription: 'The Lynx originated as the "Handy" at Epyx, a game publisher that had designed the hardware before running out of funding and selling the project to Atari. The hardware was genuinely impressive: an 8-bit 65C02 processor paired with a 16-bit custom graphics chip, a dedicated blitter chip with hardware sprite scaling and distortion, a backlit colour LCD showing 16 colours at once from a palette of 4,096, and a built-in ComLynx port for multiplayer linking up to eight units. Atari launched it at $179.95 in 1989, compared to the Game Boy\'s $89.95, and the price differential immediately limited its market penetration. The battery problem was severe: the colour backlit display consumed six AA batteries in approximately four hours, compared to the Game Boy\'s roughly thirty hours on four batteries. Despite a library of technically impressive games — Blue Lightning demonstrated hardware sprite scaling no other handheld could match — the Lynx sold approximately three million units against the Game Boy\'s eventual 118 million.',
  },
  {
    id: '3do', name: '3DO Interactive Multiplayer', shortName: '3DO', era: '1993 – 1996',
    manufacturer: 'Various (Panasonic, Goldstar, Sanyo)',
    keyword: '3DO',
    description: 'Trip Hawkins\'s ambitious open-standard console launched at $699 in 1993, making it one of the most expensive home consoles ever released. Despite impressive hardware and a double-speed CD-ROM drive, its price and the imminent PlayStation announcement ended its commercial viability within two years.',
    longDescription: 'The 3DO Company did not manufacture hardware — it licensed the 3DO specification to consumer electronics companies (Panasonic, Goldstar, Sanyo) who built compatible machines. This open-platform approach was intended to create competition that would drive prices down; instead, it complicated the consumer message and divided game development resources. The hardware specification was advanced for 1993: a 32-bit ARM60 CPU at 12.5 MHz, dedicated graphics processor with texture mapping, a double-speed CD-ROM drive, and 2MB of DRAM. The $699 launch price was set by manufacturing costs that the open-hardware model had not reduced as anticipated. Trip Hawkins had founded Electronic Arts and genuinely believed the 3DO would become the dominant gaming platform; the PlayStation\'s arrival (Japan, December 1994; North America at $299 in 1995) — with equivalent or superior hardware — made the 3DO\'s business case untenable within months of its launch.',
  },
  {
    id: 'atari-jaguar', name: 'Atari Jaguar', shortName: 'Jaguar', era: '1993 – 1996',
    manufacturer: 'Atari Corporation',
    keyword: 'Atari Jaguar',
    description: 'Marketed as "the only 64-bit game system" — a claim of disputed technical accuracy — the Jaguar was Atari\'s last hardware attempt. Its complex architecture frustrated developers and its software library remained thin despite some technically impressive titles like Tempest 2000.',
    longDescription: 'Atari marketed the Jaguar aggressively on its 64-bit specification — two 32-bit custom chips (Tom and Jerry) plus a Motorola 68000 as a general-purpose control processor, which Atari combined to claim 64-bit processing. The marketing was technically misleading; the processor doing most of the work was either the 32-bit Tom or the 32-bit Jerry, not a unified 64-bit architecture. The Jaguar launched at $249.99 in November 1993, priced competitively with the 3DO, but its custom architecture proved difficult to program. Most games were developed primarily for the 68000 CPU — the chip developers knew — rather than exploiting Tom and Jerry\'s parallel processing capabilities. The result was a platform whose library underrepresented its hardware potential, with exceptions: Tempest 2000 (1994), Jeff Minter\'s psychedelic update of the Atari arcade classic, was universally acclaimed and demonstrated what the hardware could do when properly used. The Jaguar sold approximately 250,000 units before Atari Corporation merged with JTS in 1996, ending Atari\'s hardware business.',
  },
  {
    id: 'virtual-boy', name: 'Nintendo Virtual Boy', shortName: 'Virtual Boy', era: '1995 – 1996',
    manufacturer: 'Nintendo',
    keyword: 'Virtual Boy',
    description: 'Gunpei Yokoi\'s final major hardware project used oscillating mirrors and red LED arrays to create a stereoscopic 3D effect. Despite impressive depth illusion, the monochrome red display, health warning advisories, and tabletop form factor combined to produce Nintendo\'s first significant hardware failure.',
    longDescription: 'The Virtual Boy used a display licensed from the US company Reflection Technology — oscillating mirrors that reflected rapidly modulated LED arrays to create the impression of depth. The system was not worn on the head like VR headsets; it sat on a tabletop and the player leaned forward to look into an eyepiece. The monochrome red display — chosen because red LEDs were cheapest and smallest — produced high contrast images but no colour information, limiting game aesthetics severely. Nintendo included health warnings advising players to take breaks every fifteen minutes due to concerns about eyestrain and potential developmental effects in young children. The system launched in Japan in July 1995 and North America in August 1995; Nintendo discontinued it in December 1995 in Japan and discontinued North American sales and development support in early 1996. Only 22 games were released commercially. The failure contributed to Yokoi\'s resignation from Nintendo in 1996; he died in a road accident in 1997.',
  },
  {
    id: 'msx', name: 'MSX', era: '1983 – 1995',
    manufacturer: 'Various (Sony, Panasonic, Toshiba, Philips, etc.)',
    keyword: 'MSX',
    description: 'Microsoft and ASCII\'s open home computer standard created a unified software platform across multiple hardware manufacturers. Dominant in Japan, the Netherlands, and Brazil, MSX was the platform where Hideo Kojima created the original Metal Gear and where Konami produced early versions of Gradius and Castlevania.',
    longDescription: 'MSX was an open hardware and software standard proposed by Microsoft Japan and ASCII Corporation in 1983, intended to create a common platform across competing home computer manufacturers. The specification required a Zilog Z80 CPU, Texas Instruments TMS9918 (or compatible) graphics chip, Microsoft BASIC in ROM, and specific memory mapping — meaning any software meeting the standard would run on any MSX computer. Sony, Panasonic, Toshiba, Philips, Sanyo, and dozens of other manufacturers produced MSX machines, creating a diverse hardware ecosystem around a consistent software base. The platform was most successful in Japan, the Netherlands, and Brazil, where it achieved the kind of market penetration that no single manufacturer\'s computer could have achieved alone.\n\nKonami\'s MSX software division was among the platform\'s most prolific and important: Metal Gear (1987), Vampire Killer (1986 — the MSX version of Castlevania), and Gradius were all MSX productions of genuine quality. The MSX2 standard (1985) upgraded graphics to the Yamaha V9938, enabling 512-colour displays. MSX2+ (1988) and MSX Turbo R (1990) extended the standard further, but the platform\'s relevance waned as the PC-9801 and then DOS/V IBM-compatible computers dominated the Japanese market in the early 1990s.',
  },
  {
    id: 'game-gear', name: 'Sega Game Gear', shortName: 'Game Gear', era: '1990 – 1997',
    manufacturer: 'Sega',
    keyword: 'Game Gear',
    description: 'The Game Gear was Sega\'s answer to the Game Boy: a backlit colour portable with hardware based on the Master System. Technically superior to Nintendo\'s handheld, it was undermined by poor battery life (six AA batteries for four hours) and a software library that lacked the Game Boy\'s depth of exclusives.',
    longDescription: 'Launched in Japan in 1990 and globally in 1991, the Game Gear used essentially the same hardware as the Sega Master System — an 8-bit Z80 CPU and a colour display capable of showing 32 colours simultaneously from a palette of 4,096. Its backlit screen was a genuine advantage over the Game Boy\'s passive LCD, making it far easier to play in low-light conditions, and an optional TV tuner add-on allowed it to receive television signals. The Game Gear sold approximately 10-11 million units — a respectable figure, but one that pales against the Game Boy\'s 118 million. The battery problem was genuine: where the Game Boy ran for about 30 hours on four AA batteries, the Game Gear\'s colour backlit display drained six batteries in three to five hours. Its library, strong in ports of arcade and Master System titles, lacked the Game Boy-exclusive franchises — Pokémon, Mario Land, Zelda — that drove hardware sales.',
  },
  {
    id: 'sega-master-system', name: 'Sega Master System', shortName: 'Master System', era: '1985 – 1992',
    manufacturer: 'Sega',
    keyword: 'Sega Master System',
    description: 'The Master System was Sega\'s 8-bit console competitor to the NES — technically superior, with better graphics and sound, but commercially dominated in North America by Nintendo\'s licensing practices and in Japan by the Famicom\'s installed base. It found its strongest market in Europe and Brazil.',
    longDescription: 'The Sega Master System (known as the Mark III in Japan) launched in 1985 with a Z80 CPU, TMS9918A-derived VDP displaying 32 colours on screen from a palette of 64, and a Texas Instruments SN76489-derived sound generator. The hardware exceeded the NES in raw specifications: more colours on screen, smoother scrolling, and a wider colour palette. Despite these advantages, the NES held over 90% of the North American market — a consequence of Nintendo\'s exclusive licensing agreements with third-party publishers that prevented them from releasing games on competing platforms.\n\nEurope and Brazil told a different story. In the UK, France, Germany, and Brazil, the Master System competed effectively with the NES and often outsold it. Sega\'s European distribution infrastructure and the absence of Nintendo\'s restrictive licensing practices in European markets gave third-party developers freedom to release on both platforms, creating a more competitive environment. In Brazil specifically, the Master System\'s popularity persisted into the mid-1990s — local manufacturer TecToy produced the console and new games years after Sega had discontinued it globally.\n\nThe Master System\'s game library included genuine exclusives: Wonder Boy III: The Dragon\'s Trap (1989) was a sophisticated action RPG unavailable on NES; Phantasy Star (1987) was among the finest 8-bit RPGs on any platform; Alex Kidd in Miracle World (1986) was a polished platformer built into the console\'s BIOS as a default cartridge in later hardware revisions. These titles demonstrated Sega\'s capacity for quality first-party development that the system\'s commercial position in North America obscured.',
  },
  {
    id: 'zx-spectrum', name: 'ZX Spectrum', era: '1982 – 1992',
    manufacturer: 'Sinclair Research',
    keyword: 'ZX Spectrum',
    description: 'Clive Sinclair\'s rubber-keyed home computer was the dominant gaming platform in the United Kingdom through the 1980s, producing a generation of British programmers and a software industry that competed globally. Its 48KB of RAM and single-channel beeper defined the aesthetic of British bedroom coding.',
    longDescription: 'The ZX Spectrum launched in 1982 at £125 for the 16KB model and £175 for the 48KB model — significantly cheaper than any competitor. Clive Sinclair\'s cost-optimisation was aggressive: the rubber keyboard was cheap to manufacture; the single-channel beeper was the minimum audio hardware; the composite video output produced colour with a distinctive attribute-clash artefact where each 8×8 pixel cell could contain only two colours. These constraints were not considered limitations by the British developers who built on them — they were the material of the platform.\n\nThe ZX Spectrum\'s cultural importance in British computing cannot be overstated. A generation of UK programmers learned to code on the platform using Sinclair BASIC before progressing to machine code Z80 programming. Companies that began as bedroom coding operations — Ultimate Play the Game (which became Rare), Ocean Software, Codemasters — developed their first titles for the Spectrum before expanding to other platforms. The British games industry\'s subsequent international success in the 1990s and 2000s was directly traceable to the development talent that had been trained on Spectrum hardware.\n\nThe Spectrum\'s game library was vast but uneven: alongside genuine classics like Manic Miner, Knight Lore, and Elite, thousands of quickly-produced titles took advantage of the platform\'s low barriers to entry. The attribute-clash artefact — where moving sprites produced colour collisions with the background — was so pervasive that it became part of the platform\'s visual identity. The rubber-keyed original and the later Spectrum+ with conventional keys both sold millions of units across the UK and Europe.',
  },
  {
    id: 'famicom-disk-system', name: 'Famicom Disk System', shortName: 'Famicom Disk System', era: '1986 – 1990',
    manufacturer: 'Nintendo',
    keyword: 'Famicom Disk System',
    description: 'Nintendo\'s floppy disk add-on for the Famicom enabled rewritable game distribution, cheaper storage than cartridges, and additional audio channels via a custom sound chip — making it the platform of origin for Metroid, Zelda II, Kid Icarus, and Doki Doki Panic (the game that became Super Mario Bros. 2).',
    longDescription: 'The Famicom Disk System used proprietary 71mm "Quick Disk" floppy disks with 112KB of storage per side — more than contemporary Famicom cartridges at a significantly lower manufacturing cost. Nintendo established disk-writing kiosks in Japanese toy stores where players could have disks rewritten with new games for 500 yen, creating a distribution model without parallel in console gaming. The FDS added an extra sound channel — a wavetable synthesis unit producing a distinctive warbling tone — that Famicom games otherwise lacked, and several games used this channel for music that Famicom cartridge versions could not reproduce.\n\nThe FDS was Japan-exclusive; Nintendo shipped NES cartridge versions of FDS games internationally. This created significant differences between Japanese and Western versions: the Japanese Metroid (1986) had a save system enabled by the disk\'s rewritable storage, while the NES version required a password system. Zelda II (1987) was originally a disk game; Kid Icarus debuted on disk; the original Super Mario Bros. 2 — released as "The Lost Levels" internationally — was a FDS game considered too difficult for Western markets, leading Nintendo to ship Doki Doki Panic (another FDS game) as a reskinned substitute.\n\nThe FDS was discontinued in 1990 as cartridge capacity increased and costs decreased, eliminating its primary advantages. The save-function battery that FDS-era cartridges used as an alternative — required for later NES games that needed to save data — was less reliable but more universally compatible with the global Famicom/NES infrastructure.',
  },
  {
    id: 'colecovision', name: 'ColecoVision', era: '1982 – 1985',
    manufacturer: 'Coleco',
    keyword: 'ColecoVision',
    description: 'Coleco\'s 1982 console briefly held the most impressive home versions of arcade games, with Donkey Kong as a launch title that exceeded the Atari 2600 version so dramatically that Coleco used the comparison as a marketing cornerstone. The 1983 crash ended its commercial run.',
    longDescription: 'The ColecoVision launched in August 1982 with a Donkey Kong port that retained three of the arcade original\'s four stages — the Atari 2600 version had included only two. This difference, immediately apparent to players who had played the arcade game, gave Coleco a compelling marketing position: the console with arcade-quality games. The hardware supported it: the Z80 CPU at 3.58 MHz, TMS9918A video processor displaying 256×192 at 16 colours, and SN76489 sound generator produced specifications that exceeded the Atari 2600 significantly and competed with the Intellivision on favourable terms.\n\nThe ColecoVision sold more than 2 million units in its commercial window — strong performance for 1982-1983. The 1983 video game crash, triggered by the Atari 2600 market collapse and a flood of poor-quality software, affected all console manufacturers; Coleco discontinued the ColecoVision in 1985. The Expansion Module #1 allowed ColecoVision owners to play Atari 2600 cartridges, providing access to a much larger software library — Atari sued Coleco over it. The ColecoVision\'s legacy is primarily as the first console to demonstrate convincingly that the arcade experience could be approximated at home.',
  },
  {
    id: 'pc-9801', name: 'NEC PC-9801', shortName: 'PC-9801', era: '1982 – 2000',
    manufacturer: 'NEC',
    keyword: 'PC-9801',
    description: 'The NEC PC-9801 was Japan\'s dominant personal computer platform for nearly two decades, later running its own version of MS-DOS. It was a primary market for classic Japanese computer games including the Ys and Dragon Slayer series and the first five Touhou Project titles.',
    longDescription: 'NEC introduced the PC-9801 in 1982 as a business computer built on an 8086-compatible processor; it later ran NEC\'s own version of MS-DOS. The hardware became Japan\'s dominant personal computer architecture, maintaining over 50% market share through the late 1980s and early 1990s against IBM PC-compatible competition. The platform\'s dominance was sustained by Japanese-language software support and the ecosystem of software, including games, that had been developed specifically for its architecture.\n\nThe PC-9801\'s graphics capabilities — initially 640×400 at 8 colours, later expanded with 16-colour and eventually 256-colour modes — were superior to contemporary IBM PC CGA but required software written specifically for the platform\'s hardware rather than IBM PC standards. This created a parallel game development ecosystem entirely distinct from Western PC gaming: Nihon Falcom\'s Dragon Slayer and Ys games (which ran across NEC\'s PC-88 and PC-98 lines), Hideo Kojima\'s Policenauts (first released for the PC-9821) and the first five Touhou Project games were all built for NEC hardware before being ported to other platforms or remaining Japan-only.\n\nThe FM sound capabilities of later PC-9801 hardware — typically through optional FM sound boards using Yamaha OPN-family chips — enabled game music of quality comparable to dedicated game hardware. Yuzo Koshiro\'s Ys soundtracks, composed for PC-88 and PC-98 FM hardware before being adapted for consoles, represented the peak of Japanese home computer game music. The PC-9801\'s architecture was replaced by IBM PC-compatible hardware in Japan during the mid-1990s as PC/AT-compatible machines achieved sufficient Japanese-language software support to displace the proprietary platform.',
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
for (const d of DESIGNERS) {
  designerGamesIndex.set(d.id, games.filter(g =>
    g.developer.toLowerCase().includes(d.keyword.toLowerCase()) ||
    g.publisher.toLowerCase().includes(d.keyword.toLowerCase())
  ));
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
let cachedCompareHtml = null;
const cachedYearPageHtml = {};
const cachedDecadePageHtml = {};
const cachedEssayPageHtml = {};
const cachedGenrePageHtml = {};
const cachedGamePageHtml = new Map();
let cachedWordSearchHtml = null;
let cachedBookmarksHtml = null;
let cachedGlossaryHtml = null;
let cachedQuizHtml = null;
let cachedOnThisDayHtml = null;
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
    if (g && imageUsableAsCard(g.image)) return asUrl(g.image);
  }
  return null;
}
const GA_MEASUREMENT_ID = 'G-7PKQSXLCD8';
const GA_SNIPPET = `\n    <!-- Google tag (gtag.js) -->
    <script async src="https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}"></script>
    <script>
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('js', new Date());
      gtag('config', '${GA_MEASUREMENT_ID}');
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
  'decades': 'Retro Games by Decade — the 1960s, 70s, 80s and 90s',
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
      const canonical = SITE_URL + cleanPath;

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
      const titleMatch = body.match(/<title>([^<]*)<\/title>/);
      if (titleMatch) {
        const trimmed = trimTitle(titleMatch[1]);
        if (trimmed) body = body.replace(titleMatch[0], `<title>${trimmed}</title>`);
      }
      // Most templates build descriptions with `.substring(0, 160)` on raw
      // text, which lands over the limit once entities are escaped and cuts
      // mid-word. Re-trim every one on a word boundary.
      if (hubSlug && HUB_DESCRIPTIONS.has(hubSlug)) {
        body = body.replace(/<meta name="description" content="[^"]*"/,
          `<meta name="description" content="${escapeHtml(HUB_DESCRIPTIONS.get(hubSlug))}"`);
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
          body = body.replace(own[0], `property="og:image" content="${DEFAULT_OG_IMAGE}"`);
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
// Uematsu is a Person and an NES page is a Product, and typing them as Article
// tells a search engine the page is journalism rather than an entity. These
// types take `name` rather than `headline`, and no `publisher` — a person does
// not have one.
const ENTRY_SCHEMA_TYPE = new Map([
  ...['composers', 'designers', 'critics', 'voice-actors', 'pixel-artists', 'producers']
    .map(s => [s, 'Person']),
  ...['developers', 'publishers', 'studios'].map(s => [s, 'Organization']),
  ...['platforms', 'hardware', 'peripherals', 'controllers', 'failed-consoles',
    'arcade-boards', 'sound-chips'].map(s => [s, 'Product']),
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

function bgLogo() {
  return `<svg class="bg-logo" viewBox="0 0 120 120" aria-hidden="true">
  <circle cx="60" cy="60" r="55" fill="black" stroke="red" stroke-width="5"/>
  <text x="50%" y="55%" text-anchor="middle" fill="red" font-size="60" font-family="Arial" dy=".3em">B</text>
</svg>`;
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
  const inGroup = NAV_GROUPS.some(g => g.items.some(([id]) => id === active));
  return `<a class="skip-link" href="#main">Skip to content</a>
<nav>
    <a href="/" class="nav-logo" aria-label="Bosnan home"><img src="/logo.svg" alt="Bosnan logo" width="50" height="50"></a>
    <button class="menu-toggle" onclick="toggleMenu()" id="menuToggle" aria-label="Toggle menu" aria-controls="navLinks" aria-expanded="false">
        <span></span><span></span><span></span>
    </button>
    <div class="nav-links" id="navLinks">
        ${link('/', 'Home', 'home')}
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
        <a href="/random" class="nav-random">&#127922; Random</a>
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
  if (!imageExists(g.image)) return placeholder;
  return `<img src="/${escapeHtml(g.image)}" alt="${escapeHtml(g.title)}" ${imgAttrs}
             onerror="this.parentElement.innerHTML='<div class=\\'game-card-placeholder\\'>${escapeHtml(g.title[0])}</div>'">`;
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
    return `<a href="/games/${g.id}" class="game-card"${filterData}>
      <div class="game-card-img-wrap">
        ${cardImage(g, imgAttrs)}
        <div class="game-card-decade">${escapeHtml(g.decade)}</div>
        ${g.playUrl ? '<div class="game-card-playable">&#9654; Play</div>' : ''}
      </div>
      <div class="game-card-body">
        <h3 class="game-card-title">${escapeHtml(g.title)}</h3>
        <div class="game-card-meta">
          <span>${escapeHtml(String(g.year))}</span>
          <span class="dot">·</span>
          <span>${escapeHtml(g.genre)}</span>
        </div>
        <p class="game-card-platform">${escapeHtml(g.platform)}</p>
      </div>
    </a>`;
  }).join('');
}

// ── Routes ──────────────────────────────────────────────────────────────────

// Kept in step with the Disallow list in robots.txt below.
const SITEMAP_EXCLUDE = new Set(['/search', '/bookmarks']);

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
    <priority>0.7</priority>${imageExists(g.image) ? `
    <image:image>
      <image:loc>${base}/${escapeXml(g.image)}</image:loc>
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
    const yearUrls = YEARS.map(y => `
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
    const lostGameUrls = LOST_GAMES.map(g => `
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

    const children = new Map(grouped.map(([name, xml]) => [name, wrap(xml)]));
    const index = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${grouped.map(([name]) => `
  <sitemap>
    <loc>${base}/sitemaps/${name}.xml</loc>
    <lastmod>${today}</lastmod>
  </sitemap>`).join('')}
</sitemapindex>`;

    cachedSitemap = complete
      ? { xml: index, type: 'index', children }
      : { xml: wrap(flat), type: 'urlset', children: new Map() };
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
    if (!entry) return res.status(404).send(notFoundPage());
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
${bgLogo()}
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
  const desc = `Bosnan is an independent archive of video game history, 1952–1999 — `
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
${bgLogo()}
${nav('about')}
<section class="platforms-hero">
    <h1>About Bosnan</h1>
    <p>An independent archive of video game history, 1952–1999</p>
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
  documented before then; hardware, people and publications qualify if their significant work
  falls in the same window. Later material appears only where it is directly about that era —
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
  const gotdImgSrc = `/${escapeHtml(gotd.image)}`;
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
    <title>Bosnan – Retro Games Archive: ${games.length}+ Classic Games, 1952–1999</title>
    <meta name="description" content="Bosnan – explore legendary retro games from 1952 to 1999. Browse ${games.length}+ games across Arcade, NES, C64, SNES, Genesis and PlayStation, plus essays and hardware.">
    <script type="application/ld+json">${websiteSchema}</script>
    <script type="application/ld+json">${orgSchema}</script>
    ${cssHead()}
</head>
<body>
${bgLogo()}
${nav('home')}

<section class="home-hero">
    <h1>Retro Games Archive</h1>
    <p class="home-tagline">The history of video games, 1952&ndash;1999 — games, hardware, people, and culture</p>
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
    <h2>&#127942; Game of the Day</h2>
    <a class="gotd-card" href="${escapeHtml(gotdHref)}">
        ${imageExists(gotd.image) ? `<img class="gotd-img" src="${gotdImgSrc}" alt="${escapeHtml(gotd.title)}" fetchpriority="high" onerror="this.style.display='none'">` : ''}
        <div class="gotd-body">
            <div class="gotd-badge">${escapeHtml(gotd.decade)}</div>
            <h3 class="gotd-title">${escapeHtml(gotd.title)}</h3>
            <div class="gotd-meta">${escapeHtml(String(gotd.year))} · ${escapeHtml(gotd.genre)} · ${escapeHtml(gotd.platform)}</div>
            <p class="gotd-desc">${escapeHtml(gotdDesc)}</p>
        </div>
    </a>
</div>

<div class="news-section" id="newsSection">
    <div class="news-header">
        <h2>&#128240; Retro Gaming News</h2>
        <p>Latest from around the web, updated daily</p>
    </div>
    <div class="news-grid" id="newsGrid">
        <div class="news-loading">Loading news&#8230;</div>
    </div>
</div>

<div class="enc-section">
    <div class="enc-header">
        <h2>&#128218; Game Encyclopedia</h2>
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
    <a href="/genres" class="enc-browse-btn">Browse all 10 genres &#8594;</a>
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
    <title>All ${games.length} Retro Games, 1952–1999 – Bosnan Archive</title>
    <meta name="description" content="Browse ${games.length} legendary retro games from 1952 to 1999. Search by title, genre, platform, or decade.">
    <meta property="og:title" content="Retro Games Archive – Bosnan">
    <meta property="og:description" content="Browse ${games.length} legendary retro games from 1952 to 1999.">
    <meta property="og:type" content="website">
    <script type="application/ld+json">${itemListSchema}</script>
    ${cssHead()}
</head>
<body>
${bgLogo()}
${nav('games')}

<section class="games-hero">
    <h1>Retro Games Archive</h1>
    <p>A collection of legendary games from 1952 to 1999</p>
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

function gameDetailPage(game, base) {
  const url = `${base}/games/${game.id}`;
  const imgUrl = `${base}/${game.image}`;
  const desc = metaDesc((game.description || ''));

  const related = relatedGamesIndex.get(game.id) || [];

  const relatedHtml = related.length === 0 ? '' : `
<div class="related-section">
  <h2>More like this</h2>
  <div class="related-grid">
    ${buildCardHtml(related, 0)}
  </div>
</div>`;

  const schemaJson = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'VideoGame',
    name: game.title,
    description: game.description,
    datePublished: String(game.year),
    genre: game.genre,
    gamePlatform: game.platform,
    publisher: { '@type': 'Organization', name: game.publisher },
    applicationCategory: 'Game',
    image: imgUrl,
    url,
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
${bgLogo()}
${nav('games')}

<div class="game-detail-wrapper">
  <nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a> &rsaquo; <a href="/games">Games</a> &rsaquo; <span aria-current="page">${escapeHtml(game.title)}</span></nav>

  <div class="game-detail-card">
    <div class="game-detail-image-col">
      ${imageExists(game.image)
        ? `<img src="/${escapeHtml(game.image)}" alt="${escapeHtml(game.title)} (${game.year}) gameplay screenshot" class="game-detail-img"
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
      <div class="game-decade-badge">${escapeHtml(game.decade)}</div>
      <h1 class="game-detail-title">${escapeHtml(game.title)}</h1>
      <p class="game-detail-year">${escapeHtml(String(game.year))} &middot; ${escapeHtml(game.genre)} &middot; ${escapeHtml(game.platform)}</p>
      ${bookmarkBtn(game.id, game.title, 'game')}
      <div class="game-detail-desc">
        <h2>Overview</h2>
        <p>${escapeHtml(game.description)}</p>
      </div>
      <div class="game-detail-desc">
        <h2>Deep Dive</h2>
        <p>${escapeHtml(game.longDescription)}</p>
      </div>
      ${game.devStory ? `<div class="game-detail-desc">
        <h2>Developer Story</h2>
        <p>${escapeHtml(game.devStory)}</p>
      </div>` : ''}
      ${game.trivia && game.trivia.length ? `<div class="game-detail-desc game-trivia">
        <h2>Did You Know?</h2>
        <ul class="trivia-list">
          ${game.trivia.map(t => `<li>${escapeHtml(t)}</li>`).join('\n          ')}
        </ul>
      </div>` : ''}
      <div class="game-play-actions">
        ${game.playUrl ? `<a href="${escapeHtml(game.playUrl)}" target="_blank" rel="noopener" class="btn btn-play">&#9654; Play Online</a>` : ''}
        ${game.downloadUrl ? `<a href="${escapeHtml(game.downloadUrl)}" target="_blank" rel="noopener" class="btn btn-download">&#11015; Download</a>` : ''}
      </div>
      <button class="share-btn" id="shareBtn" onclick="shareGame()">&#128279; Share this game</button>
    </div>
  </div>
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
            setTimeout(() => { btn.innerHTML = '&#128279; Share this game'; }, 2000);
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
${bgLogo()}
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
${bgLogo()}
${nav('platforms')}

<div class="platform-detail-wrapper">
  <a href="/platforms" class="back-link">&#8592; All Platforms</a>
  <div class="platform-detail-header">
    <h1>${escapeHtml(platform.name)}</h1>
    <p class="platform-detail-era">${escapeHtml(platform.manufacturer)} &middot; ${escapeHtml(platform.era)}</p>
    <p class="platform-detail-desc">${escapeHtml(platform.description)}</p>
    <p class="platform-detail-desc">${escapeHtml(platform.longDescription)}</p>
  </div>

  <h2 class="platform-games-heading">${platformGames.length} Games in Archive</h2>
  <div class="games-grid" id="gamesGrid">${cardHtml}</div>
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
${bgLogo()}
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
${bgLogo()}
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
      <div class="essay-card-category">${escapeHtml(label)}</div>
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
${bgLogo()}
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
${bgLogo()}
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
${bgLogo()}
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
${bgLogo()}
${nav('developers')}

<div class="platform-detail-wrapper">
  <a href="/developers" class="back-link">&#8592; All Developers</a>
  <div class="platform-detail-header">
    <h1>${escapeHtml(dev.name)}</h1>
    <p class="platform-detail-era">${escapeHtml(dev.country)} &middot; Founded ${escapeHtml(String(dev.founded))} &middot; ${escapeHtml(dev.role)}</p>
    <p class="platform-detail-desc">${escapeHtml(dev.description)}</p>
    <p class="platform-detail-desc">${escapeHtml(dev.longDescription)}</p>
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
${bgLogo()}
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
${bgLogo()}
${nav('composers')}
<div class="platform-detail-wrapper">
  <a href="/composers" class="back-link">&#8592; All Composers</a>
  <div class="platform-detail-header">
    <h1>${escapeHtml(c.name)}</h1>
    <p class="platform-detail-era">${escapeHtml(c.country)} &middot; Born ${escapeHtml(String(c.born))} &middot; ${escapeHtml(c.role)}</p>
    <p class="platform-detail-desc">${escapeHtml(c.description)}</p>
    <p class="platform-detail-desc">${escapeHtml(c.longDescription)}</p>
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
${bgLogo()}
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
${bgLogo()}
${nav('franchises')}
<div class="platform-detail-wrapper">
  <a href="/franchises" class="back-link">&#8592; All Franchises</a>
  <div class="platform-detail-header">
    <h1>${escapeHtml(f.name)}</h1>
    <p class="platform-detail-era">${escapeHtml(f.developer)} &middot; Since ${escapeHtml(String(f.since))}</p>
    <p class="platform-detail-desc">${escapeHtml(f.description)}</p>
    <p class="platform-detail-desc">${escapeHtml(f.longDescription)}</p>
  </div>
  <h2 class="platform-games-heading">${fGames.length} Game${fGames.length !== 1 ? 's' : ''} in Archive</h2>
  <div class="games-grid" id="gamesGrid">${cardHtml}</div>
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
${bgLogo()}
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

function hardwareDetailPage(hw) {
  const specRows = (hw.specs || []).map(s =>
    `<tr><th>${escapeHtml(s.label)}</th><td>${escapeHtml(s.value)}</td></tr>`
  ).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(hw.name)} – Hardware – Bosnan</title>
    <meta name="description" content="${metaDesc(hw.description)}">
    ${cssHead()}
</head>
<body>
${bgLogo()}
${nav('hardware')}
<div class="platform-detail-wrapper">
  <a href="/hardware" class="back-link">&#8592; All Hardware</a>
  <div class="platform-detail-header">
    <h1>${escapeHtml(hw.name)}</h1>
    <p class="platform-detail-era">${escapeHtml(hw.manufacturer)} &middot; ${escapeHtml(String(hw.year))} &middot; ${escapeHtml(hw.fullName)}</p>
    <p class="platform-detail-desc">${escapeHtml(hw.description)}</p>
    <p class="platform-detail-desc">${escapeHtml(hw.longDescription)}</p>
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
${bgLogo()}
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
${bgLogo()}
${nav('designers')}
<div class="platform-detail-wrapper">
  <a href="/designers" class="back-link">&#8592; All Designers</a>
  <div class="platform-detail-header">
    <h1>${escapeHtml(d.name)}</h1>
    <p class="platform-detail-era">${escapeHtml(d.country)} &middot; Born ${escapeHtml(String(d.born))} &middot; ${escapeHtml(d.employer)} &middot; ${escapeHtml(d.role)}</p>
    <p class="platform-detail-desc">${escapeHtml(d.description)}</p>
    <p class="platform-detail-desc">${escapeHtml(d.longDescription)}</p>
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
${bgLogo()}
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

function yearDetailPage(year, review) {
  const yGames = (yearsIndex.get(year) || []).slice().sort((a, b) => a.title.localeCompare(b.title));
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
    <title>${year} in Gaming – Bosnan</title>
    <meta name="description" content="${review ? metaDesc(review.summary) : metaDesc(listingDesc(yGames, `released in ${year}`))}">
    <style>h1,h2,h3{font-family:inherit}</style>
    ${cssHead()}
</head>
<body>
${bgLogo()}
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
${bgLogo()}
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
${bgLogo()}
${nav('regional')}
<div class="essay-wrapper">
  <a href="/regional" class="back-link">&#8592; All Regional Differences</a>
  <div class="essay-header">
    <div class="essay-meta">${escapeHtml(r.region1)} vs ${escapeHtml(r.region2)} &middot; ${escapeHtml(r.game)} &middot; ${escapeHtml(r.readTime)}</div>
    <h1 class="essay-title">${escapeHtml(r.title)}</h1>
    <p class="essay-subtitle">${escapeHtml(r.subtitle)}</p>
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
${bgLogo()}
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
${bgLogo()}
${nav('publishers')}
<div class="platform-detail-wrapper">
  <a href="/publishers" class="back-link">&#8592; All Publishers</a>
  <div class="platform-detail-header">
    <h1>${escapeHtml(pub.name)}</h1>
    <p class="platform-detail-era">${escapeHtml(pub.country)} &middot; Founded ${pub.founded}${pub.dissolved ? ' &middot; Closed ' + pub.dissolved : ''} &middot; ${escapeHtml(pub.era)}</p>
    <p class="platform-detail-desc">${escapeHtml(pub.description)}</p>
    <p class="platform-detail-desc">${escapeHtml(pub.longDescription)}</p>
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
${bgLogo()}
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
${bgLogo()}
${nav('arcade-boards')}
<div class="platform-detail-wrapper">
  <a href="/arcade-boards" class="back-link">&#8592; All Arcade Boards</a>
  <div class="platform-detail-header">
    <h1>${escapeHtml(board.name)}</h1>
    <p class="platform-detail-era">${escapeHtml(board.manufacturer)} &middot; ${board.year} &middot; ${escapeHtml(board.era || '')}</p>
    ${board.cpu ? `<p class="platform-detail-era" style="font-size:0.9em;opacity:0.8">CPU: ${escapeHtml(board.cpu)}</p>` : ''}
    <p class="platform-detail-desc">${escapeHtml(board.description)}</p>
    <p class="platform-detail-desc">${escapeHtml(board.longDescription)}</p>
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
${bgLogo()}
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
${bgLogo()}
${nav('peripherals')}
<div class="platform-detail-wrapper">
  <a href="/peripherals" class="back-link">&#8592; All Peripherals</a>
  <div class="platform-detail-header">
    <h1>${escapeHtml(periph.name)}</h1>
    <p class="platform-detail-era">${escapeHtml(periph.manufacturer)} &middot; ${periph.year} &middot; ${escapeHtml(periph.platform)}</p>
    <p class="platform-detail-desc">${escapeHtml(periph.description)}</p>
    <p class="platform-detail-desc">${escapeHtml(periph.longDescription)}</p>
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
${bgLogo()}
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
${bgLogo()}
${nav('lost-games')}
<div class="platform-detail-wrapper">
  <a href="/lost-games" class="back-link">&#8592; All Lost Games</a>
  <div class="platform-detail-header">
    <h1>${escapeHtml(g.title)}</h1>
    <p class="platform-detail-era">${escapeHtml(g.developer)} &middot; ${escapeHtml(g.platform)} &middot; ${g.year} &middot; <em>${escapeHtml(g.status)}</em></p>
    <p class="platform-detail-desc">${escapeHtml(g.description)}</p>
    <p class="platform-detail-desc">${escapeHtml(g.longDescription)}</p>
    ${g.discoveredBy ? `<div class="dev-notable"><strong>Prototype discovered by:</strong> ${escapeHtml(g.discoveredBy)}</div>` : ''}
    ${factList ? `<div class="dev-notable"><strong>Key Facts:</strong><ul class="trivia-list">${factList}</ul></div>` : ''}
  </div>
${sourcesBlock(g)}</div>
${toggleScript()}
</body>
</html>`;
}

function decadesListPage() {
  const cards = DECADES.map(d => {
    const count = (decadesIndex.get(d) || []).length;
    return `<a href="/decades/${encodeURIComponent(d)}" class="platform-card">
      <div class="platform-card-name">${escapeHtml(d)}</div>
      <div class="platform-card-count">${count} game${count !== 1 ? 's' : ''}</div>
    </a>`;
  }).join('');
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Browse by Decade – Bosnan</title>
    <meta name="description" content="Browse the Bosnan game archive by decade — from the 1960s golden age to the 1990s 3D revolution.">
    ${cssHead()}
</head>
<body>
${bgLogo()}
${nav('decades')}
<section class="platforms-hero">
    <h1>Browse by Decade</h1>
    <p>The arc of gaming history, decade by decade</p>
</section>
<div class="platforms-grid">${cards}</div>
${toggleScript()}
</body>
</html>`;
}

function decadeDetailPage(decade) {
  const dGames = (decadesIndex.get(decade) || []).sort((a, b) => a.year - b.year);
  const cardHtml = buildCardHtml(dGames, EAGER_IMAGES);
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(decade)} Games – Bosnan</title>
    <meta name="description" content="${metaDesc(listingDesc(dGames, `from the ${decade}`))}">
    ${cssHead()}
</head>
<body>
${bgLogo()}
${nav('decades')}
<section class="platforms-hero">
    <h1>${escapeHtml(decade)}</h1>
    <p>${dGames.length} game${dGames.length !== 1 ? 's' : ''} in the archive from this decade</p>
</section>
<h2 class="sr-only">Games from the ${escapeHtml(decade)}</h2>
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
${bgLogo()}
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
${bgLogo()}
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
${bgLogo()}
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
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Sequels That Changed Everything – Bosnan</title><meta name="description" content="How sequels reinvented their franchises: Mario 3, A Link to the Past, Symphony of the Night, Super Metroid and more."><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${bgLogo()}${nav('sequels')}<section class="platforms-hero"><h1>Sequels That Changed Everything</h1><p>Not just more — fundamentally different</p></section><div class="platforms-grid">${cards}</div>${toggleScript()}</body></html>`;
}

function sequelDetailPage(item) {
  const changed = (item.changedWhat || []).map(c => `<li>${escapeHtml(c)}</li>`).join('');
  const facts = (item.keyFacts || []).map(f => `<li>${escapeHtml(f)}</li>`).join('');
  const sections = (item.sections || []).map(s => `<div class="essay-section"><h2>${escapeHtml(s.title)}</h2>${s.html}</div>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escapeHtml(item.title)} – Sequels – Bosnan</title><meta name="description" content="${metaDesc(item.description)}"><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${bgLogo()}${nav('sequels')}<div class="essay-wrapper"><a href="/sequels" class="back-link">&#8592; All Sequels</a><div class="essay-header"><div class="essay-meta">${escapeHtml(item.series)} &middot; ${escapeHtml(item.platform)} &middot; ${item.year}</div><h1 class="essay-title">${escapeHtml(item.title)}</h1><p class="essay-subtitle">${escapeHtml(item.description)}</p>${item.original ? `<p style="color:var(--text-muted);font-size:0.9em">Follows: <em>${escapeHtml(item.original)}</em></p>` : ''}</div>${changed ? `<div class="essay-section"><h2>What Changed</h2><ul class="trivia-list">${changed}</ul></div>` : ''}${sections}${facts ? `<div class="essay-section"><h2>Key Facts</h2><ul class="trivia-list">${facts}</ul></div>` : ''}${sourcesBlock(item)}${relatedBlock(item)}</div>${toggleScript()}</body></html>`;
}

function romHacksListPage() {
  const typeColors = { 'Difficulty Hack': '#ef9a9a', 'Translation': '#90caf9', 'Total Conversion': '#ce93d8', 'Restoration': '#a5d6a7', 'Randomiser': '#ffcc80', 'Bug Fix': '#b0bec5' };
  const cards = ROM_HACKS.map(r => `<a href="/rom-hacks/${r.id}" class="platform-card">
    <div class="platform-card-name">${escapeHtml(r.title)}</div>
    <div class="platform-card-era">${escapeHtml(r.baseGame)} &middot; ${r.year}</div>
    <div class="platform-card-count" style="color:${typeColors[r.type]||'var(--text-muted)'}">${escapeHtml(r.type)}</div>
    <p class="platform-card-desc">${escapeHtml(r.description)}</p>
  </a>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>ROM Hacks &amp; Mods – Bosnan</title><meta name="description" content="Famous ROM hacks and fan modifications: Kaizo Mario, Doom WADs, Zelda randomiser, Mother fan translation and more."><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${bgLogo()}${nav('rom-hacks')}<section class="platforms-hero"><h1>ROM Hacks &amp; Mods</h1><p>Fan modifications, translations, and total conversions</p></section><div class="platforms-grid">${cards}</div>${toggleScript()}</body></html>`;
}

function romHackDetailPage(item) {
  const facts = (item.keyFacts || []).map(f => `<li>${escapeHtml(f)}</li>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escapeHtml(item.title)} – ROM Hacks – Bosnan</title><meta name="description" content="${metaDesc(item.description)}"><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${bgLogo()}${nav('rom-hacks')}<div class="platform-detail-wrapper"><a href="/rom-hacks" class="back-link">&#8592; All ROM Hacks</a><div class="platform-detail-header"><h1>${escapeHtml(item.title)}</h1><p class="platform-detail-era">Base: ${escapeHtml(item.baseGame)} &middot; ${escapeHtml(item.platform)} &middot; ${item.year} &middot; ${escapeHtml(item.type)}</p>${item.creator ? `<p class="platform-detail-era" style="font-size:0.9em;opacity:0.7">Creator: ${escapeHtml(item.creator)}</p>` : ''}<p class="platform-detail-desc">${escapeHtml(item.description)}</p><p class="platform-detail-desc">${escapeHtml(item.longDescription)}</p>${item.notableFor ? `<div class="dev-notable"><strong>Legacy:</strong> ${escapeHtml(item.notableFor)}</div>` : ''}${facts ? `<div class="dev-notable"><strong>Key Facts:</strong><ul class="trivia-list">${facts}</ul></div>` : ''}</div></div>${toggleScript()}</body></html>`;
}

function adCampaignsListPage() {
  const cards = AD_CAMPAIGNS.map(a => `<a href="/ad-campaigns/${a.id}" class="platform-card">
    <div class="platform-card-name">${escapeHtml(a.title)}</div>
    <div class="platform-card-era">${escapeHtml(a.company)} &middot; ${a.year}</div>
    <div class="platform-card-count" style="font-style:italic;color:var(--accent)">${escapeHtml(a.tagline || '')}</div>
    <p class="platform-card-desc">${escapeHtml(a.description)}</p>
  </a>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Advertising Campaigns – Bosnan</title><meta name="description" content="Iconic game advertising: Genesis Does What Nintendon't, PlayStation Double Life, Now You're Playing With Power and more."><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${bgLogo()}${nav('ad-campaigns')}<section class="platforms-hero"><h1>Advertising Campaigns</h1><p>The marketing that shaped the console wars</p></section><div class="platforms-grid">${cards}</div>${toggleScript()}</body></html>`;
}

function adCampaignDetailPage(item) {
  const facts = (item.keyFacts || []).map(f => `<li>${escapeHtml(f)}</li>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escapeHtml(item.title)} – Ad Campaigns – Bosnan</title><meta name="description" content="${metaDesc(item.description)}"><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${bgLogo()}${nav('ad-campaigns')}<div class="platform-detail-wrapper"><a href="/ad-campaigns" class="back-link">&#8592; All Campaigns</a><div class="platform-detail-header"><h1>${escapeHtml(item.title)}</h1><p class="platform-detail-era">${escapeHtml(item.company)} &middot; ${item.year} &middot; ${escapeHtml(item.product || '')}</p>${item.tagline ? `<blockquote style="border-left:3px solid var(--accent);padding-left:1rem;margin:1rem 0;font-style:italic;font-size:1.2em;color:var(--accent)">"${escapeHtml(item.tagline)}"</blockquote>` : ''}<p class="platform-detail-desc">${escapeHtml(item.description)}</p><p class="platform-detail-desc">${escapeHtml(item.longDescription)}</p>${item.impact ? `<div class="dev-notable"><strong>Impact:</strong> ${escapeHtml(item.impact)}</div>` : ''}${facts ? `<div class="dev-notable"><strong>Key Facts:</strong><ul class="trivia-list">${facts}</ul></div>` : ''}</div></div>${toggleScript()}</body></html>`;
}

function salesFiguresPage() {
  const cards = SALES_FIGURES.map(s => `<a href="/sales-figures/${s.id}" class="platform-card">
    <div class="platform-card-name">${escapeHtml(s.title)}</div>
    <div class="platform-card-era">${escapeHtml(s.type)} &middot; ${escapeHtml(s.period)}</div>
    <div class="platform-card-count" style="font-size:1.2em;font-weight:900;color:var(--accent)">${escapeHtml(s.units)}</div>
    <p class="platform-card-desc">${escapeHtml(s.description)}</p>
  </a>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Sales Figures – Bosnan</title><meta name="description" content="Retro gaming by the numbers: NES, Game Boy, PlayStation, Tetris, Super Mario Bros. and the sales that defined the industry."><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${bgLogo()}${nav('sales-figures')}<section class="platforms-hero"><h1>Sales Figures</h1><p>Gaming history measured in units and dollars</p></section><div class="platforms-grid">${cards}</div>${toggleScript()}</body></html>`;
}

function salesFigureDetailPage(item) {
  const context = (item.context || []).map(c => `<li>${escapeHtml(c)}</li>`).join('');
  const facts = (item.keyFacts || []).map(f => `<li>${escapeHtml(f)}</li>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escapeHtml(item.title)} – Sales Figures – Bosnan</title><meta name="description" content="${metaDesc(item.description)}"><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${bgLogo()}${nav('sales-figures')}<div class="platform-detail-wrapper"><a href="/sales-figures" class="back-link">&#8592; All Sales Figures</a><div class="platform-detail-header"><h1>${escapeHtml(item.title)}</h1><p class="platform-detail-era">${escapeHtml(item.type)} &middot; ${escapeHtml(item.period)}</p><div style="font-size:3em;font-weight:900;color:var(--accent);margin:0.5rem 0">${escapeHtml(item.units)}</div><p class="platform-detail-desc">${escapeHtml(item.description)}</p><p class="platform-detail-desc">${escapeHtml(item.longDescription)}</p>${context ? `<div class="dev-notable"><strong>In Context:</strong><ul class="trivia-list">${context}</ul></div>` : ''}${facts ? `<div class="dev-notable"><strong>Key Facts:</strong><ul class="trivia-list">${facts}</ul></div>` : ''}</div></div>${toggleScript()}</body></html>`;
}

function speedrunsListPage() {
  const cards = SPEEDRUNS.map(s => `<a href="/speedruns/${s.id}" class="platform-card">
    <div class="platform-card-name">${escapeHtml(s.game)}</div>
    <div class="platform-card-era">${escapeHtml(s.platform)} &middot; ${escapeHtml(s.category)}</div>
    <div class="platform-card-count" style="font-family:monospace;color:var(--accent)">${escapeHtml(s.currentWR)}</div>
    <p class="platform-card-desc">${escapeHtml(s.description)}</p>
  </a>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Speedruns – Bosnan</title><meta name="description" content="Iconic speedrun histories: Super Mario Bros. sub-5, Ocarina of Time wrong warp, GoldenEye bond tricks and more."><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${bgLogo()}${nav('speedruns')}<section class="platforms-hero"><h1>Speedruns</h1><p>The races to the bottom of the clock</p></section><div class="platforms-grid">${cards}</div>${toggleScript()}</body></html>`;
}

function speedrunDetailPage(item) {
  const techniques = (item.famousTechniques || []).map(t => `<li>${escapeHtml(t)}</li>`).join('');
  const runners = (item.notableRunners || []).map(r => `<li>${escapeHtml(r)}</li>`).join('');
  const facts = (item.keyFacts || []).map(f => `<li>${escapeHtml(f)}</li>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escapeHtml(item.game)} Speedrun – Bosnan</title><meta name="description" content="${metaDesc(item.description)}"><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${bgLogo()}${nav('speedruns')}<div class="platform-detail-wrapper"><a href="/speedruns" class="back-link">&#8592; All Speedruns</a><div class="platform-detail-header"><h1>${escapeHtml(item.game)}</h1><p class="platform-detail-era">${escapeHtml(item.platform)} &middot; ${escapeHtml(item.category)} &middot; ${item.year}</p><div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin:1rem 0">${item.currentWR ? `<div style="background:var(--surface-1);border-radius:6px;padding:1rem;text-align:center"><div style="font-size:0.8em;color:var(--text-muted);margin-bottom:0.3rem">Current WR</div><div style="font-size:1.6em;font-weight:900;font-family:monospace;color:var(--accent)">${escapeHtml(item.currentWR)}</div></div>` : ''}${item.firstKnownRun ? `<div style="background:var(--surface-1);border-radius:6px;padding:1rem;text-align:center"><div style="font-size:0.8em;color:var(--text-muted);margin-bottom:0.3rem">First Known Run</div><div style="font-size:1.6em;font-weight:900;font-family:monospace;color:var(--text-muted)">${escapeHtml(item.firstKnownRun)}</div></div>` : ''}</div><p class="platform-detail-desc">${escapeHtml(item.description)}</p><p class="platform-detail-desc">${escapeHtml(item.longDescription)}</p>${techniques ? `<div class="dev-notable"><strong>Famous Techniques:</strong><ul class="trivia-list">${techniques}</ul></div>` : ''}${runners ? `<div class="dev-notable"><strong>Notable Runners:</strong><ul class="trivia-list">${runners}</ul></div>` : ''}${facts ? `<div class="dev-notable"><strong>Key Facts:</strong><ul class="trivia-list">${facts}</ul></div>` : ''}</div>${sourcesBlock(item)}${relatedBlock(item)}</div>${toggleScript()}</body></html>`;
}

function criticsListPage() {
  const cards = CRITICS.map(c => `<a href="/critics/${c.id}" class="platform-card">
    <div class="platform-card-name">${escapeHtml(c.name)}</div>
    <div class="platform-card-era">${escapeHtml(c.role)} &middot; ${escapeHtml(c.outlet)} &middot; ${escapeHtml(c.era)}</div>
    <p class="platform-card-desc">${escapeHtml(c.description)}</p>
  </a>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Critics &amp; Journalists – Bosnan</title><meta name="description" content="The writers who shaped games coverage: Bill Kunkel, Dave Halverson, Jeff Gerstmann, Kieron Gillen and more."><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${bgLogo()}${nav('critics')}<section class="platforms-hero"><h1>Critics &amp; Journalists</h1><p>The writers who shaped how we talk about games</p></section><div class="platforms-grid">${cards}</div>${toggleScript()}</body></html>`;
}

function criticDetailPage(item) {
  const work = gameLinkList(item.notableWork);
  const facts = (item.keyFacts || []).map(f => `<li>${escapeHtml(f)}</li>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escapeHtml(item.name)} – Critics – Bosnan</title><meta name="description" content="${metaDesc(item.description)}"><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${bgLogo()}${nav('critics')}<div class="platform-detail-wrapper"><a href="/critics" class="back-link">&#8592; All Critics</a><div class="platform-detail-header"><h1>${escapeHtml(item.name)}</h1><p class="platform-detail-era">${escapeHtml(item.role)} &middot; ${escapeHtml(item.outlet)} &middot; ${escapeHtml(item.era)}${item.nationality ? ' &middot; ' + escapeHtml(item.nationality) : ''}</p><p class="platform-detail-desc">${escapeHtml(item.description)}</p><p class="platform-detail-desc">${escapeHtml(item.longDescription)}</p>${work ? `<div class="dev-notable"><strong>Notable Work:</strong><ul class="trivia-list">${work}</ul></div>` : ''}${facts ? `<div class="dev-notable"><strong>Key Facts:</strong><ul class="trivia-list">${facts}</ul></div>` : ''}</div>${sourcesBlock(item)}</div>${toggleScript()}</body></html>`;
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
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Word Search – Bosnan</title><meta name="description" content="A retro gaming word search: find classic game titles from the Bosnan archive hidden in the grid. A new puzzle is generated on every server restart."><style>h1,h2{font-family:inherit}td.found{background:var(--accent-soft);color:var(--accent);font-weight:700}td.sel{background:var(--surface-3)}</style>${cssHead()}</head><body>${bgLogo()}${nav('wordsearch')}<div class="essay-wrapper"><div class="essay-header"><h1 class="essay-title">Word Search</h1><p class="essay-subtitle">Find ${placed.length} retro game titles — refreshes with new words each server restart</p></div><div style="display:grid;grid-template-columns:auto 200px;gap:2rem;align-items:start;flex-wrap:wrap"><div style="overflow-x:auto"><table style="border-collapse:collapse">${cells}</table></div><div><h2 style="margin-bottom:0.8rem;font-size:1.1rem">Find these words:</h2><ul style="list-style:none;padding:0;margin:0">${wordItems}</ul><p id="winMsg" style="display:none;color:var(--accent);font-weight:700;margin-top:1rem">You found them all!</p></div></div></div>
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
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Bookmarks – Bosnan</title><meta name="description" content="Your saved games, essays, and articles."><meta name="robots" content="noindex, follow"><style>h1,h2{font-family:inherit}.bm-card{display:block;background:var(--surface-1);border-radius:8px;padding:1rem 1.2rem;margin-bottom:0.8rem;text-decoration:none;color:inherit;border:1px solid var(--border)}.bm-card:hover{border-color:var(--accent)}.bm-type{font-size:var(--fs-xs);color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:0.3rem}.bm-title{font-weight:700}.bm-remove{float:right;background:none;border:none;color:var(--text-faint);cursor:pointer;font-size:1.2em;padding:0}</style>${cssHead()}</head><body>${bgLogo()}${nav('bookmarks')}<div class="essay-wrapper"><div class="essay-header"><h1 class="essay-title">Bookmarks</h1><p class="essay-subtitle">Your saved items</p></div><div id="bmList"><p style="color:var(--text-muted)">No bookmarks yet — click the Save button on any game or article page.</p></div></div>
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
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Controversies – Bosnan</title><meta name="description" content="The scandals and controversies that shaped gaming history: ESRB creation, Doom moral panic, Hot Coffee, the 1983 crash and more."><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${bgLogo()}${nav('controversies')}<section class="platforms-hero"><h1>Controversies</h1><p>The scandals, moral panics, and flashpoints that changed gaming</p></section><div class="platforms-grid">${cards}</div>${toggleScript()}</body></html>`;
}

function controversyDetailPage(item) {
  const gamesHtml = (item.games || []).map(g => `<span style="background:var(--surface-2);border-radius:3px;padding:0.2rem 0.5rem;font-size:0.85em">${escapeHtml(g)}</span>`).join(' ');
  const facts = (item.keyFacts || []).map(f => `<li>${escapeHtml(f)}</li>`).join('');
  const sectionsHtml = (item.sections || []).map(s => `<div class="essay-section"><h2>${escapeHtml(s.title)}</h2>${s.html}</div>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escapeHtml(item.title)} – Controversies – Bosnan</title><meta name="description" content="${metaDesc(item.description)}"><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${bgLogo()}${nav('controversies')}<div class="essay-wrapper"><a href="/controversies" class="back-link">&#8592; All Controversies</a><div class="essay-header"><div class="essay-meta">${item.year} &middot; ${escapeHtml(item.era)}</div><h1 class="essay-title">${escapeHtml(item.title)}</h1><p class="essay-subtitle">${escapeHtml(item.description)}</p>${gamesHtml ? `<div style="margin-top:0.8rem;display:flex;gap:0.4rem;flex-wrap:wrap">${gamesHtml}</div>` : ''}</div>${sectionsHtml}${item.outcome ? `<div class="essay-section"><h2>Outcome</h2><p>${escapeHtml(item.outcome)}</p></div>` : ''}${facts ? `<div class="essay-section"><h2>Key Facts</h2><ul class="trivia-list">${facts}</ul></div>` : ''}${sourcesBlock(item)}${relatedBlock(item)}</div>${toggleScript()}</body></html>`;
}

function failedConsolesListPage() {
  const cards = FAILED_CONSOLES.map(c => `<a href="/failed-consoles/${c.id}" class="platform-card">
    <div class="platform-card-name">${escapeHtml(c.name)}</div>
    <div class="platform-card-era">${escapeHtml(c.manufacturer)} &middot; ${c.year}–${c.discontinued || '?'}</div>
    <div class="platform-card-count">${escapeHtml(c.unitsSold || 'Unknown units')}</div>
    <p class="platform-card-desc">${escapeHtml(c.description)}</p>
  </a>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Failed Consoles – Bosnan</title><meta name="description" content="Postmortems on the consoles that didn't make it: Atari Jaguar, 3DO, Virtual Boy, Philips CD-i, Sega 32X and more."><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${bgLogo()}${nav('failed-consoles')}<section class="platforms-hero"><h1>Failed Consoles</h1><p>The hardware that history passed by</p></section><div class="platforms-grid">${cards}</div>${toggleScript()}</body></html>`;
}

function failedConsoleDetailPage(item) {
  const goodGames = gameLinkList(item.goodGames);
  const facts = (item.keyFacts || []).map(f => `<li>${escapeHtml(f)}</li>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escapeHtml(item.name)} – Failed Consoles – Bosnan</title><meta name="description" content="${metaDesc(item.description)}"><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${bgLogo()}${nav('failed-consoles')}<div class="platform-detail-wrapper"><a href="/failed-consoles" class="back-link">&#8592; All Failed Consoles</a><div class="platform-detail-header"><h1>${escapeHtml(item.name)}</h1><p class="platform-detail-era">${escapeHtml(item.manufacturer)} &middot; ${item.year}–${item.discontinued || '?'} &middot; ${escapeHtml(item.unitsSold || 'Unknown units sold')}</p><p class="platform-detail-desc">${escapeHtml(item.description)}</p><p class="platform-detail-desc">${escapeHtml(item.longDescription)}</p>${goodGames ? `<div class="dev-notable"><strong>Worth Playing:</strong><ul class="trivia-list">${goodGames}</ul></div>` : ''}${facts ? `<div class="dev-notable"><strong>Key Facts:</strong><ul class="trivia-list">${facts}</ul></div>` : ''}${item.verdict ? `<div class="dev-notable" style="margin-top:1rem"><strong>Verdict:</strong> ${escapeHtml(item.verdict)}</div>` : ''}</div>${sourcesBlock(item)}${relatedBlock(item)}</div>${toggleScript()}</body></html>`;
}

function gameEnginesListPage() {
  const cards = GAME_ENGINES.map(e => `<a href="/game-engines/${e.id}" class="platform-card">
    <div class="platform-card-name">${escapeHtml(e.name)}</div>
    <div class="platform-card-era">${escapeHtml(e.developer)} &middot; ${e.year}${e.language ? ' &middot; ' + escapeHtml(e.language) : ''}</div>
    <p class="platform-card-desc">${escapeHtml(e.description)}</p>
  </a>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Game Engines – Bosnan</title><meta name="description" content="The engines that powered retro gaming: Doom engine, Quake, Build Engine, SCUMM, GoldSrc and more."><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${bgLogo()}${nav('game-engines')}<section class="platforms-hero"><h1>Game Engines</h1><p>The technology that made the games possible</p></section><div class="platforms-grid">${cards}</div>${toggleScript()}</body></html>`;
}

function gameEngineDetailPage(item) {
  const games = gameLinkList(item.notableGames);
  const facts = (item.keyFacts || []).map(f => `<li>${escapeHtml(f)}</li>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escapeHtml(item.name)} – Game Engines – Bosnan</title><meta name="description" content="${metaDesc(item.description)}"><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${bgLogo()}${nav('game-engines')}<div class="platform-detail-wrapper"><a href="/game-engines" class="back-link">&#8592; All Game Engines</a><div class="platform-detail-header"><h1>${escapeHtml(item.name)}</h1><p class="platform-detail-era">${escapeHtml(item.developer)} &middot; ${item.year} &middot; ${escapeHtml(item.era)}${item.language ? ' &middot; ' + escapeHtml(item.language) : ''}</p><p class="platform-detail-desc">${escapeHtml(item.description)}</p><p class="platform-detail-desc">${escapeHtml(item.longDescription)}</p>${games ? `<div class="dev-notable"><strong>Notable Games:</strong><ul class="trivia-list">${games}</ul></div>` : ''}${facts ? `<div class="dev-notable"><strong>Key Facts:</strong><ul class="trivia-list">${facts}</ul></div>` : ''}</div></div>${toggleScript()}</body></html>`;
}

function soundChipsListPage() {
  const cards = SOUND_CHIPS.map(c => `<a href="/sound-chips/${c.id}" class="platform-card">
    <div class="platform-card-name">${escapeHtml(c.name)}</div>
    <div class="platform-card-era">${escapeHtml(c.manufacturer)} &middot; ${c.year}${c.voices ? ' &middot; ' + c.voices + ' voices' : ''}</div>
    <div class="platform-card-count">${(c.foundIn || []).slice(0, 3).map(p => escapeHtml(p)).join(', ')}</div>
    <p class="platform-card-desc">${escapeHtml(c.description)}</p>
  </a>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Sound Chips – Bosnan</title><meta name="description" content="The silicon that made the music: SID, YM2612, SPC700, OPL2, Paula and the chips that defined retro game audio."><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${bgLogo()}${nav('sound-chips')}<section class="platforms-hero"><h1>Sound Chips</h1><p>The hardware that made the music of a generation</p></section><div class="platforms-grid">${cards}</div>${toggleScript()}</body></html>`;
}

function soundChipDetailPage(item) {
  const platforms = (item.foundIn || []).map(p => `<li>${escapeHtml(p)}</li>`).join('');
  const tracks = gameLinkList(item.notableTracks);
  const facts = (item.keyFacts || []).map(f => `<li>${escapeHtml(f)}</li>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escapeHtml(item.name)} – Sound Chips – Bosnan</title><meta name="description" content="${metaDesc(item.description)}"><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${bgLogo()}${nav('sound-chips')}<div class="platform-detail-wrapper"><a href="/sound-chips" class="back-link">&#8592; All Sound Chips</a><div class="platform-detail-header"><h1>${escapeHtml(item.name)}</h1><p class="platform-detail-era">${escapeHtml(item.manufacturer)} &middot; ${item.year} &middot; ${escapeHtml(item.era)}${item.voices ? ' &middot; ' + item.voices + ' voices' : ''}</p><p class="platform-detail-desc">${escapeHtml(item.description)}</p><p class="platform-detail-desc">${escapeHtml(item.longDescription)}</p>${platforms ? `<div class="dev-notable"><strong>Found In:</strong><ul class="trivia-list">${platforms}</ul></div>` : ''}${tracks ? `<div class="dev-notable"><strong>Iconic Tracks:</strong><ul class="trivia-list">${tracks}</ul></div>` : ''}${facts ? `<div class="dev-notable"><strong>Key Facts:</strong><ul class="trivia-list">${facts}</ul></div>` : ''}</div>${sourcesBlock(item)}</div>${toggleScript()}</body></html>`;
}

function easterEggsListPage() {
  const cards = EASTER_EGGS.map(e => `<a href="/easter-eggs/${e.id}" class="platform-card">
    <div class="platform-card-name">${escapeHtml(e.title)}</div>
    <div class="platform-card-era">${escapeHtml(e.game)} &middot; ${escapeHtml(e.platform)} &middot; ${e.year}</div>
    <p class="platform-card-desc">${escapeHtml(e.description)}</p>
  </a>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Easter Eggs – Bosnan</title><meta name="description" content="Hidden secrets in retro games: the first-ever Easter egg in Adventure, the Konami Code, Doom's id room, GoldenEye paintball mode and more."><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${bgLogo()}${nav('easter-eggs')}<section class="platforms-hero"><h1>Easter Eggs</h1><p>Hidden secrets, developer jokes, and undocumented features</p></section><div class="platforms-grid">${cards}</div>${toggleScript()}</body></html>`;
}

function easterEggDetailPage(item) {
  const facts = (item.keyFacts || []).map(f => `<li>${escapeHtml(f)}</li>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escapeHtml(item.title)} – Easter Eggs – Bosnan</title><meta name="description" content="${metaDesc(item.description)}"><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${bgLogo()}${nav('easter-eggs')}<div class="platform-detail-wrapper"><a href="/easter-eggs" class="back-link">&#8592; All Easter Eggs</a><div class="platform-detail-header"><h1>${escapeHtml(item.title)}</h1><p class="platform-detail-era">${escapeHtml(item.game)} &middot; ${escapeHtml(item.platform)} &middot; ${item.year}${item.discoveredYear && item.discoveredYear !== item.year ? ' &middot; discovered ' + item.discoveredYear : ''}</p><p class="platform-detail-desc">${escapeHtml(item.description)}</p><p class="platform-detail-desc">${escapeHtml(item.longDescription)}</p>${item.howToFind ? `<div class="dev-notable" style="border-left:3px solid var(--accent);padding-left:1rem;margin-top:1rem"><strong>How to find it:</strong><p style="margin-top:0.4rem;color:var(--text-secondary)">${escapeHtml(item.howToFind)}</p></div>` : ''}${facts ? `<div class="dev-notable"><strong>Key Facts:</strong><ul class="trivia-list">${facts}</ul></div>` : ''}</div>${sourcesBlock(item)}${relatedBlock(item)}</div>${toggleScript()}</body></html>`;
}

function cheatCodesListPage() {
  const cards = CHEAT_CODES.map(c => `<a href="/cheat-codes/${c.id}" class="platform-card">
    <div class="platform-card-name">${escapeHtml(c.title)}</div>
    <div class="platform-card-era">${escapeHtml(c.game)} &middot; ${escapeHtml(c.platform)} &middot; ${c.year}</div>
    <div class="platform-card-count" style="font-family:monospace;font-size:0.8em;color:var(--accent)">${escapeHtml(c.code)}</div>
    <p class="platform-card-desc">${escapeHtml(c.effect)}</p>
  </a>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Cheat Codes – Bosnan</title><meta name="description" content="Classic cheat codes from retro gaming: Konami Code, IDDQD, ABACABB, Justin Bailey and more."><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${bgLogo()}${nav('cheat-codes')}<section class="platforms-hero"><h1>Cheat Codes</h1><p>The codes that became part of gaming folklore</p></section><div class="platforms-grid">${cards}</div>${toggleScript()}</body></html>`;
}

function cheatCodeDetailPage(item) {
  const facts = (item.keyFacts || []).map(f => `<li>${escapeHtml(f)}</li>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escapeHtml(item.title)} – Cheat Codes – Bosnan</title><meta name="description" content="${metaDesc(`${item.effect} — the ${item.code} cheat for ${item.game} on ${item.platform} (${item.year}), with how it was found and what it does.`)}"><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${bgLogo()}${nav('cheat-codes')}<div class="platform-detail-wrapper"><a href="/cheat-codes" class="back-link">&#8592; All Cheat Codes</a><div class="platform-detail-header"><h1>${escapeHtml(item.title)}</h1><p class="platform-detail-era">${escapeHtml(item.game)} &middot; ${escapeHtml(item.platform)} &middot; ${item.year} &middot; ${escapeHtml(item.type)}</p><div style="background:var(--surface-1);border:1px solid var(--border);border-radius:6px;padding:1rem 1.5rem;margin:1rem 0;font-family:monospace;font-size:1.1em;letter-spacing:0.04em;color:var(--accent)">${escapeHtml(item.code)}</div><p class="platform-detail-desc"><strong>Effect:</strong> ${escapeHtml(item.effect)}</p><p class="platform-detail-desc">${escapeHtml(item.description)}</p>${facts ? `<div class="dev-notable"><strong>Key Facts:</strong><ul class="trivia-list">${facts}</ul></div>` : ''}</div>${sourcesBlock(item)}${relatedBlock(item)}</div>${toggleScript()}</body></html>`;
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
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Glossary – Bosnan</title><meta name="description" content="Retro gaming terminology explained: SHMUP, Metroidvania, roguelike, chiptune, blast processing, Mode 7 and more."><script type="application/ld+json">${glossarySchema}</script><style>h1,h2,h3{font-family:inherit}</style>${cssHead()}</head><body>${bgLogo()}${nav('glossary')}<div class="essay-wrapper"><div class="essay-header"><h1 class="essay-title">Glossary</h1><p class="essay-subtitle">${GLOSSARY.length} retro gaming terms defined</p></div><div style="display:flex;flex-wrap:wrap;gap:0.4rem;margin-bottom:2rem">${alphaLinks}</div>${alphaEntries}</div>${toggleScript()}</body></html>`;
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
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Trivia Quiz – Bosnan</title><meta name="description" content="Ten randomised trivia questions on classic games, consoles and the people who made them, drawn from the Bosnan retro archive. New questions every visit."><style>h1,h2{font-family:inherit}.quiz-btn-correct{background:rgba(76,175,80,0.3)!important;border-color:#4caf50!important}.quiz-btn-wrong{background:rgba(244,67,54,0.3)!important;border-color:#f44336!important}</style>${cssHead()}</head><body>${bgLogo()}${nav('quiz')}<div class="essay-wrapper"><div class="essay-header"><h1 class="essay-title">Trivia Quiz</h1><p class="essay-subtitle">10 random questions from the archive — refreshes each visit</p></div><div id="score" style="font-size:1.1em;margin-bottom:1.5rem;color:var(--text-muted)">Score: <span id="scoreVal">0</span> / <span id="total">0</span></div>${questions}<div id="result" style="display:none;margin-top:2rem;text-align:center"><h2 id="resultMsg"></h2><a href="/quiz" style="display:inline-block;margin-top:1rem;background:var(--accent);color:var(--on-accent);padding:0.6rem 1.5rem;border-radius:5px;font-weight:700;text-decoration:none">Play Again</a></div></div><script>let cur=0,score=0,answered=false;function answer(btn,correct,chosen){if(answered)return;answered=true;const btns=btn.parentElement.querySelectorAll('button');btns.forEach(b=>{b.disabled=true;if(b.textContent.trim()===correct)b.classList.add('quiz-btn-correct');});if(chosen===correct){score++;btn.classList.add('quiz-btn-correct');}else{btn.classList.add('quiz-btn-wrong');}document.getElementById('scoreVal').textContent=score;document.getElementById('total').textContent=cur+1;setTimeout(()=>nextQ(),900);}function nextQ(){const qs=document.querySelectorAll('.quiz-question');if(cur<qs.length-1){qs[cur].style.display='none';cur++;qs[cur].style.display='block';answered=false;}else{document.querySelectorAll('.quiz-question').forEach(q=>q.style.display='none');const r=document.getElementById('result');r.style.display='block';const pct=Math.round(score/qs.length*100);document.getElementById('resultMsg').textContent=score+'/'+qs.length+' — '+pct+'%';}}</script>${toggleScript()}</body></html>`;
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
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>On This Day – Bosnan</title><meta name="description" content="Video game history that happened on ${monthName} ${day} — console launches, landmark releases and industry milestones from the Bosnan retro archive."><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${bgLogo()}${nav('on-this-day')}<div class="essay-wrapper"><div class="essay-header"><h1 class="essay-title">On This Day</h1><p class="essay-subtitle">${monthName} ${day} in gaming history</p></div>${todayHtml}${monthEvents.length ? `<h2 style="margin-bottom:1rem">All of ${monthName}</h2>${monthHtml}` : ''}</div>${toggleScript()}</body></html>`;
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

  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Studio Map – Bosnan</title><meta name="description" content="World map of iconic retro game studios: Nintendo in Kyoto, id Software in Texas, Rare in the UK, DMA Design in Dundee."><style>h1,h2{font-family:inherit}.studio-dot circle:hover{r:9;opacity:1}</style>${cssHead()}</head><body>${bgLogo()}${nav('map')}<div class="essay-wrapper"><div class="essay-header"><h1 class="essay-title">Studio Map</h1><p class="essay-subtitle">Where the games were made — ${studios.length} iconic studios</p></div><div style="position:relative;background:var(--surface-1);border:1px solid var(--border);border-radius:8px;overflow:hidden;margin-bottom:2rem"><svg viewBox="0 0 100 60" style="width:100%;display:block;background:linear-gradient(180deg,#0a1628 0%,#1a2a1a 100%)">
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
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Gaming Magazines – Bosnan</title><meta name="description" content="Profiles of the gaming magazines that shaped the industry: EGM, Nintendo Power, Edge, Famitsu, GameFan, CVG and more."><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${bgLogo()}${nav('magazines')}<section class="platforms-hero"><h1>Gaming Magazines</h1><p>The print media that shaped a generation of players</p></section><div class="platforms-grid">${cards}</div>${toggleScript()}</body></html>`;
}

function magazineDetailPage(mag) {
  const issues = (mag.notableIssues || []).map(i => `<li>${escapeHtml(i)}</li>`).join('');
  const facts = (mag.keyFacts || []).map(f => `<li>${escapeHtml(f)}</li>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escapeHtml(mag.name)} – Magazines – Bosnan</title><meta name="description" content="${metaDesc(mag.description)}"><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${bgLogo()}${nav('magazines')}<div class="platform-detail-wrapper"><a href="/magazines" class="back-link">&#8592; All Magazines</a><div class="platform-detail-header"><h1>${escapeHtml(mag.name)}</h1><p class="platform-detail-era">${escapeHtml(mag.country)} &middot; ${mag.founded}${mag.closed ? '–' + mag.closed : '–present'}</p><p class="platform-detail-desc">${escapeHtml(mag.description)}</p><p class="platform-detail-desc">${escapeHtml(mag.longDescription)}</p>${issues ? `<div class="dev-notable"><strong>Notable Issues:</strong><ul class="trivia-list">${issues}</ul></div>` : ''}${facts ? `<div class="dev-notable"><strong>Key Facts:</strong><ul class="trivia-list">${facts}</ul></div>` : ''}</div>${sourcesBlock(mag)}</div>${toggleScript()}</body></html>`;
}

function boxArtListPage() {
  const cards = BOX_ART.map(b => `<a href="/box-art/${b.id}" class="platform-card">
    <div class="platform-card-name">${escapeHtml(b.title)}</div>
    <div class="platform-card-era">${escapeHtml(b.platform)} &middot; ${b.year} &middot; ${escapeHtml(b.region)}</div>
    <p class="platform-card-desc">${escapeHtml(b.description)}</p>
  </a>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Box Art – Bosnan</title><meta name="description" content="Iconic retro game box art: the infamous Mega Man NES cover, Earthbound's oversized box, Castlevania, Contra, and more."><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${bgLogo()}${nav('box-art')}<section class="platforms-hero"><h1>Box Art</h1><p>The covers that launched a thousand arguments</p></section><div class="platforms-grid">${cards}</div>${toggleScript()}</body></html>`;
}

function boxArtDetailPage(entry) {
  const facts = (entry.keyFacts || []).map(f => `<li>${escapeHtml(f)}</li>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escapeHtml(entry.title)} Box Art – Bosnan</title><meta name="description" content="${metaDesc(entry.description)}"><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${bgLogo()}${nav('box-art')}<div class="platform-detail-wrapper"><a href="/box-art" class="back-link">&#8592; All Box Art</a><div class="platform-detail-header"><h1>${escapeHtml(entry.title)}</h1><p class="platform-detail-era">${escapeHtml(entry.platform)} &middot; ${entry.year} &middot; ${escapeHtml(entry.region)}${entry.artist ? ' &middot; Art: ' + escapeHtml(entry.artist) : ''}</p><p class="platform-detail-desc">${escapeHtml(entry.description)}</p><p class="platform-detail-desc">${escapeHtml(entry.longDescription)}</p>${facts ? `<div class="dev-notable"><strong>Key Facts:</strong><ul class="trivia-list">${facts}</ul></div>` : ''}</div></div>${toggleScript()}</body></html>`;
}

function portsListPage() {
  const cards = PORTS.map(p => `<a href="/ports/${p.id}" class="platform-card">
    <div class="platform-card-name">${escapeHtml(p.title)}</div>
    <div class="platform-card-era">${escapeHtml(p.originalPlatform)} &middot; ${p.year}</div>
    <div class="platform-card-count">${(p.versions || []).length} version${(p.versions || []).length !== 1 ? 's' : ''} compared</div>
    <p class="platform-card-desc">${escapeHtml(p.description)}</p>
  </a>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Port Comparisons – Bosnan</title><meta name="description" content="How retro games changed across platforms: Street Fighter II, Doom, Mortal Kombat, Pac-Man, Tetris and more compared version by version."><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${bgLogo()}${nav('ports')}<section class="platforms-hero"><h1>Port Comparisons</h1><p>How games changed — or didn't — on their journey to every platform</p></section><div class="platforms-grid">${cards}</div>${toggleScript()}</body></html>`;
}

function portDetailPage(port) {
  const qualityColor = { 'Excellent': '#a5d6a7', 'Good': '#c5e1a5', 'Acceptable': '#ffe082', 'Poor': '#ffab91', 'Infamous': '#ef9a9a' };
  const versionsHtml = (port.versions || []).map(v => `<div style="background:var(--surface-1);border-radius:6px;padding:1rem 1.2rem;margin-bottom:0.8rem"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.5rem"><strong>${escapeHtml(v.platform)} (${v.year})</strong><span style="background:${qualityColor[v.quality] || 'var(--text-muted)'};color:var(--on-accent);padding:0.2rem 0.6rem;border-radius:3px;font-size:var(--fs-xs);font-weight:700">${escapeHtml(v.quality)}</span></div><p style="color:var(--text-secondary);font-size:0.9em;line-height:1.6;margin:0">${escapeHtml(v.notes)}</p></div>`).join('');
  const facts = (port.keyFacts || []).map(f => `<li>${escapeHtml(f)}</li>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escapeHtml(port.title)} – Port Comparisons – Bosnan</title><meta name="description" content="${metaDesc(port.description)}"><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${bgLogo()}${nav('ports')}<div class="platform-detail-wrapper"><a href="/ports" class="back-link">&#8592; All Port Comparisons</a><div class="platform-detail-header"><h1>${escapeHtml(port.title)}</h1><p class="platform-detail-era">Original: ${escapeHtml(port.originalPlatform)} &middot; ${port.year}</p><p class="platform-detail-desc">${escapeHtml(port.description)}</p><p class="platform-detail-desc">${escapeHtml(port.longDescription)}</p><h2 style="margin-top:1.5rem;margin-bottom:1rem">Version Breakdown</h2>${versionsHtml}${facts ? `<div class="dev-notable" style="margin-top:1rem"><strong>Key Facts:</strong><ul class="trivia-list">${facts}</ul></div>` : ''}</div></div>${toggleScript()}</body></html>`;
}

function voiceActorsListPage() {
  const cards = VOICE_ACTORS.map(v => `<a href="/voice-actors/${v.id}" class="platform-card">
    <div class="platform-card-name">${escapeHtml(v.name)}</div>
    <div class="platform-card-era">${escapeHtml(v.nationality)} &middot; ${escapeHtml(v.era)}</div>
    <p class="platform-card-desc">${escapeHtml(v.description)}</p>
  </a>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Voice Actors – Bosnan</title><meta name="description" content="The voices of retro gaming: Charles Martinet, David Hayter, Cam Clarke, Jennifer Hale and the actors who defined iconic characters."><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${bgLogo()}${nav('voice-actors')}<section class="platforms-hero"><h1>Voice Actors</h1><p>The voices behind the characters</p></section><div class="platforms-grid">${cards}</div>${toggleScript()}</body></html>`;
}

function voiceActorDetailPage(va) {
  const roles = gameLinkList(va.notableRoles);
  const facts = (va.keyFacts || []).map(f => `<li>${escapeHtml(f)}</li>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escapeHtml(va.name)} – Voice Actors – Bosnan</title><meta name="description" content="${metaDesc(va.description)}"><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${bgLogo()}${nav('voice-actors')}<div class="platform-detail-wrapper"><a href="/voice-actors" class="back-link">&#8592; All Voice Actors</a><div class="platform-detail-header"><h1>${escapeHtml(va.name)}</h1><p class="platform-detail-era">${escapeHtml(va.nationality)}${va.born ? ' &middot; b. ' + va.born : ''} &middot; ${escapeHtml(va.era)}</p><p class="platform-detail-desc">${escapeHtml(va.description)}</p><p class="platform-detail-desc">${escapeHtml(va.longDescription)}</p>${roles ? `<div class="dev-notable"><strong>Notable Roles:</strong><ul class="trivia-list">${roles}</ul></div>` : ''}${facts ? `<div class="dev-notable"><strong>Key Facts:</strong><ul class="trivia-list">${facts}</ul></div>` : ''}</div>${sourcesBlock(va)}</div>${toggleScript()}</body></html>`;
}

function pixelArtistsListPage() {
  const cards = PIXEL_ARTISTS.map(a => `<a href="/pixel-artists/${a.id}" class="platform-card">
    <div class="platform-card-name">${escapeHtml(a.name)}</div>
    <div class="platform-card-era">${escapeHtml(a.nationality)} &middot; ${escapeHtml(a.era)}</div>
    <p class="platform-card-desc">${escapeHtml(a.description)}</p>
  </a>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Pixel Artists – Bosnan</title><meta name="description" content="The pixel artists and visual designers of retro gaming: Yoshitaka Amano, Ken Sugimori, Naoto Ohshima, Yoji Shinkawa and more."><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${bgLogo()}${nav('pixel-artists')}<section class="platforms-hero"><h1>Pixel Artists</h1><p>The visual creators of retro gaming's iconic look</p></section><div class="platforms-grid">${cards}</div>${toggleScript()}</body></html>`;
}

function pixelArtistDetailPage(artist) {
  const work = gameLinkList(artist.notableWork);
  const facts = (artist.keyFacts || []).map(f => `<li>${escapeHtml(f)}</li>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escapeHtml(artist.name)} – Pixel Artists – Bosnan</title><meta name="description" content="${metaDesc(artist.description)}"><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${bgLogo()}${nav('pixel-artists')}<div class="platform-detail-wrapper"><a href="/pixel-artists" class="back-link">&#8592; All Pixel Artists</a><div class="platform-detail-header"><h1>${escapeHtml(artist.name)}</h1><p class="platform-detail-era">${escapeHtml(artist.nationality)}${artist.born ? ' &middot; b. ' + artist.born : ''} &middot; ${escapeHtml(artist.era)}</p><p class="platform-detail-desc">${escapeHtml(artist.description)}</p><p class="platform-detail-desc">${escapeHtml(artist.longDescription)}</p>${work ? `<div class="dev-notable"><strong>Notable Work:</strong><ul class="trivia-list">${work}</ul></div>` : ''}${facts ? `<div class="dev-notable"><strong>Key Facts:</strong><ul class="trivia-list">${facts}</ul></div>` : ''}</div>${sourcesBlock(artist)}</div>${toggleScript()}</body></html>`;
}

function producersListPage() {
  const cards = PRODUCERS.map(p => `<a href="/producers/${p.id}" class="platform-card">
    <div class="platform-card-name">${escapeHtml(p.name)}</div>
    <div class="platform-card-era">${escapeHtml(p.role)} &middot; ${escapeHtml(p.company)} &middot; ${escapeHtml(p.era)}</div>
    <p class="platform-card-desc">${escapeHtml(p.description)}</p>
  </a>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Producers &amp; Executives – Bosnan</title><meta name="description" content="The business figures and producers who shaped retro gaming: Hiroshi Yamauchi, Minoru Arakawa, Tom Kalinske, Nolan Bushnell and more."><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${bgLogo()}${nav('producers')}<section class="platforms-hero"><h1>Producers &amp; Executives</h1><p>The business minds and decision-makers behind the games</p></section><div class="platforms-grid">${cards}</div>${toggleScript()}</body></html>`;
}

function producerDetailPage(prod) {
  const work = gameLinkList(prod.notableWork);
  const facts = (prod.keyFacts || []).map(f => `<li>${escapeHtml(f)}</li>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escapeHtml(prod.name)} – Producers – Bosnan</title><meta name="description" content="${metaDesc(prod.description)}"><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${bgLogo()}${nav('producers')}<div class="platform-detail-wrapper"><a href="/producers" class="back-link">&#8592; All Producers</a><div class="platform-detail-header"><h1>${escapeHtml(prod.name)}</h1><p class="platform-detail-era">${escapeHtml(prod.role)} &middot; ${escapeHtml(prod.company)}${prod.born ? ' &middot; b. ' + prod.born : ''} &middot; ${escapeHtml(prod.era)}</p><p class="platform-detail-desc">${escapeHtml(prod.description)}</p><p class="platform-detail-desc">${escapeHtml(prod.longDescription)}</p>${work ? `<div class="dev-notable"><strong>Notable Work:</strong><ul class="trivia-list">${work}</ul></div>` : ''}${facts ? `<div class="dev-notable"><strong>Key Facts:</strong><ul class="trivia-list">${facts}</ul></div>` : ''}</div>${sourcesBlock(prod)}</div>${toggleScript()}</body></html>`;
}

function collectionsListPage() {
  const cards = COLLECTIONS.map(c => `<a href="/collections/${c.id}" class="platform-card">
    <div class="platform-card-name">${escapeHtml(c.title)}</div>
    <div class="platform-card-era">${escapeHtml(c.category)} &middot; ${(c.items || []).length} entries</div>
    <p class="platform-card-desc">${escapeHtml(c.description)}</p>
  </a>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Curated Lists – Bosnan</title><meta name="description" content="Curated editorial lists: most influential games, best soundtracks, hardest games, graphical milestones and more."><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${bgLogo()}${nav('collections')}<section class="platforms-hero"><h1>Curated Lists</h1><p>Editorial picks and ranked selections from the archive</p></section><div class="platforms-grid">${cards}</div>${toggleScript()}</body></html>`;
}

function collectionDetailPage(col) {
  const itemsHtml = (col.items || []).map(item => `<div style="display:grid;grid-template-columns:2.5rem 1fr;gap:0.8rem;align-items:start;padding:0.9rem 0;border-bottom:1px solid var(--surface-3)"><div style="font-size:1.5em;font-weight:900;color:var(--accent);text-align:center;padding-top:0.1rem">${item.rank}</div><div><div style="font-weight:700;margin-bottom:0.2rem">${escapeHtml(item.title)}</div><div style="color:var(--text-secondary);font-size:0.9em;line-height:1.5">${escapeHtml(item.note)}</div></div></div>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escapeHtml(col.title)} – Bosnan</title><meta name="description" content="${metaDesc(col.description)}"><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${bgLogo()}${nav('collections')}<div class="essay-wrapper"><a href="/collections" class="back-link">&#8592; All Lists</a><div class="essay-header"><div class="essay-meta">${escapeHtml(col.category)}</div><h1 class="essay-title">${escapeHtml(col.title)}</h1><p class="essay-subtitle">${escapeHtml(col.subtitle || col.description)}</p></div><div style="margin-top:1rem">${itemsHtml}</div></div>${toggleScript()}</body></html>`;
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
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Archive Stats – Bosnan</title><meta name="description" content="How the Bosnan retro archive breaks down: games per platform, genre and decade, plus totals for essays, playable titles and reference sections."><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${bgLogo()}${nav('stats')}<div class="essay-wrapper"><div class="essay-header"><h1 class="essay-title">Archive Stats</h1><p class="essay-subtitle">By the numbers</p></div><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:1rem;margin-bottom:2.5rem">${statCard('Games', games.length)}${statCard('Platforms', PLATFORMS.length)}${statCard('Essays', totalEssays)}${statCard('Playable', playable, 'with play link')}${statCard('Sections', totalSections, 'profiles & articles')}</div><div style="display:grid;grid-template-columns:1fr 1fr;gap:2rem;flex-wrap:wrap"><div><h2 style="margin-bottom:1rem">Top Platforms</h2>${topPlatforms.map(([p, c]) => barRow(p, c, topPlatforms[0][1])).join('')}</div><div><h2 style="margin-bottom:1rem">Top Genres</h2>${topGenres.map(([g, c]) => barRow(g, c, topGenres[0][1])).join('')}</div></div><div style="margin-top:2rem"><h2 style="margin-bottom:1rem">By Decade</h2><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:0.8rem">${Object.entries(byDecade).sort().map(([d, c]) => `<div style="background:var(--surface-1);border-radius:6px;padding:0.8rem 1rem;text-align:center"><div style="font-size:1.3em;font-weight:700;color:var(--accent)">${c}</div><div style="font-size:0.85em">${escapeHtml(d)}</div></div>`).join('')}</div></div></div>${toggleScript()}</body></html>`;
}

function recentPage() {
  const recentGames = [...games].sort((a, b) => b.year - a.year).slice(0, 48);
  const recentEssays = ESSAYS.slice(-12).reverse();
  const cardHtml = buildCardHtml(recentGames, EAGER_IMAGES);
  const essayLinks = recentEssays.map(e => `<a href="/essays/${e.id}" class="platform-card"><div class="platform-card-name">${escapeHtml(e.title)}</div><p class="platform-card-desc">${escapeHtml((e.summary || '').substring(0, 100))}</p></a>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Recently Added – Bosnan</title><meta name="description" content="The newest essays and games added to the Bosnan retro archive, listed newest first so you can see what has changed since your last visit."><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${bgLogo()}${nav('recent')}<section class="platforms-hero"><h1>Recently Added</h1><p>The newest content in the archive</p></section><h2 style="max-width:var(--content);margin:1.5rem auto 1rem;padding:0 var(--sp-5)">Latest Essays</h2><div class="platforms-grid">${essayLinks}</div><h2 style="max-width:var(--content);margin:2rem auto 1rem;padding:0 var(--sp-5)">Games by Year (Newest First)</h2><div class="games-grid">${cardHtml}</div>${toggleScript()}</body></html>`;
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

  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Timeline – Bosnan</title><meta name="description" content="A year-by-year timeline of video game history from Tennis for Two in 1958 to the PlayStation 2 era, covering hardware launches and landmark releases."><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${bgLogo()}${nav('timeline')}<div class="essay-wrapper"><div class="essay-header"><h1 class="essay-title">Timeline</h1><p class="essay-subtitle">Gaming history from Spacewar! to the PS2 era — a chronological view</p></div><div style="margin-top:2rem">${eventsHtml}</div></div>${toggleScript()}</body></html>`;
}

function glitchesListPage() {
  const cards = GLITCHES.map(g => `<a href="/glitches/${g.id}" class="platform-card">
    <div class="platform-card-name">${escapeHtml(g.title)}</div>
    <div class="platform-card-era">${escapeHtml(g.game)} &middot; ${escapeHtml(g.platform)} &middot; ${g.year} &middot; ${escapeHtml(g.type)}</div>
    <p class="platform-card-desc">${escapeHtml(g.description)}</p>
  </a>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Notable Glitches – Bosnan</title><meta name="description" content="Bugs that became features — Rocket Jump, wavedash, BLJ, and the glitches that changed games."><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${bgLogo()}${nav('glitches')}<section class="platforms-hero"><h1>Notable Glitches</h1><p>Bugs that became beloved — exploits that communities adopted as features</p></section><div class="platforms-grid">${cards}</div>${toggleScript()}</body></html>`;
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
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Game Packaging &amp; Boxes – Bosnan</title><meta name="description" content="The art of the retail box before digital — Ultima feelies, NES black boxes, big-box PC epics."><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${bgLogo()}${nav('packaging')}<section class="platforms-hero"><h1>Game Packaging &amp; Boxes</h1><p>The retail box as artefact — from cloth maps and coins to three-disc jewel cases</p></section><div class="platforms-grid">${cards}</div>${toggleScript()}</body></html>`;
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
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Co-op &amp; Multiplayer Milestones – Bosnan</title><meta name="description" content="How multiplayer evolved from Pong to 4-player GoldenEye — the milestones that changed gaming together."><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${bgLogo()}${nav('multiplayer')}<section class="platforms-hero"><h1>Co-op &amp; Multiplayer Milestones</h1><p>How gaming together evolved — from two paddles on a screen to split-screen deathmatches</p></section><div class="platforms-grid">${cards}</div>${toggleScript()}</body></html>`;
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
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Tie-in Comics – Bosnan</title><meta name="description" content="Game-based comics and manga — Sonic Archie, Nintendo Comics System, Pokémon Adventures, and more."><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${bgLogo()}${nav('comics')}<section class="platforms-hero"><h1>Tie-in Comics</h1><p>When games became sequential art — official comics, manga, and graphic novels</p></section><div class="platforms-grid">${cards}</div>${toggleScript()}</body></html>`;
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
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Studio Origin Stories – Bosnan</title><meta name="description" content="How the great game studios came to exist — garage startups, corporate rebellions, and dorm room legends."><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${bgLogo()}${nav('studios')}<section class="platforms-hero"><h1>Studio Origin Stories</h1><p>Dorm rooms, farmhouses, and corporate rebellions — how the great studios began</p></section><div class="platforms-grid">${cards}</div>${toggleScript()}</body></html>`;
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
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Import Gaming Culture – Bosnan</title><meta name="description" content="Playing Japanese games before Western release — grey imports, converter carts, and the fax machine era."><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${bgLogo()}${nav('imports')}<section class="platforms-hero"><h1>Import Gaming Culture</h1><p>Playing Japanese releases before Western localisation — grey imports, converter carts, and obsession</p></section><div class="platforms-grid">${cards}</div>${toggleScript()}</body></html>`;
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
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Speedrun Techniques – Bosnan</title><meta name="description" content="The specific tricks that define competitive speedrunning — wrong warps, BLJ, wavedash, and more."><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${bgLogo()}${nav('speedrun-techniques')}<section class="platforms-hero"><h1>Speedrun Techniques</h1><p>The exploits and tricks that define competitive speedrunning — documented and explained</p></section><div class="platforms-grid">${cards}</div>${toggleScript()}</body></html>`;
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
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Famous Bugs – Bosnan</title><meta name="description" content="Glitches that shaped history — the Minus World, Hall of Fame corruption, and bugs that changed gaming."><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${bgLogo()}${nav('famous-bugs')}<section class="platforms-hero"><h1>Famous Bugs</h1><p>Unintended code with outsized consequences — beloved, infamous, and industry-changing</p></section><div class="platforms-grid">${cards}</div>${toggleScript()}</body></html>`;
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
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Retro Revival Games – Bosnan</title><meta name="description" content="Modern games that channelled retro aesthetics deliberately — Cave Story, Shovel Knight, Undertale, and more."><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${bgLogo()}${nav('retro-revival')}<section class="platforms-hero"><h1>Retro Revival Games</h1><p>Modern games that deliberately channelled the retro era — and what they understood about it</p></section><div class="platforms-grid">${cards}</div>${toggleScript()}</body></html>`;
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
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Iconic Sound Effects – Bosnan</title><meta name="description" content="The sounds that defined retro gaming — Mario's jump, Pac-Man's death, the Zelda item jingle."><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${bgLogo()}${nav('sound-effects')}<section class="platforms-hero"><h1>Iconic Sound Effects</h1><p>The sounds you can hear just by reading their names</p></section><div class="platforms-grid">${cards}</div>${toggleScript()}</body></html>`;
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
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Iconic Boss Fights – Bosnan</title><meta name="description" content="The most memorable boss encounters in retro gaming — Mike Tyson, Mother Brain, Psycho Mantis, and more."><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${bgLogo()}${nav('bossfights')}<section class="platforms-hero"><h1>Iconic Boss Fights</h1><p>The encounters that defined retro gaming — designed to challenge, surprise, and be remembered</p></section><div class="platforms-grid">${cards}</div>${toggleScript()}</body></html>`;
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
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Game Soundtracks – Bosnan</title><meta name="description" content="Deep dives into the landmark game soundtracks — Nobuo Uematsu, Koji Kondo, David Wise, and more."><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${bgLogo()}${nav('soundtracks')}<section class="platforms-hero"><h1>Game Soundtracks</h1><p>The music that made retro games unforgettable</p></section><div class="platforms-grid">${cards}</div>${toggleScript()}</body></html>`;
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
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Instruction Manuals – Bosnan</title><meta name="description" content="The golden age of game manuals — booklets that built worlds before the game even loaded."><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${bgLogo()}${nav('manuals')}<section class="platforms-hero"><h1>Instruction Manuals</h1><p>The booklets that built worlds before you pressed Start</p></section><div class="platforms-grid">${cards}</div>${toggleScript()}</body></html>`;
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
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Difficulty &amp; Hard Modes – Bosnan</title><meta name="description" content="The games that broke controllers and tested patience — Battletoads, Ghosts 'n Goblins, Ninja Gaiden, and more."><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${bgLogo()}${nav('difficulty')}<section class="platforms-hero"><h1>Difficulty &amp; Hard Modes</h1><p>The games that demanded everything — and gave no quarter</p></section><div class="platforms-grid">${cards}</div>${toggleScript()}</body></html>`;
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
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Fictional Characters – Bosnan</title><meta name="description" content="Lore profiles for gaming's most iconic characters — Mario, Link, Samus, Sonic, Cloud, and more."><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${bgLogo()}${nav('characters')}<section class="platforms-hero"><h1>Fictional Characters</h1><p>The heroes, villains, and icons who defined retro gaming culture</p></section><div class="platforms-grid">${cards}</div>${toggleScript()}</body></html>`;
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
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Cover Stories – Bosnan</title><meta name="description" content="Landmark gaming magazine covers and the moments that defined games journalism."><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${bgLogo()}${nav('cover-stories')}<section class="platforms-hero"><h1>Cover Stories</h1><p>The magazine covers and issues that captured gaming history as it happened</p></section><div class="platforms-grid">${cards}</div>${toggleScript()}</body></html>`;
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
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Controllers &amp; Input Devices – Bosnan</title><meta name="description" content="The controllers that shaped how we play — D-pad, analog stick, light gun, and beyond."><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${bgLogo()}${nav('controllers')}<section class="platforms-hero"><h1>Controllers &amp; Input Devices</h1><p>The hardware that sits between player and game — designed to disappear</p></section><div class="platforms-grid">${cards}</div>${toggleScript()}</body></html>`;
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
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Sequel Disappointments – Bosnan</title><meta name="description" content="Highly anticipated follow-ups that fell short — analysed fairly and in context."><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${bgLogo()}${nav('disappointments')}<section class="platforms-hero"><h1>Sequel Disappointments</h1><p>Anticipated follow-ups that didn't deliver — examined in context, without cruelty</p></section><div class="platforms-grid">${cards}</div>${toggleScript()}</body></html>`;
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
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Level Design Hall of Fame – Bosnan</title><meta name="description" content="Iconic individual levels analysed as design works — World 1-1, Chemical Plant, E1M1, and more."><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${bgLogo()}${nav('levels')}<section class="platforms-hero"><h1>Level Design Hall of Fame</h1><p>Individual levels that demonstrate what great game design looks like</p></section><div class="platforms-grid">${cards}</div>${toggleScript()}</body></html>`;
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
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Gaming Urban Legends – Bosnan</title><meta name="description" content="Polybius, Lavender Town Syndrome, the buried E.T. cartridges — gaming's myths investigated."><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${bgLogo()}${nav('urban-legends')}<section class="platforms-hero"><h1>Gaming Urban Legends</h1><p>The myths, rumours, and folklore that grew up around retro games — investigated</p></section><div class="platforms-grid">${cards}</div>${toggleScript()}</body></html>`;
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
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Cancelled Games – Bosnan</title><meta name="description" content="Games that were announced but never released — from StarFox 2 to Sonic X-treme."><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${bgLogo()}${nav('cancelled')}<section class="platforms-hero"><h1>Cancelled Games</h1><p>Announced, developed, and then shelved — the games that never made it</p></section><div class="platforms-grid">${cards}</div>${toggleScript()}</body></html>`;
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
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Localization Differences – Bosnan</title><meta name="description" content="How games changed between regional releases — censorship, renamed characters, altered content."><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${bgLogo()}${nav('localization')}<section class="platforms-hero"><h1>Localization Differences</h1><p>How games changed crossing borders — censored blood, renamed heroes, and rewritten stories</p></section><div class="platforms-grid">${cards}</div>${toggleScript()}</body></html>`;
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
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Prototype &amp; Beta Versions – Bosnan</title><meta name="description" content="Pre-release builds that reveal how games evolved — from early Sonic designs to Ocarina of Time's 1996 demo."><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${bgLogo()}${nav('prototypes')}<section class="platforms-hero"><h1>Prototypes &amp; Beta Versions</h1><p>Pre-release builds that show how games were made — and unmade</p></section><div class="platforms-grid">${cards}</div>${toggleScript()}</body></html>`;
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
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Strategy Guides – Bosnan</title><meta name="description" content="The iconic strategy guides that defined retro gaming — Nintendo Power, Prima, Brady Games, and more."><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${bgLogo()}${nav('strategy-guides')}<section class="platforms-hero"><h1>Strategy Guides</h1><p>The books that taught us how to play — Nintendo Power, Prima, Brady, and beyond</p></section><div class="platforms-grid">${cards}</div>${toggleScript()}</body></html>`;
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
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Arcade Cabinet Art – Bosnan</title><meta name="description" content="The marquee art, side panels, and illustrated cabinet artwork that defined the arcade era."><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${bgLogo()}${nav('cabinet-art')}<section class="platforms-hero"><h1>Arcade Cabinet Art</h1><p>The marquees, panels, and artwork that defined arcade culture</p></section><div class="platforms-grid">${cards}</div>${toggleScript()}</body></html>`;
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
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Merchandise &amp; Tie-ins – Bosnan</title><meta name="description" content="Cartoons, toys, cereals, films, and merchandise from the golden age of gaming tie-ins."><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${bgLogo()}${nav('merchandise')}<section class="platforms-hero"><h1>Merchandise &amp; Tie-ins</h1><p>When games went beyond the screen — cartoons, toys, cereals, and Hollywood</p></section><div class="platforms-grid">${cards}</div>${toggleScript()}</body></html>`;
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
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Bootlegs &amp; Clones – Bosnan</title><meta name="description" content="Unlicensed ports, pirate compilations, Famiclones, and the grey market that defined gaming outside the West."><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${bgLogo()}${nav('bootlegs')}<section class="platforms-hero"><h1>Bootlegs &amp; Clones</h1><p>Unlicensed games, pirate carts, Famiclones, and the grey market</p></section><div class="platforms-grid">${cards}</div>${toggleScript()}</body></html>`;
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
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Competitive Gaming History – Bosnan</title><meta name="description" content="Early esports, high-score competitions, and the tournaments that shaped competitive gaming."><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${bgLogo()}${nav('competitive')}<section class="platforms-hero"><h1>Competitive Gaming History</h1><p>High-score records, championships, and the birth of esports</p></section><div class="platforms-grid">${cards}</div>${toggleScript()}</body></html>`;
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
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Endings Gallery – Bosnan</title><meta name="description" content="Famous, surprising, and emotionally devastating game endings from the retro era."><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${bgLogo()}${nav('endings')}<section class="platforms-hero"><h1>Endings Gallery</h1><p>The moments that closed out the greatest retro games — and never left us</p></section><div class="platforms-grid">${cards}</div>${toggleScript()}</body></html>`;
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
${bgLogo()}
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
        <div class="game-card-decade">${escapeHtml(rg.decade)}</div>
      </div>
      <div class="game-card-body">
        <h3 class="game-card-title">${escapeHtml(rg.title)}</h3>
        <div class="game-card-meta"><span>${rg.year}</span><span class="dot">·</span><span>${escapeHtml(rg.genre)}</span></div>
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
