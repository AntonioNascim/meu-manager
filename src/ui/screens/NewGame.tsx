import { useMemo, useState } from 'react'
import { loadWorld } from '../../data/package/defaultPackage'
import { playerOverall } from '../../engine/overall'
import type { Player, Team } from '../../engine/types'
import { createGame } from '../../store/game'
import { openGame } from '../../store/gameStore'
import type { SaveSummary } from '../../store/saveFormat'
import { worldChoices } from '../../store/worldChoices'
import { NATIONALITY_LABELS } from '../labels'
import { Flag } from '../theme/PlayerBits'
import { TopTabs } from '../theme/TopTabs'
import { SlotPicker } from '../components/SlotPicker'
import { Button, Tabs, TeamBadge } from '../components/ui'
import type { ChosenPackage } from './ImportPackage'

interface Option {
  team: Team
  strength: number
}

/** Tela de novo jogo: escolher o país, a liga (divisão) e o clube; com um país só, a escolha do país não aparece. */
export function NewGame({ slots, onBack, dataPackage }: { slots: (SaveSummary | null)[] | null; onBack: () => void; dataPackage?: ChosenPackage }) {
  // O mundo é gerado uma vez para mostrar os times; o jogo é criado com a mesma semente.
  const [seed] = useState(() => Math.floor(Math.random() * 1_000_000) + 1)
  const world = useMemo(() => loadWorld(seed, dataPackage?.data), [seed, dataPackage])
  const countries = useMemo(() => worldChoices(world), [world])
  const [countryId, setCountryId] = useState(() => countries[0]?.country ?? 'Brazil')
  const country = countries.find((c) => c.country === countryId) ?? (countries[0] as (typeof countries)[number])
  const [divisionId, setDivisionId] = useState(() => country.divisions[0]?.id ?? '')
  const division = country.divisions.find((d) => d.id === divisionId) ?? (country.divisions[0] as (typeof country.divisions)[number])
  const [selected, setSelected] = useState<string | null>(null)
  const [choosingSlot, setChoosingSlot] = useState(false)

  const options: Option[] = useMemo(() => {
    const byId = new Map<string, Player>(world.players.map((p) => [p.id, p]))
    return division.teams
      .map((team) => ({
        team,
        strength: team.tactic.startingXI.reduce((s, id) => s + playerOverall(byId.get(id) as Player), 0) / team.tactic.startingXI.length,
      }))
      .sort((a, b) => b.strength - a.strength)
  }, [world, division])

  const chosen = world.teams.find((t) => t.id === selected)

  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col bg-slate-900 text-slate-100">
      <header className="px-4 pb-3 pt-6">
        <div className="flex items-center justify-between">
          <h1 className="title text-4xl">Meu Manager</h1>
          <button type="button" className="min-h-12 rounded-lg px-3 text-sm text-slate-400 hover:bg-slate-800" onClick={onBack}>
            Voltar
          </button>
        </div>
        <p className="text-sm text-slate-400">{dataPackage ? `Pacote: ${dataPackage.data.name}. ` : ''}Escolha o time que você vai comandar.</p>
        {countries.length > 1 && (
          <div className="mt-4" data-testid="country-picker">
            <TopTabs
              scroll
              value={country.country}
              options={countries.map((c) => ({ id: c.country, label: NATIONALITY_LABELS[c.country] }))}
              onChange={(id) => {
                setCountryId(id)
                setDivisionId(countries.find((c) => c.country === id)?.divisions[0]?.id ?? '')
                setSelected(null)
              }}
            />
          </div>
        )}
        <div className="mt-3">
          {country.divisions.length > 1 ? (
            <Tabs
              value={division.id}
              options={country.divisions.map((d) => ({ id: d.id, label: d.name }))}
              onChange={(id) => {
                setDivisionId(id)
                setSelected(null)
              }}
            />
          ) : (
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-300">
              <Flag nationality={country.country} />
              {division.name}
            </div>
          )}
        </div>
      </header>

      <ul className="flex-1 space-y-2 overflow-y-auto px-4 pb-32">
        {options.map(({ team, strength }) => (
          <li key={team.id}>
            <button
              type="button"
              onClick={() => setSelected(team.id)}
              className={`flex w-full items-center gap-3 rounded-xl p-3 text-left transition ${selected === team.id ? 'bg-accent/10 ring-2 ring-accent' : 'bg-slate-800 hover:bg-slate-700'}`}
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

      <footer className="fixed inset-x-0 bottom-0 border-t border-line bg-bg/95 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur">
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
        <SlotPicker title={`Onde salvar o jogo com o ${chosen.name}?`} slots={slots} onCancel={() => setChoosingSlot(false)} onPick={(slot) => openGame(createGame(seed, chosen.id, { world, ...(dataPackage ? { dataPackage: dataPackage.data, dataPackageId: dataPackage.id } : {}) }), slot)} />
      )}
    </div>
  )
}
