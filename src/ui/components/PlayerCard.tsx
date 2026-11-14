import { useState } from 'react'
import type { ReactNode } from 'react'
import { isWindowOpen, marketValue, releaseCost } from '../../engine/market'
import { playerOverall } from '../../engine/overall'
import type { ListingKind, Player } from '../../engine/types'
import type { Game } from '../../store/game'
import { isStarter, talkBlock, talkHint, TALK, TALK_KINDS } from '../../engine/talk'
import type { TalkKind } from '../../engine/talk'
import { SHIRT_MAX, SHIRT_MIN } from '../../engine/shirt'
import { perform } from '../../store/actions'
import { formatDate, formatMoney, playerName } from '../format'
import { NATIONALITY_LABELS, POSITION_LABELS, TALK_HINT_LABELS, TALK_KIND_LABELS, commandErrorText } from '../labels'
import { Avatar, Crest, Flag, Icon, ValueBadge } from '../theme'
import type { IconName } from '../theme/icons'
import { teamNumbers } from '../shirt'
import { RenewForm } from '../screens/Contracts'
import { ListSheet } from '../screens/market/Lists'
import { SellSheet } from '../screens/market/SellSheet'
import { PlayerOffers } from '../screens/market/Proposals'
import { IndividualSlot } from '../screens/squad/Training'

type PanelId = 'talk' | 'renew' | 'training' | 'market' | 'offers' | 'release'

const ACTIONS: { id: PanelId; label: string; icon: IconName }[] = [
  { id: 'talk', label: 'Conversar', icon: 'mail' },
  { id: 'renew', label: 'Renovar', icon: 'doc' },
  { id: 'training', label: 'Treino', icon: 'dumbbell' },
  { id: 'market', label: 'Mercado', icon: 'swap' },
  { id: 'offers', label: 'Propostas', icon: 'hand' },
  { id: 'release', label: 'Dispensar', icon: 'trash' },
]

/** Escolha do número da camisa: digita ou toca; se outro jogador já usa o número, os dois trocam. */
function ShirtPicker({ game, player, onDone }: { game: Game; player: Player; onDone: () => void }) {
  const current = teamNumbers(game.season, game.userTeamId).get(player.id) ?? 0
  const [message, setMessage] = useState<string | null>(null)
  const [text, setText] = useState(String(current))
  const n = Number(text)
  const valid = Number.isInteger(n) && n >= SHIRT_MIN && n <= SHIRT_MAX
  return (
    <div className="mt-3 rounded-xl border border-line bg-surface-2 p-3" data-testid="shirt-picker">
      <label className="block text-sm">
        Número da camisa (1 a 99)
        <input inputMode="numeric" value={text} onChange={(e) => setText(e.target.value.replace(/\D/g, '').slice(0, 2))} className="mt-1 min-h-12 w-full rounded-xl border border-line bg-surface px-3 text-lg font-bold" aria-label="Número da camisa" />
      </label>
      <p className="mt-1 text-xs text-muted">Se outro jogador já usa esse número, os dois trocam.</p>
      {message && <p className="mt-1 text-sm text-loss">{message}</p>}
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          disabled={!valid}
          onClick={() => void perform({ type: 'shirt', playerId: player.id, number: n }).then((out) => (out.ok ? onDone() : setMessage(commandErrorText(out.error))))}
          className="min-h-12 flex-1 rounded-xl bg-accent font-bold text-accent-ink active:scale-95 disabled:opacity-40"
        >
          Salvar
        </button>
        <button type="button" onClick={onDone} className="min-h-12 rounded-xl border border-line bg-surface px-4 font-bold">
          Cancelar
        </button>
      </div>
    </div>
  )
}

function ReleasePanel({ game, player, onGone }: { game: Game; player: Player; onGone: () => void }) {
  const [message, setMessage] = useState<string | null>(null)
  const cost = releaseCost(player, game.season.season.currentDate)
  return (
    <div className="space-y-2 p-4">
      <p className="text-sm text-slate-300">
        Dispensar {playerName(player)} custa a rescisão de <b>{formatMoney(cost)}</b>. Ele sai do clube e vai para o mercado de livres.
      </p>
      {message && <p className="text-sm text-loss">{message}</p>}
      <button
        type="button"
        onClick={() => void perform({ type: 'release-player', playerId: player.id }).then((out) => (out.ok ? onGone() : setMessage(commandErrorText(out.error))))}
        className="min-h-12 w-full rounded-xl border border-loss/60 font-bold text-loss active:scale-95"
        data-testid="confirm-release"
      >
        Confirmar: dispensar
      </button>
    </div>
  )
}

const TALK_HELP: Record<TalkKind, string> = {
  praise: 'Reconhece o trabalho dele.',
  demand: 'Pede mais dele.',
  promise: 'Promete a vaga de titular nos próximos 3 jogos.',
  threaten: 'Avisa que vai para o banco se não render.',
}

/** Conversar: quatro opções que mexem na moral, com chance de dar certo ou errado e intervalo entre conversas. */
function TalkPanel({ game, player }: { game: Game; player: Player }) {
  const [result, setResult] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const block = talkBlock(game.season, game.userTeamId, player)
  const starter = isStarter(game.season, player)
  const promise = game.season.talks?.promises.find((p) => p.playerId === player.id)
  const say = (kind: TalkKind, out: { ok: boolean; error?: string; info?: Record<string, unknown> }) => {
    if (!out.ok) return setResult(commandErrorText(out.error ?? 'invalid'))
    const info = out.info as { success?: boolean; delta?: number; promised?: boolean } | undefined
    const delta = info?.delta ?? 0
    const sign = delta > 0 ? `+${delta}` : `${delta}`
    setResult(info?.success ? `Ele gostou da conversa (moral ${sign}).${info.promised ? ' A promessa de vaga vale para os próximos 3 jogos.' : ''}` : `Ele reagiu mal (moral ${sign}). Não vai querer conversar por ${TALK.failLockDays} dias.`)
    void kind
  }
  return (
    <div className="space-y-2 p-4" data-testid="talk-panel">
      <p className="text-sm text-slate-300">Uma conversa mexe na moral dele, para melhor ou pior, conforme a fase dele. Há um intervalo de {TALK.intervalDays} dias entre conversas com o mesmo jogador e no máximo {TALK.weeklyMax} por semana no elenco.</p>
      {promise && (
        <p className="rounded-xl border border-accent/40 bg-accent/[0.06] p-2.5 text-sm" role="status">
          Promessa de vaga: faltam {promise.gamesLeft} {promise.gamesLeft === 1 ? 'jogo' : 'jogos'}. Se ele não começar jogando, a moral cai.
        </p>
      )}
      {block && block.error !== 'has-promise' && (
        <p className="text-sm text-amber-300" role="status">
          {commandErrorText(block.error)}
          {block.until ? ` (de novo em ${formatDate(block.until)})` : ''}.
        </p>
      )}
      <div className="grid grid-cols-1 gap-2">
        {TALK_KINDS.map((k) => {
          const hint = talkHint(k, player, starter)
          const off = !!block || pending || (k === 'promise' && !!promise)
          return (
            <button
              key={k}
              type="button"
              disabled={off}
              data-testid={`talk-${k}`}
              onClick={() => {
                setPending(true)
                void perform({ type: 'talk', playerId: player.id, kind: k }).then((out) => {
                  setPending(false)
                  say(k, out as { ok: boolean; error?: string; info?: Record<string, unknown> })
                })
              }}
              className="flex min-h-12 items-center justify-between gap-2 rounded-xl border border-line bg-surface-2 px-3 text-left active:scale-95 disabled:opacity-40"
            >
              <span className="min-w-0">
                <span className="block font-bold">{TALK_KIND_LABELS[k]}</span>
                <span className="block truncate text-xs text-muted">{TALK_HELP[k]}</span>
              </span>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${hint === 'good' ? 'bg-win/20 text-win' : hint === 'bad' ? 'bg-loss/20 text-loss' : 'bg-surface text-muted'}`}>{TALK_HINT_LABELS[hint]}</span>
            </button>
          )
        })}
      </div>
      {result && (
        <p className="text-sm font-semibold" role="status" data-testid="talk-result">
          {result}
        </p>
      )}
    </div>
  )
}

/**
 * Cartão grande do seu jogador (aberto ao tocar nele): força, bandeira, clube, nome, posição, idade, valor, camisa, "Ver números" e, ao lado,
 * os botões que abrem embaixo do cartão renovação, treino individual, mercado (anunciar e vender), propostas e dispensa.
 */
export function PlayerCard({ game, player, onClose }: { game: Game; player: Player; onClose: () => void }) {
  const [panel, setPanel] = useState<PanelId | null>(null)
  const [shirtOpen, setShirtOpen] = useState(false)
  const [listing, setListing] = useState<ListingKind | null>(null)
  const [selling, setSelling] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const team = game.season.teams.find((t) => t.id === player.teamId) ?? game.season.teams.find((t) => t.id === game.userTeamId)
  const date = game.season.season.currentDate
  const overall = playerOverall(player)
  const loaned = !!player.contract.loanedFrom
  const number = teamNumbers(game.season, game.userTeamId).get(player.id)
  const open = isWindowOpen(game.season, date, [game.userTeamId])
  const toggle = (id: PanelId) => setPanel((p) => (p === id ? null : id))
  const offers = game.season.market.offers.filter((o) => o.direction === 'incoming' && o.status === 'pending' && o.playerId === player.id).length

  let body: ReactNode = null
  if (panel === 'talk') body = <TalkPanel game={game} player={player} />
  if (panel === 'renew') body = loaned ? <p className="p-4 text-sm text-muted">Jogador emprestado: o contrato é do outro clube.</p> : <RenewForm game={game} player={player} onClose={() => setPanel(null)} />
  if (panel === 'training')
    body = (
      <div>
        <IndividualSlot game={game} fixedPlayerId={player.id} onMessage={setNote} />
        {note && <p className="px-1 pt-2 text-sm text-slate-300">{note}</p>}
      </div>
    )
  if (panel === 'market')
    body = loaned ? (
      <p className="p-4 text-sm text-muted">Jogador emprestado: não pode ser negociado por você.</p>
    ) : (
      <div className="space-y-2 p-4">
        <p className="text-sm text-slate-300">Anuncie para os clubes fazerem propostas, ou negocie a venda agora.</p>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setListing('transfer')} className="min-h-12 rounded-xl border border-line bg-surface-2 text-sm font-bold active:scale-95">
            Lista de transferências
          </button>
          <button type="button" onClick={() => setListing('loan')} className="min-h-12 rounded-xl border border-line bg-surface-2 text-sm font-bold active:scale-95">
            Disponível para empréstimo
          </button>
        </div>
        <button type="button" onClick={() => setSelling(true)} className="min-h-12 w-full rounded-xl border border-line bg-surface-2 font-bold active:scale-95">
          Vender ou emprestar agora
        </button>
      </div>
    )
  if (panel === 'offers') body = <PlayerOffers game={game} playerId={player.id} open={open} />
  if (panel === 'release') body = loaned ? <p className="p-4 text-sm text-muted">Jogador emprestado: devolva-o pelo outro clube.</p> : <ReleasePanel game={game} player={player} onGone={onClose} />

  return (
    <div data-testid="player-card" className="space-y-3">
      <section className="card-bg overflow-hidden rounded-[16px] border border-accent/45 p-2.5 shadow-[inset_0_0_30px_rgb(39_224_90/0.06),0_0_18px_rgb(39_224_90/0.1)]" data-testid="player-top-card">
        <div className="grid grid-cols-[92px_minmax(0,1fr)_104px] gap-x-2.5 gap-y-1 min-[440px]:grid-cols-[116px_minmax(0,1fr)_128px] min-[440px]:gap-x-4">
          <div className="relative flex h-[150px] flex-col items-center justify-start overflow-hidden rounded-[12px] border border-accent/55 bg-gradient-to-b from-[#12201a] to-[#070d0a] pt-2 shadow-[inset_0_0_24px_rgb(39_224_90/0.12)] min-[440px]:row-span-2 min-[440px]:h-[200px]" data-testid="player-avatar">
            <Avatar id={player.id} {...(team ? { colors: team.colors } : {})} size={96} />
            {team && (
              <span className="absolute bottom-2">
                <Crest team={team} size="sm" />
              </span>
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-end gap-1.5">
              <ValueBadge value={overall} className="!min-w-12 !px-2.5 !py-1 !text-[34px] !leading-none" data-testid="card-force">
                {Math.round(overall)}
              </ValueBadge>
              <span className="pb-1 text-[11px] font-bold uppercase tracking-wider text-accent">Força</span>
            </div>
            <div className="title mt-1 line-clamp-3 text-[18px] leading-[1.05] min-[440px]:text-[24px]" data-testid="card-name">
              {playerName(player)}
            </div>
            <div className="mt-1 flex items-center gap-1.5 text-[13px] text-slate-200">
              <Flag nationality={player.nationality} />
              <span className="truncate">{NATIONALITY_LABELS[player.nationality]}</span>
            </div>
          </div>
          <div className="col-start-3 row-span-2 flex flex-col gap-1.5 min-[440px]:row-span-2" role="group" aria-label="Ações do jogador">
            {ACTIONS.map((a) => (
              <button
                key={a.id}
                type="button"
                aria-pressed={panel === a.id}
                onClick={() => toggle(a.id)}
                className={`relative flex min-h-[44px] items-center gap-2 rounded-xl border px-2 text-left text-[13.5px] font-semibold active:scale-95 ${panel === a.id ? 'border-accent bg-accent text-accent-ink' : a.id === 'release' ? 'border-loss/60 bg-loss/[0.12] text-loss' : 'border-accent/45 bg-accent/[0.07] text-slate-100'}`}
              >
                <Icon name={a.icon} size={18} className={panel === a.id ? '' : a.id === 'release' ? 'text-loss' : 'text-accent'} />
                {a.label}
                {a.id === 'offers' && offers > 0 && <span className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full bg-loss ring-2 ring-surface-2" role="img" aria-label="Há propostas" />}
              </button>
            ))}
          </div>
          <dl className="col-span-2 grid grid-cols-[auto_1fr] items-center gap-x-2 gap-y-1.5 border-t border-white/[0.08] pt-2 text-[12px] min-[440px]:col-span-1 min-[440px]:col-start-2">
            <dt className="flex items-center gap-1.5 text-muted"><Icon name="target" size={14} className="text-slate-300" />Posição</dt>
            <dd className="text-right font-bold">{POSITION_LABELS[player.position]}</dd>
            <dt className="flex items-center gap-1.5 text-muted"><Icon name="user" size={14} className="text-slate-300" />Idade</dt>
            <dd className="text-right font-bold">{player.age} anos</dd>
            <dt className="flex items-center gap-1.5 whitespace-nowrap text-muted"><Icon name="dollar" size={14} className="text-slate-300" />Valor de mercado</dt>
            <dd className="whitespace-nowrap text-right font-bold tabular-nums" data-testid="card-value">
              {formatMoney(marketValue(player, date, team))}
            </dd>
            <dt className="flex items-center gap-1.5 text-muted"><Icon name="shirt" size={14} className="text-slate-300" />Camisa</dt>
            <dd className="text-right font-bold">
              <button type="button" onClick={() => setShirtOpen((v) => !v)} className="inline-flex min-h-8 items-center gap-2 rounded-lg border border-line bg-surface-2 px-2.5 tabular-nums" aria-label="Trocar o número da camisa" data-testid="shirt-number">
                {number ?? '–'} <span className="text-accent">trocar</span>
              </button>
            </dd>
          </dl>
        </div>
        {shirtOpen && <ShirtPicker game={game} player={player} onDone={() => setShirtOpen(false)} />}
      </section>

      {body && <section className="card-bg overflow-hidden rounded-[14px] border border-white/[0.13]">{body}</section>}

      {listing && <ListSheet game={game} player={player} initialKind={listing} onClose={() => setListing(null)} />}
      {selling && <SellSheet game={game} player={player} onClose={() => setSelling(false)} onDone={() => (setSelling(false), onClose())} />}
    </div>
  )
}
