import { useEffect, useState } from 'react'
import type { PackageListing } from '../../data/package/delivery'
import { packageSource } from '../../store/realPackageSource'
import { Button, Card } from './ui'

const mb = (bytes: number): string => (bytes / 1048576).toFixed(1).replace('.', ',')

/**
 * Aviso de elencos atualizados (Fase 6, B3): aparece no menu quando o servidor tem uma versão do mundo real mais nova que a do aparelho.
 * "Atualizar" baixa e guarda; só jogos novos usam a versão nova (um jogo em andamento nunca muda). Sem internet ou sem versão nova, não aparece nada.
 */
export function PackageUpdateBanner() {
  const [listing, setListing] = useState<PackageListing | undefined>()
  const [state, setState] = useState<'idle' | 'downloading' | 'done' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    packageSource
      .checkForUpdate()
      .then((l) => {
        if (alive) setListing(l)
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [])

  if (!listing) return null

  if (state === 'done') {
    return (
      <Card>
        <div role="status" className="text-sm" data-testid="package-update-done">
          <p className="font-bold">Elencos atualizados.</p>
          <p className="mt-1 text-muted">Seus jogos novos já usam a versão {listing.version}. Os jogos que você já começou continuam como estão.</p>
        </div>
      </Card>
    )
  }

  const download = () => {
    setState('downloading')
    setError(null)
    packageSource
      .download(listing)
      .then(() => setState('done'))
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : 'Não foi possível baixar os elencos.')
        setState('error')
      })
  }

  return (
    <Card>
      <div data-testid="package-update">
        <p className="font-bold">Elencos atualizados ({listing.version}).</p>
        <p className="mt-1 text-sm text-muted">
          Usar em novos jogos. Os jogos que você já começou continuam como estão. Download de {mb(listing.gzipBytes)} MB.
          {listing.notes ? ` ${listing.notes}` : ''}
        </p>
        {error && <p className="mt-2 text-sm text-loss">{error}</p>}
        <div className="mt-3 flex gap-2">
          <Button onClick={download} disabled={state === 'downloading'}>
            {state === 'downloading' ? 'Baixando…' : state === 'error' ? 'Tentar de novo' : 'Atualizar'}
          </Button>
          <Button
            variant="secondary"
            disabled={state === 'downloading'}
            onClick={() => {
              packageSource.dismiss(listing.version)
              setListing(undefined)
            }}
          >
            Agora não
          </Button>
        </div>
      </div>
    </Card>
  )
}
