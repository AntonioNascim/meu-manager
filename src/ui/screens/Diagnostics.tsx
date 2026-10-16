import { useEffect, useState } from 'react'
import { REFERENCE_TARGETS, formatReport, measureWorld, readDevice } from '../../diagnostics/measure'
import type { DeviceInfo, Measurement, WorldChoice } from '../../diagnostics/measure'

/** Tela escondida (`?diagnostico=1`): mede o desempenho no próprio aparelho e mostra um texto para copiar. Não usa nem altera o jogo salvo. */
export function Diagnostics() {
  const [device, setDevice] = useState<DeviceInfo | null>(null)
  const [world, setWorld] = useState<WorldChoice>('full')
  const [note, setNote] = useState('')
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState('')
  const [report, setReport] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    void readDevice().then(setDevice)
  }, [])

  const run = async (maxAdvances?: number) => {
    if (!device || running) return
    setRunning(true)
    setReport('')
    setCopied(false)
    setProgress('Gerando o mundo de teste...')
    // Dá a vez à tela entre os avanços; esse tempo não entra nas medidas.
    const yieldToUi = () => new Promise<void>((resolve) => setTimeout(resolve, 0))
    await yieldToUi()
    let result: Measurement
    try {
      result = await measureWorld({ world, ...(maxAdvances ? { maxAdvances } : {}), yieldToUi, onProgress: (done, date) => setProgress(`Avanço ${done} (${date.split('-').reverse().join('/')})`) })
    } catch (e) {
      setProgress(`Erro: ${(e as Error).message}`)
      setRunning(false)
      return
    }
    setReport(formatReport(device, result, note))
    setProgress('Pronto.')
    setRunning(false)
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(report)
      setCopied(true)
    } catch {
      // sem permissão para copiar: o texto continua selecionável na caixa
      document.querySelector<HTMLTextAreaElement>('#diag-report')?.select()
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-4 bg-bg p-4">
      <h1 className="title text-2xl">Diagnóstico de desempenho</h1>
      <p className="text-sm text-muted">
        Gera um mundo de teste do tamanho do plano (282 clubes) e mede neste aparelho. Não mexe nos seus jogos salvos. Aparelho de referência: {REFERENCE_TARGETS.device}.
      </p>

      <section className="rounded-xl border border-line bg-surface p-3 text-sm">
        <h2 className="title mb-2 text-base">Este aparelho</h2>
        {device ? (
          <dl className="grid grid-cols-[7rem_1fr] gap-x-2 gap-y-1">
            <dt className="text-muted">Modelo</dt>
            <dd>{device.model}</dd>
            <dt className="text-muted">Sistema</dt>
            <dd>{device.platform}</dd>
            <dt className="text-muted">Navegador</dt>
            <dd>{device.browser}</dd>
            <dt className="text-muted">Núcleos</dt>
            <dd>{device.cores ?? 'indisponível'}</dd>
            <dt className="text-muted">Memória</dt>
            <dd>{device.memoryGb !== null ? `${device.memoryGb} GB` : 'indisponível'}</dd>
            <dt className="text-muted">Velocidade</dt>
            <dd>{device.speedIndex ?? 'indisponível'}</dd>
          </dl>
        ) : (
          <p className="text-muted">Lendo o aparelho...</p>
        )}
        <label className="mt-3 block text-muted" htmlFor="diag-note">
          Nome do aparelho (se o modelo acima não aparece, escreva: ex. Moto G22)
        </label>
        <input id="diag-note" value={note} onChange={(e) => setNote(e.target.value)} className="mt-1 min-h-12 w-full rounded-lg border border-line bg-bg px-3" placeholder="Marca e modelo" />
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex gap-2" role="radiogroup" aria-label="Mundo de teste">
          {(['full', 'brazil'] as const).map((w) => (
            <button key={w} type="button" role="radio" aria-checked={world === w} disabled={running} onClick={() => setWorld(w)} className={`min-h-12 flex-1 rounded-lg border px-3 text-sm ${world === w ? 'border-accent text-accent' : 'border-line text-muted'}`}>
              {w === 'full' ? '282 clubes (15 ligas)' : 'Brasil A+B+C (60)'}
            </button>
          ))}
        </div>
        <button type="button" disabled={!device || running} onClick={() => void run()} className="min-h-12 rounded-lg bg-accent px-4 font-semibold text-accent-ink disabled:opacity-50">
          Medir uma temporada inteira
        </button>
        <button type="button" disabled={!device || running} onClick={() => void run(10)} className="min-h-12 rounded-lg border border-line px-4 disabled:opacity-50">
          Medida rápida (10 avanços)
        </button>
        <p className="min-h-5 text-sm text-muted" aria-live="polite">
          {progress}
        </p>
      </section>

      {report && (
        <section className="flex flex-col gap-2">
          <textarea id="diag-report" readOnly value={report} rows={20} className="w-full rounded-lg border border-line bg-surface p-2 font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
          <button type="button" onClick={() => void copy()} className="min-h-12 rounded-lg bg-accent px-4 font-semibold text-accent-ink">
            {copied ? 'Copiado!' : 'Copiar resultado'}
          </button>
        </section>
      )}
    </main>
  )
}
