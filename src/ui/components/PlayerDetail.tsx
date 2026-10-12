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

/** Barra de 0 a 100 com a cor da faixa. */
export function Bar({ value, color }: { value: number; color: string }) {
  return (
    <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-700">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  )
}

/** Avisos de disponibilidade (lesão, suspensão) como etiquetas. */
export function StatusTags({ player }: { player: Player }) {
  const c = player.condition
  return (
    <>
      {c.injuryDaysLeft > 0 && <span className="rounded bg-rose-600 px-1.5 py-0.5 text-[10px] font-bold text-white">Lesionado · {c.injuryDaysLeft} d</span>}
      {c.suspensionGames > 0 && <span className="rounded bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-slate-950">Suspenso · {c.suspensionGames} jogo{c.suspensionGames > 1 ? 's' : ''}</span>}
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
      <span className="min-w-12 text-right font-semibold tabular-nums">{value}</span>
    </div>
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
    <div className="fixed inset-0 z-30 flex flex-col bg-slate-900" role="dialog" aria-label={playerName(player)}>
      <header className="flex items-center gap-3 border-b border-slate-800 px-4 py-3">
        <div className={`flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-xl bg-slate-800 ${bandFor(overall).text}`}>
          <span className="text-2xl font-bold leading-none tabular-nums">{Math.round(overall)}</span>
          <span className="text-[10px] font-semibold text-slate-400">{POSITION_SHORT_LABELS[player.position]}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-lg font-bold">{playerName(player)}</div>
          <div className="truncate text-xs text-slate-400">
            {player.nickname ? `${player.name} · ` : ''}
            {player.age} anos · {NATIONALITY_LABELS[player.nationality]} · Pé {FOOT_LABELS[player.foot].toLowerCase()}
          </div>
          <div className="mt-1 flex flex-wrap gap-1">
            <StatusTags player={player} />
          </div>
        </div>
        <button type="button" onClick={onClose} className="min-h-12 rounded-xl bg-slate-800 px-4 text-sm font-semibold">
          Fechar
        </button>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 pb-10 pt-4">
        <section>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Estado atual</h3>
          <Stat label="Condição física" value={`${Math.round(c.fitness)}%`} bar={c.fitness} color={conditionBand(c.fitness).bg} />
          <Stat label="Moral" value={`${Math.round(c.morale)}`} bar={c.morale} color={conditionBand(c.morale).bg} />
          <Stat
            label="Forma (últimos jogos)"
            value={c.recentRatings.length > 0 ? c.form.toFixed(1) : '–'}
            {...(c.recentRatings.length > 0 ? { bar: c.form * 10, color: formBand(c.form).bg } : {})}
          />
          {c.recentRatings.length > 0 && (
            <div className="mb-1 flex gap-1 pl-[8.5rem]">
              {c.recentRatings.map((r, i) => (
                <span key={i} className={`rounded px-1.5 py-0.5 text-xs font-bold tabular-nums text-slate-950 ${formBand(r).bg}`}>
                  {r.toFixed(1)}
                </span>
              ))}
            </div>
          )}
          <Stat label="Lesão" value={c.injuryDaysLeft > 0 ? `${c.injuryDaysLeft} d` : 'Não'} />
          <Stat
            label="Suspensão"
            value={c.suspensionGames > 0 ? `${c.suspensionGames} jogo${c.suspensionGames > 1 ? 's' : ''}` : 'Não'}
          />
          <Stat label="Amarelos acumulados" value={`${c.yellowCards} / ${CONDITION.yellowsPerSuspension}`} />
        </section>

        <section>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Força por posição</h3>
          <div className="flex flex-wrap gap-2">
            {positions.map((pos, i) => {
              const value = i === 0 ? overall : overallAt(player, pos)
              return (
                <div key={pos} className="rounded-lg bg-slate-800 px-3 py-2 text-center">
                  <div className={`text-xl font-bold tabular-nums ${bandFor(value).text}`}>{Math.round(value)}</div>
                  <div className="text-[10px] text-slate-400">
                    {POSITION_LABELS[pos]}
                    {i === 0 ? ' (principal)' : ''}
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        {groups.map((g) => (
          <section key={g.id}>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">{ATTRIBUTE_GROUP_LABELS[g.id]}</h3>
            {g.names.map((name) => {
              const value = player.attributes[name]
              return <Stat key={name} label={ATTRIBUTE_LABELS[name]} value={String(value)} bar={value} color={bandFor(value).bg} />
            })}
          </section>
        ))}

        <section>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Temporada</h3>
          <div className="grid grid-cols-3 gap-2 text-center text-sm">
            {[
              ['Jogos', stats.appearances],
              ['Minutos', stats.minutes],
              ['Gols', stats.goals],
              ['Assistências', stats.assists],
              ['Amarelos', stats.yellowCards],
              ['Vermelhos', stats.redCards],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg bg-slate-800 py-2">
                <div className="text-lg font-bold tabular-nums">{value}</div>
                <div className="text-[10px] text-slate-400">{label}</div>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Contrato</h3>
          <Stat label="Salário mensal" value={formatMoney(player.contract.salary)} />
          <Stat label="Término" value={player.contract.endDate.split('-').reverse().join('/')} />
          <Stat label="Multa rescisória" value={formatMoney(player.contract.releaseClause)} />
        </section>
      </div>
    </div>
  )
}
