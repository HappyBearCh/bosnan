'use strict';

/*
 * Records when each archive entry last changed, for the sitemap's <lastmod>.
 *
 * Vercel flattens file mtimes in its build output, so the server cannot tell
 * when anything changed and used to stamp every URL with the deploy date —
 * which teaches Google to ignore <lastmod> entirely. This script keeps
 * data/lastmod.json: one { hash, date } per entry, keyed by id (game ids are
 * prefixed "games:" because they share a namespace with nothing else). An
 * entry's date moves only when its content hash changes.
 *
 * Run it before committing data changes:  npm run lastmod
 * With --check it writes nothing and exits 1 if the file is out of date
 * (scripts/validate-data.js runs it that way and warns).
 * A new entry is dated with its file's last commit date if the file is
 * unchanged since that commit, otherwise with today's date.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'data');
const OUT = path.join(DATA, 'lastmod.json');
const today = new Date().toISOString().slice(0, 10);
const CHECK = process.argv.includes('--check');

const hashOf = (e) => crypto.createHash('sha1')
  .update(JSON.stringify(e, (k, v) => (k.startsWith('__') ? undefined : v)))
  .digest('hex').slice(0, 16);

const seedCache = new Map();
function fileSeedDate(rel) {
  if (!seedCache.has(rel)) seedCache.set(rel, gitSeedDate(rel));
  return seedCache.get(rel);
}
function gitSeedDate(rel) {
  try {
    const dirty = execFileSync('git', ['status', '--porcelain', '--', rel], { cwd: ROOT }).toString().trim();
    if (dirty) return today;
    const d = execFileSync('git', ['log', '-1', '--format=%cs', '--', rel], { cwd: ROOT }).toString().trim();
    return d || today;
  } catch {
    return today;
  }
}

const prev = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : {};
const next = {};
let added = 0, changed = 0;

// An id can occur more than once (duplicate games that dedupe() collapses, or
// one id shared by two sections), so hashes are collected per key first and
// combined in file order — otherwise the last duplicate wins and the date
// flaps on every run.
const pending = new Map();
function record(key, entry, rel) {
  if (!pending.has(key)) pending.set(key, { hashes: [], rel });
  pending.get(key).hashes.push(hashOf(entry));
}
function settle(key, { hashes, rel }) {
  const hash = hashes.length === 1 ? hashes[0] : crypto.createHash('sha1').update(hashes.join('|')).digest('hex').slice(0, 16);
  const old = prev[key];
  if (!old) { next[key] = { hash, date: fileSeedDate(rel) }; added++; }
  else if (old.hash !== hash) { next[key] = { hash, date: today }; changed++; }
  else next[key] = old;
}

const files = fs.readdirSync(DATA).filter((f) => f.endsWith('.js')).sort();
for (const f of files) {
  const arr = require(path.join(DATA, f));
  if (!Array.isArray(arr)) continue;
  for (const e of arr) if (e && e.id) record(e.id, e, `data/${f}`);
}
for (const g of JSON.parse(fs.readFileSync(path.join(DATA, 'games.json'), 'utf8'))) {
  if (g && g.id) record(`games:${g.id}`, g, 'data/games.json');
}

for (const [key, v] of pending) settle(key, v);
const removed = Object.keys(prev).filter((k) => !(k in next)).length;
const sorted = Object.fromEntries(Object.keys(next).sort().map((k) => [k, next[k]]));
if (CHECK) {
  const stale = added + changed + removed;
  console.log(stale
    ? `data/lastmod.json is out of date (${added} new, ${changed} changed, ${removed} removed) — run npm run lastmod`
    : 'lastmod: up to date');
  process.exit(stale ? 1 : 0);
}
fs.writeFileSync(OUT, JSON.stringify(sorted, null, 1) + '\n');
console.log(`lastmod: ${Object.keys(next).length} entries (${added} new, ${changed} changed, ${removed} removed)`);
