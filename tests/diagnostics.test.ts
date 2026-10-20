import { describe, expect, it } from 'vitest'
import { REFERENCE_TARGETS, browserFromUserAgent, formatReport, measureWorld, modelFromUserAgent, readDevice } from '../src/diagnostics/measure'
import type { DeviceInfo } from '../src/diagnostics/measure'
import { FULL_WORLD } from '../src/diagnostics/scaleWorld'

const CHROME_ANDROID = 'Mozilla/5.0 (Linux; Android 13; SM-A135M Build/TP1A.220624.014) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.6367.82 Mobile Safari/537.36'
const SAFARI_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1'
const SAMSUNG = 'Mozilla/5.0 (Linux; Android 12; SAMSUNG SM-A032M) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/23.0 Chrome/115.0.0.0 Mobile Safari/537.36'

describe('diagnóstico: aparelho e navegador', () => {
  it('reconhece navegador e modelo pelo texto do navegador', () => {
    expect(browserFromUserAgent(CHROME_ANDROID)).toBe('Chrome 124.0.6367.82')
    expect(browserFromUserAgent(SAFARI_IPHONE)).toBe('Safari 17.4')
    expect(browserFromUserAgent(SAMSUNG)).toBe('Samsung Internet 23.0')
    expect(modelFromUserAgent(CHROME_ANDROID)).toBe('SM-A135M')
    expect(modelFromUserAgent(SAFARI_IPHONE)).toBe('iPhone')
    expect(modelFromUserAgent('Mozilla/5.0 (X11; Linux x86_64) Firefox/120.0')).toBeNull()
  })

  it('prefere o modelo da API moderna e cai para o texto do navegador', async () => {
    const modern = await readDevice({
      userAgent: CHROME_ANDROID,
      hardwareConcurrency: 8,
      deviceMemory: 4,
      userAgentData: { platform: 'Android', getHighEntropyValues: async () => ({ model: 'Moto G22', platformVersion: '13.0.0' }) },
    })
    expect(modern.model).toBe('Moto G22')
    expect(modern.platform).toBe('Android 13.0.0')
    expect(modern.memoryGb).toBe(4)
    const fallback = await readDevice({ userAgent: CHROME_ANDROID, userAgentData: { getHighEntropyValues: async () => { throw new Error('recusado') } } })
    expect(fallback.model).toBe('SM-A135M')
    const none = await readDevice({ userAgent: 'Mozilla/5.0 (X11; Linux x86_64) Firefox/120.0' })
    expect(none.model).toBe('não informado pelo navegador')
    expect(none.memoryGb).toBeNull()
  })
})

describe('diagnóstico: medição', () => {
  const device: DeviceInfo = { model: 'SM-A135M', platform: 'Android 13', browser: 'Chrome 124', userAgent: CHROME_ANDROID, cores: 8, memoryGb: 4, screen: '412x915 @2.6x', gpu: 'Mali-G52', speedIndex: 5000 }

  it('mede alguns avanços do mundo do Brasil e escreve o texto para copiar', async () => {
    const progress: number[] = []
    const m = await measureWorld({ world: 'brazil', maxAdvances: 3, onProgress: (n) => progress.push(n), readMemory: () => 50 * 1024 * 1024 })
    expect(m.clubs).toBe(60)
    expect(m.advances).toBe(3)
    expect(progress).toEqual([1, 2, 3])
    expect(m.finished).toBe(false)
    expect(m.peakMemoryMb).toBe(50)
    expect(m.saveJsonKb).toBeGreaterThan(100)
    const text = formatReport(device, m, 'Moto G22', new Date('2026-10-15T12:00:00Z'))
    expect(text).toContain('Aparelho: Moto G22 (navegador informa: SM-A135M)')
    expect(text).toContain('Navegador: Chrome 124')
    expect(text).toContain('Medida parcial: 3 avancos')
    expect(text).toContain(REFERENCE_TARGETS.device)
  })

  it('o relatório diz quando o navegador não deixa medir a memória', async () => {
    const m = await measureWorld({ world: 'brazil', maxAdvances: 1, readMemory: () => null })
    expect(m.peakMemoryMb).toBeNull()
    expect(formatReport(device, m)).toContain('o navegador nao permite medir')
  })

  it('o mundo completo tem 358 clubes em 21 ligas', () => {
    expect(FULL_WORLD).toHaveLength(21)
    expect(FULL_WORLD.reduce((n, l) => n + l.teams, 0)).toBe(358)
  })
})

describe('diagnóstico: tela', () => {
  it('a tela mostra o aparelho, os dois botões de medida e a referência', async () => {
    const { renderToStaticMarkup } = await import('react-dom/server')
    const { createElement } = await import('react')
    const { Diagnostics } = await import('../src/ui/screens/Diagnostics')
    const html = renderToStaticMarkup(createElement(Diagnostics))
    for (const text of ['Diagnóstico de desempenho', 'Medir uma temporada inteira', 'Medida rápida (10 avanços)', '358 clubes', 'Android de entrada', 'Nome do aparelho']) expect(html).toContain(text)
  })
})
