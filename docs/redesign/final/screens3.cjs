// Partida, mercado, competições e finanças.
const L = require('./lib.cjs')
const { ic, T, crest, crestStar, chip, btn, card, ch, lnk, kv, field, check, sw, radio, sheet, tabs, pills, bar, flag, stars, avatar, ovr, pos, mood, cond, rdots, SQUAD, pitch3d, pitchFlat, XIP } = L
const S = []
const add = (slug, title, o) => S.push({ slug, title, ...o })
const chv = ic('chev', 18, 'style="color:var(--g)"')

// ---------- PARTIDA ----------
const scoreBoard = ({ sc = '1 - 0', mn = "34'", speed = '2x', online, label } = {}) => `<section class="card flat glow"><div class="stadium" style="padding:12px 10px 10px"><div class="row between" style="margin-bottom:4px"><span class="chip c">${ic('trophy', 12)} ${label || 'Brasileirão · Rodada 15'}</span>${online ? '<span class="live">AO VIVO</span>' : ''}<button class="speed">${ic('ffwd', 16)}<span>${speed}</span></button></div><div class="score"><div class="tm">${crestStar('SER', 50)}Atlético-SE</div><div class="col" style="align-items:center"><b class="sc">${sc}</b><span class="mn">${mn}</span></div><div class="tm">${crest('RCA', 50)}Rubro</div></div></div></section>`
const mtabs = (on) => tabs(['Jogos', 'Dados', 'Tática', 'Trocas'], on)
const events = () => card(`<div class="ch">${ic('whistle', 22)}<h3>Lances</h3><span class="s12 mu">Mostrar faltas</span><span class="sw" style="width:38px;height:22px"></span></div><div>${[["34'", 'Escanteio para o Atlético-SE. Lemos cobra na área.', ''], ["31'", 'GOL! Valadares cabeceia no ângulo após cruzamento de Pimenta.', 'goal'], ["27'", 'Cartão amarelo para Baldassi.', 'y'], ["22'", 'Defesa de Heitor em chute de longe.', ''], ["15'", 'Rubro tenta o contra-ataque, mas Reveres corta.', '']].map(([m, t, c]) => `<div class="ev ${c}"><span class="m">${m}</span><span>${t}</span></div>`).join('')}</div>`)
const controls = (a) => `<div class="grid2">${a.map(([t, c, i]) => btn(t, c, i, 'sm')).join('')}</div>`
add('partida-antes', 'Partida: antes de começar', {
  nav: 'home', body: `${scoreBoard({ sc: '0 - 0', mn: '21:00', speed: '1x' })}
  ${card(`<div class="row between"><span class="s13">Brasileirão Série A · Rodada 15</span><span class="s13 mu">${ic('stad', 14)} Arena da Serra</span></div><div class="s13 mu">Sáb 17 Out 2026 · 21:00</div>${btn('Ajustar tática e escalação', 'd', 'target', 'block sm')}`)}
  ${card(`<h4>Caminho na copa</h4><div class="seg"><i class="on"></i><i class="on"></i><i></i><i></i></div><div class="note">Jogo de ida: vence quem somar mais gols nos dois jogos.</div>`)}
  ${pitchFlat({ ball: [.5, .5], H: 200 })}
  ${controls([['Começar', 'p', 'play'], ['Ir ao fim', 'd', 'ffwd']])}${mtabs(0)}`,
})
add('partida-ao-vivo', 'Partida ao vivo: campo 2D', {
  nav: 'home', body: `${scoreBoard()}${controls([['Pausar', 'o', 'pause'], ['Ir ao fim', 'd', 'ffwd']])}
  ${pitchFlat({ ball: [.7, .4], arrow: 'M240 90 Q270 60 300 86', H: 230 })}
  ${mtabs(0)}
  ${card(`<div class="ch">${ic('news', 22)}<h3>Outros jogos</h3></div><div class="list">${[['VPA', 'TGA', '1 - 0', "34'"], ['RCE', 'LDM', '0 - 0', "34'"], ['VVA', 'POA', '2 - 1', "34'"]].map(([a, b, s, m]) => `<div class="li" style="min-height:44px"><span class="row grow" style="gap:6px;font-size:12.5px">${crest(a, 22)}${T[a].short}</span><b class="fd" style="font-size:19px">${s}</b><span class="row grow" style="gap:6px;font-size:12.5px;justify-content:flex-end">${T[b].short}${crest(b, 22)}</span></div>`).join('')}</div>`)}
  ${events()}`,
})
add('partida-gol', 'Partida: gol em câmera lenta', {
  nav: 'home', body: `${scoreBoard({ sc: '1 - 0', mn: "31'", speed: '4x' })}${controls([['Pausar', 'o', 'pause'], ['Ir ao fim', 'd', 'ffwd']])}${pitchFlat({ ball: [.97, .5], mark: [.82, .5, 'GOL!'], arrow: 'M270 70 Q330 40 360 108', H: 230 })}${events()}`,
})
add('partida-dados', 'Partida: dados', {
  nav: 'home', body: `${scoreBoard()}${controls([['Pausar', 'o', 'pause'], ['Ir ao fim', 'd', 'ffwd']])}${mtabs(1)}
  ${card(`<div class="ch">${ic('chart', 22)}<h3>Estatísticas</h3></div>${[['Posse', '58%', '42%', 58], ['Finalizações', 7, 4, 64], ['No alvo', 3, 1, 75], ['Escanteios', 4, 2, 66], ['Faltas', 5, 8, 38], ['Cartões', 1, 0, 100], ['xG', '1,12', '0,48', 70]].map(([l, a, b, p]) => `<div class="statrow"><span class="lbl">${l}</span><b>${a}</b><div class="bb"><i style="width:${p}%;background:var(--g)"></i><i style="width:${100 - p}%;background:#c33"></i></div><b>${b}</b></div>`).join('')}`)}`,
})
add('partida-tatica', 'Partida: tática', {
  nav: 'home', body: `${scoreBoard()}${controls([['Continuar', 'p', 'play'], ['Ir ao fim', 'd', 'ffwd']])}${mtabs(2)}
  <div class="card acc" style="padding:10px"><span class="s13">Pause o jogo para mexer na tática. A formação só muda com 11 em campo.</span></div>
  ${card(`<h4>Estilo</h4><div class="pills" style="flex-wrap:wrap">${['Toque de bola', 'Contra-ataque', 'Pressão total', 'Lançamento direto', 'Jogar pelas pontas'].map((t, i) => `<button class="${i === 2 ? 'on' : ''}">${t}</button>`).join('')}</div><h4>Mentalidade</h4>${bar(80)}<div class="row between s12 mu"><span>Defensiva</span><b class="g">Ofensiva</b><span>Muito ofensiva</span></div><h4>Formação</h4>${pills(['4-3-3', '4-4-2', '3-5-2', 'Livre'], 0)}`)}
  ${card(`<div class="ch">${ic('target', 22)}<h3>Posição dos jogadores</h3></div>${pitch3d({ xi: XIP, grid: true, H: 300 })}`)}`,
})
add('partida-trocas', 'Partida: trocas', {
  nav: 'home', body: `${scoreBoard({ sc: '1 - 0', mn: "62'" })}${controls([['Continuar', 'p', 'play'], ['Ir ao fim', 'd', 'ffwd']])}${mtabs(3)}
  ${card(`<div class="row between"><b>Substituições restantes</b><b class="g fd" style="font-size:22px">3 de 5</b></div><div class="row between s13 mu"><span>Paradas além do intervalo</span><b>2 de 3</b></div>`)}
  ${pitch3d({ xi: XIP.map((p, i) => ({ ...p, cn: [96, 70, 88, 60, 82, 55, 74, 90, 85, 78, 92][i] })), sel: 5, hideCond: false, H: 330 })}
  <div class="note tc">Toque em quem sai e depois em quem entra.</div>
  ${card(`<h4>Banco</h4><div class="list">${['Orlando Cunha', 'Tiago Neves', 'Wesley Aguiar', 'Zeca Andrade'].map((n, i) => `<div class="li">${pos(['VOL', 'MC', 'PE', 'ATA'][i])}<div class="t"><b>${n}</b><small>condição 100%</small></div>${ovr([70, 74, 75, 68][i])}${btn('Entra', 'o', null, 'xs')}</div>`).join('')}</div><div class="card warn" style="padding:8px 10px"><span class="s13">Baldassi está cansado (55%). Considere trocá-lo.</span></div>`)}`,
})
add('partida-lesao', 'Partida: lesão no seu time', {
  nav: 'home', body: `${scoreBoard({ sc: '1 - 0', mn: "44'" })}
  <div class="card bad">${ic('med', 24)}<b>Reveres se machucou e saiu de campo.</b><span class="s13">Escolha quem entra no lugar dele. O jogo está parado.</span></div>
  ${mtabs(3)}${card(`<h4>Reservas para a zaga</h4><div class="list">${[['Davi Rocha', 'ZAG', 64], ['Gabriel Sarmento', 'ZAG', 72], ['Orlando Cunha', 'VOL', 70]].map(([n, p, o]) => `<div class="li">${pos(p)}<div class="t"><b>${n}</b><small>${p === 'ZAG' ? 'posição natural' : 'improvisado: penalidade'}</small></div>${ovr(o)}${btn('Entra', 'p', null, 'xs')}</div>`).join('')}</div>${btn('Seguir com um a menos', 'x', null, 'block')}<div class="note tc">Sem trocas ou paradas sobrando, o time fica com 10.</div>`)}`,
})
add('partida-intervalo', 'Partida: intervalo', {
  nav: 'home', body: `${scoreBoard({ sc: '1 - 1', mn: 'Intervalo' })}${controls([['Começar o 2º tempo', 'p', 'play'], ['Ir ao fim', 'd', 'ffwd']])}${pitchFlat({ ball: [.5, .5], H: 190, pause: true })}${mtabs(2)}
  ${card(`<h4>Ajuste para o 2º tempo</h4><div class="pills">${['Toque de bola', 'Contra-ataque', 'Pressão total'].map((t, i) => `<button class="${i === 1 ? 'on' : ''}">${t}</button>`).join('')}</div>${btn('Fazer trocas', 'd', 'swap', 'block')}`)}`,
})
add('partida-prorrogacao', 'Partida: antes da prorrogação', { nav: 'home', body: `${scoreBoard({ sc: '2 - 2', mn: '90′', label: 'Copa · Quartas · volta' })}<div class="card warn"><b>Empate no agregado.</b><span class="s13">Vai para a prorrogação e, se preciso, pênaltis.</span></div>${btn('Começar a prorrogação', 'p', 'play', 'block')}${btn('Ir ao fim', 'd', 'ffwd', 'block')}` })
add('partida-fim', 'Partida: fim de jogo', {
  nav: 'home', body: `${scoreBoard({ sc: '2 - 1', mn: 'Fim de jogo' })}
  ${card(`<div class="tc"><h2 class="pt g" style="font-size:34px">VITÓRIA!</h2><span class="s13 mu">Valadares 31' · Ferrão 67' / Rubro 78'</span></div><div class="grid3">${[['Posse', '56%'], ['Finalizações', '14 - 8'], ['xG', '2,1 - 0,9']].map(([k, v]) => `<div class="col tc" style="align-items:center"><b class="fd" style="font-size:20px">${v}</b><span class="s12 mu">${k}</span></div>`).join('')}</div>`, 'glow')}
  ${btn('Concluir partida', 'p', 'check', 'block up')}<div class="note tc">Na liga online o botão é “Voltar ao painel”.</div>`,
})
add('partida-adversario', 'Adversário (toque no escudo)', {
  nav: 'home', body: `<div class="row"><button class="xbtn" style="width:auto;padding:0 12px">${ic('left', 18)}</button><b class="grow">Voltar</b></div>
  ${card(`<div class="row">${crest('RCA', 64)}<div class="col grow"><h2 class="pt">Rubro Carioca</h2><span class="mu s13">2º lugar · 60 pts · força 79</span><div>${rdots('WWWDL')}</div></div></div>`, 'glow')}
  ${card(`<h4>Tática</h4>${kv('Formação', '4-2-3-1')}${kv('Estilo', 'Contra-ataque')}${kv('Mentalidade', 'Ofensiva (agora)')}<div class="note">Escalação provável (o que a IA montaria hoje):</div>${pitch3d({ xi: XIP.map((p, i) => ({ ...p, n: ['Fábio Neto', 'Wallace', 'Gil Matos', 'Ruan', 'Thiago', 'Arão', 'Pedrinho', 'Éverton', 'Bruno H.', 'Gabi', 'Lucas P.'][i] })), kit: 'RCA', H: 300 })}`)}
  ${card(`<h4>Próximo jogo</h4>${kv('Rodada 16', 'Verde Paulista (fora)')}`)}`,
})
add('partida-online-intervalo', 'Partida online: intervalo', {
  nav: 'home', body: `${scoreBoard({ sc: '1 - 1', mn: 'Intervalo', online: true, speed: '2x' })}
  <div class="card acc"><b>O intervalo dura até 1 minuto.</b><span class="s13">Acaba antes quando todos os técnicos do jogo tocarem em Voltar ao jogo. Velocidade do jogo: a mais lenta entre os técnicos.</span><div class="seg"><i class="on"></i><i class="on"></i><i class="on"></i><i></i></div><span class="note">Rafa10 já voltou · aguardando você</span></div>
  ${btn('Voltar ao jogo', 'p', 'play', 'block up pulse')}${mtabs(2)}${events()}`,
})
add('partida-online-espera', 'Partida online: sala e avisos', {
  nav: 'home', offline: true, body: `
  ${card(`<div class="cardhead"><span class="lab">Sala aberta</span><span class="chip y">${ic('clock', 12)} 12 min</span></div><div class="score" style="padding-top:6px"><div class="tm">${crestStar('SER', 50)}Atlético-SE</div><b class="fd" style="font-size:32px">X</b><div class="tm">${crest('RCA', 50)}Rubro</div></div><div class="s13 tc mu">A partida começa quando todos derem Pronto, ou no prazo (a IA joga por quem faltar).</div>${btn('Pronto', 'p', 'check', 'block')}<div class="tc note">Dona Zica ainda não deu Pronto</div>`, 'glow')}
  <div class="card"><div class="row">${ic('stad', 22)}<div class="col grow"><b>Seu clube não joga agora</b><span class="s13 mu">A rodada está em andamento.</span></div></div>${btn('Ir ao painel', 'd', null, 'block sm')}</div>
  <div class="card bad"><span class="s13">Não consegui conectar à partida. Tentando de novo…</span>${btn('Tentar de novo', 'o', 'redo', 'block sm')}</div>
  <div class="card warn"><span class="s13">Jogada rejeitada: a troca não é permitida agora.</span></div>`,
})

// ---------- MERCADO ----------
const mTabs = (on) => tabs(['Buscar', 'Favoritos', 'Listas', 'Livres', 'Pré-contrato', 'Propostas', 'Histórico', 'Contratos', 'Técnicos'], on, 'scroll')
const mHead = () => `<div class="hl" style="gap:10px;align-items:center">${ic('swap', 30)}<h2 class="pt grow">Transferências</h2></div><div class="card" style="padding:10px 12px"><div class="row between"><span class="s13 mu">Orçamento de compras</span><b class="fd g" style="font-size:20px">R$ 6.200.000</b></div><div class="row between"><span class="s13 mu">Elenco</span><b>26 / 30</b></div><div class="row" style="margin-top:4px">${chip('Janela de transferências aberta · fecha em 18 dias', 'g', 'check')}</div></div>`
const target = (p, i, sub, right) => `<div class="li" style="min-height:64px"><b class="fd mu" style="width:16px">${i}</b>${avatar(p.i, 44)}<div class="t"><b>${p.name}</b><small>${p.p}, ${p.age} anos${sub ? ' · ' + sub : ''}</small></div>${right}${chv}</div>`
const buyers = [['Vinícius Prado','PE',26,'Real Norte',1],['Vitor Ramalho','CA',21,'Real Planalto',3],['Léo Dutra','ZAG',29,'Porto Azul',5],['Ícaro Veiga','ATA',22,'Verde Paulista',2],['Nico Salvatierra','MC',24,'Leão do Mar',4]].map(([name,p,age,c,i])=>({name,p,age,i,o:72+i}))
add('mercado-buscar', 'Mercado: buscar', {
  nav: 'market', alerts: ['market'],
  body: `${mHead()}${mTabs(0)}
  <div class="row"><div class="inp grow">${ic('search', 18)} Nome, apelido ou clube</div><button class="btn o" style="min-width:48px;padding:0 12px">${ic('filter', 22)}</button></div>
  ${pills(['Cabem no bolso', 'Barganhas', 'Jovens promessas', 'Contrato acabando'], 0)}
  <div class="row s13"><span class="mu">Ordenar:</span><b>Força</b>${ic('down', 16)}<span class="grow"></span><span class="mu">128 jogadores</span></div>
  ${card(`<div class="list">${[['Vitor Ramalho', 'CA', 21, 'Real Planalto', 'Médio', 'R$ 16.000.000', 'y', 3], ['Léo Dutra', 'ZAG', 29, 'Porto Azul', 'Alto', 'R$ 4.500.000', 'g', 5], ['Nico Salvatierra', 'MC', 24, 'Leão do Mar', 'Alto', 'R$ 9.800.000', 'g', 1], ['Ícaro Veiga', 'ATA', 22, 'Verde Paulista', 'Baixo', 'R$ 22.000.000', 'r', 2]].map(([n, p, a, c, i, v, col, k]) => `<div class="li" style="min-height:66px">${avatar(k, 44)}<div class="t"><b>${n}</b><small>${p} · ${a} anos · ${c}</small><small class="${col === 'g' ? 'g' : col === 'y' ? 'amb' : 'red'}">Interesse: ${i}</small></div><span class="col" style="align-items:flex-end"><b class="fd" style="font-size:18px">${v}</b>${ovr(70 + k)}</span></div>`).join('')}</div>`)}`,
})
add('mercado-filtros', 'Mercado: filtros', {
  nav: 'market', body: `${mHead()}${mTabs(0)}<div class="empty">Lista por trás</div>`,
  over: sheet('Filtros', `<div class="field"><label>País ou série</label>${pills(['Todas', 'Série A', 'Série B', 'Europa'], 1)}</div><div class="field"><label>Posição</label>${pills(['Todas', 'GOL', 'ZAG', 'LAT', 'VOL', 'MEI', 'ATA'], 0)}</div><div class="field"><label>Situação</label>${pills(['Todas', 'Contratado', 'Livre', 'À venda', 'Emprestável'], 0)}</div>${[['Força', '60 a 90'], ['Idade', '18 a 30'], ['Valor', 'R$ 0 a 20 mi'], ['Salário', 'até R$ 600 mil']].map(([k, v]) => `<div class="field"><div class="row between"><label>${k}</label><b class="s13 g">${v}</b></div><div class="rng"><i style="left:25%;right:20%"></i><b style="left:25%"></b><b style="left:80%"></b></div></div>`).join('')}<div class="grid2">${btn('Limpar', 'd')}${btn('Ver 37 jogadores', 'p')}</div>`),
})
add('mercado-negociacao', 'Mercado: negociação', {
  nav: 'market', body: `${mHead()}${mTabs(0)}<div class="empty">Lista por trás</div>`,
  over: sheet('Negociação', `<div class="row">${avatar(3, 56)}<div class="col grow"><b style="font-size:18px">Vitor Ramalho</b><span class="mu s13">CA · 21 anos · Real Planalto</span></div><button class="xbtn">${ic('star', 20, 'style="color:var(--gold)"')}</button>${ovr(76, true)}</div>${kv('Valor de mercado', 'R$ 16.000.000')}${kv('Interesse do jogador', '<span class="amb">Médio</span>')}${kv('Salário atual', 'R$ 280 mil')}${kv('Salário mínimo que aceitaria', 'R$ 360 mil')}${tabs(['Compra', 'Empréstimo'], 0)}<div class="grid2">${field('Valor', 'R$ 16.500.000')}${field('Salário mensal', 'R$ 380.000')}</div>${field('Duração', '4 anos')}${btn('Enviar proposta', 'p', 'send', 'block')}`),
})
add('mercado-favoritos', 'Mercado: favoritos (lista de alvos)', {
  nav: 'market', body: `${mHead()}${mTabs(1)}
  ${card(`<div class="cardhead"><span class="lab">Alvo principal</span><span class="s13 mu">Grande negociação</span></div><div class="row">${avatar(3, 60)}<div class="col grow"><b style="font-size:18px">Vitor Ramalho</b><span class="s12 mu">CA · Real Planalto</span></div>${ovr(76, true)}</div><div class="row">${ic('mail', 20, 'style="color:var(--g)"')}<b class="g grow">Proposta enviada</b><span class="g b">Interesse: Médio</span></div>${bar(55)}<div class="grid2"><div class="col"><span class="s12 mu">Valor de mercado</span><b class="fd" style="font-size:20px">R$ 16.000.000</b></div><div class="col"><span class="s12 mu">Salário</span><b class="fd" style="font-size:20px">R$ 380.000/mês</b></div></div><div class="grid2">${btn('Negociar contrato', 'p', null, 'sm')}${btn('Alterar proposta', 'o', null, 'sm')}</div>`, 'glow')}
  ${card(`<div class="ch">${ic('star', 22)}<h3>Favoritos</h3></div><div class="list">${buyers.slice(0, 3).map((p, i) => target(p, i + 1, i === 0 ? 'Contratado' : 'Livre', `<span class="col" style="align-items:flex-end"><span class="s12 ${i ? 'g' : 'red'}">Interesse: ${i ? 'Alto' : 'Baixo'}</span><b class="fd">R$ ${[95, 16, 4.5][i]} mi</b></span>`)).join('')}</div>`)}`,
})
add('mercado-listas', 'Mercado: listas', {
  nav: 'market', body: `${mHead()}${mTabs(2)}${tabs(['Transferência', 'Empréstimo', 'Meus'], 2)}
  ${card(`<div class="note">Os jogadores que você anuncia recebem propostas da IA pelo preço pedido.</div><div class="list">${[['Wesley Aguiar', 'R$ 14 mi', 'à venda'], ['Vítor Salgado', 'R$ 800 mil', 'à venda'], ['Nando Bastos', 'R$ 3 mi/ano', 'empréstimo']].map(([n, v, s], i) => `<div class="li">${avatar(i, 40)}<div class="t"><b>${n}</b><small>${s}</small></div><b class="fd">${v}</b>${btn('Remover', 'x', null, 'xs')}</div>`).join('')}</div>${btn('Anunciar jogador', 'o', 'plus', 'block')}`)}
  ${card(`<h4>Anúncios de outros clubes</h4><div class="list">${[['Hélio Dias', 'ZAG', 'Porto Azul', 'R$ 7 mi'], ['Ramon Lessa', 'MC', 'Vitória do Vale', 'R$ 3,2 mi']].map(([n, p, c, v], i) => `<div class="li">${avatar(i + 2, 40)}<div class="t"><b>${n}</b><small>${p} · ${c}</small></div><b class="fd">${v}</b>${btn('Negociar', 'o', null, 'xs')}</div>`).join('')}</div>`)}`,
})
add('mercado-livres', 'Mercado: livres', {
  nav: 'market', body: `${mHead()}${mTabs(3)}${card(`<div class="note">Jogadores sem clube: contratação na hora, sem taxa de transferência.</div><div class="list">${buyers.slice(0, 4).map((p, i) => target(p, i + 1, 'Livre', `<span class="col" style="align-items:flex-end"><span class="s12 g">Interesse: Alto</span>${ovr(p.o)}</span>`)).join('')}</div>`)}`,
})
add('mercado-precontrato', 'Mercado: pré-contrato', {
  nav: 'market', body: `${mHead()}${mTabs(4)}<div class="card acc"><span class="s13">A partir de 1º de julho, quem está no último ano de contrato pode chegar de graça na virada da temporada.</span></div>${card(`<div class="list">${buyers.slice(0, 3).map((p, i) => `<div class="li" style="min-height:64px">${avatar(p.i, 42)}<div class="t"><b>${p.name}</b><small>${p.p} · ${p.age} anos · até dez/26</small><small class="g">Grátis · R$ ${[310, 220, 180][i]} mil · 3 anos</small></div>${btn('Pré-contrato', 'o', null, 'xs')}</div>`).join('')}</div>`)}`,
})
add('mercado-propostas', 'Mercado: propostas', {
  nav: 'market', alerts: ['market'], body: `${mHead()}${mTabs(5)}${tabs(['Recebidas (2)', 'Enviadas (1)'], 0)}
  ${card(`<div class="ch">${ic('mail', 22)}<h3>Recebidas</h3></div><div class="list">${[['Paulo Ferrão', 'Rubro Carioca', 'R$ 52 mi', 'RCA'], ['Marcelo Pimenta', 'Verde Paulista', 'R$ 19 mi', 'VPA']].map(([n, c, v, k]) => `<div class="li" style="flex-wrap:wrap">${crest(k, 36)}<div class="t"><b>${n}</b><small>${c} oferece</small></div><b class="fd g" style="font-size:20px">${v}</b><div class="grid2" style="width:100%;padding-top:6px">${btn('Aceitar', 'p', null, 'xs')}${btn('Recusar', 'x', null, 'xs')}</div></div>`).join('')}</div>`)}
  ${card(`<div class="ch">${ic('send', 22)}<h3>Enviadas</h3></div><div class="li">${avatar(3, 40)}<div class="t"><b>Vitor Ramalho</b><small>R$ 16,5 mi · aguardando resposta</small></div>${chip('Em análise', 'y')}</div>`)}`,
})
add('mercado-historico', 'Mercado: histórico', {
  nav: 'market', body: `${mHead()}${mTabs(6)}${tabs(['Minhas', 'Do campeonato'], 0)}${card(`<div class="list">${[['Júnior Sobral', 'compra', 'Atlético-SE', 'R$ 48,5 mi'], ['Ronei Matos', 'venda', 'Santos', 'R$ 12 mi'], ['Carlos Lima', 'livre', 'Atlético-SE', 'grátis'], ['Dudu Reis', 'empréstimo', 'Imperial', 'R$ 1,2 mi']].map(([n, t, c, v], i) => `<div class="li">${avatar(i, 40)}<div class="t"><b>${n}</b><small>${t} · ${c} · 12 Out</small></div><b class="fd ${t === 'venda' ? 'g' : ''}" style="font-size:18px">${v}</b></div>`).join('')}</div>`)}`,
})
add('mercado-contratos', 'Mercado: contratos', {
  nav: 'market', alerts: ['market'], body: `${mHead()}${mTabs(7)}<div class="card warn"><span class="s13">4 contratos terminam este ano. Renove antes que eles saiam de graça.</span></div>${card(`<div class="list">${[['Mateus Reveres', 'dez/26', '210 mil'], ['Jonas Pacheco', 'dez/26', '60 mil'], ['Gabriel Sarmento', 'dez/26', '95 mil']].map(([n, d, s], i) => `<div class="li" style="flex-wrap:wrap">${avatar(i + 1, 40)}<div class="t"><b>${n}</b><small>até ${d} · ${s}</small></div><div class="row" style="gap:6px"><button class="xbtn" style="width:36px;height:36px">−</button><b class="fd">+2 anos</b><button class="xbtn" style="width:36px;height:36px">+</button></div><div style="width:100%;padding-top:4px">${btn('Propor renovação', 'o', null, 'block xs')}</div></div>`).join('')}</div>`)}${btn('Voltar', 'ghost', 'left', 'block')}`,
})
add('mercado-tecnicos', 'Mercado: técnicos (online)', {
  nav: 'market', body: `${mHead()}${mTabs(8)}${tabs(['Técnicos', 'Propostas', 'Histórico'], 0)}
  <div class="card acc"><span class="s13">Negócios entre técnicos reservam a taxa na hora. Preço de 60% a 250% do valor de mercado. Prazo de 48 h.</span></div>
  ${card(`<div class="list">${[['Rafa10', 'VPA', 'Verde Paulista'], ['Dona Zica', 'RCE', 'Raposa Celeste'], ['Pedrão', 'TGA', 'Tricolor Gaúcho']].map(([n, k, c]) => `<div class="li" style="flex-wrap:wrap">${crest(k, 36)}<div class="t"><b>${n}</b><small>${c}</small></div>${btn('Ver elenco', 'd', null, 'xs')}<div class="grid2" style="width:100%;padding-top:6px">${btn('Comprar', 'o', null, 'xs')}${btn('Emprestar', 'o', null, 'xs')}</div></div>`).join('')}</div>`)}
  ${card(`<h4>Propostas (exemplo)</h4><div class="li" style="flex-wrap:wrap">${avatar(2, 40)}<div class="t"><b>Rômulo Saldanha</b><small>Rafa10 oferece R$ 14 mi · prazo 31 h</small></div><div class="grid2" style="width:100%;padding-top:6px;grid-template-columns:repeat(4,1fr)">${btn('Aceitar', 'p', null, 'xs')}${btn('Contra', 'o', null, 'xs')}${btn('Recusar', 'x', null, 'xs')}${btn('Retirar', 'ghost', null, 'xs')}</div></div><div class="row"><button class="btn ghost xs">${ic('flag', 16)} Denunciar transferência</button></div>`)}`,
})

// ---------- COMPETIÇÕES ----------
const cTabs = (on) => tabs(['Em andamento', 'Próximas', 'Histórico', 'Conquistas'], on, 'scroll')
const cHead = () => `<div class="hl" style="gap:10px;align-items:center">${ic('trophy', 32, 'style="color:var(--gold)"')}<h2 class="pt grow">Competições</h2><span class="s12 mu" style="font-style:italic;text-align:right">Grandes desafios,<br>grandes conquistas!</span></div>`
const compRow = (icn, n, s, chipT, c, sub) => `<div class="li" style="min-height:64px">${ic(icn, 34, 'style="color:var(--gold)"')}<div class="t"><b style="font-size:16px">${n}</b><small>${s}</small></div><span class="col" style="align-items:flex-end;gap:2px">${chip(chipT, c)}<small class="mu s12">${sub}</small></span>${chv}</div>`
add('competicoes', 'Competições: em andamento', {
  nav: 'comp', body: `${cHead()}${cTabs(0)}
  ${card(`<div class="row"><div class="col grow"><b class="fd" style="font-size:24px">Copa Continental</b><span class="mu s13">Quartas de final</span></div>${ic('trophy', 54, 'style="color:var(--gold)"')}</div><div class="score"><div class="tm">${crestStar('SER', 52)}Atlético-SE</div><b class="fd" style="font-size:34px">X</b><div class="tm">${crest('RCA', 52)}Rubro</div></div><div class="tc s13 mu">${ic('cal', 14)} 24/10/2026 · 21:30 (qua)</div>${btn('Ver detalhes', 'p', 'play', 'block')}`, 'gld')}
  <div class="ch" style="padding:2px 4px">${ic('chart', 22)}<h3>Outras competições</h3></div>
  ${card(`<div class="list">${compRow('chart', 'Brasileirão Série A', 'Disputa em andamento', '1ª posição', 'g', '62 pontos')}${compRow('trophy', 'Copa do País', 'Oitavas de final', 'Classificado', 'g', 'Confronto definido')}${compRow('trophy', 'Campeonato Estadual', 'Finalizado', 'Campeão', 'gd', 'Atlético-SE')}${compRow('trophy', 'Supercopa', 'Em disputa', 'Semifinal', 'g', 'Atlético-SE x Rubro')}</div>`)}`,
})
add('competicao-classificacao', 'Competição: classificação', {
  nav: 'comp', body: `${cHead()}${tabs(['Série A', 'Série B'], 0)}${tabs(['Tabela', 'Rodadas', 'Artilharia', 'Assist.', 'Cartões', 'Copas', 'Histórico'], 0, 'scroll')}
  <div class="row between"><button class="xbtn">${ic('left', 18)}</button><b class="fd" style="font-size:22px">Temporada 2026</b><button class="xbtn">${ic('chev', 18)}</button></div>
  ${card(`<table class="tbl"><tr><th class="zone"></th><th>#</th><th class="l">Time</th><th>J</th><th>V</th><th>E</th><th>D</th><th>GP</th><th>GC</th><th>SG</th><th>Pts</th></tr>${[['SER', 'Atlético-SE', 14, 9, 3, 2, 24, 11, 62], ['RCA', 'Rubro', 14, 9, 2, 3, 26, 14, 60], ['VPA', 'Verde', 14, 8, 3, 3, 22, 13, 57], ['RCE', 'Raposa', 14, 7, 4, 3, 19, 12, 55], ['TGA', 'Tricolor', 14, 7, 2, 5, 18, 15, 52], ['LDM', 'Leão', 14, 6, 4, 4, 17, 14, 50], ['IMP', 'Imperial', 14, 6, 3, 5, 16, 15, 49], ['ENO', 'Estrela', 14, 3, 3, 8, 10, 22, 30], ['VVA', 'Vitória', 14, 2, 3, 9, 9, 24, 27]].map(([k, n, j, v, e, d, gp, gc, p], i) => `<tr class="${k === 'SER' ? 'me' : ''}"><td class="zone" style="background:${i < 4 ? 'var(--g)' : i > 6 ? 'var(--red)' : 'transparent'}"></td><td>${i + 1}</td><td class="l"><span class="row" style="gap:6px">${crest(k, 20)}${n}</span></td><td>${j}</td><td>${v}</td><td>${e}</td><td>${d}</td><td>${gp}</td><td>${gc}</td><td>${gp - gc}</td><td class="pts">${p}</td></tr>`).join('')}</table><div class="row s12 mu"><span class="dot"></span>Campeão e vagas continentais <span class="dot r" style="margin-left:8px"></span>Rebaixamento</div>`)}`,
})
add('competicao-rodadas', 'Competição: rodadas', {
  nav: 'comp', body: `${cHead()}${tabs(['Série A', 'Série B'], 0)}${tabs(['Tabela', 'Rodadas', 'Artilharia', 'Assist.', 'Cartões', 'Copas', 'Histórico'], 1, 'scroll')}
  <div class="row between"><button class="xbtn">${ic('left', 18)}</button><div class="col tc"><b class="fd" style="font-size:22px">Rodada 14</b><span class="s12 mu">Sáb 10 Out 2026</span></div><button class="xbtn">${ic('chev', 18)}</button></div>
  ${card(`<div class="list">${[['SER', 'IMP', '2 - 0', 'Arena da Serra'], ['VVA', 'RCA', '1 - 3', 'Estádio do Vale'], ['VPA', 'TGA', '2 - 2', 'Arena Verde'], ['RCE', 'LDM', 'x', 'Arena Celeste'], ['ENO', 'POA', 'x', 'Estrelão']].map(([a, b, s, e]) => `<div class="li" style="flex-direction:column;align-items:stretch;gap:2px"><div class="row"><span class="row grow" style="gap:6px;font-size:13px">${crest(a, 26)}${T[a].short}</span><b class="fd" style="font-size:22px;min-width:56px;text-align:center">${s}</b><span class="row grow" style="gap:6px;font-size:13px;justify-content:flex-end">${T[b].short}${crest(b, 26)}</span></div><span class="s12 mu tc">${ic('stad', 12)} ${e}</span></div>`).join('')}</div>`)}`,
})
add('competicao-resumo', 'Competição: resumo do jogo', {
  nav: 'comp', body: `${cHead()}<div class="empty">Rodadas por trás</div>`,
  over: sheet('Resumo do jogo', `<div class="score"><div class="tm">${crestStar('SER', 46)}Atlético-SE</div><b class="sc">2 - 0</b><div class="tm">${crest('IMP', 46)}Imperial</div></div><div class="list"><div class="li"><span class="mn g fd">23'</span><div class="t"><b>⚽ Gol · Valadares</b><small>assistência: Pimenta (cruzamento)</small></div></div><div class="li"><span class="mn g fd">45'</span><div class="t"><b class="amb">▮ Cartão amarelo · Baldassi</b></div></div><div class="li"><span class="mn g fd">67'</span><div class="t"><b>⚽ Gol · Ferrão</b><small>assistência: Lemos (passe)</small></div></div></div>${btn('Fechar', 'ghost', null, 'block')}`),
})
add('competicao-artilharia', 'Competição: artilharia', {
  nav: 'comp', body: `${cHead()}${tabs(['Série A', 'Série B'], 0)}${tabs(['Tabela', 'Rodadas', 'Artilharia', 'Assist.', 'Cartões', 'Copas', 'Histórico'], 2, 'scroll')}
  <div class="card gld" style="background:linear-gradient(90deg,#2a1d06,#0c0d0a)"><div class="row">${ic('trophy', 28, 'style="color:var(--gold)"')}<h3 class="gold grow" style="font-size:24px">Artilharia</h3></div></div>${pills(['Geral', 'Casa', 'Fora', 'Brasileiros', 'Sub-23'], 0)}
  <div class="col" style="gap:8px">${[['Hugo Valadares', 'SER', 14, 1], ['Ícaro Veiga', 'VPA', 12, 2], ['Paulo Ferrão', 'SER', 9, 3], ['Gil Matos', 'RCA', 9, 0], ['Tomás Neri', 'TGA', 8, 0]].map(([n, k, g, m]) => `<div class="podium ${m ? 'p' + m : ''}">${m ? `<span class="medal">${m}</span>` : '<span class="medal" style="background:#243034;color:#9ab">·</span>'}${avatar(m, 40)}<div class="t col grow"><b>${n}</b><small class="mu s12 row" style="gap:5px">${crest(k, 16)}${T[k].short}</small></div><b class="fd" style="font-size:26px">${g}</b></div>`).join('')}</div>`,
})
add('competicao-copas', 'Competição: copas', {
  nav: 'comp', body: `${cHead()}${tabs(['Copa Continental', 'Copa do País'], 0)}${tabs(['Chaveamento', 'Jogos', 'Artilharia'], 0)}
  ${card(`<h4>Quartas de final</h4>${[['SER', 'RCA', 'a definir', true], ['VPA', 'TGA', '2 x 1 (ida)', false], ['LDM', 'IMP', '0 x 0 (ida)', false], ['POA', 'ENO', '3 x 0 (ida)', false]].map(([a, b, s, me]) => `<div class="li ${me ? 'sel-card' : ''}" style="${me ? 'border-radius:10px;padding:4px 8px' : ''}"><span class="row grow" style="gap:6px;font-size:13px">${crest(a, 24)}${T[a].short}</span><span class="s12 mu">${s}</span><span class="row grow" style="gap:6px;font-size:13px;justify-content:flex-end">${T[b].short}${crest(b, 24)}</span></div>`).join('')}<h4>Semifinal</h4><div class="empty">A definir</div>`)}
  <div class="empty">Sem copas no mundo: “Este mundo não tem copas.”</div>`,
})
add('competicoes-historico', 'Competições: histórico e conquistas', {
  nav: 'comp', body: `${cHead()}${cTabs(2)}
  ${card(`<div class="list">${[['2025', 'SER', 'Atlético Serrano', 'Rubro Carioca', 'Subiram: Vila Nova, Porto Azul · Caíram: Estrela, Vitória'], ['2024', 'RCA', 'Rubro Carioca', 'Atlético Serrano', ''], ['2023', 'VPA', 'Verde Paulista', 'Rubro Carioca', '']].map(([y, k, n, v, x]) => `<div class="li" style="flex-wrap:wrap"><b class="fd" style="font-size:22px;width:54px">${y}</b>${crest(k, 34)}<div class="t"><b>${n}</b><small>vice: ${v}</small></div>${ic('trophy', 22, 'style="color:var(--gold)"')}${x ? `<span class="note" style="width:100%">${x}</span>` : ''}</div>`).join('')}</div>`)}
  <h4>Conquistas do seu clube</h4>${card(`<div class="grid3">${[['Série A', '2025'], ['Estadual', '2026'], ['Supercopa', '2025']].map(([t, y]) => `<div class="tile" style="min-height:84px">${ic('trophy', 30, 'style="color:var(--gold)"')}<b>${t}</b><span class="s12 mu">${y}</span></div>`).join('')}</div>`, 'gld')}`,
})
add('pagina-do-time', 'Página do time', {
  nav: 'comp', body: `<div class="row"><button class="xbtn" style="width:auto;padding:0 12px">${ic('left', 18)}</button><b class="grow">Voltar</b></div>
  ${card(`<div class="row">${crest('VPA', 66)}<div class="col grow"><h2 class="pt">Verde Paulista</h2><span class="mu s13">3º lugar · 57 pts · força 78</span></div></div><div>${rdots('WLWWW')}</div>`, 'glow')}
  ${card(`<h4>Próximo jogo</h4>${kv('Rodada 15', 'Raposa (em casa)')}`)}
  ${card(`<h4>Tática</h4>${kv('Formação', '4-4-2')}${kv('Estilo', 'Pressão total')}${kv('Mentalidade', 'Equilibrada')}`)}
  ${card(`<h4>Elenco</h4><div class="list">${SQUAD.slice(0, 5).map((p) => `<div class="li">${pos(p.p)}<div class="t"><b>${p.name}</b></div>${ovr(p.o)}</div>`).join('')}</div>`)}`,
})

// ---------- FINANÇAS ----------
const fHead = (on) => `<div class="hl" style="gap:10px;align-items:center">${ic('dollar', 30, 'style="color:var(--g)"')}<h2 class="pt grow">Finanças</h2></div>${tabs(['Resumo', 'Extrato', 'Balanço', 'Ingresso'], on)}`
add('financas', 'Finanças', {
  nav: 'more', body: `${fHead(0)}
  ${card(`<div class="row"><div class="col grow"><span class="s12 mu">Caixa</span><b class="big g" style="font-size:36px">R$ 24.750.000</b></div><div class="col tc" style="align-items:center"><span class="s12 mu">Diretoria</span><b class="fd" style="font-size:26px">78%</b></div></div>${btn('Pedir verba', 'o', 'dollar', 'block sm')}<div class="note">Uma vez por janela de transferências. Recusa com o motivo, se não der.</div>`, 'glow')}
  <div class="card warn">${ic('alert', 22)}<b>Folha acima da sustentável</b><span class="s13">O caixa paga os salários por mais 14 meses. Reduza a folha ou aumente a receita.</span></div>
  ${card(`<h4>Orçamento</h4><div class="seg" style="gap:2px"><i class="on" style="flex:4"></i><i style="flex:2;background:var(--blue)"></i></div><div class="row between s13"><span class="g">Salários · R$ 1,48 mi / mês</span><span style="color:var(--blue)">Compras · R$ 6,2 mi</span></div><div class="row"><span class="s12 mu">Mover para compras</span><span class="grow"></span><button class="xbtn">−</button><button class="xbtn">+</button></div>${kv('Folha por mês', 'R$ 1.480.000')}${kv('Folga por mês', '+ R$ 520.000')}<div class="row">${chip('Caixa paga salários por mais 14 meses', 'g', 'check')}</div>`)}
  ${card(`<h4>Receitas</h4>${[['Bilheteria', 'R$ 18,2 mi'], ['Patrocínio', 'R$ 22,0 mi'], ['Direitos de TV', 'R$ 31,5 mi'], ['Vendas de jogadores', 'R$ 12,0 mi']].map(([k, v]) => `<div class="kv"><span>${k}</span><b class="g">${v}</b></div>`).join('')}<h4>Despesas</h4>${[['Salários', 'R$ 17,8 mi'], ['Compras', 'R$ 14,1 mi'], ['Rescisões', 'R$ 0,9 mi'], ['Operação', 'R$ 8,4 mi']].map(([k, v]) => `<div class="kv"><span>${k}</span><b class="red">${v}</b></div>`).join('')}${kv('Renda média em casa', 'R$ 1,2 mi')}`)}
  ${card(`<div class="row"><div class="col grow"><b>Estádio · Arena da Serra</b><span class="s12 mu">Ocupação média 91% · ingresso R$ 70</span></div>${chv}</div>`)}`,
})
add('financas-extrato', 'Finanças: extrato e balanço', {
  nav: 'more', body: `${fHead(1)}${card(`<div class="list">${[['16 Out', 'Bilheteria · Atlético-SE x Imperial', '+ R$ 1.240.000', 'g'], ['15 Out', 'Salários de outubro', '− R$ 1.480.000', 'red'], ['12 Out', 'Compra · Júnior Sobral', '− R$ 48.500.000', 'red'], ['12 Out', 'Venda · Ronei Matos', '+ R$ 12.000.000', 'g'], ['01 Out', 'Patrocínio', '+ R$ 1.830.000', 'g']].map(([d, t, v, c]) => `<div class="li"><span class="s12 mu" style="width:46px">${d}</span><div class="t"><b style="font-weight:500;font-size:13.5px">${t}</b></div><b class="${c} fd" style="font-size:16px">${v}</b></div>`).join('')}</div>`)}
  ${tabs(['Resumo', 'Extrato', 'Balanço', 'Ingresso'], 2)}${card(`<h4>Balanço da temporada · contra 2025</h4>${[['Receitas', '+ 12%', 'g'], ['Despesas', '+ 4%', 'red'], ['Bilheteria', '+ 18%', 'g'], ['Patrocínio', '+ 6%', 'g'], ['Salários', '+ 9%', 'red']].map(([k, v, c]) => `<div class="kv"><span>${k}</span><b class="${c}">${v}</b></div>`).join('')}`)}`,
})
add('financas-ingresso', 'Finanças: ingresso', {
  nav: 'more', body: `${fHead(3)}${card(`<div class="row"><div class="col grow"><span class="s12 mu">Preço do ingresso</span><b class="big">R$ 70</b></div><div class="col tc" style="align-items:center"><span class="s12 mu">Ocupação esperada</span><b class="fd g" style="font-size:28px">91%</b></div></div><div class="grid2">${btn('Baixar o preço', 'd', 'down', 'sm')}${btn('Subir o preço', 'd', 'up', 'sm')}</div>${btn('Usar', 'p', 'check', 'block')}`, 'glow')}<div class="card"><span class="note">Preço alto reduz o público e o fator casa; preço baixo enche o estádio mas rende menos. Estádio lotado ajuda o mandante.</span></div>${kv('Capacidade', '46.000')}${kv('Renda média em casa', 'R$ 1,2 mi')}`,
})
const gb = (s) => S.find((x) => x.slug === s)
gb('mercado-filtros').body = gb('mercado-buscar').body; gb('mercado-negociacao').body = gb('mercado-buscar').body; gb('competicao-resumo').body = gb('competicao-rodadas').body
module.exports = S
