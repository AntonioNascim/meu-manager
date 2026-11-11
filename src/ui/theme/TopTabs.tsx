import { useEffect, useRef } from 'react'

/**
 * Abas no topo da tela: barra arredondada com a aba ativa em degradê e, opcionalmente, uma bolinha de pendência.
 * Com `scroll`, as abas têm largura própria e a barra rola na horizontal (a aba ativa sempre fica à vista).
 */
export function TopTabs<T extends string>({ value, options, onChange, scroll = false, activeClass = 'tab-on font-bold text-white' }: { value: T; options: { id: T; label: string; alert?: boolean }[]; onChange: (id: T) => void; scroll?: boolean; activeClass?: string }) {
  const active = useRef<HTMLButtonElement | null>(null)
  useEffect(() => {
    if (scroll) active.current?.scrollIntoView?.({ inline: 'center', block: 'nearest', behavior: 'smooth' })
  }, [value, scroll])
  return (
    <div className={`flex gap-1 rounded-xl border border-white/[0.07] bg-[#070d0f] p-0.5 ${scroll ? 'overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden' : ''}`} role="tablist">
      {options.map((o) => {
        const on = o.id === value
        const size = scroll ? 'shrink-0 px-4 text-sm' : options.length > 4 ? 'min-w-0 flex-1 px-0 text-[12px] tracking-tight' : 'min-w-0 flex-1 px-2 text-sm'
        return (
          <button
            key={o.id}
            ref={on ? active : undefined}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(o.id)}
            className={`relative min-h-11 rounded-[9px] font-semibold transition ${size} ${on ? activeClass : 'text-slate-100'}`}
          >
            {o.label}
            {o.alert && <span className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full bg-loss ring-2 ring-surface" role="img" aria-label="Há algo pendente" />}
          </button>
        )
      })}
    </div>
  )
}
