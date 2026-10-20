/** Histórico de edição com desfazer e refazer. Guarda versões inteiras do pacote (compartilham tudo o que não mudou). */
export interface History<T> {
  present: T
  past: T[]
  future: T[]
  /** Chave da última edição: edições seguidas com a mesma chave, em pouco tempo, viram um passo só (digitar num campo). */
  key?: string
  at: number
}

export const HISTORY_LIMIT = 100
/** Edições da mesma chave dentro deste tempo (ms) contam como um passo. */
export const COALESCE_MS = 1200

export const createHistory = <T>(present: T): History<T> => ({ present, past: [], future: [], at: 0 })

export function commit<T>(h: History<T>, next: T, key?: string, now: number = Date.now()): History<T> {
  if (next === h.present) return h
  const merge = key !== undefined && key === h.key && now - h.at < COALESCE_MS && h.past.length > 0
  const past = merge ? h.past : [...h.past, h.present].slice(-HISTORY_LIMIT)
  return { present: next, past, future: [], ...(key !== undefined ? { key } : {}), at: now }
}

export function undo<T>(h: History<T>): History<T> {
  const previous = h.past[h.past.length - 1]
  if (previous === undefined) return h
  return { present: previous, past: h.past.slice(0, -1), future: [h.present, ...h.future], at: 0 }
}

export function redo<T>(h: History<T>): History<T> {
  const [next, ...rest] = h.future
  if (next === undefined) return h
  return { present: next, past: [...h.past, h.present], future: rest, at: 0 }
}

/** Troca o conteúdo (abrir outro pacote) e zera o histórico. */
export const reset = <T>(present: T): History<T> => createHistory(present)
