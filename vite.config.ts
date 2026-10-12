/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { pwaPlugin } from './tools/pwaPlugin.ts'

export default defineConfig({
  // Caminhos relativos: o app funciona em qualquer pasta/endereço (e o service worker usa o escopo de onde está).
  base: './',
  plugins: [react(), tailwindcss(), pwaPlugin()],
  test: {
    environment: 'node',
    // PC com pouca memória (6 GB): no máximo 2 workers em paralelo.
    maxWorkers: 2,
    projects: [
      {
        // npm test: testes rápidos (regras, geração, consistência do motor)
        extends: true,
        test: {
          name: 'unit',
          include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
          exclude: ['tests/balance/**'],
          // Folga para máquinas lentas ou ocupadas; os testes rápidos seguem rápidos.
          testTimeout: 30_000,
        },
      },
      {
        // npm run test:balance: milhares de partidas e temporadas inteiras
        extends: true,
        test: {
          name: 'balance',
          include: ['tests/balance/**/*.test.ts'],
          testTimeout: 600_000,
          hookTimeout: 600_000,
        },
      },
    ],
  },
})
