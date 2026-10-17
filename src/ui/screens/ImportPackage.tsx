import { useCallback, useEffect, useRef, useState } from 'react'
import { parsePackage } from '../../data/package/validate'
import type { DataPackage, PackageReport } from '../../data/package/types'
import { deletePackage, listPackages, loadPackage, savePackage } from '../../store/saves'
import type { PackageRow } from '../../store/saves'
import { Button, Card } from '../components/ui'
import { packageIssueText } from '../labels'

/** Pacote escolhido: o conteúdo e a referência guardada no navegador. */
export interface ChosenPackage {
  id: string
  data: DataPackage
}

/** Quantos problemas aparecem na lista (o resto vira "e mais N"). */
const SHOWN = 8

function Issues({ report }: { report: PackageReport }) {
  const hidden = Math.max(0, report.errors.length - SHOWN) + (report.more ?? 0)
  return (
    <div className="space-y-2" data-testid="package-issues">
      {report.errors.length > 0 && (
        <ul className="space-y-1.5 rounded-xl border border-loss/40 bg-loss/10 p-3 text-sm text-loss">
          {report.errors.slice(0, SHOWN).map((issue, i) => (
            <li key={i}>{packageIssueText(issue)}</li>
          ))}
          {hidden > 0 && <li className="font-bold">… e mais {hidden} problema(s).</li>}
        </ul>
      )}
      {report.warnings.length > 0 && (
        <ul className="space-y-1.5 rounded-xl border border-amber-300/40 bg-amber-300/10 p-3 text-sm text-amber-300">
          {report.warnings.map((issue, i) => (
            <li key={i}>{packageIssueText(issue)}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Novo jogo com pacote de dados: lê um arquivo do aparelho, valida e mostra o que falta; o pacote fica só neste navegador. */
export function ImportPackage({ onBack, onUse }: { onBack: () => void; onUse: (chosen: ChosenPackage) => void }) {
  const fileInput = useRef<HTMLInputElement>(null)
  const [report, setReport] = useState<PackageReport | null>(null)
  const [pkg, setPkg] = useState<DataPackage | null>(null)
  const [fileName, setFileName] = useState('')
  const [saved, setSaved] = useState<Omit<PackageRow, 'data'>[]>([])
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      setSaved(await listPackages())
    } catch {
      setSaved([])
    }
  }, [])
  useEffect(() => {
    void refresh()
  }, [refresh])

  const pick = async (file: File | undefined) => {
    if (!file) return
    setError(null)
    setPkg(null)
    setReport(null)
    setFileName(file.name)
    try {
      const result = parsePackage(await file.text())
      setReport(result.report)
      if (result.pkg) setPkg(result.pkg)
    } catch {
      setError('Não foi possível ler o arquivo.')
    } finally {
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  const use = async (data: DataPackage) => {
    setError(null)
    try {
      const row = await savePackage(data)
      onUse({ id: row.id, data })
    } catch {
      setError('Não foi possível guardar o pacote neste navegador.')
    }
  }

  const useSaved = async (id: string) => {
    setError(null)
    const row = await loadPackage(id)
    if (!row) return setError('Esse pacote não está mais guardado neste navegador.')
    onUse({ id: row.id, data: row.data })
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col gap-4 bg-bg px-4 py-8 text-slate-100">
      <div className="flex items-center justify-between">
        <h1 className="title text-4xl">Pacote de dados</h1>
        <button type="button" className="min-h-12 rounded-lg px-3 text-sm text-muted hover:bg-surface" onClick={onBack}>
          Voltar
        </button>
      </div>
      <p className="text-sm text-muted">
        Escolha um arquivo de pacote (.json) deste aparelho. Ele fica guardado só neste navegador, junto com os seus saves, e nunca é enviado a lugar nenhum. O pacote pode ter vários países, cada um com de 1 a 3 divisões.
      </p>

      <Button className="w-full" onClick={() => fileInput.current?.click()}>
        Escolher arquivo
      </Button>
      <input ref={fileInput} type="file" accept=".json,application/json" className="hidden" data-testid="package-file" onChange={(e) => void pick(e.target.files?.[0])} />

      {report && (
        <Card title={fileName ? `Arquivo: ${fileName}` : 'Arquivo'}>
          {pkg ? (
            <div className="space-y-2 text-sm" data-testid="package-ok">
              <div className="title text-3xl">{pkg.name}</div>
              <div className="text-muted">
                {pkg.clubs.length} clubes · {pkg.players.length} jogadores · {pkg.countries.length} {pkg.countries.length === 1 ? 'país' : 'países'} · {pkg.leagues.length} divisões · temporada {pkg.startYear ?? 2026}
              </div>
              {pkg.credits && <p className="text-xs text-muted">Créditos: {pkg.credits}</p>}
              {report.warnings.length > 0 && <Issues report={{ errors: [], warnings: report.warnings }} />}
              <Button className="mt-2 w-full" onClick={() => void use(pkg)}>
                Escolher o time
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="font-bold text-loss">Este pacote não pode ser usado.</p>
              <Issues report={report} />
            </div>
          )}
        </Card>
      )}

      {saved.length > 0 && (
        <Card title="Pacotes guardados neste navegador">
          <ul className="divide-y divide-line">
            {saved.map((row) => (
              <li key={row.id} className="flex items-center gap-2 py-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-bold">{row.name}</div>
                  <div className="text-xs text-muted">
                    {row.clubs} clubes · {row.players} jogadores
                  </div>
                </div>
                <Button variant="secondary" className="!min-h-10 !px-3 text-sm" onClick={() => void useSaved(row.id)}>
                  Usar
                </Button>
                <Button
                  variant="secondary"
                  className="!min-h-10 !px-3 text-sm"
                  onClick={() => {
                    if (window.confirm(`Apagar o pacote "${row.name}" deste navegador? Saves que já usam esse pacote continuam funcionando.`)) void deletePackage(row.id).then(refresh)
                  }}
                >
                  Apagar
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {error && <p className="text-center text-sm text-loss">{error}</p>}
    </div>
  )
}
