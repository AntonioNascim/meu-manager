import type { ReactNode } from 'react'
import { CONDITION } from '../../engine/config'
import { overallAt, playerOverall } from '../../engine/overall'
import { GOALKEEPER_ATTRIBUTES, MENTAL_ATTRIBUTES, PHYSICAL_ATTRIBUTES, TECHNICAL_ATTRIBUTES } from '../../engine/types'
import type { AttributeName, Player, Position } from '../../engine/types'
import { bandFor, conditionBand, formBand } from '../colors'
import { formatMoney, playerName } from '../format'
import {
  ATTRIBUTE_GROUP_LABELS,
  ATTRIBUTE_LABELS,
  FOOT_LABELS,
  NATIONALITY_LABELS,
  POSITION_LABELS,
  POSITION_SHORT_LABELS,
} from '../labels'
import type { AttributeGroup } from '../labels'
import { Eyebrow, Flag, MoodIcon, Panel, ValueBadge } from '../theme'
import { isOnYellowEdge } from '../squadSort'

/** Barra de 0 a 100 com a cor da faixa. */
export function Bar({ value, color }: { value: number; color: string }) {
  return (
    <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  )
}

/** Avisos de disponibilidade (lesão, suspensão) como etiquetas. */
export function StatusTags({ player }: { player: Player }) {
  const c = player.condition
  return (
    <>
      {c.injuryDaysLeft > 0 && <span className="rounded bg-loss px-1.5 py-0.5 text-[10px] font-bold text-bg">Lesionado · {c.injuryDaysLeft} d</span>}
      {c.suspensionGames > 0 && <span className="rounded bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold text-bg">Suspenso · {c.suspensionGames} jogo{c.suspensionGames > 1 ? 's' : ''}</span>}
    </>
  )
}

const GROUPS: { id: AttributeGroup; names: readonly AttributeName[] }[] = [
  { id: 'technical', names: TECHNICAL_ATTRIBUTES },
  { id: 'physical', names: PHYSICAL_ATTRIBUTES },
  { id: 'mental', names: MENTAL_ATTRIBUTES },
  { id: 'goalkeeper', names: GOALKEEPER_ATTRIBUTES },
]

function Stat({ label, value, bar, color }: { label: string; value: string; bar?: number; color?: string }) {
  return (
    <div className="flex items-center gap-2 py-1 text-sm">
      <span className="w-32 shrink-0 text-slate-300">{label}</span>
      {bar !== undefined && color ? <Bar value={bar} color={color} /> : <span className="flex-1" />}
      <span className="min-w-12 text-right font-bold tabular-nums">{value}</span>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Panel className="p-4">
      <h3 className="mb-2">
        <Eyebrow>{title}</Eyebrow>
      </h3>
      {children}
    </Panel>
  )
}

/** Detalhe do jogador em folha deslizante (tela cheia no celular). */
export function PlayerDetail({ player, onClose }: { player: Player; onClose: () => void }) {
  const c = player.condition
  const overall = playerOverall(player)
  const isKeeper = player.position === 'GK'
  const positions: Position[] = [player.position, ...player.secondaryPositions]
  const groups = GROUPS.filter((g) => g.id !== 'goalkeeper' || isKeeper)
  const stats = player.seasonStats

  return (
    <div className="fixed inset-0 z-30 flex flex-col bg-bg" role="dialog" aria-label={playerName(player)}>
      <header className="flex items-center gap-3 border-b border-line px-4 py-3">
        <div className="flex flex-col items-center gap-1">
          <ValueBadge value={overall} className="!min-w-14 !px-3 !py-2 !text-3xl">
            {Math.round(overall)}
          </ValueBadge>
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted">{POSITION_SHORT_LABELS[player.position]}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="title truncate text-3xl">{playerName(player)}</div>
          <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
            <Flag nationality={player.nationality} />
            <span className="truncate">
              {player.nickname ? `${player.name} · ` : ''}
              {player.age} anos · {NATIONALITY_LABELS[player.nationality]} · Pé {FOOT_LABELS[player.foot].toLowerCase()}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap gap-1">
            <StatusTags player={player} />
            {isOnYellowEdge(player) && <span className="rounded bg-amber-400/20 px-1.5 py-0.5 text-[10px] font-bold text-amber-300">Pendurado</span>}
          </div>
        </div>
        <button type="button" onClick={onClose} className="min-h-12 rounded-xl border border-line bg-surface px-4 text-sm font-bold">
          Fechar
        </button>
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 pb-10 pt-4">
        <Section title="Estado atual">
          <Stat label="Condição física" value={`${Math.round(c.fitness)}%`} bar={c.fitness} color={conditionBand(c.fitness).bg} />
          <div className="flex items-center gap-2 py-1 text-sm">
            <span className="w-32 shrink-0 text-slate-300">Moral</span>
            <Bar value={c.morale} color={conditionBand(c.morale).bg} />
            <span className="flex min-w-12 items-center justify-end gap-1.5 font-bold tabular-nums">
              <MoodIcon morale={c.morale} size={18} />
              {Math.round(c.morale)}
            </span>
          </div>
          <Stat
            label="Forma (últimos jogos)"
            value={c.recentRatings.length > 0 ? c.form.toFixed(1) : '–'}
            {...(c.recentRatings.length > 0 ? { bar: c.form * 10, color: formBand(c.form).bg } : {})}
          />
          {c.recentRatings.length > 0 && (
            <div className="mb-1 flex gap-1 pl-[8.5rem]">
              {c.recentRatings.map((r, i) => (
                <span key={i} className={`rounded px-1.5 py-0.5 text-xs font-bold tabular-nums text-bg ${formBand(r).bg}`}>
                  {r.toFixed(1)}
                </span>
              ))}
            </div>
          )}
          <Stat label="Lesão" value={c.injuryDaysLeft > 0 ? `${c.injuryDaysLeft} d` : 'Não'} />
          <Stat label="Suspensão" value={c.suspensionGames > 0 ? `${c.suspensionGames} jogo${c.suspensionGames > 1 ? 's' : ''}` : 'Não'} />
          <Stat label="Amarelos acumulados" value={`${c.yellowCards} / ${CONDITION.yellowsPerSuspension}`} />
        </Section>

        <Section title="Força por posição">
          <div className="flex flex-wrap gap-2">
            {positions.map((pos, i) => {
              const value = i === 0 ? overall : overallAt(player, pos)
              return (
                <div key={pos} className="rounded-xl border border-line bg-surface-2 px-3 py-2 text-center">
                  <div className={`font-display text-2xl font-extrabold tabular-nums ${bandFor(value).text}`}>{Math.round(value)}</div>
                  <div className="text-[10px] text-muted">
                    {POSITION_LABELS[pos]}
                    {i === 0 ? ' (principal)' : ''}
                  </div>
                </div>
              )
            })}
          </div>
        </Section>

        {groups.map((g) => (
          <Section key={g.id} title={ATTRIBUTE_GROUP_LABELS[g.id]}>
            {g.names.map((name) => {
              const value = player.attributes[name]
              return <Stat key={name} label={ATTRIBUTE_LABELS[name]} value={String(value)} bar={value} color={bandFor(value).bg} />
            })}
          </Section>
        ))}

        <Section title="Temporada">
          <div className="grid grid-cols-3 gap-2 text-center text-sm">
            {[
              ['Jogos', stats.appearances],
              ['Minutos', stats.minutes],
              ['Gols', stats.goals],
              ['Assistências', stats.assists],
              ['Amarelos', stats.yellowCards],
              ['Vermelhos', stats.redCards],
              ['Nota média', stats.ratedGames > 0 ? (stats.ratingSum / stats.ratedGames).toFixed(1) : '–'],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl bg-surface-2 py-2">
                <div className="font-display text-2xl font-extrabold tabular-nums">{value}</div>
                <div className="text-[10px] text-muted">{label}</div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Contrato">
          <Stat label="Salário mensal" value={formatMoney(player.contract.salary)} />
          <Stat label="Término" value={player.contract.endDate.split('-').reverse().join('/')} />
          <Stat label="Multa rescisória" value={formatMoney(player.contract.releaseClause)} />
        </Section>
      </div>
    </div>
  )
}
