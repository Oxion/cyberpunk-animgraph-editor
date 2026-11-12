import { DiagramConnection } from "./diagramTypes"

export function collectInputNodeIds(
  seedIds: Iterable<string>,
  connections: DiagramConnection[],
  recursive: boolean
): string[] {
  const collected = new Set<string>()
  let frontier = new Set(seedIds)
  const expanded = new Set<string>()

  while (frontier.size > 0) {
    const nextFrontier = new Set<string>()
    for (const nodeId of frontier) {
      if (expanded.has(nodeId)) continue
      expanded.add(nodeId)

      for (const conn of connections) {
        if (conn.to !== nodeId) continue
        collected.add(conn.from)
        if (recursive && !expanded.has(conn.from)) {
          nextFrontier.add(conn.from)
        }
      }
    }
    frontier = nextFrontier
  }

  return [...collected]
}