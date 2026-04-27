import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  build: {
    outDir: 'dist-electron',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'electron/main.ts'),
        preload: resolve(__dirname, 'electron/preload.ts')
      },
      output: {
        entryFileNames: '[name].js',
        format: 'cjs',
        // Ensure proper CommonJS output for Electron
        exports: 'named'
      },
      external: ['electron']
    },
    target: 'node18',
    minify: false,
    // Don't bundle Electron
    ssr: false
  }
})
