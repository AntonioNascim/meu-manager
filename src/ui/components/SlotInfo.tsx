import type { SaveSummary } from '../../store/saveFormat'
import { TIER_LABELS } from '../labels'
import { TeamBadge } from './ui'

export const formatSavedAt = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

/** Cartão de um espaço de save: time, temporada e data do salvamento. */
export function SlotInfo({ summary }: { summary: SaveSummary }) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-3">
      <TeamBadge team={{ abbreviation: summary.abbreviation, colors: summary.colors }} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="truncate font-semibold">{summary.teamName}</div>
        <div className="truncate text-xs text-slate-400">
          Temporada {summary.year} · {TIER_LABELS[summary.tier as 1 | 2]} · {summary.seasonsPlayed} {summary.seasonsPlayed === 1 ? 'temporada' : 'temporadas'} completas
        </div>
        <div className="truncate text-[11px] text-slate-500">Salvo em {formatSavedAt(summary.savedAt)}</div>
      </div>
    </div>
  )
}
