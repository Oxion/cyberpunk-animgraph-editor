/**
 * Resolve header hex: override → seed → nearest seeded ancestor + family packing → fallback.
 * Siblings under the same seed are spaced on a hue×S×V grid so they stay related but readable.
 */

import { getAnimTypeParent } from '../../animTypes'
import {
  NODE_HEADER_COLOR_FALLBACK,
  NODE_HEADER_COLOR_OVERRIDES,
  NODE_HEADER_COLOR_SEEDS,
} from './nodeHeaderColorSeeds'

type Hsv = { h: number; s: number; v: number }

function parseHex(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '').trim()
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const n = Number.parseInt(full, 16)
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff }
}

function toHex(r: number, g: number, b: number): string {
  const clamp = (x: number) => Math.max(0, Math.min(255, Math.round(x)))
  return (
    '#' +
    [clamp(r), clamp(g), clamp(b)]
      .map((x) => x.toString(16).padStart(2, '0'))
      .join('')
  )
}

function rgbToHsv(r: number, g: number, b: number): Hsv {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const d = max - min
  let h = 0
  if (d !== 0) {
    if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60
    else if (max === gn) h = ((bn - rn) / d + 2) * 60
    else h = ((rn - gn) / d + 4) * 60
  }
  const s = max === 0 ? 0 : d / max
  return { h, s, v: max }
}

function hsvToRgb(h: number, s: number, v: number): { r: number; g: number; b: number } {
  const hh = ((h % 360) + 360) % 360
  const c = v * s
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1))
  const m = v - c
  let rp = 0
  let gp = 0
  let bp = 0
  if (hh < 60) {
    rp = c
    gp = x
  } else if (hh < 120) {
    rp = x
    gp = c
  } else if (hh < 180) {
    gp = c
    bp = x
  } else if (hh < 240) {
    gp = x
    bp = c
  } else if (hh < 300) {
    rp = x
    bp = c
  } else {
    rp = c
    bp = x
  }
  return { r: (rp + m) * 255, g: (gp + m) * 255, b: (bp + m) * 255 }
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x))
}

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
 * Pack siblings around a seed.
 * Index walks S → V → hue so neighbors differ in sat/value first (reads better on dull seeds).
 */
function colorAtFamilyIndex(seedHex: string, index: number, familySize: number): string {
  const { r, g, b } = parseHex(seedHex)
  const seed = rgbToHsv(r, g, b)

  const HUE_SLOTS = 8
  const S_SLOTS = 3
  const V_SLOTS = 4
  const cell = HUE_SLOTS * S_SLOTS * V_SLOTS
  // Coprime stride — avoid long runs of near-identical hues when family wraps
  const i = (index * 11) % cell

  const sSlot = i % S_SLOTS
  const vSlot = Math.floor(i / S_SLOTS) % V_SLOTS
  const hueSlot = Math.floor(i / (S_SLOTS * V_SLOTS)) % HUE_SLOTS

  const hueHalf = clamp(14 + familySize * 0.4, 22, 42)
  const hueStep = (hueHalf * 2) / Math.max(HUE_SLOTS - 1, 1)
  const h = seed.h - hueHalf + hueSlot * hueStep

  const baseS = Math.max(seed.s, 0.38)
  const s = clamp(baseS + (sSlot - 1) * 0.18, 0.26, 0.82)
  const v = clamp(seed.v + (vSlot - 1.5) * 0.07, 0.2, 0.52)

  const rgb = hsvToRgb(h, s, v)
  return toHex(rgb.r, rgb.g, rgb.b)
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
