import { Avatar, CompetitionArt, StadiumArt, TrophyArt } from '../theme'

const CLUBS: [string, string][] = [
  ['#1c1c1c', '#f2f2f2'],
  ['#c8102e', '#111111'],
  ['#1f4fa8', '#f4d90f'],
  ['#14803c', '#ffffff'],
]

/** Folha de amostras (só em desenvolvimento, /?avatares=1): rostos, técnicos e ilustrações do jogo. */
export function AvatarSheet() {
  return (
    <div className="mx-auto max-w-xl space-y-4 bg-bg p-4 text-slate-100">
      <h1 className="font-display text-2xl font-bold">Bonequinhos do Meu Manager</h1>
      <div className="grid grid-cols-6 gap-2">
        {Array.from({ length: 36 }, (_, i) => (
          <Avatar key={i} id={`amostra-${i}`} colors={CLUBS[i % 4]} size={52} ring />
        ))}
      </div>
      <h2 className="font-display text-xl font-bold">Técnicos</h2>
      <div className="flex gap-2">
        {Array.from({ length: 6 }, (_, i) => (
          <Avatar key={i} id={`tecnico-${i}`} role="coach" colors={CLUBS[i % 4]} size={52} ring />
        ))}
      </div>
      <h2 className="font-display text-xl font-bold">Tamanhos</h2>
      <div className="flex items-end gap-3">
        {[24, 32, 40, 56, 80].map((s) => (
          <Avatar key={s} id="amostra-7" colors={CLUBS[1]} size={s} />
        ))}
      </div>
      <h2 className="font-display text-xl font-bold">Ilustrações</h2>
      <div className="relative h-40 overflow-hidden rounded-xl border border-white/15">
        <StadiumArt className="absolute inset-0 h-full w-full" />
      </div>
      <div className="flex items-end gap-4">
        <TrophyArt size={80} />
        <TrophyArt size={56} tone="silver" />
        {(['league', 'cup', 'continental', 'super'] as const).map((k) => (
          <CompetitionArt key={k} kind={k} size={48} />
        ))}
      </div>
    </div>
  )
}
