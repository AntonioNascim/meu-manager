/** Relatos de problema no D1, com a imagem no R2 privado (teste fechado; B9). */
import type { ProblemRow, ProblemStatus, ProblemStore } from '../src/online/problemApi'
import type { D1Like } from './d1Store'

export interface ImageBucket {
  get(key: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer> } | null>
  put(key: string, value: Uint8Array): Promise<unknown>
  delete(keys: string | string[]): Promise<void>
}

interface R {
  id: string
  created_at: number
  category: string
  text: string
  tech: string
  has_image: number
  status: string
}

const toRow = (r: R): ProblemRow => ({ id: r.id, createdAt: r.created_at, category: r.category as ProblemRow['category'], text: r.text, tech: JSON.parse(r.tech) as ProblemRow['tech'], hasImage: r.has_image === 1, status: r.status as ProblemStatus })
const keyOf = (id: string) => `problems/${id}.jpg`

export class D1ProblemStore implements ProblemStore {
  constructor(
    private db: D1Like,
    private bucket: ImageBucket,
  ) {}

  async add(row: ProblemRow, image?: Uint8Array): Promise<void> {
    if (image) await this.bucket.put(keyOf(row.id), image)
    await this.db
      .prepare('INSERT INTO problem_reports (id, created_at, category, text, tech, has_image, status) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(row.id, row.createdAt, row.category, row.text, JSON.stringify(row.tech), row.hasImage ? 1 : 0, row.status)
      .run()
  }

  async list(status: ProblemStatus, limit: number): Promise<ProblemRow[]> {
    const res = await this.db.prepare('SELECT * FROM problem_reports WHERE status = ? ORDER BY created_at DESC LIMIT ?').bind(status, limit).all<R>()
    return res.results.map(toRow)
  }

  async get(id: string): Promise<{ row: ProblemRow; image?: Uint8Array } | undefined> {
    const r = await this.db.prepare('SELECT * FROM problem_reports WHERE id = ?').bind(id).first<R>()
    if (!r) return undefined
    const row = toRow(r)
    if (!row.hasImage) return { row }
    const obj = await this.bucket.get(keyOf(id))
    return obj ? { row, image: new Uint8Array(await obj.arrayBuffer()) } : { row }
  }

  async setStatus(id: string, status: ProblemStatus): Promise<boolean> {
    const res = await this.db.prepare('UPDATE problem_reports SET status = ? WHERE id = ?').bind(status, id).run()
    return res.meta.changes === 1
  }

  async remove(id: string): Promise<boolean> {
    await this.bucket.delete(keyOf(id))
    const res = await this.db.prepare('DELETE FROM problem_reports WHERE id = ?').bind(id).run()
    return res.meta.changes === 1
  }

  async countSince(since: number): Promise<number> {
    const r = await this.db.prepare('SELECT COUNT(*) AS n FROM problem_reports WHERE created_at >= ?').bind(since).first<{ n: number }>()
    return r?.n ?? 0
  }

  async purgeBefore(before: number): Promise<number> {
    const old = await this.db.prepare('SELECT id FROM problem_reports WHERE created_at < ? AND has_image = 1 LIMIT 200').bind(before).all<{ id: string }>()
    if (old.results.length > 0) await this.bucket.delete(old.results.map((x) => keyOf(x.id)))
    const res = await this.db.prepare('DELETE FROM problem_reports WHERE created_at < ?').bind(before).run()
    return res.meta.changes
  }
}
