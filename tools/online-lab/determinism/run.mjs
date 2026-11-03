// Compara o motor no V8 (Node) com o motor no WebKit (o motor do Safari/iPhone), via Playwright.
import { build } from 'esbuild'
import { webkit, chromium } from 'playwright'
import { fileURLToPath } from 'node:url'
const out = fileURLToPath(new URL('./bundle.js', import.meta.url))
await build({ entryPoints: [fileURLToPath(new URL('./entry.ts', import.meta.url))], bundle: true, format: 'iife', globalName: 'Lab', outfile: out, logLevel: 'error', target: 'es2022' })
const N = Number(process.argv[2] ?? 300)
const { readFileSync } = await import('node:fs')
const code = readFileSync(out, 'utf8')
const node = new Function(code + '; return Lab;')().compute(N)
const compare = (name, r) => {
  const diffMatch = r.hashes.filter((h, i) => h !== node.hashes[i]).length
  const diffExp = r.exp.filter((h, i) => h !== node.exp[i]).length
  console.log(`${name}: partidas diferentes ${diffMatch}/${r.hashes.length} · valores exp/pow diferentes ${diffExp}/${r.exp.length}`)
}
console.log(`Node ${process.version} (V8): ${node.hashes.length} partidas, ${node.exp.length} valores exp/pow`)
for (const [name, type] of [['Chromium (V8)', chromium], ['WebKit (JavaScriptCore, Safari)', webkit]]) {
  try {
    const b = await type.launch(); const p = await b.newPage()
    await p.addScriptTag({ content: code })
    const r = await p.evaluate((n) => window.Lab.compute(n), N)
    compare(name, r); await b.close()
  } catch (e) { console.log(name, 'não rodou:', String(e).split('\n')[0]) }
}
