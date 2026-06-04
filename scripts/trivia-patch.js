const fs = require('fs');
const path = require('path');

const patch = {
  'oxo': {
    devStory: 'Alexander Douglas was a British academic who created OXO as part of his 1952 PhD thesis at the University of Cambridge on human-computer interaction. Douglas had no intention of building a game — he needed a demonstration program to illustrate his research points about how humans interact with machines. After completing his doctorate he returned to academia and never worked in the games industry.',
    trivia: [
      'OXO was never publicly distributed — it ran on the EDSAC computer at Cambridge, a machine that occupied an entire room and was only accessible to university researchers.',
      'Douglas used a rotary telephone dial as the input device, with numbers 1-9 mapping to the nine squares of the tic-tac-toe grid.',
      'The game always played optimally — it was impossible to beat if you were playing second, making it more of a demonstration than a competitive game.',
      'OXO is sometimes listed as the first video game with a graphical display, predating Tennis for Two and Spacewar! by several years.',
    ]
  },
  'tennis-for-two': {
    devStory: 'William Higinbotham was a nuclear physicist who worked on the Manhattan Project and later became head of instrumentation at Brookhaven National Laboratory. He created Tennis for Two in 1958 purely as a visitor attraction — something more engaging than static displays of lab equipment. Haunted by his role in the atomic bomb, Higinbotham spent much of his later life campaigning for nuclear disarmament through the Federation of American Scientists.',
    trivia: [
      'Higinbotham built the entire game in about three weeks using a Donner analog computer and a DuMont oscilloscope, with no intention of it becoming historically significant.',
      'The game was dismantled after the 1959 open day and its components reused for other experiments — Higinbotham saw it as disposable lab equipment.',
      'It ran at approximately 60 frames per second, smoother than most video games produced 20 years later.',
      'Higinbotham never patented the invention. In the 1970s, when Atari was defending its patents, lawyers tried to use Tennis for Two as prior art — Higinbotham testified in court about his own creation.',
      'A working replica was built in 1997 and is now on display at Brookhaven National Laboratory.',
    ]
  },
  'spacewar': {
    devStory: 'Spacewar! emerged from the collaborative hacker culture of MIT\'s Tech Model Railroad Club in 1962. Steve Russell wrote the core game engine, but it was truly a team effort: Martin Graetz and Wayne Wiitanen conceived the concept, Dan Edwards added the gravitational star, and Peter Samson contributed a real star map of the night sky. The group shared code freely, seeing software as something to be given away and improved collectively — a philosophy that predated the open-source movement by decades.',
    trivia: [
      'The background starfield in Spacewar! was an accurate map of the night sky as seen from Cambridge, Massachusetts, programmed by Peter Samson and nicknamed "Expensive Planetarium."',
      'Nolan Bushnell played Spacewar! on a PDP-1 at the University of Utah and directly credited it as the inspiration for Computer Space, the first commercial arcade game.',
      'By the mid-1960s, Spacewar! was installed on nearly every PDP-1 in the United States — it spread via magnetic tape passed between research institutions.',
      'The hyperspace feature was added as a desperation move — pressing it teleported your ship to a random location, which could save you or put you inside the star.',
      'Rolling Stone magazine ran a famous 1972 article by Stewart Brand about Spacewar!, one of the first mainstream pieces of journalism about video games.',
    ]
  },
  'sumerian-game': {
    devStory: 'The Sumerian Game was created in 1964 by Mabel Addis, a school teacher, and William McKay, an IBM programmer, as an educational tool for sixth-grade students in Westchester County, New York. It is one of the earliest known educational computer games and one of the first games designed for children. Addis wrote the narrative and game design; McKay implemented it on an IBM 7090 mainframe. The project was funded by the Board of Cooperative Educational Services.',
    trivia: [
      'The Sumerian Game is considered one of the earliest known computer role-playing and strategy games, predating the commercial game industry by over a decade.',
      'Players managed grain supplies, population, and land in ancient Sumeria — economic simulation concepts that resurfaced in M.U.L.E., Civilization, and countless strategy games.',
      'It was played by typing commands on a teletype machine connected to a mainframe, with the computer printing responses in plain English.',
      'Mabel Addis was one of the first women to design a video game, doing so before the term "video game" even existed.',
      'The game later inspired Hamurabi (1968) and its many derivatives, making it an indirect ancestor of the entire resource management genre.',
    ]
  },
  'hamurabi': {
    devStory: 'Hamurabi was written in 1968 by Doug Dyment for the DEC PDP-8 minicomputer, based on an earlier game called The Sumerian Game. It became one of the most widely distributed early computer games because it was short enough to be typed from a magazine listing — players would spend hours transcribing the code just to run it. David Ahl republished a BASIC version in his 1973 book "101 BASIC Computer Games," spreading it to millions of home computer users through the late 1970s and 1980s.',
    trivia: [
      'Hamurabi was one of the first games that most 1970s home computer owners ever played, since it appeared in nearly every early BASIC programming book.',
      'The name is a deliberate misspelling of Hammurabi, the ancient Babylonian king famous for his code of laws.',
      'The game features random events including plague, rats eating grain, and immigrants arriving — an early example of procedural event systems.',
      'A "perfect" 10-year run was virtually impossible; the game was designed so that poor decisions compounded over time in a realistic way.',
      'Hamurabi influenced the entire resource management and city-building genre, with direct descendants including SimCity and Civilization.',
    ]
  },
  'lunar-lander-1969': {
    devStory: 'The original Lunar Lander simulation was written in 1969 by Jim Storer, a high school student in Lexington, Massachusetts, as a class project. He programmed it in FOCAL on a PDP-8 minicomputer. His teacher Don Rutherford helped him refine it. The program was never commercially distributed but spread through the research community on paper tape. It inspired numerous versions throughout the 1970s and eventually Atari\'s 1979 arcade game.',
    trivia: [
      'Storer wrote the game the same year as the actual Apollo 11 moon landing, capturing the national fascination with lunar exploration.',
      'The original version was text-only — players typed thrust values and received printed altitude and velocity readings.',
      'Because it was distributed on punched paper tape and later typed from magazine listings, dozens of independent versions with different features emerged throughout the 1970s.',
      'The physics simulation in Storer\'s original was surprisingly accurate, using real equations of motion for the lunar descent.',
      'A version appeared in the 1973 book "What to Do After You Hit Return" and became one of the most-typed programs in early computer history.',
    ]
  },
  'star-trek-basic': {
    devStory: 'The Star Trek text game was written in 1971 by Mike Mayfield, a 16-year-old high school student, on a Sigma 7 mainframe at UC Irvine. He was inspired by the TV show and wanted to create a space strategy game. The code was later ported to BASIC by Bob Leedom and distributed through the HP Time-Shared BASIC system, reaching thousands of terminals across North America. It became one of the most widely played computer games of the early 1970s.',
    trivia: [
      'Mayfield wrote the game in FOCAL and then in HP BASIC during a summer when he had access to university computing time.',
      'The game\'s galaxy was an 8×8 grid of sectors containing Klingons, starbases, and stars — a spatial structure that influenced countless later space strategy games.',
      'David Ahl published the BASIC version in Creative Computing magazine in 1974, reaching hundreds of thousands of readers.',
      'Because the source code was freely shared, dozens of variants appeared — some adding shields, crew management, and torpedo targeting.',
      'The game is considered a direct ancestor of the 4X (explore, expand, exploit, exterminate) strategy genre.',
    ]
  },
  'colossal-cave': {
    devStory: 'Colossal Cave Adventure was created by Will Crowther in 1975-76, a caver and programmer at Bolt Beranek and Newman who helped build ARPANET. Crowther modelled the game\'s cave system on Mammoth Cave in Kentucky, where he had spent years caving with his then-wife. After his divorce, he wrote the game partly as a way to stay connected with his daughters, who loved his caving stories. Don Woods found the program on Stanford\'s ARPA network in 1976 and expanded it significantly, adding fantasy elements including the treasure-hunting structure.',
    trivia: [
      'The cave geography is based on the real Mammoth Cave system in Kentucky — Crowther used actual survey data from his years of caving.',
      'The phrase "You are in a maze of twisty little passages, all alike" became one of the most famous sentences in computing history.',
      'Crowther originally wrote the game for his daughters after separating from his wife — it was a form of digital storytelling for children.',
      'Don Woods discovered the game on Stanford\'s network by searching for files with "advent" in the name — short for "adventure," the filename Crowther used.',
      'Colossal Cave Adventure directly inspired Zork, the Sierra On-Line adventure games, and the entire text adventure genre.',
    ]
  },
  'computer-space': {
    devStory: 'Computer Space was created by Nolan Bushnell and Ted Dabney in 1971, inspired by Spacewar! which Bushnell had played at the University of Utah. Bushnell and Dabney founded Syzygy Engineering to build the game and licensed it to Nutting Associates for manufacturing. It was the first commercially sold arcade video game. Despite modest sales, the experience gave Bushnell and Dabney the confidence to found Atari the following year.',
    trivia: [
      'Computer Space was housed in a distinctive fibreglass cabinet shaped like a futuristic pod — designed to look like something from a sci-fi film.',
      'Bushnell designed the game while working at Ampex and reportedly drew the initial schematics on a napkin.',
      'The game appeared in the 1973 sci-fi film "Soylent Green," making it one of the first video games to appear in a Hollywood movie.',
      'It sold around 1,500 units — modest by later standards but enough to prove coin-operated video games were commercially viable.',
      'The game was considered too complex for bar audiences, which directly motivated Bushnell to commission the simpler Pong.',
    ]
  },
  'galaxy-game': {
    devStory: 'Galaxy Game was built by Stanford students Bill Pitts and Hugh Tuck in 1971 — just months before Computer Space. The pair spent $20,000 of their own money to build a coin-operated Spacewar! machine using a PDP-11 minicomputer, which was enormously expensive at the time. It was installed in the Tresidder Union at Stanford and ran almost continuously for two years. Because it was never commercially manufactured, only two units were ever built.',
    trivia: [
      'Galaxy Game may have been the first coin-operated video game, installed at Stanford slightly before Computer Space reached arcades — the exact timeline is disputed.',
      'The PDP-11 computer at its core cost around $14,000 alone, making each play of the game extraordinarily expensive to provide.',
      'It allowed up to eight players to queue and watch each other play, creating an early spectator gaming culture around the machine.',
      'The original cabinet is preserved at the Computer History Museum in Mountain View, California.',
      'Pitts and Tuck never commercialised the design — they built it as an engineering project, not a business venture.',
    ]
  },
  'pong': {
    devStory: 'Pong was designed by Allan Alcorn in 1972 as a training exercise assigned by Atari co-founder Nolan Bushnell. Bushnell told Alcorn to copy a simple ping-pong game from the Magnavox Odyssey, expecting it to be a throwaway project. Alcorn added features not in his brief — the ball speed increased over time, the angle of return depended on where it hit the paddle. The prototype installed at Andy Capp\'s Tavern in Sunnyvale jammed within weeks — not because it broke, but because the coin box was too full.',
    trivia: [
      'The Pong prototype at Andy Capp\'s Tavern broke down in its first week — technicians found the coin box had jammed from being overfilled with quarters.',
      'Alcorn added the "English" mechanic (ball angle varies by paddle hit position) on his own initiative — it was not in Bushnell\'s original brief.',
      'Magnavox sued Atari for patent infringement, claiming Pong copied the Odyssey\'s tennis game. Atari settled, becoming the first Magnavox licensee.',
      'Sears sold a home version of Pong in 1975, which sold 150,000 units during the Christmas season — the first major success of home video gaming.',
      'Bushnell gave Alcorn a $1,000 bonus for Pong. Atari went on to earn over $100 million from the game.',
    ]
  },
  'space-race': {
    devStory: 'Space Race was Atari\'s second arcade game, released in 1973. It was designed internally by Atari engineers as a two-player competitive game where spaceships race from bottom to top while dodging asteroids. The game established Atari\'s early pattern of taking simple competitive sports concepts and translating them into electronic form.',
    trivia: [
      'Space Race used the same basic hardware architecture as Pong, helping Atari to manufacture it quickly and cheaply.',
      'It was one of the first arcade games to feature a two-player simultaneous competitive mode with a vertical scrolling field.',
      'The game sold around 900 units — far fewer than Pong — but it helped fund Atari\'s expansion into new game concepts.',
      'Kee Games, secretly a subsidiary of Atari, released a near-identical clone called Elimination to help Atari avoid exclusive distribution contracts.',
    ]
  },
  'gotcha': {
    devStory: 'Gotcha was released by Atari in 1973, designed as a maze chase game where one player pursues another through a randomly generated maze. It is historically notable — and notorious — for its original joystick design: hemispherical rubber protrusions intended to suggest female anatomy, which were quickly replaced with conventional joysticks after public complaints.',
    trivia: [
      'Gotcha\'s original joystick design was shaped like a breast — a marketing decision by Atari that caused immediate controversy and was quickly replaced.',
      'The game established the maze-chase format that Pac-Man would perfect seven years later.',
      'It was one of the first two-player games where one player chased the other rather than both competing symmetrically.',
      'The random maze generation meant no two games were identical — an early example of procedural content in games.',
    ]
  },
  'gran-trak-10': {
    devStory: 'Gran Trak 10 was Atari\'s first driving game, released in 1974. It was designed by engineers Ron Milner and Owen Rubin and was notable for being the first arcade game to use a ROM chip for game data storage, the first to use a steering wheel with gear shift, and the first to display a racetrack from an overhead perspective. The game was commercially successful despite Atari reportedly losing money on each unit due to manufacturing miscalculations.',
    trivia: [
      'Gran Trak 10 was the first arcade game to use a ROM (Read-Only Memory) chip to store game program data.',
      'Atari lost approximately $100 on every unit sold due to a manufacturing cost miscalculation — they priced it before fully accounting for the bill of materials.',
      'The steering wheel, gear shift, accelerator and brake pedals made it one of the first driving simulator-style arcade games.',
      'The overhead track view became the standard perspective for racing games for the next decade.',
    ]
  },
  'tank': {
    devStory: 'Tank was developed by Lyle Rains and Kee Games (a subsidiary of Atari) in 1974. It was one of the first games to use ROM chips for storing sprite graphics, allowing more detailed visuals than previous games. The two-player tank combat format was immediately popular and spawned numerous sequels and imitators. Tank was also one of the first games to feature multiple levels of difficulty.',
    trivia: [
      'Tank was among the first arcade games to use ROM chips to store graphical sprites, allowing more complex visuals than hand-wired logic circuits could produce.',
      'The game offered four playfield variations and multiple difficulty settings — unusual depth for a 1974 arcade game.',
      'Its two-player simultaneous combat format directly influenced Combat on the Atari 2600, which was bundled with the console at launch.',
      'Kee Games was secretly owned by Atari — the subterfuge allowed Atari to offer "competing" products to distributors who demanded exclusivity.',
    ]
  },
  'gun-fight': {
    devStory: 'Gun Fight was originally developed by Taito in Japan as Western Gun in 1975, then licensed to Midway for the North American market. Midway engineer Dave Nutting redesigned the game around an Intel 8080 microprocessor — making it the first arcade game to use a microprocessor rather than custom hardware logic. This was a pivotal moment in arcade history: microprocessors made game logic programmable rather than hardwired, enabling far more complex games.',
    trivia: [
      'Gun Fight was the first arcade game to use a microprocessor — a decision by Dave Nutting that changed how all future arcade games would be built.',
      'The original Japanese version (Western Gun) used discrete logic circuits; the American remake was a near-total redesign around an Intel 8080 CPU.',
      'Players could move their gunfighters around the screen — an early form of character control in a shooting game.',
      'The Wild West theme made it a cultural touchstone, and the game was controversial for its depiction of human-on-human violence.',
    ]
  },
  'sea-wolf': {
    devStory: 'Sea Wolf was designed by Dave Nutting Associates and released by Midway in 1976. It was based on an earlier electromechanical sea-battle game and updated it with video graphics. Players looked through a periscope viewer to fire torpedoes at moving ships. Sea Wolf was a massive commercial hit, selling over 10,000 units and becoming one of the best-selling arcade games of 1976.',
    trivia: [
      'Sea Wolf used a real periscope housing as the control interface, creating an immersive physical experience unusual for video games of its era.',
      'It sold over 10,000 units, making it one of the first true blockbuster arcade games.',
      'The game was a direct update of Midway\'s earlier electromechanical Sea Devil game, showing the transition from mechanical to electronic arcades.',
      'Sea Wolf II followed in 1978, adding a two-player mode — one of the first arcade game sequels.',
    ]
  },
  'night-driver': {
    devStory: 'Night Driver was developed by Atari and released in 1976. It simulated first-person night driving using white posts on a black screen to create the illusion of a road. The technique was a clever workaround for hardware limitations: rather than rendering actual road graphics, the game used parallax-scrolling posts to suggest movement. A plastic steering wheel overlay sat in front of the monitor to enhance the illusion.',
    trivia: [
      'Night Driver created the illusion of a road using only simple white rectangles — the "road" was actually just the gap between two rows of posts.',
      'A moulded plastic car dashboard was mounted in front of the monitor as part of the cabinet, blending real and virtual elements.',
      'The game\'s night setting was a practical decision as much as an aesthetic one — a dark screen with simple white shapes was within the hardware\'s capabilities.',
      'Night Driver is considered a direct ancestor of first-person racing games, a lineage running through Pole Position to modern racing simulators.',
    ]
  },
  'sprint-2': {
    devStory: 'Sprint 2 was developed by Atari in 1976 as a sequel to Sprint 1 (itself derived from Gran Trak 10). It featured two-player simultaneous racing on a variety of tracks and became one of Atari\'s most successful racing game franchises. The Sprint series ran through several sequels and established overhead racing as a core arcade genre.',
    trivia: [
      'Sprint 2 was one of the first arcade games to offer selectable race tracks, giving players variety across multiple play sessions.',
      'The two-player simultaneous format, with both cars on screen at once, was technically challenging for 1976 hardware.',
      'Sprint was so successful it spawned Sprint 4 and Sprint 8, scaling the formula to four and eight players respectively.',
      'The game used a steering wheel and accelerator pedal, establishing the physical control format that endured in racing arcades for decades.',
    ]
  },
  'blockade': {
    devStory: 'Blockade was developed by Gremlin Industries in 1976 and is the origin of the snake game concept. Two players control continuously moving lines that cannot stop or turn back on themselves. The player who crashes into a wall or the opponent\'s trail loses. The concept was so clean and compelling that it was immediately cloned by competitors and has been reimplemented thousands of times, most famously as the Nokia Snake game in 1998.',
    trivia: [
      'Blockade is the original snake game — every snake/tron-style game traces its lineage directly to this 1976 cabinet.',
      'Gremlin had no idea how influential the concept would become; they saw it as a simple two-player filler game.',
      'Atari cloned it almost immediately as Surround, and it appeared on the Atari 2600 as one of the launch titles.',
      'The Nokia Snake game, played by hundreds of millions of people on mobile phones in the late 1990s and 2000s, is a direct descendant of Blockade.',
    ]
  },
  'breakout': {
    devStory: 'Breakout was designed by Nolan Bushnell and Steve Bristow at Atari in 1975, with the hardware built by Steve Jobs and Steve Wozniak. Jobs was paid a flat fee and secretly pocketed most of a bonus Atari paid for minimising the chip count — he gave Wozniak only $350 of the $5,000 bonus. Wozniak\'s elegant design used just 44 chips. The game directly inspired Wozniak to create the Apple II, which featured a built-in version of Breakout.',
    trivia: [
      'Steve Jobs hired Steve Wozniak to design the hardware for a flat fee, then kept the majority of Atari\'s chip-reduction bonus for himself — Wozniak didn\'t learn this for years.',
      'Wozniak designed the hardware in just four nights using only 44 chips — far fewer than Atari\'s engineers thought possible.',
      'Wozniak later said that working on Breakout directly led to the design of the Apple II, particularly its colour graphics hardware.',
      'The game was a one-player adaptation of Pong — Bushnell\'s idea was to let solo players enjoy the Pong mechanic without needing an opponent.',
      'Breakout spawned an entire genre: Arkanoid, Alleyway, and thousands of modern "brick breaker" mobile games are all its descendants.',
    ]
  },
  'death-race': {
    devStory: 'Death Race was developed by Exidy in 1976, loosely based on the film Death Race 2000. It was the first video game to generate significant mainstream controversy: players drove a car to run over gremlins, which screamed and turned into crosses. The National Safety Council condemned it, newspapers ran alarming stories, and the game was debated on 60 Minutes. Exidy\'s sales tripled. The controversy established the pattern of moral panic around violent video games that recurred for decades.',
    trivia: [
      'Death Race was the first video game to be pulled from arcades due to public controversy over its violent content.',
      'The game\'s targets were officially "gremlins," not people — but the screaming and tombstones made the intended interpretation obvious.',
      'The National Safety Council called it "sick" and "morbid." The resulting press coverage tripled Exidy\'s sales.',
      'It appeared on 60 Minutes in 1976, one of the first mainstream television segments about video game violence.',
      'The controversy established the template for gaming moral panics that resurfaced with Mortal Kombat in 1992 and GTA in the 2000s.',
    ]
  },
  'circus': {
    devStory: 'Circus was developed by Exidy in 1977 as a Breakout variant with a circus theme — players bounced a clown off a seesaw to pop balloons at the top of the screen. It was licensed to Atari as Circus Atari for the 2600. The game demonstrated how the Breakout formula could be reskinned and given personality through theming, a lesson that the industry applied to dozens of later Breakout clones.',
    trivia: [
      'Circus replaced Breakout\'s bricks with balloons and the paddle with a seesaw — a simple reskin that gave the game a completely different feel.',
      'The bouncing clown could be launched at different angles depending on where he hit the seesaw, adding skill-based shot selection.',
      'Atari licensed the game and sold it as Circus Atari, one of the more successful early 2600 titles.',
      'The game showed that the "bouncing ball destroys targets above" formula could be adapted endlessly with new themes.',
    ]
  },
  'atari-football': {
    devStory: 'Atari Football was designed by Dave Stubben and released by Atari in 1977. It was the first arcade game to use a trackball controller, allowing players to scroll the field and move players with speed and precision impossible with a joystick. The trackball became so associated with sports arcade games that it appeared in Baseball, Bowling, and countless other titles. The cabinet featured a large overhead LED scoreboard display.',
    trivia: [
      'Atari Football introduced the trackball controller to arcade gaming — a format that became standard for sports games for over a decade.',
      'The game was one of the first to scroll the play field, with the camera following the ball carrier down the field.',
      'Trackballs in Atari Football units wore out extremely quickly from heavy use, and replacement parts became a significant business for Atari.',
      'The game\'s success led directly to Atari\'s Centipede and Missile Command, both of which also used trackball controllers.',
    ]
  },
  'space-wars': {
    devStory: 'Space Wars was developed by Larry Rosenthal and released by Cinematronics in 1977. Rosenthal had built a Spacewar! clone for his MIT master\'s thesis, then commercialised it as an arcade game using vector graphics technology he developed himself. It was one of the first vector graphics arcade games and was technically superior to most raster-graphics games of its era.',
    trivia: [
      'Space Wars used vector graphics, drawing lines directly on the screen rather than lighting up pixels — producing crisp, flicker-free visuals unusual for 1977.',
      'Larry Rosenthal built the entire game himself as a one-man operation, then licensed it to Cinematronics for manufacturing.',
      'The game was essentially a commercial version of the MIT Spacewar! program, with Rosenthal having studied and improved the original code.',
      'Cinematronics went on to produce other vector classics including Tail Gunner and Rip Off, establishing vector graphics as a viable arcade format.',
    ]
  },
  'zork': {
    devStory: 'Zork was created between 1977 and 1979 by four MIT programmers — Tim Anderson, Marc Blank, Bruce Daniels, and Dave Lebling — on a PDP-10 mainframe. The team were members of the MIT Dynamic Modelling Group and wrote Zork as a successor to Colossal Cave Adventure. Blank and Anderson later co-founded Infocom, which commercialised Zork in 1980 and went on to publish some of the most sophisticated interactive fiction of the 1980s.',
    trivia: [
      'Zork\'s parser understood complex English sentences — "put the sword in the trophy case" — at a time when most games accepted only two-word commands.',
      'The name "Zork" was MIT hacker slang for an unfinished or poorly functioning program — the creators used it as a placeholder and it stuck.',
      'The original mainframe Zork was 1MB in size — far too large for home computers, so Infocom split it into three separate games for commercial release.',
      '"It is pitch black. You are likely to be eaten by a grue." — the grue warning became one of the most quoted lines in gaming history.',
      'Infocom eventually sold to Activision in 1986. The acquisition was reportedly motivated partly by Activision wanting Infocom\'s database compression technology.',
    ]
  },
  'fire-truck': {
    devStory: 'Fire Truck was developed by Atari and released in 1978. It was one of the first arcade games to support four-player simultaneous play — two players sat in the cab controlling steering, while two more controlled the rear trailer\'s steering. The articulated fire truck mechanic, where the back of the vehicle steered independently, was a novel simulation of the real steering dynamics of large emergency vehicles.',
    trivia: [
      'Fire Truck was one of the first arcade games to feature genuine four-player simultaneous co-operative play.',
      'The articulated trailer mechanic required genuine coordination between players — the front and rear steered independently, making teamwork essential.',
      'The game used a unique dual steering wheel setup: one player steered the cab, another steered the trailer.',
      'It was released the same year as Space Invaders — while Taito was changing arcades globally, Atari was experimenting with co-operative social gaming.',
    ]
  },
  'space-invaders': {
    devStory: 'Space Invaders was designed by Tomohiro Nishikado, a Taito engineer who spent a year building both the game and the custom hardware to run it. Nishikado was inspired by Breakout, Star Wars, and H.G. Wells\'s The War of the Worlds. He hand-drew and pixel-painted every alien sprite. Space Invaders was the first game to save high scores permanently and the first to build suspense through procedural audio — the iconic four-note bassline sped up as fewer aliens remained.',
    trivia: [
      'Space Invaders caused a coin shortage in Japan — Taito\'s game consumed so many 100-yen coins that the government had to triple production of the coin.',
      'Nishikado designed humans as the original enemies, but changed them to aliens after consulting with Taito about the ethics of shooting people.',
      'The game originally ran too slowly when all 55 aliens were on screen. As players shot aliens, the processor freed up and the survivors moved faster — this "bug" became the core tension of the game.',
      'Space Invaders was the first arcade game to save the high score after the machine was turned off.',
      'When licensed to Atari for the 2600, it became the first "killer app" for a home console — quadrupling 2600 sales in 1980.',
    ]
  },
  'asteroids': {
    devStory: 'Asteroids was designed by Lyle Rains and Ed Logg at Atari in 1979. The vector graphics approach was chosen specifically because it could render the rotating, fragmenting asteroids more fluidly than raster technology. Logg added the UFOs and the physics-based ship movement — the ship continued to drift unless the player fired the thruster. The game became Atari\'s best-selling arcade game, with over 70,000 units sold.',
    trivia: [
      'Asteroids became Atari\'s best-selling arcade game with over 70,000 units — surpassing Space Invaders\' North American numbers.',
      'The game\'s vector display could draw crisp lines at any angle, something raster screens of the era could not do cleanly.',
      'The "wraparound" screen — where objects exiting one side appear on the opposite side — was inspired by the way stars appear to repeat in space.',
      'Some players discovered they could park their ship in the centre and shoot UFOs as they appeared, farming points indefinitely — a famous early exploit.',
      'Atari had to install a larger coin box in the Asteroids cabinet because players were filling the standard box too quickly.',
    ]
  },
  'galaxian': {
    devStory: 'Galaxian was developed by Namco in 1979 as a direct response to Space Invaders. Namco engineer Kazunori Sawano led a team that added RGB colour graphics, diving enemy attack runs, and a points bonus for shooting the flagship with two escort aliens. It was the first arcade game to use a true RGB colour display rather than a colour overlay, and it sold over 40,000 units worldwide.',
    trivia: [
      'Galaxian was the first arcade game to use true RGB colour graphics, producing vivid colours rather than the tinted overlays of earlier games.',
      'The diving attack runs — where aliens broke from formation to swoop at the player — added a new dimension of threat that Space Invaders lacked.',
      'Shooting the flagship while it was escorted by two wingmen scored the maximum bonus — a risk-reward mechanic that became standard in shooters.',
      'Namco designed Galaxian specifically to displace Space Invaders from arcades, and succeeded in becoming the dominant shooter of 1979.',
      'Galaga (1981) was a direct sequel, refining every element of Galaxian\'s design and becoming one of the best-selling arcade games ever made.',
    ]
  },
  'lunar-lander': {
    devStory: 'Atari\'s Lunar Lander was designed by Rich Moore and released in 1979 as a vector graphics arcade game. It was based on the 1969 text simulation but rendered with beautiful line-drawn graphics. Interestingly, Atari originally planned the game to use Asteroids hardware but developed dedicated hardware instead. The cabinet used a thrust handle and rotation controls to simulate the Apollo lunar module.',
    trivia: [
      'Lunar Lander was the first commercially released vector graphics arcade game — Asteroids, which became far more famous, was released later the same year on the same hardware.',
      'A "buy more fuel" option was built into the game — players could insert coins mid-game to continue, one of the first examples of monetising game continuations.',
      'The terrain was randomly generated for each play, meaning no two landings were on the same surface.',
      'The game used authentic physics — the lander had inertia and the thrust was continuous rather than instantaneous, requiring players to think ahead.',
    ]
  },
  'monaco-gp': {
    devStory: 'Monaco GP was developed by Sega and released in 1979. It was one of Sega\'s first successful arcade racing games and established the formula of top-down racing on a scrolling track. The game featured day and night cycles and changing road conditions — unusual depth for a 1979 arcade game.',
    trivia: [
      'Monaco GP was one of the first racing games to feature a day-to-night transition, creating the illusion of racing across time.',
      'The game included rain and night conditions that changed the handling characteristics of the car.',
      'Sega used Monaco GP to establish their racing game expertise, a lineage that eventually led to OutRun and Daytona USA.',
      'The game featured a distinctive overhead view of the track that became the standard for racing games through the early 1980s.',
    ]
  },
  'tail-gunner': {
    devStory: 'Tail Gunner was developed by Vectorbeam and released in 1979. It placed the player in the rear gunner position of a spacecraft, shooting at pursuing enemy fighters rendered in vector graphics. The first-person perspective combined with vector rendering created a sense of depth unusual for the era. Vectorbeam was a short-lived company focused entirely on vector graphics technology.',
    trivia: [
      'Tail Gunner used a first-person perspective — the player looked out the back of their spacecraft — which was extremely rare in 1979 arcade games.',
      'The vector graphics gave enemies a wire-frame 3D appearance, years before 3D gaming became mainstream.',
      'Vectorbeam folded in 1979, but their vector technology influenced Cinematronics and other companies.',
      'The game\'s rear-gunner mechanic appeared again years later in Star Wars: Return of the Jedi and various flight simulators.',
    ]
  },
  'adventure-2600': {
    devStory: 'Adventure was programmed by Warren Robinett for the Atari 2600 in 1979. Atari\'s management told programmers not to include any credits in games — they feared developers would be poached. Robinett hid his name in a secret room: by carrying a specific dot to a specific wall junction, a hidden room appeared reading "Created by Warren Robinett." This was the first known Easter egg in a video game, and it sparked a tradition that continues to this day.',
    trivia: [
      'Adventure contained the first known Easter egg in a video game — Warren Robinett hid his name in a secret room because Atari forbade developer credits.',
      'The game was a graphical adaptation of Colossal Cave Adventure, condensed from a text game into the Atari 2600\'s 4KB of ROM.',
      'The dragon AI was based on a simple fleeing/chasing behaviour that Robinett developed — Yorgle the yellow dragon feared the gold key.',
      'A black dot hidden in one of the castles was the key to accessing the Easter egg room — players searched for it for years before discovering it.',
      'Robinett left Atari the day he submitted the final code, ensuring the Easter egg couldn\'t be removed before manufacturing.',
    ]
  },
  'temple-of-apshai': {
    devStory: 'Temple of Apshai was developed by Jon Freeman and Jeff Johnson at Automated Simulations in 1979. It was one of the first graphical dungeon-crawling RPGs for home computers and sold extremely well for its era. Freeman and Johnson went on to found Free Fall Associates, which created Archon. Temple of Apshai was notable for extensive printed manual descriptions of each dungeon room — the game\'s graphics were so limited that room descriptions had to be read from the booklet.',
    trivia: [
      'Temple of Apshai came with a printed manual containing written descriptions of every room — players had to cross-reference the booklet as they explored because the graphics were too primitive to convey details.',
      'It was one of the first commercial graphical RPGs, predating Ultima and Wizardry by nearly two years.',
      'The game sold over 30,000 copies — enormous numbers for a home computer game in 1979.',
      'Freeman and Johnson later created Archon, one of the most original games of the 1980s, showing a consistent interest in innovative game mechanics.',
    ]
  },
  'missile-command': {
    devStory: 'Missile Command was designed by Dave Theurer at Atari and released in 1980. Theurer had nightmares about nuclear war during development — the game\'s design, in which the missiles always eventually overwhelm the defences, was intentionally unwinnable. The trackball controller allowed precise targeting but also caused severe wrist strain in heavy players, who coined the term "Missile Wrist." The game grossed over $100 million in its first year.',
    trivia: [
      'Designer Dave Theurer suffered recurring nightmares about nuclear war during development — the impossible-to-win design was entirely intentional.',
      '"Missile Wrist" was the name given to the repetitive strain injury suffered by players who spent hours on the trackball.',
      'The game had six cities to defend; the loss of all six ended the game with the text "THE END" — there was no "GAME OVER" message.',
      'A perfect score of 999,999 was achieved in 1981 — by deliberately losing cities at specific intervals to keep the game at a fixed difficulty level.',
      'The game grossed over $100 million in revenue in its first year, making it one of the highest-grossing arcade games of the golden age.',
    ]
  },
  'battlezone': {
    devStory: 'Battlezone was designed by Ed Rotberg at Atari and released in 1980. It used vector graphics to create a first-person 3D tank combat game — one of the earliest 3D games ever made. The US Army became interested in the technology and contracted Atari to create a military training version called the Bradley Trainer, which Rotberg worked on reluctantly. He later said the military application was the part of his career he was least comfortable with.',
    trivia: [
      'Battlezone was one of the first true 3D games — its vector graphics created genuine three-dimensional space that players navigated.',
      'The US Army commissioned a military training version called the Bradley Trainer, based on Battlezone\'s hardware and engine.',
      'Designer Ed Rotberg was uncomfortable with the military contract and has spoken publicly about his reluctance to work on it.',
      'A periscope-style viewfinder in the cabinet gave players the impression of looking through a tank sight.',
      'Battlezone\'s first-person 3D perspective directly influenced the entire FPS genre, from Wolfenstein 3D to Doom and beyond.',
    ]
  },
  'rally-x': {
    devStory: 'Rally-X was developed by Namco in 1980. It was one of the first games to feature background music that played continuously during gameplay — Space Invaders had sound effects, but Rally-X had a looping musical theme. The game also introduced a continue function and a "special flag" bonus system. Despite these innovations, it was overshadowed in the market by the simultaneous release of Pac-Man.',
    trivia: [
      'Rally-X was one of the first arcade games to feature continuous background music during gameplay.',
      'It was released the same month as Pac-Man and was largely forgotten as a result, despite being a genuinely innovative game.',
      'The smoke screen mechanic — spending fuel to confuse pursuing cars — was an early example of resource management in an action game.',
      'Rally-X introduced the radar/minimap concept to arcade games, showing the positions of all flags and enemies on a small display.',
    ]
  },
  'crazy-climber': {
    devStory: 'Crazy Climber was developed by Nichibutsu in 1980. Players used two joysticks simultaneously — one for each hand — to climb a building, dodging obstacles thrown from windows. The dual-joystick control scheme was unusual and required players to think about both hands independently, creating a unique physical challenge. The game was a major hit in Japan and had moderate success in North America.',
    trivia: [
      'Crazy Climber required two joysticks operated simultaneously — one for each hand — making it one of the most physically unusual arcade games of its era.',
      'Obstacles thrown from windows included flower pots, dumbbells, and condors, and their patterns had to be memorised.',
      'The game featured licensed building facades from famous skyscrapers, giving it a real-world anchor unusual for arcade games.',
      'The dual-joystick concept reappeared in Robotron: 2084 (1982) and influenced every twin-stick shooter since.',
    ]
  },
  'berzerk': {
    devStory: 'Berzerk was designed by Alan McNeil at Stern Electronics and released in 1980. It was one of the first arcade games to feature synthesised speech — the robots taunted players with lines like "Intruder alert!" and "The humanoid must not escape!" McNeil claimed the game\'s concept came from a dream. Evil Otto, the indestructible smiley-face that chased players regardless of walls, remains one of gaming\'s most memorable antagonists.',
    trivia: [
      'Berzerk was one of the first arcade games to use synthesised speech — the robots delivered voiced taunts including "Intruder alert!" and "Chicken! Fight like a robot!"',
      'Evil Otto, the bouncing smiley face, could pass through walls and was completely indestructible — the only escape was to leave the room.',
      'Two players died of heart attacks after achieving high scores on Berzerk machines in 1981, making it the first game allegedly linked to player deaths.',
      'McNeil said the game\'s concept came directly from a dream he had — he sketched it out and pitched it to Stern the following morning.',
      'Evil Otto was named after Dave Otto, Stern\'s quality assurance head — a joke that Otto apparently did not find funny.',
    ]
  },
  'space-panic': {
    devStory: 'Space Panic was developed by Universal in 1980 and is considered the first platform game — predating Donkey Kong by a year. Players dug holes in platforms to trap and eliminate aliens. While Donkey Kong introduced jumping and the running left-right format, Space Panic established the core concept of characters navigating layered platforms. It was influential but commercially overshadowed by Donkey Kong.',
    trivia: [
      'Space Panic is widely considered the first platform game, establishing layered platforms as a gameplay environment before Donkey Kong.',
      'Unlike Donkey Kong, the player could not jump — they navigated between platforms using ladders only.',
      'The hole-digging mechanic was a genuine innovation: creating traps for enemies rather than shooting them directly.',
      'The game was a commercial success in Japan but had limited North American distribution, partly explaining why Donkey Kong received more historical credit as the "first" platformer.',
    ]
  },
  'pac-man': {
    devStory: 'Pac-Man was designed by Toru Iwatani at Namco over 18 months, released in 1980. Iwatani wanted to create a game that would appeal to women and couples, who avoided the violent shooting games dominating arcades. The design was inspired by a pizza with a slice removed. Each ghost has a distinct AI personality — Blinky chases directly, Pinky tries to ambush, Inky is unpredictable, Clyde wanders randomly. Pac-Man became the highest-grossing arcade game of all time.',
    trivia: [
      'Iwatani said the Pac-Man shape was inspired by a pizza with one slice removed — though he later admitted this may have been a post-hoc rationalisation.',
      'Each of the four ghosts has a distinct AI behaviour: Blinky (Oikake) chases, Pinky (Machibuse) ambushes, Inky (Kimagure) is unpredictable, Clyde (Otoboke) wanders.',
      'The infamous "kill screen" at level 256 is caused by a bug — the level counter uses a single byte, and 256 overflows to 0, corrupting the maze display.',
      'Pac-Man was so popular that it caused a quarter shortage in the US — operators couldn\'t collect coins fast enough.',
      'The first "perfect" Pac-Man game — clearing all 255 playable boards with maximum score — was achieved by Billy Mitchell in 1999.',
    ]
  },
  'centipede': {
    devStory: 'Centipede was designed by Ed Logg and Dona Bailey at Atari in 1980. Bailey was one of the very few women working in the arcade game industry and brought a different sensibility to the design — she favoured bright colours and a mushroom garden aesthetic over the militaristic themes common at the time. The game was explicitly designed to be accessible to non-gamers and became one of the most popular arcade games ever made.',
    trivia: [
      'Dona Bailey was one of the first women to design a major commercial arcade game, bringing the colourful mushroom garden aesthetic to what could have been a military shooter.',
      'The trackball controller made the game accessible to players who struggled with joysticks — it translated directly to casual arcade visitors.',
      'Centipede was the second-best-selling Atari arcade game after Asteroids, with over 55,000 units sold.',
      'The spider\'s movement was randomised in a way that made it genuinely difficult to predict — experienced players often considered it more dangerous than the centipede itself.',
      'A sequel, Millipede, was released in 1982 with additional enemy types and power-ups but never achieved Centipede\'s commercial success.',
    ]
  },
  'warlords': {
    devStory: 'Warlords was developed by Atari in 1980 as a four-player simultaneous game. Four players occupied the four corners of the screen, each defending a castle while launching fireballs at opponents. It used paddle controllers and could be played with up to four participants simultaneously. The game remains one of the finest examples of chaotic multiplayer arcade gaming from the golden age.',
    trivia: [
      'Warlords supports four simultaneous players — each controlling a shield in one corner while attacking the others — creating chaotic free-for-all gameplay.',
      'The game used Atari\'s paddle controllers, which tracked rotation rather than direction, giving precise shield control.',
      'Alliances and betrayals naturally emerged in four-player games — ganging up on the leader was a common strategy.',
      'The Atari 2600 version is considered superior to most ports of the era, faithfully capturing the multiplayer chaos.',
    ]
  },
  'defender': {
    devStory: 'Defender was designed by Eugene Jarvis and Larry DeMar at Williams Electronics in 1981. It was one of the most complex games of its era — five control buttons plus a joystick — and Jarvis deliberately made it difficult, saying he wanted players who were willing to master a complex system to be rewarded. The game cost more to develop than any previous Williams title and was the highest-grossing arcade game of 1981.',
    trivia: [
      'Defender had five buttons (thrust, reverse, fire, smart bomb, hyperspace) plus a joystick — the most complex control scheme in arcades at the time.',
      'Jarvis deliberately made the game hard to learn, believing players who mastered it would play longer and spend more.',
      'The scrolling landscape was an early example of a side-scrolling open world — the planet wrapped around, and humanoids were scattered across its surface.',
      'Defender was the highest-grossing arcade game of 1981, earning more than Space Invaders, Pac-Man, or Asteroids in that year.',
      'The smart bomb — which destroyed all on-screen enemies — was a desperation mechanic that became a staple of the shoot-em-up genre.',
    ]
  },
  'galaga': {
    devStory: 'Galaga was developed by Namco in 1981, designed by Shigeru Yokoyama as a refinement of Galaxian. The key innovation was the "challenging stage" bonus rounds, the tractor beam capture mechanic (allowing players to recover their ship for dual fire), and the precise formation attack patterns of the insects. Galaga became one of the best-selling arcade games of all time, and machines are still commonly found in arcades and bars decades later.',
    trivia: [
      'The "bug" that allows a player to let both their ships be captured, then recover them for triple-fire, was a discovered exploit that Namco left in the game.',
      'The challenging stages — where the player shoots at formations for bonus points with no risk — were a deliberate pacing mechanism to relieve tension.',
      'Galaga has the distinction of being one of the few arcade games still regularly played in its original cabinet form at modern bars and arcades.',
      'The tractor beam capture mechanic was inspired by science fiction abduction stories — enemies literally stealing the player\'s ship.',
      'A perfect Galaga score requires never missing a shot and capturing your own ship in every possible round — a feat achieved by very few players.',
    ]
  },
  'ms-pac-man': {
    devStory: 'Ms. Pac-Man began as an unauthorised enhancement kit called Crazy Otto, developed by a group of MIT students at General Computer Corporation. Midway licensed it from them when they discovered it in 1981, and worked with Namco to release it officially. The game featured maze variations, faster gameplay, moving fruit, and semi-random ghost behaviour — improvements so significant that many players and designers prefer it to the original.',
    trivia: [
      'Ms. Pac-Man was originally an unauthorised hack called "Crazy Otto" created by MIT students — Midway discovered it and licensed it rather than filing a lawsuit.',
      'The ghost AI was made more random than in the original Pac-Man, making the game less amenable to pattern memorisation.',
      'Four different maze layouts appear as the game progresses — a major improvement over the original\'s single maze.',
      'Fruit bounces around the maze rather than appearing in a fixed location, forcing players to chase it at their own risk.',
      'Ms. Pac-Man outsold the original Pac-Man in North America, making it Midway\'s best-selling game despite being a modification of another company\'s IP.',
    ]
  },
  'scramble': {
    devStory: 'Scramble was developed by Konami in 1981 and is considered the first horizontally scrolling shoot-em-up. Players flew a spacecraft over varied terrain including rocket bases, mountains, and underground caverns, managing both weapons and fuel. The combination of scrolling, fuel management, terrain obstacles, and multiple enemy types set the template for an entire genre.',
    trivia: [
      'Scramble is widely considered the first horizontally scrolling shoot-em-up — every side-scrolling shooter traces its lineage to this game.',
      'The fuel mechanic forced players to balance offence (shooting fuel depots to survive) with defence (avoiding enemy fire).',
      'Six distinct zones required different strategies — the underground cavern section demanded precise flying through narrow passages.',
      'Konami used Scramble to establish their expertise in the shooting genre, a lineage running through Gradius and Contra.',
    ]
  },
  'tempest': {
    devStory: 'Tempest was designed by Dave Theurer at Atari in 1981 — the same designer who created Missile Command. The game was developed from a concept Theurer called "first-person Space Invaders." The distinctive tube-and-web geometry was a technical accident: the hardware could render geometric shapes efficiently but struggled with detailed sprites. Theurer turned the limitation into a feature. The spinner controller gave the game a distinctive feel that no other game replicated.',
    trivia: [
      'Dave Theurer designed both Tempest and Missile Command — two of the most psychologically intense games of the golden age, both featuring unstoppable, escalating threats.',
      'The game was originally designed as a first-person Space Invaders — enemies came toward the camera rather than moving sideways.',
      'Theurer suffered from nightmares during Tempest\'s development, just as he had during Missile Command — the psychological intensity of the games reflected his state of mind.',
      'The spinner controller gave extremely precise rotational movement — far more responsive than any joystick — and became integral to the game\'s feel.',
      'Tempest was one of the first games to offer difficulty selection before play began, letting experienced players skip early levels.',
    ]
  },
  'gorf': {
    devStory: 'Gorf was designed by Jamie Fenton at Midway in 1981. It was notable for multiple distinct gameplay modes presented as a sequential campaign: Astro Battles (Space Invaders), Laser Attack, Galaxians, and Space Warp. Each section had different rules and mechanics. The game also featured speech synthesis, with the computer taunting players by name if their initials were entered on the high score table.',
    trivia: [
      'Gorf featured synthesised speech that addressed players by name — one of the earliest examples of personalised computer voice interaction.',
      'The game consisted of five distinct play modes in sequence, making it feel like five games in one cabinet.',
      'GORF stood for "Galactic Orbiting Robot Force" — a backronym invented after the name was chosen.',
      'The space warp level used a tunnel-vision zooming effect rare in 1981 arcade games.',
    ]
  },
  'wizard-of-wor': {
    devStory: 'Wizard of Wor was developed by Dave Nutting Associates and published by Midway in 1981. It was one of the first dungeon maze games to support two simultaneous players who could cooperate or accidentally shoot each other. The eponymous Wizard appeared periodically to taunt players and shoot at them, while the maze walls gradually disappeared to remove hiding spots.',
    trivia: [
      'Wizard of Wor was one of the first arcade games to allow two simultaneous players who could shoot each other — friendly fire was always on.',
      'The Wizard himself appeared periodically, teleporting around the screen and firing at both players.',
      'Maze walls gradually disappeared as players progressed, turning a strategic cover-based game into an open-field shooting gallery.',
      'The synthesised speech for enemy names and the Wizard\'s taunts was remarkably clear for 1981 technology.',
    ]
  },
  'qix': {
    devStory: 'Qix was designed by husband-and-wife team Randy and Sandy Pfeiffer at Taito America in 1981. Players drew lines to claim territory on the screen while avoiding the Qix — an abstract entity of spinning lines. The concept was entirely original with no precedent in arcade games. The game required a mental model completely different from shooting or racing games, and attracted a dedicated following among players who enjoyed its abstract puzzle quality.',
    trivia: [
      'Qix was designed by a married couple — Randy and Sandy Pfeiffer — making it one of very few golden age arcade games with female design involvement.',
      'The Qix itself is a purely abstract entity — a set of moving lines — with no game-world explanation for what it is.',
      'Drawing a "fast" line (using the fast button) scored fewer points than a slow line, creating a risk-reward calculation around drawing speed.',
      'The concept has been reimplemented dozens of times, most famously as Volfied and Gals Panic.',
    ]
  },
  'donkey-kong': {
    devStory: 'Donkey Kong was designed by Shigeru Miyamoto for Nintendo in 1981 — his first game. Nintendo had a warehouse full of unsold Radar Scope arcade cabinets and needed a game to repurpose them. Miyamoto, with no game design experience, created a game around a narrative he invented: a gorilla escaped from a carpenter and kidnapped his girlfriend. The carpenter was originally called Jumpman; he was later renamed Mario. Donkey Kong was the game that saved Nintendo\'s North American business.',
    trivia: [
      'Donkey Kong was Shigeru Miyamoto\'s first game, designed with no prior game development experience — he had been hired as an industrial artist.',
      'The game was built to repurpose unsold Radar Scope cabinets sitting in a US warehouse — Nintendo needed a North American hit urgently.',
      'Mario was called "Jumpman" and was a carpenter, not a plumber. His girlfriend was Pauline, not Peach.',
      'Universal Studios sued Nintendo claiming Donkey Kong infringed the King Kong copyright. Nintendo\'s lawyer John Kirby won the case — Nintendo named Kirby the video game character after him as thanks.',
      'The "how high can you get?" tagline and the construction site setting were Miyamoto\'s metaphor for the game\'s escalating difficulty.',
    ]
  },
  'frogger': {
    devStory: 'Frogger was developed by Konami in 1981 and distributed by Sega internationally. The game was designed by a team including Akira Hashimoto and is credited as one of the first games to have an environmental theme — the frog must survive traffic and a dangerous river, suggesting a world hostile to small animals. Frogger was one of the best-selling arcade games of 1981 and has been ported to virtually every gaming platform ever made.',
    trivia: [
      'Frogger is one of the few golden age arcade games with an implied environmental message — traffic and pollution threaten the natural world.',
      'The home conversion for the Atari 2600 was so popular that it outsold the Seinfeld-era television revival of the property.',
      'Each frog in a home slot represented a life — positioning them at the top was uniquely satisfying in a way that abstract lives counters were not.',
      'Frogger appeared in a memorable Seinfeld episode where George Costanza tries to move an arcade machine across traffic while keeping his high score alive.',
      'The game has no ending — difficulty increases indefinitely, making survival the only measure of skill.',
    ]
  },
  'ultima-i': {
    devStory: 'Ultima I was created by Richard Garriott, then a teenager working at a computer store in Texas. He had been writing fantasy role-playing games for his Apple II under the pen name "Lord British" and sold hand-labelled copies in plastic bags from the shop where he worked. Ultima I was his first commercially published game, released by California Pacific Computer Company in 1981. Garriott went on to create one of the most influential RPG series in history.',
    trivia: [
      'Garriott sold early copies of his games in hand-labelled Ziploc bags from a computer store where he worked as a teenager — one of the earliest examples of indie game distribution.',
      'He adopted the name "Lord British" from a nickname given to him by American classmates in England who teased him for his accent.',
      'Ultima I mixed fantasy RPG with space combat — players could travel to space stations and fight in a starfighter after building up their land-based character.',
      'The original version contained personal details about Garriott\'s friends and teachers disguised as in-game characters.',
      'Garriott designed the game\'s world on graph paper, creating a coherent geography that subsequent Ultima games would revisit and expand.',
    ]
  },
  'stargate': {
    devStory: 'Stargate was designed by Eugene Jarvis and Larry DeMar at Williams Electronics in 1981 as the sequel to Defender. Jarvis added the inviso (temporary invisibility), the phaser (fires across the entire screen), and the eponymous Stargate — a warp tunnel allowing instant travel across the playfield. The game is considered by many to be a refinement of Defender rather than a true sequel, as it retained all the original mechanics while adding complexity.',
    trivia: [
      'Stargate added three new weapons to Defender\'s arsenal: the inviso (invisibility cloak), phaser (screen-wide weapon), and the warp Stargate itself.',
      'The game was released as "Stargate" in most markets but renamed "Defender II" in some regions to capitalise on the original\'s name recognition.',
      'Jarvis later said the phaser was so powerful that it broke the game\'s balance — experienced players could use it to trivialise difficult situations.',
      'Despite being the sequel to one of the highest-grossing games of 1981, Stargate sold only about 20,000 units.',
    ]
  },
  'wizardry': {
    devStory: 'Wizardry was created by Andrew Greenberg and Robert Woodhead while they were students at Cornell University in 1981. It was directly inspired by the PLATO mainframe RPG games Oubliette and Moria. The game\'s rigorous dungeon mechanics — permanent character death, class system, monster encounters — became the template for Japanese RPGs. The Dragon Quest and Final Fantasy series developers explicitly cited Wizardry as their primary influence.',
    trivia: [
      'Wizardry directly inspired Dragon Quest and Final Fantasy — both series were created by developers who grew up playing Wizardry on early Japanese personal computers.',
      'Permanent character death (permadeath) was a feature, not a bug — characters who died in the dungeon could only be retrieved if a surviving party member carried the body out.',
      'The game\'s character creation involved rolling statistics randomly and re-rolling until a satisfactory character appeared — a process players sometimes repeated for hours.',
      'Wizardry sold over 100,000 copies at a time when most computer games sold in the thousands, making it one of the first blockbuster PC games.',
      'Robert Woodhead later moved to Japan, where Wizardry\'s cultural influence was enormous — the franchise published dozens of Japan-exclusive sequels through the 1990s and 2000s.',
    ]
  },
};

// Part 2 will be added separately
module.exports = { patch };
