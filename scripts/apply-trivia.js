const fs = require('fs');
const path = require('path');

const { patch: p1 } = require('./trivia-patch');
const p2 = require('./trivia-patch2');
const p3 = require('./trivia-patch3');
const p4 = require('./trivia-patch4');

const patch = { ...p1, ...p2, ...p3, ...p4 };

const gamesPath = path.join(__dirname, '../data/games.json');
const games = JSON.parse(fs.readFileSync(gamesPath, 'utf8'));

let patched = 0;
for (const game of games) {
  if (patch[game.id]) {
    game.trivia = patch[game.id].trivia;
    game.devStory = patch[game.id].devStory;
    patched++;
  }
}

fs.writeFileSync(gamesPath, JSON.stringify(games, null, 2) + '\n');
console.log(`Patched ${patched} of ${games.length} games`);
const missing = games.filter(g => !g.trivia).map(g => g.id);
if (missing.length) console.log('Missing trivia for:', missing.join(', '));
