import { useMemo, useState } from 'react'
import type { Competition } from '../../../engine/types'
import type { Game } from '../../../store/game'
import { playerName } from '../../format'
import { TopTabs } from '../../theme'
import type { IconName } from '../../theme'
import { leaders } from './data'
import type { Leader, LeaderKind } from './data'
import { SectionHeader, TeamLink, toneOf } from './parts'
import type { Tone } from './parts'

export interface LeaderTab {
  id: LeaderKind
  label: string
}

/** As três estantes de ranking: Artilharia (dourada), Assistências (verde-água) e Cartões (amarela). */
export const LEADER_BOARDS = {
  goals: {
    title: 'Artilharia',
    icon: 'boot' as IconName,
    tone: 'gold' as Tone,
    unit: 'Gols',
    tabs: [
      { id: 'goals', label: 'Geral' },
      { id: 'home-goals', label: 'Casa' },
      { id: 'away-goals', label: 'Fora' },
      { id: 'brazilians', label: 'Brasileiros' },
      { id: 'under-23', label: 'Sub-23' },
    ] as LeaderTab[],
    empty: 'Ainda não houve gols.',
  },
  assists: {
    title: 'Assistências',
    icon: 'boot' as IconName,
    tone: 'teal' as Tone,
    unit: 'Assistências',
    tabs: [
      { id: 'assists', label: 'Geral' },
      { id: 'pass-assists', label: 'Passes' },
      { id: 'cross-assists', label: 'Cruzamentos' },
    ] as LeaderTab[],
    empty: 'Ainda não houve assistências.',
  },
  cards: {
    title: 'Cartões',
    icon: 'card' as IconName,
    tone: 'amber' as Tone,
    unit: 'Cartões',
    tabs: [
      { id: 'yellow', label: 'Amarelos' },
      { id: 'red', label: 'Vermelhos' },
    ] as LeaderTab[],
    empty: 'Ainda não houve cartões.',
  },
}

export type LeaderBoard = keyof typeof LEADER_BOARDS

const MEDALS = [
  { label: 'Ouro', cls: 'bg-gradient-to-b from-amber-200 to-amber-500 text-bg', ring: 'border-amber-400/60 bg-amber-400/10' },
  { label: 'Prata', cls: 'bg-gradient-to-b from-slate-100 to-slate-400 text-bg', ring: 'border-slate-300/50 bg-slate-300/10' },
  { label: 'Bronze', cls: 'bg-gradient-to-b from-orange-300 to-orange-600 text-bg', ring: 'border-orange-400/50 bg-orange-400/10' },
]

function Row({ leader, rank, tone, mine, onTeam }: { leader: Leader; rank: number; tone: Tone; mine: boolean; onTeam: (id: string) => void }) {
  const podium = rank <= 3
  const medal = MEDALS[rank - 1]
  return (
    <li className={`flex items-center gap-3 rounded-2xl border px-3 ${podium ? `min-h-[68px] ${medal?.ring}` : 'min-h-14 border-line bg-surface'} ${mine ? 'ring-1 ring-accent/70' : ''}`}>
      {podium ? (
        <span aria-label={`${medal?.label}: ${rank}º`} className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-display text-xl font-extrabold ${medal?.cls}`}>
          {rank}
        </span>
      ) : (
        <span className="w-9 shrink-0 text-center text-sm font-bold tabular-nums text-muted">{rank}</span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate font-extrabold">{playerName(leader.player)}</span>
        <TeamLink team={leader.team} onOpen={onTeam} className="text-xs text-muted" />
      </span>
      <span className={`title text-4xl tabular-nums ${podium ? toneOf(tone).value : ''}`}>{leader.value}</span>
    </li>
  )
}

/** Ranking de jogadores da competição: cabeçalho próprio, abas, pódio dos três primeiros e a lista. */
export function Leaders({ game, competition, board, onTeam }: { game: Game; competition: Competition; board: LeaderBoard; onTeam: (id: string) => void }) {
  const cfg = LEADER_BOARDS[board]
  const [kind, setKind] = useState<LeaderKind>((cfg.tabs[0] as LeaderTab).id)
  const active = cfg.tabs.some((t) => t.id === kind) ? kind : (cfg.tabs[0] as LeaderTab).id
  const list = useMemo(() => leaders(game, competition, active), [game, competition, active])
  const tone = toneOf(cfg.tone)

  return (
    <div className="space-y-3">
      <SectionHeader icon={cfg.icon} title={cfg.title} subtitle={`${competition.name} · ${game.season.season.year}`} tone={cfg.tone} />
      <TopTabs scroll value={active} onChange={setKind} activeClass={`${tone.chip} shadow`} options={cfg.tabs.map((t) => ({ id: t.id, label: t.label }))} />
      <div className="flex items-center justify-between px-3 text-[11px] font-bold uppercase tracking-[0.14em] text-muted">
        <span>Jogador</span>
        <span>{cfg.unit}</span>
      </div>
      {list.length === 0 ? (
        <p className="rounded-2xl border border-line bg-surface p-4 text-sm text-muted">{cfg.empty}</p>
      ) : (
        <ol className="space-y-2">
          {list.map((l, i) => (
            <Row key={l.player.id} leader={l} rank={i + 1} tone={cfg.tone} mine={l.team.id === game.userTeamId} onTeam={onTeam} />
          ))}
        </ol>
      )}
    </div>
  )
}
