/** Depuração do freio contra dinastias no mundo real: por que um rival pode (ou não) pagar a estrela do campeão. Uso: PACOTE_REAL=1 node --expose-gc tools/run.mjs dynastyProbe [--club Barcelona] */
import { loadWorld } from '../src/data/package/defaultPackage'
import { validatePackage } from '../src/data/package/validate'
import { DYNASTY } from '../src/engine/config'
import { monthlyPayroll } from '../src/engine/finance'
import { needsOf } from '../src/engine/market/ai'
import { askingPrice, expectedSalary } from '../src/engine/market/value'
import { playerOverall } from '../src/engine/overall'
import { createSeason } from '../src/engine/season'
import { measurementPackage } from './worldPackage'

const args = process.argv.slice(2)
const clubName = args.includes('--club') ? (args[args.indexOf('--club') + 1] as string) : 'Barcelona'
const { pkg } = validatePackage(measurementPackage(7))
const world = loadWorld(7, pkg!)
const s = createSeason({ year: 2026, seed: 7, teams: world.teams, players: world.players, academy: world.academy, competitions: world.competitions!, focus: 'Brazil', cupSpecs: world.cups ?? [] })
const leagueArg = args.includes('--league') ? (args[args.indexOf('--league') + 1] as string) : 'es-1'
const seller = s.teams.find((t) => t.name === clubName && s.season.competitions.find((c) => c.id === leagueArg)!.teamIds.includes(t.id))!
const comp = s.season.competitions.find((c) => c.teamIds.includes(seller.id))!
const squad = s.players.filter((p) => p.teamId === seller.id).sort((a, b) => playerOverall(b) - playerOverall(a))
const date = s.season.currentDate
console.log(`${seller.name}: caixa ${(seller.finances.balance / 1e6).toFixed(0)}M, folha ${(monthlyPayroll(squad) / 1e6).toFixed(1)}M/mês, orçamento de salários ${(seller.finances.salaryBudget / 1e6).toFixed(1)}M/mês`)
for (const star of squad.slice(0, 3)) {
  const fee = askingPrice(star, squad, date, seller) * DYNASTY.feeShare
  console.log(`\n${star.name} (${playerOverall(star).toFixed(0)}, ${star.position}, ${star.age} anos): preço ${(fee / 1e6).toFixed(0)}M, salário esperado no rival varia`)
  for (const id of comp.teamIds.filter((i) => i !== seller.id).slice(0, 8)) {
    const rival = s.teams.find((t) => t.id === id)!
    const rs = s.players.filter((p) => p.teamId === id)
    const need = needsOf(rival, rs).find((n) => n.position === star.position)
    const salary = expectedSalary(star, rival)
    const room = rival.finances.salaryBudget - monthlyPayroll(rs)
    console.log(`  ${rival.name.padEnd(22)} ganho ${need ? (playerOverall(star) - need.weakest).toFixed(1) : '-'} | salário ${(salary / 1e6).toFixed(2)}M vs folga ${(room / 1e6).toFixed(2)}M | caixa ${(rival.finances.balance / 1e6).toFixed(0)}M (50% = ${(rival.finances.balance * DYNASTY.maxBalanceShare / 1e6).toFixed(0)}M)`)
  }
}
