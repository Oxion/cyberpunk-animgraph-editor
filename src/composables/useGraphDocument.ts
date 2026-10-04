/**
 * Graph document façade: load/save/export IO + main diagram mount bind.
 * IO implementation lives in stores/graphDocumentIo.
 */
import {
  bindGraphDocumentIo,
  closeWelcomePanel,
  closeAddAnimgraphDialog,
  currentLoadedPath,
  exportGraph,
  exportProject,
  exportToPath,
  fileSize,
  formatFileSize,
  handleSaveAs,
  loadingFromServer,
  loadingRef,
  loadGraphFromServer,
  loadSampleData,
  openWelcomePanel,
  openAddAnimgraphDialog,
  processFile,
  saveCurrentGraph,
  saveGraphToServer,
  showSaveAsDialog,
  showAddAnimgraphDialog,
  showExportDialog,
  showWelcomeOpen,
  type GraphDocumentIoHost,
} from '../stores/graphDocumentIo'
import {
  bindMainDiagramMount,
  bindDiagramCanvasEl,
  getDiagramCanvasEl,
  diagramViewReadyRef,
  remountProject,
  softActivateDiagram,
  syncDiagramReadyFromCanvas,
  teardownProjectView,
  type MainDiagramMountHost,
} from './useMainDiagramMount'
import {
  presentActiveDiagram,
  presentAddedDiagram,
  presentClosedProject,
  presentReplacedProject,
} from '../stores/projectViewSession'

export {
  closeWelcomePanel,
  closeAddAnimgraphDialog,
  createCleanExportData,
  createCleanNode,
  createMinimalExportData,
  createWolvenKitAnimgraphExport,
  currentLoadedPath,
  detectFileType,
  estimateDataSize,
  exportGraph,
  exportProject,
  exportToPath,
  fileSize,
  formatFileSize,
  formatJson,
  handleSaveAs,
  loadingFromServer,
  loadingRef,
  beginLoadFromPath,
  beginLoadFromFile,
  confirmPendingDiagramLoad,
  cancelPendingDiagramLoad,
  loadGraphFromServer,
  loadSampleData,
  openWelcomePanel,
  openAddAnimgraphDialog,
  pendingDiagramLoad,
  processFile,
  processParsedData,
  saveCurrentGraph,
  saveGraphToServer,
  showSaveAsDialog,
  showAddAnimgraphDialog,
  showExportDialog,
  showWelcomeOpen,
  suggestedExportFileName,
} from '../stores/graphDocumentIo'

export {
  diagramViewReadyRef,
  remountProject,
  softActivateDiagram,
  teardownProjectView,
  bindDiagramCanvasEl,
  getDiagramCanvasEl,
  syncDiagramReadyFromCanvas,
  presentActiveDiagram,
  presentAddedDiagram,
  presentClosedProject,
  presentReplacedProject,
}

export type GraphDocumentHost = MainDiagramMountHost & GraphDocumentIoHost

export function bindGraphDocument(next: GraphDocumentHost) {
  bindGraphDocumentIo(next)
  bindMainDiagramMount(next)
}

export function useGraphDocument() {
  return {
    loadingRef,
    diagramViewReadyRef,
    fileSize,
    processFile,
    remountProject,
    softActivateDiagram,
    presentActiveDiagram,
    bindDiagramCanvasEl,
    loadSampleData,
    exportGraph,
    exportProject,
    exportToPath,
    showSaveAsDialog,
    showAddAnimgraphDialog,
    showExportDialog,
    showWelcomeOpen,
    loadingFromServer,
    currentLoadedPath,
    openWelcomePanel,
    closeWelcomePanel,
    openAddAnimgraphDialog,
    closeAddAnimgraphDialog,
    saveGraphToServer,
    loadGraphFromServer,
    formatFileSize,
    saveCurrentGraph,
    handleSaveAs,
    syncDiagramReadyFromCanvas,
  }
}
