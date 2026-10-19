# Fase 2, parte A: medição e proposta

Este documento **não implementa nada**. Ele mede o que acontece quando o motor atual recebe um mundo do tamanho do plano e propõe, ponto a ponto, o que fazer. As decisões que dependem de você estão na seção 8.

Ferramentas criadas (só medição, fora do jogo):
- `tools/exportPackage.ts`: exporta o mundo fictício padrão como pacote (`node tools/run.mjs exportPackage`).
- `tools/worldScale.ts`: monta o mundo grande e o joga pelo mesmo caminho do jogo (`advanceToMatchday` + `playPendingAuto`).
  `node --expose-gc --max-old-space-size=4096 tools/run.mjs worldScale --world full|brazil|base [--offseason]`

---

## 1. Resumo (o que descobri)

1. **Tudo simulado lance a lance não cabe num celular.** Com 282 clubes a temporada leva ~200 s neste computador, e o celular é mais lento. Mas só ~13% disso é a simulação das partidas; **77% é o mercado da IA**, que cresce com o quadrado do número de clubes e precisa ser refeito antes de qualquer liga nova.
2. **Recomendação: duas fidelidades.** Lance a lance só para a liga do técnico e as divisões ligadas a ela por acesso e rebaixamento (até 3 ligas). As demais ligas usam um resultado simplificado calibrado contra o motor completo (~6 µs por partida contra ~7 ms, mais de 1000 vezes mais barato).
3. **O save de 17,4 MB (limite: 3 MB) tem solução sem perder dados do técnico:** gzip dá 1,9 MB sozinho (9,4×); guardar o resto do mundo de forma compacta e sem o livro-caixa da IA dá **0,8 MB comprimido** (cenário B, medido).
4. **O calendário precisa deixar de ser único.** Hoje existe uma temporada, uma data, uma virada. Proponho relógio global contínuo, **temporada e virada por liga**, janelas por região, idade e evolução no aniversário do jogador (senão quem muda de liga envelhece duas vezes).
5. **Economia:** uma moeda só (o R$ de hoje), com um **índice de receita por liga** que escala TV, patrocínio e ingresso; os salários seguem a receita. O equilíbrio vem dos mecanismos que já existem (folha sustentável, orçamento de compras) mais um freio de exportação e um limite de estrangeiros, tudo conferido por teste de longo prazo.

---

## 2. Como foi medido

**Máquina:** AMD Ryzen 5 5500U (notebook, 12 núcleos lógicos), 6,3 GB de RAM, Node 24. Motor de JavaScript V8, o mesmo do Chrome do Android.

**Mundo de teste (fictício, mas do tamanho do plano):** 282 clubes e 15 ligas.

| Região | Ligas (times, formato) |
|---|---|
| Brasil | Série A (20, ida e volta), B (20, ida e volta), C (20, ida e volta) |
| América do Sul | Argentina (28, turno único), Uruguai (16), Paraguai (12), Chile (16), Colômbia (20), Equador (16) |
| Europa | Inglaterra (20), Espanha (20), Itália (20), Alemanha (18), França (18), Portugal (18) |

Total: **7.486 jogadores profissionais, 2.666 na base, 4.808 partidas por temporada.**

**O que foi simulado:** a temporada inteira, com o mercado da IA ligado, treino, finanças, lesões e suspensões, todas as ligas **lance a lance** (nada simplificado), o técnico no automático numa liga de 20 clubes. Cada "avanço" é o que o botão faz: pula até o próximo dia de jogos do técnico.

**Limites da medição (honestidade):**
- **Não medi num celular.** Os tempos abaixo são deste notebook. Para o celular de referência (**iPhone 11**) uso uma **estimativa de 1× a 1,5× o tempo do notebook**; para um Android básico seria 3× a 5×. É suposição, não medida; vale confirmar no aparelho.
- Todas as ligas começam no mesmo dia (calendário brasileiro). O calendário real, com ligas em épocas diferentes, não foi simulado; isso muda a distribuição das partidas por avanço, não o custo total.
- A virada de temporada do motor assume 2 séries; com 15 ligas ela roda mas produz um calendário errado (45.978 partidas), então **o tempo dela é só uma ordem de grandeza** (~3 s).
- Pesos e tamanhos de cada liga são fictícios (reputações e níveis inventados), suficientes para medir custo, não para medir equilíbrio.

---

## 3. Números medidos

### 3.1 Tempo e memória

| | Mundo atual (A+B, 40 clubes) | Brasil A+B+C (60 clubes) | **Plano (282 clubes)** |
|---|---|---|---|
| Jogadores (+ base) | 1.053 (+364) | 1.542 (+516) | **7.486 (+2.666)** |
| Partidas por temporada | 760 | 1.140 | **4.808** |
| Gerar o mundo (novo jogo) | n/d | 0,15 s | **0,4 a 0,7 s** |
| Uma partida lance a lance | 5 a 7 ms | 7 a 9 ms | **7 ms** |
| Temporada inteira | **7,6 s** | **14,4 s** | **197 a 234 s** (3 execuções) |
| Avanço típico (mediana) | 68 ms | 92 ms | **430 a 535 ms** (~69 partidas) |
| Avanço lento (p95) | 229 ms | 515 ms | **13,7 a 16 s** |
| Pior avanço | 1,7 s | 5,6 s | **107 a 128 s** |
| Memória depois da coleta, fim da temporada (bruta, com ~13 MB do próprio programa) | 28 MB | 35 MB | **95 MB** |
| Pico de memória na temporada (com lixo) | 115 a 140 MB | 145 MB | **~495 MB** |
| Só a simulação das partidas (partidas × ms por partida) | 4 a 6 s | 8 a 10 s | **~33 s** |

(O mundo recém-criado ocupa só 12,5 MB líquidos nos 282 clubes; no fim da temporada são ~81 MB líquidos, porque as partidas jogadas ficam inteiras na memória, com narração e notas, até a hora de salvar.)

**Estimativa para o celular (3× a 5×, não medido):**

| | Neste notebook | Celular (estimado) |
|---|---|---|
| Temporada, tudo simulado, como o motor está | ~200 s | 10 a 17 min |
| Avanço típico, tudo simulado | ~0,45 s | 1,4 a 2,3 s |
| Avanço típico no mundo atual (já aceito hoje) | 0,07 s | 0,2 a 0,35 s |

### 3.2 De onde vem o tempo (perfil do mundo completo, 243 s)

| Parte | Tempo | Parcela |
|---|---|---|
| **Mercado da IA (`runMarketTick`)** | 186 s | **77%** |
| Partidas (`simulateMatch`) | 31 s | 13% |
| Treino de todos os jogadores (`applyTraining`) | 3,4 s | 1,4% |
| Escalação da IA (`aiTactic`/`buildTactic`) | 2,3 a 2,4 s | 1% |
| Pré-contratos da IA | 4,6 s | 2% |
| Virada de temporada (estimativa, ver limites) | ~3 s | n/d |

O mercado é o problema, não as partidas:
- Cada rodada semanal de negociações da IA custa **0,5 s com 60 clubes** e **14 a 17 s com 282**. Cresceu ~29× com 4,7× mais clubes: **custo quadrático** (cada clube avalia candidatos entre todos os jogadores do mundo).
- O pior avanço (107 a 128 s) é o primeiro: a janela de pré-temporada vai de 1º de janeiro até o dia antes da primeira rodada (10 de abril), são ~14 rodadas semanais de negociações da IA seguidas, atravessadas de uma vez porque nenhuma delas tem novidade para o técnico.
- Os outros avanços lentos (julho: 13,7 a 17 s cada) são a janela do meio do ano.
- Fora das janelas, o avanço é só simulação, e o custo é linear: ~7 ms por partida × partidas do dia.

### 3.3 Partidas simplificadas

Um resultado simples (força dos 11 melhores de cada lado + Poisson, sem calibrar) custou **4 a 10 µs por partida** (medi três vezes), contra ~7 ms da partida completa: **~1000× mais barato**. As 4.428 partidas fora da liga do técnico custariam ~40 ms por temporada. Este número é um piso (a versão calibrada tem mais contas: artilheiros, cartões, lesões), mas continua desprezível perto do resto.

### 3.4 Save

| | Mundo atual | Brasil A+B+C | **Plano** |
|---|---|---|---|
| Início da temporada | 1,4 MB | 2,0 MB | **9,8 MB** |
| Fim da temporada (já compactado pelo `compactGame`) | 2,5 MB | 3,6 MB | **17,0 MB** |
| Fim da temporada, sem compactar | 9,2 MB | 13,5 MB | **58,6 MB** |
| JSON.stringify do save | 16 ms | 22 ms | **~125 ms** |
| Clone estruturado (o que o IndexedDB faz) | 36 ms | 50 ms | **340 a 400 ms** |

Composição do save de 17,0 MB no fim da temporada:

| Parte | KB | Observação |
|---|---|---|
| Jogadores | 7.040 | 963 bytes por jogador; **só os valores, sem os nomes dos campos, seriam 2.046 KB** |
| Partidas | 5.392 | 4.428 são de ligas fora da do técnico: **4.966 KB em JSON ou 167 KB só com placar, cartões e rodada** |
| Base dos clubes | 2.357 | 2.171 KB são de clubes de outras ligas |
| Times | 2.319 | **1.900 KB são o livro-caixa (`ledger`)**, que a IA não precisa |
| Mercado | 265 | |

**Compressão (gzip nível 6, medida):** o save de 17,0 MB vira **1,86 MB (9,4×)**, 290 a 320 ms para comprimir neste notebook (~1 a 1,6 s no celular).

**Cenário B (medido):** liga do técnico completa; o resto dos jogadores só com os valores (sem nomes de campos); as outras partidas só como placar e cartões; base só da liga do técnico; livro-caixa só dos clubes da liga do técnico: **4,07 MB em JSON, 0,82 MB com gzip**.

---

## 4. Recomendação por ponto

### 4.1 Simular tudo por completo, ou simplificar

**Recomendo duas fidelidades:**

| Nível | Quem | Como |
|---|---|---|
| **Completo** | A liga do técnico e as divisões ligadas a ela por acesso e rebaixamento (no máximo 3 ligas; no Brasil, A+B+C) | Lance a lance, igual ao de hoje |
| **Simplificado** | Todas as outras | Resultado por força e sorteio com semente; gols e assistências atribuídos por posição e chance; cartões e lesões por taxa; sem narração, sem notas |

Por quê, com os números:
- O orçamento de um avanço no celular deve ficar perto do atual (0,2 a 0,35 s, ~10 partidas completas). Completo em tudo daria 69 partidas por avanço, 1,4 a 2,3 s: o jogo deixaria de ser "rápido como o Brasfoot".
- Três ligas completas (Brasil A+B+C) são 1.140 partidas, **8 a 10 s neste notebook** (cerca de 25 a 50 s no celular) por temporada de simulação de partidas. É o pior caso do "completo" e é parecido com o custo de hoje.
- Fora dessas, o técnico só enxerga tabela, artilharia e transferências. Ninguém vê o lance. Perder o detalhe lance a lance é invisível.

O que o simplificado precisa **preservar** (conferido por teste em `tests/balance/`, comparando com o motor completo em milhares de partidas):
- distribuição de gols por jogo (2,3 a 2,5), empates 25 a 30%, mandante 45 a 50%, em cada liga;
- relação força → pontos: o elenco mais forte termina em média por volta do 3º, com zebras;
- artilharia e cartões plausíveis (a faixa de gols do artilheiro de uma liga de 20 clubes, a calibrar contra o motor completo);
- lesões e suspensões, para os elencos da IA continuarem rodando.

O que se perde: o efeito de estilo e formação da IA nas ligas simplificadas (a IA já usa táticas fixas, então o impacto é pequeno).

**Se o técnico trocar de liga:** a liga nova vira completa a partir daquele dia. As rodadas já jogadas continuam com os resultados simplificados.

**Também deixam de ser calculados dia a dia nas ligas simplificadas:** escalação da IA (`aiTactic`, ~2,4 s por temporada) e treino mensal (3,4 s). O treino é aplicado de uma vez (ganho anual igual ao de hoje, na virada) e a escalação só é calculada quando a liga vira completa.

**Mercado da IA (precisa ser refeito primeiro, independente do resto):**
- Hoje cada clube compara com todos os jogadores do mundo. Proponho **lista de candidatos por clube** (mesma liga, mesmo país, mesma região e anunciados, no máximo ~30 por avaliação), índices por posição e cálculo do papel do jogador (`squadRole`) feito uma vez por rodada, não uma vez por candidato. É onde o perfil mostra o tempo (`profileOf`, `squadRole`, `overallForPosition`, `askingPrice`).
- Nas ligas simplificadas só uma parte dos clubes age por rodada (rodízio).
- **Meta: ≤ 2 s por temporada para 282 clubes neste notebook** (linear, hoje ~186 s). É uma meta, não um número medido.
- O primeiro avanço do jogo (janeiro até a primeira rodada) hoje leva ~2 minutos; precisa ficar abaixo de 1 s.

**Orçamento projetado de uma temporada (notebook), se tudo acima der certo:** 3 ligas completas 8 a 10 s + 40 ms simplificado + mercado ≤ 2 s + resto (finanças, treino da liga, virada) ≈ 3 s: **~14 a 16 s, cerca de 45 a 80 s no celular**, contra 7,6 s (23 a 38 s no celular) no jogo de hoje com 40 clubes. É uma estimativa para fixar a meta, a ser confirmada ao implementar.

**Memória:** pico de ~495 MB e ~81 MB líquidos no fim da temporada (contra 12,5 MB no início) são altos para um celular intermediário. Duas causas, as duas fáceis:
1. As partidas jogadas guardam narração, notas e lances na memória até o save. A compactação que hoje só existe no momento de salvar (`compactGame`) deve acontecer **na hora**, para as partidas das outras ligas e, depois de alguns dias, para as do técnico. Efeito esperado: o fim da temporada fica perto de 30 a 40 MB.
2. A cada dia de jogos o motor copia as listas inteiras (`matches.map`, `players.map`: 4.808 e 7.486 itens). Separar partidas por liga e jogadores por clube faz o avanço copiar só o que mudou. **Meta: pico abaixo de 150 MB.**

### 4.2 Calendário, virada e janelas

**Problema.** Hoje existe um `SeasonState` com um `year`, uma data atual, uma fase e uma virada para todos. Ligas europeias (agosto a maio) e sul-americanas (abril a dezembro no jogo, hoje) não cabem nisso.

**Proposta:**

1. **Relógio global contínuo.** O jogo avança por dias; o "avançar" pula até o próximo evento *do técnico*: partida dele, evento do mercado que o afeta, fim da liga dele. As outras ligas são simuladas no caminho.
2. **Cada liga tem a sua temporada.** Configuração por liga no pacote: mês e dia da primeira rodada, número de rodadas e a data do fim do contrato (30/6 para o padrão europeu, 31/12 para o sul-americano). `Season.year` vira "o ano em que a liga começou": rótulo "2026" nas ligas de ano civil e "2026/27" nas que cruzam o ano.
3. **Virada por liga (pirâmide).** A virada de temporada roda para uma *pirâmide* (todas as divisões de um país) quando a última rodada dela termina e passam 14 dias. Para o técnico, continua o botão "Encerrar a temporada" quando a liga dele acaba. Para as outras, é automática e silenciosa. A função `advanceSeason` hoje assume Série A/B; precisa receber a lista de divisões de uma pirâmide.
4. **Países com uma divisão só ficam fechados** (sem rebaixamento nem acesso) nesta fase: o pacote só traz a primeira divisão desses países e o jogo não inventa clubes de uma segunda. Quando o técnico estiver nessas ligas, o "risco de rebaixamento" deixa de existir e a diretoria cobra por posição e finanças. Abrir esses países para uma segunda divisão é uma fase futura e o formato do pacote já comporta (`level`, `promotion`, `relegation`).
5. **Contrato acaba na data dele**, verificado no dia, e não na virada: o jogador vira livre no dia 30/6 ou 31/12 conforme o contrato, qualquer que seja a liga. Isso também resolve o pré-contrato: vale nos últimos 6 meses do contrato, não "a partir de 1º de julho" como hoje (que supõe temporada de ano civil).
6. **Idade e evolução no aniversário do jogador, não na virada.** O problema de manter na virada: o jogador sai da Europa em junho (envelhece na virada de lá) e chega ao Brasil em julho, que vira em dezembro: envelhece duas vezes em seis meses. Guardar a data de nascimento no jogador (o pacote já tem; o mundo fictício deriva) e aplicar o ano de idade, o declínio dos veteranos e o ruído nos atributos no aniversário. Bônus: o trabalho se espalha pelo ano (~20 jogadores por dia em vez de 7.500 de uma vez). O treino mensal continua dividido pela janela de jogos da liga do clube.
7. **Início do jogo.** O novo jogo começa no início da pré-temporada da liga do técnico. As outras ligas, que a essa data estão em outro ponto, passam por um **pré-aquecimento simplificado** (rodadas já jogadas, tabela e artilharia) que custa milissegundos (seção 3.3).
8. **Saves antigos.** Subir `SAVE_VERSION` para 10, com migração: o mundo de duas séries vira uma pirâmide de um país com `start` do calendário atual (11 de abril) e janelas atuais (janeiro e julho).

**Janelas de transferência por região (valores de partida, a calibrar):**

| Região | Janela 1 | Janela 2 | Observação |
|---|---|---|---|
| Brasil | 1/1 a 10/4 (até o dia antes da 1ª rodada) | 1/7 a 31/7 | Igual a hoje (`transferWindows`: pré-temporada e meio do ano) |
| América do Sul (demais) | 1/1 a 15/3 | 1/7 a 31/7 | |
| Europa | 1/7 a 31/8 | 1/1 a 31/1 | |

**Regra de negociação:** a transação vale quando a **janela do comprador** está aberta (é como o registro funciona na prática), e o vendedor da IA respeita as próprias regras de elenco mínimo (`minSquadAfterSale`, cobertura por posição, já existentes). Então um clube sul-americano vende para a Europa em agosto e janeiro, e a reposição dele acontece na janela dele. Livres e pré-contratos não dependem de janela. O tempo entre janelas de regiões diferentes deixa lacunas reais (um clube europeu compra em agosto, quando o brasileiro já não pode repor), o que é parte do jogo.

### 4.3 Formatos de liga (16 a 30 times, um ou dois turnos)

Campos novos por liga no pacote: `rounds: 1 | 2` (turno único ou turno e returno) e `teams` já existe.

| Times | Ida e volta: rodadas / partidas | Turno único: rodadas / partidas |
|---|---|---|
| 12 | 22 / 132 | 11 / 66 |
| 16 | 30 / 240 | 15 / 120 |
| 18 | 34 / 306 | 17 / 153 |
| 20 | 38 / 380 | 19 / 190 |
| 24 | 46 / 552 | 23 / 276 |
| 28 | 54 / 756 | 27 / 378 |
| 30 | 58 / 870 | 29 / 435 |

Custo de simulação completa da liga (7 ms por partida): de 0,9 s (12, ida e volta) a 6,1 s (30, ida e volta) por temporada neste notebook; 20 times é 2,7 s.

**Recomendações:**
- **Regra de tamanho:** até 20 times, ida e volta; de 21 a 30, turno único. Acima de ~46 rodadas o calendário não cabe (fim de semana + quarta) e a validação do pacote recusa (`league-rounds`).
- **Turno único:** o método do círculo já existente serve; só sai o returno do espelhamento. A regra de mando (`maxVenueStreak`, no máximo 2 seguidos) continua valendo. Num turno único cada par joga uma vez, então metade dos times tem 1 jogo em casa a mais; o sorteio da semente muda a cada temporada e a diferença se anula na média.
- **Calendário por liga:** `roundSlots` hoje só sabe "primeiro sábado depois de 11/4, uma rodada a cada 5 na quarta". Deve receber o início e a quantidade de rodadas da liga, e acrescentar quartas só quando o número de rodadas passa dos fins de semana disponíveis na janela (Europa: ~40 semanas de agosto a maio; Brasil: ~36 semanas de abril a dezembro).
- **Número par de times:** exigido pelo método do círculo, validado pelo pacote. Ímpar fica fora desta fase.
- **Metas de equilíbrio por liga:** hoje "campeão com 70 a 82 pontos" vale só para 38 rodadas. O teste passa a conferir **pontos por jogo** (campeão entre ~1,85 e ~2,15 por jogo; empates 24 a 30%).
- **Formatos que o jogo real usa e ficam fora desta fase:** Apertura/Clausura com final (Colômbia, Uruguai, Paraguai, Argentina em alguns anos) e playoffs. Aproximo todas como liga simples. Quando houver mata-mata (Fase 3), esses formatos entram sem nova mudança no calendário.
- **Acesso e rebaixamento por liga:** `promotion` e `relegation` já são campos da liga. Na Série C, 4 sobem para B; da B, 4 caem para a C.

### 4.4 Economia entre ligas

**Moeda única: o R$ de hoje.** Nada de câmbio. Motivo: câmbio acrescenta contas e tabelas sem criar decisão para o técnico; o que importa é a **proporção** entre as ligas. O pacote traz `currency` apenas como rótulo para uma futura troca da moeda exibida.

**Receita e salários por liga: um índice de receita `R` por liga**, com a Série A brasileira = 1,0. Ele multiplica três coisas que hoje são constantes globais em `config.ts`:
- a cota de TV (`FINANCE.tvRights`, hoje A = 20 M e B = 3 M por clube/ano, ou seja, B = 0,15);
- o patrocínio (`FINANCE.sponsorship`);
- o preço padrão do ingresso (`FINANCE.ticket`).

Os **salários** seguem a receita sem regra nova: a folha sustentável da IA (`sustainablePayroll`: receita esperada menos operação, × 0,95) e os cortes já derivam da receita. Falta apenas fazer `expectedSalary(jogador)` depender do índice da liga do clube que contrata, para que um clube rico pague mais pelo mesmo jogador e um pobre não tenha de pagar o salário europeu.

Valores de partida (ordem de grandeza inspirada nos campeonatos reais; **são pontos de partida para calibrar, não dados reais**):

| Liga | Índice `R` | Nível dos titulares (alvo) |
|---|---|---|
| Inglaterra | 5,0 | ~74 |
| Espanha | 3,0 | ~73 |
| Alemanha | 2,8 | ~71 |
| Itália | 2,5 | ~71 |
| França | 1,8 | ~68 |
| **Brasil A** | **1,0** | **~66** (valor atual) |
| Portugal | 0,9 | ~65 |
| Argentina | 0,6 | ~63 |
| Colômbia | 0,45 | ~60 |
| Chile | 0,40 | ~59 |
| Uruguai, Equador | 0,30 | ~58 |
| Paraguai | 0,25 | ~57 |
| **Brasil B** | **0,15** | **~52** (valor atual) |
| Brasil C | 0,06 | ~46 |

(O nível de Brasil A e B é o que já existe e o que `tests/balance` defende hoje; as demais ligas se calibram em relação a eles.)

**Por que isso mantém o equilíbrio (e o que precisa ser vigiado):**
1. *Dentro de cada liga* nada muda de natureza: cada clube gasta o que a liga dele rende. As regras de hoje (folha sustentável, teto de caixa `ceilingYears`, orçamento de compras, ninguém no vermelho) escalam com a receita.
2. *Entre ligas*, o risco é dreno de talento: liga rica compra o melhor das pobres todo ano, a pobre perde nível ano a ano. Três freios:
   - o preço de mercado cresce de forma exponencial com a força (a cada ~6 pontos o preço dobra), então os craques ficam caros mesmo para ligas ricas;
   - **freio de exportação:** cada clube só vende para uma liga de coeficiente maior até N titulares por janela (padrão 1 a 2), e a IA compradora dá preferência a quem tem contrato curto ou já saiu do time titular;
   - **reposição:** as categorias de base de cada liga têm a qualidade da própria liga (os `qualityOffset` e `wonderkidChance` de hoje viram por liga), de modo que o nível de uma liga não seja só importado.
3. **Teste de longo prazo por liga** (extensão de `tests/balance/longRun.test.ts` e de `npm run analyze -- years`): 30 temporadas com as 15 ligas; nível médio dos titulares de cada liga dentro de ±3 do alvo (±4,5 nas inferiores, como hoje); nenhum clube da IA no vermelho nem acumulando acima de `ceilingYears`; fluxo líquido de jogadores entre ligas (entradas menos saídas) abaixo de uma fração do total por ano; os 40 melhores jogadores do mundo espalhados por pelo menos X clubes (já medido em `top40` para uma liga).
4. **A distância entre ligas é parte do jogo, não um defeito:** uma liga estar 8 a 12 pontos de força acima de outra é o objetivo (como A e B hoje, ~10 pontos).

### 4.5 Mercado internacional

**Como a força da liga pesa no interesse do jogador.** Hoje o interesse vem de `playerDecision`: salário oferecido contra o que ele espera, diferença de reputação entre o clube novo e o atual, tempo de jogo e inércia. Proponho um termo novo, no mesmo desenho do termo de reputação:

```
liga = clamp((coefLiga(comprador) − coefLiga(atual)) / passo, −1,5, 1,5) × pesoLiga
```

- `coefLiga` é um número por liga (o mesmo que define o nível dos titulares na tabela acima, normalizado de 0 a 1).
- Quem sobe de liga ganha interesse mesmo com salário menor (o brasileiro que vai para a Europa); quem desce exige salário maior (o europeu que vai para o Brasil). Jogadores acima de 30 anos, que valorizam menos a liga e mais o salário, têm `pesoLiga` menor.
- Para jogador livre (sem clube), o "clube atual" é o último; se não houver, usa-se a expectativa pela força, como já acontece com `expectedClubReputation`.
- **Adaptação** (pequeno custo, só para mudança de região): jogador que atravessa o oceano precisa de salário um pouco maior e rende abaixo do normal nas primeiras semanas (reuso do `morale`). Fica como segunda etapa, depois que o termo de liga estiver calibrado.
- A negociação (`Negotiation`) mostra o motivo: "Liga mais forte", "Liga menos forte", "Adaptação".

**Reputação:** passa a ser uma escala global (1 a 20) de prestígio do clube, independente do coeficiente da liga. A média por divisão (`OFFSEASON.reputation.tierMean`, hoje A = 12 e B = 5,5) vira uma média por liga.

**Limite de estrangeiros: sim, por liga, mas simples.** Um campo `foreignLimit` (máximo de jogadores de fora do país no elenco de 30), checado na proposta (motivo novo `foreign-limit`) e respeitado pela IA.

| Região | Limite (de partida) |
|---|---|
| Brasil (A, B, C) | 8 |
| Inglaterra, Espanha, Itália, Alemanha, França | 16 |
| Portugal, Argentina | 12 |
| Colômbia, Chile, Uruguai, Paraguai, Equador | 6 |

Por que ter limite: sem ele, ligas menores viram "uma liga estrangeira" em poucos anos (a IA compra o mais forte disponível), e o jogo perde a identidade de cada campeonato. Por que simples: as regras reais variam muito (cota de campo, de súmula, de elenco, jogador formado na base). **Esses números são parâmetros do jogo, não as regras reais.** A nacionalidade já vem com bandeira em `labels.ts` (nacionalidade nova exige bandeira); o mundo grande traz nacionalidades novas (Inglaterra, Alemanha, etc.).

### 4.6 O limite de 3 MB do save

Hoje o limite aparece em `tests/balance/saveSize.test.ts` (o save do fim da temporada fica abaixo de 3 MB). O mundo grande tem **17,0 MB** no fim da temporada. Proposta em camadas, da mais barata à mais trabalhosa:

| Passo | O que faz | Efeito medido | Custo |
|---|---|---|---|
| 1. Compressão (gzip pelo `CompressionStream`) | Grava os bytes comprimidos | 17,0 MB → **1,86 MB** (9,4×) | ~300 ms neste notebook por save (1 a 1,6 s no celular) |
| 2. Livro-caixa só do clube do técnico e da liga dele | A IA não precisa do extrato | −1,9 MB em JSON | trivial |
| 3. Resto do mundo em forma compacta | Jogadores das outras ligas como lista de valores (sem nomes de campos); partidas das outras ligas só com placar, cartões e rodada | jogadores 6,5 → 1,9 MB; partidas 5,0 → 0,17 MB | adaptador de gravar/ler; saves na versão 10 |
| 4. Base dos clubes de outras ligas | Só guardar a contagem e a semente; os jovens são gerados quando a liga vira completa ou na virada | −2,2 MB | médio |
| **1 + 2 + 3 + 4 juntos (cenário B)** | | **4,07 MB em JSON, 0,82 MB comprimido** | |

**Recomendo 1, 2 e 3 como base e 4 como segunda etapa.** E alinho a medida do limite: **3 MB sobre os bytes gravados (comprimidos)**, com um segundo teto de **~6 MB de JSON na memória** para o tempo de cópia e a memória do celular ficarem sob controle. No cenário B, comprimido ficaria em 0,82 MB, três vezes abaixo do teto, o que dá folga para crescer (histórico de várias temporadas das 15 ligas: cada temporada arquivada hoje custa poucos KB com 2 tabelas; estimo ~20 KB com 15, o que em 30 temporadas é ~0,6 MB em JSON, comprimido bem menos).

**Tempo de gravação.** Comprimir 17 MB a cada avanço (300 ms neste notebook, 1 a 1,6 s no celular, mais 340 a 400 ms do clone do IndexedDB) travaria a tela a cada toque. Então, junto com o passo 1:
- **Gravar por partes.** Hoje o save é um objeto só (`games.put({slot, envelope})`). Dividir em tabelas do Dexie por liga/clube, e gravar **só o que mudou**. Como o motor é imutável (cada dia devolve novos objetos só para o que mudou), basta comparar referências entre o jogo anterior e o novo. O custo de cada gravação passa a depender do que o avanço tocou (dezenas de KB), não do mundo inteiro.
- Compressão só quando houver mudança grande (fim de temporada, exportar). O arquivo de backup (`saveFile.ts`) pode ser gzip desde o início.

**Compatibilidade.** `SAVE_VERSION` 10 com migração (seção 4.2); save antigo abre como um país com duas divisões e janelas atuais.

---

## 5. Ordem de trabalho proposta

Cada etapa termina com os testes de hoje passando e os resultados do mundo atual idênticos (`tests/matchGolden.test.ts`, `npm run analyze -- years --years 30 --seed 41`).

| Parte | O que | Por que nesta ordem |
|---|---|---|
| **B1** | Desempenho: mercado da IA com lista de candidatos e cache, compactação imediata das partidas, índices por liga e clube | Sem isso nada do resto roda. Dá para fazer e medir ainda no mundo de 2 séries, sem mudar nenhum resultado |
| **B2** | Modelo de liga/pirâmide: formato (`rounds`), calendário por liga, janelas por região, virada por pirâmide, aniversário, contrato com data. Brasil A/B/C | Generaliza o motor em cima de um caso real (3 divisões) |
| **B3** | Resultado simplificado + pré-aquecimento + testes comparando com o completo | Só depois de B2 há "outras ligas" para simplificar |
| **B4** | Salvamento em partes + compressão + versão 10 | Pode andar junto com B3 |
| **B5** | Economia por liga (`R`), termo de liga no interesse, limite de estrangeiros, freio de exportação | Precisa das ligas todas existindo |
| **B6** | Teste de longo prazo das 15 ligas, ajuste fino, pacote do usuário com várias ligas (tirar `unsupported-leagues` aos poucos) | Fecha a fase. Feito nas seções 14 (B6) e 15 (B7, pacote com várias ligas) |

---

## 6. Riscos

- **Estimativa de celular.** A principal incerteza. Mitigação: medir num aparelho real no fim da parte B1 (a ferramenta `worldScale` roda no navegador com pouco ajuste) e rever as metas.
- **Calibração do simplificado.** Se as ligas simplificadas ficarem estatisticamente diferentes das completas, o técnico que mudar de liga percebe. Mitigação: o teste de comparação em B3 antes de usar.
- **Equilíbrio entre ligas** é a parte menos previsível: as tabelas de índice acima são palpites que o teste de 30 temporadas vai corrigir.
- **Idade no aniversário** muda o jeito como a virada trata evolução e quebra a expectativa de "um ano de evolução por temporada" nos testes de longo prazo de hoje; é preciso reescrever essas medidas, mantendo o ritmo de evolução anual.

---

## 7. Como importar o pacote de exemplo no celular

O arquivo é `dados-reais/mundo-ficticio-exemplo.json` (0,82 MB): o mesmo mundo fictício do jogo, semente 7, 40 clubes e 1.053 jogadores. A pasta `dados-reais/` está no `.gitignore`, então o arquivo não vai para o repositório nem para o site.

1. **Levar o arquivo ao celular:** Google Drive, e-mail para você mesmo, mensagem para si (WhatsApp/Telegram), cabo USB (copie para a pasta Downloads) ou AirDrop/iCloud Drive no iPhone. Precisa ficar num lugar que o seletor de arquivos do celular enxerga.
2. **Abrir o jogo no celular** (instalado como app ou no navegador; veja `docs/pwa.md` para o endereço com HTTPS).
3. Na tela inicial, tocar em **"Novo jogo com pacote de dados"**.
4. Tocar em **"Escolher arquivo"** e escolher `mundo-ficticio-exemplo.json` (Android: seletor de documentos/Downloads/Drive; iPhone: app Arquivos).
5. O jogo valida e mostra o nome, a quantidade de clubes, jogadores e divisões, e os créditos. Tocar em **"Escolher o time"**.
6. Escolher o time e jogar. O pacote fica guardado só neste navegador, junto com os seus saves.

Observações:
- No iPhone o app instalado na tela de início e o Safari têm armazenamento separado: importe o pacote **dentro do app que você vai usar**.
- Gerar de novo, com outra semente: `node tools/run.mjs exportPackage --seed 9 --out dados-reais/outro.json`. O comando valida o arquivo e confere que carregar o pacote dá o mesmo mundo que gerar direto.
- Este pacote tem as mesmas duas divisões que o jogo aceita hoje. Um pacote com mais ligas é recusado (`unsupported-leagues`) até a parte B2.

---

## 8. Decisões tomadas

1. **Duas fidelidades: aprovado, com duas condições.**
   - Quando o técnico vai para um clube de outra liga, essa liga passa a ser lance a lance; a antiga, se não está ligada à nova por acesso e rebaixamento, vira simplificada.
   - As ligas simplificadas também geram **gols, assistências, cartões, notas e lesões** dos jogadores, para artilharia, forma, valor de mercado e evolução fazerem sentido (a calibragem do simplificado tem de cobrir isso; ver B3).
2. **Moeda única em R$**, com índice de receita por liga.
3. **Países com uma divisão ficam fechados** por enquanto.
4. **Save: 3 MB sobre os bytes gravados (comprimidos).** Nova meta: **pico de memória de no máximo ~250 MB, medido no mundo de 282 clubes** (`tools/worldScale.ts`).
5. **Idade no aniversário.** O mundo fictício passa a gerar datas de nascimento.
6. **Celular de referência: iPhone 11** (A13, 4 GB, Safari/JavaScriptCore). Correção da estimativa: o fator 3× a 5× era para Android intermediário e básico. O A13 tem desempenho de um thread parecido com o do notebook de medição, então uso **1× a 1,5×** (térmica, JavaScriptCore e o Safari limitando a memória por aba). É estimativa, não medição.

---

## 9. Resultado da parte B1 (desempenho)

Feito sem mudar nenhum resultado do jogo: `npm run analyze -- years --years 30 --seed 41` no mundo atual dá **saída idêntica, linha por linha**, à de antes (de 277 s para 150 a 160 s), e `npm test` passa (593 testes).

**O que mudou**
1. **Mercado da IA** (`src/engine/market/ai.ts`, `value.ts`, `precontract.ts`), só com atalhos exatos:
   - força do jogador guardada por objeto de atributos (`overall.ts`) e valor de mercado guardado por jogador e data;
   - elenco de cada clube montado uma vez por rodada (e reaproveitado enquanto não muda), em vez de um por clube;
   - lista de candidatos por posição, do mais forte ao mais fraco, que pula de uma vez quem não dá o ganho mínimo ou não cabe na folha de salários (a ordem original e os sorteios ficam iguais);
   - papel do jogador no elenco por busca binária numa lista ordenada, anúncios por índice e conversão de datas guardada;
   - pré-contratos da IA com as condições que não mudam por jogador calculadas uma vez.
2. **Memória:** o resultado das partidas de outras equipes já fica enxuto na temporada (`src/engine/season/compact.ts`: gols, assistências e cartões; sem narração nem notas). O `compactGame` do save usa a mesma função e agora também enxuga `lastDay`.
3. Teste novo: `tests/marketPerformance.test.ts` (atalhos contra a conta direta).

**Mundo de 282 clubes, mesma máquina** (`node --expose-gc tools/run.mjs worldScale --world full --live`)

| | Antes | Depois |
|---|---|---|
| Temporada inteira | 197 a 234 s | **49 a 56 s** |
| Avanço típico (mediana) | 430 a 535 ms | 440 a 515 ms (é só simulação de ~69 partidas) |
| Avanço lento (p95) | 13,7 a 16 s | **1,7 a 2,1 s** |
| Pior avanço (pré-temporada) | 107 a 128 s | **10 a 12 s** |
| Mercado da IA na temporada | ~186 s | **~15 s** |
| Pico de memória (com lixo) | ~495 MB | **~123 MB** |
| Pico de memória viva (depois de coletar o lixo a cada avanço) | n/d | **36 MB líquidos** |
| Memória no fim da temporada | 95 MB | 49 MB |
| Roda com o teto de heap em 250 MB? | n/d | **sim** (`--max-old-space-size=250`, 49 s) |

**Meta de memória (≤ 250 MB no mundo de 282 clubes): atingida**, tanto no pico bruto medido (123 MB) quanto na prova com teto de 250 MB.

**iPhone 11 (estimativa de 1× a 1,5×, não medida):** temporada com as 15 ligas completas ~55 a 80 s; avanço típico 0,5 a 0,75 s; primeira rodada de pré-temporada 10 a 15 s; p95 2 a 3 s.

**Meta não atingida:** a meta era mercado ≤ 2 s por temporada e primeiro avanço < 1 s. Ficou em ~15 s e ~10 s. O que resta é custo linear de verdade: 282 clubes × ~14 rodadas na pré-temporada, cada clube avaliando milhares de candidatos. Reduzir mais exige candidatos limitados por clube ou só parte dos clubes agindo por rodada, o que **muda as decisões da IA** (e não pode ser feito no mundo atual sem mudar os resultados). Proponho fazer isso junto com B2/B3, onde as ligas fora do foco passam a negociar em rodízio por desenho. Também não fiz a separação de partidas por liga e jogadores por clube: com a compactação, o pico de memória já está bem abaixo da meta e a cópia das listas custa menos de 1 ms por dia.

**Adiado para B2:** a data de nascimento no mundo fictício e a idade no aniversário. Gerar a data hoje sem mexer nos sorteios é possível, mas só faz sentido junto com a mudança da virada; fazer agora aumentaria o save sem efeito.

---

## 10. Resultado da parte B2 (modelo de liga e Série C) e testes mais leves

**Feito na B2:** Série C (Brasil com três divisões de 20 clubes, 60 no total; acesso e rebaixamento entre séries vizinhas, A↔B e B↔C), data de nascimento no mundo fictício e idade no aniversário, contratos com data (os que vencem no meio do ano são resolvidos no dia, com pré-contrato), calendário por liga, tela de diagnóstico de desempenho e save versão 10 (migração 9→10 gera as datas de nascimento sem sorteio). A virada passou a cortar a folha da IA antes da reposição de posições.

**Testes mais leves.** Depois de reiniciar o computador (6 GB), cada arquivo foi medido sozinho, do menor ao maior. Nenhum caiu por falta de memória: os 43 arquivos rápidos levam de 3 a 26 s e os 11 de balanceamento de 25 s a 160 s. Por isso **não foi preciso** dividir arquivos nem configurar o GitHub Actions para os pushes da branch (o `pages.yml` continua rodando só na `main`). O que parecia "pesado" eram problemas de lógica, corrigidos sem perder nenhuma conferência:

| Teste | Problema | Correção |
|---|---|---|
| `birthdays.test.ts` (save v10) | O técnico automático era demitido no meio da temporada e o `while` esperando o fim da temporada nunca terminava (memória e tempo sem parar, mais de 8 min) | O laço ignora a demissão e tem limite de 200 passos; agora o arquivo inteiro leva ~16 s |
| `offseason.test.ts` | Clube da IA terminava a virada com 30 jogadores e sem lateral esquerdo (a base enchia o elenco e a reposição não tinha vaga) | Bug do motor: a IA libera os sobrantes mais fracos de posições com excesso para abrir a vaga (`makeRoom` em `offseason/index.ts`) |
| `world.test.ts` | Estádio da Série C tem menos de 10 mil lugares, por desenho | Mínimo de 5 mil na C e 10 mil na A e B |
| `saveSize.test.ts` | Com 60 clubes o JSON passou de 3 MB (4,4 MB) | O teste segue a decisão 4: 3 MB comprimidos (gzip) e teto de 6 MB de JSON; `tools/saveSize.ts` mostra a coluna comprimida |
| `fullSeason.test.ts` | Esperava 760 jogos (duas séries) | 1140 jogos das três séries |
| `season.test.ts` | Um dos 20 mundos teve campeão com 99 pontos (o teto individual era 97) | Teto individual 100; a média do campeão (79,3 pts) continua na meta de 70 a 82 |
| `longRun.test.ts` | Um clube da Série C vendeu R$ 67 mi em jogadores num ano com receita de R$ 6 mi e passou do teto de caixa (3,2 anos de receita contra 3,0) | A medida da C é separada (`maxBalanceInRevenueYearsC`, margem de 3 anos além do teto); A e B continuam com o limite de antes |

**Resultado:** `npm run test:all` passa (54 arquivos, 705 testes) e `tsc` sem erros.

**Atenção para a B3:** (1) clubes da Série C compram e vendem jogadores por valores muito acima da receita deles; é o mesmo ponto do "índice de receita por liga" da seção 5, que ainda não existe. (2) O mundo gerado com a mesma semente mudou com a Série C, então os campeões individuais de cada semente são outros; só a média por temporada é comparável com antes.


---

## 11. Resultado da parte B3 (resultado simplificado, foco do técnico e rodízio do mercado)

**Feito na B3**

1. **Partida simplificada** (`src/engine/match/quick.ts`, `simulateQuick`). Mesmo formato de `MatchResult` do motor completo, sem narração: placar, gols com assistência (passe ou cruzamento), gols contra, cartões (segundo amarelo vira vermelho), minutos dos titulares e dos 3 reservas que entram, nota, condição final e lesões (mesma gravidade do motor completo). A classificação, a artilharia, a forma, a moral, as suspensões e a evolução dos jogadores usam o resultado como usam o do motor completo (`applyMatchToPlayers` não mudou). O que o sorteio usa: escalação por linha (goleiro, defesa, meio, ataque) nas cotas da formação do time, força com a condição física, gols por Poisson com o número esperado vindo das quatro linhas dos dois times, do nível dos times e da vantagem de casa (que cresce com o nível), mais uma variação do dia por time. Custo: bem abaixo de 0,5 ms por partida (teste), contra ~4,6 ms do motor completo.
2. **Calibragem contra o motor completo** (`tools/quickMeasure.ts`, `tools/quickCompare.ts`, `npm run analyze:quick [-- --fit] [-- --tiers]`). As mesmas duplas de times, jogadas pelos dois motores (24 mil duplas em 16 mundos para o ajuste dos coeficientes de gols, por regressão de Poisson). `QUICK` em `config.ts` guarda os coeficientes; refazer o ajuste depois de mexer no motor completo ou na geração.
3. **Foco do técnico** (`src/engine/season/fidelity.ts`). `SeasonState.focus` é a pirâmide do técnico (campo opcional; `Competition.pyramid` e `CompetitionSetup.pyramid` dizem a que pirâmide cada divisão pertence). Sem foco, tudo é lance a lance (o jogo de hoje não muda: `matchGolden` e `fullSeason` seguem iguais). Com foco, as competições das outras pirâmides usam `simulateQuick`, sem escalação da IA (`aiTactic`) e sem lances. `refocus(state, teamId)` é o que será chamado quando o técnico for para um clube de outra liga: a liga nova vira lance a lance a partir daquele dia, a antiga (se não for da mesma pirâmide) vira simplificada, e as rodadas já jogadas ficam como estão. A virada de temporada leva o foco para a temporada nova (a virada por pirâmide é da B6).
4. **Pré-aquecimento** (`src/engine/season/warmup.ts`, `warmUp(state, data)`). Joga, pelo simplificado, as partidas marcadas antes da data de início (tabela e artilharia prontas), com recuperação física dos dias. Não roda mercado, treino nem fechamento financeiro dos meses anteriores ao início do jogo.
5. **Rodízio das negociações fora do foco** (`actsThisRound`, `MARKET.rotation.outOfFocusEvery = 6`). Nas rodadas de negociação e no pré-contrato da IA, só um em cada 6 clubes das ligas simplificadas age (a vez de cada clube anda uma casa por semana). Os clubes do foco agem sempre, então um mundo de uma pirâmide só não muda.
6. **Mundo de escala** (`src/diagnostics/scaleWorld.ts`): cada liga ganhou a pirâmide do país (Brasil A/B/C ligadas) e `tools/worldScale.ts --focus` joga só o Brasil lance a lance.

**Calibragem: o que ficou parecido** (`tests/balance/quick.test.ts`: 3 mundos × 4.500 duplas jogadas pelos dois motores, mais 6 temporadas inteiras da Série A de cada)

| | Completo | Simplificado |
|---|---|---|
| Gols por jogo | 2,31 a 2,45 | 2,33 a 2,40 |
| Mandante vence | 48% | 46 a 47% |
| Empates | 25 a 26% | 26 a 27% |
| Time mais forte vence (diferença > 5 pontos) | 58 a 60% | 58 a 62% |
| Gols dos atacantes | 61% | 59 a 62% |
| Gols com assistência | 53% | 54% |
| Amarelos por jogo | 4,2 | 4,2 |
| Lesões por jogo / dias por lesão | 0,31 a 0,33 / 12 | 0,31 a 0,33 / 12 |
| Condição perdida em 90 min (resistência baixa, média, alta) | 27 / 25 / 21 | 29 / 24 / 22 |

Temporada inteira da Série A (6 mundos): pontos do campeão 82,7 contra 81,7; empates 26% nos dois; colocação média dos 4 elencos mais fortes 5,0 nos dois; correlação força × posição 0,77 contra 0,70. Concentração de gols e assistências (9 mundos): artilheiro 29 contra 25 gols, 5º 17,7 contra 17,6, 10º 14,0 contra 14,7, 20º 10,8 contra 11,4; líder de assistências 14,2 contra 12,1; nota média da temporada 6,20 contra 6,26.

**Diferenças conhecidas (aceitas, com tolerância no teste)**
- **Série A, mandante:** o motor completo dá ~50% de vitórias em casa na A e o simplificado ~46% (empates ~3 pontos acima). Nas séries B e C bate dentro de 1 ponto. O termo de vantagem de casa por nível reduziu, mas não eliminou; sobra uma vantagem de casa na A que as quatro linhas não explicam.
- O elenco mais forte do simplificado termina um pouco mais em cima (2,7º contra 4,2º em média), mas os 4 mais fortes terminam no mesmo lugar médio que no completo. É variação do extremo numa amostra de 6 mundos.
- O artilheiro e o líder de assistências da liga são um pouco menos extremos no simplificado (a cauda), e do 5º para baixo a lista fica um pouco mais achatada.
- A nota do simplificado depende mais do resultado e dos gols e menos das ações do jogo; a média por posição bate dentro de 0,15.
- **Treino das ligas simplificadas** continua dia a dia, como no motor completo. Aplicar o ganho do ano de uma vez só ficou fora da B3.

**Custo, mundo de 282 clubes** (mesma máquina, `node --expose-gc tools/run.mjs worldScale --world full --live [--focus]`)

| | Tudo lance a lance | Foco no Brasil (A+B+C) |
|---|---|---|
| Temporada inteira | 41,6 s | **20,2 s** |
| Avanço típico (mediana) | 372 ms | **145 ms** |
| p95 | 1,4 s | **0,57 s** |
| Pior avanço (pré-temporada) | 8,2 s | **4,7 s** |
| Pico de memória viva | ~37 MB | 37 MB |

Rodízio do mercado, temporada inteira com foco no Brasil: sem rodízio 25,9 s; a cada 4 clubes 21,4 s; a cada 6 clubes ~20 s; a cada 8 clubes 15,8 s. Escolhi 6 (cada clube de fora ainda age várias vezes por janela). No iPhone 11 (estimativa de 1× a 1,5×, não medida) a temporada fica em ~20 a 30 s e o avanço típico em ~0,15 a 0,22 s. **Meta da seção 4.1 (mercado ≤ 2 s por temporada e primeiro avanço < 1 s): não atingida.** O primeiro avanço caiu de 8,2 para 4,7 s; o que resta é o mercado dos 60 clubes do foco ao longo de ~14 rodadas de pré-temporada e as 1.140 partidas do Brasil. Reduzir mais exige limitar candidatos por clube, o que muda as decisões da IA, e fica para a B6, junto com o teste das 15 ligas.

**Pendências registradas para a B5 e a B6**
1. **Economia da Série C (B5, junto com o índice de receita por liga).** Clubes da Série C compram e vendem jogadores por valores muito acima da receita deles (um clube vendeu R$ 67 mi num ano com receita de R$ 6 mi). Hoje isso só é coberto por uma margem de caixa própria da C no `longRun.test.ts` (`maxBalanceInRevenueYearsC`). A B5 precisa de: preço de mercado e orçamento de compras ligados à receita da liga (o `R` por liga), freio de compra e venda acima de uma proporção da receita, e a margem própria da C sair do teste.
2. **Campeões acima de uns 92 pontos (B6).** Em algumas sementes o campeão passa de 92 pontos (o teto individual do `season.test.ts` está em 100 só para não quebrar; a média do campeão segue em 79 a 82). Investigar se vem de elencos desequilibrados demais (reputação de topo muito acima do resto) e ajustar a geração ou a reputação, em vez de subir o teto do teste.
3. **Checagem de dinastias (B6).** No teste de longo prazo das 15 ligas, medir quantas temporadas seguidas o mesmo clube é campeão e quantos clubes diferentes ganham o título em 30 temporadas, em cada liga (o `longRun` de hoje só confere que os campeões variam). Rodar com o simplificado nas ligas fora do foco e com o completo, para saber se o simplificado deixa as ligas mais ou menos previsíveis (hoje o elenco mais forte termina um pouco mais em cima no simplificado).
4. **Outras pendências da B3 para a B6:** virada por pirâmide (hoje `advanceSeason` só conhece uma pirâmide e carrega o foco), tela de troca de clube (chamar `refocus`) e treino das ligas simplificadas de uma vez só, se ainda for preciso.

---

## 12. Resultado da parte B4 (save em partes comprimidas)

**Sobre a "versão 10":** o `SAVE_VERSION` já estava em 10 desde a B2 (datas de nascimento). A B4 não muda o formato de `Game` nem o envelope: muda **como o envelope é guardado no IndexedDB**. Por isso a versão do save continua 10, o arquivo de backup é o mesmo JSON de antes e o esquema do Dexie subiu para a versão 3 (tabelas novas `manifests` e `parts`; `games` ficou só para ler saves antigos).

**Feito na B4**

1. **Pedaços** (`src/store/saveParts.ts`). O jogo é dividido em: o resto do jogo (`core`), o calendário, os ids das partidas, o mercado, o treino e, para as listas grandes, um pedaço por liga (times, jogadores e base) e um por competição e grupo de 6 rodadas (partidas). Cada pedaço guarda as referências dos objetos que o formam; como o motor é imutável, o que não mudou entre dois saves tem as mesmas referências e **não é serializado, comprimido nem gravado de novo**. Juntar os pedaços devolve o jogo igual, na mesma ordem.
2. **Compressão** (`src/store/compress.ts`). Cada pedaço vai em gzip (`CompressionStream`, fora da thread da tela). Navegador sem a API grava o texto puro (o pedaço diz como foi gravado, então os dois jeitos abrem em qualquer aparelho).
3. **Gravação que não corrompe** (`src/store/saves.ts`, classe `SaveStore`). Todo o trabalho (dividir, serializar, comprimir) acontece **antes** de abrir a transação do IndexedDB. Dentro da transação: os pedaços novos entram com ids novos (nunca por cima de pedaço do save atual), depois o manifesto passa a apontar para eles, o resumo é atualizado e só então os pedaços velhos saem. É uma transação só: se o jogo fechar ou o celular apagar no meio, o navegador desfaz tudo e o save anterior continua inteiro. Se o espaço mudou por fora (outra aba), a gravação regrava tudo uma vez. Teste: `tests/saveParts.test.ts` falha a gravação no meio (`beforeCommit`) e confere que os pedaços, o resumo e o jogo ficam iguais, inclusive na primeira gravação de um espaço.
4. **Saves antigos.** Um espaço no formato antigo (um envelope por linha em `games`, de qualquer versão) abre pela mesma migração de sempre; a primeira gravação o troca pelos pedaços e apaga a linha antiga, na mesma transação. Pedaço que sumiu do disco vira `SaveError('invalid')`, não um jogo quebrado. Exportar e importar o save em arquivo não mudou (JSON com o envelope; `exportSlot` monta o jogo dos pedaços, `importSave` grava em pedaços).
5. **Medida do tempo de salvar.** `SaveStore.saveDetailed` devolve também `SaveStats` (tempo total e repartido em preparar, comprimir e escrever; pedaços e bytes gravados; tamanho do save inteiro). O salvamento automático guarda isso no status e **espera mais depois de uma gravação lenta** (3 vezes o tempo da última, no máximo 4 s), para um celular simples não ficar comprimindo a cada toque. A tela de diagnóstico (`?diagnostico=1`) agora grava o jogo de teste depois de cada avanço num banco temporário (`meu-manager-diagnostico`, apagado no fim, sem tocar nos saves do jogador) e acrescenta ao relatório o tamanho gravado no início e no fim (meta de 3 MB), a mediana, o p95 e o pior tempo de salvar (metas: 1 s e 4 s) e quanto cada save grava.

**Resultado, mundo de 282 clubes, temporada inteira lance a lance** (`node --expose-gc tools/run.mjs saveWorld --world full`, 68 avanços; este notebook, com `fake-indexeddb` em memória, então o tempo de escrita no disco de um celular fica de fora)

| | Antes (JSON, um objeto) | Em pedaços comprimidos |
|---|---|---|
| Tamanho no início da temporada | ~9,8 MB (JSON) | **1,04 MB** |
| Tamanho no fim da temporada | ~17,8 MB (JSON) | **1,96 MB** (meta: 3 MB) |
| Primeiro save (grava tudo) | n/d | 205 ms |
| Salvar a cada avanço: mediana / p95 / pior | n/d | **173 / 271 / 415 ms** |
| Pedaços gravados por avanço (mediana) | tudo | 65 de 142 (1,4 MB) |
| Onde vai o tempo (mediana) | n/d | preparar 74 ms, comprimir 87 ms, escrever 15 ms |

Brasil (60 clubes): início 218 KB, fim 429 KB, mediana 48 ms por save. Teste de balanceamento: `tests/balance/saveParts.test.ts` (temporada inteira do Brasil, 3 MB, tempo abaixo de 1 s, abre igual).

**O que não saiu como a proposta previa**
- **Gravar "só dezenas de KB" por avanço não vale.** O treino e a recuperação da condição mexem em todos os jogadores a cada dia (1.507 de 1.540 jogadores mudam num avanço de um dia), então o que a comparação por referência poupa são as ligas que não jogaram no dia, as partidas de rodadas futuras, o mercado e o calendário: ~45% dos pedaços e ~25% dos bytes. Pedaço por clube foi pior (676 pedaços, mediana 686 ms, quase tudo regravado, e o IndexedDB sofre com muitas linhas pequenas), e separar a condição do resto do jogador (dois pedaços por clube) também (1.241 pedaços, e o cadastro mudava quase igual). Ficou **um pedaço por liga**.
- **Os passos 2 a 4 da seção 4.6** (livro-caixa só da liga do técnico, jogadores das outras ligas em forma compacta, base das outras ligas só como contagem) **não foram necessários**: só a compressão já dá 1,96 MB no fim da temporada (meta 3 MB). Ficam como reserva se o histórico de várias temporadas das 15 ligas passar da folga de ~1 MB.
- **Não foi medido** o mundo de 282 clubes depois de várias temporadas (a base dos clubes cresce uns 15% nos primeiros anos e o arquivo de temporadas passadas cresce poucos KB por temporada; estimativa: ~2,3 MB), nem o tempo num celular de verdade (estimativa de 3 a 5 vezes este notebook para preparar e comprimir, ou seja, uns 0,5 a 1 s por save, em segundo plano e espaçado pela espera do salvamento automático). Rodar `?diagnostico=1` no aparelho dá o número real.

---

## 13. Resultado da parte B5 (economia por liga)

**Feito na B5**

1. **Índice de receita por liga** (`src/engine/economy.ts`, `LEAGUE` em `config.ts`). `Team.economy` (`{ revenue, level }`, ausente = Brasil) vem da competição (`Competition.economy`) e acompanha o clube no acesso e no rebaixamento. `revenue` multiplica a cota de TV, o patrocínio, o preço padrão do ingresso e o custo de operação, então a folha sustentável, o teto de caixa e os cortes da IA escalam sozinhos. Brasil A, B e C valem 1 (as razões entre divisões continuam as das tabelas de TV de hoje: 1, 0,15 e 0,06). Valores usados no mundo de 282 clubes (`FULL_WORLD`): Inglaterra 5, Espanha 3, Alemanha 2,8, Itália 2,5, França 1,8, Portugal 0,9, Argentina 0,6, Colômbia 0,45, Chile 0,4, Uruguai e Equador 0,3, Paraguai 0,25; `level` (pontos de força dos titulares em relação ao Brasil, já descontando que as ligas pobres têm reputação menor): +8, +7, +6, +6, +3,5, +2, −1, −2, −3, −4, −4 e −5, na mesma ordem.
2. **Salários e preços levam a liga do clube.** Salário = salário pela força × índice^0,75 × fator da divisão (`salaryTierScale`: a Série C paga 0,6). Preço de transferência = valor pela força × (receita da divisão)^0,75. `expectedSalary(jogador, clube)` e `marketValue(jogador, data, clube)` recebem o clube (sem ele valem o padrão do Brasil); contratos gerados, base, renovação, pré-contrato, anúncios, busca e telas do mercado passam o clube certo. Quem vende para uma liga mais rica pede mais (`LEAGUE.exportPremium`: +20% por dobro do índice do comprador sobre o do vendedor; é o "freio de exportação" simples da seção 4.5, sem contagem de titulares).
3. **Termo de liga no interesse do jogador** (`MARKET.player.leagueWeight/leagueStep/leagueOldShare`). Subir de nível de liga (liga + divisão, `clubLevel`) atrai e descer exige salário maior, com peso menor para quem tem 31 anos ou mais; jogador livre não tem termo. Sem ele, os clubes da Série C importavam os melhores das ligas pobres, que pagam menos por jogador mas têm nível acima do da Série C.
4. **Virada de temporada com várias ligas** (`advanceSeason`). Acesso e rebaixamento dentro de cada pirâmide (antes só havia uma), campeão por competição (`OffseasonReport.championsByCompetition`; `champions` continua sendo o da pirâmide do técnico), reputação que volta à média da divisão (`Competition.reputationMean`) e meta da diretoria por liga. Só a divisão mais baixa de cada pirâmide deixa de rebaixar (`createSeason`). Resolve a pendência "virada por pirâmide" da B3.
5. **Ferramenta de análise por liga** (`tools/leagueYears.ts`): força dos titulares, reputação, quantos dos 40 melhores jogadores do mundo jogam na liga, folha/receita, compras e vendas/receita (média e máximo), saldo/receita e jogadores trocados com outras ligas. `npm run analyze -- years --years 10 --seed 41` imprime o resumo por liga no mundo atual (60 clubes, três séries); `npm run analyze -- years --years 10 --seed 7 --clubs 282` faz o mesmo no mundo de 282 clubes (só o Brasil lance a lance, o resto simplificado); `node tools/run.mjs leagueRun [--clubs 60|282] [--league br-3]` imprime as tabelas ano a ano.

**Resultado, 10 temporadas, mundo de 282 clubes (semente 7; média dos 3 primeiros anos → os 3 últimos)**

| Liga | Força dos titulares | 40 melhores jogadores | Receita média | Folha / receita | Maior saldo / receita | Clubes no vermelho |
|---|---|---|---|---|---|---|
| Inglaterra | 75,4 → 77,2 | 15 → 24 | 383 M | 31% | 2,06 | 0 |
| Espanha | 73,1 → 74,0 | 9 → 8 | 223 M | 31% | 2,07 | 0 |
| Alemanha | 72,2 → 71,7 | 9 → 6 | 182 M | 32% | 2,08 | 0 |
| Itália | 71,7 → 71,7 | 4 → 1 | 172 M | 31% | 2,07 | 0 |
| França | 67,8 → 67,7 | 1 → 0 | 104 M | 35% | 2,01 | 0 |
| Brasil A | 65,6 → 64,9 | 1 → 0 | 66 M | 31% | 2,00 | 0 |
| Portugal | 65,7 → 64,4 | 1 → 0 | 43 M | 41% | 2,02 | 0 |
| Argentina | 62,3 → 62,4 | 0 → 0 | 29 M | 39% | 3,57 (*) | 0 |
| Colômbia | 59,8 → 60,2 | 0 → 0 | 18 M | 46% | 1,99 | 0 |
| Chile | 58,6 → 59,1 | 0 → 0 | 14 M | 50% | 2,00 | 0 |
| Uruguai | 57,7 → 57,5 | 0 → 0 | 11 M | 50% | 2,03 | 0 |
| Equador | 56,9 → 56,9 | 0 → 0 | 10 M | 51% | 2,01 | 0 |
| Paraguai | 56,7 → 57,4 | 0 → 0 | 8 M | 54% | 2,15 | 0 |
| Brasil B | 55,8 → 56,4 | 0 → 0 | 18 M | 62% | 1,93 | 0 |
| Brasil C | 44,4 → 46,9 | 0 → 0 | 6,6 M | 75% | 1,95 | 0 |

(*) Uma única venda de um fenômeno da base (R$ 85 mi, 8,5 vezes a receita do clube); o teto de caixa gasta o excesso nos meses seguintes.

Antes da B5, no mesmo mundo, todas as ligas de uma divisão só tinham a economia da Série A brasileira (receita de 35 a 50 M, folha em ~35%), o nível dos jogadores era o mesmo e a Série C pagava 115% da receita em salários. Agora:
- **Nenhum clube vai à falência** em nenhuma das 10 temporadas, e o dinheiro fica perto do teto (`FINANCE.ceilingYears` = 1,5 ano de receita) em todas as ligas.
- **A força média de cada liga é estável** (variação máxima de 2,5 pontos, na Série C; as outras ficam dentro de ±2). A distância entre as ligas é a pedida: Inglaterra ~12 pontos acima do Brasil A, Paraguai ~8 abaixo.
- **Os melhores jogadores tendem à liga mais rica sem esvaziar as outras:** a Inglaterra passa de 15 para 24 dos 40 melhores; Espanha, Alemanha e Itália mantêm a força dos titulares (a perda é só do topo). Entre as ligas pobres e a Inglaterra trocam-se poucos jogadores (1 a 8 por ano por liga). Sem o termo de liga e o prêmio de exportação a Inglaterra chegava a 31 dos 40 e a Série C subia 3,4 pontos importando jogadores sul-americanos.
- **Série C:** folha de 62% a 75% da receita (antes 110%), compras e vendas médias de 0 a 0,05 vez a receita; o maior valor de um ano ficou em 0,6 vez (antes 4,4). No mundo de 60 clubes (`npm run analyze -- years --years 10 --seed 41`): Série A 64,9 → 65,1, B 55,0 → 55,2, C 44,1 → 45,3, ninguém no vermelho, saldo máximo de 1,9 a 2,1 anos de receita nas três séries.

**Testes:** `tests/economy.test.ts` (índice nas receitas, nível, salários, preços, base e termo de liga), `tests/leagues.test.ts` (virada com duas pirâmides), `tests/balance/leagues.test.ts` (120 clubes, 8 temporadas: falência, teto, folha, Série C, estabilidade, ligas ricas) e `tests/balance/longRun.test.ts`, que agora cobra da Série C a mesma regra de caixa das outras (a margem própria `ceilingYears + 3` saiu). **Save:** `Team.economy` e `Competition.economy` são opcionais e o valor padrão é o Brasil, então os saves antigos abrem iguais e a versão do save continua 10.

**O que não entrou ou ficou diferente do plano**
- **Limite de estrangeiros (`foreignLimit`) não foi feito:** o mundo gerado ainda sorteia as nacionalidades do mesmo jeito em todos os países, então o limite não tem o que limitar. Entra com o pacote multi-liga e as nacionalidades por país (B6 ou depois).
- **O freio de exportação é um prêmio de preço, não uma contagem de titulares por janela:** a contagem não mordia (as trocas entre ligas já são poucas) e o prêmio é o que contém a Inglaterra.
- **Vendas altas de fenômenos da base ainda acontecem** (um menino de 18 anos com força 87 e potencial 100 saiu da Série C por R$ 45 mi, 7 vezes a receita do clube, e o teste aceita no máximo um ano assim na Série C). É um jogador raro, que vale isso em qualquer liga; o preço dele já está 8 vezes abaixo do valor pela força.
- **A Série A brasileira troca muito dinheiro** (compra e venda de ~1,9 vez a receita por clube por ano, no mundo de 60 clubes, e de 0,2 a 0,6 no mundo grande, onde há mais onde gastar). Isso já era assim antes da B5, o caixa não passa do teto e não foi mexido; vale olhar na B6 se o rodízio das ligas simplificadas mudar o volume.
- **Campeões acima de uns 92 pontos e a checagem de dinastias** continuam para a B6, como combinado, junto com a tela de troca de clube e o treino das ligas simplificadas de uma vez só.

---

## 14. Resultado da parte B6 (longo prazo das 15 ligas, campeões, dinheiro e troca de clube)

**Feito na B6**

1. **Medição de longo prazo por liga** (`tools/leagueYears.ts`, `node tools/run.mjs leagueRun --clubs 282 --years 30`). Além do que a B5 já media, cada liga ganhou: pontos do campeão (convertidos para 38 jogos, porque a Argentina joga turno único e Alemanha, França e Portugal têm 18 clubes), campeões diferentes, mais títulos de um clube e maior sequência por bloco de 10 temporadas, idade média, craques (força geral ≥ 85), saldo final contra o teto de caixa, receita real contra a esperada, negócios por clube por ano e valor do elenco contra a receita. `--ids br-1,en-1,...` monta um mundo menor, como nos testes. O teste `tests/long/world282.test.ts` (`npm run test:long`, ~17 minutos, fora do `test:all`) joga as 30 temporadas das 15 ligas e confere tudo abaixo.
2. **Gasto da IA com teto por janela** (`MARKET.ai.windowSpendShare` = 0,3 da receita anual esperada por janela). Antes cada clube podia gastar 40% do caixa por mês, e o caixa era reposto pelas vendas dos outros: a Série A comprava e vendia ~1,5 vez a receita por ano (o elenco vale 2,2 a 2,5 vezes a receita, então 60% dele trocava de dono todo ano). Agora ficam em ~0,3 a 0,4 vez (o máximo de um clube num ano é 0,7). O número de negócios por clube quase não muda (5 a 6 por ano na Série A, 3 na B): a IA passa a comprar mais barato, não menos. Força, idades e craques das séries ficaram como antes.
3. **Reputação dos clubes grandes** (`OFFSEASON.reputation.tierPullAbove` = 0,1). A reputação de quem fica na primeira divisão e está acima da média dela voltava para a média em 30% da distância por ano; um clube de reputação 17 perdia 1,5 ponto por ano mesmo cumprindo a meta. As ligas ficavam sem clubes grandes que se mantêm (7 a 8 campeões diferentes em 10 temporadas na Série A, quando a meta é 4 a 6). Agora o puxão para baixo é 0,1 para quem está na primeira divisão acima da média; nas séries de acesso (B, C) o puxão continua simétrico, porque a média delas andava 1,2 ponto.
4. **Ligas do mundo de teste com poucos grandes** (`LeagueSpec.repCurve` em `scaleWorld.ts`). A escada de reputação do mundo de 282 clubes era uma reta (cada clube 0,5 a 0,7 ponto acima do seguinte); nas ligas europeias e pequenas agora os primeiros ficam juntos no alto e o meio cai (expoente 1,3 a 1,7). Só muda o mundo de teste (a Argentina e o Brasil continuam retos).
5. **Teto de caixa gasta metade do excesso por mês** (`FINANCE.ceilingSpendPerMonth` de 0,3 para 0,5).
6. **Carreira do técnico** (`src/engine/career`, `CAREER` em `config.ts`, `Game.coach`, telas Carreira e Demissão). Ver abaixo.

**Dinheiro acima do teto: de onde vinha o 2,1 contra 1,5**

O número da B5 era o saldo final dividido pela receita *real* do ano (bilheteria, patrocínio e TV lançados no extrato). O teto da IA é 1,5 vez a receita *esperada* (19 jogos em casa com o público de um adversário médio). A receita real fica em 79% a 91% da esperada (Brasil A 89%, B 86%, C 84%, Argentina 80%, Inglaterra 90%), então um clube exatamente no teto já tem 1,5 / 0,89 = 1,7 ano de receita real. O resto era pico: a venda de um jogador caro entra de uma vez e o excesso só era gasto em 30% por mês. Medido contra o próprio teto (agora no relatório: `saldo/teto`): média dos clubes de 0,9 a 1,06 e máximo de 1,06 a 1,35 (era 1,3 a 2,4 antes). Não é vazamento: o caixa não cresce sem limite, nenhum clube ficou no vermelho em 30 temporadas, e o teste longo exige que o maior saldo fique abaixo de 1,5 vez o teto.

**Série A trocando ~2 vezes a receita por ano**

Não era realista: o elenco da Série A vale 2,2 a 2,5 vezes a receita (razoável), mas a IA comprava os melhores jogadores (ganho mínimo de 4 pontos) com 40% do caixa por mês e vendia a outros clubes que faziam o mesmo, então o dinheiro girava. Com o teto por janela, Série A compra 0,3 a 0,4 vez a receita por ano (venda 0,3 a 0,4, máximo de 0,7 e 1,2), Série B 0,2 a 0,3, Série C 0,02. Inglaterra, Espanha e Alemanha ficam em 0,5 a 0,6 no mundo grande (clubes com mais caixa por jogador). O teste `tests/balance/leagues.test.ts` confere que nenhum clube gasta mais de duas janelas de teto por ano (`maxPurchaseShare`) e `tests/market.test.ts`, que nenhum clube passa do teto da janela.

**Resultado, 30 temporadas, mundo de 282 clubes (semente 7; médias das temporadas 1–3, 14–16 e 28–30)**

| Liga | Força dos titulares | 40 melhores | Craques (≥ 85) | Idade média | Folha / receita | Campeão (pts em 38 jogos) | Campeões por 10 temporadas |
|---|---|---|---|---|---|---|---|
| Inglaterra | 74,3 → 77,6 → 75,8 | 11 → 23 → 19 | 6 → 42 → 28 | 25,9 → 25,6 → 25,3 | 33 → 37 → 33% | 75,4 | 4 / 6 / 7 |
| Espanha | 72,3 → 73,6 → 72,4 | 7 → 8 → 5 | 4 → 15 → 7 | 26,0 → 25,1 → 24,7 | 35 → 34 → 32% | 73,0 | 5 / 7 / 7 |
| Itália | 71,1 → 71,5 → 71,3 | 8 → 4 → 3 | 7 → 5 → 4 | 25,7 → 25,0 → 25,3 | 37 → 36 → 35% | 74,5 | 3 / 9 / 7 |
| Alemanha | 71,4 → 72,5 → 71,3 | 8 → 2 → 3 | 6 → 5 → 6 | 25,8 → 25,2 → 24,9 | 39 → 38 → 36% | 74,6 | 4 / 7 / 6 |
| França | 66,7 → 68,2 → 68,1 | 1 → 2 → 2 | 1 → 5 → 3 | 25,9 → 25,1 → 24,7 | 38 → 41 → 40% | 74,2 | 7 / 5 / 6 |
| Brasil A | 65,7 → 66,4 → 67,2 | 4 → 0 → 4 | 2 → 1 → 4 | 25,9 → 25,4 → 25,4 | 32 → 34 → 37% | 80,0 | 4 / 8 / 3 |
| Portugal | 64,6 → 65,4 → 65,8 | 0 → 0 → 1 | 0 → 0 → 1 | 25,7 → 25,1 → 24,8 | 50 → 51 → 52% | 72,8 | 6 / 6 / 8 |
| Argentina | 62,3 → 63,1 → 63,2 | 0 → 1 → 1 | 0 → 1 → 1 | 25,6 → 24,9 → 24,9 | 38 → 40 → 40% | 75,3 | 8 / 10 / 5 |
| Colômbia | 59,5 → 60,7 → 61,4 | 0 → 1 → 1 | 0 → 1 → 2 | 25,8 → 25,0 → 25,0 | 47 → 53 → 51% | 71,6 | 7 / 5 / 6 |
| Chile | 58,3 → 59,7 → 59,5 | 0 → 0 → 0 | 0 → 0 → 0 | 25,6 → 24,9 → 24,9 | 50 → 57 → 55% | 71,0 | 7 / 8 / 6 |
| Uruguai | 57,4 → 58,5 → 58,1 | 0 → 0 → 0 | 0 → 0 → 0 | 25,6 → 24,8 → 24,8 | 51 → 55 → 56% | 72,0 | 7 / 7 / 6 |
| Equador | 56,6 → 58,7 → 59,7 | 0 → 0 → 0 | 0 → 0 → 0 | 25,6 → 25,1 → 24,9 | 51 → 59 → 62% | 72,5 | 5 / 7 / 9 |
| Paraguai | 56,2 → 58,1 → 57,6 | 0 → 0 → 0 | 0 → 0 → 0 | 25,6 → 24,6 → 25,0 | 52 → 63 → 61% | 73,4 | 4 / 8 / 6 |
| Brasil B | 55,4 → 57,4 → 56,9 | 0 → 0 → 0 | 0 → 0 → 0 | 25,7 → 25,0 → 25,2 | 64 → 65 → 59% | 81,7 | 8 / 10 / 10 |
| Brasil C | 44,7 → 48,7 → 48,2 | 0 → 0 → 0 | 0 → 0 → 0 | 25,9 → 24,9 → 24,8 | 64 → 82 → 79% | 78,5 | 8 / 9 / 7 |

- **Finanças:** nenhum clube no vermelho em nenhuma das 30 temporadas; saldo médio entre 0,9 e 1,06 do teto e máximo de 1,35 (Chile).
- **Força:** a variação de cada liga entre o começo e o fim fica dentro de ±3,5 (Brasil C +3,5 e Equador +3,1 são as maiores; a C sobe na primeira década e fica em 48 na seguinte). A última década é parecida com a anterior em todas (menos de 2,5 pontos).
- **Idade:** 24,6 a 26,0 em todas as ligas e décadas. **Craques:** a Inglaterra tem de 6 a 42 jogadores de força ≥ 85 (o nível dela é +8 sobre o Brasil); no mundo todo são ~27 nos três primeiros anos, ~75 no meio e ~57 nos três últimos: sobe enquanto os melhores se concentram na liga rica e depois recua.
- **Concentração dos melhores jogadores:** a Inglaterra passa de 11 dos 40 melhores (28%) para 23 (57%) na primeira década e **recua para 19 (47%)** na última; a fatia parou de crescer. Espanha, Alemanha e Itália mantêm a força dos titulares e algum craque.
- **Campeões:** média de pontos do campeão (em 38 jogos) entre 71,0 e 81,7 em todas as ligas; campeões acima de 92 pontos foram 2 em 450 temporadas (uma na Argentina e uma na França), nenhum no Brasil A. Nas divisões de acesso (Brasil B e C) o campeão sobe e sai da divisão, então quase todo ano é um clube novo (7 a 10 por bloco), como esperado.
- **Dinastias:** nas 13 primeiras divisões, 6,3 campeões diferentes por 10 temporadas em média (3 a 10 em cada bloco) e 3 dos 39 blocos com um clube de mais de 5 títulos (Brasil A com 6 e 7 títulos e 5 seguidos; Inglaterra com 7). Nas outras sementes do mundo de 60 clubes (`npm run analyze -- years --years 30 --seed 41|43`, Série A): 4, 5, 4 e 5, 6, 6 campeões, no máximo 5 títulos.

**O que a calibragem corrigiu em campeões (e o que ficou)**

- Antes das mudanças 3 e 4 a Série A do mundo de 60 clubes tinha 7,2 campeões por bloco de 10 temporadas em média (duas sementes, 30 anos) e as ligas europeias do mundo grande de 6 a 8; agora a Série A está em 5,0 (4 a 6) e a Europa em 5,7 a 6,3. **Completo contra simplificado:** o Brasil A (lance a lance) fica em 5,0 campeões por bloco e as ligas jogadas pelo simplificado em 6,3 na média, então o simplificado **não** deixou as ligas mais previsíveis; a comparação não é limpa (a estrutura das ligas é outra: turno único, 16 a 18 clubes, escada de reputação própria) e a diferença vem mais dela que do motor. Os pontos do campeão são parecidos (80,0 no Brasil A, 71,0 a 75,4 nas outras).
- **Campeão acima de 92 pontos:** é a cauda da variação normal, não um defeito de geração: a média do campeão da Série A é 79 a 81 com desvio de ~6 pontos, então ~2% das temporadas passam de 92 (1 a 2 em 30 na Série A do mundo de 60 clubes, 2 em 450 no mundo grande). Não precisou de ajuste de geração ou de reputação; o teste longo exige no máximo 3 em 30 por liga. O teto individual do `season.test.ts` continua em 100.
- Em semente isolada o Brasil A ainda pode ter dinastia de 6 a 7 títulos num bloco (a semente 7 teve duas); é o preço de segurar os grandes. O teste longo cobra a taxa (menos de 20% dos blocos) e a média, não a semente.

**Carreira do técnico: propostas, demissão e troca de clube**

- **Reputação do técnico** (`Game.coach`, `{ reputation, arrivedOn? }`, escala 1 a 20 dos clubes; saves antigos não têm o campo e valem o prestígio do clube). O prestígio de um clube é a reputação dele mais o nível da liga × 0,25 (`CAREER.levelWeight`), para comparar um clube inglês com um paraguaio. O técnico começa com o prestígio do clube. No fim de cada temporada a reputação muda até ±1,5 conforme a posição final contra a meta da diretoria, mais 1 ponto pelo título; ser demitido custa 1,5 ponto.
- **Propostas a quem está empregado** (`jobOpenings`, `CAREER.offer`): clubes **com vaga** de prestígio até 1,5 ponto acima da reputação que os outros enxergam (a reputação guardada mais ou menos 1 ponto conforme a confiança da diretoria hoje) e não abaixo do clube atual menos 0,5; no máximo 3, as maiores primeiro. A vaga de um clube num mês sai de um sorteio com a semente do mercado, o mês e o clube (não é guardada: a mesma consulta dá sempre a mesma lista, que muda a cada mês); a chance é 4% e sobe para 16% se o clube está abaixo da meta e 39% se está perto da demissão. O painel mostra o aviso "N clubes querem você", que abre a nova tela **Carreira** (reputação e lista; "Assumir" pede confirmação).
- **Procura de emprego depois da demissão** (`CAREER.search`): a tela de demissão lista as vagas abertas que a reputação alcança (prestígio até 0,5 acima dela, sem piso); se houver menos de 5, completa com clubes ao alcance na ordem do sorteio do mês; com reputação baixíssima, os 5 clubes mais modestos do mundo sempre aceitam. "Começar um novo jogo" virou botão secundário.
- **Assumir o clube** (`takeUserJob`, `moveCoach`): só clubes da lista e nunca com partida por jogar; o time do jogador passa a ser o novo, o plano de treino vai junto, as propostas pendentes dos dois clubes e os anúncios do técnico saem do mercado, as escalações guardadas são esquecidas e `refocus` põe a liga nova lance a lance e a antiga (se for de outra pirâmide) no simplificado. A diretoria nova só julga a campanha depois da chegada (`sinceArrival`: jogos e pontos desde `arrivedOn`).
- **Testes:** `tests/career.test.ts` (reputação, vagas determinísticas e dentro do alcance, vagas sempre existem, troca de clube, diretoria nova não herda a campanha, telas e a troca para a Inglaterra com `refocus`).

**Testes:** `npm test` 685 testes passando; `npm run test:balance` passando (`leagues.test.ts` ganhou o teto de compras; `longRun.test.ts` não mudou); `npm run test:long` passando (17 minutos). **Save:** `Game.coach` é opcional; a versão do save continua 10 e o campo vai no pedaço `core` sem mexer em `saveParts.ts`.

**O que ficou para depois**
- **Limite de estrangeiros (`foreignLimit`):** continua dependendo de nacionalidades por país (pacote multi-liga).
- **Pacote do usuário com várias ligas** (tirar o `unsupported-leagues` do importador): não foi pedido nesta parte e fica para a B7. A carreira já funciona num mundo com várias ligas (testada no mundo de escala), mas o jogo de hoje só cria mundos de uma pirâmide.
- **Treino das ligas simplificadas de uma vez só** e **meta de tempo do mercado do mundo grande** (primeiro avanço < 1 s): sem mudança; o teste longo mostra que o mercado das 15 ligas custa ~17 minutos em 30 temporadas (~34 s por temporada).
- **Equador (+3,1) e Brasil C (+3,5)** sobem mais que as outras ligas em 30 anos, dentro do limite do teste (3,5 e 4,5). O puxão assimétrico da reputação (item 3) empurra um pouco a média das ligas pequenas para cima; se for preciso, o próximo passo é puxar mais forte quem está abaixo da média.

---

## 15. Resultado da parte B7 (pacote de dados com várias ligas)

O formato completo, campo a campo e com exemplos, está em **`docs/formato-pacote.md`** (é o arquivo para montar o pacote real).

**Feito na B7**

1. **O importador aceita vários países e ligas** (`src/data/package/validate.ts`, `load.ts`, `leagueDefaults.ts`). O formato continua na versão 1 (só ganhou campos opcionais). Cada país tem de 1 a 3 divisões em sequência; um país com uma divisão só é uma liga fechada (`promotion` e `relegation` 0). Cada divisão tem de 4 a 40 times (número par); `promotion` de uma divisão tem de ser igual ao `relegation` da de cima, e a primeira não sobe nem a última cai. Campos novos de liga, todos opcionais: `economy` (`revenue` e `level`, com os padrões calibrados na B5/B6 para os 14 países), `rounds` (turno único), `region` (janelas de transferência; padrão do país) e `foreignLimit`. O `id` de país precisa ser uma das 14 nacionalidades do jogo (entraram Inglaterra, Espanha, Itália, Alemanha, França e Portugal, com rótulo e bandeira). O pacote fictício padrão (Brasil, 20 times, 4 sobem e 4 caem) segue sem ligas explícitas, e o mundo gerado é byte a byte o mesmo de antes (`isClassicPackage`).
2. **Mundo com várias pirâmides.** Cada país vira uma pirâmide (`Competition.pyramid`), com `economy`, `country`, `foreignLimit` e quantos sobem e caem vindos do pacote. O jogador sem atributos, a base e as finanças derivadas já usam a economia da liga (nível dos titulares, salário, caixa e preço do ingresso). Com mais de um país, o jogo começa com o foco (lance a lance) na pirâmide do clube escolhido e o resto no simplificado; `createGame` aceita o mundo já montado (`options.world`) para não montar duas vezes.
3. **Limite de estrangeiros** (`Team.country`, `Team.foreignLimit`, `src/engine/foreign.ts`). Estrangeiro é quem tem nacionalidade diferente da do país da liga. `squad` (máximo no elenco): barra compra, empréstimo, jogador livre e pré-contrato com o motivo "Limite de estrangeiros da liga", e a IA nem escolhe esses alvos (compra, proposta ao jogador e pré-contrato). `lineup` (máximo entre os 11 titulares): vale na escalação da IA (`aiTactic`, virada, venda), na escalação simplificada das ligas fora do foco, na sugestão automática do jogador, no conserto da tática antes do jogo (`repairTactic`) e como bloqueio quando o técnico tenta escalar mais (`setUserTactic` recusa com mensagem; telas Tática e Escalação mostram "Estrangeiros entre os titulares: N de no máximo M"). Quem já passa do limite ao começar fica (só se barra a entrada de mais um). Não são limitados: as substituições durante a partida, a promoção de jovens da base e quem o técnico já tem ao trocar de clube. País e limite acompanham o clube no acesso e rebaixamento, como a economia. A base dos clubes de fora do Brasil agora nasce com a nacionalidade do país (antes todo jovem era brasileiro, o que estourava o limite em poucas temporadas).
4. **Novo jogo: país, liga e clube** (`NewGame.tsx`, `worldChoices.ts`). Com mais de um país aparece primeiro o seletor de país (rolagem horizontal), depois as divisões do país e os clubes da divisão por força; com um país só nada muda. As telas passaram a mostrar o **nome da liga** em vez de "Série A/B/C" (tabela, rodadas, artilharia, histórico, painel, página do time, lista de saves), e o arquivo de temporadas passadas guarda a ordem das ligas quando há mais de um país.
5. **Pacote de exemplo com as 15 ligas** (`src/diagnostics/scalePackage.ts`, `node tools/run.mjs exportScalePackage`): `dados-reais/mundo-ficticio-15-ligas.json`, 1,14 MB, 13 países, 15 ligas, 282 clubes e 7.414 jogadores, **sem atributos, contratos nem base** (só o que um pacote real traria), com turno único na Argentina e limites de estrangeiros em Argentina (6 no elenco), Itália (8 titulares), Inglaterra (17 no elenco) e Espanha (9 titulares). Tudo inventado; a pasta `dados-reais/` não entra no repositório. `node tools/run.mjs packageYears` joga temporadas com ele.
6. **Medida de importação** (`measureImport` em `src/diagnostics/measure.ts`, seção "Importar um pacote de dados" em `?diagnostico=1`, `node tools/run.mjs measureImport [arquivo]`): mede ler o arquivo, `JSON.parse`, validar, a cópia para o IndexedDB, montar o mundo, criar o jogo, o primeiro avanço e o primeiro save, com o pacote gerado na tela ou com um arquivo do aparelho, e diz se as metas foram atingidas (importar até 5 s, começar o jogo até 3 s, primeiro avanço até 20 s).

**Tempo neste computador** (pacote de 15 ligas, 1,14 MB; o do celular está por medir em `?diagnostico=1`)

| Etapa | Tempo |
|---|---|
| Ler o arquivo | 7 ms |
| `JSON.parse` + validar | 6 + 33 ms |
| Cópia para o IndexedDB | 18 ms |
| Montar o mundo (atributos de 7.414 jogadores, táticas, finanças, base) | 0,5 s |
| **Importar (tudo isso)** | **0,6 s** (meta 5 s) |
| Criar o jogo e o calendário das 15 ligas (4.808 partidas) | 90 ms (meta 3 s) |
| Primeiro avanço (a pré-temporada com o mercado de todos os clubes) | 5,3 s (meta 20 s; é o mesmo custo da B3) |

Num aparelho 3 a 6 vezes mais lento, importar fica em 2 a 4 s e começar o jogo em menos de 1 s; o primeiro avanço é o que pesa (16 a 32 s estimados, acima da meta de 20 s no pior caso): reduzir exige limitar candidatos por clube no mercado, que muda as decisões da IA, e continua pendente.

**Jogo com o pacote de exemplo** (`tests/balance/packageLeagues.test.ts`, 3 temporadas com mercado e virada): nenhum clube acima do limite de estrangeiros do elenco em nenhum ano (a primeira versão estourava em 15 clubes na terceira temporada, por causa da base brasileira em todos os países, corrigida), nenhum clube no vermelho.

**Testes:** `tests/multiPackage.test.ts` (validação de países e ligas, economia padrão e a do pacote, jogo com foco por país, escolha do país, limite de estrangeiros no mercado, na escalação da IA, do técnico e do simplificado, medida de importação) e `tests/balance/packageLeagues.test.ts`. `npm test` 704 testes passando, `npm run test:balance` 96. **Save:** `Team.country`, `Team.foreignLimit`, `Competition.country/foreignLimit` e `SaveSummary.league` são opcionais; a versão do save continua 10 e saves antigos abrem iguais.

**O que ficou para depois**
- **Primeiro avanço do mundo grande** (pré-temporada com o mercado de 282 clubes, ~5 s aqui): meta de tempo do mercado ainda não atingida.
- **Limite de estrangeiros na promoção da base e nas substituições ao vivo:** não é barrado; o técnico que promove um jovem estrangeiro pode passar do limite do elenco (só a escalação continua obrigada a cumprir `lineup`).
- **Editor de dados e pacote real** (Fases 4 e 5 do plano): o formato está documentado para montar o pacote real, que fica fora do repositório.
- **Nomes dos jogadores do pacote de exemplo** vêm de bancos de nomes brasileiros e espanhóis, qualquer que seja a nacionalidade; vale só como teste de importação.

---

## 16. Acabamentos da Fase 2 (antes das copas)

1. **Avanço pesado num Web Worker** (`src/store/heavyOps.ts`, `heavy.worker.ts`, `heavy.ts`, `BusyOverlay`). A pré-temporada (o avanço que roda as negociações de todos os clubes), a virada de temporada e qualquer avanço em mundos de 100 clubes ou mais calculam num Web Worker; a tela mostra "Preparando a temporada…" (ou "Preparando a próxima temporada…" / "Simulando os jogos…") e segura os toques até acabar. O worker roda **a mesma função pura** (`advanceGame` / `startNextSeason`) sobre uma cópia do jogo, então as decisões da IA e os resultados são idênticos: o teste compara o JSON do jogo calculado pelo worker (com a cópia estruturada nos dois sentidos, como o navegador faz) com o calculado na hora, em 4 avanços seguidos e na virada. Sem Worker (testes, navegadores antigos), ou se o worker falhar, o cálculo roda na thread principal com o mesmo resultado, e o worker deixa de ser usado. Se o jogador sai do jogo enquanto o worker calcula, o resultado é descartado. O worker entra no build e na lista do service worker (funciona offline).
   - **Custo da cópia** (`node tools/run.mjs cloneCost`, este computador): mundo padrão de 60 clubes 30 ms para ir e 34 ms para voltar, para um primeiro avanço de 229 ms; 15 ligas 140 ms e 136 ms para um primeiro avanço de 617 ms. A cópia ainda acontece na thread principal (o navegador serializa e desserializa lá), então ela fica travada ~0,3 s no mundo grande em vez da conta toda; o resto roda no worker e a tela de progresso continua girando. Uma cópia nova de todos os objetos também faz o próximo save regravar todos os pedaços uma vez.
   - **Verificado num Chrome de verdade** (modo desenvolvimento, Chrome sem janela): ao tocar em Avançar a tela de progresso aparece, um worker é criado, o jogo avança (novos avisos do mercado) e não há erro no console. Em celular não foi medido.
   - O avanço de um dia de jogos no mundo pequeno (uns 100 ms) segue na thread principal, sem tela de progresso.
2. **Limite de estrangeiros também na base e nas substituições.** Promover um jovem estrangeiro com o elenco no limite `squad` lança `AcademyError('foreign-limit')` com a mensagem "Limite de estrangeiros da liga: o elenco já tem N (máximo M) e fulano é estrangeiro…" (aparece na aba Base); a IA não promove esse jovem e, aos 20 anos, o dispensa. Durante a partida, o limite `lineup` vale para os estrangeiros **em campo**: a troca do técnico (`substitute` e `resolveInjury`) que passaria do limite é recusada com "Limite de estrangeiros da liga: no máximo N em campo ao mesmo tempo. Escolha um jogador da casa para entrar." (a tela de Trocas mostra a mensagem), e as trocas da IA (cansaço e lesão) só escolhem reservas que cabem; trocar estrangeiro por estrangeiro vale; a exceção é o goleiro reserva que entra no lugar do goleiro expulso. Sem limite, o motor de partida dá exatamente os mesmos resultados (`matchGolden`). Testes: `tests/foreignSubs.test.ts`.
3. **Nacionalidades de todos os países** (`NATIONALITIES` com 209 países: seleções da FIFA mais Escócia, País de Gales e Irlanda do Norte; `src/ui/countries.ts`, gerado de `tools/countries.txt` por `tools/genCountries.cjs`). Cada país tem o nome em português e uma bandeira simplificada desenhada pelo jogo (faixas, disco, estrela, cruz, triângulo, canto; `src/ui/theme/flags.tsx`): são aproximações, não as bandeiras oficiais, e as 14 que já existiam continuam com o desenho de antes. O `id` de país de liga segue precisando estar em `countries` do pacote e ter liga; a nacionalidade de um jogador pode ser **qualquer** país da lista, esteja ou não em `countries`. Um país de liga sem padrão de economia (os 14 calibrados são os únicos) usa a economia do Brasil e as janelas da Europa e a validação avisa; o pacote pode dar `economy` e `region`. O filtro de nacionalidade do mercado ficou em ordem alfabética em português. `docs/formato-pacote.md` ganhou a lista dos 209 países e as regras novas.

**Testes:** `tests/heavy.test.ts`, `tests/foreignSubs.test.ts`, `tests/countries.test.ts`. Save: sem mudança de formato (a versão continua 10).

---

## 17. Fase 3, parte 3A: motor de copas e a Copa do Brasil

O plano das partes 3A a 3D e da fase futura de seleções está em `docs/plano-mundo-real.md`. O formato das copas no pacote, campo a
campo, está em `docs/formato-pacote.md` (seção "Copas").

**Feito na 3A**

1. **Copas definidas no pacote** (`cups`, `PackageCup`; `src/data/package/cups.ts`, `validateCups.ts`). Nome, país ou região, formato (`knockout`, `groups-knockout`, `league-knockout`), vagas (`entrants`: por posição na liga da temporada passada, todos os clubes de uma liga, campeão ou vice de outra copa, com vaga reserva), fases com jogo único ou ida e volta e data de referência, sorteio com ou sem cabeças de chave, mandante do jogo único, regra do gol fora (desligada por padrão), prorrogação e pênaltis, cartões e suspensões, premiação por fase. A validação confere referências, datas, o tamanho dos grupos e dos potes e a conta dos clubes até uma final de dois (`cup-bracket`, `cup-groups`). O mundo fictício exporta e importa as suas copas (ida e volta idêntica ao mundo gerado).
2. **Motor** (`src/engine/cups`). `createCups` resolve as vagas e sorteia a primeira fase; `progressCups` roda depois de cada dia de jogos e de cada partida do jogador, sorteia a fase seguinte, premia e fecha a copa. Nada do chaveamento é guardado: as partidas (`Match.cup`: fase, confronto, perna, grupo, campo neutro) e o registro das fases sorteadas (`Cup.log`: quem jogou e quem folgou) bastam, e confrontos, grupos e vencedores saem delas (`tie.ts`). Mata-mata com folgas para os cabeças de chave quando o número de clubes não é potência de dois (60 clubes → 4 folgam, 28 confrontos); grupos com potes; fase de liga com potes (cada clube enfrenta o mesmo número de rivais de cada pote, metade em casa; as partidas são repartidas em datas sem repetir clube).
3. **Prorrogação e pênaltis no motor da partida** (`match/knockout.ts`, `MatchInput.knockout`). Se o confronto está empatado depois dos 90 minutos (na volta, a soma com a ida e, se ligada, a regra do gol fora), a partida continua por 30 minutos no mesmo motor (32 momentos, minutos 91 a 120): os jogadores cansam mais e a condição final e os minutos refletem os 120. Se continua empatado, os pênaltis: 5 cobranças para cada lado e morte súbita, a chance de converter vem da finalização e da frieza do cobrador (média de determinação e decisão) contra os reflexos, o posicionamento e a decisão do goleiro (`MATCH.shootout`), na ordem dos cobradores do técnico. O motor simplificado (ligas e copas fora do foco) faz o mesmo. O resultado traz `extraTime`, `penalties` e as cobranças (`shootout`); sem regras de mata-mata nada muda (`matchGolden` passa).
4. **Calendário sem conflito com a liga** (`pickCupDay`). Cada fase vai para a primeira quarta-feira a partir da data de referência em que nenhum dos clubes joga, nem na véspera nem no dia seguinte, liga ou outra copa; a fase seguinte só é marcada quando a anterior termina (mínimo de 4 dias de descanso). A janela de transferências, o treino e o resumo da temporada continuam contando só os jogos de liga.
5. **Cartões e suspensões próprios da copa.** `PlayerCondition.cups[copa]` guarda os amarelos e a suspensão de cada copa; os da liga ficam à parte (`applyMatchToPlayers` com o escopo da copa e `cupView` para escalar). Os gols e cartões de copa somam nos totais do jogador mas saem da artilharia da liga (`cupGoals`, `cupAssists`...). Os amarelos zeram depois da fase marcada.
6. **Dinheiro:** bilheteria dos jogos em casa (menos em campo neutro) e premiação ("Premiação das copas" no extrato e no balanço), vezes o índice de receita da liga.
7. **Copa do Brasil e Supercopa do Brasil no mundo padrão** (com nomes genéricos "Copa Nacional" e "Supercopa Nacional": os nomes oficiais são marcas e o nome vem do pacote; trocar é editar o nome no `DEFAULT_CUPS`). A copa tem os 60 clubes das três séries em seis fases (primeira e segunda fases em jogo único com o mandante de menor reputação, oitavas, quartas, semifinais e final em ida e volta; datas de referência de 4/2 a 14/10), com cabeças de chave. A Supercopa, em campo neutro no começo de fevereiro, junta o campeão da liga e o da copa da temporada passada (na primeira, os mais fortes), com o vice da liga no lugar se for o mesmo clube. Saves antigos seguem sem copas; `createGame(seed, time, { cups: false })` joga só as ligas.
8. **Telas.** Seção **Copas** na Tabela (escolha da copa, Chaveamento por fase com o placar de cada confronto, a aba Jogos e a Artilharia da copa; grupos e fase de liga viram tabelas); cartão **Copas** no painel com a situação do time e o próximo jogo de copa; o próximo e o último jogo mostram a copa e a fase; a **tela da partida** mostra a copa, a fase e o placar da ida, pausa antes da prorrogação ("Começar a prorrogação"), vai até 120 minutos e narra a prorrogação e os pênaltis; o resumo do jogo mostra pênaltis; o **Histórico** lista os campeões das copas; o extrato tem a categoria nova.

**Equilíbrio e custo** (mundo padrão, 60 clubes)

| Medida | Resultado |
|---|---|
| Jogos de copa por temporada | 75 de 1.215 (6%): 28 + 16 + 16 + 8 + 4 + 2 da copa e 1 da supercopa |
| Tempo da temporada (mercado ligado) | 7,7 s sem copas, 8,1 s com copas (+0,3 a 0,4 s, ~4%); 10 temporadas do `analyze -- years`: 174 s contra 178 s |
| Prorrogação / pênaltis | 20% / 8% dos jogos de copa (os testes de balanceamento exigem de 10 a 32% e de 3 a 16% dos jogos que decidem um confronto) |
| Cansaço | quem joga 120 minutos termina com mais de 4 pontos de condição a menos que no mesmo jogo sem prorrogação (testes); na liga até 4 dias depois de um jogo de copa a IA troca em média 2,7 titulares por cansaço contra 1,6 nos outros jogos (`node tools/run.mjs cupFatigue`) |
| Carga de quem vai longe | o campeão joga 9 ou 10 jogos de copa (9 com folga na primeira fase); quem cai na primeira fase joga 1 |
| Saúde das ligas (`npm run analyze -- years --years 10 --seed 41`) | Série A 64,9 → 65,8, B 54,6 → 55,1, C 44,1 → 44,8 (sem copas: 65,0 → 65,5, 54,9 → 55,4, 43,9 → 44,7); ninguém no vermelho; folha/receita e saldo/receita iguais; compra e venda da Série A 0,39 e 0,41 da receita (0,27 sem copas) |
| Dinheiro das copas | em média menos de 6% da receita do clube; o campeão, menos de 1,2 vez a receita de bilheteria, patrocínio e TV |

O cansaço aparece, mas pouco para a IA, porque as fases de copa ficam longe umas das outras e a maioria dos clubes cai cedo; quem vai longe
joga ~10 jogos extras e precisa rodar o elenco (a escalação automática do jogador também descansa quem jogou 120 minutos).

**Testes:** `tests/knockout.test.ts` (prorrogação, pênaltis, gol fora, determinismo, neutro, simplificado), `tests/cups.test.ts` (forma do mata-mata, sorteios, a temporada inteira da copa do mundo padrão, calendário sem conflito, premiação, disciplina, grupos, fase de liga, pacote), `tests/cupScreens.test.ts`, `tests/balance/cups.test.ts` (6 temporadas). Os testes antigos que supõem só ligas usam `{ cups: false }`.

**O que ficou para a 3B e depois:** copas dos outros países (3B), continentais (3C: a fase de liga já existe no motor e é testada com a liga brasileira), o mundo ampliado (3D). O jogador não escolhe os cobradores da disputa de pênaltis durante o jogo: vale a lista de cobradores de pênalti da tática, e depois os melhores cobradores em campo.

## 18. Fase 3, parte 3B: copas e supercopas nacionais de sete países

**Saves antigos.** Um save de antes das copas (sem `cupSpecs`) ganha as copas padrão do país (ou dos países) na próxima virada de temporada: `advanceSeason` recebe `defaultCupSpecs` (`defaultCupSpecsForCompetitions`, a partir das competições do mundo) e só usa quando `state.cupSpecs` não existe. A temporada em andamento não muda. `cupSpecs: []` (gravado por `createGame({ cups: false })` e por um pacote com `cups: []`) quer dizer "sem copas" e não é migrado. Testes: `tests/oldSaveCups.test.ts`.

**Copas padrão** (`src/data/package/countryCups.ts`; tabela e simplificações em `docs/formato-pacote.md`): Brasil, Inglaterra (copa), Espanha, Itália e Alemanha (copa e supercopa), França (copa), Portugal (copa e copa da liga com grupos) e Argentina (copa e supercopa sem prorrogação, em campo neutro). Valem para o país que tem liga e não tem copa no pacote (`cupsForPackage`); entram no pacote de exemplo das 15 ligas; a que não cabe nas ligas do país fica de fora com aviso. Novas regras de mandante do jogo único: `lower-division`, `higher-reputation`, `first-listed`. Nova opção de liga: `start`. `tiesOfStage` agora recusa jogos de copas diferentes. Testes: `tests/countryCups.test.ts`.

**Calendário.** Conferido com `node tools/run.mjs cupCalendar` (mundo de 282 clubes, 0 jogos no mesmo dia, 0 jogos de copa colados num jogo de liga, todos em quarta-feira): copas entre janeiro (supercopas) e outubro. **Limitação conhecida:** a temporada é o ano civil (contratos em 31/12, idades em 1º/1) e as ligas europeias usam o calendário brasileiro, então a temporada europeia real (agosto a maio) não é representada; a Copa da Liga de Portugal e a final inglesa caem em setembro e outubro, e a final de Portugal em 21/10, ainda dentro da liga. Refatorar para temporadas por pirâmide fica para depois.

**Custo de tempo (mundo de 282 clubes, uma temporada, `cupCalendar`):** sem copas 17,3 s; com as 14 copas de 8 países 22,7 s (+31%; 251 jogos de copa em 33 dias a mais, e cada dia a mais roda treino, condição e mercado dos 282 clubes: um dia só de copa custa ~350 ms contra ~210 ms de um dia de liga com 69 jogos). Os jogos de copa em si são poucos (5% dos jogos). Nas ligas fora do foco as copas usam o motor simplificado.

## 19. Temporadas por pirâmide (antes da 3C)

Cada país passa a ter a sua temporada, com um relógio de mundo só.

**Modelo.** `SeasonState.cycles` guarda, por pirâmide, o ciclo (`Cycle`: ano em que começa, primeiro e último dia, `split`). Ano civil (Brasil e América do Sul): 1/1 a 31/12. Temporada que atravessa o ano (Europa): 1/7 a 30/6, jogada de agosto a maio e exibida "2026/27". `season.year` e `season.phase` são os da pirâmide do foco (a do técnico), então a interface de um país só não mudou. Os países da IA viram a temporada sozinhos no último dia dela (`advanceToNextEvent` com `turn`); o do técnico espera o botão (`startNextSeason`), que antes joga o mundo até o último dia dele (`advanceUntil`).

**Virada por país** (`advanceSeason(state, { pyramid })`): acesso e rebaixamento, reputação, envelhecimento, aposentadorias, contratos (vencem no último dia da temporada do clube; o empréstimo acaba no fim da temporada do clube que recebeu o jogador), base, meta da diretoria, finanças, tabela nova e copas do país. Só clubes, jogadores, base e jogos dele mudam; propostas, anúncios e pré-contratos dos outros países seguem. Jogador livre há 200 dias ou mais sai do jogo. Sem `pyramid` a função vira todos (só serve a mundos de um calendário).

**Calendários** (`docs/formato-pacote.md`): Brasil e Colômbia 24/1, Paraguai 31/1, Argentina e Peru 7/2, Uruguai, Chile e Equador 14/2; Inglaterra, França e Portugal 8/8, Espanha 15/8, Itália e Alemanha 22/8; uma semana de pausa a cada 3 rodadas (`SEASON.gapEvery`). A Série A brasileira passou de 11/4 a 8/11 para 24/1 a ~7/11, terminando na mesma época. As copas padrão europeias foram refeitas para caber em agosto a maio. **Janelas** por região (`windowOfTeam`): a de verão europeia (julho e agosto) cai no meio da temporada brasileira; comprar exige a janela do comprador e, para o técnico vender, a dele e a do comprador. **Treino**, estatísticas, finanças, histórico e metas seguem a temporada do país (`Team.history`, `pastSeasons` e o arquivo `Game.archive` por país, com o nome "2026/27").

**Save versão 11** (`season.cycles`, `Cup.pyramid`); migração põe ciclos de ano civil.

**Números (mundo de 282 clubes, calendários reais, 30 temporadas, `npm run test:long`):** 5 testes passam em 744 s; ninguém no vermelho nem acima do teto, idades entre 24 e 28, força de cada liga estável (A brasileira 65,5 → 64,5 → 63,9, dentro do limite), campeões variados. **Tempo:** ~20 a 24 s por temporada (`node tools/run.mjs cycleRun`), igual aos 22,7 s com copas medidos na 3B. **Memória:** a mesma medida da B1 (`node --expose-gc tools/run.mjs worldScale --world full --live`): antes 125,0 MB de pico bruto, 37,7 MB vivos e 51,0 MB no fim; agora 133,4, 38,6 e 52,0. A diferença (+1 MB vivo) é ruído de coleta de lixo; os 300 a 350 MB vistos antes eram o `heapUsed` bruto no fim de cada ano de `memRun`, uma medida diferente (com lixo e com a virada). Com `--expose-gc` a memória viva do mundo com copas e calendários reais é de 52 a 56 MB (54 a 56 sem copas), estável ao longo dos anos.

**Correções no caminho.** Os laços "simular a temporada e virar" de testes e ferramentas supunham um calendário só; num mundo misto, `simulateToSeasonEnd` + `advanceSeason` deixa os jogos do país que já virou no passado. `simulateLeagueYears`, `packageYears` e o teste do pacote de 15 ligas usam agora `advanceUntil` com `turn`. `advanceUntil` não guarda os jogos do caminho (guardá-los estourou a pilha e acumulava anos de partidas). O mercado não trava mais num evento que o relógio já passou. Ajustes de teste: o treino Leve poupa menos condição (+0,76 contra o Normal) porque as pausas dão descanso a todos; o teste de campeão simplificado × completo usa 8 mundos.

## 20. Fase 3, parte 3C: copas continentais (concluída em 18/10/2026)

O motor, o formato e as ferramentas das copas continentais estão descritos em `CLAUDE.md` (parte 3C) e em `docs/formato-pacote.md`. Esta seção guarda o **estado do equilíbrio** na branch `continentais`, para retomar depois.

**Já calibrado**
- **Premiação continental:** média de ~5% da receita dos clubes que jogam (máximo ~40% de um clube pequeno).
- **Clubes fora do foco:** os 5 maiores de cada liga negociam sempre (`MARKET.rotation.alwaysActiveTop`); sem isso o país do técnico levava vantagem. Ferramenta `engineBias` confere o motor completo contra o simplificado.
- **Inglaterra e Espanha (seção 21):** a Inglaterra ganhava a copa principal europeia (14 a 17 títulos em 20 edições). A causa era a economia de `COUNTRY_DEFAULTS` (a do pacote de teste vale na simulação; `scaleWorld.ts` só dá a força inicial). Valores atuais, iguais em `leagueDefaults.ts`, `scaleWorld.ts` e `formato-pacote.md`: Inglaterra receita 3,6 e nível 7 (`repCurve` 1,7); Espanha 3,4 e 7,4 (`repCurve` 2,0). Resultado em 20 edições (foco Inglaterra): `cont-eu-1` Inglaterra 8, Espanha 8, Itália 2, Alemanha 1, França 1; a Inglaterra segue mais forte nas secundárias (`cont-eu-2` 9, `cont-eu-3` 10). `npm test`: 803 testes passam com esses valores.
- **Ferramenta nova:** `node --expose-gc tools/run.mjs topClubs --years 10` (força dos 6 maiores clubes de cada país europeu, no início e depois de N anos).

**Metas do `tests/long/world282.test.ts`** (30 temporadas, 282 clubes; todas as checagens são `expect.soft`, então uma rodada mostra todas as falhas)
- Cada copa continental: pelo menos 27 edições, mais de 40% de campeões diferentes, **no máximo 20% dos títulos para um clube** (não afrouxar: o maior campeão real tem ~13%), no máximo 2 seguidos.
- `cont-eu-1`: nenhum país com 70% ou mais (a meta combinada é ~40%; a checagem ainda não foi apertada).
- `cont-sa-1` (Libertadores): **Brasil de 50% a 75%, Argentina de 15% a 30% e em segundo, os outros países somando pelo menos 5%**.
- Dinheiro continental: média abaixo de 8% da receita, máximo abaixo de 50%; título dá reputação (média entre 0 e 1,5).

**Medições pesadas na nuvem.** O computador de desenvolvimento não aguenta as medições longas (o Claude Code as interrompeu várias vezes por falta de memória). O workflow `.github/workflows/medicao.yml` ("Medições pesadas", `workflow_dispatch`, também na `main` para aparecer na aba Actions) roda no GitHub: `continentais` (sementes separadas por vírgula, uma execução paralela por semente; anos e foco), `test-long`, `ligas` ou `personalizada` (qualquer ferramenta de `tools/`). Escolha a branch `continentais` em "Use workflow from"; o resultado vai para o resumo da execução e para Artifacts (30 dias). **O workflow ainda não foi rodado nem validado no GitHub** (o YAML foi conferido só à mão).

**Concluído.** O `test:long` passou pelo workflow (branch `continentais`, depois dos ajustes abaixo) e a parte 3C foi juntada na `main`. Metas finais: cada copa com mais de 40% de campeões diferentes, no máximo 2 títulos seguidos e um clube com até 20% dos títulos (`cont-eu-1`: até 30%, um país até 45%); `cont-sa-1`: Brasil de 40% a 75%, Argentina de 15% a 30% e em segundo, os outros países com pelo menos 1 título em 30; Brasil B e C: até 4 títulos de um clube por 10 temporadas. Itália (2,9 / 6,6) e Alemanha (2,6 / 5,8) ajustadas. Os itens 1 a 5 abaixo ficam como histórico.

**O que faltava (histórico)**
1. Rodar `continentais` com a semente 23 (e outras) pelo workflow, Brasil como foco, 30 anos. Já medido aqui (30 anos, Brasil como foco), `cont-sa-1`: semente 7 → Brasil 83%, Argentina 13%, outros 3% (fora da meta); semente 11 → Brasil 67%, Argentina 17%, outros 17% (dentro). Maior clube: 4 títulos (13%) nas duas.
2. **Ajustar o domínio do Brasil e a força da Argentina** na `cont-sa-1`, como se fez com a Inglaterra: ver primeiro os clubes de topo de cada país (adaptar `topClubs` para a América do Sul), a economia de `COUNTRY_DEFAULTS` (Brasil sem `economy`, receita 1; Argentina 0,6 / −1) e a repartição das vagas (raiz da receita). Lembrar de mudar `leagueDefaults.ts` e `scaleWorld.ts` juntos.
3. Entender os 7 títulos de um clube sul-americano (23%) que reprovaram o `test:long`: `continentalRun` usa outra semente de simulação (`createSeason` com a semente passada) que o teste (`years-7`), então as duas medições não são iguais; o workflow `test-long` mostra o que o teste vê.
4. Decidir se aperta a checagem da `cont-eu-1` para perto de 40% e se a Inglaterra com 45% das três copas europeias é aceitável.
5. Só depois de 1 a 4, rodar o `test:long` **uma vez** (pelo workflow), com os números finais, e registrar o resultado aqui e na seção 21.

## 21. Equilíbrio das copas europeias: Inglaterra e Espanha (medições em andamento)

**Problema.** Na copa principal europeia (`cont-eu-1`), a Inglaterra ganhava a maior parte dos títulos e a Espanha quase nenhum (1 em 30 temporadas no teste de longo prazo). Meta: distribuição variada, nenhum país acima de ~40% dos títulos (na vida real, nas últimas 20 edições, a Espanha ganhou mais que a Inglaterra, e Itália e Alemanha também ganharam).

**Medições** (`node --expose-gc tools/run.mjs continentalRun --years 20 --focus England`, mundo de 282 clubes, semente 7; títulos da `cont-eu-1` em 20 edições):

| Configuração (mundo de teste, `scaleWorld.ts`) | Inglaterra | Espanha | Outros |
|---|---|---|---|
| Original: Inglaterra receita 5, nível 8, piso de reputação 9; Espanha 3 / 7 | 14 | 3 | Itália 2, Alemanha 1 |
| Inglaterra 4 / 7,5; Espanha com `repCurve` 2,3 | 17 | 0 | Alemanha 3 |
| Inglaterra 3,5 / 7,2 com piso 8 (igual ao da Espanha); Espanha `repCurve` 2,3 | 16 | 1 | Alemanha 3 |
| Idem, sem os limites de estrangeiros do pacote de teste | 15 | 2 | Alemanha 3 |

Com o foco no Brasil (medição anterior) a Inglaterra também ficava em 15 a 17: o domínio **não** vem do foco do técnico (motor completo contra simplificado). Na `cont-eu-3` a Espanha ganha bastante (7 a 12), então o problema está no topo, não na liga toda.

**Diagnóstico.**
- A configuração da Espanha (receita 3, nível 7) não estava abaixo da Itália (2,5 / 6); a repartição das vagas (raiz da receita) dá à Inglaterra só uma ou duas vagas a mais.
- Os limites de estrangeiros (`en-1` elenco 17, `es-1` escalação 9, `it-1` escalação 8) **não** explicam: sem eles, a Inglaterra ainda ganha 15 e a Espanha 2.
- **Profundidade.** `leagueRun --clubs 282 --years 10 --ids en-1,es-1,it-1,de-1,fr-1` (com Inglaterra 3,5 / 7,2 e Espanha `repCurve` 2,3): força média dos titulares Inglaterra 73,0, Espanha 71,4, Alemanha 70,6, Itália 70,4, França 67,5; craques 8 a 12 na Inglaterra contra 3 a 6 na Espanha; 13 dos 40 melhores jogadores do mundo na Inglaterra contra 8 na Espanha; campeão da liga com 82 pontos contra 78. A escada de reputação mais íngreme da Espanha tirou profundidade dela sem dar nada ao topo, porque a reputação já está no teto (20) nos dois países. A única alavanca para um topo mais forte é o nível da liga (`economy.level`).

**Em teste.** Inglaterra receita 3,5, nível 7, `repCurve` 1,4 (rica de forma espalhada); Espanha receita 3,2, nível 7,6, `repCurve` 2,3 (topo forte, meio fraco). Se a distribuição ficar boa, os valores vão também para `COUNTRY_DEFAULTS` (`leagueDefaults.ts`) e para a tabela de `docs/formato-pacote.md`; depois `npm run test:long`. Resultado a registrar abaixo.

**Correção do diagnóstico (descoberta posterior).** O pacote de teste (`scalePackage.ts`) não passa `economy` às ligas: na simulação vale a economia de `COUNTRY_DEFAULTS` (`leagueDefaults.ts`; a Inglaterra continuava com 5 / 8), e `scaleWorld.ts` só define a força inicial dos elencos. As linhas da tabela acima que mudam só o `scaleWorld.ts` mexeram, na prática, na força inicial e na escada de reputação, e o mundo nascia num nível e a economia real puxava a Inglaterra para cima: `tools/topClubs.ts` (`node --expose-gc tools/run.mjs topClubs --years 10`) mostra a média dos titulares da liga inglesa subindo de 73,2 para 76,1 em 10 anos (clubes de 79 a 82) com Itália e Alemanha parados. **Ao calibrar, mude `leagueDefaults.ts` e `scaleWorld.ts` juntos, com os mesmos valores.** Com Inglaterra 3,8 / 7,2 (`repCurve` 1,7) e Espanha 3,4 / 7,4 (`repCurve` 2,0) nos dois arquivos, o topo depois de 10 anos ficou parelho: Inglaterra 79,5, Espanha 79,4, Alemanha 79,2, França 76,5, Itália 75,4 (média da liga 74,4 / 73,8 / 70,7 / 68,4 / 71,1).

**Pendente:** a medição de campeões de 20 anos com esses valores (`continentalRun --years 20 --focus England`) foi interrompida duas vezes por falta de memória do computador; falta rodá-la, conferir que nenhum país passa de ~40% das edições da `cont-eu-1`, atualizar a tabela de `docs/formato-pacote.md` (Inglaterra 3,8 / 7,2; Espanha 3,4 / 7,4) e rodar `npm run test:long`.

**Resultado (valores finais: Inglaterra receita 3,6 / nível 7, `repCurve` 1,7; Espanha 3,4 / 7,4, `repCurve` 2,0; iguais em `leagueDefaults.ts`, `scaleWorld.ts` e `formato-pacote.md`).** Títulos em 20 edições, Inglaterra como foco:

| Copa | Inglaterra | Espanha | Alemanha | Itália | Outros |
|---|---|---|---|---|---|
| `cont-eu-1` | 8 | 8 | 1 | 2 | França 1 |
| `cont-eu-2` | 9 | 3 | 4 | 3 | França 1 |
| `cont-eu-3` | 10 | 4 | 3 | 2 | Portugal 1 |

Com 3,8 / 7,2 a Inglaterra tinha 8, 11 e 9 (47% somando as três) e a Espanha 6, 4 e 6. Na copa principal nenhum país passa de 40%; a Inglaterra segue mais forte nas secundárias (45% das três). Na liga inglesa a força média dos titulares sobe de 72,4 para 74,0 em 30 anos, parelha com a da Espanha (72,4 para 73,8). `npm test`: 803 testes passam.

**`npm run test:long` (30 temporadas, 1 013 s): 5 de 6 passam.** Falhou `copas continentais: campeões variados, sem dinastias...` na primeira asserção da `cont-sa-1`: um clube sul-americano com 7 títulos em 30 edições (23%, limite 20%). É dinastia na América do Sul, fora do que foi calibrado aqui; as asserções seguintes (fatia por país na `cont-eu-1`, dinheiro, reputação) não chegaram a rodar. Em aberto: ver se é sorte da semente (a mudança de economia desloca o sorteio de todo o mundo) ou efeito real. Também em aberto: a asserção de país só exige menos de 70% na `cont-eu-1`; a meta combinada é ~40%.

**Meta sul-americana (`cont-sa-1`) e medições na nuvem.** A meta de ~40% por país vale para a Europa; na América do Sul segue a Libertadores real (clubes brasileiros com mais da metade das últimas 30 edições): **Brasil entre 50% e 75% dos títulos, Argentina em segundo com 15% a 30%, os outros países ganhando de vez em quando (pelo menos 5%)**. O limite de 20% de títulos de um clube em 30 edições continua (o maior campeão real tem ~13%). Medido aqui, Brasil como foco, 30 anos: semente 7 → Brasil 83%, Argentina 13%, outros 3% (fora da meta); semente 11 → Brasil 67%, Argentina 17%, outros 17% (dentro). O maior clube teve 4 títulos (13%) nas duas; os 7 títulos do `test:long` não se repetiram com `continentalRun` (que usa outra semente de simulação que o teste). Falta a semente 23 e o ajuste do domínio do Brasil. O `test:long` agora usa `expect.soft` (todas as falhas de uma vez) e confere essa meta.

As medições pesadas não cabem na memória do computador de desenvolvimento: o workflow `.github/workflows/medicao.yml` ("Medições pesadas", só `workflow_dispatch`) as roda no GitHub. Pela aba Actions › Medições pesadas › Run workflow, escolhe-se a branch e a medição: `continentais` (sementes separadas por vírgula, uma execução paralela para cada; anos e foco), `test-long`, `ligas` ou `personalizada` (qualquer ferramenta de `tools/` com argumentos). O resultado aparece no resumo da execução e fica em Artifacts por 30 dias.

**Rodada do `test:long` com Itália 2,9 / 6,6 e Alemanha 2,6 / 5,8 (commit bfc8ac4, pelo workflow): 4 de 6 passaram.** Falharam: `cont-sa-1` com os outros países em 3,3% (1 título em 30; limite era 5%) e `br-3` com 4 títulos de um clube num bloco de 10 temporadas (limite 3). Medições das copas (sementes 7, 11 e 23, 30 anos): `cont-sa-1` Brasil 18, 13 e 17, Argentina 8, 8 e 8, outros 4, 9 e 5; `cont-eu-1` Inglaterra 11, 8 e 8, Espanha 8, 8 e 11, Alemanha 6, 7 e 7, Itália 4, 7 e 3, França 1, 0 e 1, máximo de um clube 5, 4 e 4. Itália e Alemanha ficaram em valores realistas.
- **Metas mudadas:** os outros países na `cont-sa-1` precisam de pelo menos 1 título em 30 (a fatia varia de 13% a 30% nas três sementes; a checagem de 5% dependia da sorte da semente) e o Brasil de 40% a 75% (43% na semente 11). Na `cont-eu-1`, um clube até 30% e um país até 45%.
- **Brasil C (`br-3`):** `node tools/run.mjs promotionRun --years 20` (Brasil B e C, 3 sementes, `tools/promotionRun.ts`) mede quantos clubes que sobem caem na temporada seguinte: **B → A: 58% (138 de 240); C → B: 60% (143 de 240)**; quase nenhum sobe de novo logo depois. É um pouco acima do ~50% da realidade, mas não "muito mais da metade", então o limite de títulos de um clube em 10 temporadas na B e na C subiu de 3 para 4.

## 22. Fase 3, parte 3D: mundo ampliado e copas mundiais (branch `mundo-ampliado-3d`)

Formato das copas no pacote: `docs/formato-pacote.md` (seções "Copas mundiais" e "Vagas"). Resumo em `CLAUDE.md` (parte 3D).

**Mundo de teste: 358 clubes em 21 ligas** (antes 282 em 15): Países Baixos (18 clubes, Europa, receita 1,2 e nível 2,6), México (18) e Estados Unidos (20, turno único), os dois na nova região `NA` (ano civil, receita 0,9 / nível −1 e 1 / −0,5), e **uma liga de elite por continente** para África, Ásia e Oceania (8, 8 e 4 clubes; países âncora Egito, Japão e Austrália; sem acesso nem rebaixamento; temporada de agosto a maio). Esse é o "jeito leve" de manter os clubes mais fortes desses continentes vivos: eles passam pela mesma virada de temporada (elenco, evolução, contratos, base, finanças) e, fora do foco, usam a partida simplificada e o rodízio do mercado. Um pacote real pode trazer ligas completas desses países; as copas mundiais usam os clubes mais fortes de primeira divisão do continente.

**Copas novas (todas padrão, nomes genéricos):** `cup-nl` e `supercup-nl`; `cont-na-1` (16 clubes, 8 de cada liga, oitavas a final em ida e volta, fevereiro a maio); `world-1` Copa Intercontinental (todo ano, a partir de 1º/12; 6 clubes: campeões mais recentes de `cont-eu-1`, `cont-sa-1` e `cont-na-1` e das ligas de elite; os dois cabeças de chave folgam; jogo único neutro, quartas-feiras de dezembro); `world-2` Mundial de Clubes (2029, 2033…, a partir de 1º/6; 32 clubes: 12 EU, 6 SA, 4 AF, 4 AS, 4 NA, 1 OC e o país-sede, o campeão da primeira liga norte-americana; cada continente leva os campeões das últimas 4 edições e completa pelos mais fortes; 8 grupos de 4, oitavas a final em jogo único neutro, de junho a 18/7). Com a Holanda, a Europa passa a ter 7 países e as vagas das três copas europeias foram refeitas (mesmos tamanhos 24, 16 e 12).

**Calendário.** O Mundial fica de junho a meados de julho, depois das finais europeias (até 27/5) e antes da abertura das ligas europeias, africana, asiática e da Oceania (a partir de 8/8); as ligas de ano civil seguem jogando e os jogos do Mundial caem em quartas-feiras sem o mesmo dia de outro jogo do clube (regra tolerante das continentais). A Intercontinental fica em dezembro, depois das finais sul-americanas (até 24/11) e antes da virada de 31/12. A virada de um país espera os jogos pendentes de seus clubes nas copas mundiais (`pyramidFinished`), por isso o Mundial precisa acabar antes do começo da nova temporada europeia. Conferência de 2026 (`node tools/run.mjs worldCups --until 2027-01-03`): 0 clubes-dia com dois jogos; a copa norte-americana de 18/2 a 27/5; a Intercontinental em 9, 16 e 23/12 com um clube de cada continente. O Mundial de 2029 foi verificado em teste de unidade (edição criada em 2/6/2029 com 32 clubes, 48 jogos de grupos em quartas-feiras de junho, sem choque de datas, e não nasce em 2027, 2028 nem antes de 1º/6); **a simulação de 4 anos seguidos até o Mundial real não coube na memória deste computador e fica para o workflow** (`mundo-ampliado`).

**Saúde das ligas novas** (`leagueRun --ids af-1,as-1,oc-1,nl-1,mx-1,us-1,en-1 --years 10 --seed 7`, sem copas): ninguém no vermelho em nenhum ano; força média dos titulares estável (Países Baixos 64,7 → 65,5; México 62,0 → 61,8; Estados Unidos 61,4 → 61,9; África 59,2 → 59,7; Ásia 61,7 → 62,2; Oceania 58,9 → 57,8); idade média 24 a 26; saldo/teto máximo 1,2; campeões 69 a 84 pontos em 38 jogos. A Oceania, com 4 clubes, tem um clube com 5 títulos em 10 anos (esperado numa liga tão pequena).

**Diagnóstico.** `measureWorld` e a tela `?diagnostico=1` agora medem o jogo pelo caminho real (`diagnostics/scaleGame.ts`: pacote de 21 ligas validado, `createGame`, calendários de cada país, foco no Brasil e todas as copas), mostram quantas copas e jogos de copa a temporada tem e o mundo de 358 clubes. `worldScale --world full` usa o mesmo caminho (`--classic` volta ao mundo sem copas).

**Correções depois da primeira rodada do workflow (30 anos).** (1) *Copas europeias que quase nunca terminavam.* Causa (reproduzida com `node tools/run.mjs euCheck`, ano a ano): o Mundial de 2029 atrasava até setembro (cada fase esperava uma data livre e, com as ligas de ano civil em plena temporada, escorregava semanas) e a virada de temporada de um país espera os jogos pendentes dos clubes dele (`pyramidFinished`); Inglaterra, Espanha e Itália só viraram depois de a Alemanha, a França, Portugal e os Países Baixos já estarem na temporada nova, e a edição seguinte das copas europeias só nasce com **todos** os países na pré-temporada, então a de 2029 nunca nasceu (e o mesmo valia para o campeão `latest` da Intercontinental, que ficava preso no mesmo clube: a dinastia de 17 títulos). O relatório do `worldCups --until 2027-01-03` mostrar fases sem datas era só o fato de elas ainda não terem sido sorteadas naquela data. Correções: as copas mundiais **não seguram mais a virada** do país nem a fase dele (`pyramidMatches`); no ano do Mundial as **ligas de ano civil pausam de 3/6 a 22/7** (`CupSpec.world.pause`, `leaguePauses`, `roundSlots`), então o Mundial cabe em 6/6, 13/6, 20/6 e 27/6, 4/7, 11/7 e 18/7 sem esbarrar em jogo de liga, e a Série A de ano civil termina antes de 31/12 com as 38 rodadas. (2) *Reputação:* o título mundial não soma mais o bônus de reputação do continental (só as copas continentais), para não reforçar o mesmo campeão sul-americano. (3) *América do Norte:* México receita 1 / nível 0 e reputação 15 a 4, Estados Unidos 0,9 / −2 e 13 a 3 (iguais em `leagueDefaults.ts` e `scaleWorld.ts`). (4) *Jogo colado:* as copas com clubes de vários países procuram, por até 10 semanas, uma terça, quarta ou quinta sem nenhum jogo do clube na véspera, no dia ou no dia seguinte (`pickCupDay`); o teste `tests/worldCupsCalendar.test.ts` confere 0 jogos colados e 0 clubes com dois jogos no mesmo dia na temporada de 2026, e que toda copa tem campeão e datas em todas as fases. (5) *Relatório do `test:long`:* aceita ligas ausentes em algum ano (`leagueIds`, `seriesOf`; teste `tests/leagueYearsReport.test.ts`); a medição de ligas vai até 31/7 do ano seguinte ao último.

**Pendente (workflow, não rodado neste computador):** (1) `Medições pesadas › mundo-ampliado` na branch `mundo-ampliado-3d` (tempo, memória e save de 358 clubes; calendário; campeões das mundiais com `anos` 30); (2) `test-long`; (3) conferir campeões por clube e continente (europeus e sul-americanos na frente, sem dinastias) e registrar os números aqui; (4) só então juntar na `main`. As metas novas já estão em `tests/long/world282.test.ts`: cada copa mundial com mais de 60% de títulos de Europa e América do Sul, Mundial com mais de 50% de campeões diferentes e no máximo 35% de títulos de um clube, dinheiro das mundiais abaixo de 8% da receita em média.
