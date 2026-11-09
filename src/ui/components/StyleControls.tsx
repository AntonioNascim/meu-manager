import type { Mentality, PlayStyle } from '../../engine/types'
import { PLAY_STYLES } from '../../engine/types'
import { MENTALITY_LABELS, PLAY_STYLE_DESCRIPTIONS, PLAY_STYLE_LABELS } from '../labels'
import { Card, Segmented } from './ui'

const MENTALITIES: Mentality[] = [-2, -1, 0, 1, 2]

/**
 * Estilo de jogo e mentalidade do time: o mesmo seletor na Escalação, na Tática e na partida. O estilo e a mentalidade são os do time (`Tactic.style` e
 * `Tactic.mentality`), então mudar numa tela muda nas outras; os estilos são `PLAY_STYLES`, a mesma lista do motor.
 */
export function StyleControls({ style, mentality, onStyle, onMentality }: { style: PlayStyle; mentality: Mentality; onStyle: (s: PlayStyle) => void; onMentality: (m: Mentality) => void }) {
  return (
    <>
      <Card title="Estilo de jogo">
        <div data-testid="style-controls">
          <Segmented columns={3} value={style} options={PLAY_STYLES.map((s) => ({ id: s, label: PLAY_STYLE_LABELS[s] }))} onChange={onStyle} />
        </div>
        <p className="mt-2 text-xs text-slate-400">{PLAY_STYLE_DESCRIPTIONS[style]}</p>
      </Card>
      <Card title="Mentalidade">
        <Segmented value={mentality} options={MENTALITIES.map((m) => ({ id: m, label: MENTALITY_LABELS[m] }))} onChange={onMentality} />
      </Card>
    </>
  )
}
