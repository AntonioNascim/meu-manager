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
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-white/[0.13] bg-gradient-to-b from-[#0b1315] to-[#05090a] pb-[env(safe-area-inset-bottom)]" aria-label="Navegação principal">
      <div className="mx-auto grid max-w-xl grid-flow-col auto-cols-fr">
        {items.map((item) => {
          const on = item.id === active
          return (
            <button
              key={item.id}
              type="button"
              aria-current={on ? 'page' : undefined}
              onClick={() => onSelect(item.id)}
              className={`relative flex min-h-16 flex-col items-center justify-center gap-1 border-r border-white/[0.07] text-[11.5px] last:border-r-0 ${on ? 'bg-gradient-to-b from-accent/[0.12] to-transparent font-bold text-accent before:absolute before:inset-x-[10%] before:-top-px before:h-[3px] before:rounded-b before:bg-accent before:shadow-[0_0_12px_var(--color-accent)]' : 'font-medium text-[#cfd9d5]'}`}
            >
              <Icon name={item.icon} size={22} />
              {item.label}
              {item.alert && <span className="absolute right-[28%] top-1.5 h-2.5 w-2.5 rounded-full bg-loss ring-2 ring-[#05090a]" role="img" aria-label="Há algo pendente" />}
            </button>
          )
        })}
      </div>
    </nav>
  )
}
