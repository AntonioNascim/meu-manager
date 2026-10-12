export type ScreenId = 'home' | 'squad' | 'tactics' | 'match' | 'standings' | 'finance' | 'market'

export const SCREEN_LABELS: Record<ScreenId, string> = {
  home: 'Painel',
  squad: 'Elenco',
  tactics: 'Tática',
  match: 'Partida',
  standings: 'Tabela',
  finance: 'Finanças',
  market: 'Mercado',
}
