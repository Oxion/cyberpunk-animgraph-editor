import { SimDriverDef } from './simDriver'
import { SimLookAtDriver } from './simLookAtDriver'

export class LookAtSimDriverDef extends SimDriverDef<SimLookAtDriver> {
  readonly label = 'Look At'

  constructor() {
    super('lookAt', () => new SimLookAtDriver())
  }

  serialize(driver: SimLookAtDriver): unknown {
    return driver.listActive()
  }

  applyState(driver: SimLookAtDriver, state: unknown): void {
    if (!Array.isArray(state)) return
    driver.applyActive(state)
  }
}

export const LookAtDriverDef = new LookAtSimDriverDef()
