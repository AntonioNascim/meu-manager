// Dentro do jogo: casco, painel, elenco, tática.
const L = require('./lib.cjs')
const { ic, T, crest, crestStar, chip, btn, card, ch, lnk, kv, field, check, sw, radio, sheet, tabs, pills, bar, flag, stars, avatar, ovr, pos, mood, cond, rdots, SQUAD, pitch3d, XIP } = L
const S = []
const add = (slug, title, o) => S.push({ slug, title, ...o })
const chv = ic('chev', 18, 'style="color:var(--g)"')

const notice = (icon, t, s, u) => `<div class="notice ${u ? 'u' : ''}">${ic(icon, 24)}<div class="t"><b>${t}</b><small>${s}</small></div>${ic('chev', 20)}</div>`
const nextGame = (cond) => `<section class="card flat glow"><div class="hl" style="justify-content:space-between;align-items:center"><span class="lab">${ic('trophy', 20)}Próximo jogo</span><span class="lnk" style="padding-right:12px">Brasileirão Série A ${ic('chev', 14)}</span></div>
<div class="stadium" style="padding:14px 10px 12px"><div class="score" style="grid-template-columns:1fr auto 1fr"><div class="tm">${crestStar('SER', 62)}Atlético-SE<small class="mu s12" style="font:500 11px var(--fb)">1º · ${rdots('WWDWW')}</small></div><div class="col" style="align-items:center"><span class="fd" style="font-size:46px;line-height:1">X</span><b class="fd" style="font-size:20px">21:00</b><span class="mu s12">${ic('stad', 14)} Arena da Serra</span></div><div class="tm">${crest('RCA', 62)}Rubro<small class="mu s12" style="font:500 11px var(--fb)">2º · ${rdots('WWWDL')} · toque</small></div></div>
<div class="tc s12 mu" style="margin-top:6px">Rodada 15 · Sáb 17 Out${cond ? ' · Condição média dos titulares <b class="g">96%</b>' : ''}</div></div>
<div class="grid2" style="padding:10px 12px">${btn('Preparar partida', 'o', 'play', 'block xs')}${btn('Tática', 'd', 'target', 'block xs')}</div></section>`
const miniTable = () => card(`<div class="ch">${ic('chart', 22)}<h3>Classificação</h3>${lnk('Ver tabela')}</div><table class="tbl"><tr><th>Pos</th><th class="l">Time</th><th>Forma</th><th>Pts</th></tr>${[[1, 'SER', 'Atlético-SE', 'WWDWW', 62], [2, 'RCA', 'Rubro', 'WWWDL', 60], [3, 'VPA', 'Verde', 'WLWWW', 57], [4, 'RCE', 'Raposa', 'DWLWW', 55], [5, 'TGA', 'Tricolor', 'LWDWL', 52]].map(([p, k, n, f, pt]) => `<tr class="${k === 'SER' ? 'me' : ''}"><td>${p}</td><td class="l"><span class="row" style="gap:8px">${crest(k, 22)}${n}</span></td><td>${rdots(f)}</td><td class="pts">${pt}</td></tr>`).join('')}</table>`, 'acc')
const lastResults = () => card(`<div class="ch">${ic('shirt', 22)}<h3>Últimos resultados</h3></div><div class="list">${[['SER', 'IMP', '2 - 0'], ['VVA', 'SER', '1 - 1'], ['SER', 'POA', '3 - 1'], ['ENO', 'SER', '0 - 2'], ['SER', 'LDM', '1 - 0']].map(([a, b, s]) => `<div class="li" style="min-height:42px"><span class="row grow" style="gap:6px;font-size:12.5px">${crest(a, 22)}${T[a].short}</span><b class="fd" style="font-size:18px">${s}</b><span class="row grow" style="gap:6px;font-size:12.5px;justify-content:flex-end">${T[b].short}${crest(b, 22)}</span></div>`).join('')}</div>`, 'acc')
const tiles = (adm) => `<div class="grid5" style="grid-template-columns:repeat(5,1fr)">${[['users', 'Elenco', 1], ['clip', 'Escalação'], ['target', 'Tática'], ['sprout', 'Base', 1], ['dumb', 'Treino'], ['swap', 'Mercado', 1], ['doc', 'Contratos', 1], ['dollar', 'Finanças'], ['table', 'Tabela'], ['hist', 'Histórico']].map(([i, t, a]) => `<button class="tile">${ic(i, 24)}<span style="font-size:11px">${t}</span>${a ? '<span class="alert"></span>' : ''}</button>`).join('')}${adm ? `<button class="tile" style="border-color:var(--gold)">${ic('crown', 24, 'style="color:var(--gold)"')}<span style="font-size:11px">ADM</span></button>` : ''}</div>`
const trio = () => `<div class="grid3" style="grid-template-columns:1.25fr 1fr 1fr"><button class="card glow" style="gap:4px;padding:10px">${'<div class="row" style="gap:6px">'+ic('dollar',22,'style="color:var(--g)"')+'<b class="fd" style="font-size:16px">Finanças</b></div>'}<b class="fd g" style="font-size:19px">R$ 24.750.000</b><span class="s12 mu">Saldo em caixa</span></button><button class="card" style="gap:4px;padding:10px"><div class="row" style="gap:6px">${ic('users',20,'style="color:var(--g)"')}<b class="fd" style="font-size:16px">Elenco</b></div><b class="fd" style="font-size:19px">26</b><span class="s12 mu">jogadores</span></button><button class="card" style="gap:4px;padding:10px"><div class="row" style="gap:6px">${ic('target',20,'style="color:var(--g)"')}<b class="fd" style="font-size:16px">Tática</b></div><b class="fd" style="font-size:19px">4-3-3</b><span class="s12 mu">Formação</span></button></div>`
const lower = () => `
${card(`<div class="ch">${ic('trophy', 22)}<h3>Copas</h3>${lnk('Ver chaveamento')}</div><div class="row"><div class="col grow"><b>Copa Continental</b><span class="mu s12">Quartas de final · ida e volta</span></div>${chip('Classificado', 'g')}</div><div class="seg"><i class="on"></i><i class="on"></i><i class="on"></i><i></i><i></i></div><span class="note">Fase de grupos ✓ · Oitavas ✓ · Quartas (agora)</span>`)}
${card(`<div class="ch">${ic('star', 22)}<h3>Destaques do elenco</h3></div><div class="grid3">${[['Artilheiro', 'Valadares', '14 gols', 0], ['Garçom', 'Lemos', '9 assist.', 3], ['Melhor nota', 'Baldassi', '7,8', 1]].map(([t, n, v, a]) => `<div class="col tc" style="align-items:center">${avatar(a, 46)}<b style="font-size:13px">${n}</b><span class="g b fd" style="font-size:17px">${v}</span><span class="mu s12">${t}</span></div>`).join('')}</div><span class="note">Melhor nota média exige 3 jogos com nota.</span>`)}
${card(`<div class="ch">${ic('dumb', 22)}<h3>Treino</h3>${lnk('Mudar')}</div><div class="row"><b class="grow">Normal · equilibrado</b>${chip('+ evolução', 'g')}</div>`)}
${card(`<div class="ch">${ic('ball', 22)}<h3>Último jogo</h3></div><div class="score"><div class="tm">${crestStar('SER', 34)}</div><b class="fd" style="font-size:32px">2 - 0</b><div class="tm">${crest('IMP', 34)}</div></div><div class="tc s13 mu">Vitória em casa · Valadares 23', Ferrão 67'</div>`)}
${card(`<div class="ch">${ic('shield', 22)}<h3>Diretoria</h3>${chip('Satisfeita', 'g')}</div><div class="kv"><span>Meta da temporada</span><b>Terminar no G4</b></div><div class="note">Abaixo do 14º lugar você é demitido.</div><div class="row"><span class="s12 mu">Confiança</span><div class="grow">${bar(78)}</div><b class="fd">78%</b></div><div class="kv"><span>Posição hoje</span><b class="g">1º lugar</b></div>`)}
${card(`<div class="ch">${ic('wallet', 22)}<h3>Orçamento</h3>${lnk('Finanças')}</div>${kv('Saldo em caixa', 'R$ 24.750.000')}${kv('Orçamento de transferências', 'R$ 6.200.000')}${kv('Folha no orçamento', 'R$ 1.480.000 / mês')}`)}
${btn('Relatar problema', 'ghost', 'flag', 'block sm')}`

add('painel-solo', 'Painel do clube (solo)', {
  nav: 'home', alerts: ['squad', 'market'],
  body: `
  ${card(`<div class="ch">${ic('bell', 22)}<h3>Avisos</h3>${chip('5', 'y')}</div><div class="col" style="gap:8px">${notice('sprout', 'Decisão sobre a base', '3 jovens fizeram 20 anos', true)}${notice('mail', '2 propostas recebidas', 'Por Ferrão e Pimenta')}${notice('doc', 'Contratos no último ano', '4 jogadores')}${notice('med', 'Lesionados e suspensos', 'Lyandro (12 dias) · Rômulo suspenso')}${notice('swap', 'Janela de transferências aberta', 'Fecha em 18 dias')}</div>`, 'warn')}
  ${nextGame(true)}
  ${btn('Avançar', 'p', 'ffwd', 'block big-btn up pulse')}
  <div class="note tc">Também: “Ir para a partida” · “Decidir sobre a base” · “Encerrar a temporada”</div>
  ${trio()}${tiles(false)}
  ${miniTable()}${lastResults()}
  ${lower()}`,
})
add('painel-online', 'Painel do clube (liga online)', {
  nav: 'home', alerts: ['squad'], offline: true,
  body: `
  ${card(`<div class="ch">${ic('globe', 22)}<h3>Liga online</h3>${chip('Liga dos Amigos', 'c')}</div><div class="row"><div class="col grow"><b>Rodada 15 · sábado 21:00</b><span class="mu s12">Prazo para dar Pronto: 18 min</span></div><span class="chip g">${ic('users', 12)} 2 de 5</span></div><div class="grid2">${btn('Pronto', 'p', 'check', 'sm')}${btn('Entrar na partida', 'o', 'play', 'sm')}</div><div class="grid2">${btn('Sala da liga', 'd', 'users', 'sm')}${btn('Minha carreira', 'd', 'hist', 'sm')}</div><div class="card warn" style="padding:8px 10px"><span class="s13">Seu clube não joga na próxima rodada.</span></div>`, 'glow')}
  ${nextGame(true)}
  ${trio()}${tiles(true)}
  ${miniTable()}${lastResults()}
  ${lower()}`,
})
add('painel-bloqueio', 'Aviso de ação indisponível', { nav: 'home', blocked: true, body: `${nextGame(false)}${tiles(false)}` })
add('preparando-temporada', 'Preparando a temporada', {
  nav: 'home',
  body: `${nextGame(false)}${tiles(false)}`,
  over: `<div class="scrim" style="background:rgba(0,0,0,.82)"></div><div class="modal tc" style="align-items:center"><div style="padding:4px 0">${crestStar('SER', 64)}</div><h3>Preparando a temporada…</h3><div style="width:100%">${bar(62)}</div><span class="note">Isto pode levar alguns segundos num celular mais simples. Não feche o jogo.</span></div>`,
})
add('demitido-solo', 'Demitido', {
  header: false,
  body: `<div class="card bad" style="align-items:center;text-align:center;margin-top:30px;padding:24px">${crest('SER', 70)}<h2 class="pt" style="font-size:34px">Você foi demitido</h2><span class="s13">A diretoria do Atlético Serrano encerrou seu contrato após 4 derrotas seguidas. A confiança chegou a 8%.</span></div>
  ${btn('Procurar emprego', 'p', 'search', 'block')}${btn('Começar um novo jogo', 'd', 'plus', 'block')}`,
})
add('carreira', 'Carreira', {
  nav: 'more',
  body: `<h2 class="pt">Carreira</h2>
  ${card(`<h4>Reputação como técnico</h4><div class="row"><b class="big gold">68</b><div class="grow">${bar(68)}</div></div><span class="note">Boa: clubes de médio porte te procuram.</span>`, 'gld')}
  ${card(`<div class="ch">${ic('hist', 22)}<h3>Sua carreira</h3></div><div class="list">${[['SER', 'Atlético Serrano', '2025 – hoje', '1 título'], ['IMP', 'Imperial FC', '2023 – 2025', '2 acessos'], ['ENO', 'Estrela do Norte', '2022 – 2023', 'Série B']].map(([k, n, y, r]) => `<div class="li">${crest(k, 36)}<div class="t"><b>${n}</b><small>${y} · ${r}</small></div></div>`).join('')}</div>`)}
  ${card(`<div class="ch">${ic('mail', 22)}<h3>Propostas de outros clubes</h3></div><div class="li">${crest('VPA', 36)}<div class="t"><b>Verde Paulista</b><small>Série A · reputação 17 · contrato de 2 anos</small></div>${btn('Assumir', 'o', null, 'xs')}</div><div class="card" style="padding:10px"><b class="s13">Assumir o Verde Paulista? Você deixa o Atlético Serrano.</b><div class="grid2">${btn('Confirmar', 'p', null, 'xs')}${btn('Cancelar', 'ghost', null, 'xs')}</div></div>`)}
  ${card(`<h3>Vagas abertas</h3><div class="li">${crest('LDM', 36)}<div class="t"><b>Leão do Mar</b><small>Série A · reputação 12</small></div>${btn('Assumir', 'o', null, 'xs')}</div>`)}`,
})
add('mais', 'Aba Mais', {
  nav: 'more',
  body: `<h2 class="pt">Mais</h2>
  ${card(`<div class="list">${[['dollar', 'Finanças', 'Caixa, orçamento e ingresso'], ['hist', 'Carreira', 'Reputação e propostas'], ['table', 'Histórico', 'Temporadas encerradas'], ['doc', 'Contratos', 'Renovações'], ['sprout', 'Base', 'Categorias de base'], ['dumb', 'Treino', 'Plano e vaga individual'], ['globe', 'Liga online', 'Sala, técnicos e Pronto']].map(([i, t, s]) => `<div class="li">${ic(i, 24, 'style="color:var(--g)"')}<div class="t"><b>${t}</b><small>${s}</small></div>${chv}</div>`).join('')}</div>`)}
  ${card(`<div class="list">${[['info', 'Créditos e avisos'], ['flag', 'Relatar problema']].map(([i, t]) => `<div class="li">${ic(i, 24, 'style="color:var(--mu)"')}<div class="t"><b>${t}</b></div>${chv}</div>`).join('')}</div>`)}
  ${btn('Menu · salvar e voltar ao início', 'd', 'menu', 'block')}`,
})

// ---------- ELENCO ----------
const sqTabs = (on) => tabs(['Time principal', 'Jogadores', 'Números', 'Base', 'Treino', 'Tática'], on, 'scroll')
const xiPlayers = () => XIP.map((p) => ({ ...p }))
const lineup = (selIdx = -1) => `
${card(`<div class="row"><div class="col tc grow" style="align-items:center"><b class="big">77</b><span class="s12 mu">GERAL DO TIME</span>${stars(4)}</div><div class="col tc grow" style="align-items:center;border-left:1px solid var(--line2);border-right:1px solid var(--line2)">${ic('target', 28, 'style="color:var(--g)"')}<b class="fd" style="font-size:24px">4-3-3</b><span class="s12 mu">Formação</span></div><div class="col tc grow" style="align-items:center">${ic('chart', 26, 'style="color:var(--g)"')}<b class="fd" style="font-size:20px">R$ 102,5 mi</b><span class="s12 mu">Valor de mercado</span></div></div>`)}
<div class="pills">${['4-3-3', '4-4-2', '3-5-2', '4-2-3-1', 'Livre · 3-5-2'].map((t, i) => `<button class="${i === 0 ? 'on' : ''}">${t}</button>`).join('')}</div>
${pitch3d({ xi: xiPlayers(), sel: selIdx })}
<div class="note tc">Toque em um jogador e depois em outro para trocar de lugar. Arraste para mudar a posição.</div>
${card(`<div class="ch">${ic('users', 22)}<h3>Banco</h3></div><div class="list">${SQUAD.filter((p) => ['Caio', 'Davi', 'Elias', 'Orlando Cunha', 'Tiago', 'Wesley', 'Zico'].some((n) => p.name.includes(n))).map((p) => `<div class="li">${avatar(p.i, 38)}<div class="t"><b>${p.name}</b><small>${p.pn} · ${p.age} anos</small></div>${ovr(p.o)}</div>`).join('')}</div><div class="card warn" style="padding:8px 10px"><span class="s13">Indisponíveis: Lyandro (lesão, 12 dias) · Rômulo (suspenso).</span></div>`)}
${btn('Sugerir escalação automática', 'o', 'sliders', 'block')}
${card(`<div class="ch">${ic('target', 22)}<h3>Estilo e mentalidade</h3></div><h4>Estilo de jogo</h4><div class="pills">${['Toque de bola', 'Contra-ataque', 'Pressão total', 'Lançamento direto', 'Jogar pelas pontas'].map((t, i) => `<button class="${i === 0 ? 'on' : ''}">${t}</button>`).join('')}</div><h4>Mentalidade</h4><div class="seg" style="gap:4px">${['Muito defensiva', 'Defensiva', 'Equilibrada', 'Ofensiva', 'Muito ofensiva'].map((t, i) => `<i class="${i === 2 ? 'on' : ''}" style="height:30px;border-radius:6px;display:grid;place-items:center;font-size:9px;color:${i === 2 ? '#031' : '#8a9'};text-align:center;line-height:1"></i>`).join('')}</div><div class="row between s12 mu"><span>Muito defensiva</span><b class="g">Equilibrada</b><span>Muito ofensiva</span></div>`)}
${card(`<div class="ch">${ic('flag', 22)}<h3>Próximo adversário</h3></div><div class="row">${crest('RCA', 40)}<div class="col grow"><b>Rubro Carioca</b><span class="mu s12">4-2-3-1 · Contra-ataque · Ofensiva</span></div></div>${btn('Ver a escalação provável dele', 'd', 'eye', 'block sm')}`)}
${card(`<div class="ch">${ic('folder', 22)}<h3>Escalações salvas</h3></div>${[['Titular de domingo', '4-3-3 · Toque de bola', true], ['Poupar titulares', '4-4-2 · Contra-ataque', true], [null, 'Espaço vazio', false]].map(([n, s, f]) => `<div class="li">${ic('clip', 22, 'style="color:var(--g)"')}<div class="t"><b>${n || 'Espaço 3'}</b><small>${s}</small></div>${f ? `${btn('Carregar', 'o', null, 'xs')}<button class="xbtn" style="width:36px;height:36px">${ic('edit', 16)}</button><button class="xbtn" style="width:36px;height:36px">${ic('trash', 16)}</button>` : btn('Guardar a atual', 'o', null, 'xs')}</div>`).join('')}`)}
<div class="card" style="padding:10px"><span class="s12 mu">Limite de estrangeiros: <b class="g">4 de 6</b> na escalação.</span></div>`
add('elenco-escalacao', 'Elenco: time principal e escalação', { nav: 'squad', alerts: ['squad'], body: `<div class="hl" style="gap:10px;align-items:center">${ic('users', 30, 'style="color:var(--g)"')}<h2 class="pt grow">Elenco</h2><span class="s12 mu" style="font-style:italic;text-align:right">Elenco forte para brigar<br>por todos os títulos!</span></div>${sqTabs(0)}${lineup(1)}` })

const playerRow = (p, n) => `<div class="li" style="min-height:62px"><b class="fd mu" style="width:16px;font-size:16px">${n}</b>${avatar(p.i, 42)}<div class="t"><b>${p.name}</b><small>${flag(p.c)} ${p.pn} · ${p.age} anos</small></div><span class="col" style="align-items:flex-end;gap:3px">${ovr(p.o)}<span class="row" style="gap:5px">${mood(p.md)}${cond(p.cn)}</span></span>${ic('chev', 18, 'style="color:var(--g)"')}</div>`
add('elenco-jogadores', 'Elenco: jogadores', {
  nav: 'squad',
  body: `<h2 class="pt">Elenco</h2>${sqTabs(1)}
  ${pills(['Todos', 'Goleiros', 'Defesa', 'Meio', 'Ataque', 'Lesionados'], 0)}
  <div class="row"><div class="inp grow" style="min-height:44px">Geral (maior → menor) <span class="grow"></span>${ic('down', 18)}</div><button class="xbtn">${ic('sort', 20)}</button></div>
  ${card(`<div class="list">${[...SQUAD].filter((p) => !['Lyandro', 'Rômulo', 'Pimenta'].some((n) => p.name.includes(n))).sort((a, b) => b.o - a.o).slice(0, 8).map((p, i) => playerRow(p, i + 1)).join('')}<div class="li" style="min-height:62px"><b class="fd mu" style="width:16px">9</b>${avatar(5, 42)}<div class="t"><b>Lucas Lyandro</b><small>${flag('BR')} Zagueiro · lesão 12 dias</small></div><span class="col" style="align-items:flex-end;gap:3px">${ovr(81)}${chip('Lesão', 'r', 'med')}</span>${chv}</div><div class="li" style="min-height:62px"><b class="fd mu" style="width:16px">10</b>${avatar(2, 42)}<div class="t"><b>Rômulo Saldanha</b><small>${flag('UY')} Meia · suspenso 1 jogo</small></div><span class="col" style="align-items:flex-end;gap:3px">${ovr(79)}${chip('Suspenso', 'y', 'card')}</span>${chv}</div><div class="li" style="min-height:62px"><b class="fd mu" style="width:16px">11</b>${avatar(3, 42)}<div class="t"><b>Marcelo Pimenta</b><small>${flag('BR')} Ponta direita · pendurado</small></div><span class="col" style="align-items:flex-end;gap:3px">${ovr(76)}${chip('Pendurado', 'y', 'card')}</span>${chv}</div></div>`)}
  <div class="note tc">Setas de força no mês: ▲ sobe · ▼ cai (comparando com 25 dias atrás)</div>`,
})
add('jogador-detalhe', 'Detalhe do jogador', {
  nav: 'squad',
  body: `<div class="row"><button class="xbtn" style="width:auto;padding:0 12px">${ic('left', 18)}</button><span class="grow"></span><button class="xbtn">${ic('star', 20, 'style="color:var(--gold)"')}</button></div>
  ${card(`<div class="row">${avatar(0, 74)}<div class="col grow"><h2 class="pt">Hugo Valadares</h2><span class="mu s13">${flag('BR')} Brasil · 33 anos · pé direito</span><div class="row">${pos('ATA')}<span class="s12 mu">sec.: PD</span></div></div>${ovr(88, true)}</div>`, 'glow')}
  ${card(`<h4>Estado atual</h4><div class="grid3"><div class="col tc" style="align-items:center"><span class="s12 mu">Condição</span><b class="big">100%</b></div><div class="col tc" style="align-items:center"><span class="s12 mu">Moral</span><b class="big">${mood(80)}</b></div><div class="col tc" style="align-items:center"><span class="s12 mu">Forma</span><b class="big g">7,6</b></div></div>${kv('Lesão', 'nenhuma')}${kv('Suspensão', 'não')}${kv('Amarelos', '2 de 3')}`)}
  ${card(`<h4>Atributos</h4>${[['Finalização', 91], ['Cabeceio', 84], ['Drible', 82], ['Velocidade', 76], ['Passe', 70], ['Desarme', 42], ['Resistência', 68], ['Posicionamento', 88], ['Visão', 72], ['Determinação', 90]].map(([n, v]) => `<div class="attr"><span>${n}</span>${bar(v, v < 50 ? 'y' : '')}<b>${v}</b></div>`).join('')}`)}
  ${card(`<h4>Força por posição</h4><div class="grid3">${[['ATA', 88], ['PD', 80], ['MEI', 74], ['PE', 78], ['MC', 66]].map(([p, v]) => `<div class="tile" style="min-height:60px">${pos(p)}<b class="fd" style="font-size:20px">${v}</b></div>`).join('')}</div>`)}
  ${card(`<h4>Evolução da força</h4><svg viewBox="0 0 340 90" width="100%" height="90" preserveAspectRatio="none"><path d="M0 70 L50 66 L100 58 L150 60 L200 44 L250 36 L300 30 L340 24" fill="none" stroke="#27e05a" stroke-width="3"/><path d="M0 70 L50 66 L100 58 L150 60 L200 44 L250 36 L300 30 L340 24 L340 90 L0 90z" fill="rgba(39,224,90,.12)"/></svg><div class="row between s12 mu"><span>há 10 meses</span><span>hoje</span></div>`)}
  ${card(`<h4>Temporada</h4><div class="grid3">${[['Jogos', 24], ['Gols', 14], ['Assist.', 5], ['Minutos', '2.010'], ['Cartões', 2], ['Nota média', '7,6']].map(([k, v]) => `<div class="col tc" style="align-items:center"><b class="big">${v}</b><span class="s12 mu">${k}</span></div>`).join('')}</div>`)}
  ${card(`<h4>Contrato</h4>${kv('Salário', 'R$ 420.000 / mês')}${kv('Término', 'dez/2028')}${kv('Multa rescisória', 'R$ 90.000.000')}${kv('Potencial (estimado)', stars(3) )}`)}
  ${btn('Vender, emprestar ou liberar', 'o', 'swap', 'block')}${btn('Fechar', 'ghost', null, 'block')}`,
})
add('jogador-vender', 'Vender, emprestar ou liberar', {
  nav: 'squad', body: `<div class="empty">Detalhe do jogador por trás</div>`,
  over: sheet('Vender, emprestar ou liberar', `<div class="row">${avatar(0, 46)}<div class="col grow"><b>Hugo Valadares</b><span class="mu s12">Valor de mercado R$ 38 mi</span></div></div>${tabs(['Vender', 'Emprestar', 'Anunciar', 'Liberar'], 0)}<h4>Clubes interessados</h4><div class="list">${[['RCA', 'R$ 36 mi'], ['VPA', 'R$ 33 mi']].map(([k, v]) => `<div class="li">${crest(k, 34)}<div class="t"><b>${T[k].name}</b><small>proposta direta</small></div><b class="fd" style="font-size:19px">${v}</b>${btn('Vender', 'o', null, 'xs')}</div>`).join('')}</div>${btn('Anunciar para venda (R$ 38 mi)', 'd', 'news', 'block')}${btn('Liberar de graça', 'x', 'trash', 'block')}`),
})
add('elenco-numeros', 'Elenco: números', {
  nav: 'squad',
  body: `<h2 class="pt">Elenco</h2>${sqTabs(2)}
  ${card(`<div class="note">Toque no título da coluna para ordenar.</div><table class="tbl"><tr><th class="l">Jogador</th><th>J</th><th>Min</th><th>G</th><th>A</th><th>🟨</th><th>Nota ▼</th></tr>${[['Valadares', 24, 2010, 14, 5, 2, '7,6'], ['Baldassi', 23, 2040, 3, 6, 5, '7,8'], ['Lemos', 22, 1810, 6, 9, 1, '7,5'], ['Ferrão', 22, 1700, 9, 3, 0, '7,4'], ['Arantes', 24, 2120, 1, 5, 4, '7,1'], ['Reveres', 21, 1890, 2, 0, 3, '7,0'], ['Heitor', 24, 2160, 0, 0, 1, '6,9'], ['Pimenta', 20, 1400, 5, 4, 3, '6,8']].map(([n, ...v]) => `<tr><td class="l">${n}${n === 'Pimenta' ? ' <span class="chip y" style="padding:0 5px;font-size:10px">pend.</span>' : ''}</td>${v.map((x) => `<td>${x}</td>`).join('')}</tr>`).join('')}</table>`)}`,
})
add('elenco-base', 'Elenco: base', {
  nav: 'squad',
  body: `<h2 class="pt">Elenco</h2>${sqTabs(3)}
  <div class="card warn">${ic('alert', 22)}<b>Decisão pendente: 3 jovens fizeram 20 anos</b><span class="s13">Promova ou dispense. Se você deixar passar, a regra da IA decide na virada.</span></div>
  ${card(`<div class="ch">${ic('sprout', 22)}<h3>Categorias de base · 12 jovens</h3></div><div class="list">${[['Kauã Ribeiro', 'ATA', 20, 3, true], ['Pietro Alves', 'MC', 20, 4, true], ['Thales Gomes', 'ZAG', 20, 2, true], ['Nicolas Braga', 'GOL', 18, 4, false], ['Enzo Lacerda', 'PD', 17, 5, false], ['Davi Luiz', 'LE', 16, 3, false]].map(([n, p, a, s, dec], i) => `<div class="li" style="flex-wrap:wrap">${avatar(i + 1, 40)}<div class="t"><b>${n}</b><small>${pos(p)} ${a} anos · potencial ${'★'.repeat(s)}</small></div>${ovr(52 + i * 2)}${dec ? `<div class="grid3" style="width:100%;padding-top:6px;grid-template-columns:1fr 1fr 1fr">${btn('Promover', 'p', null, 'xs')}${btn('Dispensar', 'x', null, 'xs')}${btn('Decidir depois', 'ghost', null, 'xs')}</div>` : ''}</div>`).join('')}</div>`)}
  <div class="empty">Sem jovens na base: “Sua base está vazia. Novos jovens chegam na virada da temporada.”</div>`,
})
add('elenco-treino', 'Elenco: treino', {
  nav: 'squad',
  body: `<h2 class="pt">Elenco</h2>${sqTabs(4)}
  <h4>Intensidade do treino coletivo</h4>
  ${[['Leve', 'Evolução −', 'Recuperação +', 'Risco baixo', 0], ['Normal', 'Evolução normal', 'Recuperação normal', 'Risco normal', 1], ['Intensa', 'Evolução +', 'Recuperação −', 'Risco alto', 0]].map(([n, a, b, c, on]) => `<div class="card ${on ? 'glow' : ''}"><div class="row"><b class="fd grow" style="font-size:22px">${n}</b>${on ? chip('Atual', 'g', 'check') : ''}</div><div class="grid3" style="font-size:11.5px"><span class="${n === 'Intensa' ? 'g' : ''}">${a}</span><span class="${n === 'Leve' ? 'g' : ''}">${b}</span><span class="${n === 'Intensa' ? 'red' : 'g'}">${c}</span></div></div>`).join('')}
  <h4>Foco</h4>${pills(['Equilibrado', 'Físico', 'Técnico', 'Defensivo', 'Ofensivo'], 0)}
  ${card(`<div class="ch">${ic('target', 22)}<h3>Treino individual</h3></div><div class="row">${avatar(4, 40)}<div class="col grow"><b>Davi Rocha</b><span class="s12 mu">Acelerando: Desarme e Cabeceio</span></div></div><div class="row s12 mu"><div class="grow">${bar(40)}</div>12 de 30 dias</div>${btn('Cancelar treino', 'x', null, 'block sm')}<div class="sep"></div><h4>Nova vaga</h4><div class="grid2">${btn('Escolher jogador', 'd', 'user', 'sm')}${btn('Atributo ou posição', 'd', 'sliders', 'sm')}</div>`)}
  ${card(`<div class="ch">${ic('chart', 22)}<h3>Quem mais evolui</h3></div><div class="list">${[['Davi Rocha', 'ZAG', 19, 66, 'faixa de potencial 76–88'], ['Kaique Ramos', 'MC', 20, 65, 'faixa 74–86'], ['Zeca Andrade', 'ATA', 19, 68, 'faixa 78–90']].map(([n, p, a, o, f], i) => `<div class="li">${avatar(i + 2, 38)}<div class="t"><b>${n}</b><small>${p} · ${a} anos · ${f}</small></div><b class="g fd" style="font-size:19px">▲ +${3 - i}</b></div>`).join('')}</div>`)}`,
})
add('tatica', 'Tática', {
  nav: 'squad',
  body: `<h2 class="pt">Tática</h2>${sqTabs(5)}
  ${card(`<div class="row"><div class="col grow"><span class="s12 mu">Força do time na formação</span><b class="big g">77,4</b></div><div class="col grow tc" style="align-items:center"><span class="s12 mu">Formação</span><b class="fd" style="font-size:26px">4-3-3</b></div></div>`)}
  <div class="pills">${['4-3-3', '4-4-2', '3-5-2', '4-2-3-1', '5-3-2', 'Livre'].map((t, i) => `<button class="${i === 0 ? 'on' : ''}">${t}</button>`).join('')}</div>
  ${pitch3d({ xi: xiPlayers(), grid: true, sel: 8 })}
  <div class="note tc">Arraste cada jogador para onde quiser: ele encaixa no ponto mais perto. Ponto ocupado = os dois trocam. Os pontos da grade (26) aparecem durante o arrasto.</div>
  <div class="row"><span class="chip y">Livre · 3-5-2</span><span class="note grow">Formação livre: perfil do time e custo calculados pelo motor.</span></div>
  ${card(`<h4>Estilo de jogo</h4><div class="pills" style="flex-wrap:wrap">${['Toque de bola', 'Contra-ataque', 'Pressão total', 'Lançamento direto', 'Jogar pelas pontas'].map((t, i) => `<button class="${i === 0 ? 'on' : ''}">${t}</button>`).join('')}</div><h4>Mentalidade</h4>${bar(60)}<div class="row between s12 mu"><span>Muito defensiva</span><b class="g">Equilibrada</b><span>Muito ofensiva</span></div>`)}
  ${card(`<h4>Capitão e cobradores</h4>${kv('Capitão', 'Baldassi ' + ic('chev', 14))}${kv('Pênaltis', 'Valadares ' + ic('chev', 14))}${kv('Faltas', 'Lemos ' + ic('chev', 14))}`)}
  ${card(`<div class="ch">${ic('users', 22)}<h3>Titulares e reservas</h3></div><div class="list">${XIP.slice(0, 4).map((p, i) => `<div class="li">${pos(['GOL', 'LD', 'ZAG', 'ZAG'][i])}<div class="t"><b>${['Heitor Brandão', 'Rafael Duarte', 'Mateus Reveres', 'Lucas Lyandro'][i]}</b><small>${i === 3 ? 'Indisponível · lesão' : 'Titular'}</small></div>${btn('Escolher…', 'd', null, 'xs')}</div>`).join('')}</div>`)}
  ${btn('Sugerir escalação automática', 'o', 'sliders', 'block')}`,
})
S.find((x) => x.slug === 'jogador-vender').body = S.find((x) => x.slug === 'jogador-detalhe').body
module.exports = S
