// Builds demo/readaroo-demo.html: the real web app + engine + synthetic data in one offline file.
//   node scripts/build-demo.js              full standalone HTML (open it in any browser)
//   node scripts/build-demo.js --fragment   body-only version for hosts that add their own <html>/<head>
'use strict';
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const fragment = process.argv.includes('--fragment');
const outArg = process.argv.find((a) => a.startsWith('--out='));
const mobile = process.argv.includes('--mobile'); // native app build (Capacitor): same app and engine, clears the phone's status bar

const index = read('public/index.html');
const bodyStart = index.indexOf('<!--HEADER-->');
const scriptsStart = index.indexOf('<!--SCRIPTS-->');
if (bodyStart < 0 || scriptsStart < 0) throw new Error('public/index.html is missing the HEADER or SCRIPTS markers');
const markup = index.slice(bodyStart + '<!--HEADER-->'.length, scriptsStart).trim();
const seed = JSON.parse(read('data/seed.json'));
const safe = (js) => js.replace(/<\/script/gi, '<\\/script');

const adapter = `
(function () {
  var engine = ReadarooEngine.createEngine({
    store: ReadarooMemory.createMemoryStore(${JSON.stringify(seed)}),
    meter: ReadarooMemory.createFakeMeter()
  });
  window.ReadarooAPI = {
    call: function (method, path, query, body) {
      if (path === '/api/health') return Promise.resolve({ status: 200, body: { ok: true, mode: ${mobile ? "'app (runs on this phone)'" : "'demo (runs in your browser)'"}, stripe: 'simulated' } });
      return engine.handle(method, path, body, query || {});
    }
  };
})();`;

const head = `<title>Readaroo</title>
<meta name="claude:viewport-fit-sides" content="cover">
<meta name="description" content="Readaroo demo: a family library app prototype. All data is synthetic.">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&family=Baloo+2:wght@600;700;800&family=IBM+Plex+Mono:wght@500;600&display=swap">
<style>
${read('public/styles.css')}${mobile ? '\nbody { padding-top: max(12px, env(safe-area-inset-top, 0px)); }\n' : ''}
</style>`;

const scripts = [read('src/engine.js'), read('src/memoryStore.js'), adapter, read('public/app.js')]
  .map((js) => `<script>\n${safe(js)}\n</script>`).join('\n');

const html = fragment
  ? `${head}\n${markup}\n${scripts}\n`
  : `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n${head}\n</head>\n<body>\n${markup}\n${scripts}\n</body>\n</html>\n`;

const out = outArg ? outArg.slice(6) : path.join(root, 'demo', 'readaroo-demo.html');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log(`Wrote ${path.relative(process.cwd(), out)} (${Math.round(html.length / 1024)} KB)`);
