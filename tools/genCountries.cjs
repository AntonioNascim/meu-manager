const fs = require('fs')
const rows = fs.readFileSync('tools/countries.txt', 'utf8').split(/\r?\n/).filter(Boolean).map((l) => l.split('|'))
const ids = rows.map((r) => r[0])
if (new Set(ids).size !== ids.length) throw new Error('dup ' + ids.filter((x, i) => ids.indexOf(x) !== i))
const first = ['Brazil', 'Argentina', 'Uruguay', 'Paraguay', 'Chile', 'Colombia', 'Peru', 'Ecuador', 'England', 'Spain', 'Italy', 'Germany', 'France', 'Portugal']
for (const f of first) if (!ids.includes(f)) throw new Error('missing ' + f)
const rest = ids.filter((i) => !first.includes(i)).sort((a, b) => a.localeCompare(b))
const all = [...first, ...rest]
// player.ts
let p = fs.readFileSync('src/engine/types/player.ts', 'utf8'); const crlf = p.includes('\r\n'); p = p.replace(/\r\n/g, '\n')
const a = p.indexOf('export const NATIONALITIES = ['); const b = p.indexOf('] as const', a) + '] as const'.length
const list = all.map((i) => `  '${i}',`).join('\n')
p = p.slice(0, a) + `/** Todos os países do mundo (seleções da FIFA e as do Reino Unido): o id é o nome em inglês; o nome em português e a bandeira ficam em \`src/ui/countries.ts\`. */\nexport const NATIONALITIES = [\n${list}\n] as const` + p.slice(b)
fs.writeFileSync('src/engine/types/player.ts', crlf ? p.replace(/\n/g, '\r\n') : p)
// countries.ts
const q = (s) => JSON.stringify(s)
const body = all.map((id) => { const r = rows.find((x) => x[0] === id); return `  ${q(id)}: { name: ${q(r[1])}, flag: ${q(r[2])} },` }).join('\n')
fs.writeFileSync('src/ui/countries.ts', `/**
 * Países do jogo (nacionalidades): nome em português e bandeira simplificada. GERADO de \`tools/countries.txt\` (\`node tools/.gen\`),
 * não edite à mão. A bandeira é uma descrição curta (\`src/ui/theme/flags.tsx\`): faixas (\`h\` horizontais, \`v\` verticais, com
 * proporções opcionais) e detalhes (\`tri\`, \`disc\`, \`star\`, \`x\`, \`pl\`, \`cant\`, \`nord\`); as cores são letras (r vermelho, b azul,
 * n marinho, l celeste, g verde, d verde-escuro, y amarelo, w branco, k preto, o laranja, m vinho, e marrom). São aproximações.
 */
import type { Nationality } from '../engine/types'

export const COUNTRY_INFO: Record<Nationality, { name: string; flag: string }> = {
${body}
}
`)
console.log(all.length, 'países')
