/** Endereços e chaves públicas do modo online (Fase 6). Nada aqui é segredo: a chave do site do Turnstile é feita para ir na página. */
export const ONLINE_CONFIG = {
  /** API no endereço gratuito do Cloudflare; troca pelo domínio próprio perto do lançamento. */
  apiBase: 'https://meu-manager-api.meumanager.workers.dev',
  /** Chave do site do widget "Meu Manager - identidade" (Turnstile, modo Gerenciado). A chave secreta fica só no Worker. */
  turnstileSiteKey: '0x4AAAAAAFxoQ2ziCSAMik7I',
} as const
