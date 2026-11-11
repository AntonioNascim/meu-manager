// Peças comuns dos mockups finais (HTML estático). Escudos, camisas e rostos são GERADOS (nada oficial).
const ICONS = {
  home: '<path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  trophy: '<path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H4v2a3 3 0 0 0 3 3M17 6h3v2a3 3 0 0 1-3 3M12 14v4M8 21h8M9 18h6"/>',
  users: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.5 2.7-6 6-6s6 2.5 6 6"/><circle cx="17" cy="9" r="2.5"/><path d="M17 14c2.5 0 4 1.8 4 4.5"/>',
  swap: '<path d="M4 8h14l-3-3M20 16H6l3 3"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>',
  wallet: '<path d="M3 7a2 2 0 0 1 2-2h13v4"/><path d="M3 7v11a2 2 0 0 0 2 2h15V9H5a2 2 0 0 1-2-2z"/><circle cx="16" cy="14.5" r="1.3"/>',
  cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.5 3.5-7 8-7s8 2.5 8 7"/>',
  chart: '<path d="M4 20V11M10 20V4M16 20v-7M22 20H2"/>',
  shirt: '<path d="M8 3L3 6l2 5 3-1v11h8V10l3 1 2-5-5-3c-1 2-2 3-4 3S9 5 8 3z"/>',
  news: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9h6M7 13h10M7 16h10"/>',
  play: '<path d="M7 4l13 8-13 8z"/>',
  pause: '<path d="M7 4h4v16H7zM13 4h4v16h-4z"/>',
  ffwd: '<path d="M4 5l8 7-8 7zM12 5l8 7-8 7z"/>',
  chev: '<path d="M9 5l7 7-7 7"/>',
  left: '<path d="M15 5l-7 7 7 7"/>',
  down: '<path d="M5 9l7 7 7-7"/>',
  up: '<path d="M5 15l7-7 7 7"/>',
  check: '<path d="M4 12l5 5L20 6"/>',
  x: '<path d="M5 5l14 14M19 5L5 19"/>',
  plus: '<path d="M12 4v16M4 12h16"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  filter: '<path d="M4 5h16l-6 8v6l-4-2v-4z"/>',
  star: '<path d="M12 3l2.8 5.8 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.3l1-6.2L3 9.7l6.2-.9z"/>',
  cloud: '<path d="M7 18a4 4 0 0 1-.5-8A6 6 0 0 1 18 11a3.5 3.5 0 0 1 0 7z"/>',
  folder: '<path d="M3 6a2 2 0 0 1 2-2h4l2 3h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  down2: '<path d="M12 4v11M7 11l5 5 5-5M4 20h16"/>',
  up2: '<path d="M12 16V5M7 9l5-5 5 5M4 20h16"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  bell: '<path d="M6 17V11a6 6 0 0 1 12 0v6l2 2H4z"/><path d="M10 21h4"/>',
  alert: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.5"/>',
  clip: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1M9 10l3 3M12 10l-3 3M9 17h6"/>',
  dollar: '<circle cx="12" cy="12" r="9"/><path d="M12 6v12M9.5 9c0-1.2 1.2-2 2.5-2s2.5.8 2.5 2c0 3-5 1.5-5 4.5 0 1.2 1.2 2 2.5 2s2.5-.8 2.5-2"/>',
  sprout: '<path d="M12 21v-9"/><path d="M12 12C12 8 9 6 5 6c0 4 2 6 7 6zM12 14c0-3 2-5 6-5 0 3-2 5-6 5z"/>',
  dumb: '<path d="M6 8v8M3 10v4M18 8v8M21 10v4M6 12h12"/>',
  doc: '<path d="M6 3h9l4 4v14H6z"/><path d="M9 12h7M9 16h5"/>',
  hist: '<path d="M4 12a8 8 0 1 0 3-6.2"/><path d="M4 4v4h4M12 8v4l3 2"/>',
  ball: '<circle cx="12" cy="12" r="9"/><path d="M12 7l4 3-1.5 5h-5L8 10z"/>',
  card: '<rect x="7" y="4" width="10" height="16" rx="1.5"/>',
  med: '<path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  share: '<circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8.2 11l7.6-4M8.2 13l7.6 4"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  flag: '<path d="M5 21V4M5 4h12l-2 4 2 4H5"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>',
  sliders: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 7 9-7"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  send: '<path d="M21 3L10 14M21 3l-7 18-4-7-7-4z"/>',
  stad: '<ellipse cx="12" cy="9" rx="9" ry="4"/><path d="M3 9v6c0 2.2 4 4 9 4s9-1.8 9-4V9M3 12c0 2.2 4 4 9 4s9-1.8 9-4"/>',
  sort: '<path d="M7 4v16M7 20l-3-3M7 20l3-3M17 20V4M17 4l-3 3M17 4l3 3"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  whistle: '<circle cx="9" cy="14" r="5"/><path d="M13 11l8-4v4l-6 2M9 10V8"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
  crown: '<path d="M3 8l4 4 5-7 5 7 4-4-2 11H5z"/>',
  key: '<circle cx="8" cy="14" r="4"/><path d="M11 11l9-8M16 6l3 3"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  grid: '<rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="4" width="7" height="7" rx="1"/><rect x="4" y="13" width="7" height="7" rx="1"/><rect x="13" y="13" width="7" height="7" rx="1"/>',
  undo: '<path d="M9 7L4 12l5 5M4 12h11a5 5 0 0 1 0 10"/>',
  redo: '<path d="M15 7l5 5-5 5M20 12H9a5 5 0 0 0 0 10"/>',
  table: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M3 15h18M9 4v16"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  hand: '<path d="M7 11V6a1.5 1.5 0 0 1 3 0v4M10 10V4.5a1.5 1.5 0 0 1 3 0V10M13 10V5.5a1.5 1.5 0 0 1 3 0V12M16 9a1.5 1.5 0 0 1 3 0v5c0 4-2 7-6 7-3 0-4-1.5-6-4l-2-3 1.5-1L7 15"/>',
}
const ic = (n, s = 22, extra = '') => `<svg class="ic" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${ICONS[n] || ''}</svg>`

// ---------- times fictícios ----------
const T = {
  SER: { name: 'Atlético Serrano', short: 'Atlético-SE', ab: 'ASE', c1: '#f4f4f4', c2: '#111', style: 'stripes', star: true },
  IMP: { name: 'Imperial FC', short: 'Imperial', ab: 'IMP', c1: '#12356b', c2: '#f2b705', style: 'band' },
  RCA: { name: 'Rubro Carioca', short: 'Rubro', ab: 'RCA', c1: '#d4161c', c2: '#111', style: 'hoops' },
  VPA: { name: 'Verde Paulista', short: 'Verde', ab: 'VPA', c1: '#0e8f3a', c2: '#fff', style: 'solid' },
  RCE: { name: 'Raposa Celeste', short: 'Raposa', ab: 'RCE', c1: '#2b6fd6', c2: '#fff', style: 'half' },
  TGA: { name: 'Tricolor Gaúcho', short: 'Tricolor', ab: 'TGA', c1: '#3ea0ff', c2: '#111', style: 'stripes' },
  LDM: { name: 'Leão do Mar', short: 'Leão', ab: 'LDM', c1: '#1f4fb0', c2: '#d4161c', style: 'half' },
  ENO: { name: 'Estrela do Norte', short: 'Estrela', ab: 'ENO', c1: '#111', c2: '#f2f2f2', style: 'band' },
  VVA: { name: 'Vitória do Vale', short: 'Vitória', ab: 'VVA', c1: '#c8102e', c2: '#111', style: 'half' },
  POA: { name: 'Porto Azul', short: 'Porto', ab: 'POA', c1: '#0a3d8f', c2: '#fff', style: 'hoops' },
}
let uid = 0
const crest = (k, s = 44, star) => {
  const t = typeof k === 'string' ? T[k] : k
  const id = 'c' + ++uid
  let fill = ''
  if (t.style === 'stripes') fill = [0, 1, 2, 3, 4].map((i) => `<rect x="${4 + i * 6.4}" y="0" width="3.2" height="50" fill="${t.c2}"/>`).join('')
  else if (t.style === 'band') fill = `<path d="M0 30L40 12v10L0 40z" fill="${t.c2}"/>`
  else if (t.style === 'hoops') fill = [0, 1, 2].map((i) => `<rect x="0" y="${12 + i * 12}" width="40" height="6" fill="${t.c2}"/>`).join('')
  else if (t.style === 'half') fill = `<rect x="20" y="0" width="20" height="50" fill="${t.c2}"/>`
  else fill = `<circle cx="20" cy="22" r="9" fill="${t.c2}" opacity=".9"/>`
  const light = ['#f4f4f4', '#fff', '#f2f2f2'].includes(t.c1)
  const ink = light ? '#111' : '#fff'
  const stroke = light ? '#111' : 'rgba(255,255,255,.85)'
  const sw = Math.round(s * 1.0)
  return `<svg class="ic crest" width="${sw}" height="${Math.round(sw * 1.28)}" viewBox="0 -6 40 52" aria-hidden="true"><defs><clipPath id="${id}"><path d="M3 3h34v21c0 9-7 15-17 19C10 39 3 33 3 24z"/></clipPath></defs><g clip-path="url(#${id})"><rect width="40" height="46" fill="${t.c1}"/>${fill}<rect y="0" width="40" height="13" fill="rgba(0,0,0,.35)"/></g><path d="M3 3h34v21c0 9-7 15-17 19C10 39 3 33 3 24z" fill="none" stroke="${stroke}" stroke-width="1.6"/><text x="20" y="10.5" font-family="Barlow Condensed" font-weight="800" font-size="8.5" text-anchor="middle" fill="#fff" letter-spacing=".6">${t.ab}</text>${star || t.star === true && star !== false ? `<path d="M20 -2l1.6 3.3 3.6.5-2.6 2.5.6 3.5-3.2-1.7-3.2 1.7.6-3.5-2.6-2.5 3.6-.5z" fill="#f2b705" transform="translate(0,-4)"/>` : ''}</svg>`
}
const crestStar = (k, s = 44) => crest(k, s, true)
const jersey = (k, n = '', s = 38, gk) => {
  const t = gk ? { c1: '#16c06a', c2: '#0b6d3b', style: 'solid' } : T[k]
  const id = 'j' + ++uid
  let f = ''
  if (t.style === 'stripes') f = [0, 1, 2, 3, 4, 5].map((i) => `<rect x="${3 + i * 6.4}" y="0" width="3.2" height="40" fill="${t.c2}"/>`).join('')
  else if (t.style === 'band') f = `<path d="M0 30L40 14v8L0 38z" fill="${t.c2}"/>`
  else if (t.style === 'hoops') f = [0, 1, 2].map((i) => `<rect x="0" y="${10 + i * 9}" width="40" height="4.5" fill="${t.c2}"/>`).join('')
  else if (t.style === 'half') f = `<rect x="20" y="0" width="20" height="40" fill="${t.c2}"/>`
  return `<svg width="${s}" height="${Math.round(s * .9)}" viewBox="0 0 40 36" aria-hidden="true"><defs><clipPath id="${id}"><path d="M13 2L3 7l4 8 4-2v21h18V13l4 2 4-8-10-5c-1 3-3 4-7 4s-6-1-7-4z"/></clipPath></defs><g clip-path="url(#${id})"><rect width="40" height="36" fill="${t.c1}"/>${f}</g><path d="M13 2L3 7l4 8 4-2v21h18V13l4 2 4-8-10-5c-1 3-3 4-7 4s-6-1-7-4z" fill="none" stroke="rgba(0,0,0,.55)" stroke-width="1.3"/></svg>`
}
const SKINS = ['#c98f6a', '#8d5a3a', '#e0b08a', '#5e3a24', '#d6a07a', '#a8704a']
const avatar = (i = 0, s = 44, k = 'SER') => {
  const t = T[k]
  const id = 'a' + ++uid
  return `<svg class="avatar" width="${s}" height="${s}" viewBox="0 0 48 48" aria-hidden="true"><defs><clipPath id="${id}"><rect width="48" height="48" rx="10"/></clipPath><linearGradient id="${id}g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a3a40"/><stop offset="1" stop-color="#101a1d"/></linearGradient></defs><g clip-path="url(#${id})"><rect width="48" height="48" fill="url(#${id}g)"/><path d="M6 52c0-10 8-15 18-15s18 5 18 15z" fill="${t.c1}"/><path d="M6 52c0-10 8-15 18-15" fill="none"/><rect x="21" y="31" width="6" height="8" fill="${SKINS[i % 6]}"/><ellipse cx="24" cy="21" rx="8" ry="9.5" fill="${SKINS[i % 6]}"/><path d="M15.5 19c0-6 3.5-9 8.5-9s8.5 3 8.5 9c-2-3-5-4-8.5-4s-6.5 1-8.5 4z" fill="#1a1411"/></g></svg>`
}
const FL = { BR: ['#17a34a', '#f5d90a', '#17a34a'], AR: ['#74b6ef', '#fff', '#74b6ef'], UY: ['#fff', '#2b6fd6', '#fff'], CO: ['#f5d90a', '#f5d90a', '#2b6fd6'], PY: ['#d4161c', '#fff', '#2b6fd6'], CL: ['#fff', '#d4161c', '#2b6fd6'], PT: ['#0e8f3a', '#d4161c', '#d4161c'], ES: ['#d4161c', '#f5d90a', '#d4161c'], EN: ['#fff', '#d4161c', '#fff'], FR: ['#2b6fd6', '#fff', '#d4161c'], DE: ['#111', '#d4161c', '#f5d90a'], IT: ['#0e8f3a', '#fff', '#d4161c'], NL: ['#d4161c', '#fff', '#2b6fd6'] }
const flag = (c = 'BR') => `<span class="flag" style="background:linear-gradient(${['EN', 'ES', 'DE', 'NL', 'AR', 'UY'].includes(c) ? '180deg' : '90deg'},${FL[c][0]} 0 33%,${FL[c][1]} 33% 66%,${FL[c][2]} 66%)"></span>`
const stars = (n, of = 5) => `<span class="stars">${'★'.repeat(n)}<i>${'★'.repeat(of - n)}</i></span>`
const ovrC = (v) => (v >= 75 ? 'h' : v >= 60 ? 'm' : 'l')
const ovr = (v, big) => `<span class="ovr ${ovrC(v)}${big ? ' big' : ''}">${v}</span>`
const pos = (p) => `<span class="pos ${p}">${p}</span>`
const chip = (t, c = 'g', icon) => `<span class="chip ${c}">${icon ? ic(icon, 13) : ''}${t}</span>`
const bar = (p, c = '') => `<div class="bar ${c}"><i style="width:${p}%"></i></div>`
const mood = (m) => `<span class="face">${m >= 70 ? '🙂' : m >= 50 ? '😐' : '🙁'}</span>`
const cond = (p) => `<span class="cond"><i style="width:${p}%;${p < 70 ? 'background:var(--amb)' : ''}${p < 45 ? ';background:var(--red)' : ''}"></i></span>`
const rdots = (s) => s.split('').map((c) => `<span class="rdot ${c.toLowerCase()}"></span>`).join('')

// ---------- elenco fictício ----------
const SQUAD = [
  ['Heitor Brandão', 'GOL', 'Goleiro', 82, 31, 'BR', 100, 80], ['Caio Mendes', 'GOL', 'Goleiro', 66, 22, 'BR', 100, 72],
  ['Rafael Duarte', 'LD', 'Lateral Direito', 78, 27, 'BR', 96, 76], ['Jonas Pacheco', 'LD', 'Lateral Direito', 63, 20, 'BR', 100, 70],
  ['Mateus Reveres', 'ZAG', 'Zagueiro', 84, 29, 'BR', 100, 78], ['Lucas Lyandro', 'ZAG', 'Zagueiro', 81, 26, 'BR', 92, 74], ['Gabriel Sarmento', 'ZAG', 'Zagueiro', 72, 33, 'PT', 100, 66], ['Davi Rocha', 'ZAG', 'Zagueiro', 64, 19, 'BR', 100, 71],
  ['Gustavo Arantes', 'LE', 'Lateral Esquerdo', 80, 28, 'BR', 100, 77], ['Elias Prado', 'LE', 'Lateral Esquerdo', 62, 21, 'BR', 100, 70],
  ['Bruno Baldassi', 'VOL', 'Volante', 85, 30, 'AR', 100, 82], ['Orlando Cunha', 'VOL', 'Volante', 70, 25, 'BR', 88, 70],
  ['Otacílio Lemos', 'MEI', 'Meia', 86, 27, 'BR', 100, 84], ['Rômulo Saldanha', 'MEI', 'Meia', 79, 26, 'UY', 94, 76], ['Tiago Neves', 'MC', 'Meio-campista', 74, 24, 'BR', 100, 72], ['Kaique Ramos', 'MC', 'Meio-campista', 65, 20, 'BR', 100, 70],
  ['Hugo Valadares', 'ATA', 'Atacante', 88, 33, 'BR', 100, 90], ['Paulo Ferrão', 'ATA', 'Atacante', 86, 31, 'BR', 100, 85], ['Deivid Lira', 'ATA', 'Atacante', 83, 28, 'CO', 78, 74], ['Zeca Andrade', 'ATA', 'Atacante', 68, 19, 'BR', 100, 71],
  ['Marcelo Pimenta', 'PD', 'Ponta Direita', 76, 24, 'BR', 100, 75], ['Wesley Aguiar', 'PE', 'Ponta Esquerda', 75, 23, 'PY', 100, 72], ['Nando Bastos', 'LD', 'Lateral Direito', 58, 35, 'BR', 0, 55], ['Vítor Salgado', 'MC', 'Meio-campista', 60, 32, 'BR', 100, 58],
].map(([name, p, pn, o, age, c, cn, md], i) => ({ name, p, pn, o, age, c, cn, md, i }))
const byName = (n) => SQUAD.find((x) => x.name.includes(n))

// ---------- campo em perspectiva (Escalação, Tática, Trocas) ----------
const proj = (fx, fy, W, H) => {
  const k = 0.6 + 0.4 * fy
  return [W / 2 + (fx - 0.5) * W * k * 1.0, H * (0.04 + 0.92 * fy)]
}
const F433 = [[.5, .93, 'GOL'], [.88, .77, 'LD'], [.63, .8, 'ZAG'], [.37, .8, 'ZAG'], [.12, .77, 'LE'], [.5, .6, 'VOL'], [.8, .43, 'MEI'], [.2, .43, 'MEI'], [.84, .2, 'ATA'], [.5, .14, 'ATA'], [.16, .2, 'ATA']]
const pitch3d = ({ xi, kit = 'SER', grid = false, sel = -1, out = [], H = 360, labels = false, hideCond = true }) => {
  const W = 380
  const poly = (a) => a.map(([x, y]) => proj(x, y, W, H).map((n) => n.toFixed(1)).join(',')).join(' ')
  let bands = ''
  for (let i = 0; i < 8; i++) {
    const y0 = i / 8, y1 = (i + 1) / 8
    bands += `<polygon points="${poly([[0, y0], [1, y0], [1, y1], [0, y1]])}" fill="${i % 2 ? '#0f5a24' : '#0d6a29'}"/>`
  }
  const L = (a, extra = '') => `<polyline points="${poly(a)}" fill="none" stroke="rgba(255,255,255,.75)" stroke-width="1.6" ${extra}/>`
  const cc = proj(.5, .1, W, H), rx = W * 0.17 * (0.6 + 0.04), ry = 26
  const lines = L([[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]) + L([[0, .1], [1, .1]]) + L([[.22, 1], [.22, .8], [.78, .8], [.78, 1]]) + L([[.38, 1], [.38, .9], [.62, .9], [.62, 1]])
  let dots = '', lab = ''
  if (grid) {
    const rowsY = [.94, .76, .6, .45, .3, .16]
    const xs = [.12, .31, .5, .69, .88]
    rowsY.forEach((y, r) => xs.forEach((x) => { if (r === 0 && x !== .5) return; const [px, py] = proj(x, y, W, H); dots += `<div class="gp" style="left:${(px / W * 100).toFixed(2)}%;top:${(py / H * 100).toFixed(2)}%"></div>` }))
    ;['Goleiro', 'Defesa', 'Volância', 'Meio', 'Meia of.', 'Ataque'].forEach((n, r) => { const [, py] = proj(.5, rowsY[r], W, H); lab += `<div class="glab" style="top:${(py / H * 100 - 1.5).toFixed(2)}%">${n}</div>` })
  }
  const pls = xi.map((p, i) => {
    const [x, y, ps] = F433[i]
    const [px, py] = proj(x, y, W, H)
    return `<div class="pl${sel === i ? ' sel' : ''}${out.includes(i) ? ' out' : ''}" style="left:${(px / W * 100).toFixed(2)}%;top:${(py / H * 100).toFixed(2)}%"><div class="jy">${jersey(kit, '', 38, ps === 'GOL')}<b>${p.num}</b></div><div class="nm">${p.n}</div><div class="ps">${p.ps || ps}${hideCond ? '' : ' · ' + p.cn + '%'}</div></div>`
  }).join('')
  return `<div class="pitch3" style="aspect-ratio:${W}/${H}"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${bands}${lines}<ellipse cx="${cc[0]}" cy="${cc[1]}" rx="${rx}" ry="${ry}" fill="none" stroke="rgba(255,255,255,.7)" stroke-width="1.5" clip-path="inset(0 0 0 0)"/></svg>${dots}${lab}${pls}</div>`
}
const XI = [['Heitor', 1, 82], ['Rafael', 2, 78], ['Reveres', 3, 84], ['Lyandro', 4, 81], ['Arantes', 6, 80], ['Baldassi', 5, 85], ['Rômulo', 20, 79], ['Lemos', 10, 86], ['Pimenta', 7, 76], ['Valadares', 9, 88], ['Ferrão', 11, 86]]
const XIP = XI.map(([n, num, o], i) => ({ n, num, o, cn: [100, 96, 100, 92, 100, 100, 94, 100, 100, 100, 100][i] }))

// ---------- campo plano (partida ao vivo) ----------
const pitchFlat = ({ home = 'SER', away = 'IMP', ball = [.62, .42], mark, arrow, H = 220, pause }) => {
  const W = 380
  const X = (f) => (f * 100).toFixed(2) + '%'
  const hp = [[.04, .5], [.2, .15], [.18, .38], [.18, .62], [.2, .85], [.36, .5], [.45, .25], [.45, .75], [.66, .2], [.72, .5], [.66, .8]]
  const ap = [[.96, .5], [.8, .15], [.82, .38], [.82, .62], [.8, .85], [.64, .5], [.55, .3], [.55, .7], [.36, .22], [.3, .5], [.36, .78]]
  const dots = (arr, k, c1, c2, txt) => arr.map(([x, y], i) => `<div class="fp" style="left:${X(x)};top:${X(y)};background:${c1};color:${c2}">${i ? [2, 3, 4, 6, 5, 20, 10, 7, 9, 11][i - 1] : 1}</div>`).join('')
  const h = T[home], a = T[away]
  const hc = h.c1 === '#f4f4f4' ? '#e8e8e8' : h.c1
  return `<div class="flat" style="height:${H}px;margin:0 -14px;background:
    repeating-linear-gradient(90deg,#0d6a29 0 11.1%,#0f5a24 11.1% 22.2%)">
  <svg viewBox="0 0 380 ${H}" width="100%" height="${H}" preserveAspectRatio="none" style="position:absolute;inset:0"><g fill="none" stroke="rgba(255,255,255,.75)" stroke-width="1.5"><rect x="6" y="6" width="368" height="${H - 12}"/><path d="M190 6v${H - 12}"/><circle cx="190" cy="${H / 2}" r="26"/><rect x="6" y="${H / 2 - 44}" width="52" height="88"/><rect x="322" y="${H / 2 - 44}" width="52" height="88"/><rect x="6" y="${H / 2 - 20}" width="18" height="40"/><rect x="356" y="${H / 2 - 20}" width="18" height="40"/></g>${arrow ? `<path d="${arrow}" fill="none" stroke="#fff" stroke-width="2" stroke-dasharray="5 4" marker-end="url(#ah)"/><defs><marker id="ah" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="M0 0L8 4 0 8z" fill="#fff"/></marker></defs>` : ''}</svg>
  ${dots(hp, 'h', hc, h.c1 === '#f4f4f4' ? '#111' : '#fff')}${dots(ap, 'a', a.c1, '#fff')}
  <div class="ball" style="left:${X(ball[0])};top:${X(ball[1])}"></div>
  ${mark ? `<div class="mark" style="left:${X(mark[0])};top:${X(mark[1])}">${mark[2]}</div>` : ''}
  ${pause ? `<div style="position:absolute;right:10px;bottom:8px" class="chip m">${ic('pause', 12)} pausado</div>` : ''}</div>`
}

// ---------- blocos de tela ----------
const gameHeader = ({ save = 'salvo', club = 'SER' } = {}) => `<header class="gh">${crestStar(club, 50)}<div class="who"><b>${T[club].name}</b><span>Júlio César Pontes</span><small>${ic('user', 13)} Técnico · <i></i>${save}</small></div><div class="st"><div>${ic('wallet', 24)}<span><b>R$ 24.750.000</b><small>Saldo em caixa</small></span></div><div>${ic('cal', 24)}<span><b>17 Out 2026</b><small>Sáb · 21:00</small></span></div></div></header>`
const NAV = [['home', 'Início', 'home'], ['comp', 'Competições', 'trophy'], ['squad', 'Elenco', 'users'], ['market', 'Transferências', 'swap'], ['more', 'Mais', 'gear']]
const nav = (on, alerts = []) => `<nav class="nav">${NAV.map(([k, l, i]) => `<button class="${k === on ? 'on' : ''}">${ic(i, 26)}${l}${alerts.includes(k) ? '<span class="alert"></span>' : ''}</button>`).join('')}</nav>`
const topbar = (title, back = 'Voltar') => `<div class="tb"><button class="back">${ic('left', 20)}${back}</button><h2>${title}</h2></div>`
const tabs = (items, on = 0, cls = '') => `<div class="tabs ${cls}">${items.map((t, i) => `<button class="${i === on ? 'on' : ''}">${t}</button>`).join('')}</div>`
const pills = (items, on = 0) => `<div class="pills">${items.map((t, i) => `<button class="${i === on ? 'on' : ''}">${t}</button>`).join('')}</div>`
const card = (inner, cls = '') => `<section class="card ${cls}">${inner}</section>`
const ch = (icon, title, right = '') => `<div class="ch">${icon ? ic(icon, 22) : ''}<h3>${title}</h3>${right}</div>`
const lnk = (t) => `<span class="lnk">${t} ${ic('chev', 14)}</span>`
const btn = (t, c = 'p', icon, extra = '') => `<button class="btn ${c} ${extra}">${icon ? ic(icon, 20) : ''}${t}</button>`
const kv = (k, v) => `<div class="kv"><span>${k}</span><b>${v}</b></div>`
const field = (label, v, ph, foc) => `<div class="field"><label>${label}</label><div class="inp ${ph ? 'ph' : ''} ${foc ? 'foc' : ''}">${v}</div></div>`
const check = (t, on) => `<div class="check"><i class="${on ? 'on' : ''}">${on ? ic('check', 15) : ''}</i><span>${t}</span></div>`
const sw = (t, on, sub = '') => `<div class="row between"><div class="col"><b style="font-weight:600">${t}</b>${sub ? `<small class="mu s12">${sub}</small>` : ''}</div><span class="sw ${on ? 'on' : ''}"></span></div>`
const radio = (t, on, sub = '') => `<div class="radio ${on ? 'on' : ''}"><i></i><div class="col"><b style="font-weight:600">${t}</b>${sub ? `<small class="mu s12">${sub}</small>` : ''}</div></div>`
const sheet = (title, body) => `<div class="scrim"></div><div class="sheet"><div class="sh"><h3>${title}</h3><button class="xbtn">${ic('x', 20)}</button></div>${body}</div>`

// página completa
const page = ({ title, nav: nv, header = true, club = 'SER', body, over = '', offline, blocked, alerts = [], save, pre }) => `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><link rel="stylesheet" href="../style.css"></head><body><div class="app${over ? ' clip' : ''}">${offline ? `<div class="offline">${ic('alert', 18)}Sem conexão: você vê o último estado da liga. As ações voltam quando a internet voltar.</div>` : ''}${blocked ? `<div class="blocked">Esta ação ainda não está disponível na liga online.</div>` : ''}${header ? gameHeader({ save, club }) : ''}${pre || ''}<main class="body ${over ? 'under' : ''}">${body}</main>${nv ? nav(nv, alerts) : ''}${over}</div><script src="../mock.js"></script></body></html>`

module.exports = { ic, T, crest, crestStar, jersey, avatar, flag, stars, ovr, pos, chip, bar, mood, cond, rdots, SQUAD, byName, pitch3d, pitchFlat, XIP, gameHeader, nav, topbar, tabs, pills, card, ch, lnk, btn, kv, field, check, sw, radio, sheet, page, SKINS }
