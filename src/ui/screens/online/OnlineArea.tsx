import { useState } from 'react'
import { useAccount } from '../../../store/onlineAccount'
import { AccountData } from './AccountData'
import { CloudSaves } from './CloudSaves'
import { CreateAccount } from './CreateAccount'
import { RecoverAccount } from './RecoverAccount'
import { RecoveryCodeView } from './RecoveryCode'

export type OnlineView = 'create' | 'recover' | 'cloud' | 'data' | 'code'

/** As telas da conta online (B8.1) e dos saves na nuvem (B8.2). O menu inicial abre numa delas e `onClose` volta ao menu. */
export function OnlineArea({ start, onClose }: { start: OnlineView; onClose: () => void }) {
  const { account } = useAccount()
  const [view, setView] = useState<OnlineView>(start)

  if (view === 'create') return <CreateAccount onDone={onClose} onBack={onClose} />
  if (view === 'recover') return <RecoverAccount onDone={onClose} onBack={onClose} />
  if (!account) return null
  if (view === 'cloud') return <CloudSaves onBack={onClose} />
  if (view === 'code') {
    return (
      <div className="mx-auto flex min-h-dvh max-w-xl flex-col gap-4 bg-bg px-4 py-6 text-slate-100">
        {account.recoveryWords ? (
          <RecoveryCodeView words={account.recoveryWords} onBack={() => setView('data')} />
        ) : (
          <>
            <p className="text-sm text-muted">Este aparelho não guardou o código (a conta foi criada numa versão antiga). Use o código que você anotou quando criou a conta.</p>
            <button type="button" className="min-h-12 rounded-xl bg-surface-2 font-bold ring-1 ring-line" onClick={() => setView('data')}>
              Voltar
            </button>
          </>
        )}
      </div>
    )
  }
  return <AccountData onBack={onClose} onShowCode={() => setView('code')} onDeleted={onClose} />
}
