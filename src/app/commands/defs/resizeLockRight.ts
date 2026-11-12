import { AppCommandDef } from "@/core/commands"

export const ResizeLockRightCommandId = 'resize.lockRight'

export interface ResizeLockRightCommandDef extends AppCommandDef {
  id: typeof ResizeLockRightCommandId
}

declare module '@/core/commands/types' {
  interface AppCommandMap {
    [ResizeLockRightCommandId]: ResizeLockRightCommandDef
  }
}

export const resizeLockRightCommandDef: ResizeLockRightCommandDef = {
  id: ResizeLockRightCommandId,
  label: 'Lock Resize Right (D)',
  group: 'Resize',
  when: 'resizeInProgress',
}