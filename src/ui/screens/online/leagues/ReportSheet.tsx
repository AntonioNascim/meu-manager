import { useState } from 'react'
import type { ReportKind, ReportReason } from '../../../../online/moderation'
import { leagueApi } from '../../../../store/leagues'
import { Button } from '../../../components/ui'
import { Sheet } from '../../../theme'

const REASONS: { id: ReportReason; label: string }[] = [
  { id: 'offensive', label: 'Ofensivo' },
  { id: 'impersonation', label: 'Finge ser outra pessoa ou o jogo' },
  { id: 'spam', label: 'Propaganda ou lixo' },
  { id: 'other', label: 'Outro motivo' },
]

const FAIL: Record<string, string> = {
  duplicate: 'Você já denunciou isto.',
  'self-report': 'Você não pode denunciar a si mesmo.',
  'not-found': 'Isto não existe mais.',
  'not-member': 'Só quem está na liga pode denunciá-la.',
  'rate-limited': 'Você já fez denúncias demais por agora. Tente mais tarde.',
}

/** Denunciar um apelido ou uma liga. Três pessoas diferentes tiram o apelido ou escondem a liga do diretório até alguém olhar. */
export function ReportSheet({ kind, target, title, onClose }: { kind: ReportKind; target: string; title: string; onClose: () => void }) {
  const [reason, setReason] = useState<ReportReason>('offensive')
  const [state, setState] = useState<'idle' | 'sending' | 'done' | string>('idle')
  const send = async () => {
    setState('sending')
    const r = await leagueApi.report({ kind, target, reason })
    setState(r.ok ? 'done' : (FAIL[r.error] ?? 'Não foi possível enviar agora.'))
  }
  return (
    <Sheet
      title={title}
      onClose={onClose}
      footer={
        state === 'done' ? (
          <Button onClick={onClose} data-testid="report-close">Fechar</Button>
        ) : (
          <Button disabled={state === 'sending'} onClick={() => void send()} data-testid="report-send">
            Enviar denúncia
          </Button>
        )
      }
    >
      {state === 'done' ? (
        <p className="text-sm" data-testid="report-done">Denúncia enviada. Obrigado: ela fica anônima para o denunciado.</p>
      ) : (
        <>
          <p className="mb-2 text-sm text-muted">Qual é o problema?</p>
          <div className="flex flex-col gap-2" role="radiogroup">
            {REASONS.map((r) => (
              <button
                key={r.id}
                type="button"
                role="radio"
                aria-checked={reason === r.id}
                onClick={() => setReason(r.id)}
                className={`min-h-12 rounded-xl border px-3 text-left text-sm font-semibold ${reason === r.id ? 'border-accent bg-accent/10' : 'border-line bg-surface'}`}
              >
                {r.label}
              </button>
            ))}
          </div>
          {state !== 'idle' && state !== 'sending' && <p className="mt-3 text-sm text-loss" role="alert">{state}</p>}
        </>
      )}
    </Sheet>
  )
}
