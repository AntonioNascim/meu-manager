# Teste fechado do Meu Manager

Documento para **nós** (eu e os sócios) conduzirmos o teste com 50 a 100 amigos. Tem: o texto do convite, o "como testar", o que pedir de relato, como acompanhar uso e custo e o que fazer quando algo dá errado.

**Endereço do jogo (com o modo online liberado):** `https://antonionascim.github.io/meu-manager/?online=1`

O `?online=1` é o que mostra o cartão "Online" no menu; ele fica lembrado no aparelho depois da primeira vez. Sem ele o jogo abre só com a carreira solo.

---

## 1. Texto do convite (para mandar no WhatsApp)

> **Quer testar o meu jogo de técnico de futebol?** ⚽
>
> O **Meu Manager** é um jogo de gerenciamento (parecido com o Brasfoot, mas bem mais profundo): você escolhe um time, monta a escalação, define a tática e vê os jogos em campo. Dá para jogar sozinho ou numa **liga online com amigos**.
>
> É de graça, funciona no navegador do celular (pode instalar como app) e **não precisa de e-mail nem senha**.
>
> 👉 Abra: **https://antonionascim.github.io/meu-manager/?online=1**
>
> Estamos numa fase de teste fechado, então **vai ter erro**, e é isso que eu quero descobrir! Se algo travar ou parecer estranho, use o botão **"Relatar problema"** (no menu e dentro do jogo). Leva 1 minuto.
>
> Obrigado por ajudar! 🙏

*(Se o convidado for menor de 18 anos, veja a nota da seção 6.)*

---

## 2. Como testar (roteiro curto para os convidados)

> **Em 10 minutos:**
> 1. Abra o endereço no celular. Toque em **Novo jogo**, escolha o **mundo real** (ou fictício), um país, uma liga e um clube.
> 2. No painel do clube, toque em **Avançar** até a primeira partida. Veja o jogo em campo, mude a tática e faça uma troca.
> 3. Passe pelas abas **Elenco**, **Mercado** e **Finanças**.
>
> **Para testar o online (30 minutos, com amigos):**
> 1. No menu, **Online › Criar minha conta online**. Marque a faixa de idade (**18 anos ou mais**) e escolha um apelido. (O código de recuperação aparece depois; **guarde-o**.)
> 2. **Ligas online › Criar uma liga**. Escolha **Resultado direto** (mais rápido) ou **Assistir ao vivo**, e convide os amigos pelo **link ou código** de convite.
> 3. Cada um escolhe um clube. Quem criou toca em **Iniciar a liga**.
> 4. Toquem em **Pronto** e o criador em **Avançar**. Experimentem propostas entre vocês no **Mercado**, vender e anunciar jogadores e, numa partida ao vivo, **arrastar jogadores no campo**.
>
> **Se o celular travar, o jogo der erro ou algo parecer injusto ou estranho:** toque em **Relatar problema**, descreva o que você fez e, se puder, anexe um print da tela.

### O que queremos testar (para nós, nesta ordem)

1. **Instalar e abrir** em celulares simples (Android antigo, iPhone com Safari) e offline depois da primeira visita.
2. **Uma temporada inteira** da carreira solo (tempo, travamentos, salvar e carregar).
3. **Liga online de 4 a 20 pessoas**: criar, entrar por convite, Pronto/Avançar, partida ao vivo, lesão (o jogo para até escolher o reserva), mercado entre técnicos.
4. **Virada de temporada** numa liga online.
5. **Trocar de aparelho** com o código de recuperação.
6. **Denúncias** (apelido e liga) e o **painel** (nós).
7. **Custo**: a conta do Cloudflare durante o teste (seção 4).

---

## 3. Relatos de problema: como funcionam

O botão **"Relatar problema"** fica no **menu inicial**, no **painel do clube** e na **sala da liga**. O relato é **anônimo** (não exige conta, não grava IP). Leva: categoria, descrição (até 1.000 caracteres), imagem da tela (opcional, reduzida no aparelho) e as **informações técnicas** que a própria tela mostra antes de enviar (versão do jogo, tela em que estava, navegador e sistema em grandes famílias, tamanho da tela, últimas mensagens de erro etc.), que a pessoa pode desmarcar.

**Como ler:** abrir `https://meu-manager-api.meumanager.workers.dev/admin`, colar o segredo do painel (`ADMIN_TOKEN`) e ver **"Problemas relatados"**. Tocar em **Abrir** mostra o texto, os dados técnicos e a imagem; **Marcar como resolvido** tira da fila; **Apagar** remove. Os relatos somem sozinhos em **90 dias**.

**Como agir sobre um relato:** o campo `screen` diz onde a pessoa estava; `errors` traz as últimas mensagens de erro; `build` é a data da versão (relatos de versões antigas podem já estar corrigidos). Como é anônimo, **não dá para responder**: peça nos convites que a pessoa conte tudo no relato.

---

## 4. Acompanhar uso e custo durante o teste

### 4.1 No painel `/admin` (mesmo endereço e segredo)
A seção **"Uso e custo do teste"** mostra, em tempo real:
- **Ativos em 24 h / 7 dias / 30 dias** (contas que abriram o jogo online; a "última visita" é gravada no máximo 1 vez por hora).
- **Ligas rodando** e **técnicos nelas**.
- **Contas novas, ligas novas e relatos por dia** (últimos 14 dias).
- **Estimativa do mês** (pedidos, GB-s e custo em dólar): calculada pelo modelo da B9 com as ligas e técnicos de agora. **É uma estimativa**, não a conta; serve para ver a tendência.
- **Problemas abertos** e as seções de moderação (denúncias abertas, ligas escondidas, banidos).

### 4.2 No Cloudflare (a conta de verdade)
Entrar em `dash.cloudflare.com` com a conta do projeto:
1. **Faturamento › Uso** (Billing › Usage): o custo do mês até agora e a previsão. Esperado no teste fechado: **o plano de US$ 5**, sem excedente.
2. **Workers e Pages › meu-manager-api › Métricas**: pedidos, erros e tempo de CPU. Erros 5xx acima de ~1% merecem investigação.
3. **Durable Objects**: pedidos e **duração (GB-s)** (o que mais pesa quando as ligas têm gente conectada) e linhas gravadas no SQLite.
4. **D1 › meu-manager** (ou `wrangler d1 info`): linhas lidas/gravadas e tamanho.
5. **R2**: tamanho dos buckets `meu-manager-saves` e `meu-manager-pacotes`.

### 4.3 Alerta de gasto (fazer **antes** de convidar)
**Faturamento › Notificações › Alerta de cobrança baseada em uso**: criar alerta em **US$ 10** e outro em **US$ 20**, com o e-mail de um sócio. Se chegar um alerta, o primeiro passo é abrir o Cloudflare e ver qual produto subiu.

### 4.4 Rotina sugerida
- **Dia 1 e 2:** olhar o painel e o Cloudflare a cada poucas horas (maior risco de erro novo).
- **Depois:** uma vez por dia. Anotar numa planilha: ativos 7 dias, ligas rodando, custo previsto, relatos abertos.
- **Meta do teste:** custo do mês ≤ **US$ 5 a 7**; nenhum erro 5xx recorrente; nenhuma liga travada por mais de um evento; relatos críticos resolvidos em 48 h.
- **No fim:** comparar o custo real com a estimativa do painel e ajustar `src/online/rateLimit.ts` e `tools/loadLeague.ts` (os limites finais só se confirmam aqui).

### 4.5 Se algo der errado
| Sintoma | O que fazer |
|---|---|
| Custo subindo rápido | Ver qual produto no Cloudflare. Se for Durable Objects, listar as ligas rodando (painel) e, se preciso, **fechar** a liga suspeita pelo painel |
| Gente sem conseguir criar conta (erro 429) | O limite por IP de criação de contas é 30 por dia: se muitos convidados usam a mesma rede, subir o valor em `rateLimit.ts` e publicar |
| Apelido ofensivo / liga com nome ruim | Painel: **Trocar apelido** ou **Fechar** a liga; banir se for reincidente |
| Jogo travando para todos | Conferir o último deploy; `wrangler rollback` volta para a versão anterior do Worker |
| Perdi o segredo do painel | Gerar outro e trocar o `ADMIN_TOKEN` no Worker (o painel só abre com ele) |

---

## 5. Antes de convidar (lista para nós)

- [ ] Publicar a versão com o "Relatar problema" e o painel de uso (migração `0004` no D1 remoto + deploy do Worker + site no GitHub Pages).
- [ ] Alerta de gasto em US$ 10 e US$ 20 criado.
- [ ] Testar o botão "Relatar problema" no **celular** (envio com imagem) e abrir o relato no painel.
- [ ] Um sócio testa **criar liga, convidar e jogar uma rodada** com outro aparelho.
- [ ] Confirmar com o revisor a **idade de liberação total** (16 ou 18; ver `docs/lgpd-para-revisor.md`, seção 9.4); no teste, **convidar só maiores de 18**. Na criação da conta o convidado marca "18 anos ou mais".
- [ ] Combinar quem olha o painel em cada dia.

---

## 6. Nota sobre menores de idade no teste fechado

O jogo já tem o **modo protegido** (12 a 15 anos) e pergunta a faixa de idade ao criar a conta online (`docs/lgpd-para-revisor.md`, seção 9.4), mas a idade de liberação total (16 ou 18) ainda **precisa ser confirmada pelo revisor de LGPD**. Por isso, **no teste fechado convide apenas maiores de 18 anos para o modo online**. A carreira solo (sem conta) pode ser testada por qualquer pessoa. Acrescente no convite, se quiser: *"O modo online do teste é só para maiores de 18 anos."*
