import type { ReactNode } from 'react'

/**
 * Bonequinho 2D do Meu Manager: busto desenhado em SVG, sem imagem nenhuma. A aparência (pele, cabelo, barba,
 * acessório, expressão) é sorteada só pelo id, então o mesmo jogador tem o mesmo rosto em todas as telas, e
 * não depende da nacionalidade. A camisa leva as cores do clube; o técnico usa terno.
 */

const SKIN = ['#f7d9bf', '#efc29a', '#d9a273', '#bb8157', '#8f5d3d', '#62402b'] as const
const HAIR = ['#15110f', '#2a1c14', '#4a2f1e', '#7b4a24', '#b4803c', '#dcb96a', '#8a2f1e', '#a9aeb3'] as const
const GREY = ['#a9aeb3', '#c9cdd1', '#6f757b'] as const

type HairStyle = 'short' | 'buzz' | 'curly' | 'afro' | 'long' | 'bald' | 'slick' | 'mohawk' | 'bun' | 'wavy'
type Beard = 'none' | 'stubble' | 'full' | 'goatee' | 'mustache'
type Accessory = 'none' | 'glasses' | 'headband' | 'earring' | 'sweatband'
type Mouth = 'smile' | 'flat' | 'grin' | 'serious'

const HAIR_STYLES: HairStyle[] = ['short', 'buzz', 'curly', 'afro', 'long', 'bald', 'slick', 'mohawk', 'bun', 'wavy']
const BEARDS: Beard[] = ['none', 'none', 'none', 'stubble', 'full', 'goatee', 'mustache']
const ACCESSORIES: Accessory[] = ['none', 'none', 'none', 'none', 'glasses', 'headband', 'earring', 'sweatband']
const MOUTHS: Mouth[] = ['smile', 'flat', 'grin', 'serious']

export interface Look {
  skin: string
  hairColor: string
  hair: HairStyle
  beard: Beard
  accessory: Accessory
  mouth: Mouth
  eyeSpread: number
  browTilt: number
  headWidth: number
}

/** FNV-1a: transforma o id em um número estável. */
function hashOf(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** Gerador pequeno e estável (mulberry32), só para a aparência: nunca toca o gerador do motor. */
function rngOf(seed: number): () => number {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const pick = <T,>(list: readonly T[], r: () => number): T => list[Math.floor(r() * list.length)] as T

const cache = new Map<string, Look>()

/** Aparência de um id: sempre a mesma. `coach` puxa o cabelo para o grisalho e tira o acessório esportivo. */
export function lookOf(id: string, role: 'player' | 'coach' = 'player'): Look {
  const key = `${role}:${id}`
  const hit = cache.get(key)
  if (hit) return hit
  const r = rngOf(hashOf(`mm-avatar:${key}`))
  const skin = pick(SKIN, r)
  const hairColor = role === 'coach' && r() < 0.55 ? pick(GREY, r) : pick(HAIR, r)
  let accessory = pick(ACCESSORIES, r)
  if (role === 'coach' && (accessory === 'headband' || accessory === 'sweatband')) accessory = 'none'
  const look: Look = {
    skin,
    hairColor,
    hair: pick(HAIR_STYLES, r),
    beard: pick(BEARDS, r),
    accessory,
    mouth: pick(MOUTHS, r),
    eyeSpread: 10.4 + r() * 1.6,
    browTilt: (r() - 0.5) * 1.6,
    headWidth: 12 + r() * 1.4,
  }
  cache.set(key, look)
  return look
}

const shade = (hex: string, amount: number): string => {
  const n = parseInt(hex.slice(1), 16)
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(v + amount * (amount < 0 ? v : 255 - v))))
  const out = (ch(n >> 16) << 16) | (ch((n >> 8) & 255) << 8) | ch(n & 255)
  return `#${out.toString(16).padStart(6, '0')}`
}

/** Cabelo de trás (desenhado antes do rosto). */
function hairBack(look: Look): ReactNode {
  const c = look.hairColor
  if (look.hair === 'afro') return <circle cx="32" cy="22" r="18" fill={c} />
  if (look.hair === 'long') return <path d="M15 26c-1-12 6-18 17-18s18 6 17 18c0 9 1 16 3 22H12c2-6 3-13 3-22Z" fill={c} />
  if (look.hair === 'bun') return <circle cx="32" cy="8.5" r="5.5" fill={c} />
  if (look.hair === 'wavy') return <path d="M16 28c-2-13 6-19 16-19s18 6 16 19c.5 4-1 7-3 9l-1-9H20l-1 9c-2-2-3.500-5-3-9Z" fill={c} />
  return null
}

/** Cabelo da frente (franja e topo). */
function hairFront(look: Look): ReactNode {
  const c = look.hairColor
  switch (look.hair) {
    case 'bald':
      return <path d="M19.500 24c.5-1.500 1.500-2 2-.5-.3 2-.5 4-.5 6Zm25 0c-.5-1.500-1.500-2-2-.5.300 2 .5 4 .5 6Z" fill={c} opacity="0.7" />
    case 'buzz':
      return <path d="M19.600 26C18.500 15 25 10.500 32 10.500S45.500 15 44.400 26C43 20.500 39.500 18.500 32 18.500S21 20.500 19.600 26Z" fill={c} opacity="0.85" />
    case 'curly':
      return (
        <g fill={c}>
          {[21, 25.500, 30, 34.500, 39, 43].map((x, i) => (
            <circle key={x} cx={x} cy={i % 2 ? 14 : 15.500} r={4.600} />
          ))}
          <path d="M19.500 26C19 20 22 18 24 18.500c3 2 13 2 16 0 2-.5 5 1.500 4.500 7.500-1.500-4.500-5-6-12.500-6s-11 1.500-12.500 6Z" />
        </g>
      )
    case 'afro':
      return <path d="M19.500 26c.5-6 4-9.500 12.500-9.500S44 20 44.500 26c-1.500-3.500-5-5.500-12.500-5.500S21 22.500 19.500 26Z" fill={c} />
    case 'long':
    case 'wavy':
      return <path d="M19.500 27C18 13 25 9.500 32 9.500S46 13 44.500 27C43.500 21.500 40 19 32 19s-11.500 2.500-12.500 8Z" fill={c} />
    case 'slick':
      return <path d="M19.500 27C17 13 26 8.500 33 9.500c8 1 12.500 6 11.500 17.500-1.200-4-3-6-5.500-7-5 1.800-11 1-15 .500-2 1.500-3.500 4.500-4.500 6.500Z" fill={c} />
    case 'mohawk':
      return <path d="M28 18.500c0-5 1-9.500 4-10.500 3 1 4 5.500 4 10.500-2.500-1-5.500-1-8 0Z" fill={c} />
    case 'bun':
    case 'short':
    default:
      return <path d="M19.500 27C18 14 25 10 32 10s14 4 12.500 17c-.8-5.500-3-8.500-4.500-9.500-4 2-9 2-16 0-1.500 1-3.500 4-4.500 9.500Z" fill={c} />
  }
}

function beardOf(look: Look): ReactNode {
  const c = look.hairColor
  switch (look.beard) {
    case 'stubble':
      return <path d="M19.800 29c0 10.500 5 14 12.200 14s12.200-3.500 12.200-14c-2 5-5.500 7-12.200 7s-10.200-2-12.200-7Z" fill={c} opacity="0.28" />
    case 'full':
      return <path d="M19.600 28c0 11.500 5 16 12.400 16s12.400-4.500 12.400-16c-1.800 5.500-5.200 7-8.400 7.500-2 .8-5 .8-8 0-3.200-.5-6.600-2-8.400-7.500Z" fill={c} />
    case 'goatee':
      return <path d="M27.500 39.500c1.200 5.500 7.800 5.500 9 0-2 1.200-7 1.200-9 0Z" fill={c} />
    case 'mustache':
      return <path d="M26 35.600c2.200-1.800 4.500-.8 6-.2 1.500-.6 3.800-1.600 6 .2-2.200 1.800-4.500 1.200-6 .5-1.500.7-3.800 1.300-6-.5Z" fill={c} />
    default:
      return null
  }
}

function mouthOf(look: Look): ReactNode {
  const ink = shade(look.skin, -0.55)
  switch (look.mouth) {
    case 'smile':
      return <path d="M27.800 38c2.600 2.800 5.800 2.800 8.400 0" fill="none" stroke={ink} strokeWidth="1.500" strokeLinecap="round" />
    case 'grin':
      return <path d="M27.600 37.600c2.800 4 5.900 4 8.800 0-3 .8-5.800.8-8.800 0Z" fill="#fff" stroke={ink} strokeWidth="1.100" strokeLinejoin="round" />
    case 'serious':
      return <path d="M28.500 38.600h7" fill="none" stroke={ink} strokeWidth="1.500" strokeLinecap="round" />
    default:
      return <path d="M28.500 38.200q3.500 1 7 0" fill="none" stroke={ink} strokeWidth="1.500" strokeLinecap="round" />
  }
}

function accessoryOf(look: Look, second: string): ReactNode {
  switch (look.accessory) {
    case 'glasses':
      return (
        <g fill="none" stroke="#11181a" strokeWidth="1.300">
          <rect x="21.500" y="23.500" width="8.500" height="6.200" rx="2.600" />
          <rect x="34" y="23.500" width="8.500" height="6.200" rx="2.600" />
          <path d="M30 26.200h4" />
        </g>
      )
    case 'headband':
      return <path d="M19.300 21.500c3.500-2 8.500-3 12.700-3s9.200 1 12.700 3l-.4 3.300c-3.700-2-8.500-2.800-12.300-2.800s-8.600.8-12.300 2.800Z" fill={second} stroke="rgb(0 0 0 / 0.25)" strokeWidth=".6" />
    case 'sweatband':
      return <path d="M19.500 17.500c3-3 7.500-4.500 12.500-4.500s9.500 1.500 12.500 4.500l-.7 3.300c-3-2.500-7.200-3.800-11.800-3.800s-8.800 1.300-11.800 3.800Z" fill="#f4f4f0" stroke="rgb(0 0 0 / 0.2)" strokeWidth=".6" />
    case 'earring':
      return <circle cx="19.200" cy="33.500" r="1.400" fill="#f3c64d" />
    default:
      return null
  }
}

/** Busto do bonequinho. `colors` são as cores do clube (camisa e gola); sem elas a camisa fica cinza. */
export function Avatar({
  id,
  colors,
  role = 'player',
  size = 40,
  className = '',
  ring = false,
}: {
  id: string
  colors?: readonly [string, string]
  role?: 'player' | 'coach'
  size?: number
  className?: string
  /** Contorno claro (para fundos escuros e listas). */
  ring?: boolean
}) {
  const look = lookOf(id, role)
  const [main, second] = colors ?? ['#4b5563', '#e5e7eb']
  const skinShade = shade(look.skin, -0.18)
  const bg = shade(main, -0.55)
  const coach = role === 'coach'
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden="true"
      className={`shrink-0 rounded-full ${ring ? 'ring-1 ring-white/25' : ''} ${className}`}
      style={{ background: `radial-gradient(circle at 50% 30%, ${shade(main, -0.25)}, ${bg})` }}
    >
      {hairBack(look)}
      {/* ombros e camisa */}
      {coach ? (
        <g>
          <path d="M5 64c1-10 9-15 21-16h12c12 1 20 6 21 16Z" fill="#1b2326" />
          <path d="M25 48.500 32 59l7-10.500 4 1.500-6 14H27l-6-14Z" fill="#f2f4f4" />
          <path d="M30.800 51h2.400l.9 9-2.100 2.500-2.100-2.500Z" fill={main} />
        </g>
      ) : (
        <g>
          <path d="M5 64c1-10 9-15 21-16h12c12 1 20 6 21 16Z" fill={main} />
          <path d="M25 48.200c1.500 5 4 7.500 7 7.500s5.500-2.500 7-7.500l3.500 1.500c-2 6-5.500 9-10.500 9s-8.500-3-10.500-9Z" fill={second} />
          <path d="M5 64c.4-3.500 1.800-6.200 4-8.300 2.500 2 3.800 5 4 8.300Zm54 0c-.4-3.500-1.800-6.200-4-8.300-2.500 2-3.800 5-4 8.300Z" fill={second} opacity="0.5" />
        </g>
      )}
      {/* pescoço */}
      <path d="M27 38h10v11c-1.500 3-3.500 4.500-5 4.500s-3.500-1.500-5-4.500Z" fill={skinShade} />
      {/* orelhas e cabeça */}
      <ellipse cx={32 - look.headWidth - 0.4} cy="30.500" rx="2.200" ry="3.200" fill={skinShade} />
      <ellipse cx={32 + look.headWidth + 0.4} cy="30.500" rx="2.200" ry="3.200" fill={skinShade} />
      <ellipse cx="32" cy="28" rx={look.headWidth + 0.5} ry="14.800" fill={look.skin} />
      {hairFront(look)}
      {beardOf(look)}
      {/* olhos, sobrancelhas, nariz e boca */}
      <g fill="#14100e">
        <ellipse cx={32 - look.eyeSpread / 2} cy="27.500" rx="1.500" ry="1.700" />
        <ellipse cx={32 + look.eyeSpread / 2} cy="27.500" rx="1.500" ry="1.700" />
      </g>
      <g stroke={look.hairColor === '#dcb96a' || look.hairColor === '#b4803c' ? '#6a4a1c' : look.hairColor} strokeWidth="1.400" strokeLinecap="round" fill="none">
        <path d={`M${32 - look.eyeSpread / 2 - 2.600} ${24 + look.browTilt}l5 ${-0.6 - look.browTilt / 2}`} />
        <path d={`M${32 + look.eyeSpread / 2 + 2.600} ${24 + look.browTilt}l-5 ${-0.6 - look.browTilt / 2}`} />
      </g>
      <path d="M32 29.500v4.200q-1.500 1.200-3 .2M32 33.700q1.500 1.200 3 .2" fill="none" stroke={shade(look.skin, -0.3)} strokeWidth="1.100" strokeLinecap="round" />
      {mouthOf(look)}
      {accessoryOf(look, second)}
    </svg>
  )
}
