// Builds preview/index.html: Index.html with Styles/App inlined (like Apps Script's include())
// and fake data injected in place of google.script.run.
//   node tools/preview.js        -> then open preview/index.html in a browser
const fs = require('fs');
const path = require('path');
const { build } = require('./mock-data');

const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

let html = read('Index.html').replace(/<\?!=\s*include\('([^']+)'\);?\s*\?>/g, (_, name) => read(name + '.html'));
const data = '<script>window.__MOCK_DATA__ = ' + JSON.stringify(build()) + ';</script>\n';
html = html.replace('</head>', data + '</head>');

const outDir = path.join(root, 'preview');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'index.html'), html);
console.log('Wrote ' + path.join(outDir, 'index.html'));
