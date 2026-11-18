import { describe, expect, it } from 'vitest'
import type { CameraState } from '../src/ui/screens/match/pitchCamera'
import { CAMERA, FIELD_ASPECT, FpsGuard, LOW_FPS, cameraTransform, clampCenter, discScale, initialCamera, shrink, stepCamera, targetZoom, toScreen, viewRatio } from '../src/ui/screens/match/pitchCamera'

describe('câmera do campo', () => {
  it('só aproxima no modo seguir e em velocidade baixa', () => {
    expect(targetZoom('follow', 1)).toBe(CAMERA.zoom)
    expect(targetZoom('follow', 2)).toBe(CAMERA.zoom)
    expect(targetZoom('follow', 4)).toBe(1)
    expect(targetZoom('follow', 8)).toBe(1)
    expect(targetZoom('full', 1)).toBe(1)
  })

  it('o centro nunca deixa a janela passar da linha do campo mais que o overscan', () => {
    const z = CAMERA.zoom
    const half = 0.5 / z
    expect(clampCenter(0, z)).toBeCloseTo(half - CAMERA.overscan, 6)
    expect(clampCenter(1, z)).toBeCloseTo(1 - half + CAMERA.overscan, 6)
    expect(clampCenter(0, z, 0)).toBeCloseTo(half, 6)
    expect(clampCenter(0.3, z)).toBe(0.3)
    expect(clampCenter(0.9, 1)).toBe(0.5)
  })

  it('janela alta: o limite vertical considera a janela maior que o campo', () => {
    const k = viewRatio(true)
    expect(k).toBeCloseTo(FIELD_ASPECT / CAMERA.tallAspect, 9)
    expect(k).toBeGreaterThan(1)
    expect(viewRatio(false)).toBe(1)
    const halfY = (0.5 * k) / CAMERA.zoom
    expect(clampCenter(0, CAMERA.zoom, CAMERA.overscan, k)).toBeCloseTo(halfY - CAMERA.overscan, 9)
    // a janela alta vê mais do campo na vertical: o centro vertical anda numa faixa mais curta que na janela normal
    expect(clampCenter(0, CAMERA.zoom, CAMERA.overscan, k)).toBeGreaterThan(clampCenter(0, CAMERA.zoom, CAMERA.overscan, 1))
    // sem aproximação, a janela alta ainda é maior que o campo: o centro continua fixo no meio
    expect(clampCenter(0.1, 1, CAMERA.overscan, k)).toBe(0.5)
    expect(clampCenter(0.1, 1, 0, 1)).toBe(0.5)
  })

  it('a zona morta ignora movimentos pequenos da bola', () => {
    expect(shrink(0.05, 0.1)).toBe(0)
    expect(shrink(-0.1, 0.1)).toBe(0)
    expect(shrink(0.25, 0.1)).toBeCloseTo(0.15, 9)
    expect(shrink(-0.25, 0.1)).toBeCloseTo(-0.15, 9)
  })

  it('segue a bola sem pular: cada quadro anda menos que a distância e converge', () => {
    let cam: CameraState = { ...initialCamera(), zoom: CAMERA.zoom }
    const ball = { x: 0.85, y: 0.3 }
    let prev = cam.cx
    for (let i = 0; i < 200; i++) {
      cam = stepCamera(cam, ball, 'follow', 1, 16.7)
      expect(cam.cx).toBeGreaterThanOrEqual(prev - 1e-9)
      expect(cam.cx - prev).toBeLessThan(0.02)
      prev = cam.cx
    }
    expect(cam.cx).toBeGreaterThan(0.6)
    expect(cam.cx).toBeLessThanOrEqual(1 - 0.5 / CAMERA.zoom + CAMERA.overscan + 1e-9)
  })

  it('bola dentro da zona morta não move a câmera', () => {
    let cam: CameraState = { cx: 0.5, cy: 0.5, zoom: CAMERA.zoom }
    for (let i = 0; i < 60; i++) cam = stepCamera(cam, { x: 0.55, y: 0.45 }, 'follow', 1, 16.7)
    expect(cam.cx).toBeCloseTo(0.5, 6)
    expect(cam.cy).toBeCloseTo(0.5, 6)
  })

  it('em campo inteiro a câmera volta ao centro e ao zoom 1', () => {
    let cam: CameraState = { cx: 0.8, cy: 0.3, zoom: CAMERA.zoom }
    for (let i = 0; i < 300; i++) cam = stepCamera(cam, { x: 0.8, y: 0.3 }, 'full', 1, 16.7)
    expect(cam.zoom).toBeCloseTo(1, 2)
    expect(cam.cx).toBeCloseTo(0.5, 2)
    expect(cam.cy).toBeCloseTo(0.5, 2)
  })

  it('passos longos (aba em segundo plano) são limitados', () => {
    const cam = stepCamera({ cx: 0.5, cy: 0.5, zoom: CAMERA.zoom }, { x: 1, y: 1 }, 'follow', 1, 5000)
    expect(cam.cx).toBeLessThan(0.75)
  })

  it('o deslocamento leva o centro da câmera ao meio da janela', () => {
    const cam = { cx: 0.7, cy: 0.5, zoom: 2 }
    const t = cameraTransform(cam, 400, 260)
    // ponto do campo no centro da câmera: escalado e deslocado cai no centro da janela
    const px = (0.7 - 0.5) * 400 * t.scale + t.x
    expect(px).toBeCloseTo(0, 6)
    expect(toScreen({ x: 0.7, y: 0.5 }, cam)).toEqual({ x: 0.5, y: 0.5 })
    expect(toScreen({ x: 0.7 + 0.25, y: 0.5 }, cam).x).toBeCloseTo(1, 6)
  })

  it('o disco cresce só parte do zoom', () => {
    expect(discScale(1)).toBe(1)
    expect(discScale(CAMERA.zoom)).toBeLessThan(1)
    expect(discScale(CAMERA.zoom) * CAMERA.zoom).toBeGreaterThan(1)
    expect(discScale(CAMERA.zoom) * CAMERA.zoom).toBeLessThan(CAMERA.zoom)
  })
})

describe('vigia de quadros lentos', () => {
  const run = (dt: number, seconds: number, guard = new FpsGuard()) => {
    let now = 0
    let fired = -1
    const frames = Math.round((seconds * 1000) / dt)
    for (let i = 0; i < frames; i++) {
      now += dt
      if (guard.push(now, dt) && fired < 0) fired = now
    }
    return fired
  }
  it('60 fps não dispara', () => expect(run(16.7, 20)).toBe(-1))
  it('quadros de 40 ms disparam depois de 3 janelas', () => {
    const at = run(40, 10)
    expect(at).toBeGreaterThanOrEqual(LOW_FPS.windows * 1000)
    expect(at).toBeLessThan(5000)
  })
  it('dispara uma vez só e depois de reset volta a vigiar', () => {
    const g = new FpsGuard()
    expect(run(40, 10, g)).toBeGreaterThan(0)
    expect(run(40, 10, g)).toBe(-1)
    g.reset()
    expect(run(40, 10, g)).toBeGreaterThan(0)
  })
  it('janelas com poucos quadros (aba em segundo plano) não contam', () => expect(run(200, 20)).toBe(-1))
  it('um engasgo isolado não dispara', () => {
    const g = new FpsGuard()
    let now = 0
    let fired = false
    for (let i = 0; i < 600; i++) {
      const dt = i === 100 ? 300 : 16.7
      now += dt
      fired = g.push(now, dt) || fired
    }
    expect(fired).toBe(false)
  })
})
