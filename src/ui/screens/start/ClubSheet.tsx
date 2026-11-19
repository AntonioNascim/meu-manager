import { Sheet } from '../../theme'
import { Crest, Eyebrow, Flag, ValueBadge } from '../../theme'
import { formatMoney, playerName } from '../../format'
import { OBJECTIVE_TEXT, POSITION_LABELS, SCOUT_SECTOR_LABELS } from '../../labels'
import type { Player, Team } from '../../../engine/types'
import { clubReport } from './clubInfo'

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="flex items-baseline justify-between gap-3 border-b border-line py-2 text-sm last:border-0">
    <span className="text-muted">{label}</span>
    <span className="text-right font-bold">{children}</span>
  </div>
)

/**
 * "Conhecer o clube": a ficha de um clube antes de assinar. Meta e margem da diretoria, estádio, orçamento contra os da liga, o elenco que
 * se herda e o ponto forte e o fraco. Só leitura.
 */
export function ClubSheet({ world, teamId, onClose, onSign }: { world: { teams: readonly Team[]; players: readonly Player[] }; teamId: string; onClose: () => void; onSign: () => void }) {
  const r = clubReport(world, teamId)
  if (!r) return null
  const { team } = r
  return (
    <Sheet
      title="Conhecer o clube"
      onClose={onClose}
      footer={
        <button type="button" onClick={onSign} className="min-h-12 w-full rounded-xl bg-accent font-bold text-accent-ink active:scale-95" data-testid="club-sheet-sign">
          Assinar com {team.name} ›
        </button>
      }
    >
      <div className="space-y-4 px-5 pb-4" data-testid="club-sheet">
        <div className="flex items-center gap-3">
          <Crest team={team} size="xl" />
          <div className="min-w-0">
            <h3 className="title text-3xl leading-none">{team.name}</h3>
            <p className="text-xs text-muted">
              {team.state ? `${team.city}/${team.state}` : team.city} ·{' '}
              <Flag nationality={team.country ?? 'Brazil'} /> {team.tier}ª divisão
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-line bg-surface p-3">
          <Eyebrow>A diretoria</Eyebrow>
          <Row label="Pede">{OBJECTIVE_TEXT(team.objective.targetPosition)}</Row>
          <Row label="Perde a paciência">Abaixo do {team.objective.sackingPosition}º lugar</Row>
          <Row label="Reputação do clube">{team.reputation} de 20</Row>
        </div>

        <div className="rounded-xl border border-line bg-surface p-3">
          <Eyebrow>O campo e o caixa</Eyebrow>
          <Row label="Estádio">
            {team.stadium.name} · {team.stadium.capacity.toLocaleString('pt-BR')} lugares
          </Row>
          <Row label="Orçamento de compras">
            {formatMoney(team.finances.transferBudget)} · {r.budgetRank}º de {r.leagueSize}
          </Row>
          <Row label="Caixa">{formatMoney(team.finances.balance)}</Row>
        </div>

        <div className="rounded-xl border border-line bg-surface p-3">
          <Eyebrow>O elenco que você herda</Eyebrow>
          <Row label="Nível dos onze">
            {r.starters.toFixed(0)} · {r.strengthRank}º de {r.leagueSize}
          </Row>
          <Row label="Idade média">
            {r.averageAge.toFixed(1).replace('.', ',')} · os onze, {r.startersAge.toFixed(1).replace('.', ',')}
          </Row>
          <Row label="Jogadores · estrangeiros">
            {r.squadSize} · {r.foreigners}
          </Row>
          <ul className="mt-2 space-y-1.5">
            {r.best.map(({ player, overall }) => (
              <li key={player.id} className="flex items-center gap-2 text-sm">
                <span className="w-24 shrink-0 text-xs text-muted">{POSITION_LABELS[player.position]}</span>
                <Flag nationality={player.nationality} />
                <span className="min-w-0 flex-1 truncate font-semibold">{playerName(player)}</span>
                <ValueBadge value={overall}>{Math.round(overall)}</ValueBadge>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-slate-300" data-testid="club-analysis">
            O melhor setor é o <b>{SCOUT_SECTOR_LABELS[r.strongest].toLowerCase()}</b> ({r.sectors[r.strongest].toFixed(0)}); o mais fraco, o <b>{SCOUT_SECTOR_LABELS[r.weakest].toLowerCase()}</b> ({r.sectors[r.weakest].toFixed(0)}).
          </p>
        </div>
      </div>
    </Sheet>
  )
}
