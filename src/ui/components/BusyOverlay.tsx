/** Tela de progresso das operações pesadas ("Preparando a temporada…"): cobre a tela e segura os toques até terminar. */
export function BusyOverlay({ label }: { label: string }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-bg/90 px-6 text-center backdrop-blur-sm" role="status" aria-live="polite" data-testid="busy-overlay">
      <div className="h-12 w-12 animate-spin rounded-full border-4 border-line border-t-accent" aria-hidden="true" />
      <p className="title text-2xl">{label}</p>
      <p className="max-w-xs text-sm text-muted">Isto pode levar alguns segundos num celular mais simples. Não feche o jogo.</p>
    </div>
  )
}
