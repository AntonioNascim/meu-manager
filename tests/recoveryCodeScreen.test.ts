import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { recoveryFile, RecoveryCodeView } from '../src/ui/screens/online/RecoveryCode'

const CODE = 'K7QP9X2MHT4R8WZC3NFB'
const view = (confirmed: boolean) => renderToStaticMarkup(createElement(RecoveryCodeView, { code: CODE, confirmed, onConfirm: () => {}, onBack: () => {} }))

describe('tela do código de recuperação', () => {
  it('traz o aviso, esconde o código até o toque e oferece copiar, baixar e "Já guardei"', () => {
    const html = view(false)
    expect(html).toContain('recovery-warning')
    expect(html).toContain('perde a carreira salva na nuvem e o acesso às ligas online')
    expect(html).toContain('Mostrar o código')
    expect(html).not.toContain('K7QP')
    expect(html).toContain('Copiar')
    expect(html).toContain('Baixar arquivo')
    expect(html).toContain('Já guardei')
  })

  it('depois do "Já guardei" o botão some', () => {
    const html = view(true)
    expect(html).not.toContain('code-saved-button')
    expect(html).toContain('Você marcou que já guardou o código.')
  })

  it('não há mais confirmação digitando partes do código', () => {
    expect(view(false)).not.toContain('Confira o que anotou')
  })

  it('o arquivo baixado traz o código em grupos, o apelido e o aviso', () => {
    const f = recoveryFile(CODE, 'Craque Ana')
    expect(f.filename).toBe('meu-manager-codigo-de-recuperacao.txt')
    expect(f.text).toContain('K7QP-9X2M-HT4R-8WZC-3NFB')
    expect(f.text).toContain('Craque Ana')
    expect(f.text).toContain('Quem tiver este código entra na sua conta')
  })
})
