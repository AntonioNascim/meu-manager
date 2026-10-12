import type { ReactNode } from 'react'
import type { Team } from '../../engine/types'
import { Crest } from '../theme'

/** Escudo do time (as cores e a sigla). Mantém o nome antigo; o desenho está em theme/Crest. */
export function TeamBadge({ team, size = 'md' }: { team: Pick<Team, 'abbreviation' | 'colors'>; size?: 'sm' | 'md' | 'lg' }) {
  return <Crest team={team} size={size} />
}

export function Card({ title, children, className = '', flush = false }: { title?: string; children: ReactNode; className?: string; flush?: boolean }) {
  return (
    <section className={`overflow-hidden rounded-2xl border border-line bg-surface ${flush ? '' : 'p-4'} ${className}`}>
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
}: {
  children: ReactNode
  onClick?: () => void
  disabled?: boolean
  variant?: 'primary' | 'secondary'
  className?: string
}) {
  const color = variant === 'primary' ? 'bg-accent text-accent-ink hover:brightness-110' : 'bg-surface-2 text-slate-100 ring-1 ring-line hover:bg-slate-700'
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`min-h-12 rounded-xl px-5 font-bold transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 ${color} ${className}`}
    >
      {children}
    </button>
  )
}

/** Barra de abas (rolável no celular). */
export function Tabs<T extends string>({ value, options, onChange }: { value: T; options: { id: T; label: string }[]; onChange: (id: T) => void }) {
  return (
    <div className="flex gap-1 rounded-xl bg-slate-800 p-1">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          className={`min-h-10 flex-1 rounded-lg px-3 text-sm font-semibold ${value === o.id ? 'bg-emerald-500 text-slate-950' : 'text-slate-300'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Segmented<T extends string | number>({ value, options, onChange }: { value: T; options: { id: T; label: string }[]; onChange: (id: T) => void }) {
  return (
    <div className="flex gap-1">
      {options.map((o) => (
        <button
          key={String(o.id)}
          type="button"
          onClick={() => onChange(o.id)}
          className={`min-h-11 flex-1 rounded-lg px-1 text-xs font-semibold leading-tight ${value === o.id ? 'bg-emerald-500 text-slate-950' : 'bg-slate-700 text-slate-200'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
