# Planilhas iniciais dos elencos reais (Fase 5A)

Script que monta, para cada liga do mundo ampliado (21 ligas), uma planilha de **clubes** e uma de **jogadores** no formato que o editor importa (aba *Planilhas*, ver `docs/formato-pacote.md`). Os **atributos ficam em branco**: o jogo gera na importação. O script fica fora do jogo e do site; a pasta de saída (`dados-reais/`) está no `.gitignore`.

## Como rodar

```
npm run dados:planilhas -- --contato "seu@email.com"
```

(o mesmo que `node tools/run.mjs buildRealSheets ...`). Opções:

| Opção | Para que serve |
|---|---|
| `--contato "texto"` | E-mail ou site de contato, que vai no `User-Agent` das consultas (a Wikimedia pede). Também vale a variável de ambiente `MEUMANAGER_CONTATO`. |
| `--liga br-1,en-1` | Só estas ligas (ids do mundo ampliado: `br-1 br-2 br-3 ar-1 uy-1 py-1 cl-1 co-1 ec-1 en-1 es-1 it-1 de-1 fr-1 pt-1 nl-1 mx-1 us-1 af-1 as-1 oc-1`). Sem a opção, faz todas. |
| `--atualizar` | Baixa tudo de novo, ignorando o cache. **É assim que se atualizam os elencos depois de cada janela de transferências.** |
| `--saida pasta` | Pasta de saída (padrão `dados-reais/planilhas`). |
| `--max-clubes N` | Só os N primeiros clubes de cada liga (para testar rápido). |
| `--pausa 1500` | Pausa, em milissegundos, entre as consultas à rede (padrão 1500; não use menos de 1000). |
| `--data AAAA-MM-DD` | Data de referência para escolher a temporada (padrão: hoje). |

Uma rodada completa leva de 20 a 40 minutos (umas 600 consultas, uma por vez). As respostas ficam em `<saida>/.cache`: se a rodada for interrompida, rode de novo e ela continua de onde parou, sem repetir consultas. Para atualizar os elencos, rode com `--atualizar`: os **ids dos clubes e dos jogadores são estáveis** (vêm do Wikidata), então importar a planilha nova no editor **atualiza** os registros em vez de duplicar.

Também saem `ligas-reais.json` (as ligas com o número real de clubes e o formato: turno único na Argentina e na MLS) e `pacote-real.json`, um **rascunho do pacote inteiro** (ligas, clubes e jogadores) que o editor abre para mostrar a validação completa; o relatório traz os números dessa validação (o que ainda falta para o pacote ficar sem erros).

Para conferir as planilhas com o mesmo leitor de CSV do editor (linhas aceitas por liga e erros): `node tools/run.mjs checkRealSheets`. O esperado são só datas de nascimento em branco.

## O que sai

Em `dados-reais/planilhas/` (ou na pasta de `--saida`):

- `<liga>-clubes.csv` e `<liga>-jogadores.csv`, um par por liga, com as colunas do editor (`CLUB_COLUMNS` e `PLAYER_COLUMNS` de `src/data/package/edit/csv.ts`; `;` e BOM UTF-8).
- `relatorio.md`: resumo por liga (clubes achados, elencos, faltas) e a lista do que ficou faltando ou duvidoso.
- `revisao.csv`: uma linha por caso de revisão (liga, clube, jogador, id, tipo, detalhe), para filtrar e corrigir no Excel.
- `creditos.txt`: fontes, licenças e os artigos da Wikipedia consultados (texto para o campo `credits` do pacote).

Para importar: Editor › *Planilhas* › importe `<liga>-clubes.csv` e depois `<liga>-jogadores.csv` da mesma liga. As ligas `br-1`… já existem no mundo ampliado (abra-o no editor); ligue "Remover o que não está na planilha" para trocar os clubes e jogadores fictícios pelos reais.

## De onde vem cada dado

1. **Clubes da temporada atual:** o artigo da temporada da liga na Wikipedia em inglês (`2026 Campeonato Brasileiro Série A`, `2026–27 Premier League`...; tabela de estádios e locais, ou a seção *Teams*). Se o artigo da temporada atual não existir, usa o da anterior e avisa no relatório. Os links viram itens do Wikidata e só ficam os que são clubes de futebol (não dissolvidos). Nas ligas de elite da África, da Ásia e da Oceania a lista de clubes é fixa em `tools/realdata/leagues.ts` (itens do Wikidata).
2. **Dados do clube (Wikidata):** nome curto (o da tabela da temporada), sigla (nome curto de 3 letras do Wikidata, ou derivada do nome), cidade, estádio e capacidade (a mais recente com data), cores oficiais (as duas de matiz mais forte). **Reputação provisória:** ordem de fama do clube (número de páginas do Wikidata em outras línguas) sobre a escada de reputação da liga no mundo fictício. Revise.
3. **Elenco atual:** a tabela de elenco do artigo do clube na Wikipedia em inglês (`First-team squad`; emprestados para fora e base não entram). O Wikidata **não** serve para isso: o campo "membro do time" guarda todo o histórico e voltou com centenas de ex-jogadores por clube.
3b. **Wikipedia no idioma do país** (`--sem-local` desliga): espanhol (Argentina, Uruguai, Paraguai, Chile, Colômbia, Equador, México, Espanha), português (Brasil e Portugal), alemão, italiano, francês e neerlandês. A página local do clube (achada pelo link de idioma do Wikidata) é lida em HTML (`tools/realdata/localSquad.ts`): número, país (pelo nome do arquivo da bandeira, igual em todas as línguas), setor e posição exata (`LD`, `ZAG`, `VOL`, `PD`... nas seis línguas) e o jogador. Quem aparece nas duas tabelas ganha a posição exata e o país da local (`merge.ts`); quando o elenco em inglês tem menos de 18, os jogadores que só a local tem completam o elenco. Para tabelas que não seguem esse desenho (algumas páginas só têm modelos transcluídos, listas ou nada) o clube segue só com o inglês e o relatório mostra o elenco que faltou. Os créditos listam cada página local usada.
4. **Dados do jogador (Wikidata, pelo link do artigo):** nome, data de nascimento (só com dia, mês e ano), nacionalidade, posições e pé (quando existem). A nacionalidade da tabela do clube vale primeiro. Quem não tem artigo fica só com nome, país e setor da tabela.
5. **Posições:** as do jogo (`GK RB LB CB DM CM AM RW LW ST`). Posição exata do Wikidata vale se bate com o setor da tabela do clube (GK/DF/MF/FW). Quando a fonte só diz "defensor", "meio-campista" ou "atacante" (ou nada), o script escolhe a mais provável (zagueiro, meia central, centroavante; lateral e ponta pelo pé) e **marca para revisão**.

Cuidados com a rede: `User-Agent` com identificação e contato, uma consulta por vez, pausa entre elas, espera e nova tentativa em 429/503 (`Retry-After`) e `maxlag`. Não baixa escudos nem fotos. Nada do Transfermarkt nem de outros sites.

## Ajustes automáticos para o pacote passar na validação

O script resolve sozinho o que dá, para o rascunho `pacote-real.json` chegar a **0 erros** na validação do jogo (os números de cada rodada estão no relatório):

- **Mais de 30 jogadores:** os jovens de 15 a 19 anos passam para a **base** do clube (`<liga>-base.csv`; até 15 por clube; os menos conhecidos e os últimos da tabela primeiro). Se ainda passar de 30, os menos conhecidos (sem artigo na Wikipedia) ficam **livres no mercado** (linhas com `club` vazio em `<liga>-jogadores.csv`), sem deixar o clube com menos de 2 goleiros. Cada caso entra na `revisao.csv`.
- **Menos de 18 jogadores (ou nenhum elenco):** o clube é completado até 20 com jogadores **gerados** (nome sorteado do banco de nomes do jogo, posição pela necessidade do elenco, 17 a 35 anos), marcados com `generated` = `sim` na planilha e `generated: true` no pacote; o editor mostra "gerado" na lista e uma caixa para desmarcar quando o jogador for trocado pelo real. Entram na `revisao.csv` e nas tarefas.
- **Posições genéricas** ("defensor", "meio-campista", "atacante", ou sem posição): são distribuídas dentro de cada elenco pela necessidade de um time real (3 goleiros, 2 laterais de cada lado, 4 zagueiros, 2 volantes, 3 meias, 2 meias ofensivos, 2 pontas de cada lado e 3 centroavantes, `TARGET` em `tools/realdata/squadPlan.ts`), na ordem da tabela do clube e usando o pé para o lado (canhoto à esquerda, destro à direita). Só os jogadores **com artigo na Wikipedia** ficam marcados para revisão.
- **Cores:** as que o Wikidata não tem vêm do desenho da camisa no quadro do clube na Wikipedia em inglês (`body1`, `shorts1`, `socks1`, `leftarm1` do `Infobox football club`).
- **Estádio e cidade:** se o Wikidata não tem, vale o texto `ground` do quadro do clube ("Estádio, Cidade"); se nada serve, entra um nome provisório ("Estádio <clube>", cidade = nome do clube) e o caso vai para as tarefas, porque a validação exige os dois campos.

### Tarefas manuais (`tarefas/`)

`tarefas/<liga>-tarefas.csv`, uma planilha por liga para dividir entre os sócios: o que não deu para resolver sozinho. Colunas: `tipo` (Clube, Elenco, Jogador conhecido), `clube`, `jogador`, `id`, `campo`, `situacao`, `valor_provisorio`, `valor_correto` (para preencher), `onde_procurar` e `feito`. Entram: estádio, cidade, capacidade e cores que ainda faltam; clubes com elenco gerado ou sem elenco; e, de cada clube, os **8 jogadores mais conhecidos** (mais páginas do Wikidata em outras línguas) com posição incerta. Os demais casos continuam só na `revisao.csv`.

## Aplicar as tarefas preenchidas (`npm run dados:aplicar`)

1. Cada sócio pega uma planilha de `tarefas/` (uma por liga), abre no Google Planilhas e preenche **`valor_correto`** e marca **`feito`** (`sim`, `x`, `ok`, `feito` ou a caixa de seleção `TRUE`).
2. Baixa como CSV (*Arquivo › Fazer download › Valores separados por vírgula*) e coloca em `dados-reais/planilhas/tarefas-feitas/` (o nome do arquivo não importa; pode haver vários).
3. `npm run dados:aplicar` (ou `-- --simular` para só conferir, sem gravar; `-- --resumo` para ver também o top 20 e o top 10 de clubes). Sai uma linha por tarefa, com o número da linha da planilha: `OK` (com o valor novo e o antigo), `ERRO` (com o motivo) ou `AVISO` (valor preenchido, mas `feito` sem marcar: ignorada). O mesmo texto fica em `ultima-aplicacao.txt`. Código de saída 1 se alguma linha marcada deu erro. Só entram as linhas com `feito`; as outras ficam como estão.

Valores aceitos por `campo`:

| Campo | Valor correto |
|---|---|
| `posição` | sigla do jogo (`CB`, `ST`...) ou da interface (`ZAG`, `ATA`...); a primeira é a principal e até 2 a mais viram secundárias (`ZAG VOL`, `LD / PD`). Goleiro não combina com linha. |
| `cores` / `cor 1` / `cor 2` | código da cor (`#cc0000`, `cc0000` ou `c00`); `cores` leva as duas separadas por espaço. |
| `estádio`, `cidade` | texto. |
| `capacidade` | número de 500 a 300.000 (`45.000` e `45 000` valem). |
| `força`, `potencial` | 1 a 100 (planilha `conferencia/top-300-jogadores.csv`): os atributos do jogador são gerados de novo para dar essa força. |
| `elenco` | não se aplica por aqui: trocar ou acrescentar jogadores é no editor ou em `<liga>-jogadores.csv`; marcar `feito` só registra. |

**As correções não se perdem.** Cada correção boa fica em `correcoes.json` (pasta de saída; por id do clube ou jogador e campo; a mais nova substitui a antiga). Toda rodada do `npm run dados:planilhas` (inclusive `--atualizar`, depois de uma janela de transferências) reescreve as planilhas do zero e **reaplica as correções no fim**; as tarefas que elas resolveram não voltam para `tarefas/`. Se o jogador saiu do elenco, a correção dele fica guardada sem efeito e a etapa final avisa ("correções guardadas que não acharam o registro"). Faça cópia de `correcoes.json` junto com as planilhas.

## Atributos pela fama (Fase 5C)

Os atributos dos jogadores reais (e potencial, consistência, propensão a lesão e profissionalismo) são gerados no fim de cada rodada e gravados nas colunas dos CSV de jogadores e da base (`realdata/attributes.ts`); o editor mostra e deixa ajustar. A conta, para cada jogador:

1. **Nível do clube:** o mesmo do jogo (`clubLevel`: reputação do clube, divisão e economia da liga), com um pequeno ajuste por liga para os clubes grandes da Espanha, Inglaterra, Alemanha e França ficarem no mesmo patamar (`leagueAdjust`).
2. **Ordem por fama dentro do clube:** goleiros e jogadores de linha em separado, ordenados pelo número de páginas do Wikidata em outras línguas (com um ruído: fama não é qualidade). Os 10 (1 no gol) primeiros são titulares, em volta do nível do clube; os demais são reservas, 9 pontos abaixo, como no mundo fictício. Quem não tem artigo (fama 0) fica no fim.
3. **Fama absoluta:** a partir de ~20 páginas a fama diz a qualidade por si só (`qualityCurve`: 20 páginas ≈ 64, 50 ≈ 80, 100 ≈ 89, 230 ≈ 95) e pesa de 0 a 90% na força-alvo no lugar do clube. A fama é de carreira, então perde 1,8 ponto por ano depois dos 31 anos e cai um pouco para quem joga em clube abaixo do nível 74 (já passou do auge). Jovens valem menos que o nome sugere, até os 21.
4. **Atributos:** a geração do jogo (`generateAttributes`, com as curvas de idade) é repetida com o mesmo sorteio (id do jogador) até a força geral na posição bater na força-alvo; o potencial segue a regra do jogo (jovens crescem) com um pouco mais de teto para os jovens famosos.

Resultado esperado (veja `conferencia/distribuicao.md`): ~7 jogadores com força 85 ou mais no mundo e nenhum de 90; ~60 com 80 ou mais; os melhores clubes de cada liga com os melhores elencos (Real Madrid e Barcelona no topo, o melhor clube da Série A brasileira com ~70). A calibragem fica em `REAL_ATTRIBUTES`; depois de mexer, `npm run dados:finalizar` refaz tudo em segundos, sem rede, e imprime a distribuição, o top 20 e o top 10 de clubes.

**Conferência à mão:** `conferencia/top-300-jogadores.csv` (os 300 mais fortes do mundo; jogadores gerados não entram) e `conferencia/forca-dos-clubes.csv` (todos os clubes por força: média dos 14 melhores). A primeira tem as colunas das tarefas: quem achar uma força errada preenche `valor_correto` (1 a 100) e marca `feito`, baixa o CSV para `tarefas-feitas/` e roda `dados:aplicar`. Dá para pedir também um `potencial` acrescentando uma linha com `campo` = `potencial`.

**Linhas que não são jogadores:** alguns elencos da Wikipedia local trazem patrocinadores ou cidades como se fossem jogadores. O item do Wikidata sem nascimento, país, posição nem pé que tem 12 páginas ou mais (ou 8 ou mais num mesmo elenco) é descartado e vai para a `revisao.csv` (`player-not-person`).

## O que costuma ficar faltando (veja o relatório)

- **Data de nascimento ausente em todas as fontes:** não trava a importação. O jogador recebe uma data **estimada**: pelo ano, quando a fonte só tem o ano (1º de julho), ou pela média de idade do elenco do clube (média das idades conhecidas, com uma variação fixa de até 3 anos para cima ou para baixo por jogador, só para não ficarem todos com a mesma idade; sem 5 idades conhecidas no clube vale a média da liga). Fica marcada: coluna `birthEstimated` = `sim` na planilha, `birthEstimated: true` no pacote e "(estimada)" na lista do editor, com uma caixa para desmarcar quando conferir a data (mudar a data também tira a marca). Todos entram na `revisao.csv`.
- **Clube sem elenco ou com elenco fora de 18 a 30:** clubes pequenos costumam não ter a tabela de elenco na Wikipedia em inglês; elencos com mais de 30 incluem jogadores da base. A aba *Problemas* do editor aponta cada um.
- **Cores, estádio, capacidade e cidade ausentes:** o jogo usa vermelho e branco e 20.000 de capacidade enquanto não forem preenchidos.
- **Posição incerta:** a maior parte dos jogadores (o Wikidata quase sempre diz só "defensor", "meio-campista"...).
- **Número de clubes diferente do número real da liga:** o relatório mostra a diferença. O número real de cada liga fica em `tools/realdata/leagues.ts` (`REAL_TEAMS`: Argentina e MLS com 30 em 2026; as demais seguem o mundo ampliado) e `ligas-reais.json` usa os clubes achados.

## Código

Fase 5B/5C: `tools/applyRealTasks.ts` e `tools/finalizeRealSheets.ts` (linhas de comando), `realdata/corrections.ts` (correções e leitura das tarefas), `realdata/attributes.ts` (atributos pela fama) e `realdata/finalize.ts` (etapa final a partir dos arquivos). Testes: `tests/realSheetsCorrections.test.ts`, `tests/realAttributes.test.ts`.

`tools/buildRealSheets.ts` (linha de comando) e `tools/realdata/`: `leagues.ts` (ligas e títulos dos artigos), `http.ts` (rede, pausas, cache), `wikipedia.ts` e `wikidata.ts` (consultas), `wikitext.ts` (tabelas de elenco e listas de clubes em texto wiki), `localSquad.ts` (elenco em HTML da Wikipedia local), `merge.ts` (junta o elenco inglês e o local), `packageOut.ts` (ligas e rascunho do pacote), `positions.ts` e `nationality.ts` (conversões), `assemble.ts` (linhas das planilhas e avisos), `report.ts` (relatório, revisão e créditos), `pipeline.ts` (uma liga de ponta a ponta). Testes: `tests/realSheetsParse.test.ts`, `tests/realSheetsAssemble.test.ts` (sem rede).

## Licença dos dados

O Wikidata é domínio público (CC0). Os nomes das tabelas de elenco e as listas de clubes vêm da Wikipedia (CC BY-SA 4.0): ao embutir o pacote real no jogo (Fase 5), o arquivo de dados sai sob essa licença, com a atribuição em `credits` e a tela de créditos (`creditos.txt` já traz o texto e a lista de artigos).
