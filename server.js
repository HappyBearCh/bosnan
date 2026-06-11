const express = require('express');
const compression = require('compression');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;

const games = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'games.json'), 'utf8'));
const GENRES = require('./data/genres');
const ESSAYS = [...require('./data/essays'), ...require('./data/essays2'), ...require('./data/essays3'), ...require('./data/essays4'), ...require('./data/essays5'), ...require('./data/essays6'), ...require('./data/essays7'), ...require('./data/essays8'), ...require('./data/essays9'), ...require('./data/essays10')];
const DEVELOPERS = require('./data/developers');
const COMPOSERS = require('./data/composers');
const FRANCHISES = require('./data/franchises');
const HARDWARE = require('./data/hardware');
const DESIGNERS = require('./data/designers');
const REGIONAL = require('./data/regional');
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
const cachedDesignerPageHtml = {};
const cachedYearPageHtml = {};
const cachedRegionalPageHtml = {};
const cachedEssayPageHtml = {};
let cachedGameLauncherHtml = null;
const cachedPlatformPageHtml = {};
const cachedGenrePageHtml = {};
const cachedDeveloperPageHtml = {};
const cachedComposerPageHtml = {};
const cachedFranchisePageHtml = {};
const cachedHardwarePageHtml = {};
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
        ${link('/composers', 'Composers', 'composers')}
        ${link('/franchises', 'Franchises', 'franchises')}
        ${link('/hardware', 'Hardware', 'hardware')}
        ${link('/designers', 'Designers', 'designers')}
        ${link('/years', 'By Year', 'years')}
        ${link('/regional', 'Regional', 'regional')}
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
    const staticUrls = ['', '/games', '/platforms', '/developers', '/composers', '/franchises', '/hardware', '/designers', '/years', '/regional', '/genres', '/essays'].map(p => `
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
    cachedSitemap = {
      host,
      xml: `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${staticUrls}${platformUrls}${developerUrls}${composerUrls}${franchiseUrls}${hardwareUrls}${designerUrls}${regionalUrls}${genreUrls}${essayUrls}${yearUrls}${gameUrls}
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
  if (!cachedYearPageHtml[year]) cachedYearPageHtml[year] = yearDetailPage(year);
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

function yearDetailPage(year) {
  const yGames = (yearsIndex.get(year) || []).slice().sort((a, b) => a.title.localeCompare(b.title));
  const cardHtml = buildCardHtml(yGames.slice(0, PAGE_SIZE), EAGER_IMAGES);
  const inlineData = JSON.stringify(yGames.map(({ id, title, year: y, decade, genre, platform, developer, image, playUrl }) =>
    ({ id, title, year: y, decade, genre, platform, developer, image, playUrl: playUrl || null })
  ));
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${year} Games – Bosnan</title>
    <meta name="description" content="${yGames.length} games from ${year} in the Bosnan retro archive.">
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
