import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { version } = require('../package.json')

const root = process.cwd()
const buildDir = path.join(root, 'build')
const unpackedDir = path.join(buildDir, 'win-unpacked')
const folderName = `AnimgraphEditor-v${version}-win-x64`
const stagedDir = path.join(buildDir, folderName)
const zipPath = path.join(buildDir, `${folderName}.zip`)

const wantBuild = process.argv.includes('--build')

function run(command, args, { shell = false } = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', shell, cwd: root })
  if (result.status !== 0) process.exit(result.status ?? 1)
}

if (wantBuild) {
  run('npm', ['run', 'electron:build'], { shell: true })
}

if (!fs.existsSync(unpackedDir)) {
  console.error(
    `[electron:package] missing ${path.relative(root, unpackedDir)} (run npm run electron:build or pass --build)`
  )
  process.exit(1)
}

fs.rmSync(stagedDir, { recursive: true, force: true })
fs.rmSync(zipPath, { force: true })
fs.cpSync(unpackedDir, stagedDir, { recursive: true })

run('powershell.exe', [
  '-NoProfile',
  '-Command',
  `Compress-Archive -LiteralPath '${stagedDir.replace(/'/g, "''")}' -DestinationPath '${zipPath.replace(/'/g, "''")}' -CompressionLevel Optimal`,
])

console.log(`[electron:package] → ${path.relative(root, zipPath)}`)
