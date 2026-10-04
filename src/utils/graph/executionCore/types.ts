/**
 * Engine execution semantics for animgraph handles — separate from projection
 * (diagram canvas rules) and sim runtime (weights, active SM state per frame).
 *
 * Used to find structural pose-graph core: reverse walk from sinks (Output) and
 * entry (Root), without sim gating.
 */

export type ExecutionRoleDef = {
  /** Reverse-walk sink: pose evaluation terminates here (Output). */
  sink?: boolean
  /** Prefer this $type when resolving a sink inside sinkHostFields children. */
  preferredSinkType?: string
  /** Contain fields hosting nested subgraphs that contain sinks (State.nodes, SM.states). */
  sinkHostFields?: readonly string[]
  /** Whole-animgraph entry handle (Root). */
  entry?: boolean
  /** Pose link fields from entry into the main graph (Root.outputNode). */
  entryPoseFields?: readonly string[]
  /** Engine init root — never auto-demoted from nodesToInit on disconnect. */
  initAnchor?: boolean
}

export type ExecutionRoleRegistration = {
  typeName: string
  role: ExecutionRoleDef
}
