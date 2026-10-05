/**
 * Inspector-only overlays for type fields (slider tracks, etc.).
 * Not system accept limits — those live on AnimFieldDef.range / type constraints.
 */

import type { AnimFieldRange } from '../animTypes'

export type FieldEditorOverlay = {
  /** UI slider track only — values may exceed this via typed input. */
  slider?: AnimFieldRange
}
