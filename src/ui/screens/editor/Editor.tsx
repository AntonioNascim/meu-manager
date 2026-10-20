import { useCallback, useEffect, useRef, useState } from 'react'
import { defaultPackage } from '../../../data/package/defaultPackage'
import { addClub, addCountry, addLeague, emptyPackage, normalizeForEditing, syncTeamCounts } from '../../../data/package/edit/ops'
import type { DataPackage } from '../../../data/package/types'
import { deletePackage, listPackages, loadPackage } from '../../../store/saves'
import type { PackageRow } from '../../../store/saves'
import { Button, Card } from '../../components/ui'
import { Workspace } from './Workspace'
import type { EditedPackage } from './Workspace'

/** Pacote do zero: o Brasil com uma liga de quatro clubes, já válido. */
function blankPackage(): DataPackage {
  let pkg = addCountry(emptyPackage('Meu pacote'), { id: 'Brazil', name: 'Brasil' })
  pkg = addLeague(pkg, 'Brazil', 'Liga')
  for (let i = 0; i < 4; i++) pkg = addClub(pkg, pkg.leagues[0]!.id)
  return syncTeamCounts(pkg)
}

const TEMPLATES: { id: string; title: string; text: string; make: () => Promise<DataPackage> }[] = [
  { id: 'default', title: 'Mundo padrão', text: 'O mundo fictício do jogo: Brasil com 3 divisões de 20 clubes, com tudo (atributos, base, copas).', make: async () => ({ ...defaultPackage(1), name: 'Mundo padrão (cópia para editar)' }) },
  { id: 'fifteen', title: 'Mundo de 15 ligas', text: '282 clubes em 15 ligas: Brasil (3 divisões), América do Sul e Europa. Sem atributos: o jogo gera.', make: async () => (await import('../../../diagnostics/scalePackage')).buildScalePackage(7, { without: (await import('../../../diagnostics/scalePackage')).FIFTEEN_LEAGUES, name: 'Mundo fictício com 15 ligas' }) },
  { id: 'wide', title: 'Mundo ampliado', text: '358 clubes em 21 ligas, com América do Norte e ligas de elite da África, Ásia e Oceania, e as copas continentais e mundiais.', make: async () => (await import('../../../diagnostics/scalePackage')).buildScalePackage(7) },
  { id: 'blank', title: 'Começar do zero', text: 'Um país, uma liga e quatro clubes com elenco, para ir montando o seu mundo.', make: async () => blankPackage() },
]

/** Menu do editor: escolhe o pacote a editar (modelo, arquivo ou um já guardado no navegador) e abre a área de edição. */
export function Editor({ onBack, onPlay }: { onBack: () => void; onPlay: (chosen: EditedPackage) => void }) {
  const fileInput = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState<{ data: DataPackage; id: string | null } | null>(null)
  const [saved, setSaved] = useState<Omit<PackageRow, 'data'>[]>([])
  const [busy, setBusy] = useState<string | null>(null)
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

  const run = async (label: string, make: () => Promise<{ data: DataPackage; id: string | null }>) => {
    setError(null)
    setBusy(label)
    // Deixa a tela mostrar "Preparando…" antes do trabalho pesado.
    await new Promise((r) => setTimeout(r, 30))
    try {
      setOpen(await make())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível abrir o pacote.')
    } finally {
      setBusy(null)
    }
  }

  const pickFile = async (file: File | undefined) => {
    if (!file) return
    await run('Lendo o arquivo…', async () => {
      const raw = JSON.parse(await file.text()) as Partial<DataPackage>
      if (typeof raw !== 'object' || raw === null || raw.format !== 'meu-manager-package') throw new Error('Este arquivo não é um pacote do Meu Manager.')
      return { data: normalizeForEditing(raw), id: null }
    })
    if (fileInput.current) fileInput.current.value = ''
  }

  if (open) {
    return (
      <Workspace
        key={open.id ?? 'novo'}
        initial={open.data}
        id={open.id}
        onClose={() => {
          setOpen(null)
          void refresh()
        }}
        onPlay={onPlay}
      />
    )
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-4 bg-bg px-4 py-8 text-slate-100">
      <div className="flex items-center justify-between">
        <h1 className="title text-4xl">Editor</h1>
        <button type="button" className="min-h-12 rounded-lg px-3 text-sm text-muted hover:bg-surface" onClick={onBack}>
          Voltar
        </button>
      </div>
      <p className="text-sm text-muted">
        Edite países, ligas, clubes, jogadores e copas de um pacote de dados. O que você edita fica guardado só neste navegador, separado dos saves, e dá para exportar o arquivo ou começar um jogo direto com ele. Pensado para o computador; funciona no celular.
      </p>

      <Card title="Abrir um modelo">
        <div className="grid gap-2 sm:grid-cols-2">
          {TEMPLATES.map((t) => (
            <button key={t.id} type="button" disabled={busy !== null} onClick={() => void run('Preparando o pacote…', async () => ({ data: await t.make(), id: null }))} className="rounded-xl border border-line bg-surface-2 p-3 text-left transition hover:border-accent disabled:opacity-50">
              <div className="font-bold">{t.title}</div>
              <div className="text-xs text-muted">{t.text}</div>
            </button>
          ))}
        </div>
        <div className="mt-3">
          <Button variant="secondary" className="w-full" disabled={busy !== null} onClick={() => fileInput.current?.click()}>
            Abrir um arquivo de pacote (.json)
          </Button>
          <input ref={fileInput} type="file" accept=".json,application/json" className="hidden" data-testid="editor-file" onChange={(e) => void pickFile(e.target.files?.[0])} />
        </div>
      </Card>

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
                <Button
                  variant="secondary"
                  className="!min-h-10 !px-3 text-sm"
                  disabled={busy !== null}
                  onClick={() =>
                    void run('Abrindo…', async () => {
                      const found = await loadPackage(row.id)
                      if (!found) throw new Error('Esse pacote não está mais guardado neste navegador.')
                      return { data: normalizeForEditing(found.data), id: found.id }
                    })
                  }
                >
                  Editar
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

      {busy && <p className="text-center text-sm text-muted">{busy}</p>}
      {error && <p className="text-center text-sm text-loss">{error}</p>}
    </div>
  )
}
