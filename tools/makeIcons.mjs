// Gera os ícones do app (PNG) sem dependências: node tools/makeIcons.mjs
// Fundo azul-petróleo, disco verde e um "M" branco. O ícone "maskable" tem o desenho dentro da área segura.
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'

const BG = [15, 23, 42]
const DISC = [16, 185, 129]
const WHITE = [248, 250, 252]

function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax
  const dy = by - ay
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

// Traços do "M" em coordenadas de 0 a 1 (relativas ao disco, centrado em 0,0 e raio 1).
const STROKES = [
  [-0.46, 0.42, -0.46, -0.42],
  [-0.46, -0.42, 0, 0.12],
  [0, 0.12, 0.46, -0.42],
  [0.46, -0.42, 0.46, 0.42],
]

function pixel(x, y, size, scale) {
  // (x,y) em 0..1; o desenho ocupa `scale` do lado, centrado.
  const u = (x - 0.5) / (0.5 * scale)
  const v = (y - 0.5) / (0.5 * scale)
  let color = BG
  if (Math.hypot(u, v) <= 1) color = DISC
  for (const [ax, ay, bx, by] of STROKES) if (distToSegment(u, v, ax, ay, bx, by) <= 0.1) color = WHITE
  return color
}

function png(size, scale, rounded) {
  const raw = Buffer.alloc((size * 4 + 1) * size)
  const ss = 3
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0
    for (let x = 0; x < size; x++) {
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const fx = (x + (sx + 0.5) / ss) / size
          const fy = (y + (sy + 0.5) / ss) / size
          // Cantos arredondados só no ícone comum (o maskable é recortado pelo sistema).
          const inside = !rounded || (() => {
            const rad = 0.18
            const cx = Math.min(Math.max(fx, rad), 1 - rad)
            const cy = Math.min(Math.max(fy, rad), 1 - rad)
            return Math.hypot(fx - cx, fy - cy) <= rad
          })()
          if (!inside) continue
          const [pr, pg, pb] = pixel(fx, fy, size, scale)
          r += pr
          g += pg
          b += pb
          a += 1
        }
      }
      const o = y * (size * 4 + 1) + 1 + x * 4
      const n = ss * ss
      raw[o] = a ? Math.round(r / a) : 0
      raw[o + 1] = a ? Math.round(g / a) : 0
      raw[o + 2] = a ? Math.round(b / a) : 0
      raw[o + 3] = Math.round((255 * a) / n)
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type), data])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(body) >>> 0)
    return Buffer.concat([len, body, crc])
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
  header[8] = 8
  header[9] = 6
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))])
}

const table = new Int32Array(256).map((_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c
})
function crc32(buf) {
  let c = -1
  for (const byte of buf) c = table[(c ^ byte) & 0xff] ^ (c >>> 8)
  return c ^ -1
}

mkdirSync('public/icons', { recursive: true })
writeFileSync('public/icons/icon-192.png', png(192, 0.86, true))
writeFileSync('public/icons/icon-512.png', png(512, 0.86, true))
writeFileSync('public/icons/icon-maskable-512.png', png(512, 0.6, false))
writeFileSync('public/icons/apple-touch-icon.png', png(180, 0.7, false))
writeFileSync(
  'public/icons/icon.svg',
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="18" fill="rgb(${BG})"/><circle cx="50" cy="50" r="43" fill="rgb(${DISC})"/><path d="M27 71V29l23 28 23-28v42" fill="none" stroke="rgb(${WHITE})" stroke-width="8.6" stroke-linecap="round" stroke-linejoin="round"/></svg>\n`,
)
console.log('ícones gerados em public/icons')
