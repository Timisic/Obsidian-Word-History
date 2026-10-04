import { readFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { chromium } from 'playwright';

const [input, output, widthArg = '780'] = process.argv.slice(2);
if (!input || !output || !input.toLowerCase().endsWith('.svg') || !output.toLowerCase().endsWith('.png')) {
  throw new Error('Usage: node scripts/render_png.mjs input.svg output.png [CSS width|intrinsic]');
}
const svg = await readFile(input, 'utf8');
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ deviceScaleFactor: 2, locale: 'en-US', timezoneId: 'UTC', serviceWorkers: 'block' });
  await context.route('**/*', route => route.abort());
  const page = await context.newPage();
  const dimensions = await page.evaluate(({ svg, widthArg }) => {
    const document = new DOMParser().parseFromString(svg, 'image/svg+xml');
    const root = document.documentElement;
    if (root.localName !== 'svg' || document.querySelector('parsererror')) throw new Error('Input must be valid SVG');
    const box = root.getAttribute('viewBox')?.trim().split(/[\s,]+/).map(Number);
    if (!box || box.length !== 4 || !box.every(Number.isFinite) || box[2] <= 0 || box[3] <= 0) throw new Error('SVG must have a positive viewBox');
    const width = widthArg === 'intrinsic' ? box[2] : Number(widthArg);
    const height = width * box[3] / box[2];
    if (!Number.isFinite(width) || width <= 0 || width > 8192 || height > 8192) throw new Error('Invalid or excessive output dimensions');
    root.setAttribute('width', String(width));
    root.setAttribute('height', String(height));
    return { width, height, svg: new XMLSerializer().serializeToString(root) };
  }, { svg, widthArg });
  await page.setViewportSize({ width: Math.ceil(dimensions.width), height: Math.ceil(dimensions.height) });
  await page.setContent(`<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:"><style>html,body{margin:0;padding:0;background:white}img{display:block}</style><img alt="">`);
  await page.locator('img').evaluate((img, dimensions) => {
    img.width = dimensions.width;
    img.style.width = `${dimensions.width}px`;
    img.style.height = `${dimensions.height}px`;
    img.src = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(dimensions.svg)))}`;
  }, dimensions);
  await page.locator('img').evaluate(async img => { await img.decode(); await document.fonts.ready; });
  await mkdir(dirname(resolve(output)), { recursive: true });
  let previous;
  for (let attempt = 0; attempt < 5; attempt++) {
    const png = await page.locator('img').screenshot({ type: 'png', animations: 'disabled' });
    if (previous?.equals(png)) {
      const { writeFile } = await import('node:fs/promises');
      await writeFile(output, png);
      console.log(`Rendered ${input} to ${output} at 2x`);
      break;
    }
    if (attempt === 4) throw new Error('SVG did not produce a stable screenshot');
    previous = png;
    await page.waitForTimeout(100);
  }
} finally {
  await browser.close();
}
