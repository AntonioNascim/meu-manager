// Pega um token de verdade do widget do Turnstile (modo Gerenciado): sobe uma página em http://localhost:5199 que a PESSOA abre no navegador e
// onde clica na caixa "Verify you are human". O token chega ao script e é impresso. O host "localhost" precisa estar autorizado no widget.
// Uso: node turnstile-token.mjs <chave-do-site>
import { createServer } from 'node:http'

const sitekey = process.argv[2]
if (!sitekey) throw new Error('Uso: node turnstile-token.mjs <chave-do-site>')
const page = `<!doctype html><meta charset="utf-8"><title>Teste do Turnstile</title>
<p style="font:16px sans-serif">Clique na caixa abaixo. Depois pode fechar esta página.</p>
<script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" async></script><div id="w"></div><p id="s" style="font:16px sans-serif"></p><script>
const t = setInterval(() => { if (window.turnstile) { clearInterval(t); window.turnstile.render('#w', { sitekey: ${JSON.stringify(sitekey)}, callback: (x) => { fetch('/token', { method: 'POST', body: x }).then(() => { document.getElementById('s').textContent = 'Pronto: token enviado.' }) } }) } }, 100)
</script>`

const token = await new Promise((resolve) => {
  const server = createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/token') {
      let body = ''
      req.on('data', (c) => (body += c))
      req.on('end', () => {
        res.writeHead(204).end()
        server.close()
        resolve(body)
      })
    } else res.writeHead(200, { 'content-type': 'text/html' }).end(page)
  })
  server.listen(5199, '127.0.0.1')
  setTimeout(() => process.exit(2), 240_000)
})
process.stdout.write(token)
