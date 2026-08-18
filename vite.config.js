import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // caminhos relativos → funciona em qualquer subpasta do GitHub Pages (usuario.github.io/prancheta/)
  base: './',
  plugins: [react()],
  server: {
    port: 5180,
    strictPort: false,
    watch: { ignored: ['**/*.tmp', '**/*.docx', '**/*.txt', '**/test-*.js', '**/~lock*'] },
  },
})
