/**
 * Catálogo dos exercícios do treino por dia. Cada exercício tem:
 * - `focus`: para onde vai o ganho de atributos naquele dia (o mesmo `TrainingFocus` do plano; a média dos pesos é 1, então o exercício
 *   muda para onde vai o ganho, não quanto);
 * - `load`: a carga do dia. Sobe o risco de lesão na proporção e tira um pouco da recuperação diária da condição;
 * - `growth`: multiplica o ganho do dia (1 para todos, menos os dias leves de recuperação e vídeo);
 * - `themes`: o que a semana ensaia (os medidores só informam, nunca entram em conta do motor de partida).
 * Nada aqui toca no motor de partida: o treino por dia só reparte o ganho de evolução que a intensidade e o foco já calibram.
 */
import type { DrillGroup, DrillId, DrillTheme, TrainingFocus } from '../types'

export interface DrillSpec {
  group: DrillGroup
  focus: TrainingFocus
  load: number
  growth: number
  themes: Partial<Record<DrillTheme, 1 | 2>>
}

export const DRILLS: Record<DrillId, DrillSpec> = {
  // Partidas e jogos reduzidos
  'full-match': { group: 'games', focus: 'balanced', load: 1, growth: 1, themes: { 'build-up': 1, press: 1, block: 1, attack: 1, transitions: 1 } },
  'eight-a-side': { group: 'games', focus: 'physical', load: 1.1, growth: 1, themes: { attack: 1, transitions: 1, press: 1 } },
  'six-a-side': { group: 'games', focus: 'defensive', load: 1.2, growth: 1, themes: { press: 2, transitions: 1 } },
  'five-a-side': { group: 'games', focus: 'technical', load: 1.25, growth: 1, themes: { attack: 1, transitions: 1 } },
  'joker-possession': { group: 'games', focus: 'technical', load: 1.1, growth: 1, themes: { 'build-up': 2 } },
  'three-a-side': { group: 'games', focus: 'physical', load: 1.4, growth: 1, themes: { attack: 1 } },
  rondo: { group: 'games', focus: 'technical', load: 0.5, growth: 1, themes: { 'build-up': 1, press: 1 } },
  // Saída de bola
  'build-from-back': { group: 'build-up', focus: 'technical', load: 0.8, growth: 1, themes: { 'build-up': 2 } },
  'keeper-start': { group: 'build-up', focus: 'technical', load: 0.6, growth: 1, themes: { 'build-up': 2 } },
  'midfield-pivot': { group: 'build-up', focus: 'technical', load: 0.8, growth: 1, themes: { 'build-up': 1, transitions: 1 } },
  'wide-exit': { group: 'build-up', focus: 'technical', load: 0.8, growth: 1, themes: { 'build-up': 2 } },
  // Pressão e bloco
  'high-press-trigger': { group: 'press-block', focus: 'defensive', load: 1.2, growth: 1, themes: { press: 2, transitions: 1 } },
  'mid-block': { group: 'press-block', focus: 'defensive', load: 0.9, growth: 1, themes: { block: 2 } },
  'low-block': { group: 'press-block', focus: 'defensive', load: 0.8, growth: 1, themes: { block: 2 } },
  'counter-press': { group: 'press-block', focus: 'defensive', load: 1.15, growth: 1, themes: { press: 1, transitions: 2 } },
  // Ataque
  'overlap-crosses': { group: 'attack', focus: 'offensive', load: 0.9, growth: 1, themes: { attack: 2 } },
  'one-two-wall': { group: 'attack', focus: 'offensive', load: 0.8, growth: 1, themes: { attack: 2 } },
  'finishing-box': { group: 'attack', focus: 'offensive', load: 0.8, growth: 1, themes: { attack: 2 } },
  'counter-run': { group: 'attack', focus: 'offensive', load: 1.1, growth: 1, themes: { attack: 1, transitions: 2 } },
  // Último passe
  'through-balls': { group: 'final-pass', focus: 'technical', load: 0.8, growth: 1, themes: { attack: 2 } },
  cutback: { group: 'final-pass', focus: 'offensive', load: 0.8, growth: 1, themes: { attack: 2 } },
  'third-man': { group: 'final-pass', focus: 'technical', load: 0.8, growth: 1, themes: { attack: 1, 'build-up': 1 } },
  'long-diagonal': { group: 'final-pass', focus: 'technical', load: 0.7, growth: 1, themes: { attack: 1, transitions: 1 } },
  // Bola parada
  'corners-for': { group: 'set-pieces', focus: 'offensive', load: 0.5, growth: 1, themes: { 'set-piece': 2 } },
  'corners-against': { group: 'set-pieces', focus: 'defensive', load: 0.5, growth: 1, themes: { 'set-piece': 2, block: 1 } },
  'free-kicks': { group: 'set-pieces', focus: 'technical', load: 0.5, growth: 1, themes: { 'set-piece': 2 } },
  'penalty-shootout': { group: 'set-pieces', focus: 'technical', load: 0.4, growth: 1, themes: { 'set-piece': 1 } },
  // Corpo e mente
  'conditioning-circuit': { group: 'body-mind', focus: 'physical', load: 1.3, growth: 1, themes: {} },
  'speed-agility': { group: 'body-mind', focus: 'physical', load: 1.25, growth: 1, themes: {} },
  'strength-circuit': { group: 'body-mind', focus: 'physical', load: 1.2, growth: 1, themes: {} },
  'recovery-session': { group: 'body-mind', focus: 'balanced', load: 0.35, growth: 0.7, themes: {} },
  'video-session': { group: 'body-mind', focus: 'balanced', load: 0.3, growth: 0.85, themes: {} },
}

/** O dia de folga: quase não evolui, recupera mais e não machuca. */
export const REST_DAY = { growth: 0.4, recovery: 1.25, ceiling: 100, injury: 0 } as const

export const drillsOf = (group: DrillGroup): DrillId[] => (Object.keys(DRILLS) as DrillId[]).filter((id) => DRILLS[id].group === group)
