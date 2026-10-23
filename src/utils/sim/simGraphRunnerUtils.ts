import { WalkCtx } from "./SimGraphRunner.types"
import { SimNodeState } from "./simTypes"

export function markActive(
  simNodeStateByHandleIds: Record<string, SimNodeState>,
  id: string,
  weight?: number,
  alpha?: number
): void {
  const simNodeState = simNodeStateByHandleIds[id]
  if (!simNodeState) {
    simNodeStateByHandleIds[id] = { active: true, weight, alpha }
    return
  }
  simNodeState.active = true
  simNodeState.weight = weight
  simNodeState.alpha = alpha
}

export function wasBoneOpActive(ctx: WalkCtx, handleId: string): boolean {
  return !!ctx.prevNodes?.[handleId]?.active
}