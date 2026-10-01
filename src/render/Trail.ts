import * as THREE from 'three'
import type { Ground } from './relief'

const POINTS = 90
/** Moves further than this between two samples mean a different creature (or a new world): the trail restarts. */
const JUMP = 6

/** A fading trail behind the followed creature (additive: the old end fades to black = invisible). */
export class Trail {
  private line: THREE.Line
  private pos = new Float32Array(POINTS * 3)
  private col = new Float32Array(POINTS * 3)
  private n = 0
  private last: { x: number; y: number } | null = null

  constructor(private scene: THREE.Scene) {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3))
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3))
    geo.setDrawRange(0, 0)
    this.line = new THREE.Line(geo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }))
    this.line.frustumCulled = false
    this.line.renderOrder = 6
    scene.add(this.line)
  }

  get length() {
    return this.n
  }

  /** Records the creature's position (null = nothing selected: the trail disappears). Same position twice = no new point. */
  push(p: { x: number; y: number } | null, ground: Ground | null) {
    if (!p || !ground) {
      this.n = 0
      this.last = null
      this.line.geometry.setDrawRange(0, 0)
      return
    }
    if (this.last && Math.hypot(p.x - this.last.x, p.y - this.last.y) > JUMP) this.n = 0
    if (this.last && p.x === this.last.x && p.y === this.last.y && this.n > 0) return
    this.last = { x: p.x, y: p.y }
    if (this.n === POINTS) {
      this.pos.copyWithin(0, 3)
      this.n--
    }
    const k = this.n++ * 3
    this.pos[k] = p.x
    this.pos[k + 1] = Math.max(ground.at(p.x, p.y), 0) + 0.7
    this.pos[k + 2] = p.y
    for (let i = 0; i < this.n; i++) {
      const f = (i + 1) / this.n // 0 = oldest (dark) .. 1 = newest
      this.col[i * 3] = 1.0 * f * f
      this.col[i * 3 + 1] = 0.85 * f * f
      this.col[i * 3 + 2] = 0.35 * f * f
    }
    this.line.geometry.getAttribute('position').needsUpdate = true
    this.line.geometry.getAttribute('color').needsUpdate = true
    this.line.geometry.setDrawRange(0, this.n)
  }

  set visible(v: boolean) {
    this.line.visible = v
  }

  dispose() {
    this.scene.remove(this.line)
    this.line.geometry.dispose()
    ;(this.line.material as THREE.Material).dispose()
  }
}
