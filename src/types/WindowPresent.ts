/** How a new AppWindow is placed in `.app-windows-layer`. */
export type WindowPlacementPreset = 'left-stretch' | 'left-content' | 'dialog'

export type CameraPresentAlign = 'center' | 'top-start' | 'top-end'
export type CameraPresentFit = 'contain' | 'width' | 'none'
export type CameraPresentResolveId = 'sm-states-group'

type CameraFocusFields = {
  align: CameraPresentAlign
  fit: CameraPresentFit
  /** Explicit zoom; used when fit is `none`. */
  zoom?: number
  minZoom?: number
  maxZoom?: number
  padding?: number
}

/** Camera framing after the window/body content is ready. */
export type CameraPresentOp =
  | { id: 'fit-scope' }
  | ({ id: 'focus-section'; sectionId: string } & CameraFocusFields)
  | ({ id: 'focus-resolve'; resolve: CameraPresentResolveId } & CameraFocusFields)

export type HostPresentOp = { id: 'size-to-content' }

export type WindowPresentOp = CameraPresentOp | HostPresentOp

export interface WindowPresentOps {
  placement: WindowPlacementPreset
  preferredWidth: number
  /** Fraction of the graph/windows-layer width (e.g. 0.4 = 2/5). */
  widthFraction?: number
  preferredHeight: number
  afterReady?: WindowPresentOp
}
