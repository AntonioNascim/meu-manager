import { cupStatus, isContinental, isWorld } from '../../../engine/cups'
import type { Cup, Match } from '../../../engine/types'
import { standingsOf, teamById, userCompetition, userTeam } from '../../../store/game'
import type { Game } from '../../../store/game'
import { formatDate } from '../../format'
import { CompetitionArt, Crest, Icon, TrophyArt } from '../../theme'
import type { CompetitionKind } from '../../theme'
import { shortName } from './parts'

export type OngoingTarget = { section: 'table' | 'cups'; competitionId?: string }

interface Entry {
  id: string
  name: string
  kind: CompetitionKind
  subtitle: string
  /** Pílula verde da direita e a linha de baixo. */
  badge: string
  detail: string
  tone: 'accent' | 'gold' | 'loss' | 'muted'
  playing: boolean
  next?: Match
  target: OngoingTarget
}

const cupKind = (cup: Cup): CompetitionKind => (isWorld(cup.spec) ? 'world' : isContinental(cup.spec) ? 'continental' : cup.spec.kind === 'supercup' ? 'super' : 'cup')

const nextOf = (game: Game, competitionId: string): Match | undefined =>
  game.season.matches
    .filter((m) => m.competitionId === competitionId && m.status === 'scheduled' && (m.homeTeamId === game.userTeamId || m.awayTeamId === game.userTeamId))
    .sort((a, b) => a.date.localeCompare(b.date))[0]

/** Competições do time com a situação dele em cada uma (tudo derivado das partidas, nada é guardado). */
export function ongoingEntries(game: Game): Entry[] {
  const out: Entry[] = []
  const league = userCompetition(game)
  const table = standingsOf(game, league)
  const index = table.findIndex((r) => r.teamId === game.userTeamId)
  const row = table[index]
  const leagueNext = nextOf(game, league.id)
  const leagueDone = !game.season.matches.some((m) => m.competitionId === league.id && m.status !== 'finished')
  out.push({
    id: league.id,
    name: league.name,
    kind: 'league',
    subtitle: leagueDone ? 'Finalizado' : (row?.played ?? 0) === 0 ? 'Ainda não começou' : 'Disputa em andamento',
    badge: (row?.played ?? 0) > 0 ? `${index + 1}ª posição` : '–',
    detail: `${row?.points ?? 0} pontos`,
    tone: 'accent',
    playing: !leagueDone,
    ...(leagueNext ? { next: leagueNext } : {}),
    target: { section: 'table', competitionId: league.id },
  })
  for (const cup of game.season.cups ?? []) {
    const status = cupStatus(game.season, cup, game.userTeamId)
    if (status.state === 'out') continue
    const next = nextOf(game, cup.id)
    const base = { id: cup.id, name: cup.name, kind: cupKind(cup), target: { section: 'cups', competitionId: cup.id } as OngoingTarget, ...(next ? { next } : {}) }
    if (status.state === 'champion') out.push({ ...base, subtitle: 'Finalizado', badge: 'Campeão', detail: shortName(userTeam(game)), tone: 'gold', playing: false })
    else if (status.state === 'runner-up') out.push({ ...base, subtitle: 'Finalizado', badge: 'Vice-campeão', detail: 'Perdeu a final', tone: 'gold', playing: false })
    else if (status.state === 'eliminated') out.push({ ...base, subtitle: status.stageName ?? 'Eliminado', badge: 'Eliminado', detail: 'Fora da copa', tone: 'loss', playing: false })
    else {
      const rival = next ? teamById(game, next.homeTeamId === game.userTeamId ? next.awayTeamId : next.homeTeamId) : undefined
      out.push({ ...base, subtitle: status.stageName || 'Em disputa', badge: 'Na disputa', detail: rival ? `x ${shortName(rival)}` : 'Confronto a definir', tone: 'accent', playing: true })
    }
  }
  return out
}

/** Destaque: a competição mais importante em andamento (mundial, continental, copa nacional e, por fim, a liga). */
export function featuredOf(entries: Entry[]): Entry {
  const rank: Record<CompetitionKind, number> = { world: 0, continental: 1, cup: 2, super: 3, league: 4 }
  return [...entries].filter((e) => e.playing).sort((a, b) => rank[a.kind] - rank[b.kind])[0] ?? (entries[0] as Entry)
}

const TONE = {
  accent: 'border-accent/50 bg-accent/10 text-accent',
  gold: 'border-gold/60 bg-gold/10 text-gold',
  loss: 'border-loss/50 bg-loss/10 text-loss',
  muted: 'border-line text-muted',
} as const

/** Aba "Em andamento": cartão de destaque com troféu desenhado e a lista das outras competições com a situação do time. */
export function Ongoing({ game, onOpen }: { game: Game; onOpen: (target: OngoingTarget) => void }) {
  const team = userTeam(game)
  const entries = ongoingEntries(game)
  const featured = featuredOf(entries)
  const others = entries.filter((e) => e.id !== featured.id)
  const rival = featured.next ? teamById(game, featured.next.homeTeamId === team.id ? featured.next.awayTeamId : featured.next.homeTeamId) : undefined
  const cup = (game.season.cups ?? []).find((c) => c.id === featured.id)
  const stage = cup ? featured.subtitle : featured.subtitle
  return (
    <div className="space-y-3" data-testid="ongoing">
      <section className="relative overflow-hidden rounded-[14px] border border-gold/40 bg-gradient-to-br from-[#2a1f08] via-[#0d0f0c] to-[#080b0a] p-3.5" data-testid="featured-competition">
        <span className="pointer-events-none absolute -left-6 top-0 h-full w-28 -skew-x-12 bg-gradient-to-r from-gold/25 to-transparent" aria-hidden="true" />
        <div className="relative grid grid-cols-[auto_1fr] gap-3">
          <div className="flex flex-col items-center justify-center gap-1">
            <TrophyArt size={84} />
          </div>
          <div className="min-w-0">
            <h3 className="font-display text-[24px] font-bold leading-tight">{featured.name}</h3>
            <p className="text-[15px] text-slate-300">{stage}</p>
            {featured.next && rival ? (
              <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-center gap-1 text-center">
                <span className="flex flex-col items-center gap-0.5">
                  <Crest team={team} size="md" />
                  <b className="max-w-full truncate font-display text-[14px]">{shortName(team)}</b>
                </span>
                <span className="font-display text-2xl font-extrabold">X</span>
                <span className="flex flex-col items-center gap-0.5">
                  <Crest team={rival} size="md" />
                  <b className="max-w-full truncate font-display text-[14px]">{shortName(rival)}</b>
                </span>
              </div>
            ) : (
              <p className="mt-2 text-sm text-muted">{featured.badge} · {featured.detail}</p>
            )}
          </div>
        </div>
        {featured.next && (
          <p className="relative mt-2 flex items-center justify-center gap-1.5 text-[13px] text-slate-300">
            <Icon name="cal" size={15} />
            {formatDate(featured.next.date)}
          </p>
        )}
        <button type="button" onClick={() => onOpen(featured.target)} className="relative mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-[10px] bg-gradient-to-b from-[#2cae4f] to-[#12712c] font-display text-[19px] font-bold shadow-[0_3px_0_#0b4a1a]">
          <Icon name="play" size={18} />
          Ver detalhes
          <Icon name="chev" size={18} />
        </button>
      </section>

      {others.length > 0 && (
        <>
          <div className="flex items-center gap-3 rounded-[12px] border border-l-[3px] border-white/[0.1] border-l-accent bg-surface px-3 py-2.5">
            <Icon name="chart" size={22} className="text-accent" />
            <h3 className="font-display text-[20px] font-bold leading-none">Outras competições</h3>
          </div>
          <ul className="space-y-2">
            {others.map((e) => (
              <li key={e.id}>
                <button type="button" onClick={() => onOpen(e.target)} className="card-bg flex min-h-[72px] w-full items-center gap-3 rounded-[12px] border border-white/[0.13] px-3 py-2 text-left" data-competition={e.id}>
                  <span className="flex w-12 shrink-0 items-center justify-center">
                    <CompetitionArt kind={e.kind} size={44} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <b className="block font-display text-[19px] font-bold leading-tight">{e.name}</b>
                    <span className="block truncate text-[13px] text-muted">{e.subtitle}</span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-0.5">
                    <span className={`rounded-full border px-2.5 py-0.5 text-[12.5px] font-bold ${TONE[e.tone]}`}>{e.badge}</span>
                    <span className="max-w-[7.5rem] truncate text-[12px] text-slate-300">{e.detail}</span>
                  </span>
                  <Icon name="chev" size={18} className="shrink-0 text-accent" />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
