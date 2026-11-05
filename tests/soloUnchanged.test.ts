import { describe, expect, it } from 'vitest'
import fixture from './fixtures/solo-digest.json'
import { SCENARIOS, runScenario } from '../tools/soloDigest'

/**
 * Prova de que a carreira solo não mudou (Fase 6, B6). `tests/fixtures/solo-digest.json` foi gerado na `main` ANTES de qualquer mudança da B6
 * (`node tools/run.mjs soloDigest --out tests/fixtures/solo-digest.json`). Cada cenário joga uma carreira com semente fixa, pelo caminho real do jogo
 * (avançar, partidas do técnico no automático, fim de temporada, virada e a temporada seguinte), e compara o SHA-256 do estado inteiro em cinco pontos.
 * Se qualquer mudança do motor alterar um único dado do jogo solo, este teste quebra. Só regrave o arquivo de propósito, e diga por quê.
 */
describe('carreira solo: impressão digital da main antes da B6', () => {
  for (const scenario of SCENARIOS) {
    it(`${scenario.name} (semente ${scenario.seed})`, () => {
      const expected = (fixture as Record<string, Record<string, string>>)[scenario.name]
      expect(expected).toBeDefined()
      expect(runScenario(scenario)).toEqual(expected)
    }, 300_000)
  }
})
