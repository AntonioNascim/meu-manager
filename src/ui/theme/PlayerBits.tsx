import type { ReactNode } from 'react'
import type { Nationality, Team } from '../../engine/types'
import { bandFor, conditionBand, moodBand } from '../colors'
import type { Mood } from '../colors'
import { COUNTRY_INFO } from '../countries'
import { NATIONALITY_LABELS } from '../labels'
import { flagShapes } from './flags'

/** Bandeiras simples (30 x 20) das nacionalidades do jogo. O tipo obriga a desenhar a de cada nacionalidade nova. */
const FLAGS: Partial<Record<Nationality, ReactNode>> = {
  Brazil: (
    <>
      <rect width="30" height="20" fill="#2a9d3f" />
      <path d="M15 3 27 10 15 17 3 10Z" fill="#f4d90f" />
      <circle cx="15" cy="10" r="4.2" fill="#1e3f9e" />
    </>
  ),
  Argentina: (
    <>
      <rect width="30" height="20" fill="#75b6e8" />
      <rect y="6.7" width="30" height="6.6" fill="#fff" />
      <circle cx="15" cy="10" r="1.8" fill="#f2b705" />
    </>
  ),
  Uruguay: (
    <>
      <rect width="30" height="20" fill="#fff" />
      {[2.2, 6.6, 11, 15.4].map((y) => (
        <rect key={y} y={y} width="30" height="2.2" fill="#3b78c4" />
      ))}
      <rect width="11" height="11" fill="#fff" />
      <circle cx="5.5" cy="5.5" r="2.6" fill="#f2b705" />
    </>
  ),
  Paraguay: (
    <>
      <rect width="30" height="20" fill="#fff" />
      <rect width="30" height="6.7" fill="#d52b1e" />
      <rect y="13.3" width="30" height="6.7" fill="#1c4fa0" />
    </>
  ),
  Chile: (
    <>
      <rect width="30" height="20" fill="#d52b1e" />
      <rect width="30" height="10" fill="#fff" />
      <rect width="10" height="10" fill="#1c4fa0" />
      <circle cx="5" cy="5" r="1.6" fill="#fff" />
    </>
  ),
  Colombia: (
    <>
      <rect width="30" height="20" fill="#f4d90f" />
      <rect y="10" width="30" height="5" fill="#1c4fa0" />
      <rect y="15" width="30" height="5" fill="#d52b1e" />
    </>
  ),
  Peru: (
    <>
      <rect width="30" height="20" fill="#fff" />
      <rect width="10" height="20" fill="#d52b1e" />
      <rect x="20" width="10" height="20" fill="#d52b1e" />
    </>
  ),
  Ecuador: (
    <>
      <rect width="30" height="20" fill="#f4d90f" />
      <rect y="10" width="30" height="5" fill="#1c4fa0" />
      <rect y="15" width="30" height="5" fill="#d52b1e" />
      <circle cx="15" cy="9" r="2.2" fill="#8a5a2b" />
    </>
  ),
  England: (
    <>
      <rect width="30" height="20" fill="#fff" />
      <rect x="13" width="4" height="20" fill="#d52b1e" />
      <rect y="8" width="30" height="4" fill="#d52b1e" />
    </>
  ),
  Spain: (
    <>
      <rect width="30" height="20" fill="#d52b1e" />
      <rect y="5" width="30" height="10" fill="#f4d90f" />
    </>
  ),
  Italy: (
    <>
      <rect width="30" height="20" fill="#fff" />
      <rect width="10" height="20" fill="#2a9d3f" />
      <rect x="20" width="10" height="20" fill="#d52b1e" />
    </>
  ),
  Germany: (
    <>
      <rect width="30" height="20" fill="#f4d90f" />
      <rect width="30" height="6.7" fill="#111" />
      <rect y="6.7" width="30" height="6.6" fill="#d52b1e" />
    </>
  ),
  France: (
    <>
      <rect width="30" height="20" fill="#fff" />
      <rect width="10" height="20" fill="#1c4fa0" />
      <rect x="20" width="10" height="20" fill="#d52b1e" />
    </>
  ),
  Portugal: (
    <>
      <rect width="30" height="20" fill="#d52b1e" />
      <rect width="12" height="20" fill="#2a9d3f" />
      <circle cx="12" cy="10" r="3.2" fill="#f4d90f" />
    </>
  ),
}

/** Bandeira da nacionalidade do jogador. */
export function Flag({ nationality, className = '' }: { nationality: Nationality; className?: string }) {
  return (
    <svg viewBox="0 0 30 20" width="22" height="15" role="img" aria-label={NATIONALITY_LABELS[nationality]} className={`shrink-0 rounded-[3px] ring-1 ring-white/20 ${className}`}>
      {FLAGS[nationality] ?? flagShapes(COUNTRY_INFO[nationality].flag)}
    </svg>
  )
}

const MOOD_STYLE: Record<Mood, { color: string; label: string; mouth: string }> = {
  happy: { color: '#7be26a', label: 'Moral alta', mouth: 'M8 14.2c1 1.5 2.2 2.2 4 2.2s3-.7 4-2.2' },
  neutral: { color: '#f2c94c', label: 'Moral média', mouth: 'M8.5 15.2h7' },
  sad: { color: '#f5766b', label: 'Moral baixa', mouth: 'M8 16.6c1-1.5 2.2-2.2 4-2.2s3 .7 4 2.2' },
}

/** Carinha da moral: feliz, neutra ou triste, por faixa. */
export function MoodIcon({ morale, size = 22 }: { morale: number; size?: number }) {
  const mood = MOOD_STYLE[moodBand(morale)]
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" role="img" aria-label={`${mood.label} (${Math.round(morale)})`} className="shrink-0">
      <circle cx="12" cy="12" r="10" fill={mood.color} />
      <circle cx="8.6" cy="9.6" r="1.3" fill="#10131c" />
      <circle cx="15.4" cy="9.6" r="1.3" fill="#10131c" />
      <path d={mood.mouth} fill="none" stroke="#10131c" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

/** Barrinha vertical da condição física, preenchida de baixo para cima e colorida por faixa. */
export function ConditionBar({ fitness, className = '' }: { fitness: number; className?: string }) {
  const pct = Math.max(0, Math.min(100, fitness))
  return (
    <span className={`relative inline-block h-7 w-1.5 shrink-0 overflow-hidden rounded-full bg-surface-2 ${className}`} role="img" aria-label={`Condição ${Math.round(pct)}%`}>
      <span className={`absolute inset-x-0 bottom-0 rounded-full ${conditionBand(pct).bg}`} style={{ height: `${pct}%` }} />
    </span>
  )
}

/** Barrinha horizontal da condição, para os jogadores no campo. */
export function ConditionStrip({ fitness }: { fitness: number }) {
  const pct = Math.max(0, Math.min(100, fitness))
  return (
    <span className="block h-1.5 w-10 overflow-hidden rounded-full bg-black/50" role="img" aria-label={`Condição ${Math.round(pct)}%`}>
      <span className={`block h-full rounded-full ${conditionBand(pct).bg}`} style={{ width: `${pct}%` }} />
    </span>
  )
}

/** Selo colorido por faixa (força geral ou nota). `value` decide a cor; `children` é o texto. */
export function ValueBadge({ value, children, scale = 'overall', className = '' }: { value: number; children: ReactNode; scale?: 'overall' | 'rating'; className?: string }) {
  const band = bandFor(scale === 'rating' ? ratingToScale(value) : value)
  return <span className={`inline-flex min-w-11 items-center justify-center rounded-lg px-2 py-1 font-display text-lg font-extrabold leading-none tabular-nums text-bg ${band.bg} ${className}`}>{children}</span>
}

/** Nota da partida (0 a 10) na escala de 1 a 100 das faixas de cor: 6,0 vira 55 (verde-limão) e 7,5 vira 85. */
export const ratingToScale = (rating: number): number => Math.max(0, (rating - 3) * 18.5)

/** Camisa desenhada com as cores do time (no lugar de uma foto do jogador). */
export function Jersey({ team, size = 40 }: { team: Pick<Team, 'colors'>; size?: number }) {
  const [main, second] = team.colors
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true" className="shrink-0 drop-shadow">
      <path d="M13 4 5 8 1 17l6 3 3-3v19h20V17l3 3 6-3-4-9-8-4c-1 3-3.5 5-7 5s-6-2-7-5Z" fill={main} stroke={second} strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M13 4c1 3 3.5 5 7 5s6-2 7-5" fill="none" stroke={second} strokeWidth="1.8" />
    </svg>
  )
}

/** Estrelas do potencial estimado (1 a 5). */
export function Stars({ value, size = 14 }: { value: number; size?: number }) {
  return (
    <span className="inline-flex gap-0.5" role="img" aria-label={`Potencial estimado: ${value} de 5 estrelas`}>
      {Array.from({ length: 5 }, (_, i) => (
        <svg key={i} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
          <path d="m12 2.5 2.9 6.1 6.6.9-4.8 4.6 1.2 6.6L12 17.4 6.1 20.7l1.2-6.6L2.5 9.5l6.6-.9L12 2.5Z" fill={i < value ? '#f2c94c' : 'none'} stroke={i < value ? '#f2c94c' : '#4a5372'} strokeWidth="1.6" strokeLinejoin="round" />
        </svg>
      ))}
    </span>
  )
}

/** Setinha de quanto a força mudou desde o último mês (some quando não mudou). */
export function Trend({ change }: { change: number }) {
  if (change === 0) return null
  const up = change > 0
  return (
    <span className={`inline-flex items-center text-[11px] font-extrabold leading-none ${up ? 'text-win' : 'text-loss'}`} role="img" aria-label={`${up ? 'Subiu' : 'Caiu'} ${Math.abs(change)} desde o último mês`}>
      {up ? '▲' : '▼'}
      {Math.abs(change)}
    </span>
  )
}
