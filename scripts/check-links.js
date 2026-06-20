'use strict';

/*
 * Fetches every sources[].url across data/*.js and reports non-OK results.
 * Follows redirects, uses a browser-ish UA, bounded concurrency.
 *
 * Usage: node scripts/check-links.js
 * Exit code is non-zero if any URL is dead (4xx/5xx/error).
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const DATA_DIR = path.join(__dirname, '..', 'data');
const UA = 'Mozilla/5.0 (compatible; bosnan-linkcheck/1.0; +https://bosnan)';
const CONCURRENCY = 8;
const TIMEOUT_MS = 20000;

// Collect unique URLs with where-used.
const urlMap = new Map(); // url -> Set(location)
for (const file of fs.readdirSync(DATA_DIR).filter((f) => f.endsWith('.js'))) {
  let arr;
  try { arr = require(path.join(DATA_DIR, file)); } catch { continue; }
  if (!Array.isArray(arr)) continue;
  for (const e of arr) {
    if (!e || !Array.isArray(e.sources)) continue;
    for (const s of e.sources) {
      const url = typeof s === 'string' ? s : (s && s.url);
      if (!url) continue;
      if (!urlMap.has(url)) urlMap.set(url, new Set());
      urlMap.get(url).add(`${file} (${e.id})`);
    }
  }
}

const urls = [...urlMap.keys()];
console.log(`Checking ${urls.length} unique source URLs...\n`);

function fetchStatus(url, redirects = 0) {
  return new Promise((resolve) => {
    if (redirects > 5) return resolve({ status: 'ERR', detail: 'too many redirects' });
    let lib;
    try { lib = new URL(url).protocol === 'http:' ? http : https; }
    catch { return resolve({ status: 'ERR', detail: 'bad url' }); }
    const req = lib.get(url, { headers: { 'User-Agent': UA, Accept: '*/*' }, timeout: TIMEOUT_MS }, (res) => {
      const { statusCode, headers } = res;
      res.resume(); // drain
      if ([301, 302, 303, 307, 308].includes(statusCode) && headers.location) {
        const next = new URL(headers.location, url).toString();
        return resolve(fetchStatus(next, redirects + 1));
      }
      resolve({ status: statusCode });
    });
    req.on('timeout', () => { req.destroy(); resolve({ status: 'ERR', detail: 'timeout' }); });
    req.on('error', (e) => resolve({ status: 'ERR', detail: e.message }));
  });
}

(async () => {
  const results = [];
  let idx = 0;
  async function worker() {
    while (idx < urls.length) {
      const url = urls[idx++];
      const r = await fetchStatus(url);
      results.push({ url, ...r });
      const ok = r.status === 200;
      process.stdout.write(ok ? '.' : 'X');
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  process.stdout.write('\n\n');

  // 401/403/429 from wikis (Fandom etc.) are anti-bot blocks, not dead links —
  // the pages load fine in a browser. Treat those as "blocked" (informational).
  // Only 404/410/5xx/network errors count as genuinely dead.
  const BLOCKED = new Set([401, 403, 429]);
  const ok = results.filter((r) => r.status === 200);
  const blocked = results.filter((r) => BLOCKED.has(r.status));
  const dead = results.filter((r) => r.status !== 200 && !BLOCKED.has(r.status));

  console.log(`OK (200):      ${ok.length} / ${results.length}`);
  console.log(`Blocked (bot): ${blocked.length}  (4xx anti-bot; not failures)`);
  console.log(`Dead:          ${dead.length}`);

  if (blocked.length) {
    console.log(`\nBlocked (likely fine in browser):`);
    blocked.sort((a, b) => a.url.localeCompare(b.url));
    for (const b of blocked) console.log(`  [${b.status}] ${b.url}`);
  }
  if (dead.length) {
    console.log(`\nDEAD links (need fixing):`);
    dead.sort((a, b) => String(a.status).localeCompare(String(b.status)));
    for (const b of dead) {
      console.log(`  [${b.status}${b.detail ? ' ' + b.detail : ''}] ${b.url}`);
      for (const loc of urlMap.get(b.url)) console.log(`      used in ${loc}`);
    }
    process.exit(1);
  }
  console.log('\nNo dead links.');
})();
