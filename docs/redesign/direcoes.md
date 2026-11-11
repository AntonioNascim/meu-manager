# Três direções visuais (etapa 1 do redesenho)

O jogo de referência é escuro, com tabelas densas e verde-limão. As três direções fogem disso em cor, tipo, forma e movimento. Mockups em `docs/redesign/mockups/<direção>/{menu,painel,partida}.html` (abrem no navegador e respondem ao toque; `build.cjs` os gera, `shoot.cjs` tira as capturas de 380 px). Capturas em `.shots/redesign/`.

## A — Figurinha
**Ideia:** o jogo é um álbum de figurinhas: cada tela é uma página, cada cartão é uma figurinha que você cola.
- **Cores:** papel creme com pontinhos, verde-gramado (ação), dourado, vermelho e azul vivos; contorno escuro grosso.
- **Tipografia:** Bowlby One (títulos gordos, levemente inclinados) + Nunito.
- **Formas:** cantos bem redondos, borda dupla tracejada de "recorte", cartões levemente tortos, etiquetas coladas ("JOGO DA RODADA").
- **Ícones:** traço grosso e arredondado; atalhos viram botões coloridos de pastel.
- **Animação:** botões 3D que afundam ao toque, botão principal pulsando, avisos que balançam, barra de baixo em pílula flutuante com a aba ativa "pulando", placar em cartões brancos.
- **Clima:** divertido, acolhedor, colecionável. Combina com o público casual.

## B — Prancheta
**Ideia:** a prancheta tática do técnico de madrugada: linhas finas de neon sobre violeta-noite.
- **Cores:** violeta quase preto com grade, ciano (ação) e magenta (adversário/alerta), lilás de apoio.
- **Tipografia:** Space Grotesk + JetBrains Mono (números, rótulos e relógio em mono).
- **Formas:** vidro fosco com cantos cortados, marca de canto luminosa, nada de cartão arredondado.
- **Ícones:** linha fina com brilho; os jogadores no campo são círculos de contorno (como diagrama tático).
- **Animação:** brilho que varre o botão principal, sublinhado que se desenha na aba, borda pulsando no aviso urgente, anel que se expande no lance.
- **Clima:** analítico e moderno; valoriza o lado tático e os números.

## C — Tabloide
**Ideia:** a capa do jornal esportivo: manchete, tinta preta e marca-texto amarelo.
- **Cores:** papel jornal com retícula, preto, amarelo-marca-texto, vermelho de manchete, azul do mandante.
- **Tipografia:** Anton em caixa alta (manchetes) + Archivo.
- **Formas:** retângulos retos, bordas pretas grossas, sombras duras deslocadas, faixas inclinadas ("ÚLTIMA HORA", "AO VIVO", "URGENTE").
- **Ícones:** traço simples; atalhos como botões de jornal, pendência em losango.
- **Animação:** carimbo que "bate" (o GOL! entra grande e assenta), botão principal que treme de vez em quando, botões que afundam na sombra, notícia do gol com destaque amarelo.
- **Clima:** barulhento e cheio de personalidade, dramatiza cada rodada como notícia.

## Notas
- Nenhuma função foi retirada: os mockups cobrem o que `inventario.md` lista para o menu, o painel e a partida (avisos, próximo jogo com adversário tocável, 10 atalhos, mini tabela, copas, destaques, treino, último jogo, diretoria, orçamento, velocidade, controles, abas Jogos/Dados/Tática/Trocas, lances com "Mostrar faltas", barra de baixo com 5 abas e alertas). Telas fora dos 3 mockups seguem a mesma linguagem e entram na etapa 2.
- Escudos continuam gerados (formas diferentes por time). Fontes dos mockups vêm do Google Fonts; no jogo entrariam por `@fontsource` (PWA offline).
- Todas respeitam `prefers-reduced-motion` (animações param) e alvos de toque de 48 px.
