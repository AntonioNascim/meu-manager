import type { LeagueEconomy, Nationality, Region } from '../../engine/types'

/**
 * Padrões de cada país quando o pacote não diz: janelas de transferência e economia da liga (índice de receita e nível dos
 * jogadores em relação ao Brasil). Os valores são os calibrados na B5/B6 (`docs/fase2-proposta.md`, seções 13 e 14). O
 * Brasil não tem economia: é a referência (receita 1, nível 0).
 */
export const COUNTRY_DEFAULTS: Partial<Record<Nationality, { region: Region; economy?: LeagueEconomy }>> = {
  Brazil: { region: 'BR' },
  Argentina: { region: 'SA', economy: { revenue: 0.6, level: -1 } },
  Uruguay: { region: 'SA', economy: { revenue: 0.3, level: -4 } },
  Paraguay: { region: 'SA', economy: { revenue: 0.25, level: -5 } },
  Chile: { region: 'SA', economy: { revenue: 0.4, level: -3 } },
  Colombia: { region: 'SA', economy: { revenue: 0.45, level: -2 } },
  Peru: { region: 'SA', economy: { revenue: 0.3, level: -4 } },
  Ecuador: { region: 'SA', economy: { revenue: 0.3, level: -4 } },
  England: { region: 'EU', economy: { revenue: 5, level: 8 } },
  Spain: { region: 'EU', economy: { revenue: 3, level: 7 } },
  Italy: { region: 'EU', economy: { revenue: 2.5, level: 6 } },
  Germany: { region: 'EU', economy: { revenue: 2.8, level: 6 } },
  France: { region: 'EU', economy: { revenue: 1.8, level: 3.5 } },
  Portugal: { region: 'EU', economy: { revenue: 0.9, level: 2 } },
}
