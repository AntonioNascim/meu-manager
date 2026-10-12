import { Icon } from './icons'
import type { IconName } from './icons'

export interface NavItem<T extends string> {
  id: T
  label: string
  icon: IconName
  alert?: boolean
}

/** Barra de navegação fixa na base da tela; a aba ativa fica em destaque. */
export function BottomNav<T extends string>({ items, active, onSelect }: { items: NavItem<T>[]; active: T | null; onSelect: (id: T) => void }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur" aria-label="Navegação principal">
      <div className="mx-auto flex max-w-xl gap-1 px-2 py-1.5">
        {items.map((item) => {
          const on = item.id === active
          return (
            <button
              key={item.id}
              type="button"
              aria-current={on ? 'page' : undefined}
              onClick={() => onSelect(item.id)}
              className={`relative flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl text-[11px] font-bold transition ${on ? 'bg-surface-2 text-white ring-1 ring-line' : 'text-muted'}`}
            >
              <Icon name={item.icon} size={22} />
              {item.label}
              {item.alert && <span className="absolute right-[28%] top-1.5 h-2.5 w-2.5 rounded-full bg-loss ring-2 ring-bg" role="img" aria-label="Há algo pendente" />}
            </button>
          )
        })}
      </div>
    </nav>
  )
}
