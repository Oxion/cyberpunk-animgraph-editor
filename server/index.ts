import fs from 'fs'
import path from 'path'
import express from 'express'
import { fileURLToPath } from 'node:url'
import { createFsApiApp } from './fsApi'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')
const distDir = path.join(projectRoot, 'dist')
const port = Number(process.env.PORT) || 5001

const app = createFsApiApp(projectRoot)

if (fs.existsSync(distDir)) {
  app.use(express.static(distDir))
  app.get(/^(?!\/api\/).*/, (_req, res) => {
    res.sendFile(path.join(distDir, 'index.html'))
  })
} else {
  console.warn(`[server] dist/ not found at ${distDir}; serving API only`)
}

app.listen(port, '0.0.0.0', () => {
  console.log(`[server] Animgraph Editor listening on http://0.0.0.0:${port}`)
})
