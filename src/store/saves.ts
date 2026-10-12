/**
 * Saves no navegador (IndexedDB via Dexie): 3 espaços. O resumo de cada um fica numa tabela à parte
 * (para listar sem ler o jogo inteiro) e o jogo na outra.
 */
import Dexie from 'dexie'
import type { Table } from 'dexie'
import type { Game } from './game'
import { SLOT_COUNT, SaveError, makeEnvelope, migrateSave, summarizeGame } from './saveFormat'
import type { SaveEnvelope, SaveSummary } from './saveFormat'

interface SlotRow extends SaveSummary {}
interface GameRow {
  slot: number
  envelope: SaveEnvelope
}

class SavesDatabase extends Dexie {
  slots!: Table<SlotRow, number>
  games!: Table<GameRow, number>

  constructor(name: string) {
    super(name)
    // Versão do esquema do IndexedDB (não é a versão do formato do save, que fica no envelope).
    this.version(1).stores({ slots: 'slot', games: 'slot' })
  }
}

let database: SavesDatabase | undefined

function db(): SavesDatabase {
  database ??= new SavesDatabase('meu-manager')
  return database
}

/** Fecha e esquece a conexão (usado nos testes e antes de trocar de banco). */
export function closeSavesDatabase(): void {
  database?.close()
  database = undefined
}

function checkSlot(slot: number): void {
  if (!Number.isInteger(slot) || slot < 1 || slot > SLOT_COUNT) throw new SaveError('invalid', `Espaço de save inválido: ${slot}`)
}

/** Os 3 espaços, na ordem; `null` = vazio. */
export async function listSlots(): Promise<(SaveSummary | null)[]> {
  const rows = await db().slots.toArray()
  return Array.from({ length: SLOT_COUNT }, (_, i) => rows.find((r) => r.slot === i + 1) ?? null)
}

export async function saveToSlot(slot: number, game: Game, now: Date = new Date()): Promise<SaveSummary> {
  checkSlot(slot)
  const savedAt = now.toISOString()
  const envelope = makeEnvelope(game, savedAt)
  const summary = summarizeGame(envelope.game, slot, savedAt)
  const { slots, games } = db()
  await db().transaction('rw', slots, games, async () => {
    await games.put({ slot, envelope })
    await slots.put(summary)
  })
  return summary
}

/** Lê e migra o save do espaço. Lança `SaveError` se estiver vazio, for de versão mais nova ou estiver corrompido. */
export async function loadSlot(slot: number): Promise<Game> {
  checkSlot(slot)
  const row = await db().games.get(slot)
  if (!row) throw new SaveError('not-found', 'Este espaço está vazio.')
  return migrateSave(row.envelope).game
}

export async function deleteSlot(slot: number): Promise<void> {
  checkSlot(slot)
  const { slots, games } = db()
  await db().transaction('rw', slots, games, async () => {
    await games.delete(slot)
    await slots.delete(slot)
  })
}

/** O espaço salvo mais recentemente (para "Continuar"), ou `null` se não há saves. */
export async function latestSlot(): Promise<SaveSummary | null> {
  const all = (await listSlots()).filter((s): s is SaveSummary => s !== null)
  return all.sort((a, b) => b.savedAt.localeCompare(a.savedAt))[0] ?? null
}

/** Primeiro espaço vazio, ou `null` se os 3 estão ocupados. */
export async function firstEmptySlot(): Promise<number | null> {
  const index = (await listSlots()).findIndex((s) => s === null)
  return index === -1 ? null : index + 1
}
