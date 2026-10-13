import { useMemo, useRef } from 'react'
import { getFormation } from '../../../engine/formations'
import { aiTactic } from '../../../engine/season'
import type { Mentality, Player, PlayStyle } from '../../../engine/types'
import { squadOf, teamById } from '../../../store/game'
import type { Game } from '../../../store/game'
import { FieldLineup } from '../../components/FieldLineup'
import type { FieldSlot } from '../../components/FieldLineup'
import { MENTALITY_LABELS, PLAY_STYLE_DESCRIPTIONS, PLAY_STYLE_LABELS } from '../../labels'
import { assignNumber } from '../match/pitchModel'
import { Eyebrow, Panel } from '../../theme'

/** Tática do time no jogo que está rolando: o que o motor tem agora (a IA pode mudar a mentalidade e as trocas). */
export interface LiveTactic {
  teamId: string
  formationId: string
  style: PlayStyle
  /** Mentalidade escolhida pelo técnico. */
  mentality: Mentality
  /** Mentalidade em uso agora (a IA ajusta pelo placar e pelo tamanho do rival). */
  activeMentality: Mentality
  onPitch: { playerId: string; slot: FieldSlot['slot']; fitness: number; yellowCards: number }[]
}

/**
 * Seção "Tática" da página de um time: formação, estilo, mentalidade e a escalação num campo. Fora de jogo é a
 * escalação provável (a que a IA montaria hoje, sem lesionados e suspensos); durante a partida é a tática atual.
 */
export function TacticSection({ game, teamId, live }: { game: Game; teamId: string; live?: LiveTactic | undefined }) {
  const team = teamById(game, teamId)
  const squad = squadOf(game, teamId)
  const players = useMemo(() => new Map<string, Player>(squad.map((p) => [p.id, p])), [squad])
  const numbers = useRef(new Map<string, number>())
  const probable = useMemo(() => {
    const tactic = teamId === game.userTeamId ? team.tactic : aiTactic(team, squad)
    const formation = getFormation(tactic.formationId)
    return { tactic, lineup: tactic.startingXI.map((id, i) => ({ playerId: id, slot: formation.slots[i]!.position })) }
  }, [game, team, squad, teamId])

  const formationId = live ? live.formationId : probable.tactic.formationId
  const style = live ? live.style : probable.tactic.style
  const mentality = live ? live.activeMentality : probable.tactic.mentality
  const lineup: FieldSlot[] = live ? live.onPitch.map((p) => ({ playerId: p.playerId, slot: p.slot })) : probable.lineup
  const fitness = new Map(live ? live.onPitch.map((p) => [p.playerId, p.fitness]) : [])
  const yellow = new Map(live ? live.onPitch.map((p) => [p.playerId, p.yellowCards > 0]) : [])
  const adjusted = live !== undefined && live.activeMentality !== live.mentality

  return (
    <Panel className="p-4">
      <div data-testid="tactic-section">
      <Eyebrow>{live ? 'Tática agora, no jogo' : teamId === game.userTeamId ? 'Sua tática' : 'Tática e escalação provável'}</Eyebrow>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        {[
          ['Formação', formationId],
          ['Estilo', PLAY_STYLE_LABELS[style]],
          ['Mentalidade', MENTALITY_LABELS[mentality]],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl bg-surface-2 px-1 py-2">
            <div className="title text-xl leading-tight">{value}</div>
            <div className="text-[11px] text-muted">{label}</div>
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted">{PLAY_STYLE_DESCRIPTIONS[style]}</p>
      {adjusted && live && (
        <p className="mt-2 rounded-lg border border-amber-400/50 bg-amber-950/40 p-2 text-xs font-semibold text-amber-100">
          A IA mudou a postura durante o jogo: a mentalidade escolhida era {MENTALITY_LABELS[live.mentality].toLowerCase()} e agora está {MENTALITY_LABELS[live.activeMentality].toLowerCase()}.
        </p>
      )}
      <div className="mt-3">
        <FieldLineup
          formationId={formationId}
          lineup={lineup}
          players={players}
          kit={{ shirt: team.colors[0], trim: team.colors[1] }}
          numberOf={(id, slot) => assignNumber(numbers.current, 'home', id, slot)}
          fitnessOf={(id) => fitness.get(id) ?? players.get(id)?.condition.fitness ?? 0}
          yellowOf={(id) => yellow.get(id) ?? false}
        />
      </div>
      </div>
      <p className="mt-2 text-[11px] text-muted">{live ? 'Quem está em campo agora, com as trocas e mudanças que a IA fez.' : 'Escalação provável: a IA monta o time pelos disponíveis (sem lesionados e suspensos) e pode mudar na hora.'}</p>
    </Panel>
  )
}
