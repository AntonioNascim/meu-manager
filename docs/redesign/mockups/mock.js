// Interações de mentira, só para sentir a direção: toque nos botões, abas, velocidade, relógio.
const $$ = (s, r = document) => [...r.querySelectorAll(s)]
$$('.nav button').forEach((b) => b.addEventListener('click', () => { $$('.nav button').forEach((x) => x.classList.remove('on')); b.classList.add('on') }))
$$('.tabs button').forEach((b) => b.addEventListener('click', () => { $$('.tabs button').forEach((x) => x.classList.remove('on')); b.classList.add('on') }))
const sp = document.querySelector('.speed span')
if (sp) sp.parentElement.addEventListener('click', () => { const l = ['1x', '2x', '4x', '8x']; sp.textContent = l[(l.indexOf(sp.textContent) + 1) % 4] })
$$('.btn, .tile, .notice, .row-btn').forEach((b) => b.addEventListener('pointerdown', () => { b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop') }))
const min = document.getElementById('min')
if (min && !location.search.includes('static')) { let m = 34; setInterval(() => { m = m >= 45 ? 34 : m + 1; min.textContent = m + "'" }, 1400) }
