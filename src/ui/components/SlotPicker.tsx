import { SLOT_COUNT } from '../../store/saveFormat'
import type { SaveSummary } from '../../store/saveFormat'
import { SlotInfo } from './SlotInfo'
import { Button, Card } from './ui'

/** Janela para escolher em qual dos 3 espaços gravar (novo jogo ou arquivo importado). */
export function SlotPicker({
  title,
  slots,
  onPick,
  onCancel,
}: {
  title: string
  slots: (SaveSummary | null)[] | null
  onPick: (slot: number) => void
  onCancel: () => void
}) {
  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center overflow-y-auto bg-black/60 p-4 sm:items-center">
      <div className="w-full max-w-xl space-y-3 rounded-2xl border border-line bg-bg p-4">
        <h2 className="text-lg font-bold">{title}</h2>
        {Array.from({ length: SLOT_COUNT }, (_, i) => {
          const summary = slots?.[i] ?? null
          return (
            <Card key={i} title={`Espaço ${i + 1}`}>
              {summary ? <SlotInfo summary={summary} /> : <p className="text-sm text-slate-500">Vazio</p>}
              <Button
                className="mt-3 w-full"
                variant={summary ? 'secondary' : 'primary'}
                onClick={() => {
                  if (summary && !window.confirm(`Substituir o save do espaço ${i + 1} (${summary.teamName})?`)) return
                  onPick(i + 1)
                }}
              >
                {summary ? 'Substituir este save' : 'Salvar aqui'}
              </Button>
            </Card>
          )
        })}
        <Button className="w-full" variant="secondary" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </div>
  )
}
