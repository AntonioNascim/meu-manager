/** Abas no topo da tela: barra arredondada com a aba ativa em degradê e, opcionalmente, uma bolinha de pendência. */
export function TopTabs<T extends string>({ value, options, onChange }: { value: T; options: { id: T; label: string; alert?: boolean }[]; onChange: (id: T) => void }) {
  return (
    <div className="flex gap-1 rounded-2xl border border-line bg-surface p-1" role="tablist">
      {options.map((o) => {
        const on = o.id === value
        return (
          <button
            key={o.id}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(o.id)}
            className={`relative min-h-11 flex-1 rounded-xl px-2 text-sm font-bold transition ${on ? 'bg-gradient-to-r from-violet-500 to-sky-400 text-white shadow' : 'text-muted'}`}
          >
            {o.label}
            {o.alert && <span className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full bg-loss ring-2 ring-surface" role="img" aria-label="Há algo pendente" />}
          </button>
        )
      })}
    </div>
  )
}
