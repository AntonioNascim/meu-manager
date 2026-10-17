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
