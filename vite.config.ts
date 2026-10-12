/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'node',
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
