/**
 * DiagramConnection.type strings (edges, not node $type). Leaf module.
 *
 * `input` — pin wire: same-scope, materialized source → host, or portal-box outbound hop.
 * Cross-view is `input` plus `metadata.originalFrom` / `originalTo` (see portalTopology).
 */

export const DIAGRAM_CONNECTION_TYPE_INPUT = 'input'
