import { AppCommandDef } from "@/core/commands"

export const ResizeClearSideLockCommandId = 'resize.clearSideLock'

export interface ResizeClearSideLockCommandDef extends AppCommandDef {
  id: typeof ResizeClearSideLockCommandId
}

declare module '@/core/commands/types' {
  interface AppCommandMap {
    [ResizeClearSideLockCommandId]: ResizeClearSideLockCommandDef
  }
}

export const resizeClearSideLockCommandDef: ResizeClearSideLockCommandDef = {
  id: ResizeClearSideLockCommandId,
  label: 'Clear Resize Side Lock',
  group: 'Resize',
  when: 'resizeInProgress',
}