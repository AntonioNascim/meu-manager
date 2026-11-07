import { useState } from 'react'
import type { PaceId } from '../../../../engine/league/pace'
import { checkName } from '../../../../online/nameFilter'
import { PROTECTED_LEAGUE_NAMES } from '../../../../online/agePolicy'
import { LEAGUE_LIMITS } from '../../../../online/leagueApi'
import { accessOfAccount, useAccount } from '../../../../store/onlineAccount'
import { leagueApi } from '../../../../store/leagues'
import { EMBEDDED_PACKAGE_VERSION } from '../../../../store/realPackageSource'
import { Button, Card, Segmented } from '../../../components/ui'
import { BAND_LABELS, LEAGUE_ERROR_LABELS, NAME_ISSUE_LABELS, PACE_LABELS } from '../../../labels'
import { Turnstile } from '../Turnstile'
import { Frame } from './parts'

type Band = 'classic' | 'night' | 'weekend'

/** Criar uma liga (B8.3). O clube do ADM é escolhido depois, na sala, como o de todo mundo. */
export function CreateLeague({ onBack, onCreated }: { onBack: () => void; onCreated: (id: string) => void }) {
  const protectedMode = accessOfAccount(useAccount()) !== 'full'
  const [name, setName] = useState(protectedMode ? PROTECTED_LEAGUE_NAMES[0]! : '')
  const [kind, setKind] = useState<'open' | 'friends'>('friends')
  const [pace, setPace] = useState<PaceId>('normal')
  const [band, setBand] = useState<Band>('classic')
  const [maxHumans, setMaxHumans] = useState(8)
  const [real, setReal] = useState(false)
  const [direct, setDirect] = useState(false)
  const [token, setToken] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const checked = checkName(name, {
    min: LEAGUE_LIMITS.nameMin,
    max: LEAGUE_LIMITS.nameMax,
  })
  const nameError = name.trim() !== '' && !checked.ok ? NAME_ISSUE_LABELS[checked.issue] : null

  const submit = async () => {
    if (!checked.ok || !token) return
    setBusy(true)
    setError(null)
    const out = await leagueApi.create({
      turnstileToken: token,
      name,
      kind,
      world: real ? { source: 'real', version: EMBEDDED_PACKAGE_VERSION } : { source: 'ficticio' },
      pace: kind === 'open' ? 'normal' : pace,
      band,
      tzOffsetMin: -180,
      maxHumans,
      directResult: direct,
    })
    setBusy(false)
    if (out.ok) return onCreated(out.league.id)
    setError(out.error === 'bad-name' ? NAME_ISSUE_LABELS[(out.detail as { issue: keyof typeof NAME_ISSUE_LABELS }).issue] : LEAGUE_ERROR_LABELS[out.error])
  }

  return (
    <Frame eyebrow="Ligas online" title="Criar uma liga" onBack={onBack} backLabel="Cancelar">
      {protectedMode ? (
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted">Nome da liga (escolha da lista)</span>
          <select
            className="min-h-13 rounded-xl bg-surface-2 px-4 text-lg font-semibold ring-1 ring-line"
            value={name}
            onChange={(e) => setName(e.target.value)}
            data-testid="league-name-select"
          >
            {PROTECTED_LEAGUE_NAMES.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted">Nome da liga</span>
          <input
            className={`min-h-13 rounded-xl bg-surface-2 px-4 text-lg font-semibold ring-1 ${nameError ? 'ring-loss' : 'ring-line'}`}
            value={name}
            maxLength={LEAGUE_LIMITS.nameMax}
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => setName(e.target.value)}
            data-testid="league-name"
          />
          {nameError && <span className="text-xs text-loss">{nameError}</span>}
        </label>
      )}

      <Card title="Quem pode entrar">
        {protectedMode ? (
          <p className="text-sm" data-testid="protected-friends">
            Só amigos: entra quem tem o código ou o link de convite. No modo protegido não existem ligas abertas.
          </p>
        ) : (
          <Segmented
            value={kind}
            options={[
              { id: 'friends', label: 'Só amigos' },
              { id: 'open', label: 'Aberta' },
            ]}
            onChange={setKind}
          />
        )}
        {!protectedMode && (
          <p className="mt-2 text-xs text-muted">
            {kind === 'friends'
              ? 'Entra quem tem o código ou o link de convite. Não aparece na lista de ligas abertas.'
              : 'Aparece na lista de ligas abertas: entra quem quiser enquanto houver vaga. O ritmo é sempre Normal.'}
          </p>
        )}
      </Card>

      <Card title="Ritmo">
        {kind === 'open' ? (
          <p className="text-sm">{PACE_LABELS.normal}</p>
        ) : (
          <div className="flex flex-col gap-2">
            {(Object.keys(PACE_LABELS) as PaceId[]).map((p) => (
              <label key={p} className="flex min-h-12 items-center gap-3 rounded-xl bg-surface-2 px-3 text-sm ring-1 ring-line">
                <input type="radio" name="pace" checked={pace === p} onChange={() => setPace(p)} />
                {PACE_LABELS[p]}
              </label>
            ))}
          </div>
        )}
      </Card>

      <Card title="Horário dos jogos (fuso de Brasília)">
        <div className="flex flex-col gap-2">
          {(Object.keys(BAND_LABELS) as Band[]).map((b) => (
            <label key={b} className="flex min-h-12 items-center gap-3 rounded-xl bg-surface-2 px-3 text-sm ring-1 ring-line">
              <input type="radio" name="band" checked={band === b} onChange={() => setBand(b)} />
              {BAND_LABELS[b]}
            </label>
          ))}
        </div>
      </Card>

      <Card title="Técnicos">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm">Máximo de técnicos</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Menos"
              className="h-12 w-12 rounded-xl bg-surface-2 text-xl font-bold ring-1 ring-line"
              onClick={() => setMaxHumans((n) => Math.max(LEAGUE_LIMITS.minHumans, n - 1))}
            >
              −
            </button>
            <span className="w-8 text-center text-lg font-bold" data-testid="max-humans">
              {maxHumans}
            </span>
            <button
              type="button"
              aria-label="Mais"
              className="h-12 w-12 rounded-xl bg-surface-2 text-xl font-bold ring-1 ring-line"
              onClick={() => setMaxHumans((n) => Math.min(LEAGUE_LIMITS.maxHumans, n + 1))}
            >
              +
            </button>
          </div>
        </div>
      </Card>

      <Card title="Mundo">
        <Segmented
          value={real ? 'real' : 'ficticio'}
          options={[
            { id: 'ficticio', label: 'Mundo fictício' },
            { id: 'real', label: 'Mundo real' },
          ]}
          onChange={(v) => setReal(v === 'real')}
        />
        <p className="mt-2 text-xs text-muted">
          {real ? `Os elencos reais do pacote ${EMBEDDED_PACKAGE_VERSION}, com as copas nacionais e continentais.` : 'Clubes e jogadores inventados, para jogar sem nomes reais.'}
        </p>
      </Card>

      <Card title="Partidas">
        <Segmented
          value={direct ? 'direct' : 'live'}
          options={[
            { id: 'live', label: 'Assistir ao vivo' },
            { id: 'direct', label: 'Resultado direto' },
          ]}
          onChange={(v) => setDirect(v === 'direct')}
        />
        <p className="mt-2 text-xs text-muted">
          {direct ? 'No horário do jogo o servidor simula e mostra o relatório, sem ao vivo.' : 'No horário do jogo todos acompanham e comandam a partida em tempo real.'}
        </p>
      </Card>

      <Turnstile onToken={setToken} />
      {error && (
        <p role="alert" className="text-sm text-loss" data-testid="create-league-error">
          {error}
        </p>
      )}
      <Button disabled={!checked.ok || !token || busy} onClick={() => void submit()}>
        {busy ? 'Criando…' : 'Criar a liga'}
      </Button>
    </Frame>
  )
}
