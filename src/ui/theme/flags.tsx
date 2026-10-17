import type { ReactNode } from 'react'

/** Cores das bandeiras simplificadas (letras da descrição em `src/ui/countries.ts`). */
const COLORS: Record<string, string> = { r: '#d52b1e', b: '#1c4fa0', n: '#0b2a6b', l: '#75b6e8', g: '#2a9d3f', d: '#0a6b34', y: '#f4d90f', w: '#ffffff', k: '#111111', o: '#f08a00', m: '#7a1f1f', p: '#6a1b9a', s: '#9aa0a6', t: '#00a3a3', e: '#8a5a2b' }
const color = (letter: string | undefined) => COLORS[letter ?? 'w'] ?? '#888888'

const W = 30
const H = 20

/** Faixas iguais, ou na proporção dada em dígitos (`h121:rwr` = 1:2:1). */
function bands(kind: 'h' | 'v', head: string): ReactNode {
  const [ratio, letters = ''] = head.includes(':') ? head.split(':') : ['', head]
  const parts = letters.split('')
  const weights = ratio ? ratio.split('').map(Number) : parts.map(() => 1)
  const total = weights.reduce((a, b) => a + b, 0)
  let at = 0
  return parts.map((letter, i) => {
    const size = ((kind === 'h' ? H : W) * (weights[i] ?? 1)) / total
    const node = kind === 'h' ? <rect key={i} y={at} width={W} height={size + 0.05} fill={color(letter)} /> : <rect key={i} x={at} width={size + 0.05} height={H} fill={color(letter)} />
    at += size
    return node
  })
}

function star(cx: number, cy: number, r: number, fill: string, key: string): ReactNode {
  const points = Array.from({ length: 10 }, (_, i) => {
    const angle = (Math.PI / 5) * i - Math.PI / 2
    const radius = i % 2 === 0 ? r : r * 0.42
    return `${(cx + radius * Math.cos(angle)).toFixed(2)},${(cy + radius * Math.sin(angle)).toFixed(2)}`
  }).join(' ')
  return <polygon key={key} points={points} fill={fill} />
}

/**
 * Desenha uma bandeira simplificada a partir da descrição (`h:rwb/disc:y`): a base (faixas horizontais `h` ou verticais `v`) e
 * os detalhes depois das barras: `tri` triângulo na haste, `disc` disco no centro, `star` estrela no centro, `x` cruz em
 * diagonal, `pl` cruz reta centrada, `cant` quadrante no canto superior esquerdo, `nord:fundo:cruz[:contorno]` cruz nórdica.
 */
export function flagShapes(spec: string): ReactNode[] {
  const [base = 'h:w', ...details] = spec.split('/')
  const out: ReactNode[] = []
  const kind = base[0] === 'v' ? 'v' : 'h'
  if (base.startsWith('nord:')) {
    const [, bg, cross, edge] = base.split(':')
    out.push(<rect key="bg" width={W} height={H} fill={color(bg)} />)
    if (edge) {
      out.push(<rect key="ev" x={8} width={6} height={H} fill={color(edge)} />, <rect key="eh" y={7} width={W} height={6} fill={color(edge)} />)
      out.push(<rect key="cv" x={9.5} width={3} height={H} fill={color(cross)} />, <rect key="ch" y={8.5} width={W} height={3} fill={color(cross)} />)
    } else {
      out.push(<rect key="cv" x={8.5} width={4} height={H} fill={color(cross)} />, <rect key="ch" y={8} width={W} height={4} fill={color(cross)} />)
    }
    return out
  }
  out.push(...(bands(kind, base.slice(1)) as ReactNode[]))
  details.forEach((detail, i) => {
    const [name, letter] = detail.split(':')
    const fill = color(letter)
    const key = `${name}${i}`
    if (name === 'tri') out.push(<path key={key} d={`M0 0 14 10 0 ${H}Z`} fill={fill} />)
    else if (name === 'disc') out.push(<circle key={key} cx={15} cy={10} r={4.2} fill={fill} />)
    else if (name === 'star') out.push(star(15, 10, 5, fill, key))
    else if (name === 'x') out.push(<path key={key} d={`M0 0 30 20M30 0 0 20`} stroke={fill} strokeWidth={3} />)
    else if (name === 'pl') out.push(<g key={key}><rect x={12.5} width={5} height={H} fill={fill} /><rect y={7.5} width={W} height={5} fill={fill} /></g>)
    else if (name === 'cant') out.push(<rect key={key} width={12} height={10} fill={fill} />)
  })
  return out
}
