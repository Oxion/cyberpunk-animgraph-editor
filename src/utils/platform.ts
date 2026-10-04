/** Runtime host detection (browser vs Electron). Not FS-specific. */
export function isElectron(): boolean {
  return typeof window !== 'undefined' && Boolean(window.electronAPI?.isElectron)
}
