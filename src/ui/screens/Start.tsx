import { useCallback, useEffect, useRef, useState } from 'react'
import { SLOT_COUNT } from '../../store/saveFormat'
import type { SaveSummary } from '../../store/saveFormat'
import { markSaved } from '../../store/autosave'
import { openGame } from '../../store/gameStore'
import { exportSlot, importSave, parseSaveFile } from '../../store/saveFile'
import { deleteSlot, latestSlot, listSlots, loadSlot } from '../../store/saves'
import { PackageUpdateBanner } from '../components/PackageUpdateBanner'
import { PwaBanner } from '../components/PwaBanner'
import { SlotInfo } from '../components/SlotInfo'
import { SlotPicker } from '../components/SlotPicker'
import { Button, Card } from '../components/ui'
import { downloadText } from '../download'
import { ImportPackage } from './ImportPackage'
import type { ChosenPackage } from './ImportPackage'
import { Credits } from './Credits'
import { NewGame } from './NewGame'
import { Editor } from './editor/Editor'
import { OnlineArea } from './online/OnlineArea'
import type { OnlineView } from './online/OnlineArea'
import { cloudState, useAccount } from '../../store/onlineAccount'
import type { CloudSlotState } from '../../store/cloudState'

type View = 'menu' | 'new' | 'load' | 'package' | 'editor' | 'credits' | 'online'

/** Atalhos de desenvolvimento: `/?menu=criar|entrar|nuvem|dados|codigo` abre a tela da conta online. */
const DEV_ONLINE: Record<string, OnlineView> = { criar: 'create', entrar: 'recover', nuvem: 'cloud', dados: 'data', codigo: 'code' }

/** Tela inicial: continuar o último save, começar um jogo novo ou carregar/excluir um dos 3 espaços. */
export function Start() {
  // Em desenvolvimento, /?editor=zero|padrao|15|21 abre o editor direto (&aba=leagues|clubs|players|cups|sheets|issues); /?menu=novo|creditos abre essas telas.
  const [view, setView] = useState<View>(() => {
    if (!import.meta.env.DEV || typeof window === 'undefined') return 'menu'
    const params = new URLSearchParams(window.location.search)
    if (params.get('editor')) return 'editor'
    if (DEV_ONLINE[params.get('menu') ?? '']) return 'online'
    return params.get('menu') === 'novo' ? 'new' : params.get('menu') === 'creditos' ? 'credits' : 'menu'
  })
  const [onlineStart, setOnlineStart] = useState<OnlineView>(() => {
    if (!import.meta.env.DEV || typeof window === 'undefined') return 'create'
    return DEV_ONLINE[new URLSearchParams(window.location.search).get('menu') ?? ''] ?? 'create'
  })
  const { account } = useAccount()
  const [cloudStates, setCloudStates] = useState<CloudSlotState[]>([])
  useEffect(() => {
    if (account && view === 'menu') void cloudState.all().then(setCloudStates)
  }, [account, view])
  const openOnline = (to: OnlineView) => {
    setOnlineStart(to)
    setView('online')
  }
  const [slots, setSlots] = useState<(SaveSummary | null)[] | null>(null)
  const [latest, setLatest] = useState<SaveSummary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  /** Texto do arquivo importado, esperando a escolha do espaço. */
  const [imported, setImported] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  /** Pacote de dados escolhido para o jogo novo (sem ele, o mundo fictício padrão). */
  const [dataPackage, setDataPackage] = useState<ChosenPackage | undefined>(undefined)

  const refresh = useCallback(async () => {
    try {
      setSlots(await listSlots())
      setLatest(await latestSlot())
    } catch {
      setSlots(Array.from({ length: SLOT_COUNT }, () => null))
      setError('Não foi possível ler os saves deste navegador.')
    }
  }, [])
  useEffect(() => {
    void refresh()
  }, [refresh])

  const open = async (slot: number) => {
    setBusy(true)
    setError(null)
    try {
      const game = await loadSlot(slot)
      markSaved(game)
      openGame(game, slot)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível abrir o save.')
      setBusy(false)
    }
  }

  const remove = async (summary: SaveSummary) => {
    if (!window.confirm(`Excluir o save do espaço ${summary.slot} (${summary.teamName}, temporada ${summary.label ?? summary.year})? Isso não pode ser desfeito.`)) return
    await deleteSlot(summary.slot)
    await refresh()
  }

  const pickFile = async (file: File | undefined) => {
    if (!file) return
    setError(null)
    setMessage(null)
    try {
      const text = await file.text()
      parseSaveFile(text)
      setImported(text)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível ler o arquivo.')
    } finally {
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  const finishImport = async (slot: number) => {
    if (imported === null) return
    try {
      const summary = await importSave(imported, slot)
      setMessage(`Save de ${summary.teamName} (temporada ${summary.label ?? summary.year}) importado para o espaço ${slot}.`)
      setImported(null)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível importar o save.')
      setImported(null)
    }
  }

  const exportFile = async (slot: number) => {
    setError(null)
    try {
      const file = await exportSlot(slot)
      downloadText(file.filename, file.json)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível exportar o save.')
    }
  }

  if (view === 'new') return <NewGame slots={slots} {...(dataPackage ? { dataPackage } : {})} onBack={() => { setDataPackage(undefined); setView('menu'); void refresh() }} />
  if (view === 'credits') return <Credits onBack={() => setView('menu')} />
  if (view === 'online') return <OnlineArea start={onlineStart} onClose={() => { setView('menu'); void refresh() }} />
  if (view === 'editor') return <Editor onBack={() => setView('menu')} onPlay={(chosen) => { setDataPackage(chosen); setView('new') }} />
  if (view === 'package') return <ImportPackage onBack={() => setView('menu')} onUse={(chosen) => { setDataPackage(chosen); setView('new') }} />

  return (
    <>
      <PwaBanner />
      <PackageUpdateBanner />
      <div className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-4 bg-bg px-4 py-8 text-slate-100">
      <div className="flex flex-col items-center gap-3 pb-3 text-center">
        <img src="icons/icon-192.png" alt="" width={72} height={72} className="rounded-2xl" />
        <h1 className="title text-6xl">Meu Manager</h1>
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-muted">Jogo de técnico de futebol</p>
      </div>

      {view === 'menu' && (
        <div className="space-y-3">
          {latest && (
            <Card title="Continuar">
              <div className="flex items-center gap-3">
                <SlotInfo summary={latest} />
                {cloudStates[latest.slot - 1]?.enabled && <span className="rounded-full border border-win/50 px-2.5 py-1 text-[11px] font-bold text-win">Na nuvem</span>}
              </div>
              <Button className="mt-3 w-full" disabled={busy} onClick={() => void open(latest.slot)}>
                Continuar
              </Button>
            </Card>
          )}
          <Button className="w-full" variant={latest ? 'secondary' : 'primary'} onClick={() => setView('new')}>
            Novo jogo
          </Button>
          <Button className="w-full" variant="secondary" onClick={() => setView('package')}>
            Novo jogo com pacote de dados
          </Button>
          <Button className="w-full" variant="secondary" onClick={() => setView('editor')}>
            Editor
          </Button>
          <Button className="w-full" variant="secondary" disabled={!latest} onClick={() => setView('load')}>
            Carregar
          </Button>
          <Button className="w-full" variant="secondary" onClick={() => fileInput.current?.click()}>
            Importar save de um arquivo
          </Button>
          <Card title="Online">
            {account ? (
              <div className="flex flex-col gap-2" data-testid="online-account">
                <p className="font-semibold">{account.nickname ?? 'Conta online'}</p>
                <p className="text-xs text-muted">Conta online · criada em {new Date(account.createdAt).toLocaleDateString('pt-BR')}</p>
                <Button variant="secondary" onClick={() => openOnline('cloud')}>
                  Saves na nuvem{cloudStates.length > 0 ? ` (${cloudStates.filter((c) => c.enabled).length} de ${SLOT_COUNT})` : ''}
                </Button>
                <Button variant="secondary" onClick={() => openOnline('code')}>
                  Código de recuperação{account.codeConfirmed ? '' : ' — anote!'}
                </Button>
                <Button variant="secondary" onClick={() => openOnline('data')}>
                  Dados e conta
                </Button>
              </div>
            ) : (
              <div className="flex flex-col gap-2" data-testid="online-no-account">
                <p className="text-sm text-muted">Saves na nuvem e, em breve, ligas entre jogadores. Sem e-mail e sem senha: a sua conta é um apelido e um código de 12 palavras que fica com você.</p>
                <Button onClick={() => openOnline('create')}>Criar minha conta online</Button>
                <button type="button" className="min-h-12 text-sm text-muted underline" onClick={() => openOnline('recover')}>
                  Já tem uma conta? Entrar com o código de recuperação
                </button>
              </div>
            )}
          </Card>
          <Button className="w-full" variant="secondary" onClick={() => setView('credits')}>
            Créditos e avisos
          </Button>
        </div>
      )}

      {view === 'load' && (
        <div className="space-y-3">
          {Array.from({ length: SLOT_COUNT }, (_, i) => {
            const summary = slots?.[i] ?? null
            return (
              <Card key={i} title={`Espaço ${i + 1}`}>
                {summary ? (
                  <>
                    <SlotInfo summary={summary} />
                    <div className="mt-3 flex gap-2">
                      <Button className="flex-1" disabled={busy} onClick={() => void open(summary.slot)}>
                        Carregar
                      </Button>
                      <Button variant="secondary" onClick={() => void exportFile(summary.slot)}>
                        Exportar
                      </Button>
                      <Button variant="secondary" onClick={() => void remove(summary)}>
                        Excluir
                      </Button>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-slate-500">Vazio</p>
                )}
              </Card>
            )
          })}
          <Button className="w-full" variant="secondary" onClick={() => fileInput.current?.click()}>
            Importar save de um arquivo
          </Button>
          <Button className="w-full" variant="secondary" onClick={() => setView('menu')}>
            Voltar
          </Button>
        </div>
      )}

      <input ref={fileInput} type="file" accept=".json,application/json" className="hidden" onChange={(e) => void pickFile(e.target.files?.[0])} />
      {message && <p className="text-center text-sm text-win">{message}</p>}
      {error && <p className="text-center text-sm text-loss">{error}</p>}
      {imported !== null && <SlotPicker title="Em qual espaço guardar o save importado?" slots={slots} onCancel={() => setImported(null)} onPick={(slot) => void finishImport(slot)} />}
      </div>
    </>
  )
}
