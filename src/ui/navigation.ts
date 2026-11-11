export type ScreenId = 'home' | 'squad' | 'tactics' | 'match' | 'standings' | 'finance' | 'market' | 'contracts' | 'academy' | 'training' | 'career' | 'league' | 'admin' | 'more'

export const SCREEN_LABELS: Record<ScreenId, string> = {
  home: 'Início',
  squad: 'Elenco',
  tactics: 'Tática',
  match: 'Partida',
  standings: 'Tabela',
  finance: 'Finanças',
  market: 'Mercado',
  contracts: 'Contratos',
  academy: 'Base',
  training: 'Treino',
  career: 'Carreira',
  league: 'Liga',
  admin: 'ADM',
  more: 'Mais',
}

/** Abas da barra de baixo. */
export type NavTab = 'home' | 'standings' | 'squad' | 'market' | 'more'

/** Qual aba fica acesa em cada tela (Tática, Base e Treino pertencem ao Elenco, Partida ao Início, Contratos às Transferências; Finanças, Carreira e liga ficam em Mais). */
export const NAV_TAB_OF: Record<ScreenId, NavTab> = {
  home: 'home',
  match: 'home',
  squad: 'squad',
  tactics: 'squad',
  market: 'market',
  contracts: 'market',
  academy: 'squad',
  training: 'squad',
  career: 'more',
  league: 'more',
  admin: 'more',
  standings: 'standings',
  finance: 'more',
  more: 'more',
}
