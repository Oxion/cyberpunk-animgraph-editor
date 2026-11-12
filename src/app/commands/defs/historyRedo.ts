import type { AppCommandDef } from "@/core/commands/types";

export const HistoryRedoCommandId = 'history.redo'

export interface HistoryRedoCommandDef extends AppCommandDef {
  id: typeof HistoryRedoCommandId
}

declare module '@/core/commands/types' {
  interface AppCommandMap {
    [HistoryRedoCommandId]: HistoryRedoCommandDef
  }
}

export const historyRedoCommandDef: HistoryRedoCommandDef = { 
  id: HistoryRedoCommandId, 
  label: 'Redo', 
  group: 'History' 
}