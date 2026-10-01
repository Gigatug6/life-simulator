import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { Ground } from './relief'
import type { SeasonFactors } from './seasons'
import { MAX_ROCKS, MAX_TREES, MAX_TUFTS, STRIDE, crownScale, foliageRgb, tuftRgb, tuftScale, type Layout } from './vegetationLayout'

/** Tufts are small details: they are hidden when the camera is further than this (scene units). */
const TUFT_DISTANCE = 170
/** A season change below this does not trigger a repaint of the foliage. */
const SEASON_EPSILON = 0.04

/** Merges parts into one geometry carrying a vertex colour (so each part keeps its own tint). */
function build(parts: Array<{ geometry: THREE.BufferGeometry; color: [number, number, number] }>): THREE.BufferGeometry {
  const prepared = parts.map(({ geometry, color }) => {
    geometry.deleteAttribute('uv')
    const n = geometry.getAttribute('position').count
    const c = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) c.set(color, i * 3)
    geometry.setAttribute('color', new THREE.BufferAttribute(c, 3))
    return geometry
  })
  const merged = mergeGeometries(prepared, false)!
  prepared.forEach((g) => g.dispose())
  merged.computeVertexNormals()
  return merged
}

const WHITE: [number, number, number] = [1, 1, 1]

/** Base of a tree: a short tapering trunk (height 1, base on the ground). */
const trunkGeometry = () => build([{ geometry: new THREE.CylinderGeometry(0.1, 0.17, 1.2, 5).translate(0, 0.6, 0), color: [0.36, 0.24, 0.14] }])
/** Foliage: two stacked cones. Tinted per instance, so the vertex colour is white. */
const crownGeometry = () =>
  build([
    { geometry: new THREE.ConeGeometry(0.62, 1.5, 6).translate(0, 1.85, 0), color: WHITE },
    { geometry: new THREE.ConeGeometry(0.44, 1.2, 6).translate(0, 2.7, 0), color: [0.92, 0.95, 0.92] },
  ])
/** A tuft of grass: three leaning blades. */
const tuftGeometry = () =>
  build([
    { geometry: new THREE.ConeGeometry(0.07, 0.55, 3).translate(0, 0.27, 0), color: WHITE },
    { geometry: new THREE.ConeGeometry(0.06, 0.45, 3).rotateZ(0.35).translate(0.12, 0.2, 0.04), color: [0.9, 0.95, 0.9] },
    { geometry: new THREE.ConeGeometry(0.06, 0.4, 3).rotateZ(-0.4).translate(-0.12, 0.18, -0.05), color: [0.85, 0.92, 0.85] },
  ])
const rockGeometry = () => build([{ geometry: new THREE.IcosahedronGeometry(0.5, 0).scale(1, 0.7, 0.9).translate(0, 0.2, 0), color: [0.5, 0.5, 0.52] }])

/**
 * Trees, grass tufts and rocks of the 3D view: four InstancedMeshes. The positions come from the pure
 * layout; the foliage follows the season and the tufts follow the grass layer (a grazed cell loses its tuft).
 */
export class Vegetation {
  private trunks: THREE.InstancedMesh
  private crowns: THREE.InstancedMesh
  private tufts: THREE.InstancedMesh
  private rocks: THREE.InstancedMesh
  private layout: Layout | null = null
  private ground: Ground | null = null
  private biome: Uint8Array | null = null
  private grass: Float32Array | null = null
  private season: SeasonFactors = { autumn: 0, winter: 0 }
  private paintedSeason: SeasonFactors = { autumn: -1, winter: -1 }

  constructor(private scene: THREE.Scene) {
    const make = (geometry: THREE.BufferGeometry, max: number, tinted: boolean) => {
      const mesh = new THREE.InstancedMesh(geometry, new THREE.MeshLambertMaterial({ vertexColors: true }), max)
      mesh.count = 0
      mesh.frustumCulled = false
      if (tinted) mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3)
      scene.add(mesh)
      return mesh
    }
    this.trunks = make(trunkGeometry(), MAX_TREES, false)
    this.crowns = make(crownGeometry(), MAX_TREES, true)
    this.tufts = make(tuftGeometry(), MAX_TUFTS, true)
    this.rocks = make(rockGeometry(), MAX_ROCKS, true)
  }

  /** Counts as seen by the tests / the UI. */
  get counts() {
    return { trees: this.trunks.count, tufts: this.tufts.count, rocks: this.rocks.count }
  }

  setTerrain(layout: Layout, ground: Ground, biome: Uint8Array) {
    this.layout = layout
    this.ground = ground
    this.biome = biome
    this.paintedSeason = { autumn: -1, winter: -1 }
    this.trunks.count = this.crowns.count = layout.treeCount
    this.tufts.count = layout.tuftCount
    this.rocks.count = layout.rockCount

    // static parts: trunks and rocks never change
    for (let k = 0; k < layout.treeCount; k++) {
      const [x, y, s, yaw] = this.item(layout.trees, k)
      this.write(this.trunks.instanceMatrix.array as Float32Array, k, x, y, s, s, yaw)
    }
    const rockColor = new THREE.Color()
    for (let k = 0; k < layout.rockCount; k++) {
      const [x, y, s, yaw, v] = this.item(layout.rocks, k)
      this.write(this.rocks.instanceMatrix.array as Float32Array, k, x, y, s, s, yaw)
      const g = 0.6 + 0.5 * v
      rockColor.setRGB(g, g, g * 1.02)
      this.rocks.setColorAt(k, rockColor)
    }
    this.trunks.instanceMatrix.needsUpdate = true
    this.rocks.instanceMatrix.needsUpdate = true
    if (this.rocks.instanceColor) this.rocks.instanceColor.needsUpdate = true
    this.repaintSeason()
    this.updateTufts()
  }

  /** Grass layer changed: tufts grow back where the grass did, and vanish where it was grazed. */
  setGrass(grass: Float32Array) {
    this.grass = grass
    this.updateTufts()
  }

  /** The foliage follows the season (repainted only when it changed noticeably). */
  setSeason(f: SeasonFactors) {
    this.season = f
    if (Math.abs(f.autumn - this.paintedSeason.autumn) > SEASON_EPSILON || Math.abs(f.winter - this.paintedSeason.winter) > SEASON_EPSILON) {
      this.repaintSeason()
    }
  }

  /** Small details disappear when the camera is far away. */
  setDistance(distance: number) {
    this.tufts.visible = distance < TUFT_DISTANCE
  }

  private item(data: Float32Array, k: number): [number, number, number, number, number, number] {
    const o = k * STRIDE
    return [data[o]!, data[o + 1]!, data[o + 2]!, data[o + 3]!, data[o + 4]!, data[o + 5]!]
  }

  /** Writes a Y-rotated, scaled placement matrix standing on the ground at world (x, y). */
  private write(a: Float32Array, k: number, x: number, y: number, sxz: number, sy: number, yaw: number) {
    const c = Math.cos(yaw)
    const s = Math.sin(yaw)
    const m = k * 16
    a[m] = c * sxz
    a[m + 1] = 0
    a[m + 2] = -s * sxz
    a[m + 3] = 0
    a[m + 4] = 0
    a[m + 5] = sy
    a[m + 6] = 0
    a[m + 7] = 0
    a[m + 8] = s * sxz
    a[m + 9] = 0
    a[m + 10] = c * sxz
    a[m + 11] = 0
    a[m + 12] = x
    a[m + 13] = Math.max(this.ground!.at(x, y), 0) - 0.05 // sunk a little so that nothing floats on slopes
    a[m + 14] = y
    a[m + 15] = 1
  }

  private repaintSeason() {
    const l = this.layout
    if (!l) return
    const f = this.season
    const crown = crownScale(f)
    const col = new THREE.Color()
    const crowns = this.crowns.instanceMatrix.array as Float32Array
    for (let k = 0; k < l.treeCount; k++) {
      const [x, y, s, yaw, v] = this.item(l.trees, k)
      this.write(crowns, k, x, y, s * crown, s * (0.92 + 0.08 * crown), yaw)
      col.setRGB(...foliageRgb(f, v))
      this.crowns.setColorAt(k, col)
    }
    this.crowns.instanceMatrix.needsUpdate = true
    if (this.crowns.instanceColor) this.crowns.instanceColor.needsUpdate = true
    for (let k = 0; k < l.tuftCount; k++) {
      col.setRGB(...tuftRgb(f, this.item(l.tufts, k)[4]))
      this.tufts.setColorAt(k, col)
    }
    if (this.tufts.instanceColor) this.tufts.instanceColor.needsUpdate = true
    this.paintedSeason = { ...f }
  }

  private updateTufts() {
    const l = this.layout
    if (!l || !this.biome) return
    const a = this.tufts.instanceMatrix.array as Float32Array
    for (let k = 0; k < l.tuftCount; k++) {
      const [x, y, s, yaw, , cell] = this.item(l.tufts, k)
      const grow = this.grass ? tuftScale(this.grass[cell]!, this.biome[cell]!) : 1
      const size = Math.max(grow * s, 1e-4) // a zero scale would make the matrix singular
      this.write(a, k, x, y, size, size, yaw)
    }
    this.tufts.instanceMatrix.needsUpdate = true
  }

  dispose() {
    for (const m of [this.trunks, this.crowns, this.tufts, this.rocks]) {
      this.scene.remove(m)
      m.geometry.dispose()
      ;(m.material as THREE.Material).dispose()
      m.dispose()
    }
  }
}
