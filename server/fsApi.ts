import express, { type Express, type Request, type Response, type Router } from 'express'
import { createFsCore, ensureGraphsRoot, FsCoreError, type FsListEntry } from './fsCore'

export type { FsListEntry }
export { ensureGraphsRoot }

function statusFor(error: FsCoreError): number {
  switch (error.code) {
    case 'invalid':
      return 400
    case 'not_found':
      return 404
    case 'conflict':
      return 409
    default:
      return 500
  }
}

function sendFsError(res: Response, fallback: string, error: unknown) {
  if (error instanceof FsCoreError) {
    res.status(statusFor(error)).json({ error: error.message, details: error.message })
    return
  }
  res.status(500).json({
    error: fallback,
    details: error instanceof Error ? error.message : 'Unknown error',
  })
}

/** @param projectRoot Animgraph Editor project root (parent of `graphs/`). */
export function createFsRouter(projectRoot: string): Router {
  const api = createFsCore(projectRoot)
  const router = express.Router()

  router.get('/default-root', (_req: Request, res: Response) => {
    res.json({ path: api.getDefaultRoot() })
  })

  router.get('/drives', (_req: Request, res: Response) => {
    try {
      res.json(api.listDrives())
    } catch (error) {
      sendFsError(res, 'Failed to list drives', error)
    }
  })

  router.get('/list', (req: Request, res: Response) => {
    try {
      const raw = String(req.query.path ?? '')
      const dirPath = raw === '' || raw === '__drives__' ? null : raw
      res.json(api.list(dirPath))
    } catch (error) {
      sendFsError(res, 'Failed to list directory', error)
    }
  })

  router.get('/load', (req: Request, res: Response) => {
    try {
      // Send raw file text; client JSON.parse via response.json() (same as Electron).
      res.type('application/json').send(api.readText(String(req.query.path ?? '')))
    } catch (error) {
      sendFsError(res, 'Failed to load file', error)
    }
  })

  router.post('/save', (req: Request, res: Response) => {
    try {
      const rawPath = (req.body?.path as string) || ''
      const data = req.body?.data
      res.json(api.saveJson(rawPath, data))
    } catch (error) {
      sendFsError(res, 'Failed to save file', error)
    }
  })

  router.post('/mkdir', (req: Request, res: Response) => {
    try {
      res.json(api.mkdir((req.body?.path as string) || ''))
    } catch (error) {
      sendFsError(res, 'Failed to create folder', error)
    }
  })

  router.delete('/', (req: Request, res: Response) => {
    try {
      res.json(api.delete(String(req.query.path ?? '')))
    } catch (error) {
      sendFsError(res, 'Failed to delete path', error)
    }
  })

  return router
}

export function createFsApiApp(projectRoot: string): Express {
  ensureGraphsRoot(projectRoot)
  const app = express()
  app.use(express.json({ limit: '50mb' }))
  app.use((req: Request, res: Response, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    if (req.method === 'OPTIONS') {
      res.status(200).end()
      return
    }
    next()
  })
  app.get('/api/data', (_req, res) => {
    res.json({ message: 'Data from Animgraph Editor API' })
  })
  app.get('/api/status', (_req, res) => {
    res.json({ status: 'running', timestamp: new Date().toISOString() })
  })
  app.use('/api/fs', createFsRouter(projectRoot))
  return app
}
