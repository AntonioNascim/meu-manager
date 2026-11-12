import { useId } from 'react'

/** Ilustrações próprias do jogo (SVG, sem imagem externa, sem marcas reais): funcionam sem internet. */

/** Estádio à noite, de dentro das arquibancadas: refletores, bancadas e o gramado ao fundo. Serve de fundo de cartão. */
export function StadiumArt({ className = '' }: { className?: string }) {
  const uid = useId().replace(/:/g, '')
  const seats = `${uid}s`
  const glow = `${uid}g`
  const sky = `${uid}k`
  const turf = `${uid}t`
  return (
    <svg viewBox="0 0 400 210" preserveAspectRatio="xMidYMid slice" aria-hidden="true" className={className}>
      <defs>
        <linearGradient id={sky} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#05090a" />
          <stop offset="1" stopColor="#0b1a15" />
        </linearGradient>
        <radialGradient id={glow}>
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="0.25" stopColor="#d9ffe6" stopOpacity="0.45" />
          <stop offset="1" stopColor="#27e05a" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={turf} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0f5a2a" />
          <stop offset="1" stopColor="#06260f" />
        </linearGradient>
        <pattern id={seats} width="7" height="5" patternUnits="userSpaceOnUse">
          <rect width="7" height="5" fill="#101c1c" />
          <rect x="1" y="1" width="4" height="2.600" rx="1" fill="#1d3a33" />
        </pattern>
      </defs>
      <rect width="400" height="210" fill={`url(#${sky})`} />
      {/* bancadas: duas faixas inclinadas e a de trás */}
      <path d="M0 62 400 62 400 120 0 120Z" fill={`url(#${seats})`} opacity="0.9" />
      <path d="M0 62h400" stroke="#27e05a" strokeOpacity="0.35" strokeWidth="1.200" />
      <path d="M0 40 36 62H0ZM400 40 364 62H400Z" fill="#0a1514" />
      <path d="M0 120 400 120 400 134 0 134Z" fill="#0c1716" />
      <path d="M0 126h400" stroke="#27e05a" strokeOpacity="0.5" strokeWidth="1.500" />
      {/* teto e refletores */}
      <path d="M0 0h400v34c-60-12-140-18-200-18S60 22 0 34Z" fill="#050909" />
      {[28, 110, 200, 290, 372].map((x, i) => (
        <g key={x}>
          <circle cx={x} cy={i % 2 ? 26 : 22} r="34" fill={`url(#${glow})`} opacity={i === 2 ? 0.8 : 0.9} />
          <rect x={x - 12} y={i % 2 ? 22 : 18} width="24" height="6" rx="2" fill="#e9fff0" />
        </g>
      ))}
      {/* gramado em perspectiva */}
      <path d="M0 134h400v76H0Z" fill={`url(#${turf})`} />
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <path key={i} d={`M${-40 + i * 90} 210 ${150 + i * 20} 134h18L${-4 + i * 90 + 50} 210Z`} fill="#ffffff" opacity="0.035" />
      ))}
      <path d="M0 150h400M0 172h400" stroke="#ffffff" strokeOpacity="0.12" strokeWidth="1" />
      <ellipse cx="200" cy="176" rx="64" ry="14" fill="none" stroke="#ffffff" strokeOpacity="0.28" strokeWidth="1.500" />
      <path d="M200 134v76" stroke="#ffffff" strokeOpacity="0.2" strokeWidth="1.500" />
      <rect width="400" height="210" fill="#000" opacity="0.18" />
    </svg>
  )
}

/** Troféu genérico (taça dourada com alças), sem nada de taça real. */
export function TrophyArt({ size = 64, className = '', tone = 'gold' }: { size?: number; className?: string; tone?: 'gold' | 'silver' }) {
  const uid = useId().replace(/:/g, '')
  const g = `${uid}g`
  const [a, b, c] = tone === 'gold' ? ['#fff0b0', '#e9b44c', '#8a5a14'] : ['#ffffff', '#c3ccd0', '#6a757a']
  return (
    <svg width={size} height={size * 1.2} viewBox="0 0 60 72" aria-hidden="true" className={`shrink-0 ${className}`}>
      <defs>
        <linearGradient id={g} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={a} />
          <stop offset="0.5" stopColor={b} />
          <stop offset="1" stopColor={c} />
        </linearGradient>
      </defs>
      <path d="M14 10C5 10 3 24 14 30" fill="none" stroke={`url(#${g})`} strokeWidth="3.400" strokeLinecap="round" />
      <path d="M46 10c9 0 11 14 0 20" fill="none" stroke={`url(#${g})`} strokeWidth="3.400" strokeLinecap="round" />
      <path d="M12 6h36c0 18-3 31-18 34C15 37 12 24 12 6Z" fill={`url(#${g})`} />
      <path d="M17 8h5c0 14 2 25 8 30-9-3-13-13-13-30Z" fill="#fff" opacity="0.35" />
      <path d="M26 40h8l1 12h-10Z" fill={`url(#${g})`} />
      <path d="M18 52h24l3 9H15Z" fill={`url(#${g})`} />
      <rect x="13" y="61" width="34" height="6" rx="2" fill={c} />
      <path d="m30 15 2 4.200 4.500.6-3.300 3.100.9 4.500-4.100-2.200-4.100 2.200.9-4.500-3.300-3.100 4.500-.6Z" fill="#fff" opacity="0.55" />
    </svg>
  )
}

export type CompetitionKind = 'league' | 'cup' | 'continental' | 'super' | 'world'

/** Emblema genérico de cada tipo de competição (nunca o logo oficial de ninguém). */
export function CompetitionArt({ kind, size = 44 }: { kind: CompetitionKind; size?: number }) {
  const uid = useId().replace(/:/g, '')
  const g = `${uid}g`
  if (kind === 'league') {
    return (
      <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" className="shrink-0">
        <defs>
          <linearGradient id={g} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#d8e6ff" />
            <stop offset="1" stopColor="#2a4fa8" />
          </linearGradient>
        </defs>
        <path d="M24 3 42 8v14c0 12-8 19-18 23C14 41 6 34 6 22V8Z" fill={`url(#${g})`} stroke="#e9eefc" strokeWidth="2" strokeLinejoin="round" />
        <circle cx="24" cy="21" r="8" fill="#fff" />
        <path d="m24 15.500 4.500 3.300-1.700 5.300h-5.600l-1.700-5.300Z" fill="#14202a" />
      </svg>
    )
  }
  if (kind === 'continental' || kind === 'world') {
    return (
      <div className="relative shrink-0" style={{ width: size, height: size * 1.1 }}>
        <TrophyArt size={size * 0.86} className="mx-auto" tone={kind === 'world' ? 'gold' : 'silver'} />
      </div>
    )
  }
  return <TrophyArt size={size * 0.8} className="mx-auto" tone={kind === 'super' ? 'silver' : 'gold'} />
}
