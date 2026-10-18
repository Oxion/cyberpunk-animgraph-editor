#!/usr/bin/env npx tsx
/**
 * Generate src/utils/graph/nodeHeaderColors/nodeHeaderColors.generated.ts
 * from projection box types + diagram natives + seed/override palette.
 *
 * Usage:
 *   npm run gen:node-header-colors
 *   npm run gen:node-header-colors -- --check
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { collectNodeHeaderTypes } from '../src/utils/graph/nodeHeaderColors/collectNodeHeaderTypes'
import { buildNodeHeaderColorMap } from '../src/utils/graph/nodeHeaderColors/resolveNodeHeaderColor'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const outFile = path.join(
  root,
  'src/utils/graph/nodeHeaderColors/nodeHeaderColors.generated.ts'
)

function render(entries: ReadonlyArray<readonly [string, string]>): string {
  const lines = entries.map(
    ([t, hex]) => `  '${t.replace(/'/g, "\\'")}': '${hex}',`
  )
  return `/**
 * AUTO-GENERATED — do not edit.
 * Run: npm run gen:node-header-colors
 */

export const NODE_HEADER_FILL: Readonly<Record<string, string>> = {
${lines.join('\n')}
}
`
}

function main(): void {
  const check = process.argv.includes('--check')
  const types = collectNodeHeaderTypes()
  const map = buildNodeHeaderColorMap(types)
  const entries = types.map((t) => [t, map[t]!] as const)
  const next = render(entries)

  if (check) {
    if (!fs.existsSync(outFile)) {
      console.error(`Missing ${outFile} — run npm run gen:node-header-colors`)
      process.exit(1)
    }
    const prev = fs.readFileSync(outFile, 'utf8')
    if (prev !== next) {
      console.error(
        'nodeHeaderColors.generated.ts is out of date — run npm run gen:node-header-colors'
      )
      process.exit(1)
    }
    console.log(`OK — ${types.length} node header colors`)
    return
  }

  fs.writeFileSync(outFile, next, 'utf8')
  console.log(`Wrote ${path.relative(root, outFile)} (${types.length} types)`)
}

main()
