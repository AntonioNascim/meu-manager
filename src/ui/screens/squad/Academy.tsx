import { useState } from 'react'
import { AcademyError, potentialStars, youthSalary } from '../../../engine/academy'
import { ACADEMY } from '../../../engine/config'
import { playerOverall } from '../../../engine/overall'
import { SQUAD_MAX } from '../../../engine/types'
import type { Player } from '../../../engine/types'
import { academyAlert, promoteUserYouth, releaseUserYouth, squadOf, userAcademy, userTeam } from '../../../store/game'
import type { Game } from '../../../store/game'
import { updateGame } from '../../../store/gameStore'
import { PlayerDetail } from '../../components/PlayerDetail'
import { formatMoney, playerName } from '../../format'
import { POSITION_LABELS, POSITION_SHORT_LABELS } from '../../labels'
import { Flag, Panel, Stars, ValueBadge } from '../../theme'

const mustDecide = (p: Player) => p.age >= ACADEMY.graduationAge

function YouthRow({ player, onOpen }: { player: Player; onOpen: () => void }) {
  const overall = playerOverall(player)
  return (
    <li>
      <button type="button" onClick={onOpen} className="flex min-h-16 w-full items-center gap-2 px-3 py-2 text-left">
        <span className="w-9 shrink-0 text-xs font-bold text-muted">{POSITION_SHORT_LABELS[player.position]}</span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <Flag nationality={player.nationality} />
            <span className="truncate font-bold">{playerName(player)}</span>
            {mustDecide(player) && <span className="shrink-0 rounded bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold text-bg">Decidir</span>}
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted">
            <span>
              {player.age} anos · {POSITION_LABELS[player.position]}
            </span>
            <span className="inline-flex items-center gap-1">
              · potencial <Stars value={potentialStars(player)} size={12} />
            </span>
          </span>
        </span>
        <ValueBadge value={overall}>{Math.round(overall)}</ValueBadge>
      </button>
    </li>
  )
}

/** Aba Base: as regras da categoria de base, a lista de jovens e as ações de promover e dispensar. */
export function Academy({ game }: { game: Game }) {
  const team = userTeam(game)
  const youths = [...userAcademy(game)].sort((a, b) => Number(mustDecide(b)) - Number(mustDecide(a)) || playerOverall(b) - playerOverall(a))
  const [openId, setOpenId] = useState<string | null>(() => (import.meta.env.DEV && typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('detalhe') ? (youths[0]?.id ?? null) : null))
  const [message, setMessage] = useState<string | null>(null)
  const open = youths.find((p) => p.id === openId)
  const { arrivals, pending } = academyAlert(game)
  const squadSize = squadOf(game, team.id).length

  const promote = (p: Player) => {
    if (!window.confirm(`Promover ${playerName(p)} ao elenco profissional? Contrato de ${ACADEMY.contractYears} anos, salário de ${formatMoney(youthSalary(p, team))} por mês.`)) return
    try {
      updateGame((g) => promoteUserYouth(g, p.id))
      setOpenId(null)
      setMessage(`${playerName(p)} foi promovido ao elenco profissional.`)
    } catch (e) {
      setMessage(e instanceof AcademyError && e.code === 'squad-full' ? `O elenco profissional já tem ${SQUAD_MAX} jogadores: venda, empreste ou libere alguém antes.` : e instanceof Error ? e.message : 'Não foi possível promover.')
    }
  }
  const release = (p: Player) => {
    if (!window.confirm(`Dispensar ${playerName(p)}? Ele deixa o clube e o jogo.`)) return
    try {
      updateGame((g) => releaseUserYouth(g, p.id))
      setOpenId(null)
      setMessage(`${playerName(p)} foi dispensado.`)
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Não foi possível dispensar.')
    }
  }

  return (
    <div className="space-y-3">
      <section className="rounded-2xl bg-gradient-to-br from-accent to-lime-400 p-4 text-accent-ink">
        <h2 className="text-[11px] font-extrabold uppercase tracking-[0.14em] opacity-70">Categorias de base</h2>
        <p className="mt-2 text-[15px] font-semibold leading-snug">
          Toda temporada chegam de {ACADEMY.arrivals[0]} a {ACADEMY.arrivals[1]} garotos novos, e a qualidade depende da reputação e da divisão do clube. A base tem até {ACADEMY.maxSize} jovens de {ACADEMY.minAge} a {ACADEMY.graduationAge - 1} anos. Eles não jogam: só evoluem, um pouco mais devagar que o profissional. Quem faz {ACADEMY.graduationAge} anos precisa ser promovido ou dispensado. O elenco profissional aceita no máximo {SQUAD_MAX}.
        </p>
        <p className="mt-2 text-sm font-bold">
          Na base: {youths.length}/{ACADEMY.maxSize} · Elenco profissional: {squadSize}/{SQUAD_MAX}
          {arrivals > 0 && ` · Chegaram ${arrivals} ${arrivals === 1 ? 'jovem' : 'jovens'}`}
        </p>
      </section>

      {pending > 0 && (
        <Panel glow className="p-3 text-sm">
          <b>
            {pending} {pending === 1 ? 'jovem fez' : 'jovens fizeram'} {ACADEMY.graduationAge} anos.
          </b>{' '}
          Promova ou dispense {pending === 1 ? 'ele' : 'eles'} para o jogo seguir.
        </Panel>
      )}
      {message && (
        <p className="rounded-xl border border-line bg-surface p-3 text-sm" role="status">
          {message}
        </p>
      )}

      <Panel className="overflow-hidden">
        <ul className="divide-y divide-line">
          {youths.map((p) => (
            <YouthRow key={p.id} player={p} onOpen={() => setOpenId(p.id)} />
          ))}
          {youths.length === 0 && <li className="p-4 text-sm text-muted">A base está vazia. Novos jovens chegam na virada de temporada.</li>}
        </ul>
      </Panel>

      {open && (
        <PlayerDetail
          player={open}
          academy
          stars={potentialStars(open)}
          onClose={() => setOpenId(null)}
          footer={
            <div className="flex gap-2">
              <button type="button" onClick={() => promote(open)} className="min-h-12 flex-1 rounded-xl bg-accent font-bold text-accent-ink active:scale-95">
                Promover
              </button>
              <button type="button" onClick={() => release(open)} className="min-h-12 flex-1 rounded-xl border border-loss/60 font-bold text-loss active:scale-95">
                Dispensar
              </button>
            </div>
          }
        />
      )}
    </div>
  )
}
