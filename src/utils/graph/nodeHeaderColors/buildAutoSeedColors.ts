/**
 * Auto seeds for non-manual families.
 */

import {
  HEADER_ANIM,
  HEADER_CONDITIONAL,
  HEADER_CONSTRAINT,
  HEADER_CONVERTER,
  HEADER_SIGNAL,
} from './headerPalette'

const AUTO_CYCLE = [
  HEADER_ANIM,
  HEADER_CONSTRAINT,
  HEADER_CONDITIONAL,
  HEADER_CONVERTER,
  HEADER_SIGNAL,
] as const

export function buildAutoSeedColors(
  groups: readonly (readonly string[])[],
  _manual: Readonly<Record<string, string>>
): Record<string, string> {
  const out: Record<string, string> = {}
  for (let i = 0; i < groups.length; i++) {
    const hex = AUTO_CYCLE[i % AUTO_CYCLE.length]!
    for (const key of groups[i]!) {
      out[key] = hex
    }
  }
  return out
}
