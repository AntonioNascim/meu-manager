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
- **Código de recuperação:** 12 palavras que **derivam a chave** (o servidor não guarda segredo e não consegue recuperá-lo). Trocar de aparelho = digitar o código. **Tela (decisão de 03/11/2026):** aviso claro de que, sem o código, quem perder ou trocar de celular perde a carreira e as ligas; as 12 palavras aparecem na criação e a pessoa só segue depois de digitar 3 palavras sorteadas; depois, o código pode ser visto de novo em Menu › Código de recuperação (escondido até um toque) enquanto o aparelho tiver a identidade. O código fica guardado **neste aparelho** (junto da chave, que já dá o mesmo acesso), nunca no servidor.
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
| Identidade: chave pública, apelido, data de criação, última visita | D1 | Reconhecer o aparelho; mostrar nas ligas | Enquanto a conta existir; apagada 12 meses depois da última visita |
| Código de recuperação | **Só com você e neste aparelho** (nunca no servidor) | Trocar de aparelho; rever pelo menu | Até você apagar a conta ou os dados do navegador |
| Saves da carreira solo (se você ligou a nuvem) | R2, pedaços comprimidos | Continuar em outro aparelho | Até você apagar ou 12 meses sem entrar |
| Ligas online: participantes, clubes, mercado, resultados, o mundo da liga | Durable Object | Fazer a liga funcionar | Enquanto ativa; arquivada 90 dias; depois apagada. Nomes de técnicos em ligas apagadas viram "Técnico removido" |
| Denúncias e bloqueios | D1 | Moderar | 12 meses |
| Endereço IP | **Não gravamos.** Usado só no instante do pedido para limitar abuso | Segurança | Minutos |
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
> **Código de recuperação.** Ao criar a conta anônima você recebe um código de 12 palavras. Ele é a única forma de levar seus jogos para outro aparelho. **Nós não guardamos esse código e não podemos recuperá-lo**; ele fica só no seu aparelho, e você pode revê-lo no menu. Quem tiver o código tem acesso à sua conta; guarde-o em lugar seguro.
>
> **Quem vê o quê.** Os outros jogadores de uma liga veem o seu apelido, o seu clube e o que acontece na liga (jogos e transferências). Ninguém vê os seus jogos salvos da carreira solo.
>
> **Por quanto tempo.** Apagamos a sua conta e os jogos salvos na nuvem depois de **12 meses sem você entrar** (avisamos dentro do jogo nas últimas semanas). Ligas inativas são arquivadas e depois apagadas. Você pode **apagar tudo agora** em Menu › Privacidade › "Apagar minha conta e meus dados".
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
