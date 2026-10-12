export type ScreenId = 'home' | 'squad' | 'tactics' | 'match' | 'standings'

export const SCREEN_LABELS: Record<ScreenId, string> = {
  home: 'Painel',
  squad: 'Elenco',
  tactics: 'Tática',
  match: 'Partida',
  standings: 'Tabela',
}
