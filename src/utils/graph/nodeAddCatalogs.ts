/**
 * Shared add-type catalogs — accumulation sources for any AddProfile vector.
 *
 * Place profiles compose one or more catalog vectors (animgraph slot, diagram-only
 * children, …). Ambient is a separate accumulator vector outside AddProfile.
 */

import { NodeDefinitionRegistry } from '../NodeDefinition'
import { DiagramNodeDefinitionRegistry } from './DiagramNodeDefinition'

export type AddCatalog =
  /** Scan animgraph NodeDefinition registry or DiagramNodeDefinition registry. */
  | { mode: 'registry', registry: 'animgraph' | 'diagram', excludedTypes?: readonly string[] }
  /** Fixed UI type list (wrappers, diagram-only kinds, …). */
  | { mode: 'fixed'; types: readonly string[] }

/**
 * One accumulation + gate vector inside an AddProfile.
 * `tryCanAdd` returns null when this vector does not claim `uiType`.
 */
export type AddCatalogVector<TCtx, TCanAdd> = {
  id: string
  catalogs: readonly AddCatalog[]
  tryCanAdd: (uiType: string, ctx: TCtx) => TCanAdd | null
}

function typesFromCatalog(catalog: AddCatalog): string[] {
  if (catalog.mode === 'fixed') return [...catalog.types]
  return NodeDefinitionRegistry.getAllNodeTypes()
}

/**
 * Merge catalog sources into candidate UI types (union, stable order, deduped).
 */
export function mergeCatalogs(catalogs: readonly AddCatalog[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const catalog of catalogs) {
    for (const t of typesFromCatalog(catalog)) {
      if (seen.has(t)) continue
      seen.add(t)
      out.push(t)
    }
  }
  return out
}

/**
 * Diagram-only child catalogs for a diagram parent type + child slot name.
 * Sourced from DiagramNodeDefinitionRegistry.diagramChildSlots.
 */
export function resolveDiagramPlaceChildCatalogs(
  diagramParentType: string,
  slotName: string = 'children'
): readonly AddCatalog[] {
  const allowed =
    DiagramNodeDefinitionRegistry.getAllowedTypesForDiagramSlot(
      diagramParentType,
      slotName
    )
  if (allowed.length === 0) return []
  return [{ mode: 'fixed', types: allowed }]
}

/** Candidates from all vectors (not yet gated). */
export function mergeVectorCatalogs<TCtx, TCanAdd>(
  vectors: readonly AddCatalogVector<TCtx, TCanAdd>[]
): string[] {
  return mergeCatalogs(vectors.flatMap((v) => [...v.catalogs]))
}

/**
 * Common place pipeline: union catalogs, keep types each owning vector accepts.
 */
export function listUiTypesFromVectors<TCtx, TCanAdd extends { ok: boolean }>(
  vectors: readonly AddCatalogVector<TCtx, TCanAdd>[],
  ctx: TCtx
): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const vector of vectors) {
    for (const uiType of mergeCatalogs(vector.catalogs)) {
      if (seen.has(uiType)) continue
      const gate = vector.tryCanAdd(uiType, ctx)
      if (!gate || !gate.ok) continue
      seen.add(uiType)
      out.push(uiType)
    }
  }
  return out
}

/**
 * First vector that claims `uiType` wins; otherwise `fallback`.
 */
export function canAddFromVectors<TCtx, TCanAdd>(
  vectors: readonly AddCatalogVector<TCtx, TCanAdd>[],
  uiType: string,
  ctx: TCtx,
  fallback: TCanAdd
): TCanAdd {
  for (const vector of vectors) {
    const gate = vector.tryCanAdd(uiType, ctx)
    if (gate !== null) return gate
  }
  return fallback
}
