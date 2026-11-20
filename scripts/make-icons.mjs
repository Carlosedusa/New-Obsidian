// Gera os PNGs do PWA a partir de public/icons/icon.svg usando o Chromium do Playwright.
// Usa o Playwright local, ou PLAYWRIGHT_PATH (ex.: instalação global).
const { chromium } = await import(process.env.PLAYWRIGHT_PATH ?? 'playwright');
import { readFileSync } from 'node:fs';

const svg = readFileSync('public/icons/icon.svg', 'utf8');
const targets = [
  ['apple-touch-icon.png', 180, 0],
  ['icon-192.png', 192, 0],
  ['icon-512.png', 512, 0],
  ['icon-maskable-512.png', 512, 0.12], // margem p/ a "safe zone" de ícones mascaráveis
];
const browser = await chromium.launch();
const page = await browser.newPage();
for (const [name, size, pad] of targets) {
  await page.setViewportSize({ width: size, height: size });
  const inset = Math.round(size * pad);
  await page.setContent(`<body style="margin:0;background:#0b1020"><div style="padding:${inset}px;width:${size - 2 * inset}px;height:${size - 2 * inset}px">${svg.replace('<svg ', '<svg width="100%" height="100%" ')}</div></body>`);
  await page.screenshot({ path: `public/icons/${name}`, omitBackground: false });
  console.log('ok', name);
}
await browser.close();
