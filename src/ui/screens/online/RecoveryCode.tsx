import { useEffect, useState } from 'react'
import { checkConfirmation, RECOVERY_WORDS } from '../../../online/recoveryCode'
import { Button, Card } from '../../components/ui'

/** O aviso que acompanha o código sempre que ele aparece. */
function Warning() {
  return (
    <div role="alert" className="rounded-2xl border border-loss bg-loss/10 p-4 text-sm leading-relaxed" data-testid="recovery-warning">
      <p className="font-bold text-loss">Anote estas {RECOVERY_WORDS} palavras agora.</p>
      <p className="mt-2">
        <strong>Sem elas, quem perder o celular, limpar os dados do navegador ou trocar de aparelho perde a carreira salva na nuvem e o acesso às ligas online.</strong> Nós não guardamos este código e não conseguimos recuperá-lo.
      </p>
      <p className="mt-2 text-muted">Quem tiver o código entra na sua conta. Guarde em papel, em lugar seguro, e não mostre nem envie para ninguém.</p>
    </div>
  )
}

function Words({ words }: { words: readonly string[] }) {
  return (
    <ol className="grid grid-cols-2 gap-2 sm:grid-cols-3" data-testid="recovery-words">
      {words.map((w, i) => (
        <li key={i} className="flex min-h-12 items-center gap-2 rounded-xl bg-surface-2 px-3 ring-1 ring-line">
          <span className="w-5 text-right text-xs text-muted">{i + 1}</span>
          <span className="font-semibold">{w}</span>
        </li>
      ))}
    </ol>
  )
}

/**
 * Primeiro uso: mostra o aviso e as 12 palavras e só segue depois que a pessoa digita as palavras sorteadas.
 * `positions` vem de `pickCheckPositions` (posições de 0 a 11), sorteadas por quem chama.
 */
export function RecoveryCodeSetup({ words, positions, onConfirmed }: { words: readonly string[]; positions: readonly number[]; onConfirmed: () => void }) {
  const [step, setStep] = useState<'show' | 'confirm'>('show')
  const [typed, setTyped] = useState<string[]>(() => positions.map(() => ''))
  const [wrong, setWrong] = useState<boolean[] | null>(null)

  const verify = () => {
    const result = checkConfirmation(words, positions, typed)
    if (result.every(Boolean)) onConfirmed()
    else setWrong(result.map((ok) => !ok))
  }

  if (step === 'show') {
    return (
      <div className="flex flex-col gap-4" data-testid="recovery-setup-show">
        <h1 className="title text-3xl">Seu código de recuperação</h1>
        <Warning />
        <Card title="Suas 12 palavras, em ordem">
          <Words words={words} />
        </Card>
        <Button onClick={() => setStep('confirm')}>Anotei, continuar</Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4" data-testid="recovery-setup-confirm">
      <h1 className="title text-3xl">Confira o que anotou</h1>
      <p className="text-sm leading-relaxed text-muted">Digite as palavras pedidas, olhando para o papel. Isso mostra que o código foi anotado direito.</p>
      <Card>
        <div className="flex flex-col gap-3">
          {positions.map((p, i) => (
            <label key={p} className="flex flex-col gap-1 text-sm">
              <span className="font-semibold">Palavra nº {p + 1}</span>
              <input
                className={`min-h-12 rounded-xl bg-surface-2 px-3 text-base ring-1 ${wrong?.[i] ? 'ring-loss' : 'ring-line'}`}
                value={typed[i]}
                autoCapitalize="none"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                onChange={(e) => {
                  setTyped(typed.map((t, j) => (j === i ? e.target.value : t)))
                  setWrong(null)
                }}
              />
              {wrong?.[i] && <span className="text-xs text-loss">Não confere com a palavra nº {p + 1}.</span>}
            </label>
          ))}
        </div>
      </Card>
      {wrong && <p className="text-sm text-loss">Alguma palavra não confere. Veja o código de novo e confira o papel antes de tentar outra vez.</p>}
      <Button onClick={verify} disabled={typed.some((t) => t.trim() === '')}>
        Confirmar
      </Button>
      <Button
        variant="secondary"
        onClick={() => {
          setStep('show')
          setWrong(null)
        }}
      >
        Ver o código de novo
      </Button>
    </div>
  )
}

/**
 * Pelo menu, depois: o código só aparece depois de um toque (para não ficar à vista de quem olha a tela), com o mesmo aviso.
 * Só existe enquanto o aparelho tem a identidade; sem ela, o menu não oferece este item.
 */
/** Quanto tempo o código fica visível antes de se esconder sozinho. */
export const CODE_VISIBLE_MS = 30_000

export function RecoveryCodeView({ words, onBack }: { words: readonly string[]; onBack: () => void }) {
  const [shown, setShown] = useState(false)
  // Some sozinho depois de 30 s (ou ao sair da tela), para não ficar à vista de quem olha.
  useEffect(() => {
    if (!shown) return
    const t = setTimeout(() => setShown(false), CODE_VISIBLE_MS)
    return () => clearTimeout(t)
  }, [shown])
  return (
    <div className="flex flex-col gap-4" data-testid="recovery-view">
      <div className="flex items-center justify-between">
        <h1 className="title text-3xl">Código de recuperação</h1>
        <button type="button" className="min-h-12 rounded-lg px-3 text-sm text-muted hover:bg-surface" onClick={onBack}>
          Voltar
        </button>
      </div>
      <Warning />
      {shown ? (
        <>
          <Card title="Suas 12 palavras, em ordem">
            <Words words={words} />
          </Card>
          <p className="text-center text-xs text-muted">Esconde sozinho em 30 segundos.</p>
          <Button variant="secondary" onClick={() => setShown(false)}>
            Esconder agora
          </Button>
        </>
      ) : (
        <Button onClick={() => setShown(true)}>Mostrar o código</Button>
      )}
    </div>
  )
}
