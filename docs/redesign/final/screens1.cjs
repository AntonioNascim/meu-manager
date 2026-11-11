// Telas antes do jogo, conta online e ligas online.
const L = require('./lib.cjs')
const { ic, T, crest, crestStar, chip, btn, card, ch, lnk, kv, field, check, sw, radio, sheet, tabs, pills, bar, flag, topbar, stars, avatar, ovr } = L
const S = []
const add = (slug, title, o) => S.push({ slug, title, ...o })

const slotCard = (n, filled, extra = '') => card(`<div class="row"><b class="fd" style="font-size:20px;flex:1">Espaço ${n}</b>${filled ? chip('Na nuvem', 'c', 'cloud') : ''}</div>${filled ? `<div class="row">${crestStar('SER', 44)}<div class="col grow"><b style="font-size:16px">Atlético Serrano</b><span class="mu s13">6º lugar · Série A · Temp. 2026</span><span class="mu s12">Rodada 14 · salvo há 2 min</span></div></div><div class="grid3">${btn('Carregar', 'p', 'play', 'sm')}${btn('Exportar', 'd', 'down2', 'sm')}${btn('Excluir', 'x', 'trash', 'sm')}</div>` : `<div class="empty">Vazio</div>`}${extra}`, filled ? 'acc' : '')
const logo = () => `<div class="logo"><div style="width:74px;height:84px;position:relative">${L.crest({ name: '', ab: '', c1: '#e9b44c', c2: '#a86b1c', style: 'solid' }, 74)}<div style="position:absolute;inset:0;display:grid;place-items:center;padding-top:6px">${ic('gear', 34).replace('currentColor', '#5a3406')}</div></div><h1>Meu Manager</h1><small>Jogo de técnico de futebol</small></div>`

// 1. Menu inicial completo
add('menu-inicial', 'Menu inicial', {
  header: false,
  body: `
  <div class="card warn" style="flex-direction:row;align-items:center;padding:10px 12px"><span class="grow">Versão nova disponível</span>${btn('Atualizar', 'p', null, 'sm')}<button class="xbtn" style="width:38px;height:38px">${ic('x', 18)}</button></div>
  <div class="card" style="flex-direction:row;align-items:center;padding:10px 12px"><span class="grow">Elencos atualizados.</span>${btn('Atualizar', 'o', null, 'sm')}${btn('Agora não', 'ghost', null, 'sm')}</div>
  ${logo()}
  ${card(`<div class="cardhead"><span class="lab">CONTINUAR</span>${ic('clip', 30)}</div><div class="row">${crestStar('SER', 56)}<div class="col grow"><b class="fd" style="font-size:24px">Atlético Serrano</b><span class="mu s13">Júlio César Pontes (Técnico)</span><span class="mu s13">6º lugar · Série A · Temp. 2026</span><span class="mu s12">Rodada 14 · salvo há 2 min</span></div></div><div>${chip('Na nuvem', 'c', 'cloud')}</div>${btn('Continuar história', 'p', 'play', 'block up pulse')}`, 'gld')}
  <div class="grid2">${btn('Novo jogo', 'd', 'plus', 'block')}${btn('Carregar', 'd', 'folder', 'block')}</div>
  ${btn('Novo jogo com pacote de dados', 'o', 'down2', 'block')}
  <div class="grid2">${btn('Editor', 'd', 'edit', 'block')}${btn('Importar save', 'd', 'up2', 'block')}</div>
  <div class="grid2">${btn('Créditos e avisos', 'd', 'info', 'block')}${btn('Relatar problema', 'd', 'flag', 'block')}</div>
  <div class="warnstrip row"><span class="grow s13">Guarde o seu código de recuperação: sem ele, trocar de aparelho faz perder a conta.</span><button class="btn o sm">${ic('eye', 18)}Ver</button></div>
  ${card(`<div class="ch">${ic('globe', 22)}<h3>Online</h3>${chip('Conta ativa', 'g')}</div><div class="row"><div class="col grow"><b>VascainhoFC</b><span class="mu s12">conta criada em 02/11/2026</span></div></div>${btn('Ligas online', 'p', 'trophy', 'block')}<div class="grid2">${btn('Saves na nuvem (2 de 3)', 'd', 'cloud', 'block sm')}${btn('Código de recuperação', 'd', 'key', 'block sm')}</div>${btn('Dados e conta', 'ghost', 'user', 'block')}`)}
  `,
})
// 2. Primeiro acesso
add('menu-primeiro-acesso', 'Menu inicial, primeiro acesso', {
  header: false,
  body: `
  <div class="card" style="flex-direction:row;align-items:center;padding:10px 12px">${ic('down2', 22)}<span class="grow s13">Instale o jogo no celular e jogue sem internet.</span>${btn('Instalar', 'o', null, 'sm')}<button class="xbtn" style="width:38px;height:38px">${ic('x', 18)}</button></div>
  ${logo()}
  ${card(`<h3>Comece sua carreira</h3><p class="mu s13">Escolha um clube, monte o time e leve o Meu Manager ao título.</p>${btn('Novo jogo', 'p', 'plus', 'block up pulse')}`, 'gld')}
  <div class="grid2">${btn('Carregar', 'd', 'folder', 'block dis')}${btn('Importar save', 'd', 'up2', 'block')}</div>
  ${btn('Novo jogo com pacote de dados', 'o', 'down2', 'block')}
  <div class="grid2">${btn('Editor', 'd', 'edit', 'block')}${btn('Créditos e avisos', 'd', 'info', 'block')}</div>
  ${btn('Relatar problema', 'd', 'flag', 'block')}
  ${card(`<div class="ch">${ic('globe', 22)}<h3>Online</h3></div><p class="mu s13">Crie ligas com amigos ou entre em ligas abertas e dispute contra técnicos de verdade. Tudo grátis.</p>${btn('Criar minha conta online', 'p', 'user', 'block')}${btn('Já tem uma conta? Entrar com o código de recuperação', 'ghost', 'key', 'block')}`)}
  <div class="card bad" style="flex-direction:row;align-items:center">${ic('alert', 20)}<span class="s13 grow">Não consegui importar o arquivo: ele não é um save do Meu Manager.</span></div>
  `,
})
add('carregar', 'Carregar', { header: false, body: `${topbar('Carregar')}${slotCard(1, true)}${slotCard(2, true)}${slotCard(3, false)}${btn('Importar save de um arquivo', 'o', 'up2', 'block')}` })
add('carregar-importar', 'Importar save: escolher espaço', {
  header: false,
  body: `${topbar('Carregar')}${slotCard(1, true)}${slotCard(2, true)}${slotCard(3, false)}${btn('Importar save de um arquivo', 'o', 'up2', 'block')}`,
  over: sheet('Em qual espaço guardar o save importado?', `<div class="note">meu-manager-atletico-serrano-2026.json</div>${radio('Espaço 1', false, 'Atlético Serrano · Temp. 2026 (será substituído)')}${radio('Espaço 2', false, 'Imperial FC · Temp. 2027 (será substituído)')}${radio('Espaço 3', true, 'Vazio')}${btn('Importar para o espaço 3', 'p', null, 'block')}${btn('Cancelar', 'ghost', null, 'block')}`),
})

const teamRow = (k, ovrv, sel, sub) => `<div class="li ${sel ? 'sel-card' : ''}" style="${sel ? 'border-radius:10px;padding:6px 8px;border-bottom:0' : ''}">${crest(k, 38)}<div class="t"><b>${T[k].name}</b><small>${sub}</small></div><span class="num">${ovrv}</span>${sel ? ic('check', 20, 'style="color:var(--g)"') : ''}</div>`
add('novo-jogo', 'Novo jogo', {
  header: false,
  body: `${topbar('Novo jogo')}${tabs(['Mundo real', 'Mundo fictício'], 0)}
  <div class="note row">Elencos: <b>2026.11</b> ${chip('baixado', 'g', 'check')}</div>
  <div class="grid2">${field('País', `Brasil ${ic('down', 18)}`)}${field('Liga', `Série A ${ic('down', 18)}`)}</div>
  ${card(`<div class="ch">${ic('shield', 22)}<h3>Escolha o clube</h3></div><div class="note">Toque em um time para escolher. A força é a média dos titulares.</div><div class="list">${teamRow('SER', 77, true, 'Belo Horizonte · reputação 17')}${teamRow('RCA', 79, false, 'Rio de Janeiro · reputação 18')}${teamRow('VPA', 78, false, 'São Paulo · reputação 17')}${teamRow('RCE', 74, false, 'Belo Horizonte · reputação 15')}${teamRow('TGA', 73, false, 'Porto Alegre · reputação 15')}${teamRow('LDM', 70, false, 'Fortaleza · reputação 12')}</div>`)}
  ${card(`<h3>Espaço de save</h3>${radio('Espaço 3', true, 'Vazio')}${radio('Espaço 2', false, 'Imperial FC (será substituído)')}`)}
  ${btn('Começar', 'p', 'play', 'block up pulse')}`,
})
add('novo-jogo-ficticio', 'Novo jogo: mundo fictício e erro de download', {
  header: false,
  body: `${topbar('Novo jogo')}${tabs(['Mundo real', 'Mundo fictício'], 1)}
  <div class="card bad">${ic('alert', 20)}<b>Não foi possível baixar os elencos.</b><span class="mu s13">Verifique a internet e tente de novo, ou comece com o mundo fictício.</span>${btn('Tentar de novo', 'o', 'redo', 'block')}</div>
  <div class="card"><div class="ch">${ic('down2', 22)}<h3>Baixando os elencos…</h3></div>${bar(46)}<span class="note">Só na primeira vez. Depois o jogo abre sem internet.</span></div>
  ${card(`<div class="ch">${ic('shield', 22)}<h3>Escolha o clube</h3></div><div class="list">${teamRow('IMP', 66, false, 'Série A · fictício')}${teamRow('POA', 64, false, 'Série A · fictício')}${teamRow('ENO', 52, false, 'Série B · fictício')}</div>`)}
  ${btn('Começar', 'p', 'play', 'block dis')}`,
})
add('pacote-dados', 'Novo jogo com pacote de dados', {
  header: false,
  body: `${topbar('Pacote de dados')}${btn('Escolher arquivo', 'p', 'folder', 'block')}
  ${card(`<div class="ch">${ic('doc', 22)}<h3>Pacotes guardados neste navegador</h3></div><div class="list"><div class="li"><div class="t"><b>Mundo real 2026</b><small>21 ligas · 370 clubes</small></div>${btn('Usar', 'o', null, 'xs')}${btn('Apagar', 'x', null, 'xs')}</div><div class="li"><div class="t"><b>Minha liga de várzea</b><small>1 liga · 20 clubes</small></div>${btn('Usar', 'o', null, 'xs')}${btn('Apagar', 'x', null, 'xs')}</div></div>`)}
  ${card(`<div class="ch">${ic('check', 22)}<h3>Pacote válido</h3></div>${kv('Países', '3')}${kv('Ligas', '5')}${kv('Clubes', '78')}${kv('Jogadores', '1.940')}<div class="note">Créditos: elencos da Wikipedia (CC BY-SA) e Wikidata (CC0).</div>${btn('Escolher o time', 'p', 'chev', 'block')}`, 'glow')}
  <div class="card bad">${ic('alert', 20)}<b>Este pacote não pode ser usado.</b><div class="note">3 problemas: clube “Vila Nova” com 12 jogadores (mínimo 18) · liga “Série B” com 19 clubes em vez de 20 · cor inválida em “Porto Azul”.</div></div>`,
})
add('editor-escolha', 'Editor de pacotes', {
  header: false,
  body: `${topbar('Editor')}<p class="mu s13">Monte ou ajuste um mundo de futebol: ligas, clubes, jogadores e copas.</p>
  ${['Pacote em branco', 'Mundo fictício padrão', 'Teste de 15 ligas', 'Teste de 21 ligas'].map((t, i) => `<button class="card acc row" style="min-height:64px">${ic(['plus', 'globe', 'grid', 'grid'][i], 24)}<div class="col grow"><b style="font-size:16px">${t}</b><span class="mu s12">${['Começa do zero', '2 divisões · 40 clubes', '282 clubes', '358 clubes'][i]}</span></div>${ic('chev', 18, 'style="color:var(--g)"')}</button>`).join('')}
  ${card(`<h3>Guardados neste navegador</h3><div class="li"><div class="t"><b>Minha liga de várzea</b><small>editado há 1 h</small></div>${ic('chev', 18, 'style="color:var(--g)"')}</div>`)}
  ${btn('Importar um pacote', 'o', 'up2', 'block')}`,
})
add('editor-clubes', 'Editor: clubes', {
  header: false,
  body: `<div class="row"><button class="back xbtn" style="width:auto;padding:0 12px">${ic('left', 18)}</button><h2 class="pt sm grow">Minha liga de várzea</h2><span class="chip g">${ic('check', 12)}gravado</span></div>
  <div class="row">${btn('Desfazer', 'd', 'undo', 'sm grow')}${btn('Refazer', 'd', 'redo', 'sm grow dis')}</div>
  ${tabs(['Pacote', 'Ligas', 'Clubes', 'Jogadores', 'Copas', 'Planilhas', 'Problemas (2)'], 2, 'scroll')}
  ${field('Buscar clube', `${ic('search', 18)} Buscar por nome ou sigla`, true)}
  ${card(`<div class="row"><b class="grow">Clubes · 20</b>${btn('Novo clube', 'o', 'plus', 'xs')}</div><div class="list">${['SER', 'IMP', 'RCA', 'VPA'].map((k) => `<div class="li">${crest(k, 36)}<div class="t"><b>${T[k].name}</b><small>${T[k].ab} · 26 jogadores · reputação 14</small></div>${ic('chev', 18, 'style="color:var(--g)"')}</div>`).join('')}</div>`)}
  ${card(`<h3>Atlético Serrano</h3>${field('Nome', 'Atlético Serrano')}${field('Nome curto', 'Atlético-SE')}<div class="grid2">${field('Sigla', 'ASE')}${field('Reputação (1 a 20)', '17')}</div><div class="grid2">${field('Cor 1', '<span class="kit" style="background:#f4f4f4"></span> #F4F4F4')}${field('Cor 2', '<span class="kit" style="background:#111;border:1px solid #444"></span> #111111')}</div>${field('Estádio', 'Arena da Serra')}${field('Capacidade', '46.000')}${btn('Excluir clube', 'x', 'trash', 'block sm')}`)}`,
})
add('editor-jogador', 'Editor: jogador', {
  header: false,
  body: `<div class="row"><button class="back xbtn" style="width:auto;padding:0 12px">${ic('left', 18)}</button><h2 class="pt sm grow">Minha liga de várzea</h2></div>
  ${tabs(['Pacote', 'Ligas', 'Clubes', 'Jogadores', 'Copas', 'Planilhas', 'Problemas (2)'], 3, 'scroll')}
  ${card(`<div class="row">${avatar(1, 56)}<div class="col grow"><h3>Hugo Valadares</h3><span class="mu s13">Atlético Serrano · ATA</span></div>${ovr(88, true)}</div><div class="row">${chip('gerado', 'y')}${chip('data estimada', 'y')}</div>
  ${field('Nome', 'Hugo Valadares')}${field('Apelido', 'Valadares')}<div class="grid2">${field('Nascimento', '14/07/1993')}${field('Nacionalidade', `${flag('BR')} Brasil`)}</div><div class="grid2">${field('Posição principal', 'ATA')}${field('Pé', 'Direito')}</div>
  ${check('Data de nascimento estimada', true)}${check('Atributos gerados automaticamente', true)}
  <h4>Atributos (1 a 100)</h4>${[['Finalização', 91], ['Velocidade', 76], ['Drible', 82], ['Cabeceio', 84], ['Passe', 70]].map(([n, v]) => `<div class="attr"><span>${n}</span>${bar(v)}<b>${v}</b></div>`).join('')}${btn('Sugerir atributos pelo que o jogo geraria', 'o', 'sliders', 'block sm')}`)}`,
})
add('editor-planilhas', 'Editor: planilhas e problemas', {
  header: false,
  body: `<div class="row"><button class="back xbtn" style="width:auto;padding:0 12px">${ic('left', 18)}</button><h2 class="pt sm grow">Minha liga de várzea</h2></div>
  ${tabs(['Pacote', 'Ligas', 'Clubes', 'Jogadores', 'Copas', 'Planilhas', 'Problemas (2)'], 5, 'scroll')}
  ${card(`<h3>Planilhas (CSV)</h3><div class="grid2">${btn('Exportar jogadores', 'd', 'down2', 'sm')}${btn('Exportar clubes', 'd', 'down2', 'sm')}${btn('Importar jogadores', 'o', 'up2', 'sm')}${btn('Importar clubes', 'o', 'up2', 'sm')}</div><div class="card bad" style="padding:10px"><b>2 erros na planilha</b><span class="s13">Linha 14, coluna “nascimento”: data inválida.</span><span class="s13">Linha 31, coluna “posição”: valor desconhecido “XYZ”.</span></div>`)}
  <h4>Aba “Problemas (2)”</h4>
  ${card(`<h3>Problemas (2)</h3><div class="list"><div class="li">${ic('alert', 20, 'style="color:var(--red)"')}<div class="t"><b>Elenco fora de 18 a 30</b><small>Vila Nova · 12 jogadores</small></div>${lnk('Ir')}</div><div class="li">${ic('alert', 20, 'style="color:var(--amb)"')}<div class="t"><b>Clube sem goleiro</b><small>Porto Azul</small></div>${lnk('Ir')}</div></div>${btn('Jogar com este pacote', 'p', 'play', 'block')}`)}`,
})
add('creditos', 'Créditos e avisos', {
  header: false,
  body: `${topbar('Créditos e avisos')}
  ${card(`<div class="ch">${ic('shield', 22)}<h3>Jogo independente</h3></div><p class="s13 mu">O Meu Manager não tem ligação com clubes, federações, ligas ou jogadores. Os escudos são gerados com as cores do clube.</p>`, 'acc')}
  ${card(`<div class="ch">${ic('globe', 22)}<h3>Dados do mundo real</h3></div>${kv('Elencos', 'Wikipedia · CC BY-SA')}${kv('Dados dos jogadores e clubes', 'Wikidata · CC0')}${kv('Fama', 'Visualizações da Wikimedia')}`)}
  ${card(`<div class="ch">${ic('news', 22)}<h3>Fontes</h3></div>${kv('Títulos', 'Barlow Condensed')}${kv('Texto', 'Inter')}`)}
  ${card(`<h3>Artigos consultados</h3><p class="note">Lista de todos os artigos usados. O arquivo é baixado só quando você pede.</p>${btn('Baixar lista de artigos', 'o', 'down2', 'block')}<div class="card bad" style="padding:10px"><span class="s13">Não foi possível baixar o arquivo. Tente de novo.</span></div>`)}`,
})
add('relatar-problema', 'Relatar problema', {
  header: false,
  body: `${topbar('Meu Manager')}<div class="empty">Tela por trás</div>`,
  over: sheet('Relatar problema', `<div class="field"><label>O que aconteceu?</label><div class="area">Descreva o que você estava fazendo e o que deu errado…</div></div><div class="row"><div style="width:72px;height:52px;border-radius:8px;background:linear-gradient(135deg,#17331f,#0a1a10);display:grid;place-items:center">${ic('doc', 22)}</div><div class="col grow"><b class="s13">Imagem da tela anexada</b><span class="note">Pode conter o que aparece no jogo.</span></div>${btn('Tirar a imagem', 'ghost', null, 'xs')}</div>${check('Estou numa liga online: incluir o identificador da liga', false)}${btn('Ver o que será enviado', 'd', 'eye', 'block')}${btn('Enviar', 'p', 'send', 'block')}<span class="note tc">Anônimo: não pedimos nome nem e-mail.</span>`),
})

// ---- conta online ----
add('criar-conta', 'Criar conta online', {
  header: false,
  body: `${topbar('Criar conta')}
  ${card(`<h3>Sua faixa de idade</h3>${radio('Menos de 12 anos', false, 'Ainda não dá para criar conta online')}${radio('12 a 15 anos', false, 'Modo protegido')}${radio('16 a 17 anos', false)}${radio('18 anos ou mais', true)}`)}
  ${card(`<div class="ch">${ic('shield', 22)}<h3>Modo protegido</h3></div><p class="note">De 12 a 15 anos o apelido é gerado e fixo, e só dá para jogar em ligas de amigos, por convite.</p>`, 'acc')}
  ${field('Apelido (3 a 16 caracteres)', 'VascainhoFC', false, true)}<div class="note">Letras, números e espaço. Sem links, telefones ou palavrões.</div>
  ${card(`<div class="row">${ic('check', 22, 'style="color:var(--g)"')}<b class="grow">Verificação anti-robô</b><span class="chip g">ok</span></div>`)}
  <div class="note">Ao criar a conta você aceita o <u>aviso de privacidade</u>.</div>
  ${btn('Criar', 'p', 'user', 'block')}${btn('Cancelar', 'ghost', null, 'block')}`,
})
add('entrar-codigo', 'Entrar com o código', {
  header: false,
  body: `${topbar('Entrar')}<p class="mu s13">Cole o código de recuperação da sua conta para continuar neste aparelho.</p>
  ${field('Código de recuperação', 'K7QP-9X2M-HT4R-8WZC-3NFB', false, true)}
  ${card(`<h3>O que acontece</h3><div class="note">Este aparelho passa a ser o da sua conta. Seus saves da nuvem ficam disponíveis para baixar. O código não é enviado ao servidor.</div>`, 'acc')}
  ${card(`<div class="row">${ic('check', 22, 'style="color:var(--g)"')}<b class="grow">Verificação anti-robô</b><span class="chip g">ok</span></div>`)}
  ${btn('Entrar', 'p', 'key', 'block')}${btn('Cancelar', 'ghost', null, 'block')}`,
})
add('codigo-recuperacao', 'Código de recuperação', {
  header: false,
  body: `${topbar('Código de recuperação')}
  <div class="card warn">${ic('alert', 22)}<b>Guarde este código em um lugar seguro.</b><span class="s13">É a única forma de recuperar sua conta e seus saves da nuvem em outro aparelho. Ninguém, nem nós, consegue refazê-lo.</span></div>
  ${card(`<div class="tc"><div class="fd" style="font-size:34px;letter-spacing:.06em;line-height:1.3">K7QP-9X2M<br>HT4R-8WZC<br>3NFB</div><div class="note">Some da tela em <b class="g">24 s</b></div></div>${btn('Esconder agora', 'd', 'eye', 'block')}<div class="grid2">${btn('Copiar', 'o', 'copy', 'sm')}${btn('Baixar arquivo', 'o', 'down2', 'sm')}</div>`, 'gld')}
  <div class="card" style="align-items:center;text-align:center"><div class="inp" style="width:100%;justify-content:center;font:700 22px var(--fd);letter-spacing:.15em">••••-••••-••••-••••-••••</div>${btn('Mostrar o código', 'o', 'eye', 'block')}<span class="note">Estado inicial, com o código escondido até o toque.</span></div>
  ${btn('Já guardei', 'p', 'check', 'block')}${btn('Voltar', 'ghost', null, 'block')}`,
})
const cloudSlot = (n, st) => card(`<div class="row"><b class="fd grow" style="font-size:20px">Espaço ${n}</b>${st === 'off' ? chip('Desligado', 'm') : st === 'on' ? chip('Sincronizado', 'c', 'cloud') : chip('Conflito', 'y', 'alert')}</div>${st === 'off' ? `<span class="mu s13">Imperial FC · Temp. 2027</span>${btn('Ligar e enviar agora', 'p', 'up2', 'block')}${btn('Agora não', 'ghost', null, 'block')}` : `<span class="mu s13">Atlético Serrano · Temp. 2026 · enviado há 3 min · 1,8 MB</span><div class="grid2">${btn('Enviar agora', 'o', 'up2', 'sm')}${btn('Baixar para este aparelho', 'd', 'down2', 'sm')}</div><button class="btn ghost sm">Desligar este espaço</button>`}`, st === 'on' ? 'acc' : '')
add('saves-nuvem', 'Saves na nuvem', {
  header: false,
  body: `${topbar('Saves na nuvem')}${cloudSlot(1, 'on')}${cloudSlot(2, 'off')}${card(`<div class="empty">Espaço 3 · vazio</div>`)}
  ${card(`<h3>Como funciona</h3>${kv('O que sobe', 'o save do espaço')}${kv('Quando', 'a cada 2 min, se mudou')}${kv('Limite', '5 MB por espaço')}${kv('Cópias', 'de 7 dias')}<div class="note">Para sair da nuvem, desligue o espaço ou apague sua conta.</div>`)}
  <div class="card warn" style="flex-direction:row;align-items:center">${ic('alert', 20)}<span class="s13">Sem conexão: as mudanças sobem quando a internet voltar.</span></div>`,
})
add('saves-nuvem-conflito', 'Saves na nuvem: conflito', {
  header: false,
  body: `${topbar('Saves na nuvem')}
  <div class="card warn">${ic('alert', 22)}<h3>Este espaço foi jogado em dois aparelhos</h3><span class="s13">Escolha qual versão manter. A outra fica guardada por 7 dias.</span></div>
  ${card(`<h4>Neste aparelho</h4><span class="s13">Atlético Serrano · Rodada 16 · hoje 21:10</span>${btn('Manter esta e enviar para a nuvem', 'p', 'up2', 'block')}`, 'acc')}
  ${card(`<h4>Na nuvem</h4><span class="s13">Atlético Serrano · Rodada 15 · ontem 22:40</span>${btn('Usar a da nuvem neste aparelho', 'd', 'down2', 'block')}`)}`,
})
add('dados-conta', 'Dados e conta', {
  header: false,
  body: `${topbar('Dados e conta')}
  ${card(`<h3>Apelido</h3>${field('Apelido', 'VascainhoFC')}${btn('Salvar apelido', 'o', 'check', 'block')}`)}
  ${card(`<div class="list"><button class="li" style="width:100%">${ic('key', 22, 'style="color:var(--g)"')}<div class="t"><b>Ver o código de recuperação</b></div>${ic('chev', 18)}</button><button class="li" style="width:100%">${ic('shield', 22, 'style="color:var(--g)"')}<div class="t"><b>Ler o aviso de privacidade</b></div>${ic('chev', 18)}</button><button class="li" style="width:100%">${ic('down2', 22, 'style="color:var(--g)"')}<div class="t"><b>Baixar meus dados</b></div>${ic('chev', 18)}</button></div>`)}
  ${btn('Apagar minha conta…', 'x', 'trash', 'block')}`,
})
add('apagar-conta', 'Apagar a conta', {
  header: false,
  body: `${topbar('Dados e conta')}${card(`<h3>Apelido</h3>${field('Apelido', 'VascainhoFC')}`)}`,
  over: `<div class="scrim"></div><div class="modal"><div class="row">${ic('alert', 26, 'style="color:var(--red)"')}<h3>Apagar minha conta?</h3></div><div class="note">Isso é definitivo. O que acontece:</div><div class="s13 col" style="gap:6px"><span>• sua identidade e o apelido são apagados;</span><span>• os saves na nuvem são apagados do servidor;</span><span>• suas denúncias e relatos são apagados;</span><span>• os saves deste aparelho continuam com você.</span></div>${btn('Apagar minha conta', 'x', 'trash', 'block')}${btn('Cancelar', 'd', null, 'block')}</div>`,
})
add('privacidade', 'Aviso de privacidade', {
  header: false,
  body: `${topbar('Privacidade')}<p class="mu s13">Versão 3 · em linguagem simples.</p>${['O que guardamos', 'O que não guardamos', 'Denúncias e moderação', 'Relatar problema', 'Sem internet', 'Código de recuperação', 'Quem vê o quê', 'Por quanto tempo', 'Seus direitos', 'Servidores e verificação anti-robô', 'Crianças e adolescentes', 'Mudanças neste aviso'].map((t, i) => card(`<div class="row"><b class="g fd" style="font-size:22px">${i + 1}</b><h3 class="grow">${t}</h3>${ic(i === 0 ? 'up' : 'down', 18)}</div>${i === 0 ? '<p class="s13 mu">Apelido, a faixa de idade, a chave pública da sua conta e os saves que você mandar para a nuvem. Nada de e-mail, telefone ou data de nascimento.</p>' : ''}`)).join('')}${btn('Voltar', 'd', 'left', 'block')}`,
})

// ---- ligas online ----
const leagueCard = (name, st, tech, sub, k) => card(`<div class="row">${crest(k, 40)}<div class="col grow"><b style="font-size:16px">${name}</b><span class="mu s12">${sub}</span></div>${st}</div><div class="row s12 mu">${ic('users', 16)} ${tech} técnicos</div>`, 'acc')
add('ligas-hub', 'Ligas online', {
  header: false,
  body: `${topbar('Ligas online')}
  <div class="card acc" style="flex-direction:row;align-items:center">${ic('shield', 22)}<span class="s13 grow">Modo protegido: só ligas de amigos, por convite.</span></div>
  ${btn('Criar uma liga', 'p', 'plus', 'block')}${btn('Procurar ligas abertas', 'd', 'search', 'block')}${btn('Entrar com um código de convite', 'd', 'key', 'block')}
  <h4>Minhas ligas</h4>
  ${leagueCard('Liga dos Amigos', chip('Sua vez', 'y'), 8, 'Mundo real · Brasileirão · ritmo 3 dias', 'SER')}
  ${leagueCard('Copa do Bairro', chip('Pausada', 'm'), 12, 'Mundo fictício · ritmo 7 dias', 'IMP')}
  ${leagueCard('Aberta Brasil #12', chip('No saguão', 'g'), 14, 'Mundo real · ritmo 2 dias', 'RCA')}`,
})
add('criar-liga', 'Criar liga', {
  header: false,
  body: `${topbar('Criar liga')}
  ${field('Nome da liga', 'Liga dos Amigos', false, true)}
  <div class="field"><label>Quem pode entrar</label><div class="grid2">${radio('Só amigos', true, 'Convite por link ou código')}${radio('Aberta', false, 'Qualquer pessoa')}</div></div>
  <div class="field"><label>Mundo</label>${tabs(['Mundo real', 'Mundo fictício'], 0)}</div>
  <div class="field"><label>Máximo de técnicos</label><div class="row"><button class="xbtn">−</button><b class="fd grow tc" style="font-size:30px">8</b><button class="xbtn">+</button></div></div>
  <div class="field"><label>Ritmo</label>${pills(['Calmo · 14 dias', 'Normal · 7', 'Rápido · 3', 'Muito rápido · 2'], 2)}</div>
  <div class="field"><label>Horário dos jogos (Brasília)</label>${pills(['Manhã', 'Tarde', 'Noite'], 2)}</div>
  <div class="field"><label>Partidas</label><div class="grid2">${radio('Assistir ao vivo', true)}${radio('Resultado direto', false)}</div></div>
  ${btn('Criar liga', 'p', 'check', 'block')}`,
})
add('ligas-abertas', 'Ligas abertas', {
  header: false,
  body: `${topbar('Ligas abertas')}${leagueCard('Aberta Brasil #12', chip('6 vagas', 'g'), 14, 'Mundo real · ritmo 2 dias', 'RCA')}${leagueCard('Libertadores BR', chip('2 vagas', 'y'), 18, 'Mundo real · ritmo 3 dias', 'VPA')}${leagueCard('Só os brabos', chip('1 vaga', 'y'), 19, 'Mundo fictício · ritmo 7 dias', 'ENO')}${btn('Ver mais', 'd', 'down', 'block')}<div class="empty">Quando não houver liga aberta, aparece aqui “Nenhuma liga aberta agora”.</div>`,
})
add('entrar-convite', 'Entrar com código de convite', { header: false, body: `${topbar('Código de convite')}<p class="mu s13">Peça o código ao criador da liga, ou abra o link de convite.</p>${field('Código', 'HX4K-72PQ', false, true)}${btn('Entrar', 'p', 'key', 'block')}<div class="card acc"><b>Liga dos Amigos</b><span class="mu s13">8 técnicos · 2 vagas · Mundo real</span></div>` })
add('escolher-clube', 'Escolher clube na liga', {
  header: false,
  body: `${topbar('Escolha seu clube')}${field('Buscar', `${ic('search', 18)} clube, sigla ou cidade`, true)}${pills(['Todas as ligas', 'Série A', 'Série B', 'Premier League', 'La Liga'], 1)}
  ${card(`<div class="list">${['RCE', 'TGA', 'LDM', 'ENO', 'VVA'].map((k, i) => `<div class="li">${crest(k, 38)}<div class="t"><b>${T[k].name}</b><small>Série A · ${['Belo Horizonte', 'Porto Alegre', 'Fortaleza', 'Belém', 'Salvador'][i]}</small></div><span class="num">${74 - i * 2}</span></div>`).join('')}<div class="li" style="opacity:.45">${crest('VPA', 38)}<div class="t"><b>Verde Paulista</b><small>Já escolhido por Rafa10</small></div></div></div>`)}
  ${btn('Escolher outro', 'ghost', null, 'block')}`,
})
add('sala-liga', 'Sala da liga (saguão)', {
  header: false,
  body: `${topbar('Liga dos Amigos', 'Ligas')}
  ${card(`<h4>Convite</h4><div class="row"><b class="fd grow" style="font-size:30px;letter-spacing:.08em">HX4K-72PQ</b></div><div class="grid2">${btn('Copiar', 'o', 'copy', 'sm')}${btn('Compartilhar', 'o', 'share', 'sm')}</div>${btn('Trocar o código de convite', 'ghost', 'redo', 'block sm')}`, 'gld')}
  ${card(`<div class="ch">${ic('users', 22)}<h3>Técnicos e clubes · 5 de 8</h3></div><div class="list">${[['VascainhoFC', 'SER', 'ADM'], ['Rafa10', 'VPA', ''], ['Dona Zica', 'RCE', ''], ['Pedrão', 'TGA', ''], ['Léo', null, '']].map(([n, k, a]) => `<div class="li">${k ? crest(k, 34) : `<div style="width:34px;height:38px;border-radius:8px;border:1.5px dashed var(--mu2)"></div>`}<div class="t"><b>${n} ${a ? chip('ADM', 'gd', 'crown') : ''}</b><small>${k ? T[k].name : 'Ainda sem clube'}</small></div>${n === 'VascainhoFC' ? '' : `<button class="btn ghost xs">${a ? 'Passar ADM' : 'Remover'}</button><button class="xbtn" style="width:36px;height:36px">${ic('flag', 16)}</button>`}</div>`).join('')}</div>`)}
  ${card(`<h4>Seu clube</h4><div class="row">${crestStar('SER', 44)}<b class="grow">Atlético Serrano</b>${btn('Escolher meu clube', 'o', null, 'xs')}</div><div class="note">Clube reservado para outro técnico: código de vaga <b>HX4K-72PQ-9B2Z</b> (válido por 72 h)</div>`)}
  ${btn('Iniciar a liga', 'p', 'play', 'block up pulse')}
  <div class="grid2">${btn('Sair da liga', 'x', 'left', 'sm')}${btn('Denunciar esta liga', 'd', 'flag', 'sm')}</div>${btn('Relatar problema', 'ghost', 'flag', 'block sm')}
  <div class="empty">Estados: “Liga não encontrada” · “Entrada fechada”</div>`,
})
add('sala-andamento', 'Sala da liga em andamento', {
  header: false,
  body: `${topbar('Liga dos Amigos', 'Ligas')}
  ${card(`<div class="cardhead"><span class="lab">Próxima rodada</span><span class="chip y">${ic('clock', 12)} Sáb 21:00</span></div><div class="score" style="padding-top:6px"><div class="tm">${crestStar('SER', 52)}Atlético-SE</div><div class="fd" style="font-size:34px">X</div><div class="tm">${crest('RCA', 52)}Rubro</div></div><div class="tc s13 mu">Rodada 15 · Brasileirão Série A · sua hora (fuso do aparelho)</div>${btn('Pronto', 'p', 'check', 'block up pulse')}<div class="note tc">Prazo para a sala abrir: 18 min · todos precisam dar Pronto</div>`, 'glow')}
  ${card(`<h4>Quem está pronto</h4><div class="list">${[['VascainhoFC', 'ok'], ['Rafa10', 'ok'], ['Dona Zica', 'falta'], ['Pedrão', 'sem jogo'], ['Léo', 'saindo']].map(([n, s]) => `<div class="li"><div class="t"><b>${n}</b></div>${chip(s === 'ok' ? 'Pronto' : s === 'falta' ? 'Falta' : s === 'sem jogo' ? 'Sem jogo' : 'Saindo', s === 'ok' ? 'g' : s === 'falta' ? 'y' : 'm')}</div>`).join('')}</div>`)}
  ${card(`<h4>Calendário</h4>${kv('Sáb 17 out · 21:00', 'Rodada 15')}${kv('Qua 21 out · 21:30', 'Libertadores · quartas')}${kv('Sáb 24 out · 21:00', 'Rodada 16')}`)}
  ${card(`<h4>Últimas transferências e acontecimentos</h4><div class="list"><div class="li"><div class="t"><b>Rafa10 contratou Paulo Ferrão</b><small>R$ 12 mi · ontem</small></div></div><div class="li"><div class="t"><b>Pedrão foi demitido do Tricolor</b><small>há 2 dias</small></div></div></div>`)}
  ${card(`<div class="ch">${ic('crown', 22)}<h3>Controles do ADM</h3></div><div class="grid2">${btn('Avançar', 'o', 'ffwd', 'sm')}${btn('Pausar', 'd', 'pause', 'sm')}</div>${sw('Entrada de técnicos aberta', true)}<div class="field"><label>Ritmo</label>${pills(['14 dias', '7', '3', '2'], 2)}</div><div class="card warn" style="padding:10px"><b class="s13">Sugestão de ausência</b><span class="s13">Dona Zica não responde há 6 dias. Passar o clube ao piloto automático?</span><div class="grid2">${btn('Sim', 'o', null, 'xs')}${btn('Ignorar', 'ghost', null, 'xs')}</div></div><div class="card" style="padding:10px"><b class="s13">Avançar até o próximo jogo?</b><div class="grid2">${btn('Confirmar', 'p', null, 'xs')}${btn('Cancelar', 'ghost', null, 'xs')}</div></div>`)}
  ${btn('Sala da liga', 'ghost', null, 'block')}`,
})
add('painel-adm', 'Painel do ADM', {
  header: false,
  body: `${topbar('Painel do ADM', 'Voltar')}
  ${card(`<h4>Informações</h4>${kv('Código', 'HX4K-72PQ')}${kv('Ritmo', 'a cada 3 dias')}${kv('Temporada', '2026')}${kv('Data do mundo', '17 Out 2026')}${kv('Seu clube', 'Atlético Serrano')}`)}
  ${card(`<h4>Tempo</h4>${btn('Avançar até o próximo jogo', 'p', 'ffwd', 'block')}${btn('Pausar a liga', 'd', 'pause', 'block')}${btn('Mudar o ritmo', 'd', 'clock', 'block')}`)}
  ${card(`<h4>Código de vaga</h4><p class="note">Reserva um clube por 72 h para quem você convidar, mesmo com a entrada fechada.</p>${btn('Escolher um clube e gerar o código', 'o', 'key', 'block')}${btn('Cancelar código', 'ghost', null, 'block sm')}`)}
  ${card(`<h4>Entrada de técnicos novos</h4>${sw('Entrada aberta', true, 'Quem tem o código pode entrar')}`)}
  ${card(`<h4>Técnicos</h4><div class="list">${['Rafa10', 'Dona Zica', 'Pedrão'].map((n, i) => `<div class="li"><div class="t"><b>${n}</b><small>última vez: ${['agora', 'há 6 dias', 'há 2 h'][i]}</small></div>${btn('Passar o cargo', 'd', null, 'xs')}${btn('Remover', 'x', null, 'xs')}</div>`).join('')}</div><div class="card" style="padding:10px"><b class="s13">Remover Dona Zica?</b><div class="grid2">${btn('Confirmar', 'x', null, 'xs')}${btn('Cancelar', 'ghost', null, 'xs')}</div></div>`)}
  ${btn('Voltar', 'ghost', 'left', 'block')}`,
})
add('denuncia', 'Denúncia', {
  header: false,
  body: `${topbar('Sala da liga')}<div class="empty">Tela por trás</div>`,
  over: sheet('Denunciar', `<div class="note">Denunciar o apelido “Dona Zica”.</div>${radio('Ofensivo', true)}${radio('Finge ser outra pessoa ou o jogo', false)}${radio('Propaganda ou lixo', false)}${radio('Outro motivo', false)}${btn('Enviar denúncia', 'p', 'send', 'block')}${btn('Fechar', 'ghost', null, 'block')}`),
})
add('liga-demitido', 'Demitido na liga', {
  header: false,
  body: `<div class="card bad" style="align-items:center;text-align:center;margin-top:24px">${ic('alert', 34)}<h2 class="pt">Você foi demitido</h2><span class="s13">A diretoria do Atlético Serrano encerrou seu contrato. O clube volta para a IA, mas a vaga de técnico continua sua.</span></div>
  ${card(`<h3>Escolha outro clube</h3><div class="note">Só clubes livres, de reputação igual ou menor.</div><div class="list">${['LDM', 'ENO', 'VVA'].map((k) => `<div class="li">${crest(k, 36)}<div class="t"><b>${T[k].name}</b><small>reputação 12</small></div>${btn('Assumir', 'o', null, 'xs')}</div>`).join('')}</div>`)}
  <div class="empty">Ou: “Nenhum clube livre agora. Volte mais tarde.”</div>${btn('Voltar ao menu', 'd', 'left', 'block')}`,
})

const bodyOf = (slug) => S.find((x) => x.slug === slug).body
const patch = (slug, from) => { const s = S.find((x) => x.slug === slug); s.body = bodyOf(from) }
patch('relatar-problema', 'menu-primeiro-acesso'); patch('apagar-conta', 'dados-conta'); patch('denuncia', 'sala-liga')
module.exports = S
