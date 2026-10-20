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
3. **Elenco atual:** a tabela de elenco do artigo do clube na Wikipedia (`First-team squad`; emprestados para fora e base não entram). O Wikidata **não** serve para isso: o campo "membro do time" guarda todo o histórico e voltou com centenas de ex-jogadores por clube.
4. **Dados do jogador (Wikidata, pelo link do artigo):** nome, data de nascimento (só com dia, mês e ano), nacionalidade, posições e pé (quando existem). A nacionalidade da tabela do clube vale primeiro. Quem não tem artigo fica só com nome, país e setor da tabela.
5. **Posições:** as do jogo (`GK RB LB CB DM CM AM RW LW ST`). Posição exata do Wikidata vale se bate com o setor da tabela do clube (GK/DF/MF/FW). Quando a fonte só diz "defensor", "meio-campista" ou "atacante" (ou nada), o script escolhe a mais provável (zagueiro, meia central, centroavante; lateral e ponta pelo pé) e **marca para revisão**.

Cuidados com a rede: `User-Agent` com identificação e contato, uma consulta por vez, pausa entre elas, espera e nova tentativa em 429/503 (`Retry-After`) e `maxlag`. Não baixa escudos nem fotos. Nada do Transfermarkt nem de outros sites.

## O que costuma ficar faltando (veja o relatório)

- **Jogador sem data de nascimento:** a célula fica em branco (o editor mostra o erro da linha e "Importar só as linhas corretas" pula quem falta). Conserte no Excel pela `revisao.csv`.
- **Clube sem elenco ou com elenco fora de 18 a 30:** clubes pequenos costumam não ter a tabela de elenco na Wikipedia em inglês; elencos com mais de 30 incluem jogadores da base. A aba *Problemas* do editor aponta cada um.
- **Cores, estádio, capacidade e cidade ausentes:** o jogo usa vermelho e branco e 20.000 de capacidade enquanto não forem preenchidos.
- **Posição incerta:** a maior parte dos jogadores (o Wikidata quase sempre diz só "defensor", "meio-campista"...).
- **Número de clubes diferente do jogo:** a Série A brasileira tem 20, mas o MLS tem 30, por exemplo; o relatório mostra a diferença.

## Código

`tools/buildRealSheets.ts` (linha de comando) e `tools/realdata/`: `leagues.ts` (ligas e títulos dos artigos), `http.ts` (rede, pausas, cache), `wikipedia.ts` e `wikidata.ts` (consultas), `wikitext.ts` (tabelas de elenco e listas de clubes), `positions.ts` e `nationality.ts` (conversões), `assemble.ts` (linhas das planilhas e avisos), `report.ts` (relatório, revisão e créditos), `pipeline.ts` (uma liga de ponta a ponta). Testes: `tests/realSheetsParse.test.ts`, `tests/realSheetsAssemble.test.ts` (sem rede).

## Licença dos dados

O Wikidata é domínio público (CC0). Os nomes das tabelas de elenco e as listas de clubes vêm da Wikipedia (CC BY-SA 4.0): ao embutir o pacote real no jogo (Fase 5), o arquivo de dados sai sob essa licença, com a atribuição em `credits` e a tela de créditos (`creditos.txt` já traz o texto e a lista de artigos).
