import { AppCommandDef } from "@/core/commands"

export const ResizeLockBottomCommandId = 'resize.lockBottom'

export interface ResizeLockBottomCommandDef extends AppCommandDef {
  id: typeof ResizeLockBottomCommandId
}

declare module '@/core/commands/types' {
  interface AppCommandMap {
    [ResizeLockBottomCommandId]: ResizeLockBottomCommandDef
  }
}

export const resizeLockBottomCommandDef: ResizeLockBottomCommandDef = {
  id: ResizeLockBottomCommandId,
  label: 'Lock Resize Bottom (S)',
  group: 'Resize',
  when: 'resizeInProgress',
}