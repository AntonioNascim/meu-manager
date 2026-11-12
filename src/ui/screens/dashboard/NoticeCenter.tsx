import { useState } from 'react'
import type { ScreenId } from '../../navigation'
import { Icon } from '../../theme'
import type { DashboardNotice, NoticeTone } from './notices'

const TONE: Record<NoticeTone, { dot: string; icon: string; tile: string }> = {
  danger: { dot: 'bg-loss', icon: 'text-loss', tile: 'from-loss/35 via-loss/10' },
  warning: { dot: 'bg-amber', icon: 'text-amber', tile: 'from-amber/35 via-amber/10' },
  info: { dot: 'bg-cyan', icon: 'text-cyan', tile: 'from-cyan/30 via-cyan/10' },
  accent: { dot: 'bg-accent', icon: 'text-accent', tile: 'from-accent/35 via-accent/10' },
}

const VISIBLE = 3

/** Central de avisos (no formato do cartão de destaque): o mais urgente em cima, grande, e os outros em linhas; cada um leva à tela certa. */
export function NoticeCenter({ notices, onOpen }: { notices: DashboardNotice[]; onOpen: (screen: ScreenId, tab?: string) => void }) {
  const [all, setAll] = useState(false)
  if (notices.length === 0) return null
  const [first, ...rest] = notices
  const shown = all ? rest : rest.slice(0, VISIBLE - 1)
  const urgent = notices.some((n) => n.tone === 'danger')
  return (
    <section data-testid="notice-center" className={`card-bg overflow-hidden rounded-[14px] border border-l-[3px] border-l-accent ${urgent ? 'border-loss/45' : 'border-white/[0.13]'}`}>
      <div className="flex items-center gap-2 border-b border-white/[0.07] bg-gradient-to-r from-accent/[0.10] to-transparent px-3 py-2.5">
        <Icon name="bell" size={22} className="text-white" />
        <span className="flex-1 font-display text-[19px] font-bold leading-none">Avisos</span>
        <span className="rounded-full bg-accent/15 px-2 py-0.5 text-xs font-bold text-accent">{notices.length}</span>
        {notices.length > VISIBLE && (
          <button type="button" onClick={() => setAll(!all)} className="flex min-h-9 items-center gap-0.5 pl-1 text-[13px] font-bold text-accent">
            {all ? 'Menos' : 'Ver todos'}
            <Icon name="chev" size={16} />
          </button>
        )}
      </div>
      {first && (
        <button type="button" onClick={() => onOpen(first.to, first.tab)} className="flex w-full items-stretch gap-3 text-left" data-notice={first.id}>
          <span className={`relative flex w-[34%] flex-none items-center justify-center overflow-hidden bg-gradient-to-br ${TONE[first.tone].tile} to-transparent`}>
            <span className="absolute inset-0 opacity-30 [background:repeating-linear-gradient(115deg,transparent_0_14px,rgb(255_255_255/0.12)_14px_16px)]" />
            <Icon name={first.icon} size={44} className={`relative ${TONE[first.tone].icon}`} />
            <span className={`absolute right-2 top-2 h-2.5 w-2.5 rounded-full ring-2 ring-bg ${TONE[first.tone].dot}`} aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1 py-3 pr-3">
            <span className="block font-display text-[20px] font-bold leading-tight">{first.title}</span>
            <span className="mt-0.5 block text-[13px] leading-snug text-muted">{first.detail}</span>
          </span>
        </button>
      )}
      {shown.length > 0 && (
        <ul className="divide-y divide-white/[0.07] border-t border-white/[0.07]">
          {shown.map((n) => (
            <li key={n.id}>
              <button type="button" onClick={() => onOpen(n.to, n.tab)} className="flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left" data-notice={n.id}>
                <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface">
                  <Icon name={n.icon} size={20} className={TONE[n.tone].icon} />
                  <span className={`absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-bg ${TONE[n.tone].dot}`} aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold">{n.title}</span>
                  <span className="block text-xs text-muted">{n.detail}</span>
                </span>
                <Icon name="chev" size={18} className="text-muted" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
