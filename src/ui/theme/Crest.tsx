import type { Team } from '../../engine/types'

const SIZES = { xs: 24, sm: 30, md: 42, lg: 64, xl: 84 } as const

/** Escudo gerado das duas cores do time e da sigla (nada de imagem: serve para qualquer time, até os importados). */
export function Crest({ team, size = 'md', className = '' }: { team: Pick<Team, 'abbreviation' | 'colors'>; size?: keyof typeof SIZES; className?: string }) {
  const px = SIZES[size]
  const [main, second] = team.colors
  return (
    <svg width={px} height={px * 1.1} viewBox="0 0 60 66" className={`shrink-0 ${className}`} role="img" aria-label={team.abbreviation}>
      <path d="M30 2 56 9v22c0 16-11 27-26 33C15 58 4 47 4 31V9L30 2Z" fill={main} stroke={second} strokeWidth="3" strokeLinejoin="round" />
      <path d="M30 2 56 9v22c0 16-11 27-26 33V2Z" fill={second} opacity="0.16" />
      <path d="M4 25h52" stroke={second} strokeWidth="2.5" opacity="0.55" />
      <text x="30" y="43" textAnchor="middle" fontFamily="Barlow Condensed, sans-serif" fontWeight="800" fontSize="21" fill={second}>
        {team.abbreviation}
      </text>
    </svg>
  )
}
