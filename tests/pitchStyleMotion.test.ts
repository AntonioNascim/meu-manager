import { describe, expect, it } from 'vitest'
import { measureStyle } from '../tools/styleMotion'
import type { StyleConfig, StyleMetrics } from '../tools/styleMotion'

// Cada estilo e cada mentalidade precisam se mexer e tocar a bola de um jeito reconhecível no campo 2D (só animação: o motor não muda).
// Mede partidas inteiras pelo mesmo caminho da tela (choosePlan + PitchMotion); 3 partidas por configuração.
const seeds = [1, 2, 3]
const run = (cfg: StyleConfig): StyleMetrics => measureStyle(cfg, seeds)

describe('o movimento do campo muda com o estilo de jogo', () => {
  const m = {
    possession: run({ style: 'possession', mentality: 0 }),
    direct: run({ style: 'direct', mentality: 0 }),
    counter: run({ style: 'counter-attack', mentality: 0 }),
    wings: run({ style: 'wings', mentality: 0 }),
    press: run({ style: 'high-press', mentality: 0 }),
  }

  it('toque de bola: muitos passes curtos por posse, poucas bolas longas', () => {
    expect(m.possession.passesPerPossession).toBeGreaterThan(m.direct.passesPerPossession * 1.5)
    expect(m.possession.passesPerPossession).toBeGreaterThan(m.counter.passesPerPossession * 1.4)
    expect(m.possession.avgPassM).toBeLessThan(m.direct.avgPassM - 6)
    expect(m.possession.avgPassM).toBeLessThan(m.counter.avgPassM - 6)
    expect(m.possession.longPct).toBeLessThan(m.direct.longPct - 15)
  })

  it('lançamento direto e contra-ataque: poucos passes e bolas longas', () => {
    for (const s of [m.direct, m.counter]) {
      expect(s.passesPerPossession).toBeLessThan(3)
      expect(s.longPct).toBeGreaterThan(30)
      expect(s.avgPassM).toBeGreaterThan(24)
    }
  })

  it('contra-ataque: bloco recuado sem a bola e atacantes correndo para o ataque', () => {
    expect(m.counter.heightWithout).toBeLessThan(m.possession.heightWithout - 2)
    expect(m.counter.forwardDepth).toBeGreaterThan(m.possession.forwardDepth + 8)
  })

  it('jogar pelas pontas: a bola passa mais pelos lados', () => {
    for (const other of [m.possession, m.direct, m.counter, m.press]) expect(m.wings.flankPct).toBeGreaterThan(other.flankPct + 6)
    expect(m.wings.crossesPerGame).toBeGreaterThanOrEqual(m.possession.crossesPerGame)
  })

  it('pressão total: linhas adiantadas e mais jogadores fechando quem tem a bola', () => {
    for (const other of [m.possession, m.direct, m.counter, m.wings]) {
      expect(m.press.heightWithout).toBeGreaterThan(other.heightWithout + 5)
      expect(m.press.heightWith).toBeGreaterThan(other.heightWith)
    }
    expect(m.press.nearBallWithout).toBeGreaterThan(m.possession.nearBallWithout + 0.25)
  })
})

describe('o movimento do campo muda com a mentalidade', () => {
  const low = run({ style: 'possession', mentality: -2 })
  const mid = run({ style: 'possession', mentality: 0 })
  const high = run({ style: 'possession', mentality: 2 })

  it('quanto mais ofensiva, mais alto o time fica, com e sem a bola', () => {
    expect(low.heightWith).toBeLessThan(mid.heightWith - 8)
    expect(mid.heightWith).toBeLessThan(high.heightWith - 8)
    expect(low.heightWithout).toBeLessThan(mid.heightWithout - 8)
    expect(mid.heightWithout).toBeLessThan(high.heightWithout - 8)
  })

  it('quanto mais ofensiva, mais gente vai ao ataque; a defensiva fica atrás da bola', () => {
    expect(high.aheadOfBall).toBeGreaterThan(low.aheadOfBall + 0.5)
    expect(high.forwardDepth).toBeGreaterThan(mid.forwardDepth + 8)
    expect(low.forwardDepth).toBeLessThan(mid.forwardDepth - 8)
  })
})
