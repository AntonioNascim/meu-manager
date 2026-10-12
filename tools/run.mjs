// Compila tools/<nome>.ts com o Vite (modo SSR, sem alterar o código do jogo) e executa com o Node.
// Uso: node tools/run.mjs analyze [argumentos]
import { build } from 'vite'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'

const [name, ...args] = process.argv.slice(2)
if (!name) {
  console.error('Uso: node tools/run.mjs <ferramenta> [argumentos]')
  process.exit(1)
}

const outDir = resolve('node_modules/.cache/tools')
await build({
  configFile: false,
  logLevel: 'error',
  build: {
    ssr: resolve('tools', `${name}.ts`),
    outDir,
    emptyOutDir: true,
    minify: false,
    rollupOptions: { output: { entryFileNames: `${name}.mjs` } },
  },
})

process.argv = [process.argv[0], name, ...args]
await import(pathToFileURL(resolve(outDir, `${name}.mjs`)).href)
