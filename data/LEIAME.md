# Pacote real

`pacote-real.json` é o pacote de dados reais (clubes, jogadores e ligas) que vai embutido no jogo público. Formato: `docs/formato-pacote.md`.

- É gerado por `npm run dados:planilhas` / `dados:aplicar` / `dados:finalizar` (saída em `dados-reais/planilhas/pacote-real.json`, que continua fora do Git, assim como o cache, as planilhas brutas e o `.env`). Para atualizar este arquivo, copie o pacote final para cá (o campo `name` é "Mundo real 2026"; rode `tests/realPackage.test.ts` para conferir).
- Os créditos da licença (Wikipedia, CC BY-SA 4.0) estão no campo `credits` do próprio arquivo e **devem acompanhar qualquer distribuição**.
- As medições do workflow (`Medições pesadas`, opção `pacote = real`) e as ferramentas de `tools/` (variável `PACOTE_REAL=1`) usam este arquivo.
