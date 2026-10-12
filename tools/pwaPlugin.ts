/**
 * Plugin do Vite que gera o service worker no build: junta a lista de tudo que o app precisa para abrir
 * offline (arquivos do bundle e da pasta public) e grava `sw.js` a partir de `tools/sw.template.js`.
 */
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import type { Plugin } from 'vite'

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? listFiles(path) : [path]
  })
}

/** Lista de URLs (relativas à raiz do app) que o service worker guarda na instalação. */
export function precacheList(bundleFiles: readonly string[], publicFiles: readonly string[]): string[] {
  const files = [...bundleFiles, ...publicFiles].filter((f) => !f.endsWith('.map') && f !== 'sw.js')
  return ['./', ...new Set([...files, 'index.html'])].sort()
}

/** Texto do service worker. `salt` (hash do conteúdo do app) faz o nome do cache mudar a cada versão nova. */
export function renderServiceWorker(template: string, precache: readonly string[], salt = ''): string {
  const version = createHash('sha256').update(precache.join('\n') + salt).digest('hex').slice(0, 10)
  return template.replace('__VERSION__', version).replace('__PRECACHE__', JSON.stringify(precache))
}

export function pwaPlugin(): Plugin {
  const publicDir = 'public'
  return {
    name: 'meu-manager-pwa',
    apply: 'build',
    generateBundle(_options, bundle) {
      const publicFiles = listFiles(publicDir).map((f) => relative(publicDir, f).split(sep).join('/'))
      const contents = Object.values(bundle)
        .map((item) => (item.type === 'chunk' ? item.code : String(item.source)))
        .join('')
      const salt = createHash('sha256').update(contents).digest('hex')
      const template = readFileSync(join('tools', 'sw.template.js'), 'utf8')
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: renderServiceWorker(template, precacheList(Object.keys(bundle), publicFiles), salt) })
    },
  }
}
