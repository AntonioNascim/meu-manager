# Instalar e testar o Meu Manager como app (PWA)

O jogo é um PWA: tem manifesto (`public/manifest.webmanifest`), ícones (`public/icons`, gerados por
`node tools/makeIcons.mjs`) e um service worker (`sw.js`, gerado no build por `tools/pwaPlugin.ts`) que guarda o
app inteiro para abrir **sem internet**. O save fica no IndexedDB do aparelho, então o jogo todo funciona offline.

O service worker só é registrado na versão de produção (`npm run build`), nunca no `npm run dev`.

## Regra do navegador: precisa de HTTPS

Instalar e usar service worker exigem endereço seguro: `https://...` ou `http://localhost`. Um endereço
`http://192.168.x.x` (celular na mesma rede Wi-Fi) **não** instala nem fica offline. Três jeitos de testar no celular:

### 1. Publicar a pasta `dist` num hospedeiro estático com HTTPS (o mais simples)
`npm run build` e envie a pasta `dist` para GitHub Pages, Netlify, Cloudflare Pages ou Vercel. Os caminhos são
relativos, então funciona em qualquer subpasta (ex.: `https://usuario.github.io/meumanager/`).

### 2. Túnel HTTPS para o seu computador (teste rápido, sem publicar)
```
npm run build
npm run preview -- --host          # serve a pasta dist em http://localhost:4173
npx cloudflared tunnel --url http://localhost:4173    # imprime um endereço https://....trycloudflare.com
```
Abra o endereço `https://` no celular. (`ngrok http 4173` faz o mesmo.)

### 3. Android com cabo USB (sem internet no túnel)
Ative a depuração USB no celular, abra `chrome://inspect/#devices` no Chrome do computador, em "Port forwarding" crie
`4173 → localhost:4173`, rode `npm run preview` e abra `http://localhost:4173` no Chrome do celular (localhost conta
como seguro).

## Passo a passo no celular

**Android (Chrome)**
1. Abra o endereço e espere uns segundos: aparece a faixa verde "Instale o Meu Manager..." com o botão **Instalar**
   (ou use menu ⋮ → *Instalar app* / *Adicionar à tela inicial*).
2. O ícone verde com "M" aparece na tela inicial; ao abrir, o jogo ocupa a tela toda, sem barra do navegador.
3. Teste offline: abra o app uma vez com internet, ative o **modo avião**, feche o app e abra de novo. O menu e o
   jogo devem abrir normalmente e o save continua lá.

**iPhone / iPad (Safari)**
1. Abra o endereço no **Safari** (não funciona no Chrome do iPhone).
2. Toque em **Compartilhar** (quadrado com seta) → **Adicionar à Tela de Início**. A faixa do jogo mostra essa dica.
3. Abra pelo ícone novo e repita o teste do modo avião.
4. Atenção: o iOS pode apagar os dados de sites/apps que ficam semanas sem uso. Faça de vez em quando
   **Exportar** (menu Carregar) para ter um backup em arquivo.

**Versão nova**: depois de publicar uma versão nova, abra o app com internet. A faixa **"Há uma versão nova do
jogo"** aparece; toque em **Atualizar** (o jogo é salvo antes e a página recarrega). A versão nova nunca troca sozinha
no meio de uma partida.

## Testar no computador (Chrome/Edge)
```
npm run build
npm run preview          # http://localhost:4173
```
Abra o endereço, depois DevTools (F12) → aba **Application**:
- **Manifest**: nome, ícones e "Installable" sem erros.
- **Service Workers**: `sw.js` "activated and is running". Marque **Offline** e recarregue (F5): o jogo ainda abre.
- **Storage → IndexedDB → meu-manager**: tabelas `slots` e `games` com os saves.
- O ícone de instalar aparece na barra de endereço.

## Para quem mexe no código
- Mudou arquivo do `public/` ou do app? O build refaz a lista do service worker e muda o nome do cache sozinho.
- Mudou o formato do save? Aumente `SAVE_VERSION` e escreva a migração (ver `src/store/saveFormat.ts`).
