// Resize all game images to max 400px wide, quality 80 — keeps detail page usable
// while shrinking cards from avg 150KB → ~20KB
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const IMG_DIR = path.join(__dirname, '..', 'images', 'games');
const files = fs.readdirSync(IMG_DIR).filter(f => /\.(jpg|jpeg|png|gif|webp)$/i.test(f));

async function run() {
  let total = 0, saved = 0;
  for (const file of files) {
    const src = path.join(IMG_DIR, file);
    const stat = fs.statSync(src);
    const origKB = Math.round(stat.size / 1024);
    const tmp = src + '.tmp';
    try {
      const isGif = /\.gif$/i.test(file);
      let pipeline = sharp(src, { animated: false }).resize({ width: 400, withoutEnlargement: true });
      if (isGif || /\.png$/i.test(file)) {
        pipeline = pipeline.png({ quality: 80, compressionLevel: 9 });
      } else {
        pipeline = pipeline.jpeg({ quality: 80, mozjpeg: true });
        // output as jpg regardless of original format for consistency
      }
      await pipeline.toFile(tmp);
      const newKB = Math.round(fs.statSync(tmp).size / 1024);
      fs.renameSync(tmp, src);
      const reduction = origKB - newKB;
      saved += reduction;
      total++;
      if (origKB > 50) process.stdout.write(`${file}: ${origKB}KB → ${newKB}KB (-${reduction}KB)\n`);
    } catch (e) {
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
      console.error(`SKIP ${file}: ${e.message}`);
    }
  }
  console.log(`\nDone: ${total} images resized, ${Math.round(saved/1024)}MB saved.`);
}
run().catch(console.error);
