import type { ReactNode } from 'react'
import { Icon } from './icons'
import type { IconName } from './icons'

/** Logo provisório: escudo dourado com engrenagem e o nome em dourado inclinado (troca pela arte final quando existir). */
export function Logo() {
  return (
    <div className="relative flex flex-col items-center gap-1 pb-0.5 pt-2">
      <div className="pointer-events-none absolute -inset-x-8 -bottom-2 -top-8 bg-[radial-gradient(38%_40%_at_12%_45%,rgb(120_255_160/0.3),transparent),radial-gradient(38%_40%_at_88%_45%,rgb(120_255_160/0.24),transparent)]" />
      <div className="relative h-[84px] w-[74px]">
        <svg viewBox="0 0 60 66" width="74" height="84" aria-hidden="true">
          <path d="M30 2 56 9v22c0 16-11 27-26 33C15 58 4 47 4 31V9L30 2Z" fill="#e9b44c" stroke="#a86b1c" strokeWidth="3" strokeLinejoin="round" />
          <path d="M30 2 56 9v22c0 16-11 27-26 33V2Z" fill="#a86b1c" opacity="0.2" />
        </svg>
        <div className="absolute inset-0 grid place-items-center pt-1.5 text-[#5a3406]">
          <Icon name="gear" size={34} />
        </div>
      </div>
      <h1 className="relative bg-gradient-to-b from-[#ffd98a] via-[#e29a35] to-[#8f4f10] bg-clip-text font-display text-[58px] font-extrabold italic leading-[0.95] text-transparent [filter:drop-shadow(0_3px_0_#4d2606)_drop-shadow(0_6px_12px_rgb(0_0_0/0.6))]">Meu Manager</h1>
      <small className="relative font-display text-[12.5px] font-bold uppercase tracking-[0.2em] text-gold">Jogo de técnico de futebol</small>
    </div>
  )
}

/** Topo das telas antes do jogo: botão Voltar e o título. */
export function TopBar({ title, onBack, right }: { title: string; onBack?: () => void; right?: ReactNode }) {
  return (
    <div className="flex min-h-[60px] items-center gap-2.5 py-3.5">
      {onBack && (
        <button type="button" onClick={onBack} className="flex min-h-11 items-center gap-1.5 rounded-[10px] border border-white/[0.13] bg-surface pl-2 pr-3.5 font-semibold">
          <Icon name="left" size={18} />
          Voltar
        </button>
      )}
      <h2 className="flex-1 font-display text-2xl font-bold leading-none">{title}</h2>
      {right}
    </div>
  )
}

const CHIP_TONES = {
  g: 'text-accent bg-accent/10',
  y: 'text-amber bg-amber/10',
  r: 'text-loss bg-loss/10',
  c: 'text-cyan bg-cyan/10',
  m: 'text-muted bg-white/[0.04]',
  gd: 'text-gold bg-gold/10',
} as const

/** Selo pequeno com borda na cor do texto. */
export function Chip({ tone = 'm', icon, children }: { tone?: keyof typeof CHIP_TONES; icon?: IconName; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-[5px] whitespace-nowrap rounded-full border border-current px-2.5 py-[3px] text-xs font-semibold ${CHIP_TONES[tone]}`}>
      {icon && <Icon name={icon} size={13} />}
      {children}
    </span>
  )
}

/** Faixa de aviso (âmbar), de erro (vermelha) ou neutra, com ícone à esquerda. */
export function Banner({ tone = 'warn', icon = 'alert', children, 'data-testid': testId }: { tone?: 'warn' | 'bad' | 'ok'; icon?: IconName; children: ReactNode; 'data-testid'?: string }) {
  const c = tone === 'warn' ? 'border-amber/55 bg-gradient-to-r from-[#2a1c06] to-[#0e1210] text-amber' : tone === 'bad' ? 'border-loss/50 bg-gradient-to-r from-[#2a0b0d] to-[#0e1010] text-loss' : 'border-accent/45 bg-accent/[0.06] text-accent'
  return (
    <div data-testid={testId} role={tone === 'bad' ? 'alert' : undefined} className={`flex items-start gap-3 rounded-[14px] border px-3.5 py-3 text-[13px] ${c}`}>
      <Icon name={icon} size={20} className="mt-0.5" />
      <div className="min-w-0 flex-1 text-slate-100">{children}</div>
    </div>
  )
}
