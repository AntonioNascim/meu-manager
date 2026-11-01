/**
 * Pacote das ferramentas de medição: o mundo de teste fictício (`buildScalePackage`) ou, com `PACOTE_REAL=1` (ou o caminho de um arquivo),
 * o pacote real de `data/pacote-real.json`. É assim que o workflow `Medições pesadas` roda com os dados reais.
 */
import { readFileSync } from 'node:fs'
import type { DataPackage } from '../src/data/package/types'
import { buildScalePackage } from '../src/diagnostics/scalePackage'

export const REAL_PACKAGE_FILE = 'data/pacote-real.json'

/** `true` quando a medição deve usar o pacote real. */
export const useRealPackage = (): boolean => !!process.env.PACOTE_REAL && process.env.PACOTE_REAL !== '0'

/** Pacote cru (sem validar) da medição: o real, se pedido, senão o de teste com a semente. */
export function measurementPackage(seed: number): DataPackage {
  if (!useRealPackage()) return buildScalePackage(seed)
  const file = process.env.PACOTE_REAL === '1' ? REAL_PACKAGE_FILE : (process.env.PACOTE_REAL as string)
  return JSON.parse(readFileSync(file, 'utf8')) as DataPackage
}
