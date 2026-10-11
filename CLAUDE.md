# Meu Manager — Jogo de técnico de futebol

Jogo de gerenciamento de futebol para navegador e celular, inspirado no Brasfoot, mas mais profundo: o resultado das partidas deve depender de atributos específicos dos jogadores e das escolhas táticas, não só da força geral do time. O jogo precisa continuar **rápido** como o Brasfoot (uma temporada inteira em pouco tempo).

Idioma do jogo e do código: textos da interface em português do Brasil. Nomes de variáveis, funções e tipos em inglês.

**Valores de texto dos tipos também são em inglês** (ex.: `'possession'`, `'finished'`, `'counter-attack'`, posições `GK`, `CB`, `ST`). O português só existe na interface: todos os rótulos ficam em `src/ui/labels.ts` (`Record<Tipo, string>`, para o TypeScript acusar rótulo faltando). Nunca escrever texto em português dentro de `src/engine` ou `src/data`, exceto a narração das partidas e nomes próprios (jogadores, apelidos, times, cidades, estádios). Nacionalidades são valores em inglês (`'Brazil'`) com rótulo em `labels.ts`. Ao criar um valor novo em um tipo, adicionar o rótulo em `labels.ts`.

---

## Stack

- **TypeScript** (modo `strict`) em todo o projeto
- **React + Vite** para a interface
- **Tailwind CSS** para estilo, mobile-first
- **Vitest** para testes
- **Dexie (IndexedDB)** para salvar o jogo no navegador
- **PWA** para instalar no celular
- Sem backend no MVP

## Arquitetura (regras importantes)

```
src/
  engine/   lógica pura do jogo (partida, temporada, mercado, evolução)
  data/     geração de mundo: times e jogadores fictícios, nomes
  store/    estado do jogo e salvamento (Dexie)
  ui/       telas e componentes React
tests/      testes do motor e de balanceamento
docs/       documentos de design
```

1. **`src/engine` não importa nada de React, do DOM ou do `store`.** É TypeScript puro e testável isoladamente.
2. **Toda aleatoriedade usa um gerador com semente (seed)** passado como parâmetro. Nunca usar `Math.random()` no motor. Mesma semente = mesmo resultado.
3. **Dados derivados não são guardados**: a classificação é calculada a partir das partidas finalizadas (com cache por rodada).
4. Funções do motor recebem dados e devolvem dados novos; evitar mutação escondida.
5. Toda regra nova do motor vem acompanhada de teste.

---

## Modelo de dados

### Jogador
- **Identidade:** id, nome, idade, nacionalidade, pé preferido (direito/esquerdo/ambos), posição principal e até 2 posições secundárias.
- **Posições:** GK, RB, LB, CB, DM, CM, AM, RW, LW, ST (na interface: GOL, LD, LE, ZAG, VOL, MC, MEI, PD, PE, ATA).
- **Escala:** todos os atributos (visíveis e ocultos) e a força geral são **inteiros de 1 a 100** (limites em `ATTRIBUTE_MIN`/`ATTRIBUTE_MAX` no `config.ts`); a força geral calculada é decimal e só se arredonda para exibir. Só a **reputação dos times continua de 1 a 20**. Penalidades de posição são proporções (multiplicadores), então valem em qualquer escala.
- **Atributos visíveis (1 a 100):**
  - Técnicos: passe, finalização, drible, cruzamento, desarme, cabeceio, controle de bola
  - Físicos: velocidade, resistência, força
  - Mentais: visão, posicionamento, decisão, determinação
  - Goleiro: reflexos, saída do gol (goleiro também usa posicionamento)
- **Atributos ocultos (1 a 100):** potencial (mesma escala da força geral), consistência, propensão a lesão, profissionalismo.
- **Estado:** condição física (0–100), moral, forma (média das últimas notas), lesão (dias restantes), cartões e suspensão.
- **Contrato:** salário, data de término, multa rescisória, clube de origem se emprestado.
- **Força geral:** calculada a partir dos atributos com pesos por posição (ex.: zagueiro pesa desarme, cabeceio, posicionamento; atacante pesa finalização, velocidade, drible). Jogar fora da posição principal aplica penalidade; posição secundária tem penalidade menor.
- **Faixas de força no mundo gerado:** titulares da Série A ~55 a 85; da Série B ~40 a 65. Craques (acima de ~85) são poucos no campeonato inteiro, só em times grandes da A; atributos acima de 90 são raros. A calibragem fica em `src/data/generationConfig.ts` e é coberta por testes.

### Time
- **Identidade:** id, nome, abreviação de 3 letras, cidade, estado, 2 cores, estádio (nome e capacidade).
- **Reputação (1 a 20):** influencia atração de jogadores, patrocínio, público e meta da diretoria. Muda devagar conforme resultados.
- **Elenco:** máximo 30, mínimo 18 jogadores.
- **Tática salva:** formação, estilo, mentalidade, 11 titulares, reservas, capitão, cobradores de pênalti e falta. A IA usa a mesma estrutura.
- **Finanças:** saldo, orçamento de salários, orçamento de transferências, registro de receitas/despesas por categoria. MVP: bilheteria, patrocínio, venda de jogadores / salários, compras.
- **Torcida:** tamanho (define público junto com reputação e preço do ingresso).
- **Diretoria:** meta da temporada baseada na reputação; muito abaixo da meta = demissão.
- **Histórico:** posição final por temporada e títulos.

### Temporada e calendário
- Guarda ano, data atual, competições e fase (pré-temporada, em andamento, encerramento).
- **O jogo avança por dias.** O botão "avançar" pula até o próximo evento relevante (jogo, proposta, fim de janela).

### Competição
- Campo `tipo` (no MVP só `liga`; depois `mata-mata` e `grupos+mata-mata`).
- Liga: 20 times, turno e returno, 38 rodadas. Vitória 3 pts, empate 1.
- **Desempate (Brasileirão):** pontos, vitórias, saldo de gols, gols marcados, confronto direto, cartões vermelhos, cartões amarelos, sorteio.
- Tabela gerada pelo **método do círculo**; returno espelha o turno com mando invertido; alternar mandos (evitar 3 jogos seguidos fora).

### Partida
- Competição, rodada, data, mandante, visitante, status, **seed usada**.
- Após jogada: placar, eventos (gol, cartão, lesão, substituição, com minuto e jogador), estatísticas (posse, finalizações, no alvo, escanteios, faltas, cartões, xG), nota de cada jogador, condição física final.

---

## Motor de partida

Simulação por jogadas decididas por duelos entre jogadores específicos. Cerca de 90–100 momentos de posse por partida. Uma partida deve rodar em milissegundos.

### Etapas de cada momento (pode terminar em qualquer uma)
1. **Disputa do meio:** quem fica com a bola. Meio-campo (passe, visão, controle, posicionamento) contra (desarme, posicionamento, resistência).
2. **Progressão:** sorteia condutor (peso por posição) e marcador. Atributos conforme o tipo de jogada:
   - drible: drible + velocidade × desarme + velocidade
   - passe em profundidade: passe + visão × posicionamento
   - cruzamento: cruzamento × posicionamento do lateral
3. **Criação da chance** (xG base por tipo): chute de fora (baixo), cabeceio após cruzamento (médio, cabeceio × cabeceio do zagueiro), finalização na área (alto), cara a cara (muito alto).
4. **Finalização × goleiro:** xG ajustado por finalização contra reflexos + posicionamento do goleiro. Resultados: gol, defesa (pode gerar escanteio), fora, bloqueio.

Eventos paralelos: faltas (mais com marcação agressiva), cartões, pênaltis, escanteios, lesões (propensão a lesão + condição física baixa).

### Fórmula do duelo
```
chance = 1 / (1 + e^(-k × (ataque − defesa)))
```
Pontuação de cada lado = média ponderada dos atributos envolvidos × modificadores. `k` é constante de calibragem (fica em um arquivo de configuração do motor).

### Modificadores
- Condição física (cai durante o jogo conforme resistência e estilo)
- Moral e forma (efeito pequeno)
- Consistência (variação de desempenho)
- Fator casa (pequeno; maior com estádio cheio)
- Posição improvisada

### Tática
- **Estilos:** posse (ganha meio, menos chances cara a cara), contra-ataque (menos posse, transições de alta qualidade), pressão alta (recupera bola alta, cansa mais, deixa espaço nas costas).
- **Mentalidade:** de muito defensiva a muito ofensiva; desloca peso entre atacar e defender.
- **Formação:** define quantos jogadores entram em cada setor/duelo.
- Toda opção tática precisa ter um custo.

### Nota do jogador
Parte de 6,0 e soma/subtrai por ações (gols, assistências, desarmes, erros, defesas, cartões).

### Metas de calibragem (média de milhares de partidas)
- ~2,3 a 2,5 gols por jogo
- mandante vence ~45–50%, empates ~25–30%
- ~12 finalizações por time por jogo

Criar testes de balanceamento que simulem temporadas inteiras e verifiquem esses intervalos.

---

## Mundo inicial
- **Série A e Série B**, 20 times cada, todos fictícios por padrão (sem nomes reais por questão de licença).
- **Futuro:** times e jogadores reais serão carregados de um **arquivo de dados importado** (e o editor permitirá dados da comunidade). Por isso o mundo é sempre um `World` (`teams` + `players`) de dados puros: a geração fictícia em `src/data` é só uma das fontes, e o motor, o store e a UI nunca devem depender de como o mundo foi criado. Um importador futuro deve validar o arquivo (escala 1–100, elenco de 18 a 30, ids únicos) e montar o mesmo `World`.
- Faixas de reputação na Série A: ~4 grandes, ~8 médios, ~8 pequenos. Série B com reputação menor.
- Jogadores gerados com atributos coerentes com a posição e idades variadas (veteranos e promessas em todo time). Elencos de 24 a 30 jogadores (times de maior reputação tendem a elencos maiores).
- Escalação automática (IA e sugestão ao jogador): escolhe a formação que melhor encaixa os melhores jogadores, usando posições secundárias quando compensa; craques não ficam no banco.
- 4 sobem da B e 4 caem da A.
- A Série B é simulada pelo mesmo motor; no MVP a interface da B é só a classificação e resultados.

## Virada de temporada (ordem)
1. Acesso e rebaixamento
2. Ajuste de reputação dos times
3. Envelhecimento + evolução/declínio (idade, potencial, minutos jogados, profissionalismo)
4. Aposentadorias
5. Fim de contratos vencidos (jogadores livres no mercado)
6. Geração de jovens em cada time
7. Nova meta da diretoria
8. Nova tabela de jogos

---

## Escopo do MVP
- Criar novo jogo escolhendo um time da A ou da B
- Ver elenco, atributos e força por posição
- Definir tática e escalação
- Jogar partidas com narração em texto e estatísticas; substituições e mudança tática no intervalo
- Classificação das duas séries
- Mercado simples (comprar, vender, propostas da IA)
- Finanças básicas
- Meta da diretoria e demissão
- Temporadas encadeadas com virada de temporada
- Salvar e carregar

**Fora do MVP (não implementar ainda):** copas, Libertadores, treino, comissão técnica, olheiros, contratos detalhados com empresários, imprensa, humor da torcida, vestiário, visualização 2D, multiplayer, editor de dados.

## Fases seguintes
- **Fase 2:** Copa do Brasil e continentais, treino, comissão técnica, olheiros, contratos detalhados, direitos de TV, sócio-torcedor, premiações.
- **Fase 3:** imprensa, humor da torcida, vestiário, visualização 2D da partida, editor de dados/mods, salvamento na nuvem.

---

## Ordem de implementação sugerida
1. Setup do projeto (Vite + React + TS + Tailwind + Vitest), gerador aleatório com seed
2. Tipos do modelo de dados
3. Geração de jogadores e times fictícios (Série A e B)
4. Motor de partida + testes de balanceamento
5. Calendário, tabela de jogos e classificação
6. Telas: elenco, tática, partida, classificação
7. Finanças, mercado e diretoria
8. Virada de temporada
9. Salvamento (Dexie) e PWA

## Convenções
- Componentes React pequenos e focados; lógica fica no `engine`, não nos componentes.
- Constantes de balanceamento centralizadas em `src/engine/config.ts`.
- Rodar os testes depois de qualquer mudança no motor.
- Interface pensada primeiro para celular.
