import { FULL_ACCESS_AGE, ONLINE_MIN_AGE } from '../../../online/agePolicy'
import { Button } from '../../components/ui'

/** Versão do texto: se mudar, o aviso novo deve ser mostrado de novo antes de a pessoa continuar (seção 7.2 da proposta). */
export const PRIVACY_VERSION = '2026-11-07'

// ATENÇÃO (LGPD): `FULL_ACCESS_AGE` (16) e o modo protegido de 12 a 15 anos são uma DECISÃO A CONFIRMAR com o revisor de LGPD antes do lançamento
// (`docs/lgpd-para-revisor.md`, seção 9.4). Se ele pedir 18, troque só `FULL_ACCESS_AGE` em `src/online/agePolicy.ts`: este texto acompanha.
const SECTIONS: { title: string; body: string[] }[] = [
  {
    title: 'O que guardamos',
    body: [
      'Para você jogar online guardamos um identificador anônimo do seu aparelho (uma chave pública), o apelido que você escolher e a data em que a conta foi criada e usada pela última vez e a sua faixa de idade (só a faixa que você marcou ao criar a conta, nunca a data de nascimento).',
      'Guardamos também as ligas de que você participa: o clube, a escalação, as propostas e transferências, os resultados e as denúncias feitas nelas. Se você ligar a opção "Guardar na nuvem", guardamos os seus jogos salvos da carreira solo. Nada disso está ligado ao seu nome.',
    ],
  },
  {
    title: 'O que não guardamos',
    body: [
      'Não pedimos e-mail, senha, nome real, data de nascimento, telefone, localização nem contatos. Não usamos anúncios nem rastreadores de terceiros. Não há chat no jogo.',
      'O seu endereço de IP não fica guardado em conta nenhuma: ele só serve, durante o pedido, para limitar abuso (por exemplo, quantas contas novas saem do mesmo lugar), e esses contadores temporários são apagados em até 24 horas.',
    ],
  },
  {
    title: 'Denúncias e moderação',
    body: [
      'Quando você denuncia um apelido, uma liga ou uma transferência, guardamos quem denunciou, o alvo, o motivo (de uma lista) e a data. Três pessoas diferentes tiram o apelido ou escondem a liga até um moderador olhar. Denúncias decididas somem em 90 dias, e apagar a sua conta apaga as denúncias feitas por você ou contra você. Quem é banido fica com a chave bloqueada, e esse bloqueio permanece mesmo se a conta for apagada.',
    ],
  },
  {
    title: 'Relatar problema',
    body: [
      'O botão "Relatar problema" envia, de forma anônima (sem conta e sem gravar o seu IP), a descrição que você escrever, uma imagem de tela se você quiser e as informações técnicas que o próprio jogo mostra antes do envio (versão, tela, tipo de navegador e de aparelho). Não escreva dados pessoais. Os relatos ficam por 90 dias e só os moderadores veem.',
    ],
  },
  {
    title: 'Sem internet',
    body: ['A carreira solo funciona sem internet e os jogos ficam no seu aparelho. Só as ligas online e a cópia na nuvem precisam de conexão.'],
  },
  {
    title: 'Código de recuperação',
    body: [
      'A conta anônima tem um código de recuperação (20 letras e números, como K7QP-9X2M-HT4R-8WZC-3NFB), que você encontra em Online › Código de recuperação e deve guardar. Ele é a única forma de levar a conta e os jogos para outro aparelho.',
      'Nós não guardamos esse código e não podemos recuperá-lo: ele fica só no seu aparelho. Quem tiver o código tem acesso à sua conta; guarde-o em lugar seguro.',
    ],
  },
  {
    title: 'Quem vê o quê',
    body: [
      'Os outros técnicos de uma liga veem o seu apelido, o seu clube, o que acontece nas partidas e o histórico de transferências da liga (jogador, clubes, preço e data). O ADM da liga também vê as denúncias de transferências feitas por qualquer técnico.',
      'Ninguém vê os seus jogos salvos da carreira solo.',
    ],
  },
  {
    title: 'Por quanto tempo',
    body: [
      'Hoje nenhuma conta é apagada por falta de uso. Se essa limpeza for ligada no futuro, ela valerá só para quem ficar mais de 12 meses sem entrar, e o jogo mostra o aviso novo antes. Isso nunca apaga os jogos guardados no seu aparelho, só o que está na nuvem.',
      'Ligas inativas são arquivadas e depois apagadas, junto com as denúncias e o histórico delas; o seu apelido some dos registros de uma liga apagada. Você pode apagar tudo agora em Online › Minha conta › "Apagar minha conta".',
    ],
  },
  {
    title: 'Seus direitos',
    body: ['Você pode ver, exportar (arquivo .json) e apagar os seus dados a qualquer momento, sem falar com ninguém, em Online › Minha conta. Para denunciar uma transferência, toque em "Denunciar" no histórico do Mercado.'],
  },
  {
    title: 'Servidores e verificação anti-robô',
    body: ['Os dados ficam em servidores do Cloudflare, que também mantém registros técnicos de tráfego. Ao criar a conta usamos a verificação anti-robô do Cloudflare (Turnstile). O jogo é independente e gratuito, sem ligação com clubes, federações ou campeonatos reais.'],
  },
  {
    title: 'Crianças e adolescentes',
    body: [
      `A carreira solo é livre para todas as idades e não usa conta. O modo online é para quem tem ${ONLINE_MIN_AGE} anos ou mais: ao criar a conta você marca só a faixa de idade.`,
      `De ${ONLINE_MIN_AGE} a ${FULL_ACCESS_AGE - 1} anos a conta é protegida: o jogo dá o apelido (como "Técnico 4821"), só valem ligas de amigos entrando por convite, sem ligas abertas, e o nome da liga é escolhido de uma lista. A partir dos ${FULL_ACCESS_AGE} anos tudo é liberado.`,
      'Pais e responsáveis podem apagar a conta pelo mesmo botão, em Online › Minha conta.',
    ],
  },
  {
    title: 'Mudanças',
    body: ['Se este aviso mudar, mostraremos o texto novo antes de você continuar.'],
  },
]

/** O aviso de privacidade do modo online (B8.8; texto da seção 7.2 da proposta, conferido com o que o servidor de fato faz). */
export function PrivacyNotice({ onBack }: { onBack: () => void }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col gap-4 px-4 py-6 text-slate-100" data-testid="privacy-notice">
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted">Online</p>
      <h1 className="title text-3xl">Privacidade</h1>
      <p className="text-xs text-muted">Versão de {PRIVACY_VERSION.split('-').reverse().join('/')}</p>
      {SECTIONS.map((s) => (
        <section key={s.title} className="rounded-2xl border border-line bg-surface p-4">
          <h2 className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-muted">{s.title}</h2>
          <div className="flex flex-col gap-2 text-sm">
            {s.body.map((p) => (
              <p key={p}>{p}</p>
            ))}
          </div>
        </section>
      ))}
      <Button variant="secondary" onClick={onBack} data-testid="privacy-back">
        Voltar
      </Button>
    </div>
  )
}
