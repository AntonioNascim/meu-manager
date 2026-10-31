/**
 * Reputação dos clubes do pacote real (Fase 5D). A reputação que vem das planilhas é provisória (fama no Wikidata sobre a escada da liga) e erra
 * onde a fama do Wikidata não acompanha o tamanho do clube (o Coritiba saía com 19, maior que o Flamengo; o Eintracht Frankfurt, o 2º maior da
 * Alemanha). Aqui ficam os ajustes curados pelos clubes de que a calibragem depende: os gigantes e os clubes de tradição de cada liga, pelo tamanho
 * real (torcida, história e receita), numa escala em que o maior clube da liga mais rica tem 20 e o da liga de nível médio entre 12 e 17.
 *
 * Os ajustes entram como correções do campo "reputação" em `correcoes.json` (`tools/realdata/corrections.ts`), que toda rodada do pipeline reaplica: a
 * reputação vai para a planilha de clubes e dali para os atributos dos jogadores (o nível do clube vem dela). Depois de rodar:
 *   node tools/run.mjs realReputation [--simular]     (lê data/pacote-real.json só para achar o id de cada clube; grava em dados-reais/planilhas/correcoes.json)
 *   npm run dados:finalizar                           (refaz atributos e dados-reais/planilhas/pacote-real.json)
 *   node tools/run.mjs realReputation --copiar        (copia o pacote final para data/pacote-real.json, com o nome "Mundo real 2026")
 */
import { readFileSync, writeFileSync } from 'node:fs'
import type { DataPackage } from '../src/data/package/types'
import { loadCorrections, mergeCorrection, saveCorrections } from './realdata/corrections'
import type { Correction } from './realdata/corrections'

/** Liga → nome do clube no pacote → reputação (1 a 20). */
export const REPUTATION_FIXES: Record<string, Record<string, number>> = {
  'br-1': { Flamengo: 19, Palmeiras: 19, Corinthians: 18, 'São Paulo': 17, Santos: 16, Internacional: 16, 'Grêmio': 16, 'Atlético Mineiro': 16, Fluminense: 15, Botafogo: 15, Cruzeiro: 15, 'Vasco da Gama': 14, 'Athletico Paranaense': 12, Bahia: 11, Coritiba: 11, 'Vitória': 10, 'Red Bull Bragantino': 9, Chapecoense: 8 },
  'ar-1': { 'Boca Juniors': 17, 'River Plate': 17, Independiente: 15, Racing: 15, 'San Lorenzo': 15, 'Estudiantes (LP)': 14, 'Vélez Sarsfield': 14, "Newell's Old Boys": 13, 'Rosario Central': 13, 'Gimnasia y Esgrima (LP)': 11, 'Argentinos Juniors': 11, 'Lanús': 12, 'Talleres (C)': 11, Tigre: 9 },
  'en-1': { Liverpool: 20, 'Manchester United F.C.': 19, 'Manchester City F.C.': 19, Arsenal: 18, Chelsea: 18, 'Tottenham Hotspur': 15, 'Newcastle United F.C.': 14, 'Aston Villa': 14, Everton: 13 },
  'es-1': { 'Real Madrid': 20, Barcelona: 20, 'Atlético Madrid': 18, Sevilla: 16, Valencia: 16, 'Athletic Bilbao': 15, Villarreal: 14, 'Real Betis': 13, 'Real Sociedad': 13, Espanyol: 11 },
  'it-1': { Juventus: 19, Inter: 19, Milan: 19, Napoli: 17, Roma: 16, Lazio: 15, Atalanta: 14, Fiorentina: 14, Bologna: 11 },
  'de-1': { 'Bayern Munich': 20, 'Borussia Dortmund': 18, 'Bayer Leverkusen': 17, 'RB Leipzig': 15, 'Eintracht Frankfurt': 13, 'Schalke 04': 13, 'VfB Stuttgart': 13, 'Borussia Mönchengladbach': 13, 'Werder Bremen': 12, 'Union Berlin': 10, 'SC Freiburg': 10, 'TSG Hoffenheim': 10, 'Mainz 05': 9 },
  'fr-1': { 'Paris Saint-Germain': 18, Marseille: 16, Lyon: 16, Monaco: 15, Lille: 14, Nice: 12, Rennes: 12, Lens: 11 },
  'pt-1': { Benfica: 16, Porto: 16, 'Sporting CP': 16, Braga: 13 },
  'nl-1': { Ajax: 15, PSV: 15, Feyenoord: 15, AZ: 12, Twente: 11 },
  'mx-1': { 'América': 14, Guadalajara: 13, Monterrey: 13, 'Tigres UANL': 13, 'Cruz Azul': 12, 'Pumas UNAM': 11, Pachuca: 11, Toluca: 11, 'León': 10, 'Santos Laguna': 9, Puebla: 8 },
  'co-1': { 'Atlético Nacional': 12, Millonarios: 11, Junior: 11, 'Deportivo Cali': 10, 'Santa Fe': 10, 'América de Cali': 10, 'Once Caldas': 9 },
}

export interface ReputationChange {
  id: string
  league: string
  club: string
  from: number
  to: number
}

/** Os clubes do pacote que a tabela cita, com o que muda; `missing` = cita um clube que não está na liga. */
export function planReputationFixes(pkg: DataPackage): { changes: ReputationChange[]; missing: string[] } {
  const changes: ReputationChange[] = []
  const missing: string[] = []
  for (const [league, fixes] of Object.entries(REPUTATION_FIXES)) {
    for (const [name, reputation] of Object.entries(fixes)) {
      const club = pkg.clubs.find((c) => c.league === league && c.name === name)
      if (!club) missing.push(`${league} ${name}`)
      else changes.push({ id: club.id, league, club: name, from: club.reputation, to: reputation })
    }
  }
  return { changes, missing }
}

if (process.argv[1]?.includes('realReputation')) {
  const dir = 'dados-reais/planilhas'
  const pkg = JSON.parse(readFileSync('data/pacote-real.json', 'utf8')) as DataPackage
  if (process.argv.includes('--copiar')) {
    const final = JSON.parse(readFileSync(`${dir}/pacote-real.json`, 'utf8')) as DataPackage
    final.name = 'Mundo real 2026'
    writeFileSync('data/pacote-real.json', JSON.stringify(final))
    console.log(`Copiado: ${final.clubs.length} clubes, ${final.players.length} jogadores`)
  } else {
    const { changes, missing } = planReputationFixes(pkg)
    if (missing.length > 0) {
      console.error(`Clubes não encontrados: ${missing.join('; ')}`)
      process.exit(1)
    }
    const items = loadCorrections(dir)
    const today = new Date().toISOString().slice(0, 10)
    let news = 0
    for (const c of changes) {
      const correction: Correction = { id: c.id, field: 'reputation', value: String(c.to), club: c.club, at: today }
      if (mergeCorrection(items, correction) !== 'same') news++
      if (c.from !== c.to) console.log(`${c.league} ${c.club}: ${c.from} -> ${c.to}`)
    }
    console.log(`${changes.filter((c) => c.from !== c.to).length} reputações diferentes do pacote atual; ${news} correções novas`)
    if (!process.argv.includes('--simular')) {
      saveCorrections(dir, items)
      console.log('Gravado em correcoes.json. Agora rode: npm run dados:finalizar')
    }
  }
}
