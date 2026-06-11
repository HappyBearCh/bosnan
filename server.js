const express = require('express');
const compression = require('compression');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;

const games = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'games.json'), 'utf8'));
const GENRES = require('./data/genres');
const ESSAYS = [...require('./data/essays'), ...require('./data/essays2'), ...require('./data/essays3'), ...require('./data/essays4'), ...require('./data/essays5'), ...require('./data/essays6'), ...require('./data/essays7'), ...require('./data/essays8'), ...require('./data/essays9'), ...require('./data/essays10'), ...require('./data/essays11')];
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
    id: 'amiga', name: 'Commodore Amiga', shortName: 'Amiga', era: '1985 – 1996',
    manufacturer: 'Commodore International',
    keyword: 'Amiga',
    description: 'The Amiga was the most capable home computer of its era — its custom chips (Agnus, Denise, Paula) enabled multitasking, 4096-colour graphics, and eight-voice stereo audio that no competitor could match until the mid-1990s. It became the platform of choice for game developers, video producers, and musicians alike.',
    longDescription: 'Launched in 1985, the Amiga 1000 used three custom chips designed by Jay Miner — the same engineer who had designed the Atari 2600\'s TIA chip — to deliver multimedia capabilities that the IBM PC and Apple Macintosh could not approach. Agnus handled DMA and graphics, Denise managed display generation with up to 4,096 simultaneous colours (HAM mode), and Paula processed audio with four 8-bit PCM channels and handled floppy disk I/O. The system\'s AmigaOS was genuinely multitasking at a time when DOS was entirely single-tasking. Games on the Amiga routinely exceeded what console developers achieved on dedicated gaming hardware; titles like Shadow of the Beast pushed colour and animation quality to levels the NES and Master System could not approach. The Amiga\'s decline after Commodore\'s 1994 bankruptcy left a devoted user community that maintained hardware and software support well into the 2000s.',
  },
  {
    id: 'atari-st', name: 'Atari ST', era: '1985 – 1993',
    manufacturer: 'Atari Corporation',
    keyword: 'Atari ST',
    description: 'The Atari ST used the Motorola 68000 processor and launched one year before the Amiga at a lower price, dominating the European market for music production thanks to built-in MIDI ports. In Germany and France especially, it was the primary home computer through the late 1980s.',
    longDescription: 'Jack Tramiel\'s Atari Corporation developed the ST rapidly after his departure from Commodore, releasing it in 1985 at a significantly lower price than the Amiga. The ST used the same Motorola 68000 CPU but with a simpler custom chip set (Shifter for graphics, GLUE for logic, ACIA for serial I/O). Where the Amiga\'s custom chips were purpose-designed for multimedia output, the ST\'s architecture was more conventional, with GEM — a licensed graphical user interface — providing the windowed environment. The ST\'s killer feature was its built-in MIDI in/out/thru ports, making it the music production computer of choice for professional musicians through the late 1980s. In recording studios, the Atari ST was ubiquitous as a MIDI sequencer host long after computers with superior general capabilities were available. Its game library, while extensive, was generally considered inferior to the Amiga\'s, though several titles — notably MIDI Maze, one of the first networked multiplayer games — used the ST\'s specific capabilities in ways the Amiga could not replicate.',
  },
  {
    id: 'atari-8bit', name: 'Atari 8-bit', shortName: 'Atari 8-bit', era: '1979 – 1992',
    manufacturer: 'Atari, Inc.',
    keyword: 'Atari 8-bit',
    description: 'Atari\'s home computer line — the 400, 800, XL, and XE series — used CTIA/GTIA and POKEY custom chips to deliver graphics and audio that exceeded the Apple II and outpaced most competitors. Many influential games and the first computer RPGs appeared on Atari 8-bit hardware.',
    longDescription: 'The Atari 400 and 800 launched in 1979 with hardware designed by Jay Miner (before his Amiga work) using three custom chips: CTIA/GTIA for graphics, POKEY for audio and keyboard input, and PIA for I/O. The GTIA chip\'s sprite handling and colour capabilities exceeded the Apple II significantly, making the Atari 8-bit line the premium home computer gaming platform of its era. The POKEY chip provided four audio channels with distortion control that produced more complex sounds than the beepers of competing computers. Games like Rescue on Fractalus, Ballblazer, and The Seven Cities of Gold from Lucasfilm Games (later LucasArts) debuted on Atari 8-bit hardware. Richard Garriott\'s early Ultima games originated here. The platform remained commercially viable through the XL series (1983) and XE series (1985) before DOS-based PCs made it obsolete in the late 1980s.',
  },
  {
    id: 'atari-lynx', name: 'Atari Lynx', shortName: 'Lynx', era: '1989 – 1995',
    manufacturer: 'Atari Corporation',
    keyword: 'Atari Lynx',
    description: 'The Lynx was the first handheld with a colour backlit screen, designed by Epyx before being acquired and marketed by Atari. Superior hardware to the Game Boy — faster processor, more colours, hardware sprite scaling — couldn\'t overcome the Game Boy\'s battery life, software library, and price advantage.',
    longDescription: 'The Lynx originated as the "Handy" at Epyx, a game publisher that had designed the hardware before running out of funding and selling the project to Atari. The hardware was genuinely impressive: a 16-bit 65C02 processor, a dedicated blitter chip with hardware sprite scaling and distortion, a backlit colour LCD displaying 4,096 colours, and a built-in ComLynx port for multiplayer linking up to eight units. Atari launched it at $179.95 in 1989, compared to the Game Boy\'s $89.95, and the price differential immediately limited its market penetration. The battery problem was severe: the colour backlit display consumed six AA batteries in approximately four hours, compared to the Game Boy\'s fifteen hours on four batteries. Despite a library of technically impressive games — California Games demonstrated hardware sprite scaling no other handheld could match — the Lynx sold approximately three million units against the Game Boy\'s eventual 118 million.',
  },
  {
    id: '3do', name: '3DO Interactive Multiplayer', shortName: '3DO', era: '1993 – 1996',
    manufacturer: 'Various (Panasonic, Goldstar, Sanyo)',
    keyword: '3DO',
    description: 'Trip Hawkins\'s ambitious open-standard console launched at $699 in 1993, making it the most expensive home console ever released. Despite impressive hardware and a triple-speed CD-ROM drive, its price and the imminent PlayStation announcement ended its commercial viability within two years.',
    longDescription: 'The 3DO Company did not manufacture hardware — it licensed the 3DO specification to consumer electronics companies (Panasonic, Goldstar, Sanyo) who built compatible machines. This open-platform approach was intended to create competition that would drive prices down; instead, it complicated the consumer message and divided game development resources. The hardware specification was advanced for 1993: a 32-bit ARM60 CPU at 12.5 MHz, dedicated graphics processor with texture mapping, a triple-speed CD-ROM drive, and 2MB of DRAM. The $699 launch price was set by manufacturing costs that the open-hardware model had not reduced as anticipated. Trip Hawkins had founded Electronic Arts and genuinely believed the 3DO would become the dominant gaming platform; the PlayStation\'s 1994 announcement at $299 — with equivalent or superior hardware — made the 3DO\'s business case untenable within months of its launch.',
  },
  {
    id: 'atari-jaguar', name: 'Atari Jaguar', shortName: 'Jaguar', era: '1993 – 1996',
    manufacturer: 'Atari Corporation',
    keyword: 'Atari Jaguar',
    description: 'Marketed as "the only 64-bit game system" — a claim of disputed technical accuracy — the Jaguar was Atari\'s last hardware attempt. Its complex architecture frustrated developers and its software library remained thin despite some technically impressive titles like Tempest 2000.',
    longDescription: 'Atari marketed the Jaguar aggressively on its 64-bit specification — two 32-bit custom chips (Tom and Jerry) plus an additional Motorola 68000 for compatibility, which Atari combined to claim 64-bit processing. The marketing was technically misleading; the processor doing most of the work was either the 32-bit Tom or the 32-bit Jerry, not a unified 64-bit architecture. The Jaguar launched at $249.99 in November 1993, priced competitively with the 3DO, but its custom architecture proved difficult to program. Most games were developed primarily for the 68000 CPU — the chip developers knew — rather than exploiting Tom and Jerry\'s parallel processing capabilities. The result was a platform whose library underrepresented its hardware potential, with exceptions: Tempest 2000 (1994), Jeff Minter\'s psychedelic update of the Atari arcade classic, was universally acclaimed and demonstrated what the hardware could do when properly used. The Jaguar sold approximately 250,000 units before Atari Corporation merged with JTS in 1996, ending Atari\'s hardware business.',
  },
  {
    id: 'virtual-boy', name: 'Nintendo Virtual Boy', shortName: 'Virtual Boy', era: '1995 – 1996',
    manufacturer: 'Nintendo',
    keyword: 'Virtual Boy',
    description: 'Gunpei Yokoi\'s final major hardware project used oscillating mirrors and red LED arrays to create a stereoscopic 3D effect. Despite impressive depth illusion, the monochrome red display, health warning advisories, and tabletop form factor combined to produce Nintendo\'s first significant hardware failure.',
    longDescription: 'The Virtual Boy used a display technology Gunpei Yokoi called "Reflection Technology" — oscillating mirrors that reflected rapidly modulated LED arrays to create the impression of depth. The system was not worn on the head like VR headsets; it sat on a tabletop and the player leaned forward to look into an eyepiece. The monochrome red display — chosen because red LEDs were cheapest and smallest — produced high contrast images but no colour information, limiting game aesthetics severely. Nintendo included health warnings advising players to take breaks every fifteen minutes due to concerns about eyestrain and potential developmental effects in young children. The system launched in Japan in July 1995 and North America in August 1995; Nintendo discontinued it in December 1995 in Japan and discontinued North American sales and development support in early 1996. Only 22 games were released commercially. The failure contributed to Yokoi\'s resignation from Nintendo in 1996; he died in a road accident in 1997.',
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
    longDescription: 'Launched in Japan in 1990 and globally in 1991, the Game Gear used essentially the same hardware as the Sega Master System — an 8-bit Z80 CPU and a colour display capable of showing 32 colours simultaneously from a palette of 4,096. Its backlit screen was a genuine advantage over the Game Boy\'s passive LCD, making it far easier to play in low-light conditions, and an optional TV tuner add-on allowed it to receive television signals. The Game Gear sold approximately 10-11 million units — a respectable figure, but one that pales against the Game Boy\'s 118 million. The battery problem was genuine: where the Game Boy ran for 15 hours on four AA batteries, the Game Gear\'s colour backlit display drained six batteries in four hours. Its library, strong in ports of arcade and Master System titles, lacked the Game Boy-exclusive franchises — Pokémon, Mario Land, Zelda — that drove hardware sales.',
  },
  {
    id: 'sega-master-system', name: 'Sega Master System', shortName: 'Master System', era: '1985 – 1992',
    manufacturer: 'Sega',
    keyword: 'Sega Master System',
    description: 'The Master System was Sega\'s 8-bit console competitor to the NES — technically superior, with better graphics and sound, but commercially dominated in North America by Nintendo\'s licensing practices and in Japan by the Famicom\'s installed base. It found its strongest market in Europe and Brazil.',
    longDescription: 'The Sega Master System (known as the Mark III in Japan) launched in 1985 with a Z80 CPU, TMS9918A-derived VDP displaying up to 64 colours simultaneously, and a Yamaha SN76489 sound generator. The hardware exceeded the NES in raw specifications: more colours on screen, smoother scrolling, and a wider colour palette. Despite these advantages, the NES held over 90% of the North American market — a consequence of Nintendo\'s exclusive licensing agreements with third-party publishers that prevented them from releasing games on competing platforms.\n\nEurope and Brazil told a different story. In the UK, France, Germany, and Brazil, the Master System competed effectively with the NES and often outsold it. Sega\'s European distribution infrastructure and the absence of Nintendo\'s restrictive licensing practices in European markets gave third-party developers freedom to release on both platforms, creating a more competitive environment. In Brazil specifically, the Master System\'s popularity persisted into the mid-1990s — local manufacturer TecToy produced the console and new games years after Sega had discontinued it globally.\n\nThe Master System\'s game library included genuine exclusives: Wonder Boy III: The Dragon\'s Trap (1989) was a sophisticated action RPG unavailable on NES; Phantasy Star (1987) was among the finest 8-bit RPGs on any platform; Alex Kidd in Miracle World (1986) was a polished platformer built into the console\'s BIOS as a default cartridge in later hardware revisions. These titles demonstrated Sega\'s capacity for quality first-party development that the system\'s commercial position in North America obscured.',
  },
  {
    id: 'zx-spectrum', name: 'ZX Spectrum', era: '1982 – 1992',
    manufacturer: 'Sinclair Research',
    keyword: 'ZX Spectrum',
    description: 'Clive Sinclair\'s rubber-keyed home computer was the dominant gaming platform in the United Kingdom through the 1980s, producing a generation of British programmers and a software industry that competed globally. Its 48KB of RAM and single-channel beeper defined the aesthetic of British bedroom coding.',
    longDescription: 'The ZX Spectrum launched in 1982 at £125 for the 16KB model and £175 for the 48KB model — significantly cheaper than any competitor. Clive Sinclair\'s cost-optimisation was aggressive: the rubber keyboard was cheap to manufacture; the single-channel beeper was the minimum audio hardware; the composite video output produced colour with a distinctive attribute-clash artefact where each 8×8 pixel cell could contain only two colours. These constraints were not considered limitations by the British developers who built on them — they were the material of the platform.\n\nThe ZX Spectrum\'s cultural importance in British computing cannot be overstated. A generation of UK programmers learned to code on the platform using Sinclair BASIC before progressing to machine code Z80 programming. Companies that began as bedroom coding operations — Ultimate Play the Game (which became Rare), Psygnosis, Ocean Software, Codemasters — developed their first titles for the Spectrum before expanding to other platforms. The British games industry\'s subsequent international success in the 1990s and 2000s was directly traceable to the development talent that had been trained on Spectrum hardware.\n\nThe Spectrum\'s game library was vast but uneven: alongside genuine classics like Manic Miner, Knight Lore, and Elite, thousands of quickly-produced titles took advantage of the platform\'s low barriers to entry. The attribute-clash artefact — where moving sprites produced colour collisions with the background — was so pervasive that it became part of the platform\'s visual identity. The rubber-keyed original and the later Spectrum+ with conventional keys both sold millions of units across the UK and Europe.',
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
    longDescription: 'The ColecoVision launched in August 1982 with a Donkey Kong port that retained all four stages of the arcade original — the Atari 2600 version had included only two. This difference, immediately apparent to players who had played the arcade game, gave Coleco a compelling marketing position: the console with arcade-quality games. The hardware supported it: the Z80 CPU at 3.58 MHz, TMS9918A video processor displaying 256×192 at 16 colours, and SN76489 sound generator produced specifications that exceeded the Atari 2600 significantly and competed with the Intellivision on favourable terms.\n\nThe ColecoVision sold 6 million units in its commercial window — strong performance for 1982-1983. The 1983 video game crash, triggered by the Atari 2600 market collapse and a flood of poor-quality software, affected all console manufacturers; Coleco discontinued the ColecoVision in 1985. The Expansion Module #1 allowed ColecoVision owners to play Atari 2600 cartridges, providing access to a much larger software library — Atari sued unsuccessfully to prevent this. The ColecoVision\'s legacy is primarily as the first console to demonstrate convincingly that the arcade experience could be approximated at home.',
  },
  {
    id: 'pc-9801', name: 'NEC PC-9801', shortName: 'PC-9801', era: '1982 – 2000',
    manufacturer: 'NEC',
    keyword: 'PC-9801',
    description: 'The NEC PC-9801 was Japan\'s dominant personal computer platform for nearly two decades, running a proprietary DOS-compatible operating system. It was the development platform and primary market for classic Japanese games including the original Ys, Dragon Slayer, and early Touhou Project titles.',
    longDescription: 'NEC introduced the PC-9801 in 1982 as a business computer running a modified MS-DOS (called PC-DOS) on an Intel 8086 processor. The hardware became Japan\'s dominant personal computer architecture, maintaining over 50% market share through the late 1980s and early 1990s against IBM PC-compatible competition. The platform\'s dominance was sustained by Japanese-language software support and the ecosystem of software, including games, that had been developed specifically for its architecture.\n\nThe PC-9801\'s graphics capabilities — initially 640×400 at 8 colours, later expanded with 16-colour and eventually 256-colour modes — were superior to contemporary IBM PC CGA but required software written specifically for the platform\'s hardware rather than IBM PC standards. This created a parallel game development ecosystem entirely distinct from Western PC gaming: Nihon Falcom\'s Dragon Slayer series and Ys games, Hideo Kojima\'s Snatcher and Policenauts, and the earliest Touhou Project entries were all PC-9801 exclusives before being ported to other platforms or remaining Japan-only.\n\nThe FM sound capabilities of later PC-9801 hardware — typically through optional FM sound boards using Yamaha OPL or OPN chips — enabled game music of quality comparable to dedicated game hardware. Yuzo Koshiro\'s Ys soundtracks, composed for PC-88 and PC-98 FM hardware before being adapted for consoles, represented the peak of Japanese home computer game music. The PC-9801\'s architecture was replaced by IBM PC-compatible hardware in Japan during the mid-1990s as PC/AT-compatible machines achieved sufficient Japanese-language software support to displace the proprietary platform.',
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
let cachedComposersListHtml = null;
let cachedFranchisesListHtml = null;
let cachedHardwareListHtml = null;
let cachedDesignersListHtml = null;
let cachedYearsListHtml = null;
let cachedRegionalListHtml = null;
let cachedPublishersListHtml = null;
let cachedArcadeBoardsListHtml = null;
let cachedPeripheralsListHtml = null;
let cachedLostGamesListHtml = null;
let cachedDecadesListHtml = null;
let cachedFamilyTreeHtml = null;
let cachedCompareHtml = null;
const cachedDesignerPageHtml = {};
const cachedYearPageHtml = {};
const cachedRegionalPageHtml = {};
const cachedPublisherPageHtml = {};
const cachedArcadeBoardPageHtml = {};
const cachedPeripheralPageHtml = {};
const cachedLostGamePageHtml = {};
const cachedDecadePageHtml = {};
const cachedEssayPageHtml = {};
let cachedGameLauncherHtml = null;
const cachedPlatformPageHtml = {};
const cachedGenrePageHtml = {};
const cachedDeveloperPageHtml = {};
const cachedComposerPageHtml = {};
const cachedFranchisePageHtml = {};
const cachedHardwarePageHtml = {};
const cachedGamePageHtml = new Map();
let cachedSequelsListHtml = null;
let cachedRomHacksListHtml = null;
let cachedAdCampaignsListHtml = null;
let cachedSalesFiguresHtml = null;
let cachedSpeedrunsListHtml = null;
let cachedCriticsListHtml = null;
let cachedWordSearchHtml = null;
let cachedBookmarksHtml = null;
const cachedSequelPageHtml = {};
const cachedRomHackPageHtml = {};
const cachedAdCampaignPageHtml = {};
const cachedSalesFigurePageHtml = {};
const cachedSpeedrunPageHtml = {};
const cachedCriticPageHtml = {};
let cachedControversiesListHtml = null;
let cachedFailedConsolesListHtml = null;
let cachedGameEnginesListHtml = null;
let cachedSoundChipsListHtml = null;
let cachedEasterEggsListHtml = null;
let cachedGlossaryHtml = null;
let cachedCheatCodesListHtml = null;
let cachedQuizHtml = null;
let cachedOnThisDayHtml = null;
let cachedStudioMapHtml = null;
const cachedControversyPageHtml = {};
const cachedFailedConsolePageHtml = {};
const cachedGameEnginePageHtml = {};
const cachedSoundChipPageHtml = {};
const cachedEasterEggPageHtml = {};
const cachedCheatCodePageHtml = {};
let cachedMagazinesListHtml = null;
let cachedBoxArtListHtml = null;
let cachedPortsListHtml = null;
let cachedVoiceActorsListHtml = null;
let cachedPixelArtistsListHtml = null;
let cachedProducersListHtml = null;
let cachedCollectionsListHtml = null;
let cachedStatsHtml = null;
let cachedRecentHtml = null;
let cachedTimelineHtml = null;
const cachedMagazinePageHtml = {};
const cachedBoxArtPageHtml = {};
const cachedPortPageHtml = {};
const cachedVoiceActorPageHtml = {};
const cachedPixelArtistPageHtml = {};
const cachedProducerPageHtml = {};
const cachedCollectionPageHtml = {};
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
        ${link('/composers', 'Composers', 'composers')}
        ${link('/franchises', 'Franchises', 'franchises')}
        ${link('/hardware', 'Hardware', 'hardware')}
        ${link('/designers', 'Designers', 'designers')}
        ${link('/publishers', 'Publishers', 'publishers')}
        ${link('/arcade-boards', 'Arcade', 'arcade-boards')}
        ${link('/peripherals', 'Peripherals', 'peripherals')}
        ${link('/lost-games', 'Lost Games', 'lost-games')}
        ${link('/years', 'By Year', 'years')}
        ${link('/decades', 'Decades', 'decades')}
        ${link('/regional', 'Regional', 'regional')}
        ${link('/family-tree', 'Family Tree', 'family-tree')}
        ${link('/compare', 'Compare', 'compare')}
        ${link('/search', 'Search', 'search')}
        ${link('/genres', 'Encyclopedia', 'genres')}
        ${link('/essays', 'Essays', 'essays')}
        ${link('/sequels', 'Sequels', 'sequels')}
        ${link('/rom-hacks', 'ROM Hacks', 'rom-hacks')}
        ${link('/ad-campaigns', 'Ads', 'ad-campaigns')}
        ${link('/sales-figures', 'Sales', 'sales-figures')}
        ${link('/speedruns', 'Speedruns', 'speedruns')}
        ${link('/critics', 'Critics', 'critics')}
        ${link('/wordsearch', 'Word Search', 'wordsearch')}
        ${link('/bookmarks', 'Bookmarks', 'bookmarks')}
        ${link('/controversies', 'Controversies', 'controversies')}
        ${link('/failed-consoles', 'Failed Consoles', 'failed-consoles')}
        ${link('/game-engines', 'Engines', 'game-engines')}
        ${link('/sound-chips', 'Sound Chips', 'sound-chips')}
        ${link('/easter-eggs', 'Easter Eggs', 'easter-eggs')}
        ${link('/cheat-codes', 'Cheat Codes', 'cheat-codes')}
        ${link('/glossary', 'Glossary', 'glossary')}
        ${link('/quiz', 'Quiz', 'quiz')}
        ${link('/on-this-day', 'On This Day', 'on-this-day')}
        ${link('/map', 'Studio Map', 'map')}
        ${link('/magazines', 'Magazines', 'magazines')}
        ${link('/collections', 'Lists', 'collections')}
        ${link('/ports', 'Ports', 'ports')}
        ${link('/box-art', 'Box Art', 'box-art')}
        ${link('/voice-actors', 'Voice Actors', 'voice-actors')}
        ${link('/pixel-artists', 'Pixel Artists', 'pixel-artists')}
        ${link('/producers', 'Producers', 'producers')}
        ${link('/timeline', 'Timeline', 'timeline')}
        ${link('/stats', 'Stats', 'stats')}
        ${link('/recent', 'Recent', 'recent')}
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
    const staticUrls = ['', '/games', '/platforms', '/developers', '/composers', '/franchises', '/hardware', '/designers', '/publishers', '/arcade-boards', '/peripherals', '/lost-games', '/years', '/decades', '/regional', '/family-tree', '/compare', '/search', '/genres', '/essays', '/magazines', '/box-art', '/ports', '/voice-actors', '/pixel-artists', '/producers', '/collections', '/timeline', '/stats', '/recent', '/controversies', '/failed-consoles', '/game-engines', '/sound-chips', '/easter-eggs', '/cheat-codes', '/glossary', '/quiz', '/on-this-day', '/map', '/sequels', '/rom-hacks', '/ad-campaigns', '/sales-figures', '/speedruns', '/critics', '/wordsearch', '/bookmarks'].map(p => `
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
    cachedSitemap = {
      host,
      xml: `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${staticUrls}${platformUrls}${developerUrls}${composerUrls}${franchiseUrls}${hardwareUrls}${designerUrls}${publisherUrls}${arcadeBoardUrls}${peripheralUrls}${lostGameUrls}${regionalUrls}${genreUrls}${essayUrls}${yearUrls}${decadeUrls}${magazineUrls}${boxArtUrls}${portUrls}${voiceActorUrls}${pixelArtistUrls}${producerUrls}${collectionUrls}${controversyUrls}${failedConsoleUrls}${gameEngineUrls}${soundChipUrls}${easterEggUrls}${cheatCodeUrls}${sequelUrls}${romHackUrls}${adCampaignUrls}${speedrunUrls}${criticUrls}${gameUrls}
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

app.get('/composers', (req, res) => {
  if (!cachedComposersListHtml) cachedComposersListHtml = composersListPage();
  res.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
  res.set('Link', `<${CSS_PATH}>; rel=preload; as=style`);
  res.send(cachedComposersListHtml);
});

app.get('/composers/:id', (req, res) => {
  const c = COMPOSERS.find(x => x.id === req.params.id);
  if (!c) return res.status(404).send(notFoundPage());
  if (!cachedComposerPageHtml[c.id]) cachedComposerPageHtml[c.id] = composerDetailPage(c);
  res.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
  res.set('Link', `<${CSS_PATH}>; rel=preload; as=style`);
  res.send(cachedComposerPageHtml[c.id]);
});

app.get('/franchises', (req, res) => {
  if (!cachedFranchisesListHtml) cachedFranchisesListHtml = franchisesListPage();
  res.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
  res.set('Link', `<${CSS_PATH}>; rel=preload; as=style`);
  res.send(cachedFranchisesListHtml);
});

app.get('/franchises/:id', (req, res) => {
  const f = FRANCHISES.find(x => x.id === req.params.id);
  if (!f) return res.status(404).send(notFoundPage());
  if (!cachedFranchisePageHtml[f.id]) cachedFranchisePageHtml[f.id] = franchiseDetailPage(f);
  res.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
  res.set('Link', `<${CSS_PATH}>; rel=preload; as=style`);
  res.send(cachedFranchisePageHtml[f.id]);
});

app.get('/hardware', (req, res) => {
  if (!cachedHardwareListHtml) cachedHardwareListHtml = hardwareListPage();
  res.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
  res.set('Link', `<${CSS_PATH}>; rel=preload; as=style`);
  res.send(cachedHardwareListHtml);
});

app.get('/hardware/:id', (req, res) => {
  const hw = HARDWARE.find(x => x.id === req.params.id);
  if (!hw) return res.status(404).send(notFoundPage());
  if (!cachedHardwarePageHtml[hw.id]) cachedHardwarePageHtml[hw.id] = hardwareDetailPage(hw);
  res.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
  res.set('Link', `<${CSS_PATH}>; rel=preload; as=style`);
  res.send(cachedHardwarePageHtml[hw.id]);
});

app.get('/designers', (req, res) => {
  if (!cachedDesignersListHtml) cachedDesignersListHtml = designersListPage();
  res.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
  res.set('Link', `<${CSS_PATH}>; rel=preload; as=style`);
  res.send(cachedDesignersListHtml);
});

app.get('/designers/:id', (req, res) => {
  const d = DESIGNERS.find(x => x.id === req.params.id);
  if (!d) return res.status(404).send(notFoundPage());
  if (!cachedDesignerPageHtml[d.id]) cachedDesignerPageHtml[d.id] = designerDetailPage(d);
  res.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
  res.set('Link', `<${CSS_PATH}>; rel=preload; as=style`);
  res.send(cachedDesignerPageHtml[d.id]);
});

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

app.get('/regional', (req, res) => {
  if (!cachedRegionalListHtml) cachedRegionalListHtml = regionalListPage();
  res.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
  res.set('Link', `<${CSS_PATH}>; rel=preload; as=style`);
  res.send(cachedRegionalListHtml);
});

app.get('/regional/:id', (req, res) => {
  const article = REGIONAL.find(x => x.id === req.params.id);
  if (!article) return res.status(404).send(notFoundPage());
  if (!cachedRegionalPageHtml[article.id]) cachedRegionalPageHtml[article.id] = regionalDetailPage(article);
  res.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
  res.set('Link', `<${CSS_PATH}>; rel=preload; as=style`);
  res.send(cachedRegionalPageHtml[article.id]);
});

app.get('/publishers', (req, res) => {
  if (!cachedPublishersListHtml) cachedPublishersListHtml = publishersListPage();
  res.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
  res.set('Link', `<${CSS_PATH}>; rel=preload; as=style`);
  res.send(cachedPublishersListHtml);
});

app.get('/publishers/:id', (req, res) => {
  const pub = PUBLISHERS.find(x => x.id === req.params.id);
  if (!pub) return res.status(404).send(notFoundPage());
  if (!cachedPublisherPageHtml[pub.id]) cachedPublisherPageHtml[pub.id] = publisherDetailPage(pub);
  res.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
  res.set('Link', `<${CSS_PATH}>; rel=preload; as=style`);
  res.send(cachedPublisherPageHtml[pub.id]);
});

app.get('/arcade-boards', (req, res) => {
  if (!cachedArcadeBoardsListHtml) cachedArcadeBoardsListHtml = arcadeBoardsListPage();
  res.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
  res.set('Link', `<${CSS_PATH}>; rel=preload; as=style`);
  res.send(cachedArcadeBoardsListHtml);
});

app.get('/arcade-boards/:id', (req, res) => {
  const board = ARCADE_BOARDS.find(x => x.id === req.params.id);
  if (!board) return res.status(404).send(notFoundPage());
  if (!cachedArcadeBoardPageHtml[board.id]) cachedArcadeBoardPageHtml[board.id] = arcadeBoardDetailPage(board);
  res.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
  res.set('Link', `<${CSS_PATH}>; rel=preload; as=style`);
  res.send(cachedArcadeBoardPageHtml[board.id]);
});

app.get('/peripherals', (req, res) => {
  if (!cachedPeripheralsListHtml) cachedPeripheralsListHtml = peripheralsListPage();
  res.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
  res.set('Link', `<${CSS_PATH}>; rel=preload; as=style`);
  res.send(cachedPeripheralsListHtml);
});

app.get('/peripherals/:id', (req, res) => {
  const periph = PERIPHERALS.find(x => x.id === req.params.id);
  if (!periph) return res.status(404).send(notFoundPage());
  if (!cachedPeripheralPageHtml[periph.id]) cachedPeripheralPageHtml[periph.id] = peripheralDetailPage(periph);
  res.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
  res.set('Link', `<${CSS_PATH}>; rel=preload; as=style`);
  res.send(cachedPeripheralPageHtml[periph.id]);
});

app.get('/lost-games', (req, res) => {
  if (!cachedLostGamesListHtml) cachedLostGamesListHtml = lostGamesListPage();
  res.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
  res.set('Link', `<${CSS_PATH}>; rel=preload; as=style`);
  res.send(cachedLostGamesListHtml);
});

app.get('/lost-games/:id', (req, res) => {
  const lg = LOST_GAMES.find(x => x.id === req.params.id);
  if (!lg) return res.status(404).send(notFoundPage());
  if (!cachedLostGamePageHtml[lg.id]) cachedLostGamePageHtml[lg.id] = lostGameDetailPage(lg);
  res.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
  res.set('Link', `<${CSS_PATH}>; rel=preload; as=style`);
  res.send(cachedLostGamePageHtml[lg.id]);
});

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

app.get('/magazines', (req, res) => {
  if (!cachedMagazinesListHtml) cachedMagazinesListHtml = magazinesListPage();
  res.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
  res.set('Link', `<${CSS_PATH}>; rel=preload; as=style`);
  res.send(cachedMagazinesListHtml);
});
app.get('/magazines/:id', (req, res) => {
  const mag = MAGAZINES.find(m => m.id === req.params.id);
  if (!mag) return res.status(404).send(notFoundPage());
  if (!cachedMagazinePageHtml[mag.id]) cachedMagazinePageHtml[mag.id] = magazineDetailPage(mag);
  res.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
  res.send(cachedMagazinePageHtml[mag.id]);
});

app.get('/box-art', (req, res) => {
  if (!cachedBoxArtListHtml) cachedBoxArtListHtml = boxArtListPage();
  res.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
  res.set('Link', `<${CSS_PATH}>; rel=preload; as=style`);
  res.send(cachedBoxArtListHtml);
});
app.get('/box-art/:id', (req, res) => {
  const entry = BOX_ART.find(b => b.id === req.params.id);
  if (!entry) return res.status(404).send(notFoundPage());
  if (!cachedBoxArtPageHtml[entry.id]) cachedBoxArtPageHtml[entry.id] = boxArtDetailPage(entry);
  res.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
  res.send(cachedBoxArtPageHtml[entry.id]);
});

app.get('/ports', (req, res) => {
  if (!cachedPortsListHtml) cachedPortsListHtml = portsListPage();
  res.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
  res.set('Link', `<${CSS_PATH}>; rel=preload; as=style`);
  res.send(cachedPortsListHtml);
});
app.get('/ports/:id', (req, res) => {
  const port = PORTS.find(p => p.id === req.params.id);
  if (!port) return res.status(404).send(notFoundPage());
  if (!cachedPortPageHtml[port.id]) cachedPortPageHtml[port.id] = portDetailPage(port);
  res.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
  res.send(cachedPortPageHtml[port.id]);
});

app.get('/voice-actors', (req, res) => {
  if (!cachedVoiceActorsListHtml) cachedVoiceActorsListHtml = voiceActorsListPage();
  res.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
  res.set('Link', `<${CSS_PATH}>; rel=preload; as=style`);
  res.send(cachedVoiceActorsListHtml);
});
app.get('/voice-actors/:id', (req, res) => {
  const va = VOICE_ACTORS.find(v => v.id === req.params.id);
  if (!va) return res.status(404).send(notFoundPage());
  if (!cachedVoiceActorPageHtml[va.id]) cachedVoiceActorPageHtml[va.id] = voiceActorDetailPage(va);
  res.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
  res.send(cachedVoiceActorPageHtml[va.id]);
});

app.get('/pixel-artists', (req, res) => {
  if (!cachedPixelArtistsListHtml) cachedPixelArtistsListHtml = pixelArtistsListPage();
  res.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
  res.set('Link', `<${CSS_PATH}>; rel=preload; as=style`);
  res.send(cachedPixelArtistsListHtml);
});
app.get('/pixel-artists/:id', (req, res) => {
  const artist = PIXEL_ARTISTS.find(a => a.id === req.params.id);
  if (!artist) return res.status(404).send(notFoundPage());
  if (!cachedPixelArtistPageHtml[artist.id]) cachedPixelArtistPageHtml[artist.id] = pixelArtistDetailPage(artist);
  res.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
  res.send(cachedPixelArtistPageHtml[artist.id]);
});

app.get('/producers', (req, res) => {
  if (!cachedProducersListHtml) cachedProducersListHtml = producersListPage();
  res.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
  res.set('Link', `<${CSS_PATH}>; rel=preload; as=style`);
  res.send(cachedProducersListHtml);
});
app.get('/producers/:id', (req, res) => {
  const prod = PRODUCERS.find(p => p.id === req.params.id);
  if (!prod) return res.status(404).send(notFoundPage());
  if (!cachedProducerPageHtml[prod.id]) cachedProducerPageHtml[prod.id] = producerDetailPage(prod);
  res.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
  res.send(cachedProducerPageHtml[prod.id]);
});

app.get('/collections', (req, res) => {
  if (!cachedCollectionsListHtml) cachedCollectionsListHtml = collectionsListPage();
  res.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
  res.set('Link', `<${CSS_PATH}>; rel=preload; as=style`);
  res.send(cachedCollectionsListHtml);
});
app.get('/collections/:id', (req, res) => {
  const col = COLLECTIONS.find(c => c.id === req.params.id);
  if (!col) return res.status(404).send(notFoundPage());
  if (!cachedCollectionPageHtml[col.id]) cachedCollectionPageHtml[col.id] = collectionDetailPage(col);
  res.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
  res.send(cachedCollectionPageHtml[col.id]);
});

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

app.get('/sequels', (req, res) => {
  if (!cachedSequelsListHtml) cachedSequelsListHtml = sequelsListPage();
  res.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
  res.set('Link', `<${CSS_PATH}>; rel=preload; as=style`);
  res.send(cachedSequelsListHtml);
});
app.get('/sequels/:id', (req, res) => {
  const item = SEQUELS.find(s => s.id === req.params.id);
  if (!item) return res.status(404).send(notFoundPage());
  if (!cachedSequelPageHtml[item.id]) cachedSequelPageHtml[item.id] = sequelDetailPage(item);
  res.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
  res.send(cachedSequelPageHtml[item.id]);
});

app.get('/rom-hacks', (req, res) => {
  if (!cachedRomHacksListHtml) cachedRomHacksListHtml = romHacksListPage();
  res.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
  res.set('Link', `<${CSS_PATH}>; rel=preload; as=style`);
  res.send(cachedRomHacksListHtml);
});
app.get('/rom-hacks/:id', (req, res) => {
  const item = ROM_HACKS.find(r => r.id === req.params.id);
  if (!item) return res.status(404).send(notFoundPage());
  if (!cachedRomHackPageHtml[item.id]) cachedRomHackPageHtml[item.id] = romHackDetailPage(item);
  res.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
  res.send(cachedRomHackPageHtml[item.id]);
});

app.get('/ad-campaigns', (req, res) => {
  if (!cachedAdCampaignsListHtml) cachedAdCampaignsListHtml = adCampaignsListPage();
  res.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
  res.set('Link', `<${CSS_PATH}>; rel=preload; as=style`);
  res.send(cachedAdCampaignsListHtml);
});
app.get('/ad-campaigns/:id', (req, res) => {
  const item = AD_CAMPAIGNS.find(a => a.id === req.params.id);
  if (!item) return res.status(404).send(notFoundPage());
  if (!cachedAdCampaignPageHtml[item.id]) cachedAdCampaignPageHtml[item.id] = adCampaignDetailPage(item);
  res.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
  res.send(cachedAdCampaignPageHtml[item.id]);
});

app.get('/sales-figures', (req, res) => {
  if (!cachedSalesFiguresHtml) cachedSalesFiguresHtml = salesFiguresPage();
  res.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
  res.set('Link', `<${CSS_PATH}>; rel=preload; as=style`);
  res.send(cachedSalesFiguresHtml);
});
app.get('/sales-figures/:id', (req, res) => {
  const item = SALES_FIGURES.find(s => s.id === req.params.id);
  if (!item) return res.status(404).send(notFoundPage());
  if (!cachedSalesFigurePageHtml[item.id]) cachedSalesFigurePageHtml[item.id] = salesFigureDetailPage(item);
  res.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
  res.send(cachedSalesFigurePageHtml[item.id]);
});

app.get('/speedruns', (req, res) => {
  if (!cachedSpeedrunsListHtml) cachedSpeedrunsListHtml = speedrunsListPage();
  res.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
  res.set('Link', `<${CSS_PATH}>; rel=preload; as=style`);
  res.send(cachedSpeedrunsListHtml);
});
app.get('/speedruns/:id', (req, res) => {
  const item = SPEEDRUNS.find(s => s.id === req.params.id);
  if (!item) return res.status(404).send(notFoundPage());
  if (!cachedSpeedrunPageHtml[item.id]) cachedSpeedrunPageHtml[item.id] = speedrunDetailPage(item);
  res.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
  res.send(cachedSpeedrunPageHtml[item.id]);
});

app.get('/critics', (req, res) => {
  if (!cachedCriticsListHtml) cachedCriticsListHtml = criticsListPage();
  res.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
  res.set('Link', `<${CSS_PATH}>; rel=preload; as=style`);
  res.send(cachedCriticsListHtml);
});
app.get('/critics/:id', (req, res) => {
  const item = CRITICS.find(c => c.id === req.params.id);
  if (!item) return res.status(404).send(notFoundPage());
  if (!cachedCriticPageHtml[item.id]) cachedCriticPageHtml[item.id] = criticDetailPage(item);
  res.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
  res.send(cachedCriticPageHtml[item.id]);
});

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

app.get('/controversies', (req, res) => {
  if (!cachedControversiesListHtml) cachedControversiesListHtml = controversiesListPage();
  res.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
  res.set('Link', `<${CSS_PATH}>; rel=preload; as=style`);
  res.send(cachedControversiesListHtml);
});
app.get('/controversies/:id', (req, res) => {
  const item = CONTROVERSIES.find(c => c.id === req.params.id);
  if (!item) return res.status(404).send(notFoundPage());
  if (!cachedControversyPageHtml[item.id]) cachedControversyPageHtml[item.id] = controversyDetailPage(item);
  res.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
  res.send(cachedControversyPageHtml[item.id]);
});

app.get('/failed-consoles', (req, res) => {
  if (!cachedFailedConsolesListHtml) cachedFailedConsolesListHtml = failedConsolesListPage();
  res.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
  res.set('Link', `<${CSS_PATH}>; rel=preload; as=style`);
  res.send(cachedFailedConsolesListHtml);
});
app.get('/failed-consoles/:id', (req, res) => {
  const item = FAILED_CONSOLES.find(c => c.id === req.params.id);
  if (!item) return res.status(404).send(notFoundPage());
  if (!cachedFailedConsolePageHtml[item.id]) cachedFailedConsolePageHtml[item.id] = failedConsoleDetailPage(item);
  res.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
  res.send(cachedFailedConsolePageHtml[item.id]);
});

app.get('/game-engines', (req, res) => {
  if (!cachedGameEnginesListHtml) cachedGameEnginesListHtml = gameEnginesListPage();
  res.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
  res.set('Link', `<${CSS_PATH}>; rel=preload; as=style`);
  res.send(cachedGameEnginesListHtml);
});
app.get('/game-engines/:id', (req, res) => {
  const item = GAME_ENGINES.find(e => e.id === req.params.id);
  if (!item) return res.status(404).send(notFoundPage());
  if (!cachedGameEnginePageHtml[item.id]) cachedGameEnginePageHtml[item.id] = gameEngineDetailPage(item);
  res.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
  res.send(cachedGameEnginePageHtml[item.id]);
});

app.get('/sound-chips', (req, res) => {
  if (!cachedSoundChipsListHtml) cachedSoundChipsListHtml = soundChipsListPage();
  res.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
  res.set('Link', `<${CSS_PATH}>; rel=preload; as=style`);
  res.send(cachedSoundChipsListHtml);
});
app.get('/sound-chips/:id', (req, res) => {
  const item = SOUND_CHIPS.find(c => c.id === req.params.id);
  if (!item) return res.status(404).send(notFoundPage());
  if (!cachedSoundChipPageHtml[item.id]) cachedSoundChipPageHtml[item.id] = soundChipDetailPage(item);
  res.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
  res.send(cachedSoundChipPageHtml[item.id]);
});

app.get('/easter-eggs', (req, res) => {
  if (!cachedEasterEggsListHtml) cachedEasterEggsListHtml = easterEggsListPage();
  res.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
  res.set('Link', `<${CSS_PATH}>; rel=preload; as=style`);
  res.send(cachedEasterEggsListHtml);
});
app.get('/easter-eggs/:id', (req, res) => {
  const item = EASTER_EGGS.find(e => e.id === req.params.id);
  if (!item) return res.status(404).send(notFoundPage());
  if (!cachedEasterEggPageHtml[item.id]) cachedEasterEggPageHtml[item.id] = easterEggDetailPage(item);
  res.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
  res.send(cachedEasterEggPageHtml[item.id]);
});

app.get('/cheat-codes', (req, res) => {
  if (!cachedCheatCodesListHtml) cachedCheatCodesListHtml = cheatCodesListPage();
  res.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
  res.set('Link', `<${CSS_PATH}>; rel=preload; as=style`);
  res.send(cachedCheatCodesListHtml);
});
app.get('/cheat-codes/:id', (req, res) => {
  const item = CHEAT_CODES.find(c => c.id === req.params.id);
  if (!item) return res.status(404).send(notFoundPage());
  if (!cachedCheatCodePageHtml[item.id]) cachedCheatCodePageHtml[item.id] = cheatCodeDetailPage(item);
  res.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
  res.send(cachedCheatCodePageHtml[item.id]);
});

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
  const base = `${req.protocol}://${req.get('host')}`;
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
  const cardHtml = buildCardHtml(cGames.slice(0, PAGE_SIZE), EAGER_IMAGES);
  const inlineData = JSON.stringify(cGames.map(({ id, title, year, decade, genre, platform, developer, image, playUrl }) =>
    ({ id, title, year, decade, genre, platform, developer, image, playUrl: playUrl || null })
  ));
  const factList = (c.keyFacts || []).map(f => `<li>${escapeHtml(f)}</li>`).join('');
  const trackList = (c.notableSoundtracks || []).map(t => `<li>${escapeHtml(t)}</li>`).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(c.name)} – Composers – Bosnan</title>
    <meta name="description" content="${escapeHtml(c.description.substring(0, 160))}">
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
  <div class="games-grid" id="gamesGrid">${cardHtml}</div>
  <div id="loadMoreSentinel" style="height:1px"></div>` : ''}
</div>
${toggleScript()}
${cGames.length > 0 ? `<script>
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
</script>` : ''}
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
  const cardHtml = buildCardHtml(fGames.slice(0, PAGE_SIZE), EAGER_IMAGES);
  const inlineData = JSON.stringify(fGames.map(({ id, title, year, decade, genre, platform, developer, image, playUrl }) =>
    ({ id, title, year, decade, genre, platform, developer, image, playUrl: playUrl || null })
  ));

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(f.name)} – Franchises – Bosnan</title>
    <meta name="description" content="${escapeHtml(f.description.substring(0, 160))}">
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
    <meta name="description" content="${escapeHtml(hw.description.substring(0, 160))}">
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
</div>
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
  const cardHtml = buildCardHtml(dGames.slice(0, PAGE_SIZE), EAGER_IMAGES);
  const inlineData = JSON.stringify(dGames.map(({ id, title, year, decade, genre, platform, developer, image, playUrl }) =>
    ({ id, title, year, decade, genre, platform, developer, image, playUrl: playUrl || null })
  ));
  const gamesList = (d.notableGames || []).map(g => `<li>${escapeHtml(g)}</li>`).join('');
  const factList = (d.keyFacts || []).map(f => `<li>${escapeHtml(f)}</li>`).join('');
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(d.name)} – Designers – Bosnan</title>
    <meta name="description" content="${escapeHtml(d.description.substring(0, 160))}">
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
  <div class="games-grid" id="gamesGrid">${cardHtml}</div>
  <div id="loadMoreSentinel" style="height:1px"></div>` : ''}
</div>
${toggleScript()}
${dGames.length > 0 ? `<script>
const allGames=${inlineData};const PAGE=${PAGE_SIZE};let rendered=Math.min(PAGE,allGames.length);
const grid=document.getElementById('gamesGrid');const sentinel=document.getElementById('loadMoreSentinel');
function esc(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function cardHtml(g){return'<a href="/games/'+g.id+'" class="game-card"><div class="game-card-img-wrap"><img src="/'+esc(g.image)+'" alt="'+esc(g.title)+'" loading="lazy" onerror="this.parentElement.innerHTML=\'<div class=\\\'game-card-placeholder\\\'>'+esc(g.title[0])+'</div>\'"><div class="game-card-decade">'+esc(g.decade)+'</div>'+(g.playUrl?'<div class="game-card-playable">&#9654; Play</div>':'')+'</div><div class="game-card-body"><h3 class="game-card-title">'+esc(g.title)+'</h3><div class="game-card-meta"><span>'+esc(String(g.year))+'</span><span class="dot">·</span><span>'+esc(g.genre)+'</span></div><p class="game-card-platform">'+esc(g.platform)+'</p></div></a>';}
function loadMore(){if(rendered>=allGames.length)return;const next=allGames.slice(rendered,rendered+PAGE);grid.insertAdjacentHTML('beforeend',next.map(cardHtml).join(''));rendered+=next.length;}
new IntersectionObserver(e=>{if(e[0].isIntersecting)loadMore();},{rootMargin:'200px'}).observe(sentinel);
</script>` : ''}
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
  const cardHtml = buildCardHtml(yGames.slice(0, PAGE_SIZE), EAGER_IMAGES);
  const inlineData = JSON.stringify(yGames.map(({ id, title, year: y, decade, genre, platform, developer, image, playUrl }) =>
    ({ id, title, year: y, decade, genre, platform, developer, image, playUrl: playUrl || null })
  ));
  const reviewHtml = review ? `
  <div style="border-bottom:1px solid #333;padding-bottom:2rem;margin-bottom:2rem">
    <h2 style="color:var(--accent,#c8a44a);font-size:1.4em;margin-bottom:0.5rem">${escapeHtml(review.headline)}</h2>
    <p style="color:#ccc;line-height:1.7;margin-bottom:1.2rem">${escapeHtml(review.summary)}</p>
    ${(review.topEvents || []).length ? `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:0.8rem;margin-bottom:1.5rem">${review.topEvents.map(e => `<div style="background:rgba(255,255,255,0.04);border-radius:6px;padding:0.8rem 1rem"><div style="font-weight:700;margin-bottom:0.3rem;font-size:0.9em">${escapeHtml(e.title)}</div><div style="color:#bbb;font-size:0.85em;line-height:1.5">${escapeHtml(e.desc)}</div></div>`).join('')}</div>` : ''}
    ${(review.sections || []).map(s => `<div style="margin-bottom:1.5rem"><h3 style="margin-bottom:0.6rem">${escapeHtml(s.title)}</h3><div style="color:#ccc;line-height:1.7">${s.html}</div></div>`).join('')}
    ${review.quote ? `<blockquote style="border-left:3px solid var(--accent,#c8a44a);padding-left:1rem;margin:1rem 0;color:#aaa;font-style:italic">${escapeHtml(review.quote)}</blockquote>` : ''}
  </div>` : '';
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${year} in Gaming – Bosnan</title>
    <meta name="description" content="${review ? escapeHtml(review.summary.substring(0, 160)) : `${yGames.length} games from ${year} in the Bosnan retro archive.`}">
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
  <div id="loadMoreSentinel" style="height:1px"></div>
</div>
${toggleScript()}
<script>
const allGames=${inlineData};const PAGE=${PAGE_SIZE};let rendered=Math.min(PAGE,allGames.length);
const grid=document.getElementById('gamesGrid');const sentinel=document.getElementById('loadMoreSentinel');
function esc(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function cardHtml(g){return'<a href="/games/'+g.id+'" class="game-card"><div class="game-card-img-wrap"><img src="/'+esc(g.image)+'" alt="'+esc(g.title)+'" loading="lazy" onerror="this.parentElement.innerHTML=\'<div class=\\\'game-card-placeholder\\\'>'+esc(g.title[0])+'</div>\'"><div class="game-card-decade">'+esc(g.decade)+'</div>'+(g.playUrl?'<div class="game-card-playable">&#9654; Play</div>':'')+'</div><div class="game-card-body"><h3 class="game-card-title">'+esc(g.title)+'</h3><div class="game-card-meta"><span>'+esc(String(g.year))+'</span><span class="dot">·</span><span>'+esc(g.genre)+'</span></div><p class="game-card-platform">'+esc(g.platform)+'</p></div></a>';}
function loadMore(){if(rendered>=allGames.length)return;const next=allGames.slice(rendered,rendered+PAGE);grid.insertAdjacentHTML('beforeend',next.map(cardHtml).join(''));rendered+=next.length;}
new IntersectionObserver(e=>{if(e[0].isIntersecting)loadMore();},{rootMargin:'200px'}).observe(sentinel);
</script>
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
  const cardHtml = buildCardHtml(pGames.slice(0, PAGE_SIZE), EAGER_IMAGES);
  const inlineData = JSON.stringify(pGames.map(({ id, title, year, decade, genre, platform, developer, image, playUrl }) =>
    ({ id, title, year, decade, genre, platform, developer, image, playUrl: playUrl || null })
  ));
  const titleList = (pub.notableTitles || []).map(t => `<li>${escapeHtml(t)}</li>`).join('');
  const factList = (pub.keyFacts || []).map(f => `<li>${escapeHtml(f)}</li>`).join('');
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(pub.name)} – Publishers – Bosnan</title>
    <meta name="description" content="${escapeHtml(pub.description.substring(0, 160))}">
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
  <div class="games-grid" id="gamesGrid">${cardHtml}</div>
  <div id="loadMoreSentinel" style="height:1px"></div>` : ''}
</div>
${toggleScript()}
${pGames.length > 0 ? `<script>
const allGames=${inlineData};const PAGE=${PAGE_SIZE};let rendered=Math.min(PAGE,allGames.length);
const grid=document.getElementById('gamesGrid');const sentinel=document.getElementById('loadMoreSentinel');
function esc(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function cardHtml(g){return'<a href="/games/'+g.id+'" class="game-card"><div class="game-card-img-wrap"><img src="/'+esc(g.image)+'" alt="'+esc(g.title)+'" loading="lazy" onerror="this.parentElement.innerHTML=\'<div class=\\\'game-card-placeholder\\\'>'+esc(g.title[0])+'</div>\'"><div class="game-card-decade">'+esc(g.decade)+'</div>'+(g.playUrl?'<div class="game-card-playable">&#9654; Play</div>':'')+'</div><div class="game-card-body"><h3 class="game-card-title">'+esc(g.title)+'</h3><div class="game-card-meta"><span>'+esc(String(g.year))+'</span><span class="dot">·</span><span>'+esc(g.genre)+'</span></div><p class="game-card-platform">'+esc(g.platform)+'</p></div></a>';}
function loadMore(){if(rendered>=allGames.length)return;const next=allGames.slice(rendered,rendered+PAGE);grid.insertAdjacentHTML('beforeend',next.map(cardHtml).join(''));rendered+=next.length;}
new IntersectionObserver(e=>{if(e[0].isIntersecting)loadMore();},{rootMargin:'200px'}).observe(sentinel);
</script>` : ''}
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
  const gamesList = (board.notableGames || []).map(g => `<li>${escapeHtml(g)}</li>`).join('');
  const factList = (board.keyFacts || []).map(f => `<li>${escapeHtml(f)}</li>`).join('');
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(board.name)} – Arcade Boards – Bosnan</title>
    <meta name="description" content="${escapeHtml(board.description.substring(0, 160))}">
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
    <meta name="description" content="${escapeHtml(periph.description.substring(0, 160))}">
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
</div>
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
    <meta name="description" content="${escapeHtml(g.description.substring(0, 160))}">
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
</div>
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
  const cardHtml = buildCardHtml(dGames.slice(0, PAGE_SIZE), EAGER_IMAGES);
  const inlineData = JSON.stringify(dGames.map(({ id, title, year, decade: dec, genre, platform, developer, image, playUrl }) =>
    ({ id, title, year, decade: dec, genre, platform, developer, image, playUrl: playUrl || null })
  ));
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(decade)} Games – Bosnan</title>
    <meta name="description" content="${dGames.length} games from the ${escapeHtml(decade)} in the Bosnan archive.">
    ${cssHead()}
</head>
<body>
${bgLogo()}
${nav('decades')}
<section class="platforms-hero">
    <h1>${escapeHtml(decade)}</h1>
    <p>${dGames.length} game${dGames.length !== 1 ? 's' : ''} in the archive from this decade</p>
</section>
<div class="games-grid" id="gamesGrid">${cardHtml}</div>
<div id="loadMoreSentinel" style="height:1px"></div>
${toggleScript()}
<script>
const allGames=${inlineData};const PAGE=${PAGE_SIZE};let rendered=Math.min(PAGE,allGames.length);
const grid=document.getElementById('gamesGrid');const sentinel=document.getElementById('loadMoreSentinel');
function esc(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function cardHtml(g){return'<a href="/games/'+g.id+'" class="game-card"><div class="game-card-img-wrap"><img src="/'+esc(g.image)+'" alt="'+esc(g.title)+'" loading="lazy" onerror="this.parentElement.innerHTML=\'<div class=\\\'game-card-placeholder\\\'>'+esc(g.title[0])+'</div>\'"><div class="game-card-decade">'+esc(g.decade)+'</div>'+(g.playUrl?'<div class="game-card-playable">&#9654; Play</div>':'')+'</div><div class="game-card-body"><h3 class="game-card-title">'+esc(g.title)+'</h3><div class="game-card-meta"><span>'+esc(String(g.year))+'</span><span class="dot">·</span><span>'+esc(g.genre)+'</span></div><p class="game-card-platform">'+esc(g.platform)+'</p></div></a>';}
function loadMore(){if(rendered>=allGames.length)return;const next=allGames.slice(rendered,rendered+PAGE);grid.insertAdjacentHTML('beforeend',next.map(cardHtml).join(''));rendered+=next.length;}
new IntersectionObserver(e=>{if(e[0].isIntersecting)loadMore();},{rootMargin:'200px'}).observe(sentinel);
</script>
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
      <p style="color:var(--text-muted,#aaa);margin-bottom:1.2rem">${escapeHtml(l.desc)}</p>
      <div style="display:flex;flex-direction:column;gap:0.6rem">
        ${l.entries.map(e => `
        <div style="display:grid;grid-template-columns:1fr auto 1fr;gap:0.8rem;align-items:center;background:rgba(255,255,255,0.04);border-radius:6px;padding:0.8rem 1rem">
          <div style="font-weight:600;color:var(--accent,#c8a44a)">${escapeHtml(e.from)}</div>
          <div style="font-size:1.4em;color:var(--text-muted,#888)">${escapeHtml(e.arrow)}</div>
          <div style="font-weight:600">${escapeHtml(e.to)}</div>
          ${e.note ? `<div style="grid-column:1/-1;font-size:0.85em;color:var(--text-muted,#999);padding-top:0.3rem">${escapeHtml(e.note)}</div>` : ''}
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
      <select name="a" style="background:#1a1a1a;color:#fff;border:1px solid #444;padding:0.5rem 0.8rem;border-radius:4px;font-size:1rem">
        <option value="">Select platform A…</option>${opts}
      </select>
      <span style="color:#888;font-size:1.2em">vs</span>
      <select name="b" style="background:#1a1a1a;color:#fff;border:1px solid #444;padding:0.5rem 0.8rem;border-radius:4px;font-size:1rem">
        <option value="">Select platform B…</option>${opts2}
      </select>
      <button type="submit" style="background:var(--accent,#c8a44a);color:#000;border:none;padding:0.5rem 1.2rem;border-radius:4px;font-size:1rem;cursor:pointer;font-weight:700">Compare</button>
    </form>
  </div>`;

  let tableHtml = '';
  if (a && b) {
    const fields = [
      ['Era', 'era'],
      ['Manufacturer', 'manufacturer'],
      ['Description', 'description'],
    ];
    const aCount = games.filter(g => g.platform.toLowerCase().includes((a.keyword || a.name).toLowerCase())).length;
    const bCount = games.filter(g => g.platform.toLowerCase().includes((b.keyword || b.name).toLowerCase())).length;
    tableHtml = `<div style="display:grid;grid-template-columns:200px 1fr 1fr;gap:0;border:1px solid #333;border-radius:8px;overflow:hidden">
      <div style="background:#111;padding:0.8rem 1rem;font-weight:700;border-bottom:1px solid #333"></div>
      <div style="background:#111;padding:0.8rem 1rem;font-weight:700;color:var(--accent,#c8a44a);border-bottom:1px solid #333;border-left:1px solid #333">${escapeHtml(a.name)}</div>
      <div style="background:#111;padding:0.8rem 1rem;font-weight:700;color:var(--accent,#c8a44a);border-bottom:1px solid #333;border-left:1px solid #333">${escapeHtml(b.name)}</div>
      ${fields.map(([label, key]) => `
      <div style="padding:0.8rem 1rem;border-bottom:1px solid #222;font-weight:600;font-size:0.9em;color:#999">${escapeHtml(label)}</div>
      <div style="padding:0.8rem 1rem;border-bottom:1px solid #222;border-left:1px solid #222;font-size:0.9em">${escapeHtml((a[key] || '').substring(0, 200))}</div>
      <div style="padding:0.8rem 1rem;border-bottom:1px solid #222;border-left:1px solid #222;font-size:0.9em">${escapeHtml((b[key] || '').substring(0, 200))}</div>`).join('')}
      <div style="padding:0.8rem 1rem;font-weight:600;font-size:0.9em;color:#999">Games in Archive</div>
      <div style="padding:0.8rem 1rem;border-left:1px solid #222;font-size:0.9em;font-weight:700">${aCount}</div>
      <div style="padding:0.8rem 1rem;border-left:1px solid #222;font-size:0.9em;font-weight:700">${bCount}</div>
    </div>
    ${a.longDescription ? `<div style="margin-top:2rem"><h3 style="margin-bottom:0.5rem">${escapeHtml(a.name)}</h3><p style="color:#bbb;line-height:1.7">${escapeHtml(a.longDescription.substring(0, 600))}…</p></div>` : ''}
    ${b.longDescription ? `<div style="margin-top:1.5rem"><h3 style="margin-bottom:0.5rem">${escapeHtml(b.name)}</h3><p style="color:#bbb;line-height:1.7">${escapeHtml(b.longDescription.substring(0, 600))}…</p></div>` : ''}`;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Compare Platforms – Bosnan</title>
    <meta name="description" content="Compare any two retro gaming platforms side by side — specs, era, and games in the archive.">
    ${cssHead()}
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

function searchPage(q) {
  const ql = q.toLowerCase();
  let resultsHtml = '';

  if (q.length >= 2) {
    const matchedGames = games.filter(g =>
      g.title.toLowerCase().includes(ql) ||
      g.developer.toLowerCase().includes(ql) ||
      (g.description || '').toLowerCase().includes(ql)
    ).slice(0, 24);

    const matchedEssays = ESSAYS.filter(e =>
      e.title.toLowerCase().includes(ql) ||
      (e.summary || '').toLowerCase().includes(ql)
    ).slice(0, 6);

    const matchedPlatforms = PLATFORMS.filter(p =>
      p.name.toLowerCase().includes(ql) ||
      (p.description || '').toLowerCase().includes(ql)
    ).slice(0, 4);

    const matchedDevs = DEVELOPERS.filter(d =>
      d.name.toLowerCase().includes(ql) ||
      (d.description || '').toLowerCase().includes(ql)
    ).slice(0, 4);

    const matchedDesigners = DESIGNERS.filter(d =>
      d.name.toLowerCase().includes(ql) ||
      (d.description || '').toLowerCase().includes(ql)
    ).slice(0, 4);

    const matchedComposers = COMPOSERS.filter(c =>
      c.name.toLowerCase().includes(ql) ||
      (c.description || '').toLowerCase().includes(ql)
    ).slice(0, 4);

    const matchedPublishers = PUBLISHERS.filter(p =>
      p.name.toLowerCase().includes(ql) ||
      (p.description || '').toLowerCase().includes(ql)
    ).slice(0, 4);

    const total = matchedGames.length + matchedEssays.length + matchedPlatforms.length +
      matchedDevs.length + matchedDesigners.length + matchedComposers.length + matchedPublishers.length;

    if (total === 0) {
      resultsHtml = `<p style="color:#888;margin-top:2rem">No results found for "<strong>${escapeHtml(q)}</strong>".</p>`;
    } else {
      resultsHtml = `<p style="color:#888;margin-bottom:1.5rem">${total} result${total !== 1 ? 's' : ''} for "<strong>${escapeHtml(q)}</strong>"</p>`;

      if (matchedGames.length) {
        resultsHtml += `<h2 style="margin-bottom:1rem">Games (${matchedGames.length})</h2>
        <div class="games-grid">${buildCardHtml(matchedGames, 4)}</div>`;
      }

      const mkLinks = (items, href, label) => items.length ? `<h2 style="margin-top:2rem;margin-bottom:0.8rem">${label} (${items.length})</h2>
        <div class="platforms-grid">${items.map(x => `<a href="${href(x)}" class="platform-card">
          <div class="platform-card-name">${escapeHtml(x.name || x.title)}</div>
          <p class="platform-card-desc">${escapeHtml((x.description || x.summary || '').substring(0, 120))}</p>
        </a>`).join('')}</div>` : '';

      resultsHtml += mkLinks(matchedPlatforms, p => `/platforms/${p.id}`, 'Platforms');
      resultsHtml += mkLinks(matchedDevs, d => `/developers/${d.id}`, 'Developers');
      resultsHtml += mkLinks(matchedDesigners, d => `/designers/${d.id}`, 'Designers');
      resultsHtml += mkLinks(matchedComposers, c => `/composers/${c.id}`, 'Composers');
      resultsHtml += mkLinks(matchedPublishers, p => `/publishers/${p.id}`, 'Publishers');
      resultsHtml += mkLinks(matchedEssays, e => `/essays/${e.id}`, 'Essays');
    }
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${q ? escapeHtml(q) + ' – ' : ''}Search – Bosnan</title>
    <meta name="description" content="Search the Bosnan retro games archive.">
    ${cssHead()}
</head>
<body>
${bgLogo()}
${nav('search')}
<div class="essay-wrapper">
  <div class="essay-header">
    <h1 class="essay-title">Search</h1>
  </div>
  <form method="GET" action="/search" style="display:flex;gap:0.8rem;margin-bottom:2rem;max-width:600px">
    <input type="text" name="q" value="${escapeHtml(q)}" placeholder="Search games, essays, people, platforms…"
      autofocus style="flex:1;background:#1a1a1a;color:#fff;border:1px solid #444;padding:0.6rem 1rem;border-radius:4px;font-size:1rem">
    <button type="submit" style="background:var(--accent,#c8a44a);color:#000;border:none;padding:0.6rem 1.2rem;border-radius:4px;font-size:1rem;cursor:pointer;font-weight:700">Search</button>
  </form>
  ${resultsHtml}
</div>
${toggleScript()}
</body>
</html>`;
}

function bookmarkBtn(id, title, type) {
  return `<button id="bm-${escapeHtml(id)}" onclick="toggleBM('${escapeHtml(id)}','${escapeHtml(title.replace(/'/g,"\\\'"))}','${escapeHtml(type)}')" style="background:rgba(255,255,255,0.06);border:1px solid #444;color:#fff;padding:0.4rem 0.9rem;border-radius:5px;cursor:pointer;font-size:0.85em;margin-top:0.8rem">&#9734; Save</button>
<script>
(function(){
  const k='bosnan_bm';
  function bms(){try{return JSON.parse(localStorage.getItem(k)||'[]');}catch(e){return[];}}
  const id='${escapeHtml(id)}';
  const btn=document.getElementById('bm-'+id);
  function upd(){const has=bms().some(b=>b.id===id);btn.innerHTML=has?'&#9733; Saved':'&#9734; Save';btn.style.color=has?'var(--accent,#c8a44a)':'#fff';}
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
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escapeHtml(item.title)} – Sequels – Bosnan</title><meta name="description" content="${escapeHtml(item.description.substring(0,160))}"><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${bgLogo()}${nav('sequels')}<div class="essay-wrapper"><a href="/sequels" class="back-link">&#8592; All Sequels</a><div class="essay-header"><div class="essay-meta">${escapeHtml(item.series)} &middot; ${escapeHtml(item.platform)} &middot; ${item.year}</div><h1 class="essay-title">${escapeHtml(item.title)}</h1><p class="essay-subtitle">${escapeHtml(item.description)}</p>${item.original ? `<p style="color:#888;font-size:0.9em">Follows: <em>${escapeHtml(item.original)}</em></p>` : ''}</div>${changed ? `<div class="essay-section"><h2>What Changed</h2><ul class="trivia-list">${changed}</ul></div>` : ''}${sections}${facts ? `<div class="essay-section"><h2>Key Facts</h2><ul class="trivia-list">${facts}</ul></div>` : ''}</div>${toggleScript()}</body></html>`;
}

function romHacksListPage() {
  const typeColors = { 'Difficulty Hack': '#f44336', 'Translation': '#2196f3', 'Total Conversion': '#9c27b0', 'Restoration': '#4caf50', 'Randomiser': '#ff9800', 'Bug Fix': '#607d8b' };
  const cards = ROM_HACKS.map(r => `<a href="/rom-hacks/${r.id}" class="platform-card">
    <div class="platform-card-name">${escapeHtml(r.title)}</div>
    <div class="platform-card-era">${escapeHtml(r.baseGame)} &middot; ${r.year}</div>
    <div class="platform-card-count" style="color:${typeColors[r.type]||'#888'}">${escapeHtml(r.type)}</div>
    <p class="platform-card-desc">${escapeHtml(r.description)}</p>
  </a>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>ROM Hacks &amp; Mods – Bosnan</title><meta name="description" content="Famous ROM hacks and fan modifications: Kaizo Mario, Doom WADs, Zelda randomiser, Mother fan translation and more."><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${bgLogo()}${nav('rom-hacks')}<section class="platforms-hero"><h1>ROM Hacks &amp; Mods</h1><p>Fan modifications, translations, and total conversions</p></section><div class="platforms-grid">${cards}</div>${toggleScript()}</body></html>`;
}

function romHackDetailPage(item) {
  const facts = (item.keyFacts || []).map(f => `<li>${escapeHtml(f)}</li>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escapeHtml(item.title)} – ROM Hacks – Bosnan</title><meta name="description" content="${escapeHtml(item.description.substring(0,160))}"><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${bgLogo()}${nav('rom-hacks')}<div class="platform-detail-wrapper"><a href="/rom-hacks" class="back-link">&#8592; All ROM Hacks</a><div class="platform-detail-header"><h1>${escapeHtml(item.title)}</h1><p class="platform-detail-era">Base: ${escapeHtml(item.baseGame)} &middot; ${escapeHtml(item.platform)} &middot; ${item.year} &middot; ${escapeHtml(item.type)}</p>${item.creator ? `<p class="platform-detail-era" style="font-size:0.9em;opacity:0.7">Creator: ${escapeHtml(item.creator)}</p>` : ''}<p class="platform-detail-desc">${escapeHtml(item.description)}</p><p class="platform-detail-desc">${escapeHtml(item.longDescription)}</p>${item.notableFor ? `<div class="dev-notable"><strong>Legacy:</strong> ${escapeHtml(item.notableFor)}</div>` : ''}${facts ? `<div class="dev-notable"><strong>Key Facts:</strong><ul class="trivia-list">${facts}</ul></div>` : ''}</div></div>${toggleScript()}</body></html>`;
}

function adCampaignsListPage() {
  const cards = AD_CAMPAIGNS.map(a => `<a href="/ad-campaigns/${a.id}" class="platform-card">
    <div class="platform-card-name">${escapeHtml(a.title)}</div>
    <div class="platform-card-era">${escapeHtml(a.company)} &middot; ${a.year}</div>
    <div class="platform-card-count" style="font-style:italic;color:var(--accent,#c8a44a)">${escapeHtml(a.tagline || '')}</div>
    <p class="platform-card-desc">${escapeHtml(a.description)}</p>
  </a>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Advertising Campaigns – Bosnan</title><meta name="description" content="Iconic game advertising: Genesis Does What Nintendon't, PlayStation Double Life, Now You're Playing With Power and more."><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${bgLogo()}${nav('ad-campaigns')}<section class="platforms-hero"><h1>Advertising Campaigns</h1><p>The marketing that shaped the console wars</p></section><div class="platforms-grid">${cards}</div>${toggleScript()}</body></html>`;
}

function adCampaignDetailPage(item) {
  const facts = (item.keyFacts || []).map(f => `<li>${escapeHtml(f)}</li>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escapeHtml(item.title)} – Ad Campaigns – Bosnan</title><meta name="description" content="${escapeHtml(item.description.substring(0,160))}"><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${bgLogo()}${nav('ad-campaigns')}<div class="platform-detail-wrapper"><a href="/ad-campaigns" class="back-link">&#8592; All Campaigns</a><div class="platform-detail-header"><h1>${escapeHtml(item.title)}</h1><p class="platform-detail-era">${escapeHtml(item.company)} &middot; ${item.year} &middot; ${escapeHtml(item.product || '')}</p>${item.tagline ? `<blockquote style="border-left:3px solid var(--accent,#c8a44a);padding-left:1rem;margin:1rem 0;font-style:italic;font-size:1.2em;color:var(--accent,#c8a44a)">"${escapeHtml(item.tagline)}"</blockquote>` : ''}<p class="platform-detail-desc">${escapeHtml(item.description)}</p><p class="platform-detail-desc">${escapeHtml(item.longDescription)}</p>${item.impact ? `<div class="dev-notable"><strong>Impact:</strong> ${escapeHtml(item.impact)}</div>` : ''}${facts ? `<div class="dev-notable"><strong>Key Facts:</strong><ul class="trivia-list">${facts}</ul></div>` : ''}</div></div>${toggleScript()}</body></html>`;
}

function salesFiguresPage() {
  const cards = SALES_FIGURES.map(s => `<a href="/sales-figures/${s.id}" class="platform-card">
    <div class="platform-card-name">${escapeHtml(s.title)}</div>
    <div class="platform-card-era">${escapeHtml(s.type)} &middot; ${escapeHtml(s.period)}</div>
    <div class="platform-card-count" style="font-size:1.2em;font-weight:900;color:var(--accent,#c8a44a)">${escapeHtml(s.units)}</div>
    <p class="platform-card-desc">${escapeHtml(s.description)}</p>
  </a>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Sales Figures – Bosnan</title><meta name="description" content="Retro gaming by the numbers: NES, Game Boy, PlayStation, Tetris, Super Mario Bros. and the sales that defined the industry."><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${bgLogo()}${nav('sales-figures')}<section class="platforms-hero"><h1>Sales Figures</h1><p>Gaming history measured in units and dollars</p></section><div class="platforms-grid">${cards}</div>${toggleScript()}</body></html>`;
}

function salesFigureDetailPage(item) {
  const context = (item.context || []).map(c => `<li>${escapeHtml(c)}</li>`).join('');
  const facts = (item.keyFacts || []).map(f => `<li>${escapeHtml(f)}</li>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escapeHtml(item.title)} – Sales Figures – Bosnan</title><meta name="description" content="${escapeHtml(item.description.substring(0,160))}"><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${bgLogo()}${nav('sales-figures')}<div class="platform-detail-wrapper"><a href="/sales-figures" class="back-link">&#8592; All Sales Figures</a><div class="platform-detail-header"><h1>${escapeHtml(item.title)}</h1><p class="platform-detail-era">${escapeHtml(item.type)} &middot; ${escapeHtml(item.period)}</p><div style="font-size:3em;font-weight:900;color:var(--accent,#c8a44a);margin:0.5rem 0">${escapeHtml(item.units)}</div><p class="platform-detail-desc">${escapeHtml(item.description)}</p><p class="platform-detail-desc">${escapeHtml(item.longDescription)}</p>${context ? `<div class="dev-notable"><strong>In Context:</strong><ul class="trivia-list">${context}</ul></div>` : ''}${facts ? `<div class="dev-notable"><strong>Key Facts:</strong><ul class="trivia-list">${facts}</ul></div>` : ''}</div></div>${toggleScript()}</body></html>`;
}

function speedrunsListPage() {
  const cards = SPEEDRUNS.map(s => `<a href="/speedruns/${s.id}" class="platform-card">
    <div class="platform-card-name">${escapeHtml(s.game)}</div>
    <div class="platform-card-era">${escapeHtml(s.platform)} &middot; ${escapeHtml(s.category)}</div>
    <div class="platform-card-count" style="font-family:monospace;color:var(--accent,#c8a44a)">${escapeHtml(s.currentWR)}</div>
    <p class="platform-card-desc">${escapeHtml(s.description)}</p>
  </a>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Speedruns – Bosnan</title><meta name="description" content="Iconic speedrun histories: Super Mario Bros. sub-5, Ocarina of Time wrong warp, GoldenEye bond tricks and more."><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${bgLogo()}${nav('speedruns')}<section class="platforms-hero"><h1>Speedruns</h1><p>The races to the bottom of the clock</p></section><div class="platforms-grid">${cards}</div>${toggleScript()}</body></html>`;
}

function speedrunDetailPage(item) {
  const techniques = (item.famousTechniques || []).map(t => `<li>${escapeHtml(t)}</li>`).join('');
  const runners = (item.notableRunners || []).map(r => `<li>${escapeHtml(r)}</li>`).join('');
  const facts = (item.keyFacts || []).map(f => `<li>${escapeHtml(f)}</li>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escapeHtml(item.game)} Speedrun – Bosnan</title><meta name="description" content="${escapeHtml(item.description.substring(0,160))}"><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${bgLogo()}${nav('speedruns')}<div class="platform-detail-wrapper"><a href="/speedruns" class="back-link">&#8592; All Speedruns</a><div class="platform-detail-header"><h1>${escapeHtml(item.game)}</h1><p class="platform-detail-era">${escapeHtml(item.platform)} &middot; ${escapeHtml(item.category)} &middot; ${item.year}</p><div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin:1rem 0">${item.currentWR ? `<div style="background:rgba(255,255,255,0.05);border-radius:6px;padding:1rem;text-align:center"><div style="font-size:0.8em;color:#888;margin-bottom:0.3rem">Current WR</div><div style="font-size:1.6em;font-weight:900;font-family:monospace;color:var(--accent,#c8a44a)">${escapeHtml(item.currentWR)}</div></div>` : ''}${item.firstKnownRun ? `<div style="background:rgba(255,255,255,0.05);border-radius:6px;padding:1rem;text-align:center"><div style="font-size:0.8em;color:#888;margin-bottom:0.3rem">First Known Run</div><div style="font-size:1.6em;font-weight:900;font-family:monospace;color:#888">${escapeHtml(item.firstKnownRun)}</div></div>` : ''}</div><p class="platform-detail-desc">${escapeHtml(item.description)}</p><p class="platform-detail-desc">${escapeHtml(item.longDescription)}</p>${techniques ? `<div class="dev-notable"><strong>Famous Techniques:</strong><ul class="trivia-list">${techniques}</ul></div>` : ''}${runners ? `<div class="dev-notable"><strong>Notable Runners:</strong><ul class="trivia-list">${runners}</ul></div>` : ''}${facts ? `<div class="dev-notable"><strong>Key Facts:</strong><ul class="trivia-list">${facts}</ul></div>` : ''}</div></div>${toggleScript()}</body></html>`;
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
  const work = (item.notableWork || []).map(w => `<li>${escapeHtml(w)}</li>`).join('');
  const facts = (item.keyFacts || []).map(f => `<li>${escapeHtml(f)}</li>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escapeHtml(item.name)} – Critics – Bosnan</title><meta name="description" content="${escapeHtml(item.description.substring(0,160))}"><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${bgLogo()}${nav('critics')}<div class="platform-detail-wrapper"><a href="/critics" class="back-link">&#8592; All Critics</a><div class="platform-detail-header"><h1>${escapeHtml(item.name)}</h1><p class="platform-detail-era">${escapeHtml(item.role)} &middot; ${escapeHtml(item.outlet)} &middot; ${escapeHtml(item.era)}${item.nationality ? ' &middot; ' + escapeHtml(item.nationality) : ''}</p><p class="platform-detail-desc">${escapeHtml(item.description)}</p><p class="platform-detail-desc">${escapeHtml(item.longDescription)}</p>${work ? `<div class="dev-notable"><strong>Notable Work:</strong><ul class="trivia-list">${work}</ul></div>` : ''}${facts ? `<div class="dev-notable"><strong>Key Facts:</strong><ul class="trivia-list">${facts}</ul></div>` : ''}</div></div>${toggleScript()}</body></html>`;
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
  const cells = grid.map((row, r) => row.map((ch, c) => `<td id="c${r}_${c}" onclick="sel(${r},${c})" style="width:2rem;height:2rem;text-align:center;cursor:pointer;user-select:none;border:1px solid #333;font-family:monospace;font-size:1em">${ch}</td>`).join('')).map(row => `<tr>${row}</tr>`).join('');
  const wordItems = placed.map(w => `<li id="w-${w}" style="font-family:monospace;padding:0.3rem 0">${w}</li>`).join('');
  const gridData = JSON.stringify(grid);
  const wordsData = JSON.stringify(placed);
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Word Search – Bosnan</title><meta name="description" content="Find retro game titles hidden in this word search puzzle."><style>h1,h2{font-family:inherit}td.found{background:rgba(200,164,74,0.3);color:var(--accent,#c8a44a)}td.sel{background:rgba(200,164,74,0.15)}</style>${cssHead()}</head><body>${bgLogo()}${nav('wordsearch')}<div class="essay-wrapper"><div class="essay-header"><h1 class="essay-title">Word Search</h1><p class="essay-subtitle">Find ${placed.length} retro game titles — refreshes with new words each server restart</p></div><div style="display:grid;grid-template-columns:auto 200px;gap:2rem;align-items:start;flex-wrap:wrap"><div style="overflow-x:auto"><table style="border-collapse:collapse">${cells}</table></div><div><h3 style="margin-bottom:0.8rem">Find these words:</h3><ul style="list-style:none;padding:0;margin:0">${wordItems}</ul><p id="winMsg" style="display:none;color:var(--accent,#c8a44a);font-weight:700;margin-top:1rem">You found them all!</p></div></div></div>
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
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Bookmarks – Bosnan</title><meta name="description" content="Your saved games, essays, and articles."><style>h1,h2{font-family:inherit}.bm-card{display:block;background:rgba(255,255,255,0.04);border-radius:8px;padding:1rem 1.2rem;margin-bottom:0.8rem;text-decoration:none;color:inherit;border:1px solid #333}.bm-card:hover{border-color:var(--accent,#c8a44a)}.bm-type{font-size:0.75em;color:#888;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:0.3rem}.bm-title{font-weight:700}.bm-remove{float:right;background:none;border:none;color:#666;cursor:pointer;font-size:1.2em;padding:0}</style>${cssHead()}</head><body>${bgLogo()}${nav('bookmarks')}<div class="essay-wrapper"><div class="essay-header"><h1 class="essay-title">Bookmarks</h1><p class="essay-subtitle">Your saved items</p></div><div id="bmList"><p style="color:#888">No bookmarks yet — click the Save button on any game or article page.</p></div></div>
<script>
const k='bosnan_bm';
function bms(){try{return JSON.parse(localStorage.getItem(k)||'[]');}catch(e){return[];}}
function remove(id){const list=bms().filter(b=>b.id!==id);localStorage.setItem(k,JSON.stringify(list));render();}
function render(){
  const list=bms();const el=document.getElementById('bmList');
  if(!list.length){el.innerHTML='<p style="color:#888">No bookmarks yet — click the Save button on any game or article page.</p>';return;}
  el.innerHTML=list.map(b=>'<div class="bm-card"><div style="display:flex;justify-content:space-between;align-items:start"><div><div class="bm-type">'+b.type+'</div><a href="/'+b.type.toLowerCase().replace(/ /g,'-')+'s/'+b.id+'" class="bm-title">'+b.title+'</a></div><button class="bm-remove" onclick="remove(\''+b.id+'\')">&#10005;</button></div></div>').join('');
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
  const gamesHtml = (item.games || []).map(g => `<span style="background:rgba(255,255,255,0.08);border-radius:3px;padding:0.2rem 0.5rem;font-size:0.85em">${escapeHtml(g)}</span>`).join(' ');
  const facts = (item.keyFacts || []).map(f => `<li>${escapeHtml(f)}</li>`).join('');
  const sectionsHtml = (item.sections || []).map(s => `<div class="essay-section"><h2>${escapeHtml(s.title)}</h2>${s.html}</div>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escapeHtml(item.title)} – Controversies – Bosnan</title><meta name="description" content="${escapeHtml(item.description.substring(0, 160))}"><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${bgLogo()}${nav('controversies')}<div class="essay-wrapper"><a href="/controversies" class="back-link">&#8592; All Controversies</a><div class="essay-header"><div class="essay-meta">${item.year} &middot; ${escapeHtml(item.era)}</div><h1 class="essay-title">${escapeHtml(item.title)}</h1><p class="essay-subtitle">${escapeHtml(item.description)}</p>${gamesHtml ? `<div style="margin-top:0.8rem;display:flex;gap:0.4rem;flex-wrap:wrap">${gamesHtml}</div>` : ''}</div>${sectionsHtml}${item.outcome ? `<div class="essay-section"><h2>Outcome</h2><p>${escapeHtml(item.outcome)}</p></div>` : ''}${facts ? `<div class="essay-section"><h2>Key Facts</h2><ul class="trivia-list">${facts}</ul></div>` : ''}</div>${toggleScript()}</body></html>`;
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
  const goodGames = (item.goodGames || []).map(g => `<li>${escapeHtml(g)}</li>`).join('');
  const facts = (item.keyFacts || []).map(f => `<li>${escapeHtml(f)}</li>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escapeHtml(item.name)} – Failed Consoles – Bosnan</title><meta name="description" content="${escapeHtml(item.description.substring(0, 160))}"><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${bgLogo()}${nav('failed-consoles')}<div class="platform-detail-wrapper"><a href="/failed-consoles" class="back-link">&#8592; All Failed Consoles</a><div class="platform-detail-header"><h1>${escapeHtml(item.name)}</h1><p class="platform-detail-era">${escapeHtml(item.manufacturer)} &middot; ${item.year}–${item.discontinued || '?'} &middot; ${escapeHtml(item.unitsSold || 'Unknown units sold')}</p><p class="platform-detail-desc">${escapeHtml(item.description)}</p><p class="platform-detail-desc">${escapeHtml(item.longDescription)}</p>${goodGames ? `<div class="dev-notable"><strong>Worth Playing:</strong><ul class="trivia-list">${goodGames}</ul></div>` : ''}${facts ? `<div class="dev-notable"><strong>Key Facts:</strong><ul class="trivia-list">${facts}</ul></div>` : ''}${item.verdict ? `<div class="dev-notable" style="margin-top:1rem"><strong>Verdict:</strong> ${escapeHtml(item.verdict)}</div>` : ''}</div></div>${toggleScript()}</body></html>`;
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
  const games = (item.notableGames || []).map(g => `<li>${escapeHtml(g)}</li>`).join('');
  const facts = (item.keyFacts || []).map(f => `<li>${escapeHtml(f)}</li>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escapeHtml(item.name)} – Game Engines – Bosnan</title><meta name="description" content="${escapeHtml(item.description.substring(0, 160))}"><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${bgLogo()}${nav('game-engines')}<div class="platform-detail-wrapper"><a href="/game-engines" class="back-link">&#8592; All Game Engines</a><div class="platform-detail-header"><h1>${escapeHtml(item.name)}</h1><p class="platform-detail-era">${escapeHtml(item.developer)} &middot; ${item.year} &middot; ${escapeHtml(item.era)}${item.language ? ' &middot; ' + escapeHtml(item.language) : ''}</p><p class="platform-detail-desc">${escapeHtml(item.description)}</p><p class="platform-detail-desc">${escapeHtml(item.longDescription)}</p>${games ? `<div class="dev-notable"><strong>Notable Games:</strong><ul class="trivia-list">${games}</ul></div>` : ''}${facts ? `<div class="dev-notable"><strong>Key Facts:</strong><ul class="trivia-list">${facts}</ul></div>` : ''}</div></div>${toggleScript()}</body></html>`;
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
  const tracks = (item.notableTracks || []).map(t => `<li>${escapeHtml(t)}</li>`).join('');
  const facts = (item.keyFacts || []).map(f => `<li>${escapeHtml(f)}</li>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escapeHtml(item.name)} – Sound Chips – Bosnan</title><meta name="description" content="${escapeHtml(item.description.substring(0, 160))}"><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${bgLogo()}${nav('sound-chips')}<div class="platform-detail-wrapper"><a href="/sound-chips" class="back-link">&#8592; All Sound Chips</a><div class="platform-detail-header"><h1>${escapeHtml(item.name)}</h1><p class="platform-detail-era">${escapeHtml(item.manufacturer)} &middot; ${item.year} &middot; ${escapeHtml(item.era)}${item.voices ? ' &middot; ' + item.voices + ' voices' : ''}</p><p class="platform-detail-desc">${escapeHtml(item.description)}</p><p class="platform-detail-desc">${escapeHtml(item.longDescription)}</p>${platforms ? `<div class="dev-notable"><strong>Found In:</strong><ul class="trivia-list">${platforms}</ul></div>` : ''}${tracks ? `<div class="dev-notable"><strong>Iconic Tracks:</strong><ul class="trivia-list">${tracks}</ul></div>` : ''}${facts ? `<div class="dev-notable"><strong>Key Facts:</strong><ul class="trivia-list">${facts}</ul></div>` : ''}</div></div>${toggleScript()}</body></html>`;
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
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escapeHtml(item.title)} – Easter Eggs – Bosnan</title><meta name="description" content="${escapeHtml(item.description.substring(0, 160))}"><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${bgLogo()}${nav('easter-eggs')}<div class="platform-detail-wrapper"><a href="/easter-eggs" class="back-link">&#8592; All Easter Eggs</a><div class="platform-detail-header"><h1>${escapeHtml(item.title)}</h1><p class="platform-detail-era">${escapeHtml(item.game)} &middot; ${escapeHtml(item.platform)} &middot; ${item.year}${item.discoveredYear && item.discoveredYear !== item.year ? ' &middot; discovered ' + item.discoveredYear : ''}</p><p class="platform-detail-desc">${escapeHtml(item.description)}</p><p class="platform-detail-desc">${escapeHtml(item.longDescription)}</p>${item.howToFind ? `<div class="dev-notable" style="border-left:3px solid var(--accent,#c8a44a);padding-left:1rem;margin-top:1rem"><strong>How to find it:</strong><p style="margin-top:0.4rem;color:#ccc">${escapeHtml(item.howToFind)}</p></div>` : ''}${facts ? `<div class="dev-notable"><strong>Key Facts:</strong><ul class="trivia-list">${facts}</ul></div>` : ''}</div></div>${toggleScript()}</body></html>`;
}

function cheatCodesListPage() {
  const cards = CHEAT_CODES.map(c => `<a href="/cheat-codes/${c.id}" class="platform-card">
    <div class="platform-card-name">${escapeHtml(c.title)}</div>
    <div class="platform-card-era">${escapeHtml(c.game)} &middot; ${escapeHtml(c.platform)} &middot; ${c.year}</div>
    <div class="platform-card-count" style="font-family:monospace;font-size:0.8em;color:var(--accent,#c8a44a)">${escapeHtml(c.code)}</div>
    <p class="platform-card-desc">${escapeHtml(c.effect)}</p>
  </a>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Cheat Codes – Bosnan</title><meta name="description" content="Classic cheat codes from retro gaming: Konami Code, IDDQD, ABACABB, Justin Bailey and more."><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${bgLogo()}${nav('cheat-codes')}<section class="platforms-hero"><h1>Cheat Codes</h1><p>The codes that became part of gaming folklore</p></section><div class="platforms-grid">${cards}</div>${toggleScript()}</body></html>`;
}

function cheatCodeDetailPage(item) {
  const facts = (item.keyFacts || []).map(f => `<li>${escapeHtml(f)}</li>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escapeHtml(item.title)} – Cheat Codes – Bosnan</title><meta name="description" content="${escapeHtml(item.effect)}"><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${bgLogo()}${nav('cheat-codes')}<div class="platform-detail-wrapper"><a href="/cheat-codes" class="back-link">&#8592; All Cheat Codes</a><div class="platform-detail-header"><h1>${escapeHtml(item.title)}</h1><p class="platform-detail-era">${escapeHtml(item.game)} &middot; ${escapeHtml(item.platform)} &middot; ${item.year} &middot; ${escapeHtml(item.type)}</p><div style="background:#111;border:1px solid #333;border-radius:6px;padding:1rem 1.5rem;margin:1rem 0;font-family:monospace;font-size:1.1em;letter-spacing:0.04em;color:var(--accent,#c8a44a)">${escapeHtml(item.code)}</div><p class="platform-detail-desc"><strong>Effect:</strong> ${escapeHtml(item.effect)}</p><p class="platform-detail-desc">${escapeHtml(item.description)}</p>${facts ? `<div class="dev-notable"><strong>Key Facts:</strong><ul class="trivia-list">${facts}</ul></div>` : ''}</div></div>${toggleScript()}</body></html>`;
}

function glossaryPage() {
  const categories = [...new Set(GLOSSARY.map(g => g.category))].sort();
  const sections = categories.map(cat => {
    const terms = GLOSSARY.filter(g => g.category === cat).sort((a, b) => a.term.localeCompare(b.term));
    const entries = terms.map(t => `<div style="margin-bottom:1.5rem" id="term-${escapeHtml(t.id)}"><div style="display:flex;align-items:baseline;gap:0.8rem;margin-bottom:0.4rem"><h3 style="margin:0;font-size:1.05em">${escapeHtml(t.term)}</h3><span style="font-size:0.75em;background:rgba(255,255,255,0.08);padding:0.15rem 0.5rem;border-radius:3px;color:#999">${escapeHtml(t.category)}</span></div><p style="color:#ccc;line-height:1.7;margin:0 0 0.4rem">${escapeHtml(t.definition)}</p>${(t.examples || []).length ? `<div style="font-size:0.85em;color:#888">e.g. ${t.examples.map(e => escapeHtml(e)).join(', ')}</div>` : ''}</div>`).join('');
    return `<div class="essay-section"><h2>${escapeHtml(cat)}</h2>${entries}</div>`;
  }).join('');
  const letters = [...new Set(GLOSSARY.map(g => g.term[0].toUpperCase()))].sort();
  const alphaLinks = letters.map(l => `<a href="#letter-${l}" style="padding:0.2rem 0.4rem;background:rgba(255,255,255,0.06);border-radius:3px;font-size:0.9em;color:var(--accent,#c8a44a)">${l}</a>`).join('');
  const alphaEntries = letters.map(l => {
    const terms = GLOSSARY.filter(g => g.term[0].toUpperCase() === l).sort((a, b) => a.term.localeCompare(b.term));
    const entries = terms.map(t => `<div style="margin-bottom:1.5rem"><div style="display:flex;align-items:baseline;gap:0.8rem;margin-bottom:0.4rem"><h3 style="margin:0;font-size:1.05em">${escapeHtml(t.term)}</h3><span style="font-size:0.75em;background:rgba(255,255,255,0.08);padding:0.15rem 0.5rem;border-radius:3px;color:#999">${escapeHtml(t.category)}</span></div><p style="color:#ccc;line-height:1.7;margin:0 0 0.4rem">${escapeHtml(t.definition)}</p>${(t.examples || []).length ? `<div style="font-size:0.85em;color:#888">e.g. ${t.examples.map(e => escapeHtml(e)).join(', ')}</div>` : ''}</div>`).join('');
    return `<div id="letter-${l}" style="margin-bottom:2rem"><h2 style="font-size:2em;color:var(--accent,#c8a44a);margin-bottom:1rem">${l}</h2>${entries}</div>`;
  }).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Glossary – Bosnan</title><meta name="description" content="Retro gaming terminology explained: SHMUP, Metroidvania, roguelike, chiptune, blast processing, Mode 7 and more."><style>h1,h2,h3{font-family:inherit}</style>${cssHead()}</head><body>${bgLogo()}${nav('glossary')}<div class="essay-wrapper"><div class="essay-header"><h1 class="essay-title">Glossary</h1><p class="essay-subtitle">${GLOSSARY.length} retro gaming terms defined</p></div><div style="display:flex;flex-wrap:wrap;gap:0.4rem;margin-bottom:2rem">${alphaLinks}</div>${alphaEntries}</div>${toggleScript()}</body></html>`;
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
    const btns = choices.map(c => `<button onclick="answer(this,'${escapeHtml(item.a.replace(/'/g, "\\'"))}','${escapeHtml(c.replace(/'/g, "\\'"))}')" style="display:block;width:100%;text-align:left;background:rgba(255,255,255,0.06);border:1px solid #444;color:#fff;padding:0.7rem 1rem;border-radius:5px;cursor:pointer;font-size:0.95em;margin-bottom:0.4rem">${escapeHtml(c)}</button>`).join('');
    return `<div class="quiz-question" id="q${i}" style="display:${i === 0 ? 'block' : 'none'};margin-bottom:1rem"><p style="font-size:1.1em;margin-bottom:1rem">${i + 1}/10 &mdash; ${item.q}</p>${btns}</div>`;
  }).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Trivia Quiz – Bosnan</title><meta name="description" content="Test your retro gaming knowledge with a randomised trivia quiz."><style>h1,h2{font-family:inherit}.quiz-btn-correct{background:rgba(76,175,80,0.3)!important;border-color:#4caf50!important}.quiz-btn-wrong{background:rgba(244,67,54,0.3)!important;border-color:#f44336!important}</style>${cssHead()}</head><body>${bgLogo()}${nav('quiz')}<div class="essay-wrapper"><div class="essay-header"><h1 class="essay-title">Trivia Quiz</h1><p class="essay-subtitle">10 random questions from the archive — refreshes each visit</p></div><div id="score" style="font-size:1.1em;margin-bottom:1.5rem;color:#888">Score: <span id="scoreVal">0</span> / <span id="total">0</span></div>${questions}<div id="result" style="display:none;margin-top:2rem;text-align:center"><h2 id="resultMsg"></h2><a href="/quiz" style="display:inline-block;margin-top:1rem;background:var(--accent,#c8a44a);color:#000;padding:0.6rem 1.5rem;border-radius:5px;font-weight:700;text-decoration:none">Play Again</a></div></div><script>let cur=0,score=0,answered=false;function answer(btn,correct,chosen){if(answered)return;answered=true;const btns=btn.parentElement.querySelectorAll('button');btns.forEach(b=>{b.disabled=true;if(b.textContent.trim()===correct)b.classList.add('quiz-btn-correct');});if(chosen===correct){score++;btn.classList.add('quiz-btn-correct');}else{btn.classList.add('quiz-btn-wrong');}document.getElementById('scoreVal').textContent=score;document.getElementById('total').textContent=cur+1;setTimeout(()=>nextQ(),900);}function nextQ(){const qs=document.querySelectorAll('.quiz-question');if(cur<qs.length-1){qs[cur].style.display='none';cur++;qs[cur].style.display='block';answered=false;}else{document.querySelectorAll('.quiz-question').forEach(q=>q.style.display='none');const r=document.getElementById('result');r.style.display='block';const pct=Math.round(score/qs.length*100);document.getElementById('resultMsg').textContent=score+'/'+qs.length+' — '+pct+'%';}}</script>${toggleScript()}</body></html>`;
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
  const todayHtml = todayEvents.length ? `<div style="background:rgba(200,164,74,0.1);border:1px solid var(--accent,#c8a44a);border-radius:8px;padding:1.5rem;margin-bottom:2rem">${todayEvents.map(e => `<div><div style="font-size:1.2em;font-weight:700;margin-bottom:0.4rem">${e.title} (${e.year})</div><p style="color:#ccc;margin:0">${escapeHtml(e.desc)}</p></div>`).join('<hr style="border-color:#333;margin:1rem 0">')}</div>` : `<p style="color:#888;margin-bottom:2rem">No notable gaming events recorded for ${monthName} ${day} specifically — but here's what happened in ${monthName}:</p>`;
  const monthHtml = monthEvents.map(e => `<div style="display:grid;grid-template-columns:2.5rem 1fr;gap:0.8rem;padding:0.8rem 0;border-bottom:1px solid #222"><div style="font-weight:700;color:var(--accent,#c8a44a);padding-top:0.1rem">${e.day}</div><div><div style="font-weight:600">${escapeHtml(e.title)} <span style="color:#888;font-weight:400">(${e.year})</span></div><div style="color:#bbb;font-size:0.9em;margin-top:0.2rem">${escapeHtml(e.desc)}</div></div></div>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>On This Day – Bosnan</title><meta name="description" content="Gaming history events for ${monthName} ${day}."><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${bgLogo()}${nav('on-this-day')}<div class="essay-wrapper"><div class="essay-header"><h1 class="essay-title">On This Day</h1><p class="essay-subtitle">${monthName} ${day} in gaming history</p></div>${todayHtml}${monthEvents.length ? `<h2 style="margin-bottom:1rem">All of ${monthName}</h2>${monthHtml}` : ''}</div>${toggleScript()}</body></html>`;
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
    <circle cx="${s.x}%" cy="${s.y}%" r="6" fill="var(--accent,#c8a44a)" stroke="#000" stroke-width="1.5" opacity="0.9"/>
    <title>${escapeHtml(s.name)}</title>
  </g>`).join('');

  const studioData = JSON.stringify(studios);

  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Studio Map – Bosnan</title><meta name="description" content="World map of iconic retro game studios: Nintendo in Kyoto, id Software in Texas, Rare in the UK, DMA Design in Dundee."><style>h1,h2{font-family:inherit}.studio-dot circle:hover{r:9;opacity:1}</style>${cssHead()}</head><body>${bgLogo()}${nav('map')}<div class="essay-wrapper"><div class="essay-header"><h1 class="essay-title">Studio Map</h1><p class="essay-subtitle">Where the games were made — ${studios.length} iconic studios</p></div><div style="position:relative;background:#111;border:1px solid #333;border-radius:8px;overflow:hidden;margin-bottom:2rem"><svg viewBox="0 0 100 60" style="width:100%;display:block;background:linear-gradient(180deg,#0a1628 0%,#1a2a1a 100%)">
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
<div id="studioInfo" style="display:none;background:rgba(200,164,74,0.1);border:1px solid var(--accent,#c8a44a);border-radius:8px;padding:1.2rem 1.5rem;margin-bottom:1.5rem"><h2 id="studioName" style="margin:0 0 0.3rem"></h2><div id="studioCity" style="color:#999;font-size:0.9em;margin-bottom:0.5rem"></div><p id="studioDesc" style="margin:0;color:#ccc"></p></div>
<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:0.8rem">${studios.map((s, i) => `<div onclick="showStudio(${i})" style="background:rgba(255,255,255,0.04);border-radius:6px;padding:0.7rem 1rem;cursor:pointer;border:1px solid transparent" id="scard${i}"><div style="font-weight:600;font-size:0.9em">${escapeHtml(s.name)}</div><div style="color:#888;font-size:0.8em">${escapeHtml(s.city)}</div></div>`).join('')}</div>
</div>
<script>const studios=${studioData};function showStudio(i){const s=studios[i];document.getElementById('studioInfo').style.display='block';document.getElementById('studioName').textContent=s.name;document.getElementById('studioCity').textContent=s.city;document.getElementById('studioDesc').textContent=s.desc;document.querySelectorAll('[id^="scard"]').forEach(el=>el.style.borderColor='transparent');document.getElementById('scard'+i).style.borderColor='var(--accent,#c8a44a)';}</script>
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
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escapeHtml(mag.name)} – Magazines – Bosnan</title><meta name="description" content="${escapeHtml(mag.description.substring(0, 160))}"><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${bgLogo()}${nav('magazines')}<div class="platform-detail-wrapper"><a href="/magazines" class="back-link">&#8592; All Magazines</a><div class="platform-detail-header"><h1>${escapeHtml(mag.name)}</h1><p class="platform-detail-era">${escapeHtml(mag.country)} &middot; ${mag.founded}${mag.closed ? '–' + mag.closed : '–present'}</p><p class="platform-detail-desc">${escapeHtml(mag.description)}</p><p class="platform-detail-desc">${escapeHtml(mag.longDescription)}</p>${issues ? `<div class="dev-notable"><strong>Notable Issues:</strong><ul class="trivia-list">${issues}</ul></div>` : ''}${facts ? `<div class="dev-notable"><strong>Key Facts:</strong><ul class="trivia-list">${facts}</ul></div>` : ''}</div></div>${toggleScript()}</body></html>`;
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
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escapeHtml(entry.title)} Box Art – Bosnan</title><meta name="description" content="${escapeHtml(entry.description.substring(0, 160))}"><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${bgLogo()}${nav('box-art')}<div class="platform-detail-wrapper"><a href="/box-art" class="back-link">&#8592; All Box Art</a><div class="platform-detail-header"><h1>${escapeHtml(entry.title)}</h1><p class="platform-detail-era">${escapeHtml(entry.platform)} &middot; ${entry.year} &middot; ${escapeHtml(entry.region)}${entry.artist ? ' &middot; Art: ' + escapeHtml(entry.artist) : ''}</p><p class="platform-detail-desc">${escapeHtml(entry.description)}</p><p class="platform-detail-desc">${escapeHtml(entry.longDescription)}</p>${facts ? `<div class="dev-notable"><strong>Key Facts:</strong><ul class="trivia-list">${facts}</ul></div>` : ''}</div></div>${toggleScript()}</body></html>`;
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
  const qualityColor = { 'Excellent': '#4caf50', 'Good': '#8bc34a', 'Acceptable': '#ffc107', 'Poor': '#ff5722', 'Infamous': '#f44336' };
  const versionsHtml = (port.versions || []).map(v => `<div style="background:rgba(255,255,255,0.04);border-radius:6px;padding:1rem 1.2rem;margin-bottom:0.8rem"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.5rem"><strong>${escapeHtml(v.platform)} (${v.year})</strong><span style="background:${qualityColor[v.quality] || '#888'};color:#000;padding:0.2rem 0.6rem;border-radius:3px;font-size:0.8em;font-weight:700">${escapeHtml(v.quality)}</span></div><p style="color:#bbb;font-size:0.9em;line-height:1.6;margin:0">${escapeHtml(v.notes)}</p></div>`).join('');
  const facts = (port.keyFacts || []).map(f => `<li>${escapeHtml(f)}</li>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escapeHtml(port.title)} – Port Comparisons – Bosnan</title><meta name="description" content="${escapeHtml(port.description.substring(0, 160))}"><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${bgLogo()}${nav('ports')}<div class="platform-detail-wrapper"><a href="/ports" class="back-link">&#8592; All Port Comparisons</a><div class="platform-detail-header"><h1>${escapeHtml(port.title)}</h1><p class="platform-detail-era">Original: ${escapeHtml(port.originalPlatform)} &middot; ${port.year}</p><p class="platform-detail-desc">${escapeHtml(port.description)}</p><p class="platform-detail-desc">${escapeHtml(port.longDescription)}</p><h2 style="margin-top:1.5rem;margin-bottom:1rem">Version Breakdown</h2>${versionsHtml}${facts ? `<div class="dev-notable" style="margin-top:1rem"><strong>Key Facts:</strong><ul class="trivia-list">${facts}</ul></div>` : ''}</div></div>${toggleScript()}</body></html>`;
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
  const roles = (va.notableRoles || []).map(r => `<li>${escapeHtml(r)}</li>`).join('');
  const facts = (va.keyFacts || []).map(f => `<li>${escapeHtml(f)}</li>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escapeHtml(va.name)} – Voice Actors – Bosnan</title><meta name="description" content="${escapeHtml(va.description.substring(0, 160))}"><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${bgLogo()}${nav('voice-actors')}<div class="platform-detail-wrapper"><a href="/voice-actors" class="back-link">&#8592; All Voice Actors</a><div class="platform-detail-header"><h1>${escapeHtml(va.name)}</h1><p class="platform-detail-era">${escapeHtml(va.nationality)}${va.born ? ' &middot; b. ' + va.born : ''} &middot; ${escapeHtml(va.era)}</p><p class="platform-detail-desc">${escapeHtml(va.description)}</p><p class="platform-detail-desc">${escapeHtml(va.longDescription)}</p>${roles ? `<div class="dev-notable"><strong>Notable Roles:</strong><ul class="trivia-list">${roles}</ul></div>` : ''}${facts ? `<div class="dev-notable"><strong>Key Facts:</strong><ul class="trivia-list">${facts}</ul></div>` : ''}</div></div>${toggleScript()}</body></html>`;
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
  const work = (artist.notableWork || []).map(w => `<li>${escapeHtml(w)}</li>`).join('');
  const facts = (artist.keyFacts || []).map(f => `<li>${escapeHtml(f)}</li>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escapeHtml(artist.name)} – Pixel Artists – Bosnan</title><meta name="description" content="${escapeHtml(artist.description.substring(0, 160))}"><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${bgLogo()}${nav('pixel-artists')}<div class="platform-detail-wrapper"><a href="/pixel-artists" class="back-link">&#8592; All Pixel Artists</a><div class="platform-detail-header"><h1>${escapeHtml(artist.name)}</h1><p class="platform-detail-era">${escapeHtml(artist.nationality)}${artist.born ? ' &middot; b. ' + artist.born : ''} &middot; ${escapeHtml(artist.era)}</p><p class="platform-detail-desc">${escapeHtml(artist.description)}</p><p class="platform-detail-desc">${escapeHtml(artist.longDescription)}</p>${work ? `<div class="dev-notable"><strong>Notable Work:</strong><ul class="trivia-list">${work}</ul></div>` : ''}${facts ? `<div class="dev-notable"><strong>Key Facts:</strong><ul class="trivia-list">${facts}</ul></div>` : ''}</div></div>${toggleScript()}</body></html>`;
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
  const work = (prod.notableWork || []).map(w => `<li>${escapeHtml(w)}</li>`).join('');
  const facts = (prod.keyFacts || []).map(f => `<li>${escapeHtml(f)}</li>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escapeHtml(prod.name)} – Producers – Bosnan</title><meta name="description" content="${escapeHtml(prod.description.substring(0, 160))}"><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${bgLogo()}${nav('producers')}<div class="platform-detail-wrapper"><a href="/producers" class="back-link">&#8592; All Producers</a><div class="platform-detail-header"><h1>${escapeHtml(prod.name)}</h1><p class="platform-detail-era">${escapeHtml(prod.role)} &middot; ${escapeHtml(prod.company)}${prod.born ? ' &middot; b. ' + prod.born : ''} &middot; ${escapeHtml(prod.era)}</p><p class="platform-detail-desc">${escapeHtml(prod.description)}</p><p class="platform-detail-desc">${escapeHtml(prod.longDescription)}</p>${work ? `<div class="dev-notable"><strong>Notable Work:</strong><ul class="trivia-list">${work}</ul></div>` : ''}${facts ? `<div class="dev-notable"><strong>Key Facts:</strong><ul class="trivia-list">${facts}</ul></div>` : ''}</div></div>${toggleScript()}</body></html>`;
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
  const itemsHtml = (col.items || []).map(item => `<div style="display:grid;grid-template-columns:2.5rem 1fr;gap:0.8rem;align-items:start;padding:0.9rem 0;border-bottom:1px solid #222"><div style="font-size:1.5em;font-weight:900;color:var(--accent,#c8a44a);text-align:center;padding-top:0.1rem">${item.rank}</div><div><div style="font-weight:700;margin-bottom:0.2rem">${escapeHtml(item.title)}</div><div style="color:#bbb;font-size:0.9em;line-height:1.5">${escapeHtml(item.note)}</div></div></div>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escapeHtml(col.title)} – Bosnan</title><meta name="description" content="${escapeHtml(col.description.substring(0, 160))}"><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${bgLogo()}${nav('collections')}<div class="essay-wrapper"><a href="/collections" class="back-link">&#8592; All Lists</a><div class="essay-header"><div class="essay-meta">${escapeHtml(col.category)}</div><h1 class="essay-title">${escapeHtml(col.title)}</h1><p class="essay-subtitle">${escapeHtml(col.subtitle || col.description)}</p></div><div style="margin-top:1rem">${itemsHtml}</div></div>${toggleScript()}</body></html>`;
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
  const statCard = (label, value, sub = '') => `<div style="background:rgba(255,255,255,0.05);border-radius:8px;padding:1.2rem 1.5rem;text-align:center"><div style="font-size:2.5em;font-weight:900;color:var(--accent,#c8a44a)">${value}</div><div style="font-weight:600;margin-top:0.3rem">${label}</div>${sub ? `<div style="font-size:0.85em;color:#888;margin-top:0.2rem">${sub}</div>` : ''}</div>`;
  const barRow = (label, count, max) => `<div style="display:grid;grid-template-columns:160px 1fr 2.5rem;gap:0.8rem;align-items:center;margin-bottom:0.5rem"><span style="font-size:0.9em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(label)}</span><div style="background:#222;border-radius:3px;height:8px;overflow:hidden"><div style="background:var(--accent,#c8a44a);height:100%;width:${Math.round(count / max * 100)}%"></div></div><span style="font-size:0.85em;color:#999;text-align:right">${count}</span></div>`;
  const totalEssays = ESSAYS.length;
  const totalSections = [PLATFORMS, DEVELOPERS, COMPOSERS, DESIGNERS, PUBLISHERS, ARCADE_BOARDS, PERIPHERALS, LOST_GAMES, MAGAZINES, BOX_ART, PORTS, VOICE_ACTORS, PIXEL_ARTISTS, PRODUCERS, COLLECTIONS, GENRES, FRANCHISES, HARDWARE, REGIONAL].reduce((s, a) => s + a.length, 0);
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Archive Stats – Bosnan</title><meta name="description" content="Numbers behind the Bosnan retro games archive."><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${bgLogo()}${nav('stats')}<div class="essay-wrapper"><div class="essay-header"><h1 class="essay-title">Archive Stats</h1><p class="essay-subtitle">By the numbers</p></div><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:1rem;margin-bottom:2.5rem">${statCard('Games', games.length)}${statCard('Platforms', PLATFORMS.length)}${statCard('Essays', totalEssays)}${statCard('Playable', playable, 'with play link')}${statCard('Sections', totalSections, 'profiles & articles')}</div><div style="display:grid;grid-template-columns:1fr 1fr;gap:2rem;flex-wrap:wrap"><div><h2 style="margin-bottom:1rem">Top Platforms</h2>${topPlatforms.map(([p, c]) => barRow(p, c, topPlatforms[0][1])).join('')}</div><div><h2 style="margin-bottom:1rem">Top Genres</h2>${topGenres.map(([g, c]) => barRow(g, c, topGenres[0][1])).join('')}</div></div><div style="margin-top:2rem"><h2 style="margin-bottom:1rem">By Decade</h2><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:0.8rem">${Object.entries(byDecade).sort().map(([d, c]) => `<div style="background:rgba(255,255,255,0.05);border-radius:6px;padding:0.8rem 1rem;text-align:center"><div style="font-size:1.3em;font-weight:700;color:var(--accent,#c8a44a)">${c}</div><div style="font-size:0.85em">${escapeHtml(d)}</div></div>`).join('')}</div></div></div>${toggleScript()}</body></html>`;
}

function recentPage() {
  const recentGames = [...games].sort((a, b) => b.year - a.year).slice(0, 48);
  const recentEssays = ESSAYS.slice(-12).reverse();
  const cardHtml = buildCardHtml(recentGames, EAGER_IMAGES);
  const essayLinks = recentEssays.map(e => `<a href="/essays/${e.id}" class="platform-card"><div class="platform-card-name">${escapeHtml(e.title)}</div><p class="platform-card-desc">${escapeHtml((e.summary || '').substring(0, 100))}</p></a>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Recently Added – Bosnan</title><meta name="description" content="The most recent additions to the Bosnan retro gaming archive."><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${bgLogo()}${nav('recent')}<section class="platforms-hero"><h1>Recently Added</h1><p>The newest content in the archive</p></section><h2 style="max-width:1200px;margin:1.5rem auto 1rem;padding:0 1rem">Latest Essays</h2><div class="platforms-grid" style="max-width:1200px">${essayLinks}</div><h2 style="max-width:1200px;margin:2rem auto 1rem;padding:0 1rem">Games by Year (Newest First)</h2><div class="games-grid">${cardHtml}</div>${toggleScript()}</body></html>`;
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

  const eventsHtml = events.map((e, i) => `<div style="display:grid;grid-template-columns:5rem 1px 1fr;gap:0 1.5rem;align-items:start;padding-bottom:1.5rem"><div style="text-align:right;font-size:1.1em;font-weight:900;color:var(--accent,#c8a44a);padding-top:0.15rem">${e.year}</div><div style="background:${i % 2 === 0 ? 'var(--accent,#c8a44a)' : '#444'};width:1px;min-height:100%;margin:0 auto"></div><div style="padding-bottom:0.5rem"><div style="font-weight:700;margin-bottom:0.3rem">${escapeHtml(e.title)}</div><div style="color:#bbb;font-size:0.9em;line-height:1.6">${escapeHtml(e.desc)}</div></div></div>`).join('');

  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Timeline – Bosnan</title><meta name="description" content="A chronological timeline of retro gaming history from 1958 to 2001."><style>h1,h2{font-family:inherit}</style>${cssHead()}</head><body>${bgLogo()}${nav('timeline')}<div class="essay-wrapper"><div class="essay-header"><h1 class="essay-title">Timeline</h1><p class="essay-subtitle">Gaming history from Spacewar! to the PS2 era — a chronological view</p></div><div style="margin-top:2rem">${eventsHtml}</div></div>${toggleScript()}</body></html>`;
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
