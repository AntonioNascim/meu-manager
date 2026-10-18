# Formato do pacote de dados

O pacote é um arquivo **JSON** que descreve um mundo: países, ligas, clubes e jogadores. É o arquivo que o jogo importa em
**Menu › Novo jogo com pacote de dados**. Ele fica guardado só no navegador (IndexedDB) e nunca é enviado a lugar nenhum. Dados
reais ficam fora do repositório: a pasta `dados-reais/` está no `.gitignore`.

O jogo valida o arquivo inteiro antes de aceitar e mostra o que está errado em português (campo, posição no arquivo e valor).
O código está em `src/data/package/` (`types.ts` com os tipos, `validate.ts` com as regras, `load.ts` com a montagem do mundo).

- `format` é sempre `"meu-manager-package"` e `version` é `1`. Arquivo de versão mais nova que a do jogo é recusado.
- Campos marcados **(opcional)** podem faltar; o jogo preenche de forma **estável** (o mesmo arquivo dá sempre o mesmo mundo).
- Textos em português do Brasil são livres (nomes de clubes, cidades, estádios, jogadores). Valores fixos (posições,
  nacionalidades, pé) são em inglês, como abaixo.
- Escala: todos os atributos de jogador são **inteiros de 1 a 100**; reputação de clube é **inteiro de 1 a 20**.
- Um exemplo completo com as 15 ligas é gerado por `node tools/run.mjs exportScalePackage` (arquivo
  `dados-reais/mundo-ficticio-15-ligas.json`, 1,1 MB, 282 clubes, 7.414 jogadores).

## Visão geral

```json
{
  "format": "meu-manager-package",
  "version": 1,
  "name": "Meu mundo",
  "startYear": 2026,
  "credits": "Fontes e licenças dos dados (texto livre).",
  "countries": [ ... ],
  "leagues": [ ... ],
  "clubs": [ ... ],
  "players": [ ... ],
  "academy": [ ... ],
  "cups": [ ... ]
}
```

| Campo | Obrigatório | O que é |
|---|---|---|
| `format` | sim | `"meu-manager-package"` |
| `version` | sim | `1` |
| `name` | sim | Nome do pacote, mostrado ao importar |
| `startYear` | não | Ano da temporada inicial (1900 a 2200; padrão 2026). Idades e contratos são contados a partir de 1º de janeiro dele |
| `credits` | não | Fontes e licenças (aparecem ao importar). Obrigatório na prática para dados reais |
| `countries` | sim | Lista de países |
| `leagues` | sim | Lista de ligas (divisões) |
| `clubs` | sim | Lista de clubes |
| `players` | sim | Lista de jogadores (elencos) |
| `academy` | não | Base dos clubes (jovens de 15 a 19 anos). Sem ela o jogo gera uma |
| `cups` | não | Copas e supercopas (seção "Copas" abaixo). Sem elas o mundo só tem as ligas |

## Países (`countries`)

```json
{ "id": "England", "name": "Inglaterra" }
```

- `id`: **um país da lista do fim deste arquivo** (209 países, a mesma lista de `players[].nationality`), escrito como lá
  (nome em inglês: `Brazil`, `England`, `Ivory Coast`...). Um país fora da lista é recusado (`unknown-value`).
- `name`: nome mostrado (português).
- `countries` só precisa ter os países **que têm liga no pacote** (cada `leagues[].country` precisa estar aqui). A nacionalidade
  de um **jogador** pode ser **qualquer país da lista**, tenha ou não liga no pacote: um jogador japonês num clube inglês não
  exige o Japão em `countries`.
- O país da liga é o que define quem é **estrangeiro** no clube (ver `foreignLimit`).

## Ligas (`leagues`)

Cada item é uma **divisão** de um país. Um país tem de **1 a 3 divisões**, com `level` 1, 2 e 3 em sequência. O país com uma
divisão só é uma liga **fechada** (ninguém sobe nem cai).

```json
{
  "id": "en-1",
  "name": "Liga Inglesa",
  "country": "England",
  "level": 1,
  "teams": 20,
  "promotion": 0,
  "relegation": 0,
  "rounds": 2,
  "region": "EU",
  "economy": { "revenue": 5, "level": 8 },
  "foreignLimit": { "squad": 17, "lineup": 8 },
  "tiebreakers": ["wins", "goal-difference", "goals-for", "head-to-head", "red-cards", "yellow-cards", "draw"]
}
```

| Campo | Obrigatório | Regra |
|---|---|---|
| `id` | sim | Único no pacote; os clubes apontam para ele |
| `name` | sim | Nome mostrado nas tabelas ("Série A", "Premier League"...) |
| `country` | sim | `id` de um país do pacote |
| `level` | sim | 1 = principal; 2, 3 = divisões de baixo. Em sequência dentro do país |
| `teams` | sim | Número de times da divisão: **par, de 4 a 40**. Precisa ser igual ao número de clubes que apontam para a liga |
| `promotion` | sim | Quantos sobem desta divisão para a de cima. **0 na divisão 1** |
| `relegation` | sim | Quantos caem desta divisão para a de baixo. **0 na última divisão do país** |
| `rounds` | não | `1` = turno único, `2` = turno e returno (padrão) |
| `start` | não | `[mês, dia]` de referência da primeira rodada da liga (cai no primeiro sábado a partir daí). Padrão: o do país (tabela do calendário abaixo) |
| `split` | não | `true` = a temporada atravessa o ano (agosto a maio; vai de 1º de julho a 30 de junho e os contratos terminam em 30/6); `false` = ano civil (1º/1 a 31/12). Padrão: o do país (Europa sim; Brasil e América do Sul não) |
| `region` | não | Janelas de transferência: `BR` (janeiro até a véspera da 1ª rodada e julho), `SA` (janeiro a 15/3 e julho), `EU` (janeiro e julho a agosto). Padrão: a do país (ver tabela) |
| `economy` | não | Economia da liga (ver abaixo). Padrão: a do país |
| `foreignLimit` | não | Limite de estrangeiros (ver abaixo). Padrão: sem limite |
| `tiebreakers` | não | Só a ordem padrão é usada; outra ordem gera um aviso e é ignorada |

**Acesso e rebaixamento:** quem cai de uma divisão é quem sobe para a de baixo, então `relegation` da divisão `n` precisa ser
igual a `promotion` da divisão `n+1`. A soma `promotion + relegation` de uma divisão não passa da metade dos times.

Exemplo de país com três divisões (Brasil): `br-1` (`promotion: 0`, `relegation: 4`), `br-2` (`promotion: 4`, `relegation: 4`),
`br-3` (`promotion: 4`, `relegation: 0`). País com uma liga só: `promotion: 0` e `relegation: 0`.

### Economia da liga (`economy`)

```json
{ "revenue": 5, "level": 8 }
```

- `revenue` (0,05 a 20): **índice de receita** em relação ao Brasil (Brasil = 1). Multiplica a cota de TV, o patrocínio, o
  preço do ingresso e o custo de operação dos clubes, e (elevado a 0,75) os salários e os preços de transferência.
- `level` (−15 a 15): quantos **pontos de força** os titulares da liga têm a mais (ou a menos) que os do Brasil. Usado ao gerar
  jogadores sem atributos e a base. O jogador sem atributos de um clube inglês nasce mais forte que o de um paraguaio.

Sem `economy`, valem os padrões calibrados para o país (`src/data/package/leagueDefaults.ts`). Um país que **não está nesta tabela** (México, Estados Unidos, Japão...) não tem padrão: a liga usa a economia do Brasil e as janelas da Europa, e a validação dá o aviso "Não há economia padrão para o país"; preencha `economy` e `region` da liga para tratar disso:

| País (`id`) | Região | `revenue` | `level` |
|---|---|---|---|
| `Brazil` | BR | 1 (referência) | 0 |
| `Argentina` | SA | 0,6 | −1 |
| `Uruguay` | SA | 0,3 | −4 |
| `Paraguay` | SA | 0,25 | −5 |
| `Chile` | SA | 0,4 | −3 |
| `Colombia` | SA | 0,45 | −2 |
| `Peru` | SA | 0,3 | −4 |
| `Ecuador` | SA | 0,3 | −4 |
| `England` | EU | 5 | 8 |
| `Spain` | EU | 3 | 7 |
| `Italy` | EU | 2,5 | 6 |
| `Germany` | EU | 2,8 | 6 |
| `France` | EU | 1,8 | 3,5 |
| `Portugal` | EU | 0,9 | 2 |

As divisões de baixo já são mais pobres que a principal por regra do jogo (a 2ª divisão tem 15% da receita da 1ª e a 3ª, 6%; a
3ª paga 60% do salário; o nível dos jogadores cai por divisão): **não** coloque isso em `economy`, que é a economia **do país**.
Todas as divisões de um país usam o mesmo `economy` (se divergirem, cada clube usa o da sua divisão).

### Limite de estrangeiros (`foreignLimit`)

```json
{ "squad": 17, "lineup": 8 }
```

**Estrangeiro** é o jogador cuja `nationality` é diferente do `country` da liga do clube. Os dois campos são opcionais:

- `squad` (0 a 30): no máximo tantos estrangeiros **no elenco**. O mercado não deixa passar: compra, empréstimo, contratação de
  jogador livre e pré-contrato com um estrangeiro novo são recusados com o motivo "Limite de estrangeiros da liga", e a IA nem
  escolhe esses alvos. Quem já está no elenco ao começar o jogo fica (o limite só barra a entrada de mais um).
- `lineup` (0 a 11): no máximo tantos estrangeiros **entre os 11 titulares**. A escalação automática da IA e a sugestão do
  jogador respeitam o limite; o técnico que tenta escalar mais é impedido com uma mensagem, e uma escalação que passou a
  violar o limite (lesões, venda, troca de clube) é consertada antes do jogo. Nas ligas simuladas de forma simplificada
  (fora da pirâmide do técnico) o limite também vale.
- **Durante a partida** o limite `lineup` vale para os estrangeiros **em campo**: a IA escolhe o reserva que não estoura o limite (sem reserva possível, o time segue com um a menos) e o técnico que tenta uma troca que passa do limite recebe "Limite de estrangeiros da liga: no máximo N em campo ao mesmo tempo". Trocar um estrangeiro por outro estrangeiro vale. A única exceção é o reserva de goleiro que entra no lugar de um goleiro expulso.
- **Promoção da base:** o técnico que promove um jovem estrangeiro com o elenco já no limite `squad` recebe a mensagem "Limite de estrangeiros da liga: o elenco já tem N..."; a IA não promove (e, aos 20 anos, dispensa) o jovem estrangeiro que não cabe.

Sem `foreignLimit` (ou sem o campo), nada é limitado. As regras reais variam muito: use o campo só quando a liga tiver uma regra
que dê para descrever assim.

## Clubes (`clubs`)

```json
{
  "id": "club-arsenal",
  "name": "Arsenal",
  "abbreviation": "ARS",
  "colors": ["#ef0107", "#ffffff"],
  "city": "Londres",
  "state": "ENG",
  "stadium": { "name": "Emirates Stadium", "capacity": 60700 },
  "reputation": 17,
  "league": "en-1"
}
```

| Campo | Obrigatório | Regra |
|---|---|---|
| `id` | sim | Único; os jogadores apontam para ele (`players[].club`) |
| `name` | sim | Nome completo |
| `abbreviation` | sim | **3 letras maiúsculas**, únicas no pacote |
| `colors` | sim | Duas cores `#rrggbb` (escudo e camisa gerados) |
| `city` | sim | Cidade |
| `state` | não | Estado ou sigla do país (texto livre) |
| `stadium` | sim | `{ "name": texto, "capacity": inteiro de 500 a 300000 }` |
| `reputation` | sim | 1 a 20. Define o nível do elenco gerado, a receita (patrocínio, torcida), a atração de jogadores e a meta da diretoria |
| `league` | sim | `id` de uma liga do pacote |
| `game` | não | Dados de uma exportação do jogo (ver "Pacote completo") |

**Reputação:** é a mesma escala para todos os países, e o nível da liga (`economy.level`) soma por cima. Referência no mundo
fictício da Série A: ~4 clubes de 16 a 19 (grandes), ~8 de 11 a 15 (médios), ~8 de 7 a 10 (pequenos); Série B de 3 a 8; Série C de
2 a 6. Em ligas pequenas, poucos clubes grandes e uma queda rápida para o meio deixam as ligas mais previsíveis (poucos campeões
diferentes); uma escada reta de reputação deixa o título mais disputado.

**Elenco:** cada clube precisa de **18 a 30 jogadores** e **pelo menos 1 goleiro**. O jogo escolhe a formação, a tática, as finanças,
a torcida e a meta da diretoria a partir da reputação e da posição do clube na liga.

## Jogadores (`players`)

```json
{
  "name": "Bukayo Saka",
  "nickname": "Saka",
  "birthDate": "2001-09-05",
  "nationality": "England",
  "position": "RW",
  "secondaryPositions": ["LW", "AM"],
  "foot": "left",
  "club": "club-arsenal"
}
```

| Campo | Obrigatório | Regra |
|---|---|---|
| `id` | não | Único. Sem ele o jogo numera (`player-N`). Use ids estáveis se o arquivo for atualizado depois |
| `name` | sim | Nome completo |
| `nickname` | não | Apelido mostrado no lugar do nome |
| `birthDate` | sim | `AAAA-MM-DD`, data válida. A idade vem dela |
| `nationality` | sim | Qualquer país da lista do fim deste arquivo (não precisa estar em `countries`) |
| `position` | sim | `GK`, `RB`, `LB`, `CB`, `DM`, `CM`, `AM`, `RW`, `LW` ou `ST` |
| `secondaryPositions` | não | Até 2 das mesmas posições. Sem o campo o jogo sorteia, de forma estável |
| `foot` | não | `right`, `left` ou `both` |
| `club` | não | `id` de um clube. Ausente ou `null` = **jogador livre** (mercado de livres) |
| `attributes` | não | Todos os 17 atributos (abaixo). Sem eles o jogo **gera** de forma estável |
| `potential` | não | 1 a 100, teto de evolução |
| `hidden` | não | `{ "consistency", "injuryProneness", "professionalism" }`, cada um de 1 a 100 |
| `contract` | não | `{ "salary": R$ por mês, "endDate": "AAAA-MM-DD", "releaseClause": R$ }` |

**Atributos** (`attributes`, todos obrigatórios quando o objeto existe, inteiros de 1 a 100):

- técnicos: `passing`, `finishing`, `dribbling`, `crossing`, `tackling`, `heading`, `ballControl`
- físicos: `pace`, `stamina`, `strength`
- mentais: `vision`, `positioning`, `decisions`, `determination`
- goleiro: `reflexes`, `rushingOut` (para jogadores de linha, valores baixos)

```json
"attributes": {
  "passing": 78, "finishing": 74, "dribbling": 85, "crossing": 80, "tackling": 52, "heading": 55, "ballControl": 84,
  "pace": 84, "stamina": 76, "strength": 62, "vision": 76, "positioning": 72, "decisions": 76, "determination": 82,
  "reflexes": 10, "rushingOut": 8
}
```

### O que o jogo gera quando falta

O sorteio de um jogador sem atributos parte **só da identidade dele** (`name`, `birthDate`, `nationality`, `position`), então
o mesmo jogador tem sempre os mesmos atributos, e mudar o clube dele muda só o **nível** (a reputação do clube, a divisão e a
economia da liga). Idade, salário (pela força e pela economia da liga) e contrato (1 a 4 anos a partir de `startYear`) também
são derivados. Dá para montar o pacote real **sem atributos** e ajustar os craques depois (o editor de dados é uma fase futura do plano).

### Mundo mínimo

Para um mundo mínimo bastam `name`, `birthDate`, `nationality`, `position` e `club` por jogador, e `id`, `name`,
`abbreviation`, `colors`, `city`, `stadium`, `reputation` e `league` por clube.

## Base dos clubes (`academy`)

Opcional. Mesma estrutura de jogador, com `club` **obrigatório**, idades de 15 a 19 anos (na data de início). Sem `academy`, o jogo
gera a base de cada clube com a semente do jogo, no nível da liga.

## Copas (`cups`)

Opcional. Cada item é uma copa ou supercopa. O **nome vem do pacote**: o jogo publicado usa nomes genéricos ("Copa Nacional",
"Supercopa Nacional"), porque os nomes oficiais dos campeonatos são marcas; quem monta um pacote próprio decide os nomes.

```json
{
  "id": "cup-br",
  "name": "Copa Nacional",
  "kind": "cup",
  "country": "Brazil",
  "format": "knockout",
  "entrants": [
    { "source": { "type": "league", "league": "br-1" } },
    { "source": { "type": "league", "league": "br-2" } },
    { "source": { "type": "league", "league": "br-3" } }
  ],
  "stages": [
    { "name": "Primeira fase", "legs": 1, "date": [2, 4] },
    { "name": "Segunda fase", "legs": 1, "date": [2, 25] },
    { "name": "Oitavas de final", "legs": 2, "date": [3, 25] },
    { "name": "Quartas de final", "legs": 2, "date": [5, 6] },
    { "name": "Semifinais", "legs": 2, "date": [7, 22] },
    { "name": "Final", "legs": 2, "date": [10, 14], "legGap": 14 }
  ],
  "seeding": "seeded",
  "homeOfSingleLeg": "lower-reputation",
  "awayGoals": false,
  "extraTime": true,
  "penalties": true,
  "discipline": { "yellowsPerSuspension": 3, "redCardGames": 1, "clearYellowsAfterStage": 3 },
  "prize": { "perStage": [100000, 150000, 400000, 800000, 1500000, 2500000], "champion": 12000000, "runnerUp": 5000000 }
}
```

| Campo | Obrigatório | O que é |
|---|---|---|
| `id` | sim | Único no pacote (e diferente dos ids das ligas). Outras copas citam por ele |
| `name` | sim | Nome mostrado |
| `kind` | não | `cup` (padrão) ou `supercup` (só um rótulo) |
| `country` | não | País da copa (uma liga dele precisa estar no pacote). Copa continental usa `region` |
| `region` | não | `BR`, `SA` ou `EU` |
| `format` | sim | `knockout`, `groups-knockout` ou `league-knockout` (abaixo) |
| `entrants` | sim | As vagas: quem joga e em que fase entra (abaixo) |
| `stages` | sim | As fases de **mata-mata**, da primeira à final (abaixo) |
| `groups` | só em `groups-knockout` | A fase de grupos |
| `leaguePhase` | só em `league-knockout` | A fase de liga |
| `preliminary` | só em `groups-knockout` | Fases **preliminares** de mata-mata, jogadas antes dos grupos (mesma forma de `stages`); os vencedores vão para os grupos |
| `weekday` | não | Dia da semana dos jogos: `2` terça, `3` quarta (padrão) ou `4` quinta |
| `excludeCups` | não | Ids de copas: quem já está nelas (na mesma edição) não entra nesta; a vaga passa para o próximo colocado da liga |
| `seeding` | não | `random` (padrão), `seeded` (cabeças de chave pela reputação) ou `ranked` (como `seeded`, mas depois dos grupos ou da fase de liga os cabeças de chave são os mais bem colocados nela) |
| `homeOfSingleLeg` | não | Quem manda o jogo único: `draw` (padrão: quem o sorteio põe primeiro; com cabeças de chave, o cabeça de chave), `lower-reputation` ou `higher-reputation` (o clube de menor ou de maior reputação), `lower-division` (o clube da divisão inferior joga em casa, como nas copas da Inglaterra, Espanha, Alemanha, França e Portugal; entre clubes da mesma divisão vale o sorteio) ou `first-listed` (o primeiro das vagas, para supercopas) |
| `awayGoals` | não | Regra do gol fora na ida e volta. **Desligada por padrão** (`false`) |
| `extraTime` | não | Prorrogação de 30 minutos se o confronto está empatado (padrão `true`) |
| `penalties` | não | Disputa de pênaltis se continua empatado (padrão `true`) |
| `discipline` | não | Cartões e suspensões **próprios da copa** (abaixo) |
| `prize` | não | Premiação em dinheiro (abaixo) |

### Formatos

- **`knockout`**: só mata-mata. As fases de `stages` são jogadas em ordem; cada uma recebe os vencedores da anterior (mais quem
  entra nela pelas vagas).
- **`groups-knockout`**: uma fase de grupos e depois o mata-mata. Precisa de `groups`:
  `{ "name": "Fase de grupos", "count": 8, "advance": 2, "direct": 1, "legs": 2, "date": [9, 15], "gapDays": 14 }`. `count` grupos de igual
  tamanho **par**, `advance` passam de cada grupo (dos quais os `direct` primeiros colocados pulam a primeira fase de mata-mata e entram na seguinte, como os líderes de grupo da copa secundária sul-americana), `legs` 1 (só ida) ou 2 (ida e volta), as rodadas ficam `gapDays` dias uma da
  outra (padrão 7). A primeira fase de `stages` recebe os classificados dos grupos (sorteada como as outras fases, com cabeças de chave pela reputação se `seeding` é `seeded`).
- **`league-knockout`**: uma fase de liga (tabela única) e depois o mata-mata. Precisa de `leaguePhase`:
  `{ "name": "Fase de liga", "pots": 4, "matchesPerTeam": 8, "date": [9, 10], "gapDays": 7, "direct": 8, "playoff": 16 }`. Os clubes
  são separados em `pots` potes pela reputação e cada um enfrenta `matchesPerTeam / pots` rivais de cada pote (inclusive do seu),
  metade em casa e metade fora; `matchesPerTeam` precisa ser múltiplo de `2 × pots`. Os melhores `direct` pulam a primeira fase de
  `stages` (o playoff) e os `playoff` seguintes jogam essa primeira fase.

O jogo confere a conta dos clubes: o número de clubes de cada fase tem que levar a uma **final de dois**. Quando o número de
clubes de uma fase de mata-mata não é potência de dois, os melhores colocados (cabeças de chave) **folgam** e os outros jogam até
sobrar uma potência de dois. Exemplo: 60 clubes → 4 folgam, 28 confrontos, 32 seguem → 16 → 8 → 4 → 2 → 1 (seis fases).

### Vagas (`entrants`)

Cada vaga tem uma `source` (de onde vêm os clubes), uma `fallback` opcional e a `stage` em que entra (índice na lista de fases da
copa: com grupos ou fase de liga, o 0 é essa fase e o mata-mata começa no 1; padrão 0).

```json
{ "source": { "type": "league", "league": "br-1" } }
{ "source": { "type": "league", "league": "br-1", "positions": [1, 4] } }
{ "source": { "type": "cup", "cup": "cup-br", "place": "winner" }, "fallback": { "type": "league", "league": "br-1", "positions": [2, 2] } }
```

- `league` sem `positions`: **todos** os clubes que estão na liga hoje. Com `positions` `[de, até]`: quem **terminou a temporada
  passada** nessas posições (na primeira temporada de um mundo, vale a ordem de reputação).
- `cup` com `place` `winner` ou `runner-up`: o campeão ou o vice da **edição passada** daquela copa (na primeira temporada, o clube
  mais forte entre os que ela teria). Uma copa não pode citar a si mesma.
- `cup-group-place`: `{ "type": "cup-group-place", "cup": "cont-sa-1", "place": 3 }` = o clube que terminou em tal colocação de **cada grupo** da fase de grupos de outra copa **da mesma edição** (os terceiros da copa principal caem para a repescagem da secundária). Só se conhece quando os grupos da outra copa terminam, então a vaga precisa ter `stage` 1 ou mais e a fase espera.
- Colocações de liga (`positions`) repõem quem já está na copa (ou numa copa de `excludeCups`) pelos colocados logo abaixo: a copa mantém o número de clubes.
- `fallback`: se o clube escolhido já está na copa por outra vaga (o campeão da liga que também ganhou a copa), entra o primeiro da
  vaga reserva.

### Fases de mata-mata (`stages`)

`{ "name": "Quartas de final", "legs": 2, "date": [5, 6], "legGap": 7, "neutral": false }`

- `legs`: `1` jogo único ou `2` ida e volta. `legGap`: dias entre a ida e a volta (2 a 60; padrão 7).
- `neutral`: num jogo único, estádio neutro (sem vantagem de casa e sem bilheteria; serve para finais e supercopas).
- **`date`**: mês e dia de referência do primeiro jogo (volta: `legGap` dias depois). O jogo vai para a **primeira quarta-feira livre
  a partir dessa data**: livre quer dizer que nenhum dos clubes da fase joga (nem na véspera nem no dia seguinte) uma partida de
  liga ou de outra copa. Então a copa nunca bate com a liga; a data real pode ficar uma ou mais semanas depois da de referência. A
  fase seguinte só é sorteada e marcada quando a anterior termina, com pelo menos 4 dias de descanso.

### Desempate, prorrogação e pênaltis

- Confronto de **jogo único**: o placar decide; empate → prorrogação (se `extraTime`) → pênaltis (se `penalties`).
- **Ida e volta**: soma dos dois jogos; empate → gol fora (se `awayGoals`) → prorrogação **na volta** → pênaltis. Os gols da
  prorrogação contam na soma.
- A prorrogação é 30 minutos jogados pelo mesmo motor da partida (os jogadores cansam mais: o jogo todo conta 120 minutos na
  condição física). Os pênaltis são decididos pelos atributos: a chance de converter é de ~76% para um cobrador médio contra um
  goleiro médio e sobe com a **finalização e a frieza** (média de determinação e decisão) do cobrador contra os **reflexos, o
  posicionamento e a decisão** do goleiro. Cobram primeiro os cobradores de pênalti da tática do time, depois os melhores
  cobradores em campo, o goleiro por último. Cinco cobranças para cada lado e depois morte súbita.
- Sem prorrogação nem pênaltis ligados e um empate no fim, o jogo sorteia (determinístico pela semente da partida), para a copa
  nunca travar.
- `tiebreakers`: a classificação dos grupos e da fase de liga usa a ordem padrão do jogo (pontos, vitórias, saldo, gols, confronto
  direto, vermelhos, amarelos, sorteio); outra ordem gera um aviso e é ignorada.

### Cartões e suspensões (`discipline`)

`{ "yellowsPerSuspension": 3, "redCardGames": 1, "clearYellowsAfterStage": 3 }` (todos opcionais; padrão 3 amarelos e 1 jogo).
Os amarelos e as suspensões **de cada copa são só dela**: o amarelo da copa não conta na liga, o vermelho da copa suspende só nos
jogos da copa e a suspensão da liga não tira ninguém da copa. `clearYellowsAfterStage`: depois dessa fase (índice) os amarelos
acumulados zeram. Os gols e cartões da copa entram na artilharia da copa, não na da liga (os totais do jogador na temporada somam
tudo).

### Premiação (`prize`)

`{ "perStage": [100000, 150000, ...], "champion": 12000000, "runnerUp": 5000000 }`, em reais do Brasil. Cada clube recebe
`perStage[i]` ao estrear na fase `i` (quem folga recebe na fase em que entra) e o campeão e o vice recebem no fim. Os valores são
multiplicados pelo índice de receita da liga do clube (`economy.revenue`). Entram no caixa como "Premiação das copas". A bilheteria
dos jogos em casa também entra (menos em campo neutro).

### Quem joga lance a lance

Um jogo de copa é jogado lance a lance se um dos clubes é da pirâmide do técnico; senão usa a partida simplificada (que também faz
prorrogação e pênaltis). O jogador joga os jogos de copa do seu time como os de liga (tática, escalação, trocas), com a prorrogação
e os pênaltis na tela.

### Copas padrão por país

Quando um pacote tem um país com liga e **nenhuma copa dele** em `cups`, o jogo usa as copas padrão do país (`src/data/package/countryCups.ts`). Um pacote com `"cups": []` não quer copa nenhuma, nem as padrão. Se a copa padrão não cabe nas ligas do país (poucos clubes para o chaveamento), ela fica de fora e a importação mostra o aviso `cup-defaults-skipped`. Os nomes são genéricos; renomeie no pacote se quiser outros.

| País | Copas padrão |
|---|---|
| Brasil | `cup-br` (as 3 divisões, 6 fases, jogo único com o clube de menor reputação em casa até a segunda fase, depois ida e volta; final em duas partidas), `supercup-br` (campeão da liga × campeão da copa, neutro) |
| Inglaterra | `cup-en` (jogo único, a divisão inferior em casa, semifinais e final neutras, sem jogo de volta) |
| Espanha | `cup-es` (jogo único com a divisão inferior em casa, semifinais em ida e volta, final neutra), `supercup-es` (4 clubes: 1º e 2º da liga, campeão e finalista da copa; semifinais e final neutras em janeiro) |
| Itália | `cup-it` (o clube de maior reputação em casa, semifinais em ida e volta, final neutra), `supercup-it` (4 clubes, como a Espanha) |
| Alemanha | `cup-de` (sempre jogo único, divisão inferior em casa, final neutra), `supercup-de` (campeão da liga recebe o da copa) |
| França | `cup-fr` (jogo único, divisão inferior em casa, final neutra) |
| Portugal | `cup-pt` (como a Espanha), `league-cup-pt` (16 primeiros da liga, 4 grupos de 4, semifinais e final neutras) |
| Argentina | `cup-ar` (jogos únicos em campo neutro, sem prorrogação: empate vai direto aos pênaltis), `supercup-ar` (campeão da liga × campeão da copa, neutro, sem prorrogação) |

Simplificações: onde a copa real inclui divisões que o pacote não tem, entram só os clubes que existem, e os melhores (cabeças de chave) folgam na primeira fase para o chaveamento fechar. Na supercopa, se o campeão ou o finalista da copa já está entre os primeiros da liga, entra o próximo da liga.

**Calendário.** Cada país tem a sua temporada (ver "Temporadas por país" abaixo). As copas padrão dos países europeus supõem a temporada que atravessa o ano: janeiro a junho já são do ano seguinte ao da edição (a edição "2026/27" tem a copa de novembro de 2026 a maio de 2027), cada fase na primeira quarta-feira livre. As supercopas de Espanha e Itália são no meio da temporada (janeiro e dezembro) e a da Alemanha, em agosto, antes da liga.

### Copas continentais

Uma copa **sem `country`** e com `region` (`SA` ou `EU`) é continental. A edição de um ano nasce quando todos os países que dão vagas a ela já abriram a temporada daquele ano (as colocações finais da temporada passada já valem) e a edição anterior acabou; saves antigos ganham as continentais na virada, sem mudar a temporada em andamento. Os jogos caem no meio de semana, sem o mesmo dia de outro jogo do clube; quando as ligas ocupam quase toda quarta-feira, depois de esperar algumas semanas aceita-se um jogo colado em outro (nunca no mesmo dia). O título dá reputação ao clube na virada do país dele (campeão +0,8 e finalista +0,35 de reputação, antes de arredondar). A premiação (`prize`) vale em unidades do Brasil e é multiplicada pelo índice de receita da liga do clube, então pesa a mesma fração da receita em qualquer país.

O jogo traz estas cinco como padrão quando o pacote tem 5 países ou mais na região e não define uma continental dela (nomes genéricos; o nome vem do pacote). Os tamanhos são menores que os reais, proporcionais ao mundo: menos da metade dos clubes de primeira divisão de cada região. As vagas de cada país seguem a raiz da receita da liga dele (com mínimo e teto de metade da liga), incluindo o campeão da copa nacional.

| Id | Região | Formato |
|---|---|---|
| `cont-sa-1` | América do Sul (e Brasil) | 20 clubes: 2 fases preliminares (4 e 4 clubes), 4 grupos de 4 (ida e volta), quartas, semifinais (ida e volta) e final em jogo único, campo neutro |
| `cont-sa-2` | América do Sul (e Brasil) | 16 clubes em 4 grupos de 4 (os líderes pulam a repescagem) + os 4 terceiros da principal na repescagem; quartas, semifinais e final em jogo único. Não repete clube da principal |
| `cont-eu-1` | Europa | 24 clubes, fase de liga de tabela única (4 potes, 8 jogos), 4 direto às quartas, 8 na repescagem (ida e volta), quartas, semifinais e final em jogo único |
| `cont-eu-2` | Europa | 16 clubes, fase de liga (2 potes, 8 jogos), 4 direto, 8 na repescagem, quartas, semifinais e final; não repete clube da `cont-eu-1`; quinta-feira |
| `cont-eu-3` | Europa | 12 clubes, fase de liga (2 potes, 4 jogos), 2 direto às semifinais, 4 na repescagem, semifinais e final; não repete clube das outras duas; quinta-feira |

### Temporadas por país

O relógio do jogo é um só, mas **cada país tem a sua temporada**: a virada (acesso, rebaixamento, evolução, contratos, base, meta da diretoria, finanças e estatísticas), a tabela de jogos e as copas são do país e acontecem no último dia da temporada dele. A temporada aparece como "2026" (ano civil) ou "2026/27" (atravessa o ano). Os contratos terminam no último dia da temporada do clube (31/12 ou 30/6); o `endDate` de um jogador do pacote em 31/12 passa para 30/6 do mesmo ano (no mínimo o fim da primeira temporada) quando o clube é de liga `split`.

| País | Temporada | Primeira rodada (a partir de) |
|---|---|---|
| Brasil e América do Sul | ano civil | 24/1 |
| Europa (Inglaterra, Espanha, Itália, Alemanha, França, Portugal) | 2026/27 | 15/8 |

Os países de um continente abrem no mesmo fim de semana: as rodadas de meio de semana das ligas caem nas mesmas semanas e deixam as outras livres para as copas continentais (um calendário parecido com o real, não o de cada país).

Todas as ligas fazem uma semana de pausa a cada 3 rodadas de fim de semana (fim de ano, datas de seleções). O jogo começa em 1º de janeiro de `startYear` se o técnico escolhe um clube de ano civil e em 1º de julho se escolhe um clube de temporada que atravessa o ano; um país que ainda não abriu a temporada dele nessa data joga a primeira que começa depois.

**Janelas de transferência por região** (cada clube segue a da região da liga dele): `BR` janeiro até a véspera da 1ª rodada e julho; `SA` janeiro a 15/3 e julho; `EU` janeiro e julho a agosto. A janela de verão europeia cai no meio da temporada brasileira.

### Validação

Erros comuns: `cup-bracket` ("A copa em cups[0] não fecha o chaveamento…": a conta de clubes não leva a uma final de dois),
`cup-groups` (grupos de tamanho ímpar, jogos demais contra cada pote…), referência a liga ou copa que não existe, copa que cita
a si mesma, data inválida, `perStage` com mais valores que fases, `id` repetido (com outra copa ou com uma liga).

O mundo fictício padrão exporta as suas copas (`defaultPackage`): `Copa Nacional` (60 clubes, seis fases) e `Supercopa Nacional`
(campeão da liga contra o campeão da copa; se for o mesmo clube, o vice da liga joga) em `cups`.

## Pacote completo (exportação do próprio jogo)

`club.game` (`tactic`, `finances`, `fanBase`, `ticketPrice`, `objective`) e os campos `attributes`, `hidden` e `contract` de todos
os jogadores permitem recriar **exatamente** um mundo gerado pelo jogo (`defaultPackage(semente)`). Um pacote montado à mão
não precisa deles. Pacotes com mais de um país nunca precisam: o jogo deriva tudo do que está acima.

## O que o jogo faz com vários países

- Cada país é uma **pirâmide** (suas divisões ligadas por acesso e rebaixamento). Não há competição entre países.
- No **novo jogo** você escolhe o **país**, a **liga** (divisão) e o **clube**. Com um país só, a escolha do país não aparece.
- A pirâmide do clube escolhido é jogada **lance a lance**; as ligas dos outros países usam a partida simplificada (mais rápida,
  com gols, cartões, notas e lesões no mesmo formato). Ao trocar de clube na carreira o foco muda para a liga nova.
- O mercado é **único**: jogadores trocam de país por compra, empréstimo, pré-contrato e jogador livre, com as regras de preço da
  economia de cada liga (clube mais rico paga mais; o vendedor pede um prêmio de quem vem de liga mais rica) e o interesse do
  jogador pesa o nível da liga. As janelas seguem a `region` de cada liga.
- Se o clube não tem jogadores da casa suficientes para cumprir `foreignLimit.lineup`, o jogo escala os que houver (o limite é
  cumprido até onde o elenco permite).

## Erros comuns

| Mensagem (resumo) | Causa |
|---|---|
| "tem N divisões ... de 1 a 3 divisões em sequência" | Mais de 3 divisões num país, ou `level` pulando (1, 3) |
| "Acesso e rebaixamento em ... o número precisa ser X" | `promotion` de uma divisão diferente do `relegation` da de cima, ou `promotion` na divisão 1, ou `relegation` na última |
| "declara N times, mas o pacote tem M clubes nela" | `teams` diferente do número de clubes com `league` igual ao `id` |
| "número par de times, de 4 a 40" | `teams` ímpar |
| "elenco precisa ter de 18 a 30" / "não tem goleiro" | Jogadores a mais, a menos, ou sem `GK` |
| "Valor desconhecido em countries[i].id" ou "players[i].nationality" | País que não está na lista do fim deste arquivo (confira a grafia em inglês) |
| "Não há economia padrão para o país" | Aviso, não erro: país de liga sem padrão calibrado (preencha `economy` e `region`) |
| "Repetido ... já existe no pacote" | `id` ou `abbreviation` repetidos |

## Como testar uma importação

1. `node tools/run.mjs exportScalePackage` gera `dados-reais/mundo-ficticio-15-ligas.json` e imprime o tempo de validar, montar o
   mundo e criar o jogo neste computador.
2. No celular: **Menu › Novo jogo com pacote de dados**, escolha o arquivo, depois o país, a liga e o clube.
3. `?diagnostico=1` tem a seção **Importar um pacote de dados**: mede ler, validar, guardar, montar o mundo e começar um jogo, com
   o pacote gerado na tela ou com um arquivo do aparelho, e mostra se cada meta foi atingida.

## Lista de países (`countries[].id` e `players[].nationality`)

209 países: as seleções da FIFA mais Inglaterra, Escócia, País de Gales e Irlanda do Norte. O `id` é o nome em inglês da
primeira coluna. O jogo mostra o nome em português e uma bandeira simplificada (desenhada pelo jogo, sem imagens oficiais; a lista
e as bandeiras estão em `src/ui/countries.ts`, gerado de `tools/countries.txt`). Países com padrão calibrado de economia: os 14
primeiros.

| `id` | Nome |
|---|---|
| `Brazil` | Brasil |
| `Argentina` | Argentina |
| `Uruguay` | Uruguai |
| `Paraguay` | Paraguai |
| `Chile` | Chile |
| `Colombia` | Colômbia |
| `Peru` | Peru |
| `Ecuador` | Equador |
| `England` | Inglaterra |
| `Spain` | Espanha |
| `Italy` | Itália |
| `Germany` | Alemanha |
| `France` | França |
| `Portugal` | Portugal |
| `Afghanistan` | Afeganistão |
| `Albania` | Albânia |
| `Algeria` | Argélia |
| `American Samoa` | Samoa Americana |
| `Andorra` | Andorra |
| `Angola` | Angola |
| `Anguilla` | Anguilla |
| `Antigua and Barbuda` | Antígua e Barbuda |
| `Armenia` | Armênia |
| `Aruba` | Aruba |
| `Australia` | Austrália |
| `Austria` | Áustria |
| `Azerbaijan` | Azerbaijão |
| `Bahamas` | Bahamas |
| `Bahrain` | Bahrein |
| `Bangladesh` | Bangladesh |
| `Barbados` | Barbados |
| `Belarus` | Belarus |
| `Belgium` | Bélgica |
| `Belize` | Belize |
| `Benin` | Benin |
| `Bermuda` | Bermudas |
| `Bhutan` | Butão |
| `Bolivia` | Bolívia |
| `Bosnia and Herzegovina` | Bósnia e Herzegovina |
| `Botswana` | Botsuana |
| `British Virgin Islands` | Ilhas Virgens Britânicas |
| `Brunei` | Brunei |
| `Bulgaria` | Bulgária |
| `Burkina Faso` | Burkina Faso |
| `Burundi` | Burundi |
| `Cambodia` | Camboja |
| `Cameroon` | Camarões |
| `Canada` | Canadá |
| `Cape Verde` | Cabo Verde |
| `Cayman Islands` | Ilhas Cayman |
| `Central African Republic` | República Centro-Africana |
| `Chad` | Chade |
| `China` | China |
| `Comoros` | Comores |
| `Congo` | Congo |
| `Costa Rica` | Costa Rica |
| `Croatia` | Croácia |
| `Cuba` | Cuba |
| `Curaçao` | Curaçao |
| `Cyprus` | Chipre |
| `Czech Republic` | República Tcheca |
| `Denmark` | Dinamarca |
| `Djibouti` | Djibuti |
| `Dominica` | Dominica |
| `Dominican Republic` | República Dominicana |
| `DR Congo` | RD Congo |
| `Egypt` | Egito |
| `El Salvador` | El Salvador |
| `Equatorial Guinea` | Guiné Equatorial |
| `Eritrea` | Eritreia |
| `Estonia` | Estônia |
| `Eswatini` | Essuatíni |
| `Ethiopia` | Etiópia |
| `Faroe Islands` | Ilhas Faroé |
| `Fiji` | Fiji |
| `Finland` | Finlândia |
| `Gabon` | Gabão |
| `Gambia` | Gâmbia |
| `Georgia` | Geórgia |
| `Ghana` | Gana |
| `Gibraltar` | Gibraltar |
| `Greece` | Grécia |
| `Grenada` | Granada |
| `Guam` | Guam |
| `Guatemala` | Guatemala |
| `Guinea` | Guiné |
| `Guinea-Bissau` | Guiné-Bissau |
| `Guyana` | Guiana |
| `Haiti` | Haiti |
| `Honduras` | Honduras |
| `Hong Kong` | Hong Kong |
| `Hungary` | Hungria |
| `Iceland` | Islândia |
| `India` | Índia |
| `Indonesia` | Indonésia |
| `Iran` | Irã |
| `Iraq` | Iraque |
| `Ireland` | Irlanda |
| `Israel` | Israel |
| `Ivory Coast` | Costa do Marfim |
| `Jamaica` | Jamaica |
| `Japan` | Japão |
| `Jordan` | Jordânia |
| `Kazakhstan` | Cazaquistão |
| `Kenya` | Quênia |
| `Kosovo` | Kosovo |
| `Kuwait` | Kuwait |
| `Kyrgyzstan` | Quirguistão |
| `Laos` | Laos |
| `Latvia` | Letônia |
| `Lebanon` | Líbano |
| `Lesotho` | Lesoto |
| `Liberia` | Libéria |
| `Libya` | Líbia |
| `Liechtenstein` | Liechtenstein |
| `Lithuania` | Lituânia |
| `Luxembourg` | Luxemburgo |
| `Macau` | Macau |
| `Madagascar` | Madagascar |
| `Malawi` | Malawi |
| `Malaysia` | Malásia |
| `Maldives` | Maldivas |
| `Mali` | Mali |
| `Malta` | Malta |
| `Mauritania` | Mauritânia |
| `Mauritius` | Maurício |
| `Mexico` | México |
| `Moldova` | Moldávia |
| `Mongolia` | Mongólia |
| `Montenegro` | Montenegro |
| `Montserrat` | Montserrat |
| `Morocco` | Marrocos |
| `Mozambique` | Moçambique |
| `Myanmar` | Mianmar |
| `Namibia` | Namíbia |
| `Nepal` | Nepal |
| `Netherlands` | Países Baixos |
| `New Caledonia` | Nova Caledônia |
| `New Zealand` | Nova Zelândia |
| `Nicaragua` | Nicarágua |
| `Niger` | Níger |
| `Nigeria` | Nigéria |
| `North Korea` | Coreia do Norte |
| `North Macedonia` | Macedônia do Norte |
| `Northern Ireland` | Irlanda do Norte |
| `Norway` | Noruega |
| `Oman` | Omã |
| `Pakistan` | Paquistão |
| `Palestine` | Palestina |
| `Panama` | Panamá |
| `Papua New Guinea` | Papua-Nova Guiné |
| `Philippines` | Filipinas |
| `Poland` | Polônia |
| `Puerto Rico` | Porto Rico |
| `Qatar` | Catar |
| `Romania` | Romênia |
| `Russia` | Rússia |
| `Rwanda` | Ruanda |
| `Saint Kitts and Nevis` | São Cristóvão e Nevis |
| `Saint Lucia` | Santa Lúcia |
| `Saint Vincent and the Grenadines` | São Vicente e Granadinas |
| `Samoa` | Samoa |
| `San Marino` | San Marino |
| `Sao Tome and Principe` | São Tomé e Príncipe |
| `Saudi Arabia` | Arábia Saudita |
| `Scotland` | Escócia |
| `Senegal` | Senegal |
| `Serbia` | Sérvia |
| `Seychelles` | Seicheles |
| `Sierra Leone` | Serra Leoa |
| `Singapore` | Singapura |
| `Slovakia` | Eslováquia |
| `Slovenia` | Eslovênia |
| `Solomon Islands` | Ilhas Salomão |
| `Somalia` | Somália |
| `South Africa` | África do Sul |
| `South Korea` | Coreia do Sul |
| `South Sudan` | Sudão do Sul |
| `Sri Lanka` | Sri Lanka |
| `Sudan` | Sudão |
| `Suriname` | Suriname |
| `Sweden` | Suécia |
| `Switzerland` | Suíça |
| `Syria` | Síria |
| `Taiwan` | Taiwan |
| `Tajikistan` | Tajiquistão |
| `Tanzania` | Tanzânia |
| `Thailand` | Tailândia |
| `Timor-Leste` | Timor-Leste |
| `Togo` | Togo |
| `Tonga` | Tonga |
| `Trinidad and Tobago` | Trinidad e Tobago |
| `Tunisia` | Tunísia |
| `Turkey` | Turquia |
| `Turkmenistan` | Turcomenistão |
| `Turks and Caicos` | Ilhas Turcas e Caicos |
| `Uganda` | Uganda |
| `Ukraine` | Ucrânia |
| `United Arab Emirates` | Emirados Árabes Unidos |
| `United States` | Estados Unidos |
| `US Virgin Islands` | Ilhas Virgens Americanas |
| `Uzbekistan` | Uzbequistão |
| `Vanuatu` | Vanuatu |
| `Venezuela` | Venezuela |
| `Vietnam` | Vietnã |
| `Wales` | País de Gales |
| `Yemen` | Iêmen |
| `Zambia` | Zâmbia |
| `Zimbabwe` | Zimbábue |
