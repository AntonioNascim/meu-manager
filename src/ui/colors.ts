/** Cores por faixa de valor (escala 1 a 100) para atributos e força geral. */
export interface Band {
  min: number
  /** Classes do Tailwind: texto, fundo e borda da faixa. */
  text: string
  bg: string
}

export const VALUE_BANDS: readonly Band[] = [
  { min: 85, text: 'text-cyan-300', bg: 'bg-cyan-400' },
  { min: 70, text: 'text-emerald-400', bg: 'bg-emerald-500' },
  { min: 55, text: 'text-lime-300', bg: 'bg-lime-400' },
  { min: 40, text: 'text-amber-400', bg: 'bg-amber-500' },
  { min: 0, text: 'text-rose-400', bg: 'bg-rose-500' },
]

export const bandFor = (value: number): Band => VALUE_BANDS.find((b) => value >= b.min) as Band

/** Cor da condição física/moral (0 a 100): verde descansado, vermelho exausto. */
export function conditionBand(value: number): Band {
  return value >= 85 ? VALUE_BANDS[1]! : value >= 70 ? VALUE_BANDS[2]! : value >= 50 ? VALUE_BANDS[3]! : VALUE_BANDS[4]!
}

/** Cor da forma (média das notas, 0 a 10). */
export function formBand(form: number): Band {
  return form >= 7.2 ? VALUE_BANDS[0]! : form >= 6.6 ? VALUE_BANDS[1]! : form >= 6.0 ? VALUE_BANDS[2]! : form >= 5.4 ? VALUE_BANDS[3]! : VALUE_BANDS[4]!
}
