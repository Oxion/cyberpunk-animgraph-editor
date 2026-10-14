/**
 * Per-type bind compile hooks. Called once per handle from compileSimGraph.
 */

import type { AnimgraphNode } from '../graph/animgraphTypes'
import type { SimCompileCtx } from './simCompile'
import {
  compileIkTargetsControllerNode,
  resolveGenerateIkChainSettings,
  resolveHumanIkChainSettings,
} from './ikTargetsControllerSim'
import { compileLookAtControllerNode } from './lookAtControllerSim'
import { compileLookAtVehicleRestrictionsNode } from './lookAtVehicleRestrictionsSim'
import { compileMixerSlotNode } from './mixerSlotSim'
import { compileWorkspotHubNode } from './workspotHubSim'

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
    return
  }
  if (t === 'animAnimNode_MixerSlot') {
    compileMixerSlotNode(node, ctx)
    return
  }
  if (t === 'animAnimNode_WorkspotHub') {
    compileWorkspotHubNode(node, ctx)
    return
  }
  if (t === 'animAnimNode_GenerateIkAnimFeatureData') {
    compileIkTargetsControllerNode(
      node,
      ctx,
      resolveGenerateIkChainSettings(node)
    )
    return
  }
  if (t === 'animAnimNode_HumanIk') {
    compileIkTargetsControllerNode(
      node,
      ctx,
      resolveHumanIkChainSettings(node, ctx.board)
    )
  }
}
