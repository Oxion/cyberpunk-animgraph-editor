import { Container, ImageSource, Texture, TilingSprite } from 'pixi.js'
import {
  paintMinorDotCell,
  resolveDotGridLod,
  subscribeDiagramGridSettings,
} from './diagramDotGrid'

export type PixiDotGrid = {
  root: Container
  resize: (width: number, height: number) => void
  sync: (panX: number, panY: number, zoom: number) => void
  destroy: () => void
}

function canvasToRepeatTexture(canvas: HTMLCanvasElement): Texture {
  const source = new ImageSource({
    resource: canvas,
    width: Math.max(canvas.width, 2),
    height: Math.max(canvas.height, 2),
    resolution: 1,
    addressMode: 'repeat',
    scaleMode: 'nearest',
  })
  source.autoGarbageCollect = false
  return new Texture({ source, dynamic: true })
}

function uploadCell(texture: Texture, canvas: HTMLCanvasElement): void {
  const source = texture.source
  if (source.width !== canvas.width || source.height !== canvas.height) {
    source.resize(canvas.width, canvas.height, 1)
  }
  source.update()
}

function makeTile(texture: Texture): TilingSprite {
  const sprite = new TilingSprite({ texture, width: 1, height: 1 })
  sprite.eventMode = 'none'
  return sprite
}

function applyTile(
  sprite: TilingSprite,
  panX: number,
  panY: number,
  screenSize: number,
  texSize: number,
  alpha: number,
): void {
  const scale = screenSize / Math.max(texSize, 1)
  sprite.tileScale.set(scale, scale)
  sprite.tilePosition.set(panX, panY)
  sprite.alpha = alpha
  sprite.visible = alpha > 0.01
}

/** Fullscreen tiling sprites; pan only moves `tilePosition`. Glyphs stay ~1px. */
export function createPixiDotGrid(onInvalidate?: () => void): PixiDotGrid {
  const minorCanvas = document.createElement('canvas')
  const majorCanvas = document.createElement('canvas')
  minorCanvas.width = 2
  minorCanvas.height = 2
  majorCanvas.width = 2
  majorCanvas.height = 2

  const minorTex = canvasToRepeatTexture(minorCanvas)
  const majorTex = canvasToRepeatTexture(majorCanvas)
  const root = new Container()
  root.eventMode = 'none'
  root.label = 'diagram-dot-grid'

  const minor = makeTile(minorTex)
  const major = makeTile(majorTex)
  root.addChild(minor)
  root.addChild(major)

  let lastPanX = 0
  let lastPanY = 0
  let lastZoom = 1
  let paintedMinorScreen = Number.NaN
  let paintedMajorScreen = Number.NaN

  const sync = (panX: number, panY: number, zoom: number, forcePaint = false) => {
    lastPanX = panX
    lastPanY = panY
    lastZoom = zoom
    const lod = resolveDotGridLod(zoom)
    if (lod.minorAlpha > 0.01 && (forcePaint || paintedMinorScreen !== lod.minorScreen)) {
      const texSize = paintMinorDotCell(minorCanvas, lod.minorScreen)
      uploadCell(minorTex, minorCanvas)
      paintedMinorScreen = lod.minorScreen
      applyTile(minor, panX, panY, lod.minorScreen, texSize, lod.minorAlpha)
    } else {
      applyTile(minor, panX, panY, lod.minorScreen, minorCanvas.width, lod.minorAlpha)
    }

    const wantMajor = lod.majorAlpha > 0.01 && lod.majorScreen > 0
    if (wantMajor && (forcePaint || paintedMajorScreen !== lod.majorScreen)) {
      const texSize = paintMinorDotCell(majorCanvas, lod.majorScreen)
      uploadCell(majorTex, majorCanvas)
      paintedMajorScreen = lod.majorScreen
      applyTile(major, panX, panY, lod.majorScreen, texSize, lod.majorAlpha)
    } else {
      applyTile(
        major,
        panX,
        panY,
        lod.majorScreen,
        majorCanvas.width,
        wantMajor ? lod.majorAlpha : 0,
      )
    }
  }

  const unsub = subscribeDiagramGridSettings(() => {
    paintedMinorScreen = Number.NaN
    paintedMajorScreen = Number.NaN
    sync(lastPanX, lastPanY, lastZoom, true)
    onInvalidate?.()
  })

  return {
    root,
    resize(width: number, height: number) {
      minor.width = width
      minor.height = height
      major.width = width
      major.height = height
    },
    sync(panX: number, panY: number, zoom: number) {
      sync(panX, panY, zoom)
    },
    destroy() {
      unsub()
    },
  }
}
