import type { Component } from 'vue'
import { Eye, Layers, MapPin } from 'lucide-vue-next'
import type { SimDriver, SimDriverDef } from '../../../utils/sim/simDriver'
import { LookAtDriverDef } from '../../../utils/sim/simLookAtDriverDef'
import { MixerSlotDriverDef } from '../../../utils/sim/simMixerSlotDriverDef'
import { WorkspotHubDriverDef } from '../../../utils/sim/simWorkspotHubDriverDef'

const iconsByDriverDefId = new Map<string, Component>([
  [LookAtDriverDef.id, Eye],
  [MixerSlotDriverDef.id, Layers],
  [WorkspotHubDriverDef.id, MapPin],
])

const FALLBACK_ICON: Component = Layers

export function registerSimDriverDefIcon(
  driverDef: SimDriverDef<SimDriver, unknown> | { id: string },
  icon: Component
): void {
  iconsByDriverDefId.set(driverDef.id, icon)
}

export function resolveSimDriverDefIcon(
  driverDef: SimDriverDef<SimDriver, unknown> | { id: string } | string
): Component {
  const id = typeof driverDef === 'string' ? driverDef : driverDef.id
  return iconsByDriverDefId.get(id) ?? FALLBACK_ICON
}
