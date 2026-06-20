'use strict';

/*
 * Structural validator for every data/*.js module.
 * Checks: array export, id present + unique (within and across files),
 * plausible year, well-formed sources. Reports problems; exits non-zero
 * if any hard error is found.
 *
 * Usage: node scripts/validate-data.js
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const files = fs.readdirSync(DATA_DIR).filter((f) => f.endsWith('.js')).sort();

const errors = [];
const warnings = [];
const globalIds = new Map(); // id -> [files]

let totalEntries = 0;

for (const file of files) {
  let arr;
  try {
    arr = require(path.join(DATA_DIR, file));
  } catch (e) {
    errors.push(`${file}: failed to load — ${e.message}`);
    continue;
  }
  if (!Array.isArray(arr)) {
    warnings.push(`${file}: export is not an array (skipped)`);
    continue;
  }

  const localIds = new Set();
  arr.forEach((e, i) => {
    totalEntries++;
    const where = `${file}[${i}]`;
    if (!e || typeof e !== 'object') {
      errors.push(`${where}: entry is not an object`);
      return;
    }
    // id
    if (!e.id) {
      errors.push(`${where}: missing id`);
    } else {
      if (localIds.has(e.id)) errors.push(`${where}: duplicate id within file — '${e.id}'`);
      localIds.add(e.id);
      if (!globalIds.has(e.id)) globalIds.set(e.id, []);
      globalIds.get(e.id).push(file);
    }
    // year sanity (only when present)
    if (e.year != null) {
      const y = Number(e.year);
      if (!Number.isFinite(y) || y < 1950 || y > 2030) {
        warnings.push(`${where} (${e.id}): implausible year '${e.year}'`);
      }
    }
    // sources well-formed (only when present)
    if (e.sources != null) {
      if (!Array.isArray(e.sources)) {
        errors.push(`${where} (${e.id}): sources is not an array`);
      } else {
        e.sources.forEach((s, j) => {
          const sw = `${where} (${e.id}).sources[${j}]`;
          if (typeof s === 'string') return; // bare URL/string allowed
          if (!s || typeof s !== 'object') {
            errors.push(`${sw}: not a string or object`);
            return;
          }
          if (!s.url || !/^https?:\/\//.test(s.url)) {
            errors.push(`${sw}: missing or malformed url`);
          }
          if (!s.title) warnings.push(`${sw}: missing title`);
        });
      }
    }
  });
}

// cross-file duplicate ids are NOT a routing collision — detail routes are
// category-scoped (e.g. /box-art/:id looks up only within BOX_ART). They just
// mean the same subject is covered in two categories. Report as info.
for (const [id, fileList] of globalIds) {
  if (fileList.length > 1) {
    warnings.push(`id '${id}' appears in multiple categories: ${fileList.join(', ')} (benign; cross-link self-exclusion is by id)`);
  }
}

console.log(`Validated ${files.length} files, ${totalEntries} entries.`);
if (warnings.length) {
  console.log(`\n${warnings.length} warning(s):`);
  warnings.forEach((w) => console.log('  ! ' + w));
}
if (errors.length) {
  console.log(`\n${errors.length} ERROR(s):`);
  errors.forEach((e) => console.log('  x ' + e));
  process.exit(1);
}
console.log('\nNo hard errors.');
