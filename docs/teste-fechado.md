# Teste fechado do Meu Manager

Documento para **nós** (eu e os sócios) conduzirmos o teste com 50 a 100 amigos. Tem: o texto do convite, o "como testar", o que pedir de relato, como acompanhar uso e custo e o que fazer quando algo dá errado.

**Endereço do jogo (com o modo online liberado):** `https://antonionascim.github.io/meu-manager/?online=1`

O `?online=1` é o que mostra o cartão "Online" no menu; ele fica lembrado no aparelho depois da primeira vez. Sem ele o jogo abre só com a carreira solo.

---

## 1. Texto do convite (para mandar no WhatsApp)

> **Quer testar o meu jogo de técnico de futebol?** ⚽
>
> O **Meu Manager** é um jogo de gerenciamento (parecido com o Brasfoot, mas bem mais profundo): você escolhe um time, monta a escalação, define a tática e vê os jogos em campo. Dá para jogar sozinho ou numa **liga online com amigos**.
>
> É de graça, funciona no navegador do celular (pode instalar como app) e **não precisa de e-mail nem senha**.
>
> 👉 Abra: **https://antonionascim.github.io/meu-manager/?online=1**
>
> Estamos numa fase de teste fechado, então **vai ter erro**, e é isso que eu quero descobrir! Se algo travar ou parecer estranho, use o botão **"Relatar problema"** (no menu e dentro do jogo). Leva 1 minuto.
>
> Obrigado por ajudar! 🙏

*(Se o convidado for menor de 18 anos, veja a nota da seção 6.)*

---

## 2. Como testar (roteiro curto para os convidados)

> **Em 10 minutos:**
> 1. Abra o endereço no celular. Toque em **Novo jogo**, escolha o **mundo real** (ou fictício), um país, uma liga e um clube.
> 2. No painel do clube, toque em **Avançar** até a primeira partida. Veja o jogo em campo, mude a tática e faça uma troca.
> 3. Passe pelas abas **Elenco**, **Mercado** e **Finanças**.
>
> **Para testar o online (30 minutos, com amigos):**
> 1. No menu, **Online › Criar minha conta online**. Marque a faixa de idade (**18 anos ou mais**) e escolha um apelido. (O código de recuperação aparece depois; **guarde-o**.)
> 2. **Ligas online › Criar uma liga**. Escolha **Resultado direto** (mais rápido) ou **Assistir ao vivo**, e convide os amigos pelo **link ou código** de convite.
> 3. Cada um escolhe um clube. Quem criou toca em **Iniciar a liga**.
> 4. Cada um toca em **Abrir o jogo do clube**: é o mesmo jogo da carreira solo (Painel, Elenco, Tática, Treino, Base, Mercado, Tabela, Finanças), mas a liga é de todos. No lugar do botão Avançar há o **cartão da liga**: toquem em **Pronto** e o criador em **Avançar** (pela **Sala da liga**).
> 5. Experimentem comprar e vender jogadores de clubes da IA no **Mercado** e propostas entre vocês na aba **Técnicos**. Na rodada ao vivo, toquem em **Entrar na partida**: mudem a **velocidade** (1x a 8x), a tática e as trocas, e no intervalo toquem em **Voltar ao jogo**.
>
> **Se o celular travar, o jogo der erro ou algo parecer injusto ou estranho:** toque em **Relatar problema**, descreva o que você fez e, se puder, anexe um print da tela.

### O que queremos testar (para nós, nesta ordem)

1. **Instalar e abrir** em celulares simples (Android antigo, iPhone com Safari) e offline depois da primeira visita.
2. **Uma temporada inteira** da carreira solo (tempo, travamentos, salvar e carregar).
3. **Liga online de 4 a 20 pessoas**: criar, entrar por convite, Pronto/Avançar, partida ao vivo, lesão (o jogo para até escolher o reserva), mercado entre técnicos.
3b. **O jogo do clube na liga online (Fase 6C)**, roteiro abaixo (seção 2.1).
4. **Virada de temporada** numa liga online.
5. **Trocar de aparelho** com o código de recuperação.
6. **Denúncias** (apelido e liga) e o **painel** (nós).
7. **Custo**: a conta do Cloudflare durante o teste (seção 4).

### 2.1 Roteiro do jogo do clube na liga online (Fase 6C)

Para quem conduz o teste (nós), em duas pessoas ou mais, ligas de **Assistir ao vivo**:

1. **Abrir o jogo:** na sala da liga, **Abrir o jogo do clube**. Confira Painel, Elenco, Tática, Treino, Base, Mercado, Tabela e Finanças com as mesmas telas do solo. O Painel mostra o **cartão da liga** (próxima rodada no seu fuso, Pronto) e "Minha carreira".
2. **Ações do técnico:** mudar tática e escalação, treino coletivo e individual, promover jovem, ingresso e orçamento. Fechar e abrir o jogo de novo: tudo tem de continuar (o servidor guarda).
3. **Mercado:** buscar e propor a clube da IA, anunciar, vender a dois clubes diferentes em seguida, pedir verba, renovar contrato; na aba **Técnicos**, proposta entre técnicos, contraproposta e recusa. Jogador de clube de outro técnico não aceita proposta pela IA (mensagem diz para usar a aba Técnicos).
4. **Rodada ao vivo:** Pronto de todos, o criador avança; **Entrar na partida**. Testar: velocidade (1x, 2x, 4x, 8x), lesão (escolher o reserva; o jogo espera até 45 s), troca, mudança de tática, arrastar jogador, **intervalo** (cronômetro de 1 minuto, **Voltar ao jogo**). **Dois técnicos no mesmo jogo:** vale a velocidade mais lenta dos dois (aparece "valendo Nx") e o intervalo só termina quando os dois tocam ou o minuto acaba.
5. **Conexão:** durante a partida, desligar o Wi-Fi por alguns segundos e religar: a partida volta sozinha. Com o aparelho em modo avião ao abrir o jogo: abre com o último estado guardado, só para ler, com o aviso de sem conexão.
6. **Outro aparelho:** entrar com o código de recuperação e abrir o jogo: favoritos e escalações guardadas vêm da conta.
7. **Detalhe:** abrir a página do adversário e a ficha de um jogador de outro clube depois de uma rodada: a condição física tem de aparecer cansada (não 100%).
8. **Carreira:** "Minha carreira" mostra o clube atual, as temporadas e a campanha de hoje.

### 2.2 Item a observar: demissão com troca de clube

**Ainda não foi visto numa liga de verdade.** A diretoria demite o técnico (finanças muito negativas ou resultados muito abaixo da meta) depois de uma rodada: o clube volta para a IA, a vaga continua do técnico e aparece a tela **Você foi demitido** com os clubes livres da liga de reputação igual ou menor. O que observar: (a) se a demissão aparece na hora certa e não cedo demais (ajustar `BOARD` se necessário); (b) a tela aparece também para quem estava com o jogo aberto; (c) a lista de clubes livres faz sentido e **Assumir** abre o jogo do clube novo; (d) a carreira mostra "Demitido"; (e) o clube que ele perdeu segue bem com a IA; (f) ninguém fica preso sem clube se a lista vier vazia (hoje só dá para voltar ao menu e esperar). Está coberto por testes automáticos, mas não por um teste de ponta a ponta no navegador (não dá para forçar a demissão no servidor local).

---

## 3. Relatos de problema: como funcionam

O botão **"Relatar problema"** fica no **menu inicial**, no **painel do clube** e na **sala da liga**. O relato é **anônimo** (não exige conta, não grava IP). Leva: categoria, descrição (até 1.000 caracteres), imagem da tela (opcional, reduzida no aparelho) e as **informações técnicas** que a própria tela mostra antes de enviar (versão do jogo, tela em que estava, navegador e sistema em grandes famílias, tamanho da tela, últimas mensagens de erro etc.), que a pessoa pode desmarcar.

**Como ler:** abrir `https://meu-manager-api.meumanager.workers.dev/admin`, colar o segredo do painel (`ADMIN_TOKEN`) e ver **"Problemas relatados"**. Tocar em **Abrir** mostra o texto, os dados técnicos e a imagem; **Marcar como resolvido** tira da fila; **Apagar** remove. Os relatos somem sozinhos em **90 dias**.

**Como agir sobre um relato:** o campo `screen` diz onde a pessoa estava; `errors` traz as últimas mensagens de erro; `build` é a data da versão (relatos de versões antigas podem já estar corrigidos). Como é anônimo, **não dá para responder**: peça nos convites que a pessoa conte tudo no relato.

---

## 4. Acompanhar uso e custo durante o teste

### 4.1 No painel `/admin` (mesmo endereço e segredo)
A seção **"Uso e custo do teste"** mostra, em tempo real:
- **Ativos em 24 h / 7 dias / 30 dias** (contas que abriram o jogo online; a "última visita" é gravada no máximo 1 vez por hora).
- **Ligas rodando** e **técnicos nelas**.
- **Contas novas, ligas novas e relatos por dia** (últimos 14 dias).
- **Estimativa do mês** (pedidos, GB-s e custo em dólar): calculada pelo modelo da B9 com as ligas e técnicos de agora. **É uma estimativa**, não a conta; serve para ver a tendência.
- **Problemas abertos** e as seções de moderação (denúncias abertas, ligas escondidas, banidos).

### 4.2 No Cloudflare (a conta de verdade)
Entrar em `dash.cloudflare.com` com a conta do projeto:
1. **Faturamento › Uso** (Billing › Usage): o custo do mês até agora e a previsão. Esperado no teste fechado: **o plano de US$ 5**, sem excedente.
2. **Workers e Pages › meu-manager-api › Métricas**: pedidos, erros e tempo de CPU. Erros 5xx acima de ~1% merecem investigação.
3. **Durable Objects**: pedidos e **duração (GB-s)** (o que mais pesa quando as ligas têm gente conectada) e linhas gravadas no SQLite.
4. **D1 › meu-manager** (ou `wrangler d1 info`): linhas lidas/gravadas e tamanho.
5. **R2**: tamanho dos buckets `meu-manager-saves` e `meu-manager-pacotes`.

### 4.3 Alerta de gasto (fazer **antes** de convidar)
**Faturamento › Notificações › Alerta de cobrança baseada em uso**: criar alerta em **US$ 10** e outro em **US$ 20**, com o e-mail de um sócio. Se chegar um alerta, o primeiro passo é abrir o Cloudflare e ver qual produto subiu.

### 4.4 Rotina sugerida
- **Dia 1 e 2:** olhar o painel e o Cloudflare a cada poucas horas (maior risco de erro novo).
- **Depois:** uma vez por dia. Anotar numa planilha: ativos 7 dias, ligas rodando, custo previsto, relatos abertos.
- **Meta do teste:** custo do mês ≤ **US$ 5 a 7**; nenhum erro 5xx recorrente; nenhuma liga travada por mais de um evento; relatos críticos resolvidos em 48 h.
- **No fim:** comparar o custo real com a estimativa do painel e ajustar `src/online/rateLimit.ts` e `tools/loadLeague.ts` (os limites finais só se confirmam aqui).

### 4.5 Se algo der errado
| Sintoma | O que fazer |
|---|---|
| Custo subindo rápido | Ver qual produto no Cloudflare. Se for Durable Objects, listar as ligas rodando (painel) e, se preciso, **fechar** a liga suspeita pelo painel |
| Gente sem conseguir criar conta (erro 429) | O limite por IP de criação de contas é 30 por dia: se muitos convidados usam a mesma rede, subir o valor em `rateLimit.ts` e publicar |
| Apelido ofensivo / liga com nome ruim | Painel: **Trocar apelido** ou **Fechar** a liga; banir se for reincidente |
| Jogo travando para todos | Conferir o último deploy; `wrangler rollback` volta para a versão anterior do Worker |
| Perdi o segredo do painel | Gerar outro e trocar o `ADMIN_TOKEN` no Worker (o painel só abre com ele) |

---

## 5. Antes de convidar (lista para nós)

- [ ] Publicar a versão com o "Relatar problema" e o painel de uso (migração `0004` no D1 remoto + deploy do Worker + site no GitHub Pages).
- [ ] Alerta de gasto em US$ 10 e US$ 20 criado.
- [ ] Testar o botão "Relatar problema" no **celular** (envio com imagem) e abrir o relato no painel.
- [ ] Um sócio testa **criar liga, convidar e jogar uma rodada** com outro aparelho.
- [ ] Confirmar com o revisor a **idade de liberação total** (16 ou 18; ver `docs/lgpd-para-revisor.md`, seção 9.4); no teste, **convidar só maiores de 18**. Na criação da conta o convidado marca "18 anos ou mais".
- [ ] Combinar quem olha o painel em cada dia.

---

## 6. Nota sobre menores de idade no teste fechado

O jogo já tem o **modo protegido** (12 a 15 anos) e pergunta a faixa de idade ao criar a conta online (`docs/lgpd-para-revisor.md`, seção 9.4), mas a idade de liberação total (16 ou 18) ainda **precisa ser confirmada pelo revisor de LGPD**. Por isso, **no teste fechado convide apenas maiores de 18 anos para o modo online**. A carreira solo (sem conta) pode ser testada por qualquer pessoa. Acrescente no convite, se quiser: *"O modo online do teste é só para maiores de 18 anos."*
