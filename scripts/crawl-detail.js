'use strict';

/*
 * Crawls detail pages and saves their HTML to an output dir, for before/after
 * refactor diffing. For every data/<prefix>.js it fetches the first and last
 * entry of the matching /<prefix>/:id route (catches optional-field variants).
 *
 * Usage: node scripts/crawl-detail.js <outDir>
 * Requires the server running on localhost:3000.
 */

const fs = require('fs');
const path = require('path');
const http = require('http');

const outDir = process.argv[2];
if (!outDir) { console.error('usage: node scripts/crawl-detail.js <outDir>'); process.exit(2); }
fs.mkdirSync(outDir, { recursive: true });

const DATA_DIR = path.join(__dirname, '..', 'data');
// route prefix == data filename for the generic item family
const prefixes = fs.readdirSync(DATA_DIR)
  .filter((f) => f.endsWith('.js'))
  .map((f) => f.replace(/\.js$/, ''));

function get(urlPath) {
  return new Promise((resolve) => {
    http.get({ host: 'localhost', port: 3000, path: urlPath }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => resolve({ status: res.statusCode, body }));
    }).on('error', (e) => resolve({ status: 'ERR', body: e.message }));
  });
}

(async () => {
  let count = 0, missing = 0;
  for (const prefix of prefixes) {
    let arr;
    try { arr = require(path.join(DATA_DIR, prefix + '.js')); } catch { continue; }
    if (!Array.isArray(arr) || !arr.length) continue;
    const sample = arr.length > 1 ? [arr[0], arr[arr.length - 1]] : [arr[0]];
    for (const e of sample) {
      if (!e || !e.id) continue;
      const r = await get(`/${prefix}/${e.id}`);
      if (r.status !== 200) { missing++; console.log(`! ${prefix}/${e.id} -> ${r.status}`); continue; }
      fs.writeFileSync(path.join(outDir, `${prefix}__${e.id}.html`), r.body);
      count++;
    }
  }
  console.log(`saved ${count} pages to ${outDir} (${missing} non-200)`);
})();
