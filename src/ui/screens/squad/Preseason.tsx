import { useMemo, useState } from 'react'
import { PRESEASON } from '../../../engine/config'
import { friendlyCandidates, friendlyFee, friendlyGate, placeCost, preseasonTotals, preseasonWindow } from '../../../engine/preseason'
import { PRESEASON_PLACES } from '../../../engine/types'
import type { PreseasonPlace } from '../../../engine/types'
import { teamById, userTeam } from '../../../store/game'
import type { Game } from '../../../store/game'
import { perform } from '../../../store/actions'
import { formatDate, formatMoney } from '../../format'
import { PRESEASON_PLACE_EFFECT_LABELS, PRESEASON_PLACE_LABELS, commandErrorText } from '../../labels'
import { Crest, Eyebrow, Panel } from '../../theme'
import { shortName } from '../standings/parts'

/**
 * Pré-temporada do técnico: três decisões antes do primeiro jogo (onde, quantos dias, contra quem) e, depois de confirmada, o resumo dos
 * amistosos (resultado, público, renda e cachê). Os amistosos ficam num registro próprio: não entram no calendário nem na tabela.
 */
export function PreseasonCard({ game }: { game: Game }) {
  const team = userTeam(game)
  const window = useMemo(() => preseasonWindow(game.season, team.id), [game.season, team.id])
  const plan = team.preseason
  const candidates = useMemo(() => friendlyCandidates(game.season, team.id), [game.season, team.id])
  const [place, setPlace] = useState<PreseasonPlace>('camp')
  const [days, setDays] = useState(() => Math.min(14, Math.max(window.minDays, window.maxDays)))
  const [picked, setPicked] = useState<string[]>([])
  const [message, setMessage] = useState<string | null>(null)

  if (plan && !window.open) {
    const totals = preseasonTotals(team)
    return (
      <Panel className="space-y-3 p-4" data-testid="preseason-summary">
        <div className="flex items-baseline justify-between gap-2">
          <Eyebrow>Pré-temporada</Eyebrow>
          <span className="text-xs font-semibold text-muted">
            {PRESEASON_PLACE_LABELS[plan.place]} · {plan.days} dias
          </span>
        </div>
        {plan.friendlies.length === 0 ? (
          <p className="text-sm text-muted">Sem amistosos: só o acampamento.</p>
        ) : (
          <ul className="divide-y divide-line" data-testid="friendlies">
            {plan.friendlies.map((f) => {
              const opp = teamById(game, f.opponentId)
              return (
                <li key={f.opponentId} className="flex items-center gap-2 py-2 text-sm" data-testid="friendly">
                  <Crest team={opp} size="xs" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{shortName(opp)}</span>
                    <span className="block text-[11px] text-muted">
                      {formatDate(f.date)}
                      {f.result ? ` · ${f.result.attendance.toLocaleString('pt-BR')} pagantes · renda ${formatMoney(f.result.revenue)}` : ''} · cachê {formatMoney(f.fee)}
                    </span>
                  </span>
                  <span className="w-14 shrink-0 text-right font-extrabold tabular-nums">{f.result ? `${f.result.goalsFor} x ${f.result.goalsAgainst}` : 'a jogar'}</span>
                </li>
              )
            })}
          </ul>
        )}
        {totals && (
          <p className="text-xs text-muted" data-testid="preseason-totals">
            Local {formatMoney(totals.placeCost)} · cachês pagos {formatMoney(totals.fees)} · rendas {formatMoney(totals.revenue)}
            {totals.played > 0 ? ` · ${totals.wins} ${totals.wins === 1 ? 'vitória' : 'vitórias'} (+${plan.moraleGiven} de moral)` : ''}
          </p>
        )}
      </Panel>
    )
  }
  if (!window.open) return null

  const cost = placeCost(team, place)
  const chosen = picked.map((id) => teamById(game, id))
  const fees = chosen.reduce((s, t) => s + friendlyFee(team, t), 0)
  const income = chosen.reduce((s, t) => s + friendlyGate(team, t, place).revenue, 0)
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length < PRESEASON.maxFriendlies ? [...p, id] : p))
  const confirm = () => {
    setMessage(null)
    void perform({ type: 'preseason', place, days, opponents: picked }).then((out) => {
      if (!out.ok) setMessage(commandErrorText(out.error))
    })
  }

  return (
    <Panel striped cut className="space-y-3 p-4" data-testid="preseason-wizard">
      <div>
        <Eyebrow>Pré-temporada</Eyebrow>
        <p className="mt-1 text-sm text-slate-300">Monte uma vez: onde o time treina, quantos dias fica concentrado e contra quem joga amistosos. Os jogos ficam fora da tabela e das copas.</p>
      </div>

      <div>
        <p className="mb-1.5 text-xs font-bold uppercase tracking-[0.12em] text-muted">1 · Onde</p>
        <ul className="space-y-1.5" role="radiogroup" aria-label="Local da pré-temporada">
          {PRESEASON_PLACES.map((p) => (
            <li key={p}>
              <button type="button" role="radio" aria-checked={place === p} onClick={() => setPlace(p)} className={`w-full rounded-xl border p-3 text-left active:scale-[0.99] ${place === p ? 'border-accent bg-accent/[0.08]' : 'border-line bg-surface'}`} data-testid="preseason-place" data-place={p}>
                <span className="flex items-baseline justify-between gap-2">
                  <span className={`font-bold ${place === p ? 'text-accent' : ''}`}>{PRESEASON_PLACE_LABELS[p]}</span>
                  <span className="text-xs font-bold tabular-nums text-muted">{placeCost(team, p) === 0 ? 'sem custo' : formatMoney(placeCost(team, p))}</span>
                </span>
                <span className="mt-0.5 block text-xs text-slate-300">{PRESEASON_PLACE_EFFECT_LABELS[p]}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <p className="mb-1.5 text-xs font-bold uppercase tracking-[0.12em] text-muted">2 · Quantos dias</p>
        <div className="flex items-center gap-3">
          <input type="range" min={window.minDays} max={window.maxDays} value={days} onChange={(e) => setDays(Number(e.target.value))} className="h-10 flex-1 accent-[var(--color-accent)]" aria-label="Dias de acampamento" data-testid="preseason-days" />
          <span className="title w-20 text-right text-2xl">{days} dias</span>
        </div>
        <p className="text-xs text-muted">De {window.minDays} a {window.maxDays}: o calendário deixa um dia livre antes do primeiro jogo.</p>
      </div>

      <div>
        <p className="mb-1.5 text-xs font-bold uppercase tracking-[0.12em] text-muted">
          3 · Contra quem ({picked.length}/{PRESEASON.maxFriendlies})
        </p>
        <ul className="space-y-1" data-testid="preseason-candidates">
          {candidates.map((c) => {
            const on = picked.includes(c.id)
            const full = !on && picked.length >= PRESEASON.maxFriendlies
            return (
              <li key={c.id}>
                <button type="button" onClick={() => toggle(c.id)} disabled={full} aria-pressed={on} className={`flex min-h-12 w-full items-center gap-2 rounded-xl border px-3 py-1.5 text-left active:scale-[0.99] disabled:opacity-40 ${on ? 'border-accent bg-accent/[0.08]' : 'border-line bg-surface'}`} data-testid="preseason-opponent" data-team={c.id}>
                  <Crest team={c} size="xs" />
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">{shortName(c)}</span>
                  <span className="text-[11px] text-muted">cachê {formatMoney(friendlyFee(team, c))}</span>
                </button>
              </li>
            )
          })}
        </ul>
      </div>

      <p className="rounded-xl border border-line bg-surface p-3 text-xs text-muted" data-testid="preseason-estimate">
        Custo do local <b className="text-white">{cost === 0 ? 'zero' : formatMoney(cost)}</b> · cachês <b className="text-white">{formatMoney(fees)}</b> · renda estimada dos amistosos <b className="text-white">{formatMoney(income)}</b>. Cada amistoso vencido dá +1 de moral, até +{PRESEASON.moraleCap}.
      </p>
      <button type="button" onClick={confirm} className="min-h-12 w-full rounded-xl bg-accent font-bold text-accent-ink active:scale-95" data-testid="preseason-confirm">
        Confirmar a pré-temporada
      </button>
      {message && (
        <p className="text-sm font-semibold text-loss" role="alert">
          {message}
        </p>
      )}
    </Panel>
  )
}
