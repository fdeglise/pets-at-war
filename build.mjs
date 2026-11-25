// Bundles the game into one standalone HTML file: dist/pets-at-war.html
// (Three.js still loads from the jsDelivr CDN.) Usage: npm run build
import { build } from 'esbuild';
import fs from 'node:fs';

const result = await build({
  entryPoints: ['src/main.js'],
  bundle: true,
  format: 'esm',
  minify: true,
  write: false,
  external: ['three', 'three/addons/*'],
  target: 'es2020',
});
const js = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
// If the game fails before it starts (no WebGL, blocked script), say so instead of showing a blank page.
const STARTUP_ERROR = "window.addEventListener('error',function(e){if(window.__G)return;var d=document.createElement('div');d.style.cssText='position:fixed;inset:0;display:flex;align-items:center;justify-content:center;padding:24px;text-align:center;color:#f4f6ff;font:16px system-ui;z-index:99;background:#0d1324';d.textContent='Pets at War could not start: '+(e.message||'unknown error')+'. Your browser may have WebGL turned off.';document.body.appendChild(d)});";
const css = fs.readFileSync('style.css', 'utf8');
const index = fs.readFileSync('index.html', 'utf8');
const importmap = index.match(/<script type="importmap">[\s\S]*?<\/script>/)[0];
const head = index
  .split('<link rel="stylesheet" href="style.css" />')[0]
  .replace(/<\/head>[\s\S]*/, '');

const html = `${head}<style>\n${css}\n</style>
    ${importmap}
  </head>
  <body>
    <noscript>Pets at War needs JavaScript and WebGL.</noscript>
    <script>
${STARTUP_ERROR}
</script>
    <script type="module">\n${js}\n</script>
  </body>
</html>
`;
fs.mkdirSync('dist', { recursive: true });
fs.writeFileSync('dist/pets-at-war.html', html);
console.log(`dist/pets-at-war.html written (${Math.round(html.length / 1024)} KB)`);
