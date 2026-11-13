import { describe, expect, it } from 'vitest'
import { moneyText, parseMoney } from '../src/ui/components/MoneyInput'
import { parseClientMessage } from '../src/online/liveProtocol'

describe('campo de dinheiro', () => {
  it('mostra com pontos e aceita só números, colados ou digitados', () => {
    expect(moneyText(56_080_000).replace(/\s/g, ' ')).toBe('R$ 56.080.000')
    expect(moneyText(0)).toBe('')
    expect(parseMoney('56080000')).toBe(56_080_000)
    expect(parseMoney('R$ 56.080.000')).toBe(56_080_000)
    expect(parseMoney('abc')).toBe(0)
    expect(parseMoney('')).toBe(0)
  })
})

describe('mensagem Pular', () => {
  it('o servidor aceita {t:"skip"} e recusa lixo', () => {
    expect(parseClientMessage('{"t":"skip"}')).toEqual({ ok: true, message: { t: 'skip' } })
    expect(parseClientMessage('{"t":"skipp"}').ok).toBe(false)
  })
})
