import { useState } from 'react'
import { CODE_LENGTH, normalizeCode } from '../../../../online/leagueApi'
import { leagueApi } from '../../../../store/leagues'
import { Button } from '../../../components/ui'
import { LEAGUE_ERROR_LABELS } from '../../../labels'
import { Frame } from './parts'

/** Entrar com o código de convite (8 caracteres) ou pelo link (`?convite=CODIGO`). */
export function JoinByCode({ initialCode = '', onBack, onFound }: { initialCode?: string; onBack: () => void; onFound: (id: string, code: string) => void }) {
  const [code, setCode] = useState(initialCode)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const clean = normalizeCode(code)

  const search = async () => {
    setBusy(true)
    setError(null)
    const out = await leagueApi.resolveCode(clean)
    setBusy(false)
    if (out.ok) return onFound(out.league.id, clean)
    setError(out.error === 'rate-limited' ? 'Muitas tentativas de código. Espere um pouco e tente de novo.' : LEAGUE_ERROR_LABELS[out.error])
  }

  return (
    <Frame eyebrow="Ligas online" title="Entrar com um código" onBack={onBack}>
      <p className="text-sm text-muted">Digite o código de {CODE_LENGTH} letras e números que o ADM da liga mandou.</p>
      <input
        className={`min-h-14 rounded-xl bg-surface-2 px-4 text-center text-2xl font-bold uppercase tracking-[0.3em] ring-1 ${error ? 'ring-loss' : 'ring-line'}`}
        value={code}
        maxLength={CODE_LENGTH + 2}
        autoCapitalize="characters"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        onChange={(e) => {
          setCode(e.target.value)
          setError(null)
        }}
        data-testid="invite-code"
      />
      {error && (
        <p role="alert" className="text-sm text-loss" data-testid="code-error">
          {error}
        </p>
      )}
      <Button disabled={clean.length !== CODE_LENGTH || busy} onClick={() => void search()}>
        {busy ? 'Procurando…' : 'Procurar a liga'}
      </Button>
    </Frame>
  )
}
