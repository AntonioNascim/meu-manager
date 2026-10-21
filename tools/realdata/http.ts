/**
 * Acesso à Wikipedia e ao Wikidata com as boas maneiras que as duas pedem: identificação do script no User-Agent, uma consulta por vez,
 * pausa entre as consultas, espera quando o servidor pede (429, `Retry-After`, `maxlag`) e cache das respostas em disco (uma rodada
 * interrompida recomeça de onde parou; `refresh` baixa tudo de novo para atualizar os elencos).
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export interface FetcherOptions {
  /** Identificação do script e contato (política de uso da Wikimedia). */
  userAgent: string
  /** Pasta do cache das respostas. */
  cacheDir: string
  /** Ignora o cache e baixa de novo (atualização depois de uma janela de transferências). */
  refresh: boolean
  /** Pausa, em milissegundos, depois de cada consulta à rede. */
  pauseMs: number
  /** Espera inicial entre tentativas depois de um erro do servidor (dobra a cada tentativa). Padrão: 5 s. */
  retryBaseMs?: number
  /** Para os testes: troca o `fetch`. */
  fetchImpl?: typeof fetch
  log?: (message: string) => void
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

export class Fetcher {
  private lastRequestAt = 0
  /** Quantas respostas vieram da rede e quantas do cache (vai para o relatório). */
  stats = { network: 0, cached: 0 }

  constructor(readonly options: FetcherOptions) {
    mkdirSync(options.cacheDir, { recursive: true })
  }

  /** GET que devolve JSON. */
  getJson<T>(url: string): Promise<T> {
    return this.request<T>(url, `GET ${url}`, { headers: { Accept: 'application/json' } })
  }

  /** POST de formulário que devolve JSON (consultas SPARQL longas). */
  postJson<T>(url: string, form: Record<string, string>, accept = 'application/sparql-results+json'): Promise<T> {
    const body = new URLSearchParams(form).toString()
    return this.request<T>(url, `POST ${url} ${body}`, { method: 'POST', body, headers: { Accept: accept, 'Content-Type': 'application/x-www-form-urlencoded' } })
  }

  private async request<T>(url: string, cacheKey: string, init: RequestInit): Promise<T> {
    const file = join(this.options.cacheDir, `${createHash('sha1').update(cacheKey).digest('hex')}.json`)
    if (!this.options.refresh && existsSync(file)) {
      this.stats.cached++
      return JSON.parse(readFileSync(file, 'utf8')) as T
    }
    const fetchImpl = this.options.fetchImpl ?? fetch
    let wait = this.options.retryBaseMs ?? 5000
    for (let attempt = 1; attempt <= 6; attempt++) {
      const gap = this.lastRequestAt + this.options.pauseMs - Date.now()
      if (gap > 0) await sleep(gap)
      this.lastRequestAt = Date.now()
      let text = ''
      let status = 0
      let retryAfter = 0
      try {
        const response = await fetchImpl(url, { ...init, headers: { ...(init.headers as Record<string, string>), 'User-Agent': this.options.userAgent }, signal: AbortSignal.timeout(120_000) })
        status = response.status
        retryAfter = Number(response.headers.get('retry-after') ?? '0') * 1000
        text = await response.text()
      } catch (error) {
        status = -1
        text = String(error)
      }
      this.lastRequestAt = Date.now()
      if (status >= 200 && status < 300) {
        // O MediaWiki devolve 200 com `error.code = maxlag` quando os servidores estão atrasados: espera e tenta de novo.
        if (/"code"\s*:\s*"maxlag"/.test(text.slice(0, 400))) {
          await sleep(Math.max(retryAfter, this.options.retryBaseMs ?? 5000))
          continue
        }
        const json = JSON.parse(text) as T
        writeFileSync(file, text)
        this.stats.network++
        return json
      }
      if (status === 429 || status === 503 || status === 502 || status === 504 || status === -1) {
        const delay = Math.max(retryAfter, wait)
        this.options.log?.(`  ${status === -1 ? 'falha de rede' : `HTTP ${status}`}; nova tentativa ${attempt}/6 em ${Math.round(delay / 1000)} s`)
        await sleep(delay)
        wait = Math.min(wait * 2, 120_000)
        continue
      }
      throw new Error(`HTTP ${status} em ${url}: ${text.slice(0, 300)}`)
    }
    throw new Error(`Sem resposta depois de 6 tentativas: ${url}`)
  }
}
