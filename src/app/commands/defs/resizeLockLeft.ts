import { AppCommandDef } from "@/core/commands"

export const ResizeLockLeftCommandId = 'resize.lockLeft'

export interface ResizeLockLeftCommandDef extends AppCommandDef {
  id: typeof ResizeLockLeftCommandId
}

declare module '@/core/commands/types' {
  interface AppCommandMap {
    [ResizeLockLeftCommandId]: ResizeLockLeftCommandDef
  }
}

export const resizeLockLeftCommandDef: ResizeLockLeftCommandDef = {
  id: ResizeLockLeftCommandId,
  label: 'Lock Resize Left (A)',
  group: 'Resize',
  when: 'resizeInProgress',
}