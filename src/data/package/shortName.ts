/**
 * Nome curto do clube, do jeito que a torcida chama (Leverkusen, Gladbach, Atlético-MG, Man United). Vem do pacote (`PackageClub.shortName`) e
 * serve onde falta espaço (classificação, lista de jogos, resumo). Sem ele, `autoShortName` tira do nome as palavras de formalidade
 * ("Futebol Clube", "F.C."); nome que já é curto fica como está.
 */

/** Tamanho máximo aceito no pacote. */
export const SHORT_NAME_MAX = 16

/** Daqui para baixo o nome já cabe e não é mexido. */
const FITS = 12

/** Palavras de formalidade que saem do nome (comparadas sem acento e sem pontos). */
const FORMAL = new Set(['fc', 'cf', 'sc', 'ac', 'as', 'sv', 'ssc', 'fk', 'afc', 'club', 'clube', 'futebol', 'football', 'esporte', 'sport', 'sociedade', 'associacao', 'regatas', 'atletico', 'foot', 'ball'])

const plain = (word: string): string => word.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\./g, '').toLowerCase()

/** Nome curto automático: tira as palavras de formalidade quando o nome é comprido (nunca deixa o nome vazio). */
export function autoShortName(name: string): string {
  const clean = name.replace(/\s+/g, ' ').trim()
  if (clean.length <= FITS) return clean
  const words = clean.split(' ')
  // "Atlético" e "Sport" só são formalidade no fim do nome ("Serra Gaúcha Atlético Clube" → "Serra Gaúcha"; "Atlético Mineiro" fica).
  const kept = words.filter((w, i) => {
    const p = plain(w)
    if (!FORMAL.has(p)) return true
    return (p === 'atletico' || p === 'sport') && i === 0 && words.length > 1 && !words.slice(1).every((x) => FORMAL.has(plain(x)))
  })
  const out = kept.join(' ').trim()
  return out.length > 0 ? out : clean
}

/** O nome curto a mostrar: o do clube, ou o automático. */
export function clubShortName(club: { name: string; shortName?: string | undefined }): string {
  return club.shortName && club.shortName.trim() !== '' ? club.shortName : autoShortName(club.name)
}
