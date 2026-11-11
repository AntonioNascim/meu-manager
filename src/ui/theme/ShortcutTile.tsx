import { Icon } from './icons'
import type { IconName } from './icons'

const TONES = {
  sky: 'text-accent',
  amber: 'text-accent',
  rose: 'text-accent',
  teal: 'text-accent',
  violet: 'text-accent',
  slate: 'text-accent',
} as const

export type TileTone = keyof typeof TONES

/** Bloco de atalho: ícone colorido, rótulo e, quando há algo pendente, a bolinha vermelha de notificação. */
export function ShortcutTile({ icon, label, tone = 'slate', alert = false, onClick }: { icon: IconName; label: string; tone?: TileTone; alert?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shortcut-tile relative flex min-h-[76px] flex-col items-center justify-center gap-1.5 rounded-xl border border-white/[0.13] bg-gradient-to-b from-[#0e1a1c] to-[#091012] px-1 py-2 text-[13px] font-semibold leading-tight transition active:scale-95 ${TONES[tone]}`}
    >
      <Icon name={icon} size={24} />
      <span className="text-white">{label}</span>
      {alert && <span className="absolute right-2 top-1.5 h-2.5 w-2.5 rounded-full bg-loss shadow-[0_0_6px_var(--color-loss)]" role="img" aria-label="Há algo pendente" />}
    </button>
  )
}
