/**
 * Mundo real embutido no jogo (`data/pacote-real.json`). O arquivo NÃO entra no código da abertura: o Vite o copia como
 * arquivo à parte (`?url`) e ele só é baixado quando alguém começa um jogo com o mundo real (ou abre os créditos completos).
 * Depois de baixado, o service worker o guarda, então volta a abrir sem internet.
 */
import realUrl from '../../../data/pacote-real.json?url'
import type { DataPackage } from './types'

/** Identificador do pacote embutido (vai em `Game.dataPackage.id`). */
export const REAL_PACKAGE_ID = 'embutido:mundo-real'

let pending: Promise<DataPackage> | null = null

/** Baixa e lê o pacote real (uma vez só por sessão; se falhar, a próxima chamada tenta de novo). */
export function loadRealPackage(): Promise<DataPackage> {
  if (!pending) {
    pending = fetch(realUrl)
      .then((response) => {
        if (!response.ok) throw new Error(`Falha ao baixar o mundo real (${response.status}).`)
        return response.json() as Promise<DataPackage>
      })
      .then((pkg) => {
        if (pkg?.format !== 'meu-manager-package') throw new Error('O arquivo do mundo real está corrompido.')
        return pkg
      })
      .catch((error) => {
        pending = null
        throw error
      })
  }
  return pending
}
