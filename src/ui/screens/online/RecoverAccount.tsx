import { useState } from 'react'
import { RECOVERY_WORDS } from '../../../online/recoveryCode'
import { recoverAccount } from '../../../store/onlineAccount'
import { Button, Card } from '../../components/ui'
import { ACCOUNT_REASON_LABELS, RECOVERY_ERROR_LABELS } from '../../labels'

/** Entrar com o código de recuperação em outro aparelho (B8.1). Nada local é apagado e nada é enviado antes de a pessoa ligar a nuvem. */
export function RecoverAccount({ onDone, onBack }: { onDone: () => void; onBack: () => void }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const count = text.split(/[\s,;]+/).filter(Boolean).length

  const submit = async () => {
    setBusy(true)
    setError(null)
    const result = await recoverAccount(text)
    setBusy(false)
    if (result.ok) return onDone()
    if (result.reason === 'format') {
      const which = result.index !== undefined ? ` (palavra nº ${result.index + 1})` : ''
      return setError(`${RECOVERY_ERROR_LABELS[result.error]}${which}`)
    }
    setError(result.reason === 'not-found' ? 'Não encontramos uma conta com esse código. Confira as palavras e a ordem.' : ACCOUNT_REASON_LABELS[result.reason])
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col gap-4 bg-bg px-4 py-6 text-slate-100" data-testid="recover-account">
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted">Outro aparelho</p>
      <h1 className="title text-3xl">Entrar com o código</h1>
      <p className="text-sm text-muted">Digite as {RECOVERY_WORDS} palavras da conta. Separe por espaço ou vírgula; acento e maiúscula não importam.</p>
      <textarea
        className={`min-h-32 rounded-xl bg-surface-2 p-3 text-base leading-relaxed ring-1 ${error ? 'ring-loss' : 'ring-line'}`}
        value={text}
        autoCapitalize="none"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        onChange={(e) => {
          setText(e.target.value)
          setError(null)
        }}
        data-testid="recover-input"
      />
      <p className="text-xs">
        <span className={`rounded-full border px-2.5 py-1 font-bold ${count === RECOVERY_WORDS ? 'border-win text-win' : 'border-line text-muted'}`}>
          {count} de {RECOVERY_WORDS} palavras
        </span>
      </p>
      {error && (
        <p role="alert" className="text-sm text-loss" data-testid="recover-error">
          {error}
        </p>
      )}
      <Card title="O que acontece">
        <p className="text-xs leading-relaxed text-muted">
          • Sua conta e seus saves da nuvem voltam a este aparelho
          <br />• Os saves que já estão neste aparelho não são apagados
          <br />• Nada é enviado antes de você escolher quais espaços ligar à nuvem
        </p>
      </Card>
      <div className="mt-auto flex flex-col gap-3">
        <Button disabled={count !== RECOVERY_WORDS || busy} onClick={() => void submit()}>
          {busy ? 'Entrando…' : 'Entrar'}
        </Button>
        <Button variant="secondary" onClick={onBack}>
          Cancelar
        </Button>
      </div>
    </div>
  )
}
