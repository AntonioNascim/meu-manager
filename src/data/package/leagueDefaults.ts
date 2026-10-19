import type { LeagueEconomy, Nationality, Region } from '../../engine/types'

/**
 * Padrões de cada país quando o pacote não diz: janelas de transferência e economia da liga (índice de receita e nível dos
 * jogadores em relação ao Brasil). Os valores são os calibrados na B5/B6 (`docs/fase2-proposta.md`, seções 13 e 14). O
 * Brasil não tem economia: é a referência (receita 1, nível 0).
 */
export const COUNTRY_DEFAULTS: Partial<Record<Nationality, { region: Region; economy?: LeagueEconomy; calendar: LeagueCalendar }>> = {
  Brazil: { region: 'BR', calendar: { start: [1, 24] } },
  Argentina: { region: 'SA', economy: { revenue: 0.6, level: -1 }, calendar: { start: [1, 24] } },
  Uruguay: { region: 'SA', economy: { revenue: 0.3, level: -4 }, calendar: { start: [1, 24] } },
  Paraguay: { region: 'SA', economy: { revenue: 0.25, level: -5 }, calendar: { start: [1, 24] } },
  Chile: { region: 'SA', economy: { revenue: 0.4, level: -3 }, calendar: { start: [1, 24] } },
  Colombia: { region: 'SA', economy: { revenue: 0.45, level: -2 }, calendar: { start: [1, 24] } },
  Peru: { region: 'SA', economy: { revenue: 0.3, level: -4 }, calendar: { start: [1, 24] } },
  Ecuador: { region: 'SA', economy: { revenue: 0.3, level: -4 }, calendar: { start: [1, 24] } },
  England: { region: 'EU', economy: { revenue: 3.6, level: 7 }, calendar: { split: true, start: [8, 15] } },
  Spain: { region: 'EU', economy: { revenue: 3.4, level: 7.4 }, calendar: { split: true, start: [8, 15] } },
  Italy: { region: 'EU', economy: { revenue: 2.9, level: 6.6 }, calendar: { split: true, start: [8, 15] } },
  Germany: { region: 'EU', economy: { revenue: 2.6, level: 5.8 }, calendar: { split: true, start: [8, 15] } },
  France: { region: 'EU', economy: { revenue: 1.8, level: 3.5 }, calendar: { split: true, start: [8, 15] } },
  Portugal: { region: 'EU', economy: { revenue: 0.9, level: 2 }, calendar: { split: true, start: [8, 15] } },
  Netherlands: { region: 'EU', economy: { revenue: 1.2, level: 2.6 }, calendar: { split: true, start: [8, 15] } },
  // América do Norte: ano civil, de fevereiro a novembro.
  Mexico: { region: 'NA', economy: { revenue: 1, level: -0.5 }, calendar: { start: [2, 7] } },
  'United States': { region: 'NA', economy: { revenue: 0.9, level: -1.5 }, calendar: { start: [2, 7] } },
  // África, Ásia e Oceania: só os clubes mais fortes (uma liga de elite por continente, para as copas mundiais), com temporada de agosto a maio.
  Egypt: { region: 'AF', economy: { revenue: 0.35, level: -4.5 }, calendar: { split: true, start: [8, 22] } },
  Japan: { region: 'AS', economy: { revenue: 0.7, level: -2 }, calendar: { split: true, start: [8, 22] } },
  Australia: { region: 'OC', economy: { revenue: 0.3, level: -5.5 }, calendar: { split: true, start: [8, 22] } },
}

/**
 * Calendário da liga: o dia de referência da primeira rodada (a rodada cai no primeiro sábado a partir dele) e se a temporada atravessa o ano
 * (agosto a maio, contratos até 30 de junho). Brasil e América do Sul jogam no ano civil, de janeiro a novembro; a Europa, de agosto a maio. Os países de um continente abrem no mesmo fim de semana: as rodadas de meio de semana das ligas caem nas mesmas semanas e deixam as outras livres para as copas continentais (um calendário parecido, não o real de cada país).
 */
export interface LeagueCalendar {
  split?: boolean
  start: [number, number]
}
