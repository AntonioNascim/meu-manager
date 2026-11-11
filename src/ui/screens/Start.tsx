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
import { Chip, Icon, Logo, TopBar } from '../theme'
import { downloadText } from '../download'
import { ImportPackage } from './ImportPackage'
import type { ChosenPackage } from './ImportPackage'
import { Credits } from './Credits'
import { ReportProblem } from '../components/ReportProblem'
import { NewGame } from './NewGame'
import { Editor } from './editor/Editor'
import { OnlineArea } from './online/OnlineArea'
import type { OnlineView } from './online/OnlineArea'
import { onlineUnlockedHere } from '../../online/gate'
import { cloudState, useAccount } from '../../store/onlineAccount'
import type { CloudSlotState } from '../../store/cloudState'

type View = 'menu' | 'new' | 'load' | 'package' | 'editor' | 'credits' | 'online'

/** Atalhos de desenvolvimento: `/?menu=criar|entrar|nuvem|dados|codigo` abre a tela da conta online. */
const DEV_ONLINE: Record<string, OnlineView> = { criar: 'create', entrar: 'recover', nuvem: 'cloud', dados: 'data', codigo: 'code', ligas: 'leagues' }

/** Código de convite que veio no endereço (`?convite=ABCD2345`): abre direto a tela de entrar na liga. */
const inviteFromUrl = (): string | undefined => (typeof window === 'undefined' || !onlineUnlockedHere() ? undefined : (new URLSearchParams(window.location.search).get('convite') ?? undefined))

/** Tela inicial: continuar o último save, começar um jogo novo ou carregar/excluir um dos 3 espaços. */
export function Start() {
  // Em desenvolvimento, /?editor=zero|padrao|15|21 abre o editor direto (&aba=leagues|clubs|players|cups|sheets|issues); /?menu=novo|creditos abre essas telas.
  const [reporting, setReporting] = useState(false)
  const [view, setView] = useState<View>(() => {
    if (inviteFromUrl()) return 'online'
    if (!import.meta.env.DEV || typeof window === 'undefined') return 'menu'
    const params = new URLSearchParams(window.location.search)
    if (params.get('editor')) return 'editor'
    if (DEV_ONLINE[params.get('menu') ?? '']) return 'online'
    return params.get('menu') === 'novo' ? 'new' : params.get('menu') === 'creditos' ? 'credits' : 'menu'
  })
  const [onlineStart, setOnlineStart] = useState<OnlineView>(() => {
    if (inviteFromUrl()) return 'join-code'
    if (!import.meta.env.DEV || typeof window === 'undefined') return 'create'
    return DEV_ONLINE[new URLSearchParams(window.location.search).get('menu') ?? ''] ?? 'create'
  })
  const { account, loaded } = useAccount()
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
  // Convite no endereço: espera ler a conta do aparelho para saber se pede o cadastro antes.
  if (view === 'online' && inviteFromUrl() && !loaded) return null
  if (view === 'online') return <OnlineArea start={account || !inviteFromUrl() ? onlineStart : 'create'} invite={inviteFromUrl()} onClose={() => { if (inviteFromUrl()) window.history.replaceState(null, '', window.location.pathname); setView('menu'); void refresh() }} />
  if (view === 'editor') return <Editor onBack={() => setView('menu')} onPlay={(chosen) => { setDataPackage(chosen); setView('new') }} />
  if (view === 'package') return <ImportPackage onBack={() => setView('menu')} onUse={(chosen) => { setDataPackage(chosen); setView('new') }} />

  return (
    <>
      <PwaBanner />
      <PackageUpdateBanner />
      <div className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-3 px-4 py-6 text-slate-100">
      {view === 'menu' ? <Logo /> : <TopBar title="Carregar" onBack={() => setView('menu')} />}

      {view === 'menu' && (
        <div className="space-y-3">
          {latest ? (
            <Card>
              <div className="-mx-4 -mt-4 mb-1 flex items-stretch justify-between overflow-hidden rounded-t-[14px] border-b border-white/[0.07] bg-gradient-to-r from-accent/[0.12] to-transparent">
                <span className="inline-flex items-center gap-2 bg-gradient-to-r from-[#1f9a3e] to-[#0c4f1e] py-2 pl-3.5 pr-7 font-display text-[19px] font-bold [clip-path:polygon(0_0,100%_0,calc(100%_-_16px)_100%,0_100%)]">CONTINUAR</span>
                {cloudStates[latest.slot - 1]?.enabled && <span className="m-2 self-center"><Chip tone="c" icon="cloud">Na nuvem</Chip></span>}
              </div>
              <SlotInfo summary={latest} />
              <Button className="w-full" disabled={busy} onClick={() => void open(latest.slot)}>
                Continuar
              </Button>
            </Card>
          ) : (
            <Card className="border-gold/50">
              <h3 className="font-display text-xl font-bold">Comece sua carreira</h3>
              <p className="mb-3 text-[13px] text-muted">Escolha um clube, monte o time e leve o Meu Manager ao título.</p>
              <Button className="w-full uppercase" icon="plus" onClick={() => setView('new')}>
                Novo jogo
              </Button>
            </Card>
          )}
          <div className="grid grid-cols-2 gap-2.5">
            {latest && (
              <Button className="px-2 text-[15px]" variant="secondary" icon="plus" onClick={() => setView('new')}>
                Novo jogo
              </Button>
            )}
            <Button className={`px-2 text-[15px] ${latest ? '' : 'col-span-2'}`} variant="secondary" icon="folder" disabled={!latest} onClick={() => setView('load')}>
              Carregar
            </Button>
          </div>
          <Button className="w-full" variant="outline" icon="down2" onClick={() => setView('package')}>
            Novo jogo com pacote de dados
          </Button>
          <div className="grid grid-cols-2 gap-2.5">
            <Button className="px-2 text-[15px]" variant="secondary" icon="edit" onClick={() => setView('editor')}>
              Editor
            </Button>
            <Button className="px-2 text-[15px]" variant="secondary" icon="up2" onClick={() => fileInput.current?.click()}>
              Importar save de um arquivo
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <Button className="px-2 text-[15px]" variant="secondary" icon="info" onClick={() => setView('credits')}>
              Créditos e avisos
            </Button>
            <Button className="px-2 text-[15px]" variant="secondary" icon="flag" onClick={() => setReporting(true)} data-testid="report-problem">
              Relatar problema
            </Button>
          </div>
          {onlineUnlockedHere() && account && !account.codeConfirmed && (
            <button type="button" onClick={() => openOnline('code')} className="flex min-h-12 w-full items-center justify-between gap-3 rounded-xl border-[1.5px] border-dashed border-white/30 bg-white/[0.03] px-3.5 py-3 text-left text-[13px]" data-testid="code-reminder">
              <span>Guarde o seu código de recuperação: sem ele, trocar de aparelho faz perder a conta.</span>
              <span className="flex flex-none items-center gap-1 font-bold text-accent"><Icon name="eye" size={18} />Ver</span>
            </button>
          )}
          {onlineUnlockedHere() && (
          <Card>
            <div className="flex items-center gap-2.5">
              <Icon name="globe" size={22} className="text-accent" />
              <h3 className="flex-1 font-display text-xl font-bold">Online</h3>
              {account && <Chip tone="g">Conta ativa</Chip>}
            </div>
            {account ? (
              <div className="flex flex-col gap-2.5" data-testid="online-account">
                <div>
                  <p className="font-semibold">{account.nickname ?? 'Conta online'}</p>
                  <p className="text-xs text-muted">Conta online · criada em {new Date(account.createdAt).toLocaleDateString('pt-BR')}</p>
                </div>
                <Button icon="trophy" onClick={() => openOnline('leagues')}>
                  Ligas online
                </Button>
                <div className="grid grid-cols-2 gap-2.5">
                  <Button className="px-2 text-[15px]" variant="secondary" icon="cloud" onClick={() => openOnline('cloud')}>
                    Saves na nuvem{cloudStates.length > 0 ? ` (${cloudStates.filter((c) => c.enabled).length} de ${SLOT_COUNT})` : ''}
                  </Button>
                  <Button className="px-2 text-[15px]" variant="secondary" icon="key" onClick={() => openOnline('code')}>
                    Código de recuperação
                  </Button>
                </div>
                <Button variant="secondary" icon="user" onClick={() => openOnline('data')}>
                  Dados e conta
                </Button>
              </div>
            ) : (
              <div className="flex flex-col gap-2.5" data-testid="online-no-account">
                <p className="text-[13px] text-muted">Ligas entre jogadores e saves na nuvem. Sem e-mail e sem senha: a sua conta é um apelido e um código de recuperação que fica com você.</p>
                <Button icon="user" onClick={() => openOnline('create')}>Criar minha conta online</Button>
                <button type="button" className="flex min-h-12 items-center justify-center gap-2 text-center text-sm text-muted" onClick={() => openOnline('recover')}>
                  <Icon name="key" size={18} />
                  Já tem uma conta? Entrar com o código de recuperação
                </button>
              </div>
            )}
          </Card>
          )}
          {reporting && <ReportProblem context={{ screen: 'menu', mode: account ? 'online' : 'solo', saveSlots: slots?.filter(Boolean).length ?? 0 }} onClose={() => setReporting(false)} />}
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
