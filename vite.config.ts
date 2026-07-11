import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { garimpoApiPlugin } from './vite-plugin-garimpo-api'

export default defineConfig({
  plugins: [react(), garimpoApiPlugin()],
})
