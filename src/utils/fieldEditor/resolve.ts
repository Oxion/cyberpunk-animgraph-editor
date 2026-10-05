import { TYPE_FIELD_EDITOR_OVERLAYS } from './definitions'
import type { FieldEditorOverlay } from './types'

export function getTypeFieldEditorOverlay(
  typeName: string,
  fieldKey: string
): FieldEditorOverlay | undefined {
  return TYPE_FIELD_EDITOR_OVERLAYS[typeName]?.[fieldKey]
}
