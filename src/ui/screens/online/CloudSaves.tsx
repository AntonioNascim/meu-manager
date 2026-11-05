import { useCallback, useEffect, useState } from 'react'
import type { CloudManifest } from '../../../online/cloudSave'
import { SLOT_COUNT } from '../../../store/saveFormat'
import type { SaveSummary } from '../../../store/saveFormat'
import type { CloudSlotState } from '../../../store/cloudState'
import { cloudState, getCloud } from '../../../store/onlineAccount'
import { listSlots, storedBytes } from '../../../store/saves'
import type { SyncOutcome } from '../../../store/cloudSync'
import { Button, Card, TeamBadge } from '../../components/ui'
import { CLOUD_STATUS_LABELS } from '../../labels'
import { Sheet } from '../../theme'

const QUOTA_BYTES = 5 * 1024 * 1024
const mb = (bytes: number): string => (bytes / 1024 / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1, minimumFractionDigits: 1 })
const manifestBytes = (m: CloudManifest): number => Object.values(m.parts).reduce((sum, p) => sum + p.size, 0)
/** Dia e hora sem o ano (cabe no celular). */
const shortDate = (iso: string): string => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
const ago = (at: number, now: number): string => {
  const min = Math.max(0, Math.round((now - at) / 60_000))
  if (min < 1) return 'agora'
  if (min < 60) return `há ${min} min`
  const h = Math.round(min / 60)
  return h < 24 ? `há ${h} h` : `há ${Math.round(h / 24)} d`
}

const OUTCOME_TEXT: Partial<Record<SyncOutcome, string>> = {
  offline: 'Sem conexão: o envio fica pendente e tenta de novo sozinho.',
  quota: 'O save passou da cota de 5 MB da nuvem.',
  auth: 'O servidor recusou o pedido. Confira a data e a hora do aparelho.',
  limited: 'Muitos envios seguidos. Tentaremos de novo daqui a pouco.',
  error: 'Não foi possível enviar agora. O save deste aparelho está intacto.',
}

const TONE: Record<CloudSlotState['status'], string> = {
  synced: 'border-win/50 text-win',
  pending: 'border-yellow-500/50 text-yellow-300',
  syncing: 'border-line text-muted',
  offline: 'border-yellow-500/50 text-yellow-300',
  conflict: 'border-loss/60 text-loss',
  error: 'border-loss/60 text-loss',
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: () => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={onChange} className="flex h-12 w-14 flex-none items-center justify-center" data-testid={`toggle-${label}`}>
      <span className={`relative h-7 w-12 rounded-full ${on ? 'bg-accent' : 'border border-line bg-surface-2'}`}>
        <span className={`absolute top-[3px] h-5 w-5 rounded-full ${on ? 'right-[3px] bg-accent-ink' : 'left-[3px] bg-muted'}`} />
      </span>
    </button>
  )
}

/** Saves na nuvem (B8.2): um cartão por espaço, com o interruptor, o estado, o conflito e o que só existe na nuvem. */
export function CloudSaves({ onBack }: { onBack: () => void }) {
  const cloud = getCloud()
  const [local, setLocal] = useState<(SaveSummary | null)[] | null>(null)
  const [states, setStates] = useState<CloudSlotState[]>([])
  const [remote, setRemote] = useState<(CloudManifest | null)[] | 'offline' | null>(null)
  const [sizes, setSizes] = useState<number[]>([])
  const [enabling, setEnabling] = useState<number | null>(null)
  const [conflict, setConflict] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())

  const refresh = useCallback(async () => {
    setLocal(await listSlots())
    setStates(await cloudState.all())
    setNow(Date.now())
    const slots = await listSlots()
    setSizes(await Promise.all(slots.map((s, i) => (s ? storedBytes(i + 1).then((n) => n ?? 0).catch(() => 0) : Promise.resolve(0)))))
  }, [])

  const loadRemote = useCallback(async () => {
    if (!cloud) return
    try {
      const listing = await cloud.client.list()
      setRemote(listing.saves.map((s) => s.manifest))
    } catch {
      setRemote('offline')
    }
  }, [cloud])

  useEffect(() => {
    void refresh()
    void loadRemote()
    const t = setInterval(() => void refresh(), 3000)
    return () => clearInterval(t)
  }, [refresh, loadRemote])

  if (!cloud) return null
  const remoteOf = (slot: number): CloudManifest | null => (Array.isArray(remote) ? (remote[slot - 1] ?? null) : null)

  const run = async (slot: number, job: () => Promise<unknown>) => {
    setBusy(true)
    setMessage(null)
    try {
      const out = await job()
      if (out === 'conflict') setConflict(slot)
      else if (typeof out === 'string' && OUTCOME_TEXT[out as SyncOutcome]) setMessage(OUTCOME_TEXT[out as SyncOutcome] as string)
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Algo deu errado. O save deste aparelho está intacto.')
    }
    await refresh()
    await loadRemote()
    setBusy(false)
  }

  const turnOn = (slot: number) =>
    run(slot, async () => {
      await cloud.sync.enable(slot)
      return cloud.sync.sync(slot)
    })
  const turnOff = (slot: number) => run(slot, () => cloud.sync.disable(slot))

  const used = states.reduce((sum, s) => sum + (s.enabled ? manifestBytes(remoteOf(s.slot) ?? ({ parts: {} } as CloudManifest)) : 0), 0)

  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col gap-4 bg-bg px-4 py-6 text-slate-100" data-testid="cloud-saves">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted">Conta online</p>
          <h1 className="title text-3xl">Saves na nuvem</h1>
        </div>
        <button type="button" className="min-h-12 rounded-lg px-3 text-sm text-muted hover:bg-surface" onClick={onBack}>
          Voltar
        </button>
      </div>
      <p className="text-xs text-muted">A nuvem é uma cópia por espaço. O jogo continua rodando e salvando neste aparelho, mesmo sem internet.</p>
      {remote === 'offline' && <p className="text-xs text-yellow-300">Sem conexão com o servidor: o que existe só na nuvem não aparece agora.</p>}
      {message && (
        <p role="status" className="text-sm text-yellow-300" data-testid="cloud-message">
          {message}
        </p>
      )}

      {Array.from({ length: SLOT_COUNT }, (_, i) => {
        const slot = i + 1
        const summary = local?.[i] ?? null
        const st = states[i]
        const cloudSave = remoteOf(slot)
        const cloudSummary = cloudSave?.summary
        const showName = summary?.teamName ?? cloudSummary?.teamName
        const badge = summary ? (st?.enabled ? st.status : null) : null
        return (
          <Card key={slot} title={`Espaço ${slot}`}>
            {summary || cloudSummary ? (
              <div className="flex items-center gap-3">
                <TeamBadge team={{ abbreviation: (summary ?? cloudSummary)!.abbreviation, colors: (summary ?? cloudSummary)!.colors }} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{showName}</div>
                  <div className="truncate text-xs text-muted">
                    {summary ? `Temporada ${summary.label ?? summary.year} · salvo ${shortDate(summary.savedAt)}` : `Só na nuvem · temporada ${cloudSummary!.label ?? cloudSummary!.year}`}
                  </div>
                </div>
                {summary && <Toggle on={!!st?.enabled} label={`espaço ${slot}`} onChange={() => (st?.enabled ? void turnOff(slot) : setEnabling(slot))} />}
              </div>
            ) : (
              <p className="text-sm text-muted">Vazio. Comece um jogo para usar este espaço.</p>
            )}

            {badge && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold ${TONE[badge]}`} data-testid={`status-${slot}`}>
                  <i className="inline-block h-2 w-2 rounded-full bg-current" />
                  {CLOUD_STATUS_LABELS[badge]}
                </span>
                {st?.status === 'synced' && st.lastSyncAt !== undefined && <span className="text-xs text-muted">enviado {ago(st.lastSyncAt, now)}</span>}
                {(st?.status === 'offline' || st?.status === 'error') && st.lastError && <span className="text-xs text-muted">{st.lastError}</span>}
                {cloudSave && st?.enabled && <span className="ml-auto text-xs text-muted">{mb(manifestBytes(cloudSave))} de 5 MB</span>}
              </div>
            )}
            {st?.status === 'conflict' && (
              <Button className="mt-3 w-full" onClick={() => setConflict(slot)}>
                Resolver o conflito
              </Button>
            )}
            {st?.enabled && summary && ['pending', 'offline', 'error'].includes(st.status) && (
              <Button className="mt-3 w-full" variant="secondary" disabled={busy} onClick={() => void run(slot, () => cloud.sync.sync(slot))}>
                Enviar agora
              </Button>
            )}
            {!summary && cloudSummary && (
              <Button className="mt-3 w-full" disabled={busy} onClick={() => void run(slot, () => cloud.sync.pull(slot))}>
                Baixar para este aparelho
              </Button>
            )}
          </Card>
        )
      })}

      <Card title="Uso da nuvem">
        <div className="flex items-baseline justify-between text-sm">
          <span>{mb(used)} MB enviados</span>
          <span className="text-xs text-muted">até 5 MB por espaço</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2">
          <div className="h-full bg-accent" style={{ width: `${Math.min(100, (used / (QUOTA_BYTES * SLOT_COUNT)) * 100)}%` }} />
        </div>
        <p className="mt-2 text-xs text-muted">Cópias antigas ficam 7 dias.</p>
      </Card>

      {enabling !== null && (
        <Sheet
          title={`Ligar o espaço ${enabling} à nuvem?`}
          onClose={() => setEnabling(null)}
          footer={
            <div className="flex flex-col gap-3">
              <Button
                disabled={busy}
                onClick={() => {
                  const slot = enabling
                  setEnabling(null)
                  void turnOn(slot)
                }}
              >
                Ligar e enviar agora
              </Button>
              <Button variant="secondary" onClick={() => setEnabling(null)}>
                Agora não
              </Button>
            </div>
          }
        >
          <p className="mb-3 text-sm text-muted">
            {local?.[enabling - 1]?.teamName} · temporada {local?.[enabling - 1]?.label ?? local?.[enabling - 1]?.year}
          </p>
          <div className="flex flex-col gap-2.5 rounded-2xl bg-surface-2 p-4 text-sm leading-relaxed">
            <p>
              <b>O que sobe:</b> o seu save (elenco, finanças, tabela, histórico), comprimido, com cerca de <b>{mb(sizes[enabling - 1] ?? 0)} MB</b>.
            </p>
            <p>
              <b>Quando:</b> depois de cada jogo, com pelo menos 2 minutos entre envios, e só com internet.
            </p>
            <p>
              <b>Onde fica:</b> num armazenamento privado, só acessível com a sua conta. Não é público e não tem link.
            </p>
            <p>
              <b>Para sair:</b> desligue aqui ou apague a conta; o save do aparelho nunca é tocado.
            </p>
          </div>
        </Sheet>
      )}

      {conflict !== null && <ConflictSheet slot={conflict} local={local?.[conflict - 1] ?? null} cloudSave={states[conflict - 1]?.conflict ?? remoteOf(conflict)} onClose={() => setConflict(null)} onResolved={() => { setConflict(null); void refresh(); void loadRemote() }} />}
    </div>
  )
}

function Side({ title, tone, rows }: { title: string; tone?: boolean; rows: [string, string][] }) {
  return (
    <div className={`flex flex-col gap-1.5 rounded-2xl border p-3 text-sm ${tone ? 'border-accent' : 'border-line'} bg-surface`}>
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted">{title}</p>
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-2">
          <span className="text-muted">{k}</span>
          <span className="text-right font-semibold">{v}</span>
        </div>
      ))}
    </div>
  )
}

/** Dois aparelhos jogaram o mesmo espaço: a pessoa escolhe qual versão vale (nunca se mistura). */
function ConflictSheet({ slot, local, cloudSave, onClose, onResolved }: { slot: number; local: SaveSummary | null; cloudSave: CloudManifest | null | undefined; onClose: () => void; onResolved: () => void }) {
  const cloud = getCloud()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  if (!cloud) return null
  const choose = async (choice: 'local' | 'cloud' | 'both') => {
    setBusy(true)
    setMessage(null)
    try {
      const out = await cloud.sync.resolve(slot, choice)
      if (out === 'no-free-slot') {
        setMessage('Não há espaço livre neste aparelho para guardar as duas. Apague um save ou escolha outra opção.')
        setBusy(false)
        return
      }
      onResolved()
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Não foi possível resolver agora. Nada foi alterado.')
      setBusy(false)
    }
  }
  const gameDate = (iso: string | undefined): string => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '—')
  const row = (s: { year: number; label?: string; teamName: string; date?: string } | undefined, at: string | undefined): [string, string][] => [
    ['Time', s?.teamName ?? '—'],
    ['Temporada', s ? String(s.label ?? s.year) : '—'],
    ['No jogo', gameDate(s?.date)],
    ['Salvo', at ? shortDate(at) : '—'],
  ]
  return (
    <Sheet
      title="Duas versões deste save"
      onClose={onClose}
      footer={
        <div className="flex flex-col gap-3">
          <Button disabled={busy} onClick={() => void choose('local')}>
            Manter esta e enviar para a nuvem
          </Button>
          <Button variant="secondary" disabled={busy} onClick={() => void choose('cloud')}>
            Usar a da nuvem neste aparelho
          </Button>
          <Button variant="secondary" disabled={busy} onClick={() => void choose('both')}>
            Guardar as duas (a da nuvem vai para um espaço livre)
          </Button>
        </div>
      }
    >
      <div className="mb-3 rounded-2xl border border-yellow-500/60 bg-yellow-500/10 p-3 text-sm">
        <b className="text-yellow-300">Este espaço foi jogado em dois aparelhos.</b>
        <p className="mt-1 text-muted">O envio ficou parado para não perder nada. Escolha qual versão vale — o jogo não mistura as duas.</p>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <Side title="Neste aparelho" tone rows={row(local ?? undefined, local?.savedAt)} />
        <Side title="Na nuvem" rows={row(cloudSave?.summary, cloudSave?.savedAt)} />
      </div>
      <p className="mt-3 text-xs text-muted">Antes de trocar, uma cópia do que sai fica guardada por 7 dias neste aparelho.</p>
      {message && (
        <p role="alert" className="mt-2 text-sm text-loss" data-testid="conflict-message">
          {message}
        </p>
      )}
    </Sheet>
  )
}
