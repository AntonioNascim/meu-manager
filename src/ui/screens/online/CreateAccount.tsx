import { useMemo, useState } from 'react'
import { checkName } from '../../../online/nameFilter'
import { pickCheckPositions } from '../../../online/recoveryCode'
import { confirmRecoveryCode, createAccount } from '../../../store/onlineAccount'
import { Button } from '../../components/ui'
import { ACCOUNT_REASON_LABELS, NAME_ISSUE_LABELS } from '../../labels'
import { RecoveryCodeSetup } from './RecoveryCode'
import { Turnstile } from './Turnstile'

const randomBytes = (n: number): Uint8Array => crypto.getRandomValues(new Uint8Array(n))

/**
 * Criar a conta online (B8.1): passo 1 apelido e verificação, passo 2 o código de recuperação (as 12 palavras, confirmadas por 3 sorteadas).
 * A conta só é gravada no aparelho depois de o servidor aceitar; o código só aparece depois disso.
 */
export function CreateAccount({ onDone, onBack }: { onDone: () => void; onBack: () => void }) {
  const [nickname, setNickname] = useState('')
  const [token, setToken] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [words, setWords] = useState<string[] | null>(null)
  const positions = useMemo(() => pickCheckPositions(randomBytes), [])

  const checked = checkName(nickname)
  const nameError = nickname.trim() !== '' && !checked.ok ? NAME_ISSUE_LABELS[checked.issue] : null

  const submit = async () => {
    if (!checked.ok || !token) return
    setBusy(true)
    setError(null)
    const result = await createAccount(nickname, token)
    setBusy(false)
    if (result.ok) return setWords(result.words)
    setError(result.reason === 'bad-nickname' ? NAME_ISSUE_LABELS[result.issue] : ACCOUNT_REASON_LABELS[result.reason])
  }

  if (words) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-xl flex-col gap-4 bg-bg px-4 py-6 text-slate-100">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted">Passo 2 de 2 · Conta online</p>
        <RecoveryCodeSetup
          words={words}
          positions={positions}
          onConfirmed={() => {
            void confirmRecoveryCode().then(onDone)
          }}
        />
      </div>
    )
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col gap-4 bg-bg px-4 py-6 text-slate-100" data-testid="create-account">
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted">Passo 1 de 2 · Conta online</p>
      <h1 className="title text-3xl">Escolha seu apelido</h1>
      <p className="text-sm text-muted">É o nome que os outros técnicos veem nas ligas. Você pode trocar depois.</p>
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted">Apelido</span>
        <input
          className={`min-h-13 rounded-xl bg-surface-2 px-4 text-lg font-semibold ring-1 ${nameError ? 'ring-loss' : checked.ok ? 'ring-win' : 'ring-line'}`}
          value={nickname}
          maxLength={24}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          onChange={(e) => {
            setNickname(e.target.value)
            setError(null)
          }}
          data-testid="nickname-input"
        />
        {nameError && <span className="text-xs text-loss">{nameError}</span>}
      </label>
      <div className="rounded-2xl border border-line bg-surface p-4 text-xs leading-relaxed text-muted">
        <p className="font-bold text-slate-100">Regras</p>
        <p className="mt-1">• 3 a 16 caracteres: letras, números, espaço, ponto, hífen e sublinhado</p>
        <p>• Sem links, telefone, palavrões ou nomes que imitam o jogo</p>
        <p>• Pode repetir o apelido de outra pessoa: o que identifica você é o seu código</p>
      </div>
      <p className="text-xs text-muted">Vamos conferir que você é uma pessoa (uma checagem rápida, sem quebra-cabeça).</p>
      <Turnstile onToken={setToken} />
      {error && (
        <p role="alert" className="text-sm text-loss" data-testid="create-error">
          {error}
        </p>
      )}
      <div className="mt-auto flex flex-col gap-3">
        <Button disabled={!checked.ok || !token || busy} onClick={() => void submit()}>
          {busy ? 'Criando…' : 'Continuar'}
        </Button>
        <Button variant="secondary" onClick={onBack}>
          Cancelar
        </Button>
      </div>
    </div>
  )
}
