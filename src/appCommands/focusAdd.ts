import { selectAppTool } from '../stores/appToolSelect'

export function focusAddNode() {
  selectAppTool('addNode')
}

export function focusAddConnection() {
  selectAppTool('addConnection')
}
