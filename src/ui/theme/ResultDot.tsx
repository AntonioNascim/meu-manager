import { OUTCOME_LABELS, OUTCOME_SHORT_LABELS } from '../labels'

type Outcome = 'W' | 'D' | 'L'

const COLORS: Record<Outcome, string> = { W: 'bg-win', D: 'bg-draw', L: 'bg-loss' }
const SIZES = { sm: 'h-7 w-7 text-sm', md: 'h-9 w-9 text-base', lg: 'h-12 w-12 text-2xl' } as const

/** Bolinha do resultado: V (vitória), E (empate) ou D (derrota). */
export function ResultDot({ outcome, size = 'sm' }: { outcome: Outcome; size?: keyof typeof SIZES }) {
  return (
    <span
      title={OUTCOME_LABELS[outcome]}
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-display font-extrabold text-bg ${COLORS[outcome]} ${SIZES[size]}`}
    >
      {OUTCOME_SHORT_LABELS[outcome]}
    </span>
  )
}
