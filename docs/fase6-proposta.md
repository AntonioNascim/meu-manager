# Fase 6 — Modo online: estudo e proposta (parte A, versão 2)

Status: **proposta revisada com as decisões de 01/11/2026; nada implementado.** A versão 1 tinha uma liga de uma divisão só; esta traz o **mundo inteiro em cada liga online**. Falta só a pequena lista da seção 10 antes da B1.

Base: `CLAUDE.md`, `docs/plano-mundo-real.md` (Fase 6) e as medições de `docs/fase2-proposta.md` (seções 9, 11, 12 e 23). Decisões mantidas: jogo gratuito; sem e-mail nem senha; identidade anônima por aparelho, com apelido e código de recuperação; ligas abertas ou só para amigos, com convite por link ou código; o ADM remove participantes; filtro de apelidos; motor puro e determinístico por semente.

> **Preços.** Os valores de planos do Cloudflare abaixo são os que eu conheço (2025 até meados de 2026) e mudam. **A B1 confirma na página de preços antes de qualquer gasto.** As estimativas de uso são minhas, com as suposições escritas; a B1 e a B9 as medem.

---

## 0. Resumo

1. **Cloudflare**, como decidido: Workers (API), **um Durable Object por liga online** (com o mundo guardado no SQLite dele), D1 (identidades, diretório de ligas, convites) e R2 (saves e pacote).
2. **O mundo inteiro cabe, mas com pouca folga se for mantido todo na memória.** Medido na Fase 5D (370 clubes, 10.471 jogadores): 37 MB de memória viva e **pico de 114 MB** (com lixo) contra o **limite de 128 MB** do Durable Object. Por isso o mundo vai para o **SQLite do Durable Object, em blocos por clube**, e cada passo carrega só o que precisa. Projeção: **~3 MB sempre na memória e 10 a 25 MB por passo típico; pico de ~50 MB** na pior virada. Ainda é projeção: a B1 mede no ambiente real do Cloudflare. **Atualização (seção 11, medição local da B1):** o mundo inteiro em memória fechou uma temporada com teto de heap de 64 MB (heap vivo ~50 MB), então os blocos servem mais ao custo e ao "adormecer" do que à memória.
3. **Só as partidas com técnico humano são lance a lance.** O resto do mundo usa o modo rápido que já existe (`simulateQuick`, ~1000× mais barato). Uma temporada inteira de uma liga custa **~45 s de processamento** no total (a máquina de desenvolvimento, medida; no Cloudflare estimo 1 a 1,5×), e o passo mais pesado fica em **~3 a 5 s**, longe do limite de 30 s por chamada.
4. **Custo:** **~US$ 5 por mês com 100 e com 1.000 jogadores ativos; ~US$ 15 a 35 com 10.000.** O custo cresce com o número de **ligas ativas** (≈ US$ 3 por mês a cada 100 ligas), não com o número de jogadores. O plano gratuito **não serve** (limite de 10 ms de CPU por chamada), então o plano pago de US$ 5 vale desde o teste.
5. **Não encontrei limite que impeça.** Os limites reais (memória, uma única thread por liga, custo de escrita no SQLite) e como cada um é contornado estão na seção 3.5. O que dá trabalho não é o Cloudflare e sim **adaptar o motor** (mundo em blocos, fidelidade por partida), que é a parte maior da divisão de trabalho (B5 e B6).
6. **Relógio da liga** (seção 2): a liga tem uma **data do jogo** que anda com o tempo real. Toda competição com ao menos um clube de técnico humano segue inteira os horários, o "Pronto", o Avançar e a Pausa do ADM; as competições sem humano andam por trás, no modo rápido, acompanhando a data da liga, e **param juntas quando o ADM pausa**.
7. **Carreira solo** continua **100% jogável sem internet**; a nuvem é um espelho que sincroniza quando há conexão (seção 4). **Só as ligas online exigem internet.**

---

## 1. O que mudou desde a versão 1

| Decisão | Efeito na proposta |
|---|---|
| Solo jogável sem internet, sincroniza depois | Seção 4.3 reescrita: a nuvem é espelho, o local manda |
| **Mundo inteiro em cada liga**, todas as ligas e copas, humanos em qualquer clube | Seções 2 e 3 refeitas: mundo em SQLite por blocos, fidelidade por partida, relógio da liga único |
| Horários por competição com humano; resto por trás | Seção 2.2 |
| Ao vivo como padrão, resultado direto como opção | Mantido (2.3) |
| Avançar: datas restantes ficam como estavam | Seção 2.5 |
| Pausa: humanos negociam, prazos e IA congelados | Seção 2.5 e 2.7 |
| Chat fora | Retirado de toda a proposta (mercado, segurança, privacidade, partes) |
| Abandono automático só nas ligas abertas | Seção 2.9; nas de amigos só o ADM decide |

**Correção da versão 1.** Eu disse que o mundo passava de 80 MB na memória no fim da temporada e por isso não cabia. Esse número era anterior à compactação das partidas (Fase 2, B1). O valor atual medido é **37 MB vivos e 114 MB de pico**. O mundo inteiro, portanto, em tese cabe; guardar no SQLite por blocos continua sendo a escolha certa pela folga (limite de 128 MB), pelo custo de escrita e porque a liga fica "adormecida" entre rodadas, mas não é mais uma obrigação.

---

## 2. Como funciona uma liga online

### 2.1 Composição

- **Cada liga online tem o mundo inteiro** do pacote escolhido (real ou fictício, versão fixada na criação): as 21 ligas, as copas nacionais, continentais e mundiais, a base, o mercado. O mundo é um só, conectado (um jogador pode ir de uma liga para outra).
- **De 2 a 20 técnicos humanos**, cada um em qualquer clube de qualquer liga e país. Os demais clubes são IA. Cada clube tem no máximo um técnico humano.
- **Aberta** (listada no diretório, entra quem quiser enquanto houver clube livre) ou **só para amigos** (link ou código de 8 caracteres). O ADM começa a liga com a data de início; quem entra depois escolhe um clube livre, e o ADM pode fechar a entrada.
- **Competição com humano** = qualquer liga, copa ou fase em que haja pelo menos um clube de técnico humano (por exemplo, humanos no Brasileirão: valem também a Copa do Brasil, a Libertadores e a Sul-Americana dos clubes deles; um europeu: a liga dele e a copa continental em que estiver). **Competição sem humano** roda por trás.
- Pacotes do servidor apenas (real e fictício). Pacote importado por jogador não vale em liga online no começo.
- Limites por identidade: 3 ligas criadas e 5 em que participa.
- A reputação de técnico da carreira solo **não** vale: todos começam iguais.

### 2.2 O relógio da liga: data do jogo e horários reais

**A liga tem uma data do jogo (`D`) que anda com o tempo real.**

- **Ritmo:** o ADM escolhe, ao criar a liga, quantos dias de jogo passam por dia real. **Normal (3) é o padrão das ligas abertas** (nas abertas o ritmo é Normal; só ligas de amigos podem usar os outros). Além do ritmo, o botão Avançar continua disponível.

  | Ritmo | Dias de jogo por dia real | Temporada (365 dias) | Brasileirão (38 rodadas, ~300 dias de jogo) | Uma partida do seu time a cada | Janela de 30 dias fica aberta | Mínimo entre dois eventos |
  |---|---|---|---|---|---|---|
  | Calmo | 2 | ~6 meses (183 dias) | ~21 semanas | ~2,8 dias | 15 dias | 8 h |
  | **Normal** | **3** | **~4 meses (122 dias)** | **~14 semanas** | **~1,9 dia** | **10 dias** | **8 h** |
  | **Rápido** | **7** | **~7,5 semanas (52 dias)** | **~6 semanas** | **~19 h** | **~4 dias** | **8 h** |
  | **Bem rápido** | **14** | **~3,7 semanas (26 dias)** | **~3 semanas** | **~9,5 h** | **~2 dias** | **6 h** |

  (Estimativa com ~65 jogos por temporada por clube, entre liga e copas; clubes com copa continental jogam mais. No Bem rápido a pessoa joga em média 2 a 3 partidas por dia real, então ele serve a grupos de amigos que combinaram jogar todo dia; o mínimo de 6 h entre eventos impede a liga de pedir mais que isso. No Rápido, o treino, a condição e o mercado da IA andam 2,3 vezes mais por dia real que no Normal, e no Bem rápido 4,7 vezes, sem mudar nada no jogo em si.)
- **Eventos** são as datas em que alguma competição **com humano** tem partidas. Cada evento recebe um **horário real de início**; **todos os jogos do evento, de todas as competições com humano, começam juntos**. Humanos no Brasileirão e na Premier League no mesmo dia jogam no mesmo horário.
- **Âncoras:** `D` é amarrada aos eventos: em cada horário de início `D` vale exatamente a data do evento; entre dois eventos ela é interpolada no ritmo escolhido. Também são âncoras a abertura e o fechamento de cada janela e a virada de temporada de cada país. `D` nunca passa da data do próximo evento antes do início dele.
- **Os horários variam de rodada para rodada.** O horário ideal de cada evento vem do ritmo; ele é encaixado no próximo horário permitido da faixa da liga, sorteado com **a semente da liga** entre as opções livres. Regras: nunca o mesmo horário duas vezes seguidas (quando há outra opção), mínimo de 8 h entre dois eventos (editável), no máximo 36 h de atraso sobre o ideal; se houver conflito, os eventos seguintes se deslocam em cascata. O calendário das próximas 4 semanas fica visível a todos.
- **Faixas escolhidas pelo ADM:**

  | Predefinição | Horários (fuso da liga) |
  |---|---|
  | **Futebol clássico** (padrão) | sáb 16h / 18h30 / 21h; dom 11h / 16h / 18h30 / 20h30; meio de semana 19h30 / 21h30 |
  | **Só à noite** | 19h / 20h30 / 21h30 / 22h30, qualquer dia |
  | **Só fim de semana** | sáb e dom, das 10h às 22h |
  | **Personalizada** | até 12 horários da semana; mínimo de 3 h entre dois no mesmo dia |

  Fuso da liga escolhido pelo ADM (padrão America/Sao_Paulo); cada técnico vê tudo no fuso do aparelho.
- **Passagem diária (tick):** uma vez por dia real, num horário calmo da liga (padrão 4h), e a cada início de evento, o servidor leva `D` ao valor devido e processa tudo que ficou para trás: **competições sem humano no modo rápido**, treino, condição, finanças, mercado da IA, propostas e a virada de temporada dos países (cada país vira no seu último dia, como o motor já faz). Competições com humano **não passam do próximo evento** antes de ele começar.
- **Duração da partida ao vivo** (ADM): **Rápida 6 min, Normal 15 min (padrão), Longa 25 min** reais para os 90 minutos; intervalo = 1/3 do primeiro tempo. **Resultado direto** (opção do ADM): simula no horário e mostra o relatório, sem ao vivo.
- **Sala:** a escalação e a tática ficam abertas antes; **5 minutos antes** do horário a sala mostra quem está pronto; no início a escalação trava (no ao vivo valem as ações de hoje: troca, tática, posição, lesão).

### 2.3 Estados de um evento

```
agendado ─▶ (todos prontos │ chegou o horário │ ADM avança) ─▶ travado ─▶ ao vivo ─▶ encerrado ─▶ virada
   ▲                                                                                       │
   └──────────────────────────────── próximo evento ◀──────────────────────────────────────┘
      (qualquer estado) ─ ADM pausa ─▶ pausada ─ ADM retoma ─▶ (volta ao estado em que estava)
```

A **virada** aplica o que o jogo já faz depois de um dia de jogos: `applyMatchToPlayers`, condição, lesões, suspensões, avanço das copas, e então o próximo trecho do relógio.

### 2.4 Botão "Pronto"

- Cada evento tem a sua lista: **só os técnicos que têm partida naquele evento** precisam dar "Pronto" (quem está em competição sem jogo naquele dia não é esperado).
- **Quando todos eles estiverem prontos, o evento começa na hora**, antes do horário. Ausentes e autopiloto (2.8) contam como prontos.
- Antes da sala abrir (5 minutos antes do horário) o evento nunca começa por "todos prontos", só por Avançar.
- Lembretes só dentro do jogo (e notificação do PWA, se o aparelho permitir e o jogador aceitar); sem e-mail.

### 2.5 Botões do ADM

**Avançar.** Leva a liga **ao próximo evento agora**: ele começa na hora, mesmo que falte gente pronta (confirmação: "X e Y ainda não estão prontos. Começar agora?"). **Os horários dos eventos seguintes ficam como estavam** (decisão): se o seguinte ficar colado, o ADM avança de novo ou deixa passar. Efeito colateral mostrado ao ADM antes de confirmar: a data `D` salta, então **as janelas de transferência e os prazos que dependem de `D` ficam mais curtos em tempo real para todos** ("a janela fecha em 2 dias reais em vez de 5"). É também a resposta a "quem nunca dá pronto".

**Pausar e retomar.**
- **Pausada:** `D` **para**, nenhum evento começa, **as competições sem humano param juntas** (nada avança por trás), o treino, a condição, a IA e as janelas ficam parados. Calendário e janelas continuam iguais para todos.
- **No meio de uma partida ao vivo**, congela no minuto e continua dele ao retomar (aviso de 10 s).
- **O que os técnicos podem fazer pausado:** editar escalação e tática, dar "Pronto", ver a liga e **negociar entre si** (fazer, aceitar, recusar e contrapor ofertas). **Ficam congelados:** os prazos das ofertas (guardam o tempo restante), as decisões da IA (compras e vendas dos clubes sem humano, respostas a propostas de clubes sem técnico) e as execuções de transferência (rodam no primeiro passo depois que a liga retoma).
- Ao retomar, **os horários futuros são refeitos a partir de agora** com as mesmas regras da faixa (não são só deslocados: uma pausa de 3 dias numa liga "só à noite" não pode cair às 4h).
- A pausa dura no máximo **30 dias** (depois a liga volta e avisa); liga sem nenhum humano ativo por 180 dias é arquivada (somente leitura) e apagada após mais 90.
- Pausas, retomadas e avanços ficam no histórico da liga, visíveis a todos.

**ADM some:** 14 dias sem entrar → o humano mais antigo e ativo vira ADM, com aviso. O ADM também pode passar o cargo.

### 2.6 Quem simula, e como o servidor confere que ninguém trapaceou

**O servidor simula (autoritativo), com o mesmo `src/engine`.** O aparelho manda **decisões**, não resultados.

1. No início do evento, o servidor monta cada `MatchInput` com as táticas gravadas no servidor e uma **semente da partida** derivada de `(semente da liga, evento, partida)`. O cliente não escolhe semente.
2. **Fidelidade por partida:** a partida em que joga **pelo menos um clube de técnico humano** é lance a lance (`startMatch`); **todas as outras partidas do mundo** (inclusive as de IA contra IA nas competições com humano) usam `simulateQuick`. Os resultados das rápidas saem no início do evento e são "revelados" pelo relógio na aba Jogos (`otherGames.ts` já faz isso).
3. **Ao vivo:** o Durable Object anda 1 minuto de jogo a cada `duração ÷ 90` segundos (10 s no Normal) em todos os jogos humanos do evento e envia os snapshots por WebSocket. O cliente só desenha. Comandos (`setStyle`, `setMentality`, `setFormation`, `substitute`, `setPosition`, `resolveInjury`) são validados (dono do time, regra de trocas, disponibilidade, limite de estrangeiros) e entram no **próximo minuto**.
4. **Registro de reprodução** de cada partida humana (semente, entradas, lista de comandos com minuto) fica no R2: qualquer um, com o pacote e a versão do motor, refaz a partida e compara o hash.
5. **Determinismo entre navegadores:** `Math.exp`/`Math.pow` podem diferir nos últimos bits entre V8 (Cloudflare, Chrome, Android) e JavaScriptCore (Safari/iPhone). Por isso **o cliente online nunca recalcula resultado**. A B1 mede isso (`tests/matchGolden.test.ts` em WebKit e V8) e, se divergir, o motor troca `exp/pow` por implementação própria (o teste golden garante que o jogo solo não muda).

| Risco | Defesa |
|---|---|
| Cliente adulterado manda escalação inválida (lesionado, suspenso, de outro time, estrangeiros demais) | O servidor repara/recusa com as funções do jogo (`repairTactic`, `buyerCheck`, `engine/foreign.ts`) |
| Cliente cria dinheiro, jogador ou contrato | Elenco e finanças existem só no servidor; o cliente pede, o servidor calcula |
| Reabrir o app para desfazer decisão | Não há save local da liga online |
| Conluio (troca de graça) | Faixa de preço de ±50% do valor de mercado, no máximo 3 negócios entre os mesmos dois clubes por janela, histórico de transferências público; o ADM pode remover |
| Várias identidades do mesmo dono | Não dá para impedir sem e-mail; o ADM vê a data de criação e remove |
| Spam de comandos | Limite de pedidos (seção 6) |

### 2.7 Mercado

- O mercado de hoje (busca, listas, propostas, empréstimo, pré-contrato, favoritos) funciona com **o mundo todo**: um técnico no Brasil pode comprar no Reino Unido ou do Japão, com as regras de janela por região, limite de estrangeiros e economia por liga que já existem.
- **Entre humanos:** oferta direta (valor, salário, duração; compra ou empréstimo) com o dinheiro **reservado**; o dono aceita, recusa ou contrapõe. **Prazo:** até o próximo evento do clube dele ou 48 h reais, o que vier antes; sem resposta = recusa; **o prazo congela na pausa**. Se o dono é ausente/autopiloto, decide a regra da IA (`sellerDecision`). Execução só **entre eventos**, com reconferência total (vaga, orçamento, estrangeiros, janela, jogador ainda no clube); se algo falhou, desfaz e avisa os dois.
- **Pausada:** os humanos negociam normalmente; os prazos, a IA e as execuções ficam parados (2.5).
- Disputa por jogador livre ou de IA: vale a ordem do servidor; um por jogador por rodada de negociações.
- **Sem chat** nesta fase.

### 2.8 Quem não aparece

- O evento **não espera ninguém**: começa no horário, por "todos prontos" ou por Avançar.
- **Escalação de quem não deu pronto:** a **última tática salva** do técnico (formação, estilo, mentalidade, cobradores, posições da grade), consertada por `repairTactic` (lesionados, suspensos, estrangeiros), como o motor faz com a IA. Sem tática salva, vale `aiTactic`.
- **Durante a partida**, o time sem técnico conectado passa à **IA completa** (`userControlled: false`); quando o técnico volta, retoma o controle no minuto seguinte.
- **Lesão ao vivo:** o jogo não para (são vários jogos humanos ao mesmo tempo); a IA troca na hora e quem está conectado corrige depois (dentro do limite de trocas).

### 2.9 Abandono

| Situação | Estado | O que acontece |
|---|---|---|
| Faltou a 1 ou 2 partidas seguidas | **Ausente** | Autopiloto (2.8), conta como pronto, mercado respondido pela IA, "ausente" visível |
| 3 partidas seguidas | **Autopiloto longo** | Igual; o clube só renova pela regra da IA, não compra; o ADM recebe aviso |
| 6 partidas seguidas ou 21 dias reais | **Vaga aberta** | **Só em liga aberta**: o técnico perde o clube, o clube vira IA e a vaga reabre |

- **Ligas de amigos:** o autopiloto vale (a liga não pode parar), mas **nada abre vaga sozinho**; só o ADM tira alguém (com confirmação) e o ADM recebe sugestões ("fulano está ausente há 6 partidas").
- Sair por vontade própria: botão "Sair da liga", com confirmação. Removido pelo ADM: não volta sem convite novo. O nome fica no histórico dos jogos já feitos.

### 2.10 Fim da temporada

Cada país vira sozinho no último dia da sua temporada (`advanceSeason` com `pyramid`, já existente). Metas da diretoria e demissão existem, com tolerância maior que na carreira solo (dois períodos de confiança baixa), porque o técnico entra uma ou duas vezes por semana. Técnico demitido fica sem clube até a liga abrir vaga.

---

## 3. Memória, processamento e custo com o mundo inteiro

### 3.1 O que foi medido (Node, máquina de desenvolvimento, pacote real de 370 clubes e 10.471 jogadores)

| Medida (Fase 5D, `desempenho-real`) | Valor |
|---|---|
| Temporada inteira (139 avanços, 6.382 partidas), com o Brasil A+B+C lance a lance e o resto rápido | **25,0 s** |
| Avanço mediano / p95 / máximo (primeiro avanço) | **110 ms / 529 ms / 2.175 ms** |
| Memória viva no pico / pico com lixo | **37 MB / 114 MB** |
| Save (JSON no fim da temporada) / comprimido | 19,8 MB / 2,5 MB |
| Partida completa (lance a lance) / partida rápida | ~7 ms / 4 a 10 µs a 0,5 ms |
| Mundo recém-criado (a partir do arquivo) | 0,6 s para montar |

Dos 25 s por temporada, ~8 s são as ~1.140 partidas lance a lance do Brasil na Série A (as da B e da C pelo mesmo caminho completo somam o resto desse bloco); o restante é mercado da IA, treino, finanças e partidas rápidas.

### 3.2 Como o mundo fica no Durable Object

O banco SQLite do Durable Object guarda o mundo em **blocos por clube** (e não uma linha por jogador):

| Tabela | Conteúdo | Linhas |
|---|---|---|
| `club_bundle` | clube + elenco + base + finanças + tática (um JSON de ~15 a 60 KB) | 370 |
| `player_index` | id, posição, força, idade, valor, clube, fim de contrato, favorito/anúncio | 10.471 |
| `competition` / `match` / `standing_cache` | competições, partidas (as antigas compactadas), classificações | milhares |
| `league_state` | `D`, calendário real, faixas, âncoras, pausa, prontos | poucas |
| `market` / `offers` | propostas, anúncios, histórico, ofertas entre humanos com prazo | milhares |
| `archive` | resumo das temporadas passadas (já existe como `Game.archive`) | poucas |

**Por que por clube:** o SQLite do Durable Object cobra por **linha gravada** (US$ 1 por milhão, 50 milhões incluídos por mês). Um jogador por linha, com a condição e o treino mudando todo dia nos 10 mil, daria ~100 mil linhas gravadas por dia e custaria dezenas de dólares por liga ao ano. Com blocos por clube e gravando só os que mudaram, uma liga escreve ~50 mil linhas por temporada.

**Carga por partes.** Cada passo (início de evento, tick diário, virada de um país) monta um **conjunto de trabalho**: o índice (sempre carregado, ~1 MB), os blocos dos clubes das competições que jogam naquela data, os clubes que a IA decide usar no mercado e os envolvidos em transferências. Só os blocos alterados voltam ao SQLite (marcação de sujo). O mercado da IA procura candidatos **no índice** e só abre o bloco do clube que de fato negocia. Condição física, lesões e treino de quem não jogou são aplicados **na carga** ("pôr em dia" desde a última vez): o motor já calcula esses efeitos por dia de forma que se pode repetir `n` dias de uma vez; o teste de aceite é que o mundo em blocos dê **exatamente o mesmo estado** que o mundo em memória com a mesma semente (comparação byte a byte em testes).

### 3.3 Memória (projeção; a B1 mede no Cloudflare)

Limite: **128 MB por Durable Object** (isolate), contando tudo.

| Componente | Estimativa |
|---|---|
| Código do motor e do Worker | ~13 MB (medido no Node; a B1 confere o pacote para o Worker) |
| Índice dos 10.471 jogadores + tabela dos 370 clubes + calendário e `league_state` | ~3 MB, sempre |
| Blocos de clubes de um passo típico (1 a 6 competições jogando: 20 a 120 clubes) | 2 a 7 MB (um clube ≈ 60 KB já em objetos) |
| Partidas lance a lance ao vivo (até 20 simultâneas, com rastro) | ~4 a 8 MB |
| Margem de lixo do JavaScript | +30 a 40 MB no passo mais pesado |
| **Passo típico** | **~25 a 35 MB** |
| **Pior passo (pré-temporada ou virada de um país com 60 clubes)** | **~50 a 60 MB** (a virada é feita **um país por vez**, em passos separados) |
| Mundo inteiro em memória (como hoje, sem blocos) | 37 MB vivos, 114 MB de pico: cabe, sem folga |

Folga contra o limite: **~2×** no pior passo (contra ~1,1× sem blocos). Entre eventos o Durable Object fica adormecido e não ocupa nada.

### 3.4 Processamento

Limite: **30 s de CPU por chamada** no plano pago (configurável até 5 min). Valores medidos no Node; no Cloudflare conto 1 a 1,5×.

| Operação | Frequência | CPU estimada |
|---|---|---|
| Tick diário típico (mundo rápido, treino, IA, carga e gravação de blocos) | 1 por dia real | 0,2 a 0,5 s |
| Pré-temporada de um país (mercado da IA, 14 rodadas de negociação) | 1 por temporada e país | 2 a 5 s (o máximo medido foi 2,2 s por avanço no pacote real) |
| Virada de temporada de um país | 1 por temporada e país | 1 a 3 s |
| Início de evento: montar `MatchInput` + quick de todo o evento (~100 partidas) | 1 por evento | 0,1 a 0,3 s |
| Passo ao vivo (1 minuto de jogo em até 20 partidas lance a lance + snapshots) | 90 por evento | ~5 ms cada (~0,5 s por evento) |
| Comandos (pronto, tática, oferta) | por pedido | 1 a 10 ms |
| Partida lance a lance de um humano, a temporada | ~50 por clube humano | 0,35 s por humano |

**Uma temporada inteira de uma liga online com 6 humanos:** ~19 s do mundo rápido e mercado + ~2 s de partidas humanas + ~25 s de passos ao vivo (≈ 50 eventos × 0,5 s) ≈ **45 s de CPU em ~4 meses reais**. O pior caso de uma única chamada fica em **~3 a 5 s**. Nada se aproxima do limite de 30 s.

**Uma thread por liga.** O Durable Object atende uma coisa de cada vez: um tick de 3 s atrasaria em até 3 s o clique no "Pronto" de quem chegasse naquele momento. Os ticks não rodam dentro de um evento ao vivo (esperam acabar), e os passos pesados são partidos em passos menores (um país por vez).

### 3.5 Custo com 100, 1.000 e 10.000 jogadores ativos

**Suposições:** "ativo" joga ~3 vezes por semana; 30% dos ativos estão em ligas online, com 6 técnicos por liga em média (logo, ligas ≈ ativos ÷ 20); temporada em ~4 meses reais (ritmo Normal); partida ao vivo Normal; mundo de uma liga ≈ 30 MB no SQLite (com histórico compactado); saves na nuvem ~3 MB por pessoa.

| Por mês | 100 jogadores | 1.000 | 10.000 |
|---|---|---|---|
| Ligas online ativas | ~5 | ~50 | ~500 |
| CPU de Durable Objects (ms) | 55 mil | 550 mil | 5,5 milhões (30 milhões incluídos) |
| Tempo de Durable Object ativo (GB-s) | ~9 mil | ~88 mil | ~875 mil (400 mil incluídos) |
| Linhas gravadas no SQLite | 60 mil | 600 mil | 6 milhões (50 milhões incluídos) |
| Armazenamento dos mundos | 0,15 GB | 1,5 GB | ~15 GB (5 GB incluídos) |
| Requisições a Workers/API (tudo) | ~0,3 milhão | ~3 milhões | ~30 milhões (10 milhões incluídos) |
| R2 (saves, pacote) | 0,3 GB | 3 GB | 30 GB (10 GB incluídos, sem custo de saída) |

| | **Custo mensal estimado** |
|---|---|
| **100** | **US$ 5** (plano pago de Workers; todo o resto dentro do incluído) |
| **1.000** | **US$ 5 a 6** |
| **10.000** | **US$ 5 base + ~6 (tempo de Durable Object) + ~2 (armazenamento) + ~6 (requisições) + ~0,3 (R2) ≈ US$ 19; com margem, US$ 15 a 35** |

- **Cada 100 ligas ativas a mais** custam ~US$ 3 por mês (tempo de Durable Object + armazenamento). Liga em **resultado direto** custa quase só o armazenamento.
- **Sensibilidade:** todos os 10.000 em ligas online, com 3 técnicos por liga (3.300 ligas): ~US$ 100 por mês. Ritmo: o tempo de Durable Object por liga e mês sobe com o ritmo (Rápido ~2,3×, Bem rápido ~4,7× o do Normal); 10.000 jogadores com todas as ligas no Bem rápido ficariam em ~US$ 65 por mês.
- **O que faria o custo explodir:** gravar jogadores em linhas separadas todo dia (dezenas de dólares por liga ao ano); por isso "blocos por clube" é requisito, não otimização.
- O **plano gratuito não serve**: o limite de CPU por chamada (10 ms) é menor que o menor tick. O plano pago de US$ 5 vale desde o teste fechado.

### 3.6 Limites que existem e como cada um é tratado

Nenhum impede. Em ordem de risco:

| Limite | Risco | Tratamento |
|---|---|---|
| **128 MB de memória por Durable Object** | Médio (pico de 114 MB se o mundo ficar todo em memória) | Blocos por clube + conjunto de trabalho; folga de ~2×. **Se a B1 medir mais de ~80 MB no pior passo:** dividir o mundo por região em vários Durable Objects (um por continente) com um coordenador, ou usar **Cloudflare Containers** (memória de GB, cobrança por tempo ligado) para a liga |
| **Uma única thread por liga** | Baixo | Passos curtos, um país por vez; ticks não rodam sobre eventos ao vivo; atraso máximo de ~3 s num "Pronto" |
| **Custo de linhas gravadas** | Baixo, se o desenho de blocos for seguido | Blocos por clube, só os alterados, "pôr em dia" na carga |
| **10 GB por Durable Object / 2 MB por linha** | Muito baixo (mundo ~30 MB; bloco de clube ≤ 100 KB) | Arquivo de temporadas passadas compactado |
| **30 s de CPU por chamada** | Muito baixo (pior ~5 s) | Passos por país |
| **Determinismo entre V8 e Safari** | Médio | Cliente não recalcula; B1 mede; `exp/pow` próprios se preciso |
| **Adaptar o motor** (não é limite do Cloudflare) | Alto em trabalho | B5 (mundo em blocos) e B6 (fidelidade por partida, relógio); aceite = mesmo resultado que o mundo em memória |

---

## 4. Carreira solo

### 4.1 Identidade e nuvem

- **Identidade:** no primeiro uso o aparelho cria um par de chaves **Ed25519** (`WebCrypto`, no IndexedDB); a chave pública vira o `playerId`; cada pedido vai assinado. Sem senha e sem e-mail.
- **Código de recuperação** (trocado na seção 23: era de 12 palavras; hoje 20 símbolos de um alfabeto de 31): **deriva a chave** (o servidor não guarda segredo e não consegue recuperá-lo). Trocar de aparelho = digitar o código. **Tela (decisão de 03/11/2026):** aviso claro de que, sem o código, quem perder ou trocar de celular perde a carreira e as ligas; as 12 palavras aparecem na criação e a pessoa só segue depois de digitar 3 palavras sorteadas; depois, o código pode ser visto de novo em Menu › Código de recuperação (escondido até um toque) enquanto o aparelho tiver a identidade. O código fica guardado **neste aparelho** (junto da chave, que já dá o mesmo acesso), nunca no servidor.
- **Apelido:** 3 a 16 caracteres, passa pelo filtro (6.2), único por liga (não global).
- Os 3 espaços de save continuam; cada um ganha o estado de nuvem (só local, sincronizado, enviando, conflito). A nuvem é **opcional por espaço**.

### 4.2 O que sobe e como

- O save já é gravado em pedaços gzip (Fase 2, B4). Na nuvem cada pedaço é endereçado pelo **hash do conteúdo**; o manifesto lista os hashes e uma revisão (`rev`).
- Gravação: o cliente pergunta quais hashes o servidor não tem, envia só esses (~100 a 300 KB num dia comum; o primeiro envio é o save inteiro, 1 a 3 MB) e troca o manifesto com `rev` esperado (nunca sobrescreve às cegas).
- **Frequência:** a cada 2 minutos de uso, ao fim de uma partida ou de um dia de jogos e ao fechar (`sendBeacon`); sem rede, fica numa fila persistente.
- **Cota:** 3 espaços × 5 MB comprimidos por identidade. **Retenção:** 12 meses sem acesso (aviso dentro do jogo nas últimas semanas).
- **Dois aparelhos:** se a `rev` não bate, o jogador vê o resumo do outro ("hoje 21:40, temporada 3, rodada 12") e escolhe: usar a nuvem, usar este (o outro vira cópia por 7 dias) ou manter os dois. Nunca mescla.

### 4.3 Offline primeiro (mudança desta versão)

- **A carreira solo funciona inteira sem internet, como hoje.** O que está no aparelho é a verdade; a nuvem é um espelho.
- **Precisa de internet:** a primeira abertura (baixar o pacote), criar a identidade, as **ligas online** e a sincronização em si. Sem rede o jogo mostra "sem conexão: salvando só neste aparelho" e a fila de envio acumula.
- Ao voltar a conexão, a fila sobe sozinha; se houver conflito (4.2), pergunta.
- A tela de ligas online avisa claramente "exige internet" e não oferece o que não puder usar.

### 4.4 Queda de conexão no meio de uma partida

| Onde | O que acontece |
|---|---|
| **Solo** | Nada: a partida é local. A nuvem só atrasa a subida |
| **Liga online, ao vivo** | A partida **não para**; a IA comanda o time (2.8) e o técnico **volta ao vivo ao reconectar**: o cliente reabre o WebSocket com o último minuto visto e o servidor manda o que perdeu. Comandos não confirmados ficam "pendentes" e caem após 2 minutos |
| **Liga online, fora de partida** | A tática é gravada no servidor a cada mudança confirmada; se cair antes, "não salvo" até reenviar |
| **Resultado direto** | Nada se perde; o relatório fica no servidor |

### 4.5 Migração dos saves atuais

1. Na primeira abertura com nuvem: "Guardar seus jogos na nuvem?" (sim/depois), com o aviso do código.
2. Se sim: cria a identidade e **mostra o código**, exigindo conferência (3 palavras sorteadas).
3. Os saves existentes (`SaveStore` em partes) sobem **como estão**, um espaço por vez, com barra de progresso. `SAVE_VERSION` não muda; o servidor guarda sem abrir o conteúdo. **Nada local é apagado.**
4. Em outro aparelho: digitar o código, ver os espaços, baixar.
5. Exportar/importar JSON (`saveFile.ts`) continua como cópia manual.
6. Sem nuvem ligada, nada muda.

---

## 5. Entrega e atualização do pacote de dados

- **Onde:** R2 em `packages/<id>/<versão>/pacote.json.gz`, com `immutable`, e um `packages/index.json` (versão atual, tamanho, hash, data, créditos, notas). Hoje o arquivo vem junto com o site; o site **mantém uma cópia embutida** como plano B (a primeira abertura offline continua possível se o pacote já estiver no cache).
- **Atualização:** a cada janela de transferências (e quando a equipe corrigir dados) sai uma versão (`2027.01`...). O jogo consulta o índice ao abrir (~200 bytes) e avisa: "Elencos atualizados. Usar em novos jogos."
- **O que muda:** só **novos jogos e novas ligas**. Save e liga em andamento **ficam na versão em que começaram** (já está em `Game.dataPackage`; a liga online guarda a sua). O servidor mantém todas as versões que ainda tenham liga ativa.
- **O servidor da liga online usa o mesmo arquivo** para montar o mundo ao criar a liga (leitura do R2 dentro do Durable Object, ~0,6 s).
- **Integridade:** hash conferido antes de guardar; créditos (CC BY-SA) continuam no campo `credits`.
- Depois (fora da Fase 6): atualizar elencos no meio de uma carreira por importação seletiva.

---

## 6. Segurança e abuso

### 6.1 Limite de pedidos

Por identidade (chave pública) e por IP, janela deslizante; valores iniciais a ajustar na B9:

| Ação | Limite |
|---|---|
| Criar identidade | 30 por IP por dia (nas redes de operadora, CGNAT, muita gente divide o mesmo IP; a proteção principal é o Turnstile) |
| Leituras gerais | 120 por minuto |
| Escritas (tática, oferta, pronto) | 30 por minuto |
| Gravar save na nuvem | 6 por minuto, 200 por dia |
| Criar liga | 3 por dia, 3 ativas |
| Entrar por código errado | 10 por hora |

Mais: regras de limite do Cloudflare, **Turnstile** (gratuito) na criação de identidade e de liga, corpo de pedido ≤ 1 MB (pedaço de save ≤ 300 KB), lista fechada de campos, pedidos assinados com carimbo e `nonce`.

### 6.2 Apelidos ofensivos

- **Filtro** na criação e na troca (`src/online/nameFilter.ts`, puro e testado, reaproveitando `tools/realdata/profanity.ts` e a lógica de `nameScan.ts`): palavrões em português e inglês, normalização (acentos, `0`→`o`, `1`→`i`, espaços, letras repetidas), alfabetos misturados, nomes impessoais ("Admin", "Meu Manager"), links e telefones.
- **O que escapa:** ofensa disfarçada. Defesa: botão **Denunciar** (3 denúncias de pessoas diferentes tiram o apelido e voltam para "Técnico 4821") e o **ADM** pode forçar a troca de apelido na liga.
- Vale também para o nome da liga.

### 6.3 Ligas abertas com gente mal-intencionada

| Problema | Resposta |
|---|---|
| Entrar só para atrapalhar | O ADM remove; o autopiloto impede que um fantasma segure a liga; a data nunca depende de uma pessoa só |
| Ligas-lixo ou com nome ofensivo | Nome filtrado, 3 ligas ativas por identidade, denúncia (3 escondem do diretório até revisão) |
| Fazer uma liga com contas próprias para "ganhar" | Sem classificação global, não há o que ganhar |
| Virar ADM por truque | Só o ADM passa o cargo; a herança é por 14 dias de inatividade, do humano mais antigo, registrada |
| Adivinhar códigos | 8 caracteres de 31 símbolos (≈ 8,5 × 10¹¹) + limite de tentativas; o ADM pode trocar o código ou fechar a entrada |
| Perseguição | Denunciar, bloquear (esconde o apelido do bloqueado), sair; **não há chat nem mensagem privada** nesta fase |
| Conteúdo impróprio | Só texto curto de apelido e nome de liga; denúncia; remoção por quem opera |

Moderação no início: nós, com um painel pequeno de denúncias (B9). Banir identidade = bloquear a chave e o apelido; é fraco, mas basta para o começo.

---

## 7. Privacidade

### 7.1 O que o jogo guarda

| Dado | Onde | Por quê | Por quanto tempo |
|---|---|---|---|
| Identidade: chave pública, apelido, data de criação, última visita | D1 | Reconhecer o aparelho; mostrar nas ligas | Enquanto a conta existir; pode ser apagada 12 meses depois da última visita (limpeza ainda desligada) |
| Código de recuperação | **Só com você e neste aparelho** (nunca no servidor) | Trocar de aparelho; rever pelo menu | Até você apagar a conta ou os dados do navegador |
| Saves da carreira solo (se você ligou a nuvem) | R2, pedaços comprimidos | Continuar em outro aparelho | Até você apagar ou 12 meses sem entrar (limpeza ainda desligada) |
| Ligas online: participantes, clubes, mercado, resultados, o mundo da liga | Durable Object | Fazer a liga funcionar | Enquanto ativa; arquivada 90 dias; depois apagada. Nomes de técnicos em ligas apagadas viram "Técnico removido" |
| Denúncias de transferências (B8.6) | Na própria sala da liga (visíveis ao ADM); o painel de denúncias e bloqueios de identidade é da B9 (D1) | Moderar | Enquanto a liga existir (somem com ela) |
| Endereço IP | **Não fica ligado a conta nenhuma.** Contadores de limite (por IP e por identidade) ficam no Durable Object `Guard` só durante a janela do limite; a limpeza horária (B8.8) apaga todos os vencidos, inclusive de IPs que nunca voltaram | Limitar abuso (ex.: contas novas por IP) | No máximo 24 h |
| E-mail, nome real, telefone, localização, contatos | **Nunca** | — | — |
| Anúncios, rastreadores de terceiros | **Não temos** | — | — |

### 7.2 Aviso de privacidade (texto proposto)

> **Privacidade — Meu Manager**
>
> **O que guardamos.** Para você jogar online, guardamos um **identificador anônimo** do seu aparelho, o **apelido** que você escolher, as **ligas** de que você participa (clube, escalação, negociações e resultados) e, **se você ligar a opção "Guardar na nuvem"**, os seus **jogos salvos**. Nada disso está ligado ao seu nome.
>
> **O que não guardamos.** Não pedimos e-mail, senha, nome real, telefone, localização nem contatos. Não gravamos o seu endereço de IP. Não usamos anúncios nem rastreadores de terceiros.
>
> **Sem internet.** A carreira solo funciona sem internet e os jogos ficam no seu aparelho. Só as ligas online e a cópia na nuvem precisam de conexão.
>
> **Código de recuperação.** Ao criar a conta anônima ela passa a ter um código de recuperação (20 letras e números, como K7QP-9X2M-HT4R-8WZC-3NFB), que você encontra no menu (Online › Código de recuperação) e deve guardar. Ele é a única forma de levar seus jogos para outro aparelho. **Nós não guardamos esse código e não podemos recuperá-lo**; ele fica só no seu aparelho, e você pode revê-lo no menu. Quem tiver o código tem acesso à sua conta; guarde-o em lugar seguro.
>
> **Quem vê o quê.** Os outros jogadores de uma liga veem o seu apelido, o seu clube e o que acontece na liga (jogos e transferências). Ninguém vê os seus jogos salvos da carreira solo.
>
> **Por quanto tempo.** Mantemos a sua conta e os jogos salvos na nuvem por até **12 meses sem você entrar**; depois desse prazo eles podem ser apagados do servidor. Como o jogo não pede e-mail, não temos como avisar você fora do jogo: entre pelo menos uma vez por ano, ou apague tudo quando quiser. **Isso nunca apaga os jogos guardados no seu aparelho**, só o que está na nuvem. (Hoje nenhuma conta é apagada por falta de uso; este aviso só passa a valer quando a limpeza for ligada.) Ligas inativas são arquivadas e depois apagadas. Você pode **apagar tudo agora** em Menu › Privacidade › "Apagar minha conta e meus dados".
>
> **Seus direitos.** Você pode ver, exportar (arquivo `.json`) e apagar seus dados a qualquer momento, sem falar com ninguém. Para denunciar um apelido ou uma liga, use o botão "Denunciar".
>
> **Servidores.** Os dados ficam em servidores do Cloudflare, que também mantém registros técnicos de tráfego. O jogo é independente e gratuito.
>
> **Crianças.** O jogo não pede idade nem dados pessoais; pais e responsáveis podem apagar a conta pelo mesmo botão.
>
> **Mudanças.** Se este aviso mudar, mostraremos o texto novo antes de você continuar.

Antes do lançamento público, o texto precisa ser revisado por quem entenda de LGPD (não é aconselhamento jurídico). "Apagar minha conta e meus dados" e "Exportar meus dados" são itens obrigatórios (B4).

---

## 8. Divisão do trabalho (B1 a B9)

Mesma forma da Fase 2: partes com entrega testável, testes e atualização do `CLAUDE.md`. Depois de cada parte que toca o motor: `npm test` e `test:balance`. **Resultado do jogo solo não pode mudar** (`tests/matchGolden.test.ts` e os testes de longo prazo seguem passando). Tamanho: P pequeno, M médio, G grande, GG muito grande.

| Parte | O que entrega | Fecha |
|---|---|---|
| **B1 — Fundação e medições (M)** | Conta Cloudflare (seção 9), projeto Workers/D1/R2, `src/online/` puro com a interface `LeagueHost`. **Confirma os preços atuais.** Mede no ambiente do Cloudflare (`wrangler dev`/workerd e depois nuvem): memória do mundo real inteiro e do conjunto de trabalho, CPU de um tick e da pré-temporada, bundle do motor, custo de carregar o pacote. Mede V8 × Safari no `matchGolden`. Decide: mundo em um Durable Object ou dividido | Preço, memória, CPU, determinismo |
| **B2 — Identidade (M)** | Chaves no aparelho, pedidos assinados, `playerId`, apelido com filtro e testes, código de recuperação, Turnstile, limites básicos | 4.1, 6.1, 6.2 |
| **B3 — Entrega do pacote (P)** | Pacote versionado no R2 com índice e hash, escolha de versão, aviso de atualização, cópia embutida de reserva | Seção 5 |
| **B4 — Saves na nuvem e solo offline-first (G)** | Pedaços por hash, manifesto com `rev`, fila persistente, conflito entre aparelhos, migração dos saves atuais, cota e retenção, "Exportar meus dados", "Apagar minha conta" | Seção 4 e parte da 7 |
| **B5 — Mundo em blocos no SQLite (GG)** | `WorldStore` (interface) com duas implementações: memória e SQLite. Blocos por clube, índice de jogadores, conjunto de trabalho, marcação de sujo, "pôr em dia" na carga, mercado da IA sobre o índice, virada por país. **Aceite:** mesmo estado que o mundo em memória, byte a byte, com a mesma semente; custo de linhas gravadas e memória medidos contra a seção 3 | 3.2, 3.3, 3.6 |
| **B6 — Relógio da liga e fidelidade por partida (GG)** | Fidelidade por partida (`humanTeamIds`: humano = lance a lance, resto `simulateQuick`), competições com/sem humano, `D`, ritmo, âncoras, faixas e sorteio dos horários, tick diário, resultado direto, **Pronto**, **Avançar**, **Pausar/Retomar** com recálculo dos horários, prazos congelados. Testes com tempo simulado | 2.1 a 2.5 |
| **B7 — Partida ao vivo e ausência (G)** | Ticks por alarme, WebSocket, comandos validados, reconexão, autopiloto/ausente/vaga aberta (abertas) e sugestões ao ADM (amigos), reparo de tática, lesão sem parar o jogo, registro de reprodução e verificação | 2.6, 2.8, 2.9, 4.4 |
| **B8 — Telas e mercado entre humanos (G)** | Criar/entrar na liga (link, código, diretório), escolha de clube em qualquer liga, sala, calendário no fuso local, tela do ADM (faixas, ritmo, remover, pausar), ofertas entre humanos com reserva de dinheiro, histórico de transferências, denúncia, aviso de privacidade | 2.1, 2.7, 6, 7 |
| **B9 — Moderação, carga e teste fechado (M)** | Painel de denúncias e banimento de identidade, limites finais, teste de carga (simular 500 ligas), 50 a 100 pessoas em teste fechado, custo real, revisão do texto de privacidade. Fecha a Fase 6 | 6.3 e custos reais |

Ordem: B1 → B2 → (B3 e B4 em paralelo) → **B5** → **B6** → B7 → B8 → B9. **B1 a B4 já entregam valor sozinhas** (nuvem e pacote servidos). B5 e B6 são o caminho crítico: se a B1 mostrar que a memória é folgada (menos de ~60 MB com o mundo todo), a B5 pode começar mantendo o mundo inteiro em memória e deixar os blocos para depois, mantendo só a regra de gravar por clube.

---

## 9. Contas, cartão, alerta de gasto e endereços

Eu não crio conta nem cadastro cartão; isso é com você. **Nada desta seção começa antes de você e seus sócios decidirem sobre os gastos.**

| Quando | O que | Precisa de cartão? |
|---|---|---|
| **B1, parte local (agora)** | Nada: as medições rodam no computador (workerd, o mesmo ambiente de execução do Cloudflare, instalado por `npm`, sem login) | Não |
| **B1, parte na nuvem** | Criar a **conta Cloudflare** (só e-mail) e testar um Worker de verdade | Não |
| **Fim da B1** | Ativar **Workers Paid (US$ 5/mês)** e o **R2** (o R2 pede cartão cadastrado mesmo dentro dos 10 GB gratuitos) | **Sim** |
| **B2** | **Turnstile** (gratuito) | Não |
| **Perto do lançamento** | **Domínio próprio** (~US$ 10 por ano) | Sim |

**Endereços gratuitos até lá:** a API do Cloudflare fica em `meu-manager.<seu-subdomínio>.workers.dev` (grátis, vem com a conta) e o site em `<usuario>.github.io/<repositório>` (GitHub Pages, grátis). Como são endereços diferentes, a API precisa liberar o endereço do site (CORS), o que entra na B2; o Turnstile e o PWA funcionam com esses endereços (a B2 confirma). O domínio próprio muda só a configuração, não o código.

### Alerta de gasto, passo a passo (para quando chegar a hora)

O Cloudflare **não tem teto rígido de gasto**: ele só avisa. Por isso proponho duas camadas:

1. **Alerta de uso no painel do Cloudflare** (a tela muda de nome com o tempo; quando chegar a hora eu confiro a documentação do momento e passo as telas exatas):
   1. Entre em `dash.cloudflare.com` e abra **Notifications** (Notificações) no menu da conta.
   2. Clique em **Add** (Adicionar) e escolha o tipo de alerta de **uso/cobrança** (*Billing → Usage-based billing*, que avisa quando o gasto previsto do mês passa de um valor).
   3. Digite o valor **US$ 10** (e, se a tela deixar, um segundo alerta em **US$ 7**).
   4. Escolha **e-mail** como destino (use o e-mail do projeto, não o pessoal) e salve.
   5. Em **Billing → Subscriptions**, confira que só existem **Workers Paid** e, se ativado, **R2**.
2. **Cartão com limite** (a única forma de teto de verdade): usar um **cartão virtual com limite mensal** (a maioria dos bancos digitais permite criar um, com valor máximo de, por exemplo, US$ 15). Se o gasto passar do limite, o pagamento é recusado e o Cloudflare suspende o excesso, em vez de cobrar sem parar.
3. **Rotina:** olhar a aba **Analytics / Billing** uma vez por semana no primeiro mês; o teste fechado (B9) mede o custo real e ajusta os limites de pedido (6.1).
4. **Se o alerta disparar:** pausar o que gastou (desligar a liga de teste), ver qual recurso passou (o painel mostra por produto) e só então subir o valor.

## 10. Decisões registradas e o que falta

Todas as decisões da versão 1 e da versão 2 foram respondidas:

1. **Ritmo:** o padrão das ligas abertas é Normal (3 dias de jogo por dia real); o ADM de uma liga de amigos escolhe entre Calmo (2), Normal (3), **Rápido (7)** e **Bem rápido (14)**, e pode usar o Avançar em qualquer um (tabela da seção 2.2).
2. **"Pronto":** espera só os técnicos que têm partida naquele horário (2.4).
3. **B1:** começa pela parte local. A parte que precisa de conta (e depois cartão) **fica parada até você e seus sócios decidirem sobre os gastos**; eu aviso quando chegar nela.
4. **Domínio:** só perto do lançamento; até lá, endereços gratuitos do Cloudflare e do GitHub.

**Pendente (não bloqueia a B1 local):** a decisão dos sócios sobre gastos (US$ 5 por mês de Workers Paid + R2 com cartão, e o domínio no fim).

---

## 11. Resultado da B1, parte local (01/11/2026; sem conta, sem cartão, sem custo)

Tudo rodou no computador de desenvolvimento (Windows, 6 GB), com o **workerd** (o ambiente de execução do Cloudflare) instalado por `npm` em `tools/online-lab/` (pacote à parte, não mexe nas dependências do jogo; `wrangler dev --local` não pede login). Nada foi enviado para fora.

**Ferramentas criadas:** `tools/online-lab/` (`src/worker.ts`: o motor e o mundo real dentro do workerd, rotas `/load` e `/advance`; `measure.mjs`: joga uma temporada e mede; `determinism/`: compara V8 × WebKit), `tools/onlineMem.ts` (`node --expose-gc --max-old-space-size=N tools/run.mjs onlineMem`: o mundo real inteiro em memória com teto de heap). Nenhum arquivo do motor ou do jogo foi alterado.

| Medida | Resultado |
|---|---|
| **O motor roda no workerd?** | **Sim**, sem mudar uma linha: `createGame`, `advanceGame`, `simulateMatch` com o pacote real (370 clubes, 10.471 jogadores) |
| Tamanho do Worker | 5,5 MB sem comprimir / **0,9 MB com gzip, já com o pacote de 5,1 MB dentro**; o motor sozinho é ~0,5 MB (limite do Cloudflare: 3 MB no gratuito, 10 MB no pago). Na liga online o pacote vem do R2, não do bundle |
| Montar o mundo real a partir do pacote | **0,8 s** (visto de fora, com a ida e volta da requisição) |
| Uma temporada no workerd (146 avanços úteis) | **~29 s**, avanço mediano 9 ms contando os de mercado, p95 181 ms, **pior 1,5 s** (o primeiro): igual ao Node (25 s, Fase 5D). **Hipótese de 1 a 1,5× para o Cloudflare: confirmada (~1,1×)** |
| **Memória: mundo inteiro em memória, temporada completa, com teto de heap do V8** | Passa com **teto de 128, 96 e 64 MB**; **estoura com 48 MB**. Heap vivo: 31 MB depois de criar, ~50 MB no fim. O pico lido (`heapUsed`, que inclui lixo ainda não coletado) fica em 103 a 126 MB, mas o V8 coleta antes de bater o teto |
| Memória do processo workerd (visto do sistema) | 160 a 175 MB parado, ~410 MB no pico: **não serve** como medida do isolate (inclui o próprio workerd e lixo); o workerd local também não aplica o limite de 128 MB do Cloudflare |
| **Determinismo V8 × WebKit** | **4.020 partidas (uma delas 20 ao vivo com mudança tática): 0 diferenças** entre Node (V8), Chromium (V8) e WebKit (JavaScriptCore, o motor do Safari). **Mas** 7 de 65 valores de `Math.exp`/`Math.pow` diferem nos últimos bits entre o Node e os dois navegadores |

**O que isso muda na proposta**

1. **Memória.** O mundo real inteiro, em memória, cabe com folga bem maior do que eu estimava: o conjunto vivo é de ~50 MB e a temporada passa com teto de heap de 64 MB. Os blocos por clube no SQLite **deixam de ser necessários para caber** na memória e continuam necessários para o **custo** (gravar por clube, não por jogador: seção 3.5) e para a liga poder dormir entre eventos. A B5 pode então ser feita **em duas etapas**: (1) o mundo inteiro em memória, carregado do SQLite no início de cada passo e gravado por clube no fim; (2) a carga por partes, só se a medição no Cloudflare real mostrar necessidade. A medição final de memória do isolate **só existe na nuvem** (parte B1 que precisa de conta); até lá, a margem estimada é de ~2× (heap vivo ~50 MB contra 128 MB).
2. **CPU.** Os tempos do workerd são os do Node × ~1,1. A estimativa da seção 3.4 (1 a 1,5×) fica, com o centro em 1,1×.
3. **Determinismo.** As partidas iguais em três motores são uma boa notícia, mas os bits de `exp/pow` realmente diferem, então **mantenho a decisão: o cliente online nunca recalcula, o servidor é a única fonte**. Com esse resultado, trocar `exp/pow` por implementação própria **não é obrigatório**; vira uma proteção opcional (uma vez só, antes do lançamento) porque uma diferença de 1 bit só muda uma partida se cair exatamente em cima do ponto de decisão de um sorteio. Teste usado: WebKit do Playwright no Windows (JavaScriptCore, mas não o Safari do iPhone em si); vale repetir em iPhone real na B9.
4. **Tamanho do Worker** cabe nos dois planos.

---

## 12. Resultado da B1, parte na nuvem (03/11/2026; conta Cloudflare com Workers Paid de US$ 5 e R2 ativado)

**Como foi feito.** Um Worker de laboratório (`tools/online-lab/src/cloud.ts`, `wrangler.cloud.toml`) com um Durable Object com SQLite e um bucket R2, todos com prefixo `lab-`. Só respondia com uma chave aleatória (cabeçalho `x-lab-key`, guardada fora do repositório). Os testes duraram poucas horas, geraram um uso pequeno (pelas contas, dentro das franquias incluídas; **a confirmação é a tela Billable Usage do painel, que eu não vejo**) e **tudo foi apagado no fim** (Worker, Durable Object, segredo, bucket). Ficaram no repositório só o código e os scripts `measure-cloud.mjs` e `ceiling-cloud.mjs`. Os tempos abaixo são **medidos do computador de desenvolvimento, com a rede incluída**: são um teto para a CPU real, não a CPU em si.

| Medida | Resultado |
|---|---|
| Publicação | Worker de 5,5 MB (0,9 MB com gzip), **início em 24 ms** (limite: 1 s) |
| Carregar o mundo real e gravá-lo no SQLite | **1,1 a 1,9 s** (480 blocos, 11,4 MB de JSON, banco de 12,2 MB) |
| Temporada completa, só o motor | **~40 s no total, 147 avanços**; por avanço: mediana 225 ms, p95 ~615 ms, **pior ~1,1 s**. Com 30 s de limite por chamada, a folga é de ~25× |
| Temporada completa, gravando no SQLite a cada avanço | ~90 s no total (mediana 580 a 730 ms por avanço, pior 1,8 s). A gravação custa ~350 ms por avanço porque este teste serializa e compara o mundo inteiro (8 MB) a cada avanço; **a B5 deve rastrear o que mudou** em vez disso |
| Linhas gravadas por temporada de uma liga | **42.496** (mediana 292 de 480 blocos por avanço, porque o treino mexe em todo mundo todo dia). A estimativa da seção 3.5 (~48 mil por liga e temporada de 4 meses) **se confirmou** |
| Banco da liga ao fim de uma temporada | **20,9 MB** (estimativa era 30 MB) |
| Custo de uma gravação no SQLite | Tabela com `WITHOUT ROWID`: **1 linha gravada por bloco** (2 se a chave for um índice à parte); uma linha de 1,5 MB conta como 1. **Decisão para a B5: `WITHOUT ROWID`.** |
| R2 | Gravar e ler 2,5 MB (um save) em 0,95 s |
| Estabilidade | cerca de 20 temporadas completas, todas sem erro, **menos uma**: numa corrida o objeto reiniciou no fim da temporada e perdeu o estado em memória (o SQLite estava intacto). Não repetiu em ~20 corridas. **A plataforma pode reiniciar um Durable Object a qualquer momento**; o desenho precisa recarregar tudo do SQLite, e isso entra no aceite da B5 |

**Memória real: o que foi e o que não foi medido.**
- `process.memoryUsage()` devolve **zeros** no Cloudflare, então não existe leitura direta. A medição foi pelo **teto**: reservar uma quantidade conhecida de memória no heap (blocos calibrados de 0,755 MB, medidos no Node), carregar o mundo (~50 MB vivos) e jogar a temporada, com e sem gravação.
- **Passou** com até ~150 MB de lastro + o mundo (~200 MB de heap no total), com e sem gravação em SQLite. Com ~225 MB de lastro o objeto reiniciou, e com mais deu erro 500.
- **Leitura honesta:** a documentação fala em 128 MB por isolate e **não vi esse limite sendo aplicado a 128 MB** neste teste. Não vou apoiar o projeto nisso: o limite documentado é o que vale, a plataforma pode aplicá-lo de outra forma depois, e o teste foi com um único objeto, sem concorrência. O que o teste prova é que o mundo real (~50 MB) tem folga confortável mesmo no limite documentado, e que **não precisamos dividir o mundo em vários objetos nem usar Containers**. A etapa 2 da B5 (carga por partes) fica de fora a menos que a B9, com liga cheia, mostre o contrário.

**Preços conferidos nas páginas oficiais (todas atualizadas entre 2 e 30/10/2026).**

| Produto | Incluído no plano de US$ 5 | Acima disso |
|---|---|---|
| Workers | 10 milhões de requisições, 30 milhões de ms de CPU | US$ 0,30 por milhão de requisições; US$ 0,02 por milhão de ms de CPU; sem custo de saída; limite de CPU por chamada: 30 s (configurável até 5 min) |
| Durable Objects, requisições | 1 milhão | US$ 0,15 por milhão |
| Durable Objects, tempo ativo | 400 mil GB-s | US$ 12,50 por milhão de GB-s (cobra 128 MB por objeto, usando ou não) |
| SQLite, linhas gravadas | 50 milhões | US$ 1,00 por milhão |
| SQLite, linhas lidas | 25 bilhões | US$ 0,001 por milhão |
| SQLite, armazenamento | 5 GB-mês | US$ 0,20 por GB-mês |
| R2 (Standard) | 10 GB, 1 milhão de gravações (Class A), 10 milhões de leituras (Class B) | US$ 0,015/GB-mês; US$ 4,50 e **US$ 0,36** por milhão; saída grátis |
| D1 (identidades, diretório) | 5 GB, 50 milhões de linhas gravadas | US$ 0,75/GB-mês |

- O painel mostrou **US$ 0,35** por milhão de leituras no R2, contra US$ 0,36 da documentação; a diferença é irrelevante.
- A página dos Durable Objects ainda diz que a cobrança de armazenamento do SQLite "será ligada em janeiro de 2026". A data já passou, então **trato como ligada** (conta: US$ 0,20 por GB-mês, ~US$ 0,004 por liga e mês).

**O que isso muda na proposta**

1. **Custo.** As estimativas da seção 3.5 **se mantêm**: linhas gravadas e armazenamento confirmados, preços iguais. O ponto sensível é o **tempo ativo do Durable Object**: a seção 3.5 supõe ~4 h por liga e mês. Se uma liga ficar acordada 1 h por dia (por exemplo, com WebSocket aberto o dia todo), o custo é de ~US$ 0,17 por liga e mês (13.500 GB-s), ou ~US$ 17 por 100 ligas. Por isso, **conexões ao vivo só durante eventos, e hibernação de WebSocket** entram no aceite da B7.
2. **Memória.** Risco da seção 3.6 passa de "médio" para **baixo**; a decisão "dividir por continente / Containers" fica descartada por enquanto.
3. **CPU.** Sem risco: o pior avanço medido, mesmo com a rede, é ~1,1 s contra 30 s.
4. **Gravação.** A B5 grava só o que mudou (rastreamento de alterações), em tabela `WITHOUT ROWID`, e recarrega tudo do SQLite se o objeto reiniciar.
5. **Endereço gratuito.** O subdomínio foi trocado para `meumanager.workers.dev` e conferido no painel (03/11/2026). Faturamento depois dos testes: US$ 0,00, nenhum uso faturável; R2 sem buckets.

**B1 concluída.** Próximo: B2 (identidade), quando você mandar.

---

## 13. Andamento da B2 (03/11/2026)

**Feito e testado, sem nuvem:** código de recuperação de 12 palavras que deriva a chave Ed25519; `playerId`; pedidos assinados com relógio e nonce; limites da seção 6.1; filtro de apelidos; registro de identidade com Turnstile e limite por IP (lógica pura); armazenamento da chave no aparelho (banco IndexedDB separado dos saves). **Mudança em relação à proposta:** a chave não usa WebCrypto, e sim `@noble/curves` (com `@noble/hashes` e `@scure/bip39`), porque o WebCrypto só tem Ed25519 em navegadores recentes (Chrome 137+, Safari 17+) e não deriva a chave das palavras; as bibliotecas funcionam em celulares mais antigos.

**B2 concluída em 03/11/2026, inclusive na nuvem.** Worker `meu-manager-api`, banco D1 `meu-manager`, Durable Object `Guard` (limites e nonces em disco, 8 fatias) e Turnstile em modo Gerenciado (hosts autorizados: o GitHub Pages do projeto e `localhost`). Testes: `tools/identitySmoke.ts` passou local (9 verificações, inclusive o limite de criações por IP), na nuvem com desafio falso (403, falha fechada, CORS só para o site) e na nuvem com um desafio de verdade clicado por uma pessoa (201, `/api/me`, replay recusado, apelido proibido recusado). A identidade de teste foi apagada do banco.

**Limite de criação de identidades (decisão de 03/11/2026):** subiu de 5 para **30 por IP por dia**, porque em redes de operadora (CGNAT) muita gente divide o mesmo IP e 5 bloquearia grupos de jogadores; o Turnstile é a proteção principal. O limite conta toda tentativa, inclusive as recusadas. A B9 reajusta com dados do teste fechado.

---

## 14. Andamento da B3 (03/11/2026)

**Feito e testado, sem nuvem:** índice com hash, comparação de versões, download com conferência de tamanho e SHA-256 (o arquivo só é guardado depois de conferido e aberto), guarda no aparelho (2 versões, banco separado), aviso "Elencos atualizados" no menu, seletor de versão em Novo jogo, ferramenta `publishPackage` (arquivo gzip determinístico, índice com todas as versões, recusa refazer uma versão publicada) e rotas do Worker para servir tudo do R2. Teste de ponta a ponta contra o Worker local com R2 simulado (`tools/packageSmoke.ts`): 13 verificações, inclusive baixar e abrir os 370 clubes e 10.471 jogadores em ~115 ms. **Medida:** o pacote real tem 4,89 MB de JSON e **0,71 MB comprimido**.

**Decisões:** o arquivo comprimido é servido como `application/gzip` e sem `Content-Encoding`, para o navegador não descomprimir sozinho e o hash do índice valer para os bytes baixados. O índice não é assinado (protege contra download quebrado, não contra o servidor trocar o arquivo; como o servidor é nosso e a versão só vale para jogos novos, o risco é baixo; assinar o índice com uma chave nossa fica como melhoria). O Cache API do Cloudflare não funciona em `workers.dev`, então cada download lê o R2 (custo de leitura desprezível: 10 milhões incluídos).

**Publicado na nuvem (03/11/2026):** bucket R2 `meu-manager-pacotes` criado, Worker republicado com o binding `PACKAGES` e `mundo-real@2026.11` (743.794 bytes) enviado, o arquivo primeiro e o índice depois. `packageSmoke` contra `meu-manager-api.meumanager.workers.dev`: 13 verificações ok (cabeçalhos, recusas 404/405, CORS, download de 522 ms com hash conferido, 370 clubes e 10.471 jogadores idênticos). Uso: 0,71 MB de 10 GB, 2 operações de escrita e algumas de leitura contra 1 milhão e 10 milhões incluídos; custo esperado US$ 0. A cópia embutida no jogo tem a mesma versão (2026.11), então hoje ninguém vê aviso de atualização.

---

## 15. Andamento da B4 (04/11/2026)

**Feito, testado e publicado na nuvem (a interface ainda não existe):**
- **Servidor** (`src/online/cloudSave.ts`, `cloudSaveApi.ts`, `server/worker.ts`): bucket R2 **privado** `meu-manager-saves` (sem domínio público e sem `r2.dev`, conferido por `wrangler r2 bucket dev-url get` e `domain list`); só o Worker lê e grava, e só depois de limite, assinatura e cadastro. Cada pedaço do save fica em `u/<jogador>/<espaço>/b/<hash>` (o servidor confere o SHA-256 do que chega), o manifesto em `m.json` com `rev`. Rotas: `GET /api/saves`, `GET /api/saves/<n>`, `POST .../missing`, `PUT/GET .../blob/<hash>`, `PUT .../manifest`, `DELETE /api/saves/<n>`, `GET /api/account/export`, `DELETE /api/account`. O dono é sempre quem assinou (o caminho nunca escolhe o jogador).
- **Dois aparelhos:** o manifesto só troca se a `rev` que o aparelho conhecia é a atual, e a gravação no R2 é condicional no etag (duas gravações ao mesmo tempo: só uma vence). Quem perde recebe o resumo do outro e escolhe **usar a nuvem** (o que havia no aparelho vira cópia local por 7 dias, com desfazer), **usar este** (a versão da nuvem fica como cópia no servidor por 7 dias) ou **manter os dois** (a da nuvem desce para um espaço livre do aparelho). Nunca mescla; nada é enviado enquanto há conflito.
- **Nunca perder o local:** enviar só lê (`SaveStore.exportRaw`); rede caída, servidor fora, cota ou limite deixam o espaço "pendente" com o motivo, e a fila é o próprio estado guardado (gravação local diferente da que subiu), então sobrevive a fechar o jogo. Baixar confere o hash de cada pedaço antes de tocar no local; a troca é uma transação só (`importRaw`). Save da nuvem de versão mais nova que a do jogo não é aberto.
- **Migração:** ligar a nuvem num espaço não altera nem apaga nada local. Save no formato antigo (tabela `games`) é dividido em memória para enviar; a linha antiga continua lá. O estado da nuvem fica em outro banco do navegador (`meu-manager-nuvem`), então o esquema dos saves não mudou.
- **Agendamento** (`CloudScheduler`): no máximo um envio a cada 2 minutos por espaço, `flush` na hora (fim de partida, fim de dia de jogos, aba indo para segundo plano, internet de volta); falhas espaçam as tentativas (30 s, 2 min, 10 min, 30 min). **Desvio da proposta:** `sendBeacon` não permite o cabeçalho de assinatura; no fechamento vale o `flush` ao ir para segundo plano.
- **Cota e retenção:** 5 MB comprimidos por espaço (a soma que vale é a que o servidor vê). Pedaços sem manifesto saem depois de 10 minutos. **A limpeza por 12 meses sem acesso NÃO está ligada** (decisão de 04/11/2026): a tarefa diária que existia foi retirada do Worker, porque o aviso dentro do jogo nunca chega a quem sumiu (abrir o jogo já renova o prazo) e não há e-mail para avisar fora dele. Só quem possui a conta a apaga ("Apagar minha conta"). Quando houver um canal de aviso (ou uma regra aprovada pelos sócios e revisada para a LGPD), a limpeza volta: só apagará **dados do servidor** (cadastro e saves na nuvem; os saves guardados no aparelho nunca são tocados, pois o servidor não tem acesso a eles) e só de contas que tenham registro de aviso entregue; `listInactive` e `deleteAccountData` já existem para isso. `GET /api/saves` devolve `expiresAt` para o aviso. "Exportar meus dados" e "Apagar minha conta" existem como rotas e no cliente (`CloudSync.exportAccount`, `deleteAccount`).
- **Limites** (`rateLimit.ts`): `saveUpload` 6/min e 200/dia **por identidade** (só a gravação do manifesto); `saveBlob` 300/min e 2.000/dia por identidade; **por IP** valem tetos bem maiores (`saveUploadIp` 300/min, `saveBlobIp` 3.000/min), porque muita gente divide o mesmo IP nas operadoras (com o teto igual ao da identidade, 7 pessoas no mesmo IP travariam umas às outras). `deleteAccount` 3/dia.

**Medido (Cloudflare real, `node tools/run.mjs cloudSaveSmoke <url> cloud`):** save de um clube no começo = 36 pedaços, 294 KB comprimidos (um save do fim de temporada deve ficar em ~1 a 2,5 MB). Primeiro envio 8 s, envio de um dia depois 4,7 s, em segundo plano (a latência de cada pedido autenticado era de 0,8 a 1,7 s antes de juntar as idas ao servidor que não dependem uma da outra; a base da rede até o Worker é ~340 ms). O teste cobre envio, outro aparelho, conflito, "usar este", cópia no servidor, recusas, exportação e apagar a conta; no fim o bucket e o banco ficaram vazios.

**Falta:** a interface (ligar a nuvem num espaço, estado de cada espaço, tela de conflito, criar identidade com Turnstile e mostrar o código de recuperação, exportar e apagar a conta, aviso de conta perto de vencer). O jogo publicado não muda enquanto isso: nada do código novo é carregado pela tela atual.

---

## 16. Andamento da B5 (04/11/2026): mundo em blocos no SQLite, etapa 1

**Decisão de escopo.** A B1 mostrou (seção 12) que o mundo real inteiro cabe na memória com folga, então a B5 sai em duas etapas, como a seção 11 já previa. **Esta é a etapa 1:** o mundo inteiro é carregado do SQLite em memória no início do passo e gravado por blocos no fim. A etapa 2 (carga por partes, "pôr em dia" na carga, mercado da IA sobre o índice) **não foi feita** e só entra se a medição de memória no Cloudflare ou a B9 pedirem.

**O que foi feito (`src/store/worldStore.ts`, `saveParts.ts`):**
- **`WorldStore`** (interface: `load()` e `save(estado)`) com `MemoryWorldStore` (o mundo como o motor usa hoje, o mesmo objeto) e `SqliteWorldStore` (em cima do `SqlLike` do Durable Object, com `transaction`, que no Cloudflare é `ctx.storage.transactionSync`).
- **Blocos = os pedaços do save.** `planSeasonParts(temporada)` divide a temporada nos mesmos pedaços que o save do jogador já usa (campos soltos, calendário, mercado, treino e, por liga ou grupo de rodadas, partidas, times, jogadores e base). Em vez de blocos por clube, **blocos por liga**: o SQLite do Durable Object cobra por linha, não por byte, e o treino altera todo mundo todo dia, então menos linhas maiores saem mais baratas. Os blocos por clube só ajudariam a carga por partes (etapa 2). A refatoração de `saveParts.ts` não muda o que o save do jogador grava (`tests/saveParts.test.ts` continua igual).
- **Bloco sujo sem serializar:** como o motor é imutável, o que não mudou tem a mesma referência; a gravação compara referências e escreve só os blocos alterados.
- **Tabela `world_part (name, seq, data) WITHOUT ROWID`**: uma linha por bloco (texto maior que 500 mil caracteres é repartido em linhas, para respeitar os 2 MB por linha). A gravação é **uma transação só**; se o objeto cair no meio, o mundo anterior continua inteiro (testado). Depois de um reinício, `load()` remonta tudo e deixa pronto o que não mudou, então o primeiro `save` não regrava o mundo inteiro. Formato desconhecido ou linha faltando é recusado, não carregado errado.

**Aceite (testes, `tests/worldStore.test.ts`, 10 testes):** com reinícios no meio (descarta tudo, recarrega do SQLite e segue dali), o mundo termina **idêntico, byte a byte (texto com chaves ordenadas)**, ao que ficou só em memória, também numa temporada inteira com a virada de temporada. Também: o mesmo mundo não grava linha nenhuma; falha no meio da gravação não corrompe; texto grande, pedaço que encolhe ou some; formato e linhas faltando.

**Medido com o mundo real (370 clubes, 10.471 jogadores; `PACOTE_REAL=1 node --expose-gc tools/run.mjs worldStoreRun`, `node:sqlite`, uma temporada de 162 avanços até a virada):**

| Medida | Resultado |
|---|---|
| Linhas gravadas por temporada | **10.578** (mediana 55 por avanço, p95 160, máximo 224), contra 42.496 da medição da B1 com blocos por clube. Uma liga fica em ~0,02% da franquia de 50 milhões por mês |
| Primeira gravação | 197 pedaços, 204 linhas, 11,2 M de caracteres, 138 ms |
| Maior pedaço | 903 KB de texto (limite de uma linha: 2 MB; o teste exige menos de 1,5 MB) |
| Gravar um avanço | mediana 124 ms, p95 153 ms, pior 176 ms |
| Carregar o mundo do SQLite (reinício) | 140 a 176 ms |
| Motor por avanço | mediana 162 ms, pior 4,9 s (a virada de temporada; limite de 30 s) |
| Banco ao fim da temporada | 218 linhas, 15,5 M de caracteres |
| Reinícios simulados (a cada 40 avanços) | 4 de 4 idênticos |

**Limites desta medição.** Foi no Node (V8) com o `node:sqlite`; os tempos no workerd devem ser parecidos (B1: ~1,1×), mas **a memória e o tempo reais só existem no Cloudflare**. Também falta o desenho do Durable Object da liga em si (rotas, alarmes, humanos no mundo), que é a B6/B7; aqui só existe o armazenamento.

**Resultado no Cloudflare real (04/11/2026; Worker de laboratório `lab-meumanager-b5` com um Durable Object, usando o `SqliteWorldStore` do projeto; apagado no fim):** uma temporada do mundo real (370 clubes, 10.471 jogadores, 162 avanços até a virada).

| Medida | Resultado |
|---|---|
| Linhas gravadas por temporada | **10.578** (mediana 55 por avanço, p95 160, máximo 224): **idêntico ao Node**, como esperado |
| Mundo em memória = mundo no SQLite | **idêntico em todas as conferências** (a cada 40 avanços e no fim) |
| Reinício simulado (descarta a memória e recarrega do SQLite) | 4 de 4 idênticos; **só a carga, com a rede: 455 a 670 ms** |
| **Reinício real** (`ctx.abort`: o contador de nascimentos do objeto subiu e a memória veio vazia) | o mundo recarregado do SQLite saiu **idêntico** ao de antes; a recarga mais a comparação com o banco levou ~3,2 s (a comparação é a maior parte) |
| Tempo por avanço visto de fora (inclui a rede) | mediana 0,95 s, p95 3,4 s, **máximo 10,7 s** (o avanço da virada de temporada, que sozinho no Node levou 4,9 s) |
| Carga inicial (criar o mundo e gravar) | 2,0 a 2,4 s |
| Banco ao fim da temporada | 16,7 MB |

**Memória (pelo teto, porque `process.memoryUsage()` devolve zeros no Cloudflare; lastro de 0,755 MB por bloco, medido no Node).** Sem lastro e com 80 blocos (~60 MB) a temporada passou **sem nenhum reinício**. A partir de 100 blocos (~75 MB) a plataforma começou a reiniciar o objeto no meio da temporada (uma vez em 100, 115, 130 e 180 blocos). **Nos cinco casos a liga se recuperou sozinha**: o objeto novo recarregou o mundo do SQLite e a temporada terminou (162 avanços), sem erro de dado (a perda de uma resposta foi só uma falha de rede do cliente de teste durante o reinício). Leitura: **esta vez o teto apareceu perto do limite documentado de 128 MB**, diferente da B1 (que passou com ~200 MB). Mundo vivo + gravação (os textos dos blocos alterados existem ao mesmo tempo que os objetos) + lastro de ~75 MB já estoura, então o pico do mundo gravando é de ~50 a 70 MB e a folga real contra os 128 MB é de **~1,8 a 2,5×**, bem perto do ~2× projetado na seção 3.3. **Isso mantém a decisão: sem carga por partes por enquanto (etapa 2 adiada), mas sem folga para crescer.** Se o pacote real crescer muito (mais ligas ou clubes) ou se a B6/B7 puser estruturas grandes em memória (partidas ao vivo com rastro, humanos), a etapa 2 volta a ser necessária. A B9 repete esta medição com a liga cheia.

**O que foi apagado:** o Worker `lab-meumanager-b5` (e com ele o Durable Object, o SQLite e o segredo `LAB_KEY`) e a chave local. Conferido: a URL do laboratório responde 404; restam na conta só os buckets `meu-manager-pacotes` e `meu-manager-saves`, o banco D1 `meu-manager` e o Worker `meu-manager-api`. **O uso é desprezível** (cerca de 10 temporadas jogadas, ou seja, ~100 mil linhas gravadas no total (contra 50 milhões incluídos)); a confirmação é a tela de faturamento do painel, que eu não vejo.

**B5 (etapa 1) concluída.**

---

## 17. Decisões pendentes para perto do lançamento

1. **Limpeza de contas sem uso e e-mail opcional (decisão de 04/11/2026: deixar desligada por enquanto).** Ligar ou não a limpeza de cadastro e saves na nuvem após 12 meses sem acesso. Sem um canal de aviso, ela não pode ser ligada com segurança (quem some nunca vê o aviso do jogo). Opções: (a) manter desligada e só apagar quando a pessoa pedir; (b) um **e-mail opcional** para avisos (e só avisar quem informou), o que muda o aviso de privacidade (passa a haver dado pessoal), pede consentimento claro, forma de remover o e-mail e ajuste dos textos; (c) uma regra aprovada pelos sócios. Em qualquer caso, a limpeza só apagaria dados do servidor (nunca saves do aparelho) e só contas com aviso entregue. **Decidir junto com a revisão da LGPD**, antes do lançamento público; o texto do aviso de privacidade (seção 6) já diz que a limpeza está desligada.
2. **Revisão da LGPD** do aviso de privacidade completo (já exigida na seção 6).
3. **Medição de memória com a liga cheia** (B9) e, se a folga de ~2× diminuir, a etapa 2 da B5 (carga por partes).

---

## 18. Andamento da B6 (04/11/2026): relógio da liga e fidelidade por partida

**Prova de que o jogo solo não mudou.** Antes de mexer no motor gravei a impressão digital (SHA-256 do estado inteiro) de carreiras solo com semente fixa, pelo caminho real do jogo (avançar, partidas do técnico no automático, fim da temporada, virada e temporada seguinte): `tools/soloDigest.ts` e `tests/fixtures/solo-digest.json` (gerado na `main`, commit anterior a qualquer mudança do motor). `tests/soloUnchanged.test.ts` roda os mesmos cenários e compara; passa. Além disso comparei a **`main` e a branch lado a lado**, cada uma na sua pasta, com o mesmo roteiro: **resultados idênticos no mundo fictício (3 cenários) e no mundo real (370 clubes, com copas)**, nos 5 pontos de cada carreira. A suíte de equilíbrio deu os mesmos números nas duas (ver abaixo).

**O que existe (`src/engine/league/`, `src/engine/teamRef.ts`):**
- **Fidelidade por partida** (`AdvanceOptions.humanTeamIds`): partida de clube humano **não é simulada pelo avanço** (fica em `pendingHumanMatches`, para a liga jogá-la lance a lance e registrá-la com `completeMatch`); **todas as outras partidas do mundo, em qualquer divisão e copa, usam `simulateQuick`**. `humanMatchInput` monta a entrada da partida (escalação salva e consertada de cada humano; a IA do motor não mexe nos times humanos; quem está ausente ou em autopiloto passa à IA completa). Sem `humanTeamIds` o avanço é o de sempre.
- **A IA não toca nos clubes humanos** no mercado (compras, vendas, anúncios, pré-contratos), nos contratos que vencem no meio da temporada, no treino e nas finanças: `TeamRef` (um clube ou um conjunto) generaliza o "clube protegido", que antes era um só. Com uma string tudo é como antes (prova acima).
- **Relógio** (`clock.ts`, `pace.ts`): `D` com fração de dia; ritmos Calmo 2, Normal 3, Rápido 7 e Bem rápido 14 dias por dia real; eventos (datas com partida de humano) e âncoras (último dia da temporada de cada país); horário de cada evento sorteado na faixa (futebol clássico, só à noite, só fim de semana ou personalizada) com a semente da liga: nunca o mesmo horário duas vezes seguidas se há outra opção, mínimo de 8 h (6 h no Bem rápido) e no máximo 36 h de atraso, com cascata; `D` é interpolada entre os eventos e **nunca passa da data do próximo evento antes do início dele**. A pausa congela `D` e o relógio dos prazos; a retomada **refaz os horários futuros a partir de agora**; a pausa dura no máximo 30 dias (depois a liga volta sozinha).
- **Orquestrador** (`runner.ts`, `processLeague`): idempotente e puro (o estado da liga é só dado e vai e volta por JSON). A passagem diária (4h locais) leva o mundo à data devida de `D` (competições sem humano em modo rápido, treino, condição, finanças, mercado da IA, virada dos países); o evento começa no horário, quando todos os que têm partida deram **Pronto** com a sala aberta (5 min antes) ou pelo **Avançar** do ADM (os horários seguintes não mudam; `previewAdvance` diz quem não está pronto). Ausente e autopiloto contam como prontos. O **resultado direto** simula e fecha o evento na hora; no modo ao vivo o evento fica aberto até a B7 entregar os resultados em `submitResult`. `nextWakeup` diz quando acordar a liga (alarme do Durable Object). Os prazos (`deadlineIn`, `deadlineLeft`) congelam na pausa sozinhos.
- **Testes com tempo simulado:** `tests/humanFidelity.test.ts` (5), `tests/leagueClock.test.ts` (16), `tests/leagueRunner.test.ts` (11), `tests/soloUnchanged.test.ts` (3).

**Memória (mundo real, 370 clubes, 200 dias de jogo; `PACOTE_REAL=1 node --expose-gc tools/run.mjs leagueMemRun --mode solo|league`, no Node):**

| | Solo (referência) | Liga online (4 humanos em 4 países, resultado direto) |
|---|---|---|
| Heap vivo no fim (depois do coletor) | 48 MB | 50 MB (**+2 MB, +4%**) |
| Pico entre passos (com lixo ainda não coletado) | 132 MB | 153 MB |
| Texto do mundo no fim | 16 MB | 17 MB |
| Tempo | 20 s | 28 s (87 dias reais em passos de 2 h) |

O mundo não ganhou nenhum dado novo (o estado da liga ocupa ~11 KB); o aumento vem de o mercado da IA negociar em todos os clubes a cada rodada (no solo, só 1 em cada 6 clubes de fora do foco age): o histórico de transferências fica com o dobro (360 contra 168 no mesmo período). **Não é um crescimento importante**: a folga contra o limite do Cloudflare (~2×, seção 16) fica na mesma. O pico "com lixo" é o do Node sem pressão de memória; o coletor recolhe isso quando o isolate aperta.

**Equilíbrio (`npm run test:balance`, 16 arquivos, 102 testes): 100 passam e 2 falham, e as duas falhas já existem na `main`, com os mesmos números:**
1. `tests/balance/leagues.test.ts`: a distância de força entre a Série B e a C do Brasil deu 5,98 (limite: acima de 6).
2. `tests/balance/packageLeagues.test.ts`: `team-304` terminou com 7 estrangeiros no elenco (limite do clube: 6).

Rodei as duas na `main` (commit da B5) e deram **exatamente os mesmos valores**, o que também confirma que o motor solo não mudou. Não mexi nelas (mexer seria alterar o equilíbrio do jogo); ficam registradas para decidir à parte.

**Limitações conhecidas (ficam para a B7/B8):**
1. **A virada de temporada dos países trata os clubes humanos pela regra da IA** (contratos que vencem, elenco, base, tática, meta): `advanceSeason` aceita um clube do jogador, não vários. A B8 precisa decidir o que cada técnico decide na virada.
2. **Janelas de transferência não são âncoras de `D`**: a data fica interpolada entre eventos, então a abertura e o fechamento de uma janela podem cair até ~1 dia de jogo fora do horário real "exato". Âncoras de janela podem entrar na B7.
3. **O fuso é um deslocamento fixo** (padrão -3, sem horário de verão); fusos com horário de verão ficam para a B8.
4. **Mercado entre humanos, ao vivo (WebSocket), reconexão e ausência por partidas faltadas** são a B7/B8; aqui só existem o estado "ausente/autopiloto" e a regra de contá-los como prontos.
5. O mercado da IA age em todos os clubes a cada rodada na liga online (no solo, em 1 de cada 6 fora do foco): o custo de CPU por passagem diária fica para medir na B9.

---

## 19. Andamento da B7 (05/11/2026): partida ao vivo e ausência (parte local, sem custo)

**O que existe.**
- `src/engine/league/live.ts` (puro): `startLiveEvent` abre as partidas dos técnicos (`humanMatchInput`: tática salva e consertada por `repairTactic`; quem não está conectado joga com a IA completa), `stepLiveEvent` leva o evento ao minuto devido, **um minuto por vez**, aplicando antes de cada minuto a fila de comandos (comando vencido, com mais de 2 minutos de espera, cai). Pausa/retomada (`pauseLiveEvent`, `resumeLiveEvent`, aviso de 10 s), presença (`setConnected`), reconexão (`viewOf`, `eventsSince`) e o fim do evento (`finishLiveEvent`: entrega os resultados pelo `submitResult` da B6, atualiza a ausência de cada técnico e devolve os registros de reprodução).
- `LiveMatch.setControlled(lado, bool)` (motor): passa o time à IA completa ou ao técnico a partir do próximo lance. Não muda nenhum resultado do jogo solo (`matchGolden` e `soloUnchanged` continuam iguais).
- **Registro de reprodução** (`ReplayRecord`): a entrada do motor mais a lista de comandos, cada um com o minuto em que valeu (inclusive as trocas de controle feitas pelo servidor). Refazer a partida com ele dá o mesmo resultado, e é **também como o objeto se reconstrói** depois de hibernar ou reiniciar (`rebuildLiveEvent`: nenhum objeto do motor precisa ser guardado). `verifyReplay` compara com a impressão digital SHA-256 do resultado entregue (`makeStoredReplay`, `replayKey`).
- `src/engine/league/absence.ts` (seção 2.9): ausente (1 ou 2 partidas), autopiloto longo (3, aviso ao ADM), vaga aberta (6 partidas ou 21 dias, **só em liga aberta**); em liga de amigos só sugestões ao ADM.
- `src/online/liveProtocol.ts`: mensagens do WebSocket com validação estrita (até 4 KB; o comando `control` nunca vem do cliente), quadros que mandam só o que mudou (`frameSince`).
- `server/leagueRoom.ts`: Durable Object da liga. Mundo em blocos no SQLite (B5), estado da liga e do evento em linhas próprias, **alarme por minuto de jogo só durante o evento**, WebSocket com a API de hibernação (`ctx.acceptWebSocket`), limite de 12 comandos por 10 s por técnico (o limite final é da B9), registros de reprodução numa tabela e, se existir o bucket `REPLAYS`, também no R2. A autenticação fica no Worker da frente (`x-player-id`); as rotas públicas são da B8. **Nada disto foi publicado**: `wrangler.toml` e `worker.ts` de produção não mudaram.

**Teste com `wrangler dev --local` (sem conta, sem custo):** `tools/online-lab/live-b7-test.mjs` contra `wrangler.b7.toml`. Passou inteiro: sala criada, evento ao vivo, estado completo no `hello`, quadros por minuto, comando aceito no minuto seguinte, comando inválido recusado pelo motor, `control` barrado, queda e volta de um técnico, **reinício real do objeto no meio da partida** (a partida seguiu do mesmo ponto), fim do evento sozinho, replays guardados e **todas as partidas refeitas pelo registro com o mesmo resultado**. Como rodar: `cd tools/online-lab && npx wrangler dev --local -c wrangler.b7.toml --port 8788 --var LAB_KEY:teste` e, em outro terminal, `node live-b7-test.mjs http://127.0.0.1:8788 teste`.

**Lesão ao vivo:** o jogo não para (o motor troca na hora, como já fazia sem a opção `holdInjurySubs`); o técnico conectado corrige depois pelas trocas dentro do limite. Por isso não existe o comando `resolveInjury` no protocolo.

### Duração da partida ao vivo em cada ritmo (proposta)

A pergunta: no Normal a partida dura 15 min reais (10 s por minuto de jogo). Nos ritmos mais rápidos ela também deve ficar mais curta, porque há mais eventos por dia real e cada um não pode ocupar o técnico por tanto tempo. Valores em `LIVE_MATCH_MS` (`pace.ts`), a duração ÷ 90 é o tempo de cada minuto:

| Ritmo | Jogo por dia real | Partida ao vivo | Cada minuto de jogo |
|---|---|---|---|
| Calmo | 2 dias | **20 min** | 13,3 s |
| Normal | 3 dias | **15 min** | 10 s |
| Rápido | 7 dias | **10 min** | 6,7 s |
| Bem rápido | 14 dias | **6 min** | 4 s |

Motivos: (1) no Bem rápido o intervalo mínimo entre eventos é de 6 h e cada dia real traz até 14 dias de jogo, então 15 minutos por partida comeria uma parte grande do tempo livre de quem joga; (2) o Durable Object fica acordado (alarme a cada minuto de jogo) enquanto o evento dura, então partida mais curta também custa menos; (3) 4 s por minuto ainda deixa tempo para ler o lance e mandar uma troca, que entra no minuto seguinte. O **resultado direto** continua disponível em qualquer ritmo para quem não quer assistir. Duas coisas para decidir depois (não incluídas): um **intervalo** parado no minuto 45 (por exemplo 1 min real no Normal) para dar tempo de mexer no time, e a prorrogação de mata-mata, que soma até 30 minutos de jogo à mesma velocidade.

### Fica para a B8 e a B9
Rotas públicas e autenticação do WebSocket (a assinatura do pedido não vai no cabeçalho do navegador: usar um código de uso único pedido por uma rota assinada), tela da sala ao vivo, "Pronto" pela interface, aviso de privacidade; B9: limite final de pedidos e a medição da memória do objeto com a liga cheia (a seção 16 avisa que a folga é de ~2×; as partidas ao vivo mantêm o motor em memória, ~1 MB por partida, e podem ser reconstruídas do registro se for preciso).

---

## 20. Andamento da B8.1 e da B8.2 (05/11/2026): conta online, código de recuperação e saves na nuvem

Telas aprovadas em `docs/mockups/b8-1-2` (capturas em `.shots/b8-1-2-*.png`); as telas prontas estão em `.shots/b8-1-2-pronta-*.png`.

**O que existe.**
- **Servidor:** `PUT /api/me` troca o apelido (`changeNickname` em `identityApi.ts`, `setNickname` nos dois armazenamentos), com o mesmo filtro do cadastro e sem gastar o Turnstile. **Precisa de `wrangler deploy` para valer na nuvem** (o Worker publicado ainda não tem a rota; nenhuma migração de banco).
- **Cliente:** `src/online/identityClient.ts` (cadastro, volta com o código, troca de apelido, puro), `src/store/onlineAccount.ts` (a conta do aparelho + `CloudSync`/`CloudScheduler` num lugar só, `useAccount`, `createAccount`, `recoverAccount`, `changeNickname`, `deleteAccount`, `onSlotSaved`), `IdentityStore.adopt` (a conta só é gravada no aparelho depois de o servidor aceitar: falha de rede não deixa conta "meio criada").
- **Ligação com o jogo:** o salvamento automático chama `onSlotSaved(slot)` (agenda o envio, 2 min entre envios); a internet voltando ou a aba indo para segundo plano chama `flushCloud`. Sem conta, nada disso faz nada.
- **Telas** (`src/ui/screens/online/`): `CreateAccount` (apelido com o filtro na hora + Turnstile, depois o código com a conferência de 3 palavras), `RecoverAccount`, `RecoveryCodeView` (agora esconde sozinho em 30 s), `CloudSaves` (um cartão por espaço, interruptor, estado, "Enviar agora", "Baixar para este aparelho" para o que só existe na nuvem, janela de ligar, janela de conflito com as três saídas), `AccountData` (trocar apelido, ver código, exportar meus dados, apagar a conta digitando o apelido). Entrada pelo cartão "Online" do menu inicial; atalhos de desenvolvimento `/?menu=criar|entrar|nuvem|dados|codigo`.
- **Os três itens que faltavam:** trocar apelido (rota nova + tela), esconder o código em 30 s (tela) e "Guardar as duas" (já existia em `CloudSync.resolve('both')` e tinha teste; a tela trata o caso "sem espaço livre").

**Diferenças em relação aos mockups.** O cartão do menu não tem "Minhas ligas" (a função só existe na 8.3; não se cria botão para o que não existe). Na janela de conflito as linhas são Time, Temporada, No jogo (data do jogo) e Salvo (rodada e posição não fazem parte do resumo do save). A tela da nuvem ganhou o cartão "Só na nuvem" com "Baixar para este aparelho", necessário para quem entra num aparelho novo.

**Teste de ponta a ponta, sem custo:** `tools/online-lab/b8-e2e.mjs` (Playwright, 380 px) contra o servidor local (`wrangler dev --local` em `server/`, chave de teste do Turnstile em `server/.dev.vars`) e o Vite com `VITE_API_BASE=http://127.0.0.1:8787 VITE_TURNSTILE_BYPASS=1` (os dois só valem em `npm run dev`). Dois aparelhos = dois contextos do navegador. 27 verificações passam: criar conta, apelido ofensivo, código e conferência, rever o código e o esconder em 30 s, ligar a nuvem, entrar em outro aparelho com o código (maiúsculas e vírgulas), baixar o save, conflito real entre dois aparelhos e "Guardar as duas", trocar apelido (inclusive recusado), exportar, apagar a conta (os saves do aparelho ficam) e a conta sumindo do servidor. **O limite de apagar conta (3 por dia por IP) aparece nos testes locais depois de 3 execuções seguidas:** apague `server/.wrangler/state/v3/do` com o servidor parado.

**Observação do filtro de apelidos:** "bundão" passa (só "bunda" está na lista, e a regra é por palavra inteira). Ampliar a lista é decisão de moderação (B9).

---

## 21. Andamento da B8.3 (05/11/2026): criar e entrar em ligas

**O que existe.**
- **Servidor** (`src/online/leagueApi.ts`, puro; `server/leagueStore.ts` no D1, migração `0002_leagues.sql`; `server/worker.ts` com as rotas): `POST /api/leagues` (criar; Turnstile; nome filtrado de 3 a 30 letras; 3 ligas ativas por ADM; 5 por pessoa), `GET /api/leagues/open` (diretório: abertas, com entrada aberta e vaga, mais novas primeiro, paginado), `GET /api/leagues/mine`, `GET /api/leagues/:id`, `POST /api/leagues/code` (convite: 8 caracteres de 31 símbolos, 10 tentativas por hora por pessoa), `POST /api/leagues/:id/join|leave` e as ações do ADM `start|kick|close-entry|open-entry|rotate-code|make-admin`. Liga aberta só usa o ritmo Normal. Quem é ADM sempre vê a própria liga, mesmo sem clube. ADM que sai passa o cargo ao técnico mais antigo; sem ninguém, a liga fecha e a sala é apagada. **Apagar a conta tira a pessoa de todas as ligas** (cada clube volta à IA). Os tetos por IP de criar liga (60 por dia) e de código (300 por hora) são bem mais folgados que os por pessoa (CGNAT).
- **Sala da liga** (`server/leagueRoom.ts`, rotas internas só acessíveis pelo Worker): o Durable Object ganhou o **saguão** (liga criada, ainda sem relógio: o mundo existe e cada técnico escolhe um clube), `start` (o relógio parte de agora com os técnicos que já escolheram) e vagas com a liga andando (`src/engine/league/seats.ts`: `addSeat`, `removeSeat`, `dropLeavingSeats`; sair no meio de um evento joga o resto com a IA e fecha a vaga quando o evento acaba). O mundo nasce em `src/store/leagueWorld.ts` (sem técnico "dono"): o fictício, da semente da liga; o real, do pacote `mundo-real/<versão>` no bucket dos pacotes.
- **Cliente e telas** (`src/online/leagueClient.ts`, `src/store/leagues.ts`, `src/ui/screens/online/leagues/`): Ligas online (minhas ligas), Criar uma liga (nome, só amigos ou aberta, ritmo, faixa de horário, máximo de técnicos, mundo fictício ou real, ao vivo ou resultado direto), Ligas abertas, Entrar com um código, Sala da liga (técnicos com o clube de cada um, convite com copiar código e link, controles do ADM, sair) e Escolha do clube (busca, filtro por liga, clubes ocupados bloqueados com o nome do técnico). O link de convite é `?convite=CODIGO`.
- `wrangler.toml` ganhou o binding `LEAGUES`, a migração `v2` da classe `LeagueRoom` e `nodejs_compat`. **Nada foi publicado**: a nuvem só muda com `wrangler deploy` (aplicar a migração `0002` no D1 remoto e recriar o `wrangler.deploy.toml` local a partir do `wrangler.toml`); isso mexe no painel e gera custo (Durable Object), então só com autorização.

**Testes.** `tests/onlineLeagueApi.test.ts` (12: criar, limites, convite, diretório, entrada, ADM, sair, conta apagada), `tests/leagueSeats.test.ts` (5) e o teste de ponta a ponta `tools/online-lab/b8-3-e2e.mjs` (Playwright, 380 px, servidor local): 4 pessoas em 4 aparelhos criam e entram em ligas de amigos e aberta, código errado e certo (minúsculas e hífen), link de convite, clube ocupado bloqueado, liga cheia, remover, fechar entrada, iniciar (outro aparelho vê "Em andamento" sozinho), diretório e sair.

**Não coberto ainda.** O mundo **real** numa liga (criar o mundo de 370 clubes dentro do Durable Object a partir do bucket) não foi exercitado no servidor local; o risco é memória e CPU do objeto (a seção 16 fala de uma folga de ~2×) e só se mede no Cloudflare. Denúncia e ocultar liga ficam para a B9. O calendário, o "Pronto" e a partida ao vivo na tela são a 8.4 e a 8.5.

## 22. Publicação da B8.1–B8.3 e medição do mundo real na nuvem (05/11/2026)

**Portão do online.** O cartão "Online" do menu só aparece com `?online=1` no endereço (a escolha fica no aparelho; `?online=0` esconde de novo; em `npm run dev` sempre aparece). O link de convite gerado pela sala já leva `online=1`. Código em `src/online/gate.ts`, teste em `tests/onlineGate.test.ts`. Até então o menu mostrava o online a todos.

**Publicação.** Migração `0002_leagues.sql` aplicada no D1 remoto e `wrangler deploy` do `meu-manager-api` (bindings `LEAGUES`, `GUARD`, `DB`, `PACKAGES`, `SAVES`). `server/wrangler.deploy.toml` (ignorado pelo Git) é gerado do `wrangler.toml` trocando o `database_id`.

**Mundo real inteiro (370 clubes, 10.471 jogadores, 21 competições) numa sala, no Cloudflare.** Feito com um Worker de laboratório temporário (`tools/online-lab/src/liga-real.ts`, já apagado) que estende a `LeagueRoom` de verdade e lê o pacote `mundo-real/2026.11` do bucket de produção, sem passar pelo Turnstile.

| Passo | Tempo (de quem chama) | CPU (do `wrangler tail`) |
|---|---|---|
| Criar a sala (ler o pacote do R2, descomprimir, montar o mundo, gravar 12 MB no SQLite) | 1,9 a 2,8 s | ~1,1 a 1,7 s |
| Sentar 2 técnicos | ~0,2 s | 1 ms |
| Iniciar a liga (calendário de 21 competições, 74 eventos) | ~0,25 s | 9 a 32 ms |
| Reinício real do objeto e recarga do SQLite | ~0,5 s | ~90 ms |

Memória: o Cloudflare não deixa ler a memória (`process.memoryUsage()` dá zeros). Medi pelo teto, segurando lastro no heap antes de criar a sala: **passou com lastro de até 260 blocos (~196 MB no Node), sem reinício**, com o mundo vivo (~50 MB) por cima. Não achei o teto, ou seja, o limite de 128 MB não aparece neste caminho (criar e iniciar); ele só apareceu na B5 em temporadas completas gravando. A leitura honesta continua: **criar e iniciar a sala do mundo real cabe com folga; o pico de uma virada de temporada com gravação ainda é medido na B9**.

**Estado do servidor depois do teste:** nenhuma liga nem identidade no D1; Worker de laboratório apagado (as salas de teste foram junto); nada de teste no R2.


## 23. Código de recuperação único (pedido dos sócios, 05/11/2026)

As 12 palavras com confirmação de 3 eram trabalhosas demais. Agora:

1. **Um código só**, em grupos de 4 (`K7QP-9X2M-HT4R-8WZC-3NFB`), alfabeto de 31 símbolos `23456789ABCDEFGHJKMNPQRSTUVWXYZ`: sem O, I, L, 0 e 1. **São 20 símbolos (~99 bits).** Por quê: o `playerId` (chave pública) aparece para os outros técnicos, então quem quiser descobrir o código pode testar palpites sem falar com o servidor; 2^99 palpites é inviável mesmo com milhões de placas de vídeo (o código antigo tinha 128 bits, mais do que se precisa). Menos que isso (por exemplo 12 símbolos, ~59 bits) já seria arriscado; mais que isso só deixa o código mais comprido. Não há dígito de conferência: um erro de digitação vira "símbolo inexistente" (quando cai em O, I, L, 0 ou 1) ou "conta não encontrada".
2. **Sem confirmação digitando partes.** A tela mostra o código (escondido até o toque, 30 s), com **Copiar**, **Baixar arquivo** (`meu-manager-codigo-de-recuperacao.txt`) e **Já guardei**.
3. **O código não aparece na criação da conta:** a pessoa cria e já joga. O menu mostra um aviso discreto até ela tocar em "Já guardei".

**Aviso de privacidade** (seção 14, texto do código de recuperação) e o texto do cartão Online no menu foram atualizados. A semente da chave agora é `HKDF(código, "ed25519-identity-v2")`: contas feitas com as 12 palavras só existiram em testes locais (o online não está em uso: 0 identidades no servidor) e não migram.

**Testes:** `tests/onlineIdentity.test.ts` (alfabeto sem confusão, sorteio sem viés, leitura com hífen/espaço/minúscula, erros), `tests/recoveryCodeScreen.test.ts`, `tests/accountScreens.test.ts`, `tests/onlineIdentityStore.test.ts`; ponta a ponta `tools/online-lab/b8-e2e.mjs` (cria a conta sem ver o código, aviso no menu, mostrar/baixar/"Já guardei", entrar em outro aparelho com o código em minúsculas e espaços). Observação do teste local: o servidor local usa a chave de teste do Turnstile, que aprova qualquer desafio, então um código inexistente **cria** uma conta em vez de dar "não encontrada"; na nuvem real o desafio falso é recusado.

## 24. B8.4: Pronto, Avançar, Pausa e horários (05/11/2026)

A sala de uma liga em andamento deixou de ser só a lista de técnicos (some a nota transitória "Liga em andamento"). `LeagueRunning` mostra:

- **Próxima rodada** com dia da semana, data e hora **no fuso do aparelho** (o servidor só guarda milissegundos; `Intl.DateTimeFormat` formata), "em 9 dias", a data do mundo e a hora em que a sala abre (5 min antes).
- **Pronto:** só quem tem partida no próximo evento precisa dar. Botão "Estou pronto" / "Pronto! Toque para desfazer". Com a sala aberta e todos prontos a rodada começa antes do horário (regra de B6, `shouldStart`). Dar Pronto conta como presença (`setPlayerReady`: volta de ausente para ativo e zera as faltas). Durante um evento ou em pausa o botão some, com o motivo.
- **Quem está pronto:** cada técnico com o clube e "Pronto", "Falta", "Sem jogo", "Ausente (IA joga)" ou "Piloto automático".
- **Calendário:** as próximas 12 rodadas (só eventos com partidas), no fuso local.
- **ADM:** *Avançar* (janela de confirmação com a data, o horário que será pulado e **quem ainda não deu Pronto**; quem faltar joga com a IA), *Pausar*/*Retomar* (pausa congela o tempo e os prazos; os horários são refeitos ao retomar; volta sozinha em 30 dias), *Ritmo* (só liga de amigos; aberta é sempre Normal; refaz os horários futuros agora; não vale no meio de um evento) e **sugestões de ausência** ("Técnicos sumidos", só para o ADM: quem já passaria do limite de uma liga aberta, com botão Remover; a decisão é sempre do ADM). Remover técnico e passar o cargo já existiam (8.3).
- **Últimos acontecimentos:** registro da liga (criada, rodada começou/terminou, ADM avançou, pausa, retomada).

**Servidor.** Engine puro novo: `engine/league/view.ts` (`leagueView`, `setPlayerReady`) e `replanForPace` em `runner.ts`. API (`leagueApi.ts`): `GET /api/leagues/:id/state` (membro ou ADM; as sugestões só vão ao ADM), `POST .../ready`, `.../advance`, `.../pause`, `.../resume` (só ADM) e `.../pace` (só ADM, só amigos); a sala ganhou as rotas internas `state`, `ready`, `advance`, `pause`, `resume` e `pace`. O estado é consultado por polling a cada 5 s (limite de leitura de 120/min por identidade); o WebSocket é da partida ao vivo (8.5).

**Testes:** `tests/leagueView.test.ts` (8), `tests/onlineLeagueApi.test.ts` (5 novos: permissões, corpo, estado da liga), ponta a ponta `tools/online-lab/b8-4-e2e.mjs` (3 técnicos: calendário, Pronto e desfazer, ADM vê o Pronto, pausa para todos, retomar, ritmo refaz os horários, Avançar com confirmação e registro). **Não coberto no navegador:** a sugestão de ausência aparecer (precisa de várias rodadas perdidas; coberta no motor) e "todos prontos começa antes do horário" (precisa estar a 5 min do evento; coberto em `leagueView.test.ts`).

**Publicação:** as rotas da 8.4 foram publicadas em 06/11/2026 (`wrangler deploy`, versão `53d04a96`; sem migração nova do banco).

## 25. B8.5: partida ao vivo na tela, por WebSocket (06/11/2026)

Com a liga em "Assistir ao vivo", quando a rodada começa a sala mostra **Entrar na partida** (`LeagueRunning`) e abre `LiveMatchOnline`: placar e minuto, o campo 2D de sempre (`Pitch`), os controles do técnico, os outros jogos da rodada e os lances narrados. O servidor joga a partida (um minuto de jogo a cada ~10 s no ritmo Normal); a tela só desenha o que ele manda e envia decisões.

**Autenticação do WebSocket por ticket de uso único.** O navegador não manda cabeçalhos num WebSocket, então: (1) `POST /api/leagues/:id/live-ticket` (pedido assinado, limite de escrita, só membro com clube, liga em andamento) pede à sala um ticket de 48 caracteres hexadecimais; (2) a sala o guarda no próprio SQLite com validade de **30 s** e **o gasta na primeira conexão** (reusar, expirar ou inventar dá 401); (3) `GET /api/leagues/:id/live?ticket=...` (Upgrade) passa pelo Worker, que confere só o limite por IP (`liveConnectIp`, 300/min, folgado por causa do CGNAT) e repassa à sala **apenas o ticket** (nada de cabeçalhos do cliente). O `x-player-id` do laboratório da B7 só vale com `TRUST_PLAYER_HEADER=1` (`tools/online-lab/wrangler.b7.toml`); em produção não existe. Um ticket novo por tentativa: quem reconecta pede outro.

**Protocolo (`liveProtocol.ts`).** O `full` (ao conectar e reconectar) agora traz o `roster` (clubes e jogadores das partidas do evento: nome, apelido, posição, força, cores e sigla; **a tela não baixa o mundo**), o clube do técnico (`me`) e `resumeAt` se ainda está no aviso de retomada; o `frame` de cada minuto traz, além dos eventos e lances novos, o retrato curto dos dois lados (quem está em campo, tática, banco, trocas que restam) e as estatísticas. `resumed` traz `resumeAt` (agora + 10 s): a tela mostra "O jogo volta em N s". `Pitch` passou a receber `data: { teams, players }` em vez do `Game` (a tela solo passa o `season`).

**Cliente (`liveSession.ts`, puro).** `applyMessage` junta `full` e `frame` num estado igual ao retrato do servidor (testado minuto a minuto contra o motor); `LiveSession` pede o ticket, abre o socket, manda `hello` com o último minuto visto e **reconecta sozinha** (esperas de 0,8 s a 10 s, desiste depois de 12 tentativas seguidas e mostra "Tentar de novo"). Cair da conexão passa o clube à IA do servidor (regra da B7); ao voltar o técnico retoma no minuto seguinte. Voltar da tela no meio do jogo pede confirmação (o time fica com a IA).

**Controles.** Estilo, mentalidade, formação e trocas (toca em quem sai e depois em quem entra; mostra trocas e paradas que restam). Todo comando vai pela fila do servidor e **vale no minuto seguinte**; a tela diz "Enviado: vale no próximo minuto" e depois o resultado ("Pronto, valeu..." ou o motivo da recusa, `LIVE_REJECT_LABELS`). **Fora desta parte:** arrastar jogadores na grade (o comando `position` existe no protocolo, mas não há tela) e a escolha de quem entra quando há lesão (no online o motor troca na hora, regra da B7).

**Teste local sem custo:** `wrangler dev --local --port 8787 --var LIVE_MINUTE_MS:600` (o `LIVE_MINUTE_MS` encurta o minuto de jogo; em produção não existe) e `tools/online-lab/b8-5-e2e.mjs` (Ana é ADM, Bia joga: entra na partida, o minuto anda, muda mentalidade e faz troca, pausa e retomada com aviso, a conexão é derrubada e volta com ticket novo, ticket usado e ticket falso são recusados, fim de jogo e volta à sala). Testes: `tests/onlineLiveSession.test.ts` (7), `tests/onlineLeagueApi.test.ts` (ticket), `tests/onlineLiveProtocol.test.ts`.

**Pendências para antes do lançamento (pedido de 06/11/2026):** (1) arrastar os jogadores no campo durante a partida online (comando `position`, que o servidor já aceita; falta a tela, como no solo); (2) escolher quem entra em caso de lesão no online, como no jogo solo (hoje o motor troca na hora).

**Investigação da falha intermitente (06/11/2026).** O teste ponta a ponta falhou 1 vez em 4 esperando o "Fim de jogo". Rodado dezenas de vezes com registro do WebSocket (`b8-5-e2e.mjs` guarda cada mensagem e fechamento), apareceram três causas, duas reais:
1. **Bug real (corrigido): "Entrar na partida" aparecia para quem não joga no evento.** Nem todo clube joga em toda data. O técnico sem partida abria a tela, o servidor mandava o `full` sem o jogo dele e a tela ficava vazia ("travada"). Agora a visão traz `current.playing` (quem joga no evento), o botão só aparece para quem joga, quem não joga lê "Seu clube não joga nesta rodada" e a tela tem o mesmo aviso. Antes da correção isso derrubava 3 de 10 execuções.
2. **Bug real (corrigido): ticket invalidava ticket.** Emitir um ticket apagava os outros do mesmo técnico; dois pedidos quase juntos (modo estrito do React em desenvolvimento, ou uma reconexão em cima de outra) faziam o ticket certo ser apagado e a conexão levava 401. Agora os tickets vencidos saem e os outros ficam (no máximo 6 vivos por técnico). Teste: `tests/leagueRoomTicket.test.ts` (SQLite de verdade).
3. **Artefatos do teste:** o limite local de 30 contas por dia por IP derrubava execuções seguidas ("online-account" não aparecia), e o proxy do WebSocket do teste engolia o fechamento enviado pelo servidor (agora repassa).
**Resultado depois das correções:** 14 de 14 execuções seguidas passaram (5 delas passaram pelo caso "Bia não joga neste evento"), sem erro de alarme e só com fechamentos normais no registro da sala. **Não explicado:** a falha original (esperar o "Fim de jogo" 120 s) e uma vez em que o servidor fechou as duas conexões no minuto 86 (com o proxy antigo do teste) não se repetiram em ~25 execuções completas depois; a sala agora registra erros de alarme e fechamentos (`[sala] ...` no log) para o caso de reaparecerem na nuvem (`wrangler tail`).

**Publicação:** publicada em 06/11/2026 (`wrangler deploy`, versão `03c0ee4d`; reenviada com as correções acima na versão `ecde3755`; sem migração nova do banco).

## 26. B8.7: virada de temporada para os clubes humanos (06/11/2026)

Antes desta parte a virada de temporada tratava os clubes humanos pela regra da IA (limitação 1 da seção 18): a IA renovava os contratos deles, cortava a folha, promovia a base e refazia a tática. Agora a virada os **protege como protege o clube do jogador no solo**, e o técnico decide por uma tela nova.

**Motor.** `OffseasonOptions.humanTeamIds` (conjunto de clubes; `TeamRef` e `isProtected`, o mesmo mecanismo da B6) vale em tudo o que o solo já protegia: `expireContracts` (contrato que vence **sai**, sem renovação da IA; empréstimos voltam), corte de folha e de excesso, `turnAcademy` (quem faz 20 anos fica **esperando decisão**; se o técnico deixar passar, a regra da IA decide na virada seguinte), tática só reparada (`repairTactic`), orçamento de salários e ingresso mantidos, anúncios e histórico de treino, e o freio de dinastias (um clube humano campeão não perde estrela para a IA). `TurnRunner` ganhou o 3º parâmetro `humans`: `runDueTurns` entrega os clubes humanos da liga e `turnRunner` (`store/game.ts`) os repassa a `advanceSeason`. **A meta da diretoria é nova a cada temporada** (por reputação, como na IA) e o clube ganha uma linha em `history`; na liga online não há demissão. **O jogo solo não mudou:** sem `humans` o caminho é o de antes (`tests/soloUnchanged.test.ts` e `tests/offseason.test.ts` passam sem regravar nada).

**Técnico ausente ou em piloto automático (pedido de 06/11/2026).** Na virada só os técnicos **ativos** protegem o clube: a liga passa só os assentos ativos (`AdvanceOptions.turnHumanTeamIds`, `activeIds` em `runner.ts`) e a IA cuida das **renovações e da base** de quem está ausente ou em piloto automático, como faz com os clubes da IA (inclusive o corte de folha), para o clube não ser desmontado enquanto a pessoa está fora. O mercado e as partidas continuam como na B6 (a IA não mexe no clube humano fora da virada; as partidas de ausente são jogadas pela IA da partida). Testado em `tests/leagueSeasonTurn.test.ts`: técnico ausente tem renovações feitas pela IA e a base decidida, o ativo da mesma liga continua sem renovação automática e com os jovens esperando, e piloto automático conta como ausente.

**"Meu clube"** (`engine/league/club.ts`, puro): `clubView` traz meta, temporada, elenco, folha e orçamento, os **contratos que vencem com a temporada** (com o salário que cada jogador pede, `renewalDemand`), os jovens de 20 anos da base com estrelas de potencial (`potentialStars`) e a temporada passada; `applyClubAction` faz **renovar** (`renewUserContract`: 1 a 5 anos, salário padrão = o pedido, no máximo 3× o pedido, recusa devolve o motivo e o salário mínimo), **promover** e **dispensar** (`promoteYouth`, `releaseYouth`, só jovem do próprio clube com 20 anos). API: `GET /api/leagues/:id/club` e `POST /api/leagues/:id/club` (corpo `{type:'renew'|'promote'|'release-youth', playerId, years?, salary?}`, conferido campo a campo; só técnico com clube e liga em andamento; recusa = 409 `club-refused` com `reason` e `minimumSalary`); a sala tem as rotas internas `club` e `club/action` e grava o mundo. Tela: `ClubCard` na sala em andamento (meta, lista de contratos com "Renovar" e janela de duração, base com "Promover" e "Dispensar"; sem jovem esperando mostra a base).

**Testes:** `tests/leagueSeasonTurn.test.ts` (uma temporada inteira de liga com 2 humanos até a virada: contrato que vence num clube humano não é renovado e na IA há renovações; base humana com jovens de 20 anos esperando e a da IA decidida; meta nova, histórico e nenhum corte além de contratos vencidos), `tests/leagueClub.test.ts` (4), `tests/onlineLeagueApi.test.ts` (Meu clube), ponta a ponta `tools/online-lab/b8-7-e2e.mjs` (meta, lista de contratos, renovar pela janela e o jogador sai da lista; a outra técnica não é afetada). **Não coberto no navegador:** promover e dispensar jovem e os avisos depois da virada (precisam de uma temporada inteira pela tela; o motor está coberto nos testes).

**Fora desta parte (vão para a 8.6):** comprar e vender jogador (mercado entre humanos) e avisos de contrato acabando por mensagem. **Publicação:** nada publicado; as rotas novas só valem na nuvem depois de `wrangler deploy` (parte nova: precisa de autorização).

## 27. B8.6: mercado entre técnicos (06/11/2026)

Escopo decidido com os sócios: **negociação entre técnicos humanos da liga e contratação de jogador livre**. Comprar de clubes da IA, busca com filtros, lista de anúncios e propostas da IA pelos jogadores dos técnicos ficam para a **8.6b** (obrigatória antes do lançamento, antes da 8.8: numa liga online quase todos os clubes são da IA).

**Proteção contra "laranja"** (`LEAGUE_TRADE` em `config.ts`; números aprovados em 06/11/2026; `V` = valor de mercado do jogador):
| Regra | Valor |
|---|---|
| Compra entre técnicos | de 60% a 250% de V |
| Empréstimo | taxa de 50% a 250% da taxa padrão (12% de V) |
| Negócios do mesmo par de técnicos por janela | 2 (compra ou empréstimo; vale nos dois sentidos) |
| Dinheiro total do par por janela | no máximo 3 × o maior V negociado entre eles |
| Recompra do mesmo jogador do mesmo técnico | bloqueada por 90 dias de jogo (só compra) |
| Propostas abertas por técnico (como comprador) | 5, e só uma proposta aberta por jogador |
Também valem as regras do jogo solo: **as janelas dos dois clubes precisam estar abertas** (`isWindowOpen`), o **limite de estrangeiros** e o orçamento de compras e de salários (`buyerCheck`), elenco do vendedor com o mínimo e cobertura por posição, e o **consentimento do jogador** (`playerDecision`: salário, espaço no time, reputação; se recusa, o jogo mostra o salário mínimo que ele aceitaria).

**Como funciona** (`engine/league/trade.ts`, puro; estado em `LeagueState.trades`, opcional: ligas anteriores não o têm). O comprador propõe preço, salário e duração; a taxa fica **reservada** (sai do orçamento de compras e do caixa visíveis para outras propostas) enquanto a proposta estiver aberta; o vendedor aceita, recusa ou **contrapropõe o preço** (no máximo 3 rodadas; quem responde alterna); o comprador pode retirar. A proposta vale **48 h** e cada contraproposta **24 h**, no relógio dos prazos da liga (`deadlineIn`), que **congela na pausa**; a sala acorda no prazo mais próximo (`tradeWakeup`) e varre as vencidas (`sweepTrades`: também caem quando o jogador sai do clube ou a janela fecha). Aceitar **confere tudo de novo** e executa `executeTransfer`. Contratar **jogador livre** é na hora (janela, orçamento e o jogador). Propostas e contratações **não valem durante uma rodada em andamento** (o mundo não muda no meio das partidas). O **histórico público** (`TradeRecord`: jogador, clubes, preço, valor, janela) aparece para todos na sala (`view.transfers`) e no Mercado; qualquer técnico pode **denunciar** uma transferência (`TradeReport`, uma por técnico) e **só o ADM vê as denúncias**; ficam na própria sala (sem banco novo, sem migração; o painel de moderação é da B9).

**API** (`leagueApi.ts`): `GET /api/leagues/:id/trade` (painel), `trade-squad?team=` (elenco de outro técnico, com as faixas de preço), `trade-free?pos=` (livres), `POST trade-offer|trade-respond|trade-withdraw|trade-sign|trade-report` (corpo conferido campo a campo; recusa = 409 `trade-refused` com `reason` e, se for salário, `minimumSalary`). `/state` traz `awaiting` (propostas esperando a minha resposta). Sala: rota interna `/internal/trade` com `op`. **Tela:** `LeagueMarket.tsx` (abas Propostas, Técnicos, Livres, Histórico; botão "Abrir o mercado" na sala, com o aviso de propostas esperando) e o cartão "Últimas transferências" na sala.

**Testes:** `tests/leagueTrade.test.ts` (16: reserva, faixa de preço, aceitar executa e vai ao histórico, contraproposta e rodadas, recusa, orçamento reservado, janela fechada, prazo e pausa, limite do par, teto de dinheiro do par, bloqueio de 90 dias, 5 propostas, jogador livre, denúncia, elenco), `tests/onlineLeagueApi.test.ts` (corpos e recusas), ponta a ponta `tools/online-lab/b8-6-e2e.mjs` (Ana propõe, Bia contrapropõe, Ana aceita, histórico nos dois, denúncia vista pelo ADM, segunda compra do par). **Não coberto no navegador:** jogador livre (o mundo de teste não tem livres; coberto nos testes de unidade), prazo de 48 h e pausa (nos de unidade) e o limite de estrangeiros (nas regras do solo).

**Publicação:** publicada em 06/11/2026 (`wrangler deploy`, versão `5a0c79d7`; sem migração de banco).

## 28. B8.6b: mercado com os clubes da IA (06/11/2026)

Sem isto o mercado online ficaria vazio (numa liga quase todos os clubes são da IA). Entra **comprar e pegar emprestado de clubes da IA, a busca com filtros, os anúncios e as propostas da IA pelos jogadores dos técnicos**, com o servidor validando tudo pelas mesmas regras do jogo solo (`makeOffer`, `resolveDueOffers`, `respondToOffer`): janela do clube, orçamento de compras e de salários, limite de estrangeiros, elenco máximo, consentimento do jogador (salário, espaço no time, reputação) e decisão do clube vendedor.

**Motor** (`engine/league/aimarket.ts`, puro). `searchAi`: os filtros do solo (texto, grupo e posição, só livres ou com clube, série, idade máxima, valor máximo, força mínima, atalhos "Cabem no bolso", "Barganhas", "Jovens promessas" e "Contrato acabando", ordem), até 40 jogadores, **sem os de outro técnico da liga** (esses são pela aba Técnicos, B8.6) e sem os do próprio clube; cada linha traz valor, preço pedido, taxa de empréstimo, interesse do jogador (`interestIn`) e o salário que ele costuma pedir. `listingsAi`: os anúncios dos clubes da IA (preço anunciado). `makeAiOffer` (compra, empréstimo ou livre; no máximo **5 propostas abertas** por técnico; jogador de técnico dá `human-club`), `withdrawAiOffer`, `aiOffers` (minhas propostas, abertas primeiro, e as da IA esperando resposta) e `respondAiOffer` (só o dono do jogador; aceitar executa a transferência). `withdrawOffer` entrou em `market/offers.ts`. **A resposta da IA chega com o tempo do mundo** (`responseDays`): quando a liga passa pela data (Avançar, evento ou passagem diária) as propostas vencidas são decididas; a tela mostra "resposta em <data>". Contratar um **jogador livre** pela busca é **na hora** (`signFreeAgent`, B8.6).

**Propostas da IA pelos jogadores dos técnicos.** `runMarketTick` agora sorteia o alvo **entre os clubes humanos da liga** (o limite de propostas pendentes cresce com o número de humanos); o caminho do solo (um só clube, `string`) é idêntico ao de antes (`tests/soloUnchanged.test.ts` passa sem regravar nada). A proposta vale até `dueOn` (data do jogo); o técnico aceita ou recusa no Mercado; aceitar só fora de uma rodada em andamento. O aviso "propostas esperando você" da sala soma as da IA e as dos técnicos.

**API** (`leagueApi.ts`): `GET /api/leagues/:id/trade-search` (filtros na URL com lista fechada de valores e números limitados, `parseSearchFilters`), `trade-listings`, `trade-ai`; `POST trade-ai-offer` (`kind: purchase|loan|free`, livre exige taxa 0), `trade-ai-respond`, `trade-ai-withdraw`; a sala usa a mesma rota interna `/internal/trade` com mais operações. **Tela:** o Mercado agora tem as abas Propostas (inclui as minhas propostas à IA com o resultado e as propostas da IA), Buscar, Anúncios, Técnicos e Histórico (`LeagueMarketAi.tsx`); a aba Livres foi absorvida pela busca ("Só livres").

**Testes:** `tests/leagueAiMarket.test.ts` (7: busca e filtros, anúncios, proposta à IA com duplicada, retirada, resposta e limite de 5, janela fechada e livre, a IA procurando os técnicos e só o dono respondendo), `tests/onlineLeagueApi.test.ts` (filtros e corpos), ponta a ponta `tools/online-lab/b8-6b-e2e.mjs` (busca e filtros, proposta a um clube da IA, anúncios, o ADM avança a liga e a IA responde com o motivo, propostas da IA se aparecerem). **Não coberto no navegador:** a proposta da IA pelo jogador de um técnico (nasce com sorteio e nem sempre aparece no teste; coberto no teste de unidade) e o empréstimo de ponta a ponta. **Limites desta parte:** transferências com a IA não entram no histórico público (só as entre técnicos e as contratações de livre; o histórico do mundo guarda todas) e o técnico ainda não anuncia os próprios jogadores nem vende direto a um clube da IA (o solo tem; fica para antes do lançamento junto com o pré-contrato).

**Publicação:** publicada em 06/11/2026 (`wrangler deploy`, versão `515a0b7a`; sem migração de banco).

## 29. B8.8: copas na liga online e aviso de privacidade final (06/11/2026)

**Copas.** O mundo de cada liga já trazia as copas (nacionais, continentais e mundiais, as mesmas do jogo solo) e o relógio da liga já tratava a partida de copa de um clube humano como qualquer partida humana (B6, B7). Esta parte **confirma isso de ponta a ponta e dá a tela**. Conferido em `tests/leagueCups.test.ts` (uma temporada inteira de liga com 2 técnicos, resultado direto): os técnicos jogam todas as partidas de copa (dezenas de lances de fases diferentes), as copas terminam com campeão e vice e entram no histórico que alimenta as edições seguintes, e **ao vivo um jogo de mata-mata de copa sempre termina com vencedor** (60 jogos com sementes diferentes: aparecem prorrogação e disputa de pênaltis). **Visão** (`engine/league/cupsView.ts`, puro): `fixturesOn` (os jogos de técnicos humanos de cada data, com a competição e a fase pelo `matchLabel` do solo: "Série A · Rodada 3", "Copa Nacional · Oitavas de final · volta"; a visão da liga traz `events[].fixtures`, `next.fixtures` e `current.fixtures`) e `cupsBody` (o caminho do clube em cada copa com `cupPath` do solo, se segue vivo, as outras copas do mundo e os campeões das edições passadas). **Sala:** a próxima rodada e a rodada em andamento listam os jogos dos técnicos com a competição; o calendário marca as datas de copa (ficha colorida); o cartão "Copas" mostra o caminho do meu clube, as outras copas e os campeões passados (`CupsCard.tsx`; `GET /api/leagues/:id/cups`, rota interna `/internal/cups`). **Partida ao vivo:** o `full` traz o rótulo de cada partida (`labels`), o placar mostra a competição e a fase, "prorrogação" depois dos 90 minutos e "Pênaltis: x a y" (o `frame` agora leva `penalties` e `shootout`).

**Aviso de privacidade final.** `screens/online/PrivacyNotice.tsx` (versão `PRIVACY_VERSION` = 2026-11-06): abre antes de criar a conta (link "aviso de privacidade") e em Online › Minha conta. O texto é o da seção 7.2 **conferido com o que o servidor de fato faz**; saiu uma discrepância e ela foi corrigida: os contadores de limite guardam o **IP** (chave `ação:IP` no `Guard`) e só eram apagados quando a mesma chave voltava, ou seja, o IP de quem fez um pedido uma vez ficava no disco para sempre. Agora o `Guard` tem alarme horário que apaga tudo o que venceu (`SqlGuard.purge`; teste em `tests/onlineGuard.test.ts`) e o aviso diz "somem em até 24 horas". Também foram atualizados: denúncias (ficam na sala, o ADM as vê), histórico público de transferências visível aos membros e o fim do "Denúncias em D1 por 12 meses". **A revisão por quem entenda de LGPD continua obrigatória antes do lançamento** (não é aconselhamento jurídico).

**Testes:** `tests/leagueCups.test.ts` (6), `tests/onlineGuard.test.ts` (2 novos), `tests/onlineLeagueApi.test.ts` (cópias), ponta a ponta `tools/online-lab/b8-8-e2e.mjs` (aviso de privacidade antes e depois da conta, a sala com Copas e os jogos de cada data, o calendário com copa depois de avançar, o cartão com o caminho do clube). **Não coberto no navegador:** a partida de copa ao vivo com prorrogação e pênaltis (coberta no teste do motor; no navegador o ao vivo é o da B8.5) e copas continentais e mundiais (o mundo de teste do navegador tem só a copa nacional e a supercopa; as demais usam o mesmo motor do solo).

### Pendências obrigatórias antes do lançamento (consolidado)
1. **Partida ao vivo online** (B8.5): arrastar os jogadores no campo durante a partida e escolher quem entra em caso de lesão, como no solo.
2. **Mercado** (B8.6b): o técnico **anunciar os próprios jogadores** e **vender direto a um clube da IA**, como no solo; **pré-contrato**, como no solo; transferências com a IA no histórico público (opcional).
3. **Privacidade**: revisão do aviso por quem entenda de LGPD; decisão sobre a limpeza de contas sem uso (seção 17).
4. **B9**: painel de moderação (denúncias, banimento de identidade, filtro de apelidos), limites finais, teste de carga e teste fechado.

**Publicação:** nada publicado; as rotas de copas e a limpeza horária do `Guard` só valem na nuvem depois de `wrangler deploy` (parte nova: precisa de autorização; sem migração de banco).

## 30. Mercado online: anunciar, vender direto à IA e pré-contrato (06/11/2026)

Pendência obrigatória 1 antes do lançamento (seção 29). O técnico da liga online passa a ter o que o jogo solo tem: **anunciar os próprios jogadores**, **vender ou emprestar direto a um clube da IA** e **pré-contrato**. As regras são as do solo (`listUserPlayer`, `sellPlayer`/`buyerInterest`, `offerPreContract`), aplicadas pelo servidor ao mundo da liga.

**Motor** (`engine/league/sellmarket.ts`, puro). `mineBody` (meu elenco com valor, anúncio, preços sugeridos, quem pode assinar pré-contrato, quem sai e quem chega); `listOwn`/`unlistOwn` (anúncio de venda ou empréstimo; a IA passa a fazer propostas por ele pelo preço anunciado, `runMarketTick` já sorteava entre os clubes humanos); `buyersFor` (até 12 clubes da IA interessados, com o máximo que pagam) e `sellToAi` (o clube responde na hora; contrato novo de 3 anos, empréstimo até o fim da temporada dele; clube de técnico não é comprador: isso é o mercado entre técnicos); `preTargets` (jogadores de clubes da IA no último ano de contrato, até 40) e `preOffer` (o jogador responde na hora; recusa por salário devolve o mínimo). A virada de temporada já aplicava os pré-contratos (`applyPreContracts`) e a IA já podia levar jogadores de técnicos (`pre-contract-lost`).

**API** (`GET trade-mine`, `trade-buyers?player=&kind=`, `trade-pre?q=&pos=`; `POST trade-list|unlist|sell|pre-offer`, corpos conferidos campo a campo em `parseTradeOp`). Vender (`sell`) só vale fora de uma rodada em andamento (`event-running`, como aceitar proposta da IA); anunciar e pré-contrato valem a qualquer hora. Recusa do clube ou do jogador volta como `sale: { accepted: false, reason, counter }` (a tela mostra o motivo na própria janela).

**Tela** (`LeagueMarketSell.tsx`): o Mercado ganhou as abas **Vender** (meu elenco, Negociar, Anunciar/Tirar anúncio) e **Pré-contrato** (chegam e saem na virada, busca por nome, proposta com salário e anos). A barra de abas (`Tabs`) agora rola na horizontal.

**Testes:** `tests/leagueSellMarket.test.ts` (6), `tests/onlineLeagueApi.test.ts` (corpos válidos e inválidos), ponta a ponta `tools/online-lab/b8-9-e2e.mjs` (anunciar e tirar o anúncio, venda direta recusada com motivo e depois aceita, pré-contrato aberto no meio da temporada, proposta aceita e o jogador em "Chegam na virada"; capturas `.shots/b8-9-*.png`). **Não coberto no navegador:** a venda de empréstimo e a proposta da IA pelo jogador anunciado (cobertas em teste de unidade).

**Publicação:** nada publicado (precisa de `wrangler deploy`, sem migração de banco).

## 31. Partida ao vivo online: arrastar jogadores e escolher quem entra na lesão (06/11/2026)

Pendência obrigatória 2 antes do lançamento (seção 29). Agora a partida ao vivo online tem o que o jogo solo tem na tela de partida.

**Arrastar no campo.** A área "Em campo" de `LiveMatchOnline` usa o `FieldLineup` do solo (camisa com número, nome, condição e cartão): arrastar leva o jogador ao ponto mais perto da grade (ponto ocupado = os dois trocam), tocar escolhe quem sai. O comando `position` (que o servidor já aceitava desde a B7) vale no próximo minuto, como os outros; a tela mostra o jogador no ponto novo na hora (e o troca-troca) até o servidor confirmar.

**Lesão: o jogo para e o técnico escolhe.** Todo jogo de técnico começa com `holdInjurySubs` (`startLiveEvent`): quando alguém do time dele se machuca, o jogador sai e o **jogo dele para** (os outros seguem; o relógio do evento anda e o jogo parado recupera quando volta). O quadro leva `injury` (quem se machucou e quanto falta) e a tela mostra o aviso com o banco e "Seguir com um a menos"; a escolha é o comando novo `injury` (com `incomingId`, ou sem ele para seguir com um a menos), que entra no minuto seguinte. **Prazo:** `INJURY_WAIT_MS` = 45 s do relógio do evento (sem contar pausas): passado isso, ou na hora se o técnico caiu ou o time é da IA, entra o melhor reserva (`autoResolveInjury`, comando `injury-auto` só do servidor, anotado no registro para a reprodução refazer idêntica). O prazo é medido no relógio do evento (`clock × minuteMs`) e não no relógio da máquina, então vale também quando o servidor recupera vários minutos de uma vez. Quando o time volta ao técnico (`setControlled(true)`) a próxima lesão espera de novo.

**Motor.** `LiveMatch.injuryPending` e `autoResolveInjury(side)` (mesmo "melhor reserva" da lesão sem espera, estrangeiros respeitados) e `MatchInput.injuryRate` (só para testes: multiplica a chance de lesão; o servidor só o liga com `LIVE_INJURY_RATE` em testes locais, como `LIVE_MINUTE_MS`). Nada muda para quem não usa `holdInjurySubs`: `tests/matchGolden.test.ts` passa sem regravar.

**Testes:** `tests/leagueLiveInjury.test.ts` (7: o jogo para e a tela recebe a contagem; escolha do reserva e reprodução idêntica; "um a menos"; prazo de 45 s; técnico que cai; limpeza no estado do cliente; protocolo), ponta a ponta `tools/online-lab/b8-10-e2e.mjs` (com `LIVE_MINUTE_MS=600` e `LIVE_INJURY_RATE=60` no `server/.dev.vars`: a lesão aparece, o jogo fica parado, a contagem aparece, o reserva entra e o jogo volta; arrasta um jogador, o servidor aceita e ele muda de lugar; capturas `.shots/b8-10-*.png`). **Não coberto no navegador:** o prazo de 45 s vencendo (coberto em teste de unidade; no laboratório o minuto é curto e o prazo seria de 75 minutos de jogo) e a lesão com dois técnicos ao mesmo tempo na mesma partida.

**Dica de laboratório:** o `wrangler dev --var` não chega ao Worker nesta máquina; as variáveis de teste vão no `server/.dev.vars` (que o Git ignora). E confira que só há um `wrangler`/`workerd` rodando: instâncias antigas seguem respondendo na mesma porta com código velho.

### Pendências obrigatórias antes do lançamento (consolidado, 06/11/2026)
1. ~~Partida ao vivo online: arrastar e escolher na lesão~~ (feito, esta seção).
2. ~~Mercado online: anunciar, vender direto à IA e pré-contrato~~ (feito, seção 30). Opcional: transferências com a IA no histórico público.
3. **Privacidade**: revisão do aviso por quem entenda de LGPD; decisão sobre a limpeza de contas sem uso (seção 17).
4. **B9**: painel de moderação (denúncias, banimento de identidade, filtro de apelidos), limites finais, teste de carga e teste fechado.

**Publicação:** nada publicado desta parte (precisa de `wrangler deploy`, sem migração de banco).

### 31.1 Quem espera quando um jogo para por lesão (revisão de 06/11/2026)
- **O adversário** está na mesma partida, então o jogo dele para junto. Antes ele via o jogo parado sem explicação; agora vê "adversário se machucou, volta em até N s" (`live-rival-injury`) e ainda pode mudar a tática (os comandos entram na fila e valem quando o jogo voltar). Se os dois forem humanos, só o lado que se machucou escolhe; o outro espera no máximo `INJURY_WAIT_MS`.
- **Os outros jogos da rodada** seguem normalmente: o relógio do evento é um só e cada jogo guarda o próprio minuto. O jogo parado recupera todo o atraso de uma vez quando a lesão é resolvida (os lances aparecem juntos) e o evento só termina quando ele também termina, no máximo 45 s depois do que terminaria.
- **Pausa do ADM:** o prazo conta no relógio do evento, que não anda pausado.
- **Problema achado e corrigido:** com o relógio no teto (120', prorrogação) uma lesão que ainda esperava nunca venceria o prazo e o evento travaria. Agora, no teto, entra o melhor reserva e a partida termina (`tests/leagueLiveInjury.test.ts`).


## 32. B9: moderação, limites finais e teste de carga (06/11/2026; parte local, sem custo)

### 32.1 Moderação (seções 6.2 e 6.3)
- **Denunciar** (`POST /api/report`, `src/online/moderation.ts`): na sala da liga, "Denunciar" ao lado de cada técnico (apelido) e "Denunciar esta liga" (só quem é membro). Motivos fechados (ofensivo, finge ser outro, propaganda, outro), **uma denúncia por pessoa e alvo**, ninguém denuncia a si mesmo. **3 pessoas diferentes** tiram o apelido (volta a "Técnico 4821", estável por identidade; as denúncias viram "atendidas") ou escondem a liga do diretório até o painel decidir.
- **Painel** (`/admin`, `server/admin.ts` e `adminPage.ts`): uma página só, sem bibliotecas, que fala com `/admin/api/*`. Só existe com o segredo **`ADMIN_TOKEN`** do Worker (guardado no painel do Cloudflare, mínimo de 16 caracteres; sem ele `/admin` responde 404). Mostra números (contas, ligas, técnicos, denúncias abertas, escondidas, banidos), denúncias abertas agrupadas por alvo (com o apelido ou nome de hoje), ligas escondidas e banidos, e faz: dispensar, trocar o apelido à força, **banir** e desbanir uma identidade, esconder, mostrar e fechar uma liga. Todo texto de gente entra na página por `textContent`; resposta com CSP sem fontes externas; tentativas erradas esbarram em `adminIp` (30 por minuto por IP).
- **Banir** = a chave passa a levar 403 `banned` em qualquer pedido (inclusive ao tentar entrar de novo com o código), o apelido volta ao pronto e a identidade sai de todas as ligas (cada clube volta à IA; se era ADM, o humano mais antigo assume). **Desbanir** devolve.
- **Banco:** migração `0003_moderation.sql` (tabelas `reports` e `bans`; só ids, motivo fechado e datas; sem IP). **Precisa ser aplicada no D1 remoto antes de publicar** (`wrangler d1 migrations apply meu-manager --remote`).
- **Filtro de apelidos:** entraram "bundão", "bundinha", "escroto", "vadia" e outras; "Bundesliga" continua passando (palavra inteira).
- **Testes:** `tests/onlineModeration.test.ts` (6), ponta a ponta `tools/online-lab/b9-mod-e2e.mjs` (4 técnicos, denúncia repetida recusada, 3 denúncias tiram o apelido e escondem a liga, painel com segredo errado e certo, banir e desbanir; capturas `.shots/b9-mod-*.png`).

### 32.2 Limites finais (seção 6.1)
Achado: o limite por **IP** das leituras e escritas era o mesmo número do limite por **identidade** (120 e 30 por minuto). A sala da liga consulta a cada poucos segundos e o mercado a cada 8 s (~35 pedidos por minuto por pessoa): **3 a 4 pessoas no mesmo Wi-Fi (ou numa operadora com CGNAT) se bloqueariam**. Agora o IP tem `readIp` (2.400 por minuto) e `writeIp` (600 por minuto) e a identidade continua em 120 e 30; as demais ações ficam como estavam (os tetos por IP de saves, criar liga e entrar por código já eram folgados). Novos: `report` (10 por hora e 30 por dia por identidade, 300 por dia por IP) e `adminIp`. Teste: `tests/onlineLimits.test.ts` (5 pessoas no mesmo IP, 100 consultas por minuto cada, ninguém bloqueado; uma pessoa só passando de 120 é barrada). **Os valores finais só se confirmam com gente de verdade no teste fechado.**

### 32.3 Teste de carga: liga cheia passando pela virada (`tools/loadLeague.ts`)
`PACOTE_REAL=1 node --expose-gc tools/run.mjs loadLeague --humans 20`: mundo real de 370 clubes e 10.471 jogadores, **20 técnicos em 19 países**, resultado direto, passos de 2 h, cada mudança do mundo gravada no `SqliteWorldStore` (mesmo formato do Durable Object), **420 dias de mundo** com as viradas de temporada dos países (dias 179, 274 e 369; alguns países dos humanos ainda não tinham virado no dia 420).

| Medida (Node, máquina de desenvolvimento) | Valor |
|---|---|
| Passos do alarme / com partida humana | 5.040 / 330 |
| CPU por passo: mediana / p95 / p99 / pior | 0 ms / 156 ms / 953 ms / **3.265 ms** (uma virada) |
| CPU total dos 420 dias | 171 s |
| Viradas de temporada (CPU) | 1,1 a 3,3 s cada |
| Gravações / linhas gravadas | 526 / 34.603 (mediana 56 por gravação, máx 231) |
| Gravar: mediana / pior | 135 ms / 329 ms |
| Maior linha | 926 KB (limite do SQLite do Durable Object: 2 MB) |
| Banco no fim | 225 linhas, 22,9 M caracteres |
| Heap vivo no começo / maior vivo / **depois de recarregar do SQLite** | 32 MB / 65 MB / **90 MB** (carga de 208 ms) |
| Pico com lixo (o coletor do Node não aperta) | 262 MB |

**Leitura honesta da memória:** o limite é de **128 MB por Durable Object**. O mundo vivo cabe (65 MB) e a pior carga (recarregar tudo do SQLite depois de reiniciar) chega a **90 MB só de dados**, fora o código do motor e o "lastro" que a plataforma põe ao reiniciar o objeto (~75 MB medidos na B5). **Em Node isso não prova nada a favor nem contra**; a folga real só aparece no Cloudflare. Se a medição na nuvem mostrar que a recarga completa não cabe com 20 técnicos, a saída já prevista é a **etapa 2 da B5 (carga por partes)**: abrir só os blocos dos clubes que jogam naquela data; a recarga completa é o pior momento e só acontece depois de reinício.

**Projeção de custo** (preços do Cloudflare como eu os conheço, a confirmar na página de preços; premissas escritas na saída da ferramenta: 20 técnicos, 51 sessões de 10 minutos cada, 150 pedidos por sessão, objeto de 128 MB, ~420 dias de mundo por temporada):

| Ligas cheias ativas | Pedidos/mês | GB-s/mês | Linhas/mês | CPU/mês | Armazenamento | Custo |
|---|---|---|---|---|---|---|
| 1 | 11 mil | 866 | 2,5 mil | 12 s | ~0 | US$ 5 (plano) |
| 100 | 1,1 M | 87 mil | 249 mil | 20 min | 2,2 GB | ~US$ 5 |
| **500** | 5,6 M | 433 mil | 1,24 M | 1,7 h | 11,2 GB | **~US$ 7,35** |

Tudo dentro do que o plano de US$ 5 já inclui, exceto o armazenamento acima de 5 GB (US$ 0,20 por GB). O que mais pesa é o **tempo de objeto ativo durante as sessões dos técnicos** (premissa de 15% de uso em 10 minutos), não o motor. **500 ligas cheias de verdade (10 mil pessoas) só se medem no Cloudflare**, com gente conectada (partidas ao vivo mantêm o objeto acordado por 6 a 20 minutos por evento): fica para o teste fechado e para a medição na nuvem abaixo.

### 32.4 O que falta da B9 (precisa de você)
1. **Publicar a moderação:** aplicar a migração `0003` no D1 remoto, criar o segredo `ADMIN_TOKEN` no painel do Cloudflare (você escolhe; 32 caracteres aleatórios) e `wrangler deploy`. Sem custo novo.
2. **Medir a memória no Cloudflare** com a liga cheia (Worker de laboratório descartável, como na B5: 20 técnicos, o mundo real, a virada de temporada, com lastro crescente até achar o teto): custo desprezível dentro do plano de US$ 5 (alguns minutos de objeto), mas é uso de conta.
3. **Teste fechado** com 50 a 100 pessoas (custo real e limites) e a **revisão de LGPD** do aviso de privacidade.


## 33. B9: moderação publicada e memória da liga cheia no Cloudflare (06/11/2026)

**Publicação da moderação.** Migração `0003_moderation.sql` aplicada no D1 remoto e `wrangler deploy` (versão `d10697fc`). `/admin` responde 200 e a API do painel 401 sem o segredo `ADMIN_TOKEN` (criado por você no Worker, em Produção).

**Memória no Cloudflare (Worker de laboratório descartável).** A `LeagueRoom` de verdade (`server/leagueRoom.ts`) com o mundo real lido do bucket de pacotes (370 clubes, 10.471 jogadores), **20 técnicos em 19 países**, resultado direto, o ADM avançando até **todas as pirâmides virarem a temporada** (225 avanços, 2026-01 a 2027-07-04, banco de 21,3 MB), com recarga completa do SQLite no meio (o pior momento), repetido com lastro crescente no heap (cada bloco ≈ 0,75 MB; `tools/online-lab/ceiling-liga.mjs`).

| Lastro (blocos ≈ MB) | Resultado |
|---|---|
| 0, 30, 60, 90, 120, 135 | concluiu, sem reiniciar o objeto |
| 150 | concluiu, mas a plataforma **reiniciou o objeto uma vez** (bloco 14) e ele seguiu certo, recarregando do SQLite |
| 180, 240 | o objeto morreu (falha de conexão) |

**Leitura.** O teto fica entre ~135 e ~150 blocos de lastro (~100 a 110 MB de heap extra) além do que a liga cheia já usa: a liga cheia de 20 técnicos **cabe com folga de cerca de 2 a 3 vezes**, inclusive na recarga completa do SQLite (360 a 600 ms normais; até 1,4 a 1,6 s quando o heap já está apertado). Nada indica a necessidade da etapa 2 da B5 (carga por partes). Quando a plataforma reinicia o objeto, a liga se recupera sozinha do SQLite.

**Tempos.** Criar a sala: 1,8 a 2,9 s; iniciar: ~0,25 s. O pior bloco de **15 avanços do ADM numa só chamada** levou 19 a 28 s (inclui viradas de temporada); um avanço de cada vez é o uso real (o pior é uma virada, ~3 s no Node). Atenção: o limite de 30 s de CPU por chamada vale para uma chamada; blocos desse tamanho só existem no laboratório.

**Limpeza.** Worker de laboratório apagado (`wrangler delete`, o que remove o armazenamento dos objetos), a `LAB_KEY` descartada (nunca esteve no repositório), nada de teste no D1 nem no R2.

**Falta da B9:** teste fechado com 50 a 100 pessoas (custo real e limites) e a revisão de LGPD do aviso de privacidade.


## 34. Preparação do teste fechado e da revisão de LGPD (06/11/2026; código pronto, nada publicado)

**Relatar problema** (`src/online/problemApi.ts`, `src/ui/techInfo.ts`, `src/ui/components/ReportProblem.tsx`; botão no menu inicial, no painel do clube e na sala da liga). Anônimo: sem conta e sem IP gravado. Categoria, descrição (até 1.000 caracteres), imagem opcional (reduzida no aparelho, JPEG de até ~150 KB, conferida no servidor pelos primeiros bytes) e informações técnicas de uma **lista fechada** (versão, tela, família do navegador e do sistema, tamanho de tela, últimas mensagens de erro sem endereços...) que a tela mostra antes do envio e a pessoa pode desmarcar; o identificador da liga só entra se ela marcar. Servidor: `POST /api/problem` (6 por hora e 20 por dia por IP, teto de 300 por dia no servidor, corpo de 300 KB), D1 `problem_reports` (migração `0004_problems.sql`) e imagem no R2 privado `problems/<id>.jpg`; retenção de **90 dias** (limpeza ao abrir o painel).

**Painel de uso e custo** (`/admin`): ativos em 24 h, 7 e 30 dias, ligas rodando e técnicos nelas, contas, ligas e relatos novos por dia, estimativa do mês pelo modelo da B9 (`estimateMonth`) e a lista de problemas (abrir com imagem e dados técnicos, resolver, apagar). A conta de verdade continua sendo o painel de cobrança do Cloudflare (roteiro e alertas em `docs/teste-fechado.md`).

**Retenção de denúncias** (achada na revisão para o LGPD): denúncia decidida some em 90 dias e "apagar minha conta" apaga as denúncias feitas por ou contra a pessoa (o banimento fica). O aviso de privacidade ganhou as seções "Denúncias e moderação" e "Relatar problema".

**Documentos:** `docs/teste-fechado.md` (convite para o WhatsApp com o endereço `?online=1`, roteiro de teste, como ler relatos, como acompanhar uso e custo, alertas, lista antes de convidar) e `docs/lgpd-para-revisor.md` (todos os dados no aparelho e no servidor, onde, para quê, quanto tempo, como ver e apagar; lacunas marcadas como NÃO IMPLEMENTADO; perguntas ao revisor; **menores de idade: opções A a E com o que cada uma muda no jogo e a recomendação "A agora, B depois"**). Lacunas que o documento declara: limpeza de contas e saves por 12 meses sem uso (desligada), arquivar ou apagar ligas inativas e registros de ligas fechadas, exportação sem ligas e denúncias, nenhum canal de contato nem encarregado, nenhum termo de uso, chave e código sem criptografia no aparelho.

**Testes:** `tests/onlineProblem.test.ts` (6), `tests/onlineModeration.test.ts` (7, com a retenção), ponta a ponta `tools/online-lab/b9-problem-e2e.mjs` (formulário com imagem, informações técnicas visíveis, envio, painel com imagem, resolver, limites; capturas `.shots/b9-problem-*.png`). Suíte rápida: 1357 testes passando.

**Publicação (pendente, precisa do seu OK):** migração `0004` no D1 remoto, `wrangler deploy` do Worker e o site no GitHub Pages (as telas novas e o aviso de privacidade são do site).

## 35. Faixa de idade e modo protegido para menores (07/11/2026; código pronto, nada publicado)

**Decisão do projeto** (opção B da seção 9.3 do `docs/lgpd-para-revisor.md`, com faixas): menos de 12 anos, só a carreira solo; de 12 a 15, online em **modo protegido**; **16 ou mais**, tudo liberado. **A idade de liberação total (16) é uma configuração:** `FULL_ACCESS_AGE` em `src/online/agePolicy.ts`; se o revisor de LGPD exigir 18, troca-se só essa constante (um teste exige que ela seja uma fronteira de faixa; hoje há fronteiras em 12, 16 e 18). **Decisão a confirmar com o revisor antes do lançamento:** a pergunta explícita está no documento (seção 9.4).

**Como funciona.** Ao criar a conta a pessoa marca **só a faixa** (`under12`, `12-15`, `16-17`, `18+`); nunca a data de nascimento. O servidor confere (a trava não depende do aparelho): `POST /api/identity` exige `ageBand` em conta nova (`age-required`), recusa menos de 12 (`too-young`, antes do Turnstile e sem gravar nada) e, no modo protegido, **gera o apelido** (`autoNickname`, "Técnico NNNN") ignorando o que o aparelho mandar. Coluna `age_band` em `identities` (migração `0005_age_band.sql`); a faixa volta na resposta (quem entra com o código em outro aparelho a recebe) e na exportação de dados. No modo protegido: `PUT /api/me` (trocar apelido) dá 403 `protected-account`; criar liga aberta, listar o diretório e entrar em liga aberta dão 403 `protected-account`; criar liga exige um nome de `PROTECTED_LEAGUE_NAMES` (12 nomes; `protected-name`). **Contas sem faixa (as de teste anteriores) valem como protegidas.**

**Telas.** Criar conta: escolha da faixa primeiro (menos de 12 mostra o aviso e nada mais; 12 a 15 explica o modo protegido e não pede apelido; 16+ pede o apelido como antes). Online: sem "Procurar ligas abertas"; criar liga com o nome numa lista e "só amigos" fixo; "Dados e conta" mostra o apelido fixo. Aviso de privacidade: seção "Crianças e adolescentes" nova (acompanha as constantes) e versão `2026-11-07`.

**Testes.** `tests/onlineAge.test.ts` (7), ajustes nos de identidade, liga, limites e moderação (contas nascem com faixa), `tools/online-lab/b9-age-e2e.mjs` (menos de 12, 12 a 15 com liga criada e apelido fixo, 16+ liberado; capturas `.shots/b9-age-*.png`) e os e2e antigos marcam a faixa ao criar a conta.

**Limites declarados:** faixa autodeclarada (burlável); a faixa não muda depois de criada; liga de amigos do modo protegido pode ter adultos (por convite); "Relatar problema" segue aberto a todas as idades. Tudo isso está como **[PERGUNTA]** no documento do revisor.

**Publicação (pendente, precisa do seu OK):** migração `0005` no D1 remoto, `wrangler deploy` do Worker e o site no GitHub Pages. **Atenção:** publicar o site sem o Worker (ou o contrário) quebra a criação de conta (o site novo manda `ageBand`, o Worker antigo recusa campo desconhecido; o Worker novo exige a faixa de quem usa o site antigo): publicar na ordem migração, Worker, site, em seguida.
