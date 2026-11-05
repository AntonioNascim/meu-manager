import { useEffect, useRef, useState } from 'react'
import { ONLINE_CONFIG } from '../../../online/config'

interface TurnstileApi {
  render(el: HTMLElement, options: { sitekey: string; theme: string; callback: (token: string) => void; 'error-callback': () => void; 'expired-callback': () => void }): string
  remove(id: string): void
}
declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

const SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
let loading: Promise<void> | undefined

function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve()
  loading ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement('script')
    s.src = SCRIPT
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => {
      loading = undefined
      reject(new Error('script'))
    }
    document.head.appendChild(s)
  })
  return loading
}

/**
 * Checagem de que é uma pessoa (Turnstile do Cloudflare, modo Gerenciado: quase sempre invisível). Chama `onToken` com o código de uso único.
 * Em desenvolvimento, `VITE_TURNSTILE_BYPASS=1` dispensa o widget.
 */
export function Turnstile({ onToken }: { onToken: (token: string | null) => void }) {
  const box = useRef<HTMLDivElement>(null)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (ONLINE_CONFIG.turnstileBypass) {
      onToken('dev-bypass')
      return
    }
    let id: string | undefined
    let alive = true
    setFailed(false)
    loadScript()
      .then(() => {
        if (!alive || !box.current || !window.turnstile) return
        id = window.turnstile.render(box.current, {
          sitekey: ONLINE_CONFIG.turnstileSiteKey,
          theme: 'dark',
          callback: (token) => onToken(token),
          'error-callback': () => {
            onToken(null)
            setFailed(true)
          },
          'expired-callback': () => onToken(null),
        })
      })
      .catch(() => alive && setFailed(true))
    return () => {
      alive = false
      if (id && window.turnstile) window.turnstile.remove(id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt])

  if (ONLINE_CONFIG.turnstileBypass) return <p className="text-xs text-muted">Verificação dispensada (modo de desenvolvimento).</p>
  return (
    <div className="flex flex-col gap-2">
      <div ref={box} />
      {failed && (
        <div className="flex items-center gap-3 text-sm text-loss">
          <span className="flex-1">Não deu para fazer a verificação. Confira a internet.</span>
          <button type="button" className="min-h-12 rounded-xl px-3 font-semibold text-accent" onClick={() => setAttempt((n) => n + 1)}>
            Tentar de novo
          </button>
        </div>
      )}
    </div>
  )
}
