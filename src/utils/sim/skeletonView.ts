/**
 * Imperative Three.js stick-skeleton viewer for offline Sample poses.
 * Pose buffers are read each frame — do not put Pose into Vue reactive state.
 *
 * Draws rig bones + procedural stack slots; optional CSS2D name labels.
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
}

export type SkeletonView = {
  setSize: (width: number, height: number) => void
  setRig: (rig: RigEntry | null) => void
  setShowLabels: (on: boolean) => void
  updateFromPose: (pose: Pose | null) => void
  getSelection: () => SkeletonBoneSelection | null
  /** Apply highlight from host (by unified index). */
  selectBone: (unifiedIndex: number) => void
  clearSelection: () => void
  render: () => void
  dispose: () => void
  domElement: HTMLCanvasElement
}

type LabelEntry = {
  obj: CSS2DObject
  el: HTMLDivElement
  name: string
}

export function createSkeletonView(
  container: HTMLElement,
  options: SkeletonViewOptions = {}
): SkeletonView {
  const onJointClick = options.onJointClick
  const width = Math.max(1, container.clientWidth || 640)
  const height = Math.max(1, container.clientHeight || 480)

  container.style.position = container.style.position || 'relative'

  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x1a1b1e)

  const camera = new THREE.PerspectiveCamera(45, width / height, 0.05, 500)
  camera.position.set(1.5, 1.2, 2.2)

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  // updateStyle=true so CSS size matches CSS pixels (not device buffer).
  // With false + dpr>1 the canvas layout box grows and joint picking NDC breaks.
  renderer.setSize(width, height, true)
  renderer.domElement.style.display = 'block'
  renderer.domElement.style.width = '100%'
  renderer.domElement.style.height = '100%'
  container.appendChild(renderer.domElement)

  const labelRenderer = new CSS2DRenderer()
  labelRenderer.setSize(width, height)
  labelRenderer.domElement.style.position = 'absolute'
  labelRenderer.domElement.style.inset = '0'
  labelRenderer.domElement.style.width = '100%'
  labelRenderer.domElement.style.height = '100%'
  labelRenderer.domElement.style.pointerEvents = 'none'
  labelRenderer.domElement.style.overflow = 'hidden'
  container.appendChild(labelRenderer.domElement)

  const controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = 0.08
  controls.target.set(0, 0.9, 0)

  const grid = new THREE.GridHelper(4, 16, 0x444444, 0x2a2a2a)
  scene.add(grid)

  const axes = new THREE.AxesHelper(0.35)
  scene.add(axes)

  const boneMat = new THREE.LineBasicMaterial({ color: 0x7dd3fc, depthTest: true })
  const stackBoneMat = new THREE.LineBasicMaterial({ color: 0xe879f9, depthTest: true })
  const jointMat = new THREE.PointsMaterial({
    color: 0xfbbf24,
    size: 4,
    sizeAttenuation: false,
  })
  const stackJointMat = new THREE.PointsMaterial({
    color: 0xf0abfc,
    size: 5,
    sizeAttenuation: false,
  })

  let boneGeom: THREE.BufferGeometry | null = null
  let boneLines: THREE.LineSegments | null = null
  let stackBoneGeom: THREE.BufferGeometry | null = null
  let stackBoneLines: THREE.LineSegments | null = null
  let jointGeom: THREE.BufferGeometry | null = null
  let joints: THREE.Points | null = null
  let stackJointGeom: THREE.BufferGeometry | null = null
  let stackJoints: THREE.Points | null = null

  let rig: RigEntry | null = null
  let showLabels = false
  let allocatedTotal = 0
  let lastStackCount = -1
  let lastBoneN = 0
  let lastPose: Pose | null = null
  let rigEdgeCount = 0
  let stackEdgeCount = 0
  let selectedUnified = -1
  const labels: LabelEntry[] = []
  const labelRoot = new THREE.Group()
  scene.add(labelRoot)

  // Display: screen-space point (same as joints), barely larger — not a world sphere.
  const selectMat = new THREE.PointsMaterial({
    color: 0x4ade80,
    size: 7,
    sizeAttenuation: false,
    depthTest: true,
  })
  const selectGeom = new THREE.BufferGeometry()
  selectGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3))
  const selectPoints = new THREE.Points(selectGeom, selectMat)
  selectPoints.visible = false
  selectPoints.renderOrder = 10
  selectPoints.frustumCulled = false
  scene.add(selectPoints)

  // Pick: raycast against joint Points — threshold is world-space hit radius (not drawn).
  // Keep larger than visual pixel size at typical orbit distance (~2m).
  const raycaster = new THREE.Raycaster()
  raycaster.params.Points = { threshold: 0.05 }
  const pointerNdc = new THREE.Vector2()
  let pointerDownX = 0
  let pointerDownY = 0
  let pointerDown = false

  const scratchQs: Qs = {
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
  const tmp = new THREE.Vector3()
  /** Unified MS positions: [0..boneCount) rig, [boneCount..boneCount+stack) stack */
  const msPositions: THREE.Vector3[] = []

  const boneNameAt = (unified: number): string => {
    if (unified < 0 || !rig) return ''
    if (unified < lastBoneN) return rig.boneNames[unified] ?? `bone_${unified}`
    const s = unified - lastBoneN
    return lastPose?.stackNames[s] || `stack_${s}`
  }

  const syncSelectionVisual = () => {
    if (selectedUnified < 0 || selectedUnified >= msPositions.length) {
      selectPoints.visible = false
      for (const L of labels) {
        L.el.style.outline = ''
        L.el.style.outlineOffset = ''
      }
      return
    }
    const v = msPositions[selectedUnified]!
    const pos = selectGeom.getAttribute('position') as THREE.BufferAttribute
    pos.setXYZ(0, v.x, v.y, v.z)
    pos.needsUpdate = true
    selectPoints.visible = true
    for (let i = 0; i < labels.length; i++) {
      const L = labels[i]!
      if (i === selectedUnified) {
        L.el.style.outline = '1px solid #4ade80'
        L.el.style.outlineOffset = '1px'
      } else {
        L.el.style.outline = ''
        L.el.style.outlineOffset = ''
      }
    }
  }

  const getSelection = (): SkeletonBoneSelection | null => {
    if (selectedUnified < 0 || !rig) return null
    return {
      name: boneNameAt(selectedUnified),
      unifiedIndex: selectedUnified,
      procedural: selectedUnified >= lastBoneN,
    }
  }

  const selectBone = (unified: number) => {
    selectedUnified = unified
    syncSelectionVisual()
  }

  const clearSelection = () => {
    selectedUnified = -1
    syncSelectionVisual()
  }

  const collectHits = (clientX: number, clientY: number): SkeletonBoneSelection[] => {
    const rect = renderer.domElement.getBoundingClientRect()
    if (!(rect.width > 0) || !(rect.height > 0)) return []
    pointerNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1
    pointerNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1
    raycaster.setFromCamera(pointerNdc, camera)
    const targets: THREE.Object3D[] = []
    if (joints) targets.push(joints)
    if (stackJoints) targets.push(stackJoints)
    if (!targets.length) return []

    const hits = raycaster.intersectObjects(targets, false)
    const seen = new Set<number>()
    const out: SkeletonBoneSelection[] = []
    for (const hit of hits) {
      const idx = hit.index
      if (idx == null || idx < 0) continue
      let unified = -1
      if (hit.object === joints) unified = idx
      else if (hit.object === stackJoints) unified = lastBoneN + idx
      if (unified < 0 || seen.has(unified)) continue
      seen.add(unified)
      out.push({
        name: boneNameAt(unified),
        unifiedIndex: unified,
        procedural: unified >= lastBoneN,
      })
    }
    return out
  }

  const pickAtClient = (clientX: number, clientY: number) => {
    const rect = container.getBoundingClientRect()
    const candidates = collectHits(clientX, clientY)
    onJointClick?.({
      candidates,
      x: clientX - rect.left + 6,
      y: clientY - rect.top + 6,
    })
  }

  const onPointerDown = (ev: PointerEvent) => {
    if (ev.button !== 0) return
    pointerDown = true
    pointerDownX = ev.clientX
    pointerDownY = ev.clientY
    // Keep pointerup on canvas even if Select/overlays steal the target.
    try {
      renderer.domElement.setPointerCapture(ev.pointerId)
    } catch {
      /* ignore */
    }
  }

  const onPointerUp = (ev: PointerEvent) => {
    if (!pointerDown || ev.button !== 0) return
    pointerDown = false
    if (renderer.domElement.hasPointerCapture?.(ev.pointerId)) {
      try {
        renderer.domElement.releasePointerCapture(ev.pointerId)
      } catch {
        /* ignore */
      }
    }
    const dx = ev.clientX - pointerDownX
    const dy = ev.clientY - pointerDownY
    if (dx * dx + dy * dy > 16) return // drag → orbit, ignore
    pickAtClient(ev.clientX, ev.clientY)
  }

  renderer.domElement.addEventListener('pointerdown', onPointerDown)
  renderer.domElement.addEventListener('pointerup', onPointerUp)
  renderer.domElement.addEventListener('pointercancel', onPointerUp)

  const clearLabels = () => {
    for (const L of labels) {
      labelRoot.remove(L.obj)
    }
    labels.length = 0
  }

  const clearSkeletonMeshes = () => {
    clearLabels()
    if (boneLines) {
      scene.remove(boneLines)
      boneLines.geometry.dispose()
      boneLines = null
    }
    if (stackBoneLines) {
      scene.remove(stackBoneLines)
      stackBoneLines.geometry.dispose()
      stackBoneLines = null
    }
    if (joints) {
      scene.remove(joints)
      joints.geometry.dispose()
      joints = null
    }
    if (stackJoints) {
      scene.remove(stackJoints)
      stackJoints.geometry.dispose()
      stackJoints = null
    }
    boneGeom = null
    stackBoneGeom = null
    jointGeom = null
    stackJointGeom = null
    rigEdgeCount = 0
    stackEdgeCount = 0
    allocatedTotal = 0
    lastStackCount = -1
  }

  const ensureCapacity = (total: number) => {
    while (msPositions.length < total) msPositions.push(new THREE.Vector3())
  }

  const makeLabelEl = (name: string, procedural: boolean): HTMLDivElement => {
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

  const rebuildLabels = (pose: Pose, boneN: number, stackN: number) => {
    clearLabels()
    if (!showLabels || !rig) return
    for (let i = 0; i < boneN; i++) {
      const name = rig.boneNames[i] ?? `bone_${i}`
      const el = makeLabelEl(name, false)
      const obj = new CSS2DObject(el)
      labelRoot.add(obj)
      labels.push({ obj, el, name })
    }
    for (let s = 0; s < stackN; s++) {
      const name = pose.stackNames[s] || `stack_${s}`
      const el = makeLabelEl(name, true)
      const obj = new CSS2DObject(el)
      labelRoot.add(obj)
      labels.push({ obj, el, name })
    }
  }

  const rebuildMeshes = (pose: Pose | null, boneN: number, stackN: number) => {
    clearSkeletonMeshes()
    if (!rig || boneN <= 0) return

    ensureCapacity(boneN + stackN)
    allocatedTotal = boneN + stackN
    lastStackCount = stackN

    // Rig edges
    const rigEdges: number[] = []
    for (let i = 0; i < boneN; i++) {
      const p = rig.boneParents[i] ?? -1
      if (p >= 0 && p < boneN) rigEdges.push(p, i)
    }
    rigEdgeCount = Math.floor(rigEdges.length / 2)

    const linePos = new Float32Array(Math.max(1, boneN) * 3)
    boneGeom = new THREE.BufferGeometry()
    boneGeom.setAttribute('position', new THREE.BufferAttribute(linePos, 3))
    if (rigEdges.length) boneGeom.setIndex(rigEdges)
    boneLines = new THREE.LineSegments(boneGeom, boneMat)
    scene.add(boneLines)

    const jointPos = new Float32Array(Math.max(1, boneN) * 3)
    jointGeom = new THREE.BufferGeometry()
    jointGeom.setAttribute('position', new THREE.BufferAttribute(jointPos, 3))
    joints = new THREE.Points(jointGeom, jointMat)
    joints.frustumCulled = false
    scene.add(joints)

    // Stack edges (parent may be rig or another stack slot — unified index)
    if (stackN > 0 && pose) {
      const stackEdges: number[] = []
      for (let s = 0; s < stackN; s++) {
        const parentU = pose.stackParents[s] ?? -1
        if (parentU < 0) continue
        // Local index space for stack line buffer: 0..stackN-1
        // Parent may be rig bone (0..boneN) or stack (boneN+j)
        // We store positions in a combined buffer for stack lines separately:
        // use a dedicated position buffer of size (boneN+stackN) for stack lines
        // so parent/child indices can be unified within that buffer.
        stackEdges.push(parentU, boneN + s)
      }
      stackEdgeCount = Math.floor(stackEdges.length / 2)

      const unifiedPos = new Float32Array(Math.max(1, boneN + stackN) * 3)
      stackBoneGeom = new THREE.BufferGeometry()
      stackBoneGeom.setAttribute('position', new THREE.BufferAttribute(unifiedPos, 3))
      if (stackEdges.length) stackBoneGeom.setIndex(stackEdges)
      stackBoneLines = new THREE.LineSegments(stackBoneGeom, stackBoneMat)
      scene.add(stackBoneLines)

      const stackJointPos = new Float32Array(Math.max(1, stackN) * 3)
      stackJointGeom = new THREE.BufferGeometry()
      stackJointGeom.setAttribute('position', new THREE.BufferAttribute(stackJointPos, 3))
      stackJoints = new THREE.Points(stackJointGeom, stackJointMat)
      stackJoints.frustumCulled = false
      scene.add(stackJoints)
    }

    if (pose) rebuildLabels(pose, boneN, stackN)
  }

  const setRig = (next: RigEntry | null) => {
    if (rig === next) return
    rig = next
    clearSkeletonMeshes()
    msPositions.length = 0
    lastPose = null
    lastBoneN = 0
    clearSelection()
  }

  const setShowLabels = (on: boolean) => {
    if (showLabels === on) return
    showLabels = on
    if (!on) {
      clearLabels()
      return
    }
    // Labels rebuilt on next updateFromPose
    lastStackCount = -1
  }

  const updateFromPose = (pose: Pose | null) => {
    if (!rig || !pose) return
    const boneN = Math.min(rig.boneNames.length, pose.boneCount)
    const stackN = Math.max(0, Math.min(pose.stackCount, pose.stackCapacity))
    const total = boneN + stackN
    lastPose = pose
    lastBoneN = boneN

    if (
      !boneGeom ||
      !jointGeom ||
      allocatedTotal < total ||
      lastStackCount !== stackN
    ) {
      rebuildMeshes(pose, boneN, stackN)
    } else if (showLabels && labels.length !== total) {
      rebuildLabels(pose, boneN, stackN)
    } else if (!showLabels && labels.length) {
      clearLabels()
    }

    if (!boneGeom || !jointGeom) return
    ensureCapacity(total)
    if (selectedUnified >= total) selectedUnified = -1

    for (let i = 0; i < boneN; i++) {
      if (!getTransformMs(pose, rig, i, scratchQs)) {
        msPositions[i]!.set(0, 0, 0)
        continue
      }
      redToThree(scratchQs.tx, scratchQs.ty, scratchQs.tz, tmp)
      msPositions[i]!.copy(tmp)
    }
    for (let s = 0; s < stackN; s++) {
      const u = boneN + s
      if (!getTransformMs(pose, rig, u, scratchQs)) {
        msPositions[u]!.set(0, 0, 0)
        continue
      }
      redToThree(scratchQs.tx, scratchQs.ty, scratchQs.tz, tmp)
      msPositions[u]!.copy(tmp)
    }

    const jointAttr = jointGeom.getAttribute('position') as THREE.BufferAttribute
    const jointArr = jointAttr.array as Float32Array
    for (let i = 0; i < boneN; i++) {
      const v = msPositions[i]!
      const o = i * 3
      jointArr[o] = v.x
      jointArr[o + 1] = v.y
      jointArr[o + 2] = v.z
    }
    jointAttr.needsUpdate = true
    jointGeom.setDrawRange(0, boneN)
    // Points.raycast early-outs on a stale boundingSphere (still at origin after rebuild).
    jointGeom.computeBoundingSphere()

    const lineAttr = boneGeom.getAttribute('position') as THREE.BufferAttribute
    const lineArr = lineAttr.array as Float32Array
    for (let i = 0; i < boneN; i++) {
      const v = msPositions[i]!
      const o = i * 3
      lineArr[o] = v.x
      lineArr[o + 1] = v.y
      lineArr[o + 2] = v.z
    }
    lineAttr.needsUpdate = true
    if (boneGeom.index) boneGeom.setDrawRange(0, rigEdgeCount * 2)

    if (stackBoneGeom && stackJoints && stackN > 0) {
      const stackLineAttr = stackBoneGeom.getAttribute('position') as THREE.BufferAttribute
      const stackLineArr = stackLineAttr.array as Float32Array
      for (let i = 0; i < total; i++) {
        const v = msPositions[i]!
        const o = i * 3
        stackLineArr[o] = v.x
        stackLineArr[o + 1] = v.y
        stackLineArr[o + 2] = v.z
      }
      stackLineAttr.needsUpdate = true
      if (stackBoneGeom.index) stackBoneGeom.setDrawRange(0, stackEdgeCount * 2)

      const sjAttr = stackJointGeom!.getAttribute('position') as THREE.BufferAttribute
      const sjArr = sjAttr.array as Float32Array
      for (let s = 0; s < stackN; s++) {
        const v = msPositions[boneN + s]!
        const o = s * 3
        sjArr[o] = v.x
        sjArr[o + 1] = v.y
        sjArr[o + 2] = v.z
      }
      sjAttr.needsUpdate = true
      stackJointGeom!.setDrawRange(0, stackN)
      stackJointGeom!.computeBoundingSphere()
    }

    if (showLabels && labels.length === total) {
      for (let i = 0; i < total; i++) {
        const L = labels[i]!
        const v = msPositions[i]!
        L.obj.position.set(v.x, v.y + 0.02, v.z)
        if (i >= boneN) {
          const name = pose.stackNames[i - boneN] || `stack_${i - boneN}`
          if (L.name !== name) {
            L.name = name
            L.el.textContent = name
          }
        }
      }
    }
    syncSelectionVisual()
  }

  const setSize = (w: number, h: number) => {
    const ww = Math.max(1, w | 0)
    const hh = Math.max(1, h | 0)
    camera.aspect = ww / hh
    camera.updateProjectionMatrix()
    renderer.setSize(ww, hh, true)
    renderer.domElement.style.width = '100%'
    renderer.domElement.style.height = '100%'
    labelRenderer.setSize(ww, hh)
    labelRenderer.domElement.style.width = '100%'
    labelRenderer.domElement.style.height = '100%'
  }

  const render = () => {
    controls.update()
    renderer.render(scene, camera)
    labelRenderer.render(scene, camera)
  }

  const dispose = () => {
    renderer.domElement.removeEventListener('pointerdown', onPointerDown)
    renderer.domElement.removeEventListener('pointerup', onPointerUp)
    clearSkeletonMeshes()
    scene.remove(labelRoot)
    scene.remove(selectPoints)
    selectGeom.dispose()
    selectMat.dispose()
    controls.dispose()
    boneMat.dispose()
    stackBoneMat.dispose()
    jointMat.dispose()
    stackJointMat.dispose()
    grid.geometry.dispose()
    const gm = grid.material
    if (Array.isArray(gm)) gm.forEach((m) => m.dispose())
    else gm.dispose()
    axes.geometry.dispose()
    const am = axes.material
    if (Array.isArray(am)) am.forEach((m) => m.dispose())
    else (am as THREE.Material).dispose()
    renderer.dispose()
    if (renderer.domElement.parentElement === container) {
      container.removeChild(renderer.domElement)
    }
    if (labelRenderer.domElement.parentElement === container) {
      container.removeChild(labelRenderer.domElement)
    }
  }

  return {
    setSize,
    setRig,
    setShowLabels,
    updateFromPose,
    getSelection,
    selectBone,
    clearSelection,
    render,
    dispose,
    domElement: renderer.domElement,
  }
}
