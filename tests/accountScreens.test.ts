import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { CODE_VISIBLE_MS, RecoveryCodeView } from '../src/ui/screens/online/RecoveryCode'
import { CreateAccount } from '../src/ui/screens/online/CreateAccount'
import { RecoverAccount } from '../src/ui/screens/online/RecoverAccount'
import { ACCOUNT_REASON_LABELS, CLOUD_STATUS_LABELS } from '../src/ui/labels'

const CODE = 'K7QP9X2MHT4R8WZC3NFB'

describe('telas da conta online (B8.1)', () => {
  it('criar conta começa pela faixa de idade, sem data de nascimento, e o botão desligado', () => {
    const html = renderToStaticMarkup(createElement(CreateAccount, { onDone: () => undefined, onBack: () => undefined }))
    expect(html).toContain('faixa de idade')
    expect(html).toContain('nunca a data de nascimento')
    expect(html).not.toContain('nickname-input')
    expect(html).not.toContain('Passo 1 de 2')
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Criar conta<\/button>/)
  })

  it('entrar com o código pede o código único e começa com o botão desligado', () => {
    const html = renderToStaticMarkup(createElement(RecoverAccount, { onDone: () => undefined, onBack: () => undefined }))
    expect(html).toContain('0 de 20 símbolos')
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Entrar<\/button>/)
  })

  it('o código só aparece depois do toque e esconde sozinho em 30 s', () => {
    const html = renderToStaticMarkup(createElement(RecoveryCodeView, { code: CODE, confirmed: false, onConfirm: () => undefined, onBack: () => undefined }))
    expect(html).not.toContain('K7QP')
    expect(html).toContain('Mostrar o código')
    expect(html).toContain('Copiar')
    expect(html).toContain('Baixar arquivo')
    expect(html).toContain('Já guardei')
    expect(CODE_VISIBLE_MS).toBe(30_000)
  })

  it('todo motivo de erro e todo estado da nuvem tem rótulo', () => {
    for (const label of [...Object.values(ACCOUNT_REASON_LABELS), ...Object.values(CLOUD_STATUS_LABELS)]) expect(label.length).toBeGreaterThan(3)
  })
})
