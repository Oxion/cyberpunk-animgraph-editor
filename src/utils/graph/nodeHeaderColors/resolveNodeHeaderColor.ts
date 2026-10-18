/**
 * Resolve header hex: override → seed → nearest seeded ancestor + family packing → fallback.
 * Siblings: analogous hue band + fixed jewel lightness (no muddy S/V grid).
 */

import { clamp, headerToneFromHue, hexToHsl } from '../../color/hexColor'
import { getAnimTypeParent } from '../../animTypes'
import { FLAT_HEADER_SEED_COLORS } from './headerPalette'
import {
  NODE_HEADER_COLOR_FALLBACK,
  NODE_HEADER_COLOR_OVERRIDES,
  NODE_HEADER_COLOR_SEEDS,
} from './nodeHeaderColorSeeds'

/** Find nearest seeded ancestor (including self). */
function findSeededAncestor(
  typeName: string
): { seedKey: string; seedHex: string; depth: number } | null {
  let current: string | null = typeName
  let depth = 0
  const seen = new Set<string>()
  while (current && !seen.has(current)) {
    seen.add(current)
    const seed = NODE_HEADER_COLOR_SEEDS[current]
    if (seed) return { seedKey: current, seedHex: seed, depth }
    current = getAnimTypeParent(current)
    depth += 1
  }
  return null
}

/**
 * Analogous packing around seed hue.
 * Flat seeds (Blender Input pink) stay exact — no differentiation.
 */
function colorAtFamilyIndex(seedHex: string, index: number, familySize: number): string {
  const flat = seedHex.toLowerCase()
  if (FLAT_HEADER_SEED_COLORS.has(flat) || FLAT_HEADER_SEED_COLORS.has(seedHex)) {
    return flat
  }
  const seed = hexToHsl(seedHex)
  const span = clamp(8 + familySize * 0.4, 10, 20)
  const t = familySize <= 1 ? 0.5 : index / (familySize - 1)
  const h = seed.h - span / 2 + t * span
  const lightness = clamp(0.32 + ((index % 3) - 1) * 0.015, 0.28, 0.38)
  return headerToneFromHue(h, { lightness })
}

/** Build type → hex for a collected type list (stable, sibling-aware). */
export function buildNodeHeaderColorMap(
  types: readonly string[]
): Record<string, string> {
  const out: Record<string, string> = {}
  const bySeed = new Map<string, string[]>()

  for (const typeName of types) {
    const override = NODE_HEADER_COLOR_OVERRIDES[typeName]
    if (override) {
      out[typeName] = override.toLowerCase()
      continue
    }

    const selfSeed = NODE_HEADER_COLOR_SEEDS[typeName]
    if (selfSeed) {
      out[typeName] = selfSeed.toLowerCase()
      continue
    }

    const found = findSeededAncestor(typeName)
    if (!found) {
      out[typeName] = NODE_HEADER_COLOR_FALLBACK.toLowerCase()
      continue
    }

    const list = bySeed.get(found.seedKey)
    if (list) list.push(typeName)
    else bySeed.set(found.seedKey, [typeName])
  }

  for (const [seedKey, members] of bySeed) {
    const seedHex = NODE_HEADER_COLOR_SEEDS[seedKey]!
    members.sort((a, b) => a.localeCompare(b))
    const n = members.length
    for (let i = 0; i < n; i++) {
      out[members[i]!] = colorAtFamilyIndex(seedHex, i, n)
    }
  }

  return out
}

/** Single-type resolve (no sibling packing — prefer buildNodeHeaderColorMap for codegen). */
export function resolveNodeHeaderColor(typeName: string): string {
  return buildNodeHeaderColorMap([typeName])[typeName] ?? NODE_HEADER_COLOR_FALLBACK
}
