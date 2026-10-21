import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { blendFame, fameQuality, generateLeagueAttributes, REAL_ATTRIBUTES } from '../tools/realdata/attributes'
import type { RosterPlayer } from '../tools/realdata/attributes'
import { Fetcher } from '../tools/realdata/http'
import { fetchViews, viewsWindow } from '../tools/realdata/pageviews'

describe('visualizações recentes (pageviews)', () => {
  let dir = ''
  afterEach(() => dir && rmSync(dir, { recursive: true, force: true }))

  it('a janela são os 3 últimos meses fechados', () => {
    expect(viewsWindow(new Date('2026-10-20T12:00:00Z'))).toEqual({ start: '2026070100', end: '2026093000' })
    expect(viewsWindow(new Date('2027-02-03T12:00:00Z'))).toEqual({ start: '2026110100', end: '2027013100' })
    expect(viewsWindow(new Date('2026-03-01T00:00:00Z'))).toEqual({ start: '2025120100', end: '2026022800' })
  })

  it('soma os meses, trata 404 como zero e consulta o título com o endereço certo', async () => {
    dir = mkdtempSync(join(tmpdir(), 'views-'))
    const urls: string[] = []
    const impl = (async (url: string) => {
      urls.push(url)
      if (url.includes('/Sem_Visitas/')) return new Response('{}', { status: 404 })
      return new Response(JSON.stringify({ items: [{ views: 100 }, { views: 250 }, { views: 50 }] }), { status: 200 })
    }) as unknown as typeof fetch
    const fetcher = new Fetcher({ userAgent: 'teste', cacheDir: dir, refresh: false, pauseMs: 0, fetchImpl: impl })
    const views = await fetchViews(fetcher, new Map([['Q1', 'Marcus Rashford'], ['Q2', 'Sem Visitas'], ['Q3', 'Kylian Mbappé']]), new Date('2026-10-20T12:00:00Z'))
    expect([...views]).toEqual([['Q1', 400], ['Q2', 0], ['Q3', 400]])
    expect(urls[0]).toContain('/per-article/en.wikipedia/all-access/user/Marcus_Rashford/monthly/2026070100/2026093000')
    expect(urls[2]).toContain('Kylian_Mbapp%C3%A9')
  })

  it('outro erro de rede não vira zero', async () => {
    dir = mkdtempSync(join(tmpdir(), 'views-'))
    const impl = (async () => new Response('erro', { status: 400 })) as unknown as typeof fetch
    const fetcher = new Fetcher({ userAgent: 'teste', cacheDir: dir, refresh: false, pauseMs: 0, fetchImpl: impl })
    await expect(fetchViews(fetcher, new Map([['Q1', 'X']]), new Date('2026-10-20T12:00:00Z'))).rejects.toThrow(/HTTP 400/)
  })
})

describe('fama de agora (carreira + visualizações)', () => {
  // 100 jogadores em que as visualizações crescem com a fama, mais três casos extremos com a mesma fama de carreira.
  const base = Array.from({ length: 100 }, (_, i) => ({ id: `p${i}`, fame: 6 + i, views: Math.round(2 ** (7 + (i % 100) * 0.1)) }))
  const fame: Record<string, number> = Object.fromEntries(base.map((p) => [p.id, p.fame]))
  const views: Record<string, number> = Object.fromEntries(base.map((p) => [p.id, p.views]))
  Object.assign(fame, { alta: 60, baixa: 60, meio: 60, semDados: 60 })
  Object.assign(views, { alta: 2 ** 20, baixa: 2 ** 6, meio: 2 ** 12 })

  it('quem está em alta sobe, quem está em baixa desce, quem não tem visualizações fica igual', () => {
    const { fame: now, fit } = blendFame(fame, views)
    expect(now.alta).toBeGreaterThan(60)
    expect(now.baixa).toBeLessThan(60)
    expect(now.semDados).toBe(60)
    expect(now.meio).toBeGreaterThan(now.baixa as number)
    expect(fit?.n).toBe(103)
    expect(fit?.slope).toBeGreaterThan(0)
  })

  it('sem visualizações ou com poucas, devolve a fama de carreira', () => {
    expect(blendFame(fame, undefined).fame).toEqual(fame)
    expect(blendFame(fame, { alta: 5000, baixa: 10 }).fame).toEqual(fame)
  })

  it('o peso das visualizações regula a mistura', () => {
    const career = blendFame(fame, views, 0).fame
    const moment = blendFame(fame, views, 1).fame
    const half = blendFame(fame, views, 0.5).fame
    expect(career.alta).toBeCloseTo(60, 6)
    expect(moment.alta as number).toBeGreaterThan(half.alta as number)
    expect(half.alta as number).toBeGreaterThan(60)
  })

  it('dois jogadores iguais: o que está em alta agora fica com força maior', () => {
    const roster: RosterPlayer[] = ['a', 'b'].map((id) => ({ id, name: id, birthDate: '1998-05-05', nationality: 'Brazil', position: 'ST', clubId: 'c', academy: false }))
    const run = (famous: Record<string, number>) => generateLeagueAttributes({ id: 'br-1', tier: 1, repBottom: 7 }, [{ id: 'c', reputation: 14 }], roster, { startYear: 2026, fame: famous })
    const now = blendFame({ ...fame, a: 80, b: 80 }, { ...views, a: 2 ** 21, b: 2 ** 6 }).fame
    const made = run({ a: now.a as number, b: now.b as number })
    expect((made.get('a')?.overall ?? 0)).toBeGreaterThan((made.get('b')?.overall ?? 0) + 2)
  })
})

describe('idade pesa mais a partir dos 31 anos', () => {
  it('a fama indica menos qualidade a cada ano depois dos 31, mais rápido que antes', () => {
    const q = (age: number): number => fameQuality(100, age)
    expect(q(31)).toBe(q(25))
    expect(q(32)).toBeCloseTo(q(31) - REAL_ATTRIBUTES.fameAge.perYear, 6)
    expect(q(34)).toBeCloseTo(q(31) - 3 * REAL_ATTRIBUTES.fameAge.perYear, 6)
    expect(REAL_ATTRIBUTES.fameAge.perYear).toBeGreaterThan(1.8)
    expect(REAL_ATTRIBUTES.old.fromAge).toBe(31)
  })

  it('o veterano fica abaixo do jovem de mesma fama e clube', () => {
    const roster: RosterPlayer[] = [['jovem', '1999-05-05'], ['veterano', '1990-05-05']].map(([id, birthDate]) => ({ id: id as string, name: id as string, birthDate: birthDate as string, nationality: 'Brazil', position: 'CM', clubId: 'c', academy: false }))
    const made = generateLeagueAttributes({ id: 'br-1', tier: 1, repBottom: 7 }, [{ id: 'c', reputation: 14 }], roster, { startYear: 2026, fame: { jovem: 90, veterano: 90 } })
    expect((made.get('veterano')?.overall ?? 0)).toBeLessThan((made.get('jovem')?.overall ?? 0) - 5)
  })
})
