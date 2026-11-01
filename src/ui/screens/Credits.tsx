import { useState } from 'react'
import type { ReactNode } from 'react'
import { loadRealPackage } from '../../data/package/realPackage'
import { Button, Card } from '../components/ui'

function Link({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="break-words font-semibold text-accent underline underline-offset-2">
      {children}
    </a>
  )
}

/** Créditos dos dados e aviso de jogo independente (acessível pelo menu inicial). */
export function Credits({ onBack }: { onBack: () => void }) {
  const [articles, setArticles] = useState<string | null>(null)
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle')

  const showArticles = () => {
    setState('loading')
    loadRealPackage()
      .then((pkg) => {
        setArticles(pkg.credits ?? 'Este pacote não traz a lista de artigos.')
        setState('idle')
      })
      .catch(() => setState('error'))
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col gap-4 bg-bg px-4 py-8 text-slate-100" data-testid="credits">
      <div className="flex items-center justify-between">
        <h1 className="title text-4xl">Créditos</h1>
        <button type="button" className="min-h-12 rounded-lg px-3 text-sm text-muted hover:bg-surface" onClick={onBack}>
          Voltar
        </button>
      </div>

      <Card title="Jogo independente">
        <p className="text-sm leading-relaxed">
          O Meu Manager é um jogo independente. Ele <strong>não tem ligação</strong>, patrocínio ou aprovação de clubes, jogadores, ligas, federações ou entidades de futebol. Nomes de clubes e de jogadores aparecem apenas para identificar a quem pertencem.
        </p>
        <p className="mt-2 text-sm leading-relaxed text-muted">Os escudos são desenhos genéricos, criados pelo jogo com as cores de cada clube. Não há logotipos, escudos oficiais nem fotos. Os atributos dos jogadores são estimativas do jogo e não representam medições reais.</p>
      </Card>

      <Card title="Dados do mundo real">
        <ul className="space-y-3 text-sm leading-relaxed">
          <li>
            <strong>Wikipedia</strong> (em inglês e nos idiomas dos países): elencos dos clubes, listas dos clubes de cada temporada, cores, estádios e cidades. Texto sob a licença{' '}
            <Link href="https://creativecommons.org/licenses/by-sa/4.0/deed.pt-br">Creative Commons Atribuição-CompartilhaIgual 4.0 (CC BY-SA 4.0)</Link>. Autores de cada artigo no histórico da página em <Link href="https://www.wikipedia.org">wikipedia.org</Link>. O arquivo de dados do mundo real do jogo é distribuído sob essa mesma licença.
          </li>
          <li>
            <strong>Wikidata</strong>: dados de clubes e jogadores (nomes, datas de nascimento, nacionalidades, posições). Domínio público,{' '}
            <Link href="https://creativecommons.org/publicdomain/zero/1.0/deed.pt-br">licença CC0</Link>. <Link href="https://www.wikidata.org">wikidata.org</Link>.
          </li>
          <li>
            <strong>Visualizações de páginas da Wikimedia</strong>: o número de visitas recentes à página de cada jogador ajuda a estimar a fama, que define a força inicial dele. Dados abertos da{' '}
            <Link href="https://pageviews.wmcloud.org">Fundação Wikimedia</Link>.
          </li>
        </ul>
        <p className="mt-3 text-xs text-muted">Wikipedia, Wikidata e Wikimedia são marcas da Fundação Wikimedia, que não apoia este jogo.</p>
      </Card>

      <Card title="Fontes e ferramentas">
        <p className="text-sm leading-relaxed">
          Fontes <Link href="https://fonts.google.com/specimen/Inter">Inter</Link> e <Link href="https://fonts.google.com/specimen/Barlow+Condensed">Barlow Condensed</Link>, licença SIL Open Font (OFL), distribuídas pelo projeto Fontsource.
        </p>
      </Card>

      <Card title="Artigos consultados">
        <p className="text-sm text-muted">Lista dos artigos da Wikipedia de onde saíram os dados do mundo real. Ela vem junto do arquivo do mundo real, que é baixado agora se ainda não estiver neste aparelho.</p>
        {articles === null ? (
          <Button className="mt-3 w-full" variant="secondary" disabled={state === 'loading'} onClick={showArticles}>
            {state === 'loading' ? 'Carregando…' : 'Ver a lista de artigos'}
          </Button>
        ) : (
          <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-bg p-3 text-xs text-muted" data-testid="credits-articles">
            {articles}
          </pre>
        )}
        {state === 'error' && <p className="mt-2 text-sm text-loss">Não foi possível baixar o arquivo. Confira a conexão.</p>}
      </Card>
    </div>
  )
}
