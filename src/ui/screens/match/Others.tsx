import { useEffect, useMemo, useRef, useState } from 'react'
import { teamById } from '../../../store/game'
import type { Game } from '../../../store/game'
import { playerName } from '../../format'
import { Crest } from '../../theme'
import { otherGamesOf, scoreAt } from './otherGames'

/** Quanto tempo o destaque de gol fica aceso (ms). */
const FLASH_MS = 3200

/** Aba "Jogos": placares dos outros jogos da rodada, que sobem no minuto em que cada gol acontece. */
export function OtherGames({ game, minute }: { game: Game; minute: number }) {
  const matches = useMemo(() => otherGamesOf(game), [game])
  const names = useMemo(() => new Map(game.season.players.map((p) => [p.id, p])), [game.season.players])
  const [flash, setFlash] = useState<Record<string, string>>({})
  const last = useRef(new Map<string, number>())
  const timers = useRef<number[]>([])

  useEffect(() => {
    const fresh: Record<string, string> = {}
    for (const m of matches) {
      const s = scoreAt(m, minute)
      const before = last.current.get(m.id)
      last.current.set(m.id, s.goals.length)
      // Só destaca o gol que aparece enquanto se olha (não o que já estava lá ao abrir ou ao pular o jogo).
      if (before !== undefined && s.goals.length === before + 1) {
        const g = s.goals[s.goals.length - 1]
        if (g) fresh[m.id] = `Gol! ${names.has(g.playerId) ? playerName(names.get(g.playerId) as never) : ''} ${g.minute}'`
      }
    }
    if (Object.keys(fresh).length === 0) return
    setFlash((f) => ({ ...f, ...fresh }))
    const ids = Object.keys(fresh)
    timers.current.push(
      window.setTimeout(() => {
        setFlash((f) => {
          const next = { ...f }
          for (const id of ids) delete next[id]
          return next
        })
      }, FLASH_MS),
    )
  }, [matches, minute, names])
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), [])

  if (matches.length === 0) return <p className="rounded-xl bg-surface p-3 text-sm text-muted">Não há outros jogos da sua série nesta rodada.</p>
  const ended = minute >= 90
  return (
    <ul className="space-y-2" aria-label="Outros jogos da rodada">
      {matches.map((m) => {
        const home = teamById(game, m.homeTeamId)
        const away = teamById(game, m.awayTeamId)
        const s = scoreAt(m, minute)
        const text = flash[m.id]
        return (
          <li key={m.id} data-testid="other-game" className={`rounded-xl border px-3 py-2 transition-colors duration-500 ${text ? 'border-accent bg-accent/15' : 'border-line bg-surface'}`}>
            <div className="flex items-center gap-2 text-sm font-semibold">
              <span className="flex min-w-0 flex-1 items-center justify-end gap-2">
                <span className="truncate">{home.name}</span>
                <Crest team={home} size="sm" />
              </span>
              <span className={`min-w-14 rounded-md bg-bg px-2 py-0.5 text-center text-base font-bold tabular-nums ${text ? 'text-accent' : ''}`}>
                {s.home} x {s.away}
              </span>
              <span className="flex min-w-0 flex-1 items-center gap-2">
                <Crest team={away} size="sm" />
                <span className="truncate">{away.name}</span>
              </span>
            </div>
            <div className="mt-0.5 h-4 text-center text-[11px] font-bold text-accent">{text ?? <span className="font-normal text-muted">{ended ? 'Fim de jogo' : minute === 0 ? 'Antes do apito' : `${minute}'`}</span>}</div>
          </li>
        )
      })}
    </ul>
  )
}
