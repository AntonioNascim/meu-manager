import { useCallback, useEffect, useMemo, useState } from 'react'
import { commit, createHistory, redo, undo } from '../../../data/package/edit/history'
import type { History } from '../../../data/package/edit/history'
import { locateIssue } from '../../../data/package/edit/ops'
import type { EntityKind } from '../../../data/package/edit/ops'
import type { DataPackage, PackageIssue, PackageReport } from '../../../data/package/types'
import { validatePackage } from '../../../data/package/validate'

export interface EditorApi {
  pkg: DataPackage
  /** Aplica uma edição; edições seguidas com a mesma `key` viram um passo só no desfazer. */
  edit(fn: (pkg: DataPackage) => DataPackage, key?: string): void
  undo(): void
  redo(): void
  canUndo: boolean
  canRedo: boolean
  /** Muda o pacote sem registrar no desfazer (abrir outro). */
  replace(pkg: DataPackage): void
}

export function useEditor(initial: DataPackage): EditorApi {
  const [history, setHistory] = useState<History<DataPackage>>(() => createHistory(initial))
  const edit = useCallback((fn: (pkg: DataPackage) => DataPackage, key?: string) => setHistory((h) => commit(h, fn(h.present), key)), [])
  const doUndo = useCallback(() => setHistory((h) => undo(h)), [])
  const doRedo = useCallback(() => setHistory((h) => redo(h)), [])
  const replace = useCallback((pkg: DataPackage) => setHistory(createHistory(pkg)), [])

  // Ctrl+Z / Ctrl+Y fora dos campos de texto (dentro deles vale o desfazer do próprio navegador).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) return
      if (!(e.ctrlKey || e.metaKey)) return
      const key = e.key.toLowerCase()
      if (key === 'z' && !e.shiftKey) (e.preventDefault(), doUndo())
      else if (key === 'y' || (key === 'z' && e.shiftKey)) (e.preventDefault(), doRedo())
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [doUndo, doRedo])

  return { pkg: history.present, edit, undo: doUndo, redo: doRedo, canUndo: history.past.length > 0, canRedo: history.future.length > 0, replace }
}

/** Quantos problemas a validação lista no editor (o resto é só contado). */
const MAX_LISTED = 500

export interface Validation {
  report: PackageReport
  /** Calculando de novo depois de uma edição. */
  pending: boolean
  /** Problemas por tipo e posição na lista (`clubs[3].x` → `byEntity.get('clubs:3')`). */
  byEntity: Map<string, PackageIssue[]>
  /** Quantas entidades de cada tipo têm erro. */
  count(kind: EntityKind): number
}

const EMPTY: PackageReport = { errors: [], warnings: [] }

/** Validação em tempo real, com os mesmos erros da importação: roda um instante depois da última edição. */
export function useValidation(pkg: DataPackage): Validation {
  const [state, setState] = useState<{ pkg: DataPackage | null; report: PackageReport }>({ pkg: null, report: EMPTY })
  useEffect(() => {
    const timer = setTimeout(() => setState({ pkg, report: validatePackage(pkg, { maxIssues: MAX_LISTED }).report }), 250)
    return () => clearTimeout(timer)
  }, [pkg])
  const { report } = state
  return useMemo(() => {
    const byEntity = new Map<string, PackageIssue[]>()
    for (const issue of [...report.errors, ...report.warnings]) {
      const at = locateIssue(issue.path)
      if (!at) continue
      const key = `${at.kind}:${at.index}`
      byEntity.set(key, [...(byEntity.get(key) ?? []), issue])
    }
    return {
      report,
      pending: state.pkg !== pkg,
      byEntity,
      count: (kind: EntityKind) => [...byEntity.keys()].filter((k) => k.startsWith(`${kind}:`)).length,
    }
  }, [report, state.pkg, pkg])
}

/** Erros (sem avisos) de uma entidade. */
export const errorsOf = (v: Validation, kind: EntityKind, index: number): PackageIssue[] => (v.byEntity.get(`${kind}:${index}`) ?? []).filter((i) => v.report.errors.includes(i))
