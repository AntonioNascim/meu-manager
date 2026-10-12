import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { describe, expect, it } from 'vitest'
import { isIosSafari } from '../src/pwa/pwa'
import { precacheList, renderServiceWorker } from '../tools/pwaPlugin'

const read = (path: string) => readFileSync(path, 'utf8')
const manifest = JSON.parse(read('public/manifest.webmanifest')) as {
  name: string
  short_name: string
  start_url: string
  scope: string
  display: string
  lang: string
  icons: { src: string; sizes: string; type: string; purpose: string }[]
}

/** Largura e altura de um PNG (cabeçalho IHDR). */
function pngSize(path: string): [number, number] {
  const buf = readFileSync(path)
  expect(buf.subarray(1, 4).toString()).toBe('PNG')
  return [buf.readUInt32BE(16), buf.readUInt32BE(20)]
}

describe('manifesto e ícones', () => {
  it('tem nome, modo app, caminhos relativos e ícones de verdade nos tamanhos declarados', () => {
    expect(manifest.name).toBe('Meu Manager')
    expect(manifest.display).toBe('standalone')
    expect(manifest.lang).toBe('pt-BR')
    expect(manifest.start_url.startsWith('/')).toBe(false)
    expect(manifest.scope.startsWith('/')).toBe(false)
    const png = manifest.icons.filter((i) => i.type === 'image/png')
    expect(png.some((i) => i.sizes === '192x192')).toBe(true)
    expect(png.some((i) => i.sizes === '512x512' && i.purpose === 'any')).toBe(true)
    expect(png.some((i) => i.purpose === 'maskable')).toBe(true)
    for (const icon of png) {
      const [w, h] = icon.sizes.split('x').map(Number)
      expect(pngSize(`public/${icon.src}`)).toEqual([w, h])
    }
  })

  it('o index.html liga o manifesto, o ícone do iPhone e a cor do tema', () => {
    const html = read('index.html')
    expect(html).toContain('rel="manifest" href="manifest.webmanifest"')
    expect(html).toContain('apple-touch-icon')
    expect(html).toContain('name="theme-color"')
    expect(pngSize('public/icons/apple-touch-icon.png')).toEqual([180, 180])
  })

  it('reconhece o Safari do iPhone (que instala pelo menu Compartilhar) e não o Chrome do iPhone', () => {
    expect(isIosSafari('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1')).toBe(true)
    expect(isIosSafari('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0 Mobile/15E148 Safari/604.1')).toBe(false)
    expect(isIosSafari('Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36')).toBe(false)
  })
})

describe('lista de arquivos do service worker', () => {
  it('junta o bundle e a pasta public, com o index.html e sem mapas nem o próprio sw.js', () => {
    const list = precacheList(['assets/a.js', 'assets/a.js.map', 'sw.js'], ['manifest.webmanifest', 'icons/icon-192.png'])
    expect(list).toEqual(['./', 'assets/a.js', 'icons/icon-192.png', 'index.html', 'manifest.webmanifest'])
  })

  it('o nome do cache muda quando o conteúdo do app muda', () => {
    const template = read('tools/sw.template.js')
    const list = precacheList(['assets/a.js'], [])
    const a = renderServiceWorker(template, list, 'versao-1')
    expect(renderServiceWorker(template, list, 'versao-1')).toBe(a)
    expect(renderServiceWorker(template, list, 'versao-2')).not.toBe(a)
    expect(a).not.toContain('__VERSION__')
    expect(a).not.toContain('__PRECACHE__')
  })
})

/** Roda o service worker gerado num ambiente de mentira (cache em memória, sem rede quando `online` é falso). */
function loadWorker(precache: string[], online: { value: boolean }, existingCaches: Record<string, Map<string, Response>> = {}) {
  const handlers: Record<string, ((event: unknown) => void)[]> = {}
  const stores = new Map<string, Map<string, Response>>(Object.entries(existingCaches))
  const keyOf = (r: Request | string | URL) => new URL(typeof r === 'string' || r instanceof URL ? String(r) : r.url, 'https://jogo.test/app/').href
  const caches = {
    async open(name: string) {
      const store = stores.get(name) ?? stores.set(name, new Map()).get(name)!
      return {
        async addAll(requests: Request[]) {
          for (const r of requests) store.set(keyOf(r), await fakeFetch(r))
        },
        async put(r: Request | URL | string, res: Response) {
          store.set(keyOf(r), res)
        },
      }
    },
    async match(r: Request | URL | string) {
      for (const store of stores.values()) {
        const hit = store.get(keyOf(r))
        if (hit) return hit.clone()
      }
      return undefined
    },
    async keys() {
      return [...stores.keys()]
    },
    async delete(name: string) {
      return stores.delete(name)
    },
  }
  const network = new Map<string, string>()
  for (const f of precache) network.set(new URL(f, 'https://jogo.test/app/').href, `conteudo de ${f}`)
  const fetched: string[] = []
  async function fakeFetch(r: Request | string) {
    const url = keyOf(r)
    fetched.push(url)
    if (!online.value || !network.has(url)) throw new TypeError('sem rede')
    return new Response(network.get(url), { status: 200 })
  }
  let skipped = false
  let claimed = false
  const self = {
    location: new URL('https://jogo.test/app/sw.js'),
    registration: { scope: 'https://jogo.test/app/' },
    clients: { claim: async () => { claimed = true } },
    skipWaiting: () => { skipped = true },
    addEventListener: (type: string, handler: (event: unknown) => void) => (handlers[type] ??= []).push(handler),
  }
  const template = readFileSync('tools/sw.template.js', 'utf8')
  const code = renderServiceWorker(template, precache, 'teste')
  vm.runInNewContext(code, { self, caches, fetch: fakeFetch, Request, Response, URL, AbortController, setTimeout, clearTimeout, console })

  const emit = async (type: string, event: Record<string, unknown>) => {
    const waits: Promise<unknown>[] = []
    const e = { ...event, waitUntil: (p: Promise<unknown>) => waits.push(p), respondWith: (p: Promise<Response> | Response) => waits.push(Promise.resolve(p).then((r) => ((e as { response?: Response }).response = r))) }
    for (const h of handlers[type] ?? []) h(e)
    await Promise.all(waits)
    return e as { response?: Response }
  }
  return { emit, stores, fetched, state: () => ({ skipped, claimed }) }
}

/** Node não deixa criar um Request de navegação: o service worker só lê url, method e mode. */
const navigation = (url: string) => ({ url, method: 'GET', mode: 'navigate' }) as unknown as Request

describe('service worker', () => {
  const files = ['./', 'index.html', 'assets/app-1.js', 'assets/app-1.css', 'manifest.webmanifest']

  it('na instalação guarda todos os arquivos; sem internet abre a página e os arquivos guardados', async () => {
    const online = { value: true }
    const sw = loadWorker(files, online)
    await sw.emit('install', {})
    const [cache] = [...sw.stores.values()]
    expect(cache!.size).toBe(files.length)

    online.value = false
    const page = await sw.emit('fetch', { request: navigation('https://jogo.test/app/') })
    expect(await page.response!.text()).toBe('conteudo de index.html')
    const asset = await sw.emit('fetch', { request: new Request('https://jogo.test/app/assets/app-1.js') })
    expect(await asset.response!.text()).toBe('conteudo de assets/app-1.js')
  })

  it('online, a navegação pega a página nova e a guarda; arquivo que faltava é guardado ao ser pedido', async () => {
    const online = { value: true }
    const sw = loadWorker([...files, 'assets/extra.js'], online)
    await sw.emit('install', {})
    const page = await sw.emit('fetch', { request: navigation('https://jogo.test/app/') })
    expect(page.response!.ok).toBe(true)
    const extra = await sw.emit('fetch', { request: new Request('https://jogo.test/app/assets/extra.js') })
    expect(await extra.response!.text()).toBe('conteudo de assets/extra.js')
    online.value = false
    const again = await sw.emit('fetch', { request: new Request('https://jogo.test/app/assets/extra.js') })
    expect(await again.response!.text()).toBe('conteudo de assets/extra.js')
  })

  it('ignora outros endereços e pedidos que não são GET', async () => {
    const sw = loadWorker(files, { value: true })
    await sw.emit('install', {})
    const foreign = await sw.emit('fetch', { request: new Request('https://outro.site/x.js') })
    expect(foreign.response).toBeUndefined()
    const post = await sw.emit('fetch', { request: new Request('https://jogo.test/app/', { method: 'POST' }) })
    expect(post.response).toBeUndefined()
  })

  it('ao ativar apaga caches de versões antigas e assume; a versão nova só entra com SKIP_WAITING', async () => {
    const old = { 'meu-manager-antigo': new Map<string, Response>(), 'outro-app': new Map<string, Response>() }
    const sw = loadWorker(files, { value: true }, old)
    await sw.emit('install', {})
    await sw.emit('activate', {})
    expect([...sw.stores.keys()].includes('meu-manager-antigo')).toBe(false)
    expect([...sw.stores.keys()].includes('outro-app')).toBe(true)
    expect(sw.state().claimed).toBe(true)
    expect(sw.state().skipped).toBe(false)
    await sw.emit('message', { data: 'SKIP_WAITING' })
    expect(sw.state().skipped).toBe(true)
  })
})
