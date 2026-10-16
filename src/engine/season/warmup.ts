/**
 * Pré-aquecimento: o jogo começa na data em que a liga do técnico abre a temporada, mas as outras ligas podem estar em outro ponto
 * (já com rodadas jogadas, tabela e artilharia). Em vez de simular lance a lance o que veio antes, as partidas anteriores à data
 * são jogadas pelo resultado simplificado, em milissegundos. Só os efeitos das partidas entram (resultados, gols e cartões dos
 * jogadores, condição, lesões e moral); mercado, treino e fechamento financeiro dos meses anteriores ao início não existem.
 */
import type { IsoDate } from '../types'
import { playMatchday } from './advance'
import type { SeasonState } from './calendar'
import { daysBetween } from './dates'
import { progressDays } from './condition'

/** Datas de partidas ainda por jogar antes de \`date\`, em ordem. */
function pendingDatesBefore(state: SeasonState, date: IsoDate): IsoDate[] {
  const dates = new Set<IsoDate>()
  for (const m of state.matches) if (m.status === 'scheduled' && m.date >= state.season.currentDate && m.date < date) dates.add(m.date)
  return [...dates].sort()
}

/** Leva a temporada até `date` jogando, pelo resultado simplificado, todas as partidas marcadas antes dela. Datas passadas ou iguais à de hoje não mudam nada. */
export function warmUp(state: SeasonState, date: IsoDate): SeasonState {
  if (date <= state.season.currentDate) return state
  let current = state
  for (const day of pendingDatesBefore(state, date)) {
    const days = daysBetween(current.season.currentDate, day)
    const rested = { ...current, players: progressDays(current.players, days), season: { ...current.season, currentDate: day } }
    current = playMatchday(rested, day, {}, [], true).state
  }
  const days = daysBetween(current.season.currentDate, date)
  return { ...current, players: progressDays(current.players, days), season: { ...current.season, currentDate: date } }
}
