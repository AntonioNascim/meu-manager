# Proposta: trazer as funções do El Camino DT para o Meu Manager

Base: `docs/elcamino/inventario.md`. Nada aqui foi implementado. Tudo vale no **solo e no online**, no **nosso visual** (tema escuro, verde-limão só na ação principal, componentes de `src/ui/theme`, avatares e ilustrações próprios) e com **textos nossos**. Não copiar layout, cores, ícones, imagens nem textos do concorrente, e não usar veículos de imprensa nem jornalistas reais.

## Regras que não mudam

1. Clubes, ligas, jogadores e overall (o pacote real) ficam como estão.
2. O **resultado do motor de partida** não muda: `tests/matchGolden.test.ts` e o balanceamento (`npm run test:balance`) continuam passando sem regravar nada. As melhorias da partida são **só na animação**, como já foi feito no campo 2D (nada usa o gerador do motor; escolhas visuais vêm de hash do minuto e dos ids).
3. Fora do escopo, por decisão sua: responder e-mails e mensagens, e "simular a temporada inteira de uma vez".
4. Toda ação do técnico vira um `LeagueCommand` (mesma função no aparelho e no servidor). Estado novo: `SAVE_VERSION` e migração, peça em `planParts`/`joinParts`, e no online `diffWorlds`, `groupsOf`, `ownPart` do espelho. Dados novos no aparelho ou no servidor: atualizar o inventário de `lgpd-para-revisor.md` e o aviso de privacidade. Modo protegido (12 a 15 anos): ver se alguma regra online nova precisa ser vetada.

---

## 1. Comparação com o Meu Manager

### 1.1 O que já temos (igual ou melhor)

| Tema | Meu Manager |
|---|---|
| Elenco, atributos e papel por ponto da grade | Detalhe do jogador com hexágono de atributos, estado, treino individual, posição secundária, números, base. |
| Tática | 5 estilos, mentalidade, formações prontas e **grade livre de 26 pontos** com custo calibrado; escalações guardadas; ao vivo com trocas e arrasto. |
| Mercado | Busca com filtros, interesse, listas, livres, pré-contrato, propostas, histórico, negociação e vendas; no online, mercado entre técnicos e com a IA. |
| Finanças, diretoria, carreira | Caixa, orçamento, verba, extrato, meta, demissão, propostas de outros clubes, reputação do técnico. |
| Competições | Ligas de 21 países, copas nacionais, continentais e mundiais; calendário por pirâmide; mundo real com 370 clubes. |
| Campo 2D | Movimento contínuo a 60 fps (`pitchMotion`), estilos no movimento, câmera lenta de gol e finalização, bola parada (pênalti, barreira), gol com "GOL!" e autor, lesão e troca. |
| Online | Ligas com amigos, relógio comum, partida ao vivo, mercado entre técnicos, espelho, nuvem. **O concorrente não tem.** |
| Calibragem | Resultado depende dos atributos; medições de milhares de partidas. |

### 1.2 O que é diferente

| Tema | El Camino DT | Meu Manager |
|---|---|---|
| Treino | Agenda **dia a dia** com biblioteca de exercícios, campinho animado e mini-jogo. | Intensidade e foco **coletivos** da temporada, vaga individual, treino da base; evolução distribuída pelos dias. |
| Partida | Câmera que segue a bola, arquibancada, faixa de gol, "se terminar assim", analista com botão, cerimônia. | Campo inteiro sempre, narração e câmera lenta; sem esses elementos. |
| Tática no Esquema | Desbloqueada ao fechar a semana de treino. | Sempre disponível (liberdade maior). |
| Imprensa e vestiário | Coletivas, capitão, entrosamento, hierarquia. | Fora do MVP; só moral e forma. |
| Início de carreira | Quatro propostas, desafios, ficha, contrato assinado. | Escolher clube em uma lista (e pacote). |

### 1.3 O que falta

Treino por dia e mini-jogo animado; assistente de pré-temporada com amistosos; tela do adversário com olheiro, craque e prognóstico (V/E/D → posição); cerimônia de entrada; "se terminar assim" ao vivo; câmera com zoom; analista com ação; faixa de gol e volta ao centro; início por propostas, desafios e ficha de clube; contrato com assinatura e coletiva de apresentação; vestiário (capitão, entrosamento, hierarquia); imprensa; eleições, patrocinador e aposta do ano; "onde falta gente" e olheiros; mercado ao vivo; modo seleção (já previsto para depois do lançamento).

---

## 2. O que faz a partida deles parecer mais fluida

**Medido:** no campinho de treino, a posição dos discos muda em **todos os quadros a 60 fps**, proporcional à velocidade escolhida. O nosso campo da partida também atualiza a 60 fps (`requestAnimationFrame`, só `transform`, ~0,2 ms por quadro). A **mecânica** é equivalente.

**Observado no vídeo (25 quadros/s, a 0,25 s por quadro):** a bola não teleporta e a câmera faz pan suave. Isso é o que torna o movimento mais legível, não mais rápido. As diferenças que aparecem são de **apresentação**:

1. **Câmera de zoom que segue a bola** (com "campo inteiro" para voltar): os discos ficam maiores e andam mais pixels por segundo na tela; no campo inteiro, 22 discos andando pouco parecem "parados".
2. **Elementos de vida em volta**: arquibancada nas laterais, árbitros, bola em cor viva, o **nome de quem tem a bola**.
3. **Eventos com ritmo próprio**: a faixa de GOL com a cena escurecida e a câmera que **volta ao círculo central**; a cerimônia de entrada.
4. **Contexto sempre na tela**: a linha "se terminar assim", o analista, o placar com minuto.

**Hipótese a confirmar:** a sensação de fluidez vem mais de 1 e 3 que do número de quadros. Para tirar a dúvida falta uma gravação lado a lado, no mesmo aparelho, com a mesma velocidade, e a leitura do fps real do site (a que foi perdida). Se o fps do site na partida for menor que 60, a diferença é toda de apresentação.

---

## 3. Partes, em ordem de importância

Tamanhos: P = poucos dias, M = uma a duas semanas, G = mais de duas semanas.

### Parte 1 · Partida ao vivo: câmera, gol, contexto e analista (M) — **FEITA localmente em 18/11/2026, aguardando aprovação para publicar** (resultado e medições em `CLAUDE.md`, parágrafo "Partida: câmera, contexto e analista")
- **Câmera no campo** (`Pitch.tsx`): modo "seguir a bola" (zoom de ~2,3× com pan suave e amortecimento, sem sacudir) e botão "Campo inteiro"; a câmera é só uma transformação do contêiner, sem tocar nos discos. Padrão: seguir a bola no celular, campo inteiro em tela larga.
- **Arquibancada e ambiente**: torcida desenhada nas laterais, cores do clube da casa, clima do dia (a conferir se o clima já existe nos nossos dados; se não, entra como sorteio só visual por hash), só visual.
- **Gol**: faixa com autor, assistente e clube, cena escurecida, **câmera volta ao centro** (já temos a "celebração"; trocar por esse ritmo e unificar com a saída de bola).
- **"Se terminar assim"**: faixa fixa com a posição que o time teria se acabasse agora, e a zona (título, vaga continental, rebaixamento). Derivado das partidas decididas mais os placares ao vivo, **nada guardado** (regra 3 da Arquitetura). Para o online, usar os outros jogos da mesma rodada que o servidor já manda.
- **Prognóstico antes do jogo**: "se vencer / empatar / perder: Nº". Mesma conta, com o placar final de cada cenário.
- **Analista**: leitura do jogo (domínio, finalizações, cansaço, cartões, expulsão) a partir de `snapshot()` e `liveStats`, com um botão que aplica **a mudança que já existe** (estilo, mentalidade, troca) pelo mesmo comando da tela. Só sugere; não decide.
- **Cerimônia de entrada** (túnel, foto dos times, "pular"): animação curta de ~6 s, só visual, textos nossos e sem sinalizadores reais de marca.
- **Solo e online:** é o mesmo componente (`Pitch`), alimentado pelos quadros do servidor no online; o analista usa os dados que o `OnlineMatchHandle` já espelha.
- **Testes:** `pitchMotion`/`pitchModel` (a câmera é pura), `matchGolden` sem mudança, captura de 380 px em `.shots/`.
- **Risco:** desempenho em celular simples (mais camadas). Medir com `?fps=1` e `fluidez-e2e` antes e depois; se cair do que temos hoje (60 fps a 1×), simplificar a arquibancada.

### Parte 2 · Treino por dia, exercícios e campinho animado (G) — **FEITA localmente em 18/11/2026, aguardando aprovação para publicar** (ver `CLAUDE.md`, parágrafo "Treino por dia")
- **Modelo:** `TrainingWeek` com até 5 sessões por semana (dia a dia até o jogo), cada uma: exercício (da biblioteca), intensidade, ou folga. `Game.trainingWeek` por time; no online, `LeagueCommand` `training-plan` por técnico. A comissão preenche sozinha (botão "Delegar"), o que mantém o ritmo rápido.
- **Biblioteca:** os mesmos 7 grupos (jogos reduzidos, saída de bola, pressão e bloco, ataque, último passe, bola parada, corpo e mente), com **nomes e textos nossos**. Cada exercício tem zona do campo, ganho físico, risco de lesão e a que **grupo de atributos** serve (`GROUP_ATTRIBUTES`).
- **Efeito, sem mudar nenhum resultado do motor:** o exercício só **redistribui, dentro da intensidade já escolhida**, o ganho de atributos (como o `focusWeights` faz hoje), muda a recuperação e o risco de lesão daquele dia (canais que `applyTraining` já usa). O total por temporada continua o de `OFFSEASON.evolution` e o equilíbrio `trainingIntensity.test.ts` segue valendo.
- **Medidores de "ensaiado"** (saída de bola, pressão, bloco, ataque, transições, bola parada): neste primeiro momento **só informativos** (mostram o que a semana trabalhou). **Decisão que preciso de você:** se quiserem que "ensaiado" tenha efeito em campo, isso muda resultados do motor e exige nova calibragem. Minha recomendação: **não**, para respeitar a regra de não mexer no equilíbrio.
- **Campinho animado:** SVG em 60 fps, mesmo princípio do `pitchMotion` (posição e velocidade por jogador, deslizamento por bloco, marcação). Cada exercício é uma **cena** (zona, participantes, cones e estações, bola(s)); o **mini-jogo** (11×11, 8×8...) usa o movimento do campo com um placar e relógio **cosmético, derivado de hash** (sem gerador do motor), controles Pausa, ×1, ×2, ×4 e Terminar. **Importante:** o placar do mini-jogo é de mentirinha e não é guardado.
- **"Onde e quem":** ao escolher o exercício, a zona acende e os participantes aparecem (os que não participam, apagados), usando os avatares do tema.
- **Pré-temporada e "Terminar a semana":** semana fechada marca o dia como feito.
- **Online:** cada técnico monta a sua semana; o servidor aplica no avanço do relógio (`applyTraining` já é puro). Em liga com calendário comum, as sessões são as mesmas datas para todos.
- **Save e espelho:** `SAVE_VERSION` + migração (`trainingWeek` vazio = "comissão decide", igual ao treino de hoje); o espelho leva a semana do próprio clube (`ownPart`).
- **Testes novos:** `trainingWeek.test.ts` (soma do ganho = ganho da temporada), `trainingScenes.test.ts` (cena válida por exercício), regressão do `trainingIntensity.test.ts` e `soloUnchanged`.
- **Risco:** tela com muitas peças. Entregar em duas etapas: (a) agenda e biblioteca com cena estática; (b) mini-jogo animado.

### Parte 3 · Tela do adversário: prognóstico, craque e olheiro (M)
- Aproveitar `OpponentOverlay`/`TeamPage`/`TacticSection`: adicionar **prognóstico** (V/E/D e posição), **craque do time** e **ponto fraco/forte** por setor (já temos `Overview`), e "como eles jogam" (estilo, formação provável).
- **Olheiro:** hoje **fora do MVP** (CLAUDE.md, "olheiros" na fase 2). Proposta: um nível simples de **olheiro do clube** (barato, sem pessoa a contratar) que dá a precisão da leitura do adversário e das buscas do mercado (usar o erro de `potentialRange`, que já existe). Decisão a confirmar com vocês: **antes do lançamento ou na fase 2**.
- Só leitura; nada altera o motor.

### Parte 4 · Pré-temporada com amistosos (M)
- Assistente de 3 decisões (onde, quantos dias, contra quem) sobre o calendário que já existe (`pre-season`). Amistosos usam `simulateQuick` (**nunca** o motor lance a lance), com cachê e efeito só em condição, moral, entrosamento e risco de lesão.
- Online: a pré-temporada da liga é comum; cada técnico só escolhe o que faz de seu (ajuste de condição), sem mexer no calendário dos outros.
- Risco: a pré-temporada interfere em `calendar` e em `shared` (calendário comum); validar `sharedCalendar.test.ts`.

### Parte 5 · Início de carreira: propostas, desafios, ficha e contrato (M)
- Tela "Quatro clubes procuram você" (sorteio com a semente do jogo), "Escolha você" por país e liga com os filtros de orçamento e exigência, **desafios** (cada um com meta e temporadas) e **ficha do clube** (diretoria, vitrine, clássico, estádio, orçamento com ranking, elenco herdado e análise).
- **Contrato** com assinatura e **coletiva de apresentação** (promessa = meta extra que muda só a confiança da diretoria, que já existe em `engine/board`).
- Tudo só na criação do jogo; novo jogo online continua com o fluxo atual (a liga define o clube).
- Textos e arte nossos: ilustrações (`StadiumArt`, `TrophyArt`), avatares, documentos desenhados por nós.

### Parte 6 · Vestiário: capitão, entrosamento e hierarquia (M)
- **Hoje o MVP exclui vestiário.** Proposta mínima: **capitão** (já existe como dado em `Tactic`), **hierarquia** derivada (idade, anos no clube, nível) e **entrosamento** derivado dos jogos juntos. Efeito: só nos canais que o motor **já usa** (moral e forma, "efeito pequeno"). Se isso afetar o resultado de partidas, passa pelo `test:balance`.
- **Decisão a confirmar:** se o efeito de moral deve mudar, **ou** se a hierarquia fica só como informação. Recomendação: começar informativo.

### Parte 7 · Escritório: imprensa e notícias, sem responder e-mails (M)
- Sala de imprensa com **coletivas por ocasião** (véspera, derrota, vitória), perguntas e manchetes geradas por nós, **veículos e jornalistas fictícios**, com efeito pequeno na confiança da diretoria e na torcida. "O que você disse" como histórico.
- **Caixa de entrada só de leitura** (notícias, boletim médico, avisos), **sem decisões por e-mail** (já temos `NoticeCenter` e o pedido de decisão pelas telas).
- Fica de fora: responder mensagens.

### Parte 8 · Clube: eleições, patrocinador, aposta do ano e "Minha sala" (M)
- Eleições da diretoria depois da última rodada, **escolha de patrocinador** entre 3 ofertas (já temos receita de patrocínio em `engine/finance`), **aposta do ano** (meta extra com prêmio), arquibancada (humor da torcida), e **ranking do técnico** ("para qual banco o mercado dá a você": usar `CAREER`).
- **Desafios** e "amigos" no online (a aba Social pode ser a própria sala da liga).

### Parte 9 · Mercado: "onde falta gente", olheiros e "mercado ao vivo" (P)
- "Onde falta gente" por setor com atalho para a busca (já derivável de `Overview`), nível de olheiro na busca (se a Parte 3 incluir olheiro), e uma lista "movimento do mercado" a partir de `market.history`.

### Parte 10 · Seleções (já planejada para depois do lançamento)
- Mantém a ordem do plano (`docs/plano-mundo-real.md`): fica **depois do lançamento**, como atualização, com os dados no pacote.

---

## 4. Ordem de entrega sugerida e dependências

1. **Parte 1** (partida): maior impacto visual, sem estado novo, sem save novo.
2. **Parte 2a** (agenda e biblioteca) e **2b** (campinho e mini-jogo): a mais cara e a mais pedida.
3. **Parte 3** (adversário): reaproveita telas existentes.
4. **Parte 4** (pré-temporada com amistosos): depende da 2 (dias de treino).
5. **Partes 5 a 8**: independentes entre si; começar pela 5.
6. **Parte 9** junto com a 3.
7. **Parte 10**: pós-lançamento.

## 5. Decisões (respondidas em 18/11/2026)

1) treino por dia só redistribui e "ensaiado" só informa; 2) olheiro antes do lançamento; 3) vestiário só informativo (ideia de efeito na moral anotada para depois); 4) partes 5 a 8 antes do lançamento, uma de cada vez; 5) câmera com arquibancada vira opção desligável abaixo de 60 fps em celular simples.

### Perguntas originais

1. **Treino**: aceitar que a **agenda por dia redistribui o ganho já calibrado** e que os medidores de "ensaiado" ficam só informativos (recomendado), ou aceitar nova calibragem do motor?
2. **Olheiro**: antes do lançamento ou na fase 2?
3. **Vestiário**: informativo (recomendado) ou com efeito em moral?
4. **Escopo do lançamento**: entram as partes 5 a 8 antes do lançamento ou depois (como atualização)?
5. **Desempenho**: aceitar que, se a câmera com arquibancada não mantiver 60 fps em celular simples, ela vira opção desligável.

## 6. Verificações que faltam no estudo (antes de fechar a Parte 1)

Ver a lista de lacunas do inventário: fps real do site na partida, gol/pênalti/troca ao vivo de perto, tela do adversário com olheiro e esquema/base (bloqueados na carreira de teste). Posso refazê-las de forma leve (sem gravar vídeo, uma coisa por vez) quando você quiser.
