import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  // Read env vars from repo root (../.env) so backend + frontend share one env file.
  envDir: '..',
  plugins: [react()],
})
