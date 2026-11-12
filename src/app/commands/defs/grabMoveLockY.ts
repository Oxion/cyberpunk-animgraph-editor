import { AppCommandDef } from "@/core/commands"

export const GrabMoveLockYCommandId = 'grabMove.lockY'

export interface GrabMoveLockYCommandDef extends AppCommandDef {
  id: typeof GrabMoveLockYCommandId
}

declare module '@/core/commands/types' {
  interface AppCommandMap {
    [GrabMoveLockYCommandId]: GrabMoveLockYCommandDef
  }
}

export const grabMoveLockYCommandDef: GrabMoveLockYCommandDef = {
  id: GrabMoveLockYCommandId,
  label: 'Lock Move Axis Y',
  group: 'Move',
  when: 'moveInProgress',
}