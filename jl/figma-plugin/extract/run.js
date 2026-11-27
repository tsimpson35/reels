// Reads every prototype screen into JSON for the Figma plugin.
const puppeteer = require('puppeteer-core');
const fs = require('fs'), path = require('path');
const ROOT = path.join(process.env.HOME, 'Desktop/JoinLinks Prototype');
const OUT = path.join(ROOT, 'figma-data');
fs.mkdirSync(OUT, { recursive: true });
const extractor = fs.readFileSync(path.join(__dirname, 'extractor.js'), 'utf8');
const SHOTS = JSON.parse(fs.readFileSync(path.join(__dirname, 'shots.json'), 'utf8'));
const NAMES = JSON.parse(fs.readFileSync(path.join(__dirname, 'names.json'), 'utf8'));
const only = process.argv.slice(2);

(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new', userDataDir: path.join(__dirname, 'profile'),
    args: ['--no-first-run', '--no-default-browser-check', '--hide-scrollbars']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  const index = [];
  for (const [key, state] of Object.entries(SHOTS)) {
    if (only.length && !only.includes(key)) continue;
    const url = 'http://localhost:8899/v3.html#' + encodeURIComponent(JSON.stringify(state));
    await page.goto('about:blank');
    await page.goto(url, { waitUntil: 'networkidle0' });
    await page.evaluate(() => document.fonts.ready);
    await new Promise(r => setTimeout(r, 1500));
    const tree = await page.evaluate(`(${extractor})(${JSON.stringify({ name: NAMES[key] || key })})`);
    const images = {}; let n = 0; const seen = new Map();
    (function dedupe(nd) {
      for (const k of ['data', 'bgImage']) if (nd[k]) { let id = seen.get(nd[k]); if (!id) { id = 'i' + (n++); seen.set(nd[k], id); images[id] = nd[k]; } nd[k] = id; }
      (nd.children || []).forEach(dedupe);
    })(tree);
    fs.writeFileSync(path.join(OUT, key + '.json'), JSON.stringify({ tree, images }));
    const kb = Math.round(fs.statSync(path.join(OUT, key + '.json')).size / 1024);
    console.log(key, Math.round(tree.h) + 'px', kb + 'KB');
    index.push({ key, name: NAMES[key] || key, h: tree.h });
  }
  if (!only.length) fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(index));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
