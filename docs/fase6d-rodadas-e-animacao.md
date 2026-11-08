# Fase 6D: rodadas da liga online e partida em campo (proposta)

Data: 08/11/2026. **Só proposta: nada foi implementado.** Dois problemas achados no teste com duas contas (computador e celular):

1. os jogos dos técnicos humanos não acontecem juntos;
2. a partida ao vivo no campo 2D é rápida demais, pouco realista e não mostra o estilo do time.

Depois de cada seção há as **decisões que preciso de você** e o que muda de custo, risco e teste. O jogo solo não muda em nenhum dos dois pontos.

---

## Parte 1. Calendário da liga online: todas as partidas dos técnicos no mesmo evento

### 1.1 Por que acontece hoje

A liga online usa o mundo do jogo solo. Cada país (pirâmide) tem a **sua temporada com datas reais**: Brasil de janeiro a dezembro, Europa de julho a junho (jogada de agosto a maio); a Série A brasileira tem pausa a cada 3 rodadas, as ligas têm 29, 30, 34 ou 38 rodadas, as copas caem às quartas, as continentais têm datas próprias. O relógio da liga (`clock.ts`) cria um **evento por data em que algum técnico humano joga** (`eventDaysOf`). Resultado:

- dois técnicos na **mesma liga** quase sempre jogam juntos (mesma rodada, mesma data);
- dois técnicos em **ligas diferentes** (Brasil e Europa, ou Brasil e Argentina) têm datas diferentes: eventos separados, em horários separados;
- uma **copa** no meio da semana dá um evento só para quem a joga.

O mundo tem **um relógio só** (`season.currentDate`): não existe "rodada 12 do Brasil" e "rodada 12 da Inglaterra" no mesmo instante, porque são datas diferentes (e épocas diferentes do ano).

### 1.2 A ideia: um calendário virtual comum para o mundo da liga online

Na liga online **não seguimos o futebol real**: o mundo da liga passa a ter **um calendário virtual único, montado na criação da liga e a cada temporada**, igual para todas as ligas e copas do mundo:

- **Uma temporada só para o mundo inteiro** (ano civil virtual, de 1º de janeiro a 31 de dezembro). Todas as pirâmides começam e terminam juntas. O ano europeu "2026/27" deixa de existir na liga online: todos jogam "Temporada 2026". Contratos, treino, metas, base e virada de temporada já usam o ciclo do clube (`cycles.ts`); com um ciclo igual para todos, a virada acontece de uma vez, no mesmo evento, para todos os técnicos.
- **A rodada N de cada liga cai na mesma data virtual.** A rodada 1 do Brasil, da Inglaterra e da Argentina é o mesmo sábado; a rodada 2 é o sábado seguinte, e assim por diante. A cada 5 rodadas há a rodada de meio de semana, como hoje (`SEASON.midweekEvery`). A pausa de 1 semana a cada 3 rodadas do Brasil (`SEASON.gapEvery`) sai: não há motivo para ela sem o calendário real.
- **Ligas com menos rodadas** (Argentina e MLS com 29, ligas de 18 clubes com 34, elites pequenas com 14 ou 21) **terminam antes**. Ver 1.4.
- **Todas as copas nas mesmas quartas-feiras virtuais.** Copas nacionais e continentais deixam de procurar "uma terça a quinta livre": todas usam a mesma quarta virtual, nas semanas em que a liga está de meio de semana ou em semanas reservadas. Fases de copas diferentes caem no mesmo dia, então não viram eventos diferentes.
- **Janelas de transferência únicas** (uma no começo e uma no meio da temporada, as mesmas para todos os clubes). Isso resolve de quebra um problema do mercado entre técnicos de regiões diferentes, que hoje exige que **as duas** janelas estejam abertas.
- **O evento é a data virtual**, como já é: todas as partidas de técnicos naquela data acontecem juntas, no mesmo horário, com o mesmo Pronto. Pronto, Avançar, ritmo, prazo e partida ao vivo (Fase 6C e fechamento do Pronto) **não mudam**.

Em uma frase: em vez de escolher datas para os eventos dos técnicos, **fazemos todas as datas do mundo coincidirem por construção**, então os eventos coincidem sem remendo.

### 1.3 O que uma rodada é para cada técnico

| Situação do técnico na rodada | O que acontece |
|---|---|
| Joga a rodada de liga | Joga junto com todos. |
| Joga uma copa na quarta virtual | Joga junto com os outros que têm copa naquela quarta. |
| **Não joga** (eliminado da copa, copa sem o clube) | O cartão diz "Seu clube não joga nesta rodada" (já existe: `required: false`). Não precisa dar Pronto, não segura a rodada. Pode seguir treinando, mexendo no mercado e na escalação. |
| **Liga já terminou** (liga curta) | "Sua liga terminou: aguardando a virada da temporada". Mesma regra de quem não joga. |
| Em mata-mata de ida e volta | Jogo de ida e jogo de volta em quartas diferentes, como já são. |

Se **nenhum** técnico tem jogo numa data (por exemplo, rodada de copa em que todos estão eliminados), **não há evento**: o relógio pula para a próxima data com jogo de técnico, como hoje (`eventDaysOf` só lista datas com partida de humano). A IA joga sem parar o jogo de ninguém.

### 1.4 Ligas com número de rodadas diferente

Há duas formas de alinhar uma liga de 29 rodadas com uma de 38. Preciso da sua escolha:

- **A (recomendada): todas começam juntas, as curtas terminam antes.** O técnico da liga curta fica algumas semanas só com copas (se estiver nelas) e com o mercado, e vê o aviso "sua liga terminou". Simples, previsível, e o campeão da liga curta já sai cedo.
- **B: todas terminam juntas, as curtas começam mais tarde.** O técnico da liga curta espera no começo. Mais estranho: o ano começa sem jogo para ele.

Em qualquer das duas, a virada da temporada acontece **para todos no mesmo evento**.

### 1.5 O que muda no código (e o que não)

**Não muda:** `simulateMatch`, o equilíbrio das partidas, o jogo solo e os saves solo (`tests/soloUnchanged.test.ts` e o `matchGolden` continuam sendo a prova). A tabela de uma liga continua sendo "turno e returno, 38 rodadas, método do círculo".

**Muda só para mundos de liga online** (um modo `calendar: 'shared'` na criação do mundo, escolhido pela sala da liga; o jogo solo nunca o liga):
- `src/data/package/leagueDefaults.ts` / `buildPyramid` / `roundSlots`: em modo compartilhado todas as pirâmides usam o mesmo início, o mesmo ciclo e o mesmo desenho de fins de semana e quartas; sem pausas por país.
- `src/engine/cups`: `pickCupDay` em modo compartilhado usa as quartas virtuais fixas em vez de procurar dia livre por clube; copas mundiais seguem as datas virtuais.
- `market/windows.ts`: uma janela só.
- `engine/league/runner.ts` e `clock.ts`: **quase nada**; a regra de eventos por data já serve.
- `store/leagueWorld.ts` e `server/leagueRoom.ts`: a liga guarda o modo do calendário; as **ligas já criadas continuam como estão** (calendário real) e só as novas usam o calendário virtual.

### 1.6 Riscos e o que eu mediria antes de fechar o desenho

- **Equilíbrio das ligas da IA:** as medições longas (`npm run test:long`, `calibracao-real`) foram feitas com os calendários reais. Com calendário compartilhado, o número de partidas por clube é o mesmo; mudam as datas. Eu rodaria a medição de 30 temporadas do pacote real em modo compartilhado (workflow `Medições pesadas`) para confirmar campeões, caixa, idades e craques, e conferir as copas (clubes de países diferentes no mesmo dia: o limite "nenhum jogo do clube na véspera, no dia ou no dia seguinte" precisa ser revalidado).
- **Mundial de Clubes** (a cada 4 anos, com pausa das ligas de ano civil): em modo compartilhado vira uma janela fixa da temporada. Para a primeira versão eu o deixaria **desligado na liga online** e ligaria depois da medição, se você quiser.
- **Ferramenta nova de conferência:** `tools/onlineCalendar.ts`, que monta uma liga com técnicos em países diferentes e imprime, por temporada: quantos eventos há, em quantos **todos** os técnicos jogam e quantas vezes cada um fica sem jogo. A meta é: **em toda rodada de liga, 100% dos técnicos cuja liga ainda não terminou jogam no mesmo evento**.
- **Teste de ponta a ponta:** liga com dois técnicos em países diferentes (um brasileiro e um europeu) passando uma temporada inteira com a IA em copas.

### 1.7 Decisões que preciso de você (Parte 1)

1. Aprova a **temporada única virtual** (a europeia deixa de ser agosto a maio na liga online)?
2. Alinhamento das ligas curtas: **A** (começam juntas, terminam antes) ou **B**?
3. **Mundial de Clubes** fora da primeira versão da liga online?
4. As ligas criadas até agora (teste fechado) **ficam como estão**; aceita que só as novas usem o calendário comum?

---

## Parte 2. Partida ao vivo no campo 2D: ritmo e realismo

### 2.1 O que a tela mostra hoje, e por que parece errado

A tela do campo (`Pitch.tsx`, `pitchModel.ts`) é **só uma representação**: o motor não simula posição de jogador nem trajetória de bola. Para cada momento de posse ele devolve um **resumo** (`PlayTrace`): quem tinha a bola, quem marcou, tipo de jogada (`held`, `dribble`, `through`, `cross`, `long-shot`), alvo do passe, e a finalização com o resultado. A tela inventa as posições e as setas a partir desse resumo, sem sorteio.

Isso explica o que você viu:

- **Ritmo:** a 1x o minuto de jogo dura 700 ms (`MINUTE_MS`) e os 3 ou 4 passos de um lance (meio, progressão, chance, chute) dividem esses 700 ms: ~175 ms por passo. É rápido demais para ler. Só gols e finalizações passam em câmera lenta (2 a 3 s).
- **Chutes do meio-campo:** o motor decide que **o jogador X chutou de longe** (`long-shot`). A tela posiciona o chutador na sua **posição-base de formação** (por exemplo, volante a ~34% do campo) e desenha o chute dali. Não há "correr até perto da área" porque a tela não tem uma sequência de movimento.
- **Cruzamento do escanteio para o outro lado:** o cruzamento é desenhado a partir de um ponto lateral fixo do condutor até um ponto sorteado por hash na área; sem a posição real de quem recebe, a seta pode atravessar o campo. **Antes de mexer vou reproduzir isso com capturas** (`&anim=1&passo=N`) para confirmar a causa exata.
- **Estilo invisível:** a formação e a mentalidade mexem pouco nas posições (`shifted` empurra todos para a frente na mesma proporção em qualquer estilo); posse, contra-ataque e pressão alta ficam iguais na tela.

### 2.2 Princípio: melhorar só o que se vê, sem mexer nos resultados

Tudo abaixo é feito **na tela** (`pitchModel.ts` e `Pitch.tsx`), a partir do que o motor já entrega. Não usa o gerador do motor (continuam valendo hash do minuto e dos ids), não altera nenhuma conta e não muda nenhum resultado: **`tests/matchGolden.test.ts` e os testes de balanceamento precisam continuar passando sem regravar nada**; esse é o critério de aceite.

O que o motor já entrega e basta: quem tem a bola, o tipo da jogada, marcador, alvo, finalização e resultado, `transition` (o momento veio de uma recuperação de bola: contra-ataque), formação e posições em campo (`onPitch` com ponto da grade), mentalidade em uso. O **estilo de cada time** (posse, contra-ataque, pressão alta) é uma escolha do técnico já guardada no estado do lado; se o retrato (`snapshot`) ainda não o expõe, expor é só um campo de leitura, sem sorteio.

**Se alguma parte exigir mexer no motor eu paro e explico antes.** Hoje, nas partes abaixo, **só duas coisas exigiriam o motor**, e eu **não** as incluo sem a sua ordem:
- **Um quarto estilo "bolas longas / lançamentos".** O jogo tem **três** estilos (posse, contra-ataque, pressão alta). Criar um quarto muda as contas do motor e exige nova calibragem (`tests/balance/styles.test.ts`). Proponho **não criar**: os lançamentos aparecem em campo nos contra-ataques, nos passes em profundidade e nas saídas de bola de quem joga em contra-ataque ou com mentalidade ofensiva. Se você quiser mesmo um estilo novo, é uma parte à parte.
- **Posição real da bola e dos jogadores** (simulação 2D de verdade). Seria um motor novo. Não é isto.

### 2.3 Ritmo mais calmo

Dois ajustes separados:

1. **Duração de cada passo da animação.** Cada lance ganha um **tempo próprio por tipo de passo** (passe curto, condução, passe longo, cruzamento, chute) em vez de dividir 700 ms por igual. Ex. a 1x: passe curto ~450 ms, passe longo ~700 ms, condução ~600 ms, cruzamento ~800 ms, chute segue a câmera lenta de hoje (2 a 3 s).
2. **Duração do minuto de jogo a 1x.** Para caber lances mais longos, o minuto precisa durar mais. Proposta: **1x = 1.600 ms por minuto** (hoje 700). Os outros ficam proporcionais (2x = 800 ms, 4x = 400 ms, 8x = 200 ms). O **2x de hoje fica praticamente igual ao 1x antigo**.
   - **Jogo solo:** o 1x passa a ser mais calmo; quem quiser rápido usa 2x, 4x ou 8x. Fica a mesma regra "online 1x = offline 1x" que combinamos.
   - **Liga online:** o padrão continua **2x** (~800 ms por minuto, quase como hoje), então o custo e a duração das rodadas **não mudam**; quem escolher 1x joga uma partida mais longa (cerca de 2,5 a 3,5 minutos). O ritmo de liga (`LIVE_MATCH_MS`) e as medições de custo (`tools/liveCost.ts`) precisam ser refeitas, mas o que muda é só o 1x opcional.

Decisão sua: o valor de **1.600 ms** (se acha lento ou rápido demais, ajusto; ficaria uma constante só, `BASE_MINUTE_MS`) e se o **padrão online** fica em 2x (recomendo) ou passa a 1x.

### 2.4 Cada estilo aparece em campo

Hoje `shifted` aplica o mesmo avanço a todos. A proposta é uma **forma de equipe por estilo e mentalidade** (linha de defesa, distância entre linhas, largura) e uma **coreografia dos lances por estilo**. Valores iniciais (profundidade 0 = própria linha de fundo, 1 = a do rival; serão ajustados vendo a tela):

| Estilo | Forma sem a bola | Forma com a bola | Lances |
|---|---|---|---|
| **Posse** | linhas compactas, defesa em ~0,28 | meio sobe (+0,05), laterais abertos, triângulos | **3 a 6 passes curtos** (≤ ~18 m) entre jogadores próximos e livres antes da jogada decisiva; pouca condução; cruzamento só depois de abrir o jogo |
| **Contra-ataque** | **bloco recuado**, defesa em ~0,18 e meio em ~0,34, só 1 ou 2 atacantes à frente | ao recuperar: **sprint** de 2 a 3 jogadores para a frente | recuperação **atrás** da linha do meio, **1 ou 2 passes longos** (≥ ~35 m) para quem corre, poucos toques, passos mais rápidos; quando `transition` é verdadeiro ele é o lance principal |
| **Pressão alta** | **linhas avançadas** (defesa em ~0,38), 2 ou 3 jogadores fecham quem tem a bola | time inteiro perto da bola, tudo comprimido no campo do rival | recuperações **altas** (perto da área rival) e finalizações logo depois; passes curtos e verticais |
| Mentalidade | cada passo (-2 a +2) move a linha de defesa e o meio em ±0,03 e o número de jogadores que sobem | | muito defensiva: bolas para o ataque saem mais longas; muito ofensiva: laterais e meio-campistas aparecem na área |

Os números da tabela são o ponto de partida; o ajuste final é visual, com capturas lado a lado dos três estilos no mesmo lance (como fizemos nas capturas de 380 px).

### 2.5 Lances que fazem sentido

Regras de montagem das batidas (todas deterministas, sem o gerador do motor):

1. **Passes para quem está perto e livre.** O próximo passador é escolhido entre os companheiros dentro de um raio (≈ 0,18 do campo, ≈ 19 m), **sem marcador a menos de ≈ 0,05**, preferindo a direção do gol em posse vertical e para o lado/trás em posse. Passes longos (≥ 0,3) só existem em contra-ataque, passe em profundidade, saída do goleiro e mentalidade ofensiva.
2. **Chutes de dentro ou perto da área.** O chutador **nunca chuta do meio de campo**: se o motor disse "chute de longe", a tela mostra a condução do jogador **até ~25 a 30 m do gol** (≈ 0,24 a 0,29 do campo) em um ou dois passos de condução e só então o chute; chutes normais saem da área ou da meia-lua; pênalti e falta continuam como hoje.
3. **Cruzamentos da linha de fundo para a área.** O cruzador vai ao fundo ou ao terço final (faixa lateral, `y` ≤ 0,2 ou ≥ 0,8) do **lado em que ele joga**, e a bola vai **para dentro da pequena e da grande área** (`x` entre 0,84 e 0,95 do gol, `y` entre 0,35 e 0,65), onde o motor disse que está quem recebe; no escanteio a bola sai do arco e vai para a área.
4. **Quem não participa do lance** mantém a forma do estilo; quem participa se move com passos proporcionais à distância (sem teletransporte).
5. **Disputa do meio** com mais calma: a bola não aparece "do nada" no meio-campista; ela vem de uma batida de recuperação ou de saída de bola.

### 2.6 Como entregar, medir e aprovar

Em quatro pequenas etapas, cada uma testada e com capturas de 380 px **antes e depois** em `.shots/`:

1. **Reprodução e catálogo** (sem mudar nada): capturas dos problemas atuais (chute do meio, cruzamento do escanteio, os três estilos iguais) com os atalhos de desenvolvimento `&anim=1&passo=N`.
2. **Ritmo:** tempo por tipo de passo e `BASE_MINUTE_MS` (decisão 2.3).
3. **Forma e coreografia por estilo** (posse, contra-ataque, pressão alta, mentalidade).
4. **Lances com sentido** (passes para quem está perto e livre, chutes perto da área, cruzamentos ao fundo para a área).

**Testes novos** (puros, em `pitchModel`): a bola nunca vai a mais de 0,2 em passe curto; chute de longe nunca parte de mais de 0,3 do gol; cruzamento sempre termina na área e começa no terço final; estilo muda a profundidade da defesa na ordem esperada (pressão > posse > contra-ataque); a animação não usa nenhum sorteio. **Critério de aceite:** `tests/matchGolden.test.ts` e `npm run test:balance` **sem nenhuma regravação**. O motor não é tocado.

### 2.7 Decisões que preciso de você (Parte 2)

1. **Minuto a 1x = 1.600 ms** (e 2x = 800 ms) está bom?
2. **Padrão da liga online continua 2x?** (recomendo: a duração das rodadas e o custo ficam como hoje).
3. **Não criar um quarto estilo "lançamentos"** e mostrar as bolas longas dentro dos três estilos que existem?
4. Se, na etapa 1, a reprodução mostrar que algum defeito só some mexendo no motor, eu **paro e te explico antes**.

---

## Ordem e custo

- **Parte 2 (animação)** não toca servidor, banco nem motor: entra só no site. Pode ser feita antes ou em paralelo com a Parte 1.
- **Parte 1 (calendário)** mexe no mundo da liga online e no servidor (`LeagueRoom`), e **depois de pronta pede `wrangler deploy`** (sem migração de banco e sem custo novo; aviso antes). As ligas criadas até agora continuam como estão.
- **Nada será publicado sem o seu aviso.** Peço a decisão das perguntas das seções 1.7 e 2.7 antes de começar.

---

## Respostas recebidas (08/11/2026) e ordem do trabalho

Parte 1 (calendário): **aprovada como proposta**: temporada única virtual, ligas curtas começam juntas e terminam antes (opção A), Mundial de Clubes fora da primeira versão, só as ligas novas usam o calendário comum. Parte 2 (campo 2D): **aprovada**: 1x = 1.600 ms por minuto, padrão da liga online continua 2x. **Novo:** estilos de jogo novos (Parte 3). Ordem combinada: Parte 2 com os estilos de hoje, depois Parte 1, cada uma testada e na main; **os estilos novos esperam a sua resposta** à Parte 3. Antes de publicar qualquer parte e antes da medição de 30 anos no workflow eu aviso.

---

## Parte 3. Estilos de jogo novos (proposta, para decidir antes de implementar)

**Esta parte mexe no motor.** Hoje há três estilos (`PlayStyle`): posse, contra-ataque, pressão alta. Proponho **quatro novos**, escolhidos na tela de Tática do Elenco, valendo no solo e no online:

| Id | Nome na tela | Em uma frase |
|---|---|---|
| `direct` | Lançamento direto | bolas longas para os atacantes, quase sem o meio-campo |
| `tiki-taka` | Toque de bola | posse paciente com passes curtos, mais extrema que a Posse |
| `total-press` | Pressão total | a pressão mais agressiva possível, que cansa o time |
| `wings` | Jogar pelas pontas | tudo pelos lados e cruzamentos para a área |

**Pergunta de nome:** você escreveu "toque de bola (posse de bola)". Já existe **Posse**. Entendi "Toque de bola" como um estilo **novo e mais radical** que a Posse (muitos passes curtos, pouca chegada em profundidade, mais exposto à pressão). A Posse continua como é hoje, o estilo moderado. Se você queria só trocar o nome da Posse, a lista cai para três novos.

### 3.1 O que cada estilo faz no motor

Tudo reaproveita os mesmos botões que os estilos de hoje usam (`MATCH.tactics` em `config.ts`) e acrescenta, em cada um, **uma dependência do elenco**, para que o estilo só renda quando o time tem o perfil. Os números são ponto de partida: **o valor final sai da calibragem** (3.5).

**Lançamento direto** (`direct`)
- Abre mão do meio: controle do meio **−7** (a Posse tem +6).
- Mais **cruzamentos e cabeceios** (peso do cruzamento ×1,4, do passe em profundidade ×1,3, do chute de longe ×0,6) e a progressão do ataque ganha um bônus que **depende dos atacantes**: média de cabeceio, força e velocidade dos atacantes contra a dos zagueiros rivais (cabeceio e posicionamento). Atacantes altos, fortes ou rápidos fazem o estilo funcionar; sem eles, ele perde.
- **Forte contra** pressão alta e pressão total (pula o meio, onde a pressão age: a pressão rival rende −5 contra ele). **Fraco contra** time que domina o meio (toque de bola) e contra zaga alta e forte.
- Cansa pouco (×0,9).

**Toque de bola** (`tiki-taka`)
- Controle do meio **+9** (a Posse tem +6), mas o bônus **escala com a qualidade do meio** (passe, visão, controle): com meio-campistas ruins o estilo rende pouco.
- Cara a cara **−0,6** (menos chances claras), chute de longe ×0,4, passe em profundidade ×1,4. Cansa pouco (×0,85).
- **Forte contra** direct e contra-ataque que cede a bola. **Fraco contra** pressão total (a pressão rival ganha +4 de efeito contra ele) e **perde a bola em lugar perigoso**: quando perde, o rival sai em transição com mais chance (+0,1 sobre a de hoje).

**Pressão total** (`total-press`)
- Pressão **+13** (a pressão alta tem +9), espaço nas costas **+0,35** (a pressão alta deixa 0,25), transição ao roubar a bola **0,28** (pressão alta: 0,2).
- **Custo físico real:** cansa **×1,4** (pressão alta: ×1,2) e o bônus de pressão **cai com a condição média dos titulares** (100% no começo, ~55% com a condição em 60): o time faz um primeiro tempo forte e se desgasta; depende de **resistência e idade** do elenco.
- **Forte contra** toque de bola e posse. **Fraco contra** lançamento direto (bola por cima da pressão) e contra jogo pelas pontas (as costas expostas).

**Jogar pelas pontas** (`wings`)
- Peso de **cruzamento ×1,8** e de **drible ×1,2**; condutor com mais peso para laterais e pontas (×1,4); passe em profundidade ×0,6; controle do meio **−1**.
- O efeito **escala com o número de jogadores de lado** na formação (laterais e pontas: 0 a 4) e com **cruzamento, drible e velocidade** deles e o **cabeceio dos atacantes**; formação sem lados quase não ganha nada.
- **Forte contra** pressão total e times com laterais fracos no desarme. **Fraco contra** zaga forte no jogo aéreo e contra time compacto que cobre as faixas (a regra de faixa sem cobertura que já existe pesa aqui).

### 3.2 Por que nenhum estilo é o melhor sempre

- **Pedra, papel e tesoura declarado:** cada estilo tem 2 confrontos que favorecem e 2 que prejudicam (pressão total > toque de bola, direto > pressão total, toque de bola > direto, pontas > pressão total...), com saldo total zero entre todos. Cada confronto vale poucos pontos de atributo: a força do elenco continua mandando.
- **Cada estilo tem um custo:** cansaço (pressão total), dependência do elenco (direto, pontas, toque), risco de transição rival (toque), pouco controle do meio (direto e pontas).
- **Os três estilos de hoje não mudam nenhum número.** O código novo só roda quando um dos estilos novos está em campo (o `matchGolden` de hoje continua idêntico).

### 3.3 Como a IA escolhe o estilo

A IA escolhe **no começo de cada temporada** (e na criação do mundo) e não troca no meio do jogo (continua só ajustando a mentalidade pelo placar):
1. Calcula, para cada estilo, um **ajuste ao elenco**: direto pelo cabeceio, força e velocidade dos atacantes; pontas pela qualidade dos laterais e pontas; toque pelo passe, visão e controle do meio; pressão total pela resistência média e pela idade; contra-ataque pela velocidade dos atacantes e pela fraqueza do meio; posse e pressão alta como hoje.
2. Soma um **peso por reputação** (os fracos tendem a contra-ataque e direto; os grandes a posse, toque e pressão) e um **desvio fixo por clube** (hash do id) para variar clubes parecidos.
3. Sorteia entre os melhores ajustes com a semente da temporada (determinístico).

Alvo: nenhum estilo com mais de ~30% dos clubes de uma liga. Saves antigos **mantêm** os estilos atuais; os novos entram a cada virada de temporada.

### 3.4 Como cada estilo aparece no campo 2D

Os estilos de hoje e os novos usam o mesmo mecanismo da Parte 2 (forma da equipe e coreografia dos lances):
- **Toque de bola:** meio alto e compacto, 4 a 7 passes curtos entre triângulos.
- **Lançamento direto:** defesa e meio atrás da bola, passe longo do zagueiro ou do volante para o atacante alto, segunda bola e cabeceio.
- **Pressão total:** todas as linhas na metade do rival, 3 ou 4 jogadores fecham quem tem a bola, goleiro adiantado.
- **Pontas:** laterais e pontas abertos e altos, condução pela linha lateral e cruzamento do fundo para a área com os atacantes dentro dela.

### 3.5 Plano de calibragem (antes de qualquer publicação)

1. **Sem tocar nos três estilos atuais:** o `tests/matchGolden.test.ts` de hoje passa **sem nenhuma regravação**. As partidas novas ganham **entradas novas** no arquivo de referência.
2. **Ferramenta:** estender `npm run analyze -- styles` para os 7 estilos (todos contra todos, elencos equivalentes, milhares de partidas), com a matriz de pontos por confronto.
3. **Teste de equilíbrio novo** (`tests/balance/styles.test.ts` ampliado): com elencos equivalentes, **nenhum estilo passa de ~+3% da média nem fica abaixo de ~−3%**; nenhum confronto passa de ~60% de vitórias; um estilo **com o elenco certo** ganha no máximo ~+4% e **com o elenco errado** perde no máximo ~−4%; gols por jogo e mandante continuam nas metas (2,3 a 2,5; 45 a 50%).
4. **Longo prazo:** pacote real, 30 temporadas, sementes 7, 11 e 23 (`calibracao-real`): campeões, pontos do campeão (70 a 82), caixa, força, idades e craques **como hoje**; distribuição de estilos por liga (~30% no máximo por estilo). **Essa medição roda no workflow `Medições pesadas`: eu aviso antes de você precisar rodá-la.**
5. **Impressão digital do solo** (`tests/soloUnchanged.test.ts`): como a IA passa a escolher estilos novos, o estado inicial de um jogo novo muda. Vou **regravar a impressão digital de propósito**, só depois da calibragem, e explico o motivo.

### 3.6 Onde mexe

- Tipos e rótulos: `PlayStyle` (`types/tactics.ts`), `PLAY_STYLE_LABELS` e `PLAY_STYLE_DESCRIPTIONS` (`labels.ts`), `STYLES`.
- Motor: `controlScore`, `pressScore`, `progressionOffset`, escolha do tipo de jogada (`MATCH.playTypeWeight`), `maybeCounter`, `applyFatigue` e `MATCH.fatigue.style` (um valor por estilo novo).
- IA: `generateTeam.ts` (`pickStyle`) e a escolha da virada de temporada.
- Protocolo da liga online: lista de estilos aceitos nos comandos de tática e no ao vivo (`liveProtocol.ts`, `parseCommand`).
- Telas: seletor de estilo na Tática (`Tactics.tsx`) e na Escalação, e as descrições.
- **Ao vivo:** hoje a aba Tática da partida também troca o estilo (`Match.tsx`, `setStyle`). Você disse que ao vivo os controles continuam como estão; **proponho manter exatamente isso: o seletor ao vivo continua e passa a listar os sete estilos.**

### 3.7 Decisões que preciso de você (Parte 3)

1. "Toque de bola" é um estilo **novo, mais radical que a Posse** (e a Posse continua)? Ou era só um nome para a Posse?
2. Ao vivo, o seletor de estilo lista os **sete** estilos (como hoje, com mais opções) ou os novos só valem escolhidos antes da partida?
3. A ideia de cada estilo e as relações da seção 3.2 estão de acordo como ponto de partida? A calibragem ajusta os números.
4. Aprova que a IA escolha estilos novos **só a partir da virada de temporada**, sem mudar saves antigos no meio?

---

## Feito: Parte 2 (campo 2D) e Parte 1 (calendário comum) (08/11/2026)

**Nada publicado.** As duas partes estão na main, testadas. Os estilos novos (Parte 3) **esperam a sua resposta**.

### Parte 2: campo 2D (só a tela, o motor não foi tocado)

- **Ritmo:** `BASE_MINUTE_MS` passou de 700 para **1.600 ms** (1x); 2x = 800, 4x = 400, 8x = 200. Vale no solo e no online. **Atenção ao padrão online:** na proposta eu escrevi que manter o 2x deixava a duração das rodadas "como hoje". Estava errado: o 2x de hoje durava 350 ms por minuto, o novo 2x dura 800 ms. Uma partida online no padrão passa de ~1 min 15 s para ~2 min 50 s (mais as câmeras lentas). Para ficar como hoje basta o padrão online ser **4x** (400 ms): é uma constante (`DEFAULT_SPEED` em `engine/league/live.ts`). Deixei em 2x, como você respondeu; **me diga se prefere 4x**. O tempo do lance agora é por passo (`Beat.weight`: passe curto menos, bola longa, cruzamento e chute mais) e o que não cabe em 260 ms por passo é omitido (`fitBeats`).
- **Forma por estilo** (`pitchStyle.ts`, `basePositions` com `shape`): posse com linhas altas e compactas, contra-ataque com bloco recuado (defesa em ~0,18 do campo), pressão alta com as linhas adiantadas; a mentalidade move as linhas em ±0,03 por nível; sem a bola o contra-ataque recua mais e a pressão alta quase não recua.
- **Lances que fazem sentido** (`beatsFor`): passes curtos (≤ ~19 m) para companheiros perto e livres de marcador, só para quem está em campo; a posse constrói de trás com mais passes e o contra-ataque sai em **bola longa**; o chute de longe sai de ~26 m do gol (o condutor avança antes), os outros chutes de dentro ou da beira da área; o cruzamento sai do fundo, pela faixa do lado do condutor, para dentro da área, com dois atacantes esperando.
- **Testes:** `tests/pitchPlays.test.ts` (chute, cruzamento, passes, estilos, tempo) e os do campo antigo ajustados; **`matchGolden` e `soloUnchanged` passam sem regravar nada**. Capturas de 380 px: `.shots/d1-campo-{posse,contra-ataque,pressao-alta}.png` (`tools/online-lab/d1-campo-shots.mjs`).

### Parte 1: calendário comum da liga online (só ligas novas)

- **Como funciona:** `createLeagueWorld(..., { shared: true })` (a sala da liga passa a usar para ligas novas) monta **uma temporada só** (ano civil virtual), com `Competition.shared = true`: todas as ligas começam em 24/1, a **rodada N cai no mesmo sábado em qualquer país** (a rodada inteira num dia só; a de meio de semana, a cada 5, é a mesma quarta, inclusive a última de uma liga curta), sem pausas de calendário; ligas curtas terminam antes (opção A); **uma janela de transferências só** para todos (`windowRegionOf`, `regionOfTeam`); **todas as copas em quartas-feiras** da mesma grade (`pickCupDay` com `grid`), com as datas de referência das copas europeias deslocadas seis meses para caber no ano civil (`sharedCupSpecs`); **Mundial de Clubes e Intercontinental ficam de fora**.
- **O jogo solo e as ligas já criadas não mudam** (`soloUnchanged` passa).
- **Medido** (`PACOTE_REAL=1 node tools/run.mjs onlineCalendar`, 6 técnicos em Brasil, Inglaterra, Argentina, Espanha, Itália e Japão, pacote real): **calendário de cada país: 132 datas com jogo, rodadas de liga com todos juntos em 4%; calendário comum: 50 datas e 100% das rodadas de liga (38 de 38) com todos os técnicos de liga ainda ativa jogando juntos**, nenhuma partida da primeira temporada depois de 31/12 e a virada de temporada de todos os países no mesmo dia (31/12).
- **Limite conhecido:** nas rodadas de **copa** (quartas) só joga quem está na copa daquela semana; os outros veem "Seu clube não joga nesta rodada" e não seguram ninguém. Copas diferentes na mesma semana caem na mesma quarta, mas nem toda semana de copa envolve todos os técnicos.
- **Testes:** `tests/sharedCalendar.test.ts` (8: ano civil único, rodada N no mesmo dia, técnicos de países diferentes juntos nas rodadas, nada depois do fim da temporada, copas em quartas, janelas únicas, funções puras, e a **virada de temporada mantendo o calendário comum**).
- **Medição de 30 anos no workflow `Medições pesadas`:** ainda **não rodei**. Antes de publicar eu preciso dela com o calendário comum (equilíbrio das ligas da IA: campeões, caixa, força, idades; copas e fim da temporada com as datas novas). Aviso antes.

---

## Parte 3, versão final: 5 estilos (implementada em 08/11/2026)

**Decisões suas:** "Toque de bola" é o novo nome da **Posse** e "Pressão total" o novo nome da **Pressão alta**; entram só **dois estilos novos**, **Lançamento direto** e **Jogar pelas pontas**. Total de 5. Ao vivo o seletor continua como estava, listando os 5. A IA escolhe os estilos a partir da virada de temporada, sem mudar saves antigos no meio. O padrão da liga online fica em 2x.

Isto **substitui** a seção 3 acima (que propunha quatro estilos): os ids `possession` e `high-press` continuam os mesmos, com os mesmos números (só os rótulos mudaram), então os saves, a liga online e as medições de antes seguem valendo. Os estilos são `PLAY_STYLES` (`types/tactics.ts`), a lista única que o comando de tática, a carreira, o protocolo ao vivo e as telas usam.

| Id | Nome na tela | O que faz no motor |
|---|---|---|
| `possession` | Toque de bola | como a Posse de sempre (controle do meio +6, menos cara a cara) |
| `counter-attack` | Contra-ataque | como sempre |
| `high-press` | Pressão total | como a Pressão alta de sempre (pressão +9, cansa ×1,2, espaço nas costas) |
| `direct` | Lançamento direto | controle do meio −2; passe em profundidade ×1,3, cruzamento ×1,4, chute de longe ×0,6; cansa ×0,9; **bônus de progressão** de 0,16 fixo + até ±0,6 conforme o jogo aéreo e físico dos atacantes (cabeceio, força, velocidade) contra o da zaga (cabeceio e posicionamento); **a pressão rival rende 8 pontos a menos** contra ele |
| `wings` | Jogar pelas pontas | controle do meio 0; cruzamento ×1,8, drible ×1,2, passe em profundidade ×0,6; laterais e pontas pesam ×1,4 como condutor; **bônus de progressão** de 0,33 fixo + até ±0,55 conforme **quantos jogadores de lado** a formação tem (0 a 4) e o cruzamento, drible e velocidade deles contra o desarme e a velocidade dos laterais rivais; +0,1 contra pressão alta |

**Pontos fortes e fracos (o que vale como relação entre eles, ver a matriz medida abaixo).** Direto rende com atacantes altos, fortes ou rápidos e passa por cima da pressão, mas cede o meio e some sem esses atacantes. Pontas rende com jogadores de lado bons e uma formação com laterais e pontas, e sofre sem eles. Toque de bola depende de meio-campistas de passe e visão. Pressão total cansa mais. A força do elenco continua mandando.

**Como a IA escolhe (`styleChoice.ts`, `chooseAiStyles`):** na virada, para os clubes sem técnico humano de cada país, cada estilo recebe a nota de ajuste ao elenco (direto: cabeceio, força e velocidade dos atacantes; pontas: cruzamento, drible e velocidade de laterais e pontas; toque: passe, visão e controle do meio; pressão total: fôlego, desarme e juventude; contra-ataque: velocidade dos atacantes e meio menos forte), **medida contra os outros clubes do país** (cada estilo tem escala própria), mais peso pela reputação (os grandes tendem a toque de bola e pressão; os pequenos a contra-ataque e direto), +0,5 para o estilo que o clube já joga e um desvio fixo por clube e temporada (hash). Determinístico. O mundo novo continua nascendo com os três estilos de antes.

**Como aparecem no campo 2D:** direto com defesa e meio atrás da bola e bola longa para o atacante; pontas com o time mais largo, laterais e pontas altos e cruzamento do fundo; os outros três como na Parte 2.

### Calibragem (medida)

Ferramentas novas: `node tools/run.mjs styleMatrix [--mundos N --pares N]` (cada estilo contra cada estilo, mesmos elencos, pontos por jogo, dependência do elenco) e `PACOTE_REAL=1 node tools/run.mjs styleDistribution [--anos N]` (estilos escolhidos pela IA nas viradas).

1. **Os três estilos de antes não mudaram:** `tests/matchGolden.test.ts` passa **sem regravar nada**.
2. **Equilíbrio** (`tests/balance/styles.test.ts`, agora com os 5 estilos, 5 mundos, 20 times, 38 partidas cada): **passa** (diferença entre os estilos até 0,06 ponto por jogo e até 0,12 de saldo, como antes).
3. **Matriz** (4 mundos, 40 pares, pontos por jogo do estilo da linha contra o da coluna; média de cada estilo contra todos): toque 1,41, contra-ataque 1,34, pressão total 1,32, direto 1,44 (antes do último ajuste do bônus), pontas 1,35. Maior desvio de um confronto: 0,17 ponto por jogo (1,23 a 1,57). O direto foi baixado depois disso (bônus de 0,24 para 0,16).
4. **Escolha da IA** (pacote real, 15 ligas de elite): antes 31% toque, 41% contra-ataque, 28% pressão (os novos 0%); depois de 1 virada: **toque 23%, contra-ataque 22%, pressão total 18%, direto 19%, pontas 17%** (nenhum estilo passa de 30%).
5. **Impressão digital do solo regravada de propósito** (`tests/fixtures/solo-digest.json`): conferi que a **única** causa é a IA escolher os estilos novos na virada (com a escolha desligada a impressão digital antiga volta a passar).
6. **Falta:** a medição de 30 anos no workflow (calendário comum e estilos novos juntos), que você roda uma vez só. **Ainda não rodou.**
