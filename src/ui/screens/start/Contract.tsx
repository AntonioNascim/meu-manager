import { useRef, useState } from 'react'
import { Sheet } from '../../theme'
import { formatMoney } from '../../format'
import type { Player, Team } from '../../../engine/types'
import { clubReport } from './clubInfo'

/** Caixa de assinatura: o dedo (ou o mouse) desenha; `onInk` avisa quando já tem traço. */
function SignaturePad({ onInk, clear }: { onInk: (has: boolean) => void; clear: number }) {
  const canvas = useRef<HTMLCanvasElement | null>(null)
  const drawing = useRef(false)
  const last = useRef<{ x: number; y: number } | null>(null)
  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = (e.currentTarget as HTMLCanvasElement).getBoundingClientRect()
    return { x: ((e.clientX - r.left) / r.width) * 300, y: ((e.clientY - r.top) / r.height) * 110 }
  }
  const stroke = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    const ctx = canvas.current?.getContext('2d')
    if (!ctx) return
    ctx.strokeStyle = '#1e3a8a'
    ctx.lineWidth = 2.2
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(b.x, b.y)
    ctx.stroke()
  }
  return (
    <canvas
      key={clear}
      ref={canvas}
      width={300}
      height={110}
      data-testid="signature-pad"
      className="h-[88px] w-full touch-none rounded-lg border border-dashed border-blue-900/50 bg-white/60"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture?.(e.pointerId)
        drawing.current = true
        last.current = point(e)
      }}
      onPointerMove={(e) => {
        if (!drawing.current || !last.current) return
        const p = point(e)
        stroke(last.current, p)
        last.current = p
        onInk(true)
      }}
      onPointerUp={() => {
        drawing.current = false
        last.current = null
      }}
      aria-label="Assine aqui"
    />
  )
}

/**
 * O contrato do técnico antes de assinar: o que a diretoria pede, o caixa, o elenco e o campo, em seis itens, e a assinatura (desenhada ou
 * "Assinar por mim"). Só depois de assinar o jogo começa.
 */
export function ContractSheet({ world, teamId, coachName, onClose, onSigned }: { world: { teams: readonly Team[]; players: readonly Player[] }; teamId: string; coachName: string; onClose: () => void; onSigned: () => void }) {
  const r = clubReport(world, teamId)
  const [signed, setSigned] = useState(false)
  const [clear, setClear] = useState(0)
  if (!r) return null
  const { team } = r
  const star = r.best[0]
  const items: [string, string][] = [
    ['O cargo', `${team.objective.targetPosition <= 1 ? 'Pedimos que o time seja campeão.' : `Pedimos que o time termine entre os ${team.objective.targetPosition} primeiros.`} A diretoria perde a paciência abaixo do ${team.objective.sackingPosition}º lugar.`],
    ['O caixa', `Você começa com ${formatMoney(team.finances.balance)} e ${formatMoney(team.finances.transferBudget)} para o mercado.`],
    ['O elenco', `${r.squadSize} jogadores, nível ${r.starters.toFixed(0)} nos onze e idade média de ${r.averageAge.toFixed(1).replace('.', ',')} anos.${star ? ` A figura é ${star.player.nickname ?? star.player.name}.` : ''}`],
    ['O campo', `${team.stadium.name}, com ${team.stadium.capacity.toLocaleString('pt-BR')} lugares.`],
    ['O que você herda', 'A tabela por começar e o elenco que está aí. O que veio antes não pesa na sua conta.'],
    ['O que você traz', 'O seu nome e as suas decisões: você começa do zero.'],
  ]
  return (
    <Sheet
      title="O contrato"
      onClose={onClose}
      footer={
        <div className="flex gap-2">
          <button type="button" onClick={() => setSigned(true)} className="min-h-12 flex-1 rounded-xl border border-line bg-surface px-3 font-bold active:scale-95" data-testid="sign-for-me">
            Assinar por mim
          </button>
          <button type="button" onClick={onSigned} disabled={!signed} className="min-h-12 flex-1 rounded-xl bg-accent px-3 font-bold text-accent-ink active:scale-95 disabled:opacity-40" data-testid="sign-contract">
            Assinar o contrato
          </button>
        </div>
      }
    >
      <div className="px-5 pb-4" data-testid="contract">
        <div className="rounded-xl bg-[#f6f1e4] p-4 text-[#1c1a14] shadow-inner">
          <p className="text-center text-[11px] font-extrabold uppercase tracking-[0.18em]">Contrato de técnico · {team.name}</p>
          <ol className="mt-3 space-y-2 text-[13px] leading-snug">
            {items.map(([title, text], i) => (
              <li key={title}>
                <b className="uppercase tracking-wide">
                  {i + 1}. {title}.
                </b>{' '}
                {text}
              </li>
            ))}
          </ol>
          <div className="mt-4 grid grid-cols-2 gap-3 text-center text-[11px] font-bold uppercase">
            <div>
              <SignaturePad onInk={(has) => setSigned(has)} clear={clear} />
              <button type="button" onClick={() => { setClear((c) => c + 1); setSigned(false) }} className="mt-1 text-[10px] underline">
                refazer
              </button>
              <div className="border-t border-black/40 pt-1">{coachName}</div>
              <div className="font-semibold normal-case text-black/60">Técnico</div>
            </div>
            <div className="flex flex-col justify-end">
              <div className="mb-8 font-serif text-base normal-case italic">{team.name}</div>
              <div className="border-t border-black/40 pt-1">Presidente</div>
              <div className="font-semibold normal-case text-black/60">{team.name}</div>
            </div>
          </div>
        </div>
        <p className="mt-2 text-center text-xs text-muted">{signed ? 'Assinado. Falta só confirmar.' : 'Assine no quadro (com o dedo) ou toque em "Assinar por mim".'}</p>
      </div>
    </Sheet>
  )
}
