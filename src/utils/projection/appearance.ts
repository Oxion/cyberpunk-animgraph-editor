import type { ProjectionAppearance } from './types'
import { getProjectionDef } from './resolve'

export type { ProjectionAppearance }

/** Default when no projection row: a normal animgraph node box. */
export const DEFAULT_APPEARANCE: ProjectionAppearance = 'node'

export function getProjectedAppearance(typeName: string): ProjectionAppearance {
  return getProjectionDef(typeName)?.appearance ?? DEFAULT_APPEARANCE
}

/** Handle lives in the registry but is not a diagram box. */
export function isProjectedEmbedded(typeName: string): boolean {
  return getProjectedAppearance(typeName) === 'embedded'
}

/** Engine AnimNode: belongs in nodesToInit. */
export function isProjectedInitNode(typeName: string): boolean {
  const appearance = getProjectedAppearance(typeName)
  return appearance === 'node' || appearance === 'wrapper'
}
