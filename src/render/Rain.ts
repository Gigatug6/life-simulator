import * as THREE from 'three'
import { RAIN_FRAGMENT, RAIN_VERTEX } from './shaders'

const DROPS = 5000
const BOX = 170 // side of the box of rain around the camera target (scene units)
const HEIGHT = 90

/** Streaks of rain falling around the camera target. Hidden when there is no rain. */
export class Rain {
  private lines: THREE.LineSegments
  private uniforms = {
    uTime: { value: 0 },
    uAmount: { value: 0 },
    uCenter: { value: new THREE.Vector3() },
    uBox: { value: BOX },
    uHeight: { value: HEIGHT },
  }

  constructor(private scene: THREE.Scene) {
    const geo = new THREE.BufferGeometry()
    const rand = new Float32Array(DROPS * 2 * 4)
    const end = new Float32Array(DROPS * 2)
    for (let d = 0; d < DROPS; d++) {
      const r = [Math.random(), Math.random(), Math.random(), Math.random()]
      for (let v = 0; v < 2; v++) {
        rand.set(r, (d * 2 + v) * 4)
        end[d * 2 + v] = v
      }
    }
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(DROPS * 2 * 3), 3)) // unused: the shader places the drops
    geo.setAttribute('aRand', new THREE.BufferAttribute(rand, 4))
    geo.setAttribute('aEnd', new THREE.BufferAttribute(end, 1))
    this.lines = new THREE.LineSegments(
      geo,
      new THREE.ShaderMaterial({
        vertexShader: RAIN_VERTEX,
        fragmentShader: RAIN_FRAGMENT,
        uniforms: this.uniforms,
        transparent: true,
        depthWrite: false,
      }),
    )
    this.lines.frustumCulled = false
    this.lines.visible = false
    this.lines.renderOrder = 5
    scene.add(this.lines)
  }

  /** Rain intensity 0..1 (0 hides the streaks entirely). */
  setAmount(a: number) {
    this.uniforms.uAmount.value = a
    this.lines.visible = a > 0
  }

  get amount() {
    return this.uniforms.uAmount.value
  }

  update(seconds: number, center: THREE.Vector3) {
    this.uniforms.uTime.value = seconds
    this.uniforms.uCenter.value.copy(center)
  }

  dispose() {
    this.scene.remove(this.lines)
    this.lines.geometry.dispose()
    ;(this.lines.material as THREE.Material).dispose()
  }
}
