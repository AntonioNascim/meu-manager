import { useRef, useState } from 'react'
import { CLUB_COLUMNS, PLAYER_COLUMNS, applyClubsImport, applyPlayersImport, clubsToCsv, parseClubsCsv, parsePlayersCsv, playersToCsv, toCsv } from '../../../data/package/edit/csv'
import type { CsvParsed, ImportSummary } from '../../../data/package/edit/csv'
import { ensurePlayerIds } from '../../../data/package/edit/ops'
import type { PlayerList } from '../../../data/package/edit/ops'
import type { DataPackage, PackageClub, PackagePlayer } from '../../../data/package/types'
import { downloadText } from '../../download'
import { csvIssueText } from '../../labels'
import { Button } from '../../components/ui'
import { CheckField, Section, SelectField, SmallButton } from './fields'
import type { TabProps } from './parts'

const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'pacote'
const SHOWN = 30

type Pending =
  | { kind: 'players'; list: PlayerList; fileName: string; parsed: CsvParsed<PackagePlayer> }
  | { kind: 'clubs'; fileName: string; parsed: CsvParsed<PackageClub> }

/** Planilhas (CSV): exportar e importar jogadores e clubes, uma linha por jogador ou clube, para editar em massa no Excel ou no Google Planilhas. */
export function SheetsTab({ editor }: TabProps) {
  const { pkg, edit } = editor
  const [scope, setScope] = useState('')
  const [list, setList] = useState<PlayerList>('players')
  const [fill, setFill] = useState(false)
  const [removeMissing, setRemoveMissing] = useState(false)
  const [pending, setPending] = useState<Pending | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const playersInput = useRef<HTMLInputElement>(null)
  const clubsInput = useRef<HTMLInputElement>(null)
  const scopeName = scope ? (pkg.leagues.find((l) => l.id === scope)?.name ?? scope) : ''
  const leagueOptions = pkg.leagues.map((l) => ({ id: l.id, label: `${l.name} (${pkg.clubs.filter((c) => c.league === l.id).length} clubes)` }))
  const download = (name: string, csv: string) => downloadText(`${slug(pkg.name)}-${name}.csv`, csv, 'text/csv;charset=utf-8')

  const exportPlayers = () => {
    // A planilha liga a linha ao jogador pelo id: quem não tem recebe um antes.
    const withIds = ensurePlayerIds(pkg)
    if (withIds !== pkg) edit(() => withIds)
    const clubIds = scope ? new Set(withIds.clubs.filter((c) => c.league === scope).map((c) => c.id)) : undefined
    download(`${list === 'players' ? 'jogadores' : 'base'}${scope ? `-${slug(scopeName)}` : ''}`, playersToCsv(withIds, list, { ...(clubIds ? { clubIds } : {}), fillGenerated: fill }))
  }
  const exportClubs = () => download(`clubes${scope ? `-${slug(scopeName)}` : ''}`, clubsToCsv(pkg, scope ? { leagueIds: new Set([scope]) } : {}))

  const read = async (file: File | undefined, kind: 'players' | 'clubs') => {
    if (!file) return
    setMessage(null)
    const text = await file.text()
    setPending(kind === 'players' ? { kind, list, fileName: file.name, parsed: parsePlayersCsv(text, pkg) } : { kind, fileName: file.name, parsed: parseClubsCsv(text, pkg) })
    for (const ref of [playersInput, clubsInput]) if (ref.current) ref.current.value = ''
  }

  const apply = (validOnly: boolean) => {
    if (!pending) return
    let summary: ImportSummary
    if (pending.kind === 'players') summary = applyPlayersImport(pkg, pending.list, pending.parsed, { validOnly, removeMissing })
    else summary = applyClubsImport(pkg, pending.parsed, { validOnly, removeMissing })
    edit(() => summary.pkg)
    setMessage(`Importado: ${summary.added} novos, ${summary.updated} atualizados${summary.removed ? `, ${summary.removed} removidos` : ''}.`)
    setPending(null)
  }

  const issues = pending?.parsed.issues ?? []
  const good = pending?.parsed.rows.length ?? 0

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Section title="Como funciona">
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
          <li>Uma linha por jogador (ou clube), com as mesmas colunas e valores do pacote. A coluna <b>id</b> liga a linha ao registro: id que existe atualiza, id novo ou vazio cria.</li>
          <li>Para dividir o trabalho por liga, exporte uma liga por vez, edite no Excel ou no Google Planilhas e importe de volta. Importe os <b>clubes antes</b> dos jogadores.</li>
          <li>Célula vazia em campo opcional = o jogo gera o valor. Atributos: ou os 16 preenchidos, ou todos vazios.</li>
          <li>Arquivo com <code>;</code>, <code>,</code> ou tab, em UTF-8. Datas AAAA-MM-DD ou DD/MM/AAAA. Posições secundárias separadas por <code>|</code> (<code>-</code> = nenhuma de propósito).</li>
        </ul>
      </Section>

      <Section title="Exportar">
        <div className="grid gap-3 sm:grid-cols-2">
          <SelectField<string> label="Escopo" value={scope} empty="Pacote inteiro" options={leagueOptions} onChange={(v) => setScope(v ?? '')} hint="Uma liga: só os clubes dela e os jogadores desses clubes." />
          <SelectField<PlayerList> label="Jogadores" value={list} options={[{ id: 'players', label: 'Elenco' }, { id: 'academy', label: 'Base' }]} onChange={(v) => setList(v ?? 'players')} />
        </div>
        <CheckField label="Preencher com os valores que o jogo geraria" checked={fill} onChange={setFill} hint="Jogadores sem atributos saem com atributos, potencial, ocultos e contrato gerados, prontos para ajustar." />
        <div className="flex flex-wrap gap-2">
          <Button onClick={exportPlayers}>Baixar jogadores (CSV)</Button>
          <Button variant="secondary" onClick={exportClubs}>
            Baixar clubes (CSV)
          </Button>
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          <SmallButton onClick={() => download('jogadores-modelo', toCsv(PLAYER_COLUMNS, []))}>Planilha de jogadores em branco</SmallButton>
          <SmallButton onClick={() => download('clubes-modelo', toCsv(CLUB_COLUMNS, []))}>Planilha de clubes em branco</SmallButton>
        </div>
      </Section>

      <Section title="Importar">
        <CheckField label="Remover o que não está na planilha" checked={removeMissing} onChange={setRemoveMissing} hint="Jogadores: quem é dos clubes que aparecem na planilha e não tem linha nela. Clubes: os das ligas que aparecem e não têm linha (os jogadores deles ficam livres)." />
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => playersInput.current?.click()}>Importar jogadores ({list === 'players' ? 'elenco' : 'base'})</Button>
          <Button variant="secondary" onClick={() => clubsInput.current?.click()}>
            Importar clubes
          </Button>
        </div>
        <input ref={playersInput} type="file" accept=".csv,text/csv,text/plain" className="hidden" data-testid="csv-players" onChange={(e) => void read(e.target.files?.[0], 'players')} />
        <input ref={clubsInput} type="file" accept=".csv,text/csv,text/plain" className="hidden" data-testid="csv-clubs" onChange={(e) => void read(e.target.files?.[0], 'clubs')} />
        {message && <p className="text-sm text-win">{message}</p>}

        {pending && (
          <div className="space-y-3 rounded-xl border border-line p-3" data-testid="csv-preview">
            <div className="text-sm">
              <b>{pending.fileName}</b>: {pending.parsed.total} linhas, {good} sem problema, {new Set(issues.filter((i) => i.line > 0).map((i) => i.line)).size} com problema.
            </div>
            {pending.parsed.ignoredColumns.length > 0 && <p className="text-xs text-amber-300">Colunas ignoradas (o jogo não as conhece): {pending.parsed.ignoredColumns.join(', ')}.</p>}
            {issues.length > 0 && (
              <ul className="max-h-72 space-y-1 overflow-y-auto rounded-lg border border-loss/40 bg-loss/10 p-3 text-sm text-loss">
                {issues.slice(0, SHOWN).map((issue, i) => (
                  <li key={i}>{csvIssueText(issue)}</li>
                ))}
                {issues.length > SHOWN && <li className="font-bold">… e mais {issues.length - SHOWN} problema(s).</li>}
              </ul>
            )}
            <div className="flex flex-wrap gap-2">
              <Button disabled={issues.length > 0 || pending.parsed.total === 0} onClick={() => apply(false)}>
                Importar tudo
              </Button>
              <Button variant="secondary" disabled={good === 0 || issues.length === 0} onClick={() => apply(true)}>
                Importar só as {good} linhas corretas
              </Button>
              <Button variant="secondary" onClick={() => setPending(null)}>
                Cancelar
              </Button>
            </div>
          </div>
        )}
      </Section>
    </div>
  )
}

export type { DataPackage }
