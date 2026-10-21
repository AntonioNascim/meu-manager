/**
 * Aplica as planilhas de tarefas preenchidas (`valor_correto` e `feito`), baixadas do Google Planilhas como CSV e colocadas em
 * `dados-reais/planilhas/tarefas-feitas/`. Só as linhas marcadas como feitas entram. Cada linha é conferida (campo, valor, registro) e o
 * resultado sai linha por linha: o que foi aplicado e o que deu erro. As correções boas ficam em `correcoes.json`, que o
 * `dados:planilhas` reaplica depois de toda rodada nova (janela de transferências): nada do que foi corrigido se perde.
 *
 * Uso: node tools/run.mjs applyRealTasks [--saida dados-reais/planilhas] [--pasta tarefas-feitas] [--simular] [--resumo]
 *   --simular   só confere e mostra o resultado; não grava nada.
 *   --resumo    mostra também a distribuição de força, o top 20 de jogadores e o top 10 de clubes depois das correções.
 *
 * Também aceita as planilhas de `conferencia/` (campo `força`): a correção vira a força-alvo na geração dos atributos.
 * Código de saída 1 se alguma linha marcada como feita deu erro.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { CHECK_DIR, distributionMarkdown, finalizeOutput, summaryText } from './realdata/finalize'
import { DONE_DIR, interpretTask, loadCorrections, mergeCorrection, readSheet, readTaskSheet, saveCorrections } from './realdata/corrections'
import type { Correction } from './realdata/corrections'
import { REAL_LEAGUES } from './realdata/leagues'

const args = process.argv.slice(2)
const has = (name: string): boolean => args.includes(`--${name}`)
const opt = (name: string, fallback: string): string => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? (args[i + 1] ?? fallback) : fallback
}
const out = opt('saida', 'dados-reais/planilhas')
const folder = join(out, opt('pasta', DONE_DIR))
const dryRun = has('simular')

if (!existsSync(folder)) {
  mkdirSync(folder, { recursive: true })
  console.log(`Criei a pasta ${folder}. Coloque nela os CSV das tarefas preenchidas (colunas valor_correto e feito) e rode de novo.`)
  process.exit(0)
}
const files = readdirSync(folder).filter((f) => f.toLowerCase().endsWith('.csv')).sort()
if (files.length === 0) {
  console.log(`Nenhum CSV em ${folder}. Baixe do Google Planilhas (Arquivo › Fazer download › Valores separados por vírgula) e coloque a planilha preenchida nessa pasta.`)
  process.exit(0)
}

// Todos os ids que existem nas planilhas (clubes, jogadores e base) e o nome de cada um, para conferir as linhas.
const known = new Map<string, { kind: 'club' | 'player'; name: string; club: string }>()
for (const league of REAL_LEAGUES) {
  const clubs = join(out, `${league.id}-clubes.csv`)
  if (!existsSync(clubs)) continue
  for (const r of readSheet(readFileSync(clubs, 'utf8')).rows) known.set(r.id as string, { kind: 'club', name: r.name as string, club: r.name as string })
  for (const suffix of ['jogadores', 'base']) {
    const file = join(out, `${league.id}-${suffix}.csv`)
    if (existsSync(file)) for (const r of readSheet(readFileSync(file, 'utf8')).rows) known.set(r.id as string, { kind: 'player', name: r.name as string, club: (r.clubName as string) ?? '' })
  }
}
if (known.size === 0) {
  console.error(`Nenhuma planilha de clubes e jogadores em ${out}. Rode antes: npm run dados:planilhas -- --contato "seu@email.com"`)
  process.exit(1)
}

const corrections = loadCorrections(out)
const today = new Date().toISOString().slice(0, 10)
const log: string[] = []
const say = (line = ''): void => {
  console.log(line)
  log.push(line)
}
const total = { applied: 0, same: 0, replaced: 0, errors: 0, notDone: 0, manual: 0 }

say(`Aplicando as tarefas de ${folder}${dryRun ? ' (simulação: nada será gravado)' : ''}`)
for (const file of files) {
  const { rows, problem } = readTaskSheet(readFileSync(join(folder, file), 'utf8'))
  say('')
  if (problem) {
    say(`${file}: ERRO no arquivo: ${problem}`)
    total.errors++
    continue
  }
  say(`${file}: ${rows.length} linhas, ${rows.filter((r) => r.feito).length} marcadas como feitas`)
  for (const row of rows) {
    const who = [row.clube, row.jogador].filter(Boolean).join(' · ')
    const label = `linha ${String(row.line).padStart(3)}  ${who || row.id} · ${row.campo}`
    if (!row.feito) {
      total.notDone++
      if (row.correto !== '') say(`  ${label}: AVISO "${row.correto}" preenchido, mas a coluna feito não está marcada; ignorada`)
      continue
    }
    const fail = (reason: string): void => {
      say(`  ${label}: ERRO ${reason}`)
      total.errors++
    }
    if (row.id === '') fail('sem id (a coluna id não pode ficar vazia)')
    else if (!known.has(row.id)) fail(`o id ${row.id} não existe nas planilhas (o jogador ou clube saiu na última atualização?)`)
    else if (row.campo.trim().toLowerCase() === 'elenco') {
      // Elenco se resolve no editor ou nas planilhas de jogadores: aqui só se registra que a equipe deu a tarefa por feita.
      total.manual++
      say(`  ${label}: OK  tarefa de elenco feita à mão (nada a aplicar por aqui)`)
    } else if (row.correto === '') fail('marcada como feita, mas sem valor_correto')
    else {
      const target = known.get(row.id) as { kind: 'club' | 'player'; name: string; club: string }
      const result = interpretTask(row.campo, row.correto)
      if (!result.ok) {
        fail(result.reason)
        continue
      }
      const playerOnly = result.entries.some((e) => ['position', 'secondaryPositions', 'overall', 'potential'].includes(e.field))
      const clubOnly = result.entries.some((e) => ['color1', 'color2', 'city', 'stadiumName', 'capacity'].includes(e.field))
      if ((playerOnly && target.kind !== 'player') || (clubOnly && target.kind !== 'club')) {
        fail(`o campo "${row.campo}" não existe em ${target.kind === 'club' ? 'clube' : 'jogador'} (${target.name})`)
        continue
      }
      const states = result.entries.map((e) => {
        const item: Correction = { id: row.id, field: e.field, value: e.value, ...(target.kind === 'club' ? { club: target.name } : { player: target.name, ...(target.club ? { club: target.club } : {}) }), at: today }
        return mergeCorrection(corrections, item)
      })
      const shown = result.entries.map((e) => e.value).join(' ')
      const was = row.provisorio !== '' ? ` (era ${row.provisorio})` : ''
      if (states.every((s) => s === 'same')) {
        total.same++
        say(`  ${label}: OK  ${shown}${was} (já estava aplicada)`)
      } else if (states.includes('replaced')) {
        total.replaced++
        say(`  ${label}: OK  ${shown}${was} (substitui uma correção anterior)`)
      } else {
        total.applied++
        say(`  ${label}: OK  ${shown}${was}`)
      }
    }
  }
}

say('')
say(`Resumo: ${total.applied} novas, ${total.replaced} substituindo correção anterior, ${total.same} já aplicadas, ${total.manual} de elenco feitas à mão, ${total.errors} com erro, ${total.notDone} linhas sem "feito" ignoradas.`)
if (dryRun) say('Simulação: nenhuma correção foi gravada.')
else {
  saveCorrections(out, corrections)
  say(`${corrections.length} correções guardadas em ${join(out, 'correcoes.json')} (reaplicadas a cada rodada do dados:planilhas).`)
  // Refaz os CSV, os atributos, o rascunho do pacote e as planilhas de conferência com as correções.
  const result = finalizeOutput(out)
  writeFileSync(join(out, CHECK_DIR, 'distribuicao.md'), distributionMarkdown(result))
  say(`Validação do pacote-real.json depois das correções: ${result.validation.errors} erros, ${result.validation.warnings} avisos.`)
  if (result.orphans.length > 0) say(`Atenção: ${result.orphans.length} correções guardadas não acharam o registro (o jogador saiu do elenco?).`)
  if (has('resumo')) console.log(summaryText(result))
  writeFileSync(join(out, 'ultima-aplicacao.txt'), `${log.join('\n')}\n`)
}
process.exitCode = total.errors > 0 ? 1 : 0
