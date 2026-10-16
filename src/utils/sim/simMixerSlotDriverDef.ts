import { SimDriverDef } from './simDriver'
import {
  SimMixerSlotDriver,
  type SimMixerSlotParamsState,
} from './simMixerSlotDriver'

function isMixerState(state: unknown): state is SimMixerSlotParamsState {
  return (
    !!state &&
    typeof state === 'object' &&
    Array.isArray((state as SimMixerSlotParamsState).normal)
  )
}

export class MixerSlotSimDriverDef extends SimDriverDef<SimMixerSlotDriver> {
  readonly label = 'Mixer Slot'

  constructor() {
    super('mixerSlot', () => new SimMixerSlotDriver())
  }

  serialize(driver: SimMixerSlotDriver): unknown {
    return driver.getParams()
  }

  applyState(driver: SimMixerSlotDriver, state: unknown): void {
    if (!isMixerState(state)) return
    driver.applyParams(state)
  }
}

export const MixerSlotDriverDef = new MixerSlotSimDriverDef()
