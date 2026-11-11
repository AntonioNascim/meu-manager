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
  const border = glow ? 'border-accent/45 shadow-[inset_0_0_30px_rgb(39_224_90/0.07),0_0_18px_rgb(39_224_90/0.12)]' : 'border-white/[0.13]'
  const fill = striped ? 'stripes' : 'card-bg'
  return <section data-testid={testId} className={`rounded-[14px] border ${border} ${fill} ${cut ? 'cut-corner' : ''} ${className}`}>{children}</section>
}

/** Rótulo pequeno em caixa alta, para títulos de cartão e legendas. */
export function Eyebrow({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <span className={`text-[11px] font-bold uppercase tracking-[0.14em] text-muted ${className}`}>{children}</span>
}
