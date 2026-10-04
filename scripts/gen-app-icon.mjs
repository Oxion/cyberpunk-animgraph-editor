import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pngToIco from 'png-to-ico'
import sharp from 'sharp'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const svgPath = path.join(root, 'buildResources', 'icon.svg')
const pngPath = path.join(root, 'buildResources', 'icon.png')
const icoPath = path.join(root, 'buildResources', 'icon.ico')

const svg = fs.readFileSync(svgPath)
const base = sharp(svg).resize(512, 512).png()

await base.toFile(pngPath)

/** Multi-size ICO so Windows explorer / taskbar / .exe pick a sharp glyph. */
const icoSizes = [16, 24, 32, 48, 64, 128, 256]
const icoPngs = await Promise.all(
  icoSizes.map((size) => sharp(svg).resize(size, size).png().toBuffer())
)
fs.writeFileSync(icoPath, await pngToIco(icoPngs))

console.log(`[gen:app-icon] wrote ${path.relative(root, pngPath)}`)
console.log(`[gen:app-icon] wrote ${path.relative(root, icoPath)}`)
