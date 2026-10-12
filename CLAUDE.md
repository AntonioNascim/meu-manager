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

Metas de longo prazo (10 temporadas seguidas, `tests/balance/longRun.test.ts`, `npm run analyze -- years`): nenhum clube da IA no vermelho em nenhum momento nem acumulando caixa além do teto (`FINANCE.ceilingYears`); força média dos titulares da Série A (±3) e da B (±4,5) estável; idade média entre 24 e 28, menos de 40% com até 21 anos e entre 12% e 32% com mais de 30; promessas (até 21 anos, potencial ≥ 75) em número parecido com o início; elencos entre 18 e 30; campeões variados. A distância de força entre as séries se mantém (A ~10 pontos acima da B): a cota de TV por divisão (`FINANCE.tvRights`, bem maior na A) e a reputação que volta ao patamar da divisão (`OFFSEASON.reputation.tierMean/tierPull`) seguram a A em cima. Sempre existem de 3 a 8 craques (força geral ≥ 85): vêm da geração do mundo, dos fenômenos raros da base (`wonderkidChance`) e de jovens de potencial muito alto que jogam e chegam perto do teto (`OFFSEASON.evolution.highPotential`; quem tem potencial médio não passa do que a curva de idade dá, para não inflar o nível). A IA mantém a folha dentro da receita (`sustainablePayroll`, `payrollCuts`), renova contratos por elenco desejado e a base repõe só as posições descobertas.

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
3. Envelhecimento + evolução/declínio (idade, potencial, minutos jogados, profissionalismo)
4. Aposentadorias
5. Fim de contratos vencidos (jogadores livres no mercado)
6. Geração de jovens em cada time
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

**Fora do MVP (não implementar ainda):** copas, Libertadores, treino, comissão técnica, olheiros, contratos detalhados com empresários, imprensa, humor da torcida, vestiário, visualização 2D, multiplayer, editor de dados.

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
- O estado do jogo é `Game` (`src/store/game.ts`, funções puras: `createGame`, `advanceGame`, `finishPendingMatch`, `setUserTactic`...), guardado em memória por `gameStore.ts` (`useGame`). Nada é salvo ainda. Consultas (classificação, próxima partida) são derivadas na hora.
- `advanceToNextEvent(state, { userTeamId })` não simula a partida do jogador: devolve `pendingUserMatch` e a IA não mexe no time dele (`userMatchInput`, `MatchInput.userControlled`, `repairTactic`, `setTeamTactic`, `completeMatch`).
- Atalhos de desenvolvimento (só em `npm run dev`): `/?time=imp&semente=7` começa um jogo com o time (sigla de 3 letras); `&tela=squad|tactics|match` abre numa tela; `&dias=10` joga 10 dias de jogos antes; `&jogo=1` avança até a partida do time; `&minuto=60` deixa a partida ao vivo parada nesse minuto.
- Mercado: `advanceGame` liga o mercado (`market: true`) e também para em dias só de mercado; `advanceToMatchday` atravessa esses dias. Vender/emprestar/liberar os próprios jogadores: `src/engine/market/sell.ts`. Diretoria: `src/engine/board` (`evaluateBoard`, confiança derivada da classificação, meta e finanças; `BOARD` no `config.ts`); a demissão fica em `Game.dismissal` e para o jogo.
- Virada de temporada: `src/engine/offseason` (`advanceSeason`: acesso/rebaixamento, reputação, evolução, aposentadoria, contratos, base via `YouthFactory`, meta, tabela nova); a base é gerada por `src/data/generateYouth.ts`. No jogo: `startNextSeason` (botão "Encerrar a temporada"), `Game.seasonLog` e `Game.lastReport`.
- A partida ao vivo mora em `src/store/liveMatch.ts` (o objeto do motor muda a cada passo e não faz parte do `Game`).

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
