import { useLayoutEffect, useRef, useState } from 'react'
import type { Player } from '../../engine/types'
import { shortPlayerName } from '../format'

type NameSource = Pick<Player, 'name' | 'nickname'>

/** "Alex Sandro" vira "A. Sandro": só o primeiro nome é abreviado. */
export function abbreviatedName(p: NameSource): string | undefined {
  const full = (p.nickname ?? p.name).trim()
  const words = full.split(/\s+/)
  const first = words[0]
  return words.length >= 2 && first ? `${first.charAt(0)}. ${words.slice(1).join(' ')}` : undefined
}

export type NameForm = 'full' | 'abbr' | 'surname'

/**
 * As formas do nome, da preferida à última saída: o nome conhecido inteiro, depois com o primeiro nome abreviado ("A. Sandro") e por fim só o sobrenome.
 * Cada forma é tentada em cada tamanho de fonte, do maior ao menor, antes de passar à seguinte.
 */
export function nameForms(p: NameSource): { form: NameForm; text: string }[] {
  const full = (p.nickname ?? p.name).trim()
  const out: { form: NameForm; text: string }[] = [{ form: 'full', text: full }]
  const abbr = abbreviatedName(p)
  if (abbr && abbr !== full) out.push({ form: 'abbr', text: abbr })
  const surname = shortPlayerName(p)
  if (!out.some((o) => o.text === surname)) out.push({ form: 'surname', text: surname })
  return out
}

/**
 * Nome do jogador que cabe na largura do pai: mostra o nome conhecido inteiro quando couber, diminui um pouco a fonte se precisar e, só se ainda não
 * couber, abrevia o primeiro nome. Mede o texto na tela (sem sobreposição porque a largura é a do pai). Sem medida (servidor, testes) mostra o inteiro.
 */
export function FitName({ player, sizes = [11, 10, 9, 8], className = '' }: { player: NameSource; sizes?: readonly number[]; className?: string }) {
  const ref = useRef<HTMLSpanElement | null>(null)
  const forms = nameForms(player)
  const [pick, setPick] = useState<{ form: NameForm; text: string; size: number }>({ ...(forms[0] as { form: NameForm; text: string }), size: sizes[0] as number })
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => {
      const all = nameForms(player)
      let chosen: { form: NameForm; text: string; size: number } | undefined
      outer: for (const f of all) {
        for (const size of sizes) {
          el.textContent = f.text
          el.style.fontSize = `${size}px`
          if (el.scrollWidth <= el.clientWidth) {
            chosen = { ...f, size }
            break outer
          }
        }
      }
      const last = all[all.length - 1] as { form: NameForm; text: string }
      const next = chosen ?? { ...last, size: sizes[sizes.length - 1] as number }
      el.textContent = next.text
      el.style.fontSize = `${next.size}px`
      setPick((cur) => (cur.text === next.text && cur.size === next.size ? cur : next))
    }
    measure()
    void document.fonts?.ready.then(measure)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player.name, player.nickname])
  return (
    <span ref={ref} data-fitname={pick.form} className={`block w-full overflow-hidden text-ellipsis whitespace-nowrap text-center font-bold ${className}`} style={{ fontSize: `${pick.size}px` }}>
      {pick.text}
    </span>
  )
}
