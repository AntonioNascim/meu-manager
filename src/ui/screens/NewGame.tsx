import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { World } from '../../data/generateWorld'
import { loadWorld } from '../../data/package/defaultPackage'
import { REAL_PACKAGE_ID, loadRealPackage } from '../../data/package/realPackage'
import type { DataPackage } from '../../data/package/types'
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

type Source = 'real' | 'fictional'

type RealState = { status: 'loading'; step: 'download' | 'build' } | { status: 'error'; message: string } | { status: 'ready'; world: World; pkg: DataPackage }

/** Baixa o pacote real e monta o mundo (só quando `enabled`); a montagem espera um instante para a tela de espera aparecer. */
function useRealWorld(seed: number, enabled: boolean): [RealState, () => void] {
  const [state, setState] = useState<RealState>({ status: 'loading', step: 'download' })
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    setState({ status: 'loading', step: 'download' })
    loadRealPackage()
      .then(async (pkg) => {
        if (cancelled) return
        setState({ status: 'loading', step: 'build' })
        await new Promise((resolve) => setTimeout(resolve, 30))
        if (cancelled) return
        setState({ status: 'ready', world: loadWorld(seed, pkg), pkg })
      })
      .catch((e: unknown) => {
        if (!cancelled) setState({ status: 'error', message: e instanceof Error ? e.message : 'Não foi possível carregar o mundo real.' })
      })
    return () => {
      cancelled = true
    }
  }, [seed, enabled, attempt])
  return [state, useCallback(() => setAttempt((n) => n + 1), [])]
}

function Header({ onBack, subtitle, extra, children }: { onBack: () => void; subtitle: string; extra?: ReactNode; children?: ReactNode }) {
  return (
    <header className="px-4 pb-3 pt-6">
      <div className="flex items-center justify-between">
        <h1 className="title text-4xl">Meu Manager</h1>
        <button type="button" className="min-h-12 rounded-lg px-3 text-sm text-slate-400 hover:bg-slate-800" onClick={onBack}>
          Voltar
        </button>
      </div>
      <p className="text-sm text-slate-400">{subtitle}Escolha o time que você vai comandar.</p>
      {extra}
      {children}
    </header>
  )
}

/**
 * Tela de novo jogo: o mundo real (padrão), o fictício ou um pacote importado; depois o país, a liga (divisão) e o clube.
 * O pacote real só é baixado aqui, quando alguém começa um jogo com ele.
 */
export function NewGame({ slots, onBack, dataPackage, initialSource = 'real' }: { slots: (SaveSummary | null)[] | null; onBack: () => void; dataPackage?: ChosenPackage; initialSource?: Source }) {
  // O mundo é gerado uma vez para mostrar os times; o jogo é criado com a mesma semente.
  const [seed] = useState(() => Math.floor(Math.random() * 1_000_000) + 1)
  const [source, setSource] = useState<Source>(initialSource)
  const useReal = !dataPackage && source === 'real'
  const [real, retry] = useRealWorld(seed, useReal)
  const localWorld = useMemo(() => (useReal ? null : loadWorld(seed, dataPackage?.data)), [seed, dataPackage, useReal])

  const switcher = dataPackage ? null : (
    <div className="mt-3" data-testid="source-picker">
      <TopTabs
        value={source}
        options={[
          { id: 'real', label: 'Mundo real' },
          { id: 'fictional', label: 'Mundo fictício' },
        ]}
        onChange={setSource}
      />
    </div>
  )
  const subtitle = dataPackage ? `Pacote: ${dataPackage.data.name}. ` : source === 'real' ? 'Clubes e jogadores reais; os atributos são estimados pela fama. ' : 'Clubes e jogadores inventados. '

  if (useReal && real.status !== 'ready') {
    return (
      <div className="mx-auto flex min-h-dvh max-w-xl flex-col bg-slate-900 text-slate-100">
        <Header onBack={onBack} subtitle={subtitle} extra={switcher} />
        <div className="px-4 py-10 text-center" data-testid="real-loading">
          {real.status === 'loading' ? (
            <>
              <p className="font-bold">{real.step === 'download' ? 'Baixando o mundo real…' : 'Montando clubes e jogadores…'}</p>
              <p className="mt-1 text-sm text-slate-400">Só na primeira vez; depois fica guardado neste aparelho.</p>
            </>
          ) : (
            <>
              <p className="font-bold text-loss">{real.message}</p>
              <p className="mt-1 text-sm text-slate-400">Confira a conexão e tente de novo, ou comece com o mundo fictício.</p>
              <div className="mt-4 flex justify-center gap-2">
                <Button onClick={retry}>Tentar de novo</Button>
                <Button variant="secondary" onClick={() => setSource('fictional')}>
                  Mundo fictício
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    )
  }

  const world = (useReal && real.status === 'ready' ? real.world : localWorld) as World
  const chosenPackage: ChosenPackage | undefined = dataPackage ?? (useReal && real.status === 'ready' ? { id: REAL_PACKAGE_ID, data: real.pkg } : undefined)
  return <Picker key={useReal ? 'real' : 'local'} slots={slots} onBack={onBack} seed={seed} world={world} dataPackage={chosenPackage} subtitle={subtitle} extra={switcher} />
}

interface PickerProps {
  slots: (SaveSummary | null)[] | null
  onBack: () => void
  seed: number
  world: World
  dataPackage: ChosenPackage | undefined
  subtitle: string
  extra: ReactNode
}

function Picker({ slots, onBack, seed, world, dataPackage, subtitle, extra }: PickerProps) {
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
      <Header onBack={onBack} subtitle={subtitle} extra={extra}>
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
      </Header>

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
                  {team.state ? `${team.city}/${team.state}` : team.city} · {team.stadium.name}
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
        <SlotPicker
          title={`Onde salvar o jogo com o ${chosen.name}?`}
          slots={slots}
          onCancel={() => setChoosingSlot(false)}
          onPick={(slot) => openGame(createGame(seed, chosen.id, { world, ...(dataPackage ? { dataPackage: dataPackage.data, dataPackageId: dataPackage.id } : {}) }), slot)}
        />
      )}
    </div>
  )
}
