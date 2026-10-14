# Meu Manager — Jogo de técnico de futebol

Jogo de gerenciamento de futebol para navegador e celular, inspirado no Brasfoot, mas mais profundo: o resultado das partidas deve depender de atributos específicos dos jogadores e das escolhas táticas, não só da força geral do time. O jogo precisa continuar **rápido** como o Brasfoot (uma temporada inteira em pouco tempo).

Idioma do jogo e do código: textos da interface em português do Brasil. Nomes de variáveis, funções e tipos em inglês.

**Valores de texto dos tipos também são em inglês** (ex.: `'possession'`, `'finished'`, `'counter-attack'`, posições `GK`, `CB`, `ST`). O português só existe na interface: todos os rótulos ficam em `src/ui/labels.ts` (`Record<Tipo, string>`, para o TypeScript acusar rótulo faltando). Nunca escrever texto em português dentro de `src/engine` ou `src/data`, exceto a narração das partidas e nomes próprios (jogadores, apelidos, times, cidades, estádios). Nacionalidades são valores em inglês (`'Brazil'`) com rótulo em `labels.ts`. Ao criar um valor novo em um tipo, adicionar o rótulo em `labels.ts`.

---

## Stack

- **TypeScript** (modo `strict`) em todo o projeto
- **React + Vite** para a interface
- **Tailwind CSS** para estilo, mobile-first
- **Vitest** para testes
- **Dexie (IndexedDB)** para salvar o jogo no navegador
- **PWA** para instalar no celular
- Sem backend no MVP

## Arquitetura (regras importantes)

```
src/
  engine/   lógica pura do jogo (partida, temporada, mercado, evolução)
  data/     geração de mundo: times e jogadores fictícios, nomes
  store/    estado do jogo e salvamento (Dexie)
  ui/       telas e componentes React
tests/      testes do motor e de balanceamento
docs/       documentos de design
```

1. **`src/engine` não importa nada de React, do DOM ou do `store`.** É TypeScript puro e testável isoladamente.
2. **Toda aleatoriedade usa um gerador com semente (seed)** passado como parâmetro. Nunca usar `Math.random()` no motor. Mesma semente = mesmo resultado.
3. **Dados derivados não são guardados**: a classificação é calculada a partir das partidas finalizadas (com cache por rodada).
4. Funções do motor recebem dados e devolvem dados novos; evitar mutação escondida.
5. Toda regra nova do motor vem acompanhada de teste.

---

## Modelo de dados

### Jogador
- **Identidade:** id, nome, idade, nacionalidade, pé preferido (direito/esquerdo/ambos), posição principal e até 2 posições secundárias.
- **Posições:** GK, RB, LB, CB, DM, CM, AM, RW, LW, ST (na interface: GOL, LD, LE, ZAG, VOL, MC, MEI, PD, PE, ATA).
- **Escala:** todos os atributos (visíveis e ocultos) e a força geral são **inteiros de 1 a 100** (limites em `ATTRIBUTE_MIN`/`ATTRIBUTE_MAX` no `config.ts`); a força geral calculada é decimal e só se arredonda para exibir. Só a **reputação dos times continua de 1 a 20**. Penalidades de posição são proporções (multiplicadores), então valem em qualquer escala.
- **Atributos visíveis (1 a 100):**
  - Técnicos: passe, finalização, drible, cruzamento, desarme, cabeceio, controle de bola
  - Físicos: velocidade, resistência, força
  - Mentais: visão, posicionamento, decisão, determinação
  - Goleiro: reflexos, saída do gol (goleiro também usa posicionamento)
- **Atributos ocultos (1 a 100):** potencial (mesma escala da força geral), consistência, propensão a lesão, profissionalismo.
- **Estado:** condição física (0–100), moral, forma (média das últimas notas), lesão (dias restantes), cartões e suspensão.
- **Contrato:** salário, data de término, multa rescisória, clube de origem se emprestado.
- **Força geral:** calculada a partir dos atributos com pesos por posição (ex.: zagueiro pesa desarme, cabeceio, posicionamento; atacante pesa finalização, velocidade, drible). Jogar fora da posição principal aplica penalidade; posição secundária tem penalidade menor.
- **Faixas de força no mundo gerado:** titulares da Série A ~55 a 85; da Série B ~40 a 65. Craques (acima de ~85) são poucos no campeonato inteiro, só em times grandes da A; atributos acima de 90 são raros. A calibragem fica em `src/data/generationConfig.ts` e é coberta por testes.

### Time
- **Identidade:** id, nome, abreviação de 3 letras, cidade, estado, 2 cores, estádio (nome e capacidade).
- **Reputação (1 a 20):** influencia atração de jogadores, patrocínio, público e meta da diretoria. Muda devagar conforme resultados.
- **Elenco:** máximo 30, mínimo 18 jogadores.
- **Tática salva:** formação, estilo, mentalidade, 11 titulares, reservas, capitão, cobradores de pênalti e falta. A IA usa a mesma estrutura.
- **Finanças:** saldo, orçamento de salários, orçamento de transferências, registro de receitas/despesas por categoria. MVP: bilheteria, patrocínio, venda de jogadores / salários, compras.
- **Torcida:** tamanho (define público junto com reputação e preço do ingresso).
- **Diretoria:** meta da temporada baseada na reputação; muito abaixo da meta = demissão.
- **Histórico:** posição final por temporada e títulos.

### Temporada e calendário
- Guarda ano, data atual, competições e fase (pré-temporada, em andamento, encerramento).
- **O jogo avança por dias.** O botão "avançar" pula até o próximo evento relevante (jogo, proposta, fim de janela).
- **Implementado em `src/engine/season/`:** `createSeason` monta a temporada das duas séries (partidas com data e seed própria); `nextEvent` / `advanceToNextEvent` pulam até o próximo dia de jogos e o simulam (hoje o único evento; propostas e janela entram com o mercado); `computeStandings` e `StandingsCache` calculam a classificação a partir das partidas finalizadas. Rodadas no sábado/domingo (a última, toda no domingo) e uma a cada 5 na quarta; constantes em `SEASON` no `config.ts`. O estado da temporada (`SeasonState`) é só dado: a classificação nunca é guardada.

### Competição
- Campo `tipo` (no MVP só `liga`; depois `mata-mata` e `grupos+mata-mata`).
- Liga: 20 times, turno e returno, 38 rodadas. Vitória 3 pts, empate 1.
- **Desempate (Brasileirão):** pontos, vitórias, saldo de gols, gols marcados, confronto direto, cartões vermelhos, cartões amarelos, sorteio.
- Tabela gerada pelo **método do círculo**; returno espelha o turno com mando invertido; alternar mandos (evitar 3 jogos seguidos fora).

### Partida
- Competição, rodada, data, mandante, visitante, status, **seed usada**.
- Após jogada: placar, eventos (gol, cartão, lesão, substituição, com minuto e jogador), estatísticas (posse, finalizações, no alvo, escanteios, faltas, cartões, xG), nota de cada jogador, condição física final.

---

## Motor de partida

Simulação por jogadas decididas por duelos entre jogadores específicos. Cerca de 90–100 momentos de posse por partida. Uma partida deve rodar em milissegundos.

### Etapas de cada momento (pode terminar em qualquer uma)
1. **Disputa do meio:** quem fica com a bola. Meio-campo (passe, visão, controle, posicionamento) contra (desarme, posicionamento, resistência).
2. **Progressão:** sorteia condutor (peso por posição) e marcador. Atributos conforme o tipo de jogada:
   - drible: drible + velocidade × desarme + velocidade
   - passe em profundidade: passe + visão × posicionamento
   - cruzamento: cruzamento × posicionamento do lateral
3. **Criação da chance** (xG base por tipo): chute de fora (baixo), cabeceio após cruzamento (médio, cabeceio × cabeceio do zagueiro), finalização na área (alto), cara a cara (muito alto).
4. **Finalização × goleiro:** xG ajustado por finalização contra reflexos + posicionamento do goleiro. Resultados: gol, defesa (pode gerar escanteio), fora, bloqueio.

Eventos paralelos: faltas (mais com marcação agressiva), cartões, pênaltis, escanteios, lesões (propensão a lesão + condição física baixa).

### Fórmula do duelo
```
chance = 1 / (1 + e^(-k × (ataque − defesa)))
```
Pontuação de cada lado = média ponderada dos atributos envolvidos × modificadores. `k` é constante de calibragem (fica em um arquivo de configuração do motor).

### Modificadores
- Condição física (cai durante o jogo conforme resistência e estilo)
- Moral e forma (efeito pequeno)
- Consistência (variação de desempenho)
- Fator casa (pequeno; maior com estádio cheio). Depende da **ocupação** (percentual do estádio, não o público absoluto) e é escalado pelo nível dos titulares do mandante (`MATCH.home.referenceLevel`): como os atributos são multiplicados, o mesmo percentual valeria menos pontos de atributo na Série B e o mandante venceria menos lá
- Posição improvisada

### Tática
- **Estilos:** posse (ganha meio, menos chances cara a cara), contra-ataque (menos posse, transições de alta qualidade), pressão alta (recupera bola alta, cansa mais, deixa espaço nas costas).
- **Mentalidade:** de muito defensiva a muito ofensiva; desloca peso entre atacar e defender.
- **Formação:** define quantos jogadores entram em cada setor/duelo. Cada formação tem um perfil (`MATCH.formation.profile`: controle do meio e criação de chances) **calibrado por medição** para que, com elencos de mesma força, nenhuma seja melhor que as outras na média; elas mudam o jeito de jogar (posse, chances), não o nível. Formação nova precisa de perfil calibrado (`tests/balance/formations.test.ts`).
- Toda opção tática precisa ter um custo. **Nenhum estilo pode ser claramente pior** (`tests/balance/styles.test.ts`).

### Comportamento da IA durante a partida
O motor hoje ajusta sozinho, para os dois times: trocas por cansaço (a partir dos 60'), postura conforme o placar na reta final (quem vence recua, quem perde ataca) e postura de azarão (time bem mais fraco que o rival entra mais defensivo).
- **Time do jogador (etapa 6):** `MatchInput.userControlled` faz a IA do motor **não alterar a tática do time controlado pelo jogador** (nem recuo de azarão, nem postura pelo placar, nem substituições por cansaço); esse time só muda quando o jogador mandar (intervalo, substituições). Lesão ainda tira o jogador de campo (entra o melhor reserva). O mesmo vale para a escalação automática e o rodízio de `advanceToNextEvent` (`aiTactic`): o time do jogador fica de fora. Os testes de balanceamento continuam com IA nos dois lados.
- **Partida ao vivo:** `startMatch(input)` devolve um `LiveMatch` (`playUntil(minuto)`, `snapshot`, `setStyle`, `setMentality`, `setFormation`, `substitute`, `result`); `simulateMatch` é `startMatch` jogado até o fim, com resultado idêntico, em quantos passos for jogada.

### Condição entre as partidas (`src/engine/season/condition.ts`)
O estado da temporada (`SeasonState`) leva os times e jogadores, porque a condição muda a cada dia de jogos:
- **Por dia:** condição física recupera `CONDITION.fitnessPerDay` (mais rápido com resistência alta), os dias de lesão caem e a moral volta ao neutro (70).
- **Depois de cada partida:** condição final do jogo; lesão sofrida vira dias de lesão; **forma** = média das notas das últimas 5 partidas (só conta quem jogou 20 min ou mais); **moral** sobe/desce com o resultado (todo o elenco) e com a nota de quem jogou; estatísticas da temporada (jogos, minutos, gols, assistências, cartões).
- **Suspensões:** vermelho = 1 jogo; 3 amarelos acumulados = 1 jogo (e o contador zera). Expulsão por segundo amarelo vale como um vermelho só. Quem está suspenso ou lesionado não entra na escalação e a suspensão é cumprida no jogo seguinte do time.
- **Rodízio da IA:** `aiTactic` mantém formação, estilo e mentalidade do time, escala só quem está disponível e valoriza a condição física (`LINEUP`): titular muito cansado dá lugar a um reserva descansado.

### Nota do jogador
Parte de 6,0 e soma/subtrai por ações (gols, assistências, desarmes, erros, defesas, cartões).

### Metas de calibragem (média de milhares de partidas)
- ~2,3 a 2,5 gols por jogo
- mandante vence ~45–50%, empates ~25–30%
- ~12 finalizações por time por jogo

Metas por temporada da Série A (temporada média; cada temporada isolada varia por sorte):
- campeão com ~70 a 82 pontos
- empates entre 24% e 30%
- elencos mais fortes terminam em cima e os mais fracos embaixo, com espaço para zebras: o top 4 de força termina em média por volta do 4º–5º lugar, o elenco mais forte por volta do 3º, e há títulos e vagas no G4 fora do top 4 de força
- estilos de jogo e formações rendem parecido com elencos equivalentes

Metas de longo prazo (10 temporadas seguidas, `tests/balance/longRun.test.ts`, `npm run analyze -- years`): nenhum clube da IA no vermelho em nenhum momento nem acumulando caixa além do teto (`FINANCE.ceilingYears`); força média dos titulares da Série A (±3) e da B (±4,5) estável; idade média entre 24 e 28, menos de 40% com até 21 anos e entre 12% e 32% com mais de 30; promessas (até 21 anos, potencial ≥ 75) em número parecido com o início; elencos entre 18 e 30; campeões variados. A distância de força entre as séries se mantém (A ~10 pontos acima da B): a cota de TV por divisão (`FINANCE.tvRights`, bem maior na A) e a reputação que volta ao patamar da divisão (`OFFSEASON.reputation.tierMean/tierPull`) seguram a A em cima. Sempre existem de 3 a 8 craques (força geral ≥ 85): vêm da geração do mundo, dos fenômenos raros da base (`wonderkidChance`) e de jovens de potencial muito alto que jogam e chegam perto do teto (`OFFSEASON.evolution.highPotential`; quem tem potencial médio não passa do que a curva de idade dá, para não inflar o nível). A IA mantém a folha dentro da receita (`sustainablePayroll`, `payrollCuts`), renova contratos por elenco desejado e a base repõe só as posições descobertas. As categorias de base (abaixo) foram calibradas para não mudar nada disso: força das séries, idades, promessas e craques ficam como antes.

Os testes de balanceamento (`tests/balance/`) simulam milhares de partidas e temporadas inteiras e verificam esses intervalos. Não reduzir o `k` do duelo para atingir as metas: os atributos precisam continuar pesando.

---

## Mundo inicial
- **Série A e Série B**, 20 times cada, todos fictícios por padrão (sem nomes reais por questão de licença).
- **Futuro:** times e jogadores reais serão carregados de um **arquivo de dados importado** (e o editor permitirá dados da comunidade). Por isso o mundo é sempre um `World` (`teams` + `players`) de dados puros: a geração fictícia em `src/data` é só uma das fontes, e o motor, o store e a UI nunca devem depender de como o mundo foi criado. Um importador futuro deve validar o arquivo (escala 1–100, elenco de 18 a 30, ids únicos) e montar o mesmo `World`.
- Faixas de reputação na Série A: ~4 grandes, ~8 médios, ~8 pequenos. Série B com reputação menor.
- Jogadores gerados com atributos coerentes com a posição e idades variadas (veteranos e promessas em todo time). Elencos de 24 a 30 jogadores (times de maior reputação tendem a elencos maiores).
- Escalação automática (IA e sugestão ao jogador): escolhe a formação que melhor encaixa os melhores jogadores, usando posições secundárias quando compensa; craques não ficam no banco.
- 4 sobem da B e 4 caem da A.
- A Série B é simulada pelo mesmo motor; no MVP a interface da B é só a classificação e resultados.

## Virada de temporada (ordem)
1. Acesso e rebaixamento
2. Ajuste de reputação dos times
3. Envelhecimento + declínio dos veteranos (idade e ruído dos atributos; o crescimento já veio aos poucos pelo treino da temporada)
4. Aposentadorias
5. Fim de contratos vencidos (jogadores livres no mercado)
6. Categorias de base (evolução, decisão dos 20 anos, promoções da IA, chegada de 3 a 5 jovens) e depois a reposição de posições descobertas no elenco profissional
7. Nova meta da diretoria
8. Nova tabela de jogos

---

## Escopo do MVP
- Criar novo jogo escolhendo um time da A ou da B
- Ver elenco, atributos e força por posição
- Definir tática e escalação
- Jogar partidas com narração em texto e estatísticas; substituições e mudança tática no intervalo
- Classificação das duas séries
- Mercado simples (comprar, vender, propostas da IA)
- Finanças básicas
- Meta da diretoria e demissão
- Temporadas encadeadas com virada de temporada
- Salvar e carregar

**Fora do MVP (não implementar ainda):** copas, Libertadores, comissão técnica, olheiros, contratos detalhados com empresários, imprensa, humor da torcida, vestiário, visualização 2D, multiplayer, editor de dados.

## Fases seguintes
- **Fase 2:** Copa do Brasil e continentais, treino, comissão técnica, olheiros, contratos detalhados, direitos de TV, sócio-torcedor, premiações.
- **Fase 3:** imprensa, humor da torcida, vestiário, visualização 2D da partida, editor de dados/mods, salvamento na nuvem.

---

## Ordem de implementação sugerida
1. Setup do projeto (Vite + React + TS + Tailwind + Vitest), gerador aleatório com seed
2. Tipos do modelo de dados
3. Geração de jogadores e times fictícios (Série A e B)
4. Motor de partida + testes de balanceamento
5. Calendário, tabela de jogos e classificação
6. Telas: elenco, tática, partida, classificação
7. Finanças, mercado e diretoria
8. Virada de temporada
9. Salvamento (Dexie) e PWA

## Interface (etapa 6)
- Mobile-first: Tailwind, barra de navegação embaixo, botões grandes (altura mínima 48 px). Rótulos de valores de tipos sempre de `labels.ts`.
- **Salvamento (etapa 9):** Dexie/IndexedDB, 3 espaços (`src/store/saves.ts`), salvamento automático depois de cada mudança do jogo (`autosave.ts`, ligado em `main.tsx`; o jogo só grava quando tem espaço ativo, `openGame(game, slot)`). O save é um envelope `{ version, savedAt, game }` (`saveFormat.ts`) com `SAVE_VERSION` e `MIGRATIONS`: **ao mudar o formato de `Game` (ou do que ele contém) de modo que save antigo não sirva, aumente `SAVE_VERSION` e escreva a migração da versão anterior.** `compactGame` tira a narração, as lesões, as trocas e as notas dos jogos decididos, mas guarda os gols (com assistência) e os cartões de todos eles para o resumo do jogo na Tabela (menos o último do time do jogador, que fica inteiro) e `Game.archive` guarda só o resumo das temporadas passadas: o save fica em ~1,4 MB no começo e ~2,5 MB no fim da temporada (os gols e cartões de todos os jogos pesam ~0,6 MB); sobe uns 15% nos primeiros anos, quando as bases dos clubes se enchem, e depois fica plano (o treino acrescenta só o histórico mensal de força do time do jogador, ~0,1 MB com 40 pontos) (`npm run analyze -- save --years 10`).
- Backup: `src/store/saveFile.ts` exporta um espaço como `meu-manager-<time>-<ano>.json` (envelope + `app: "meu-manager"`) e importa passando pelas mesmas migrações e validações; botões Exportar e Importar na tela inicial.
- PWA (etapa 9C): manifesto + ícones em `public/`, service worker gerado no build (`tools/pwaPlugin.ts` + `tools/sw.template.js`, só em produção), `src/pwa/pwa.ts` (registro, versão nova, instalação) e `PwaBanner`. O app abre offline depois da primeira visita; a versão nova só entra quando o jogador toca em Atualizar. Como instalar e testar no celular: `docs/pwa.md`.
- O estado do jogo é `Game` (`src/store/game.ts`, funções puras: `createGame`, `advanceGame`, `finishPendingMatch`, `setUserTactic`...), guardado em memória por `gameStore.ts` (`useGame`). Nada é salvo ainda. Consultas (classificação, próxima partida) são derivadas na hora.
- `advanceToNextEvent(state, { userTeamId })` não simula a partida do jogador: devolve `pendingUserMatch` e a IA não mexe no time dele (`userMatchInput`, `MatchInput.userControlled`, `repairTactic`, `setTeamTactic`, `completeMatch`).
- Atalhos de desenvolvimento (só em `npm run dev`): `/?time=imp&semente=7` começa um jogo com o time (sigla de 3 letras); `&tela=squad|tactics|match` abre numa tela; `&dias=10` joga 10 dias de jogos antes; `&jogo=1` avança até a partida do time; `&minuto=60` deixa a partida ao vivo parada nesse minuto.
- Mercado: `advanceGame` liga o mercado (`market: true`) e também para em dias só de mercado; `advanceToMatchday` atravessa esses dias. Vender/emprestar/liberar os próprios jogadores: `src/engine/market/sell.ts`. Diretoria: `src/engine/board` (`evaluateBoard`, confiança derivada da classificação, meta e finanças; `BOARD` no `config.ts`); a demissão fica em `Game.dismissal` e para o jogo.
- Virada de temporada: `src/engine/offseason` (`advanceSeason`: acesso/rebaixamento, reputação, evolução, aposentadoria, contratos, base via `YouthFactory`, meta, tabela nova); a base é gerada por `src/data/generateYouth.ts`. No jogo: `startNextSeason` (botão "Encerrar a temporada"), `Game.seasonLog` e `Game.lastReport`.
- A partida ao vivo mora em `src/store/liveMatch.ts` (o objeto do motor muda a cada passo e não faz parte do `Game`).

- **Tema e painel (redesenho):** o tema fica em `src/ui/theme` (`theme.css` com as cores e fontes em `@theme`, componentes `Panel`, `Eyebrow`, `Crest`, `ResultDot`, `SegmentedBar`, `ProgressBar`, `ShortcutTile`, `BottomNav`, `Icon`). Fundo quase preto azulado, cartões mais claros, **verde-limão (`accent`) só para a ação principal e para progresso**; vitória/empate/derrota são `win`/`draw`/`loss`. Títulos em caixa alta com a fonte Barlow Condensed (classe `title`) e texto em Inter, ambas por `@fontsource` (entram no bundle e no cache offline do PWA). `theme.css` também remapeia a paleta antiga (`slate-*`, `emerald-400/500`) para as cores do tema, então as telas ainda não redesenhadas já combinam; ao redesenhar uma tela, use os tokens (`bg-surface`, `text-muted`, `border-line`) e os componentes do tema. A barra de baixo tem Clube, Elenco, Mercado, Tabela e Finanças (`NAV_TAB_OF` diz qual aba acende em Tática, Partida e Contratos). Não crie botão para função que não existe.

- **Elenco (redesenho):** `src/ui/screens/Squad.tsx` tem as abas Jogadores, Escalação, Números e Base (`squad/Players.tsx`, `Lineup.tsx`, `Numbers.tsx`, `Academy.tsx`; o Treino virá em pedido separado). Ordenação e filtros puros em `src/ui/squadSort.ts`. Peças de jogador no tema (`theme/PlayerBits.tsx`): bandeira (`Flag`, uma por nacionalidade: nacionalidade nova exige bandeira), carinha de moral por faixa (`moodBand`: feliz ≥ 70, neutra ≥ 50), barrinha de condição, selo por faixa (`ValueBadge`; a nota 0–10 vira escala 1–100 em `ratingToScale`) e camisa nas cores do time. A Escalação usa a mesma `team.tactic` da tela de Tática (`swapPlayers`, `changeFormation`, `setUserTactic`) e só mostra as formações de `FORMATION_IDS`. **Escalações salvas:** `Game.savedLineups` (3 espaços: nome, formação, estilo e titulares), `saveUserLineup`/`loadUserLineup`/`deleteUserLineup` em `store/game.ts` e `applySavedLineup` em `engine/tacticEdit.ts` (quem saiu do elenco é trocado pelo melhor que sobrou). **Nota média:** `PlayerSeasonStats.ratingSum/ratedGames` (só partidas com ≥ 20 min); por isso o save passou para a versão 2 (migração 1→2 parte de `recentRatings`). As assistências já eram registradas pelo motor (passe para finalização na área e cruzamento para cabeceio; gols de drible, chute de longe e bola parada não têm assistente). Atalho de desenvolvimento: `&tela=squad&aba=lineup|numbers` e `&detalhe=1`.

- **Categorias de base:** cada clube tem uma base separada do elenco profissional (`SeasonState.academy`, jogadores com `teamId` do clube; ficam fora de `players`, então não jogam nem entram no mercado). Regras e números em `ACADEMY` no `config.ts`: 15 a 19 anos, até 15 jovens, chegam de 3 a 5 por temporada (15 a 17 anos), evoluem aos poucos pelo treino semanal (fração de minutos `evolutionShare`, um pouco mais devagar que quem joga) e envelhecem na virada com `ageOneYear`, e quem faz 20 anos precisa ser promovido ou dispensado. Código: `src/engine/academy` (`potentialStars`, `promoteYouth`, `releaseYouth`, `worthPromoting`, `turnAcademy`), geração em `src/data/generateAcademy.ts` (base inicial do mundo e de saves antigos) e `generateYouth.ts` (`request.academy`). **Virada:** a IA promove quem vale (força + parte da margem até o potencial alcança o 18º do elenco, a partir dos 19 anos, ou posição descoberta, sempre com vaga) e decide sozinha sobre quem fez 20; o jogador é consultado (`academyPending`, aviso no painel, o botão Avançar vira "Decidir sobre a base" até ele decidir) e, se deixar passar, a regra da IA decide na virada seguinte. Base cheia: a IA dispensa os mais fracos; o jogador fica sem as vagas que faltam. Dispensado sai do jogo (não vai ao mercado). Promoção do jogador: contrato de `contractYears` anos com salário de jovem (`youthSalary`), erro `squad-full` com 30 no elenco. O potencial é oculto: a tela mostra `potentialStars` (1 a 5, com erro que diminui com a idade, estável por jogador e idade). **Calibragem:** a base chega mais fraca que os jovens do profissional (`qualityOffset`, `potentialOffset`, `prospectChance`, `wonderkidChance` próprios), porque a IA escolhe os melhores de vários; sem isso a Série A subia ~6 pontos em 30 anos e a B também (`npm run analyze -- years --years 30 --seed 41` mostra as colunas de base). **Save versão 3:** `season.academy` (migração 2→3 gera a base inicial com a semente do jogo). Atalhos: `&tela=squad&aba=academy`, `&decidir=1` (três jovens já com 20 anos), `&detalhe=1`.

- **Treino:** a evolução que antes vinha toda na virada agora chega aos poucos, a cada avanço, em `src/engine/training` (`applyTraining`, chamado em `passDays`): cada avanço reparte o ganho da temporada pelos dias passados entre a primeira e a última rodada (`seasonShare`; a soma dá 1 e antes da primeira rodada não há ganho). O ritmo do ano parte da força do começo da temporada (`seasonStats.startOverall`, guardada no primeiro avanço), senão o bônus de potencial encolheria a cada semana e o total ficaria menor; no treino Normal o total por temporada é o mesmo da evolução antiga (`OFFSEASON.evolution`; `annualGain`/`evolvePlayer` ficam como referência nos testes). A virada (`ageOneYear`) cuida só da idade, do declínio dos veteranos e do ruído dos atributos. **Coletivo:** `TrainingPlan` (intensidade Leve/Normal/Intensa + foco equilibrado/físico/técnico/defensivo/ofensivo) por time em `SeasonState.training.plans`; o foco só redistribui o ganho entre atributos (pesos de média 1, `focusWeights`), nunca aumenta o total. Intensidade (`TRAINING.intensity`): multiplicador do ganho, da recuperação diária da condição (`progressDays` recebe o perfil do time), teto da condição (Intensa não passa de 92) e do risco de lesão no treino (`trainingInjury`). Time sem plano (a IA) treina Leve nos intervalos de 2 a 4 dias (semana com jogo no meio da semana) e Normal nos demais; o time do jogador começa em Normal/equilibrado. **Individual:** uma vaga por time (`startIndividualTraining`, 30 dias): acelera um grupo de atributos (limitado pelo potencial) ou ensina uma posição secundária (goleiro não aprende posição de linha; até 2 secundárias). **Base:** treina junto, contando como quem jogou `ACADEMY.evolutionShare` dos minutos, sem lesões nem individual. **Histórico:** só do time do jogador, um ponto por mês (`training.history`, no máximo 40), para as setinhas da lista de Jogadores (`strengthTrend`, compara com 25 dias atrás) e o gráfico do detalhe. **Faixa de potencial** (`potentialRange`): estimativa com erro fixo por jogador e idade, mostrada como faixa na aba Treino. **Interface:** aba Treino no Elenco (cartões de intensidade com evolução/recuperação/risco, foco, vaga individual, "Quem mais evolui") e cartão "Treino" no painel. **Save versão 4:** `season.training` (migração 3→4 começa em Normal/equilibrado). **Equilíbrio:** `npm run analyze -- training` (`tools/trainingRun.ts`) põe times da IA treinando sempre Leve, Normal ou Intensa lado a lado; `tests/balance/trainingIntensity.test.ts` exige que nenhuma intensidade seja claramente a melhor. Atalho: `&tela=squad&aba=training`.

- **Mercado (redesenho):** `src/ui/screens/Market.tsx` é só a casca (abas com rolagem horizontal `TopTabs scroll` e o aviso da janela no topo de todas); as abas moram em `src/ui/screens/market/`. Abas: Buscar, Favoritos, Listas, Livres, Pré-contrato, Propostas (recebidas e enviadas), Histórico e Contratos (renovações, `Contracts.tsx`). **Busca** (`engine/market/search.ts`, puro): texto (nome, apelido ou clube, sem acento), série, grupo e posição, nacionalidade, situação e faixas de força, idade, valor e salário (janela de filtros `FilterSheet` com `RangeSlider` de duas alças, "Limpar" e "Ver N jogadores"), atalhos "Cabem no bolso" (valor dentro do orçamento de compras), "Barganhas" (valor até `MARKET.search.bargainShare` do valor que a força sozinha daria), "Jovens promessas" (até 21 anos e potencial **estimado** — `potentialRange` — alto) e "Contrato acabando", e ordenação. **Interesse** (`engine/market/interest.ts`): nenhum, baixo, médio ou alto, vindo de `playerDecision` (o salário mínimo que o jogador aceitaria ÷ o salário que a força dele espera; limites em `MARKET.interest`). Tocar abre a negociação numa janela de baixo para cima (`Sheet`, `Negotiation.tsx`: valor de mercado, interesse, compra ou empréstimo, valor, salário, duração). Venda, empréstimo e liberação dos seus jogadores ficam no detalhe do jogador no Elenco (`SellSheet`). **Favoritos:** `Game.favorites` (estrela nas linhas e na negociação). **Listas** (`engine/market/listings.ts`, `MarketState.listings`): clubes da IA anunciam, aos poucos, quem sobra no elenco (papel `surplus`, no máximo `MARKET.listing.maxPerTeam` por clube, elenco acima de `minSquad`), à venda por `transferShare` do valor de mercado ou para empréstimo por `loanShare` da taxa; o preço anunciado vale na compra (`salePrice`, `sellerDecision({ listedPrice })`) também entre clubes da IA; o jogador anuncia os seus (sub-aba Meus) e a IA passa a fazer propostas por eles, pelo preço anunciado (`MARKET.listing.userBias`). Os anúncios saem quando o jogador sai do clube e se renovam a cada rodada de negociações; o time do jogador nunca é anunciado sozinho. **Histórico:** `market.history` da temporada (suas ou do campeonato). **Saves:** versão 5 (`market.listings`) e 6 (`market.preContracts`, `lastReport.preContracts`).
- **Pré-contrato** (`engine/market/precontract.ts`): a partir de 1º de julho (`MARKET.preContract.fromMonth`), quem está no último ano de contrato pode combinar com outro clube e chegar de graça na virada (`offerPreContract`: o jogador responde na hora pelas mesmas regras de `playerDecision`; o clube comprador precisa de vaga no elenco do ano que vem e de folha — `preContractBuyerCheck`). O contrato só passa a valer em `advanceSeason` (`applyPreContracts`, antes do fim dos contratos): cai se o jogador já saiu, se o contrato dele já não vence ou se o comprador ficou sem vaga; entra no histórico da temporada nova com valor zero. **IA** (`runPreContractTick`, nos primeiros dias de julho a novembro, `MARKET.preContract.ai`): com moderação (chance por clube, um por clube, ninguém perde mais de 2 jogadores, ganho de força maior que o de uma compra normal); quando leva um jogador do time do jogador, o painel avisa (`pre-contract-lost`). Os melhores jogadores não podem se concentrar em poucos clubes: `npm run analyze -- years` mostra `top40(máx/clubes)` e `tests/balance/longRun.test.ts` confere.

- **Finanças (redesenho):** `src/ui/screens/Finance.tsx` (peças em `screens/finance/`): caixa em destaque com a confiança da diretoria, "Pedir verba", "Extrato" (cada lançamento da temporada com data; o extrato guarda no máximo `FINANCE.ledgerMax` lançamentos por clube) e "Balanço da temporada" (receitas e despesas por categoria contra a temporada anterior: `SeasonFinance.byCategory`, que saves antigos não têm); cartão de alerta só quando há risco (folha acima da sustentável ou caixa indo para a dívida que demite, `cashOutlook` em `engine/finance/outlook.ts`); cartão do estádio que abre o controle do ingresso; barra do orçamento; folha e folga **por mês**; aviso verde, âmbar ou vermelho de até quando o caixa paga os salários; categorias (verde: bilheteria, patrocínio, TV, vendas; vermelho: salários, compras, rescisões, operação); renda média em casa. **Orçamento** (`engine/finance/budget.ts`): a barra divide o total entre salários por mês e compras (um ano de salário = `FINANCE.budget.salaryMonths` meses vale o mesmo em compras; o total não muda; salários nunca abaixo da folha de hoje; `Finances.budgetShift` guarda o que foi movido e as compras do mês são `caixa × transferShare − budgetShift + purchaseBonus`; zera na virada). Contratação, renovação e pré-contrato já barram quem passa do orçamento de salários (`salary-budget`). **Pedir verba** (`requestFunds`, `FINANCE.funds`): uma vez por janela de transferências, a diretoria libera um extra para compras (`purchaseBonus`) até `maxShareOfCash` do caixa × confiança, nunca além do que sobra depois de manter `reserveMonths` meses de folha + operação e o orçamento de compras atual; recusa com o motivo (janela fechada, já pediu, confiança baixa, caixa sem folga); só a verba liberada gasta o pedido. **Save versão 7** (`budgetShift`, `purchaseBonus`, `fundsRequests`). Atalhos: `&tela=finance&folha=extrato|balanco|ingresso`, `&verba=1` (pede verba ao abrir), `&crise=1`.

- **Tabela (redesenho):** `src/ui/screens/Standings.tsx` é a casca (abas com rolagem e o seletor Série A/Série B); as seções moram em `screens/standings/`: **Classificação** (`Table.tsx`: seta entre a temporada atual e as passadas, com as tabelas finais de `Game.archive`; colunas J V E D GP GC SG Pts; bolinhas dos últimos 5 jogos só na temporada atual; faixa de campeão e rebaixamento na Série A e de acesso na B, com legenda; o seu time destacado), **Rodadas** (`Rounds.tsx`: "Rodada N" com setas, data, escudos, placar ou "x" e o estádio do mandante; tocar no placar de um jogo disputado abre o resumo com gols, assistências e cartões), **Artilharia**, **Assistências** e **Cartões** (`Leaders.tsx`, dados em `data.ts`: cabeçalho próprio dourado, verde-água e amarelo, pódio de ouro, prata e bronze, lista com clube), **Histórico** (`History.tsx`: `Game.seasonLog`) e a **página do time** (`TeamPage.tsx`, aberta ao tocar num time: posição, pontos, força, últimos resultados, próximo jogo e elenco). Só existem as ligas: nada de copas, torneios ou continentais; sem fotos nem escudos reais (`Crest` gerado). Contagens novas por jogador (`seasonStats`: `homeGoals`, `awayGoals`, `passAssists`, `crossAssists`) vêm de `applyMatchToPlayers`; o gol traz `assistKind` ('pass' ou 'cross': o cabeceio é o cruzamento). **Save versão 8**: saves antigos começam essas contagens em zero (a artilharia geral não muda; Casa, Fora, Passes e Cruzamentos contam dali em diante). Atalho: `&tela=standings&aba=rounds|goals|assists|cards|history`.

- **Painel reunido (aba Clube):** `screens/Dashboard.tsx` com peças em `screens/dashboard/`: **central de avisos** no topo (`notices.ts`, `NoticeCenter.tsx`), em ordem de urgência: decisão pendente da base, propostas recebidas, jogadores que assinaram pré-contrato com outro clube, contratos no último ano, lesionados e suspensos, jovens novos na base e janela de transferências; cada aviso leva à tela e à aba certas (`onNavigate(tela, aba)`, que o `App` repassa como aba inicial); **próximo jogo** com escudo, posição e forma do adversário e o botão da tática e escalação provável; **grade de 10 atalhos** (Elenco, Escalação, Tática, Base, Treino, Mercado, Contratos, Finanças, Tabela, Histórico) com bolinha só onde há pendência; **mini classificação** (`MiniTable.tsx`: seu time com dois acima e dois abaixo, forma dos cinco times e seus últimos jogos com placar); **destaques** (`Highlights.tsx`: artilheiro, garçom e melhor nota média com no mínimo 3 jogos com nota); e os cartões de treino, último jogo, diretoria e orçamento. Os avisos soltos antigos (janela, mercado, contratos, base) viraram a central. Testes: `tests/dashboardHub.test.ts`.
- **Campo 2D da partida:** a tela de partida (`screens/Match.tsx`) mostra sempre o `Pitch` (`screens/match/Pitch.tsx`), sem opção de escondê-lo. De cima para baixo: placar com **um único botão de velocidade** (1x, 2x, 4x, 8x e volta ao 1x), os **botões de controle** pequenos e do mesmo tamanho (antes do início Começar e Ir ao fim; no jogo Pausar/Continuar e Ir ao fim; no intervalo Começar o 2º tempo e Ir ao fim), o campo, as abas **Jogos, Dados, Tática e Trocas** e a seção de lances ao vivo (com "Mostrar faltas"); em telas largas os lances ficam numa coluna à direita (layout da referência). A tela abre já com a partida criada (`beginLive(game, true)`, minuto 0): quem ainda não começou é refeita ao reabrir, para pegar a escalação de agora, e as telas de Tática e Escalação só travam depois do minuto 0. **Jogos** (`match/Others.tsx`, `otherGames.ts`): os outros jogos da mesma série, rodada e data, que o motor já decidiu (`Game.lastDay`); os gols são revelados pelo relógio (`scoreAt`), com destaque quando sai gol, e no minuto 90 o placar é o resultado fechado. **Câmera lenta** (`HOLD_MS`, `slowFor`, `holdFor` em `pitchModel.ts`): finalizações (2 s) e gols (3 s) passam devagar em qualquer velocidade e o relógio espera esse tempo; cartão amarelo ou vermelho aparece no campo, com o nome, por 2 s. **Lesão no seu time:** a tela liga `MatchInput.holdInjurySubs`; o jogador sai, o jogo para (`playUntil` não avança, `snapshot().injuryPending`), a aba Trocas abre e o técnico escolhe o reserva (`resolveInjury(side, incomingId)`) ou segue com um a menos (`resolveInjury(side)`); sem trocas ou sem paradas (5 trocas em 3 paradas) o aviso diz que o time fica com um a menos. Sem a opção (padrão, e para o time da IA) o melhor reserva entra na hora como sempre. "Ir ao fim" também para na lesão. Isso só vale na partida ao vivo: não muda nenhum resultado do motor (`tests/matchGolden.test.ts`). **Trocas com campo:** a aba mostra os titulares num campo no desenho da Escalação (`components/FieldLineup.tsx`: camisa com número, nome e condição física) e os reservas embaixo; toca em quem sai e depois em quem entra; os números de camisa são os mesmos do campo animado (`assignNumber`) e as regras e avisos de 5 trocas em 3 paradas continuam. **Bola parada** (`setPieceBeats` em `pitchModel.ts`, só visual, a partir do lance que o motor já gerou: `shot.type` pênalti ou falta): no pênalti todos ficam fora da área, o cobrador na marca e o goleiro na linha, depois a corrida e a cobrança; na falta perigosa o time que defende forma a barreira (até 4, a ~9 m da bola), o cobrador se posiciona e bate; tudo em câmera lenta (`HOLD_MS.setPiece` a mais). **Adversário:** tocar no escudo do adversário (painel, próximo jogo e partida, antes e durante) abre `OpponentOverlay` com a `TeamPage`, que ganhou a seção `TacticSection` (formação, estilo, mentalidade e escalação provável num campo; fora de jogo é o que `aiTactic` montaria hoje). Durante a partida mostra a tática atual: o snapshot traz `activeMentality` (a mentalidade em uso, que a IA muda pelo placar) e `onPitch` com as trocas. Atalhos: `&oponente=1`, `&aba=trocas`, `&passo=N` (só a batida N da cena).tsx`) em cima, com lances, dados, tática e trocas embaixo; em telas largas os lances ficam numa coluna à direita (layout da referência). É só uma representação visual: o motor ganhou apenas um **rastro de leitura** (`MatchSnapshot.trace`, `PlayTrace`: quem tinha a bola, quem marcou, o alvo do passe ou cruzamento, o desfecho e a finalização de cada momento), anotado sem sorteio nem efeito em nenhuma conta; `tests/matchGolden.test.ts` compara o resultado de 24 partidas (inclusive ao vivo, com troca e mudança tática) com o que o motor produzia antes do rastro e quebra se qualquer resultado mudar (regravar de propósito: `GOLDEN_UPDATE=1`). O modelo (`match/pitchModel.ts`, puro e testado) tira as posições de base das vagas da formação (o mandante ataca para a direita; o lado direito do time fica embaixo), a fase da jogada (meio, progressão, chance, finalização: o time com a bola avança o bloco e o outro recua, todos se aproximam do lado da jogada), as batidas da bola (seta tracejada para passe, curva no cruzamento, contínua no chute) e as marcações (gol, defesa, para fora, escanteio, falta, cartões). Nada usa o gerador do motor: as escolhas sem dado do motor (o meio-campista "que ganhou o meio") vêm de um hash do minuto e dos ids. Em 4x e 8x só o desfecho de cada minuto aparece, sem setas (`playbackFor`). Substituições e expulsões saem direto do `onPitch` do snapshot. Atalhos de desenvolvimento: `&jogo=1&minuto=34` abre a partida parada no minuto; `&anim=1` mostra a sequência completa (e cartões do minuto) mesmo assim; `&ate=gol|cartao|lesao` joga até o primeiro gol, cartão ou lesão do time; `&iniciar=1` já começa rodando.

- **Posicionamento livre (grade):** o jogador arrasta cada titular para onde quiser na Escalação (aba do Elenco) e na Tática, como no Brasfoot. O campo tem uma **grade de 26 pontos** (`engine/grid.ts`): linhas goleiro, defesa, volância, meio, meia ofensiva e ataque (`GRID_ROWS`, `GridPoint.row` 0 a 5) e 5 faixas (esquerda, centro-esquerda, centro, centro-direita, direita; sempre do ponto de vista do time); o goleiro só tem o ponto do centro. Ao soltar, o jogador encaixa no ponto mais perto (`nearestGridPoint`); se o ponto está ocupado os dois trocam de lugar; o goleiro não deixa o gol vazio. **O papel vem do ponto** (`slotAt`): lateral na defesa e ala na volância nas faixas de fora, ponta nas faixas de fora do meio, da meia ofensiva e do ataque, zagueiro, volante, meia (MC), meia ofensiva e atacante no centro; o setor também vem da linha. As formações prontas são **atalhos**: cada uma tem a sua grade (`Formation.grid`, mesma ordem das vagas de sempre, então nada mudou para elas) e `changeFormation` reposiciona todo mundo. `Tactic.grid` (um ponto por titular, na ordem de `startingXI`) guarda o posicionamento; `Tactic.formationId` é só o rótulo (a formação pronta de mesmos pontos ou `'custom'`, "Livre" na tela, `labelOfGrid`); sem `grid` (táticas antigas) vale a da formação pronta (`formationOf(tactic)` devolve as vagas). Edição: `movePlayerTo` em `tacticEdit.ts`; sugestão automática (`buildTactic` com `grid`) mantém a grade e escolhe os 11 pelo papel de cada ponto; escalações guardadas (`SavedLineup.grid`) voltam iguais. **Motor:** `PitchPlayer.point` (a substituição herda o ponto), `snapshot().home.grid` e `onPitch[].point`; a posição na vaga (`overallAt`/penalidade fora da posição natural) segue o papel do ponto. **Custo da grade livre** (`MATCH.grid`, `match/formationProfile.ts`): o perfil de controle e ataque da formação vem do da pronta mais parecida (a que difere em menos jogadores; as prontas continuam com o perfil calibrado) menos um imposto por jogador de papel diferente (`distanceTax`); os ganhos de controle do meio e de progressão têm teto (o maior das prontas, `READY_CAPS`); deixar a defesa com menos de 3 ou o meio com menos de 3 custa; e **faixa sem cobertura**: o rival que conduz a bola por uma faixa enfrenta a faixa espelhada e as vizinhas, e se há menos de `flankCover` jogadores de defesa e meio ali (pelas vagas, não por quem está em campo) ele progride mais por ali (`gridGap`, `flankGap`). As prontas não têm buraco nem imposto, então rendem exatamente como antes (`tests/matchGolden.test.ts`). **Equilíbrio:** `npm run analyze:grid` (`tools/gridSearch.ts`; `--random 40 --plausible 40 --finalists 6 --confirm-teams 20 --confirm-worlds 2`) mede formações prontas e distribuições livres (extremas, sorteadas e plausíveis) nos mesmos elencos e adversários; `tests/balance/gridTactics.test.ts` exige que nenhuma distribuição livre passe claramente das melhores formações prontas e que a faixa vazia custe gols sofridos. A IA continua só com formações prontas. **Tela:** `components/GridPitch.tsx` (eventos de ponteiro com `touch-action: none` só nos jogadores: arrastar com o dedo não rola a página; tocar escolhe para trocar de lugar; os pontos da grade ficam discretos e se destacam, com o nome das linhas, durante o arrasto; o chip "Livre · 3-5-2" aparece quando o time é livre). O campo 2D e o campo das Trocas usam o ponto do jogador (`point`) quando existe. **Ao vivo:** `LiveMatch.setPosition(side, playerId, point)` leva um titular a um ponto (ocupado = trocam; o goleiro em campo fica no gol), refaz as vagas (`formationFromGrid`, rótulo `labelOfGrid`) e vale no próximo lance. **Com menos de 11** (expulsão ou lesão sem troca) também vale: o lugar de quem saiu fica vazio (`gridProblem`/`formationFromGrid` com `partial`, `formationOf` com menos de 11 pontos), os restantes cobrem como quiserem e os buracos de `gapsOf` custam normalmente; sem goleiro em campo, qualquer um pode ir ao ponto do gol e depois não sai mais dele. **O custo vale com ou sem arrasto:** assim que alguém sai sem ser substituído, o motor refaz as vagas com quem sobrou (`syncShortHanded`) e o time paga os buracos desde o primeiro lance; o time reduzido não paga imposto de papel (`profileOf` com menos de 11: só conta jogador de papel que a formação pronta não tem, e `distanceTax` é zero), senão cobrir o setor vazio sairia mais caro que não mexer. A IA reorganiza sozinha o time dela (`reorganizeShortHanded`: move quem perde pouco no papel novo, até os buracos não diminuírem mais) e `LiveMatch.reorganize(lado)` faz o mesmo para o time do jogador (sem botão na tela); `MatchInput.startedOff` só serve para medir e testar. `tests/balance/shortHanded.test.ts` mede 10 e 9 jogadores sem mexer contra reorganizado (mesmos times e sementes): reorganizado rende igual ou melhor e nunca aumenta os buracos. Jogos com 11 não mudam (`tests/matchGolden.test.ts`; só `sim-15`, que tem expulsão e lesão sem troca, foi regravado). Na tela de partida o arrasto existe na aba Tática (cartão "Posição dos jogadores") e no campo das Trocas (`FieldLineup` com `onMove`), só com o jogo pausado ou no intervalo (`canEdit`). Atalho: `&aba=tatica`. **Save versão 9** (migração 8→9 põe `grid` das formações prontas em todas as táticas e escalações guardadas).

## Mundo real com várias ligas (fase nova; plano completo em `docs/plano-mundo-real.md`)

**Decisões já tomadas:** (1) os atributos dos jogadores reais são **gerados automaticamente**, de forma estável, e ajustados por um **editor dentro do jogo** (Fase 4); (2) os **dados reais ficam num arquivo separado que só o usuário importa**: nunca entram no repositório nem no site/PWA (a pasta `dados-reais/` está no `.gitignore`; só o pacote fictício padrão vai no código); (3) as ligas serão do **Brasil, da Europa e da América do Sul**; (4) o motor de partida e o equilíbrio não mudam por causa do mundo; (5) o pacote importado fica guardado **só no navegador** (IndexedDB), junto com os saves.

**Fases:** 1) pacote de dados; 2) várias ligas e mercado internacional; 3) copas nacionais e continentais; 4) editor; 5) pacote real a partir dos elencos da Wikipedia, com os créditos da licença.

**Fase 1 (feita): pacote de dados** em `src/data/package/`. O formato (JSON com `format: "meu-manager-package"` e `version`) tem países, ligas (divisões, número de times, acesso e rebaixamento, desempates), clubes (nome, sigla, cores, cidade, estádio, capacidade, reputação, liga) e jogadores (nome, apelido, nascimento, nacionalidade, posição principal e secundárias, pé, clube e, opcionalmente, atributos e potencial). `validatePackage`/`parsePackage` (`validate.ts`) devolvem problemas estruturados (`code`, `path`, `detail`) e a interface os transforma em mensagens (`packageIssueText` em `labels.ts`): campo faltando, clube sem jogadores, elenco fora de 18 a 30, sem goleiro, liga com número errado de times, ids repetidos, datas e cores inválidas. **Nesta fase o jogo aceita um país com duas divisões de 20 times** (4 sobem e 4 caem): pacote com mais ligas é recusado com `unsupported-leagues`. `worldFromPackage` (`load.ts`) monta o mesmo `World` do resto do jogo; o que o pacote não traz é derivado de forma estável: jogador sem atributos passa por `generateRealPlayer` (`realPlayer.ts`; o sorteio vem só da identidade — nome, nascimento, nacionalidade, posição —, o nível da reputação do clube e da divisão, com as mesmas faixas do mundo fictício) e clube sem `game` ganha tática, finanças, torcida e meta por `deriveClubGame`. **O mundo fictício é o pacote padrão:** `defaultPackage(semente)` exporta o mundo de `generateWorld` com tudo (atributos, contratos, táticas, finanças, base) e `loadWorld(semente, pacote?)` é o único caminho de criação de mundo (`createGame` e a tela de Novo jogo passam por ele); exportar e importar de volta dá exatamente o mesmo mundo (`tests/dataPackage.test.ts`). **No jogo:** menu › "Novo jogo com pacote de dados" (`ImportPackage.tsx`: escolhe o arquivo, mostra os problemas ou o resumo e os créditos, e segue para a escolha do time); o pacote vai para a tabela `packages` do IndexedDB (`savePackage`, `listPackages`, `loadPackage`, `deletePackage` em `saves.ts`; esquema Dexie versão 2) e o jogo guarda só a referência em `Game.dataPackage` (campo opcional: o save não mudou de versão). `npm run analyze -- years --years 30 --seed 41` usa o pacote padrão e dá o mesmo resultado da geração direta (`WORLD_DIRECT=1`).

## Convenções
- Componentes React pequenos e focados; lógica fica no `engine`, não nos componentes.
- Constantes de balanceamento centralizadas em `src/engine/config.ts`.
- O Vitest usa no máximo 2 workers (`maxWorkers` em `vite.config.ts`; o PC tem 6 GB). Durante o trabalho rode só os testes do que mudou (`npx vitest run --project unit tests/arquivo.test.ts`) e deixe `npm run test:balance` para o fim de cada parte.
- Rodar os testes depois de qualquer mudança no motor:
  - `npm test`: testes rápidos (regras, geração, consistência do motor), de ~5 s a ~20 s conforme a carga da máquina.
  - `npm run test:balance`: balanceamento e experimentos estatísticos (milhares de partidas, 20 temporadas inteiras, estilos e formações; de ~1,5 a ~5 min). Obrigatório depois de mexer em `config.ts`, no motor de partida ou na geração.
  - `npm run test:all`: os dois.
  - `npm run analyze`: ferramenta de análise (`tools/analyze.ts`, fora do jogo e dos testes) que imprime posição e pontos por faixa de força nas duas séries (`bands`), estilos com elencos equivalentes (`styles`) e vantagem do mandante por série e ocupação (`home`) e a tabela ano a ano de várias temporadas seguidas com virada (`years`). Ex.: `npm run analyze -- bands --seasons 40`, `npm run analyze -- years --years 10 --seed 41`, `npm run analyze -- home --matches 6000`. Use depois de mexer em `config.ts`, no motor ou na geração.
- Interface pensada primeiro para celular.
