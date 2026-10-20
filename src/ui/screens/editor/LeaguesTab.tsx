import { addLeague, clubsOfLeague, removeLeague, replaceAt, setLinkedMovement } from '../../../data/package/edit/ops'
import { COUNTRY_DEFAULTS } from '../../../data/package/leagueDefaults'
import { REGIONS } from '../../../engine/types'
import type { Region } from '../../../engine/types'
import type { PackageLeague } from '../../../data/package/types'
import { NATIONALITY_LABELS, REGION_LABELS } from '../../labels'
import { Crest } from '../../theme'
import { CheckField, NumberField, SelectField, Section, SmallButton, TextField } from './fields'
import { EntityIssues, IssueDot, ListRow, MasterDetail } from './parts'
import type { TabProps } from './parts'

const SPLIT_OPTIONS = [
  { id: 'default', label: 'Padrão do país' },
  { id: 'yes', label: 'Atravessa o ano (agosto a maio)' },
  { id: 'no', label: 'Ano civil (janeiro a dezembro)' },
] as const

/** Ligas e divisões, agrupadas por país. */
export function LeaguesTab(props: TabProps) {
  const { editor, validation, selected, select, goTo } = props
  const { pkg, edit } = editor
  const index = selected.leagues
  const league = index !== null ? pkg.leagues[index] : undefined

  const patch = (change: Partial<PackageLeague>, key: string) => {
    if (index === null) return
    edit((p) => ({ ...p, leagues: replaceAt(p.leagues, index, { ...(p.leagues[index] as PackageLeague), ...change }) }), `league-${index}-${key}`)
  }
  /** Tira um campo opcional da liga (volta ao padrão do país). */
  const clear = (...keys: (keyof PackageLeague)[]) => {
    if (index === null) return
    edit((p) => {
      const next = { ...(p.leagues[index] as PackageLeague) }
      for (const k of keys) delete next[k]
      return { ...p, leagues: replaceAt(p.leagues, index, next) }
    })
  }

  const list = (
    <div className="space-y-4">
      {pkg.countries.length === 0 && <p className="rounded-xl border border-dashed border-line p-4 text-sm text-muted">Adicione um país na aba Pacote para criar ligas.</p>}
      {pkg.countries.map((country) => {
        const divisions = pkg.leagues.map((l, i) => ({ l, i })).filter(({ l }) => l.country === country.id).sort((a, b) => a.l.level - b.l.level)
        return (
          <section key={country.id} className="rounded-2xl border border-line bg-surface p-2">
            <div className="flex items-center justify-between px-2 py-1">
              <h3 className="title text-xl">{country.name}</h3>
              <SmallButton
                onClick={() => {
                  edit((p) => addLeague(p, country.id))
                  select('leagues', pkg.leagues.length)
                }}
              >
                + Divisão
              </SmallButton>
            </div>
            {divisions.length === 0 && <p className="px-2 pb-2 text-sm text-muted">Sem ligas.</p>}
            {divisions.map(({ l, i }) => (
              <ListRow key={l.id} active={i === index} onClick={() => select('leagues', i)}>
                <span className="title w-6 text-center text-xl text-muted">{l.level}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold">{l.name}</span>
                  <span className="text-xs text-muted">{clubsOfLeague(pkg, l.id).length} clubes</span>
                </span>
                <IssueDot validation={validation} kind="leagues" index={i} />
              </ListRow>
            ))}
          </section>
        )
      })}
    </div>
  )

  let detail = null
  if (league && index !== null) {
    const sorted = pkg.leagues.filter((l) => l.country === league.country).sort((a, b) => a.level - b.level)
    const isFirst = sorted[0]?.id === league.id
    const isLast = sorted[sorted.length - 1]?.id === league.id
    const clubs = clubsOfLeague(pkg, league.id)
    const defaults = COUNTRY_DEFAULTS[league.country as keyof typeof COUNTRY_DEFAULTS]
    const splitValue = league.split === undefined ? 'default' : league.split ? 'yes' : 'no'
    detail = (
      <>
        <EntityIssues validation={validation} kind="leagues" index={index} />
        <Section title="Liga" right={<span className="text-xs text-muted">{league.id}</span>}>
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField label="Nome" value={league.name} onChange={(name) => patch({ name }, 'name')} />
            <SelectField<string> label="País" value={league.country} options={pkg.countries.map((c) => ({ id: c.id, label: c.name }))} onChange={(country) => country && patch({ country }, 'country')} />
            <NumberField label="Divisão (nível)" value={league.level} min={1} max={3} hint="1 = principal. Em sequência dentro do país." onChange={(v) => v !== undefined && patch({ level: v }, 'level')} />
            <NumberField
              label="Número de times"
              value={league.teams}
              min={4}
              max={40}
              hint={clubs.length === league.teams ? 'Par, de 4 a 40; igual ao número de clubes da liga.' : `A liga tem ${clubs.length} clubes: o número de times precisa ser igual.`}
              onChange={(v) => v !== undefined && patch({ teams: v }, 'teams')}
            />
            <NumberField label="Sobem para a divisão de cima" value={league.promotion} min={0} max={10} hint={isFirst ? 'A divisão 1 não sobe ninguém.' : undefined} onChange={(v) => v !== undefined && edit((p) => setLinkedMovement(p, league.id, 'promotion', v), `league-${index}-promotion`)} />
            <NumberField label="Caem para a divisão de baixo" value={league.relegation} min={0} max={10} hint={isLast ? 'A última divisão não rebaixa ninguém.' : 'Muda também o acesso da divisão de baixo.'} onChange={(v) => v !== undefined && edit((p) => setLinkedMovement(p, league.id, 'relegation', v), `league-${index}-relegation`)} />
          </div>
          {clubs.length !== league.teams && (
            <SmallButton onClick={() => patch({ teams: clubs.length }, 'teams-sync')}>Usar {clubs.length} (clubes atuais)</SmallButton>
          )}
        </Section>

        <Section title="Calendário e janelas">
          <div className="grid gap-3 sm:grid-cols-2">
            <SelectField<'1' | '2'> label="Turnos" value={String(league.rounds ?? 2) as '1' | '2'} options={[{ id: '2', label: 'Turno e returno' }, { id: '1', label: 'Turno único' }]} onChange={(v) => patch({ rounds: v === '1' ? 1 : 2 }, 'rounds')} />
            <SelectField<(typeof SPLIT_OPTIONS)[number]['id']> label="Temporada" value={splitValue} options={[...SPLIT_OPTIONS]} onChange={(v) => (v === 'default' ? clear('split') : patch({ split: v === 'yes' }, 'split'))} />
            <SelectField<Region> label="Região (janelas e copas continentais)" value={league.region} empty={`Padrão do país${defaults ? ` (${REGION_LABELS[defaults.region]})` : ''}`} options={REGIONS.map((r) => ({ id: r, label: REGION_LABELS[r] }))} onChange={(r) => (r ? patch({ region: r }, 'region') : clear('region'))} />
            <div className="grid grid-cols-2 gap-2">
              <NumberField label="1ª rodada: mês" value={league.start?.[0]} optional min={1} max={12} hint={defaults ? `Padrão: ${defaults.calendar.start[0]}` : undefined} onChange={(m) => (m === undefined ? clear('start') : patch({ start: [m, league.start?.[1] ?? defaults?.calendar.start[1] ?? 1] }, 'start'))} />
              <NumberField label="1ª rodada: dia" value={league.start?.[1]} optional min={1} max={31} hint={defaults ? `Padrão: ${defaults.calendar.start[1]}` : undefined} onChange={(d) => (d === undefined ? clear('start') : patch({ start: [league.start?.[0] ?? defaults?.calendar.start[0] ?? 1, d] }, 'start'))} />
            </div>
          </div>
        </Section>

        <Section title="Economia" right={league.economy && <SmallButton onClick={() => clear('economy')}>Usar o padrão do país</SmallButton>}>
          <p className="text-xs text-muted">{league.economy ? 'Valores desta liga.' : defaults?.economy ? `Padrão de ${NATIONALITY_LABELS[league.country as keyof typeof NATIONALITY_LABELS] ?? league.country}: receita ${defaults.economy.revenue}, nível ${defaults.economy.level}.` : 'Sem padrão para este país: vale a economia do Brasil (receita 1, nível 0).'}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <NumberField label="Índice de receita (Brasil = 1)" value={league.economy?.revenue ?? defaults?.economy?.revenue ?? 1} step={0.05} min={0.05} max={20} hint="Multiplica TV, patrocínio, ingresso e custos; (elevado a 0,75) salários e preços." onChange={(v) => v !== undefined && patch({ economy: { revenue: v, level: league.economy?.level ?? defaults?.economy?.level ?? 0 } }, 'revenue')} />
            <NumberField label="Nível dos jogadores (pontos vs. Brasil)" value={league.economy?.level ?? defaults?.economy?.level ?? 0} step={0.25} min={-15} max={15} hint="Usado ao gerar jogadores sem atributos." onChange={(v) => v !== undefined && patch({ economy: { revenue: league.economy?.revenue ?? defaults?.economy?.revenue ?? 1, level: v } }, 'level')} />
          </div>
        </Section>

        <Section title="Limite de estrangeiros">
          <CheckField label="A liga limita estrangeiros" checked={league.foreignLimit !== undefined} onChange={(on) => (on ? patch({ foreignLimit: { squad: 17, lineup: 8 } }, 'foreign') : clear('foreignLimit'))} hint="Estrangeiro é quem tem nacionalidade diferente do país da liga." />
          {league.foreignLimit && (
            <div className="grid gap-3 sm:grid-cols-2">
              <NumberField label="No elenco (até)" value={league.foreignLimit.squad} optional min={0} max={30} onChange={(v) => patch({ foreignLimit: { ...league.foreignLimit, squad: v } as never }, 'foreign-squad')} />
              <NumberField label="Entre os 11 titulares (até)" value={league.foreignLimit.lineup} optional min={0} max={11} onChange={(v) => patch({ foreignLimit: { ...league.foreignLimit, lineup: v } as never }, 'foreign-lineup')} />
            </div>
          )}
        </Section>

        <Section title={`Clubes (${clubs.length})`}>
          <div className="grid gap-1 sm:grid-cols-2">
            {clubs.map((c) => (
              <ListRow key={c.id} active={false} onClick={() => goTo('clubs', pkg.clubs.indexOf(c))}>
                <Crest team={c} size="xs" />
                <span className="min-w-0 flex-1 truncate text-sm font-bold">{c.name}</span>
                <span className="text-xs text-muted">rep. {c.reputation}</span>
              </ListRow>
            ))}
          </div>
        </Section>

        <SmallButton
          danger
          disabled={clubs.length > 0}
          title={clubs.length > 0 ? 'Mova ou apague os clubes antes' : undefined}
          onClick={() => {
            if (!window.confirm(`Apagar a liga "${league.name}"?`)) return
            edit((p) => removeLeague(p, league.id))
            select('leagues', null)
          }}
        >
          Apagar a liga
        </SmallButton>
      </>
    )
  }

  return <MasterDetail list={list} detail={detail} hasSelection={league !== undefined} onBack={() => select('leagues', null)} empty="Escolha uma liga à esquerda para editar." />
}
