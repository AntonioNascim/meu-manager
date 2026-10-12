import { useCallback, useEffect, useState } from 'react'
import { SLOT_COUNT } from '../../store/saveFormat'
import type { SaveSummary } from '../../store/saveFormat'
import { markSaved } from '../../store/autosave'
import { openGame } from '../../store/gameStore'
import { deleteSlot, latestSlot, listSlots, loadSlot } from '../../store/saves'
import { SlotInfo } from '../components/SlotInfo'
import { Button, Card } from '../components/ui'
import { NewGame } from './NewGame'

type View = 'menu' | 'new' | 'load'

/** Tela inicial: continuar o último save, começar um jogo novo ou carregar/excluir um dos 3 espaços. */
export function Start() {
  const [view, setView] = useState<View>('menu')
  const [slots, setSlots] = useState<(SaveSummary | null)[] | null>(null)
  const [latest, setLatest] = useState<SaveSummary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    try {
      setSlots(await listSlots())
      setLatest(await latestSlot())
    } catch {
      setSlots(Array.from({ length: SLOT_COUNT }, () => null))
      setError('Não foi possível ler os saves deste navegador.')
    }
  }, [])
  useEffect(() => {
    void refresh()
  }, [refresh])

  const open = async (slot: number) => {
    setBusy(true)
    setError(null)
    try {
      const game = await loadSlot(slot)
      markSaved(game)
      openGame(game, slot)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível abrir o save.')
      setBusy(false)
    }
  }

  const remove = async (summary: SaveSummary) => {
    if (!window.confirm(`Excluir o save do espaço ${summary.slot} (${summary.teamName}, temporada ${summary.year})? Isso não pode ser desfeito.`)) return
    await deleteSlot(summary.slot)
    await refresh()
  }

  if (view === 'new') return <NewGame slots={slots} onBack={() => { setView('menu'); void refresh() }} />

  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-4 bg-slate-900 px-4 py-8 text-slate-100">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-emerald-400">Meu Manager</h1>
        <p className="text-sm text-slate-400">Jogo de técnico de futebol</p>
      </div>

      {view === 'menu' && (
        <div className="space-y-3">
          {latest && (
            <Card title="Continuar">
              <div className="flex items-center gap-3">
                <SlotInfo summary={latest} />
              </div>
              <Button className="mt-3 w-full" disabled={busy} onClick={() => void open(latest.slot)}>
                Continuar
              </Button>
            </Card>
          )}
          <Button className="w-full" variant={latest ? 'secondary' : 'primary'} onClick={() => setView('new')}>
            Novo jogo
          </Button>
          <Button className="w-full" variant="secondary" disabled={!latest} onClick={() => setView('load')}>
            Carregar
          </Button>
        </div>
      )}

      {view === 'load' && (
        <div className="space-y-3">
          {Array.from({ length: SLOT_COUNT }, (_, i) => {
            const summary = slots?.[i] ?? null
            return (
              <Card key={i} title={`Espaço ${i + 1}`}>
                {summary ? (
                  <>
                    <SlotInfo summary={summary} />
                    <div className="mt-3 flex gap-2">
                      <Button className="flex-1" disabled={busy} onClick={() => void open(summary.slot)}>
                        Carregar
                      </Button>
                      <Button variant="secondary" onClick={() => void remove(summary)}>
                        Excluir
                      </Button>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-slate-500">Vazio</p>
                )}
              </Card>
            )
          })}
          <Button className="w-full" variant="secondary" onClick={() => setView('menu')}>
            Voltar
          </Button>
        </div>
      )}

      {error && <p className="text-center text-sm text-rose-300">{error}</p>}
    </div>
  )
}
