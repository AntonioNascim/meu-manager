// Ajuda dos testes de ponta a ponta da liga online: desde o "treino obrigatório" o Pronto só libera com a semana de treino montada ou delegada.
// `readyWeek(page)` deixa o Pronto liberado (a página precisa estar no Início, onde fica o cartão da liga):
//   1) "Delegar à comissão" no aviso do painel (a ação do técnico de verdade);
//   2) se o aviso não estiver na tela, liga "Delegar sempre" pelo mesmo comando do jogo: o Pronto completa a semana sozinho ao ser tocado.
// Devolve `true` quando o botão "Pronto" ficou habilitado.

const enabled = () => {
  const b = document.querySelector('[data-testid="league-ready"]')
  return !!b && !b.disabled
}

export async function readyWeek(page, { timeout = 30000 } = {}) {
  const ready = page.getByTestId('league-ready')
  await ready.waitFor({ timeout: 20000 })
  if (await page.waitForFunction(enabled, null, { timeout: 1500 }).then(() => true, () => false)) return true
  const delegate = page.getByTestId('week-gate-delegate')
  if (await delegate.isVisible().catch(() => false)) await delegate.click()
  if (await page.waitForFunction(enabled, null, { timeout }).then(() => true, () => false)) return true
  await page.evaluate(() => window.__mm.perform({ type: 'training-delegate-always', on: true }))
  return page.waitForFunction(enabled, null, { timeout }).then(() => true, () => false)
}
