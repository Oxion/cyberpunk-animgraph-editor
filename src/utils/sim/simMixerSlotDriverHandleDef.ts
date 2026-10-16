import {
  simGetPrimaryRunner,
  simGetRunner,
} from '../../stores/animgraphSim'
import type { SimDriverAttachCtx, SimDriverHandle } from './simDriver'
import { SimDriverHandleDef } from './simDriverHandleDef'
import { registerSimDriverHandleDef } from './simDriverHandleRegistry'
import type { SimMixerSlotDriver } from './simMixerSlotDriver'
import { MixerSlotDriverDef } from './simMixerSlotDriverDef'

function resolveMixerSlotAttachCtx(
  handle: SimDriverHandle<SimMixerSlotDriver>
): SimDriverAttachCtx | null {
  const runner =
    (handle.runnerId ? simGetRunner(handle.runnerId) : null) ??
    simGetPrimaryRunner() ??
    null
  return runner ? { runner } : null
}

export const MixerSlotDriverHandleDef = new SimDriverHandleDef({
  driverDef: MixerSlotDriverDef,
  resolveAttachCtx: resolveMixerSlotAttachCtx,
})

registerSimDriverHandleDef(MixerSlotDriverHandleDef)
