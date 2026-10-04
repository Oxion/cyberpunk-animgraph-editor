#!/usr/bin/env npx tsx
/**
 * Generate src/utils/graph/pinTyping/pinEndpoints.generated.ts
 * from animTypes + projection pin fields (incl. pin-override + extraPins).
 *
 * Usage:
 *   npm run gen:pin-endpoints
 *   npm run gen:pin-endpoints -- --check
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { collectPinEndpointTypes } from '../src/utils/graph/pinTyping/collectPinEndpoints'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const outFile = path.join(
  root,
  'src/utils/graph/pinTyping/pinEndpoints.generated.ts'
)

function render(types: string[]): string {
  const lines = types.map((t) => `  '${t.replace(/'/g, "\\'")}',`)
  return `/**
 * AUTO-GENERATED — do not edit.
 * Run: npm run gen:pin-endpoints
 */

export const PIN_ENDPOINT_TYPES = [
${lines.join('\n')}
] as const

export type PinEndpointType = (typeof PIN_ENDPOINT_TYPES)[number]

export const PIN_ENDPOINT_TYPE_SET: ReadonlySet<string> = new Set(PIN_ENDPOINT_TYPES)
`
}

function main(): void {
  const check = process.argv.includes('--check')
  const types = collectPinEndpointTypes({ pinMode: 'pin' })
  const next = render(types)

  if (check) {
    if (!fs.existsSync(outFile)) {
      console.error(`Missing ${outFile} — run npm run gen:pin-endpoints`)
      process.exit(1)
    }
    const prev = fs.readFileSync(outFile, 'utf8')
    if (prev !== next) {
      console.error('pinEndpoints.generated.ts is out of date — run npm run gen:pin-endpoints')
      process.exit(1)
    }
    console.log(`OK — ${types.length} pin endpoint types`)
    return
  }

  fs.writeFileSync(outFile, next, 'utf8')
  console.log(`Wrote ${path.relative(root, outFile)} (${types.length} types)`)
}

main()
