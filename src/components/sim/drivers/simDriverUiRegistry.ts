/**
 * Vue component map for sim driver kinds (SimPanel dynamic panels).
 */
import type { Component } from 'vue'
import type { SimDriver, SimDriverDef } from '../../../utils/sim/simDriver'
import { LookAtDriverDef } from '../../../utils/sim/simLookAtDriverDef'
import { MixerSlotDriverDef } from '../../../utils/sim/simMixerSlotDriverDef'
import { WorkspotHubDriverDef } from '../../../utils/sim/simWorkspotHubDriverDef'
import SimLookAtDriverPanel from './SimLookAtDriverPanel.vue'
import SimMixerSlotDriverPanel from './SimMixerSlotDriverPanel.vue'
import SimWorkspotHubDriverPanel from './SimWorkspotHubDriverPanel.vue'

const uiByKind = new Map<string, Component>()

export function registerSimDriverUi(
  kind: SimDriverDef<SimDriver, unknown> | { id: string },
  component: Component
): void {
  uiByKind.set(kind.id, component)
}

export function resolveSimDriverUi(
  kind: SimDriverDef<SimDriver, unknown> | { id: string } | string
): Component | null {
  const id = typeof kind === 'string' ? kind : kind.id
  return uiByKind.get(id) ?? null
}

export function listSimDriverUiKinds(): string[] {
  return [...uiByKind.keys()]
}

registerSimDriverUi(LookAtDriverDef, SimLookAtDriverPanel)
registerSimDriverUi(MixerSlotDriverDef, SimMixerSlotDriverPanel)
registerSimDriverUi(WorkspotHubDriverDef, SimWorkspotHubDriverPanel)
