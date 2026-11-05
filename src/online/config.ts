/** Endereços e chaves públicas do modo online (Fase 6). Nada aqui é segredo: a chave do site do Turnstile é feita para ir na página. */
const dev = (import.meta as unknown as { env?: Record<string, string | boolean | undefined> }).env

export const ONLINE_CONFIG = {
  /**
   * API no endereço gratuito do Cloudflare; troca pelo domínio próprio perto do lançamento.
   * Só em desenvolvimento (`npm run dev`), `VITE_API_BASE` aponta para um servidor local (`wrangler dev --local`).
   */
  apiBase: (dev?.DEV === true && typeof dev.VITE_API_BASE === 'string' && dev.VITE_API_BASE) || 'https://meu-manager-api.meumanager.workers.dev',
  /** Chave do site do widget "Meu Manager - identidade" (Turnstile, modo Gerenciado). A chave secreta fica só no Worker. */
  turnstileSiteKey: '0x4AAAAAAFxoQ2ziCSAMik7I',
  /** Só em desenvolvimento: `VITE_TURNSTILE_BYPASS=1` dispensa o widget (o servidor local usa a chave secreta de teste, que aprova tudo). */
  turnstileBypass: dev?.DEV === true && dev.VITE_TURNSTILE_BYPASS === '1',
} as const
