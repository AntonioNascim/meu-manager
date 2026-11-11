// Gera os mockups HTML (3 direções × 3 telas). Uso: node docs/redesign/mockups/build.cjs
// Os mockups são estáticos (sem o jogo), só para comparar identidade visual.
const fs = require('fs')
const path = require('path')
const out = __dirname

const DIRS = {
  figurinha: { name: 'Figurinha', fonts: 'family=Bowlby+One&family=Nunito:wght@500;700;900' },
  prancheta: { name: 'Prancheta', fonts: 'family=Space+Grotesk:wght@400;600;700&family=JetBrains+Mono:wght@500;700' },
  tabloide: { name: 'Tabloide', fonts: 'family=Anton&family=Archivo:wght@500;700;800' },
}

// ---------- peças ----------
const ICONS = {
  home: '<path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  squad: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.5 2.7-6 6-6s6 2.5 6 6"/><circle cx="17" cy="9" r="2.5"/><path d="M17 14c2.5 0 4 1.8 4 4.5"/>',
  market: '<path d="M4 9l2-5h12l2 5"/><path d="M4 9h16v11H4z"/><path d="M9 20v-6h6v6"/>',
  table: '<path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/>',
  finance: '<circle cx="12" cy="12" r="9"/><path d="M12 7v10M9.5 9.5c0-1.2 1.2-2 2.5-2s2.5.8 2.5 2c0 3-5 1.5-5 4.5 0 1.2 1.2 2 2.5 2s2.5-.8 2.5-2"/>',
  lineup: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 12h18"/><circle cx="12" cy="12" r="2.5"/>',
  tactics: '<path d="M5 5l6 6M11 5l-6 6"/><circle cx="17" cy="17" r="3"/><path d="M6 19c4 0 7-3 7-7"/>',
  sprout: '<path d="M12 21v-9"/><path d="M12 12C12 8 9 6 5 6c0 4 2 6 7 6zM12 14c0-3 2-5 6-5 0 3-2 5-6 5z"/>',
  dumbbell: '<path d="M6 8v8M3 10v4M18 8v8M21 10v4M6 12h12"/>',
  contract: '<path d="M6 3h9l4 4v14H6z"/><path d="M9 12h7M9 16h5"/>',
  history: '<path d="M4 12a8 8 0 1 0 3-6.2"/><path d="M4 4v4h4M12 8v4l3 2"/>',
  heart: '<path d="M12 20s-8-5-8-11a4.5 4.5 0 0 1 8-2.5A4.5 4.5 0 0 1 20 9c0 6-8 11-8 11z"/>',
  bell: '<path d="M6 17V11a6 6 0 0 1 12 0v6l2 2H4z"/><path d="M10 21h4"/>',
  cloud: '<path d="M7 18a4 4 0 0 1-.5-8A6 6 0 0 1 18 11a3.5 3.5 0 0 1 0 7z"/>',
  play: '<path d="M7 4l13 8-13 8z"/>',
  pause: '<path d="M7 4h4v16H7zM13 4h4v16h-4z"/>',
  ffwd: '<path d="M4 5l8 7-8 7zM12 5l8 7-8 7z"/>',
  chev: '<path d="M9 5l7 7-7 7"/>',
  ball: '<circle cx="12" cy="12" r="9"/><path d="M12 7l4 3-1.5 5h-5L8 10z"/>',
  card: '<rect x="7" y="4" width="10" height="16" rx="1.5"/>',
  swap: '<path d="M4 8h14l-3-3M20 16H6l3 3"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.5 3.5-7 8-7s8 2.5 8 7"/>',
  star: '<path d="M12 3l2.8 5.8 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.3l1-6.2L3 9.7l6.2-.9z"/>',
}
const icon = (n, s = 22) => `<svg class="ic" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n]}</svg>`

const TEAMS = {
  IMP: { name: 'Imperial FC', short: 'Imperial', c1: '#12356b', c2: '#f2b705', ink: '#f2b705' },
  SER: { name: 'Atlético Serrano', short: 'Serrano', c1: '#c8102e', c2: '#151515', ink: '#ffffff' },
}
// escudo gerado (nunca oficial): formas diferentes por time
const crest = (k, size = 56) => {
  const t = TEAMS[k]
  const shape = k === 'IMP' ? 'M32 4 58 12v20c0 14-10 24-26 30C16 56 6 46 6 32V12z' : 'M32 4 60 18 54 48 32 62 10 48 4 18z'
  return `<svg class="crest" width="${size}" height="${size}" viewBox="0 0 64 66" aria-hidden="true"><path d="${shape}" fill="${t.c1}" stroke="rgba(0,0,0,.35)" stroke-width="2"/><path d="${k === 'IMP' ? 'M6 30h52v10H6z' : 'M4 28 60 28 58 40 6 40z'}" fill="${t.c2}" opacity=".95"/><text x="32" y="${k === 'IMP' ? 38.5 : 38}" text-anchor="middle" font-family="Arial Black,Arial,sans-serif" font-weight="900" font-size="12" fill="${k === 'IMP' ? '#12356b' : '#fff'}">${k}</text></svg>`
}
const dots = (s) => `<span class="form">${[...s].map((c) => `<i class="r-${c}">${c === 'W' ? 'V' : c === 'D' ? 'E' : 'D'}</i>`).join('')}</span>`
const nav = (active) =>
  `<nav class="nav" aria-label="Principal">${[['home', 'Clube'], ['squad', 'Elenco'], ['market', 'Mercado'], ['table', 'Tabela'], ['finance', 'Finanças']]
    .map(([i, l]) => `<button class="${i === active ? 'on' : ''}${l === 'Elenco' || l === 'Mercado' ? ' alert' : ''}" type="button">${icon(i, 24)}<span>${l}</span></button>`)
    .join('')}</nav>`
const shell = (dir, title, body, extra = '') => `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${DIRS[dir].name} · ${title}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?${DIRS[dir].fonts}&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../${dir}.css"></head>
<body class="${dir}"><div class="app">${body}</div><script src="../mock.js"></script>${extra}</body></html>`

// ---------- campo (SVG) ----------
function pitch() {
  const lines = `<rect x="4" y="4" width="202" height="128" rx="1"/><path d="M105 4v128"/><circle cx="105" cy="68" r="14"/><rect x="4" y="38" width="28" height="60"/><rect x="178" y="38" width="28" height="60"/><rect x="4" y="54" width="10" height="28"/><rect x="196" y="54" width="10" height="28"/><circle cx="105" cy="68" r="1.2"/>`
  const home = [[16, 68, 1], [50, 28, 2], [50, 54, 4], [50, 82, 5], [50, 108, 3], [82, 40, 8], [78, 68, 6], [82, 96, 10], [118, 30, 7], [128, 68, 9], [118, 106, 11]]
  const away = [[194, 68, 1], [162, 26, 2], [162, 52, 4], [162, 84, 5], [162, 110, 3], [138, 30, 7], [140, 56, 8], [140, 80, 6], [138, 106, 11], [124, 52, 9], [124, 84, 10]]
  const pl = (arr, cls) => arr.map(([x, y, n], i) => `<g class="pl ${cls}" style="--d:${(i * 0.13).toFixed(2)}s" transform="translate(${x} ${y})"><circle r="5.2"/><text y="2.1" text-anchor="middle">${n}</text></g>`).join('')
  return `<svg class="pitch" viewBox="0 0 210 136" role="img" aria-label="Campo da partida">
  <g class="grass">${[0, 1, 2, 3, 4, 5, 6, 7].map((i) => `<rect x="${4 + i * 25.25}" y="4" width="25.25" height="128" class="${i % 2 ? 'g1' : 'g2'}"/>`).join('')}</g>
  <g class="lines">${lines}</g>
  <path class="pass" d="M82 96 Q104 90 118 106" /><path class="shot" d="M128 68 L190 66"/>
  ${pl(home, 'home')}${pl(away, 'away')}
  <g class="ball"><circle r="2.6"/></g>
  <g class="mark"><circle cx="190" cy="66" r="7"/></g></svg>`
}

// ---------- telas ----------
function menu(dir) {
  const D = dir
  const body = `
  <div class="banner pwa"><span>Há uma versão nova do jogo.</span><button class="btn mini">Atualizar</button></div>
  <header class="hero-logo">
    <div class="logo-mark" aria-hidden="true">${icon('ball', 44)}</div>
    <h1>Meu Manager</h1>
    <p class="tag">Jogo de técnico de futebol</p>
  </header>
  <main class="stack">
    <section class="card continue">
      <div class="eyebrow">Continuar</div>
      <div class="slot">${crest('IMP', 52)}<div class="slot-t"><b>Imperial FC</b><small>Série A · Temporada 2026 · Rodada 14</small><small>6º lugar · salvo há 2 min</small></div><span class="chip ok">${icon('cloud', 14)} Na nuvem</span></div>
      <button class="btn primary big full">${icon('play', 18)} Continuar</button>
    </section>
    <div class="grid2">
      <button class="btn secondary">Novo jogo</button>
      <button class="btn secondary">Carregar</button>
    </div>
    <button class="btn secondary full">Novo jogo com pacote de dados</button>
    <div class="grid2">
      <button class="btn secondary">Editor</button>
      <button class="btn secondary">Importar save</button>
    </div>
    <button class="note-strip" type="button"><span>Guarde o seu código de recuperação: sem ele, trocar de aparelho faz perder a conta.</span><b>Ver</b></button>
    <section class="card online">
      <div class="eyebrow">Online</div>
      <div class="acct">${icon('user', 26)}<div><b>Treinador_Zé</b><small>Conta online · criada em 03/09/2026</small></div></div>
      <div class="list-btns">
        <button class="row-btn">Ligas online ${icon('chev', 16)}</button>
        <button class="row-btn">Saves na nuvem (2 de 3) ${icon('chev', 16)}</button>
        <button class="row-btn">Código de recuperação ${icon('chev', 16)}</button>
        <button class="row-btn">Dados e conta ${icon('chev', 16)}</button>
      </div>
      <p class="small">Sem conta? <u>Criar minha conta online</u> · <u>Entrar com o código de recuperação</u></p>
    </section>
    <div class="grid2">
      <button class="btn ghost">Créditos e avisos</button>
      <button class="btn ghost">Relatar problema</button>
    </div>
  </main>`
  return shell(D, 'Menu inicial', body)
}

function dashboard(dir) {
  const notices = [
    ['bell', 'Proposta recebida por Davi Luz', 'Mercado › Propostas', 'hot'],
    ['contract', '3 contratos no último ano', 'Contratos', ''],
    ['sprout', '4 jovens novos na base', 'Elenco › Base', ''],
  ]
  const tiles = [['squad', 'Elenco', 'a'], ['lineup', 'Escalação', 'b'], ['tactics', 'Tática', 'c'], ['sprout', 'Base', 'a'], ['dumbbell', 'Treino', 'd'], ['market', 'Mercado', 'd'], ['contract', 'Contratos', 'e'], ['finance', 'Finanças', 'b'], ['table', 'Tabela', 'c'], ['history', 'Histórico', 'e']]
  const mini = [
    [4, 'Fluvial EC', 23, 'WWDWL'], [5, 'Costa Azul', 22, 'LWWDW'], [6, 'Imperial FC', 21, 'WDWWL', 1], [7, 'União Paulista', 20, 'DLWDD'], [8, 'Real Sertão', 19, 'LLDWW'],
  ]
  const body = `
  <header class="topbar"><div class="brand">Meu Manager <small class="save">· salvo</small></div><button class="menu-btn">Menu</button></header>
  <main class="stack pad">
    <section class="notices" aria-label="Avisos">
      <div class="eyebrow">Avisos <span class="count">3</span></div>
      ${notices.map(([i, t, to, h]) => `<button class="notice ${h}">${icon(i, 20)}<span><b>${t}</b><small>${to}</small></span>${icon('chev', 16)}</button>`).join('')}
    </section>

    <section class="card hero next">
      <div class="eyebrow">Próximo jogo</div>
      <div class="meta">Série A · Rodada 14 · sáb., 9 mai · em casa</div>
      <div class="versus">
        <div class="side">${crest('IMP', 64)}<b>Imperial</b><small>6º · 21 pts</small>${dots('WDWWL')}</div>
        <div class="vs"><span>x</span><small>16h</small></div>
        <button class="side opp" aria-label="Ver a página do Atlético Serrano">${crest('SER', 64)}<b>Serrano</b><small>9º · 18 pts</small>${dots('LDWLD')}<em class="tap">toque para ver o time</em></button>
      </div>
      <div class="opp-line"><span>Força <b>74,2</b> <i>x</i> <b>71,8</b></span><span>Serrano costuma jogar em <b>4-4-2 · Contra-ataque</b></span></div>
      <div class="cond">${icon('heart', 18)} Condição média dos titulares <b>93</b><span class="bar"><i style="width:93%"></i></span></div>
      <button class="link">Ver tática e escalação provável ${icon('chev', 14)}</button>
      <button class="btn primary big full go">Avançar</button>
    </section>

    <section class="tiles" data-testid="shortcuts">
      ${tiles.map(([i, l, t], n) => `<button class="tile t-${t}">${icon(i, 24)}<span>${l}</span>${[0, 5, 6].includes(n) ? '<em class="dot"></em>' : ''}</button>`).join('')}
    </section>

    <section class="card">
      <div class="card-h"><div class="eyebrow">Classificação</div><button class="link">Ver tabela ${icon('chev', 14)}</button></div>
      <table class="mini"><thead><tr><th></th><th>Time</th><th>Pts</th><th>Forma</th></tr></thead><tbody>
      ${mini.map(([p, n, pts, f, me]) => `<tr class="${me ? 'me' : ''}"><td>${p}</td><td>${n}</td><td>${pts}</td><td>${dots(f)}</td></tr>`).join('')}
      </tbody></table>
      <div class="last5"><small>Seus últimos jogos</small>
        <span class="mm w">V 2–0</span><span class="mm d">E 1–1</span><span class="mm w">V 3–1</span><span class="mm w">V 1–0</span><span class="mm l">D 0–2</span></div>
    </section>

    <section class="card">
      <div class="card-h"><div class="eyebrow">Copas</div><button class="link">Ver chaveamento ${icon('chev', 14)}</button></div>
      <p class="cup"><b>Copa Nacional</b> · oitavas de final, ida em 20 mai</p>
      <div class="path"><i class="done"></i><i class="done"></i><i class="now"></i><i></i><i></i></div>
    </section>

    <section class="card">
      <div class="eyebrow">Destaques do elenco</div>
      <div class="hl">
        <div><small>Artilheiro</small><b>Caio Mendes</b><span>9 gols</span></div>
        <div><small>Garçom</small><b>Léo Ramos</b><span>6 assist.</span></div>
        <div><small>Nota média</small><b>Davi Luz</b><span>7,4</span></div>
      </div>
    </section>

    <section class="card inline"><div><div class="eyebrow">Treino</div><b>Normal · equilibrado</b></div><button class="btn mini">Mudar</button></section>

    <section class="card">
      <div class="eyebrow">Último jogo</div>
      <div class="lastm"><span>Imperial</span><b>2 – 0</b><span>Real Sertão</span></div>
      <small class="muted">Caio Mendes 23' · Léo Ramos 71' · sem cartões</small>
    </section>

    <section class="card board">
      <div class="card-h"><div class="eyebrow">Diretoria</div><span class="chip ok">Tranquila</span></div>
      <div class="metag">Meta: <b>8º</b> lugar</div>
      <small class="muted">Abaixo do 15º lugar você é demitido.</small>
      <div class="conf"><span>Confiança da diretoria</span><span class="bar"><i style="width:72%"></i></span></div>
    </section>

    <section class="card budget">
      <div class="eyebrow">Orçamento</div>
      <div class="money"><b>R$ 48,3 mi</b><small>em caixa · R$ 9,1 mi para transferências</small></div>
      <div class="bar"><i style="width:61%"></i></div><small class="muted">Folha de salários: 61% do orçamento</small>
    </section>
    <button class="btn ghost full">Relatar problema</button>
  </main>
  ${nav('home')}`
  return shell(dir, 'Painel do clube', body)
}

function match(dir) {
  const log = [
    ["34'", 'GOL! Caio Mendes cabeceia no canto depois de cruzamento de Léo Ramos.', 'goal'],
    ["31'", 'Defesa difícil do goleiro do Serrano em chute de fora da área.', ''],
    ["27'", 'Cartão amarelo para Pedro Cunha (Serrano) por entrada dura.', 'yel'],
    ["19'", 'Escanteio para o Imperial.', ''],
    ["8'", 'Chance do Serrano: finalização para fora.', ''],
  ]
  const stats = [['Posse de bola', 56, 44], ['Finalizações', 7, 4], ['No alvo', 3, 1], ['Escanteios', 4, 2], ['xG', '1,12', '0,48']]
  const body = `
  <header class="topbar"><div class="brand">${crest('IMP', 30)}<span>Imperial FC<small>sáb., 9 mai</small></span></div><button class="menu-btn">Menu</button></header>
  <main class="stack pad">
    <section class="score">
      <button class="steam home">${crest('IMP', 52)}<b>Imperial</b></button>
      <div class="mid"><div class="goals"><span class="g">1</span><span class="sep">–</span><span class="g">0</span></div><div class="clock"><i class="live"></i><span id="min">34'</span> · 1º tempo</div></div>
      <button class="steam away" aria-label="Ver o Serrano">${crest('SER', 52)}<b>Serrano</b></button>
      <button class="speed" type="button" aria-label="Velocidade"><span>2x</span></button>
    </section>
    <div class="ctrl"><button class="btn primary">${icon('pause', 16)} Pausar</button><button class="btn secondary">${icon('ffwd', 16)} Ir ao fim</button></div>
    <div class="pitch-wrap">${pitch()}<div class="toast"><b>GOL!</b> Caio Mendes · 34'</div></div>
    <div class="tabs" role="tablist"><button class="on">Jogos</button><button>Dados</button><button>Tática</button><button>Trocas</button></div>
    <section class="card stats">
      ${stats.map(([l, a, b]) => { const n = typeof a === 'number' ? a + b : parseFloat(String(a).replace(',', '.')) + parseFloat(String(b).replace(',', '.')); const pa = typeof a === 'number' ? (a / n) * 100 : (parseFloat(String(a).replace(',', '.')) / n) * 100; return `<div class="st"><b>${a}${l === 'Posse de bola' ? '%' : ''}</b><span class="lbl">${l}</span><b>${b}${l === 'Posse de bola' ? '%' : ''}</b><span class="vs-bar"><i style="width:${pa.toFixed(0)}%"></i></span></div>` }).join('')}
    </section>
    <section class="card others"><div class="eyebrow">Outros jogos da rodada</div>
      <div class="og"><span>Fluvial EC</span><b>1 – 1</b><span>Costa Azul</span></div>
      <div class="og hot"><span>União Paulista</span><b>0 – 1</b><span>Real Sertão</span></div>
    </section>
    <section class="log" aria-label="Lances ao vivo">
      <div class="card-h"><div class="eyebrow">Lances ao vivo</div><label class="sw"><input type="checkbox"><i></i> Mostrar faltas</label></div>
      ${log.map(([m, t, k]) => `<div class="ev ${k}"><span class="m">${m}</span><p>${t}</p></div>`).join('')}
    </section>
  </main>
  ${nav('home')}`
  return shell(dir, 'Partida ao vivo', body)
}

const SCREENS = { menu, painel: dashboard, partida: match }
for (const d of Object.keys(DIRS)) {
  fs.mkdirSync(path.join(out, d), { recursive: true })
  for (const [n, fn] of Object.entries(SCREENS)) fs.writeFileSync(path.join(out, d, `${n}.html`), fn(d))
}
console.log('ok')
