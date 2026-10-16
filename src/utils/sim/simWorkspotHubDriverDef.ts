import type { SimAnimFeatureApi } from './simAnimFeatureApi'
import { SimDriverDef } from './simDriver'
import {
  SimWorkspotHubDriver,
  type WorkspotHubSnapshot,
} from './simWorkspotHubDriver'

/** Bound from animgraphSim so this module stays free of store import cycles. */
let getFeatureApi: (() => SimAnimFeatureApi) | null = null

export function bindWorkspotHubFeatureApi(fn: () => SimAnimFeatureApi): void {
  getFeatureApi = fn
}

export class WorkspotHubSimDriverDef extends SimDriverDef<SimWorkspotHubDriver> {
  readonly label = 'Workspot Hub'

  constructor() {
    super(
      'workspotHub',
      () =>
        new SimWorkspotHubDriver(() => {
          if (!getFeatureApi) {
            throw new Error(
              '[simDriver:workspotHub] feature API not bound — call bindWorkspotHubFeatureApi first'
            )
          }
          return getFeatureApi()
        })
    )
  }

  serialize(driver: SimWorkspotHubDriver): unknown {
    return driver.getSnapshot()
  }

  applyState(driver: SimWorkspotHubDriver, state: unknown): void {
    driver.applySnapshot(state as WorkspotHubSnapshot | null | undefined)
  }
}

export const WorkspotHubDriverDef = new WorkspotHubSimDriverDef()
