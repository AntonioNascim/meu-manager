// Interações de mentira para sentir o estilo: abas, barra de baixo, velocidade.
const $$ = (s, r = document) => [...r.querySelectorAll(s)]
$$('.nav button').forEach((b) => b.addEventListener('click', () => { $$('.nav button').forEach((x) => x.classList.remove('on')); b.classList.add('on') }))
$$('.tabs, .pills').forEach((g) => $$('button', g).forEach((b) => b.addEventListener('click', () => { $$('button', g).forEach((x) => x.classList.remove('on')); b.classList.add('on') })))
$$('.speed').forEach((s) => s.addEventListener('click', () => { const l = ['1x', '2x', '4x', '8x']; const t = s.querySelector('span'); if (t) t.textContent = l[(l.indexOf(t.textContent) + 1) % 4] }))

$$('.tabs.scroll, .pills').forEach((g) => { const b = g.querySelector('.on'); if (b) g.scrollLeft = Math.max(0, b.offsetLeft - 40) })
