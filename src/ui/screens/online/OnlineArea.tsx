import { useState } from 'react'
import { confirmRecoveryCode, useAccount } from '../../../store/onlineAccount'
import { AccountData } from './AccountData'
import { CloudSaves } from './CloudSaves'
import { CreateAccount } from './CreateAccount'
import { RecoverAccount } from './RecoverAccount'
import { PrivacyNotice } from './PrivacyNotice'
import { RecoveryCodeView } from './RecoveryCode'
import { CreateLeague } from './leagues/CreateLeague'
import { JoinByCode } from './leagues/JoinByCode'
import { LeagueRoomScreen } from './leagues/LeagueRoomScreen'
import { LeaguesHub } from './leagues/LeaguesHub'
import { OpenLeagues } from './leagues/OpenLeagues'

export type OnlineView = 'create' | 'recover' | 'cloud' | 'data' | 'code' | 'leagues' | 'create-league' | 'open-leagues' | 'join-code' | 'league' | 'privacy'

/**
 * As telas da conta online (B8.1), dos saves na nuvem (B8.2) e das ligas online (B8.3). O menu inicial abre numa delas e `onClose` volta ao menu.
 * `invite` é o código que veio do link de convite (`?convite=`): quem ainda não tem conta cria a conta e segue para o convite.
 */
export function OnlineArea({ start, onClose, invite }: { start: OnlineView; onClose: () => void; invite?: string }) {
  const { account } = useAccount()
  const [view, setView] = useState<OnlineView>(start)
  const [before, setBefore] = useState<OnlineView>(start)
  /** Abre o aviso de privacidade e volta para a tela de onde veio. */
  const showPrivacy = () => {
    setBefore(view)
    setView('privacy')
  }
  const [leagueId, setLeagueId] = useState<string>('')
  const [leagueCode, setLeagueCode] = useState<string | undefined>(undefined)
  const toHub = () => setView('leagues')
  const openLeague = (id: string, code?: string) => {
    setLeagueId(id)
    setLeagueCode(code)
    setView('league')
  }

  if (view === 'privacy') return <PrivacyNotice onBack={() => setView(before)} />
  if (view === 'create') return <CreateAccount onDone={() => (invite ? setView('join-code') : onClose())} onBack={onClose} onPrivacy={showPrivacy} />
  if (view === 'recover') return <RecoverAccount onDone={() => (invite ? setView('join-code') : onClose())} onBack={onClose} />
  if (!account) return null
  if (view === 'cloud') return <CloudSaves onBack={onClose} />
  if (view === 'leagues') return <LeaguesHub onBack={onClose} onOpen={(id) => openLeague(id)} onCreate={() => setView('create-league')} onDirectory={() => setView('open-leagues')} onCode={() => setView('join-code')} />
  if (view === 'create-league') return <CreateLeague onBack={toHub} onCreated={(id) => openLeague(id)} />
  if (view === 'open-leagues') return <OpenLeagues onBack={toHub} onOpen={(id) => openLeague(id)} />
  if (view === 'join-code') return <JoinByCode initialCode={invite ?? ''} onBack={toHub} onFound={(id, code) => openLeague(id, code)} />
  if (view === 'league') return <LeagueRoomScreen id={leagueId} code={leagueCode} onBack={toHub} />
  if (view === 'code') {
    return (
      <div className="mx-auto flex min-h-dvh max-w-xl flex-col gap-4 bg-bg px-4 py-6 text-slate-100">
        {account.recoveryCode ? (
          <RecoveryCodeView code={account.recoveryCode} confirmed={account.codeConfirmed} {...(account.nickname ? { nickname: account.nickname } : {})} onConfirm={() => void confirmRecoveryCode().then(onClose)} onBack={() => setView('data')} />
        ) : (
          <>
            <p className="text-sm text-muted">Este aparelho não guardou o código (a conta foi criada numa versão antiga). Use o código que você guardou quando criou a conta.</p>
            <button type="button" className="min-h-12 rounded-xl bg-surface-2 font-bold ring-1 ring-line" onClick={() => setView('data')}>
              Voltar
            </button>
          </>
        )}
      </div>
    )
  }
  return <AccountData onBack={onClose} onShowCode={() => setView('code')} onDeleted={onClose} onPrivacy={showPrivacy} />
}
