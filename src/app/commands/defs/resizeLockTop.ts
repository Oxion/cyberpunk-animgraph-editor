import { AppCommandDef } from "@/core/commands"

export const ResizeLockTopCommandId = 'resize.lockTop'

export interface ResizeLockTopCommandDef extends AppCommandDef {
  id: typeof ResizeLockTopCommandId
}

declare module '@/core/commands/types' {
  interface AppCommandMap {
    [ResizeLockTopCommandId]: ResizeLockTopCommandDef
  }
}

export const resizeLockTopCommandDef: ResizeLockTopCommandDef = {
  id: ResizeLockTopCommandId,
  label: 'Lock Resize Top (W)',
  group: 'Resize',
  when: 'resizeInProgress',
}