/** Medição local (B1): roda o motor dentro do workerd, sem conta. Endpoints: /load, /advance?n=, /info. */
import pkg from '../../../data/pacote-real.json'
import { loadWorld } from '../../../src/data/package/defaultPackage'
import { advanceGame, createGame, finishPendingMatch } from '../../../src/store/game'
import { userMatchInput } from '../../../src/engine/season/advance'
import { simulateMatch } from '../../../src/engine/match'
import type { Game } from '../../../src/store/game'
import type { DataPackage } from '../../../src/data/package/types'

let game: Game | undefined

const info = (g: Game) => ({
  date: g.season.season.currentDate,
  year: g.season.season.year,
  matches: g.season.matches.length,
  finished: g.season.matches.filter((m) => m.status === 'finished').length,
  players: g.season.players.length,
  teams: g.season.teams.length,
  dismissed: !!g.dismissal,
})

export default {
  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url)
    try {
      if (url.pathname === '/load') {
        const world = loadWorld(5, pkg as unknown as DataPackage)
        game = createGame(5, [...world.teams].sort((a, b) => b.reputation - a.reputation)[0]!.id, { world, dataPackage: pkg as unknown as DataPackage, dataPackageId: 'mundo-real' })
        return Response.json(info(game))
      }
      if (url.pathname === '/advance') {
        if (!game) return new Response('carregue primeiro (/load)', { status: 409 })
        const n = Number(url.searchParams.get('n') ?? 1)
        for (let i = 0; i < n; i++) {
          game = advanceGame(game)
          if (game.pendingUserMatch) game = finishPendingMatch(game, simulateMatch(userMatchInput(game.season, game.pendingUserMatch, game.userTeamId)))
        }
        return Response.json(info(game))
      }
      if (url.pathname === '/info') return Response.json(game ? info(game) : { loaded: false })
      return new Response('rotas: /load /advance?n= /info', { status: 404 })
    } catch (e) {
      return new Response(String((e as Error)?.stack ?? e), { status: 500 })
    }
  },
}
