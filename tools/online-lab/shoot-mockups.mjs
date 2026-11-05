// Fotografa cada tela de um arquivo de mockups (<section class="phone" id="sNN">) em 380 px para .shots/.
// Uso: node shoot-mockups.mjs <index.html> <prefixo> id=nome id=nome ...
import { chromium } from 'playwright'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
const [file, prefix, ...pairs] = process.argv.slice(2)
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1700, height: 1000 }, deviceScaleFactor: 2 })
await page.goto(pathToFileURL(resolve(file)).href)
await page.evaluate(() => document.fonts.ready)
for (const p of pairs) {
  const [id, name] = p.split('=')
  const out = resolve('../../.shots', `${prefix}-${name}.png`)
  await page.locator(`#${id}`).screenshot({ path: out })
  console.log(out)
}
await browser.close()
