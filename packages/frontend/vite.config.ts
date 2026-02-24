import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
  ],
  server: {
    host: '0.0.0.0', // Povolí připojení z LAN/jiných zařízení
    port: 5173,      // Volitelně můžete port změnit
  }
})
