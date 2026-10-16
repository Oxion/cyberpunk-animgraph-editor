import { SimDriverHandleDef } from './simDriverHandleDef'
import { registerSimDriverHandleDef } from './simDriverHandleRegistry'
import { WorkspotHubDriverDef } from './simWorkspotHubDriverDef'

export const WorkspotHubDriverHandleDef = new SimDriverHandleDef({
  driverDef: WorkspotHubDriverDef,
})

registerSimDriverHandleDef(WorkspotHubDriverHandleDef)
