import * as THREE from 'three'
import type { Ground } from './relief'
import { FIREFLY_FRAGMENT, FIREFLY_VERTEX } from './shaders'
import { fireflyAnchors, type Layout } from './vegetationLayout'

const MAX_FIREFLIES = 700

/** Fireflies drifting between the trees at night (invisible by day). */
export class Fireflies {
  private points: THREE.Points | null = null
  private uniforms = { uTime: { value: 0 }, uNight: { value: 0 }, uSize: { value: 5 } }

  constructor(private scene: THREE.Scene) {}

  setTerrain(layout: Layout, ground: Ground) {
    this.disposePoints()
    const a = fireflyAnchors(layout, MAX_FIREFLIES)
    const n = a.length / 3
    const pos = new Float32Array(n * 3)
    const phase = new Float32Array(n)
    for (let k = 0; k < n; k++) {
      const x = a[k * 3]!
      const y = a[k * 3 + 1]!
      pos[k * 3] = x
      pos[k * 3 + 1] = Math.max(ground.at(x, y), 0) + 1.2 + 2.2 * a[k * 3 + 2]! // hovering at different heights
      pos[k * 3 + 2] = y
      phase[k] = a[k * 3 + 2]!
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1))
    this.points = new THREE.Points(
      geo,
      new THREE.ShaderMaterial({
        vertexShader: FIREFLY_VERTEX,
        fragmentShader: FIREFLY_FRAGMENT,
        uniforms: this.uniforms,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    )
    this.points.frustumCulled = false
    this.points.renderOrder = 4
    this.scene.add(this.points)
  }

  get count() {
    return this.points?.geometry.getAttribute('position').count ?? 0
  }

  /** `night`: 0 by day .. 1 at night. */
  setNight(night: number) {
    this.uniforms.uNight.value = Math.max(0, (night - 0.35) / 0.65) // only when it is really dark
  }

  setTime(seconds: number) {
    this.uniforms.uTime.value = seconds
  }

  set visible(v: boolean) {
    if (this.points) this.points.visible = v
  }

  private disposePoints() {
    if (!this.points) return
    this.scene.remove(this.points)
    this.points.geometry.dispose()
    ;(this.points.material as THREE.Material).dispose()
    this.points = null
  }

  dispose() {
    this.disposePoints()
  }
}
