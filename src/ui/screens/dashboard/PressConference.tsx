import { useState } from 'react'
import { PROMISE_KINDS } from '../../../engine/promise'
import type { PromiseKind } from '../../../engine/promise'
import { userTeam } from '../../../store/game'
import type { Game } from '../../../store/game'
import { perform } from '../../../store/actions'
import { PROMISE_LABELS, commandErrorText } from '../../labels'
import { Eyebrow, Panel, Sheet } from '../../theme'

/** A coletiva de apresentação está aberta: o técnico ainda não prometeu nada nesta temporada e o time jogou poucas rodadas. */
export function promiseOpen(game: Game): boolean {
  if (game.dismissal) return false
  const team = userTeam(game)
  if (team.promise?.year === game.season.season.year) return false
  const played = game.season.matches.filter((m) => m.cup === undefined && m.status === 'finished' && (m.homeTeamId === team.id || m.awayTeamId === team.id)).length
  return played <= 4
}

/**
 * Coletiva de apresentação: a pergunta da imprensa ("o que você promete à torcida?") com três respostas. A promessa mexe na paciência da
 * diretoria em uma posição (para mais se estiver cumprindo, para menos se estiver falhando). Vale no solo e na liga online.
 */
export function PressConference({ game }: { game: Game }) {
  // Abre sozinha só logo depois de assinar o contrato de um jogo novo (o Novo jogo deixa a marca); nos demais casos fica o cartão no painel.
  const [open, setOpen] = useState(() => {
    try {
      const fresh = window.sessionStorage.getItem('mm-coletiva-novo') === '1'
      if (fresh) window.sessionStorage.removeItem('mm-coletiva-novo')
      return fresh
    } catch {
      return false
    }
  })
  const [message, setMessage] = useState<string | null>(null)
  if (!promiseOpen(game)) return null
  const team = userTeam(game)
  const close = () => {
    setOpen(false)
  }
  const choose = (kind: PromiseKind) => {
    setMessage(null)
    void perform({ type: 'promise', kind }).then((out) => {
      if (out.ok) close()
      else setMessage(commandErrorText(out.error))
    })
  }
  return (
    <>
      <Panel className="flex items-center gap-3 p-3" data-testid="press-card">
        <div className="min-w-0 flex-1">
          <Eyebrow>Coletiva de apresentação</Eyebrow>
          <p className="text-sm text-slate-300">A imprensa quer saber o que você promete à torcida do {team.name}.</p>
        </div>
        <button type="button" onClick={() => setOpen(true)} className="min-h-11 shrink-0 rounded-xl bg-accent px-3 text-sm font-bold text-accent-ink active:scale-95" data-testid="press-open">
          Responder
        </button>
      </Panel>
      {open && (
        <Sheet title="Coletiva de apresentação" onClose={close}>
          <div className="space-y-3 px-5 pb-5" data-testid="press-conference">
            <p className="text-lg font-bold leading-snug">O que você promete à torcida do {team.name}?</p>
            <ul className="space-y-2">
              {PROMISE_KINDS.map((k) => (
                <li key={k}>
                  <button type="button" onClick={() => choose(k)} className="w-full rounded-xl border border-line bg-surface p-3 text-left active:scale-[0.99]" data-testid="promise" data-kind={k}>
                    <span className="block font-bold">{PROMISE_LABELS[k].title}</span>
                    <span className="mt-0.5 block text-xs text-slate-300">{PROMISE_LABELS[k].text}</span>
                  </button>
                </li>
              ))}
            </ul>
            {message && (
              <p className="text-sm font-semibold text-loss" role="alert">
                {message}
              </p>
            )}
            <button type="button" onClick={close} className="min-h-10 w-full text-sm font-semibold text-muted underline">
              Depois
            </button>
          </div>
        </Sheet>
      )}
    </>
  )
}
