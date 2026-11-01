# Testar no celular antes de publicar (o computador como servidor, no mesmo Wi-Fi)

O computador serve o jogo e o celular abre pelo endereço do computador na rede da sua casa. Nada vai para a internet.

**Importante, leia primeiro:** o navegador só deixa **instalar o app** e **usar offline** em endereço seguro (`https://` ou `localhost`). Um endereço como `http://192.168.0.15:4173` **abre e joga normalmente**, mas **não instala nem funciona sem internet**. Então o teste tem duas partes: (A) jogar no celular pelo Wi-Fi, que é simples, e (B) instalar e testar offline, que pede um dos truques da parte B.

---

## Parte A: jogar no celular pelo Wi-Fi

1. **Celular e computador na mesma rede Wi-Fi** (não use os dados móveis no celular; evite rede de visitantes, que costuma isolar os aparelhos).
2. No computador, na pasta do projeto, **gere a versão final e sirva na rede**:
   ```
   npm run build
   npm run preview -- --host --port 4173
   ```
   (Isso é o que vai ser publicado. Para testar mexendo no código, use `npm run dev -- --host`, que é mais lento e traz os atalhos de desenvolvimento.)
3. O terminal mostra algo como `Network: http://192.168.0.15:4173/`. Se não mostrar, descubra o número do computador: abra o PowerShell e rode `ipconfig`; procure **"Adaptador de Rede sem Fio Wi-Fi"** e copie o **"Endereço IPv4"** (começa com 192.168 ou 10.).
4. **Windows pede permissão** na primeira vez ("Firewall do Windows Defender"): marque **Redes particulares** e permita. Se o celular não abrir a página mesmo assim: Configurações › Rede e Internet › Wi-Fi › sua rede › **Tipo de perfil de rede: Particular**.
5. No navegador do celular (Chrome no Android, Safari no iPhone) digite `http://ENDEREÇO-IPV4:4173`, por exemplo `http://192.168.0.15:4173`.
6. Para parar, volte ao terminal e aperte `Ctrl + C`.

**O que conferir no celular:**
- Menu: **Novo jogo** abre no **mundo real**, com "Baixando o mundo real…" na primeira vez (uns 0,8 MB) e depois a lista de clubes por país e divisão. A aba "Mundo fictício" funciona.
- Escolha um clube de nome comprido (Borussia Mönchengladbach, Internacional, Independiente Rivadavia) e olhe: painel, **Elenco**, **Tática**, **Mercado**, **Tabela** (os nomes curtos: Gladbach, Leverkusen, Man United...) e **Partida** (placar, campo e a aba **Jogos** com os outros jogos).
- **Créditos e avisos** no menu inicial.
- Jogue uma partida inteira e **feche e reabra o navegador**: o save automático continua lá (Carregar).
- Sinta a velocidade: o tempo que leva "Montando clubes e jogadores…" no seu aparelho. Se passar de uns 5 segundos num celular simples, avise.

---

## Parte B: instalar como app e testar offline (precisa de HTTPS)

Escolha um jeito:

### B1. Túnel HTTPS temporário (o mais fácil, precisa de internet no computador)
Com o `npm run preview` da parte A rodando, abra **outro** terminal:
```
npx cloudflared tunnel --url http://localhost:4173
```
Ele imprime um endereço `https://alguma-coisa.trycloudflare.com`. Abra esse endereço no celular (pode ser até com dados móveis). Ele vale enquanto o comando estiver rodando. Depois siga o "Passo a passo no celular" de `docs/pwa.md` (instalar, modo avião, versão nova).

### B2. Android com cabo USB (sem túnel)
Ative a **depuração USB** no celular, conecte o cabo, abra `chrome://inspect/#devices` no Chrome do computador, em **Port forwarding** crie `4173 → localhost:4173`, e no Chrome do celular abra `http://localhost:4173` (localhost conta como seguro e instala).

### B3. Android pelo Wi-Fi, liberando o endereço (só para teste)
No Chrome do celular abra `chrome://flags/#unsafely-treat-insecure-origin-as-secure`, ative a opção, escreva `http://192.168.0.15:4173` (o seu endereço) na caixa, toque em **Reiniciar**. Depois abra o endereço normalmente: o Chrome passa a tratá-lo como seguro e dá para instalar. No iPhone não existe esse atalho: use o B1.

**O que conferir na parte B (o ponto novo da Fase 5E):**
1. Abra o app **com internet**, toque em **Novo jogo** e espere o mundo real carregar (isso baixa e guarda o arquivo de 5 MB no aparelho). Comece um jogo.
2. Ative o **modo avião**, feche o app e abra de novo: o menu abre e o save continua lá.
3. Ainda no modo avião, toque em **Novo jogo**: o mundo real deve **abrir sem internet** (porque foi guardado no passo 1). Se mostrar "Falha ao baixar…", o arquivo não ficou guardado: me avise.
4. Teste também o **primeiro Novo jogo já no modo avião**, sem nunca ter aberto o mundo real antes: nesse caso é esperado o aviso de erro, com "Tentar de novo" e o botão do mundo fictício.

---

## Se algo não funcionar

| Problema | O que fazer |
|---|---|
| O celular não abre o endereço | Mesma rede Wi-Fi? Firewall liberado para **Redes particulares**? O IPv4 certo (o do Wi-Fi, não o de VPN ou de máquina virtual)? Rode o comando com `--host`. |
| Abre, mas o jogo não instala | Esperado em `http://` fora de localhost: use a parte B. |
| Página antiga depois de mudar o código | `Ctrl + C`, `npm run build` e `npm run preview -- --host` de novo; no celular, feche a aba e abra outra (ou toque em **Atualizar** na faixa de versão nova). |
| "Montando clubes e jogadores…" demora muito | Anote o modelo do celular e o tempo; é o dado de desempenho que falta medir. |
