# Proposta: posicionamento livre e treino obrigatório antes do jogo

**Status: só proposta, nada foi implementado.** Telas (maquetes em 380 px, não o app): `.shots/proposta-v4/` (arquivos 1 a 6).

---

## 1. Posicionamento livre no campo

### Ideia em uma frase
O técnico solta o jogador **em qualquer ponto**; a tela guarda esse ponto exato; o motor continua recebendo **um dos 26 pontos da grade** (o mais próximo), então ele lê o mesmo papel de sempre e os resultados e o equilíbrio não mudam.

### Como funciona
- **Dado novo, só de exibição:** `Tactic.spots?: { x, y }[]` (percentual do campo, um por titular, na mesma ordem de `startingXI`). Opcional: táticas e saves antigos sem `spots` usam o centro de cada ponto da grade, como hoje.
- **O que o motor lê continua sendo `Tactic.grid`.** Ao soltar, `grid[i]` = ponto da grade mais próximo de `spots[i]` (`nearestGridPoint`, que já existe). Assim `matchGolden` e `soloUnchanged` não mudam: nenhuma regra de simulação é tocada, nem `slotAt`, `gridGap`, `distanceTax` ou os perfis calibrados.
- **Dois jogadores soltos perto do mesmo ponto:** a grade exige pontos distintos (`gridProblem`). A atribuição será feita por **menor distância total** (ninguém fica no mesmo ponto; o segundo vai ao ponto livre mais próximo). Nesse caso a tela mostra na etiqueta o papel que o motor realmente entendeu, e um aviso discreto "dois jogadores na mesma zona: o motor colocou Fulano em ZAG". O jogador continua desenhado onde foi solto.
- **Mostrar o papel e a penalidade (tela 1 e 2):** cada jogador ganha uma etiqueta com o papel entendido (`slotAt` do ponto: ZAG, LE, VOL, MC, MEI, PE, ATA...). Se o papel não é a posição principal nem uma das secundárias dele, a etiqueta fica âmbar com a penalidade (`PE · −8%`, valor vindo da mesma função de penalidade de posição que o motor já usa). Tocar no jogador abre a folha com: onde soltou, papel entendido, penalidade, e "Voltar ao ponto da grade".
- **Campo 2D e Trocas:** usam `spots` quando existir, como já usam `point`.

### Onde vale
- **Time principal (Elenco › Escalação) e Tática da partida:** o `GridPitch` troca "encaixar no ponto" por "ficar onde soltou" (a grade vira só uma ajuda discreta que acende no arrasto, como hoje).
- **Ao vivo:** `LiveMatch.setPosition(side, playerId, point)` ganha um `spot` opcional só para exibição.
- **Escalações salvas:** `SavedLineup.spots?` (opcional). `applySavedLineup` continua trocando quem saiu pelo melhor que sobrou, mantendo o `spot` do lugar.
- **Escalação automática e IA:** `buildTactic` grava `spots` = centro dos pontos da grade (nada muda para a IA; ela continua só com formações prontas).
- **Online:** o comando `tactic` passa a aceitar `spots` (conferido em `parseCommand`: mesmo número de titulares, 0 a 100, sem NaN). O servidor recalcula `grid` a partir de `spots` com a mesma função, nunca confia no `grid` enviado junto. Espelho: `spots` fica na tática do próprio clube (já vai completo em `ownPart`); para outros clubes não vai.
- **Save:** campo opcional, **sem mudar `SAVE_VERSION`** (save antigo continua servindo). Se você preferir, subo para 12 com migração vazia por segurança.

### Garantias e testes
- `tests/matchGolden.test.ts` e `tests/soloUnchanged.test.ts` **sem regravar**; se qualquer um pedir regravação, paro e aviso.
- Testes novos: soltar no centro exato do ponto dá o mesmo `grid` de hoje; atribuição sem repetir pontos; papel e penalidade batem com `slotAt`/penalidade do motor; `spots` sobrevive a salvar e carregar, a escalação salva e ao comando online.
- Não é preciso `npm run test:balance`, porque o motor não muda (rodo uma vez por garantia, no GitHub).

### Pontos para você decidir
1. **Dois no mesmo ponto:** concorda com a "menor distância total" e o aviso (em vez de impedir de soltar ali)?
2. **Limite de proximidade:** soltar em cima de outro jogador é permitido (eles se afastam um pouco na tela) ou o jogador "volta"? Sugiro permitir.

---

## 2. Treino obrigatório antes do jogo

### Regra
Entre um jogo e outro o técnico precisa **montar a semana ou tocar em "Delegar à comissão"** antes de avançar. A semana é a agenda de treino que já existe (`trainingWindow`, `committeeAgenda`, comando `training-agenda`). **Nada de estado novo:** "semana pronta" é derivado: todos os dias de `trainingWindow(time)` têm sessão na agenda (delegar grava a agenda da comissão, então conta como pronta).

### Solo
- **Avançar bloqueado** (tela 3) enquanto faltar dia na janela, com aviso claro: "Monte a semana de treino antes de avançar. Faltam 2 dias." e dois botões: **Montar a semana** (abre Elenco › Treino) e **Delegar à comissão** (monta e libera na hora).
- **Depois de pronta** (tela 4), o botão vira "Avançar até o jogo".
- **O tempo passa dia a dia** (tela 5): para cada dia da janela o app mostra o campinho com o exercício do dia (`TrainingField` que já existe), barra "dia 1 de 2", velocidades 1x/2x/4x e **Pular a animação**. **A animação é só visual**: o motor processa o avanço exatamente como hoje (`applyTraining` com a agenda), então o resultado é o mesmo com ou sem ela. Ao chegar no dia do jogo a partida é liberada ("Ir para a partida").
- **Sem janela, sem bloqueio:** se não há dia de treino até o jogo (jogos em dias seguidos), o botão fica livre, como hoje.

### Jogos em dias seguidos (o seu pedido de proposta)
A janela é sempre "os dias entre o último jogo e o próximo, sem contar os dois" (já é assim em `trainingWindow`):

| Calendário | Dias de treino | O que o técnico faz |
|---|---|---|
| Sáb → Qua | dom, seg, ter (3 dias) | monta 3 dias |
| Qua → Sáb | qui, sex (2 dias) | monta 2 dias |
| Sáb → Dom (jogos em dias seguidos) | **nenhum** | nada; avançar fica livre; só aparece a **recuperação automática** do dia (o motor já trata) |
| Qua → Qui (copa e liga coladas) | nenhum | igual |
| Pré-temporada e pausas longas (mais de 7 dias) | 7 primeiros dias montados; o resto segue o plano da comissão (limite `AGENDA_MAX_DAYS`) | monta ou delega os 7; a animação mostra todos os dias |

Quando há três jogos em sequência (Qua, Sáb, Qua), cada intervalo é uma semana separada, pedida só ao chegar nele (não pede a de depois antes da hora).

### Online
- **Pronto só libera com a semana montada ou delegada** (tela 6). O botão mostra "Pronto · bloqueado" com o motivo e os dois atalhos.
- **Prazo e delegação automática:** quem não fez nada até o **limite da semana** fica com a semana delegada à comissão sozinha, para ninguém travar a liga. Proposta de prazo: **o início do primeiro dia de treino da janela** (a liga aplica o treino conforme o relógio passa pelos dias; montar depois disso seria tarde demais). A tela mostra o prazo no fuso do aparelho ("quinta 20h").
- **Avançar do ADM** continua só pulando a espera até o jogo; ele não monta a semana de ninguém, e quem não montou é delegado na hora em que o dia passa.
- **Lista "quem está pronto"** mostra também quem está com a semana pendente ou delegada.
- **Ausentes e piloto automático:** semana delegada automática, e eles seguem sem precisar de Pronto, como hoje.
- Servidor: a verificação e a delegação automática rodam no relógio da liga (`runner.ts`), usando as mesmas funções puras; o espelho já leva a agenda do próprio clube.

### Garantias e testes
- Solo: `soloUnchanged` sem regravar (o gate é de interface; o motor e os resultados não mudam).
- Online: `leagueView` ganha o campo derivado `weekReady` e o prazo; testes de: Pronto negado sem semana; delegação automática no prazo; pausa congela o prazo; ADM avançando não trava; janela vazia não bloqueia.
- Ponta a ponta no navegador pelo workflow "Ponta a ponta" (c8 é estendido).

### Pontos para você decidir
1. **Delegar vale só para esta semana** ou fica ligado ("sempre delegar") até o técnico desligar? Sugiro só esta semana, com um interruptor "Delegar sempre" opcional no cartão de Treino.
2. **Prazo online** em "início do primeiro dia de treino": concorda?
3. **Pré-temporada longa:** concorda em exigir só os 7 primeiros dias?
4. **Animação:** pular uma vez vira preferência (`mm-treino-pular`) ou volta a perguntar toda semana? Sugiro lembrar a escolha.

---

## 3. Ordem de entrega sugerida
1. Treino obrigatório no solo (bloqueio, delegar, animação dia a dia) + testes.
2. Treino obrigatório no online (Pronto, prazo, delegação automática) + ponta a ponta.
3. Posição livre no solo (tática, escalação, salvas, ao vivo) + testes.
4. Posição livre no online (comando e espelho).

Cada parte: commit pequeno, `npm test` por partes, `matchGolden` e `soloUnchanged` sem regravar, e só digo "no ar" depois do workflow de publicação terminar com sucesso e de conferir o site.
