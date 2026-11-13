import { selectTool, Tools } from '@/app/tools'

export function focusAddNode() {
  selectTool(Tools.addNode)
}

export function focusAddConnection() {
  selectTool(Tools.addConnection)
}
