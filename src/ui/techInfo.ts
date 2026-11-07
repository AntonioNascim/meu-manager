/**
 * Informações técnicas do "Relatar problema". Só o que ajuda a investigar e **não identifica a pessoa**: navegador e sistema em grandes famílias (não o texto
 * inteiro do navegador), tamanho de tela, idioma, versão do jogo, tela e fase em que estava e as últimas mensagens de erro (cortadas, sem endereços).
 * A tela mostra tudo isto antes do envio e a pessoa pode desmarcar.
 */
declare const __APP_BUILD__: string | undefined

type Tech = Record<string, string | number | boolean>

const errors: string[] = []
const MAX_ERRORS = 8

/** Guarda as últimas mensagens de erro do navegador (só em memória, só para o relato). */
export function installErrorLog(): void {
  if (typeof window === 'undefined') return
  const keep = (text: string) => {
    // Sem endereços (podem ter códigos de convite) e curto.
    const t = text.replace(/https?:\/\/\S+/g, '<url>').replace(/convite=\S+/g, 'convite=<x>').slice(0, 160)
    errors.push(t)
    if (errors.length > MAX_ERRORS) errors.shift()
  }
  window.addEventListener('error', (e) => keep(String(e.message || 'erro')))
  window.addEventListener('unhandledrejection', (e) => keep(String((e.reason as Error | undefined)?.message ?? e.reason ?? 'promessa recusada')))
}

export const recentErrors = (): string[] => [...errors]

export function browserFamily(ua: string): { browser: string; os: string; device: string } {
  const pick = (pairs: [RegExp, string][], fallback: string): string => {
    for (const [re, name] of pairs) {
      const m = re.exec(ua)
      if (m) return m[1] ? `${name} ${m[1]}` : name
    }
    return fallback
  }
  const browser = pick(
    [
      [/Edg\/(\d+)/, 'Edge'],
      [/OPR\/(\d+)/, 'Opera'],
      [/SamsungBrowser\/(\d+)/, 'Samsung Internet'],
      [/Firefox\/(\d+)/, 'Firefox'],
      [/(?:Chrome|CriOS)\/(\d+)/, 'Chrome'],
      [/Version\/(\d+).*Safari/, 'Safari'],
    ],
    'outro',
  )
  const os = pick([[/Android (\d+)/, 'Android'], [/iPhone OS (\d+)|iPad.*OS (\d+)/, 'iOS'], [/Windows NT/, 'Windows'], [/Mac OS X/, 'macOS'], [/CrOS/, 'ChromeOS'], [/Linux/, 'Linux']], 'outro')
  const device = /iPad|Tablet/i.test(ua) ? 'tablet' : /Mobi|Android|iPhone/i.test(ua) ? 'celular' : 'computador'
  return { browser, os, device }
}

export interface TechContext {
  /** Onde a pessoa estava (menu, clube, elenco, partida, sala da liga...). */
  screen: string
  mode?: 'solo' | 'online'
  worldSource?: string
  season?: string
  phase?: string
  league?: string
  /** Só entra se a pessoa marcar a caixa. */
  leagueId?: string
  saveSlots?: number
  cloud?: boolean
}

/** Monta o que vai junto com o relato (sem nada que identifique a pessoa). */
export function collectTech(ctx: TechContext, options: { includeLeagueId?: boolean } = {}): Tech {
  const nav = typeof navigator === 'undefined' ? undefined : (navigator as Navigator & { deviceMemory?: number; connection?: { effectiveType?: string } })
  const fam = browserFamily(nav?.userAgent ?? '')
  const out: Tech = {
    app: 'meu-manager',
    build: typeof __APP_BUILD__ === 'string' ? __APP_BUILD__ : 'dev',
    screen: ctx.screen,
    browser: fam.browser,
    os: fam.os,
    device: fam.device,
  }
  if (typeof window !== 'undefined') {
    out.viewport = `${window.innerWidth}x${window.innerHeight}`
    out.pixelRatio = Math.round((window.devicePixelRatio || 1) * 10) / 10
    out.installed = window.matchMedia?.('(display-mode: standalone)').matches ?? false
  }
  if (nav) {
    out.language = nav.language
    out.online = nav.onLine
    if (nav.connection?.effectiveType) out.connection = nav.connection.effectiveType
    if (nav.deviceMemory) out.memoryMB = nav.deviceMemory * 1024
  }
  out.timezoneOffset = new Date().getTimezoneOffset()
  if (ctx.mode) out.mode = ctx.mode
  if (ctx.worldSource) out.worldSource = ctx.worldSource
  if (ctx.season) out.season = ctx.season
  if (ctx.phase) out.phase = ctx.phase
  if (ctx.league) out.league = ctx.league
  if (options.includeLeagueId && ctx.leagueId) out.leagueId = ctx.leagueId
  if (ctx.saveSlots !== undefined) out.saveSlots = ctx.saveSlots
  if (ctx.cloud !== undefined) out.cloud = ctx.cloud
  const errs = recentErrors()
  if (errs.length > 0) out.errors = errs.join(' | ').slice(0, 200)
  return out
}

/** Reduz uma imagem da tela para um JPEG pequeno (até ~900 px e ~150 KB) no próprio aparelho antes de enviar. */
export async function shrinkImage(file: File, maxSide = 900, maxBytes = 150_000): Promise<string> {
  const bmp = await createImageBitmap(file)
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(bmp.width * scale))
  canvas.height = Math.max(1, Math.round(bmp.height * scale))
  canvas.getContext('2d')?.drawImage(bmp, 0, 0, canvas.width, canvas.height)
  let q = 0.75
  let url = canvas.toDataURL('image/jpeg', q)
  while (url.length * 0.75 > maxBytes && q > 0.3) {
    q -= 0.1
    url = canvas.toDataURL('image/jpeg', q)
  }
  return url
}
