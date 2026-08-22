import { defineConfig } from 'vitest/config'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  // client code reaches shared/ through a webpack alias; without the same one
  // here, a test of anything under src/ that imports it cannot resolve
  resolve: {
    alias: {
      shared: path.resolve(__dirname, '../shared'),
    },
  },
  test: {
    setupFiles: [path.resolve(__dirname, '../server/lib/test-setup.ts')],
  },
})
