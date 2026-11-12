import { AppCommandDef } from "@/core/commands"

export const GrabMoveLockXCommandId = 'grabMove.lockX'

export interface GrabMoveLockXCommandDef extends AppCommandDef {
  id: typeof GrabMoveLockXCommandId
}

declare module '@/core/commands/types' {
  interface AppCommandMap {
    [GrabMoveLockXCommandId]: GrabMoveLockXCommandDef
  }
}

export const grabMoveLockXCommandDef: GrabMoveLockXCommandDef = {
  id: GrabMoveLockXCommandId,
  label: 'Lock Move Axis X',
  group: 'Move',
  when: 'moveInProgress',
}