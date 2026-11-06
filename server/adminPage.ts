/** A página do painel de moderação (B9): HTML e JavaScript puros, sem bibliotecas. Todo texto que vem do servidor entra por `textContent` (apelidos são de gente). */
export const ADMIN_PAGE = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>Meu Manager — moderação</title>
<style>
body{font:15px/1.4 system-ui,sans-serif;background:#0b1020;color:#e5e7eb;margin:0;padding:16px;max-width:900px;margin-inline:auto}
h1{font-size:20px;margin:0 0 12px} h2{font-size:16px;margin:24px 0 8px;color:#a3e635}
input,button,select{font:inherit;padding:8px 10px;border-radius:8px;border:1px solid #334155;background:#111827;color:inherit}
button{cursor:pointer;background:#1e293b} button.danger{border-color:#b91c1c;color:#fca5a5} button.ok{border-color:#4d7c0f;color:#bef264}
table{width:100%;border-collapse:collapse} td,th{padding:6px 8px;border-bottom:1px solid #1f2937;text-align:left;vertical-align:top} th{color:#94a3b8;font-weight:600}
.row{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:8px 0} .muted{color:#94a3b8} .err{color:#fca5a5} code{font-size:12px;color:#93c5fd;word-break:break-all}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px} .card{background:#111827;border:1px solid #1f2937;border-radius:10px;padding:10px} .card b{display:block;font-size:22px}
</style></head><body>
<h1>Moderação</h1>
<div class="row"><input id="token" type="password" placeholder="Segredo do painel" size="34" autocomplete="off"><button id="enter">Entrar</button><span id="msg" class="muted"></span></div>
<div id="app" hidden>
<div class="cards" id="cards"></div>
<h2>Denúncias abertas</h2><table id="reports"></table>
<h2>Ligas escondidas</h2><table id="hidden"></table>
<h2>Banidos</h2><table id="bans"></table>
<h2>Ações por identificador</h2>
<div class="row"><input id="pid" placeholder="playerId (43 letras)" size="46"><input id="why" placeholder="motivo do banimento" size="26">
<button class="danger" data-act="ban">Banir</button><button data-act="unban">Desbanir</button><button data-act="reset-nickname">Trocar apelido à força</button></div>
<div class="row"><input id="lid" placeholder="id da liga" size="20"><button data-act="hide-league">Esconder</button><button data-act="show-league">Mostrar</button><button class="danger" data-act="close-league">Fechar</button></div>
</div>
<script>
const $ = (id) => document.getElementById(id)
const tokenBox = $('token'); tokenBox.value = sessionStorage.getItem('mm-admin') || ''
const say = (t, bad) => { $('msg').textContent = t; $('msg').className = bad ? 'err' : 'muted' }
async function api(path, body) {
  const res = await fetch('/admin/api/' + path, { method: body ? 'POST' : 'GET', headers: { Authorization: 'Bearer ' + tokenBox.value, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined })
  if (!res.ok) throw new Error(res.status === 401 ? 'Segredo incorreto.' : res.status === 429 ? 'Muitas tentativas; espere um pouco.' : 'Erro ' + res.status)
  return res.json()
}
const cell = (tr, text, tag) => { const c = document.createElement(tag || 'td'); c.textContent = text; tr.appendChild(c); return c }
const btn = (label, cls, fn) => { const b = document.createElement('button'); b.textContent = label; if (cls) b.className = cls; b.onclick = fn; return b }
const REASON = { offensive: 'ofensivo', impersonation: 'finge ser outro', spam: 'propaganda', other: 'outro' }
const when = (ms) => new Date(ms).toLocaleString('pt-BR')
async function act(body) { try { await api('action', body); say('Feito.'); await load() } catch (e) { say(e.message, true) } }
function fill(table, head, rows) {
  table.replaceChildren(); const h = table.insertRow(); head.forEach((t) => cell(h, t, 'th'))
  if (!rows.length) { const r = table.insertRow(); const c = cell(r, 'Nada por aqui.'); c.colSpan = head.length; c.className = 'muted' }
  rows.forEach((fn) => fn(table.insertRow()))
}
async function load() {
  const o = await api('overview')
  $('cards').replaceChildren()
  for (const [k, v] of [['Contas', o.identities], ['Ligas abertas', (o.leagues.lobby || 0) + (o.leagues.running || 0)], ['Técnicos em ligas', o.members], ['Denúncias abertas', o.openReports], ['Ligas escondidas', o.hiddenLeagues], ['Banidos', o.bans]]) {
    const d = document.createElement('div'); d.className = 'card'; const s = document.createElement('span'); s.textContent = k; s.className = 'muted'; const b = document.createElement('b'); b.textContent = String(v); d.append(s, b); $('cards').appendChild(d)
  }
  const r = await api('reports?status=open')
  fill($('reports'), ['Alvo', 'Pessoas', 'Motivos', 'Última', ''], r.groups.map((g) => (tr) => {
    const t = cell(tr, (g.kind === 'nickname' ? 'Apelido: ' : 'Liga: ') + g.label); const code = document.createElement('code'); code.textContent = ' ' + g.target; t.appendChild(code)
    cell(tr, String(g.people)); cell(tr, Object.entries(g.reasons).map(([k, n]) => (REASON[k] || k) + ' ×' + n).join(', ')); cell(tr, when(g.last))
    const a = cell(tr, ''); a.appendChild(btn('Dispensar', 'ok', () => act({ type: 'dismiss', kind: g.kind, target: g.target })))
    if (g.kind === 'nickname') { a.appendChild(btn('Trocar apelido', '', () => act({ type: 'reset-nickname', playerId: g.target }))); a.appendChild(btn('Banir', 'danger', () => { const why = prompt('Motivo do banimento:'); if (why !== null) act({ type: 'ban', playerId: g.target, reason: why }) })) }
    else { a.appendChild(btn('Esconder', '', () => act({ type: 'hide-league', leagueId: g.target }))); a.appendChild(btn('Fechar', 'danger', () => { if (confirm('Fechar esta liga?')) act({ type: 'close-league', leagueId: g.target }) })) }
  }))
  const h = await api('hidden-leagues')
  fill($('hidden'), ['Liga', 'Tipo', 'Estado', ''], h.leagues.map((l) => (tr) => {
    const t = cell(tr, l.name); const code = document.createElement('code'); code.textContent = ' ' + l.id; t.appendChild(code); cell(tr, l.kind); cell(tr, l.status)
    const a = cell(tr, ''); a.appendChild(btn('Mostrar', 'ok', () => act({ type: 'show-league', leagueId: l.id }))); a.appendChild(btn('Fechar', 'danger', () => { if (confirm('Fechar esta liga?')) act({ type: 'close-league', leagueId: l.id }) }))
  }))
  const b = await api('bans')
  fill($('bans'), ['Identidade', 'Motivo', 'Quando', ''], b.bans.map((x) => (tr) => {
    const t = cell(tr, ''); const code = document.createElement('code'); code.textContent = x.playerId; t.appendChild(code); cell(tr, x.reason || '—'); cell(tr, when(x.bannedAt))
    cell(tr, '').appendChild(btn('Desbanir', 'ok', () => act({ type: 'unban', playerId: x.playerId })))
  }))
}
async function enter() { try { sessionStorage.setItem('mm-admin', tokenBox.value); await load(); $('app').hidden = false; say('') } catch (e) { say(e.message, true); $('app').hidden = true } }
$('enter').onclick = enter
document.querySelectorAll('[data-act]').forEach((b) => (b.onclick = () => {
  const t = b.dataset.act, p = $('pid').value.trim(), l = $('lid').value.trim()
  if (t === 'ban') return act({ type: 'ban', playerId: p, reason: $('why').value })
  if (t === 'unban' || t === 'reset-nickname') return act({ type: t, playerId: p })
  return act({ type: t, leagueId: l })
}))
if (tokenBox.value) enter()
</script></body></html>`
