import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Configuración para GitHub Pages (repo jlmogollon/kids-goals)
export default defineConfig({
  plugins: [react()],
  base: '/kids-goals/',
})
