import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/main/**/*.ts'],
      exclude: [
        'src/main/index.ts',
        'src/main/**/index.ts',
        'src/main/auth/oauth-types.ts',
        'src/main/db/schema.ts'
      ],
      thresholds: {
        statements: 80,
        branches: 70,
        functions: 75,
        lines: 80
      }
    }
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src/renderer'),
      '@shared': resolve(__dirname, 'src/renderer/shared'),
      '@entities': resolve(__dirname, 'src/renderer/entities'),
      '@features': resolve(__dirname, 'src/renderer/features'),
    }
  }
})
