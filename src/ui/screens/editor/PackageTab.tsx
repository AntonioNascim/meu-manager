import { useState } from 'react'
import { addCountry, removeCountry } from '../../../data/package/edit/ops'
import { NATIONALITIES } from '../../../engine/types'
import { NATIONALITY_LABELS } from '../../labels'
import { Flag } from '../../theme/PlayerBits'
import { Field, NumberField, SelectField, Section, SmallButton, TextField, inputClass } from './fields'
import type { TabProps } from './parts'

/** Dados gerais do pacote e a lista de países. */
export function PackageTab({ editor }: TabProps) {
  const { pkg, edit } = editor
  const [newCountry, setNewCountry] = useState<string | undefined>(undefined)
  const free = NATIONALITIES.filter((n) => !pkg.countries.some((c) => c.id === n))
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Section title="Pacote">
        <TextField label="Nome" value={pkg.name} onChange={(name) => edit((p) => ({ ...p, name }), 'pkg-name')} />
        <NumberField label="Ano da temporada inicial" value={pkg.startYear ?? 2026} min={1900} max={2200} hint="Idades e contratos são contados a partir de 1º de janeiro dele." onChange={(v) => edit((p) => ({ ...p, startYear: v ?? 2026 }), 'pkg-year')} />
        <Field label="Créditos" hint="Fontes e licenças dos dados (aparecem ao importar). Obrigatório na prática para dados reais.">
          <textarea className={`${inputClass} min-h-24 py-2`} value={pkg.credits ?? ''} onChange={(e) => edit((p) => ({ ...p, credits: e.target.value }), 'pkg-credits')} />
        </Field>
      </Section>

      <Section title={`Países (${pkg.countries.length})`}>
        <ul className="divide-y divide-line">
          {pkg.countries.map((country) => {
            const used = pkg.leagues.filter((l) => l.country === country.id).length
            return (
              <li key={country.id} className="flex items-center gap-3 py-2">
                <Flag nationality={country.id as never} />
                <div className="min-w-0 flex-1">
                  <input className={inputClass} value={country.name} aria-label={`Nome de ${country.id}`} onChange={(e) => edit((p) => ({ ...p, countries: p.countries.map((c) => (c.id === country.id ? { ...c, name: e.target.value } : c)) }), `country-${country.id}`)} />
                  <div className="mt-0.5 text-xs text-muted">
                    {country.id} · {used} {used === 1 ? 'divisão' : 'divisões'}
                  </div>
                </div>
                <SmallButton danger disabled={used > 0} title={used > 0 ? 'Apague as ligas do país antes' : undefined} onClick={() => edit((p) => removeCountry(p, country.id))}>
                  Remover
                </SmallButton>
              </li>
            )
          })}
        </ul>
        <div className="flex flex-wrap items-end gap-2">
          <SelectField<string> className="min-w-48 flex-1" label="Adicionar país" value={newCountry} empty="Escolha…" options={free.map((n) => ({ id: n, label: NATIONALITY_LABELS[n] }))} onChange={setNewCountry} />
          <SmallButton
            disabled={!newCountry}
            onClick={() => {
              if (!newCountry) return
              edit((p) => addCountry(p, { id: newCountry, name: NATIONALITY_LABELS[newCountry as keyof typeof NATIONALITY_LABELS] }))
              setNewCountry(undefined)
            }}
          >
            Adicionar
          </SmallButton>
        </div>
        <p className="text-xs text-muted">Só os países que têm liga precisam estar aqui. A nacionalidade de um jogador pode ser qualquer país.</p>
      </Section>

      <Section title="Base dos clubes">
        <p className="text-sm text-muted">
          {pkg.academy ? `${pkg.academy.length} jovens de 15 a 19 anos no pacote. Edite-os na aba Jogadores › Base.` : 'O pacote não traz a base: o jogo gera uma para cada clube, no nível da liga.'}
        </p>
        {pkg.academy && (
          <SmallButton
            danger
            onClick={() => {
              if (window.confirm('Remover a base do pacote? O jogo vai gerar uma nova para cada clube.')) edit((p) => ({ ...p, academy: undefined }) as typeof p)
            }}
          >
            Remover a base (o jogo gera)
          </SmallButton>
        )}
      </Section>
    </div>
  )
}
