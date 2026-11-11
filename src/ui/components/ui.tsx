import type { ReactNode } from 'react'
import type { Team } from '../../engine/types'
import { Crest } from '../theme'

/** Escudo do time (as cores e a sigla). Mantém o nome antigo; o desenho está em theme/Crest. */
export function TeamBadge({ team, size = 'md' }: { team: Pick<Team, 'abbreviation' | 'colors'>; size?: 'sm' | 'md' | 'lg' }) {
  return <Crest team={team} size={size} />
}

export function Card({ title, children, className = '', flush = false }: { title?: string; children: ReactNode; className?: string; flush?: boolean }) {
  return (
    <section className={`card-bg overflow-hidden rounded-[14px] border border-white/[0.13] ${flush ? '' : 'p-4'} ${className}`}>
      {title && <h2 className={`text-[11px] font-bold uppercase tracking-[0.14em] text-muted ${flush ? 'px-3 py-2' : 'mb-2'}`}>{title}</h2>}
      {children}
    </section>
  )
}

export function Button({
  children,
  onClick,
  disabled,
  variant = 'primary',
  className = '',
  'data-testid': testId,
}: {
  children: ReactNode
  onClick?: () => void
  disabled?: boolean
  variant?: 'primary' | 'secondary' | 'outline' | 'danger'
  className?: string
  'data-testid'?: string
}) {
  const color = { primary: 'btn-primary', secondary: 'btn-dark text-white', outline: 'border-[1.5px] border-accent bg-accent/[0.08] text-white', danger: 'border-[1.5px] border-loss bg-loss/[0.08] text-[#ffd6d6]' }[variant]
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
      className={`min-h-12 rounded-[10px] px-5 font-display text-[19px] font-bold tracking-[0.02em] transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 ${color} ${className}`}
    >
      {children}
    </button>
  )
}

/** Barra de abas (rolável no celular). */
export function Tabs<T extends string>({ value, options, onChange }: { value: T; options: { id: T; label: string }[]; onChange: (id: T) => void }) {
  return (
    <div className="flex gap-1 overflow-x-auto rounded-xl border border-white/[0.07] bg-[#070d0f] p-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="tablist">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          className={`min-h-11 flex-1 shrink-0 whitespace-nowrap rounded-[9px] px-3 text-sm font-semibold ${value === o.id ? 'tab-on font-bold text-white' : 'text-slate-100'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** Botões de escolha única. `columns`: em grade com esse número de colunas (opções com nome comprido, como os estilos de jogo), em vez de uma linha só. */
export function Segmented<T extends string | number>({ value, options, onChange, columns }: { value: T; options: { id: T; label: string }[]; onChange: (id: T) => void; columns?: number }) {
  return (
    <div className={columns ? 'grid gap-1' : 'flex gap-1'} style={columns ? { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` } : undefined}>
      {options.map((o) => (
        <button
          key={String(o.id)}
          type="button"
          onClick={() => onChange(o.id)}
          className={`min-h-11 min-w-0 flex-1 rounded-lg px-1 font-semibold leading-tight ${options.length >= 5 && !columns ? 'text-[11px]' : 'text-xs'} ${value === o.id ? 'tab-on font-bold text-white' : 'border border-white/[0.1] bg-surface-2 text-slate-200'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
