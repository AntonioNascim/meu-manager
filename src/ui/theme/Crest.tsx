import type { Team } from '../../engine/types'

const SIZES = { xs: 24, sm: 30, md: 42, lg: 64, xl: 84 } as const

function luminance(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return 0.5
  const n = parseInt(m[1] as string, 16)
  const channel = (v: number) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(n >> 16) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
}

function contrast(a: string, b: string): number {
  const x = luminance(a)
  const y = luminance(b)
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}

/** Cores do escudo: com as duas cores parecidas (muitos clubes reais têm só uma cor forte), a sigla e o contorno viram preto ou branco para continuar legíveis. */
export function crestColors(colors: readonly [string, string]): { main: string; second: string; ink: string } {
  const [main, second] = colors
  if (contrast(main, second) >= 2.2) return { main, second, ink: second }
  const ink = luminance(main) > 0.4 ? '#111827' : '#ffffff'
  return { main, second: ink, ink }
}

/** Escudo gerado das duas cores do time e da sigla (nada de imagem: serve para qualquer time, até os importados). */
export function Crest({ team, size = 'md', className = '' }: { team: Pick<Team, 'abbreviation' | 'colors'>; size?: keyof typeof SIZES; className?: string }) {
  const px = SIZES[size]
  const { main, second, ink } = crestColors(team.colors)
  return (
    <svg width={px} height={px * 1.1} viewBox="0 0 60 66" className={`shrink-0 ${className}`} role="img" aria-label={team.abbreviation}>
      <path d="M30 2 56 9v22c0 16-11 27-26 33C15 58 4 47 4 31V9L30 2Z" fill={main} stroke={second} strokeWidth="3" strokeLinejoin="round" />
      <path d="M30 2 56 9v22c0 16-11 27-26 33V2Z" fill={second} opacity="0.16" />
      <path d="M4 25h52" stroke={second} strokeWidth="2.5" opacity="0.55" />
      <text x="30" y="43" textAnchor="middle" fontFamily="Barlow Condensed, sans-serif" fontWeight="800" fontSize="21" fill={ink}>
        {team.abbreviation}
      </text>
    </svg>
  )
}
