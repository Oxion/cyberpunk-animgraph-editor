/**
 * Per-type bind compile hooks. Called once per handle from compileSimGraph.
 */

import type { AnimgraphNode } from '../graph/animgraphTypes'
import type { SimCompileCtx } from './simCompile'
import { compileLookAtControllerNode } from './lookAtControllerSim'
import { compileLookAtVehicleRestrictionsNode } from './lookAtVehicleRestrictionsSim'

export function compileSimNode(
  node: AnimgraphNode,
  ctx: SimCompileCtx
): void {
  const t = String(node?.Data?.$type ?? '')
  if (t === 'animAnimNode_LookAtController') {
    compileLookAtControllerNode(node, ctx)
    return
  }
  if (t === 'animAnimNode_LookAtApplyVehicleRestrictions') {
    compileLookAtVehicleRestrictionsNode(node, ctx)
  }
}
