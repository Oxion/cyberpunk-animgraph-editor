import { listAppTools, type AppToolId } from '@/core/tools'
import { registerAppToolDefs } from './defsCatalog'
import { registerAllAppToolHandlers } from './handlersCatalog'
import { wireAllToolActivationRunners } from './pipeline'

export { Tools } from './ids'
export type { AppToolId } from '@/core/tools'
export {
  activeToolsRegistry,
  canToggleTool,
  clearTools,
  deactivateAllTools,
  endSession,
  ensureToolForSession,
  focusedTool,
  panelTool,
  getInProgressToolId,
  getStackToolIds,
  isToolActive,
  isToolInProgress,
  popTool,
  pushTool,
  replaceTopTool,
  selectTool,
  startSession,
  toggleTool,
  toolEnabled,
  toolStack,
} from './pipeline'
export { getAppToolLabel } from '@/core/tools'

export function registerAppTools(): void {
  registerAppToolDefs()
  registerAllAppToolHandlers()
  wireAllToolActivationRunners(listAppTools().map((t) => t.id as AppToolId))
}
