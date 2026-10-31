/** Metas da calibragem com o pacote real (`tools/realTargets.ts`): detectam dinastia, falta de variedade e gigantes que encolhem. */
import { describe, expect, it } from 'vitest'
import { checkRealTargets } from '../tools/realTargets'
import type { RealResults, TitleRow } from '../tools/realTargets'

const rows = (clubs: string[], country = 'England'): TitleRow[] => clubs.map((club, i) => ({ year: 2026 + i, club, country }))
const rotate = (names: string[], n: number) => Array.from({ length: n }, (_, i) => names[i % names.length]!)
const giants = { first: [19, 19, 18, 18, 17, 17], last: [19, 18, 18, 17, 17, 16], inTopStr: 3 }

const base = (leagues: Record<string, TitleRow[]>, cups: Record<string, TitleRow[]> = {}): RealResults => ({ leagues, cups, giants: { 'en-1': giants }, years: 30 })

describe('metas contra a vida real', () => {
  it('aceita uma liga variada e gigantes que se mantêm', () => {
    const out = checkRealTargets(base({ 'en-1': rows(rotate(['A', 'A', 'B', 'C', 'A', 'D', 'B', 'E', 'C'], 30)) }))
    expect(out).toEqual([])
  })

  it('acusa um clube com mais títulos que a meta e sequência longa demais', () => {
    const champs = [...Array(15).fill('A'), ...rotate(['B', 'C', 'D', 'E', 'F'], 15)]
    const out = checkRealTargets(base({ 'en-1': rows(champs as string[]) }))
    expect(out.some((p) => p.includes('um clube ganhou 15 de 30'))).toBe(true)
    expect(out.some((p) => p.includes('15 títulos seguidos'))).toBe(true)
  })

  it('acusa pouca variedade de campeões', () => {
    const out = checkRealTargets(base({ 'en-1': rows(rotate(['A', 'B', 'A', 'B', 'A', 'B', 'C'], 30)) }))
    expect(out.some((p) => p.includes('campeões diferentes'))).toBe(true)
  })

  it('acusa gigantes que encolhem', () => {
    const shrunk = { first: [19, 19, 18, 18, 17, 17], last: [14, 14, 13, 13, 12, 12], inTopStr: 1 }
    const out = checkRealTargets({ ...base({}), giants: { 'en-1': shrunk } })
    expect(out.some((p) => p.includes('seguem entre os 8 maiores'))).toBe(true)
    expect(out.some((p) => p.includes('reputação média dos gigantes caiu'))).toBe(true)
  })

  it('confere a fatia por país nas copas continentais', () => {
    const sa = [...Array(18).fill('Brazil'), ...Array(8).fill('Argentina'), ...Array(4).fill('Chile')] as string[]
    const cup: TitleRow[] = sa.map((country, i) => ({ year: 2026 + i, club: `${country}-${i % 9}`, country }))
    expect(checkRealTargets(base({}, { 'cont-sa-1': cup }))).toEqual([])
    const allBrazil: TitleRow[] = Array.from({ length: 30 }, (_, i) => ({ year: 2026 + i, club: `B${i % 12}`, country: 'Brazil' }))
    expect(checkRealTargets(base({}, { 'cont-sa-1': allBrazil })).some((p) => p.includes('Brazil com 100%'))).toBe(true)
  })

  it('não avalia amostras curtas (menos de 20 temporadas)', () => {
    expect(checkRealTargets({ ...base({ 'en-1': rows(rotate(['A'], 12)) }), years: 12 })).toEqual([])
  })
})
