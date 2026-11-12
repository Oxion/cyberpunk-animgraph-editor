import type { AppCommandDef } from "@/core/commands/types";

export const HistoryUndoCommandId = 'history.undo'

export interface HistoryUndoCommandDef extends AppCommandDef {
  id: typeof HistoryUndoCommandId
}

declare module '@/core/commands/types' {
  interface AppCommandMap {
    [HistoryUndoCommandId]: HistoryUndoCommandDef
  }
}

export const historyUndoCommandDef: HistoryUndoCommandDef = { 
  id: HistoryUndoCommandId, 
  label: 'Undo', 
  group: 'History' 
}