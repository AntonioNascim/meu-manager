import { useState } from 'react'
import type { Game } from '../../store/game'
import { ReportProblem } from '../components/ReportProblem'
import { Button, Card } from '../components/ui'
import type { ScreenId } from '../navigation'
import { Icon } from '../theme'
import type { IconName } from '../theme'
import { Credits } from './Credits'

interface Item {
  icon: IconName
  title: string
  sub?: string
  go: () => void
}

function Row({ item }: { item: Item }) {
  return (
    <button type="button" onClick={item.go} className="flex min-h-[52px] w-full items-center gap-2.5 border-b border-white/[0.07] px-0.5 py-2 text-left last:border-b-0">
      <Icon name={item.icon} size={24} className="text-accent" />
      <span className="flex min-w-0 flex-1 flex-col">
        <b className="text-[14.5px] font-semibold">{item.title}</b>
        {item.sub && <small className="text-xs text-muted">{item.sub}</small>}
      </span>
      <Icon name="chev" size={18} className="text-accent" />
    </button>
  )
}

/** Aba Mais: o que não cabe na barra de baixo (Finanças, Carreira, Histórico, Contratos, Base, Treino, liga online) e o menu. */
export function More({ game, onNavigate, onMenu }: { game: Game; onNavigate: (to: ScreenId, tab?: string) => void; onMenu: () => void }) {
  const [credits, setCredits] = useState(false)
  const [reporting, setReporting] = useState(false)
  if (credits) return <Credits onBack={() => setCredits(false)} />
  const main: Item[] = [
    { icon: 'dollar', title: 'Finanças', sub: 'Caixa, orçamento e ingresso', go: () => onNavigate('finance') },
    { icon: 'hist', title: 'Carreira', sub: 'Reputação e propostas', go: () => onNavigate('career') },
    { icon: 'table', title: 'Histórico', sub: 'Temporadas encerradas', go: () => onNavigate('standings', 'history') },
    { icon: 'doc', title: 'Contratos', sub: 'Renovações', go: () => onNavigate('contracts') },
    { icon: 'sprout', title: 'Base', sub: 'Categorias de base', go: () => onNavigate('academy') },
    { icon: 'dumb', title: 'Treino', sub: 'Plano e vaga individual', go: () => onNavigate('training') },
    ...(game.online ? [{ icon: 'globe' as IconName, title: 'Liga online', sub: 'Sala, técnicos e Pronto', go: () => onNavigate('league') }] : []),
  ]
  return (
    <div className="flex flex-col gap-3" data-testid="more-screen">
      <h2 className="font-display text-[26px] font-bold leading-none">Mais</h2>
      <Card>
        <div>{main.map((i) => <Row key={i.title} item={i} />)}</div>
      </Card>
      <Card>
        <div>
          <Row item={{ icon: 'info', title: 'Créditos e avisos', go: () => setCredits(true) }} />
          <Row item={{ icon: 'flag', title: 'Relatar problema', go: () => setReporting(true) }} />
        </div>
      </Card>
      <Button variant="secondary" icon="menu" className="w-full" onClick={onMenu}>
        Menu · salvar e voltar ao início
      </Button>
      {reporting && <ReportProblem context={{ screen: 'mais', mode: game.online ? 'online' : 'solo', worldSource: game.dataPackage?.id.split(':')[1] ?? 'ficticio', season: String(game.season.season.year), phase: game.season.season.phase }} onClose={() => setReporting(false)} />}
    </div>
  )
}
