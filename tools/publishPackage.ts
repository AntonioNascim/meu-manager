// Prepara a publicação do pacote real (Fase 6, B3). Não envia nada: grava em dist-pacote/ o arquivo comprimido e o índice, e mostra os comandos de envio.
// Uso: node tools/run.mjs publishPackage [--notas "texto"] [--indice <caminho do index.json já publicado>] [--saida dist-pacote]
// A versão vem de data/versao.json (a mesma da cópia embutida no jogo): atualize esse arquivo junto com data/pacote-real.json.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { buildRelease } from './realdata/release'

const args = process.argv.slice(2)
const arg = (name: string): string | undefined => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : undefined
}

const meta = JSON.parse(readFileSync('data/versao.json', 'utf8')) as { id: string; version: string }
const jsonText = readFileSync('data/pacote-real.json', 'utf8')
const indexPath = arg('indice')
const existing = indexPath && existsSync(indexPath) ? JSON.parse(readFileSync(indexPath, 'utf8')) : undefined
const out = resolve(arg('saida') ?? 'dist-pacote')

const release = buildRelease({ jsonText, id: meta.id, version: meta.version, publishedAt: new Date().toISOString().slice(0, 10), notes: arg('notas'), existing })
const filePath = join(out, release.listing.path)
mkdirSync(dirname(filePath), { recursive: true })
writeFileSync(filePath, release.gz)
writeFileSync(join(out, 'index.json'), JSON.stringify(release.index, null, 2) + '\n')

const mb = (n: number) => (n / 1048576).toFixed(2) + ' MB'
console.log(`${release.listing.id}@${release.listing.version}${release.alreadyPublished ? ' (já estava no índice, mesmo conteúdo)' : ''}`)
console.log(`  JSON ${mb(release.listing.jsonBytes)} → gzip ${mb(release.listing.gzipBytes)}  sha256 ${release.listing.sha256}`)
console.log(`  gravado em ${filePath} e ${join(out, 'index.json')} (${release.index.packages.length} versão(ões) no índice)`)
console.log('\nPara enviar (precisa da conta Cloudflare; o arquivo da versão primeiro, o índice por último):')
console.log(`  wrangler r2 object put meu-manager-pacotes/${release.listing.path} --file "${filePath}" --content-type application/gzip --remote`)
console.log(`  wrangler r2 object put meu-manager-pacotes/index.json --file "${join(out, 'index.json')}" --content-type application/json --remote`)
