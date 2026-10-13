import type { ReactNode } from 'react'
import type { Team } from '../../../engine/types'
import { Crest, Icon } from '../../theme'
import type { IconName } from '../../theme'

const SUFFIXES = / (Futebol Clube|Esporte Clube|Sport Club|Atlético Clube|Futebol e Regatas|Clube de Regatas|Associação Atlética|Atlético)$/

/** Nome curto para listas apertadas: sem "Futebol Clube", "Esporte Clube" e parecidos no fim. */
export const shortName = (team: Pick<Team, 'name'>): string => team.name.replace(SUFFIXES, '')

export type Tone = 'gold' | 'teal' | 'amber' | 'violet'

const TONES: Record<Tone, { icon: string; glow: string; chip: string; value: string }> = {
  gold: { icon: 'text-amber-300', glow: 'from-amber-400/20', chip: 'bg-gradient-to-b from-amber-300 to-amber-500 text-bg', value: 'text-amber-300' },
  teal: { icon: 'text-teal-300', glow: 'from-teal-400/20', chip: 'bg-gradient-to-b from-teal-200 to-teal-400 text-bg', value: 'text-teal-300' },
  amber: { icon: 'text-yellow-300', glow: 'from-yellow-400/20', chip: 'bg-gradient-to-b from-yellow-200 to-yellow-400 text-bg', value: 'text-yellow-300' },
  violet: { icon: 'text-violet-300', glow: 'from-violet-400/20', chip: 'bg-gradient-to-b from-violet-400 to-sky-400 text-white', value: 'text-violet-300' },
}

export const toneOf = (t: Tone) => TONES[t]

/** Cabeçalho de cada seção: ícone grande na cor de destaque, título em caixa alta e subtítulo. */
export function SectionHeader({ icon, title, subtitle, tone }: { icon: IconName; title: string; subtitle: string; tone: Tone }) {
  return (
    <header className={`flex items-center gap-4 rounded-2xl border border-line bg-gradient-to-br ${TONES[tone].glow} to-surface p-4`}>
      <span className={TONES[tone].icon}>
        <Icon name={icon} size={48} />
      </span>
      <div className="min-w-0">
        <h2 className="title text-4xl">{title}</h2>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted">{subtitle}</p>
      </div>
    </header>
  )
}

/** Escudo e nome do time; tocar abre a página do time quando `onOpen` é dado. */
export function TeamLink({ team, onOpen, size = 'xs', children, className = '' }: { team: Team; onOpen?: (id: string) => void; size?: 'xs' | 'sm'; children?: ReactNode; className?: string }) {
  const body = (
    <>
      <Crest team={team} size={size} />
      <span className="truncate">{children ?? shortName(team)}</span>
    </>
  )
  if (!onOpen) return <span className={`flex min-w-0 items-center gap-2 ${className}`}>{body}</span>
  return (
    <button type="button" onClick={() => onOpen(team.id)} className={`flex min-w-0 items-center gap-2 text-left ${className}`} aria-label={`Abrir ${team.name}`}>
      {body}
    </button>
  )
}

const DOT: Record<'W' | 'D' | 'L', string> = { W: 'bg-win', D: 'bg-draw', L: 'bg-loss' }
const DOT_LABEL: Record<'W' | 'D' | 'L', string> = { W: 'Vitória', D: 'Empate', L: 'Derrota' }

/** Bolinhas coloridas dos últimos jogos (verde, cinza, vermelho), completando com vazias até `total`. */
export function FormDots({ form, total = 5 }: { form: readonly ('W' | 'D' | 'L')[]; total?: number }) {
  return (
    <span className="flex gap-1" role="img" aria-label={form.length > 0 ? `Últimos jogos: ${form.map((f) => DOT_LABEL[f]).join(', ')}` : 'Sem jogos'}>
      {Array.from({ length: total }, (_, i) => {
        const f = form[i - (total - form.length)]
        return <span key={i} className={`h-2 w-2 rounded-full ${f ? DOT[f] : 'bg-surface-2'}`} />
      })}
    </span>
  )
}
