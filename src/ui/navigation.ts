export type ScreenId = 'home' | 'squad' | 'tactics' | 'match' | 'standings' | 'finance' | 'market' | 'contracts' | 'academy' | 'training' | 'training'

export const SCREEN_LABELS: Record<ScreenId, string> = {
  home: 'Clube',
  squad: 'Elenco',
  tactics: 'Tática',
  match: 'Partida',
  standings: 'Tabela',
  finance: 'Finanças',
  market: 'Mercado',
  contracts: 'Contratos',
  academy: 'Base',
  training: 'Treino',
}

/** Abas da barra de baixo. */
export type NavTab = 'home' | 'squad' | 'market' | 'standings' | 'finance'

/** Qual aba fica acesa em cada tela (Tática pertence ao Elenco, Partida ao Clube, Contratos ao Mercado). */
export const NAV_TAB_OF: Record<ScreenId, NavTab> = {
  home: 'home',
  match: 'home',
  squad: 'squad',
  tactics: 'squad',
  market: 'market',
  contracts: 'market',
  academy: 'squad',
  training: 'squad',
  standings: 'standings',
  finance: 'finance',
}
