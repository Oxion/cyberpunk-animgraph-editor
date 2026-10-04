import type { Component } from 'vue'
import {
  AlignStartVertical,
  ClipboardPaste,
  LayoutGrid,
  Link2,
  ListTree,
  Move,
  PlusIcon,
  Scaling,
  Wrench,
} from 'lucide-vue-next'
import type { AppCommandId } from '../commands'

export type AppToolId =
  | 'move'
  | 'resize'
  | 'addNode'
  | 'pasteNode'
  | 'addConnection'
  | 'attachHandle'
  | 'arrangeInputs'
  | 'selectInputs'
  | 'arrangeSelection'

export type AppToolItem = {
  id: AppToolId
  label: string
  icon: Component
  /** Command whose current binding is shown as the menu shortcut. */
  commandId?: AppCommandId
  /** Named when-predicate; omit = command precondition (if commandId) or always. */
  when?: string
}

export const appToolItems: AppToolItem[] = [
  { id: 'move', label: 'Move', icon: Move, commandId: 'grabMove.begin', when: 'graphEditable' },
  { id: 'resize', label: 'Resize', icon: Scaling, commandId: 'resize.begin', when: 'graphEditable' },
  { id: 'addNode', label: 'Add Node', icon: PlusIcon, commandId: 'addNode.focus', when: 'graphEditable' },
  { id: 'pasteNode', label: 'Paste Node', icon: ClipboardPaste, when: 'graphEditable' },
  { id: 'addConnection', label: 'Add Connection', icon: Link2, commandId: 'addConnection.focus', when: 'graphEditable' },
  { id: 'arrangeInputs', label: 'Arrange Inputs', icon: AlignStartVertical, when: 'graphEditable' },
  { id: 'selectInputs', label: 'Select Inputs', icon: ListTree, when: 'graphEditable' },
  { id: 'arrangeSelection', label: 'Arrange Selection', icon: LayoutGrid, when: 'graphEditable' },
  { id: 'attachHandle', label: 'Attach Handle', icon: Wrench, when: 'graphEditable' },
]

export const editMenuTools = appToolItems.filter(
  (tool) => tool.id === 'move' || tool.id === 'resize' || tool.id === 'pasteNode'
)

export const addMenuTools = appToolItems.filter(
  (tool) =>
    tool.id === 'addNode' ||
    tool.id === 'addConnection' ||
    tool.id === 'attachHandle'
)

export const selectMenuTools = appToolItems.filter((tool) => tool.id === 'selectInputs')

export const arrangeMenuTools = appToolItems.filter(
  (tool) => tool.id === 'arrangeInputs' || tool.id === 'arrangeSelection'
)

export const getAppToolLabel = (id: AppToolId | null) =>
  appToolItems.find((tool) => tool.id === id)?.label ?? 'Tools'
