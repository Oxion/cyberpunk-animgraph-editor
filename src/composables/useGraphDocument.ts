/**
 * Graph document façade: load/save/export IO.
 * IO implementation lives in stores/graphDocumentIo.
 * Pixi surfaces are owned by body/window view content components.
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
import { diagramViewReadyRef } from '../stores/diagramViewReady'
import {
  presentActiveDiagram,
  presentAddedDiagram,
  presentClosedProject,
  presentReplacedProject,
} from '../stores/projectViewSession'

export {
  applyProjectDiagramEdits,
  closeWelcomePanel,
  closeAddAnimgraphDialog,
  closeProjectDialog,
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
  openProjectDialog,
  pendingDiagramLoad,
  processFile,
  processParsedData,
  rewriteProjectFileDiagrams,
  saveCurrentGraph,
  saveGraphToServer,
  showSaveAsDialog,
  showAddAnimgraphDialog,
  showExportDialog,
  showProjectDialog,
  showWelcomeOpen,
  suggestedExportFileName,
} from '../stores/graphDocumentIo'

export {
  diagramViewReadyRef,
  presentActiveDiagram,
  presentAddedDiagram,
  presentClosedProject,
  presentReplacedProject,
}

export type GraphDocumentHost = GraphDocumentIoHost

export function bindGraphDocument(next: GraphDocumentHost) {
  bindGraphDocumentIo(next)
}

export function useGraphDocument() {
  return {
    loadingRef,
    diagramViewReadyRef,
    fileSize,
    processFile,
    presentActiveDiagram,
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
  }
}
