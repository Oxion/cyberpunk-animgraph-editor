import { defineConfig, type PreviewServer, type ViteDevServer } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { fileURLToPath } from 'node:url'
import { createFsApiApp } from './server/fsApi'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

type ConnectNext = (err?: unknown) => void
type ConnectHandler = (
  req: IncomingMessage,
  res: ServerResponse,
  next: ConnectNext
) => void

function mountFsApi(middlewares: ViteDevServer['middlewares']) {
  const app = createFsApiApp(__dirname) as unknown as ConnectHandler
  middlewares.use((req, res, next) => {
    if (!req.url?.startsWith('/api')) {
      next()
      return
    }
    app(req, res, next)
  })
}

export default defineConfig({
  base: './',
  plugins: [
    vue({
      script: {
        defineModel: true,
        propsDestructure: true,
      },
    }),
    tailwindcss(),
    {
      name: 'api-server',
      configureServer(server: ViteDevServer) {
        mountFsApi(server.middlewares)
      },
      configurePreviewServer(server: PreviewServer) {
        mountFsApi(server.middlewares)
      },
    },
  ],
  server: {
    port: 5001,
    host: '0.0.0.0',
    cors: true,
    strictPort: false,
    fs: {
      allow: ['..'],
    },
  },
  preview: {
    port: 5001,
    host: '0.0.0.0',
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
