import { useEffect, useMemo, useState } from 'react'
import { addPlayer, compactPlayer, playersOf, removePlayer, replaceAt, transferPlayer, withPlayers } from '../../../data/package/edit/ops'
import { playerStrength, suggestPlayerData } from '../../../data/package/edit/suggest'
import type { PackagePlayer } from '../../../data/package/types'
import { ATTRIBUTE_MAX, ATTRIBUTE_MIN } from '../../../engine/config'
import { ageOn } from '../../../engine/season/dates'
import { GOALKEEPER_ATTRIBUTES, MENTAL_ATTRIBUTES, NATIONALITIES, PHYSICAL_ATTRIBUTES, POSITIONS, TECHNICAL_ATTRIBUTES } from '../../../engine/types'
import type { AttributeName, Foot, Nationality, Position } from '../../../engine/types'
import { ATTRIBUTE_LABELS, FOOT_LABELS, NATIONALITY_LABELS, POSITION_LABELS, POSITION_SHORT_LABELS } from '../../labels'
import { Flag } from '../../theme/PlayerBits'
import { CheckField, DateField, NumberField, SelectField, Section, SmallButton, TextField, inputClass } from './fields'
import { EntityIssues, IssueDot, ListRow, MasterDetail } from './parts'
import type { TabProps } from './parts'

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const PAGE = 50
const clamp = (v: number) => Math.min(ATTRIBUTE_MAX, Math.max(ATTRIBUTE_MIN, Math.round(v)))
type Sort = 'name' | 'strength' | 'age'

const ATTRIBUTE_GROUPS: { title: string; names: readonly AttributeName[] }[] = [
  { title: 'Técnicos', names: TECHNICAL_ATTRIBUTES },
  { title: 'Físicos', names: PHYSICAL_ATTRIBUTES },
  { title: 'Mentais', names: MENTAL_ATTRIBUTES },
  { title: 'Goleiro', names: GOALKEEPER_ATTRIBUTES },
]

const POSITION_OPTIONS = POSITIONS.map((p) => ({ id: p, label: `${POSITION_SHORT_LABELS[p]} · ${POSITION_LABELS[p]}` }))
const NATIONALITY_OPTIONS = NATIONALITIES.map((n) => ({ id: n, label: NATIONALITY_LABELS[n] }))

/** Jogadores (e a base): busca, filtros, criar, apagar, transferir e editar os atributos, com a geração automática. */
export function PlayersTab(props: TabProps) {
  const { editor, validation, selected, select, playerList, setPlayerList, clubFilter, setClubFilter } = props
  const { pkg, edit } = editor
  const listKind = playerList
  const all = playersOf(pkg, listKind)
  const [text, setText] = useState('')
  const [position, setPosition] = useState<Position | ''>('')
  const [nationality, setNationality] = useState<Nationality | ''>('')
  const [minOverall, setMinOverall] = useState('')
  const [maxOverall, setMaxOverall] = useState('')
  const [sort, setSort] = useState<Sort>('name')
  const [page, setPage] = useState(0)
  const index = selected.players
  const player = index !== null ? all[index] : undefined
  const startYear = pkg.startYear ?? 2026
  const clubById = useMemo(() => new Map(pkg.clubs.map((c) => [c.id, c])), [pkg.clubs])

  useEffect(() => setPage(0), [text, position, nationality, minOverall, maxOverall, sort, clubFilter, listKind])

  const rows = useMemo(() => {
    const q = norm(text)
    const min = minOverall === '' ? null : Number(minOverall)
    const max = maxOverall === '' ? null : Number(maxOverall)
    const needsStrength = sort === 'strength' || min !== null || max !== null
    let out = all.map((p, i) => ({ p, i, strength: needsStrength ? playerStrength(pkg, p) : -1 }))
    out = out.filter(({ p, strength }) => {
      if (clubFilter === '__free__' ? p.club : clubFilter ? p.club !== clubFilter : false) return false
      if (position && p.position !== position) return false
      if (nationality && p.nationality !== nationality) return false
      if (q && !norm(`${p.name} ${p.nickname ?? ''}`).includes(q)) return false
      if (min !== null && strength < min) return false
      if (max !== null && strength > max) return false
      return true
    })
    if (sort === 'name') out.sort((a, b) => a.p.name.localeCompare(b.p.name))
    else if (sort === 'strength') out.sort((a, b) => b.strength - a.strength)
    else out.sort((a, b) => b.p.birthDate.localeCompare(a.p.birthDate))
    return out
  }, [all, pkg, text, position, nationality, minOverall, maxOverall, sort, clubFilter])

  const pageRows = rows.slice(page * PAGE, page * PAGE + PAGE)
  const pages = Math.max(1, Math.ceil(rows.length / PAGE))

  const patch = (change: Partial<PackagePlayer>, key: string) => {
    if (index === null) return
    edit((p) => withPlayers(p, listKind, replaceAt(playersOf(p, listKind), index, compactPlayer({ ...(playersOf(p, listKind)[index] as PackagePlayer), ...change }))), `player-${listKind}-${index}-${key}`)
  }

  const clubOptions = pkg.clubs.map((c) => ({ id: c.id, label: c.name }))
  const filterClub = clubFilter && clubFilter !== '__free__' ? clubById.get(clubFilter) : undefined

  const list = (
    <div className="space-y-3">
      <div className="flex gap-1 rounded-xl bg-surface p-1">
        {(['players', 'academy'] as const).map((k) => (
          <button key={k} type="button" onClick={() => (setPlayerList(k), select('players', null))} className={`min-h-10 flex-1 rounded-lg text-sm font-bold ${listKind === k ? 'bg-accent text-accent-ink' : 'text-muted'}`}>
            {k === 'players' ? `Elenco (${pkg.players.length})` : `Base (${pkg.academy?.length ?? 0})`}
          </button>
        ))}
      </div>
      <input className={inputClass} placeholder="Buscar jogador ou apelido" value={text} onChange={(e) => setText(e.target.value)} />
      <div className="grid grid-cols-2 gap-2">
        <SelectField<string> label="Clube" value={clubFilter ?? ''} empty="Todos" options={[{ id: '__free__', label: 'Livres (sem clube)' }, ...clubOptions]} onChange={(v) => setClubFilter(v ?? null)} />
        <SelectField<Position> label="Posição" value={position || undefined} empty="Todas" options={POSITION_OPTIONS} onChange={(v) => setPosition(v ?? '')} />
        <SelectField<Nationality> label="Nacionalidade" value={nationality || undefined} empty="Todas" options={NATIONALITY_OPTIONS} onChange={(v) => setNationality(v ?? '')} />
        <SelectField<Sort> label="Ordem" value={sort} options={[{ id: 'name', label: 'Nome' }, { id: 'strength', label: 'Força' }, { id: 'age', label: 'Mais jovem' }]} onChange={(v) => setSort(v ?? 'name')} />
        <label className="space-y-1">
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted">Força de</span>
          <input className={inputClass} inputMode="numeric" value={minOverall} onChange={(e) => setMinOverall(e.target.value.replace(/\D/g, ''))} />
        </label>
        <label className="space-y-1">
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted">Força até</span>
          <input className={inputClass} inputMode="numeric" value={maxOverall} onChange={(e) => setMaxOverall(e.target.value.replace(/\D/g, ''))} />
        </label>
      </div>
      <SmallButton
        onClick={() => {
          const target = clubFilter && clubFilter !== '__free__' ? clubFilter : listKind === 'academy' ? (pkg.clubs[0]?.id ?? null) : null
          edit((p) => addPlayer(p, listKind, target))
          select('players', all.length)
        }}
      >
        + Novo jogador{filterClub ? ` em ${filterClub.abbreviation}` : ''}
      </SmallButton>
      <div className="rounded-2xl border border-line bg-surface p-1">
        {pageRows.length === 0 && <p className="p-4 text-sm text-muted">Nenhum jogador com esses filtros.</p>}
        {pageRows.map(({ p, i }) => {
          const club = p.club ? clubById.get(p.club) : undefined
          return (
            <ListRow key={p.id ?? i} active={i === index} onClick={() => select('players', i)}>
              <Flag nationality={p.nationality} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold">{p.nickname ? `${p.nickname} (${p.name})` : p.name}</span>
                <span className="text-xs text-muted">
                  {POSITION_SHORT_LABELS[p.position]} · {ageOn(p.birthDate, `${startYear}-01-01`)} anos{p.birthEstimated ? ' (estimada)' : ''}{p.generated ? ' · gerado' : ''} · {club?.abbreviation ?? 'Livre'}
                </span>
              </span>
              <span className="title w-9 text-right text-xl">{Math.round(playerStrength(pkg, p))}</span>
              <IssueDot validation={validation} kind={listKind} index={i} />
            </ListRow>
          )
        })}
      </div>
      <div className="flex items-center justify-between text-xs text-muted">
        <span>
          {rows.length} de {all.length} jogadores
        </span>
        <span className="flex items-center gap-2">
          <SmallButton disabled={page === 0} onClick={() => setPage(page - 1)}>
            ‹
          </SmallButton>
          {page + 1} / {pages}
          <SmallButton disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>
            ›
          </SmallButton>
        </span>
      </div>
    </div>
  )

  let detail = null
  if (player && index !== null) {
    const suggestion = suggestPlayerData(pkg, player)
    const fixed = player.attributes !== undefined
    const attrs = player.attributes ?? suggestion.attributes
    const hidden = player.hidden ?? suggestion.hidden
    const contract = player.contract ?? suggestion.contract
    const potential = player.potential ?? suggestion.potential
    const strength = playerStrength(pkg, player)
    const setAttr = (name: AttributeName, v: number) => patch({ attributes: { ...attrs, [name]: clamp(v) } }, `attr-${name}`)
    const secondary = player.secondaryPositions ?? []
    const setSecondary = (slot: 0 | 1, v: Position | undefined) => {
      const next = [secondary[0], secondary[1]]
      next[slot] = v
      patch({ secondaryPositions: next.filter((x): x is Position => x !== undefined) }, 'secondary')
    }
    detail = (
      <>
        <EntityIssues validation={validation} kind={listKind} index={index} />
        <Section title="Jogador" right={<span className="text-xs text-muted">{player.id ?? 'sem id'}</span>}>
          <div className="flex items-center gap-4">
            <div className="text-center">
              <div className="title text-5xl">{Math.round(strength)}</div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted">Força</div>
            </div>
            <p className="text-xs text-muted">{fixed ? 'Atributos fixados no pacote.' : 'O pacote não traz os atributos: o jogo gera estes valores de forma estável a partir da posição, da idade e do nível do clube. Mexer em um campo fixa os valores.'}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField label="Nome completo" value={player.name} onChange={(name) => patch({ name }, 'name')} />
            <TextField label="Apelido" value={player.nickname} onChange={(nickname) => patch({ nickname }, 'nickname')} />
            <DateField label="Nascimento" value={player.birthDate} onChange={(d) => d && patch({ birthDate: d, birthEstimated: undefined }, 'birth')} hint={`${ageOn(player.birthDate || `${startYear}-01-01`, `${startYear}-01-01`)} anos em 1º de janeiro de ${startYear}${player.birthEstimated ? ' · data estimada, a conferir' : ''}`} />
            {player.generated && <CheckField label="Jogador gerado" checked onChange={(v) => !v && patch({ generated: undefined }, 'generated')} hint="Gerado para completar o elenco: troque pelo jogador real e desmarque." />}
            {player.birthEstimated && <CheckField label="Data de nascimento estimada" checked onChange={(v) => !v && patch({ birthEstimated: undefined }, 'birth-estimated')} hint="Desmarque quando conferir a data. Mudar a data também tira a marca." />}
            <SelectField<Nationality> label="Nacionalidade" value={player.nationality} options={NATIONALITY_OPTIONS} onChange={(n) => n && patch({ nationality: n }, 'nat')} />
            <SelectField<Position> label="Posição principal" value={player.position} options={POSITION_OPTIONS} onChange={(v) => v && patch({ position: v }, 'position')} />
            <SelectField<Foot> label="Pé" value={player.foot} empty="Automático" options={(['right', 'left', 'both'] as const).map((f) => ({ id: f, label: FOOT_LABELS[f] }))} onChange={(foot) => patch({ foot }, 'foot')} />
            <SelectField<Position> label="Posição secundária 1" value={secondary[0]} empty={player.secondaryPositions ? '—' : 'Automático'} options={POSITION_OPTIONS} onChange={(v) => setSecondary(0, v)} />
            <SelectField<Position> label="Posição secundária 2" value={secondary[1]} empty={player.secondaryPositions ? '—' : 'Automático'} options={POSITION_OPTIONS} onChange={(v) => setSecondary(1, v)} />
            <SelectField<string>
              label="Clube"
              value={player.club ?? ''}
              {...(listKind === 'players' ? { empty: 'Livre (sem clube)' } : {})}
              options={clubOptions}
              hint="Trocar o clube transfere o jogador (e muda o nível dos atributos gerados)."
              onChange={(c) => edit((p) => transferPlayer(p, listKind, index, c ?? null))}
            />
          </div>
        </Section>

        <Section
          title="Atributos"
          right={
            <div className="flex gap-2">
              <SmallButton onClick={() => patch({ attributes: suggestion.attributes, potential: suggestion.potential, hidden: suggestion.hidden, contract: suggestion.contract }, 'auto')}>Gerar automaticamente</SmallButton>
              <SmallButton disabled={!fixed && player.potential === undefined && !player.hidden && !player.contract} onClick={() => patch({ attributes: undefined, potential: undefined, hidden: undefined, contract: undefined }, 'unfix')}>
                Deixar o jogo gerar
              </SmallButton>
            </div>
          }
        >
          <p className="text-xs text-muted">“Gerar automaticamente” preenche pela posição, idade e nível do clube (reputação, divisão e economia da liga); depois ajuste à mão.</p>
          {ATTRIBUTE_GROUPS.map((group) => (
            <div key={group.title}>
              <h4 className="mb-1 text-xs font-bold text-muted">{group.title}</h4>
              <div className="grid gap-2 sm:grid-cols-2">
                {group.names.map((name) => (
                  <div key={name} className="flex items-center gap-2">
                    <span className="w-28 shrink-0 text-xs">{ATTRIBUTE_LABELS[name]}</span>
                    <input type="range" min={ATTRIBUTE_MIN} max={ATTRIBUTE_MAX} value={attrs[name]} aria-label={ATTRIBUTE_LABELS[name]} className="min-w-0 flex-1 accent-[var(--color-accent)]" onChange={(e) => setAttr(name, Number(e.target.value))} />
                    <input className={`${inputClass} !w-14 text-center`} inputMode="numeric" value={attrs[name]} aria-label={`${ATTRIBUTE_LABELS[name]} (número)`} onChange={(e) => e.target.value !== '' && Number.isFinite(Number(e.target.value)) && setAttr(name, Number(e.target.value))} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </Section>

        <Section title="Potencial, ocultos e contrato">
          <div className="grid gap-3 sm:grid-cols-3">
            <NumberField label="Potencial" value={potential} min={ATTRIBUTE_MIN} max={ATTRIBUTE_MAX} onChange={(v) => v !== undefined && patch({ potential: clamp(v) }, 'potential')} />
            <NumberField label="Consistência" value={hidden.consistency} min={ATTRIBUTE_MIN} max={ATTRIBUTE_MAX} onChange={(v) => v !== undefined && patch({ hidden: { ...hidden, consistency: clamp(v) } }, 'consistency')} />
            <NumberField label="Propensão a lesão" value={hidden.injuryProneness} min={ATTRIBUTE_MIN} max={ATTRIBUTE_MAX} onChange={(v) => v !== undefined && patch({ hidden: { ...hidden, injuryProneness: clamp(v) } }, 'injury')} />
            <NumberField label="Profissionalismo" value={hidden.professionalism} min={ATTRIBUTE_MIN} max={ATTRIBUTE_MAX} onChange={(v) => v !== undefined && patch({ hidden: { ...hidden, professionalism: clamp(v) } }, 'professionalism')} />
            <NumberField label="Salário por mês (R$)" value={contract.salary} min={0} step={500} onChange={(v) => v !== undefined && patch({ contract: { ...contract, salary: v } }, 'salary')} />
            <NumberField label="Multa rescisória (R$)" value={contract.releaseClause} min={0} step={10000} onChange={(v) => v !== undefined && patch({ contract: { ...contract, releaseClause: v } }, 'clause')} />
            <DateField label="Fim do contrato" value={contract.endDate} onChange={(d) => d && patch({ contract: { ...contract, endDate: d } }, 'end')} />
          </div>
        </Section>

        <SmallButton
          danger
          onClick={() => {
            if (!window.confirm(`Apagar ${player.name}?`)) return
            edit((p) => removePlayer(p, listKind, index))
            select('players', null)
          }}
        >
          Apagar o jogador
        </SmallButton>
      </>
    )
  }

  return <MasterDetail list={list} detail={detail} hasSelection={player !== undefined} onBack={() => select('players', null)} empty="Escolha um jogador à esquerda para editar." />
}
