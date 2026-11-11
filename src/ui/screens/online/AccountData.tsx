import { useState } from 'react'
import { TopBar } from '../../theme/Bits'
import { RateLimitedError } from '../../../online/cloudClient'
import { accessOfAccount, changeNickname, deleteAccount, getCloud, useAccount } from '../../../store/onlineAccount'
import { Button, Card } from '../../components/ui'
import { downloadText } from '../../download'
import { ACCOUNT_REASON_LABELS, AGE_BAND_LABELS, NAME_ISSUE_LABELS } from '../../labels'
import { Sheet } from '../../theme'

/** Dados e conta (B8.1/B8.2): trocar o apelido, ver o código, exportar o que o servidor guarda e apagar a conta. */
export function AccountData({ onBack, onShowCode, onDeleted, onPrivacy }: { onBack: () => void; onShowCode: () => void; onDeleted: () => void; onPrivacy?: () => void }) {
  const accountState = useAccount()
  const { account } = accountState
  const protectedMode = accessOfAccount(accountState) !== 'full'
  const [nickname, setNickname] = useState(account?.nickname ?? '')
  const [nickMessage, setNickMessage] = useState<{
    ok: boolean
    text: string
  } | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [typed, setTyped] = useState('')
  if (!account) return null
  const confirmWord = account.nickname ?? 'APAGAR'

  const saveNickname = async () => {
    setBusy(true)
    setNickMessage(null)
    const result = await changeNickname(nickname)
    setBusy(false)
    if (result.ok) {
      setNickname(result.nickname)
      return setNickMessage({ ok: true, text: 'Apelido atualizado.' })
    }
    setNickMessage({
      ok: false,
      text: result.reason === 'bad-nickname' ? NAME_ISSUE_LABELS[result.issue] : ACCOUNT_REASON_LABELS[result.reason],
    })
  }

  const exportData = async () => {
    const cloud = getCloud()
    if (!cloud) return
    setBusy(true)
    setMessage(null)
    try {
      downloadText('meu-manager-meus-dados.json', JSON.stringify(await cloud.sync.exportAccount(), null, 2))
      setMessage('Arquivo baixado.')
    } catch {
      setMessage('Não foi possível baixar agora. Confira a internet e tente de novo.')
    }
    setBusy(false)
  }

  const erase = async () => {
    setBusy(true)
    setMessage(null)
    try {
      await deleteAccount()
      setDeleting(false)
      onDeleted()
    } catch (e) {
      setMessage(
        e instanceof RateLimitedError
          ? 'Já houve pedidos demais para apagar contas hoje. Tente de novo amanhã. Nada foi alterado.'
          : 'Não foi possível apagar agora (sem conexão?). Nada foi alterado.',
      )
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col gap-4 px-4 py-6 text-slate-100" data-testid="account-data">
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted">Conta online · {account.nickname ?? 'sem apelido'}</p>
      <TopBar title="Dados e conta" onBack={onBack} />

      {protectedMode ? (
        <Card title="Seu apelido">
          <p className="text-lg font-semibold" data-testid="account-nickname-fixed">
            {account.nickname ?? 'sem apelido'}
          </p>
          <p className="mt-2 text-xs text-muted">
            Modo protegido: o apelido é dado pelo jogo e não pode ser trocado. Só ligas de amigos, por convite. Faixa de idade informada:{' '}
            {account.ageBand ? AGE_BAND_LABELS[account.ageBand] : 'não informada'}.
          </p>
        </Card>
      ) : (
        <Card title="Seu apelido">
          <input
            className="min-h-12 w-full rounded-xl bg-surface-2 px-4 text-lg font-semibold ring-1 ring-line"
            value={nickname}
            maxLength={24}
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => {
              setNickname(e.target.value)
              setNickMessage(null)
            }}
            data-testid="account-nickname"
          />
          {nickMessage && (
            <p role="status" className={`mt-2 text-xs ${nickMessage.ok ? 'text-win' : 'text-loss'}`} data-testid="nickname-message">
              {nickMessage.text}
            </p>
          )}
          <Button className="mt-3 w-full" variant="secondary" disabled={busy || nickname.trim() === '' || nickname.trim() === account.nickname} onClick={() => void saveNickname()}>
            Salvar apelido
          </Button>
          <p className="mt-2 text-xs text-muted">
            ID da conta: {account.identity.playerId.slice(0, 4)}…{account.identity.playerId.slice(-4)} · criada em {new Date(account.createdAt).toLocaleDateString('pt-BR')}
          </p>
        </Card>
      )}

      <Card title="Código de recuperação">
        <p className="text-xs text-muted">Só aparece quando você pedir. Não fica no servidor.</p>
        <Button className="mt-3 w-full" variant="secondary" onClick={onShowCode}>
          Ver o código
        </Button>
      </Card>

      {onPrivacy && (
        <Card title="Privacidade">
          <p className="text-xs text-muted">O que guardamos, o que não guardamos e por quanto tempo.</p>
          <Button className="mt-3 w-full" variant="secondary" onClick={onPrivacy} data-testid="open-privacy">
            Ler o aviso de privacidade
          </Button>
        </Card>
      )}

      <Card title="Exportar meus dados">
        <p className="text-xs text-muted">Baixa um arquivo com tudo o que o servidor guarda sobre você: apelido, saves da nuvem e ligas.</p>
        <Button className="mt-3 w-full" variant="secondary" disabled={busy} onClick={() => void exportData()}>
          Baixar meus dados
        </Button>
      </Card>

      <section className="rounded-2xl border border-loss/60 bg-surface p-4">
        <h2 className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-loss">Apagar minha conta</h2>
        <p className="text-xs text-muted">Remove a conta, os saves da nuvem e a sua presença nas ligas. Os saves deste aparelho continuam.</p>
        <button type="button" className="mt-3 min-h-12 w-full rounded-xl border border-loss font-bold text-loss" onClick={() => setDeleting(true)}>
          Apagar minha conta…
        </button>
      </section>
      {message && (
        <p role="status" className="text-sm text-muted" data-testid="account-message">
          {message}
        </p>
      )}

      {deleting && (
        <Sheet
          title="Apagar a conta de vez?"
          onClose={() => setDeleting(false)}
          footer={
            <div className="flex flex-col gap-3">
              <button
                type="button"
                disabled={typed.trim() !== confirmWord || busy}
                className="min-h-12 rounded-xl border border-loss font-bold text-loss disabled:opacity-40"
                onClick={() => void erase()}
                data-testid="confirm-delete"
              >
                {busy ? 'Apagando…' : 'Apagar minha conta'}
              </button>
              <Button variant="secondary" onClick={() => setDeleting(false)}>
                Cancelar
              </Button>
            </div>
          }
        >
          <p className="mb-2 text-sm">
            Isto <b>não tem volta</b>:
          </p>
          <p className="text-xs leading-relaxed text-muted">
            • Os saves da nuvem são apagados do servidor
            <br />• Você sai das ligas; os clubes que comandava viram IA
            <br />• O apelido e o código deixam de valer
            <br />• <b className="text-slate-100">Os saves deste aparelho não são apagados</b>
          </p>
          <label className="mt-4 flex flex-col gap-1.5 text-sm">
            <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted">Digite “{confirmWord}” para confirmar</span>
            <input
              className="min-h-12 rounded-xl bg-surface-2 px-4 ring-1 ring-loss"
              value={typed}
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => setTyped(e.target.value)}
              data-testid="delete-confirm-input"
            />
          </label>
        </Sheet>
      )}
    </div>
  )
}
