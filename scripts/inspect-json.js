const fs = require('fs');
const raw = fs.readFileSync('C:/github/bosnan/data/games.json', 'utf8').replace(/^﻿/, '');
console.log('First 30 chars:', JSON.stringify(raw.slice(0, 30)));
console.log('Chars 960-1010:', JSON.stringify(raw.slice(960, 1010)));
// Check what char code is at position 978
const ch = raw.charCodeAt(978);
console.log('Char at 978:', ch, '=', JSON.stringify(raw[978]));
// Check 970-985
for (let i = 970; i < 990; i++) {
  process.stdout.write(i + ':' + raw.charCodeAt(i) + '(' + JSON.stringify(raw[i]) + ') ');
}
console.log();
