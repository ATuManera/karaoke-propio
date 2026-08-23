import { defineConfig } from 'vitest/config'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  // client code reaches shared/ through a webpack alias, and everything under
  // src/ through webpack's `resolve.modules` root — without the same ones
  // here, a test of anything that imports either cannot resolve
  resolve: {
    alias: {
      shared: path.resolve(__dirname, '../shared'),
      components: path.resolve(__dirname, '../src/components'),
      lib: path.resolve(__dirname, '../src/lib'),
      routes: path.resolve(__dirname, '../src/routes'),
      store: path.resolve(__dirname, '../src/store'),
      styles: path.resolve(__dirname, '../src/styles'),
    },
  },
  test: {
    setupFiles: [path.resolve(__dirname, '../server/lib/test-setup.ts')],
  },
})
