`# Fase 6C: o online como o MESMO jogo do offline (proposta, 07/11/2026)
`**Status: proposta aprovada com as decisões da seção 6; a C1 (medição) está feita e seus números estão na seção 8. Nada foi publicado.** Pedido dos sócios depois de jogar o online: as telas online (`src/ui/screens/online/leagues/`, ~3,4 mil linhas) são bem mais simples que as do jogo solo. A decisão é que o online seja o mesmo jogo, com as mesmas telas e tudo o que já existe (painel, barra de baixo, tática e escalação, treino, base, finanças, histórico, tabela, copas, mercado completo, partida com campo 2D). A liga online tem todos os clubes da IA funcionando; só alguns clubes são de técnicos humanos. Além disso há a sala da liga (técnicos, Pronto, Avançar, Pausa, ritmo, convite).
`Números marcados com **(estimativa)** não foram medidos. A primeira parte da divisão do trabalho (C1) existe para medi-los antes de decidir o tamanho do resto.
---
## 0. Resumo
`1. **Como reaproveitar as telas (seção 1).** As telas do solo leem um `Game` (`useGame()`) e mudam o jogo com funções puras de `store/game.ts` (`updateGame(g => setUserTactic(g, t))`, 21 chamadas em 14 arquivos). A proposta é o aparelho manter um **espelho do mundo da liga, no mesmo formato do `Game`**, e cada ação do técnico virar um **comando** que o servidor valida rodando a mesma função pura sobre o mundo oficial. O aparelho aplica a mesma função na hora (resposta imediata) e, quando o servidor responde, a resposta oficial vale. As telas quase não mudam: trocam `updateGame(...)` por um `perform(ação)` que faz as duas coisas.
`2. **O espelho não é o mundo inteiro fresco o tempo todo** (seção 1.3). O treino muda todos os jogadores a cada avanço, então mandar o mundo inteiro a cada rodada seria pesado no celular. O espelho tem **escopo**: o que é do técnico e da competição dele chega completo e atualizado; o resto do mundo chega num **índice enxuto** que alimenta a busca e as listas e é atualizado por diferenças, e o detalhe de qualquer jogador ou clube vem **ao tocar**.
`3. **O que obrigatoriamente muda (seção 2):** quem avança o tempo (só o ADM, mais o Pronto), a velocidade da partida (cada técnico no seu jogo; dois humanos juntos usam a mais lenta), o mercado (relógio e janela são da liga; propostas entre técnicos têm prazo e taxa reservada), as informações ocultas (potencial e atributos ocultos nunca vão para o aparelho) e o fim de carreira (demissão).
`4. **Velocidade individual e custo (seção 3):** o número de mensagens por partida **não depende da velocidade** (um quadro por minuto de jogo); só o tempo muda. O objeto da liga fica acordado até a partida mais lenta acabar. Como o 1x online passou a ser o 1x do offline (700 ms por minuto de jogo, decisão da seção 6), o evento dura **~1 a 4 minutos em vez de 6 a 20**, então o custo de partida ao vivo **cai muito** em relação ao de hoje. O que sobe um pouco é o número de despertares do alarme, que se controla com uma grade de 1 s.
`5. **Telas online simplificadas de hoje (seção 4):** a **sala da liga**, a criação/entrada em liga, o Pronto/Avançar/Pausa, o convite e a moderação **ficam**. As telas de jogo (Meu clube, mercado simples, copas simples, partida ao vivo online) **são trocadas pelas do solo** e depois removidas, uma de cada vez, só quando a equivalente do solo cobrir tudo o que ela faz.
`6. **Divisão em partes (seção 5):** C1 medir, C2 comandos e espelho, C3 painel/elenco/tática/tabela, C4 mercado e finanças, C5 partida, C6 acabamentos e limpeza. Cada uma entrega algo jogável.
`**Decisões dos sócios** (07/11/2026) na seção 6: 1x online = 1x offline (700 ms por minuto de jogo), intervalo de até 1 minuto, técnico demitido pode trocar de clube livre, índice com os atributos de todos se o tráfego couber, sem internet só leitura. **Números medidos da C1** na seção 8.
---
## 1. Como reaproveitar as telas do offline no online
### 1.1 O que existe hoje (por que não é trivial)
- A interface é escrita sobre `Game` (`src/store/game.ts`): `Game.season` é o `SeasonState` do mundo inteiro, mais coisas do jogador (`userTeamId`, `pendingUserMatch`, `favorites`, `savedLineups`, `coach`, `seasonLog`, `archive`, `dismissal`...). 25 arquivos da interface importam de `store/game`; 14 mudam o jogo com `updateGame`.
- No solo, o aparelho **é** o servidor: o mundo vive na memória, o motor roda lá e o `autosave` grava no IndexedDB.
- No online o mundo oficial vive no Durable Object `LeagueRoom` (SQLite em blocos, 10,6 mil linhas por temporada, seção 16 da proposta da Fase 6). O aparelho hoje só recebe **resumos** (`leagueView`, `clubView`, `tradeBody`...), um por tela. Foi por isso que cada tela online virou uma tela nova e mais simples.
- O motor já separa o que é puro (`src/engine`, regras 1 a 4 do `CLAUDE.md`). Quase toda ação do técnico já é uma função pura `(estado, argumentos) -> estado` (por exemplo `setTeamTactic`, `startIndividualTraining`, `makeOffer`, `respondToOffer`, `renewPlayer`, `promoteYouth`). Isso é o que torna a proposta viável.
### 1.2 As opções
`**Opção A: espelho completo atualizado pelo servidor.** O aparelho guarda uma cópia do `SeasonState` inteiro. O servidor manda, a cada mudança, os pedaços (os mesmos do save: `planSeasonParts`, por liga e grupo de rodadas, com hash SHA-256) que mudaram. As telas rodam sem alteração sobre a cópia.
- Tráfego: **inicial** o mundo real inteiro, ~**3 a 4 MB comprimidos (estimativa**; o pacote de dados tem 0,71 MB, um save de um clube 1 a 2,5 MB). **Por avanço**: o treino altera os atributos de todos os jogadores, então quase todos os pedaços de jogadores mudam (~6 MB de texto, **~1 a 1,5 MB comprimidos, estimativa**). Com ~3 eventos por semana de liga, isso passa de **1 GB por mês por jogador**. Inviável em dados móveis.
- Custo no servidor: baixo em CPU (já serializa os blocos sujos), mas lê e manda milhares de linhas por avanço, para cada técnico conectado.
- Risco: baixo para as telas (nada muda), alto para o celular (dados, memória: o espelho completo tem ~50 MB vivos, o mesmo do servidor) e para a **trapaça**: o espelho completo contém potencial e atributos ocultos de todos.
`**Opção B: aparelho fino (telas falam com a API).** Cada tela pede ao servidor o que precisa (como as telas online de hoje) e nenhuma regra roda no aparelho.
- Tráfego: o menor. Custo: sobe com cada toque (um pedido por filtro de busca, por exemplo), e a busca com "Ver N jogadores" ao arrastar o controle de faixa deixa de ser instantânea.
- Risco: é reescrever todas as telas contra uma API (o que fizemos 3 vezes e deu telas simples). Duplica a lógica de exibição e a manutenção: toda tela nova do solo exigiria uma versão online. **Descartada** pelo próprio pedido (as mesmas telas).
`**Opção C: sincronização por simulação (os dois lados rodam o mesmo avanço).** O aparelho recebe só a lista de comandos de todos e refaz o avanço sozinho, como no registro de reprodução das partidas (B7).
- Tráfego: mínimo. Mas a simulação do mundo depende de funções como `Math.exp` e de ordem de operações; **navegadores diferentes podem divergir em casas decimais**, e uma divergência pequena vira mundos diferentes. Gasta bateria (avanço típico 160 ms, virada 5 s no PC) e abre a porta para trapaça (o aparelho tem tudo). **Descartada.**
`**Opção D (recomendada): espelho com escopo, comandos validados e detalhe sob demanda.** É a opção A com três mudanças: (1) o espelho não é o mundo inteiro fresco; (2) a ação vai ao servidor como comando e roda também no aparelho; (3) dados ocultos nunca saem do servidor.
### 1.3 A opção D em detalhe
`**O que o aparelho guarda (o "mundo da liga" no formato do `Game`).** Um adaptador `leagueGame(espelho): Game` monta o objeto que as telas já conhecem. `userTeamId` é o clube do técnico na liga. `season` é um `SeasonState` **parcial** com:
| Camada | Conteúdo | Quando atualiza | Tamanho (estimativa) |
|---|---|---|---|
| **1. Meu clube** | time, elenco, base, finanças, tática, treino, contratos, propostas, anúncios, histórico de mercado, extrato, diretoria | a cada comando seu e a cada evento da liga | ~100 a 300 KB (texto), poucos KB por diferença |
| **2. Minhas competições** | partidas, classificação (calculada no aparelho), artilharia/assistências/cartões, copas do clube, resultados dos outros jogos da data | a cada evento (rodada) | uma liga: ~400 partidas; algumas dezenas de KB por rodada |
| **3. Índice do mundo** | para todos os jogadores e clubes: o que a busca, as listas e a Tabela mostram, **com os atributos visíveis de todos os jogadores** (decisão 4 da seção 6, confirmada pela C1), sem os ocultos, com atributos inteiros e a condição reduzida a lesão e suspensão | por diferenças **em grupos de campos** (atributos, estatísticas, condição, resto), só o que mudou | **medido (seção 8): inicial ~1,1 MB comprimido; ~90 KB por dia do mundo, ~240 KB a cada 3 dias** |
| **4. Detalhe** | atributos de qualquer jogador, elenco e tática de qualquer clube, histórico de qualquer liga | ao tocar, com cache por revisão (`rev`) | 3 a 15 KB por jogador/clube |
`Por que assim: a regra de ouro do desenho é que **a tela nunca está errada sobre o que importa para a decisão**. O que o técnico decide (comprar, contratar, escalar) usa a camada 1 e 3 (frescas); o servidor, de qualquer jeito, valida tudo com os dados oficiais, então uma força defasada em 1 ponto não vira regra errada, só um número que sobe no refresh seguinte.
`**Comandos (a ação do técnico).**
- Cada função de `store/game.ts` que o técnico usa é dividida em duas: um **núcleo puro** sobre o `SeasonState` (`aplicarTática(season, timeId, tática)`, já quase todas existem em `engine/`) e a casca do `Game` (que só embrulha). O servidor roda o mesmo núcleo.
- Existe uma união de comandos (`LeagueCommand`: `tactic`, `training-plan`, `individual-training`, `offer`, `respond-offer`, `renew`, `release`, `list-player`, `precontract`, `promote-youth`, `ticket-price`, `salary-budget`, `request-funds`, `favorite`, `saved-lineup`...). Dá para reaproveitar os que já existem na API online (`applyClubAction`, `makeAiOffer`, `respondTrade`...): eles passam a ser o mesmo comando, sem tela nova.
- **Resposta imediata:** o aparelho aplica o núcleo no espelho e a tela muda na hora. O comando segue assinado (a assinatura da B2) para `POST /api/leagues/:id/command` com o `rev` que o aparelho conhece. O servidor responde com as **linhas oficiais que mudaram** (o clube, o resultado do comando) e o novo `rev`. Se o oficial for diferente do local (outro técnico fez uma proposta no mesmo jogador antes, o prazo passou, a janela fechou), **o oficial vence**, a tela se corrige e mostra o motivo (já existem textos de recusa: `LIVE_REJECT_LABELS`, razões do mercado).
- Comandos de efeito lento (mercado entre técnicos, propostas à IA) não esperam resposta local: mostram "Enviado" e atualizam pelo servidor.
- **Aleatoriedade:** as respostas da IA e as lesões usam a semente de cada dia (regra 2 do `CLAUDE.md`), então o núcleo local e o oficial dão o mesmo resultado; o oficial é quem conta.
`**Atualização do espelho.**
- Sempre que a liga muda (evento, comando de outro técnico que me afeta, janela), o servidor manda um aviso pequeno por WebSocket (`{rev, mudou: [camadas]}`). O aparelho pede as diferenças desde o seu `rev`: o servidor guarda, por revisão, a lista de linhas alteradas (cada bloco já sabe se mudou) e o aparelho recebe **só as linhas da camada 1, 2 e 3 que mudaram**. Se o aparelho está muito atrás (mais de ~20 revisões, ou trocou de dispositivo), baixa a camada de novo (os pedaços têm hash, como no save da nuvem: reaproveita o que já tem).
- O WebSocket que a partida ao vivo usa (B8.5) passa a ser **o mesmo canal** da liga, aberto enquanto a pessoa está no jogo (e hibernando no servidor: a mensagem de aviso é a única que acorda o aparelho).
- Offline-first parcial: sem internet o técnico vê o espelho (leitura), mas os comandos ficam parados com um aviso. Não há fila de comandos para mais tarde (o relógio da liga andou).
`**Dados ocultos (anti-trapaça).**
- O servidor nunca manda `potential`, `consistency`, `injuryProneness`, `professionalism` nem a semente interna. Manda a "visão pública" do jogador: atributos visíveis, `potentialStars` e `potentialRange` já calculados (o erro estável da faixa continua por jogador e idade, calculado no servidor).
- As telas que chamam `potentialStars(player)` / `potentialRange(player)` passam a ler esses campos prontos quando o jogador vem de uma liga online (um acesso por função, `publicPotential(player)`; no solo continua calculando).
- Isto exige uma pequena auditoria do código da interface (procurar tudo que lê campos ocultos). É a parte mais perigosa para a segurança e fica na C2.
`**Preferências do técnico.** `favorites` e `savedLineups` ficam **na conta, por liga** (tabela da liga no D1 ou campo da sala): sobrevivem à troca de aparelho; `coach` e `seasonLog` do técnico vêm do servidor.
`**Resumo do que as telas passam a usar:**
- `useGame()` continua existindo e devolve o `Game` do espelho (no solo, o do jogo salvo). Uma bandeira `game.online?: { leagueId, rev, ... }` liga os poucos comportamentos diferentes.
- `updateGame(g => fn(g, ...))` nos 14 arquivos vira `perform(comando)`; no solo, `perform` faz exatamente o que fazia (`updateGame(fn)`), então **o solo não muda e os testes dele continuam valendo** (`soloUnchanged`, `matchGolden`).
### 1.4 Comparação resumida
| | A: espelho completo | B: aparelho fino | C: simulação nos dois lados | **D: espelho com escopo** |
|---|---|---|---|---|
| Telas do solo reaproveitadas | todas | nenhuma (reescrever) | todas | **todas, com 14 arquivos tocados** |
| Download inicial | ~3 a 4 MB (est.) | ~0 | ~3 a 4 MB (est.) | **~0,5 a 1 MB** (camadas 1 a 3) |
| Por rodada | ~1 a 1,5 MB (est.) | ~0 | poucos KB | **~50 a 150 KB (est.)** |
| Busca do mercado com filtros instantâneos | sim | não (pedidos) | sim | **sim (sobre o índice)** |
| Custo no servidor | leitura de muitos blocos por técnico | um pedido por toque | mínimo | **linhas alteradas por rodada, por técnico** |
| Risco principal | dados e memória do celular; vaza oculto | duplicar telas | divergência numérica; trapaça | **o espelho parcial: código que assume jogador completo** |
| Trapaça por informação | alta | baixa | alta | **baixa (oculto fica no servidor)** |
`**O risco da D** é código do solo que lê atributos de qualquer jogador do mundo. A solução é o índice ter o **mesmo tipo `Player`** (atributos visíveis incluídos para quem está no índice? ver a pergunta abaixo) e a camada 4 trazer o que faltar ao tocar. Um teste de contrato (C2) abre cada tela com um espelho parcial e falha se alguma lê o que não veio.
`**Decisão depois da C1 (seção 8):** o índice leva os atributos visíveis de **todos** os jogadores, **mandados por diferenças em grupos de campos** (a condição física e a moral dos outros clubes **não** vão no índice, só ao tocar). O `Player` do espelho fica completo para a tela (sem os ocultos), e a camada 4 só traz o que falta de clubes (tática, finanças públicas) e a condição.
---
## 2. O que obrigatoriamente fica diferente no online, e como mostrar
| # | Diferença | Por quê | Como aparece nas telas |
|---|---|---|---|
| 1 | **Quem avança o tempo.** No solo o botão Avançar do painel pula até o próximo evento. No online só o **ADM** avança, e só depois de todos darem **Pronto**; sem isso, o tempo anda sozinho no ritmo da liga (Calmo, Normal, Rápido, Bem rápido). | O mundo é de todos; ninguém pode esperar nem acelerar o outro (seções 24 e 18 da Fase 6). | O botão grande do painel deixa de ser "Avançar" e vira o **cartão da liga**: "Próxima rodada sáb 14h (em 3 h)", botão **Pronto** (e quem já está pronto) e, para o ADM, **Avançar** (com confirmação) e **Pausar/Retomar**. A data do cabeçalho é a **data da liga**, com um ícone de relógio. O Treino, a janela e o mercado continuam andando com ela; textos como "faltam 12 dias" passam a mostrar também a hora real aproximada. |
| 2 | **Velocidade da partida.** Cada técnico escolhe a velocidade do **seu** jogo (1x a 8x). Dois humanos no mesmo jogo: vale a **mais lenta** das duas escolhas. Quem termina vê o resultado e espera. A próxima rodada só começa quando todas as partidas terminam. | A partida é do servidor (a mesma para os dois lados); só o ritmo de exibição é pessoal. | O mesmo botão de velocidade da tela de partida (1x, 2x, 4x, 8x). Num jogo entre humanos, aparece um aviso pequeno: "Velocidade do jogo: 2x (o adversário escolheu 2x)", e o botão mostra "a sua: 4x, valendo 2x". Ao terminar: "Fim de jogo. Esperando as outras partidas da rodada (3 de 10 em andamento)". |
| 3 | **Sem pausa pessoal nem "Ir ao fim" que adianta o jogo dos outros.** | O relógio do jogo é do servidor. | Pausar e Continuar da tela de partida somem; só o ADM pausa a liga. "Ir ao fim" vira **"Resultado direto"** (pula a animação, não o jogo dos outros): o aparelho avisa ao servidor que não quer assistir (já existe como "resultado direto"). Com o 1x em 700 ms por minuto a partida inteira dura ~1 a 2 min no 1x, então a falta de pausa pesa pouco. |
| 4 | **Mercado: relógio e janela são da liga.** A janela de cada região segue a data da liga. Propostas à IA são respondidas quando a **liga passa pela data**. Propostas entre técnicos humanos têm **taxa reservada, prazo de 48 h (24 h por contraproposta, parado na pausa), denúncia e limites anti-laranja** (`LEAGUE_TRADE`). | Dois humanos de verdade negociam: não dá para responder na hora, e o prazo não pode ser burlado. | A aba **Propostas** do Mercado do solo ganha as propostas dos técnicos (um selo "Técnico" no clube) com o cronômetro; o formulário de negociação mostra "o clube é de um técnico: a resposta pode levar até 48 h" e os limites ("faltam 1 negócio com este clube nesta janela"). A aba Histórico mostra o histórico público da liga. |
| 5 | **Informação oculta.** Potencial real, consistência, propensão a lesão e profissionalismo não existem no aparelho. | Evita ler o dado oculto pelo navegador (seção 1.3). | Nada muda visualmente: as estrelas e a faixa de potencial (que já são estimativas no solo) continuam iguais. |
| 6 | **Salvar/carregar e atalhos de desenvolvimento.** A liga é do servidor. | Não há save local da liga (a nuvem é espelho do solo, B4). | Sem Salvar, Exportar, Importar nem espaços na liga. O "Novo jogo" do menu continua só para o solo. |
| 7 | **Demissão e Carreira.** | No solo, demissão acaba o jogo. No online o técnico perde o clube, não a conta. **Decidido:** o clube passa para a IA e a vaga volta à liga. | A tela Demitido vira "A diretoria te demitiu. O clube passa para a IA e a vaga volta à liga" e oferece **escolher outro clube livre da mesma liga, de nível parecido ou menor** (reputação igual ou menor que a do clube que perdeu; reaproveita as regras de vaga da B8.3 e da ausência). A aba Carreira do online mostra **só o histórico do técnico** (clubes, temporadas, títulos); as propostas de emprego do solo não existem no online. |
| 8 | **Anti-dinastia e IA com os clubes humanos.** | Já tratado na B8.7: virada de temporada protege clubes humanos; o freio de dinastia não atinge técnicos ativos. | Sem mudança de tela. |
| 9 | **Intervalo da partida.** No solo o jogo para no intervalo até o técnico continuar. No online o jogo é do servidor. | Um técnico lento não pode segurar os outros jogos da rodada. **Decidido:** até **1 minuto** de intervalo, que termina antes se o técnico tocar em **"Voltar ao jogo"**; com dois humanos, o jogo volta quando **os dois** tocam ou o tempo acaba. | Cronômetro regressivo no intervalo, botão "Voltar ao jogo" e, em jogo de dois humanos, "Esperando o adversário" depois do seu toque. O intervalo vale 1 minuto real em qualquer velocidade. |
| 10 | **Lesão durante o jogo.** | Já existe (seção 31): o jogo para até `INJURY_WAIT_MS`. | Igual ao solo: a aba Trocas abre; o aviso mostra a espera. |
`**Resumo de interface.** Uma única faixa fina no topo ("Liga Tal · Normal · sáb 14h · Pronto") liga o jogo à sala da liga em qualquer tela. O resto do jogo é o do solo, com os poucos comportamentos acima trocados por uma bandeira `online` no `Game`.
---
## 3. O efeito da velocidade individual no custo do servidor
### 3.1 Como funciona hoje e como fica
`Hoje todas as partidas dos técnicos de um evento andam **juntas**, um minuto por vez, no mesmo relógio (`liveMinuteMs(ritmo)`: no Normal 10 s por minuto, 15 min por partida; Calmo 20, Rápido 10, Bem rápido 6). O alarme do Durable Object acorda uma vez por minuto de jogo.
`**Decisão dos sócios (seção 6):** o 1x online é o 1x do offline, **700 ms por minuto de jogo** (`MINUTE_MS` em `Match.tsx`), com as mesmas velocidades 1x, 2x, 4x e 8x. O ritmo da liga (Calmo a Bem rápido) continua mandando em **quantos dias de jogo passam por dia real** e nos horários dos eventos, mas **deixa de mandar na duração da partida** (`LIVE_MATCH_MS` e `liveMinuteMs` saem do caminho da partida ao vivo).
`Com velocidade individual, **cada partida tem o seu próprio relógio**: `duração do minuto = 700 ms ÷ velocidade`, com a velocidade da partida = a **mais lenta** entre os técnicos humanos **conectados** naquele jogo (se um cai, o time vai para a IA e vale a velocidade de quem ficou; nenhum humano conectado: roda no 8x, ou resultado direto). A velocidade não entra no registro de reprodução (ela não muda o resultado; os comandos já guardam o minuto de jogo). Trocar de velocidade durante o jogo vale do minuto seguinte.
`**As câmeras lentas contam no relógio.** No solo o relógio espera as câmeras lentas (`HOLD_MS`: finalização 2 s, gol 3 s, bola parada +1 s, cartão 2 s; no 4x e 8x elas são encurtadas por `slowFor`/`holdFor`). No online o relógio de cada partida é do servidor, então o servidor precisa **calcular a mesma espera** (hoje a regra mora em `ui/screens/match/pitchModel.ts`; na C5 ela vai para um módulo puro que a tela e o servidor importam). O tempo total fica então ~63 s + as esperas, dividido pela velocidade.
`Duração real de uma partida de 90 minutos (700 ms por minuto; as esperas variam com os lances; **estimativa**):
| Velocidade | Só os minutos | Com as câmeras lentas (estimativa) |
|---|---|---|
| 1x | 63 s | ~1,8 a 2,3 min |
| 2x | 32 s | ~1,0 a 1,3 min |
| 4x | 16 s | ~35 a 50 s |
| 8x | 8 s | ~20 a 30 s |
`Mais o intervalo (até 1 min). Um evento (rodada) com partidas humanas dura então de ~1 a ~4 minutos reais, contra 6 a 20 de hoje. Consequência para a reação: o comando do técnico entra no minuto seguinte (mais ~1 s de rede), então no 8x ele vale uns 2 a 3 minutos de jogo depois do toque; no 1x, um a dois. O limite de espera de um comando ("vencem em 2 min") passa a contar **minutos de jogo**, não tempo real, para não cair no 8x.
### 3.2 O que muda no custo
| Item | Hoje | Com velocidade individual | Comentário |
|---|---|---|---|
| **Tempo do objeto acordado por evento** | 6 a 20 min (a duração do ritmo) | = a da **partida mais lenta**: **~2 a 4 min no pior caso** (todos no 1x, com o intervalo de 1 min) | **Cai de 3 a 8 vezes.** É o tempo ativo que mais pesa na conta (GB-s, seção 32.3); a projeção da 32.3 (~US$ 7,35 por mês com 500 ligas cheias) usava sessões de 10 min e deve ficar mais barata (a C5 refaz a conta). |
| **Mensagens por partida** | 90 quadros | 90 quadros | Um quadro por minuto de jogo **independe da velocidade**: só o ritmo muda (no 8x, ~0,8 quadro por segundo). Cada 20 mensagens do WebSocket contam como 1 pedido, o que não pesa. |
| **Despertares do alarme** | 90 por evento, todos os jogos juntos | até 90 **por partida** se os relógios ficarem fora de sincronia, e a cada 0,09 a 0,7 s | Cada despertar conta como um pedido. **Solução:** o alarme corre numa **grade de 1 s** (acorda no máximo uma vez por segundo e roda todas as partidas que venceram naquele segundo; no 8x um despertar roda ~1 minuto de jogo de cada partida). O teto é a duração do evento em segundos (~120 a 250 por evento), independente do número de jogos: parecido com os 90 de hoje. |
| **CPU por despertar** | 1 minuto de jogo de todas as partidas | só as partidas vencidas naquele segundo | O total de minutos simulados é o mesmo; a CPU total não muda. |
| **Armazenamento e gravação** | replays e blocos | iguais | Os mesmos 90 minutos por partida; o replay cabe nos mesmos KB. |
| **Memória** | ~1 MB por partida em andamento | igual | Mesmo número de partidas; a liga cheia continua com folga de 2 a 3 vezes. |
| **Reconexão e cuidados** | | cada reconexão traz o minuto atual e a velocidade válida | A velocidade escolhida fica na sala (por técnico e partida); sobrevive a reinício do objeto. |
`**Cuidados de jogo (não de custo):** (1) quem escolhe 8x contra a IA tem menos tempo para mandar uma troca: é escolha dele (e o 1x do offline já é rápido); (2) em jogo de dois humanos o "mais lento" garante que ninguém seja prejudicado pela escolha do outro; (3) as câmeras lentas (gols, finalizações, `HOLD_MS`) entram no relógio do servidor pela mesma fórmula do solo (`slowFor`/`holdFor`), movida para um módulo puro compartilhado; no 4x e 8x elas encolhem como no solo.
### 3.3 O que a C5 mede
``tools/loadLeague.ts` ganha uma opção `--speeds` com 20 técnicos sorteando velocidades: tempo de objeto ativo por evento, despertares do alarme (com e sem grade de 1 s), CPU e mensagens. A projeção de custo da seção 32.3 é atualizada com esses números.
---
## 4. O que fazer com as telas online simplificadas de hoje
| Tela atual | Destino |
|---|---|
| `LeaguesHub`, `CreateLeague`, `OpenLeagues`, `JoinByCode`, `ClubPicker`, `LeagueRoomScreen`, `ReportSheet` e o convite | **Ficam.** São a sala da liga e a entrada: não existem no solo. A tela de escolha do clube pode ganhar o mesmo cartão de clube da tela de Novo jogo (escudo, reputação, elenco) por estar quase igual. |
| `LeagueRunning` (próxima rodada, Pronto, Avançar, Pausa, ritmo, sugestões de ausência) | **Fica**, mas vira o **cartão da liga** no topo do Painel e a faixa fina em todas as telas; a tela inteira continua acessível a partir dele. |
| `ClubCard` (Meu clube) | **Removida** depois que Elenco, Base, Treino e Contratos do solo forem ligados à liga (C3/C4). |
| `LeagueMarket`, `LeagueMarketAi`, `LeagueMarketSell` | **Removidas** depois da C4: o Mercado do solo (Buscar, Favoritos, Listas, Livres, Pré-contrato, Propostas, Histórico, Contratos) cobre a compra, o empréstimo, os anúncios, a venda à IA e o pré-contrato. As regras de técnico para técnico (`trade.ts`, `aimarket.ts`, `sellmarket.ts`) **continuam no servidor** e passam a ser acionadas pelos comandos `offer`/`respond-offer` do espelho. |
| `CupsCard` | **Removida** na C3: Tabela › Copas e o caminho no painel já fazem isso. |
| `LiveMatchOnline` | **Removida** na C5: a tela de partida do solo (`Match.tsx`, 689 linhas) passa a aceitar dois tipos de origem. |
`**Regra de transição:** nenhuma tela online é apagada antes de a equivalente do solo cobrir **tudo** o que ela faz, e a troca vale para quem já tem liga em andamento (não existe formato de save a migrar, porque o estado oficial está no servidor). Os testes ponta a ponta (`b8-*-e2e.mjs`) são atualizados junto, para continuar cobrindo cada fluxo.
`**A tela de partida (`Match.tsx`).** Hoje ela usa o `LiveMatch` do motor (`getLive`), `playUntil` e a animação local. A proposta é uma interface pequena `MatchDriver` com `snapshot()`, `setStyle`, `setMentality`, `setFormation`, `substitute`, `setPosition`, `resolveInjury`, `speed` e o estado do intervalo, com **duas implementações**: a local (o `LiveMatch`, como hoje) e a online (`LiveSession` por WebSocket, que já existe e já monta o retrato do servidor). O `Pitch`, `Others`, `FieldLineup`, os lances e as abas passam a receber o driver, não o motor. O quadro do servidor precisa levar o **rastro de leitura** (`MatchSnapshot.trace`, que o campo 2D usa) e hoje não leva; é a maior mudança do protocolo (alguns KB por quadro; no 4x e 8x só o desfecho do minuto, como no solo).
---
## 5. Divisão do trabalho
`Cada parte termina com testes e um teste ponta a ponta local; nada é publicado sem avisar (custo, migração, `wrangler deploy`), como já combinado.
### C1. Medir antes de decidir (sem alterar o jogo)
- Ferramenta `tools/mirrorTraffic.ts`: joga uma temporada do mundo real e conta bytes comprimidos de cada camada (1 a 4) e de cada estratégia (A, D e a variante com atributos de todos), por rodada e por semana de liga.
- Medida de quantas linhas do índice mudam por rodada; decisão: o índice leva ou não atributos de todos os jogadores.
- Auditoria de campos ocultos: lista de tudo que a interface lê de `Player` que seria ocultado; estimativa de arquivos a tocar.
- **Entrega:** a ferramenta `tools/mirrorTraffic.ts` e os números medidos (seção 8 deste documento) com a decisão final da seção 1.3. **Feita em 07/11/2026.**
### C2. Comandos e espelho (a base)
- Núcleos puros das ações em `src/engine` (tática, treino, base, contratos, mercado, orçamento) e `LeagueCommand` com validação estrita (lista fechada de campos, como `parseSearchFilters`).
- Servidor: `POST /api/leagues/:id/command`, revisões (`rev`) e linhas alteradas por revisão, `GET .../mirror` (camadas 1 a 3, com hash), `GET .../detail/:tipo/:id` (camada 4), visão pública do jogador (sem ocultos).
- Aparelho: o espelho (`src/store/leagueMirror.ts`, IndexedDB separado e descartável), `leagueGame()`, `perform()` com aplicação local e correção pelo servidor, canal WebSocket de avisos.
- Teste de contrato das telas com espelho parcial e teste de que o oculto nunca sai (varredura dos JSON entregues).
- **Entrega:** abrir uma liga online mostra o Painel do solo funcionando em leitura. Grande, a de maior risco.
### C3. Painel, Elenco, Tática, Tabela, Treino, Base, Histórico e Copas
- Faixa da liga + cartão da liga (Pronto, Avançar, Pausa) no Painel; barra de baixo igual (Clube, Elenco, Mercado, Tabela, Finanças).
- Todas as ações dessas telas por `perform` (14 arquivos).
- Tabela e artilharia, páginas de times (camada 4), Copas e histórico.
- Remove `ClubCard` e `CupsCard`.
- **Entrega:** o técnico gerencia o clube com as telas do solo.
### C4. Mercado completo e Finanças
- Mercado do solo sobre o índice (filtros por série e posição, favoritos, listas, bandeiras, busca instantânea) e comandos de compra, empréstimo, anúncio, venda, pré-contrato e renovação.
- Propostas de técnicos no mesmo formulário e na aba Propostas (selo, cronômetro, limites), histórico público e denúncia.
- Finanças (extrato, balanço, ingresso, pedir verba) e diretoria.
- Remove `LeagueMarket*`.
- **Entrega:** negociar com a IA e com os outros técnicos pelas telas do solo.
### C5. Partida ao vivo igual à do solo, com velocidade individual
- `MatchDriver` e a implementação online; o quadro do servidor leva o rastro; `Match.tsx` passa a servir os dois modos.
- Velocidade por técnico e partida, mais lenta em jogo de dois humanos, avisos de tela, "esperando as outras partidas", intervalo com tempo, "resultado direto".
- Servidor: relógio por partida a 700 ms por minuto ÷ velocidade, esperas das câmeras lentas calculadas no servidor (módulo puro compartilhado com a tela), intervalo de até 1 minuto com "Voltar ao jogo" (os dois humanos), alarme em grade de 1 s, comando que vence em minutos de jogo, medição com `loadLeague --speeds`.
- Remove `LiveMatchOnline`.
- **Entrega:** a partida online é a do solo, com o campo 2D, a narração e as abas.
### C6. Acabamentos
- Demissão: o clube vai para a IA, a vaga volta à liga e o técnico escolhe outro clube livre da mesma liga de reputação igual ou menor; aba Carreira só com o histórico. Aviso de "Sem conexão" que bloqueia as ações e mostra só o espelho. Pausa/retomada refletidas em todas as telas, reconexão do espelho, avisos da central (`notices`) com os eventos da liga.
- Revisão do aviso de privacidade (o aparelho agora guarda um espelho) e do inventário do `lgpd-para-revisor.md`; modo protegido (12 a 15 anos) conferido nas novas rotas.
- Atualizar o `CLAUDE.md`, testes ponta a ponta e uma rodada de teste fechado.
`**Ordem e dependências:** C1 → C2 → C3 → (C4 e C5 em paralelo) → C6. Se a C1 mostrar que o tráfego do espelho é alto demais, a C2 volta a ser revista (por exemplo, índice mais enxuto), sem perder o desenho de comandos.
---
## 6. Decisões dos sócios (07/11/2026)
`1. **Duração do 1x online:** igual ao offline, **700 ms por minuto de jogo**, com as mesmas velocidades do offline (1x, 2x, 4x, 8x). O ritmo da liga não manda mais na duração da partida.
`2. **Intervalo:** com tempo limitado, **até 1 minuto**; termina antes se o técnico tocar em **"Voltar ao jogo"**. Quando dois humanos se enfrentam, o jogo volta quando **os dois** tocam ou o tempo acaba.
`3. **Técnico demitido:** o clube passa para a IA e a vaga volta à liga, mas o técnico pode **escolher outro clube livre da mesma liga** (nível parecido ou menor). A aba Carreira fica **só com o histórico** dele no online.
`4. **Índice:** mandar os **atributos visíveis de todos os jogadores** no índice, **se a C1 mostrar que o tráfego cabe** (resultado na seção 8). Potencial e atributos ocultos continuam só no servidor.
`5. **Sem internet:** o aparelho só mostra o espelho, **bloqueia as ações** e mostra o aviso de sem conexão.
---
## 7. Riscos e como tratá-los
| Risco | Gravidade | Tratamento |
|---|---|---|
| Código do solo que assume jogador/clube completo | Média | Teste de contrato com espelho parcial na C2; camada 4 ao tocar; variante com atributos de todos se a C1 permitir |
| Vazar potencial e atributos ocultos | Alta | Visão pública única no servidor, varredura automática das respostas, auditoria da interface (C1/C2) |
| Aparelho e servidor divergem no resultado de uma ação | Média | O servidor vence e corrige; as ações de resposta lenta (mercado) nem rodam localmente |
| Tráfego por rodada maior que o estimado | Média | A C1 mede; o desenho permite apertar o índice e a frequência |
| Quebrar o solo | Alta | `perform` no solo faz o que `updateGame` fazia; `soloUnchanged`, `matchGolden`, `saveParts` e `test:balance` continuam obrigatórios |
| Mudar o protocolo da partida (rastro no quadro) e a hibernação do servidor | Média | Quadro versionado; o replay continua sendo a fonte da reconstrução; teste com reinício real do objeto (como na B7) |
| Custo dos despertares com relógios desencontrados | Baixa | Alarme em grade de 1 s (seção 3) |
| Trabalho grande (14 arquivos de tela, a tela de partida, o protocolo) | Média | Divisão em seis partes, cada uma jogável; telas online só saem quando a do solo cobrir tudo |
---
## 8. C1 medida (07/11/2026): quanto custa o espelho
`Ferramenta: `PACOTE_REAL=1 node --expose-gc tools/run.mjs mirrorTraffic --days 400 --sync 1,3,7` (`tools/mirrorTraffic.ts`). **Mundo real: 370 clubes, 10.471 jogadores, 6.382 partidas**, liga com 4 técnicos, resultado direto, **400 dias do mundo** simulados (passos de 2 h, como a `loadLeague`). A cada intervalo de sincronização (1, 3 e 7 dias do mundo) o programa compara com o que o aparelho "já tinha" e conta os **bytes gzip** do que seria mandado. Todos os números abaixo são **medidos nesta máquina**, com gzip padrão do Node (o Cloudflare pode usar brotli, que costuma ser um pouco menor). Um dia do mundo no ritmo Normal é ~8 h reais (3 dias de jogo por dia real); um mês do mundo ≈ 10 dias reais.
### 8.1 Download inicial (gzip)
| O que | Tamanho |
|---|---|
| Estado inteiro do mundo (texto sem comprimir) | 11,1 MB |
| **A** pedaços do save (espelho completo) | 1,25 MB |
| **D1** jogadores sem os ocultos, com tudo o mais | 0,86 MB |
| **D3** jogadores com atributos inteiros e condição reduzida (o que será mandado) | **0,85 MB** |
| **D2** jogadores resumidos (sem atributos) | 0,26 MB |
| Times públicos (sem tática, finanças nem meta) | 0,08 MB |
| Partidas da temporada | 0,13 MB |
| Meu clube em detalhe (time, elenco, base, treino, mercado) | 0,01 MB |
`O índice completo (D3 + times + partidas) fica em **~1,1 MB comprimidos**, menos que um save (1 a 2,5 MB). Os campos que nunca mudam (nome, nascimento, nacionalidade) já estão no pacote de dados do aparelho (0,71 MB, em cache), então dá para baixar menos ainda; deixei isso como otimização possível da C2, não medida.
### 8.2 Por sincronização, mediana (e p95) em KB comprimidos
| Estratégia | a cada 1 dia | a cada 3 dias | a cada 7 dias |
|---|---|---|---|
| **A** pedaços do save que mudaram | 1.607 (1.941) | 1.768 (2.072) | 1.871 (2.208) |
| **D1** jogadores sem ocultos (registros inteiros que mudaram) | 1.206 (1.332) | 1.249 (1.355) | 1.318 (1.394) |
| **D3** sem ocultos, atributos inteiros, condição reduzida | 225 (508) | 488 (790) | 697 (1.055) |
| **D4** como D3, mas **só os grupos de campos que mudaram** | **91 (191)** | **236 (365)** | **403 (581)** |
| **D2** resumido (sem atributos) | 22 (48) | 57 (97) | 123 (276) |
| **M** só o meu clube em detalhe | 5 (38) | 6 (40) | 21 (41) |
`(D1 a D4 já incluem os times e as partidas que mudaram; `D4` e `D3` somam ainda os ~0 a 20 KB de times e 9 a 57 KB de partidas por sincronização.)
`**Por mês do mundo** (~10 dias reais no Normal):
| | sincronização diária | a cada 3 dias | semanal |
|---|---|---|---|
| A | 44,7 MB | 17,2 MB | 7,9 MB |
| D1 | 29,1 MB | 10,7 MB | 4,9 MB |
| D3 | 6,9 MB | 5,0 MB | 3,1 MB |
| **D4** | **2,8 MB** | **2,3 MB** | **1,7 MB** |
| D2 | 0,7 MB | 0,6 MB | 0,5 MB |
### 8.3 O que os números mostram
`1. **O espelho completo (A) e o índice com registros inteiros (D1) são inviáveis**: **9.650 de 10.300 jogadores mudam todos os dias**, e a causa é a **condição física e a moral** (9.631 jogadores com condição diferente por dia; só **689** com atributos diferentes por dia, **1.727** em 3 dias e **3.241** em 7 dias). Mandar o registro inteiro é mandar ~1,2 MB por dia, uns 30 a 45 MB por mês do mundo.
`2. **A condição dos outros clubes não precisa estar no índice** (só a lesão e a suspensão): tirá-la reduz o tráfego diário de 1.206 para 225 KB (D3) e mandar só os grupos que mudaram reduz para 91 KB (D4). Os atributos de quem treina entram aos poucos (7% por dia).
`3. **Os atributos visíveis de todos os jogadores cabem** (decisão 4): **D4 custa 2,3 MB por mês do mundo com sincronização a cada 3 dias**, **~7 MB por mês real no ritmo Normal**, e **~1,1 MB no download inicial**. Nos ritmos mais rápidos o tráfego **por mês real** sobe (Rápido ~16 MB, Bem rápido ~32 MB por mês real se o aparelho sincronizasse a cada 3 dias do mundo), mas o aparelho só sincroniza quando o jogo está aberto e a diferença acumulada cresce devagar (p. ex. a diária no Bem rápido, 14 dias de uma vez, fica em torno de 0,5 a 0,7 MB, como a medida de 7 dias).
`4. **O resumo (D2) é 4 vezes mais barato** que o D4, e continua sendo a saída se algum dia o tráfego precisar cair (`D2` + detalhe ao tocar). A decisão 4 dos sócios vale: **mandar os atributos de todos (D4)**.
`5. **O meu clube em detalhe (M) é pequeno** (5 a 40 KB por sincronização), então a camada 1 pode ser sempre atualizada completa a cada evento.
### 8.4 Limites e o que ainda não foi medido
- É **tráfego de rede** (bytes), não custo de servidor. O cálculo de "o que mudou" na ferramenta compara textos (lento de propósito). **No servidor a C2 vai comparar por referência e por grupo de campos** (o motor é imutável), e a C2 mede o CPU e as linhas lidas por rodada com a liga cheia; não afirmo ainda que o custo é desprezível.
- O servidor precisa guardar, por revisão, **que grupos mudaram de quais jogadores** (ou recalcular contra um instantâneo curto); isso entra no desenho do `rev` da C2 e no armazenamento (estimativa: poucas centenas de KB por revisão antes de comprimir).
- As partidas foram medidas **como o estado as guarda hoje** (gols e cartões incluídos); partidas de clubes da IA são jogadas pelo simplificado e quase não têm eventos. Com 4 técnicos humanos as partidas lance a lance são poucas; numa liga cheia (20 técnicos) as de partida a partida crescem um pouco.
- Não medi as copas, o mercado e os anúncios (`state.market`) como camadas separadas: o mercado está dentro de `M` (só para o meu clube) e o resto, nos pedaços do estado, é pequeno perto dos jogadores.
- Mediana e p95 vêm de 399, 133 e 57 sincronizações em 400 dias. **Não foi simulada a virada de temporada completa** (mudam muitos jogadores de uma vez: idade, contratos, aposentadoria, base); nela o aparelho baixa o índice de novo (~1,1 MB), o que acontece uma vez por temporada.
- O download inicial inclui os jogadores de **todo o mundo real** (21 ligas). Se, mais tarde, quisermos mundos menores por liga, o tráfego cai na mesma proporção.
### 8.5 Decisão para a C2
`**Índice = D4**: jogadores sem ocultos, atributos inteiros, condição reduzida (lesão, suspensão e cartões), mandados por diferenças em quatro grupos (atributos, estatísticas, condição reduzida, resto). Meu clube completo e atualizado a cada evento. A condição física e a moral dos outros clubes e a tática/finanças deles só ao tocar. Plano B, se a medição de CPU do servidor na C2 for ruim: D2 + detalhe ao tocar.
`**Antes de seguir para a C2** estou esperando o seu OK sobre estes números. Não houve deploy nem mudança no jogo: só `tools/mirrorTraffic.ts` e este documento.
---
## 9. C2 feita (07/11/2026): comandos e espelho

**Nada publicado.** Tudo foi testado em Node (sala com SQLite de verdade, sem nuvem e sem custo). As rotas novas só valem depois do `wrangler deploy` (aviso antes de publicar).

### 9.1 O que existe

| Peça | Onde | O quê |
|---|---|---|
| Comandos | `src/engine/league/command.ts` | `LeagueCommand` com corpo conferido (lista fechada de tipos e campos; ids no formato do jogo; valores dentro de limites) e `applyCommand(mundo, clube, comando)`, a mesma função no servidor e no aparelho. Cobre: tática, plano de treino, treino individual (começar e cancelar), preço do ingresso, orçamento de salários, anunciar e tirar anúncio, liberar jogador, renovar, promover e dispensar jovem da base. As funções do jogo solo já eram `(estado, time, argumentos) -> estado`, então os comandos só as reúnem (a tática repete a regra de estrangeiros de `setUserTactic`). |
| Visão pública | `src/engine/league/mirror.ts` | Jogador em quatro grupos (`a` atributos, `s` estatísticas, `c` condição reduzida, `r` o resto), `hidden` embaçado (`publicHidden`), times sem finanças, `ownPart` (clube do técnico completo), `diffWorlds` / `mergeChanges` (o que mudou entre revisões), `buildDelta`, `buildFull` (em páginas de 2.500 jogadores), `applyPayload` e `toSeasonState` (o `SeasonState` que as telas leem). |
| Sala da liga | `server/leagueRoom.ts` | Revisão (`rev`) que sobe quando algo que o aparelho vê muda, registro das últimas **64** revisões (`ml:<rev>` no `kv`, só quais jogadores e quais grupos mudaram), rotas internas `/internal/mirror` e `/internal/command`. Revisão antiga demais, do futuro, ou mudança de mais de 3.000 jogadores (virada de temporada): carga completa. Sobrevive a reinício (a revisão fica no banco). |
| API | `src/online/leagueApi.ts`, `server/worker.ts` | `GET /api/leagues/:id/mirror?since=&page=` e `POST /api/leagues/:id/command` (corpo `{ since, command }`, até 4 KB); só membro com clube, liga em andamento; a recusa do jogo volta como 409 `club-refused` com o motivo. |
| Aparelho | `src/store/leagueMirror.ts`, `leagueSession.ts`, `leagueGame.ts`, `actions.ts` | `LeagueMirror` (sincroniza, aplica o comando na hora, o servidor vence, sem conexão só lê), `openLeague` (acompanha de 5 em 5 s e entrega um `Game` ao `gameStore` com `game.online`), `perform(comando)` (solo: muda o jogo; online: manda ao servidor). O `autosave` ignora o jogo online. |

### 9.2 Medido com o mundo real (`PACOTE_REAL=1 node --expose-gc tools/run.mjs mirrorCpu --days 60`)

| Medida | Resultado |
|---|---|
| Carga completa | 6 páginas; ~17 ms por página (máx 23 ms); a maior página tem 2,1 MB de texto; **total comprimido 1.171 KB** (a previsão da C1 era ~1,1 MB) |
| Comparar o mundo com o da revisão anterior (`diffWorlds`) | mediana **23 ms**, p95 33 ms, pior 59 ms (68 revisões em 60 dias) |
| Montar a atualização de 3 revisões | mediana **25 ms**, p95 32 ms, pior 56 ms; **217 KB comprimidos** (p95 293 KB), em linha com a previsão de 236 KB da C1 |

**O plano B (resumo sem atributos) não foi necessário**: o custo de CPU por revisão é de dezenas de milissegundos, contra ~160 ms do avanço do próprio mundo. Medido em Node; o Cloudflare só se mede na nuvem (a medição de memória e CPU na nuvem fica para o teste fechado).

### 9.3 Decisões de desenho que valem lembrar

- **Potencial embaçado, ocultos neutros.** O aparelho vê `hidden.potential` com erro fixo por jogador e idade (σ = 3, `publicHidden`; as estrelas e a faixa do jogo solo somam o erro delas por cima, como já faziam) e 50 nos outros três ocultos. Nenhuma tela do jogo lê `hidden` fora do editor de pacotes e das contas de valor de mercado (`engine/market/value.ts`) e de crescimento previsto no treino; essas continuam funcionando com o valor embaçado (o servidor decide com o verdadeiro; pode haver diferença de poucos pontos no valor mostrado).
- **A condição física e a moral dos outros clubes não vão no índice** (física 100 e moral 70 neutras no aparelho). Vão ao tocar no jogador (C3) e a do próprio clube vem sempre completa.
- **O clube do técnico vai a cada atualização que muda algo** (treino e base marcam a revisão com `own`); quem pergunta na revisão atual só recebe o aviso de que não há novidade.
- **Treino, base e histórico de força** do técnico vão em `own`; o dos outros não vai.

### 9.4 Testes novos (todos passam; o `npm test` inteiro: 121 arquivos, 1.394 testes)

`tests/leagueMirror.test.ts` (14: espelho reconstrói o mundo, **nenhum oculto verdadeiro sai** no texto, outros clubes sem finanças e sem condição, atualização por revisão = carga nova, idempotência, atualização menor que a carga, comandos e a recusa de corpo ruim, "o técnico só mexe no próprio clube"); `tests/leagueRoomMirror.test.ts` (12: sala com SQLite de verdade, revisões, registro limitado a 64, carga completa quando antigo, comando validado e recusa que não muda nada, reinício do objeto, e o `LeagueMirror` ligado à sala: aparece na hora, servidor vence, regra recusada nem chega ao servidor, sem conexão só lê, acompanha por atualizações e só baixa tudo quando a revisão envelhece); `tests/onlineLeagueApi.test.ts` (+1: só membro, consulta e corpo conferidos); `tests/performActions.test.ts` (3: no solo o `perform` dá o mesmo mundo que as funções de `store/game.ts`).

### 9.5 O que a C2 deixou para depois

- **Guardar o espelho no aparelho** (IndexedDB separado) para abrir a liga sem baixar tudo e ler sem internet: C6.
- **Aviso por WebSocket** no lugar da consulta de 5 s: C5 (usa o canal da partida ao vivo).
- **Detalhe ao tocar** (condição de um jogador de outro clube, tática de outro clube): C3.
- **Comandos do mercado** (compra, empréstimo, propostas, pré-contrato, pedir verba): C4, junto com a tela.
- **Preferências** (`favorites`, `savedLineups`) e `seasonLog`/`coach` do técnico: C3.

---

## 10. C3 feita (07/11/2026): a liga online com as telas do jogo solo

**Nada publicado.** Testado com o servidor local (`wrangler dev --local`, sem custo) e o navegador de verdade (Playwright): `tools/online-lab/c3-e2e.mjs` (todas as verificações passam). Capturas de 380 px em `.shots/`: `c3-online-*.png`, `c3-solo-*.png` e, lado a lado, `c3-lado-painel|elenco|treino|base|tatica|tabela.png` (o solo à esquerda, o online à direita; as telas são as mesmas, só mudam os dados).

### 10.1 O que o técnico faz agora

1. Na sala da liga em andamento, o botão **Abrir o jogo do clube** baixa o espelho (carga completa, ~1,1 MB) e abre o jogo com **as mesmas telas do jogo solo**: Painel, Elenco (Jogadores, Escalação, Números, Base, Treino), Tática, Tabela (classificação, rodadas, artilharia, assistências, cartões, copas, histórico, página dos times), Mercado e Finanças (leitura) e a partida (ainda a da C5).
2. **O botão Avançar do Painel vira o cartão da liga**: próxima rodada no fuso do aparelho, **Pronto** e **Sala da liga** (ADM: Avançar, Pausar, ritmo; técnicos, convite). A sala abre dentro do jogo (`ScreenId` `league`), sem os cartões simples antigos de Meu clube e Copas (`inGame`).
3. **Ações já ligadas ao servidor** (comando validado, resultado na hora no aparelho): tática e escalação (formação, estilo, mentalidade, posições no campo, trocas de titular, escalação guardada carregada), treino coletivo (intensidade e foco), treino individual (iniciar e cancelar), promover e dispensar jovens da base, preço do ingresso e divisão do orçamento (barra de salários e compras).
4. **O servidor guarda**: sair do jogo e abrir de novo mostra o treino e a tática que foram escolhidos (verificado no teste de ponta a ponta).
5. **Sem internet**: aviso vermelho no topo; o espelho continua legível e as ações ficam bloqueadas (verificado).
6. **Ação ainda não disponível** (compras, empréstimos, propostas, pré-contrato, pedir verba, vender, renovar pela tela de Contratos; chegam na C4): o aviso "Esta ação ainda não está disponível na liga online" aparece em vez de o botão parecer quebrado. Até a C4 o Mercado da sala da liga continua fazendo essas coisas.

### 10.2 Mudanças no código

- `store/gameStore.ts`: **no jogo online `updateGame` ignora mudança de `season`** (só vale por `perform`); preferências do técnico (favoritos, escalações guardadas) mudam localmente.
- `store/actions.ts`: `perform(comando)` (solo: aplica na hora; online: manda ao servidor). **10 pontos das telas** trocaram `updateGame(...)` por `perform(...)`: `Tactics`, `Lineup` (2), `Training` (3), `Academy` (2), `Budget`, `Sheets`. Mensagens de erro em `labels.ts` (`COMMAND_ERROR_LABELS`, `commandErrorText`).
- `ui/App.tsx`: menu fecha o espelho (sem salvar no aparelho), aviso de sem conexão e de ação indisponível, tela da liga; `Dashboard.tsx`: cartão da liga; `LeagueRoomScreen.tsx`: botão de abrir o jogo; `main.tsx`: `window.__mm.getGame()` só em desenvolvimento (para o teste de ponta a ponta).
- O solo não mudou: `soloUnchanged`, `matchGolden`, `saveParts` e os 1.394 testes do `npm test` passam (+3 de `onlineGameGuard`).

### 10.3 O que a C3 deixou para depois

| O quê | Quando |
|---|---|
| Detalhe ao tocar (condição física e moral reais de um jogador de outro clube; tática real de outro clube, hoje é a "escalação provável" da IA, como no solo) | C6 (acabamentos); no aparelho aparecem 100 e 70 |
| Favoritos e escalações guardadas **por conta** (hoje valem só neste aparelho) | C6 |
| Aba Carreira só com o histórico do técnico; `seasonLog` e `coach` vindos do servidor | C6 |
| Guardar o espelho no aparelho (abrir sem baixar tudo; ler sem internet depois de fechar o app) | C6 |
| Partida com campo 2D e narração, velocidade e intervalo | C5 |
| Mercado completo com propostas e técnicos | C4 |

---

## 11. C2 e C3 publicadas (07/11/2026)

Com a autorização dos sócios: `wrangler deploy` do Worker (versão `6c5123cc`, sem migração de banco, sem custo novo; as migrações 0004 e 0005 já estavam aplicadas) e site pelo GitHub Pages (`git push` da `main`, commit `6a9171f`). `/api/leagues/:id/mirror` responde 401 sem assinatura (a rota existe).

## 12. C4 feita (07/11/2026): mercado completo e finanças

**Não publicada** (precisa de `wrangler deploy` do Worker e do site; avisar antes). Testada com o servidor local e o navegador (`tools/online-lab/c4-e2e.mjs`, passa), mais `npm test` (123 arquivos, 1.408 testes, todos passam).

### 12.1 O que o técnico faz agora no Mercado e nas Finanças da liga online

- **Mercado do jogo solo, inteiro:** Buscar (filtros por série, posição, faixas, atalhos "Cabem no bolso", "Barganhas", "Jovens promessas", "Contrato acabando"), Favoritos, Listas, Livres, Pré-contrato, Propostas (recebidas e enviadas), Histórico e Contratos. Tudo roda sobre o espelho (o índice com os atributos de todos).
- **Comandos novos ao servidor** (resultado na hora no aparelho; o servidor valida com as regras da liga): proposta de compra ou empréstimo a clube da IA (`offer`), resposta a proposta da IA por jogador seu (`respond-offer`), venda ou empréstimo a clube da IA (`sell`), pré-contrato (`pre-contract`), pedido de verba (`request-funds`, com a confiança da diretoria calculada no servidor: `boardConfidence`), renovação (`club` › `renew`), anunciar e tirar anúncio, liberar jogador, ingresso e orçamento. As negociações devolvem o resultado (`info`: aceitou, motivo, salário mínimo, máximo que o clube pagaria) e a tela mostra como no solo.
- **O que a liga acrescenta às regras:** jogador de clube de outro técnico não é negociado pela IA (`human-club`, com a dica de usar a aba Técnicos), no máximo 5 propostas abertas (`too-many-offers`), clube de outro técnico não aparece como comprador na venda. O espelho leva a lista de clubes humanos (`own.humans`) para o aparelho aplicar a mesma regra na hora.
- **Aba "Técnicos"** (só na liga online): a negociação entre técnicos humanos (taxa reservada, contraproposta, prazo de 48 h, histórico público, denúncia). O que já existia (`LeagueMarket`) passa a mostrar só o que é entre técnicos (`coachesOnly`); a compra, a venda e o pré-contrato com a IA são as abas do Mercado do jogo. O cartão "Mercado" da sala da liga saiu de dentro do jogo.
- **Finanças:** extrato, balanço, ingresso, orçamento, pedir verba e alertas, todos com as telas do solo.

### 12.2 Testes

`tests/leagueCommandsMarket.test.ts` (7: corpo conferido, proposta que entra, jogador de técnico recusado, limite de 5, resposta inexistente, venda e pré-contrato com resultado, verba; no solo `perform` dá o mesmo mundo e o mesmo resultado que `requestUserFunds` e `makeUserOffer`), `tests/leagueRoomMirror.test.ts` (+1: proposta e venda pelo espelho ligado à sala), e2e `c4-e2e.mjs` (o servidor recusa com o motivo em português quando o elenco está cheio ou falta orçamento de salários; depois de liberar um jogador a proposta passa e volta no espelho; Propostas > Enviadas; aba Técnicos; pedido de verba). Capturas em `.shots/c4-*.png` e lado a lado `c4-lado-mercado.png` e `c4-lado-financas.png`.

## 13. C5 feita (07/11/2026): partida ao vivo com a tela do jogo solo e velocidade individual

**Não publicada** (precisa de `wrangler deploy` e do site; sem migração de banco). Testada em Node, com a sala de verdade em SQLite e no navegador (`tools/online-lab/c5-e2e.mjs`, passa; captura `.shots/c5-online-*.png` e `c5-lado-partida.png`).

### 13.1 O que mudou

- **Tela de partida = a do solo.** `Match.tsx` (campo 2D, narração, abas Jogos, Dados, Tática e Trocas, câmeras lentas, escudo do adversário) agora roda também sobre a liga online: `store/onlineMatch.ts` faz um `LiveMatch` que espelha os quadros do servidor (`snapshot()` = o último retrato; trocas, mudança tática, posições e escolha do reserva na lesão viram comandos que valem no passo seguinte do relógio, em menos de 1 s; estilo, mentalidade e formação aparecem na hora). Nada é simulado no aparelho. A entrada é o botão **Entrar na partida** do cartão da liga; a tela antiga (`LiveMatchOnline`) foi removida.
- **Relógio por partida no servidor** (`engine/league/live.ts`): cada partida anda a **700 ms por minuto de jogo ÷ velocidade** (a mesma do solo) **mais a câmera lenta dos lances** (a regra mudou de `pitchModel.ts` para `engine/match/timing.ts`, que a tela e o servidor importam). Velocidades 1x, 2x, 4x e 8x (padrão 2x, como no solo); a velocidade não entra na reprodução (não muda o resultado). **Dois técnicos no mesmo jogo: vale a mais lenta** (se um cai, vale a do outro; sem ninguém conectado a partida roda a 8x e sem câmera lenta).
- **Intervalo de até 1 minuto** (`HALFTIME_MS`), que acaba antes quando todos os técnicos do jogo tocam em **Voltar ao jogo** (os dois, num jogo entre técnicos); a tela mostra o cronômetro e "Esperando o adversário…". Lesão no seu time para o jogo até você escolher o reserva (ou 45 s), como no solo.
- **Placar:** o botão de velocidade é o do solo (1x, 2x, 4x, 8x); num jogo entre técnicos aparece "valendo Nx" quando a escolha do outro é mais lenta. No fim, "Voltar ao painel" e o aviso de que a rodada espera as outras partidas; a aba Jogos mostra as outras partidas da rodada ao vivo.
- **Alarme em grade de 1 s** (`GRID_MS`, `nextWakeAt`): acorda no máximo uma vez por segundo, qualquer que seja o número de partidas. Quadros só das partidas que mudaram (`frameSince` agora devolve `undefined` quando nada mudou). Protocolo novo: `speed` e `half` do cliente; `speed`, `speeds` e `halftime` por partida nos quadros.
- **Comandos entram já** (a sala chama o relógio assim que um comando chega), não esperam o próximo minuto: a partida pode estar parada na lesão ou no intervalo.

### 13.2 Custo no servidor (`PACOTE_REAL=1 node --expose-gc tools/run.mjs liveCost --humans 10 --speeds mix|1|8`; Node, mundo real de 370 clubes)

O evento do teste teve 5 partidas e 5 técnicos jogando (de 10 na liga).

| Velocidades | Evento no relógio real | Despertares do alarme | Quadros enviados | CPU total |
|---|---|---|---|---|
| todos em 1x (o pior caso) | **3,0 min** | 135 | 1.350 KB (mediana 11 KB, p95 19 KB) | 0,1 s (pior passo 16 ms) |
| mistura de 1x, 2x, 4x e 8x | **2,4 min** | 131 | 1.022 KB | 0,1 s (pior passo 31 ms) |
| todos em 8x | **2,1 min** | 78 | 671 KB | 0,1 s (pior passo 47 ms) |

Leitura: **o evento dura de 2 a 3 minutos reais em vez de 6 a 20** (inclui 1 minuto de intervalo, que domina o 8x); os despertares do alarme ficam em ~80 a ~135 por evento, no teto de 1 por segundo; a CPU é desprezível (centésimos de segundo por evento). A projeção de custo da seção 32.3 da Fase 6 (sessões de 10 minutos) fica **mais barata**: o objeto da liga fica acordado de 3 a 8 vezes menos durante as partidas. Os quadros somam ~1 MB por evento (a quem está conectado ainda se multiplica pelo número de técnicos conectados).

### 13.3 Testes

`tests/leagueLive.test.ts` (reescrito, 10: 700 ms por minuto e a velocidade divide, dois técnicos usam a mais lenta, quem cai deixa a do outro, sem ninguém roda a 8x, intervalo para até 1 minuto e acaba antes com Voltar ao jogo, comando entra já e a reprodução refaz igual, comando vencido e erro de regra, técnico que cai e volta, hibernação com velocidade e intervalo, pausa e retomada deslocam o relógio, alarme em segundos cheios e fim do evento); `tests/onlineLiveProtocol.test.ts` (velocidades aceitas e recusadas, "half"); `tests/leagueLiveInjury.test.ts` e `onlineLiveSession.test.ts` ajustados; e2e `c5-e2e.mjs` (liga ao vivo, rodada com o clube, entrar, 2x → 4x → 8x, intervalo com cronômetro e Voltar ao jogo, fim e voltar ao painel, partida inteira em 98 s). **Removidos** os scripts `b8-5`, `b8-9` e `b8-10` (testavam a tela antiga).

### 13.4 O que ficou para a C6

Detalhe ao tocar (condição física e moral reais de jogadores de outros clubes), aba Carreira com o histórico do técnico, guardar o espelho ao fechar o app, favoritos e escalações guardadas por conta, demissão e escolha de outro clube livre.

---

## 14. C4 e C5 publicadas (07/11/2026)

Com a autorização dos sócios: `wrangler deploy` (versão `a6f8752d`, sem migração de banco, sem custo novo) e site pelo GitHub Pages (`git push`, commit `b810cb9`).

## 15. C6 feita (07/11/2026): detalhe ao tocar, carreira, espelho guardado, preferências por conta e demissão

**Não publicada** (precisa de `wrangler deploy` e do site; sem migração de banco, sem custo novo; avisar antes). Testada em Node (sala com SQLite de verdade, API com sala falsa), com o navegador contra o servidor local (`tools/online-lab/c6-e2e.mjs`, passa) e `npm test` (126 arquivos, 1.423 testes, todos passam).

### 15.1 O que mudou

- **Detalhe ao tocar.** O espelho continua levando a condição física e a moral dos outros clubes como neutras (100 e 70; é o que mantém o tráfego baixo). Ao abrir a página de um time ou a ficha de um jogador de outro clube, o aparelho baixa a condição real do elenco e a tática salva dele (`GET /api/leagues/:id/detail?team=`, uma vez por revisão; `useOnlineDetail`, `LeagueMirror.loadDetail`). Verificado no navegador: depois de uma rodada a página do adversário traz jogadores com condição abaixo de 100.
- **Aba Carreira = histórico.** `Carreira` na liga online mostra só o histórico: cada passagem por um clube (da mais recente), as temporadas fechadas enquanto o técnico estava lá (posição e título) e a campanha de hoje (`GET .../career`, botão "Minha carreira" no cartão da liga). A sala guarda as passagens por técnico (`careers`); as propostas de emprego do solo não existem no online.
- **Espelho guardado no aparelho.** `src/store/mirrorCache.ts` (IndexedDB próprio `meu-manager-espelho`, gzip, 3 ligas no máximo, formato versionado): abrir a liga mostra já o espelho guardado e baixa só a atualização; **sem internet abre só com o guardado, em leitura, com o aviso de sem conexão**; sem guardado e sem internet não abre. Grava a cada atualização (com espera de 4 s) e ao fechar.
- **Favoritos e escalações guardadas por conta.** `GET/PUT /api/leagues/:id/prefs` (corpo conferido: lista fechada de campos, até 300 favoritos, 3 espaços de escalação, 16 KB). O aparelho carrega ao abrir a liga e manda (1,5 s depois da mudança) quando o técnico muda; trocar de aparelho traz tudo.
- **Demissão e escolha de outro clube.** Depois de cada rodada a diretoria avalia os técnicos pelas regras do solo (`evaluateBoard`: finanças e resultados). Demitido, o clube **volta à IA e a vaga continua do técnico**, que vê a tela "Você foi demitido" com os **clubes livres da mesma liga de reputação igual ou menor**, os maiores primeiro, e escolhe um (`GET .../dismissal`, `POST .../rechoose`; a sala valida e o índice da liga passa a ter o clube novo). A passagem anterior fica na carreira como "Demitido".
- **Correção importante (aparecia na C4 publicada).** O espelho levava as finanças de **todos os outros clubes zeradas**, então a lista de compradores da venda ("Clube interessado") ficava vazia online. Agora o caixa e os orçamentos dos outros clubes vão no espelho (o extrato, o histórico de temporadas e os pedidos de verba continuam só do técnico). Achado pelo teste de ponta a ponta de vendas; **a versão publicada da C4 tem esse defeito até a C6 ser publicada**.
- **Removido:** nada novo. O `c5-lado-partida.png` foi regerado (solo à esquerda, online à direita, ambos na tela de partida).

### 15.2 Testes novos

`tests/leagueCareer.test.ts` (7: demissão por finanças, clubes livres de reputação igual ou menor, carreira, detalhe, preferências conferidas; sala: demitido perde a vaga, lista de clubes, clube maior é recusado, escolha, carreira com "Demitido", detalhe só para quem tem clube, preferências por conta), `tests/leagueSessionC6.test.ts` (4: espelho guardado e devolvido idêntico, só 3 ligas e só regrava quando a revisão muda, detalhe sobre o neutro uma vez por revisão, abre sem internet só com o guardado), `tests/leagueDismissedScreen.test.ts` (3), `tests/onlineLeagueApi.test.ts` (+1: as rotas novas) e ajustes em `leagueMirror.test.ts`.

**Ponta a ponta no navegador (`c6-e2e.mjs`, passa)** cobre o que os testes antigos (`b8-9`, `b8-10`, `b8-5`) cobriam e o `c5-e2e` não:
- **Compradores em sequência:** dois jogadores vendidos um depois do outro a clubes da IA **diferentes** (a IA recusa, por exemplo, quem ficaria sem reposição na posição: o teste tenta outro, como o técnico faria).
- **Lesão repetida:** com o servidor local provocando lesões, o técnico escolhe quem entra mais de uma vez (jogadores diferentes) na mesma partida e a partida termina.
- **Queda de conexão com ticket novo:** a conexão do WebSocket é derrubada no meio da partida e volta sozinha com ticket novo; todos os tickets são diferentes (cada um só vale uma vez).
- **Mais:** favorito que volta da conta, carreira, condição real do adversário, espelho guardado no aparelho.
