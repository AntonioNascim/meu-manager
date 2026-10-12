/** Calendário do mercado: aberturas e fechamentos de janela, rodadas de negociação e respostas às propostas. */
import type { SeasonState } from '../season/calendar'
import type { IsoDate, WindowName } from '../types'
import { tickDates, transferWindows } from './windows'

export interface MarketEvent {
  date: IsoDate
  opens: WindowName[]
  closes: WindowName[]
  /** A IA negocia neste dia. */
  tick: boolean
  /** Há resposta a uma proposta do jogador neste dia. */
  responses: boolean
}

/** Próximo dia com evento do mercado depois do último já tratado (`market.handled`). */
export function nextMarketEvent(state: SeasonState): MarketEvent | undefined {
  const after = state.market.handled
  const days = new Map<IsoDate, MarketEvent>()
  const at = (date: IsoDate) => {
    const existing = days.get(date)
    if (existing) return existing
    const created: MarketEvent = { date, opens: [], closes: [], tick: false, responses: false }
    days.set(date, created)
    return created
  }
  for (const w of transferWindows(state.season, state.matches)) {
    if (w.start > after) at(w.start).opens.push(w.name)
    if (w.end > after) at(w.end).closes.push(w.name)
    for (const d of tickDates(w)) if (d > after) at(d).tick = true
  }
  for (const o of state.market.offers) {
    if (o.status === 'pending' && o.direction === 'outgoing' && o.dueOn > after) at(o.dueOn).responses = true
  }
  return [...days.values()].sort((a, b) => a.date.localeCompare(b.date))[0]
}
