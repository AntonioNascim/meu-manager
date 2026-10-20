import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { defaultPackage } from '../src/data/package/defaultPackage'
import { addClub, addCountry, addLeague, emptyPackage } from '../src/data/package/edit/ops'
import { validatePackage } from '../src/data/package/validate'
import type { DataPackage } from '../src/data/package/types'
import { ClubsTab } from '../src/ui/screens/editor/ClubsTab'
import { CupsTab } from '../src/ui/screens/editor/CupsTab'
import { IssuesTab } from '../src/ui/screens/editor/IssuesTab'
import { LeaguesTab } from '../src/ui/screens/editor/LeaguesTab'
import { PackageTab } from '../src/ui/screens/editor/PackageTab'
import { PlayersTab } from '../src/ui/screens/editor/PlayersTab'
import { SheetsTab } from '../src/ui/screens/editor/SheetsTab'
import type { TabProps } from '../src/ui/screens/editor/parts'
import type { Validation } from '../src/ui/screens/editor/useEditor'
import { locateIssue } from '../src/data/package/edit/ops'

function props(pkg: DataPackage, index: number | null, extra: Partial<TabProps> = {}): TabProps {
  const report = validatePackage(pkg, { maxIssues: 500 }).report
  const byEntity = new Map<string, Validation['report']['errors']>()
  for (const issue of [...report.errors, ...report.warnings]) {
    const at = locateIssue(issue.path)
    if (at) byEntity.set(`${at.kind}:${at.index}`, [...(byEntity.get(`${at.kind}:${at.index}`) ?? []), issue])
  }
  const validation: Validation = { report, pending: false, byEntity, count: (k) => [...byEntity.keys()].filter((x) => x.startsWith(`${k}:`)).length }
  return {
    editor: { pkg, edit: () => undefined, undo: () => undefined, redo: () => undefined, canUndo: false, canRedo: false, replace: () => undefined },
    validation,
    selected: { leagues: index, clubs: index, players: index, cups: index },
    select: () => undefined,
    goTo: () => undefined,
    playerList: 'players',
    setPlayerList: () => undefined,
    clubFilter: null,
    setClubFilter: () => undefined,
    ...extra,
  }
}

describe('telas do editor', () => {
  const pkg = defaultPackage(2)

  it('mostram a lista e o detalhe de cada aba sem erro', () => {
    for (const tab of [PackageTab, LeaguesTab, ClubsTab, PlayersTab, CupsTab, SheetsTab, IssuesTab]) {
      expect(renderToStaticMarkup(createElement(tab, props(pkg, null))).length).toBeGreaterThan(100)
      expect(renderToStaticMarkup(createElement(tab, props(pkg, 0))).length).toBeGreaterThan(100)
    }
  })

  it('o detalhe do clube mostra o escudo e o do jogador mostra a força e os atributos', () => {
    const club = renderToStaticMarkup(createElement(ClubsTab, props(pkg, 0)))
    expect(club).toContain(pkg.clubs[0]!.name)
    expect(club).toContain(pkg.clubs[0]!.abbreviation)
    const player = renderToStaticMarkup(createElement(PlayersTab, props(pkg, 0)))
    expect(player).toContain('Finalização')
    expect(player).toContain('Gerar automaticamente')
  })

  it('mostram os problemas do pacote na entidade e na aba Problemas', () => {
    let broken = addLeague(addCountry(emptyPackage('Quebrado'), { id: 'Brazil', name: 'Brasil' }), 'Brazil', 'Liga')
    broken = addClub(broken, broken.leagues[0]!.id)
    const html = renderToStaticMarkup(createElement(LeaguesTab, props(broken, 0)))
    expect(html).toContain('entity-issues')
    expect(renderToStaticMarkup(createElement(IssuesTab, props(broken, null)))).toContain('Ir para liga')
  })
})
