import type { Component } from 'vue'
import type { AppToolId } from '@/core/tools'
import {
  AlignStartVertical,
  ClipboardPaste,
  LayoutGrid,
  Link2,
  ListTree,
  ArrowUpDown,
  Move,
  PlusIcon,
  Scaling,
  Wrench,
} from 'lucide-vue-next'
import { Tools } from '@/app/tools/ids'

/** UI-only: lucide icons for menus / chrome. Not part of tool defs. */
export const toolIcons: Record<AppToolId, Component> = {
  [Tools.move]: Move,
  [Tools.resize]: Scaling,
  [Tools.addNode]: PlusIcon,
  [Tools.pasteNode]: ClipboardPaste,
  [Tools.addConnection]: Link2,
  [Tools.attachHandle]: Wrench,
  [Tools.arrangeInputs]: AlignStartVertical,
  [Tools.selectInputs]: ListTree,
  [Tools.arrangeSelection]: LayoutGrid,
  [Tools.connectionDrag]: Link2,
  [Tools.nodeNudge]: ArrowUpDown,
}
