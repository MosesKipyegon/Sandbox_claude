// Apps Script can't serve image files, so the header logos are embedded as data URIs in
// small HTML files that Index.html includes. Re-run after replacing a PNG in assets/:
//   node tools/build-logos.js
// assets/*.png are header-sized (104px tall = 2x display); full-size originals are in assets/originals/.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const logos = [
  { png: 'cido-logo.png', out: 'LogoCido.html', alt: 'CIDO — Community Initiative for Development Organization' },
  { png: 'sv-logo.png', out: 'LogoSv.html', alt: 'Stichting Vluchteling' }
];

logos.forEach(({ png, out, alt }) => {
  const b64 = fs.readFileSync(path.join(root, 'assets', png)).toString('base64');
  fs.writeFileSync(path.join(root, out), '<img src="data:image/png;base64,' + b64 + '" alt="' + alt + '">\n');
  console.log('Wrote ' + out + ' (' + Math.round(b64.length / 1024) + ' KB)');
});
