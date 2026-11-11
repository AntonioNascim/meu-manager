// Gera os HTML dos mockups finais. Uso: node docs/redesign/final/build.cjs
const fs = require('fs'), path = require('path')
const { page } = require('./lib.cjs')
const files = ['./screens1.cjs', './screens2.cjs', './screens3.cjs'].filter((f) => fs.existsSync(path.join(__dirname, f)))
const all = files.flatMap((f) => require(f))
const out = path.join(__dirname, 'html'); fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true })
const index = []
all.forEach((s, i) => {
  const n = String(i + 1).padStart(2, '0'); const name = `${n}-${s.slug}`
  fs.writeFileSync(path.join(out, name + '.html'), page({ nav: s.nav, ...s, header: s.header !== false }))
  index.push(name + '\t' + s.title)
})
fs.writeFileSync(path.join(__dirname, 'lista.txt'), index.join('\n'))
console.log(all.length, 'telas')
