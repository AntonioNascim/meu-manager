/**
 * O analista: uma leitura curta do jogo para o técnico, com um botão que aplica uma mudança que já existe na tela
 * (mentalidade) ou leva à aba Tática. Só lê o que o motor já gerou (placar, estatísticas, condição física, banco) e nunca
 * decide nada sozinho; o texto é do jogo. Nenhuma conta do motor passa por aqui.
 */
import type { MatchSide, MatchSnapshot, SideSnapshot } from '../../../engine/match'
import type { Mentality } from '../../../engine/types'

export type AnalystAction = { kind: 'mentality'; value: Mentality } | { kind: 'open-tactics' }

export interface AnalystRead {
  /** Identifica o aviso (o mesmo motivo não é repetido enquanto a situação é a mesma). */
  id: string
  tone: 'warn' | 'info' | 'good'
  text: string
  action?: AnalystAction
}

export const ANALYST = {
  /** Antes disso os números ainda não dizem nada. */
  minMinute: 15,
  /** "Estão chegando N vezes mais": finalizações do rival contra as nossas (com folga mínima). */
  pressureRatio: 2,
  pressureMinShots: 6,
  /** Cansaço em que o analista chama atenção (condição de 0 a 100). */
  tired: 55,
  /** Reta final. */
  lateChase: 65,
  lateProtect: 75,
} as const

const clampM = (v: number): Mentality => Math.max(-2, Math.min(2, v)) as Mentality
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many)

export interface AnalystInput {
  snap: Pick<MatchSnapshot, 'minute' | 'finished' | 'homeGoals' | 'awayGoals' | 'homeStats' | 'awayStats' | 'home' | 'away' | 'injuryPending'>
  side: MatchSide
  /** Nome curto de um jogador (para o aviso de cansaço). */
  nameOf: (playerId: string) => string
}

/** A leitura do momento, ou `null` quando não há nada a dizer. */
export function analystRead({ snap, side, nameOf }: AnalystInput): AnalystRead | null {
  if (snap.finished || snap.minute < 1 || snap.injuryPending) return null
  const mine: SideSnapshot = side === 'home' ? snap.home : snap.away
  const myStats = side === 'home' ? snap.homeStats : snap.awayStats
  const theirStats = side === 'home' ? snap.awayStats : snap.homeStats
  const goalsFor = side === 'home' ? snap.homeGoals : snap.awayGoals
  const goalsAgainst = side === 'home' ? snap.awayGoals : snap.homeGoals
  const diff = goalsFor - goalsAgainst
  const m = snap.minute
  const current = mine.activeMentality

  // Com um a menos: fechar a casa (se ainda não está defensivo).
  if (myStats.redCards > 0 && mine.onPitch.length < 11 && current > -1) {
    return { id: `red:${mine.onPitch.length}`, tone: 'warn', text: `Estamos com ${mine.onPitch.length}: fica difícil atacar e defender com a mesma linha. Vale recuar um pouco.`, action: { kind: 'mentality', value: clampM(current - 1) } }
  }

  // Reta final.
  if (m >= ANALYST.lateChase && diff < 0 && current < 2) {
    const value = clampM(current + (m >= 80 ? 2 : 1))
    return { id: `chase:${diff}:${value}`, tone: 'warn', text: `Faltam ${90 - m < 0 ? 0 : 90 - m} minutos e perdemos por ${-diff}. Está na hora de ir para cima.`, action: { kind: 'mentality', value } }
  }
  if (m >= ANALYST.lateProtect && diff > 0 && current > -1) {
    return { id: `protect:${diff}`, tone: 'good', text: `O placar está a nosso favor e o relógio corre. Vale fechar a casa e segurar o resultado.`, action: { kind: 'mentality', value: clampM(current - 1) } }
  }

  // Cansaço: quem está muito cansado e há troca disponível.
  const canSub = mine.subsLeft > 0 && mine.stopsLeft > 0 && mine.bench.length > 0
  if (canSub && m >= 45) {
    const tired = [...mine.onPitch].filter((p) => p.slot !== 'GK' && p.fitness < ANALYST.tired).sort((a, b) => a.fitness - b.fitness)[0]
    if (tired) return { id: `tired:${tired.playerId}`, tone: 'info', text: `${nameOf(tired.playerId)} está muito cansado (${Math.round(tired.fitness)}%). Uma troca pode renovar o time.`, action: { kind: 'open-tactics' } }
  }

  if (m < ANALYST.minMinute) return null
  const shotsAgainst = theirStats.shots
  const shotsFor = myStats.shots
  if (shotsAgainst >= ANALYST.pressureMinShots && shotsAgainst >= shotsFor * ANALYST.pressureRatio && current > -1) {
    const times = shotsFor === 0 ? shotsAgainst : Math.round(shotsAgainst / shotsFor)
    return {
      id: `pressure:${Math.floor(shotsAgainst / 3)}`,
      tone: 'warn',
      text: `Estão chegando ${shotsFor === 0 ? 'bem mais' : `${times} ${plural(times, 'vez', 'vezes')} mais`} do que nós: ${shotsAgainst} finalizações contra ${shotsFor}. Vamos recuar um pouco.`,
      action: { kind: 'mentality', value: clampM(current - 1) },
    }
  }
  if (myStats.possession >= 58 && shotsFor >= Math.max(6, shotsAgainst * ANALYST.pressureRatio) && diff <= 0 && current < 2) {
    return { id: `dominate:${diff}:${Math.floor(shotsFor / 3)}`, tone: 'info', text: `Dominamos o jogo (${Math.round(myStats.possession)}% de posse e ${shotsFor} finalizações), mas o gol não sai. Dá para ousar mais.`, action: { kind: 'mentality', value: clampM(current + 1) } }
  }
  return null
}
