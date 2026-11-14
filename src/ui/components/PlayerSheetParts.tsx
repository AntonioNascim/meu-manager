/**
 * Peças da ficha do jogador (redesenho v3): cartão Atributos (gráfico hexagonal e barras), cartão Estado atual (condição, moral, forma, lesão,
 * suspensão e o selo de disponibilidade) e o rodapé com o clube. Só leitura: o potencial oculto nunca aparece aqui.
 */
import type { ReactNode } from 'react'
import type { Player, Team } from '../../engine/types'
import { conditionBand, formBand } from '../colors'
import { hexValues } from '../screens/squad/attributeGroups'
import { Crest, Icon, MoodIcon } from '../theme'
import type { IconName } from '../theme/icons'

export function SheetCard({ title, icon, children, testId }: { title: string; icon: IconName; children: ReactNode; testId?: string }) {
  return (
    <section className="card-bg overflow-hidden rounded-[14px] border border-accent/35 shadow-[inset_0_0_26px_rgb(39_224_90/0.05)]" {...(testId ? { 'data-testid': testId } : {})}>
      <h2 className="flex items-center gap-2 border-b border-white/[0.08] bg-gradient-to-r from-accent/[0.1] to-transparent px-3 py-2.5 font-display text-[19px] font-bold">
        <Icon name={icon} size={21} className="text-accent" />
        {title}
      </h2>
      {children}
    </section>
  )
}

/** Gráfico hexagonal: seis eixos de 0 a 100, com o nome e o valor de cada um. */
export function HexChart({ values }: { values: { id: string; label: string; value: number }[] }) {
  const cx = 100
  const cy = 96
  const R = 58
  const dir = (i: number) => {
    const a = (-90 + 60 * i) * (Math.PI / 180)
    return { x: Math.cos(a), y: Math.sin(a) }
  }
  const ring = (k: number) =>
    values
      .map((_, i) => {
        const d = dir(i)
        return `${(cx + d.x * R * k).toFixed(1)},${(cy + d.y * R * k).toFixed(1)}`
      })
      .join(' ')
  const shape = values
    .map((v, i) => {
      const d = dir(i)
      const r = (Math.max(0, Math.min(100, v.value)) / 100) * R
      return `${(cx + d.x * r).toFixed(1)},${(cy + d.y * r).toFixed(1)}`
    })
    .join(' ')
  return (
    <svg viewBox="0 0 200 192" className="h-auto w-full" role="img" aria-label={`Atributos: ${values.map((v) => `${v.label} ${v.value}`).join(', ')}`} data-testid="hex-chart">
      {[1 / 3, 2 / 3, 1].map((k) => (
        <polygon key={k} points={ring(k)} fill="none" stroke="rgba(120,255,160,0.28)" strokeWidth="0.8" />
      ))}
      {values.map((_, i) => {
        const d = dir(i)
        return <line key={i} x1={cx} y1={cy} x2={cx + d.x * R} y2={cy + d.y * R} stroke="rgba(120,255,160,0.18)" strokeWidth="0.6" />
      })}
      <polygon points={shape} fill="rgba(39,224,90,0.38)" stroke="#4bf27a" strokeWidth="1.6" strokeLinejoin="round" />
      {values.map((v, i) => {
        const d = dir(i)
        const r = (Math.max(0, Math.min(100, v.value)) / 100) * R
        return <circle key={v.id} cx={cx + d.x * r} cy={cy + d.y * r} r="2.4" fill="#e9fff0" />
      })}
      {values.map((v, i) => {
        const d = dir(i)
        const x = cx + d.x * (R + 7)
        const y = cy + d.y * (R + 7)
        const anchor = i === 0 || i === 3 ? 'middle' : i < 3 ? 'start' : 'end'
        const above = i === 0
        const below = i === 3
        const ly = above ? y - 13 : below ? y + 9 : y - 1
        return (
          <g key={v.id} textAnchor={anchor}>
            <text x={x} y={ly} fontSize="10.5" fill="rgba(255,255,255,0.92)">
              {v.label}
            </text>
            <text x={x} y={ly + 12} fontSize="13" fontWeight="800" fill="#4bf27a">
              {v.value}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

/** Cartão Atributos: o hexágono e as barras ao lado; o botão abre os atributos um a um. */
export function AttributesCard({ player, showAll, onToggleAll }: { player: Pick<Player, 'position' | 'attributes'>; showAll: boolean; onToggleAll: () => void }) {
  const values = hexValues(player)
  return (
    <SheetCard title="Atributos" icon="chart" testId="attributes-card">
      <div className="grid grid-cols-[1.15fr_1fr] items-center gap-2 px-3 py-3">
        <HexChart values={values} />
        <ul className="space-y-2.5">
          {values.map((v) => (
            <li key={v.id} className="grid grid-cols-[1fr_auto] items-center gap-x-2 text-[12.5px]">
              <span className="col-span-2 flex justify-between leading-none">
                <span className="text-slate-200">{v.label}</span>
                <b className="font-display text-[15px] tabular-nums">{v.value}</b>
              </span>
              <span className="col-span-2 mt-1 block h-1.5 overflow-hidden rounded-full bg-white/10">
                <span className="block h-full rounded-full bg-gradient-to-r from-[#17b845] to-[#4bf27a]" style={{ width: `${v.value}%` }} />
              </span>
            </li>
          ))}
        </ul>
      </div>
      <button type="button" onClick={onToggleAll} aria-expanded={showAll} data-testid="toggle-numbers" className="mx-3 mb-3 min-h-11 w-[calc(100%-1.5rem)] rounded-xl border border-accent/50 bg-accent/[0.07] text-sm font-bold active:scale-95">
        {showAll ? 'Esconder os atributos' : 'Ver todos os atributos'}
      </button>
    </SheetCard>
  )
}

/** Silhueta de um jogador chutando (no selo de disponibilidade). */
function Silhouette({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 64 64" width="54" height="54" aria-hidden="true" fill={color}>
      <circle cx="30" cy="10" r="5.2" />
      <path d="M26 17c4-2 9-1 11 2l5 9 7 3-1.8 4-9-3-4-6-2 8 7 7-3 14-4-1 2-12-8-6-6 9-5-2 7-14c-2-4-1-8 3-12Z" />
      <circle cx="53" cy="48" r="4.2" />
    </svg>
  )
}

function StateRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 py-1.5 text-[13px]">
      <span className="whitespace-nowrap text-slate-200">{label}</span>
      {children}
    </div>
  )
}

const Bar = ({ value, className }: { value: number; className: string }) => (
  <span className="block h-2 overflow-hidden rounded-full bg-white/10">
    <span className={`block h-full rounded-full ${className}`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
  </span>
)

/** Por que o jogador não está disponível (ou "Disponível para jogar"). */
export function availability(player: Pick<Player, 'condition'>): { ok: boolean; title: string; detail?: string } {
  const c = player.condition
  if (c.injuryDaysLeft > 0) return { ok: false, title: 'Lesionado', detail: `${c.injuryDaysLeft} ${c.injuryDaysLeft === 1 ? 'dia' : 'dias'}` }
  if (c.suspensionGames > 0) return { ok: false, title: 'Suspenso', detail: `${c.suspensionGames} ${c.suspensionGames === 1 ? 'jogo' : 'jogos'}` }
  return { ok: true, title: 'Disponível', detail: 'para jogar' }
}

/** Cartão Estado atual: condição física, moral, forma, lesão, suspensão e o selo de disponibilidade. */
export function StateCard({ player }: { player: Pick<Player, 'condition'> }) {
  const c = player.condition
  const has = c.recentRatings.length > 0
  const av = availability(player)
  return (
    <SheetCard title="Estado atual" icon="heart" testId="state-card">
      <div className="grid grid-cols-[1fr_auto] gap-3 px-3 py-2">
        <div>
          <StateRow label="Condição física">
            <Bar value={c.fitness} className={conditionBand(c.fitness).bg} />
            <b className="w-11 text-right font-display text-[16px] tabular-nums">{Math.round(c.fitness)}%</b>
          </StateRow>
          <StateRow label="Moral">
            <Bar value={c.morale} className={conditionBand(c.morale).bg} />
            <span className="flex w-11 items-center justify-end gap-1 font-display text-[16px] font-bold tabular-nums">
              <MoodIcon morale={c.morale} size={16} />
              {Math.round(c.morale)}
            </span>
          </StateRow>
          <StateRow label="Forma (últimos jogos)">
            <Bar value={has ? c.form * 10 : 0} className={formBand(c.form).bg} />
            <b className="w-11 text-right font-display text-[16px] tabular-nums">{has ? c.form.toFixed(1) : '–'}</b>
          </StateRow>
          <div className="mt-1 border-t border-white/[0.08] pt-1.5">
            <div className="flex justify-between py-1 text-[13.5px]">
              <span className="text-slate-200">Lesão</span>
              <b className={c.injuryDaysLeft > 0 ? 'text-loss' : 'text-accent'}>{c.injuryDaysLeft > 0 ? `${c.injuryDaysLeft} d` : 'Não'}</b>
            </div>
            <div className="flex justify-between py-1 text-[13.5px]">
              <span className="text-slate-200">Suspensão</span>
              <b className={c.suspensionGames > 0 ? 'text-loss' : 'text-accent'}>{c.suspensionGames > 0 ? `${c.suspensionGames} ${c.suspensionGames === 1 ? 'jogo' : 'jogos'}` : 'Não'}</b>
            </div>
          </div>
        </div>
        <div className={`flex w-[92px] flex-col items-center justify-center gap-1 rounded-[12px] border px-2 py-3 text-center ${av.ok ? 'border-accent/60 bg-accent/[0.07]' : 'border-loss/60 bg-loss/[0.08]'}`} data-testid="availability" role="status">
          <Silhouette color={av.ok ? '#4bf27a' : '#ff5a5f'} />
          <span className="font-display text-[15px] font-bold leading-tight">{av.title}</span>
          {av.detail && <span className="text-[12px] leading-tight text-slate-300">{av.detail}</span>}
        </div>
      </div>
    </SheetCard>
  )
}

/** Rodapé da ficha: escudo e nome do clube. */
export function ClubFooter({ team }: { team: Pick<Team, 'name' | 'abbreviation' | 'colors'> | undefined }) {
  if (!team) return null
  return (
    <div className="flex justify-center pb-2 pt-1" data-testid="club-footer">
      <span className="inline-flex items-center gap-2.5 rounded-full border border-white/[0.14] bg-surface px-5 py-1.5">
        <Crest team={{ abbreviation: team.abbreviation, colors: [...team.colors] as [string, string] }} size="sm" />
        <b className="font-display text-[17px] font-bold">{team.name}</b>
      </span>
    </div>
  )
}
