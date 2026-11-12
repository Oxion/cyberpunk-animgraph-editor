import { AppCommandDef } from "@/core/commands"

export const AddConnectionPickToCommandId = 'addConnection.pickTo'

export interface AddConnectionPickToCommandDef extends AppCommandDef {
  id: typeof AddConnectionPickToCommandId
}

declare module '@/core/commands/types' {
  interface AppCommandMap {
    [AddConnectionPickToCommandId]: AddConnectionPickToCommandDef
  }
}

export const addConnectionPickToCommandDef: AddConnectionPickToCommandDef = {
  id: AddConnectionPickToCommandId,
  label: 'Pick Target from Selection',
  group: 'Connection',
  when: 'canPickConnectionEndpoint',
}