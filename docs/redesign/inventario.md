# Inventário de telas e funções (base do redesenho)

Regra do redesenho: **nenhuma função ou botão some.** Só a aparência e a organização mudam. Este documento é a lista de conferência: ao redesenhar uma tela, cada linha abaixo precisa continuar existindo (mesmo que em outro lugar, em outro formato ou atrás de um toque).

Fonte: leitura de `src/ui/` (telas, abas e componentes) em 09/11/2026. Marcações: **[solo]** só na carreira solo, **[online]** só na liga online, sem marca = nos dois. Atalhos de desenvolvimento (`?tela=`, `?aba=`…) e a tela `Diagnostics` (`?diagnostico=1`) não são parte do jogo e ficam fora.

Estrutura geral: antes do jogo existe o **Menu inicial** (`Start`) e suas telas; dentro do jogo existe o **casco** (`App`: cabeçalho, avisos, barra de baixo) e as telas de dentro.

---

## 1. Antes do jogo

### 1.1 Menu inicial (`Start.tsx`)
- Logo, nome "Meu Manager", legenda "Jogo de técnico de futebol".
- Faixas no topo: **PwaBanner** (versão nova do jogo → *Atualizar*; *Instalar*; dica de instalar no iPhone; fechar) e **PackageUpdateBanner** ("Elencos atualizados." → atualizar / *Agora não*).
- Cartão **Continuar** (último save: `SlotInfo` com time, temporada, data; selo "Na nuvem") + botão *Continuar*.
- Botões: *Novo jogo* · *Novo jogo com pacote de dados* · *Editor* · *Carregar* (desligado sem save) · *Importar save de um arquivo* · *Créditos e avisos* · *Relatar problema*.
- Lembrete amarelo do código de recuperação (*Ver*) quando a conta não confirmou o código.
- Cartão **Online**: sem conta → texto explicativo, *Criar minha conta online*, *Já tem uma conta? Entrar com o código de recuperação*; com conta → apelido e data, *Ligas online*, *Saves na nuvem (N de 3)*, *Código de recuperação*, *Dados e conta*. (Só aparece onde o online está liberado.)
- Mensagens de erro e de sucesso (importação).

### 1.2 Carregar (visão `load` do menu)
- 3 cartões "Espaço 1/2/3": `SlotInfo` ou "Vazio"; *Carregar*, *Exportar* (baixa `.json`), *Excluir* (com confirmação).
- *Importar save de um arquivo* (abre o seletor de arquivo e depois o **SlotPicker**: "Em qual espaço guardar o save importado?", espaços com conteúdo/Vazio, *Cancelar*).
- *Voltar*.

### 1.3 Novo jogo (`NewGame.tsx`)
- Cabeçalho "Meu Manager", *Voltar*.
- Abas **Mundo real** / **Mundo fictício** (e seletor de versão dos elencos quando há mais de uma). Estado de download ("Elencos:", "Só na primeira vez…", erro com *Tentar de novo* ou "comece com o mundo fictício").
- Escolha de país, liga e clube (lista de times com escudo, força; "Toque em um time para escolher."), espaço de save (SlotPicker), *Começar*.

### 1.4 Novo jogo com pacote de dados (`ImportPackage.tsx`)
- *Voltar*, *Escolher arquivo*, lista "Pacotes guardados neste navegador" (*Usar*, *Apagar*), problemas de validação ou resumo e créditos do pacote, "Este pacote não pode ser usado.", *Escolher o time*.

### 1.5 Editor de pacotes (`editor/*`)
- Escolha do pacote (zero, padrão, 15 ligas, 21 ligas, guardados, importar) e *Voltar*.
- Área de trabalho com abas: **Pacote**, **Ligas**, **Clubes**, **Jogadores**, **Copas**, **Planilhas** (CSV: exportar/importar jogadores e clubes), **Problemas (N)**; desfazer/refazer, gravação automática, *Jogar com este pacote*.
- Campos de cada aba (nome, cores, estádio, reputação, jogadores com atributos, posição, "gerado", "data estimada", copas, etc.). Ao mudar o pacote (`types.ts`), o editor acompanha.

### 1.6 Créditos e avisos (`Credits.tsx`)
- *Voltar*; Jogo independente; Dados do mundo real (Wikipedia CC BY-SA, Wikidata CC0, visualizações Wikimedia); Fontes (Inter, Barlow Condensed); lista de artigos consultados (baixa o arquivo; erro "Não foi possível baixar o arquivo…").

### 1.7 Relatar problema (`ReportProblem.tsx`, em vários lugares)
- Janela: *Fechar*, "O que aconteceu?" (texto), *Tirar a imagem*, caixa "Estou numa liga online: incluir o identificador da liga", *Ver o que será enviado*, enviar.

---

## 2. Conta online (`screens/online/*`) — a partir do menu › Online

- **Criar conta** (`CreateAccount`): faixa de idade (menos de 12, 12–15, 16–17, 18+), explicação do **Modo protegido**, apelido (regras de 3 a 16 caracteres), verificação anti-robô (`Turnstile`, erro com *Tentar de novo*), link do aviso de privacidade, *Criar*, *Cancelar*.
- **Entrar com o código** (`RecoverAccount`): campo do código, o que acontece, verificação anti-robô, *Entrar*, *Cancelar*.
- **Código de recuperação** (`RecoveryCode`): aviso de guardar; código escondido até o toque (*Mostrar o código*, some em 30 s, *Esconder agora*), *Copiar*, *Baixar arquivo*, *Já guardei*, *Voltar*.
- **Saves na nuvem** (`CloudSaves`): 3 espaços (*Ligar e enviar agora* / *Agora não*, *Enviar agora*, *Baixar para este aparelho*, desligar), o que sobe/quando/onde fica/para sair, uso (até 5 MB por espaço, cópias de 7 dias), **conflito** ("Este espaço foi jogado em dois aparelhos": *Manter esta e enviar para a nuvem* / *Usar a da nuvem neste aparelho*), aviso sem conexão, *Voltar*.
- **Dados e conta** (`AccountData`): apelido (*Salvar apelido*), *Ver o código*, *Ler o aviso de privacidade*, *Baixar meus dados*, *Apagar minha conta…* (confirmação com lista do que acontece, *Apagar minha conta*, *Cancelar*), *Voltar*.
- **Aviso de privacidade** (`PrivacyNotice`): 13 seções (O que guardamos, O que não guardamos, Denúncias e moderação, Relatar problema, Sem internet, Código de recuperação, Quem vê o quê, Por quanto tempo, Seus direitos, Servidores e verificação anti-robô, Crianças e adolescentes, Mudanças…), *Voltar*.

### 2.1 Ligas online (`online/leagues/*`)
- **Hub** (`LeaguesHub`): *Criar uma liga*, *Procurar ligas abertas*, *Entrar com um código de convite*, aviso do modo protegido, **Minhas ligas** (lista com `LeagueCard`).
- **Criar liga** (`CreateLeague`): nome da liga (ou lista de nomes no modo protegido), quem pode entrar (*Só amigos* / *Aberta*), mundo (*Mundo real* / *fictício*), máximo de técnicos (*Menos* / *Mais*), ritmo, horário dos jogos (fuso de Brasília), partidas (*Assistir ao vivo* / *Resultado direto*), criar.
- **Ligas abertas** (`OpenLeagues`): lista com vagas, *Ver mais*, estados vazio e carregando.
- **Entrar com código** (`JoinByCode`): campo e entrar. Link `?convite=` abre direto.
- **Escolha do clube** (`ClubPicker`): busca (clube, sigla, cidade), filtro de liga, lista de clubes livres, *Escolher outro*.
- **Sala da liga** (`LeagueRoomScreen`): convite (código, copiar/compartilhar), técnicos e clubes (ADM, *Passar ADM*, *Remover*, *Denunciar*), "Seu clube", *Escolher meu clube*, clube reservado (código de vaga), *Iniciar a liga* (ADM), *Trocar o código de convite*, *Sair da liga* (confirmação, *Ficar*), *Denunciar esta liga*, *Relatar problema*, estados "Liga não encontrada"/"Entrada fechada".
- **Sala em andamento** (`LeagueRunning`): próxima rodada/rodada em andamento/liga pausada, calendário no fuso do aparelho, **Pronto** (e quem está pronto/falta, saindo, sem jogo), últimas transferências e acontecimentos, ADM: *Avançar* (confirmação), *Pausar/Retomar*, ritmo, entrada aberta/fechada, sugestões de ausência.
- **Painel do ADM** (`AdminPanel`, botão "ADM" só para o ADM): informações (código, ritmo, temporada, data do mundo, clube), tempo (*Avançar até o próximo jogo*, *Pausar/Retomar a liga*, *Mudar o ritmo*), código de vaga (*Escolher um clube e gerar o código*, cancelar), entrada de técnicos novos, técnicos (última vez, *Passar o cargo*, *Remover*, *Confirmar*), *Voltar*.
- **Cartão da liga no Painel** (`LeagueCard`) [online]: "Liga online", *Pronto*, *Entrar na partida*, *Sala da liga*, *Minha carreira* (`OnlineCareer`: passagens por clube), aviso "Seu clube não joga na próxima rodada".
- **Mercado entre técnicos** (`LeagueMarket`, `CoachesTab`): abas Técnicos / Propostas / Histórico; *Ver elenco*, *Comprar*, *Emprestar*, propostas (*Aceitar*, *Contrapropor*, *Recusar*, *Retirar*, encerradas), histórico público, *Denunciar* transferência, *Voltar*.
- **Demitido na liga** (`LeagueDismissed`): "Você foi demitido", *Escolha outro clube* (lista de clubes livres), "Nenhum clube livre agora…", *Voltar ao menu*.
- **Denúncia** (`ReportSheet`): motivo (Ofensivo, Finge ser outra pessoa ou o jogo, Propaganda ou lixo, Outro motivo), *Enviar denúncia*, *Fechar*.

---

## 3. Casco do jogo (`App.tsx`)

- **Cabeçalho fixo:** no Painel, "Meu Manager" + estado do salvamento ("· salvo", "· salvando…", "· não salvou: …"); nas outras telas, escudo, nome do clube e data do jogo + estado do salvamento. Botão **Menu** (solo: grava e volta ao menu; online: fecha o espelho da liga).
- **Faixa vermelha** [online] "Sem conexão: você vê o último estado da liga…" (`offline-banner`).
- **Faixa de aviso** "Esta ação ainda não está disponível na liga online…" (`blocked-banner`, some em 4 s).
- **Barra de baixo (5 abas):** Clube, Elenco, Mercado, Tabela, Finanças (com bolinha de alerta em Elenco e Mercado). Tática, Partida, Contratos, Base, Treino acendem a aba do dono delas.
- **BusyOverlay** ("Preparando a temporada… Isto pode levar alguns segundos num celular mais simples. Não feche o jogo.").
- **Demitido** (`Dismissed`, solo): "Você foi demitido", *Procurar emprego* (Carreira), *Começar um novo jogo*.
- **Carreira** (`Career`, `JobList`): "Reputação como técnico", "Sua carreira" (histórico), "Propostas de outros clubes", vagas (*Assumir* / *Confirmar*).

---

## 4. Painel do clube — aba Clube (`Dashboard.tsx` + `dashboard/*`)

De cima para baixo:
1. **Central de avisos** (`NoticeCenter`): decisão pendente da base, propostas recebidas, pré-contrato perdido, contratos no último ano, lesionados e suspensos, jovens novos na base, janela de transferências; cada aviso leva à tela e aba certas.
2. **Próximo jogo** (cartão principal): competição, rodada/fase, data, local, escudos, posição e forma do adversário (tocar no escudo abre o **OpponentOverlay**/`TeamPage`), *Ver tática e escalação provável*; "Condição média dos titulares"; caso sem jogo: "Sem jogos agendados." / "A temporada terminou.".
3. **Botão principal:** [solo] *Avançar* / *Ir para a partida* / *Decidir sobre a base* / *Encerrar a temporada* (confirma contratos que vencem). [online] `LeagueCard` no lugar (Pronto, Entrar na partida, Sala da liga, Minha carreira).
4. **Grade de 10 atalhos** (bolinha de pendência): Elenco, Escalação, Tática, Base, Treino, Mercado, Contratos, Finanças, Tabela, Histórico; mais **ADM** [online, só o ADM].
5. **Mini classificação** (`MiniTable`): seu time com dois acima e dois abaixo, forma, seus últimos jogos; *Ver tabela*.
6. **Copas** (`CupCard`): caminho do time, *Ver chaveamento*.
7. **Destaques do elenco** (`Highlights`): artilheiro, garçom, melhor nota média.
8. **Treino** (cartão: plano atual, *Mudar*).
9. **Último jogo** (placar, resumo).
10. **Diretoria:** status (chip), meta, "abaixo do Nº lugar você é demitido", confiança (barra), posição de hoje.
11. **Orçamento:** saldo em caixa, orçamento de transferências, folha no orçamento.
12. *Relatar problema*.

---

## 5. Elenco (`Squad.tsx`) — abas Jogadores, Escalação, Números, Base, Treino

- **Jogadores** (`Players`): filtros por setor, ordenação e inverter a ordem; linha de jogador (camisa, bandeira, nome, posição, idade, força, moral, condição, "força no mês", lesão, suspensão, pendurado); tocar abre o **Detalhe do jogador** (`PlayerDetail`: atributos, força por posição, estado atual, forma, lesão, suspensão, amarelos, evolução da força, temporada, contrato: salário, término, multa; potencial estimado; estrela de favorito; *Vender, emprestar ou liberar* → `SellSheet`: venda a clube interessado, empréstimo, anúncio, *Liberar*; *Fechar*).
- **Escalação** (`Lineup`): campo com os 11 (`FieldLineup`/`GridPitch`: tocar e trocar, arrastar para mudar posição), reservas, banco, formações prontas, **Escalações salvas** (3 espaços: guardar a atual, carregar, renomear, excluir), *Sugerir escalação automática*, estilo e mentalidade (`StyleControls`), **Próximo adversário** (`NextOpponent`: formação, estilo, mentalidade, *Ver a escalação provável dele*), aviso de limite de estrangeiros (`ForeignNote`), "Indisponível".
- **Números** (`Numbers`): tabela de estatísticas da temporada por jogador, ordenar por coluna (jogos, minutos, gols, assistências, cartões, nota), suspenso/pendurado.
- **Base** (`Academy`): "Categorias de base", jovens (potencial em estrelas), *Promover*, *Dispensar*, *Decidir* (quem fez 20 anos), base vazia.
- **Treino** (`Training`): cartões de intensidade (Leve/Normal/Intensa com evolução, recuperação, risco de lesão), foco, **Treino individual** (escolher jogador, atributo ou posição, andamento, *Cancelar*), "Quem mais evolui".

## 6. Tática (`Tactics.tsx`)
- Formação (prontas + "Livre"), força do time na formação, campo com posicionamento por arrasto (grade de 26 pontos), estilo (5) e mentalidade (`StyleControls`), capitão e cobradores (pênalti, falta), *Sugerir escalação automática*, titulares/reservas com trocas, escolher jogador ("Escolher…"), indisponíveis.

## 7. Partida ao vivo (`Match.tsx` + `match/*`)
- **Placar** (escudos tocáveis → adversário, tempo/"Intervalo"/"Fim de jogo", **botão único de velocidade** 1x/2x/4x/8x).
- **Controles:** antes do jogo *Começar* + *Ir ao fim*; no jogo *Pausar/Continuar* + *Ir ao fim*; no intervalo *Começar o 2º tempo*; antes da prorrogação *Começar a prorrogação*; fim: *Concluir partida* [solo] / *Voltar ao painel* [online]. [online] *Voltar ao jogo* no intervalo (espera o adversário), aviso "O intervalo dura até 1 minuto".
- Antes do minuto 0: competição, rodada, data, local, *Ajustar tática e escalação*, caminho da copa (`CupPathLine`) e nota da ida (`FirstLegNote`).
- Avisos de lesão ("✚ …"; escolher o reserva ou *Seguir com um a menos*), jogada rejeitada [online].
- **Campo 2D** (`Pitch`): jogadores com número, bola, setas de passe/cruzamento/chute, marcações (Gol, Gol contra, Defesa, Para fora, Escanteio, Falta, Cartão amarelo/vermelho), "pausado", câmera lenta em lances.
- **Abas:** **Jogos** (outros jogos da rodada com placar revelado pelo relógio; `Others`/`OnlineOthers`), **Dados** (posse, finalizações, no alvo, escanteios, faltas, cartões, xG), **Tática** (estilo, mentalidade, formação, "Posição dos jogadores" por arrasto; "Pause o jogo para mexer na tática", "A formação só muda com 11"), **Trocas** (campo com titulares, banco, "Substituições restantes", "Paradas além do intervalo", escolher quem entra por lesão).
- **Lances ao vivo:** lista com minuto e narração, *Mostrar faltas*.
- Estados: "Seu clube não joga agora…" [online] (*Ir ao painel*), "Não consegui conectar à partida…", "Não há partida do seu time agora…".

## 8. Mercado (`Market.tsx` + `market/*`) — abas com rolagem: Buscar, Favoritos, Listas, Livres, Pré-contrato, Propostas, Histórico, Contratos (+ Técnicos [online])
- Cabeçalho: orçamento de compras, elenco (N/30), faixa "Janela de transferências aberta/fechada".
- **Buscar:** campo de texto, atalhos (Cabem no bolso, Barganhas, Jovens promessas, Contrato acabando), ordenação, **Filtros** (`FilterSheet`: série/país, grupo e posição, nacionalidade, situação, faixas de força/idade/valor/salário com duas alças, *Limpar*, "Ver N jogadores"), lista com interesse; tocar abre a **Negociação** (`Negotiation`: valor de mercado, interesse, salário atual/que aceitaria, compra ou empréstimo, valor, salário mensal, duração, *Enviar proposta*; estrela de favorito).
- **Favoritos**, **Listas** (Transferência / Empréstimo / Meus: *anunciar ›*, *negociar ›*, *Remover*), **Livres**, **Pré-contrato** (*pré-contrato ›*, custo grátis, salário, duração), **Propostas** (Recebidas: *Aceitar*/*Recusar*; Enviadas), **Histórico** (Minhas / Do campeonato), **Contratos** (`Contracts`: renovações, "Anos a mais", *Propor renovação*, *Voltar*).

## 9. Tabela (`Standings.tsx` + `standings/*`) — seletor de série e abas: Classificação, Rodadas, Artilharia, Assistências, Cartões, Copas, Histórico
- **Classificação:** setas entre temporadas passadas; colunas J V E D GP GC SG Pts; últimos 5; faixas de campeão, acesso e rebaixamento com legenda; seu time destacado; tocar num time abre a **Página do time** (`TeamPage`: posição, pontos, força, últimos resultados, próximo jogo, elenco, `TacticSection`, ‹ Voltar).
- **Rodadas:** setas de rodada, jogos com escudos/placar/estádio; tocar no placar abre o **resumo** (gols, assistências, cartões).
- **Artilharia / Assistências / Cartões:** pódio ouro-prata-bronze, filtros (Geral, Casa, Fora, Brasileiros, Sub-23; Passes, Cruzamentos; Amarelos, Vermelhos).
- **Copas:** Chaveamento, Jogos, Artilharia da copa; "Este mundo não tem copas…".
- **Histórico:** campeões, subiram/caíram, campeões das copas, temporadas encerradas.

## 10. Finanças (`Finance.tsx` + `finance/*`)
- **Caixa** em destaque com confiança da diretoria; alerta de risco; *Pedir verba*; **Orçamento** (barra que divide salários e compras); folha e folga por mês; categorias de receita e despesa; renda média em casa; **Extrato** (lançamentos com data), **Balanço da temporada** (contra a anterior), **Ingresso** (preço por torcedor, *Baixar/Subir o preço*, *Usar*; nota sobre lotação).

## 11. Peças compartilhadas que a nova identidade precisa cobrir
Painel (`Panel`), `Eyebrow`, `Crest` (escudo gerado), `ResultDot`, `SegmentedBar`, `ProgressBar`, `ShortcutTile`, `BottomNav`, `TopTabs` (com rolagem), `Sheet` (janela de baixo para cima), `RangeSlider`, `Icon`, bandeiras (`flags`), carinha de moral, barra de condição, selo de força (`ValueBadge`), camisa nas cores do time, `Button`/`Card` (`components/ui.tsx`), `SlotInfo`, `SlotPicker`, `BusyOverlay`, banners (PWA, pacote), `ReportProblem`.

## 12. Restrições a manter
- Mobile-first (380 px), alvos de toque de 48 px no mínimo, barra de baixo com 5 abas.
- Rótulos de valores de tipos vêm de `labels.ts`; textos da interface em português do Brasil.
- Escudos sempre gerados (nunca oficiais); aviso de jogo independente; créditos da Wikipedia visíveis.
- O campo 2D, a grade de arrasto e a partida online (relógio do servidor) não mudam de comportamento.
- Fontes e imagens entram no bundle e no cache offline do PWA (nada de CDN em produção: se a nova identidade usar outras fontes, empacotar por `@fontsource`).
- Acessibilidade: contraste suficiente e opção de reduzir movimento (`prefers-reduced-motion`) para as animações novas.
