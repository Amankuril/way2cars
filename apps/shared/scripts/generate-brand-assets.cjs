/**
 * Generates brand assets from assets/way2cars-logo.jpg:
 *  - shared/assets/mark.png        transparent car mark (in-app logo)
 *  - <app>/android/.../mipmap-*    launcher icons (square + round)
 *  - <app>/android/.../drawable/splash_mark.png
 * Usage: node apps/shared/scripts/generate-brand-assets.cjs   (uses sharp from backend/node_modules)
 */
const path = require('path');
const fs = require('fs');
const root = path.resolve(__dirname, '../../..');
const sharp = require(require.resolve('sharp', { paths: [path.join(root, 'backend')] }));

const SRC = path.join(root, 'assets/way2cars-logo.jpg');
const OUT_MARK = path.join(root, 'apps/shared/assets/mark.png');
const DENSITIES = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };

async function transparentMark() {
  const { data, info } = await sharp(SRC).extract({ left: 95, top: 130, width: 480, height: 215 }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) {
    const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
    const min = Math.min(r, g, b);
    // Near-white background → transparent; soften the anti-aliased edge.
    if (min > 232) data[i + 3] = 0;
    else if (min > 205) data[i + 3] = Math.round(((232 - min) / 27) * 255);
  }
  await sharp(data, { raw: info }).trim({ threshold: 1 }).png().toFile(OUT_MARK);
  return OUT_MARK;
}

async function icon(size, round, mark) {
  const inner = Math.round(size * 0.74);
  const m = await sharp(mark).resize({ width: inner, height: inner, fit: 'inside' }).toBuffer();
  const base = sharp({ create: { width: size, height: size, channels: 4, background: '#FFFFFF' } }).composite([{ input: m, gravity: 'center' }]);
  let buf = await base.png().toBuffer();
  const mask = round
    ? Buffer.from(`<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}"/></svg>`)
    : Buffer.from(`<svg width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${size * 0.22}"/></svg>`);
  buf = await sharp(buf).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
  return buf;
}

(async () => {
  const mark = await transparentMark();
  for (const app of ['user', 'vendor']) {
    const res = path.join(root, 'apps', app, 'android/app/src/main/res');
    if (!fs.existsSync(res)) continue;
    for (const [d, size] of Object.entries(DENSITIES)) {
      fs.writeFileSync(path.join(res, `mipmap-${d}`, 'ic_launcher.png'), await icon(size, false, mark));
      fs.writeFileSync(path.join(res, `mipmap-${d}`, 'ic_launcher_round.png'), await icon(size, true, mark));
    }
    fs.mkdirSync(path.join(res, 'drawable'), { recursive: true });
    await sharp(mark).resize({ width: 520 }).png().toFile(path.join(res, 'drawable', 'splash_mark.png'));
    console.log(`icons written for ${app}`);
  }
  console.log('mark:', mark);
})();
