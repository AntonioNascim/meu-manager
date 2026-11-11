import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'

/**
 * Janela por cima da tela: sobe de baixo (`bottom`, para negociações) ou aparece no centro (`center`, para filtros).
 * Fecha tocando fora, no X ou com Esc. `footer` fica fixo embaixo, fora da rolagem.
 */
export function Sheet({
  title,
  onClose,
  children,
  footer,
  placement = 'bottom',
}: {
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  placement?: 'bottom' | 'center'
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  const bottom = placement === 'bottom'
  const content = (
    <div className={`fixed inset-0 z-40 flex bg-black/65 ${bottom ? 'items-end' : 'items-center px-3'}`} onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className={`sheet-in mx-auto flex max-h-[92dvh] w-full max-w-xl flex-col border border-accent/50 bg-gradient-to-b from-[#0f1b1e] to-[#070d0f] shadow-[0_-10px_40px_rgb(0_0_0/0.6)] ${bottom ? 'rounded-t-[20px] border-b-0' : 'rounded-2xl'}`}
      >
        <header className="flex items-center justify-between gap-3 px-5 pb-2 pt-5">
          <h2 className="title text-2xl">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Fechar" className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/[0.13] text-muted text-lg font-bold text-slate-200">
            ×
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 pb-4">{children}</div>
        {footer && <footer className="border-t border-line px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">{footer}</footer>}
      </div>
    </div>
  )
  // Fora de qualquer cartão (um recorte ou transformação no cartão prenderia a janela dentro dele).
  return typeof document === 'undefined' ? content : createPortal(content, document.body)
}
