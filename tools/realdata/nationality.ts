/** Converte nomes de países do Wikidata e da Wikipedia (nome ou sigla da FIFA) nas nacionalidades do jogo (`NATIONALITIES`, em inglês). */
import { NATIONALITIES } from '../../src/engine/types'
import type { Nationality } from '../../src/engine/types'

const strip = (text: string): string =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

const BY_NAME = new Map<string, Nationality>(NATIONALITIES.map((n) => [strip(n), n]))

/** Nomes que o Wikidata e a Wikipedia usam e o jogo escreve de outro jeito. */
const ALIASES: Record<string, Nationality> = {
  'united states of america': 'United States',
  usa: 'United States',
  czechia: 'Czech Republic',
  'cote d ivoire': 'Ivory Coast',
  'china pr': 'China',
  'people s republic of china': 'China',
  'democratic republic of the congo': 'DR Congo',
  'congo dr': 'DR Congo',
  'republic of the congo': 'Congo',
  'congo brazzaville': 'Congo',
  'cabo verde': 'Cape Verde',
  'the gambia': 'Gambia',
  'republic of ireland': 'Ireland',
  turkiye: 'Turkey',
  'korea republic': 'South Korea',
  'republic of korea': 'South Korea',
  'korea dpr': 'North Korea',
  'kingdom of the netherlands': 'Netherlands',
  holland: 'Netherlands',
  'state of palestine': 'Palestine',
  swaziland: 'Eswatini',
  'east timor': 'Timor-Leste',
  'timor leste': 'Timor-Leste',
  'sao tome and principe': 'Sao Tome and Principe',
  'sao tome e principe': 'Sao Tome and Principe',
  'st kitts and nevis': 'Saint Kitts and Nevis',
  'st lucia': 'Saint Lucia',
  macao: 'Macau',
  'bosnia herzegovina': 'Bosnia and Herzegovina',
  macedonia: 'North Macedonia',
  'republic of macedonia': 'North Macedonia',
  burma: 'Myanmar',
  'russian federation': 'Russia',
  'syrian arab republic': 'Syria',
  'viet nam': 'Vietnam',
  uae: 'United Arab Emirates',
  'kyrgyz republic': 'Kyrgyzstan',
}

/** Siglas da FIFA (as tabelas da Wikipedia escrevem o país assim). */
const FIFA_CODES: Record<string, Nationality> = {
  BRA: 'Brazil', ARG: 'Argentina', URU: 'Uruguay', PAR: 'Paraguay', CHI: 'Chile', COL: 'Colombia', PER: 'Peru', ECU: 'Ecuador', BOL: 'Bolivia', VEN: 'Venezuela',
  ENG: 'England', SCO: 'Scotland', WAL: 'Wales', NIR: 'Northern Ireland', IRL: 'Ireland', ESP: 'Spain', ITA: 'Italy', GER: 'Germany', FRA: 'France', POR: 'Portugal',
  NED: 'Netherlands', BEL: 'Belgium', SUI: 'Switzerland', AUT: 'Austria', DEN: 'Denmark', SWE: 'Sweden', NOR: 'Norway', FIN: 'Finland', ISL: 'Iceland', POL: 'Poland',
  CZE: 'Czech Republic', SVK: 'Slovakia', HUN: 'Hungary', ROU: 'Romania', BUL: 'Bulgaria', SRB: 'Serbia', CRO: 'Croatia', SVN: 'Slovenia', BIH: 'Bosnia and Herzegovina',
  MNE: 'Montenegro', MKD: 'North Macedonia', ALB: 'Albania', KOS: 'Kosovo', GRE: 'Greece', TUR: 'Turkey', UKR: 'Ukraine', RUS: 'Russia', BLR: 'Belarus', GEO: 'Georgia',
  ARM: 'Armenia', AZE: 'Azerbaijan', KAZ: 'Kazakhstan', ISR: 'Israel', CYP: 'Cyprus', LUX: 'Luxembourg', MLT: 'Malta', EST: 'Estonia', LVA: 'Latvia', LTU: 'Lithuania',
  MDA: 'Moldova', USA: 'United States', CAN: 'Canada', MEX: 'Mexico', CRC: 'Costa Rica', PAN: 'Panama', HON: 'Honduras', SLV: 'El Salvador', GUA: 'Guatemala',
  JAM: 'Jamaica', HAI: 'Haiti', CUB: 'Cuba', CUW: 'Curaçao', SUR: 'Suriname', TRI: 'Trinidad and Tobago', DOM: 'Dominican Republic', EGY: 'Egypt', MAR: 'Morocco',
  ALG: 'Algeria', TUN: 'Tunisia', SEN: 'Senegal', NGA: 'Nigeria', GHA: 'Ghana', CIV: 'Ivory Coast', CMR: 'Cameroon', MLI: 'Mali', BFA: 'Burkina Faso', GUI: 'Guinea',
  GNB: 'Guinea-Bissau', GAM: 'Gambia', CPV: 'Cape Verde', ANG: 'Angola', MOZ: 'Mozambique', COD: 'DR Congo', CGO: 'Congo', GAB: 'Gabon', ZAM: 'Zambia', ZIM: 'Zimbabwe',
  RSA: 'South Africa', KEN: 'Kenya', UGA: 'Uganda', TAN: 'Tanzania', ETH: 'Ethiopia', SDN: 'Sudan', LBY: 'Libya', MTN: 'Mauritania', TOG: 'Togo', BEN: 'Benin',
  NIG: 'Niger', CTA: 'Central African Republic', EQG: 'Equatorial Guinea', COM: 'Comoros', MAD: 'Madagascar', JPN: 'Japan', KOR: 'South Korea', PRK: 'North Korea',
  CHN: 'China', AUS: 'Australia', NZL: 'New Zealand', IRN: 'Iran', IRQ: 'Iraq', KSA: 'Saudi Arabia', UAE: 'United Arab Emirates', QAT: 'Qatar', KUW: 'Kuwait', BHR: 'Bahrain',
  OMA: 'Oman', JOR: 'Jordan', SYR: 'Syria', LBN: 'Lebanon', PLE: 'Palestine', UZB: 'Uzbekistan', TKM: 'Turkmenistan', THA: 'Thailand', VIE: 'Vietnam', IDN: 'Indonesia',
  MAS: 'Malaysia', PHI: 'Philippines', SIN: 'Singapore', IND: 'India', FIJ: 'Fiji', NCL: 'New Caledonia', GUY: 'Guyana',
}

/** Nome ou sigla vindo da fonte → nacionalidade do jogo; `undefined` quando o país não existe no jogo. */
export function toNationality(text: string | undefined): Nationality | undefined {
  if (!text) return undefined
  const trimmed = text.trim()
  if (/^[A-Z]{3}$/.test(trimmed)) return FIFA_CODES[trimmed]
  const key = strip(trimmed)
  return BY_NAME.get(key) ?? ALIASES[key]
}

/** "Reino Unido" não diz qual seleção: o jogo usa a Inglaterra e marca para revisão. */
export const isUnitedKingdom = (text: string): boolean => ['united kingdom', 'great britain', 'uk'].includes(strip(text))
