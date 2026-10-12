import type { ReactNode } from 'react'
import type { Team } from '../../engine/types'

/** Escudo simples com as cores e a sigla do time. */
export function TeamBadge({ team, size = 'md' }: { team: Pick<Team, 'abbreviation' | 'colors'>; size?: 'sm' | 'md' | 'lg' }) {
  const box = size === 'lg' ? 'h-16 w-16 text-lg' : size === 'sm' ? 'h-7 w-7 text-[10px]' : 'h-10 w-10 text-xs'
  return (
    <span
      className={`${box} inline-flex shrink-0 items-center justify-center rounded-full border-2 font-bold`}
      style={{ background: team.colors[0], color: team.colors[1], borderColor: team.colors[1] }}
    >
      {team.abbreviation}
    </span>
  )
}

export function Card({ title, children, className = '' }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl bg-slate-800 p-4 shadow ${className}`}>
      {title && <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{title}</h2>}
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
  const color = variant === 'primary' ? 'bg-emerald-500 text-slate-950 hover:bg-emerald-400' : 'bg-slate-700 text-slate-100 hover:bg-slate-600'
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`min-h-12 rounded-xl px-5 font-semibold transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 ${color} ${className}`}
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
