const fs = require('fs');
let raw = fs.readFileSync('C:/github/bosnan/data/games.json', 'utf8').replace(/^﻿/, '').trim();

// PowerShell ConvertTo-Json removed the [ ] array wrapper — add them back
if (!raw.startsWith('[')) raw = '[' + raw;
if (!raw.endsWith(']')) raw = raw + ']';

// Also fix trailing commas before ] which PS sometimes adds
raw = raw.replace(/,\s*\]/g, ']');

try {
  const data = JSON.parse(raw);
  console.log('Parsed OK:', data.length, 'games');
  fs.writeFileSync('C:/github/bosnan/data/games.json', JSON.stringify(data, null, 2), 'utf8');
  console.log('Written cleanly.');
} catch (e) {
  console.error('Still broken:', e.message);
  const pos = parseInt(e.message.match(/position (\d+)/)?.[1] || 0);
  console.log('Near:', JSON.stringify(raw.slice(Math.max(0, pos - 100), pos + 100)));
}
