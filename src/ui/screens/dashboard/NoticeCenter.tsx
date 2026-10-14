import { useState } from 'react'
import type { ScreenId } from '../../navigation'
import { Eyebrow, Icon, Panel } from '../../theme'
import type { DashboardNotice, NoticeTone } from './notices'

const TONE: Record<NoticeTone, { dot: string; icon: string }> = {
  danger: { dot: 'bg-loss', icon: 'text-loss' },
  warning: { dot: 'bg-amber-300', icon: 'text-amber-300' },
  info: { dot: 'bg-sky-300', icon: 'text-sky-300' },
  accent: { dot: 'bg-accent', icon: 'text-accent' },
}

const VISIBLE = 4

/** Central de avisos: do mais urgente ao menos, cada um leva à tela certa ao tocar. */
export function NoticeCenter({ notices, onOpen }: { notices: DashboardNotice[]; onOpen: (screen: ScreenId, tab?: string) => void }) {
  const [all, setAll] = useState(false)
  if (notices.length === 0) return null
  const shown = all ? notices : notices.slice(0, VISIBLE)
  const urgent = notices.filter((n) => n.tone === 'danger').length
  return (
    <Panel glow={urgent > 0} className="p-3" data-testid="notice-center">
      <div className="flex items-center justify-between px-1 pb-1">
        <Eyebrow>Avisos</Eyebrow>
        <span className="text-xs font-bold text-muted">{notices.length}</span>
      </div>
      <ul className="divide-y divide-line">
        {shown.map((n) => (
          <li key={n.id}>
            <button type="button" onClick={() => onOpen(n.to, n.tab)} className="flex min-h-14 w-full items-center gap-3 px-1 py-2 text-left" data-notice={n.id}>
              <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface">
                <Icon name={n.icon} size={20} className={TONE[n.tone].icon} />
                <span className={`absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-bg ${TONE[n.tone].dot}`} aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold">{n.title}</span>
                <span className="block text-xs text-muted">{n.detail}</span>
              </span>
              <span className="text-lg text-muted" aria-hidden="true">
                ›
              </span>
            </button>
          </li>
        ))}
      </ul>
      {notices.length > VISIBLE && (
        <button type="button" onClick={() => setAll(!all)} className="min-h-10 w-full text-sm font-bold text-accent">
          {all ? 'Mostrar menos' : `Ver todos os avisos (${notices.length})`}
        </button>
      )}
    </Panel>
  )
}
