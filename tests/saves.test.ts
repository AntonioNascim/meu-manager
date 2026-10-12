import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { computeStandings } from '../src/engine/season'
import { advanceToMatchday, createGame, playPendingAuto, userTeam } from '../src/store/game'
import type { Game } from '../src/store/game'
import { flushAutosave, markSaved, startAutosave } from '../src/store/autosave'
import { getActiveSlot, openGame, setGame, updateGame } from '../src/store/gameStore'
import { MIGRATIONS, SAVE_VERSION, SLOT_COUNT, SaveError, compactGame, makeEnvelope, migrateSave, validateGame } from '../src/store/saveFormat'
import { closeSavesDatabase, deleteSlot, firstEmptySlot, latestSlot, listSlots, loadSlot, saveToSlot } from '../src/store/saves'
import { setUserTactic } from '../src/store/game'

const playDays = (game: Game, days: number): Game => {
  let g = game
  for (let i = 0; i < days; i++) g = playPendingAuto(advanceToMatchday(g))
  return g
}

let base: Game
const played = () => {
  base ??= playDays(createGame(6, 'team-imp'), 8)
  return base
}

async function clearAll() {
  for (let slot = 1; slot <= SLOT_COUNT; slot++) await deleteSlot(slot)
}

beforeEach(async () => {
  await clearAll()
})
afterEach(() => {
  setGame(null)
})

describe('espaços de save', () => {
  it('começam vazios, gravam o resumo (time, temporada e data) e carregam o jogo de volta', async () => {
    expect(await listSlots()).toEqual([null, null, null])
    expect(await latestSlot()).toBeNull()
    const game = played()
    const summary = await saveToSlot(2, game, new Date('2026-05-01T12:30:00Z'))
    expect(summary).toMatchObject({ slot: 2, teamName: userTeam(game).name, year: 2026, date: game.season.season.currentDate, version: SAVE_VERSION, seasonsPlayed: 0 })
    const slots = await listSlots()
    expect(slots[0]).toBeNull()
    expect(slots[1]).toEqual(summary)
    expect(await loadSlot(2)).toEqual(compactGame(game))
  })

  it('os 3 espaços são independentes, "Continuar" aponta para o mais recente e dá para excluir', async () => {
    const a = played()
    const b = setUserTactic(a, { ...userTeam(a).tactic, mentality: 2 })
    await saveToSlot(1, a, new Date('2026-05-01T10:00:00Z'))
    await saveToSlot(3, b, new Date('2026-05-02T10:00:00Z'))
    expect((await latestSlot())?.slot).toBe(3)
    expect(await firstEmptySlot()).toBe(2)
    expect(userTeam(await loadSlot(1)).tactic.mentality).toBe(userTeam(a).tactic.mentality)
    expect(userTeam(await loadSlot(3)).tactic.mentality).toBe(2)
    await deleteSlot(3)
    expect((await latestSlot())?.slot).toBe(1)
    await expect(loadSlot(3)).rejects.toMatchObject({ code: 'not-found' })
    expect(await listSlots()).toEqual([expect.objectContaining({ slot: 1 }), null, null])
  })

  it('espaços fora de 1 a 3 são recusados e o save sobrevive a reabrir o banco', async () => {
    await expect(saveToSlot(0, played())).rejects.toBeInstanceOf(SaveError)
    await expect(saveToSlot(4, played())).rejects.toBeInstanceOf(SaveError)
    await saveToSlot(1, played())
    closeSavesDatabase()
    expect((await listSlots())[0]).not.toBeNull()
    expect(validateGame(await loadSlot(1))).toEqual([])
  })

  it('o jogo carregado continua jogando igual ao original (mesma sequência de resultados)', async () => {
    const game = played()
    await saveToSlot(1, game)
    const loaded = await loadSlot(1)
    const a = advanceToMatchday(game)
    const b = advanceToMatchday(loaded)
    expect(b.season.season.currentDate).toBe(a.season.season.currentDate)
    expect(b.pendingUserMatch?.id).toBe(a.pendingUserMatch?.id)
    const scores = (g: Game) => g.season.matches.filter((m) => m.result).map((m) => `${m.id}:${m.result!.homeGoals}-${m.result!.awayGoals}`)
    expect(scores(b)).toEqual(scores(a))
  })
})

describe('compactação', () => {
  it('tira lances e notas dos jogos decididos, mantém a classificação e o último jogo do time', async () => {
    const game = played()
    const compact = compactGame(game)
    const finished = compact.season.matches.filter((m) => m.status === 'finished')
    expect(finished.length).toBeGreaterThan(20)
    const withEvents = finished.filter((m) => m.result!.events.length > 0)
    expect(withEvents).toHaveLength(1)
    expect([withEvents[0]!.homeTeamId, withEvents[0]!.awayTeamId]).toContain(game.userTeamId)
    for (const c of game.season.season.competitions) {
      const rows = (g: Game) => computeStandings(c.teamIds, g.season.matches.filter((m) => m.competitionId === c.id))
      expect(rows(compact)).toEqual(rows(game))
    }
    expect(JSON.stringify(compact).length).toBeLessThan(JSON.stringify(game).length * 0.9)
    expect(compactGame(compact)).toBe(compact)
  })
})

describe('versão e migrações', () => {
  it('a versão atual abre e valida; jogo incompleto é recusado', () => {
    const envelope = makeEnvelope(played(), '2026-05-01T00:00:00.000Z')
    expect(envelope.version).toBe(SAVE_VERSION)
    expect(migrateSave(JSON.parse(JSON.stringify(envelope))).game.userTeamId).toBe(played().userTeamId)
    const broken = { ...envelope, game: { ...envelope.game, seasonLog: undefined } }
    expect(() => migrateSave(broken)).toThrowError(SaveError)
    expect(validateGame({})).not.toEqual([])
    expect(validateGame(null)).toEqual(['jogo ausente'])
  })

  it('saves antigos são levados até a versão atual, em ordem, por uma cadeia de migrações', () => {
    const calls: number[] = []
    const migrations = {
      1: (e: { version: number; savedAt: string; game: unknown }) => {
        calls.push(1)
        return { ...e, version: 2, game: { ...(e.game as object), seasonLog: [], renamed: true } }
      },
      2: (e: { version: number; savedAt: string; game: unknown }) => {
        calls.push(2)
        return { ...e, version: 3, game: { ...(e.game as object), archive: [] } }
      },
    }
    // Um save "da versão 1" sem os campos que as migrações acrescentam.
    const { seasonLog: _a, archive: _b, ...oldGame } = played()
    const old = { version: 1, savedAt: 'x', game: oldGame }
    const migrated = migrateSave(old, migrations, 3)
    expect(calls).toEqual([1, 2])
    expect(migrated.version).toBe(3)
    expect(migrated.game.seasonLog).toEqual([])
    expect(migrated.game.archive).toEqual([])
    // Sem a migração, o save antigo não abre.
    expect(() => migrateSave(old, {}, 3)).toThrowError(expect.objectContaining({ code: 'missing-migration' }))
  })

  it('save de versão mais nova, sem versão ou lixo é recusado com erro claro', () => {
    const envelope = makeEnvelope(played(), 'x')
    expect(() => migrateSave({ ...envelope, version: SAVE_VERSION + 1 })).toThrowError(expect.objectContaining({ code: 'newer-version' }))
    expect(() => migrateSave({ game: envelope.game })).toThrowError(expect.objectContaining({ code: 'invalid' }))
    expect(() => migrateSave('texto')).toThrowError(expect.objectContaining({ code: 'invalid' }))
    expect(() => migrateSave(null)).toThrowError(expect.objectContaining({ code: 'invalid' }))
  })

  it('o registro de migrações cobre todas as versões anteriores à atual', () => {
    for (let v = 1; v < SAVE_VERSION; v++) expect(MIGRATIONS[v], `migração da versão ${v}`).toBeTypeOf('function')
  })
})

describe('salvamento automático', () => {
  it('grava no espaço ativo depois de cada mudança do jogo e não grava sem espaço', async () => {
    const off = startAutosave(5)
    try {
      const game = createGame(7, 'team-sol')
      openGame(game, 2)
      await flushAutosave()
      expect(getActiveSlot()).toBe(2)
      expect((await listSlots())[1]?.teamName).toBe(userTeam(game).name)

      updateGame((g) => advanceToMatchday(g))
      await flushAutosave()
      const advanced = await loadSlot(2)
      expect(advanced.season.season.currentDate).not.toBe(game.season.season.currentDate)

      updateGame((g) => playPendingAuto(g))
      await flushAutosave()
      expect((await loadSlot(2)).pendingUserMatch).toBeUndefined()
      expect((await listSlots())[0]).toBeNull()

      setGame(null)
      expect(getActiveSlot()).toBeNull()
      setGame(game)
      await flushAutosave()
      expect((await loadSlot(2)).season.season.currentDate).not.toBe(game.season.season.currentDate)
    } finally {
      off()
    }
  })

  it('um jogo recém-carregado não é regravado à toa', async () => {
    const off = startAutosave(5)
    try {
      await saveToSlot(1, played(), new Date('2026-01-01T00:00:00Z'))
      const loaded = await loadSlot(1)
      markSaved(loaded)
      openGame(loaded, 1)
      await flushAutosave()
      expect((await listSlots())[0]?.savedAt).toBe('2026-01-01T00:00:00.000Z')
    } finally {
      off()
    }
  })
})

describe('backup em arquivo', () => {
  it('exporta um espaço e importa em outro com o mesmo jogo, mesmo depois de apagar o original', async () => {
    const { exportSlot, importSave, parseSaveFile } = await import('../src/store/saveFile')
    const game = played()
    await saveToSlot(1, game, new Date('2026-05-01T10:00:00Z'))
    const file = await exportSlot(1)
    expect(file.filename).toMatch(/^meu-manager-[a-z0-9-]+-2026\.json$/)
    expect(JSON.parse(file.json)).toMatchObject({ app: 'meu-manager', version: SAVE_VERSION })

    await deleteSlot(1)
    const summary = await importSave(file.json, 3, new Date('2026-06-01T10:00:00Z'))
    expect(summary).toMatchObject({ slot: 3, teamName: userTeam(game).name, year: 2026 })
    expect(await loadSlot(3)).toEqual(compactGame(game))
    expect((await latestSlot())?.slot).toBe(3)
    expect(parseSaveFile(file.json).game.userTeamId).toBe(game.userTeamId)
  })

  it('recusa arquivo que não é JSON, não é do jogo, é de versão mais nova ou está corrompido', async () => {
    const { exportSlot, parseSaveFile } = await import('../src/store/saveFile')
    await saveToSlot(1, played())
    const file = JSON.parse((await exportSlot(1)).json)
    expect(() => parseSaveFile('isto nao e json')).toThrowError(expect.objectContaining({ code: 'invalid' }))
    expect(() => parseSaveFile(JSON.stringify({ qualquer: 'coisa' }))).toThrowError(expect.objectContaining({ code: 'invalid' }))
    expect(() => parseSaveFile(JSON.stringify({ ...file, version: SAVE_VERSION + 5 }))).toThrowError(expect.objectContaining({ code: 'newer-version' }))
    expect(() => parseSaveFile(JSON.stringify({ ...file, game: { ...file.game, season: null } }))).toThrowError(expect.objectContaining({ code: 'invalid' }))
    await expect(deleteSlot(2)).resolves.toBeUndefined()
    expect((await listSlots())[1]).toBeNull()
  })

  it('arquivo de versão antiga passa pelas migrações na importação', async () => {
    const { parseSaveFile } = await import('../src/store/saveFile')
    const { seasonLog: _drop, ...oldGame } = played()
    const text = JSON.stringify({ app: 'meu-manager', version: 1, savedAt: 'x', game: oldGame })
    const migrations = { 1: (e: { version: number; savedAt: string; game: unknown }) => ({ ...e, version: 2, game: { ...(e.game as object), seasonLog: [] } }) }
    expect(parseSaveFile(text, migrations, 2).game.seasonLog).toEqual([])
    expect(() => parseSaveFile(text, {}, 2)).toThrowError(expect.objectContaining({ code: 'missing-migration' }))
  })
})
