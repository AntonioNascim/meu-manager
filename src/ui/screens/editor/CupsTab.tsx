import { useState } from 'react'
import { replaceAt, removeAt, freeId } from '../../../data/package/edit/ops'
import { cupsForPackage } from '../../../data/package/packageCups'
import type { DataPackage, PackageCup } from '../../../data/package/types'
import type { CupEntrant, CupEntrantSource, CupFormat, CupGroupsSpec, CupLeaguePhaseSpec, CupStageSpec, Region } from '../../../engine/types'
import { CUP_FORMAT_LABELS, CUP_HOME_LABELS, CUP_SEEDING_LABELS, CUP_SOURCE_LABELS, REGION_LABELS } from '../../labels'
import { CheckField, Field, NumberField, SelectField, Section, SmallButton, TextField, inputClass } from './fields'
import { EntityIssues, IssueDot, ListRow, MasterDetail } from './parts'
import type { TabProps } from './parts'

const CONTINENTS: Region[] = ['SA', 'EU', 'NA', 'AF', 'AS', 'OC']
const options = <T extends string>(labels: Record<T, string>) => (Object.keys(labels) as T[]).map((id) => ({ id, label: labels[id] }))

/** Copa nova de mata-mata com as vagas na primeira liga do país e fases suficientes para fechar a final. */
function newCup(pkg: DataPackage): PackageCup {
  const league = pkg.leagues[0]
  const teams = pkg.leagues.filter((l) => l.country === league?.country).reduce((n, l) => n + l.teams, 0)
  const rounds = Math.max(1, Math.ceil(Math.log2(Math.max(2, teams))))
  const names = ['Final', 'Semifinais', 'Quartas de final', 'Oitavas de final']
  const stages: CupStageSpec[] = Array.from({ length: rounds }, (_, i) => ({ name: names[rounds - 1 - i] ?? `Fase ${i + 1}`, legs: 1 as const, date: [Math.min(12, 2 + i), 10] as [number, number] }))
  return {
    id: freeId('cup-ed', [...(pkg.cups ?? []).map((c) => c.id), ...pkg.leagues.map((l) => l.id)]),
    name: 'Nova copa',
    kind: 'cup',
    ...(league ? { country: league.country } : {}),
    format: 'knockout',
    entrants: pkg.leagues.filter((l) => l.country === league?.country).map((l) => ({ source: { type: 'league' as const, league: l.id } })),
    stages,
  }
}

function MonthDay({ label, value, onChange }: { label: string; value: [number, number]; onChange: (v: [number, number]) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <NumberField label={`${label}: mês`} value={value[0]} min={1} max={12} onChange={(m) => m !== undefined && onChange([m, value[1]])} />
      <NumberField label={`${label}: dia`} value={value[1]} min={1} max={31} onChange={(d) => d !== undefined && onChange([value[0], d])} />
    </div>
  )
}

function StageEditor({ stage, onChange, onRemove, label }: { stage: CupStageSpec; onChange: (s: CupStageSpec) => void; onRemove?: () => void; label: string }) {
  return (
    <div className="space-y-2 rounded-xl border border-line p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-muted">{label}</span>
        {onRemove && (
          <SmallButton danger onClick={onRemove}>
            Remover
          </SmallButton>
        )}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <TextField label="Nome" value={stage.name} onChange={(name) => onChange({ ...stage, name })} />
        <SelectField<'1' | '2'> label="Jogos" value={String(stage.legs) as '1' | '2'} options={[{ id: '1', label: 'Jogo único' }, { id: '2', label: 'Ida e volta' }]} onChange={(v) => onChange({ ...stage, legs: v === '2' ? 2 : 1 })} />
        <MonthDay label="Data de referência" value={stage.date} onChange={(date) => onChange({ ...stage, date })} />
        <NumberField label="Dias entre ida e volta" value={stage.legGap} optional min={2} max={60} hint="Padrão: 7." onChange={(v) => onChange(v === undefined ? omit(stage, 'legGap') : { ...stage, legGap: v })} />
      </div>
      <CheckField label="Estádio neutro (jogo único)" checked={stage.neutral === true} onChange={(on) => onChange(on ? { ...stage, neutral: true } : omit(stage, 'neutral'))} />
    </div>
  )
}

function omit<T extends object, K extends keyof T>(o: T, key: K): Omit<T, K> {
  const { [key]: _removed, ...rest } = o
  return rest
}

function SourceEditor({ source, onChange, leagues, cups, self }: { source: CupEntrantSource; onChange: (s: CupEntrantSource) => void; leagues: { id: string; label: string }[]; cups: { id: string; label: string }[]; self: string }) {
  const otherCups = cups.filter((c) => c.id !== self)
  const type = source.type
  const change = (t: CupEntrantSource['type']) => {
    if (t === 'league') onChange({ type: 'league', league: leagues[0]?.id ?? '' })
    else if (t === 'cup') onChange({ type: 'cup', cup: otherCups[0]?.id ?? '', place: 'winner' })
    else if (t === 'region') onChange({ type: 'region', region: 'EU', count: 8 })
    else onChange({ type: 'cup-group-place', cup: otherCups[0]?.id ?? '', place: 3 })
  }
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <SelectField<CupEntrantSource['type']> label="De onde vêm" value={type} options={options(CUP_SOURCE_LABELS)} onChange={(t) => t && change(t)} />
      {source.type === 'league' && (
        <>
          <SelectField<string> label="Liga" value={source.league} options={leagues} onChange={(league) => league && onChange({ ...source, league })} />
          <NumberField label="Do colocado" value={source.positions?.[0]} optional min={1} hint="Vazio = todos os clubes da liga." onChange={(from) => onChange(from === undefined ? { type: 'league', league: source.league } : { ...source, positions: [from, source.positions?.[1] ?? from] })} />
          <NumberField label="Até o colocado" value={source.positions?.[1]} optional min={1} onChange={(to) => to !== undefined && source.positions && onChange({ ...source, positions: [source.positions[0], to] })} />
        </>
      )}
      {source.type === 'cup' && (
        <>
          <SelectField<string> label="Copa" value={source.cup} options={otherCups} onChange={(cup) => cup && onChange({ ...source, cup })} />
          <SelectField<'winner' | 'runner-up'> label="Quem" value={source.place} options={[{ id: 'winner', label: 'Campeão' }, { id: 'runner-up', label: 'Vice' }]} onChange={(place) => place && onChange({ ...source, place })} />
          <CheckField label="Última edição terminada (qualquer ano)" checked={source.latest === true} onChange={(on) => onChange(on ? { ...source, latest: true } : omit(source, 'latest'))} />
        </>
      )}
      {source.type === 'region' && (
        <>
          <SelectField<Region> label="Continente" value={source.region} options={CONTINENTS.map((r) => ({ id: r, label: REGION_LABELS[r] }))} onChange={(region) => region && onChange({ ...source, region: region as never })} />
          <NumberField label="Quantos clubes" value={source.count} min={1} max={64} onChange={(count) => count !== undefined && onChange({ ...source, count })} />
          <SelectField<string> label="Campeões desta copa primeiro" value={source.cup} empty="Só pela força" options={otherCups} onChange={(cup) => onChange(cup ? { ...source, cup, last: source.last ?? 4 } : omit(omit(source, 'cup'), 'last'))} />
          {source.cup && <NumberField label="Das últimas N edições" value={source.last} min={1} max={20} onChange={(last) => last !== undefined && onChange({ ...source, last })} />}
        </>
      )}
      {source.type === 'cup-group-place' && (
        <>
          <SelectField<string> label="Copa (fase de grupos)" value={source.cup} options={otherCups} onChange={(cup) => cup && onChange({ ...source, cup })} />
          <NumberField label="Colocação em cada grupo" value={source.place} min={1} max={8} onChange={(place) => place !== undefined && onChange({ ...source, place })} />
        </>
      )}
    </div>
  )
}

/** Competições: nome, formato, vagas, fases e regras, com as mesmas opções que o pacote aceita. */
export function CupsTab(props: TabProps) {
  const { editor, validation, selected, select } = props
  const { pkg, edit } = editor
  const index = selected.cups
  const cups = pkg.cups ?? []
  const cup = index !== null ? cups[index] : undefined
  const [json, setJson] = useState<{ index: number; text: string; error?: string } | null>(null)

  const patch = (change: Partial<PackageCup>, key: string) => {
    if (index === null) return
    edit((p) => ({ ...p, cups: replaceAt(p.cups ?? [], index, { ...((p.cups ?? [])[index] as PackageCup), ...change }) }), `cup-${index}-${key}`)
  }
  const drop = (...keys: (keyof PackageCup)[]) => {
    if (index === null) return
    edit((p) => {
      const next = { ...((p.cups ?? [])[index] as PackageCup) }
      for (const k of keys) delete next[k]
      return { ...p, cups: replaceAt(p.cups ?? [], index, next) }
    })
  }

  const cupOptions = cups.map((c) => ({ id: c.id, label: `${c.name} (${c.id})` }))
  const leagueOptions = pkg.leagues.map((l) => ({ id: l.id, label: l.name }))

  const list = (
    <div className="space-y-3">
      {pkg.cups === undefined && (
        <div className="space-y-2 rounded-2xl border border-line bg-surface p-4 text-sm">
          <p className="text-muted">O pacote não define copas: o jogo usa as copas padrão dos países ({cupsForPackage(pkg).cups.length} no total). Para editar, traga-as para o pacote.</p>
          <SmallButton onClick={() => edit((p) => ({ ...p, cups: cupsForPackage(p).cups }))}>Trazer as copas padrão para editar</SmallButton>
        </div>
      )}
      {pkg.cups !== undefined && (
        <div className="flex flex-wrap gap-2">
          <SmallButton
            onClick={() => {
              edit((p) => ({ ...p, cups: [...(p.cups ?? []), newCup(p)] }))
              select('cups', cups.length)
            }}
          >
            + Nova copa
          </SmallButton>
          <SmallButton title="Acrescenta as copas padrão dos países que ainda não têm nenhuma" onClick={() => edit((p) => ({ ...p, cups: cupsForPackage(p).cups }))}>
            Completar com as padrão
          </SmallButton>
          <SmallButton danger onClick={() => window.confirm('Deixar o pacote sem nenhuma copa (nem as padrão)?') && (edit((p) => ({ ...p, cups: [] })), select('cups', null))}>
            Sem copas
          </SmallButton>
        </div>
      )}
      <div className="rounded-2xl border border-line bg-surface p-1">
        {cups.length === 0 && pkg.cups !== undefined && <p className="p-4 text-sm text-muted">Sem copas: o mundo só tem as ligas.</p>}
        {cups.map((c, i) => (
          <ListRow key={c.id} active={i === index} onClick={() => select('cups', i)}>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-bold">{c.name}</span>
              <span className="text-xs text-muted">
                {CUP_FORMAT_LABELS[c.format]} · {c.country ?? (c.world ? 'mundial' : c.region ? REGION_LABELS[c.region] : '—')}
              </span>
            </span>
            <IssueDot validation={validation} kind="cups" index={i} />
          </ListRow>
        ))}
      </div>
    </div>
  )

  let detail = null
  if (cup && index !== null) {
    const setEntrant = (i: number, entrant: CupEntrant) => patch({ entrants: replaceAt(cup.entrants, i, entrant) }, `entrant-${i}`)
    const setStage = (key: 'stages' | 'preliminary', i: number, stage: CupStageSpec) => patch({ [key]: replaceAt(cup[key] ?? [], i, stage) }, `${key}-${i}`)
    const lastStage = cup.stages[cup.stages.length - 1]
    detail = (
      <>
        <EntityIssues validation={validation} kind="cups" index={index} />
        <Section title="Competição" right={<span className="text-xs text-muted">{cup.id}</span>}>
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField label="Nome" value={cup.name} hint="O nome oficial de um campeonato é marca: prefira nomes genéricos." onChange={(name) => patch({ name }, 'name')} />
            <SelectField<'cup' | 'supercup'> label="Tipo" value={cup.kind ?? 'cup'} options={[{ id: 'cup', label: 'Copa' }, { id: 'supercup', label: 'Supercopa' }]} onChange={(kind) => kind && patch({ kind }, 'kind')} />
            <SelectField<string> label="País (copa nacional)" value={cup.country} empty="Nenhum (continental ou mundial)" options={pkg.countries.map((c) => ({ id: c.id, label: c.name }))} onChange={(c) => (c ? patch({ country: c }, 'country') : drop('country'))} />
            <SelectField<Region> label="Região (copa continental)" value={cup.region} empty="Nenhuma" options={CONTINENTS.map((r) => ({ id: r, label: REGION_LABELS[r] }))} onChange={(r) => (r ? patch({ region: r }, 'region') : drop('region'))} />
            <SelectField<CupFormat> label="Formato" value={cup.format} options={options(CUP_FORMAT_LABELS)} onChange={(format) => format && patch({ format }, 'format')} />
            <SelectField<'2' | '3' | '4'> label="Dia da semana" value={String(cup.weekday ?? 3) as '3'} options={[{ id: '2', label: 'Terça' }, { id: '3', label: 'Quarta' }, { id: '4', label: 'Quinta' }]} onChange={(v) => patch({ weekday: Number(v) as 2 | 3 | 4 }, 'weekday')} />
          </div>
          {cup.world && <p className="text-xs text-muted">Copa mundial (a cada {cup.world.every} ano(s), a partir de {cup.world.from[1]}/{cup.world.from[0]}): os dados dela ficam em “Avançado”.</p>}
        </Section>

        <Section title="Regras">
          <div className="grid gap-3 sm:grid-cols-2">
            <SelectField<NonNullable<PackageCup['seeding']>> label="Sorteio" value={cup.seeding ?? 'random'} options={options(CUP_SEEDING_LABELS)} onChange={(v) => v && patch({ seeding: v }, 'seeding')} />
            <SelectField<NonNullable<PackageCup['homeOfSingleLeg']>> label="Mandante do jogo único" value={cup.homeOfSingleLeg ?? 'draw'} options={options(CUP_HOME_LABELS)} onChange={(v) => v && patch({ homeOfSingleLeg: v }, 'home')} />
          </div>
          <div className="grid gap-1 sm:grid-cols-3">
            <CheckField label="Gol fora" checked={cup.awayGoals === true} onChange={(awayGoals) => patch({ awayGoals }, 'away')} />
            <CheckField label="Prorrogação" checked={cup.extraTime !== false} onChange={(extraTime) => patch({ extraTime }, 'extra')} />
            <CheckField label="Pênaltis" checked={cup.penalties !== false} onChange={(penalties) => patch({ penalties }, 'pens')} />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <NumberField label="Amarelos por suspensão" value={cup.discipline?.yellowsPerSuspension ?? 3} min={1} max={10} onChange={(v) => v !== undefined && patch({ discipline: { ...cup.discipline, yellowsPerSuspension: v } }, 'yellows')} />
            <NumberField label="Jogos por vermelho" value={cup.discipline?.redCardGames ?? 1} min={1} max={10} onChange={(v) => v !== undefined && patch({ discipline: { ...cup.discipline, redCardGames: v } }, 'reds')} />
            <NumberField label="Zerar amarelos após a fase" value={cup.discipline?.clearYellowsAfterStage} optional min={0} onChange={(v) => patch({ discipline: v === undefined ? omit({ ...cup.discipline }, 'clearYellowsAfterStage') : { ...cup.discipline, clearYellowsAfterStage: v } }, 'clear')} />
          </div>
          <Field label="Não repete clubes destas copas (mesma edição)">
            <select multiple className={`${inputClass} h-28`} value={cup.excludeCups ?? []} onChange={(e) => patch({ excludeCups: [...e.target.selectedOptions].map((o) => o.value) }, 'exclude')}>
              {cupOptions.filter((c) => c.id !== cup.id).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>
        </Section>

        <Section title={`Vagas (${cup.entrants.length})`} right={<SmallButton onClick={() => patch({ entrants: [...cup.entrants, { source: { type: 'league', league: pkg.leagues[0]?.id ?? '' } }] }, 'entrants-add')}>+ Vaga</SmallButton>}>
          {cup.entrants.map((entrant, i) => (
            <div key={i} className="space-y-2 rounded-xl border border-line p-3">
              <SourceEditor source={entrant.source} leagues={leagueOptions} cups={cupOptions} self={cup.id} onChange={(source) => setEntrant(i, { ...entrant, source })} />
              <div className="flex items-end justify-between gap-2">
                <NumberField label="Entra na fase (0 = primeira)" value={entrant.stage ?? 0} min={0} max={12} onChange={(v) => v !== undefined && setEntrant(i, v === 0 ? omit(entrant, 'stage') : { ...entrant, stage: v })} />
                <SmallButton danger onClick={() => patch({ entrants: removeAt(cup.entrants, i) }, 'entrants-remove')}>
                  Remover vaga
                </SmallButton>
              </div>
            </div>
          ))}
        </Section>

        {cup.format === 'groups-knockout' && (
          <>
            <Section title="Fase de grupos">
              <div className="grid gap-3 sm:grid-cols-3">
                <TextField label="Nome" value={cup.groups?.name ?? 'Fase de grupos'} onChange={(name) => patch({ groups: { ...(cup.groups ?? defaultGroups()), name } }, 'g-name')} />
                <NumberField label="Grupos" value={cup.groups?.count ?? 4} min={1} max={16} onChange={(v) => v !== undefined && patch({ groups: { ...(cup.groups ?? defaultGroups()), count: v } }, 'g-count')} />
                <NumberField label="Passam de cada grupo" value={cup.groups?.advance ?? 2} min={1} max={8} onChange={(v) => v !== undefined && patch({ groups: { ...(cup.groups ?? defaultGroups()), advance: v } }, 'g-adv')} />
                <NumberField label="Líderes que pulam a 1ª fase" value={cup.groups?.direct} optional min={0} max={4} onChange={(v) => patch({ groups: v === undefined ? omit(cup.groups ?? defaultGroups(), 'direct') : { ...(cup.groups ?? defaultGroups()), direct: v } }, 'g-direct')} />
                <SelectField<'1' | '2'> label="Jogos" value={String(cup.groups?.legs ?? 2) as '1' | '2'} options={[{ id: '1', label: 'Só ida' }, { id: '2', label: 'Ida e volta' }]} onChange={(v) => patch({ groups: { ...(cup.groups ?? defaultGroups()), legs: v === '1' ? 1 : 2 } }, 'g-legs')} />
                <NumberField label="Dias entre rodadas" value={cup.groups?.gapDays ?? 7} min={1} max={60} onChange={(v) => v !== undefined && patch({ groups: { ...(cup.groups ?? defaultGroups()), gapDays: v } }, 'g-gap')} />
              </div>
              <MonthDay label="Primeira rodada" value={cup.groups?.date ?? [9, 15]} onChange={(date) => patch({ groups: { ...(cup.groups ?? defaultGroups()), date } }, 'g-date')} />
            </Section>
            <Section title={`Fases preliminares (${cup.preliminary?.length ?? 0})`} right={<SmallButton onClick={() => patch({ preliminary: [...(cup.preliminary ?? []), { name: 'Preliminar', legs: 2, date: [7, 15] }] }, 'pre-add')}>+ Fase</SmallButton>}>
              {(cup.preliminary ?? []).map((stage, i) => (
                <StageEditor key={i} label={`Preliminar ${i + 1}`} stage={stage} onChange={(s) => setStage('preliminary', i, s)} onRemove={() => patch({ preliminary: removeAt(cup.preliminary ?? [], i) }, 'pre-remove')} />
              ))}
            </Section>
          </>
        )}

        {cup.format === 'league-knockout' && (
          <Section title="Fase de liga">
            <div className="grid gap-3 sm:grid-cols-3">
              <TextField label="Nome" value={cup.leaguePhase?.name ?? 'Fase de liga'} onChange={(name) => patch({ leaguePhase: { ...(cup.leaguePhase ?? defaultLeaguePhase()), name } }, 'l-name')} />
              <NumberField label="Potes" value={cup.leaguePhase?.pots ?? 4} min={1} max={8} onChange={(v) => v !== undefined && patch({ leaguePhase: { ...(cup.leaguePhase ?? defaultLeaguePhase()), pots: v } }, 'l-pots')} />
              <NumberField label="Jogos por clube" value={cup.leaguePhase?.matchesPerTeam ?? 8} min={2} max={20} hint="Múltiplo de 2 × potes." onChange={(v) => v !== undefined && patch({ leaguePhase: { ...(cup.leaguePhase ?? defaultLeaguePhase()), matchesPerTeam: v } }, 'l-matches')} />
              <NumberField label="Direto ao mata-mata" value={cup.leaguePhase?.direct ?? 8} min={0} onChange={(v) => v !== undefined && patch({ leaguePhase: { ...(cup.leaguePhase ?? defaultLeaguePhase()), direct: v } }, 'l-direct')} />
              <NumberField label="Vão ao play-off" value={cup.leaguePhase?.playoff ?? 16} min={0} onChange={(v) => v !== undefined && patch({ leaguePhase: { ...(cup.leaguePhase ?? defaultLeaguePhase()), playoff: v } }, 'l-playoff')} />
              <NumberField label="Dias entre rodadas" value={cup.leaguePhase?.gapDays ?? 7} min={1} max={60} onChange={(v) => v !== undefined && patch({ leaguePhase: { ...(cup.leaguePhase ?? defaultLeaguePhase()), gapDays: v } }, 'l-gap')} />
            </div>
            <MonthDay label="Primeira rodada" value={cup.leaguePhase?.date ?? [9, 10]} onChange={(date) => patch({ leaguePhase: { ...(cup.leaguePhase ?? defaultLeaguePhase()), date } }, 'l-date')} />
          </Section>
        )}

        <Section title={`Fases de mata-mata (${cup.stages.length})`} right={<SmallButton onClick={() => patch({ stages: [...cup.stages, { name: `Fase ${cup.stages.length + 1}`, legs: 1, date: lastStage ? lastStage.date : [10, 10] }] }, 'stages-add')}>+ Fase</SmallButton>}>
          {cup.stages.map((stage, i) => (
            <StageEditor key={i} label={`Fase ${i + 1}${i === cup.stages.length - 1 ? ' (final)' : ''}`} stage={stage} onChange={(s) => setStage('stages', i, s)} onRemove={cup.stages.length > 1 ? () => patch({ stages: removeAt(cup.stages, i) }, 'stages-remove') : undefined} />
          ))}
        </Section>

        <Section title="Premiação (em reais do Brasil; multiplicada pela economia da liga)">
          <div className="grid gap-3 sm:grid-cols-2">
            <NumberField label="Campeão" value={cup.prize?.champion ?? 0} min={0} step={100000} onChange={(v) => v !== undefined && patch({ prize: { perStage: cup.prize?.perStage ?? [], ...cup.prize, champion: v } }, 'p-champion')} />
            <NumberField label="Vice" value={cup.prize?.runnerUp} optional min={0} step={100000} onChange={(v) => patch({ prize: v === undefined ? omit({ perStage: cup.prize?.perStage ?? [], champion: cup.prize?.champion ?? 0, ...cup.prize }, 'runnerUp') : { perStage: cup.prize?.perStage ?? [], champion: cup.prize?.champion ?? 0, ...cup.prize, runnerUp: v } }, 'p-runner')} />
          </div>
          <TextField label="Valor ao estrear em cada fase (separados por vírgula)" value={(cup.prize?.perStage ?? []).join(', ')} hint="Um valor por fase, na ordem. Pode ter menos valores que fases." onChange={(t) => patch({ prize: { champion: cup.prize?.champion ?? 0, ...cup.prize, perStage: t.split(',').map((x) => x.trim()).filter((x) => x !== '').map(Number).filter((n) => Number.isFinite(n) && n >= 0) } }, 'p-stage')} />
        </Section>

        <Section title="Avançado: JSON desta copa">
          <p className="text-xs text-muted">Para o que não tem campo acima (copa mundial, desempates, vagas reserva). A validação roda como em qualquer pacote.</p>
          {json?.index === index ? (
            <>
              <textarea className={`${inputClass} min-h-64 py-2 font-mono text-xs`} value={json.text} onChange={(e) => setJson({ index, text: e.target.value })} />
              {json.error && <p className="text-sm text-loss">{json.error}</p>}
              <div className="flex gap-2">
                <SmallButton
                  onClick={() => {
                    try {
                      const parsed = JSON.parse(json.text) as PackageCup
                      edit((p) => ({ ...p, cups: replaceAt(p.cups ?? [], index, parsed) }))
                      setJson(null)
                    } catch (e) {
                      setJson({ ...json, error: `JSON inválido: ${e instanceof Error ? e.message : ''}` })
                    }
                  }}
                >
                  Aplicar
                </SmallButton>
                <SmallButton onClick={() => setJson(null)}>Cancelar</SmallButton>
              </div>
            </>
          ) : (
            <SmallButton onClick={() => setJson({ index, text: JSON.stringify(cup, null, 2) })}>Editar o JSON</SmallButton>
          )}
        </Section>

        <SmallButton
          danger
          onClick={() => {
            if (!window.confirm(`Apagar a copa "${cup.name}"?`)) return
            edit((p) => ({ ...p, cups: removeAt(p.cups ?? [], index) }))
            select('cups', null)
          }}
        >
          Apagar a copa
        </SmallButton>
      </>
    )
  }

  return <MasterDetail list={list} detail={detail} hasSelection={cup !== undefined} onBack={() => select('cups', null)} empty="Escolha uma copa à esquerda para editar." />
}

const defaultGroups = (): CupGroupsSpec => ({ name: 'Fase de grupos', count: 4, advance: 2, legs: 2, date: [9, 15] })
const defaultLeaguePhase = (): CupLeaguePhaseSpec => ({ name: 'Fase de liga', pots: 4, matchesPerTeam: 8, date: [9, 10], direct: 8, playoff: 16 })
