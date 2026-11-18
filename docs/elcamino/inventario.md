# El Camino DT — inventário de funções (estudo)

Estudo feito em 18/11/2026 no site público do concorrente (https://elcaminodt.com/), em português, no celular (430 px) e no computador (1280 px), com uma carreira de verdade (Flamengo, Brasileirão Série A, temporada 2027). Mais os dois vídeos de `docs/elcamino/videos`, filmados da tela, e uma gravação própria da partida.

Capturas, textos e vídeos ficam em `.shots/elcamino/` (fora do Git, só para estudo). Este documento descreve funções, não copia textos, layout, cores ou imagens.

**Como ler a confiança de cada item:** **[visto]** = abri e usei; **[vídeo]** = só aparece nos vídeos do usuário; **[não visto]** = existe (aparece em menu ou texto) mas não abri nesta rodada. A lista de "Lacunas" no fim diz o que falta conferir.

---

## 1. Início e entrada no jogo

| Função | Como funciona |
|---|---|
| Tela inicial [visto] | Dois modos: **clube** (2.206 clubes, 90 países, 131 ligas, 6 divisões só na Argentina) e **seleção** (216 seleções, 6 confederações, ciclos de 4 anos, 1 Mundial por ciclo). Idiomas ES, EN, PT. Páginas públicas "clubes por país" e "ligas". |
| Carreira salva [visto] | Continuar, nova carreira, **salvar uma cópia** / **carregar uma cópia** (arquivo) e apagar o jogo salvo. Mostra clube, posição, jogadores, caixa, temporada, rodada e a próxima partida com adversário e clima. Sem conta nem cadastro. |
| Propostas de início [visto] | O técnico começa **sem clube** e quatro clubes "ligam" (sorteio, com contagem regressiva por proposta e "que outros liguem"). Cada cartão traz: selo de situação (campeão, recém-promovido, projeto com dono...), o que pedem, onde esperam o time terminar, orçamento, nível e idade do elenco, a figura, nível de cobrança e uma frase da diretoria. |
| Escolher você mesmo [visto] | Mapa do mundo → país → liga, com filtros de **orçamento**, **exigência** e **o que pedem** (brigar lá em cima, meio de tabela, não cair). Ficha da liga: formato, descem, copas, caixa médio, mais rica e menor, o que pedem os clubes, clássicos. |
| Desafios [visto] | Quatro desafios sugeridos (salvar um clube do rebaixamento, levar a uma copa, "carteira gorda", "humildes"), com estrelas e número de temporadas. Aceitar leva direto ao clube. |
| Ficha do clube "Conhecer o clube" [visto] | Apelido e ano de fundação; diretoria (o que pedem, cobrança); vitrine de títulos; clássico; estádio e clima de hoje; onde esperam o time; orçamento com ranking, média e o mais rico; elenco herdado (nível, idade média, valor, estrangeiros, contratos que vencem, três destaques); frase de **análise** ("o melhor", "sem buracos"); tabela completa do elenco. **Comparar** até 3 clubes. |
| Contrato [visto] | Documento de 6 itens (cargo e prazo de tolerância, caixa, elenco, campo, o que herda, o que traz) com **assinatura à mão** numa caixa, ou "Assinar por mim". |
| Coletiva de apresentação [visto] | Uma pergunta ("o que você promete à torcida?") e duas manchetes para escolher; prometer dá mais margem com a diretoria se cumprir e menos se não. |

## 2. Barra principal e "Início" (hub) [visto]

Barra superior fixa: ← → (voltar ao dia anterior/avançar), escudo e liga, **caixa**, busca, data com janela de transferências, **próximo jogo** (adversário, mando, hora) e um botão grande de ação do dia (hoje: "Fechar a escalação"). Abas: **Equipe**, **Mercado** (Reforços), **Competição**, **Clube**, com avisos numéricos; mais "Pré-temporada" (some depois), "Simular o ano" (fora do nosso escopo) e atalhos Escritório, O clube, Minha sala.

Conteúdo do Início, de cima para baixo:
- **Seu gabinete**: Visão geral, **Caixa de entrada** (e-mails da diretoria, médico, direção esportiva, imprensa; alguns "para decidir"), Calendário.
- **O que vem a seguir**: a próxima ação recomendada (com "Depois").
- **Primeiros passos** ("3 de 6").
- **Como você está**: Diretoria, Vestiário e Torcida, cada um de 0 a 100 com rótulo ("te sustenta", "tranquilo", "com o time").
- **Hoje**: cartão do jogo com posição dos dois times, confronto direto, "Preparar o jogo" ou "Direto ao resultado".
- **A aposta do ano**: planilha de prêmios para assinar (meta extra com prazo em rodadas).
- Mini classificação, análise do clube (meta, margem, tolerância em rodadas, presidente), calendário do ano (38 rodadas com data, mando e clássicos).

## 3. Equipe

### 3.1 Elenco [visto]
Subabas: Jogadores, O Onze, Reservas, **Vestiário**. Resumo: total, nível médio, idade média, valor, contratos que acabam, "o que falta ao elenco" (lesionados). Tabela ordenável por qualquer coluna: número, nome e país, posição, **melhor função** (um papel, ex.: "zagueiro com saída de bola"), nível, velocidade, técnica, defesa, chute, resistência, bola parada, idade, condição, físico, contrato, valor, salário, jogos. Agrupada por setor com nível do setor. Montagem do onze arrastando (computador) ou tocando um jogador e depois outro (celular).

### 3.2 Vestiário [visto]
Moral do grupo, referências (quem tem peso), **entrosamento**, **braçadeira de capitão**, quem reclama (salário, minutos). Cada jogador recebe um peso no grupo (referência, respeitado, "um do grupo", em teste), anos no clube e moral, e o técnico pode **dar a braçadeira**. "Falar com o elenco" existe como ação.

### 3.3 Treino [visto, vídeo]
Ver a seção 4 (descrição detalhada).

### 3.4 Base e Esquema [não visto / bloqueado]
"Base" é a categoria de base. "**Esquema**" (tática) aparece com cadeado e só abre quando a semana de treino é terminada; o botão "Montar o esquema tático" aparece depois [vídeo]. No vídeo: formações em botões (4-4-2, 4-5-1, 4-3-3...), atitudes e uma aba "Tática" ao lado de "Comissão técnica / Novidades".

### 3.5 Pré-temporada [visto parcialmente]
Antes da rodada 1 há um prazo ("28 dias para a rodada 1") e um assistente de três decisões: **onde** (CT, praça do país, excursão), **quantos dias** (10 a 28: mais base, mais cansaço) e **contra quem** (até cinco amistosos, com cachê). Só se monta uma vez. Fica também como aba "Pré-temporada" no Treino.

## 4. Treino — agenda semanal e campinho animado [visto + vídeo]

### 4.1 Estrutura
- Cada semana (entre um jogo e outro) é uma **agenda de dias** (quarta a domingo, até o jogo). Cada dia tem uma sessão ("3/2 = quarta, dia 3 de fevereiro") com estado **Pendente** ou **Feito**, e a descrição do contexto ("a quatro dias do jogo", "véspera do jogo").
- Indicadores no topo: **entrosamento** (irregular → em construção → quase...), **ponto** (nível de preparo do time para o jogo; +16 depois de duas sessões), **pernas** (soma do ganho físico da semana), **moral** e **dias sem usar** (quanto tempo o time ficou sem jogar).
- Três botões de semana: **Delegar à comissão** (preenche sozinho), **Limpar a semana**, **Terminar a semana** (fecha e libera o Esquema).
- **Biblioteca de exercícios** em 7 grupos: *Partidas e jogos* (11 contra 11, 8x8, 6x6, 5x5, 4x4 com curingas, 3x3, bobinho 5x2), *Saída de bola*, *Pressão e bloco*, *Ataque*, *Último passe*, *Bola parada* (escanteios a favor e contra, cobranças de falta, disputa de pênaltis) e *Corpo e mente*. Cada exercício tem: nome, descrição curta de um objetivo, **zona do campo** (campo todo, meio-campo, área adversária, nossa área, último terço) e **ganho de "pernas"** (de +2 a +14, o mais forte nos jogos reduzidos).
- Por sessão: **intensidade** (Leve, Normal, A todo vapor), clima do dia, **risco de lesão** (ex.: "baixo, 5%"), botão "Treinar: <nome>", "Folga" (dá o dia de folga) e "Tirar o trabalho".
- **"O que foi ensaiado"**: seis medidores (saída de bola, pressão, bloco, ataque, transições, bola parada) que enchem conforme se treina cada tema e mostram "sem trabalhar", "visto por cima", "ensaiado". É o que o time "sabe" fazer.

### 4.2 O campinho (como é desenhado e como se mexe)
- Um campo vertical/horizontal em **SVG** (não é canvas), de cima, com gramado listrado, em tela cheia na largura do computador; no celular fica acima da lista.
- Ao **escolher** um exercício, o campo "acende onde acontece e quem o faz": a **zona** do exercício fica clara (linha amarela tracejada) e o resto apagado; os jogadores que participam aparecem como discos amarelos com a sigla da função; os demais ficam cinza. Aparecem **adversários/marcadores de treino** (discos laranja) e **estações** (cones, escada de agilidade, barreiras, mini-gols, saco de bolas, bonecos). Há bola(s) paradas no desenho.
- **Exercício de conjunto e ensaio:** cena estática com posicionamento do exercício (ex.: saída em três: zagueiro aberto, volante desce, laranjas pressionando).
- **Jogos (11 contra 11 etc.)**: ao tocar "Jogar", o campo vira um **mini-jogo ao vivo** Titulares × Reservas: 22 discos numerados (laranja e preto), bola, cones fixos em linhas, **placar**, **minuto** (1', 3'...), controles **Pausa, ×1, ×2, ×4 e Terminar**, e dois seletores de formação ("esquema de um lado" e "do outro") e times ("titulares contra reservas" ou "parelhos"). Ao terminar, o dia fica "Feito".
- **Fluidez medida:** no mini-jogo as posições dos discos mudam **em todos os quadros, a 60 fps** (300 em 301 quadros com movimento no teste de 5 s), passo médio de ~1 px por quadro num campo de ~850 px; a ×4 o passo médio sobe para ~4 px (movimento proporcional, sem pulos; passo máximo de 72 px só em trocas de posse). As cenas de exercício são estáticas (movimento 0 nas medições).
- O que o técnico escolhe: a **sessão do dia** (ou folga), a **intensidade**, e, nos jogos, os **esquemas** e os **times**. Todo o resto vem da comissão.

## 5. Mercado e contratos [visto]

- **Reforços**: estado da janela ("aberto, fecha em 6 rodadas"), "para gastar" (orçamento), vagas no elenco (28/32), contratações feitas. Abas: **Contratações**, **Vendas**, **Negociações**, **Mercado ao vivo** (movimento do mundo), **Elencos** (de outros clubes), **Jogadores livres**, **Diretoria esportiva** (sugestões de cargos). "**Onde falta gente**": cobertura por setor (coberto ou aviso) com atalho para ver os jogadores daquela posição. "**Quem você pode contratar**": os 24 melhores dos N disponíveis, com filtro de posição e país/"o mundo todo", e o botão "**Buscar com seus olheiros**".
- Pedidos de empréstimo de jogadores do elenco chegam pela caixa de entrada.
- **Contratos**: custo semanal da folha, "último ano" (saem livres em dezembro), "mais um ano", quem ganha pouco; tabela com salário, quanto falta para igualar ao mercado e anos de contrato; **Renovar** e **Salário** por jogador.

## 6. Competição [visto]

- **Partida** (ver seção 7) e **Torneios**: "seus torneios" (liga, copas nacionais e continentais com data de sorteio, títulos do ano, eliminado de), tabela completa com cores de zona (Libertadores fase de grupos e prévia, Sul-Americana, rebaixamento), rodadas; **As ligas do mundo**: troca de país e divisão, com classificação final de ligas já jogadas (inclusive de outras ligas, como acesso e queda).
- Copas: Copa do Brasil, Libertadores, Sul-Americana, Intercontinental e as regras de vaga ("o campeão da Copa do Brasil também vai à Libertadores").

## 7. Partida [visto + vídeo]

- **Antes de começar:** escalação com notas, reservas ("5 substituições"), "Escolha um titular para mudá-lo de lugar ou substituí-lo". Placar, clima, tipo de jogo ("Fla-Flu", clássico), e uma frase de **prognóstico**: "**A pausa — se vencer 1º, se empatar 1º, se perder 20º**" (posição final na tabela em cada resultado).
- **Cerimônia de entrada** [visto + vídeo]: ao "Começar", os dois times **saem do túnel**, entre papeizinhos e sinalizadores, com a narração do ambiente; botão "**Pular a cerimônia**"; vem a foto dos times e eles vão às posições.
- **Controles:** Pausa/Retomar, **Lento, Normal, Rápido**, **Som**, "**Esquema**" (abre ajustes táticos), "Pular para o intervalo" (botão fixo no topo), "Campo inteiro" (alterna a câmera).
- **Campo ao vivo (2D, de cima):** **câmera de zoom que segue a bola**, com "Campo inteiro" para o campo todo; arquibancada com torcida nas laterais; jogadores como **discos com o número da camisa** (cores/camisas dos times), o nome aparece em quem está com a bola; bola azul; árbitros e bandeirinhas; em jogada parada, fotos da cena.
- **Linha "SE TERMINAR ASSIM":** faixa fixa acima do campo com a **posição na tabela se o jogo acabasse agora** ("10º de 20, na zona da Sul-Americana") e a zona (G4, rebaixamento etc.), atualizada a cada gol.
- **Gol:** a cena escurece e aparece uma **faixa "GOL" com o nome do autor e o clube** por alguns segundos; depois a câmera **volta ao círculo central** para a saída de bola.
- **Analista** [visto]: durante o jogo aparece um cartão com **leitura do jogo** ("estão chegando 6 vezes mais, 6 finalizações contra 1: vamos recuar um pouco mais") e um botão "**Faça**" que aplica a mudança sugerida na hora; também há o texto "O analista: antes do apito inicial ainda não há nada para ler".
- **Estatísticas e cronologia:** posse, finalizações, no alvo, escanteios, faltas, impedimentos; **cronologia** filtrável (tudo, gols, cartões...) com minuto; no intervalo, "Resultado no intervalo". Faltas, escanteios, cartões (amarelo e vermelho) e substituições aparecem na cronologia; **pênalti** aparece como lance.
- **Substituições:** 5 trocas; tocar em titular e em reserva. Mudar tática ao vivo por "Esquema".
- **Fluidez da partida:** o vídeo gravado (25 quadros/s, 430×900) foi estudado em quadros de 0,25 s: o movimento é contínuo, sem teleporte da bola; a câmera faz **pan suave** acompanhando a bola e **volta ao centro** depois do gol. A taxa de atualização do navegador na partida **não foi medida** (a medição interna foi perdida; ver "Lacunas").

## 8. Clube, escritório e carreira [visto]

- **Escritório → Imprensa**: sala de imprensa com data e coletivas por ocasião (véspera, derrota, triunfo, sábado), veículos e jornalistas listados, histórico "o que você disse". Aviso do site: os veículos e jornalistas são reais, mas as **perguntas e manchetes são escritas pelo jogo**. (Para nós: usar veículos genéricos, nunca nomes reais.)
- **O clube**: como te veem (diretoria em carência, arquibancada, vestiário), linha do tempo do ano (fim da carência, fechamento do acordo, retirada de patrocinadores, eleições), **diretoria** (presidente, o que pedem, tolerância), **eleições** (candidatos e pesquisa, que dependem da temporada), "para resolver" (acordo da temporada, aposta do ano, **patrocinador: 3 ofertas**), **arquibancada** (estádio, humor +/-, o que a torcida pede), **vestiário** (referências e contentes), a **dívida**.
- **Minha sala**: carreira (clubes comandados, teto, títulos, jogos, aproveitamento, temporada a temporada), **mercado de técnicos** ("para qual banco o mercado dá a você": ranking do técnico), contrato (salário, prazo, meta da ata), "quem está de olho em você" (clubes que ligam no fim da temporada ou no meio do ano), **Desafios** e **Amigos** (aba social), **pedir demissão**, **se aposentar**, **começar do zero**.

---

## Lacunas desta rodada (o que falta conferir)

1. **Tela do adversário** (olheiro, craque, prognóstico completo): só vi o prognóstico de posição ("se vencer, se empatar, se perder") na partida; a tela de "Preparar o jogo" ficou bloqueada porque o jogo só a libera ao terminar a semana de treino. **[não visto]**
2. **Esquema/tática e Base** (bloqueados na carreira de teste; só pelos vídeos).
3. **Assistente de pré-temporada** além do texto das três decisões; **amistosos** (cachê, resultado).
4. **Mercado**: o fluxo de negociação (proposta, contraproposta, olheiros, empréstimo) não foi percorrido até o fim.
5. **Gol, pênalti e substituição ao vivo**: vi a faixa de gol e o cartão amarelo; pênalti e troca não ocorreram na gravação (a captura "falta/escanteio/substituição" da pasta `jogo/` pegou só os rótulos da estatística).
6. **Fluidez da partida em quadros por segundo**: a medição em tempo real foi perdida quando o sistema encerrou o processo por falta de memória; só há análise do vídeo.
7. **Seleções, Desafios, Amigos** e a "caixa de entrada" decidível: só confirmados pela navegação.
