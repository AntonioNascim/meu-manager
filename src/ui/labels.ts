/**
 * Rótulos em português para exibir na interface.
 * O motor e os tipos usam valores em inglês; só a UI traduz.
 * Os `Record` abaixo fazem o TypeScript acusar rótulo faltando quando um valor novo é criado.
 */
import type {
  BoardStatus,
  DismissalReason,
  AttributeName,
  CompetitionType,
  FinanceCategory,
  Foot,
  Mentality,
  MatchEventType,
  MatchStatus,
  OfferKind,
  OfferReason,
  OfferStatus,
  Nationality,
  PlayStyle,
  Position,
  SeasonPhase,
  Sector,
  TeamMatchStats,
  WindowName,
} from '../engine/types'
import type { SquadRole } from '../engine/market'

export const POSITION_LABELS: Record<Position, string> = {
  GK: 'Goleiro',
  RB: 'Lateral direito',
  LB: 'Lateral esquerdo',
  CB: 'Zagueiro',
  DM: 'Volante',
  CM: 'Meio-campista',
  AM: 'Meia atacante',
  RW: 'Ponta direita',
  LW: 'Ponta esquerda',
  ST: 'Atacante',
}

/** Abreviações usadas em tabelas e campinho. */
export const POSITION_SHORT_LABELS: Record<Position, string> = {
  GK: 'GOL',
  RB: 'LD',
  LB: 'LE',
  CB: 'ZAG',
  DM: 'VOL',
  CM: 'MC',
  AM: 'MEI',
  RW: 'PD',
  LW: 'PE',
  ST: 'ATA',
}

export const NATIONALITY_LABELS: Record<Nationality, string> = {
  Brazil: 'Brasil',
  Argentina: 'Argentina',
  Uruguay: 'Uruguai',
  Paraguay: 'Paraguai',
  Chile: 'Chile',
  Colombia: 'Colômbia',
  Peru: 'Peru',
  Ecuador: 'Equador',
}

export const FOOT_LABELS: Record<Foot, string> = {
  right: 'Direito',
  left: 'Esquerdo',
  both: 'Ambos',
}

export const ATTRIBUTE_LABELS: Record<AttributeName, string> = {
  passing: 'Passe',
  finishing: 'Finalização',
  dribbling: 'Drible',
  crossing: 'Cruzamento',
  tackling: 'Desarme',
  heading: 'Cabeceio',
  ballControl: 'Controle de bola',
  pace: 'Velocidade',
  stamina: 'Resistência',
  strength: 'Força',
  vision: 'Visão',
  positioning: 'Posicionamento',
  decisions: 'Decisão',
  determination: 'Determinação',
  reflexes: 'Reflexos',
  rushingOut: 'Saída do gol',
}

export const PLAY_STYLE_LABELS: Record<PlayStyle, string> = {
  possession: 'Posse de bola',
  'counter-attack': 'Contra-ataque',
  'high-press': 'Pressão alta',
}

export const MENTALITY_LABELS: Record<Mentality, string> = {
  [-2]: 'Muito defensiva',
  [-1]: 'Defensiva',
  0: 'Equilibrada',
  1: 'Ofensiva',
  2: 'Muito ofensiva',
}

export const SECTOR_LABELS: Record<Sector, string> = {
  defense: 'Defesa',
  midfield: 'Meio-campo',
  attack: 'Ataque',
}

export const FINANCE_CATEGORY_LABELS: Record<FinanceCategory, string> = {
  'ticket-sales': 'Bilheteria',
  sponsorship: 'Patrocínio',
  'player-sales': 'Venda de jogadores',
  salaries: 'Salários',
  'player-purchases': 'Compra de jogadores',
  operations: 'Operação e estrutura',
}

export const COMPETITION_TYPE_LABELS: Record<CompetitionType, string> = {
  league: 'Liga',
}

export const SEASON_PHASE_LABELS: Record<SeasonPhase, string> = {
  'pre-season': 'Pré-temporada',
  'in-season': 'Em andamento',
  'end-of-season': 'Encerramento',
}

export const MATCH_STATUS_LABELS: Record<MatchStatus, string> = {
  scheduled: 'Agendada',
  finished: 'Finalizada',
}

export const MATCH_EVENT_LABELS: Record<MatchEventType, string> = {
  goal: 'Gol',
  'own-goal': 'Gol contra',
  'missed-penalty': 'Pênalti perdido',
  'yellow-card': 'Cartão amarelo',
  'red-card': 'Cartão vermelho',
  injury: 'Lesão',
  substitution: 'Substituição',
  corner: 'Escanteio',
  foul: 'Falta',
}

/** Nome da série (divisão) pelo nível na pirâmide. */
export const TIER_LABELS: Record<1 | 2, string> = {
  1: 'Série A',
  2: 'Série B',
}

/** Resultado de uma partida do ponto de vista de um time. */
export const OUTCOME_LABELS: Record<'W' | 'D' | 'L', string> = {
  W: 'Vitória',
  D: 'Empate',
  L: 'Derrota',
}

/** Letra curta do resultado (V, E, D) nas sequências de forma. */
export const OUTCOME_SHORT_LABELS: Record<'W' | 'D' | 'L', string> = {
  W: 'V',
  D: 'E',
  L: 'D',
}

export type AttributeGroup = 'technical' | 'physical' | 'mental' | 'goalkeeper'

export const ATTRIBUTE_GROUP_LABELS: Record<AttributeGroup, string> = {
  technical: 'Técnicos',
  physical: 'Físicos',
  mental: 'Mentais',
  goalkeeper: 'Goleiro',
}

/** Resumo de cada estilo (o que ganha e o que custa) mostrado na tela de tática. */
export const PLAY_STYLE_DESCRIPTIONS: Record<PlayStyle, string> = {
  possession: 'Fica mais com a bola e controla o meio, mas cria menos chances cara a cara.',
  'counter-attack': 'Cede a bola, mas ataca em transições rápidas de alta qualidade.',
  'high-press': 'Recupera a bola no campo do rival e sai em velocidade, mas cansa mais e deixa espaço nas costas.',
}

/** Estatísticas da partida (na ordem em que aparecem). */
export const MATCH_STAT_LABELS: Record<keyof TeamMatchStats, string> = {
  possession: 'Posse de bola (%)',
  shots: 'Finalizações',
  shotsOnTarget: 'No alvo',
  corners: 'Escanteios',
  fouls: 'Faltas',
  yellowCards: 'Cartões amarelos',
  redCards: 'Cartões vermelhos',
  xg: 'Gols esperados (xG)',
}

/** Zonas da classificação. */
export type Zone = 'promotion' | 'relegation'

export const ZONE_LABELS: Record<Zone, string> = {
  promotion: 'Zona de acesso',
  relegation: 'Zona de rebaixamento',
}

export const SET_PIECE_LABELS: Record<'penalty' | 'free-kick', string> = {
  penalty: 'Pênaltis',
  'free-kick': 'Faltas',
}

export const OFFER_REASON_LABELS: Record<OfferReason, string> = {
  fee: 'Valor abaixo do que o clube pede',
  'squad-size': 'O clube não pode ficar com elenco tão curto',
  'position-cover': 'O clube não tem reposição para a posição',
  'key-player': 'Jogador importante demais para o clube vender',
  salary: 'Salário abaixo do que o jogador quer',
  'club-reputation': 'O jogador não quer o clube',
  'playing-time': 'O jogador não terá espaço no time',
  unavailable: 'Jogador não está mais disponível',
  budget: 'Orçamento de transferências insuficiente',
  'salary-budget': 'Orçamento de salários insuficiente',
  'squad-full': 'Elenco cheio',
  'window-closed': 'Janela de transferências fechada',
  'own-player': 'O jogador já é do seu time',
  duplicate: 'Já existe uma proposta pendente por ele',
  invalid: 'Proposta inválida',
  'no-interest': 'O clube não tem interesse no jogador',
}

export const OFFER_STATUS_LABELS: Record<OfferStatus, string> = {
  pending: 'Aguardando',
  accepted: 'Aceita',
  rejected: 'Recusada',
  withdrawn: 'Cancelada',
  expired: 'Vencida',
}

export const OFFER_KIND_LABELS: Record<OfferKind, string> = {
  purchase: 'Compra',
  loan: 'Empréstimo',
}

export const WINDOW_LABELS: Record<WindowName, string> = {
  'pre-season': 'Pré-temporada',
  'mid-year': 'Meio do ano',
}

export const SQUAD_ROLE_LABELS: Record<SquadRole, string> = {
  key: 'Essencial',
  starter: 'Titular',
  rotation: 'Rodízio',
  surplus: 'Sobra',
}

export const BOARD_STATUS_LABELS: Record<BoardStatus, string> = {
  safe: 'Diretoria satisfeita',
  warning: 'Diretoria preocupada',
  danger: 'Seu cargo está ameaçado',
}

export const DISMISSAL_REASON_LABELS: Record<DismissalReason, string> = {
  results: 'Os resultados ficaram muito abaixo do que a diretoria esperava.',
  finances: 'O clube mergulhou em dívidas.',
}
