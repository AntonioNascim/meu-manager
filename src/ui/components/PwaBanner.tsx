import { useState } from 'react'
import type { ReactNode } from 'react'
import { applyUpdate, promptInstall, usePwa } from '../../pwa/pwa'
import { flushAutosave } from '../../store/autosave'

const HINT_KEY = 'meu-manager:ios-hint-dismissed'
const INSTALL_KEY = 'meu-manager:install-banner-closed-at'
/** Depois de fechada, a faixa de instalação some por este tempo. */
export const DISMISS_DAYS = 60

const closedRecently = (key: string, now: number = Date.now()): boolean => {
  try {
    const raw = window.localStorage.getItem(key)
    if (raw === null) return false
    // O formato antigo da dica do iOS guardava só "1": conta como fechada agora.
    const at = raw === '1' ? now : Number(raw)
    return Number.isFinite(at) && now - at < DISMISS_DAYS * 86_400_000
  } catch {
    return false
  }
}

const rememberClosed = (key: string) => {
  try {
    window.localStorage.setItem(key, String(Date.now()))
  } catch {
    // sem armazenamento: a faixa volta na próxima vez
  }
}

/** Aparelho de toque (celular ou tablet): o texto de instalação só fala em celular nele. */
const isTouchDevice = (): boolean => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches

/** Faixa no topo: versão nova disponível e como instalar o app no celular. */
export function PwaBanner() {
  const pwa = usePwa()
  const [hiddenIos, setHiddenIos] = useState(() => closedRecently(HINT_KEY))
  const [hiddenInstall, setHiddenInstall] = useState(() => closedRecently(INSTALL_KEY))

  if (pwa.updateReady) {
    return (
      <Bar>
        <span className="flex-1">Há uma versão nova do jogo.</span>
        <Action onClick={() => void flushAutosave().then(applyUpdate)}>Atualizar</Action>
      </Bar>
    )
  }
  if (pwa.canInstall && !hiddenInstall) {
    return (
      <Bar>
        <span className="flex-1">{isTouchDevice() ? 'Instale o Meu Manager no celular para jogar em tela cheia e sem internet.' : 'Instale o Meu Manager para jogar sem internet.'}</span>
        <Action onClick={() => void promptInstall()}>Instalar</Action>
        <Close
          onClick={() => {
            rememberClosed(INSTALL_KEY)
            setHiddenInstall(true)
          }}
        />
      </Bar>
    )
  }
  if (pwa.iosHint && !hiddenIos) {
    return (
      <Bar>
        <span className="flex-1">Para instalar: toque em Compartilhar e depois em "Adicionar à Tela de Início".</span>
        <Action
          onClick={() => {
            rememberClosed(HINT_KEY)
            setHiddenIos(true)
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
    <div className="border-b border-emerald-700 bg-emerald-950/95 px-4 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] text-sm text-emerald-100 backdrop-blur">
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

function Close({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label="Fechar" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg font-bold text-emerald-100 hover:bg-emerald-900">
      ×
    </button>
  )
}
