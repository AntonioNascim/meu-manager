import { describe, expect, it } from 'vitest'
import { isUnitedKingdom, toNationality } from '../tools/realdata/nationality'
import { guessPositions, parseCoarse, specificPosition } from '../tools/realdata/positions'
import { parseSeasonLinks, parseSquad } from '../tools/realdata/wikitext'

describe('posições das fontes', () => {
  it('reconhece posições exatas do Wikidata', () => {
    expect(specificPosition('goalkeeper')).toBe('GK')
    expect(specificPosition('centre-back')).toBe('CB')
    expect(specificPosition('right-back')).toBe('RB')
    expect(specificPosition('left wing-back')).toBe('LB')
    expect(specificPosition('defensive midfielder')).toBe('DM')
    expect(specificPosition('attacking midfielder')).toBe('AM')
    expect(specificPosition('left winger')).toBe('LW')
    expect(specificPosition('centre-forward')).toBe('ST')
    expect(specificPosition('midfielder')).toBeUndefined()
  })

  it('posição clara não pede revisão', () => {
    const guess = guessPositions(['centre-back', 'defender'], 'DF')
    expect(guess).toEqual({ primary: 'CB', secondary: [], review: [] })
  })

  it('posição genérica escolhe a mais provável e marca para revisão', () => {
    expect(guessPositions(['defender'], 'DF').primary).toBe('CB')
    expect(guessPositions(['defender'], 'DF').review).toHaveLength(1)
    expect(guessPositions([], 'MF').primary).toBe('CM')
    expect(guessPositions([], 'FW').primary).toBe('ST')
    expect(guessPositions([], 'FW').review).toHaveLength(1)
    expect(guessPositions([], undefined).review).toHaveLength(1)
  })

  it('lateral genérico usa o pé para escolher o lado', () => {
    expect(guessPositions(['full-back'], 'DF', 'left').primary).toBe('LB')
    expect(guessPositions(['full-back'], 'DF', 'right').primary).toBe('RB')
    expect(guessPositions(['winger'], 'FW', 'left').primary).toBe('LW')
  })

  it('goleiro da tabela do clube é goleiro sem revisão', () => {
    expect(guessPositions([], 'GK')).toEqual({ primary: 'GK', secondary: [], review: [] })
  })

  it('o Wikidata fora do setor da tabela do clube é descartado com aviso', () => {
    const guess = guessPositions(['striker'], 'DF')
    expect(guess.primary).toBe('CB')
    expect(guess.review[0]).toMatch(/diverge/)
  })

  it('posições secundárias vêm do mesmo setor, sem repetir a principal, no máximo 2', () => {
    const guess = guessPositions(['central midfielder', 'defensive midfielder', 'attacking midfielder', 'left winger'], 'MF')
    expect(guess.primary).toBe('CM')
    expect(guess.secondary).toEqual(['DM', 'AM'])
  })

  it('a sigla da tabela aceita variações', () => {
    expect(parseCoarse('gk')).toBe('GK')
    expect(parseCoarse('DF')).toBe('DF')
    expect(parseCoarse('Midfielder')).toBe('MF')
    expect(parseCoarse('FW ')).toBe('FW')
    expect(parseCoarse('???')).toBeUndefined()
  })
})

describe('nacionalidades das fontes', () => {
  it('converte nomes, apelidos e siglas da FIFA', () => {
    expect(toNationality('Brazil')).toBe('Brazil')
    expect(toNationality('BRA')).toBe('Brazil')
    expect(toNationality('United States of America')).toBe('United States')
    expect(toNationality("Côte d'Ivoire")).toBe('Ivory Coast')
    expect(toNationality('Czechia')).toBe('Czech Republic')
    expect(toNationality('Türkiye')).toBe('Turkey')
    expect(toNationality('Atlantis')).toBeUndefined()
    expect(toNationality(undefined)).toBeUndefined()
  })

  it('reconhece "Reino Unido"', () => {
    expect(isUnitedKingdom('United Kingdom')).toBe(true)
    expect(isUnitedKingdom('England')).toBe(false)
  })
})

const SQUAD_PAGE = `
==History==
Some text with [[Other Club]].
==Players==
===First-team squad===
{{updated|19 September 2026}}
{{Fs start}}
{{Fs player|no=1|nat=Argentina|pos=GK|name=[[Agustín Rossi (footballer)|Agustín Rossi]]}}
{{Fs player|no=2|nat=Uruguay|pos=DF|name=[[Guillermo Varela]]}}
{{fs player|no=3|nat=BRA|pos=DF|name=[[Léo Ortiz]]|other=[[Captain (association football)|captain]]}}
{{Fs player|no=4|nat={{flagicon|Chile}} Chile|pos=MF|name=[[Erick Pulgar]]}}
{{Fs player|no=5|nat=Brazil|pos=FW|name=Jogador Sem Link}}
{{Fs player|no=6|nat=Brazil|pos=FW|name=[[Away Player]]|other=on loan to [[Somewhere]]}}
{{Fs end}}
===Out on loan===
{{Fs start}}
{{Fs player|no=30|nat=Brazil|pos=DF|name=[[Loaned Guy]]}}
{{Fs end}}
`

describe('tabela de elenco da Wikipedia', () => {
  const squad = parseSquad(SQUAD_PAGE)

  it('lê o elenco principal e ignora emprestados e quem está fora', () => {
    expect(squad.section).toBe('First-team squad')
    expect(squad.entries.map((e) => e.display)).toEqual(['Agustín Rossi', 'Guillermo Varela', 'Léo Ortiz', 'Erick Pulgar', 'Jogador Sem Link'])
  })

  it('guarda artigo, número, país e setor', () => {
    expect(squad.entries[0]).toEqual({ title: 'Agustín Rossi (footballer)', display: 'Agustín Rossi', number: 1, nat: 'Argentina', pos: 'GK' })
    expect(squad.entries[2]?.nat).toBe('BRA')
    expect(squad.entries[3]?.nat).toBe('Chile')
  })

  it('nome sem link fica sem artigo', () => {
    expect(squad.entries[4]?.title).toBeUndefined()
  })

  it('devolve vazio quando não há tabela de elenco', () => {
    expect(parseSquad('==History==\nNada aqui.').entries).toEqual([])
  })
})

describe('clubes da temporada', () => {
  it('a tabela de estádios vale mais que a seção Teams, que traz os rebaixados do ano anterior', () => {
    const rows = Array.from({ length: 8 }, (_, i) => `|-\n| [[Club ${i}]] || [[Town ${i}]] || [[Ground ${i}]]`).join('\n')
    const page = `==Teams==
{| class="wikitable"
! Relegated
|-
| [[Relegated FC]]
|}
==Stadiums and locations==
{|
${rows}
|}
`
    const titles = parseSeasonLinks(page).map((l) => l.title)
    expect(titles).toContain('Club 0')
    expect(titles).not.toContain('Relegated FC')
  })

  it('lê só as linhas de tabela das seções de clubes', () => {
    const page = `
==Teams==
Intro com [[Texto Solto]] e [[Relegated FC]].
{| class="wikitable"
|-
! scope="row" | [[Flamengo]]
| [[Rio de Janeiro]] || [[Maracanã]]
|-
| [[Palmeiras]] || [[São Paulo]]
|}
===Team changes===
* [[Promoted FC]]
==Standings==
| [[Fora Da Secao]]
`
    expect(parseSeasonLinks(page).map((l) => l.title)).toEqual(['Flamengo', 'Rio de Janeiro', 'Maracanã', 'Palmeiras', 'São Paulo'])
  })
})
