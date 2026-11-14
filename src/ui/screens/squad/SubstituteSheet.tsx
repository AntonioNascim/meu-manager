import { useMemo } from 'react'
import { overallAt, positionFit } from '../../../engine/overall'
import type { Player, Position, Tactic } from '../../../engine/types'
import { formationOf } from '../../../engine/formations'
import { playerName } from '../../format'
import { POSITION_LABELS, POSITION_SHORT_LABELS } from '../../labels'
import { isUnavailable } from '../../squadSort'
import { Avatar, ConditionBar, Flag, MoodIcon, Sheet, ValueBadge } from '../../theme'
import { StatusTags } from '../../components/PlayerDetail'

export interface SubCandidate {
  player: Player
  /** Força nesta vaga (já com a penalidade de quem joga fora da posição). */
  strength: number
  /** Onde ele está hoje: titular em outra posição, no banco ou fora do banco. */
  where: { zone: 'xi'; position: Position } | { zone: 'bench' } | { zone: 'rest' }
  samePosition: boolean
}

/**
 * Quem pode ocupar a vaga de um titular: primeiro os da mesma posição, depois os de outras posições que podem jogar ali (com a força mais baixa por
 * estarem fora de posição). Goleiro só troca com goleiro, e goleiro não joga na linha. Puro: a janela e os testes usam a mesma conta.
 */
export function substituteCandidates(tactic: Tactic, squad: readonly Player[], starterId: string): { slot: Position; same: SubCandidate[]; others: SubCandidate[] } | undefined {
  const index = tactic.startingXI.indexOf(starterId)
  if (index < 0) return undefined
  const formation = formationOf(tactic)
  const slot = (formation.slots[index] as (typeof formation.slots)[number]).position
  const slots = new Map(tactic.startingXI.map((id, i) => [id, (formation.slots[i] as (typeof formation.slots)[number]).position] as const))
  const out: SubCandidate[] = []
  for (const p of squad) {
    if (p.id === starterId) continue
    if ((slot === 'GK') !== (p.position === 'GK')) continue
    const xi = slots.get(p.id)
    out.push({
      player: p,
      strength: overallAt(p, slot),
      where: xi ? { zone: 'xi', position: xi } : tactic.bench.includes(p.id) ? { zone: 'bench' } : { zone: 'rest' },
      samePosition: p.position === slot,
    })
  }
  const byStrength = (a: SubCandidate, b: SubCandidate) => b.strength - a.strength || (a.player.id < b.player.id ? -1 : 1)
  const same = out.filter((c) => c.samePosition).sort(byStrength)
  // Os de outras posições: só quem tem ao menos uma posição secundária parecida ou um encaixe razoável (sem a metade da força).
  const others = out.filter((c) => !c.samePosition && positionFit(c.player, slot) >= 0.8).sort(byStrength)
  return { slot, same, others }
}

/**
 * Quem pode entrar na partida ao vivo no lugar de quem sai: só o banco. Mesma posição primeiro; depois os de outras posições, com a força mais baixa
 * (fora de posição). Goleiro só entra no lugar de goleiro, e goleiro não entra na linha.
 */
export function liveSubstituteCandidates(slot: Position, bench: readonly Player[]): { slot: Position; same: SubCandidate[]; others: SubCandidate[] } {
  const out: SubCandidate[] = bench
    .filter((p) => (slot === 'GK') === (p.position === 'GK'))
    .map((p) => ({ player: p, strength: overallAt(p, slot), where: { zone: 'bench' as const }, samePosition: p.position === slot }))
  const byStrength = (a: SubCandidate, b: SubCandidate) => b.strength - a.strength || (a.player.id < b.player.id ? -1 : 1)
  return { slot, same: out.filter((c) => c.samePosition).sort(byStrength), others: out.filter((c) => !c.samePosition).sort(byStrength) }
}

function Row({ c, onPick, starterPosition }: { c: SubCandidate; onPick: () => void; starterPosition: Position }) {
  const p = c.player
  const blocked = isUnavailable(p)
  return (
    <li>
      <button type="button" disabled={blocked} onClick={onPick} data-testid={`sub-${p.id}`} className="flex min-h-14 w-full items-center gap-2 px-3 py-1.5 text-left disabled:opacity-50">
        <Avatar id={p.id} size={36} ring />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <Flag nationality={p.nationality} />
            <span className="truncate font-bold">{playerName(p)}</span>
          </span>
          <span className="flex flex-wrap items-center gap-1 text-[11px] text-muted">
            <span className="font-bold">{POSITION_SHORT_LABELS[p.position]}</span>
            {c.where.zone === 'xi' && <span className="rounded bg-sky-400/15 px-1.5 py-0.5 font-bold text-sky-200">Titular de {POSITION_SHORT_LABELS[c.where.position]}</span>}
            {c.where.zone === 'bench' && <span>Banco</span>}
            {c.where.zone === 'rest' && <span>Fora do banco</span>}
            {!c.samePosition && <span className="rounded bg-violet-400/15 px-1.5 py-0.5 font-bold text-violet-200">fora de posição</span>}
            <StatusTags player={p} />
          </span>
        </span>
        <MoodIcon morale={p.condition.morale} size={20} />
        <ConditionBar fitness={p.condition.fitness} className="!h-6" />
        <ValueBadge value={c.strength} className="!min-w-10 !text-base" aria-label={`Força como ${POSITION_LABELS[starterPosition]}`}>
          {Math.round(c.strength)}
        </ValueBadge>
      </button>
    </li>
  )
}

/** Janela de baixo para cima com a lista de quem pode entrar (mesma posição primeiro, depois as outras). Serve à Escalação e à partida ao vivo. */
export function SubstituteList({ title, slot, same, others, note, onPick, onClose }: { title: string; slot: Position; same: SubCandidate[]; others: SubCandidate[]; note: string; onPick: (incomingId: string) => void; onClose: () => void }) {
  return (
    <Sheet title={title} onClose={onClose}>
      <p className="mb-2 text-sm text-muted">
        Vaga de {POSITION_LABELS[slot]}. {note}
      </p>
      <div data-testid="substitute-sheet" className="space-y-3">
        <section>
          <h3 className="px-1 pb-1 text-[11px] font-bold uppercase tracking-[0.14em] text-muted">Mesma posição ({same.length})</h3>
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface-2">
            {same.map((c) => (
              <Row key={c.player.id} c={c} starterPosition={slot} onPick={() => onPick(c.player.id)} />
            ))}
            {same.length === 0 && <li className="p-3 text-sm text-muted">Não há outro jogador dessa posição disponível.</li>}
          </ul>
        </section>
        <section>
          <h3 className="px-1 pb-1 text-[11px] font-bold uppercase tracking-[0.14em] text-muted">Outras posições ({others.length})</h3>
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface-2">
            {others.map((c) => (
              <Row key={c.player.id} c={c} starterPosition={slot} onPick={() => onPick(c.player.id)} />
            ))}
            {others.length === 0 && <li className="p-3 text-sm text-muted">Ninguém de outra posição disponível.</li>}
          </ul>
        </section>
      </div>
    </Sheet>
  )
}

/** Janela de baixo para cima na Escalação: quem entra no lugar do titular tocado. Tocar num jogador faz a troca. */
export function SubstituteSheet({ tactic, squad, starter, onPick, onClose }: { tactic: Tactic; squad: readonly Player[]; starter: Player; onPick: (incomingId: string) => void; onClose: () => void }) {
  const found = useMemo(() => substituteCandidates(tactic, squad, starter.id), [tactic, squad, starter.id])
  if (!found) return null
  return <SubstituteList title={`Substituir ${playerName(starter)}`} slot={found.slot} same={found.same} others={found.others} note="Mesma posição primeiro; depois quem pode jogar ali, com a força mais baixa por estar fora de posição. Quem já é titular troca de lugar com ele." onPick={onPick} onClose={onClose} />
}
