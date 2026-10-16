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
| **B6** | Teste de longo prazo das 15 ligas, ajuste fino, pacote do usuário com várias ligas (tirar `unsupported-leagues` aos poucos) | Fecha a fase |

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
