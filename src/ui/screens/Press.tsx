import { useMemo, useState } from 'react'
import { PRESS_TONES, pressFacts, pressOpen } from '../../engine/press'
import type { PressTone } from '../../engine/press'
import { standingsOf, teamById, userCompetition, userTeam } from '../../store/game'
import type { Game } from '../../store/game'
import { perform } from '../../store/actions'
import { formatCompactMoney, formatDate, playerName } from '../format'
import { commandErrorText } from '../labels'
import { Eyebrow, Panel, TopTabs } from '../theme'
import { OCCASION_LABELS, TONE_LABELS, answerText, headlineOf, questionOf } from './press/text'

type Tab = 'news' | 'conference' | 'said'

const TONE_COLOR = { good: 'text-win', bad: 'text-loss', neutral: 'text-slate-200' } as const

/**
 * Imprensa: as notícias do momento (manchetes derivadas dos jogos, da tabela, do elenco e do mercado) e a coletiva da vez, com três tons de
 * resposta. **Só informa e registra: não muda nada no jogo** e não há e-mail nem mensagem para responder. Veículos e jornalistas fictícios.
 */
export function Press({ game }: { game: Game }) {
  const team = userTeam(game)
  const [tab, setTab] = useState<Tab>('news')
  const [message, setMessage] = useState<string | null>(null)
  const log = team.press ?? []
  const open = useMemo(() => pressOpen(game.season, team.id, log.map((a) => a.key)), [game.season, team.id, log])
  const facts = useMemo(() => {
    const table = standingsOf(game, userCompetition(game))
    const index = table.findIndex((r) => r.teamId === team.id)
    return pressFacts(game.season, team.id, index >= 0 ? { position: index + 1, size: table.length } : undefined)
  }, [game, team.id])
  const playersById = new Map(game.season.players.map((p) => [p.id, p]))
  const answer = (tone: PressTone) => {
    setMessage(null)
    void perform({ type: 'press', tone }).then((out) => {
      if (!out.ok) setMessage(commandErrorText(out.error))
      else setTab('said')
    })
  }
  return (
    <div className="space-y-3" data-testid="press-screen">
      <h2 className="font-display text-[26px] font-bold leading-none">Imprensa</h2>
      <TopTabs
        value={tab}
        onChange={setTab}
        options={[
          { id: 'news', label: 'Notícias' },
          { id: 'conference', label: 'Coletiva', alert: open !== undefined },
          { id: 'said', label: 'O que você disse' },
        ]}
      />

      {tab === 'news' && (
        <Panel className="overflow-hidden" data-testid="press-news">
          {facts.length === 0 ? (
            <p className="p-4 text-sm text-muted">Ainda não há notícias: a imprensa espera o primeiro jogo.</p>
          ) : (
            <ul className="divide-y divide-line">
              {facts.map((f, i) => {
                const opponent = f.kind === 'result' ? teamById(game, f.opponentId).name : undefined
                const player = 'playerId' in f ? playersById.get(f.playerId) : undefined
                const h = headlineOf(f, { team: team.name, ...(opponent ? { opponent } : {}), ...(player ? { player: playerName(player) } : {}), money: formatCompactMoney })
                return (
                  <li key={`${f.kind}-${i}`} className="px-4 py-3" data-testid="headline">
                    <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted">
                      {h.outlet} · {formatDate(f.date)}
                    </p>
                    <p className={`mt-0.5 font-display text-lg font-bold leading-snug ${TONE_COLOR[h.tone]}`}>{h.title}</p>
                  </li>
                )
              })}
            </ul>
          )}
          <p className="border-t border-line px-4 py-2 text-[11px] text-muted">Os veículos e os jornalistas são fictícios: as manchetes são escritas pelo jogo.</p>
        </Panel>
      )}

      {tab === 'conference' && (
        <Panel striped cut className="space-y-3 p-4" data-testid="press-conference-tab">
          {open ? (
            (() => {
              const q = questionOf(open.occasion, open.question, open.key)
              return (
                <>
                  <Eyebrow>{OCCASION_LABELS[open.occasion]}</Eyebrow>
                  <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted">
                    {q.outlet.reporter} · {q.outlet.name}
                  </p>
                  <p className="text-lg font-bold leading-snug" data-testid="press-question">
                    {q.text}
                  </p>
                  <ul className="space-y-2">
                    {PRESS_TONES.map((t) => (
                      <li key={t}>
                        <button type="button" onClick={() => answer(t)} className="w-full rounded-xl border border-line bg-surface p-3 text-left active:scale-[0.99]" data-testid="press-answer" data-tone={t}>
                          <span className="block font-bold">{TONE_LABELS[t]}</span>
                          <span className="mt-0.5 block text-xs text-slate-300">{answerText(open.occasion, t)}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                  <p className="text-[11px] text-muted">A resposta só fica registrada: não muda o resultado dos jogos nem a confiança da diretoria.</p>
                </>
              )
            })()
          ) : (
            <p className="text-sm text-muted" data-testid="press-none">
              Hoje não há coletiva. Elas acontecem na véspera dos jogos e logo depois deles.
            </p>
          )}
          {message && (
            <p className="text-sm font-semibold text-loss" role="alert">
              {message}
            </p>
          )}
        </Panel>
      )}

      {tab === 'said' && (
        <Panel className="overflow-hidden" data-testid="press-said">
          {log.length === 0 ? (
            <p className="p-4 text-sm text-muted">Você ainda não deu nenhuma coletiva.</p>
          ) : (
            <ul className="divide-y divide-line">
              {[...log].reverse().map((a) => {
                const q = questionOf(a.occasion, a.question, a.key)
                return (
                  <li key={a.key} className="px-4 py-3" data-testid="press-record">
                    <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted">
                      {OCCASION_LABELS[a.occasion]} · {formatDate(a.date)}
                    </p>
                    <p className="mt-0.5 text-sm font-semibold">{q.text}</p>
                    <p className="mt-1 text-sm text-slate-300">{answerText(a.occasion, a.tone)}</p>
                    <p className="mt-0.5 text-[11px] font-bold text-accent">{TONE_LABELS[a.tone]}</p>
                  </li>
                )
              })}
            </ul>
          )}
        </Panel>
      )}
    </div>
  )
}
