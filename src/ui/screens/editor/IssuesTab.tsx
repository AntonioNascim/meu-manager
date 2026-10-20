import { locateIssue } from '../../../data/package/edit/ops'
import type { PackageIssue } from '../../../data/package/types'
import { packageIssueText } from '../../labels'
import { Section, SmallButton } from './fields'
import type { TabProps } from './parts'

const KIND_LABELS = { countries: 'País', leagues: 'Liga', clubs: 'Clube', players: 'Jogador', academy: 'Base', cups: 'Copa' } as const

function IssueList({ issues, goTo, tone }: { issues: PackageIssue[]; goTo: TabProps['goTo']; tone: 'error' | 'warning' }) {
  return (
    <ul className={`divide-y divide-line rounded-xl border ${tone === 'error' ? 'border-loss/40' : 'border-amber-300/40'}`}>
      {issues.map((issue, i) => {
        const at = locateIssue(issue.path)
        return (
          <li key={i} className="flex items-start gap-3 p-3">
            <p className={`min-w-0 flex-1 text-sm ${tone === 'error' ? 'text-loss' : 'text-amber-300'}`}>{packageIssueText(issue)}</p>
            {at && at.kind !== 'countries' ? (
              <SmallButton onClick={() => goTo(at.kind, at.index)}>Ir para {KIND_LABELS[at.kind].toLowerCase()}</SmallButton>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}

/** Todos os problemas do pacote (os mesmos da importação), cada um com o botão que leva ao lugar. */
export function IssuesTab({ validation, goTo }: TabProps) {
  const { report, pending } = validation
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Section title={pending ? 'Conferindo…' : report.errors.length === 0 ? 'Tudo certo' : `${report.errors.length + (report.more ?? 0)} erro(s)`}>
        {report.errors.length === 0 && !pending && <p className="text-sm text-win">O pacote passa na validação da importação e pode ser usado num jogo novo.</p>}
        {report.errors.length > 0 && <IssueList issues={report.errors} goTo={goTo} tone="error" />}
        {(report.more ?? 0) > 0 && <p className="text-sm text-muted">… e mais {report.more} erro(s) que aparecem quando estes forem resolvidos.</p>}
      </Section>
      {report.warnings.length > 0 && (
        <Section title={`${report.warnings.length} aviso(s)`}>
          <IssueList issues={report.warnings} goTo={goTo} tone="warning" />
        </Section>
      )}
    </div>
  )
}
