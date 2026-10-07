/**
 * Imperative Three.js stick-skeleton viewer for offline Sample poses.
 * Pose buffers are read each frame — do not put Pose into Vue reactive state.
 */

import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import type { Pose } from './pose'
import { getTransformMs, type Qs } from './poseFk'
import type { RigEntry } from './rigResource'

/** RED Z-up → Three Y-up: (x, y, z) → (x, z, -y) */
function redToThree(x: number, y: number, z: number, out: THREE.Vector3): void {
  out.set(x, z, -y)
}

export type SkeletonView = {
  setSize: (width: number, height: number) => void
  setRig: (rig: RigEntry | null) => void
  updateFromPose: (pose: Pose | null) => void
  render: () => void
  dispose: () => void
  domElement: HTMLCanvasElement
}

export function createSkeletonView(container: HTMLElement): SkeletonView {
  const width = Math.max(1, container.clientWidth || 640)
  const height = Math.max(1, container.clientHeight || 480)

  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x1a1b1e)

  const camera = new THREE.PerspectiveCamera(45, width / height, 0.05, 500)
  camera.position.set(1.5, 1.2, 2.2)

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderer.setSize(width, height, false)
  container.appendChild(renderer.domElement)

  const controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = 0.08
  controls.target.set(0, 0.9, 0)

  const grid = new THREE.GridHelper(4, 16, 0x444444, 0x2a2a2a)
  scene.add(grid)

  const axes = new THREE.AxesHelper(0.35)
  scene.add(axes)

  const boneMat = new THREE.LineBasicMaterial({ color: 0x7dd3fc, depthTest: true })
  const jointMat = new THREE.PointsMaterial({ color: 0xfbbf24, size: 4, sizeAttenuation: false })

  let boneGeom: THREE.BufferGeometry | null = null
  let boneLines: THREE.LineSegments | null = null
  let jointGeom: THREE.BufferGeometry | null = null
  let joints: THREE.Points | null = null

  let rig: RigEntry | null = null
  let edgeCount = 0
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
  const msPositions: THREE.Vector3[] = []

  const clearSkeletonMeshes = () => {
    if (boneLines) {
      scene.remove(boneLines)
      boneLines.geometry.dispose()
      boneLines = null
    }
    if (joints) {
      scene.remove(joints)
      joints.geometry.dispose()
      joints = null
    }
    boneGeom = null
    jointGeom = null
    edgeCount = 0
  }

  const setRig = (next: RigEntry | null) => {
    if (rig === next) return
    rig = next
    clearSkeletonMeshes()
    msPositions.length = 0
    if (!rig) return

    const n = rig.boneNames.length
    for (let i = 0; i < n; i++) msPositions.push(new THREE.Vector3())

    const edges: number[] = []
    for (let i = 0; i < n; i++) {
      const p = rig.boneParents[i] ?? -1
      if (p >= 0 && p < n) {
        edges.push(p, i)
      }
    }
    edgeCount = edges.length / 2

    const linePos = new Float32Array(Math.max(1, n) * 3)
    boneGeom = new THREE.BufferGeometry()
    boneGeom.setAttribute('position', new THREE.BufferAttribute(linePos, 3))
    boneGeom.setIndex(edges)
    boneLines = new THREE.LineSegments(boneGeom, boneMat)
    scene.add(boneLines)

    const jointPos = new Float32Array(Math.max(1, n) * 3)
    jointGeom = new THREE.BufferGeometry()
    jointGeom.setAttribute('position', new THREE.BufferAttribute(jointPos, 3))
    joints = new THREE.Points(jointGeom, jointMat)
    scene.add(joints)
  }

  const updateFromPose = (pose: Pose | null) => {
    if (!rig || !pose || !boneGeom || !jointGeom) return
    const n = Math.min(rig.boneNames.length, pose.boneCount, msPositions.length)
    for (let i = 0; i < n; i++) {
      if (!getTransformMs(pose, rig, i, scratchQs)) {
        msPositions[i]!.set(0, 0, 0)
        continue
      }
      redToThree(scratchQs.tx, scratchQs.ty, scratchQs.tz, tmp)
      msPositions[i]!.copy(tmp)
    }

    const jointAttr = jointGeom.getAttribute('position') as THREE.BufferAttribute
    const jointArr = jointAttr.array as Float32Array
    for (let i = 0; i < n; i++) {
      const v = msPositions[i]!
      const o = i * 3
      jointArr[o] = v.x
      jointArr[o + 1] = v.y
      jointArr[o + 2] = v.z
    }
    jointAttr.needsUpdate = true
    jointGeom.setDrawRange(0, n)

    const lineAttr = boneGeom.getAttribute('position') as THREE.BufferAttribute
    const lineArr = lineAttr.array as Float32Array
    for (let i = 0; i < n; i++) {
      const v = msPositions[i]!
      const o = i * 3
      lineArr[o] = v.x
      lineArr[o + 1] = v.y
      lineArr[o + 2] = v.z
    }
    lineAttr.needsUpdate = true
    if (boneGeom.index) {
      boneGeom.setDrawRange(0, edgeCount * 2)
    }
  }

  const setSize = (w: number, h: number) => {
    const ww = Math.max(1, w | 0)
    const hh = Math.max(1, h | 0)
    camera.aspect = ww / hh
    camera.updateProjectionMatrix()
    renderer.setSize(ww, hh, false)
  }

  const render = () => {
    controls.update()
    renderer.render(scene, camera)
  }

  const dispose = () => {
    clearSkeletonMeshes()
    controls.dispose()
    boneMat.dispose()
    jointMat.dispose()
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
  }

  return {
    setSize,
    setRig,
    updateFromPose,
    render,
    dispose,
    domElement: renderer.domElement,
  }
}
