import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { CODE_VISIBLE_MS, RecoveryCodeView } from '../src/ui/screens/online/RecoveryCode'
import { CreateAccount } from '../src/ui/screens/online/CreateAccount'
import { RecoverAccount } from '../src/ui/screens/online/RecoverAccount'
import { ACCOUNT_REASON_LABELS, CLOUD_STATUS_LABELS } from '../src/ui/labels'

const words = ['abrigo', 'cavalo', 'fronteira', 'lanterna', 'mosaico', 'navio', 'orquidea', 'pessego', 'quintal', 'rochedo', 'saveiro', 'tapete']

describe('telas da conta online (B8.1)', () => {
  it('criar conta começa pelo apelido, com as regras e o botão desligado', () => {
    const html = renderToStaticMarkup(createElement(CreateAccount, { onDone: () => undefined, onBack: () => undefined }))
    expect(html).toContain('Escolha seu apelido')
    expect(html).toContain('Passo 1 de 2')
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Continuar<\/button>/)
  })

  it('entrar com o código pede as 12 palavras e começa com o botão desligado', () => {
    const html = renderToStaticMarkup(createElement(RecoverAccount, { onDone: () => undefined, onBack: () => undefined }))
    expect(html).toContain('0 de 12 palavras')
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Entrar<\/button>/)
  })

  it('o código só aparece depois do toque e esconde sozinho em 30 s', () => {
    const html = renderToStaticMarkup(createElement(RecoveryCodeView, { words, onBack: () => undefined }))
    expect(html).not.toContain('fronteira')
    expect(html).toContain('Mostrar o código')
    expect(CODE_VISIBLE_MS).toBe(30_000)
  })

  it('todo motivo de erro e todo estado da nuvem tem rótulo', () => {
    for (const label of [...Object.values(ACCOUNT_REASON_LABELS), ...Object.values(CLOUD_STATUS_LABELS)]) expect(label.length).toBeGreaterThan(3)
  })
})
