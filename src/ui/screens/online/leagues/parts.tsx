import type { ReactNode } from 'react'
import type { LeagueSummary } from '../../../../online/leagueApi'
import { LEAGUE_KIND_LABELS, LEAGUE_STATUS_LABELS, PACE_LABELS } from '../../../labels'

/** Moldura das telas online: cabeçalho com o título e o "Voltar". */
export function Frame({ eyebrow, title, onBack, children, backLabel = 'Voltar' }: { eyebrow?: string; title: string; onBack: () => void; children: ReactNode; backLabel?: string }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col gap-4 px-4 py-6 text-slate-100">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {eyebrow && <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted">{eyebrow}</p>}
          <h1 className="title text-3xl">{title}</h1>
        </div>
        <button type="button" className="min-h-12 flex-none rounded-lg px-3 text-sm text-muted hover:bg-surface" onClick={onBack}>
          {backLabel}
        </button>
      </div>
      {children}
    </div>
  )
}

export function Pill({ children, tone = 'muted' }: { children: ReactNode; tone?: 'muted' | 'win' | 'warn' | 'accent' }) {
  const color = tone === 'win' ? 'border-win/50 text-win' : tone === 'warn' ? 'border-yellow-500/50 text-yellow-300' : tone === 'accent' ? 'border-accent/60 text-accent' : 'border-line text-muted'
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-bold ${color}`}>{children}</span>
}

/** Cartão de uma liga na lista (minhas ligas, diretório, convite). */
export function LeagueCard({ league, onOpen, action }: { league: LeagueSummary; onOpen: () => void; action?: string }) {
  return (
    <button type="button" onClick={onOpen} className="flex w-full flex-col gap-2 rounded-2xl border border-line bg-surface p-4 text-left active:scale-[0.99]" data-testid="league-card">
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 truncate text-lg font-bold">{league.name}</span>
        <Pill tone={league.status === 'running' ? 'win' : 'warn'}>{LEAGUE_STATUS_LABELS[league.status]}</Pill>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Pill>{LEAGUE_KIND_LABELS[league.kind]}</Pill>
        <Pill>{league.world.source === 'real' ? 'Mundo real' : 'Mundo fictício'}</Pill>
        <Pill>
          {league.humans} de {league.maxHumans} técnicos
        </Pill>
      </div>
      <p className="text-xs text-muted">
        {PACE_LABELS[league.pace]}
        {league.adminNickname ? ` · ADM: ${league.adminNickname}` : ''}
      </p>
      {action && <span className="text-sm font-bold text-accent">{action}</span>}
    </button>
  )
}
