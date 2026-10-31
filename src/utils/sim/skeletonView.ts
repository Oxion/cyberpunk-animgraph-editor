/**
 * Imperative Three.js stick-skeleton viewer for offline Sample poses.
 * Pose buffers are read each frame — do not put Pose into Vue reactive state.
 *
 * Draws rig bones + procedural stack slots; optional CSS2D name labels.
 * Bones can be hidden by name via {@link SkeletonView.setHiddenBones}.
 */

import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js'
import type { Pose } from './pose'
import { getTransformMs, type Qs } from './poseFk'
import type { RigEntry } from './rigResource'

/** RED Z-up → Three Y-up: (x, y, z) → (x, z, -y) */
function redToThree(x: number, y: number, z: number, out: THREE.Vector3): void {
  out.set(x, z, -y)
}

function sameStringSet(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a === b) return true
  if (a.size !== b.size) return false
  for (const v of a) if (!b.has(v)) return false
  return true
}

export type SkeletonBoneSelection = {
  name: string
  /** Unified index: rig [0..boneCount), stack [boneCount..) */
  unifiedIndex: number
  procedural: boolean
}

/** Joint click result — always fired; host decides select / menu / clear. */
export type SkeletonJointClick = {
  /** 0 = miss, 1 = unambiguous, >1 = ambiguous */
  candidates: SkeletonBoneSelection[]
  /** Position relative to the view container */
  x: number
  y: number
}

export type SkeletonViewOptions = {
  onJointClick?: (ev: SkeletonJointClick) => void
  /** Bone / stack slot names to omit from draw + pick. */
  hiddenBones?: Iterable<string>
}

type LabelEntry = {
  obj: CSS2DObject
  el: HTMLDivElement
  name: string
  unified: number
}

export class SkeletonView {
  readonly domElement: HTMLCanvasElement

  private readonly _container: HTMLElement
  private readonly _onJointClick?: (ev: SkeletonJointClick) => void

  private readonly _scene: THREE.Scene
  private readonly _camera: THREE.PerspectiveCamera
  private readonly _renderer: THREE.WebGLRenderer
  private readonly _labelRenderer: CSS2DRenderer
  private readonly _controls: OrbitControls
  private readonly _grid: THREE.GridHelper
  private readonly _axes: THREE.AxesHelper

  private readonly _boneMat: THREE.LineBasicMaterial
  private readonly _stackBoneMat: THREE.LineBasicMaterial
  private readonly _jointMat: THREE.PointsMaterial
  private readonly _stackJointMat: THREE.PointsMaterial
  private readonly _selectMat: THREE.PointsMaterial
  private readonly _selectGeom: THREE.BufferGeometry
  private readonly _selectPoints: THREE.Points
  private readonly _labelRoot: THREE.Group

  private readonly _raycaster = new THREE.Raycaster()
  private readonly _pointerNdc = new THREE.Vector2()
  private readonly _scratchQs: Qs = {
    tx: 0,
    ty: 0,
    tz: 0,
    qx: 0,
    qy: 0,
    qz: 0,
    qw: 1,
    sx: 1,
    sy: 1,
    sz: 1,
  }
  private readonly _tmp = new THREE.Vector3()
  /** Unified MS positions: [0..boneCount) rig, [boneCount..boneCount+stack) stack */
  private readonly _msPositions: THREE.Vector3[] = []
  private readonly _labels: LabelEntry[] = []

  private _boneGeom: THREE.BufferGeometry | null = null
  private _boneLines: THREE.LineSegments | null = null
  private _stackBoneGeom: THREE.BufferGeometry | null = null
  private _stackBoneLines: THREE.LineSegments | null = null
  private _jointGeom: THREE.BufferGeometry | null = null
  private _joints: THREE.Points | null = null
  private _stackJointGeom: THREE.BufferGeometry | null = null
  private _stackJoints: THREE.Points | null = null

  /** point index → unified index for pick */
  private _rigPickMap: number[] = []
  private _stackPickMap: number[] = []

  /** Desired settings (setters write only these). */
  private _rig: RigEntry | null = null
  private _showLabels = false
  private _hiddenBones = new Set<string>()
  private _hiddenBonesRev = 0

  /** Last settings/shape consumed by structure rebuild. */
  private _appliedRig: RigEntry | null = null
  private _appliedHiddenRev = -1
  private _meshRev = 0
  /** Mesh rev labels were last built against; -1 = none. */
  private _labelsMeshRev = -1
  private _allocatedTotal = 0
  private _lastStackCount = -1
  private _lastBoneN = 0
  private _lastPose: Pose | null = null
  private _rigEdgeCount = 0
  private _stackEdgeCount = 0
  private _selectedUnified = -1

  private _pointerDownX = 0
  private _pointerDownY = 0
  private _pointerDown = false

  private readonly _onPointerDown: (ev: PointerEvent) => void
  private readonly _onPointerUp: (ev: PointerEvent) => void

  constructor(container: HTMLElement, options: SkeletonViewOptions = {}) {
    this._container = container
    this._onJointClick = options.onJointClick
    if (options.hiddenBones) {
      for (const n of options.hiddenBones) this._hiddenBones.add(n)
    }

    const width = Math.max(1, container.clientWidth || 640)
    const height = Math.max(1, container.clientHeight || 480)
    container.style.position = container.style.position || 'relative'

    this._scene = new THREE.Scene()
    this._scene.background = new THREE.Color(0x1a1b1e)

    this._camera = new THREE.PerspectiveCamera(45, width / height, 0.05, 500)
    this._camera.position.set(1.5, 1.2, 2.2)

    this._renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
    this._renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    // updateStyle=true so CSS size matches CSS pixels (not device buffer).
    // With false + dpr>1 the canvas layout box grows and joint picking NDC breaks.
    this._renderer.setSize(width, height, true)
    this._renderer.domElement.style.display = 'block'
    this._renderer.domElement.style.width = '100%'
    this._renderer.domElement.style.height = '100%'
    container.appendChild(this._renderer.domElement)
    this.domElement = this._renderer.domElement

    this._labelRenderer = new CSS2DRenderer()
    this._labelRenderer.setSize(width, height)
    this._labelRenderer.domElement.style.position = 'absolute'
    this._labelRenderer.domElement.style.inset = '0'
    this._labelRenderer.domElement.style.width = '100%'
    this._labelRenderer.domElement.style.height = '100%'
    this._labelRenderer.domElement.style.pointerEvents = 'none'
    this._labelRenderer.domElement.style.overflow = 'hidden'
    container.appendChild(this._labelRenderer.domElement)

    this._controls = new OrbitControls(this._camera, this._renderer.domElement)
    this._controls.enableDamping = true
    this._controls.dampingFactor = 0.08
    this._controls.target.set(0, 0.9, 0)

    this._grid = new THREE.GridHelper(4, 16, 0x444444, 0x2a2a2a)
    this._scene.add(this._grid)
    this._axes = new THREE.AxesHelper(0.35)
    this._scene.add(this._axes)

    this._boneMat = new THREE.LineBasicMaterial({ color: 0x7dd3fc, depthTest: true })
    this._stackBoneMat = new THREE.LineBasicMaterial({ color: 0xe879f9, depthTest: true })
    this._jointMat = new THREE.PointsMaterial({
      color: 0xfbbf24,
      size: 4,
      sizeAttenuation: false,
    })
    this._stackJointMat = new THREE.PointsMaterial({
      color: 0xf0abfc,
      size: 5,
      sizeAttenuation: false,
    })

    this._labelRoot = new THREE.Group()
    this._scene.add(this._labelRoot)

    this._selectMat = new THREE.PointsMaterial({
      color: 0x4ade80,
      size: 7,
      sizeAttenuation: false,
      depthTest: true,
    })
    this._selectGeom = new THREE.BufferGeometry()
    this._selectGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3))
    this._selectPoints = new THREE.Points(this._selectGeom, this._selectMat)
    this._selectPoints.visible = false
    this._selectPoints.renderOrder = 10
    this._selectPoints.frustumCulled = false
    this._scene.add(this._selectPoints)

    this._raycaster.params.Points = { threshold: 0.05 }

    this._onPointerDown = (ev: PointerEvent) => {
      if (ev.button !== 0) return
      this._pointerDown = true
      this._pointerDownX = ev.clientX
      this._pointerDownY = ev.clientY
      try {
        this._renderer.domElement.setPointerCapture(ev.pointerId)
      } catch {
        /* ignore */
      }
    }
    this._onPointerUp = (ev: PointerEvent) => {
      if (!this._pointerDown || ev.button !== 0) return
      this._pointerDown = false
      if (this._renderer.domElement.hasPointerCapture?.(ev.pointerId)) {
        try {
          this._renderer.domElement.releasePointerCapture(ev.pointerId)
        } catch {
          /* ignore */
        }
      }
      const dx = ev.clientX - this._pointerDownX
      const dy = ev.clientY - this._pointerDownY
      if (dx * dx + dy * dy > 16) return
      this._pickAtClient(ev.clientX, ev.clientY)
    }

    this._renderer.domElement.addEventListener('pointerdown', this._onPointerDown)
    this._renderer.domElement.addEventListener('pointerup', this._onPointerUp)
    this._renderer.domElement.addEventListener('pointercancel', this._onPointerUp)
  }

  setSize(w: number, h: number): void {
    const ww = Math.max(1, w | 0)
    const hh = Math.max(1, h | 0)
    this._camera.aspect = ww / hh
    this._camera.updateProjectionMatrix()
    this._renderer.setSize(ww, hh, true)
    this._renderer.domElement.style.width = '100%'
    this._renderer.domElement.style.height = '100%'
    this._labelRenderer.setSize(ww, hh)
    this._labelRenderer.domElement.style.width = '100%'
    this._labelRenderer.domElement.style.height = '100%'
  }

  setRig(next: RigEntry | null): void {
    this._rig = next
  }

  setShowLabels(on: boolean): void {
    this._showLabels = on
  }

  /** Names of rig bones / stack slots to omit from draw, labels, and pick. */
  setHiddenBones(names: Iterable<string> | null | undefined): void {
    const next = new Set<string>()
    if (names) for (const n of names) next.add(n)
    if (sameStringSet(this._hiddenBones, next)) return
    this._hiddenBones = next
    this._hiddenBonesRev++
  }

  getHiddenBones(): ReadonlySet<string> {
    return this._hiddenBones
  }

  updateFromPose(pose: Pose | null): void {
    if (!this._rig || !pose) {
      this._tearDownPose()
      return
    }

    const boneN = Math.min(this._rig.boneNames.length, pose.boneCount)
    const stackN = Math.max(0, Math.min(pose.stackCount, pose.stackCapacity))
    const total = boneN + stackN
    this._lastPose = pose
    this._lastBoneN = boneN

    const rigChanged = this._rig !== this._appliedRig
    const hideChanged = this._hiddenBonesRev !== this._appliedHiddenRev
    const needRebuild =
      rigChanged ||
      hideChanged ||
      !this._boneGeom ||
      !this._jointGeom ||
      this._allocatedTotal < total ||
      this._lastStackCount !== stackN

    if (rigChanged) this._msPositions.length = 0

    // Structure (joints / lines / pick maps)
    if (needRebuild) {
      this._rebuildMeshes(pose, boneN, stackN)
      this._appliedRig = this._rig
      this._appliedHiddenRev = this._hiddenBonesRev
    }

    // Labels (rebuild when mesh revision drifts)
    this._syncLabels(pose, boneN, stackN)

    if (!this._boneGeom || !this._jointGeom) return
    this._ensureCapacity(total)
    this._reconcileSelection(total)
    this._writeMsPositions(pose, boneN, stackN)
    this._writeMeshBuffers(boneN, stackN, total)
    this._writeLabelPositions(pose, boneN)
    this._syncSelectionVisual()
  }

  /** Soft: null if unset, oob, or currently hidden — does not mutate selection. */
  getSelection(): SkeletonBoneSelection | null {
    if (this._selectedUnified < 0 || !this._rig) return null
    if (this._isHiddenUnified(this._selectedUnified)) return null
    return {
      name: this._boneNameAt(this._selectedUnified),
      unifiedIndex: this._selectedUnified,
      procedural: this._selectedUnified >= this._lastBoneN,
    }
  }

  selectBone(unifiedIndex: number): void {
    this._selectedUnified = unifiedIndex
    this._syncSelectionVisual()
  }

  clearSelection(): void {
    this._selectedUnified = -1
    this._syncSelectionVisual()
  }

  render(): void {
    this._controls.update()
    this._renderer.render(this._scene, this._camera)
    this._labelRenderer.render(this._scene, this._camera)
  }

  dispose(): void {
    this._renderer.domElement.removeEventListener('pointerdown', this._onPointerDown)
    this._renderer.domElement.removeEventListener('pointerup', this._onPointerUp)
    this._renderer.domElement.removeEventListener('pointercancel', this._onPointerUp)
    this._clearSkeletonMeshes()
    this._scene.remove(this._labelRoot)
    this._scene.remove(this._selectPoints)
    this._selectGeom.dispose()
    this._selectMat.dispose()
    this._controls.dispose()
    this._boneMat.dispose()
    this._stackBoneMat.dispose()
    this._jointMat.dispose()
    this._stackJointMat.dispose()
    this._grid.geometry.dispose()
    const gm = this._grid.material
    if (Array.isArray(gm)) gm.forEach((m) => m.dispose())
    else gm.dispose()
    this._axes.geometry.dispose()
    const am = this._axes.material
    if (Array.isArray(am)) am.forEach((m) => m.dispose())
    else (am as THREE.Material).dispose()
    this._renderer.dispose()
    if (this._renderer.domElement.parentElement === this._container) {
      this._container.removeChild(this._renderer.domElement)
    }
    if (this._labelRenderer.domElement.parentElement === this._container) {
      this._container.removeChild(this._labelRenderer.domElement)
    }
  }

  private _tearDownPose(): void {
    this._clearSkeletonMeshes()
    this._meshRev++
    this._clearLabels()
    this._labelsMeshRev = -1
    this._msPositions.length = 0
    this._lastPose = null
    this._lastBoneN = 0
    this._appliedRig = null
    this._appliedHiddenRev = -1
    this._syncSelectionVisual()
  }

  /** Drop internal index when oob. Hidden stays soft via {@link getSelection}. */
  private _reconcileSelection(total: number): void {
    if (this._selectedUnified >= total) this._selectedUnified = -1
  }

  private _boneNameAt(unified: number): string {
    if (unified < 0 || !this._rig) return ''
    if (unified < this._lastBoneN) return this._rig.boneNames[unified] ?? `bone_${unified}`
    const s = unified - this._lastBoneN
    return this._lastPose?.stackNames[s] || `stack_${s}`
  }

  private _isHiddenName(name: string): boolean {
    return this._hiddenBones.size > 0 && this._hiddenBones.has(name)
  }

  private _isHiddenUnified(unified: number): boolean {
    if (unified < 0 || this._hiddenBones.size === 0) return false
    return this._isHiddenName(this._boneNameAt(unified))
  }

  private _countVisible(boneN: number, stackN: number, pose: Pose): number {
    if (!this._rig) return 0
    let n = 0
    for (let i = 0; i < boneN; i++) {
      if (!this._isHiddenName(this._rig.boneNames[i] ?? `bone_${i}`)) n++
    }
    for (let s = 0; s < stackN; s++) {
      if (!this._isHiddenName(pose.stackNames[s] || `stack_${s}`)) n++
    }
    return n
  }

  private _syncSelectionVisual(): void {
    if (
      this._selectedUnified < 0 ||
      this._selectedUnified >= this._msPositions.length ||
      this._isHiddenUnified(this._selectedUnified)
    ) {
      this._selectPoints.visible = false
      for (const L of this._labels) {
        L.el.style.outline = ''
        L.el.style.outlineOffset = ''
      }
      return
    }
    const v = this._msPositions[this._selectedUnified]!
    const pos = this._selectGeom.getAttribute('position') as THREE.BufferAttribute
    pos.setXYZ(0, v.x, v.y, v.z)
    pos.needsUpdate = true
    this._selectPoints.visible = true
    for (const L of this._labels) {
      if (L.unified === this._selectedUnified) {
        L.el.style.outline = '1px solid #4ade80'
        L.el.style.outlineOffset = '1px'
      } else {
        L.el.style.outline = ''
        L.el.style.outlineOffset = ''
      }
    }
  }

  private _collectHits(clientX: number, clientY: number): SkeletonBoneSelection[] {
    const rect = this._renderer.domElement.getBoundingClientRect()
    if (!(rect.width > 0) || !(rect.height > 0)) return []
    this._pointerNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1
    this._pointerNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1
    this._raycaster.setFromCamera(this._pointerNdc, this._camera)
    const targets: THREE.Object3D[] = []
    if (this._joints) targets.push(this._joints)
    if (this._stackJoints) targets.push(this._stackJoints)
    if (!targets.length) return []

    const hits = this._raycaster.intersectObjects(targets, false)
    const seen = new Set<number>()
    const out: SkeletonBoneSelection[] = []
    for (const hit of hits) {
      const idx = hit.index
      if (idx == null || idx < 0) continue
      let unified = -1
      if (hit.object === this._joints) unified = this._rigPickMap[idx] ?? -1
      else if (hit.object === this._stackJoints) unified = this._stackPickMap[idx] ?? -1
      if (unified < 0 || seen.has(unified)) continue
      seen.add(unified)
      out.push({
        name: this._boneNameAt(unified),
        unifiedIndex: unified,
        procedural: unified >= this._lastBoneN,
      })
    }
    return out
  }

  private _pickAtClient(clientX: number, clientY: number): void {
    const rect = this._container.getBoundingClientRect()
    this._onJointClick?.({
      candidates: this._collectHits(clientX, clientY),
      x: clientX - rect.left + 6,
      y: clientY - rect.top + 6,
    })
  }

  private _clearLabels(): void {
    for (const L of this._labels) this._labelRoot.remove(L.obj)
    this._labels.length = 0
  }

  private _clearSkeletonMeshes(): void {
    if (this._boneLines) {
      this._scene.remove(this._boneLines)
      this._boneLines.geometry.dispose()
      this._boneLines = null
    }
    if (this._stackBoneLines) {
      this._scene.remove(this._stackBoneLines)
      this._stackBoneLines.geometry.dispose()
      this._stackBoneLines = null
    }
    if (this._joints) {
      this._scene.remove(this._joints)
      this._joints.geometry.dispose()
      this._joints = null
    }
    if (this._stackJoints) {
      this._scene.remove(this._stackJoints)
      this._stackJoints.geometry.dispose()
      this._stackJoints = null
    }
    this._boneGeom = null
    this._stackBoneGeom = null
    this._jointGeom = null
    this._stackJointGeom = null
    this._rigPickMap = []
    this._stackPickMap = []
    this._rigEdgeCount = 0
    this._stackEdgeCount = 0
    this._allocatedTotal = 0
    this._lastStackCount = -1
  }

  private _ensureCapacity(total: number): void {
    while (this._msPositions.length < total) this._msPositions.push(new THREE.Vector3())
  }

  private _makeLabelEl(name: string, procedural: boolean): HTMLDivElement {
    const el = document.createElement('div')
    el.textContent = name
    el.style.cssText = [
      'font: 10px/1.2 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
      'padding: 1px 4px',
      'border-radius: 2px',
      'white-space: nowrap',
      'pointer-events: none',
      'user-select: none',
      procedural
        ? 'color: #f5d0fe; background: rgba(112,26,117,0.75)'
        : 'color: #e2e8f0; background: rgba(15,23,42,0.72)',
    ].join(';')
    return el
  }

  /** Labels entity: tied to {@link _meshRev} + showLabels. */
  private _syncLabels(pose: Pose, boneN: number, stackN: number): void {
    if (!this._showLabels) {
      if (this._labels.length) this._clearLabels()
      this._labelsMeshRev = -1
      return
    }
    const expected = this._countVisible(boneN, stackN, pose)
    if (this._labelsMeshRev !== this._meshRev || this._labels.length !== expected) {
      this._rebuildLabels(pose, boneN, stackN)
      this._labelsMeshRev = this._meshRev
    }
  }

  private _rebuildLabels(pose: Pose, boneN: number, stackN: number): void {
    this._clearLabels()
    if (!this._rig) return
    for (let i = 0; i < boneN; i++) {
      const name = this._rig.boneNames[i] ?? `bone_${i}`
      if (this._isHiddenName(name)) continue
      const el = this._makeLabelEl(name, false)
      const obj = new CSS2DObject(el)
      this._labelRoot.add(obj)
      this._labels.push({ obj, el, name, unified: i })
    }
    for (let s = 0; s < stackN; s++) {
      const name = pose.stackNames[s] || `stack_${s}`
      if (this._isHiddenName(name)) continue
      const el = this._makeLabelEl(name, true)
      const obj = new CSS2DObject(el)
      this._labelRoot.add(obj)
      this._labels.push({ obj, el, name, unified: boneN + s })
    }
  }

  private _writeLabelPositions(pose: Pose, boneN: number): void {
    if (!this._showLabels || !this._labels.length) return
    for (const L of this._labels) {
      const v = this._msPositions[L.unified]!
      L.obj.position.set(v.x, v.y + 0.02, v.z)
      if (L.unified >= boneN) {
        const name = pose.stackNames[L.unified - boneN] || `stack_${L.unified - boneN}`
        if (L.name !== name) {
          L.name = name
          L.el.textContent = name
        }
      }
    }
  }

  private _writeMsPositions(pose: Pose, boneN: number, stackN: number): void {
    if (!this._rig) return
    for (let i = 0; i < boneN; i++) {
      if (!getTransformMs(pose, this._rig, i, this._scratchQs)) {
        this._msPositions[i]!.set(0, 0, 0)
        continue
      }
      redToThree(this._scratchQs.tx, this._scratchQs.ty, this._scratchQs.tz, this._tmp)
      this._msPositions[i]!.copy(this._tmp)
    }
    for (let s = 0; s < stackN; s++) {
      const u = boneN + s
      if (!getTransformMs(pose, this._rig, u, this._scratchQs)) {
        this._msPositions[u]!.set(0, 0, 0)
        continue
      }
      redToThree(this._scratchQs.tx, this._scratchQs.ty, this._scratchQs.tz, this._tmp)
      this._msPositions[u]!.copy(this._tmp)
    }
  }

  private _writeMeshBuffers(boneN: number, stackN: number, total: number): void {
    if (!this._boneGeom || !this._jointGeom) return
    this._writeJointPositions(this._jointGeom, this._rigPickMap)
    this._writeLinePositions(this._boneGeom, boneN)
    if (this._boneGeom.index) this._boneGeom.setDrawRange(0, this._rigEdgeCount * 2)

    if (this._stackBoneGeom && this._stackJoints && this._stackJointGeom && stackN > 0) {
      this._writeLinePositions(this._stackBoneGeom, total)
      if (this._stackBoneGeom.index) {
        this._stackBoneGeom.setDrawRange(0, this._stackEdgeCount * 2)
      }
      this._writeJointPositions(this._stackJointGeom, this._stackPickMap)
    }
  }

  /** Meshes / pick maps only — bumps {@link _meshRev}; labels follow via rev. */
  private _rebuildMeshes(pose: Pose | null, boneN: number, stackN: number): void {
    this._clearSkeletonMeshes()
    this._meshRev++
    if (!this._rig || boneN <= 0) return

    this._ensureCapacity(boneN + stackN)
    this._allocatedTotal = boneN + stackN
    this._lastStackCount = stackN

    const rigVisible: number[] = []
    for (let i = 0; i < boneN; i++) {
      const name = this._rig.boneNames[i] ?? `bone_${i}`
      if (!this._isHiddenName(name)) rigVisible.push(i)
    }
    this._rigPickMap = rigVisible

    const rigEdges: number[] = []
    for (let i = 0; i < boneN; i++) {
      const name = this._rig.boneNames[i] ?? `bone_${i}`
      if (this._isHiddenName(name)) continue
      const p = this._rig.boneParents[i] ?? -1
      if (p < 0 || p >= boneN) continue
      const pName = this._rig.boneNames[p] ?? `bone_${p}`
      if (this._isHiddenName(pName)) continue
      rigEdges.push(p, i)
    }
    this._rigEdgeCount = Math.floor(rigEdges.length / 2)

    this._boneGeom = new THREE.BufferGeometry()
    this._boneGeom.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(Math.max(1, boneN) * 3), 3)
    )
    if (rigEdges.length) this._boneGeom.setIndex(rigEdges)
    this._boneLines = new THREE.LineSegments(this._boneGeom, this._boneMat)
    this._scene.add(this._boneLines)

    this._jointGeom = new THREE.BufferGeometry()
    this._jointGeom.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(Math.max(1, rigVisible.length) * 3), 3)
    )
    this._joints = new THREE.Points(this._jointGeom, this._jointMat)
    this._joints.frustumCulled = false
    this._scene.add(this._joints)

    if (stackN > 0 && pose) {
      const stackVisible: number[] = []
      for (let s = 0; s < stackN; s++) {
        const name = pose.stackNames[s] || `stack_${s}`
        if (!this._isHiddenName(name)) stackVisible.push(boneN + s)
      }
      this._stackPickMap = stackVisible

      const stackParentHidden = (parentU: number): boolean => {
        if (parentU < boneN) {
          return this._isHiddenName(this._rig!.boneNames[parentU] ?? `bone_${parentU}`)
        }
        const ps = parentU - boneN
        return this._isHiddenName(pose.stackNames[ps] || `stack_${ps}`)
      }
      const stackEdges: number[] = []
      for (let s = 0; s < stackN; s++) {
        const childU = boneN + s
        const childName = pose.stackNames[s] || `stack_${s}`
        if (this._isHiddenName(childName)) continue
        const parentU = pose.stackParents[s] ?? -1
        if (parentU < 0 || parentU >= boneN + stackN) continue
        if (stackParentHidden(parentU)) continue
        stackEdges.push(parentU, childU)
      }
      this._stackEdgeCount = Math.floor(stackEdges.length / 2)

      this._stackBoneGeom = new THREE.BufferGeometry()
      this._stackBoneGeom.setAttribute(
        'position',
        new THREE.BufferAttribute(new Float32Array(Math.max(1, boneN + stackN) * 3), 3)
      )
      if (stackEdges.length) this._stackBoneGeom.setIndex(stackEdges)
      this._stackBoneLines = new THREE.LineSegments(this._stackBoneGeom, this._stackBoneMat)
      this._scene.add(this._stackBoneLines)

      this._stackJointGeom = new THREE.BufferGeometry()
      this._stackJointGeom.setAttribute(
        'position',
        new THREE.BufferAttribute(new Float32Array(Math.max(1, stackVisible.length) * 3), 3)
      )
      this._stackJoints = new THREE.Points(this._stackJointGeom, this._stackJointMat)
      this._stackJoints.frustumCulled = false
      this._scene.add(this._stackJoints)
    }
  }

  private _writeJointPositions(geom: THREE.BufferGeometry, pickMap: number[]): void {
    const attr = geom.getAttribute('position') as THREE.BufferAttribute
    const arr = attr.array as Float32Array
    for (let i = 0; i < pickMap.length; i++) {
      const v = this._msPositions[pickMap[i]!]!
      const o = i * 3
      arr[o] = v.x
      arr[o + 1] = v.y
      arr[o + 2] = v.z
    }
    attr.needsUpdate = true
    geom.setDrawRange(0, pickMap.length)
    geom.computeBoundingSphere()
  }

  private _writeLinePositions(geom: THREE.BufferGeometry, count: number): void {
    const attr = geom.getAttribute('position') as THREE.BufferAttribute
    const arr = attr.array as Float32Array
    for (let i = 0; i < count; i++) {
      const v = this._msPositions[i]!
      const o = i * 3
      arr[o] = v.x
      arr[o + 1] = v.y
      arr[o + 2] = v.z
    }
    attr.needsUpdate = true
  }
}

/** @deprecated Prefer `new SkeletonView(container, options)`. */
export function createSkeletonView(
  container: HTMLElement,
  options: SkeletonViewOptions = {}
): SkeletonView {
  return new SkeletonView(container, options)
}
