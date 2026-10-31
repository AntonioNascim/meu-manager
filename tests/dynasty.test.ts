/**
 * Freio geral contra dinastias (Fase 5D): o campeão com muitos títulos seguidos perde estrelas para os rivais da liga na virada de temporada.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { generateWorld } from '../src/data/generateWorld'
import { DYNASTY } from '../src/engine/config'
import { dynastyRaids, raidsFor, titlesInWindow } from '../src/engine/offseason'
import { playerOverall } from '../src/engine/overall'
import { computeStandings, createSeason, simulateToSeasonEnd } from '../src/engine/season'
import type { SeasonState } from '../src/engine/season'
import type { SeasonRecord } from '../src/engine/types'

const world = generateWorld({ seed: 21 })
let ended: SeasonState
let championId: string

const record = (year: number, champion: boolean, tier = 1): SeasonRecord => ({ year, tier, finalPosition: champion ? 1 : 5, champion })

beforeAll(() => {
  ended = simulateToSeasonEnd(createSeason({ year: 2026, seed: 21, teams: world.teams, players: world.players }), { market: true })
  const serieA = ended.season.competitions.find((c) => c.tier === 1)!
  championId = computeStandings(serieA.teamIds, ended.matches.filter((m) => m.competitionId === serieA.id))[0]!.teamId
}, 120_000)

const withHistory = (s: SeasonState, teamId: string, history: SeasonRecord[]): SeasonState => ({ ...s, teams: s.teams.map((t) => (t.id === teamId ? { ...t, history } : t)) })

describe('freio contra dinastias', () => {
  it('quantas estrelas o campeão perde: nenhuma abaixo do limiar, uma no limiar, mais uma por título além, até o máximo', () => {
    expect(raidsFor(1)).toBe(0)
    expect(raidsFor(DYNASTY.threshold - 1)).toBe(0)
    expect(raidsFor(DYNASTY.threshold)).toBe(1)
    expect(raidsFor(DYNASTY.threshold + 1)).toBe(2)
    expect(raidsFor(10)).toBe(DYNASTY.maxRaids)
  })

  it('conta só os títulos da primeira divisão nas últimas temporadas (mais o que acabou de ser ganho)', () => {
    const history = [record(2020, true), record(2021, true, 2), record(2022, false), record(2023, true), record(2024, false), record(2025, true)]
    // A janela é de 5 temporadas: as 4 últimas fechadas mais a que acabou. 2021 foi título da segunda divisão e não conta.
    expect(titlesInWindow({ history }, true)).toBe(3)
    expect(titlesInWindow({ history }, false)).toBe(2)
    expect(titlesInWindow({ history: [] }, true)).toBe(1)
  })

  it('o campeão de poucos títulos não perde ninguém', () => {
    const { raids, state } = dynastyRaids(ended, 'default')
    expect(raids).toHaveLength(0)
    expect(state).toBe(ended)
  })

  it('o campeão que já tinha dois títulos recentes perde sua melhor estrela, por menos que o pedido, para um rival da liga', () => {
    const dominant = withHistory(ended, championId, [record(2024, true), record(2025, true)])
    const before = dominant.players.filter((p) => p.teamId === championId)
    const best = [...before].filter((p) => p.age <= DYNASTY.maxAge && !p.contract.loanedFrom).sort((a, b) => playerOverall(b) - playerOverall(a))
    const { raids, state } = dynastyRaids(dominant, 'default')
    expect(raids.length).toBeGreaterThanOrEqual(1)
    expect(raids.length).toBeLessThanOrEqual(DYNASTY.maxRaids)
    const raid = raids[0]!
    expect(raid.fromTeamId).toBe(championId)
    // Uma das melhores do clube foi embora para outro clube da mesma divisão.
    expect(best.slice(0, DYNASTY.starPool).map((p) => p.id)).toContain(raid.playerId)
    const serieA = dominant.season.competitions.find((c) => c.tier === 1)!
    expect(serieA.teamIds).toContain(raid.toTeamId)
    expect(raid.toTeamId).not.toBe(championId)
    const moved = state.players.find((p) => p.id === raid.playerId)!
    expect(moved.teamId).toBe(raid.toTeamId)
    expect(state.players.filter((p) => p.teamId === championId)).toHaveLength(before.length - raids.length)
    // A transferência está no histórico do mercado, o dinheiro trocou de mãos e o elenco do comprador continua dentro do limite.
    expect(state.market.history.at(-1)).toMatchObject({ playerId: raid.playerId, fromTeamId: championId, toTeamId: raid.toTeamId, kind: 'purchase', fee: raid.fee })
    expect(state.teams.find((t) => t.id === raid.toTeamId)!.squad.length).toBeLessThanOrEqual(30)
    expect(state.teams.find((t) => t.id === championId)!.squad).not.toContain(raid.playerId)
  })

  it('o time do jogador nunca é alvo nem comprador', () => {
    const dominant = withHistory(ended, championId, [record(2024, true), record(2025, true)])
    const { raids } = dynastyRaids(dominant, 'default', championId)
    expect(raids).toHaveLength(0)
    const other = ended.teams.find((t) => t.tier === 1 && t.id !== championId)!.id
    const { raids: others } = dynastyRaids(dominant, 'default', other)
    expect(others.every((r) => r.toTeamId !== other)).toBe(true)
  })
})
