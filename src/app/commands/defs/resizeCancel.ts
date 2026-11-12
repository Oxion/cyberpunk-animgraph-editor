import { AppCommandDef } from "@/core/commands"

export const ResizeCancelCommandId = 'resize.cancel'

export interface ResizeCancelCommandDef extends AppCommandDef {
  id: typeof ResizeCancelCommandId
}

declare module '@/core/commands/types' {
  interface AppCommandMap {
    [ResizeCancelCommandId]: ResizeCancelCommandDef
  }
}

export const resizeCancelCommandDef: ResizeCancelCommandDef = {
  id: ResizeCancelCommandId,
  label: 'Cancel Resize',
  group: 'Resize',
  when: 'resizeInProgress',
}