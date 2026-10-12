import { Icon } from './icons'
import type { IconName } from './icons'

const TONES = {
  sky: 'border-sky-400/30 from-sky-400/15 text-sky-300',
  amber: 'border-amber-400/30 from-amber-400/15 text-amber-300',
  rose: 'border-rose-400/30 from-rose-400/15 text-rose-300',
  teal: 'border-teal-400/30 from-teal-400/15 text-teal-300',
  violet: 'border-violet-400/30 from-violet-400/15 text-violet-300',
  slate: 'border-slate-400/30 from-slate-400/15 text-slate-300',
} as const

export type TileTone = keyof typeof TONES

/** Bloco de atalho: ícone colorido, rótulo e, quando há algo pendente, a bolinha vermelha de notificação. */
export function ShortcutTile({ icon, label, tone = 'slate', alert = false, onClick }: { icon: IconName; label: string; tone?: TileTone; alert?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`cut-corner-sm relative flex min-h-[84px] flex-col items-center justify-center gap-2 rounded-xl border bg-gradient-to-b to-surface px-1 py-3 text-xs font-bold transition active:scale-95 ${TONES[tone]}`}
    >
      <Icon name={icon} size={24} />
      <span className="text-white">{label}</span>
      {alert && <span className="absolute left-2 top-2 h-3 w-3 rounded-full bg-loss ring-2 ring-bg" role="img" aria-label="Há algo pendente" />}
    </button>
  )
}
