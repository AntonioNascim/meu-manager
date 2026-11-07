# Meu Manager — documento para a revisão de LGPD

> **Para quem é este documento.** Para a pessoa (advogado ou consultor de proteção de dados) que vai revisar o jogo antes do lançamento público. Está em linguagem simples, sem jargão de programação, e descreve **o que o jogo realmente faz hoje** (conferido no código em 06/11/2026), não só o que pretendemos. Onde algo está **previsto mas ainda não existe**, está marcado como **[NÃO IMPLEMENTADO]**. Onde eu (o desenvolvedor, não jurista) tenho dúvida jurídica, está marcado como **[PERGUNTA]**. Nada aqui é aconselhamento jurídico.
>
> **Versão do aviso de privacidade mostrado no jogo:** 2026-11-06 (`src/ui/screens/online/PrivacyNotice.tsx`). Este documento descreve a realidade; o aviso deve ser ajustado ao que o revisor decidir.

## 1. Resumo em dez linhas

1. **Jogo de futebol (gerenciamento), gratuito, independente**, sem anúncios, sem compras, sem chat, sem rastreadores de terceiros.
2. Funciona **sem internet e sem conta** (carreira solo): nesse modo **nenhum dado vai para servidor nenhum**; tudo fica no aparelho.
3. Há um modo **online opcional** (ligas entre jogadores e cópia dos saves na nuvem) que exige uma **conta anônima**: um identificador técnico (chave pública), um **apelido** que a pessoa escolhe e um **código de recuperação** que fica só no aparelho dela.
4. **Não pedimos** nome, e-mail, telefone, endereço, localização, contatos, data de nascimento nem idade.
5. Os servidores são do **Cloudflare** (Estados Unidos e rede global). Não temos servidor próprio.
6. O endereço de **IP** é usado só para limitar abuso e fica em contadores temporários (**no máximo 24 horas**); não é ligado a conta.
7. A pessoa pode **ver, exportar e apagar** os dados dela sozinha, dentro do jogo (com lacunas listadas na seção 7).
8. Há um recurso de **denúncia** (apelidos e ligas) e um de **"Relatar problema"** (texto livre opcional e imagem de tela opcional): são os dois pontos em que a pessoa pode, por engano, escrever dado pessoal.
9. Os elencos do "mundo real" usam **nomes, datas de nascimento e nacionalidades de jogadores de futebol reais**, vindos da Wikipedia e do Wikidata (dados de terceiros; seção 8).
10. **Menores de idade** (seção 9) são o ponto mais delicado e a principal decisão que preciso do revisor.

## 2. Quem faz o quê

| Papel | Quem |
|---|---|
| Controlador | O(s) responsável(is) pelo projeto (**[PERGUNTA]** pessoa física ou jurídica? a definir antes do lançamento) |
| Encarregado (DPO) e canal de contato | **Ainda não existe.** Hoje não há e-mail nem formulário de contato no jogo; os direitos são exercidos dentro do jogo (seção 7). **[PERGUNTA]** é necessário indicar encarregado e um canal? |
| Operador / infraestrutura | Cloudflare, Inc. (Workers, Durable Objects, D1, R2, Turnstile). Contrato padrão da Cloudflare; não negociado |
| Fonte dos elencos | Wikipedia e Wikidata (licenças CC BY-SA e CC0), mostradas na tela de Créditos |

## 3. Dados guardados **no aparelho** da pessoa

Tudo isto fica no navegador (IndexedDB, `localStorage` e cache do navegador). Nada sai do aparelho sem a pessoa ligar o modo online. Apagar os "dados do site" no navegador apaga tudo.

| Dado | Onde no aparelho | Para quê | Por quanto tempo |
|---|---|---|---|
| Jogos salvos (3 espaços): o mundo do jogo, elencos, partidas, finanças, táticas | IndexedDB `meu-manager` | Continuar a carreira | Até a pessoa apagar o save ou os dados do site |
| Identidade online: **chave secreta**, chave pública, apelido, **código de recuperação (20 caracteres)**, data de criação | IndexedDB `meu-manager-identidade` (**guardada sem criptografia no aparelho**) | Assinar os pedidos ao servidor; rever o código no menu | Até a pessoa apagar a conta ou os dados do site |
| Estado da cópia na nuvem de cada save (versão, fila de envio, conflitos, cópias locais de 7 dias) | IndexedDB `meu-manager-nuvem` | Sincronizar saves | Até a pessoa desligar a nuvem ou apagar os dados |
| Pacote de elencos baixado (arquivo de dados dos clubes e jogadores) | IndexedDB `meu-manager-pacotes` | Jogar com elencos atualizados, também offline | As 2 versões mais novas |
| Pacotes importados pela pessoa | IndexedDB `meu-manager` (tabela `packages`) | Mundos personalizados | Até apagar |
| Preferências: "online liberado neste aparelho", "aviso de instalação fechado", "aviso do iOS fechado", "última consulta de atualização de elencos" | `localStorage` | Lembrar escolhas | Até apagar os dados do site |
| Cópia do aplicativo para abrir offline (instalável como PWA) | Cache do navegador (`meu-manager-<versão>`) | Funcionar sem internet | Até a versão seguinte ou apagar |

Observação: **não usamos cookies** e não há ferramenta de estatística (nem Google Analytics, nem pixels).

## 4. Dados guardados **no servidor** (somente se a pessoa usa o modo online)

Todos os dados abaixo ficam em serviços do Cloudflare. Os tempos de retenção descrevem **o que o código faz hoje**.

### 4.1 Banco de dados D1 (tabelas)

| Tabela | Campos | Para quê | Retenção hoje |
|---|---|---|---|
| `identities` | identificador (chave pública, 43 letras), data de criação, **data da última visita (atualizada no máximo 1 vez por hora)**, **apelido** | Reconhecer a conta; mostrar o apelido nas ligas | Até a pessoa apagar a conta. **[NÃO IMPLEMENTADO]** apagar contas sem uso há 12 meses (a limpeza está desligada de propósito: não há como avisar quem sumiu) |
| `leagues` | id, nome da liga (**texto livre escrito pelo criador**), tipo (aberta ou de amigos), código de convite, id do ADM, ritmo, fuso, mundo usado, data | Listar e organizar ligas | A sala (mundo e técnicos) é destruída quando a liga é fechada (o último técnico sai ou o ADM a fecha). **O registro da liga neste banco (nome, id do ADM, data) permanece com situação "fechada"**: **[NÃO IMPLEMENTADO]** apagá-lo depois de um prazo. **[NÃO IMPLEMENTADO]** arquivar e apagar ligas inativas (hoje uma liga abandonada com técnicos nela continua existindo) |
| `league_members` | id da liga, id do técnico, clube escolhido, data de entrada | Saber quem joga em qual liga | Enquanto a pessoa está na liga; sai ao sair da liga ou apagar a conta |
| `reports` | tipo (apelido ou liga), alvo, **quem denunciou**, motivo (lista fechada), data, situação | Moderação (3 pessoas diferentes tiram o apelido ou escondem a liga) | Aberta até o painel decidir; **decidida, some em 90 dias**; some também ao apagar a conta de quem denunciou ou do denunciado |
| `bans` | identificador banido, motivo (texto curto do moderador), data | Impedir quem foi banido de voltar com a mesma chave | **Fica** mesmo se a conta for apagada (**[PERGUNTA]** base legal e prazo) |
| `problem_reports` | categoria, **texto livre**, informações técnicas (seção 5), se há imagem, situação, data | Corrigir erros no teste | **90 dias** (apagados automaticamente), ou antes se o moderador apagar |

### 4.2 Armazenamento de arquivos R2 (bucket privado)

| O quê | Chave | Para quê | Retenção hoje |
|---|---|---|---|
| **Saves na nuvem** (só se a pessoa liga "Guardar na nuvem" num espaço): o jogo salvo em pedaços comprimidos, sem criptografia própria | `<identificador>/<espaço>/…` | Continuar em outro aparelho | Até a pessoa desligar/apagar o espaço ou a conta. Cópia de segurança de 7 dias quando há conflito. Cota de 5 MB por espaço. **[NÃO IMPLEMENTADO]** limpeza por 12 meses sem uso |
| Imagem de tela de um "Relatar problema" | `problems/<id>.jpg` | Ver o erro | 90 dias |
| Pacotes de elencos publicados | `mundo-real/<versão>/…` | Distribuir elencos | Permanente (não são dados de usuários) |

### 4.3 Durable Objects (memória e disco temporários do Cloudflare)

| O quê | Conteúdo | Para quê | Retenção hoje |
|---|---|---|---|
| **Sala da liga** (um objeto por liga) | Os técnicos (identificador, clube, presença, faltas), o calendário, o mundo inteiro da liga (clubes, jogadores, finanças), propostas e histórico de transferências entre técnicos (com id e apelido), **denúncias de transferência** (quem denunciou e por quê, visíveis ao ADM), registros de reprodução das partidas ao vivo | Fazer a liga funcionar | Até a liga ser fechada/apagada (então o objeto é destruído) |
| **Guard** (limites e códigos de uso único) | Contadores por **endereço IP** e por identificador (hora de cada pedido), "nonces" das assinaturas | Limitar abuso; impedir repetição de pedidos | **No máximo 24 horas** (limpeza horária automática) |

### 4.4 Cloudflare Turnstile (anti-robô, ao criar a conta)

Ao criar a conta, o navegador executa a verificação do Cloudflare (sem quebra-cabeça). O Cloudflare recebe, por conta própria, dados do navegador e o IP para decidir se é robô; o nosso servidor só recebe "passou" ou "não passou" (e o IP, para repassar à verificação, sem guardar).

### 4.5 O que o Cloudflare guarda por conta própria

Como qualquer provedor, o Cloudflare mantém registros técnicos e estatísticas agregadas de tráfego (que incluem IP). **Não ativamos logs persistentes de requisições** no nosso Worker. **[PERGUNTA]** isso precisa constar no aviso? Há transferência internacional (Cloudflare, EUA): qual mecanismo do art. 33 da LGPD adotar (cláusulas-padrão do provedor)?

## 5. O que o "Relatar problema" envia (teste fechado)

Botão no menu inicial, no painel do clube e na sala da liga. É **anônimo**: não exige conta, não grava IP, não leva identificador da pessoa.

- **Categoria** (lista fechada) e **descrição em texto livre** (até 1.000 caracteres). A tela avisa para não escrever nome, telefone, e-mail, endereço nem o código de recuperação. **Risco:** a pessoa pode escrever dado pessoal mesmo assim.
- **Imagem da tela (opcional)**: escolhida pela pessoa, reduzida no aparelho (JPEG até ~150 KB). **Risco:** a imagem pode mostrar algo pessoal (por exemplo, uma notificação do celular, se for captura de tela do aparelho todo). A tela avisa para conferir antes.
- **Informações técnicas** (mostradas na tela antes do envio, e a pessoa pode desmarcar): versão do jogo, tela em que estava, família e versão do navegador (por exemplo "Chrome 126"), sistema (por exemplo "Android 14"), tipo de aparelho (celular/computador), tamanho da tela, idioma, fuso (diferença em minutos), estado da conexão, se está instalado como app, memória aproximada, mundo usado (real ou fictício), temporada e fase, quantidade de saves, últimas mensagens de erro (cortadas, sem endereços). **Só com a caixa marcada pela pessoa**: o identificador da liga online.
- Limites: 6 relatos por hora e 20 por dia por IP (contador temporário de 24 h), 300 por dia no servidor todo. Corpo máximo de 300 KB.
- Quem vê: **apenas os administradores** (painel protegido por segredo). Retenção: **90 dias**.

## 6. Quem vê o quê

| Quem | O que vê |
|---|---|
| Outros técnicos da mesma liga | Apelido, clube, resultados, escalação em partidas ao vivo, propostas e transferências entre técnicos, **histórico público de transferências da liga** (jogador, clubes, preço, data) |
| ADM da liga | O que os técnicos veem, mais as **denúncias de transferência** feitas por qualquer técnico |
| Administradores do jogo (painel) | Número de contas, ligas, técnicos; denúncias de apelidos e ligas (com identificador de quem denunciou); ligas escondidas; banidos; relatos de problema. **Não** veem os saves de ninguém (os saves ficam no bucket privado; o painel não os abre) nem o código de recuperação (nunca vai ao servidor) |
| Ninguém | Código de recuperação e chave secreta (só no aparelho). Saves da carreira solo |

Não há chat nem mensagem privada. O apelido (texto livre, filtrado contra palavrões e imitação) e o nome da liga (texto livre) são os únicos textos públicos escritos pelas pessoas.

## 7. Direitos do titular: como a pessoa vê e apaga os dados dela

Tudo dentro do jogo, em **Menu › Online › "Dados e conta"** (sem falar com ninguém):

| Direito | O que existe hoje | Lacunas |
|---|---|---|
| **Acesso e portabilidade** | "Exportar meus dados" gera um arquivo `.json` com identificador, datas, apelido e a lista dos saves na nuvem. O save de cada espaço pode ser exportado em arquivo à parte (menu inicial, botão Exportar) | **[NÃO IMPLEMENTADO]** a exportação **não** inclui as ligas de que a pessoa participa (clube, propostas, histórico) nem as denúncias que ela fez ou recebeu |
| **Eliminação** | "Apagar minha conta": sai de todas as ligas (cada clube volta ao computador; se era ADM, o técnico mais antigo assume), apaga os saves na nuvem, apaga as denúncias dela (feitas e recebidas) e o cadastro | O **banimento** (se houver) permanece. O que ela escreveu em relatos de problema anônimos **não pode ser localizado** (não há identificador): somem em 90 dias. O histórico de transferências de uma liga que continua existindo pode manter o apelido da época |
| **Correção** | Trocar o apelido (Online › Minha conta) | — |
| **Informação sobre tratamento** | Aviso de privacidade dentro do jogo (antes de criar a conta e na conta) | **[NÃO IMPLEMENTADO]** canal para dúvidas e reclamações (não há e-mail/formulário) |
| **Revogação do consentimento / oposição** | Desligar a nuvem por espaço; apagar a conta | — |
| **Dados em aparelhos** | Apagar os dados do site no navegador | — |

Prazo de resposta: imediato (autoatendimento). Incidentes de segurança: **[NÃO IMPLEMENTADO]** procedimento documentado de comunicação à ANPD e aos titulares (como não há contato dos titulares, a comunicação seria dentro do jogo).

## 8. Dados de terceiros: jogadores de futebol reais

O "mundo real" contém **10 mil jogadores reais e 370 clubes** com nome, apelido, data de nascimento (às vezes estimada), nacionalidade, posição, clube e **atributos de jogo (força, velocidade etc.) inventados pelo jogo a partir de fama pública**. Fontes: Wikipedia e Wikidata. Os escudos são gerados (não usamos os oficiais).

**[PERGUNTA]** (a) base legal para tratar dados de pessoas públicas disponíveis em fontes abertas (art. 7º, §§ 3º e 4º; legítimo interesse?); (b) os "atributos" são avaliações inventadas sobre pessoas reais: há risco de inexatidão ou de lesão à imagem? O jogo mostra aviso de que é independente e não tem ligação com clubes, federações ou atletas; (c) como o atleta pode pedir correção ou remoção (hoje não há canal, ver seção 7); (d) crianças e adolescentes jogadores das categorias de base reais (há atletas menores de 18 no pacote).

## 9. Crianças e adolescentes (o ponto mais delicado)

### 9.1 Situação de hoje
- O jogo **não pergunta idade** e não tem qualquer barreira. Futebol e jogos de gerenciamento atraem muitos jovens, e é razoável supor que **crianças (menores de 12) e adolescentes (12 a 17) jogarão**.
- **Riscos concretos** (já que não há chat nem anúncios): (1) **contato com desconhecidos** em ligas abertas (veem apelido, clube, e jogam e negociam entre si); (2) **texto livre público** (apelido e nome de liga) e **texto livre privado** (relato de problema) onde se pode expor dado pessoal; (3) conta criada sem ciência dos responsáveis; (4) dados do aparelho e IP tratados pelo Cloudflare.
- **O que reduz o risco hoje:** sem dados pessoais obrigatórios, sem localização, sem fotos de perfil, sem chat, sem mensagem privada, sem compras, sem anúncios, sem recomendação por perfil; apelido filtrado; denúncia por 3 pessoas; ADM pode remover participante; apagar tudo em um toque; a carreira solo é totalmente local.
- O aviso atual diz apenas: "O jogo não pede idade nem dados pessoais. Pais e responsáveis podem apagar a conta pelo mesmo botão." **Isso é fraco** e provavelmente insuficiente (**[PERGUNTA]**).

### 9.2 O que a lei parece exigir (meu entendimento, a confirmar)
- **LGPD, art. 14:** tratamento de dados de crianças e adolescentes no **melhor interesse** deles; de **crianças (até 12 anos incompletos)**, com **consentimento específico e em destaque dado por pelo menos um dos pais ou responsável legal**, e esforço razoável para verificá-lo; informações em linguagem simples e acessível, adequada ao entendimento da criança.
- **Enunciado nº 1/2023 da ANPD:** o tratamento de dados de crianças e adolescentes pode se apoiar em outras bases legais (arts. 7º e 11), desde que observado o melhor interesse. **[PERGUNTA]** confirmar.
- **ECA Digital (Lei nº 15.211/2025, em vigor desde março de 2026):** para serviços digitais **destinados ou provavelmente acessados por crianças e adolescentes**, entendo que exige, entre outros: mecanismo **proporcional de verificação de idade** (autodeclaração sozinha é considerada insuficiente para conteúdo de risco), configurações de privacidade protetivas por padrão, supervisão parental, vedação de **caixas de recompensa (loot boxes)** e de perfilamento para publicidade, e canais de denúncia. **[PERGUNTA]** o Meu Manager (gratuito, sem chat, sem compras, sem anúncios) está sujeito? Qual o nível de verificação de idade exigido num serviço de baixo risco?

### 9.3 Opções e o que cada uma muda no jogo

| | Opção | O que muda no jogo | Dados novos | Esforço | Risco que sobra |
|---|---|---|---|---|---|
| **A** | **Online só para 18+; menores só jogam solo.** Ao tentar criar conta, pergunta mês e ano de nascimento; menor de 18 vê "o modo online é para maiores de 18 anos; a carreira solo continua liberada" | Perde-se o público adolescente no online. A carreira solo e o relato de problema (sem conta) seguem para todos | Nenhum no servidor (a data de nascimento não precisa ser guardada: só decide na hora; fica no aparelho um "maior de 18: sim/não") | Pequeno (uma tela e uma trava na criação da conta e no código de convite) | Autodeclaração é burlável; o relato de problema anônimo continua aberto a menores |
| **B** | **Online a partir de 12 anos em "modo protegido" para 12–17; menores de 12 só solo; 18+ completo.** Modo protegido: **apelido gerado** (sem texto livre público; por exemplo "Técnico 4821"), **só ligas de amigos** (sem diretório de ligas abertas, sem estranhos), nome de liga escolhido de uma lista (sem texto livre), nuvem permitida, denúncia e "apagar conta" bem visíveis, aviso de privacidade em linguagem para adolescentes, tela "peça ajuda a um responsável" | Adolescente joga com amigos conhecidos; some o risco de estranhos e de texto livre público | **Uma marca "protegido" na conta no servidor** (1 bit; necessário para o servidor impedir o diretório e o apelido livre). É dado pessoal mínimo (faixa etária) | Médio (faixa etária na conta, trava no servidor, apelido gerado, nome de liga em lista, textos) | Autodeclaração burlável (um adolescente diz ser adulto); ligas de amigos ainda juntam pessoas que o adolescente conhece (por convite) |
| **C** | **Online para todos, com consentimento de responsável para menores de 12** (verificado) | Precisaria de e-mail/telefone do responsável, ou meio de pagamento simbólico, ou serviço de verificação | Dados pessoais do responsável (contra o princípio atual de não ter nenhum) | Grande e com custo; fere a proposta "sem e-mail, sem senha" | Complexidade e dados novos; improvável de valer a pena para um jogo gratuito |
| **D** | **Status quo reforçado**: sem barreira, mas avisos mais claros, termos de uso com idade mínima (13? 18?), orientação a responsáveis | Nada muda no jogo além de textos | Nenhum | Mínimo | **Alto**: sem controle, "provavelmente acessado por menores" |
| **E** | **A para o lançamento e B depois** (primeiro só 18+; abrir a adolescentes quando o modo protegido estiver pronto) | Lançamento sem adolescentes online; solo para todos | Nenhum no começo | Pequeno agora, médio depois | O menor risco jurídico no início; perde público no começo |

**Minha recomendação técnica (a ser validada pelo revisor):** **E** — lançar com a **opção A** e construir o **modo protegido da opção B** em seguida, porque o risco maior (estranhos + texto livre) some no modo protegido e a carreira solo, que é o coração do jogo, continua livre para todos. Qualquer opção exige, como mínimo: (1) aviso de privacidade em linguagem simples e adequado a jovens, (2) revisão do que o aviso diz sobre crianças, (3) o "Relatar problema" avisar claramente para **não escrever dados pessoais** (já avisa) e (4) decidir se o relato de problema anônimo fica aberto a menores (não há conta nem identificador; guardamos 90 dias).

**Decisão que preciso do revisor:** (i) qual opção; (ii) idade mínima para cada recurso (12? 13? 16? 18?); (iii) qual nível de verificação de idade basta; (iv) se a data de nascimento pode ficar só no aparelho; (v) texto do aviso para jovens.

## 10. Inventário de medidas de segurança (resumo)

- Conexões sempre por HTTPS (Cloudflare). Pedidos ao servidor **assinados** com a chave da conta (Ed25519), com carimbo de tempo e código de uso único: não há senha nem sessão para roubar.
- Limites de pedidos por pessoa e por IP; anti-robô no cadastro; corpo de pedido com teto; lista fechada de campos.
- Banco e arquivos **privados** (só o servidor acessa). Painel de moderação protegido por segredo longo, com limite contra tentativa de adivinhar; a página do painel trata o texto de usuários como texto (sem execução de código).
- Código de recuperação nunca vai ao servidor. **Fragilidade conhecida:** a chave e o código ficam **sem criptografia no aparelho** (quem tem acesso ao navegador da pessoa tem acesso à conta).
- Saves na nuvem **não têm criptografia própria** além da do provedor.
- Sem registros persistentes de requisições; contadores de IP apagados em até 24 horas.

## 11. Perguntas resumidas para o revisor

1. Quem é o controlador e é preciso encarregado e canal de contato? Qual canal mínimo (e-mail, formulário) para o titular?
2. Bases legais por finalidade (conta e ligas; nuvem; moderação; relato de problema; dados de jogadores reais).
3. Menores: opção, idades, verificação (seção 9).
4. Transferência internacional (Cloudflare) e o que dizer no aviso.
5. Retenções: está bem **12 meses sem uso** para apagar contas e saves (hoje desligada)? Prazo para ligas inativas? 90 dias para relatos? Banimentos permanecem?
6. Completar a **exportação** com ligas e denúncias? É exigido?
7. Procedimento de incidente (ANPD) e registro das operações de tratamento.
8. Dados dos jogadores reais (seção 8).
9. Termos de uso e política de moderação (hoje não há termos de uso formais).
10. O aviso atual (texto em `PrivacyNotice.tsx`) e os textos de convite do teste fechado (`docs/teste-fechado.md`) precisam de ajuste?

## 12. Anexo: onde conferir no código

| Assunto | Arquivo |
|---|---|
| Tabelas do banco | `server/migrations/0001_identities.sql`, `0002_leagues.sql`, `0003_moderation.sql`, `0004_problems.sql` |
| Identidade e código de recuperação | `src/online/identity.ts`, `recoveryCode.ts`, `src/store/identityStore.ts` |
| Saves na nuvem (apagar, exportar) | `src/online/cloudSave.ts`, `cloudSaveApi.ts` |
| Limites e contadores de IP | `src/online/rateLimit.ts`, `guard.ts`, `server/worker.ts` (classe `Guard`) |
| Denúncias, banimento, painel | `src/online/moderation.ts`, `server/admin.ts` |
| Relatar problema | `src/online/problemApi.ts`, `src/ui/techInfo.ts`, `src/ui/components/ReportProblem.tsx` |
| Aviso de privacidade | `src/ui/screens/online/PrivacyNotice.tsx` |
| Dados dos elencos reais | `data/pacote-real.json`, `docs/planilhas-reais.md`, tela de Créditos |
