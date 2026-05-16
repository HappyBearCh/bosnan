const express = require('express');
const compression = require('compression');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;

const games = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'games.json'), 'utf8'));

// Slim card data — strip large text fields for list views
const gamesSlim = games.map(({ id, title, year, decade, genre, platform, developer, image }) =>
  ({ id, title, year, decade, genre, platform, developer, image })
);

app.use(compression());
app.use(express.static(__dirname));

// Precompute once at startup — games data never changes at runtime
let cachedGamesListHtml = null;

app.get('/sitemap.xml', (req, res) => {
  const base = `${req.protocol}://${req.get('host')}`;
  const today = new Date().toISOString().split('T')[0];
  const staticUrls = ['', '/games'].map(p => `
  <url>
    <loc>${base}${p}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>${p === '' ? '1.0' : '0.9'}</priority>
  </url>`).join('');
  const gameUrls = games.map(g => `
  <url>
    <loc>${base}/games/${g.id}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>yearly</changefreq>
    <priority>0.7</priority>
  </url>`).join('');
  res.header('Content-Type', 'application/xml');
  res.send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${staticUrls}${gameUrls}
</urlset>`);
});

app.get('/robots.txt', (req, res) => {
  const base = `${req.protocol}://${req.get('host')}`;
  res.type('text/plain');
  res.send(`User-agent: *\nAllow: /\nSitemap: ${base}/sitemap.xml\n`);
});

app.get('/api/games', (req, res) => {
  res.set('Cache-Control', 'public, max-age=3600');
  res.json(gamesSlim);
});

app.get('/api/games/:id', (req, res) => {
  const game = games.find(g => g.id === req.params.id);
  if (!game) return res.status(404).json({ error: 'Game not found' });
  res.set('Cache-Control', 'public, max-age=3600');
  res.json(game);
});

app.get('/games', (req, res) => {
  if (!cachedGamesListHtml) cachedGamesListHtml = gamesListPage();
  res.set('Cache-Control', 'no-cache');
  res.send(cachedGamesListHtml);
});

app.get('/games/:id', (req, res) => {
  const game = games.find(g => g.id === req.params.id);
  if (!game) return res.status(404).send(notFoundPage());
  res.send(gameDetailPage(game));
});

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const PAGE_SIZE = 32;

function buildCardHtml(list) {
  return list.map(g => `<a href="/games/${g.id}" class="game-card">
      <div class="game-card-img-wrap">
        <img src="/${escapeHtml(g.image)}" alt="${escapeHtml(g.title)}" loading="lazy"
             onerror="this.parentElement.innerHTML='<div class=\\'game-card-placeholder\\'>${escapeHtml(g.title[0])}</div>'">
        <div class="game-card-decade">${escapeHtml(g.decade)}</div>
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
    </a>`).join('');
}

function gamesListPage() {
  // Only pre-render first page; client renders the rest from inlined JSON
  const firstPage = gamesSlim.slice(0, PAGE_SIZE);
  const cardHtml = buildCardHtml(firstPage);
  const inlineData = JSON.stringify(gamesSlim);

  return `<!DOCTYPE html>
<html>
<head>
    <title>Retro Games Archive – Bosnan</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="stylesheet" href="/style.css">
    <link rel="stylesheet" href="/games.css">
</head>
<body>
<svg class="bg-logo" viewBox="0 0 120 120">
  <circle cx="60" cy="60" r="55" fill="black" stroke="red" stroke-width="5"/>
  <text x="50%" y="55%" text-anchor="middle" fill="red" font-size="60" font-family="Arial" dy=".3em">B</text>
</svg>

<nav>
    <img src="/logo.svg" alt="Bosnan Logo">
    <div class="menu-toggle" onclick="toggleMenu()" id="menuToggle">
        <span></span><span></span><span></span>
    </div>
    <div class="nav-links" id="navLinks">
        <a href="/index.html">Home</a>
        <a href="/game.html">Game</a>
        <a href="/games" class="active">Games</a>
    </div>
</nav>

<section class="games-hero">
    <h1>Retro Games Archive</h1>
    <p>A collection of legendary games from the 1960s, 1970s, and 1980s</p>
</section>

<div class="games-controls">
    <div class="search-wrapper">
        <input type="text" id="searchInput" placeholder="Search games, genres, platforms..." autocomplete="off">
        <span class="search-icon">&#9906;</span>
    </div>
    <div class="filter-tabs">
        <button class="filter-btn active" data-decade="all">All Eras</button>
        <button class="filter-btn" data-decade="1960s">1960s</button>
        <button class="filter-btn" data-decade="1970s">1970s</button>
        <button class="filter-btn" data-decade="1980s">1980s</button>
    </div>
</div>

<div class="games-count" id="gamesCount">${gamesSlim.length} games in archive</div>

<div class="games-grid" id="gamesGrid">${cardHtml}
</div>

<div id="loadMoreSentinel" style="height:1px"></div>

<div class="no-results" id="noResults" style="display:none">
    <p>No games found matching your search.</p>
    <button class="btn" onclick="clearSearch()">Clear Search</button>
</div>

<script>
function toggleMenu() {
    document.getElementById("navLinks").classList.toggle("active");
}

const allGames = ${inlineData};
const PAGE = ${PAGE_SIZE};
let currentDecade = 'all';
let currentQuery = '';
let debounceTimer = null;
let filtered = allGames.slice();
let rendered = PAGE; // first page already in HTML

const grid = document.getElementById('gamesGrid');
const noResults = document.getElementById('noResults');
const countEl = document.getElementById('gamesCount');
const sentinel = document.getElementById('loadMoreSentinel');

function esc(s) {
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function cardHtml(g) {
    return '<a href="/games/' + g.id + '" class="game-card">' +
        '<div class="game-card-img-wrap">' +
        '<img src="/' + esc(g.image) + '" alt="' + esc(g.title) + '" loading="lazy"' +
        ' onerror="this.parentElement.innerHTML=\'<div class=\\\'game-card-placeholder\\\'>' + esc(g.title[0]) + '</div>\'">' +
        '<div class="game-card-decade">' + esc(g.decade) + '</div>' +
        '</div>' +
        '<div class="game-card-body">' +
        '<h3 class="game-card-title">' + esc(g.title) + '</h3>' +
        '<div class="game-card-meta"><span>' + esc(String(g.year)) + '</span><span class="dot">·</span><span>' + esc(g.genre) + '</span></div>' +
        '<p class="game-card-platform">' + esc(g.platform) + '</p>' +
        '</div></a>';
}

function applyFilter() {
    const q = currentQuery.toLowerCase();
    filtered = allGames.filter(g => {
        const matchDecade = currentDecade === 'all' || g.decade === currentDecade;
        const matchQuery = !q ||
            g.title.toLowerCase().includes(q) ||
            g.genre.toLowerCase().includes(q) ||
            g.platform.toLowerCase().includes(q) ||
            g.developer.toLowerCase().includes(q) ||
            String(g.year).includes(q);
        return matchDecade && matchQuery;
    });

    countEl.textContent = filtered.length === allGames.length
        ? allGames.length + ' games in archive'
        : filtered.length + ' of ' + allGames.length + ' games';

    if (filtered.length === 0) {
        grid.innerHTML = '';
        noResults.style.display = 'block';
        rendered = 0;
        return;
    }
    noResults.style.display = 'none';
    rendered = Math.min(PAGE, filtered.length);
    grid.innerHTML = filtered.slice(0, rendered).map(cardHtml).join('');
}

function loadMore() {
    if (rendered >= filtered.length) return;
    const next = filtered.slice(rendered, rendered + PAGE);
    grid.insertAdjacentHTML('beforeend', next.map(cardHtml).join(''));
    rendered += next.length;
}

// Infinite scroll via IntersectionObserver
const observer = new IntersectionObserver(entries => {
    if (entries[0].isIntersecting) loadMore();
}, { rootMargin: '200px' });
observer.observe(sentinel);

function clearSearch() {
    document.getElementById('searchInput').value = '';
    currentQuery = '';
    applyFilter();
}

document.getElementById('searchInput').addEventListener('input', e => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
        currentQuery = e.target.value;
        applyFilter();
    }, 200);
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

function gameDetailPage(game) {
  return `<!DOCTYPE html>
<html>
<head>
    <title>${escapeHtml(game.title)} – Bosnan Games</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="stylesheet" href="/style.css">
    <link rel="stylesheet" href="/games.css">
</head>
<body>
<svg class="bg-logo" viewBox="0 0 120 120">
  <circle cx="60" cy="60" r="55" fill="black" stroke="red" stroke-width="5"/>
  <text x="50%" y="55%" text-anchor="middle" fill="red" font-size="60" font-family="Arial" dy=".3em">B</text>
</svg>

<nav>
    <img src="/logo.svg" alt="Bosnan Logo">
    <div class="menu-toggle" onclick="toggleMenu()" id="menuToggle">
        <span></span><span></span><span></span>
    </div>
    <div class="nav-links" id="navLinks">
        <a href="/index.html">Home</a>
        <a href="/game.html">Game</a>
        <a href="/games" class="active">Games</a>
    </div>
</nav>

<div class="game-detail-wrapper">
  <a href="/games" class="back-link">← Back to Games</a>

  <div class="game-detail-card">
    <div class="game-detail-image-col">
      <img src="/${escapeHtml(game.image)}" alt="${escapeHtml(game.title)}" class="game-detail-img" onerror="this.src='/images/games/placeholder.svg'">
      <div class="game-meta">
        <div class="meta-item"><span class="meta-label">Year</span><span class="meta-value">${escapeHtml(String(game.year))}</span></div>
        <div class="meta-item"><span class="meta-label">Decade</span><span class="meta-value">${escapeHtml(game.decade)}</span></div>
        <div class="meta-item"><span class="meta-label">Genre</span><span class="meta-value">${escapeHtml(game.genre)}</span></div>
        <div class="meta-item"><span class="meta-label">Platform</span><span class="meta-value">${escapeHtml(game.platform)}</span></div>
        <div class="meta-item"><span class="meta-label">Developer</span><span class="meta-value">${escapeHtml(game.developer)}</span></div>
        <div class="meta-item"><span class="meta-label">Publisher</span><span class="meta-value">${escapeHtml(game.publisher)}</span></div>
      </div>
    </div>
    <div class="game-detail-info-col">
      <div class="game-decade-badge">${escapeHtml(game.decade)}</div>
      <h1 class="game-detail-title">${escapeHtml(game.title)}</h1>
      <p class="game-detail-year">${escapeHtml(String(game.year))} · ${escapeHtml(game.genre)} · ${escapeHtml(game.platform)}</p>
      <div class="game-detail-desc">
        <h2>Overview</h2>
        <p>${escapeHtml(game.description)}</p>
      </div>
      <div class="game-detail-desc">
        <h2>Deep Dive</h2>
        <p>${escapeHtml(game.longDescription)}</p>
      </div>
    </div>
  </div>
</div>

<script>
function toggleMenu() {
    document.getElementById("navLinks").classList.toggle("active");
}
</script>
</body>
</html>`;
}

function notFoundPage() {
  return `<!DOCTYPE html>
<html>
<head><title>Not Found – Bosnan</title><link rel="stylesheet" href="/style.css"></head>
<body>
<svg class="bg-logo" viewBox="0 0 120 120">
  <circle cx="60" cy="60" r="55" fill="black" stroke="red" stroke-width="5"/>
  <text x="50%" y="55%" text-anchor="middle" fill="red" font-size="60" font-family="Arial" dy=".3em">B</text>
</svg>
<nav><img src="/logo.svg" alt="Bosnan Logo">
  <div class="nav-links"><a href="/">Home</a><a href="/game.html">Game</a><a href="/games">Games</a></div>
</nav>
<section class="hero"><h1 style="font-size:40px">Game Not Found</h1><p>That game doesn't exist in our archive.</p>
<a href="/games" class="btn" style="margin-top:20px">Back to Games</a></section>
</body></html>`;
}

app.listen(PORT, () => {
  console.log(`Bosnan server running at http://localhost:${PORT}`);
});
