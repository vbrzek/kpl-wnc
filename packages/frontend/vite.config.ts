import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
  ],
  envDir: '../../', // čti .env z kořene monorepa (ne z packages/frontend/)
  server: {
    host: '0.0.0.0',
    port: 5173,
  }
})
