/** Calendário do mercado: aberturas e fechamentos de janela, rodadas de negociação e respostas às propostas. */
import type { SeasonState } from '../season/calendar'
import { MARKET } from '../config'
import { makeDate } from '../season/dates'
import type { IsoDate, Region, WindowName } from '../types'
import { focusRegion, regionsOf, tickDates, windowsFor } from './windows'

export interface MarketEvent {
  date: IsoDate
  opens: WindowName[]
  closes: WindowName[]
  /** A IA negocia neste dia. */
  tick: boolean
  /** Há resposta a uma proposta do jogador neste dia. */
  responses: boolean
  /** A IA tenta pré-contratos neste dia. */
  preContract: boolean
}

/** Próximo dia com evento do mercado depois do último já tratado (`market.handled`). */
export function nextMarketEvent(state: SeasonState, noticeRegion?: Region): MarketEvent | undefined {
  const after = state.market.handled
  const days = new Map<IsoDate, MarketEvent>()
  const at = (date: IsoDate) => {
    const existing = days.get(date)
    if (existing) return existing
    const created: MarketEvent = { date, opens: [], closes: [], tick: false, responses: false, preContract: false }
    days.set(date, created)
    return created
  }
  // Cada região tem as suas janelas; os avisos de abertura e fechamento são só da região do técnico, mas a IA negocia em todas.
  const mine = noticeRegion ?? focusRegion(state)
  for (const region of regionsOf(state)) {
    for (const w of windowsFor(state, region, after)) {
      if (w.start > after) {
        const day = at(w.start)
        if (region === mine) day.opens.push(w.name)
      }
      if (w.end > after) {
        const day = at(w.end)
        if (region === mine) day.closes.push(w.name)
      }
      for (const d of tickDates(w)) if (d > after) at(d).tick = true
    }
  }
  const year = Number(after.slice(0, 4))
  for (const y of [year, year + 1]) {
    for (const month of MARKET.preContract.ai.months) {
      const d = makeDate(y, month, 1)
      if (d > after) at(d).preContract = true
    }
  }
  for (const o of state.market.offers) {
    if (o.status === 'pending' && o.direction === 'outgoing' && o.dueOn > after) at(o.dueOn).responses = true
  }
  return [...days.values()].sort((a, b) => a.date.localeCompare(b.date))[0]
}
