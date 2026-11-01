# Como atualizar os elencos a cada janela de transferências

Os clubes e jogadores do mundo real vêm do arquivo `data/pacote-real.json`. Os jogadores mudam de clube a cada janela de transferências (e o jogo traz a lista de times de cada temporada), então esse arquivo precisa ser refeito de tempos em tempos. Este guia diz como, sem pular nada.

**Quanto tempo leva:** de 20 a 40 minutos de coleta (o computador faz sozinho) mais uns 15 minutos seus. **Quando fazer:** quando a janela fechar (a principal na Europa fecha em 1º de setembro; no Brasil, em agosto) e, se quiser, de novo em janeiro/fevereiro.

**Importante:** quem já tem um jogo salvo **não é afetado**. O save guarda o mundo inteiro dentro dele. O arquivo novo só vale para jogos novos.

---

## Antes de começar

- Trabalhe numa branch nova, nunca direto na `main`: `git checkout -b atualiza-elencos-AAAA-MM`
- Tenha a pasta `dados-reais/` do computador onde você fez a última coleta (ela guarda o cache, as planilhas e o arquivo **`correcoes.json`**, com tudo que a equipe corrigiu à mão). Ela não vai para o Git; **faça uma cópia dela** antes de começar.
- Tenha internet estável e deixe o computador ligado e sem dormir durante a coleta.

---

## Passo a passo

### 1. Rodar a coleta

```
npm run dados:planilhas -- --atualizar --contato "seu@email.com"
```

- `--atualizar` baixa tudo de novo (sem ele, o programa reaproveita o que já baixou e nada muda).
- O e-mail vai nas consultas à Wikipedia e ao Wikidata (eles pedem um contato).
- Se interromper (queda de internet, computador desligou), rode **o mesmo comando de novo**: ele continua de onde parou.
- Se faltar memória, rode uma liga por vez (`--liga br-1`, depois `--liga en-1`...) e, no fim, uma rodada completa (que só usa o que já está guardado). Detalhes em `docs/planilhas-reais.md`.

No fim, o programa mostra um resumo. Abra `dados-reais/planilhas/relatorio.md` e confira se não há surpresas (clube que sumiu, liga com número errado de times).

### 2. Aplicar as correções

As correções antigas (posição, cores, estádio, força...) são **reaplicadas sozinhas** na etapa 1. O que você precisa fazer aqui é tratar o que a coleta deixou para a mão:

1. Abra as listas em `dados-reais/planilhas/tarefas/` (uma por liga) e preencha as colunas `valor_correto` e `feito`.
2. Salve as planilhas preenchidas em `dados-reais/planilhas/tarefas-feitas/`.
3. Confira sem gravar nada: `npm run dados:aplicar -- --simular`
4. Se as linhas estiverem certas: `npm run dados:aplicar`

O programa mostra, linha por linha, o que foi aplicado e o que deu erro. Corrija os erros e rode de novo. Aviso do tipo "correções guardadas que não acharam o registro" é normal: o jogador saiu do clube e a correção dele ficou sem efeito.

Se a reputação de algum clube grande ficou estranha (um clube pequeno maior que um gigante), ajuste a tabela de `tools/realReputation.ts` e rode `node tools/run.mjs realReputation`.

### 3. Gerar o pacote

```
npm run dados:finalizar
```

Isso gera os atributos de todos os jogadores, monta o `pacote-real.json` novo e o valida. **O resultado esperado é zero erros.** Se aparecer erro (elenco com menos de 18, clube sem goleiro...), o texto diz qual clube e o que falta: corrija com as tarefas da etapa 2 e rode de novo.

Confira também `dados-reais/planilhas/conferencia/top-300-jogadores.csv`: os melhores jogadores do mundo devem ter a força que você espera. Se algum estiver errado, corrija o campo `força` na planilha de tarefas (etapa 2).

Depois, copie o pacote final para o jogo:

```
node tools/run.mjs realReputation --copiar
```

Isso grava `data/pacote-real.json` com o nome "Mundo real AAAA" e os créditos da Wikipedia. (O nome do pacote — "Mundo real 2026" — está fixo na linha `final.name = ...` de `tools/realReputation.ts`; num ano novo, troque o número ali antes de rodar.)

### 4. Rodar os testes

```
npm test
npx vitest run --project unit tests/realPackage.test.ts
```

O `npm test` leva menos de 1 minuto. Se algum teste falhar, **não publique**: leia a mensagem (normalmente diz o que está errado no pacote) e volte à etapa 2 ou 3.

Se a quantidade de clubes ou de ligas mudou, rode também o balanceamento (`npm run test:balance`, de 2 a 5 minutos) e as medições do mundo real pelo workflow **Medições pesadas** (aba Actions › Run workflow, opção `calibracao-real`).

### 5. Testar no navegador

```
npm run dev
```

Abra `http://localhost:5173`, toque em **Novo jogo**, escolha um clube e jogue um dia. Confira: o seu clube tem os jogadores atuais? Os nomes aparecem inteiros (sem pedaços de texto estranho)? Quem foi vendido na janela está no clube novo?

Procure por nomes ou apelidos **estranhos ou ofensivos**: os dados vêm da Wikipedia e do Wikidata, que às vezes têm vandalismo. Se achar um, corrija o nome na planilha e rode a etapa 3 de novo.

### 6. Publicar

1. Faça o commit: `git add data/pacote-real.json` e `git commit -m "Atualiza elencos (janela de AAAA)"`
2. Envie a branch e abra o pull request no GitHub; confira que os testes do GitHub ficaram verdes.
3. Junte na `main`. O GitHub publica o site sozinho (workflow *Testes e publicação no GitHub Pages*, uns 3 minutos).
4. Abra o site com internet. A faixa **"Há uma versão nova do jogo"** aparece: toque em **Atualizar**. (No celular instalado, o mesmo.)

---

## Resumo rápido (para colar na parede)

| # | Comando | O que faz |
|---|---|---|
| 1 | `npm run dados:planilhas -- --atualizar --contato "email"` | baixa os elencos novos |
| 2 | preencher `tarefas-feitas/` e `npm run dados:aplicar` | aplica as correções à mão |
| 3 | `npm run dados:finalizar` e `node tools/run.mjs realReputation --copiar` | gera o pacote e copia para o jogo |
| 4 | `npm test` e `npx vitest run --project unit tests/realPackage.test.ts` | confere tudo |
| 5 | `npm run dev` | testa no navegador |
| 6 | commit, pull request, juntar na `main` | publica |

## Se algo der errado

- **A coleta parou no meio:** rode o mesmo comando de novo; ele continua de onde parou.
- **Perdi o `correcoes.json`:** as correções à mão se perdem. Restaure da cópia que você fez antes de começar.
- **Publiquei e achei um erro:** volte o arquivo: `git revert <commit>` e publique de novo. Quem já começou jogo novo com o pacote ruim mantém o save; o próximo jogo novo já vem corrigido.
