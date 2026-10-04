/**
 * Pre-render text width for diagram rows / chrome (Pixi CanvasTextMetrics).
 * Leaf module — no imports from DiagramConversion or NodeRowModel.
 */

import { CanvasTextMetrics, TextStyle } from 'pixi.js'
import { PROPERTY_ROW_FONT_SIZE } from './NodeChromeMetrics'
import { PIN_RADIUS } from './NodePins'
import { DIAGRAM_FONT_FAMILY } from './pixiText'

/** Horizontal inset for row labels (matches NodeRowPainter). */
export const ROW_TEXT_HORIZONTAL_PAD = PIN_RADIUS + 6

const ELLIPSIS = '…'

const widthCache = new Map<string, number>()
const ellipsizeCache = new Map<string, string>()

const styleByFontSize = new Map<number, TextStyle>()

function textStyleFor(fontSize: number): TextStyle {
  let style = styleByFontSize.get(fontSize)
  if (!style) {
    style = new TextStyle({
      fontSize,
      fontFamily: DIAGRAM_FONT_FAMILY,
    })
    styleByFontSize.set(fontSize, style)
  }
  return style
}

/** Measure single-line diagram text width in node-local CSS px. */
export function measureDiagramTextWidth(
  text: string,
  fontSize: number = PROPERTY_ROW_FONT_SIZE
): number {
  const key = `${fontSize}\0${text}`
  const cached = widthCache.get(key)
  if (cached !== undefined) return cached
  const width = CanvasTextMetrics.measureText(text, textStyleFor(fontSize)).width
  widthCache.set(key, width)
  return width
}

/** Trim text with Unicode ellipsis to fit maxWidth (binary search). */
export function ellipsizeDiagramText(
  text: string,
  maxWidth: number,
  fontSize: number = PROPERTY_ROW_FONT_SIZE
): string {
  if (maxWidth <= 0) return ''
  const key = `${fontSize}\0${maxWidth}\0${text}`
  const cached = ellipsizeCache.get(key)
  if (cached !== undefined) return cached

  if (measureDiagramTextWidth(text, fontSize) <= maxWidth) {
    ellipsizeCache.set(key, text)
    return text
  }

  const ellipsisW = measureDiagramTextWidth(ELLIPSIS, fontSize)
  if (maxWidth <= ellipsisW) {
    const result = maxWidth > 0 ? ELLIPSIS : ''
    ellipsizeCache.set(key, result)
    return result
  }

  const target = maxWidth - ellipsisW
  let lo = 0
  let hi = text.length
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    if (measureDiagramTextWidth(text.slice(0, mid), fontSize) <= target) {
      lo = mid
    } else {
      hi = mid - 1
    }
  }
  const result = lo > 0 ? `${text.slice(0, lo)}${ELLIPSIS}` : ELLIPSIS
  ellipsizeCache.set(key, result)
  return result
}

/** Max label width inside node content box for given horizontal pads. */
export function rowLabelMaxTextWidth(
  contentWidth: number,
  leftPad: number = ROW_TEXT_HORIZONTAL_PAD,
  rightPad: number = ROW_TEXT_HORIZONTAL_PAD
): number {
  return Math.max(0, contentWidth - leftPad - rightPad)
}
