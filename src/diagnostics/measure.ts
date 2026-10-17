/**
 * Medição de desempenho no próprio aparelho (tela `?diagnostico=1`): gera o mundo de teste, joga a temporada pelo
 * mesmo caminho do jogo e devolve tempos e memória num texto fácil de copiar. Não toca no jogo salvo.
 * Sem React nem DOM aqui (o que depende do navegador entra por `readDevice`), para poder ser testado.
 */
import { loadWorld } from '../data/package/defaultPackage'
import { validatePackage } from '../data/package/validate'
import { advanceToMatchday, createGame, nextEventOf, playPendingAuto } from '../store/game'
import type { Game } from '../store/game'
import { makeEnvelope } from '../store/saveFormat'
import { canCompress } from '../store/compress'
import { SaveStore } from '../store/saves'
import type { SaveStats } from '../store/saves'
import { BRAZIL_ONLY, FULL_WORLD, buildScaleGame } from './scaleWorld'
import type { LeagueSpec } from './scaleWorld'

/** Metas no aparelho de referência: um Android de entrada (2 a 3 GB de memória, processador de entrada). */
export const REFERENCE_TARGETS = {
  device: 'Android de entrada',
  seasonSeconds: 120,
  typicalAdvanceMs: 1500,
  worstAdvanceSeconds: 20,
  peakMemoryMb: 150,
  saveGzipMb: 3,
  /** Gravar o jogo depois de um avanço (dividir, comprimir e escrever no IndexedDB); roda em segundo plano, mas num aparelho simples compete com a tela. */
  saveTypicalMs: 1000,
  saveWorstMs: 4000,
} as const

export type WorldChoice = 'full' | 'brazil'
export const WORLD_SPECS: Record<WorldChoice, LeagueSpec[]> = { full: FULL_WORLD, brazil: BRAZIL_ONLY }

export interface DeviceInfo {
  /** Modelo informado pelo navegador (Chrome no Android informa; Safari e Firefox não). */
  model: string
  platform: string
  browser: string
  userAgent: string
  cores: number | null
  /** Memória do aparelho em GB, arredondada pelo navegador (só Chrome/Edge/Opera). */
  memoryGb: number | null
  screen: string
  gpu: string
  /** Índice de velocidade do processador (maior = mais rápido); compara aparelhos com este notebook. */
  speedIndex: number | null
}

interface NavigatorLike {
  userAgent?: string
  platform?: string
  hardwareConcurrency?: number
  deviceMemory?: number
  userAgentData?: {
    platform?: string
    brands?: { brand: string; version: string }[]
    getHighEntropyValues?: (hints: string[]) => Promise<{ model?: string; platformVersion?: string; fullVersionList?: { brand: string; version: string }[] }>
  }
}

/** Nome e versão do navegador a partir do texto que ele informa. */
export function browserFromUserAgent(ua: string): string {
  const pick = (re: RegExp, name: string) => {
    const m = re.exec(ua)
    return m ? `${name} ${m[1]}` : null
  }
  return (
    pick(/SamsungBrowser\/([\d.]+)/, 'Samsung Internet') ??
    pick(/(?:EdgA?|Edg)\/([\d.]+)/, 'Edge') ??
    pick(/OPR\/([\d.]+)/, 'Opera') ??
    pick(/(?:FxiOS|Firefox)\/([\d.]+)/, 'Firefox') ??
    pick(/(?:CriOS|Chrome)\/([\d.]+)/, 'Chrome') ??
    pick(/Version\/([\d.]+).*Safari/, 'Safari') ??
    'navegador desconhecido'
  )
}

/** Modelo que aparece no texto do navegador (Android: "...; SM-A135M Build/..."), quando a API moderna não informa. */
export function modelFromUserAgent(ua: string): string | null {
  const android = /Android[^;)]*;\s*([^;)]+?)(?:\s+Build|\))/.exec(ua)
  if (android && android[1] && android[1] !== 'K') return android[1].trim()
  if (/iPhone/.test(ua)) return 'iPhone'
  if (/iPad/.test(ua)) return 'iPad'
  return null
}

/** Trabalho fixo de ~100 ms de contas parecidas com as do jogo, para comparar a velocidade de aparelhos diferentes. */
export function speedIndex(): number {
  const start = performance.now()
  let acc = 0
  let rounds = 0
  while (performance.now() - start < 120) {
    for (let i = 1; i <= 20_000; i++) acc += Math.sqrt(i) * Math.exp(-((i % 97) / 97)) + (i ^ (i >> 3))
    rounds++
  }
  // Evita que o motor elimine a conta; o índice é o trabalho feito por milissegundo.
  return Math.round((rounds * 20_000) / (performance.now() - start) + (acc > Infinity ? 1 : 0))
}

function gpuName(): string {
  try {
    const canvas = document.createElement('canvas')
    const gl = (canvas.getContext('webgl') ?? canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null
    const ext = gl?.getExtension('WEBGL_debug_renderer_info')
    return gl && ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : 'indisponível'
  } catch {
    return 'indisponível'
  }
}

/** Lê o aparelho e o navegador. Cada campo que o navegador não informa fica marcado como indisponível. */
export async function readDevice(nav: NavigatorLike = navigator as NavigatorLike): Promise<DeviceInfo> {
  const ua = nav.userAgent ?? ''
  let model: string | null = null
  let platform = nav.userAgentData?.platform ?? nav.platform ?? 'indisponível'
  try {
    const high = await nav.userAgentData?.getHighEntropyValues?.(['model', 'platformVersion'])
    if (high?.model) model = high.model
    if (high?.platformVersion && platform !== 'indisponível') platform = `${platform} ${high.platformVersion}`
  } catch {
    // o navegador recusou: segue com o texto do navegador
  }
  model ??= modelFromUserAgent(ua)
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio : 1
  return {
    model: model ?? 'não informado pelo navegador',
    platform,
    browser: browserFromUserAgent(ua),
    userAgent: ua,
    cores: nav.hardwareConcurrency ?? null,
    memoryGb: nav.deviceMemory ?? null,
    screen: typeof screen !== 'undefined' ? `${screen.width}x${screen.height} @${dpr}x` : 'indisponível',
    gpu: typeof document !== 'undefined' ? gpuName() : 'indisponível',
    speedIndex: typeof performance !== 'undefined' ? speedIndex() : null,
  }
}

/** Custo de gravar o jogo depois de cada avanço (o mesmo caminho do salvamento automático, num banco só do diagnóstico). */
export interface SaveMeasurement {
  /** Bytes gravados (comprimidos) com a temporada recém-criada e no fim da medida. */
  startKb: number
  endKb: number
  /** Pedaços do save. */
  parts: number
  /** O primeiro save (grava tudo), a mediana, o p95 e o pior dos seguintes, em ms. */
  firstMs: number
  medianMs: number
  p95Ms: number
  worstMs: number
  /** Mediana, por avanço, dos pedaços regravados e dos KB escritos. */
  writtenPartsMedian: number
  writtenKbMedian: number
  /** Tempo da mediana repartido em preparar, comprimir e escrever (ms). */
  planMs: number
  packMs: number
  writeMs: number
  /** O navegador comprime o save (CompressionStream)? */
  compressed: boolean
}

export interface Measurement {
  world: WorldChoice
  clubs: number
  players: number
  matches: number
  genMs: number
  seasonTableMs: number
  advances: number
  /** Soma do tempo de todos os avanços (sem as pausas para a tela respirar). */
  computeSeconds: number
  wallSeconds: number
  medianMs: number
  p95Ms: number
  worstMs: number
  worstDate: string
  firstMs: number
  matchesPerAdvanceMedian: number
  /** Memória do JavaScript (só quando o navegador deixa, como o Chrome). */
  peakMemoryMb: number | null
  endMemoryMb: number | null
  saveJsonKb: number
  saveStringifyMs: number
  saveCloneMs: number | null
  finished: boolean
  /** Custo do salvamento; `null` quando o navegador não tem IndexedDB. */
  save: SaveMeasurement | null
}

export interface MeasureOptions {
  world: WorldChoice
  /** Número máximo de avanços (padrão: a temporada inteira). */
  maxAdvances?: number
  seed?: number
  /** Dá a vez à tela (para mostrar o progresso); nos testes não faz nada. */
  yieldToUi?: () => Promise<void>
  onProgress?: (done: number, date: string) => void
  /** Leitura da memória usada pelo JavaScript, em bytes (Chrome: `performance.memory`). */
  readMemory?: () => number | null
  /** Onde medir o salvamento (padrão: um banco só do diagnóstico, apagado no fim; sem IndexedDB, não mede). `null` = não medir. */
  saveStore?: SaveStore | null
}

const pct = (xs: number[], p: number) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * p))] ?? 0
const mb = (bytes: number) => Math.round((bytes / 1024 / 1024) * 10) / 10

export function chromeMemory(): number | null {
  const m = (performance as unknown as { memory?: { usedJSHeapSize?: number } }).memory
  return m?.usedJSHeapSize ?? null
}

export async function measureWorld(options: MeasureOptions): Promise<Measurement> {
  const specs = WORLD_SPECS[options.world]
  const readMemory = options.readMemory ?? chromeMemory
  const yieldToUi = options.yieldToUi ?? (() => Promise.resolve())
  const wall = performance.now()
  const built = buildScaleGame(specs, options.seed ?? 7)
  let game: Game = built.game
  await yieldToUi()
  const s = game.season
  const clicks: number[] = []
  const dates: string[] = []
  const perAdvanceMatches: number[] = []
  let peak: number | null = null
  const limit = options.maxAdvances ?? 600
  const store = options.saveStore === undefined ? (typeof indexedDB !== 'undefined' ? new SaveStore('meu-manager-diagnostico') : null) : options.saveStore
  const saves: SaveStats[] = []
  let saveFirst: SaveStats | null = null
  try {
    saveFirst = store ? (await store.saveDetailed(1, game)).stats : null
  } catch {
    saveFirst = null
  }
  const saveOk = store !== null && saveFirst !== null
  for (let i = 0; i < limit && nextEventOf(game).type !== 'season-end'; i++) {
    const t = performance.now()
    game = playPendingAuto(advanceToMatchday(game))
    clicks.push(performance.now() - t)
    dates.push(game.season.season.currentDate)
    perAdvanceMatches.push(game.lastDay.length)
    const used = readMemory()
    if (used !== null) peak = Math.max(peak ?? 0, used)
    if (saveOk) {
      try {
        saves.push((await store.saveDetailed(1, game)).stats)
      } catch {
        // sem espaço no aparelho: o resto da medida segue sem o salvamento
      }
    }
    options.onProgress?.(i + 1, game.season.season.currentDate)
    if (game.dismissal) break
    await yieldToUi()
  }
  const finished = nextEventOf(game).type === 'season-end'
  const worstIndex = clicks.indexOf(Math.max(...clicks))
  const t0 = performance.now()
  const json = JSON.stringify(makeEnvelope(game, 'x'))
  const saveStringifyMs = performance.now() - t0
  let saveCloneMs: number | null = null
  try {
    const t1 = performance.now()
    structuredClone(JSON.parse(json))
    saveCloneMs = performance.now() - t1
  } catch {
    saveCloneMs = null
  }
  const end = readMemory()
  const lastSave = saves[saves.length - 1]
  const save: SaveMeasurement | null =
    saveOk && saveFirst && lastSave
      ? {
          startKb: Math.round(saveFirst.totalBytes / 1024),
          endKb: Math.round(lastSave.totalBytes / 1024),
          parts: lastSave.parts,
          firstMs: saveFirst.ms,
          medianMs: pct(saves.map((s) => s.ms), 0.5),
          p95Ms: pct(saves.map((s) => s.ms), 0.95),
          worstMs: Math.max(...saves.map((s) => s.ms)),
          writtenPartsMedian: pct(saves.map((s) => s.written), 0.5),
          writtenKbMedian: Math.round(pct(saves.map((s) => s.writtenBytes), 0.5) / 1024),
          planMs: pct(saves.map((s) => s.planMs), 0.5),
          packMs: pct(saves.map((s) => s.packMs), 0.5),
          writeMs: pct(saves.map((s) => s.writeMs), 0.5),
          compressed: canCompress(),
        }
      : null
  if (store && options.saveStore === undefined) await store.destroy().catch(() => undefined)
  return {
    world: options.world,
    clubs: s.teams.length,
    players: s.players.length,
    matches: s.matches.length,
    genMs: built.genMs,
    seasonTableMs: built.seasonMs,
    advances: clicks.length,
    computeSeconds: clicks.reduce((a, b) => a + b, 0) / 1000,
    wallSeconds: (performance.now() - wall) / 1000,
    medianMs: pct(clicks, 0.5),
    p95Ms: pct(clicks, 0.95),
    worstMs: clicks[worstIndex] ?? 0,
    worstDate: dates[worstIndex] ?? '',
    firstMs: clicks[0] ?? 0,
    matchesPerAdvanceMedian: pct(perAdvanceMatches, 0.5),
    peakMemoryMb: peak === null ? null : mb(peak),
    endMemoryMb: end === null ? null : mb(end),
    saveJsonKb: Math.round(json.length / 1024),
    saveStringifyMs,
    saveCloneMs,
    finished,
    save,
  }
}

const f0 = (n: number) => n.toFixed(0)
const f1 = (n: number) => n.toFixed(1)

function saveLines(s: SaveMeasurement): string[] {
  const T = REFERENCE_TARGETS
  const ok = (good: boolean) => (good ? 'ok' : 'ACIMA DA META')
  return [
    `Save gravado (${s.compressed ? 'comprimido' : 'SEM compressao: o navegador nao tem CompressionStream'}): inicio ${s.startKb} KB, fim ${s.endKb} KB em ${s.parts} pedacos - meta ${T.saveGzipMb} MB: ${ok(s.endKb <= T.saveGzipMb * 1024 && s.startKb <= T.saveGzipMb * 1024)}`,
    `Tempo de salvar a cada avanco: mediana ${f0(s.medianMs)} ms - meta ${T.saveTypicalMs} ms: ${ok(s.medianMs <= T.saveTypicalMs)} | p95 ${f0(s.p95Ms)} ms | pior ${f0(s.worstMs)} ms - meta ${T.saveWorstMs} ms: ${ok(s.worstMs <= T.saveWorstMs)} | primeiro save (grava tudo) ${f0(s.firstMs)} ms`,
    `Cada save grava (mediana): ${s.writtenPartsMedian} de ${s.parts} pedacos, ${s.writtenKbMedian} KB | preparar ${f0(s.planMs)} ms, comprimir ${f0(s.packMs)} ms, escrever ${f0(s.writeMs)} ms`,
  ]
}

/** Texto para copiar e colar: aparelho, navegador, números e se cada meta foi atingida. */
export function formatReport(device: DeviceInfo, m: Measurement, userNote = '', now: Date = new Date()): string {
  const T = REFERENCE_TARGETS
  const ok = (good: boolean) => (good ? 'ok' : 'ACIMA DA META')
  const lines = [
    `Meu Manager - diagnostico de desempenho (${now.toISOString().slice(0, 16).replace('T', ' ')} UTC)`,
    `Aparelho: ${userNote.trim() || device.model}${userNote.trim() ? ` (navegador informa: ${device.model})` : ''}`,
    `Sistema: ${device.platform}`,
    `Navegador: ${device.browser}`,
    `Nucleos: ${device.cores ?? 'indisponivel'} | Memoria do aparelho: ${device.memoryGb !== null ? `${device.memoryGb} GB (arredondado pelo navegador)` : 'indisponivel'}`,
    `Tela: ${device.screen} | GPU: ${device.gpu}`,
    `Indice de velocidade do processador: ${device.speedIndex ?? 'indisponivel'} (maior = mais rapido)`,
    `Texto do navegador: ${device.userAgent}`,
    '',
    `Mundo: ${m.world === 'full' ? 'completo (15 ligas)' : 'Brasil A+B+C'} - ${m.clubs} clubes, ${m.players} jogadores, ${m.matches} partidas`,
    `Gerar o mundo: ${f0(m.genMs)} ms | Montar a tabela: ${f0(m.seasonTableMs)} ms`,
    m.finished ? `Temporada inteira: ${f1(m.computeSeconds)} s de calculo (${f1(m.wallSeconds)} s no relogio, ${m.advances} avancos) - meta ${T.seasonSeconds} s: ${ok(m.computeSeconds <= T.seasonSeconds)}` : `Medida parcial: ${m.advances} avancos em ${f1(m.computeSeconds)} s (a temporada nao foi ate o fim)`,
    `Primeiro avanco: ${f1(m.firstMs / 1000)} s`,
    `Avanco tipico (mediana): ${f0(m.medianMs)} ms (${m.matchesPerAdvanceMedian} partidas) - meta ${T.typicalAdvanceMs} ms: ${ok(m.medianMs <= T.typicalAdvanceMs)}`,
    `Avanco lento (p95): ${f0(m.p95Ms)} ms`,
    `Pior avanco: ${f1(m.worstMs / 1000)} s em ${m.worstDate} - meta ${T.worstAdvanceSeconds} s: ${ok(m.worstMs / 1000 <= T.worstAdvanceSeconds)}`,
    m.peakMemoryMb !== null ? `Memoria do jogo (pico): ${m.peakMemoryMb} MB - meta ${T.peakMemoryMb} MB: ${ok(m.peakMemoryMb <= T.peakMemoryMb)} | no fim: ${m.endMemoryMb} MB` : 'Memoria do jogo: o navegador nao permite medir (so o Chrome e parecidos deixam)',
    `Save (JSON): ${m.saveJsonKb} KB | gerar o JSON: ${f0(m.saveStringifyMs)} ms | copia para o IndexedDB: ${m.saveCloneMs === null ? 'indisponivel' : `${f0(m.saveCloneMs)} ms`}`,
    ...(m.save ? saveLines(m.save) : ['Salvamento: este navegador nao tem IndexedDB, nao foi possivel medir.']),
    '',
    `Referencia: ${T.device}. Metas: temporada ate ${T.seasonSeconds} s, avanco tipico ate ${T.typicalAdvanceMs} ms, pior avanco ate ${T.worstAdvanceSeconds} s, memoria ate ${T.peakMemoryMb} MB.`,
  ]
  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// Importar um pacote de dados e começar um jogo (B7)
// ---------------------------------------------------------------------------

/** Metas no aparelho de referência para importar um pacote do tamanho do plano (15 ligas, 282 clubes) e começar o jogo. */
export const IMPORT_TARGETS = { importSeconds: 5, startSeconds: 8 } as const

export interface ImportMeasurement {
  label: string
  sizeMb: number
  clubs: number
  players: number
  leagues: number
  countries: number
  /** Ler o arquivo do aparelho (só quando veio de um arquivo). */
  readMs: number | null
  /** `JSON.parse` e validação do pacote. */
  parseMs: number
  validateMs: number
  /** Copiar o pacote para o IndexedDB (cópia estruturada, que é o grosso do custo de guardá-lo). */
  cloneMs: number | null
  /** Montar o mundo: atributos dos jogadores, táticas, finanças e base. */
  worldMs: number
  /** Montar a temporada (calendário de todas as ligas) e o jogo. */
  gameMs: number
  /** Primeiro avanço do jogo novo. */
  firstAdvanceMs: number
  /** Primeiro save do jogo novo (grava tudo); `null` sem IndexedDB. */
  firstSaveMs: number | null
  /** Importar (ler + validar + guardar + montar o mundo) e começar (criar o jogo + primeiro avanço). */
  importMs: number
  startMs: number
  errors: number
  warnings: number
}

/**
 * Mede o caminho do jogador: ler o arquivo, validar, guardar no navegador, montar o mundo e criar o jogo com o primeiro clube
 * (e dar o primeiro avanço). Não toca nos saves nem nos pacotes guardados (o save de teste vai para o banco do diagnóstico).
 */
export async function measureImport(text: string, options: { label: string; readMs?: number; saveStore?: SaveStore | null } = { label: 'pacote' }): Promise<ImportMeasurement> {
  const sizeMb = Math.round((text.length / 1024 / 1024) * 100) / 100
  const t0 = performance.now()
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    data = null
  }
  const parseMs = performance.now() - t0
  const t1 = performance.now()
  const { pkg, report } = validatePackage(data)
  const validateMs = performance.now() - t1
  const empty: ImportMeasurement = { label: options.label, sizeMb, clubs: 0, players: 0, leagues: 0, countries: 0, readMs: options.readMs ?? null, parseMs, validateMs, cloneMs: null, worldMs: 0, gameMs: 0, firstAdvanceMs: 0, firstSaveMs: null, importMs: parseMs + validateMs, startMs: 0, errors: report.errors.length, warnings: report.warnings.length }
  if (!pkg) return empty

  let cloneMs: number | null = null
  try {
    const t = performance.now()
    structuredClone(pkg)
    cloneMs = performance.now() - t
  } catch {
    cloneMs = null
  }
  const t2 = performance.now()
  const world = loadWorld(1, pkg)
  const worldMs = performance.now() - t2
  const firstClub = world.competitions?.[0]?.teams[0] ?? world.teams[0]
  const t3 = performance.now()
  let game = createGame(1, (firstClub as { id: string }).id, { world, dataPackage: pkg })
  const gameMs = performance.now() - t3
  const t4 = performance.now()
  game = playPendingAuto(advanceToMatchday(game))
  const firstAdvanceMs = performance.now() - t4
  let firstSaveMs: number | null = null
  const store = options.saveStore === undefined ? (typeof indexedDB !== 'undefined' ? new SaveStore('meu-manager-diagnostico') : null) : options.saveStore
  if (store) {
    try {
      firstSaveMs = (await store.saveDetailed(1, game)).stats.ms
    } catch {
      firstSaveMs = null
    }
    if (options.saveStore === undefined) await store.destroy().catch(() => undefined)
  }
  const importMs = (options.readMs ?? 0) + parseMs + validateMs + (cloneMs ?? 0) + worldMs
  return { ...empty, clubs: pkg.clubs.length, players: pkg.players.length, leagues: pkg.leagues.length, countries: pkg.countries.length, cloneMs, worldMs, gameMs, firstAdvanceMs, firstSaveMs, importMs, startMs: gameMs + firstAdvanceMs }
}

/** Texto das medidas de importação, para juntar ao relatório do aparelho. */
export function formatImportReport(m: ImportMeasurement): string {
  const T = IMPORT_TARGETS
  const ok = (good: boolean) => (good ? 'ok' : 'ACIMA DA META')
  const f0 = (n: number) => n.toFixed(0)
  const lines = [
    `Pacote: ${m.label} - ${m.sizeMb} MB, ${m.countries} paises, ${m.leagues} ligas, ${m.clubs} clubes, ${m.players} jogadores`,
    m.errors > 0 ? `O pacote tem ${m.errors} erro(s) de validacao: nada foi montado.` : `Validacao: ${m.errors} erros, ${m.warnings} avisos`,
    `Ler o arquivo: ${m.readMs === null ? 'nao se aplica (pacote gerado na tela)' : `${f0(m.readMs)} ms`} | JSON.parse: ${f0(m.parseMs)} ms | validar: ${f0(m.validateMs)} ms | guardar no navegador (copia): ${m.cloneMs === null ? 'indisponivel' : `${f0(m.cloneMs)} ms`}`,
  ]
  if (m.errors === 0) {
    lines.push(
      `Montar o mundo (atributos, taticas, financas, base): ${f0(m.worldMs)} ms`,
      `Importar (tudo acima): ${(m.importMs / 1000).toFixed(1)} s - meta ${T.importSeconds} s: ${ok(m.importMs / 1000 <= T.importSeconds)}`,
      `Criar o jogo (calendario das ligas): ${f0(m.gameMs)} ms | primeiro avanco: ${f0(m.firstAdvanceMs)} ms | primeiro save: ${m.firstSaveMs === null ? 'indisponivel' : `${f0(m.firstSaveMs)} ms`}`,
      `Comecar o jogo (criar + primeiro avanco): ${(m.startMs / 1000).toFixed(1)} s - meta ${T.startSeconds} s: ${ok(m.startMs / 1000 <= T.startSeconds)}`,
    )
  }
  return lines.join('\n')
}
