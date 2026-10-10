import type {
  AppWindowOpenOptions,
  AppWindowPayloadByType,
  AppWindowState,
  AppWindowType,
} from '../../../types/AppWindow'

export type WindowReuseKind = 'none' | 'preview' | 'singleton' | 'match'

export type WindowOpenPolicy<T extends AppWindowType> = {
  reuse: WindowReuseKind
  matchExisting?: (
    win: Extract<AppWindowState, { type: T }>,
    payload: AppWindowPayloadByType[T]
  ) => boolean
  resolvePreview: (
    payload: AppWindowPayloadByType[T],
    options: AppWindowOpenOptions
  ) => boolean
  makeId: (payload: AppWindowPayloadByType[T]) => string
  title: (payload: AppWindowPayloadByType[T], preview: boolean) => string
  minSize?: { width: number; height: number }
  autoSize?: boolean
  afterOpen?: (
    win: Extract<AppWindowState, { type: T }>,
    reason: 'create' | 'reuse'
  ) => void
}
