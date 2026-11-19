import { useEffect, useMemo, useState } from 'react'
import { drawChallenges, drawOffers } from '../../../engine/challenges'
import type { Challenge } from '../../../engine/challenges'
import type { Player, Team } from '../../../engine/types'
import { CHALLENGE_GOAL_TEXT, CHALLENGE_TITLE_TEXT, CLUB_OFFER_LABELS } from '../../labels'
import { Crest, Eyebrow } from '../../theme'
import { clubReport } from './clubInfo'

type WorldLike = { teams: readonly Team[]; players: readonly Player[] }

const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

/**
 * "Quatro clubes procuram você": quatro propostas sorteadas pela semente, cada uma com uma contagem regressiva (só de tela: quando zera, a
 * proposta some). "Que outros liguem" sorteia outras. A escolha livre por país e liga continua logo abaixo.
 */
export function OffersSection({ world, seed, onKnow, onPick }: { world: WorldLike; seed: number; onKnow: (teamId: string) => void; onPick: (teamId: string) => void }) {
  const [round, setRound] = useState(0)
  const offers = useMemo(() => drawOffers(world, seed, round), [world, seed, round])
  const [left, setLeft] = useState<Record<string, number>>({})
  useEffect(() => {
    setLeft(Object.fromEntries(offers.map((o) => [o.teamId, o.seconds])))
  }, [offers])
  useEffect(() => {
    const t = window.setInterval(() => setLeft((l) => Object.fromEntries(Object.entries(l).map(([k, v]) => [k, Math.max(0, v - 1)]))), 1000)
    return () => window.clearInterval(t)
  }, [offers])
  const alive = offers.filter((o) => (left[o.teamId] ?? o.seconds) > 0)
  if (offers.length === 0) return null
  return (
    <section className="space-y-2 px-4 pb-3" data-testid="offers">
      <div className="flex items-baseline justify-between gap-2">
        <Eyebrow>Quatro clubes procuram você</Eyebrow>
        <button type="button" onClick={() => setRound((r) => r + 1)} className="min-h-10 px-2 text-xs font-bold text-accent underline" data-testid="more-offers">
          Que outros liguem
        </button>
      </div>
      {alive.length === 0 && <p className="rounded-xl border border-line bg-surface p-3 text-sm text-muted">As propostas esfriaram. Toque em "Que outros liguem" ou escolha um clube abaixo.</p>}
      <ul className="space-y-2">
        {alive.map((o) => {
          const r = clubReport(world, o.teamId)
          if (!r) return null
          return (
            <li key={o.teamId} className="rounded-2xl border border-white/[0.13] card-bg p-3" data-testid="offer" data-team={o.teamId}>
              <div className="flex items-center gap-3">
                <Crest team={r.team} size="md" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold">{r.team.name}</p>
                  <p className="truncate text-xs text-muted">
                    {CLUB_OFFER_LABELS[o.kind]} · espera o {o.expectedPosition}º lugar
                  </p>
                </div>
                <span className="text-xs font-bold tabular-nums text-amber" aria-label="Tempo para responder">
                  {clock(left[o.teamId] ?? o.seconds)}
                </span>
              </div>
              <div className="mt-2 flex gap-2">
                <button type="button" onClick={() => onKnow(o.teamId)} className="min-h-11 flex-1 rounded-xl border border-line bg-surface px-3 text-sm font-bold active:scale-95" data-testid="offer-know">
                  Conhecer o clube
                </button>
                <button type="button" onClick={() => onPick(o.teamId)} className="min-h-11 flex-1 rounded-xl bg-accent px-3 text-sm font-bold text-accent-ink active:scale-95" data-testid="offer-pick">
                  Escolher
                </button>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

const Stars = ({ n }: { n: number }) => (
  <span className="text-amber" role="img" aria-label={`${n} de 5 estrelas`}>
    {'★'.repeat(n)}
    <span className="text-white/20">{'★'.repeat(5 - n)}</span>
  </span>
)

/** Desafios: sugestões de clube com meta, prazo e estrelas. Aceitar escolhe o clube; ao cumprir, o desafio fica nas Conquistas. */
export function ChallengesSection({ world, seed, accepted, onAccept }: { world: WorldLike; seed: number; accepted?: string | undefined; onAccept: (c: Challenge) => void }) {
  const list = useMemo(() => drawChallenges(world, seed), [world, seed])
  if (list.length === 0) return null
  return (
    <section className="space-y-2 px-4 pb-3" data-testid="challenges">
      <Eyebrow>Desafios</Eyebrow>
      <ul className="space-y-2">
        {list.map((c) => {
          const team = world.teams.find((t) => t.id === c.teamId)
          if (!team) return null
          const on = accepted === c.id
          return (
            <li key={c.id} className={`rounded-2xl p-3 ${on ? 'border-[1.5px] border-accent bg-accent/[0.08]' : 'border border-white/[0.13] card-bg'}`} data-testid="challenge" data-id={c.id}>
              <div className="flex items-start justify-between gap-2">
                <p className="font-bold">{CHALLENGE_TITLE_TEXT(c.kind, team.name)}</p>
                <Stars n={c.stars} />
              </div>
              <p className="mt-0.5 text-xs text-muted">{CHALLENGE_GOAL_TEXT(c)}</p>
              <button type="button" onClick={() => onAccept(c)} className="mt-2 min-h-11 w-full rounded-xl border border-line bg-surface px-3 text-sm font-bold active:scale-95" data-testid="challenge-accept">
                {on ? 'Desafio aceito' : 'Aceitar ›'}
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
