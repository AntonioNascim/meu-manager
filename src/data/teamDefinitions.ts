/**
 * Times fictícios (nomes inventados, cidades e estados reais do Brasil).
 * Série A: ~4 grandes (16–19), ~8 médios (11–15), ~8 pequenos (7–10). Série B: reputação menor (3–8).
 */

export interface TeamDefinition {
  name: string
  /** 3 letras, único. Também gera o id (`team-xxx`). */
  abbreviation: string
  city: string
  state: string
  colors: [string, string]
  /** 1 = Série A, 2 = Série B. */
  tier: 1 | 2
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
]
