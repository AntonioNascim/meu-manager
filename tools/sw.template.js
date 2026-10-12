/* Service worker do Meu Manager. Gerado no build (tools/pwaPlugin.ts): o nome do cache e a lista de arquivos abaixo são preenchidos lá. */
const CACHE = 'meu-manager-__VERSION__'
const PRECACHE = __PRECACHE__

self.addEventListener('install', (event) => {
  // Guarda o app inteiro (HTML, JS, CSS, ícones) para abrir sem internet.
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE.map((url) => new Request(new URL(url, self.location).href, { cache: 'reload' })))))
})

// A versão nova só assume quando o jogador toca em "Atualizar" (ou fecha o app), para não trocar o jogo no meio de uma partida.
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith('meu-manager-') && key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

async function navigate(request) {
  // Online: pega a página mais nova (com 3 s de paciência). Sem rede: abre a que está guardada.
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 3000)
    const response = await fetch(request, { signal: controller.signal })
    clearTimeout(timer)
    if (response.ok) {
      const cache = await caches.open(CACHE)
      cache.put(new URL('./index.html', self.registration.scope), response.clone())
      return response
    }
  } catch {
    // sem rede: cai para o cache
  }
  const cached = await caches.match(new URL('./index.html', self.registration.scope))
  return cached || Response.error()
}

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (request.mode === 'navigate') {
    event.respondWith(navigate(request))
    return
  }
  // Arquivos do app têm nome com hash: o que está no cache vale; o que faltar vem da rede e fica guardado.
  event.respondWith(
    caches.match(request).then(
      (hit) =>
        hit ||
        fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone()
            caches.open(CACHE).then((cache) => cache.put(request, copy))
          }
          return response
        }),
    ),
  )
})
