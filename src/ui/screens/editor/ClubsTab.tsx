import { useMemo, useState } from 'react'
import { addClub, addPlayer, moveClubToLeague, removeClub, replaceAt, squadCounts } from '../../../data/package/edit/ops'
import type { PackageClub } from '../../../data/package/types'
import { SQUAD_MAX, SQUAD_MIN } from '../../../engine/types/team'
import { Crest } from '../../theme'
import { ColorField, NumberField, SelectField, Section, SmallButton, TextField, inputClass } from './fields'
import { EntityIssues, IssueDot, ListRow, MasterDetail } from './parts'
import type { TabProps } from './parts'

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Clubes: nome, sigla, cores (com o escudo gerado ao vivo), cidade, estádio, reputação e liga. */
export function ClubsTab(props: TabProps) {
  const { editor, validation, selected, select, goTo, setClubFilter, setPlayerList } = props
  const { pkg, edit } = editor
  const [text, setText] = useState('')
  const [leagueId, setLeagueId] = useState<string>('')
  const counts = useMemo(() => squadCounts(pkg), [pkg])
  const index = selected.clubs
  const club = index !== null ? pkg.clubs[index] : undefined

  const rows = useMemo(() => {
    const q = norm(text)
    return pkg.clubs.map((c, i) => ({ c, i })).filter(({ c }) => (leagueId === '' || c.league === leagueId) && (q === '' || norm(`${c.name} ${c.abbreviation} ${c.city}`).includes(q)))
  }, [pkg.clubs, text, leagueId])

  const patch = (change: Partial<PackageClub>, key: string) => {
    if (index === null) return
    edit((p) => ({ ...p, clubs: replaceAt(p.clubs, index, { ...(p.clubs[index] as PackageClub), ...change }) }), `club-${index}-${key}`)
  }
  const leagueOptions = pkg.leagues.map((l) => ({ id: l.id, label: l.name }))
  const targetLeague = leagueId || pkg.leagues[0]?.id

  const list = (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input className={inputClass} placeholder="Buscar clube, sigla ou cidade" value={text} onChange={(e) => setText(e.target.value)} />
      </div>
      <SelectField<string> label="Liga" value={leagueId} empty="Todas as ligas" options={leagueOptions} onChange={(v) => setLeagueId(v ?? '')} />
      <SmallButton
        disabled={!targetLeague}
        onClick={() => {
          if (!targetLeague) return
          edit((p) => addClub(p, targetLeague))
          select('clubs', pkg.clubs.length)
        }}
      >
        + Novo clube{leagueId ? ' nesta liga' : ''}
      </SmallButton>
      <div className="rounded-2xl border border-line bg-surface p-1">
        {rows.length === 0 && <p className="p-4 text-sm text-muted">Nenhum clube.</p>}
        {rows.map(({ c, i }) => (
          <ListRow key={c.id} active={i === index} onClick={() => select('clubs', i)}>
            <Crest team={c} size="sm" />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-bold">{c.name}</span>
              <span className="text-xs text-muted">
                {pkg.leagues.find((l) => l.id === c.league)?.name ?? '—'} · rep. {c.reputation} · {counts.get(c.id) ?? 0} jog.
              </span>
            </span>
            <IssueDot validation={validation} kind="clubs" index={i} />
          </ListRow>
        ))}
      </div>
      <p className="text-xs text-muted">{rows.length} de {pkg.clubs.length} clubes.</p>
    </div>
  )

  let detail = null
  if (club && index !== null) {
    const squad = counts.get(club.id) ?? 0
    detail = (
      <>
        <EntityIssues validation={validation} kind="clubs" index={index} />
        <Section title="Clube" right={<span className="text-xs text-muted">{club.id}</span>}>
          <div className="flex items-center gap-4">
            <Crest team={club} size="xl" />
            <div className="min-w-0 flex-1 space-y-1 text-sm text-muted">
              <p>O escudo é gerado das duas cores e da sigla, e atualiza na hora.</p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField label="Nome" value={club.name} onChange={(name) => patch({ name }, 'name')} />
            <TextField label="Sigla (3 letras)" value={club.abbreviation} hint="Única no pacote." onChange={(v) => patch({ abbreviation: v.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3) }, 'abbr')} />
            <ColorField label="Cor principal" value={club.colors[0]} onChange={(c) => patch({ colors: [c, club.colors[1]] }, 'color1')} />
            <ColorField label="Cor secundária" value={club.colors[1]} onChange={(c) => patch({ colors: [club.colors[0], c] }, 'color2')} />
            <TextField label="Cidade" value={club.city} onChange={(city) => patch({ city }, 'city')} />
            <TextField label="Estado ou sigla do país" value={club.state} onChange={(state) => patch({ state }, 'state')} />
            <TextField label="Estádio" value={club.stadium.name} onChange={(name) => patch({ stadium: { ...club.stadium, name } }, 'stadium')} />
            <NumberField label="Capacidade" value={club.stadium.capacity} min={500} max={300000} step={500} onChange={(v) => v !== undefined && patch({ stadium: { ...club.stadium, capacity: v } }, 'capacity')} />
            <NumberField label="Reputação (1 a 20)" value={club.reputation} min={1} max={20} hint="Define o nível do elenco gerado, a receita, a atração de jogadores e a meta da diretoria." onChange={(v) => v !== undefined && patch({ reputation: v }, 'reputation')} />
            <SelectField<string> label="Liga" value={club.league} options={leagueOptions} onChange={(l) => l && edit((p) => moveClubToLeague(p, club.id, l))} hint="Mudar de liga atualiza o número de times das duas." />
          </div>
        </Section>

        <Section title="Elenco">
          <p className={`text-sm ${squad < SQUAD_MIN || squad > SQUAD_MAX ? 'text-loss' : 'text-muted'}`}>
            {squad} jogadores (o elenco precisa ter de {SQUAD_MIN} a {SQUAD_MAX}, com pelo menos um goleiro).
          </p>
          <div className="flex flex-wrap gap-2">
            <SmallButton
              onClick={() => {
                setClubFilter(club.id)
                setPlayerList('players')
                goTo('players', -1, { clubFilter: club.id })
              }}
            >
              Ver jogadores
            </SmallButton>
            <SmallButton disabled={squad >= SQUAD_MAX} onClick={() => edit((p) => addPlayer(p, 'players', club.id))}>
              + Jogador
            </SmallButton>
          </div>
        </Section>

        <SmallButton
          danger
          onClick={() => {
            if (!window.confirm(`Apagar "${club.name}"? Os ${squad} jogadores viram jogadores livres e a base do clube sai do pacote.`)) return
            edit((p) => removeClub(p, club.id))
            select('clubs', null)
          }}
        >
          Apagar o clube
        </SmallButton>
      </>
    )
  }

  return <MasterDetail list={list} detail={detail} hasSelection={club !== undefined} onBack={() => select('clubs', null)} empty="Escolha um clube à esquerda para editar." />
}
