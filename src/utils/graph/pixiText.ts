import {
  BitmapFont,
  BitmapFontManager,
  BitmapText,
  type TextStyle,
  type TextStyleOptions
} from 'pixi.js'
import { PROPERTY_ROW_FONT_SIZE } from './DiagramConversion'

/** Shared UI + diagram sans (loaded via `@fontsource/inter` in main.ts). */
export const DIAGRAM_FONT_FAMILY = 'Inter, Arial, sans-serif'

/** Installed bitmap-font name used by BitmapText (`fontFamily` in style). */
export const DIAGRAM_BITMAP_FONT_NAME = 'Inter'

export type DiagramText = BitmapText

export type DiagramTextOptions = {
  text: string
  style: TextStyle | TextStyleOptions
}

let diagramBitmapFontInstalled = false

function diagramBitmapChars(): (string | string[])[] {
  return [
    ...BitmapFontManager.ASCII,
    ['\u00A0', '\u00FF'], // Latin-1 Supplement
    ['\u0100', '\u017F'], // Latin Extended-A
    ['\u0370', '\u03FF'], // Greek and Coptic
    ['\u0400', '\u04FF'], // Cyrillic
    '▣⧉…—–•',
  ]
}

function installDiagramBitmapFont(): void {
  if (diagramBitmapFontInstalled) return
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
  BitmapFont.install({
    name: DIAGRAM_BITMAP_FONT_NAME,
    style: {
      fontFamily: DIAGRAM_BITMAP_FONT_NAME,
      fontSize: 96,
      fill: '#ffffff',
      fontWeight: '400',
    },
    chars: diagramBitmapChars(),
    resolution: Math.min(3, Math.max(1, Math.round(dpr))),
    padding: 8,
    dynamicFill: true,
    textureStyle: {
      scaleMode: 'linear',
      maxAnisotropy: 16,
    },
  })
  diagramBitmapFontInstalled = true
}

/**
 * Rasterize Inter into one tintable atlas. Call after `document.fonts.ready`
 * so glyphs are not baked as Arial. Missing glyphs are added on demand
 * (same atlas — still one batch).
 *
 * MSDF is intentionally not used: Pixi v8 sets `customShader` on each
 * distance-field BitmapText, which forces `isBatchable = false` (one draw
 * per label). Regular bitmap stays on the default Graphics batcher.
 */
export async function ensureDiagramBitmapFont(): Promise<void> {
  if (diagramBitmapFontInstalled) return
  if (typeof document !== 'undefined' && document.fonts?.ready) {
    try {
      await document.fonts.ready
    } catch {
      /* ignore */
    }
  }
  
  installDiagramBitmapFont()
}

export function isDiagramText(obj: unknown): obj is DiagramText {
  return obj instanceof BitmapText
}

export function createDiagramText(options: DiagramTextOptions): DiagramText {
  const text = new BitmapText({
    text: options.text,
    style: {
      ...options.style,
      fontFamily: DIAGRAM_BITMAP_FONT_NAME,
    },
    // roundPixels: true,
  })
  text.eventMode = 'none'
  return text
}

/**
 * Per-node `cacheAsTexture` LOD. Test kill-switch: hundreds of RenderGroups
 * drop FPS when this kicks in (~zoom 0.4). Set true to restore old behavior.
 */
export const ENABLE_NODE_TEXT_LOD_CACHE = false

/**
 * CSS px below which pin/row glyphs are effectively unreadable → cache node as texture.
 * Default ≈ zoom ≤ 0.4 at PROPERTY_ROW_FONT_SIZE=10 (`fontSize × worldZoom`).
 */
export const DEFAULT_TEXT_LOD_CACHE_SCREEN_PX = 4

/** Debug override for the screen-px threshold; `null` = use default. */
let debugTextLodCacheScreenPx: number | null = null

export function setDebugTextLodCacheScreenPx(px: number | null): void {
  if (px == null || !Number.isFinite(px) || px < 0) {
    debugTextLodCacheScreenPx = null
    return
  }
  debugTextLodCacheScreenPx = px
}

export function getDebugTextLodCacheScreenPx(): number | null {
  return debugTextLodCacheScreenPx
}

export function getTextLodCacheScreenPxThreshold(): number {
  return debugTextLodCacheScreenPx ?? DEFAULT_TEXT_LOD_CACHE_SCREEN_PX
}

/** On-screen height of a pin/row glyph in CSS pixels. */
export function getPinLabelScreenPx(
  worldZoom: number,
  fontSize: number = PROPERTY_ROW_FONT_SIZE
): number {
  return fontSize * worldZoom
}

/** True when pin/row text should be baked via cacheAsTexture. */
export function shouldCacheNodeTextLod(
  worldZoom: number,
  fontSize: number = PROPERTY_ROW_FONT_SIZE
): boolean {
  if (!ENABLE_NODE_TEXT_LOD_CACHE) return false
  return getPinLabelScreenPx(worldZoom, fontSize) <= getTextLodCacheScreenPxThreshold()
}

/**
 * Texture resolution for LOD bake. Pixi caches at local size then world-scales;
 * use near-screen density so min-zoom textures stay small ([docs](https://pixijs.com/8.x/guides/components/scene-objects/container/cache-as-texture)).
 */
export function getNodeTextLodCacheResolution(worldZoom: number): number {
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
  return Math.max(0.25, Math.min(2, worldZoom * dpr))
}
