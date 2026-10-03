'use strict';

/*
 * Generates an original 1200×630 title card for every game in data/games.json,
 * written to images/cards/<id>.png.
 *
 * Why: 230 of the 432 games named an image file that was never on disk, and
 * the 202 that exist are Wikipedia-sourced box art kept at ~200–400px. Google
 * and the social networks want at least 600px (ideally 1200px) for large
 * previews, and Wikipedia's non-free art is low-resolution by policy, so it
 * cannot be the answer. These cards are first-party artwork — title, platform,
 * year, genre, developer and a pixel sprite derived from the game's id — so they
 * carry no licensing question and are always the right size.
 *
 * Usage: node scripts/generate-game-cards.js [--force]
 * Existing cards are skipped unless --force is given or the game's text changed
 * (the card's inputs are hashed into images/cards/manifest.json).
 * Requires `sharp`, which is a local dev tool here — the cards are committed,
 * so nothing runs at deploy time.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'images', 'cards');
const MANIFEST = path.join(OUT_DIR, 'manifest.json');
const FORCE = process.argv.includes('--force');
const W = 1200, H = 630;

// Design tokens from style.css :root (dark theme).
const C = {
  bg: '#0b0b0c', surface: '#131315', border: '#2c2c32',
  text: '#f2f2f3', secondary: '#c4c4c9', muted: '#a3a3ab', faint: '#8d8d96',
  accent: '#ff4d4d', accentStrong: '#d12b2b',
};
const FONT = "'Segoe UI', 'Helvetica Neue', Arial, sans-serif";

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Rough advance width of bold sans text, in ems. Good enough to wrap titles;
// the card leaves generous margins for the error.
function textWidth(str, size) {
  let em = 0;
  for (const ch of str) {
    if (/[ilI.,'!:;|]/.test(ch)) em += 0.30;
    else if (/[mwMW@]/.test(ch)) em += 0.88;
    else if (/[A-Z0-9&]/.test(ch)) em += 0.66;
    else if (ch === ' ') em += 0.28;
    else em += 0.56;
  }
  return em * size;
}

function wrap(text, size, maxWidth) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (textWidth(next, size) <= maxWidth || !line) line = next;
    else { lines.push(line); line = w; }
  }
  if (line) lines.push(line);
  return lines;
}

// Largest title size (88 → 50px) at which the title fits in three lines.
function fitTitle(title, maxWidth) {
  for (let size = 88; size >= 50; size -= 4) {
    const lines = wrap(title, size, maxWidth);
    if (lines.length <= 3 && lines.every((l) => textWidth(l, size) <= maxWidth)) return { size, lines };
  }
  const size = 50;
  const lines = wrap(title, size, maxWidth);
  if (lines.length > 3) { lines.length = 3; lines[2] = lines[2].replace(/\s+\S*$/, '') + '…'; }
  return { size, lines };
}

// A symmetric 8×8 "invader" sprite seeded by the game id: unique per game,
// original, and in keeping with the subject.
function sprite(id, x0, y0, cell) {
  const h = crypto.createHash('sha256').update(id).digest();
  let rects = '';
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 4; col++) {
      const bit = (h[row] >> col) & 1;
      // keep a solid core so every sprite reads as a figure, not noise
      const on = bit || (col >= 2 && row >= 2 && row <= 5);
      if (!on) continue;
      const shade = (h[8 + row] >> (col * 2)) & 3;
      const fill = shade === 0 ? C.accentStrong : C.accent;
      const opacity = [1, 0.9, 0.75, 0.6][shade];
      for (const c of [col, 7 - col]) {
        rects += `<rect x="${x0 + c * cell}" y="${y0 + row * cell}" width="${cell - 4}" height="${cell - 4}" rx="3" fill="${fill}" fill-opacity="${opacity}"/>`;
      }
    }
  }
  return rects;
}

function cardSvg(g) {
  const textX = 96, maxWidth = 690;
  const { size, lines } = fitTitle(g.title, maxWidth);
  const lineH = Math.round(size * 1.12);
  const blockH = lines.length * lineH;
  const titleTop = 300 - Math.round(blockH / 2) + Math.round(size * 0.8);
  const meta = [g.genre, g.developer].filter(Boolean).join(' · ');
  const kicker = [g.platform, g.year].filter(Boolean).join('  ·  ').toUpperCase();
  const titleSvg = lines.map((l, i) =>
    `<text x="${textX}" y="${titleTop + i * lineH}" font-family="${FONT}" font-size="${size}" font-weight="700" fill="${C.text}">${esc(l)}</text>`).join('');
  const metaY = titleTop + (lines.length - 1) * lineH + 70;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse">
      <rect width="24" height="24" fill="${C.bg}"/>
      <rect x="0" y="0" width="1" height="24" fill="#ffffff" fill-opacity="0.025"/>
      <rect x="0" y="0" width="24" height="1" fill="#ffffff" fill-opacity="0.025"/>
    </pattern>
    <linearGradient id="fade" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${C.bg}" stop-opacity="1"/>
      <stop offset="0.62" stop-color="${C.bg}" stop-opacity="0.85"/>
      <stop offset="1" stop-color="${C.bg}" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#grid)"/>
  <text x="${W - 40}" y="${H - 60}" text-anchor="end" font-family="${FONT}" font-size="300" font-weight="800" fill="#ffffff" fill-opacity="0.04">${esc(g.year || '')}</text>
  <rect width="${W}" height="${H}" fill="url(#fade)" fill-opacity="0.35"/>
  <rect x="0" y="0" width="14" height="${H}" fill="${C.accent}"/>
  <g>${sprite(g.id, 880, 175, 30)}</g>
  <text x="${textX}" y="128" font-family="${FONT}" font-size="26" font-weight="700" letter-spacing="3" fill="${C.accent}">${esc(kicker)}</text>
  ${titleSvg}
  <text x="${textX}" y="${metaY}" font-family="${FONT}" font-size="30" fill="${C.secondary}">${esc(meta)}</text>
  <rect x="${textX}" y="${H - 112}" width="${W - textX * 2}" height="1" fill="${C.border}"/>
  <circle cx="${textX + 22}" cy="${H - 62}" r="22" fill="#000000" stroke="${C.accentStrong}" stroke-width="3"/>
  <text x="${textX + 22}" y="${H - 52}" text-anchor="middle" font-family="Arial, sans-serif" font-size="26" font-weight="700" fill="${C.accent}">B</text>
  <text x="${textX + 60}" y="${H - 53}" font-family="${FONT}" font-size="24" font-weight="600" fill="${C.muted}">Bosnan Retro Games Archive</text>
  <text x="${W - textX}" y="${H - 53}" text-anchor="end" font-family="${FONT}" font-size="24" fill="${C.faint}">bosnan.net</text>
</svg>`;
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const games = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'games.json'), 'utf8'));
  const manifest = fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) : {};
  const seen = new Set();
  let made = 0, kept = 0, bytes = 0;
  for (const g of games) {
    if (!g.id || seen.has(g.id)) continue;
    seen.add(g.id);
    const svg = cardSvg(g);
    const hash = crypto.createHash('sha1').update(svg).digest('hex').slice(0, 16);
    const out = path.join(OUT_DIR, `${g.id}.png`);
    if (!FORCE && manifest[g.id] === hash && fs.existsSync(out)) { kept++; continue; }
    await sharp(Buffer.from(svg)).png({ compressionLevel: 9, palette: true, quality: 90, effort: 10 }).toFile(out);
    manifest[g.id] = hash;
    bytes += fs.statSync(out).size;
    made++;
  }
  for (const id of Object.keys(manifest)) {
    if (!seen.has(id)) {
      delete manifest[id];
      const stale = path.join(OUT_DIR, `${id}.png`);
      if (fs.existsSync(stale)) fs.unlinkSync(stale);
    }
  }
  const sorted = Object.fromEntries(Object.keys(manifest).sort().map((k) => [k, manifest[k]]));
  fs.writeFileSync(MANIFEST, JSON.stringify(sorted, null, 1) + '\n');
  console.log(`cards: ${made} generated (${Math.round(bytes / 1024)} KB), ${kept} unchanged`);
}

if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
module.exports = { cardSvg };
