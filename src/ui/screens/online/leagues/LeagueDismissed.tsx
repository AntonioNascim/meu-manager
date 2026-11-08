import { useState } from 'react'
import { chooseNewClub, closeLeague, type DismissedState } from '../../../../store/leagueSession'
import { Button, Card } from '../../../components/ui'
import { formatDate } from '../../../format'
import { DISMISSAL_REASON_LABELS } from '../../../labels'
import { Eyebrow, Panel } from '../../../theme'

/**
 * Demissão numa liga online (Fase 6C, C6): o clube volta à IA e a vaga continua do técnico, que escolhe outro clube livre da mesma liga, de reputação igual
 * ou menor que a do que perdeu. A carreira (aba Carreira) guarda a passagem.
 */
export function LeagueDismissed({ state, onLeave }: { state: DismissedState; onLeave: () => void }) {
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const pick = async (teamId: string) => {
    setBusy(teamId)
    setError(null)
    const r = await chooseNewClub(teamId)
    setBusy(null)
    if (r === 'refused') setError('Esse clube não está mais livre ou é maior que o que você perdeu. Escolha outro.')
    else if (r === 'failed') setError('Não consegui assumir o clube. Confira a conexão e tente de novo.')
  }
  const d = state.dismissal
  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col gap-4 bg-bg px-4 py-6 text-slate-100" data-testid="league-dismissed">
      <div className="text-center">
        <h1 className="title text-3xl text-loss">Você foi demitido</h1>
        <p className="mt-1 text-xs text-muted">{formatDate(d.date)}</p>
      </div>
      <Card>
        <p className="text-slate-200">{DISMISSAL_REASON_LABELS[d.reason]}</p>
        <p className="mt-2 text-sm text-slate-400">O clube estava em {d.position}º lugar, com a confiança da diretoria em {Math.round(d.confidence)}/100. Ele volta para a IA, mas a sua vaga na liga continua.</p>
      </Card>
      <div className="space-y-2">
        <Eyebrow>Escolha outro clube</Eyebrow>
        <p className="text-sm text-muted">Clubes livres da liga, de reputação igual ou menor que a do clube que você perdeu.</p>
        {error && (
          <p className="text-sm text-loss" role="alert">
            {error}
          </p>
        )}
        <Panel className="overflow-hidden">
          <ul className="divide-y divide-line" data-testid="free-clubs">
            {state.options.map((c) => (
              <li key={c.teamId} className="flex items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-bold">{c.shortName ?? c.name}</div>
                  <div className="text-xs text-muted">
                    {c.competition} · reputação {c.reputation.toFixed(0)}
                  </div>
                </div>
                <Button variant="secondary" disabled={busy !== null} onClick={() => void pick(c.teamId)} data-testid={`free-club-${c.teamId}`}>
                  {busy === c.teamId ? 'Assumindo…' : 'Assumir'}
                </Button>
              </li>
            ))}
            {state.options.length === 0 && <li className="p-3 text-sm text-muted">Nenhum clube livre agora. Volte à sala da liga e tente mais tarde.</li>}
          </ul>
        </Panel>
      </div>
      <Button
        variant="secondary"
        onClick={() => {
          closeLeague()
          onLeave()
        }}
      >
        Voltar ao menu
      </Button>
    </div>
  )
}
