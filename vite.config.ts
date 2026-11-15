import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// GitHub Pages serves the app from /<repo>/
export default defineConfig({
  base: '/Dnd_character_hub/',
  plugins: [react()],
})
