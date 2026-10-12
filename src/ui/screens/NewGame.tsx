import { useMemo, useState } from 'react'
import { generateWorld } from '../../data/generateWorld'
import { playerOverall } from '../../engine/overall'
import type { Player, Team } from '../../engine/types'
import { createGame } from '../../store/game'
import { openGame } from '../../store/gameStore'
import { SLOT_COUNT } from '../../store/saveFormat'
import type { SaveSummary } from '../../store/saveFormat'
import { TIER_LABELS } from '../labels'
import { Button, Card, Tabs, TeamBadge } from '../components/ui'
import { SlotInfo } from '../components/SlotInfo'

interface Option {
  team: Team
  strength: number
}

/** Tela de novo jogo: escolher um time da Série A ou da Série B. */
export function NewGame({ slots, onBack }: { slots: (SaveSummary | null)[] | null; onBack: () => void }) {
  // O mundo é gerado uma vez para mostrar os times; o jogo é criado com a mesma semente.
  const [seed] = useState(() => Math.floor(Math.random() * 1_000_000) + 1)
  const world = useMemo(() => generateWorld({ seed }), [seed])
  const [tier, setTier] = useState<1 | 2>(1)
  const [selected, setSelected] = useState<string | null>(null)
  const [choosingSlot, setChoosingSlot] = useState(false)

  const options: Option[] = useMemo(() => {
    const byId = new Map<string, Player>(world.players.map((p) => [p.id, p]))
    return world.teams
      .filter((t) => t.tier === tier)
      .map((team) => ({
        team,
        strength: team.tactic.startingXI.reduce((s, id) => s + playerOverall(byId.get(id) as Player), 0) / team.tactic.startingXI.length,
      }))
      .sort((a, b) => b.strength - a.strength)
  }, [world, tier])

  const chosen = world.teams.find((t) => t.id === selected)

  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col bg-slate-900 text-slate-100">
      <header className="px-4 pb-3 pt-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-emerald-400">Meu Manager</h1>
          <button type="button" className="min-h-12 rounded-lg px-3 text-sm text-slate-400 hover:bg-slate-800" onClick={onBack}>
            Voltar
          </button>
        </div>
        <p className="text-sm text-slate-400">Escolha o time que você vai comandar.</p>
        <div className="mt-4">
          <Tabs
            value={String(tier) as '1' | '2'}
            options={[
              { id: '1', label: TIER_LABELS[1] },
              { id: '2', label: TIER_LABELS[2] },
            ]}
            onChange={(id) => {
              setTier(Number(id) as 1 | 2)
              setSelected(null)
            }}
          />
        </div>
      </header>

      <ul className="flex-1 space-y-2 overflow-y-auto px-4 pb-32">
        {options.map(({ team, strength }) => (
          <li key={team.id}>
            <button
              type="button"
              onClick={() => setSelected(team.id)}
              className={`flex w-full items-center gap-3 rounded-xl p-3 text-left transition ${selected === team.id ? 'bg-emerald-600/30 ring-2 ring-emerald-400' : 'bg-slate-800 hover:bg-slate-700'}`}
            >
              <TeamBadge team={team} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{team.name}</span>
                <span className="block truncate text-xs text-slate-400">
                  {team.city}/{team.state} · {team.stadium.name}
                </span>
              </span>
              <span className="text-right">
                <span className="block text-lg font-bold tabular-nums">{strength.toFixed(0)}</span>
                <span className="block text-[10px] uppercase text-slate-400">força</span>
              </span>
            </button>
          </li>
        ))}
      </ul>

      <footer className="fixed inset-x-0 bottom-0 border-t border-slate-700 bg-slate-900/95 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur">
        <div className="mx-auto flex max-w-xl items-center gap-3">
          {chosen ? (
            <>
              <TeamBadge team={chosen} size="sm" />
              <div className="min-w-0 flex-1 text-sm">
                <div className="truncate font-semibold">{chosen.name}</div>
                <div className="truncate text-xs text-slate-400">
                  Reputação {chosen.reputation} · Meta: {chosen.objective.targetPosition}º lugar
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 text-sm text-slate-400">Toque em um time para escolher.</div>
          )}
          <Button disabled={!chosen} onClick={() => setChoosingSlot(true)}>
            Começar
          </Button>
        </div>
      </footer>

      {choosingSlot && chosen && (
        <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/60 p-4 sm:items-center">
          <div className="w-full max-w-xl space-y-3 rounded-2xl bg-slate-900 p-4">
            <h2 className="text-lg font-bold">Onde salvar o jogo com o {chosen.name}?</h2>
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
                      openGame(createGame(seed, chosen.id), i + 1)
                    }}
                  >
                    {summary ? 'Substituir este save' : 'Salvar aqui'}
                  </Button>
                </Card>
              )
            })}
            <Button className="w-full" variant="secondary" onClick={() => setChoosingSlot(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
