/**
 * PWA no navegador: registra o service worker (só em produção), avisa quando há versão nova e guarda o
 * pedido de instalação do Chrome/Android. No iPhone (Safari) não há pedido: a tela mostra o passo a passo.
 */
import { useSyncExternalStore } from 'react'

export interface PwaState {
  /** O app já está guardado para abrir sem internet. */
  offlineReady: boolean
  /** Há uma versão nova esperando; `applyUpdate` troca e recarrega. */
  updateReady: boolean
  /** O navegador deixa instalar agora (Chrome/Edge/Android): `promptInstall` abre o pedido. */
  canInstall: boolean
  /** Já está rodando como app instalado. */
  standalone: boolean
  /** Safari de iPhone/iPad fora do app instalado: instalar é pelo menu Compartilhar. */
  iosHint: boolean
}

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let state: PwaState = { offlineReady: false, updateReady: false, canInstall: false, standalone: false, iosHint: false }
const listeners = new Set<() => void>()
let deferredPrompt: BeforeInstallPromptEvent | null = null
let waiting: ServiceWorker | null = null

function update(change: Partial<PwaState>) {
  state = { ...state, ...change }
  listeners.forEach((l) => l())
}

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia?.('(display-mode: standalone)').matches === true || (navigator as Navigator & { standalone?: boolean }).standalone === true
}

export function isIosSafari(userAgent: string = typeof navigator === 'undefined' ? '' : navigator.userAgent): boolean {
  return /iphone|ipad|ipod/i.test(userAgent) && /safari/i.test(userAgent) && !/crios|fxios|edgios/i.test(userAgent)
}

/** Liga tudo (chamar uma vez, em `main.tsx`). */
export function initPwa(): void {
  if (typeof window === 'undefined') return
  const standalone = isStandalone()
  update({ standalone, iosHint: !standalone && isIosSafari() })

  // Em desenvolvimento, &instalar=1 simula o pedido de instalação do navegador (para ver a faixa).
  if (import.meta.env.DEV && new URLSearchParams(window.location.search).get('instalar')) update({ canInstall: true })

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    deferredPrompt = event as BeforeInstallPromptEvent
    update({ canInstall: true })
  })
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null
    update({ canInstall: false, standalone: true, iosHint: false })
  })

  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return
  navigator.serviceWorker
    .register('./sw.js')
    .then((registration) => {
      const watch = (worker: ServiceWorker | null) => {
        if (!worker) return
        worker.addEventListener('statechange', () => {
          if (worker.state !== 'installed') return
          // Com um service worker já ativo, "installed" é uma versão nova esperando; sem ele, é a primeira instalação.
          if (navigator.serviceWorker.controller) {
            waiting = worker
            update({ updateReady: true })
          } else update({ offlineReady: true })
        })
      }
      if (registration.waiting && navigator.serviceWorker.controller) {
        waiting = registration.waiting
        update({ updateReady: true })
      }
      if (registration.active) update({ offlineReady: true })
      watch(registration.installing)
      registration.addEventListener('updatefound', () => watch(registration.installing))
    })
    .catch(() => {
      // Sem service worker o jogo funciona igual, só não abre offline.
    })

  let reloading = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return
    reloading = true
    window.location.reload()
  })
}

/** Troca para a versão nova (o jogo já foi salvo automaticamente) e recarrega. */
export function applyUpdate(): void {
  waiting?.postMessage('SKIP_WAITING')
}

/** Abre o pedido de instalação do navegador. */
export async function promptInstall(): Promise<boolean> {
  if (!deferredPrompt) return false
  const prompt = deferredPrompt
  deferredPrompt = null
  update({ canInstall: false })
  await prompt.prompt()
  return (await prompt.userChoice).outcome === 'accepted'
}

export function usePwa(): PwaState {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => state,
    () => state,
  )
}
