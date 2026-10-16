import { pendingIncoming, windowAt } from '../../../engine/market'
import { academyAlert, lastYearContracts, squadOf, teamById, userTeam } from '../../../store/game'
import type { Game } from '../../../store/game'
import { daysBetween, formatDate } from '../../format'
import type { IconName } from '../../theme'
import type { ScreenId } from '../../navigation'
import { WINDOW_LABELS } from '../../labels'
import { isUnavailable } from '../../squadSort'

export type NoticeTone = 'danger' | 'warning' | 'info' | 'accent'

export interface DashboardNotice {
  id: string
  tone: NoticeTone
  icon: IconName
  title: string
  detail: string
  /** Tela e aba para onde o toque leva. */
  to: ScreenId
  tab?: string
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
const nameOf = (p: { nickname?: string | undefined; name: string }) => p.nickname ?? p.name
const list = (names: string[], max = 3) => names.slice(0, max).join(', ') + (names.length > max ? ` e mais ${names.length - max}` : '')
const inDays = (n: number) => (n <= 0 ? 'hoje' : n === 1 ? 'amanhã' : `em ${n} dias`)

/**
 * Central de avisos do painel, em ordem de urgência: decisões que travam o jogo, propostas, pré-contratos que tiram
 * jogadores, contratos no último ano, lesionados e suspensos, jovens novos na base e a janela de transferências.
 */
export function dashboardNotices(game: Game): DashboardNotice[] {
  const out: DashboardNotice[] = []
  const state = game.season
  const today = state.season.currentDate
  const team = userTeam(game)
  const academy = academyAlert(game)

  if (academy.pending > 0) {
    out.push({ id: 'academy-pending', tone: 'danger', icon: 'star', title: 'Decisão pendente na base', detail: `${plural(academy.pending, 'jovem fez', 'jovens fizeram')} 20 anos: promova ou dispense para o jogo seguir.`, to: 'academy' })
  }

  const incoming = pendingIncoming(state)
  if (incoming.length > 0) {
    out.push({ id: 'offers', tone: 'warning', icon: 'swap', title: plural(incoming.length, 'proposta recebida', 'propostas recebidas'), detail: 'Responda no Mercado antes que a janela feche.', to: 'market', tab: 'proposals' })
  }
  if (game.notices.some((n) => n.type === 'offer-answered')) {
    out.push({ id: 'offer-answered', tone: 'info', icon: 'swap', title: 'Proposta respondida', detail: 'Uma proposta sua foi respondida.', to: 'market', tab: 'proposals' })
  }

  for (const n of game.notices) {
    if (n.type !== 'pre-contract-lost') continue
    const player = state.players.find((p) => p.id === n.playerId)
    out.push({
      id: `pre-${n.playerId}`,
      tone: 'danger',
      icon: 'contract',
      title: `${player ? nameOf(player) : 'Um jogador seu'} vai embora de graça`,
      detail: `Assinou pré-contrato com o ${teamById(game, n.teamId).name} e sai no fim da temporada.`,
      to: 'market',
      tab: 'precontract',
    })
  }

  for (const n of game.notices) {
    if (n.type !== 'contract-ended') continue
    const player = state.players.find((p) => p.id === n.playerId)
    out.push({
      id: `ended-${n.playerId}`,
      tone: 'danger',
      icon: 'contract',
      title: `${player ? nameOf(player) : 'Um jogador seu'} terminou o contrato`,
      detail: 'O contrato acabou no dia combinado e ele saiu do elenco. Dá para contratá-lo de volta entre os jogadores livres.',
      to: 'market',
      tab: 'free',
    })
  }

  const expiring = lastYearContracts(game)
  if (expiring.length > 0) {
    out.push({ id: 'contracts', tone: 'warning', icon: 'contract', title: 'Contratos no último ano', detail: `${plural(expiring.length, 'jogador termina', 'jogadores terminam')} o contrato neste ano: ${list(expiring.map(nameOf))}.`, to: 'contracts' })
  }

  const squad = squadOf(game, team.id)
  const injured = squad.filter((p) => p.condition.injuryDaysLeft > 0)
  const suspended = squad.filter((p) => p.condition.suspensionGames > 0)
  if (injured.length + suspended.length > 0) {
    const parts = [
      injured.length > 0 ? `${plural(injured.length, 'lesionado', 'lesionados')} (${list(injured.map(nameOf), 2)})` : '',
      suspended.length > 0 ? `${plural(suspended.length, 'suspenso', 'suspensos')} (${list(suspended.map(nameOf), 2)})` : '',
    ].filter(Boolean)
    const starterOut = team.tactic.startingXI.some((id) => {
      const p = squad.find((q) => q.id === id)
      return p !== undefined && isUnavailable(p)
    })
    out.push({ id: 'unavailable', tone: starterOut ? 'warning' : 'info', icon: 'heart', title: starterOut ? 'Titular fora do time' : 'Desfalques no elenco', detail: parts.join(' · '), to: 'squad', tab: starterOut ? 'lineup' : 'players' })
  }

  if (academy.arrivals > 0) {
    out.push({ id: 'academy-arrivals', tone: 'info', icon: 'star', title: 'Jovens novos na base', detail: `${plural(academy.arrivals, 'jovem chegou', 'jovens chegaram')} à base.`, to: 'academy' })
  }

  const window = windowAt(state.season, state.matches, today)
  if (window) {
    out.push({ id: 'window', tone: 'accent', icon: 'swap', title: 'Janela de transferências aberta', detail: `${WINDOW_LABELS[window.name]} · ${window.end === today ? 'fecha hoje' : `fecha ${inDays(daysBetween(today, window.end))}`} (${formatDate(window.end)})`, to: 'market' })
  }
  return out
}
