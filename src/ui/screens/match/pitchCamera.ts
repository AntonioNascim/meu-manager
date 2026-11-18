/**
 * Câmera do campo 2D (só visual): em vez do campo inteiro, aproxima e acompanha a bola com movimento suave.
 * É uma transformação de escala e deslocamento do contêiner do campo; nada aqui toca nos jogadores, no motor
 * nem em qualquer resultado. Tudo em proporções do campo (0 a 1), puro e testável.
 */

export type CameraMode = 'follow' | 'full'

export const CAMERA = {
  /** Aproximação quando a câmera acompanha a bola (a janela mostra 1/zoom do campo). */
  zoom: 1.9,
  /** Quanto a câmera pode passar da linha do campo, para mostrar a arquibancada atrás do gol (proporção do campo). */
  overscan: 0.05,
  /** Zona morta: a bola anda dentro dela sem a câmera se mexer (evita balançar a cada passe curto). Proporção do campo. */
  deadZone: { x: 0.1, y: 0.13 },
  /** Constantes de tempo (ms) da suavização do deslocamento e da aproximação. */
  panMs: 260,
  zoomMs: 320,
  /** Os jogadores crescem só parte do zoom: o disco fica legível sem tomar o campo (escala = zoom^-discExp, aplicada no disco). */
  discExp: 0.5,
  /** Em 4x e 8x só o desfecho de cada minuto aparece: a câmera volta ao campo inteiro. */
  fastSpeed: 4,
  /** Janela da câmera em telas estreitas (largura ÷ altura): mais alta que o campo (105 × 68), para o campo ocupar mais do celular. */
  tallAspect: 1.15,
  /** Abaixo desta largura (px) a janela fica alta quando a câmera segue a bola. */
  narrowPx: 720,
} as const

/** Proporção do campo (largura ÷ altura). */
export const FIELD_ASPECT = 105 / 68

/** Quanto a janela é mais alta que o campo (altura da janela ÷ altura do campo, na mesma largura). */
export const viewRatio = (tall: boolean): number => (tall ? FIELD_ASPECT / CAMERA.tallAspect : 1)

/** Quando a câmera deixa de acompanhar sozinha: quadro lento (p95) por janelas seguidas de 1 s. */
export const LOW_FPS = { p95Ms: 24, windows: 3, minFrames: 20 } as const

export interface CameraState {
  /** Centro da janela, em proporção do campo. */
  cx: number
  cy: number
  zoom: number
}

export const initialCamera = (): CameraState => ({ cx: 0.5, cy: 0.5, zoom: 1 })

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** Aproximação desejada: acompanha a bola só no modo "seguir" e em velocidade em que os lances aparecem. */
export function targetZoom(mode: CameraMode, speed: number): number {
  return mode === 'follow' && speed < CAMERA.fastSpeed ? CAMERA.zoom : 1
}

/**
 * Centro permitido: a janela visível não passa da linha do campo mais que o `overscan`. Sem aproximação, o centro é fixo.
 * `k` é quanto a janela é maior que o campo naquele eixo (1 = mesma proporção; a janela alta tem k > 1 na vertical).
 */
export function clampCenter(c: number, zoom: number, overscan: number = CAMERA.overscan, k = 1): number {
  const half = (0.5 * k) / zoom
  if (zoom <= 1.001 && k <= 1) return 0.5
  const lo = half - overscan
  const hi = 1 - half + overscan
  return lo >= hi ? 0.5 : clamp(c, lo, hi)
}

/** Aplica a zona morta: só o que passa do raio puxa a câmera. */
export function shrink(delta: number, dead: number): number {
  const a = Math.abs(delta) - dead
  return a <= 0 ? 0 : Math.sign(delta) * a
}

/** Um passo da câmera: o centro vai atrás da bola (com zona morta e suavização por tempo) e a aproximação vai ao alvo. */
export function stepCamera(cam: CameraState, ball: { x: number; y: number }, mode: CameraMode, speed: number, dtMs: number, overscan: number = CAMERA.overscan, ky = 1): CameraState {
  const dt = Math.max(0, Math.min(dtMs, 100))
  const zoom = cam.zoom + (targetZoom(mode, speed) - cam.zoom) * (1 - Math.exp(-dt / CAMERA.zoomMs))
  const pan = 1 - Math.exp(-dt / CAMERA.panMs)
  const tx = clampCenter(cam.cx + shrink(ball.x - cam.cx, CAMERA.deadZone.x), zoom, overscan)
  const ty = clampCenter(cam.cy + shrink(ball.y - cam.cy, CAMERA.deadZone.y), zoom, overscan, ky)
  return { cx: clampCenter(cam.cx + (tx - cam.cx) * pan, zoom, overscan), cy: clampCenter(cam.cy + (ty - cam.cy) * pan, zoom, overscan, ky), zoom }
}

/** Deslocamento em pixels (aplicado depois da escala, com origem no centro do campo): leva o centro da câmera ao meio da janela. */
export function cameraTransform(cam: CameraState, w: number, h: number): { x: number; y: number; scale: number } {
  return { x: -(cam.cx - 0.5) * w * cam.zoom, y: -(cam.cy - 0.5) * h * cam.zoom, scale: cam.zoom }
}

/** Escala do disco de jogador e da bola: cresce só `1 - discExp` do zoom. */
export const discScale = (zoom: number): number => Math.pow(Math.max(1, zoom), -CAMERA.discExp)

/** Ponto do campo (proporção) na tela da janela (proporção da janela), com a câmera atual. */
export function toScreen(p: { x: number; y: number }, cam: CameraState): { x: number; y: number } {
  return { x: 0.5 + (p.x - cam.cx) * cam.zoom, y: 0.5 + (p.y - cam.cy) * cam.zoom }
}

/**
 * Vigia de quadros lentos: a cada janela de 1 s calcula o p95 do tempo entre quadros; se passar do limite em
 * `LOW_FPS.windows` janelas seguidas, avisa uma vez. Janelas com poucos quadros (aba em segundo plano, pausa) não contam.
 */
export class FpsGuard {
  private deltas: number[] = []
  private since = -1
  private bad = 0
  private fired = false

  /** Devolve `true` no momento em que o aparelho foi dado como lento (e só nele). */
  push(now: number, dt: number): boolean {
    if (this.fired) return false
    if (this.since < 0) this.since = now
    this.deltas.push(dt)
    if (now - this.since < 1000) return false
    const sorted = [...this.deltas].sort((a, b) => a - b)
    const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0
    const enough = sorted.length >= LOW_FPS.minFrames
    this.deltas = []
    this.since = now
    if (!enough) {
      this.bad = 0
      return false
    }
    this.bad = p95 >= LOW_FPS.p95Ms ? this.bad + 1 : 0
    if (this.bad >= LOW_FPS.windows) {
      this.fired = true
      return true
    }
    return false
  }

  /** Recomeça a contagem (o jogador ligou a câmera de novo). */
  reset(): void {
    this.deltas = []
    this.since = -1
    this.bad = 0
    this.fired = false
  }
}
