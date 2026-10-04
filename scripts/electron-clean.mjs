import fs from 'node:fs'
import path from 'node:path'

const buildDir = path.join(process.cwd(), 'build')
try {
  fs.rmSync(buildDir, { recursive: true, force: true })
} catch (error) {
  console.warn(`[electron:clean] could not remove build/: ${error.message}`)
}
