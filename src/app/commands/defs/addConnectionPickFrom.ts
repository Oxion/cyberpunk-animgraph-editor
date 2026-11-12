import { AppCommandDef } from "@/core/commands"

export const AddConnectionPickFromCommandId = 'addConnection.pickFrom'

export interface AddConnectionPickFromCommandDef extends AppCommandDef {
  id: typeof AddConnectionPickFromCommandId
}

declare module '@/core/commands/types' {
  interface AppCommandMap {
    [AddConnectionPickFromCommandId]: AddConnectionPickFromCommandDef
  }
}

export const addConnectionPickFromCommandDef: AddConnectionPickFromCommandDef = {
  id: AddConnectionPickFromCommandId,
  label: 'Pick Source from Selection',
  group: 'Connection',
  when: 'canPickConnectionEndpoint',
}