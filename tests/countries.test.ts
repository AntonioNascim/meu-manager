import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { buildScalePackage } from '../src/diagnostics/scalePackage'
import { NATIONALITIES } from '../src/engine/types'
import type { DataPackage } from '../src/data/package/types'
import { validatePackage } from '../src/data/package/validate'
import { COUNTRY_INFO } from '../src/ui/countries'
import { NATIONALITY_LABELS, packageIssueText } from '../src/ui/labels'
import { Flag } from '../src/ui/theme/PlayerBits'
import { flagShapes } from '../src/ui/theme/flags'

describe('nacionalidades do mundo todo', () => {
  it('são mais de 200 países, cada um com nome em português e bandeira', () => {
    expect(NATIONALITIES.length).toBeGreaterThan(200)
    expect(new Set(NATIONALITIES).size).toBe(NATIONALITIES.length)
    for (const n of NATIONALITIES) {
      expect(NATIONALITY_LABELS[n], n).toBeTruthy()
      expect(COUNTRY_INFO[n].flag, n).toMatch(/^[hvn]/)
    }
    expect(new Set(NATIONALITIES.map((n) => NATIONALITY_LABELS[n])).size).toBe(NATIONALITIES.length)
    expect(NATIONALITY_LABELS.Japan).toBe('Japão')
    expect(NATIONALITY_LABELS['Ivory Coast']).toBe('Costa do Marfim')
  })

  it('toda bandeira desenha formas, só com cores conhecidas, e o componente mostra o nome do país', () => {
    for (const n of NATIONALITIES) {
      expect(flagShapes(COUNTRY_INFO[n].flag).length, n).toBeGreaterThan(0)
      const letters = COUNTRY_INFO[n].flag.replace(/^[hvn]\d*:?/, '').split('/').map((p) => (p.includes(':') ? p.split(':').slice(1).join('') : p)).join('')
      expect(letters, n).toMatch(/^[a-z]*$/)
    }
    const html = renderToStaticMarkup(createElement(Flag, { nationality: 'Japan' }))
    expect(html).toContain('aria-label="Japão"')
    expect(html).toContain('<circle')
    expect(renderToStaticMarkup(createElement(Flag, { nationality: 'Brazil' }))).toContain('Brasil')
  })

  it('o jogador do pacote pode ser de qualquer país; a liga de um país sem padrão avisa', () => {
    const pkg = JSON.parse(JSON.stringify(buildScalePackage(7))) as DataPackage
    pkg.players[0]!.nationality = 'Japan'
    pkg.players[1]!.nationality = 'Ivory Coast'
    expect(validatePackage(pkg).report.errors).toEqual([])
    pkg.players[2]!.nationality = 'Atlantis' as never
    expect(validatePackage(pkg).report.errors.map((e) => e.code)).toContain('unknown-value')

    const mexico = JSON.parse(JSON.stringify(buildScalePackage(7))) as DataPackage
    mexico.countries.push({ id: 'Mexico', name: 'México' })
    const league = mexico.leagues.find((l) => l.id === 'py-1')!
    league.country = 'Mexico'
    const result = validatePackage(mexico).report
    expect(result.errors).toEqual([])
    const warning = result.warnings.find((w) => w.code === 'league-defaults-missing')!
    expect(warning).toBeDefined()
    expect(packageIssueText(warning)).toContain('Mexico')
    league.economy = { revenue: 0.7, level: -1 }
    expect(validatePackage(mexico).report.warnings.some((w) => w.code === 'league-defaults-missing')).toBe(false)
  })
})
