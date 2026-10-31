// Renders icons/icon.svg into the PNG sizes Android, iOS and browsers need.
//   node tools/build-icons.js     (needs the "sharp" package: npm install sharp)
const path = require('path');
const sharp = require('sharp');

const dir = path.join(__dirname, '..', 'icons');
const svg = path.join(dir, 'icon.svg');

(async () => {
  for (const size of [192, 512]) {
    await sharp(svg, { density: 300 }).resize(size, size).png().toFile(path.join(dir, `icon-${size}.png`));
  }
  // Maskable: Android may crop to a circle, so keep the artwork inside the central 80%
  const inner = await sharp(svg, { density: 300 }).resize(410, 410).png().toBuffer();
  await sharp({ create: { width: 512, height: 512, channels: 4, background: '#C4622D' } })
    .composite([{ input: inner, gravity: 'center' }]).png().toFile(path.join(dir, 'icon-maskable-512.png'));
  await sharp(svg, { density: 300 }).resize(180, 180).png().toFile(path.join(dir, 'apple-touch-icon.png'));
  await sharp(svg, { density: 300 }).resize(32, 32).png().toFile(path.join(dir, 'favicon-32.png'));
  console.log('Icons written to', dir);
})();
