/**
 * Portão do modo online até o lançamento: o cartão "Online" do menu só aparece para quem abriu o jogo com `?online=1`
 * (a escolha fica guardada no aparelho) ou em `npm run dev`. `?online=0` volta a esconder.
 */
export const ONLINE_GATE_KEY = 'mm-online'

type Env = { search: string; storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>; dev?: boolean }

export function onlineUnlocked({ search, storage, dev }: Env): boolean {
  if (dev) return true
  const flag = new URLSearchParams(search).get('online')
  try {
    if (flag === '1') storage?.setItem(ONLINE_GATE_KEY, '1')
    else if (flag === '0') storage?.removeItem(ONLINE_GATE_KEY)
    else return storage?.getItem(ONLINE_GATE_KEY) === '1'
  } catch {
    /* armazenamento bloqueado: vale só o endereço */
  }
  return flag === '1'
}

export function onlineUnlockedHere(): boolean {
  if (typeof window === 'undefined') return false
  let storage: Storage | undefined
  try {
    storage = window.localStorage
  } catch {
    storage = undefined
  }
  return onlineUnlocked({ search: window.location.search, ...(storage ? { storage } : {}), dev: import.meta.env.DEV })
}
