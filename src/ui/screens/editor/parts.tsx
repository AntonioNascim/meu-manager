import type { ReactNode } from 'react'
import type { PackageIssue } from '../../../data/package/types'
import type { EntityKind, PlayerList } from '../../../data/package/edit/ops'
import type { EditorApi, Validation } from './useEditor'
import { packageIssueText } from '../../labels'

export type TabId = 'package' | 'leagues' | 'clubs' | 'players' | 'cups' | 'sheets' | 'issues'

/** O que cada aba precisa para editar e navegar. */
export interface TabProps {
  editor: EditorApi
  validation: Validation
  /** Linha selecionada em cada lista (índice no pacote). */
  selected: Record<'leagues' | 'clubs' | 'players' | 'cups', number | null>
  select(kind: 'leagues' | 'clubs' | 'players' | 'cups', index: number | null): void
  /** Vai para a entidade (outra aba, com ela selecionada). */
  goTo(kind: EntityKind, index: number, options?: { clubFilter?: string | null }): void
  /** Lista de jogadores mostrada (elenco ou base) e filtro de clube vindo de outra aba. */
  playerList: PlayerList
  setPlayerList(list: PlayerList): void
  clubFilter: string | null
  setClubFilter(id: string | null): void
}

/** Lista à esquerda e detalhe à direita; no celular aparece um de cada vez. */
export function MasterDetail({ list, detail, hasSelection, onBack, empty }: { list: ReactNode; detail: ReactNode; hasSelection: boolean; onBack: () => void; empty: string }) {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(20rem,26rem)_minmax(0,1fr)]">
      <div className={`min-w-0 ${hasSelection ? 'hidden lg:block' : ''}`}>{list}</div>
      <div className={`min-w-0 space-y-4 ${hasSelection ? '' : 'hidden lg:block'}`}>
        {hasSelection ? (
          <>
            <button type="button" className="min-h-10 rounded-lg px-2 text-sm font-bold text-muted hover:bg-surface lg:hidden" onClick={onBack}>
              ← Voltar à lista
            </button>
            {detail}
          </>
        ) : (
          <p className="rounded-2xl border border-dashed border-line p-8 text-center text-sm text-muted">{empty}</p>
        )}
      </div>
    </div>
  )
}

export function EntityIssues({ validation, kind, index }: { validation: Validation; kind: EntityKind; index: number }) {
  const issues = validation.byEntity.get(`${kind}:${index}`) ?? []
  if (issues.length === 0) return null
  return (
    <ul className="space-y-1 rounded-xl border border-loss/40 bg-loss/10 p-3 text-sm text-loss" data-testid="entity-issues">
      {issues.map((issue: PackageIssue, i) => (
        <li key={i} className={validation.report.warnings.includes(issue) ? 'text-amber-300' : ''}>
          {packageIssueText(issue)}
        </li>
      ))}
    </ul>
  )
}

/** Bolinha vermelha de erro (ou âmbar de aviso) numa linha de lista. */
export function IssueDot({ validation, kind, index }: { validation: Validation; kind: EntityKind; index: number }) {
  const issues = validation.byEntity.get(`${kind}:${index}`)
  if (!issues || issues.length === 0) return null
  const error = issues.some((i) => validation.report.errors.includes(i))
  return <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${error ? 'bg-loss' : 'bg-amber-300'}`} role="img" aria-label={error ? 'Tem erro' : 'Tem aviso'} />
}

export function ListRow({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={`flex min-h-12 w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition ${active ? 'bg-surface-2 ring-1 ring-accent' : 'hover:bg-surface-2'}`}>
      {children}
    </button>
  )
}
