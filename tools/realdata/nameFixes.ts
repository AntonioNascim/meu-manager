/**
 * Correções de nome já conferidas (vandalismo e erros da Wikipedia/Wikidata achados pela varredura `nameScan.ts`). Entram em toda rodada do
 * `dados:finalizar` por cima das planilhas, junto com as correções à mão (`correcoes.json`, que vencem em caso de conflito): assim o que foi
 * corrigido não volta numa coleta nova, mesmo se a pasta `dados-reais/` for refeita do zero.
 * Para corrigir outro nome: acrescente uma linha aqui (ou use a planilha de tarefas, campo `nome`/`apelido`).
 */
import type { Correction, CorrectionField } from './corrections'

export interface NameFix {
  id: string
  field: Extract<CorrectionField, 'name' | 'nickname' | 'city' | 'stadiumName' | 'shortName'>
  /** Valor certo; vazio no apelido = sem apelido. */
  value: string
  /** O que estava errado (para o relatório). */
  was: string
  why: string
}

export const NAME_FIXES: readonly NameFix[] = [
  // Vandalismo
  { id: 'wd-Q3660120', field: 'name', value: 'Carlos Quintana', was: 'Carlos Quintana El Destructor De Cacas', why: 'ofensa escrita no nome' },
  { id: 'wd-Q105726105', field: 'name', value: 'Sebastián Meza', was: 'Sebastián Meza la mamá de mazzanti bien rica', why: 'frase ofensiva no nome' },
  { id: 'wd-Q17619668', field: 'name', value: 'Leandro Miguel Fernández', was: 'Leandro Miguel Fernández bullanguero', why: 'palavra solta no fim do nome' },
  { id: 'wd-Q2843080', field: 'nickname', value: '', was: '"Superman ecuatoriano" "Flash" "Super Fenner" "Ennerman" The Chivo', why: 'lista de apelidos de torcida (Enner Valencia já é o nome)' },
  { id: 'wd-Q3779221', field: 'name', value: 'Guido Carrillo', was: 'Guido Carrillo EL GOAT', why: 'apelido gritado no nome' },
  { id: 'wd-Q87447048', field: 'nickname', value: '', was: 'Marsexlino Marcy Nunes', why: 'nome do jogador (Marcelino Núñez) trocado por brincadeira com palavra de sexo' },
  { id: 'wd-Q85877542', field: 'name', value: 'Santi Ramos Mingo', was: 'Santi Ramos pingo', why: 'sobrenome trocado por palavra em minúscula' },
  // Erros de digitação e de escrita
  { id: 'wd-Q222151', field: 'name', value: 'João Moutinho', was: 'João Moutinh0', why: 'zero no lugar do "o"' },
  { id: 'wd-Q27990922', field: 'name', value: 'Ayumu Seko', was: 'Ayumu Seko 67', why: 'número no nome' },
  { id: 'wd-Q26251380', field: 'name', value: 'Francisco Venegas', was: 'Francisco "Paco" Venegas', why: 'apelido entre aspas no nome' },
  { id: 'wd-Q60736591', field: 'name', value: 'Brian Rodríguez', was: 'Brian RodríguezF', why: 'letra sobrando' },
  { id: 'wd-Q16302370', field: 'name', value: 'Guido Nahuel Vadalá', was: 'Guido nahuel Vadalá', why: 'minúscula' },
  { id: 'wd-Q17478131', field: 'name', value: 'Ignacio Malcorra', was: 'Ignacio Malcorra fernandez', why: 'sobrenome repetido em minúscula' },
  { id: 'wd-Q57304482', field: 'name', value: 'Renzo Pesuti', was: 'Renzo pesuti', why: 'minúscula' },
  { id: 'wd-Q5932256', field: 'name', value: 'Joaquín Martes', was: 'Joaquín martes', why: 'minúscula' },
  { id: 'wd-Q61066571', field: 'name', value: 'Axel Vigo', was: 'axel vigo', why: 'minúscula' },
  { id: 'wd-Q123740992', field: 'name', value: 'Leonardo Vonić', was: 'Leonardo VoniÄ‡', why: 'letras com a codificação errada' },
  { id: 'wd-Q108159340', field: 'name', value: 'Arda Güler', was: 'Αrda Güler (com alfa grego)', why: 'letra grega no lugar do "A"' },
  // Códigos do Wikidata no lugar do texto
  { id: 'wd-Q10512', field: 'city', value: 'Elche', was: 'Q10509', why: 'código do Wikidata no lugar da cidade' },
  { id: 'wd-Q19516', field: 'city', value: 'Lille', was: 'Q3034480', why: 'código do Wikidata no lugar da cidade' },
  { id: 'wd-Q616380', field: 'city', value: 'Cúcuta', was: 'Q216847', why: 'código do Wikidata no lugar da cidade' },
  { id: 'wd-Q704', field: 'city', value: 'Lyon', was: 'Q124014090', why: 'código do Wikidata no lugar da cidade' },
  { id: 'wd-Q332833', field: 'stadiumName', value: 'Estadio Arturo Cumplido Sierra', was: 'Q5847777', why: 'código do Wikidata no lugar do estádio' },
  { id: 'wd-Q5136217', field: 'stadiumName', value: 'Estadio La Fortaleza', was: 'Q5848075', why: 'código do Wikidata no lugar do estádio' },
  { id: 'wd-Q736937', field: 'stadiumName', value: 'Estadio Hidalgo', was: 'Gorda hilda', why: 'nome do estádio trocado por ofensa' },
  { id: 'wd-Q584316', field: 'stadiumName', value: 'Estadio Jardines del Hipódromo', was: 'harwood 6417', why: 'endereço no lugar do nome do estádio' },
  { id: 'wd-Q1023191', field: 'stadiumName', value: 'Estadio CAP', was: 'club real pollin estadio', why: 'texto sem sentido no lugar do estádio' },
  { id: 'wd-Q2454482', field: 'stadiumName', value: 'Estadio Bautista Gargantini', was: 'autista Tragantini Stadium', why: 'nome do estádio escrito errado' },
  { id: 'wd-Q719719', field: 'stadiumName', value: 'Estadio Municipal de La Cisterna', was: 'Estadio Municipal Sin Iluminacion', why: 'nome do estádio trocado por brincadeira' },
  { id: 'wd-Q105144613', field: 'stadiumName', value: 'Estadio Gustavo Ocaranza', was: 'Q105159258', why: 'código do Wikidata no lugar do estádio' },
  { id: 'wd-Q210864', field: 'stadiumName', value: 'Stade Marie-Marvingt', was: 'stade Marie-Marvingt', why: 'minúscula' },
  { id: 'wd-Q4382304', field: 'stadiumName', value: 'Guillermo Laza Stadium', was: 'Guillermo Laza stadium', why: 'minúscula' },
  // Cidade que é na verdade outra coisa (palácio, centro de treinamento, distrito)
  { id: 'wd-Q4382304', field: 'city', value: 'Buenos Aires', was: 'A Capital Federal', why: 'cidade escrita errada' },
  { id: 'wd-Q18741', field: 'city', value: 'London', was: 'London Borough of Haringey', why: 'distrito no lugar da cidade' },
  { id: 'wd-Q8687', field: 'city', value: 'Bilbao', was: 'Ibaigane Palace', why: 'palácio no lugar da cidade' },
  { id: 'wd-Q1900', field: 'city', value: 'Cagliari', was: 'CRAI Sport Center', why: 'centro de treinamento no lugar da cidade' },
  { id: 'wd-Q180305', field: 'city', value: 'Monaco', was: 'Commune of Monaco', why: 'texto de página no lugar da cidade' },
  { id: 'wd-Q132885', field: 'city', value: 'Marseille', was: "Centre d'entraînement Robert Louis-Dreyfus", why: 'centro de treinamento no lugar da cidade' },
  { id: 'wd-Q19509', field: 'city', value: 'Rennes', was: "Centre d'entraînement Henri-Guérin", why: 'centro de treinamento no lugar da cidade' },
]

/** As correções acima como `Correction`, para entrarem na mesma lista das correções à mão (as da lista `manual` vencem). */
export function nameFixCorrections(manual: readonly Correction[], at = '2026-11-01'): Correction[] {
  const taken = new Set(manual.map((c) => `${c.id}|${c.field}`))
  return NAME_FIXES.filter((f) => !taken.has(`${f.id}|${f.field}`)).map((f) => ({ id: f.id, field: f.field, value: f.value, at }))
}
