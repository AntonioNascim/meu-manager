import { useState } from 'react'
import { matchLabel } from '../../../engine/cups'
import { nextUserMatch, teamById, userTeam } from '../../../store/game'
import type { Game } from '../../../store/game'
import { OpponentOverlay } from '../../components/OpponentOverlay'
import { MENTALITY_LABELS, PLAY_STYLE_DESCRIPTIONS, PLAY_STYLE_LABELS, formationLabel } from '../../labels'
import { Crest, Eyebrow, Panel } from '../../theme'
import { useOnlineDetail } from '../../useOnlineDetail'

/**
 * O próximo adversário na Escalação (Fase 6D): escudo, onde e em qual competição joga, e a formação, o estilo e a mentalidade dele, o mesmo que aparece ao tocar
 * no escudo do adversário (`TacticSection`), para o técnico decidir a tática antes do jogo. Vale no solo e no online (na liga online o aparelho baixa a tática
 * real do adversário ao abrir, `useOnlineDetail`). Tocar abre a página do time com a escalação provável dele.
 */
export function NextOpponent({ game }: { game: Game }) {
  const next = nextUserMatch(game)
  const mine = userTeam(game)
  const opponentId = next ? (next.homeTeamId === mine.id ? next.awayTeamId : next.homeTeamId) : undefined
  useOnlineDetail(opponentId)
  const [open, setOpen] = useState(false)
  if (!next || !opponentId) return null
  const opponent = teamById(game, opponentId)
  const label = matchLabel(game.season, next)
  const t = opponent.tactic
  return (
    <Panel className="p-4" data-testid="next-opponent">
      <Eyebrow>Próximo adversário</Eyebrow>
      <button type="button" onClick={() => setOpen(true)} aria-label={`Ver a tática de ${opponent.name}`} className="mt-2 flex w-full items-center gap-3 text-left">
        <Crest team={opponent} size="md" />
        <div className="min-w-0">
          <div className="title line-clamp-2 text-2xl">{opponent.name}</div>
          <div className="text-xs text-muted">
            {label.competition}
            {next.cup ? ` · ${label.detail.toLowerCase()}` : ''} · {next.cup?.neutral ? 'campo neutro' : next.homeTeamId === mine.id ? 'em casa' : 'fora'}
          </div>
        </div>
      </button>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center" data-testid="next-opponent-tactic">
        {[
          ['Formação', formationLabel(t.formationId)],
          ['Estilo', PLAY_STYLE_LABELS[t.style]],
          ['Mentalidade', MENTALITY_LABELS[t.mentality]],
        ].map(([name, value]) => (
          <div key={name} className="rounded-xl bg-surface-2 px-1 py-2">
            <div className="title text-lg leading-tight">{value}</div>
            <div className="text-[11px] text-muted">{name}</div>
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted">{PLAY_STYLE_DESCRIPTIONS[t.style]}</p>
      <button type="button" onClick={() => setOpen(true)} className="mt-3 flex min-h-11 w-full items-center justify-center rounded-xl border border-line text-sm font-bold">
        Ver a escalação provável dele
      </button>
      {open && <OpponentOverlay game={game} teamId={opponentId} onClose={() => setOpen(false)} />}
    </Panel>
  )
}
