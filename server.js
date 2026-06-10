const express = require('express');
const compression = require('compression');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;

const games = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'games.json'), 'utf8'));
const GENRES = require('./data/genres');
const ESSAYS = [...require('./data/essays'), ...require('./data/essays2'), ...require('./data/essays3'), ...require('./data/essays4'), ...require('./data/essays5'), ...require('./data/essays6'), ...require('./data/essays7'), ...require('./data/essays8')];
const DEVELOPERS = require('./data/developers');
const gamesSlim = games.map(({ id, title, year, decade, genre, platform, developer, image, playUrl }) =>
  ({ id, title, year, decade, genre, platform, developer, image, playUrl: playUrl || null })
);

const gamesById = new Map(games.map(g => [g.id, g]));

const PLATFORMS = [
  {
    id: 'arcade', name: 'Arcade', era: '1971 – 1990s',
    manufacturer: 'Various (Namco, Atari, Konami, Capcom, Sega)',
    keyword: 'Arcade',
    description: 'Coin-operated arcade games defined the first golden age of video gaming. Standing cabinets filled malls and arcades worldwide. At their peak in 1982, US arcades generated over $8 billion annually — more than Hollywood box office and recorded music combined. Pac-Man alone earned over $2.5 billion by 1990.',
    longDescription: 'The golden age of arcade games ran roughly from 1978 to 1983, sparked by the global success of Space Invaders and Pac-Man. Japanese manufacturers like Namco and Taito competed fiercely with American companies like Atari and Williams. Hardware pushed boundaries every year: vector graphics (Asteroids, Tempest), sprite scaling (Zaxxon), and early 3D polygon rendering all debuted in arcade cabinets long before reaching home computers. The crash of 1983 slowed the North American industry, but Japanese arcades continued thriving through the decade, producing legendary fighting games, shoot-\'em-ups, and beat \'em ups that remain benchmarks of game design.',
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
    longDescription: 'Launched in Japan in 1988 and North America in 1989, the Genesis used a Motorola 68000 CPU — the same chip that powered the Amiga and Atari ST — paired with a Yamaha FM sound chip that gave its audio a distinctive, punchy character. Sega\'s aggressive marketing under Tom Kalinske positioned the Genesis as the cool alternative to the NES, with the famous "Genesis does what Nintendon\'t" campaign. The console sold over 30 million units globally and hosted landmark titles from Sega\'s internal studios — Sonic Team, AM2, and the Treasure-adjacent Gunstar Heroes developers — plus key third-party titles. The Genesis era was Sega at its commercial and creative peak.',
  },
  {
    id: 'game-boy', name: 'Game Boy', era: '1989 – 2003',
    manufacturer: 'Nintendo',
    keyword: 'Game Boy',
    description: 'Gunpei Yokoi\'s masterpiece of "lateral thinking with withered technology" sold over 118 million units across its original and Color versions. Despite technically inferior hardware to competitors, the Game Boy\'s battery life, durability, and Tetris bundle made it the dominant portable gaming platform for over a decade.',
    longDescription: 'The Game Boy launched in 1989 with a dot-matrix LCD screen, four AA batteries for 15 hours of play, and Tetris bundled in the box. Despite the Sega Game Gear\'s backlit colour screen and the Atari Lynx\'s superior hardware, the Game Boy outlasted all competitors because Yokoi prioritised playability over spectacle. Nintendo\'s grip on the handheld market through its first-party exclusives — Pokémon, Zelda, Mario, Metroid — made the platform a self-reinforcing ecosystem. The Game Boy Color (1998) and Game Boy Advance (2001) extended the lineage, with the combined family selling more than any single home console of its era.',
  },
  {
    id: 'nintendo-64', name: 'Nintendo 64', shortName: 'N64', era: '1996 – 2002',
    manufacturer: 'Nintendo',
    keyword: 'Nintendo 64',
    description: 'The Nintendo 64 delivered hardware capable of true 3D gaming and produced some of the most influential titles ever made — Super Mario 64, The Legend of Zelda: Ocarina of Time, GoldenEye 007. Its decision to stay with cartridges while Sony used CD-ROM cost it the majority of third-party support.',
    longDescription: 'Released in Japan in 1996 and globally that year, the N64 used a MIPS R4300i CPU at 93.75 MHz and the custom Reality Coprocessor GPU, delivering 3D performance that impressed at launch. The console sold 33 million units — a respectable number, but far behind the PlayStation\'s 102 million — largely because Nintendo\'s cartridge format was more expensive to manufacture and hold less data than CD-ROM, driving Square, Namco, and many others to develop exclusively for Sony. What the N64 lost in third-party breadth it made up in first-party quality: Super Mario 64, Zelda: Ocarina of Time, and GoldenEye 007 remain among the most critically acclaimed games ever made, and their influence on 3D game design is still felt today.',
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
    longDescription: 'Developed jointly by NEC and Hudson Soft, the PC Engine launched in Japan in 1987 and became a genuine competitive threat to Nintendo\'s Famicom, offering superior 2D sprite capability and clean arcade translations of popular games. Its HuCard format — credit card-sized ROM cards — was smaller than cartridges, and the CD-ROM² add-on (1988) made it the first console to use compact disc media, allowing for redbook audio and dramatically expanded storage. In North America, rebranded as the TurboGrafx-16 and launched in 1989, the console struggled against established NES loyalty and a confusing product line. The platform\'s library includes some of the finest shooters and action games of the 8-bit era — Blazing Lazers, Gate of Thunder, Y\'s Book I & II — and demonstrated what was possible with dedicated hardware design.',
  },
  {
    id: 'neo-geo', name: 'Neo Geo AES', shortName: 'Neo Geo', era: '1990 – 2004',
    manufacturer: 'SNK',
    keyword: 'Neo Geo',
    description: 'The Neo Geo AES was the most powerful home console of its era, offering true arcade-identical hardware at home. Priced at $649 at launch with games costing $200 each, it was a luxury product for the most dedicated fans — and it delivered exceptional fighting games, shooters, and action titles unmatched until the PlayStation era.',
    longDescription: 'SNK designed the Neo Geo as a home version of its MVS arcade system, meaning the same ROM chips ran in both the cabinet and the home console. The Motorola 68000 CPU and Zilog Z80 combination, backed by 64KB of work RAM and dedicated sprite hardware capable of displaying hundreds of large sprites simultaneously, made the Neo Geo the reference standard for 2D game quality throughout the early and mid-1990s. Street-level arcades ran MVS hardware while enthusiasts paid premium prices for identical experiences at home. The platform\'s catalogue — built almost entirely by SNK and a few close partners — concentrated on fighting games: Fatal Fury, Samurai Shodown, The King of Fighters, Art of Fighting. Metal Slug (1996) expanded the genre repertoire into run-and-gun with extraordinary hand-drawn animation. The Neo Geo outlasted all of its contemporaries, with new commercial releases through the early 2000s.',
  },
  {
    id: 'game-gear', name: 'Sega Game Gear', shortName: 'Game Gear', era: '1990 – 1997',
    manufacturer: 'Sega',
    keyword: 'Game Gear',
    description: 'The Game Gear was Sega\'s answer to the Game Boy: a backlit colour portable with hardware based on the Master System. Technically superior to Nintendo\'s handheld, it was undermined by poor battery life (six AA batteries for four hours) and a software library that lacked the Game Boy\'s depth of exclusives.',
    longDescription: 'Launched in Japan in 1990 and globally in 1991, the Game Gear used essentially the same hardware as the Sega Master System — an 8-bit Z80 CPU and a colour display capable of showing 32 colours simultaneously from a palette of 4,096. Its backlit screen was a genuine advantage over the Game Boy\'s passive LCD, making it far easier to play in low-light conditions, and an optional TV tuner add-on allowed it to receive television signals. The Game Gear sold approximately 10-11 million units — a respectable figure, but one that pales against the Game Boy\'s 118 million. The battery problem was genuine: where the Game Boy ran for 15 hours on four AA batteries, the Game Gear\'s colour backlit display drained six batteries in four hours. Its library, strong in ports of arcade and Master System titles, lacked the Game Boy-exclusive franchises — Pokémon, Mario Land, Zelda — that drove hardware sales.',
  },
];

// ── Pre-computed indices ────────────────────────────────────────────────────

const platformGamesIndex = new Map();
for (const platform of PLATFORMS) {
  platformGamesIndex.set(platform.id, games.filter(g =>
    g.platform.toLowerCase().includes(platform.keyword.toLowerCase())
  ));
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
  return `<link rel="preload" href="${CSS_PATH}" as="style"><link rel="stylesheet" href="${CSS_PATH}">`;
}

// ── Page caches ─────────────────────────────────────────────────────────────

const PAGE_SIZE = 32;
const EAGER_IMAGES = 8;

let cachedGamesListHtml = null;
let cachedPlatformsListHtml = null;
let cachedGenresListHtml = null;
let cachedEssaysListHtml = null;
let cachedDevelopersListHtml = null;
const cachedEssayPageHtml = {};
let cachedGameLauncherHtml = null;
const cachedPlatformPageHtml = {};
const cachedGenrePageHtml = {};
const cachedDeveloperPageHtml = {};
const cachedGamePageHtml = new Map();
let cachedSitemap = null;
let cachedHomepage = { html: null, day: -1 };

// ── Middleware ───────────────────────────────────────────────────────────────

app.use(compression());

// Serve merged CSS with immutable 1-year cache (content-addressed by hash)
app.get(/^\/app\.[a-f0-9]+\.css$/, (req, res) => {
  res.setHeader('Content-Type', 'text/css; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.send(rawCss);
});

// Server-render the homepage with GOTD baked in — must be before express.static
// so it intercepts / and /index.html before the static file is served.
app.get(['/', '/index.html'], (req, res) => {
  const day = dayOfYear();
  if (!cachedHomepage.html || cachedHomepage.day !== day) {
    cachedHomepage = { html: homepagePage(gameOfDay()), day };
  }
  res.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
  res.set('Link', `<${CSS_PATH}>; rel=preload; as=style`);
  res.send(cachedHomepage.html);
});

app.get('/game.html', (req, res) => {
  if (!cachedGameLauncherHtml) cachedGameLauncherHtml = gameLauncherPage();
  res.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
  res.send(cachedGameLauncherHtml);
});

app.use(express.static(__dirname, {
  setHeaders(res, filePath) {
    if (/\.(png|jpe?g|gif|svg|ico|webp|woff2?|jar)$/i.test(filePath)) {
      res.setHeader('Cache-Control', 'public, max-age=2592000, stale-while-revalidate=86400');
    } else if (/\.js$/i.test(filePath)) {
      res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
    } else if (/\.html?$/i.test(filePath)) {
      res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=3600');
    }
  },
}));

// ── Helpers ─────────────────────────────────────────────────────────────────

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
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

function bgLogo() {
  return `<svg class="bg-logo" viewBox="0 0 120 120" aria-hidden="true">
  <circle cx="60" cy="60" r="55" fill="black" stroke="red" stroke-width="5"/>
  <text x="50%" y="55%" text-anchor="middle" fill="red" font-size="60" font-family="Arial" dy=".3em">B</text>
</svg>`;
}

function nav(active) {
  const link = (href, label, id) =>
    `<a href="${href}"${active === id ? ' class="active"' : ''}>${label}</a>`;
  return `<nav>
    <img src="/logo.svg" alt="Bosnan Logo" width="50" height="50">
    <div class="menu-toggle" onclick="toggleMenu()" id="menuToggle" aria-label="Open menu" role="button">
        <span></span><span></span><span></span>
    </div>
    <div class="nav-links" id="navLinks">
        ${link('/index.html', 'Home', 'home')}
        ${link('/game.html', 'Game', 'game')}
        ${link('/games', 'Games', 'games')}
        ${link('/platforms', 'Platforms', 'platforms')}
        ${link('/developers', 'Developers', 'developers')}
        ${link('/genres', 'Encyclopedia', 'genres')}
        ${link('/essays', 'Essays', 'essays')}
        <a href="/random" class="nav-random">&#127922; Random</a>
    </div>
</nav>`;
}

function toggleScript() {
  return `<script>function toggleMenu(){document.getElementById("navLinks").classList.toggle("active")}</script>`;
}

// eagerCount: first N images get fetchpriority=high (no lazy), rest get loading=lazy
function buildCardHtml(list, eagerCount = 0) {
  return list.map((g, i) => {
    const imgAttrs = i < eagerCount
      ? `fetchpriority="high"`
      : `loading="lazy"`;
    return `<a href="/games/${g.id}" class="game-card">
      <div class="game-card-img-wrap">
        <img src="/${escapeHtml(g.image)}" alt="${escapeHtml(g.title)}" ${imgAttrs}
             onerror="this.parentElement.innerHTML='<div class=\\'game-card-placeholder\\'>${escapeHtml(g.title[0])}</div>'">
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

app.get('/sitemap.xml', (req, res) => {
  const host = req.get('host');
  if (!cachedSitemap || cachedSitemap.host !== host) {
    const base = `${req.protocol}://${host}`;
    const today = new Date().toISOString().split('T')[0];
    const staticUrls = ['', '/games', '/platforms', '/developers', '/genres', '/essays'].map(p => `
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
    cachedSitemap = {
      host,
      xml: `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${staticUrls}${platformUrls}${developerUrls}${genreUrls}${essayUrls}${gameUrls}
</urlset>`,
    };
  }
  res.header('Content-Type', 'application/xml');
  res.set('Cache-Control', 'public, max-age=86400');
  res.send(cachedSitemap.xml);
});

app.get('/robots.txt', (req, res) => {
  const base = `${req.protocol}://${req.get('host')}`;
  res.type('text/plain');
  res.send(`User-agent: *\nAllow: /\nSitemap: ${base}/sitemap.xml\n`);
});

app.get('/random', (req, res) => {
  const game = games[Math.floor(Math.random() * games.length)];
  res.redirect(302, `/games/${game.id}`);
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

app.get('/games', (req, res) => {
  if (!cachedGamesListHtml) cachedGamesListHtml = gamesListPage();
  res.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
  res.set('Link', `<${CSS_PATH}>; rel=preload; as=style`);
  res.send(cachedGamesListHtml);
});

app.get('/games/:id', (req, res) => {
  const game = gamesById.get(req.params.id);
  if (!game) return res.status(404).send(notFoundPage());
  const host = req.get('host');
  const cacheKey = `${host}/${game.id}`;
  if (!cachedGamePageHtml.has(cacheKey)) {
    const base = `${req.protocol}://${host}`;
    cachedGamePageHtml.set(cacheKey, gameDetailPage(game, base));
  }
  res.set('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
  res.set('Link', `<${CSS_PATH}>; rel=preload; as=style`);
  res.send(cachedGamePageHtml.get(cacheKey));
});

app.get('/platforms', (req, res) => {
  if (!cachedPlatformsListHtml) cachedPlatformsListHtml = platformsListPage();
  res.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
  res.set('Link', `<${CSS_PATH}>; rel=preload; as=style`);
  res.send(cachedPlatformsListHtml);
});

app.get('/platforms/:id', (req, res) => {
  const platform = PLATFORMS.find(p => p.id === req.params.id);
  if (!platform) return res.status(404).send(notFoundPage());
  if (!cachedPlatformPageHtml[platform.id]) {
    cachedPlatformPageHtml[platform.id] = platformDetailPage(platform);
  }
  res.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
  res.set('Link', `<${CSS_PATH}>; rel=preload; as=style`);
  res.send(cachedPlatformPageHtml[platform.id]);
});

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
  const essay = ESSAYS.find(e => e.id === req.params.id);
  if (!essay) return res.status(404).send(notFoundPage());
  if (!cachedEssayPageHtml[essay.id]) {
    cachedEssayPageHtml[essay.id] = essayDetailPage(essay);
  }
  res.set('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
  res.set('Link', `<${CSS_PATH}>; rel=preload; as=style`);
  res.send(cachedEssayPageHtml[essay.id]);
});

app.get('/developers', (req, res) => {
  if (!cachedDevelopersListHtml) cachedDevelopersListHtml = developersListPage();
  res.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
  res.set('Link', `<${CSS_PATH}>; rel=preload; as=style`);
  res.send(cachedDevelopersListHtml);
});

app.get('/developers/:id', (req, res) => {
  const dev = DEVELOPERS.find(d => d.id === req.params.id);
  if (!dev) return res.status(404).send(notFoundPage());
  if (!cachedDeveloperPageHtml[dev.id]) {
    cachedDeveloperPageHtml[dev.id] = developerDetailPage(dev);
  }
  res.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
  res.set('Link', `<${CSS_PATH}>; rel=preload; as=style`);
  res.send(cachedDeveloperPageHtml[dev.id]);
});

// ── Page generators ──────────────────────────────────────────────────────────

function homepagePage(gotd) {
  const gotdHref = `/games/${gotd.id}`;
  const gotdImgSrc = `/${escapeHtml(gotd.image)}`;
  const gotdDesc = gotd.description ? gotd.description.substring(0, 180) + '…' : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Bosnan – Retro Games Archive</title>
    <meta name="description" content="Bosnan – explore legendary retro games from the 1960s, 1970s, and 1980s. Browse ${games.length}+ games across Arcade, NES, Atari, C64, and more.">
    ${cssHead()}
</head>
<body>
${bgLogo()}

<nav>
    <img src="/logo.svg" alt="Bosnan Logo" width="50" height="50">
    <div class="menu-toggle" onclick="toggleMenu()" id="menuToggle" aria-label="Open menu" role="button">
        <span></span><span></span><span></span>
    </div>
    <div class="nav-links" id="navLinks">
        <a href="/index.html" class="active">Home</a>
        <a href="/game.html">Game</a>
        <a href="/games">Games</a>
        <a href="/platforms">Platforms</a>
        <a href="/genres">Encyclopedia</a>
        <a href="/essays">Essays</a>
        <a href="/random" class="nav-random">&#127922; Random</a>
    </div>
</nav>

<section class="hero">
    <h1>BOSNAN</h1>
    <p>The Eternal Dragon-Blooded Guardian</p>
    <a href="game.html" class="btn">Enter Game</a>
</section>

<section class="section">
    <h2>The Legend</h2>
    <p>Before empires, before kings, before history itself - there was Bosnan.</p>
    <p>Born of the ancient Dragon Zmaj and the mystical Fairy Vila Bosanska, Bosnan walks through time as an immortal guardian. His blood burns with fire, his spirit moves like the wind.</p>
    <p>He fought Romans. He shattered invaders in the Middle Ages. He rose again against empires and darkness across centuries.</p>
    <p>Now, a new evil walks the earth — degenerate human hunters who prey on the innocent. But they are no longer the hunters.</p>
    <p style="color:red;">Bosnan has returned.</p>
</section>

<div class="gotd-section">
    <h2>&#127942; Game of the Day</h2>
    <a class="gotd-card" href="${escapeHtml(gotdHref)}">
        <img class="gotd-img" src="${gotdImgSrc}" alt="${escapeHtml(gotd.title)}" fetchpriority="high" onerror="this.style.display='none'">
        <div class="gotd-body">
            <div class="gotd-badge">${escapeHtml(gotd.decade)}</div>
            <h3 class="gotd-title">${escapeHtml(gotd.title)}</h3>
            <div class="gotd-meta">${escapeHtml(String(gotd.year))} · ${escapeHtml(gotd.genre)} · ${escapeHtml(gotd.platform)}</div>
            <p class="gotd-desc">${escapeHtml(gotdDesc)}</p>
        </div>
    </a>
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

${toggleScript()}
</body>
</html>`;
}

function gameLauncherPage() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Bosnan Game</title>
    ${cssHead()}
</head>
<body>
${bgLogo()}

<nav>
    <img src="/logo.svg" alt="Bosnan Logo" width="50" height="50">
    <div class="menu-toggle" onclick="toggleMenu()" id="menuToggle" aria-label="Open menu" role="button">
        <span></span><span></span><span></span>
    </div>
    <div class="nav-links" id="navLinks">
        <a href="/index.html">Home</a>
        <a href="/game.html" class="active">Game</a>
        <a href="/games">Games</a>
        <a href="/platforms">Platforms</a>
        <a href="/genres">Encyclopedia</a>
        <a href="/essays">Essays</a>
        <a href="/random" class="nav-random">&#127922; Random</a>
    </div>
</nav>

<section class="section">
    <h2>Gameplay</h2>
    <div class="gallery">
        <img src="/images/screenshot1.png" loading="lazy">
        <img src="/images/screenshot2.png" loading="lazy">
        <img src="/images/screenshot3.png" loading="lazy">
    </div>
</section>

<section class="section">
    <h2>Launch Bosnan</h2>
    <p>Download the <strong>JAR file</strong>, double-click it, and start playing!</p>
    <p>The minimum Java version required is <strong>17</strong>.</p>
    <p>If Java is not installed on your Windows system, you can download it <a href="https://api.adoptium.net/v3/binary/latest/21/ga/windows/x64/jre/hotspot/normal/eclipse" target="_blank" rel="noopener">here</a>.</p>
    <div class="launcher">
        <button class="btn" onclick="launch()">Launch Game</button>
        <div class="progress">
            <div class="bar" id="bar"></div>
        </div>
        <p id="status"></p>
    </div>
</section>

${toggleScript()}
<script src="/launcher.js" defer></script>
</body>
</html>`;
}

function gamesListPage() {
  const firstPage = gamesSlim.slice(0, PAGE_SIZE);
  const cardHtml = buildCardHtml(firstPage, EAGER_IMAGES);
  const inlineData = JSON.stringify(gamesSlim);

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Retro Games Archive – Bosnan</title>
    <meta name="description" content="Browse ${games.length} legendary retro games from the 1960s, 1970s, and 1980s. Search by title, genre, platform, or decade.">
    <meta property="og:title" content="Retro Games Archive – Bosnan">
    <meta property="og:description" content="Browse ${games.length} legendary retro games from the 1960s, 1970s, and 1980s.">
    <meta property="og:type" content="website">
    ${cssHead()}
</head>
<body>
${bgLogo()}
${nav('games')}

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

${toggleScript()}
<script>
const allGames = ${inlineData};
const PAGE = ${PAGE_SIZE};
let currentDecade = 'all', currentQuery = '', debounceTimer = null;
let filtered = allGames.slice(), rendered = PAGE;

const grid = document.getElementById('gamesGrid');
const noResults = document.getElementById('noResults');
const countEl = document.getElementById('gamesCount');
const sentinel = document.getElementById('loadMoreSentinel');

function esc(s) {
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function cardHtml(g) {
    return '<a href="/games/'+g.id+'" class="game-card">'+
        '<div class="game-card-img-wrap">'+
        '<img src="/'+esc(g.image)+'" alt="'+esc(g.title)+'" loading="lazy"'+
        ' onerror="this.parentElement.innerHTML=\'<div class=\\\'game-card-placeholder\\\'>'+esc(g.title[0])+'</div>\'">'+
        '<div class="game-card-decade">'+esc(g.decade)+'</div>'+
        (g.playUrl ? '<div class="game-card-playable">&#9654; Play</div>' : '')+
        '</div>'+
        '<div class="game-card-body">'+
        '<h3 class="game-card-title">'+esc(g.title)+'</h3>'+
        '<div class="game-card-meta"><span>'+esc(String(g.year))+'</span><span class="dot">·</span><span>'+esc(g.genre)+'</span></div>'+
        '<p class="game-card-platform">'+esc(g.platform)+'</p>'+
        '</div></a>';
}
function applyFilter() {
    const q = currentQuery.toLowerCase();
    filtered = allGames.filter(g => {
        const matchDecade = currentDecade === 'all' || g.decade === currentDecade;
        const matchQuery = !q || g.title.toLowerCase().includes(q) || g.genre.toLowerCase().includes(q) ||
            g.platform.toLowerCase().includes(q) || g.developer.toLowerCase().includes(q) || String(g.year).includes(q);
        return matchDecade && matchQuery;
    });
    countEl.textContent = filtered.length === allGames.length
        ? allGames.length+' games in archive'
        : filtered.length+' of '+allGames.length+' games';
    if (filtered.length === 0) { grid.innerHTML=''; noResults.style.display='block'; rendered=0; return; }
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
new IntersectionObserver(e => { if (e[0].isIntersecting) loadMore(); }, { rootMargin:'200px' }).observe(sentinel);
function clearSearch() { document.getElementById('searchInput').value=''; currentQuery=''; applyFilter(); }
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
  const desc = escapeHtml((game.description || '').substring(0, 160));

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

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(game.title)} – Bosnan Retro Archive</title>
    <meta name="description" content="${desc}">
    <meta property="og:title" content="${escapeHtml(game.title)} – Bosnan Retro Archive">
    <meta property="og:description" content="${desc}">
    <meta property="og:image" content="${imgUrl}">
    <meta property="og:url" content="${url}">
    <meta property="og:type" content="website">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${escapeHtml(game.title)} – Bosnan Retro Archive">
    <meta name="twitter:description" content="${desc}">
    <meta name="twitter:image" content="${imgUrl}">
    <link rel="canonical" href="${url}">
    <script type="application/ld+json">${schemaJson}</script>
    ${cssHead()}
</head>
<body>
${bgLogo()}
${nav('games')}

<div class="game-detail-wrapper">
  <a href="/games" class="back-link">&#8592; Back to Games</a>

  <div class="game-detail-card">
    <div class="game-detail-image-col">
      <img src="/${escapeHtml(game.image)}" alt="${escapeHtml(game.title)}" class="game-detail-img"
           fetchpriority="high" onerror="this.src='/images/games/placeholder.svg'">
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
      <p class="game-detail-year">${escapeHtml(String(game.year))} &middot; ${escapeHtml(game.genre)} &middot; ${escapeHtml(game.platform)}</p>
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
    <meta name="description" content="Explore retro gaming platforms from the 1970s and 1980s: Arcade, NES, Atari 2600, Commodore 64, ZX Spectrum, and more.">
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
  const cardHtml = buildCardHtml(platformGames.slice(0, PAGE_SIZE), EAGER_IMAGES);
  const inlineData = JSON.stringify(platformGames.map(({ id, title, year, decade, genre, platform: pl, developer, image, playUrl }) =>
    ({ id, title, year, decade, genre, platform: pl, developer, image, playUrl: playUrl || null })
  ));

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(platform.name)} Games – Bosnan Retro Archive</title>
    <meta name="description" content="${escapeHtml(platform.description.substring(0, 160))}">
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
  <div id="loadMoreSentinel" style="height:1px"></div>
</div>

${toggleScript()}
<script>
const allGames = ${inlineData};
const PAGE = ${PAGE_SIZE};
let rendered = Math.min(PAGE, allGames.length);
const grid = document.getElementById('gamesGrid');
const sentinel = document.getElementById('loadMoreSentinel');
function esc(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function cardHtml(g){
    return '<a href="/games/'+g.id+'" class="game-card">'+
        '<div class="game-card-img-wrap">'+
        '<img src="/'+esc(g.image)+'" alt="'+esc(g.title)+'" loading="lazy"'+
        ' onerror="this.parentElement.innerHTML=\'<div class=\\\'game-card-placeholder\\\'>'+esc(g.title[0])+'</div>\'">'+
        '<div class="game-card-decade">'+esc(g.decade)+'</div>'+
        (g.playUrl ? '<div class="game-card-playable">&#9654; Play</div>' : '')+
        '</div>'+
        '<div class="game-card-body"><h3 class="game-card-title">'+esc(g.title)+'</h3>'+
        '<div class="game-card-meta"><span>'+esc(String(g.year))+'</span><span class="dot">·</span><span>'+esc(g.genre)+'</span></div>'+
        '<p class="game-card-platform">'+esc(g.platform)+'</p></div></a>';
}
function loadMore(){
    if(rendered>=allGames.length)return;
    const next=allGames.slice(rendered,rendered+PAGE);
    grid.insertAdjacentHTML('beforeend',next.map(cardHtml).join(''));
    rendered+=next.length;
}
new IntersectionObserver(e=>{if(e[0].isIntersecting)loadMore();},{rootMargin:'200px'}).observe(sentinel);
</script>
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
  const cardHtml = buildCardHtml(genreGames.slice(0, PAGE_SIZE), EAGER_IMAGES);
  const inlineData = JSON.stringify(genreGames.map(({ id, title, year, decade, genre: pl, platform, developer, image, playUrl }) =>
    ({ id, title, year, decade, genre: pl, platform, developer, image, playUrl: playUrl || null })
  ));

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

  const desc = escapeHtml(genre.description.substring(0, 160));

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
      <div id="loadMoreSentinel" style="height:1px"></div>
    </div>
  </div>
</div>

${toggleScript()}
<script>
const allGames = ${inlineData};
const PAGE = ${PAGE_SIZE};
let rendered = Math.min(PAGE, allGames.length);
const grid = document.getElementById('gamesGrid');
const sentinel = document.getElementById('loadMoreSentinel');
function esc(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function cardHtml(g){
    return '<a href="/games/'+g.id+'" class="game-card">'+
        '<div class="game-card-img-wrap">'+
        '<img src="/'+esc(g.image)+'" alt="'+esc(g.title)+'" loading="lazy"'+
        ' onerror="this.parentElement.innerHTML=\'<div class=\\\'game-card-placeholder\\\'>'+esc(g.title[0])+'</div>\'">'+
        '<div class="game-card-decade">'+esc(g.decade)+'</div>'+
        (g.playUrl ? '<div class="game-card-playable">&#9654; Play</div>' : '')+
        '</div>'+
        '<div class="game-card-body"><h3 class="game-card-title">'+esc(g.title)+'</h3>'+
        '<div class="game-card-meta"><span>'+esc(String(g.year))+'</span><span class="dot">·</span><span>'+esc(g.genre)+'</span></div>'+
        '<p class="game-card-platform">'+esc(g.platform)+'</p></div></a>';
}
function loadMore(){
    if(rendered>=allGames.length)return;
    const next=allGames.slice(rendered,rendered+PAGE);
    grid.insertAdjacentHTML('beforeend',next.map(cardHtml).join(''));
    rendered+=next.length;
}
new IntersectionObserver(e=>{if(e[0].isIntersecting)loadMore();},{rootMargin:'200px'}).observe(sentinel);
</script>
</body>
</html>`;
}

const CATEGORY_LABELS = {
  history: 'History',
  profile: 'Profile',
  technology: 'Technology',
  culture: 'Culture',
  design: 'Design',
};

function essaysListPage() {
  const byCategory = {};
  for (const e of ESSAYS) {
    if (!byCategory[e.category]) byCategory[e.category] = [];
    byCategory[e.category].push(e);
  }

  const categoryOrder = ['history', 'profile', 'technology', 'culture', 'design'];
  const sections = categoryOrder.filter(c => byCategory[c]).map(cat => {
    const label = CATEGORY_LABELS[cat] || cat;
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
  <h3 class="essays-category-heading">${escapeHtml(label)}</h3>
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
  const categoryLabel = CATEGORY_LABELS[essay.category] || essay.category;
  const articleSections = essay.sections.map((s, i) => `
<div class="essay-section" id="section-${i}">
  <h2>${escapeHtml(s.title)}</h2>
  ${s.html}
</div>`).join('');

  const tocItems = essay.sections.map((s, i) =>
    `<li><a href="#section-${i}">${escapeHtml(s.title)}</a></li>`
  ).join('');

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
  const cardHtml = buildCardHtml(devGames.slice(0, PAGE_SIZE), EAGER_IMAGES);
  const inlineData = JSON.stringify(devGames.map(({ id, title, year, decade, genre, platform, developer, image, playUrl }) =>
    ({ id, title, year, decade, genre, platform, developer, image, playUrl: playUrl || null })
  ));

  const notableList = (dev.notableGames || []).map(g => `<li>${escapeHtml(g)}</li>`).join('');
  const figureList = (dev.keyFigures || []).map(f => `<span class="dev-figure">${escapeHtml(f)}</span>`).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(dev.name)} – Developers – Bosnan</title>
    <meta name="description" content="${escapeHtml(dev.description.substring(0, 160))}">
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
  <div id="loadMoreSentinel" style="height:1px"></div>
</div>

${toggleScript()}
<script>
const allGames = ${inlineData};
const PAGE = ${PAGE_SIZE};
let rendered = Math.min(PAGE, allGames.length);
const grid = document.getElementById('gamesGrid');
const sentinel = document.getElementById('loadMoreSentinel');
function esc(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function cardHtml(g){
    return '<a href="/games/'+g.id+'" class="game-card">'+
        '<div class="game-card-img-wrap">'+
        '<img src="/'+esc(g.image)+'" alt="'+esc(g.title)+'" loading="lazy"'+
        ' onerror="this.parentElement.innerHTML=\'<div class=\\\'game-card-placeholder\\\'>'+esc(g.title[0])+'</div>\'">'+
        '<div class="game-card-decade">'+esc(g.decade)+'</div>'+
        (g.playUrl ? '<div class="game-card-playable">&#9654; Play</div>' : '')+
        '</div>'+
        '<div class="game-card-body"><h3 class="game-card-title">'+esc(g.title)+'</h3>'+
        '<div class="game-card-meta"><span>'+esc(String(g.year))+'</span><span class="dot">·</span><span>'+esc(g.genre)+'</span></div>'+
        '<p class="game-card-platform">'+esc(g.platform)+'</p></div></a>';
}
function loadMore(){
    if(rendered>=allGames.length)return;
    const next=allGames.slice(rendered,rendered+PAGE);
    grid.insertAdjacentHTML('beforeend',next.map(cardHtml).join(''));
    rendered+=next.length;
}
new IntersectionObserver(e=>{if(e[0].isIntersecting)loadMore();},{rootMargin:'200px'}).observe(sentinel);
</script>
</body>
</html>`;
}

function notFoundPage() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <title>Not Found – Bosnan</title>
    ${cssHead()}
</head>
<body>
${bgLogo()}
<nav><img src="/logo.svg" alt="Bosnan Logo" width="50" height="50">
  <div class="nav-links">
    <a href="/index.html">Home</a><a href="/game.html">Game</a><a href="/games">Games</a><a href="/platforms">Platforms</a>
  </div>
</nav>
<section class="hero"><h1 style="font-size:40px">Not Found</h1><p>That page doesn't exist.</p>
<a href="/games" class="btn" style="margin-top:20px">Browse Games</a></section>
</body>
</html>`;
}

app.listen(PORT, () => {
  console.log(`Bosnan server running at http://localhost:${PORT}`);
  console.log(`CSS bundle: ${CSS_PATH} (${rawCss.length} bytes raw)`);
});
