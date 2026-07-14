module.exports = [
  {
    id: 'shoot-em-up',
    name: "Shoot 'em Ups",
    shortName: 'Shmups',
    era: '1962 – present',
    subtitle: "From Spacewar! to bullet hell — the genre that launched an industry",
    description: "Shoot 'em ups are games where the player pilots a craft shooting enemies while dodging their fire. No genre has been more commercially transformative: Space Invaders alone turned video games from novelty into a billion-dollar global industry.",
    genres: ['Fixed Shooter', 'Isometric Shooter', 'Light Gun Shooter', 'Rail Shooter', 'Run and Gun', 'Shooter', 'Space Combat', 'Space Shooter', 'Tank Shooter', 'Platform / Shooter', 'Racing / Shooter'],
    image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/02/Spacewar1.png/250px-Spacewar1.png',
    imageCaption: "Spacewar! (1962) — one of the first digital games, running on MIT's PDP-1 mainframe.",
    imageAlt: 'Spacewar! on a CRT display showing two spaceships near a gravity star',
    imageLicense: 'Public Domain',
    stats: [
      { label: 'First game', value: 'Spacewar! (1962)' },
      { label: 'First commercial hit', value: 'Space Invaders (1978)' },
      { label: 'Peak arcade era', value: '1978 – 1985' },
      { label: 'Key developers', value: 'Taito, Namco, Atari, Williams' },
    ],
    sections: [
      {
        title: 'Overview',
        html: `<p>Shoot 'em ups — affectionately called "shmups" by enthusiasts — are action games where the player controls a craft or character whose primary ability is shooting. Enemies attack in waves and patterns; survival demands fast reflexes and spatial awareness. The genre spans fixed-position shooters like Space Invaders, omnidirectional arena shooters like Asteroids, horizontally-scrolling shooters like Gradius, and the hyper-dense "bullet hell" games of the 1990s onward.</p>`
      },
      {
        title: 'History',
        html: `<p>The genre was born at MIT in 1962 when students Martin Graetz, Steve Russell, and Wayne Wiitanen wrote <strong>Spacewar!</strong> for the PDP-1 mainframe — two spaceships orbiting a gravity star, shooting at each other. The game spread across every university with a PDP computer, making it the first widely-played digital game. When Nolan Bushnell commercialised the concept as <em>Computer Space</em> (1971), the result was too complex for bar patrons. But the proof-of-concept led him to found Atari the following year.</p>
<p>Taito's <strong>Space Invaders</strong> (1978) solved the complexity problem with a single joystick and one fire button. Ranks of aliens descended, accelerating as you shot them down — a terrifyingly simple feedback loop. Space Invaders was so successful in Japan that the government reportedly had to triple 100-yen coin production. Licensed to Midway in North America, it sold over one million arcade cabinets — the first game to do so. When Atari released it for the 2600 console in 1980, console sales quadrupled: Space Invaders was gaming's first killer app.</p>
<p>Namco's <strong>Galaga</strong> (1981) refined the formula with diving enemy formations and the tactical gamble of letting your ship be captured to fight as a twin. Atari's <strong>Asteroids</strong> (1979) explored a different design space — vector graphics, rotational physics, the terror of inertia in empty space. Williams' <strong>Defender</strong> (1981) pushed complexity to its limits with a scrolling planet, a minimap scanner, and five simultaneous controls, briefly becoming the highest-grossing arcade game ever made.</p>
<p>The mid-1980s expanded the genre to home computers. On the Commodore 64 and ZX Spectrum, games like Uridium and R-Type ports thrived. The Japanese branch evolved toward "bullet hell" — screens dense with enemy projectiles demanding memorised patterns of movement — pioneered by Compile and later Cave through the 1990s.</p>`
      },
      {
        title: 'Mechanics',
        html: `<p>The fundamental tension is between offence (shooting to score) and defence (avoiding destruction). Fixed shooters like Space Invaders reduce this to a pure timing puzzle on a single axis. Scrolling shooters add a second dimension of evasion and introduce terrain. Omnidirectional games like Asteroids demand mastery of momentum and rotational movement.</p>
<p>Power-up systems — spread shots, speed boosts, invincibility bombs — create risk/reward decisions layered over the core reflex challenge. Score multipliers and combo systems reward aggressive play. Enemy bullet patterns in advanced games function as spatial puzzles: safe routes must be read and memorised under pressure.</p>`
      },
      {
        title: 'Cultural Impact',
        html: `<p>Space Invaders alone generated an estimated $13 billion (inflation-adjusted) over its arcade lifetime. The game's grid of descending aliens became the universal visual shorthand for video games — an icon that predates any other gaming symbol. The competitive high-score culture born in shoot 'em ups — the public leaderboard, the crowd watching a skilled player, the obsession with a single number — established gaming as both personal challenge and social performance. That culture persists in speedrunning and competitive gaming communities today.</p>`
      }
    ]
  },

  {
    id: 'platformer',
    name: 'Platform Games',
    shortName: 'Platformers',
    era: '1981 – present',
    subtitle: "Jump, run, explore — the genre that gave the world Mario",
    description: "Platform games task players with navigating environments by jumping across suspended platforms and obstacles. Donkey Kong introduced the jump mechanic in 1981; Super Mario Bros. perfected it in 1985, creating one of the most commercially successful and culturally influential genres in history.",
    genres: ['Platform', 'Platform / Action', 'Platform / Puzzle', 'Platform / Shooter', "Beat 'em up / Platform", 'Action / Platform', 'Puzzle / Platform'],
    image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/38/Supertux010.jpg/250px-Supertux010.jpg',
    imageCaption: 'SuperTux, an open-source platformer in the tradition of Super Mario Bros., illustrating the enduring side-scrolling format.',
    imageAlt: 'SuperTux open-source platformer game showing side-scrolling level with blocks and enemies',
    imageLicense: 'GPL',
    stats: [
      { label: 'First game', value: 'Donkey Kong (Nintendo, 1981)' },
      { label: 'Defining title', value: 'Super Mario Bros. (1985)' },
      { label: 'Best-selling platformer', value: 'Super Mario Bros. (40M+ copies)' },
      { label: 'Key designers', value: 'Shigeru Miyamoto, Takashi Tezuka' },
    ],
    sections: [
      {
        title: 'Overview',
        html: `<p>Platform games — platformers — are games where the player navigates a character through environments by running and jumping, clearing gaps, obstacles, and enemies positioned on suspended platforms or terrain at varying heights. The jump is the defining mechanic: its arc, timing, and feel define the entire game's identity. Good platformer design communicates danger and reward purely through visual level geometry, teaching players new mechanics without a single word of instruction.</p>`
      },
      {
        title: 'History',
        html: `<p>The jump was invented as a game mechanic in <strong>Donkey Kong</strong> (Nintendo, 1981), designed by a young Shigeru Miyamoto. Players controlled a carpenter named Jumpman — later renamed Mario — climbing construction girders and leaping over barrels hurled by an escaped gorilla. Donkey Kong was the highest-earning arcade cabinet in North America in 1981 and introduced both Miyamoto and Mario to the world.</p>
<p>Activision's <strong>Pitfall!</strong> (Atari 2600, 1982), designed by David Crane in an extraordinarily short development cycle, brought platform mechanics to home consoles. Players swung on vines, leapt over alligators, and descended into underground passages across a jungle adventure. Pitfall! sold over four million copies — one of the best-selling Atari 2600 titles ever made.</p>
<p><strong>Super Mario Bros.</strong> (Nintendo, 1985) perfected the genre. Bundled with every NES sold in North America, it became the best-selling video game in history for nearly two decades. Miyamoto and Tezuka's design remains a masterclass: World 1-1 functions as a complete interactive tutorial using only level geometry and enemy placement — no text, no tooltips, no instructions. Players learned entirely by doing.</p>
<p>In Europe, the ZX Spectrum and Commodore 64 produced their own platformer traditions. <em>Manic Miner</em> (1983) and <em>Jet Set Willy</em> (1984) by Matthew Smith were celebrated for fiendish level design. Ultimate Play the Game (later Rare) invented the isometric 3D platformer with <em>Knight Lore</em> (1984). Sega's Alex Kidd series offered Nintendo direct competition on the Master System.</p>`
      },
      {
        title: 'Mechanics',
        html: `<p>The jump mechanic's feel — the height of the arc, the moment of mid-air directional control, the weight on landing — is the soul of every platformer. Designers invest enormous effort tuning the physics. Super Mario Bros. allows directional correction mid-jump; holding the button extends the arc; running builds momentum that changes jump distance. These subtleties reward mastery without being explicitly taught.</p>
<p>Level design in platformers communicates entirely through visual language. Coins mark the correct path; a gap's width signals whether to run or walk; red mushrooms signal danger. Secrets reward curiosity. The difficulty curve introduces each new mechanic in a safe context before testing it under pressure — a design principle Miyamoto called "teaching through failure."</p>`
      },
      {
        title: 'Cultural Impact',
        html: `<p>Super Mario Bros. sold over 40 million copies and remained the best-selling game of all time until Wii Sports in 2009. Mario became the most recognisable fictional character on Earth, surpassing Mickey Mouse in a 1990 survey of American children. The platformer genre taught an entire generation the language of video games: jump on enemies to defeat them, coins reward exploration, the princess is always in another castle. The visual and mechanical vocabulary Miyamoto built in 1985 still forms the foundation of modern game design literacy.</p>`
      }
    ]
  },

  {
    id: 'adventure',
    name: 'Adventure Games',
    shortName: 'Adventure',
    era: '1976 – present',
    subtitle: "From text parsers to point-and-click — the birth of interactive storytelling",
    description: "Adventure games are narrative-driven experiences where players solve puzzles and explore stories. Beginning with Colossal Cave Adventure in 1976, the genre proved video games could tell stories — producing the first interactive fiction, the first graphical adventure games, and enduring masterpieces of comedic writing.",
    genres: ['Adventure', 'Action / Adventure', 'Action-Adventure', 'Point-and-Click Adventure', 'Text Adventure'],
    image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/35/ADVENT_--_Will_Crowther%27s_original_version.png/330px-ADVENT_--_Will_Crowther%27s_original_version.png',
    imageCaption: "Colossal Cave Adventure (1976) — the original text adventure. Players typed commands to navigate a virtual cave system.",
    imageAlt: 'Terminal output of the original Colossal Cave Adventure showing cave room text descriptions',
    imageLicense: 'Public Domain',
    stats: [
      { label: 'First game', value: 'Colossal Cave Adventure (1975–76)' },
      { label: 'First graphical adventure', value: 'Mystery House (Sierra, 1980)' },
      { label: 'Commercial peak', value: 'Infocom & LucasArts, 1980–93' },
      { label: 'Key creators', value: 'Crowther, Infocom, Sierra, LucasArts' },
    ],
    sections: [
      {
        title: 'Overview',
        html: `<p>Adventure games are games where narrative and puzzle-solving take precedence over reflexes. Players explore environments, collect and combine objects, converse with characters, and solve logic puzzles to advance a story. The genre pioneered interactive storytelling and literary ambition in games, establishing that a video game could carry the emotional weight of a novel and the structural creativity of theatre.</p>`
      },
      {
        title: 'History',
        html: `<p><strong>Colossal Cave Adventure</strong> was created in 1975–76 by Will Crowther, a programmer and passionate caver at BBN Technologies, as a gift for his daughters after a difficult divorce. Players typed two-word commands — "GO NORTH", "TAKE LAMP", "KILL DRAGON" — and received text descriptions of cave rooms modelled on Mammoth Cave in Kentucky. Don Woods expanded the game in 1977, adding fantasy elements and puzzles. It spread across university ARPANET accounts and became the common ancestor of every adventure game ever made.</p>
<p>MIT students Marc Blank, Dave Lebling, Bruce Daniels, and Tim Anderson created <strong>Zork</strong> in 1977, introducing a sophisticated natural language parser and atmospheric writing. Commercialised by Infocom in 1980, it became a bestseller. Infocom went on to produce some of the finest literary games ever made: <em>The Hitchhiker's Guide to the Galaxy</em> (co-written with Douglas Adams), <em>Planetfall</em>, and <em>A Mind Forever Voyaging</em>.</p>
<p>Sierra On-Line's <strong>Mystery House</strong> (1980), designed by Ken and Roberta Williams on an Apple II, was the first graphical adventure game sold commercially. Roberta drew the pictures; Ken wrote the code. Sierra followed with <em>King's Quest</em> (1984), featuring animated characters in a fairy-tale world, establishing the template for graphic adventure games for a decade.</p>
<p>LucasFilm Games' <strong>Maniac Mansion</strong> (1987) introduced the SCUMM engine and a radical philosophy: no dead ends, no unwinnable states. A player could never permanently fail — only make progress slower. This humane approach culminated in <em>The Secret of Monkey Island</em> (1990) and the golden age of LucasArts point-and-click comedy adventures.</p>`
      },
      {
        title: 'Mechanics',
        html: `<p>Text adventures used natural language parsing: the player typed commands and the game responded in prose. The quality of the parser determined how freely players could interact — Infocom's parser accepted complex sentences; lesser parsers frustrated players with "I don't understand THAT." Graphical adventures replaced typing with verb-object menus or point-and-click interfaces, widening accessibility enormously.</p>
<p>Puzzle design in adventure games trades on inventory management (collecting and combining objects), observation (noticing environmental details), and lateral thinking (applying real-world logic to fictional situations). The genre's most criticised failure mode is "moon logic" — solutions so obtuse they seem to require psychic knowledge of the designer's mind.</p>`
      },
      {
        title: 'Cultural Impact',
        html: `<p>Infocom demonstrated that video games could achieve genuine literary quality. The <em>Hitchhiker's Guide</em> game attracted mainstream cultural attention — here was a respected novelist treating a video game as a legitimate artistic medium. Sierra's franchises sold to families who had never called themselves gamers. LucasArts' comedy adventures — Monkey Island, Day of the Tentacle, Grim Fandango — are still cited among the greatest games ever made. The tradition lives on in visual novels, walking simulators, and narrative games like <em>What Remains of Edith Finch</em> and <em>Disco Elysium</em>.</p>`
      }
    ]
  },

  {
    id: 'rpg',
    name: 'Role-Playing Games',
    shortName: 'RPGs',
    era: '1974 – present',
    subtitle: "Character, growth, and world — gaming's most immersive tradition",
    description: "Role-playing games let players inhabit characters who grow in strength and story through exploration and combat. Born from tabletop D&D on university mainframes, CRPGs created gaming's deepest traditions of narrative ambition, world-building, and character investment.",
    genres: ['RPG', 'Action RPG', 'Action-RPG', 'Dungeon Crawler'],
    image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c6/Computer_rpg_no_automap.jpg/250px-Computer_rpg_no_automap.jpg',
    imageCaption: 'Hand-drawn dungeon maps on graph paper — a necessity for players of early CRPGs like Wizardry and Ultima before automapping existed.',
    imageAlt: 'Hand-drawn dungeon maps on graph paper used by early CRPG players',
    imageLicense: 'CC BY-SA 3.0',
    stats: [
      { label: 'First CRPG', value: 'dnd on PLATO (1974–75)' },
      { label: 'Defining early titles', value: 'Ultima, Wizardry (1981)' },
      { label: 'Roguelike origin', value: 'Rogue (1980)' },
      { label: 'Influence', value: 'Dungeons & Dragons (1974)' },
    ],
    sections: [
      {
        title: 'Overview',
        html: `<p>Role-playing games (RPGs) are games where the player inhabits a character — or a party of characters — whose statistics, abilities, and story significance grow through experience gained in exploration and combat. The genre uniquely combines systems depth (character builds, stat management, inventory optimisation) with narrative immersion (story, world-building, dialogue), creating gaming's most time-intensive and emotionally invested genre.</p>`
      },
      {
        title: 'History',
        html: `<p>The computer RPG (CRPG) emerged directly from tabletop Dungeons &amp; Dragons (Gary Gygax and Dave Arneson, 1974). Gary Whisenhunt and Ray Wood created <strong>dnd</strong> in 1974–75 for the PLATO mainframe — one of the first games with persistent character advancement through levels. Players built characters who accumulated experience and equipment across sessions. This persistence — your character existing between play sessions — was a genuinely new concept in computing.</p>
<p>Richard Garriott (known online as "Lord British") created <strong>Akalabeth: World of Doom</strong> (1979) as a teenager and sold copies in plastic bags at his local computer store. Its surprise success funded <strong>Ultima</strong> (1981), combining RPG mechanics with a coherent fictional world on the Apple II. The Ultima series expanded into rich moral frameworks and political systems — <em>Ultima IV: Quest of the Avatar</em> (1985) replaced killing the villain with the pursuit of moral virtue as its win condition, the first RPG to make ethical behaviour the explicit goal.</p>
<p>Andrew Greenberg and Robert Woodhead's <strong>Wizardry: Proving Grounds of the Mad Overlord</strong> (1981) introduced first-person dungeon exploration with unforgiving party management and permadeath. Its rigour appealed to the hardcore; Japanese developers imported the Wizardry formula into Dragon Quest and Final Fantasy, creating one of the world's most commercially dominant game traditions.</p>
<p>Michael Toy and Glenn Wichman's <strong>Rogue</strong> (1980) introduced procedurally generated dungeons — every playthrough different. The "roguelike" genre this spawned remains one of the most creatively diverse in gaming, from NetHack to Hades.</p>`
      },
      {
        title: 'Mechanics',
        html: `<p>RPG mechanics centre on character growth: attributes like Strength, Intelligence, and Dexterity — modelled on tabletop dice systems — modified by equipment and special abilities. Experience points reward combat and exploration; levelling up increases stats and unlocks new abilities. Inventory management — carrying limits, equipment slots, item identification — adds logistical depth that rewards careful planning.</p>
<p>The genre's defining emotional arc is transformation: starting as a fragile novice and becoming powerful enough to challenge gods. This fantasy of personal growth through effort — where time invested is directly reflected in character capability — is a motivational structure no other genre replicates at the same scale.</p>`
      },
      {
        title: 'Cultural Impact',
        html: `<p>The RPG is gaming's most culturally ambitious genre. Richard Garriott called Ultima IV "the first RPG with a message," and the series' engagement with virtue, ethics, and consequence raised the philosophical bar for what a game could attempt. Japanese RPGs on the NES and Super NES introduced story-driven role-playing to tens of millions of players worldwide, making Final Fantasy and Dragon Quest some of the most beloved franchises in entertainment. The genre's tradition of vast worlds, memorable characters, and hundreds of hours of content continues to define gaming's most dedicated and passionate player communities.</p>`
      }
    ]
  },

  {
    id: 'fighting',
    name: "Fighting Games & Beat 'em Ups",
    shortName: 'Fighting',
    era: '1984 – present',
    subtitle: "One-on-one combat and brawling — the arcade's competitive heart",
    description: "Fighting games pit players in head-to-head combat using special moves and combos. Beat 'em ups send players through side-scrolling waves of enemies. Together, these two genres created competitive gaming culture and the cooperative couch-play tradition.",
    genres: ['Fighting', "Beat 'em up", "Beat 'em up / Platform", 'Boxing', 'Wrestling'],
    image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/64/Generic_Fighting_Video_Game_%28with_outline%29.svg/250px-Generic_Fighting_Video_Game_%28with_outline%29.svg.png',
    imageCaption: "A typical one-on-one fighting game: two characters with health bars above — the format popularised by Street Fighter II (1991).",
    imageAlt: 'Illustration of a generic fighting video game showing two characters and health bars',
    imageLicense: 'CC BY 3.0',
    stats: [
      { label: 'First fighting game', value: 'Karate Champ (Data East, 1984)' },
      { label: "First beat 'em up", value: 'Kung-Fu Master (Irem, 1984)' },
      { label: 'Defining title', value: 'Street Fighter II (Capcom, 1991)' },
      { label: 'Key developers', value: 'Capcom, Namco, Technos, Data East' },
    ],
    sections: [
      {
        title: 'Overview',
        html: `<p>Fighting games are competitive games where two characters — player-controlled or AI — battle using precise inputs, special moves, and combo sequences. Health bars measure progress toward victory. Beat 'em ups (brawlers) take the same martial arts aesthetic into a side-scrolling format where one or two players fight through waves of enemies. Both genres share a commitment to character diversity, readable animation, and the primacy of learning to read and counter an opponent's behaviour.</p>`
      },
      {
        title: 'History',
        html: `<p>Data East's <strong>Karate Champ</strong> (1984) was the first dedicated one-on-one fighting game, using two joysticks to control a karateka through a tournament. Konami's <em>Yie Ar Kung-Fu</em> (1985) added multiple opponents with distinct fighting styles, enriching the challenge.</p>
<p>Simultaneously, Irem's <strong>Kung-Fu Master</strong> (1984) — adapted from a Bruce Lee film — defined the side-scrolling brawler. A hero fights through five floors of a building, kicking and punching waves of goons. Technos Japan's <strong>Double Dragon</strong> (1987) added two-player cooperation, creating the couch co-op brawling tradition that made arcades genuinely social spaces.</p>
<p>Capcom's <strong>Street Fighter</strong> (1987) introduced six attack buttons and special moves executed by joystick motions — the quarter-circle fireball that defined fighting game controls forever. <strong>Street Fighter II: The World Warrior</strong> (1991) is one of the most significant games ever made: eight selectable world warriors each with unique move sets, combo systems discovered by the player community rather than formally designed, and a versus mode that turned arcades into battlegrounds. Street Fighter II earned over $1.5 billion in arcade revenue and sparked a fighting game golden age through the early 1990s.</p>`
      },
      {
        title: 'Mechanics',
        html: `<p>Fighting games operate on frame data — the precise number of game frames each action takes. Attacks have startup frames (before the hitbox activates), active frames (when the hit can connect), and recovery frames (vulnerability after the attack). Expert players memorise these to maximise offensive pressure and punish opponents' mistakes. The skill ceiling is effectively infinite: every action by both players simultaneously branches into dozens of possible game states.</p>
<p>Beat 'em up mechanics are simpler by design: jump attacks, grab throws, and crowd-control moves let players manage groups of enemies. Enemy AI follows readable patterns, rewarding observation and positional play over frame-perfect execution.</p>`
      },
      {
        title: 'Cultural Impact',
        html: `<p>Street Fighter II created competitive gaming culture as we understand it. Players gathered around cabinets to watch skilled players; challenger coins queued opponents on the screen bezel. The tier list, the tournament, the grudge match — all established around Street Fighter II in arcades before the internet existed. EVO, now the world's largest fighting game tournament, traces its lineage directly to these gatherings. Beat 'em ups created the cooperative couch-gaming tradition — two players, side by side, clearing the screen together — that defined a generation of shared gaming memories.</p>`
      }
    ]
  },

  {
    id: 'puzzle',
    name: 'Puzzle & Maze Games',
    shortName: 'Puzzle',
    era: '1973 – present',
    subtitle: "Logic, patterns, and labyrinths — gaming's most universal appeal",
    description: "Puzzle and maze games challenge players with spatial reasoning and logic. Pac-Man transformed maze navigation into a global cultural phenomenon. Tetris became the most widely played game in history. The genre's elegant simplicity achieves universal appeal across ages and cultures like no other.",
    genres: ['Maze', 'Platform / Puzzle', 'Puzzle', 'Puzzle / Action', 'Puzzle / Platform', 'Racing / Maze'],
    image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9c/Typical_Tetris_Game.svg/250px-Typical_Tetris_Game.svg.png',
    imageCaption: 'A Tetris game board — the iconic stacking puzzle invented by Soviet programmer Alexey Pajitnov in 1984–85.',
    imageAlt: 'Diagram of a typical Tetris game board with tetromino pieces stacked',
    imageLicense: 'Public Domain',
    stats: [
      { label: 'Most iconic maze game', value: 'Pac-Man (Namco, 1980)' },
      { label: 'Best-selling puzzle game', value: 'Tetris (500M+ across platforms)' },
      { label: 'Tetris creator', value: 'Alexey Pajitnov, 1984–85' },
      { label: 'Pac-Man cabinets sold', value: '400,000+ worldwide' },
    ],
    sections: [
      {
        title: 'Overview',
        html: `<p>Puzzle games challenge players with problems requiring logic, pattern recognition, and spatial reasoning rather than physical reflexes. Maze games add real-time pressure by placing threats — enemies with distinct AI behaviours — within navigational environments. The two sub-genres frequently converge: Pac-Man is simultaneously a maze navigation challenge and a pattern-recognition puzzle. Together they represent gaming's clearest proof that elegant, simple mechanics can achieve universal appeal across every demographic.</p>`
      },
      {
        title: 'History',
        html: `<p>Maze games have roots in the earliest computing. <strong>Maze War</strong> (1973–74), developed at NASA Ames Research Center, was among the first first-person perspective games — players navigated a wire-frame maze shooting each other in what may be the first networked multiplayer game. The concept spread to PLATO, where multiple maze games offered early multiplayer experiences.</p>
<p><strong>Pac-Man</strong> (Namco, 1980), designed by Toru Iwatani, reinvented the maze game. Iwatani deliberately designed a game to attract women and couples to arcades — spaces dominated by Space Invaders' military aesthetics. He succeeded beyond imagination: over 400,000 Pac-Man cabinets were sold worldwide, making it the highest-grossing arcade game in history. The four ghost characters — Blinky, Pinky, Inky, and Clyde — each had distinct AI target behaviours that players could learn and exploit, transforming maze navigation into a puzzle of pattern prediction.</p>
<p>Hiroyuki Imabayashi's <strong>Sokoban</strong> (1982) introduced the box-pushing puzzle mechanic that remains influential in game design. <strong>Boulder Dash</strong> (First Star Software, 1984) combined mining with emergent puzzle logic. The genre's most successful title came from an unlikely source: Soviet programmer <strong>Alexey Pajitnov</strong> created Tetris in 1984–85 at the Dorodnitsyn Computing Centre in Moscow, inspired by a pentomino board game. Released for Game Boy in 1989, it sold 35 million units with the handheld and has since been played by an estimated one billion people across all platforms.</p>`
      },
      {
        title: 'Mechanics',
        html: `<p>Puzzle games reward systematic thinking. The best puzzle designs have rules simple enough to grasp in seconds but deep enough to surprise players for hours. Tetris achieves this through one rule — complete horizontal lines to clear them — which generates infinite emergent complexity as pieces arrive at increasing speed. Pac-Man's maze is solved by understanding ghost AI: each ghost has a different target tile calculation, and understanding this transforms panicked running into confident ghost manipulation.</p>`
      },
      {
        title: 'Cultural Impact',
        html: `<p>Pac-Man's cultural reach extended far beyond gaming. Merchandise, an animated TV series, a number-one pop song ("Pac-Man Fever," 1982), and decades of appearances made the yellow circle one of the 20th century's most recognised images worldwide. Tetris has been estimated to have been played by over a billion people across all platforms and adaptations. Its influence reaches into cognitive science: "the Tetris effect" — game imagery persisting in the mind after extended play — has been studied by researchers investigating memory consolidation, PTSD treatment, and spatial reasoning. Few games can claim to have contributed to clinical psychology.</p>`
      }
    ]
  },

  {
    id: 'racing',
    name: 'Racing Games',
    shortName: 'Racing',
    era: '1974 – present',
    subtitle: "Speed, skill, and hardware innovation — the arcade's most spectacular genre",
    description: "Racing games simulate vehicular competition. From Gran Trak 10's first digital circuit in 1974 to Pole Position's photorealistic Fuji Speedway in 1982, the genre drove some of the most spectacular hardware innovations in arcade history and created the most immersive cabinet experiences of their era.",
    genres: ['Racing', 'Racing / Maze', 'Racing / Shooter'],
    image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/be/Pole_Position_in_Computerspielemuseum%2C_Berlin.jpg/250px-Pole_Position_in_Computerspielemuseum%2C_Berlin.jpg',
    imageCaption: "Pole Position (1982) cabinet at Berlin's Computerspielemuseum — the highest-grossing arcade game in North America in 1983.",
    imageAlt: "Pole Position arcade cabinet on display at the Computer Games Museum in Berlin",
    imageLicense: 'CC BY-SA 4.0',
    stats: [
      { label: 'First racing video game', value: 'Gran Trak 10 (Atari, 1974)' },
      { label: 'First 3D perspective', value: 'Night Driver (Atari, 1976)' },
      { label: 'Top-grossing NA arcade, 1983', value: 'Pole Position (Namco)' },
      { label: 'Key developers', value: 'Namco, Sega (Yu Suzuki), Atari' },
    ],
    sections: [
      {
        title: 'Overview',
        html: `<p>Racing games simulate the experience of piloting vehicles in competitive or time-trial formats. The genre has consistently driven hardware innovation: arcade racing games pioneered sprite scaling, super scaler technology, force-feedback steering wheels, and 3D polygon rendering long before these technologies reached home computers. The physical arcade cabinet — wheel, pedals, seat — made racing games uniquely immersive, transforming a game into a full-body experience unmatched by any other genre.</p>`
      },
      {
        title: 'History',
        html: `<p>Electromechanical driving arcade machines predate video games entirely. Sega's cabinet games of the 1960s and Chicago Coin's <em>Speedway</em> (1969) used mechanical displays driven by gears and motors. Atari's <strong>Gran Trak 10</strong> (1974) brought racing to a digital raster monitor with a top-down track, steering wheel, and gear shift — inputs that justified the full cabinet format.</p>
<p><strong>Night Driver</strong> (Atari, 1976) pioneered first-person perspective racing — white roadside markers rushing toward the player simulated forward motion convincingly. <strong>Turbo</strong> (Sega, 1981) used a dedicated custom chip for sprite scaling to create genuine speed sensation. Namco's <strong>Pole Position</strong> (1982) established the definitive template: a real racing circuit (Fuji Speedway), qualifying laps, competitor cars, and spectacular crashes. Pole Position was the highest-grossing arcade game in North America in 1983.</p>
<p>Sega's <strong>Hang-On</strong> (1985), designed by Yu Suzuki, introduced a motorcycle cabinet players physically leaned to steer. Using Sega's new Super Scaler hardware running at 60 fps, it created a sense of speed that home technology couldn't match for a decade. Suzuki followed with <em>OutRun</em> (1986) — racing as lifestyle fantasy, with branching routes, a passenger girlfriend, and a radio-cassette soundtrack whose three tracks players chose at the start.</p>`
      },
      {
        title: 'Mechanics',
        html: `<p>Arcade racing games balance speed illusion against mechanical simplicity. Rubber-band AI — opponents that accelerate when the player pulls ahead — keeps races competitive regardless of skill level. Checkpoint systems and time limits create urgency without frustrating beginners. The mastery ceiling involves racing line memorisation and braking point optimisation. Simulation racing games (flourishing on home computers from the late 1980s) replaced arcade accessibility with realistic tyre models, gear management, and physics that rewarded genuine driving knowledge.</p>`
      },
      {
        title: 'Cultural Impact',
        html: `<p>Racing games were responsible for the most spectacular hardware in arcade history. Sega's super scaler boards, Namco's System 21 polygon hardware (powering <em>Winning Run</em> in 1988 — the first polygon racing game), and the force-feedback steering wheel became the calling cards of the premium arcade experience. Yu Suzuki's <em>OutRun</em> remains a beloved object of 1980s nostalgia: its Ferrari Testarossa, its branching routes, and its three-song soundtrack have been re-released, remixed, and celebrated repeatedly in the decades since. Pole Position's television-style presentation — camera panning across the starting grid, a voiced announcer — established racing games as the genre most committed to cinematic spectacle.</p>`
      }
    ]
  },

  {
    id: 'sports',
    name: 'Sports Games',
    shortName: 'Sports',
    era: '1958 – present',
    subtitle: "From Tennis for Two to simulation — the genre that launched the industry",
    description: "Sports games simulate athletic competition. Pong (1972) — a simplified game of table tennis designed as a training exercise — became the first commercially successful video game and launched the entire industry. Sports games drove console adoption for decades and established the annual franchise model.",
    genres: ['Sports', 'Action / Sports', 'Boxing', 'Wrestling'],
    image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/32/Signed_Pong_Cabinet.jpg/250px-Signed_Pong_Cabinet.jpg',
    imageCaption: 'A signed Pong (1972) arcade cabinet — the first commercially successful video game, which launched the entire industry.',
    imageAlt: 'Signed Pong arcade cabinet from 1972',
    imageLicense: 'CC BY-SA 3.0',
    stats: [
      { label: 'First electronic sports game', value: 'Tennis for Two (1958)' },
      { label: 'First commercial success', value: 'Pong (Atari, 1972)' },
      { label: 'Pong cabinets sold in 1974', value: '19,000+' },
      { label: 'Annual franchise pioneer', value: 'EA Sports (from 1983)' },
    ],
    sections: [
      {
        title: 'Overview',
        html: `<p>Sports games simulate the rules, challenge, and excitement of athletic competition. They span arcade abstractions — where three buttons represent all of basketball — to detailed simulations modelling real athletes' statistics, pitch physics, and coaching strategy. No other genre has been more important to the commercial history of video games: sports games drove console adoption, created the annual franchise release model, and — through Pong — launched the entire industry.</p>`
      },
      {
        title: 'History',
        html: `<p><strong>Tennis for Two</strong> (1958), created by physicist William Higinbotham at Brookhaven National Laboratory, is often cited as the first interactive electronic game. Displayed on an oscilloscope at a public open house, it showed a sideways tennis court with a ball following a realistic parabolic arc. Higinbotham had no commercial ambitions — he simply wanted something more interesting than static displays. Over 400 visitors played it on the day.</p>
<p>Atari's <strong>Pong</strong> (1972) was deliberately simple. Allan Alcorn designed it as a training exercise assigned by Nolan Bushnell — a ball bouncing between two paddles. Bushnell deployed a prototype in a Sunnyvale bar; it broke down within weeks because the coin box had overflowed. Atari sold 19,000 Pong cabinets in 1974 alone. The home version, released through Sears in 1975, sold 150,000 units in its first year. Pong proved the home market existed.</p>
<p>Sports titles multiplied through the late 1970s and early 1980s. <strong>Football</strong> (Atari, 1978) rendered players as Xs and Os on a top-down field — the first American football video game. Mattel's Intellivision launched with baseball and football simulations designed to outclass Atari. Activision Tennis (1981) impressed reviewers with physics quality that seemed impossible on the 2600's hardware. Nintendo's <strong>Mike Tyson's Punch-Out!!</strong> (1987) transformed boxing into a pure pattern-recognition challenge, becoming one of the NES's most beloved titles.</p>`
      },
      {
        title: 'Mechanics',
        html: `<p>Sports games face a fundamental design tension: real sports are performed by trained athletes whose physical capabilities cannot be replicated by pressing buttons. Great sports game design abstracts skill into learnable mechanics — timing windows, trajectory prediction, strategic decisions — that create genuine mastery. Arcade sports games prioritise accessibility and spectacle; simulation sports games prioritise fidelity. The best examples of both styles achieve deep engagement through entirely different means.</p>`
      },
      {
        title: 'Cultural Impact',
        html: `<p>Pong is the origin myth of video games — the demonstration that interactive electronic entertainment could be commercially viable, that consumers would pay to play at home, and that simple competitive mechanics have universal appeal. The sports franchise model pioneered by EA Sports — licensed athletes, annual roster updates, incremental improvements — became the most commercially reliable strategy in gaming history. FIFA/EA FC, Madden, and NBA 2K consistently rank among the top-selling titles worldwide every year, and this model of continuous annual engagement traces its lineage directly back to those first digital sports simulations of the 1970s and 1980s.</p>`
      }
    ]
  },

  {
    id: 'strategy',
    name: 'Strategy & Simulation',
    shortName: 'Strategy',
    era: '1958 – present',
    subtitle: "Long-term thinking, emergent systems, and the joy of complexity",
    description: "Strategy and simulation games reward planning, resource management, and systems thinking. From chess programs to Civilization, SimCity to X-COM, these games challenge players to manage complexity — and created gaming's deepest intellectual traditions and most devoted communities.",
    genres: ['City Building / Simulation', 'Educational', 'Educational / Strategy', 'Simulation', 'Space Trading / Simulation', 'Strategy', 'Strategy / Action', 'Action / Strategy'],
    image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/67/Bos_wars_2_5.png/250px-Bos_wars_2_5.png',
    imageCaption: 'Bos Wars, an open-source real-time strategy game illustrating the base-building and unit management mechanics central to the genre.',
    imageAlt: 'Bos Wars real-time strategy game screenshot showing base construction and units',
    imageLicense: 'GPL v2+',
    stats: [
      { label: 'First chess program', value: 'Bernstein Chess (IBM, 1957)' },
      { label: 'City sim origin', value: 'SimCity (Maxis/Will Wright, 1989)' },
      { label: 'Defining 4X game', value: 'Civilization (Meier/Shelley, 1991)' },
      { label: 'Key creators', value: 'Sid Meier, Will Wright, Chris Crawford' },
    ],
    sections: [
      {
        title: 'Overview',
        html: `<p>Strategy games require planning and decision-making over longer time horizons than action games, trading immediate reflex demands for deeper intellectual engagement. Simulation games model real-world systems — cities, economies, armies, ecosystems — allowing players to understand and manipulate complexity emergently. The two genres overlap significantly: Civilization simulates the sweep of human history as a strategic competition; SimCity simulates civic management as an open-ended strategy challenge with no defined end state.</p>`
      },
      {
        title: 'History',
        html: `<p>Computer chess programs predated the video game industry. Claude Shannon's 1950 paper "Programming a Computer for Playing Chess" laid the theoretical foundation. IBM's <strong>Bernstein Chess Program</strong> (1957) was the first complete chess program capable of playing a legal game. Chess programming became a benchmark for artificial intelligence for decades, culminating in IBM Deep Blue defeating world champion Garry Kasparov in 1997.</p>
<p>Wargames on the PLATO network inspired the first commercial strategy titles. Walter Bright's <strong>Empire</strong> (1977) — a text-based world conquest game — influenced everything from Risk adaptations to Civilization. Board game publisher Avalon Hill computerised its war games through the early 1980s, building a dedicated strategy audience on Apple II and TRS-80 machines.</p>
<p>Sid Meier's <strong>Pirates!</strong> (1987) proved that complex simulation games could have mainstream appeal through personality and humour. Meier followed with <strong>Civilization</strong> (1991), co-designed with Bruce Shelley — a turn-based empire-building game spanning the Bronze Age to the space age. Civilization consumed players for entire nights; "one more turn" became gaming's most recognisable compulsion and the defining shorthand for compelling design.</p>
<p>Will Wright's <strong>SimCity</strong> (1989) created the city-building simulation genre. Players zoned land, built infrastructure, managed budgets, and survived disasters in an open-ended simulation with no win condition. Wright's design philosophy — emergent complexity from simple rules, the player as scientist and the game as laboratory — influenced game design theory profoundly and eventually produced The Sims, one of the best-selling franchises in gaming history.</p>`
      },
      {
        title: 'Mechanics',
        html: `<p>Turn-based strategy games give players unlimited time to plan, rewarding deep analysis and long-term thinking. Real-time strategy (RTS) adds time pressure, demanding faster decision-making and parallel task management. 4X games (Explore, Expand, Exploit, Exterminate) offer the broadest scope: players build civilisations from scratch across historical epochs. Management simulations replace combat with resource allocation and systemic optimisation — understanding feedback loops and emergent behaviour rather than defeating opponents.</p>`
      },
      {
        title: 'Cultural Impact',
        html: `<p>Civilization is regularly cited as a game that genuinely changed how players think about history, geography, and political systems. Academics have assigned it in courses on international relations. The "Civilization Paradox" — a game designed to be educational about history that is simultaneously deeply inaccurate in its simplifications — sparked productive debate about games as historical models and metaphors. SimCity influenced real urban planners and became a standard in urban design education. Will Wright's design philosophy — games as systems to understand rather than stories to consume — remains the most intellectually ambitious tradition in the medium.</p>`
      }
    ]
  },

  {
    id: 'action',
    name: 'Action Games',
    shortName: 'Action',
    era: '1972 – present',
    subtitle: "Fast reflexes, high stakes — the foundation of video game design",
    description: "Action games are fast-paced games demanding quick reflexes and real-time decision making. The broadest and most commercially dominant genre in gaming, action games established the visual and mechanical grammar that nearly every other genre builds upon.",
    genres: ['Action', 'Isometric Action', 'Laserdisc / Action', 'Stealth / Action'],
    image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5e/Space_Invaders.JPG/250px-Space_Invaders.JPG',
    imageCaption: 'Space Invaders (1978) cocktail table arcade cabinet — defining action game of its era and the catalyst for the entire video game industry.',
    imageAlt: 'Space Invaders cocktail table arcade cabinet from 1978',
    imageLicense: 'CC BY-SA 3.0',
    stats: [
      { label: 'Commercial catalyst', value: 'Space Invaders (Taito, 1978)' },
      { label: 'US arcade revenue, 1982', value: '$8 billion+' },
      { label: 'Broadest sub-genres', value: "Shmups, Platformers, Fighting", },
      { label: 'Core design concept', value: 'Flow state (Csikszentmihalyi)' },
    ],
    sections: [
      {
        title: 'Overview',
        html: `<p>Action games are games where success depends primarily on the player's physical reflexes and hand-eye coordination in real time, rather than planning or puzzle-solving. They respond to input immediately, create instant consequences for every decision, and present escalating challenge through increasing enemy speed, density, or attack complexity. Action is video gaming's broadest and most commercially dominant genre — shoot 'em ups, platformers, and fighting games are all sub-genres — and its default mode: most games, regardless of primary genre, incorporate action mechanics in some form.</p>`
      },
      {
        title: 'History',
        html: `<p>The action game crystallised with <strong>Space Invaders</strong> (Taito, 1978) — the archetype of the core action loop: fast responsive input, escalating enemy pressure, lives as resilience measure, score as mastery measure. When Taito struggled to press enough 100-yen coins to meet demand in Japan, the scale of the phenomenon became clear. In North America, licensed to Midway, it fundamentally changed how businesses thought about interactive entertainment.</p>
<p>Atari's <strong>Centipede</strong> (1980) and <strong>Missile Command</strong> (1980) refined the formula. Dave Theurer designed Missile Command — defending cities against nuclear warheads — while reportedly suffering recurring nightmares about nuclear war during development. The game's impossible-to-win design (the missiles always eventually overwhelm the defences) built genuine dread into a score-attack structure.</p>
<p>Williams' <strong>Defender</strong> (1981) represented action game design at peak complexity: a scrolling planet, humanoids to protect, five simultaneous controls, and wave after wave of escalating enemies. Briefly the highest-grossing arcade game ever made, it attracted players who found simpler games insufficiently demanding. Its difficulty was part of the appeal.</p>
<p>The isometric perspective opened new dimensions. Sega's <strong>Zaxxon</strong> (1982) used forced perspective to create convincing 3D space. Q*bert (1982) combined isometric movement with colour-changing puzzle logic. Donkey Kong Jr. (1982) introduced climbing and swinging that diversified action movement beyond running and jumping.</p>`
      },
      {
        title: 'Mechanics',
        html: `<p>Action game design rests on three pillars: <strong>control</strong> (tight, responsive input that rewards mastery), <strong>feedback</strong> (immediate visual and audio response to every player action), and <strong>escalation</strong> (increasing challenge that creates a continuous growth curve matching player skill). Lives and continues manage difficulty accessibility; score systems motivate replay and competition. The best action games create what psychologist Mihaly Csikszentmihalyi called "flow state" — a condition where challenge precisely matches skill, producing deep absorption and intrinsic satisfaction.</p>`
      },
      {
        title: 'Cultural Impact',
        html: `<p>US arcades generated over $8 billion in 1982 — more than Hollywood box office and recorded music combined — almost entirely from action games. Space Invaders, Pac-Man, Donkey Kong, and Defender were the four pillars of this golden age. The psychological concepts action games pioneered — flow state, challenge-skill balance, variable reward schedules — became the foundational vocabulary of game design as an academic and professional discipline. Every game that asks you to react fast, survive pressure, and improve through repetition stands on the tradition built in arcades between 1978 and 1985.</p>`
      }
    ]
  },
  {
    id: 'simulation',
    name: 'Simulation',
    shortName: 'Simulation',
    era: '1980 – present',
    subtitle: 'Modelling reality — from cockpits and cities to entire civilisations',
    description: 'Simulation games model real systems in detail, prizing fidelity and depth over arcade immediacy. From flight simulators demanding hours of study to city builders where the player is planner rather than hero, the genre asks players to understand a system rather than beat it.',
    genres: ['Flight Simulator', 'Vehicle Simulator', 'City Builder', 'Business / Tycoon', 'Life Simulation', 'God Game', 'Sports Management'],
    image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/77/Airbus_A320_FlightGear_3.7.png/250px-Airbus_A320_FlightGear_3.7.png',
    imageCaption: 'FlightGear, the open-source flight simulator, in the tradition of Microsoft Flight Simulator — the genre that made fidelity itself the goal.',
    imageAlt: 'Screenshot of an Airbus A320 cockpit and wing in the FlightGear open-source flight simulator',
    imageLicense: 'GPL',
    stats: [
      { label: 'Foundational title', value: 'Flight Simulator (subLOGIC, 1980)' },
      { label: 'Defining title', value: 'SimCity (Maxis, 1989)' },
      { label: 'Best-selling PC game', value: 'The Sims (Maxis, 2000)' },
      { label: 'Key developers', value: 'Maxis, MicroProse, subLOGIC, Bullfrog' },
    ],
    sections: [
      {
        title: 'Overview',
        html: '<p>Simulation games are defined less by a common set of mechanics than by a shared ambition: to model a real system faithfully enough that understanding the model becomes the pleasure. A flight simulator does not reward reflexes so much as procedure — checklists, instruments, and the patience to learn what each switch does. A city builder gives the player no avatar and no enemies, only a system of traffic, taxation, zoning, and pollution to be understood and nudged. What unites them is that mastery means comprehension rather than execution.</p><p>This makes simulation the genre least concerned with being a game in the conventional sense. Many of its most celebrated titles have no win condition at all: SimCity cannot be beaten, only sustained or ruined, and The Sims simply continues. The genre trades victory for the deeper satisfaction of watching a complex system respond intelligibly to your decisions — a pleasure closer to gardening or engineering than to combat.</p>',
      },
      {
        title: 'History',
        html: '<p>The genre began in the air. subLOGIC\'s Flight Simulator (1980) brought genuine aviation modelling to home computers, and when Microsoft licensed and published it the series became one of the longest-running in software history, prized by hobbyists who studied real aircraft manuals to fly it properly. MicroProse, founded by "Wild Bill" Stealey and Sid Meier, built a business on military vehicle simulation through the 1980s.</p><p>Then Will Wright changed what a simulation could be. SimCity (1989) had no combat, no protagonist, and no ending — a proposition publishers found so baffling that it struggled to find a home — yet it became a phenomenon and spawned an entire lineage of Sim titles at Maxis. Peter Molyneux\'s Populous (1989) meanwhile invented the god game, casting the player as an unseen deity shaping terrain. Wright would go on to produce The Sims (2000), a simulation of ordinary domestic life that became the best-selling PC game ever made and drew an audience of players who had never considered themselves gamers.</p>',
      },
      {
        title: 'Mechanics',
        html: '<p>Simulation mechanics are built from interlocking systems rather than discrete challenges. The player typically has indirect control: a mayor cannot place a citizen, only zone the land and hope; a god cannot command a follower, only raise the ground beneath them. This indirection is deliberate, forcing the player to work with a system\'s logic instead of overriding it, and it produces the genre\'s characteristic emergent surprises — the traffic jam nobody designed, the family disaster nobody scripted.</p><p>Fidelity is the other axis. Hardcore simulators pursue accuracy relentlessly, modelling stall behaviour, fuel burn, and instrument failure, and they expect the player to consult documentation. Lighter simulations abstract aggressively to keep the systems legible. The genre\'s enduring internal tension is exactly this: how much realism can be added before the model stops being playable, and how much can be stripped before it stops being a simulation.</p>',
      },
      {
        title: 'Cultural Impact',
        html: '<p>Simulation has repeatedly pulled video games toward audiences that other genres could not reach. SimCity was adopted by educators and even urban planning courses, giving games an unusual claim to intellectual respectability, and The Sims reached an enormous audience — notably including many women and older players who had been alienated by the shooting and sports titles dominating the market. Its commercial success made it, for years, the best-selling PC game in the world.</p><p>The genre also proved something the industry has never entirely absorbed: that a game does not need a win condition, an antagonist, or a protagonist to be compelling. That argument, made most forcefully by Will Wright, opened the door for the management, builder, and life-simulation games that remain among the most played in the world, and it stands as one of the clearest cases of the medium expanding by refusing its own conventions.</p>',
      },
    ],
  },
  {
    id: 'rhythm',
    name: 'Rhythm & Music Games',
    shortName: 'Rhythm',
    era: '1996 – present',
    subtitle: 'Playing to the beat — the genre that turned the arcade into a stage',
    description: 'Rhythm games ask the player to match inputs to music with precise timing. Born in Japan in the late 1990s and exploding with Dance Dance Revolution, the genre turned playing games into a physical, public performance — and made the arcade a stage.',
    genres: ['Rhythm', 'Dance', 'Music Creation', 'Instrument Simulation', 'Beatmatching'],
    image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/45/Dance_Dance_Revolution_Extreme_arcade_machine_arrow_panel.png/250px-Dance_Dance_Revolution_Extreme_arcade_machine_arrow_panel.png',
    imageCaption: 'The arrow panel of a Dance Dance Revolution Extreme arcade machine — the genre\'s most recognisable interface, played with the feet.',
    imageAlt: 'The illuminated four-arrow foot panel of a Dance Dance Revolution arcade machine',
    imageLicense: 'CC BY-SA 4.0',
    stats: [
      { label: 'Foundational title', value: 'PaRappa the Rapper (NanaOn-Sha, 1996)' },
      { label: 'Defining title', value: 'Dance Dance Revolution (Konami, 1998)' },
      { label: 'Key hardware', value: 'Konami System 573 arcade board' },
      { label: 'Key developers', value: 'Konami, NanaOn-Sha, Sega, Namco' },
    ],
    sections: [
      {
        title: 'Overview',
        html: '<p>Rhythm games are built on a single, elegant premise: the game tells you when to press, and your score depends on how precisely you obey. Notes, arrows, or symbols scroll toward a target line, and the player must hit the corresponding input at the exact moment of arrival, with timing windows typically graded — perfect, great, good, miss — so that the difference between competence and mastery is measured in fractions of a second.</p><p>What distinguishes the genre is that the music is not accompaniment but the game itself. In most games a soundtrack decorates the action; in a rhythm game the soundtrack <em>is</em> the level design, and playing well means the player is, in effect, performing the song. This gives the genre a directness of feedback that few others match — success sounds and feels correct, and failure is immediately, audibly wrong.</p>',
      },
      {
        title: 'History',
        html: '<p>The genre crystallised in Japan in the late 1990s. NanaOn-Sha\'s PaRappa the Rapper (1996) established the core call-and-response loop with a distinctive visual style, and Konami\'s Beatmania (1997) brought DJ-style turntable play to arcades. But the explosion came with Dance Dance Revolution in 1998, which replaced buttons with a floor panel and demanded that players move their feet.</p><p>DDR transformed the arcade. Its machines were loud, brightly lit, and impossible to play discreetly, so a skilled player attracted a crowd — and the genre turned gaming into public spectacle in a way nothing had before. Konami built an entire ecosystem of rhythm hardware around the concept, much of it running on its System 573 board, and the "Bemani" family of games became a pillar of the Japanese arcade through its late golden years. The Western guitar-and-drum boom of the mid-2000s, and the rhythm titles that followed, all descend from this moment.</p>',
      },
      {
        title: 'Mechanics',
        html: '<p>The genre\'s mechanical core is timing precision measured against a fixed, unyielding tempo. Because the music cannot slow down for the player, rhythm games are among the least forgiving in the medium: there is no cover to hide behind and no pausing to think, only the next note arriving exactly on schedule. Difficulty scales by increasing note density, introducing irregular patterns, and demanding inputs that cross or overlap physically.</p><p>Interface is unusually central here. A rhythm game is defined as much by what the player touches as by its software — a dance pad, a turntable, a plastic guitar, a set of drums — and the physicality of that interface determines the whole experience. This makes the genre one of the few where the peripheral is not an accessory but the entire point, and it explains why so many of its landmark titles were built around bespoke hardware.</p>',
      },
      {
        title: 'Cultural Impact',
        html: '<p>Rhythm games changed what playing a video game in public looked like. A skilled Dance Dance Revolution player is visibly, athletically performing, and the machines drew spectators, competitions, and a genuine subculture — one of the earliest examples of gaming as a physical, social, watchable activity rather than a solitary one. The genre also anticipated by nearly a decade the motion-control boom that Nintendo would later bring to living rooms.</p><p>Its influence on how games use music has been equally lasting. By making the soundtrack the mechanical substance of play rather than its background, rhythm games licensed a generation of designers to think about audio as a system rather than a decoration — and by proving that people would pay to dance in an arcade, they helped keep the coin-op business alive well past the point at which home consoles had otherwise made it redundant.</p>',
      },
    ],
  },
  {
    id: 'light-gun-shooter',
    name: 'Light-Gun Shooters',
    shortName: 'Light Gun',
    era: '1972 – present',
    subtitle: 'Point at the screen and pull the trigger — the arcade\'s most physical genre',
    description: 'Light-gun shooters put a gun-shaped controller in the player\'s hands and a screen full of targets in front of them. On rails and unrelenting, the genre defined the arcade\'s later years — and died with the CRT televisions its technology depended upon.',
    genres: ['Light-Gun Shooter', 'Rail Shooter', 'Shooting Gallery', 'Horror Shooter'],
    image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b9/Light_gun_R%C3%A9tro_Arcade.jpg/250px-Light_gun_R%C3%A9tro_Arcade.jpg',
    imageCaption: 'A light gun in use at a retro arcade cabinet — the genre\'s defining interface, aimed directly at the screen.',
    imageAlt: 'A red pistol-shaped light gun controller being aimed at a retro arcade cabinet screen',
    imageLicense: 'CC BY 4.0',
    stats: [
      { label: 'Earliest home light gun', value: 'Magnavox Odyssey Shooting Gallery (1972)' },
      { label: 'Defining home title', value: 'Duck Hunt (Nintendo, 1984)' },
      { label: 'Defining arcade title', value: 'Virtua Cop (Sega, 1994) / Time Crisis (Namco, 1995)' },
      { label: 'Key developers', value: 'Sega, Namco, Konami, Nintendo' },
    ],
    sections: [
      {
        title: 'Overview',
        html: '<p>Light-gun shooters hand the player a gun-shaped controller and ask them to aim it at the screen itself. Movement is almost always automatic — the camera advances along a fixed path, which is why the genre is often called the rail shooter — leaving the player with a single responsibility: point and shoot, accurately and fast. Ammunition must be reloaded, usually by pointing off-screen and pulling the trigger, and enemies fire back on a timer that punishes hesitation.</p><p>Stripping away movement is the genre\'s central design decision, and its greatest strength. Freed from navigation, the player can be relentlessly overwhelmed with targets, and the designer retains total control over pacing, framing, and spectacle. The result is pure, escalating tension, delivered in short bursts perfectly suited to the economics of the arcade.</p>',
      },
      {
        title: 'History',
        html: '<p>Light guns predate the video game industry itself, with electro-mechanical shooting galleries appearing in arcades long before screens did. The Magnavox Odyssey offered a rifle accessory in 1972, and Nintendo\'s NES Zapper made the genre a household fixture with Duck Hunt (1984), which sold roughly 28 million copies and taught a generation to point plastic guns at the family television.</p><p>The genre reached its peak in the 1990s arcade. Sega\'s Virtua Cop (1994) brought polygonal 3D to light-gun shooting, and its House of the Dead series turned the format toward horror. Namco\'s Time Crisis (1995) added a foot pedal that let players duck into cover, injecting a rhythm of exposure and retreat that transformed the genre\'s tension. Konami\'s Lethal Enforcers brought digitised photographic graphics and a controversy over realism. For a decade these machines — loud, physical, and impossible to replicate at home — were among the strongest arguments the arcade had left.</p>',
      },
      {
        title: 'Mechanics',
        html: '<p>The classic light gun works by exploiting the CRT screen itself. When the trigger is pulled, the game blanks the screen for a single frame and redraws only the targets as bright shapes; a photodiode in the gun barrel detects whether it is pointed at brightness at that instant, registering a hit. It is an elegant trick that requires almost no hardware — and it is precisely why these games no longer work on modern displays, since LCD and plasma screens do not refresh in the manner the technique depends upon.</p><p>Design-wise, the genre lives on reload management, target prioritisation, and the punishing accuracy of its enemies. Because the player cannot dodge, survival depends on clearing threats before their attack timers expire, and the best games — Time Crisis above all — layer cover mechanics on top, turning a shooting gallery into a rhythm of hiding, popping out, and firing under pressure.</p>',
      },
      {
        title: 'Cultural Impact',
        html: '<p>No genre was more physical, more social, or more visible in the arcade. A light-gun cabinet demanded that the player stand, aim, and perform, and its cabinets — often with two guns bolted to the front — made co-operative play the default rather than an afterthought. For much of the 1990s these machines were the clearest demonstration of what an arcade could offer that a living room could not.</p><p>The genre also proved unusually mortal. Its dependence on CRT technology meant that when flat-panel displays replaced tube televisions, an entire library of games became effectively unplayable on modern hardware — a preservation problem with few parallels in the medium. Duck Hunt, one of the best-selling games ever made, cannot be played as intended on a contemporary TV. The light-gun shooter is thus a rare case of a genre killed not by changing taste but by the quiet obsolescence of the display technology it was built upon.</p>',
      },
    ],
  },
  {
    id: 'roguelike',
    name: 'Roguelikes',
    shortName: 'Roguelike',
    era: '1980 – present',
    subtitle: 'Permanent death, generated dungeons, and the game that has never been finished',
    description: 'Roguelikes generate a new dungeon every time you play and delete your character permanently when you die. Born on university mainframes in 1980, the genre made randomness and loss into design principles — and its ideas now sit inside games of every kind.',
    genres: ['Traditional Roguelike', 'Roguelite', 'Dungeon Crawler', 'Permadeath Survival'],
    image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/ff/Nethack.png/250px-Nethack.png',
    imageCaption: 'NetHack, the open-source roguelike in continuous development since 1987 — its dungeon drawn entirely from ASCII characters.',
    imageAlt: 'An ASCII-art dungeon screen from the roguelike game NetHack',
    imageLicense: 'NetHack GPL',
    stats: [
      { label: 'Foundational title', value: 'Rogue (Toy, Wichman, Arnold, 1980)' },
      { label: 'Defining title', value: 'NetHack (NetHack DevTeam, 1987)' },
      { label: 'Core principles', value: 'Procedural generation, permadeath, turn-based movement' },
      { label: 'Key influence', value: 'Dungeons & Dragons and the DEC mainframes it ran on' },
    ],
    sections: [
      {
        title: 'Overview',
        html: '<p>A roguelike generates its world anew each time you play. The dungeon you descend today did not exist yesterday and will never exist again, and the character you are guiding through it will, when they die, be gone permanently — no continues, no reloading, no second chances. These two ideas, procedural generation and permadeath, are the genre\'s foundation, and everything else follows from them.</p><p>The consequence is a peculiar relationship between player and game. Because the dungeon cannot be memorised, mastery is not knowledge of a level but knowledge of a system: what monsters do, how items interact, which risks are survivable. And because death is final, every decision carries genuine weight — a roguelike player is not optimising a route but managing an ongoing crisis, and the story of a run emerges from the choices made under that pressure rather than from anything an author wrote.</p>',
      },
      {
        title: 'History',
        html: '<p>The genre begins with Rogue, written around 1980 by Michael Toy, Glenn Wichman, and later Ken Arnold on the university mainframes of the era. Working with a text terminal and nothing else, they drew a dungeon out of ASCII characters — hashes for corridors, letters for monsters, an @ for the player — and had the computer build a fresh one each session. The influence of Dungeons & Dragons is everywhere in its potions, scrolls, and monsters, but the crucial innovation was letting the machine do the dungeon-mastering.</p><p>Rogue spread across university networks and spawned imitators that took its name: Hack, then NetHack, first released in 1987 and still under active development by its DevTeam decades later — one of the longest continuously maintained programs in existence. Angband, Moria, Ancient Domains of Mystery, and Dungeon Crawl Stone Soup followed, each elaborating the formula into systems of extraordinary depth. These games were free, open, and endlessly modified, and they developed in a culture entirely separate from the commercial industry.</p>',
      },
      {
        title: 'Mechanics',
        html: '<p>The traditional roguelike is turn-based and grid-based: the world moves only when you do, which turns every step into a decision with no time pressure and no excuse. Interaction between systems is prized above scripted content — in NetHack, famously, almost anything you can think to try has been anticipated, from writing words in the dust to dipping items in fountains, and the community\'s maxim that "the DevTeam thinks of everything" reflects a design philosophy of exhaustive systemic depth rather than handcrafted set-pieces.</p><p>Permadeath is what gives all of this teeth. Without it, procedural generation is merely variety; with it, generation becomes danger, since the player cannot rehearse a solution and must instead reason about an unfamiliar situation with everything at stake. Modern "roguelites" soften this by allowing some progress to persist between runs — an accommodation that made the genre commercially viable and that purists regard with suspicion.</p>',
      },
      {
        title: 'Cultural Impact',
        html: '<p>For most of its life the roguelike was a curiosity: free, forbidding, drawn in ASCII, and played by a devoted few. Its ideas then escaped and colonised the entire medium. Procedural generation now appears everywhere from Diablo\'s randomised dungeons to the vast generated universes of modern exploration games, and permadeath — once a bizarre imposition — has become a celebrated feature, revived by an indie generation that recognised how much tension it produces.</p><p>The genre also demonstrates something unusual about software longevity. NetHack has been in continuous development since 1987, maintained by volunteers, and is still being patched and played; Rogue\'s descendants are older than most of the companies that dominate the industry. In an art form obsessed with the new, the roguelike is a reminder that a design can be so fundamentally sound that it never actually needs replacing — only deepening, one turn at a time, for forty years.</p>',
      },
    ],
  },
  {
    id: 'first-person-shooter',
    name: 'First-Person Shooter',
    shortName: 'FPS',
    era: '1990s',
    subtitle: 'A gun, a corridor, and a camera behind your own eyes',
    description: 'The first-person shooter put the player inside the world rather than above it, and in doing so became the defining genre of PC gaming. Its lineage runs from maze crawlers on mainframes through Wolfenstein 3D and Doom — which gave the form its name, its speed and its shareware distribution model — to Quake\'s true 3D engine and Half-Life\'s insistence that a shooter could tell a story without ever taking the camera away from you.',
    genres: ['Corridor Shooter', 'Arena Shooter', 'Tactical Shooter', 'Immersive Sim'],
    image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/78/Freedoom-0.13-uzdoom-4.14.3-screenshot-1.png/250px-Freedoom-0.13-uzdoom-4.14.3-screenshot-1.png',
    imageCaption: 'Freedoom, a free-content game built on the Doom engine, running the genre\'s foundational sprite-and-corridor grammar',
    imageAlt: 'Screenshot of Freedoom showing a first-person view down a corridor with a weapon held at the bottom of the screen',
    imageLicense: 'CC BY-SA 4.0',
    stats: [
      { label: 'Foundational title', value: 'Wolfenstein 3D (id Software, 1992)' },
      { label: 'Defining title', value: 'Doom (id Software, 1993)' },
      { label: 'Core principles', value: 'First-person camera, spatial navigation, ranged combat, level as maze' },
      { label: 'Key influence', value: 'Mainframe maze games and id Software\'s ray-casting renderer' },
    ],
    sections: [
      {
        title: 'The Camera Is the Genre',
        html: '<p>Everything that distinguishes the first-person shooter follows from where the camera sits. Put it behind the player\'s eyes and you cannot see your own character, cannot see behind you, and cannot survey the level from above — which means that spatial awareness stops being a matter of reading a screen and becomes a matter of memory, sound, and turning around at the right moment.</p><p>That single decision generates the genre\'s entire vocabulary. Ambushes work because you cannot see behind you. Corridors are tense because they constrain what you can check. The minimap, the radar, the footstep audio cue and the hitscan weapon all exist to manage information that the camera has deliberately withheld. No other genre makes ignorance so central to its design.</p>',
      },
      {
        title: 'Doom and the Shareware Bomb',
        html: '<p>Wolfenstein 3D established the form in 1992, but Doom in 1993 is where the genre acquired its identity — and, crucially, its distribution. id Software gave the first episode away, free, and let it propagate across bulletin boards, university networks and floppy disks passed between friends, charging only for the remaining episodes. The game did not need a publisher, a retail chain or a marketing budget. It needed a modem.</p><p>The consequences ran far beyond sales. Doom shipped with its data separated from its engine, which meant players could build their own levels; it shipped with deathmatch, which meant they could shoot each other; and it was, for a period, installed on more PCs than Microsoft Windows. The genre and the modding scene and the culture of networked competitive play all arrived at once, in the same package.</p>',
      },
      {
        title: 'From Corridors to Worlds',
        html: '<p>Doom\'s engine was not truly three-dimensional — its levels could not have one room above another, and its enemies were flat sprites rotating to face you. Quake, in 1996, was: real polygonal geometry, true vertical freedom, and a renderer that let the player look up and down. The corridor became a space.</p><p>What followed was a split that still defines the genre. One branch pursued speed and precision, producing the arena shooter — Quake III, Unreal Tournament — in which the map is a machine and mastery is measured in movement. The other pursued immersion, producing Half-Life\'s scripted, seamless, never-interrupted storytelling and the immersive sims that descended from it. Both are recognisably the same genre, and they want almost nothing in common.</p>',
      },
      {
        title: 'The Genre That Ate PC Gaming',
        html: '<p>By the end of the 1990s, the first-person shooter was not a genre on the PC so much as the reason to own one. It drove the graphics card market, justified the 3D accelerator, popularised the mouse-and-keyboard control scheme that remains standard, and provided the technical engines — id Tech, Unreal, GoldSrc, Source — on which an enormous proportion of the rest of the industry was subsequently built.</p><p>Its influence on hardware is difficult to overstate. Consumers bought expensive graphics cards to run shooters; manufacturers built cards to run shooters faster; developers built shooters to exploit the new cards. That loop financed the 3D revolution, and every genre that benefited from cheap polygon rendering — which is to say, all of them — was riding on it.</p>',
      },
    ],
  },
  {
    id: 'real-time-strategy',
    name: 'Real-Time Strategy',
    shortName: 'RTS',
    era: '1990s',
    subtitle: 'Chess, if the other player did not wait for you to finish thinking',
    description: 'Real-time strategy took the war game off the turn-based grid and set it running against a clock. Gather resources, build a base, produce an army, and destroy the enemy — all while they are doing exactly the same thing, at the same moment, and every second you spend deciding is a second they spend acting. Dune II established the template, Command & Conquer and Warcraft made it a phenomenon, and StarCraft turned it into a professional sport.',
    genres: ['Base-Building RTS', '4X Strategy', 'Real-Time Tactics', 'MOBA (descendant)'],
    image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/61/0_A.D._game_screenshot_Discovery.jpg/250px-0_A.D._game_screenshot_Discovery.jpg',
    imageCaption: '0 A.D., a free and open-source historical RTS by Wildfire Games, showing the genre\'s characteristic overhead view and base-building',
    imageAlt: 'Screenshot of the open-source real-time strategy game 0 A.D., showing an overhead view of an ancient settlement with units and buildings',
    imageLicense: 'CC BY-SA 3.0',
    stats: [
      { label: 'Foundational title', value: 'Dune II (Westwood Studios, 1992)' },
      { label: 'Defining title', value: 'StarCraft (Blizzard, 1998)' },
      { label: 'Core principles', value: 'Resource gathering, base building, unit production, simultaneous play' },
      { label: 'Key influence', value: 'Tabletop war games, and the pressure of a clock that never stops' },
    ],
    sections: [
      {
        title: 'Removing the Turn',
        html: '<p>Strategy games had existed for as long as computers had, and they were turn-based because war games are turn-based: you consider, you commit, your opponent responds. Dune II\'s innovation in 1992 was to delete the turn — and in doing so it changed what a strategy game actually tests.</p><p>In a turn-based game, the scarce resource is judgement. Given unlimited time, a sufficiently thoughtful player will find the optimal move. In a real-time strategy game, the scarce resource is <em>attention</em>. Every decision costs time you do not have, and while you are deciding, your opponent\'s economy is growing. The genre therefore rewards a skill that had never previously mattered in strategy gaming: the ability to think correctly while being rushed.</p>',
      },
      {
        title: 'The Loop',
        html: '<p>The classic RTS structure is a self-reinforcing spiral, and it is beautifully simple. Workers gather resources. Resources buy buildings. Buildings produce units and unlock better units. Units defend your workers and kill the enemy\'s. Everything feeds everything else, and any interruption anywhere compounds.</p><p>What makes this a genuine strategic problem rather than an exercise in bookkeeping is that every resource spent on defence is a resource not spent on growth. Build too many soldiers and you fall behind economically; build too few and you die. The whole genre lives inside that tension, and the reason "rush" and "boom" and "turtle" became universal vocabulary is that they are the three coherent answers to a question the design refuses to settle.</p>',
      },
      {
        title: 'StarCraft and the Professionalisation of a Game',
        html: '<p>StarCraft did something no strategy game had done: it achieved a balance between three genuinely asymmetric factions — Terran, Protoss, Zerg — that were not merely reskins of each other but played by different rules entirely. That asymmetry is extraordinarily difficult to balance and it is the reason the game sustained competitive play for two decades.</p><p>In South Korea it became something else again: a televised professional sport with leagues, sponsors, salaried players and a broadcast infrastructure that predated the word "esports" being in common use. Games were watched by audiences in the hundreds of thousands. The skill ceiling proved effectively unreachable, measured in actions per minute that ordinary players could not physically produce.</p>',
      },
      {
        title: 'Decline, and What Grew From It',
        html: '<p>The RTS is no longer a mainstream commercial genre, and the reason is unsentimental: it is extraordinarily demanding. It asks for macro-management and micro-management simultaneously, punishes a moment\'s inattention across a forty-minute match, and offers a new player an experience consisting almost entirely of being defeated by systems they cannot yet see.</p><p>But its DNA did not vanish; it was repackaged. The MOBA — descended directly from a Warcraft III custom map — took the RTS\'s unit control, its item systems and its lane structure, threw away the base-building and the economy, and gave each player exactly one unit to worry about. It became the most-played competitive genre on earth. The RTS did not die so much as get distilled into something the rest of the world was willing to learn.</p>',
      },
    ],
  },
  {
    id: 'mmorpg',
    name: 'MMORPG',
    shortName: 'MMO',
    era: '1990s',
    subtitle: 'A world that keeps running when you log out, full of people you did not choose',
    description: 'The massively multiplayer online role-playing game took the persistent worlds of MUDs and gave them graphics, then handed them to tens of thousands of simultaneous strangers. Ultima Online proved the commercial case in 1997, EverQuest turned it into an obsession, and the genre spent the next decade discovering that the hardest problem in world design is not building the world — it is the people you let into it.',
    genres: ['Persistent World MMO', 'Themepark MMO', 'Sandbox MMO', 'MUD (ancestor)'],
    image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/27/Ryzom_screenshot.png/250px-Ryzom_screenshot.png',
    imageCaption: 'Ryzom, a persistent-world MMORPG whose engine and much of its content were released under free licences',
    imageAlt: 'Screenshot of the MMORPG Ryzom showing a player character in a large open outdoor environment',
    imageLicense: 'CC BY-SA 2.0',
    stats: [
      { label: 'Foundational title', value: 'Ultima Online (Origin Systems, 1997)' },
      { label: 'Defining title', value: 'EverQuest (989 Studios, 1999)' },
      { label: 'Core principles', value: 'Persistence, simultaneous players, character progression, social interdependence' },
      { label: 'Key influence', value: 'MUDs — text-based multi-user dungeons running on university networks' },
    ],
    sections: [
      {
        title: 'The World Does Not Pause',
        html: '<p>Persistence is the whole idea. In a single-player RPG, the world exists only while you are looking at it; close the game and it politely freezes. In an MMORPG it does not. The dragon you failed to kill is still there. So is the player who killed it while you were asleep, wearing its head.</p><p>That one property changes every design decision downstream. Loot must be contested, because everyone wants it and it cannot simply be handed to each player individually. Progression must be long, because a world that everyone finishes is a world nobody stays in. And the game cannot be balanced solely around what is fun for one person, because it is not being played by one person — it is being played by thousands, simultaneously, all pursuing their own interests inside the same simulation.</p>',
      },
      {
        title: 'What Ultima Online Learned the Hard Way',
        html: '<p>Origin\'s ambitions for Ultima Online were extraordinary and largely defeated by its own players. The most famous casualty was the Virtual Ecology — a genuine simulated food chain in which plants grew, herbivores ate them, and carnivores ate the herbivores. Players killed everything on sight, faster than the system could regenerate any level of it, the herbivores were exterminated, the carnivores starved, and the entire model collapsed before launch.</p><p>The lesson generalises far beyond wildlife, and every subsequent MMO absorbed it. A persistent world containing thousands of rational actors will have any exploitable system exhausted immediately — not by griefers but by ordinary players behaving sensibly. Which is why wildlife in every MMO since simply respawns on a timer in a fixed location, in open defiance of the fiction. It is a deliberate, load-bearing lie, and Ultima Online is the reason everyone tells it.</p>',
      },
      {
        title: 'The Time Sink as a Business Model',
        html: '<p>The MMORPG is the genre in which the commercial model most nakedly shapes the design. A subscription is charged per month, which means the game\'s financial interest is not that you enjoy it but that you keep playing it — and those two goals overlap only partially.</p><p>Hence the grind: content calibrated to take a very long time, progression curves that lengthen as you climb them, and rewards gated behind repetition rather than skill. Hence, too, the social architecture, which is the most effective retention mechanism ever devised. A player will quit a game they have tired of. A player will not so easily quit a guild of forty people who are relying on them to show up on Thursday.</p>',
      },
      {
        title: 'The Real Content Is the Other Players',
        html: '<p>Every MMORPG eventually discovers the same thing: the systems are the pretext, and the people are the product. The economies that emerge, the guilds, the reputations, the rivalries, the elaborate social hierarchies built around who can kill what — none of it is authored, and all of it is why anyone stays.</p><p>This is the genre\'s great achievement and its permanent liability. It can produce experiences no designer could script, because thousands of humans in a shared persistent world will produce stories nobody planned. It can also produce harassment, exploitation, and economic behaviour of a viciousness that regularly surprises the people who built the place. An MMORPG is not really a game with players in it. It is a society with a game attached, and every serious problem in the genre is a social problem wearing a technical costume.</p>',
      },
    ],
  }
];
