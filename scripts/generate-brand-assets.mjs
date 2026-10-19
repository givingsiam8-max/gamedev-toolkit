/**
 * Regenerates the brand raster assets from public/logo-mark.svg:
 * favicon.ico, apple-touch-icon.png, logo-192.png, logo-512.png and og-image.jpg.
 *
 * Requirements (not part of the app's runtime or CI):
 *   npm i -D puppeteer-core
 *   CHROME_PATH="C:/Program Files/Google/Chrome/Application/chrome.exe" node scripts/generate-brand-assets.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const ROOT = path.resolve(import.meta.dirname, '..');
const PUB = path.join(ROOT, 'public');
const CHROME =
  process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const svg = fs.readFileSync(path.join(PUB, 'logo-mark.svg'), 'utf8');

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox', '--disable-gpu'],
});
const page = await browser.newPage();

async function renderIcon(size, filename) {
  await page.setViewport({ width: size, height: size, deviceScaleFactor: 1 });
  await page.setContent(
    `<!doctype html><html><head><style>html,body{margin:0;padding:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style></head><body>${svg}</body></html>`,
    { waitUntil: 'load' },
  );
  await page.screenshot({ path: path.join(PUB, filename), omitBackground: true, type: 'png' });
  return fs.statSync(path.join(PUB, filename)).size;
}

const icons = [
  [16, 'icon-16.png'],
  [32, 'icon-32.png'],
  [48, 'icon-48.png'],
  [180, 'apple-touch-icon.png'],
  [192, 'logo-192.png'],
  [512, 'logo-512.png'],
];
for (const [size, filename] of icons) {
  console.log(filename, size, await renderIcon(size, filename), 'bytes');
}

const pngs = ['icon-16.png', 'icon-32.png', 'icon-48.png'].map((name, index) => ({
  size: [16, 32, 48][index],
  data: fs.readFileSync(path.join(PUB, name)),
}));
const headerSize = 6 + 16 * pngs.length;
const total = headerSize + pngs.reduce((sum, png) => sum + png.data.length, 0);
const ico = Buffer.alloc(total);
ico.writeUInt16LE(0, 0);
ico.writeUInt16LE(1, 2);
ico.writeUInt16LE(pngs.length, 4);
let offset = headerSize;
pngs.forEach((png, index) => {
  const entry = 6 + index * 16;
  const dim = png.size >= 256 ? 0 : png.size;
  ico[entry] = dim;
  ico[entry + 1] = dim;
  ico[entry + 2] = 0;
  ico[entry + 3] = 0;
  ico.writeUInt16LE(1, entry + 4);
  ico.writeUInt16LE(32, entry + 6);
  ico.writeUInt32LE(png.data.length, entry + 8);
  ico.writeUInt32LE(offset, entry + 12);
  png.data.copy(ico, offset);
  offset += png.data.length;
});
fs.writeFileSync(path.join(PUB, 'favicon.ico'), ico);
console.log('favicon.ico', ico.length, 'bytes');
for (const name of ['icon-16.png', 'icon-32.png', 'icon-48.png']) {
  fs.unlinkSync(path.join(PUB, name));
}

await page.setViewport({ width: 1200, height: 630, deviceScaleFactor: 1 });
const ogHtml = `<!doctype html><html><head><style>
  html,body{margin:0;padding:0;width:1200px;height:630px;overflow:hidden}
  body{background:radial-gradient(120% 150% at 12% -10%, rgba(59,130,246,.28), transparent 55%),radial-gradient(100% 140% at 92% 0%, rgba(139,92,246,.24), transparent 55%),#0b0e14;color:#eef2f8;font-family:'Segoe UI',Arial,sans-serif;display:flex;flex-direction:column;justify-content:center;padding:72px;box-sizing:border-box;position:relative}
  .brand{display:flex;align-items:center;gap:20px;margin-bottom:34px}
  .brand svg{width:86px;height:86px;display:block}
  .brand .name{font-size:34px;font-weight:700;letter-spacing:-.01em}
  h1{font-size:64px;line-height:1.06;letter-spacing:-.035em;margin:0 0 18px;max-width:980px;font-weight:700}
  h1 span{color:#93b8ff}
  p{font-size:25px;line-height:1.4;color:#a9b4c4;margin:0 0 30px;max-width:920px}
  .chips{display:flex;gap:12px;flex-wrap:wrap}
  .chip{font-size:18px;color:#c9d3e2;border:1px solid #303a4b;background:#161b25;padding:8px 16px;border-radius:999px}
  .url{position:absolute;left:72px;bottom:44px;font-size:19px;color:#78849a;font-family:ui-monospace,Consolas,monospace}
</style></head><body>
  <div class="brand">${svg}<span class="name">GameDev Toolkit</span></div>
  <h1>77 game development tools.<br/><span>Nothing leaves your browser.</span></h1>
  <p>3D models · textures · sprites · images · audio · animation · Unity utilities · developer data</p>
  <div class="chips"><span class="chip">Local processing</span><span class="chip">No uploads</span><span class="chip">Free</span></div>
  <div class="url">givingsiam8-max.github.io/gamedev-toolkit</div>
</body></html>`;
await page.setContent(ogHtml, { waitUntil: 'load' });
await page.screenshot({ path: path.join(PUB, 'og-image.jpg'), type: 'jpeg', quality: 84 });
console.log('og-image.jpg', fs.statSync(path.join(PUB, 'og-image.jpg')).size, 'bytes');

await browser.close();
