/** Nome curto dos clubes: pacote real, geração automática, validação e uso na interface. */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { generateWorld } from '../src/data/generateWorld'
import { loadWorld } from '../src/data/package/defaultPackage'
import { SHORT_NAME_MAX, autoShortName, clubShortName } from '../src/data/package/shortName'
import type { DataPackage } from '../src/data/package/types'
import { validatePackage } from '../src/data/package/validate'
import { shortName } from '../src/ui/screens/standings/parts'

const real = JSON.parse(readFileSync('data/pacote-real.json', 'utf8')) as DataPackage

describe('nome curto', () => {
  it('encurta os nomes formais do mundo fictício e deixa os curtos em paz', () => {
    expect(autoShortName('Imperial Futebol Clube')).toBe('Imperial')
    expect(autoShortName('Sol Nascente Esporte Clube')).toBe('Sol Nascente')
    expect(autoShortName('Serra Gaúcha Atlético Clube')).toBe('Serra Gaúcha')
    expect(autoShortName('Maré Alta Sport Club')).toBe('Maré Alta')
    expect(autoShortName('Pampa Atlético')).toBe('Pampa')
    expect(autoShortName('Real Carioca')).toBe('Real Carioca')
    expect(autoShortName('Atlético Mineiro')).toBe('Atlético Mineiro')
    expect(autoShortName('Futebol Clube')).toBe('Futebol Clube')
  })

  it('usa o nome curto do clube quando existe', () => {
    expect(clubShortName({ name: 'Borussia Mönchengladbach', shortName: 'Gladbach' })).toBe('Gladbach')
    expect(clubShortName({ name: 'Imperial Futebol Clube' })).toBe('Imperial')
    expect(shortName({ name: 'Manchester United F.C.', shortName: 'Man United' })).toBe('Man United')
  })

  it('todo clube do pacote real tem nome curto, sem repetir dentro da liga', () => {
    for (const c of real.clubs) {
      expect(c.shortName, c.name).toBeTruthy()
      expect((c.shortName as string).length, c.name).toBeLessThanOrEqual(SHORT_NAME_MAX)
    }
    for (const league of real.leagues) {
      const names = real.clubs.filter((c) => c.league === league.id).map((c) => (c.shortName as string).toLowerCase())
      expect(new Set(names).size, league.id).toBe(names.length)
    }
    const by = new Map(real.clubs.map((c) => [c.name, c.shortName]))
    expect(by.get('Bayer Leverkusen')).toBe('Leverkusen')
    expect(by.get('Borussia Mönchengladbach')).toBe('Gladbach')
    expect(by.get('Atlético Mineiro')).toBe('Atlético-MG')
    expect(by.get('Manchester United F.C.')).toBe('Man United')
  })

  it('o mundo montado leva o nome curto para o time', () => {
    const team = loadWorld(3, real).teams.find((t) => t.name === 'Bayer Leverkusen')
    expect(team?.shortName).toBe('Leverkusen')
    // O mundo fictício não traz nome curto: a interface encurta pelo nome.
    expect(generateWorld({ seed: 1 }).teams.every((t) => t.shortName === undefined)).toBe(true)
  })

  it('a validação recusa nome curto vazio ou comprido demais', () => {
    const copy = (value: unknown) => ({ ...real, clubs: real.clubs.map((c, i) => (i === 0 ? { ...c, shortName: value } : c)) })
    expect(validatePackage(copy('Gladbach')).report.errors).toEqual([])
    expect(validatePackage(copy('')).report.errors.some((e) => e.path === 'clubs[0].shortName')).toBe(true)
    expect(validatePackage(copy('x'.repeat(SHORT_NAME_MAX + 1))).report.errors.some((e) => e.path === 'clubs[0].shortName')).toBe(true)
  })
})
