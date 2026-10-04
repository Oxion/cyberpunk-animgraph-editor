import { showSaveAsDialog } from '../stores/graphDocumentIo'

export function saveAs() {
  showSaveAsDialog.value = true
}
