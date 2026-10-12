import { useState } from 'react'
import type { ReactNode } from 'react'
import { applyUpdate, promptInstall, usePwa } from '../../pwa/pwa'
import { flushAutosave } from '../../store/autosave'

const HINT_KEY = 'meu-manager:ios-hint-dismissed'

const hintDismissed = () => {
  try {
    return window.localStorage.getItem(HINT_KEY) === '1'
  } catch {
    return false
  }
}

/** Faixa no topo: versão nova disponível e como instalar o app no celular. */
export function PwaBanner() {
  const pwa = usePwa()
  const [hidden, setHidden] = useState(hintDismissed)

  if (pwa.updateReady) {
    return (
      <Bar>
        <span className="flex-1">Há uma versão nova do jogo.</span>
        <Action onClick={() => void flushAutosave().then(applyUpdate)}>Atualizar</Action>
      </Bar>
    )
  }
  if (pwa.canInstall) {
    return (
      <Bar>
        <span className="flex-1">Instale o Meu Manager no celular para jogar em tela cheia e sem internet.</span>
        <Action onClick={() => void promptInstall()}>Instalar</Action>
      </Bar>
    )
  }
  if (pwa.iosHint && !hidden) {
    return (
      <Bar>
        <span className="flex-1">Para instalar: toque em Compartilhar e depois em "Adicionar à Tela de Início".</span>
        <Action
          onClick={() => {
            try {
              window.localStorage.setItem(HINT_KEY, '1')
            } catch {
              // sem armazenamento: a dica volta na próxima vez
            }
            setHidden(true)
          }}
        >
          Ok
        </Action>
      </Bar>
    )
  }
  return null
}

function Bar({ children }: { children: ReactNode }) {
  return (
    <div className="fixed inset-x-0 top-0 z-40 border-b border-emerald-700 bg-emerald-950/95 px-4 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] text-sm text-emerald-100 backdrop-blur">
      <div className="mx-auto flex max-w-xl items-center gap-3">{children}</div>
    </div>
  )
}

function Action({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="min-h-12 shrink-0 rounded-lg bg-emerald-500 px-4 font-semibold text-slate-950">
      {children}
    </button>
  )
}
