/**
 * Confere que os resultados das partidas não mudaram: 24 partidas com sementes fixas (inclusive ao vivo, com
 * substituição e mudança tática no meio) comparadas com o que o motor produziu antes do rastro dos lances
 * (`snapshot().trace`, só leitura para o campo 2D). Qualquer mudança no motor que altere um placar, um lance ou uma
 * estatística quebra este teste. Para gravar de novo de propósito: `GOLDEN_UPDATE=1 npx vitest run tests/matchGolden.test.ts`.
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { generateWorld } from '../src/data/generateWorld'
import { simulateMatch, startMatch } from '../src/engine/match'
import type { MatchInput } from '../src/engine/match'
import type { MatchResult, Player, Team } from '../src/engine/types'

const FIXTURE = new URL('./fixtures/matchGolden.json', import.meta.url)
const world = generateWorld({ seed: 11 })
const squad = (t: Team): Player[] => world.players.filter((p) => p.teamId === t.id)
const tiers = [world.teams.filter((t) => t.tier === 1), world.teams.filter((t) => t.tier === 2)]

const input = (i: number): MatchInput => {
  const list = tiers[i % 2] as Team[]
  const home = list[i % list.length] as Team
  const away = list[(i * 7 + 3) % list.length] === home ? (list[(i + 1) % list.length] as Team) : (list[(i * 7 + 3) % list.length] as Team)
  return { home: { team: home, players: squad(home) }, away: { team: away, players: squad(away) }, seed: 1000 + i * 97, attendance: 20_000 + i * 500 }
}

const digest = (r: MatchResult) => createHash('sha1').update(JSON.stringify(r)).digest('hex').slice(0, 16)

function compute(): Record<string, string> {
  const out: Record<string, string> = {}
  for (let i = 0; i < 16; i++) out[`sim-${i}`] = digest(simulateMatch(input(i)))
  for (let i = 16; i < 24; i++) {
    // Ao vivo, passo a passo, com mudança tática no intervalo e uma substituição: o mesmo caminho da tela.
    const m = startMatch({ ...input(i), userControlled: { home: true } })
    m.playUntil(45)
    m.setStyle('home', 'high-press')
    m.setMentality('home', 1)
    const snap = m.snapshot()
    const out1 = snap.home.onPitch.find((p) => p.slot !== 'GK')?.playerId as string
    const inn = snap.home.bench.find((id) => world.players.find((p) => p.id === id)?.position !== 'GK') as string
    m.substitute('home', out1, inn)
    for (let minute = 46; minute < 90; minute += 3) m.playUntil(minute)
    m.playUntil(90)
    out[`live-${i}`] = digest(m.result())
  }
  return out
}

describe('os resultados das partidas não mudaram', () => {
  it('as 24 partidas de referência dão exatamente o mesmo resultado, lance por lance', () => {
    const now = compute()
    if (process.env.GOLDEN_UPDATE || !existsSync(FIXTURE)) {
      writeFileSync(FIXTURE, JSON.stringify(now, null, 2))
      return
    }
    expect(now).toEqual(JSON.parse(readFileSync(FIXTURE, 'utf8')))
  })
})
