import { useState } from 'react'
import { checkName } from '../../../online/nameFilter'
import { createAccount } from '../../../store/onlineAccount'
import { Button } from '../../components/ui'
import { ACCOUNT_REASON_LABELS, NAME_ISSUE_LABELS } from '../../labels'
import { Turnstile } from './Turnstile'

/**
 * Criar a conta online (B8.1): apelido e verificação, e pronto: a pessoa já sai jogando.
 * O código de recuperação NÃO aparece aqui; o menu avisa para guardá-lo até ela tocar em "Já guardei".
 * A conta só é gravada no aparelho depois de o servidor aceitar.
 */
export function CreateAccount({ onDone, onBack }: { onDone: () => void; onBack: () => void }) {
  const [nickname, setNickname] = useState('')
  const [token, setToken] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const checked = checkName(nickname)
  const nameError = nickname.trim() !== '' && !checked.ok ? NAME_ISSUE_LABELS[checked.issue] : null

  const submit = async () => {
    if (!checked.ok || !token) return
    setBusy(true)
    setError(null)
    const result = await createAccount(nickname, token)
    setBusy(false)
    if (result.ok) return onDone()
    setError(result.reason === 'bad-nickname' ? NAME_ISSUE_LABELS[result.issue] : ACCOUNT_REASON_LABELS[result.reason])
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col gap-4 bg-bg px-4 py-6 text-slate-100" data-testid="create-account">
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted">Conta online</p>
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
        <p>• Pode repetir o apelido de outra pessoa: o que identifica você é o seu código de recuperação</p>
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
          {busy ? 'Criando…' : 'Criar conta'}
        </Button>
        <Button variant="secondary" onClick={onBack}>
          Cancelar
        </Button>
      </div>
    </div>
  )
}
