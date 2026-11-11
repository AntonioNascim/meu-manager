import { useState } from 'react'
import { accessOf, AGE_BANDS, FULL_ACCESS_AGE, type AgeBand } from '../../../online/agePolicy'
import { checkName } from '../../../online/nameFilter'
import { createAccount } from '../../../store/onlineAccount'
import { Button } from '../../components/ui'
import { ACCOUNT_REASON_LABELS, AGE_BAND_LABELS, NAME_ISSUE_LABELS } from '../../labels'
import { Turnstile } from './Turnstile'

/**
 * Criar a conta online (B8.1): apelido e verificação, e pronto: a pessoa já sai jogando.
 * O código de recuperação NÃO aparece aqui; o menu avisa para guardá-lo até ela tocar em "Já guardei".
 * A conta só é gravada no aparelho depois de o servidor aceitar.
 */
export function CreateAccount({ onDone, onBack, onPrivacy }: { onDone: () => void; onBack: () => void; onPrivacy?: () => void }) {
  const [band, setBand] = useState<AgeBand | null>(null)
  const access = band ? accessOf(band) : null
  const [nickname, setNickname] = useState('')
  const [token, setToken] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const checked = checkName(nickname)
  const nameError = nickname.trim() !== '' && !checked.ok ? NAME_ISSUE_LABELS[checked.issue] : null

  const ready = !!token && (access === 'protected' || (access === 'full' && checked.ok))

  const submit = async () => {
    if (!band || !ready) return
    setBusy(true)
    setError(null)
    const result = await createAccount(band, access === 'full' ? nickname : undefined, token as string)
    setBusy(false)
    if (result.ok) return onDone()
    setError(result.reason === 'bad-nickname' ? NAME_ISSUE_LABELS[result.issue] : ACCOUNT_REASON_LABELS[result.reason])
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col gap-4 px-4 py-6 text-slate-100" data-testid="create-account">
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted">Conta online</p>
      <h1 className="title text-3xl">{access === 'full' ? 'Escolha seu apelido' : 'Criar a conta'}</h1>
      <fieldset className="flex flex-col gap-2" data-testid="age-band">
        <legend className="mb-1 text-sm text-muted">Qual é a sua faixa de idade? Só guardamos a faixa, nunca a data de nascimento.</legend>
        {AGE_BANDS.map((b) => (
          <label key={b.id} className="flex min-h-12 items-center gap-3 rounded-xl bg-surface-2 px-3 text-sm ring-1 ring-line">
            <input
              type="radio"
              name="age-band"
              checked={band === b.id}
              onChange={() => {
                setBand(b.id)
                setError(null)
              }}
              data-testid={`age-${b.id}`}
            />
            {AGE_BAND_LABELS[b.id]}
          </label>
        ))}
      </fieldset>
      {access === 'none' && (
        <p role="alert" className="rounded-2xl border border-line bg-surface p-4 text-sm" data-testid="too-young">
          O modo online é para quem tem 12 anos ou mais. A <b>carreira solo</b> está liberada para todas as idades e não precisa de conta.
        </p>
      )}
      {access === 'protected' && (
        <div className="rounded-2xl border border-line bg-surface p-4 text-xs leading-relaxed text-muted" data-testid="protected-info">
          <p className="font-bold text-slate-100">Modo protegido</p>
          <p className="mt-1">• O jogo dá um apelido para você (como “Técnico 4821”); ele não pode ser trocado</p>
          <p>• Só ligas de amigos, entrando por convite: sem ligas abertas</p>
          <p>• O nome da liga é escolhido de uma lista</p>
          <p>• Fica tudo liberado aos {FULL_ACCESS_AGE} anos</p>
        </div>
      )}
      {access === 'full' && <p className="text-sm text-muted">É o nome que os outros técnicos veem nas ligas. Você pode trocar depois.</p>}
      {access === 'full' && (
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
      )}
      {access === 'full' && (
        <div className="rounded-2xl border border-line bg-surface p-4 text-xs leading-relaxed text-muted">
          <p className="font-bold text-slate-100">Regras</p>
          <p className="mt-1">• 3 a 16 caracteres: letras, números, espaço, ponto, hífen e sublinhado</p>
          <p>• Sem links, telefone, palavrões ou nomes que imitam o jogo</p>
          <p>• Pode repetir o apelido de outra pessoa: o que identifica você é o seu código de recuperação</p>
        </div>
      )}
      {(access === 'full' || access === 'protected') && (
        <>
          <p className="text-xs text-muted">Vamos conferir que você é uma pessoa (uma checagem rápida, sem quebra-cabeça).</p>
          <Turnstile onToken={setToken} />
        </>
      )}
      {error && (
        <p role="alert" className="text-sm text-loss" data-testid="create-error">
          {error}
        </p>
      )}
      {onPrivacy && (
        <p className="text-xs text-muted">
          Ao criar a conta você concorda com o{' '}
          <button type="button" className="font-semibold underline" onClick={onPrivacy} data-testid="open-privacy">
            aviso de privacidade
          </button>
          : sem e-mail, sem nome real, sem anúncios.
        </p>
      )}
      <div className="mt-auto flex flex-col gap-3">
        <Button disabled={!ready || busy} onClick={() => void submit()}>
          {busy ? 'Criando…' : 'Criar conta'}
        </Button>
        <Button variant="secondary" onClick={onBack}>
          Cancelar
        </Button>
      </div>
    </div>
  )
}
