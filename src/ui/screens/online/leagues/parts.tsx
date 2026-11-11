import type { ReactNode } from 'react'
import { TopBar } from '../../../theme/Bits'
import type { LeagueSummary } from '../../../../online/leagueApi'
import { LEAGUE_KIND_LABELS, LEAGUE_STATUS_LABELS, PACE_LABELS } from '../../../labels'

/** Moldura das telas online: cabeçalho com o título e o "Voltar". */
export function Frame({ eyebrow, title, onBack, children, backLabel = 'Voltar' }: { eyebrow?: string; title: string; onBack: () => void; children: ReactNode; backLabel?: string }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col gap-3 px-4 py-2 text-slate-100">
      {eyebrow && <p className="-mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-muted">{eyebrow}</p>}
      <TopBar title={title} onBack={onBack} backLabel={backLabel} />
      {children}
    </div>
  )
}

export function Pill({ children, tone = 'muted' }: { children: ReactNode; tone?: 'muted' | 'win' | 'warn' | 'accent' }) {
  const color = tone === 'win' ? 'text-accent bg-accent/10' : tone === 'warn' ? 'text-amber bg-amber/10' : tone === 'accent' ? 'text-accent bg-accent/10' : 'text-muted bg-white/[0.04]'
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full border border-current px-2.5 py-[3px] text-xs font-semibold ${color}`}>{children}</span>
}

/** Cartão de uma liga na lista (minhas ligas, diretório, convite). */
export function LeagueCard({ league, onOpen, action }: { league: LeagueSummary; onOpen: () => void; action?: string }) {
  return (
    <button type="button" onClick={onOpen} className="flex w-full flex-col gap-2 card-bg rounded-[14px] border border-white/[0.13] p-3.5 text-left active:scale-[0.99]" data-testid="league-card">
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 truncate font-display text-xl font-bold">{league.name}</span>
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
