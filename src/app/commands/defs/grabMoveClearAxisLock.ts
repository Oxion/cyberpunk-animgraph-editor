import { AppCommandDef } from "@/core/commands"

export const GrabMoveClearAxisLockCommandId = 'grabMove.clearAxisLock'

export interface GrabMoveClearAxisLockCommandDef extends AppCommandDef {
  id: typeof GrabMoveClearAxisLockCommandId
}

declare module '@/core/commands/types' {
  interface AppCommandMap {
    [GrabMoveClearAxisLockCommandId]: GrabMoveClearAxisLockCommandDef
  }
}

export const grabMoveClearAxisLockCommandDef: GrabMoveClearAxisLockCommandDef = {
  id: GrabMoveClearAxisLockCommandId,
  label: 'Clear Move Axis Lock',
  group: 'Move',
  when: 'moveInProgress',
}