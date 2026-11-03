import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { RecoveryCodeSetup, RecoveryCodeView } from '../src/ui/screens/online/RecoveryCode'

const WORDS = ['abacate', 'abaixo', 'abalar', 'abater', 'abduzir', 'abelha', 'aberto', 'abismo', 'abotoar', 'abranger', 'abreviar', 'abrigar']

describe('telas do código de recuperação (primeira renderização)', () => {
  it('o primeiro uso começa pelo aviso e pelas 12 palavras numeradas, antes de qualquer confirmação', () => {
    const html = renderToStaticMarkup(createElement(RecoveryCodeSetup, { words: WORDS, positions: [1, 5, 9], onConfirmed: () => {} }))
    expect(html).toContain('recovery-warning')
    expect(html).toContain('perde a carreira salva na nuvem e o acesso às ligas online')
    for (const w of WORDS) expect(html).toContain(w)
    expect(html).toContain('Anotei, continuar')
    expect(html).not.toContain('Confira o que anotou')
  })

  it('pelo menu, o código fica escondido até o toque, mas o aviso aparece', () => {
    const html = renderToStaticMarkup(createElement(RecoveryCodeView, { words: WORDS, onBack: () => {} }))
    expect(html).toContain('recovery-warning')
    expect(html).toContain('Mostrar o código')
    for (const w of WORDS) expect(html).not.toContain(w)
  })
})
