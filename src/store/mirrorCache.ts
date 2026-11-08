/**
 * O espelho da liga guardado no aparelho (Fase 6C, C6), num banco IndexedDB **separado** (`meu-manager-espelho`): abrir a liga não baixa tudo de novo (só a
 * atualização desde a revisão guardada) e, sem internet, o técnico ainda vê o último estado que o aparelho tinha. É só cópia: o servidor é a verdade e um
 * espelho ilegível ou antigo demais é descartado. Guarda no máximo 3 ligas (as mais recentes), comprimido (gzip) quando o navegador sabe.
 */
import Dexie from 'dexie'
import type { Table } from 'dexie'
import type { MirrorState } from '../engine/league'
import { pack, unpack, type Encoding } from './compress'

/** Formato do que se guarda; mude quando o `MirrorState` mudar de jeito que o antigo não serve. */
export const MIRROR_CACHE_VERSION = 1
const MAX_LEAGUES = 3

interface Row {
  leagueId: string
  version: number
  savedAt: number
  rev: number
  enc: Encoding
  data: Uint8Array | string
}

class MirrorDb extends Dexie {
  mirrors!: Table<Row, string>
  constructor(name: string) {
    super(name)
    this.version(1).stores({ mirrors: 'leagueId, savedAt' })
  }
}

/** O espelho em JSON (os mapas viram listas). */
export const serializeMirror = (m: MirrorState): string =>
  JSON.stringify({ rev: m.rev, sections: m.sections, teams: [...m.teams.values()], players: [...m.players.entries()], matches: [...m.matches.values()], own: m.own })

export function parseMirror(text: string): MirrorState | undefined {
  try {
    const raw = JSON.parse(text) as { rev: number; sections: MirrorState['sections']; teams: { id: string }[]; players: [string, MirrorState['players'] extends Map<string, infer V> ? V : never][]; matches: { id: string }[]; own?: MirrorState['own'] }
    if (typeof raw.rev !== 'number' || !raw.sections || !Array.isArray(raw.teams) || !Array.isArray(raw.players) || !Array.isArray(raw.matches) || !raw.own) return undefined
    return { rev: raw.rev, sections: raw.sections, teams: new Map(raw.teams.map((t) => [t.id, t as never])), players: new Map(raw.players), matches: new Map(raw.matches.map((x) => [x.id, x as never])), own: raw.own }
  } catch {
    return undefined
  }
}

export class MirrorCache {
  private db: MirrorDb
  private timer?: ReturnType<typeof setTimeout>
  private lastSavedRev = new Map<string, number>()

  constructor(name = 'meu-manager-espelho') {
    this.db = new MirrorDb(name)
  }

  /** O espelho guardado da liga, ou `undefined` (não há, está estragado ou é de outro formato). Nunca lança. */
  async load(leagueId: string): Promise<MirrorState | undefined> {
    try {
      const row = await this.db.mirrors.get(leagueId)
      if (!row || row.version !== MIRROR_CACHE_VERSION) return undefined
      const parsed = parseMirror(await unpack(row.enc, row.data))
      if (parsed) this.lastSavedRev.set(leagueId, parsed.rev)
      return parsed
    } catch {
      return undefined
    }
  }

  async save(leagueId: string, state: MirrorState): Promise<void> {
    try {
      const packed = await pack(serializeMirror(state))
      await this.db.mirrors.put({ leagueId, version: MIRROR_CACHE_VERSION, savedAt: Date.now(), rev: state.rev, enc: packed.enc, data: packed.data })
      this.lastSavedRev.set(leagueId, state.rev)
      const all = await this.db.mirrors.orderBy('savedAt').toArray()
      for (const old of all.slice(0, Math.max(0, all.length - MAX_LEAGUES))) await this.db.mirrors.delete(old.leagueId)
    } catch {
      /* disco cheio ou modo privado: segue sem guardar */
    }
  }

  /** Guarda com espera (a sincronização chama isto a cada atualização; só a última, e só se a revisão mudou, vai ao banco). */
  schedule(leagueId: string, state: MirrorState, delayMs = 4000): void {
    if (this.lastSavedRev.get(leagueId) === state.rev) return
    if (this.timer !== undefined) clearTimeout(this.timer)
    this.timer = setTimeout(() => void this.save(leagueId, state), delayMs)
  }

  /** Grava já o que estiver esperando (ao fechar a liga ou sair do app). */
  async flush(leagueId: string, state: MirrorState): Promise<void> {
    if (this.timer !== undefined) clearTimeout(this.timer)
    this.timer = undefined
    if (this.lastSavedRev.get(leagueId) !== state.rev) await this.save(leagueId, state)
  }

  async clear(leagueId: string): Promise<void> {
    try {
      await this.db.mirrors.delete(leagueId)
      this.lastSavedRev.delete(leagueId)
    } catch {
      /* nada a apagar */
    }
  }
}

export const mirrorCache = new MirrorCache()
