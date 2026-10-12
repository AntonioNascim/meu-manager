/**
 * Backup em arquivo: exporta um espaço de save como JSON e importa de volta (em qualquer versão do formato:
 * o arquivo passa pelas mesmas migrações e validações de um save normal).
 */
import { SaveError, migrateSave } from './saveFormat'
import type { Migration, SaveEnvelope, SaveSummary } from './saveFormat'
import { listSlots, loadEnvelope, saveToSlot } from './saves'

/** Marca do arquivo, para recusar JSON de outra coisa com uma mensagem clara. */
export const SAVE_FILE_APP = 'meu-manager'

export interface SaveFile extends SaveEnvelope {
  app: typeof SAVE_FILE_APP
}

const slug = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

export interface ExportedSave {
  filename: string
  json: string
}

/** Texto do arquivo de backup do espaço, mais um nome de arquivo (`meu-manager-<time>-<ano>.json`). */
export async function exportSlot(slot: number): Promise<ExportedSave> {
  const envelope = await loadEnvelope(slot)
  const summary = ((await listSlots())[slot - 1] ?? null) as SaveSummary | null
  const file: SaveFile = { app: SAVE_FILE_APP, ...envelope }
  const name = summary ? `${slug(summary.teamName)}-${summary.year}` : `espaco-${slot}`
  return { filename: `meu-manager-${name}.json`, json: JSON.stringify(file) }
}

/** Lê o texto de um arquivo de backup: confere formato, versão e conteúdo, e migra para a versão atual. */
export function parseSaveFile(text: string, migrations?: Record<number, Migration>, target?: number): SaveEnvelope {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new SaveError('invalid', 'O arquivo não é um save do Meu Manager (não é JSON válido).')
  }
  if (typeof raw !== 'object' || raw === null || (raw as { app?: unknown }).app !== SAVE_FILE_APP) {
    throw new SaveError('invalid', 'O arquivo não é um save do Meu Manager.')
  }
  const { app: _app, ...envelope } = raw as SaveFile
  return migrateSave(envelope, migrations, target)
}

/** Importa o arquivo para um espaço (substitui o que houver nele). Devolve o resumo gravado. */
export async function importSave(text: string, slot: number, now: Date = new Date()): Promise<SaveSummary> {
  const envelope = parseSaveFile(text)
  return saveToSlot(slot, envelope.game, now)
}
