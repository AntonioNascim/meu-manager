/**
 * Nome curto dos clubes reais, do jeito que a torcida chama (`PackageClub.shortName`). A coluna `shortName` da planilha de clubes é preenchida aqui
 * quando está em branco: primeiro pela tabela abaixo (pelo nome do clube na planilha), depois por `autoShortName` (tira "F.C.", "Futebol Clube"...).
 * Para mudar um deles, use a planilha de tarefas (campo `nome curto`) ou o editor; a correção à mão vence a tabela.
 * Quem já cabe na tela (até 12 letras) e a torcida chama pelo nome inteiro não precisa estar aqui.
 */
import { autoShortName } from '../../src/data/package/shortName'

export const SHORT_NAMES: Readonly<Record<string, string>> = {
  // Brasil
  'Athletico Paranaense': 'Athletico-PR', 'Vasco da Gama': 'Vasco', 'Atlético Mineiro': 'Atlético-MG', 'Red Bull Bragantino': 'Bragantino', Internacional: 'Inter',
  'América Mineiro': 'América-MG', 'Atlético Goianiense': 'Atlético-GO', 'Operário Ferroviário': 'Operário-PR',
  'Inter de Limeira': 'Inter Limeira',
  // Argentina
  'Argentinos Juniors': 'Argentinos', 'Atlético Tucumán': 'Atl. Tucumán', 'Boca Juniors': 'Boca', 'Central Córdoba (SdE)': 'C. Córdoba', 'Sarmiento (J)': 'Sarmiento',
  'Rosario Central': 'Central', 'Vélez Sarsfield': 'Vélez', 'Gimnasia y Esgrima (LP)': 'Gimnasia LP', 'Gimnasia y Esgrima (M)': 'Gimnasia Mza', 'Defensa y Justicia': 'Defensa',
  'Deportivo Riestra': 'Riestra', 'Estudiantes (LP)': 'Estudiantes', 'Estudiantes (RC)': 'Estud. RC', 'Independiente Rivadavia': 'Rivadavia', "Newell's Old Boys": "Newell's",
  'Barracas Central': 'Barracas', 'Talleres (C)': 'Talleres', 'River Plate': 'River',
  // Uruguai e Paraguai
  'Defensor Sporting': 'Defensor', 'Dep. Maldonado': 'Maldonado', 'Central Español': 'C. Español', 'Spvo. Ameliano': 'Ameliano', 'Spvo. Luqueño': 'Luqueño', 'Spvo. Trinidense': 'Trinidense',
  // Chile
  'Audax Italiano': 'Audax', 'Universidad de Concepción': 'U. Concepción', 'Deportes Limache': 'Limache', 'Deportes Concepción': 'Concepción', 'Deportes La Serena': 'La Serena',
  'Universidad Católica': 'U. Católica', 'Universidad de Chile': 'U. de Chile', 'Coquimbo Unido': 'Coquimbo', 'Unión La Calera': 'La Calera',
  // Colômbia
  'América de Cali': 'América', 'Atlético Bucaramanga': 'Bucaramanga', 'Atlético Nacional': 'Atl. Nacional', 'Cúcuta Deportivo': 'Cúcuta', 'Deportes Tolima': 'Tolima',
  'Deportivo Cali': 'Dep. Cali', 'Independiente Medellín': 'Medellín', 'Deportivo Pasto': 'Pasto', 'Deportivo Pereira': 'Pereira', 'Águilas Doradas': 'Águilas', 'Internacional de Bogotá': 'Inter Bogotá',
  // Equador
  'Deportivo Cuenca': 'D. Cuenca', 'Guayaquil City': 'Guayaquil', 'Independiente del Valle': 'Ind. del Valle', 'Técnico Universitario': 'Téc. Univ.',
  // Inglaterra
  'Brighton & Hove Albion F.C.': 'Brighton', 'Crystal Palace F.C.': 'Palace', 'Coventry City': 'Coventry', 'Hull City': 'Hull', 'Ipswich Town F.C.': 'Ipswich', 'Leeds United F.C.': 'Leeds',
  'Manchester City F.C.': 'Man City', 'Manchester United F.C.': 'Man United', 'Newcastle United F.C.': 'Newcastle', 'Nottingham Forest F.C.': 'Forest', 'Tottenham Hotspur': 'Tottenham',
  // Espanha
  'Athletic Bilbao': 'Athletic', 'Atlético Madrid': 'Atlético', 'Deportivo A Coruña': 'Deportivo', 'Racing Santander': 'Racing', 'Rayo Vallecano': 'Rayo', 'Celta Vigo': 'Celta',
  'Real Sociedad': 'R. Sociedad', 'Real Betis': 'Betis',
  // Alemanha
  '1. FC Köln': 'Köln', 'Mainz 05': 'Mainz', 'Bayer Leverkusen': 'Leverkusen', 'Borussia Dortmund': 'Dortmund', 'Borussia Mönchengladbach': 'Gladbach', 'Eintracht Frankfurt': 'Frankfurt',
  'FC Augsburg': 'Augsburg', 'Bayern Munich': 'Bayern', 'RB Leipzig': 'Leipzig', 'SC Freiburg': 'Freiburg', 'SC Paderborn': 'Paderborn', 'Schalke 04': 'Schalke', 'SV Elversberg': 'Elversberg',
  'Werder Bremen': 'Werder', 'TSG Hoffenheim': 'Hoffenheim', 'VfB Stuttgart': 'Stuttgart',
  // França, Portugal, Países Baixos
  'Paris Saint-Germain': 'PSG', 'Sporting CP': 'Sporting', 'Fortuna Sittard': 'Fortuna', 'Go Ahead Eagles': 'Go Ahead', 'Sparta Rotterdam': 'Sparta',
  // México
  'Atlético San Luis': 'San Luis', Guadalajara: 'Chivas', 'Pumas UNAM': 'Pumas', 'Santos Laguna': 'Santos', 'Tigres UANL': 'Tigres',
  // África, Ásia, Oceania
  'Al Ahly SC': 'Al Ahly', 'Espérance Sportive de Tunis': 'Espérance', 'Mamelodi Sundowns F.C.': 'Sundowns', 'Pyramids FC': 'Pyramids', 'Raja Club Athletic': 'Raja', 'TP Mazembe': 'Mazembe',
  'Wydad Athletic Club': 'Wydad', 'Zamalek SC': 'Zamalek', 'Al Ain FC': 'Al Ain', 'Al Hilal SFC': 'Al Hilal', 'Al Ittihad FC': 'Al Ittihad', 'Al Sadd Sports Club': 'Al Sadd', 'Al-Nassr': 'Al Nassr',
  'Ulsan HD FC': 'Ulsan', 'Urawa Red Diamonds': 'Urawa', 'Yokohama F. Marinos': 'Marinos', 'Auckland City FC': 'Auckland', 'Melbourne City FC': 'Melbourne', 'Sydney FC': 'Sydney', 'Wellington Phoenix FC': 'Wellington',
}

/** Nome curto de um clube real: o da tabela, ou o automático. */
export function shortNameOf(clubName: string): string {
  return SHORT_NAMES[clubName] ?? autoShortName(clubName)
}
