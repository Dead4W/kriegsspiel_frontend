import { copyFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    vueDevTools(),
    {
      name: 'copy-updates-md',
      closeBundle() {
        const root = fileURLToPath(new URL('.', import.meta.url))
        const src = resolve(root, 'UPDATES.md')
        const dest = resolve(root, 'dist', 'UPDATES.md')
        if (existsSync(src)) {
          copyFileSync(src, dest)
        }
      },
    },
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    },
  },
})
