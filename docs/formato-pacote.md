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
  "academy": [ ... ]
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

## Países (`countries`)

```json
{ "id": "England", "name": "Inglaterra" }
```

- `id`: **uma nacionalidade do jogo** (a mesma usada em `players[].nationality`): `Brazil`, `Argentina`, `Uruguay`,
  `Paraguay`, `Chile`, `Colombia`, `Peru`, `Ecuador`, `England`, `Spain`, `Italy`, `Germany`, `France`, `Portugal`.
  Um país fora dessa lista é recusado (`unknown-value`); nacionalidade nova exige código no jogo (rótulo em `labels.ts` e
  bandeira).
- `name`: nome mostrado (português).
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

Sem `economy`, valem os padrões calibrados para o país (`src/data/package/leagueDefaults.ts`):

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
  (fora da pirâmide do técnico) o limite também vale. As substituições durante a partida não são limitadas.

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
| `nationality` | sim | Uma das nacionalidades da lista de países acima |
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
| "Valor desconhecido em countries[i].id" | País que não é uma das nacionalidades do jogo |
| "Repetido ... já existe no pacote" | `id` ou `abbreviation` repetidos |

## Como testar uma importação

1. `node tools/run.mjs exportScalePackage` gera `dados-reais/mundo-ficticio-15-ligas.json` e imprime o tempo de validar, montar o
   mundo e criar o jogo neste computador.
2. No celular: **Menu › Novo jogo com pacote de dados**, escolha o arquivo, depois o país, a liga e o clube.
3. `?diagnostico=1` tem a seção **Importar um pacote de dados**: mede ler, validar, guardar, montar o mundo e começar um jogo, com
   o pacote gerado na tela ou com um arquivo do aparelho, e mostra se cada meta foi atingida.
