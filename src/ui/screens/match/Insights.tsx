import { useEffect, useRef } from 'react'
import { CONTINENTAL_ENTRY_LABELS, GROUP_STATUS_LABELS, KNOCKOUT_STATUS_LABELS, PROJECTION_ZONE_LABELS } from '../../labels'
import type { AnalystAction, AnalystRead } from './analyst'
import type { AnyProjection, Prognosis } from './projection'

const ordinal = (n: number) => `${n}º`

const ZONE_TONE = { leader: 'text-win', promotion: 'text-win', relegation: 'text-loss' } as const

/** Texto curto da situação (para o prognóstico): posição na tabela ou o que acontece no mata-mata. */
function shortOf(p: AnyProjection): string {
  if (p.kind === 'knockout') return KNOCKOUT_STATUS_LABELS[p.status].split(':')[0] as string
  return ordinal(p.position)
}
function toneOf(p: AnyProjection): string {
  if (p.kind === 'league') return p.zone ? ZONE_TONE[p.zone] : 'text-white'
  if (p.kind === 'knockout') return p.status === 'through' || p.status === 'ahead' ? 'text-win' : p.status === 'out' || p.status === 'behind' ? 'text-loss' : 'text-white'
  return p.status === 'out' ? 'text-loss' : 'text-win'
}

const LINE = 'flex flex-wrap items-baseline justify-center gap-x-2 rounded-xl border border-line bg-surface px-3 py-1.5 text-center'

/** "Se terminar assim": a situação se a partida acabasse agora (ao vivo) ou o prognóstico de vencer, empatar ou perder (antes do apito). Liga, grupos e mata-mata de copa. */
export function ProjectionLine({ projection, prognosis }: { projection: AnyProjection | null; prognosis: Prognosis | null }) {
  const label = <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted">Se terminar assim</span>
  if (projection?.kind === 'league') {
    const delta = projection.current - projection.position
    return (
      <div className={LINE} data-testid="projection-line" role="status">
        {label}
        <span className="title text-2xl leading-none text-white">{ordinal(projection.position)}</span>
        <span className="text-xs text-muted">de {projection.size}</span>
        {delta !== 0 && (
          <span className={`text-sm font-extrabold ${delta > 0 ? 'text-win' : 'text-loss'}`} aria-label={delta > 0 ? `subiu ${delta}` : `caiu ${-delta}`}>
            {delta > 0 ? '▲' : '▼'}
            {Math.abs(delta)}
          </span>
        )}
        {projection.zone && <span className={`text-xs font-bold ${ZONE_TONE[projection.zone]}`}>{PROJECTION_ZONE_LABELS[projection.zone]}</span>}
        {projection.continental && (
          <span className="text-xs font-bold text-sky-300" data-testid="projection-continental">
            {projection.zone === 'leader' ? '· ' : ''}
            {projection.continental.cupName} ({CONTINENTAL_ENTRY_LABELS[projection.continental.entry]})
          </span>
        )}
      </div>
    )
  }
  if (projection?.kind === 'group' || projection?.kind === 'league-phase') {
    return (
      <div className={LINE} data-testid="projection-line" role="status">
        {label}
        <span className="text-xs font-semibold text-muted">{projection.group ? `Grupo ${projection.group}` : projection.cupName}</span>
        <span className="title text-2xl leading-none text-white">{ordinal(projection.position)}</span>
        <span className="text-xs text-muted">de {projection.size}</span>
        <span className={`text-xs font-bold ${toneOf(projection)}`} data-testid="projection-status">
          {GROUP_STATUS_LABELS[projection.status]}
        </span>
      </div>
    )
  }
  if (projection?.kind === 'knockout') {
    return (
      <div className={LINE} data-testid="projection-line" role="status">
        {label}
        <span className="text-xs font-semibold text-muted">{projection.stageName}</span>
        <span className="title text-2xl leading-none text-white">
          {projection.goalsFor} x {projection.goalsAgainst}
        </span>
        <span className="text-xs text-muted">{projection.firstLeg ? 'na ida' : 'no confronto'}</span>
        <span className={`text-xs font-bold ${toneOf(projection)}`} data-testid="projection-status">
          {KNOCKOUT_STATUS_LABELS[projection.status]}
        </span>
      </div>
    )
  }
  if (!prognosis) return null
  const knockout = prognosis.draw.kind === 'knockout'
  const cell = (name: string, p: AnyProjection) => (
    <span className="flex min-w-0 flex-col items-center text-center leading-tight">
      <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted">{name}</span>
      <span className={`${p.kind === 'knockout' ? 'text-sm font-extrabold' : 'title text-2xl leading-none'} ${toneOf(p)}`}>{shortOf(p)}</span>
    </span>
  )
  return (
    <div className="rounded-xl border border-line bg-surface px-3 py-1.5" data-testid="prognosis-line" role="status">
      <p className="mb-1 text-center text-[10px] font-bold uppercase tracking-[0.12em] text-muted">{knockout ? 'O confronto depois do jogo' : prognosis.draw.kind === 'league' ? 'Posição na tabela depois do jogo' : 'Posição na copa depois do jogo'}</p>
      <div className="flex items-start justify-around gap-2">
        {cell('Se vencer', prognosis.win)}
        {cell('Se empatar', prognosis.draw)}
        {cell('Se perder', prognosis.lose)}
      </div>
    </div>
  )
}

const TONE_RING = { warn: 'border-amber/60', info: 'border-sky-400/50', good: 'border-win/50' } as const

/** Leitura do analista com o botão que aplica a mudança sugerida (ou leva à aba Tática). */
export function AnalystCard({ read, actionLabel, onApply, onDismiss, disabled }: { read: AnalystRead | null; actionLabel: (a: AnalystAction) => string; onApply: (a: AnalystAction) => void; onDismiss: () => void; disabled?: boolean }) {
  if (!read) {
    return (
      <div className="rounded-xl border border-line bg-surface px-3 py-2 text-xs text-muted" data-testid="analyst-card">
        <span className="font-bold uppercase tracking-[0.12em]">O analista</span> · acompanhando o jogo.
      </div>
    )
  }
  return (
    <div className={`flex items-center gap-2 rounded-xl border bg-surface px-3 py-2 ${TONE_RING[read.tone]}`} data-testid="analyst-card" role="status">
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted">O analista</p>
        <p className="text-[13px] font-semibold leading-snug text-slate-100">{read.text}</p>
      </div>
      {read.action && (
        <button type="button" onClick={() => onApply(read.action as AnalystAction)} disabled={disabled} className="min-h-11 shrink-0 rounded-lg bg-accent px-3 text-sm font-extrabold text-accent-ink active:scale-95 disabled:opacity-50" data-testid="analyst-apply">
          {actionLabel(read.action)}
        </button>
      )}
      <button type="button" onClick={onDismiss} className="min-h-11 min-w-9 shrink-0 text-lg font-bold text-muted" aria-label="Dispensar o aviso" data-testid="analyst-dismiss">
        ×
      </button>
    </div>
  )
}

export interface CeremonySide {
  abbreviation: string
  shirt: string
  trim: string
  ink: string
  numbers: number[]
}

/** Quanto dura a entrada dos times (ms) antes de a bola rolar. */
export const CEREMONY_MS = 5600

/**
 * Entrada dos times em campo: os dois times andam da lateral até a fila no meio, com o nome do jogo e do estádio.
 * Só visual (nenhum lance do motor existe ainda); termina sozinha ou ao tocar em "Pular".
 */
export function Ceremony({ home, away, title, subtitle, onDone, onNeverAgain }: { home: CeremonySide; away: CeremonySide; title: string; subtitle: string; onDone: () => void; onNeverAgain: () => void }) {
  const done = useRef(onDone)
  done.current = onDone
  useEffect(() => {
    const t = window.setTimeout(() => done.current(), CEREMONY_MS)
    return () => window.clearTimeout(t)
  }, [])
  const row = (side: CeremonySide, from: string, top: string) => (
    <div className="absolute left-0 right-0 flex justify-center gap-[1.4%]" style={{ top }}>
      {side.numbers.map((n, i) => (
        <span
          key={`${side.abbreviation}-${i}`}
          className="ceremony-walk flex aspect-square w-[7%] items-center justify-center rounded-full text-[11px] font-extrabold ring-2 ring-white/40"
          style={{ background: side.shirt, color: side.ink, borderColor: side.trim, boxShadow: `inset 0 0 0 2px ${side.trim}`, animationDelay: `${i * 90}ms`, ['--from' as string]: from }}
        >
          {n}
        </span>
      ))}
    </div>
  )
  return (
    <div className="absolute inset-0 z-[60] overflow-hidden rounded-2xl bg-bg/90" data-testid="ceremony" role="status" aria-label="Os times entram em campo">
      <div className="ceremony-fade absolute inset-x-0 top-2 text-center">
        <p className="title text-xl leading-none text-white">{title}</p>
        <p className="mt-0.5 text-[11px] font-semibold text-muted">{subtitle}</p>
      </div>
      <div className="absolute inset-x-0 bottom-0 top-[26%]">
        {row(home, '-160%', '14%')}
        {row(away, '160%', '58%')}
        <span className="ceremony-fade absolute left-2 top-[4%] text-[10px] font-bold uppercase tracking-wider text-white/70" style={{ animationDelay: '0.4s' }}>
          {home.abbreviation}
        </span>
        <span className="ceremony-fade absolute left-2 top-[48%] text-[10px] font-bold uppercase tracking-wider text-white/70" style={{ animationDelay: '0.4s' }}>
          {away.abbreviation}
        </span>
      </div>
      <div className="absolute inset-x-0 bottom-1.5 flex items-center justify-center gap-3">
        <button type="button" onClick={onDone} className="min-h-10 rounded-full bg-white/15 px-4 text-xs font-extrabold text-white ring-1 ring-white/30 active:scale-95" data-testid="ceremony-skip">
          Pular a entrada
        </button>
        <button type="button" onClick={onNeverAgain} className="min-h-10 px-2 text-[11px] font-semibold text-muted underline" data-testid="ceremony-never">
          Não mostrar mais
        </button>
      </div>
    </div>
  )
}
