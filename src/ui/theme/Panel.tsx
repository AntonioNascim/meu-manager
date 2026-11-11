import type { ReactNode } from 'react'
import { Icon } from './icons'
import type { IconName } from './icons'

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

/** Título de cartão (Barlow Condensed, com ícone verde opcional). */
export function Eyebrow({ children, className = '', icon }: { children: ReactNode; className?: string; icon?: IconName }) {
  return (
    <span className={`inline-flex items-center gap-2 font-display text-xl font-bold leading-tight text-white ${className}`}>
      {icon && <Icon name={icon} size={22} className="text-accent" />}
      {children}
    </span>
  )
}
