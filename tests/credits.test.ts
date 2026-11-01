import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Credits } from '../src/ui/screens/Credits'

describe('tela de créditos', () => {
  const html = renderToStaticMarkup(createElement(Credits, { onBack: () => {} }))

  it('cita Wikipedia (CC BY-SA, com link), Wikidata (CC0) e as visualizações da Wikimedia', () => {
    expect(html).toContain('CC BY-SA 4.0')
    expect(html).toContain('https://creativecommons.org/licenses/by-sa/4.0/')
    expect(html).toContain('https://www.wikipedia.org')
    expect(html).toContain('Wikidata')
    expect(html).toContain('https://creativecommons.org/publicdomain/zero/1.0/')
    expect(html).toContain('Visualizações de páginas da Wikimedia')
  })

  it('avisa que o jogo é independente e que os escudos são genéricos', () => {
    expect(html).toContain('Jogo independente')
    expect(html).toContain('não tem ligação')
    expect(html).toContain('escudos são desenhos genéricos')
  })
})
