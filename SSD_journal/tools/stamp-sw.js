// Run before publishing: node tools/stamp-sw.js
// Sets VERSION in sw.js to a hash of every app file, so phones pick up the new version,
// and warns about app files that are missing from the offline list (SHELL).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.join(__dirname, '..');
const swPath = path.join(root, 'sw.js');
let sw = fs.readFileSync(swPath, 'utf8');

const shell = [...sw.match(/const SHELL = \[([\s\S]*?)\];/)[1].matchAll(/'([^']+)'/g)].map(m => m[1]).filter(f => f !== './');

// Every file the app needs at runtime should be in SHELL
const wanted = [];
const walk = dir => fs.readdirSync(path.join(root, dir), { withFileTypes: true }).forEach(d => {
  const rel = path.posix.join(dir, d.name);
  if (d.isDirectory()) walk(rel);
  else if (/\.(js|css|geojson|woff2)$/.test(d.name)) wanted.push(rel);
});
['js', 'css', 'data', 'vendor', 'fonts'].forEach(walk);
const missing = wanted.filter(f => !shell.includes(f));
const gone = shell.filter(f => !fs.existsSync(path.join(root, f)));
if (missing.length) console.warn('⚠ Not in SHELL (won’t work offline):\n  ' + missing.join('\n  '));
if (gone.length) { console.error('✗ In SHELL but missing on disk:\n  ' + gone.join('\n  ')); process.exit(1); }

const hash = crypto.createHash('sha256');
shell.forEach(f => hash.update(f).update(fs.readFileSync(path.join(root, f))));
const version = hash.digest('hex').slice(0, 10);
sw = sw.replace(/const VERSION = '[^']*';/, `const VERSION = '${version}';`);
fs.writeFileSync(swPath, sw);
console.log(`sw.js VERSION = ${version} (${shell.length} files)`);
