import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'

export const inputClass = 'min-h-10 w-full rounded-lg border border-line bg-bg px-3 text-sm text-slate-100 placeholder:text-muted focus:border-accent focus:outline-none disabled:opacity-50'

export function Field({ label, hint, children, className = '' }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={`block space-y-1 ${className}`}>
      <span className="text-[11px] font-bold uppercase tracking-wider text-muted">{label}</span>
      {children}
      {hint && <span className="block text-xs text-muted">{hint}</span>}
    </label>
  )
}

export function TextField({ label, value, onChange, hint, placeholder, className, disabled }: { label: string; value: string | undefined; onChange: (v: string) => void; hint?: string; placeholder?: string; className?: string; disabled?: boolean }) {
  return (
    <Field label={label} {...(hint ? { hint } : {})} {...(className ? { className } : {})}>
      <input className={inputClass} value={value ?? ''} placeholder={placeholder} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
    </Field>
  )
}

/** Número inteiro ou decimal; apagar o campo devolve `undefined` (só em campos opcionais). */
export function NumberField({ label, value, onChange, min, max, step = 1, hint, optional = false, className }: { label: string; value: number | undefined; onChange: (v: number | undefined) => void; min?: number; max?: number; step?: number; hint?: string; optional?: boolean; className?: string }) {
  const [text, setText] = useState(value === undefined ? '' : String(value))
  useEffect(() => {
    if ((text === '' ? undefined : Number(text.replace(',', '.'))) !== value) setText(value === undefined ? '' : String(value))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])
  return (
    <Field label={label} {...(hint ? { hint } : {})} {...(className ? { className } : {})}>
      <input
        className={inputClass}
        inputMode="decimal"
        type="number"
        min={min}
        max={max}
        step={step}
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          if (e.target.value === '') {
            if (optional) onChange(undefined)
            return
          }
          const n = Number(e.target.value.replace(',', '.'))
          if (Number.isFinite(n)) onChange(n)
        }}
      />
    </Field>
  )
}

export function SelectField<T extends string>({ label, value, options, onChange, hint, className, empty }: { label: string; value: T | undefined; options: { id: T; label: string }[]; onChange: (v: T | undefined) => void; hint?: string; className?: string; empty?: string }) {
  return (
    <Field label={label} {...(hint ? { hint } : {})} {...(className ? { className } : {})}>
      <select className={inputClass} value={value ?? ''} onChange={(e) => onChange(e.target.value === '' ? undefined : (e.target.value as T))}>
        {empty !== undefined && <option value="">{empty}</option>}
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  )
}

export function CheckField({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <label className="flex min-h-10 items-start gap-2 text-sm">
      <input type="checkbox" className="mt-1 h-4 w-4 accent-[var(--color-accent)]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        {label}
        {hint && <span className="block text-xs text-muted">{hint}</span>}
      </span>
    </label>
  )
}

/** Cor `#rrggbb`: seletor do navegador e campo de texto juntos. */
export function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const valid = /^#[0-9a-fA-F]{6}$/.test(value)
  return (
    <Field label={label}>
      <div className="flex gap-2">
        <input type="color" aria-label={label} className="h-10 w-12 shrink-0 cursor-pointer rounded-lg border border-line bg-bg p-1" value={valid ? value : '#000000'} onChange={(e) => onChange(e.target.value)} />
        <input className={`${inputClass} ${valid ? '' : 'border-loss'}`} value={value} onChange={(e) => onChange(e.target.value)} />
      </div>
    </Field>
  )
}

/** Data `AAAA-MM-DD`. */
export function DateField({ label, value, onChange, hint, optional }: { label: string; value: string | undefined; onChange: (v: string | undefined) => void; hint?: string; optional?: boolean }) {
  return (
    <Field label={label} {...(hint ? { hint } : {})}>
      <input type="date" className={inputClass} value={value ?? ''} onChange={(e) => (e.target.value === '' && optional ? onChange(undefined) : onChange(e.target.value))} />
    </Field>
  )
}

export function Section({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="space-y-3 rounded-2xl border border-line bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted">{title}</h3>
        {right}
      </div>
      {children}
    </section>
  )
}

export function SmallButton({ children, onClick, danger = false, disabled, title, active = false }: { children: ReactNode; onClick?: () => void; danger?: boolean; disabled?: boolean; title?: string; active?: boolean }) {
  return (
    <button type="button" title={title} disabled={disabled} onClick={onClick} className={`min-h-10 rounded-lg px-3 text-sm font-bold ring-1 transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 ${active ? 'bg-accent text-accent-ink ring-accent' : danger ? 'bg-loss/10 text-loss ring-loss/40 hover:bg-loss/20' : 'bg-surface-2 text-slate-100 ring-line hover:bg-slate-700'}`}>
      {children}
    </button>
  )
}
