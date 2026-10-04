/**
 * Diagram connection identity helpers.
 * Types: `diagramTypes.ts`. Above: portalTopology.
 */

import type { CrossViewConnection, DiagramConnection } from './diagramTypes'

/** Pin wire with logical endpoints in metadata (start hop or portal-box outbound). */
export function isCrossViewConnection(conn: DiagramConnection): conn is CrossViewConnection {
  return (
    typeof conn.metadata?.originalFrom === 'string' &&
    conn.metadata.originalFrom !== '' &&
    typeof conn.metadata?.originalTo === 'string' &&
    conn.metadata.originalTo !== ''
  )
}

/** Stable logical wire identity: `(originalFrom, originalTo, pinName)`. */
export function crossViewWireKey(
  originalFrom: string,
  originalTo: string,
  pinName: string = '',
): string {
  return `${originalFrom}\0${originalTo}\0${pinName}`
}

/**
 * Stable diagram-connection paint/map key.
 * Cross-view: includes logical endpoints so multiple wires `from→host·pin`
 * with different `originalTo` do not collide.
 */
export function getConnectionKey(conn: DiagramConnection): string {
  const base = `${conn.from}-${conn.to}-${conn.pinName ?? ''}`
  if (isCrossViewConnection(conn)) {
    return `${base}\0${crossViewWireKey(
      conn.metadata.originalFrom,
      conn.metadata.originalTo,
      conn.pinName ?? '',
    )}`
  }
  return base
}
