import {
  sim
} from '../../stores/animgraphSim'
import type { SimDriverAttachCtx, SimDriverHandle } from './simDriver'
import { SimDriverHandleDef } from './simDriverHandleDef'
import { registerSimDriverHandleDef } from './simDriverHandleRegistry'
import type { SimLookAtDriver } from './simLookAtDriver'
import { LookAtDriverDef } from './simLookAtDriverDef'

function resolveLookAtAttachCtx(
  handle: SimDriverHandle<SimLookAtDriver>
): SimDriverAttachCtx | null {
  const runner = (handle.runnerId ? sim.getRunner(handle.runnerId) : null) ??
    sim.getPrimaryRunner()
  return runner ? { runner } : null
}

export const LookAtDriverHandleDef = new SimDriverHandleDef({
  driverDef: LookAtDriverDef,
  resolveAttachCtx: resolveLookAtAttachCtx,
})

registerSimDriverHandleDef(LookAtDriverHandleDef)
