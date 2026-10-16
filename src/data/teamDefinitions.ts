/**
 * Times fictícios (nomes inventados, cidades e estados reais do Brasil).
 * Série A: ~4 grandes (16–19), ~8 médios (11–15), ~8 pequenos (7–10). Série B: reputação menor (3–8). Série C: reputação ainda menor (2–6).
 */

export interface TeamDefinition {
  name: string
  /** 3 letras, único. Também gera o id (`team-xxx`). */
  abbreviation: string
  city: string
  state: string
  colors: [string, string]
  /** 1 = Série A, 2 = Série B, 3 = Série C. */
  tier: 1 | 2 | 3
  reputation: number
}

export const TEAM_DEFINITIONS: readonly TeamDefinition[] = [
  // ---- Série A: grandes ----
  { name: 'Imperial Futebol Clube', abbreviation: 'IMP', city: 'São Paulo', state: 'SP', colors: ['#111111', '#f2f2f2'], tier: 1, reputation: 19 },
  { name: 'Real Carioca', abbreviation: 'RCA', city: 'Rio de Janeiro', state: 'RJ', colors: ['#c8102e', '#111111'], tier: 1, reputation: 18 },
  { name: 'Montanhês Futebol Clube', abbreviation: 'MON', city: 'Belo Horizonte', state: 'MG', colors: ['#1d4ed8', '#f2f2f2'], tier: 1, reputation: 17 },
  { name: 'Pampa Atlético', abbreviation: 'PAM', city: 'Porto Alegre', state: 'RS', colors: ['#0e7a3d', '#1e3a8a'], tier: 1, reputation: 16 },
  // ---- Série A: médios ----
  { name: 'Sol Nascente Esporte Clube', abbreviation: 'SOL', city: 'Salvador', state: 'BA', colors: ['#f59e0b', '#7f1d1d'], tier: 1, reputation: 15 },
  { name: 'Jangadeiros Futebol Clube', abbreviation: 'JAN', city: 'Fortaleza', state: 'CE', colors: ['#2563eb', '#f2f2f2'], tier: 1, reputation: 14 },
  { name: 'Maré Alta Sport Club', abbreviation: 'MAR', city: 'Recife', state: 'PE', colors: ['#dc2626', '#111111'], tier: 1, reputation: 14 },
  { name: 'Araucária Futebol Clube', abbreviation: 'ARA', city: 'Curitiba', state: 'PR', colors: ['#166534', '#f2f2f2'], tier: 1, reputation: 14 },
  { name: 'Candangos Esporte Clube', abbreviation: 'CAN', city: 'Brasília', state: 'DF', colors: ['#facc15', '#1e3a8a'], tier: 1, reputation: 13 },
  { name: 'Cerrado Atlético', abbreviation: 'CER', city: 'Goiânia', state: 'GO', colors: ['#b45309', '#14532d'], tier: 1, reputation: 13 },
  { name: 'Guajará Sport Club', abbreviation: 'GUA', city: 'Belém', state: 'PA', colors: ['#0369a1', '#f2f2f2'], tier: 1, reputation: 12 },
  { name: 'Ilha Azul Futebol Clube', abbreviation: 'ILH', city: 'Florianópolis', state: 'SC', colors: ['#0ea5e9', '#111111'], tier: 1, reputation: 11 },
  // ---- Série A: pequenos ----
  { name: 'Serra Gaúcha Atlético Clube', abbreviation: 'SGA', city: 'Caxias do Sul', state: 'RS', colors: ['#7c2d12', '#facc15'], tier: 1, reputation: 10 },
  { name: 'Locomotiva Futebol Clube', abbreviation: 'LOC', city: 'Campinas', state: 'SP', colors: ['#1f2937', '#f97316'], tier: 1, reputation: 10 },
  { name: 'Vale do Aço Futebol Clube', abbreviation: 'VAL', city: 'Ipatinga', state: 'MG', colors: ['#475569', '#e2e8f0'], tier: 1, reputation: 9 },
  { name: 'Dunas Esporte Clube', abbreviation: 'DUN', city: 'Natal', state: 'RN', colors: ['#ea580c', '#fef3c7'], tier: 1, reputation: 9 },
  { name: 'Alvorada Futebol Clube', abbreviation: 'ALV', city: 'Londrina', state: 'PR', colors: ['#db2777', '#f2f2f2'], tier: 1, reputation: 8 },
  { name: 'Carcará Sport Club', abbreviation: 'CAR', city: 'Campina Grande', state: 'PB', colors: ['#78350f', '#fde68a'], tier: 1, reputation: 8 },
  { name: 'Pantanal Esporte Clube', abbreviation: 'PAN', city: 'Campo Grande', state: 'MS', colors: ['#15803d', '#facc15'], tier: 1, reputation: 7 },
  { name: 'Mandacaru Esporte Clube', abbreviation: 'MAN', city: 'Teresina', state: 'PI', colors: ['#65a30d', '#111111'], tier: 1, reputation: 7 },
  // ---- Série B ----
  { name: 'Arara Azul Futebol Clube', abbreviation: 'ARZ', city: 'Cuiabá', state: 'MT', colors: ['#1d4ed8', '#facc15'], tier: 2, reputation: 8 },
  { name: 'Ilha Rubra Esporte Clube', abbreviation: 'IRU', city: 'São Luís', state: 'MA', colors: ['#b91c1c', '#f2f2f2'], tier: 2, reputation: 8 },
  { name: 'Coqueiral Futebol Clube', abbreviation: 'COQ', city: 'Maceió', state: 'AL', colors: ['#16a34a', '#f2f2f2'], tier: 2, reputation: 7 },
  { name: 'Caju Atlético Clube', abbreviation: 'CAJ', city: 'Aracaju', state: 'SE', colors: ['#f97316', '#111111'], tier: 2, reputation: 7 },
  { name: 'Cabo Branco Sport Club', abbreviation: 'CBR', city: 'João Pessoa', state: 'PB', colors: ['#f2f2f2', '#0284c7'], tier: 2, reputation: 7 },
  { name: 'Nortão Futebol Clube', abbreviation: 'NOR', city: 'Joinville', state: 'SC', colors: ['#7f1d1d', '#f2f2f2'], tier: 2, reputation: 7 },
  { name: 'Café Real Esporte Clube', abbreviation: 'CAF', city: 'Ribeirão Preto', state: 'SP', colors: ['#78350f', '#f2f2f2'], tier: 2, reputation: 6 },
  { name: 'Porto Atlântico Futebol Clube', abbreviation: 'PAT', city: 'Santos', state: 'SP', colors: ['#0f172a', '#38bdf8'], tier: 2, reputation: 6 },
  { name: 'Mantiqueira Futebol Clube', abbreviation: 'MTQ', city: 'Juiz de Fora', state: 'MG', colors: ['#166534', '#facc15'], tier: 2, reputation: 6 },
  { name: 'Rochedo Futebol Clube', abbreviation: 'ROC', city: 'Vitória', state: 'ES', colors: ['#334155', '#f2f2f2'], tier: 2, reputation: 6 },
  { name: 'Madeira Rio Esporte Clube', abbreviation: 'MAD', city: 'Porto Velho', state: 'RO', colors: ['#0e7490', '#f2f2f2'], tier: 2, reputation: 5 },
  { name: 'Seringueiros Futebol Clube', abbreviation: 'SRG', city: 'Rio Branco', state: 'AC', colors: ['#15803d', '#111111'], tier: 2, reputation: 5 },
  { name: 'Jalapão Futebol Clube', abbreviation: 'JAL', city: 'Palmas', state: 'TO', colors: ['#ca8a04', '#1e3a8a'], tier: 2, reputation: 5 },
  { name: 'Zebu Atlético Clube', abbreviation: 'ZEB', city: 'Uberaba', state: 'MG', colors: ['#f2f2f2', '#b91c1c'], tier: 2, reputation: 5 },
  { name: 'Charqueada Futebol Clube', abbreviation: 'CHA', city: 'Pelotas', state: 'RS', colors: ['#991b1b', '#111111'], tier: 2, reputation: 5 },
  { name: 'Teutônico Esporte Clube', abbreviation: 'TEU', city: 'Blumenau', state: 'SC', colors: ['#1e40af', '#f2f2f2'], tier: 2, reputation: 5 },
  { name: 'Pinhal Futebol Clube', abbreviation: 'PIN', city: 'Maringá', state: 'PR', colors: ['#14532d', '#f2f2f2'], tier: 2, reputation: 4 },
  { name: 'Meio do Mundo Esporte Clube', abbreviation: 'MDM', city: 'Macapá', state: 'AP', colors: ['#ca8a04', '#111111'], tier: 2, reputation: 4 },
  { name: 'Monte Roraima Futebol Clube', abbreviation: 'MRR', city: 'Boa Vista', state: 'RR', colors: ['#c2410c', '#f2f2f2'], tier: 2, reputation: 4 },
  { name: 'Tamanduá Esporte Clube', abbreviation: 'TAM', city: 'São José do Rio Preto', state: 'SP', colors: ['#6b21a8', '#f2f2f2'], tier: 2, reputation: 3 },
  // ---- Série C ----
  { name: 'Amazonas Esporte Clube', abbreviation: 'AMZ', city: 'Manaus', state: 'AM', colors: ['#15803d', '#f2f2f2'], tier: 3, reputation: 6 },
  { name: 'Sertão Atlético Clube', abbreviation: 'SER', city: 'Feira de Santana', state: 'BA', colors: ['#b45309', '#111111'], tier: 3, reputation: 6 },
  { name: 'Sorocabana Futebol Clube', abbreviation: 'SOR', city: 'Sorocaba', state: 'SP', colors: ['#7f1d1d', '#facc15'], tier: 3, reputation: 6 },
  { name: 'Anhanguera Esporte Clube', abbreviation: 'ANH', city: 'Anápolis', state: 'GO', colors: ['#1d4ed8', '#facc15'], tier: 3, reputation: 5 },
  { name: 'Agreste Futebol Clube', abbreviation: 'AGR', city: 'Caruaru', state: 'PE', colors: ['#a16207', '#f2f2f2'], tier: 3, reputation: 5 },
  { name: 'Cariri Esporte Clube', abbreviation: 'CRI', city: 'Juazeiro do Norte', state: 'CE', colors: ['#be123c', '#f2f2f2'], tier: 3, reputation: 5 },
  { name: 'Tocantina Futebol Clube', abbreviation: 'TOC', city: 'Imperatriz', state: 'MA', colors: ['#0f766e', '#facc15'], tier: 3, reputation: 5 },
  { name: 'Salineiros Futebol Clube', abbreviation: 'SAL', city: 'Mossoró', state: 'RN', colors: ['#0c4a6e', '#f2f2f2'], tier: 3, reputation: 5 },
  { name: 'Vale do São Francisco Futebol Clube', abbreviation: 'VSF', city: 'Petrolina', state: 'PE', colors: ['#047857', '#f2f2f2'], tier: 3, reputation: 4 },
  { name: 'Norte Mineiro Atlético Clube', abbreviation: 'NMI', city: 'Montes Claros', state: 'MG', colors: ['#9a3412', '#f2f2f2'], tier: 3, reputation: 4 },
  { name: 'Campos Gerais Futebol Clube', abbreviation: 'CGE', city: 'Ponta Grossa', state: 'PR', colors: ['#4d7c0f', '#111111'], tier: 3, reputation: 4 },
  { name: 'Oeste Catarinense Esporte Clube', abbreviation: 'OCA', city: 'Chapecó', state: 'SC', colors: ['#15803d', '#fef9c3'], tier: 3, reputation: 4 },
  { name: 'Planalto Gaúcho Futebol Clube', abbreviation: 'PLA', city: 'Passo Fundo', state: 'RS', colors: ['#1e3a8a', '#dc2626'], tier: 3, reputation: 4 },
  { name: 'Aço Fluminense Futebol Clube', abbreviation: 'ACO', city: 'Volta Redonda', state: 'RJ', colors: ['#374151', '#facc15'], tier: 3, reputation: 4 },
  { name: 'Norte Fluminense Esporte Clube', abbreviation: 'NFL', city: 'Campos dos Goytacazes', state: 'RJ', colors: ['#0369a1', '#f2f2f2'], tier: 3, reputation: 3 },
  { name: 'Carajás Futebol Clube', abbreviation: 'CRJ', city: 'Marabá', state: 'PA', colors: ['#b91c1c', '#facc15'], tier: 3, reputation: 3 },
  { name: 'Tapajós Esporte Clube', abbreviation: 'TAP', city: 'Santarém', state: 'PA', colors: ['#0e7490', '#facc15'], tier: 3, reputation: 3 },
  { name: 'Fronteira Sport Club', abbreviation: 'FRO', city: 'Dourados', state: 'MS', colors: ['#166534', '#fde68a'], tier: 3, reputation: 3 },
  { name: 'Conquista Atlético Clube', abbreviation: 'COT', city: 'Vitória da Conquista', state: 'BA', colors: ['#6d28d9', '#f2f2f2'], tier: 3, reputation: 2 },
  { name: 'Delta do Parnaíba Esporte Clube', abbreviation: 'DEL', city: 'Parnaíba', state: 'PI', colors: ['#075985', '#f2f2f2'], tier: 3, reputation: 2 },
]
