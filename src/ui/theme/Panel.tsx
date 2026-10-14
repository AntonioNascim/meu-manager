import type { ReactNode } from 'react'

/**
 * Cartão do tema. `cut` corta o canto superior direito, `striped` põe o fundo listrado (cartões de destaque)
 * e `glow` troca a borda pela cor de destaque (avisos).
 */
export function Panel({
  children,
  cut = false,
  striped = false,
  glow = false,
  className = '',
  'data-testid': testId,
}: {
  children: ReactNode
  cut?: boolean
  striped?: boolean
  glow?: boolean
  className?: string
  'data-testid'?: string
}) {
  const border = glow ? 'border-accent/70 bg-accent/[0.06]' : 'border-line'
  const fill = striped ? 'stripes' : glow ? '' : 'bg-surface'
  return <section data-testid={testId} className={`rounded-2xl border ${border} ${fill} ${cut ? 'cut-corner' : ''} ${className}`}>{children}</section>
}

/** Rótulo pequeno em caixa alta, para títulos de cartão e legendas. */
export function Eyebrow({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <span className={`text-[11px] font-bold uppercase tracking-[0.14em] text-muted ${className}`}>{children}</span>
}
