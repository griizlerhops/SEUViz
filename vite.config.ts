import { defineConfig } from 'vite'

export default defineConfig({
  // Relative asset paths so the build works from any static host or subpath
  // (e.g. GitHub Pages at /SEUViz/).
  base: './',
  server: {
    port: 5173,
  },
  build: {
    outDir: 'dist',
  },
})
