import { useEffect, useState } from 'react'
import { formatRecoveryCode } from '../../../online/recoveryCode'
import { downloadText } from '../../download'
import { Button, Card } from '../../components/ui'

/** O aviso que acompanha o código sempre que ele aparece (e que resume o que a privacidade garante: o servidor não guarda o código). */
export function RecoveryWarning() {
  return (
    <div role="alert" className="rounded-2xl border border-loss bg-loss/10 p-4 text-sm leading-relaxed" data-testid="recovery-warning">
      <p className="font-bold text-loss">Guarde este código em um lugar seguro.</p>
      <p className="mt-2">
        <strong>Sem ele, quem perder o celular, limpar os dados do navegador ou trocar de aparelho perde a carreira salva na nuvem e o acesso às ligas online.</strong> Nós não guardamos este código e não conseguimos recuperá-lo.
      </p>
      <p className="mt-2 text-muted">Quem tiver o código entra na sua conta. Não mostre nem envie para ninguém.</p>
    </div>
  )
}

/** Quanto tempo o código fica visível antes de se esconder sozinho. */
export const CODE_VISIBLE_MS = 30_000

/** Nome do arquivo do código e o texto que vai nele. */
export const recoveryFile = (code: string, nickname?: string): { filename: string; text: string } => ({
  filename: 'meu-manager-codigo-de-recuperacao.txt',
  text: `Meu Manager - código de recuperação${nickname ? ` de ${nickname}` : ''}\n\n${formatRecoveryCode(code)}\n\nQuem tiver este código entra na sua conta online. Guarde em lugar seguro e não envie para ninguém.\nEle serve para recuperar a conta em outro aparelho (menu > Online > Já tem uma conta?).\n`,
})

/**
 * Pelo menu: o código só aparece depois de um toque (para não ficar à vista de quem olha a tela) e se esconde em 30 s. Copiar e baixar o arquivo
 * funcionam sem mostrar. "Já guardei" apaga o aviso do menu; depois dele o código continua disponível aqui.
 */
export function RecoveryCodeView({ code, confirmed, nickname, onConfirm, onBack }: { code: string; confirmed: boolean; nickname?: string; onConfirm: () => void; onBack: () => void }) {
  const [shown, setShown] = useState(false)
  const [copied, setCopied] = useState<'ok' | 'fail' | null>(null)
  useEffect(() => {
    if (!shown) return
    const t = setTimeout(() => setShown(false), CODE_VISIBLE_MS)
    return () => clearTimeout(t)
  }, [shown])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(formatRecoveryCode(code))
      setCopied('ok')
    } catch {
      setCopied('fail')
    }
  }
  const download = () => {
    const f = recoveryFile(code, nickname)
    downloadText(f.filename, f.text, 'text/plain')
  }

  return (
    <div className="flex flex-col gap-4" data-testid="recovery-view">
      <div className="flex items-center justify-between">
        <h1 className="title text-3xl">Código de recuperação</h1>
        <button type="button" className="min-h-12 rounded-lg px-3 text-sm text-muted hover:bg-surface" onClick={onBack}>
          Voltar
        </button>
      </div>
      <RecoveryWarning />
      {shown ? (
        <>
          <Card title="Seu código">
            <p className="select-all text-center font-mono text-2xl font-bold tracking-wider" data-testid="recovery-code">
              {formatRecoveryCode(code)}
            </p>
          </Card>
          <p className="text-center text-xs text-muted">Esconde sozinho em 30 segundos.</p>
          <Button variant="secondary" onClick={() => setShown(false)}>
            Esconder agora
          </Button>
        </>
      ) : (
        <Button onClick={() => setShown(true)}>Mostrar o código</Button>
      )}
      <div className="flex gap-3">
        <Button variant="secondary" className="flex-1" onClick={() => void copy()} data-testid="copy-code">
          Copiar
        </Button>
        <Button variant="secondary" className="flex-1" onClick={download} data-testid="download-code">
          Baixar arquivo
        </Button>
      </div>
      {copied && (
        <p role="status" className={`text-center text-xs ${copied === 'ok' ? 'text-win' : 'text-loss'}`}>
          {copied === 'ok' ? 'Código copiado.' : 'Não foi possível copiar. Mostre o código e anote, ou baixe o arquivo.'}
        </p>
      )}
      {confirmed ? (
        <p className="text-center text-xs text-muted" data-testid="code-saved">
          Você marcou que já guardou o código.
        </p>
      ) : (
        <Button onClick={onConfirm} data-testid="code-saved-button">
          Já guardei
        </Button>
      )}
    </div>
  )
}
