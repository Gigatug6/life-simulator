import * as THREE from 'three'
import type { Frame } from '../sim/protocol'
import type { Ground } from './relief'
import { writeGlows3d } from './instances3d'
import { GLOW_FRAGMENT, GLOW_VERTEX } from './shaders'

const MAX_GLOWS = 20000 // mirror of creatures::MAX

/** Soft glowing discs over the creatures that emit light (their `signal` output). Stronger at night. */
export class Glow {
  private mesh: THREE.InstancedMesh
  private uniforms = { uStrength: { value: 1 } }

  constructor(private scene: THREE.Scene) {
    this.mesh = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.ShaderMaterial({
        vertexShader: GLOW_VERTEX,
        fragmentShader: GLOW_FRAGMENT,
        uniforms: this.uniforms,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
      MAX_GLOWS,
    )
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_GLOWS * 3), 3)
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage)
    this.mesh.frustumCulled = false
    this.mesh.count = 0
    this.mesh.renderOrder = 3
    scene.add(this.mesh)
  }

  /** `night`: 0 in full daylight .. 1 at night (the glow is much more visible in the dark). */
  setNight(night: number) {
    this.uniforms.uStrength.value = 0.3 + 1.7 * night
  }

  get count() {
    return this.mesh.count
  }

  update(frame: Frame, n: number, ground: Ground, pixelsPerCell: number) {
    this.mesh.count = writeGlows3d(n, frame, ground, pixelsPerCell, this.mesh.instanceMatrix.array as Float32Array, this.mesh.instanceColor!.array as Float32Array)
    this.mesh.instanceMatrix.needsUpdate = true
    this.mesh.instanceColor!.needsUpdate = true
  }

  set visible(v: boolean) {
    this.mesh.visible = v
  }

  dispose() {
    this.scene.remove(this.mesh)
    this.mesh.geometry.dispose()
    ;(this.mesh.material as THREE.Material).dispose()
    this.mesh.dispose()
  }
}
