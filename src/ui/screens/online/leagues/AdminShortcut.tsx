import { useEffect, useState } from 'react'
import { leagueApi } from '../../../../store/leagues'
import { ShortcutTile } from '../../../theme'

/** O botão "ADM" dos atalhos do jogo do clube: só aparece para o ADM da liga (a resposta do servidor diz quem é). */
export function AdminShortcut({ leagueId, onClick }: { leagueId: string; onClick: () => void }) {
  const [isAdmin, setIsAdmin] = useState(false)
  useEffect(() => {
    let alive = true
    const check = async () => {
      const r = await leagueApi.state(leagueId)
      if (alive && r.ok) setIsAdmin(r.isAdmin)
    }
    void check()
    const t = setInterval(() => void check(), 30_000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [leagueId])
  if (!isAdmin) return null
  return <ShortcutTile icon="star" label="ADM" tone="amber" onClick={onClick} />
}
