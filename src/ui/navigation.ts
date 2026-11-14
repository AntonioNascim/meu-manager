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

/** Jogador de outro técnico humano que a pessoa quer propor: o Mercado abre na aba Técnicos já com ele escolhido. */
export interface CoachTarget {
  playerId: string
  teamId: string
}
let coachTarget: CoachTarget | null = null

/** Pede ao app para ir à aba Técnicos do Mercado com este jogador escolhido (a tela de origem se fecha ao trocar de tela). */
export function goToCoachTrade(target: CoachTarget): void {
  coachTarget = target
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('mm-navigate', { detail: { screen: 'market' satisfies ScreenId, tab: 'coaches' } }))
}

/** Entrega o pedido uma vez só (a aba Técnicos o consome ao abrir). */
export function takeCoachTarget(): CoachTarget | null {
  const t = coachTarget
  coachTarget = null
  return t
}
