/**
 * Concrete HandleDef users (consoles / default WorkspotHub accessor).
 * Kept out of animgraphSim to avoid circular imports with HandleDef resolvers.
 */
import type { SimDriver } from '../utils/sim/simDriver'
import type { SimDriverHandleDef } from '../utils/sim/simDriverHandleDef'
import { LookAtDriverHandleDef } from '../utils/sim/simLookAtDriverHandleDef'
import { MixerSlotDriverHandleDef } from '../utils/sim/simMixerSlotDriverHandleDef'
import { WorkspotHubDriverHandleDef } from '../utils/sim/simWorkspotHubDriverHandleDef'
import { installSimLookAtConsole } from '../utils/sim/simLookAtDriver'
import { installSimMixerSlotConsole } from '../utils/sim/simMixerSlotDriver'
import {
  installSimWorkspotHubConsole,
  type SimWorkspotHubDriver,
} from '../utils/sim/simWorkspotHubDriver'
import type { SimGraphRunner } from '../utils/sim/SimGraphRunner'
import {
  bumpSimDriversStructural,
  ensureDefaultSimDriver,
  getSimDriverHandle,
  simGetPrimaryRunner,
  simGetRunner,
} from './animgraphSim'

export function simWorkspotHub(): SimWorkspotHubDriver {
  return ensureDefaultSimDriver(WorkspotHubDriverHandleDef).driver
}

function driverConsoleHost<T extends SimDriver>(
  handleDef: SimDriverHandleDef<T, void>
) {
  return {
    getDriver: () =>
      ensureDefaultSimDriver(handleDef, undefined, { silent: true }).driver,
    attach: (runner?: SimGraphRunner) => {
      const handle = ensureDefaultSimDriver(handleDef)
      const r = runner ?? simGetPrimaryRunner() ?? undefined
      if (!r) {
        console.warn(
          `[simDriver:${handleDef.driverDef.id}] no runner — open/play a sim diagram first`
        )
        handleDef.attach(handle)
        return
      }
      handle.attach({ runner: r })
      bumpSimDriversStructural(true)
    },
    detach: () => {
      const handle = getSimDriverHandle(handleDef)
      handle?.detach()
      bumpSimDriversStructural(true)
    },
    getAttachedRunner: () => {
      const handle = getSimDriverHandle(handleDef)
      if (!handle?.runnerId) return null
      return simGetRunner(handle.runnerId)
    },
    getPrimaryRunner: simGetPrimaryRunner,
  }
}

installSimLookAtConsole(driverConsoleHost(LookAtDriverHandleDef))
installSimMixerSlotConsole(driverConsoleHost(MixerSlotDriverHandleDef))
installSimWorkspotHubConsole({
  getDriver: () =>
    ensureDefaultSimDriver(WorkspotHubDriverHandleDef, undefined, {
      silent: true,
    }).driver,
})
