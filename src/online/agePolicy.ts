/**
 * Faixa de idade e modo protegido (Fase 6, LGPD; `docs/lgpd-para-revisor.md`, seção 9). Puro.
 *
 * A pessoa informa **só a faixa** ao criar a conta (nunca a data de nascimento). A faixa vira um de três níveis de acesso:
 * - `none`: menos de `ONLINE_MIN_AGE` anos. Sem conta online; a carreira solo (sem conta) segue livre.
 * - `protected`: de `ONLINE_MIN_AGE` até antes de `FULL_ACCESS_AGE`. Apelido gerado pelo jogo, só ligas de amigos por convite, nome de liga de uma lista.
 * - `full`: `FULL_ACCESS_AGE` ou mais. Tudo liberado.
 *
 * **Para mudar a idade em que tudo é liberado (se o revisor de LGPD pedir 18), troque só `FULL_ACCESS_AGE`.** As faixas abaixo precisam
 * ter um limite exatamente nessa idade (o teste confere); hoje há limites em 12, 16 e 18.
 */

/** Idade mínima para ter conta online. */
export const ONLINE_MIN_AGE = 12
/** Idade a partir da qual o online é todo liberado. DECISÃO A CONFIRMAR COM O REVISOR DE LGPD antes do lançamento (16 hoje; pode virar 18). */
export const FULL_ACCESS_AGE = 16

export const AGE_BANDS = [
  { id: 'under12', from: 0 },
  { id: '12-15', from: 12 },
  { id: '16-17', from: 16 },
  { id: '18+', from: 18 },
] as const
export type AgeBand = (typeof AGE_BANDS)[number]['id']
export type OnlineAccess = 'none' | 'protected' | 'full'

export const isAgeBand = (v: unknown): v is AgeBand => AGE_BANDS.some((b) => b.id === v)

/** Nível de acesso de uma faixa. Faixa ausente (conta antiga, sem a pergunta) vale como protegida: na dúvida, a regra mais cuidadosa. */
export function accessOf(band: AgeBand | undefined): OnlineAccess {
  const b = AGE_BANDS.find((x) => x.id === band)
  if (!b) return 'protected'
  if (b.from < ONLINE_MIN_AGE) return 'none'
  return b.from < FULL_ACCESS_AGE ? 'protected' : 'full'
}

/** Nomes de liga que o modo protegido pode usar (escolhidos de uma lista, sem texto livre). */
export const PROTECTED_LEAGUE_NAMES: readonly string[] = [
  'Liga dos Amigos',
  'Liga da Turma',
  'Copa da Galera',
  'Liga do Bairro',
  'Liga dos Campeões',
  'Liga da Rapaziada',
  'Taça da Família',
  'Liga dos Craques',
  'Campeonato da Turma',
  'Liga do Fim de Semana',
  'Liga dos Parceiros',
  'Liga da Várzea',
]

export const isProtectedLeagueName = (name: string): boolean => PROTECTED_LEAGUE_NAMES.includes(name)
