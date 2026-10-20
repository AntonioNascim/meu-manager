import { useCallback, useEffect, useRef, useState } from 'react'
import type { EntityKind, PlayerList } from '../../../data/package/edit/ops'
import type { DataPackage } from '../../../data/package/types'
import { putPackage } from '../../../store/saves'
import { Button } from '../../components/ui'
import { downloadText } from '../../download'
import { TopTabs } from '../../theme/TopTabs'
import { ClubsTab } from './ClubsTab'
import { CupsTab } from './CupsTab'
import { IssuesTab } from './IssuesTab'
import { LeaguesTab } from './LeaguesTab'
import { PackageTab } from './PackageTab'
import { PlayersTab } from './PlayersTab'
import { SheetsTab } from './SheetsTab'
import { SmallButton } from './fields'
import type { TabId, TabProps } from './parts'
import { useEditor, useValidation } from './useEditor'

export interface EditedPackage {
  id: string
  data: DataPackage
}

type Selected = TabProps['selected']
const NONE: Selected = { leagues: null, clubs: null, players: null, cups: null }
const AUTOSAVE_MS = 2000

const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'pacote'

/** Área de edição de um pacote: abas, desfazer, validação em tempo real, gravação automática no navegador e exportação. */
export function Workspace({ initial, id: initialId, onClose, onPlay, initialTab }: { initial: DataPackage; id: string | null; onClose: () => void; onPlay: (chosen: EditedPackage) => void; initialTab?: string | undefined }) {
  const editor = useEditor(initial)
  const { pkg } = editor
  const validation = useValidation(pkg)
  const [tab, setTab] = useState<TabId>((['leagues', 'clubs', 'players', 'cups', 'sheets', 'issues'] as const).find((t) => t === initialTab) ?? 'package')
  const [selected, setSelected] = useState<Selected>(NONE)
  const [playerList, setPlayerList] = useState<PlayerList>('players')
  const [clubFilter, setClubFilter] = useState<string | null>(null)
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>(initialId ? 'saved' : 'idle')
  const lastSaved = useRef<DataPackage>(initial)
  const idRef = useRef<string | null>(initialId)

  const save = useCallback(async (data: DataPackage): Promise<string | null> => {
    const id = idRef.current ?? `pkg-ed-${Date.now().toString(36)}`
    setStatus('saving')
    try {
      await putPackage(id, data)
      idRef.current = id
      lastSaved.current = data
      setStatus('saved')
      return id
    } catch {
      setStatus('error')
      return null
    }
  }, [])

  // Gravação automática: um instante depois da última edição.
  useEffect(() => {
    if (pkg === lastSaved.current) return
    setStatus('idle')
    const timer = setTimeout(() => void save(pkg), AUTOSAVE_MS)
    return () => clearTimeout(timer)
  }, [pkg, save])

  const select: TabProps['select'] = (kind, index) => setSelected((s) => ({ ...s, [kind]: index }))
  const goTo: TabProps['goTo'] = (kind: EntityKind, index, options) => {
    if (options && 'clubFilter' in options) setClubFilter(options.clubFilter ?? null)
    if (kind === 'countries') return setTab('package')
    if (kind === 'academy') {
      setPlayerList('academy')
      setTab('players')
      if (index >= 0) select('players', index)
      return
    }
    if (kind === 'players') setPlayerList('players')
    setTab(kind)
    select(kind, index >= 0 ? index : null)
  }

  const tabProps: TabProps = { editor, validation, selected, select, goTo, playerList, setPlayerList, clubFilter, setClubFilter }
  const errorCount = validation.report.errors.length + (validation.report.more ?? 0)
  const valid = !validation.pending && errorCount === 0

  const leave = async () => {
    if (pkg !== lastSaved.current) await save(pkg)
    onClose()
  }
  const play = async () => {
    const id = await save(pkg)
    if (id) onPlay({ id, data: pkg })
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-[96rem] flex-col bg-bg px-3 pb-10 text-slate-100 sm:px-5" data-testid="editor">
      <header className="-mx-3 space-y-2 border-b border-line bg-bg/95 px-3 py-2 backdrop-blur sm:sticky sm:top-0 sm:z-20 sm:-mx-5 sm:px-5">
        <div className="flex items-center gap-2">
          <button type="button" className="min-h-10 shrink-0 rounded-lg px-3 text-xs font-bold uppercase tracking-wider text-muted hover:bg-surface" onClick={() => void leave()}>
            ← Sair
          </button>
          <div className="title min-w-0 flex-1 truncate text-xl" title={pkg.name}>
            {pkg.name}
          </div>
        </div>
        <div className="text-xs text-muted">
          {pkg.clubs.length} clubes · {pkg.players.length} jogadores · {pkg.leagues.length} ligas
          <span className="ml-2">{status === 'saving' ? '· salvando…' : status === 'saved' ? '· salvo neste navegador' : status === 'error' ? <span className="text-loss">· não salvou</span> : '· alterações não salvas'}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SmallButton disabled={!editor.canUndo} onClick={editor.undo} title="Desfazer (Ctrl+Z)">
            <span aria-hidden>↶</span>
            <span className="hidden sm:inline"> Desfazer</span>
            <span className="sr-only sm:hidden">Desfazer</span>
          </SmallButton>
          <SmallButton disabled={!editor.canRedo} onClick={editor.redo} title="Refazer (Ctrl+Y)">
            <span aria-hidden>↷</span>
            <span className="hidden sm:inline"> Refazer</span>
            <span className="sr-only sm:hidden">Refazer</span>
          </SmallButton>
          <button type="button" onClick={() => setTab('issues')} className={`min-h-10 rounded-lg px-3 text-sm font-bold ring-1 ${validation.pending ? 'text-muted ring-line' : valid ? 'bg-win/10 text-win ring-win/40' : 'bg-loss/10 text-loss ring-loss/40'}`}>
            {validation.pending ? 'Conferindo…' : valid ? '✓ Válido' : `${errorCount} erro(s)`}
          </button>
          <SmallButton
            onClick={() => {
              downloadText(`${slug(pkg.name)}.json`, JSON.stringify(pkg))
            }}
          >
            Exportar
          </SmallButton>
          <Button className="!min-h-10 !px-4 text-sm" disabled={!valid} onClick={() => void play()}>
            <span className="sm:hidden">Novo jogo</span>
            <span className="hidden sm:inline">Novo jogo com este pacote</span>
          </Button>
        </div>
        <TopTabs
          scroll
          value={tab}
          onChange={setTab}
          options={[
            { id: 'package', label: 'Pacote' },
            { id: 'leagues', label: 'Ligas', alert: validation.count('leagues') > 0 },
            { id: 'clubs', label: 'Clubes', alert: validation.count('clubs') > 0 },
            { id: 'players', label: 'Jogadores', alert: validation.count('players') + validation.count('academy') > 0 },
            { id: 'cups', label: 'Copas', alert: validation.count('cups') > 0 },
            { id: 'sheets', label: 'Planilhas' },
            { id: 'issues', label: errorCount > 0 ? `Problemas (${errorCount})` : 'Problemas' },
          ]}
        />
      </header>

      <main className="flex-1 pt-4">
        {tab === 'package' && <PackageTab {...tabProps} />}
        {tab === 'leagues' && <LeaguesTab {...tabProps} />}
        {tab === 'clubs' && <ClubsTab {...tabProps} />}
        {tab === 'players' && <PlayersTab {...tabProps} />}
        {tab === 'cups' && <CupsTab {...tabProps} />}
        {tab === 'sheets' && <SheetsTab {...tabProps} />}
        {tab === 'issues' && <IssuesTab {...tabProps} />}
      </main>
    </div>
  )
}
