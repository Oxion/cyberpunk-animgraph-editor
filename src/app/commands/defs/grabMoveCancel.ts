import { AppCommandDef } from "@/core/commands"

export const GrabMoveCancelCommandId = 'grabMove.cancel'

export interface GrabMoveCancelCommandDef extends AppCommandDef {
  id: typeof GrabMoveCancelCommandId
}

declare module '@/core/commands/types' {
  interface AppCommandMap {
    [GrabMoveCancelCommandId]: GrabMoveCancelCommandDef
  }
}

export const grabMoveCancelCommandDef: GrabMoveCancelCommandDef = {
  id: GrabMoveCancelCommandId,
  label: 'Cancel Move',
  group: 'Move',
  when: 'moveInProgress',
}