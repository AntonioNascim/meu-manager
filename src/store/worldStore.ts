/**
 * O mundo de uma liga online guardado no servidor (Fase 6, B5, etapa 1). `WorldStore` é a interface; há duas implementações com o mesmo
 * comportamento visível: `MemoryWorldStore` (o mundo como o motor o usa hoje) e `SqliteWorldStore` (o mundo em blocos no SQLite do Durable Object).
 *
 * Como funciona o SQLite: a temporada é dividida pelos **mesmos pedaços do save** (`planSeasonParts`: campos soltos, calendário, mercado, treino,
 * e as listas grandes por liga ou grupo de rodadas). Como o motor é imutável, o que não mudou entre dois estados tem as mesmas referências: a
 * gravação compara referências (nada é serializado para descobrir o que mudou) e escreve só os pedaços alterados. Isso é o "bloco sujo" da proposta.
 * Cada pedaço é uma ou mais linhas de uma tabela `WITHOUT ROWID` (o SQLite do Durable Object cobra por linha gravada, não por byte; uma linha tem
 * no máximo 2 MB, então texto maior é repartido em linhas de até `PIECE_CHARS`). A gravação é uma transação só: se o objeto reiniciar no meio,
 * o estado anterior continua inteiro. Depois de um reinício, `load()` remonta tudo do SQLite e já deixa pronto o que não mudou.
 *
 * Etapa 1 (a do plano revisado, seção 11 da proposta): o mundo inteiro é carregado em memória no início do passo e gravado por blocos no fim. A
 * carga por partes (etapa 2) só entra se a medição no Cloudflare mostrar necessidade.
 */
import type { SeasonState } from '../engine/season'
import type { SqlLike } from '../online/guard'
import { joinSeasonParts, planSeasonParts, sameRefs } from './saveParts'

/** O que uma gravação fez. */
export interface WorldSaveStats {
  /** Pedaços do mundo e quantos foram regravados desta vez. */
  parts: number
  changed: number
  /** Linhas gravadas (inclusive as removidas): é o que o Cloudflare cobra. */
  rowsWritten: number
  /** Texto gravado (caracteres) e o maior pedaço, em caracteres. */
  chars: number
  largestChars: number
}

export interface WorldStore {
  /** O mundo guardado, ou `null` se ainda não há. */
  load(): SeasonState | null
  /** Guarda o mundo. Só regrava o que mudou desde o último `load` ou `save`. */
  save(state: SeasonState): WorldSaveStats
}

/** Na memória: o objeto do motor, sem copiar. É a referência com a qual o SQLite é comparado. */
export class MemoryWorldStore implements WorldStore {
  private state: SeasonState | null = null
  load(): SeasonState | null {
    return this.state
  }
  save(state: SeasonState): WorldSaveStats {
    this.state = state
    return { parts: 0, changed: 0, rowsWritten: 0, chars: 0, largestChars: 0 }
  }
}

/** SQL com transação: no Durable Object é `ctx.storage.transactionSync`; nos testes, `BEGIN`/`COMMIT`. */
export interface WorldSql extends SqlLike {
  transaction<T>(fn: () => T): T
}

/** Tamanho máximo de uma linha, em caracteres. Em UTF-8 são no máximo 3 bytes por caractere: 1,5 MB, abaixo dos 2 MB do SQLite do Durable Object. */
export const PIECE_CHARS = 500_000

const FORMAT = 1

interface Known {
  /** Quantas linhas cada pedaço tem hoje no banco. */
  pieces: Map<string, number>
  /** Referências do último estado conhecido, por pedaço. */
  refs: Map<string, readonly unknown[]>
}

export class SqliteWorldStore implements WorldStore {
  private known: Known | undefined

  constructor(
    private sql: WorldSql,
    private pieceChars: number = PIECE_CHARS,
  ) {
    sql.exec('CREATE TABLE IF NOT EXISTS world_part (name TEXT NOT NULL, seq INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY (name, seq)) WITHOUT ROWID')
    sql.exec('CREATE TABLE IF NOT EXISTS world_meta (k TEXT PRIMARY KEY, v TEXT NOT NULL) WITHOUT ROWID')
  }

  private format(): number | undefined {
    const row = this.sql.exec("SELECT v FROM world_meta WHERE k = 'format'").toArray()[0]
    return row ? Number(row.v) : undefined
  }

  /** Lê o banco: nomes dos pedaços e quantas linhas cada um tem. */
  private readPieces(): Map<string, number> {
    const out = new Map<string, number>()
    for (const r of this.sql.exec('SELECT name, COUNT(*) AS n FROM world_part GROUP BY name').toArray()) out.set(String(r.name), Number(r.n))
    return out
  }

  load(): SeasonState | null {
    const format = this.format()
    if (format === undefined) return null
    if (format !== FORMAT) throw new Error(`Formato do mundo guardado desconhecido (${format}).`)
    const texts = new Map<string, string[]>()
    for (const r of this.sql.exec('SELECT name, seq, data FROM world_part ORDER BY name, seq').toArray()) {
      const name = String(r.name)
      const list = texts.get(name) ?? []
      list[Number(r.seq)] = String(r.data)
      texts.set(name, list)
    }
    const values = new Map<string, unknown>()
    for (const [name, list] of texts) {
      if (list.some((p) => p === undefined)) throw new Error(`Mundo guardado incompleto: falta uma linha do pedaço ${name}.`)
      values.set(name, JSON.parse(list.join('')))
    }
    const state = joinSeasonParts(values)
    // O que acabou de ser lido é o que está no banco: o próximo `save` só regrava o que mudar daqui para a frente.
    this.known = { pieces: new Map([...texts].map(([n, l]) => [n, l.length])), refs: new Map(planSeasonParts(state).map((p) => [p.name, p.refs])) }
    return state
  }

  save(state: SeasonState): WorldSaveStats {
    const plan = planSeasonParts(state)
    // Sem `load` antes (primeiro uso, ou objeto reiniciado): não se sabe o que há no banco, então todos os pedaços são regravados.
    const known = this.known ?? { pieces: this.format() === undefined ? new Map<string, number>() : this.readPieces(), refs: new Map<string, readonly unknown[]>() }
    const changed = plan.filter((p) => !sameRefs(known.refs.get(p.name), p.refs) || !known.pieces.has(p.name))
    const texts = changed.map((p) => JSON.stringify(p.build()))

    let rowsWritten = 0
    let chars = 0
    let largestChars = 0
    const pieces = new Map(known.pieces)
    this.sql.transaction(() => {
      changed.forEach((p, i) => {
        const text = texts[i]!
        const count = Math.max(1, Math.ceil(text.length / this.pieceChars))
        for (let seq = 0; seq < count; seq++) {
          this.sql.exec('INSERT OR REPLACE INTO world_part (name, seq, data) VALUES (?, ?, ?)', p.name, seq, text.slice(seq * this.pieceChars, (seq + 1) * this.pieceChars))
          rowsWritten++
        }
        // Se o pedaço encolheu, sobram linhas velhas no fim.
        const old = known.pieces.get(p.name) ?? 0
        if (old > count) {
          this.sql.exec('DELETE FROM world_part WHERE name = ? AND seq >= ?', p.name, count)
          rowsWritten += old - count
        }
        pieces.set(p.name, count)
        chars += text.length
        largestChars = Math.max(largestChars, text.length)
      })
      // Pedaços que deixaram de existir (por exemplo, um grupo de rodadas que a virada de temporada apagou).
      const alive = new Set(plan.map((p) => p.name))
      for (const [name, n] of known.pieces) {
        if (alive.has(name)) continue
        this.sql.exec('DELETE FROM world_part WHERE name = ?', name)
        rowsWritten += n
        pieces.delete(name)
      }
      this.sql.exec("INSERT OR REPLACE INTO world_meta (k, v) VALUES ('format', ?)", String(FORMAT))
    })
    // Só depois de a transação terminar é que o que se sabe do banco muda: se ela falhar, o estado conhecido continua o anterior.
    this.known = { pieces, refs: new Map(plan.map((p) => [p.name, p.refs])) }
    return { parts: plan.length, changed: changed.length, rowsWritten, chars, largestChars }
  }

  /** Esquece o que se sabe do banco (o objeto reiniciou): a próxima gravação lê o banco de novo. */
  forget(): void {
    this.known = undefined
  }
}

