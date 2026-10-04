/** Nested pin: Data.expressionData.floatSockets[].link.node */
export type NestedPinSpec = {
  name: string
  path: readonly string[]
  elementType: string
  linkKey?: string
  linkType?: string
  containerType?: string
}

export type ProjectionAppearance = 'node' | 'aux' | 'embedded' | 'wrapper'

/**
 * How a parent field appears on the canvas.
 * pin — socket / wire (pin-DAG nests into the owner's contain PG; wrap reparents those inputs)
 * contain — PropertyGroup of owned handles / inline values
 * embed — no box, inspector payload
 * hide — skip on the diagram
 */
export type FieldRole = 'pin' | 'contain' | 'embed' | 'hide'

export type ProjectionDef = {
  /** Extra pins beyond top-level link fields inferred from types. */
  extraPins?: readonly NestedPinSpec[]
  /** Replace inferred pins entirely (rare). */
  pins?: readonly string[]
  /** Per-field canvas role. Omit = infer (link/wref → pin, ref → contain). */
  fields?: Readonly<Record<string, FieldRole>>
  /**
   * How this $type appears on the canvas.
   * node — diagram box + nodesToInit (default)
   * aux — diagram box, not an engine AnimNode (conditions, sync, interpolators)
   * embedded — registry payload only, no diagram box
   * wrapper — unused for engine types; diagram-native wrap lives in `wrap`
   */
  appearance?: ProjectionAppearance
  /**
   * Diagram-native wrapper around this $type's box.
   * Contain assignment is unchanged; pin inputs of this node are reparented into the wrapper.
   */
  wrap?: string
}
