import type { Component } from 'vue'
import type { AppToolId } from '../../appTools/catalog'
import AddNodeToolPanel from './AddNodeToolPanel.vue'
import ArrangeInputsToolPanel from './ArrangeInputsToolPanel.vue'
import ArrangeSelectionToolPanel from './ArrangeSelectionToolPanel.vue'
import AttachHandleToolPanel from './AttachHandleToolPanel.vue'
import PasteNodeToolPanel from './PasteNodeToolPanel.vue'
import CreateConnectionToolPanel from './CreateConnectionToolPanel.vue'
import MoveSessionHeader from './MoveSessionHeader.vue'
import MoveToolPanel from './MoveToolPanel.vue'
import ResizeSessionHeader from './ResizeSessionHeader.vue'
import ResizeToolPanel from './ResizeToolPanel.vue'
import SelectInputsToolPanel from './SelectInputsToolPanel.vue'

/** Optional Header = trailing chrome in SidebarPanel `#header` (status, …). */
export type ToolUiEntry = {
  Body: Component
  Header?: Component
}

export const toolUiRegistry: Record<AppToolId, ToolUiEntry> = {
  move: { Body: MoveToolPanel, Header: MoveSessionHeader },
  resize: { Body: ResizeToolPanel, Header: ResizeSessionHeader },
  addNode: { Body: AddNodeToolPanel },
  pasteNode: { Body: PasteNodeToolPanel },
  addConnection: { Body: CreateConnectionToolPanel },
  arrangeInputs: { Body: ArrangeInputsToolPanel },
  selectInputs: { Body: SelectInputsToolPanel },
  arrangeSelection: { Body: ArrangeSelectionToolPanel },
  attachHandle: { Body: AttachHandleToolPanel },
}
