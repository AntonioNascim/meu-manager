# Plano: mundo real com várias ligas

Fase nova do Meu Manager: sair do mundo fictício de duas divisões e chegar a um mundo com clubes e jogadores reais, várias ligas, mercado entre países e copas. Este documento guarda as decisões já tomadas e a ordem de trabalho.

## Decisões já tomadas

1. **Atributos dos jogadores reais são gerados automaticamente** a partir de posição, idade, reputação do clube e nível da liga, de forma **estável** (o mesmo jogador gera sempre os mesmos atributos), e podem ser **ajustados por um editor dentro do jogo** (Fase 4). Nenhum atributo real é copiado de jogos ou bases de terceiros.
2. ~~Os dados reais ficam num arquivo separado que só o usuário importa.~~ **Substituída (ver "Decisões de modelo" abaixo):** o jogo publicado traz os dados reais embutidos. Até o pacote real ficar pronto, `dados-reais/` continua no `.gitignore` e o repositório só leva o pacote fictício padrão.
3. **Ligas:** Brasil, Europa e América do Sul.
4. O motor de partida e o equilíbrio **não mudam** por causa do mundo: um pacote só decide quem são os clubes, os jogadores e as ligas. O pacote fictício padrão tem que continuar dando o mesmo mundo e as mesmas temporadas (`npm run analyze -- years --years 30 --seed 41`).
5. O pacote importado fica guardado **só no navegador** (IndexedDB), junto com o save.

## Decisões de modelo (substituem o que for contrário acima)

1. **O jogo é totalmente gratuito, inclusive o futuro modo online.** A monetização fica para depois, quando o jogo tiver jogadores, e será decidida mais tarde. Nada no código ou no desenho do jogo deve depender dela.
2. **O jogo publicado vem com os dados reais embutidos** (clubes e jogadores reais), sem o jogador precisar importar nada. Isso substitui a decisão anterior de manter os dados reais fora do repositório: quando o pacote real estiver pronto, a pasta `dados-reais/` deixa de ser ignorada (sai do `.gitignore`) e o pacote entra no repositório e no site/PWA. **A importação de pacotes continua existindo** (pacotes da comunidade, o editor, o mundo fictício).
3. **Cuidados obrigatórios com os dados reais:**
   - **Escudos sempre gerados** com as cores do clube (`Crest`), nunca os oficiais.
   - **Nada de logos nem nomes oficiais de campeonatos** quando houver alternativa (ex.: "Liga Inglesa", "Série A" só onde for o nome genérico).
   - **Elencos vindos da Wikipedia:** tela de **créditos** no jogo e o arquivo de dados distribuído **sob a licença dela** (CC BY-SA), com a atribuição no campo `credits` do pacote.
   - **Aviso visível** (tela de informações e primeira abertura) de que o jogo é **independente e sem ligação com clubes, jogadores, ligas ou federações**.
   - **O mundo fictício continua existindo**, com uma **opção de trocar para nomes genéricos** (clubes e jogadores inventados) no lugar dos reais.
4. **Fase 5 = montar o pacote real** (Brasil, Europa e América do Sul) e **embuti-lo no jogo**. **Depois de todas as fases, entra obrigatoriamente a Fase 6, o modo online com ligas entre jogadores, gratuito.** As decisões técnicas de todas as fases precisam manter o caminho aberto para ele: **simulação determinística por semente** (mesma semente, mesmo resultado), **estado do jogo serializável** (`Game` é dado puro, salvo em partes) e **motor separado da interface** (`src/engine` não importa React, DOM nem `store`).
5. **O online terá custo de servidor** (contas, ligas, partidas, armazenamento e tráfego), **a ser planejado** na Fase 6 antes de começar; como o jogo é gratuito, o custo precisa caber numa solução decidida então (inclusive a monetização, adiada).

## Fases

### Fase 1 — Pacote de dados (esta)
- Formato JSON versionado: países, ligas, clubes e jogadores (detalhes abaixo).
- Geração estável de atributos para jogador sem atributos.
- O mundo fictício vira o **pacote padrão**: é exportado e carregado pelo mesmo caminho do pacote do usuário. Exportar e importar de volta dá o mesmo mundo (teste de ida e volta).
- Importação no menu ("Novo jogo com pacote de dados"), com validação e mensagens claras (campo faltando, clube sem jogadores, liga com número errado de times).
- O jogo continua com **uma liga de duas divisões**: pacote com mais ligas é recusado com aviso.

### Fase 2 — Várias ligas e mercado internacional
- Calendário, classificação, acesso e rebaixamento por liga (hoje o motor assume duas divisões de 20).
- Várias ligas rodando em paralelo no mesmo mundo; o jogador escolhe a liga e o clube ao começar.
- Mercado entre países: janelas por liga, transferências e empréstimos internacionais, nacionalidades novas (com bandeira), cotas de estrangeiros se necessário, moedas/valores coerentes.
- Equilíbrio: nível médio por liga (`teamLevel` por liga) e testes de longo prazo com várias ligas.

### Fase 3 — Copas nacionais e continentais
- Competições `mata-mata` e `grupos+mata-mata` (o campo `tipo` da competição já foi pensado para isso).
- Copas nacionais por país e continentais (Europa e América do Sul), com vagas vindas da classificação das ligas.
- Calendário unificado (ligas + copas) e fadiga/rodízio.

### Fase 4 — Editor
- Editor dentro do jogo para ajustar atributos, potencial, posições e dados de jogadores e clubes, salvo junto com o pacote no navegador.
- Exportar o pacote editado (arquivo que o usuário guarda ou compartilha por conta própria).

### Fase 5 — Pacote real a partir dos elencos da Wikipedia, embutido no jogo
- Ferramenta **separada do jogo e fora do site** que lê elencos da Wikipedia e monta um pacote no formato da Fase 1, sem atributos (o jogo gera os atributos).
- Os **créditos da licença** (Wikipedia, CC BY-SA) acompanham o pacote (campo `credits` do formato) e aparecem no jogo ao importar e na tela de informações.
- O pacote gerado é **embutido no jogo** (a pasta `dados-reais/` sai do `.gitignore` quando ele estiver pronto), com os cuidados das "Decisões de modelo": escudos gerados, nomes genéricos de campeonatos, tela de créditos, aviso de jogo independente e opção de mundo fictício.

## Formato do pacote (versão 1)

Arquivo JSON:

```json
{
  "format": "meu-manager-package",
  "version": 1,
  "name": "Mundo fictício",
  "startYear": 2026,
  "credits": "texto livre (licença e fontes)",
  "countries": [{ "id": "Brazil", "name": "Brasil" }],
  "leagues": [
    { "id": "br-1", "name": "Série A", "country": "Brazil", "level": 1, "teams": 20, "promotion": 4, "relegation": 4,
      "tiebreakers": ["wins", "goal-difference", "goals-for", "head-to-head", "red-cards", "yellow-cards", "draw"] }
  ],
  "clubs": [
    { "id": "team-imp", "name": "…", "abbreviation": "IMP", "colors": ["#111111", "#f2f2f2"], "city": "…", "state": "SP",
      "stadium": { "name": "…", "capacity": 40000 }, "reputation": 19, "league": "br-1" }
  ],
  "players": [
    { "name": "…", "nickname": "…", "birthDate": "2000-01-01", "nationality": "Brazil",
      "position": "ST", "secondaryPositions": ["AM"], "foot": "right", "club": "team-imp" }
  ]
}
```

- **Obrigatórios** nos jogadores: nome, data de nascimento, nacionalidade, posição principal e clube. Opcionais: apelido, posições secundárias, pé (senão é gerado), `attributes`, `potential` e, para pacotes exportados do jogo, os campos que fazem a ida e volta exata (`id`, `hidden`, `contract`).
- Sem `attributes`, o jogo gera de forma estável: o sorteio vem da identidade do jogador (nome, nascimento, nacionalidade, posição), o nível vem da reputação do clube e da divisão da liga, e tudo respeita as faixas de força do mundo fictício (titulares da Série A ~55 a 85, da B ~40 a 65).
- Clubes e times podem trazer campos extras opcionais (`finances`, `tactic`, …) quando o pacote é uma exportação do jogo; sem eles são derivados (escalação automática, finanças pela reputação, meta da diretoria).
- Nada de texto em português no pacote além de nomes próprios; rótulos e mensagens ficam em `src/ui`.

## Regras da Fase 1

- **Validação** (`src/data/package/validate.ts`) devolve problemas estruturados (código, caminho, detalhe) e a interface os transforma em mensagens: formato ou versão desconhecidos, campo faltando, valor fora da escala, id repetido, clube de liga inexistente, clube sem jogadores (mínimo 18) ou com mais de 30, liga com número de times diferente do declarado ou do que o jogo aceita (20 por divisão nesta fase), goleiro faltando, mais de uma liga por país ou mais de duas divisões (recusado nesta fase).
- **Carregamento** (`src/data/package/load.ts`): `worldFromPackage(pacote, semente)` devolve o mesmo `World` do resto do jogo (a base é gerada com a semente do jogo se o pacote não trouxer).
- **Pacote padrão** (`src/data/package/defaultPackage.ts`): `defaultPackage(semente)` = exportação do mundo fictício gerado; `createGame` passa por ele.
- **No navegador**: o pacote importado vai para a tabela `packages` do IndexedDB e o jogo guarda só a referência (`Game.dataPackage`).

## Fora do escopo por enquanto

- Mudar o motor de partida, o equilíbrio, as finanças ou o calendário.
- Mais de uma liga, copas, editor, importador da Wikipedia.
- Qualquer dado real dentro do repositório ou do build.

### Fase 6 — Modo online com ligas entre jogadores (obrigatória, depois de todas as fases)
- Gratuito, como o resto do jogo. Ligas em que vários jogadores comandam clubes do mesmo mundo.
- Aproveita o que já existe: **simulação determinística por semente** (os resultados podem ser conferidos e reproduzidos), **`Game` serializável** e **motor puro** que pode rodar no servidor.
- **Custo de servidor a planejar** antes de começar (contas, ligas, armazenamento, tráfego, moderação), junto com a decisão adiada sobre monetização.
