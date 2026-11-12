import { AppCommandDef } from "@/core/commands";

export const ConnectionDragCancelCommandId = 'connectionDrag.cancel'

export interface ConnectionDragCancelCommandDef extends AppCommandDef {
  id: typeof ConnectionDragCancelCommandId
}

declare module '@/core/commands/types' {
  interface AppCommandMap {
    [ConnectionDragCancelCommandId]: ConnectionDragCancelCommandDef
  }
}

export const connectionDragCancelCommandDef: ConnectionDragCancelCommandDef = {
  id: ConnectionDragCancelCommandId,
  label: 'Cancel Connection Drag',
  group: 'Connection',
  when: 'connectionDragInProgress',
}