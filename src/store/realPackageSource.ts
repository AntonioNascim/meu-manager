/** O pacote do mundo real do jogo: a cópia embutida (`data/pacote-real.json`) mais as versões baixadas do servidor. Instância única usada pelas telas. */
import versao from '../../data/versao.json'
import { REAL_PACKAGE_ID, loadRealPackage } from '../data/package/realPackage'
import { ONLINE_CONFIG } from '../online/config'
import { mainPackageCache } from './packageCache'
import { PackageSource, browserMemory } from './packageSource'

/** Versão da cópia embutida no jogo (vem de `data/versao.json`, que a ferramenta `publishPackage` também lê). */
export const EMBEDDED_PACKAGE_VERSION: string = versao.version

export const packageSource = new PackageSource({
  cache: mainPackageCache,
  fetchFn: (input, init) => fetch(input, init),
  apiBase: ONLINE_CONFIG.apiBase,
  id: versao.id,
  embedded: { version: versao.version, name: 'Mundo real', gameId: REAL_PACKAGE_ID, load: loadRealPackage },
  memory: browserMemory(),
  now: () => Date.now(),
})
