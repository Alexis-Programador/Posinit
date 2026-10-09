import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Configuración de POS Init Web para GitHub Pages
export default defineConfig({
  plugins: [react()],
  base: '/Posinit/',
})