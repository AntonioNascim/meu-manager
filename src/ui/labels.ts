/**
 * Rótulos em português para exibir na interface.
 * O motor e os tipos usam valores em inglês; só a UI traduz.
 * Os `Record` abaixo fazem o TypeScript acusar rótulo faltando quando um valor novo é criado.
 */
import type { PackageIssue } from '../data/package/types'
import type { CsvIssue } from '../data/package/edit/csv'
import type { CupEntrantSource, CupFormat, CupSpec, Region } from '../engine/types'
import { COUNTRY_INFO } from './countries'
import type {
  BoardStatus,
  TrainingFocus,
  TrainingIntensity,
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
import type { InterestLevel, MarketSort, QuickFilter, Situation, SquadRole } from '../engine/market'

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

/** Nome em português de cada país (a nacionalidade do jogador); a lista vem de `countries.ts`. */
export const NATIONALITY_LABELS = Object.fromEntries(Object.entries(COUNTRY_INFO).map(([id, c]) => [id, c.name])) as Record<Nationality, string>

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
  'tv-rights': 'Cota de TV',
  'player-sales': 'Venda de jogadores',
  salaries: 'Salários',
  'player-purchases': 'Compra de jogadores',
  severance: 'Rescisões de contrato',
  operations: 'Operação e estrutura',
  'cup-prize': 'Premiação das copas',
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
export const TIER_LABELS: Record<1 | 2 | 3, string> = {
  1: 'Série A',
  2: 'Série B',
  3: 'Série C',
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
  'salary-budget': 'Orçamento de salários insuficiente: ajuste a divisão em Finanças',
  'squad-full': 'Elenco cheio',
  'foreign-limit': 'Limite de estrangeiros da liga: o clube não pode ter mais um',
  'window-closed': 'Janela de transferências fechada',
  'own-player': 'O jogador já é do seu time',
  duplicate: 'Já existe uma proposta pendente por ele',
  invalid: 'Proposta inválida',
  'no-interest': 'O clube não tem interesse no jogador',
  'not-eligible': 'Só vale para quem está no último ano de contrato, a partir de julho',
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

import type { NumbersKey, PositionGroup, SquadSortKey } from './squadSort'

export const POSITION_GROUP_LABELS: Record<PositionGroup, string> = {
  all: 'Todos',
  GK: 'GOL',
  DEF: 'DEF',
  MID: 'MEI',
  FWD: 'ATA',
}

export const SQUAD_SORT_LABELS: Record<SquadSortKey, string> = {
  position: 'Posição',
  name: 'Nome',
  age: 'Idade',
  overall: 'Força',
  fitness: 'Condição',
  form: 'Forma',
  morale: 'Moral',
}

export const NUMBERS_LABELS: Record<NumbersKey, string> = {
  name: 'Jogador',
  games: 'J',
  goals: 'G',
  assists: 'A',
  yellow: 'Amarelos',
  red: 'Vermelhos',
  rating: 'Nota',
}

/** Treino coletivo: intensidade e foco. */
export const TRAINING_INTENSITY_LABELS: Record<TrainingIntensity, string> = {
  light: 'Leve',
  normal: 'Normal',
  intense: 'Intensa',
}

/** O que cada intensidade faz: evolução, recuperação da condição e risco de lesão, de 1 a 5 (3 = Normal). */
export const TRAINING_INTENSITY_LEVELS: Record<TrainingIntensity, { growth: number; recovery: number; injury: number; summary: string }> = {
  light: { growth: 2, recovery: 4, injury: 1, summary: 'Evolui menos, recupera mais a condição e quase não machuca.' },
  normal: { growth: 3, recovery: 3, injury: 2, summary: 'O ritmo padrão: evolução normal e risco baixo.' },
  intense: { growth: 4, recovery: 2, injury: 4, summary: 'Evolui mais, mas cansa o elenco e aumenta o risco de lesão.' },
}

export const TRAINING_FOCUS_LABELS: Record<TrainingFocus, string> = {
  balanced: 'Equilibrado',
  physical: 'Físico',
  technical: 'Técnico',
  defensive: 'Defensivo',
  offensive: 'Ofensivo',
}

export const TRAINING_FOCUS_DESCRIPTIONS: Record<TrainingFocus, string> = {
  balanced: 'Todos os atributos evoluem no mesmo ritmo.',
  physical: 'Velocidade, resistência e força evoluem mais.',
  technical: 'Passe, finalização, drible, cruzamento e controle evoluem mais.',
  defensive: 'Desarme, cabeceio, posicionamento, força e determinação evoluem mais (e os reflexos do goleiro).',
  offensive: 'Finalização, drible, cruzamento, passe, velocidade e visão evoluem mais.',
}

/** Interesse do jogador em vir para o seu clube. */
export const INTEREST_LABELS: Record<InterestLevel, string> = {
  none: 'nenhum',
  low: 'baixo',
  medium: 'médio',
  high: 'alto',
}

export const INTEREST_COLORS: Record<InterestLevel, string> = {
  none: 'text-loss',
  low: 'text-orange-400',
  medium: 'text-amber-300',
  high: 'text-win',
}

export const SITUATION_LABELS: Record<Situation, string> = {
  all: 'Todos',
  club: 'Com clube',
  free: 'Livres',
  expiring: 'Contrato acabando',
}

export const QUICK_FILTER_LABELS: Record<QuickFilter, string> = {
  budget: 'Cabem no bolso',
  bargain: 'Barganhas',
  prospect: 'Jovens promessas',
  expiring: 'Contrato acabando',
}

export const MARKET_SORT_LABELS: Record<MarketSort, string> = {
  overall: 'Maior força',
  age: 'Mais jovem',
  'value-desc': 'Maior valor',
  'value-asc': 'Menor valor',
  salary: 'Menor salário',
}

/** Nome da formação: as prontas pelo número; a montada à mão aparece como "Livre". */
export const formationLabel = (id: string): string => (id === 'custom' ? 'Livre' : id)

/** Mensagem de um problema do pacote de dados (campos faltando, clube sem jogadores, liga com número errado de times...). */
export function packageIssueText(issue: PackageIssue): string {
  const { code, path, detail, expected } = issue
  switch (code) {
    case 'not-json': return 'O arquivo não é um JSON válido.'
    case 'not-object': return 'O arquivo não tem o formato de um pacote de dados.'
    case 'wrong-format': return 'Este arquivo não é um pacote do Meu Manager (o campo "format" precisa ser "meu-manager-package").'
    case 'newer-version': return `O pacote é da versão ${detail}; este jogo lê até a versão ${expected}. Atualize o jogo.`
    case 'missing-field': return `Falta o campo "${detail}" em ${path}.`
    case 'wrong-type': return `O campo "${detail}" em ${path} está com o tipo errado.`
    case 'out-of-range': return `Valor fora do permitido em ${path}: ${detail} (esperado: ${expected}).`
    case 'duplicate-id': return `Repetido em ${path}: "${detail}" já existe no pacote.`
    case 'unknown-reference': return `${path} aponta para "${detail}", que não existe no pacote.`
    case 'unknown-value': return `Valor desconhecido em ${path}: "${detail}".`
    case 'bad-date': return `Data inválida em ${path}: "${detail}" (use AAAA-MM-DD).`
    case 'bad-color': return `Cor inválida em ${path}: "${detail}" (use #rrggbb).`
    case 'club-without-players': return `O clube "${detail}" (${path}) não tem jogadores.`
    case 'club-squad-size': return `O clube em ${path} tem ${detail} jogadores; o elenco precisa ter de ${String(expected).replace('–', ' a ')}.`
    case 'club-no-goalkeeper': return `O clube "${detail}" (${path}) não tem goleiro.`
    case 'league-team-count': return `A liga em ${path.replace(/\.teams$/, '')} declara ${expected} times, mas o pacote tem ${detail} clubes nela.`
    case 'league-size-unsupported': return `Cada divisão precisa ter um número par de times, de 4 a 40 (${path} declara ${detail}).`
    case 'league-promotion': return `Acesso e rebaixamento em ${path}: o número precisa ser ${expected} (veio ${detail}); quem cai de uma divisão é quem sobe para a de baixo.`
    case 'unsupported-leagues': return `O país "${expected}" tem ${detail} divisões em ${path}. Cada país precisa ter de 1 a 3 divisões em sequência (nível 1, 2 e 3).`
    case 'league-defaults-missing': return `Não há economia padrão para o país "${detail}" (${path}): a liga usa a do Brasil e as janelas da Europa. Preencha "economy" e "region" da liga se quiser outra coisa.`
    case 'cup-defaults-skipped': return `As copas padrão de "${detail}" não cabem nas ligas dele (poucos clubes para o chaveamento) e ficam de fora; defina as copas do país em "cups" se quiser.`
    case 'cup-bracket': return `A copa em ${path} não fecha o chaveamento: ${detail}.`
    case 'cup-groups': return `Fase de grupos ou de liga da copa em ${path}: ${detail}.`
    case 'tiebreakers-unsupported': return `Os critérios de desempate de ${path} são diferentes dos do jogo e serão ignorados: vale a ordem padrão.`
  }
}

/** Região das janelas de transferência e das copas continentais. */
export const REGION_LABELS: Record<Region, string> = {
  BR: 'Brasil',
  SA: 'América do Sul',
  EU: 'Europa',
  NA: 'América do Norte',
  AF: 'África',
  AS: 'Ásia',
  OC: 'Oceania',
}

export const CUP_FORMAT_LABELS: Record<CupFormat, string> = {
  knockout: 'Mata-mata',
  'groups-knockout': 'Grupos e mata-mata',
  'league-knockout': 'Fase de liga e mata-mata',
}

export const CUP_SEEDING_LABELS: Record<NonNullable<CupSpec['seeding']>, string> = {
  random: 'Sorteio livre',
  seeded: 'Cabeças de chave pela reputação',
  ranked: 'Cabeças de chave pela fase anterior',
}

export const CUP_HOME_LABELS: Record<NonNullable<CupSpec['homeOfSingleLeg']>, string> = {
  draw: 'Sorteio',
  'lower-reputation': 'Menor reputação',
  'higher-reputation': 'Maior reputação',
  'lower-division': 'Divisão inferior',
  'first-listed': 'Primeiro listado',
}

export const CUP_SOURCE_LABELS: Record<CupEntrantSource['type'], string> = {
  league: 'Clubes de uma liga',
  cup: 'Campeão ou vice de outra copa',
  region: 'Mais fortes de um continente',
  'cup-group-place': 'Colocados dos grupos de outra copa',
}

/** Mensagem de um problema de uma planilha (CSV) de jogadores ou clubes; a linha é a da planilha. */
export function csvIssueText(issue: CsvIssue): string {
  const where = issue.line > 0 ? `Linha ${issue.line}${issue.column ? `, coluna "${issue.column}"` : ''}: ` : ''
  switch (issue.code) {
    case 'empty-file': return 'A planilha está vazia.'
    case 'missing-column': return `Falta a coluna "${issue.column}" no cabeçalho (primeira linha).`
    case 'bad-quote': return 'Há aspas sem fechar: algum campo ficou aberto.'
    case 'missing-field': return `${where}campo obrigatório vazio.`
    case 'bad-number': return `${where}"${issue.detail}" não é um número inteiro.`
    case 'out-of-range': return `${where}valor fora do permitido: ${issue.detail}.`
    case 'unknown-value': return `${where}valor desconhecido: "${issue.detail}".`
    case 'bad-date': return `${where}data inválida "${issue.detail}" (use AAAA-MM-DD ou DD/MM/AAAA).`
    case 'bad-color': return `${where}cor inválida "${issue.detail}" (use #rrggbb).`
    case 'duplicate-id': return `${where}id repetido na planilha: ${issue.detail}.`
    case 'unknown-club': return `${where}o clube "${issue.detail}" não existe no pacote (importe os clubes antes).`
    case 'unknown-league': return `${where}a liga "${issue.detail}" não existe no pacote.`
    case 'attributes-incomplete': return `${where}atributos incompletos (${issue.detail}): preencha os 16 ou deixe todos vazios.`
    case 'too-many-positions': return `${where}no máximo 2 posições secundárias (veio ${issue.detail}).`
    case 'duplicate-abbreviation': return `${where}sigla repetida na planilha: ${issue.detail}.`
  }
}
