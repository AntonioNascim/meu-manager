import { useMemo, useRef, useState } from 'react'
import { ONLINE_CONFIG } from '../../online/config'
import { PROBLEM_CATEGORIES, PROBLEM_LIMITS, type ProblemCategory } from '../../online/problemApi'
import { collectTech, shrinkImage, type TechContext } from '../techInfo'
import { Sheet } from '../theme'
import { Button } from './ui'

const CATEGORY_LABELS: Record<ProblemCategory, string> = {
  bug: 'Erro ou travou',
  match: 'Algo estranho numa partida',
  online: 'Liga online ou conta',
  idea: 'Sugestão',
  other: 'Outro assunto',
}

/** Janela "Relatar problema" (teste fechado): descrição, imagem da tela opcional e informações técnicas que a pessoa vê antes de enviar. Anônimo: sem conta, sem IP gravado. */
export function ReportProblem({ context, onClose }: { context: TechContext; onClose: () => void }) {
  const [category, setCategory] = useState<ProblemCategory>('bug')
  const [text, setText] = useState('')
  const [image, setImage] = useState<string | null>(null)
  const [withTech, setWithTech] = useState(true)
  const [withLeague, setWithLeague] = useState(false)
  const [state, setState] = useState<'idle' | 'sending' | 'done' | string>('idle')
  const file = useRef<HTMLInputElement>(null)
  const tech = useMemo(() => collectTech(context, { includeLeagueId: withLeague }), [context, withLeague])
  const ok = text.trim().length >= PROBLEM_LIMITS.textMin

  const pick = async (f: File | undefined) => {
    if (!f) return
    try {
      setImage(await shrinkImage(f))
    } catch {
      setState('Não foi possível ler essa imagem.')
    }
    if (file.current) file.current.value = ''
  }

  const send = async () => {
    setState('sending')
    try {
      const res = await fetch(`${ONLINE_CONFIG.apiBase}/api/problem`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, text: text.trim(), ...(withTech ? { tech } : {}), ...(image ? { image } : {}) }),
      })
      if (res.status === 201) setState('done')
      else if (res.status === 429) setState('Você já enviou relatos demais por agora. Tente de novo mais tarde.')
      else if (res.status === 413) setState('O relato ficou grande demais. Tire a imagem e tente de novo.')
      else setState('Não foi possível enviar agora. Tente de novo em alguns minutos.')
    } catch {
      setState('Sem conexão com o servidor. Confira a internet e tente de novo.')
    }
  }

  return (
    <Sheet
      title="Relatar problema"
      onClose={onClose}
      footer={
        state === 'done' ? (
          <Button onClick={onClose} data-testid="problem-close">Fechar</Button>
        ) : (
          <Button disabled={!ok || state === 'sending'} onClick={() => void send()} data-testid="problem-send">
            {state === 'sending' ? 'Enviando…' : 'Enviar relato'}
          </Button>
        )
      }
    >
      {state === 'done' ? (
        <p className="text-sm" data-testid="problem-done">Relato enviado. Obrigado por ajudar no teste! Ele é anônimo: não temos como responder, então conte tudo o que puder.</p>
      ) : (
        <div className="space-y-3">
          <p className="rounded-xl border border-yellow-500/40 bg-yellow-500/10 p-2 text-xs text-yellow-200">
            Não escreva dados pessoais (nome, telefone, e-mail, endereço) nem o seu código de recuperação. O relato é anônimo.
          </p>
          <label className="block text-sm">
            O que aconteceu?
            <select className="mt-1 min-h-12 w-full rounded-xl border border-line bg-surface-2 px-3 font-bold" value={category} onChange={(e) => setCategory(e.target.value as ProblemCategory)} data-testid="problem-category">
              {PROBLEM_CATEGORIES.map((c) => (
                <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            Descreva o problema (o que você fez, o que esperava, o que viu)
            <textarea
              className="mt-1 min-h-32 w-full rounded-xl border border-line bg-surface-2 p-3 text-sm"
              maxLength={PROBLEM_LIMITS.textMax}
              value={text}
              onChange={(e) => setText(e.target.value)}
              data-testid="problem-text"
            />
            <span className="block text-right text-[11px] text-muted">{text.length}/{PROBLEM_LIMITS.textMax}</span>
          </label>
          <div>
            <input ref={file} type="file" accept="image/*" className="hidden" onChange={(e) => void pick(e.target.files?.[0])} data-testid="problem-file" />
            {image ? (
              <div className="space-y-2">
                <img src={image} alt="Imagem da tela que será enviada" className="max-h-48 rounded-xl border border-line" />
                <Button variant="secondary" onClick={() => setImage(null)}>Tirar a imagem</Button>
              </div>
            ) : (
              <Button variant="secondary" onClick={() => file.current?.click()}>Anexar imagem da tela (opcional)</Button>
            )}
            <p className="mt-1 text-[11px] text-muted">Confira que a imagem não mostra nada pessoal. Ela é reduzida no seu aparelho antes de enviar.</p>
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1 h-5 w-5" checked={withTech} onChange={(e) => setWithTech(e.target.checked)} />
            <span>Enviar as informações técnicas (ajudam a achar o erro)</span>
          </label>
          {withTech && (
            <>
              {context.leagueId && (
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" className="mt-1 h-5 w-5" checked={withLeague} onChange={(e) => setWithLeague(e.target.checked)} />
                  <span>Estou numa liga online: incluir o identificador da liga</span>
                </label>
              )}
              <details className="text-xs text-muted">
                <summary className="min-h-10 cursor-pointer">Ver o que será enviado</summary>
                <pre className="mt-1 whitespace-pre-wrap rounded-xl bg-bg p-2" data-testid="problem-tech">{Object.entries(tech).map(([k, v]) => `${k}: ${v}`).join('\n')}</pre>
              </details>
            </>
          )}
          {state !== 'idle' && state !== 'sending' && <p className="text-sm text-loss" role="alert">{state}</p>}
        </div>
      )}
    </Sheet>
  )
}
